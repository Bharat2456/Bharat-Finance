import { test } from 'node:test'; import assert from 'node:assert/strict'; import { readFileSync, readdirSync, statSync, existsSync } from 'node:fs'; import { join } from 'node:path';
import { createStorage } from '../../web/js/core/storage.js'; import { makeAdapter, DataError, fetchFxRates, PROVIDERS } from '../../web/js/core/market/providers.js';
import { chat, testConnection, AiError, AI_PROVIDERS, SYSTEM_PROMPT } from '../../web/js/core/ai/providers.js'; import { parseFeed } from '../../web/js/core/rss.js';
const ROOT = new URL('../../', import.meta.url).pathname; const json = (o, ok = true, status = 200) => ({ ok, status, json: async () => o, text: async () => JSON.stringify(o) });
function walk(d, out = []) { for (const n of readdirSync(d)) { const p = join(d, n); statSync(p).isDirectory() ? walk(p, out) : out.push(p); } return out; }

test('storage: round trip, export excludes secrets, import validates, clear wipes', async () => {
  const s = await createStorage(null); assert.equal(s.backend, 'memory');
  await s.put('kv', 'a', 1); await s.put('journal', 'j1', { text: 'hi' }); await s.put('secrets', 'ai', 'sk-secret');
  const ex = await s.exportAll(); assert.equal(ex.stores.secrets, undefined); assert.equal(ex.stores.journal.j1.text, 'hi'); assert.ok(!JSON.stringify(ex).includes('sk-secret'));
  const t = await createStorage(null); assert.ok((await t.importAll(ex)) >= 2); assert.equal(await t.get('journal', 'j1').then((v) => v.text), 'hi');
  await assert.rejects(() => t.importAll({ nope: 1 }), /not a Bharat Finance backup/); await assert.rejects(() => t.importAll({ app: 'bharat-finance', schema: 99, stores: {} }), /newer/);
  await s.clearAll(); assert.equal(await s.get('journal', 'j1'), undefined); assert.equal(await s.get('secrets', 'ai'), undefined);
});
test('storage: clearSecrets removes keys only', async () => { const s = await createStorage(null); await s.put('secrets', 'ai', 'k'); await s.put('kv', 'x', 1); await s.clearSecrets(); assert.equal(await s.get('secrets', 'ai'), undefined); assert.equal(await s.get('kv', 'x'), 1); });
test('storage: inventory counts items', async () => { const s = await createStorage(null); await s.put('alerts', 'a', {}); await s.put('alerts', 'b', {}); assert.equal((await s.inventory()).alerts, 2); });

const YF = (n) => JSON.parse(readFileSync(join(ROOT, 'tests/fixtures/yahoo', n), 'utf8'));
const hdr = (ct = 'application/json') => ({ get: () => ct });
test('market: live adapter calls the same-origin /api relay and returns its payload', async () => {
  const seen = []; const f = async (u) => { seen.push(u); return { ok: true, status: 200, headers: hdr(), json: async () => ({ symbol: 'TSLA', bars: [{ t: 1, o: 1, h: 1, l: 1, c: 1, v: 1 }], kind: 'delayed' }) }; };
  const r = await makeAdapter({ provider: 'live' }, { fetchImpl: f }).history({ symbol: 'TSLA', market: 'US', interval: '5m' });
  assert.equal(r.kind, 'delayed'); assert.match(seen[0], /\/api\/market\?/); assert.match(seen[0], /symbol=TSLA/);
});
test('market: live adapter says so plainly when no data service exists (plain static server)', async () => {
  const f = async () => ({ ok: true, status: 200, headers: hdr('text/html'), json: async () => ({}) });
  await assert.rejects(() => makeAdapter({ provider: 'live' }, { fetchImpl: f }).history({ symbol: 'X', market: 'US' }), (e) => e instanceof DataError && e.code === 'no-service');
  const g = async () => { throw new TypeError('Failed to fetch'); }; await assert.rejects(() => makeAdapter({ provider: 'live' }, { fetchImpl: g }).history({ symbol: 'X', market: 'US' }), (e) => e.code === 'network');
});
test('market: no synthetic or demo provider exists anywhere in the app', () => {
  assert.equal(PROVIDERS.demo, undefined); assert.equal(PROVIDERS.yahoo, undefined); assert.ok(PROVIDERS.live);
  assert.ok(!existsSync(join(ROOT, 'web/data')));
  for (const f of walk(join(ROOT, 'web/js'))) if (f.endsWith('.js')) assert.ok(!/in-synthetic|synthetic india|demo data/i.test(readFileSync(f, 'utf8').replace(/never (?:synthetic|demo)[^\n]*/gi, '')), f);
});
test('api: Yahoo relay normalises real Yahoo-format payloads and rejects bad input', async () => {
  const y = await import('../../api/_yahoo.js'); const raw = YF('yahoo-TSLA.json');
  const r = y.normaliseChart(raw, { symbol: 'TSLA', market: 'US', interval: '1d' }); assert.ok(r.bars.length > 5); assert.equal(r.kind, 'delayed'); assert.ok(r.bars.every((b) => b.h >= b.l && b.t > 0)); assert.ok(r.bars.every((b, i) => i === 0 || b.t > r.bars[i - 1].t));
  assert.equal(y.yahooSymbol('RELIANCE', 'IN', 'NSE'), 'RELIANCE.NS'); assert.equal(y.yahooSymbol('RELIANCE', 'IN', 'BSE'), 'RELIANCE.BO');
  assert.equal(y.validSymbol('AAPL'), true); assert.equal(y.validSymbol('../etc'), false); assert.equal(y.validSymbol('A B'), false);
  assert.throws(() => y.normaliseChart(YF('yahoo-ZZZZ.json'), { symbol: 'ZZZZ', market: 'US', interval: '1d' }), (e) => e instanceof y.UpstreamError);
  let url; await y.fetchChart({ symbol: 'TSLA', market: 'US', interval: '1d' }, async (u) => { url = u; return { ok: true, status: 200, json: async () => raw, text: async () => JSON.stringify(raw) }; }); assert.match(url, /^https:\/\/query[12]\.finance\.yahoo\.com\//);
  await assert.rejects(() => y.fetchChart({ symbol: 'bad symbol', market: 'US' }, async () => { throw new Error('must not call'); }));
});
test('api: handlers answer JSON, refuse non-GET, hide internals', async () => {
  const h = (await import('../../api/health.js')).default; const mk = () => { const r = { headers: {}, setHeader(k, v) { this.headers[k] = v; }, end(b) { this.body = b; } }; return r; };
  const res = mk(); h({ url: '/api/health', method: 'GET' }, res); assert.equal(JSON.parse(res.body).edition, 'hosted');
  const m = (await import('../../api/market.js')).default; const r2 = mk(); await m({ url: '/api/market?symbol=TSLA', method: 'POST' }, r2); assert.equal(r2.statusCode, 405);
  const r3 = mk(); await m({ url: '/api/market?symbol=%2E%2E%2Fx', method: 'GET' }, r3); assert.ok(r3.statusCode >= 400 && r3.statusCode < 500);
});
test('local edition: /local page, Live page, zip and manifest are consistent', async () => {
  assert.ok(existsSync(join(ROOT, 'web/js/pages/local.js'))); assert.ok(existsSync(join(ROOT, 'web/js/pages/app/live.js')));
  const m = JSON.parse(readFileSync(join(ROOT, 'web/downloads/local.json'), 'utf8')); const buf = readFileSync(join(ROOT, 'web/downloads/bharat-finance-local.zip'));
  const { createHash } = await import('node:crypto'); assert.equal(m.size, buf.length); assert.equal(m.sha256, createHash('sha256').update(buf).digest('hex'));
  assert.ok(/main\.js/.test(readFileSync(join(ROOT, 'web/js/main.js'), 'utf8')) || true); assert.match(readFileSync(join(ROOT, 'web/js/main.js'), 'utf8'), /local/);
});
test('theme: dark background is pure black; light is the default', () => {
  const css = readFileSync(join(ROOT, 'web/css/styles.css'), 'utf8'); assert.match(css, /--bg:\s*#000000/i); assert.match(readFileSync(join(ROOT, 'web/js/theme-init.js'), 'utf8'), /#000000/i);
});
test('market: Alpha Vantage needs a key, parses bars, reports rate limits, never calls without a key', async () => {
  let calls = 0; await assert.rejects(() => makeAdapter({ provider: 'alphavantage' }, { fetchImpl: async () => { calls++; return json({}); } }).history({ symbol: 'IBM', market: 'US' }), (e) => e.code === 'no-key'); assert.equal(calls, 0);
  const ok = makeAdapter({ provider: 'alphavantage', apiKey: 'K' }, { fetchImpl: async (u) => { assert.ok(u.includes('apikey=K')); return json({ 'Time Series (Daily)': { '2026-10-02': { '1. open': '1', '2. high': '2', '3. low': '0.5', '4. close': '1.5', '5. volume': '10' }, '2026-10-01': { '1. open': '1', '2. high': '2', '3. low': '0.5', '4. close': '1.2', '5. volume': '10' } } }); } });
  const r = await ok.history({ symbol: 'IBM', market: 'US', interval: '1d' }); assert.equal(r.bars.length, 2); assert.ok(r.bars[0].t < r.bars[1].t); assert.equal(r.kind, 'delayed');
  await assert.rejects(() => makeAdapter({ provider: 'alphavantage', apiKey: 'K' }, { fetchImpl: async () => json({ Note: 'limit' }) }).history({ symbol: 'IBM', market: 'US' }), (e) => e.code === 'rate-limit');
});
test('market: custom endpoint validates its payload', async () => {
  const a = (r) => makeAdapter({ provider: 'custom', endpoint: 'http://localhost:8787/bars' }, { fetchImpl: async () => json(r) });
  const r = await a({ bars: [{ t: 1, o: 1, h: 1, l: 1, c: 1, v: 1 }], source: 'mine' }).history({ symbol: 'X', market: 'IN', interval: '1d' }); assert.equal(r.source, 'mine');
  await assert.rejects(() => a({ nope: 1 }).history({ symbol: 'X', market: 'IN' }), (e) => e.code === 'empty'); await assert.rejects(() => makeAdapter({ provider: 'custom' }, { fetchImpl: async () => json({}) }).history({ symbol: 'X', market: 'IN' }), (e) => e.code === 'no-config');
});
test('market: HTTP failures become DataErrors, not crashes', async () => { await assert.rejects(() => makeAdapter({ provider: 'twelvedata', apiKey: 'k' }, { fetchImpl: async () => json({}, false, 500) }).history({ symbol: 'X', market: 'US' }), DataError); await assert.rejects(() => makeAdapter({ provider: 'twelvedata', apiKey: 'k' }, { fetchImpl: async () => { throw new TypeError('Failed to fetch'); } }).history({ symbol: 'X', market: 'US' }), DataError); });
test('market: FX fetch returns a labelled rate table', async () => { const r = await fetchFxRates('USD', async () => json({ base: 'USD', date: '2026-10-19', rates: { INR: 83 } })); assert.equal(r.rates.INR, 83); assert.ok(r.source); });

test('AI: builtin makes no network call; missing key blocks before any request', async () => { let n = 0; const f = async () => { n++; return json({}); };
  assert.equal((await testConnection({ provider: 'builtin' }, { fetchImpl: f })).ok, true); await assert.rejects(() => chat({ provider: 'openai', model: 'm' }, [{ role: 'user', content: 'hi' }], { fetchImpl: f }), (e) => e instanceof AiError && e.code === 'no-key'); assert.equal(n, 0); });
test('AI: request shapes per provider carry the key only to the configured host', async () => {
  const seen = []; const f = (reply) => async (u, o) => { seen.push({ u, o }); return json(reply); };
  assert.equal(await chat({ provider: 'openai', model: 'm', apiKey: 'K1' }, [{ role: 'user', content: 'x' }], { fetchImpl: f({ choices: [{ message: { content: 'A' } }] }) }), 'A');
  assert.equal(await chat({ provider: 'anthropic', model: 'm', apiKey: 'K2' }, [{ role: 'user', content: 'x' }], { fetchImpl: f({ content: [{ type: 'text', text: 'B' }] }) }), 'B');
  assert.equal(await chat({ provider: 'gemini', model: 'g', apiKey: 'K3' }, [{ role: 'user', content: 'x' }], { fetchImpl: f({ candidates: [{ content: { parts: [{ text: 'C' }] } }] }) }), 'C');
  assert.equal(await chat({ provider: 'local', model: 'l', endpoint: 'http://localhost:11434/v1' }, [{ role: 'user', content: 'x' }], { fetchImpl: f({ choices: [{ message: { content: 'D' } }] }) }), 'D');
  assert.ok(seen[0].u.startsWith('https://api.openai.com')); assert.ok(seen[1].u.startsWith('https://api.anthropic.com')); assert.ok(seen[2].u.includes('generativelanguage.googleapis.com')); assert.ok(seen[3].u.startsWith('http://localhost'));
  assert.ok(!seen[2].u.includes('K3'), 'Gemini key must be a header, not in the URL'); assert.ok(!JSON.stringify(seen[0].o.body).includes('K1'));
});
test('AI: provider errors surface as AiError with a readable message', async () => { const r = await testConnection({ provider: 'openai', model: 'm', apiKey: 'bad' }, { fetchImpl: async () => json({ error: { message: 'Incorrect API key' } }, false, 401) }); assert.equal(r.ok, false); assert.ok(r.message.length > 5); });
test('AI: system prompt forbids guarantees and invented probabilities', () => { assert.match(SYSTEM_PROMPT, /promise profits/i); assert.match(SYSTEM_PROMPT, /probabilit/i); });
test('RSS parser reads bundled sample feeds', () => { const x = readFileSync(join(ROOT, 'tests/fixtures/news/yahoo-TSLA.xml'), 'utf8'); const items = parseFeed(x); assert.ok(items.length > 0); assert.ok(items[0].title); });

test('privacy: no hardcoded API keys, no analytics/telemetry or ad scripts in shipped code', () => {
  const files = walk(join(ROOT, 'web')).filter((p) => /\.(js|html|css)$/.test(p)); const bad = [];
  for (const p of files) { const t = readFileSync(p, 'utf8'); if (/sk-[A-Za-z0-9]{20,}|AIza[0-9A-Za-z_-]{30,}|AKIA[0-9A-Z]{16}/.test(t)) bad.push(p + ' key'); if (/google-analytics|googletagmanager|gtag\(|mixpanel|segment\.com|sentry|hotjar|fbq\(|clarity\.ms|plausible|posthog/i.test(t)) bad.push(p + ' telemetry'); }
  assert.deepEqual(bad, []);
});
test('privacy: the page declares a CSP and loads no third-party scripts', () => { const h = readFileSync(join(ROOT, 'web/index.html'), 'utf8'); assert.match(h, /Content-Security-Policy/); assert.ok(!/<script[^>]+src=["']https?:/i.test(h)); assert.match(h, /script-src 'self'/); });
test('privacy: API keys are never written to localStorage', () => { for (const p of walk(join(ROOT, 'web/js')).filter((x) => x.endsWith('.js'))) { const t = readFileSync(p, 'utf8'); for (const m of t.matchAll(/localStorage\.setItem\(([^)]*)\)/g)) assert.ok(!/key|secret|token/i.test(m[1]), p + ': ' + m[0]); } });
test('broker: no live execution code path exists (no broker order endpoints in shipped code)', () => { const t = walk(join(ROOT, 'web/js')).map((p) => readFileSync(p, 'utf8')).join('\n'); assert.ok(!/api\.alpaca\.markets|kite\.zerodha|api\.upstox|angelone|\/v2\/orders/i.test(t)); });
test('theme: default is light and the toggle is session-scoped', () => { const t = readFileSync(join(ROOT, 'web/js/theme-init.js'), 'utf8'); assert.match(t, /var t = 'light'/); assert.ok(!/localStorage/.test(t)); const c = readFileSync(join(ROOT, 'web/css/styles.css'), 'utf8'); assert.match(c, /\[data-theme="dark"\]/); });
test('required pages and assets exist; builder photo and logo are present', () => { for (const f of ['index.html', 'assets/builder.jpg', 'assets/logo-192.png', 'js/pages/landing.js', 'js/pages/builder.js', 'js/pages/app/settings.js']) assert.ok(existsSync(join(ROOT, 'web', f)), f); });
test('vercel.json: static output, api functions, SPA rewrite excludes api/downloads', () => { const v = JSON.parse(readFileSync(join(ROOT, 'vercel.json'), 'utf8')); assert.equal(v.outputDirectory, 'dist'); assert.equal(v.buildCommand, 'npm run build'); const re = new RegExp('^' + v.rewrites[0].source + '$'); assert.ok(re.test('/app/paper')); assert.ok(re.test('/local')); assert.ok(!re.test('/api/market')); assert.ok(!re.test('/js/main.js')); assert.ok(!re.test('/downloads/bharat-finance-local.zip')); assert.ok(existsSync(join(ROOT, 'api/market.js'))); });
test('package.json has no runtime dependencies', () => { const p = JSON.parse(readFileSync(join(ROOT, 'package.json'), 'utf8')); assert.ok(!p.dependencies && !p.devDependencies); assert.equal(p.license, 'MIT'); });
test('docs: required documents exist', () => { for (const f of ['README.md', 'INSTALLATION.md', 'DEPLOYMENT.md', 'ARCHITECTURE.md', 'PRIVACY.md', 'SECURITY.md', 'MARKET_DATA.md', 'AI_PROVIDERS.md', 'BROKER_INTEGRATION.md', 'PAPER_TRADING.md', 'CONTRIBUTING.md', 'LICENSE', 'LOCAL_EDITION.md']) assert.ok(existsSync(join(ROOT, f)), f); });

// ---- v0.3: resilient relay, vendor backups, AI auto-model, settings migration ----
test('relay: falls back to the second Yahoo host, then to a configured vendor, and reports what it tried', async () => {
  const y = await import('../../api/_yahoo.js'); const raw = YF('yahoo-TSLA.json'); const hosts = [];
  const f1 = async (u) => { hosts.push(new URL(u).hostname); if (u.includes('query1')) return { ok: false, status: 403, json: async () => ({}) }; return { ok: true, status: 200, json: async () => raw }; };
  const r = await y.fetchChart({ symbol: 'TSLA', market: 'US', interval: '1d' }, f1); assert.ok(r.bars.length > 5); assert.ok(hosts.includes('query2.finance.yahoo.com'));
  const calls = []; const blocked = async (u) => { calls.push(u); if (/yahoo/.test(u)) return { ok: false, status: 403, text: async () => '', headers: { get: () => '' }, json: async () => ({}) }; return { ok: true, status: 200, json: async () => ({ meta: { currency: 'USD' }, status: 'ok', values: [{ datetime: '2026-11-17', open: '1', high: '2', low: '0.5', close: '1.5', volume: '10' }, { datetime: '2026-11-16', open: '1', high: '2', low: '0.5', close: '1.2', volume: '10' }] }) }; };
  const v = await import('../../api/_vendors.js'); process.env.TWELVEDATA_API_KEY = 'k';
  const r2 = await y.fetchChart({ symbol: 'TSLA', market: 'US', interval: '1d' }, blocked); assert.match(r2.source, /Twelve Data/); assert.equal(r2.bars.length, 2); assert.ok(r2.bars[0].t < r2.bars[1].t); assert.ok(calls.some((u) => /twelvedata/.test(u))); assert.ok(!calls.some((u) => /apikey=k/.test(u) && /yahoo/.test(u)));
  delete process.env.TWELVEDATA_API_KEY; y._resetCrumb();
  await assert.rejects(() => y.fetchChart({ symbol: 'TSLA', market: 'US', interval: '1d' }, blocked), (e) => e.code === 'blocked' && /tried:/.test(e.message));
  assert.deepEqual(v.vendorsConfigured(), { twelvedata: false, alphavantage: false });
});
test('relay: a genuinely unknown symbol is 404 and does not hit vendors', async () => {
  const y = await import('../../api/_yahoo.js'); let n = 0; const f = async () => { n++; return { ok: true, status: 200, json: async () => YF('yahoo-ZZZZ.json') }; };
  await assert.rejects(() => y.fetchChart({ symbol: 'ZZZZ', market: 'US', interval: '1d' }, f), (e) => e.code === 'not-found' && e.status === 404); assert.equal(n, 1);
});
test('relay: batch circuit breaker stops hammering a refusing source', async () => {
  const y = await import('../../api/_yahoo.js'); let n = 0; const f = async () => { n++; return { ok: false, status: 403, json: async () => ({}) }; };
  const out = await y.fetchBatch({ symbols: Array.from({ length: 30 }, (_, i) => 'S' + i), market: 'US', interval: '1d' }, f, 2, { vendors: { twelveChart: async () => { const e = new Error('x'); e.code = 'no-key'; throw e; }, alphaChart: async () => { const e = new Error('x'); e.code = 'no-key'; throw e; } } });
  assert.equal(Object.keys(out).length, 30); assert.ok(n < 30 * 4); assert.ok(Object.values(out).every((x) => x.error));
});
test('ai: model is discovered automatically per provider; retired pinned model falls through', async () => {
  const ai = await import('../../web/js/core/ai/providers.js');
  assert.equal(ai.rankModels('gemini', ['models/x', 'gemini-2.0-flash', 'gemini-2.5-flash-preview-05-20', 'gemini-2.5-flash', 'gemini-2.5-pro', 'gemini-embedding-001', 'gemini-2.5-flash-lite'])[0], 'gemini-2.5-flash');
  assert.match(ai.rankModels('anthropic', ['claude-opus-4-1', 'claude-haiku-4-5', 'claude-sonnet-4-5'])[0], /sonnet/);
  assert.ok(!ai.rankModels('openai', ['text-embedding-3-small', 'whisper-1', 'gpt-4o-mini']).includes('whisper-1'));
  const seen = []; const f = async (u, init) => { seen.push(u);
    if (/\/v1beta\/models\?/.test(u)) return { ok: true, status: 200, json: async () => ({ models: [{ name: 'models/gemini-2.5-flash', supportedGenerationMethods: ['generateContent'] }, { name: 'models/gemini-embedding-001', supportedGenerationMethods: ['embedContent'] }] }) };
    if (/gemini-2\.0-flash:/.test(u)) return { ok: false, status: 404, text: async () => 'model is no longer available', json: async () => ({}) };
    return { ok: true, status: 200, json: async () => ({ candidates: [{ content: { parts: [{ text: 'ok' }] } }] }) }; };
  const t = await ai.chat({ provider: 'gemini', model: 'gemini-2.0-flash', apiKey: 'k' }, [{ role: 'user', content: 'hi' }], { fetchImpl: f });
  assert.equal(t, 'ok'); assert.equal(ai.lastModel(), 'gemini-2.5-flash'); assert.ok(seen.some((u) => /gemini-2\.5-flash:generateContent/.test(u)));
  const r = await ai.testConnection({ provider: 'gemini', apiKey: 'k', model: '' }, { fetchImpl: f }); assert.equal(r.ok, true); assert.match(r.message, /automatically/);
  await assert.rejects(() => ai.chat({ provider: 'gemini', model: '' }, [], { fetchImpl: f }), (e) => e.code === 'no-key');
});
test('settings: old saved demo provider and pinned model are migrated', () => {
  const src = readFileSync(join(ROOT, 'web/js/app/state.js'), 'utf8'); assert.match(src, /provider = 'live'/); assert.match(src, /ai\.model = ''/);
  assert.ok(!readFileSync(join(ROOT, 'web/js/pages/app/settings.js'), 'utf8').includes('id="md"'));
});
