import type { Config } from 'jest';

const config: Config = {
  preset: 'ts-jest',
  testEnvironment: 'node',
  moduleNameMapper: {
    '^@/(.*)$': '<rootDir>/$1',
  },
  testMatch: ['**/__tests__/**/*.test.ts'],
  // The integration lane (__tests__/integration) needs a live local Supabase
  // stack (Docker) and runs in seconds, not ms — it must never load into the
  // fast unit suite. Run it explicitly with `pnpm test:integration`.
  testPathIgnorePatterns: ['/node_modules/', '/__tests__/integration/'],
  transform: {
    '^.+\\.tsx?$': ['ts-jest', { tsconfig: 'tsconfig.jest.json' }],
  },
  setupFiles: ['<rootDir>/jest.setup.ts'],
};

export default config;
