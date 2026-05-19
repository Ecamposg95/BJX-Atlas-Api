import os
from datetime import datetime, timedelta, timezone
from typing import Optional

from jose import JWTError, jwt
from passlib.context import CryptContext
from fastapi import Depends, HTTPException, Request, status
from fastapi.security import OAuth2PasswordBearer
from sqlalchemy.orm import Session

from app.database import get_db
from app.models.users import User, Role

SECRET_KEY = os.getenv("SECRET_KEY", "CHANGE_ME")
ALGORITHM = "HS256"
ACCESS_TOKEN_EXPIRE_HOURS = int(os.getenv("ACCESS_TOKEN_EXPIRE_HOURS", "8"))
REFRESH_TOKEN_EXPIRE_DAYS = int(os.getenv("REFRESH_TOKEN_EXPIRE_DAYS", "30"))

pwd_context = CryptContext(schemes=["bcrypt"], deprecated="auto")
oauth2_scheme = OAuth2PasswordBearer(tokenUrl="/auth/login", auto_error=False)


# ---------------------------------------------------------------------------
# Password helpers
# ---------------------------------------------------------------------------

def verify_password(plain_password: str, hashed_password: str) -> bool:
    return pwd_context.verify(plain_password, hashed_password)


def hash_password(password: str) -> str:
    return pwd_context.hash(password)


# ---------------------------------------------------------------------------
# Token creation
# ---------------------------------------------------------------------------

def _role_value(role) -> str:
    """Accept either a Role enum, a string or any object with .value attribute."""
    if isinstance(role, str):
        return role
    return getattr(role, "value", str(role))


def create_access_token(email: str, role, branch_id: Optional[str] = None) -> str:
    expire = datetime.now(timezone.utc) + timedelta(hours=ACCESS_TOKEN_EXPIRE_HOURS)
    payload = {
        "sub": email,
        "role": _role_value(role),
        "branch_id": branch_id,
        "type": "access",
        "exp": expire,
    }
    return jwt.encode(payload, SECRET_KEY, algorithm=ALGORITHM)


def create_refresh_token(email: str) -> str:
    expire = datetime.now(timezone.utc) + timedelta(days=REFRESH_TOKEN_EXPIRE_DAYS)
    payload = {
        "sub": email,
        "type": "refresh",
        "exp": expire,
    }
    return jwt.encode(payload, SECRET_KEY, algorithm=ALGORITHM)


# ---------------------------------------------------------------------------
# Token extraction helper (header first, fallback to cookie)
# ---------------------------------------------------------------------------

def _extract_token(request: Request, bearer_header: Optional[str]) -> Optional[str]:
    """Return raw JWT string from Authorization header or access_token cookie."""
    if bearer_header:
        return bearer_header  # oauth2_scheme already strips "Bearer "

    cookie_value: Optional[str] = request.cookies.get("access_token")
    if cookie_value:
        # Cookie is stored as "Bearer <token>"
        if cookie_value.startswith("Bearer "):
            return cookie_value[len("Bearer "):]
        return cookie_value

    return None


# ---------------------------------------------------------------------------
# Dependencies
# ---------------------------------------------------------------------------

def get_current_user(
    request: Request,
    token: Optional[str] = Depends(oauth2_scheme),
    db: Session = Depends(get_db),
) -> User:
    credentials_exception = HTTPException(
        status_code=status.HTTP_401_UNAUTHORIZED,
        detail="No autenticado o token inválido",
        headers={"WWW-Authenticate": "Bearer"},
    )

    raw_token = _extract_token(request, token)
    if not raw_token:
        raise credentials_exception

    try:
        payload = jwt.decode(raw_token, SECRET_KEY, algorithms=[ALGORITHM])
        email: Optional[str] = payload.get("sub")
        token_type: Optional[str] = payload.get("type")
        if email is None or token_type != "access":
            raise credentials_exception
    except JWTError:
        raise credentials_exception

    user: Optional[User] = db.query(User).filter(User.email == email).first()
    if user is None or not user.active:
        raise credentials_exception

    # Populate audit context with the resolved user
    try:
        from app.services.audit import _audit_ctx  # local import to avoid cycles
        ctx = _audit_ctx.get()
        ctx.user_id = user.id
        ctx.user_email = user.email
        ctx.branch_id = user.default_branch_id
        # request header X-Branch-Id override (si lo hay)
        header_b = request.headers.get("X-Branch-Id")
        if header_b:
            ctx.branch_id = header_b
        _audit_ctx.set(ctx)
    except Exception:
        pass

    return user


def get_current_user_optional(
    request: Request,
    token: Optional[str] = Depends(oauth2_scheme),
    db: Session = Depends(get_db),
) -> Optional[User]:
    """Like get_current_user but returns None instead of raising 401."""
    raw_token = _extract_token(request, token)
    if not raw_token:
        return None

    try:
        payload = jwt.decode(raw_token, SECRET_KEY, algorithms=[ALGORITHM])
        email: Optional[str] = payload.get("sub")
        token_type: Optional[str] = payload.get("type")
        if email is None or token_type != "access":
            return None
    except JWTError:
        return None

    user: Optional[User] = db.query(User).filter(User.email == email).first()
    if user is None or not user.active:
        return None

    return user


def require_role(roles: list[str]):
    """Dependency factory — raises 403 if user's role is not in the allowed list.

    Acepta los roles legacy (admin/operador/viewer) y los nuevos
    (director/jefe_taller/recepcion/mecanico/almacen/etc). El campo `role` ahora
    es un String columna, así que comparamos directo.
    """

    def _check(current_user: User = Depends(get_current_user)) -> User:
        user_role = _role_value(current_user.role)
        if user_role not in roles:
            raise HTTPException(
                status_code=status.HTTP_403_FORBIDDEN,
                detail="No tienes permiso para realizar esta acción",
            )
        return current_user

    return _check


# Re-export del nuevo sistema de permisos basado en matriz declarativa
# (sustituye al antiguo require_permission(*role_groups: str) que era sugar de require_role)
from app.security.permissions import (  # noqa: E402
    Permission,
    PERMISSION_MATRIX,
    has_permission,
    require_permission,
)
