import js from '@eslint/js';
import prettier from 'eslint-config-prettier';
import reactHooks from 'eslint-plugin-react-hooks';
import { defineConfig, globalIgnores } from 'eslint/config';
import globals from 'globals';
import tseslint from 'typescript-eslint';

export default defineConfig(
  globalIgnores(['**/node_modules/', '**/dist/', '**/coverage/', '**/cdk.out/', 'docs/']),
  js.configs.recommended,
  tseslint.configs.recommendedTypeChecked,
  {
    languageOptions: {
      parserOptions: {
        projectService: {
          // Config files that sit outside every package's tsconfig.
          allowDefaultProject: [
            '*.js',
            '*.ts',
            'apps/web/vite.config.ts',
            'apps/web/vitest.config.ts',
            'apps/sync/vitest.config.ts',
            'apps/api/vitest.config.ts',
            'infra/vitest.config.ts',
            'apps/sync/scripts/bundle.mjs',
            'tools/loadtest/scripts/bundle.mjs',
            'spike/vitest.config.ts',
          ],
        },
        tsconfigRootDir: import.meta.dirname,
      },
    },
  },
  {
    files: ['**/*.js', '**/*.mjs'],
    extends: [tseslint.configs.disableTypeChecked],
    languageOptions: { globals: globals.node },
  },
  {
    files: ['apps/web/**/*.{ts,tsx}'],
    extends: [reactHooks.configs.flat.recommended],
    languageOptions: { globals: globals.browser },
  },
  {
    files: ['apps/sync/**', 'apps/api/**', 'tools/**', 'infra/**'],
    languageOptions: { globals: globals.node },
  },
  prettier,
);
