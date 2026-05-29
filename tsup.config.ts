import { defineConfig } from 'tsup';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, resolve } from 'node:path';

const pkgPath = resolve(dirname(fileURLToPath(import.meta.url)), 'package.json');
const pkg = JSON.parse(readFileSync(pkgPath, 'utf8')) as { version: string };
const VERSION = JSON.stringify(pkg.version);

/**
 * Three entry points, because an Astro integration straddles three runtimes:
 *
 *   - `index`      — the integration factory + build-time plumbing. Runs in
 *                    Node at `astro.config` evaluation and during `astro
 *                    build`. This is what a consumer imports.
 *   - `middleware` — the SSR `onRequest` handler. Astro auto-wires it via
 *                    `addMiddleware('@allstak/astro/middleware', ...)`, so it
 *                    must be importable from its own subpath and run inside
 *                    the server bundle.
 *   - `client`     — the browser bootstrap that `injectScript('page', …)`
 *                    pulls into every page. Ships as ESM only.
 *
 * `astro` and `@allstak/js` are externals: the host app's installed
 * versions win, and consumers pin `@allstak/js` in their own deps.
 */
export default defineConfig({
  entry: {
    index: 'src/index.ts',
    middleware: 'src/middleware.ts',
    client: 'src/client.ts',
  },
  format: ['esm', 'cjs'],
  dts: true,
  clean: true,
  sourcemap: true,
  platform: 'node',
  external: ['astro', 'astro:middleware', '@allstak/js'],
  define: {
    __ALLSTAK_ASTRO_VERSION__: VERSION,
  },
  treeshake: true,
});
