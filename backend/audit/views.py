from django.shortcuts import get_object_or_404
from rest_framework.decorators import api_view, permission_classes
from rest_framework.permissions import IsAuthenticated
from rest_framework.response import Response

from documents.models import Document

from .models import AuditEvent, verify_chain
from .serializers import AuditEventSerializer


def _get_document(request, document_id):
    return get_object_or_404(
        Document.objects.select_related("owner", "organization"),
        pk=document_id,
        organization=request.user.ensure_organization(),
    )


@api_view(["GET"])
@permission_classes([IsAuthenticated])
def document_audit(request, document_id):
    document = _get_document(request, document_id)
    events = (
        AuditEvent.objects.filter(document=document)
        .select_related("actor_user", "actor_recipient")
        .order_by("-seq")
    )
    return Response(
        {
            "document": {
                "id": str(document.id),
                "title": document.title,
                "filename": document.filename,
                "status": document.status,
                "status_display": document.get_status_display(),
                "original_sha256": document.original_sha256,
                "executed_sha256": document.executed_sha256,
                "created_at": document.created_at,
                "completed_at": document.completed_at,
            },
            "events": AuditEventSerializer(events, many=True).data,
        }
    )


@api_view(["GET"])
@permission_classes([IsAuthenticated])
def verify_document_chain(request, document_id):
    """Recompute every link and report whether the trail is intact."""
    document = _get_document(request, document_id)
    return Response(verify_chain(document))
