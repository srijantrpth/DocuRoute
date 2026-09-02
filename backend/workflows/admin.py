from django.contrib import admin

from .models import Field, Recipient, Workflow


class RecipientInline(admin.TabularInline):
    model = Recipient
    extra = 0
    readonly_fields = ("status", "sent_at", "first_viewed_at", "completed_at", "last_ip")


@admin.register(Workflow)
class WorkflowAdmin(admin.ModelAdmin):
    list_display = ("__str__", "document", "mode", "expires_at", "created_at")
    list_filter = ("mode",)
    inlines = [RecipientInline]


@admin.register(Field)
class FieldAdmin(admin.ModelAdmin):
    list_display = ("document", "kind", "page", "recipient", "required", "filled_at")
    list_filter = ("kind", "required")
