import { icon, themeButton } from '../ui/util.js';
export const logo = (h = 36) => `<a class="logo" href="/" aria-label="Bharat Finance home"><img src="/assets/logo-192.png" width="${h}" height="${h}" alt=""><span style="color:var(--text)"><b>Bharat</b> <span>Finance</span></span></a>`;
export function siteNav(active = '') {
  const l = (h, t, k) => `<a href="${h}" class="${active === k ? 'on' : ''}">${t}</a>`;
  return `<header class="nav"><div class="in">${logo()}<button class="iconbtn menu" aria-label="Menu" aria-expanded="false" data-menu>${icon('menu')}</button>
  <nav aria-label="Main">${l('/#features', 'Features', 'f')}${l('/#how', 'How it works', 'h')}${l('/#privacy', 'Privacy', 'p')}${l('/local', 'Local Edition', 'local')}${l('/docs', 'Docs', 'docs')}${l('/builder', 'Builder', 'builder')}<a class="btn primary sm" href="/app">Dashboard</a></nav>${themeButton()}</div></header>`;
}
export function siteFooter() {
  return `<footer class="footer"><div class="in"><div class="row">${logo(28)}<span>© 2026 Bharat Chandrakant Wagh · Open source · MIT · no accounts</span></div><div class="row"><a href="/local">Local Edition</a><a href="/docs">Docs</a><a href="/builder">Builder</a><a href="/app/settings?tab=privacy">Privacy centre</a></div></div>
  <div class="in" style="margin-top:14px"><p class="disclaimer">Bharat Finance is educational software. It is not investment advice, a research report or a brokerage. Markets involve risk of loss; AI output and simulations are not predictions or guarantees. Paper-trading results are simulated money.</p></div></footer>`;
}
export function wireNav(root) {
  const b = root.querySelector('[data-menu]'), n = root.querySelector('.nav nav');
  if (b) { b.addEventListener('click', () => { const o = n.classList.toggle('open'); b.setAttribute('aria-expanded', o); }); n.addEventListener('click', (e) => { if (e.target.closest('a')) n.classList.remove('open'); }); }
}
