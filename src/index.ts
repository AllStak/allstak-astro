/**
 * AllStak for Astro.
 *
 * The package default export is the `allstak(options)` integration factory,
 * used in `astro.config.mjs`:
 *
 *   import { defineConfig } from 'astro/config';
 *   import allstak from '@allstak/astro';
 *
 *   export default defineConfig({
 *     integrations: [
 *       allstak({
 *         apiKey: process.env.ALLSTAK_API_KEY,
 *         environment: process.env.NODE_ENV,
 *         release: process.env.npm_package_version,
 *       }),
 *     ],
 *   });
 *
 * Astro has no component/composable system the way React or Vue do, so the
 * framework-idiomatic surface is exactly: the integration factory (this
 * file) + an auto-injected client bootstrap + auto-added SSR middleware.
 *
 * Public surface:
 *   - default export `allstak`   — the integration factory
 *   - named export `allstak`     — same factory (for `import { allstak }`)
 *   - `init`                     — manual bootstrap (delegates to @allstak/js)
 *   - `initClient`               — browser bootstrap used by the injected page
 *   - `onRequest`                — the SSR middleware (also at /middleware)
 *   - re-exports                 — every top-level @allstak/js export
 */
import type { AstroIntegration } from 'astro';
import { splitOptions } from './options';
import type { AllStakAstroOptions } from './options';

declare const __ALLSTAK_ASTRO_VERSION__: string;

/** Subpath Astro uses to auto-wire the SSR middleware. */
const MIDDLEWARE_ENTRYPOINT = '@allstak/astro/middleware';

/** Subpath the injected page script imports to bootstrap the browser SDK. */
const CLIENT_ENTRYPOINT = '@allstak/astro/client';

/**
 * The integration factory. Returns an `AstroIntegration` describing how the
 * SDK hooks into the build:
 *
 *   - `astro:config:setup`
 *       - injects a `'page'` client bootstrap on every page that calls
 *         `initClient(config)` in the browser (skipped when the client
 *         runtime is disabled);
 *       - in server output only, defines the server config for the
 *         middleware bundle and adds the SSR middleware (`order: 'pre'`) so
 *         each on-demand request is wrapped in a span and its errors
 *         captured. In static output this is skipped entirely — no server
 *         hooks.
 *   - `astro:config:done`
 *       - records the resolved build output for debug logging.
 *
 * `init()` is NOT called here — `astro.config` runs at build time in Node,
 * not in either app runtime. Bootstrapping happens in the browser via the
 * injected script and on the server via the middleware.
 */
export function allstak(options: AllStakAstroOptions): AstroIntegration {
  const { core, enabled, autoInstrumentServer, debug } = splitOptions(options);

  // Serialize the core config once so both the injected client snippet and
  // the server middleware bundle can be initialized with the same options.
  const serializedConfig = JSON.stringify(core);

  return {
    name: '@allstak/astro',
    hooks: {
      'astro:config:setup': ({
        config,
        command,
        injectScript,
        updateConfig,
        addMiddleware,
        logger,
      }) => {
        const isServerOutput = config.output === 'server';

        // --- Client runtime -------------------------------------------------
        // Inject a minimal inline loader on every page. It dynamically
        // imports the bundled client module and hands it the config. Keeping
        // the inline snippet tiny means the heavy lifting stays in a
        // cacheable chunk rather than being inlined into every HTML page.
        if (enabled.client) {
          injectScript(
            'page',
            `import { initClient } from ${JSON.stringify(
              CLIENT_ENTRYPOINT,
            )};\ninitClient(${serializedConfig});`,
          );
          if (debug) {
            logger.info(`client bootstrap injected (command: ${command})`);
          }
        }

        // --- Server runtime -------------------------------------------------
        // Only wire server-side hooks when the build actually produces a
        // server. A purely static build has no request pipeline, so there is
        // nothing to wrap and no middleware to add.
        if (isServerOutput && enabled.server && autoInstrumentServer) {
          // Make the core config available to the middleware bundle at
          // runtime. The middleware reads `__ALLSTAK_ASTRO_SERVER_CONFIG__`,
          // which Vite replaces with this serialized literal at build time.
          updateConfig({
            vite: {
              define: {
                __ALLSTAK_ASTRO_SERVER_CONFIG__: JSON.stringify(serializedConfig),
              },
            },
          });

          // `order: 'pre'` runs our wrapper before user middleware so the
          // span encloses the whole request and we see errors from
          // downstream middleware too.
          addMiddleware({
            entrypoint: MIDDLEWARE_ENTRYPOINT,
            order: 'pre',
          });

          if (debug) {
            logger.info('SSR middleware added (output: server)');
          }
        } else if (debug && enabled.server) {
          logger.info('static output — server instrumentation skipped');
        }
      },

      'astro:config:done': ({ buildOutput, logger }) => {
        if (debug) {
          logger.info(`resolved build output: ${buildOutput}`);
        }
      },
    },
  };
}

export default allstak;

// Re-export the bootstrap helpers so consumers can call them manually if
// they opt out of auto-injection / auto-middleware.
export { init } from './init';
export type { AllStakClientInstance } from './init';
export { initClient } from './client';
export { onRequest } from './middleware';
export type { AllStakAstroOptions } from './options';

// Mirror the @allstak/js public surface so consumers can pull the entire
// observability API from a single namespaced import inside `.astro`
// frontmatter, API routes, and middleware.
export {
  AllStak,
  Scope,
  Session,
  SessionTracker,
  Span,
  WebVitalsModule,
  isWebVitalsSupported,
  defineIntegration,
  dedupeIntegration,
  consoleIntegration,
  httpClientIntegration,
  databaseIntegration,
  eventFiltersIntegration,
  inboundFiltersIntegration,
} from '@allstak/js';

export type {
  AllStakConfig,
  AllStakIntegration,
  Breadcrumb,
  ErrorEvent,
  ErrorEventProcessor,
  LogEvent,
  LogLevel,
  HttpRequestItem,
  HeartbeatOptions,
  SpanData,
  SpanOptions,
  SpanProcessor,
  TracesSampler,
  SamplingContext,
  WebVitalsContext,
  DbQueryItem,
  SessionStatus,
} from '@allstak/js';

export const SDK_NAME = 'allstak-astro';
export const SDK_VERSION = __ALLSTAK_ASTRO_VERSION__;
