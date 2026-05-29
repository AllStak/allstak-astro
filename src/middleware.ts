/**
 * SSR middleware. Auto-wired by the integration via
 * `addMiddleware({ entrypoint: '@allstak/astro/middleware', order: 'pre' })`
 * on Astro >= 3.5, and importable from the `@allstak/astro/middleware`
 * subpath for manual wiring on older Astro:
 *
 *   // src/middleware.ts
 *   import { onRequest as allstak } from '@allstak/astro/middleware';
 *   import { sequence } from 'astro:middleware';
 *   export const onRequest = sequence(allstak);
 *
 * This module runs only in the server runtime (SSR/hybrid). It is never
 * present in a fully static build because the integration does not add the
 * middleware when there is no server output.
 */
import { defineMiddleware } from 'astro:middleware';
import { AllStak } from '@allstak/js';
import type { AllStakConfig } from '@allstak/js';
import { init } from './init';

/**
 * The integration writes the consumer's core config into this env var at
 * build time (`vite.define`) so the server runtime can initialize AllStak
 * with the same options the client got. Falls back to an empty object so the
 * middleware never throws if the define is somehow missing.
 */
declare const __ALLSTAK_ASTRO_SERVER_CONFIG__: string;

let serverConfig: AllStakConfig | null = null;
function resolveServerConfig(): AllStakConfig {
  if (serverConfig) return serverConfig;
  try {
    serverConfig = JSON.parse(
      typeof __ALLSTAK_ASTRO_SERVER_CONFIG__ === 'string'
        ? __ALLSTAK_ASTRO_SERVER_CONFIG__
        : '{}',
    ) as AllStakConfig;
  } catch {
    serverConfig = {} as AllStakConfig;
  }
  return serverConfig;
}

let initialized = false;
/** Initialize the core client once, lazily, on the first request. */
function ensureInit(): void {
  if (initialized) return;
  initialized = true;
  try {
    init(resolveServerConfig());
  } catch {
    // If init fails (e.g. missing apiKey at runtime) we still let the request
    // through — capture calls below simply become no-ops on the singleton.
  }
}

/**
 * The SSR request handler. Marked with `__allstak_wrapped__` so a consumer
 * who both relies on auto-instrumentation AND manually re-exports this in
 * their own `src/middleware.ts` does not double-wrap the same request.
 */
export const onRequest = defineMiddleware(async (context, next) => {
  ensureInit();

  const request = context.request;
  const method = request?.method ?? 'GET';

  // `context.url` is a parsed URL in SSR. Fall back to the raw request URL.
  let path = '/';
  let urlStr = '';
  try {
    const url = context.url ?? new URL(request.url);
    path = url.pathname;
    urlStr = url.toString();
  } catch {
    urlStr = request?.url ?? '';
  }

  // Parametrized route pattern (e.g. `/users/[id]`) when Astro exposes it.
  const routePattern =
    (context as { routePattern?: string }).routePattern ?? path;

  let span: ReturnType<typeof AllStak.startSpan> | null = null;
  try {
    span = AllStak.startSpan('http.server', {
      description: `${method} ${routePattern}`,
      op: 'http.server',
      attributes: {
        'allstak.origin': 'auto.http.server.astro',
        'http.method': method,
        'http.route': routePattern,
        'http.target': path,
        'http.url': urlStr,
      },
    });
  } catch {
    span = null;
  }

  try {
    const response = await next();
    try {
      const status = (response as { status?: number }).status;
      if (typeof status === 'number') {
        span?.setMeasurement('http.status_code', status);
        span?.setTag('http.status_code', String(status));
      }
      span?.finish(
        typeof status === 'number' && status >= 500 ? 'error' : 'ok',
      );
    } catch {
      span?.finish('ok');
    }
    return response;
  } catch (err) {
    // Capture the SSR error, mark the span failed, and re-throw so Astro's
    // own error handling (error page, adapter logging) still runs.
    try {
      AllStak.captureException(
        err instanceof Error ? err : new Error(String(err)),
        {
          framework: 'astro',
          mechanism: 'auto.middleware.astro',
          handled: false,
          'http.method': method,
          'http.route': routePattern,
          'http.url': urlStr,
        },
      );
    } catch {
      // ignore — never mask the original error with an observability error
    }
    try {
      span?.finish('error');
    } catch {
      // ignore
    }
    throw err;
  }
});

// Double-wrap guard marker (see `onRequest` doc comment).
(onRequest as { __allstak_wrapped__?: boolean }).__allstak_wrapped__ = true;

/**
 * Test-only hook to reset the module-level memoization (`initialized`,
 * cached server config) so each test can observe the one-time `init` from a
 * clean slate. Not part of the public API and not exported from the package
 * index. No-op cost in production (never imported by the built entry).
 */
export function __resetForTests(): void {
  initialized = false;
  serverConfig = null;
}
