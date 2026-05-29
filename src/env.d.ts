/// <reference types="astro/client" />

/**
 * Build-time constant injected by tsup (`define`) and by the vitest config.
 * Holds the SDK version read from `package.json` so it can never drift from
 * a hand-written literal. Declared here so every source module sees it.
 *
 * The triple-slash reference above pulls in Astro's client ambient types,
 * notably the `astro:middleware` virtual module that `src/middleware.ts`
 * imports `defineMiddleware` from.
 */
declare const __ALLSTAK_ASTRO_VERSION__: string;
