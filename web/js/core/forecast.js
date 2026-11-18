// Statistical scenario cone + walk-forward calibration. NOT machine learning and NOT a price target.
// - cone: bootstrap of the instrument's OWN past log returns (chronological; nothing from the future).
// - calibration: expanding-window walk-forward test of the "probability up" estimate (Brier score, reliability bins).
import { PyRandom } from './pyrandom.js';

const logRet = (c) => c.slice(1).map((x, i) => Math.log(x / c[i]));
export function coneForecast(closes, { horizon = 5, paths = 2000, seed = 7 } = {}) {
  if (closes.length < 30) return null;
  const r = logRet(closes), rng = new PyRandom(seed), last = closes[closes.length - 1], ends = [];
  for (let p = 0; p < paths; p++) { let s = 0; for (let h = 0; h < horizon; h++) s += rng.choice(r); ends.push(last * Math.exp(s)); }
  ends.sort((a, b) => a - b); const q = (x) => ends[Math.min(ends.length - 1, Math.floor(x * ends.length))];
  return { horizon, basis: `bootstrap of ${r.length} past daily returns, ${paths} paths`, last, q05: q(0.05), q25: q(0.25), q50: q(0.5), q75: q(0.75), q95: q(0.95), probUpIfStationary: ends.filter((e) => e > last).length / ends.length };
}
/** Walk-forward: at each t >= minTrain estimate P(up over h days) from returns BEFORE t only, then score vs what happened. */
export function walkForwardCalibration(closes, { horizon = 5, minTrain = 40, bins = 5 } = {}) {
  const preds = [];
  for (let t = minTrain; t + horizon < closes.length; t++) {
    const past = closes.slice(0, t + 1), hr = []; for (let i = horizon; i < past.length; i++) hr.push(past[i] / past[i - horizon] - 1);
    // only horizon-returns that were fully known at t:
    const p = hr.length ? hr.filter((x) => x > 0).length / hr.length : 0.5, y = closes[t + horizon] > closes[t] ? 1 : 0;
    preds.push({ p, y });
  }
  const n = preds.length; if (!n) return { n: 0, ok: false, reason: 'not enough history for a walk-forward test' };
  const brier = preds.reduce((s, x) => s + (x.p - x.y) ** 2, 0) / n, base = preds.reduce((s, x) => s + x.y, 0) / n;
  const ref = preds.reduce((s, x) => s + (0.5 - x.y) ** 2, 0) / n;
  const rel = Array.from({ length: bins }, () => ({ n: 0, p: 0, y: 0 }));
  preds.forEach((x) => { const b = Math.min(bins - 1, Math.floor(x.p * bins)); rel[b].n++; rel[b].p += x.p; rel[b].y += x.y; });
  const ece = rel.reduce((s, b) => s + (b.n ? (b.n / n) * Math.abs(b.p / b.n - b.y / b.n) : 0), 0);
  const skill = 1 - brier / ref;
  const ok = n >= 100 && ece <= 0.05 && skill > 0;
  return { n, brier, refBrier: ref, skill, ece, baseRate: base, reliability: rel.map((b, i) => ({ bin: i, n: b.n, meanForecast: b.n ? b.p / b.n : null, observed: b.n ? b.y / b.n : null })), ok,
    reason: ok ? 'passes the minimum evidence bar (n>=100, ECE<=0.05, Brier skill>0 vs a 50% coin)' : `probabilities withheld: needs n>=100 (have ${n}), calibration error <= 0.05 (have ${ece.toFixed(3)}) and Brier skill > 0 (have ${skill.toFixed(3)})` };
}
/** Resolve stored predictions against a latest price. */
export function resolvePrediction(pred, price, nowMs) {
  if (pred.status === 'resolved' || nowMs < pred.dueAt) return pred;
  const ret = (price / pred.basePrice - 1) * 100;
  return { ...pred, status: 'resolved', resolvedAt: nowMs, outcome: { price, returnPct: ret, direction: ret > 0 ? 'up' : ret < 0 ? 'down' : 'flat', insideCone90: pred.cone ? price >= pred.cone.q05 && price <= pred.cone.q95 : null } };
}
export function predictionScorecard(preds) {
  const done = preds.filter((p) => p.status === 'resolved');
  const cone = done.filter((p) => p.outcome.insideCone90 !== null);
  return { total: preds.length, resolved: done.length, open: preds.length - done.length, coneCoverage90: cone.length ? cone.filter((p) => p.outcome.insideCone90).length / cone.length : null, coneN: cone.length };
}
