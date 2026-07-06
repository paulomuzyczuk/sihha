create table schedule_config (
  task_key text primary key check (task_key in ('laundry', 'cleaning', 'shopping')),
  weekday  smallint not null check (weekday >= 0 and weekday <= 6)
);

alter table schedule_config enable row level security;

-- Authenticated users can read schedule config
create policy "authenticated users can read schedule"
  on schedule_config for select
  to authenticated
  using (true);

-- Seed with ISO 8601 weekday defaults (Mon=0): Tue=1, Wed=2, Thu=3
insert into schedule_config (task_key, weekday) values
  ('laundry', 1),
  ('cleaning', 2),
  ('shopping', 3);
