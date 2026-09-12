# Self-hosting guide: push notifications and email-delivery tracking

**Status:** not implemented in this template. This document is a blueprint
for a self-hoster who wants to add it, written from the flagship
deployment's experience — not a description of code that ships here.

---

## Outbound email provider — recorded decision (2026-09-12)

Flagship's `resend-delivery-webhooks` cluster (`services/resendWebhook.ts` +
`app/api/webhooks/resend/route.ts`) is policy-included in the sync manifest —
CHARTER.md calls it "a reliability improvement that strengthens the alert
path for everyone" — but it is meaningless on top of this repo's email
backend: `services/email.ts` sends via Gmail SMTP (`nodemailer`), which has
no delivery-webhook concept at all. Porting the cluster as-is would ship dead
code with no provider to drive it.

Considered and rejected for now:

- **Migrate to Resend outright.** Unlocks the cluster cleanly, but trades a
  zero-friction Gmail account (the lowest-friction on-ramp for this
  project's target user — a family or small care team, not a company) for a
  new provider account and two more secrets (`RESEND_API_KEY`,
  `RESEND_WEBHOOK_SECRET`).
- **Support both backends behind an env switch.** Avoids the trade-off above
  but means maintaining two email code paths — and a webhook route +
  `email_events` ledger that are dead weight on every Gmail deployment,
  which is most of them — against this repo's own bias against
  feature-flagged shims (`CLAUDE.md`).

**Decision:** keep Gmail SMTP as the only backend for now. Revisit
`resend-delivery-webhooks` only if/when there's separate appetite to make
Resend the default outbound provider for this template (a bigger decision
than delivery-confirmation alone — better deliverability generally, not just
webhooks). At that point the cluster ports mechanically with no further
design work. Until then this stays a documented gap, not a silent one — see
the DIY blueprint below if you want delivery visibility sooner than that.

## Why this isn't in the template

The public template's alerting is deliberately minimal: a daily missing-log
cron and a low-stock check, both delivering plain e-mail via
`services/email.ts` (Gmail SMTP through `nodemailer`). Adding real delivery
observability — did the push notification actually display on the
recipient's phone, did they open the reminder e-mail — means standing up
two new subsystems (web push, and provider-side e-mail event webhooks).
That's a genuinely separate feature, not a security fix, so it isn't
bundled into this sync. If you need it, here is the shape that worked in
production.

## 1. Web push delivery tracking

- Add a `push_events` table: `(id, user_id, kind, sent_at, displayed_at,
  opened_at)`. Every outbound push call records a `sent` row immediately;
  the service worker posts back to a small `/api/push/event` endpoint on
  `displayed`/`opened` (via the Notification API's `show`/`click` events),
  which fills in the corresponding timestamp column by id.
- Record a `no-devices` info log (not an error) when a user has zero
  registered subscriptions — a zero send is a different failure mode than a
  failed provider call and should be distinguishable in your logs.
- **Fail open on the ledger write.** A `push_events` insert failure must
  never block the actual push send — log it at ERROR and move on. Delivery
  correctness matters more than delivery telemetry.

## 2. Email open-tracking (Resend)

If you move off Gmail SMTP onto [Resend](https://resend.com) (recommended
once you need delivery visibility — Gmail SMTP gives you none):

- Enable Resend's open tracking. It requires a dedicated tracking
  subdomain (e.g. `track.yourdomain.com` CNAME'd to Resend's tracking
  host) — the API-only toggle silently no-ops without it. Click tracking
  can stay off; you only need opens.
- Add an `/api/webhooks/resend` route: verify the Svix signature
  (`node:crypto` HMAC, no new dependency needed), reject requests outside a
  5-minute replay window, and **fail closed** if `RESEND_WEBHOOK_SECRET`
  isn't set — an unset secret must deny every webhook call, not accept
  everything.
- Store events in an `email_events` table keyed by the provider's event id
  (unique constraint), so retried webhook deliveries are naturally
  idempotent.

## 3. Privacy posture — decide this before you ship it

This is the part that actually matters, and the part most likely to be
skipped under time pressure. Whatever you build, decide these three things
explicitly and write the decision down:

1. **Aggregate-only by default.** Build circle-level dashboards (open
   rates, delivery lag, logging adherence) — not "did Maria open her 3pm
   reminder" per-person drill-downs. A per-person view is a much bigger
   privacy commitment; only add one if you have a concrete care need for
   it, and gate it behind the same membership checks as any other clinical
   read.
2. **Tell people it's happening.** A short notice at push opt-in — "we
   record whether reminders were delivered and opened, in aggregate, for
   service reliability" — in whatever locales you support.
3. **Set a retention window and enforce it in the database, not in app
   code.** A `pg_cron` job that purges raw `push_events`/`email_events`
   rows older than N days (90 is a reasonable default) means the retention
   promise holds even if a future code change forgets to call a cleanup
   function. If your Supabase plan doesn't include `pg_cron`, a scheduled
   Vercel cron route calling a `DELETE ... WHERE created_at < now() -
   interval 'N days'` does the same job.

## 4. Testing checklist

Whatever you build here inherits this repo's testing discipline
(`CLAUDE.md` → Testing): write the test before the code, and explicitly
cover — a failed ledger write never blocking the real send; the webhook
route rejecting an unsigned or stale-signed request; a retried webhook
delivery not double-inserting; the retention purge actually deleting rows
older than the window and leaving newer ones untouched.
