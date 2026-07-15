-- Extends care_logs to cover the full therapist daily log workflow.
-- Replaces the medication_taken boolean with a per-medication JSONB checklist
-- and adds sleep data, exercise, household tasks, and medical appointment fields.

ALTER TABLE public.care_logs
  DROP COLUMN medication_taken,

  -- Per-medication checklist: [{name, prescribed_dosage, taken}]
  -- JSONB chosen because the medication list is dynamic (driven by medication_stocks)
  ADD COLUMN medication_checklist JSONB NOT NULL DEFAULT '[]'::jsonb
    CONSTRAINT care_logs_medication_checklist_is_array
    CHECK (jsonb_typeof(medication_checklist) = 'array'),

  -- Sleep session: {start: "HH:MM", end: "HH:MM", hours: n}
  -- hours is computed server-side from start/end; stored for quick reads
  ADD COLUMN sleep_data JSONB NOT NULL
    DEFAULT '{"start":"22:00","end":"07:00","hours":9}'::jsonb
    CONSTRAINT care_logs_sleep_data_structure
    CHECK (
      jsonb_typeof(sleep_data) = 'object'
      AND sleep_data ? 'start'
      AND sleep_data ? 'end'
      AND sleep_data ? 'hours'
    ),

  -- Optional exercise session: {type, duration_minutes} or NULL
  -- Paired-field consistency (both present or both absent) enforced at Zod layer
  ADD COLUMN exercise JSONB
    CONSTRAINT care_logs_exercise_structure
    CHECK (
      exercise IS NULL OR (
        jsonb_typeof(exercise) = 'object'
        AND exercise ? 'type'
        AND exercise ? 'duration_minutes'
      )
    ),

  -- Household task checklist (daily booleans + weekly boolean|null fields)
  -- Meals split into individual booleans: breakfast, lunch, snack, dinner
  -- JSONB chosen because it is always read/written as a unit
  ADD COLUMN household_tasks JSONB NOT NULL
    DEFAULT '{"fedNatasha":false,"cleanedLitter":false,"tookTrash":false,"madeBed":false,"breakfast":false,"lunch":false,"snack":false,"dinner":false,"didLaundry":null,"cleaningLady":null,"groceryShopping":null}'::jsonb
    CONSTRAINT care_logs_household_tasks_structure
    CHECK (
      jsonb_typeof(household_tasks) = 'object'
      AND household_tasks ? 'fedNatasha'
      AND household_tasks ? 'cleanedLitter'
      AND household_tasks ? 'tookTrash'
      AND household_tasks ? 'madeBed'
      AND household_tasks ? 'breakfast'
      AND household_tasks ? 'lunch'
      AND household_tasks ? 'snack'
      AND household_tasks ? 'dinner'
    ),

  -- Optional medical appointment: {type, attended} or NULL
  ADD COLUMN appointment JSONB
    CONSTRAINT care_logs_appointment_structure
    CHECK (
      appointment IS NULL OR (
        jsonb_typeof(appointment) = 'object'
        AND appointment ? 'type'
        AND appointment ? 'attended'
      )
    );
