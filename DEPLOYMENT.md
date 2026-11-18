# Deployment (GitHub + Vercel)

```powershell
cd bharat-finance
git init
git add .
git commit -m "Bharat Finance"
git branch -M main
git remote add origin https://github.com/<you>/bharat-finance.git
git push -u origin main
```
Then at vercel.com: **Add New → Project → import the repo**. Settings (also in `vercel.json`): Framework **Other**, Build command `npm run build`, Output directory `dist`, Install command none. Deploy; Vercel gives you a URL.

CLI alternative: `npx vercel` then `npx vercel --prod`.

- The site is static plus a small serverless data relay in `api/` (`/api/market`, `batch`, `search`, `news`, `sec`, `health`; Node, zero dependencies). Vercel detects `api/*.js` automatically. Optional env var `SEC_USER_AGENT` (e.g. `Your Name you@example.com`) is recommended for SEC EDGAR requests. Live prices work only where these functions run (Vercel, or `npm run dev` locally); a plain static host shows a clear "no data service" message.
- `vercel.json` rewrites unknown paths (not `/api/`, `/downloads/`, assets) to `/index.html` and adds security headers.
- `web/downloads/bharat-finance-local.zip` is the prebuilt Local Edition (re-run `npm run pack:local` and commit it whenever `web/` or `local/` change; a test checks it matches its manifest).
- Other static hosts show the pages but have no data relay, so live prices need Vercel (or equivalent functions).
- Set the Content-Security-Policy in `web/index.html` if you add a new data/AI host; the policy limits `connect-src`.

## Environment variables (all optional)
- `TWELVEDATA_API_KEY`, `ALPHAVANTAGE_API_KEY`: backup data vendors used only if Yahoo refuses the server.
- `SEC_USER_AGENT`: contact string for SEC EDGAR.

## Checking it works
`/api/health` (should say `edition: hosted`) and `/api/diag` (shows whether Yahoo answers your Vercel region). If Yahoo does not, add a backup key, or set a different function region via `"regions"` in `vercel.json` and redeploy.
