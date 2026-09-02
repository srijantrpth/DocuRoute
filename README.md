# DocuRoute

Ordered document signing with a tamper-evident audit trail.

A business user uploads a PDF, defines an ordered sequence of approvers and signers,
and places field boxes on the page. Signers receive time-limited magic links, review
the document in the browser, and sign. Once every party completes, a watermarked PDF
with a certificate of completion is generated and emailed to all stakeholders.

- **Backend** — Django 5.2 + Django REST Framework
- **Frontend** — React 19 + Vite + TypeScript + Tailwind v4
- **Auth** — Supabase Auth (the API verifies Supabase JWTs); external signers never need an account
- **Storage** — Supabase Storage with presigned browser uploads
- **Analytics** — Firebase Analytics (optional; disabled when keys are absent)

Design tokens and screen layouts come from the Stitch project *Verified Signing
Workflow*; the original exports are kept in [`design/stitch/`](design/stitch) for reference.

---

## Quick start

### 1. Backend

```bash
cd backend && python -m venv .venv && .venv/Scripts/pip install -r requirements.txt
```

Copy `.env.example` to `.env` at the repo root and fill it in, then:

```bash
cd backend && .venv/Scripts/python manage.py migrate && .venv/Scripts/python manage.py runserver
```

The API listens on `http://localhost:8000`. `GET /health/` and `GET /api/config/` work
without credentials — `/api/config/` reports which integrations are actually wired up.

### 2. Frontend

```bash
cd frontend && npm install
```

Copy `frontend/.env.example` to `frontend/.env`, fill in the `VITE_*` keys, then:

```bash
cd frontend && npm run dev
```

The app runs on `http://localhost:5173`.

---

## Supabase setup

**Database** — copy the connection string from *Project Settings → Database* into
`DATABASE_URL`. Without it the API falls back to a local SQLite file, which is fine
for a first run.

**Auth** — enable Email in *Authentication → Providers*. The API accepts both signing
schemes: set `SUPABASE_JWT_SECRET` for legacy HS256 projects, or leave it blank and
the API verifies against the project's JWKS endpoint instead.

**Storage** — create a **private** bucket named `documents`:

```sql
insert into storage.buckets (id, name, public)
values ('documents', 'documents', false)
on conflict (id) do nothing;
```

No RLS policies are needed. The browser only ever touches storage through a signed
upload URL minted by the API, and downloads are short-lived signed URLs. The
service-role key stays server-side and is never sent to the frontend.

---

## How it fits together

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

### The audit chain

Every event stores three hashes:

- `payload_hash` — SHA-256 over the event's own canonical JSON (sorted keys, fixed
  separators), including its timestamp, actor, IP and metadata.
- `prev_hash` — the previous event's `chain_hash`, or 64 zeros for the first event.
- `chain_hash` — `SHA-256(prev_hash + ":" + payload_hash)`.

Editing or deleting any historical row invalidates every hash after it.
`GET /api/documents/{id}/audit/verify/` walks the chain and names the exact event
where it breaks. `AuditEvent.created_at` deliberately does **not** use `auto_now_add`,
because the ORM would rewrite the value after it had been hashed.

Rows are locked per document (`select_for_update`) while a link is appended, so two
concurrent signers cannot claim the same sequence number.

### Magic links

An external signer never creates an account. The link carries an HS256 JWT with the
recipient id, a `jti`, the document id, and an expiry. The only server state consulted
is the recipient's current `token_jti` — rotating it (on resend, or when a document is
voided) kills every outstanding link for that person instantly.

Tokens stay valid after signing so the signer can revisit their confirmation; a second
submission is blocked by recipient status, not by burning the token.

### PDF pipeline

Field geometry is stored normalised (0–1, top-left origin) so it survives any zoom
level and any page size. On execution, `core/pdf.py` flips the y-axis into PDF user
space, stamps each filled field onto its page with `reportlab`, merges the overlay with
`pypdf`, watermarks every page, and appends a certificate of completion listing the
signers and the full audit chain. Typed signatures are drawn in an italic serif; drawn
signatures arrive as PNG data URLs and are stamped as images.

`pypdf` + `reportlab` are used rather than PyMuPDF, which is AGPL.

---

## API surface

| Method | Path | Purpose |
| --- | --- | --- |
| `GET` | `/api/config/` | Which integrations are configured (no secrets) |
| `GET/PATCH` | `/api/me/` | Current profile; a GET provisions the local user on first login |
| `GET` | `/api/dashboard/stats/` | KPI counts and recent documents |
| `GET/POST` | `/api/documents/` | List / create |
| `GET/PATCH/DELETE` | `/api/documents/{id}/` | Detail, rename, delete |
| `POST` | `/api/documents/{id}/upload-url/` | Mint a presigned upload URL |
| `POST` | `/api/documents/{id}/attach/` | Confirm the upload; server derives hash + page count |
| `GET` | `/api/documents/{id}/download-url/` | Signed download (`?variant=original\|executed`) |
| `GET/PUT` | `/api/documents/{id}/workflow/` | Read or replace the whole routing plan |
| `POST` | `/api/documents/{id}/send/` | Validate and dispatch the first invitations |
| `POST` | `/api/documents/{id}/void/` | Halt routing, revoke every link |
| `POST` | `/api/documents/{id}/recipients/{rid}/resend/` | Rotate the token, email a fresh link |
| `GET` | `/api/documents/{id}/audit/` | Full event chain |
| `GET` | `/api/documents/{id}/audit/verify/` | Recompute and verify the chain |
| `GET` | `/api/sign/{token}/` | **Public.** Signing session; records the view |
| `POST` | `/api/sign/{token}/submit/` | **Public.** Submit field values |
| `POST` | `/api/sign/{token}/decline/` | **Public.** Decline with a reason |

The three public endpoints take no bearer token — the magic link *is* the credential —
and are rate-limited separately.

---

## Tests

```bash
cd backend && .venv/Scripts/python manage.py test
```

Ten tests cover the parts worth proving: a full sequential route from send through
execution, that step 2 cannot jump ahead of step 1, that a required field blocks
submission, that editing an audit row breaks verification at exactly that event, that
rotating a `jti` kills an old link, and that a token signed with the wrong secret is
rejected. Storage is faked in-memory, so the suite never touches Supabase.

---

## Notes and current limits

- **Email** defaults to Django's console backend, so invitations print to the API log.
  Set the `EMAIL_*` variables for real delivery.
- **Reminders** are modelled (`Workflow.reminder_days`) but not yet dispatched — that
  needs a scheduler (cron or Celery beat) calling into `signing.services`.
- **Templates** and **Analytics** are routed and reachable in the UI but not built out;
  they render an explicit placeholder rather than pretending to work.
- **Expiry** is enforced when a signer submits. A document that lapses without anyone
  trying to sign stays `routing` until then; a sweep job would close those out.
- The routing plan is replaced wholesale on save, which is safe because plans are only
  editable while a document is a draft.
#   D o c u R o u t e  
 