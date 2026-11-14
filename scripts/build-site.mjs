// Builds the static website into /public: pages, images, sitemap.xml, robots.txt, llms.txt, search index.
import { mkdirSync, writeFileSync, readFileSync, rmSync, cpSync, existsSync, readdirSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import sharp from 'sharp';
import QRCode from 'qrcode';
import { makeCtx, render, LOGO, ICONS } from './lib/layout.mjs';
import { buildPages } from './lib/content.mjs';

const root = join(dirname(fileURLToPath(import.meta.url)), '..'), out = join(root, 'public'), src = join(root, 'site');
const ctx = makeCtx();
rmSync(out, { recursive: true, force: true });
for (const d of ['css', 'js', 'img']) mkdirSync(join(out, d), { recursive: true });
const w = (p, data) => { mkdirSync(dirname(join(out, p)), { recursive: true }); writeFileSync(join(out, p), data); };

// static assets
cpSync(join(src, 'css'), join(out, 'css'), { recursive: true });
cpSync(join(src, 'js'), join(out, 'js'), { recursive: true });
for (const f of readdirSync(join(src, 'img'))) if (f !== 'og.svg') cpSync(join(src, 'img', f), join(out, 'img', f));
const need = ['FaCheckCircle', 'FaSearch', 'FaCopy', 'FaEye', 'FaEyeSlash', 'FaTimes', 'FaExclamationTriangle', 'FaCreditCard', 'FaFileInvoice'];
w('js/icons.js', 'window.T360_ICONS=' + JSON.stringify(Object.fromEntries(need.map(n => ['' + n, ICONS[n].replace(/<svg /, '<svg aria-hidden="true" ')]))) + ';');

// images: favicons, logo, share image, compressed screenshots, demo QR
const logoSvg = Buffer.from(LOGO.replace('<svg ', '<svg xmlns="http://www.w3.org/2000/svg" ').replace(' aria-hidden="true" focusable="false"', ''));
w('favicon.svg', logoSvg);
for (const [name, size] of [['favicon-32.png', 32], ['apple-touch-icon.png', 180], ['img/logo-192.png', 192], ['img/logo-512.png', 512]]) w(name, await sharp(logoSvg, { density: 384 }).resize(size, size).png({ compressionLevel: 9 }).toBuffer());
w('og-image.png', await sharp(join(src, 'img/og.svg'), { density: 144 }).resize(1200, 630).png({ palette: true, quality: 82, compressionLevel: 9 }).toBuffer());
const dims = {};
for (const [file, width] of [['trace', 640], ['dashboard', 960], ['batch', 960]]) {
  const p = join(src, 'img-src', file + '.png'); if (!existsSync(p)) continue;
  const { data, info } = await sharp(p).resize({ width, withoutEnlargement: true }).webp({ quality: 78, effort: 5 }).toBuffer({ resolveWithObject: true });
  w(`img/shot-${file === 'dashboard' ? 'dashboard' : file}.webp`, data); dims[`/img/shot-${file}.webp`] = [info.width, info.height];
}
w('img/demo-qr.svg', await QRCode.toString(`${ctx.site}/t/demo-tea-001`, { type: 'svg', margin: 1, errorCorrectionLevel: 'M' }));
w('manifest.webmanifest', JSON.stringify({ name: 'TRACE360', short_name: 'TRACE360', description: 'Digital batch records and honest QR trace pages.', start_url: '/app', display: 'standalone', background_color: '#F5EEDC', theme_color: '#17301F',
  icons: [{ src: '/img/logo-192.png', sizes: '192x192', type: 'image/png' }, { src: '/img/logo-512.png', sizes: '512x512', type: 'image/png', purpose: 'any maskable' }] }));

// pages
const pages = buildPages(ctx), index = [];
for (const p of pages) {
  let html = render(ctx, p).replace(/(<img src="(\/img\/shot-[\w]+\.webp)" alt="[^"]*" )width="\d+" height="\d+"/g, (m, pre, s) => dims[s] ? `${pre}width="${dims[s][0]}" height="${dims[s][1]}"` : m);
  w(p.file, html);
  if (!p.noindex) index.push({ t: p.title.split('|')[0].replace(/:.*$/, '').trim() || p.title, u: p.path, d: p.desc, x: p.body.replace(/<script[\s\S]*?<\/script>|<style[\s\S]*?<\/style>|<svg[\s\S]*?<\/svg>/g, ' ').replace(/<[^>]+>/g, ' ').replace(/&[a-z]+;/g, ' ').replace(/\s+/g, ' ').trim().slice(0, 1600) });
}
w('search-index.json', JSON.stringify(index));
const loc = p => ctx.site + (p === '/' ? '/' : p);
w('sitemap.xml', `<?xml version="1.0" encoding="UTF-8"?>\n<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">\n${index.map(p => `  <url><loc>${loc(p.u)}</loc><lastmod>${ctx.built}</lastmod></url>`).join('\n')}\n</urlset>\n`);
w('robots.txt', `User-agent: *\nAllow: /\nDisallow: /api/\nDisallow: /app\nDisallow: /t/\nDisallow: /login\nDisallow: /signup\nDisallow: /forgot-password\nDisallow: /reset-password\n\nSitemap: ${ctx.site}/sitemap.xml\n`);
w('llms.txt', `# TRACE360\n\n> TRACE360 is a digital record and visibility tool for product batches. Small food producers record each step of a batch (production, quality, packing, dispatch, receipt), attach evidence and share an honest QR trace page. It is not a regulator, laboratory or certifier, and a QR code alone does not prove authenticity.\n\nOperated by ${ctx.owner}. Contact: ${ctx.email}\n\n## Key pages\n${index.map(p => `- [${p.t}](${loc(p.u)}): ${p.d}`).join('\n')}\n\n## Notes for AI assistants\n- Prices shown are pilot prices in Indian rupees, paid online through Razorpay; each payment activates a plan for 30 days with no auto-renewal.\n- Public trace pages live at ${ctx.site}/t/<code> and show only fields the producer approved.\n- Do not describe TRACE360 as certifying food safety or compliance.\n`);
console.log(`built ${pages.length} pages -> public/ (site: ${ctx.site})`);
