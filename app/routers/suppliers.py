from __future__ import annotations

import io
from datetime import date, datetime, timezone
from typing import Any, Optional

from fastapi import APIRouter, Depends, File, HTTPException, Query, UploadFile, status
from sqlalchemy import func
from sqlalchemy.orm import Session

from app.database import get_db
from app.models.catalog import Service, ServiceCatalog, VehicleModel
from app.models.config import ConfigParam
from app.models.suppliers import Supplier, SupplierPrice
from app.schemas.engine import CalculationInput, ScoringWeights, SupplierOption
from app.schemas.suppliers import (
    PriceImportResult,
    SupplierCreate,
    SupplierPriceCreate,
    SupplierPriceRead,
    SupplierPriceUpdate,
    SupplierRead,
    SupplierUpdate,
)
from app.security import get_current_user, require_role
from app.services.pricing_engine import PricingEngine
from app.services.supplier_engine import SupplierEngine

router = APIRouter(prefix="/suppliers", tags=["suppliers"])


# ---------------------------------------------------------------------------
# Internal helpers
# ---------------------------------------------------------------------------


def _get_supplier_or_404(supplier_id: str, db: Session) -> Supplier:
    supplier = (
        db.query(Supplier)
        .filter(Supplier.id == supplier_id, Supplier.deleted_at.is_(None))
        .first()
    )
    if not supplier:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Proveedor no encontrado",
        )
    return supplier


def _enrich_supplier(supplier: Supplier, db: Session) -> dict[str, Any]:
    """Compute aggregated price metrics for a single supplier."""
    base_filter = (
        db.query(SupplierPrice)
        .filter(
            SupplierPrice.supplier_id == supplier.id,
            SupplierPrice.is_current.is_(True),
        )
    )

    price_count: int = base_filter.count()
    model_coverage: int = (
        db.query(func.count(func.distinct(SupplierPrice.model_id)))
        .filter(
            SupplierPrice.supplier_id == supplier.id,
            SupplierPrice.is_current.is_(True),
        )
        .scalar()
        or 0
    )
    service_coverage: int = (
        db.query(func.count(func.distinct(SupplierPrice.service_id)))
        .filter(
            SupplierPrice.supplier_id == supplier.id,
            SupplierPrice.is_current.is_(True),
        )
        .scalar()
        or 0
    )
    avg_price_index: Optional[float] = (
        db.query(func.avg(SupplierPrice.total_price))
        .filter(
            SupplierPrice.supplier_id == supplier.id,
            SupplierPrice.is_current.is_(True),
        )
        .scalar()
    )

    data = {
        column.name: getattr(supplier, column.name)
        for column in supplier.__table__.columns
    }
    data["price_count"] = price_count
    data["model_coverage"] = model_coverage
    data["service_coverage"] = service_coverage
    data["avg_price_index"] = avg_price_index
    return data


def _parse_weights(weights_str: Optional[str], db: Session) -> ScoringWeights:
    """Parse 'price,time,tc' string into ScoringWeights. Falls back to DB config."""
    if weights_str is None:
        # Try to read from config_params
        row = db.query(ConfigParam).filter(ConfigParam.key == "supplier_weights").first()
        if row:
            weights_str = row.value
        else:
            weights_str = "50,30,20"

    try:
        parts = [float(x.strip()) for x in weights_str.split(",")]
        if len(parts) != 3:
            raise ValueError("Expected 3 values")
        total = sum(parts)
        return ScoringWeights(
            price_weight=parts[0] / total,
            time_weight=parts[1] / total,
            tc_weight=parts[2] / total,
        )
    except Exception:
        raise HTTPException(
            status_code=status.HTTP_422_UNPROCESSABLE_ENTITY,
            detail="El parámetro weights debe tener el formato '50,30,20'",
        )


# ---------------------------------------------------------------------------
# GET /suppliers/compare  — debe ir ANTES de GET /suppliers/{id}
# ---------------------------------------------------------------------------


@router.get("/compare")
def compare_suppliers(
    model_id: str = Query(...),
    service_id: str = Query(...),
    weights: Optional[str] = Query(default=None),
    db: Session = Depends(get_db),
    _user=Depends(get_current_user),
):
    """
    Compara todos los proveedores con precio vigente para un (model_id, service_id),
    aplica scoring ponderado y devuelve también el cálculo BJX para el proveedor #1.
    """
    # 1. Obtener precios vigentes con datos de proveedor
    prices = (
        db.query(SupplierPrice)
        .join(Supplier, Supplier.id == SupplierPrice.supplier_id)
        .filter(
            SupplierPrice.model_id == model_id,
            SupplierPrice.service_id == service_id,
            SupplierPrice.is_current.is_(True),
            Supplier.active.is_(True),
            Supplier.deleted_at.is_(None),
        )
        .all()
    )

    if not prices:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="No hay proveedores con precio vigente para este modelo y servicio",
        )

    # 2. Construir lista SupplierOption
    options: list[SupplierOption] = []
    for sp in prices:
        supplier: Supplier = sp.supplier
        options.append(
            SupplierOption(
                supplier_id=supplier.id,
                supplier_name=supplier.name,
                ref_cost=sp.ref_cost,
                labor_cost=sp.labor_cost,
                total_price=sp.total_price,
                lead_time_days=supplier.lead_time_days,
                warranty_days=supplier.warranty_days,
            )
        )

    # 3. Parsear pesos
    scoring_weights = _parse_weights(weights, db)

    # 4. Scoring
    scored = SupplierEngine().score(options, scoring_weights)

    # 5. Obtener modelo y servicio para nombres
    model_obj = db.query(VehicleModel).filter(VehicleModel.id == model_id).first()
    service_obj = db.query(Service).filter(Service.id == service_id).first()

    # 6. Cálculo BJX con proveedor rank=1
    best = next((s for s in scored if s.rank == 1), None)
    bjx_calculation = None
    if best:
        catalog_entry = (
            db.query(ServiceCatalog)
            .filter(
                ServiceCatalog.model_id == model_id,
                ServiceCatalog.service_id == service_id,
                ServiceCatalog.is_current.is_(True),
            )
            .first()
        )
        if catalog_entry:
            calc_input = CalculationInput(
                model_id=model_id,
                service_id=service_id,
                catalog_labor_cost=catalog_entry.bjx_labor_cost,
                catalog_parts_cost=catalog_entry.bjx_parts_cost,
                catalog_duration_hrs=catalog_entry.duration_hrs,
                brame_ref_actual=best.ref_cost,
                brame_total_actual=best.total_price,
            )
            bjx_calculation = PricingEngine().calculate(calc_input)

    return {
        "model_name": model_obj.name if model_obj else model_id,
        "service_name": service_obj.name if service_obj else service_id,
        "weights": {
            "price": scoring_weights.price_weight,
            "time": scoring_weights.time_weight,
            "tc": scoring_weights.tc_weight,
        },
        "suppliers": [s.model_dump() for s in scored],
        "bjx_calculation": bjx_calculation.model_dump() if bjx_calculation else None,
    }


# ---------------------------------------------------------------------------
# GET /suppliers
# ---------------------------------------------------------------------------


@router.get("", response_model=list[SupplierRead])
def list_suppliers(
    active: Optional[bool] = Query(default=None),
    db: Session = Depends(get_db),
    _user=Depends(get_current_user),
):
    query = db.query(Supplier).filter(Supplier.deleted_at.is_(None))

    if active is not None:
        query = query.filter(Supplier.active.is_(active))

    suppliers = query.order_by(Supplier.name).all()
    return [SupplierRead(**_enrich_supplier(s, db)) for s in suppliers]


# ---------------------------------------------------------------------------
# GET /suppliers/{id}
# ---------------------------------------------------------------------------


@router.get("/{supplier_id}", response_model=SupplierRead)
def get_supplier(
    supplier_id: str,
    db: Session = Depends(get_db),
    _user=Depends(get_current_user),
):
    supplier = _get_supplier_or_404(supplier_id, db)
    return SupplierRead(**_enrich_supplier(supplier, db))


# ---------------------------------------------------------------------------
# POST /suppliers
# ---------------------------------------------------------------------------


@router.post("", response_model=SupplierRead, status_code=status.HTTP_201_CREATED)
def create_supplier(
    payload: SupplierCreate,
    db: Session = Depends(get_db),
    _admin=Depends(require_role(["admin"])),
):
    # Validar nombre único (case-insensitive)
    existing = (
        db.query(Supplier)
        .filter(
            func.lower(Supplier.name) == payload.name.lower(),
            Supplier.deleted_at.is_(None),
        )
        .first()
    )
    if existing:
        raise HTTPException(
            status_code=status.HTTP_409_CONFLICT,
            detail="Ya existe un proveedor con ese nombre",
        )

    supplier = Supplier(**payload.model_dump())
    db.add(supplier)
    db.commit()
    db.refresh(supplier)
    return SupplierRead(**_enrich_supplier(supplier, db))


# ---------------------------------------------------------------------------
# PUT /suppliers/{id}
# ---------------------------------------------------------------------------


@router.put("/{supplier_id}", response_model=SupplierRead)
def update_supplier(
    supplier_id: str,
    payload: SupplierUpdate,
    db: Session = Depends(get_db),
    _admin=Depends(require_role(["admin"])),
):
    supplier = _get_supplier_or_404(supplier_id, db)

    update_data = payload.model_dump(exclude_none=True)

    # Si se actualiza el nombre, validar unicidad
    if "name" in update_data:
        conflict = (
            db.query(Supplier)
            .filter(
                func.lower(Supplier.name) == update_data["name"].lower(),
                Supplier.id != supplier_id,
                Supplier.deleted_at.is_(None),
            )
            .first()
        )
        if conflict:
            raise HTTPException(
                status_code=status.HTTP_409_CONFLICT,
                detail="Ya existe un proveedor con ese nombre",
            )

    for field, value in update_data.items():
        setattr(supplier, field, value)

    db.commit()
    db.refresh(supplier)
    return SupplierRead(**_enrich_supplier(supplier, db))


# ---------------------------------------------------------------------------
# DELETE /suppliers/{id}  — soft delete
# ---------------------------------------------------------------------------


@router.delete("/{supplier_id}", status_code=status.HTTP_204_NO_CONTENT)
def delete_supplier(
    supplier_id: str,
    db: Session = Depends(get_db),
    _admin=Depends(require_role(["admin"])),
):
    supplier = _get_supplier_or_404(supplier_id, db)

    # Verificar que no es el único proveedor activo con precios vigentes
    active_with_prices = (
        db.query(Supplier.id)
        .join(SupplierPrice, SupplierPrice.supplier_id == Supplier.id)
        .filter(
            Supplier.active.is_(True),
            Supplier.deleted_at.is_(None),
            SupplierPrice.is_current.is_(True),
        )
        .distinct()
        .count()
    )
    if active_with_prices <= 1:
        raise HTTPException(
            status_code=status.HTTP_409_CONFLICT,
            detail="No se puede desactivar el único proveedor activo con precios vigentes",
        )

    supplier.deleted_at = datetime.now(timezone.utc)
    supplier.active = False
    db.commit()


# ---------------------------------------------------------------------------
# GET /suppliers/{id}/prices
# ---------------------------------------------------------------------------


@router.get("/{supplier_id}/prices", response_model=list[SupplierPriceRead])
def list_supplier_prices(
    supplier_id: str,
    model_id: Optional[str] = Query(default=None),
    service_id: Optional[str] = Query(default=None),
    db: Session = Depends(get_db),
    _user=Depends(get_current_user),
):
    _get_supplier_or_404(supplier_id, db)

    query = (
        db.query(SupplierPrice, Service.name.label("service_name"), VehicleModel.name.label("model_name"))
        .join(Service, Service.id == SupplierPrice.service_id)
        .join(VehicleModel, VehicleModel.id == SupplierPrice.model_id)
        .filter(
            SupplierPrice.supplier_id == supplier_id,
            SupplierPrice.is_current.is_(True),
        )
    )

    if model_id:
        query = query.filter(SupplierPrice.model_id == model_id)
    if service_id:
        query = query.filter(SupplierPrice.service_id == service_id)

    rows = query.all()

    result = []
    for sp, svc_name, mdl_name in rows:
        data = {c.name: getattr(sp, c.name) for c in sp.__table__.columns}
        data["service_name"] = svc_name
        data["model_name"] = mdl_name
        data["price_change_pct"] = None
        result.append(SupplierPriceRead(**data))

    return result


# ---------------------------------------------------------------------------
# POST /suppliers/{id}/prices
# ---------------------------------------------------------------------------


@router.post(
    "/{supplier_id}/prices",
    response_model=SupplierPriceRead,
    status_code=status.HTTP_201_CREATED,
)
def create_supplier_price(
    supplier_id: str,
    payload: SupplierPriceCreate,
    db: Session = Depends(get_db),
    _admin=Depends(require_role(["admin"])),
):
    _get_supplier_or_404(supplier_id, db)

    # Si ya existe precio vigente para ese (supplier, model, service), marcar como no-vigente
    existing = (
        db.query(SupplierPrice)
        .filter(
            SupplierPrice.supplier_id == supplier_id,
            SupplierPrice.model_id == payload.model_id,
            SupplierPrice.service_id == payload.service_id,
            SupplierPrice.is_current.is_(True),
        )
        .first()
    )
    if existing:
        existing.is_current = False

    new_price = SupplierPrice(
        supplier_id=supplier_id,
        **payload.model_dump(),
        is_current=True,
    )
    db.add(new_price)
    db.commit()
    db.refresh(new_price)

    # Enriquecer con nombres
    svc = db.query(Service).filter(Service.id == new_price.service_id).first()
    mdl = db.query(VehicleModel).filter(VehicleModel.id == new_price.model_id).first()

    data = {c.name: getattr(new_price, c.name) for c in new_price.__table__.columns}
    data["service_name"] = svc.name if svc else ""
    data["model_name"] = mdl.name if mdl else ""
    data["price_change_pct"] = None
    return SupplierPriceRead(**data)


# ---------------------------------------------------------------------------
# PUT /suppliers/{id}/prices/{price_id}  — INMUTABLE: crea nueva versión
# ---------------------------------------------------------------------------


@router.put(
    "/{supplier_id}/prices/{price_id}",
    response_model=SupplierPriceRead,
)
def update_supplier_price(
    supplier_id: str,
    price_id: str,
    payload: SupplierPriceUpdate,
    db: Session = Depends(get_db),
    _admin=Depends(require_role(["admin"])),
):
    _get_supplier_or_404(supplier_id, db)

    current_price = (
        db.query(SupplierPrice)
        .filter(
            SupplierPrice.id == price_id,
            SupplierPrice.supplier_id == supplier_id,
        )
        .first()
    )
    if not current_price:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Precio no encontrado",
        )

    # Marcar el actual como no vigente
    current_price.is_current = False

    # Construir nuevo registro con los valores actualizados
    update_data = payload.model_dump(exclude_none=True)
    new_price = SupplierPrice(
        supplier_id=current_price.supplier_id,
        service_id=current_price.service_id,
        model_id=current_price.model_id,
        ref_cost=update_data.get("ref_cost", current_price.ref_cost),
        labor_cost=update_data.get("labor_cost", current_price.labor_cost),
        total_price=update_data.get("total_price", current_price.total_price),
        price_date=update_data.get("price_date", current_price.price_date),
        is_current=True,
    )
    db.add(new_price)
    db.commit()
    db.refresh(new_price)

    svc = db.query(Service).filter(Service.id == new_price.service_id).first()
    mdl = db.query(VehicleModel).filter(VehicleModel.id == new_price.model_id).first()

    data = {c.name: getattr(new_price, c.name) for c in new_price.__table__.columns}
    data["service_name"] = svc.name if svc else ""
    data["model_name"] = mdl.name if mdl else ""
    data["price_change_pct"] = None
    return SupplierPriceRead(**data)


# ---------------------------------------------------------------------------
# GET /suppliers/{id}/prices/history/{model_id}/{service_id}
# ---------------------------------------------------------------------------


@router.get(
    "/{supplier_id}/prices/history/{model_id}/{service_id}",
    response_model=list[SupplierPriceRead],
)
def get_price_history(
    supplier_id: str,
    model_id: str,
    service_id: str,
    db: Session = Depends(get_db),
    _user=Depends(get_current_user),
):
    _get_supplier_or_404(supplier_id, db)

    rows = (
        db.query(SupplierPrice)
        .filter(
            SupplierPrice.supplier_id == supplier_id,
            SupplierPrice.model_id == model_id,
            SupplierPrice.service_id == service_id,
        )
        .order_by(SupplierPrice.created_at.desc())
        .limit(12)
        .all()
    )

    svc = db.query(Service).filter(Service.id == service_id).first()
    mdl = db.query(VehicleModel).filter(VehicleModel.id == model_id).first()

    result: list[SupplierPriceRead] = []
    for i, sp in enumerate(rows):
        data = {c.name: getattr(sp, c.name) for c in sp.__table__.columns}
        data["service_name"] = svc.name if svc else ""
        data["model_name"] = mdl.name if mdl else ""

        # price_change_pct vs el registro siguiente (más antiguo en la lista ordenada DESC)
        if i + 1 < len(rows):
            prev = rows[i + 1]
            if prev.total_price and prev.total_price != 0:
                data["price_change_pct"] = (
                    (sp.total_price - prev.total_price) / prev.total_price
                )
            else:
                data["price_change_pct"] = None
        else:
            data["price_change_pct"] = None

        result.append(SupplierPriceRead(**data))

    return result


# ---------------------------------------------------------------------------
# POST /suppliers/{id}/prices/import
# ---------------------------------------------------------------------------


@router.post(
    "/{supplier_id}/prices/import",
    response_model=PriceImportResult,
    status_code=status.HTTP_200_OK,
)
async def import_supplier_prices(
    supplier_id: str,
    file: UploadFile = File(...),
    db: Session = Depends(get_db),
    _admin=Depends(require_role(["admin"])),
):
    _get_supplier_or_404(supplier_id, db)

    try:
        import openpyxl
    except ImportError:
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail="openpyxl no está instalado en el servidor",
        )

    contents = await file.read()
    try:
        wb = openpyxl.load_workbook(io.BytesIO(contents), data_only=True)
    except Exception:
        raise HTTPException(
            status_code=status.HTTP_422_UNPROCESSABLE_ENTITY,
            detail="No se pudo leer el archivo XLSX. Verifique el formato.",
        )

    ws = wb.active
    rows_iter = ws.iter_rows(min_row=2, values_only=True)  # row 1 = headers

    imported = 0
    skipped = 0
    errors: list[dict] = []

    for row_idx, row in enumerate(rows_iter, start=2):
        # Esperado: model_id, service_id, ref_cost, labor_cost, total_price, price_date (opcional)
        try:
            if not row or all(v is None for v in row):
                skipped += 1
                continue

            model_id_val = str(row[0]).strip() if row[0] is not None else None
            service_id_val = str(row[1]).strip() if row[1] is not None else None
            ref_cost_val = row[2]
            labor_cost_val = row[3] if row[3] is not None else 0.0
            total_price_val = row[4]
            price_date_val = row[5] if len(row) > 5 else None

            if not model_id_val or not service_id_val:
                errors.append({"row": row_idx, "reason": "model_id y service_id son requeridos"})
                continue

            if ref_cost_val is None or total_price_val is None:
                errors.append({"row": row_idx, "reason": "ref_cost y total_price son requeridos"})
                continue

            try:
                ref_cost_val = float(ref_cost_val)
                labor_cost_val = float(labor_cost_val)
                total_price_val = float(total_price_val)
            except (TypeError, ValueError):
                errors.append({"row": row_idx, "reason": "ref_cost, labor_cost o total_price no son numéricos"})
                continue

            # Parsear price_date
            parsed_date: Optional[date] = None
            if price_date_val is not None:
                if isinstance(price_date_val, datetime):
                    parsed_date = price_date_val.date()
                elif isinstance(price_date_val, date):
                    parsed_date = price_date_val
                else:
                    try:
                        parsed_date = date.fromisoformat(str(price_date_val))
                    except ValueError:
                        parsed_date = None

            # Upsert: marcar vigente anterior como no-vigente y crear nuevo
            existing = (
                db.query(SupplierPrice)
                .filter(
                    SupplierPrice.supplier_id == supplier_id,
                    SupplierPrice.model_id == model_id_val,
                    SupplierPrice.service_id == service_id_val,
                    SupplierPrice.is_current.is_(True),
                )
                .first()
            )

            if existing:
                # Si los valores son idénticos, saltar
                if (
                    existing.ref_cost == ref_cost_val
                    and existing.labor_cost == labor_cost_val
                    and existing.total_price == total_price_val
                ):
                    skipped += 1
                    continue
                existing.is_current = False

            new_price = SupplierPrice(
                supplier_id=supplier_id,
                model_id=model_id_val,
                service_id=service_id_val,
                ref_cost=ref_cost_val,
                labor_cost=labor_cost_val,
                total_price=total_price_val,
                price_date=parsed_date,
                is_current=True,
            )
            db.add(new_price)
            imported += 1

        except Exception as exc:
            errors.append({"row": row_idx, "reason": str(exc)})

    db.commit()

    return PriceImportResult(
        imported=imported,
        skipped=skipped,
        errors=[{"row": e["row"], "reason": e["reason"]} for e in errors],
    )
