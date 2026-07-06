// Exports a recipient's live metric definitions + alert config as a care
// template JSON (design §3.5) — how the flagship production config becomes
// "template #1 by construction". Output goes to stdout so nothing personal
// is written into the repo by accident; review before committing anything
// (labels may name family members or pets — the committed
// templates/mental-health.json is a generalized version for exactly that
// reason).
//
// Usage: pnpm tsx scripts/export-template.ts [recipient_id] > out.json
//        (recipient_id optional when the instance has exactly one)

import { readFileSync } from 'fs';
import { resolve } from 'path';
import { createClient, SupabaseClient } from '@supabase/supabase-js';

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

async function resolveRecipient(
  db: SupabaseClient,
  explicit: string | undefined,
): Promise<{ id: string; kind: string; log_cadence: string }> {
  const { data, error } = await db
    .from('care_recipients')
    .select('id, kind, log_cadence');
  if (error) throw error;
  const rows = data ?? [];
  const match = explicit
    ? rows.find((r) => r.id === explicit)
    : rows.length === 1
      ? rows[0]
      : undefined;
  if (!match) {
    console.error(
      `export-template: expected exactly one care_recipient or an explicit id (found ${rows.length})`,
    );
    process.exit(1);
  }
  return match;
}

async function main(): Promise<void> {
  loadEnv();
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !serviceKey) {
    console.error(
      'export-template: missing NEXT_PUBLIC_SUPABASE_URL or SUPABASE_SERVICE_ROLE_KEY',
    );
    process.exit(1);
  }
  const db = createClient(url, serviceKey, { auth: { persistSession: false } });

  const recipient = await resolveRecipient(db, process.argv[2]);

  const { data: metrics, error: metricsError } = await db
    .from('metric_definitions')
    .select(
      'key, label, value_type, config, cadence, cadence_day, filled_by, required',
    )
    .eq('recipient_id', recipient.id)
    .eq('active', true)
    .order('sort_order', { ascending: true });
  if (metricsError) throw metricsError;

  const { data: alertConfig, error: alertError } = await db
    .from('alert_configs')
    .select('missing_log_hour, low_stock_days')
    .eq('recipient_id', recipient.id)
    .maybeSingle();
  if (alertError) throw alertError;

  const template = {
    id: 'exported',
    name: 'Exported template',
    description: `Exported from a live recipient on ${new Date().toISOString().slice(0, 10)} — review id/name/labels before use.`,
    kind: recipient.kind,
    log_cadence: recipient.log_cadence,
    suggests_recipient_role: false,
    alert_config: {
      missing_log_hour: alertConfig?.missing_log_hour ?? null,
      low_stock_days: alertConfig?.low_stock_days ?? null,
    },
    metrics: (metrics ?? []).map((metric) => ({
      key: metric.key,
      label: metric.label,
      value_type: metric.value_type,
      ...(Object.keys(metric.config ?? {}).length > 0
        ? { config: metric.config }
        : {}),
      ...(metric.cadence !== 'daily'
        ? { cadence: metric.cadence, cadence_day: metric.cadence_day }
        : {}),
      ...(metric.filled_by !== 'caregiver'
        ? { filled_by: metric.filled_by }
        : {}),
      ...(metric.required ? { required: true } : {}),
    })),
  };

  console.log(JSON.stringify(template, null, 2));
}

// Allow importing helpers in tests without running the export
if (require.main === module) {
  main().catch((err) => {
    console.error('export-template failed:', err);
    process.exit(1);
  });
}
