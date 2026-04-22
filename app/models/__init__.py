# Importar todos los modelos para que Alembic los detecte
from app.models.users import User, Role
from app.models.catalog import VehicleModel, Service, ServiceCatalog
from app.models.vehicles import Vehicle
from app.models.suppliers import Supplier, SupplierPrice
from app.models.quotes import Quote, QuoteLine, QuoteStatus
from app.models.config import ConfigParam, ConfigHistory
from app.models.work_orders import WorkOrder, WorkOrderStatus

__all__ = [
    "User", "Role",
    "VehicleModel", "Vehicle", "Service", "ServiceCatalog",
    "Supplier", "SupplierPrice",
    "Quote", "QuoteLine", "QuoteStatus",
    "WorkOrder", "WorkOrderStatus",
    "ConfigParam", "ConfigHistory",
]
