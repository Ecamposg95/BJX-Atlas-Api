"""Folio counters — secuencia portable Postgres/SQLite.

Cada `name` representa un namespace (ej. "purchase_order_<branch_code>_<year>").
El incremento se hace con `SELECT ... FOR UPDATE` (Postgres) o lock implícito
de la transacción en SQLite. Ver `app/services/folio_engine.py`.
"""
from __future__ import annotations

from sqlalchemy import Column, Integer, String

from app.database import Base


class FolioCounter(Base):
    __tablename__ = "folio_counters"

    name = Column(String(128), primary_key=True)
    value = Column(Integer, nullable=False, default=0)
