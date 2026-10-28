// The load-test image's bundles (D-093): the load-test server, the generator and its worker
// thread. Run from the repo root: `node tools/loadtest/scripts/bundle.mjs <outdir>`.
import { build } from 'esbuild';

await build({
  entryPoints: {
    'lt-server': 'tools/loadtest/src/server.ts',
    run: 'tools/loadtest/src/run.ts',
    worker: 'tools/loadtest/src/worker.ts',
  },
  outdir: process.argv[2] ?? 'dist/loadtest',
  bundle: true,
  platform: 'node',
  format: 'esm',
  target: 'node24',
  banner: {
    js: "import { createRequire as __wrRequire } from 'node:module'; const require = __wrRequire(import.meta.url);",
  },
  external: ['pg-native', 'bufferutil', 'utf-8-validate'],
  logLevel: 'info',
});
