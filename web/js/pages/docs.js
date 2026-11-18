import { siteNav, siteFooter, wireNav } from './site.js';
const GH = 'https://github.com/'; // the repo URL is set by whoever forks it; docs live in /docs of the repository
const SECTIONS = [
  ['Getting started', 'Open <a href="/app">Dashboard</a>, choose India or US and an account currency (₹ by default). Prices are live from Yahoo Finance through this deployment\'s data service: unofficial, usually delayed. No setup or keys are needed.'],
  ['Market data', 'The default “Live market data” source needs no key. You can instead paste your own Twelve Data or Alpha Vantage key, or point a Custom endpoint at your own service (see MARKET_DATA.md). Every chart shows its source and whether it is real-time, delayed or historical.'],
  ['AI providers', 'Settings → AI provider. Bring your own key (OpenAI-compatible, Anthropic, Gemini) or a local model (Ollama / LM Studio). Keys stay in memory unless you tick “remember on this device”, which stores them unencrypted in IndexedDB — a convenience with real limits, not a vault. The built-in explainer works with no key and no model.'],
  ['Paper trading', 'Orders pass a risk gate (limits, stop required, daily loss, duplicates, kill switch), then fill with modelled spread, slippage, liquidity limits and costs. Prices are live and delayed; stops and targets are evaluated when you press Refresh. Documented assumptions are in PAPER_TRADING.md.'],
  ['Privacy', 'Your data lives only in your browser. The deployment includes a small data relay for market prices and news, which sees the symbols you request. Settings → Privacy shows what is stored, which hosts were contacted, what each receives, and lets you export, import or erase everything.'],
  ['Deploying your own copy', 'Fork the repository, import it in Vercel (framework preset “Other”, build command <span class="mono">npm run build</span>, output directory <span class="mono">dist</span>), and deploy. No environment variables are required (optionally SEC_USER_AGENT for earnings data). See DEPLOYMENT.md.'],
  ['Regulatory note (India)', 'Personalised recommendations, research publication and algorithmic execution may be regulated (SEBI Research Analyst / Investment Adviser rules, retail algo-trading rules, broker API terms, exchange data licensing). This software does not claim compliance. Get legal advice before offering anything beyond education and paper trading to other people.'],
];
export function renderDocs(root) {
  root.innerHTML = `${siteNav('docs')}<main id="main" class="wrap" style="padding:48px 20px;max-width:900px"><h1 style="font-size:40px">Docs</h1><p class="muted" style="font-size:17px">A short tour. The full documentation (installation, deployment, architecture, privacy, security, market data, AI providers, broker integration, paper trading and contributing) is in the repository.</p>
  ${SECTIONS.map(([t, b]) => `<div class="card" style="margin:14px 0"><h3>${t}</h3><p style="margin:0" class="muted">${b}</p></div>`).join('')}</main>${siteFooter()}`;
  wireNav(root); return () => {};
}
