-- 1. Create tables

CREATE TABLE IF NOT EXISTS public.care_logs (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
    mood_score INT NOT NULL CHECK (mood_score >= 1 AND mood_score <= 5),
    medication_taken BOOLEAN NOT NULL,
    notes TEXT CHECK (char_length(notes) <= 1000),
    lat DOUBLE PRECISION NOT NULL CHECK (lat >= -90 AND lat <= 90),
    lng DOUBLE PRECISION NOT NULL CHECK (lng >= -180 AND lng <= 180),
    created_at TIMESTAMPTZ NOT NULL DEFAULT timezone('utc'::text, now())
);

CREATE TABLE IF NOT EXISTS public.invoices (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
    amount NUMERIC NOT NULL CHECK (amount > 0),
    file_url TEXT NOT NULL,
    lat DOUBLE PRECISION NOT NULL CHECK (lat >= -90 AND lat <= 90),
    lng DOUBLE PRECISION NOT NULL CHECK (lng >= -180 AND lng <= 180),
    created_at TIMESTAMPTZ NOT NULL DEFAULT timezone('utc'::text, now())
);

CREATE TABLE IF NOT EXISTS public.medication_stocks (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    name TEXT NOT NULL,
    package_start_date TIMESTAMPTZ NOT NULL DEFAULT timezone('utc'::text, now()),
    total_pills_in_package INT NOT NULL CHECK (total_pills_in_package > 0),
    daily_dosage INT NOT NULL CHECK (daily_dosage > 0)
);

-- 2. Enable Row Level Security (RLS) on all tables

ALTER TABLE public.care_logs ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.invoices ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.medication_stocks ENABLE ROW LEVEL SECURITY;

-- 3. Define RLS Policies

-- For public.care_logs:
-- Write-only: therapists can insert their own logs. No client can select, update, or delete.
CREATE POLICY "Therapists can insert logs" 
ON public.care_logs
FOR INSERT
TO authenticated
WITH CHECK (
    (auth.jwt() -> 'app_metadata' ->> 'role') = 'THERAPIST'
    AND auth.uid() = user_id
);

-- For public.invoices:
-- Write-only: patients and admins can insert their own invoices. No client can select, update, or delete.
CREATE POLICY "Patients and Admins can insert invoices"
ON public.invoices
FOR INSERT
TO authenticated
WITH CHECK (
    ((auth.jwt() -> 'app_metadata' ->> 'role') = 'PATIENT' OR (auth.jwt() -> 'app_metadata' ->> 'role') = 'ADMIN')
    AND auth.uid() = user_id
);

-- For public.medication_stocks:
-- Service role only: no policies are created, which implicitly denies all client operations (select/insert/update/delete)
-- since RLS is enabled and no permissive policies exist.
