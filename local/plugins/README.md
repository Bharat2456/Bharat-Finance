# Broker plug-ins

Drop a `*.py` file in this folder; it is loaded at start-up (only code you put here runs).
It must define `register(registry)` which adds an entry to the broker registry:

```python
from bridge.brokers.base import Broker, BrokerError

class MyBroker(Broker):
    id = "mybroker"; name = "My Broker"
    def test(self): ...                 # raise BrokerError with a clear message on failure
    def account(self): ...              # {'cash','equity','currency'}
    def positions(self): ...            # {symbol: {'qty','avg'}}
    def place_order(self, o): ...       # o: symbol, side, qty, ref_price, stop, target, market, exchange
                                        # -> {'id','fill_price','stop_order_id'}
    def cancel(self, order_id): ...

def register(registry):
    registry["mybroker"] = {"name": "My Broker", "cls": MyBroker, "market": "US",   # or "IN"
        "fields": [("api_key", "API key"), ("secret", "Secret")],                  # shown in the UI
        "options": {}}
```
`self.creds` holds the saved fields and `self.http(method, url, headers, body)` is the HTTP helper (easy to mock in tests).
Every order passes through the local risk gate before it reaches your adapter. Test with tiny amounts.
