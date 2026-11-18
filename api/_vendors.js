// Optional licensed-vendor backups, used only when Yahoo fails AND the site owner set a key as a Vercel environment variable.
// Keys live only on the server; they are never sent to visitors. Env: TWELVEDATA_API_KEY, ALPHAVANTAGE_API_KEY.
import { UpstreamError } from './_yahoo.js';
const env = (k) => (typeof process !== 'undefined' && process.env && process.env[k]) || '';
export const vendorsConfigured = () => ({ twelvedata: !!env('TWELVEDATA_API_KEY'), alphavantage: !!env('ALPHAVANTAGE_API_KEY') });

const TD = { '1m': '1min', '5m': '5min', '15m': '15min', '30m': '30min', '1h': '1h', '1d': '1day', '1w': '1week', '1M': '1month' };
const parseUtc = (s) => Date.parse(s.length === 10 ? s + 'T00:00:00Z' : s.replace(' ', 'T') + 'Z') / 1000;

export function normaliseTwelve(j, { symbol, market, interval }) {
  if (!j || j.status === 'error' || !Array.isArray(j.values)) throw new UpstreamError(`Twelve Data: ${j?.message || 'no data'}`, j?.code === 404 ? 'not-found' : 'upstream', j?.code === 404 ? 404 : 502);
  const bars = j.values.map((v) => ({ t: parseUtc(v.datetime), o: +v.open, h: +v.high, l: +v.low, c: +v.close, v: +v.volume || 0 })).filter((b) => [b.t, b.o, b.h, b.l, b.c].every(Number.isFinite)).sort((a, b) => a.t - b.t);
  if (!bars.length) throw new UpstreamError(`Twelve Data returned no bars for ${symbol}.`, 'not-found', 404);
  const m = j.meta || {};
  return { symbol, market, currency: m.currency || (market === 'IN' ? 'INR' : 'USD'), kind: 'delayed', interval, asOf: bars[bars.length - 1].t * 1000, bars,
    source: 'Twelve Data (licensed data vendor; delay depends on the site owner\'s plan)', meta: { name: null, exchange: m.exchange || null, tz: 'UTC', gmtoffset: 0, price: bars[bars.length - 1].c, previousClose: bars.length > 1 ? bars[bars.length - 2].c : null, instrumentType: m.type || null } };
}
export async function twelveChart({ symbol, market, interval, exchange = 'NSE' }, fetchImpl = fetch) {
  const key = env('TWELVEDATA_API_KEY'); if (!key) throw new UpstreamError('No Twelve Data key configured.', 'no-key', 503);
  if (!TD[interval]) throw new UpstreamError(`Twelve Data does not support interval ${interval}.`, 'bad-request', 400);
  const u = `https://api.twelvedata.com/time_series?symbol=${encodeURIComponent(symbol)}${market === 'IN' ? `&exchange=${exchange}` : ''}&interval=${TD[interval]}&outputsize=${interval === '1d' ? 500 : 300}&timezone=UTC&order=desc&apikey=${encodeURIComponent(key)}`;
  let r; try { r = await fetchImpl(u, { headers: { Accept: 'application/json' } }); } catch (e) { throw new UpstreamError(`Twelve Data unreachable: ${e.message}`, 'network'); }
  return normaliseTwelve(await r.json().catch(() => null), { symbol, market, interval });
}
export function normaliseAlpha(j, { symbol, market, interval }) {
  const ts = j && Object.entries(j).find(([k]) => /Time Series|Weekly|Monthly/i.test(k))?.[1];
  if (!ts) throw new UpstreamError(`Alpha Vantage: ${j?.Note || j?.Information || j?.['Error Message'] || 'no data'}`.slice(0, 200), j?.['Error Message'] ? 'not-found' : 'rate-limit', j?.['Error Message'] ? 404 : 429);
  const bars = Object.entries(ts).map(([d, v]) => ({ t: parseUtc(d), o: +v['1. open'], h: +v['2. high'], l: +v['3. low'], c: +v['4. close'], v: +v['5. volume'] || 0 })).filter((b) => [b.t, b.o, b.h, b.l, b.c].every(Number.isFinite)).sort((a, b) => a.t - b.t);
  if (!bars.length) throw new UpstreamError('Alpha Vantage returned no bars.', 'not-found', 404);
  return { symbol, market, currency: market === 'IN' ? 'INR' : 'USD', kind: 'delayed', interval, asOf: bars[bars.length - 1].t * 1000, bars, source: 'Alpha Vantage (licensed data vendor; free tier is rate-limited)', meta: { name: null, exchange: null, tz: 'UTC', gmtoffset: 0, price: bars[bars.length - 1].c, previousClose: null, instrumentType: null } };
}
export async function alphaChart({ symbol, market, interval, exchange = 'NSE' }, fetchImpl = fetch) {
  const key = env('ALPHAVANTAGE_API_KEY'); if (!key) throw new UpstreamError('No Alpha Vantage key configured.', 'no-key', 503);
  const fn = { '1d': 'TIME_SERIES_DAILY', '1w': 'TIME_SERIES_WEEKLY', '1M': 'TIME_SERIES_MONTHLY' }[interval]; if (!fn) throw new UpstreamError(`Alpha Vantage backup supports daily/weekly/monthly only.`, 'bad-request', 400);
  const sym = market === 'IN' ? `${symbol}.${exchange === 'BSE' ? 'BSE' : 'NSE'}` : symbol;
  let r; try { r = await fetchImpl(`https://www.alphavantage.co/query?function=${fn}&symbol=${encodeURIComponent(sym)}&outputsize=compact&apikey=${encodeURIComponent(key)}`); } catch (e) { throw new UpstreamError(`Alpha Vantage unreachable: ${e.message}`, 'network'); }
  return normaliseAlpha(await r.json().catch(() => null), { symbol, market, interval });
}
