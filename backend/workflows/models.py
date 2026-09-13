import uuid

from django.conf import settings
from django.db import models


class RoutingMode(models.TextChoices):
    SEQUENTIAL = "sequential", "Sequential"
    PARALLEL = "parallel", "Parallel"


class Workflow(models.Model):
    id = models.UUIDField(primary_key=True, default=uuid.uuid4, editable=False)
    document = models.OneToOneField(
        "documents.Document", on_delete=models.CASCADE, related_name="workflow"
    )
    name = models.CharField(max_length=200, blank=True)
    mode = models.CharField(
        max_length=16, choices=RoutingMode.choices, default=RoutingMode.SEQUENTIAL
    )
    message = models.TextField(blank=True, help_text="Note included in every invitation email.")
    expires_at = models.DateTimeField(null=True, blank=True)
    reminder_days = models.PositiveSmallIntegerField(default=3)
    created_by = models.ForeignKey(
        settings.AUTH_USER_MODEL, on_delete=models.SET_NULL, null=True, blank=True
    )
    created_at = models.DateTimeField(auto_now_add=True)
    updated_at = models.DateTimeField(auto_now=True)

    def __str__(self):
        return self.name or f"Workflow for {self.document_id}"


class RecipientRole(models.TextChoices):
    SIGNER = "signer", "Needs to sign"
    APPROVER = "approver", "Needs to approve"
    VIEWER = "viewer", "Receives a copy"


class RecipientStatus(models.TextChoices):
    PENDING = "pending", "Waiting for earlier steps"
    SENT = "sent", "Invitation sent"
    VIEWED = "viewed", "Opened the document"
    COMPLETED = "completed", "Completed"
    DECLINED = "declined", "Declined"


class Recipient(models.Model):
    """One step in the routing order.

    External signers never get an account: they are addressed only by email and a
    stateless signed token whose `jti` is mirrored here so it can be rotated.
    """

    id = models.UUIDField(primary_key=True, default=uuid.uuid4, editable=False)
    workflow = models.ForeignKey(Workflow, on_delete=models.CASCADE, related_name="recipients")
    order = models.PositiveSmallIntegerField(default=0)
    name = models.CharField(max_length=180)
    email = models.EmailField()
    role = models.CharField(max_length=16, choices=RecipientRole.choices, default=RecipientRole.SIGNER)
    status = models.CharField(
        max_length=16, choices=RecipientStatus.choices, default=RecipientStatus.PENDING, db_index=True
    )

    token_jti = models.UUIDField(default=uuid.uuid4, editable=False)
    token_issued_at = models.DateTimeField(null=True, blank=True)

    sent_at = models.DateTimeField(null=True, blank=True)
    first_viewed_at = models.DateTimeField(null=True, blank=True)
    completed_at = models.DateTimeField(null=True, blank=True)
    decline_reason = models.TextField(blank=True)

    last_ip = models.GenericIPAddressField(null=True, blank=True)
    last_user_agent = models.CharField(max_length=500, blank=True)

    class Meta:
        ordering = ["order", "id"]
        constraints = [
            models.UniqueConstraint(
                fields=["workflow", "email"], name="unique_recipient_email_per_workflow"
            )
        ]
        indexes = [models.Index(fields=["workflow", "order"])]

    def __str__(self):
        return f"{self.name} <{self.email}> (step {self.order + 1})"

    @property
    def is_done(self) -> bool:
        return self.status in {RecipientStatus.COMPLETED, RecipientStatus.DECLINED}

    @property
    def initials(self) -> str:
        parts = [p for p in (self.name or self.email).replace(".", " ").split() if p]
        if len(parts) >= 2:
            return (parts[0][0] + parts[-1][0]).upper()
        return (parts[0][:2] if parts else "?").upper()

    def rotate_token(self):
        self.token_jti = uuid.uuid4()


class FieldKind(models.TextChoices):
    SIGNATURE = "signature", "Signature"
    INITIALS = "initials", "Initials"
    DATE = "date", "Date signed"
    TEXT = "text", "Text"
    CHECKBOX = "checkbox", "Checkbox"


class Field(models.Model):
    """A placed input box. Geometry is normalised 0..1 against the page, top-left origin."""

    id = models.UUIDField(primary_key=True, default=uuid.uuid4, editable=False)
    document = models.ForeignKey(
        "documents.Document", on_delete=models.CASCADE, related_name="fields"
    )
    recipient = models.ForeignKey(
        Recipient, on_delete=models.CASCADE, related_name="fields", null=True, blank=True
    )
    kind = models.CharField(max_length=16, choices=FieldKind.choices, default=FieldKind.SIGNATURE)
    label = models.CharField(max_length=120, blank=True)
    page = models.PositiveSmallIntegerField(default=0)

    x = models.FloatField(default=0.1)
    y = models.FloatField(default=0.1)
    width = models.FloatField(default=0.24)
    height = models.FloatField(default=0.06)

    required = models.BooleanField(default=True)
    value = models.TextField(blank=True)
    filled_at = models.DateTimeField(null=True, blank=True)

    created_at = models.DateTimeField(auto_now_add=True)

    class Meta:
        ordering = ["page", "y", "x"]
        indexes = [models.Index(fields=["document", "page"])]

    def __str__(self):
        return f"{self.kind} p{self.page} for {self.recipient_id}"

    @property
    def is_filled(self) -> bool:
        return bool((self.value or "").strip())
