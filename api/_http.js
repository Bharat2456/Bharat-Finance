// Tiny helpers shared by the function handlers (Vercel Node runtime and the dev server use the same (req,res) shape).
import { UpstreamError } from './_yahoo.js';
export const params = (req) => Object.fromEntries(new URL(req.url, 'http://x').searchParams);
export function send(res, status, body, { type = 'application/json; charset=utf-8', cache = 'no-store' } = {}) {
  res.statusCode = status; res.setHeader('Content-Type', type); res.setHeader('Cache-Control', cache); res.setHeader('X-Content-Type-Options', 'nosniff');
  res.end(typeof body === 'string' ? body : JSON.stringify(body));
}
export const wrap = (fn, cacheFor = () => 'no-store') => async (req, res) => {
  try { if (req.method && !['GET', 'HEAD'].includes(req.method)) return send(res, 405, { error: 'GET only', code: 'method' }); const r = await fn(params(req), req); send(res, 200, r.body ?? r, { type: r.type, cache: cacheFor(params(req)) }); }
  catch (e) { const known = e instanceof UpstreamError; send(res, known ? e.status : 500, { error: known ? e.message : 'Internal error', code: known ? e.code : 'internal' }); }
};
const intraday = (i) => ['1m', '5m', '15m', '30m', '1h'].includes(i);
export const edgeCache = (p) => `public, s-maxage=${intraday(p.interval) ? 20 : 300}, stale-while-revalidate=60`;
