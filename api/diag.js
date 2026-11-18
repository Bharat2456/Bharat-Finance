// Diagnostics: what does the data source answer to THIS server? No secrets: only booleans, status codes and the region.
import { send } from './_http.js';
import { BROWSER_UA } from './_yahoo.js';
import { vendorsConfigured } from './_vendors.js';
const probe = async (host) => { const t = Date.now(); try { const r = await fetch(`https://${host}/v8/finance/chart/AAPL?range=5d&interval=1d`, { headers: { 'User-Agent': BROWSER_UA, Accept: 'application/json' } }); let ok = false; try { const j = await r.json(); ok = !!j?.chart?.result?.[0]?.timestamp?.length; } catch {} return { host, status: r.status, hasData: ok, ms: Date.now() - t }; } catch (e) { return { host, error: String(e.message).slice(0, 120), ms: Date.now() - t }; } };
export default async (req, res) => {
  const probes = await Promise.all(['query1.finance.yahoo.com', 'query2.finance.yahoo.com'].map(probe));
  send(res, 200, { region: process.env.VERCEL_REGION || null, node: process.version, yahoo: probes, yahooWorks: probes.some((p) => p.hasData), vendorsConfigured: vendorsConfigured(), time: Date.now(),
    hint: probes.some((p) => p.hasData) ? 'Yahoo answers this server.' : 'Yahoo is not answering this server. Add TWELVEDATA_API_KEY (and/or ALPHAVANTAGE_API_KEY) in Vercel → Settings → Environment Variables as a backup, or try another function region.' }, { cache: 'public, s-maxage=30' });
};
