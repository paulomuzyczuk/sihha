-- Backfills table-level GRANTs that the create_schedule_config and
-- create_user_profiles migrations omitted. Both enabled RLS and added read
-- policies but never granted table privileges, so even service_role hit
-- "permission denied" (SQLSTATE 42501): /api/schedule returned 500, and
-- /api/auth/request-access and the daily missing-log cron would fail on
-- user_profiles. service_role is the backend admin role; the authenticated
-- grants restore the access the existing RLS read policies assume.

grant select on table public.schedule_config to authenticated, service_role;

grant all on table public.user_profiles to service_role;
grant select on table public.user_profiles to authenticated;
