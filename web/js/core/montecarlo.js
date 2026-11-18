// Time Machine: replays the rest of a session many times by resampling the stock's own past sessions.
// Uses a seeded generator, so the same seed + same bars always give the same numbers.
import { PyRandom } from './pyrandom.js';
export const SESSION_BARS = 78;

/** sessions: array of arrays of 78 bars {o,h,l,c} (oldest first). */
export function buildPool(sessions, n = SESSION_BARS) {
  const pool = Array.from({ length: n }, () => []);
  for (const D of sessions) for (let i = 1; i < n; i++) { const pc = D[i - 1].c; pool[i].push([D[i].o / pc, D[i].h / pc, D[i].l / pc, D[i].c / pc]); }
  return pool;
}
const pct = (a, q) => a[Math.min(a.length - 1, Math.floor(q * a.length))];

export function simulate(pool, { entry, stop, target, k, last, replays = 10000, seed = 19, window: win = 2, side = 'buy', bandPaths = 2000 }) {
  const long = side === 'buy';
  const risk = long ? entry - stop : stop - entry;
  const rTarget = Math.round(((long ? target - entry : entry - target) / risk) * 1e4) / 1e4;
  const slot = (rng, i) => (win === 0 ? i : Math.min(pool.length - 1, Math.max(1, i + rng.randint(-win, win))));
  let rng = new PyRandom(seed);
  const outcomes = [], closes = [];
  for (let n = 0; n < replays; n++) {
    let p = entry, outcome = null;
    for (let i = k + 1; i <= last; i++) {
      const [, h, l, c] = rng.choice(pool[slot(rng, i)]);
      const hi = p * h, lo = p * l, cl = p * c;
      if (outcome === null) {
        if (long) { if (lo <= stop) outcome = 'stop'; else if (hi >= target) outcome = 'target'; }
        else if (hi >= stop) outcome = 'stop'; else if (lo <= target) outcome = 'target';
      }
      p = cl;
    }
    outcomes.push(outcome || 'close'); closes.push(p);
  }
  const cnt = { target: 0, stop: 0, close: 0 }; outcomes.forEach((o) => { cnt[o]++; });
  let green = 0; const Rs = [];
  for (let n = 0; n < replays; n++) {
    const o = outcomes[n], p = closes[n];
    if (o === 'target' || (o === 'close' && (long ? p > entry : p < entry))) green++;
    Rs.push(o === 'target' ? rTarget : o === 'stop' ? -1 : (long ? p - entry : entry - p) / risk);
  }
  const srt = [...closes].sort((a, b) => a - b);
  rng = new PyRandom(seed);
  const allp = [];
  for (let n = 0; n < bandPaths; n++) { let p = entry; const path = [entry]; for (let i = k + 1; i <= last; i++) { const [, , , c] = rng.choice(pool[slot(rng, i)]); p *= c; path.push(p); } allp.push(path); }
  const bands = []; for (let j = 0; j <= last - k; j++) { const col = allp.map((pp) => pp[j]).sort((a, b) => a - b); bands.push([0.05, 0.25, 0.5, 0.75, 0.95].map((q) => +pct(col, q).toFixed(2))); }
  const round = (x, d) => Math.round(x * 10 ** d) / 10 ** d;
  return { replays, seed, window: win, barsLeft: last - k, pTarget: round(cnt.target / replays, 4), pStop: round(cnt.stop / replays, 4), pNeither: round(cnt.close / replays, 4), pGreen: round(green / replays, 4),
    medianClose: round(pct(srt, 0.5), 2), p5Close: round(pct(srt, 0.05), 2), p95Close: round(pct(srt, 0.95), 2), avgR: round(Rs.reduce((a, b) => a + b, 0) / Rs.length, 3), rAtTarget: rTarget, bands };
}
/** Verdict wording: compares target share of decided replays with break-even 1/(1+R). */
export function verdict(sim) {
  const decided = sim.pTarget + sim.pStop; if (!decided) return 'Most replays hit neither side before the end.';
  const share = sim.pTarget / decided, be = 1 / (1 + sim.rAtTarget), gap = (share - be) * 100, a = Math.abs(gap);
  const flat = sim.rAtTarget === 1 ? 'Close to a coin flip' : 'Close to break-even';
  return a < 5 ? flat : a < 15 ? (gap > 0 ? 'Leans toward the target' : 'Leans toward the stop') : (gap > 0 ? 'Strongly toward the target' : 'Strongly toward the stop');
}
/** Split 5-minute bars into FULL sessions of 78 bars (US 09:30-16:00). Half days / gaps are dropped. */
export function fullSessions(bars, groupFn, beforeDate, n = SESSION_BARS) {
  const by = new Map(); for (const b of bars) { const d = groupFn(b); if (beforeDate && d >= beforeDate) continue; if (!by.has(d)) by.set(d, []); by.get(d).push(b); }
  return [...by.entries()].sort((a, b) => (a[0] < b[0] ? -1 : 1)).filter(([, v]) => v.length === n).map(([d, v]) => ({ date: d, bars: v }));
}
