-- One row per care log entry with every behavioral metric unnested into
-- typed columns. Reads the M3 generic store (care_log_entries.values keyed
-- by metric) using the flagship metric keys; household tasks are derived
-- generically from metric_definitions (boolean metrics without a depends_on
-- parent). Free-text notes and raw coordinates are deliberately NOT
-- selected: nothing downstream of this model can leak them.

with entries as (

    select * from {{ source('sihha', 'care_log_entries') }}

),

-- medications: [{name, prescribed_dosage, taken}] → counts per entry
medications as (

    select
        entries.id as care_log_id,
        count(*) as medications_total,
        count(*) filter (where (item ->> 'taken')::boolean) as medications_taken
    from entries
    cross join lateral jsonb_array_elements(entries.values -> 'medications') as item
    group by entries.id

),

-- household tasks: the recipient's boolean metrics without a depends_on
-- parent. A null value means the weekly task was not due that day and must
-- not count as applicable; an absent key behaves the same.
household as (

    select
        entries.id as care_log_id,
        count(*) filter (
            where jsonb_typeof(entries.values -> defs.key) = 'boolean'
        ) as household_tasks_applicable,
        count(*) filter (
            where entries.values -> defs.key = 'true'::jsonb
        ) as household_tasks_done
    from entries
    inner join {{ source('sihha', 'metric_definitions') }} as defs
        on defs.recipient_id = entries.recipient_id
        and defs.value_type = 'boolean'
        and (defs.config ->> 'depends_on') is null
        and defs.active
    group by entries.id

)

select
    entries.id as care_log_id,
    entries.recipient_id,
    entries.author_id as user_id,
    entries.log_date,
    entries.created_at,
    (entries.values ->> 'mood')::int as mood_score,
    (entries.values -> 'sleep' ->> 'hours')::numeric as sleep_hours,
    jsonb_typeof(entries.values -> 'exercise_minutes') = 'number' as exercised,
    coalesce((entries.values ->> 'exercise_minutes')::int, 0) as exercise_minutes,
    entries.values ->> 'exercise_type' as exercise_type,
    coalesce(medications.medications_total, 0) as medications_total,
    coalesce(medications.medications_taken, 0) as medications_taken,
    coalesce(household.household_tasks_applicable, 0) as household_tasks_applicable,
    coalesce(household.household_tasks_done, 0) as household_tasks_done,
    jsonb_typeof(entries.values -> 'appointment_attended') = 'boolean' as had_appointment,
    (entries.values ->> 'appointment_attended')::boolean as appointment_attended,
    entries.values ->> 'appointment_type' as appointment_type,
    entries.location_verified

from entries
left join medications on medications.care_log_id = entries.id
left join household on household.care_log_id = entries.id
