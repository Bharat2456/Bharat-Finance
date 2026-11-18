"""Market data from Yahoo Finance's public endpoints, fetched from the user's own machine. UNOFFICIAL and often delayed.
Mirrors api/_yahoo.js (the hosted edition) so both editions return the same normalised shape.
Test hook: set BF_UPSTREAM_DIR to a folder of Yahoo-format 'yahoo-<SYMBOL>.json' files to avoid the network."""
import json, os, re, time, urllib.parse, urllib.request, urllib.error

UA = "Mozilla/5.0 (compatible; BharatFinance/1.0; open-source educational app)"
MAP = {"1m": ("1m", "5d"), "5m": ("5m", "60d"), "15m": ("15m", "60d"), "30m": ("30m", "60d"), "1h": ("60m", "730d"),
       "1d": ("1d", "2y"), "1w": ("1wk", "10y"), "1M": ("1mo", "max")}
BROWSER_UA = "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0 Safari/537.36"
FEED_HOSTS = ("feeds.finance.yahoo.com", "news.google.com", "www.sec.gov", "data.sec.gov")


class UpstreamError(Exception):
    def __init__(self, msg, code="upstream", status=502):
        super().__init__(msg); self.code, self.status = code, status


def valid_symbol(s):
    return isinstance(s, str) and re.match(r"^[A-Za-z0-9][A-Za-z0-9.&^=\-]{0,24}$", s) is not None


def yahoo_symbol(symbol, market, exchange="NSE"):
    s = symbol.upper()
    if market != "IN" or re.search(r"\.(NS|BO)$", s) or s.startswith("^"): return s
    return s + (".BO" if exchange == "BSE" else ".NS")


def normalise_chart(j, symbol, market, interval):
    err = (j.get("chart") or {}).get("error")
    res = ((j.get("chart") or {}).get("result") or [None])[0]
    if err:
        nf = "not found" in ("%s %s" % (err.get("code"), err.get("description"))).lower()
        raise UpstreamError(err.get("description") or err.get("code") or "Unknown symbol", "not-found" if nf else "upstream", 404 if nf else 502)
    if not res or not res.get("timestamp"): raise UpstreamError("No price data returned for %s." % symbol, "not-found", 404)
    q = ((res.get("indicators") or {}).get("quote") or [{}])[0]; bars = []
    for i, t in enumerate(res["timestamp"]):
        try: o, h, l, c = q["open"][i], q["high"][i], q["low"][i], q["close"][i]
        except (KeyError, IndexError): continue
        if any(x is None for x in (o, h, l, c)): continue
        v = (q.get("volume") or [0] * (i + 1))[i] or 0
        bars.append({"t": t, "o": o, "h": h, "l": l, "c": c, "v": v})
    if not bars: raise UpstreamError("No usable bars for %s." % symbol, "not-found", 404)
    m = res.get("meta") or {}
    return {"symbol": symbol.upper(), "market": market, "currency": m.get("currency") or ("INR" if market == "IN" else "USD"),
            "kind": "delayed", "interval": interval, "asOf": (m.get("regularMarketTime") or bars[-1]["t"]) * 1000, "bars": bars,
            "source": "Yahoo Finance (unofficial; often delayed, not an exchange feed)",
            "meta": {"name": m.get("longName") or m.get("shortName"), "exchange": m.get("fullExchangeName") or m.get("exchangeName"),
                     "price": m.get("regularMarketPrice"), "previousClose": m.get("chartPreviousClose"), "instrumentType": m.get("instrumentType")}}


def _get(url, accept="application/json", ua=UA, retries=2):
    last = None
    for attempt in range(retries + 1):
        req = urllib.request.Request(url, headers={"User-Agent": ua, "Accept": accept})
        try:
            with urllib.request.urlopen(req, timeout=15) as r: return r.read().decode("utf-8", "replace")
        except urllib.error.HTTPError as e:
            if e.code == 404: return e.read().decode("utf-8", "replace") or '{"chart":{"result":null,"error":{"code":"Not Found","description":"Symbol not found"}}}'
            if e.code == 429: last = UpstreamError("The data source is rate-limiting requests. Wait a minute and retry.", "rate-limit", 429); time.sleep(1.5 * (attempt + 1)); continue
            last = UpstreamError("The data source answered HTTP %s." % e.code)
        except Exception as e:
            last = UpstreamError("Could not reach the data source: %s" % e, "network")
        time.sleep(0.6)
    raise last


def fetch_chart(symbol, market="US", interval="1d", exchange="NSE"):
    if not valid_symbol(symbol): raise UpstreamError("Invalid symbol.", "bad-request", 400)
    if interval not in MAP: raise UpstreamError("Unsupported interval %s." % interval, "bad-request", 400)
    d = os.environ.get("BF_UPSTREAM_DIR")
    if d:
        p = os.path.join(d, "yahoo-%s.json" % symbol.upper().replace("&", "_"))
        if not os.path.exists(p): raise UpstreamError("No price data returned for %s." % symbol, "not-found", 404)
        return normalise_chart(json.load(open(p)), symbol.upper(), market, interval)
    iv, rng = MAP[interval]; ys = yahoo_symbol(symbol, market, exchange)
    last = None
    for host in ("query1.finance.yahoo.com", "query2.finance.yahoo.com"):
        url = "https://%s/v8/finance/chart/%s?range=%s&interval=%s&includePrePost=false&events=div%%2Csplit" % (host, urllib.parse.quote(ys, safe=""), rng, iv)
        try:
            j = json.loads(_get(url, ua=BROWSER_UA, retries=1))
            return normalise_chart(j, symbol.upper(), market, interval)
        except UpstreamError as e:
            if e.code in ("not-found", "bad-request"): raise
            last = e
        except ValueError:
            last = UpstreamError("The data source returned something that is not JSON.")
    raise last


def fetch_batch(symbols, market="US", interval="1d", exchange="NSE"):
    out = {}
    for s in list(dict.fromkeys(symbols))[:60]:
        try: out[s] = fetch_chart(s, market, interval, exchange)
        except UpstreamError as e: out[s] = {"error": str(e), "code": e.code}
    return out


def normalise_search(j, market):
    res = []
    for q in j.get("quotes") or []:
        if q.get("quoteType") not in ("EQUITY", "ETF"): continue
        s = q.get("symbol") or ""; ex = "NSE" if s.endswith(".NS") else "BSE" if s.endswith(".BO") else "US"
        name = q.get("longname") or q.get("shortname") or s
        if market == "IN":
            if ex != "US": res.append({"symbol": re.sub(r"\.(NS|BO)$", "", s), "name": name, "exchange": ex, "market": "IN", "currency": "INR"})
        elif not re.search(r"\.[A-Z]{1,3}$", s): res.append({"symbol": s, "name": name, "exchange": q.get("exchDisp") or "US", "market": "US", "currency": "USD"})
    return res[:10]


def fetch_search(q, market="US"):
    if not q or len(q) > 40 or not re.match(r"^[\w .&\-]+$", q): raise UpstreamError("Invalid search.", "bad-request", 400)
    if os.environ.get("BF_UPSTREAM_DIR"): return []
    return normalise_search(json.loads(_get("https://query2.finance.yahoo.com/v1/finance/search?q=%s&quotesCount=15&newsCount=0&lang=en-US" % urllib.parse.quote(q))), market)


def news_url(symbol, market):
    if market == "IN": return "https://news.google.com/rss/search?q=%s&hl=en-IN&gl=IN&ceid=IN:en" % urllib.parse.quote(symbol + " share NSE")
    return "https://feeds.finance.yahoo.com/rss/2.0/headline?s=%s&region=US&lang=en-US" % urllib.parse.quote(symbol)


def fetch_feed(url):
    u = urllib.parse.urlparse(url)
    if u.scheme != "https" or u.hostname not in FEED_HOSTS: raise UpstreamError("Host not allowed. Allowed: %s." % ", ".join(FEED_HOSTS), "bad-request", 400)
    d = os.environ.get("BF_UPSTREAM_DIR")
    if d:
        p = os.path.join(d, "feed.xml"); return open(p).read() if os.path.exists(p) else "<rss><channel></channel></rss>"
    return _get(url, accept="*/*", ua=os.environ.get("SEC_USER_AGENT") or UA)


def fetch_sec(kind, cik=None):
    ua = os.environ.get("SEC_USER_AGENT") or "BharatFinance/1.0 (set SEC_USER_AGENT to your contact email)"
    if kind == "tickers": url = "https://www.sec.gov/files/company_tickers.json"
    elif kind == "facts" and re.match(r"^\d{1,10}$", cik or ""): url = "https://data.sec.gov/api/xbrl/companyfacts/CIK%s.json" % str(cik).zfill(10)
    else: raise UpstreamError("Bad SEC request.", "bad-request", 400)
    d = os.environ.get("BF_UPSTREAM_DIR")
    if d:
        p = os.path.join(d, "sec-%s.json" % (kind if kind == "tickers" else cik))
        if os.path.exists(p): return json.load(open(p))
        raise UpstreamError("No SEC data.", "not-found", 404)
    return json.loads(_get(url, ua=ua))
