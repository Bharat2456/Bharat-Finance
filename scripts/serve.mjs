// Tiny static server with SPA fallback, for local development / preview. Usage: node scripts/serve.mjs [dir] [port]
import { createServer } from 'node:http'; import { readFile, stat } from 'node:fs/promises'; import { join, extname, normalize, dirname } from 'node:path'; import { fileURLToPath } from 'node:url';
const root = join(dirname(fileURLToPath(import.meta.url)), '..'); const dir = join(root, process.argv[2] || 'web'); const port = +(process.argv[3] || process.env.PORT || 5173);
const T = { '.html': 'text/html; charset=utf-8', '.js': 'text/javascript; charset=utf-8', '.mjs': 'text/javascript', '.css': 'text/css', '.json': 'application/json', '.png': 'image/png', '.jpg': 'image/jpeg', '.svg': 'image/svg+xml', '.xml': 'application/xml', '.ico': 'image/x-icon' };
const API = join(root, 'api');
createServer(async (req, res) => { try { let p = decodeURIComponent(new URL(req.url, 'http://x').pathname); let f = normalize(join(dir, p)); if (!f.startsWith(dir)) { res.writeHead(403).end(); return; }
  const m = p.match(/^\/api\/([a-z]+)$/); if (m) { try { const h = (await import(`file://${join(API, m[1])}.js`)).default; await h(req, res); } catch (e) { res.writeHead(404, { 'Content-Type': 'application/json' }).end(JSON.stringify({ error: 'No such API' })); } return; }
  let ok = false; try { ok = (await stat(f)).isFile(); } catch {} if (!ok) { if (extname(p)) { res.writeHead(404).end('Not found'); return; } f = join(dir, 'index.html'); }
  res.writeHead(200, { 'Content-Type': T[extname(f)] || 'application/octet-stream', 'Cache-Control': 'no-store' }).end(await readFile(f)); } catch (e) { res.writeHead(500).end(String(e)); } }).listen(port, () => console.log(`Bharat Finance: http://localhost:${port}  (serving ${dir})`));
