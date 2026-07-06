# Security Policy

## Reporting a vulnerability

Please report security issues **privately** through GitHub's private
vulnerability reporting: go to the repository's **Security** tab → **Report a
vulnerability**. This keeps the report confidential until a fix is available.

Please do **not** open a public issue for a suspected vulnerability. sihha
instances hold care and health observations about real people; a publicly
disclosed authorization or RLS flaw puts every self-hosted deployment's data
at risk before operators can patch.

This is a personal, best-effort project maintained by one person — there is
no SLA, but security reports get looked at first.

## Scope

In scope: anything in this repository — API route authorization
(`services/careTeam.ts`), RLS policies in `supabase/migrations/`, the dynamic
log validation, the invite and admin flows, the cron endpoints.

Out of scope: the security of your own deployment (your Supabase project
settings, leaked service-role keys, your Vercel account) and vulnerabilities
in upstream dependencies (report those upstream — but a heads-up so this
project can bump the dependency is welcome).

## Supported versions

Only the latest commit on `main` is supported. There are no backported
fixes; keep your instance current.
