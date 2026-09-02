from django.urls import path

from . import views

urlpatterns = [
    path("documents/<uuid:document_id>/audit/", views.document_audit, name="document-audit"),
    path(
        "documents/<uuid:document_id>/audit/verify/",
        views.verify_document_chain,
        name="document-audit-verify",
    ),
]
