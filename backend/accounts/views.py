from rest_framework import status
from rest_framework.decorators import api_view, permission_classes
from rest_framework.permissions import AllowAny, IsAuthenticated
from rest_framework.response import Response

from .serializers import OrganizationUpdateSerializer, UserSerializer


@api_view(["GET", "PATCH"])
@permission_classes([IsAuthenticated])
def me(request):
    """Current profile. A GET also provisions the local user + org on first login."""
    if request.method == "PATCH":
        serializer = UserSerializer(request.user, data=request.data, partial=True)
        serializer.is_valid(raise_exception=True)
        serializer.save()
        return Response(serializer.data)
    return Response(UserSerializer(request.user).data)


@api_view(["PATCH"])
@permission_classes([IsAuthenticated])
def organization(request):
    org = request.user.ensure_organization()
    serializer = OrganizationUpdateSerializer(org, data=request.data, partial=True)
    serializer.is_valid(raise_exception=True)
    serializer.save()
    return Response(UserSerializer(request.user).data)


@api_view(["GET"])
@permission_classes([AllowAny])
def config(request):
    """Non-secret capability probe so the SPA can render honest setup warnings."""
    from django.conf import settings

    from core.storage import storage

    return Response(
        {
            "storage_configured": storage.configured,
            "supabase_configured": bool(settings.SUPABASE_URL),
            "email_configured": "console" not in settings.EMAIL_BACKEND,
            "max_upload_bytes": settings.MAX_UPLOAD_BYTES,
            "signing_token_ttl_hours": settings.SIGNING_TOKEN_TTL_HOURS,
        },
        status=status.HTTP_200_OK,
    )
