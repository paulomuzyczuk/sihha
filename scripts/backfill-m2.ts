// M2 backfill (docs/design/2026-07-04-care-recipients-and-templates.md §5):
// transforms legacy care_logs rows into care_log_entries and verifies parity
// by running the flagship aggregation code (scripts/legacyAggregates.ts —
// the production dashboard arithmetic at M2 time, frozen there when M4 made
// production aggregation generic) over BOTH representations — every period
// must produce identical buckets.
//
// Idempotent and re-runnable: entries keep the legacy row's id, so re-running
// after the app has written new care_logs rows inserts only the delta
// (ignoreDuplicates on id). Re-run right before the M3 cutover to catch up.
// The legacy table is left untouched as the archive.
//
// Usage: pnpm tsx scripts/backfill-m2.ts

import { readFileSync } from 'fs';
import { resolve } from 'path';
import { createClient, SupabaseClient } from '@supabase/supabase-js';
import { AGGREGATION_PERIODS } from '../services/aggregates';
import { aggregateCareLogs, CareLogAggregateRow } from './legacyAggregates';
import { LEGACY_TASK_TO_METRIC_KEY } from './seed-m1';

export interface LegacyCareLogRow {
  id: string;
  user_id: string;
  created_at: string;
  mood_score: number;
  medication_checklist: Array<{
    name: string;
    prescribed_dosage: number;
    taken: boolean;
  }>;
  sleep_data: { start: string; end: string; hours: number };
  exercise: { type: string; duration_minutes: number } | null;
  household_tasks: Record<string, boolean | null>;
  appointment: { type: string; attended: boolean } | null;
  notes: string | null;
  lat: number | null;
  lng: number | null;
  location_verified: boolean;
}

export interface CareLogEntryRow {
  id: string;
  recipient_id: string;
  author_id: string;
  log_date: string;
  values: Record<string, unknown>;
  notes: string | null;
  lat: number | null;
  lng: number | null;
  location_verified: boolean;
  created_at: string;
}

/** Legacy typed columns → the {metric_key: value} shape of care_log_entries. */
export function buildEntryValues(
  row: LegacyCareLogRow,
): Record<string, unknown> {
  const values: Record<string, unknown> = {
    mood: row.mood_score,
    medications: row.medication_checklist,
    sleep: row.sleep_data,
    exercise_type: row.exercise?.type ?? null,
    exercise_minutes: row.exercise?.duration_minutes ?? null,
    appointment_type: row.appointment?.type ?? null,
    appointment_attended: row.appointment?.attended ?? null,
  };
  // null stays meaningful for weekly tasks (= not due that day)
  for (const [legacyKey, metricKey] of Object.entries(
    LEGACY_TASK_TO_METRIC_KEY,
  )) {
    values[metricKey] = row.household_tasks[legacyKey] ?? null;
  }
  return values;
}

export function toEntry(
  row: LegacyCareLogRow,
  recipientId: string,
): CareLogEntryRow {
  return {
    id: row.id, // preserved — the idempotency key and the audit trail
    recipient_id: recipientId,
    author_id: row.user_id,
    log_date: new Date(row.created_at).toISOString().slice(0, 10),
    values: buildEntryValues(row),
    notes: row.notes,
    lat: row.lat,
    lng: row.lng,
    location_verified: row.location_verified,
    created_at: row.created_at,
  };
}

/**
 * Reconstructs the aggregator's input from an entry's values, so parity can
 * be asserted with the exact code production dashboards use.
 */
export function entryToAggregateRow(
  entry: CareLogEntryRow,
): CareLogAggregateRow {
  const values = entry.values as {
    mood: number;
    medications: Array<{ taken: boolean }>;
    sleep: { hours: number };
    exercise_minutes: number | null;
    appointment_attended: boolean | null;
    [key: string]: unknown;
  };
  const householdTasks: Record<string, boolean | null> = {};
  for (const metricKey of Object.values(LEGACY_TASK_TO_METRIC_KEY)) {
    householdTasks[metricKey] = values[metricKey] as boolean | null;
  }
  return {
    created_at: entry.created_at,
    mood_score: values.mood,
    medication_checklist: values.medications ?? [],
    sleep_data: values.sleep,
    exercise:
      values.exercise_minutes != null
        ? { duration_minutes: values.exercise_minutes }
        : null,
    household_tasks: householdTasks,
    appointment:
      values.appointment_attended != null
        ? { attended: values.appointment_attended }
        : null,
  };
}

export function legacyToAggregateRow(
  row: LegacyCareLogRow,
): CareLogAggregateRow {
  return {
    created_at: row.created_at,
    mood_score: row.mood_score,
    medication_checklist: row.medication_checklist,
    sleep_data: row.sleep_data,
    exercise: row.exercise,
    household_tasks: row.household_tasks,
    appointment: row.appointment,
  };
}

function loadEnv(): void {
  try {
    const lines = readFileSync(resolve(process.cwd(), '.env'), 'utf-8').split(
      '\n',
    );
    for (const line of lines) {
      const trimmed = line.trim();
      if (!trimmed || trimmed.startsWith('#')) continue;
      const eqIdx = trimmed.indexOf('=');
      if (eqIdx === -1) continue;
      const key = trimmed.slice(0, eqIdx).trim();
      const val = trimmed.slice(eqIdx + 1).trim();
      if (!(key in process.env)) process.env[key] = val;
    }
  } catch {
    // .env absent — rely on environment variables already being set
  }
}

async function resolveRecipientId(db: SupabaseClient): Promise<string> {
  const { data, error } = await db.from('care_recipients').select('id');
  if (error) throw error;
  if (data.length === 1) return data[0].id;
  const explicit = process.env.M2_RECIPIENT_ID;
  if (explicit && data.some((r) => r.id === explicit)) return explicit;
  console.error(
    `backfill-m2: expected exactly one care_recipient (found ${data.length}); set M2_RECIPIENT_ID`,
  );
  process.exit(1);
}

async function main(): Promise<void> {
  loadEnv();
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !serviceKey) {
    console.error(
      'backfill-m2: missing NEXT_PUBLIC_SUPABASE_URL or SUPABASE_SERVICE_ROLE_KEY',
    );
    process.exit(1);
  }
  const db = createClient(url, serviceKey, { auth: { persistSession: false } });

  const recipientId = await resolveRecipientId(db);

  const { data: legacyRows, error: legacyError } = await db
    .from('care_logs')
    .select(
      'id, user_id, created_at, mood_score, medication_checklist, sleep_data, exercise, household_tasks, appointment, notes, lat, lng, location_verified',
    )
    .order('created_at', { ascending: true });
  if (legacyError) throw legacyError;
  const legacy = (legacyRows ?? []) as LegacyCareLogRow[];
  console.log(`legacy care_logs rows: ${legacy.length}`);

  const entries = legacy.map((row) => toEntry(row, recipientId));
  const { error: upsertError } = await db
    .from('care_log_entries')
    .upsert(entries, { onConflict: 'id', ignoreDuplicates: true });
  if (upsertError) throw upsertError;

  // Read back what is actually stored and assert parity via the production
  // aggregation code — every period, byte-identical buckets.
  const { data: storedRows, error: storedError } = await db
    .from('care_log_entries')
    .select('*')
    .eq('recipient_id', recipientId);
  if (storedError) throw storedError;
  const stored = (storedRows ?? []) as CareLogEntryRow[];
  console.log(`care_log_entries rows: ${stored.length}`);

  if (stored.length !== legacy.length) {
    console.error(
      `PARITY FAILED: row count mismatch (legacy ${legacy.length}, entries ${stored.length})`,
    );
    process.exit(1);
  }

  let failed = false;
  for (const period of AGGREGATION_PERIODS) {
    const fromLegacy = aggregateCareLogs(
      legacy.map(legacyToAggregateRow),
      period,
    );
    const fromEntries = aggregateCareLogs(
      stored.map(entryToAggregateRow),
      period,
    );
    const match = JSON.stringify(fromLegacy) === JSON.stringify(fromEntries);
    console.log(
      `parity ${period}: ${match ? 'OK' : 'MISMATCH'} (${fromLegacy.length} buckets)`,
    );
    if (!match) failed = true;
  }

  if (failed) {
    console.error('PARITY FAILED — investigate before proceeding to M3.');
    process.exit(1);
  }
  console.log('M2 backfill complete, parity verified across all periods.');
}

// Allow importing the pure transforms in tests without running the backfill
if (require.main === module) {
  main().catch((err) => {
    console.error('backfill-m2 failed:', err);
    process.exit(1);
  });
}
