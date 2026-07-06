-- Daily grain of the behavioral measures — the model Lightdash points at.
-- With one therapist log per day this is usually 1:1 with stg_care_logs;
-- the group-by keeps double-logged days honest. Weekly/monthly views come
-- free in Lightdash from the log_date time intervals, so no separate
-- weekly/monthly marts are needed.

select
    log_date,
    count(*) as log_count,
    round(avg(mood_score), 1) as mood_avg,
    round(avg(sleep_hours), 1) as sleep_hours_avg,
    sum(medications_taken) as medications_taken,
    sum(medications_total) as medications_total,
    case
        when sum(medications_total) > 0
            then round(
                100.0 * sum(medications_taken) / sum(medications_total), 1
            )
    end as medication_adherence_pct,
    count(*) filter (where exercised) as exercise_sessions,
    sum(exercise_minutes) as exercise_minutes_total,
    sum(household_tasks_done) as household_tasks_done,
    sum(household_tasks_applicable) as household_tasks_applicable,
    case
        when sum(household_tasks_applicable) > 0
            then round(
                100.0 * sum(household_tasks_done)
                / sum(household_tasks_applicable), 1
            )
    end as household_completion_pct,
    count(*) filter (where appointment_attended) as appointments_attended,
    count(*) filter (
        where had_appointment and not appointment_attended
    ) as appointments_missed,
    count(*) filter (where location_verified) as logs_location_verified

from {{ ref('stg_care_logs') }}
group by log_date
