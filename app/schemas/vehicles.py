from __future__ import annotations

from datetime import datetime
from typing import Optional

from pydantic import BaseModel, ConfigDict, Field, field_validator


class VehicleRead(BaseModel):
    id: str
    customer_name: str
    contact: Optional[str] = None
    brand: Optional[str] = None
    model: Optional[str] = None
    year: Optional[int] = None
    plates: Optional[str] = None
    vin: Optional[str] = None
    mileage: Optional[int] = None
    color: Optional[str] = None
    active: bool
    created_at: datetime
    updated_at: Optional[datetime] = None
    deleted_at: Optional[datetime] = None

    model_config = ConfigDict(from_attributes=True)


def _strip_optional_text(value: Optional[str]) -> Optional[str]:
    if value is None:
        return None
    cleaned = value.strip()
    return cleaned or None


class VehicleCreate(BaseModel):
    customer_name: str
    contact: Optional[str] = None
    brand: Optional[str] = None
    model: Optional[str] = None
    year: Optional[int] = Field(default=None, gt=0)
    plates: Optional[str] = None
    vin: Optional[str] = None
    mileage: Optional[int] = Field(default=None, ge=0)
    color: Optional[str] = None
    active: bool = True

    @field_validator("customer_name")
    @classmethod
    def validate_customer_name(cls, value: str) -> str:
        cleaned = value.strip()
        if not cleaned:
            raise ValueError("customer_name no puede estar vacío")
        return cleaned

    @field_validator("contact", "brand", "model", "plates", "vin", "color", mode="before")
    @classmethod
    def normalize_optional_text(cls, value):
        return _strip_optional_text(value)


class VehicleUpdate(BaseModel):
    customer_name: Optional[str] = None
    contact: Optional[str] = None
    brand: Optional[str] = None
    model: Optional[str] = None
    year: Optional[int] = Field(default=None, gt=0)
    plates: Optional[str] = None
    vin: Optional[str] = None
    mileage: Optional[int] = Field(default=None, ge=0)
    color: Optional[str] = None
    active: Optional[bool] = None

    @field_validator("customer_name")
    @classmethod
    def validate_customer_name(cls, value: Optional[str]) -> Optional[str]:
        if value is None:
            raise ValueError("customer_name no puede ser null")
        cleaned = value.strip()
        if not cleaned:
            raise ValueError("customer_name no puede estar vacío")
        return cleaned

    @field_validator("active")
    @classmethod
    def validate_active(cls, value: Optional[bool]) -> Optional[bool]:
        if value is None:
            raise ValueError("active no puede ser null")
        return value

    @field_validator("contact", "brand", "model", "plates", "vin", "color", mode="before")
    @classmethod
    def normalize_optional_text(cls, value):
        return _strip_optional_text(value)
