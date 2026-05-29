# Changelog

All notable changes to `@allstak/astro` are documented here.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.1.0/),
and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

## [0.1.0] — 2026-05-29

Initial release of the official AllStak SDK for Astro, shipped as an Astro
integration.

### Added

- `allstak(options)` — the default-export integration factory, registered in
  `astro.config.mjs` via `integrations: [allstak({ … })]`. Implemented through
  the `astro:config:setup` hook:
  - **Client injection.** Injects a `'page'`-stage bootstrap on every page
    that imports `@allstak/astro/client` and calls `initClient(config)` in the
    browser, so the SDK starts on page load. Only the core `AllStakConfig` is
    serialized into the page — integration-only switches never leak to the
    client.
  - **Server middleware.** In server output only, wires the consumer config
    into the server bundle and auto-adds the SSR middleware with `order: 'pre'`
    via `addMiddleware`. In a fully static build no server hooks run at all.
  - Accepts `apiKey`, `environment`, `release`, and every other
    `AllStakConfig` option, plus `enabled` (per-runtime toggle),
    `autoInstrumentServer`, and `debug`.
- `init(config)` — thin bootstrap over `@allstak/js` that stamps the wrapper
  identity (`sdkName: 'allstak-astro'`, `sdkVersion`) so backend ingest can
  distinguish Astro traffic. The SDK version is injected at build time from
  `package.json`, never hand-written.
- `initClient(config)` — browser bootstrap used by the injected page script.
  Calls `init`, starts Web Vitals collection, and instruments Astro View
  Transitions (`astro:before-preparation` / `astro:after-swap`) so client-side
  route changes open a `navigation` span. Idempotent and guarded against double
  injection.
- `@allstak/astro/middleware` — SSR `onRequest` handler. Wraps each on-demand
  request in an `http.server` span (method, route pattern, target, URL),
  records the response status, finishes the span (`error` for 5xx), and routes
  thrown render errors through `captureException` (marked `handled: false`,
  mechanism `auto.middleware.astro`) before re-throwing so Astro's own error
  handling still runs. Lazily initializes the server client once on the first
  request and carries a double-wrap guard for manual wiring on older Astro.
- `@allstak/astro/client` — browser entry exposing `initClient` for manual
  bootstrap when auto-injection is disabled.
- Full re-export of the `@allstak/js` public surface so consumers can pull the
  entire observability API from a single namespaced import inside `.astro`
  frontmatter, API routes, and middleware.
- Dual ESM/CJS builds with bundled type declarations and three subpath entries
  (`.`, `./middleware`, `./client`).

[0.1.0]: https://github.com/AllStak/allstak-astro/releases/tag/v0.1.0
