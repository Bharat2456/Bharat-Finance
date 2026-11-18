// Currency formatting, conversion and tick rounding. No exchange rate is ever invented:
// convert() returns null when no rate is supplied.

export const CURRENCIES = {
  INR: { symbol: '₹', locale: 'en-IN', name: 'Indian Rupee' }, USD: { symbol: '$', locale: 'en-US', name: 'US Dollar' },
  EUR: { symbol: '€', locale: 'de-DE', name: 'Euro' }, GBP: { symbol: '£', locale: 'en-GB', name: 'British Pound' },
  JPY: { symbol: '¥', locale: 'ja-JP', name: 'Japanese Yen' }, AED: { symbol: 'د.إ', locale: 'en-AE', name: 'UAE Dirham' },
  SGD: { symbol: 'S$', locale: 'en-SG', name: 'Singapore Dollar' }, AUD: { symbol: 'A$', locale: 'en-AU', name: 'Australian Dollar' },
  CAD: { symbol: 'C$', locale: 'en-CA', name: 'Canadian Dollar' },
};

export function formatMoney(amount, currency = 'INR', { compact = false, signed = false, digits } = {}) {
  if (amount === null || amount === undefined || Number.isNaN(amount)) return '—';
  const c = CURRENCIES[currency] || { locale: 'en-US' };
  const o = { style: 'currency', currency, currencyDisplay: 'symbol' };
  if (compact) { o.notation = 'compact'; o.maximumFractionDigits = 2; }
  else { const d = digits ?? (currency === 'JPY' ? 0 : 2); o.minimumFractionDigits = d; o.maximumFractionDigits = d; }
  if (signed) o.signDisplay = 'exceptZero';
  return new Intl.NumberFormat(c.locale, o).format(amount);
}
export const formatPct = (x, d = 2, signed = true) => (x === null || x === undefined || Number.isNaN(x)) ? '—' : `${signed && x > 0 ? '+' : ''}${x.toFixed(d)}%`;
export const formatNum = (x, d = 0, locale = 'en-IN') => (x === null || x === undefined || Number.isNaN(x)) ? '—' : new Intl.NumberFormat(locale, { maximumFractionDigits: d, minimumFractionDigits: d }).format(x);

/** rates = {base:'USD', rates:{INR:83.1,...}, asOf, source}. Returns null if a needed rate is missing. */
export function convert(amount, from, to, rates) {
  if (from === to) return amount;
  if (!rates || !rates.rates || !rates.base) return null;
  const get = (c) => (c === rates.base ? 1 : rates.rates[c]);
  const a = get(from), b = get(to);
  if (!a || !b) return null;
  return (amount / a) * b;
}

/** Round to a price tick using integer arithmetic on (price/tick). mode: nearest | down | up */
export function roundToTick(price, tick = 0.01, mode = 'nearest') {
  const n = price / tick;
  const eps = 1e-9;
  const k = mode === 'down' ? Math.floor(n + eps) : mode === 'up' ? Math.ceil(n - eps) : Math.floor(n + 0.5 + eps);
  return Math.round(k * tick * 1e6) / 1e6;
}
export const round2 = (x) => Math.floor(x * 100 + 0.5 + 1e-9) / 100; // half-up rounding to cents
