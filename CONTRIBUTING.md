# Contributing

Thanks for your interest. This is a small, opinionated project; the goal of
this guide is to make a good contribution easy to get right on the first try.

Before you start anything non-trivial, **open an issue** describing the
change. sihha is solo-maintained and mirrors a production instance the
maintainer runs for a real care circle, so a quick check that a change fits
the design saves everyone a wasted PR. Small fixes (typos, a clearly-broken
thing) can go straight to a PR.

By participating you agree to the
[Code of Conduct](CODE_OF_CONDUCT.md). Security issues should **not** be
filed as public issues — see [`SECURITY.md`](SECURITY.md).

## What contributions fit

- **Bug fixes** — anything where the code does not do what
  [`docs/architecture.md`](docs/architecture.md) says it should.
- **Templates** — new care profiles in `templates/` (a versioned JSON of
  metric definitions + alert config). Good templates encode real caregiving
  practice; cite what informed the metric choices in the PR.
- **Metric value types & aggregation** — new `value_type`s need the full
  chain: enum value in a migration, form control, dynamic validation,
  aggregation dispatch, dashboard rendering, tests for each.
- **Self-hosting ergonomics** — anything that makes step 1–5 of the README
  quickstart shorter or harder to get wrong.

What does _not_ fit: multi-tenant SaaS features, clinical/medical-device
functionality, and anything that weakens the write-only RLS posture (clients
never read raw log entries — reads are aggregate-only by design).

## The bar

Every PR must pass the full verification suite:

```sh
pnpm test && pnpm typecheck && pnpm lint && pnpm format:check
```

CI runs the same bar on every push. New behavior needs tests beside the
existing ones in `__tests__/` (route tests use the shared
`__tests__/helpers/careTeamMock.ts`).

Two hard rules from this project's history:

1. **A metric's `value_type` never changes once entries reference its key.**
   Retire the metric and introduce a new key instead.
2. **No personal data in the repo.** Fixtures use obviously neutral
   coordinates, timezones, and names. If your test needs a location, it does
   not need a real one.
