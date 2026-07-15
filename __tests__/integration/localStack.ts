// Coordinates for the local Supabase stack. These are the FIXED Supabase CLI
// local-dev demo credentials — identical on every `supabase start` (the anon /
// service_role JWTs are signed with the CLI's default demo secret). They are
// public development defaults, NOT production secrets, so committing them is
// safe and keeps the lane runnable with zero manual setup beyond `supabase
// start`. If a project ever customizes keys in supabase/config.toml, override
// these via the same env var names.
process.env.SUPABASE_LOCAL_URL =
  process.env.SUPABASE_LOCAL_URL ?? 'http://127.0.0.1:54321';
process.env.SUPABASE_LOCAL_ANON_KEY =
  process.env.SUPABASE_LOCAL_ANON_KEY ??
  'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZS1kZW1vIiwicm9sZSI6ImFub24iLCJleHAiOjE5ODM4MTI5OTZ9.CRXP1A7WOeoJeXxjNni43kdQwgnWNReilDMblYTn_I0';
process.env.SUPABASE_LOCAL_SERVICE_ROLE_KEY =
  process.env.SUPABASE_LOCAL_SERVICE_ROLE_KEY ??
  'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZS1kZW1vIiwicm9sZSI6InNlcnZpY2Vfcm9sZSIsImV4cCI6MTk4MzgxMjk5Nn0.EGIM96RAZx35lJzdJsyH-qQwv8Hdp7fsn3W0YpN81IU';
