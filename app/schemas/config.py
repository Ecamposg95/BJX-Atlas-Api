from __future__ import annotations

from datetime import datetime
from typing import Optional

from pydantic import BaseModel, ConfigDict


class ConfigParamRead(BaseModel):
    id: str
    key: str
    value: str
    description: Optional[str] = None
    updated_at: Optional[datetime] = None

    model_config = ConfigDict(from_attributes=True)


class ConfigParamUpdate(BaseModel):
    value: str


class ConfigHistoryRead(BaseModel):
    id: str
    config_id: str
    key: str
    old_value: Optional[str] = None
    new_value: str
    changed_by: str
    changed_at: datetime

    model_config = ConfigDict(from_attributes=True)
