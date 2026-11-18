import { icon } from '../ui/util.js';
import { siteNav, siteFooter, wireNav } from './site.js';
import { sparkline, ring } from '../ui/charts.js';

const FEATS = [
  ['chart', 'Markets explorer', 'Candlestick and line charts with moving averages, Bollinger bands and VWAP. Watchlists and side-by-side compare for NSE, BSE, NYSE and NASDAQ names.'],
  ['ai', 'AI stock analyst', 'Bullish, bearish and neutral scenarios with the exact conditions that invalidate each. Verified data, calculated indicators and AI text are always labelled separately.'],
  ['target', 'Predictions you can audit', 'A statistical scenario range, a walk-forward calibration test, and a local log that scores every prediction after the fact. Probabilities appear only when they are earned.'],
  ['wallet', 'Paper trading simulator', 'Practise with virtual rupees or dollars: spread, slippage, brokerage, STT and taxes, stops, targets, partial fills, drawdown and a kill switch.'],
  ['book', 'Learning centre', 'Beginner to advanced paths, quizzes and a built-in explainer that uses the chart you are looking at.'],
  ['tool', 'Ten trading tools', 'Scanner, news, entry timer, exit planner, time machine, risk manager, budget sizing, alerts and more.'],
];
const PRIV = ['Runs in your browser. Portfolios, watchlists, journals and settings live in IndexedDB on your device.', 'No accounts, no analytics, no ads, no tracking pixels. The only server is the tiny data relay that ships with your deployment.', 'You choose the AI model and the market-data source. Every external connection is listed in the Privacy Centre.', 'Export a backup any time, or wipe everything with one button.'];

export function renderLanding(root) {
  root.innerHTML = `${siteNav()}<main id="main">
  <section class="wrap hero"><div><span class="eyebrow">${icon('shield')} Open source · local-first · no sign-up</span>
    <h1>Understand the market. <em>Test your decisions.</em> Trade with knowledge and control.</h1>
    <p class="lead">Bharat Finance is a free learning, analysis and paper-trading platform for Indian (NSE / BSE) and US stocks. Your portfolios, journals and settings stay on your device, and prices are live.</p>
    <div class="row" style="margin:22px 0 10px"><a class="btn primary" href="/app" style="min-height:48px;padding:0 26px">Open the dashboard →</a><a class="btn" href="#features" style="min-height:48px">See what it does</a></div>
    <p class="faint" style="font-size:13px">No account. No card. Paper money only by default. Nothing is a recommendation or a promise of profit.</p></div>
    <div class="preview" aria-label="Product preview"><aside><div class="row" style="gap:6px;margin-bottom:6px"><img src="/assets/logo-64.png" width="22" height="22" alt="" style="border-radius:50%"><b style="font-size:12px">Bharat Finance</b></div><i class="on">Home</i><i>Markets</i><i>AI Analyst</i><i>Paper Trading</i><i>Learning</i></aside>
    <div class="pg"><div class="grid g2"><div class="mini"><div class="muted" style="font-size:12px">Paper balance</div><div class="kpi" style="font-size:20px">₹10,00,000</div><span class="chip gray">SIMULATED</span></div><div class="mini" id="pv1"><div class="muted" style="font-size:12px">TSLA · loading live data…</div><div class="loading" style="padding:8px"></div></div></div>
    <div class="grid g2"><div class="mini" style="display:grid;justify-items:center">${ring(72, 'Lessons')}<span class="muted" style="font-size:12px">Learning progress</span></div><div class="mini" id="pv2"><div class="muted" style="font-size:12px">NVDA · loading live data…</div></div></div>
    <div class="mini"><div class="muted" style="font-size:12px">AI Analyst</div><b style="font-size:13px">Bullish if price holds above support…</b><div class="faint" style="font-size:12px">…invalidated by a close below it. Scenarios, not certainties.</div></div></div></div></section>

  <section class="block wrap" id="features"><h2>Everything you need to learn the market, in one place</h2><p class="lead">Built for beginners and students first, with the depth working traders expect.</p>
    <div class="grid g3" style="margin-top:26px">${FEATS.map(([i, t, d]) => `<div class="card feat"><div class="ico">${icon(i)}</div><h3>${t}</h3><p>${d}</p></div>`).join('')}</div></section>

  <section class="block wrap" id="how"><h2>How it works</h2><div class="grid g3 steps" style="margin-top:22px">
    <div class="card"><h3>Open the dashboard</h3><p class="muted">No sign-up. Pick India or the US, choose a currency (₹ by default), and start with live market data.</p></div>
    <div class="card"><h3>Analyse and practise</h3><p class="muted">Study a stock, read the scenarios, then place simulated trades with realistic costs and risk limits.</p></div>
    <div class="card"><h3>Review and improve</h3><p class="muted">Your journal, prediction scorecard and paper statistics show what actually worked, and what did not.</p></div></div></section>

  <section class="block wrap" id="markets"><div class="grid g2"><div class="card"><h3>🇮🇳 India</h3><p class="muted">NSE and BSE, IST sessions, ₹ formatting with lakh/crore grouping, ₹0.05 tick, brokerage, STT, GST, SEBI and stamp-duty modelling in the simulator.</p><p class="faint" style="font-size:13px">Prices are live from Yahoo Finance (unofficial, usually delayed). The holiday calendar is partial: add the exchange's floating holidays in Settings.</p></div>
    <div class="card"><h3>🇺🇸 United States</h3><p class="muted">NYSE and NASDAQ with live delayed prices, an opening-range breakout toolkit and a seeded Monte Carlo time machine.</p></div></div></section>

  <section class="block wrap" id="privacy"><h2>Your data never leaves your device</h2><p class="lead">There is no central Bharat Finance service. Every deployment, and every Local Edition, is an independent copy.</p>
    <div class="grid g2" style="margin-top:22px">${PRIV.map((p) => `<div class="card row" style="flex-wrap:nowrap;align-items:flex-start"><span class="chip" style="padding:6px">${icon('check')}</span><span>${p}</span></div>`).join('')}</div>
    <p class="faint" style="margin-top:14px;font-size:13px">Honest note: a static site still downloads its files from its host, and anything you connect (a market-data API, an AI provider) receives the requests you send it. The Privacy Centre lists them all.</p></section>

  <section class="block wrap" id="local"><div class="card" style="padding:32px"><div class="grid g2" style="align-items:center"><div><span class="eyebrow">${icon('shield')} Local Edition</span><h2 style="margin-top:12px">Take it to your own computer.</h2><p class="lead" style="margin:0 0 16px">Download the Local Edition to run Bharat Finance on your machine with one double-click. Connect your own broker, set your own safety limits, and let the rule-based automation trade for you. Your keys, data and logs never leave your device.</p><div class="row"><a class="btn primary" href="/local" style="min-height:46px">Get the Local Edition →</a></div></div>
    <div class="stack">${['Same Bharat Finance interface, plus a Live Trading page', 'Starts with start.bat (Windows) and checks what is already installed before downloading anything', 'Assisted mode asks you to confirm every order; automated mode follows your rules and hard limits', 'An adaptive module that learns from your trade history inside limits that only you can change'].map((x) => `<div class="row" style="flex-wrap:nowrap;align-items:flex-start"><span class="chip" style="padding:6px">${icon('check')}</span><span>${x}</span></div>`).join('')}</div></div></div></section>

  <section class="block wrap"><div class="cta"><h2>Ready to look around?</h2><p class="lead" style="margin:0 auto 18px">Open the dashboard. It takes one click and nothing to install.</p><a class="btn primary" href="/app" style="min-height:48px;padding:0 28px">Open the dashboard →</a></div></section></main>${siteFooter()}`;
  wireNav(root);
  for (const [id, sym] of [['pv1', 'TSLA'], ['pv2', 'NVDA']]) fetch(`/api/market?symbol=${sym}&market=US&interval=1d`).then((r) => r.json()).then((d) => { const el = root.querySelector('#' + id); const c = d.bars?.map((b) => b.c).slice(-60); if (el && c?.length) el.innerHTML = `<div class="muted" style="font-size:12px">${sym} · live, delayed</div><div style="margin-top:4px">${sparkline(c, { w: 200, h: 48 })}</div>`; }).catch(() => { const el = root.querySelector("#" + id); if (el) el.querySelector(".muted").textContent = sym + " · price service unavailable"; });
  return () => {};
}
