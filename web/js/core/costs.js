// Transaction-cost models for SIMULATION. Every rate is a configurable default taken from the
// publicly described fee structures of discount brokers/exchanges at the time of writing.
// Rates change; the user can edit them in Settings. They are NOT a statement of what your broker charges.

export const COST_DEFAULTS = {
  IN: { label: 'India (NSE/BSE cash equity)', brokerageRate: 0.0003, brokerageCap: 20, deliveryBrokerageFlat: 0, sttIntradaySell: 0.00025, sttDelivery: 0.001,
    exchangeTxn: 0.0000297, sebi: 0.000001, stampIntradayBuy: 0.00003, stampDeliveryBuy: 0.00015, gst: 0.18, spreadBps: 4, slippageBps: 3 },
  US: { label: 'United States (stocks)', commissionPerShare: 0, commissionMin: 0, secFeeRate: 0.00002, tafPerShare: 0.000166, tafCap: 8.3, spreadBps: 2, slippageBps: 2 },
};

/** Returns {total, items:[{name,amount}]} for ONE fill. side: buy|sell; product: intraday|delivery. */
export function computeCosts({ market, side, qty, price, product = 'delivery', model }) {
  const m = { ...COST_DEFAULTS[market], ...(model || {}) };
  const turnover = qty * price; const items = [];
  const add = (name, amount) => { if (amount) items.push({ name, amount: Math.round(amount * 100) / 100 }); };
  if (market === 'IN') {
    const brokerage = product === 'intraday' ? Math.min(turnover * m.brokerageRate, m.brokerageCap) : m.deliveryBrokerageFlat;
    add('Brokerage', brokerage);
    const stt = product === 'intraday' ? (side === 'sell' ? turnover * m.sttIntradaySell : 0) : turnover * m.sttDelivery;
    add('STT', stt);
    const txn = turnover * m.exchangeTxn; add('Exchange transaction charges', txn);
    const sebi = turnover * m.sebi; add('SEBI turnover fee', sebi);
    add('GST', (brokerage + txn + sebi) * m.gst);
    if (side === 'buy') add('Stamp duty', turnover * (product === 'intraday' ? m.stampIntradayBuy : m.stampDeliveryBuy));
  } else {
    add('Commission', Math.max(qty * (m.commissionPerShare || 0), qty ? m.commissionMin || 0 : 0));
    if (side === 'sell') { add('SEC fee', turnover * m.secFeeRate); add('FINRA TAF', Math.min(qty * m.tafPerShare, m.tafCap)); }
  }
  return { total: Math.round(items.reduce((s, i) => s + i.amount, 0) * 100) / 100, items };
}
