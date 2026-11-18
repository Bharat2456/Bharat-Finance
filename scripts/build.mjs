// Zero-dependency production build: validates the static app and copies web/ -> dist/.
import { cpSync, rmSync, mkdirSync, existsSync, readFileSync, readdirSync, statSync, writeFileSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
const root = join(dirname(fileURLToPath(import.meta.url)), '..'), src = join(root, 'web'), out = join(root, 'dist');
const must = ['index.html', 'css/styles.css', 'js/main.js', 'js/theme-init.js', 'assets/logo-192.png', 'assets/builder.jpg', 'js/pages/local.js', 'js/pages/app/live.js', 'downloads/bharat-finance-local.zip', 'downloads/local.json'];
for (const f of ['_yahoo.js', '_http.js', 'market.js', 'batch.js', 'search.js', 'news.js', 'sec.js', 'health.js', 'diag.js', '_vendors.js']) if (!existsSync(join(root, 'api', f))) { console.error(`build: missing api/${f}`); process.exit(1); }
for (const f of must) if (!existsSync(join(src, f))) { console.error(`build: missing ${f}`); process.exit(1); }
// every relative ES-module import must resolve
const bad = []; (function walk(d) { for (const n of readdirSync(d)) { const p = join(d, n); if (statSync(p).isDirectory()) walk(p); else if (p.endsWith('.js')) for (const m of readFileSync(p, 'utf8').matchAll(/(?:from\s+|import\()\s*['"](\.{1,2}\/[^'"]+)['"]/g)) { const t = join(dirname(p), m[1]); if (!existsSync(t)) bad.push(`${p.replace(src, 'web')} -> ${m[1]}`); } } })(join(src, 'js'));
if (bad.length) { console.error('build: unresolved imports:\n' + bad.join('\n')); process.exit(1); }
// no secrets
const html = readFileSync(join(src, 'index.html'), 'utf8'); if (/sk-[A-Za-z0-9]{20,}|AIza[0-9A-Za-z_-]{30,}/.test(readFileSync(join(src, 'js/content/builder.js'), 'utf8'))) { console.error('build: key-like string found'); process.exit(1); }
rmSync(out, { recursive: true, force: true }); mkdirSync(out, { recursive: true }); cpSync(src, out, { recursive: true });
writeFileSync(join(out, 'build-info.json'), JSON.stringify({ app: 'bharat-finance', builtAt: new Date().toISOString(), note: 'static site + api/ serverless relay (see DEPLOYMENT.md)' }));
console.log(`build: ok -> dist/ (${readdirSync(out).length} top-level entries)`);
