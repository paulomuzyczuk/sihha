-- public.invoices was left without the table-level INSERT privilege for
-- authenticated (see 20260702000000 — tables in this project need explicit
-- grants), so its write-only RLS policies were unreachable: every client
-- invoice registration failed with "permission denied" (PostgREST 403,
-- surfaced as a 500 by /api/invoices). RLS stays the authorization layer —
-- this grant only makes it reachable. No SELECT: the table remains
-- write-only for clients.
grant insert on table public.invoices to authenticated;
