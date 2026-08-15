"""
Script de inicializacao do backend.

Uso (a partir da pasta FutSystem):
    python -m backend.run
ou:
    cd backend && python run.py
"""
import sys
import os
from pathlib import Path

# Permite executar 'python backend/run.py' OU 'python run.py' de dentro de backend/
ROOT = Path(__file__).resolve().parent.parent
if str(ROOT) not in sys.path:
    sys.path.insert(0, str(ROOT))

import uvicorn

from backend.bootstrap_admin import preparar_admin

if __name__ == "__main__":
    preparar_admin()
    uvicorn.run(
        "backend.main:app",
        host=os.getenv("FUTSYSTEM_HOST", "127.0.0.1"),
        port=8001,
        reload=True,
    )
