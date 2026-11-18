import { icon } from '../ui/util.js';
import { siteNav, siteFooter, wireNav } from './site.js';

const STEPS = [
  ['Download and extract', 'Download the ZIP below and extract it anywhere (for example your Documents folder). Keep the folder together.'],
  ['Double-click start.bat', 'Windows: double-click <span class="mono">start.bat</span>. It checks whether Python is already installed and uses it if so. If Python is missing it asks your permission and installs it, then starts the app. On macOS / Linux run <span class="mono">./start.sh</span>.'],
  ['Your browser opens', 'Bharat Finance opens at <span class="mono">http://127.0.0.1:8765</span>, served from your own computer. Prices come straight from your machine to the data source.'],
  ['Set up Live Trading (optional)', 'Open <b>Live Trading</b> in the sidebar: pick your broker, paste your own API keys, set your limits, test the connection, then choose a mode. Everything starts in paper mode.'],
];
const FEATS = [
  ['Runs on your computer', 'A small Python program (standard library only, nothing to pip install) serves the same app and makes the market-data and broker calls.'],
  ['Your keys stay with you', 'Broker keys are saved in a file in the app\'s <span class="mono">data</span> folder on your machine and are never sent anywhere except to your own broker.'],
  ['Three live modes', 'Review-only tickets, assisted (you confirm every order) and automated (rules + hard limits). Off until you unlock them.'],
  ['Safety limits you control', 'Max loss per trade, daily loss limit, order size, trades per day, mandatory stops, a kill switch and a required paper-trading period first. Enforced inside the program, not in the web page.'],
  ['Adaptive learning', 'Walk-forward backtests and your own trade log tune strategy settings and switch weak strategies off. It can never raise your risk limits.'],
  ['Full local log', 'Every signal, decision, order and error is written to a file on your machine so you can audit what it did.'],
];

export function renderLocal(root) {
  root.innerHTML = `${siteNav('local')}<main id="main"><section class="wrap block" style="padding-top:48px">
    <span class="eyebrow">${icon('shield')} Local Edition</span><h1 style="margin-top:14px">Run Bharat Finance on your own computer.</h1>
    <p class="lead">The same app, plus a Live Trading page where you connect your own broker and, if you choose, let rule-based automation trade within limits you set. Nothing is connected on our side; there is no account and no server of ours in the loop.</p>
    <div class="row" style="margin:20px 0 6px"><a class="btn primary" id="dl" href="/downloads/bharat-finance-local.zip" download style="min-height:48px;padding:0 26px">Download the Local Edition (ZIP)</a><a class="btn" href="/docs" style="min-height:48px">Read the docs</a></div>
    <p class="faint" id="meta" style="font-size:13px">Free, open source, MIT licence.</p>
    <div class="callout bad" style="margin-top:18px"><b>Real money is at risk.</b> Trading can lose money, and automated trading can lose it quickly. Start in paper mode, use small amounts, and know your broker's and regulator's rules (in India, SEBI rules on retail algorithmic trading and your broker's API terms may apply). Broker connections are <b>experimental and untested against live brokers</b> by the author. Nothing here is investment advice or a promise of profit.</div></section>
  <section class="wrap block"><h2>Set up in four steps</h2><div class="grid g2" style="margin-top:22px">${STEPS.map(([t, d], i) => `<div class="card"><h3><span class="chip" style="margin-right:8px">${i + 1}</span>${t}</h3><p class="muted" style="margin:0">${d}</p></div>`).join('')}</div></section>
  <section class="wrap block"><h2>What you get</h2><div class="grid g3" style="margin-top:22px">${FEATS.map(([t, d]) => `<div class="card feat"><h3>${t}</h3><p>${d}</p></div>`).join('')}</div></section>
  <section class="wrap block"><div class="card"><h3>Good to know</h3><div class="stack muted">
    <div>• <b>First run may need internet</b> only to install Python (if you do not have it) and to fetch prices. After that the app itself runs from your folder.</div>
    <div>• <b>The program must stay running</b> for automation to work. Closing its window stops it; a stopped program places no orders.</div>
    <div>• <b>Market data</b> is Yahoo Finance via your own machine: unofficial and usually delayed. Automated trading on delayed data has real limitations; the Live Trading page says so.</div>
    <div>• <b>Verify the download:</b> compare the SHA-256 shown above with the file you downloaded. The full source is in the ZIP; read it before you trust it with credentials.</div>
    <div>• <b>Delete anything:</b> everything the program stores is inside its <span class="mono">data</span> folder. Delete the folder and it is gone.</div></div></div></section></main>${siteFooter()}`;
  wireNav(root);
  fetch('/downloads/local.json').then((r) => r.json()).then((m) => { root.querySelector('#meta').innerHTML = `Version ${m.version} · ${(m.size / 1024).toFixed(0)} KB · SHA-256 <span class="mono" style="word-break:break-all">${m.sha256}</span>`; }).catch(() => {});
  return () => {};
}
