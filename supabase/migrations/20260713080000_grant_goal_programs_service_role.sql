-- goal_programs was created without API-role grants (this project's default
-- ACLs don't include them — see 20260702000000_grant_missing_api_role_
-- privileges). The /api/goals route reads it through the service-role
-- client, which was getting "permission denied". Clients get nothing:
-- RLS stays on with no policies, reads go through the API.

grant select, insert, update, delete on table goal_programs to service_role;
