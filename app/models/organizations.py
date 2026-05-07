from sqlalchemy import Column, String, Boolean, ForeignKey, Index
from sqlalchemy.orm import relationship
from app.database import Base
from app.models.mixins import UUIDMixin, AuditMixin


class Organization(Base, UUIDMixin, AuditMixin):
    __tablename__ = "organizations"

    code = Column(String(32), unique=True, nullable=False, index=True)
    name = Column(String(255), nullable=False)
    active = Column(Boolean, default=True, nullable=False)

    branches = relationship("Branch", back_populates="organization", cascade="all, delete-orphan")


class Branch(Base, UUIDMixin, AuditMixin):
    __tablename__ = "branches"

    organization_id = Column(String(36), ForeignKey("organizations.id", ondelete="CASCADE"), nullable=False, index=True)
    code = Column(String(32), nullable=False)
    name = Column(String(255), nullable=False)
    address = Column(String(500), nullable=True)
    city = Column(String(120), nullable=True)
    state = Column(String(120), nullable=True)
    timezone = Column(String(64), nullable=False, default="America/Mexico_City")
    phone = Column(String(64), nullable=True)
    active = Column(Boolean, default=True, nullable=False)

    organization = relationship("Organization", back_populates="branches")

    __table_args__ = (
        Index("uq_branches_org_code", "organization_id", "code", unique=True),
    )
