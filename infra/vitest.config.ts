import { defineConfig } from 'vitest/config';

// Synthesizing CDK templates takes a few seconds.
export default defineConfig({ test: { include: ['test/**/*.test.ts'], testTimeout: 60_000 } });
