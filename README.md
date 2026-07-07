# sihha

**Self-hostable care-team logging for the people (and pets) who can't fully
self-manage.**

A care team logs structured daily observations about someone in their care —
a patient, an aging parent, a pet — and everyone involved gets role-based
dashboards and alerts. One opinionated engine; breadth comes from
template-driven care profiles, not forks.

> **Status:** working software, opened up — sihha has run a real care circle
> in production since May 2026. Solo-maintained and pre-1.0: the schema and
> APIs may still move. See [CONTRIBUTING.md](CONTRIBUTING.md) before sending
> non-trivial PRs.

## Why sihha exists

There is a gap between two kinds of existing software:

- **Consumer caregiver apps** (medication reminders, symptom diaries) are
  single-user, single-condition, and your data lives on someone else's
  servers.
- **Agency EHRs / home-care platforms** are built for businesses: heavy,
  expensive, and not something a family can run for itself.

sihha sits in the middle: a small, self-hostable platform for an informal
care team — family members, hired caregivers, clinicians — organized around
**care circles** with per-circle roles, **schema-as-data metrics** an owner
can edit, and **verifiable logging** (optional geofence check on submission).

## Features

- **Care circles** — each care recipient has a team; one user can hold
  different roles in different circles (caregiver for dad, owner for the dog).
  Roles: `owner`, `caregiver`, `clinician`, `recipient`.
- **Metrics as data, not columns** — every observable (mood, sleep,
  medications, meals, walks, weight…) is a `metric_definitions` row with one
  of seven value types (`scale`, `boolean`, `number`, `duration_minutes`,
  `time_range`, `enum`, `medication_checklist`). The log form, server-side
  validation (dynamic Zod), and aggregation all render from these rows.
- **Templates** — versioned JSON care profiles (`templates/`): mental health,
  elder care, pet care. Creating a recipient from a template instantiates its
  metrics and alert config; owners edit freely afterwards.
- **Geofence verification (opt-in)** — per-recipient location + radius;
  submissions are flagged verified/unverified server-side.
- **Alerts** — daily cron checks each recipient's local deadline for a
  missing log and medication stock depletion, and emails the members who
  opted in.
- **Dashboards** — per-metric aggregate series (averages, completion %,
  adherence %) with daily/weekly/monthly bucketing and lookback control.
  No client access to raw entries — reads are aggregate-only by design.
- **CSV export** — clinicians download the aggregate series (same
  aggregates-only guarantee) as a spreadsheet-safe CSV.
- **FHIR R4 facade** — a read-only, owner-gated `/api/fhir` surface
  (CapabilityStatement, Patient, CareTeam, Observation,
  MedicationStatement, `Patient/$everything`) so a circle's history can
  move into any FHIR-speaking system. Notes and geolocation are never
  exported; owners can attach LOINC/SNOMED codes per metric via
  `config.coding`.
- **English + Portuguese** — the UI ships in English by default with a
  per-browser PT|EN toggle; alert e-mails follow the `EMAIL_LOCALE` env.
- **Analytics** — a dbt project (`analytics/`) staging the log entries into
  per-metric marts, ready for Lightdash.

## Stack

Next.js (App Router) · Supabase (Postgres, Auth, RLS) · Vercel (hosting +
cron) · Nodemailer (Gmail SMTP) · optional Upstash Redis rate limiting ·
dbt + Lightdash for analytics. ~250 Jest tests.

## Self-hosting quickstart

1. **Supabase** — create a project, then apply everything in
   `supabase/migrations/` in filename order (SQL editor, `supabase db push`,
   or the management API).
2. **Env** — `cp .env.example .env.local` and fill it in. The Supabase URL +
   keys are required; Gmail SMTP powers alert e-mail; leave the geofence
   variables empty to disable location checks.
3. **Run** — `pnpm install && pnpm dev`, or deploy to Vercel (the included
   `vercel.json` schedules the daily alert cron; set `CRON_SECRET`).
4. **First admin** — sign up through the app, then grant yourself the
   platform-admin tier:
   `pnpm tsx scripts/set-user-role.ts you@example.com ADMIN`
5. **Create a care circle** — open `/admin`, create a recipient from the
   **pet-care template** (a good zero-sensitivity way to try the platform),
   and invite members with per-circle roles.

Run the test suite with `pnpm test`; the full verification bar is
`pnpm test && pnpm typecheck && pnpm lint && pnpm format:check`.

See [`docs/architecture.md`](docs/architecture.md) for the data model,
authorization model, and the design decisions behind them.

## Disclaimer

sihha is **not a medical device** and comes with **no HIPAA, GDPR, or other
regulatory certification implied**. It is a coordination and logging tool for
informal care teams. You self-host it; you are responsible for the data you
store with it and for complying with the laws that apply to you.

## License

[MIT](LICENSE)
