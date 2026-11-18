// Rule-based trade suggestion for the AI-assisted paper modes. This is NOT machine learning: it turns matched scanner
// rules into a stop/target plan and sizes it with the same tools a human uses.
import { computePlan, PlanError } from './plan.js';
import { sizeTrade, SizeError } from './sizing.js';
import { roundToTick } from './money.js';
export const ENTRY_RULES = ['breakout_20d', 'reclaim_ma20', 'oversold_bounce', 'bull_flag'];

export function suggestTrade(analysis, rules, { cash, equity, tick = 0.01, allowed = ENTRY_RULES, rewardR = 2 } = {}) {
  if (!analysis?.ok) return { ok: false, reason: 'no analysis available' };
  const hit = analysis.setups.filter((s) => allowed.includes(s.key));
  if (!hit.length) return { ok: false, reason: 'no enabled rule matched today' };
  const last = analysis.verified.last, sup = analysis.supportResistance.support[0]?.level, atr = analysis.calculated.atr14;
  let stop;
  if (sup && sup < last && (last - sup) / last <= 0.08) stop = { rule: 'price', value: roundToTick(sup * 0.998, tick, 'down') };
  else if (atr) stop = { rule: 'atr', value: 2 }; else stop = { rule: 'pct', value: 5 };
  try {
    const plan = computePlan({ entry: last, stop, target: { rule: 'r', value: rewardR }, atr, tick });
    const sizing = sizeTrade({ symbol: analysis.symbol, side: 'buy', entry: plan.entry, stop: plan.stop, target: plan.target }, rules, { budget: equity, cash });
    return { ok: !sizing.refusal, reason: sizing.refusal || null, setups: hit.map((h) => h.label), plan, sizing,
      order: sizing.qty > 0 ? { symbol: analysis.symbol, market: analysis.market, side: 'buy', type: 'market', qty: sizing.qty, stop: plan.stop, target: plan.target, product: 'delivery', source: 'ai-rules' } : null };
  } catch (e) { if (e instanceof PlanError || e instanceof SizeError) return { ok: false, reason: e.message, setups: hit.map((h) => h.label) }; throw e; }
}
