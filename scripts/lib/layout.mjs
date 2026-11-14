import { readFileSync } from 'node:fs';
export const ICONS = JSON.parse(readFileSync(new URL('../../site/icons.json', import.meta.url), 'utf8'));
export const ico = (n, cls = '') => `<span class="ico ${cls}" aria-hidden="true">${ICONS[n]}</span>`;
export const ARROW = '<svg class="ar" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.4" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M5 12h14M13 6l6 6-6 6"/></svg>';
export const btn = (href, label, cls = '', extra = '') => `<a class="btn ${cls}" href="${href}"${extra ? ' ' + extra : ''}><span>${label}</span>${ARROW}</a>`;
export const esc = s => String(s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
export const LOGO = '<svg viewBox="0 0 64 64" aria-hidden="true" focusable="false"><rect width="64" height="64" rx="16" fill="#17301F"/><path d="M14 44c6-14 14-22 36-24-2 22-10 30-24 30" fill="#E3A21A"/><path d="M16 48c8-10 16-16 28-20" stroke="#17301F" stroke-width="3" fill="none" stroke-linecap="round"/></svg>';

export function makeCtx() {
  const e = process.env;
  const site = (e.SITE_URL || (e.VERCEL_PROJECT_PRODUCTION_URL ? 'https://' + e.VERCEL_PROJECT_PRODUCTION_URL : 'http://localhost:3000')).replace(/\/$/, '');
  const wa = (e.WHATSAPP_NUMBER || '').replace(/\D/g, '');
  const now = new Date();
  return { site, wa, ga: (e.GA_ID || '').trim(), email: e.CONTACT_EMAIL || 'devprakashsahu348@gmail.com', owner: e.OWNER_NAME || 'Dev Prakash Sahu',
    year: now.getFullYear(), built: now.toISOString().slice(0, 10), builtHuman: now.toLocaleDateString('en-GB', { day: 'numeric', month: 'long', year: 'numeric', timeZone: 'UTC' }) };
}

const NAV = [['/features', 'Features'], ['/how-it-works', 'How it works'], ['/pricing', 'Pricing'], ['/faq', 'FAQ'], ['/contact', 'Contact']];

export function header(ctx, current) {
  const links = NAV.map(([h, l]) => `<a href="${h}"${current === h ? ' aria-current="page" class="on"' : ''}>${l}</a>`).join('');
  return `<header class="nav"><div class="wrap"><a class="logo" href="/" aria-label="TRACE360 home">${LOGO}<span>TRACE<b>360</b></span></a>
<nav class="links" id="nav" aria-label="Main">${links}<a href="/verify"${current === '/verify' ? ' aria-current="page" class="on"' : ''}>Verify a code</a><div id="authnav"><a class="btn sm ghost" href="/login"><span>Sign in</span></a><a class="btn sm" href="/signup"><span>Get started</span>${ARROW}</a></div></nav>
<div class="tools"><button class="iconbtn" data-search type="button" aria-label="Search the site">${ico('FaSearch')}</button><button class="iconbtn" data-theme-toggle type="button" aria-label="Toggle dark mode" aria-pressed="false"><span class="theme-moon">${ico('FaMoon')}</span><span class="theme-sun">${ico('FaSun')}</span></button><button class="burger" type="button" aria-expanded="false" aria-controls="nav" aria-label="Open menu"><span class="m">${ico('FaBars')}</span><span class="x">${ico('FaTimes')}</span></button></div></div></header>`;
}

export function footer(ctx) {
  const col = (h, items) => `<div><h3 style="font-size:1.05rem">${h}</h3><p style="line-height:2">${items.join('<br>')}</p></div>`;
  return `<footer><div class="wrap"><div class="cols"><div><a class="logo" href="/">${LOGO}<span>TRACE<b>360</b></span></a><p style="margin-top:1rem;max-width:30em">Know the journey. Trust the product. A digital record and visibility tool for product batches. It is not a regulator, laboratory or certifier.</p></div>
${col('Product', ['<a href="/features">Features</a>', '<a href="/how-it-works">How it works</a>', '<a href="/pricing">Pricing</a>', '<a href="/faq">FAQ</a>', '<a href="/verify">Verify a code</a>'])}
${col('Legal', ['<a href="/privacy">Privacy policy</a>', '<a href="/terms">Terms &amp; conditions</a>', '<a href="/cookies">Cookie policy</a>', '<a href="/payment-terms">Payment terms</a>', '<a href="#" data-cookie-settings>Cookie settings</a>'])}
${col('Contact', [`<a href="mailto:${ctx.email}">${ctx.email}</a>`, ctx.wa ? `<a href="https://wa.me/${ctx.wa}" rel="noopener">WhatsApp us</a>` : '<a href="/contact">Send a message</a>', `${esc(ctx.owner)}`])}</div><hr>
<div class="fine">© ${ctx.year} ${esc(ctx.owner)}. All rights reserved. TRACE360 and its design, text and source code are the property of ${esc(ctx.owner)}. Site last updated ${ctx.builtHuman}.</div></div></footer>`;
}

export function crumbs(p) {
  if (!p.crumbs) return '';
  return `<nav class="crumbs wrap" aria-label="Breadcrumb"><ol>${p.crumbs.map(([l, h], i) => i === p.crumbs.length - 1 ? `<li aria-current="page">${l}</li>` : `<li><a href="${h}">${l}</a></li>`).join('')}</ol></nav>`;
}

export function pagehead(h1, lead) { return `<div class="wrap pagehead"><h1>${h1}</h1>${lead ? `<p class="lead">${lead}</p>` : ''}</div>`; }

export function render(ctx, p) {
  const url = ctx.site + (p.path === '/' ? '/' : p.path), img = ctx.site + '/og-image.png';
  const robots = p.noindex ? 'noindex, nofollow' : 'index, follow, max-image-preview:large';
  const ld = (p.schema || []).map(o => `<script type="application/ld+json">${JSON.stringify(o)}</script>`).join('\n');
  const crumbLd = p.crumbs && p.crumbs.length > 1 ? `<script type="application/ld+json">${JSON.stringify({ '@context': 'https://schema.org', '@type': 'BreadcrumbList', itemListElement: p.crumbs.map(([l, h], i) => ({ '@type': 'ListItem', position: i + 1, name: l.replace(/&amp;/g, '&'), item: ctx.site + (h === '/' ? '/' : h) })) })}</script>` : '';
  const scripts = ['/js/icons.js', '/js/site.js', ...(p.scripts || [])].map(s => `<script src="${s}" defer></script>`).join('');
  return `<!doctype html>
<html lang="en">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<title>${esc(p.title)}</title>
<meta name="description" content="${esc(p.desc)}">
<meta name="robots" content="${robots}">
<link rel="canonical" href="${url}">
<meta name="theme-color" content="#17301F">
<meta name="author" content="${esc(ctx.owner)}">
<meta property="og:type" content="${p.og || 'website'}"><meta property="og:site_name" content="TRACE360"><meta property="og:title" content="${esc(p.title)}"><meta property="og:description" content="${esc(p.desc)}"><meta property="og:url" content="${url}">
<meta property="og:image" content="${img}"><meta property="og:image:width" content="1200"><meta property="og:image:height" content="630"><meta property="og:image:alt" content="TRACE360: Know the journey. Trust the product."><meta property="og:locale" content="en_IN">
<meta name="twitter:card" content="summary_large_image"><meta name="twitter:title" content="${esc(p.title)}"><meta name="twitter:description" content="${esc(p.desc)}"><meta name="twitter:image" content="${img}"><meta name="twitter:image:alt" content="TRACE360: Know the journey. Trust the product.">
${ctx.ga ? `<meta name="ga-id" content="${esc(ctx.ga)}">` : ''}
<link rel="icon" href="/favicon.svg" type="image/svg+xml"><link rel="icon" href="/favicon-32.png" sizes="32x32" type="image/png"><link rel="apple-touch-icon" href="/apple-touch-icon.png"><link rel="manifest" href="/manifest.webmanifest">
<link rel="preconnect" href="https://fonts.googleapis.com"><link rel="preconnect" href="https://fonts.gstatic.com" crossorigin>
<link rel="stylesheet" href="https://fonts.googleapis.com/css2?family=Fraunces:opsz,wght@9..144,400;9..144,600;9..144,800&family=Instrument+Sans:wght@400;500;600;700&display=swap">
<link rel="stylesheet" href="/css/styles.css?v=${ctx.built}">
<script src="/js/theme.js"></script>
${ld}
${crumbLd}
</head>
<body>
<a class="skip" href="#main">Skip to content</a>
<div class="progress" id="progress" aria-hidden="true"></div>
${header(ctx, p.current || p.path)}
<main id="main">
${crumbs(p)}
${p.body}
</main>
${footer(ctx)}
<div class="floaters"><a class="fab mail" href="/contact" aria-label="Contact us">${ico('FaEnvelope')}<span class="tip">Contact us</span></a>${ctx.wa ? `<a class="fab wa" href="https://wa.me/${ctx.wa}?text=${encodeURIComponent('Hello, I would like to know more about TRACE360.')}" rel="noopener" target="_blank" aria-label="Chat on WhatsApp">${ico('FaWhatsapp')}<span class="tip">WhatsApp</span></a>` : ''}</div>
<button class="totop" type="button" aria-label="Back to top">${ico('FaArrowUp')}</button>
<div id="toasts" aria-live="polite"></div>
${scripts}
</body>
</html>
`;
}
