// Quarterly figures from SEC XBRL "company facts" JSON.
export const CONCEPTS = {
  revenue: ['RevenueFromContractWithCustomerExcludingAssessedTax', 'Revenues', 'RevenuesNetOfInterestExpense', 'RevenueFromContractWithCustomerIncludingAssessedTax', 'SalesRevenueNet', 'SalesRevenueGoodsNet', 'SalesRevenueServicesNet'],
  cost_of_revenue: ['CostOfGoodsAndServicesSold', 'CostOfRevenue', 'CostOfGoodsSold'], gross_profit: ['GrossProfit'], operating_income: ['OperatingIncomeLoss'],
  net_income: ['NetIncomeLoss', 'ProfitLoss', 'NetIncomeLossAvailableToCommonStockholdersBasic'], eps_diluted: ['EarningsPerShareDiluted', 'EarningsPerShareBasicAndDiluted'],
};
const day = (s) => Date.UTC(+s.slice(0, 4), +s.slice(5, 7) - 1, +s.slice(8, 10)) / 86400000;
const iso = (d) => new Date(d * 86400000).toISOString().slice(0, 10);
const cmp = (a, b) => (a < b ? -1 : a > b ? 1 : 0);
function factsFor(cf, concept, unitHint) { const n = cf.facts?.['us-gaap']?.[concept]; if (!n) return []; const u = n.units || {}; const unit = unitHint in u ? unitHint : Object.keys(u)[0]; return unit ? u[unit] : []; }
function periods(facts) {
  const latest = new Map(), first = new Map();
  for (const f of facts) { if (!('start' in f) || !['10-Q', '10-K', '20-F', '40-F'].includes((f.form || '').split('/')[0])) continue; const key = f.start + '|' + f.end, stamp = (f.filed || '') + '\u0000' + (f.accn || '');
    const st = (x) => (x.filed || '') + '\u0000' + (x.accn || ''); if (!latest.has(key) || cmp(stamp, st(latest.get(key))) > 0) latest.set(key, f); if (!first.has(key) || cmp(stamp, st(first.get(key))) < 0) first.set(key, f); }
  const out = new Map(); for (const [k, f] of latest) out.set(k, { ...f, fy: first.get(k).fy, fp: first.get(k).fp }); return out;
}
function quarterly(facts, deriveQ4 = true) {
  const per = periods(facts), q = {}, years = [];
  for (const [k, f] of per) { const [start, end] = k.split('|'); const d = day(end) - day(start);
    if (d >= 80 && d <= 100) q[end] = { value: f.val, start, end, derived: false, fy: f.fy, fp: f.fp, form: f.form, filed: f.filed }; else if (d >= 350 && d <= 380) years.push([start, end, f]); }
  if (deriveQ4) for (const [start, end, f] of years) { if (q[end]) continue; const inside = Object.values(q).filter((v) => v.start >= start && v.end < end).sort((a, b) => cmp(a.end, b.end)); if (inside.length !== 3) continue;
    q[end] = { value: f.val - inside.reduce((s, v) => s + v.value, 0), start: iso(day(inside[2].end) + 1), end, derived: true, fy: f.fy, fp: 'Q4', form: f.form, filed: f.filed }; }
  return q;
}
function series(cf, key) { const unit = key === 'eps_diluted' ? 'USD/shares' : 'USD', merged = {}; for (const c of CONCEPTS[key]) { const q = quarterly(factsFor(cf, c, unit)); for (const [e, v] of Object.entries(q)) if (!(e in merged)) merged[e] = { ...v, concept: c }; } return merged; }
const yoy = (s, end) => { const t = day(end) - 365; let best = null; for (const e of Object.keys(s)) { const g = Math.abs(day(e) - t); if (g <= 10 && (best === null || g < best[0])) best = [g, e]; } return best ? s[best[1]] : null; };
const r1 = (x) => Math.round(x * 10) / 10;
const pct = (a, b) => (a == null || b == null || b === 0 ? null : r1((100 * (a - b)) / Math.abs(b)));
const margin = (p, w) => (p == null || !w ? null : r1((100 * p) / w));
export function analyseFacts(cf, quarters = 6) {
  const s = {}; for (const k of Object.keys(CONCEPTS)) s[k] = series(cf, k);
  if (!Object.keys(s.revenue).length && !Object.keys(s.net_income).length) throw new Error('no quarterly revenue or net income in the XBRL facts');
  const ends = [...new Set([...Object.keys(s.revenue), ...Object.keys(s.net_income)])].sort().reverse().slice(0, quarters);
  const rows = ends.map((end) => { const r = s.revenue[end]?.value; let gp = s.gross_profit[end]?.value; if (gp == null && r != null && s.cost_of_revenue[end]) gp = r - s.cost_of_revenue[end].value;
    const oi = s.operating_income[end]?.value, ni = s.net_income[end]?.value, eps = s.eps_diluted[end]?.value, pr = { revenue: yoy(s.revenue, end), net_income: yoy(s.net_income, end), eps_diluted: yoy(s.eps_diluted, end) };
    return { end, revenue: r ?? null, gross_profit: gp ?? null, operating_income: oi ?? null, net_income: ni ?? null, eps_diluted: eps != null ? Math.round(eps * 100) / 100 : null, gross_margin: margin(gp, r), operating_margin: margin(oi, r), net_margin: margin(ni, r),
      revenue_yoy: pct(r, pr.revenue?.value), net_income_yoy: pct(ni, pr.net_income?.value), eps_yoy: pct(eps, pr.eps_diluted?.value), derived: !!(s.revenue[end]?.derived || s.net_income[end]?.derived) }; });
  const ttm = {}; for (const k of ['revenue', 'net_income', 'eps_diluted']) { const l4 = Object.keys(s[k]).sort().slice(-4); if (l4.length === 4 && day(l4[3]) - day(l4[0]) < 300) ttm[k] = l4.reduce((a, e) => a + s[k][e].value, 0); }
  if ('eps_diluted' in ttm) ttm.eps_diluted = Math.round(ttm.eps_diluted * 100) / 100;
  return { entity: cf.entityName, rows, ttm };
}
