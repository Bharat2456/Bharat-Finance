// Technical indicators (Wilder RSI, ATR, moving averages).

export const sma = (a, n) => a.map((_, i) => i + 1 < n ? null : a.slice(i + 1 - n, i + 1).reduce((s, x) => s + x, 0) / n);
export function ema(a, n) {
  const k = 2 / (n + 1); const out = []; let prev = null;
  for (let i = 0; i < a.length; i++) {
    if (i + 1 < n) { out.push(null); continue; }
    prev = prev === null ? a.slice(0, n).reduce((s, x) => s + x, 0) / n : a[i] * k + prev * (1 - k);
    out.push(prev);
  }
  return out;
}
/** Wilder RSI of the whole closes array (last value). */
export function rsi(closes, n = 14) {
  if (closes.length < n + 1) return null;
  const g = [], l = [];
  for (let i = 1; i < closes.length; i++) { g.push(Math.max(0, closes[i] - closes[i - 1])); l.push(Math.max(0, closes[i - 1] - closes[i])); }
  let ag = g.slice(0, n).reduce((s, x) => s + x, 0) / n, al = l.slice(0, n).reduce((s, x) => s + x, 0) / n;
  for (let i = n; i < g.length; i++) { ag = (ag * (n - 1) + g[i]) / n; al = (al * (n - 1) + l[i]) / n; }
  return al ? 100 - 100 / (1 + ag / al) : 100;
}
export function rsiSeries(closes, n = 14) { return closes.map((_, i) => i < n ? null : rsi(closes.slice(0, i + 1), n)); }
export function macd(closes, fast = 12, slow = 26, sig = 9) {
  const ef = ema(closes, fast), es = ema(closes, slow);
  const line = closes.map((_, i) => ef[i] === null || es[i] === null ? null : ef[i] - es[i]);
  const first = line.findIndex((x) => x !== null);
  const sigRaw = first < 0 ? [] : ema(line.slice(first), sig);
  const signal = line.map((_, i) => i < first || first < 0 ? null : sigRaw[i - first]);
  return { line, signal, hist: line.map((x, i) => x === null || signal[i] === null ? null : x - signal[i]) };
}
export function stdev(a) { const m = a.reduce((s, x) => s + x, 0) / a.length; return Math.sqrt(a.reduce((s, x) => s + (x - m) ** 2, 0) / a.length); }
export function bollinger(closes, n = 20, k = 2) {
  const mid = sma(closes, n);
  return closes.map((_, i) => mid[i] === null ? null : { mid: mid[i], upper: mid[i] + k * stdev(closes.slice(i + 1 - n, i + 1)), lower: mid[i] - k * stdev(closes.slice(i + 1 - n, i + 1)) });
}
/** Average True Range (simple mean of the last n true ranges). bars: [{h,l,c}] */
export function atr(bars, n = 14) {
  if (bars.length < 2) return null;
  const tr = []; for (let i = 1; i < bars.length; i++) tr.push(Math.max(bars[i].h - bars[i].l, Math.abs(bars[i].h - bars[i - 1].c), Math.abs(bars[i].l - bars[i - 1].c)));
  const t = tr.slice(-n); return t.reduce((s, x) => s + x, 0) / t.length;
}
/** Session VWAP from typical price. bars: [{h,l,c,v}] */
export function vwap(bars) {
  let pv = 0, v = 0; for (const b of bars) { const tp = (b.h + b.l + b.c) / 3; pv += tp * (b.v || 0); v += b.v || 0; }
  return v ? pv / v : null;
}
/** Swing-high / swing-low levels clustered within tol (fraction). Returns {support:[], resistance:[]} nearest first. */
export function supportResistance(bars, price, { span = 3, tol = 0.01, max = 3 } = {}) {
  const hi = [], lo = [];
  for (let i = span; i < bars.length - span; i++) {
    const w = bars.slice(i - span, i + span + 1);
    if (bars[i].h === Math.max(...w.map((b) => b.h))) hi.push(bars[i].h);
    if (bars[i].l === Math.min(...w.map((b) => b.l))) lo.push(bars[i].l);
  }
  const cluster = (xs) => { const s = [...xs].sort((a, b) => a - b), out = []; for (const x of s) { const L = out[out.length - 1]; if (L && Math.abs(x - L.mean) / L.mean <= tol) { L.n++; L.mean = (L.mean * (L.n - 1) + x) / L.n; } else out.push({ mean: x, n: 1 }); } return out; };
  const res = cluster(hi).filter((c) => c.mean > price).sort((a, b) => a.mean - b.mean).slice(0, max).map((c) => ({ level: c.mean, touches: c.n }));
  const sup = cluster(lo).filter((c) => c.mean < price).sort((a, b) => b.mean - a.mean).slice(0, max).map((c) => ({ level: c.mean, touches: c.n }));
  return { support: sup, resistance: res };
}
/** Plain-language trend from SMA20/SMA50 and price. */
export function trendOf(closes) {
  const last = closes[closes.length - 1]; const s20 = sma(closes, 20).pop(); const s50 = closes.length >= 50 ? sma(closes, 50).pop() : null;
  if (s20 === null) return { label: 'insufficient data', basis: 'fewer than 20 bars' };
  const above20 = last > s20, slope = closes.length >= 25 ? s20 - sma(closes.slice(0, -5), 20).pop() : 0;
  if (above20 && slope > 0 && (s50 === null || s20 > s50)) return { label: 'uptrend', basis: 'price above a rising 20-bar average' + (s50 ? ' and the 20 is above the 50' : '') };
  if (!above20 && slope < 0 && (s50 === null || s20 < s50)) return { label: 'downtrend', basis: 'price below a falling 20-bar average' + (s50 ? ' and the 20 is below the 50' : '') };
  return { label: 'sideways / mixed', basis: 'price and the 20-bar average disagree or are flat' };
}
export function pctChange(closes, n = 1) { if (closes.length <= n) return null; return (closes[closes.length - 1] / closes[closes.length - 1 - n] - 1) * 100; }
export function realisedVol(closes, n = 20) { // daily stdev of log returns, % (not annualised)
  if (closes.length < n + 1) return null; const r = []; for (let i = closes.length - n; i < closes.length; i++) r.push(Math.log(closes[i] / closes[i - 1])); return stdev(r) * 100;
}
/** Aggregate OHLCV bars into coarser buckets. keyFn(bar)->bucket key. */
export function aggregate(bars, keyFn) {
  const out = []; let cur = null, key = null;
  for (const b of bars) { const k = keyFn(b); if (k !== key) { cur = { t: b.t, o: b.o, h: b.h, l: b.l, c: b.c, v: b.v || 0 }; out.push(cur); key = k; } else { cur.h = Math.max(cur.h, b.h); cur.l = Math.min(cur.l, b.l); cur.c = b.c; cur.v += b.v || 0; } }
  return out;
}
