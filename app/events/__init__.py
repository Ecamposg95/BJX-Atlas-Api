"""EventBus síncrono in-process para eventos de dominio."""
from __future__ import annotations

import logging
import uuid
from dataclasses import dataclass, field
from datetime import datetime, timezone
from typing import Callable, Type

logger = logging.getLogger("bjx-atlas.events")


@dataclass
class BaseEvent:
    event_id: str = field(default_factory=lambda: str(uuid.uuid4()))
    occurred_at: datetime = field(default_factory=lambda: datetime.now(timezone.utc))
    branch_id: str | None = None
    actor_id: str | None = None
    request_id: str | None = None

    @classmethod
    def make(cls, **kwargs):
        return cls(**kwargs)


class EventBus:
    _subs: dict[Type[BaseEvent], list[Callable]] = {}

    @classmethod
    def subscribe(cls, event_type: Type[BaseEvent], handler: Callable) -> None:
        cls._subs.setdefault(event_type, []).append(handler)

    @classmethod
    def publish(cls, event: BaseEvent) -> None:
        handlers = cls._subs.get(type(event), [])
        for h in handlers:
            try:
                h(event)
            except Exception:
                logger.exception(
                    "Event handler failed",
                    extra={
                        "event_type": type(event).__name__,
                        "event_id": event.event_id,
                        "handler": getattr(h, "__qualname__", str(h)),
                    },
                )


__all__ = ["BaseEvent", "EventBus"]
