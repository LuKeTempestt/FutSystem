"""
Configuracao do SQLAlchemy: engine, session e base declarativa.
Banco: SQLite (arquivo futsystem.db na pasta backend).
"""
from pathlib import Path
from sqlalchemy import create_engine, inspect, text
from sqlalchemy.orm import declarative_base, sessionmaker, Session

BASE_DIR = Path(__file__).resolve().parent
DB_PATH = BASE_DIR / "futsystem.db"
DATABASE_URL = f"sqlite:///{DB_PATH}"

engine = create_engine(
    DATABASE_URL,
    echo=False,
    connect_args={"check_same_thread": False},
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
    _migrar_consentimento_inscricoes()


def _migrar_consentimento_inscricoes() -> None:
    """Adiciona campos de consentimento a bancos SQLite criados antes da v2.1."""
    with engine.begin() as conn:
        inspetor = inspect(conn)
        if "inscricoes" not in inspetor.get_table_names():
            return
        colunas = {coluna["name"] for coluna in inspetor.get_columns("inscricoes")}
        if "consentimento_versao" not in colunas:
            conn.execute(
                text("ALTER TABLE inscricoes ADD COLUMN consentimento_versao VARCHAR(20)")
            )
        if "consentimento_em" not in colunas:
            conn.execute(
                text("ALTER TABLE inscricoes ADD COLUMN consentimento_em DATETIME")
            )
