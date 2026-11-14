/* TRACE360 workspace + public trace page. Dependency-free. All user text goes through esc() before touching innerHTML. */
(() => {
'use strict';
const { $, $$, esc, toast, ARROW } = window.T360;
const S = { user: null, cfg: { contact_email: '', owner: '', year: new Date().getFullYear() } };
const LABELS = { entered: 'Business-entered', document: 'Document attached', reviewed: 'Reviewed by business' };
const STATUS = { complete: 'Complete', needs_review: 'Needs review', in_progress: 'In progress' };
const TYPES = ['production', 'quality', 'packing', 'dispatch', 'receipt', 'storage'];
const PUBLIC_FIELDS = { origin: 'Origin', production_date: 'Production date', organisation: 'Producer name', quantity: 'Batch quantity', locations: 'Event locations', notes: 'Event notes', evidence: 'Documents marked public' };
const fmt = iso => { const d = new Date(iso); if (isNaN(d)) return ''; const t = d.getHours() || d.getMinutes();
  return d.toLocaleDateString('en-IN', { day: 'numeric', month: 'short', year: 'numeric' }) + (t ? ', ' + d.toLocaleTimeString('en-IN', { hour: '2-digit', minute: '2-digit' }) : ''); };
const mail = () => `<a href="mailto:${esc(S.cfg.contact_email)}">${esc(S.cfg.contact_email)}</a>`;

async function api(path, opts) {
  try { return await T360.api(path, opts); }
  catch (e) { if (e.status === 401 && S.user) { location.href = '/login?next=' + encodeURIComponent('/app'); } throw e; }
}
async function openFile(url) { // private file -> blob -> new tab (uses the session cookie)
  try { const r = await fetch(url, { credentials: 'same-origin' }); if (!r.ok) throw 0; window.open(URL.createObjectURL(await r.blob()), '_blank', 'noopener'); }
  catch { toast('Could not open the file.', true); }
}
document.addEventListener('click', e => { const f = e.target.closest('[data-file]'); if (f) { e.preventDefault(); openFile(f.dataset.file); } });
function page(html) { const a = $('#app'); a.innerHTML = html; scrollTo(0, 0); window.T360.enhance(a); }
const loading = () => { $('#app').innerHTML = '<div class="wrap"><div class="skeleton" style="width:40%;height:2.4rem;margin-top:2rem"></div><div class="skeleton" style="width:70%"></div><div class="skeleton"></div><div class="spin" role="status" aria-label="Loading"></div></div>'; };
function bindForm(sel, fn) {
  const f = $(sel); if (!f) return;
  f.addEventListener('submit', async ev => {
    ev.preventDefault(); const err = $('.err', f), btn = $('button[type=submit]', f); if (err) err.textContent = ''; if (btn) { btn.disabled = true; btn.classList.add('loading'); }
    try { await fn(Object.fromEntries(new FormData(f)), f); } catch (e) { if (err) err.textContent = e.message; else toast(e.message, true); } finally { if (btn) { btn.disabled = false; btn.classList.remove('loading'); } }
  });
}
const pill = s => `<span class="pill ${s}">${STATUS[s] || s}</span>`;

/* ---------- APP: dashboard / batches / products / team ---------- */
const tabs = cur => `<div class="tabs">${[['dashboard', 'Overview'], ['batches', 'Batches'], ['products', 'Products'], ['billing', 'Billing']].concat(S.user.role === 'admin' ? [['team', 'Team & audit']] : []).map(([h, t]) => `<a class="${cur === h ? 'on' : ''}" href="#/${h}">${t}</a>`).join('')}</div>`;
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
  const nextType = TYPES.find(t => allowed.includes(t) && !active.some(e => e.event_type === t)) || TYPES.find(t => allowed.includes(t));
  const li = e => `<li class="${e.superseded ? 'old' : ''}"><h3>${esc(e.event_type)}</h3><div><span class="chip ${e.label}">${LABELS[e.label]}</span>${e.corrects_id ? '<span class="chip entered">Correction</span>' : ''}${e.superseded ? '<span class="chip entered">Superseded</span>' : ''}</div>
    <div class="meta">${fmt(e.event_time)}${e.location_text ? ' · ' + esc(e.location_text) : ''} · recorded by ${esc(e.created_by)}</div>${e.notes ? `<p style="margin:.3rem 0">${esc(e.notes)}</p>` : ''}
    <div class="ev">${e.evidence.map(x => `<a href="#" data-file="/api/evidence/${x.id}/file">📎 ${esc(x.name)}</a> <span class="chip ${x.visibility === 'public' ? 'reviewed' : 'entered'}">${x.visibility}</span> `).join('')}</div>
    ${e.superseded ? '' : `<div class="actions" style="justify-content:flex-start;margin-top:.4rem"><label class="btn sm ghost" style="margin:0;cursor:pointer"><span>Attach document</span><input type="file" class="up" data-eid="${e.id}" accept="application/pdf,image/png,image/jpeg" hidden></label>
    <label class="check" style="font-size:.85rem"><input type="checkbox" class="upv"> public</label>${canPub && e.label !== 'reviewed' ? `<button class="btn sm ghost rev" data-eid="${e.id}" type="button"><span>Mark reviewed</span></button>` : ''}</div>`}</li>`;
  page(`<div class="shell"><div class="wrap"><a href="#/batches">← All batches</a><h1 style="margin-top:.6rem">${esc(b.batch_code)} ${pill(b.status)}</h1><p class="muted">${esc(b.product)} · produced ${esc(b.production_date)}${b.origin ? ' · ' + esc(b.origin) : ''} · ${esc(b.quantity)} ${esc(b.unit)}${b.is_demo ? ' · <b>DEMO DATA</b>' : ''}</p>
  <div class="split"><div>
   ${b.flags.length ? `<div class="card" style="margin-bottom:1.2rem"><h3>Record checks</h3>${b.flags.map(f => `<div class="flag ${f.severity}"><span>${f.severity === 'warning' ? '🚩' : '⏳'}</span><span>${esc(f.message)}</span></div>`).join('')}<p class="muted" style="font-size:.85rem;margin:0">Prompts for review — not proof of wrongdoing.</p></div>` : '<div class="card" style="margin-bottom:1.2rem"><h3>Record checks</h3><p style="margin:0">✅ All required steps are recorded and consistent.</p></div>'}
   <div class="card"><h3>Journey</h3>${b.events.length ? `<ol class="tl">${b.events.map(li).join('')}</ol>` : '<div class="empty">No events yet. Record the first one below.</div>'}</div>
   ${allowed.length ? `<form id="ef" class="card mt"><h3>Add an event</h3><div class="row"><div class="f"><label for="et">Type</label><select id="et" name="event_type">${TYPES.filter(t => allowed.includes(t)).map(t => `<option${t === nextType ? ' selected' : ''}>${t}</option>`).join('')}</select></div><div class="f"><label for="ed">Date &amp; time</label><input id="ed" name="event_time" type="datetime-local" required></div></div>
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
  bindForm('#pf2', async (d, f) => { if (b.published && !d.published && !(await T360.confirm({ title: 'Unpublish this batch?', text: 'The QR code will stop showing the journey until you publish it again.', ok: 'Unpublish', danger: true }))) return; const pf = {}; Object.keys(PUBLIC_FIELDS).forEach(k => pf[k] = !!d['f_' + k]); draw(await api(`/api/batches/${b.id}/publish`, { method: 'PATCH', body: { published: !!d.published, public_fields: pf } })); toast('Settings saved.'); });
  $$('.up').forEach(inp => inp.addEventListener('change', async () => { if (!inp.files[0]) return; const fd = new FormData(); fd.append('file', inp.files[0]); fd.append('visibility', inp.closest('li').querySelector('.upv').checked ? 'public' : 'private');
    try { draw(await api(`/api/events/${inp.dataset.eid}/evidence`, { method: 'POST', form: fd })); toast('Document attached.'); } catch (e) { toast(e.message, true); } }));
  $$('.rev').forEach(bt => bt.addEventListener('click', async () => { if (!(await T360.confirm({ title: 'Mark this step as reviewed?', text: 'The public page will show it as reviewed by your business.', ok: 'Mark reviewed' }))) return; try { draw(await api(`/api/events/${bt.dataset.eid}/review`, { method: 'POST' })); toast('Marked as reviewed.'); } catch (e) { toast(e.message, true); } }));
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
  $$('.tg').forEach(b => b.addEventListener('click', async () => { if (b.dataset.a === '0' && !(await T360.confirm({ title: 'Deactivate this member?', text: 'They will be signed out and unable to sign in until you activate them again.', ok: 'Deactivate', danger: true }))) return; try { await api('/api/team/' + b.dataset.id, { method: 'PATCH', body: { active: b.dataset.a === '1' } }); team(); } catch (e) { toast(e.message, true); } }));
}


/* ---------- BILLING ---------- */
const inr = paise => '₹' + (paise / 100).toLocaleString('en-IN');
async function billing() {
  loading(); const d = await api('/api/billing'), admin = S.user.role === 'admin';
  page(`<div class="shell"><div class="wrap"><h1>Billing</h1>${tabs('billing')}<div class="split"><div>
  <div class="card"><h3>Your plan</h3><p style="margin:0"><b style="font-size:1.5rem;text-transform:capitalize">${esc(d.plan)}</b> <span class="muted">${d.plan_until ? 'active until ' + esc(fmt(d.plan_until)) : 'pilot access, no payment needed yet'}</span></p></div>
  ${admin ? `<div class="card mt"><h3>Payment history</h3>${d.history.length ? `<div class="scroll"><table><thead><tr><th>Date</th><th>Plan</th><th>Amount</th><th>Status</th></tr></thead><tbody>${d.history.map(h => `<tr><td>${esc(fmt(h.paid_at || h.created_at))}</td><td style="text-transform:capitalize">${esc(h.plan)}</td><td>${inr(h.amount)}</td><td>${h.status === 'paid' ? '<span class="pill live">Paid</span>' : '<span class="pill off">Not completed</span>'}</td></tr>`).join('')}</tbody></table></div>` : '<p class="muted">No payments yet.</p>'}</div>` : ''}</div>
  <div class="card"><h3>Choose a plan</h3>${!admin ? '<p class="muted">Only an organisation admin can pay.</p>' : d.enabled ? d.plans.map(p => `<div class="row" style="align-items:center;margin-bottom:.8rem"><div><b>${esc(p.name)}</b><br><span class="muted">${inr(p.amount)} for 30 days</span></div><div style="text-align:right"><button class="btn sm pay" data-plan="${esc(p.id)}" type="button"><span>Pay ${inr(p.amount)}</span></button></div></div>`).join('') : '<p class="muted">Online payments are not switched on yet. <a href="/contact">Contact us</a> to arrange payment.</p>'}
  <p class="muted" style="font-size:.85rem;margin-bottom:0">Processed securely by Razorpay. Plans do not renew automatically. See the <a href="/payment-terms">payment terms</a>.</p></div></div></div></div>`);
  $$('.pay').forEach(b => b.addEventListener('click', () => pay(b.dataset.plan, b)));
}
async function loadRazorpay() {
  if (window.Razorpay) return;
  await new Promise((res, rej) => { const s = document.createElement('script'); s.src = 'https://checkout.razorpay.com/v1/checkout.js'; s.onload = res; s.onerror = () => rej(new Error('Could not load the payment window. Check your connection and try again.')); document.head.append(s); });
}
async function pay(plan, btn) {
  btn.classList.add('loading');
  try {
    const o = await api('/api/payments/order', { method: 'POST', body: { plan } }); await loadRazorpay();
    const rz = new window.Razorpay({ key: o.key_id, amount: o.amount, currency: o.currency, name: 'TRACE360', description: `${o.plan} plan, 30 days`, order_id: o.order_id, prefill: { name: o.name, email: o.email }, theme: { color: '#2F6B3F' },
      handler: async r => { try { await api('/api/payments/verify', { method: 'POST', body: r }); toast('Payment received. Your plan is active.'); billing(); } catch (e) { toast(e.message, true); } },
      modal: { ondismiss: () => btn.classList.remove('loading') } });
    rz.on('payment.failed', r => { toast((r.error && r.error.description) || 'The payment failed. You were not charged.', true); btn.classList.remove('loading'); });
    rz.open();
  } catch (e) { toast(e.message, true); btn.classList.remove('loading'); }
}
function notFound() { page(`<section class="s center"><div class="wrap"><h1>Lost the trail.</h1><p class="lead" style="margin-inline:auto">We could not find that page.</p><a class="btn" href="#/dashboard"><span>Back to dashboard</span>${ARROW}</a></div></section>`); }

/* ---------- PUBLIC TRACE PAGE (/t/:token) ---------- */
async function trace(token) {
  $('#app').innerHTML = '<div class="spin" role="status" aria-label="Loading"></div>';
  let d; try { d = await (await fetch('/api/public/' + encodeURIComponent(token))).json().then(j => { if (j.detail) throw new Error(j.detail); return j; }); }
  catch (e) { page(`<section class="s center"><div class="wrap"><span class="eyebrow">Trace page</span><h1>No journey to show.</h1><p class="lead" style="margin-inline:auto">${esc(e.message)}</p><a class="btn" href="#/verify"><span>Try another code</span>${ARROW}</a></div></section>`, ''); return; }
  document.title = `${d.product} · ${d.batch_code} journey | TRACE360`;
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
async function route() {
  try {
    const t = location.pathname.match(/^\/t\/([\w-]+)\/?$/); if (t) return trace(t[1]);
    if (!S.user) { location.href = '/login?next=' + encodeURIComponent('/app' + location.hash); return; }
    const seg = (location.hash || '#/dashboard').replace(/^#\/?/, '').split('/').filter(Boolean), r = seg[0] || 'dashboard';
    if (r === 'dashboard') return await dashboard();
    if (r === 'products') return await products();
    if (r === 'team') return await team();
    if (r === 'billing') return await billing();
    if (r === 'batches') { if (seg[1] === 'new') return await batchNew(); if (/^\d+$/.test(seg[1] || '')) return await batchDetail(+seg[1]); return await batches(); }
    notFound();
  } catch (e) { toast(e.message || 'Something went wrong.', true); }
}
addEventListener('hashchange', route);
(async () => {
  try { S.cfg = await T360.api('/api/config'); } catch {}
  if (!/^\/t\//.test(location.pathname)) { try { S.user = await T360.api('/api/auth/me'); } catch { S.user = null; } }
  route();
})();
})();
