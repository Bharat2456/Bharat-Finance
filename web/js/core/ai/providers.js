// AI provider adapters (bring your own key / local model). No key is ever hard-coded and nothing is sent
// anywhere except the endpoint the user configured. Adapters take an injectable fetchImpl for tests.
export class AiError extends Error { constructor(m, code = 'error') { super(m); this.code = code; } }

export const AI_PROVIDERS = {
  builtin: { id: 'builtin', name: 'Built-in explainer (no AI model)', endpoint: null, keyRequired: false, local: true, models: ['rule-based'],
    caps: 'Glossary + rule-based summaries of the data on screen. Not an AI model; works fully offline.', sends: 'Nothing.' },
  openai: { id: 'openai', name: 'OpenAI-compatible endpoint', endpoint: 'https://api.openai.com/v1', keyRequired: true, models: [],
    caps: 'Works with OpenAI, OpenRouter, Groq, Together, Mistral, DeepSeek and any server that implements /chat/completions with CORS.', sends: 'Your chat messages and the analysis data you attach, to the endpoint you set.' },
  anthropic: { id: 'anthropic', name: 'Anthropic Claude (your key)', endpoint: 'https://api.anthropic.com', keyRequired: true, models: [],
    caps: 'Uses the Messages API directly from your browser with the anthropic-dangerous-direct-browser-access header, which exists because your key is exposed to this page. Use a restricted/low-limit key.', sends: 'Your chat messages and the attached analysis data, to api.anthropic.com.' },
  gemini: { id: 'gemini', name: 'Google Gemini (your key)', endpoint: 'https://generativelanguage.googleapis.com', keyRequired: true, models: [],
    caps: 'Uses the generateContent REST API from the browser.', sends: 'Your chat messages and the attached analysis data, to Google.' },
  local: { id: 'local', name: 'Local model (Ollama / LM Studio / llama.cpp)', endpoint: 'http://localhost:11434/v1', keyRequired: false, local: true, models: [],
    caps: 'OpenAI-compatible server on your own machine. The server must allow this site\'s origin (Ollama: set OLLAMA_ORIGINS). Data never leaves your computer.', sends: 'Nothing leaves your machine.' },
};

export const SYSTEM_PROMPT = `You are the analysis assistant inside Bharat Finance, an educational stock-market tool.
Rules:
1. Use ONLY the DATA block provided. If something is not in it, say you do not have it. Never invent prices, news, earnings or numbers.
2. Never promise profits, never say a stock "will" go up or down, and never give a bare buy/sell instruction. Describe scenarios, conditions and what would invalidate them.
3. Do not state probabilities or confidence percentages unless the DATA includes a calibrated probability field.
4. Keep these separate and label them: verified market data, calculated indicators, model estimates, and your own explanation.
5. Mention the data timestamp and whether data is live, delayed or historical.
6. Paper-trading results are simulated money. This is education, not investment advice.
Be concise and plain-spoken; define jargon for beginners.`;

async function post(fetchImpl, url, init, signal) {
  let r; try { r = await fetchImpl(url, { ...init, signal }); } catch (e) { throw new AiError(`Could not reach the AI endpoint (${e.message}). Check the URL, your network, and that the server allows browser (CORS) requests from this site.`, 'network'); }
  if (!r.ok) { let t = ''; try { t = (await r.text()).slice(0, 300); } catch {} throw new AiError(`AI provider answered HTTP ${r.status}. ${t}`, r.status === 401 || r.status === 403 ? 'auth' : r.status === 429 ? 'rate-limit' : (r.status === 404 || (r.status === 400 && /model/i.test(t))) ? 'model' : 'http'); }
  return r.json();
}

/** cfg: {provider, model, endpoint, apiKey, temperature, maxTokens}. messages: [{role:'user'|'assistant', content}] */
async function chatOnce(cfg, messages, { system, signal, fetchImpl }) {
  const p = cfg.provider, temp = cfg.temperature ?? 0.2, max = cfg.maxTokens ?? 900;
  const base = (cfg.endpoint || AI_PROVIDERS[p]?.endpoint || '').replace(/\/+$/, '');
  if (p === 'builtin') throw new AiError('The built-in explainer does not call a model.', 'builtin');
  if (AI_PROVIDERS[p]?.keyRequired && !cfg.apiKey) throw new AiError('No API key set for this provider (Settings > AI provider).', 'no-key');
  if (p === 'openai' || p === 'local') {
    const j = await post(fetchImpl, `${base}/chat/completions`, { method: 'POST', headers: { 'Content-Type': 'application/json', ...(cfg.apiKey ? { Authorization: `Bearer ${cfg.apiKey}` } : {}) },
      body: JSON.stringify({ model: cfg.model, temperature: temp, max_tokens: max, messages: [{ role: 'system', content: system }, ...messages] }) }, signal);
    const t = j.choices?.[0]?.message?.content; if (!t) throw new AiError('The provider returned no text.', 'empty'); return t;
  }
  if (p === 'anthropic') {
    const j = await post(fetchImpl, `${base}/v1/messages`, { method: 'POST', headers: { 'Content-Type': 'application/json', 'x-api-key': cfg.apiKey, 'anthropic-version': '2023-06-01', 'anthropic-dangerous-direct-browser-access': 'true' },
      body: JSON.stringify({ model: cfg.model, max_tokens: max, temperature: temp, system, messages }) }, signal);
    const t = (j.content || []).filter((b) => b.type === 'text').map((b) => b.text).join('\n'); if (!t) throw new AiError('The provider returned no text.', 'empty'); return t;
  }
  if (p === 'gemini') {
    const j = await post(fetchImpl, `${base}/v1beta/models/${encodeURIComponent(cfg.model)}:generateContent`, { method: 'POST', headers: { 'Content-Type': 'application/json', 'x-goog-api-key': cfg.apiKey },
      body: JSON.stringify({ systemInstruction: { parts: [{ text: system }] }, generationConfig: { temperature: temp, maxOutputTokens: max }, contents: messages.map((m) => ({ role: m.role === 'assistant' ? 'model' : 'user', parts: [{ text: m.content }] })) }) }, signal);
    const t = j.candidates?.[0]?.content?.parts?.map((x) => x.text).join('\n'); if (!t) throw new AiError('The provider returned no text.', 'empty'); return t;
  }
  throw new AiError(`Unknown AI provider ${p}`);
}
// ---- Automatic model discovery: the user never types a model name. ----
const cache = new Map(); let used = '';
export const lastModel = () => used;
const baseOf = (cfg) => (cfg.endpoint || AI_PROVIDERS[cfg.provider]?.endpoint || '').replace(/\/+$/, '');
const ver = (id) => { const m = /(\d+(?:[.-]\d+)?)/.exec(id.replace(/^gemini-|^gpt-|^claude-/, '')); return m ? parseFloat(m[1].replace('-', '.')) : 0; };
export function rankModels(provider, ids) {
  const uniq = [...new Set(ids)];
  const bad = /embed|whisper|tts|dall-e|moderation|image|audio|realtime|transcribe|aqa|imagen|veo|robotics|learnlm|gemma|guard|rerank|search|computer-use|vision-preview/i;
  const ok = uniq.filter((i) => !bad.test(i));
  const stable = (i) => (/preview|exp|latest|-\d{4}-\d{2}-\d{2}|-\d{3}$|-0\d{3}$/i.test(i) ? 0 : 1);
  if (provider === 'gemini') return ok.filter((i) => /^gemini-/.test(i)).sort((a, b) => stable(b) - stable(a) || ver(b) - ver(a) || (/flash(?!-lite)/.test(b) ? 1 : 0) - (/flash(?!-lite)/.test(a) ? 1 : 0) || (/pro/.test(b) ? 1 : 0) - (/pro/.test(a) ? 1 : 0));
  if (provider === 'anthropic') { const fam = (i) => (/sonnet/.test(i) ? 0 : /haiku/.test(i) ? 1 : 2); return ok.filter((i) => /^claude-/.test(i)).sort((a, b) => fam(a) - fam(b) || ver(b) - ver(a)); }
  if (provider === 'openai') { const sc = (i) => (/^gpt-/.test(i) ? (/mini/.test(i) ? 0 : 1) : /^o\d/.test(i) ? 3 : 2); return ok.sort((a, b) => sc(a) - sc(b) || stable(b) - stable(a) || ver(b) - ver(a)); }
  return ok;
}
export async function listModels(cfg, { signal, fetchImpl = fetch.bind(globalThis) } = {}) {
  const p = cfg.provider, base = baseOf(cfg);
  const get = async (url, headers) => { let r; try { r = await fetchImpl(url, { headers, signal }); } catch (e) { throw new AiError(`Could not reach the AI service (${e.message}). Check the address and your network; some services block direct browser calls (CORS).`, 'network'); }
    if (!r.ok) { const t = (await r.text().catch(() => '')).slice(0, 200); throw new AiError(`The AI service answered HTTP ${r.status} when listing models. ${r.status === 401 || r.status === 403 ? 'The key was not accepted.' : t}`, r.status === 401 || r.status === 403 ? 'auth' : 'http'); } return r.json(); };
  let ids = [];
  if (p === 'openai' || p === 'local') ids = ((await get(`${base}/models`, cfg.apiKey ? { Authorization: `Bearer ${cfg.apiKey}` } : {})).data || []).map((m) => m.id);
  else if (p === 'anthropic') ids = ((await get(`${base}/v1/models?limit=100`, { 'x-api-key': cfg.apiKey, 'anthropic-version': '2023-06-01', 'anthropic-dangerous-direct-browser-access': 'true' })).data || []).map((m) => m.id);
  else if (p === 'gemini') ids = ((await get(`${base}/v1beta/models?pageSize=200`, { 'x-goog-api-key': cfg.apiKey })).models || []).filter((m) => (m.supportedGenerationMethods || []).includes('generateContent')).map((m) => String(m.name).replace(/^models\//, ''));
  else throw new AiError(`Unknown AI provider ${p}`);
  const ranked = rankModels(p, ids);
  if (!ranked.length) throw new AiError('Connected, but this key/service lists no chat models it can use.', 'no-models');
  return ranked;
}
async function candidates(cfg, o) {
  const k = `${cfg.provider}|${baseOf(cfg)}|${(cfg.apiKey || '').slice(-6)}`; const hit = cache.get(k);
  if (hit && Date.now() - hit.t < 3600e3) return hit.list;
  const list = await listModels(cfg, o); cache.set(k, { t: Date.now(), list }); return list;
}
export const clearModelCache = () => cache.clear();

/** cfg: {provider, model (optional override), endpoint, apiKey, temperature, maxTokens}. */
export async function chat(cfg, messages, { system = SYSTEM_PROMPT, signal, fetchImpl = fetch.bind(globalThis) } = {}) {
  const o = { system, signal, fetchImpl };
  if (cfg.provider === 'builtin') throw new AiError('The built-in explainer does not call a model.', 'builtin');
  if (AI_PROVIDERS[cfg.provider]?.keyRequired && !cfg.apiKey) throw new AiError('No API key set for this provider (Settings > AI provider).', 'no-key');
  const tried = []; let lastErr;
  const attempt = async (model) => { tried.push(model); const t = await chatOnce({ ...cfg, model }, messages, o); used = model; return t; };
  if (cfg.model) { try { return await attempt(cfg.model); } catch (e) { if (e.code !== 'model') throw e; lastErr = e; } }   // a pinned model that no longer exists falls through to discovery
  const list = await candidates(cfg, { signal, fetchImpl });
  for (const m of list.filter((x) => !tried.includes(x)).slice(0, 4)) { try { return await attempt(m); } catch (e) { if (e.code !== 'model') throw e; lastErr = e; cache.delete(`${cfg.provider}|${baseOf(cfg)}|${(cfg.apiKey || '').slice(-6)}`); } }
  throw new AiError(`None of the models offered by this service accepted the request (${tried.join(', ')}). ${lastErr?.message || ''}`, 'model');
}

export async function testConnection(cfg, opts = {}) {
  if (cfg.provider === 'builtin') return { ok: true, message: 'Built-in explainer is always available.' };
  try { clearModelCache(); await chat({ ...cfg, maxTokens: 8 }, [{ role: 'user', content: 'Reply with the single word: ok' }], opts); return { ok: true, message: `Connected. The model was chosen automatically: ${used}.`, model: used }; }
  catch (e) { return { ok: false, message: e.message, code: e.code }; }
}
