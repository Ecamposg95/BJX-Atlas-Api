# Importar todos los modelos para que Alembic los detecte
from app.models.organizations import Organization, Branch
from app.models.users import User, Role, BRANCH_SCOPED_ROLES, GLOBAL_ROLES
from app.models.catalog import VehicleModel, Service, ServiceCatalog, ServiceRequiredLevel
from app.models.vehicles import Vehicle
from app.models.suppliers import Supplier, SupplierPrice
from app.models.quotes import Quote, QuoteLine, QuoteStatus
from app.models.config import ConfigParam, ConfigHistory
from app.models.work_orders import WorkOrder, WorkOrderStatus, WorkOrderType
from app.models.audit import AuditLog
from app.models.documents import Document
from app.models.inventory import (
    Warehouse,
    Part,
    StockLevel,
    InventoryMovement,
    InventoryMovementType,
    InventoryRequest,
    InventoryRequestStatus,
)
from app.models.workshop import (
    ServiceBay,
    WorkOrderLine,
    WorkOrderLineStatus,
    Evidence,
    EvidenceKind,
)

# Fase 1 — workshop workflow extensions
from app.models.workshop_history import WorkOrderStatusHistory
from app.models.mechanic_profiles import (
    MechanicProfile,
    MechanicSkill,
    MechanicLevel,
    SkillCategory,
    LEVEL_ORDER,
)
from app.models.assignments import Assignment, AssignmentStatus
from app.models.findings import WorkOrderFinding, FindingStatus
from app.models.idempotency import IdempotencyKey
from app.models.evidence import MobileEvidence, MobileEvidenceKind
from app.models.appointments import Appointment, AppointmentStatus
from app.models.deliveries import Delivery
from app.models.notifications import Notification, NotificationKind
from app.models.procurement import (
    PurchaseOrder,
    PurchaseOrderItem,
    PurchaseOrderStatus,
    TERMINAL_PO_STATUSES,
)
from app.models.service_proposals import ServiceProposal, ServiceProposalStatus

__all__ = [
    "Organization", "Branch",
    "User", "Role", "BRANCH_SCOPED_ROLES", "GLOBAL_ROLES",
    "VehicleModel", "Vehicle", "Service", "ServiceCatalog", "ServiceRequiredLevel",
    "Supplier", "SupplierPrice",
    "Quote", "QuoteLine", "QuoteStatus",
    "WorkOrder", "WorkOrderStatus", "WorkOrderType",
    "ConfigParam", "ConfigHistory",
    "AuditLog",
    "Document",
    "Warehouse", "Part", "StockLevel",
    "InventoryMovement", "InventoryMovementType",
    "InventoryRequest", "InventoryRequestStatus",
    "ServiceBay",
    "WorkOrderLine", "WorkOrderLineStatus",
    "Evidence", "EvidenceKind",
    # Fase 1 — workshop workflow
    "WorkOrderStatusHistory",
    "MechanicProfile", "MechanicSkill", "MechanicLevel", "SkillCategory", "LEVEL_ORDER",
    "Assignment", "AssignmentStatus",
    "WorkOrderFinding", "FindingStatus",
    "IdempotencyKey",
    "MobileEvidence", "MobileEvidenceKind",
    "Appointment", "AppointmentStatus",
    "Delivery",
    "Notification", "NotificationKind",
    "PurchaseOrder", "PurchaseOrderItem", "PurchaseOrderStatus", "TERMINAL_PO_STATUSES",
    "ServiceProposal", "ServiceProposalStatus",
]
