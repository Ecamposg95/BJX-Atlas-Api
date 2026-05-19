import enum
from sqlalchemy import Column, String, Boolean, Text, ForeignKey
from app.database import Base
from app.models.mixins import UUIDMixin, AuditMixin


class Role(str, enum.Enum):
    """Roles de usuario.

    `operador` está deprecado (legado Sprint 0 — multifunción). El valor se
    conserva en el enum por compatibilidad con usuarios existentes en BD,
    pero ya no se asignan permisos a este rol: sus capacidades fueron
    migradas a `recepcion`, `jefe_taller` y `gerente_sede` según contexto.
    No usar en nuevos seeds, fixtures ni asignaciones de permisos.
    """
    admin = "admin"
    director = "director"
    gerente_sede = "gerente_sede"
    jefe_taller = "jefe_taller"
    recepcion = "recepcion"
    mecanico = "mecanico"
    almacen = "almacen"
    cliente_corp = "cliente_corp"
    operador = "operador"  # deprecated — ver docstring del enum
    viewer = "viewer"


# Roles con alcance de sede (deben tener default_branch_id).
BRANCH_SCOPED_ROLES = {
    Role.gerente_sede,
    Role.jefe_taller,
    Role.recepcion,
    Role.mecanico,
    Role.almacen,
}

# Roles cross-branch (ven todas las sedes).
GLOBAL_ROLES = {Role.admin, Role.director, Role.viewer, Role.cliente_corp}


class User(Base, UUIDMixin, AuditMixin):
    __tablename__ = "users"

    email = Column(String(255), unique=True, nullable=False, index=True)
    hashed_password = Column(String(255), nullable=False)
    # role almacenado como string (no Enum DB) para evitar drama de migraciones.
    # La validación viene del enum Python en routers/schemas.
    role = Column(String(32), nullable=False, default=Role.viewer.value, index=True)
    default_branch_id = Column(
        String(36),
        ForeignKey("branches.id", ondelete="SET NULL"),
        nullable=True,
        index=True,
    )
    # customer_id liga al usuario con una flota corporativa. Solo aplica al
    # rol `cliente_corp`: las consultas de OS/flota se filtran por este campo.
    # No es FK formal porque la plataforma no tiene tabla `customers` todavía;
    # WorkOrder.customer_id es un String libre que la recepción captura al
    # crear la OS.
    customer_id = Column(String(36), nullable=True, index=True)
    active = Column(Boolean, default=True, nullable=False)
    refresh_token = Column(Text, nullable=True)
