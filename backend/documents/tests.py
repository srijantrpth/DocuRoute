"""API-level checks for the authenticated document and workflow surface."""

from unittest import mock

from django.test import TestCase
from django.urls import reverse
from rest_framework.test import APIClient

from accounts.models import Organization, User
from audit.models import verify_chain
from signing.tests import FakeStorage, make_pdf
from workflows.models import Recipient

from .models import Document, DocumentStatus


class DocumentApiTests(TestCase):
    def setUp(self):
        self.storage = FakeStorage()
        patch = mock.patch("documents.views.storage", self.storage)
        patch.start()
        self.addCleanup(patch.stop)

        self.org = Organization.create_for("Acme Corp")
        self.user = User.objects.create_user(
            email="owner@acme.test", password="a-very-long-password", full_name="Michael Ross"
        )
        self.user.organization = self.org
        self.user.save()

        self.other = User.objects.create_user(
            email="rival@other.test", password="a-very-long-password"
        )
        self.other.organization = Organization.create_for("Other Co")
        self.other.save()

        self.client = APIClient()
        self.client.force_authenticate(self.user)

    def create_document(self, title="Master Services Agreement"):
        response = self.client.post("/api/documents/", {"title": title}, format="json")
        self.assertEqual(response.status_code, 201, response.data)
        return response.json()

    def test_create_returns_detail_shape(self):
        body = self.create_document()
        # `fields` is renamed from the `fields_` serializer field; make sure that lands.
        for key in ("id", "title", "status", "workflow", "fields", "revisions", "has_file", "progress"):
            self.assertIn(key, body, f"missing {key} in detail payload")
        self.assertEqual(body["status"], "draft")
        self.assertEqual(body["fields"], [])
        self.assertFalse(body["has_file"])
        self.assertIsNone(body["workflow"])

    def test_list_and_detail_are_scoped_to_the_organization(self):
        mine = self.create_document("Mine")
        theirs = Document.objects.create(
            organization=self.other.organization, owner=self.other, title="Theirs"
        )

        listing = self.client.get("/api/documents/").json()
        titles = [item["title"] for item in listing["results"]]
        self.assertEqual(titles, ["Mine"])

        self.assertEqual(self.client.get(f"/api/documents/{theirs.id}/").status_code, 404)
        self.assertEqual(self.client.get(f"/api/documents/{mine['id']}/").status_code, 200)

    def test_attach_derives_hash_and_page_count(self):
        document = self.create_document()
        path = f"{self.org.id}/{document['id']}/originals/msa.pdf"
        self.storage.objects[path] = make_pdf(3)

        response = self.client.post(
            f"/api/documents/{document['id']}/attach/",
            {"storage_path": path, "filename": "msa.pdf"},
            format="json",
        )
        self.assertEqual(response.status_code, 200, response.data)
        body = response.json()
        self.assertEqual(body["page_count"], 3)
        self.assertTrue(body["has_file"])
        self.assertEqual(len(body["original_sha256"]), 64)
        self.assertEqual(len(body["revisions"]), 1)

    def test_attach_rejects_a_path_from_another_document(self):
        document = self.create_document()
        foreign = f"{self.org.id}/{Document.objects.create(organization=self.org, owner=self.user, title='x').id}/originals/a.pdf"
        self.storage.objects[foreign] = make_pdf(1)

        response = self.client.post(
            f"/api/documents/{document['id']}/attach/",
            {"storage_path": foreign},
            format="json",
        )
        self.assertEqual(response.status_code, 400)
        self.assertIn("storage_path", response.json()["errors"])

    def test_attach_rejects_a_non_pdf(self):
        document = self.create_document()
        path = f"{self.org.id}/{document['id']}/originals/notes.pdf"
        self.storage.objects[path] = b"this is not a pdf"

        response = self.client.post(
            f"/api/documents/{document['id']}/attach/",
            {"storage_path": path},
            format="json",
        )
        self.assertEqual(response.status_code, 400)

    def test_workflow_put_replaces_the_whole_plan(self):
        document = self.create_document()
        url = reverse("workflow-detail", args=[document["id"]])

        plan = {
            "mode": "sequential",
            "message": "Please review section 4.",
            "recipients": [
                {"name": "Sarah Jenkins", "email": "sarah@client.test", "role": "signer", "order": 1},
                {"name": "Dana Reed", "email": "dana@acme.test", "role": "signer", "order": 0},
            ],
            "fields": [
                {
                    "recipient_index": 0, "kind": "signature", "page": 0,
                    "x": 0.1, "y": 0.7, "width": 0.3, "height": 0.06, "required": True,
                },
                {
                    "recipient_index": 1, "kind": "date", "page": 0,
                    "x": 0.5, "y": 0.7, "width": 0.2, "height": 0.04, "required": True,
                },
            ],
        }
        response = self.client.put(url, plan, format="json")
        self.assertEqual(response.status_code, 200, response.data)

        # Orders are normalised by rank, and fields follow their submitted recipient.
        sarah = Recipient.objects.get(email="sarah@client.test")
        dana = Recipient.objects.get(email="dana@acme.test")
        self.assertEqual(dana.order, 0)
        self.assertEqual(sarah.order, 1)
        self.assertEqual(sarah.fields.get().kind, "signature")
        self.assertEqual(dana.fields.get().kind, "date")

        # A second PUT replaces rather than accumulating.
        plan["recipients"] = [plan["recipients"][0]]
        plan["fields"] = [plan["fields"][0]]
        self.assertEqual(self.client.put(url, plan, format="json").status_code, 200)
        self.assertEqual(Recipient.objects.count(), 1)

    def test_workflow_rejects_duplicate_emails(self):
        document = self.create_document()
        response = self.client.put(
            reverse("workflow-detail", args=[document["id"]]),
            {
                "mode": "sequential",
                "recipients": [
                    {"name": "A", "email": "same@x.test", "role": "signer", "order": 0},
                    {"name": "B", "email": "same@x.test", "role": "signer", "order": 1},
                ],
                "fields": [],
            },
            format="json",
        )
        self.assertEqual(response.status_code, 400)
        self.assertIn("recipients", response.json()["errors"])

    def test_send_requires_an_uploaded_file(self):
        document = self.create_document()
        self.client.put(
            reverse("workflow-detail", args=[document["id"]]),
            {
                "mode": "sequential",
                "recipients": [{"name": "A", "email": "a@x.test", "role": "signer", "order": 0}],
                "fields": [
                    {
                        "recipient_index": 0, "kind": "signature", "page": 0,
                        "x": 0.1, "y": 0.1, "width": 0.2, "height": 0.05, "required": True,
                    }
                ],
            },
            format="json",
        )
        response = self.client.post(f"/api/documents/{document['id']}/send/", format="json")
        self.assertEqual(response.status_code, 400)
        self.assertIn("file", response.json()["errors"])

    def test_dashboard_stats_shape(self):
        self.create_document("One")
        body = self.client.get("/api/dashboard/stats/").json()
        for key in ("total", "active", "drafts", "completed", "pending_approvals", "recent"):
            self.assertIn(key, body)
        self.assertEqual(body["total"], 1)
        self.assertEqual(body["drafts"], 1)

    def test_audit_and_verification_endpoints(self):
        document = self.create_document()
        audit = self.client.get(f"/api/documents/{document['id']}/audit/").json()
        self.assertEqual(audit["document"]["id"], document["id"])
        self.assertEqual(len(audit["events"]), 1)
        self.assertEqual(audit["events"][0]["event_type"], "document.created")

        report = self.client.get(f"/api/documents/{document['id']}/audit/verify/").json()
        self.assertTrue(report["valid"])
        self.assertEqual(report["checked"], 1)

    def test_void_revokes_every_outstanding_link(self):
        document = Document.objects.create(
            organization=self.org, owner=self.user, title="Live", status=DocumentStatus.ROUTING
        )
        from workflows.models import Workflow

        workflow = Workflow.objects.create(document=document)
        recipient = Recipient.objects.create(
            workflow=workflow, order=0, name="A", email="a@x.test", status="sent"
        )
        before = recipient.token_jti

        response = self.client.post(
            f"/api/documents/{document.id}/void/", {"reason": "Superseded"}, format="json"
        )
        self.assertEqual(response.status_code, 200)

        recipient.refresh_from_db()
        document.refresh_from_db()
        self.assertEqual(document.status, DocumentStatus.VOIDED)
        self.assertNotEqual(recipient.token_jti, before)
        self.assertTrue(verify_chain(document)["valid"])

    def test_anonymous_access_is_rejected(self):
        anonymous = APIClient()
        self.assertEqual(anonymous.get("/api/documents/").status_code, 401)
        self.assertEqual(anonymous.get("/api/dashboard/stats/").status_code, 401)
