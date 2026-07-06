# sihha — Architecture

sihha is a care-team logging platform: a team of humans (owners, caregivers,
clinicians) records structured daily observations about a **care recipient**
— a person or a pet — and the platform turns those entries into role-based
dashboards and alerts.

The core bet: **one opinionated engine, template-driven breadth.** Nothing in
the engine knows what condition, species, or household it serves; that
knowledge lives in per-recipient metric definitions, seeded from templates.

## Data model

Five tables carry the platform. (Migrations under `supabase/migrations/`
are authoritative; this is the map.)

### `care_recipients`

The subject of care is a first-class entity: display name, `kind`
(`human` / `pet` / free text), an IANA `timezone` (alert deadlines are
recipient-local), a `log_cadence` (`one_per_day` or `multiple_per_day`), and
an **optional** geofence (`geo_lat` / `geo_lng` / `geo_radius_m` — null means
no location verification).

### `care_team_members`

Roles are **per-recipient memberships**, not global claims. One user can
hold different roles in different care circles.

| Role        | May do                                            |
| ----------- | ------------------------------------------------- |
| `owner`     | manage team, invites, metric config; all below    |
| `caregiver` | submit logs, view own submissions                 |
| `clinician` | read aggregate dashboards                         |
| `recipient` | self-service flows (e.g. expense/invoice upload)  |

Each membership carries a free-text `member_label` ("Psicóloga", "Filho",
"Dog-sitter") and a `receives_alerts` flag — alert delivery is a membership
property, not global configuration.

The `recipient` role is optional and context-dependent: an adolescent or
adult recipient may hold an account; a pet never does. Templates suggest,
owners decide.

JWT `app_metadata.role` retains exactly one job: the platform `ADMIN` tier
(instance operator — `/admin`, `/api/admin/*`). Everything else is a
membership lookup: API routes go through a shared authorization helper
(`services/careTeam.ts`), and RLS policies check
`exists (select 1 from care_team_members where …)`.

### `metric_definitions` — schema as data

Every observable is a row, not a column. Tasks are just boolean metrics with
a cadence.

| `value_type`           | config                    | aggregates to    |
| ---------------------- | ------------------------- | ---------------- |
| `scale`                | `{min, max}`              | average          |
| `boolean`              | —                         | completion %     |
| `number`               | `{unit, min?, max?}`      | average or sum   |
| `duration_minutes`     | `{options?}`              | sum              |
| `time_range`           | `{start,end}` → hours     | average          |
| `enum`                 | `{options[]}`             | distribution     |
| `medication_checklist` | built-in                  | adherence %      |

Definitions also carry `cadence` (`daily` / `weekly` + `cadence_day`),
`filled_by` (which role's form renders this metric — clinician-facing inputs
are just metrics with `filled_by = 'clinician'`), `required`, `sort_order`,
and `active`. `config.depends_on` couples a metric to another (e.g. exercise
duration is forced null when no exercise type is given) and excludes it from
task-completion aggregation.

A metric's `value_type` **freezes once log entries reference its key** —
changing the meaning of recorded history is not allowed; retire the metric
and create a new key instead. Labels, ordering, active flag, and cosmetic
config stay editable.

`medication_checklist` is the one special citizen: its checklist items come
from `medication_stocks` (which is also what powers adherence math and
low-stock alerts).

### `care_log_entries`

Generic log storage: `recipient_id`, `author_id`, a recipient-local
`log_date`, a JSONB `values` object keyed by metric key, optional bounded
`notes`, submitted coordinates, and a server-computed `location_verified`
flag.

- **Cadence is per-recipient**, enforced in the API route (a second
  `one_per_day` submission for the same local date returns 409), not by a DB
  constraint — the rule is per-row configuration.
- **Validation is dynamic**: the API builds a Zod schema from the
  recipient's active metric definitions on every submission; weekly metrics
  accept null off-cadence.
- **Write-only RLS**: caregivers insert via membership check; there is no
  client SELECT on entries. Reads flow through service-role aggregate
  endpoints only.
- Trade-off accepted: JSONB values lose per-column CHECK constraints; the
  dynamic validation layer plus a `jsonb_typeof(values) = 'object'` check
  carry that weight. That is the price of schema-as-data.

### `alert_configs`

Per-recipient: `missing_log_hour` (local hour deadline; null = off) and
`low_stock_days` (medication threshold; null = off). A daily cron iterates
active recipients, computes deadlines in each recipient's timezone, and
emails the members with `receives_alerts = true`.

## Templates (care profiles)

`templates/*.json` are versioned seed files — each a recipient scaffold plus
a list of metric definitions and a default alert config. Shipped profiles:
**mental health**, **elder care**, **pet care**. "Create recipient from
template" (platform-admin flow) instantiates rows; from then on the template
is history — owners edit their circle's metrics freely. Templates are
starting points, never live links.

## Aggregation & dashboards

Aggregation dispatches on `value_type` (table above) and returns per-metric
series; the dashboard renders each metric by its type (scale → averages,
boolean → completion bars, checklist → adherence %). Bucketing supports
daily / weekly (ISO) / monthly periods with a lookback window. Entries are
bucketed by UTC `created_at`.

The dbt project (`analytics/`) stages log entries by unpivoting `values`
(one row per entry × metric, joined to `metric_definitions`) so any
recipient's metrics are explorable without per-template model changes.

## Legacy single-recipient schema

The platform grew out of a single-recipient deployment; migrations before
the `care_recipients` era create that legacy schema (`care_logs` with typed
columns, `user_profiles`, `schedule_config`) and later migrations carry the
generalization: **M1** adds the generic tables additively, **M2** backfills
`care_log_entries` from `care_logs` (see `scripts/backfill-m2.ts`; parity is
verified against the legacy aggregation in `scripts/legacyAggregates.ts`),
**M3** cuts the application over to memberships + metric definitions. The
legacy tables are retired after cutover; `scripts/seed-m1.ts` tolerates
their absence. A fresh instance simply replays all migrations and starts on
the generic model.

## Operational notes

- **Cron cadence**: Vercel Hobby limits crons to daily; each recipient's
  `missing_log_hour` is honored as "the deadline the daily run checks".
- **Geofence** is off by default and per-recipient opt-in; verification is
  server-side (`services/geofence.ts`).
- **Rate limiting** uses Upstash Redis when configured, falling back to
  per-instance in-memory counters otherwise.
- **Roles vocabulary**: invite flows provision memberships (role +
  member label) directly; there are no user tiers besides platform `ADMIN`.

## Explicitly out of scope

- Offline/PWA work, native apps.
- Multi-tenant SaaS — one instance serves one household or care
  organization. "Hosted sihha" would be a different product.
- Clinical claims of any kind. sihha is not a medical device and implies no
  HIPAA/GDPR certification.
