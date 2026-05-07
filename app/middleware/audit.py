"""Middleware ASGI que popula el contexto de auditoría desde la request."""
from typing import Optional
from starlette.middleware.base import BaseHTTPMiddleware
from starlette.requests import Request
from starlette.responses import Response

from app.services.audit import set_audit_context, clear_audit_context


def _client_ip(request: Request) -> Optional[str]:
    fwd = request.headers.get("x-forwarded-for")
    if fwd:
        return fwd.split(",")[0].strip()
    if request.client:
        return request.client.host
    return None


class AuditContextMiddleware(BaseHTTPMiddleware):
    async def dispatch(self, request: Request, call_next) -> Response:
        # IP + UA siempre disponibles
        set_audit_context(
            ip=_client_ip(request),
            user_agent=request.headers.get("user-agent"),
        )
        # user_id / branch_id se completan dentro de los routers cuando se obtiene
        # el current_user — vía helper update_audit_user(user, branch_id).
        try:
            response = await call_next(request)
            return response
        finally:
            clear_audit_context()
