"""Configuracao do SQLAlchemy para desenvolvimento local e producao.

Sem ``DATABASE_URL``, usa SQLite local. Em producao, a URL agrupada do Neon
e fornecida por variavel de ambiente e acessada com o driver psycopg 3.
"""
import os
from pathlib import Path

from sqlalchemy import create_engine, inspect, text
from sqlalchemy.orm import declarative_base, sessionmaker, Session
from sqlalchemy.pool import NullPool

BASE_DIR = Path(__file__).resolve().parent
DB_PATH = BASE_DIR / "futsystem.db"


def _normalizar_database_url(url: str) -> str:
    """Seleciona explicitamente o driver psycopg 3 para URLs PostgreSQL."""
    if url.startswith("postgres://"):
        return "postgresql+psycopg://" + url.removeprefix("postgres://")
    if url.startswith("postgresql://"):
        return "postgresql+psycopg://" + url.removeprefix("postgresql://")
    return url


DATABASE_URL = _normalizar_database_url(
    os.getenv("DATABASE_URL", f"sqlite:///{DB_PATH}")
)
USANDO_SQLITE = DATABASE_URL.startswith("sqlite:")

engine_options = {
    "echo": False,
    "pool_pre_ping": True,
}
if USANDO_SQLITE:
    engine_options["connect_args"] = {"check_same_thread": False}
else:
    # O endpoint agrupado do Neon ja usa PgBouncer. Evita manter outro pool
    # dentro de instancias serverless efemeras da Vercel.
    engine_options["poolclass"] = NullPool

engine = create_engine(
    DATABASE_URL,
    **engine_options,
)

SessionLocal = sessionmaker(autocommit=False, autoflush=False, bind=engine)
Base = declarative_base()


def get_db():
    """Dependencia do FastAPI: abre uma sessao por requisicao e fecha ao fim."""
    db: Session = SessionLocal()
    try:
        yield db
    finally:
        db.close()


def init_db() -> None:
    """Cria todas as tabelas (executar uma vez no startup)."""
    from . import models  # noqa: F401 — registra os modelos
    Base.metadata.create_all(bind=engine)
    _migrar_colunas_compatibilidade()


def _migrar_colunas_compatibilidade() -> None:
    """Mantem bancos anteriores compativeis sem apagar dados existentes."""
    with engine.begin() as conn:
        inspetor = inspect(conn)
        tabelas = set(inspetor.get_table_names())
        if "inscricoes" in tabelas:
            colunas = {
                coluna["name"] for coluna in inspetor.get_columns("inscricoes")
            }
            if "consentimento_versao" not in colunas:
                conn.execute(
                    text(
                        "ALTER TABLE inscricoes "
                        "ADD COLUMN consentimento_versao VARCHAR(20)"
                    )
                )
            if "consentimento_em" not in colunas:
                tipo_data = "DATETIME" if USANDO_SQLITE else "TIMESTAMP"
                conn.execute(
                    text(
                        "ALTER TABLE inscricoes "
                        f"ADD COLUMN consentimento_em {tipo_data}"
                    )
                )
        if "usuarios" in tabelas:
            colunas = {
                coluna["name"] for coluna in inspetor.get_columns("usuarios")
            }
            if "auth_versao" not in colunas:
                conn.execute(
                    text(
                        "ALTER TABLE usuarios ADD COLUMN auth_versao "
                        "INTEGER NOT NULL DEFAULT 0"
                    )
                )
