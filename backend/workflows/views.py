from django.shortcuts import get_object_or_404
from rest_framework.decorators import api_view, permission_classes
from rest_framework.exceptions import ValidationError
from rest_framework.permissions import IsAuthenticated
from rest_framework.response import Response

from audit.models import EventType, record_event
from core.request_meta import client_ip, user_agent
from documents.models import Document
from signing.services import send_invitation

from .serializers import RecipientSerializer, WorkflowSerializer, WorkflowWriteSerializer


def _get_document(request, document_id) -> Document:
    return get_object_or_404(
        Document.objects.select_related("workflow", "owner"),
        pk=document_id,
        organization=request.user.ensure_organization(),
    )


@api_view(["GET", "PUT"])
@permission_classes([IsAuthenticated])
def workflow_detail(request, document_id):
    """GET the routing plan, or PUT the complete plan from the builder."""
    document = _get_document(request, document_id)

    if request.method == "GET":
        workflow = getattr(document, "workflow", None)
        if workflow is None:
            return Response({"recipients": [], "mode": "sequential", "message": ""})
        return Response(WorkflowSerializer(workflow).data)

    if not document.is_editable:
        raise ValidationError(
            {"status": ["The routing plan is locked once the document has been sent."]}
        )

    serializer = WorkflowWriteSerializer(data=request.data)
    serializer.is_valid(raise_exception=True)
    workflow = serializer.save(document=document, user=request.user)

    record_event(
        document,
        EventType.WORKFLOW_SAVED,
        actor_user=request.user,
        ip_address=client_ip(request),
        user_agent=user_agent(request),
        metadata={
            "mode": workflow.mode,
            "recipients": workflow.recipients.count(),
            "fields": document.fields.count(),
        },
    )
    return Response(WorkflowSerializer(workflow).data)


@api_view(["POST"])
@permission_classes([IsAuthenticated])
def resend_invitation(request, document_id, recipient_id):
    """Rotate the recipient's token and email a fresh link."""
    document = _get_document(request, document_id)
    workflow = getattr(document, "workflow", None)
    if workflow is None:
        raise ValidationError({"workflow": ["This document has no routing plan."]})

    recipient = get_object_or_404(workflow.recipients, pk=recipient_id)
    if recipient.is_done:
        raise ValidationError({"recipient": [f"{recipient.name} has already responded."]})
    if document.status != "routing":
        raise ValidationError({"status": ["Send the document before resending invitations."]})

    delivered = send_invitation(
        recipient,
        document,
        actor=request.user,
        ip=client_ip(request),
        user_agent=user_agent(request),
    )
    return Response({"delivered": delivered, "recipient": RecipientSerializer(recipient).data})
