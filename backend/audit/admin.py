from django.contrib import admin

from .models import AuditEvent


@admin.register(AuditEvent)
class AuditEventAdmin(admin.ModelAdmin):
    """Read-only by design: the chain is only meaningful if rows are immutable."""

    list_display = ("document", "seq", "event_type", "actor_label", "created_at")
    list_filter = ("event_type",)
    search_fields = ("document__title", "actor_label", "chain_hash")
    readonly_fields = [f.name for f in AuditEvent._meta.fields]

    def has_add_permission(self, request):
        return False

    def has_change_permission(self, request, obj=None):
        return False

    def has_delete_permission(self, request, obj=None):
        return False
