"""Backend de almacenamiento abstracto (R2 / S3 / local)."""
import os
from app.services.storage.interface import StorageBackend
from app.services.storage.local_backend import LocalStorageBackend
from app.services.storage.r2_backend import R2StorageBackend


_backend: StorageBackend | None = None


def get_storage() -> StorageBackend:
    """Singleton lazy del backend configurado por env STORAGE_BACKEND.

    Valores válidos: r2 (default prod), local (default dev/test).
    """
    global _backend
    if _backend is not None:
        return _backend

    chosen = os.getenv("STORAGE_BACKEND", "local").lower()
    if chosen == "r2":
        _backend = R2StorageBackend()
    elif chosen == "local":
        _backend = LocalStorageBackend(root=os.getenv("LOCAL_STORAGE_ROOT", "./storage_local"))
    else:
        raise RuntimeError(f"STORAGE_BACKEND inválido: {chosen}")
    return _backend


def reset_storage_for_tests() -> None:
    """Limpia el singleton (uso en tests)."""
    global _backend
    _backend = None


__all__ = ["StorageBackend", "get_storage", "reset_storage_for_tests", "LocalStorageBackend", "R2StorageBackend"]
