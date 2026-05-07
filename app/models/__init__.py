# Importar todos los modelos para que Alembic los detecte
from app.models.organizations import Organization, Branch
from app.models.users import User, Role, BRANCH_SCOPED_ROLES, GLOBAL_ROLES
from app.models.catalog import VehicleModel, Service, ServiceCatalog
from app.models.vehicles import Vehicle
from app.models.suppliers import Supplier, SupplierPrice
from app.models.quotes import Quote, QuoteLine, QuoteStatus
from app.models.config import ConfigParam, ConfigHistory
from app.models.work_orders import WorkOrder, WorkOrderStatus
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

__all__ = [
    "Organization", "Branch",
    "User", "Role", "BRANCH_SCOPED_ROLES", "GLOBAL_ROLES",
    "VehicleModel", "Vehicle", "Service", "ServiceCatalog",
    "Supplier", "SupplierPrice",
    "Quote", "QuoteLine", "QuoteStatus",
    "WorkOrder", "WorkOrderStatus",
    "ConfigParam", "ConfigHistory",
    "AuditLog",
    "Document",
    "Warehouse", "Part", "StockLevel",
    "InventoryMovement", "InventoryMovementType",
    "InventoryRequest", "InventoryRequestStatus",
    "ServiceBay",
    "WorkOrderLine", "WorkOrderLineStatus",
    "Evidence", "EvidenceKind",
]
