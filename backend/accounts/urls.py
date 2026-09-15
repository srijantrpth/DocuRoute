from django.urls import path

from . import views

urlpatterns = [
    path("me/", views.me, name="me"),
    path("me/organization/", views.organization, name="organization"),
    path("config/", views.config, name="config"),
]
