/* TRACE360 front-end — dependency-free single-page app. All user text goes through esc() before touching innerHTML. */
(() => {
'use strict';
const $ = (s, el = document) => el.querySelector(s);
const $$ = (s, el = document) => [...el.querySelectorAll(s)];
const esc = s => String(s ?? '').replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
const store = { get: k => { try { return localStorage.getItem(k); } catch { return null; } }, set: (k, v) => { try { v == null ? localStorage.removeItem(k) : localStorage.setItem(k, v); } catch {} } };
const S = { token: store.get('t360_token'), user: null, cfg: { contact_email: '', owner: '', year: new Date().getFullYear() } };
const app = $('#app');

const LOGO = `<svg viewBox="0 0 64 64" aria-hidden="true"><rect width="64" height="64" rx="16" fill="#17301F"/><path d="M14 44c6-14 14-22 36-24-2 22-10 30-24 30" fill="#E3A21A"/><path d="M16 48c8-10 16-16 28-20" stroke="#17301F" stroke-width="3" fill="none" stroke-linecap="round"/></svg>`;
const ARROW = `<svg class="ar" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.4" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M5 12h14M13 6l6 6-6 6"/></svg>`;
const LABELS = { entered: 'Business-entered', document: 'Document attached', reviewed: 'Reviewed by business' };
const STATUS = { complete: 'Complete', needs_review: 'Needs review', in_progress: 'In progress' };
const TYPES = ['production', 'quality', 'packing', 'dispatch', 'receipt', 'storage'];
const PUBLIC_FIELDS = { origin: 'Origin', production_date: 'Production date', organisation: 'Producer name', quantity: 'Batch quantity', locations: 'Event locations', notes: 'Event notes', evidence: 'Documents marked public' };

const fmt = iso => { const d = new Date(iso); if (isNaN(d)) return ''; const t = d.getHours() || d.getMinutes();
  return d.toLocaleDateString('en-IN', { day: 'numeric', month: 'short', year: 'numeric' }) + (t ? ', ' + d.toLocaleTimeString('en-IN', { hour: '2-digit', minute: '2-digit' }) : ''); };
const mail = () => `<a href="mailto:${esc(S.cfg.contact_email)}">${esc(S.cfg.contact_email)}</a>`;

function toast(msg, bad) { const t = document.createElement('div'); t.className = 'toast' + (bad ? ' bad' : ''); t.textContent = msg; $('#toasts').append(t); setTimeout(() => t.remove(), 4200); }

async function api(path, { method = 'GET', body, form } = {}) {
  const headers = {}; if (S.token) headers.Authorization = 'Bearer ' + S.token;
  let payload; if (form) payload = form; else if (body) { headers['Content-Type'] = 'application/json'; payload = JSON.stringify(body); }
  const r = await fetch(path, { method, headers, body: payload });
  let data = null; try { data = await r.json(); } catch {}
  if (!r.ok) {
    if (r.status === 401 && S.token) { signOut(true); }
    const d = data && data.detail; const msg = typeof d === 'string' ? d : Array.isArray(d) ? d.map(x => (x.loc || []).slice(-1) + ': ' + x.msg).join('; ') : 'Something went wrong.';
    throw new Error(msg);
  }
  return data;
}
async function openFile(url) { // authenticated file → blob → new tab
  try { const r = await fetch(url, { headers: { Authorization: 'Bearer ' + S.token } }); if (!r.ok) throw 0; const u = URL.createObjectURL(await r.blob()); window.open(u, '_blank', 'noopener'); }
  catch { toast('Could not open the file.', true); }
}
function signOut(expired) { S.token = null; S.user = null; store.set('t360_token', null); location.hash = '#/login'; if (expired) toast('Please sign in again.', true); }
async function loadUser() { if (!S.token) return; try { S.user = await api('/api/auth/me'); } catch { S.user = null; } }

/* ---------- shared chrome ---------- */
function nav(current) {
  const u = S.user, on = h => current === h ? 'on' : '';
  const links = u ? `<a class="${on('dashboard')}" href="#/dashboard">Dashboard</a><a class="${on('batches')}" href="#/batches">Batches</a><a class="${on('products')}" href="#/products">Products</a>${u.role === 'admin' ? `<a class="${on('team')}" href="#/team">Team</a>` : ''}<a href="#/verify">Verify a code</a><button class="btn sm ghost" data-signout><span>Sign out</span></button>`
    : `<a href="#/" data-go="how">How it works</a><a href="#/" data-go="features">Features</a><a href="#/" data-go="trust">Trust model</a><a href="#/" data-go="pricing">Pricing</a><a href="#/verify">Verify a code</a><a class="btn sm ghost" href="#/login"><span>Sign in</span></a><a class="btn sm" href="#/register"><span>Get started</span>${ARROW}</a>`;
  return `<header class="nav"><div class="wrap"><a class="logo" href="#/">${LOGO}<span>TRACE<b>360</b></span></a><button class="burger" aria-label="Menu" aria-expanded="false"><i></i><i></i><i></i></button><nav class="links">${links}</nav></div></header>`;
}
function footer() {
  return `<footer><div class="wrap"><div class="cols"><div><a class="logo" href="#/">${LOGO}<span>TRACE<b>360</b></span></a><p style="margin-top:1rem;max-width:30em">Know the journey. Trust the product. A digital record and visibility tool for product batches — not a regulator, laboratory or certifier.</p></div>
  <div><h3 style="color:#fff;font-size:1.05rem">Explore</h3><p><a href="#/verify">Verify a code</a><br><a href="#/legal">Privacy &amp; terms</a></p></div>
  <div><h3 style="color:#fff;font-size:1.05rem">Contact</h3><p>${mail()}<br>${esc(S.cfg.owner)}</p></div></div><hr>
  <div class="fine">© ${S.cfg.year} ${esc(S.cfg.owner)}. All rights reserved. TRACE360 and its design, text and source code are the property of ${esc(S.cfg.owner)}.</div></div></footer>`;
}
function page(html, current, { bare } = {}) {
  app.innerHTML = (bare ? '' : nav(current)) + `<main id="main">${html}</main>` + (bare ? '' : footer());
  scrollTo(0, 0); enhance();
}
const loading = () => { app.innerHTML = nav('') + '<main id="main"><div class="spin" role="status" aria-label="Loading"></div></main>'; };

/* ---------- enhancements: comet buttons, reveal, count-up ---------- */
function enhance() {
  $$('.btn:not([data-e])').forEach(b => { b.dataset.e = 1; b.insertAdjacentHTML('beforeend', '<svg class="trace" aria-hidden="true"><rect pathLength="100"/></svg>'); });
  if (!('IntersectionObserver' in window)) $$('.reveal').forEach(el => el.classList.add('in'));
  const io = 'IntersectionObserver' in window ? new IntersectionObserver(es => es.forEach(e => { if (e.isIntersecting) { e.target.classList.add('in'); io.unobserve(e.target); } }), { threshold: .12 }) : null;
  $$('.reveal').forEach(el => { el.style.transitionDelay = (el.dataset.d || 0) + 'ms'; io && io.observe(el); });
  $$('.tl li').forEach((li, i) => setTimeout(() => li.classList.add('in'), 250 + i * 160));
  $$('[data-count]').forEach(el => { const to = +el.dataset.count, t0 = performance.now(); const tick = t => { const p = Math.min(1, (t - t0) / 900); el.textContent = Math.round(to * (1 - Math.pow(1 - p, 3))); if (p < 1) requestAnimationFrame(tick); }; requestAnimationFrame(tick); });
}
document.addEventListener('click', e => {
  const b = e.target.closest('.btn'); // QR-module burst
  if (b && !matchMedia('(prefers-reduced-motion:reduce)').matches) {
    const cols = ['#17301F', '#E3A21A', '#2F6B3F', '#D9731F'];
    for (let i = 0; i < 12; i++) { const p = document.createElement('i'); p.className = 'px'; const a = Math.random() * 6.28, d = 40 + Math.random() * 60;
      p.style.cssText = `left:${e.clientX - 4}px;top:${e.clientY - 4}px;background:${cols[i % 4]};--dx:${Math.cos(a) * d}px;--dy:${Math.sin(a) * d}px;--rot:${Math.random() * 360}deg;${i % 3 ? '' : 'border-radius:50%'}`; document.body.append(p); setTimeout(() => p.remove(), 800); }
  }
  if (e.target.closest('.burger')) { const l = $('.links'); const o = l.classList.toggle('open'); $('.burger').setAttribute('aria-expanded', o); return; }
  if (e.target.closest('.links a, .links button')) $('.links')?.classList.remove('open');
  const go = e.target.closest('[data-go]');
  if (go) { e.preventDefault(); const jump = () => document.getElementById(go.dataset.go)?.scrollIntoView({ behavior: 'smooth' }); if (!location.hash || location.hash === '#/' || location.hash === '#') jump(); else { location.hash = '#/'; setTimeout(jump, 400); } }
  if (e.target.closest('[data-signout]')) signOut();
  const f = e.target.closest('[data-file]'); if (f) { e.preventDefault(); openFile(f.dataset.file); }
});

function bindForm(sel, fn) {
  const f = $(sel); if (!f) return;
  f.addEventListener('submit', async ev => {
    ev.preventDefault(); const err = $('.err', f), btn = $('button[type=submit]', f); if (err) err.textContent = ''; btn && (btn.disabled = true);
    try { await fn(Object.fromEntries(new FormData(f)), f); } catch (e) { if (err) err.textContent = e.message; else toast(e.message, true); } finally { btn && (btn.disabled = false); }
  });
}
const pill = s => `<span class="pill ${s}">${STATUS[s] || s}</span>`;

/* ---------- LANDING ---------- */
function landing() {
  const demo = S.cfg.demo_token;
  const faq = [
    ['Does a QR code prove a product is genuine?', 'No — and TRACE360 never claims it does. A QR code links a product to the records its maker chose to publish. Every entry on a trace page is labelled by how it was recorded, so you can tell business-entered information from reviewed or independently verified evidence.'],
    ['Is TRACE360 a regulator or certification body?', 'No. It is a digital record and visibility tool. It does not certify food safety or legal compliance. Producers remain responsible for the accuracy of what they enter.'],
    ['Who is it for?', 'Small and medium food producers, cooperatives, processors and distributors that repeat batches — tea, honey, spices, millets, packaged foods — and the buyers who ask them where a batch came from.'],
    ['What stays private?', 'Everything, by default. Documents, notes, event locations and quantities only appear publicly when someone with the right role switches them on for that batch.'],
    ['Can I fix a wrong entry?', 'Yes, with a correction entry. The original stays in the audit history and is shown as superseded, so history is never silently rewritten.']];
  const feats = [['🏭', 'Organisation & roles', 'Owner, operator, quality manager and distributor roles — each can only record what their job covers.'], ['🍃', 'Product catalogue', 'Teas, honeys and spice lines organised once, reused by every batch.'], ['📦', 'Batch management', 'Unique codes, origin, quantity and production date, per organisation.'],
    ['🧵', 'Event timeline', 'Production → quality → packing → dispatch → receipt, in order, with who and when.'], ['📎', 'Evidence documents', 'Attach PDFs and photos to the event they belong to. Private until you decide otherwise.'], ['▦', 'QR code per batch', 'A random, unguessable public link — never a sequential ID.'],
    ['🔍', 'Public trace page', 'A clean “product passport” showing only the fields you approve.'], ['🚩', 'Completeness checks', 'Flags missing steps, impossible dates and quality checks without documents.'], ['🧾', 'Audit trail', 'Every create, review, publish and upload is logged against a named user.']];
  const plans = [['Starter', '₹499', 'One organisation, limited users and batches, basic QR pages.'], ['Growth', '₹1,999', 'More users and batches, evidence uploads, reports and alerts.', 1], ['Business', '₹4,999', 'Multiple locations, partner workflows and priority support.'], ['Enterprise', 'Custom', 'Integrations, custom roles, onboarding and service commitments.']];
  page(`
  <section class="hero"><div class="wrap"><div>
    <span class="eyebrow">Smart supply chain &amp; product trust</span>
    <h1>Know the journey. <em>Trust</em> the product.</h1>
    <p class="lead">Every batch has a story — garden to shelf. TRACE360 turns scattered registers, spreadsheets and chat messages into one honest, scannable record that small producers can actually afford to keep.</p>
    <div class="cta"><a class="btn" href="#/register"><span>Start tracing a batch</span>${ARROW}</a>${demo ? `<a class="btn ghost" href="/t/${esc(demo)}"><span>See a live trace page</span></a>` : ''}</div>
    <span class="note">🌿 Not a certifier. A record you can show, with its source labelled.</span></div>
    <div class="route"><span class="tag">Batch TEA-DEMO-001</span>
      <svg viewBox="0 0 520 300" role="img" aria-label="A batch travelling from garden to quality check, packing, dispatch and shelf">
        <path class="rp" d="M60 232C90 130 120 96 170 112S250 238 292 206S350 42 392 72S452 214 470 186"/>
        <path id="rt" class="rp-draw" d="M60 232C90 130 120 96 170 112S250 238 292 206S350 42 392 72S452 214 470 186"/>
        ${[[60, 232, 'Garden', '1.2s', 14, -22], [170, 112, 'Quality', '1.7s', 14, -22], [292, 206, 'Packing', '2.2s', 14, 30], [392, 72, 'Dispatch', '2.7s', 14, -22], [470, 186, 'Shelf', '3.2s', -10, 34]].map(([x, y, t, d, tx, ty]) =>
          `<g class="node" style="animation-delay:${d}"><circle cx="${x}" cy="${y}" r="15" fill="#E3A21A" stroke="#17301F" stroke-width="2.5"/><circle cx="${x}" cy="${y}" r="5" fill="#17301F"/><text x="${x + tx - 28}" y="${y + ty}">${t}</text></g>`).join('')}
        <circle r="7" fill="#C23B22" stroke="#17301F" stroke-width="2"><animateMotion dur="9s" begin="4s" repeatCount="indefinite" path="M60 232C90 130 120 96 170 112S250 238 292 206S350 42 392 72S452 214 470 186"/></circle>
      </svg>
      ${demo ? `<div class="mini"><img src="/api/qr/${esc(demo)}.svg" alt="QR code for the demo batch"><p><b>Scan it.</b> This QR opens the real public trace page for a synthetic demo batch.</p></div>` : ''}</div></div></section>
  <div class="marquee" aria-hidden="true"><div>${['Darjeeling tea', 'Forest honey', 'Turmeric', 'Millets', 'Pure ghee', 'Black pepper', 'Jaggery', 'Cold-pressed oils', 'Saffron'].concat(['Darjeeling tea', 'Forest honey', 'Turmeric', 'Millets', 'Pure ghee', 'Black pepper', 'Jaggery', 'Cold-pressed oils', 'Saffron']).map(x => `<span>${x}</span>`).join('')}</div></div>
  <section class="s"><div class="wrap"><span class="eyebrow">The problem</span><h2 class="reveal">“Where did this batch come from?” shouldn’t take three phone calls.</h2>
    <div class="grid g3 mt">${[['📒', 'Records are scattered', 'Paper registers, spreadsheets, invoices and chat threads — each holding one piece of the story.'], ['💸', 'Big tools cost too much', 'Enterprise traceability suites are built for corporations, not a cooperative with ten staff.'], ['❓', 'A QR alone proves nothing', 'Most QR codes open a static page. Buyers can’t tell what was recorded, by whom, or when.']].map(([i, t, p], k) => `<div class="card hov reveal" data-d="${k * 120}"><div class="ic">${i}</div><h3>${t}</h3><p class="muted">${p}</p></div>`).join('')}</div></div></section>
  <section class="s alt" id="how"><div class="wrap"><span class="eyebrow">How it works</span><h2 class="reveal">Four steps from batch to scan.</h2>
    <div class="steps mt">${[['Create the batch', 'Pick the product, set a unique code, origin, quantity and production date.'], ['Record the journey', 'Production, quality, packing, dispatch and receipt — added by the right person, with a timestamp.'], ['Attach evidence', 'Link lab notes or photos to the event. Decide what stays private.'], ['Print the QR', 'Customers scan and see only what you approved, in a clean timeline.']].map(([t, p], k) => `<div class="step reveal" data-d="${k * 140}"><h3>${t}</h3><p class="muted">${p}</p></div>`).join('')}</div></div></section>
  <section class="s" id="features"><div class="wrap"><span class="eyebrow">Features</span><h2 class="reveal">Everything a small producer needs. Nothing they don’t.</h2>
    <div class="grid g3 mt">${feats.map(([i, t, p], k) => `<div class="card hov reveal" data-d="${(k % 3) * 100}"><div class="ic">${i}</div><h3>${t}</h3><p class="muted" style="margin:0">${p}</p></div>`).join('')}</div></div></section>
  <section class="s alt" id="trust"><div class="wrap"><span class="eyebrow">Trust model</span><h2 class="reveal">Honest by design.</h2>
    <p class="lead reveal">Every entry on a trace page carries a stamp that says how it was recorded. We will only ever show “Independently verified” when a named verifier has done a stated check — never as decoration.</p>
    <div class="stamps mt">${[['entered', 'Business-entered', 'Typed in by an authorised user of the producer.'], ['document', 'Document attached', 'A supporting file is attached. Contents not necessarily validated.'], ['reviewed', 'Reviewed by business', 'A designated reviewer at the business marked it reviewed.'], ['verified', 'Independently verified', 'Reserved: needs a named verifier, scope and date. Not enabled yet.']].map(([c, t, p], k) => `<div class="stamp ${c} reveal" data-d="${k * 120}">${t}<small>${p}</small></div>`).join('')}</div></div></section>
  <section class="s"><div class="wrap grid g2" style="align-items:center"><div><span class="eyebrow">Built for public welfare</span><h2 class="reveal">The people who grow and make our food deserve good records too.</h2></div>
    <div class="reveal"><p class="lead">Traceability shouldn’t be a luxury for big brands. TRACE360 is built so a village cooperative, a tea garden or a family honey business can show buyers and families exactly what they chose to share — simply, affordably and honestly.</p><a class="btn" href="#/register"><span>Join as a producer</span>${ARROW}</a></div></div></section>
  <section class="s alt" id="pricing"><div class="wrap"><span class="eyebrow">Pricing</span><h2 class="reveal">Simple plans. Starting hypotheses.</h2><p class="muted">Illustrative pilot prices — still being validated with real producers. Talk to us about what works for you.</p>
    <div class="grid g4 mt">${plans.map(([n, pr, d, hot], k) => `<div class="card plan reveal ${hot ? 'hot' : ''}" data-d="${k * 100}"><h3>${n}</h3><div class="price">${pr}${pr !== 'Custom' ? '<small> /month</small>' : ''}</div><p class="${hot ? 'muted' : 'muted'}">${d}</p><a class="btn sm ${hot ? '' : 'ghost'}" href="#/register" style="${hot ? 'background:var(--turmeric);color:var(--ink)' : ''}"><span>Choose ${n}</span></a></div>`).join('')}</div></div></section>
  <section class="s"><div class="wrap" style="max-width:820px"><span class="eyebrow">Questions</span><h2>Straight answers.</h2>${faq.map(([q, a]) => `<details><summary>${q}</summary><p class="muted" style="margin-top:.8rem">${a}</p></details>`).join('')}</div></section>
  <section class="s alt" id="contact"><div class="wrap grid g2" style="align-items:start"><div><span class="eyebrow">Pilot &amp; contact</span><h2>Want to trace your first batch?</h2><p class="lead">Tell us about your product and we’ll get in touch. Or write directly: ${mail()}.</p></div>
    <form id="lead" class="card" style="box-shadow:8px 8px 0 var(--ink)"><div class="row"><div class="f"><label for="ln">Your name</label><input id="ln" name="name" required minlength="2" maxlength="120" autocomplete="name"></div><div class="f"><label for="le">Email</label><input id="le" name="email" type="email" required autocomplete="email"></div></div>
    <div class="f"><label for="lo">Organisation</label><input id="lo" name="organisation" maxlength="160"></div><div class="f"><label for="lm">What would you like to trace?</label><textarea id="lm" name="message" rows="3" maxlength="2000"></textarea></div><p class="err" role="alert"></p><button class="btn" type="submit"><span>Send request</span>${ARROW}</button></form></div></section>`, 'landing');
  bindForm('#lead', async (d, f) => { await api('/api/leads', { method: 'POST', body: d }); f.reset(); toast('Thank you! We will write back soon.'); });
}

/* ---------- AUTH ---------- */
function login() {
  page(`<div class="auth"><form id="lf" class="card"><h2>Welcome back</h2><p class="muted">Sign in to your TRACE360 workspace.</p>
  <div class="f"><label for="e">Email</label><input id="e" name="email" type="email" required autocomplete="username"></div><div class="f"><label for="p">Password</label><input id="p" name="password" type="password" required autocomplete="current-password"></div>
  <p class="err" role="alert"></p><button class="btn" type="submit" style="width:100%"><span>Sign in</span>${ARROW}</button>
  ${S.cfg.demo_login ? `<p class="center muted mt">or <a href="#" id="demo">try the demo workspace</a> (synthetic data)</p>` : ''}${S.cfg.registration ? `<p class="center muted">New here? <a href="#/register">Create a workspace</a></p>` : ''}</form></div>`, 'login');
  const done = async r => { S.token = r.token; store.set('t360_token', r.token); S.user = r.user; location.hash = '#/dashboard'; };
  bindForm('#lf', async d => done(await api('/api/auth/login', { method: 'POST', body: d })));
  $('#demo')?.addEventListener('click', async e => { e.preventDefault(); try { done(await api('/api/auth/login', { method: 'POST', body: { email: 'demo@trace360.app', password: 'Demo@12345' } })); } catch (x) { toast(x.message, true); } });
}
function register() {
  page(`<div class="auth"><form id="rf" class="card"><h2>Start your workspace</h2><p class="muted">Create an organisation and its first admin account.</p>
  <div class="f"><label for="o">Organisation name</label><input id="o" name="organisation" required minlength="2" maxlength="160"></div>
  <div class="f"><label for="bt">Business type</label><select id="bt" name="business_type">${['Food producer', 'Tea / coffee estate', 'Honey producer', 'Spice processor', 'Cooperative / FPO', 'Distributor', 'Retailer'].map(x => `<option>${x}</option>`).join('')}</select></div>
  <div class="row"><div class="f"><label for="n">Your name</label><input id="n" name="name" required minlength="2" autocomplete="name"></div><div class="f"><label for="e">Email</label><input id="e" name="email" type="email" required autocomplete="username"></div></div>
  <div class="f"><label for="p">Password <span class="muted">(8+ characters)</span></label><input id="p" name="password" type="password" required minlength="8" maxlength="72" autocomplete="new-password"></div>
  <p class="muted" style="font-size:.85rem">By creating an account you agree to the <a href="#/legal">terms &amp; privacy notice</a>.</p><p class="err" role="alert"></p>
  <button class="btn" type="submit" style="width:100%"><span>Create workspace</span>${ARROW}</button><p class="center muted mt">Have an account? <a href="#/login">Sign in</a></p></form></div>`, 'register');
  bindForm('#rf', async d => { const r = await api('/api/auth/register', { method: 'POST', body: d }); S.token = r.token; store.set('t360_token', r.token); S.user = r.user; location.hash = '#/dashboard'; });
}

/* ---------- APP: dashboard / batches / products / team ---------- */
const tabs = cur => `<div class="tabs">${[['dashboard', 'Overview'], ['batches', 'Batches'], ['products', 'Products']].concat(S.user.role === 'admin' ? [['team', 'Team & audit']] : []).map(([h, t]) => `<a class="${cur === h ? 'on' : ''}" href="#/${h}">${t}</a>`).join('')}</div>`;
const batchRow = b => `<tr class="link" data-href="#/batches/${b.id}" tabindex="0"><td><b>${esc(b.batch_code)}</b></td><td>${esc(b.product)}</td><td>${esc(b.production_date)}</td><td>${pill(b.status)}</td><td>${b.published ? '<span class="pill live">Live</span>' : '<span class="pill off">Private</span>'}</td><td>${b.scan_count}</td></tr>`;
const batchTable = rows => rows.length ? `<div class="scroll"><table><thead><tr><th>Batch</th><th>Product</th><th>Produced</th><th>Record</th><th>Page</th><th>Scans</th></tr></thead><tbody>${rows.map(batchRow).join('')}</tbody></table></div>` : `<div class="empty">No batches yet.</div>`;
document.addEventListener('click', e => { const r = e.target.closest('tr[data-href]'); if (r) location.hash = r.dataset.href; });
document.addEventListener('keydown', e => { if (e.key === 'Enter') { const r = e.target.closest?.('tr[data-href]'); if (r) location.hash = r.dataset.href; } });

async function dashboard() {
  loading(); const d = await api('/api/dashboard/summary'), t = d.totals;
  page(`<div class="shell"><div class="wrap"><h1>Hello, ${esc(S.user.name.split(' ')[0])}.</h1><p class="muted">${esc(S.user.organisation)} · signed in as ${esc(S.user.role)}</p>${tabs('dashboard')}
  <div class="grid g4">${[['Batches', t.batches], ['Complete records', t.complete], ['Need review', t.needs_review], ['Public scans', t.scans]].map(([l, n]) => `<div class="card stat"><b data-count="${n}">0</b><span>${l}</span></div>`).join('')}</div>
  <div class="split mt"><div class="card"><h3>Recent batches</h3>${batchTable(d.recent)}<div class="actions" style="justify-content:flex-start">${['admin', 'operator'].includes(S.user.role) ? `<a class="btn sm" href="#/batches/new"><span>New batch</span>${ARROW}</a>` : ''}<a class="btn sm ghost" href="#/batches"><span>All batches</span></a></div></div>
  <div class="card"><h3>Needs attention</h3>${d.alerts.length ? d.alerts.map(a => `<div class="flag warning"><span>🚩</span><span><b>${esc(a.batch_code)}</b> — ${esc(a.message)} <a href="#/batches/${a.batch_id}">Open</a></span></div>`).join('') : '<p class="muted">Nothing flagged. Records look consistent. 🌿</p>'}<p class="muted" style="font-size:.85rem">Flags are prompts for human review, not proof of wrongdoing.</p></div></div></div></div>`, 'dashboard');
}
async function batches() {
  loading(); const rows = await api('/api/batches');
  page(`<div class="shell"><div class="wrap"><h1>Batches</h1>${tabs('batches')}<div class="card"><div class="row" style="margin-bottom:1rem"><input id="q" placeholder="Search by batch code or product…" aria-label="Search batches"><div style="text-align:right">${['admin', 'operator'].includes(S.user.role) ? `<a class="btn" href="#/batches/new"><span>New batch</span>${ARROW}</a>` : ''}</div></div><div id="tb">${batchTable(rows)}</div></div></div></div>`, 'batches');
  $('#q').addEventListener('input', e => { const v = e.target.value.toLowerCase(); $('#tb').innerHTML = batchTable(rows.filter(b => (b.batch_code + b.product).toLowerCase().includes(v))); });
}
async function products() {
  loading(); const rows = await api('/api/products'); const can = ['admin', 'operator'].includes(S.user.role);
  page(`<div class="shell"><div class="wrap"><h1>Products</h1>${tabs('products')}<div class="split"><div class="card">${rows.length ? `<div class="scroll"><table><thead><tr><th>Name</th><th>Category</th><th>Description</th></tr></thead><tbody>${rows.map(p => `<tr><td><b>${esc(p.name)}</b></td><td>${esc(p.category)}</td><td class="muted">${esc(p.description)}</td></tr>`).join('')}</tbody></table></div>` : '<div class="empty">Add your first product to create batches.</div>'}</div>
  ${can ? `<form id="pf" class="card"><h3>Add a product</h3><div class="f"><label for="pn">Name</label><input id="pn" name="name" required minlength="2" maxlength="160"></div><div class="f"><label for="pc">Category</label><select id="pc" name="category">${['Tea', 'Honey', 'Spices', 'Millets & grains', 'Dairy & ghee', 'Oils', 'Packaged food', 'Other'].map(x => `<option>${x}</option>`).join('')}</select></div><div class="f"><label for="pd">Description</label><textarea id="pd" name="description" rows="3" maxlength="1000"></textarea></div><p class="err" role="alert"></p><button class="btn" type="submit"><span>Save product</span>${ARROW}</button></form>` : ''}</div></div></div>`, 'products');
  bindForm('#pf', async d => { await api('/api/products', { method: 'POST', body: d }); toast('Product saved.'); products(); });
}
async function batchNew() {
  loading(); const prods = await api('/api/products');
  if (!['admin', 'operator'].includes(S.user.role)) { page('<div class="shell"><div class="wrap"><h1>Not allowed</h1><p>Your role cannot create batches.</p></div></div>', 'batches'); return; }
  if (!prods.length) { page(`<div class="shell"><div class="wrap"><h1>New batch</h1><div class="card empty">Create a product first. <p><a class="btn" href="#/products"><span>Add a product</span>${ARROW}</a></p></div></div></div>`, 'batches'); return; }
  const today = new Date().toISOString().slice(0, 10);
  page(`<div class="shell"><div class="wrap" style="max-width:760px"><h1>New batch</h1><form id="bf" class="card"><div class="row"><div class="f"><label for="bp">Product</label><select id="bp" name="product_id">${prods.map(p => `<option value="${p.id}">${esc(p.name)}</option>`).join('')}</select></div>
  <div class="f"><label for="bc">Batch code</label><input id="bc" name="batch_code" required pattern="[A-Za-z0-9._\\-]{2,60}" placeholder="e.g. TEA-2026-014" title="Letters, numbers, dot, dash, underscore"></div></div>
  <div class="f"><label for="bo">Origin (place of production)</label><input id="bo" name="origin" maxlength="200"></div>
  <div class="row"><div class="f"><label for="bd">Production date</label><input id="bd" name="production_date" type="date" value="${today}" required></div><div class="f"><label for="bq">Quantity</label><div class="row" style="grid-template-columns:2fr 1fr;gap:.5rem"><input id="bq" name="quantity" type="number" min="0" step="any" value="0"><select name="unit" aria-label="Unit">${['kg', 'g', 'L', 'ml', 'units'].map(u => `<option>${u}</option>`).join('')}</select></div></div></div>
  <p class="err" role="alert"></p><button class="btn" type="submit"><span>Create batch</span>${ARROW}</button></form></div></div>`, 'batches');
  bindForm('#bf', async d => { d.product_id = +d.product_id; d.quantity = +d.quantity || 0; const b = await api('/api/batches', { method: 'POST', body: d }); toast('Batch created. Add its first event.'); location.hash = '#/batches/' + b.id; });
}

/* ---------- BATCH DETAIL ---------- */
async function batchDetail(id) { loading(); draw(await api('/api/batches/' + id)); }
function draw(b) {
  const u = S.user, allowed = u.allowed_events || [], canPub = ['admin', 'quality'].includes(u.role), live = location.origin + '/t/' + b.public_token;
  const active = b.events.filter(e => !e.superseded);
  const li = e => `<li class="${e.superseded ? 'old' : ''}"><h3>${esc(e.event_type)}</h3><div><span class="chip ${e.label}">${LABELS[e.label]}</span>${e.corrects_id ? '<span class="chip entered">Correction</span>' : ''}${e.superseded ? '<span class="chip entered">Superseded</span>' : ''}</div>
    <div class="meta">${fmt(e.event_time)}${e.location_text ? ' · ' + esc(e.location_text) : ''} · recorded by ${esc(e.created_by)}</div>${e.notes ? `<p style="margin:.3rem 0">${esc(e.notes)}</p>` : ''}
    <div class="ev">${e.evidence.map(x => `<a href="#" data-file="/api/evidence/${x.id}/file">📎 ${esc(x.name)}</a> <span class="chip ${x.visibility === 'public' ? 'reviewed' : 'entered'}">${x.visibility}</span> `).join('')}</div>
    ${e.superseded ? '' : `<div class="actions" style="justify-content:flex-start;margin-top:.4rem"><label class="btn sm ghost" style="margin:0;cursor:pointer"><span>Attach document</span><input type="file" class="up" data-eid="${e.id}" accept="application/pdf,image/png,image/jpeg" hidden></label>
    <label class="check" style="font-size:.85rem"><input type="checkbox" class="upv"> public</label>${canPub && e.label !== 'reviewed' ? `<button class="btn sm ghost rev" data-eid="${e.id}" type="button"><span>Mark reviewed</span></button>` : ''}</div>`}</li>`;
  page(`<div class="shell"><div class="wrap"><a href="#/batches">← All batches</a><h1 style="margin-top:.6rem">${esc(b.batch_code)} ${pill(b.status)}</h1><p class="muted">${esc(b.product)} · produced ${esc(b.production_date)}${b.origin ? ' · ' + esc(b.origin) : ''} · ${esc(b.quantity)} ${esc(b.unit)}${b.is_demo ? ' · <b>DEMO DATA</b>' : ''}</p>
  <div class="split"><div>
   ${b.flags.length ? `<div class="card" style="margin-bottom:1.2rem"><h3>Record checks</h3>${b.flags.map(f => `<div class="flag ${f.severity}"><span>${f.severity === 'warning' ? '🚩' : '⏳'}</span><span>${esc(f.message)}</span></div>`).join('')}<p class="muted" style="font-size:.85rem;margin:0">Prompts for review — not proof of wrongdoing.</p></div>` : '<div class="card" style="margin-bottom:1.2rem"><h3>Record checks</h3><p style="margin:0">✅ All required steps are recorded and consistent.</p></div>'}
   <div class="card"><h3>Journey</h3>${b.events.length ? `<ol class="tl">${b.events.map(li).join('')}</ol>` : '<div class="empty">No events yet. Record the first one below.</div>'}</div>
   ${allowed.length ? `<form id="ef" class="card mt"><h3>Add an event</h3><div class="row"><div class="f"><label for="et">Type</label><select id="et" name="event_type">${allowed.filter(t => TYPES.includes(t)).map(t => `<option>${t}</option>`).join('')}</select></div><div class="f"><label for="ed">Date &amp; time</label><input id="ed" name="event_time" type="datetime-local" required></div></div>
   <div class="f"><label for="el">Location</label><input id="el" name="location_text" maxlength="200"></div><div class="f"><label for="en">Notes</label><textarea id="en" name="notes" rows="2" maxlength="2000"></textarea></div>
   ${active.length ? `<div class="f"><label for="ec">This corrects an earlier event <span class="muted">(optional — history is kept)</span></label><select id="ec" name="corrects_id"><option value="">— new event —</option>${active.map(e => `<option value="${e.id}">${esc(e.event_type)} · ${fmt(e.event_time)}</option>`).join('')}</select></div>` : ''}
   <p class="err" role="alert"></p><button class="btn" type="submit"><span>Record event</span>${ARROW}</button></form>` : ''}</div>
  <aside><div class="card qrbox"><h3>Public QR</h3><img src="/api/qr/${esc(b.public_token)}.svg" alt="QR code for ${esc(b.batch_code)}"><p style="margin:.8rem 0 0;font-size:.82rem;word-break:break-all" class="muted">${esc(live)}</p>
   <p>${b.published ? '<span class="pill live">Live</span>' : '<span class="pill off">Not published</span>'} <span class="muted">· ${b.scan_count} scans</span></p>
   <div class="actions"><a class="btn sm" href="/api/qr/${esc(b.public_token)}.svg" download="${esc(b.batch_code)}-qr.svg"><span>Download SVG</span></a><button class="btn sm ghost" id="cp" type="button"><span>Copy link</span></button><button class="btn sm ghost" id="pr" type="button"><span>Print</span></button>${b.published ? `<a class="btn sm ghost" href="/t/${esc(b.public_token)}" target="_blank" rel="noopener"><span>Preview</span></a>` : ''}</div></div>
  ${canPub ? `<form id="pf2" class="card mt"><h3>Publish settings</h3><label class="check f"><input type="checkbox" name="published" ${b.published ? 'checked' : ''}> Publish this batch page</label><p class="muted" style="font-size:.85rem">Product name, batch code and the event timeline are shown when published. Choose what else:</p>
   ${Object.entries(PUBLIC_FIELDS).map(([k, l]) => `<label class="check f" style="margin-bottom:.5rem"><input type="checkbox" name="f_${k}" ${b.public_fields[k] ? 'checked' : ''}> ${l}</label>`).join('')}<p class="err" role="alert"></p><button class="btn sm" type="submit"><span>Save settings</span></button></form>` : ''}</aside></div></div></div>`, 'batches');
  const now = new Date(); now.setMinutes(now.getMinutes() - now.getTimezoneOffset()); $('#ed') && ($('#ed').value = now.toISOString().slice(0, 16));
  $('#pr')?.addEventListener('click', () => print());
  $('#cp')?.addEventListener('click', () => navigator.clipboard?.writeText(live).then(() => toast('Link copied.')));
  bindForm('#ef', async d => { d.corrects_id = d.corrects_id ? +d.corrects_id : null; draw(await api(`/api/batches/${b.id}/events`, { method: 'POST', body: d })); toast('Event recorded.'); });
  bindForm('#pf2', async (d, f) => { const pf = {}; Object.keys(PUBLIC_FIELDS).forEach(k => pf[k] = !!d['f_' + k]); draw(await api(`/api/batches/${b.id}/publish`, { method: 'PATCH', body: { published: !!d.published, public_fields: pf } })); toast('Settings saved.'); });
  $$('.up').forEach(inp => inp.addEventListener('change', async () => { if (!inp.files[0]) return; const fd = new FormData(); fd.append('file', inp.files[0]); fd.append('visibility', inp.closest('li').querySelector('.upv').checked ? 'public' : 'private');
    try { draw(await api(`/api/events/${inp.dataset.eid}/evidence`, { method: 'POST', form: fd })); toast('Document attached.'); } catch (e) { toast(e.message, true); } }));
  $$('.rev').forEach(bt => bt.addEventListener('click', async () => { try { draw(await api(`/api/events/${bt.dataset.eid}/review`, { method: 'POST' })); toast('Marked as reviewed.'); } catch (e) { toast(e.message, true); } }));
}

/* ---------- TEAM ---------- */
async function team() {
  if (S.user.role !== 'admin') { location.hash = '#/dashboard'; return; }
  loading(); const [m, a] = await Promise.all([api('/api/team'), api('/api/audit')]);
  const roles = { admin: 'Owner / admin', operator: 'Production operator', quality: 'Quality manager', distributor: 'Distributor / partner' };
  page(`<div class="shell"><div class="wrap"><h1>Team &amp; audit</h1>${tabs('team')}<div class="split"><div class="card"><div class="scroll"><table><thead><tr><th>Name</th><th>Role</th><th>Status</th><th></th></tr></thead><tbody>${m.map(x => `<tr><td><b>${esc(x.name)}</b><br><span class="muted">${esc(x.email)}</span></td><td>${x.id === S.user.id ? esc(roles[x.role]) : `<select class="role" data-id="${x.id}" aria-label="Role">${Object.entries(roles).map(([k, v]) => `<option value="${k}" ${k === x.role ? 'selected' : ''}>${v}</option>`).join('')}</select>`}</td><td>${x.active ? '<span class="pill live">Active</span>' : '<span class="pill off">Inactive</span>'}</td><td>${x.id === S.user.id ? '' : `<button class="btn sm ghost tg" data-id="${x.id}" data-a="${x.active ? 0 : 1}" type="button"><span>${x.active ? 'Deactivate' : 'Activate'}</span></button>`}</td></tr>`).join('')}</tbody></table></div></div>
  <form id="tf" class="card"><h3>Add a team member</h3><div class="f"><label for="tn">Name</label><input id="tn" name="name" required minlength="2"></div><div class="f"><label for="te">Email</label><input id="te" name="email" type="email" required></div><div class="f"><label for="tp">Temporary password</label><input id="tp" name="password" type="password" minlength="8" maxlength="72" required autocomplete="new-password"></div><div class="f"><label for="tr">Role</label><select id="tr" name="role">${Object.entries(roles).map(([k, v]) => `<option value="${k}" ${k === 'operator' ? 'selected' : ''}>${v}</option>`).join('')}</select></div><p class="err" role="alert"></p><button class="btn" type="submit"><span>Add member</span>${ARROW}</button></form></div>
  <div class="card mt"><h3>Audit trail</h3><div class="scroll"><table><thead><tr><th>When</th><th>Who</th><th>Action</th><th>Detail</th></tr></thead><tbody>${a.map(x => `<tr><td>${fmt(x.time)}</td><td>${esc(x.actor)}</td><td>${esc(x.action)} ${esc(x.record)}</td><td class="muted">${esc(x.detail)}</td></tr>`).join('')}</tbody></table></div></div></div></div>`, 'team');
  bindForm('#tf', async d => { await api('/api/team', { method: 'POST', body: d }); toast('Member added.'); team(); });
  $$('.role').forEach(s => s.addEventListener('change', async () => { try { await api('/api/team/' + s.dataset.id, { method: 'PATCH', body: { role: s.value } }); toast('Role updated.'); } catch (e) { toast(e.message, true); } }));
  $$('.tg').forEach(b => b.addEventListener('click', async () => { try { await api('/api/team/' + b.dataset.id, { method: 'PATCH', body: { active: b.dataset.a === '1' } }); team(); } catch (e) { toast(e.message, true); } }));
}

/* ---------- VERIFY / LEGAL / 404 ---------- */
function verify(msg) {
  page(`<div class="auth"><form id="vf" class="card"><span class="eyebrow">Verify a code</span><h2>Have a TRACE360 link?</h2><p class="muted">Paste the web address from a product’s QR code, or just its code, to see the batch journey.</p><div class="f"><label for="vt">Link or code</label><input id="vt" name="t" required placeholder="https://…/t/abc123"></div><p class="err" role="alert">${esc(msg || '')}</p><button class="btn" type="submit"><span>Show journey</span>${ARROW}</button></form></div>`, 'verify');
  bindForm('#vf', async d => { const tok = d.t.trim().split('/').filter(Boolean).pop().split(/[?#]/)[0]; if (!/^[\w-]{4,64}$/.test(tok)) throw new Error('That does not look like a TRACE360 code.'); location.href = '/t/' + tok; });
}
function legal() {
  page(`<section class="s"><div class="wrap" style="max-width:780px"><span class="eyebrow">Privacy &amp; terms</span><h1>The short, plain version.</h1>
  <p class="disclaimer">Draft notice for the launch version. Have it reviewed by a qualified adviser before relying on it commercially.</p>
  <h3>What TRACE360 is</h3><p>A digital record and visibility tool operated by ${esc(S.cfg.owner)}. It is <b>not</b> a regulator, laboratory, certification body or guarantee that any product is safe, genuine or compliant. The business that enters information is responsible for its accuracy.</p>
  <h3>What we collect</h3><p>Account details (name, email, hashed password), the organisation, product, batch and event records you enter, uploaded evidence files, an audit log of actions, and a simple count of how many times each public page is opened. We do not use advertising trackers.</p>
  <h3>What is public</h3><p>Only the fields a producer explicitly publishes for a batch. Documents, notes, locations and quantities are private unless switched on.</p>
  <h3>Your data</h3><p>Ask ${mail()} to export or delete your organisation’s data. Corrections are recorded as new entries so history stays auditable.</p>
  <h3>Acceptable use</h3><p>Don’t enter false information, upload unlawful content, or present a TRACE360 page as an official certificate.</p>
  <h3>Contact</h3><p>${esc(S.cfg.owner)} · ${mail()}</p></div></section>`, 'legal');
}
function notFound() { page(`<section class="s center"><div class="wrap"><h1>Lost the trail.</h1><p class="lead" style="margin-inline:auto">We couldn’t find that page.</p><a class="btn" href="#/"><span>Back to start</span>${ARROW}</a></div></section>`, ''); }

/* ---------- PUBLIC TRACE PAGE (/t/:token) ---------- */
async function trace(token) {
  app.innerHTML = '<div class="spin" role="status"></div>';
  let d; try { d = await (await fetch('/api/public/' + encodeURIComponent(token))).json().then(j => { if (j.detail) throw new Error(j.detail); return j; }); }
  catch (e) { page(`<section class="s center"><div class="wrap"><span class="eyebrow">Trace page</span><h1>No journey to show.</h1><p class="lead" style="margin-inline:auto">${esc(e.message)}</p><a class="btn" href="#/verify"><span>Try another code</span>${ARROW}</a></div></section>`, ''); return; }
  const facts = [['Batch', d.batch_code], d.origin && ['Origin', d.origin], d.production_date && ['Produced', fmt(d.production_date)], d.quantity && ['Quantity', d.quantity], d.organisation && ['Producer', d.organisation]].filter(Boolean);
  const status = d.record_status === 'complete' ? 'All expected steps are recorded.' : d.record_status === 'needs_review' ? `The producer’s record has ${d.open_flags} item(s) flagged for review.` : 'Some expected steps have not been recorded yet.';
  page(`${d.is_demo ? '<div class="demo-ribbon">DEMO — synthetic data for illustration only. Not a real product or certificate.</div>' : ''}
  <div class="passport"><header><span class="eyebrow" style="color:var(--turmeric)">Product journey</span><h1>${esc(d.product)}</h1><div>${esc(d.category)} · ${pill(d.record_status)}</div></header>
  <div class="body"><div class="facts">${facts.map(([k, v]) => `<div><small>${k}</small>${esc(v)}</div>`).join('')}</div>
  <h2 style="font-size:1.6rem">The journey so far</h2>${d.events.length ? `<ol class="tl">${d.events.map(e => `<li><h3>${esc(e.event_type)}</h3><div><span class="chip ${e.label}">${LABELS[e.label]}</span>${e.corrected ? '<span class="chip entered">Corrected</span>' : ''}</div><div class="meta">${fmt(e.event_time)}${e.location_text ? ' · ' + esc(e.location_text) : ''}</div>${e.notes ? `<p style="margin:.3rem 0">${esc(e.notes)}</p>` : ''}${(e.evidence || []).map(x => `<div class="ev"><a href="/api/public/${encodeURIComponent(token)}/evidence/${x.id}" target="_blank" rel="noopener">📎 ${esc(x.name)}</a></div>`).join('')}</li>`).join('')}</ol>` : '<p class="muted">No events published yet.</p>'}
  <p><b>Record status:</b> ${status}</p>
  <div class="disclaimer"><b>What this page means.</b> This is information the producer chose to publish. Stamps show <i>how</i> each step was recorded; they are not a certificate, and a QR code cannot by itself prove the physical product matches its records. “Independently verified” is shown only when a named verifier has done a stated check.</div>
  <p class="muted center mt no-print" style="font-size:.85rem">Powered by <a href="/">TRACE360</a> · © ${S.cfg.year} ${esc(S.cfg.owner)} · ${mail()}</p></div></div>`, '', { bare: true });
}

/* ---------- router ---------- */
const AUTH = new Set(['dashboard', 'batches', 'products', 'team']);
async function route() {
  try {
    const m = location.pathname.match(/^\/t\/([\w-]+)\/?$/); if (m) return trace(m[1]);
    const h = (location.hash || '#/').replace(/^#\/?/, ''), seg = h.split('/').filter(Boolean), r = seg[0] || '';
    if (AUTH.has(r) && !S.user) { location.hash = '#/login'; return; }
    if ((r === 'login' || r === 'register') && S.user) { location.hash = '#/dashboard'; return; }
    if (r === '') return landing();
    if (r === 'login') return login();
    if (r === 'register') return S.cfg.registration ? register() : notFound();
    if (r === 'dashboard') return await dashboard();
    if (r === 'products') return await products();
    if (r === 'team') return await team();
    if (r === 'verify') return verify();
    if (r === 'legal') return legal();
    if (r === 'batches') { if (seg[1] === 'new') return await batchNew(); if (/^\d+$/.test(seg[1] || '')) return await batchDetail(+seg[1]); return await batches(); }
    notFound();
  } catch (e) { toast(e.message || 'Something went wrong.', true); }
}
addEventListener('hashchange', route);
(async () => {
  try { S.cfg = await (await fetch('/api/config')).json(); } catch {}
  await loadUser(); route();
})();
})();
