import { state, activeAccount, listAll, saveSettings } from '../../app/state.js';
import { mkt, fmt, fmtDisp, statusPill, universe, simBanner, fmtSigned, spin, kindChip } from '../../app/ctx.js';
import { loadMany } from '../../app/data.js';
import { equityOf, statistics } from '../../core/paper.js';
import { sparkline, ring, lineChart } from '../../ui/charts.js';
import { LESSONS } from '../../content/learning.js';
import { scanDaily, SETUP_LABELS } from '../../core/signals.js';
import { esc, cls } from '../../ui/util.js';
import { pctChange } from '../../core/indicators.js';
import { MARKETS } from '../../core/time.js';

export default async function (el, ctx) {
  const s = state.settings, m = mkt(), adv = s.dashboardMode === 'advanced';
  el.innerHTML = spin('Loading your dashboard…');
  const [uni, preds, journal, wls] = await Promise.all([universe(s.market).catch(() => []), listAll('predictions'), listAll('journal'), listAll('watchlists')]);
  const hists = []; let err = null;
  { const list = uni.slice(0, 14); let many = {}; try { many = await loadMany(list.map((u) => u.symbol), s.market, '1d'); } catch (e) { err = e; } for (const u of list) { const h = many[u.symbol]; if (h?.bars?.length) hists.push({ u, h }); else err = err || new Error(h?.error || 'No data'); } }
  const rows = hists.map(({ u, h }) => { const c = h.bars.map((b) => b.c); return { ...u, last: c[c.length - 1], chg: pctChange(c, 1), c, kind: h.kind, cur: h.currency, scan: c.length >= 30 ? c : null }; }).sort((a, b) => (b.chg ?? 0) - (a.chg ?? 0));
  const acct = activeAccount(), st = acct ? statistics(acct, Object.fromEntries(Object.entries(acct.positions).map(([k, p]) => [k, p.lastPrice ?? p.avgCost]))) : null;
  const done = Object.keys(s.learning.done).length, pct = (done / LESSONS.length) * 100;
  const hits = scanDaily(Object.fromEntries(rows.filter((r) => r.scan).map((r) => [r.symbol, { c: r.c }])));
  const lastKind = rows[0]?.kind;
  const mover = (r) => `<tr class="click" data-go="/app/markets?s=${encodeURIComponent(r.symbol)}&m=${s.market}"><td><b>${esc(r.symbol)}</b><div class="faint" style="font-size:12px">${esc(r.name)}</div></td><td class="hide-sm">${sparkline(r.c.slice(-30), { w: 90, h: 28 })}</td><td class="right">${fmt(r.last, r.cur)}</td><td class="right ${cls(r.chg)}"><b>${fmtSigned(r.chg)}</b></td></tr>`;
  el.innerHTML = `<div class="row between"><div><h2 style="margin:0">Welcome back 👋</h2><p class="muted" style="margin:2px 0 0">${m.flag} ${m.name} · display currency ${s.displayCurrency} · ${statusPill(s.market)}</p></div>
    <div class="seg" role="group" aria-label="Dashboard mode"><button data-mode="beginner" aria-pressed="${!adv}">Beginner</button><button data-mode="advanced" aria-pressed="${adv}">Advanced</button></div></div>
  ${lastKind ? `<div class="callout">${kindChip(lastKind)} <b>Live market data</b> from Yahoo Finance via this app's data service. It is unofficial and usually delayed, so it is not a trading-grade feed. Paper trades use these prices with simulated money.</div>` : ''}
  <div class="grid g4">
    <div class="card"><h3>Paper balance <span class="chip gray">SIMULATED</span></h3>${acct ? `<div class="kpi">${fmt(st.equity, acct.currency)}</div><span class="${cls(st.returnPct)}">${fmtSigned(st.returnPct)}</span> <span class="faint">since start</span>` : `<p class="muted">No paper account yet.</p><a class="btn primary sm" href="/app/paper">Create one</a>`}</div>
    <div class="card"><h3>Realised P&amp;L (simulated)</h3>${acct ? `<div class="kpi ${cls(st.realisedPnl)}">${fmt(st.realisedPnl, acct.currency, { signed: true })}</div><span class="faint">${st.trades} closed trades</span>` : '<div class="kpi">—</div>'}</div>
    <div class="card"><h3>Risk summary</h3>${acct ? `<div class="faint" style="font-size:13px">Max loss / trade <b class="muted">${fmt(acct.rules.maxLossPerTrade, acct.currency)}</b><br>Daily loss limit <b class="muted">${fmt(acct.rules.maxDailyLoss, acct.currency)}</b><br>Max drawdown <b class="muted">${st.maxDrawdownPct.toFixed(1)}%</b><br>Kill switch <b class="${acct.killSwitch ? 'down' : 'muted'}">${acct.killSwitch ? 'ON' : 'off'}</b></div>` : '<p class="muted">Set after you create an account.</p>'}</div>
    <div class="card"><h3>Learning progress</h3><div class="row" style="flex-wrap:nowrap">${ring(pct, 'Lessons')}<div><b>${done} / ${LESSONS.length}</b> lessons<br><a href="/app/learning">Continue →</a></div></div></div></div>
  <div class="grid" style="grid-template-columns:minmax(0,1.5fr) minmax(0,1fr)"><div class="card"><h3>${m.name} — stock movements <span class="faint" style="font-weight:400;font-size:13px">(last bar vs previous)</span></h3>${err && !rows.length ? `<div class="callout bad">${esc(err.message)}</div>` : rows.length ? `<div class="tablewrap"><table><thead><tr><th>Stock</th><th class="hide-sm">30 bars</th><th class="right">Last</th><th class="right">Change</th></tr></thead><tbody>${rows.slice(0, adv ? 10 : 6).map(mover).join('')}</tbody></table></div>` : '<div class="empty"><b>No instruments</b>Add symbols to a watchlist to see them here.</div>'}</div>
    <div class="grid" style="align-content:start"><div class="card"><h3>Watchlists</h3>${wls.length ? wls.map((w) => `<div class="row between"><span>${esc(w.name)}</span><span class="chip gray">${(w.symbols || []).length}</span></div>`).join('') : '<p class="muted" style="margin:0">No watchlists yet. <a href="/app/watchlists">Create one</a>.</p>'}</div>
    <div class="card"><h3>Recent analysis &amp; predictions</h3>${preds.length ? preds.sort((a, b) => b.madeAt - a.madeAt).slice(0, 4).map((p) => `<div class="row between" style="padding:4px 0"><span><b>${esc(p.symbol)}</b> <span class="faint">${p.horizonDays}d ${p.backtest ? '· backtest' : ''}</span></span><span class="chip ${p.status === 'resolved' ? '' : 'gray'}">${p.status}</span></div>`).join('') : '<p class="muted" style="margin:0">Nothing yet. Open the <a href="/app/analyst">AI Analyst</a>.</p>'}</div></div></div>
  ${adv ? `<div class="grid g2"><div class="card"><h3>Equity curve (simulated)</h3><div id="eq">${acct && acct.equityCurve.length > 1 ? '' : '<div class="empty">No trades yet.</div>'}</div></div><div class="card"><h3>Scanner: setups matched today</h3>${hits.length ? hits.slice(0, 8).map((h) => `<div class="row between" style="padding:5px 0"><b>${esc(h.symbol)}</b><span class="row" style="gap:4px">${h.setups.map((t) => `<span class="chip gray" title="${esc(SETUP_LABELS[t][1])}">${esc(SETUP_LABELS[t][0])}</span>`).join('')}</span></div>`).join('') : '<p class="muted">No rule matched in this universe.</p>'}<p class="faint" style="font-size:12px;margin:8px 0 0">Rule matches describe what price did. They are not buy signals.</p></div></div>` : ''}
  ${acct ? simBanner() : ''}`;
  el.querySelectorAll('[data-mode]').forEach((b) => b.addEventListener('click', async () => { s.dashboardMode = b.dataset.mode; await saveSettings(); ctx.rerender(); }));
  el.querySelectorAll('[data-go]').forEach((r) => r.addEventListener('click', () => ctx.nav(r.dataset.go)));
  if (adv && acct && acct.equityCurve.length > 1) lineChart(el.querySelector('#eq'), acct.equityCurve.map((e) => ({ v: e.equity, label: new Date(e.t).toLocaleString() })), { fmt: (v) => fmt(v, acct.currency, { compact: true }), baseline: acct.startBalance, label: 'Equity curve' });
}
