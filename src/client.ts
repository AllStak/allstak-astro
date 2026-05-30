/**
 * Browser entry point. The integration injects a tiny inline loader on every
 * page (via Astro's `injectScript('page', …)`) that imports this module and
 * calls `initClient(config)`. We keep the injected inline snippet minimal and
 * put the real logic here so it can be bundled, tree-shaken, and typechecked.
 *
 * This module is ESM-only and runs in the browser. It must not import any
 * Node- or build-only code (no `astro`, no `node:*`).
 */
import { AllStak } from '@allstak/js';
import type { AllStakConfig } from '@allstak/js';
import { init } from './init';

export { init } from './init';

declare global {
  interface Window {
    /** Guards against double-init if the snippet is somehow injected twice. */
    __ALLSTAK_ASTRO_CLIENT_STARTED__?: boolean;
  }
}

/**
 * Bootstrap AllStak in the browser. Called by the injected page script with
 * the core config the consumer passed to the integration factory.
 *
 * Beyond `init`, this:
 *   - starts Web Vitals collection (unless the consumer disabled it);
 *   - opens a `navigation` span on Astro View Transitions client-side route
 *     changes (`astro:after-swap`), so SPA-style navigations show up as
 *     transactions just like a hard page load.
 *
 * It is safe to call more than once — the core client is a singleton and we
 * additionally guard the listener wiring with a window flag.
 */
export function initClient(config: AllStakConfig): void {
  if (typeof window === 'undefined') return;
  if (window.__ALLSTAK_ASTRO_CLIENT_STARTED__) return;
  window.__ALLSTAK_ASTRO_CLIENT_STARTED__ = true;

  init(config);

  // Web Vitals (LCP / INP / CLS / FCP / TTFB). `startWebVitals` is itself a
  // no-op when the config disabled them, so calling it unconditionally is
  // fine — it respects `enableWebVitals`.
  try {
    AllStak.startWebVitals();
  } catch {
    // Never let observability bootstrap break the page.
  }

  instrumentViewTransitions();
}

/**
 * Astro's View Transitions client router swaps the document via the History
 * API and fires `astro:before-preparation` / `astro:after-swap`. We open a
 * navigation span across that swap so client-side route changes are traced.
 */
function instrumentViewTransitions(): void {
  if (typeof document === 'undefined') return;

  let activeNav: { finish: (status?: 'ok' | 'error' | 'timeout') => void } | null =
    null;

  document.addEventListener('astro:before-preparation', () => {
    try {
      const path =
        typeof location !== 'undefined' ? location.pathname : '/';
      AllStak.addBreadcrumb({
        type: 'navigation',
        message: path,
        level: 'info',
        data: { path },
      });
      activeNav = AllStak.startSpan('navigation', {
        description: path,
        op: 'navigation',
        attributes: {
          'allstak.origin': 'auto.navigation.astro',
          'route.path': path,
        },
      });
    } catch {
      // ignore — never block navigation on observability errors
    }
  });

  document.addEventListener('astro:after-swap', () => {
    try {
      activeNav?.finish('ok');
    } catch {
      // ignore
    } finally {
      activeNav = null;
    }
  });
}
