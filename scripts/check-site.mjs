// Checks the built site: unique titles, descriptions, one H1, canonical, alt text, valid JSON-LD, every internal link resolves, no placeholder text.
import { readdirSync, readFileSync, existsSync, statSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
const root = join(dirname(fileURLToPath(import.meta.url)), '..', 'public');
const walk = d => readdirSync(d).flatMap(f => { const p = join(d, f); return statSync(p).isDirectory() ? walk(p) : [p]; });
const DYNAMIC = [/^\/api\//, /^\/t\//];
const SHELLS = ['app/index.html', 'trace.html']; // headings are rendered by the app itself

function resolves(href) {
  let p = href.split('#')[0].split('?')[0]; if (DYNAMIC.some(r => r.test(p))) return true;
  p = decodeURIComponent(p); if (p === '/' || p === '') return existsSync(join(root, 'index.html'));
  return [p, p + '.html', join(p, 'index.html')].some(c => existsSync(join(root, c)) && statSync(join(root, c)).isFile());
}
export function check() {
  const problems = [], titles = new Map(), pages = walk(root).filter(f => f.endsWith('.html'));
  for (const f of pages) {
    const rel = f.slice(root.length + 1), html = readFileSync(f, 'utf8'), bad = m => problems.push(`${rel}: ${m}`);
    const title = (/<title>([^<]*)<\/title>/.exec(html) || [])[1];
    if (!title) bad('missing <title>'); else { if (title.length > 70) bad(`title too long (${title.length})`); if (titles.has(title)) bad(`duplicate title also on ${titles.get(title)}`); titles.set(title, rel); }
    const desc = (/<meta name="description" content="([^"]*)"/.exec(html) || [])[1];
    if (!desc) bad('missing meta description'); else if (desc.length < 40 || desc.length > 180) bad(`description length ${desc.length}`);
    if (!/<link rel="canonical" href="https?:\/\/[^"]+"/.test(html)) bad('missing canonical');
    if (!/<meta property="og:image" content="https?:\/\//.test(html)) bad('missing og:image');
    const h1 = (html.match(/<h1[\s>]/g) || []).length; if (!SHELLS.includes(rel) && h1 !== 1) bad(`expected one <h1>, found ${h1}`);
    for (const m of html.matchAll(/<img\b[^>]*>/g)) if (!/\balt="[^"]+"/.test(m[0])) bad(`image without alt: ${m[0].slice(0, 70)}`);
    for (const m of html.matchAll(/<script type="application\/ld\+json">([\s\S]*?)<\/script>/g)) { try { JSON.parse(m[1]); } catch { bad('invalid JSON-LD'); } }
    for (const m of html.matchAll(/(?:href|src)="([^"]+)"/g)) { const u = m[1];
      if (/^(https?:|mailto:|tel:|data:|#|javascript:)/.test(u)) continue; if (!u.startsWith('/')) { bad(`relative URL ${u}`); continue; }
      if (!resolves(u)) bad(`broken internal link ${u}`); }
    if (/lorem ipsum|todo|fixme|placeholder text|example\.com|your-domain|\bundefined\b|\[object/i.test(html.replace(/placeholder="[^"]*"/g, ''))) bad('placeholder or debug text found');
    if (/\bVite\b|React App/.test(html)) bad('framework name in page');
  }
  for (const need of ['sitemap.xml', 'robots.txt', 'llms.txt', 'favicon.svg', 'og-image.png', '404.html', 'manifest.webmanifest']) if (!existsSync(join(root, need))) problems.push(`missing ${need}`);
  return { problems, count: pages.length };
}
if (process.argv[1] === fileURLToPath(import.meta.url)) { const { problems, count } = check(); console.log(problems.length ? problems.join('\n') : `OK: ${count} pages passed`); process.exit(problems.length ? 1 : 0); }
