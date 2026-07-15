// Dummy data for eyeballing the clinician dashboard before launch: fills the
// last 12 months of scale entries (caregiver dailies, WHO-5, PHQ-9, BPRS)
// and fabricates two future psychometric evaluations so the yearly chart
// draws connected lines. Every fabricated row is flagged for one-command
// removal before production:
//   - care_log_entries carry {"dummy_test_data": true} inside values
//   - psychometric_results carry source_file = 'DUMMY-TEST-DATA'
//
// When the circle has no clinician members yet, dummy specialist accounts
// (dummy.psychologist@siha.test / dummy.psychiatrist@siha.test, membership
// label 'DUMMY') are created so the PHQ-9/BPRS lines exist; --clean removes
// the accounts along with everything else.
//
// Usage:
//   pnpm tsx scripts/seed-dummy-visuals.ts          # seed
//   pnpm tsx scripts/seed-dummy-visuals.ts --clean  # remove everything seeded
// The recipient defaults to the sole active care recipient; with several,
// set PSYCH_RECIPIENT_ID=<uuid>.

import { randomUUID } from 'crypto';
import { readFileSync } from 'fs';
import { resolve } from 'path';
import { createClient, SupabaseClient } from '@supabase/supabase-js';

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

// Deterministic PRNG so re-seeding produces the same picture (mulberry32)
function makeRng(seed: number): () => number {
  let a = seed;
  return () => {
    a |= 0;
    a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

interface ScaleDef {
  key: string;
  min: number;
  max: number;
  filled_by: string;
  clinician_profile: string | null;
  cadence: string;
}

const isoDay = (date: Date) => date.toISOString().slice(0, 10);

/**
 * A value for `monthIndex` months ago (11 = oldest), drifting from a worse
 * start toward a better end with noise — so the charts show a visible trend.
 * "Better" is lower for symptom scales (BPRS, PHQ-9, cigarettes) and higher
 * for wellbeing ones (WHO-5, sleep quality).
 */
function trendValue(
  def: ScaleDef,
  monthIndex: number,
  rng: () => number,
): number {
  const higherIsBetter =
    def.key.startsWith('who5_') || def.key === 'sleep_quality';
  const progress = 1 - monthIndex / 11; // 0 oldest → 1 newest
  const worst = higherIsBetter ? 0.25 : 0.75;
  const best = higherIsBetter ? 0.75 : 0.3;
  const target = worst + (best - worst) * progress;
  const noisy = target + (rng() - 0.5) * 0.3;
  const clamped = Math.min(1, Math.max(0, noisy));
  return Math.round(def.min + clamped * (def.max - def.min));
}

const DUMMY_MEMBER_LABEL = 'DUMMY — membro de teste';
const dummyClinicianEmail = (profile: string) => `dummy.${profile}@siha.test`;

async function findUserByEmail(
  db: SupabaseClient,
  email: string,
): Promise<string | null> {
  const { data, error } = await db.auth.admin.listUsers({
    page: 1,
    perPage: 1000,
  });
  if (error) throw error;
  return data.users.find((user) => user.email === email)?.id ?? null;
}

async function memberFor(
  db: SupabaseClient,
  recipientId: string,
  role: string,
  profile: string | null,
): Promise<string | null> {
  let query = db
    .from('care_team_members')
    .select('user_id')
    .eq('recipient_id', recipientId)
    .eq('role', role);
  if (role === 'clinician') {
    query = profile
      ? query.eq('clinical_profile', profile)
      : query.is('clinical_profile', null);
  }
  const { data, error } = await query.limit(1);
  if (error) throw error;
  if (data?.[0]) return data[0].user_id;

  // No such member yet: for the specialist profiles, create a flagged dummy
  // account + membership so their instruments have an author
  if (role !== 'clinician' || !profile) return null;
  const email = dummyClinicianEmail(profile);
  let userId = await findUserByEmail(db, email);
  if (!userId) {
    const { data: created, error: createError } =
      await db.auth.admin.createUser({
        email,
        password: randomUUID(),
        email_confirm: true,
      });
    if (createError) throw createError;
    userId = created.user.id;
  }
  const { error: memberError } = await db.from('care_team_members').insert({
    recipient_id: recipientId,
    user_id: userId,
    role: 'clinician',
    clinical_profile: profile,
    member_label: DUMMY_MEMBER_LABEL,
    receives_alerts: false,
  });
  if (memberError) throw memberError;
  console.log(`Created dummy clinician ${email}`);
  return userId;
}

async function clean(db: SupabaseClient, recipientId: string): Promise<void> {
  const { error: logError, count: logCount } = await db
    .from('care_log_entries')
    .delete({ count: 'exact' })
    .eq('recipient_id', recipientId)
    .contains('values', { dummy_test_data: true });
  if (logError) throw logError;
  const { error: psychError, count: psychCount } = await db
    .from('psychometric_results')
    .delete({ count: 'exact' })
    .eq('recipient_id', recipientId)
    .eq('source_file', 'DUMMY-TEST-DATA');
  if (psychError) throw psychError;

  // Dummy clinician memberships + accounts, if the seed created them
  const { error: memberError, count: memberCount } = await db
    .from('care_team_members')
    .delete({ count: 'exact' })
    .eq('recipient_id', recipientId)
    .eq('member_label', DUMMY_MEMBER_LABEL);
  if (memberError) throw memberError;
  let usersRemoved = 0;
  for (const profile of ['psychologist', 'psychiatrist']) {
    const userId = await findUserByEmail(db, dummyClinicianEmail(profile));
    if (!userId) continue;
    const { error } = await db.auth.admin.deleteUser(userId);
    if (error) throw error;
    usersRemoved += 1;
  }
  console.log(
    `Removed ${logCount ?? 0} dummy log entries, ${psychCount ?? 0} dummy ` +
      `psychometric rows, ${memberCount ?? 0} dummy memberships, ` +
      `${usersRemoved} dummy accounts`,
  );
}

async function seed(db: SupabaseClient, recipientId: string): Promise<void> {
  const rng = makeRng(20260714);

  const { data: defRows, error: defError } = await db
    .from('metric_definitions')
    .select('key, config, cadence, filled_by, clinician_profile')
    .eq('recipient_id', recipientId)
    .eq('value_type', 'scale')
    .eq('active', true);
  if (defError) throw defError;
  const defs: ScaleDef[] = (defRows ?? []).map((row) => ({
    key: row.key as string,
    min: Number((row.config as { min?: number }).min ?? 0),
    max: Number((row.config as { max?: number }).max ?? 10),
    filled_by: row.filled_by as string,
    clinician_profile: (row.clinician_profile as string | null) ?? null,
    cadence: row.cadence as string,
  }));

  // Author groups: one entry bundles all of a group's scale values, exactly
  // like a real form submission would
  const groups = new Map<string, ScaleDef[]>();
  for (const def of defs) {
    const groupKey = `${def.filled_by}|${def.clinician_profile ?? ''}`;
    const group = groups.get(groupKey);
    if (group) group.push(def);
    else groups.set(groupKey, [def]);
  }

  // Never collide with real entries: skip any (date, role, profile) taken
  const { data: existingRows, error: existingError } = await db
    .from('care_log_entries')
    .select('log_date, author_role, author_profile')
    .eq('recipient_id', recipientId);
  if (existingError) throw existingError;
  const taken = new Set(
    (existingRows ?? []).map(
      (row) => `${row.log_date}|${row.author_role}|${row.author_profile ?? ''}`,
    ),
  );

  // Entry dates per group over the last 12 full months: dailies get ~8
  // spread days/month, weeklies every 7 days, monthlies one mid-month visit
  const today = new Date();
  const inserts: Record<string, unknown>[] = [];
  let skippedGroups = 0;

  for (const [groupKey, groupDefs] of groups) {
    const [role, profile] = groupKey.split('|');
    const authorId = await memberFor(db, recipientId, role, profile || null);
    if (!authorId) {
      console.warn(
        `No ${role}${profile ? `/${profile}` : ''} member — skipped`,
      );
      skippedGroups += 1;
      continue;
    }
    const cadence = groupDefs[0].cadence;
    for (let monthIndex = 11; monthIndex >= 0; monthIndex--) {
      const monthStart = new Date(
        Date.UTC(today.getUTCFullYear(), today.getUTCMonth() - monthIndex, 1),
      );
      const days =
        cadence === 'daily'
          ? [2, 5, 9, 12, 16, 19, 23, 26]
          : cadence === 'weekly'
            ? [3, 10, 17, 24]
            : [15];
      for (const day of days) {
        const date = new Date(monthStart);
        date.setUTCDate(day);
        if (date >= today) continue;
        const logDate = isoDay(date);
        if (taken.has(`${logDate}|${role}|${profile}`)) continue;
        const values: Record<string, unknown> = { dummy_test_data: true };
        for (const def of groupDefs) {
          values[def.key] = trendValue(def, monthIndex, rng);
        }
        inserts.push({
          id: randomUUID(),
          created_at: `${logDate}T12:00:00.000Z`,
          recipient_id: recipientId,
          author_id: authorId,
          author_role: role,
          author_profile: profile || null,
          log_date: logDate,
          values,
          notes: 'DUMMY — registro de teste para validação visual',
          location_verified: false,
        });
      }
    }
  }

  for (let start = 0; start < inserts.length; start += 200) {
    const { error } = await db
      .from('care_log_entries')
      .insert(inserts.slice(start, start + 200));
    if (error) throw error;
  }
  console.log(
    `Inserted ${inserts.length} dummy log entries` +
      (skippedGroups ? ` (${skippedGroups} author groups skipped)` : ''),
  );

  // Future psychometric evaluations: drift each real percentile-bearing
  // measure of the latest evaluation through two fabricated later years
  const { data: realRows, error: realError } = await db
    .from('psychometric_results')
    .select('test_date, instrument, measure, raw_score, percentile')
    .eq('recipient_id', recipientId)
    .neq('source_file', 'DUMMY-TEST-DATA')
    .not('percentile', 'is', null);
  if (realError) throw realError;
  const latestDate = (realRows ?? [])
    .map((row) => row.test_date as string)
    .sort()
    .pop();
  if (!latestDate) {
    console.log('No real psychometric evaluation found — none fabricated');
    return;
  }
  const baseYear = Number(latestDate.slice(0, 4));
  const psychInserts: Record<string, unknown>[] = [];
  for (const row of (realRows ?? []).filter(
    (r) => r.test_date === latestDate,
  )) {
    let percentile = Number(row.percentile);
    for (let offset = 1; offset <= 2; offset++) {
      percentile = Math.min(
        99,
        Math.max(1, Math.round(percentile + (rng() - 0.35) * 24)),
      );
      psychInserts.push({
        recipient_id: recipientId,
        test_date: `${baseYear + offset}-09-20`,
        instrument: row.instrument,
        measure: row.measure,
        raw_score: row.raw_score,
        percentile,
        classification: 'DUMMY',
        source_file: 'DUMMY-TEST-DATA',
      });
    }
  }
  const { error: psychError } = await db
    .from('psychometric_results')
    .upsert(psychInserts, {
      onConflict: 'recipient_id,test_date,instrument,measure',
    });
  if (psychError) throw psychError;
  console.log(
    `Upserted ${psychInserts.length} dummy psychometric rows (${baseYear + 1}, ${baseYear + 2})`,
  );
}

async function main(): Promise<void> {
  loadEnv();
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !serviceKey) {
    console.error(
      'seed-dummy-visuals: NEXT_PUBLIC_SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY are required',
    );
    process.exit(1);
  }
  const db = createClient(url, serviceKey);

  let recipientId = process.env.PSYCH_RECIPIENT_ID;
  if (!recipientId) {
    const { data: recipients, error } = await db
      .from('care_recipients')
      .select('id, display_name')
      .eq('active', true);
    if (error) throw error;
    if ((recipients ?? []).length !== 1) {
      console.error(
        `seed-dummy-visuals: found ${recipients?.length ?? 0} active recipients; ` +
          'set PSYCH_RECIPIENT_ID to pick one',
      );
      process.exit(1);
    }
    recipientId = recipients![0].id;
    console.log(`Recipient: ${recipients![0].display_name} (${recipientId})`);
  }

  if (process.argv.includes('--clean')) await clean(db, recipientId!);
  else await seed(db, recipientId!);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
