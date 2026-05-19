"""Customer scoping helpers — Ola 5.

El rol `cliente_corp` solo puede ver las OS cuyo `customer_id` coincida con
`user.customer_id`. El scoping de sucursal (`branch_id`) lo gestiona
`app/security/tenant.py`; este módulo es el complemento por customer.

Uso típico en routers:
    q = db.query(WorkOrder)
    q = apply_customer_scope(q, current_user, WorkOrder)
    rows = q.all()
"""
from __future__ import annotations

from typing import Any

from sqlalchemy.orm import Query

from app.models.users import Role, User
from app.security import _role_value


def is_corporate_client(user: User) -> bool:
    return _role_value(user.role) == Role.cliente_corp.value


def apply_customer_scope(query: Query, user: User, model: Any) -> Query:
    """Filtra `query` por `model.customer_id == user.customer_id` cuando el
    usuario es `cliente_corp`. Los demás roles no se ven afectados.

    Si el `cliente_corp` no tiene `customer_id` asignado, se devuelve una
    query vacía (`.filter(False)`) para evitar fugas accidentales.
    """
    if not is_corporate_client(user):
        return query
    if not hasattr(model, "customer_id"):
        return query
    customer_id = getattr(user, "customer_id", None)
    if not customer_id:
        return query.filter(False)
    return query.filter(model.customer_id == customer_id)
