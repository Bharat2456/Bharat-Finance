import os, sys, random, tempfile, datetime as dt
ROOT = os.path.dirname(os.path.dirname(os.path.dirname(os.path.abspath(__file__))))
sys.path.insert(0, os.path.join(ROOT, "local"))
FIX = os.path.join(ROOT, "tests", "fixtures", "yahoo")
NOW = dt.datetime(2026, 10, 19, 15, 0, tzinfo=dt.timezone.utc).timestamp()  # Mon 11:00 EDT: US open


def bars_series(n=80, end_ts=NOW - 86400, seed=3, breakout=False, drift=0.0):
    """Deterministic synthetic DAILY bars for TESTS ONLY (never shown to users)."""
    r = random.Random(seed); p = 100.0; out = []
    for i in range(n):
        p *= 1 + drift + r.uniform(-0.006, 0.006); o = p * (1 + r.uniform(-.002, .002)); h = max(o, p) * 1.004; l = min(o, p) * 0.996
        out.append({"t": int(end_ts - (n - 1 - i) * 86400), "o": o, "h": h, "l": l, "c": p, "v": 1000})
    if breakout:
        hi = max(b["h"] for b in out[-21:-1]); c = hi * 1.02
        out[-1] = {"t": out[-1]["t"], "o": hi, "h": c * 1.003, "l": hi * .999, "c": c, "v": 5000}
    return out


def hist(bars, ts=NOW):
    return {"symbol": "X", "bars": bars, "asOf": ts * 1000, "meta": {"price": bars[-1]["c"]}}


def tmpdir(): return tempfile.mkdtemp(prefix="bf-test-")
