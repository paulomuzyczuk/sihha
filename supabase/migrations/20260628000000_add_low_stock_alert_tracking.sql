-- Tracks when a low-stock alert was last sent for each medication, so the
-- alert can be throttled to roughly once per day instead of firing on every
-- care-log submission (which can be many per day across the care team).
ALTER TABLE public.medication_stocks
  ADD COLUMN last_low_stock_alert_at TIMESTAMPTZ;
