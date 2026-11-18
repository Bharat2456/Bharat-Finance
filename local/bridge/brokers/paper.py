"""Local simulated broker (no network). Used for the paper-trading period that must precede any live unlock."""
import time, uuid
from .base import Broker, BrokerError
from ..clock import local_dt


class PaperBroker(Broker):
    id = "paper"; name = "Paper (simulated)"; exchange_side_exits = False
    SLIP_BPS = 5

    def __init__(self, store, cfg):
        super().__init__(); self.store, self.cfg = store, cfg
        self.s = store.read("paper_state.json", None) or {"cash": float(cfg["limits"]["start_cash"]), "start_cash": float(cfg["limits"]["start_cash"]), "positions": {}, "days": [], "orders": 0}

    def _save(self): self.store.write("paper_state.json", self.s)
    def test(self): return {"ok": True, "message": "Paper broker is local and always available."}
    def account(self): return {"cash": self.s["cash"], "equity": self.s["cash"] + sum(p["qty"] * p.get("last", p["avg"]) for p in self.s["positions"].values()), "currency": self.cfg["limits"]["currency"]}
    def positions(self): return {k: {"qty": v["qty"], "avg": v["avg"]} for k, v in self.s["positions"].items()}
    def mark(self, prices):
        for k, p in self.s["positions"].items():
            if k in prices: p["last"] = prices[k]
        self._save()
    def days_traded(self): return len(self.s["days"])

    def place_order(self, o):
        px, q, bps = o["ref_price"], o["qty"], self.cfg.get("cost_bps", 10)
        if o["side"] == "buy":
            fill = px * (1 + self.SLIP_BPS / 1e4); cost = fill * q * (1 + bps / 1e4)
            if cost > self.s["cash"]: raise BrokerError("Insufficient paper cash.")
            self.s["cash"] -= cost; pos = self.s["positions"].get(o["symbol"], {"qty": 0, "avg": 0.0})
            tot = pos["qty"] + q; pos["avg"] = (pos["avg"] * pos["qty"] + fill * q) / tot; pos["qty"] = tot; pos["last"] = px; self.s["positions"][o["symbol"]] = pos
        else:
            pos = self.s["positions"].get(o["symbol"])
            if not pos or pos["qty"] < q: raise BrokerError("Cannot sell more than held.")
            fill = px * (1 - self.SLIP_BPS / 1e4); self.s["cash"] += fill * q * (1 - bps / 1e4); pos["qty"] -= q
            if pos["qty"] == 0: del self.s["positions"][o["symbol"]]
        day = local_dt(o.get("market", "US"), time.time()).date().isoformat()
        if day not in self.s["days"]: self.s["days"].append(day)
        self.s["orders"] += 1; self._save()
        return {"id": "paper-" + uuid.uuid4().hex[:8], "fill_price": fill, "stop_order_id": None}

    def cancel(self, order_id): return True
