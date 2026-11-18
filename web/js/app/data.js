import { makeAdapter, PROVIDERS, DataError } from '../core/market/providers.js';
import { state, trackedFetch } from './state.js';
import { MARKETS } from '../core/time.js';

// Last-known-good copy (this browser only): if a live fetch fails, show the most recent REAL data we loaded, clearly labelled with its age. Never synthetic.
const LKG = 'bf-lkg:';
const saveLkg = async (key, res) => { if (res?.interval !== '1d' || !res.bars?.length) return; try { await state.storage.setSetting(LKG + key, { at: Date.now(), res: { ...res, bars: res.bars.slice(-260) } }); } catch {} };
async function useLkg(key, err) { try { const j = await state.storage.setting(LKG + key, null); if (!j?.res?.bars?.length) return null; const age = Math.round((Date.now() - j.at) / 60000); const when = age < 90 ? `${age} min ago` : age < 2880 ? `${Math.round(age / 60)} h ago` : `${Math.round(age / 1440)} days ago`;
  return { ...j.res, kind: 'historical', stale: true, source: `${j.res.source} · SAVED COPY from ${when}; live update failed: ${err}` }; } catch { return null; } }
const cache = new Map(), TTL = { intraday: 20e3, daily: 120e3 };
const isIntra = (i) => ['1m', '5m', '15m', '30m', '1h'].includes(i);
export function adapter() {
  const d = state.settings.data;
  return makeAdapter({ provider: d.provider, apiKey: state.apiKeys.data, endpoint: d.endpoint }, { fetchImpl: trackedFetch(`Market data: ${PROVIDERS[d.provider]?.name}`), baseUrl: '' });
}
const keyOf = (symbol, market, interval) => { const d = state.settings.data; return `${d.provider}|${market}|${symbol}|${interval}|${d.exchange}`; };
const fresh = (e, interval) => e && Date.now() - e.at < (isIntra(interval) ? TTL.intraday : TTL.daily);
export async function loadHistory(symbol, market, interval = '1d', { force = false } = {}) {
  const d = state.settings.data, key = keyOf(symbol, market, interval), hit = cache.get(key);
  if (!force && fresh(hit, interval)) return hit.res;
  let res;
  try { res = await adapter().history({ symbol, market, exchange: market === 'IN' ? d.exchange : undefined, interval }); }
  catch (e) { const err = e instanceof DataError ? e : new DataError(e.message); const old = await useLkg(key, err.message); if (old) return old; throw err; }
  cache.set(key, { at: Date.now(), res }); await saveLkg(key, res); return res;
}
/** Load many symbols; uses the batch endpoint when the provider has one. Returns { SYMBOL: history | {error} }. */
export async function loadMany(symbols, market, interval = '1d') {
  const d = state.settings.data, ad = adapter(), out = {}, need = [];
  for (const s of symbols) { const hit = cache.get(keyOf(s, market, interval)); if (fresh(hit, interval)) out[s] = hit.res; else need.push(s); }
  if (!need.length) return out;
  if (ad.batch) { const r = await ad.batch({ symbols: need, market, exchange: market === 'IN' ? d.exchange : undefined, interval }); for (const s of need) { out[s] = r[s]; if (r[s]?.bars) { cache.set(keyOf(s, market, interval), { at: Date.now(), res: r[s] }); await saveLkg(keyOf(s, market, interval), r[s]); } else { const old = await useLkg(keyOf(s, market, interval), r[s]?.error || 'no answer'); if (old) out[s] = old; } } return out; }
  let i = 0; await Promise.all(Array.from({ length: Math.min(3, need.length) }, async () => { while (i < need.length) { const s = need[i++]; try { out[s] = await loadHistory(s, market, interval); } catch (e) { out[s] = { error: e.message, code: e.code }; } } }));
  return out;
}
export const clearCache = () => cache.clear();
export async function loadUniverse(market) {
  const ad = adapter(); const base = ad.universe ? await ad.universe(market) : [];
  const wl = (await state.storage.all('watchlists')).flatMap((x) => x.value.symbols || []).filter((s) => s.market === market);
  const seen = new Set(base.map((s) => s.symbol)), extra = wl.filter((s) => !seen.has(s.symbol)).map((s) => ({ symbol: s.symbol, name: s.symbol, exchange: s.exchange, currency: MARKETS[market].currency, market }));
  return [...base, ...extra];
}
export async function searchSymbols(q, market) { const ad = adapter(); if (!ad.search) throw new DataError('Symbol search needs the Live market data provider.', 'unsupported'); return ad.search({ q, market }); }
export async function loadNews(symbol, market) { const r = await trackedFetch('News (via this site)')(`/api/news?symbol=${encodeURIComponent(symbol)}&market=${market}`); if (!r.ok) throw new DataError(`News service answered HTTP ${r.status}`); return r.text(); }
export async function loadSec(params) { const r = await trackedFetch('SEC filings (via this site)')(`/api/sec?${new URLSearchParams(params)}`); const j = await r.json().catch(() => ({})); if (!r.ok) throw new DataError(j.error || `SEC service answered HTTP ${r.status}`); return j; }
export const lastClose = (h) => h.bars[h.bars.length - 1]?.c;
export const kindLabel = (k) => ({ historical: 'HISTORICAL', delayed: 'LIVE · DELAYED', realtime: 'REAL-TIME' }[k] || String(k).toUpperCase());
