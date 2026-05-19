"""Cloudflare R2 backend (S3-compatible API via boto3).

Variables de entorno requeridas:
    R2_ACCOUNT_ID    — Cloudflare account id
    R2_ACCESS_KEY    — R2 access key id
    R2_SECRET_KEY    — R2 secret access key
    R2_BUCKET        — bucket name (ej: bjx-atlas-prod)
    R2_PUBLIC_DOMAIN — opcional, dominio público (ej: cdn.bjx.com)
"""
import os
from typing import BinaryIO, Optional

from app.services.storage.interface import StorageBackend


class R2StorageBackend(StorageBackend):
    name = "r2"

    def __init__(self):
        try:
            import boto3
            from botocore.config import Config
        except ImportError as e:
            raise RuntimeError(
                "boto3 no está instalado. Agregar 'boto3' a requirements.txt para usar STORAGE_BACKEND=r2"
            ) from e

        account_id = os.getenv("R2_ACCOUNT_ID")
        access_key = os.getenv("R2_ACCESS_KEY")
        secret_key = os.getenv("R2_SECRET_KEY")
        self.bucket = os.getenv("R2_BUCKET")
        self.public_domain = os.getenv("R2_PUBLIC_DOMAIN")

        missing = [n for n, v in {
            "R2_ACCOUNT_ID": account_id,
            "R2_ACCESS_KEY": access_key,
            "R2_SECRET_KEY": secret_key,
            "R2_BUCKET": self.bucket,
        }.items() if not v]
        if missing:
            raise RuntimeError(f"Faltan variables de entorno R2: {', '.join(missing)}")

        endpoint = f"https://{account_id}.r2.cloudflarestorage.com"
        self._client = boto3.client(
            "s3",
            endpoint_url=endpoint,
            aws_access_key_id=access_key,
            aws_secret_access_key=secret_key,
            config=Config(signature_version="s3v4", retries={"max_attempts": 3, "mode": "standard"}),
            region_name="auto",
        )

    def upload(
        self,
        key: str,
        fileobj: BinaryIO,
        content_type: Optional[str] = None,
        size_bytes: Optional[int] = None,
    ) -> str:
        extra = {}
        if content_type:
            extra["ContentType"] = content_type
        self._client.upload_fileobj(fileobj, self.bucket, key, ExtraArgs=extra)
        return key

    def signed_url(self, key: str, ttl_seconds: int = 3600) -> str:
        return self._client.generate_presigned_url(
            "get_object",
            Params={"Bucket": self.bucket, "Key": key},
            ExpiresIn=ttl_seconds,
        )

    def delete(self, key: str) -> None:
        self._client.delete_object(Bucket=self.bucket, Key=key)

    def exists(self, key: str) -> bool:
        try:
            self._client.head_object(Bucket=self.bucket, Key=key)
            return True
        except Exception:
            return False

    def public_url(self, key: str) -> Optional[str]:
        if self.public_domain:
            return f"https://{self.public_domain.rstrip('/')}/{key}"
        return None

    def download(self, key: str) -> bytes:
        obj = self._client.get_object(Bucket=self.bucket, Key=key)
        return obj["Body"].read()
