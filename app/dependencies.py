from fastapi import Depends
from sqlalchemy.orm import Session
from app.database import get_db
from app.models.config import ConfigParam

DEFAULT_CONFIG = {
    "technician_cost_hr": 156.25,
    "target_margin": 0.40,
    "scoring_weight_price": 0.50,
    "scoring_weight_time": 0.30,
    "scoring_weight_tc": 0.20,
}


def get_engine_config(db: Session = Depends(get_db)) -> dict:
    """Lee config_params de DB. Retorna defaults si no existen."""
    keys = list(DEFAULT_CONFIG.keys())
    params = db.query(ConfigParam).filter(ConfigParam.key.in_(keys)).all()
    result = dict(DEFAULT_CONFIG)
    for p in params:
        if p.key in result:
            result[p.key] = float(p.value)
    return result
