"""In-app notification center router (Wave 4)."""
from __future__ import annotations

from datetime import datetime, timezone
from typing import Optional

from fastapi import APIRouter, Depends, HTTPException, Query, status
from sqlalchemy import func
from sqlalchemy.orm import Session

from app.database import get_db
from app.models.notifications import Notification
from app.models.users import User
from app.schemas.notifications import (
    NotificationListResponse,
    NotificationRead,
    UnreadCount,
)
from app.security import get_current_user


router = APIRouter(prefix="/v1/notifications", tags=["notifications-v1"])


@router.get("", response_model=NotificationListResponse)
def list_notifications(
    unread_only: bool = Query(False),
    limit: int = Query(20, ge=1, le=100),
    skip: int = Query(0, ge=0),
    db: Session = Depends(get_db),
    user: User = Depends(get_current_user),
):
    base = db.query(Notification).filter(Notification.user_id == user.id)

    total = base.count()
    unread = base.filter(Notification.read_at.is_(None)).count()

    q = base
    if unread_only:
        q = q.filter(Notification.read_at.is_(None))

    items = (
        q.order_by(Notification.created_at.desc())
        .offset(skip)
        .limit(limit)
        .all()
    )
    return NotificationListResponse(
        items=[NotificationRead.model_validate(n) for n in items],
        total=total,
        unread=unread,
    )


@router.get("/unread-count", response_model=UnreadCount)
def unread_count(
    db: Session = Depends(get_db),
    user: User = Depends(get_current_user),
):
    count = (
        db.query(func.count(Notification.id))
        .filter(Notification.user_id == user.id, Notification.read_at.is_(None))
        .scalar()
    ) or 0
    return UnreadCount(count=int(count))


@router.post("/{notification_id}/read", response_model=NotificationRead)
def mark_read(
    notification_id: str,
    db: Session = Depends(get_db),
    user: User = Depends(get_current_user),
):
    n = (
        db.query(Notification)
        .filter(Notification.id == notification_id, Notification.user_id == user.id)
        .first()
    )
    if n is None:
        raise HTTPException(status_code=404, detail="Notificación no encontrada")
    if n.read_at is None:
        n.read_at = datetime.now(timezone.utc)
        db.commit()
        db.refresh(n)
    return NotificationRead.model_validate(n)


@router.post("/mark-all-read")
def mark_all_read(
    db: Session = Depends(get_db),
    user: User = Depends(get_current_user),
):
    now = datetime.now(timezone.utc)
    updated = (
        db.query(Notification)
        .filter(Notification.user_id == user.id, Notification.read_at.is_(None))
        .update({Notification.read_at: now}, synchronize_session=False)
    )
    db.commit()
    return {"updated": int(updated or 0)}
