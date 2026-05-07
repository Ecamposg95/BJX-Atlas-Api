from sqlalchemy import Column, String, Integer, ForeignKey, Index
from app.database import Base
from app.models.mixins import UUIDMixin, AuditMixin, BranchScopedMixin


class Document(Base, UUIDMixin, AuditMixin, BranchScopedMixin):
    """Generic file metadata. The actual bytes live in object storage (R2/S3/local).

    owner_type/owner_id link this document to its owning entity (work_order, evidence,
    technical_document, invoice, etc.) without enforcing a hard FK — different domains
    own documents.
    """
    __tablename__ = "documents"

    storage_key = Column(String(500), nullable=False, unique=True)
    storage_backend = Column(String(32), nullable=False, default="r2")
    content_type = Column(String(120), nullable=True)
    filename = Column(String(255), nullable=True)
    size_bytes = Column(Integer, nullable=True)
    owner_type = Column(String(64), nullable=True, index=True)
    owner_id = Column(String(36), nullable=True, index=True)
    uploaded_by = Column(String(36), ForeignKey("users.id", ondelete="SET NULL"), nullable=True)

    __table_args__ = (
        Index("ix_documents_owner", "owner_type", "owner_id"),
    )
