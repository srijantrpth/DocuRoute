from django.db import transaction
from rest_framework import serializers

from .models import Field, Recipient, Workflow


class FieldSerializer(serializers.ModelSerializer):
    is_filled = serializers.BooleanField(read_only=True)

    class Meta:
        model = Field
        fields = [
            "id", "recipient", "kind", "label", "page",
            "x", "y", "width", "height", "required",
            "value", "filled_at", "is_filled",
        ]
        read_only_fields = ["id", "filled_at", "is_filled"]


class RecipientSerializer(serializers.ModelSerializer):
    status_display = serializers.CharField(source="get_status_display", read_only=True)
    role_display = serializers.CharField(source="get_role_display", read_only=True)
    initials = serializers.CharField(read_only=True)
    field_count = serializers.IntegerField(source="fields.count", read_only=True)

    class Meta:
        model = Recipient
        fields = [
            "id", "order", "name", "email", "role", "role_display",
            "status", "status_display", "initials", "field_count",
            "sent_at", "first_viewed_at", "completed_at", "decline_reason", "last_ip",
        ]
        read_only_fields = [
            "id", "status", "status_display", "role_display", "initials", "field_count",
            "sent_at", "first_viewed_at", "completed_at", "decline_reason", "last_ip",
        ]


class WorkflowSerializer(serializers.ModelSerializer):
    recipients = RecipientSerializer(many=True, read_only=True)

    class Meta:
        model = Workflow
        fields = [
            "id", "name", "mode", "message", "expires_at",
            "reminder_days", "recipients", "created_at", "updated_at",
        ]
        read_only_fields = ["id", "recipients", "created_at", "updated_at"]


# --- write payload --------------------------------------------------------
class RecipientInputSerializer(serializers.Serializer):
    id = serializers.UUIDField(required=False)
    name = serializers.CharField(max_length=180)
    email = serializers.EmailField()
    role = serializers.ChoiceField(choices=Recipient._meta.get_field("role").choices, default="signer")
    order = serializers.IntegerField(min_value=0)


class FieldInputSerializer(serializers.Serializer):
    id = serializers.UUIDField(required=False)
    recipient_index = serializers.IntegerField(min_value=0)
    kind = serializers.ChoiceField(choices=Field._meta.get_field("kind").choices, default="signature")
    label = serializers.CharField(max_length=120, required=False, allow_blank=True)
    page = serializers.IntegerField(min_value=0, default=0)
    x = serializers.FloatField(min_value=0, max_value=1)
    y = serializers.FloatField(min_value=0, max_value=1)
    width = serializers.FloatField(min_value=0.005, max_value=1)
    height = serializers.FloatField(min_value=0.005, max_value=1)
    required = serializers.BooleanField(default=True)


class WorkflowWriteSerializer(serializers.Serializer):
    """Whole-plan replace: the builder always posts the complete recipient + field set."""

    name = serializers.CharField(max_length=200, required=False, allow_blank=True)
    mode = serializers.ChoiceField(choices=Workflow._meta.get_field("mode").choices, default="sequential")
    message = serializers.CharField(required=False, allow_blank=True)
    expires_at = serializers.DateTimeField(required=False, allow_null=True)
    reminder_days = serializers.IntegerField(min_value=0, max_value=30, default=3)
    recipients = RecipientInputSerializer(many=True)
    fields = FieldInputSerializer(many=True, required=False)

    def validate(self, attrs):
        recipients = attrs.get("recipients") or []
        if not recipients:
            raise serializers.ValidationError({"recipients": ["Add at least one recipient."]})

        emails = [r["email"].lower() for r in recipients]
        duplicates = {email for email in emails if emails.count(email) > 1}
        if duplicates:
            raise serializers.ValidationError(
                {"recipients": [f"Each recipient needs a unique email. Repeated: {', '.join(sorted(duplicates))}"]}
            )

        for field in attrs.get("fields") or []:
            if field["recipient_index"] >= len(recipients):
                raise serializers.ValidationError(
                    {"fields": ["A field points at a recipient that is not in the list."]}
                )
            if field["x"] + field["width"] > 1.001 or field["y"] + field["height"] > 1.001:
                raise serializers.ValidationError({"fields": ["A field falls outside the page bounds."]})
        return attrs

    @transaction.atomic
    def save(self, *, document, user):
        data = self.validated_data
        workflow, _ = Workflow.objects.get_or_create(
            document=document, defaults={"created_by": user}
        )
        workflow.name = data.get("name") or document.title
        workflow.mode = data["mode"]
        workflow.message = data.get("message", "")
        workflow.expires_at = data.get("expires_at")
        workflow.reminder_days = data.get("reminder_days", 3)
        workflow.save()

        # Replace the plan wholesale; a draft has no signatures to preserve.
        workflow.recipients.all().delete()
        document.fields.all().delete()

        # `recipient_index` refers to the submitted array position, so create in that
        # order and derive `order` from each entry's rank once orders are normalised.
        payloads = data["recipients"]
        ranks = {
            id(item): rank
            for rank, item in enumerate(sorted(payloads, key=lambda r: r["order"]))
        }
        created = [
            Recipient.objects.create(
                workflow=workflow,
                order=ranks[id(payload)],
                name=payload["name"].strip(),
                email=payload["email"].lower().strip(),
                role=payload["role"],
            )
            for payload in payloads
        ]

        for payload in data.get("fields") or []:
            Field.objects.create(
                document=document,
                recipient=created[payload["recipient_index"]],
                kind=payload["kind"],
                label=payload.get("label", ""),
                page=payload["page"],
                x=payload["x"],
                y=payload["y"],
                width=payload["width"],
                height=payload["height"],
                required=payload.get("required", True),
            )
        return workflow
