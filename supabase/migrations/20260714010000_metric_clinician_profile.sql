-- Per-profile clinician scales (M8): a clinician-filled metric may be scoped
-- to one specialist (psychologist or psychiatrist). Null means any clinician
-- fills it. Meaningless on other roles, so a table check keeps the pair
-- coherent; the API refuses it earlier with a friendlier message.
alter table public.metric_definitions
  add column if not exists clinician_profile text
  check (clinician_profile in ('psychologist', 'psychiatrist'));

alter table public.metric_definitions
  add constraint metric_definitions_profile_only_for_clinician
  check (clinician_profile is null or filled_by = 'clinician');
