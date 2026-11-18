import { state } from './state.js';
import { MARKETS, marketStatus, formatInZone } from '../core/time.js';
import { formatMoney, convert } from '../core/money.js';
import { loadHistory, kindLabel } from './data.js';
import { buildAnalysis } from '../core/analyst.js';
import { esc } from '../ui/util.js';

export const mkt = () => MARKETS[state.settings.market];
export const fmt = (x, cur, o) => formatMoney(x, cur || mkt().currency, o);
/** Show an amount in the user's display currency when a rate exists; otherwise in its own currency (never a guessed rate). */
export function fmtDisp(x, from, o) {
  const to = state.settings.displayCurrency; if (from === to || x == null) return fmt(x, from, o);
  const c = convert(x, from, to, state.settings.fx); return c == null ? `${fmt(x, from, o)}` : `${fmt(c, to, o)} <span class="tag" title="Converted from ${from}">≈ from ${from}</span>`;
}
export const isIntraday = (iv) => ['1m', '5m', '15m', '30m', '1h'].includes(iv);
export function statusPill(id) {
  const s = marketStatus(id, Date.now(), state.settings.extraHolidays), m = MARKETS[id];
  return `<span class="pill" title="${esc(s.reason)}. ${esc(m.calendarNote)}"><span class="dot ${s.state === 'open' ? 'on' : s.state === 'pre-open' ? 'amber' : ''}"></span>${m.flag} ${m.exchanges.join('/')} ${s.state === 'open' ? 'open' : s.state === 'pre-open' ? 'pre-open' : 'closed'}<span class="faint hide-sm">· ${s.localTime} ${id === 'IN' ? 'IST' : 'ET'}</span></span>`;
}
export const kindChip = (k) => `<span class="chip ${k === 'realtime' ? '' : k === 'delayed' ? 'blue' : 'gray'}">${kindLabel(k)}</span>`;
export async function analyse(symbol, market, interval = '1d', { cut = 0 } = {}) {
  const hist = await loadHistory(symbol, market, interval);
  const bars = cut > 0 ? hist.bars.slice(0, -cut) : hist.bars;
  const intraday = isIntraday(hist.interval) || (isIntraday(interval) && hist.interval !== '1d');
  const a = buildAnalysis({ symbol, market, currency: hist.currency, bars, dataKind: hist.kind, asOfMs: bars[bars.length - 1]?.t * 1000, source: hist.source, intraday });
  return { hist, bars, analysis: a, intraday };
}
export function stamp(hist) { const m = MARKETS[hist.market]; return `${kindChip(hist.kind)} <span class="faint" style="font-size:12.5px">as of ${formatInZone(hist.asOf, m.tz)} ${hist.market === 'IN' ? 'IST' : 'ET'} · ${esc(hist.source)}</span>`; }
export function simBanner() { return `<div class="sim-banner" role="note">SIMULATED MONEY — paper trading uses virtual funds. Results are not real profit and do not predict live trading outcomes.</div>`; }
export async function universe(market) { const { loadUniverse } = await import('./data.js'); return loadUniverse(market); }
export const fmtSigned = (x, d = 2) => (x == null ? '—' : `${x > 0 ? '+' : ''}${x.toFixed(d)}%`);
export function symbolOptions(list, sel) { return list.map((u) => `<option value="${esc(u.symbol)}" ${u.symbol === sel ? 'selected' : ''}>${esc(u.symbol)} — ${esc(u.name)}</option>`).join(''); }
export function spin(msg = 'Loading…') { return `<div class="loading"><div class="spin"></div>${esc(msg)}</div>`; }
export const errBox = (e) => `<div class="callout bad" role="alert"><b>Couldn't load data.</b> ${esc(e.message || e)}<br><span class="faint">Wait a minute and retry, check the symbol, or see Settings → Market data. Live prices need the Vercel deployment or the Local Edition.</span></div>`;
