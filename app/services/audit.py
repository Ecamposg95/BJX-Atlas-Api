"""Audit logging cross-cutting.

Captura inserts/updates/deletes via SQLAlchemy event listeners y persiste
en `audit_logs`. El `branch_id`, `user_id`, `ip` y `user_agent` se inyectan
desde un context-var por request (poblado por `audit_middleware`).
"""
from __future__ import annotations

import contextvars
from datetime import datetime, timezone
from typing import Any, Optional

from sqlalchemy import event
from sqlalchemy.orm import Session
from sqlalchemy.inspection import inspect as sa_inspect

from app.models.audit import AuditLog
from app.models.organizations import Branch, Organization

# Tablas que NO debemos auditar (evitar recursión y ruido)
_EXCLUDED_TABLES = {
    "audit_logs",
    "alembic_version",
    "config_history",  # ya tiene su propio historial
}


class _Ctx:
    user_id: Optional[str] = None
    user_email: Optional[str] = None
    branch_id: Optional[str] = None
    ip: Optional[str] = None
    user_agent: Optional[str] = None


_audit_ctx: contextvars.ContextVar[_Ctx] = contextvars.ContextVar("audit_ctx", default=_Ctx())


def set_audit_context(
    *,
    user_id: Optional[str] = None,
    user_email: Optional[str] = None,
    branch_id: Optional[str] = None,
    ip: Optional[str] = None,
    user_agent: Optional[str] = None,
) -> None:
    ctx = _Ctx()
    ctx.user_id = user_id
    ctx.user_email = user_email
    ctx.branch_id = branch_id
    ctx.ip = ip
    ctx.user_agent = user_agent
    _audit_ctx.set(ctx)


def clear_audit_context() -> None:
    _audit_ctx.set(_Ctx())


def _serialize(value: Any) -> Any:
    """Convierte valores SQLAlchemy a JSON-friendly."""
    if value is None or isinstance(value, (str, int, float, bool)):
        return value
    if isinstance(value, datetime):
        return value.isoformat()
    return str(value)


def _row_to_dict(target: Any) -> dict:
    state = sa_inspect(target)
    cols = state.mapper.columns
    return {c.key: _serialize(getattr(target, c.key, None)) for c in cols}


def _record_branch_id(target: Any) -> Optional[str]:
    return getattr(target, "branch_id", None)


def _record_id(target: Any) -> Optional[str]:
    return getattr(target, "id", None)


def _enqueue_log(session: Session, action: str, target: Any, old: Optional[dict], new: Optional[dict]) -> None:
    table = target.__tablename__
    if table in _EXCLUDED_TABLES:
        return
    ctx = _audit_ctx.get()
    log = AuditLog(
        branch_id=_record_branch_id(target) or ctx.branch_id,
        user_id=ctx.user_id,
        user_email=ctx.user_email,
        action=action,
        table_name=table,
        record_id=_record_id(target),
        old_data=old,
        new_data=new,
        ip=ctx.ip,
        user_agent=ctx.user_agent,
        created_at=datetime.now(timezone.utc),
    )
    # Append directo a la sesión actual — se commitea en el mismo flush.
    session.add(log)


def _on_after_insert(mapper, connection, target):
    # No podemos abrir sesión nueva aquí — usamos el connection actual
    pass  # ver after_flush abajo


def _on_after_update(mapper, connection, target):
    pass


def _on_after_delete(mapper, connection, target):
    pass


# Estrategia: usar before_flush para capturar pending changes con sus old_data
# y agregar AuditLog a la session ANTES del flush, para que se persistan en el mismo commit.

def _on_before_flush(session: Session, flush_context, instances) -> None:
    new_logs = []
    for obj in list(session.new):
        if isinstance(obj, AuditLog):
            continue
        if not hasattr(obj, "__tablename__"):
            continue
        if obj.__tablename__ in _EXCLUDED_TABLES:
            continue
        log = _build_log("insert", obj, old=None, new=_row_to_dict(obj))
        if log is not None:
            new_logs.append(log)

    for obj in list(session.dirty):
        if isinstance(obj, AuditLog):
            continue
        if not hasattr(obj, "__tablename__"):
            continue
        if obj.__tablename__ in _EXCLUDED_TABLES:
            continue
        if not session.is_modified(obj, include_collections=False):
            continue
        old = _build_old_data(obj)
        new = _row_to_dict(obj)
        # Si la única diferencia es deleted_at→ahora, registrarlo como delete (soft-delete)
        action = "update"
        if old is not None and old.get("deleted_at") is None and new.get("deleted_at") is not None:
            action = "delete"
        log = _build_log(action, obj, old=old, new=new)
        if log is not None:
            new_logs.append(log)

    for obj in list(session.deleted):
        if isinstance(obj, AuditLog):
            continue
        if not hasattr(obj, "__tablename__"):
            continue
        if obj.__tablename__ in _EXCLUDED_TABLES:
            continue
        log = _build_log("delete", obj, old=_row_to_dict(obj), new=None)
        if log is not None:
            new_logs.append(log)

    for log in new_logs:
        session.add(log)


def _build_old_data(obj: Any) -> Optional[dict]:
    """Lee los attrs originales (antes del set actual) usando SQLAlchemy state."""
    state = sa_inspect(obj)
    if state is None:
        return None
    old: dict = {}
    for attr in state.attrs:
        hist = attr.load_history() if hasattr(attr, "load_history") else attr.history
        if hist.has_changes() and hist.deleted:
            old[attr.key] = _serialize(hist.deleted[0])
        else:
            # No cambió → valor actual
            old[attr.key] = _serialize(getattr(obj, attr.key, None))
    return old


def _build_log(action: str, target: Any, old: Optional[dict], new: Optional[dict]) -> Optional[AuditLog]:
    ctx = _audit_ctx.get()
    return AuditLog(
        branch_id=getattr(target, "branch_id", None) or ctx.branch_id,
        user_id=ctx.user_id,
        user_email=ctx.user_email,
        action=action,
        table_name=target.__tablename__,
        record_id=getattr(target, "id", None),
        old_data=old,
        new_data=new,
        ip=ctx.ip,
        user_agent=ctx.user_agent,
        created_at=datetime.now(timezone.utc),
    )


_REGISTERED = False


def install_audit_listeners() -> None:
    global _REGISTERED
    if _REGISTERED:
        return
    event.listen(Session, "before_flush", _on_before_flush)
    _REGISTERED = True
