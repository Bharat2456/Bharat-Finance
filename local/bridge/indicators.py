"""Small, dependency-free indicators used by the strategies and the back-tester."""
def sma(xs, n):
    return None if len(xs) < n else sum(xs[-n:]) / n

def rsi(closes, n=14):
    if len(closes) < n + 1: return None
    gains = losses = 0.0
    for i in range(1, n + 1):
        d = closes[i] - closes[i - 1]; gains += max(d, 0); losses += max(-d, 0)
    ag, al = gains / n, losses / n
    for i in range(n + 1, len(closes)):
        d = closes[i] - closes[i - 1]; ag = (ag * (n - 1) + max(d, 0)) / n; al = (al * (n - 1) + max(-d, 0)) / n
    return 100.0 if al == 0 else 100 - 100 / (1 + ag / al)

def atr(bars, n=14):
    if len(bars) < n + 1: return None
    trs = [max(b["h"] - b["l"], abs(b["h"] - bars[i]["c"]), abs(b["l"] - bars[i]["c"])) for i, b in enumerate(bars[1:])]
    a = sum(trs[:n]) / n
    for t in trs[n:]: a = (a * (n - 1) + t) / n
    return a
