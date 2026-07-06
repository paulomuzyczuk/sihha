# Changelog

All notable changes to this project will be documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.1.0/),
and this project aims to adhere to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

## [Unreleased]

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
