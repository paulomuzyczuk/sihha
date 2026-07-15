// M1 seed (docs/design/2026-07-04-care-recipients-and-templates.md §5):
// creates the flagship care recipient, derives team memberships from the
// existing JWT tiers + user_profiles, generates metric definitions that
// mirror the current hardcoded log schema, sets the alert config, and
// backfills recipient_id on medication_stocks/invoices. Idempotent — safe
// to re-run; personal data comes from env at runtime, never from the repo.
//
// Usage:
//   M1_RECIPIENT_NAME="<name>" pnpm tsx scripts/seed-m1.ts
// Optional env: M1_RECIPIENT_TIMEZONE (default America/Manaus),
//   M1_GEO_LAT / M1_GEO_LNG / M1_GEO_RADIUS_M (fall back to TARGET_LAT /
//   TARGET_LNG / ALLOWED_RADIUS_METERS; omit all for no geofence).

import { readFileSync } from 'fs';
import { resolve } from 'path';
import { createClient, SupabaseClient } from '@supabase/supabase-js';
import {
  EXERCISE_DURATIONS,
  EXERCISE_TYPES,
  EXERCISE_TYPE_LABELS,
  HOUSEHOLD_TASK_LABELS,
  ROLES,
} from '../lib/constants';

// tsx doesn't auto-load .env; parse it manually so the script is self-contained
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

const TIER_TO_CARE_ROLE: Record<string, string> = {
  [ROLES.ADMIN]: 'owner',
  [ROLES.THERAPIST]: 'caregiver',
  [ROLES.CLINICIAN]: 'clinician',
  [ROLES.PATIENT]: 'recipient',
};

const PROFILE_LABELS: Record<string, string> = {
  therapist: 'Terapeuta',
  psychologist: 'Psicóloga',
  psychiatrist: 'Psiquiatra',
};

// Legacy camelCase task keys → metric keys (^[a-z][a-z0-9_]*$). M2's backfill
// uses this same mapping when reshaping care_logs rows into entry values.
export const LEGACY_TASK_TO_METRIC_KEY: Record<string, string> = {
  fedPet: 'fed_pet',
  cleanedLitter: 'cleaned_litter',
  tookTrash: 'took_trash',
  madeBed: 'made_bed',
  breakfast: 'breakfast',
  lunch: 'lunch',
  snack: 'snack',
  dinner: 'dinner',
  didLaundry: 'did_laundry',
  cleaningLady: 'cleaning_lady',
  groceryShopping: 'grocery_shopping',
};

const WEEKLY_TASK_TO_SCHEDULE_KEY: Record<string, string> = {
  didLaundry: 'laundry',
  cleaningLady: 'cleaning',
  groceryShopping: 'shopping',
};

interface MetricSeed {
  key: string;
  label: string;
  value_type: string;
  config: Record<string, unknown>;
  cadence: 'daily' | 'weekly';
  cadence_day: number | null;
  filled_by: string;
  required: boolean;
  sort_order: number;
}

function buildMetricSeeds(weeklyDays: Record<string, number>): MetricSeed[] {
  const base = (
    key: string,
    label: string,
    value_type: string,
    overrides: Partial<MetricSeed> = {},
  ): MetricSeed => ({
    key,
    label,
    value_type,
    config: {},
    cadence: 'daily',
    cadence_day: null,
    filled_by: 'caregiver',
    required: false,
    sort_order: 0,
    ...overrides,
  });

  const metrics: MetricSeed[] = [
    base('mood', 'Humor', 'scale', {
      config: { min: 1, max: 5 },
      required: true,
    }),
    base('medications', 'Medicações', 'medication_checklist', {
      required: true,
    }),
    base('sleep', 'Sono', 'time_range', { required: true }),
    base('exercise_type', 'Tipo de exercício', 'enum', {
      config: {
        options: Object.values(EXERCISE_TYPES).map((value) => ({
          value,
          label: EXERCISE_TYPE_LABELS[value],
        })),
      },
    }),
    base('exercise_minutes', 'Duração do exercício', 'duration_minutes', {
      // depends_on couples the pair: no exercise_type → minutes forced null
      config: { options: [...EXERCISE_DURATIONS], depends_on: 'exercise_type' },
    }),
    base('appointment_type', 'Tipo de consulta', 'enum', {
      config: {
        options: [
          { value: 'psychologist', label: 'Psicólogo(a)' },
          { value: 'psychiatrist', label: 'Psiquiatra' },
        ],
      },
    }),
    // depends_on also excludes this boolean from household-task aggregation
    base('appointment_attended', 'Compareceu à consulta', 'boolean', {
      config: { depends_on: 'appointment_type' },
    }),
  ];

  for (const [legacyKey, metricKey] of Object.entries(
    LEGACY_TASK_TO_METRIC_KEY,
  )) {
    const scheduleKey = WEEKLY_TASK_TO_SCHEDULE_KEY[legacyKey];
    metrics.push(
      base(
        metricKey,
        HOUSEHOLD_TASK_LABELS[legacyKey as keyof typeof HOUSEHOLD_TASK_LABELS],
        'boolean',
        scheduleKey
          ? { cadence: 'weekly', cadence_day: weeklyDays[scheduleKey] ?? 0 }
          : {},
      ),
    );
  }

  metrics.forEach((metric, index) => {
    metric.sort_order = index;
  });
  return metrics;
}

function requireEnv(name: string): string {
  const value = process.env[name];
  if (!value) {
    console.error(`seed-m1: missing required env var ${name}`);
    process.exit(1);
  }
  return value;
}

async function seedRecipient(db: SupabaseClient): Promise<string> {
  const name = requireEnv('M1_RECIPIENT_NAME');
  const timezone = process.env.M1_RECIPIENT_TIMEZONE ?? 'America/Manaus';
  const lat = process.env.M1_GEO_LAT ?? process.env.TARGET_LAT;
  const lng = process.env.M1_GEO_LNG ?? process.env.TARGET_LNG;
  const radius =
    process.env.M1_GEO_RADIUS_M ?? process.env.ALLOWED_RADIUS_METERS;
  const hasGeofence = Boolean(lat && lng && radius);

  const { data: existing, error: findError } = await db
    .from('care_recipients')
    .select('id')
    .eq('display_name', name)
    .maybeSingle();
  if (findError) throw findError;
  if (existing) {
    console.log(`recipient "${name}" already exists (${existing.id})`);
    return existing.id;
  }

  const { data: created, error: insertError } = await db
    .from('care_recipients')
    .insert({
      display_name: name,
      kind: 'human',
      timezone,
      log_cadence: 'one_per_day',
      geo_lat: hasGeofence ? parseFloat(lat!) : null,
      geo_lng: hasGeofence ? parseFloat(lng!) : null,
      geo_radius_m: hasGeofence ? parseInt(radius!, 10) : null,
    })
    .select('id')
    .single();
  if (insertError) throw insertError;
  console.log(
    `created recipient "${name}" (${created.id}), geofence ${hasGeofence ? 'ON' : 'off'}`,
  );
  return created.id;
}

async function seedMemberships(
  db: SupabaseClient,
  recipientId: string,
): Promise<void> {
  const alertEmails = new Set(
    [
      process.env.ADMIN_EMAIL,
      process.env.ALERT_EMAIL_THERAPIST_A,
      process.env.ALERT_EMAIL_THERAPIST_B,
    ].filter(Boolean),
  );

  const { data: userList, error: listError } = await db.auth.admin.listUsers();
  if (listError) throw listError;

  // user_profiles is a legacy table (dropped after the M3 cutover); when it
  // is gone, memberships are still derived from JWT tiers — only the
  // clinical-profile labels are skipped.
  const { data: profiles, error: profileError } = await db
    .from('user_profiles')
    .select('user_id, role');
  if (profileError) {
    console.log(
      `user_profiles unavailable (${profileError.message}) — skipping member labels`,
    );
  }
  const profileByUser = new Map(
    (profiles ?? []).map((p) => [p.user_id, p.role]),
  );

  for (const user of userList.users) {
    const tier = user.app_metadata?.role as string | undefined;
    const careRole = tier ? TIER_TO_CARE_ROLE[tier] : undefined;
    if (!careRole) {
      console.log(`skipping ${user.email} (tier: ${tier ?? 'none'})`);
      continue;
    }
    const clinicalProfile = profileByUser.get(user.id);
    const { error: upsertError } = await db.from('care_team_members').upsert(
      {
        recipient_id: recipientId,
        user_id: user.id,
        role: careRole,
        member_label: clinicalProfile
          ? (PROFILE_LABELS[clinicalProfile] ?? null)
          : null,
        receives_alerts: alertEmails.has(user.email ?? ''),
      },
      { onConflict: 'recipient_id,user_id' },
    );
    if (upsertError) throw upsertError;
    console.log(`membership: ${user.email} → ${careRole}`);
  }
}

async function seedMetricDefinitions(
  db: SupabaseClient,
  recipientId: string,
): Promise<void> {
  // schedule_config is a legacy table (dropped after the M3 cutover); when it
  // is gone, fall back to the weekday defaults its migration seeded (Mon=0).
  const { data: schedule, error: scheduleError } = await db
    .from('schedule_config')
    .select('task_key, weekday');
  if (scheduleError) {
    console.log(
      `schedule_config unavailable (${scheduleError.message}) — using weekday defaults`,
    );
  }
  const weeklyDays =
    schedule && schedule.length > 0
      ? Object.fromEntries(schedule.map((row) => [row.task_key, row.weekday]))
      : { laundry: 1, cleaning: 2, shopping: 3 };

  const metrics = buildMetricSeeds(weeklyDays);
  const { error: upsertError } = await db.from('metric_definitions').upsert(
    metrics.map((metric) => ({ ...metric, recipient_id: recipientId })),
    { onConflict: 'recipient_id,key' },
  );
  if (upsertError) throw upsertError;
  console.log(`metric definitions: ${metrics.length} upserted`);
}

async function seedAlertConfig(
  db: SupabaseClient,
  recipientId: string,
): Promise<void> {
  // Mirrors production behavior: cron at 01:00 UTC = 21:00 in Manaus;
  // stock alert fires at ≤5 days remaining (services/stockAlert.ts).
  const { error } = await db.from('alert_configs').upsert({
    recipient_id: recipientId,
    missing_log_hour: 21,
    low_stock_days: 5,
  });
  if (error) throw error;
  console.log('alert config: missing_log_hour=21, low_stock_days=5');
}

async function backfillRecipientId(
  db: SupabaseClient,
  recipientId: string,
): Promise<void> {
  for (const table of ['medication_stocks', 'invoices'] as const) {
    const { error, count } = await db
      .from(table)
      .update({ recipient_id: recipientId }, { count: 'exact' })
      .is('recipient_id', null);
    if (error) throw error;
    console.log(`${table}: backfilled recipient_id on ${count ?? 0} rows`);
  }
}

async function main(): Promise<void> {
  loadEnv();

  const url = requireEnv('NEXT_PUBLIC_SUPABASE_URL');
  const serviceKey = requireEnv('SUPABASE_SERVICE_ROLE_KEY');
  const db = createClient(url, serviceKey, {
    auth: { persistSession: false },
  });

  const recipientId = await seedRecipient(db);
  await seedMemberships(db, recipientId);
  await seedMetricDefinitions(db, recipientId);
  await seedAlertConfig(db, recipientId);
  await backfillRecipientId(db, recipientId);

  console.log('M1 seed complete.');
}

// Allow importing LEGACY_TASK_TO_METRIC_KEY (backfill-m2, tests) without
// running the seed
if (require.main === module) {
  main().catch((err) => {
    console.error('seed-m1 failed:', err);
    process.exit(1);
  });
}
