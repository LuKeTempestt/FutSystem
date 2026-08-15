"""
API FastAPI da Copa AVOSOS.

Servidor unico (API + front-end estatico):
    uvicorn backend.main:app --host 127.0.0.1 --port 8001

Documentacao automatica:
    http://localhost:8001/docs

Controle de acesso:
    - rotas /api/auth/login    : publicas
    - rotas com Depends(usuario_atual)  : qualquer usuario logado (admin OU user)
    - rotas com Depends(usuario_admin)  : apenas admins
"""
from contextlib import asynccontextmanager
import os
import secrets
from pathlib import Path
from typing import Optional

from fastapi import Depends, FastAPI, HTTPException, Query, status
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import JSONResponse, FileResponse
from fastapi.staticfiles import StaticFiles
from sqlalchemy.orm import Session

from . import crud, schemas, auth, models
from .database import get_db, init_db, SessionLocal
from .request_protection import RequestProtectionMiddleware


FRONTEND_DIR = Path(__file__).resolve().parent.parent
PUBLIC_FILES = {
    "index.html",
    "sobre.html",
    "memorias.html",
    "inscricao.html",
    "login.html",
    "minha-area.html",
    "campeonato.html",
    "album.html",
    "ajuda.html",
    "manifest.json",
    "service-worker.js",
}

GRUPOS_PADRAO = [
    "Brasil", "Argentina", "Portugal", "França",
    "Espanha", "Alemanha", "Inglaterra", "Japão",
]


@asynccontextmanager
async def lifespan(_app: FastAPI):
    init_db()
    db = SessionLocal()
    try:
        senha_inicial = os.getenv("FUTSYSTEM_ADMIN_PASSWORD")
        admin_criado = auth.garantir_admin_padrao(db, senha_inicial)
        if admin_criado:
            print("\nAdministrador inicial preparado com sucesso.")
            print("Usuario: admin\n")
        # Migra nomes antigos sem acento (Franca -> Franca, Japao -> Japao)
        # sem perder vinculos com inscricoes/partidas
        crud.migrar_nomes_grupos(db)
        if not crud.listar_grupos(db):
            crud.garantir_grupos_padrao(db, GRUPOS_PADRAO)
    finally:
        db.close()
    yield


app = FastAPI(
    title="Copa AVOSOS — API",
    description="API REST do Campeonato de Futebol Digital — Copa AVOSOS.",
    version="2.0.0",
    lifespan=lifespan,
)
app.add_middleware(RequestProtectionMiddleware)

_cors_origins = [
    origem.strip()
    for origem in os.getenv("FUTSYSTEM_CORS_ORIGINS", "").split(",")
    if origem.strip()
]
if _cors_origins:
    app.add_middleware(
        CORSMiddleware,
        allow_origins=_cors_origins,
        allow_credentials=False,
        allow_methods=["GET", "POST", "PUT", "DELETE", "OPTIONS"],
        allow_headers=["Authorization", "Content-Type"],
    )


# =========================================================
# META
# =========================================================
@app.get("/api/health", tags=["meta"])
def health():
    return {"status": "ok"}


@app.get("/api/info", tags=["meta"])
def info():
    return {
        "app": "Copa AVOSOS",
        "status": "ok",
        "docs": "/docs",
        "site": "/",
    }


# =========================================================
# AUTH (admin + user)
# =========================================================
@app.post("/api/auth/login", response_model=schemas.LoginOut, tags=["auth"])
def login(
    credenciais: schemas.LoginIn,
    db: Session = Depends(get_db),
):
    username = credenciais.username.strip().lower()
    usuario = auth.autenticar(db, username, credenciais.password)
    if not usuario:
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Usuario ou senha invalidos.",
        )
    token = auth.criar_token(usuario)
    return schemas.LoginOut(
        token=token,
        username=usuario.username,
        role=usuario.role,
        inscricao_id=usuario.inscricao_id,
    )


@app.post("/api/auth/logout", tags=["auth"])
def logout(user: auth.UsuarioAuth = Depends(auth.usuario_atual)):
    auth.revogar_tokens_de(user.id)
    return {"detail": "Logout efetuado."}


@app.get("/api/auth/me", response_model=schemas.MeuPerfilOut, tags=["auth"])
def me(
    db: Session = Depends(get_db),
    user: auth.UsuarioAuth = Depends(auth.usuario_atual),
):
    usuario = db.get(models.Usuario, user.id)
    if not usuario:
        raise HTTPException(401, "Sessao invalida.")
    return schemas.MeuPerfilOut(
        id=usuario.id,
        username=usuario.username,
        role=usuario.role,
        inscricao=schemas.InscricaoOut.model_validate(usuario.inscricao) if usuario.inscricao else None,
    )


@app.put("/api/auth/senha", tags=["auth"])
def trocar_minha_senha(
    dados: schemas.TrocaSenhaIn,
    db: Session = Depends(get_db),
    user: auth.UsuarioAuth = Depends(auth.usuario_atual),
):
    usuario = db.get(models.Usuario, user.id)
    if not usuario or not auth.verificar_senha(dados.senha_atual, usuario.senha_hash):
        raise HTTPException(400, "Senha atual incorreta.")
    crud.trocar_senha(db, usuario.id, dados.senha_nova)
    return {"detail": "Senha alterada com sucesso."}


# Endpoint /api/auth/sortear-meu-grupo REMOVIDO: o sorteio agora e
# exclusividade do administrador, que controla a distribuicao.
# O participante apenas visualiza o grupo que foi sorteado para ele
# (atualizado em tempo real via polling).


# =========================================================
# CONFIG
# =========================================================
@app.get("/api/config", response_model=schemas.ConfigOut, tags=["config"])
def get_config(db: Session = Depends(get_db)):
    cfg = crud.obter_config(db)
    grupos = [g.nome for g in crud.listar_grupos(db)]
    return schemas.ConfigOut(
        nome_evento=cfg.nome_evento,
        homenagem=cfg.homenagem,
        data_evento=cfg.data_evento,
        local=cfg.local,
        whatsapp=cfg.whatsapp,
        email=cfg.email,
        endereco=cfg.endereco,
        inscricoes_abertas=cfg.inscricoes_abertas,
        grupos_disponiveis=grupos,
    )


@app.put("/api/config", response_model=schemas.ConfigOut, tags=["config"])
def put_config(
    dados: schemas.ConfigBase,
    db: Session = Depends(get_db),
    _admin=Depends(auth.usuario_admin),
):
    # Sincroniza grupos se a lista veio no payload (campo separado)
    if dados.grupos_disponiveis is not None:
        nomes_validos = [n.strip() for n in dados.grupos_disponiveis if n and n.strip()]
        if nomes_validos:
            crud.garantir_grupos_padrao(db, nomes_validos)
    # Atualiza demais campos do Config (grupos_disponiveis nao e coluna)
    patch = dados.model_dump(exclude_unset=True, exclude={"grupos_disponiveis"})
    if patch:
        # Reconstroi como ConfigBase para reaproveitar atualizar_config
        crud.atualizar_config(db, schemas.ConfigBase(**patch))
    return get_config(db)


# =========================================================
# GRUPOS
# =========================================================
@app.get("/api/grupos", response_model=list[schemas.GrupoOut], tags=["grupos"])
def listar_grupos(db: Session = Depends(get_db)):
    return crud.listar_grupos_publicos(db)


@app.post("/api/grupos", response_model=schemas.GrupoOut, tags=["grupos"])
def criar_grupo(
    dados: schemas.GrupoCreate,
    db: Session = Depends(get_db),
    _admin=Depends(auth.usuario_admin),
):
    return crud.criar_grupo(db, dados)


@app.put("/api/grupos/{grupo_id}", response_model=schemas.GrupoOut, tags=["grupos"])
def atualizar_grupo(
    grupo_id: int,
    dados: schemas.GrupoUpdate,
    db: Session = Depends(get_db),
    _admin=Depends(auth.usuario_admin),
):
    g = crud.atualizar_grupo(db, grupo_id, dados)
    if not g:
        raise HTTPException(404, "Grupo nao encontrado")
    return g


@app.delete("/api/grupos/{grupo_id}", tags=["grupos"])
def excluir_grupo(
    grupo_id: int,
    db: Session = Depends(get_db),
    _admin=Depends(auth.usuario_admin),
):
    if not crud.excluir_grupo(db, grupo_id):
        raise HTTPException(404, "Grupo nao encontrado")
    return {"detail": "Grupo removido."}


@app.post("/api/grupos/distribuir", tags=["grupos"])
def distribuir(
    seed: Optional[int] = None,
    db: Session = Depends(get_db),
    _admin=Depends(auth.usuario_admin),
):
    total = crud.distribuir_aleatorio(db, seed=seed)
    return {"distribuidos": total}


# =========================================================
# PARTICIPANTES (PUBLICO — sem dados sensiveis, LGPD)
# =========================================================
@app.get(
    "/api/participantes",
    response_model=list[schemas.ParticipanteOut],
    tags=["participantes"],
)
def listar_participantes_publico(
    grupo_id: Optional[int] = Query(None),
    db: Session = Depends(get_db),
):
    """Lista somente consentidos, com primeiro nome + inicial.
    Data de nascimento, contato e responsavel nunca saem nesta rota."""
    return crud.listar_participantes_publico(db, grupo_id=grupo_id)


# =========================================================
# INSCRICOES (ADMIN — dados completos, requer autenticacao admin)
# =========================================================
@app.get(
    "/api/inscricoes",
    response_model=list[schemas.InscricaoOut],
    tags=["inscricoes"],
)
def listar_inscricoes(
    busca: Optional[str] = Query(None),
    grupo_id: Optional[int] = Query(None),
    sem_grupo: bool = Query(False),
    db: Session = Depends(get_db),
    _admin=Depends(auth.usuario_admin),
):
    """Lista COMPLETA com dados sensiveis — APENAS admins."""
    return crud.listar_inscricoes(db, busca=busca, grupo_id=grupo_id, sem_grupo=sem_grupo)


@app.get(
    "/api/inscricoes/buscar",
    response_model=Optional[schemas.InscricaoOut],
    tags=["inscricoes"],
)
def buscar_por_whatsapp(
    whatsapp: str,
    db: Session = Depends(get_db),
    _admin=Depends(auth.usuario_admin),
):
    """Busca por WhatsApp — APENAS admins (evita enumeracao de cadastros)."""
    return crud.buscar_por_whatsapp(db, whatsapp)


@app.post(
    "/api/inscricoes",
    response_model=schemas.LoginOut,
    status_code=status.HTTP_201_CREATED,
    tags=["inscricoes"],
)
def criar_inscricao(
    dados: schemas.InscricaoCreate,
    db: Session = Depends(get_db),
):
    """Cria uma inscricao + uma conta de usuario (role='user').
    Retorna o token de login ja autenticado."""
    cfg = crud.obter_config(db)
    if not cfg.inscricoes_abertas:
        raise HTTPException(403, "Inscricoes encerradas.")
    codigo_configurado = os.getenv("FUTSYSTEM_REGISTRATION_CODE", "").strip()
    if len(codigo_configurado) < 8:
        raise HTTPException(503, "Inscricoes indisponiveis: codigo do evento nao configurado.")
    if not secrets.compare_digest(dados.codigo_convite.strip(), codigo_configurado):
        raise HTTPException(403, "Codigo de convite invalido.")
    try:
        _, usuario = crud.criar_inscricao_com_usuario(db, dados)
    except ValueError:
        raise HTTPException(
            409,
            "Nao foi possivel concluir o cadastro. Revise os dados ou escolha outro usuario.",
        )
    token = auth.criar_token(usuario)
    return schemas.LoginOut(
        token=token,
        username=usuario.username,
        role=usuario.role,
        inscricao_id=usuario.inscricao_id,
    )


@app.put("/api/inscricoes/{inscricao_id}", response_model=schemas.InscricaoOut, tags=["inscricoes"])
def atualizar_inscricao(
    inscricao_id: int,
    dados: schemas.InscricaoUpdate,
    db: Session = Depends(get_db),
    user: auth.UsuarioAuth = Depends(auth.usuario_atual),
):
    # Usuario comum so pode editar a propria inscricao
    if user.role != "admin" and user.inscricao_id != inscricao_id:
        raise HTTPException(403, "Voce so pode editar sua propria inscricao.")
    # Usuario comum nao pode mudar o grupo
    if user.role != "admin" and "grupo_id" in dados.model_fields_set:
        raise HTTPException(403, "Apenas administradores podem alterar grupos.")
    ins = crud.atualizar_inscricao(db, inscricao_id, dados)
    if not ins:
        raise HTTPException(404, "Inscricao nao encontrada")
    return ins


@app.delete("/api/inscricoes/{inscricao_id}", tags=["inscricoes"])
def excluir_inscricao(
    inscricao_id: int,
    db: Session = Depends(get_db),
    _admin=Depends(auth.usuario_admin),
):
    if not crud.excluir_inscricao(db, inscricao_id):
        raise HTTPException(404, "Inscricao nao encontrada")
    return {"detail": "Inscricao removida."}


# =========================================================
# USUARIOS (gestao de admins, apenas admin)
# =========================================================
@app.get("/api/usuarios", response_model=list[schemas.UsuarioOut], tags=["usuarios"])
def listar_usuarios(
    role: Optional[str] = Query(None, pattern="^(admin|user)$"),
    db: Session = Depends(get_db),
    _admin=Depends(auth.usuario_admin),
):
    return crud.listar_usuarios(db, role=role)


@app.post(
    "/api/usuarios/admin",
    response_model=schemas.UsuarioOut,
    status_code=status.HTTP_201_CREATED,
    tags=["usuarios"],
)
def criar_novo_admin(
    dados: schemas.AdminCreate,
    db: Session = Depends(get_db),
    _admin=Depends(auth.usuario_admin),
):
    try:
        return crud.criar_admin(db, dados.username, dados.senha)
    except ValueError as exc:
        raise HTTPException(409, str(exc))


@app.delete("/api/usuarios/{usuario_id}", tags=["usuarios"])
def excluir_usuario(
    usuario_id: int,
    db: Session = Depends(get_db),
    admin: auth.UsuarioAuth = Depends(auth.usuario_admin),
):
    if usuario_id == admin.id:
        raise HTTPException(400, "Voce nao pode excluir sua propria conta.")
    if not crud.excluir_usuario(db, usuario_id):
        raise HTTPException(404, "Usuario nao encontrado")
    return {"detail": "Usuario removido."}


# =========================================================
# PARTIDAS
# =========================================================
@app.get("/api/partidas", response_model=list[schemas.PartidaOut], tags=["partidas"])
def listar_partidas(
    fase: Optional[str] = None,
    status_filter: Optional[str] = Query(None, alias="status"),
    db: Session = Depends(get_db),
):
    return crud.listar_partidas(db, fase=fase, status=status_filter)


@app.post("/api/partidas/gerar-grupos", tags=["partidas"])
def gerar_grupos(
    db: Session = Depends(get_db),
    _admin=Depends(auth.usuario_admin),
):
    total = crud.gerar_partidas_grupos(db)
    return {"geradas": total}


@app.post("/api/partidas/gerar-chaveamento", tags=["partidas"])
def gerar_chaveamento(
    db: Session = Depends(get_db),
    _admin=Depends(auth.usuario_admin),
):
    try:
        return crud.gerar_chaveamento(db)
    except ValueError as exc:
        raise HTTPException(400, str(exc))


@app.post("/api/partidas/{partida_id}/placar", response_model=schemas.PartidaOut, tags=["partidas"])
def registrar_placar(
    partida_id: int,
    placar: schemas.PartidaResultado,
    db: Session = Depends(get_db),
    _admin=Depends(auth.usuario_admin),
):
    p = crud.registrar_placar(db, partida_id, placar.placar_a, placar.placar_b)
    if not p:
        raise HTTPException(404, "Partida nao encontrada")
    return p


@app.put("/api/partidas/{partida_id}", response_model=schemas.PartidaOut, tags=["partidas"])
def atualizar_partida(
    partida_id: int,
    dados: schemas.PartidaUpdate,
    db: Session = Depends(get_db),
    _admin=Depends(auth.usuario_admin),
):
    p = crud.atualizar_partida(db, partida_id, dados)
    if not p:
        raise HTTPException(404, "Partida nao encontrada")
    return p


# =========================================================
# CLASSIFICACAO
# =========================================================
@app.get(
    "/api/classificacao/{grupo_id}",
    response_model=list[schemas.LinhaClassificacao],
    tags=["classificacao"],
)
def get_classificacao(
    grupo_id: int,
    db: Session = Depends(get_db),
    user: Optional[auth.UsuarioAuth] = Depends(auth.usuario_opcional),
):
    return crud.classificacao_grupo(
        db,
        grupo_id,
        publico=not (user and user.role == "admin"),
    )


# =========================================================
# FAIR PLAY
# =========================================================
@app.get("/api/fair-play", response_model=schemas.FairPlayOut, tags=["fair-play"])
def get_fair_play(
    db: Session = Depends(get_db),
    user: Optional[auth.UsuarioAuth] = Depends(auth.usuario_opcional),
):
    fair_play = crud.obter_fair_play(db)
    if user and user.role == "admin":
        return fair_play
    return {
        "nome": crud.nome_publico(fair_play.nome) if fair_play.nome else "",
        "motivo": (
            "Reconhecimento por atitude de fair play durante o campeonato."
            if fair_play.motivo else ""
        ),
    }


@app.put("/api/fair-play", response_model=schemas.FairPlayOut, tags=["fair-play"])
def put_fair_play(
    dados: schemas.FairPlayUpdate,
    db: Session = Depends(get_db),
    _admin=Depends(auth.usuario_admin),
):
    return crud.atualizar_fair_play(db, dados)


# =========================================================
# DASHBOARD / RESET
# =========================================================
@app.get("/api/stats", tags=["admin"])
def stats(
    db: Session = Depends(get_db),
    _admin=Depends(auth.usuario_admin),
):
    return crud.estatisticas(db)


@app.delete("/api/reset", tags=["admin"])
def reset(
    db: Session = Depends(get_db),
    _admin=Depends(auth.usuario_admin),
):
    crud.resetar_tudo(db)
    crud.garantir_grupos_padrao(db, GRUPOS_PADRAO)
    return {"detail": "Dados resetados."}


# =========================================================
# Handler global de erro
# =========================================================
@app.exception_handler(ValueError)
async def value_error_handler(_request, exc: ValueError):
    return JSONResponse(status_code=400, content={"detail": str(exc)})


# =========================================================
# ARQUIVOS ESTATICOS — somente ativos publicos explicitamente permitidos
# =========================================================
@app.get("/", include_in_schema=False)
def index():
    return FileResponse(FRONTEND_DIR / "index.html")


@app.get("/admin", include_in_schema=False)
@app.get("/admin/", include_in_schema=False)
def admin_index():
    return FileResponse(FRONTEND_DIR / "admin" / "index.html")


@app.get("/{filename}", include_in_schema=False)
def public_file(filename: str):
    if filename not in PUBLIC_FILES:
        raise HTTPException(status_code=404, detail="Arquivo nao encontrado.")
    return FileResponse(FRONTEND_DIR / filename)


app.mount("/css", StaticFiles(directory=str(FRONTEND_DIR / "css")), name="css")
app.mount("/js", StaticFiles(directory=str(FRONTEND_DIR / "js")), name="js")
app.mount(
    "/admin",
    StaticFiles(directory=str(FRONTEND_DIR / "admin"), html=True),
    name="admin-static",
)
