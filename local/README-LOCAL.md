# Bharat Finance — Local Edition

Runs entirely on your own computer. No account, no analytics, no third-party servers of ours.

## Start
- **Windows:** double-click `start.bat`. If Python 3.9+ is missing it asks first, then installs it from the official source.
- **macOS / Linux:** `./start.sh` (needs Python 3.9+).
- Your browser opens at http://127.0.0.1:8765. Close the window (or press Ctrl+C) to stop.

The only dependency is Python's standard library. Nothing is downloaded after that, except the market data your own computer requests.

## Where things are stored
Everything is in the `data/` folder next to this file: settings, your broker keys (`credentials.json`, **plain text**, not encrypted), trade records and the activity log. Delete the folder to erase it all. Never share it.

## Real data
Prices come from Yahoo Finance's unofficial public endpoints through this program (`/api/*` on 127.0.0.1). They are usually **delayed** and have no service guarantee. If a request fails, the app says so; it never substitutes made-up data. Optional: put your own Alpha Vantage / Twelve Data key in Settings → Market data.

## Live Trading page (App → Live Trading)
1. Starts in **paper** mode with a simulated account on real prices.
2. Add your own broker API keys (Alpaca for the US; Zerodha Kite for India — token pasted daily). **Never enter a broker password or UPI PIN.**
3. Live needs: ≥ 5 paper days (configurable), saved credentials, and typing the unlock phrase.
4. All safety limits are enforced in this program on every order. The kill switch stops everything. The adaptive module can only reduce size or pause a strategy.
5. Automation only runs while the program is open and after you press Start.

**Risk.** You can lose money, including more than you expected through gaps, delayed data, bugs or broker problems. Broker adapters are experimental and not verified against live services by the author. In India, automated order placement via APIs may be subject to SEBI/exchange rules and your broker's terms: check them. This is not investment advice.

## Add a broker
See `plugins/README.md`.
