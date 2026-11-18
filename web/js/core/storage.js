// Local-first persistence. IndexedDB when available, otherwise an in-memory fallback (tests / private mode).
// Nothing here ever makes a network request.
const DB_NAME = 'bharat-finance', DB_VERSION = 1;
export const STORES = ['kv', 'accounts', 'watchlists', 'journal', 'predictions', 'alerts', 'plans', 'chat', 'secrets'];
export const SCHEMA_VERSION = 1;

function memoryBackend() {
  const data = Object.fromEntries(STORES.map((s) => [s, new Map()]));
  return { kind: 'memory', async get(s, k) { return data[s].get(k); }, async put(s, k, v) { data[s].set(k, JSON.parse(JSON.stringify(v))); }, async del(s, k) { data[s].delete(k); },
    async all(s) { return [...data[s].entries()].map(([k, v]) => ({ key: k, value: JSON.parse(JSON.stringify(v)) })); }, async clear(s) { data[s].clear(); } };
}
function idbBackend(idb) {
  const open = () => new Promise((res, rej) => { const r = idb.open(DB_NAME, DB_VERSION); r.onupgradeneeded = () => { for (const s of STORES) if (!r.result.objectStoreNames.contains(s)) r.result.createObjectStore(s); }; r.onsuccess = () => res(r.result); r.onerror = () => rej(r.error); });
  let dbp; const db = () => (dbp ||= open());
  const tx = async (s, mode, fn) => { const d = await db(); return new Promise((res, rej) => { const t = d.transaction(s, mode); const out = fn(t.objectStore(s)); t.oncomplete = () => res(out.result); t.onerror = () => rej(t.error); t.onabort = () => rej(t.error); }); };
  return { kind: 'indexeddb', get: (s, k) => tx(s, 'readonly', (o) => o.get(k)), put: (s, k, v) => tx(s, 'readwrite', (o) => o.put(v, k)), del: (s, k) => tx(s, 'readwrite', (o) => o.delete(k)), clear: (s) => tx(s, 'readwrite', (o) => o.clear()),
    async all(s) { const d = await db(); return new Promise((res, rej) => { const t = d.transaction(s, 'readonly'), o = t.objectStore(s), out = [], c = o.openCursor(); c.onsuccess = () => { const cur = c.result; if (cur) { out.push({ key: cur.key, value: cur.value }); cur.continue(); } else res(out); }; c.onerror = () => rej(c.error); }); } };
}
export async function createStorage(idb = (typeof indexedDB !== 'undefined' ? indexedDB : null)) {
  let b; try { b = idb ? idbBackend(idb) : memoryBackend(); if (idb) await b.get('kv', '__probe'); } catch { b = memoryBackend(); }
  return {
    backend: b.kind,
    get: (s, k, d) => b.get(s, k).then((v) => (v === undefined ? d : v)), put: b.put, del: b.del, clear: b.clear, all: b.all,
    async setting(k, d) { return this.get('kv', k, d); }, async setSetting(k, v) { return b.put('kv', k, v); },
    /** Export everything the user owns. Secrets (API keys) are excluded unless includeSecrets is true. */
    async exportAll({ includeSecrets = false } = {}) {
      const out = { app: 'bharat-finance', schema: SCHEMA_VERSION, exportedAt: new Date().toISOString(), includesSecrets: includeSecrets, stores: {} };
      for (const s of STORES) { if (s === 'secrets' && !includeSecrets) continue; out.stores[s] = Object.fromEntries((await b.all(s)).map((x) => [x.key, x.value])); }
      return out;
    },
    async importAll(doc, { replace = false } = {}) {
      if (!doc || doc.app !== 'bharat-finance' || typeof doc.stores !== 'object') throw new Error('This file is not a Bharat Finance backup.');
      if (doc.schema > SCHEMA_VERSION) throw new Error(`Backup schema ${doc.schema} is newer than this app (${SCHEMA_VERSION}). Update the app first.`);
      let n = 0;
      for (const [s, rows] of Object.entries(doc.stores)) { if (!STORES.includes(s) || typeof rows !== 'object') continue; if (replace) await b.clear(s); for (const [k, v] of Object.entries(rows)) { await b.put(s, k, v); n++; } }
      return n;
    },
    async clearAll() { for (const s of STORES) await b.clear(s); },
    async clearSecrets() { await b.clear('secrets'); },
    async inventory() { const o = {}; for (const s of STORES) o[s] = (await b.all(s)).length; return o; },
  };
}
