from __future__ import annotations

from fastapi import APIRouter, Depends, HTTPException, status
from sqlalchemy.orm import Session

from app.database import get_db
from app.models.config import ConfigHistory, ConfigParam
from app.schemas.config import ConfigHistoryRead, ConfigParamRead, ConfigParamUpdate
from app.security import get_current_user, require_role

router = APIRouter(prefix="/config", tags=["config"])

# ---------------------------------------------------------------------------
# Validation helpers
# ---------------------------------------------------------------------------

_WEIGHT_KEYS = {"scoring_weight_price", "scoring_weight_time", "scoring_weight_tc"}


def _validate_value(key: str, raw_value: str, db: Session) -> None:
    """Raise HTTPException(422) if the value does not meet the business rules."""
    try:
        fval = float(raw_value)
    except ValueError:
        raise HTTPException(
            status_code=status.HTTP_422_UNPROCESSABLE_ENTITY,
            detail=f"El valor de '{key}' debe ser numérico",
        )

    if key == "technician_cost_hr":
        if fval <= 0:
            raise HTTPException(
                status_code=status.HTTP_422_UNPROCESSABLE_ENTITY,
                detail="technician_cost_hr debe ser mayor a 0",
            )

    elif key == "target_margin":
        if not (0.01 <= fval <= 0.99):
            raise HTTPException(
                status_code=status.HTTP_422_UNPROCESSABLE_ENTITY,
                detail="target_margin debe estar entre 0.01 y 0.99",
            )

    elif key == "iva_rate":
        if not (0.0 <= fval <= 0.30):
            raise HTTPException(
                status_code=status.HTTP_422_UNPROCESSABLE_ENTITY,
                detail="iva_rate debe estar entre 0.0 y 0.30",
            )

    elif key == "overhead_rate":
        if not (0.0 <= fval <= 0.50):
            raise HTTPException(
                status_code=status.HTTP_422_UNPROCESSABLE_ENTITY,
                detail="overhead_rate debe estar entre 0.0 y 0.50",
            )

    elif key in _WEIGHT_KEYS:
        # Fetch the other two weights from DB and verify the three sum to 1.0
        other_keys = _WEIGHT_KEYS - {key}
        other_params = (
            db.query(ConfigParam).filter(ConfigParam.key.in_(other_keys)).all()
        )
        other_values: dict[str, float] = {p.key: float(p.value) for p in other_params}

        # Use default 0.0 if a key hasn't been persisted yet
        total = fval + sum(other_values.get(k, 0.0) for k in other_keys)
        if abs(total - 1.0) > 1e-6:
            raise HTTPException(
                status_code=status.HTTP_422_UNPROCESSABLE_ENTITY,
                detail=(
                    f"Los scoring weights deben sumar 1.0. "
                    f"Con '{key}'={fval} y los demás ({other_values}) la suma es {round(total, 6)}"
                ),
            )


# ---------------------------------------------------------------------------
# Endpoints
# ---------------------------------------------------------------------------


@router.get("", response_model=list[ConfigParamRead])
def list_config(
    db: Session = Depends(get_db),
    _: object = Depends(get_current_user),
):
    """Lista todos los parámetros de configuración ordenados por key."""
    params = db.query(ConfigParam).order_by(ConfigParam.key).all()
    return [ConfigParamRead.model_validate(p) for p in params]


@router.put("/{key}", response_model=ConfigParamRead)
def update_config(
    key: str,
    payload: ConfigParamUpdate,
    db: Session = Depends(get_db),
    current_user=Depends(require_role(["admin"])),
):
    """Actualiza el valor de un parámetro de configuración."""
    param = db.query(ConfigParam).filter(ConfigParam.key == key).first()
    if not param:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail=f"Parámetro '{key}' no encontrado",
        )

    _validate_value(key, payload.value, db)

    old_value = param.value

    # Register history entry
    history = ConfigHistory(
        config_id=param.id,
        old_value=old_value,
        new_value=payload.value,
        changed_by=current_user.email,
    )
    db.add(history)

    param.value = payload.value
    db.commit()
    db.refresh(param)

    return ConfigParamRead.model_validate(param)


@router.get("/history/{key}", response_model=list[ConfigHistoryRead])
def get_config_history(
    key: str,
    db: Session = Depends(get_db),
    _: object = Depends(get_current_user),
):
    """Retorna los últimos 20 cambios del parámetro, ordenados por fecha DESC."""
    param = db.query(ConfigParam).filter(ConfigParam.key == key).first()
    if not param:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail=f"Parámetro '{key}' no encontrado",
        )

    history_rows = (
        db.query(ConfigHistory)
        .filter(ConfigHistory.config_id == param.id)
        .order_by(ConfigHistory.changed_at.desc())
        .limit(20)
        .all()
    )

    result: list[ConfigHistoryRead] = []
    for h in history_rows:
        item = ConfigHistoryRead(
            id=h.id,
            config_id=h.config_id,
            key=param.key,
            old_value=h.old_value,
            new_value=h.new_value,
            changed_by=h.changed_by,
            changed_at=h.changed_at,
        )
        result.append(item)

    return result
