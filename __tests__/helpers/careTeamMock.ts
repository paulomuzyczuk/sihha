// Shared mocks for membership-authorized route tests (M3). `chain` builds a
// permissive thenable query stub: every builder method returns the chain and
// awaiting it resolves the given result, so tests only declare per-table
// outcomes.

type QueryResult = {
  data?: unknown;
  error?: unknown;
  count?: number | null;
};

// eslint-disable-next-line @typescript-eslint/no-explicit-any
export function chain(result: QueryResult): any {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const c: any = {};
  for (const method of [
    'select',
    'insert',
    'update',
    'upsert',
    'delete',
    'eq',
    'neq',
    'gte',
    'lte',
    'lt',
    'in',
    'is',
    'not',
    'order',
    'limit',
  ]) {
    c[method] = jest.fn(() => c);
  }
  c.single = jest.fn(() =>
    Promise.resolve({ data: result.data ?? null, error: result.error ?? null }),
  );
  c.maybeSingle = jest.fn(() =>
    Promise.resolve({ data: result.data ?? null, error: result.error ?? null }),
  );
  c.then = (
    onFulfilled: (value: QueryResult) => unknown,
    onRejected?: (reason: unknown) => unknown,
  ) =>
    Promise.resolve({
      data: result.data ?? null,
      error: result.error ?? null,
      count: result.count ?? null,
    }).then(onFulfilled, onRejected);
  return c;
}

export interface MockRecipientRow {
  id: string;
  display_name: string;
  kind: string;
  timezone: string;
  log_cadence: string;
  geo_lat: number | null;
  geo_lng: number | null;
  geo_radius_m: number | null;
  active: boolean;
}

export const RECIPIENT_ROW: MockRecipientRow = {
  id: 'recipient-1',
  display_name: 'Alex Doe',
  kind: 'human',
  timezone: 'America/Manaus',
  log_cadence: 'one_per_day',
  geo_lat: -3.119,
  geo_lng: -60.0217,
  geo_radius_m: 200,
  active: true,
};

export function membershipRows(
  role: 'owner' | 'caregiver' | 'clinician' | 'recipient',
  recipient = RECIPIENT_ROW,
  clinicalProfile: string | null = null,
) {
  return [
    {
      recipient_id: recipient.id,
      role,
      clinical_profile: clinicalProfile,
      receives_alerts: false,
      care_recipients: recipient,
    },
  ];
}
