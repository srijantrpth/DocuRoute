from django.urls import include, path
from rest_framework.routers import DefaultRouter

from . import views

router = DefaultRouter()
router.register("documents", views.DocumentViewSet, basename="document")

urlpatterns = [
    path("dashboard/stats/", views.dashboard_stats, name="dashboard-stats"),
    path("", include(router.urls)),
]
