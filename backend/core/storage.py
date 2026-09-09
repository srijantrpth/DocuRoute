"""Supabase Storage gateway.

Uploads go browser -> Supabase directly using a short-lived signed upload URL, so
document bytes never transit the API server. The server keeps the service-role key
for signed downloads and for reading/writing the generated final PDF.
"""

from __future__ import annotations

import mimetypes
import posixpath
import uuid
from dataclasses import dataclass

import requests
from django.conf import settings
from rest_framework.exceptions import APIException


class StorageError(APIException):
    status_code = 502
    default_detail = "Storage backend unavailable."
    default_code = "storage_error"


@dataclass(frozen=True)
class SignedUpload:
    path: str
    url: str
    token: str


class SupabaseStorage:
    def __init__(self, *, url=None, service_key=None, bucket=None, timeout=20):
        self.base_url = (url or settings.SUPABASE_URL or "").rstrip("/")
        self.service_key = service_key or settings.SUPABASE_SERVICE_ROLE_KEY
        self.bucket = bucket or settings.SUPABASE_STORAGE_BUCKET
        self.timeout = timeout

    @property
    def configured(self) -> bool:
        return bool(self.base_url and self.service_key and self.bucket)

    def _require(self):
        if not self.configured:
            raise StorageError(
                "Supabase Storage is not configured. Set SUPABASE_URL, "
                "SUPABASE_SERVICE_ROLE_KEY and SUPABASE_STORAGE_BUCKET."
            )

    def _headers(self, extra=None):
        headers = {
            "Authorization": f"Bearer {self.service_key}",
            "apikey": self.service_key,
        }
        if extra:
            headers.update(extra)
        return headers

    def _endpoint(self, *parts):
        return "/".join([self.base_url, "storage", "v1", *[p.strip("/") for p in parts]])

    @staticmethod
    def build_path(organization_id, document_id, filename, prefix="originals") -> str:
        safe = posixpath.basename(filename or "document.pdf").replace("\\", "_")[:120]
        return f"{organization_id}/{document_id}/{prefix}/{uuid.uuid4().hex}-{safe}"

    # --- write ------------------------------------------------------------
    def create_signed_upload(self, path: str) -> SignedUpload:
        """Return a URL the browser can PUT/POST the file to, valid for ~2 hours."""
        self._require()
        response = requests.post(
            self._endpoint("object", "upload", "sign", self.bucket, path),
            headers=self._headers({"Content-Type": "application/json"}),
            json={},
            timeout=self.timeout,
        )
        if response.status_code >= 400:
            raise StorageError(f"Could not create upload URL: {response.text[:300]}")
        body = response.json()
        signed_url = body.get("url") or ""
        token = body.get("token") or signed_url.split("token=")[-1]
        return SignedUpload(
            path=path,
            url=f"{self.base_url}/storage/v1{signed_url}" if signed_url.startswith("/") else signed_url,
            token=token,
        )

    def upload_bytes(self, path: str, data: bytes, content_type=None, upsert=True) -> str:
        self._require()
        content_type = content_type or mimetypes.guess_type(path)[0] or "application/octet-stream"
        response = requests.post(
            self._endpoint("object", self.bucket, path),
            headers=self._headers(
                {"Content-Type": content_type, "x-upsert": "true" if upsert else "false"}
            ),
            data=data,
            timeout=self.timeout * 3,
        )
        if response.status_code >= 400:
            raise StorageError(f"Upload failed: {response.text[:300]}")
        return path

    # --- read -------------------------------------------------------------
    def create_signed_download(self, path: str, expires_in=3600, download_name=None) -> str:
        self._require()
        payload = {"expiresIn": int(expires_in)}
        if download_name:
            payload["download"] = download_name
        response = requests.post(
            self._endpoint("object", "sign", self.bucket, path),
            headers=self._headers({"Content-Type": "application/json"}),
            json=payload,
            timeout=self.timeout,
        )
        if response.status_code >= 400:
            raise StorageError(f"Could not sign download URL: {response.text[:300]}")
        signed = response.json().get("signedURL", "")
        return f"{self.base_url}/storage/v1{signed}" if signed.startswith("/") else signed

    def download_bytes(self, path: str) -> bytes:
        self._require()
        response = requests.get(
            self._endpoint("object", self.bucket, path),
            headers=self._headers(),
            timeout=self.timeout * 3,
        )
        if response.status_code >= 400:
            raise StorageError(f"Download failed: {response.text[:300]}")
        return response.content

    def remove(self, path: str) -> None:
        self._require()
        requests.delete(
            self._endpoint("object", self.bucket, path),
            headers=self._headers(),
            timeout=self.timeout,
        )


storage = SupabaseStorage()
