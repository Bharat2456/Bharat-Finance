// Broker adapter interface. Live execution is DISABLED by design in this static, browser-only build.
// See BROKER_INTEGRATION.md for what a safe live adapter would need.
export const MODES = [
  { id: 'analysis', name: 'Analysis only', enabled: true, note: 'No orders of any kind.' },
  { id: 'paper', name: 'Paper trading', enabled: true, note: 'Simulated orders against live delayed prices. Default.' },
  { id: 'assisted', name: 'Assisted live trading', enabled: false, note: 'Needs a compliant broker API, a local runtime for secrets, and per-order human confirmation. Not available in this build.' },
  { id: 'auto', name: 'Automated live trading', enabled: false, note: 'Not available. Requires legal review (e.g. SEBI retail algo rules, broker/exchange approval) and infrastructure that is not browser-only.' },
];
export class LiveTradingDisabled extends Error { constructor() { super('Live order execution is disabled in this build. Use paper trading, or see BROKER_INTEGRATION.md.'); this.code = 'LIVE_DISABLED'; } }
/** Every adapter must implement this shape. The only shipped adapter refuses everything. */
export class DisabledBrokerAdapter {
  get id() { return 'disabled'; } get live() { return false; }
  async placeOrder() { throw new LiveTradingDisabled(); } async cancelOrder() { throw new LiveTradingDisabled(); } async positions() { throw new LiveTradingDisabled(); }
}
/** A human-readable ticket (what a broker order would be), for review and copy only. */
export function buildTicket(sizing, { exchange = '', product = 'delivery' } = {}) {
  if (!sizing || sizing.refusal || !sizing.qty) return null;
  return { symbol: sizing.symbol, exchange, side: 'BUY', quantity: sizing.qty, orderType: 'LIMIT', price: sizing.entry, stopLoss: sizing.stop, takeProfit: sizing.target, product, maxLoss: sizing.maxLoss, note: 'REVIEW ONLY: nothing is sent anywhere.' };
}
