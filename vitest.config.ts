import { defineConfig } from 'vitest/config';
import { fileURLToPath } from 'node:url';

const pkg = (p: string) => fileURLToPath(new URL(`./${p}/src/index.ts`, import.meta.url));

export default defineConfig({
  resolve: {
    alias: {
      '@typestub/recorder': pkg('packages/recorder'),
      '@typestub/infer': pkg('packages/infer'),
      '@typestub/gen-ts': pkg('packages/gen-ts'),
      '@typestub/gen-py': pkg('packages/gen-py'),
      '@typestub/shim': pkg('packages/shim'),
      '@typestub/drift': pkg('packages/drift'),
      '@typestub/messy-mock': pkg('servers/messy-mock'),
    },
  },
  test: {
    include: ['packages/*/tests/**/*.test.ts', 'servers/*/tests/**/*.test.ts'],
    testTimeout: 20000,
  },
});
