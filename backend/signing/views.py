"""Public signing surface. No account required — the token is the credential."""

from rest_framework import serializers, status
from rest_framework.decorators import api_view, permission_classes, throttle_classes
from rest_framework.permissions import AllowAny
from rest_framework.response import Response
from rest_framework.throttling import AnonRateThrottle

from core.request_meta import client_ip, user_agent
from core.storage import storage
from documents.models import DocumentStatus
from workflows.models import RecipientRole, RecipientStatus, RoutingMode

from .services import decline_recipient, mark_viewed, submit_recipient
from .tokens import resolve_recipient


class SigningThrottle(AnonRateThrottle):
    scope = "signing"
    rate = "60/min"


class SubmitSerializer(serializers.Serializer):
    values = serializers.DictField(child=serializers.CharField(allow_blank=True, trim_whitespace=False))


class DeclineSerializer(serializers.Serializer):
    reason = serializers.CharField(max_length=2000, required=False, allow_blank=True)


def _blocking_step(workflow, recipient):
    """In sequential mode, the earlier recipient this signer is waiting on."""
    if workflow.mode != RoutingMode.SEQUENTIAL:
        return None
    return (
        workflow.recipients.exclude(role=RecipientRole.VIEWER)
        .filter(order__lt=recipient.order)
        .exclude(status=RecipientStatus.COMPLETED)
        .order_by("order")
        .first()
    )


def _session_payload(recipient, *, include_file_url=True):
    workflow = recipient.workflow
    document = workflow.document
    blocking = _blocking_step(workflow, recipient)

    file_url = ""
    if include_file_url and document.storage_path:
        source = (
            document.executed_storage_path
            if document.status == DocumentStatus.COMPLETED and document.executed_storage_path
            else document.storage_path
        )
        file_url = storage.create_signed_download(source, expires_in=1800)

    return {
        "document": {
            "id": str(document.id),
            "title": document.title,
            "filename": document.filename,
            "page_count": document.page_count,
            "status": document.status,
            "status_display": document.get_status_display(),
            "sender": document.owner.display_name,
            "organization": document.organization.name,
            "message": workflow.message,
            "file_url": file_url,
        },
        "recipient": {
            "id": str(recipient.id),
            "name": recipient.name,
            "email": recipient.email,
            "role": recipient.role,
            "role_display": recipient.get_role_display(),
            "status": recipient.status,
            "order": recipient.order,
            "completed_at": recipient.completed_at,
        },
        "participants": [
            {
                "name": person.name,
                "initials": person.initials,
                "role": person.role,
                "status": person.status,
                "order": person.order,
                "is_you": person.id == recipient.id,
            }
            for person in workflow.recipients.order_by("order")
        ],
        "fields": [
            {
                "id": str(field.id),
                "kind": field.kind,
                "label": field.label,
                "page": field.page,
                "x": field.x,
                "y": field.y,
                "width": field.width,
                "height": field.height,
                "required": field.required,
                "value": field.value,
                "is_filled": field.is_filled,
            }
            for field in recipient.fields.order_by("page", "y", "x")
        ],
        "can_sign": (
            document.status == DocumentStatus.ROUTING
            and not recipient.is_done
            and blocking is None
        ),
        "blocked_by": (
            {"name": blocking.name, "step": blocking.order + 1} if blocking else None
        ),
        "expires_at": workflow.expires_at,
    }


@api_view(["GET"])
@permission_classes([AllowAny])
@throttle_classes([SigningThrottle])
def signing_session(request, token):
    recipient, _claims = resolve_recipient(token)
    if recipient.workflow.document.status == DocumentStatus.ROUTING and not recipient.is_done:
        mark_viewed(recipient, ip=client_ip(request), user_agent=user_agent(request))
        recipient.refresh_from_db()
    return Response(_session_payload(recipient))


@api_view(["POST"])
@permission_classes([AllowAny])
@throttle_classes([SigningThrottle])
def signing_submit(request, token):
    recipient, _claims = resolve_recipient(token)
    serializer = SubmitSerializer(data=request.data)
    serializer.is_valid(raise_exception=True)

    result = submit_recipient(
        recipient,
        serializer.validated_data["values"],
        ip=client_ip(request),
        user_agent=user_agent(request),
    )
    recipient.refresh_from_db()
    return Response(
        {**result, "session": _session_payload(recipient, include_file_url=False)},
        status=status.HTTP_200_OK,
    )


@api_view(["POST"])
@permission_classes([AllowAny])
@throttle_classes([SigningThrottle])
def signing_decline(request, token):
    recipient, _claims = resolve_recipient(token)
    serializer = DeclineSerializer(data=request.data)
    serializer.is_valid(raise_exception=True)

    result = decline_recipient(
        recipient,
        serializer.validated_data.get("reason", ""),
        ip=client_ip(request),
        user_agent=user_agent(request),
    )
    recipient.refresh_from_db()
    return Response({**result, "session": _session_payload(recipient, include_file_url=False)})
