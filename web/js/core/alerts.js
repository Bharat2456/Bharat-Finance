// Price alerts evaluated locally in the browser while the app is open. Rule types: price above/below and percent move.
// (above/target, below/stop, pct_move). Browser alerts cannot run when the tab is closed - documented limitation.
export function evaluateAlerts(alerts, prices, prevCloses = {}) {
  const rung = [];
  const next = alerts.map((a) => {
    if (a.status === 'rung' && !a.rearm) return a;
    const p = prices[a.symbol]; if (p == null) return a;
    let hit = false;
    if (a.type === 'above' || a.type === 'target') hit = p >= a.price;
    else if (a.type === 'below' || a.type === 'stop') hit = p <= a.price;
    else if (a.type === 'pct_move') { const ref = a.ref ?? prevCloses[a.symbol]; if (ref) { const mv = (p / ref - 1) * 100; hit = a.direction === 'down' ? mv <= -a.pct : a.direction === 'up' ? mv >= a.pct : Math.abs(mv) >= a.pct; } }
    if (hit && a.status !== 'rung') { rung.push({ ...a, rungAt: Date.now(), rungPrice: p }); return { ...a, status: 'rung', rungPrice: p, rungAt: Date.now() }; }
    if (!hit && a.rearm && a.status === 'rung') return { ...a, status: 'armed' };
    return a;
  });
  return { alerts: next, rung };
}
