import { NextRequest } from 'next/server';
import { POST } from '../../../app/api/admin/invite/route';
import { resetRateLimiter } from '../../../services/rateLimiter';
import { chain, institutionAdminRow } from '../../helpers/careTeamMock';

const INSTITUTION_ID = '99999999-9999-9999-9999-999999999999';

const mockGetUser = jest.fn();

jest.mock('@supabase/supabase-js', () => ({
  createClient: () => ({ auth: { getUser: mockGetUser } }),
}));

const mockInviteUser = jest.fn();
const mockDeleteUser = jest.fn();
const mockGetUserById = jest.fn();
const adminTables: Record<string, ReturnType<typeof chain>> = {};

jest.mock('../../../services/db', () => ({
  getAdminDbClient: () => ({
    auth: {
      admin: {
        inviteUserByEmail: mockInviteUser,
        deleteUser: mockDeleteUser,
        getUserById: mockGetUserById,
      },
    },
    from: (table: string) => adminTables[table] ?? chain({ data: [] }),
  }),
}));

function makeRequest(
  body: unknown,
  token: string | null = 'valid-token',
): NextRequest {
  const headers: Record<string, string> = {
    'Content-Type': 'application/json',
  };
  if (token !== null) headers['Authorization'] = `Bearer ${token}`;
  return new NextRequest('http://localhost/api/admin/invite', {
    method: 'POST',
    headers,
    body: JSON.stringify(body),
  });
}

const adminUser = { id: 'admin-uuid', email: 'admin@example.com' };
const invitedUser = { id: 'invited-uuid', email: 'nova@example.com' };
const validBody = {
  email: 'nova@example.com',
  full_name: 'Nova Psicóloga',
  role: 'clinician',
  member_label: 'Psicóloga',
};

let membershipInsert: jest.Mock;

function mockHappyPath() {
  mockGetUser.mockResolvedValue({ data: { user: adminUser }, error: null });
  adminTables['institution_members'] = chain({
    data: [institutionAdminRow(INSTITUTION_ID)],
  });
  adminTables['care_recipients'] = chain({ data: [{ id: 'recipient-1' }] });
  const membershipChain = chain({ data: null, error: null });
  membershipInsert = membershipChain.insert;
  adminTables['care_team_members'] = membershipChain;
  mockInviteUser.mockResolvedValue({
    data: { user: invitedUser },
    error: null,
  });
  mockDeleteUser.mockResolvedValue({ data: {}, error: null });
}

function mockNonAdmin() {
  mockGetUser.mockResolvedValue({
    data: { user: { id: 'user-1', email: 'u@example.com' } },
    error: null,
  });
  adminTables['institution_members'] = chain({ data: [] });
}

describe('POST /api/admin/invite (M3: membership provisioning)', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    resetRateLimiter();
    for (const key of Object.keys(adminTables)) delete adminTables[key];
    process.env.NEXT_PUBLIC_SITE_URL = 'https://sihha.example.com';
  });

  it('returns 401 when Authorization header is absent', async () => {
    const res = await POST(makeRequest(validBody, null));
    expect(res.status).toBe(401);
    expect(mockInviteUser).not.toHaveBeenCalled();
  });

  it('returns 403 for a caller who administers no institution', async () => {
    mockNonAdmin();
    const res = await POST(makeRequest(validBody));
    expect(res.status).toBe(403);
  });

  it('returns 400 for an invalid e-mail or unknown role', async () => {
    mockHappyPath();
    expect(
      (await POST(makeRequest({ ...validBody, email: 'nope' }))).status,
    ).toBe(400);
    expect(
      (await POST(makeRequest({ ...validBody, role: 'ADMIN' }))).status,
    ).toBe(400);
  });

  it('invites and provisions a clinician membership in the single circle', async () => {
    mockHappyPath();
    const res = await POST(makeRequest(validBody));
    expect(res.status).toBe(201);

    expect(mockInviteUser).toHaveBeenCalledWith(
      'nova@example.com',
      expect.objectContaining({
        redirectTo: 'https://sihha.example.com/auth/reset-password',
      }),
    );
    expect(membershipInsert).toHaveBeenCalledWith({
      recipient_id: 'recipient-1',
      user_id: 'invited-uuid',
      role: 'clinician',
      member_label: 'Psicóloga',
      clinical_profile: null,
      receives_alerts: false,
    });
  });

  it('carries the clinical profile onto the membership when sent', async () => {
    mockHappyPath();
    const res = await POST(
      makeRequest({ ...validBody, clinical_profile: 'psychologist' }),
    );
    expect(res.status).toBe(201);
    expect(membershipInsert).toHaveBeenCalledWith(
      expect.objectContaining({ clinical_profile: 'psychologist' }),
    );
  });

  it('provisions a recipient membership without a label', async () => {
    mockHappyPath();
    const res = await POST(
      makeRequest({
        email: 'p@example.com',
        full_name: 'Paciente',
        role: 'recipient',
      }),
    );
    expect(res.status).toBe(201);
    expect(membershipInsert).toHaveBeenCalledWith(
      expect.objectContaining({ role: 'recipient', member_label: null }),
    );
  });

  it('requires recipient_id when multiple circles exist in the institution', async () => {
    mockHappyPath();
    adminTables['care_recipients'] = chain({
      data: [{ id: 'r1' }, { id: 'r2' }],
    });
    const res = await POST(makeRequest(validBody));
    expect(res.status).toBe(400);
    expect(mockInviteUser).not.toHaveBeenCalled();
  });

  it('rejects an explicit recipient_id belonging to another institution', async () => {
    mockHappyPath();
    // The explicit-id branch re-queries scoped to institution_id — a
    // recipient outside it never resolves, so this looks identical to a
    // nonexistent id (no cross-tenant existence oracle).
    adminTables['care_recipients'] = chain({ data: null });
    const res = await POST(
      makeRequest({
        ...validBody,
        recipient_id: 'other-institution-recipient',
      }),
    );
    expect(res.status).toBe(400);
    expect(mockInviteUser).not.toHaveBeenCalled();
  });

  it('returns 409 when the e-mail belongs to a member of the caller institution', async () => {
    mockHappyPath();
    mockInviteUser.mockResolvedValue({
      data: { user: null },
      error: { code: 'email_exists', status: 422, message: 'exists' },
    });
    adminTables['institution_members'] = {
      ...chain({ data: [institutionAdminRow(INSTITUTION_ID)] }),
      select: jest.fn((cols: string) =>
        cols.includes('institution_role')
          ? chain({ data: [institutionAdminRow(INSTITUTION_ID)] })
          : chain({ data: [{ user_id: 'existing-uid' }] }),
      ),
    } as unknown as ReturnType<typeof chain>;
    mockGetUserById.mockResolvedValue({
      data: { user: { id: 'existing-uid', email: 'nova@example.com' } },
      error: null,
    });
    const res = await POST(makeRequest(validBody));
    expect(res.status).toBe(409);
  });

  it('suppresses the oracle for an e-mail existing OUTSIDE the institution (byte-identical success)', async () => {
    mockHappyPath();
    mockInviteUser.mockResolvedValue({
      data: { user: null },
      error: { code: 'email_exists', status: 422, message: 'exists' },
    });
    // institutionMemberAccounts resolves to a member whose e-mail differs
    // from the invited address — the caller's institution has no one at
    // nova@example.com, even though the address exists elsewhere.
    adminTables['institution_members'] = {
      ...chain({ data: [institutionAdminRow(INSTITUTION_ID)] }),
      select: jest.fn((cols: string) =>
        cols.includes('institution_role')
          ? chain({ data: [institutionAdminRow(INSTITUTION_ID)] })
          : chain({ data: [{ user_id: 'someone-else' }] }),
      ),
    } as unknown as ReturnType<typeof chain>;
    mockGetUserById.mockResolvedValue({
      data: { user: { id: 'someone-else', email: 'other@example.com' } },
      error: null,
    });
    const res = await POST(makeRequest(validBody));
    const body = await res.json();
    expect(res.status).toBe(201);
    expect(body).toEqual({ invited: true });
  });

  it('rolls back the invited user when the membership insert fails', async () => {
    mockHappyPath();
    adminTables['care_team_members'] = chain({
      data: null,
      error: { message: 'boom' },
    });
    const res = await POST(makeRequest(validBody));
    expect(res.status).toBe(500);
    expect(mockDeleteUser).toHaveBeenCalledWith('invited-uuid');
  });
});
