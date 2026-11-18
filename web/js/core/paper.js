// Paper-trading engine. SIMULATION ONLY. Documented assumptions live in PAPER_TRADING.md.
import { computeCosts, COST_DEFAULTS } from './costs.js';
import { riskGate, orderFingerprint } from './risk.js';
import { roundToTick, convert } from './money.js';
import { MARKETS, zonedParts } from './time.js';

let seq = 0;
const uid = (p) => `${p}-${Date.now().toString(36)}-${(seq++).toString(36)}`;
const clone = (x) => JSON.parse(JSON.stringify(x));

export function createAccount({ name = 'Paper account', currency = 'INR', market = 'IN', startBalance = 1000000, rules, nowMs = Date.now() } = {}) {
  return { id: uid('acct'), name, simulated: true, currency, market, startBalance, cash: startBalance, positions: {}, orders: [], trades: [], fills: [],
    equityCurve: [{ t: nowMs, equity: startBalance }], rules: rules || null, killSwitch: false, aiMode: 'analyse', createdAt: nowMs, realisedPnl: 0, totalCosts: 0, recentFingerprints: [] };
}

export function equityOf(acct, prices, fxFor = () => 1) {
  let e = acct.cash;
  for (const [sym, p] of Object.entries(acct.positions)) e += p.qty * (prices[sym] ?? p.lastPrice ?? p.avgCost) * (fxFor(p) ?? 1);
  return e;
}
export function dailyPnl(acct, nowMs, tz) {
  const day = zonedParts(nowMs, tz).date;
  const start = [...acct.equityCurve].reverse().find((e) => zonedParts(e.t, tz).date < day);
  const base = start ? start.equity : acct.startBalance;
  const cur = acct.equityCurve[acct.equityCurve.length - 1].equity;
  return cur - base;
}

/**
 * Submit an order. Returns {account, order, rejected, reasons, warnings}. Never mutates input.
 * quote: {price, bid?, ask?, volume?(bar or day volume), kind:'delayed'|'realtime'|'historical', instrumentCurrency}
 * env: {nowMs, tick, lotSize, fxRates, costModel, spreadBps, slippageBps, participationLimit:0.1, prices, extraHolidays, enforceMarketHours, allowedMarkets}
 */
export function submitOrder(account, input, quote, env) {
  const acct = clone(account);
  const m = MARKETS[input.market || acct.market];
  const order = { id: uid('ord'), createdAt: env.nowMs, status: 'pending', simulated: true, symbol: input.symbol, market: input.market || acct.market, side: input.side,
    type: input.type || 'market', qty: input.qty, limitPrice: input.limitPrice ?? null, stop: input.stop ?? null, target: input.target ?? null, product: input.product || 'delivery', source: input.source || 'manual', dataKind: quote?.kind, notes: [] };
  const reject = (reasons, warnings = []) => { order.status = 'rejected'; order.reasons = reasons; acct.orders.push(order); return { account: acct, order, rejected: true, reasons, warnings }; };
  if (!quote || !(quote.price > 0)) return reject(['No price available for this instrument: the order is rejected rather than filled at a made-up price.']);
  const instCur = quote.instrumentCurrency || m.currency;
  const fx = instCur === acct.currency ? 1 : convert(1, instCur, acct.currency, env.fxRates);
  if (fx === null) return reject([`This account is in ${acct.currency} but the instrument trades in ${instCur} and no exchange rate is set. Add a rate in Settings > Currency.`]);
  const tick = env.tick ?? m.tick, equity = equityOf(acct, env.prices || {}, (p) => p.fx ?? 1);
  const exposure = Object.entries(acct.positions).reduce((s, [sym, p]) => s + p.qty * ((env.prices || {})[sym] ?? p.avgCost) * (p.fx ?? 1), 0);
  const ctx = { rules: acct.rules || {}, equity, cash: acct.cash, positions: acct.positions, prices: env.prices, exposureValue: exposure, dailyPnl: dailyPnl(acct, env.nowMs, m.tz),
    tradesToday: acct.orders.filter((o) => o.status === 'filled' && o.side === 'buy' && zonedParts(o.createdAt, m.tz).date === zonedParts(env.nowMs, m.tz).date).length,
    recentFingerprints: acct.recentFingerprints, nowMs: env.nowMs, killSwitch: acct.killSwitch, allowedMarkets: env.allowedMarkets, enforceMarketHours: env.enforceMarketHours, extraHolidays: env.extraHolidays, lotSize: env.lotSize ?? m.lotSize };
  const refPriceNative = order.type === 'limit' ? order.limitPrice : quote.price;
  const gate = riskGate({ ...order, refPrice: refPriceNative * fx }, ctx);
  // risk gate works in account currency for value limits; stop/target are native so compare natively when fx != 1
  if (fx !== 1) gate.warnings.push(`Values converted from ${instCur} to ${acct.currency} at ${fx.toFixed(4)} (${env.fxRates?.source || 'manual rate'}).`);
  if (!gate.pass) return reject(gate.reasons, gate.warnings);
  acct.recentFingerprints = [...acct.recentFingerprints.filter((x) => env.nowMs - x.t < 120000), { fp: orderFingerprint(order), t: env.nowMs }];
  const half = ((env.spreadBps ?? COST_DEFAULTS[order.market]?.spreadBps ?? 2) / 2) / 10000;
  const bid = quote.bid ?? quote.price * (1 - half), ask = quote.ask ?? quote.price * (1 + half);
  order.spreadModelled = quote.bid == null || quote.ask == null;
  const marketable = order.type === 'market' || (order.side === 'buy' ? order.limitPrice >= ask : order.limitPrice <= bid);
  if (!marketable) { order.status = 'open'; order.notes.push('Limit order resting; fills only if a later price reaches it.'); acct.orders.push(order); return { account: acct, order, rejected: false, reasons: [], warnings: gate.warnings }; }
  const res = fillOrder(acct, order, { bid, ask, volume: quote.volume, fx, instCur }, env, tick);
  return { account: res, order: res.orders[res.orders.length - 1], rejected: res.orders[res.orders.length - 1].status === 'rejected', reasons: res.orders[res.orders.length - 1].reasons || [], warnings: gate.warnings };
}

function fillOrder(acct, order, q, env, tick) {
  const partLimit = env.participationLimit ?? 0.1;
  let qty = order.qty;
  if (q.volume > 0 && qty > q.volume * partLimit) { qty = Math.max(0, Math.floor(q.volume * partLimit)); order.notes.push(`Partial fill: ${qty} of ${order.qty} (liquidity limit ${partLimit * 100}% of volume ${q.volume}); the rest is cancelled.`); }
  if (qty <= 0) { order.status = 'rejected'; order.reasons = ['Liquidity: no volume available to fill this order.']; acct.orders.push(order); return acct; }
  const slipBps = (env.slippageBps ?? COST_DEFAULTS[order.market]?.slippageBps ?? 2) + (q.volume > 0 ? 100 * (qty / q.volume) : 0); // +1bp per 1% participation
  const base = order.side === 'buy' ? q.ask : q.bid;
  let px = base * (1 + (order.side === 'buy' ? 1 : -1) * slipBps / 10000);
  if (order.type === 'limit') px = order.side === 'buy' ? Math.min(px, order.limitPrice) : Math.max(px, order.limitPrice);
  px = roundToTick(px, tick, order.side === 'buy' ? 'up' : 'down');
  const costs = computeCosts({ market: order.market, side: order.side, qty, price: px, product: order.product, model: env.costModel });
  const gross = qty * px * q.fx, costAcct = costs.total * q.fx;
  if (order.side === 'buy' && gross + costAcct > acct.cash) { order.status = 'rejected'; order.reasons = [`cash: filled value plus costs ${(gross + costAcct).toFixed(2)} exceeds cash ${acct.cash.toFixed(2)}`]; acct.orders.push(order); return acct; }
  const fill = { id: uid('fill'), orderId: order.id, t: env.nowMs, symbol: order.symbol, side: order.side, qty, price: px, costs, costAcct, fx: q.fx, slippageBps: +slipBps.toFixed(2) };
  acct.fills.push(fill); acct.totalCosts += costAcct;
  if (order.side === 'buy') {
    acct.cash -= gross + costAcct;
    const p = acct.positions[order.symbol] || { qty: 0, avgCost: 0, entryCosts: 0, market: order.market, currency: q.instCur, fx: q.fx, openedAt: env.nowMs };
    p.avgCost = (p.avgCost * p.qty + px * qty) / (p.qty + qty); p.qty += qty; p.entryCosts += costAcct; p.fx = q.fx; p.lastPrice = px;
    if (order.stop) p.stop = order.stop; if (order.target) p.target = order.target; p.product = order.product;
    acct.positions[order.symbol] = p;
  } else {
    const p = acct.positions[order.symbol];
    acct.cash += gross - costAcct;
    const share = qty / p.qty, entryCostPart = p.entryCosts * share;
    const pnl = (px - p.avgCost) * qty * p.fx - costAcct - entryCostPart;
    acct.realisedPnl += pnl;
    acct.trades.push({ id: uid('trade'), symbol: order.symbol, market: order.market, qty, entry: p.avgCost, exit: px, pnl: Math.round(pnl * 100) / 100, costs: Math.round((costAcct + entryCostPart) * 100) / 100, openedAt: p.openedAt, closedAt: env.nowMs, reason: order.reason || order.source, currency: acct.currency });
    p.qty -= qty; p.entryCosts -= entryCostPart;
    if (p.qty <= 0) delete acct.positions[order.symbol];
  }
  order.status = qty < order.qty ? 'partially_filled' : 'filled'; order.filledQty = qty; order.avgFillPrice = px; acct.orders.push(order);
  acct.equityCurve.push({ t: env.nowMs, equity: equityOf(acct, { ...(env.prices || {}), [order.symbol]: px }, (p) => p.fx ?? 1) });
  return acct;
}

/** Feed a price bar for a symbol: triggers resting limits, then stops/targets. Stop is checked BEFORE target (conservative). */
export function onBar(account, symbol, bar, env) {
  let acct = clone(account); const events = [];
  const pos = acct.positions[symbol];
  if (pos) { pos.lastPrice = bar.c; }
  for (const o of acct.orders.filter((x) => x.status === 'open' && x.symbol === symbol)) {
    const hit = o.side === 'buy' ? bar.l <= o.limitPrice : bar.h >= o.limitPrice;
    if (hit) {
      const idx = acct.orders.indexOf(o); acct.orders.splice(idx, 1);
      const tmp = clone(o); tmp.notes = [...(tmp.notes || []), 'Resting limit order filled when the bar traded through the limit.'];
      const px = o.limitPrice; const before = acct.orders.length;
      acct = fillOrder(acct, tmp, { bid: px, ask: px, volume: bar.v, fx: acct.positions[symbol]?.fx ?? 1, instCur: acct.currency }, { ...env, slippageBps: 0, nowMs: bar.t * 1000 || env.nowMs }, env.tick ?? 0.01);
      events.push({ type: 'limit-filled', symbol, orderId: o.id });
    }
  }
  const p2 = acct.positions[symbol];
  if (p2 && (p2.stop || p2.target)) {
    let exit = null, why = null;
    if (p2.stop && bar.l <= p2.stop) { exit = bar.o != null && bar.o < p2.stop ? bar.o : p2.stop; why = 'stop-loss'; }
    else if (p2.target && bar.h >= p2.target) { exit = bar.o != null && bar.o > p2.target ? bar.o : p2.target; why = 'take-profit'; }
    if (exit != null) {
      const o = { id: uid('ord'), createdAt: env.nowMs, status: 'pending', simulated: true, symbol, market: p2.market, side: 'sell', type: 'market', qty: p2.qty, product: p2.product, source: 'engine', reason: why, notes: [`${why} triggered at ${exit} (gap-aware: filled at the open if it gapped through).`] };
      acct = fillOrder(acct, o, { bid: exit, ask: exit, volume: undefined, fx: p2.fx ?? 1, instCur: p2.currency }, { ...env, slippageBps: 0, nowMs: bar.t * 1000 || env.nowMs }, env.tick ?? 0.01);
      events.push({ type: why, symbol, price: exit });
    }
  }
  return { account: acct, events };
}

export function markToMarket(account, prices, nowMs = Date.now()) {
  const a = clone(account);
  for (const [s, p] of Object.entries(a.positions)) if (prices[s] != null) p.lastPrice = prices[s];
  a.equityCurve.push({ t: nowMs, equity: equityOf(a, prices, (p) => p.fx ?? 1) });
  return a;
}
export function resetAccount(account, nowMs = Date.now()) { return createAccount({ name: account.name, currency: account.currency, market: account.market, startBalance: account.startBalance, rules: account.rules, nowMs }); }

export function statistics(account, prices = {}) {
  const t = account.trades, wins = t.filter((x) => x.pnl > 0), losses = t.filter((x) => x.pnl < 0);
  const sum = (a) => a.reduce((s, x) => s + x.pnl, 0);
  let peak = -Infinity, maxDd = 0, maxDdPct = 0;
  for (const e of account.equityCurve) { peak = Math.max(peak, e.equity); maxDd = Math.max(maxDd, peak - e.equity); maxDdPct = Math.max(maxDdPct, peak > 0 ? (peak - e.equity) / peak : 0); }
  const equity = equityOf(account, prices, (p) => p.fx ?? 1);
  const unrealised = Object.entries(account.positions).reduce((s, [sym, p]) => s + (((prices[sym] ?? p.lastPrice ?? p.avgCost) - p.avgCost) * p.qty * (p.fx ?? 1)), 0);
  const gw = sum(wins), gl = -sum(losses);
  return { equity, startBalance: account.startBalance, returnPct: ((equity / account.startBalance) - 1) * 100, realisedPnl: account.realisedPnl, unrealisedPnl: unrealised, totalCosts: account.totalCosts,
    trades: t.length, winRate: t.length ? wins.length / t.length : null, avgWin: wins.length ? gw / wins.length : null, avgLoss: losses.length ? -gl / losses.length : null,
    profitFactor: gl ? gw / gl : (gw ? Infinity : null), expectancy: t.length ? sum(t) / t.length : null, maxDrawdown: maxDd, maxDrawdownPct: maxDdPct * 100 };
}
