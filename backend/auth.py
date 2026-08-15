"""
Autenticacao + controle de acesso + seguranca.

Niveis (roles):
  - admin : acesso total (gestao do evento)
  - user  : acesso a propria conta (sua inscricao, seu grupo)

Recursos de seguranca:
  - Hash de senha com BCRYPT (custo 12) e salt individual.
  - Formatos legados nao sao aceitos no login; exigem rotacao ou redefinicao.
  - Tokens Bearer com TTL (expira em 8 horas).
  - Rate limit no login (5 tentativas a cada 60 segundos por IP).

Dependencias do FastAPI expostas:
  - usuario_atual()    -> usuario logado (admin OU user). HTTP 401 se nao logado.
  - usuario_admin()    -> exige role='admin'. HTTP 403 se for user.
  - usuario_opcional() -> retorna o usuario se logado, ou None se publico.
"""
import secrets
import time
from collections import deque
from dataclasses import dataclass
from threading import RLock
from typing import Optional

import bcrypt
from fastapi import Depends, Header, HTTPException, Request, status
from sqlalchemy.orm import Session

from . import models


# =========================================================
# CONSTANTES
# =========================================================

# TTL do token: 8 horas (suficiente para uma jornada de evento)
TOKEN_TTL_SECONDS = 8 * 60 * 60
MAX_TOKENS_POR_USUARIO = 5

# Rate limit no /auth/login: max 5 tentativas em 60s por IP
RATE_LIMIT_TENTATIVAS = 5
RATE_LIMIT_JANELA_SEGUNDOS = 60
REGISTRO_RATE_LIMIT_TENTATIVAS = 10
REGISTRO_RATE_LIMIT_JANELA_SEGUNDOS = 10 * 60

# =========================================================
# ESTRUTURAS EM MEMORIA
# =========================================================

@dataclass
class UsuarioAuth:
    """Snapshot do usuario autenticado, anexado ao token."""
    id: int
    username: str
    role: str
    inscricao_id: Optional[int]
    expira_em: float  # timestamp UNIX


# {token: UsuarioAuth}
TOKENS_ATIVOS: dict[str, UsuarioAuth] = {}

# {ip: deque([timestamps...])} para rate limit do login
_RATE_LIMIT_LOGIN: dict[str, deque] = {}
_RATE_LIMIT_REGISTRO: dict[str, deque] = {}
_STATE_LOCK = RLock()


# =========================================================
# HASHING DE SENHA (bcrypt + deteccao de formato legado)
# =========================================================

def gerar_hash(senha: str) -> str:
    """Gera hash bcrypt da senha (custo 12). Cada chamada produz salt unico."""
    if not isinstance(senha, str) or not senha:
        raise ValueError("Senha vazia.")
    return bcrypt.hashpw(senha.encode("utf-8"), bcrypt.gensalt(rounds=12)).decode("utf-8")


def _eh_hash_bcrypt(hash_armazenado: str) -> bool:
    return isinstance(hash_armazenado, str) and hash_armazenado.startswith(("$2a$", "$2b$", "$2y$"))


def verificar_senha(senha: str, hash_armazenado: str) -> bool:
    """Verifica apenas hashes bcrypt; formatos legados exigem redefinicao."""
    if not hash_armazenado or not _eh_hash_bcrypt(hash_armazenado):
        return False
    try:
        return bcrypt.checkpw(senha.encode("utf-8"), hash_armazenado.encode("utf-8"))
    except (ValueError, TypeError):
        return False


def hash_precisa_migrar(hash_armazenado: str) -> bool:
    """True se o hash esta no formato antigo e deve ser regerado."""
    return bool(hash_armazenado) and not _eh_hash_bcrypt(hash_armazenado)


# =========================================================
# TOKENS
# =========================================================

def criar_token(usuario: models.Usuario) -> str:
    """Cria um token novo (256 bits) com TTL e armazena em memoria."""
    with _STATE_LOCK:
        _limpar_tokens_expirados()
        tokens_do_usuario = [
            (token, dados.expira_em)
            for token, dados in TOKENS_ATIVOS.items()
            if dados.id == usuario.id
        ]
        excedentes = max(0, len(tokens_do_usuario) - MAX_TOKENS_POR_USUARIO + 1)
        for token, _ in sorted(tokens_do_usuario, key=lambda item: item[1])[:excedentes]:
            TOKENS_ATIVOS.pop(token, None)
        token = secrets.token_urlsafe(32)
        TOKENS_ATIVOS[token] = UsuarioAuth(
            id=usuario.id,
            username=usuario.username,
            role=usuario.role,
            inscricao_id=usuario.inscricao_id,
            expira_em=time.time() + TOKEN_TTL_SECONDS,
        )
        return token


def revogar_token(token: str) -> None:
    with _STATE_LOCK:
        TOKENS_ATIVOS.pop(token, None)


def revogar_tokens_de(usuario_id: int) -> None:
    """Revoga todos os tokens ativos de um usuario (uso: troca de senha, exclusao)."""
    with _STATE_LOCK:
        para_remover = [t for t, u in TOKENS_ATIVOS.items() if u.id == usuario_id]
        for t in para_remover:
            TOKENS_ATIVOS.pop(t, None)


def _limpar_tokens_expirados() -> None:
    """Remove tokens vencidos da memoria. Chamado pontualmente."""
    with _STATE_LOCK:
        agora = time.time()
        expirados = [t for t, u in TOKENS_ATIVOS.items() if u.expira_em < agora]
        for t in expirados:
            TOKENS_ATIVOS.pop(t, None)


# =========================================================
# RATE LIMIT (login)
# =========================================================

def checar_rate_limit_login(ip: str) -> None:
    """Lanca HTTPException 429 se ultrapassou o limite de tentativas."""
    with _STATE_LOCK:
        agora = time.time()
        fila = _RATE_LIMIT_LOGIN.setdefault(ip, deque(maxlen=RATE_LIMIT_TENTATIVAS * 2))
        while fila and (agora - fila[0]) > RATE_LIMIT_JANELA_SEGUNDOS:
            fila.popleft()
        if len(fila) >= RATE_LIMIT_TENTATIVAS:
            proxima = RATE_LIMIT_JANELA_SEGUNDOS - int(agora - fila[0])
            raise HTTPException(
                status_code=status.HTTP_429_TOO_MANY_REQUESTS,
                detail=f"Muitas tentativas de login. Tente novamente em {max(1, proxima)}s.",
            )


def registrar_tentativa_login(ip: str) -> None:
    """Registra uma tentativa (sucesso ou falha) para fins de rate limit."""
    with _STATE_LOCK:
        fila = _RATE_LIMIT_LOGIN.setdefault(ip, deque(maxlen=RATE_LIMIT_TENTATIVAS * 2))
        fila.append(time.time())


def checar_rate_limit_registro(ip: str) -> None:
    """Limita cadastros caros por cliente antes de executar bcrypt."""
    with _STATE_LOCK:
        agora = time.time()
        fila = _RATE_LIMIT_REGISTRO.setdefault(
            ip, deque(maxlen=REGISTRO_RATE_LIMIT_TENTATIVAS * 2)
        )
        while fila and (agora - fila[0]) > REGISTRO_RATE_LIMIT_JANELA_SEGUNDOS:
            fila.popleft()
        if len(fila) >= REGISTRO_RATE_LIMIT_TENTATIVAS:
            proxima = REGISTRO_RATE_LIMIT_JANELA_SEGUNDOS - int(agora - fila[0])
            raise HTTPException(
                status_code=status.HTTP_429_TOO_MANY_REQUESTS,
                detail=f"Muitos cadastros. Tente novamente em {max(1, proxima)}s.",
            )


def registrar_tentativa_registro(ip: str) -> None:
    with _STATE_LOCK:
        fila = _RATE_LIMIT_REGISTRO.setdefault(
            ip, deque(maxlen=REGISTRO_RATE_LIMIT_TENTATIVAS * 2)
        )
        fila.append(time.time())


# =========================================================
# AUTENTICACAO
# =========================================================

def autenticar(db: Session, username: str, senha: str) -> Optional[models.Usuario]:
    """Busca um usuario ativo e verifica sua senha bcrypt."""
    usuario = (
        db.query(models.Usuario)
        .filter(models.Usuario.username == username, models.Usuario.ativo.is_(True))
        .first()
    )
    if not usuario or not verificar_senha(senha, usuario.senha_hash):
        return None

    return usuario


def garantir_admin_padrao(db: Session, senha_inicial: Optional[str]) -> bool:
    """Cria o primeiro admin apenas com segredo exclusivo da instalacao."""
    existe = (
        db.query(models.Usuario)
        .filter(models.Usuario.username == "admin")
        .first()
    )
    if existe and not hash_precisa_migrar(existe.senha_hash):
        return False
    if not senha_inicial or not 12 <= len(senha_inicial) <= 128:
        raise RuntimeError(
            "Defina FUTSYSTEM_ADMIN_PASSWORD com 12 a 128 caracteres "
            "para criar o primeiro administrador."
        )
    if existe:
        existe.senha_hash = gerar_hash(senha_inicial)
        existe.role = "admin"
        existe.ativo = True
        db.commit()
        revogar_tokens_de(existe.id)
        return True
    admin = models.Usuario(
        username="admin",
        senha_hash=gerar_hash(senha_inicial),
        role="admin",
    )
    db.add(admin)
    db.commit()
    return True


# =========================================================
# DEPENDENCIAS DO FASTAPI
# =========================================================

def _extrair_token(authorization: Optional[str]) -> Optional[str]:
    if not authorization or not authorization.lower().startswith("bearer "):
        return None
    return authorization.split(" ", 1)[1].strip()


def usuario_atual(authorization: Optional[str] = Header(default=None)) -> UsuarioAuth:
    """Exige login (admin OU user). Valida TTL do token."""
    _limpar_tokens_expirados()
    token = _extrair_token(authorization)
    with _STATE_LOCK:
        user = TOKENS_ATIVOS.get(token) if token else None
    if not user:
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Autenticacao obrigatoria.",
            headers={"WWW-Authenticate": "Bearer"},
        )
    if user.expira_em < time.time():
        revogar_token(token)
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Sessao expirada. Faca login novamente.",
            headers={"WWW-Authenticate": "Bearer"},
        )
    return user


def usuario_admin(user: UsuarioAuth = Depends(usuario_atual)) -> UsuarioAuth:
    """Exige role='admin'. HTTP 403 se for usuario comum."""
    if user.role != "admin":
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="Acesso restrito a administradores.",
        )
    return user


def usuario_opcional(
    authorization: Optional[str] = Header(default=None),
) -> Optional[UsuarioAuth]:
    """Retorna o usuario se houver token valido (e nao expirado), ou None."""
    _limpar_tokens_expirados()
    token = _extrair_token(authorization)
    if not token:
        return None
    with _STATE_LOCK:
        user = TOKENS_ATIVOS.get(token)
    if user and user.expira_em < time.time():
        revogar_token(token)
        return None
    return user


def ip_do_request(request: Request) -> str:
    """Usa o peer real; cabecalhos de proxy nao sao confiaveis diretamente."""
    return request.client.host if request.client else "desconhecido"
