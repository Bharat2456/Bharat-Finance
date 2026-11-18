# Paper trading

Simulation only; simulated money; labelled everywhere.
- **Fills:** market orders fill at the quote adjusted by modelled half-spread and slippage; limit orders fill only if price trades through; volume limits cause partial fills (10% participation).
- **Costs:** India (brokerage, STT, exchange fees, SEBI fee, GST, stamp duty) and US (SEC, TAF) with editable default rates. They approximate public fee schedules and are **not** your broker's charges.
- **Risk gate:** kill switch, duplicate-order window, stop required, max loss per trade, daily loss, order/position/exposure caps, minimum reward:risk, lot size, entry window, market hours, blocked symbols.
- **Bars:** when a stop and target are inside one bar the stop wins (conservative).
- **Currency:** instrument currency ≠ account currency needs an FX rate; otherwise the order is rejected.
- **Prices:** real, usually delayed Yahoo Finance data; there is no bundled or synthetic data. The Local Edition also paper-trades automatically on your watchlist (see `LOCAL_EDITION.md`) and that paper record is what unlocks live trading.
- **AI modes:** analyse (explain only), suggest (rule-based proposals you approve), auto (rule-based, still through the risk gate; paper only).
- Not modelled: queue position, market impact, circuit limits, margin, short selling, corporate actions.
