from rest_framework import serializers

from .models import AuditEvent


class AuditEventSerializer(serializers.ModelSerializer):
    event_display = serializers.CharField(source="get_event_type_display", read_only=True)
    actor_initials = serializers.SerializerMethodField()

    class Meta:
        model = AuditEvent
        fields = [
            "id", "seq", "event_type", "event_display", "actor_label", "actor_initials",
            "ip_address", "user_agent", "metadata", "revision_sha256",
            "payload_hash", "prev_hash", "chain_hash", "created_at",
        ]
        read_only_fields = fields

    def get_actor_initials(self, obj):
        if obj.actor_recipient_id:
            return obj.actor_recipient.initials
        if obj.actor_user_id:
            return obj.actor_user.initials
        return "SY"
