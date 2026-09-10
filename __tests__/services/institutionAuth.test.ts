import { NextRequest } from 'next/server';
import {
  authorizeInstitutionAdminRequest,
  listCallerAdminInstitutions,
  isInstitutionAdminOfRecipient,
} from '../../services/institutionAuth';
import { resetRateLimiter } from '../../services/rateLimiter';
import { chain, institutionAdminRow } from '../helpers/careTeamMock';

const mockGetUser = jest.fn();
jest.mock('@supabase/supabase-js', () => ({
  createClient: () => ({ auth: { getUser: mockGetUser } }),
}));

const adminTables: Record<string, ReturnType<typeof chain>> = {};
jest.mock('../../services/db', () => ({
  getAdminDbClient: () => ({
    from: (table: string) => adminTables[table] ?? chain({ data: [] }),
  }),
}));

const INSTITUTION_X = 'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa';
const INSTITUTION_Y = 'bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbbb';

function makeRequest(search = ''): NextRequest {
  return new NextRequest(`http://localhost/api/admin/x${search}`, {
    method: 'GET',
    headers: { Authorization: 'Bearer valid-token' },
  });
}

function makeUnauthenticatedRequest(): NextRequest {
  return new NextRequest('http://localhost/api/admin/x', { method: 'GET' });
}

function mockUser() {
  mockGetUser.mockResolvedValue({
    data: { user: { id: 'user-1', email: 'u@example.com' } },
    error: null,
  });
}

beforeEach(() => {
  jest.clearAllMocks();
  resetRateLimiter();
  for (const key of Object.keys(adminTables)) delete adminTables[key];
});

describe('authorizeInstitutionAdminRequest', () => {
  it('rejects an unauthenticated caller', async () => {
    const result = await authorizeInstitutionAdminRequest(
      makeUnauthenticatedRequest(),
    );
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.response.status).toBe(401);
  });

  it('rejects a caller who administers no institution', async () => {
    mockUser();
    adminTables['institution_members'] = chain({ data: [] });
    const result = await authorizeInstitutionAdminRequest(makeRequest());
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.response.status).toBe(403);
  });

  it('rejects an institution_admin of a SUSPENDED institution', async () => {
    mockUser();
    adminTables['institution_members'] = chain({
      data: [institutionAdminRow(INSTITUTION_X, 'suspended')],
    });
    const result = await authorizeInstitutionAdminRequest(makeRequest());
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.response.status).toBe(403);
  });

  it('resolves the single administered active institution with no ?institution= param', async () => {
    mockUser();
    adminTables['institution_members'] = chain({
      data: [institutionAdminRow(INSTITUTION_X)],
    });
    const result = await authorizeInstitutionAdminRequest(makeRequest());
    expect(result.ok).toBe(true);
    if (result.ok) expect(result.institutionId).toBe(INSTITUTION_X);
  });

  it('rejects an ambiguous request when the caller administers TWO institutions with no param', async () => {
    mockUser();
    adminTables['institution_members'] = chain({
      data: [
        institutionAdminRow(INSTITUTION_X),
        institutionAdminRow(INSTITUTION_Y),
      ],
    });
    const result = await authorizeInstitutionAdminRequest(makeRequest());
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.response.status).toBe(403);
  });

  it('resolves an explicit ?institution= among several administered institutions', async () => {
    mockUser();
    adminTables['institution_members'] = chain({
      data: [
        institutionAdminRow(INSTITUTION_X),
        institutionAdminRow(INSTITUTION_Y),
      ],
    });
    const result = await authorizeInstitutionAdminRequest(
      makeRequest(`?institution=${INSTITUTION_Y}`),
    );
    expect(result.ok).toBe(true);
    if (result.ok) expect(result.institutionId).toBe(INSTITUTION_Y);
  });

  it('rejects an ?institution= the caller does not administer', async () => {
    mockUser();
    adminTables['institution_members'] = chain({
      data: [institutionAdminRow(INSTITUTION_X)],
    });
    const result = await authorizeInstitutionAdminRequest(
      makeRequest(`?institution=${INSTITUTION_Y}`),
    );
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.response.status).toBe(403);
  });
});

describe('listCallerAdminInstitutions', () => {
  it('rejects an unauthenticated caller', async () => {
    const result = await listCallerAdminInstitutions(
      makeUnauthenticatedRequest(),
    );
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.response.status).toBe(401);
  });

  it('returns an empty list (200, not 403) for a signed-in non-admin', async () => {
    mockUser();
    adminTables['institution_members'] = chain({ data: [] });
    const result = await listCallerAdminInstitutions(makeRequest());
    expect(result.ok).toBe(true);
    if (result.ok) expect(result.institutions).toEqual([]);
  });

  it('returns only ACTIVE institutions, dropping suspended ones', async () => {
    mockUser();
    adminTables['institution_members'] = chain({
      data: [
        institutionAdminRow(INSTITUTION_X, 'active'),
        institutionAdminRow(INSTITUTION_Y, 'suspended'),
      ],
    });
    const result = await listCallerAdminInstitutions(makeRequest());
    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.institutions).toEqual([
        { id: INSTITUTION_X, name: 'Test Institution' },
      ]);
    }
  });
});

describe('isInstitutionAdminOfRecipient', () => {
  const user = { id: 'admin-1' } as never;

  it('returns null when the recipient does not exist or is inactive', async () => {
    adminTables['care_recipients'] = chain({ data: null });
    const result = await isInstitutionAdminOfRecipient(user, 'recipient-1');
    expect(result).toBeNull();
  });

  it('returns null when the caller is not an institution_admin of the recipient institution', async () => {
    adminTables['care_recipients'] = chain({
      data: { id: 'recipient-1', institution_id: INSTITUTION_X },
    });
    adminTables['institution_members'] = chain({ data: null });
    const result = await isInstitutionAdminOfRecipient(user, 'recipient-1');
    expect(result).toBeNull();
  });

  it('returns the recipient when the caller administers its institution', async () => {
    const recipientRow = { id: 'recipient-1', institution_id: INSTITUTION_X };
    adminTables['care_recipients'] = chain({ data: recipientRow });
    adminTables['institution_members'] = chain({
      data: { institution_id: INSTITUTION_X },
    });
    const result = await isInstitutionAdminOfRecipient(user, 'recipient-1');
    expect(result).toEqual(recipientRow);
  });
});
