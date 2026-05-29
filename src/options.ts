import type { AllStakConfig } from '@allstak/js';

/**
 * Options accepted by the `allstak(options)` integration factory.
 *
 * Everything `@allstak/js`'s `AllStak.init` accepts is allowed here
 * (`apiKey`, `host`, `environment`, `release`, `dist`, sampling, offline
 * queue, web vitals, `beforeSend`, …) — those are forwarded verbatim to the
 * core client on both the client and the server. The extra fields below
 * control how the integration wires itself into Astro.
 */
export interface AllStakAstroOptions extends AllStakConfig {
  /**
   * Enable or disable each SDK runtime independently.
   *
   *   - `true` (default): both client and server are active.
   *   - `false`: the integration is a no-op (nothing injected, no
   *     middleware added).
   *   - `{ client?, server? }`: per-runtime toggle. The server runtime is
   *     only ever active in SSR/hybrid output — there is no server runtime
   *     in a fully static build regardless of this flag.
   */
  enabled?: boolean | { client?: boolean; server?: boolean };

  /**
   * Wrap each SSR request in a `http.server` span and capture any error
   * thrown while rendering. Has no effect in static output (there is no
   * request pipeline to wrap). Default: `true`.
   */
  autoInstrumentServer?: boolean;

  /**
   * Build-time debug logging from the integration itself (which scripts it
   * injected, whether server middleware was added). Default: `false`.
   */
  debug?: boolean;
}

/**
 * The subset of options that is safe and useful to ship into the browser
 * bundle. We deliberately drop the integration-only switches (`enabled`,
 * `autoInstrumentServer`, `debug`) before serializing — the client only
 * needs the core `AllStakConfig`.
 */
export type ClientInitOptions = AllStakConfig;

/** Split the integration options into the pieces each runtime needs. */
export function splitOptions(options: AllStakAstroOptions): {
  core: AllStakConfig;
  enabled: { client: boolean; server: boolean };
  autoInstrumentServer: boolean;
  debug: boolean;
} {
  const {
    enabled = true,
    autoInstrumentServer = true,
    debug = false,
    ...core
  } = options;

  const resolvedEnabled =
    typeof enabled === 'boolean'
      ? { client: enabled, server: enabled }
      : { client: enabled.client ?? true, server: enabled.server ?? true };

  return {
    core,
    enabled: resolvedEnabled,
    autoInstrumentServer,
    debug,
  };
}
