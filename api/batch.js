import { fetchBatch } from './_yahoo.js'; import { wrap, edgeCache } from './_http.js';
export default wrap((p) => fetchBatch({ symbols: String(p.symbols || '').split(',').filter(Boolean), market: p.market === 'IN' ? 'IN' : 'US', interval: p.interval || '1d', exchange: p.exchange }).then((results) => ({ results })), edgeCache);
