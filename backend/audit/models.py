import uuid

from django.conf import settings
from django.db import models, transaction
from django.utils import timezone

from core.hashing import GENESIS_HASH, chain_hash, hash_payload


class EventType(models.TextChoices):
    DOCUMENT_CREATED = "document.created", "Document created"
    DOCUMENT_UPLOADED = "document.uploaded", "File uploaded"
    WORKFLOW_SAVED = "workflow.saved", "Workflow saved"
    WORKFLOW_SENT = "workflow.sent", "Sent for signature"
    INVITATION_SENT = "invitation.sent", "Invitation sent"
    DOCUMENT_VIEWED = "document.viewed", "Document viewed"
    SIGNATURE_APPLIED = "signature.applied", "Signature applied"
    RECIPIENT_APPROVED = "recipient.approved", "Approved"
    RECIPIENT_DECLINED = "recipient.declined", "Declined"
    DOCUMENT_EXECUTED = "document.executed", "Document executed"
    DOCUMENT_VOIDED = "document.voided", "Document voided"
    DOCUMENT_DOWNLOADED = "document.downloaded", "Document downloaded"


class AuditEvent(models.Model):
    """Append-only, hash-chained event.

    `payload_hash` covers the event's own content; `chain_hash` folds in the previous
    event's `chain_hash`, so altering or removing any earlier row breaks every link
    after it. Rows are never updated or deleted.
    """

    id = models.UUIDField(primary_key=True, default=uuid.uuid4, editable=False)
    document = models.ForeignKey(
        "documents.Document", on_delete=models.CASCADE, related_name="audit_events"
    )
    seq = models.PositiveIntegerField()
    event_type = models.CharField(max_length=40, choices=EventType.choices)

    actor_user = models.ForeignKey(
        settings.AUTH_USER_MODEL, on_delete=models.SET_NULL, null=True, blank=True
    )
    actor_recipient = models.ForeignKey(
        "workflows.Recipient", on_delete=models.SET_NULL, null=True, blank=True
    )
    actor_label = models.CharField(max_length=200, blank=True)

    ip_address = models.GenericIPAddressField(null=True, blank=True)
    user_agent = models.CharField(max_length=500, blank=True)
    metadata = models.JSONField(default=dict, blank=True)

    revision_sha256 = models.CharField(max_length=64, blank=True)
    payload_hash = models.CharField(max_length=64)
    prev_hash = models.CharField(max_length=64)
    chain_hash = models.CharField(max_length=64, db_index=True)

    # Not auto_now_add: the timestamp is part of the hashed payload, so it must be
    # fixed before hashing rather than rewritten by the ORM on save.
    created_at = models.DateTimeField(default=timezone.now, db_index=True)

    class Meta:
        ordering = ["document", "seq"]
        constraints = [
            models.UniqueConstraint(fields=["document", "seq"], name="unique_event_seq")
        ]
        indexes = [models.Index(fields=["document", "-seq"])]

    def __str__(self):
        return f"#{self.seq} {self.event_type}"

    def compute_payload(self) -> dict:
        return {
            "document": str(self.document_id),
            "seq": self.seq,
            "event_type": self.event_type,
            "actor_user": str(self.actor_user_id) if self.actor_user_id else None,
            "actor_recipient": str(self.actor_recipient_id) if self.actor_recipient_id else None,
            "actor_label": self.actor_label,
            "ip_address": self.ip_address,
            "user_agent": self.user_agent,
            "metadata": self.metadata,
            "revision_sha256": self.revision_sha256,
            "created_at": self.created_at.isoformat() if self.created_at else None,
        }

    def verify(self, prev_hash: str) -> bool:
        return (
            self.prev_hash == prev_hash
            and self.payload_hash == hash_payload(self.compute_payload())
            and self.chain_hash == chain_hash(prev_hash, self.payload_hash)
        )


@transaction.atomic
def record_event(
    document,
    event_type,
    *,
    actor_user=None,
    actor_recipient=None,
    actor_label="",
    ip_address=None,
    user_agent="",
    metadata=None,
    revision_sha256="",
) -> AuditEvent:
    """Append one link to a document's chain. Serialised per document."""
    from documents.models import Document

    # Lock the document row so two concurrent signers cannot claim the same seq.
    Document.objects.select_for_update().filter(pk=document.pk).first()

    previous = (
        AuditEvent.objects.filter(document=document).order_by("-seq").values("seq", "chain_hash").first()
    )
    seq = (previous["seq"] + 1) if previous else 0
    prev_hash = previous["chain_hash"] if previous else GENESIS_HASH

    if not actor_label:
        if actor_user is not None:
            actor_label = f"{actor_user.display_name} (Owner)"
        elif actor_recipient is not None:
            actor_label = f"{actor_recipient.name} ({actor_recipient.get_role_display()})"
        else:
            actor_label = "System"

    event = AuditEvent(
        document=document,
        seq=seq,
        event_type=event_type,
        actor_user=actor_user,
        actor_recipient=actor_recipient,
        actor_label=actor_label,
        ip_address=ip_address or None,
        user_agent=(user_agent or "")[:500],
        metadata=metadata or {},
        revision_sha256=revision_sha256 or "",
        prev_hash=prev_hash,
    )
    event.created_at = timezone.now()
    event.payload_hash = hash_payload(event.compute_payload())
    event.chain_hash = chain_hash(prev_hash, event.payload_hash)
    event.save()
    return event


def verify_chain(document) -> dict:
    """Walk a document's chain and report the first break, if any."""
    events = list(AuditEvent.objects.filter(document=document).order_by("seq"))
    prev_hash = GENESIS_HASH
    for index, event in enumerate(events):
        if event.seq != index:
            return {
                "valid": False,
                "checked": index,
                "total": len(events),
                "broken_at": event.seq,
                "reason": f"Sequence gap: expected {index}, found {event.seq}.",
            }
        if not event.verify(prev_hash):
            return {
                "valid": False,
                "checked": index,
                "total": len(events),
                "broken_at": event.seq,
                "reason": "Hash mismatch: this event or an earlier one was altered.",
            }
        prev_hash = event.chain_hash
    return {
        "valid": True,
        "checked": len(events),
        "total": len(events),
        "broken_at": None,
        "head_hash": prev_hash,
        "reason": "Every event hashes to its predecessor.",
    }
