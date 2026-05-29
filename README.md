# @allstak/astro

[![npm](https://img.shields.io/npm/v/@allstak/astro.svg)](https://www.npmjs.com/package/@allstak/astro)
[![License: MIT](https://img.shields.io/badge/license-MIT-blue.svg)](LICENSE)

Official AllStak SDK for **Astro**, shipped as an Astro integration. Captures
uncaught exceptions, structured logs, distributed traces, HTTP requests, and
web vitals — across both the browser and the SSR server, with zero boilerplate
beyond a single line in `astro.config`.

Works in both **SSR/hybrid** and **static** output. In static builds only the
client runtime is active (there is no request pipeline to instrument); in
server output the SDK additionally wraps every on-demand request.

## Install

```bash
npm install @allstak/astro
# or
pnpm add @allstak/astro
# or
yarn add @allstak/astro
```

`astro@>=3.5` is a peer dependency.

## Setup

Add the integration to `astro.config.mjs`:

```js
import { defineConfig } from 'astro/config';
import allstak from '@allstak/astro';

export default defineConfig({
  integrations: [
    allstak({
      apiKey: process.env.ALLSTAK_API_KEY,
      environment: process.env.NODE_ENV,
      release: process.env.npm_package_version,
    }),
  ],
});
```

That single `allstak({ … })` wires:

- a client bootstrap injected on every page — `AllStak.init` runs in the
  browser, Web Vitals start, and Astro View Transitions navigations open spans;
- in server output, an SSR middleware (`order: 'pre'`) that wraps each request
  in an `http.server` span, records the response status, and captures any error
  thrown while rendering — then re-throws so your error pages still work;
- the full `@allstak/js` ingest pipeline (HTTP, db, logs, breadcrumbs,
  web vitals) on both runtimes.

## Capturing inside your app

`import * as AllStak`-style access works anywhere — `.astro` frontmatter, API
routes, and middleware — because the package re-exports the entire
`@allstak/js` surface:

```astro
---
import { AllStak } from '@allstak/astro';

try {
  await loadDashboard();
} catch (err) {
  AllStak.captureException(err, { page: 'dashboard' });
  throw err;
}
---
```

```ts
// src/pages/api/checkout.ts
import { AllStak } from '@allstak/astro';

export async function POST() {
  const span = AllStak.startSpan('checkout.charge', { op: 'task' });
  try {
    // …
    span.finish('ok');
    return new Response('ok');
  } catch (err) {
    AllStak.captureException(err);
    span.finish('error');
    throw err;
  }
}
```

## Manual middleware (older Astro)

On Astro `>=3.5` the SSR middleware is added automatically. On older versions,
wire it yourself in `src/middleware.ts`:

```ts
import { onRequest as allstak } from '@allstak/astro/middleware';
import { sequence } from 'astro:middleware';

export const onRequest = sequence(allstak);
```

The handler carries a double-wrap guard, so adding it manually alongside
auto-instrumentation will not duplicate spans.

## Manual client bootstrap

If you disable client auto-injection (`enabled: { client: false }`) you can
bootstrap the browser SDK yourself:

```ts
import { initClient } from '@allstak/astro/client';

initClient({ apiKey: import.meta.env.PUBLIC_ALLSTAK_API_KEY });
```

## Configuration

`allstak(options)` accepts every option that `@allstak/js`'s `AllStak.init`
accepts (`apiKey`, `host`, `environment`, `release`, `dist`, `sampleRate`,
`tracesSampleRate`, `enableWebVitals`, `enableOfflineQueue`, `beforeSend`, …),
plus the integration-only switches below:

| Option | Default | Purpose |
|---|---|---|
| `apiKey` | — | **Required.** Your AllStak ingest key |
| `environment` | — | Deployment environment tag (e.g. `production`) |
| `release` | — | Release identifier for release-health |
| `enabled` | `true` | `true` / `false`, or `{ client?, server? }` to toggle each runtime |
| `autoInstrumentServer` | `true` | Add the SSR request-wrapping middleware in server output |
| `debug` | `false` | Build-time logging from the integration (what it injected/added) |

## License

MIT
