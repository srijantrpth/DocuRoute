from rest_framework import serializers

from accounts.serializers import UserSerializer
from workflows.serializers import FieldSerializer, WorkflowSerializer

from .models import Document, DocumentRevision


class DocumentRevisionSerializer(serializers.ModelSerializer):
    class Meta:
        model = DocumentRevision
        fields = [
            "id", "index", "kind", "sha256", "size_bytes",
            "page_count", "note", "created_at",
        ]
        read_only_fields = fields


class DocumentListSerializer(serializers.ModelSerializer):
    owner = UserSerializer(read_only=True)
    status_display = serializers.CharField(source="get_status_display", read_only=True)
    progress = serializers.SerializerMethodField()
    recipient_count = serializers.SerializerMethodField()
    current_step = serializers.SerializerMethodField()
    has_file = serializers.SerializerMethodField()

    class Meta:
        model = Document
        fields = [
            "id", "title", "filename", "status", "status_display", "owner",
            "page_count", "size_bytes", "created_at", "updated_at", "sent_at",
            "completed_at", "progress", "recipient_count", "current_step", "has_file",
        ]
        read_only_fields = fields

    def get_has_file(self, obj):
        return bool(obj.storage_path)

    def _recipients(self, obj):
        workflow = getattr(obj, "workflow", None)
        return list(workflow.recipients.all()) if workflow else []

    def get_recipient_count(self, obj):
        return len(self._recipients(obj))

    def get_progress(self, obj):
        signers = [r for r in self._recipients(obj) if r.role != "viewer"]
        if not signers:
            return {"completed": 0, "total": 0, "percent": 0}
        done = len([r for r in signers if r.status == "completed"])
        return {
            "completed": done,
            "total": len(signers),
            "percent": round(done * 100 / len(signers)),
        }

    def get_current_step(self, obj):
        pending = [
            r for r in self._recipients(obj)
            if r.role != "viewer" and r.status in {"pending", "sent", "viewed"}
        ]
        if not pending:
            return None
        nxt = min(pending, key=lambda r: r.order)
        return {"name": nxt.name, "email": nxt.email, "order": nxt.order, "status": nxt.status}


class DocumentDetailSerializer(DocumentListSerializer):
    workflow = WorkflowSerializer(read_only=True)
    fields_ = FieldSerializer(source="fields", many=True, read_only=True)
    revisions = DocumentRevisionSerializer(many=True, read_only=True)
    original_sha256 = serializers.CharField(read_only=True)

    class Meta(DocumentListSerializer.Meta):
        fields = DocumentListSerializer.Meta.fields + [
            "workflow", "fields_", "revisions", "original_sha256",
            "executed_sha256", "content_type",
        ]
        read_only_fields = fields

    def to_representation(self, instance):
        data = super().to_representation(instance)
        data["fields"] = data.pop("fields_", [])
        return data


class DocumentWriteSerializer(serializers.ModelSerializer):
    class Meta:
        model = Document
        fields = ["title"]

    def validate_title(self, value):
        value = (value or "").strip()
        if not value:
            raise serializers.ValidationError("Give the document a title.")
        return value


class UploadUrlSerializer(serializers.Serializer):
    filename = serializers.CharField(max_length=255)
    content_type = serializers.CharField(max_length=120, default="application/pdf")
    size_bytes = serializers.IntegerField(min_value=1)

    def validate_content_type(self, value):
        if value != "application/pdf":
            raise serializers.ValidationError("Only PDF files are supported.")
        return value

    def validate_size_bytes(self, value):
        from django.conf import settings

        if value > settings.MAX_UPLOAD_BYTES:
            mb = settings.MAX_UPLOAD_BYTES // (1024 * 1024)
            raise serializers.ValidationError(f"Files must be {mb} MB or smaller.")
        return value


class AttachUploadSerializer(serializers.Serializer):
    storage_path = serializers.CharField(max_length=512)
    filename = serializers.CharField(max_length=255, required=False, allow_blank=True)


class VoidSerializer(serializers.Serializer):
    reason = serializers.CharField(max_length=500, required=False, allow_blank=True)
