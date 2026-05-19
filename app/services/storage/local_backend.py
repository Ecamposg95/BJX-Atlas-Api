"""Backend local (filesystem) para tests y desarrollo.

NO usar en producción — sin redundancia, no escala multi-instance.
"""
import os
import shutil
from pathlib import Path
from typing import BinaryIO, Optional
from urllib.parse import quote

from app.services.storage.interface import StorageBackend


class LocalStorageBackend(StorageBackend):
    name = "local"

    def __init__(self, root: str = "./storage_local"):
        self.root = Path(root).resolve()
        self.root.mkdir(parents=True, exist_ok=True)

    def _path(self, key: str) -> Path:
        # Sanitizar contra path traversal
        clean = key.replace("..", "_").lstrip("/")
        p = self.root / clean
        p.parent.mkdir(parents=True, exist_ok=True)
        return p

    def upload(
        self,
        key: str,
        fileobj: BinaryIO,
        content_type: Optional[str] = None,
        size_bytes: Optional[int] = None,
    ) -> str:
        target = self._path(key)
        with target.open("wb") as out:
            shutil.copyfileobj(fileobj, out)
        return key

    def signed_url(self, key: str, ttl_seconds: int = 3600) -> str:
        # Backend local no firma — devolver URL del endpoint interno de descarga.
        # En producción este backend no se usa, así que esto es solo para tests.
        return f"/api/storage/local/{quote(key, safe='/-_.')}"

    def delete(self, key: str) -> None:
        target = self._path(key)
        if target.exists():
            target.unlink()

    def exists(self, key: str) -> bool:
        return self._path(key).exists()

    def public_url(self, key: str) -> Optional[str]:
        return self.signed_url(key)

    def _abs_path(self, key: str) -> Path:
        """Helper interno para tests / generación de PDFs."""
        return self._path(key)

    def download(self, key: str) -> bytes:
        """Lee bytes del objeto. KeyError si no existe."""
        target = self._path(key)
        if not target.exists():
            raise KeyError(key)
        return target.read_bytes()
