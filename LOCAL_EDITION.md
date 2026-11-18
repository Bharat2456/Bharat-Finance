# Local Edition

A program you run on your own computer. Same name, UI and Builder page as the hosted site, plus **Live Trading**.

## Get it
Download from the site's **Local Edition** page (`/local`), or build it yourself: `npm run pack:local`.
Extract, then **Windows:** double-click `start.bat` · **macOS/Linux:** `./start.sh`. Opens http://127.0.0.1:8765.

`start.bat` first checks for Python 3.9+ (`py`, `python`, `python3`). If found, it is used and nothing is downloaded. If not, it asks, then installs from winget or python.org. Nothing else is installed (standard library only).

## What runs where
- Browser UI: served from the ZIP's `web/` folder.
- `bridge/` (Python): serves `/api/*` (real, delayed Yahoo data fetched from your computer), `/api/live/*`, runs the engine, risk gate, brokers and learning. Binds to 127.0.0.1 only.
- `data/`: config, credentials (**plain text**), logs, trade records, paper state. Delete to erase.

## Trading flow
1. **Paper first.** Pick market and watchlist, set limits, choose Review / Assisted / Automated, press Start. Simulated account, real prices.
2. **Learning.** Back-tests the three rule-based strategies on your watchlist with a 70/30 walk-forward split; a strategy gets full size only with positive results on unseen data and no recent losing streak, otherwise half size; poor recent results pause it. It can never raise your limits. No profit is promised; overfitting and changing markets are real.
3. **Live.** Requires ≥ `min_paper_days` paper days, saved credentials and the typed phrase `I UNDERSTAND THE RISKS`. Kill switch stops everything. Programs must stay running; it never starts by itself.
4. **Limits enforced on every order:** stop required, max loss per trade, order value, daily loss halt, trades per day, open positions, reward:risk, blocked symbols, cash, market open, fresh data, no short selling.

## Strategies
Breakout (20-day), RSI bounce, trend follow (20-day average reclaim) on completed daily bars. Decisions are rule-based; no AI model chooses orders.

## Honest status
- Broker adapters (Alpaca, Kite) are **experimental**: built from public docs, tested with mocked HTTP only.
- Live Yahoo access and `start.bat` on Windows were not tested by the author in the build environment.
- Delayed data limits what automation can do. India calendar is partial. Kite tokens must be pasted daily.
- Check SEBI/exchange rules and your broker's API terms before automating real orders in India. No compliance claim is made.
