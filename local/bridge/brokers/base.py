import json, urllib.request, urllib.error, urllib.parse


class BrokerError(Exception):
    pass


def default_http(method, url, headers=None, body=None, form=False):
    """Returns (status, parsed_json_or_text). Only ever called with URLs of the broker the user configured."""
    data = None; headers = dict(headers or {})
    if body is not None:
        if form: data = urllib.parse.urlencode(body).encode(); headers.setdefault("Content-Type", "application/x-www-form-urlencoded")
        else: data = json.dumps(body).encode(); headers.setdefault("Content-Type", "application/json")
    req = urllib.request.Request(url, data=data, headers=headers, method=method)
    try:
        with urllib.request.urlopen(req, timeout=20) as r: status, raw = r.status, r.read().decode("utf-8", "replace")
    except urllib.error.HTTPError as e: status, raw = e.code, e.read().decode("utf-8", "replace")
    except Exception as e: raise BrokerError("Could not reach the broker: %s" % e)
    try: return status, json.loads(raw) if raw else {}
    except ValueError: return status, raw


class Broker:
    id = "base"; name = "Base"; exchange_side_exits = False; server_target = False

    def __init__(self, creds=None, options=None, http=None):
        self.creds, self.options, self.http = creds or {}, options or {}, http or default_http

    def test(self): raise NotImplementedError
    def account(self): raise NotImplementedError          # {'cash','equity','currency'}
    def positions(self): raise NotImplementedError        # {symbol: {'qty','avg'}}
    def place_order(self, o): raise NotImplementedError   # o: symbol, side, qty, ref_price, stop, target, market, exchange -> {'id','fill_price','stop_order_id'}
    def cancel(self, order_id): raise NotImplementedError
