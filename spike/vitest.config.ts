import { playwright } from '@vitest/browser-playwright';
import { defineConfig } from 'vitest/config';

// Every spike test runs in real headless Chromium (D-011), so layout, scrolling,
// keyboard input and timing are real rather than simulated.
export default defineConfig({
  test: {
    include: ['test/**/*.test.ts'],
    testTimeout: 120_000,
    fileParallelism: false,
    // Print console output for passing tests too: the [EVIDENCE] lines feed docs/spike-report.md.
    silent: false,
    browser: {
      enabled: true,
      headless: true,
      provider: playwright(),
      instances: [{ browser: 'chromium', viewport: { width: 1400, height: 900 } }],
    },
  },
});
