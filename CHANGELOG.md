# Changelog

All notable changes to this project will be documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.1.0/),
and this project aims to adhere to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

## [Unreleased]

### Added

- **CSV export** for clinicians: `GET /api/logs/aggregates?format=csv`
  returns the aggregate series as a spreadsheet-safe attachment (RFC 4180
  quoting, formula-injection guard, UTF-8 BOM), plus an "Export CSV"
  button on the clinician dashboard. Aggregates only — the export carries
  no raw notes or coordinates.
- **Internationalization**: English and Portuguese dictionaries with a
  per-browser PT|EN toggle. English is the default (`DEFAULT_LOCALE` in
  `lib/i18n/dictionaries.ts`); alert e-mails follow the `EMAIL_LOCALE`
  env variable.

### Changed

- Low-stock and missing-log alert e-mails render from the i18n
  dictionaries instead of hard-coded Portuguese strings.

### Removed

- Four dead pre-M3 form components (`MoodSlider`,
  `HouseholdTasksChecklist`, `ExerciseSection`, `AppointmentSection`)
  and the appointment constants only they referenced.

### Security

- Scoped pnpm overrides for five Dependabot advisories: postcss <8.5.10
  (XSS in stringify output, runtime), esbuild 0.28.0 (dev-server file
  read), js-yaml 3.x/4.x (merge-key DoS), @babel/core ≤7.29.0
  (sourceMappingURL file read).

## [0.1.0] - 2026-07-06

Initial public release — a fresh-history extraction of a production
instance that has run a real care circle since May 2026.

### Added

- **Care circles**: `care_recipients` + per-recipient `care_team_members`
  memberships (`owner` / `caregiver` / `clinician` / `recipient`), invite
  flow, and a circle switcher for users in more than one circle.
- **Schema-as-data metrics**: `metric_definitions` with seven value types
  (`scale`, `boolean`, `number`, `duration_minutes`, `time_range`, `enum`,
  `medication_checklist`), daily/weekly cadence, `depends_on` coupling,
  `filled_by` role, and owner-editable definitions (value type frozen once
  entries exist).
- **Dynamic log form** rendered from metric definitions, with server-side
  Zod validation built per submission and per-recipient
  `one_per_day` / `multiple_per_day` cadence enforcement.
- **Geofence verification** (per-recipient opt-in) on log submission.
- **Templates**: mental-health, elder-care, and pet-care care profiles;
  "create recipient from template" admin flow.
- **Alerts**: daily cron checks recipient-local missing-log deadlines and
  medication stock depletion; delivery to members with `receives_alerts`.
- **Dashboards**: per-metric aggregate series (avg / completion % /
  adherence %) with daily/weekly/monthly bucketing and lookback.
- **Analytics**: dbt project staging log entries into per-metric marts,
  Lightdash-ready; manual-trigger GitHub Actions workflow.
- **Medication stock tracking** and expense/invoice upload.
- 226 Jest tests, CI (lint / typecheck / format / test) on every push.

[Unreleased]: https://github.com/paulomuzyczuk/sihha/compare/v0.1.0...HEAD
[0.1.0]: https://github.com/paulomuzyczuk/sihha/releases/tag/v0.1.0
