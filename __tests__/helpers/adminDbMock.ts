import { chain } from './careTeamMock';

// A service-role client stand-in for modules that take `adminDb` by injection
// (services/alertRules, adminCounting, adminCircleActivity). Each table gets its
// own `chain` stub, so a test declares per-table outcomes up front and can then
// assert on the query that was actually built — which builder methods ran, and
// with which arguments.

export interface FakeAdminDb {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  from: (table: string) => any;
  auth: { admin: { getUserById: jest.Mock } };
  /** The stub for one table, for assertions (created on demand). */
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  table: (name: string) => any;
  /** Storage-bucket access, for modules that download private objects. */
  storage: { from: jest.Mock };
  /** The bucket's download(), pre-wired to storage.from(...).download. */
  download: jest.Mock;
}

/** A downloaded storage object: what Supabase's Blob gives these callers. */
export function fakeStorageFile(
  contents: string,
  type = 'application/pdf',
): { arrayBuffer: () => Promise<Buffer>; type: string } {
  const bytes = Buffer.from(contents);
  return { arrayBuffer: async () => bytes, type };
}

type TableResult = { data?: unknown; error?: unknown; count?: number | null };

/**
 * Build a fake admin client. Tables named in `results` resolve to the given
 * outcome; any other table resolves to an empty list, so a test only declares
 * what it cares about.
 */
export function fakeAdminDb(
  results: Record<string, TableResult> = {},
): FakeAdminDb {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const tables: Record<string, any> = {};
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const table = (name: string): any => {
    if (!tables[name]) tables[name] = chain(results[name] ?? { data: [] });
    return tables[name];
  };
  for (const name of Object.keys(results)) table(name);

  const download = jest.fn().mockResolvedValue({ data: null, error: null });

  return {
    from: table,
    auth: { admin: { getUserById: jest.fn() } },
    table,
    storage: { from: jest.fn(() => ({ download })) },
    download,
  };
}
