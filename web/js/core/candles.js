// Simple, explicit candlestick-pattern rules (rules, not machine learning).
export function detectPatterns(bars) {
  const out = []; const n = bars.length; if (n < 2) return out;
  const b = bars[n - 1], p = bars[n - 2];
  const body = Math.abs(b.c - b.o), range = b.h - b.l || 1e-9;
  const upper = b.h - Math.max(b.o, b.c), lower = Math.min(b.o, b.c) - b.l;
  if (body / range < 0.1) out.push({ name: 'Doji', kind: 'neutral', note: 'Open and close almost equal: indecision.' });
  if (lower > 2 * body && upper < body && body / range < 0.4) out.push({ name: 'Hammer-shaped', kind: 'bullish-shape', note: 'Long lower wick; matters mainly after a decline.' });
  if (upper > 2 * body && lower < body && body / range < 0.4) out.push({ name: 'Shooting-star-shaped', kind: 'bearish-shape', note: 'Long upper wick; matters mainly after a rise.' });
  const pb = Math.abs(p.c - p.o);
  if (p.c < p.o && b.c > b.o && b.c >= p.o && b.o <= p.c && body > pb) out.push({ name: 'Bullish engulfing', kind: 'bullish-shape', note: 'Green body fully covers the previous red body.' });
  if (p.c > p.o && b.c < b.o && b.o >= p.c && b.c <= p.o && body > pb) out.push({ name: 'Bearish engulfing', kind: 'bearish-shape', note: 'Red body fully covers the previous green body.' });
  return out;
}
