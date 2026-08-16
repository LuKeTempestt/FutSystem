"""
Utilitario de emergencia: redefine a senha do admin 'admin'.

Uso:
    python -m backend.reset_admin

Se o admin nao existir, cria. Se existir, atualiza o hash.
"""
import getpass
import sys

from . import models, auth
from .database import SessionLocal, init_db


def solicitar_senha(rotulo: str = "Nova senha do admin") -> str:
    """Le uma senha sem eco e exige confirmacao."""
    senha = getpass.getpass(f"{rotulo} (12 a 128 caracteres): ")
    confirmacao = getpass.getpass("Confirme a senha: ")
    if senha != confirmacao:
        raise SystemExit("As senhas nao coincidem.")
    if not 12 <= len(senha) <= 128:
        raise SystemExit("A senha precisa ter entre 12 e 128 caracteres.")
    return senha


def main() -> None:
    if len(sys.argv) != 1:
        raise SystemExit(
            "Nao informe a senha no comando. Use: python -m backend.reset_admin"
        )
    nova_senha = solicitar_senha()

    init_db()
    db = SessionLocal()
    try:
        admin = (
            db.query(models.Usuario)
            .filter(models.Usuario.username == "admin")
            .first()
        )
        if admin:
            admin.senha_hash = auth.gerar_hash(nova_senha)
            admin.role = "admin"
            admin.ativo = True
            auth.revogar_tokens_de(db, admin.id)
            db.commit()
            print(f"[OK] Senha do admin 'admin' atualizada.")
        else:
            admin = models.Usuario(
                username="admin",
                senha_hash=auth.gerar_hash(nova_senha),
                role="admin",
            )
            db.add(admin)
            db.commit()
            print(f"[OK] Admin 'admin' criado.")

        print("     Usuario: admin")
        print()
        print("Faca login em /admin/ com essas credenciais.")
    finally:
        db.close()


if __name__ == "__main__":
    main()
