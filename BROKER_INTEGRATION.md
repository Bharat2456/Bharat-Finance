# Broker integration

**The hosted site never connects to a broker.** Its Broker tool can build a review-only order ticket you place yourself in your broker's app.

**The Local Edition** (a program on your own computer) can connect to a broker you configure with your own API keys:

| Adapter | Market | Notes |
|---|---|---|
| Paper | both | built-in simulation on real prices; default |
| Alpaca | US | bracket orders; paper or live endpoint |
| Zerodha Kite Connect | India | market order + SL-M stop; the access token must be pasted again each day |

**All broker adapters are experimental.** They were written from the brokers' public documentation and tested only against mocked HTTP responses, never against a live broker account. Start with the smallest amounts and verify every order in your broker's own app.

Every order, from every mode, passes the local risk gate (kill switch, stop required, per-trade loss, order value, daily loss, trades/day, open positions, reward:risk, blocked symbols, cash, market hours, stale data, no short selling). Live trading additionally needs: the paper-trading period, saved credentials and the typed unlock phrase. Add your own broker via `local/plugins/` (see `plugins/README.md` in the ZIP).

Indian context to check first (not legal advice): SEBI rules on retail algorithmic trading and broker API usage, exchange approvals, your broker's API terms, and whether giving ideas to others requires SEBI registration. This project makes no claim of regulatory compliance.
