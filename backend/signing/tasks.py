"""Celery background tasks for signing, invitations, certificates, and reminders."""

from __future__ import annotations

import logging
from datetime import timedelta

from celery import shared_task
from django.contrib.auth import get_user_model
from django.utils import timezone

from core import mailer
from documents.models import Document, DocumentStatus
from workflows.models import Recipient, RecipientRole, RecipientStatus

logger = logging.getLogger(__name__)
User = get_user_model()


@shared_task(bind=True, max_retries=3, default_retry_delay=15)
def send_invitation_email_task(
    self,
    recipient_id: str,
    document_id: str,
    sign_url: str,
    sender_name: str,
    message: str = "",
) -> bool:
    """Async task to deliver signing invitation email via SMTP / configured mailer."""
    try:
        recipient = Recipient.objects.get(pk=recipient_id)
        document = Document.objects.get(pk=document_id)
        return mailer.send_signing_invitation(
            recipient=recipient,
            document=document,
            sign_url=sign_url,
            sender_name=sender_name,
            message=message,
        )
    except Exception as exc:
        logger.exception("Failed to send invitation email to recipient %s: %s", recipient_id, exc)
        raise self.retry(exc=exc)


@shared_task(bind=True, max_retries=3, default_retry_delay=20)
def send_completion_notice_task(
    self,
    emails: list[str],
    document_id: str,
    download_url: str,
    final_hash: str,
) -> bool:
    """Async task to deliver document completion notices with download links."""
    try:
        document = Document.objects.get(pk=document_id)
        return mailer.send_completion_notice(
            emails=emails,
            document=document,
            download_url=download_url,
            final_hash=final_hash,
        )
    except Exception as exc:
        logger.exception("Failed to send completion notice for document %s: %s", document_id, exc)
        raise self.retry(exc=exc)


@shared_task(bind=True, max_retries=3, default_retry_delay=15)
def send_invitation_task(
    self,
    recipient_id: str,
    document_id: str,
    actor_id: str | None = None,
    ip: str | None = None,
    user_agent: str = "",
) -> bool:
    """Async task to issue tokens and send invitation emails."""
    from signing.services import send_invitation

    try:
        recipient = Recipient.objects.select_related("workflow", "workflow__document").get(pk=recipient_id)
        document = Document.objects.select_related("owner").get(pk=document_id)
        actor = User.objects.filter(pk=actor_id).first() if actor_id else None
        return send_invitation(recipient, document, actor=actor, ip=ip, user_agent=user_agent)
    except Exception as exc:
        logger.exception("Failed to run send_invitation_task for recipient %s: %s", recipient_id, exc)
        raise self.retry(exc=exc)


@shared_task(bind=True, max_retries=2, default_retry_delay=30)
def execute_document_task(
    self,
    document_id: str,
    ip: str | None = None,
    user_agent: str = "",
) -> bool:
    """Async task to flatten, watermark, stamp certificates and notify stakeholders."""
    from signing.services import execute_document

    try:
        document = Document.objects.select_related("workflow", "owner").get(pk=document_id)
        execute_document(document, ip=ip, user_agent=user_agent)
        return True
    except Exception as exc:
        logger.exception("Failed to run execute_document_task for document %s: %s", document_id, exc)
        raise self.retry(exc=exc)


@shared_task(bind=True, max_retries=3, default_retry_delay=15)
def send_declined_notice_task(
    self,
    document_id: str,
    recipient_id: str,
    reason: str = "",
) -> bool:
    """Async task to dispatch declined notices to stakeholders."""
    from signing.services import _stakeholder_emails

    try:
        document = Document.objects.select_related("workflow", "owner").get(pk=document_id)
        recipient = Recipient.objects.get(pk=recipient_id)
        return mailer.send_declined_notice(
            emails=_stakeholder_emails(document),
            document=document,
            recipient_name=recipient.name,
            reason=reason or recipient.decline_reason,
        )
    except Exception as exc:
        logger.exception("Failed to run send_declined_notice_task for document %s: %s", document_id, exc)
        raise self.retry(exc=exc)


@shared_task
def send_pending_reminders_task() -> int:
    """Periodic task: scan active routing workflows and remind pending signers."""
    from signing.services import send_invitation

    now = timezone.now()
    active_docs = Document.objects.filter(status=DocumentStatus.ROUTING).select_related("workflow", "owner")

    reminded_count = 0
    for doc in active_docs:
        workflow = getattr(doc, "workflow", None)
        if not workflow:
            continue
        days = workflow.reminder_days or 3
        cutoff = now - timedelta(days=days)

        pending_recipients = workflow.recipients.filter(
            status__in=[RecipientStatus.SENT, RecipientStatus.VIEWED],
            sent_at__lte=cutoff,
        ).exclude(role=RecipientRole.VIEWER)

        for recipient in pending_recipients:
            try:
                send_invitation(recipient, doc, actor=None, ip=None, user_agent="DocuRoute-Reminder-Service")
                reminded_count += 1
            except Exception as exc:
                logger.warning("Failed to send reminder to %s for document %s: %s", recipient.email, doc.id, exc)

    logger.info("send_pending_reminders_task completed. Sent %d reminder(s).", reminded_count)
    return reminded_count
