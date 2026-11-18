import { send } from './_http.js';
import { vendorsConfigured } from './_vendors.js';
export default (req, res) => send(res, 200, { ok: true, edition: 'hosted', data: 'yahoo-via-this-site', backups: vendorsConfigured(), time: Date.now() });
