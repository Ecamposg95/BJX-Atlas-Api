"""Pydantic schemas for in-app notifications."""
from __future__ import annotations

from datetime import datetime
from typing import Optional

from pydantic import BaseModel, ConfigDict

from app.models.notifications import NotificationKind


class NotificationRead(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: str
    user_id: str
    kind: NotificationKind
    title: str
    body: str
    link_url: Optional[str] = None
    read_at: Optional[datetime] = None
    branch_id: Optional[str] = None
    entity_type: Optional[str] = None
    entity_id: Optional[str] = None
    created_at: datetime
    updated_at: Optional[datetime] = None


class NotificationListResponse(BaseModel):
    items: list[NotificationRead]
    total: int
    unread: int


class UnreadCount(BaseModel):
    count: int
