// Setup detection: chart patterns, opening-range breakout and the entry timer.
import { rsi } from './indicators.js';
import { zonedParts, sessionFor, hhmmToMin, minToHhmm, MARKETS, isTradingDay } from './time.js';

export const MIN_DAILY_BARS = 30;
/** closes oldest-first, >= 30. Returns {tags, nums}. */
export function findSetups(c) {
  if (c.length < MIN_DAILY_BARS) return { tags: [], nums: null };
  const last = c[c.length - 1];
  const hi20 = Math.max(...c.slice(-21, -1));
  const ma20 = c.slice(-20).reduce((s, x) => s + x, 0) / 20;
  const ma20Prev = c.slice(-21, -1).reduce((s, x) => s + x, 0) / 20;
  const run = c[c.length - 6] / c[c.length - 16] - 1;
  const l5 = c.slice(-5); const rng5 = (Math.max(...l5) - Math.min(...l5)) / last;
  const r = rsi(c), rPrev = rsi(c.slice(0, -1));
  const tags = [];
  if (last > hi20) tags.push('breakout_20d');
  if (run > 0.10 && rng5 < 0.05) tags.push('bull_flag');
  if (c[c.length - 2] < ma20Prev && last > ma20) tags.push('reclaim_ma20');
  if (r !== null && r < 30) tags.push('oversold');
  if (rPrev !== null && rPrev < 30 && last > c[c.length - 2]) tags.push('oversold_bounce');
  return { tags, nums: { rsi: r, rsi_prev: rPrev, high20: hi20, ma20, run_pct: run * 100, range5_pct: rng5 * 100 } };
}
export const SETUP_LABELS = {
  breakout_20d: ['20-day breakout', 'Closed above the highest close of the previous 20 days.'],
  bull_flag: ['Bull flag', 'Up more than 10% over ~10 days, then a tight (under 5%) 5-day range.'],
  reclaim_ma20: ['Reclaimed 20-day average', 'Was below the 20-day average yesterday, closed above it today.'],
  oversold: ['Oversold (RSI < 30)', 'Wilder RSI(14) under 30. Oversold can stay oversold.'],
  oversold_bounce: ['Oversold bounce', 'RSI was under 30 yesterday and price rose today.'],
};

/** Scan daily-close series: data = {SYM:{c:[...]}}. */
export function scanDaily(data, { minPrice = 0 } = {}) {
  const hits = [];
  for (const [sym, s] of Object.entries(data)) {
    const c = s.c; if (!c || c.length < MIN_DAILY_BARS) continue;
    if (c[c.length - 1] < minPrice) continue;
    const { tags, nums } = findSetups(c);
    if (tags.length) hits.push({ symbol: sym, setups: tags, price: c[c.length - 1], rsi: nums.rsi, nums });
  }
  hits.sort((a, b) => b.setups.length - a.setups.length || a.symbol.localeCompare(b.symbol));
  return hits;
}

/** Opening-range breakout on bar arrays of ONE session. bars: [{t(sec),o,h,l,c,v}] on a fixed grid.
 * First completed bar after the range whose CLOSE is above the range high. */
export function orbHit(bars, nRange, barMin = 5) {
  const rng = bars.slice(0, nRange);
  if (rng.length < nRange || rng.some((b) => b.h == null || b.l == null)) return null;
  const oh = Math.max(...rng.map((b) => b.h)), ol = Math.min(...rng.map((b) => b.l));
  for (let k = nRange; k < bars.length; k++) if (bars[k].c > oh) {
    return { price: +bars[k].c.toFixed(2), barIndex: k, barStart: bars[k].t, closesAt: bars[k].t + barMin * 60, orHigh: +oh.toFixed(2), orLow: +ol.toFixed(2), pctOver: +((bars[k].c / oh - 1) * 100).toFixed(2) };
  }
  return null;
}

/** Group bars by local session date. */
export function groupSessions(bars, tz, session) {
  const by = new Map();
  for (const b of bars) {
    const p = zonedParts(b.t * 1000, tz);
    if (p.minutes < session.open || p.minutes >= session.close) continue;
    if (!by.has(p.date)) by.set(p.date, []);
    by.get(p.date).push({ ...b, _min: p.minutes, _date: p.date });
  }
  return by;
}

/**
 * Entry Timer (opening-range breakout).
 * opts: { market:'US', nowMs, orMinutes:15, barMin:5, noEntriesBefore:'09:45', noEntriesAfter:'15:30', minVolumeX }
 */
export function evaluateOrb(bars, opts) {
  const m = MARKETS[opts.market || 'US']; const tz = m.tz;
  const orMinutes = opts.orMinutes ?? 15, barMin = opts.barMin ?? 5, step = barMin * 60;
  const nOr = (orMinutes * 60) / step;
  const now = opts.nowMs, local = zonedParts(now, tz), day = local.date;
  const res = { setup: 'orb', side: 'buy', date: day, status: 'waiting', phase: '', reason: '', openingRange: null, level: null, trigger: null, last: null, barsClosed: 0 };
  const td = isTradingDay(m, day, opts.extraHolidays || {});
  if (!td.ok) return { ...res, status: 'no-data', phase: 'closed', reason: `the ${m.exchanges[0]} is closed today (${td.reason})` };
  const s = sessionFor(m, day, opts.extraHolidays || {});
  const before = hhmmToMin(opts.noEntriesBefore || '09:45'), cutoffCfg = hhmmToMin(opts.noEntriesAfter || '15:30');
  const cutoff = s.early ? Math.min(cutoffCfg, s.close - 30) : cutoffCfg;
  const orEnd = s.open + orMinutes;
  const bySlot = new Map();
  for (const b of bars) {
    if (b.t % step) continue;
    const p = zonedParts(b.t * 1000, tz);
    if (p.date !== day || p.minutes < s.open || p.minutes >= s.close) continue;
    const slot = Math.floor((p.minutes - s.open) / barMin);
    bySlot.set(slot, { ...b, startMin: p.minutes, endMin: p.minutes + barMin, slot });
  }
  const nowSec = Math.floor(now / 1000);
  const closed = [...bySlot.values()].filter((b) => b.t + step <= nowSec).sort((a, b) => a.slot - b.slot);
  res.barsClosed = closed.length;
  if (local.minutes < s.open) return { ...res, phase: 'pre-open', reason: `the market opens at ${minToHhmm(s.open)}` };
  const orBars = closed.filter((b) => b.slot < nOr);
  const avgVol = orBars.length ? orBars.reduce((a, b) => a + (b.v || 0), 0) / orBars.length : null;
  if (orBars.length) res.openingRange = { high: Math.max(...orBars.map((b) => b.h)), low: Math.min(...orBars.map((b) => b.l)), minutes: orMinutes, bars: orBars.length, of: nOr, complete: local.minutes >= orEnd };
  if (local.minutes < orEnd) return { ...res, phase: 'forming', reason: `${orBars.length} of ${nOr} range bars closed; the range is set at ${minToHhmm(orEnd)}` };
  if (!orBars.length) return { ...res, status: 'no-data', phase: 'open', reason: 'no bars for the opening range' };
  const lvl = Math.max(...orBars.map((b) => b.h));
  res.level = lvl;
  let trig = null;
  for (const b of closed) {
    if (b.slot < nOr || b.endMin < before || b.endMin > cutoff) continue;
    if (b.c > lvl) {
      const vx = avgVol ? b.v / avgVol : null;
      if (opts.minVolumeX && (vx === null || vx < opts.minVolumeX)) continue;
      trig = { ...b, vx }; break;
    }
  }
  const last = closed[closed.length - 1];
  if (last) res.last = { barStart: last.startMin, close: last.c, vsLevelPct: 100 * (last.c / lvl - 1) };
  if (trig) {
    return { ...res, status: 'triggered', phase: local.minutes < s.close ? 'open' : 'after-close', reason: `the ${minToHhmm(trig.startMin)} bar closed above the range high`,
      trigger: { time: minToHhmm(trig.endMin), barStart: minToHhmm(trig.startMin), barIndex: trig.slot, price: +trig.c.toFixed(2), close: trig.c, volume: trig.v, volumeX: trig.vx, pctOver: +(100 * (trig.c / lvl - 1)).toFixed(2) } };
  }
  if (!closed.length) return { ...res, status: 'no-data', phase: 'open', reason: 'no bars yet' };
  if (local.minutes >= cutoff) return { ...res, status: 'expired', phase: local.minutes >= s.close ? 'after-close' : 'after-cutoff', reason: `no close above the range high ${lvl.toFixed(2)} by ${minToHhmm(cutoff)}, the last time for a new entry` };
  const gap = lvl - last.c;
  return { ...res, phase: 'open', reason: `last close ${last.c.toFixed(2)}, ${Math.abs(gap).toFixed(2)} ${gap >= 0 ? 'under' : 'over'} the range high ${lvl.toFixed(2)}` };
}
