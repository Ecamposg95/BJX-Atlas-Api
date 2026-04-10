from __future__ import annotations

import csv
import io
from datetime import datetime, timezone
from typing import Literal, Optional

from fastapi import APIRouter, Depends, HTTPException, Query, status
from fastapi.responses import StreamingResponse
from sqlalchemy import func
from sqlalchemy.orm import Session

from app.database import get_db
from app.models.catalog import ServiceCatalog, Service, VehicleModel
from app.models.quotes import Quote
from app.models.suppliers import SupplierPrice
from app.schemas.catalog import (
    CatalogImportResult,
    MissingCostItem,
    PaginatedResponse,
    ServiceCatalogRead,
    ServiceCatalogReadEnriched,
    ServiceCatalogUpdate,
    ServiceCreate,
    ServiceRead,
    ServiceUpdate,
    VehicleModelCreate,
    VehicleModelRead,
    VehicleModelUpdate,
)
from app.security import get_current_user, require_role

router = APIRouter(prefix="/catalog", tags=["catalog"])


# ---------------------------------------------------------------------------
# Helpers
# ---------------------------------------------------------------------------


def _service_count_for_model(db: Session, model_id: str) -> int:
    return (
        db.query(func.count(ServiceCatalog.id))
        .filter(ServiceCatalog.model_id == model_id, ServiceCatalog.is_current.is_(True))
        .scalar()
        or 0
    )


def _coverage_pct_for_service(db: Session, service_id: str) -> float:
    total_active_models: int = (
        db.query(func.count(VehicleModel.id))
        .filter(VehicleModel.active.is_(True), VehicleModel.deleted_at.is_(None))
        .scalar()
        or 0
    )
    if total_active_models == 0:
        return 0.0
    covered: int = (
        db.query(func.count(func.distinct(ServiceCatalog.model_id)))
        .join(VehicleModel, VehicleModel.id == ServiceCatalog.model_id)
        .filter(
            ServiceCatalog.service_id == service_id,
            ServiceCatalog.is_current.is_(True),
            VehicleModel.active.is_(True),
            VehicleModel.deleted_at.is_(None),
        )
        .scalar()
        or 0
    )
    return round(covered / total_active_models, 4)


def _extract_brand(name: str) -> str:
    """Return first word before ' - ' separator, or first word before a space."""
    if " - " in name:
        return name.split(" - ")[0].strip()
    return name.split(" ")[0].strip()


# ---------------------------------------------------------------------------
# VehicleModel endpoints
# ---------------------------------------------------------------------------


@router.get("/models", response_model=PaginatedResponse[VehicleModelRead])
def list_models(
    page: int = Query(1, ge=1),
    size: int = Query(20, ge=1, le=200),
    brand: Optional[str] = Query(None),
    active: Optional[bool] = Query(None),
    db: Session = Depends(get_db),
    _: object = Depends(get_current_user),
):
    query = db.query(VehicleModel).filter(VehicleModel.deleted_at.is_(None))

    if brand is not None:
        query = query.filter(VehicleModel.brand.ilike(f"%{brand}%"))
    if active is not None:
        query = query.filter(VehicleModel.active.is_(active))

    total: int = query.count()
    records = query.offset((page - 1) * size).limit(size).all()

    items: list[VehicleModelRead] = []
    for m in records:
        data = VehicleModelRead.model_validate(m)
        data.service_count = _service_count_for_model(db, m.id)
        items.append(data)

    return PaginatedResponse(items=items, total=total, page=page, size=size)


@router.get("/models/{model_id}", response_model=VehicleModelRead)
def get_model(
    model_id: str,
    db: Session = Depends(get_db),
    _: object = Depends(get_current_user),
):
    m = (
        db.query(VehicleModel)
        .filter(VehicleModel.id == model_id, VehicleModel.deleted_at.is_(None))
        .first()
    )
    if not m:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Modelo no encontrado")

    data = VehicleModelRead.model_validate(m)
    data.service_count = _service_count_for_model(db, m.id)
    return data


@router.post("/models", response_model=VehicleModelRead, status_code=status.HTTP_201_CREATED)
def create_model(
    payload: VehicleModelCreate,
    db: Session = Depends(get_db),
    current_user: object = Depends(require_role(["admin"])),
):
    # Case-insensitive uniqueness check
    existing = (
        db.query(VehicleModel)
        .filter(
            func.lower(VehicleModel.name) == payload.name.lower(),
            VehicleModel.deleted_at.is_(None),
        )
        .first()
    )
    if existing:
        raise HTTPException(
            status_code=status.HTTP_409_CONFLICT,
            detail=f"Ya existe un modelo con el nombre '{payload.name}'",
        )

    brand = payload.brand or _extract_brand(payload.name)

    m = VehicleModel(name=payload.name, brand=brand)
    db.add(m)
    db.commit()
    db.refresh(m)

    data = VehicleModelRead.model_validate(m)
    data.service_count = 0
    return data


@router.put("/models/{model_id}", response_model=VehicleModelRead)
def update_model(
    model_id: str,
    payload: VehicleModelUpdate,
    db: Session = Depends(get_db),
    current_user: object = Depends(require_role(["admin"])),
):
    m = (
        db.query(VehicleModel)
        .filter(VehicleModel.id == model_id, VehicleModel.deleted_at.is_(None))
        .first()
    )
    if not m:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Modelo no encontrado")

    update_data = payload.model_dump(exclude_unset=True)
    for field, value in update_data.items():
        setattr(m, field, value)

    db.commit()
    db.refresh(m)

    data = VehicleModelRead.model_validate(m)
    data.service_count = _service_count_for_model(db, m.id)
    return data


@router.delete("/models/{model_id}", status_code=status.HTTP_204_NO_CONTENT)
def delete_model(
    model_id: str,
    db: Session = Depends(get_db),
    current_user: object = Depends(require_role(["admin"])),
):
    m = (
        db.query(VehicleModel)
        .filter(VehicleModel.id == model_id, VehicleModel.deleted_at.is_(None))
        .first()
    )
    if not m:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Modelo no encontrado")

    # Check for active quotes
    active_quote = (
        db.query(Quote)
        .filter(Quote.model_id == model_id, Quote.status != "cancelled")
        .first()
    )
    if active_quote:
        raise HTTPException(
            status_code=status.HTTP_409_CONFLICT,
            detail="No se puede eliminar un modelo con cotizaciones activas",
        )

    m.deleted_at = datetime.now(timezone.utc)
    m.active = False
    db.commit()


# ---------------------------------------------------------------------------
# Service endpoints
# ---------------------------------------------------------------------------

_SORT_COLUMNS = {
    "name": Service.name,
    "category": Service.category,
}


@router.get("/services", response_model=PaginatedResponse[ServiceRead])
def list_services(
    page: int = Query(1, ge=1),
    size: int = Query(50, ge=1, le=200),
    search: Optional[str] = Query(None),
    category: Optional[str] = Query(None),
    active: Optional[bool] = Query(None),
    sort: Literal["name", "coverage_pct", "category"] = Query("name"),
    db: Session = Depends(get_db),
    _: object = Depends(get_current_user),
):
    query = db.query(Service).filter(Service.deleted_at.is_(None))

    if search:
        query = query.filter(Service.name.ilike(f"%{search}%"))
    if category:
        query = query.filter(Service.category == category)
    if active is not None:
        query = query.filter(Service.active.is_(active))

    # coverage_pct sort requires post-processing; for DB-level sort we handle "name" / "category"
    if sort in _SORT_COLUMNS:
        query = query.order_by(_SORT_COLUMNS[sort])

    total: int = query.count()
    records = query.offset((page - 1) * size).limit(size).all()

    items: list[ServiceRead] = []
    for svc in records:
        data = ServiceRead.model_validate(svc)
        data.coverage_pct = _coverage_pct_for_service(db, svc.id)
        items.append(data)

    if sort == "coverage_pct":
        items.sort(key=lambda x: x.coverage_pct, reverse=True)

    return PaginatedResponse(items=items, total=total, page=page, size=size)


@router.get("/services/{service_id}", response_model=ServiceRead)
def get_service(
    service_id: str,
    db: Session = Depends(get_db),
    _: object = Depends(get_current_user),
):
    svc = (
        db.query(Service)
        .filter(Service.id == service_id, Service.deleted_at.is_(None))
        .first()
    )
    if not svc:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Servicio no encontrado")

    data = ServiceRead.model_validate(svc)
    data.coverage_pct = _coverage_pct_for_service(db, svc.id)
    return data


@router.post("/services", response_model=ServiceRead, status_code=status.HTTP_201_CREATED)
def create_service(
    payload: ServiceCreate,
    db: Session = Depends(get_db),
    current_user: object = Depends(require_role(["admin"])),
):
    existing = (
        db.query(Service)
        .filter(
            func.lower(Service.name) == payload.name.lower(),
            Service.deleted_at.is_(None),
        )
        .first()
    )
    if existing:
        raise HTTPException(
            status_code=status.HTTP_409_CONFLICT,
            detail=f"Ya existe un servicio con el nombre '{payload.name}'",
        )

    svc = Service(name=payload.name, category=payload.category)
    db.add(svc)
    db.commit()
    db.refresh(svc)

    data = ServiceRead.model_validate(svc)
    data.coverage_pct = 0.0
    return data


@router.put("/services/{service_id}", response_model=ServiceRead)
def update_service(
    service_id: str,
    payload: ServiceUpdate,
    db: Session = Depends(get_db),
    current_user: object = Depends(require_role(["admin"])),
):
    svc = (
        db.query(Service)
        .filter(Service.id == service_id, Service.deleted_at.is_(None))
        .first()
    )
    if not svc:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Servicio no encontrado")

    update_data = payload.model_dump(exclude_unset=True)
    for field, value in update_data.items():
        setattr(svc, field, value)

    db.commit()
    db.refresh(svc)

    data = ServiceRead.model_validate(svc)
    data.coverage_pct = _coverage_pct_for_service(db, svc.id)
    return data


# ---------------------------------------------------------------------------
# Costs endpoints
# ---------------------------------------------------------------------------


@router.get("/costs/missing", response_model=list[MissingCostItem])
def get_missing_costs(
    db: Session = Depends(get_db),
    _: object = Depends(get_current_user),
):
    """
    Return model+service combos that have a SupplierPrice (is_current=True)
    but lack a ServiceCatalog entry with bjx_labor_cost OR bjx_parts_cost set.
    """
    # Subquery: combos that already have a complete BJX cost entry
    has_bjx = (
        db.query(ServiceCatalog.model_id, ServiceCatalog.service_id)
        .filter(
            ServiceCatalog.is_current.is_(True),
            ServiceCatalog.bjx_labor_cost.isnot(None),
            ServiceCatalog.bjx_parts_cost.isnot(None),
        )
        .subquery()
    )

    rows = (
        db.query(
            SupplierPrice.model_id,
            SupplierPrice.service_id,
            VehicleModel.name.label("model_name"),
            Service.name.label("service_name"),
        )
        .join(VehicleModel, VehicleModel.id == SupplierPrice.model_id)
        .join(Service, Service.id == SupplierPrice.service_id)
        .outerjoin(
            has_bjx,
            (has_bjx.c.model_id == SupplierPrice.model_id)
            & (has_bjx.c.service_id == SupplierPrice.service_id),
        )
        .filter(
            SupplierPrice.is_current.is_(True),
            has_bjx.c.model_id.is_(None),  # no matching complete BJX entry
        )
        .distinct()
        .all()
    )

    return [
        MissingCostItem(
            model_id=r.model_id,
            service_id=r.service_id,
            model_name=r.model_name,
            service_name=r.service_name,
        )
        for r in rows
    ]


@router.get("/costs/export")
def export_costs_csv(
    db: Session = Depends(get_db),
    _: object = Depends(get_current_user),
):
    """Return current catalog costs as a CSV file (StreamingResponse)."""
    rows = (
        db.query(
            VehicleModel.name.label("modelo"),
            Service.name.label("servicio"),
            ServiceCatalog.bjx_labor_cost,
            ServiceCatalog.bjx_parts_cost,
            ServiceCatalog.duration_hrs,
            ServiceCatalog.updated_at,
        )
        .join(VehicleModel, VehicleModel.id == ServiceCatalog.model_id)
        .join(Service, Service.id == ServiceCatalog.service_id)
        .filter(ServiceCatalog.is_current.is_(True))
        .order_by(VehicleModel.name, Service.name)
        .all()
    )

    output = io.StringIO()
    writer = csv.writer(output)
    writer.writerow(
        ["modelo", "servicio", "bjx_labor_cost", "bjx_parts_cost", "duration_hrs", "updated_at"]
    )
    for r in rows:
        writer.writerow(
            [
                r.modelo,
                r.servicio,
                r.bjx_labor_cost,
                r.bjx_parts_cost,
                r.duration_hrs,
                r.updated_at.isoformat() if r.updated_at else "",
            ]
        )

    output.seek(0)
    return StreamingResponse(
        iter([output.getvalue()]),
        media_type="text/csv",
        headers={"Content-Disposition": "attachment; filename=catalog_costs.csv"},
    )


@router.get("/costs", response_model=PaginatedResponse[ServiceCatalogReadEnriched])
def list_costs(
    page: int = Query(1, ge=1),
    size: int = Query(50, ge=1, le=200),
    model_id: Optional[str] = Query(None),
    service_id: Optional[str] = Query(None),
    db: Session = Depends(get_db),
    _: object = Depends(get_current_user),
):
    query = (
        db.query(
            ServiceCatalog,
            VehicleModel.name.label("model_name"),
            Service.name.label("service_name"),
        )
        .join(VehicleModel, VehicleModel.id == ServiceCatalog.model_id)
        .join(Service, Service.id == ServiceCatalog.service_id)
        .filter(ServiceCatalog.is_current.is_(True))
    )

    if model_id:
        query = query.filter(ServiceCatalog.model_id == model_id)
    if service_id:
        query = query.filter(ServiceCatalog.service_id == service_id)

    total: int = query.count()
    rows = query.offset((page - 1) * size).limit(size).all()

    items: list[ServiceCatalogReadEnriched] = []
    for sc, model_name, service_name in rows:
        data = ServiceCatalogReadEnriched.model_validate(sc)
        data.model_name = model_name
        data.service_name = service_name
        items.append(data)

    return PaginatedResponse(items=items, total=total, page=page, size=size)


@router.put("/costs/{model_id}/{service_id}", response_model=ServiceCatalogRead)
def update_cost(
    model_id: str,
    service_id: str,
    payload: ServiceCatalogUpdate,
    db: Session = Depends(get_db),
    current_user=Depends(require_role(["admin"])),
):
    """
    Immutable update: mark current record as is_current=False, then create a
    new record with is_current=True containing the updated values.
    """
    current_entry = (
        db.query(ServiceCatalog)
        .filter(
            ServiceCatalog.model_id == model_id,
            ServiceCatalog.service_id == service_id,
            ServiceCatalog.is_current.is_(True),
        )
        .first()
    )
    if not current_entry:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="No existe un registro de costo actual para esa combinación modelo/servicio",
        )

    # Retire current record
    current_entry.is_current = False

    # Build new record inheriting unchanged fields
    update_data = payload.model_dump(exclude_unset=True)
    new_entry = ServiceCatalog(
        model_id=model_id,
        service_id=service_id,
        bjx_labor_cost=update_data.get("bjx_labor_cost", current_entry.bjx_labor_cost),
        bjx_parts_cost=update_data.get("bjx_parts_cost", current_entry.bjx_parts_cost),
        duration_hrs=update_data.get("duration_hrs", current_entry.duration_hrs),
        source=update_data.get("source", current_entry.source),
        updated_by=current_user.email,
        is_current=True,
    )
    db.add(new_entry)
    db.commit()
    db.refresh(new_entry)

    return ServiceCatalogRead.model_validate(new_entry)
