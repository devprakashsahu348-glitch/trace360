// Local development: serves /frontend and routes /api/* to the same function code Netlify runs.
// Uses an embedded Postgres (PGlite) stored in ./.devdb — no Neon account needed for local testing.
import http from 'node:http';
import { readFile } from 'node:fs/promises';
import { extname, join, normalize } from 'node:path';
import { fileURLToPath } from 'node:url';
import { PGlite } from '@electric-sql/pglite';
import { setQuery } from '../netlify/lib/db.mjs';

process.env.TRACE360_DEV = 'true';
process.env.DEMO_LOGIN ??= 'true';
const root = join(fileURLToPath(new URL('.', import.meta.url)), '..'), webRoot = join(root, 'frontend');
if (!process.env.DATABASE_URL) {
  const pg = new PGlite(process.env.PGLITE_DIR || join(root, '.devdb'));
  await pg.waitReady;
  setQuery(async (text, params = []) => (await pg.query(text, params)).rows);
  console.log('Using local embedded database (.devdb). Set DATABASE_URL to use Neon instead.');
}
const { default: api } = await import('../netlify/functions/api.mjs');
const TYPES = { '.html': 'text/html; charset=utf-8', '.css': 'text/css', '.js': 'text/javascript', '.svg': 'image/svg+xml', '.png': 'image/png' };

http.createServer(async (rq, rs) => {
  try {
    const url = new URL(rq.url, `http://${rq.headers.host}`);
    if (url.pathname.startsWith('/api/')) {
      const chunks = []; for await (const c of rq) chunks.push(c);
      const body = ['GET', 'HEAD'].includes(rq.method) ? undefined : Buffer.concat(chunks);
      const res = await api(new Request(url, { method: rq.method, headers: rq.headers, body }));
      rs.writeHead(res.status, Object.fromEntries(res.headers)); return rs.end(Buffer.from(await res.arrayBuffer()));
    }
    let p = url.pathname === '/favicon.svg' ? '/img/favicon.svg' : url.pathname;
    if (p === '/' || p.startsWith('/t/')) p = '/index.html';
    const file = normalize(join(webRoot, p));
    if (!file.startsWith(webRoot)) { rs.writeHead(403); return rs.end(); }
    const data = await readFile(file).catch(() => null);
    if (!data) { rs.writeHead(404); return rs.end('Not found'); }
    rs.writeHead(200, { 'content-type': TYPES[extname(file)] || 'application/octet-stream' }); rs.end(data);
  } catch (e) { console.error(e); rs.writeHead(500); rs.end('Server error'); }
}).listen(process.env.PORT || 8888, () => console.log(`TRACE360 running at http://localhost:${process.env.PORT || 8888}`));
