import { state, listAll, putItem } from '../../app/state.js';
import { mkt, fmt, universe, stamp, spin, errBox, fmtSigned, isIntraday } from '../../app/ctx.js';
import { loadHistory } from '../../app/data.js';
import { priceChart, sparkline } from '../../ui/charts.js';
import { esc, cls, toast, debounce } from '../../ui/util.js';
import { MARKETS } from '../../core/time.js';
import { pctChange, sma, rsi } from '../../core/indicators.js';
import { PROVIDERS } from '../../core/market/providers.js';

const TFS = [['1m', '1 min'], ['5m', '5 min'], ['15m', '15 min'], ['30m', '30 min'], ['1h', '1 hour'], ['1d', 'Daily'], ['1w', 'Weekly'], ['1M', 'Monthly']];
export default async function (el, ctx) {
  const s = state.settings, m = mkt();
  let sym = ctx.params.get('s'), market = ctx.params.get('m') || s.market, tf = ctx.params.get('tf') || '1d', ov = { sma20: true, sma50: false, bb: false, vwap: false }, tab = 'chart', q = '', cmp = [];
  if (market !== s.market) { s.market = market; }
  const uni = await universe(s.market).catch(() => []);
  sym ||= uni[0]?.symbol;
  const supported = PROVIDERS[s.data.provider]?.intervals || [];
  el.innerHTML = `<div class="grid" style="grid-template-columns:minmax(240px,300px) minmax(0,1fr);align-items:start" id="mx"><div class="card" style="padding:12px"><label class="f"><span class="sr">Search</span><input id="q" type="search" placeholder="Search ${m.exchanges.join(' / ')} stocks…" aria-label="Search stocks"></label><div id="list" style="margin-top:8px;max-height:560px;overflow:auto"></div>
    <details style="margin-top:10px"><summary class="muted" style="cursor:pointer;font-size:13px">Add a symbol manually</summary><form id="addsym" class="row" style="margin-top:8px;flex-wrap:nowrap"><input name="sym" placeholder="e.g. RELIANCE" style="min-width:0" aria-label="Symbol"><button class="btn sm">Add</button></form><p class="faint" style="font-size:12px">Any ticker Yahoo Finance knows. For India type the NSE/BSE code (e.g. RELIANCE).</p></details></div><div id="main2" class="stack"></div></div>
  <style>@media(max-width:900px){#mx{grid-template-columns:minmax(0,1fr)!important}}</style>`;
  const list = el.querySelector('#list'), main = el.querySelector('#main2');
  const drawList = () => { const f = uni.filter((u) => !q || (u.symbol + u.name).toLowerCase().includes(q)); list.innerHTML = f.length ? f.map((u) => `<button class="btn ghost" data-s="${esc(u.symbol)}" style="width:100%;justify-content:space-between;border-radius:10px;min-height:44px;border-color:${u.symbol === sym ? 'var(--green)' : 'transparent'};background:${u.symbol === sym ? 'var(--green-soft)' : 'transparent'}"><span style="text-align:left"><b>${esc(u.symbol)}</b><br><span class="faint" style="font-weight:400;font-size:12px">${esc(u.name)}</span></span><span class="tag">${esc(u.exchange || '')}</span></button>`).join('') : '<div class="empty">No match.</div>'; list.querySelectorAll('[data-s]').forEach((b) => b.addEventListener('click', () => { sym = b.dataset.s; drawList(); show(); })); };
  el.querySelector('#q').addEventListener('input', debounce(async (e) => { q = e.target.value.trim().toLowerCase(); drawList(); if (q.length < 2) return; try { const { searchSymbols } = await import('../../app/data.js'); const res = await searchSymbols(q, s.market); let added = false; for (const r of res) if (!uni.find((u) => u.symbol === r.symbol)) { uni.push(r); added = true; } if (added) drawList(); } catch {} }, 350));
  el.querySelector('#addsym').addEventListener('submit', (e) => { e.preventDefault(); const v = new FormData(e.target).get('sym').toString().trim().toUpperCase(); if (!v) return; if (!uni.find((u) => u.symbol === v)) uni.unshift({ symbol: v, name: v, exchange: s.data.exchange, currency: m.currency, market: s.market }); sym = v; e.target.reset(); drawList(); show(); });
  async function show() {
    if (!sym) { main.innerHTML = '<div class="empty card"><b>No instruments</b>Add a symbol on the left.</div>'; return; }
    main.innerHTML = `<div class="card">${spin('Loading ' + sym + '…')}</div>`;
    let h; try { h = await loadHistory(sym, s.market, tf); } catch (e) { main.innerHTML = `<div class="card"><h3>${esc(sym)}</h3>${errBox(e)}</div>`; return; }
    const bars = h.bars, c = bars.map((b) => b.c), last = c[c.length - 1], chg = pctChange(c, 1), intraday = isIntraday(h.interval);
    const hi = Math.max(...bars.map((b) => b.h ?? b.c)), lo = Math.min(...bars.map((b) => b.l ?? b.c)), info = uni.find((u) => u.symbol === sym);
    const unsupported = supported.length && !supported.includes(tf);
    main.innerHTML = `<div class="card"><div class="row between"><div><div class="row"><h2 style="margin:0">${esc(sym)}</h2><span class="tag">${esc(info?.exchange || '')}</span><span class="tag">trades in ${h.currency}</span></div><div class="muted">${esc(info?.name || sym)}</div></div>
      <div class="right"><div class="kpi" style="margin:0">${fmt(last, h.currency)}</div><span class="${cls(chg)}"><b>${fmtSigned(chg)}</b></span> <span class="faint">last bar vs previous</span></div></div>
      <div style="margin:8px 0">${stamp(h)}</div>${h.note ? `<div class="callout warn" style="margin-bottom:8px">${esc(h.note)}</div>` : ''}${unsupported ? `<div class="callout warn">${tf} bars are not offered by ${esc(PROVIDERS[s.data.provider].name)}.</div>` : ''}
      <div class="row between" style="margin:6px 0 10px"><div class="seg" role="group" aria-label="Timeframe">${TFS.map(([k, t]) => `<button data-tf="${k}" aria-pressed="${tf === k}">${t}</button>`).join('')}</div>
      <div class="row">${[['sma20', 'SMA 20'], ['sma50', 'SMA 50'], ['bb', 'Bollinger'], ['vwap', 'VWAP']].map(([k, t]) => `<label class="chip gray" style="cursor:pointer"><input type="checkbox" data-ov="${k}" ${ov[k] ? 'checked' : ''}> ${t}</label>`).join('')}</div></div>
      <div id="pc"></div></div>
    <div class="tabs" role="tablist"><button data-tab="info" class="${tab === 'info' ? 'on' : ''}">Company &amp; stats</button><button data-tab="compare" class="${tab === 'compare' ? 'on' : ''}">Compare</button></div><div id="tabbody"></div>
    <div class="row"><button class="btn primary" data-go="/app/analyst?s=${encodeURIComponent(sym)}&m=${s.market}">Analyse with AI Analyst</button><button class="btn" data-go="/app/paper?s=${encodeURIComponent(sym)}">Paper trade</button><button class="btn" id="addwl">☆ Add to watchlist</button></div>`;
    const pc = main.querySelector('#pc'); const draw = () => priceChart(pc, bars, { overlays: ov, tz: MARKETS[s.market].tz, intraday, currency: h.currency }); draw();
    main.querySelectorAll('[data-tf]').forEach((b) => b.addEventListener('click', () => { tf = b.dataset.tf; show(); }));
    main.querySelectorAll('[data-ov]').forEach((b) => b.addEventListener('change', () => { ov[b.dataset.ov] = b.checked; draw(); }));
    main.querySelectorAll('[data-go]').forEach((b) => b.addEventListener('click', () => ctx.nav(b.dataset.go)));
    main.querySelector('#addwl').addEventListener('click', async () => { const w = (await listAll('watchlists')); let wl = w[0] || { name: 'My watchlist', symbols: [] }; if (!wl.symbols.find((x) => x.symbol === sym && x.market === s.market)) wl.symbols.push({ symbol: sym, market: s.market, exchange: info?.exchange }); await putItem('watchlists', wl); toast(`${sym} added to "${wl.name}"`); });
    const tb = main.querySelector('#tabbody'), f = (x, d = 2) => (x == null ? '—' : x.toFixed(d));
    const drawTab = async () => {
      main.querySelectorAll('[data-tab]').forEach((b) => b.classList.toggle('on', b.dataset.tab === tab));
      if (tab === 'info') tb.innerHTML = `<div class="card"><div class="grid g4"><div><span class="faint">Last</span><div class="kpi" style="font-size:20px">${fmt(last, h.currency)}</div></div><div><span class="faint">Range in view (${bars.length} bars)</span><div><b>${fmt(lo, h.currency)}</b> – <b>${fmt(hi, h.currency)}</b></div></div><div><span class="faint">SMA 20</span><div><b>${f(sma(c, 20).pop())}</b></div></div><div><span class="faint">RSI 14</span><div><b>${f(rsi(c), 1)}</b></div></div></div>
        <p class="faint" style="margin:12px 0 0;font-size:13px">Company fundamentals (market cap, P/E, financial statements) are not available from this data source. For US filers, see the Earnings Analyst in Trading Tools (bundled SEC fixtures). Currency of trading: <b>${h.currency}</b>${s.displayCurrency !== h.currency ? `; shown here in its own currency, not ${s.displayCurrency}` : ''}.</p></div>`;
      else tb.innerHTML = `<div class="card"><div class="row"><label class="f" style="min-width:200px">Compare with<select id="cmpsel" multiple size="4" aria-label="Symbols to compare">${uni.filter((u) => u.symbol !== sym).map((u) => `<option value="${esc(u.symbol)}" ${cmp.includes(u.symbol) ? 'selected' : ''}>${esc(u.symbol)} — ${esc(u.name)}</option>`).join('')}</select></label><span class="faint" style="font-size:13px">Hold Ctrl / ⌘ to pick up to 3.</span></div><div id="cmpout" style="margin-top:10px"></div></div>`;
      if (tab === 'compare') { const out = tb.querySelector('#cmpout'); const run = async () => { const syms = [sym, ...cmp].slice(0, 4); out.innerHTML = spin(); const rows = []; for (const x of syms) { try { const hh = await loadHistory(x, s.market, '1d'); const cc = hh.bars.map((b) => b.c); const n = Math.min(cc.length, 60); const base = cc[cc.length - n]; rows.push({ x, n, ret: (cc[cc.length - 1] / base - 1) * 100, line: cc.slice(-n).map((v) => v / base * 100), cur: hh.currency, last: cc[cc.length - 1], rsi: rsi(cc) }); } catch (e) { rows.push({ x, err: e.message }); } } out.innerHTML = `<div class="tablewrap"><table><thead><tr><th>Symbol</th><th>Return over window</th><th class="hide-sm">Rebased to 100</th><th class="right">Last</th><th class="right">RSI</th></tr></thead><tbody>${rows.map((r) => r.err ? `<tr><td>${esc(r.x)}</td><td colspan="4" class="down">${esc(r.err)}</td></tr>` : `<tr><td><b>${esc(r.x)}</b></td><td class="${cls(r.ret)}"><b>${fmtSigned(r.ret)}</b> <span class="faint">(${r.n} bars)</span></td><td class="hide-sm">${sparkline(r.line, { w: 140, h: 32 })}</td><td class="right">${fmt(r.last, r.cur)}</td><td class="right">${f(r.rsi, 1)}</td></tr>`).join('')}</tbody></table></div><p class="faint" style="font-size:12.5px">Returns are in each stock's own currency and are price-only (no dividends).</p>`; }; run(); tb.querySelector('#cmpsel').addEventListener('change', (e) => { cmp = [...e.target.selectedOptions].map((o) => o.value).slice(0, 3); run(); }); }
    };
    main.querySelectorAll('[data-tab]').forEach((b) => b.addEventListener('click', () => { tab = b.dataset.tab; drawTab(); })); drawTab();
  }
  drawList(); show();
}
