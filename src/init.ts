import { AllStak } from '@allstak/js';
import type { AllStakConfig } from '@allstak/js';

/**
 * The core client instance returned by `AllStak.init`. `@allstak/js` does
 * not export the `AllStakClient` class by name, so we derive the type from
 * the value. This keeps the emitted declaration referential (no inlining of
 * the core class's private members, which would trip TS4094).
 */
export type AllStakClientInstance = ReturnType<typeof AllStak.init>;

/**
 * Initialize the AllStak SDK for an Astro application.
 *
 * This is a thin shim over `AllStak.init` from `@allstak/js` that stamps
 * the wrapper identity (`sdkName`, `sdkVersion`) so the backend can tell
 * Astro traffic apart from plain JS traffic. Everything else — buffering,
 * sampling, session health, offline queue, PII scrubbing — is delegated to
 * the underlying core client.
 *
 * It runs in both runtimes: the browser bootstrap (`client.ts`) calls it on
 * page load, and the SSR middleware calls it once when the server module
 * first loads. The core client is a singleton, so a second `init` with the
 * same config is harmless.
 */
export function init(config: AllStakConfig): AllStakClientInstance {
  return AllStak.init({
    ...config,
    sdkName: config.sdkName ?? 'allstak-astro',
    sdkVersion: config.sdkVersion ?? __ALLSTAK_ASTRO_VERSION__,
  });
}
