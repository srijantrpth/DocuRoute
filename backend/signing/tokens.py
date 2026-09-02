"""Stateless magic-link tokens for external signers.

An external signer never creates an account. The link carries a signed JWT whose
claims fully identify the step; the only server state consulted is the recipient's
current `token_jti`, which lets the owner revoke or re-issue a link by rotating it.
"""

from __future__ import annotations

from datetime import timedelta

import jwt
from django.conf import settings
from django.utils import timezone
from rest_framework.exceptions import PermissionDenied

TOKEN_TYPE = "signing"
ALGORITHM = "HS256"


class SigningTokenError(PermissionDenied):
    default_code = "invalid_signing_token"


def issue_token(recipient, *, ttl_hours: int | None = None) -> str:
    now = timezone.now()
    hours = ttl_hours if ttl_hours is not None else settings.SIGNING_TOKEN_TTL_HOURS
    expiry = now + timedelta(hours=hours)

    workflow_expiry = recipient.workflow.expires_at
    if workflow_expiry and workflow_expiry < expiry:
        expiry = workflow_expiry

    claims = {
        "iss": settings.SIGNING_TOKEN_ISSUER,
        "typ": TOKEN_TYPE,
        "sub": str(recipient.id),
        "jti": str(recipient.token_jti),
        "doc": str(recipient.workflow.document_id),
        "eml": recipient.email,
        "ord": recipient.order,
        "iat": int(now.timestamp()),
        "nbf": int(now.timestamp()),
        "exp": int(expiry.timestamp()),
    }
    recipient.token_issued_at = now
    return jwt.encode(claims, settings.SIGNING_TOKEN_SECRET, algorithm=ALGORITHM)


def decode_token(token: str) -> dict:
    try:
        claims = jwt.decode(
            token,
            settings.SIGNING_TOKEN_SECRET,
            algorithms=[ALGORITHM],
            issuer=settings.SIGNING_TOKEN_ISSUER,
            options={"require": ["exp", "sub", "jti", "doc"]},
            leeway=10,
        )
    except jwt.ExpiredSignatureError as exc:
        raise SigningTokenError(
            "This signing link has expired. Ask the sender to issue a new one."
        ) from exc
    except jwt.InvalidTokenError as exc:
        raise SigningTokenError("This signing link is not valid.") from exc

    if claims.get("typ") != TOKEN_TYPE:
        raise SigningTokenError("This signing link is not valid.")
    return claims


def resolve_recipient(token: str):
    """Return the live Recipient a token addresses, or raise."""
    from workflows.models import Recipient

    claims = decode_token(token)
    recipient = (
        Recipient.objects.select_related("workflow__document__organization", "workflow__document__owner")
        .filter(pk=claims["sub"])
        .first()
    )
    if recipient is None:
        raise SigningTokenError("This signing link is no longer valid.")
    if str(recipient.token_jti) != claims["jti"]:
        raise SigningTokenError("This signing link was replaced by a newer one.")
    if str(recipient.workflow.document_id) != claims["doc"]:
        raise SigningTokenError("This signing link is not valid.")
    return recipient, claims


def build_sign_url(token: str) -> str:
    return f"{settings.FRONTEND_URL}/sign/{token}"
