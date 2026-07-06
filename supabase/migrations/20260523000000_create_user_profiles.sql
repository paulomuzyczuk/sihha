create type user_role as enum ('therapist', 'psychologist', 'psychiatrist');

create table user_profiles (
  user_id    uuid primary key references auth.users on delete cascade,
  role       user_role not null,
  full_name  text not null,
  approved   boolean not null default false,
  created_at timestamptz not null default now()
);

alter table user_profiles enable row level security;

-- Users can only read their own profile
create policy "users can read own profile"
  on user_profiles for select
  using (auth.uid() = user_id);

-- No public insert or update — all writes go through service role only
