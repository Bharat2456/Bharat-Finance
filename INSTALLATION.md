# Installation

Requirements: **Node.js 18+** (any OS). No `npm install` is needed: the project has no dependencies. Python 3.9+ is only needed for the Local Edition and the Python tests.

## Windows (PowerShell)
```powershell
Expand-Archive .\open-source-ai-stock-intelligence-platform.zip -DestinationPath .
cd .\bharat-finance
npm run dev
```
Open http://localhost:5173. Stop with Ctrl+C. `npm run dev` also serves the `api/` data relay, so live prices work locally (needs internet).

## macOS / Linux
```bash
unzip open-source-ai-stock-intelligence-platform.zip && cd bharat-finance
npm run dev
```

## Commands
| Command | Does |
|---|---|
| `npm run dev` | serve `web/` with SPA fallback |
| `npm run build` | validate imports/assets, copy to `dist/` |
| `npm run preview` | serve `dist/` |
| `npm test` | JS tests (reference outputs, engine, storage, adapters, privacy, config) |
| `npm run test:local` | Local Edition (Python) tests |
| `npm run local` | run the Local Edition from source (`python3 local --web web`) |
| `npm run pack:local` | rebuild `web/downloads/bharat-finance-local.zip` (**re-run after changing `web/` or `local/`**) |

The Local Edition for end users is described in `LOCAL_EDITION.md`.

## Editing the Builder page
Name, bio, links and photo live in `web/js/content/builder.js` and `web/assets/builder.jpg`.
