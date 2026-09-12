"""Routing state machine: send, advance, complete, decline, execute."""

from __future__ import annotations

import logging

from django.db import transaction
from django.utils import timezone
from rest_framework.exceptions import ValidationError

from audit.models import EventType, record_event
from core import mailer
from core.hashing import sha256_bytes
from core.pdf import StampField, build_final_pdf
from core.storage import storage
from documents.models import Document, DocumentRevision, DocumentStatus
from workflows.models import Recipient, RecipientRole, RecipientStatus, RoutingMode

from .tokens import build_sign_url, issue_token

logger = logging.getLogger(__name__)


# --- helpers --------------------------------------------------------------
def _stakeholder_emails(document) -> list[str]:
    emails = {document.owner.email}
    workflow = getattr(document, "workflow", None)
    if workflow:
        emails.update(workflow.recipients.values_list("email", flat=True))
    return sorted(email for email in emails if email)


def send_invitation(recipient, document, *, actor=None, ip=None, user_agent="") -> bool:
    recipient.rotate_token()
    token = issue_token(recipient)
    recipient.status = RecipientStatus.SENT
    recipient.sent_at = timezone.now()
    recipient.save(update_fields=["token_jti", "token_issued_at", "status", "sent_at"])

    sender = document.owner.display_name
    delivered = mailer.send_signing_invitation(
        recipient=recipient,
        document=document,
        sign_url=build_sign_url(token),
        sender_name=sender,
        message=recipient.workflow.message,
    )
    record_event(
        document,
        EventType.INVITATION_SENT,
        actor_user=actor,
        actor_label=f"{sender} (Owner)" if actor else "System",
        ip_address=ip,
        user_agent=user_agent,
        metadata={
            "recipient": recipient.email,
            "recipient_name": recipient.name,
            "step": recipient.order + 1,
            "role": recipient.role,
            "delivered": delivered,
        },
    )
    return delivered


def _next_pending(workflow):
    return (
        workflow.recipients.filter(status=RecipientStatus.PENDING)
        .exclude(role=RecipientRole.VIEWER)
        .order_by("order")
        .first()
    )


def _all_signers_done(workflow) -> bool:
    return not workflow.recipients.exclude(role=RecipientRole.VIEWER).exclude(
        status=RecipientStatus.COMPLETED
    ).exists()


# --- public operations ----------------------------------------------------
@transaction.atomic
def send_workflow(document: Document, *, actor, ip=None, user_agent="") -> dict:
    """Validate the routing plan and dispatch the first invitation(s)."""
    document = Document.objects.select_for_update().get(pk=document.pk)
    workflow = getattr(document, "workflow", None)

    if workflow is None:
        raise ValidationError({"workflow": ["Add at least one recipient before sending."]})
    if document.status != DocumentStatus.DRAFT:
        raise ValidationError({"status": [f"This document is already {document.get_status_display().lower()}."]})
    if not document.storage_path:
        raise ValidationError({"file": ["Upload the document file before sending."]})

    signers = list(workflow.recipients.exclude(role=RecipientRole.VIEWER).order_by("order"))
    if not signers:
        raise ValidationError({"recipients": ["Add at least one signer or approver."]})

    unassigned = document.fields.filter(recipient__isnull=True).count()
    if unassigned:
        raise ValidationError(
            {"fields": [f"{unassigned} field(s) are not assigned to a recipient."]}
        )
    for signer in signers:
        if signer.role == RecipientRole.SIGNER and not signer.fields.exists():
            raise ValidationError(
                {"fields": [f"{signer.name} has no fields to complete. Place at least one."]}
            )

    document.status = DocumentStatus.ROUTING
    document.sent_at = timezone.now()
    document.save(update_fields=["status", "sent_at", "updated_at"])

    record_event(
        document,
        EventType.WORKFLOW_SENT,
        actor_user=actor,
        ip_address=ip,
        user_agent=user_agent,
        metadata={
            "mode": workflow.mode,
            "recipients": [
                {"name": s.name, "email": s.email, "role": s.role, "step": s.order + 1}
                for s in signers
            ],
        },
        revision_sha256=document.original_sha256,
    )

    targets = signers if workflow.mode == RoutingMode.PARALLEL else signers[:1]
    delivered = sum(1 for r in targets if send_invitation(r, document, actor=actor, ip=ip, user_agent=user_agent))

    # Viewers get their copy only once the document is executed.
    return {"invited": len(targets), "delivered": delivered, "status": document.status}


@transaction.atomic
def mark_viewed(recipient: Recipient, *, ip=None, user_agent="") -> None:
    document = recipient.workflow.document
    first_view = recipient.first_viewed_at is None
    now = timezone.now()

    updates = ["last_ip", "last_user_agent"]
    recipient.last_ip = ip or None
    recipient.last_user_agent = (user_agent or "")[:500]
    if first_view:
        recipient.first_viewed_at = now
        updates.append("first_viewed_at")
    if recipient.status == RecipientStatus.SENT:
        recipient.status = RecipientStatus.VIEWED
        updates.append("status")
    recipient.save(update_fields=updates)

    if first_view:
        record_event(
            document,
            EventType.DOCUMENT_VIEWED,
            actor_recipient=recipient,
            ip_address=ip,
            user_agent=user_agent,
            metadata={"step": recipient.order + 1, "email": recipient.email},
            revision_sha256=document.original_sha256,
        )


@transaction.atomic
def submit_recipient(recipient: Recipient, values: dict, *, ip=None, user_agent="") -> dict:
    """Persist this recipient's field values, then advance or execute the document."""
    document = Document.objects.select_for_update().get(pk=recipient.workflow.document_id)
    workflow = recipient.workflow

    if document.status != DocumentStatus.ROUTING:
        raise ValidationError({"status": ["This document is no longer accepting signatures."]})
    if recipient.is_done:
        raise ValidationError({"status": ["You have already completed this document."]})
    if workflow.mode == RoutingMode.SEQUENTIAL:
        blocking = (
            workflow.recipients.exclude(role=RecipientRole.VIEWER)
            .filter(order__lt=recipient.order)
            .exclude(status=RecipientStatus.COMPLETED)
            .order_by("order")
            .first()
        )
        if blocking is not None:
            raise ValidationError(
                {"status": [f"Waiting on {blocking.name} to complete step {blocking.order + 1}."]}
            )
    if workflow.expires_at and workflow.expires_at < timezone.now():
        document.status = DocumentStatus.EXPIRED
        document.save(update_fields=["status", "updated_at"])
        raise ValidationError({"status": ["This signing request has expired."]})

    now = timezone.now()
    fields = list(recipient.fields.all())
    filled = 0
    for field in fields:
        raw = values.get(str(field.id))
        if raw is None:
            if field.required and not field.is_filled:
                raise ValidationError({"fields": [f"'{field.label or field.kind}' is required."]})
            continue
        value = str(raw).strip()
        if field.required and not value:
            raise ValidationError({"fields": [f"'{field.label or field.kind}' is required."]})
        field.value = value
        field.filled_at = now
        field.save(update_fields=["value", "filled_at"])
        filled += 1

    missing = [f for f in recipient.fields.all() if f.required and not f.is_filled]
    if missing:
        raise ValidationError(
            {"fields": [f"{len(missing)} required field(s) still need to be completed."]}
        )

    recipient.status = RecipientStatus.COMPLETED
    recipient.completed_at = now
    recipient.last_ip = ip or None
    recipient.last_user_agent = (user_agent or "")[:500]
    # The token stays valid so the signer can revisit their confirmation and the
    # executed copy; `is_done` is what prevents a second submission.
    recipient.save(
        update_fields=["status", "completed_at", "last_ip", "last_user_agent"]
    )

    event_type = (
        EventType.RECIPIENT_APPROVED
        if recipient.role == RecipientRole.APPROVER
        else EventType.SIGNATURE_APPLIED
    )
    record_event(
        document,
        event_type,
        actor_recipient=recipient,
        ip_address=ip,
        user_agent=user_agent,
        metadata={
            "step": recipient.order + 1,
            "email": recipient.email,
            "fields_completed": filled,
            "field_kinds": sorted({f.kind for f in fields}),
        },
        revision_sha256=document.original_sha256,
    )

    if _all_signers_done(workflow):
        execute_document(document, ip=ip, user_agent=user_agent)
        return {"status": "executed", "document_status": DocumentStatus.COMPLETED}

    if workflow.mode == RoutingMode.SEQUENTIAL:
        upcoming = _next_pending(workflow)
        if upcoming is not None:
            send_invitation(upcoming, document, ip=ip, user_agent=user_agent)
            return {"status": "advanced", "next_step": upcoming.order + 1}

    return {"status": "waiting", "document_status": document.status}


@transaction.atomic
def decline_recipient(recipient: Recipient, reason: str, *, ip=None, user_agent="") -> dict:
    document = Document.objects.select_for_update().get(pk=recipient.workflow.document_id)
    if document.status != DocumentStatus.ROUTING:
        raise ValidationError({"status": ["This document is no longer active."]})
    if recipient.is_done:
        raise ValidationError({"status": ["You have already responded to this document."]})

    now = timezone.now()
    recipient.status = RecipientStatus.DECLINED
    recipient.decline_reason = (reason or "").strip()[:2000]
    recipient.completed_at = now
    recipient.last_ip = ip or None
    recipient.save(
        update_fields=["status", "decline_reason", "completed_at", "last_ip"]
    )

    document.status = DocumentStatus.DECLINED
    document.save(update_fields=["status", "updated_at"])

    record_event(
        document,
        EventType.RECIPIENT_DECLINED,
        actor_recipient=recipient,
        ip_address=ip,
        user_agent=user_agent,
        metadata={"step": recipient.order + 1, "email": recipient.email, "reason": recipient.decline_reason},
        revision_sha256=document.original_sha256,
    )
    mailer.send_declined_notice(
        emails=_stakeholder_emails(document),
        document=document,
        recipient_name=recipient.name,
        reason=recipient.decline_reason,
    )
    return {"status": "declined"}


def execute_document(document: Document, *, ip=None, user_agent="") -> Document:
    """Flatten fields into a watermarked PDF, store it, and notify everyone."""
    workflow = document.workflow
    recipients = list(workflow.recipients.order_by("order"))
    now = timezone.now()

    source = storage.download_bytes(document.storage_path)

    stamps = [
        StampField(
            page=field.page,
            x=field.x,
            y=field.y,
            width=field.width,
            height=field.height,
            kind=field.kind,
            value=field.value or "",
            label=(field.recipient.name if field.recipient else ""),
        )
        for field in document.fields.select_related("recipient").all()
        if field.is_filled
    ]

    events = list(
        document.audit_events.order_by("seq").values(
            "seq", "event_type", "actor_label", "created_at", "chain_hash"
        )
    )
    watermark = f"Executed via DocuRoute | {document.id} | {now.strftime('%Y-%m-%d %H:%M UTC')}"

    final_bytes = build_final_pdf(
        source,
        stamps,
        watermark_text=watermark,
        document={
            "id": str(document.id),
            "title": document.title,
            "original_hash": document.original_sha256,
            "completed_at": now.isoformat(),
        },
        recipients=[
            {
                "name": r.name,
                "email": r.email,
                "role": r.get_role_display(),
                "status": r.get_status_display(),
                "completed_at": r.completed_at.isoformat() if r.completed_at else None,
                "ip": r.last_ip,
            }
            for r in recipients
        ],
        events=events,
    )

    final_hash = sha256_bytes(final_bytes)
    executed_path = storage.build_path(
        document.organization_id, document.id, f"executed-{document.filename or 'document.pdf'}",
        prefix="executed",
    )
    storage.upload_bytes(executed_path, final_bytes, content_type="application/pdf")

    next_index = (document.revisions.order_by("-index").first().index + 1) if document.revisions.exists() else 0
    DocumentRevision.objects.create(
        document=document,
        index=next_index,
        kind=DocumentRevision.Kind.EXECUTED,
        storage_path=executed_path,
        sha256=final_hash,
        size_bytes=len(final_bytes),
        page_count=document.page_count,
        note="Watermarked execution copy with certificate of completion",
    )

    document.status = DocumentStatus.COMPLETED
    document.completed_at = now
    document.executed_storage_path = executed_path
    document.executed_sha256 = final_hash
    document.save(
        update_fields=[
            "status", "completed_at", "executed_storage_path", "executed_sha256", "updated_at",
        ]
    )

    record_event(
        document,
        EventType.DOCUMENT_EXECUTED,
        actor_label="System (Auto-Execute)",
        ip_address=ip,
        user_agent=user_agent,
        metadata={
            "signers": len([r for r in recipients if r.role != RecipientRole.VIEWER]),
            "size_bytes": len(final_bytes),
            "storage_path": executed_path,
        },
        revision_sha256=final_hash,
    )

    try:
        download_url = storage.create_signed_download(
            executed_path, expires_in=7 * 24 * 3600, download_name=document.filename or "executed.pdf"
        )
        mailer.send_completion_notice(
            emails=_stakeholder_emails(document),
            document=document,
            download_url=download_url,
            final_hash=final_hash,
        )
    except Exception:
        logger.exception("Executed %s but could not send completion notice", document.id)

    return document


@transaction.atomic
def void_document(document: Document, reason: str, *, actor, ip=None, user_agent="") -> Document:
    if document.is_terminal:
        raise ValidationError({"status": ["This document is already closed."]})
    document.status = DocumentStatus.VOIDED
    document.save(update_fields=["status", "updated_at"])
    for recipient in document.workflow.recipients.all() if hasattr(document, "workflow") else []:
        recipient.rotate_token()  # invalidate every outstanding link
        recipient.save(update_fields=["token_jti"])
    record_event(
        document,
        EventType.DOCUMENT_VOIDED,
        actor_user=actor,
        ip_address=ip,
        user_agent=user_agent,
        metadata={"reason": (reason or "").strip()[:500]},
    )
    return document
