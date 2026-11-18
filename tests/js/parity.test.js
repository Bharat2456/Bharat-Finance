// Reference tests: calculations must reproduce fixed reference outputs (tests/golden/golden.json).
import { test } from 'node:test'; import assert from 'node:assert/strict'; import { readFileSync } from 'node:fs';
import { rsi } from '../../web/js/core/indicators.js'; import { findSetups, orbHit } from '../../web/js/core/signals.js';
import { computePlan } from '../../web/js/core/plan.js'; import { sizeTrade, rulesFromConfig } from '../../web/js/core/sizing.js';
import { buildPool, simulate, fullSessions } from '../../web/js/core/montecarlo.js'; import { analyseFacts } from '../../web/js/core/earnings.js';
import { PyRandom } from '../../web/js/core/pyrandom.js'; import { zonedParts } from '../../web/js/core/time.js';
const R = (p) => new URL('../../' + p, import.meta.url); const G = JSON.parse(readFileSync(R('tests/golden/golden.json')));
const near = (a, b, tol = 1e-9) => assert.ok(Math.abs(a - b) <= tol, `${a} vs ${b}`);

test('seeded generator reproduces fixed reference values (seed 19)', () => {
  const r = new PyRandom(19); assert.equal(r.random(), 0.6771258268002703); assert.equal(r.randint(-2, 2), 2); assert.equal(r.choice([10, 20, 30, 40, 50]), 10);
});
test('RSI and setup detection match scan.py', () => {
  for (const [k, c] of Object.entries(G.setups)) {
    const r = rsi(c.closes); if (c.rsi === null) assert.equal(r, null, k); else near(r, c.rsi, 1e-6);
    if (c.setups) { const s = findSetups(c.closes); assert.deepEqual(s.tags, c.setups.tags, k); for (const [n, v] of Object.entries(c.setups.nums)) near(s.nums[n], v, 1e-6); }
    else assert.deepEqual(findSetups(c.closes).tags, [], k);
  }
});
test('opening-range breakout matches scan.py orb_hit', () => {
  const bars = G.orb.bars.map((b) => ({ t: 1792416600 + b.i * 300, h: b.h, l: b.l, c: b.c, o: b.c })); const h = orbHit(bars, G.orb.n);
  assert.equal(h.price, G.orb.hit.price); assert.equal(h.barIndex, G.orb.hit.bar_index); assert.equal(h.orHigh, G.orb.hit.or_high); assert.equal(h.orLow, G.orb.hit.or_low); assert.equal(h.pctOver, G.orb.hit.pct_over);
});
test('exit plans match exit.py compute()', () => {
  for (const { in: i, out } of G.plans) {
    const stop = { rule: i.stop_rule, value: i.stop_param }, target = { rule: i.target_rule, value: i.target_param };
    const p = computePlan({ entry: i.entry, stop, target, orHigh: i.or_high, orLow: i.or_low });
    near(p.entry, out.entry); near(p.stop, out.stop); near(p.target, out.target); near(p.risk, out.risk); near(p.rewardRisk, out.reward_risk, 0.0051);
  }
});
test('position sizing matches size.py size_trade()', () => {
  const rules = rulesFromConfig(G.sizing.config), plan = { symbol: 'TSLA', side: 'buy', entry: G.sizing.plan.entry, stop: G.sizing.plan.stop, target: G.sizing.plan.target, date: G.sizing.plan.date };
  for (const c of G.sizing.cases) { if (c.error) continue; const o = c.out, kw = { budget: c.kw.budget, limit: c.kw.limit, price: c.kw.price };
    const s = sizeTrade(plan, rules, kw); assert.equal(s.qty, o.qty, JSON.stringify(c.kw)); near(s.cost, o.cost, 0.011); near(s.maxLoss, o.max_loss, 0.011); assert.equal(s.boundBy, o.bound_by); }
});
test('Time Machine matches timemachine.py for the same seed and data', () => {
  const t = G.timemachine, f = JSON.parse(readFileSync(R('tests/golden/fixtures/tsla-5m.json'))), bars = f.t.map((x, i) => ({ t: x, o: f.o[i], h: f.h[i], l: f.l[i], c: f.c[i] }));
  const sess = fullSessions(bars, (b) => zonedParts(b.t * 1000, 'America/New_York').date, '2026-10-19'); assert.equal(sess.length, t.sessions);
  const sim = simulate(buildPool(sess.map((s) => s.bars)), { entry: t.entry, stop: t.stop, target: t.target, k: t.k, last: t.last, replays: t.replays, seed: t.seed });
  const e = t.result; assert.equal(sim.pTarget ?? sim.p_target, e.p_target); assert.equal(sim.pStop ?? sim.p_stop, e.p_stop); assert.equal(sim.pNeither ?? sim.p_neither, e.p_neither);
  assert.equal(sim.pGreen ?? sim.p_green, e.p_green); assert.equal(sim.medianClose ?? sim.median_close, e.median_close); assert.equal(sim.avgR ?? sim.avg_R, e.avg_R);
});
test('earnings analysis matches facts.py', () => {
  const cf = JSON.parse(readFileSync(R(G.facts.file))), r = analyseFacts(cf, 6); assert.equal(r.rows.length, G.facts.rows.length);
  for (let i = 0; i < r.rows.length; i++) for (const k of ['end', 'revenue', 'net_income', 'eps_diluted', 'gross_margin', 'revenue_yoy', 'net_income_yoy']) assert.equal(r.rows[i][k], G.facts.rows[i][k], `${i}.${k}`);
});
