"""Folio engine — generador secuencial seguro contra race conditions.

Estrategia portable Postgres + SQLite: fila por counter en `folio_counters`,
adquirida con `SELECT ... FOR UPDATE` en Postgres y por el lock implícito de
la transacción en SQLite (que serializa writes).

Uso:
    n = next_folio(db, "purchase_order_BJX-MAIN_2026")

El caller compone el formato final (ej. "PO-2026-0001").
"""
from __future__ import annotations

from sqlalchemy import select
from sqlalchemy.orm import Session

from app.models.folio_counters import FolioCounter


def next_folio(db: Session, counter_name: str) -> int:
    """Incrementa atómicamente el counter y devuelve el nuevo valor.

    - Postgres: usa `with_for_update()` para tomar row-level lock.
    - SQLite: el connection-level write lock serializa la operación; el
      `with_for_update()` se ignora silenciosamente.

    No abre ni cierra transacción: el caller controla el commit.
    """
    dialect = db.bind.dialect.name if db.bind is not None else ""
    stmt = select(FolioCounter).where(FolioCounter.name == counter_name)
    if dialect == "postgresql":
        stmt = stmt.with_for_update()
    counter = db.execute(stmt).scalar_one_or_none()
    if counter is None:
        counter = FolioCounter(name=counter_name, value=0)
        db.add(counter)
        db.flush()
    counter.value = (counter.value or 0) + 1
    db.flush()
    return counter.value
