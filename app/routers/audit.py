"""Endpoint de consulta del audit log (admin/director only)."""
from datetime import datetime
from typing import Optional
from pydantic import BaseModel
from fastapi import APIRouter, Depends, Query
from sqlalchemy.orm import Session
from sqlalchemy import desc

from app.database import get_db
from app.models.audit import AuditLog
from app.security import require_role


router = APIRouter(prefix="/audit", tags=["audit"])


class AuditLogRead(BaseModel):
    id: str
    branch_id: Optional[str]
    user_id: Optional[str]
    user_email: Optional[str]
    action: str
    table_name: str
    record_id: Optional[str]
    old_data: Optional[dict]
    new_data: Optional[dict]
    ip: Optional[str]
    user_agent: Optional[str]
    created_at: datetime

    model_config = {"from_attributes": True}


class AuditLogPage(BaseModel):
    total: int
    page: int
    page_size: int
    items: list[AuditLogRead]


@router.get("/logs", response_model=AuditLogPage)
def list_logs(
    db: Session = Depends(get_db),
    _: object = Depends(require_role(["admin", "director"])),
    branch_id: Optional[str] = None,
    table_name: Optional[str] = None,
    record_id: Optional[str] = None,
    user_id: Optional[str] = None,
    action: Optional[str] = None,
    page: int = Query(1, ge=1),
    page_size: int = Query(50, ge=1, le=500),
):
    q = db.query(AuditLog)
    if branch_id:
        q = q.filter(AuditLog.branch_id == branch_id)
    if table_name:
        q = q.filter(AuditLog.table_name == table_name)
    if record_id:
        q = q.filter(AuditLog.record_id == record_id)
    if user_id:
        q = q.filter(AuditLog.user_id == user_id)
    if action:
        q = q.filter(AuditLog.action == action)

    total = q.count()
    items = (
        q.order_by(desc(AuditLog.created_at))
        .offset((page - 1) * page_size)
        .limit(page_size)
        .all()
    )
    return AuditLogPage(total=total, page=page, page_size=page_size, items=items)
