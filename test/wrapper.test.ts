/**
 * @allstak/astro wrapper tests.
 *
 * These exercise the Astro-side glue (init shim, the integration factory's
 * config:setup hook, the client bootstrap, and the SSR middleware) against a
 * fully in-memory fake of `@allstak/js` and a stub of the `astro:middleware`
 * virtual module. No transport, no network, no real Astro build — every core
 * call is recorded synchronously so assertions are deterministic.
 */
import { describe, it, expect, beforeEach, vi } from 'vitest';

// ---------------------------------------------------------------------------
// In-memory fake of @allstak/js. Records every call the wrapper makes so we
// can assert forwarding behaviour without a real transport.
//
// Everything the vi.mock factory needs lives inside vi.hoisted(), because
// vi.mock is hoisted above normal module-scope variables. The returned
// `calls` registry is a stable reference we read from in assertions.
// ---------------------------------------------------------------------------
interface FakeSpan {
  op: string;
  options: Record<string, unknown>;
  tags: Record<string, string>;
  measurements: Record<string, number>;
  finished: Array<string | undefined>;
  finish: (status?: string) => void;
  setTag: (k: string, v: string) => FakeSpan;
  setMeasurement: (k: string, v: number) => FakeSpan;
  setData: (d: string) => FakeSpan;
  setDescription: (d: string) => FakeSpan;
}

interface Calls {
  init: Array<Record<string, unknown>>;
  captureException: Array<{ error: Error; context?: Record<string, unknown> }>;
  addBreadcrumb: Array<Record<string, unknown>>;
  webVitals: number;
  spans: FakeSpan[];
}

const { calls } = vi.hoisted(() => {
  const calls: Calls = {
    init: [],
    captureException: [],
    addBreadcrumb: [],
    webVitals: 0,
    spans: [],
  };
  return { calls };
});

vi.mock('@allstak/js', () => {
  function makeSpan(op: string, options: Record<string, unknown>): FakeSpan {
    return {
      op,
      options,
      tags: {},
      measurements: {},
      finished: [],
      finish(status?: string) {
        this.finished.push(status);
      },
      setTag(k: string, v: string) {
        this.tags[k] = v;
        return this;
      },
      setMeasurement(k: string, v: number) {
        this.measurements[k] = v;
        return this;
      },
      setData() {
        return this;
      },
      setDescription() {
        return this;
      },
    };
  }

  const fakeAllStak = {
    init(config: Record<string, unknown>) {
      calls.init.push(config);
      return fakeAllStak;
    },
    captureException(error: Error, context?: Record<string, unknown>) {
      calls.captureException.push({ error, context });
    },
    addBreadcrumb(crumb: Record<string, unknown>) {
      calls.addBreadcrumb.push(crumb);
    },
    startWebVitals() {
      calls.webVitals += 1;
    },
    startSpan(operation: string, options: Record<string, unknown> = {}) {
      const span = makeSpan(operation, options);
      calls.spans.push(span);
      return span;
    },
  };

  return {
    AllStak: fakeAllStak,
    Span: class {},
  };
});

// Stub the `astro:middleware` virtual module — in a real build Astro provides
// it; under the test runner we supply a `defineMiddleware` that just returns
// the handler unchanged (its runtime behaviour).
vi.mock('astro:middleware', () => ({
  defineMiddleware: <T>(fn: T): T => fn,
}));

// Import the wrapper modules AFTER the mocks are registered.
import { init } from '../src/init';
import { allstak } from '../src/index';
import { initClient } from '../src/client';
import { onRequest, __resetForTests } from '../src/middleware';
import { splitOptions } from '../src/options';

beforeEach(() => {
  calls.init.length = 0;
  calls.captureException.length = 0;
  calls.addBreadcrumb.length = 0;
  calls.webVitals = 0;
  calls.spans.length = 0;
});

// ---------------------------------------------------------------------------
// init shim
// ---------------------------------------------------------------------------
describe('init', () => {
  it('stamps the wrapper identity onto the core config', () => {
    init({ apiKey: 'k' });
    expect(calls.init).toHaveLength(1);
    expect(calls.init[0]).toMatchObject({
      apiKey: 'k',
      sdkName: 'allstak-astro',
    });
    expect(calls.init[0]?.sdkVersion).toBe('0.1.0-test');
  });

  it('lets the caller override sdkName / sdkVersion', () => {
    init({ apiKey: 'k', sdkName: 'custom', sdkVersion: '9.9.9' });
    expect(calls.init[0]).toMatchObject({
      sdkName: 'custom',
      sdkVersion: '9.9.9',
    });
  });
});

// ---------------------------------------------------------------------------
// splitOptions
// ---------------------------------------------------------------------------
describe('splitOptions', () => {
  it('separates integration switches from the core config', () => {
    const { core, enabled, autoInstrumentServer, debug } = splitOptions({
      apiKey: 'k',
      environment: 'prod',
      enabled: { client: true, server: false },
      autoInstrumentServer: false,
      debug: true,
    });
    expect(core).toEqual({ apiKey: 'k', environment: 'prod' });
    expect(enabled).toEqual({ client: true, server: false });
    expect(autoInstrumentServer).toBe(false);
    expect(debug).toBe(true);
  });

  it('defaults enabled to both runtimes on', () => {
    const { enabled } = splitOptions({ apiKey: 'k' });
    expect(enabled).toEqual({ client: true, server: true });
  });

  it('treats enabled:false as both runtimes off', () => {
    const { enabled } = splitOptions({ apiKey: 'k', enabled: false });
    expect(enabled).toEqual({ client: false, server: false });
  });
});

// ---------------------------------------------------------------------------
// integration factory — astro:config:setup
// ---------------------------------------------------------------------------
interface SetupSpy {
  scripts: Array<{ stage: string; content: string }>;
  middlewares: Array<{ entrypoint: string | URL; order: string }>;
  viteDefines: Record<string, unknown>;
}

function runConfigSetup(
  integration: ReturnType<typeof allstak>,
  output: 'static' | 'server',
): SetupSpy {
  const spy: SetupSpy = { scripts: [], middlewares: [], viteDefines: {} };
  const logger = { info: () => {}, warn: () => {}, error: () => {} };
  const hook = integration.hooks['astro:config:setup'];
  if (!hook) throw new Error('config:setup hook missing');
  // Cast through unknown — we only feed the fields the hook touches.
  (hook as unknown as (opts: unknown) => void)({
    config: { output },
    command: 'build',
    isRestart: false,
    logger,
    injectScript: (stage: string, content: string) =>
      spy.scripts.push({ stage, content }),
    addMiddleware: (mid: { entrypoint: string | URL; order: string }) =>
      spy.middlewares.push(mid),
    updateConfig: (cfg: { vite?: { define?: Record<string, unknown> } }) => {
      Object.assign(spy.viteDefines, cfg.vite?.define ?? {});
      return cfg;
    },
  });
  return spy;
}

describe('allstak() integration factory', () => {
  it('is named and exposes the config hooks', () => {
    const integration = allstak({ apiKey: 'k' });
    expect(integration.name).toBe('@allstak/astro');
    expect(typeof integration.hooks['astro:config:setup']).toBe('function');
    expect(typeof integration.hooks['astro:config:done']).toBe('function');
  });

  it('injects a page client bootstrap carrying the core config', () => {
    const integration = allstak({ apiKey: 'k', environment: 'prod' });
    const spy = runConfigSetup(integration, 'static');
    expect(spy.scripts).toHaveLength(1);
    expect(spy.scripts[0]?.stage).toBe('page');
    expect(spy.scripts[0]?.content).toContain('@allstak/astro/client');
    expect(spy.scripts[0]?.content).toContain('"apiKey":"k"');
    // The integration-only switches must NOT leak into the client config.
    expect(spy.scripts[0]?.content).not.toContain('autoInstrumentServer');
  });

  it('adds the SSR middleware ONLY in server output (no server hooks in static)', () => {
    const integration = allstak({ apiKey: 'k' });

    const staticSpy = runConfigSetup(integration, 'static');
    expect(staticSpy.middlewares).toHaveLength(0);
    expect(staticSpy.viteDefines).toEqual({});

    const serverSpy = runConfigSetup(integration, 'server');
    expect(serverSpy.middlewares).toHaveLength(1);
    expect(serverSpy.middlewares[0]).toMatchObject({
      entrypoint: '@allstak/astro/middleware',
      order: 'pre',
    });
    // server config is wired into the middleware bundle via vite define
    expect(
      serverSpy.viteDefines['__ALLSTAK_ASTRO_SERVER_CONFIG__'],
    ).toBeTypeOf('string');
  });

  it('skips the client script when the client runtime is disabled', () => {
    const integration = allstak({ apiKey: 'k', enabled: { client: false } });
    const spy = runConfigSetup(integration, 'server');
    expect(spy.scripts).toHaveLength(0);
  });

  it('skips middleware when autoInstrumentServer is false', () => {
    const integration = allstak({ apiKey: 'k', autoInstrumentServer: false });
    const spy = runConfigSetup(integration, 'server');
    expect(spy.middlewares).toHaveLength(0);
  });
});

// ---------------------------------------------------------------------------
// client bootstrap
// ---------------------------------------------------------------------------
describe('initClient', () => {
  beforeEach(() => {
    // Minimal browser globals for the bootstrap path.
    (globalThis as { window?: unknown }).window = { } as unknown;
    (globalThis as { document?: unknown }).document = {
      addEventListener: () => {},
    } as unknown;
    (globalThis as { location?: unknown }).location = {
      pathname: '/dashboard',
    } as unknown;
  });

  it('inits the core client and starts web vitals', () => {
    initClient({ apiKey: 'k', environment: 'prod' });
    expect(calls.init).toHaveLength(1);
    expect(calls.init[0]).toMatchObject({
      apiKey: 'k',
      sdkName: 'allstak-astro',
    });
    expect(calls.webVitals).toBe(1);
  });

  it('is idempotent — a second call does not re-init', () => {
    initClient({ apiKey: 'k' });
    initClient({ apiKey: 'k' });
    expect(calls.init).toHaveLength(1);
  });
});

// ---------------------------------------------------------------------------
// SSR middleware
// ---------------------------------------------------------------------------
function makeContext(method = 'GET', url = 'https://app.test/users/42') {
  return {
    request: { method, url },
    url: new URL(url),
    routePattern: '/users/[id]',
  };
}

describe('onRequest middleware', () => {
  beforeEach(() => {
    // Clear the module-level init memoization so each case sees the one-time
    // server init from a clean slate.
    __resetForTests();
  });

  it('wraps a successful request in an http.server span and finishes it ok', async () => {
    const ctx = makeContext();
    const response = { status: 200 };
    const out = await (onRequest as unknown as (
      c: unknown,
      next: () => Promise<unknown>,
    ) => Promise<unknown>)(ctx, async () => response);

    expect(out).toBe(response);
    expect(calls.spans).toHaveLength(1);
    const span = calls.spans[0]!;
    expect(span.op).toBe('http.server');
    expect(span.options.description).toBe('GET /users/[id]');
    expect(span.options.attributes).toMatchObject({
      'http.method': 'GET',
      'http.route': '/users/[id]',
    });
    expect(span.measurements['http.status_code']).toBe(200);
    expect(span.finished).toEqual(['ok']);
  });

  it('initializes the server client once on the first request', async () => {
    await (onRequest as unknown as (
      c: unknown,
      next: () => Promise<unknown>,
    ) => Promise<unknown>)(makeContext(), async () => ({ status: 200 }));
    // server config define is absent under the test runner → empty config,
    // still stamped with the wrapper identity.
    expect(calls.init.length).toBeGreaterThanOrEqual(1);
    expect(calls.init[0]).toMatchObject({ sdkName: 'allstak-astro' });
  });

  it('finishes the span with error status for a 5xx response', async () => {
    const out = await (onRequest as unknown as (
      c: unknown,
      next: () => Promise<unknown>,
    ) => Promise<unknown>)(makeContext(), async () => ({ status: 503 }));
    expect((out as { status: number }).status).toBe(503);
    const span = calls.spans[0]!;
    expect(span.finished).toEqual(['error']);
  });

  it('captures a thrown SSR error (unhandled) and re-throws it', async () => {
    const boom = new Error('render exploded');
    await expect(
      (onRequest as unknown as (
        c: unknown,
        next: () => Promise<unknown>,
      ) => Promise<unknown>)(makeContext(), async () => {
        throw boom;
      }),
    ).rejects.toBe(boom);

    expect(calls.captureException).toHaveLength(1);
    expect(calls.captureException[0]?.error).toBe(boom);
    expect(calls.captureException[0]?.context).toMatchObject({
      framework: 'astro',
      mechanism: 'auto.middleware.astro',
      handled: false,
      'http.route': '/users/[id]',
    });
    const span = calls.spans[0]!;
    expect(span.finished).toEqual(['error']);
  });
});
