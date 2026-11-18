// Pre-trade risk gate, shared by paper trading and (disabled-by-default) broker adapters.
// Generic in-app order gate (limits, windows, duplicates).
import { MARKETS, zonedParts, sessionFor, hhmmToMin, marketStatus } from './time.js';

export function orderFingerprint(o) { return [o.symbol, o.side, o.type, o.qty, o.limitPrice ?? '', o.stop ?? '', o.target ?? ''].join('|'); }

/**
 * order: {symbol, market, side, type, qty, limitPrice, stop, target, refPrice (per-share price used for sizing)}
 * ctx: {rules, equity, cash, positions:{SYM:{qty,avgCost}}, exposureValue, dailyPnl, tradesToday, recentFingerprints:[{fp,t}], nowMs, killSwitch,
 *       allowedMarkets, enforceMarketHours:true, extraHolidays, duplicateWindowSec:30, lotSize}
 */
export function riskGate(order, ctx) {
  const r = ctx.rules, reasons = [], warnings = [];
  const fail = (m) => reasons.push(m);
  if (ctx.killSwitch) return { pass: false, reasons: ['Kill switch is ON: all new orders are blocked until you switch it off.'], warnings };
  if (!order.symbol) fail('format: no symbol');
  if (!['buy', 'sell'].includes(order.side)) fail('format: side must be buy or sell');
  if (!['market', 'limit'].includes(order.type || 'market')) fail('format: order type must be market or limit');
  const lot = ctx.lotSize || 1;
  if (!Number.isInteger(order.qty) || order.qty <= 0) fail('format: quantity must be a whole number above 0');
  else if (order.qty % lot) fail(`format: quantity must be a multiple of the lot size ${lot}`);
  if (order.type === 'limit' && !(order.limitPrice > 0)) fail('format: a limit order needs a limit price above 0');
  if (ctx.allowedMarkets && !ctx.allowedMarkets.includes(order.market)) fail(`instrument restriction: ${order.market} trading is not enabled`);
  if ((r.blocked || []).map((s) => s.toUpperCase()).includes(String(order.symbol).toUpperCase())) fail(`instrument restriction: ${order.symbol} is on your blocked list`);
  const price = order.refPrice, value = price ? price * order.qty : null;
  if (!price) fail('no reference price available for this instrument: refusing to guess one');
  const m = MARKETS[order.market];
  if (m && ctx.enforceMarketHours !== false) {
    const st = marketStatus(order.market, ctx.nowMs, ctx.extraHolidays || {});
    if (st.state !== 'open') fail(`market hours: ${m.exchanges.join('/')} is ${st.state} (${st.reason})`);
    else {
      const p = zonedParts(ctx.nowMs, m.tz), s = sessionFor(m, p.date, ctx.extraHolidays || {});
      if (order.side === 'buy') {
        if (r.noEntriesBefore && p.minutes < hhmmToMin(r.noEntriesBefore)) fail(`entry window: no new entries before ${r.noEntriesBefore} (your rule)`);
        const cut = hhmmToMin(r.noEntriesAfter || '23:59'); if (r.noEntriesAfter && p.minutes > Math.min(cut, s.close)) fail(`entry window: no new entries after ${r.noEntriesAfter} (your rule)`);
      }
    }
  }
  const pos = (ctx.positions || {})[order.symbol];
  if (order.side === 'sell') {
    if (!pos || pos.qty <= 0) fail(`no short selling: you hold no ${order.symbol}`);
    else if (order.qty > pos.qty) fail(`no short selling: you hold ${pos.qty} ${order.symbol}, cannot sell ${order.qty}`);
  }
  if (order.side === 'buy' && value) {
    if (r.maxOrderValue && value > r.maxOrderValue) fail(`max order: value ${value.toFixed(2)} is above your maximum order ${r.maxOrderValue}`);
    if (r.minOrderValue && value < r.minOrderValue) fail(`min order: value ${value.toFixed(2)} is under your minimum order ${r.minOrderValue}`);
    if (value > ctx.cash) fail(`cash: order value ${value.toFixed(2)} is more than your cash ${ctx.cash.toFixed(2)}`);
    if (r.maxPositionPct) {
      const after = ((pos ? pos.qty * (ctx.prices?.[order.symbol] ?? pos.avgCost) : 0) + value);
      if (ctx.equity && after > (ctx.equity * r.maxPositionPct) / 100) fail(`position size: would be ${(100 * after / ctx.equity).toFixed(1)}% of equity, above your ${r.maxPositionPct}% limit`);
    }
    if (r.maxExposurePct && ctx.equity && (ctx.exposureValue + value) > (ctx.equity * r.maxExposurePct) / 100) fail(`exposure: total invested would pass ${r.maxExposurePct}% of equity`);
    if (r.requireStop && !(order.stop > 0)) fail('stop required: your rules require a stop-loss on every buy');
    if (order.stop > 0 && order.stop >= price) fail('stop must be below the entry for a long position');
    if (order.target > 0 && order.target <= price) fail('target must be above the entry for a long position');
    if (order.stop > 0 && r.maxLossPerTrade) { const loss = (price - order.stop) * order.qty; if (loss > r.maxLossPerTrade + 1e-9) fail(`max loss per trade: ${loss.toFixed(2)} at the stop is above your ${r.maxLossPerTrade} limit`); }
    if (order.stop > 0 && order.target > 0 && r.minRewardRisk) { const rr = (order.target - price) / (price - order.stop); if (rr < r.minRewardRisk) fail(`reward:risk ${rr.toFixed(2)} is under your minimum ${r.minRewardRisk}`); }
    if (r.maxDailyLoss && ctx.dailyPnl !== undefined && -ctx.dailyPnl >= r.maxDailyLoss) fail(`daily loss limit: today's loss ${(-ctx.dailyPnl).toFixed(2)} has reached your ${r.maxDailyLoss} limit`);
    if (r.maxTradesPerDay && ctx.tradesToday >= r.maxTradesPerDay) fail(`trades per day: you already placed ${ctx.tradesToday} (limit ${r.maxTradesPerDay})`);
  }
  const fp = orderFingerprint(order), win = (ctx.duplicateWindowSec ?? 30) * 1000;
  if ((ctx.recentFingerprints || []).some((x) => x.fp === fp && ctx.nowMs - x.t < win && ctx.nowMs - x.t >= 0)) fail(`duplicate: an identical order was sent in the last ${ctx.duplicateWindowSec ?? 30}s`);
  if (order.side === 'buy' && !(order.stop > 0)) warnings.push('No stop-loss set: a loss is unlimited until you exit.');
  return { pass: reasons.length === 0, reasons, warnings };
}
