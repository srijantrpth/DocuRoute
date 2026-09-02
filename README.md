# DocuRoute

**Ordered document signing with a tamper-evident audit trail.**

Upload a PDF, define an ordered sequence of approvers and signers, and place field
boxes on the page. Signers receive time-limited magic links, review the document in
the browser, and sign. Once every party completes, a watermarked PDF with a
certificate of completion is generated and emailed to all stakeholders.

---

## Contents

1. [Features](#features)
2. [Tech stack](#tech-stack)
3. [Project structure](#project-structure)
4. [Prerequisites](#prerequisites)
5. [Getting started](#getting-started)
6. [Configuration](#configuration)
7. [Supabase setup](#supabase-setup)
8. [Architecture](#architecture)
9. [API reference](#api-reference)
10. [Testing](#testing)
11. [Design reference](#design-reference)
12. [Known limits](#known-limits)

---

## Features

| | |
| --- | --- |
| **Visual workflow builder** | Click to place signature, initial, date, text and checkbox fields on any page; drag to reposition. Each field is assigned to a recipient and colour-coded by step. |
| **Sequential or parallel routing** | Sequential invites step 1 immediately and advances automatically as each step completes. Parallel invites everyone at once. |
| **Accountless signing** | External signers open a signed magic link — no registration, no shared password. Links are revocable and time-limited. |
| **Tamper-evident audit trail** | Every event is SHA-256 hashed and chained to its predecessor, with timestamped IP and user-agent capture. A verification endpoint names the exact event where a chain breaks. |
| **Watermarked execution copy** | On completion, field values are flattened into the PDF, every page is watermarked, and a certificate of completion listing signers and the full audit chain is appended. |
| **Direct-to-storage uploads** | Files go browser → Supabase over a presigned URL and never transit the API server. |

---

## Tech stack

| Layer | Choice | Notes |
| --- | --- | --- |
| API | Django 5.2 + Django REST Framework | Python 3.11–3.14 |
| Web | React 19 + Vite + TypeScript | Tailwind v4, CSS-first theme tokens |
| Auth | Supabase Auth | The API verifies Supabase JWTs (HS256 or JWKS) |
| Database | Supabase Postgres | Falls back to SQLite when `DATABASE_URL` is unset |
| Storage | Supabase Storage | Private bucket, presigned upload and download URLs |
| PDF | `pypdf` + `reportlab` | Chosen over PyMuPDF, which is AGPL |
| Viewer | `pdf.js` | Code-split so it never loads on the landing page |
| Analytics | Firebase Analytics | Optional — fully disabled when keys are absent |

---

## Project structure

```
DocuRoute/
├── backend/                    Django + DRF API
│   ├── docuroute/              settings, root URLconf, WSGI/ASGI
│   ├── accounts/               User, Organization, Supabase JWT authentication
│   ├── documents/              Document, DocumentRevision, upload pipeline
│   ├── workflows/              Workflow, Recipient (routing order), Field (geometry)
│   ├── audit/                  AuditEvent — append-only, hash-chained
│   ├── signing/                magic tokens, routing state machine, public endpoints
│   ├── core/                   storage gateway, PDF pipeline, mailer, hashing
│   └── requirements.txt
│
├── frontend/                   React SPA
│   └── src/
│       ├── pages/              Landing, SignIn, SignUp, Dashboard, Documents,
│       │                       WorkflowBuilder, SigningViewer, AuditTrail, Settings
│       ├── components/
│       │   ├── ui/             Button, Card, Modal, TextField, Toast, …
│       │   ├── layout/         AppShell (sidebar + header), PageHeader
│       │   └── signing/        PdfViewer, SignaturePad
│       ├── context/            AuthContext (Supabase session → profile)
│       ├── lib/                api client, types, supabase, analytics, formatters
│       └── styles/index.css    design tokens (Tailwind v4 @theme)
│
├── .env.example                backend configuration template
└── README.md
```

---

## Prerequisites

- **Python** 3.11 or newer
- **Node** 20 or newer
- A **Supabase** project (free tier is enough)

Optional: a Firebase project for analytics, and SMTP credentials for real email.

---

## Getting started

### 1. Backend

```bash
cd backend && python -m venv .venv
```

```bash
cd backend && .venv/Scripts/pip install -r requirements.txt
```

> On macOS or Linux use `.venv/bin/pip` and `.venv/bin/python` throughout.

Copy the environment template and fill it in:

```bash
cp .env.example .env
```

Then migrate and run:

```bash
cd backend && .venv/Scripts/python manage.py migrate
```

```bash
cd backend && .venv/Scripts/python manage.py runserver
```

The API listens on `http://localhost:8000`.

### 2. Frontend

```bash
cd frontend && npm install
```

```bash
cp frontend/.env.example frontend/.env
```

```bash
cd frontend && npm run dev
```

The app runs on `http://localhost:5173`.

### 3. Verify

```bash
curl http://localhost:8000/api/config/
```

Both `/health/` and `/api/config/` work without credentials. `/api/config/` reports
which integrations are actually wired up — useful for confirming your `.env` took
effect. The Settings page in the app renders the same information.

Without any keys the app still boots: it falls back to SQLite, prints invitation
emails to the API log, and shows explicit setup warnings instead of failing silently.

---

## Configuration

### Backend — `.env` at the repo root (or `backend/.env`)

| Variable | Required | Purpose |
| --- | --- | --- |
| `DJANGO_SECRET_KEY` | Yes | Django signing key |
| `DJANGO_DEBUG` | — | `True` locally, `False` in production |
| `DJANGO_ALLOWED_HOSTS` | Prod | Comma-separated hostnames |
| `CORS_ALLOWED_ORIGINS` | Yes | Where the SPA is served from |
| `FRONTEND_URL` | Yes | Base URL used to build signing links |
| `DATABASE_URL` | — | Supabase Postgres URI; omit for local SQLite |
| `SUPABASE_URL` | Yes | `https://<ref>.supabase.co` |
| `SUPABASE_SERVICE_ROLE_KEY` | Yes | Server-side only — signs storage URLs |
| `SUPABASE_JWT_SECRET` | — | Legacy HS256 projects; blank means verify via JWKS |
| `SUPABASE_STORAGE_BUCKET` | Yes | Defaults to `documents` |
| `SIGNING_TOKEN_SECRET` | Yes | 32+ bytes. Rotating it kills every outstanding link |
| `SIGNING_TOKEN_TTL_HOURS` | — | Default `168` (7 days) |
| `EMAIL_*` | — | SMTP settings; unset uses the console backend |
| `MAX_UPLOAD_BYTES` | — | Default 25 MB |

### Frontend — `frontend/.env`

Only `VITE_*` keys reach the browser. **Never** put the service-role key here.

| Variable | Required | Purpose |
| --- | --- | --- |
| `VITE_API_BASE_URL` | Yes | Default `http://localhost:8000/api` |
| `VITE_SUPABASE_URL` | Yes | Same project as the backend |
| `VITE_SUPABASE_ANON_KEY` | Yes | Public anon key |
| `VITE_FIREBASE_*` | — | Seven keys; analytics is disabled unless all are set |

---

## Supabase setup

**1. Database.** Copy the connection string from *Project Settings → Database* into
`DATABASE_URL`. Skipping this is fine for a first run — the API falls back to a local
SQLite file.

**2. Auth.** Enable Email in *Authentication → Providers*. The API accepts both
signing schemes: set `SUPABASE_JWT_SECRET` for legacy HS256 projects, or leave it
blank and the API verifies against the project's JWKS endpoint instead.

**3. Storage.** Create a **private** bucket named `documents`:

```sql
insert into storage.buckets (id, name, public)
values ('documents', 'documents', false)
on conflict (id) do nothing;
```

No RLS policies are needed. The browser only ever touches storage through a signed
upload URL minted by the API, and downloads are short-lived signed URLs. The
service-role key stays server-side and is never sent to the frontend.

---

## Architecture

```
Browser ──presigned PUT──────────────────────► Supabase Storage
   │                                                  ▲
   │  REST + Supabase JWT                             │ service role
   ▼                                                  │
DRF API ──────────────────────────────────────────────┘
   │
   ├── documents/   Document, DocumentRevision (SHA-256 per stored revision)
   ├── workflows/   Workflow, Recipient (routing order), Field (normalised geometry)
   ├── audit/       AuditEvent — append-only, hash-chained
   ├── signing/     stateless magic tokens + the routing state machine
   └── core/        storage gateway, PDF pipeline, mailer, hashing
```

### Document lifecycle

```
draft ──send──► routing ──all signers complete──► completed
  │                │
  │                ├──any signer declines──────► declined
  │                └──owner voids──────────────► voided
  └──delete
```

A plan is only editable while the document is a draft, which is why the workflow
endpoint replaces it wholesale rather than diffing.

### The audit chain

Every event stores three hashes:

| Field | Definition |
| --- | --- |
| `payload_hash` | SHA-256 over the event's canonical JSON — sorted keys, fixed separators — including timestamp, actor, IP and metadata |
| `prev_hash` | The previous event's `chain_hash`, or 64 zeros for the first event |
| `chain_hash` | `SHA-256(prev_hash + ":" + payload_hash)` |

Editing or deleting any historical row invalidates every hash after it.
`GET /api/documents/{id}/audit/verify/` walks the chain and names the exact event
where it breaks.

Two implementation details worth knowing:

- `AuditEvent.created_at` deliberately does **not** use `auto_now_add` — the ORM would
  rewrite the value *after* it had been hashed, breaking verification on every row.
- Rows are locked per document (`select_for_update`) while a link is appended, so two
  concurrent signers cannot claim the same sequence number.

### Magic links

An external signer never creates an account. The link carries an HS256 JWT with the
recipient id, a `jti`, the document id, and an expiry. The only server state consulted
is the recipient's current `token_jti` — rotating it, on resend or when a document is
voided, kills every outstanding link for that person instantly.

Tokens stay valid after signing so the signer can revisit their confirmation and the
executed copy; a second submission is blocked by recipient status, not by burning the
token.

### PDF pipeline

Field geometry is stored normalised (0–1, top-left origin) so it survives any zoom
level and any page size. On execution, `core/pdf.py`:

1. Flips the y-axis from browser coordinates into PDF user space.
2. Stamps each filled field onto its page with `reportlab`.
3. Merges the overlay into the source page with `pypdf`.
4. Watermarks every page with the document id and execution timestamp.
5. Appends a certificate of completion listing signers, IPs and the full audit chain.

Typed signatures render in an italic serif; drawn signatures arrive as PNG data URLs
and are stamped as images.

---

## API reference

All authenticated routes take `Authorization: Bearer <supabase-access-token>` and are
scoped to the caller's organization.

### Account

| Method | Path | Purpose |
| --- | --- | --- |
| `GET` | `/api/config/` | Which integrations are configured (no secrets) |
| `GET` `PATCH` | `/api/me/` | Current profile; a GET provisions the local user on first login |
| `PATCH` | `/api/me/organization/` | Rename the workspace |

### Documents

| Method | Path | Purpose |
| --- | --- | --- |
| `GET` | `/api/dashboard/stats/` | KPI counts and recent documents |
| `GET` `POST` | `/api/documents/` | List (filter, search, order) / create |
| `GET` `PATCH` `DELETE` | `/api/documents/{id}/` | Detail, rename, delete |
| `POST` | `/api/documents/{id}/upload-url/` | Mint a presigned upload URL |
| `POST` | `/api/documents/{id}/attach/` | Confirm the upload; server derives hash + page count |
| `GET` | `/api/documents/{id}/download-url/` | Signed download — `?variant=original\|executed` |

### Routing

| Method | Path | Purpose |
| --- | --- | --- |
| `GET` `PUT` | `/api/documents/{id}/workflow/` | Read or replace the whole routing plan |
| `POST` | `/api/documents/{id}/send/` | Validate and dispatch the first invitations |
| `POST` | `/api/documents/{id}/void/` | Halt routing, revoke every link |
| `POST` | `/api/documents/{id}/recipients/{rid}/resend/` | Rotate the token, email a fresh link |

### Audit

| Method | Path | Purpose |
| --- | --- | --- |
| `GET` | `/api/documents/{id}/audit/` | Full event chain, newest first |
| `GET` | `/api/documents/{id}/audit/verify/` | Recompute and verify the chain |

### Public signing

These take **no** bearer token — the magic link *is* the credential — and are
rate-limited separately at 60 requests per minute.

| Method | Path | Purpose |
| --- | --- | --- |
| `GET` | `/api/sign/{token}/` | Signing session; records the view and the signer's IP |
| `POST` | `/api/sign/{token}/submit/` | Submit field values; advances or executes |
| `POST` | `/api/sign/{token}/decline/` | Decline with a reason; halts the routing |

Errors are normalised to `{"detail": "...", "errors": {"field": ["..."]}}`.

---

## Testing

```bash
cd backend && .venv/Scripts/python manage.py test
```

22 tests, all passing. Storage is faked in memory, so the suite never touches Supabase.

**`signing/tests.py` — 10 tests**

- A full sequential route from send through execution and chain verification
- Step 2 cannot jump ahead of step 1
- A required field blocks submission
- Sending is refused when a signer has no fields placed
- Editing an audit row breaks verification at exactly that event
- Tokens round-trip; rotating a `jti` kills an old link; a token signed with the wrong secret is rejected
- The public session endpoint records the view and the signer's IP
- Declining halts the document and leaves the chain intact

**`documents/tests.py` — 12 tests**

- The detail payload has the expected shape after the `fields_` → `fields` rename
- Lists and detail reads are scoped to the caller's organization
- `attach` derives hash and page count server-side, and rejects foreign paths and non-PDFs
- `PUT /workflow/` replaces the plan wholesale, normalises order, and keeps fields with their recipient
- Duplicate recipient emails are rejected
- Sending without an uploaded file is refused
- Voiding rotates every outstanding token
- Anonymous requests get 401

Frontend checks:

```bash
cd frontend && npm run build
```

---

## Design reference

Screen layouts and design tokens come from the Stitch project *Verified Signing
Workflow*. The source exports are not vendored in this repo — the design system lives
in the code instead.

The token set is Material 3: Plus Jakarta Sans, primary `#0040e0`, Material Symbols
icons. It is transcribed into Tailwind v4 `@theme` variables in
[`frontend/src/styles/index.css`](frontend/src/styles/index.css), so every colour role
from the designs maps to a utility class of the same name — `bg-surface-container-lowest`,
`text-on-surface-variant`, and so on. Changing a brand colour is a one-line edit there.

Seven screens are implemented from the design: landing, sign in, sign up, dashboard,
workflow builder, secure signing viewer, and document audit trail.

---

## Known limits

| Area | Status |
| --- | --- |
| **Email** | Defaults to Django's console backend — invitations print to the API log. Set the `EMAIL_*` variables for real delivery. |
| **Reminders** | Modelled (`Workflow.reminder_days`) but not dispatched. Needs a scheduler (cron or Celery beat) calling into `signing.services`. |
| **Templates, Analytics** | Routed and reachable in the UI, but render an explicit placeholder rather than pretending to work. |
| **Expiry** | Enforced when a signer submits. A document that lapses without anyone opening it stays `routing` until then; a sweep job would close those out. |
| **Execution I/O** | `execute_document` downloads and uploads inside the submitting transaction, holding the document lock across two network calls. Fine at current scale; worth moving to a task queue before it isn't. |
