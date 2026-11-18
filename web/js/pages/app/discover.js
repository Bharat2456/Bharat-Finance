import { state } from '../../app/state.js';
import { mkt, fmt, universe, spin, fmtSigned, kindChip, errBox } from '../../app/ctx.js';
import { loadMany } from '../../app/data.js';
import { scanDaily, SETUP_LABELS } from '../../core/signals.js';
import { sparkline } from '../../ui/charts.js';
import { pctChange } from '../../core/indicators.js';
import { esc, cls } from '../../ui/util.js';

export default async function (el, ctx) {
  const s = state.settings, m = mkt(); el.innerHTML = spin('Scanning the universe…');
  const uni = await universe(s.market).catch(() => []), rows = [];
  let many = {}, fail = null; try { many = await loadMany(uni.map((u) => u.symbol), s.market, '1d'); } catch (e) { fail = e; }
  for (const u of uni) { const h = many[u.symbol]; if (!h?.bars?.length) { fail = fail || new Error(h?.error || 'No data'); continue; } const c = h.bars.map((b) => b.c); rows.push({ ...u, c, h, chg: pctChange(c, 1), last: c.at(-1), cur: h.currency }); }
  if (!rows.length) { el.innerHTML = errBox(fail || new Error('No symbols to scan.')); return; }
  const hits = scanDaily(Object.fromEntries(rows.map((r) => [r.symbol, { c: r.c }]))), by = Object.fromEntries(rows.map((r) => [r.symbol, r]));
  const sorted = [...rows].sort((a, b) => (b.chg ?? 0) - (a.chg ?? 0));
  const mv = (r) => `<tr class="click" data-go="/app/analyst?s=${encodeURIComponent(r.symbol)}"><td><b>${esc(r.symbol)}</b></td><td class="hide-sm">${sparkline(r.c.slice(-30), { w: 80, h: 24 })}</td><td class="right">${fmt(r.last, r.cur)}</td><td class="right ${cls(r.chg)}"><b>${fmtSigned(r.chg)}</b></td></tr>`;
  el.innerHTML = `<div class="callout"><b>Chart scanner</b> It applies fixed rules to daily closes: 20-day breakout, bull flag, 20-day-average reclaim, oversold RSI &lt; 30 and oversold bounce. A match describes what price already did; it is not a buy signal. ${rows[0] ? kindChip(rows[0].h.kind) : ''}</div>
  <div class="grid g2" style="align-items:start"><div class="card"><h3>Setups matched in ${m.name} (${rows.length} stocks scanned)</h3>${hits.length ? `<div class="tablewrap"><table><thead><tr><th>Stock</th><th>Rules matched</th><th class="right">RSI</th></tr></thead><tbody>${hits.map((h) => `<tr class="click" data-go="/app/analyst?s=${encodeURIComponent(h.symbol)}"><td><b>${esc(h.symbol)}</b><div class="faint" style="font-size:12px">${fmt(h.price, by[h.symbol].cur)}</div></td><td>${h.setups.map((t) => `<span class="chip gray" title="${esc(SETUP_LABELS[t][1])}">${esc(SETUP_LABELS[t][0])}</span>`).join(' ')}</td><td class="right">${h.rsi.toFixed(1)}</td></tr>`).join('')}</tbody></table></div>` : '<div class="empty"><b>No rule matched</b>That is normal on most days.</div>'}</div>
  <div class="grid"><div class="card"><h3>Top gainers (last bar)</h3><table><tbody>${sorted.slice(0, 5).map(mv).join('')}</tbody></table></div><div class="card"><h3>Top losers (last bar)</h3><table><tbody>${sorted.slice(-5).reverse().map(mv).join('')}</tbody></table></div></div></div>`;
  el.querySelectorAll('[data-go]').forEach((r) => r.addEventListener('click', () => ctx.nav(r.dataset.go)));
}
