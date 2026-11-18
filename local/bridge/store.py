"""All persistent state lives in one local folder (default: ./data). JSON files, written atomically."""
import json, os, tempfile, threading, time, copy

DEFAULTS = {
    "market": "US", "exchange": "NSE", "mode": "off", "target": "paper", "broker": "alpaca", "watchlist": [],
    "interval_sec": 60, "min_paper_days": 5, "live_unlocked": False, "kill_switch": False, "cost_bps": 10, "extra_holidays": [],
    "limits": {"currency": "USD", "start_cash": 10000, "max_loss_per_trade": 50, "max_daily_loss": 150, "max_order_value": 2000,
              "max_trades_per_day": 3, "max_open_positions": 3, "require_stop": True, "min_reward_risk": 1.5, "blocked": []},
    "strategies": {"breakout20": {"enabled": True, "rr": 2.0, "atr_mult": 2.0},
                   "rsi_bounce": {"enabled": False, "rr": 1.5, "atr_mult": 1.5, "rsi_max": 30},
                   "trend_follow": {"enabled": False, "rr": 2.0, "atr_mult": 2.0}},
    "learning": {"enabled": True, "pause_below_r": -0.2, "min_trades_review": 10},
}


def default_limits(market):
    if market == "IN":
        return {"currency": "INR", "start_cash": 100000, "max_loss_per_trade": 500, "max_daily_loss": 1500, "max_order_value": 20000,
                "max_trades_per_day": 3, "max_open_positions": 3, "require_stop": True, "min_reward_risk": 1.5, "blocked": []}
    return copy.deepcopy(DEFAULTS["limits"])


def _merge(base, over):
    out = copy.deepcopy(base)
    for k, v in (over or {}).items():
        out[k] = _merge(out[k], v) if isinstance(v, dict) and isinstance(out.get(k), dict) else v
    return out


class Store:
    def __init__(self, root):
        self.root = os.path.abspath(root); os.makedirs(self.root, exist_ok=True); self.lock = threading.RLock()

    def _p(self, name): return os.path.join(self.root, name)

    def read(self, name, default=None):
        with self.lock:
            try:
                with open(self._p(name), encoding="utf-8") as f: return json.load(f)
            except (FileNotFoundError, ValueError): return copy.deepcopy(default)

    def write(self, name, obj, private=False):
        with self.lock:
            fd, tmp = tempfile.mkstemp(dir=self.root, suffix=".tmp")
            with os.fdopen(fd, "w", encoding="utf-8") as f: json.dump(obj, f, indent=1)
            if private:
                try: os.chmod(tmp, 0o600)
                except OSError: pass
            os.replace(tmp, self._p(name))

    # config
    def config(self): return _merge(DEFAULTS, self.read("config.json", {}))
    def save_config(self, cfg): self.write("config.json", cfg)

    # logs
    def log(self, kind, msg, **data):
        rec = {"ts": time.time(), "kind": kind, "msg": msg}; rec.update(data)
        with self.lock, open(self._p("log.jsonl"), "a", encoding="utf-8") as f: f.write(json.dumps(rec) + "\n")
        return rec

    def tail_log(self, n=100):
        try:
            with open(self._p("log.jsonl"), encoding="utf-8") as f: lines = f.readlines()[-n:]
        except FileNotFoundError: return []
        out = []
        for ln in lines:
            try: out.append(json.loads(ln))
            except ValueError: pass
        return out[::-1]

    def add_trade(self, t):
        with self.lock, open(self._p("trades.jsonl"), "a", encoding="utf-8") as f: f.write(json.dumps(t) + "\n")

    def trades(self):
        try:
            with open(self._p("trades.jsonl"), encoding="utf-8") as f: rows = [json.loads(x) for x in f if x.strip()]
        except FileNotFoundError: return []
        return rows

    # secrets (plain JSON, file mode 600 where the OS supports it; NOT encrypted: documented)
    def secret(self, broker): return (self.read("credentials.json", {}) or {}).get(broker, {})
    def set_secret(self, broker, fields):
        allc = self.read("credentials.json", {}) or {}; allc[broker] = {k: str(v) for k, v in fields.items() if str(v).strip()}; self.write("credentials.json", allc, private=True)
    def secret_flags(self, broker): return {k: True for k in self.secret(broker)}
    def clear_secrets(self):
        try: os.remove(self._p("credentials.json"))
        except FileNotFoundError: pass
