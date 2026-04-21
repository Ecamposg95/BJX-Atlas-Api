from __future__ import annotations

from datetime import datetime, timezone
from typing import Optional

from fastapi import APIRouter, Depends, HTTPException, Query, status
from sqlalchemy.exc import IntegrityError
from sqlalchemy import func, or_
from sqlalchemy.orm import Session

from app.database import get_db
from app.models.vehicles import Vehicle
from app.schemas.catalog import PaginatedResponse
from app.schemas.vehicles import VehicleCreate, VehicleRead, VehicleUpdate
from app.security import get_current_user, require_role

router = APIRouter(prefix="/vehicles", tags=["vehicles"])


def _vehicle_query(db: Session):
    return db.query(Vehicle).filter(Vehicle.deleted_at.is_(None))


def _normalize_lookup(value: Optional[str]) -> Optional[str]:
    return value.strip() if isinstance(value, str) else value


def _normalized_vehicle_data(payload: VehicleCreate | VehicleUpdate) -> dict:
    data = payload.model_dump(exclude_unset=True)
    for key, value in list(data.items()):
        if isinstance(value, str):
            cleaned = value.strip()
            data[key] = cleaned or None
    return data


def _find_duplicate_vehicle(db: Session, payload: VehicleCreate | VehicleUpdate, vehicle_id: Optional[str] = None):
    plates = _normalize_lookup(payload.plates)
    vin = _normalize_lookup(payload.vin)

    if plates:
        query = _vehicle_query(db).filter(
            func.lower(func.trim(Vehicle.plates)) == func.lower(func.trim(plates))
        )
        if vehicle_id:
            query = query.filter(Vehicle.id != vehicle_id)
        existing = query.first()
        if existing:
            return "plates", existing

    if vin:
        query = _vehicle_query(db).filter(
            func.lower(func.trim(Vehicle.vin)) == func.lower(func.trim(vin))
        )
        if vehicle_id:
            query = query.filter(Vehicle.id != vehicle_id)
        existing = query.first()
        if existing:
            return "vin", existing

    return None, None


def _duplicate_detail_from_payload(payload: VehicleCreate | VehicleUpdate) -> str:
    parts: list[str] = []
    if payload.plates:
        parts.append("plates")
    if payload.vin:
        parts.append("vin")
    if parts:
        joined = " y ".join(parts)
        return f"Ya existe un vehículo con {joined} duplicado"
    return "Ya existe un vehículo duplicado"


def _commit_vehicle_or_409(db: Session, payload: VehicleCreate | VehicleUpdate) -> None:
    try:
        db.commit()
    except IntegrityError as exc:
        db.rollback()
        message = str(getattr(exc, "orig", exc)).lower()
        is_duplicate = (
            "uq_vehicles_" in message
            or "unique constraint" in message
            or "unique failed" in message
        )
        if not is_duplicate:
            raise
        raise HTTPException(
            status_code=status.HTTP_409_CONFLICT,
            detail=_duplicate_detail_from_payload(payload),
        ) from exc


@router.get("", response_model=PaginatedResponse[VehicleRead])
def list_vehicles(
    page: int = Query(1, ge=1),
    size: int = Query(20, ge=1, le=200),
    search: Optional[str] = Query(None),
    active: Optional[bool] = Query(None),
    db: Session = Depends(get_db),
    _: object = Depends(get_current_user),
):
    query = _vehicle_query(db)

    if search:
        term = f"%{search}%"
        query = query.filter(
            or_(
                Vehicle.plates.ilike(term),
                Vehicle.vin.ilike(term),
                Vehicle.brand.ilike(term),
                Vehicle.model.ilike(term),
                Vehicle.customer_name.ilike(term),
            )
        )
    if active is not None:
        query = query.filter(Vehicle.active.is_(active))

    query = query.order_by(Vehicle.created_at.desc())

    total = query.count()
    records = query.offset((page - 1) * size).limit(size).all()
    return PaginatedResponse(
        items=[VehicleRead.model_validate(vehicle) for vehicle in records],
        total=total,
        page=page,
        size=size,
    )


@router.get("/{vehicle_id}", response_model=VehicleRead)
def get_vehicle(
    vehicle_id: str,
    db: Session = Depends(get_db),
    _: object = Depends(get_current_user),
):
    vehicle = _vehicle_query(db).filter(Vehicle.id == vehicle_id).first()
    if not vehicle:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Vehículo no encontrado")
    return VehicleRead.model_validate(vehicle)


@router.post("", response_model=VehicleRead, status_code=status.HTTP_201_CREATED)
def create_vehicle(
    payload: VehicleCreate,
    db: Session = Depends(get_db),
    _current_user: object = Depends(require_role(["admin", "operador"])),
):
    duplicate_field, existing = _find_duplicate_vehicle(db, payload)
    if existing:
        raise HTTPException(
            status_code=status.HTTP_409_CONFLICT,
            detail=f"Ya existe un vehículo con {duplicate_field} duplicada",
        )

    vehicle = Vehicle(**_normalized_vehicle_data(payload))
    db.add(vehicle)
    _commit_vehicle_or_409(db, payload)
    db.refresh(vehicle)
    return VehicleRead.model_validate(vehicle)


@router.put("/{vehicle_id}", response_model=VehicleRead)
def update_vehicle(
    vehicle_id: str,
    payload: VehicleUpdate,
    db: Session = Depends(get_db),
    _current_user: object = Depends(require_role(["admin", "operador"])),
):
    vehicle = _vehicle_query(db).filter(Vehicle.id == vehicle_id).first()
    if not vehicle:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Vehículo no encontrado")

    duplicate_field, existing = _find_duplicate_vehicle(db, payload, vehicle_id=vehicle_id)
    if existing:
        raise HTTPException(
            status_code=status.HTTP_409_CONFLICT,
            detail=f"Ya existe un vehículo con {duplicate_field} duplicada",
        )

    for field, value in _normalized_vehicle_data(payload).items():
        setattr(vehicle, field, value)

    _commit_vehicle_or_409(db, payload)
    db.refresh(vehicle)
    return VehicleRead.model_validate(vehicle)


@router.delete("/{vehicle_id}", status_code=status.HTTP_204_NO_CONTENT)
def delete_vehicle(
    vehicle_id: str,
    db: Session = Depends(get_db),
    _current_user: object = Depends(require_role(["admin"])),
):
    vehicle = _vehicle_query(db).filter(Vehicle.id == vehicle_id).first()
    if not vehicle:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Vehículo no encontrado")

    vehicle.deleted_at = datetime.now(timezone.utc)
    vehicle.active = False
    db.commit()
