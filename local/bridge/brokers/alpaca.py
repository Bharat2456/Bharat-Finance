"""Alpaca Markets (US). EXPERIMENTAL: written from Alpaca's public REST docs; not verified against the live service by the author.
Entries are sent as bracket orders so the stop and target live at the broker, not just in this program."""
from .base import Broker, BrokerError


class AlpacaBroker(Broker):
    id = "alpaca"; name = "Alpaca"; exchange_side_exits = True; server_target = True

    @property
    def base(self): return "https://paper-api.alpaca.markets" if self.options.get("paper", True) else "https://api.alpaca.markets"
    def _h(self):
        if not self.creds.get("key_id") or not self.creds.get("secret"): raise BrokerError("Enter your Alpaca API key ID and secret first.")
        return {"APCA-API-KEY-ID": self.creds["key_id"], "APCA-API-SECRET-KEY": self.creds["secret"]}
    def _req(self, m, path, body=None):
        st, j = self.http(m, self.base + path, self._h(), body)
        if st >= 400: raise BrokerError("Alpaca answered HTTP %s: %s" % (st, (j.get("message") if isinstance(j, dict) else j) or ""))
        return j
    def test(self):
        a = self._req("GET", "/v2/account"); return {"ok": True, "message": "Connected to Alpaca (%s). Status: %s." % ("paper" if self.options.get("paper", True) else "LIVE", a.get("status"))}
    def account(self):
        a = self._req("GET", "/v2/account"); return {"cash": float(a["cash"]), "equity": float(a["equity"]), "currency": a.get("currency", "USD")}
    def positions(self): return {p["symbol"]: {"qty": int(float(p["qty"])), "avg": float(p["avg_entry_price"])} for p in self._req("GET", "/v2/positions")}
    def place_order(self, o):
        body = {"symbol": o["symbol"], "qty": str(o["qty"]), "side": o["side"], "type": "market", "time_in_force": "day"}
        if o["side"] == "buy" and o.get("stop") and o.get("target"):
            body.update({"order_class": "bracket", "take_profit": {"limit_price": str(round(o["target"], 2))}, "stop_loss": {"stop_price": str(round(o["stop"], 2))}})
        r = self._req("POST", "/v2/orders", body)
        return {"id": r.get("id"), "fill_price": None, "stop_order_id": r.get("id") if "order_class" in body else None}
    def cancel(self, order_id): self._req("DELETE", "/v2/orders/%s" % order_id); return True
