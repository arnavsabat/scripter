// Production bundles of the servers (D-082, D-091): each entry point becomes one ES module file
// with its dependencies inside, so the image needs no node_modules and starts fast after a
// failover. Run from the repo root: `node apps/sync/scripts/bundle.mjs <outdir>` (it lives here
// because this package has esbuild; it bundles the API too).
import { build } from 'esbuild';

const outdir = process.argv[2] ?? 'dist/server';
await build({
  entryPoints: {
    api: 'apps/api/src/main.ts',
    migrate: 'apps/api/src/db/migrate-cli.ts',
    sync: 'apps/sync/src/main.ts',
    purge: 'apps/sync/src/purge-cli.ts',
  },
  outdir,
  bundle: true,
  platform: 'node',
  format: 'esm',
  target: 'node24',
  sourcemap: true,
  // pg, the AWS SDK and ws are CommonJS inside: give the bundle a `require` that works in ESM.
  banner: {
    js: "import { createRequire as __wrRequire } from 'node:module'; const require = __wrRequire(import.meta.url);",
  },
  // Optional native add-ons the libraries try to load, and fall back without.
  external: ['pg-native', 'bufferutil', 'utf-8-validate'],
  logLevel: 'info',
});
