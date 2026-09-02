import logging

from django.db.models import Count, Prefetch, Q
from rest_framework import status, viewsets
from rest_framework.decorators import action, api_view, permission_classes
from rest_framework.exceptions import ValidationError
from rest_framework.permissions import IsAuthenticated
from rest_framework.response import Response

from audit.models import EventType, record_event
from core import pdf
from core.hashing import sha256_bytes
from core.request_meta import client_ip, user_agent
from core.storage import storage
from signing.services import send_workflow, void_document
from workflows.models import Recipient

from .models import Document, DocumentRevision, DocumentStatus
from .serializers import (
    AttachUploadSerializer,
    DocumentDetailSerializer,
    DocumentListSerializer,
    DocumentWriteSerializer,
    UploadUrlSerializer,
    VoidSerializer,
)

logger = logging.getLogger(__name__)


class DocumentViewSet(viewsets.ModelViewSet):
    """Documents are scoped to the caller's organization."""

    permission_classes = [IsAuthenticated]
    filterset_fields = ["status"]
    search_fields = ["title", "filename"]
    ordering_fields = ["created_at", "updated_at", "title", "status"]
    ordering = ["-created_at"]

    def get_queryset(self):
        organization = self.request.user.ensure_organization()
        return (
            Document.objects.filter(organization=organization)
            .select_related("owner", "organization", "workflow")
            .prefetch_related(
                Prefetch("workflow__recipients", queryset=Recipient.objects.order_by("order")),
                "fields__recipient",
                "revisions",
            )
        )

    def get_serializer_class(self):
        if self.action in {"create", "update", "partial_update"}:
            return DocumentWriteSerializer
        if self.action == "retrieve":
            return DocumentDetailSerializer
        return DocumentListSerializer

    def perform_create(self, serializer):
        user = self.request.user
        document = serializer.save(
            owner=user, organization=user.ensure_organization(), status=DocumentStatus.DRAFT
        )
        record_event(
            document,
            EventType.DOCUMENT_CREATED,
            actor_user=user,
            ip_address=client_ip(self.request),
            user_agent=user_agent(self.request),
            metadata={"title": document.title},
        )

    def create(self, request, *args, **kwargs):
        write = self.get_serializer(data=request.data)
        write.is_valid(raise_exception=True)
        self.perform_create(write)
        detail = DocumentDetailSerializer(write.instance, context=self.get_serializer_context())
        return Response(detail.data, status=status.HTTP_201_CREATED)

    def update(self, request, *args, **kwargs):
        document = self.get_object()
        if not document.is_editable:
            raise ValidationError({"status": ["Only draft documents can be edited."]})
        return super().update(request, *args, **kwargs)

    def perform_destroy(self, instance):
        if instance.status == DocumentStatus.ROUTING:
            raise ValidationError(
                {"status": ["Void the document before deleting it — signers hold live links."]}
            )
        for revision in instance.revisions.all():
            try:
                storage.remove(revision.storage_path)
            except Exception:
                logger.warning("Could not remove %s from storage", revision.storage_path)
        instance.delete()

    # --- upload pipeline --------------------------------------------------
    @action(detail=True, methods=["post"], url_path="upload-url")
    def upload_url(self, request, pk=None):
        """Hand the browser a short-lived signed URL so bytes bypass this server."""
        document = self.get_object()
        if not document.is_editable:
            raise ValidationError({"status": ["Only draft documents can be replaced."]})

        serializer = UploadUrlSerializer(data=request.data)
        serializer.is_valid(raise_exception=True)
        data = serializer.validated_data

        path = storage.build_path(document.organization_id, document.id, data["filename"])
        signed = storage.create_signed_upload(path)
        return Response(
            {
                "upload_url": signed.url,
                "token": signed.token,
                "storage_path": signed.path,
                "method": "PUT",
                "headers": {"Content-Type": data["content_type"]},
            }
        )

    @action(detail=True, methods=["post"], url_path="attach")
    def attach(self, request, pk=None):
        """Confirm an upload. The server re-reads the object and derives hash + pages itself."""
        document = self.get_object()
        if not document.is_editable:
            raise ValidationError({"status": ["Only draft documents can be replaced."]})

        serializer = AttachUploadSerializer(data=request.data)
        serializer.is_valid(raise_exception=True)
        path = serializer.validated_data["storage_path"]

        expected_prefix = f"{document.organization_id}/{document.id}/"
        if not path.startswith(expected_prefix):
            raise ValidationError({"storage_path": ["That path does not belong to this document."]})

        data = storage.download_bytes(path)
        try:
            pages = pdf.page_count(data)
        except Exception as exc:
            raise ValidationError({"file": [f"That file could not be read as a PDF: {exc}"]}) from exc

        digest = sha256_bytes(data)
        document.storage_path = path
        document.filename = serializer.validated_data.get("filename") or path.split("-", 1)[-1]
        document.size_bytes = len(data)
        document.page_count = pages
        document.content_type = "application/pdf"
        document.save(
            update_fields=[
                "storage_path", "filename", "size_bytes", "page_count", "content_type", "updated_at",
            ]
        )

        document.revisions.filter(kind=DocumentRevision.Kind.ORIGINAL).delete()
        DocumentRevision.objects.create(
            document=document,
            index=0,
            kind=DocumentRevision.Kind.ORIGINAL,
            storage_path=path,
            sha256=digest,
            size_bytes=len(data),
            page_count=pages,
            created_by=request.user,
            note="Original upload",
        )

        record_event(
            document,
            EventType.DOCUMENT_UPLOADED,
            actor_user=request.user,
            ip_address=client_ip(request),
            user_agent=user_agent(request),
            metadata={"filename": document.filename, "pages": pages, "size_bytes": len(data)},
            revision_sha256=digest,
        )
        return Response(DocumentDetailSerializer(document, context=self.get_serializer_context()).data)

    @action(detail=True, methods=["get"], url_path="download-url")
    def download_url(self, request, pk=None):
        document = self.get_object()
        variant = request.query_params.get("variant", "auto")
        if variant == "original" or not document.executed_storage_path:
            path, label = document.storage_path, document.filename or "document.pdf"
            digest = document.original_sha256
        else:
            path = document.executed_storage_path
            label = f"executed-{document.filename or 'document.pdf'}"
            digest = document.executed_sha256

        if not path:
            raise ValidationError({"file": ["No file has been uploaded yet."]})

        url = storage.create_signed_download(path, expires_in=900, download_name=label)
        record_event(
            document,
            EventType.DOCUMENT_DOWNLOADED,
            actor_user=request.user,
            ip_address=client_ip(request),
            user_agent=user_agent(request),
            metadata={"variant": "original" if path == document.storage_path else "executed"},
            revision_sha256=digest,
        )
        return Response({"url": url, "expires_in": 900, "sha256": digest, "filename": label})

    # --- routing ----------------------------------------------------------
    @action(detail=True, methods=["post"])
    def send(self, request, pk=None):
        document = self.get_object()
        result = send_workflow(
            document,
            actor=request.user,
            ip=client_ip(request),
            user_agent=user_agent(request),
        )
        document.refresh_from_db()
        detail = DocumentDetailSerializer(document, context=self.get_serializer_context())
        return Response({**result, "document": detail.data})

    @action(detail=True, methods=["post"])
    def void(self, request, pk=None):
        document = self.get_object()
        serializer = VoidSerializer(data=request.data)
        serializer.is_valid(raise_exception=True)
        void_document(
            document,
            serializer.validated_data.get("reason", ""),
            actor=request.user,
            ip=client_ip(request),
            user_agent=user_agent(request),
        )
        document.refresh_from_db()
        return Response(DocumentDetailSerializer(document, context=self.get_serializer_context()).data)


@api_view(["GET"])
@permission_classes([IsAuthenticated])
def dashboard_stats(request):
    organization = request.user.ensure_organization()
    documents = Document.objects.filter(organization=organization)

    counts = documents.aggregate(
        total=Count("id"),
        active=Count("id", filter=Q(status=DocumentStatus.ROUTING)),
        drafts=Count("id", filter=Q(status=DocumentStatus.DRAFT)),
        completed=Count("id", filter=Q(status=DocumentStatus.COMPLETED)),
        declined=Count("id", filter=Q(status=DocumentStatus.DECLINED)),
    )
    pending_approvals = Recipient.objects.filter(
        workflow__document__organization=organization,
        workflow__document__status=DocumentStatus.ROUTING,
        status__in=["sent", "viewed"],
    ).count()

    finished = documents.filter(status=DocumentStatus.COMPLETED, sent_at__isnull=False)
    durations = [
        (d.completed_at - d.sent_at).total_seconds()
        for d in finished.only("completed_at", "sent_at")
        if d.completed_at and d.sent_at
    ]
    avg_hours = round(sum(durations) / len(durations) / 3600, 1) if durations else None

    recent = (
        documents.select_related("owner")
        .prefetch_related("workflow__recipients")
        .order_by("-updated_at")[:8]
    )
    return Response(
        {
            **counts,
            "pending_approvals": pending_approvals,
            "avg_completion_hours": avg_hours,
            "completion_rate": (
                round(counts["completed"] * 100 / counts["total"]) if counts["total"] else 0
            ),
            "recent": DocumentListSerializer(recent, many=True, context={"request": request}).data,
        }
    )
