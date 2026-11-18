export const esc = (s) => String(s ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
const P = {
  home: 'M3 11l9-8 9 8M5 10v10h14V10', chart: 'M5 20V11M5 7V4M12 20v-7M12 9V4M19 20V9M19 5V4M3 20h18', compass: 'M12 22a10 10 0 100-20 10 10 0 000 20zM16 8l-2 6-6 2 2-6z',
  ai: 'M12 3l1.8 5.2L19 10l-5.2 1.8L12 17l-1.8-5.2L5 10l5.2-1.8zM19 16l.7 2 2 .7-2 .7-.7 2-.7-2-2-.7 2-.7z', target: 'M12 22a10 10 0 100-20 10 10 0 000 20zM12 18a6 6 0 100-12 6 6 0 000 12zM12 14a2 2 0 100-4 2 2 0 000 4z',
  wallet: 'M3 7h16a2 2 0 012 2v9a2 2 0 01-2 2H5a2 2 0 01-2-2zM3 7l2-3h12M16 14h2', book: 'M4 4h6a3 3 0 013 3v13a2 2 0 00-2-2H4zM20 4h-6a3 3 0 00-3 3v13a2 2 0 012-2h7z',
  star: 'M12 3l2.7 5.6 6.1.9-4.4 4.3 1 6.1L12 17l-5.4 2.9 1-6.1L3.2 9.5l6.1-.9z', bell: 'M18 8a6 6 0 10-12 0c0 7-3 8-3 8h18s-3-1-3-8M10 21a2 2 0 004 0',
  notebook: 'M6 3h12a1 1 0 011 1v16a1 1 0 01-1 1H6zM6 3v18M10 8h5M10 12h5', tool: 'M14.7 6.3a4 4 0 005 5L10 21l-4-4zM15 6l3-3', grid: 'M4 4h7v7H4zM13 4h7v7h-7zM4 13h7v7H4zM13 13h7v7h-7z',
  settings: 'M4 6h10M18 6h2M4 12h4M12 12h8M4 18h12M20 18h0M14 4v4M8 10v4M16 16v4', shield: 'M12 3l8 3v6c0 5-3.5 8-8 9-4.5-1-8-4-8-9V6z', lock: 'M6 11h12v9H6zM8 11V8a4 4 0 018 0v3',
  code: 'M8 6l-6 6 6 6M16 6l6 6-6 6', linkedin: 'M4 9h4v11H4zM6 4a2 2 0 110 4 2 2 0 010-4zM10 9h4v2c.8-1.4 2.2-2.2 4-2.2 3 0 4 2 4 5V20h-4v-5.5c0-1.5-.5-2.3-1.8-2.3S14 13 14 14.5V20h-4z',
  instagram: 'M7 3h10a4 4 0 014 4v10a4 4 0 01-4 4H7a4 4 0 01-4-4V7a4 4 0 014-4zM12 16a4 4 0 100-8 4 4 0 000 8zM17.5 6.5h.01', x: 'M4 4l16 16M20 4L4 20',
  sun: 'M12 17a5 5 0 100-10 5 5 0 000 10zM12 1v3M12 20v3M4.2 4.2l2.1 2.1M17.7 17.7l2.1 2.1M1 12h3M20 12h3M4.2 19.8l2.1-2.1M17.7 6.3l2.1-2.1', moon: 'M21 13A9 9 0 1111 3a7 7 0 0010 10z',
  menu: 'M4 6h16M4 12h16M4 18h16', search: 'M11 19a8 8 0 100-16 8 8 0 000 16zM21 21l-4.3-4.3', more: 'M5 12h.01M12 12h.01M19 12h.01', check: 'M5 12l5 5L20 7', alert: 'M12 3l10 18H2zM12 10v5M12 18h.01',
  trend: 'M3 17l6-6 4 4 8-8M15 7h6v6', globe: 'M12 22a10 10 0 100-20 10 10 0 000 20zM2 12h20M12 2c3 3 4 6.5 4 10s-1 7-4 10c-3-3-4-6.5-4-10s1-7 4-10z', x2: 'M6 6l12 12M18 6L6 18', play: 'M7 4l13 8-13 8z', db: 'M12 8c4.4 0 8-1.3 8-3s-3.6-3-8-3-8 1.3-8 3 3.6 3 8 3zM4 5v14c0 1.7 3.6 3 8 3s8-1.3 8-3V5M4 12c0 1.7 3.6 3 8 3s8-1.3 8-3',
};
export const icon = (n, cls = '') => `<svg viewBox="0 0 24 24" aria-hidden="true" class="${cls}"><path d="${P[n] || P.grid}"/></svg>`;
export function toast(msg, ms = 3200) { const t = document.createElement('div'); t.className = 'toast'; t.setAttribute('role', 'status'); t.textContent = msg; document.body.appendChild(t); setTimeout(() => t.remove(), ms); }
export const $ = (s, r = document) => r.querySelector(s); export const $$ = (s, r = document) => [...r.querySelectorAll(s)];
export function download(name, text, type = 'application/json') { const a = document.createElement('a'); a.href = URL.createObjectURL(new Blob([text], { type })); a.download = name; a.click(); setTimeout(() => URL.revokeObjectURL(a.href), 1000); }
export const cls = (x) => (x > 0 ? 'up' : x < 0 ? 'down' : '');
export function setTheme(t) { document.documentElement.setAttribute('data-theme', t); try { sessionStorage.setItem('bf-theme', t); } catch {} const m = document.querySelector('meta[name="theme-color"]'); if (m) m.setAttribute('content', t === 'dark' ? '#0B1210' : '#EEF1F5'); }
export const getTheme = () => document.documentElement.getAttribute('data-theme') || 'light';
export function themeButton() { const dark = getTheme() === 'dark'; return `<button class="iconbtn themebtn" data-act="theme" aria-label="Switch to ${dark ? 'light' : 'dark'} theme" title="Toggle theme">${icon(dark ? 'sun' : 'moon')}</button>`; }
export function debounce(fn, ms = 150) { let t; return (...a) => { clearTimeout(t); t = setTimeout(() => fn(...a), ms); }; }
