# Market data

The app uses **real market data only**. There is no demo or synthetic data anywhere. If data cannot be fetched, the app shows an error instead.

| Provider | Key | How |
|---|---|---|
| **Live (default)** | none | Same-origin `/api/*` relay → Yahoo Finance's *unofficial* public endpoints. Hosted: Vercel functions in `api/`. Local Edition: the Python program on your computer. |
| Alpha Vantage | yours | called from the browser; free-tier limits apply |
| Twelve Data | yours | called from the browser |
| Custom endpoint | – | your own server returning `{bars:[{t,o,h,l,c,v}]}` |

**Why a relay:** browsers cannot call Yahoo directly (CORS). The relay is a plain same-origin function; CORS is not bypassed and no third-party proxy is used.

**If Yahoo refuses the hosted site.** Yahoo sometimes blocks cloud servers. The relay tries both Yahoo hosts with a browser-style session (including the cookie/crumb handshake), then falls back to a licensed vendor **only if you configured a key**. Set these in Vercel → Settings → Environment Variables (server-side only, never sent to visitors): `TWELVEDATA_API_KEY` (US + India, all intervals) and/or `ALPHAVANTAGE_API_KEY` (daily/weekly/monthly). Free tiers are rate-limited, so they are a backup, not the main source. Open `/api/diag` on your site to see exactly what Yahoo answers to your deployment and which backups are configured. If every source fails, each browser shows the last real data it loaded, labelled "SAVED COPY from …", never synthetic data.

**Honest limits:** Yahoo data is unofficial, usually **delayed** (labelled "LIVE · DELAYED"), can change or be rate-limited without notice, and is not an exchange feed. Automation on delayed data has real limitations; the engine refuses to trade when data looks stale. Symbols: US tickers; India `.NS` (NSE) / `.BO` (BSE). Intervals: 1m (5d), 5m/15m/30m (60d), 1h (730d), 1d (2y), 1w (10y), 1M (max).
The India holiday calendar is partial (weekends, fixed dates and holidays you add), so treat "market open" as approximate.

There is no free *official* NSE/BSE real-time feed; those are licensed. For official Indian quotes use your own broker's API in the Local Edition.
