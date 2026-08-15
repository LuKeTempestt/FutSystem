# 🎮 Guia de Operação — Copa AVOSOS

Manual prático de como **usar o sistema no dia a dia e no dia do evento**. Voltado para a **equipe organizadora** (administradores).

> 🔧 Para **instalar** o sistema, veja [INSTALACAO.md](INSTALACAO.md).

---

## 📑 Índice

1. [Tipos de conta](#1-tipos-de-conta)
2. [Acessando o sistema](#2-acessando-o-sistema)
3. [Como participantes se inscrevem](#3-como-participantes-se-inscrevem)
4. [Painel administrativo — visão geral](#4-painel-administrativo--visão-geral)
5. [Fluxo completo de um campeonato](#5-fluxo-completo-de-um-campeonato)
6. [Gerenciando administradores](#6-gerenciando-administradores)
7. [Gerenciando inscrições](#7-gerenciando-inscrições)
8. [Gerenciando grupos](#8-gerenciando-grupos)
9. [Registrando partidas](#9-registrando-partidas)
10. [Gerando o chaveamento](#10-gerando-o-chaveamento)
11. [Prêmio Fair Play](#11-prêmio-fair-play)
12. [Configurações do evento](#12-configurações-do-evento)
13. [Backup e segurança dos dados](#13-backup-e-segurança-dos-dados)
14. [Perguntas frequentes da operação](#14-perguntas-frequentes-da-operação)

---

## 1. Tipos de conta

| Tipo | Quem é | O que pode fazer |
|---|---|---|
| 👤 **Usuário** (`role=user`) | Cada participante inscrito | Ver dados próprios, grupo, partidas, trocar senha |
| 🛡️ **Administrador** (`role=admin`) | Equipe organizadora (AVOSOS + UNIT) | TUDO — gerenciar inscrições, partidas, gerar chaveamento, criar outros admins, alterar configurações |

**Como a conta de cada um é criada:**

- 👤 **Usuário** → automaticamente, no momento em que a pessoa preenche o formulário de inscrição com o código de convite. WhatsApp + username + senha + dados pessoais.

Compartilhe o código de convite apenas com participantes autorizados. Ele deve
ter de 8 a 64 caracteres e é informado no início do servidor ou pela variável
`FUTSYSTEM_REGISTRATION_CODE`.
- 🛡️ **Admin** → manualmente, pelo painel admin. Só admins podem criar outros admins.

> ⚠️ **WhatsApp NÃO é mais o login.** O login é o `username` que o participante escolhe na inscrição. Vários inscritos podem usar o mesmo WhatsApp (irmãos sob o mesmo responsável, por exemplo).

---

## 2. Acessando o sistema

### URLs principais

No computador do servidor, use `http://localhost:8001`. Em outros dispositivos,
substitua `<URL-SEGURA>` pelo endereço HTTPS configurado pela organização.

| Página | URL | Quem usa |
|---|---|---|
| Site público | `<URL-SEGURA>/` | Todo mundo |
| Inscrição | `<URL-SEGURA>/inscricao.html` | Quem vai se inscrever |
| Login | `<URL-SEGURA>/login.html` | Qualquer pessoa com conta |
| Minha Área | `<URL-SEGURA>/minha-area.html` | Usuário logado |
| Campeonato | `<URL-SEGURA>/campeonato.html` | Todo mundo (visualização) |
| Álbum | `<URL-SEGURA>/album.html` | Todo mundo |
| **Painel Admin** | `<URL-SEGURA>/admin/` | Só admins |

### Primeiro login administrativo

- **Usuário:** `admin`
- **Senha:** a senha escolhida, sem eco no terminal, durante o primeiro início

> 🔒 Guarde a credencial em um gerenciador de senhas. Para redefini-la, execute `python -m backend.reset_admin`; nunca escreva a senha no comando.

---

## 3. Como participantes se inscrevem

A pessoa acessa `<URL-SEGURA>/inscricao.html` e preenche:

1. **Nome completo do participante**
2. **Data de nascimento**
3. **Nome do responsável legal** (para menores de 18)
4. **WhatsApp** de contato — pode ser do responsável; vários inscritos podem ter o mesmo
5. **Nome de usuário** — escolhido pelo participante (3-30 caracteres, letras minúsculas + números + `_`). Sugestão automática a partir do nome.
6. **Senha** — mínimo 8 caracteres
7. **Como soube do evento**
8. **Superpoder** (opcional) — para a figurinha
9. **Aceite LGPD** (obrigatório)

### O que acontece após o envio

- O sistema **valida tudo** (formato do username, senha, idade etc.)
- Verifica no servidor se o **username está disponível** ao enviar
- Cria a **inscrição** + a **conta de usuário** (vinculadas)
- **Já loga o participante automaticamente** e o redireciona para `minha-area.html`

### Verificação de username

O navegador valida o formato e o tamanho. A API confirma a disponibilidade somente no envio, sem expor uma consulta pública de usuários cadastrados.

---

## 4. Painel administrativo — visão geral

Acesse `/admin/` e entre com sua conta admin. Você verá um menu lateral com **8 seções**:

| Seção | Para quê |
|---|---|
| 📊 **Painel** | Dashboard com KPIs e alertas |
| 📝 **Inscrições** | Listar/excluir inscritos, exportar CSV |
| 👥 **Grupos** | Distribuir participantes, definir embaixadores |
| ⚽ **Partidas** | Registrar placares |
| 🏆 **Chaveamento** | Gerar fase eliminatória |
| 🏅 **Fair Play** | Definir o vencedor do prêmio |
| 🔐 **Administradores** | Criar/excluir admins, ver lista de usuários |
| ⚙️ **Configurações** | Editar data, local, grupos, contato |

> No mobile, o menu fica na barra horizontal superior.

---

## 5. Fluxo completo de um campeonato

Este é o **passo a passo de ponta a ponta** de um campeonato típico:

```
┌─────────────────────────────────────────────────────────────────┐
│                                                                 │
│   ANTES DO EVENTO          DURANTE O EVENTO        APÓS O EVENTO│
│   ──────────────────       ────────────────────     ────────────│
│                                                                 │
│   1. Configurar evento     5. Distribuir grupos     10. Backup  │
│   2. Definir grupos        6. Gerar partidas grp                │
│   3. Compartilhar link     7. Registrar placares                │
│   4. Aguardar inscrições   8. Gerar chaveamento                 │
│                            9. Eliminatórias                     │
│                            +Fair Play                           │
│                                                                 │
└─────────────────────────────────────────────────────────────────┘
```

### Detalhamento

**1. Configurar o evento** (uma vez, no início)
- ⚙️ Configurações → data/hora, local, WhatsApp, e-mail, lista de grupos

**2. Definir os embaixadores dos grupos**
- 👥 Grupos → para cada grupo, preencha o nome do embaixador (voluntário responsável)

**3. Compartilhar o link de inscrição**
- Compartilhe somente a URL **HTTPS** fornecida pelo proxy seguro da organização

**4. Aguardar inscrições**
- Acompanhe em 📊 Painel → cartão "Inscritos"

**5. Encerrar inscrições e distribuir nos grupos**
- ⚙️ Configurações → desmarque "Inscrições abertas"
- 👥 Grupos → clique em **"Distribuir aleatoriamente"** (ou faça manual)

**6. Gerar partidas da fase de grupos**
- 👥 Grupos → **"Gerar partidas dos grupos"** (cria todos contra todos)

**7. Registrar placares**
- ⚽ Partidas → para cada partida, clique em "Registrar" → informe placar

**8. Gerar chaveamento das eliminatórias**
- 🏆 Chaveamento → **"Gerar chaveamento das oitavas"**
- O sistema pega automaticamente os 2 melhores de cada grupo

**9. Eliminatórias**
- Continue registrando placares em ⚽ Partidas
- Quando uma fase termina, gere a próxima manualmente (oitavas → quartas → semi → final)

**10. Prêmio Fair Play e backup**
- 🏅 Fair Play → registre o vencedor com nome + motivo
- 💾 Crie um backup consistente em arquivo ou volume criptografado, conforme a seção 13

---

## 6. Gerenciando administradores

📍 **Painel admin → 🔐 Administradores**

### Criar novo admin

1. Vá na seção "Administradores"
2. No card **"Criar novo administrador"**:
   - Nome de usuário (3+ caracteres, mesmas regras de username)
   - Senha (4+ caracteres)
3. Clique em **"+ Criar administrador"**

A nova conta já pode fazer login imediatamente.

### Excluir admin

- Na tabela de admins existentes, clique em 🗑️ Remover
- ⚠️ **Você não pode excluir a si mesmo** (proteção contra trancar fora)

### Ver participantes (usuários)

A mesma seção tem uma tabela inferior com **"Usuários cadastrados (participantes)"** — lista todos os `role=user` (criados pela inscrição). Mostra username, inscrição vinculada e data de criação.

> Esta tabela é apenas para visualização — para excluir um participante, vá em **📝 Inscrições**.

---

## 7. Gerenciando inscrições

📍 **Painel admin → 📝 Inscrições**

### O que você vê

Tabela com todas as inscrições: Nome, Idade, Responsável, WhatsApp, Grupo, Ações.

### O que você pode fazer

- 🔍 **Buscar** por nome ou WhatsApp (campo de busca no topo)
- 🎯 **Filtrar** por grupo (dropdown ao lado)
- 🗑️ **Excluir** uma inscrição (também remove a conta de usuário associada)
- ⬇️ **Exportar CSV** — baixa um arquivo com todos os inscritos para abrir no Excel/Google Sheets

### O que NÃO está aqui (intencionalmente)

- Editar dados dos inscritos — o próprio participante pode editar em "Minha Área" (apenas a própria inscrição); admin pode alterar via API (`PUT /api/inscricoes/{id}`).
- Mudar o grupo do inscrito — isso é feito em **👥 Grupos** → "Distribuir participantes manualmente".

---

## 8. Gerenciando grupos

📍 **Painel admin → 👥 Grupos**

### Botões principais (topo)

- 🎲 **Distribuir aleatoriamente** — espalha todos os inscritos pelos grupos de forma aleatória (round-robin com embaralhamento). ⚠️ Substitui qualquer distribuição existente.
- ⚽ **Gerar partidas dos grupos** — cria todas as partidas (todos-contra-todos) dentro de cada grupo. ⚠️ Apaga partidas existentes!

### Card de cada grupo

Mostra:
- Nome do grupo (ex: "Grupo Brasil")
- Quantidade de participantes
- Campo para definir o **Embaixador** (voluntário responsável)
- Botão "Salvar" do embaixador

### Distribuição manual

Mais abaixo, uma tabela permite mover cada participante para o grupo desejado individualmente (dropdown ao lado de cada nome).

> Mudar grupo manualmente após gerar partidas pode causar inconsistências. Recomendado: distribuir → ajustar manualmente se preciso → SÓ ENTÃO gerar partidas.

---

## 9. Registrando partidas

📍 **Painel admin → ⚽ Partidas**

### O que você vê

Tabela com todas as partidas: Fase, Grupo, Jogador A, Placar, Jogador B, Status, Ação.

### Filtros

- **Status**: Todas / Pendentes / Concluídas
- **Fase**: Grupos / Oitavas / Quartas / Semi / Final

### Registrar um resultado

1. Localize a partida na lista
2. Clique em **"Registrar"** (ou **"Editar"** se já tem resultado)
3. No modal, informe o placar de cada jogador (0 a 99)
4. Clique em **"Salvar resultado"**

Ao salvar, a classificação do grupo é recalculada automaticamente.

### Critérios de desempate na classificação

Em ordem:
1. **Pontos** (3 vitória, 1 empate, 0 derrota)
2. **Saldo de gols** (gols pró - gols contra)
3. **Gols pró**
4. Alfabético do nome (último critério)

---

## 10. Gerando o chaveamento

📍 **Painel admin → 🏆 Chaveamento**

### Pré-requisitos

- ✅ Todas as partidas da fase de grupos devem estar **concluídas**
- ✅ Cada grupo precisa ter pelo menos 2 participantes

### Como funciona

O sistema:
1. Calcula a classificação final de cada grupo
2. Pega os **2 melhores de cada grupo** (1º e 2º colocados)
3. Faz o pareamento clássico: 1º de A vs 2º de B, 1º de B vs 2º de C, etc.
4. Determina a fase automaticamente baseado na quantidade de pares:
   - 5-8 pares → **Oitavas**
   - 3-4 pares → **Quartas**
   - 2 pares → **Semifinal**
   - 1 par → **Final**
5. Apaga partidas eliminatórias antigas (se houver)
6. Cria as novas partidas

> ⚠️ **A geração substitui partidas eliminatórias existentes**. Confirme antes de clicar.

### Quando passar de fase

Depois que todas as partidas da oitava acabarem, **clique de novo em "Gerar chaveamento"** — o sistema vai recriar a tabela com os classificados desta fase. Repita para quartas → semi → final.

> Hoje a geração só lida com 1º e 2º dos grupos. Para gerar oitavas → quartas → semi → final automaticamente em cascata baseado nos vencedores das eliminatórias, seria necessário ampliar a lógica do `crud.gerar_chaveamento()`. Atualmente, registre os vencedores e regere manualmente.

---

## 11. Prêmio Fair Play

📍 **Painel admin → 🏅 Fair Play**

### Definir o vencedor

1. Preencha o **Nome do vencedor**
2. Escreva o **Motivo** (texto curto explicando o gesto reconhecido)
3. Clique em **"Salvar Fair Play"**

Aparece em destaque na página do Campeonato (`/campeonato.html`).

### Atualizar durante o evento

Pode atualizar quantas vezes quiser. Sempre **substitui** o anterior (não há histórico de vencedores).

> Para manter um histórico de Fair Play, seria preciso transformar a tabela `fair_play` em multi-linha. Hoje é só uma linha.

---

## 12. Configurações do evento

📍 **Painel admin → ⚙️ Configurações**

Aqui você edita os dados gerais que aparecem no site:

| Campo | Onde aparece |
|---|---|
| **Nome do evento** | Título e mensagens |
| **Homenagem** | (Vazio por padrão — caso queira homenagear alguém) |
| **Data e hora** | Countdown da home + rodapé do site |
| **Local** | Badge na home + rodapé |
| **WhatsApp** | Rodapé + página de Ajuda |
| **E-mail** | Rodapé + Ajuda |
| **Endereço** | Rodapé |
| **Inscrições abertas** | Quando desmarcado, novas inscrições são bloqueadas (HTTP 403) |
| **Grupos disponíveis** | Lista de grupos (um por linha). Adicionar/remover ajusta no banco. |

### Zona de perigo

Botão **🗑️ Resetar tudo** — apaga inscrições, grupos, partidas e Fair Play. Mantém os admins. Confirme duas vezes.

---

## 13. Backup e segurança dos dados

### O arquivo do banco

Tudo está em **`backend/futsystem.db`**. Esse arquivo SQLite contém:
- Inscrições
- Usuários (admins + users)
- Grupos
- Partidas
- Configurações
- Fair Play

### Quando fazer backup

- ✅ Ao final do dia, antes de desligar
- ✅ Antes de qualquer operação grande (resetar, gerar chaveamento, etc.)
- ✅ Em momentos críticos (fim da fase de grupos, fim das oitavas)

### Como fazer backup

1. Pare o servidor com Ctrl+C ou feche a janela do prompt.
2. Copie `backend/futsystem.db` para um arquivo ou volume criptografado.
3. Armazene-o em espaço controlado pela organização, com MFA e acesso mínimo.
4. Guarde a chave de criptografia separadamente, verifique a restauração e reinicie o servidor.
5. Aplique um prazo de retenção e elimine cópias antigas com segurança.

> Não envie o banco por e-mail nem mantenha cópias sem criptografia em nuvem ou
> mídia removível.

### Como restaurar

1. Pare o servidor
2. Substitua `backend/futsystem.db` pela versão antiga
3. Reinicie o servidor

### Segurança das senhas

- Senhas são guardadas com **bcrypt e salt individual** — não em texto puro
- O bcrypt dificulta ataques offline, mas não torna senhas fracas irrecuperáveis; proteja o banco como dado sensível
- Tokens de login expiram quando o servidor é reiniciado
- Confirme a senha do administrador e guarde-a em um gerenciador de senhas

---

## 14. Perguntas frequentes da operação

### Como compartilhar o link com os participantes?

Use somente o endereço HTTPS configurado pela organização:

> Olá! Para se inscrever no Campeonato AVOSOS, acesse: https://evento.exemplo.org/inscricao.html

Gere o QR Code apenas depois de confirmar o certificado HTTPS e o endereço final.

### Já tenho inscritos. Preciso desligar o computador. E aí?

- Tudo bem desligar — os dados ficam salvos no `futsystem.db`
- Antes, crie um backup consistente em um arquivo ou volume criptografado e com acesso restrito
- Quando religar e rodar `start.bat` de novo, tudo volta como estava

### Como adicionar mais um grupo no meio do campeonato?

- ⚙️ Configurações → edite a lista de "Grupos disponíveis" (adicione uma linha)
- Salve
- ⚠️ Distribuir participantes vai dar trabalho — talvez seja melhor fazer manualmente em 👥 Grupos

### Posso excluir uma partida?

Não pelo painel atual. A partida pode ser **editada** (mudar placar) ou ser **regerada** apagando todas as partidas e clicando de novo em "Gerar partidas dos grupos". Para deletar uma partida específica, seria via API ou banco direto.

### Como gerar um novo admin que substitua o admin padrão?

1. Entre como admin padrão
2. 🔐 Administradores → crie novo admin com seu username/senha
3. Saia da conta
4. Entre com o novo admin
5. 🔐 Administradores → 🗑️ Remover o admin padrão

### Posso ter mais de um admin trabalhando ao mesmo tempo?

Sim. Cada admin tem token próprio. Mas cuidado com ações em paralelo (dois admins gerando chaveamento ao mesmo tempo, por exemplo) — pode dar inconsistência.

### O participante esqueceu a senha. E agora?

Hoje não há recuperação automática. Opções:
1. **Admin exclui a inscrição** → participante refaz com nova senha
2. Via API (avançado): `crud.trocar_senha(db, usuario_id, nova_senha)` direto no banco

Para o evento, considere ter um admin "de plantão" para esses casos.

### A partida já foi registrada, mas o placar estava errado. Posso corrigir?

Sim! ⚽ Partidas → clique em **"Editar"** na partida em questão → ajuste o placar → salvar. A classificação é recalculada automaticamente.

### Quero ver o que cada usuário tem acesso?

- 📊 Painel admin (apenas admin)
- 🪪 Minha Área (apenas user logado)
- 🌐 Páginas públicas (qualquer um)

A documentação interativa da API mostra cada rota e quem pode acessar: `http://localhost:8001/docs` no servidor.

---

## 🆘 Suporte

- 🔧 Problemas de instalação → [INSTALACAO.md](INSTALACAO.md)
- 💻 Detalhes técnicos / API → [backend/README.md](backend/README.md)
- 🧠 Mudar o código → [CODIGO.md](CODIGO.md)
- 📋 Visão geral do projeto → [README.md](README.md)

**Boa Copa AVOSOS!** ⚽🏆
