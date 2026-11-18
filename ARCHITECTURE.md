# Architecture

Two editions share one front end. **Hosted:** static site + zero-dependency Vercel functions (`api/`) that relay real Yahoo Finance data. **Local Edition:** a Python-stdlib program (`local/bridge`) that serves the same front end and the same `/api/*` contract plus `/api/live/*` (engine, risk gate, brokers, learning). Native ES modules, no bundler, no framework, no runtime dependencies (a deliberate deviation from a TypeScript/bundler stack, because the build environment had no package registry access; types are documented in JSDoc comments).

- `web/index.html` shell + CSP; `js/theme-init.js` sets the theme before paint (light default).
- `js/main.js` History-API router: `/`, `/builder`, `/docs`, `/local`, `/app/<page>` (lazy-loaded).
- `js/core/` pure logic (no DOM): indicators, signals, plan, sizing, costs, risk gate, paper engine, Monte Carlo (`pyrandom.js` = bit-exact Mersenne Twister), forecast calibration, analyst, storage, alerts, market and AI adapters.
- `js/app/` state, data loading, shared UI context. `js/pages/` UI. `js/workers/mc.worker.js` runs simulations off the main thread.
- Storage: IndexedDB (memory fallback) in the browser; JSON files in `data/` for the Local Edition.
- Data flow: adapter → normalised bars (`kind`: delayed/historical/realtime) → analysis → UI, always carrying a source label.
- Calculation logic is validated against fixed reference outputs in `tests/golden`.
- **New logic, not ports:** the generic risk gate, cost models, paper engine, forecast calibration, rule-based AI explainer.
