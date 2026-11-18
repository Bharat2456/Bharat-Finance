import { state, listAll, putItem, delItem } from '../../app/state.js';
import { mkt, fmt, universe, spin, fmtSigned } from '../../app/ctx.js';
import { loadHistory } from '../../app/data.js';
import { sparkline } from '../../ui/charts.js';
import { pctChange } from '../../core/indicators.js';
import { esc, cls, toast } from '../../ui/util.js';

export default async function (el, ctx) {
  const s = state.settings, uni = await universe(s.market).catch(() => []);
  async function draw() {
    const wls = await listAll('watchlists');
    el.innerHTML = `<div class="row between"><p class="muted" style="margin:0">Lists live only on this device.</p><form id="nw" class="row"><input name="n" placeholder="New watchlist name" style="width:220px" aria-label="Watchlist name"><button class="btn primary">Create</button></form></div>${wls.length ? '' : '<div class="card empty"><b>No watchlists yet</b>Create one, then add stocks from here or from Markets.</div>'}<div id="wl" class="stack"></div>`;
    const host = el.querySelector('#wl');
    for (const w of wls) {
      const card = document.createElement('div'); card.className = 'card'; card.innerHTML = `<div class="row between"><h3 style="margin:0">${esc(w.name)}</h3><div class="row"><select data-add="${w.id}" aria-label="Add stock to ${esc(w.name)}" style="width:200px"><option value="">+ Add stock…</option>${uni.filter((u) => !w.symbols.find((x) => x.symbol === u.symbol && x.market === s.market)).map((u) => `<option value="${esc(u.symbol)}">${esc(u.symbol)} — ${esc(u.name)}</option>`).join('')}</select><button class="btn sm danger" data-rm="${w.id}">Delete list</button></div></div><div class="tablewrap" id="t${w.id}">${spin()}</div>`; host.appendChild(card);
      const rowsHtml = []; for (const x of w.symbols) { try { const h = await loadHistory(x.symbol, x.market, '1d'), c = h.bars.map((b) => b.c); rowsHtml.push(`<tr><td><b>${esc(x.symbol)}</b> <span class="tag">${x.market}</span></td><td class="hide-sm">${sparkline(c.slice(-30), { w: 90, h: 26 })}</td><td class="right">${fmt(c.at(-1), h.currency)}</td><td class="right ${cls(pctChange(c, 1))}">${fmtSigned(pctChange(c, 1))}</td><td class="right"><a class="btn sm" href="/app/analyst?s=${encodeURIComponent(x.symbol)}&m=${x.market}">Analyse</a> <button class="btn sm ghost" data-del="${w.id}|${esc(x.symbol)}" aria-label="Remove ${esc(x.symbol)}">✕</button></td></tr>`); } catch (e) { rowsHtml.push(`<tr><td><b>${esc(x.symbol)}</b></td><td colspan="4" class="faint">${esc(e.message)} <button class="btn sm ghost" data-del="${w.id}|${esc(x.symbol)}">✕</button></td></tr>`); } }
      card.querySelector('#t' + w.id).innerHTML = w.symbols.length ? `<table><tbody>${rowsHtml.join('')}</tbody></table>` : '<div class="empty">Empty list.</div>';
    }
    el.querySelector('#nw').addEventListener('submit', async (e) => { e.preventDefault(); const n = new FormData(e.target).get('n').toString().trim(); if (n) { await putItem('watchlists', { name: n, symbols: [] }); draw(); } });
    el.querySelectorAll('[data-add]').forEach((sel) => sel.addEventListener('change', async () => { if (!sel.value) return; const w = wls.find((z) => z.id === sel.dataset.add); w.symbols.push({ symbol: sel.value, market: s.market, exchange: uni.find((u) => u.symbol === sel.value)?.exchange }); await putItem('watchlists', w); draw(); }));
    el.querySelectorAll('[data-rm]').forEach((b) => b.addEventListener('click', async () => { if (confirm('Delete this watchlist?')) { await delItem('watchlists', b.dataset.rm); draw(); } }));
    el.querySelectorAll('[data-del]').forEach((b) => b.addEventListener('click', async () => { const [id, sy] = b.dataset.del.split('|'), w = wls.find((z) => z.id === id); w.symbols = w.symbols.filter((x) => x.symbol !== sy); await putItem('watchlists', w); draw(); }));
  }
  draw();
}
