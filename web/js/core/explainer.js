// Built-in explainer: glossary lookup + data-driven summaries. This is NOT an AI model; it never invents facts.
import { GLOSSARY } from '../content/learning.js';

export function matchGlossary(q) {
  const s = q.toLowerCase(); let best = null;
  for (const k of Object.keys(GLOSSARY)) if (s.includes(k) && (!best || k.length > best.length)) best = k;
  return best;
}
const f = (x, d = 2) => (x == null ? 'n/a' : Number(x).toFixed(d));
export function summariseAnalysis(a) {
  if (!a?.ok) return 'I have no price data loaded for this instrument, so I cannot describe it.';
  const c = a.calculated, v = a.verified;
  const lines = [`${a.symbol} (${a.market}) - last ${f(v.last)} ${a.currency}, data: ${a.dataKind}${a.source ? ` (${a.source})` : ''}.`,
    `Trend: ${c.trend.label} (${c.trend.basis}). 1-bar change ${f(v.change1)}%, 5-bar ${f(v.change5)}%, 20-bar ${f(v.change20)}%.`,
    `Calculated: RSI(14) ${f(c.rsi14, 1)}, SMA20 ${f(c.sma20)}${c.sma50 ? `, SMA50 ${f(c.sma50)}` : ''}${c.macd ? `, MACD histogram ${f(c.macd.hist, 3)}` : ''}${c.atr14 ? `, ATR(14) ${f(c.atr14)}` : ''}.`];
  if (a.supportResistance.support.length || a.supportResistance.resistance.length) lines.push(`Nearest support ${a.supportResistance.support.map((x) => f(x.level)).join(', ') || 'n/a'}; resistance ${a.supportResistance.resistance.map((x) => f(x.level)).join(', ') || 'n/a'}.`);
  if (a.setups.length) lines.push(`Scanner rules matched: ${a.setups.map((s) => s.label).join(', ')}.`);
  lines.push(...a.dataQuality.caveats.map((x) => `Caveat: ${x}`));
  return lines.join('\n');
}
/** question + optional analysis context -> {text, source} */
export function offlineAnswer(question, analysis) {
  const q = question.toLowerCase();
  const key = matchGlossary(q);
  if (/why did|why is|why was|moved|move\b/.test(q)) return { source: 'built-in', text: `I cannot know why a stock moved: this app has no verified news or order-flow data for that, and a price move alone never proves a cause.\n\nWhat the data on screen does show:\n${summariseAnalysis(analysis)}\n\nConnect an AI provider and a news source in Settings for a richer, still data-bound, explanation.` };
  if (/explain (this )?chart|chart|analy[sz]e|summar|conditions|risk|strategy/.test(q) && analysis?.ok) return { source: 'built-in', text: `${summariseAnalysis(analysis)}\n\nScenarios to watch (conditions, not predictions):\n${analysis.scenarios.map((s) => `- ${s.name}: ${s.condition} Invalidated by: ${s.invalidation}`).join('\n')}\n\nRisks:\n${analysis.risks.map((r) => `- ${r}`).join('\n')}` };
  if (key) { const extra = analysis?.ok && ['rsi', 'macd', 'vwap', 'atr', 'sma', 'bollinger'].includes(key) ? `\n\nOn ${analysis.symbol} right now: ${key === 'rsi' ? `RSI(14) is ${f(analysis.calculated.rsi14, 1)}.` : key === 'macd' ? `MACD histogram is ${f(analysis.calculated.macd?.hist, 3)}.` : key === 'vwap' ? (analysis.calculated.vwap ? `session VWAP is ${f(analysis.calculated.vwap)}.` : 'VWAP needs intraday bars with volume, which this data does not have.') : key === 'atr' ? `ATR(14) is ${f(analysis.calculated.atr14)}.` : key === 'sma' ? `SMA20 is ${f(analysis.calculated.sma20)}.` : `Bollinger bands: ${analysis.calculated.bollinger ? `${f(analysis.calculated.bollinger.lower)} to ${f(analysis.calculated.bollinger.upper)}` : 'n/a'}.`}` : ''; return { source: 'built-in', text: GLOSSARY[key] + extra }; }
  if (analysis?.ok) return { source: 'built-in', text: `I am the built-in explainer (no AI model), so I answer from the glossary and the data on screen. Here is what I can see:\n\n${summariseAnalysis(analysis)}\n\nTry: "What is VWAP?", "Explain this chart", or connect an AI provider in Settings for free-form questions.` };
  return { source: 'built-in', text: 'I am the built-in explainer (no AI model). I can define terms like RSI, VWAP, MACD, spread, stop-loss, drawdown or position sizing, and summarise a stock once you open it in Markets or the AI Analyst. Connect an AI provider in Settings for free-form questions.' };
}
