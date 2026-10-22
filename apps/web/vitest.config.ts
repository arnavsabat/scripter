import react from '@vitejs/plugin-react';
import { playwright } from '@vitest/browser-playwright';
import type { BrowserCommand } from 'vitest/node';
import { defineConfig } from 'vitest/config';

/**
 * Clicks a CSS selector at a position inside the element, via Playwright. Vitest's own click
 * turns an element into a text locator, which is ambiguous when two apps show the same line.
 */
const clickAt: BrowserCommand<[selector: string, x: number, y: number]> = async (
  ctx,
  selector,
  x,
  y,
) => {
  const frame = await (ctx as unknown as { frame(): Promise<import('playwright').Frame> }).frame();
  await frame.locator(selector).click({ position: { x, y } });
};

// Web integration tests run in real headless Chromium (D-015): real key presses, real layout.
export default defineConfig({
  plugins: [react()],
  test: {
    include: ['test/**/*.test.{ts,tsx}'],
    globalSetup: ['test/syncServer.ts'],
    testTimeout: 30_000,
    // One file at a time: real key presses go to whichever frame has focus, and the
    // collaboration tests kill and restart the shared test server.
    fileParallelism: false,
    browser: {
      enabled: true,
      headless: true,
      provider: playwright(),
      commands: { clickAt },
      instances: [{ browser: 'chromium', viewport: { width: 1440, height: 900 } }],
    },
  },
});
