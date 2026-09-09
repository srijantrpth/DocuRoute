from django.contrib import admin
from django.http import JsonResponse
from django.urls import include, path


def health(_request):
    return JsonResponse({"status": "ok", "service": "docuroute-api"})


urlpatterns = [
    path("admin/", admin.site.urls),
    path("health/", health),
    path("api/", include("accounts.urls")),
    path("api/", include("documents.urls")),
    path("api/", include("workflows.urls")),
    path("api/", include("audit.urls")),
    path("api/", include("signing.urls")),
]
