"""Broker adapters. All are EXPERIMENTAL: written from public API documentation and unit-tested with mocked HTTP only.
Add your own by dropping a .py file into the 'plugins' folder that defines register(registry); see plugins/README.md."""
import importlib.util, os
from .base import Broker, BrokerError, default_http
from .paper import PaperBroker
from .alpaca import AlpacaBroker
from .kite import KiteBroker

REGISTRY = {
    "alpaca": {"name": "Alpaca (US stocks)", "cls": AlpacaBroker, "market": "US", "fields": [("key_id", "API key ID"), ("secret", "API secret")], "options": {"paper": "Use Alpaca's paper-trading endpoint"}},
    "kite": {"name": "Zerodha Kite Connect (India)", "cls": KiteBroker, "market": "IN", "fields": [("api_key", "API key"), ("access_token", "Access token (from today's login)")], "options": {}},
}


def load_plugins(folder):
    if not os.path.isdir(folder): return []
    loaded = []
    for fn in sorted(os.listdir(folder)):
        if not fn.endswith(".py") or fn.startswith("_"): continue
        spec = importlib.util.spec_from_file_location("bf_plugin_" + fn[:-3], os.path.join(folder, fn)); mod = importlib.util.module_from_spec(spec)
        spec.loader.exec_module(mod)
        if hasattr(mod, "register"): mod.register(REGISTRY); loaded.append(fn)
    return loaded
