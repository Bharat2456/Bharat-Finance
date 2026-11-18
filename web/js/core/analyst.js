// Builds the structured, evidence-labelled analysis. Everything here is computed from the supplied bars.
// Layers are kept separate: verified (data), calculated (indicators), model (cone), explanation (AI/rule-based text).
import { sma, ema, rsi, macd, bollinger, atr, vwap, supportResistance, trendOf, pctChange, realisedVol } from './indicators.js';
import { detectPatterns } from './candles.js';
import { coneForecast, walkForwardCalibration } from './forecast.js';
import { findSetups, SETUP_LABELS } from './signals.js';

export function buildAnalysis({ symbol, market, currency, bars, dataKind, asOfMs, source, intraday = false, news = [], fundamentals = null }) {
  const withOhlc = bars.filter((b) => b.h != null && b.l != null && b.o != null);
  const closes = bars.map((b) => b.c); const last = bars[bars.length - 1];
  const caveats = [];
  if (!bars.length) return { symbol, ok: false, error: 'No price data available for this instrument.' };
  if (withOhlc.length < bars.length) caveats.push('This data source provides closing prices only: no highs/lows, so ATR, VWAP, candlestick patterns and swing-based support/resistance are unavailable.');
  if (dataKind === 'historical') caveats.push('Historical data: this is not a live market view.');
  if (dataKind === 'delayed') caveats.push('Delayed, unofficial data (Yahoo Finance): prices can lag the exchange by 15 minutes or more.');
  if (closes.length < 50) caveats.push(`Only ${closes.length} bars: long-term indicators (50-bar average) are limited.`);
  const verified = { symbol, market, currency, last: last.c, lastBarTime: last.t, bars: bars.length, change1: pctChange(closes, 1), change5: pctChange(closes, 5), change20: pctChange(closes, 20),
    high: Math.max(...(withOhlc.length ? withOhlc.map((b) => b.h) : closes)), low: Math.min(...(withOhlc.length ? withOhlc.map((b) => b.l) : closes)) };
  const s20 = sma(closes, 20).pop() ?? null, s50 = closes.length >= 50 ? sma(closes, 50).pop() : null, e12 = ema(closes, 12).pop() ?? null;
  const m = macd(closes), bb = bollinger(closes).pop() ?? null;
  const calc = { rsi14: rsi(closes), sma20: s20, sma50: s50, ema12: e12, macd: m.line.length ? { line: m.line[m.line.length - 1], signal: m.signal[m.signal.length - 1], hist: m.hist[m.hist.length - 1] } : null, bollinger: bb,
    atr14: withOhlc.length > 14 ? atr(withOhlc) : null, vwap: intraday && withOhlc.length ? vwap(withOhlc) : null, vol20: realisedVol(closes, 20), trend: trendOf(closes) };
  const volumes = bars.map((b) => b.v).filter((v) => v > 0);
  const volume = volumes.length >= 21 ? { last: volumes[volumes.length - 1], avg20: volumes.slice(-21, -1).reduce((a, b) => a + b, 0) / 20, ratio: volumes[volumes.length - 1] / (volumes.slice(-21, -1).reduce((a, b) => a + b, 0) / 20) } : null;
  if (!volume) caveats.push('No usable volume series: volume analysis is not available.');
  const sr = withOhlc.length >= 10 ? supportResistance(withOhlc, last.c) : { support: [], resistance: [] };
  const patterns = withOhlc.length ? detectPatterns(withOhlc) : [];
  const setups = closes.length >= 30 ? findSetups(closes).tags.map((t) => ({ key: t, label: SETUP_LABELS[t][0], note: SETUP_LABELS[t][1] })) : [];
  const daily = !intraday;
  const cone = daily ? coneForecast(closes, { horizon: 5 }) : null;
  const calibration = daily ? walkForwardCalibration(closes, { horizon: 5 }) : null;
  const R = sr.resistance[0]?.level ?? (calc.bollinger ? calc.bollinger.upper : null), S = sr.support[0]?.level ?? (calc.bollinger ? calc.bollinger.lower : null);
  const px = last.c, f = (x) => (x == null ? 'n/a' : x.toFixed(2));
  const scenarios = [
    { name: 'Bullish', condition: `Price holds above ${f(S)} and closes above ${f(R)}${s20 ? ` with the 20-bar average (${f(s20)}) supporting` : ''}.`, invalidation: `A close below ${f(S)}.`, evidence: [calc.trend.label === 'uptrend' ? 'Trend is up' : null, calc.rsi14 > 50 ? `RSI ${f(calc.rsi14)} above 50` : null, calc.macd?.hist > 0 ? 'MACD histogram positive' : null].filter(Boolean) },
    { name: 'Neutral / range', condition: `Price stays between ${f(S)} and ${f(R)}.`, invalidation: `A close outside that range.`, evidence: [calc.trend.label.startsWith('sideways') ? 'Trend is mixed' : null, calc.bollinger && (calc.bollinger.upper - calc.bollinger.lower) / px < 0.06 ? 'Bollinger bands are narrow' : null].filter(Boolean) },
    { name: 'Bearish', condition: `Price closes below ${f(S)}${s20 ? ` and stays under the 20-bar average (${f(s20)})` : ''}.`, invalidation: `A close back above ${f(R)}.`, evidence: [calc.trend.label === 'downtrend' ? 'Trend is down' : null, calc.rsi14 < 50 ? `RSI ${f(calc.rsi14)} below 50` : null, calc.macd?.hist < 0 ? 'MACD histogram negative' : null].filter(Boolean) },
  ];
  const risks = ['Indicators describe the past; none of them is a prediction.', 'News, earnings, gaps and halts can invalidate any scenario instantly.'];
  if (calc.vol20 && calc.vol20 > 3) risks.push(`Recent daily volatility is high (${calc.vol20.toFixed(1)}% per day): position sizes should be smaller.`);
  if (calc.rsi14 > 70) risks.push('RSI above 70 (overbought): momentum can persist, but pullback risk is higher.');
  if (calc.rsi14 < 30) risks.push('RSI under 30 (oversold): falling prices can keep falling.');
  if (volume && volume.ratio < 0.5) risks.push('Volume is much lower than its 20-bar average: moves on thin volume are less reliable.');
  return { ok: true, symbol, market, currency, generatedAt: asOfMs, dataKind, source, intraday, verified, calculated: calc, volume, supportResistance: sr, patterns, setups, scenarios,
    model: { cone, calibration, probabilitiesShown: !!(calibration && calibration.ok), note: 'Scenario probabilities are shown only when a walk-forward calibration test passes. Otherwise only an uncalibrated price range from past returns is given.' },
    news, fundamentals, risks, dataQuality: { kind: dataKind, source, caveats, lastBarTime: last.t } };
}

/** Compact JSON context for an LLM prompt: data only, no instructions inside. */
export function analysisToContext(a) {
  const n = (x) => (typeof x === 'number' ? +x.toFixed(4) : x);
  return JSON.stringify({ symbol: a.symbol, market: a.market, currency: a.currency, dataKind: a.dataKind, source: a.source, verified: a.verified, calculated: { ...a.calculated, macd: a.calculated.macd, trend: a.calculated.trend.label },
    support: a.supportResistance.support, resistance: a.supportResistance.resistance, patterns: a.patterns.map((p) => p.name), setups: a.setups.map((s) => s.label), volume: a.volume,
    scenarios: a.scenarios.map((s) => ({ name: s.name, condition: s.condition, invalidation: s.invalidation })), cone: a.model.cone, caveats: a.dataQuality.caveats }, (k, v) => n(v));
}
