import { defineConfig } from 'vitest/config';

// Each workspace folder runs as its own Vitest project, so the web app can later use a DOM
// environment while the packages and servers stay on plain Node.
export default defineConfig({
  test: {
    projects: ['apps/*', 'packages/*', 'tools/*', 'infra'],
    passWithNoTests: true,
  },
});
