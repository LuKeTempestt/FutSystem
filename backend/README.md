# Backend do FutSystem

API REST que centraliza autenticação, inscrições, grupos, partidas, classificação e administração do campeonato.

## Tecnologias

- Python 3.10+;
- FastAPI e Pydantic;
- SQLAlchemy 2;
- SQLite;
- bcrypt para senhas;
- testes com `unittest` e `TestClient`.

## Organização

| Arquivo | Responsabilidade |
|---|---|
| `main.py` | aplicação FastAPI, rotas, CORS e arquivos públicos permitidos |
| `schemas.py` | contratos e validação de entrada e saída |
| `models.py` | entidades persistidas com SQLAlchemy |
| `crud.py` | consultas e regras de negócio |
| `auth.py` | hash de senhas, tokens, papéis e limites de requisição |
| `database.py` | conexão e sessões do banco |
| `bootstrap_admin.py` | criação segura do primeiro administrador |
| `reset_admin.py` | recuperação local da conta administrativa |
| `tests/test_security.py` | regressões de autorização, privacidade e configuração |

## Controles importantes

- senhas novas armazenadas com bcrypt e salt individual;
- tokens aleatórios com expiração, limite por usuário e revogação;
- papéis `user` e `admin` validados no servidor;
- dados completos das inscrições disponíveis apenas para administradores;
- páginas públicas exibem somente participantes com consentimento registrado e nome reduzido;
- contatos, datas de nascimento e responsáveis não aparecem nas rotas públicas;
- CORS restrito às origens configuradas;
- servidor vinculado a `127.0.0.1` por padrão;
- banco, arquivos `.env` e caches excluídos do Git e da entrega HTTP;
- limite de tentativas em login e registro.

## Executar

Na raiz do projeto:

```bash
python -m pip install -r backend/requirements.txt
python -m backend.run
```

A aplicação abre em `http://localhost:8001`. A documentação interativa fica em `http://localhost:8001/docs`.

## Testar

```bash
python -m pip install -r backend/requirements-dev.txt
python -m unittest discover -s backend/tests -v
```

## Variáveis de ambiente

| Variável | Uso |
|---|---|
| `FUTSYSTEM_HOST` | endereço de escuta; o padrão seguro é `127.0.0.1` |
| `FUTSYSTEM_CORS_ORIGINS` | lista explícita de origens autorizadas |

O primeiro administrador é configurado por entrada oculta no terminal. Senhas não devem ser passadas como argumento, registradas em documentação ou enviadas por HTTP aberto.

## Rotas principais

| Grupo | Exemplos |
|---|---|
| Metadados | `GET /api/health`, `GET /api/info` |
| Autenticação | `POST /api/auth/login`, `POST /api/auth/logout`, `GET /api/auth/me` |
| Inscrições | `POST /api/inscricoes`, `PUT /api/inscricoes/{id}` |
| Participantes | `GET /api/participantes` com dados públicos reduzidos |
| Campeonato | grupos, partidas, chaveamento e classificação |
| Administração | usuários, configurações, estatísticas e reset protegido |

Consulte `/docs` com o servidor em execução para os contratos completos e requisitos de autenticação.
