// Market-data adapters. Every adapter returns the SAME normalised shape:
//   { symbol, market, currency, kind:'delayed'|'realtime'|'historical', source, asOf(ms), interval, bars:[{t(sec),o,h,l,c,v}] }
// Adapters never fabricate prices. If a source cannot be reached from a browser they say so.
// All adapters take an injectable fetchImpl so they can be unit-tested without a network.

export class DataError extends Error { constructor(msg, code = 'error') { super(msg); this.code = code; } }
const INTERVALS = ['1m', '5m', '15m', '30m', '1h', '1d', '1w', '1M'];

export const PROVIDERS = {
  live: { id: 'live', name: 'Live market data (default, no key)', markets: ['US', 'IN'], keyRequired: false, endpoint: '(this site / local program)',
    sends: "The ticker symbols you view or scan, to this app's own data service (a serverless function on the host, or the Local Edition program on your computer), which requests them from Yahoo Finance.",
    intervals: ['1m', '5m', '15m', '30m', '1h', '1d', '1w', '1M'],
    note: 'Real prices for NSE/BSE (.NS/.BO) and US tickers from Yahoo Finance: unofficial, usually delayed (about 15 minutes or more), not an exchange feed, and subject to Yahoo\'s terms and rate limits. Needs the Vercel deployment or the Local Edition; a plain static file server has no data service.' },
  alphavantage: { id: 'alphavantage', name: 'Alpha Vantage (your key)', markets: ['US', 'IN'], keyRequired: true, endpoint: 'https://www.alphavantage.co',
    sends: 'The ticker symbol and your API key, to alphavantage.co.', intervals: ['5m', '15m', '30m', '1h', '1d', '1w', '1M'],
    note: 'Browser (CORS) access is supported. Free tier is rate-limited and delayed. Indian coverage is mainly BSE (SYMBOL.BSE); check the symbol exists for your plan.' },
  twelvedata: { id: 'twelvedata', name: 'Twelve Data (your key)', markets: ['US', 'IN'], keyRequired: true, endpoint: 'https://api.twelvedata.com',
    sends: 'The ticker symbol, exchange and your API key, to twelvedata.com.', intervals: ['1m', '5m', '15m', '30m', '1h', '1d', '1w', '1M'],
    note: 'Supports NSE and BSE via the exchange parameter on suitable plans. Whether data is real-time or delayed depends on YOUR plan and exchange licensing.' },
  custom: { id: 'custom', name: 'Custom JSON endpoint (your own / local)', markets: ['US', 'IN'], keyRequired: false, endpoint: '(you set it)',
    sends: 'The ticker, market, interval to the URL you configure. Use this for a local bridge you run yourself (see MARKET_DATA.md).', intervals: INTERVALS,
    note: 'Expected response: the normalised shape documented in MARKET_DATA.md. Use http://localhost for a bridge on your own machine.' },
};

const num = (x) => (x == null || x === '' ? null : Number(x));
const toSec = (s) => Math.floor(new Date(s.replace(' ', 'T') + (s.length <= 10 ? 'T00:00:00' : '') + 'Z').getTime() / 1000);

async function getJson(url, fetchImpl, signal) {
  let r; try { r = await fetchImpl(url, { signal }); } catch (e) { throw new DataError(`Network/CORS error: the browser could not reach this data source (${e.message}).`, 'network'); }
  if (!r.ok) throw new DataError(`Data source answered HTTP ${r.status}.`, 'http');
  return r.json();
}

export function makeAdapter(cfg, { fetchImpl = (typeof fetch !== 'undefined' ? fetch.bind(globalThis) : null), baseUrl = '' } = {}) {
  const id = cfg.provider;
  if (id === 'live') return liveAdapter(fetchImpl, baseUrl);
  if (id === 'alphavantage') return alphaVantage(cfg, fetchImpl);
  if (id === 'twelvedata') return twelveData(cfg, fetchImpl);
  if (id === 'custom') return customAdapter(cfg, fetchImpl);
  throw new DataError(`Unknown data provider ${id}`);
}


async function apiJson(url, f, signal) {
  let r; try { r = await f(url, { signal }); } catch (e) { throw new DataError(`Could not reach the live data service (${e.message}).`, 'network'); }
  const ct = (r.headers && r.headers.get && r.headers.get('content-type')) || 'application/json';
  if (!ct.includes('json')) throw new DataError('No live data service at this address. Deploy to Vercel (see DEPLOYMENT.md) or run the Local Edition; a plain static server cannot fetch live prices.', 'no-service');
  const j = await r.json(); if (!r.ok) throw new DataError(j.error || `Data service answered HTTP ${r.status}.`, j.code || 'http'); return j;
}
const qs = (o) => new URLSearchParams(Object.entries(o).filter(([, v]) => v != null && v !== '')).toString();
function liveAdapter(f, baseUrl) {
  return { id: 'live',
    async universe(market) { const { UNIVERSE } = await import('../../content/universe.js'); return UNIVERSE[market] || []; },
    async history({ symbol, market, exchange = 'NSE', interval = '1d', signal }) { return apiJson(`${baseUrl}/api/market?${qs({ symbol, market, exchange, interval })}`, f, signal); },
    async batch({ symbols, market, exchange = 'NSE', interval = '1d', signal }) { return (await apiJson(`${baseUrl}/api/batch?${qs({ symbols: symbols.join(','), market, exchange, interval })}`, f, signal)).results; },
    async search({ q, market, signal }) { return (await apiJson(`${baseUrl}/api/search?${qs({ q, market })}`, f, signal)).results; } };
}

function alphaVantage(cfg, f) {
  const sym = (s, market, ex) => (market === 'IN' ? `${s}.${ex === 'NSE' ? 'NSE' : 'BSE'}` : s);
  return { id: 'alphavantage', async history({ symbol, market, exchange = 'BSE', interval = '1d', signal }) {
    if (!cfg.apiKey) throw new DataError('Alpha Vantage needs your API key (Settings > Market data).', 'no-key');
    const intra = { '5m': '5min', '15m': '15min', '30m': '30min', '1h': '60min' }[interval];
    const fn = intra ? 'TIME_SERIES_INTRADAY' : interval === '1w' ? 'TIME_SERIES_WEEKLY' : interval === '1M' ? 'TIME_SERIES_MONTHLY' : 'TIME_SERIES_DAILY';
    const url = `https://www.alphavantage.co/query?function=${fn}&symbol=${encodeURIComponent(sym(symbol, market, exchange))}${intra ? `&interval=${intra}&outputsize=full` : '&outputsize=compact'}&apikey=${encodeURIComponent(cfg.apiKey)}`;
    const j = await getJson(url, f, signal);
    if (j.Note || j.Information) throw new DataError(`Alpha Vantage: ${j.Note || j.Information}`, 'rate-limit');
    if (j['Error Message']) throw new DataError('Alpha Vantage: symbol not found or not available on your plan.', 'not-found');
    const key = Object.keys(j).find((k) => k.startsWith('Time Series')); if (!key) throw new DataError('Alpha Vantage returned no time series.', 'empty');
    const bars = Object.entries(j[key]).map(([d, v]) => ({ t: toSec(d), o: num(v['1. open']), h: num(v['2. high']), l: num(v['3. low']), c: num(v['4. close']), v: num(v['5. volume']) || 0 })).sort((a, b) => a.t - b.t);
    return { symbol, market, currency: market === 'IN' ? 'INR' : 'USD', kind: 'delayed', source: 'Alpha Vantage (plan-dependent delay; not an official exchange feed)', asOf: bars[bars.length - 1].t * 1000, interval, bars };
  } };
}
function twelveData(cfg, f) {
  return { id: 'twelvedata', async history({ symbol, market, exchange = 'NSE', interval = '1d', signal }) {
    if (!cfg.apiKey) throw new DataError('Twelve Data needs your API key (Settings > Market data).', 'no-key');
    const iv = { '1m': '1min', '5m': '5min', '15m': '15min', '30m': '30min', '1h': '1h', '1d': '1day', '1w': '1week', '1M': '1month' }[interval];
    const url = `https://api.twelvedata.com/time_series?symbol=${encodeURIComponent(symbol)}${market === 'IN' ? `&exchange=${exchange}` : ''}&interval=${iv}&outputsize=500&order=asc&apikey=${encodeURIComponent(cfg.apiKey)}`;
    const j = await getJson(url, f, signal);
    if (j.status === 'error') throw new DataError(`Twelve Data: ${j.message}`, j.code === 429 ? 'rate-limit' : 'error');
    const bars = (j.values || []).map((v) => ({ t: toSec(v.datetime), o: num(v.open), h: num(v.high), l: num(v.low), c: num(v.close), v: num(v.volume) || 0 })).sort((a, b) => a.t - b.t);
    if (!bars.length) throw new DataError('Twelve Data returned no bars.', 'empty');
    return { symbol, market, currency: j.meta?.currency || (market === 'IN' ? 'INR' : 'USD'), kind: 'delayed', source: 'Twelve Data (real-time vs delayed depends on your plan and exchange licence)', asOf: bars[bars.length - 1].t * 1000, interval, bars };
  } };
}
function customAdapter(cfg, f) {
  return { id: 'custom', async history({ symbol, market, exchange, interval = '1d', signal }) {
    if (!cfg.endpoint) throw new DataError('Set your endpoint URL in Settings > Market data.', 'no-config');
    const u = new URL(cfg.endpoint); u.searchParams.set('symbol', symbol); u.searchParams.set('market', market); u.searchParams.set('interval', interval); if (exchange) u.searchParams.set('exchange', exchange);
    const j = await getJson(u.toString(), f, signal);
    if (!Array.isArray(j.bars) || !j.bars.length) throw new DataError('Custom endpoint returned no bars (expected {bars:[{t,o,h,l,c,v}]}).', 'empty');
    return { symbol, market, currency: j.currency || (market === 'IN' ? 'INR' : 'USD'), kind: j.kind || 'delayed', source: j.source || `Custom endpoint ${u.host}`, asOf: j.asOf || j.bars[j.bars.length - 1].t * 1000, interval, bars: j.bars };
  } };
}

/** Frankfurter (ECB reference rates, CORS-enabled, no key). Rates are reference rates, not tradable quotes. */
export async function fetchFxRates(base, fetchImpl = fetch, symbols = 'INR,USD,EUR,GBP,JPY,AED,SGD,AUD,CAD') {
  const j = await getJson(`https://api.frankfurter.app/latest?from=${base}&to=${symbols}`, fetchImpl);
  return { base: j.base, rates: { ...j.rates, [j.base]: 1 }, asOf: j.date, source: 'Frankfurter / ECB reference rates (not tradable quotes)' };
}
/** Resample bars to a coarser interval. */
export function resample(bars, interval, tz = 'UTC') {
  const step = { '15m': 900, '30m': 1800, '1h': 3600 }[interval];
  if (step) { const out = []; let cur = null; for (const b of bars) { const k = Math.floor(b.t / step); if (!cur || cur.k !== k) { cur = { k, t: k * step, o: b.o, h: b.h, l: b.l, c: b.c, v: b.v }; out.push(cur); } else { cur.h = Math.max(cur.h, b.h); cur.l = Math.min(cur.l, b.l); cur.c = b.c; cur.v += b.v; } } return out.map(({ k, ...r }) => r); }
  if (interval === '1w' || interval === '1M') { const out = []; let key = null, cur = null; for (const b of bars) { const d = new Date(b.t * 1000); const ky = interval === '1M' ? `${d.getUTCFullYear()}-${d.getUTCMonth()}` : `${d.getUTCFullYear()}-${Math.floor((Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), d.getUTCDate()) / 86400000 + 3) / 7)}`; if (ky !== key) { cur = { ...b }; out.push(cur); key = ky; } else { if (cur.h != null && b.h != null) cur.h = Math.max(cur.h, b.h); if (cur.l != null && b.l != null) cur.l = Math.min(cur.l, b.l); cur.c = b.c; cur.v = (cur.v || 0) + (b.v || 0); } } return out; }
  return bars;
}
