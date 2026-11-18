import { test } from 'node:test'; import assert from 'node:assert/strict';
import { riskGate } from '../../web/js/core/risk.js'; import { computeCosts } from '../../web/js/core/costs.js';
import { createAccount, submitOrder, resetAccount } from '../../web/js/core/paper.js';
import { zonedToMs, zonedParts, marketStatus, isTradingDay, MARKETS } from '../../web/js/core/time.js'; import { convert, roundToTick, formatMoney } from '../../web/js/core/money.js';

const rules = { maxLossPerTrade: 5000, maxDailyLoss: 20000, maxOrderValue: 300000, minOrderValue: 100, maxPositionPct: 50, maxExposurePct: 90, maxTradesPerDay: 5, minRewardRisk: 1, requireStop: true, cashBufferPct: 0, blocked: [] };
const NOW = zonedToMs('2026-10-19', 11 * 60, 'Asia/Kolkata');
const env = (o = {}) => ({ nowMs: NOW, fxRates: null, enforceMarketHours: false, prices: {}, ...o });
const quote = (price = 1000, o = {}) => ({ price, kind: 'demo', volume: 1e6, instrumentCurrency: 'INR', ...o });
const acct = () => createAccount({ currency: 'INR', market: 'IN', startBalance: 1000000, rules, nowMs: NOW });

test('time zones: 09:30 New York in October 2026 is 13:30 UTC', () => { assert.equal(zonedToMs('2026-10-19', 570, 'America/New_York'), 1792416600000); assert.equal(zonedParts(1792416600000, 'America/New_York').date, '2026-10-19'); });
test('India: weekends and fixed holidays are closed, weekdays are trading days', () => { assert.equal(isTradingDay('IN', '2026-10-19').ok, true); assert.equal(isTradingDay('IN', '2026-10-17').ok, false); assert.equal(isTradingDay('IN', '2026-08-15').ok, false); assert.equal(MARKETS.IN.currency, 'INR'); });
test('market status reports open mid-session and closed at night', () => { assert.equal(marketStatus('IN', NOW).state, 'open'); assert.equal(marketStatus('IN', zonedToMs('2026-10-19', 23 * 60, 'Asia/Kolkata')).state, 'closed'); });
test('currency: never guesses a missing rate', () => { assert.equal(convert(1, 'USD', 'INR', null), null); assert.equal(convert(10, 'USD', 'USD', null), 10); assert.equal(convert(1, 'USD', 'INR', { base: 'USD', rates: { INR: 80 } }), 80); assert.equal(convert(1, 'USD', 'XXX', { base: 'USD', rates: { INR: 80 } }), null); });
test('tick rounding is exact', () => { assert.equal(roundToTick(100.07, 0.05, 'nearest'), 100.05); assert.equal(roundToTick(100.07, 0.05, 'down'), 100.05); assert.equal(roundToTick(100.01, 0.05, 'up'), 100.05); });
test('money formatting uses Indian grouping for INR', () => { assert.match(formatMoney(1000000, 'INR'), /10,00,000/); });

test('costs: India delivery sell has STT and GST; US sell has SEC and TAF; both are positive', () => {
  const i = computeCosts({ market: 'IN', side: 'sell', qty: 10, price: 1000, product: 'delivery' }); assert.ok(i.total > 0); assert.ok(i.items.some((x) => x.name === 'STT'));
  const u = computeCosts({ market: 'US', side: 'sell', qty: 100, price: 100 }); assert.ok(u.total > 0); assert.ok(u.items.some((x) => /SEC/.test(x.name)));
  assert.ok(computeCosts({ market: 'IN', side: 'buy', qty: 10, price: 1000 }).items.some((x) => /Stamp/.test(x.name)), 'buy has stamp duty');
  assert.ok(Math.abs(i.total - i.items.reduce((s, x) => s + x.amount, 0)) < 0.02);
});

test('risk gate: kill switch blocks everything', () => { const r = riskGate({ symbol: 'A', market: 'IN', side: 'buy', type: 'market', qty: 1, refPrice: 100, stop: 90, target: 120 }, { rules, equity: 1e6, cash: 1e6, positions: {}, killSwitch: true, nowMs: NOW }); assert.equal(r.pass, false); assert.match(r.reasons[0], /Kill switch/); });
test('risk gate: buy without a stop is refused when a stop is required', () => { const r = riskGate({ symbol: 'A', market: 'IN', side: 'buy', type: 'market', qty: 1, refPrice: 100 }, { rules, equity: 1e6, cash: 1e6, positions: {}, nowMs: NOW, lotSize: 1 }); assert.equal(r.pass, false); assert.ok(r.reasons.some((x) => /stop/i.test(x))); });
test('risk gate: rejects bad quantity and blocked symbols', () => { const c = { rules: { ...rules, blocked: ['BAD'] }, equity: 1e6, cash: 1e6, positions: {}, nowMs: NOW, lotSize: 1 };
  assert.equal(riskGate({ symbol: 'A', market: 'IN', side: 'buy', type: 'market', qty: 1.5, refPrice: 100, stop: 90 }, c).pass, false);
  assert.equal(riskGate({ symbol: 'BAD', market: 'IN', side: 'buy', type: 'market', qty: 1, refPrice: 100, stop: 90 }, c).pass, false); });

test('paper: a valid buy fills with costs, spread and slippage, never at the raw price', () => {
  const r = submitOrder(acct(), { symbol: 'TCS', side: 'buy', qty: 10, stop: 950, target: 1100 }, quote(1000), env());
  assert.equal(r.rejected, false, JSON.stringify(r.reasons)); const o = r.order; assert.equal(o.status, 'filled'); assert.equal(o.simulated, true);
  assert.ok(r.account.cash < 1000000 - 10000, 'cash includes costs'); assert.ok(r.account.positions.TCS.qty === 10); assert.ok(o.avgFillPrice > 1000, 'buy fills above mid');
});
test('paper: no price means rejection, not a made-up fill', () => { const r = submitOrder(acct(), { symbol: 'X', side: 'buy', qty: 1, stop: 1 }, null, env()); assert.equal(r.rejected, true); assert.match(r.reasons[0], /No price/); });
test('paper: USD instrument in an INR account is rejected when no FX rate exists', () => { const r = submitOrder(acct(), { symbol: 'AAPL', market: 'US', side: 'buy', qty: 1, stop: 100 }, quote(200, { instrumentCurrency: 'USD' }), env()); assert.equal(r.rejected, true); assert.match(r.reasons[0], /exchange rate/); });
test('paper: input account is never mutated', () => { const a = acct(), snap = JSON.stringify(a); submitOrder(a, { symbol: 'TCS', side: 'buy', qty: 10, stop: 950, target: 1100 }, quote(1000), env()); assert.equal(JSON.stringify(a), snap); });
test('paper: oversized order is rejected by the risk gate', () => { const r = submitOrder(acct(), { symbol: 'TCS', side: 'buy', qty: 1000, stop: 950, target: 1100 }, quote(1000), env()); assert.equal(r.rejected, true); assert.ok(r.reasons.length > 0); });
test('paper: cannot sell what you do not own', () => { const r = submitOrder(acct(), { symbol: 'TCS', side: 'sell', qty: 5 }, quote(1000), env()); assert.equal(r.rejected, true); });
test('paper: reset restores balance and clears history', () => { const r = submitOrder(acct(), { symbol: 'TCS', side: 'buy', qty: 10, stop: 950, target: 1100 }, quote(1000), env()); const z = resetAccount(r.account, NOW); assert.equal(z.cash, z.startBalance); assert.equal(Object.keys(z.positions).length, 0); });
test('paper: market-hours enforcement blocks orders outside the session', () => { const night = zonedToMs('2026-10-19', 23 * 60, 'Asia/Kolkata'); const r = submitOrder(acct(), { symbol: 'TCS', side: 'buy', qty: 1, stop: 950, target: 1100 }, quote(1000), env({ nowMs: night, enforceMarketHours: true })); assert.equal(r.rejected, true); });
