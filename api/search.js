import { fetchSearch } from './_yahoo.js'; import { wrap } from './_http.js';
export default wrap((p) => fetchSearch({ q: p.q, market: p.market === 'IN' ? 'IN' : 'US' }).then((results) => ({ results })), () => 'public, s-maxage=3600');
