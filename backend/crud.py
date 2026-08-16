"""
Camada de persistencia (CRUD) e regras de negocio.
"""
import random
import re
import unicodedata
from datetime import datetime
from typing import Optional

from sqlalchemy import select, delete
from sqlalchemy.orm import Session

from . import models, schemas, auth


def _sem_acentos(s: str) -> str:
    """Remove acentos para uso como identificador interno (cor, data-color, etc.).
    Ex: 'Franca' -> 'franca', 'Japao' -> 'japao'."""
    if not s:
        return ""
    return "".join(
        c for c in unicodedata.normalize("NFD", s.lower())
        if unicodedata.category(c) != "Mn"
    )


# Renomeacoes ao iniciar o servidor — corrige nomes antigos sem acento
# vindos de instalacoes anteriores. Preserva inscricoes/partidas vinculadas
# (so muda o nome e a cor, mantem o id do grupo).
MIGRACOES_GRUPOS = {
    "Franca": "França",
    "Japao": "Japão",
}


def migrar_nomes_grupos(db: Session) -> int:
    """Renomeia grupos com nomes antigos para a versao com acento.
    Retorna o numero de grupos migrados."""
    migrados = 0
    for antigo, novo in MIGRACOES_GRUPOS.items():
        g = db.query(models.Grupo).filter(models.Grupo.nome == antigo).first()
        if g and g.nome != novo:
            g.nome = novo
            g.cor = _sem_acentos(novo)
            migrados += 1
    if migrados:
        db.commit()
    return migrados


# =========================================================
# GRUPOS
# =========================================================
def listar_grupos(db: Session) -> list[models.Grupo]:
    return list(db.scalars(select(models.Grupo).order_by(models.Grupo.id)))


def _embaixador_publico(db: Session, grupo_id: int, valor: str) -> str:
    """Aceita somente participante consentido e devolve nome pseudonimizado."""
    if not valor:
        return ""
    participantes = db.scalars(
        select(models.Inscricao).where(
            models.Inscricao.grupo_id == grupo_id,
            models.Inscricao.consentimento_em.is_not(None),
        )
    )
    for participante in participantes:
        publico = nome_publico(participante.nome)
        if valor.strip() in {participante.nome.strip(), publico}:
            return publico
    return ""


def listar_grupos_publicos(db: Session) -> list[dict]:
    """Lista grupos sem permitir que o embaixador revele nome completo."""
    return [
        {
            "id": grupo.id,
            "nome": grupo.nome,
            "cor": grupo.cor,
            "embaixador": _embaixador_publico(db, grupo.id, grupo.embaixador),
        }
        for grupo in listar_grupos(db)
    ]


def obter_grupo(db: Session, grupo_id: int) -> Optional[models.Grupo]:
    return db.get(models.Grupo, grupo_id)


def criar_grupo(db: Session, dados: schemas.GrupoCreate) -> models.Grupo:
    g = models.Grupo(
        nome=dados.nome,
        cor=dados.cor or _sem_acentos(dados.nome),
        embaixador="",
    )
    db.add(g)
    db.commit()
    db.refresh(g)
    return g


def atualizar_grupo(db: Session, grupo_id: int, dados: schemas.GrupoUpdate) -> Optional[models.Grupo]:
    g = db.get(models.Grupo, grupo_id)
    if not g:
        return None
    for campo, valor in dados.model_dump(exclude_unset=True).items():
        if campo == "embaixador":
            valor = _embaixador_publico(db, grupo_id, valor)
        setattr(g, campo, valor)
    db.commit()
    db.refresh(g)
    return g


def excluir_grupo(db: Session, grupo_id: int) -> bool:
    g = db.get(models.Grupo, grupo_id)
    if not g:
        return False
    db.delete(g)
    db.commit()
    return True


def garantir_grupos_padrao(db: Session, nomes: list[str]) -> list[models.Grupo]:
    """Garante que os grupos padrao existem. Compara ignorando acentos —
    'Franca' ja existente e tratado como 'Franca' (preserva o registro)."""
    existentes = listar_grupos(db)
    nomes_norm = [_sem_acentos(n) for n in nomes]

    # Cria os que faltam (comparando sem acento)
    for nome in nomes:
        n_norm = _sem_acentos(nome)
        if not any(_sem_acentos(g.nome) == n_norm for g in existentes):
            db.add(models.Grupo(nome=nome, cor=n_norm))

    # Remove os que nao estao mais na lista padrao (comparando sem acento)
    for g in existentes:
        if _sem_acentos(g.nome) not in nomes_norm:
            db.delete(g)

    db.commit()
    return listar_grupos(db)


def distribuir_aleatorio(db: Session, seed: Optional[int] = None) -> int:
    """Distribui participantes nos grupos com balanceamento + aleatoriedade real.

    Estrategia: round-robin com EMBARALHAMENTO DOS GRUPOS A CADA BLOCO.
    - Garante balanceamento: diferenca maxima de 1 entre o maior e menor grupo
    - Sem vies: nenhum grupo especifico tem prioridade

    Exemplo com 10 inscritos / 8 grupos:
    - Bloco 1 (inscritos 1-8): grupos embaralhados como [Japao, Brasil, ...]
    - Bloco 2 (inscritos 9-10): grupos embaralhados como [Espanha, Portugal, ...]
    -> Quais 2 grupos terao 2 inscritos varia a cada execucao.
    """
    grupos = listar_grupos(db)
    if not grupos:
        return 0
    inscritos = list(db.scalars(select(models.Inscricao)))
    if not inscritos:
        return 0

    rng = random.Random(seed) if seed is not None else random
    rng.shuffle(inscritos)

    n_grupos = len(grupos)
    for inicio in range(0, len(inscritos), n_grupos):
        # Embaralha a ordem dos grupos para ESTE bloco
        ordem_grupos = list(grupos)
        rng.shuffle(ordem_grupos)
        for idx, ins in enumerate(inscritos[inicio:inicio + n_grupos]):
            ins.grupo_id = ordem_grupos[idx].id

    db.commit()
    return len(inscritos)


# =========================================================
# INSCRICOES + USUARIOS (criados juntos)
# =========================================================
def _limpa_whats(numero: str) -> str:
    return re.sub(r"\D", "", numero or "")


def nome_publico(nome: str) -> str:
    """Reduz um nome completo a primeiro nome + inicial final."""
    partes = [parte for parte in (nome or "").strip().split() if parte]
    if not partes:
        return "Participante"
    if len(partes) == 1:
        return partes[0]
    return f"{partes[0]} {partes[-1][0].upper()}."


def listar_participantes_publico(
    db: Session,
    grupo_id: Optional[int] = None,
) -> list[dict]:
    """Versao publica: somente consentidos e com nome pseudonimizado."""
    stmt = (
        select(models.Inscricao)
        .where(models.Inscricao.consentimento_em.is_not(None))
        .order_by(models.Inscricao.nome)
    )
    if grupo_id is not None:
        stmt = stmt.where(models.Inscricao.grupo_id == grupo_id)
    return [
        {
            "id": inscricao.id,
            "nome": nome_publico(inscricao.nome),
            "superpoder": inscricao.superpoder,
            "grupo_id": inscricao.grupo_id,
        }
        for inscricao in db.scalars(stmt)
    ]


def listar_inscricoes(
    db: Session,
    busca: Optional[str] = None,
    grupo_id: Optional[int] = None,
    sem_grupo: bool = False,
) -> list[models.Inscricao]:
    stmt = select(models.Inscricao).order_by(models.Inscricao.criado_em.desc())
    if busca:
        like = f"%{busca}%"
        stmt = stmt.where(
            (models.Inscricao.nome.ilike(like)) | (models.Inscricao.whatsapp.like(like))
        )
    if sem_grupo:
        stmt = stmt.where(models.Inscricao.grupo_id.is_(None))
    elif grupo_id is not None:
        stmt = stmt.where(models.Inscricao.grupo_id == grupo_id)
    return list(db.scalars(stmt))


def obter_inscricao(db: Session, inscricao_id: int) -> Optional[models.Inscricao]:
    return db.get(models.Inscricao, inscricao_id)


def buscar_por_whatsapp(db: Session, numero: str) -> Optional[models.Inscricao]:
    limpo = _limpa_whats(numero)
    if not limpo:
        return None
    return db.scalars(
        select(models.Inscricao).where(models.Inscricao.whatsapp == limpo)
    ).first()


def criar_inscricao_com_usuario(
    db: Session, dados: schemas.InscricaoCreate
) -> tuple[models.Inscricao, models.Usuario]:
    """Cria a inscricao e ja vincula um Usuario role='user'.

    O username e escolhido pelo participante (separado do WhatsApp).
    O WhatsApp e apenas contato — pode se repetir (ex: irmaos sob
    mesmo responsavel). A unicidade fica por conta do username.
    """
    whats = _limpa_whats(dados.whatsapp)
    if len(whats) < 10 or len(whats) > 11:
        raise ValueError("O WhatsApp deve ter 10 ou 11 digitos com DDD.")

    # username ja vem normalizado pelo Pydantic (lowercase, valido)
    username = dados.username
    if db.query(models.Usuario).filter(models.Usuario.username == username).first():
        raise ValueError("Esse nome de usuario ja esta em uso. Escolha outro.")

    ins = models.Inscricao(
        nome=dados.nome.strip(),
        nascimento=dados.nascimento,
        responsavel=dados.responsavel.strip(),
        whatsapp=whats,
        como_soube=dados.como_soube,
        superpoder=dados.superpoder.strip(),
        consentimento_versao=dados.consentimento_versao,
        consentimento_em=datetime.utcnow(),
    )
    db.add(ins)
    db.flush()

    usuario = models.Usuario(
        username=username,
        senha_hash=auth.gerar_hash(dados.senha),
        role="user",
        inscricao_id=ins.id,
    )
    db.add(usuario)
    db.commit()
    db.refresh(ins)
    db.refresh(usuario)
    return ins, usuario


def atualizar_inscricao(
    db: Session, inscricao_id: int, dados: schemas.InscricaoUpdate
) -> Optional[models.Inscricao]:
    ins = db.get(models.Inscricao, inscricao_id)
    if not ins:
        return None
    patch = dados.model_dump(exclude_unset=True)
    if "whatsapp" in patch:
        patch["whatsapp"] = _limpa_whats(patch["whatsapp"])
    for k, v in patch.items():
        setattr(ins, k, v)
    db.commit()
    db.refresh(ins)
    return ins


def excluir_inscricao(db: Session, inscricao_id: int) -> bool:
    ins = db.get(models.Inscricao, inscricao_id)
    if not ins:
        return False
    # Remove o Usuario associado tambem
    usuario = (
        db.query(models.Usuario)
        .filter(models.Usuario.inscricao_id == inscricao_id)
        .first()
    )
    if usuario:
        auth.revogar_tokens_de(db, usuario.id)
        db.delete(usuario)
    db.delete(ins)
    db.commit()
    return True


# =========================================================
# USUARIOS (administradores e usuarios)
# =========================================================
def listar_usuarios(db: Session, role: Optional[str] = None) -> list[models.Usuario]:
    stmt = select(models.Usuario).order_by(models.Usuario.criado_em.desc())
    if role:
        stmt = stmt.where(models.Usuario.role == role)
    return list(db.scalars(stmt))


def criar_admin(
    db: Session, username: str, senha: str
) -> models.Usuario:
    """Cria uma conta de administrador."""
    if not username or not username.strip():
        raise ValueError("Informe um nome de usuario.")
    if not senha or len(senha) < 12:
        raise ValueError("A senha de administrador precisa ter pelo menos 12 caracteres.")
    if db.query(models.Usuario).filter(models.Usuario.username == username).first():
        raise ValueError("Ja existe uma conta com esse nome de usuario.")
    novo = models.Usuario(
        username=username.strip(),
        senha_hash=auth.gerar_hash(senha),
        role="admin",
    )
    db.add(novo)
    db.commit()
    db.refresh(novo)
    return novo


def trocar_senha(
    db: Session, usuario_id: int, nova_senha: str
) -> Optional[models.Usuario]:
    u = db.get(models.Usuario, usuario_id)
    if not u:
        return None
    minimo = 12 if u.role == "admin" else 8
    if not nova_senha or len(nova_senha) < minimo:
        raise ValueError(f"A senha precisa ter pelo menos {minimo} caracteres.")
    u.senha_hash = auth.gerar_hash(nova_senha)
    auth.revogar_tokens_de(db, u.id)
    db.commit()
    db.refresh(u)
    return u


def excluir_usuario(db: Session, usuario_id: int) -> bool:
    u = db.get(models.Usuario, usuario_id)
    if not u:
        return False
    auth.revogar_tokens_de(db, u.id)
    db.delete(u)
    db.commit()
    return True


# =========================================================
# PARTIDAS
# =========================================================
def listar_partidas(
    db: Session,
    fase: Optional[str] = None,
    status: Optional[str] = None,
) -> list[models.Partida]:
    stmt = select(models.Partida).order_by(models.Partida.id)
    if fase:
        stmt = stmt.where(models.Partida.fase == fase)
    if status:
        stmt = stmt.where(models.Partida.status == status)
    return list(db.scalars(stmt))


def obter_partida(db: Session, partida_id: int) -> Optional[models.Partida]:
    return db.get(models.Partida, partida_id)


def registrar_placar(
    db: Session, partida_id: int, placar_a: int, placar_b: int
) -> Optional[models.Partida]:
    p = db.get(models.Partida, partida_id)
    if not p:
        return None
    p.placar_a = int(placar_a)
    p.placar_b = int(placar_b)
    p.status = "concluida"
    db.commit()
    db.refresh(p)
    return p


def atualizar_partida(
    db: Session, partida_id: int, dados: schemas.PartidaUpdate
) -> Optional[models.Partida]:
    p = db.get(models.Partida, partida_id)
    if not p:
        return None
    for k, v in dados.model_dump(exclude_unset=True).items():
        setattr(p, k, v)
    if p.placar_a is not None and p.placar_b is not None and p.status == "pendente":
        p.status = "concluida"
    db.commit()
    db.refresh(p)
    return p


def gerar_partidas_grupos(db: Session) -> int:
    db.execute(delete(models.Partida))
    db.commit()

    grupos = listar_grupos(db)
    total = 0
    for g in grupos:
        jogadores = [i for i in g.inscricoes]
        for i in range(len(jogadores)):
            for j in range(i + 1, len(jogadores)):
                db.add(
                    models.Partida(
                        fase="grupos",
                        grupo_id=g.id,
                        jogador_a_id=jogadores[i].id,
                        jogador_b_id=jogadores[j].id,
                        status="pendente",
                    )
                )
                total += 1
    db.commit()
    return total


# =========================================================
# CLASSIFICACAO
# =========================================================
def classificacao_grupo(
    db: Session,
    grupo_id: int,
    publico: bool = False,
) -> list[schemas.LinhaClassificacao]:
    grupo = db.get(models.Grupo, grupo_id)
    if not grupo:
        return []
    tabela: dict[int, dict] = {}
    for ins in grupo.inscricoes:
        if publico and ins.consentimento_em is None:
            continue
        tabela[ins.id] = dict(
            inscricao_id=ins.id,
            nome=nome_publico(ins.nome) if publico else ins.nome,
            pj=0, v=0, e=0, d=0, gp=0, gc=0, sg=0, pts=0,
        )
    partidas = list(
        db.scalars(
            select(models.Partida).where(
                models.Partida.grupo_id == grupo_id,
                models.Partida.status == "concluida",
            )
        )
    )
    for p in partidas:
        a, b = tabela.get(p.jogador_a_id), tabela.get(p.jogador_b_id)
        if not a or not b:
            continue
        a["pj"] += 1; b["pj"] += 1
        a["gp"] += p.placar_a; a["gc"] += p.placar_b
        b["gp"] += p.placar_b; b["gc"] += p.placar_a
        if p.placar_a > p.placar_b:
            a["v"] += 1; b["d"] += 1; a["pts"] += 3
        elif p.placar_b > p.placar_a:
            b["v"] += 1; a["d"] += 1; b["pts"] += 3
        else:
            a["e"] += 1; b["e"] += 1; a["pts"] += 1; b["pts"] += 1
    for linha in tabela.values():
        linha["sg"] = linha["gp"] - linha["gc"]

    lista = sorted(
        tabela.values(),
        key=lambda x: (-x["pts"], -x["sg"], -x["gp"], x["nome"]),
    )
    return [schemas.LinhaClassificacao(**l) for l in lista]


# =========================================================
# CHAVEAMENTO
# =========================================================
_ORDEM_FASES = ["grupos", "oitavas", "quartas", "semi", "final"]


def _fase_apos(fase: str) -> Optional[str]:
    """Retorna o nome da fase imediatamente seguinte (ou None se for final)."""
    try:
        idx = _ORDEM_FASES.index(fase)
    except ValueError:
        return None
    if idx + 1 >= len(_ORDEM_FASES):
        return None
    return _ORDEM_FASES[idx + 1]


def _classificados_da_fase(db: Session, fase: str) -> list:
    """Retorna os jogadores que ganharam suas partidas na fase indicada.
    Para 'grupos', retorna 1ºs e 2ºs colocados de cada grupo."""
    rng = random.Random()

    if fase == "grupos":
        grupos = listar_grupos(db)
        primeiros, segundos = [], []
        for g in grupos:
            tabela = classificacao_grupo(db, g.id)
            if tabela:
                primeiros.append(tabela[0])
            if len(tabela) > 1:
                segundos.append(tabela[1])
        if not primeiros or not segundos:
            return []
        rng.shuffle(primeiros)
        rng.shuffle(segundos)
        # Pareamento: 1ºA x 2ºB, 1ºB x 2ºC ... (rotacao + ja embaralhado)
        pares = []
        for i in range(len(primeiros)):
            adv = segundos[(i + 1) % len(segundos)]
            pares.append((primeiros[i].inscricao_id, adv.inscricao_id))
        return pares

    # Fases eliminatorias: pega vencedores da fase anterior
    partidas = listar_partidas(db, fase=fase)
    if not partidas:
        return []
    pendentes = [p for p in partidas if p.status != "concluida"]
    if pendentes:
        raise ValueError(f"Ha {len(pendentes)} partida(s) de {fase} pendente(s).")
    vencedores = []
    for p in partidas:
        if p.placar_a > p.placar_b:
            vencedores.append(p.jogador_a_id)
        elif p.placar_b > p.placar_a:
            vencedores.append(p.jogador_b_id)
        else:
            raise ValueError(
                f"Partida {p.id} terminou empatada — defina um vencedor "
                f"(ajuste o placar) antes de gerar a proxima fase."
            )
    rng.shuffle(vencedores)
    pares = []
    for i in range(0, len(vencedores), 2):
        if i + 1 < len(vencedores):
            pares.append((vencedores[i], vencedores[i + 1]))
    return pares


def gerar_chaveamento(db: Session) -> dict:
    """Gera/avanca o chaveamento eliminatorio.

    Detecta automaticamente em que fase esta:
    - Sem fases eliminatorias ainda → gera a primeira (a partir dos grupos)
    - Tem oitavas concluidas → gera quartas
    - Tem quartas concluidas → gera semi
    - Tem semi concluidas → gera final
    """
    # Valida que a fase de grupos esta finalizada (sempre)
    partidas_grupos = listar_partidas(db, fase="grupos")
    if not partidas_grupos:
        raise ValueError("Gere as partidas da fase de grupos antes.")
    pendentes_grupos = [p for p in partidas_grupos if p.status != "concluida"]
    if pendentes_grupos:
        raise ValueError(f"Ha {len(pendentes_grupos)} partida(s) de grupos pendente(s).")

    # Descobre a ultima fase eliminatoria existente
    fase_origem = "grupos"
    for f in ("oitavas", "quartas", "semi", "final"):
        if listar_partidas(db, fase=f):
            fase_origem = f
    proxima_fase = _fase_apos(fase_origem)
    if not proxima_fase:
        raise ValueError("A final ja foi gerada. Nao ha proxima fase.")

    pares = _classificados_da_fase(db, fase_origem)
    if not pares:
        raise ValueError("Nao ha classificados/vencedores suficientes.")

    num_pares = len(pares)
    # Ajusta a fase efetiva a partir do numero de pares (caso menor que 8)
    if fase_origem == "grupos":
        if num_pares <= 1:
            proxima_fase = "final"
        elif num_pares == 2:
            proxima_fase = "semi"
        elif num_pares <= 4:
            proxima_fase = "quartas"
        else:
            proxima_fase = "oitavas"

    # Remove partidas existentes da proxima fase em diante
    fases_a_limpar = _ORDEM_FASES[_ORDEM_FASES.index(proxima_fase):]
    db.execute(delete(models.Partida).where(models.Partida.fase.in_(fases_a_limpar)))
    db.commit()

    for a_id, b_id in pares:
        db.add(
            models.Partida(
                fase=proxima_fase,
                grupo_id=None,
                jogador_a_id=a_id,
                jogador_b_id=b_id,
                status="pendente",
            )
        )
    db.commit()
    return {"fase": proxima_fase, "partidas": num_pares, "origem": fase_origem}


# =========================================================
# CONFIG e FAIR PLAY
# =========================================================
def obter_config(db: Session) -> models.Config:
    cfg = db.get(models.Config, 1)
    if not cfg:
        cfg = models.Config(id=1)
        db.add(cfg)
        db.commit()
        db.refresh(cfg)
    return cfg


def atualizar_config(db: Session, dados: schemas.ConfigBase) -> models.Config:
    cfg = obter_config(db)
    for k, v in dados.model_dump(exclude_unset=True).items():
        setattr(cfg, k, v)
    db.commit()
    db.refresh(cfg)
    return cfg


def obter_fair_play(db: Session) -> models.FairPlay:
    fp = db.get(models.FairPlay, 1)
    if not fp:
        fp = models.FairPlay(id=1)
        db.add(fp)
        db.commit()
        db.refresh(fp)
    return fp


def atualizar_fair_play(db: Session, dados: schemas.FairPlayUpdate) -> models.FairPlay:
    fp = obter_fair_play(db)
    fp.nome = dados.nome.strip()
    fp.motivo = dados.motivo.strip()
    db.commit()
    db.refresh(fp)
    return fp


# =========================================================
# DASHBOARD
# =========================================================
def estatisticas(db: Session) -> dict:
    total_inscritos = len(list(db.scalars(select(models.Inscricao))))
    total_grupos = len(listar_grupos(db))
    sem_grupo = len(listar_inscricoes(db, sem_grupo=True))
    partidas = listar_partidas(db)
    concluidas = sum(1 for p in partidas if p.status == "concluida")
    pendentes = len(partidas) - concluidas
    total_admins = len(listar_usuarios(db, role="admin"))
    total_user_logins = len(listar_usuarios(db, role="user"))
    return dict(
        total_inscritos=total_inscritos,
        total_grupos=total_grupos,
        sem_grupo=sem_grupo,
        partidas_concluidas=concluidas,
        partidas_pendentes=pendentes,
        partidas_total=len(partidas),
        total_admins=total_admins,
        total_user_logins=total_user_logins,
        senha_padrao_em_uso=False,
    )


def resetar_tudo(db: Session) -> None:
    """Remove inscricoes, grupos, partidas, fair play e usuarios role=user.
    Mantem usuarios role=admin e config."""
    usuarios = list(
        db.scalars(select(models.Usuario).where(models.Usuario.role == "user"))
    )
    for usuario in usuarios:
        auth.revogar_tokens_de(db, usuario.id)
    db.execute(delete(models.Partida))
    db.execute(delete(models.Usuario).where(models.Usuario.role == "user"))
    db.execute(delete(models.Inscricao))
    db.execute(delete(models.Grupo))
    fp = db.get(models.FairPlay, 1)
    if fp:
        fp.nome = ""
        fp.motivo = ""
    db.commit()
