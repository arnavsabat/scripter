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
  // The app calls /api on its own origin (D-031); in the tests that's the fake API (test/fakeApi.ts).
  server: { proxy: { '/api': 'http://127.0.0.1:4789', '/__fake': 'http://127.0.0.1:4789' } },
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
      // Copy invite link writes to the clipboard (D-032), which a browser allows only when granted.
      // Only Chromium knows these permissions; WebKit and Firefox refuse to start with them.
      provider: playwright(
        (process.env.WR_BROWSERS ?? 'chromium') === 'chromium'
          ? { contextOptions: { permissions: ['clipboard-read', 'clipboard-write'] } }
          : {},
      ),
      commands: { clickAt },
      // WR_BROWSERS=webkit,firefox runs the same tests in Safari's and Firefox's engines (D-089).
      instances: (process.env.WR_BROWSERS ?? 'chromium').split(',').map((b) => ({
        browser: b.trim() as 'chromium' | 'webkit' | 'firefox',
        viewport: { width: 1440, height: 900 },
      })),
    },
  },
});
