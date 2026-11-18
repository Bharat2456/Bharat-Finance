"""Adaptive module: walk-forward back-tests and a live performance review. It adjusts STRATEGY settings only, within the user's limits.
It can pause a strategy or lower position size; it can never raise a risk limit. Past results do not predict future results."""
import itertools, time
from .strategies import signal, NAMES

GRIDS = {"breakout20": {"rr": (1.5, 2.0, 3.0), "atr_mult": (1.5, 2.0, 3.0)},
         "rsi_bounce": {"rr": (1.5, 2.0), "atr_mult": (1.5, 2.0), "rsi_max": (25, 30, 35)},
         "trend_follow": {"rr": (1.5, 2.0, 3.0), "atr_mult": (1.5, 2.0, 3.0)}}


def backtest(name, params, bars, cost_bps=10, max_hold=15, start=55, end=None):
    """Signal at a close, enter at the NEXT open, stop checked before target in each bar, time-exit at close after max_hold bars.
    Returns a list of trades with r (R multiple, net of round-trip costs)."""
    out, i, end = [], start, end or len(bars)
    while i < end - 1:
        s = signal(name, bars[: i + 1], params)
        if not s: i += 1; continue
        entry = bars[i + 1]["o"]; stop = s["stop"]; rps = entry - stop
        if rps <= 0 or entry <= 0 or entry <= stop: i += 1; continue
        target = entry + params.get("rr", 2.0) * rps; exit_p, j = None, i + 1
        for j in range(i + 1, min(i + 1 + max_hold, len(bars))):
            b = bars[j]
            if b["l"] <= stop: exit_p = min(stop, b["o"]); break          # stop first; gap-down fills at the open
            if b["h"] >= target: exit_p = max(target, b["o"]) if b["o"] >= target else target; break
        if exit_p is None: exit_p = bars[j]["c"]
        cost = entry * cost_bps / 1e4 * 2
        out.append({"r": (exit_p - entry - cost) / rps, "i": i, "bars": j - i}); i = j + 1
    return out


def _stats(rs):
    n = len(rs)
    if not n: return {"n": 0, "expectancy": None, "win_rate": None, "avg_win": None, "avg_loss": None}
    w = [r for r in rs if r > 0]; l = [r for r in rs if r <= 0]
    return {"n": n, "expectancy": sum(rs) / n, "win_rate": len(w) / n, "avg_win": sum(w) / len(w) if w else 0.0, "avg_loss": sum(l) / len(l) if l else 0.0}


def optimise(name, histories, cost_bps=10, split=0.7, min_train=15, min_test=15):
    """histories: {symbol: [bars]}. Choose parameters on the first 70% of each history, report on the unseen last 30%."""
    grid = GRIDS[name]; keys = list(grid); best = None; tried = 0
    for combo in itertools.product(*[grid[k] for k in keys]):
        p = dict(zip(keys, combo)); tr = []
        for bars in histories.values():
            cut = int(len(bars) * split); tr += [t["r"] for t in backtest(name, p, bars[:cut], cost_bps)]
        tried += 1; st = _stats(tr)
        if st["n"] >= min_train and (best is None or st["expectancy"] > best[1]["expectancy"]): best = (p, st)
    if not best: return {"strategy": name, "params": None, "edge": False, "reason": "Too few signals in the training window to choose settings.", "tried": tried, "ts": time.time()}
    p, trn = best; te = []
    for bars in histories.values():
        cut = int(len(bars) * split); te += [t["r"] for t in backtest(name, p, bars, cost_bps, start=max(cut, 55))]
    tst = _stats(te); edge = tst["n"] >= min_test and tst["expectancy"] is not None and tst["expectancy"] > 0.05
    why = "Positive expectancy on unseen data." if edge else ("Too few out-of-sample trades." if tst["n"] < min_test else "No positive edge on unseen data.")
    return {"strategy": name, "params": p, "train": trn, "test": tst, "edge": edge, "reason": why, "tried": tried, "symbols": len(histories), "ts": time.time()}


def live_review(trades, cfg):
    """Pause strategies whose recent closed trades lose money on average. Returns {strategy: reason}."""
    L, paused = cfg["learning"], {}
    for name in NAMES:
        rs = [t["r"] for t in trades if t.get("strategy") == name and t.get("r") is not None][-20:]
        if len(rs) >= L["min_trades_review"] and sum(rs) / len(rs) < L["pause_below_r"]:
            paused[name] = "Average result of the last %d trades is %.2fR (below %.2fR)." % (len(rs), sum(rs) / len(rs), L["pause_below_r"])
    return paused


def risk_multiplier(name, learning, trades, cfg):
    """1.0 only when this strategy has a confirmed out-of-sample edge AND is not currently losing; otherwise 0.5. Never above 1.0."""
    if not cfg["learning"]["enabled"]: return 1.0
    res = (learning.get("results") or {}).get(name)
    rs = [t["r"] for t in trades if t.get("strategy") == name and t.get("r") is not None][-10:]
    return 1.0 if (res and res.get("edge") and (not rs or sum(rs) / len(rs) >= 0)) else 0.5
