import { state, saveSettings, emit } from '../app/state.js';
import { icon, themeButton, esc, toast } from '../ui/util.js';
import { statusPill } from '../app/ctx.js';
import { MARKETS } from '../core/time.js';
import { CURRENCIES } from '../core/money.js';
import { logo } from './site.js';

const NAV = [
  ['', 'Home', 'home', 'home'], ['markets', 'Markets', 'chart', 'markets'], ['discover', 'Discover', 'compass', 'discover'], ['analyst', 'AI Analyst', 'ai', 'analyst'], ['predictions', 'Predictions', 'target', 'predictions'],
  ['paper', 'Paper Trading', 'wallet', 'paper'], ['learning', 'Learning', 'book', 'learning'], ['watchlists', 'Watchlists', 'star', 'watchlists'], ['alerts', 'Alerts', 'bell', 'alerts'],
  ['live', 'Live Trading', 'shield', 'live'], ['journal', 'Trading Journal', 'notebook', 'journal'], ['tools', 'Trading Tools', 'tool', 'tools'], ['settings', 'Settings', 'settings', 'settings'],
];
const PAGES = { '': () => import('./app/home.js'), markets: () => import('./app/markets.js'), discover: () => import('./app/discover.js'), analyst: () => import('./app/analyst.js'), predictions: () => import('./app/predictions.js'),
  paper: () => import('./app/paper.js'), live: () => import('./app/live.js'), learning: () => import('./app/learning.js'), watchlists: () => import('./app/watchlists.js'), alerts: () => import('./app/alerts.js'), journal: () => import('./app/journal.js'), tools: () => import('./app/tools.js'), settings: () => import('./app/settings.js') };
const TITLES = Object.fromEntries(NAV.map((n) => [n[0], n[1]]));

export async function renderApp(root, sub) {
  const key = (sub.replace(/^\/+/, '').split('/')[0]) || '';
  const loader = PAGES[key]; if (!loader) { root.innerHTML = '<main class="wrap" style="padding:60px 20px"><h1>Page not found</h1><a class="btn primary" href="/app">Back to the dashboard</a></main>'; return; }
  const s = state.settings;
  const mk = Object.values(MARKETS).map((m) => `<button data-market="${m.id}" aria-pressed="${s.market === m.id}">${m.flag} ${m.short}</button>`).join('');
  const link = ([k, t, i]) => `<a class="nl ${k === key ? 'on' : ''}" href="/app${k ? '/' + k : ''}" ${k === key ? 'aria-current="page"' : ''}>${icon(i)}<span>${t}</span></a>`;
  root.innerHTML = `<div class="app"><aside class="side" id="side" aria-label="Sidebar">${logo(34)}<h6>Platform</h6>${NAV.slice(0, 5).map(link).join('')}<h6>Practice &amp; learn</h6>${NAV.slice(5, 9).map(link).join('')}<h6>Workspace</h6>${NAV.slice(9).map(link).join('')}
    <div class="promo"><b>Open source · local-first</b><br>Your data stays in this browser. <a href="/app/settings?tab=privacy">Privacy centre</a></div></aside><div id="scrim" hidden></div>
    <div class="main"><header class="top"><button class="iconbtn menu-btn" aria-label="Open menu" data-side>${icon('menu')}</button><h1>${esc(TITLES[key])}</h1><span class="sp"></span>
      <span class="chip amber hide-sm" title="All trading in this app is simulated">PAPER MODE</span>${statusPill(s.market)}<div class="seg hide-sm" role="group" aria-label="Market">${mk}</div>
      <select id="dcur" aria-label="Display currency" style="width:auto;min-height:38px">${Object.keys(CURRENCIES).map((c) => `<option ${c === s.displayCurrency ? 'selected' : ''}>${c}</option>`).join('')}</select>${themeButton()}<a class="btn sm hide-sm" href="/">Site</a></header>
      <main id="main" class="content" tabindex="-1"></main></div>
    <nav class="bottomnav" aria-label="Quick navigation">${[['', 'Home', 'home'], ['markets', 'Markets', 'chart'], ['paper', 'Paper', 'wallet'], ['analyst', 'AI', 'ai']].map(([k, t, i]) => `<a href="/app${k ? '/' + k : ''}" class="${k === key ? 'on' : ''}">${icon(i)}${t}</a>`).join('')}<button data-side>${icon('more')}More</button></nav></div>`;
  const side = root.querySelector('#side'), scrim = root.querySelector('#scrim');
  const toggle = (o) => { side.classList.toggle('open', o); scrim.hidden = !o; scrim.className = o ? 'scrim' : ''; };
  root.querySelectorAll('[data-side]').forEach((b) => b.addEventListener('click', () => toggle(!side.classList.contains('open'))));
  scrim.addEventListener('click', () => toggle(false)); side.addEventListener('click', (e) => { if (e.target.closest('a')) toggle(false); });
  root.querySelectorAll('[data-market]').forEach((b) => b.addEventListener('click', async () => { s.market = b.dataset.market; s.displayCurrency = MARKETS[s.market].currency; await saveSettings(); window.__nav(location.pathname + location.search, true); }));
  root.querySelector('#dcur').addEventListener('change', async (e) => { s.displayCurrency = e.target.value; await saveSettings(); window.__nav(location.pathname + location.search, true); });
  const content = root.querySelector('#main');
  content.innerHTML = '<div class="loading"><div class="spin"></div>Loading…</div>';
  const mod = await loader(); const params = new URLSearchParams(location.search);
  const ctx = { params, nav: (p) => window.__nav(p), rerender: () => window.__nav(location.pathname + location.search, true), sub: sub.split('/').slice(2) };
  const cleanup = await mod.default(content, ctx);
  document.title = `${TITLES[key]} · Bharat Finance`;
  return () => { if (typeof cleanup === 'function') cleanup(); };
}
