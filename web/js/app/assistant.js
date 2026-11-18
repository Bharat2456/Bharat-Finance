import { state, trackedFetch, putItem, listAll } from './state.js';
import { lastModel, chat, SYSTEM_PROMPT } from '../core/ai/providers.js';
import { offlineAnswer } from '../core/explainer.js';
import { analysisToContext } from '../core/analyst.js';

export const aiCfg = () => ({ ...state.settings.ai, apiKey: state.apiKeys.ai });
export const usingModel = () => state.settings.ai.provider !== 'builtin';
/** Ask the configured assistant. extra = any additional DATA (e.g. paper-account stats). Returns {text, source}. */
export async function ask(question, analysis, extra) {
  if (!usingModel()) return offlineAnswer(question, analysis);
  const data = `DATA (the only facts you may use):\n${analysis?.ok ? analysisToContext(analysis) : 'No instrument is loaded.'}${extra ? `\nEXTRA: ${JSON.stringify(extra).slice(0, 4000)}` : ''}`;
  try {
    const text = await chat(aiCfg(), [{ role: 'user', content: `${data}\n\nQUESTION: ${question}` }], { fetchImpl: trackedFetch(`AI: ${state.settings.ai.provider}`) });
    return { text, source: `${state.settings.ai.provider}/${lastModel() || 'auto'}` };
  } catch (e) { return { text: `The AI provider could not answer: ${e.message}\n\nFalling back to the built-in explainer:\n\n${offlineAnswer(question, analysis).text}`, source: 'built-in (fallback)', error: true }; }
}
export async function remember(q, a) { const all = await listAll('chat'); const rec = all.find((x) => x.id === 'main') || { id: 'main', messages: [] }; rec.messages.push({ role: 'user', content: q, t: Date.now() }, { role: 'assistant', content: a.text, source: a.source, t: Date.now() }); rec.messages = rec.messages.slice(-60); await putItem('chat', rec); }
export async function history() { return ((await listAll('chat')).find((x) => x.id === 'main') || { messages: [] }).messages; }
