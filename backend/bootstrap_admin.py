"""Prepara o primeiro administrador sem exibir a senha no terminal."""
import os

from . import auth, models
from .database import SessionLocal, init_db
from .reset_admin import solicitar_senha


def preparar_admin() -> bool:
    """Cria ou rotaciona o admin legado; retorna True quando houve alteracao."""
    init_db()
    db = SessionLocal()
    try:
        admin = db.query(models.Usuario).filter_by(username="admin").first()
        if admin and not auth.hash_precisa_migrar(admin.senha_hash):
            return False
        senha = os.getenv("FUTSYSTEM_ADMIN_PASSWORD") or solicitar_senha(
            "Senha inicial do admin"
        )
        alterado = auth.garantir_admin_padrao(db, senha)
        if alterado:
            print("[OK] Administrador preparado. Usuario: admin")
        return alterado
    finally:
        db.close()


if __name__ == "__main__":
    preparar_admin()
