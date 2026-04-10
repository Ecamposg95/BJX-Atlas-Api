# Importar todos los modelos para que Alembic los detecte
from app.models.users import User, Role
from app.models.catalog import VehicleModel, Service, ServiceCatalog
from app.models.suppliers import Supplier, SupplierPrice
from app.models.quotes import Quote, QuoteLine, QuoteStatus
from app.models.config import ConfigParam, ConfigHistory

__all__ = [
    "User", "Role",
    "VehicleModel", "Service", "ServiceCatalog",
    "Supplier", "SupplierPrice",
    "Quote", "QuoteLine", "QuoteStatus",
    "ConfigParam", "ConfigHistory",
]
