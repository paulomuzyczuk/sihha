import { createClient, SupabaseClient } from '@supabase/supabase-js';
import { NextRequest } from 'next/server';

// Route-level cross-tenant isolation for the institution-admin surface,
// against a LIVE local stack. The unit suite mocks the DB and so cannot
// prove that admin A is actually confined to institution A — the very
// property that makes multi-tenancy safe
// (docs/saas-institution-layer-plan.md §2a, ported from flagship). This
// lane drives the real route handlers with real signed-in JWTs and two
// independent institutions, and asserts that A can neither see nor act on
// B. "Safety is not a composable property."
//
// Requires a live local stack: `supabase start` then `pnpm test:integration`.

const URL = process.env.SUPABASE_LOCAL_URL!;
const ANON = process.env.SUPABASE_LOCAL_ANON_KEY!;
const SERVICE = process.env.SUPABASE_LOCAL_SERVICE_ROLE_KEY!;

// Point the app's server code (getAdminDbClient / getAuthenticatedUser) at
// the local stack. Both read these at call time, so setting them here
// suffices.
process.env.NEXT_PUBLIC_SUPABASE_URL = URL;
process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY = ANON;
process.env.SUPABASE_SERVICE_ROLE_KEY = SERVICE;
process.env.NEXT_PUBLIC_SITE_URL = 'http://localhost';

/* eslint-disable import/first */
import { GET as usersGet } from '../../app/api/admin/users/route';
import { POST as invitePost } from '../../app/api/admin/invite/route';
import { POST as recipientsPost } from '../../app/api/admin/recipients/route';
import { GET as circlesGet } from '../../app/api/admin/circles/route';
import { resetRateLimiter } from '../../services/rateLimiter';
/* eslint-enable import/first */

const noPersist = {
  auth: { persistSession: false, autoRefreshToken: false },
} as const;
const admin = createClient(URL, SERVICE, noPersist);

const RUN = Date.now().toString(36);
const PASSWORD = 'integration-test-pw-123';

type Institution = {
  institutionId: string;
  recipientId: string;
  adminEmail: string;
  adminToken: string;
  staffUserId: string;
  staffEmail: string;
};

async function makeUser(email: string): Promise<string> {
  const { data, error } = await admin.auth.admin.createUser({
    email,
    password: PASSWORD,
    email_confirm: true,
  });
  if (error) throw error;
  return data.user.id;
}

async function tokenFor(email: string): Promise<string> {
  const client = createClient(URL, ANON, noPersist);
  const { data, error } = await client.auth.signInWithPassword({
    email,
    password: PASSWORD,
  });
  if (error || !data.session) throw error ?? new Error('no session');
  return data.session.access_token;
}

async function addInstitutionMember(
  institutionId: string,
  userId: string,
  institutionRole: 'institution_admin' | 'institution_staff',
): Promise<void> {
  const { error } = await admin.from('institution_members').insert({
    institution_id: institutionId,
    user_id: userId,
    institution_role: institutionRole,
  });
  if (error) throw error;
}

async function seedInstitution(tag: string): Promise<Institution> {
  const { data: institution, error: institutionErr } = await admin
    .from('institutions')
    .insert({
      name: `Institution ${tag} ${RUN}`,
      slug: `institution-${tag}-${RUN}`,
    })
    .select('id')
    .single();
  if (institutionErr) throw institutionErr;
  const institutionId = institution.id as string;

  const adminEmail = `admin-${tag}-${RUN}@example.test`;
  const adminUserId = await makeUser(adminEmail);
  await addInstitutionMember(institutionId, adminUserId, 'institution_admin');

  const staffEmail = `staff-${tag}-${RUN}@example.test`;
  const staffUserId = await makeUser(staffEmail);
  await addInstitutionMember(institutionId, staffUserId, 'institution_staff');

  const { data: recip, error: recipErr } = await admin
    .from('care_recipients')
    .insert({
      display_name: `Recipient ${tag} ${RUN}`,
      institution_id: institutionId,
    })
    .select('id')
    .single();
  if (recipErr) throw recipErr;
  // The admin owns the single circle, so invite's single-recipient
  // resolution has an unambiguous target within the institution.
  await admin.from('care_team_members').insert({
    recipient_id: recip.id,
    user_id: adminUserId,
    role: 'owner',
  });

  return {
    institutionId,
    recipientId: recip.id as string,
    adminEmail,
    adminToken: await tokenFor(adminEmail),
    staffUserId,
    staffEmail,
  };
}

function req(body?: unknown, token?: string, search = ''): NextRequest {
  const headers: Record<string, string> = {
    'Content-Type': 'application/json',
  };
  if (token) headers['Authorization'] = `Bearer ${token}`;
  return new NextRequest(`http://localhost/api/admin${search}`, {
    method: body === undefined ? 'GET' : 'POST',
    headers,
    ...(body !== undefined ? { body: JSON.stringify(body) } : {}),
  });
}

let institutionA: Institution;
let institutionB: Institution;

beforeAll(async () => {
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
  institutionA = await seedInstitution('a');
  institutionB = await seedInstitution('b');
});

beforeEach(() => resetRateLimiter());

describe('GET /api/admin/users — institution-scoped account list', () => {
  it('returns only the caller institution’s members, never another institution’s', async () => {
    const res = await usersGet(req(undefined, institutionA.adminToken));
    expect(res.status).toBe(200);
    const emails: string[] = (await res.json()).users.map(
      (u: { email: string }) => u.email,
    );
    expect(emails).toEqual(
      expect.arrayContaining([
        institutionA.adminEmail,
        institutionA.staffEmail,
      ]),
    );
    expect(emails).not.toContain(institutionB.adminEmail);
    expect(emails).not.toContain(institutionB.staffEmail);
  });

  it('returns 403 for a signed-in user who is not an institution admin', async () => {
    const staffToken = await tokenFor(institutionA.staffEmail);
    expect((await usersGet(req(undefined, staffToken))).status).toBe(403);
  });

  it('returns 401 without a token', async () => {
    expect((await usersGet(req(undefined))).status).toBe(401);
  });
});

describe('GET /api/admin/circles — institution-scoped circle list', () => {
  it('returns only the caller institution’s circles', async () => {
    const res = await circlesGet(req(undefined, institutionA.adminToken));
    expect(res.status).toBe(200);
    const ids: string[] = (await res.json()).circles.map(
      (c: { id: string }) => c.id,
    );
    expect(ids).toContain(institutionA.recipientId);
    expect(ids).not.toContain(institutionB.recipientId);
  });
});

describe('POST /api/admin/invite — cross-institution denial', () => {
  it('refuses to invite into ANOTHER institution’s recipient (400, no leak)', async () => {
    const res = await invitePost(
      req(
        {
          email: `x-${RUN}@example.test`,
          full_name: 'Cross Institution',
          role: 'clinician',
          recipient_id: institutionB.recipientId,
        },
        institutionA.adminToken,
      ),
    );
    expect(res.status).toBe(400);
  });

  it('invites successfully within the caller’s own institution', async () => {
    const res = await invitePost(
      req(
        {
          email: `ok-${RUN}@example.test`,
          full_name: 'Same Institution',
          role: 'clinician',
          recipient_id: institutionA.recipientId,
        },
        institutionA.adminToken,
      ),
    );
    expect(res.status).toBe(201);
  });

  it('does not leak whether an email exists OUTSIDE the caller’s institution', async () => {
    // institutionB.adminEmail is a real, existing account — but institution A's
    // admin must not be able to tell that from this route (A10 posture).
    const res = await invitePost(
      req(
        {
          email: institutionB.adminEmail,
          full_name: 'Probe',
          role: 'clinician',
          recipient_id: institutionA.recipientId,
        },
        institutionA.adminToken,
      ),
    );
    expect(res.status).toBe(201);
  });
});

describe('POST /api/admin/recipients — institution stamping + owner confinement', () => {
  it('refuses an owner from another institution (400)', async () => {
    const res = await recipientsPost(
      req(
        {
          template_id: 'pet-care',
          display_name: `Bad Owner ${RUN}`,
          timezone: 'America/Manaus',
          owner_user_id: institutionB.staffUserId,
        },
        institutionA.adminToken,
      ),
    );
    expect(res.status).toBe(400);
  });

  it('creates a recipient stamped with the caller’s institution', async () => {
    const res = await recipientsPost(
      req(
        {
          template_id: 'pet-care',
          display_name: `Good ${RUN}`,
          timezone: 'America/Manaus',
          owner_user_id: institutionA.staffUserId,
        },
        institutionA.adminToken,
      ),
    );
    expect(res.status).toBe(201);
    const newId = (await res.json()).recipient.id;
    const { data } = await admin
      .from('care_recipients')
      .select('institution_id')
      .eq('id', newId)
      .single();
    expect(data!.institution_id).toBe(institutionA.institutionId);
  });
});
