import { randomUUID } from 'node:crypto';
import { createClient, SupabaseClient } from '@supabase/supabase-js';

// RLS composition test for ALL user write paths, where the app delegates tenant
// isolation to Postgres RLS via the user-scoped client rather than an app-layer
// .eq() filter. The unit suite mocks the DB and cannot see these policies; this
// lane proves the database itself keeps one circle's writes out of another
// circle AND enforces the per-role / per-clinical-profile rules. "Safety is not
// a composable property" (SRE Ch.17 / Nygard).
//
// Requires a live local stack: `supabase start` then `pnpm test:integration`.

const URL = process.env.SUPABASE_LOCAL_URL!;
const ANON = process.env.SUPABASE_LOCAL_ANON_KEY!;
const SERVICE = process.env.SUPABASE_LOCAL_SERVICE_ROLE_KEY!;

const noPersist = {
  auth: { persistSession: false, autoRefreshToken: false },
} as const;

// Service-role client bypasses RLS — used only to seed the fixture.
const admin = createClient(URL, SERVICE, noPersist);

// Unique per run so the lane is rerunnable without a `supabase db reset`.
const RUN = Date.now().toString(36);
const PASSWORD = 'integration-test-pw-123';
const FILE_URL = `https://mockproject.supabase.co/storage/v1/object/public/x/${RUN}.pdf`;

// Each circle seeds one member per slot. Clinicians are split by clinical
// profile because prescriptions (psychiatrist) and test results (psychologist)
// are guarded by profile, not just role. PK is (recipient_id, user_id), so each
// slot needs its own user.
const SLOTS = [
  { key: 'owner', role: 'owner', profile: null },
  { key: 'caregiver', role: 'caregiver', profile: null },
  { key: 'recipient', role: 'recipient', profile: null },
  { key: 'psychiatrist', role: 'clinician', profile: 'psychiatrist' },
  { key: 'psychologist', role: 'clinician', profile: 'psychologist' },
] as const;
type SlotKey = (typeof SLOTS)[number]['key'];

type Member = { userId: string; client: SupabaseClient };
type Circle = { recipientId: string; members: Record<SlotKey, Member> };

// One write path: `writer` is a slot that SHOULD succeed, `denied` is a circle
// member who should be refused even in their own circle (proves role/profile
// gating). `idField` is the column RLS pins to auth.uid().
type WritePath = {
  name: string;
  table: string;
  writer: SlotKey;
  denied: SlotKey;
  idField: 'user_id' | 'author_id';
  row: (memberId: string, recipientId: string) => Record<string, unknown>;
};

const WRITE_PATHS: WritePath[] = [
  {
    name: 'invoices',
    table: 'invoices',
    writer: 'caregiver', // newly allowed (was owner/recipient only)
    denied: 'psychiatrist', // a clinician still may not file invoices
    idField: 'user_id',
    row: (uid, rid) => ({
      user_id: uid,
      recipient_id: rid,
      amount: 42.5,
      file_url: FILE_URL,
      lat: -3.119,
      lng: -60.0217,
    }),
  },
  {
    name: 'prescriptions',
    table: 'prescriptions',
    writer: 'psychiatrist',
    denied: 'psychologist', // a clinician of the wrong profile is refused
    idField: 'user_id',
    // prescriptions.id has no DB default — the client supplies it.
    row: (uid, rid) => ({
      id: randomUUID(),
      user_id: uid,
      recipient_id: rid,
      file_url: FILE_URL,
    }),
  },
  {
    name: 'test results',
    table: 'psychometric_results',
    writer: 'psychologist',
    denied: 'psychiatrist', // the mirror: only the psychologist fills results
    idField: 'author_id',
    row: (uid, rid) => ({
      author_id: uid,
      recipient_id: rid,
      test_date: '2026-03-01',
      instrument: 'WAIS-IV',
      measure: 'Full Scale IQ',
    }),
  },
  {
    name: 'evaluations',
    table: 'evaluations',
    writer: 'psychologist',
    denied: 'psychiatrist', // like test results: only the psychologist uploads
    idField: 'user_id',
    // evaluations.id has no DB default — the client supplies it.
    row: (uid, rid) => ({
      id: randomUUID(),
      user_id: uid,
      recipient_id: rid,
      file_url: FILE_URL,
    }),
  },
  {
    name: 'daily care logs',
    table: 'care_log_entries',
    writer: 'caregiver',
    denied: 'owner', // owners don't author daily logs
    idField: 'author_id',
    row: (uid, rid) => ({
      recipient_id: rid,
      author_id: uid,
      log_date: '2026-07-15',
      values: {},
      author_role: 'caregiver',
    }),
  },
];

async function makeUser(email: string): Promise<string> {
  const { data, error } = await admin.auth.admin.createUser({
    email,
    password: PASSWORD,
    email_confirm: true,
  });
  if (error) throw error;
  return data.user.id;
}

async function signIn(email: string): Promise<SupabaseClient> {
  const client = createClient(URL, ANON, noPersist);
  const { error } = await client.auth.signInWithPassword({
    email,
    password: PASSWORD,
  });
  if (error) throw error;
  return client;
}

async function seedCircle(tag: string): Promise<Circle> {
  const { data: recip, error: recipErr } = await admin
    .from('care_recipients')
    .insert({ display_name: `Recipient ${tag} ${RUN}` })
    .select('id')
    .single();
  if (recipErr) throw recipErr;
  const recipientId = recip.id as string;

  const members = {} as Record<SlotKey, Member>;
  for (const slot of SLOTS) {
    const email = `${slot.key}-${tag}-${RUN}@example.test`;
    const userId = await makeUser(email);
    const { error: memErr } = await admin.from('care_team_members').insert({
      recipient_id: recipientId,
      user_id: userId,
      role: slot.role,
      clinical_profile: slot.profile,
    });
    if (memErr) throw memErr;
    members[slot.key] = { userId, client: await signIn(email) };
  }
  return { recipientId, members };
}

let circleA: Circle;
let circleB: Circle;

beforeAll(async () => {
  // Fail loudly (never skip green) if the local stack isn't up — this lane is
  // opt-in, so a clear "start it" message beats a vacuous pass.
  const reachable = await fetch(`${URL}/rest/v1/`, {
    headers: { apikey: ANON },
  })
    .then((r) => r.ok || r.status === 400 || r.status === 404)
    .catch(() => false);
  if (!reachable) {
    throw new Error(
      `Local Supabase not reachable at ${URL}. Run \`supabase start\` before \`pnpm test:integration\`.`,
    );
  }
  circleA = await seedCircle('a');
  circleB = await seedCircle('b');
});

describe.each(WRITE_PATHS)(
  '$name RLS — write isolation',
  ({ table, writer, denied, idField, row }) => {
    it('lets the authorized member write into their OWN circle', async () => {
      const m = circleA.members[writer];
      const { error } = await m.client
        .from(table)
        .insert(row(m.userId, circleA.recipientId));
      expect(error).toBeNull();
    });

    it('BLOCKS writing into ANOTHER circle (RLS 42501)', async () => {
      const m = circleA.members[writer];
      const { error } = await m.client
        .from(table)
        .insert(row(m.userId, circleB.recipientId));
      expect(error?.code).toBe('42501');
    });

    it('BLOCKS the wrong role/profile even in the OWN circle', async () => {
      // The denied member belongs to circle A but lacks the role (or clinical
      // profile) the policy requires → RLS refuses. This is what enforces
      // "caregiver may not prescribe", "only the psychiatrist prescribes",
      // "only the psychologist files test results".
      const m = circleA.members[denied];
      const spoofFreeRow = { ...row(m.userId, circleA.recipientId) };
      const { error } = await m.client.from(table).insert(spoofFreeRow);
      expect(error?.code).toBe('42501');
    });

    it('BLOCKS spoofing the writer identity to another user', async () => {
      const m = circleA.members[writer];
      const impostorId = circleB.members[writer].userId;
      const spoofed = {
        ...row(m.userId, circleA.recipientId),
        [idField]: impostorId,
      };
      const { error } = await m.client.from(table).insert(spoofed);
      expect(error?.code).toBe('42501');
    });

    it('is write-only — user-scoped reads are denied at the GRANT level', async () => {
      // None of the write-path tables grant SELECT to `authenticated`, so every
      // user-scoped read is refused outright (stronger than RLS filtering to
      // empty) — for the writer and for another circle's member alike.
      const own = await circleA.members[writer].client.from(table).select('id');
      expect(own.error?.code).toBe('42501');
      const other = await circleB.members[writer].client
        .from(table)
        .select('id');
      expect(other.error?.code).toBe('42501');
    });
  },
);

describe('care_team_members RLS — membership visibility', () => {
  it('lets a user read only their OWN membership row, not another circle’s', async () => {
    const { data, error } = await circleA.members.owner.client
      .from('care_team_members')
      .select('recipient_id, user_id');
    expect(error).toBeNull();
    expect(data).toHaveLength(1);
    expect(data![0].recipient_id).toBe(circleA.recipientId);
    expect(data![0].user_id).toBe(circleA.members.owner.userId);
  });
});
