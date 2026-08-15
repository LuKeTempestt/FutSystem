@echo off
chcp 65001 > nul
title Copa AVOSOS - Servidor
color 0A

echo.
echo ====================================================
echo   COPA AVOSOS - Servidor do evento
echo ====================================================
echo.

REM Verifica se o Python esta instalado
where python > nul 2>&1
if errorlevel 1 (
    echo [ERRO] Python nao foi encontrado nesta maquina.
    echo.
    echo Instale o Python 3.10 ou superior em:
    echo     https://www.python.org/downloads/
    echo Durante a instalacao, marque "Add Python to PATH".
    echo.
    pause
    exit /b 1
)

REM Cria o ambiente virtual na primeira execucao
if not exist "backend\.venv\Scripts\python.exe" (
    echo Primeira execucao detectada - preparando o ambiente...
    echo.
    python -m venv "backend\.venv"
    if errorlevel 1 (
        echo [ERRO] Falha ao criar o ambiente virtual.
        pause
        exit /b 1
    )
)

REM Ativa o venv
call "backend\.venv\Scripts\activate.bat"

REM Instala/atualiza as dependencias
echo Verificando dependencias...
python -m pip install --quiet --upgrade pip
python -m pip install --quiet -r "backend\requirements.txt"

REM Solicita a senha sem exibi-la apenas quando o admin ainda nao existe.
python -m backend.bootstrap_admin
if errorlevel 1 (
    echo [ERRO] Nao foi possivel preparar o administrador.
    pause
    exit /b 1
)

if not defined FUTSYSTEM_REGISTRATION_CODE (
    echo.
    echo Defina um codigo de convite com 8 a 64 caracteres.
    echo Compartilhe-o apenas com participantes convidados.
    set /p "FUTSYSTEM_REGISTRATION_CODE=Codigo de convite: "
)

if not defined FUTSYSTEM_HOST set "FUTSYSTEM_HOST=127.0.0.1"

echo.
echo ====================================================
echo   Servidor pronto!
echo ====================================================
echo.
echo   Acesse no MESMO computador:
echo     http://localhost:8001
echo.
echo   Painel admin: http://localhost:8001/admin
echo   No primeiro inicio, escolha a senha do administrador.
echo   Participantes precisam do codigo de convite informado neste inicio.
echo   Documentacao API: /docs
echo.
echo   Pressione Ctrl+C para encerrar
echo ====================================================
echo.

REM Abre o navegador apos 2 segundos (no segundo plano)
start "" cmd /c "timeout /t 2 /nobreak > nul && start http://localhost:8001"

REM Inicia o servidor
python -m uvicorn backend.main:app --host %FUTSYSTEM_HOST% --port 8001

pause
