import { NextRequest } from 'next/server';
import { GET, POST } from '../../../app/api/admin/consumables/route';
import { PATCH } from '../../../app/api/admin/consumables/[id]/route';
import { resetRateLimiter } from '../../../services/rateLimiter';
import { chain, institutionAdminRow } from '../../helpers/careTeamMock';

const mockGetUser = jest.fn();

jest.mock('@supabase/supabase-js', () => ({
  createClient: () => ({ auth: { getUser: mockGetUser } }),
}));

const adminTables: Record<string, ReturnType<typeof chain>> = {};

jest.mock('../../../services/db', () => ({
  getAdminDbClient: () => ({
    from: (table: string) => adminTables[table] ?? chain({ data: [] }),
  }),
}));

const INSTITUTION_ID = '99999999-9999-9999-9999-999999999999';
const RECIPIENT_ID = '7b0a4d6e-3f2c-4d43-9a58-1c9f6f0e2a11';
const ITEM_ID = 'c1a4d6e3-3f2c-4d43-9a58-1c9f6f0e2a22';

function makeRequest(
  method: 'GET' | 'POST' | 'PATCH',
  url: string,
  body?: unknown,
  token: string | null = 'valid-token',
): NextRequest {
  const headers: Record<string, string> = {
    'Content-Type': 'application/json',
  };
  if (token !== null) headers['Authorization'] = `Bearer ${token}`;
  return new NextRequest(url, {
    method,
    headers,
    ...(body !== undefined ? { body: JSON.stringify(body) } : {}),
  });
}

function mockAdmin() {
  mockGetUser.mockResolvedValue({
    data: { user: { id: 'admin-uuid', email: 'admin@example.com' } },
    error: null,
  });
  adminTables['institution_members'] = chain({
    data: [institutionAdminRow(INSTITUTION_ID)],
  });
}

function mockNonAdmin() {
  mockGetUser.mockResolvedValue({
    data: { user: { id: 'user-1', email: 'u@example.com' } },
    error: null,
  });
  adminTables['institution_members'] = chain({ data: [] });
}

/** The recipient in the request belongs to the caller's own institution. */
function mockRecipientInInstitution() {
  adminTables['care_recipients'] = chain({ data: { id: RECIPIENT_ID } });
}

/** The recipient exists but belongs to a DIFFERENT institution. */
function mockRecipientOutsideInstitution() {
  adminTables['care_recipients'] = chain({ data: null });
}

beforeEach(() => {
  jest.clearAllMocks();
  resetRateLimiter();
  for (const key of Object.keys(adminTables)) delete adminTables[key];
});

describe('GET /api/admin/consumables', () => {
  const url = `http://localhost/api/admin/consumables?recipient_id=${RECIPIENT_ID}`;

  it('returns 401 without a token', async () => {
    expect((await GET(makeRequest('GET', url, undefined, null))).status).toBe(
      401,
    );
  });

  it('returns 403 for a caller who administers no institution', async () => {
    mockNonAdmin();
    expect((await GET(makeRequest('GET', url))).status).toBe(403);
  });

  it('returns 400 for a missing or malformed recipient_id', async () => {
    mockAdmin();
    expect(
      (await GET(makeRequest('GET', 'http://localhost/api/admin/consumables')))
        .status,
    ).toBe(400);
    expect(
      (
        await GET(
          makeRequest(
            'GET',
            'http://localhost/api/admin/consumables?recipient_id=not-a-uuid',
          ),
        )
      ).status,
    ).toBe(400);
  });

  it('returns 403 when the recipient belongs to a different institution', async () => {
    mockAdmin();
    mockRecipientOutsideInstitution();
    expect((await GET(makeRequest('GET', url))).status).toBe(403);
  });

  it('lists the recipient scoped items', async () => {
    mockAdmin();
    mockRecipientInInstitution();
    adminTables['consumable_items'] = chain({
      data: [{ id: ITEM_ID, recipient_id: RECIPIENT_ID, name: 'Gaze' }],
    });
    const res = await GET(makeRequest('GET', url));
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.items).toHaveLength(1);
  });
});

describe('POST /api/admin/consumables', () => {
  const url = 'http://localhost/api/admin/consumables';
  const validBody = {
    recipient_id: RECIPIENT_ID,
    name: 'Gaze',
    unit: 'pack',
    current_quantity: 10,
    daily_usage_rate: 1,
  };

  it('returns 401 without a token', async () => {
    expect((await POST(makeRequest('POST', url, validBody, null))).status).toBe(
      401,
    );
  });

  it('returns 403 for a caller who administers no institution', async () => {
    mockNonAdmin();
    expect((await POST(makeRequest('POST', url, validBody))).status).toBe(403);
  });

  it('returns 400 for an invalid body', async () => {
    mockAdmin();
    mockRecipientInInstitution();
    expect(
      (await POST(makeRequest('POST', url, { ...validBody, name: '' }))).status,
    ).toBe(400);
    expect(
      (
        await POST(
          makeRequest('POST', url, { ...validBody, current_quantity: -1 }),
        )
      ).status,
    ).toBe(400);
    expect(
      (
        await POST(
          makeRequest('POST', url, { ...validBody, daily_usage_rate: 0 }),
        )
      ).status,
    ).toBe(400);
  });

  it("returns 403 when creating an item under another institution's recipient", async () => {
    mockAdmin();
    mockRecipientOutsideInstitution();
    expect((await POST(makeRequest('POST', url, validBody))).status).toBe(403);
  });

  it('creates the item scoped to the recipient', async () => {
    mockAdmin();
    mockRecipientInInstitution();
    adminTables['consumable_items'] = chain({
      data: { id: ITEM_ID, recipient_id: RECIPIENT_ID, name: 'Gaze' },
    });
    const res = await POST(makeRequest('POST', url, validBody));
    expect(res.status).toBe(201);
    expect(adminTables['consumable_items'].insert).toHaveBeenCalledWith(
      expect.objectContaining({ recipient_id: RECIPIENT_ID, name: 'Gaze' }),
    );
  });
});

describe('PATCH /api/admin/consumables/[id] (recount)', () => {
  const url = `http://localhost/api/admin/consumables/${ITEM_ID}`;
  const params = Promise.resolve({ id: ITEM_ID });

  it('returns 401 without a token', async () => {
    const res = await PATCH(
      makeRequest('PATCH', url, { current_quantity: 5 }, null),
      { params },
    );
    expect(res.status).toBe(401);
  });

  it('returns 403 for a caller who administers no institution', async () => {
    mockNonAdmin();
    const res = await PATCH(
      makeRequest('PATCH', url, { current_quantity: 5 }),
      { params },
    );
    expect(res.status).toBe(403);
  });

  it('returns 400 for a negative or missing current_quantity', async () => {
    mockAdmin();
    expect(
      (
        await PATCH(makeRequest('PATCH', url, { current_quantity: -1 }), {
          params,
        })
      ).status,
    ).toBe(400);
    expect(
      (await PATCH(makeRequest('PATCH', url, {}), { params })).status,
    ).toBe(400);
  });

  it('returns 403 when the item belongs to a different institution', async () => {
    mockAdmin();
    adminTables['consumable_items'] = chain({
      data: { id: ITEM_ID, recipient_id: RECIPIENT_ID },
    });
    mockRecipientOutsideInstitution();
    const res = await PATCH(
      makeRequest('PATCH', url, { current_quantity: 5 }),
      { params },
    );
    expect(res.status).toBe(403);
  });

  it('returns 403 when the item id does not exist', async () => {
    mockAdmin();
    adminTables['consumable_items'] = chain({ data: null });
    const res = await PATCH(
      makeRequest('PATCH', url, { current_quantity: 5 }),
      { params },
    );
    expect(res.status).toBe(403);
  });

  it('recounts the item by id, once ownership is proven', async () => {
    mockAdmin();
    mockRecipientInInstitution();
    adminTables['consumable_items'] = chain({
      data: { id: ITEM_ID, recipient_id: RECIPIENT_ID, current_quantity: 5 },
    });
    const res = await PATCH(
      makeRequest('PATCH', url, { current_quantity: 5 }),
      { params },
    );
    expect(res.status).toBe(200);
    expect(adminTables['consumable_items'].update).toHaveBeenCalledWith(
      expect.objectContaining({ current_quantity: 5 }),
    );
  });
});
