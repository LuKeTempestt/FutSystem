"""Protecoes aplicadas antes de o FastAPI interpretar corpos JSON publicos."""
from typing import Awaitable, Callable

from fastapi import HTTPException
from fastapi.responses import JSONResponse

from . import auth


MAX_REQUEST_BODY_BYTES = 64 * 1024


class _RequestBodyTooLarge(Exception):
    pass


class RequestProtectionMiddleware:
    """Limita corpos e contabiliza tentativas antes do parsing/validacao."""

    def __init__(self, app, max_body_bytes: int = MAX_REQUEST_BODY_BYTES):
        self.app = app
        self.max_body_bytes = max_body_bytes

    async def __call__(self, scope: dict, receive: Callable[[], Awaitable[dict]], send) -> None:
        if scope.get("type") != "http":
            await self.app(scope, receive, send)
            return

        path = scope.get("path", "")
        method = scope.get("method", "").upper()
        ip = (scope.get("client") or ("desconhecido", 0))[0]

        if method == "POST":
            try:
                if path == "/api/auth/login":
                    auth.checar_rate_limit_login(ip)
                    auth.registrar_tentativa_login(ip)
                elif path == "/api/inscricoes":
                    auth.checar_rate_limit_registro(ip)
                    auth.registrar_tentativa_registro(ip)
            except HTTPException as exc:
                await JSONResponse(
                    status_code=exc.status_code,
                    content={"detail": exc.detail},
                    headers=exc.headers,
                )(scope, receive, send)
                return

        headers = {key.lower(): value for key, value in scope.get("headers", [])}
        content_length = headers.get(b"content-length")
        if content_length:
            try:
                if int(content_length) > self.max_body_bytes:
                    await self._reject(scope, receive, send)
                    return
            except ValueError:
                await JSONResponse(
                    status_code=400,
                    content={"detail": "Content-Length invalido."},
                )(scope, receive, send)
                return

        received = 0

        async def receive_limited() -> dict:
            nonlocal received
            message = await receive()
            if message.get("type") == "http.request":
                received += len(message.get("body", b""))
                if received > self.max_body_bytes:
                    raise _RequestBodyTooLarge
            return message

        try:
            await self.app(scope, receive_limited, send)
        except _RequestBodyTooLarge:
            await self._reject(scope, receive, send)

    @staticmethod
    async def _reject(scope: dict, receive, send) -> None:
        await JSONResponse(
            status_code=413,
            content={"detail": "Corpo da requisicao excede 64 KiB."},
        )(scope, receive, send)
