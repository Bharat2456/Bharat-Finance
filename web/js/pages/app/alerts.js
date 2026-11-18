import { state, listAll, putItem, delItem } from '../../app/state.js';
import { universe, fmt, symbolOptions, spin } from '../../app/ctx.js';
import { loadHistory } from '../../app/data.js';
import { evaluateAlerts } from '../../core/alerts.js';
import { esc, toast } from '../../ui/util.js';

export default async function (el, ctx) {
  const s = state.settings, uni = await universe(s.market).catch(() => []);
  async function check(silent) {
    const alerts = await listAll('alerts'); const px = {}, prev = {};
    for (const a of alerts) { if (px[a.symbol] != null) continue; try { const h = await loadHistory(a.symbol, a.market, '1d'); px[a.symbol] = h.bars.at(-1).c; prev[a.symbol] = h.bars.at(-2)?.c; } catch {} }
    const r = evaluateAlerts(alerts, px, prev); for (const a of r.alerts) await putItem('alerts', a);
    if (r.rung.length && !silent) toast(r.rung.map((a) => `🔔 ${a.symbol} ${a.type} ${a.price ?? a.pct + '%'} (now ${a.rungPrice})`).join(' · '), 6000); return r;
  }
  async function draw() {
    const list = await listAll('alerts');
    el.innerHTML = `<div class="callout warn"><b>Browser alerts only work while this tab is open.</b> They compare against the latest price this app has loaded (live delayed prices; the page re-checks when you press Refresh). For always-on alerts use the Python alerts tool.</div>
    <div class="card"><h3>New alert</h3><form id="af" class="row"><label class="f" style="min-width:200px;flex:1">Stock<select name="sym">${symbolOptions(uni)}</select></label><label class="f">Type<select name="type"><option value="above">Price at or above</option><option value="below">Price at or below</option><option value="pct_move">Moves by %</option></select></label><label class="f">Price / %<input name="v" type="number" step="any" required></label><button class="btn primary" style="align-self:end">Add</button></form></div>
    <div class="card"><div class="row between"><h3 style="margin:0">Your alerts</h3><button class="btn sm" id="chk">Check now</button></div>${list.length ? `<div class="tablewrap"><table><thead><tr><th>Stock</th><th>Rule</th><th>Status</th><th></th></tr></thead><tbody>${list.map((a) => `<tr><td><b>${esc(a.symbol)}</b></td><td>${a.type === 'pct_move' ? `moves ±${a.pct}%` : a.type === 'above' ? `≥ ${a.price}` : `≤ ${a.price}`}</td><td><span class="chip ${a.status === 'rung' ? 'amber' : 'gray'}">${a.status === 'rung' ? `rang at ${a.rungPrice}` : 'armed'}</span></td><td class="right"><button class="btn sm ghost" data-d="${a.id}" aria-label="Delete alert">✕</button></td></tr>`).join('')}</tbody></table></div>` : '<div class="empty"><b>No alerts</b>Add one above.</div>'}</div>`;
    el.querySelector('#af').addEventListener('submit', async (e) => { e.preventDefault(); const f = new FormData(e.target), t = f.get('type'), v = +f.get('v'); await putItem('alerts', { symbol: f.get('sym'), market: s.market, type: t, price: t === 'pct_move' ? undefined : v, pct: t === 'pct_move' ? v : undefined, direction: 'any', status: 'armed', createdAt: Date.now() }); await check(true); draw(); });
    el.querySelector('#chk').addEventListener('click', async () => { const r = await check(false); if (!r.rung.length) toast('Nothing triggered'); draw(); });
    el.querySelectorAll('[data-d]').forEach((b) => b.addEventListener('click', async () => { await delItem('alerts', b.dataset.d); draw(); }));
  }
  draw();
}
