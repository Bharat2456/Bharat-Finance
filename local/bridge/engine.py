"""Automation engine: scans your watchlist with rule-based strategies, sizes trades inside YOUR limits, and (depending on mode)
logs a ticket, asks you to confirm, or places the order. Every order goes through risk.gate(). Nothing runs until you press Start."""
import threading, time, uuid, traceback
from . import risk, learn
from .clock import market_state, local_dt
from .strategies import signal, NAMES, LABELS
from .brokers import REGISTRY, PaperBroker, BrokerError
from .upstream import fetch_chart, UpstreamError

STALE_SEC = 20 * 60
MODES = ("off", "review", "assisted", "auto")


class Engine:
    def __init__(self, store, fetch=None, http=None, clock=time.time):
        self.store, self.fetch, self.http, self.clock = store, fetch or fetch_chart, http, clock
        self.thread = None; self.stop_evt = threading.Event(); self.running = False; self.last_tick = None; self.last_error = None
        self.lock = threading.RLock(); self._qcache = {}

    # ---- helpers
    def cfg(self): return self.store.config()
    def managed(self): return self.store.read("managed.json", {})
    def pending(self): return self.store.read("pending.json", [])
    def learning(self): return self.store.read("learning.json", {"results": {}, "paused": {}})
    def mstate(self, cfg): return market_state(cfg["market"], self.clock(), cfg.get("extra_holidays", []))
    def today(self, cfg): return local_dt(cfg["market"], self.clock()).date().isoformat()

    def paper_days(self):
        s = self.store.read("paper_state.json", None); return len(s["days"]) if s else 0

    def live_ready(self, cfg):
        why = []
        if not cfg.get("live_unlocked"): why.append("Live trading has not been unlocked.")
        if self.paper_days() < cfg["min_paper_days"]: why.append("Complete %d paper-trading days first (you have %d)." % (cfg["min_paper_days"], self.paper_days()))
        if cfg["broker"] not in REGISTRY: why.append("Unknown broker.")
        elif not self.store.secret(cfg["broker"]): why.append("No broker credentials saved.")
        return {"ok": not why, "reasons": why}

    def broker(self, cfg):
        if cfg["target"] == "paper": return PaperBroker(self.store, cfg)
        r = self.live_ready(cfg)
        if not r["ok"]: raise BrokerError(" ".join(r["reasons"]))
        meta = REGISTRY[cfg["broker"]]
        return meta["cls"](self.store.secret(cfg["broker"]), (self.store.read("broker_options.json", {}) or {}).get(cfg["broker"], {"paper": True} if cfg["broker"] == "alpaca" else {}), self.http)

    def quote(self, sym, cfg, ms):
        key = (sym, cfg["market"]); hit = self._qcache.get(key)
        if hit and self.clock() - hit[0] < 15: return hit[1]
        h = self.fetch(sym, cfg["market"], "1d", cfg["exchange"]); m = h.get("meta") or {}
        px = m.get("price") or h["bars"][-1]["c"]; stale = ms["open"] and (self.clock() - h["asOf"] / 1000) > STALE_SEC
        q = {"price": float(px), "asof": h["asOf"] / 1000, "stale": bool(stale), "bars": h["bars"]}; self._qcache[key] = (self.clock(), q); return q

    def completed_bars(self, q, cfg, ms):
        bars = q["bars"]
        if ms["open"] and bars and local_dt(cfg["market"], bars[-1]["t"]).date().isoformat() == self.today(cfg): bars = bars[:-1]
        return bars

    def day_state(self, cfg):
        d = self.store.read("day.json", {}); t = self.today(cfg)
        if d.get("date") != t or d.get("target") != cfg["target"]: d = {"date": t, "target": cfg["target"], "entries": 0}
        return d

    def daily_pnl(self, cfg, prices):
        t = self.today(cfg); realised = sum(x["pnl"] for x in self.store.trades() if x.get("target") == cfg["target"] and x.get("closed_date") == t)
        unreal = sum((prices.get(s, m["entry"]) - m["entry"]) * m["qty"] for s, m in self.managed().items() if m.get("target") == cfg["target"])
        return realised + unreal

    # ---- orders
    def _submit(self, cfg, broker, o, strategy, ms, held, cash, prices, pending_id=None):
        day = self.day_state(cfg); halted = self.daily_pnl(cfg, prices) <= -cfg["limits"]["max_daily_loss"]
        ctx = {"halted": halted, "trades_today": day["entries"], "open_positions": len(self.managed()), "cash": cash, "market_open": ms["open"], "market_reason": ms["reason"], "stale": o.get("stale", False), "held": held}
        g = risk.gate(o, cfg, ctx)
        if not g["pass"]: self.store.log("blocked", "%s %s x%s blocked: %s" % (o["side"], o["symbol"], o["qty"], " ".join(g["reasons"])), symbol=o["symbol"]); return {"ok": False, "reasons": g["reasons"]}
        try: res = broker.place_order(dict(o, market=cfg["market"], exchange=cfg["exchange"], product="CNC"))
        except BrokerError as e: self.store.log("error", "Broker rejected %s %s: %s" % (o["side"], o["symbol"], e), symbol=o["symbol"]); return {"ok": False, "reasons": [str(e)]}
        fill = res.get("fill_price") or o["entry"]
        m = self.managed(); m[o["symbol"]] = {"strategy": strategy, "entry": fill, "stop": o["stop"], "target": o["target"], "qty": o["qty"], "opened": self.clock(), "target_env": cfg["target"], "broker": broker.id,
                                             "exchange_stop": bool(broker.exchange_side_exits and res.get("stop_order_id")), "server_target": bool(getattr(broker, "server_target", False) and res.get("stop_order_id")), "stop_order_id": res.get("stop_order_id"), "order_id": res.get("id")}
        self.store.write("managed.json", m); day["entries"] += 1; self.store.write("day.json", day)
        self.store.log("order", "BUY %s x%d at ~%.2f (stop %.2f, target %.2f) via %s [%s]" % (o["symbol"], o["qty"], fill, o["stop"], o["target"], broker.id, strategy), symbol=o["symbol"], order_id=res.get("id"), target=cfg["target"])
        return {"ok": True, "order": res}

    def _close(self, cfg, broker, sym, m, price, reason):
        try:
            if m.get("stop_order_id") and m.get("exchange_stop"):
                try: broker.cancel(m["stop_order_id"])
                except BrokerError: pass
            res = broker.place_order({"symbol": sym, "side": "sell", "qty": m["qty"], "ref_price": price, "entry": price, "market": cfg["market"], "exchange": cfg["exchange"], "product": "CNC"})
            exit_p = res.get("fill_price") or price
        except BrokerError as e: self.store.log("error", "Could not close %s: %s" % (sym, e), symbol=sym); return False
        self._record(cfg, sym, m, exit_p, reason); return True

    def _record(self, cfg, sym, m, exit_p, reason, approx=False):
        rps = m["entry"] - m["stop"]; pnl = (exit_p - m["entry"]) * m["qty"]; r = (exit_p - m["entry"]) / rps if rps > 0 else None
        self.store.add_trade({"symbol": sym, "strategy": m["strategy"], "qty": m["qty"], "entry": m["entry"], "exit": exit_p, "stop": m["stop"], "target": m["target"], "pnl": pnl, "r": r, "reason": reason,
                              "opened": m["opened"], "closed": self.clock(), "closed_date": self.today(cfg), "target_env": m["target_env"], "target": m["target_env"], "approx": approx})
        mm = self.managed(); mm.pop(sym, None); self.store.write("managed.json", mm)
        self.store.log("close", "Closed %s x%d at %.2f (%s): P&L %.2f (%s R)" % (sym, m["qty"], exit_p, reason, pnl, "%.2f" % r if r is not None else "n/a"), symbol=sym)

    # ---- the loop body
    def tick(self):
        with self.lock:
            cfg = self.cfg(); self.last_tick = self.clock()
            if cfg["kill_switch"]: self.store.log("info", "Kill switch is ON; engine idle."); return {"skipped": "kill switch"}
            if cfg["mode"] == "off": return {"skipped": "mode off"}
            ms = self.mstate(cfg)
            try: broker = self.broker(cfg)
            except BrokerError as e: self.store.log("error", "Cannot start tick: %s" % e); self.last_error = str(e); return {"error": str(e)}
            prices = {}; held = broker.positions() if cfg["mode"] != "review" or cfg["target"] == "paper" else {}
            acct = broker.account(); cash = acct["cash"]
            self._manage(cfg, broker, ms, held, prices)
            if cfg["learning"]["enabled"]:
                paused = learn.live_review(self.store.trades(), cfg); L = self.learning()
                if paused != L.get("paused"): L["paused"] = paused; self.store.write("learning.json", L); [self.store.log("learn", "Paused %s: %s" % (k, v)) for k, v in paused.items()]
            if ms["open"]: self._scan(cfg, broker, ms, held, cash, prices)
            if isinstance(broker, PaperBroker): broker.mark(prices)
            self.expire_pending(cfg); return {"ok": True}

    def _manage(self, cfg, broker, ms, held, prices):
        for sym, m in list(self.managed().items()):
            if m.get("target_env") != cfg["target"]: continue
            try: q = self.quote(sym, cfg, ms)
            except UpstreamError as e: self.store.log("error", "No price for %s: %s" % (sym, e), symbol=sym); continue
            prices[sym] = q["price"]
            if sym not in held: self._record(cfg, sym, m, q["price"], "closed at the broker (stop or target); exit price approximate", approx=True); continue
            if q["price"] <= m["stop"] and not m.get("exchange_stop"): self._close(cfg, broker, sym, m, q["price"], "stop hit")
            elif q["price"] >= m["target"] and not m.get("server_target"): self._close(cfg, broker, sym, m, q["price"], "target hit")

    def _scan(self, cfg, broker, ms, held, cash, prices):
        if cfg["mode"] == "off" or len(self.managed()) >= cfg["limits"]["max_open_positions"]: return
        L = self.learning(); trades = self.store.trades(); pend = {p["symbol"] for p in self.pending()}; placed = 0
        for sym in cfg["watchlist"][:30]:
            if sym in self.managed() or sym in pend or placed >= 2: continue
            try: q = self.quote(sym, cfg, ms)
            except UpstreamError as e: self.store.log("error", "No data for %s: %s" % (sym, e), symbol=sym); continue
            bars = self.completed_bars(q, cfg, ms)
            for name in NAMES:
                sc = cfg["strategies"][name]
                if not sc["enabled"] or name in (L.get("paused") or {}): continue
                s = signal(name, bars, sc)
                if not s: continue
                px = q["price"]
                if px > s["entry"] * 1.01 or px <= s["stop"]: self.store.log("skip", "%s %s signal skipped: price moved away from the signal." % (sym, name), symbol=sym); break
                stop = s["stop"]; target = px + sc["rr"] * (px - stop); mult = learn.risk_multiplier(name, L, trades, cfg)
                if cfg["learning"]["enabled"] and name not in (L.get("results") or {}): self.store.log("learn", "%s has not been back-tested yet; using half size." % LABELS[name])
                qty = risk.size(px, stop, cfg, cash, mult)
                if qty < 1: self.store.log("skip", "%s %s: limits allow zero shares." % (sym, name), symbol=sym); break
                o = {"symbol": sym, "side": "buy", "qty": qty, "entry": px, "ref_price": px, "stop": stop, "target": target, "stale": q["stale"]}
                if cfg["mode"] == "auto":
                    if self._submit(cfg, broker, o, name, ms, held.get(sym, {}).get("qty", 0), cash, prices)["ok"]: placed += 1; cash -= px * qty
                else: self._propose(cfg, o, name); 
                break

    # ---- proposals (review / assisted)
    def _propose(self, cfg, o, strategy):
        p = self.pending(); pid = uuid.uuid4().hex[:8]
        p.append({"id": pid, "symbol": o["symbol"], "strategy": strategy, "label": LABELS[strategy], "qty": o["qty"], "entry": o["entry"], "stop": o["stop"], "target": o["target"], "created": self.clock(), "date": self.today(cfg),
                  "executable": cfg["mode"] == "assisted", "target_env": cfg["target"], "risk": (o["entry"] - o["stop"]) * o["qty"]})
        self.store.write("pending.json", p); self.store.log("proposal", "%s %s: BUY %d near %.2f, stop %.2f, target %.2f" % ("Proposal" if cfg["mode"] == "assisted" else "Review ticket", o["symbol"], o["qty"], o["entry"], o["stop"], o["target"]), symbol=o["symbol"])

    def expire_pending(self, cfg):
        t = self.today(cfg); p = [x for x in self.pending() if x["date"] == t]; self.store.write("pending.json", p)

    def decide(self, pid, approve):
        with self.lock:
            cfg = self.cfg(); p = next((x for x in self.pending() if x["id"] == pid), None)
            if not p: return {"ok": False, "reasons": ["Proposal not found or expired."]}
            rest = [x for x in self.pending() if x["id"] != pid]
            if not approve: self.store.write("pending.json", rest); self.store.log("info", "You rejected %s." % p["symbol"]); return {"ok": True}
            if not p["executable"]: return {"ok": False, "reasons": ["Review-only tickets cannot be executed here. Place it yourself in your broker's app."]}
            if p["target_env"] != cfg["target"]: return {"ok": False, "reasons": ["This proposal was made for a different target (paper/live)."]}
            ms = self.mstate(cfg); broker = self.broker(cfg); q = self.quote(p["symbol"], cfg, ms); px = q["price"]
            if px > p["entry"] * 1.02 or px <= p["stop"]: self.store.write("pending.json", rest); self.store.log("skip", "%s proposal dropped: price moved too far." % p["symbol"]); return {"ok": False, "reasons": ["Price moved more than 2% from the proposal; it was dropped."]}
            o = {"symbol": p["symbol"], "side": "buy", "qty": p["qty"], "entry": px, "ref_price": px, "stop": p["stop"], "target": px + (p["target"] - p["entry"]), "stale": q["stale"]}
            r = self._submit(cfg, broker, o, p["strategy"], ms, 0, broker.account()["cash"], {})
            if r["ok"]: self.store.write("pending.json", rest)
            return r

    # ---- manual actions
    def close_all(self, why="closed by you"):
        with self.lock:
            cfg = self.cfg(); ms = self.mstate(cfg); broker = self.broker(cfg); n = 0
            for sym, m in list(self.managed().items()):
                if m.get("target_env") != cfg["target"]: continue
                if self._close(cfg, broker, sym, m, self.quote(sym, cfg, ms)["price"], why): n += 1
            return n

    # ---- learning
    def run_learning(self):
        cfg = self.cfg(); syms = cfg["watchlist"][:30]
        if len(syms) < 3: raise ValueError("Add at least 3 symbols to your watchlist so there is enough history to test on.")
        hist = {}
        for s in syms:
            try: hist[s] = self.fetch(s, cfg["market"], "1d", cfg["exchange"])["bars"]
            except UpstreamError as e: self.store.log("error", "Learning: no data for %s (%s)" % (s, e))
        hist = {k: v for k, v in hist.items() if len(v) >= 150}
        if len(hist) < 3: raise ValueError("Need at least 3 symbols with 150+ daily bars; got %d." % len(hist))
        L = self.learning(); results = {}
        for name in NAMES:
            r = learn.optimise(name, hist, cfg.get("cost_bps", 10)); results[name] = r
            self.store.log("learn", "%s: %s (test expectancy %s over %s trades)" % (LABELS[name], r["reason"], "%.2fR" % r["test"]["expectancy"] if r.get("test") and r["test"]["expectancy"] is not None else "n/a", r["test"]["n"] if r.get("test") else 0))
            if r.get("edge") and r.get("params"): cfg["strategies"][name].update(r["params"])
        L["results"] = results; L["updated"] = self.clock(); self.store.write("learning.json", L); self.store.save_config(cfg); return results

    # ---- thread
    def start(self):
        with self.lock:
            if self.running: return
            self.stop_evt.clear(); self.running = True; self.thread = threading.Thread(target=self._loop, daemon=True); self.thread.start(); self.store.log("info", "Automation started.")

    def stop(self):
        self.running = False; self.stop_evt.set(); self.store.log("info", "Automation stopped.")

    def _loop(self):
        while self.running:
            try: self.tick(); self.last_error = None
            except Exception as e: self.last_error = str(e); self.store.log("error", "Tick failed: %s" % e, trace=traceback.format_exc()[-600:])
            self.stop_evt.wait(max(15, self.cfg()["interval_sec"]))

    def status(self):
        cfg = self.cfg(); ms = self.mstate(cfg); prices = {}
        info = {"running": self.running, "last_tick": self.last_tick, "last_error": self.last_error, "market": ms, "paper_days": self.paper_days(), "live": self.live_ready(cfg), "pending": self.pending(), "managed": self.managed()}
        try:
            b = self.broker(cfg); info["account"] = b.account(); info["positions"] = b.positions()
        except Exception as e: info["account"] = None; info["broker_error"] = str(e)
        tr = [t for t in self.store.trades() if t.get("target_env") == cfg["target"]]
        info["stats"] = learn._stats([t["r"] for t in tr if t.get("r") is not None]); info["pnl_total"] = sum(t["pnl"] for t in tr); info["trades"] = tr[-20:][::-1]
        return info
