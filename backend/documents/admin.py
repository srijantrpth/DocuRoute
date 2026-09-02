from django.contrib import admin

from .models import Document, DocumentRevision


class RevisionInline(admin.TabularInline):
    model = DocumentRevision
    extra = 0
    readonly_fields = ("index", "kind", "sha256", "size_bytes", "page_count", "created_at")
    can_delete = False


@admin.register(Document)
class DocumentAdmin(admin.ModelAdmin):
    list_display = ("title", "status", "owner", "organization", "page_count", "created_at")
    list_filter = ("status", "organization")
    search_fields = ("title", "filename", "id")
    readonly_fields = ("created_at", "updated_at", "sent_at", "completed_at", "executed_sha256")
    inlines = [RevisionInline]
