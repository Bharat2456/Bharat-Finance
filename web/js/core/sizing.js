// Position sizing: whole-share quantity from risk budget, stop distance, costs and caps.
import { round2 } from './money.js';
export class SizeError extends Error {}
const EPS = 1e-9;
export const sharesFor = (amount, per) => { const u = Math.round(amount * 100), p = Math.round(per * 100); return p <= 0 || u <= 0 ? 0 : Math.floor(u / p); };

export const DEFAULT_RULES = { budget: null, cashBufferPct: 10, maxPositionPct: 75, maxOrderValue: 4000, minOrderValue: 5, maxLossPerTrade: 50, maxDailyLoss: 150,
  maxTradesPerDay: 3, minRewardRisk: 1.0, requireStop: true, noEntriesBefore: '09:45', noEntriesAfter: '15:30', flatBy: '15:55', blocked: [] };

/** Maps the snake_case config keys to the camelCase rules. */
export function rulesFromConfig(c) {
  return { ...DEFAULT_RULES, budget: c.budget, cashBufferPct: c.cash_buffer_pct, maxPositionPct: c.max_position_pct, maxOrderValue: c.max_order_usd, minOrderValue: c.min_order_usd,
    maxLossPerTrade: c.max_loss_per_trade_usd, maxDailyLoss: c.max_daily_loss_usd, maxTradesPerDay: c.max_trades_per_day, minRewardRisk: c.min_reward_risk,
    noEntriesBefore: c.no_entries_before, noEntriesAfter: c.no_entries_after, flatBy: c.flat_by, blocked: c.blocked || [] };
}

export function sizeTrade(plan, rules, { budget, limit, price, cash } = {}) {
  const c = { ...DEFAULT_RULES, ...rules };
  const sym = String(plan.symbol || '').trim().toUpperCase();
  if (!sym) throw new SizeError('the plan has no symbol');
  const side = String(plan.side || 'buy').toLowerCase();
  if (side !== 'buy') throw new SizeError('this tool sizes long (buy) trades only');
  const { entry: entryPlan, stop: stop0, target: target0 } = plan;
  for (const [n, v] of [['entry', entryPlan], ['stop', stop0], ['target', target0]]) if (!(v > 0)) throw new SizeError(`the plan needs a positive ${n}`);
  if ((c.blocked || []).map((b) => b.toUpperCase()).includes(sym)) throw new SizeError(`${sym} is on your blocked list`);
  const bud = Number(budget ?? c.budget ?? 0);
  if (!(bud > 0)) throw new SizeError('no budget set');
  const bufPct = Number(c.cashBufferPct || 0);
  if (!(bufPct >= 0 && bufPct < 100)) throw new SizeError('cash buffer must be between 0 and 100');
  let ref, refFrom;
  if (limit != null) { ref = round2(limit); refFrom = 'limit'; }
  else if (price != null && round2(price) > round2(entryPlan)) { ref = round2(price); refFrom = 'price'; }
  else { ref = round2(entryPlan); refFrom = 'plan'; }
  const stop = round2(stop0), target = round2(target0);
  if (stop >= ref) throw new SizeError(`the stop ${stop} is not below the entry ${ref}`);
  if (target <= ref) throw new SizeError(`the target ${target} is not above the entry ${ref}`);
  const riskC = Math.round((ref - stop) * 100), rewardC = Math.round((target - ref) * 100), risk = riskC / 100;
  const cashBuffer = Math.round(bud * bufPct) / 100;
  let available = bud - cashBuffer;
  if (cash != null && cash - cashBuffer < available - 0.005) available = cash - cashBuffer;
  available = Math.max(Math.round(available * 100) / 100, 0);
  const limits = [];
  if (c.maxLossPerTrade) limits.push({ name: 'max loss', amount: c.maxLossPerTrade, per: risk, shares: sharesFor(c.maxLossPerTrade, risk) });
  if (c.maxPositionPct) { const cap = Math.round(bud * c.maxPositionPct) / 100; limits.push({ name: 'position cap', amount: cap, per: ref, shares: sharesFor(cap, ref) }); }
  if (c.maxOrderValue) limits.push({ name: 'max order', amount: c.maxOrderValue, per: ref, shares: sharesFor(c.maxOrderValue, ref) });
  limits.push({ name: 'cash', amount: available, per: ref, shares: sharesFor(available, ref) });
  const qty = Math.max(0, Math.min(...limits.map((l) => l.shares)));
  const bound = limits.filter((l) => l.shares === qty).map((l) => l.name);
  limits.forEach((l) => { l.binds = l.name === bound[0]; });
  const cost = Math.round(qty * ref * 100) / 100, maxLoss = Math.round(qty * riskC) / 100;
  let refusal = null;
  if (qty === 0) refusal = bound[0] === 'max loss' ? `one share risks ${risk.toFixed(2)} (entry ${ref} minus stop ${stop}), more than your ${c.maxLossPerTrade} max loss per trade. No order.` : `one share of ${sym} costs ${ref}, more than your ${bound[0]} limit. No order.`;
  else if (c.minRewardRisk && rewardC < c.minRewardRisk * riskC - EPS) refusal = `reward:risk ${(rewardC / riskC).toFixed(2)} is under your minimum ${c.minRewardRisk}. No order.`;
  else if (cost < (c.minOrderValue || 0) - 0.005) refusal = `${qty} share(s) of ${sym} is ${cost}, under your ${c.minOrderValue} minimum order. No order.`;
  return { symbol: sym, side: 'buy', entry: ref, entryFrom: refFrom, stop, target, riskPerShare: risk, rewardRisk: Math.round((rewardC / riskC) * 100) / 100,
    budget: bud, cashBuffer, cashAvailable: available, limits, qty, boundBy: bound[0], cost, maxLoss, refusal };
}
