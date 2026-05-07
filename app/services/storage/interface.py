"""Interface abstracta de almacenamiento de objetos."""
from abc import ABC, abstractmethod
from typing import BinaryIO, Optional


class StorageBackend(ABC):
    """Contrato mínimo para upload/download/delete + signed URLs.

    Las implementaciones (R2/S3/local) garantizan idempotencia razonable y manejan
    errores transitorios con retry interno cuando aplique.
    """

    name: str = "abstract"

    @abstractmethod
    def upload(
        self,
        key: str,
        fileobj: BinaryIO,
        content_type: Optional[str] = None,
        size_bytes: Optional[int] = None,
    ) -> str:
        """Sube `fileobj` bajo la clave `key`. Retorna la clave canónica almacenada."""

    @abstractmethod
    def signed_url(self, key: str, ttl_seconds: int = 3600) -> str:
        """Devuelve URL firmada con expiración para descarga directa."""

    @abstractmethod
    def delete(self, key: str) -> None:
        """Elimina el objeto. No-op si no existe."""

    @abstractmethod
    def exists(self, key: str) -> bool:
        ...

    def public_url(self, key: str) -> Optional[str]:
        """URL pública (no firmada). Backend puede no soportarla y retornar None."""
        return None
