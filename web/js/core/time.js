// Market calendars, sessions and time-zone helpers. Pure ES module (browser + Node).
// US market holidays and early closes (NYSE 2026-2027).
// India data is PARTIAL: weekends + fixed-date national holidays only. Floating holidays
// (Holi, Diwali Muhurat, Eid, ...) change every year and must be loaded from the NSE circular.

export const MARKETS = {
  US: {
    id: 'US', name: 'United States', short: 'US', flag: '🇺🇸', exchanges: ['NYSE', 'NASDAQ'], tz: 'America/New_York',
    currency: 'USD', open: '09:30', close: '16:00', earlyClose: '13:00', tick: 0.01, lotSize: 1,
    holidays: {
      '2026-01-01': "New Year's Day", '2026-01-19': 'Martin Luther King, Jr. Day', '2026-02-16': "Washington's Birthday",
      '2026-04-03': 'Good Friday', '2026-05-25': 'Memorial Day', '2026-06-19': 'Juneteenth', '2026-07-03': 'Independence Day (observed)',
      '2026-09-07': 'Labor Day', '2026-11-26': 'Thanksgiving Day', '2026-12-25': 'Christmas Day',
      '2027-01-01': "New Year's Day", '2027-01-18': 'Martin Luther King, Jr. Day', '2027-02-15': "Washington's Birthday",
      '2027-03-26': 'Good Friday', '2027-05-31': 'Memorial Day', '2027-06-18': 'Juneteenth (observed)',
      '2027-07-05': 'Independence Day (observed)', '2027-09-06': 'Labor Day', '2027-11-25': 'Thanksgiving Day',
      '2027-12-24': 'Christmas Day (observed)',
    },
    earlyCloses: { '2026-11-27': 'Day after Thanksgiving', '2026-12-24': 'Christmas Eve', '2027-11-26': 'Day after Thanksgiving' },
    calendarYears: [2026, 2027],
    calendarNote: 'NYSE holidays and early closes for 2026-2027 (verify against the exchange calendar).',
  },
  IN: {
    id: 'IN', name: 'India', short: 'IN', flag: '🇮🇳', exchanges: ['NSE', 'BSE'], tz: 'Asia/Kolkata',
    currency: 'INR', open: '09:15', close: '15:30', preOpen: '09:00', earlyClose: null, tick: 0.05, lotSize: 1,
    holidays: {}, earlyCloses: {}, calendarYears: [],
    fixedHolidays: { '01-26': 'Republic Day', '04-14': 'Dr. Ambedkar Jayanti', '05-01': 'Maharashtra Day', '08-15': 'Independence Day', '10-02': 'Mahatma Gandhi Jayanti', '12-25': 'Christmas' },
    calendarNote: 'PARTIAL calendar: weekends and fixed-date holidays only. Holi, Diwali Muhurat, Eid and other floating holidays are NOT included - check the NSE/BSE holiday circular. Add dates in Settings.',
  },
};

const fmtCache = new Map();
function fmt(tz) {
  if (!fmtCache.has(tz)) {
    fmtCache.set(tz, new Intl.DateTimeFormat('en-GB', { timeZone: tz, hourCycle: 'h23', year: 'numeric', month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit', second: '2-digit', weekday: 'short' }));
  }
  return fmtCache.get(tz);
}
const DOW = { Mon: 1, Tue: 2, Wed: 3, Thu: 4, Fri: 5, Sat: 6, Sun: 0 };

/** Wall-clock parts of an instant in a time zone. ms = epoch milliseconds. */
export function zonedParts(ms, tz) {
  const o = {};
  for (const p of fmt(tz).formatToParts(new Date(ms))) if (p.type !== 'literal') o[p.type] = p.value;
  return { year: +o.year, month: +o.month, day: +o.day, hour: +o.hour, minute: +o.minute, second: +o.second, dow: DOW[o.weekday],
    date: `${o.year}-${o.month}-${o.day}`, minutes: +o.hour * 60 + +o.minute };
}
export const hhmmToMin = (s) => { const [h, m] = String(s).split(':').map(Number); return h * 60 + m; };
export const minToHhmm = (m) => `${String(Math.floor(m / 60)).padStart(2, '0')}:${String(m % 60).padStart(2, '0')}`;

/** Epoch ms of a wall-clock time ("YYYY-MM-DD", minutes since midnight) in a zone. */
export function zonedToMs(date, minutes, tz) {
  const [y, mo, d] = date.split('-').map(Number);
  const guess = Date.UTC(y, mo - 1, d, 0, 0, 0) + minutes * 60000;
  const first = guess - offsetMs(guess, tz);
  return guess - offsetMs(first, tz); // second pass handles DST edges
}
export function offsetMs(ms, tz) {
  const p = zonedParts(ms, tz);
  return Date.UTC(p.year, p.month - 1, p.day, p.hour, p.minute, p.second) - Math.floor(ms / 1000) * 1000;
}
export function addDays(date, n) {
  const [y, m, d] = date.split('-').map(Number);
  const t = new Date(Date.UTC(y, m - 1, d + n));
  return t.toISOString().slice(0, 10);
}

export function holidayName(market, date) {
  const m = typeof market === 'string' ? MARKETS[market] : market;
  if (m.holidays[date]) return m.holidays[date];
  if (m.fixedHolidays && m.fixedHolidays[date.slice(5)]) return m.fixedHolidays[date.slice(5)];
  return null;
}
export function isTradingDay(market, date, extraHolidays = {}) {
  const m = typeof market === 'string' ? MARKETS[market] : market;
  const [y, mo, d] = date.split('-').map(Number);
  const dow = new Date(Date.UTC(y, mo - 1, d)).getUTCDay();
  if (dow === 0 || dow === 6) return { ok: false, reason: 'weekend' };
  const h = extraHolidays[date] || holidayName(m, date);
  if (h) return { ok: false, reason: `${m.exchanges[0]} holiday: ${h}` };
  return { ok: true, reason: '' };
}
/** {open, close} minutes since midnight local, or null on a closed day. */
export function sessionFor(market, date, extraHolidays = {}) {
  const m = typeof market === 'string' ? MARKETS[market] : market;
  if (!isTradingDay(m, date, extraHolidays).ok) return null;
  const early = m.earlyCloses[date];
  return { open: hhmmToMin(m.open), close: hhmmToMin(early ? m.earlyClose : m.close), early: early || null };
}
export function nextOpen(market, date, extraHolidays = {}) {
  let d = addDays(date, 1);
  for (let i = 0; i < 15; i++, d = addDays(d, 1)) if (sessionFor(market, d, extraHolidays)) return d;
  return null;
}
/** Market status at an instant. state: open | pre-open | closed. */
export function marketStatus(marketId, nowMs = Date.now(), extraHolidays = {}) {
  const m = MARKETS[marketId];
  const p = zonedParts(nowMs, m.tz);
  const calKnown = marketId === 'US' ? m.calendarYears.includes(p.year) : false;
  const s = sessionFor(m, p.date, extraHolidays);
  const base = { market: marketId, tz: m.tz, localDate: p.date, localTime: minToHhmm(p.minutes), calendarKnown: calKnown, calendarNote: m.calendarNote };
  if (!s) {
    const why = isTradingDay(m, p.date, extraHolidays).reason;
    return { ...base, state: 'closed', reason: why, nextOpenDate: nextOpen(m, p.date, extraHolidays) };
  }
  if (m.preOpen && p.minutes >= hhmmToMin(m.preOpen) && p.minutes < s.open) return { ...base, state: 'pre-open', reason: 'Pre-open call session', session: s };
  if (p.minutes < s.open) return { ...base, state: 'closed', reason: `Opens at ${minToHhmm(s.open)}`, session: s, nextOpenDate: p.date };
  if (p.minutes >= s.close) return { ...base, state: 'closed', reason: 'Session ended', session: s, nextOpenDate: nextOpen(m, p.date, extraHolidays) };
  return { ...base, state: 'open', reason: s.early ? `Early close (${s.early})` : 'Regular session', session: s };
}
export function formatInZone(ms, tz, opts = {}) {
  return new Intl.DateTimeFormat('en-GB', { timeZone: tz, dateStyle: 'medium', timeStyle: 'short', ...opts }).format(new Date(ms));
}
