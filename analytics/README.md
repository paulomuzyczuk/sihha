# sihha analytics — dbt + Lightdash

Transforms the `care_logs` JSONB into typed behavioral marts (dbt) and serves
them as an explorable dashboard (Lightdash). Everything here runs against the
production Supabase Postgres over a direct connection; nothing goes through
the app's API.

```
Supabase (public.care_logs, JSONB)
        │  dbt build
        ▼
Supabase (analytics.stg_care_logs → analytics.fct_behavioral_daily)
        │  direct Postgres connection
        ▼
Lightdash (self-hosted, Docker on the CPU tower)
```

Security notes:

- The `analytics` schema is **not** exposed through Supabase's PostgREST API,
  so the marts are reachable only via direct Postgres connections.
- `stg_care_logs` deliberately never selects `notes`, `lat`, or `lng` — free
  text and coordinates cannot reach Lightdash.
- No secrets live in this directory; connections are env-var driven.

## 1. Database connection (both dbt and Lightdash use this)

Get the connection details from Supabase Studio → **Connect** (top bar).
Prefer the **session pooler**, which works over IPv4 (the direct
`db.<ref>.supabase.co` host is IPv6-only, which most home networks and
GitHub Actions can't reach):

| Env var             | Value (session pooler)                    |
| ------------------- | ----------------------------------------- |
| `SIHHA_PG_HOST`     | `aws-0-<region>.pooler.supabase.com`      |
| `SIHHA_PG_PORT`     | `5432`                                    |
| `SIHHA_PG_USER`     | `postgres.<project-ref>`                  |
| `SIHHA_PG_PASSWORD` | the database password (Studio → Database) |
| `SIHHA_PG_DATABASE` | `postgres`                                |

## 2. dbt (on the tower, or any machine with Python)

```bash
pip install dbt-postgres

export SIHHA_PG_HOST=... SIHHA_PG_USER=... SIHHA_PG_PASSWORD=...

cd analytics
dbt debug --profiles-dir .   # connection check
dbt build --profiles-dir .   # run models + tests
```

`dbt build` creates the `analytics` schema on first run. Re-run it whenever
you want fresh marts — or wire up the scheduled GitHub Actions run
(`.github/workflows/dbt.yml`): add the five `SIHHA_PG_*` values as repo
secrets, then uncomment the `schedule:` block.

## 3. Lightdash (Docker, on the CPU tower)

```bash
git clone https://github.com/paulomuzyczuk/sihha.git && cd sihha/analytics/lightdash
cp .env.example .env         # fill in the two secrets
docker compose up -d
```

Open `http://localhost:8080` (or `http://<tower-ip>:8080` from another
machine — set `SITE_URL` accordingly), create the admin account, then create
a project:

1. **dbt connection**: choose _CLI / local dbt project_ — the compose file
   mounts this `analytics/` directory at `/usr/app/dbt` inside the container.
2. **Warehouse connection**: PostgreSQL, with the same `SIHHA_PG_*` values
   from step 1 and schema `analytics`.
3. Lightdash compiles the project and `fct_behavioral_daily` appears as an
   explorable table with the metrics defined in `models/marts/marts.yml`
   (mood, sleep, adherence, exercise, tasks, appointments) and DAY/WEEK/MONTH
   time grains on `Data`.

From there, build charts in the UI and pin them to a dashboard. The two
Lightdash-specific ideas worth learning first:

- **Metrics live in dbt YAML**, not in the BI tool: edit `marts.yml`, run
  `dbt build`, refresh the project in Lightdash.
- **Time grains replace period tables**: one daily mart + `time_intervals`
  gives you the daily/weekly/monthly switching the app implements by hand.

## Layout

```
analytics/
├── dbt_project.yml
├── profiles.yml                     # env-var driven, no secrets
├── models/
│   ├── sources.yml                  # public.care_logs
│   ├── staging/stg_care_logs.sql    # JSONB → typed columns (no notes/coords)
│   └── marts/fct_behavioral_daily.sql
└── lightdash/
    ├── docker-compose.yml           # Lightdash + its metadata db + browser
    └── .env.example
```
