"""
Structured logging configuration for BJX Atlas API.

Emits JSON-formatted log records so Railway's log aggregator can parse
fields (level, message, timestamp, traceback, etc.) without regex hacks.
"""

import logging
import sys
import json
import traceback
from datetime import datetime, timezone


class _JSONFormatter(logging.Formatter):
    """Format every log record as a single-line JSON object."""

    # Fields we pull directly from the LogRecord
    _SKIP = {
        "args", "created", "exc_info", "exc_text", "filename",
        "funcName", "id", "levelno", "lineno", "message",
        "module", "msecs", "msg", "name", "pathname",
        "process", "processName", "relativeCreated", "stack_info",
        "taskName", "thread", "threadName",
    }

    def format(self, record: logging.LogRecord) -> str:  # noqa: A003
        record.message = record.getMessage()

        payload: dict = {
            "ts": datetime.fromtimestamp(record.created, tz=timezone.utc).isoformat(),
            "level": record.levelname,
            "logger": record.name,
            "message": record.message,
            "module": record.module,
            "func": record.funcName,
            "line": record.lineno,
        }

        # Attach exception traceback when present
        if record.exc_info:
            payload["traceback"] = self.formatException(record.exc_info)
        elif record.exc_text:
            payload["traceback"] = record.exc_text

        # Attach any extra fields the caller passed via `extra={}`
        for key, value in record.__dict__.items():
            if key not in self._SKIP and not key.startswith("_"):
                try:
                    json.dumps(value)  # only include JSON-serialisable extras
                    payload[key] = value
                except (TypeError, ValueError):
                    payload[key] = str(value)

        return json.dumps(payload, ensure_ascii=False)


def setup_logging(level: str = "INFO") -> None:
    """
    Configure the root logger and the ``bjx-atlas`` application logger.

    Call this once at application startup (before the FastAPI app is created).
    Uvicorn's own loggers are left intact so their access logs still flow
    through; we only override the *format* on the root handler.
    """
    numeric_level = getattr(logging, level.upper(), logging.INFO)

    # ── Root handler ────────────────────────────────────────────────────────
    root = logging.getLogger()
    root.setLevel(numeric_level)

    # Remove any handlers that were added before us (e.g. by uvicorn's config)
    for h in root.handlers[:]:
        root.removeHandler(h)

    handler = logging.StreamHandler(sys.stdout)
    handler.setFormatter(_JSONFormatter())
    root.addHandler(handler)

    # ── Silence noisy third-party loggers ───────────────────────────────────
    logging.getLogger("uvicorn.access").setLevel(logging.WARNING)
    logging.getLogger("sqlalchemy.engine").setLevel(logging.WARNING)

    # ── Slow-query logger (SQLAlchemy) ───────────────────────────────────────
    # Enabled separately in database.py via event listeners; we just make sure
    # the logger exists at the right level.
    logging.getLogger("bjx-atlas.slow_query").setLevel(logging.WARNING)

    logging.getLogger("bjx-atlas").info(
        "Logging initialised",
        extra={"log_level": level},
    )
