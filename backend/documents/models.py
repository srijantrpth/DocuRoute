import uuid

from django.conf import settings
from django.db import models


class DocumentStatus(models.TextChoices):
    DRAFT = "draft", "Draft"
    ROUTING = "routing", "Out for signature"
    COMPLETED = "completed", "Executed"
    DECLINED = "declined", "Declined"
    VOIDED = "voided", "Voided"
    EXPIRED = "expired", "Expired"


TERMINAL_STATUSES = {
    DocumentStatus.COMPLETED,
    DocumentStatus.DECLINED,
    DocumentStatus.VOIDED,
    DocumentStatus.EXPIRED,
}


class Document(models.Model):
    id = models.UUIDField(primary_key=True, default=uuid.uuid4, editable=False)
    organization = models.ForeignKey(
        "accounts.Organization", on_delete=models.CASCADE, related_name="documents"
    )
    owner = models.ForeignKey(
        settings.AUTH_USER_MODEL, on_delete=models.CASCADE, related_name="documents"
    )

    title = models.CharField(max_length=255)
    filename = models.CharField(max_length=255, blank=True)
    storage_path = models.CharField(max_length=512, blank=True)
    content_type = models.CharField(max_length=120, default="application/pdf")
    size_bytes = models.BigIntegerField(default=0)
    page_count = models.PositiveIntegerField(default=0)

    status = models.CharField(
        max_length=16, choices=DocumentStatus.choices, default=DocumentStatus.DRAFT, db_index=True
    )

    # Populated once every recipient completes.
    executed_storage_path = models.CharField(max_length=512, blank=True)
    executed_sha256 = models.CharField(max_length=64, blank=True)

    created_at = models.DateTimeField(auto_now_add=True)
    updated_at = models.DateTimeField(auto_now=True)
    sent_at = models.DateTimeField(null=True, blank=True)
    completed_at = models.DateTimeField(null=True, blank=True)

    class Meta:
        ordering = ["-created_at"]
        indexes = [
            models.Index(fields=["organization", "status"]),
            models.Index(fields=["owner", "-created_at"]),
        ]

    def __str__(self):
        return self.title

    @property
    def is_terminal(self) -> bool:
        return self.status in TERMINAL_STATUSES

    @property
    def is_editable(self) -> bool:
        return self.status == DocumentStatus.DRAFT

    @property
    def original_sha256(self) -> str:
        first = self.revisions.order_by("index").first()
        return first.sha256 if first else ""

    @property
    def latest_revision(self):
        return self.revisions.order_by("-index").first()


class DocumentRevision(models.Model):
    """Immutable record of one stored byte-stream for a document.

    Revision 0 is the uploaded original; the executed PDF is appended as the last
    revision. Each row keeps the SHA-256 so the audit trail can prove which bytes
    a given event referred to.
    """

    class Kind(models.TextChoices):
        ORIGINAL = "original", "Original upload"
        EXECUTED = "executed", "Executed copy"

    id = models.UUIDField(primary_key=True, default=uuid.uuid4, editable=False)
    document = models.ForeignKey(Document, on_delete=models.CASCADE, related_name="revisions")
    index = models.PositiveIntegerField()
    kind = models.CharField(max_length=16, choices=Kind.choices, default=Kind.ORIGINAL)
    storage_path = models.CharField(max_length=512)
    sha256 = models.CharField(max_length=64)
    size_bytes = models.BigIntegerField(default=0)
    page_count = models.PositiveIntegerField(default=0)
    note = models.CharField(max_length=255, blank=True)
    created_by = models.ForeignKey(
        settings.AUTH_USER_MODEL, on_delete=models.SET_NULL, null=True, blank=True
    )
    created_at = models.DateTimeField(auto_now_add=True)

    class Meta:
        ordering = ["document", "index"]
        constraints = [
            models.UniqueConstraint(fields=["document", "index"], name="unique_revision_index")
        ]

    def __str__(self):
        return f"{self.document_id} rev {self.index}"
