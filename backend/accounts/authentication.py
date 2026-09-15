"""Supabase-issued JWT verification for DRF.

Supabase projects sign access tokens either with the legacy shared HS256 secret or,
on newer projects, with asymmetric keys published at the project JWKS endpoint.
Both are supported; HS256 wins when SUPABASE_JWT_SECRET is configured.
"""

from __future__ import annotations

import logging
import threading

import jwt
from django.conf import settings
from django.utils import timezone
from jwt import PyJWKClient
from rest_framework import authentication, exceptions

from .models import User

logger = logging.getLogger(__name__)

_jwks_client: PyJWKClient | None = None
_jwks_lock = threading.Lock()


def _get_jwks_client() -> PyJWKClient:
    global _jwks_client
    if _jwks_client is None:
        with _jwks_lock:
            if _jwks_client is None:
                if not settings.SUPABASE_URL:
                    raise exceptions.AuthenticationFailed("Supabase is not configured.")
                _jwks_client = PyJWKClient(
                    f"{settings.SUPABASE_URL}/auth/v1/.well-known/jwks.json",
                    cache_keys=True,
                    lifespan=600,
                )
    return _jwks_client


def decode_supabase_token(token: str) -> dict:
    options = {"verify_aud": bool(settings.SUPABASE_JWT_AUDIENCE)}
    common = {
        "audience": settings.SUPABASE_JWT_AUDIENCE or None,
        "options": options,
        "leeway": 10,
    }
    try:
        if settings.SUPABASE_JWT_SECRET:
            return jwt.decode(
                token, settings.SUPABASE_JWT_SECRET, algorithms=["HS256"], **common
            )
        signing_key = _get_jwks_client().get_signing_key_from_jwt(token)
        return jwt.decode(
            token,
            signing_key.key,
            algorithms=["RS256", "ES256", "EdDSA"],
            **common,
        )
    except jwt.ExpiredSignatureError as exc:
        raise exceptions.AuthenticationFailed("Session expired. Please sign in again.") from exc
    except jwt.InvalidTokenError as exc:
        raise exceptions.AuthenticationFailed(f"Invalid authentication token: {exc}") from exc


def upsert_user_from_claims(claims: dict) -> User:
    """Map Supabase claims onto a local user row, creating it on first sight."""
    subject = claims.get("sub")
    email = (claims.get("email") or "").lower().strip()
    metadata = claims.get("user_metadata") or {}
    if not subject or not email:
        raise exceptions.AuthenticationFailed("Token is missing a subject or email claim.")

    user = User.objects.filter(supabase_uid=subject).first() or User.objects.filter(email=email).first()
    changed: list[str] = []

    if user is None:
        user = User(email=email, supabase_uid=subject)
        user.set_unusable_password()
        user.full_name = (metadata.get("full_name") or metadata.get("name") or "").strip()
        user.avatar_url = (metadata.get("avatar_url") or "")[:500]
        user.save()
    else:
        if user.supabase_uid != subject:
            user.supabase_uid = subject
            changed.append("supabase_uid")
        if user.email != email:
            user.email = email
            changed.append("email")
        incoming_name = (metadata.get("full_name") or metadata.get("name") or "").strip()
        if incoming_name and incoming_name != user.full_name:
            user.full_name = incoming_name
            changed.append("full_name")
        incoming_avatar = (metadata.get("avatar_url") or "")[:500]
        if incoming_avatar and incoming_avatar != user.avatar_url:
            user.avatar_url = incoming_avatar
            changed.append("avatar_url")

    user.last_seen_at = timezone.now()
    changed.append("last_seen_at")
    if changed:
        user.save(update_fields=list(dict.fromkeys(changed)))

    user.ensure_organization()
    return user


class SupabaseJWTAuthentication(authentication.BaseAuthentication):
    keyword = "Bearer"

    def authenticate(self, request):
        header = authentication.get_authorization_header(request).decode("latin-1")
        if not header:
            return None
        parts = header.split()
        if parts[0].lower() != self.keyword.lower():
            return None
        if len(parts) != 2:
            raise exceptions.AuthenticationFailed("Malformed Authorization header.")

        claims = decode_supabase_token(parts[1])
        user = upsert_user_from_claims(claims)
        if not user.is_active:
            raise exceptions.AuthenticationFailed("This account has been deactivated.")
        return user, claims

    def authenticate_header(self, request):
        return self.keyword
