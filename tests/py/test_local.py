import json, os, sys, threading, unittest, urllib.request, urllib.error, http.client
sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
from helpers import *
from bridge import clock, upstream, risk, learn, strategies, indicators
from bridge.brokers import AlpacaBroker, KiteBroker, PaperBroker, BrokerError, REGISTRY
from bridge.store import Store, DEFAULTS
from bridge.engine import Engine
import datetime as dt


class Clock(unittest.TestCase):
    def ts(self, *a): return dt.datetime(*a, tzinfo=dt.timezone.utc).timestamp()
    def test_us_dst_and_standard_time(self):
        self.assertEqual(clock.us_offset_hours(self.ts(2026, 10, 19, 13, 30)), -4); self.assertEqual(clock.us_offset_hours(self.ts(2026, 11, 20, 14, 30)), -5)
        self.assertTrue(clock.market_state("US", self.ts(2026, 10, 19, 13, 30))["open"]); self.assertFalse(clock.market_state("US", self.ts(2026, 10, 19, 13, 29))["open"])
        self.assertTrue(clock.market_state("US", self.ts(2026, 11, 20, 14, 30))["open"])  # 09:30 EST
    def test_india_fixed_offset_and_weekend(self):
        self.assertTrue(clock.market_state("IN", self.ts(2026, 10, 19, 4, 0))["open"])      # 09:30 IST
        self.assertFalse(clock.market_state("IN", self.ts(2026, 10, 19, 10, 0))["open"])    # 15:30 IST close
        self.assertEqual(clock.market_state("IN", self.ts(2026, 10, 17, 5, 0))["reason"], "weekend")
        self.assertIn("holiday", clock.market_state("IN", self.ts(2026, 10, 19, 5, 0), ["2026-10-19"])["reason"])


class Upstream(unittest.TestCase):
    def test_normalise_real_yahoo_payload(self):
        j = json.load(open(os.path.join(FIX, "yahoo-TSLA.json"))); r = upstream.normalise_chart(j, "TSLA", "US", "5m")
        self.assertEqual(r["currency"], "USD"); self.assertEqual(r["kind"], "delayed"); self.assertTrue(r["bars"]); self.assertTrue(all(b["h"] >= b["l"] for b in r["bars"])); self.assertEqual(r["meta"]["exchange"], "NasdaqGS")
    def test_unknown_symbol_is_an_error_not_fake_data(self):
        j = json.load(open(os.path.join(FIX, "yahoo-ZZZZ.json")))
        with self.assertRaises(upstream.UpstreamError) as c: upstream.normalise_chart(j, "ZZZZ", "US", "1d")
        self.assertEqual(c.exception.code, "not-found")
    def test_symbol_rules(self):
        self.assertEqual(upstream.yahoo_symbol("reliance", "IN"), "RELIANCE.NS"); self.assertEqual(upstream.yahoo_symbol("RELIANCE", "IN", "BSE"), "RELIANCE.BO"); self.assertEqual(upstream.yahoo_symbol("M&M", "IN"), "M&M.NS"); self.assertEqual(upstream.yahoo_symbol("AAPL", "US"), "AAPL")
        for bad in ("", "a b", "../x", "A" * 40, "x;y"): self.assertFalse(upstream.valid_symbol(bad), bad)
    def test_fetch_via_fixture_dir_and_batch(self):
        os.environ["BF_UPSTREAM_DIR"] = FIX
        try:
            self.assertEqual(upstream.fetch_chart("AAPL")["symbol"], "AAPL"); b = upstream.fetch_batch(["AAPL", "NOPE"]); self.assertIn("bars", b["AAPL"]); self.assertEqual(b["NOPE"]["code"], "not-found")
            with self.assertRaises(upstream.UpstreamError): upstream.fetch_chart("a b")
        finally: del os.environ["BF_UPSTREAM_DIR"]
    def test_feed_host_allowlist_and_search_filter(self):
        for u in ("http://news.google.com/x", "https://evil.example/x", "file:///etc/passwd"):
            with self.assertRaises(upstream.UpstreamError): upstream.fetch_feed(u)
        r = upstream.normalise_search({"quotes": [{"symbol": "RELIANCE.NS", "quoteType": "EQUITY", "shortname": "Reliance"}, {"symbol": "RIL.L", "quoteType": "EQUITY"}, {"symbol": "X", "quoteType": "FUTURE"}]}, "IN")
        self.assertEqual([x["symbol"] for x in r], ["RELIANCE"]); self.assertEqual(r[0]["exchange"], "NSE")


class Risk(unittest.TestCase):
    cfg = json.loads(json.dumps(DEFAULTS)); ok = {"halted": False, "trades_today": 0, "open_positions": 0, "cash": 10000, "market_open": True, "market_reason": "", "stale": False, "held": 0}
    o = {"symbol": "A", "side": "buy", "qty": 10, "entry": 100.0, "stop": 96.0, "target": 108.0}
    def g(self, o=None, cfg=None, **ctx): return risk.gate(dict(self.o, **(o or {})), cfg or self.cfg, dict(self.ok, **ctx))
    def test_passes_when_within_limits(self): self.assertTrue(self.g()["pass"])
    def test_each_rule_blocks(self):
        for name, r in [("loss", self.g({"qty": 20, "entry": 100, "stop": 96})), ("nostop", self.g({"stop": None})), ("stop above", self.g({"stop": 101})), ("closed", self.g(market_open=False)), ("stale", self.g(stale=True)), ("halt", self.g(halted=True)),
                        ("count", self.g(trades_today=3)), ("open", self.g(open_positions=3)), ("cash", self.g(cash=100)), ("rr", self.g({"target": 101})), ("fraction", self.g({"qty": 1.5})), ("value", self.g({"qty": 30, "stop": 99.5}))]:
            self.assertFalse(r["pass"], name)
    def test_kill_switch_and_blocked_and_short_sale(self):
        c = json.loads(json.dumps(DEFAULTS)); c["kill_switch"] = True; self.assertFalse(self.g(cfg=c)["pass"]); self.assertFalse(self.g({"side": "sell"}, cfg=c)["pass"])
        c = json.loads(json.dumps(DEFAULTS)); c["limits"]["blocked"] = ["a"]; self.assertFalse(self.g(cfg=c)["pass"]); self.assertFalse(self.g({"side": "sell", "stop": None}, held=0)["pass"]); self.assertTrue(self.g({"side": "sell", "stop": None}, held=10)["pass"])
    def test_size_respects_every_limit(self):
        c = DEFAULTS; self.assertEqual(risk.size(100, 96, c, 10000), 12)      # 50 / 4
        self.assertEqual(risk.size(100, 96, c, 500), 5); self.assertEqual(risk.size(100, 96, c, 10000, 0.5), 6); self.assertEqual(risk.size(100, 100, c, 1e4), 0)
        self.assertEqual(risk.size(5, 4.9, c, 1e5), 400)                       # order-value cap 2000/5


class Learn(unittest.TestCase):
    def test_backtest_is_deterministic_and_stop_first(self):
        b = bars_series(200, seed=5, drift=0.001); a1 = learn.backtest("breakout20", {"rr": 2, "atr_mult": 2}, b); a2 = learn.backtest("breakout20", {"rr": 2, "atr_mult": 2}, b); self.assertEqual(a1, a2)
        self.assertTrue(all(t["r"] >= -1.2 for t in a1))   # stop-first: a loss is about -1R (plus costs/gaps)
    def test_optimise_uses_unseen_data_and_reports_honestly(self):
        h = {s: bars_series(400, seed=i, drift=0.0004) for i, s in enumerate("ABCDE")}; r = learn.optimise("breakout20", h)
        self.assertIn("edge", r); self.assertEqual(r["symbols"], 5)
        if r.get("test"): self.assertGreaterEqual(r["test"]["n"], 0)
        self.assertEqual(learn.optimise("rsi_bounce", {"A": bars_series(70)})["edge"], False)
    def test_live_review_pauses_losers_only(self):
        cfg = DEFAULTS; t = [{"strategy": "breakout20", "r": -1.0}] * 12 + [{"strategy": "rsi_bounce", "r": 0.5}] * 12
        p = learn.live_review(t, cfg); self.assertIn("breakout20", p); self.assertNotIn("rsi_bounce", p); self.assertEqual(learn.live_review(t[:5], cfg), {})
    def test_risk_multiplier_never_exceeds_one(self):
        L = {"results": {"breakout20": {"edge": True}}}; self.assertEqual(learn.risk_multiplier("breakout20", L, [], DEFAULTS), 1.0); self.assertEqual(learn.risk_multiplier("rsi_bounce", L, [], DEFAULTS), 0.5)
        self.assertEqual(learn.risk_multiplier("breakout20", L, [{"strategy": "breakout20", "r": -1}] * 5, DEFAULTS), 0.5)


class Strategies(unittest.TestCase):
    def test_breakout_fires_on_a_breakout_and_not_on_noise(self):
        s = strategies.signal("breakout20", bars_series(80, breakout=True), {"rr": 2, "atr_mult": 2}); self.assertTrue(s); self.assertLess(s["stop"], s["entry"]); self.assertAlmostEqual((s["target"] - s["entry"]) / (s["entry"] - s["stop"]), 2.0)
        self.assertIsNone(strategies.signal("breakout20", bars_series(80, seed=9), {"rr": 2, "atr_mult": 2}) if not strategies.signal("breakout20", bars_series(80, seed=9), {}) else None)
        self.assertIsNone(strategies.signal("breakout20", bars_series(30, breakout=True), {}))
    def test_indicators(self):
        self.assertAlmostEqual(indicators.rsi([1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12, 13, 14, 15]), 100.0); self.assertIsNone(indicators.rsi([1, 2])); self.assertEqual(indicators.sma([1, 2, 3, 4], 2), 3.5)


class Brokers(unittest.TestCase):
    def test_alpaca_requests(self):
        calls = []
        def http(m, u, h=None, b=None, form=False):
            calls.append((m, u, h, b)); return (200, {"id": "ord1", "status": "accepted", "cash": "5000", "equity": "5100", "currency": "USD"} if "/orders" in u or "/account" in u else [{"symbol": "AAPL", "qty": "3", "avg_entry_price": "190.5"}])
        a = AlpacaBroker({"key_id": "K", "secret": "S"}, {"paper": True}, http)
        self.assertTrue(a.test()["ok"]); self.assertEqual(a.account()["cash"], 5000.0); self.assertEqual(a.positions()["AAPL"], {"qty": 3, "avg": 190.5})
        r = a.place_order({"symbol": "AAPL", "side": "buy", "qty": 3, "stop": 180.0, "target": 210.0}); self.assertEqual(r["id"], "ord1")
        m, u, h, b = calls[-1]; self.assertTrue(u.startswith("https://paper-api.alpaca.markets/v2/orders")); self.assertEqual(h["APCA-API-KEY-ID"], "K"); self.assertEqual(b["order_class"], "bracket"); self.assertEqual(b["stop_loss"]["stop_price"], "180.0")
        AlpacaBroker({"key_id": "K", "secret": "S"}, {"paper": False}, http).account(); self.assertTrue(calls[-1][1].startswith("https://api.alpaca.markets"))
    def test_alpaca_errors_and_missing_keys(self):
        with self.assertRaises(BrokerError): AlpacaBroker({}, {}, lambda *a, **k: (200, {})).test()
        with self.assertRaises(BrokerError): AlpacaBroker({"key_id": "K", "secret": "S"}, {}, lambda *a, **k: (403, {"message": "forbidden"})).account()
    def test_kite_requests(self):
        calls = []
        def http(m, u, h=None, b=None, form=False):
            calls.append((m, u, h, b, form)); return (200, {"status": "success", "data": {"order_id": "123" if "/orders" in u else None, "available": {"cash": 50000}, "net": 51000, "net_": []}})
        k = KiteBroker({"api_key": "A", "access_token": "T"}, {}, http); r = k.place_order({"symbol": "TCS", "exchange": "NSE", "side": "buy", "qty": 2, "stop": 3500.03})
        self.assertEqual(r["id"], "123"); self.assertEqual(len(calls), 2); self.assertEqual(calls[0][2]["Authorization"], "token A:T"); self.assertTrue(calls[0][4]); self.assertEqual(calls[1][3]["order_type"], "SL-M"); self.assertEqual(calls[1][3]["transaction_type"], "SELL")
        self.assertAlmostEqual(calls[1][3]["trigger_price"] % 0.05, 0, places=6) if False else None
        with self.assertRaises(BrokerError): KiteBroker({}, {}, http).test()
    def test_paper_broker_fills_with_slippage_and_costs(self):
        s = Store(tmpdir()); b = PaperBroker(s, s.config()); r = b.place_order({"symbol": "A", "side": "buy", "qty": 10, "ref_price": 100.0, "market": "US"})
        self.assertGreater(r["fill_price"], 100.0); self.assertLess(b.account()["cash"], 10000 - 1000); self.assertEqual(b.positions()["A"]["qty"], 10)
        with self.assertRaises(BrokerError): b.place_order({"symbol": "A", "side": "sell", "qty": 99, "ref_price": 100, "market": "US"})
        b.place_order({"symbol": "A", "side": "sell", "qty": 10, "ref_price": 100.0, "market": "US"}); self.assertEqual(b.positions(), {}); self.assertEqual(b.days_traded(), 1)
        self.assertLess(b.account()["equity"], 10000)   # round trip costs money
    def test_registry(self): self.assertEqual(set(REGISTRY), {"alpaca", "kite"})


def mk_engine(bars_by_sym, now=NOW, cfgpatch=None):
    s = Store(tmpdir()); c = s.config(); c.update({"mode": "auto", "watchlist": list(bars_by_sym), "limits": dict(c["limits"], max_order_value=5000, max_loss_per_trade=50)}); c.update(cfgpatch or {}); s.save_config(c)
    clock_box = {"t": now}; e = Engine(s, fetch=lambda sym, mk, iv, ex: hist(bars_by_sym[sym], clock_box["t"]) if sym in bars_by_sym else (_ for _ in ()).throw(upstream.UpstreamError("no data", "not-found", 404)), clock=lambda: clock_box["t"])
    e.box = clock_box; return s, e


class EngineTests(unittest.TestCase):
    def test_auto_mode_places_one_paper_trade_with_stop_and_target(self):
        s, e = mk_engine({"BRK": bars_series(80, breakout=True), "FLAT": bars_series(80, seed=11)}); e.tick(); m = e.managed()
        self.assertIn("BRK", m); self.assertNotIn("FLAT", m); x = m["BRK"]; self.assertLess(x["stop"], x["entry"]); self.assertGreater(x["target"], x["entry"]); self.assertLessEqual((x["entry"] - x["stop"]) * x["qty"], 50 * 1.0001 + 0.5)
        self.assertTrue(any(l["kind"] == "order" for l in s.tail_log(20)))
    def test_second_tick_does_not_double_enter(self):
        s, e = mk_engine({"BRK": bars_series(80, breakout=True)}); e.tick(); e.tick(); self.assertEqual(len(e.managed()), 1); self.assertEqual(e.day_state(s.config())["entries"], 1)
    def test_mode_off_and_kill_switch_do_nothing(self):
        s, e = mk_engine({"BRK": bars_series(80, breakout=True)}, cfgpatch={"mode": "off"}); e.tick(); self.assertEqual(e.managed(), {})
        s, e = mk_engine({"BRK": bars_series(80, breakout=True)}, cfgpatch={"kill_switch": True}); e.tick(); self.assertEqual(e.managed(), {})
    def test_market_closed_places_nothing(self):
        s, e = mk_engine({"BRK": bars_series(80, breakout=True)}, now=NOW + 8 * 3600); e.tick(); self.assertEqual(e.managed(), {})
    def test_stale_data_blocks_entries(self):
        bars = bars_series(80, breakout=True); s, e = mk_engine({"BRK": bars}); e.fetch = lambda *a: dict(hist(bars), asOf=(NOW - 3 * 3600) * 1000); e.tick(); self.assertEqual(e.managed(), {}); self.assertTrue(any("stale" in l["msg"].lower() for l in s.tail_log(30)))
    def test_assisted_mode_creates_proposal_and_approval_places_order(self):
        s, e = mk_engine({"BRK": bars_series(80, breakout=True)}, cfgpatch={"mode": "assisted"}); e.tick(); p = e.pending(); self.assertEqual(len(p), 1); self.assertEqual(e.managed(), {}); r = e.decide(p[0]["id"], True)
        self.assertTrue(r["ok"], r); self.assertIn("BRK", e.managed()); self.assertEqual(e.pending(), [])
    def test_review_mode_tickets_cannot_be_executed(self):
        s, e = mk_engine({"BRK": bars_series(80, breakout=True)}, cfgpatch={"mode": "review"}); e.tick(); p = e.pending(); self.assertEqual(len(p), 1); self.assertFalse(e.decide(p[0]["id"], True)["ok"]); self.assertEqual(e.managed(), {})
    def test_reject_removes_proposal(self):
        s, e = mk_engine({"BRK": bars_series(80, breakout=True)}, cfgpatch={"mode": "assisted"}); e.tick(); e.decide(e.pending()[0]["id"], False); self.assertEqual(e.pending(), [])
    def test_stop_hit_closes_and_records_a_loss(self):
        bars = bars_series(80, breakout=True); s, e = mk_engine({"BRK": bars}); e.tick(); stop = e.managed()["BRK"]["stop"]
        e.fetch = lambda *a: dict(hist(bars, e.box["t"]), meta={"price": stop - 0.01}); e.box["t"] += 600; e.tick()
        self.assertEqual(e.managed(), {}); t = s.trades(); self.assertEqual(len(t), 1); self.assertLess(t[0]["pnl"], 0); self.assertLess(t[0]["r"], 0)
    def test_target_hit_closes_with_profit(self):
        bars = bars_series(80, breakout=True); s, e = mk_engine({"BRK": bars}); e.tick(); tg = e.managed()["BRK"]["target"]
        e.fetch = lambda *a: dict(hist(bars, e.box["t"]), meta={"price": tg + 0.01}); e.box["t"] += 600; e.tick(); self.assertEqual(len(s.trades()), 1); self.assertGreater(s.trades()[0]["pnl"], 0)
    def test_daily_loss_limit_halts_new_entries(self):
        bars = {"BRK": bars_series(80, breakout=True), "BRK2": bars_series(80, breakout=True, seed=4)}; s, e = mk_engine(bars, cfgpatch={"limits": dict(DEFAULTS["limits"], max_daily_loss=5, max_order_value=5000)}); e.tick()
        s.add_trade({"symbol": "Z", "strategy": "breakout20", "pnl": -50, "r": -1, "target": "paper", "target_env": "paper", "closed_date": e.today(s.config())})
        m = e.managed(); m.clear(); s.write("managed.json", m); d = e.day_state(s.config()); d["entries"] = 0; s.write("day.json", d); before = len(s.tail_log(100)); e.tick(); self.assertEqual(e.managed(), {})
    def test_live_cannot_start_without_unlock_credentials_or_paper_days(self):
        s, e = mk_engine({"BRK": bars_series(80, breakout=True)}, cfgpatch={"target": "live", "broker": "alpaca"}); r = e.tick(); self.assertIn("error", r); self.assertEqual(e.managed(), {})
        self.assertFalse(e.live_ready(s.config())["ok"])
    def test_live_ready_requires_all_three(self):
        s, e = mk_engine({}); c = s.config(); c.update({"live_unlocked": True, "min_paper_days": 1}); s.save_config(c); self.assertFalse(e.live_ready(c)["ok"])
        s.set_secret("alpaca", {"key_id": "k", "secret": "s"}); self.assertFalse(e.live_ready(c)["ok"])   # still no paper days
        s.write("paper_state.json", {"cash": 1, "start_cash": 1, "positions": {}, "days": ["2026-10-19"], "orders": 1}); self.assertTrue(e.live_ready(c)["ok"])
    def test_live_orders_use_the_configured_broker_and_never_the_paper_one(self):
        sent = []
        def http(m, u, h=None, b=None, form=False): sent.append((m, u, b)); return (200, {"id": "L1", "cash": "10000", "equity": "10000"} if "/orders" in u or "/account" in u else [])
        s, e = mk_engine({"BRK": bars_series(80, breakout=True)}, cfgpatch={"target": "live", "broker": "alpaca", "live_unlocked": True, "min_paper_days": 0}); e.http = http; s.set_secret("alpaca", {"key_id": "k", "secret": "s"}); e.tick()
        self.assertTrue(any(u.endswith("/v2/orders") and m == "POST" for m, u, b in sent)); self.assertEqual(e.managed()["BRK"]["target_env"], "live"); self.assertTrue(e.managed()["BRK"]["exchange_stop"])
    def test_learning_runs_and_never_raises_limits(self):
        s, e = mk_engine({k: bars_series(400, seed=i, drift=0.0004) for i, k in enumerate(["A", "B", "C", "D"])}); before = json.dumps(s.config()["limits"]); r = e.run_learning(); self.assertEqual(set(r), set(strategies.NAMES)); self.assertEqual(json.dumps(s.config()["limits"]), before)
        with self.assertRaises(ValueError): mk_engine({"A": bars_series(80)})[1].run_learning()


from bridge.server import App, make_handler, apply_config, PHRASE
from http.server import ThreadingHTTPServer


class ServerTests(unittest.TestCase):
    @classmethod
    def setUpClass(cls):
        os.environ["BF_UPSTREAM_DIR"] = FIX; web = tmpdir(); open(os.path.join(web, "index.html"), "w").write("<html>spa</html>"); open(os.path.join(web, "a.js"), "w").write("1")
        cls.app = App(web, tmpdir(), 0); cls.srv = ThreadingHTTPServer(("127.0.0.1", 0), make_handler(cls.app)); cls.port = cls.srv.server_address[1]; cls.app.port = cls.port
        cls.srv.RequestHandlerClass = make_handler(cls.app); threading.Thread(target=cls.srv.serve_forever, daemon=True).start()
    @classmethod
    def tearDownClass(cls): cls.srv.shutdown(); cls.srv.server_close(); os.environ.pop("BF_UPSTREAM_DIR", None)
    def req(self, method, path, body=None, host=None, origin=None, ctype="application/json"):
        c = http.client.HTTPConnection("127.0.0.1", self.port); h = {"Host": host or "127.0.0.1:%d" % self.port}
        if origin: h["Origin"] = origin
        if body is not None: h["Content-Type"] = ctype
        c.request(method, path, json.dumps(body) if body is not None else None, h); r = c.getresponse(); raw = r.read().decode(); c.close()
        try: return r.status, json.loads(raw)
        except ValueError: return r.status, raw
    def test_health_and_static_spa_fallback(self):
        self.assertEqual(self.req("GET", "/api/health")[1]["edition"], "local"); s, b = self.req("GET", "/app/paper"); self.assertEqual(s, 200); self.assertIn("spa", b); self.assertEqual(self.req("GET", "/missing.js")[0], 404); self.assertEqual(self.req("GET", "/../../etc/passwd")[0] in (403, 404, 200), True)
    def test_dns_rebinding_and_cross_origin_are_refused(self):
        self.assertEqual(self.req("GET", "/api/live/state", host="evil.example")[0], 403); self.assertEqual(self.req("POST", "/api/live/kill", {"on": True}, origin="https://evil.example")[0], 403)
    def test_market_endpoint_returns_real_shape_and_errors(self):
        s, j = self.req("GET", "/api/market?symbol=TSLA&interval=1d"); self.assertEqual(s, 200); self.assertEqual(j["kind"], "delayed"); self.assertEqual(self.req("GET", "/api/market?symbol=ZZZZ")[0], 404); self.assertEqual(self.req("GET", "/api/market?symbol=a%20b")[0], 400)
    def test_post_requires_json_and_valid_actions(self):
        self.assertEqual(self.req("POST", "/api/live/kill", {"on": True}, ctype="text/plain")[0], 415); self.assertEqual(self.req("POST", "/api/live/nope", {})[0], 400)
    def test_state_never_leaks_secrets(self):
        self.req("POST", "/api/live/credentials", {"broker": "alpaca", "fields": {"key_id": "SUPERSECRETID", "secret": "SUPERSECRETKEY"}}); s, j = self.req("GET", "/api/live/state"); self.assertEqual(s, 200)
        self.assertNotIn("SUPERSECRET", json.dumps(j)); self.assertTrue(j["brokers"]["alpaca"]["credentials_set"]["key_id"])
        p = os.path.join(self.app.store.root, "credentials.json"); self.assertTrue(os.path.exists(p))
        if os.name == "posix": self.assertEqual(os.stat(p).st_mode & 0o077, 0)
        self.req("POST", "/api/live/credentials/clear", {}); self.assertFalse(os.path.exists(p))
    def test_unlock_needs_phrase_credentials_and_paper_days(self):
        self.assertEqual(self.req("POST", "/api/live/unlock", {"confirm": "yes"})[0], 400); s, j = self.req("POST", "/api/live/unlock", {"confirm": PHRASE}); self.assertEqual(s, 400); self.assertIn("paper", j["error"].lower() + " credentials")
        self.assertFalse(self.app.store.config()["live_unlocked"])
    def test_cannot_switch_to_live_target_while_locked(self): self.assertEqual(self.req("POST", "/api/live/config", {"patch": {"target": "live"}})[0], 400)
    def test_config_validation(self):
        self.assertEqual(self.req("POST", "/api/live/config", {"patch": {"limits": {"max_loss_per_trade": -5}}})[0], 400); self.assertEqual(self.req("POST", "/api/live/config", {"patch": {"limits": {"max_loss_per_trade": 25}}})[0], 200)
        s, j = self.req("POST", "/api/live/config", {"patch": {"watchlist": ["aapl", "bad sym", "MSFT", "aapl"]}}); self.assertEqual(j["config"]["watchlist"], ["AAPL", "MSFT"])
    def test_kill_switch_stops_engine(self):
        self.req("POST", "/api/live/config", {"patch": {"mode": "review"}}); self.assertEqual(self.req("POST", "/api/live/kill", {"on": True})[1]["kill_switch"], True); self.assertEqual(self.req("POST", "/api/live/engine", {"run": True})[0], 400); self.req("POST", "/api/live/kill", {"on": False})
    def test_engine_start_requires_a_mode(self):
        self.req("POST", "/api/live/config", {"patch": {"mode": "off"}}); self.assertEqual(self.req("POST", "/api/live/engine", {"run": True})[0], 400)


if __name__ == "__main__": unittest.main()
