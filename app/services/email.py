"""Email transport service (Wave 4 close).

SMTP via stdlib `smtplib`. If `SMTP_HOST` is empty, switches to dry-run mode:
logs the email but does not send it. Useful for CI/local without SMTP creds.

Notification email rendering: maps `kind` to a Spanish subject/body inline
template and sends to `user.email`.
"""
from __future__ import annotations

import logging
import os
import smtplib
import ssl
from email.message import EmailMessage
from typing import Optional

logger = logging.getLogger("bjx-atlas.email")


def _env(key: str, default: str = "") -> str:
    return os.getenv(key, default) or default


def _smtp_config() -> dict:
    return {
        "host": _env("SMTP_HOST", ""),
        "port": int(_env("SMTP_PORT", "587") or "587"),
        "user": _env("SMTP_USER", ""),
        "password": _env("SMTP_PASSWORD", ""),
        "from_addr": _env("SMTP_FROM", "no-reply@bjxatlas.local"),
        "use_tls": _env("SMTP_TLS", "true").lower() in {"1", "true", "yes"},
        "timeout": float(_env("SMTP_TIMEOUT", "10") or "10"),
    }


def send_email(
    to: str,
    subject: str,
    body_text: str,
    body_html: Optional[str] = None,
) -> dict:
    """Send an email via SMTP. Returns dict with status.

    If SMTP_HOST is empty, dry-run mode: logs and returns sent=False, dry_run=True.
    On any SMTP error: catches, logs, returns sent=False with error message.
    """
    cfg = _smtp_config()

    if not to:
        return {"sent": False, "dry_run": False, "error": "missing recipient"}

    if not cfg["host"]:
        logger.info(
            "[email DRY-RUN] to=%s subject=%r body_len=%d",
            to, subject, len(body_text or ""),
        )
        return {"sent": False, "dry_run": True, "error": None}

    msg = EmailMessage()
    msg["From"] = cfg["from_addr"]
    msg["To"] = to
    msg["Subject"] = subject
    msg.set_content(body_text or "")
    if body_html:
        msg.add_alternative(body_html, subtype="html")

    try:
        if cfg["use_tls"]:
            context = ssl.create_default_context()
            with smtplib.SMTP(cfg["host"], cfg["port"], timeout=cfg["timeout"]) as s:
                s.starttls(context=context)
                if cfg["user"]:
                    s.login(cfg["user"], cfg["password"])
                s.send_message(msg)
        else:
            with smtplib.SMTP(cfg["host"], cfg["port"], timeout=cfg["timeout"]) as s:
                if cfg["user"]:
                    s.login(cfg["user"], cfg["password"])
                s.send_message(msg)
        logger.info("[email SENT] to=%s subject=%r", to, subject)
        return {"sent": True, "dry_run": False, "error": None}
    except Exception as e:  # noqa: BLE001
        logger.warning("[email FAIL] to=%s subject=%r error=%s", to, subject, e)
        return {"sent": False, "dry_run": False, "error": str(e)}


# ---------------------------------------------------------------------------
# Notification → email rendering
# ---------------------------------------------------------------------------

_BRAND = "BJX Atlas"


def _render_subject(kind: str, title: str) -> str:
    prefix_map = {
        "appointment_confirmed": "[Cita]",
        "wo_status_changed": "[OS]",
        "qa_pending": "[QA]",
        "delivery_ready": "[Entrega]",
        "parts_request": "[Refacciones]",
        "system": "[Sistema]",
    }
    prefix = prefix_map.get(kind, "[Notificación]")
    return f"{prefix} {title} — {_BRAND}"


def _render_body(title: str, body: str, link_url: Optional[str]) -> tuple[str, str]:
    text_lines = [title]
    if body:
        text_lines.append("")
        text_lines.append(body)
    if link_url:
        text_lines.append("")
        text_lines.append(f"Ver detalle: {link_url}")
    text_lines.append("")
    text_lines.append(f"— {_BRAND}")
    text = "\n".join(text_lines)

    html_parts = [
        f"<h2 style=\"font-family:sans-serif;color:#111\">{title}</h2>",
    ]
    if body:
        html_parts.append(
            f"<p style=\"font-family:sans-serif;color:#333\">{body}</p>"
        )
    if link_url:
        html_parts.append(
            f"<p><a href=\"{link_url}\" style=\"color:#0a66c2\">Ver detalle</a></p>"
        )
    html_parts.append(
        f"<p style=\"font-family:sans-serif;color:#888;font-size:12px\">— {_BRAND}</p>"
    )
    html = "".join(html_parts)
    return text, html


def send_notification_email(db, notification_id: str) -> dict:
    """Load a Notification by id, render via template, send to user.email.

    Returns the dict from send_email. Never raises — failures are logged.
    """
    try:
        from app.models.notifications import Notification
        from app.models.users import User

        n = db.query(Notification).filter(Notification.id == notification_id).first()
        if n is None:
            return {"sent": False, "dry_run": False, "error": "notification not found"}
        user = db.query(User).filter(User.id == n.user_id).first()
        if user is None or not user.email:
            return {"sent": False, "dry_run": False, "error": "user has no email"}

        subject = _render_subject(n.kind, n.title)
        body_text, body_html = _render_body(n.title, n.body or "", n.link_url)
        return send_email(user.email, subject, body_text, body_html)
    except Exception as e:  # noqa: BLE001
        logger.warning("[email NOTIF FAIL] notification_id=%s error=%s", notification_id, e)
        return {"sent": False, "dry_run": False, "error": str(e)}
