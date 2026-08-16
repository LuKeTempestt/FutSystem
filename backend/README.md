# Backend do FutSystem

API REST em FastAPI para inscrição, organização e acompanhamento da Copa AVOSOS. O mesmo aplicativo entrega a API e o front-end.

## Arquitetura

```text
Navegador
   |  HTTPS e JSON
   v
FastAPI
   |-- proteção de requisições
   |-- autenticação e autorização
   |-- validação Pydantic
   |-- regras de negócio
   |-- arquivos públicos permitidos
   v
SQLAlchemy 2.0
   |-- PostgreSQL no Neon (produção)
   `-- SQLite (desenvolvimento local)
```

| Camada | Tecnologia |
|---|---|
| API | Python 3.12, FastAPI e Uvicorn |
| Validação | Pydantic 2 |
| Persistência | SQLAlchemy 2.0 |
| Produção | PostgreSQL no Neon com psycopg 3 |
| Desenvolvimento | SQLite local |
| Autenticação | JWT HS256 e senhas bcrypt |
| Hospedagem | Vercel Functions |

## Estrutura

```text
backend/
|-- main.py                # aplicação, ciclo de vida e rotas
|-- request_protection.py  # rate limit e limite de corpo antes do parsing
|-- database.py            # engine, sessões e compatibilidade de esquema
|-- models.py              # modelos ORM
|-- schemas.py             # contratos de entrada e saída
|-- crud.py                # persistência e regras de negócio
|-- auth.py                # bcrypt, JWT e controle de acesso
|-- bootstrap_admin.py     # criação segura do primeiro administrador
|-- reset_admin.py         # troca assistida da senha administrativa
|-- run.py                 # execução local
`-- tests/                 # testes automatizados
```

Na Vercel, `api/index.py` exporta `backend.main.app`. A lógica permanece independente da plataforma.

## Configuração

Use `.env.example` apenas como referência. Valores reais não devem entrar no Git.

| Variável | Obrigatória | Finalidade |
|---|---:|---|
| `DATABASE_URL` | Em produção | URL agrupada do Neon, preferencialmente com host `-pooler` |
| `FUTSYSTEM_ADMIN_PASSWORD` | Em produção | Senha inicial do usuário `admin`, entre 12 e 128 caracteres |
| `FUTSYSTEM_JWT_SECRET` | Na Vercel | Assinatura dos tokens; mínimo de 32 caracteres |
| `FUTSYSTEM_REGISTRATION_CODE` | Para inscrições | Código de convite, entre 8 e 64 caracteres |
| `FUTSYSTEM_CORS_ORIGINS` | Não | Origens externas permitidas, separadas por vírgula |
| `FUTSYSTEM_HOST` | Não | Host local; padrão `127.0.0.1` |

Sem `DATABASE_URL`, a aplicação cria `backend/futsystem.db`. Esse arquivo é ignorado pelo Git.

## Segurança

- Senhas armazenadas com bcrypt, salt individual e custo 12.
- Hashes de formatos legados são rejeitados e exigem redefinição.
- JWT assinado, com validade de oito horas e identificador mínimo.
- Logout e troca de senha incrementam `usuarios.auth_versao`, invalidando tokens anteriores no banco.
- Papéis `user` e `admin` são conferidos no servidor.
- O cadastro exige consentimento e código de convite comparado em tempo constante.
- Corpos HTTP são limitados a 64 KiB antes da validação.
- Login e cadastro possuem limite de tentativas por processo.
- Dados públicos são reduzidos e condicionados ao consentimento.
- A raiz do repositório não é exposta como diretório estático.

O rate limit atual é local a cada processo. Uma operação distribuída de maior escala deve usar armazenamento compartilhado.

Na Vercel não existe segredo JWT de fallback: a aplicação falha cedo se `FUTSYSTEM_JWT_SECRET` estiver ausente ou for curto.

## Persistência

O banco é selecionado por `DATABASE_URL`:

- variável ausente: SQLite local;
- `postgres://` ou `postgresql://`: normalização para psycopg 3;
- Neon: conexão SSL definida na URL e sem pool duplicado dentro da função serverless.

No primeiro início, o SQLAlchemy cria tabelas ausentes e aplica somente ajustes de compatibilidade previstos. Evoluções maiores devem usar migrações versionadas, como Alembic.

### Entidades principais

| Entidade | Responsabilidade |
|---|---|
| `Usuario` | credenciais, papel, vínculo e versão de autenticação |
| `Inscricao` | participante, contato, consentimento e grupo |
| `Grupo` | organização da fase inicial |
| `Partida` | confronto, fase, placar e status |
| `Config` | dados e estado operacional do evento |
| `FairPlay` | pontuação adicional por grupo |

## API

Documentação interativa: `http://localhost:8001/api/docs`.

| Grupo | Rotas principais |
|---|---|
| Metadados | `GET /api/health`, `GET /api/info` |
| Autenticação | login, logout, perfil e troca de senha |
| Inscrições | cadastro, consulta privada e atualização autorizada |
| Campeonato | grupos, partidas, chaveamento, classificação e Fair Play |
| Administração | usuários, configurações, estatísticas e reset protegido |

Os contratos completos ficam em `/api/openapi.json`.

## Execução local

Na raiz do repositório:

```bash
python -m pip install -r backend/requirements.txt
python -m backend.run
```

A aplicação abre em `http://localhost:8001`. No primeiro uso, o terminal solicita os segredos necessários sem exibi-los.

## Testes

```bash
python -m pip install -r backend/requirements-dev.txt
python -m unittest discover -s backend/tests -v
```

A suíte cobre autenticação, autorização, JWT, privacidade, consentimento, código de convite, tamanho de requisição, arquivos públicos e configuração de produção. O GitHub Actions executa os testes em atualizações da `main` e pull requests.

## Implantação

1. Conecte o repositório ao projeto da Vercel.
2. Vincule o projeto Neon existente e use a URL agrupada em `DATABASE_URL`.
3. Cadastre os três segredos `FUTSYSTEM_ADMIN_PASSWORD`, `FUTSYSTEM_JWT_SECRET` e `FUTSYSTEM_REGISTRATION_CODE`.
4. Faça uma implantação de Preview.
5. Valide saúde, login, inscrição, escrita e leitura antes de promover para Production.

O banco deve permanecer no Neon. O sistema de arquivos de uma função serverless é efêmero e não deve armazenar SQLite de produção.
