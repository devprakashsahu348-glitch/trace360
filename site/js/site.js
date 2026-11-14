/* TRACE360 site chrome: theme, menu, progress, cookies, search, forms, modals, toasts. No dependencies. */
(() => {
'use strict';
const $ = (s, e = document) => e.querySelector(s), $$ = (s, e = document) => [...e.querySelectorAll(s)];
const esc = s => String(s ?? '').replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
const mk = k => ({ get: n => { try { return window[k].getItem(n); } catch { return null; } }, set: (n, v) => { try { v == null ? window[k].removeItem(n) : window[k].setItem(n, v); } catch {} } });
const ls = mk('localStorage'), ss = mk('sessionStorage');
const IC = window.T360_ICONS || {};
const ARROW = '<svg class="ar" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.4" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M5 12h14M13 6l6 6-6 6"/></svg>';

function toast(msg, bad) {
  let box = $('#toasts'); if (!box) { box = document.createElement('div'); box.id = 'toasts'; box.setAttribute('aria-live', 'polite'); document.body.append(box); }
  const t = document.createElement('div'); t.className = 'toast' + (bad ? ' bad' : ''); t.textContent = msg; box.append(t); setTimeout(() => t.remove(), 4200);
}

/* ---------- comet buttons, reveal, count-up ---------- */
function enhance(root = document) {
  $$('.btn:not([data-e])', root).forEach(b => { b.dataset.e = 1; b.insertAdjacentHTML('beforeend', '<svg class="trace" aria-hidden="true"><rect pathLength="100"/></svg>'); });
  const io = 'IntersectionObserver' in window ? new IntersectionObserver(es => es.forEach(e => { if (e.isIntersecting) { e.target.classList.add('in'); io.unobserve(e.target); } }), { threshold: .12 }) : null;
  $$('.reveal:not(.in)', root).forEach(el => { el.style.transitionDelay = (el.dataset.d || 0) + 'ms'; io ? io.observe(el) : el.classList.add('in'); });
  $$('.tl li', root).forEach((li, i) => setTimeout(() => li.classList.add('in'), 250 + i * 160));
  $$('[data-count]', root).forEach(el => { const to = +el.dataset.count, t0 = performance.now(); const tick = t => { const p = Math.min(1, (t - t0) / 900); el.textContent = Math.round(to * (1 - Math.pow(1 - p, 3))); if (p < 1) requestAnimationFrame(tick); }; requestAnimationFrame(tick); });
}

/* ---------- confirmation modal ---------- */
function confirmModal({ title = 'Are you sure?', text = '', ok = 'Confirm', danger = false } = {}) {
  return new Promise(resolve => {
    const bg = document.createElement('div'); bg.className = 'modal-bg open';
    bg.innerHTML = `<div class="modal" role="alertdialog" aria-modal="true" aria-labelledby="cm-t"><h2 id="cm-t">${esc(title)}</h2><p class="muted">${esc(text)}</p><div class="acts"><button class="btn sm ghost" data-no type="button"><span>Cancel</span></button><button class="btn sm ${danger ? 'danger' : ''}" data-yes type="button"><span>${esc(ok)}</span></button></div></div>`;
    const prev = document.activeElement, done = v => { document.removeEventListener('keydown', key); bg.remove(); prev && prev.focus && prev.focus(); resolve(v); };
    const key = e => { if (e.key === 'Escape') done(false); };
    bg.addEventListener('click', e => { if (e.target === bg || e.target.closest('[data-no]')) done(false); else if (e.target.closest('[data-yes]')) done(true); });
    document.addEventListener('keydown', key); document.body.append(bg); enhance(bg); $('[data-yes]', bg).focus();
  });
}

/* ---------- API helper ---------- */
async function api(path, { method = 'GET', body, form } = {}) {
  const headers = {}; let payload;
  if (form) payload = form; else if (body) { headers['content-type'] = 'application/json'; payload = JSON.stringify(body); }
  const r = await fetch(path, { method, headers, body: payload, credentials: 'same-origin' });
  let data = null; try { data = await r.json(); } catch {}
  if (!r.ok) { const d = data && data.detail; const e = new Error(typeof d === 'string' ? d : 'Something went wrong.'); e.status = r.status; throw e; }
  return data;
}
async function signOut() { try { await api('/api/auth/logout', { method: 'POST' }); } catch {} location.href = '/'; }

/* ---------- theme ---------- */
function setTheme(t) { document.documentElement.setAttribute('data-theme', t); ls.set('t360_theme', t); $$('[data-theme-toggle]').forEach(b => b.setAttribute('aria-pressed', t === 'dark')); }
$$('[data-theme-toggle]').forEach(b => b.setAttribute('aria-pressed', document.documentElement.dataset.theme === 'dark'));

/* ---------- UTM + referrer (kept for this visit only, sent with sign-up and contact forms) ---------- */
function captureUtm() {
  if (ss.get('t360_utm')) return;
  const q = new URLSearchParams(location.search), u = {};
  ['utm_source', 'utm_medium', 'utm_campaign', 'utm_term', 'utm_content'].forEach(k => { if (q.get(k)) u[k] = q.get(k).slice(0, 120); });
  try { const ref = new URL(document.referrer); if (ref.host && ref.host !== location.host) u.referrer = ref.host; } catch {}
  u.landing = location.pathname; ss.set('t360_utm', JSON.stringify(u));
}
const utm = () => { try { return JSON.parse(ss.get('t360_utm') || '{}'); } catch { return {}; } };
captureUtm();

/* ---------- Google Analytics, only after consent and only if configured ---------- */
function loadGA() {
  const id = ($('meta[name="ga-id"]') || {}).content; if (!id || window.__gaLoaded || ls.get('t360_consent') !== 'all') return;
  window.__gaLoaded = true; window.dataLayer = window.dataLayer || []; window.gtag = function () { window.dataLayer.push(arguments); };
  const s = document.createElement('script'); s.async = true; s.src = 'https://www.googletagmanager.com/gtag/js?id=' + encodeURIComponent(id); document.head.append(s);
  gtag('js', new Date()); gtag('config', id, { anonymize_ip: true });
}

/* ---------- cookie banner ---------- */
function cookieBanner(force) {
  if (!force && ls.get('t360_consent')) { loadGA(); return; }
  const old = $('.cookie'); if (old) old.remove();
  const b = document.createElement('div'); b.className = 'cookie'; b.setAttribute('role', 'dialog'); b.setAttribute('aria-label', 'Cookie preferences');
  b.innerHTML = `<p>We use one essential cookie to keep you signed in, and remember your theme. Optional analytics run only if you accept. <a href="/cookies">Cookie policy</a></p><div class="row2"><button class="btn sm ghost" data-c="necessary" type="button"><span>Necessary only</span></button><button class="btn sm" data-c="all" type="button"><span>Accept all</span></button></div>`;
  b.addEventListener('click', e => { const c = e.target.closest('[data-c]'); if (!c) return; ls.set('t360_consent', c.dataset.c); b.classList.remove('show'); setTimeout(() => b.remove(), 600); loadGA(); });
  document.body.append(b); enhance(b); requestAnimationFrame(() => b.classList.add('show'));
}

/* ---------- search ---------- */
let index = null;
async function openSearch() {
  if ($('#searchm')) return;
  const bg = document.createElement('div'); bg.className = 'modal-bg open'; bg.id = 'searchm';
  bg.innerHTML = `<div class="modal" role="dialog" aria-modal="true" aria-label="Search the site"><div class="searchbox"><span class="ico">${IC.FaSearch || ''}</span><input id="q" type="search" placeholder="Search TRACE360…" autocomplete="off" aria-label="Search"><kbd>Esc</kbd></div><ul id="results"></ul></div>`;
  const close = () => { document.removeEventListener('keydown', key); bg.remove(); }, key = e => { if (e.key === 'Escape') close(); };
  bg.addEventListener('click', e => { if (e.target === bg || e.target.closest('#results a')) close(); }); document.addEventListener('keydown', key); document.body.append(bg);
  const q = $('#q', bg), out = $('#results', bg); q.focus();
  if (!index) { try { index = await (await fetch('/search-index.json')).json(); } catch { index = []; } }
  const draw = () => { const terms = q.value.toLowerCase().split(/\s+/).filter(Boolean);
    const hits = !terms.length ? index.slice(0, 6) : index.map(p => ({ p, s: terms.reduce((a, t) => a + (p.t.toLowerCase().includes(t) ? 5 : 0) + (p.d.toLowerCase().includes(t) ? 2 : 0) + (p.x.toLowerCase().includes(t) ? 1 : 0), 0) })).filter(h => h.s).sort((a, b) => b.s - a.s).map(h => h.p).slice(0, 8);
    out.innerHTML = hits.length ? hits.map(p => `<li><a href="${esc(p.u)}">${esc(p.t)}<small>${esc(p.d)}</small></a></li>`).join('') : '<li class="muted" style="padding:.7rem">No matches. Try “QR”, “pricing” or “privacy”.</li>'; };
  q.addEventListener('input', draw); draw();
}

/* ---------- global clicks ---------- */
document.addEventListener('click', async e => {
  const b = e.target.closest('.btn');
  if (b && !matchMedia('(prefers-reduced-motion:reduce)').matches) { const cols = ['#17301F', '#E3A21A', '#2F6B3F', '#D9731F'];
    for (let i = 0; i < 12; i++) { const p = document.createElement('i'); p.className = 'px'; const a = Math.random() * 6.28, d = 40 + Math.random() * 60;
      p.style.cssText = `left:${e.clientX - 4}px;top:${e.clientY - 4}px;background:${cols[i % 4]};--dx:${Math.cos(a) * d}px;--dy:${Math.sin(a) * d}px;--rot:${Math.random() * 360}deg;${i % 3 ? '' : 'border-radius:50%'}`; document.body.append(p); setTimeout(() => p.remove(), 800); } }
  const burger = e.target.closest('.burger');
  if (burger) { const l = $('.links'), o = l.classList.toggle('open'); burger.setAttribute('aria-expanded', o); burger.setAttribute('aria-label', o ? 'Close menu' : 'Open menu'); document.body.style.overflow = o ? 'hidden' : ''; return; }
  if (e.target.closest('.links a')) { $('.links')?.classList.remove('open'); $('.burger')?.setAttribute('aria-expanded', 'false'); document.body.style.overflow = ''; }
  if (e.target.closest('[data-theme-toggle]')) setTheme(document.documentElement.dataset.theme === 'dark' ? 'light' : 'dark');
  if (e.target.closest('[data-search]')) openSearch();
  if (e.target.closest('[data-cookie-settings]')) { e.preventDefault(); cookieBanner(true); }
  if (e.target.closest('.totop')) scrollTo({ top: 0, behavior: 'smooth' });
  const cp = e.target.closest('[data-copy]');
  if (cp) { try { await navigator.clipboard.writeText(cp.dataset.copy); toast('Copied to clipboard.'); } catch { toast('Could not copy. Select the text instead.', true); } }
  const so = e.target.closest('[data-signout]');
  if (so) { e.preventDefault(); if (await confirmModal({ title: 'Sign out?', text: 'You will need to sign in again to see your dashboard.', ok: 'Sign out' })) signOut(); }
  const cf = e.target.closest('[data-confirm]:not([data-signout])');
  if (cf && !cf.dataset.confirmed) { e.preventDefault(); e.stopImmediatePropagation(); if (await confirmModal({ title: cf.dataset.confirm, text: cf.dataset.confirmText || '', ok: cf.dataset.confirmOk || 'Confirm', danger: cf.dataset.danger === '1' })) { cf.dataset.confirmed = 1; cf.click(); delete cf.dataset.confirmed; } }
  const pw = e.target.closest('.pw-toggle');
  if (pw) { const inp = $('input', pw.parentElement), show = inp.type === 'password'; inp.type = show ? 'text' : 'password'; pw.setAttribute('aria-pressed', show); pw.setAttribute('aria-label', show ? 'Hide password' : 'Show password'); }
}, true);
document.addEventListener('keydown', e => { if ((e.key === '/' || (e.key === 'k' && (e.ctrlKey || e.metaKey))) && !/INPUT|TEXTAREA|SELECT/.test((e.target.tagName || ''))) { e.preventDefault(); openSearch(); } });

/* ---------- scroll progress + back to top ---------- */
(() => { const bar = $('#progress'), top = $('.totop'); let tick = false;
  const upd = () => { tick = false; const h = document.documentElement.scrollHeight - innerHeight, y = scrollY; if (bar) bar.style.width = (h > 0 ? y / h * 100 : 0) + '%'; if (top) top.classList.toggle('show', y > 600); };
  addEventListener('scroll', () => { if (!tick) { tick = true; requestAnimationFrame(upd); } }, { passive: true }); upd(); })();

/* ---------- password strength ---------- */
$$('input[data-strength]').forEach(inp => { const m = $('.meter i', inp.closest('.f') || document), hint = $('.hint', inp.closest('.f') || document);
  inp.addEventListener('input', () => { const v = inp.value, n = [v.length >= 8, /[a-z]/.test(v), /[A-Z]/.test(v), /\d/.test(v), /[^A-Za-z0-9]/.test(v) || v.length >= 12].filter(Boolean).length;
    if (m) { m.style.width = (v ? n * 20 : 0) + '%'; m.style.background = n < 3 ? '#C23B22' : n < 5 ? '#E3A21A' : '#2F6B3F'; }
    if (hint) hint.textContent = !v ? 'At least 8 characters with an uppercase letter, a lowercase letter and a number.' : n < 4 ? 'Keep going: add length, capitals or numbers.' : n < 5 ? 'Good. A symbol or more length makes it stronger.' : 'Strong password.'; }); });

/* ---------- forms ---------- */
$$('form[data-api]').forEach(f => f.addEventListener('submit', async ev => {
  ev.preventDefault();
  const alertEl = $('.alert.err', f), btn = $('button[type=submit]', f), data = Object.fromEntries(new FormData(f));
  const fail = m => { if (alertEl) { alertEl.textContent = m; alertEl.classList.add('show'); alertEl.focus && alertEl.focus(); } else toast(m, true); };
  alertEl && alertEl.classList.remove('show');
  if (data.confirm_password !== undefined && data.password !== data.confirm_password) { $('[name=confirm_password]', f).classList.add('bad'); return fail('The two passwords do not match.'); }
  $$('.bad', f).forEach(x => x.classList.remove('bad'));
  if (f.hasAttribute('data-utm')) data.utm = utm();
  btn.classList.add('loading'); btn.disabled = true;
  try {
    const res = await api(f.dataset.api, { method: 'POST', body: data });
    if (f.dataset.redirect) { const next = new URLSearchParams(location.search).get('next'); location.href = next && /^\/(?!\/)/.test(next) ? next : f.dataset.redirect; return; }
    const wrap = f.closest('[data-form-wrap]') || f.parentElement, ok = $('.form-success', wrap);
    if (ok) { if (res && res.email_configured === false) { const n = $('.note-noemail', ok); if (n) n.hidden = false; } f.hidden = true; ok.hidden = false; ok.focus && ok.focus(); }
    else toast('Done.');
  } catch (e) { fail(e.message); } finally { btn.classList.remove('loading'); btn.disabled = false; }
}));
const rt = $('input[name=token][data-from-url]'); if (rt) { rt.value = new URLSearchParams(location.search).get('token') || ''; if (!rt.value) { const a = $('.alert.err', rt.form); if (a) { a.textContent = 'This reset link is incomplete. Please request a new one.'; a.classList.add('show'); } } }
const vf = $('form[data-verify]'); if (vf) vf.addEventListener('submit', e => { e.preventDefault(); const t = new FormData(vf).get('t').toString().trim().split('/').filter(Boolean).pop().split(/[?#]/)[0]; const a = $('.alert.err', vf); if (!/^[\w-]{4,64}$/.test(t)) { a.textContent = 'That does not look like a TRACE360 code.'; a.classList.add('show'); return; } location.href = '/t/' + t; });

/* ---------- header sign-in state ---------- */
(async () => { const el = $('#authnav'); if (!el) return;
  try { const u = await api('/api/auth/me'); el.innerHTML = `<a class="btn sm ghost" href="/app"><span>Dashboard</span></a><button class="btn sm" data-signout type="button"><span>Sign out</span></button>`; document.body.dataset.user = u.name; enhance(el); } catch { /* signed out: keep default buttons */ } })();

/* ---------- boot ---------- */
window.T360 = { $, $$, esc, toast, enhance, api, confirm: confirmModal, signOut, ARROW, IC, utm, ls, ss };
enhance(); cookieBanner();
})();
