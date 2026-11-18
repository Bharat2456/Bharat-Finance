import { createStorage } from '../core/storage.js';
import { DEFAULT_RULES } from '../core/sizing.js';
import { createAccount } from '../core/paper.js';

export const DEFAULT_SETTINGS = {
  market: 'IN', displayCurrency: 'INR', dashboardMode: 'beginner',
  data: { provider: 'live', endpoint: '', exchange: 'NSE' },
  ai: { provider: 'builtin', model: '', endpoint: '', temperature: 0.2, maxTokens: 900, rememberKey: false },
  paper: { enforceHours: null, startBalance: 1000000 }, costModel: {}, extraHolidays: {}, fx: null,
  jurisdiction: { IN: { analysis: true, paper: true, assistedLive: false, autoLive: false }, US: { analysis: true, paper: true, assistedLive: false, autoLive: false } },
  learning: { done: {}, quiz: {} },
};
export const defaultRulesFor = (cur) => (cur === 'INR'
  ? { ...DEFAULT_RULES, budget: 1000000, maxLossPerTrade: 5000, maxOrderValue: 300000, minOrderValue: 100, maxDailyLoss: 15000, maxTradesPerDay: 5, maxExposurePct: 90, noEntriesBefore: '09:30', noEntriesAfter: '15:15', flatBy: '15:15' }
  : { ...DEFAULT_RULES, budget: 10000, maxLossPerTrade: 100, maxOrderValue: 5000, minOrderValue: 5, maxDailyLoss: 300, maxTradesPerDay: 5, maxExposurePct: 90 });

export const state = { storage: null, settings: structuredClone(DEFAULT_SETTINGS), accounts: [], activeId: null, apiKeys: { ai: '', data: '' }, net: [], listeners: new Set(), history: new Map() };
export const on = (fn) => { state.listeners.add(fn); return () => state.listeners.delete(fn); };
export const emit = (what) => state.listeners.forEach((f) => f(what));

export async function initState() {
  state.storage = await createStorage();
  const s = await state.storage.setting('settings', null);
  state.settings = deepMerge(structuredClone(DEFAULT_SETTINGS), s || {});
  // Migrations for settings saved by older builds: removed 'demo'/'yahoo' providers, and AI model names that were auto-saved and may be retired.
  if (!['live', 'alphavantage', 'twelvedata', 'custom'].includes(state.settings.data.provider)) state.settings.data.provider = 'live';
  if ((state.settings._v || 0) < 2) { state.settings.ai.model = ''; state.settings._v = 2; }
  const accts = (await state.storage.all('accounts')).map((x) => x.value);
  state.accounts = accts; state.activeId = await state.storage.setting('activeAccount', accts[0]?.id || null);
  const sec = await state.storage.get('secrets', 'keys', null);
  if (sec && state.settings.ai.rememberKey) state.apiKeys = { ai: sec.ai || '', data: sec.data || '' };
  return state;
}
function deepMerge(a, b) { for (const [k, v] of Object.entries(b)) { if (v && typeof v === 'object' && !Array.isArray(v) && a[k] && typeof a[k] === 'object') deepMerge(a[k], v); else a[k] = v; } return a; }
export async function saveSettings() { await state.storage.setSetting('settings', state.settings); emit('settings'); }
export async function saveKeys() { if (state.settings.ai.rememberKey) await state.storage.put('secrets', 'keys', state.apiKeys); else await state.storage.del('secrets', 'keys'); }
export async function saveAccount(a) { const i = state.accounts.findIndex((x) => x.id === a.id); if (i >= 0) state.accounts[i] = a; else state.accounts.push(a); await state.storage.put('accounts', a.id, a); emit('accounts'); }
export function activeAccount() { return state.accounts.find((a) => a.id === state.activeId) || null; }
export async function setActive(id) { state.activeId = id; await state.storage.setSetting('activeAccount', id); emit('accounts'); }
export async function newAccount(opts) { const a = createAccount({ ...opts, rules: opts.rules || defaultRulesFor(opts.currency) }); a.replay = null; await saveAccount(a); await setActive(a.id); return a; }
export async function listAll(store) { return (await state.storage.all(store)).map((x) => x.value); }
export async function putItem(store, item) { item.id ||= `${store}-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 6)}`; await state.storage.put(store, item.id, item); emit(store); return item; }
export async function delItem(store, id) { await state.storage.del(store, id); emit(store); }

/** fetch wrapper that records which hosts the app contacts (shown in the Privacy Centre). Keys are never logged. */
export function trackedFetch(purpose) {
  return async (url, init) => {
    const u = new URL(url, location.href); const rec = { t: Date.now(), purpose, host: u.host, path: u.pathname, ok: null };
    state.net.unshift(rec); state.net.length = Math.min(state.net.length, 60);
    try { const r = await fetch(url, init); rec.ok = r.ok; rec.status = r.status; emit('net'); return r; } catch (e) { rec.ok = false; rec.error = e.message; emit('net'); throw e; }
  };
}
