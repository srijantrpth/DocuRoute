from django.urls import path

from . import views

urlpatterns = [
    path("documents/<uuid:document_id>/workflow/", views.workflow_detail, name="workflow-detail"),
    path(
        "documents/<uuid:document_id>/recipients/<uuid:recipient_id>/resend/",
        views.resend_invitation,
        name="resend-invitation",
    ),
]
