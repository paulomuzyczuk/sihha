import { SupabaseClient } from '@supabase/supabase-js';

// Read access to care_worker_shifts — the fixed-weekly helper schedule (cleaning
// lady, etc.) that the Turno calendar source projects. Service-role only, same
// posture as the rest of the protected calendar stores. The therapeutic
// companion is NOT here (it derives from the care-shift rota); this store is
// exclusively the workers with a standing weekly cadence.

export interface WorkerShift {
  label: string;
  /** Mon=0 .. Sun=6, matching weekdayMon0FromDateStr. */
  weekday: number;
  /** Recipient-local wall clock HH:MM. */
  startTime: string;
  endTime: string;
}

interface WorkerShiftRow {
  worker_label: string;
  weekday: number;
  start_time: string; // Postgres `time` renders as HH:MM:SS
  end_time: string;
}

/** Postgres `time` comes back as HH:MM:SS; the calendar uses HH:MM wall time. */
function toHm(pgTime: string): string {
  return pgTime.slice(0, 5);
}

/**
 * Every fixed-weekly worker shift configured for the recipient. Throws on a
 * query error for the caller to translate into a generic 500 — an empty result
 * (no cleaning lady configured) is a valid, non-error state.
 */
export async function listWorkerShifts(
  adminDb: SupabaseClient,
  recipientId: string,
): Promise<WorkerShift[]> {
  const { data, error } = await adminDb
    .from('care_worker_shifts')
    .select('worker_label, weekday, start_time, end_time')
    .eq('recipient_id', recipientId);
  if (error) throw error;

  return ((data as WorkerShiftRow[] | null) ?? []).map((row) => ({
    label: row.worker_label,
    weekday: row.weekday,
    startTime: toHm(row.start_time),
    endTime: toHm(row.end_time),
  }));
}
