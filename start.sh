#!/usr/bin/env bash
# ============================================================
# Copa AVOSOS - Inicializador (Linux / macOS)
# ============================================================
set -e

cd "$(dirname "$0")"

echo ""
echo "===================================================="
echo "  COPA AVOSOS - Servidor do evento"
echo "===================================================="
echo ""

# Detecta Python
if command -v python3 >/dev/null 2>&1; then
    PY=python3
elif command -v python >/dev/null 2>&1; then
    PY=python
else
    echo "[ERRO] Python nao encontrado. Instale Python 3.10+ e tente novamente."
    exit 1
fi

# Cria venv na primeira execucao
if [ ! -d "backend/.venv" ]; then
    echo "Primeira execucao - criando ambiente virtual..."
    "$PY" -m venv backend/.venv
fi

# Ativa o venv
# shellcheck disable=SC1091
source backend/.venv/bin/activate

# Instala dependencias (silencioso)
echo "Verificando dependencias..."
python -m pip install --quiet --upgrade pip
python -m pip install --quiet -r backend/requirements.txt

# Solicita a senha sem exibi-la apenas quando o admin ainda nao existe.
python -m backend.bootstrap_admin
if [ -z "${FUTSYSTEM_REGISTRATION_CODE:-}" ]; then
    echo ""
    echo "Defina um codigo de convite com 8 a 64 caracteres."
    echo "Compartilhe-o apenas com participantes convidados."
    read -r -p "Codigo de convite: " FUTSYSTEM_REGISTRATION_CODE
    export FUTSYSTEM_REGISTRATION_CODE
fi
FUTSYSTEM_HOST="${FUTSYSTEM_HOST:-127.0.0.1}"

echo ""
echo "===================================================="
echo "  Servidor pronto!"
echo "===================================================="
echo ""
echo "  Acesse no MESMO computador:"
echo "    http://localhost:8001"
echo ""
echo "  Painel admin: http://localhost:8001/admin"
echo "  No primeiro inicio, escolha a senha do administrador."
echo "  Participantes precisam do codigo de convite informado neste inicio."
echo "  Documentacao API: /docs"
echo ""
echo "  Pressione Ctrl+C para encerrar"
echo "===================================================="
echo ""

# Tenta abrir o navegador automaticamente
( sleep 2; (xdg-open http://localhost:8001 || open http://localhost:8001) >/dev/null 2>&1 ) &

# Inicia o servidor
python -m uvicorn backend.main:app --host "$FUTSYSTEM_HOST" --port 8001
