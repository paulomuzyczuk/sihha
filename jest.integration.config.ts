import type { Config } from 'jest';

// Integration lane — exercises the Postgres RLS policies on the write paths
// against a LIVE local Supabase stack (`supabase start`). This is the one place
// the unit suite structurally cannot reach: those routes delegate tenant
// isolation to RLS via the user-scoped client, and "safety is not a composable
// property" (SRE Ch.17 / Nygard) — per-component confidence can't prove the
// composition. Kept OUT of the fast unit suite (see jest.config.ts
// testPathIgnorePatterns); costs seconds + Docker, so it runs only on demand.
//
// Prereq: `supabase start` (Docker). Then: `pnpm test:integration`.
const config: Config = {
  preset: 'ts-jest',
  testEnvironment: 'node',
  testMatch: ['**/__tests__/integration/**/*.test.ts'],
  transform: {
    '^.+\\.tsx?$': ['ts-jest', { tsconfig: 'tsconfig.jest.json' }],
  },
  setupFiles: ['<rootDir>/__tests__/integration/localStack.ts'],
  testTimeout: 30000,
  maxWorkers: 1, // serial: the suite shares one local database
  // supabase-js keeps an internal auth timer alive; nothing to drain in an
  // opt-in integration run, so force a clean exit rather than hang.
  forceExit: true,
};

export default config;
