"""The safety gate. Every order, from every mode, passes through gate() inside this program; the web page cannot bypass it."""
import math


def gate(o, cfg, ctx):
    """o: {symbol, side, qty, entry, stop, target}. ctx: {halted, trades_today, open_positions, cash, market_open, market_reason, stale, held}.
    Returns {'pass': bool, 'reasons': [...]}. Sells that reduce an existing position only need the kill switch and a valid quantity."""
    L, why = cfg["limits"], []
    side, qty, entry, stop, target = o["side"], o["qty"], o["entry"], o.get("stop"), o.get("target")
    if cfg.get("kill_switch"): why.append("Kill switch is ON.")
    if not isinstance(qty, int) or qty <= 0: why.append("Quantity must be a whole number above zero.")
    if not (isinstance(entry, (int, float)) and entry > 0 and math.isfinite(entry)): why.append("No valid price.")
    if why: return {"pass": False, "reasons": why}
    if side == "sell":
        if qty > ctx.get("held", 0): why.append("Cannot sell more than you hold (no short selling).")
        return {"pass": not why, "reasons": why}
    if o["symbol"].upper() in {b.upper() for b in L.get("blocked", [])}: why.append("%s is on your blocked list." % o["symbol"])
    if ctx.get("halted"): why.append("Daily loss limit reached: no new entries today.")
    if not ctx.get("market_open"): why.append("Market is closed (%s)." % ctx.get("market_reason", ""))
    if ctx.get("stale"): why.append("Price data looks stale; refusing to trade on it.")
    if L.get("require_stop", True) and not stop: why.append("A stop is required on every buy.")
    if stop:
        if stop >= entry: why.append("Stop must be below the entry price.")
        else:
            risk = (entry - stop) * qty
            if risk > L["max_loss_per_trade"] * 1.0001: why.append("Loss if stopped (%.2f) exceeds your per-trade limit (%.2f)." % (risk, L["max_loss_per_trade"]))
            if target and (target - entry) / (entry - stop) < L["min_reward_risk"]: why.append("Reward:risk %.2f is below your minimum %.2f." % ((target - entry) / (entry - stop), L["min_reward_risk"]))
    if entry * qty > L["max_order_value"] * 1.0001: why.append("Order value %.2f exceeds your limit %.2f." % (entry * qty, L["max_order_value"]))
    if entry * qty > ctx.get("cash", 0): why.append("Not enough cash (%.2f needed, %.2f available)." % (entry * qty, ctx.get("cash", 0)))
    if ctx.get("trades_today", 0) >= L["max_trades_per_day"]: why.append("Max new trades for today reached.")
    if ctx.get("open_positions", 0) >= L["max_open_positions"]: why.append("Max open positions reached.")
    return {"pass": not why, "reasons": why}


def size(entry, stop, cfg, cash, risk_mult=1.0):
    """Whole shares: the smallest of risk budget / risk per share, max order value, and cash."""
    L = cfg["limits"]; rps = entry - stop
    if rps <= 0 or entry <= 0: return 0
    return max(0, int(min(math.floor(L["max_loss_per_trade"] * risk_mult / rps), math.floor(L["max_order_value"] / entry), math.floor(cash / entry))))
