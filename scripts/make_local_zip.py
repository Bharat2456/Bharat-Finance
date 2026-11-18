"""Builds web/downloads/bharat-finance-local.zip (+ local.json) from web/ and local/. Deterministic. Run: python3 scripts/make_local_zip.py"""
import hashlib, json, os, sys, zipfile
ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
sys.path.insert(0, os.path.join(ROOT, "local"))
from bridge import VERSION  # noqa: E402
OUT = os.path.join(ROOT, "web", "downloads")
TOP = "bharat-finance-local"


def files():
    items = []
    def walk(src, dst, skip=()):
        for d, ds, fs in os.walk(src):
            ds[:] = sorted(x for x in ds if x not in ("__pycache__", ".pytest_cache", "downloads", "data") and x not in skip)
            for f in sorted(fs):
                if f.endswith((".pyc", ".pyo")): continue
                p = os.path.join(d, f); items.append((p, dst + "/" + os.path.relpath(p, src).replace(os.sep, "/")))
    walk(os.path.join(ROOT, "web"), TOP + "/web")
    walk(os.path.join(ROOT, "local", "bridge"), TOP + "/bridge")
    walk(os.path.join(ROOT, "local", "plugins"), TOP + "/plugins")
    for f in ("run.py", "start.bat", "start.sh", "README-LOCAL.md"): items.append((os.path.join(ROOT, "local", f), TOP + "/" + f))
    items.append((os.path.join(ROOT, "LICENSE"), TOP + "/LICENSE"))
    return items


def main():
    os.makedirs(OUT, exist_ok=True); z = os.path.join(OUT, "bharat-finance-local.zip")
    with zipfile.ZipFile(z, "w", zipfile.ZIP_DEFLATED) as zf:
        for src, arc in files():
            zi = zipfile.ZipInfo(arc, (2026, 1, 1, 0, 0, 0)); zi.compress_type = zipfile.ZIP_DEFLATED
            zi.external_attr = ((0o755 if arc.endswith((".sh",)) else 0o644) << 16)
            with open(src, "rb") as fh: zf.writestr(zi, fh.read())
        zi = zipfile.ZipInfo(TOP + "/data/.keep", (2026, 1, 1, 0, 0, 0)); zf.writestr(zi, "")
    b = open(z, "rb").read()
    json.dump({"version": VERSION, "size": len(b), "sha256": hashlib.sha256(b).hexdigest()}, open(os.path.join(OUT, "local.json"), "w"))
    print("zip:", z, len(b), "bytes")


if __name__ == "__main__": main()
