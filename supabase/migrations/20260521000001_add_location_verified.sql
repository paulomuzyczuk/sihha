-- Makes lat/lng nullable and adds location_verified flag.
-- Submissions without geolocation are now accepted; the flag records
-- whether coordinates were present and within the allowed radius.

ALTER TABLE public.care_logs
  ALTER COLUMN lat DROP NOT NULL,
  ALTER COLUMN lng DROP NOT NULL,
  ADD COLUMN location_verified BOOLEAN NOT NULL DEFAULT FALSE;
