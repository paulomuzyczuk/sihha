# CLAUDE.md

Guidance for agents and contributors working in this repository. These rules
override default behaviour — follow them exactly.

---

## Project Overview

**Name:** sihha
**Purpose:** A self-hostable, template-driven platform for care teams to log
daily caregiving metrics, manage documents (invoices, prescriptions, evaluation
reports), track behavioural trends, and send automated medication/compliance
alerts by email.
**Model:** A "care circle" groups one care recipient with the members who look
after them (caregivers, clinicians, family). Metrics are schema-as-data, so a
deployment tailors what it tracks per recipient without code changes.
**Data sensitivity:** Deployments handle health data, financial data (invoices),
and — where geofencing is enabled — precise geolocation. Treat all of it as
sensitive by default.

---

## Threat Model

**Attack surfaces:**

- Next.js API routes under `app/api/*`
- Supabase Auth endpoints
- Supabase Storage direct uploads (file payloads)

**Must never be exposed:**

- `SUPABASE_SERVICE_ROLE_KEY`, `GMAIL_APP_PASSWORD`, `CRON_SECRET`
- Stack traces, raw database errors, and internal paths
- Historical care logs (the entry UI is write-only)

**Trust boundaries:**

- Trusted: requests authenticated with a valid Supabase JWT whose role is
  explicitly verified per route (see `services/apiAuth.ts`).
- Untrusted: all user-supplied input and file uploads.

**Failure mode:** if compromised, health and geolocation data could leak, care
logs could be spoofed, or the cron endpoint could be abused to flood alert
recipients. Design every change with these in mind.

---

## Stack

- **Language:** TypeScript (`strict: true` — no `any` without an inline reason)
- **Runtime / framework:** Node.js, Next.js (App Router)
- **Database / auth / storage:** Supabase (PostgreSQL)
- **Validation:** `zod` at every request boundary
- Pin dependency versions — no unversioned ranges in production.

---

## Commands

Run these headlessly to validate changes. If any fails, fix it before adding new
logic.

| Purpose             | Command             |
| ------------------- | ------------------- |
| Run full test suite | `pnpm test`         |
| Run linter          | `pnpm lint`         |
| Run type checker    | `pnpm typecheck`    |
| Check formatting    | `pnpm format:check` |
| Dependency audit    | `pnpm audit`        |
| Start dev server    | `pnpm dev`          |

Formatting is decided by Prettier (`.prettierrc`) — never debate it, run it.

---

## Directory Structure

```text
app/                      # Next.js routes
  api/                    # Backend API routes (auth-gated)
  dashboard/ clinician/ admin/ login/   # UI pages
components/               # React components + shared UI kit (components/ui)
lib/                      # Shared types, constants, i18n, helpers
services/                # Backend logic (email, alerts, aggregates, auth)
supabase/migrations/     # Schema — the single source of truth (see below)
templates/               # Schema-as-data metric templates
__tests__/               # Test suite (unit + integration)
```

---

## Security Decisions

- **Authentication:** Supabase Auth JWT (Bearer token). Every `/api/*` route
  verifies the caller's role/membership explicitly before acting.
- **Rate limiting:** sliding-window per user and per IP on API routes. In
  production, back it with shared storage (Upstash Redis) — the in-memory
  fallback is ineffective across serverless instances.
- **SSRF:** no server-side fetch of user-supplied URLs. Storage URLs are
  validated to belong to the project's Supabase host before use.
- **Uploads:** restricted to specific MIME types and a max size, enforced both
  client-side and by the Storage bucket. Document buckets are private; reads go
  through short-lived signed URLs, never permanent public links.
- **Transit:** HTTPS only; enable HSTS in production.
- **Secrets:** live in `.env.local` only (see `.env.example` for the full list
  of names). Never commit them; never log their values.

---

## Known Constraints & Gotchas

- **Geolocation is advisory, never blocking.** Geofencing is per-recipient
  (`care_recipients.geo_*`). The backend records a `location_verified` boolean
  on the log entry; a submission is never rejected for location. No configured
  zone (or no coordinates) yields `location_verified = false`.
- **Write-only entry UI.** The dashboard does not fetch historical logs. The
  interface shown depends on the signed-in member's role in the selected circle.
- **Storage constraints.** Enforce upload MIME/size limits on both the client
  and the bucket — they must agree.

---

## Database Migrations — The Repo Is the Single Source of Truth

- **Every schema change is a file** in `supabase/migrations/`, applied with
  `supabase db push`. Do not apply DDL out-of-band (dashboard SQL editor,
  ad-hoc `execute_sql`, or MCP `apply_migration`) — that diverges the migration
  history from the repo.
- **Pick a unique version:** check the latest existing file before naming a new
  one; duplicate versions make `db push` fail.
- **Verify sync after pushing:** `supabase migration list` should show every row
  with both a local and a remote side.
- Read-only inspection (`execute_sql` for SELECTs) is fine.

---

## Engineering Rules

These exist because conventions not written down get ignored.

### Clean code

- Functions ~4–20 lines (hard limit 30); files under ~300 lines (hard limit
  500). Split before adding logic to an over-long file.
- One module, one responsibility. Prefer three focused files over one that does
  everything.
- **Grep-searchable names** — no `handler`, `service`, `manager`, `data`,
  `helper`, `utils`, `temp`. Use full descriptive names.
- Max 2 levels of indentation per function — early returns over nested blocks.
- DRY: grep for existing logic before writing new; extract, don't duplicate.
- Comment the **why** (business constraint, security rationale, worked-around
  bug), not the **what**. Don't delete provenance comments.
- Errors carry context: what was received, what was expected, which function
  threw. No bare "invalid input".
- Inject dependencies (clients, connections, paths) rather than hardcoding them.
- Type every signature. No dynamic types without an inline reason.

### Testing

- **Write the test before the code.** No feature or bug fix without a test.
- Tests are headlessly runnable — no manual setup, no secrets outside `.env`.
- F.I.R.S.T: Fast, Independent, Repeatable, Self-validating, Timely.
- Coverage targets: >80% overall, >95% on business logic.
- Explicitly test invalid inputs, boundaries, auth failures, and injection
  attempts. A security control with no test does not exist.
- Every bug fix ships with a regression test in the **same** commit.

### Security baseline

- Validate all input at the boundary (schema, type, length, format, charset);
  reject early; return generic errors to callers.
- Never leak stack traces, internal paths, or DB errors to clients — log detail
  internally, return a generic message.
- Rate-limit every exposed endpoint (sliding window).
- Don't add a dependency without checking it for known vulnerabilities; keep the
  audit in pre-commit; don't suppress CVE warnings without explicit approval.
- If blocked by an auth/OAuth constraint, stop and report it — never work around
  it via token/cookie/storage manipulation.

### Git discipline

- Small, single-purpose commits. Message format: `type: short description`
  (`feat`, `fix`, `refactor`, `test`, `docs`, `chore`, `security`).
- Never commit secrets or build artefacts. Verify `.env*` is gitignored.
- Run the full test suite before committing.
