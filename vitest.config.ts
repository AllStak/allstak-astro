import { defineConfig } from 'vitest/config';

export default defineConfig({
  define: {
    // Mirror the tsup build-time define so source modules that read the
    // injected version constant typecheck and run under the test runner.
    __ALLSTAK_ASTRO_VERSION__: JSON.stringify('0.1.0-test'),
  },
  test: {
    environment: 'node',
    include: ['test/**/*.test.ts'],
    globals: true,
  },
});
