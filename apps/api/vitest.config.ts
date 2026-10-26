import { defineConfig } from 'vitest/config';

// Database tests create and drop a whole Postgres database, which can take longer than Vitest's 5 s default.
export default defineConfig({
  test: { include: ['test/**/*.test.ts'], testTimeout: 30_000, hookTimeout: 30_000 },
});
