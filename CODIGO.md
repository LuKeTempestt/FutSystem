# 💻 Guia de Código — Copa AVOSOS

Este guia explica **a lógica por trás do código** e mostra **cenários comuns de modificação**. É voltado a quem fará manutenção ou estudará a implementação.

> 📋 Para a referência técnica do backend (endpoints, modelo de dados), veja [backend/README.md](backend/README.md). Este aqui é mais didático e prático, cobrindo **front + back juntos**.

---

## 📑 Índice

1. [Big picture — como tudo se conecta](#1-big-picture--como-tudo-se-conecta)
2. [Front-end — anatomia de uma página](#2-front-end--anatomia-de-uma-página)
3. [Front-end — cada arquivo JS, em detalhe](#3-front-end--cada-arquivo-js-em-detalhe)
4. [Back-end — cada arquivo Python, em detalhe](#4-back-end--cada-arquivo-python-em-detalhe)
5. [Fluxo de dados ponta a ponta](#5-fluxo-de-dados-ponta-a-ponta)
6. [Cenários comuns de modificação](#6-cenários-comuns-de-modificação)
7. [Convenções de código](#7-convenções-de-código)
8. [Como debugar problemas](#8-como-debugar-problemas)

---

## 1. Big picture — como tudo se conecta

```
┌─────────────────────────────────────────────────────────────────────────┐
│  📱 NAVEGADOR DO USUÁRIO                                                 │
│                                                                          │
│   index.html  ←──────────────  ┌──────────────────────────────────┐    │
│      ↓ inclui                  │  CARREGA SEMPRE NESSA ORDEM      │    │
│   js/storage.js                │   1. storage.js  (localStorage)  │    │
│   js/api.js                    │   2. api.js      (cliente HTTP)  │    │
│   js/data.js                   │   3. data.js     (escolhe um)    │    │
│   js/components.js             │   4. components.js (header/footer)│   │
│   js/main.js                   │   5. main.js     (countdown, etc) │   │
│   js/inscricao.js              │   6. página.js   (específico)    │    │
│      ↓                         └──────────────────────────────────┘    │
│   render dinâmico                                                       │
│      ↓                                                                   │
│   chama Data.algumaCoisa()                                              │
└──────────────────┬───────────────────────────────────────────────────────┘
                   │
                   │ fetch /api/...
                   ▼
┌─────────────────────────────────────────────────────────────────────────┐
│  🖥️ SERVIDOR PYTHON (uvicorn rodando backend.main:app)                  │
│                                                                          │
│  main.py:                                                                │
│   @app.post("/api/...")                                                  │
│   def rota(dados, db, _admin=Depends(auth.usuario_admin)):              │
│       crud.alguma_funcao(db, dados)  ◀── lógica em crud.py             │
│       ↓                                                                  │
│   crud.py:                                                               │
│       ins = Inscricao(...)                                               │
│       db.add(ins); db.commit()  ◀── SQLAlchemy fala com o banco ativo   │
│                                                                          │
└──────────────────┬───────────────────────────────────────────────────────┘
                   │
                   ▼
                ┌─────────────────────────────────────────┐
                │ PostgreSQL/Neon (produção)              │
                │ SQLite/futsystem.db (desenvolvimento)   │
                └─────────────────────────────────────────┘
```

**Pontos-chave:**

- O front-end **não conhece SQL** — só fala JSON com a API
- O back-end **não conhece HTML** — só serve JSON nas rotas `/api/*` e arquivos estáticos no resto
- A camada `data.js` no front é uma **abstração** que decide se vai pra API ou pro localStorage (modo offline)
- A persistência usa o banco selecionado por `DATABASE_URL`: **PostgreSQL no Neon** em produção e **SQLite** no desenvolvimento local

---

## 2. Front-end — anatomia de uma página

Toda página HTML segue o mesmo padrão. Exemplo `inscricao.html`:

```html
<!DOCTYPE html>
<html lang="pt-BR">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1">
  <title>...</title>
  <link rel="stylesheet" href="css/styles.css">    <!-- estilo unificado -->
</head>
<body>
  <div data-header></div>                          <!-- header injetado -->

  <main id="main">
    <!-- CONTEÚDO DA PÁGINA AQUI -->
    <section class="page-header">...</section>
    <section class="section">
      <form class="form-card" id="formInscricao">...</form>
    </section>
  </main>

  <div data-footer></div>                          <!-- footer injetado -->

  <!-- ORDEM IMPORTANTE: -->
  <script src="js/storage.js"></script>           <!-- 1. fallback localStorage -->
  <script src="js/api.js"></script>               <!-- 2. cliente HTTP -->
  <script src="js/data.js"></script>              <!-- 3. camada unificada -->
  <script src="js/components.js"></script>        <!-- 4. header/footer -->
  <script src="js/main.js"></script>              <!-- 5. menu, countdown, PWA -->
  <script src="js/inscricao.js"></script>         <!-- 6. lógica da página -->
</body>
</html>
```

### Por que essa ordem importa?

- `storage.js` define `window.Storage` — usado como fallback
- `api.js` define `window.Api` — cliente HTTP
- `data.js` define `window.Data` — depende dos dois acima
- `components.js` injeta header/footer — depende de `Data.getConfig()`
- `main.js` faz countdown e PWA — depende de `Data`
- O JS específico da página é o último — pode usar tudo acima

### Header e footer aparecem por mágica

Cada página tem `<div data-header></div>` e `<div data-footer></div>` vazios. O `components.js` preenche esses elementos com o HTML real do header/footer ao carregar a página.

**Vantagem:** mudar o header/footer em um lugar só (`components.js`) atualiza todas as páginas.

---

## 3. Front-end — cada arquivo JS, em detalhe

### `js/storage.js` — Camada localStorage (fallback offline)

**Propósito:** quando o backend está fora do ar (offline), o site ainda funciona usando o `localStorage` do navegador.

**API exposta:** `window.Storage`
- `Storage.getConfig()`, `Storage.setConfig(c)`
- `Storage.listInscricoes()`, `Storage.addInscricao(d)`, `Storage.deleteInscricao(id)`
- `Storage.listGrupos()`, `Storage.setGrupos(g)`
- `Storage.listPartidas()`, `Storage.gerarPartidasGrupos()`
- `Storage.classificacaoGrupo(grupoId)` — calcula classificação localmente
- O modo offline não autentica administradores nem armazena credenciais

**Quando usado:** apenas se a API estiver indisponível. Em produção, o `data.js` sempre detecta a API online primeiro.

> ⚠️ Os dados aqui ficam APENAS naquele navegador. Não é compartilhado entre dispositivos.

### `js/api.js` — Cliente HTTP da API

**Propósito:** wrapper em volta do `fetch()` para chamar os endpoints `/api/*`.

**Detecção automática da URL da API:**

```javascript
function descobrirBaseUrl() {
  if (window.API_BASE_URL) {
    return window.API_BASE_URL.replace(/\/$/, '') + '/api';
  }
  const { protocol, hostname, origin } = window.location;
  if (protocol === 'file:' || !hostname) {
    return 'http://localhost:8001/api';  // arquivo aberto diretamente
  }
  return `${origin}/api`;  // desenvolvimento e produção: mesma origem
}
```

**API exposta:** `window.Api`
- `Api.login(user, senha)` — guarda token + dados no `sessionStorage` da aba
- `Api.logout()`
- `Api.me()` — retorna `{id, username, role, inscricao}`
- `Api.isLogged()`, `Api.isAdmin()`, `Api.isUser()`
- `Api.criarInscricao(dados)`, `Api.atualizarInscricao(id, patch)`, ...
- `Api.listarGrupos()`, `Api.distribuirAleatorio()`, ...
- `Api.gerarPartidasGrupos()`, `Api.registrarPlacar(id, a, b)`, ...
- `Api.criarAdmin(user, senha)`, `Api.excluirUsuario(id)`, ...

**Padrão de todas as funções:**
```javascript
async function request(path, options = {}) {
  const headers = { 'Content-Type': 'application/json' };
  if (getToken()) headers.Authorization = `Bearer ${getToken()}`;

  const res = await fetch(`${BASE_URL}${path}`, { ...options, headers });

  if (!res.ok) {
    const data = await res.json();
    throw new ApiError(data.detail, res.status);
  }
  return res.json();
}
```

### `js/data.js` — Camada unificada (API + Storage)

**Propósito:** abstrair se está online ou offline. Todas as páginas chamam `Data.*` em vez de `Api.*` ou `Storage.*` direto.

**Como decide:**
```javascript
async function detectarModo() {
  if (_modo !== null) return _modo;
  try {
    const online = await Api.isOnline();  // GET /api/health com timeout 1.5s
    _modo = online ? 'api' : 'local';
  } catch {
    _modo = 'local';
  }
  return _modo;
}
```

Depois, cada função tem o padrão:
```javascript
async function listInscricoes() {
  if (await detectarModo() === 'api') {
    try {
      const lista = await Api.listarInscricoes();
      return lista.map(mapInscricaoApi);  // converte campo_api → campoFront
    } catch {
      return Storage.listInscricoes();    // fallback se a chamada falhou
    }
  }
  return Storage.listInscricoes();
}
```

**Por que mapear?**

O backend usa snake_case (`grupo_id`, `como_soube`, `criado_em`). O front usava nomes camelCase (`grupo`, `como`, `criadoEm`). O `mapInscricaoApi` faz a tradução:

```javascript
function mapInscricaoApi(i) {
  return {
    id: i.id,
    nome: i.nome,
    nascimento: i.nascimento,
    responsavel: i.responsavel,
    whatsapp: i.whatsapp,
    como: i.como_soube,        // ◀── tradução
    poder: i.superpoder,        // ◀── tradução
    grupo: i.grupo_id,          // ◀── tradução
    criadoEm: i.criado_em,      // ◀── tradução
  };
}
```

### `js/components.js` — Header e footer

**Função principal:** `renderHeader()` e `renderFooter()` populam os `<div data-header>` e `<div data-footer>` com HTML.

**Header inteligente** — muda os botões conforme o estado de login:

```javascript
const user = Api.getUser();
const logged = Api.isLogged();

if (logged && user) {
  if (user.role === 'admin') {
    ctaDesktop = `<a href="admin/" class="nav-cta">⚙️ Painel</a>`;
  } else {
    ctaDesktop = `<a href="minha-area.html" class="nav-cta">🪪 Minha área</a>`;
  }
} else {
  ctaDesktop = `<a href="login.html" class="nav-cta">🔓 Entrar</a>`;
}
```

### `js/main.js` — Inicialização global

**Roda em todas as páginas.** Responsável por:

- **Menu mobile** (hambúrguer) — `inicializarMenu()`
- **Destaque do link ativo** no menu — `marcarLinkAtivo()`
- **Countdown da data do evento** — `inicializarCountdowns()` lê `Data.getConfig().dataEvento`
- **Service Worker** (PWA) — `inicializarServiceWorker()`
- **Toast utility** — `AppUtils.showToast(msg, tipo)`
- **Helpers de formatação** — `formatarData`, `calcularIdade`, `iniciais`

### `js/inscricao.js` — Lógica do formulário de inscrição

Faz a validação, sugere o username automaticamente e envia os dados para a API. A disponibilidade é verificada pelo servidor no envio, evitando um endpoint público de enumeração de usuários.

**Sugestão de username a partir do nome:**

```javascript
function sugerirUsername(nome) {
  const limpo = nome
    .toLowerCase()
    .normalize('NFD').replace(REGEX_ACENTOS, '')  // remove acentos
    .replace(/[^a-z\s]/g, '')                     // só letras
    .trim();
  const partes = limpo.split(/\s+/);
  if (partes.length === 1) return partes[0].slice(0, 20);
  return (partes[0] + partes[partes.length - 1]).slice(0, 20);  // primeiro + último
}
```

"Lucas Silva" → `lucassilva`.

Se o nome de usuário já existir, a API rejeita a inscrição sem revelar previamente quais contas estão cadastradas.

### `js/campeonato.js` — Render dinâmico do campeonato

Carrega grupos, classificação, partidas e Fair Play; renderiza HTML.

**Mapa de bandeiras por nome do grupo:**

```javascript
const BANDEIRAS = {
  brasil: '🇧🇷',
  argentina: '🇦🇷',
  // ...
};
// Usa: BANDEIRAS[grupo.nome.toLowerCase()] ?? '⚽'
```

**Tabs por fase** (Grupos | Oitavas | Quartas | Semi | Final) implementadas com CSS + JS simples — clicar muda a classe `.active`.

### `js/album.js` — Renderiza o álbum de figurinhas

Lista inscritos agrupados por grupo, cada um vira um "card de figurinha".

### `js/admin.js` — Painel administrativo completo

**~600 linhas**, é o arquivo JS mais complexo. Estrutura:

```javascript
// 1. Inicialização: verifica role no carregamento
document.addEventListener('DOMContentLoaded', async () => {
  await Data.detectarModo();
  if (Data.isLogged()) {
    const user = Data.getUser();
    if (user.role !== 'admin') {
      mostrarAcessoNegado();  // user comum logou aqui? bloqueia
      return;
    }
    mostrarAdmin();
  } else {
    mostrarLogin();
  }
  inicializarEventos();
});

// 2. Navegação entre seções
function trocarSecao(nome) {
  // mostra/esconde os <section data-section-content="..."> e ativa
  // o link correspondente no menu lateral
  switch (nome) {
    case 'dashboard': await renderDashboard(); break;
    case 'inscricoes': await renderInscricoes(); break;
    case 'grupos': await renderGruposAdmin(); break;
    case 'partidas': await renderPartidasAdmin(); break;
    case 'chaveamento': await renderChaveamentoAtual(); break;
    case 'fairplay': await preencherFairPlay(); break;
    case 'admins': await renderAdmins(); break;
    case 'config': await preencherConfig(); break;
  }
}

// 3. Cada renderXxx() busca dados via Data.* e gera HTML
```

**Modais de confirmação:**

```javascript
function confirmarAcao(titulo, texto, callback) {
  // mostra o modal, aguarda clique em OK ou Cancelar
  // executa callback se OK
}
```

Usado em ações destrutivas: distribuir, gerar partidas, gerar chaveamento, resetar, excluir.

---

## 4. Back-end — cada arquivo Python, em detalhe

> Veja a referência completa em [backend/README.md](backend/README.md). Aqui é um resumo prático.

### `backend/database.py`

Cria a conexão SQLAlchemy. Com `DATABASE_URL`, usa PostgreSQL; sem essa variável, usa o arquivo SQLite local `backend/futsystem.db`. Em produção, a Vercel recebe a URL agrupada do Neon.

### `backend/models.py`

**Onde ficam as tabelas.** Para adicionar uma coluna nova, é aqui.

Exemplo — adicionar campo "presença confirmada" na inscrição:

```python
class Inscricao(Base):
    # ... outros campos
    presenca_confirmada: Mapped[bool] = mapped_column(Boolean, default=False)
```

> ⚠️ Alterar o modelo não migra automaticamente um banco existente. Em produção, faça backup e aplique uma migração versionada ou SQL controlado. Nunca apague o banco para atualizar o esquema.

### `backend/schemas.py`

**DTOs Pydantic.** Define o formato de entrada (request body) e saída (response).

Para a coluna nova acima, adicionar em:

```python
class InscricaoBase(BaseModel):
    # ... outros campos
    presenca_confirmada: bool = False
```

Pronto — Pydantic valida automaticamente.

### `backend/crud.py`

**Operações de banco + regras de negócio.** Quase toda mudança vai passar aqui.

Padrão:
```python
def fazer_alguma_coisa(db: Session, parametros) -> Resultado:
    # 1. Validar entrada
    if condicao_invalida:
        raise ValueError("Mensagem clara em português")

    # 2. Operar no banco
    obj = db.query(Model).filter(...).first()
    obj.campo = novo_valor

    # 3. Commitar
    db.commit()
    db.refresh(obj)
    return obj
```

Lançar `ValueError` é convertido automaticamente em **HTTP 400** pelo handler global.

### `backend/auth.py`

Autenticação. As senhas já são armazenadas com bcrypt e salt individual:

```python
import bcrypt

def gerar_hash(senha: str) -> str:
    return bcrypt.hashpw(senha.encode(), bcrypt.gensalt()).decode()

def verificar_senha(senha: str, hash_armazenado: str) -> bool:
    return bcrypt.checkpw(senha.encode(), hash_armazenado.encode())
```

Hashes de formatos antigos não são aceitos no login. O administrador legado é rotacionado no início; outros usuários precisam redefinir a senha ou realizar um novo cadastro autorizado.

### `backend/main.py`

**App FastAPI + rotas.** Todo endpoint da API está aqui.

Padrão de rota protegida:

```python
@app.post("/api/algo", response_model=schemas.AlgoOut)
def criar_algo(
    dados: schemas.AlgoCreate,                    # validação automática
    db: Session = Depends(get_db),                 # sessão do banco
    _admin = Depends(auth.usuario_admin),          # exige role=admin
):
    try:
        return crud.criar_algo(db, dados)
    except ValueError as exc:
        raise HTTPException(409, str(exc))
```

---

## 5. Fluxo de dados ponta a ponta

**Exemplo concreto:** participante registra uma inscrição.

```
1. inscricao.html
   Usuário preenche formulário e clica "Garantir minha vaga"
                           │
                           ▼
2. inscricao.js
   form.addEventListener('submit', async (e) => {
     const erros = validar(dados);  // validação client-side
     if (Object.keys(erros).length > 0) return mostrarErros();
     await Data.addInscricao({...});
   });
                           │
                           ▼
3. data.js
   async function addInscricao(dados) {
     if (modo === 'api') {
       const r = await Api.criarInscricao(dados);  // ◀── chama Api
       return { nome: dados.nome, id: r.inscricao_id };
     }
     return Storage.addInscricao(dados);  // fallback offline
   }
                           │
                           ▼
4. api.js
   async function criarInscricao(dados) {
     const r = await request('/inscricoes', { method: 'POST', body: dados });
     if (r && r.token) {
       setToken(r.token);  // ◀── já loga o usuário
       setUser({ username: r.username, role: r.role, inscricao_id: r.inscricao_id });
     }
     return r;
   }
                           │ fetch POST http://localhost:8001/api/inscricoes
                           ▼
5. main.py (FastAPI)
   @app.post("/api/inscricoes", response_model=LoginOut, status_code=201)
   def criar_inscricao(dados: InscricaoCreate, db = Depends(get_db)):
     # InscricaoCreate.field_validator já normalizou username em lowercase
     cfg = crud.obter_config(db)
     if not cfg.inscricoes_abertas:
         raise HTTPException(403, "Inscricoes encerradas.")
     try:
         _, usuario = crud.criar_inscricao_com_usuario(db, dados)
     except ValueError as exc:
         raise HTTPException(409, str(exc))
     token = auth.criar_token(usuario)
     return LoginOut(token=token, ...)
                           │
                           ▼
6. crud.py
   def criar_inscricao_com_usuario(db, dados):
     # valida WhatsApp
     whats = _limpa_whats(dados.whatsapp)
     if not (10 <= len(whats) <= 11):
         raise ValueError("WhatsApp invalido")
     # checa username único
     if db.query(Usuario).filter(...).first():
         raise ValueError("Username ja em uso")
     # cria registros
     ins = Inscricao(nome=..., whatsapp=whats, ...)
     db.add(ins); db.flush()
     usuario = Usuario(username=..., role='user', inscricao_id=ins.id, ...)
     db.add(usuario)
     db.commit()
     return ins, usuario
                           │
                           ▼
7. SQLAlchemy gera SQL e executa
   BEGIN;
   INSERT INTO inscricoes (...) VALUES (...);
   INSERT INTO usuarios (..., inscricao_id=...) VALUES (...);
   COMMIT;
                           │
                           ▼
8. Volta a resposta para o cliente
   {
     "token": "abc123...",
     "username": "lucassilva",
     "role": "user",
     "inscricao_id": 1
   }
                           │
                           ▼
9. inscricao.js mostra tela de sucesso
   form.hidden = true;
   telaSucesso.hidden = false;
   AppUtils.showToast('Inscrição confirmada!');
```

---

## 6. Cenários comuns de modificação

### 🎯 Cenário A: Adicionar um campo novo na inscrição

**Exemplo:** quer guardar o "Tamanho da camiseta" (P, M, G).

**Passos:**

1. **`backend/models.py`** — coluna nova:
   ```python
   class Inscricao(Base):
       # ...
       tamanho_camiseta: Mapped[str] = mapped_column(String(5), default="")
   ```

2. **`backend/schemas.py`** — entra/sai nos DTOs:
   ```python
   class InscricaoBase(BaseModel):
       # ...
       tamanho_camiseta: str = ""
   ```

3. **`inscricao.html`** — campo no formulário:
   ```html
   <div class="form-group">
     <label for="tamanho">Tamanho da camiseta</label>
     <select id="tamanho" name="tamanho" class="form-control">
       <option value="P">P</option>
       <option value="M">M</option>
       <option value="G">G</option>
     </select>
   </div>
   ```

4. **`js/inscricao.js`** — passar adiante:
   ```javascript
   await Data.addInscricao({
     ...
     tamanho_camiseta: dados.tamanho,
   });
   ```

5. **`js/data.js`** — aceitar o novo campo:
   ```javascript
   async function addInscricao(dados) {
     ...
     await Api.criarInscricao({
       ...,
       tamanho_camiseta: dados.tamanho_camiseta || '',
     });
   }
   ```

6. **Apagar `futsystem.db`** (perdem dados existentes) ou rodar SQL manual:
   ```sql
   ALTER TABLE inscricoes ADD COLUMN tamanho_camiseta TEXT DEFAULT '';
   ```

7. Reiniciar o servidor.

### 🎯 Cenário B: Adicionar um novo endpoint

**Exemplo:** endpoint que retorna estatísticas dos superpoderes (quantos têm cada um).

**Passos:**

1. **`backend/crud.py`** — função:
   ```python
   def stats_superpoderes(db: Session) -> list[dict]:
       resultado = (
           db.query(models.Inscricao.superpoder, func.count(models.Inscricao.id))
           .filter(models.Inscricao.superpoder != "")
           .group_by(models.Inscricao.superpoder)
           .all()
       )
       return [{"superpoder": s, "total": t} for s, t in resultado]
   ```

2. **`backend/main.py`** — rota:
   ```python
   @app.get("/api/stats/superpoderes", tags=["stats"])
   def get_stats_superpoderes(db: Session = Depends(get_db)):
       return crud.stats_superpoderes(db)
   ```

3. **`js/api.js`** — método cliente:
   ```javascript
   const statsSuperpoderes = () => request('/stats/superpoderes');
   ```
   E exportar no retorno do módulo.

4. **Usar onde quiser:**
   ```javascript
   const stats = await Api.statsSuperpoderes();
   ```

### 🎯 Cenário C: Mudar o título do site

**Em:**
- `index.html` (e outros HTMLs): `<title>...</title>` e `<h1>` do hero
- `js/components.js`: `brand-name`, `brand-sub`, conteúdo do footer
- `manifest.json`: campos `name` e `short_name`
- `backend/main.py`: title da FastAPI
- `README.md`, etc.

### 🎯 Cenário D: Adicionar uma nova página pública

**Exemplo:** página "Patrocinadores".

1. Criar `patrocinadores.html` copiando a estrutura de `sobre.html`
2. Mudar o conteúdo dentro de `<main id="main">`
3. Em `js/components.js`, adicionar ao `NAV_ITEMS`:
   ```javascript
   { href: 'patrocinadores.html', label: 'Patrocinadores', icon: '🤝' }
   ```
4. Em `service-worker.js` (cache offline), adicionar a página em `ASSETS`

### 🎯 Cenário E: Mudar a porta do servidor

Editar `start.bat` / `start.sh`:
```
python -m uvicorn backend.main:app --host 127.0.0.1 --port 8080  # ← era 8001
```

E no `service-worker.js` se houver referência à porta (não há por padrão).

A aplicação continua restrita a `127.0.0.1`. Para acesso remoto, use um proxy HTTPS confiável; não exponha a porta do servidor diretamente.

### 🎯 Cenário F: Adicionar uma role nova (ex: 'voluntario')

Hoje só existe `admin` e `user`. Para adicionar `voluntario` que pode editar Fair Play mas não tudo:

1. **`models.py`** — sem mudança (campo `role` já é texto livre).

2. **`auth.py`** — nova dependência:
   ```python
   def usuario_admin_ou_voluntario(user = Depends(usuario_atual)):
       if user.role not in ('admin', 'voluntario'):
           raise HTTPException(403, "Acesso restrito.")
       return user
   ```

3. **`main.py`** — usar nas rotas relevantes:
   ```python
   @app.put("/api/fair-play")
   def put_fair_play(dados, db, _ = Depends(auth.usuario_admin_ou_voluntario)):
       return crud.atualizar_fair_play(db, dados)
   ```

4. **`crud.py`** — adicionar `criar_voluntario(db, username, senha)` análogo a `criar_admin`.

5. **`main.py`** — novo endpoint `POST /api/usuarios/voluntario`.

6. **Front** — adicionar UI no painel admin para criar voluntários, e mostrar a role no badge da Minha Área.

### 🎯 Cenário G: Habilitar HTTPS

Para produção, prefira manter o Uvicorn restrito ao servidor e publicar a aplicação por um proxy HTTPS:

```bash
uvicorn backend.main:app \
  --host 127.0.0.1 --port 8001
```

Configure Caddy, Nginx ou outro proxy reverso com um certificado válido. Não exponha a porta 8001 diretamente à internet.

### 🎯 Cenário H: Logar quem fez cada ação

Adicionar uma tabela `auditoria` com `(quem, quando, acao, detalhes)` e logar em cada operação crítica:

```python
# crud.py
def registrar_auditoria(db, user_id, acao, detalhes):
    db.add(models.Auditoria(user_id=user_id, acao=acao, detalhes=detalhes))
    db.commit()
```

Chamar em endpoints sensíveis (registrar placar, distribuir grupos, etc.).

---

## 7. Convenções de código

### Python (backend)

- **PEP 8** padrão (4 espaços, snake_case)
- Docstrings nas funções complexas
- Sem `print()` — usar logger se precisar
- Funções do CRUD em **português** (`criar_inscricao`, `listar_grupos`)
- Endpoints do FastAPI em **inglês** convencional (`/api/inscricoes`, não `/api/registros`) — fica mais legível ao desenvolvedor
- Mensagens de erro do `raise ValueError` em **português** (vão direto pro usuário)

### JavaScript (frontend)

- **camelCase** para variáveis e funções
- Sem dependências externas — só Vanilla JS
- Sem build step — código já é o que roda
- `const` sobre `let`; `let` sobre `var` (que não usamos)
- Funções `async/await` em vez de `.then()`
- `escapeHtml(str)` antes de inserir conteúdo de usuário no DOM (proteção contra XSS)

### Geral

- Comentários em **português brasileiro**
- Mensagens visíveis ao usuário em **português brasileiro**
- Identificadores no banco em snake_case (`grupo_id`)
- Identificadores no JS em camelCase (`grupoId`)
- Tradução feita em `data.js` (camada de adaptação)

---

## 8. Como debugar problemas

### "A página não carrega"

1. Servidor está rodando? (janela do `start.bat` aberta sem erro?)
2. Console do navegador (F12) mostra algum erro vermelho?
3. Aba "Network" do DevTools — alguma requisição está dando 404 ou 500?

### "API retorna 401 Unauthorized"

- Token expirou (servidor reiniciou) — faça login de novo
- Token não está sendo enviado — confira em `Api.getToken()` no console
- Encerre a sessão, limpe o `sessionStorage` da aba e faça login novamente

### "API retorna 422 Unprocessable Entity"

- Body do request não passou na validação Pydantic
- A resposta tem `detail` com array dos erros — abra no DevTools
- Geralmente: campo faltando, formato errado (ex: data, username com caractere inválido)

### "API retorna 500 Internal Server Error"

- Bug no backend — a janela do `start.bat` vai mostrar o traceback
- Causas comuns: erro de SQL, NoneType, etc.

### "Mudei o modelo mas o banco não atualizou"

SQLAlchemy não migra automaticamente um esquema existente. Opções:
- Em produção (PostgreSQL/Neon), criar backup e aplicar uma migração versionada ou SQL revisado
- Localmente (SQLite), usar uma cópia de teste antes de qualquer `ALTER TABLE`
- Adotar Alembic para manter as próximas mudanças de esquema reproduzíveis

### "Funcionava ontem, hoje não"

- Confirme se o servidor local está em execução
- Se houver acesso remoto, confirme o proxy HTTPS, o certificado e o DNS
- Verifique os logs do proxy e do Uvicorn

### "Quero ver o banco direto"

Para o banco SQLite local:

```bash
sqlite3 backend/futsystem.db
.tables
SELECT * FROM inscricoes;
.quit
```

Ou abra com DB Browser for SQLite. Em produção, use o console ou uma conexão segura do Neon, sem copiar credenciais para comandos, documentos ou histórico do terminal.

### "Mudei o JS mas o navegador não atualizou"

Cache do service worker. Soluções:
1. **DevTools → Application → Service Workers → Unregister**
2. Ctrl+F5 (hard reload)
3. Modo anônimo / navegação privada

### "O front não fala com o back"

Console do navegador (F12) → procure mensagens de CORS ou de fetch falhando.

Possíveis causas:
- Backend não está rodando
- Frontend está em outra origem HTTPS e a detecção falhou → setar `window.API_BASE_URL` manualmente:
  ```html
  <script>window.API_BASE_URL = 'https://futsystem.exemplo.com';</script>
  ```
- Proxy HTTPS ou encaminhamento de origem configurado incorretamente

---

## 📚 Para aprofundar

- [FastAPI docs](https://fastapi.tiangolo.com/) — framework do backend
- [SQLAlchemy 2.0 docs](https://docs.sqlalchemy.org/en/20/) — ORM
- [Pydantic v2 docs](https://docs.pydantic.dev/) — validação
- [MDN Web Docs](https://developer.mozilla.org/pt-BR/) — HTML/CSS/JS

---

## 🆘 Outras documentações

- [README.md](README.md) — visão geral do projeto
- [INSTALACAO.md](INSTALACAO.md) — como instalar
- [OPERACAO.md](OPERACAO.md) — como operar no dia do evento
- [backend/README.md](backend/README.md) — referência técnica detalhada da API

**Boa sorte modificando o código!** 🚀
