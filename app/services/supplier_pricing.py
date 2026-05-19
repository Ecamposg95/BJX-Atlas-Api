"""Helper: rotación inmutable de SupplierPrice por (supplier_id, part_id).

Política:
- SupplierPrice es append-only. Para "actualizar" un precio se desmarca el
  vigente (is_current=False) y se crea un registro nuevo.
- Umbral default 0.5%: cambios menores no rotan (evita ruido por redondeo).
- Idempotente: si el is_current actual ya coincide con el nuevo costo dentro
  del umbral, no hace nada y devuelve None.
"""
from __future__ import annotations

from datetime import date
from typing import Optional

from sqlalchemy.orm import Session

from app.models.suppliers import SupplierPrice


_DEFAULT_TOLERANCE = 0.005  # 0.5 %


def rotate_supplier_price(
    db: Session,
    *,
    supplier_id: str,
    part_id: str,
    new_unit_cost: float,
    source: str = "manual",
    tolerance: float = _DEFAULT_TOLERANCE,
) -> Optional[SupplierPrice]:
    """Crea una nueva versión de SupplierPrice si el costo difiere > `tolerance`.

    Retorna el nuevo SupplierPrice creado, o None si el cambio es despreciable
    o si ya existía un precio vigente idéntico.
    """
    if new_unit_cost is None or new_unit_cost < 0:
        return None

    current = (
        db.query(SupplierPrice)
        .filter(
            SupplierPrice.supplier_id == supplier_id,
            SupplierPrice.part_id == part_id,
            SupplierPrice.is_current.is_(True),
        )
        .order_by(SupplierPrice.created_at.desc())
        .first()
    )

    if current is not None:
        previous_cost = float(current.total_price or 0.0)
        if previous_cost > 0:
            delta_pct = abs(new_unit_cost - previous_cost) / previous_cost
            if delta_pct <= tolerance:
                return None
        elif previous_cost == new_unit_cost:
            return None
        current.is_current = False

    new_price = SupplierPrice(
        supplier_id=supplier_id,
        part_id=part_id,
        ref_cost=new_unit_cost,
        labor_cost=0.0,
        total_price=new_unit_cost,
        price_date=date.today(),
        valid_from=date.today(),
        is_current=True,
        source=source,
    )
    db.add(new_price)
    db.flush()
    return new_price
