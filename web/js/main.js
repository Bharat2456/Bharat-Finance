import { initState, state, saveSettings } from './app/state.js';
import { setTheme, getTheme, $, esc } from './ui/util.js';
import { renderLanding } from './pages/landing.js';
import { renderBuilder } from './pages/builder.js';
import { renderDocs } from './pages/docs.js';
import { renderLocal } from './pages/local.js';
import { renderApp } from './pages/app.js';

const root = document.getElementById('root');
export function navigate(path, replace = false) { if (location.pathname + location.search === path) { route(); return; } history[replace ? 'replaceState' : 'pushState']({}, '', path); route(); }
window.__nav = navigate;

document.addEventListener('click', (e) => {
  const a = e.target.closest('a[href]'); if (a && a.origin === location.origin && !a.target && !a.hasAttribute('download') && !e.metaKey && !e.ctrlKey && !e.shiftKey && e.button === 0) {
    if (a.pathname === location.pathname && a.hash) return; e.preventDefault(); navigate(a.pathname + a.search + a.hash); if (a.hash) setTimeout(() => document.getElementById(a.hash.slice(1))?.scrollIntoView({ behavior: 'smooth' }), 50);
  }
  const t = e.target.closest('[data-act="theme"]'); if (t) { setTheme(getTheme() === 'dark' ? 'light' : 'dark'); document.querySelectorAll('[data-act="theme"]').forEach((b) => { const d = getTheme() === 'dark'; b.setAttribute('aria-label', `Switch to ${d ? 'light' : 'dark'} theme`); b.innerHTML = `<svg viewBox="0 0 24 24" aria-hidden="true"><path d="${d ? 'M12 17a5 5 0 100-10 5 5 0 000 10zM12 1v3M12 20v3M4.2 4.2l2.1 2.1M17.7 17.7l2.1 2.1M1 12h3M20 12h3M4.2 19.8l2.1-2.1M17.7 6.3l2.1-2.1' : 'M21 13A9 9 0 1111 3a7 7 0 0010 10z'}"/></svg>`; }); window.dispatchEvent(new Event('bf-theme')); }
});
window.addEventListener('popstate', () => route());

let cleanup = null;
async function route() {
  if (cleanup) { try { cleanup(); } catch {} cleanup = null; }
  const p = location.pathname.replace(/\/+$/, '') || '/';
  window.scrollTo(0, 0);
  try {
    if (p === '/') { document.title = 'Bharat Finance — understand the market, test your decisions'; cleanup = renderLanding(root); }
    else if (p === '/builder') { document.title = 'Builder · Bharat Finance'; cleanup = renderBuilder(root); }
    else if (p === '/local') { document.title = 'Local Edition · Bharat Finance'; cleanup = renderLocal(root); }
    else if (p === '/docs') { document.title = 'Docs · Bharat Finance'; cleanup = renderDocs(root); }
    else if (p === '/app' || p.startsWith('/app/')) { document.title = 'Dashboard · Bharat Finance'; cleanup = await renderApp(root, p.slice(4) || '/'); }
    else { root.innerHTML = `<main id="main" class="wrap" style="padding:80px 20px;text-align:center"><h1>Page not found</h1><p class="muted">That page does not exist.</p><a class="btn primary" href="/">Back to home</a></main>`; }
  } catch (e) { console.error(e); root.innerHTML = `<main id="main" class="wrap" style="padding:60px 20px"><div class="callout bad"><b>Something went wrong.</b><br>${esc(e.message)}</div><p><a class="btn" href="/">Home</a></p></main>`; }
}
(async () => { await initState(); route(); })();
