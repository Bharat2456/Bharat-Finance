"""Local web server: static app + market-data relay + live-trading API. Binds to 127.0.0.1 only."""
import argparse, json, mimetypes, os, sys, threading, time, urllib.parse, webbrowser
from http.server import BaseHTTPRequestHandler, ThreadingHTTPServer
from . import VERSION, upstream
from .brokers import REGISTRY, load_plugins, BrokerError
from .engine import Engine, MODES
from .store import Store, default_limits
from .strategies import LABELS, NAMES

PHRASE = "I UNDERSTAND THE RISKS"
NUM = {"limits": ("start_cash", "max_loss_per_trade", "max_daily_loss", "max_order_value", "max_trades_per_day", "max_open_positions", "min_reward_risk"),
       "top": ("interval_sec", "min_paper_days", "cost_bps")}


def apply_config(store, patch):
    """Validate and merge a settings patch. Unknown keys are ignored. Raises ValueError with a readable message."""
    cfg = store.config()
    if "market" in patch and patch["market"] in ("US", "IN") and patch["market"] != cfg["market"]:
        cfg["market"] = patch["market"]; cfg["limits"] = default_limits(patch["market"]); cfg["watchlist"] = []; cfg["broker"] = "kite" if patch["market"] == "IN" else "alpaca"
    if patch.get("exchange") in ("NSE", "BSE"): cfg["exchange"] = patch["exchange"]
    if patch.get("mode") in MODES:
        cfg["mode"] = patch["mode"]
    if patch.get("target") in ("paper", "live"):
        if patch["target"] == "live":
            e = Engine(store); r = e.live_ready(cfg)
            if not r["ok"]: raise ValueError(" ".join(r["reasons"]))
        cfg["target"] = patch["target"]
    if patch.get("broker") in REGISTRY: cfg["broker"] = patch["broker"]
    for k in NUM["top"]:
        if k in patch:
            v = float(patch[k])
            if v < 0: raise ValueError("%s cannot be negative." % k)
            cfg[k] = int(v) if k != "cost_bps" else v
    if "watchlist" in patch:
        wl = []
        for s in patch["watchlist"]:
            s = str(s).strip().upper()
            if s and upstream.valid_symbol(s) and s not in wl: wl.append(s)
        cfg["watchlist"] = wl[:30]
    if "extra_holidays" in patch: cfg["extra_holidays"] = [str(x)[:10] for x in patch["extra_holidays"]][:60]
    L = patch.get("limits") or {}
    for k in NUM["limits"]:
        if k in L:
            v = float(L[k])
            if v <= 0: raise ValueError("%s must be above zero." % k)
            cfg["limits"][k] = v
    if "blocked" in L: cfg["limits"]["blocked"] = [str(x).strip().upper() for x in L["blocked"] if str(x).strip()]
    if "require_stop" in L:
        if not L["require_stop"] and cfg["target"] == "live": raise ValueError("A stop is mandatory for live trading.")
        cfg["limits"]["require_stop"] = bool(L["require_stop"])
    for name, sc in (patch.get("strategies") or {}).items():
        if name in NAMES:
            for k in ("rr", "atr_mult", "rsi_max"):
                if k in sc: cfg["strategies"][name][k] = float(sc[k])
            if "enabled" in sc: cfg["strategies"][name]["enabled"] = bool(sc["enabled"])
    for k in ("enabled",):
        if k in (patch.get("learning") or {}): cfg["learning"][k] = bool(patch["learning"][k])
    if cfg["mode"] in ("assisted", "auto") and cfg["target"] == "live" and not cfg["limits"]["require_stop"]: raise ValueError("A stop is mandatory for live trading.")
    store.save_config(cfg); return cfg


class App:
    def __init__(self, web, data, port, engine=None):
        self.web, self.port, self.store = os.path.abspath(web), port, Store(data)
        self.engine = engine or Engine(self.store); self.plugins = load_plugins(os.path.join(os.path.dirname(os.path.dirname(os.path.abspath(__file__))), "plugins"))

    # ---- live API
    def state(self):
        cfg = self.store.config(); st = self.engine.status()
        brokers = {k: {"name": v["name"], "market": v["market"], "fields": v["fields"], "options": v["options"], "credentials_set": self.store.secret_flags(k)} for k, v in REGISTRY.items()}
        L = self.engine.learning()
        return {"edition": "local", "version": VERSION, "config": cfg, "brokers": brokers, "status": st, "labels": LABELS, "learning": L, "log": self.store.tail_log(80),
                "broker_options": self.store.read("broker_options.json", {}), "phrase": PHRASE}

    def post(self, path, b):
        s, e = self.store, self.engine
        if path == "config": return {"config": apply_config(s, b.get("patch") or {})}
        if path == "credentials":
            br = b.get("broker")
            if br not in REGISTRY: raise ValueError("Unknown broker.")
            s.set_secret(br, b.get("fields") or {})
            if "options" in b: o = s.read("broker_options.json", {}) or {}; o[br] = {k: bool(v) for k, v in (b["options"] or {}).items()}; s.write("broker_options.json", o)
            s.log("info", "Saved credentials for %s (stored on this computer only)." % br); return {"saved": True}
        if path == "credentials/clear":
            s.clear_secrets(); cfg = s.config(); cfg["target"] = "paper"; cfg["live_unlocked"] = False; s.save_config(cfg); s.log("info", "All broker credentials deleted; live trading locked."); return {"cleared": True}
        if path == "test":
            cfg = s.config(); meta = REGISTRY.get(cfg["broker"])
            if not meta: raise ValueError("Unknown broker.")
            try:
                opts = (s.read("broker_options.json", {}) or {}).get(cfg["broker"], {"paper": True} if cfg["broker"] == "alpaca" else {})
                return meta["cls"](s.secret(cfg["broker"]), opts, e.http).test()
            except BrokerError as ex: return {"ok": False, "message": str(ex)}
        if path == "unlock":
            if (b.get("confirm") or "").strip() != PHRASE: raise ValueError("Type the confirmation phrase exactly to unlock live trading.")
            cfg = s.config(); r = e.live_ready(dict(cfg, live_unlocked=True))
            if not r["ok"]: raise ValueError(" ".join(r["reasons"]))
            cfg["live_unlocked"] = True; s.save_config(cfg); s.log("info", "Live trading UNLOCKED by you."); return {"unlocked": True}
        if path == "lock":
            cfg = s.config(); cfg["live_unlocked"] = False; cfg["target"] = "paper"; cfg["mode"] = "off" if cfg["mode"] == "auto" else cfg["mode"]; s.save_config(cfg); e.stop(); s.log("info", "Live trading locked; engine stopped."); return {"locked": True}
        if path == "kill":
            cfg = s.config(); cfg["kill_switch"] = bool(b.get("on")); s.save_config(cfg); s.log("info", "Kill switch %s." % ("ON" if cfg["kill_switch"] else "off"))
            if cfg["kill_switch"]: e.stop()
            return {"kill_switch": cfg["kill_switch"]}
        if path == "engine":
            if b.get("run"):
                cfg = s.config()
                if cfg["kill_switch"]: raise ValueError("Turn the kill switch off first.")
                if cfg["mode"] == "off": raise ValueError("Choose a mode other than Off first.")
                e.start()
            else: e.stop()
            return {"running": e.running}
        if path == "tick": return e.tick()
        if path == "decide": return e.decide(str(b.get("id")), bool(b.get("approve")))
        if path == "close-all": return {"closed": e.close_all()}
        if path == "learn": return {"results": e.run_learning()}
        if path == "resume":
            L = e.learning(); (L.get("paused") or {}).pop(b.get("strategy"), None); s.write("learning.json", L); return {"ok": True}
        if path == "reset-paper":
            try: os.remove(os.path.join(s.root, "paper_state.json"))
            except FileNotFoundError: pass
            s.log("info", "Paper account reset."); return {"ok": True}
        raise KeyError(path)


def make_handler(app):
    allowed_hosts = {"127.0.0.1:%d" % app.port, "localhost:%d" % app.port}

    class H(BaseHTTPRequestHandler):
        server_version = "BharatFinanceLocal/" + VERSION
        def log_message(self, *a): pass

        def _send(self, status, body, ctype="application/json; charset=utf-8", cache="no-store"):
            raw = body if isinstance(body, bytes) else (body if isinstance(body, str) else json.dumps(body)).encode()
            self.send_response(status); self.send_header("Content-Type", ctype); self.send_header("Cache-Control", cache)
            self.send_header("X-Content-Type-Options", "nosniff"); self.send_header("Referrer-Policy", "no-referrer"); self.send_header("X-Frame-Options", "DENY")
            self.send_header("Content-Length", str(len(raw))); self.end_headers()
            if self.command != "HEAD": self.wfile.write(raw)

        def _guard(self):
            if self.headers.get("Host", "") not in allowed_hosts: self._send(403, {"error": "Forbidden host"}); return False
            o = self.headers.get("Origin")
            if o and urllib.parse.urlparse(o).netloc not in allowed_hosts: self._send(403, {"error": "Forbidden origin"}); return False
            return True

        def do_HEAD(self): self.do_GET()

        def do_GET(self):
            if not self._guard(): return
            u = urllib.parse.urlparse(self.path); p = urllib.parse.unquote(u.path); q = {k: v[0] for k, v in urllib.parse.parse_qs(u.query).items()}
            try:
                if p == "/api/health": return self._send(200, {"ok": True, "edition": "local", "version": VERSION, "data": "yahoo-from-this-computer", "time": int(time.time() * 1000)})
                if p == "/api/live/state": return self._send(200, app.state())
                if p == "/api/market": return self._send(200, upstream.fetch_chart(q.get("symbol", ""), "IN" if q.get("market") == "IN" else "US", q.get("interval", "1d"), q.get("exchange", "NSE")))
                if p == "/api/batch": return self._send(200, {"results": upstream.fetch_batch([x for x in q.get("symbols", "").split(",") if x], "IN" if q.get("market") == "IN" else "US", q.get("interval", "1d"), q.get("exchange", "NSE"))})
                if p == "/api/search": return self._send(200, {"results": upstream.fetch_search(q.get("q", ""), "IN" if q.get("market") == "IN" else "US")})
                if p == "/api/news":
                    mk = "IN" if q.get("market") == "IN" else "US"
                    if not upstream.valid_symbol(q.get("symbol", "")): raise upstream.UpstreamError("Invalid symbol.", "bad-request", 400)
                    return self._send(200, upstream.fetch_feed(q.get("url") or upstream.news_url(q["symbol"], mk)), "application/xml; charset=utf-8")
                if p == "/api/sec": return self._send(200, upstream.fetch_sec(q.get("kind"), q.get("cik")))
                if p.startswith("/api/"): return self._send(404, {"error": "No such API"})
            except upstream.UpstreamError as e: return self._send(e.status, {"error": str(e), "code": e.code})
            except Exception as e: return self._send(500, {"error": "Internal error: %s" % e})
            self._static(p)

        def do_POST(self):
            if not self._guard(): return
            p = urllib.parse.unquote(urllib.parse.urlparse(self.path).path)
            if not p.startswith("/api/live/"): return self._send(404, {"error": "No such API"})
            if "application/json" not in (self.headers.get("Content-Type") or ""): return self._send(415, {"error": "JSON only"})
            try:
                n = int(self.headers.get("Content-Length") or 0)
                if n > 65536: return self._send(413, {"error": "Too large"})
                body = json.loads(self.rfile.read(n) or b"{}")
                self._send(200, app.post(p[len("/api/live/"):], body))
            except (ValueError, KeyError) as e: self._send(400, {"error": str(e) if isinstance(e, ValueError) else "No such action"})
            except BrokerError as e: self._send(502, {"error": str(e)})
            except upstream.UpstreamError as e: self._send(e.status, {"error": str(e)})
            except Exception as e: app.store.log("error", "API error on %s: %s" % (p, e)); self._send(500, {"error": "Internal error: %s" % e})

        def _static(self, p):
            root = app.web; rel = p.lstrip("/") or "index.html"; f = os.path.normpath(os.path.join(root, rel))
            if not f.startswith(root): return self._send(403, {"error": "Forbidden"})
            if not os.path.isfile(f):
                if os.path.splitext(rel)[1]: return self._send(404, "Not found", "text/plain")
                f = os.path.join(root, "index.html")
            ctype = mimetypes.guess_type(f)[0] or "application/octet-stream"
            if f.endswith(".js"): ctype = "text/javascript; charset=utf-8"
            with open(f, "rb") as fh: self._send(200, fh.read(), ctype)
    return H


def serve(web, data, port=8765, open_browser=True):
    for p in range(port, port + 20):
        try:
            app = App(web, data, p); srv = ThreadingHTTPServer(("127.0.0.1", p), make_handler(app)); break
        except OSError: continue
    else: raise SystemExit("No free port found near %d." % port)
    url = "http://127.0.0.1:%d" % p
    print("\n  Bharat Finance (Local Edition) is running at %s\n  Press Ctrl+C or close this window to stop.\n  Data folder: %s\n" % (url, os.path.abspath(data)))
    if open_browser: threading.Timer(0.8, lambda: webbrowser.open(url)).start()
    try: srv.serve_forever()
    except KeyboardInterrupt: pass
    finally: app.engine.stop(); srv.server_close()


def main(argv=None):
    root = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
    ap = argparse.ArgumentParser(); ap.add_argument("--port", type=int, default=8765); ap.add_argument("--web", default=os.path.join(root, "web")); ap.add_argument("--data", default=os.path.join(root, "data")); ap.add_argument("--no-browser", action="store_true")
    a = ap.parse_args(argv); serve(a.web, a.data, a.port, not a.no_browser)


if __name__ == "__main__": main()
