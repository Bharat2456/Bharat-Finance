"""Rule-based strategies on COMPLETED daily bars. Deterministic; no ML. A signal describes what price already did; it is not a forecast."""
from .indicators import sma, rsi, atr

NAMES = ("breakout20", "rsi_bounce", "trend_follow")
LABELS = {"breakout20": "20-day breakout", "rsi_bounce": "Oversold bounce", "trend_follow": "Trend: 20-day average reclaim"}


def signal(name, bars, p):
    """Return {'entry','stop','target'} or None. bars: oldest-first dicts with o,h,l,c,v."""
    if len(bars) < 55: return None
    closes = [b["c"] for b in bars]; last = bars[-1]; a = atr(bars)
    if not a: return None
    entry = last["c"]; fire = False
    if name == "breakout20":
        hi = max(b["h"] for b in bars[-21:-1]); vols = [b["v"] for b in bars[-21:-1] if b["v"]]
        fire = last["c"] > hi and (not vols or not last["v"] or last["v"] >= sum(vols) / len(vols))
    elif name == "rsi_bounce":
        r = rsi(closes[:-1]); fire = r is not None and r < p.get("rsi_max", 30) and closes[-1] > closes[-2]
    elif name == "trend_follow":
        s20, s50, p20 = sma(closes, 20), sma(closes, 50), sma(closes[:-1], 20)
        fire = s20 is not None and s50 is not None and p20 is not None and closes[-2] <= p20 and closes[-1] > s20 and s20 > s50
    if not fire: return None
    stop = entry - p.get("atr_mult", 2.0) * a
    if stop <= 0 or stop >= entry: return None
    return {"entry": entry, "stop": stop, "target": entry + p.get("rr", 2.0) * (entry - stop)}
