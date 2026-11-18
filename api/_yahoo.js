// Server-side market-data helpers (run in the Vercel function, the dev server, or tests). No keys, no state.
// Source: Yahoo Finance's public chart/search endpoints. UNOFFICIAL and often delayed; see MARKET_DATA.md.
export const UA = 'Mozilla/5.0 (compatible; BharatFinance/1.0; open-source educational app)';
// Yahoo is far more likely to answer a normal browser-style request than an unknown bot UA. Same public data; no login or paywall is bypassed.
export const BROWSER_UA = 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0 Safari/537.36';
const YH = ['query1.finance.yahoo.com', 'query2.finance.yahoo.com'];
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const MAP = { '1m': ['1m', '5d'], '5m': ['5m', '60d'], '15m': ['15m', '60d'], '30m': ['30m', '60d'], '1h': ['60m', '730d'], '1d': ['1d', '2y'], '1w': ['1wk', '10y'], '1M': ['1mo', 'max'] };
export const INTERVALS = Object.keys(MAP);
export class UpstreamError extends Error { constructor(msg, code = 'upstream', status = 502) { super(msg); this.code = code; this.status = status; } }
export const validSymbol = (s) => typeof s === 'string' && /^[A-Za-z0-9][A-Za-z0-9.&^=\-]{0,24}$/.test(s);
export function yahooSymbol(symbol, market, exchange = 'NSE') {
  const s = symbol.toUpperCase();
  if (market !== 'IN' || /\.(NS|BO)$/.test(s) || s.startsWith('^')) return s;
  return s + (exchange === 'BSE' ? '.BO' : '.NS');
}
export const exchangeLabel = (ys) => (ys.endsWith('.NS') ? 'NSE' : ys.endsWith('.BO') ? 'BSE' : 'US');

export function normaliseChart(json, { symbol, market, interval }) {
  const err = json?.chart?.error; const r = json?.chart?.result?.[0];
  if (err) throw new UpstreamError(err.description || err.code || 'Unknown symbol', /not found/i.test(`${err.code} ${err.description}`) ? 'not-found' : 'upstream', /not found/i.test(`${err.code} ${err.description}`) ? 404 : 502);
  if (!r || !r.timestamp?.length) throw new UpstreamError(`No price data returned for ${symbol}.`, 'not-found', 404);
  const q = r.indicators?.quote?.[0] || {}; const bars = [];
  r.timestamp.forEach((t, i) => { const o = q.open?.[i], h = q.high?.[i], l = q.low?.[i], c = q.close?.[i]; if ([o, h, l, c].some((x) => x == null || !Number.isFinite(x))) return; bars.push({ t, o, h, l, c, v: q.volume?.[i] ?? 0 }); });
  if (!bars.length) throw new UpstreamError(`No usable bars for ${symbol}.`, 'not-found', 404);
  const m = r.meta || {};
  return { symbol, market, currency: m.currency || (market === 'IN' ? 'INR' : 'USD'), kind: 'delayed', interval, asOf: (m.regularMarketTime || bars[bars.length - 1].t) * 1000, bars,
    source: 'Yahoo Finance (unofficial; often delayed, not an exchange feed)', meta: { name: m.longName || m.shortName || null, exchange: m.fullExchangeName || m.exchangeName || null, tz: m.exchangeTimezoneName || null, gmtoffset: m.gmtoffset ?? null, price: m.regularMarketPrice ?? null, previousClose: m.chartPreviousClose ?? null, instrumentType: m.instrumentType || null } };
}
async function getJson(url, fetchImpl, headers = {}) {
  let r; try { r = await fetchImpl(url, { headers: { 'User-Agent': UA, Accept: 'application/json', ...headers } }); } catch (e) { throw new UpstreamError(`Could not reach the data source: ${e.message}`, 'network'); }
  if (r.status === 429) throw new UpstreamError('The data source is rate-limiting requests. Wait a minute and retry.', 'rate-limit', 429);
  if (r.status === 404) { try { return await r.json(); } catch { throw new UpstreamError('Symbol not found.', 'not-found', 404); } }
  if (!r.ok) throw new UpstreamError(`The data source answered HTTP ${r.status}.`, r.status === 401 || r.status === 403 ? 'blocked' : 'upstream');
  try { return await r.json(); } catch { throw new UpstreamError('The data source returned something that is not JSON.', 'upstream'); }
}
// Optional Yahoo cookie + crumb (what a browser session does); cached per warm function instance. Used only after a plain request is refused.
let crumbCache = null;
async function getCrumb(fetchImpl) {
  if (crumbCache && Date.now() - crumbCache.at < 3600e3) return crumbCache;
  const h = { 'User-Agent': BROWSER_UA, 'Accept-Language': 'en-US,en;q=0.9' };
  const r1 = await fetchImpl('https://fc.yahoo.com/', { headers: h, redirect: 'manual' }).catch(() => null);
  const raw = r1?.headers?.getSetCookie ? r1.headers.getSetCookie() : [r1?.headers?.get?.('set-cookie') || ''];
  const cookie = raw.map((c) => String(c).split(';')[0]).filter(Boolean).join('; '); if (!cookie) throw new UpstreamError('No session cookie from the data source.', 'blocked');
  const r2 = await fetchImpl('https://query1.finance.yahoo.com/v1/test/getcrumb', { headers: { ...h, Cookie: cookie } });
  const crumb = r2.ok ? (await r2.text()).trim() : ''; if (!crumb || /<|\s/.test(crumb)) throw new UpstreamError('Could not get a session crumb.', 'blocked');
  return (crumbCache = { at: Date.now(), cookie, crumb });
}
export const _resetCrumb = () => { crumbCache = null; };
const CHART = (host, ys, range, iv, extra = '') => `https://${host}/v8/finance/chart/${encodeURIComponent(ys)}?range=${range}&interval=${iv}&includePrePost=false&events=div%2Csplit${extra}`;
/** Try: host1 (browser-style) → host2 → one retry after a short pause → host1 with cookie+crumb. */
async function yahooChartJson(ys, range, iv, fetchImpl, trail) {
  const plan = [[YH[0], 0], [YH[1], 0], [YH[0], 400], [YH[1], 0]]; let last;
  for (const [host, wait] of plan) {
    if (wait) await sleep(wait);
    try { const j = await getJson(CHART(host, ys, range, iv), fetchImpl, { 'User-Agent': BROWSER_UA, 'Accept-Language': 'en-US,en;q=0.9' }); trail.push(`${host}: ok`); return j; }
    catch (e) { trail.push(`${host}: ${e.code}${e.status ? ' ' + e.status : ''}`); last = e; if (e.code === 'not-found' || e.code === 'bad-request') throw e; }
  }
  if (last?.code === 'blocked' || last?.code === 'rate-limit') {
    try { const c = await getCrumb(fetchImpl); const j = await getJson(CHART(YH[0], ys, range, iv, `&crumb=${encodeURIComponent(c.crumb)}`), fetchImpl, { 'User-Agent': BROWSER_UA, Cookie: c.cookie }); trail.push('yahoo+crumb: ok'); return j; }
    catch (e) { trail.push(`yahoo+crumb: ${e.code}`); last = e; }
  }
  throw last;
}
export async function fetchChart({ symbol, market = 'US', interval = '1d', exchange = 'NSE' }, fetchImpl = fetch, { vendors, skipYahoo = false } = {}) {
  if (!validSymbol(symbol)) throw new UpstreamError('Invalid symbol.', 'bad-request', 400);
  if (!MAP[interval]) throw new UpstreamError(`Unsupported interval ${interval}.`, 'bad-request', 400);
  const ys = yahooSymbol(symbol, market, exchange), [iv, range] = MAP[interval], trail = [], sym = symbol.toUpperCase();
  let yErr = new UpstreamError('Yahoo skipped after repeated refusals.', 'blocked');
  if (!skipYahoo) { try { return normaliseChart(await yahooChartJson(ys, range, iv, fetchImpl, trail), { symbol: sym, market, interval }); }
  catch (e) { if (!(e instanceof UpstreamError)) throw e; yErr = e; if (e.code === 'bad-request') throw e; } }
  // Yahoo refused or failed → optional licensed vendors the site owner configured (server-side keys only).
  const v = vendors || (await import('./_vendors.js'));
  for (const [name, fn] of [['twelvedata', v.twelveChart], ['alphavantage', v.alphaChart]]) {
    try { const r = await fn({ symbol: sym, market, interval, exchange }, fetchImpl); r.meta = { ...r.meta, fallbackFrom: `Yahoo (${trail.join(', ')})` }; return r; }
    catch (e) { if (e.code === 'no-key') continue; trail.push(`${name}: ${e.code}`); }
  }
  const note = yErr.code === 'not-found' ? yErr.message : `${yErr.message} (tried: ${trail.join(' → ')})`;
  throw new UpstreamError(note, yErr.code, yErr.status);
}
export async function fetchBatch({ symbols, market, interval, exchange }, fetchImpl = fetch, concurrency = 8, opts = {}) {
  const list = [...new Set(symbols)].slice(0, 60), out = {}; let i = 0, refused = 0, vendorUsed = 0;
  const anyVendor = opts.vendors ? true : Object.values((await import('./_vendors.js')).vendorsConfigured()).some(Boolean);
  await Promise.all(Array.from({ length: Math.min(concurrency, list.length) }, async () => { while (i < list.length) { const s = list[i++];
    try {
      const tripped = refused >= 4;   // circuit breaker: stop hammering a source that is refusing us
      if (tripped && (!anyVendor || vendorUsed >= 10)) { out[s] = { error: 'The data source is refusing requests right now; skipped.', code: 'blocked' }; continue; }
      if (tripped) vendorUsed++;
      out[s] = await fetchChart({ symbol: s, market, interval, exchange }, fetchImpl, { ...opts, skipYahoo: tripped });
    } catch (e) { if (['blocked', 'rate-limit', 'network'].includes(e.code)) refused++; out[s] = { error: e.message, code: e.code || 'upstream' }; } } }));
  return out;
}
export function normaliseSearch(json, market) {
  const ok = (q) => ['EQUITY', 'ETF'].includes(q.quoteType);
  return (json?.quotes || []).filter(ok).map((q) => {
    const s = q.symbol || ''; const ex = exchangeLabel(s);
    if (market === 'IN') return ex === 'US' ? null : { symbol: s.replace(/\.(NS|BO)$/, ''), name: q.longname || q.shortname || s, exchange: ex, market: 'IN', currency: 'INR' };
    return /\.[A-Z]{1,3}$/.test(s) ? null : { symbol: s, name: q.longname || q.shortname || s, exchange: q.exchDisp || q.exchange || 'US', market: 'US', currency: 'USD' };
  }).filter(Boolean).slice(0, 10);
}
export async function fetchSearch({ q, market = 'US' }, fetchImpl = fetch) {
  if (!q || q.length > 40 || !/^[\w .&\-]+$/.test(q)) throw new UpstreamError('Invalid search.', 'bad-request', 400);
  const path = `/v1/finance/search?q=${encodeURIComponent(q)}&quotesCount=15&newsCount=0&lang=en-US`; let last;
  for (const h of [YH[1], YH[0]]) { try { return normaliseSearch(await getJson(`https://${h}${path}`, fetchImpl, { 'User-Agent': BROWSER_UA }), market); } catch (e) { last = e; } }
  throw last;
}
const FEED_HOSTS = ['feeds.finance.yahoo.com', 'news.google.com', 'www.sec.gov', 'data.sec.gov'];
export async function fetchFeed(url, fetchImpl = fetch) {
  let u; try { u = new URL(url); } catch { throw new UpstreamError('Invalid URL.', 'bad-request', 400); }
  if (u.protocol !== 'https:' || !FEED_HOSTS.includes(u.hostname)) throw new UpstreamError(`Host not allowed. Allowed: ${FEED_HOSTS.join(', ')}.`, 'bad-request', 400);
  const r = await fetchImpl(u.href, { headers: { 'User-Agent': process.env?.SEC_USER_AGENT || UA, Accept: '*/*' } });
  if (!r.ok) throw new UpstreamError(`Feed answered HTTP ${r.status}.`, 'upstream');
  return r.text();
}
export const newsUrl = (symbol, market) => (market === 'IN' ? `https://news.google.com/rss/search?q=${encodeURIComponent(symbol + ' share NSE')}&hl=en-IN&gl=IN&ceid=IN:en` : `https://feeds.finance.yahoo.com/rss/2.0/headline?s=${encodeURIComponent(symbol)}&region=US&lang=en-US`);
export async function fetchSec({ kind, cik }, fetchImpl = fetch) {
  const ua = process.env?.SEC_USER_AGENT || 'BharatFinance/1.0 (set SEC_USER_AGENT to your contact email)';
  const url = kind === 'tickers' ? 'https://www.sec.gov/files/company_tickers.json' : /^\d{1,10}$/.test(cik || '') && kind === 'facts' ? `https://data.sec.gov/api/xbrl/companyfacts/CIK${String(cik).padStart(10, '0')}.json` : null;
  if (!url) throw new UpstreamError('Bad SEC request.', 'bad-request', 400);
  return getJson(url, (u, o) => fetchImpl(u, { headers: { ...o.headers, 'User-Agent': ua } }));
}
