import { fetchChart } from './_yahoo.js'; import { wrap, edgeCache } from './_http.js';
export default wrap((p) => fetchChart({ symbol: p.symbol, market: p.market === 'IN' ? 'IN' : 'US', interval: p.interval || '1d', exchange: p.exchange }), edgeCache);
