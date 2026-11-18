// Dependency-free SVG charts. Colours come from CSS variables so both themes work.
import { sma, bollinger, vwap as vwapOf } from '../core/indicators.js';
import { zonedParts } from '../core/time.js';
const N = (x, d = 2) => (x == null ? '' : Number(x).toFixed(d));
const niceTicks = (min, max, n = 5) => { const span = max - min || 1, step0 = span / n, mag = 10 ** Math.floor(Math.log10(step0)), r = step0 / mag, step = (r < 1.5 ? 1 : r < 3 ? 2 : r < 7 ? 5 : 10) * mag; const out = []; for (let v = Math.ceil(min / step) * step; v <= max + 1e-9; v += step) out.push(+v.toFixed(8)); return out; };

export function sparkline(values, { w = 120, h = 36, up } = {}) {
  if (!values || values.length < 2) return '';
  const mn = Math.min(...values), mx = Math.max(...values), rg = mx - mn || 1;
  const pts = values.map((v, i) => `${(i / (values.length - 1) * (w - 2) + 1).toFixed(1)},${(h - 2 - ((v - mn) / rg) * (h - 4)).toFixed(1)}`);
  const col = (up ?? values[values.length - 1] >= values[0]) ? 'var(--green)' : 'var(--red)';
  return `<svg viewBox="0 0 ${w} ${h}" width="${w}" height="${h}" role="img" aria-label="trend sparkline"><defs><linearGradient id="sg${w}${h}" x1="0" x2="0" y1="0" y2="1"><stop offset="0" stop-color="${col}" stop-opacity=".25"/><stop offset="1" stop-color="${col}" stop-opacity="0"/></linearGradient></defs><polygon points="1,${h} ${pts.join(' ')} ${w - 1},${h}" fill="url(#sg${w}${h})"/><polyline points="${pts.join(' ')}" fill="none" stroke="${col}" stroke-width="2" stroke-linejoin="round" stroke-linecap="round"/></svg>`;
}
export function ring(pct, label, size = 76) {
  const r = (size - 10) / 2, c = 2 * Math.PI * r, p = Math.max(0, Math.min(100, pct));
  return `<svg viewBox="0 0 ${size} ${size}" width="${size}" height="${size}" role="img" aria-label="${label} ${p.toFixed(0)}%"><circle cx="${size / 2}" cy="${size / 2}" r="${r}" fill="none" stroke="var(--bar-neutral)" stroke-width="7"/><circle cx="${size / 2}" cy="${size / 2}" r="${r}" fill="none" stroke="var(--green)" stroke-width="7" stroke-linecap="round" stroke-dasharray="${(c * p / 100).toFixed(1)} ${c}" transform="rotate(-90 ${size / 2} ${size / 2})"/><text x="50%" y="53%" text-anchor="middle" dominant-baseline="middle" style="font-weight:700;font-size:15px;fill:var(--text)">${p.toFixed(0)}%</text></svg>`;
}
export function barChart(items, { w = 420, h = 160 } = {}) { // items [{label, a, b?}]
  const mx = Math.max(...items.flatMap((i) => [i.a, i.b || 0]), 1), bw = w / items.length;
  return `<svg viewBox="0 0 ${w} ${h + 22}" class="chart" role="img">${items.map((it, i) => { const x = i * bw + bw * .18, ww = bw * .64, hh = (it.a / mx) * h; return `<rect x="${x}" y="${h - hh}" width="${it.b != null ? ww / 2 - 1 : ww}" height="${hh}" rx="4" fill="var(--green)"/>${it.b != null ? `<rect x="${x + ww / 2 + 1}" y="${h - (it.b / mx) * h}" width="${ww / 2 - 1}" height="${(it.b / mx) * h}" rx="4" fill="var(--bar-neutral)"/>` : ''}<text x="${x + ww / 2}" y="${h + 16}" text-anchor="middle">${it.label}</text>`; }).join('')}</svg>`;
}

/** Line/area chart of {t,v} points with hover tooltip. Mounts into el and returns nothing. */
export function lineChart(el, pts, { height = 220, fmt = (v) => N(v), area = true, baseline = null, tz = 'UTC', label = '' } = {}) {
  const draw = () => {
    const W = Math.max(280, el.clientWidth || 600), H = height, m = { l: 54, r: 12, t: 10, b: 24 };
    if (!pts.length) { el.innerHTML = '<div class="empty">No data yet.</div>'; return; }
    const vs = pts.map((p) => p.v).concat(baseline != null ? [baseline] : []); let mn = Math.min(...vs), mx = Math.max(...vs); const pad = (mx - mn || 1) * .08; mn -= pad; mx += pad;
    const X = (i) => m.l + (pts.length === 1 ? 0 : i / (pts.length - 1)) * (W - m.l - m.r), Y = (v) => m.t + (1 - (v - mn) / (mx - mn)) * (H - m.t - m.b);
    const ticks = niceTicks(mn, mx, 4), line = pts.map((p, i) => `${i ? 'L' : 'M'}${X(i).toFixed(1)},${Y(p.v).toFixed(1)}`).join('');
    el.innerHTML = `<div class="chartbox"><svg class="chart" viewBox="0 0 ${W} ${H}" role="img" aria-label="${label}"><defs><linearGradient id="lg" x1="0" x2="0" y1="0" y2="1"><stop offset="0" stop-color="var(--green)" stop-opacity=".28"/><stop offset="1" stop-color="var(--green)" stop-opacity="0"/></linearGradient></defs>
      ${ticks.map((t) => `<line class="g" x1="${m.l}" x2="${W - m.r}" y1="${Y(t)}" y2="${Y(t)}"/><text class="axis" x="${m.l - 8}" y="${Y(t) + 4}" text-anchor="end">${fmt(t)}</text>`).join('')}
      ${baseline != null ? `<line x1="${m.l}" x2="${W - m.r}" y1="${Y(baseline)}" y2="${Y(baseline)}" stroke="var(--faint)" stroke-dasharray="4 4"/>` : ''}
      ${area ? `<path d="${line}L${X(pts.length - 1)},${H - m.b}L${X(0)},${H - m.b}Z" fill="url(#lg)"/>` : ''}<path d="${line}" fill="none" stroke="var(--green)" stroke-width="2.2" stroke-linejoin="round"/>
      <line id="ch" y1="${m.t}" y2="${H - m.b}" stroke="var(--faint)" style="display:none"/><circle id="cd" r="4.5" fill="var(--surface)" stroke="var(--green)" stroke-width="2.5" style="display:none"/>
      ${[0, Math.floor(pts.length / 2), pts.length - 1].map((i) => `<text class="axis" x="${X(i)}" y="${H - 6}" text-anchor="${i === 0 ? 'start' : i === pts.length - 1 ? 'end' : 'middle'}">${pts[i].label ?? ''}</text>`).join('')}</svg><div class="tip" style="display:none"></div></div>`;
    const svg = el.querySelector('svg'), tip = el.querySelector('.tip'), ch = svg.querySelector('#ch'), cd = svg.querySelector('#cd');
    const move = (e) => { const r = svg.getBoundingClientRect(), x = (e.clientX - r.left) * (W / r.width); const i = Math.max(0, Math.min(pts.length - 1, Math.round(((x - m.l) / (W - m.l - m.r)) * (pts.length - 1)))); ch.style.display = cd.style.display = tip.style.display = ''; ch.setAttribute('x1', X(i)); ch.setAttribute('x2', X(i)); cd.setAttribute('cx', X(i)); cd.setAttribute('cy', Y(pts[i].v)); tip.innerHTML = `<b>${fmt(pts[i].v)}</b><br><span class="muted">${pts[i].label ?? ''}</span>`; tip.style.left = Math.min(r.width - 120, Math.max(0, (X(i) / W) * r.width + 10)) + 'px'; tip.style.top = '8px'; };
    svg.addEventListener('pointermove', move); svg.addEventListener('pointerleave', () => { ch.style.display = cd.style.display = tip.style.display = 'none'; });
  };
  draw(); if (typeof ResizeObserver !== 'undefined') { let last = el.clientWidth; new ResizeObserver(() => { if (Math.abs(el.clientWidth - last) > 8) { last = el.clientWidth; draw(); } }).observe(el); }
}

/** Candlestick (or close-only line) chart with optional overlays, levels and volume. */
export function priceChart(el, bars, { type = 'auto', overlays = {}, levels = [], height = 380, tz = 'UTC', intraday = false, currency = '', plan = null } = {}) {
  const hasOhlc = bars.length && bars.every((b) => b.o != null && b.h != null && b.l != null);
  const kind = type === 'auto' ? (hasOhlc ? 'candles' : 'line') : type;
  const draw = () => {
    const W = Math.max(300, el.clientWidth || 700), H = height, m = { l: 58, r: 10, t: 10, b: 26 }, hasVol = bars.some((b) => b.v > 0), volH = hasVol ? 56 : 0, ph = H - m.t - m.b - volH;
    if (!bars.length) { el.innerHTML = '<div class="empty"><b>No data</b>Pick another instrument or configure a data provider.</div>'; return; }
    const closes = bars.map((b) => b.c), extra = [];
    const s20 = overlays.sma20 ? sma(closes, 20) : null, s50 = overlays.sma50 ? sma(closes, 50) : null, bb = overlays.bb ? bollinger(closes) : null;
    let vw = null; if (overlays.vwap && hasOhlc) { vw = []; let pv = 0, v = 0, day = null; bars.forEach((b, i) => { const d = zonedParts(b.t * 1000, tz).date; if (d !== day) { pv = 0; v = 0; day = d; } const tp = (b.h + b.l + b.c) / 3; pv += tp * (b.v || 0); v += b.v || 0; vw.push(v ? pv / v : null); }); }
    const lows = bars.map((b) => b.l ?? b.c), highs = bars.map((b) => b.h ?? b.c);
    let mn = Math.min(...lows), mx = Math.max(...highs); if (bb) bb.forEach((x) => { if (x) { mn = Math.min(mn, x.lower); mx = Math.max(mx, x.upper); } });
    levels.forEach((l) => { if (l.price != null) { mn = Math.min(mn, l.price); mx = Math.max(mx, l.price); } });
    const pad = (mx - mn || 1) * .06; mn -= pad; mx += pad;
    const n = bars.length, cw = (W - m.l - m.r) / n, X = (i) => m.l + (i + .5) * cw, Y = (v) => m.t + (1 - (v - mn) / (mx - mn)) * ph;
    const vmax = hasVol ? Math.max(...bars.map((b) => b.v || 0)) : 1, ticks = niceTicks(mn, mx, 5);
    const path = (arr) => arr.map((v, i) => (v == null ? null : `${arr.slice(0, i).some((x) => x != null) && arr[i - 1] != null ? 'L' : 'M'}${X(i).toFixed(1)},${Y(v).toFixed(1)}`)).filter(Boolean).join('');
    const fmtT = (b) => { const p = zonedParts(b.t * 1000, tz); return intraday ? `${p.date.slice(5)} ${String(p.hour).padStart(2, '0')}:${String(p.minute).padStart(2, '0')}` : p.date; };
    let body = '';
    if (kind === 'candles') bars.forEach((b, i) => { const up = b.c >= b.o, col = up ? 'var(--green)' : 'var(--red)', bw = Math.max(1, Math.min(14, cw * .66)); body += `<line x1="${X(i)}" x2="${X(i)}" y1="${Y(b.h)}" y2="${Y(b.l)}" stroke="${col}" stroke-width="1.2"/><rect x="${X(i) - bw / 2}" y="${Y(Math.max(b.o, b.c))}" width="${bw}" height="${Math.max(1, Math.abs(Y(b.o) - Y(b.c)))}" fill="${up ? 'var(--green)' : 'var(--red)'}" rx="1"/>`; });
    else body += `<path d="${path(closes)}L${X(n - 1)},${m.t + ph}L${X(0)},${m.t + ph}Z" fill="var(--green)" opacity=".12"/><path d="${path(closes)}" fill="none" stroke="var(--green)" stroke-width="2.2" stroke-linejoin="round"/>`;
    const vol = hasVol ? bars.map((b, i) => `<rect x="${X(i) - Math.max(1, cw * .33)}" y="${H - m.b - ((b.v || 0) / vmax) * (volH - 6)}" width="${Math.max(1, cw * .66)}" height="${((b.v || 0) / vmax) * (volH - 6)}" fill="${b.c >= (b.o ?? b.c) ? 'var(--green)' : 'var(--red)'}" opacity=".35"/>`).join('') : '';
    const lv = levels.filter((l) => l.price != null).map((l) => `<line x1="${m.l}" x2="${W - m.r}" y1="${Y(l.price)}" y2="${Y(l.price)}" stroke="${l.color || 'var(--faint)'}" stroke-dasharray="5 4" stroke-width="1.3"/><text x="${W - m.r - 4}" y="${Y(l.price) - 4}" text-anchor="end" style="fill:${l.color || 'var(--muted)'};font-weight:600">${l.label} ${N(l.price)}</text>`).join('');
    const xl = [0, Math.floor(n / 3), Math.floor(2 * n / 3), n - 1].map((i) => `<text class="axis" x="${X(i)}" y="${H - 8}" text-anchor="${i === 0 ? 'start' : i === n - 1 ? 'end' : 'middle'}">${fmtT(bars[i]).slice(0, 16)}</text>`).join('');
    el.innerHTML = `<div class="chartbox"><svg class="chart" viewBox="0 0 ${W} ${H}" role="img" aria-label="Price chart"><g>${ticks.map((t) => `<line class="g" x1="${m.l}" x2="${W - m.r}" y1="${Y(t)}" y2="${Y(t)}"/><text class="axis" x="${m.l - 8}" y="${Y(t) + 4}" text-anchor="end">${N(t, mx - mn < 5 ? 2 : mx - mn < 50 ? 1 : 0)}</text>`).join('')}</g>
      ${bb ? `<path d="${path(bb.map((x) => x && x.upper))}" fill="none" stroke="var(--blue)" stroke-width="1" opacity=".6"/><path d="${path(bb.map((x) => x && x.lower))}" fill="none" stroke="var(--blue)" stroke-width="1" opacity=".6"/>` : ''}
      ${body}${s20 ? `<path d="${path(s20)}" fill="none" stroke="#E0A100" stroke-width="1.6"/>` : ''}${s50 ? `<path d="${path(s50)}" fill="none" stroke="#8A5CF6" stroke-width="1.6"/>` : ''}${vw ? `<path d="${path(vw)}" fill="none" stroke="#E5484D" stroke-width="1.4" stroke-dasharray="3 3"/>` : ''}${vol}${lv}${xl}
      <line id="ch" y1="${m.t}" y2="${m.t + ph}" stroke="var(--faint)" style="display:none"/></svg><div class="tip" style="display:none"></div></div>
      <div class="legend" style="margin-top:6px">${s20 ? '<span><i style="background:#E0A100"></i>SMA 20</span>' : ''}${s50 ? '<span><i style="background:#8A5CF6"></i>SMA 50</span>' : ''}${bb ? '<span><i style="background:var(--blue)"></i>Bollinger</span>' : ''}${vw ? '<span><i style="background:#E5484D"></i>VWAP (session)</span>' : ''}</div>`;
    const svg = el.querySelector('svg'), tip = el.querySelector('.tip'), ch = svg.querySelector('#ch');
    svg.addEventListener('pointermove', (e) => { const r = svg.getBoundingClientRect(), x = (e.clientX - r.left) * (W / r.width), i = Math.max(0, Math.min(n - 1, Math.floor((x - m.l) / cw))), b = bars[i]; ch.style.display = tip.style.display = ''; ch.setAttribute('x1', X(i)); ch.setAttribute('x2', X(i));
      tip.innerHTML = `<b>${fmtT(b)}</b><br>${b.o != null ? `O ${N(b.o)} H ${N(b.h)}<br>L ${N(b.l)} ` : ''}C <b>${N(b.c)}</b> ${currency}${b.v ? `<br>Vol ${Number(b.v).toLocaleString()}` : ''}`; const left = (X(i) / W) * r.width; tip.style.left = (left > r.width / 2 ? left - 150 : left + 12) + 'px'; tip.style.top = '8px'; });
    svg.addEventListener('pointerleave', () => { ch.style.display = tip.style.display = 'none'; });
  };
  draw(); if (typeof ResizeObserver !== 'undefined') { let last = el.clientWidth; const ro = new ResizeObserver(() => { if (Math.abs(el.clientWidth - last) > 8) { last = el.clientWidth; draw(); } }); ro.observe(el); }
}
/** Fan chart from percentile bands [[q05,q25,q50,q75,q95], ...] */
export function fanChart(el, bands, { entry, stop, target, height = 240, labels = [] } = {}) {
  const W = Math.max(300, el.clientWidth || 600), H = height, m = { l: 54, r: 10, t: 10, b: 22 }, n = bands.length;
  const all = bands.flat().concat([entry, stop, target].filter((x) => x != null)); let mn = Math.min(...all), mx = Math.max(...all); const pad = (mx - mn) * .06; mn -= pad; mx += pad;
  const X = (i) => m.l + (i / Math.max(1, n - 1)) * (W - m.l - m.r), Y = (v) => m.t + (1 - (v - mn) / (mx - mn)) * (H - m.t - m.b);
  const band = (a, b, op) => `<path d="${bands.map((x, i) => `${i ? 'L' : 'M'}${X(i)},${Y(x[b])}`).join('')}${bands.map((x, i) => `L${X(n - 1 - i)},${Y(bands[n - 1 - i][a])}`).join('')}Z" fill="var(--green)" opacity="${op}"/>`;
  const hl = (v, c, t) => v == null ? '' : `<line x1="${m.l}" x2="${W - m.r}" y1="${Y(v)}" y2="${Y(v)}" stroke="${c}" stroke-dasharray="5 4"/><text x="${W - m.r - 4}" y="${Y(v) - 4}" text-anchor="end" style="fill:${c};font-weight:600">${t} ${N(v)}</text>`;
  el.innerHTML = `<svg class="chart" viewBox="0 0 ${W} ${H}" role="img" aria-label="Simulated price fan">${niceTicks(mn, mx, 4).map((t) => `<line class="g" x1="${m.l}" x2="${W - m.r}" y1="${Y(t)}" y2="${Y(t)}"/><text class="axis" x="${m.l - 8}" y="${Y(t) + 4}" text-anchor="end">${N(t)}</text>`).join('')}${band(0, 4, .14)}${band(1, 3, .22)}<path d="${bands.map((x, i) => `${i ? 'L' : 'M'}${X(i)},${Y(x[2])}`).join('')}" fill="none" stroke="var(--green-strong)" stroke-width="2"/>${hl(target, 'var(--green-strong)', 'Target')}${hl(stop, 'var(--red)', 'Stop')}${hl(entry, 'var(--muted)', 'Entry')}<text class="axis" x="${m.l}" y="${H - 6}">${labels[0] || 'entry'}</text><text class="axis" x="${W - m.r}" y="${H - 6}" text-anchor="end">${labels[1] || 'end of session'}</text></svg>`;
}
