# 🔧 Guia de Instalação — Copa AVOSOS

Este guia mostra **passo a passo** como instalar e rodar o sistema num computador novo (geralmente o da AVOSOS no dia do evento). Depois de instalado uma vez, basta dar **dois cliques** nas vezes seguintes.

> 🎮 Para usar o sistema no dia do evento (registrar partidas, etc), veja **[OPERACAO.md](OPERACAO.md)**.

---

## 📋 Checklist do que você precisa

- ✅ Computador com **Windows 10/11**, Linux ou macOS
- ✅ **Python 3.10 ou superior** instalado ([baixar aqui](https://www.python.org/downloads/))
- ✅ A pasta `FutSystem` completa (por download ou mídia confiável)
- ✅ Acesso ao próprio computador; acesso remoto exige um proxy HTTPS confiável

---

## 1️⃣ Instalando o Python (só uma vez na vida do computador)

### Windows

1. Baixe em <https://www.python.org/downloads/>
2. Abra o instalador
3. ⚠️ **MUITO IMPORTANTE** — marque a caixa **"Add Python to PATH"** na primeira tela
4. Clique em **"Install Now"** e aguarde terminar
5. Pronto

Para confirmar, abra o **Prompt de Comando** (Windows + R → digite `cmd`) e rode:

```
python --version
```

Deve mostrar algo como `Python 3.12.0`. Se aparecer "comando não encontrado", reinstale marcando "Add to PATH".

### Linux / macOS

A maioria das distros já vem com Python 3. Verifique:

```bash
python3 --version
```

Se não tiver: `sudo apt install python3 python3-venv` (Debian/Ubuntu) ou `brew install python` (macOS).

---

## 2️⃣ Copiando a pasta do projeto

Coloque a pasta `FutSystem` em um local fácil de achar — por exemplo:

- **Windows:** `C:\FutSystem\` ou na Área de Trabalho
- **Linux/macOS:** `/home/<seu-usuario>/FutSystem/`

Tudo o que o sistema precisa está dentro dessa pasta. **Não é preciso instalar nada manualmente** — o script `start.bat`/`start.sh` cuida disso.

---

## 3️⃣ Primeira execução (instalação automática)

### Windows

1. Entre na pasta `FutSystem`
2. **Dê duplo clique em `start.bat`**

Na primeira vez ele vai:
- Criar um ambiente virtual Python (pasta `backend/.venv`)
- Instalar automaticamente todas as bibliotecas (FastAPI, SQLAlchemy, Uvicorn, Pydantic…)
- Iniciar o servidor na porta 8001
- Abrir o navegador em `http://localhost:8001`

⏱️ Pode levar **2 a 5 minutos** nesta primeira execução. Nas próximas, abre em segundos.

> O servidor inicia somente em `localhost`; não é necessário liberar o Python no firewall para o uso local.

### Linux / macOS

```bash
cd FutSystem
chmod +x start.sh    # só na primeira vez
./start.sh
```

---

## 4️⃣ Acessar a aplicação

Abra `http://localhost:8001` no mesmo computador. Os scripts não expõem a
aplicação na Wi-Fi, pois HTTP aberto transmitiria senhas, tokens e dados pessoais
sem criptografia.

Para acesso em celulares ou outros computadores, use um proxy HTTPS com
certificado confiável. Somente nessa topologia defina `FUTSYSTEM_HOST` para o
endereço interno necessário. Não publique diretamente a porta 8001.

---

## 5️⃣ Primeiro acesso ao painel administrativo

1. No navegador, acesse `http://localhost:8001/admin/`
2. Use as **credenciais do primeiro acesso**:
   - **Usuário:** `admin`
   - **Senha:** a senha escolhida, sem eco no terminal, durante o primeiro início

> 🔐 **Troque essa senha o quanto antes!** Faça login e use a opção de trocar senha (rota `PUT /api/auth/senha`).

O inicializador também solicita um **código de convite** de 8 a 64 caracteres.
Somente participantes que receberem esse código conseguem criar cadastro. Em
execuções automatizadas, forneça-o pela variável `FUTSYSTEM_REGISTRATION_CODE`;
nunca grave o valor no repositório.

### Configurações iniciais recomendadas

No painel admin → **⚙️ Configurações do Evento**:

- 📅 **Data e hora do evento** — confira/ajuste
- 📍 **Local** — onde acontece
- 📱 **WhatsApp** e **e-mail** de contato (aparecem no rodapé e na página de Ajuda)
- 🚩 **Lista de grupos** — Brasil, Argentina, Portugal… (já vem com 8 padrão; edite/adicione/remova como quiser)
- ✅ **Inscrições abertas** — desmarque quando quiser fechar inscrições

---

## 6️⃣ Backup dos dados (importante!)

**Tudo está em um arquivo só:** `backend/futsystem.db`

### Fazer backup

1. Pare o servidor para produzir uma cópia consistente.
2. Copie `backend/futsystem.db` para um arquivo ou volume criptografado.
3. Armazene-o somente em espaço controlado pela organização, com MFA e acesso mínimo.
4. Guarde a chave de criptografia separadamente e teste a restauração periodicamente.
5. Defina prazo de retenção e apague cópias antigas com segurança.

> Nunca envie o banco por e-mail nem o coloque sem criptografia em nuvem ou
> mídia removível. Ele contém dados pessoais e hashes de senha.

### Restaurar um backup

1. **Pare o servidor** (Ctrl+C ou feche a janela do prompt)
2. Substitua o arquivo `backend/futsystem.db` pela versão antiga
3. Reinicie o servidor (duplo clique em `start.bat`)

### Zerar tudo

Com o servidor parado, **apague** o arquivo `backend/futsystem.db`. No próximo start, será recriado vazio e o sistema solicitará uma nova senha administrativa sem exibi-la.

> ⚠️ Cuidado: zerar é irreversível, exceto se você tiver backup.

---

## 7️⃣ Encerrando o servidor

- **Janela do prompt:** pressione **Ctrl + C** e confirme com **S**
- Ou **feche a janela** do prompt/terminal

Os dados ficam salvos no `futsystem.db` — nada se perde ao desligar.

---

## 🆘 Solução de problemas

### "Python não foi encontrado" ao rodar `start.bat`
→ Reinstale o Python marcando **"Add Python to PATH"** na primeira tela do instalador.

### "A porta 8001 já está em uso"
→ Outro programa está usando essa porta. No Prompt:
```
netstat -ano | findstr :8001
taskkill /F /PID <numero-mostrado>
```
Ou edite `start.bat` e mude `--port 8001` para outra porta (ex: `8080`).

### Outros dispositivos não conseguem acessar
Os scripts expõem o sistema apenas no computador local. Para acesso remoto,
configure um proxy HTTPS confiável e use a URL fornecida pela organização. Não
libere diretamente o `python.exe` ou a porta 8001 na rede.

### O navegador mostra "Esta conexão não é segura"
→ Não ignore o alerta em acesso remoto. Confirme o endereço e o certificado HTTPS
com a organização. Em `localhost`, use o endereço local informado pelos scripts.

### Esqueci a senha do admin
→ Não tem recuperação automática (intencional). **Opções:**
1. Se tiver outro admin: peça a ele para criar uma nova conta admin pra você
2. Pare o servidor, **apague `backend/futsystem.db`** e reinicie. Uma nova conta `admin` será criada após você escolher a senha, mas **você perde todos os dados** — restaure o backup depois se tiver

### Quero ver os logs em tempo real
→ A janela do `start.bat`/terminal mostra todas as requisições HTTP feitas ao servidor. Útil pra ver o que está sendo acessado em tempo real.

### Quero rodar em outra porta
→ Edite `start.bat` (Windows) ou `start.sh` (Linux) e mude `--port 8001`. Para acesso externo, publique somente por um proxy HTTPS confiável, com limite de corpo de requisição e configuração explícita de encaminhamento do IP do cliente. Não exponha a porta da aplicação diretamente.

---

## 🎒 Transferindo para o computador do evento

### O que transferir

```
FutSystem/                      ← copie esta pasta INTEIRA
├── start.bat                   ← Windows
├── start.sh                    ← Linux/macOS
├── index.html
├── ... (outros HTMLs)
├── css/
├── js/
├── backend/
│   ├── main.py
│   ├── ... (outros .py)
│   ├── requirements.txt
│   └── (o futsystem.db não acompanha o código)
├── manifest.json
├── service-worker.js
├── README.md
├── INSTALACAO.md               ← este guia
├── OPERACAO.md
└── ...
```

Transfira o código por um canal confiável. Se também precisar migrar os dados,
pare o servidor e leve o banco somente dentro de um arquivo ou volume
criptografado, com a chave enviada por canal separado. Não mantenha uma cópia
solta do `futsystem.db` na mídia.

### No computador do evento

1. **Cole** a pasta `FutSystem` no Desktop ou em `C:\`
2. Garanta que **Python 3.10+** está instalado (passo 1)
3. **Duplo clique em `start.bat`**
4. Aguarde a primeira instalação (alguns minutos)
5. Abra `http://localhost:8001`
6. ✅ Pronto para uso local seguro

---

## ✅ Checklist do dia do evento

- [ ] Computador ligado
- [ ] Pasta `FutSystem` no Desktop
- [ ] Duplo clique em `start.bat`
- [ ] Aguardar mensagem **"Servidor pronto!"**
- [ ] Confirmar o acesso local em `http://localhost:8001`
- [ ] Para outros dispositivos, confirmar que o proxy HTTPS está ativo
- [ ] Entrar no painel admin (`/admin/`) usando a senha escolhida no primeiro início
- [ ] Conferir **Configurações** (data, local, grupos)
- [ ] Definir **Embaixadores** dos grupos
- [ ] Compartilhar o link de inscrição com os participantes
- [ ] No fim do dia: criar um backup consistente, criptografado e com acesso restrito

> 📖 Para o passo a passo do que fazer no dia do evento (registrar partidas, gerar chaveamento, etc.), leia **[OPERACAO.md](OPERACAO.md)**.

---

Boa Copa! ⚽🏆
