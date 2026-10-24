import { defineConfig } from 'vitest/config';

// Cluster tests wait on leases and reconnects, so they need more than Vitest's 5 s default.
export default defineConfig({
  test: { include: ['test/**/*.test.ts'], testTimeout: 30_000, hookTimeout: 30_000 },
});
