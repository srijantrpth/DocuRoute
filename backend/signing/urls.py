from django.urls import path

from . import views

urlpatterns = [
    path("sign/<str:token>/", views.signing_session, name="signing-session"),
    path("sign/<str:token>/submit/", views.signing_submit, name="signing-submit"),
    path("sign/<str:token>/decline/", views.signing_decline, name="signing-decline"),
]
