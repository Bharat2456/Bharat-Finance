import { simulate, buildPool } from '../core/montecarlo.js';
self.onmessage = (e) => { const { sessions, params, nBars } = e.data; try { self.postMessage({ ok: true, result: simulate(buildPool(sessions, nBars), params) }); } catch (err) { self.postMessage({ ok: false, error: err.message }); } };
