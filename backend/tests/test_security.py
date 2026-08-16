import unittest
import os
from datetime import datetime
from pathlib import Path
from types import SimpleNamespace
from unittest.mock import patch

from fastapi import HTTPException
from fastapi.testclient import TestClient
from pydantic import ValidationError
from sqlalchemy import create_engine
from sqlalchemy.orm import sessionmaker
from starlette.routing import Mount

from backend import auth, crud, main, models, schemas
from backend.database import Base, _normalizar_database_url


ROOT = Path(__file__).resolve().parents[2]


class SecurityRegressionTests(unittest.TestCase):
    def setUp(self):
        self.engine = create_engine("sqlite:///:memory:")
        Base.metadata.create_all(self.engine)
        self.db = sessionmaker(bind=self.engine)()
        auth._RATE_LIMIT_LOGIN.clear()
        auth._RATE_LIMIT_REGISTRO.clear()

    def tearDown(self):
        self.db.close()
        self.engine.dispose()
        auth._RATE_LIMIT_LOGIN.clear()
        auth._RATE_LIMIT_REGISTRO.clear()

    def test_admin_bootstrap_requires_a_strong_unique_secret(self):
        with self.assertRaises(RuntimeError):
            auth.garantir_admin_padrao(self.db, None)
        with self.assertRaises(RuntimeError):
            auth.garantir_admin_padrao(self.db, "curta")

        segredo = "segredo-unico-com-mais-de-doze"
        self.assertTrue(auth.garantir_admin_padrao(self.db, segredo))
        admin = self.db.query(models.Usuario).filter_by(username="admin").one()
        self.assertTrue(auth.verificar_senha(segredo, admin.senha_hash))
        self.assertFalse(auth.garantir_admin_padrao(self.db, "outro-segredo-valido"))

    def test_admin_bootstrap_rejects_oversized_secret_and_rotates_legacy_hash(self):
        with self.assertRaises(RuntimeError):
            auth.garantir_admin_padrao(self.db, "x" * 129)
        admin = models.Usuario(username="admin", senha_hash="hash-legado", role="admin")
        self.db.add(admin)
        self.db.commit()
        segredo = "segredo-novo-com-mais-de-doze"
        self.assertTrue(auth.garantir_admin_padrao(self.db, segredo))
        self.assertTrue(auth.verificar_senha(segredo, admin.senha_hash))

    def test_root_directory_is_not_mounted_as_static(self):
        mounts = {route.path for route in main.app.routes if isinstance(route, Mount)}
        self.assertNotIn("", mounts)
        self.assertNotIn("/", mounts)
        self.assertEqual({"/css", "/js", "/admin"}, mounts)

    def test_public_file_allowlist_blocks_backend_and_database(self):
        for arquivo in ("backend/auth.py", "backend/futsystem.db", "README.md"):
            with self.subTest(arquivo=arquivo), self.assertRaises(HTTPException) as erro:
                main.public_file(arquivo)
            self.assertEqual(404, erro.exception.status_code)

        resposta = main.public_file("index.html")
        self.assertEqual(ROOT / "index.html", Path(resposta.path))

    def test_http_cannot_download_the_database(self):
        client = TestClient(main.app)
        self.assertEqual(404, client.get("/backend/futsystem.db").status_code)
        self.assertEqual(200, client.get("/index.html").status_code)

    def test_forwarded_for_cannot_spoof_rate_limit_identity(self):
        request = SimpleNamespace(
            headers={"x-forwarded-for": "203.0.113.99"},
            client=SimpleNamespace(host="127.0.0.1"),
        )
        self.assertEqual("127.0.0.1", auth.ip_do_request(request))

    def test_user_cannot_hide_explicit_null_group_update(self):
        self.assertNotIn("grupo_id", schemas.InscricaoUpdate().model_fields_set)
        self.assertIn(
            "grupo_id",
            schemas.InscricaoUpdate(grupo_id=None).model_fields_set,
        )

    def test_password_policies_reject_short_values(self):
        common = {
            "nome": "Participante",
            "nascimento": "2000-01-01",
            "whatsapp": "79999999999",
            "username": "participante",
        }
        with self.assertRaises(ValidationError):
            schemas.InscricaoCreate(**common, senha="1234")
        with self.assertRaises(ValidationError):
            schemas.AdminCreate(username="gestor", senha="12345678")

    def test_registration_requires_server_validated_consent(self):
        comum = {
            "nome": "Participante",
            "nascimento": "2000-01-01",
            "whatsapp": "79999999999",
            "username": "participante",
            "senha": "senha-segura",
        }
        with self.assertRaises(ValidationError):
            schemas.InscricaoCreate(**comum)
        with self.assertRaises(ValidationError):
            schemas.InscricaoCreate(**comum, consentimento=False)
        valido = schemas.InscricaoCreate(
            **comum,
            consentimento=True,
            codigo_convite="convite-exemplo",
        )
        self.assertTrue(valido.consentimento)

    def test_registration_requires_server_configured_invitation_code(self):
        dados = schemas.InscricaoCreate(
            nome="Participante Exemplo",
            nascimento="2000-01-01",
            whatsapp="79999999999",
            username="participante",
            senha="senha-segura",
            codigo_convite="codigo-incorreto",
            consentimento=True,
        )
        with patch.dict(os.environ, {"FUTSYSTEM_REGISTRATION_CODE": "codigo-correto"}):
            with self.assertRaises(HTTPException) as erro:
                main.criar_inscricao(dados=dados, db=self.db)
            self.assertEqual(403, erro.exception.status_code)

            dados.codigo_convite = "codigo-correto"
            resposta = main.criar_inscricao(dados=dados, db=self.db)
            self.assertEqual("participante", resposta.username)

    def test_public_request_body_limit_runs_before_json_parsing(self):
        client = TestClient(main.app)
        resposta = client.post(
            "/api/auth/login",
            json={"username": "admin", "password": "x", "extra": "x" * 70000},
        )
        self.assertEqual(413, resposta.status_code)

    def test_malformed_login_requests_are_rate_limited(self):
        client = TestClient(main.app)
        for _ in range(auth.RATE_LIMIT_TENTATIVAS):
            resposta = client.post(
                "/api/auth/login",
                content="{",
                headers={"Content-Type": "application/json"},
            )
            self.assertEqual(422, resposta.status_code)
        self.assertEqual(
            429,
            client.post(
                "/api/auth/login",
                content="{",
                headers={"Content-Type": "application/json"},
            ).status_code,
        )

    def test_public_participants_are_consented_and_pseudonymized(self):
        autorizado = models.Inscricao(
            nome="Pessoa Autorizada Completa",
            nascimento="2000-01-01",
            whatsapp="79999999999",
            superpoder="Empatia",
            consentimento_versao=schemas.CONSENTIMENTO_VERSAO_ATUAL,
            consentimento_em=datetime.utcnow(),
        )
        legado = models.Inscricao(
            nome="Pessoa Legada Completa",
            nascimento="2000-01-01",
            whatsapp="79999999998",
        )
        self.db.add_all([autorizado, legado])
        self.db.commit()
        publico = crud.listar_participantes_publico(self.db)
        self.assertEqual(1, len(publico))
        self.assertEqual("Pessoa C.", publico[0]["nome"])
        self.assertNotIn("whatsapp", publico[0])

    def test_public_group_ambassador_requires_consent_and_is_pseudonymized(self):
        grupo = models.Grupo(nome="Brasil", cor="brasil")
        self.db.add(grupo)
        self.db.flush()
        consentido = models.Inscricao(
            nome="Pessoa Autorizada Completa",
            nascimento="2000-01-01",
            whatsapp="79999999999",
            grupo_id=grupo.id,
            consentimento_versao=schemas.CONSENTIMENTO_VERSAO_ATUAL,
            consentimento_em=datetime.utcnow(),
        )
        sem_consentimento = models.Inscricao(
            nome="Pessoa Sem Consentimento",
            nascimento="2000-01-01",
            whatsapp="79999999998",
            grupo_id=grupo.id,
        )
        self.db.add_all([consentido, sem_consentimento])
        self.db.commit()

        grupo.embaixador = consentido.nome
        self.db.commit()
        self.assertEqual("Pessoa C.", crud.listar_grupos_publicos(self.db)[0]["embaixador"])

        grupo.embaixador = sem_consentimento.nome
        self.db.commit()
        self.assertEqual("", crud.listar_grupos_publicos(self.db)[0]["embaixador"])

    def test_public_fair_play_hides_full_name_and_free_text(self):
        self.db.add(models.FairPlay(id=1, nome="Pessoa Autorizada Completa", motivo="Texto livre interno"))
        self.db.commit()
        publico = main.get_fair_play(db=self.db, user=None)
        self.assertEqual("Pessoa C.", publico["nome"])
        self.assertNotIn("Texto livre", publico["motivo"])

    def test_username_availability_oracle_is_not_exposed(self):
        caminhos = {getattr(route, "path", None) for route in main.app.routes}
        self.assertNotIn("/api/usuarios/disponivel", caminhos)

    def test_jwt_is_validated_against_persistent_revocation_version(self):
        usuario = models.Usuario(
            username="gestor",
            senha_hash=auth.gerar_hash("segredo-valido"),
            role="admin",
        )
        self.db.add(usuario)
        self.db.commit()
        token = auth.criar_token(usuario)
        autenticado = auth.usuario_atual(
            authorization=f"Bearer {token}",
            db=self.db,
        )
        self.assertEqual(usuario.id, autenticado.id)

        auth.revogar_tokens_de(self.db, usuario.id)
        self.db.commit()
        with self.assertRaises(HTTPException) as erro:
            auth.usuario_atual(authorization=f"Bearer {token}", db=self.db)
        self.assertEqual(401, erro.exception.status_code)

    def test_tampered_jwt_is_rejected(self):
        usuario = models.Usuario(
            username="gestor-jwt",
            senha_hash=auth.gerar_hash("segredo-valido"),
            role="admin",
        )
        self.db.add(usuario)
        self.db.commit()
        token = auth.criar_token(usuario)
        adulterado = token[:-1] + ("a" if token[-1] != "a" else "b")
        with self.assertRaises(HTTPException) as erro:
            auth.usuario_atual(
                authorization=f"Bearer {adulterado}", db=self.db
            )
        self.assertEqual(401, erro.exception.status_code)

    def test_vercel_requires_explicit_jwt_secret(self):
        with patch.dict(
            os.environ,
            {"VERCEL": "1", "FUTSYSTEM_JWT_SECRET": ""},
            clear=False,
        ):
            with self.assertRaises(RuntimeError):
                auth.validar_configuracao_producao()

    def test_postgres_url_selects_psycopg3_driver(self):
        self.assertEqual(
            "postgresql+psycopg://user:pass@host/db",
            _normalizar_database_url("postgresql://user:pass@host/db"),
        )

    def test_reset_revokes_deleted_user_tokens_but_keeps_admin(self):
        admin = models.Usuario(username="admin2", senha_hash="hash", role="admin")
        usuario = models.Usuario(username="user2", senha_hash="hash", role="user")
        self.db.add_all([admin, usuario])
        self.db.commit()
        token_admin = auth.criar_token(admin)
        token_usuario = auth.criar_token(usuario)

        crud.resetar_tudo(self.db)

        autenticado = auth.usuario_atual(
            authorization=f"Bearer {token_admin}", db=self.db
        )
        self.assertEqual(admin.id, autenticado.id)
        with self.assertRaises(HTTPException):
            auth.usuario_atual(
                authorization=f"Bearer {token_usuario}", db=self.db
            )

    def test_frontend_security_guards_remain_present(self):
        components = (ROOT / "js" / "components.js").read_text(encoding="utf-8")
        data = (ROOT / "js" / "data.js").read_text(encoding="utf-8")
        storage = (ROOT / "js" / "storage.js").read_text(encoding="utf-8")
        admin = (ROOT / "js" / "admin.js").read_text(encoding="utf-8")
        inscricao = (ROOT / "js" / "inscricao.js").read_text(encoding="utf-8")
        api = (ROOT / "js" / "api.js").read_text(encoding="utf-8")
        estilos = (ROOT / "css" / "styles.css").read_text(encoding="utf-8")

        self.assertIn("escapeHtmlComponent(cfg.endereco", components)
        self.assertNotIn("Storage.addInscricao(dados)", data)
        self.assertIn("cadastro exige conexao", data)
        self.assertIn("neutralizarFormula", admin)
        self.assertIn("dados.senha.length < 8", inscricao)
        self.assertIn("sessionStorage.setItem(TOKEN_KEY", api)
        self.assertNotIn("localStorage.setItem(TOKEN_KEY", api)
        self.assertIn("return `${origin}/api`", api)
        self.assertNotIn("port !== '8001'", api)
        self.assertNotIn("usuarios/disponivel", inscricao)
        self.assertNotIn("fonts.googleapis.com", estilos)

    def test_cors_is_not_wildcard_by_default(self):
        fonte = (ROOT / "backend" / "main.py").read_text(encoding="utf-8")
        self.assertNotIn('allow_origins=["*"]', fonte)

    def test_sensitive_runtime_files_are_ignored(self):
        gitignore = (ROOT / ".gitignore").read_text(encoding="utf-8")
        self.assertIn("backend/*.db", gitignore)
        self.assertIn("*.csv", gitignore)
        self.assertIn(".env.*", gitignore)
        self.assertIn("__pycache__/", gitignore)

    def test_security_documentation_matches_current_implementation(self):
        codigo = (ROOT / "CODIGO.md").read_text(encoding="utf-8")
        instalacao = (ROOT / "INSTALACAO.md").read_text(encoding="utf-8")
        operacao = (ROOT / "OPERACAO.md").read_text(encoding="utf-8")

        self.assertNotIn("port !== '8001'", codigo)
        self.assertNotIn("usuarios/disponivel", codigo)
        self.assertNotIn("guarda token + dados no localStorage", codigo)
        self.assertNotIn("liberar a nova porta no firewall", codigo)
        self.assertNotIn("copiar `backend/futsystem.db` para um pen-drive", instalacao.lower())
        self.assertNotIn("copie o `backend/futsystem.db` para um pen-drive", operacao.lower())


if __name__ == "__main__":
    unittest.main()
