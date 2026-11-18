# Test report

Run in the build sandbox (no package registry, and no direct access to Yahoo Finance or any broker).

| Suite | Result |
|---|---|
| `npm test` (JS, 58 tests incl. relay fallback/circuit-breaker, vendor backups, AI model auto-discovery, settings migration: reference outputs, engine, storage, adapters with mocked fetch, Yahoo relay on real Yahoo-format payloads, API handlers, theme, vercel config, privacy, docs) | 58 pass |
| `npm run test:local` (Local Edition: clock, indicators, strategies, backtest/learning, risk gate, paper broker, Alpaca/Kite with mocked HTTP, engine, server security, store) | 47 pass |
| `npm run build` | ok |
| Browser (Playwright/Chromium): all 17 routes, light default, pure-black dark, `/local`, Live Trading round trip against a local server fed by real Yahoo-format fixtures, mobile width | no JS errors; expected 404s only for symbols missing from the fixtures |
| Fresh extract of `bharat-finance-local.zip` started with `run.py` | serves app, `/api/health` |

Browser check also confirmed that a browser holding an old saved `demo` provider now loads the dashboard.

## NOT verified (please test yourself)
- **Live Yahoo Finance fetching** (hosted functions and the local program): the sandbox blocks it. Parsing is tested on real Yahoo response files only. Yahoo's endpoints are unofficial and may change or rate-limit.
- **Broker adapters (Alpaca, Kite):** mocked HTTP only; never run against a real account. Experimental.
- **`start.bat` on Windows** (Python detection/installation): written carefully, not executed on Windows. `start.sh`/`run.py` were run on Linux.
- Vercel deployment of `api/` functions was not exercised on Vercel.
- AI providers and automatic model discovery: tested with mocked responses only; verify with your own key.
- Whether Yahoo answers your Vercel region: unknown until you open `/api/diag`.

## Known limits
India holiday calendar is partial; Local Edition credentials are unencrypted in `data/credentials.json`; Kite access token must be pasted daily; delayed data limits automation; the learning module does not predict profit and can overfit.
