"""End-to-end routing test: upload -> plan -> send -> sign -> execute -> verify."""

import io
from unittest import mock

from django.test import TestCase
from django.urls import reverse
from pypdf import PdfReader, PdfWriter
from rest_framework.test import APIClient

from accounts.models import Organization, User
from audit.models import AuditEvent, EventType, verify_chain
from documents.models import Document, DocumentRevision, DocumentStatus
from workflows.models import Field, Recipient, RecipientStatus, Workflow

from .services import send_workflow, submit_recipient
from .tokens import issue_token


def make_pdf(pages=2) -> bytes:
    writer = PdfWriter()
    for _ in range(pages):
        writer.add_blank_page(width=612, height=792)
    buf = io.BytesIO()
    writer.write(buf)
    return buf.getvalue()


class FakeStorage:
    """In-memory stand-in so tests never touch Supabase."""

    def __init__(self):
        self.objects = {}
        self.configured = True

    @staticmethod
    def build_path(organization_id, document_id, filename, prefix="originals"):
        return f"{organization_id}/{document_id}/{prefix}/{filename}"

    def upload_bytes(self, path, data, content_type=None, upsert=True):
        self.objects[path] = data
        return path

    def download_bytes(self, path):
        return self.objects[path]

    def create_signed_download(self, path, expires_in=3600, download_name=None):
        return f"https://storage.test/{path}?exp={expires_in}"

    def create_signed_upload(self, path):
        from core.storage import SignedUpload

        return SignedUpload(path=path, url=f"https://storage.test/upload/{path}", token="tkn")

    def remove(self, path):
        self.objects.pop(path, None)


class SigningFlowTests(TestCase):
    def setUp(self):
        self.storage = FakeStorage()
        patches = [
            mock.patch("signing.services.storage", self.storage),
            mock.patch("documents.views.storage", self.storage),
        ]
        for patch in patches:
            patch.start()
            self.addCleanup(patch.stop)

        self.org = Organization.create_for("Acme Corp")
        self.owner = User.objects.create_user(
            email="owner@acme.test", password="a-very-long-password", full_name="Michael Ross"
        )
        self.owner.organization = self.org
        self.owner.save()

        self.pdf_bytes = make_pdf()
        self.document = Document.objects.create(
            organization=self.org,
            owner=self.owner,
            title="Master Services Agreement",
            filename="msa.pdf",
            storage_path="acme/doc/originals/msa.pdf",
            size_bytes=len(self.pdf_bytes),
            page_count=2,
        )
        self.storage.objects[self.document.storage_path] = self.pdf_bytes
        DocumentRevision.objects.create(
            document=self.document,
            index=0,
            storage_path=self.document.storage_path,
            sha256="a" * 64,
            size_bytes=len(self.pdf_bytes),
            page_count=2,
        )

        self.workflow = Workflow.objects.create(document=self.document, created_by=self.owner)
        self.first = Recipient.objects.create(
            workflow=self.workflow, order=0, name="Sarah Jenkins", email="sarah@client.test"
        )
        self.second = Recipient.objects.create(
            workflow=self.workflow, order=1, name="Dana Reed", email="dana@acme.test"
        )
        for index, recipient in enumerate((self.first, self.second)):
            Field.objects.create(
                document=self.document,
                recipient=recipient,
                kind="signature",
                label="Sign here",
                page=index,
                x=0.1, y=0.7, width=0.3, height=0.06,
            )

        self.client = APIClient()

    # --- routing ----------------------------------------------------------
    def test_sequential_routing_executes_and_chains(self):
        result = send_workflow(self.document, actor=self.owner, ip="203.0.113.9")
        self.assertEqual(result["invited"], 1)

        self.document.refresh_from_db()
        self.first.refresh_from_db()
        self.second.refresh_from_db()
        self.assertEqual(self.document.status, DocumentStatus.ROUTING)
        self.assertEqual(self.first.status, RecipientStatus.SENT)
        self.assertEqual(self.second.status, RecipientStatus.PENDING, "step 2 must stay dormant")

        # Second signer cannot jump the queue.
        field_two = self.second.fields.first()
        with self.assertRaises(Exception):
            submit_recipient(self.second, {str(field_two.id): "Dana Reed"}, ip="203.0.113.20")

        field_one = self.first.fields.first()
        outcome = submit_recipient(self.first, {str(field_one.id): "Sarah Jenkins"}, ip="203.0.113.10")
        self.assertEqual(outcome["status"], "advanced")

        self.second.refresh_from_db()
        self.assertEqual(self.second.status, RecipientStatus.SENT, "step 2 is invited on advance")

        outcome = submit_recipient(self.second, {str(field_two.id): "Dana Reed"}, ip="203.0.113.20")
        self.assertEqual(outcome["status"], "executed")

        self.document.refresh_from_db()
        self.assertEqual(self.document.status, DocumentStatus.COMPLETED)
        self.assertTrue(self.document.executed_sha256)
        self.assertIn(self.document.executed_storage_path, self.storage.objects)

        executed = PdfReader(io.BytesIO(self.storage.objects[self.document.executed_storage_path]))
        self.assertGreater(len(executed.pages), 2, "certificate page is appended")

        chain = verify_chain(self.document)
        self.assertTrue(chain["valid"], chain)
        self.assertEqual(
            AuditEvent.objects.filter(
                document=self.document, event_type=EventType.DOCUMENT_EXECUTED
            ).count(),
            1,
        )

    def test_tampering_with_an_event_breaks_the_chain(self):
        send_workflow(self.document, actor=self.owner)
        submit_recipient(self.first, {str(self.first.fields.first().id): "Sarah Jenkins"})

        self.assertTrue(verify_chain(self.document)["valid"])

        # Rewrite history directly in the database, bypassing record_event.
        event = AuditEvent.objects.filter(document=self.document).order_by("seq")[1]
        AuditEvent.objects.filter(pk=event.pk).update(ip_address="10.0.0.1")

        report = verify_chain(self.document)
        self.assertFalse(report["valid"])
        self.assertEqual(report["broken_at"], event.seq)

    def test_required_field_must_be_filled(self):
        send_workflow(self.document, actor=self.owner)
        with self.assertRaises(Exception):
            submit_recipient(self.first, {})

    def test_send_requires_fields_for_every_signer(self):
        self.second.fields.all().delete()
        with self.assertRaises(Exception):
            send_workflow(self.document, actor=self.owner)


class SigningTokenTests(TestCase):
    def setUp(self):
        org = Organization.create_for("Token Co")
        owner = User.objects.create_user(email="t@token.test", password="a-very-long-password")
        owner.organization = org
        owner.save()
        document = Document.objects.create(
            organization=org, owner=owner, title="Doc", storage_path="p/x.pdf"
        )
        workflow = Workflow.objects.create(document=document)
        self.recipient = Recipient.objects.create(
            workflow=workflow, order=0, name="Signer", email="s@token.test"
        )

    def test_token_round_trips(self):
        from .tokens import resolve_recipient

        token = issue_token(self.recipient)
        resolved, claims = resolve_recipient(token)
        self.assertEqual(resolved.id, self.recipient.id)
        self.assertEqual(claims["eml"], "s@token.test")

    def test_rotating_the_jti_invalidates_old_links(self):
        from .tokens import SigningTokenError, resolve_recipient

        token = issue_token(self.recipient)
        self.recipient.rotate_token()
        self.recipient.save(update_fields=["token_jti"])
        with self.assertRaises(SigningTokenError):
            resolve_recipient(token)

    def test_token_from_another_secret_is_rejected(self):
        import jwt as pyjwt
        from django.conf import settings

        from .tokens import SigningTokenError, resolve_recipient

        forged = pyjwt.encode(
            {
                "iss": settings.SIGNING_TOKEN_ISSUER,
                "typ": "signing",
                "sub": str(self.recipient.id),
                "jti": str(self.recipient.token_jti),
                "doc": str(self.recipient.workflow.document_id),
                "exp": 9999999999,
            },
            "not-the-real-secret",
            algorithm="HS256",
        )
        with self.assertRaises(SigningTokenError):
            resolve_recipient(forged)


class PublicSigningApiTests(TestCase):
    def setUp(self):
        self.storage = FakeStorage()
        patch = mock.patch("signing.views.storage", self.storage)
        patch.start()
        self.addCleanup(patch.stop)

        org = Organization.create_for("Api Co")
        owner = User.objects.create_user(email="o@api.test", password="a-very-long-password")
        owner.organization = org
        owner.save()
        self.document = Document.objects.create(
            organization=org,
            owner=owner,
            title="NDA",
            filename="nda.pdf",
            storage_path="api/nda.pdf",
            status=DocumentStatus.ROUTING,
            page_count=1,
        )
        self.storage.objects["api/nda.pdf"] = make_pdf(1)
        workflow = Workflow.objects.create(document=self.document)
        self.recipient = Recipient.objects.create(
            workflow=workflow, order=0, name="Ann", email="ann@api.test",
            status=RecipientStatus.SENT,
        )
        Field.objects.create(
            document=self.document, recipient=self.recipient, kind="signature",
            page=0, x=0.1, y=0.5, width=0.3, height=0.06,
        )
        self.token = issue_token(self.recipient)
        self.client = APIClient()

    def test_session_endpoint_marks_viewed(self):
        url = reverse("signing-session", args=[self.token])
        response = self.client.get(url, HTTP_X_FORWARDED_FOR="198.51.100.7")
        self.assertEqual(response.status_code, 200)
        body = response.json()
        self.assertTrue(body["can_sign"])
        self.assertEqual(len(body["fields"]), 1)

        self.recipient.refresh_from_db()
        self.assertEqual(self.recipient.status, RecipientStatus.VIEWED)
        self.assertEqual(self.recipient.last_ip, "198.51.100.7")

        viewed = AuditEvent.objects.filter(
            document=self.document, event_type=EventType.DOCUMENT_VIEWED
        )
        self.assertEqual(viewed.count(), 1)
        self.assertEqual(viewed.first().ip_address, "198.51.100.7")

    def test_bad_token_is_rejected(self):
        response = self.client.get(reverse("signing-session", args=["not-a-token"]))
        self.assertEqual(response.status_code, 403)

    def test_decline_halts_the_document(self):
        url = reverse("signing-decline", args=[self.token])
        response = self.client.post(url, {"reason": "Terms unacceptable"}, format="json")
        self.assertEqual(response.status_code, 200)

        self.document.refresh_from_db()
        self.assertEqual(self.document.status, DocumentStatus.DECLINED)
        self.assertTrue(verify_chain(self.document)["valid"])
