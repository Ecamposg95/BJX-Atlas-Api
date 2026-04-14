import enum
from sqlalchemy import Column, String, Boolean, Enum, Text
from app.database import Base
from app.models.mixins import UUIDMixin, AuditMixin


class Role(str, enum.Enum):
    admin = "admin"
    operador = "operador"
    viewer = "viewer"


class User(Base, UUIDMixin, AuditMixin):
    __tablename__ = "users"

    email = Column(String(255), unique=True, nullable=False, index=True)
    hashed_password = Column(String(255), nullable=False)
    role = Column(Enum(Role, create_type=False), nullable=False, default=Role.viewer)
    active = Column(Boolean, default=True, nullable=False)
    refresh_token = Column(Text, nullable=True)
