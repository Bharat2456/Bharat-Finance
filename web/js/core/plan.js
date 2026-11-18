// Exit Planner: stop and target in exact ticks.
import { roundToTick } from './money.js';

export class PlanError extends Error {}
const MIN_RISK_PCT = 0.05;

/** stop: {rule:'or_mid'|'or_low'|'price'|'pct'|'atr', value}; target: {rule:'r'|'price', value}. */
export function computePlan({ entry, stop, target, orHigh, orLow, atr, tick = 0.01 }) {
  const e = roundToTick(entry, tick, 'nearest');
  if (!(e > 0)) throw new PlanError('the entry price must be above 0');
  let raw, label;
  if (stop.rule === 'or_mid' || stop.rule === 'or_low') {
    if (orHigh == null || orLow == null) throw new PlanError('an opening-range stop needs the opening range');
    const oh = roundToTick(orHigh, tick), ol = roundToTick(orLow, tick);
    if (oh <= ol) throw new PlanError(`the opening-range high ${oh} must be above its low ${ol}`);
    if (stop.rule === 'or_mid') { raw = (oh + ol) / 2; label = 'opening-range midpoint'; } else { raw = ol; label = 'opening-range low'; }
  } else if (stop.rule === 'price') { raw = stop.value; label = 'your price'; }
  else if (stop.rule === 'pct') { if (!(stop.value > 0 && stop.value < 100)) throw new PlanError('pct stop needs a value between 0 and 100'); raw = e * (1 - stop.value / 100); label = `${stop.value}% under the entry`; }
  else if (stop.rule === 'atr') { if (atr == null) throw new PlanError('an ATR stop needs bars'); raw = e - stop.value * atr; label = `${stop.value} x ATR under the entry`; }
  else throw new PlanError(`unknown stop rule ${stop.rule}`);
  const st = roundToTick(raw, tick, 'down'); // a long's stop rounds away from the entry
  if (st >= e) throw new PlanError(`the stop ${st} (${label}) is at or above the entry ${e}: a long's stop goes under the entry`);
  if (st <= 0) throw new PlanError('the stop works out to 0 or less: pick a stop above 0');
  const risk = Math.round(((e - st) / tick)) * tick;
  if (risk < (e * MIN_RISK_PCT) / 100) throw new PlanError(`the stop is only ${risk.toFixed(4)} under the entry, less than 0.05% of the price: too tight to survive the spread. Widen it.`);
  let tg, tlabel;
  if (target.rule === 'r') { if (!(target.value > 0)) throw new PlanError('target needs an R multiple above 0'); tg = roundToTick(e + target.value * risk, tick); tlabel = `${target.value}R`; }
  else { tg = roundToTick(target.value, tick); }
  if (tg <= e) throw new PlanError(`the target ${tg} is at or below the entry ${e}: a long's target goes above it`);
  const rr = Math.round(((tg - e) / risk) * 100) / 100;
  return { entry: e, stop: st, stopLabel: label, target: tg, targetLabel: tlabel || `your price (${rr}R)`, targetR: target.rule === 'r' ? target.value : rr, risk: +risk.toFixed(6), rewardRisk: rr };
}
