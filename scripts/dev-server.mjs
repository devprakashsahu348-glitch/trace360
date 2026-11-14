// Local development: serves /public like Vercel (clean URLs, /t/* rewrite) and runs the API in-process on an embedded Postgres (PGlite).
import http from 'node:http';
import { readFile } from 'node:fs/promises';
import { extname, join, normalize } from 'node:path';
import { fileURLToPath } from 'node:url';
import { PGlite } from '@electric-sql/pglite';
import { setQuery } from '../server/lib/db.mjs';

process.env.TRACE360_DEV = 'true';
process.env.DEMO_LOGIN ??= 'true';
process.env.BCRYPT_ROUNDS ??= '10';
globalThis.__t360Mailer ??= async m => { console.log(`\n--- EMAIL to ${m.to}: ${m.subject}\n${m.text}\n---\n`); return true; }; // shows reset links in this terminal
const root = join(fileURLToPath(new URL('.', import.meta.url)), '..'), web = join(root, 'public');
if (!process.env.DATABASE_URL) {
  const pg = new PGlite(process.env.PGLITE_DIR || join(root, '.devdb')); await pg.waitReady;
  setQuery(async (text, params = []) => (await pg.query(text, params)).rows);
  console.log('Using the local embedded database (.devdb). Set DATABASE_URL to use Neon instead.');
}
const { default: api } = await import('../server/api.mjs');
const TYPES = { '.html': 'text/html; charset=utf-8', '.css': 'text/css', '.js': 'text/javascript', '.svg': 'image/svg+xml', '.png': 'image/png', '.webp': 'image/webp', '.json': 'application/json', '.xml': 'application/xml', '.txt': 'text/plain; charset=utf-8', '.webmanifest': 'application/manifest+json' };
const read = async p => { const f = normalize(join(web, p)); return f.startsWith(web) ? readFile(f).then(d => ({ d, f })).catch(() => null) : null; };

http.createServer(async (rq, rs) => {
  try {
    const url = new URL(rq.url, `http://${rq.headers.host}`);
    if (url.pathname.startsWith('/api/')) {
      const chunks = []; for await (const c of rq) chunks.push(c);
      const res = await api(new Request(url, { method: rq.method, headers: rq.headers, body: ['GET', 'HEAD'].includes(rq.method) ? undefined : Buffer.concat(chunks) }));
      const h = Object.fromEntries(res.headers); const sc = res.headers.getSetCookie?.(); if (sc?.length) h['set-cookie'] = sc;
      rs.writeHead(res.status, h); return rs.end(Buffer.from(await res.arrayBuffer()));
    }
    let p = decodeURIComponent(url.pathname); if (p.startsWith('/t/')) p = '/trace.html';
    const hit = (await read(p)) || (await read(p + '.html')) || (await read(join(p, 'index.html')));
    const found = hit && !p.endsWith('/') ? hit : (p === '/' ? await read('/index.html') : null);
    if (!found) { const nf = await read('/404.html'); rs.writeHead(404, { 'content-type': TYPES['.html'] }); return rs.end(nf ? nf.d : 'Not found'); }
    rs.writeHead(200, { 'content-type': TYPES[extname(found.f)] || 'application/octet-stream' }); rs.end(found.d);
  } catch (e) { console.error(e); rs.writeHead(500); rs.end('Server error'); }
}).listen(process.env.PORT || 3000, () => console.log(`TRACE360 running at http://localhost:${process.env.PORT || 3000}`));
