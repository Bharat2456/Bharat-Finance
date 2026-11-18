import { fetchSec } from './_yahoo.js'; import { wrap } from './_http.js';
export default wrap((p) => fetchSec({ kind: p.kind, cik: p.cik }), () => 'public, s-maxage=3600');
