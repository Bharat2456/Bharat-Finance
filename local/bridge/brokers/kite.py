"""Zerodha Kite Connect (India). EXPERIMENTAL: written from Kite Connect's public docs; not verified against the live service.
Kite access tokens expire daily, so paste today's token each morning. Entry = market order, then a separate SL-M stop-loss order."""
from .base import Broker, BrokerError


class KiteBroker(Broker):
    id = "kite"; name = "Zerodha Kite Connect"; exchange_side_exits = True
    base = "https://api.kite.trade"

    def _h(self):
        if not self.creds.get("api_key") or not self.creds.get("access_token"): raise BrokerError("Enter your Kite API key and today's access token first.")
        return {"X-Kite-Version": "3", "Authorization": "token %s:%s" % (self.creds["api_key"], self.creds["access_token"])}
    def _req(self, m, path, body=None):
        st, j = self.http(m, self.base + path, self._h(), body, form=True)
        if st >= 400 or (isinstance(j, dict) and j.get("status") == "error"): raise BrokerError("Kite answered HTTP %s: %s" % (st, (j.get("message") if isinstance(j, dict) else j) or ""))
        return j.get("data", j) if isinstance(j, dict) else j
    def test(self):
        d = self._req("GET", "/user/margins/equity"); return {"ok": True, "message": "Connected to Kite. Available cash: %s." % (d.get("available", {}).get("cash"))}
    def account(self):
        d = self._req("GET", "/user/margins/equity"); cash = float(d.get("available", {}).get("cash", 0)); return {"cash": cash, "equity": float(d.get("net", cash)), "currency": "INR"}
    def positions(self):
        d = self._req("GET", "/portfolio/positions"); return {p["tradingsymbol"]: {"qty": int(p["quantity"]), "avg": float(p["average_price"])} for p in d.get("net", []) if int(p.get("quantity", 0)) > 0}
    def _order(self, o, kind, side, **extra):
        body = {"tradingsymbol": o["symbol"], "exchange": o.get("exchange", "NSE"), "transaction_type": side, "order_type": kind, "quantity": o["qty"], "product": o.get("product", "CNC"), "validity": "DAY"}; body.update(extra)
        return self._req("POST", "/orders/regular", body)
    def place_order(self, o):
        r = self._order(o, "MARKET", "BUY" if o["side"] == "buy" else "SELL"); sid = None
        if o["side"] == "buy" and o.get("stop"):
            sid = self._order(o, "SL-M", "SELL", trigger_price=round(o["stop"] / 0.05) * 0.05).get("order_id")
        return {"id": r.get("order_id"), "fill_price": None, "stop_order_id": sid}
    def cancel(self, order_id): self._req("DELETE", "/orders/regular/%s" % order_id); return True
