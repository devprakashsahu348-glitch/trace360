import test from 'node:test';
import assert from 'node:assert/strict';
import { createHmac } from 'node:crypto';
import { PGlite } from '@electric-sql/pglite';
Object.assign(process.env, { TRACE360_DEV: 'true', SEED_DEMO: 'true', DEMO_LOGIN: 'false', BCRYPT_ROUNDS: '4', RAZORPAY_KEY_ID: 'rzp_test_key', RAZORPAY_KEY_SECRET: 'test_secret' });
const { setQuery, query } = await import('../server/lib/db.mjs');
const pg = new PGlite(); await pg.waitReady;
setQuery(async (t, p = []) => (await pg.query(t, p)).rows);
const { default: api } = await import('../server/api.mjs');

const mails = []; globalThis.__t360Mailer = async m => { mails.push(m); return true; };
const realFetch = globalThis.fetch;
globalThis.fetch = async (url, init) => String(url).startsWith('https://api.razorpay.com/') ? new Response(JSON.stringify({ id: 'order_TEST' + Math.random().toString(36).slice(2, 8) }), { status: 200 }) : realFetch(url, init);

let ipN = 0;
const call = async (method, path, { cookie, body, form, headers = {}, ip } = {}) => {
  const h = { 'x-forwarded-for': ip || `10.0.0.${++ipN}`, ...headers }; if (cookie) h.cookie = cookie;
  let b; if (form) b = form; else if (body) { h['content-type'] = 'application/json'; b = JSON.stringify(body); }
  const res = await api(new Request('http://x.test' + path, { method, headers: h, body: b }));
  const ct = res.headers.get('content-type') || '';
  const sc = res.headers.get('set-cookie') || '';
  return { status: res.status, res, setCookie: sc, cookie: sc.split(';')[0], data: ct.includes('json') ? await res.json() : null };
};
const GOOD = 'Passw0rdXx';
const signup = async (email, org = 'Acme Tea', pw = GOOD) => call('POST', '/api/auth/register', { body: { organisation: org, name: 'Boss', email, password: pw, confirm_password: pw } });

test('signup validation, cookie session, logout', async () => {
  assert.equal((await signup('a@example.com', 'X', 'short')).status, 422);
  assert.equal((await signup('a@example.com', 'Org', 'alllowercase1')).status, 422); // no uppercase
  assert.equal((await call('POST', '/api/auth/register', { body: { organisation: 'Org', name: 'Boss', email: 'bad-email', password: GOOD, confirm_password: GOOD } })).status, 422);
  const mism = await call('POST', '/api/auth/register', { body: { organisation: 'Org', name: 'Boss', email: 'm@example.com', password: GOOD, confirm_password: 'Different1' } });
  assert.equal(mism.status, 422); assert.match(mism.data.detail, /match/);
  const ok = await signup('boss@example.com');
  assert.equal(ok.status, 200); assert.ok(!('token' in ok.data));
  assert.match(ok.setCookie, /HttpOnly/); assert.match(ok.setCookie, /SameSite=Lax/);
  assert.equal((await signup('boss@example.com')).status, 409); // duplicate email
  const me = await call('GET', '/api/auth/me', { cookie: ok.cookie });
  assert.equal(me.status, 200); assert.equal(me.data.role, 'admin'); assert.equal(me.data.plan, 'pilot');
  assert.equal((await call('GET', '/api/auth/me')).status, 401);
  const out = await call('POST', '/api/auth/logout', { cookie: ok.cookie });
  assert.match(out.setCookie, /Max-Age=0/);
  const stored = (await query('select password_hash from users where email=$1', ['boss@example.com']))[0].password_hash;
  assert.match(stored, /^\$2[aby]\$/); assert.ok(!stored.includes(GOOD)); // bcrypt, never plain text
  // cross-site writes are refused
  assert.equal((await call('POST', '/api/products', { cookie: ok.cookie, body: { name: 'Tea' }, headers: { origin: 'https://evil.example' } })).status, 403);
});

test('login errors and rate limiting', async () => {
  await signup('login@example.com');
  assert.equal((await call('POST', '/api/auth/login', { body: { email: 'login@example.com', password: 'WrongPass1' } })).status, 401);
  assert.equal((await call('POST', '/api/auth/login', { body: { email: 'nobody@example.com', password: GOOD } })).status, 401);
  const good = await call('POST', '/api/auth/login', { body: { email: 'login@example.com', password: GOOD } });
  assert.equal(good.status, 200); assert.ok(good.cookie.startsWith('t360='));
  let last; for (let i = 0; i < 9; i++) last = await call('POST', '/api/auth/login', { body: { email: 'victim@example.com', password: 'WrongPass1' } });
  assert.equal(last.status, 429);
});

test('forgot password: link works once, expires, never reveals accounts', async () => {
  await signup('reset@example.com');
  mails.length = 0;
  const unknown = await call('POST', '/api/auth/forgot', { body: { email: 'ghost@example.com' } });
  assert.equal(unknown.status, 200); assert.equal(mails.length, 0);
  const f = await call('POST', '/api/auth/forgot', { body: { email: 'reset@example.com' } });
  assert.equal(f.status, 200); assert.equal(mails.length, 1);
  const token = /token=([\w-]+)/.exec(mails[0].text)[1];
  assert.equal((await call('POST', '/api/auth/reset', { body: { token, password: 'NewPassw0rd', confirm_password: 'Other1234x' } })).status, 422);
  assert.equal((await call('POST', '/api/auth/reset', { body: { token: 'bogus', password: 'NewPassw0rd', confirm_password: 'NewPassw0rd' } })).status, 400);
  assert.equal((await call('POST', '/api/auth/reset', { body: { token, password: 'NewPassw0rd', confirm_password: 'NewPassw0rd' } })).status, 200);
  assert.equal((await call('POST', '/api/auth/reset', { body: { token, password: 'Another1Pass', confirm_password: 'Another1Pass' } })).status, 400); // single use
  assert.equal((await call('POST', '/api/auth/login', { body: { email: 'reset@example.com', password: GOOD } })).status, 401);
  assert.equal((await call('POST', '/api/auth/login', { body: { email: 'reset@example.com', password: 'NewPassw0rd' } })).status, 200);
  // expiry
  await call('POST', '/api/auth/forgot', { body: { email: 'reset@example.com' } });
  const t2 = /token=([\w-]+)/.exec(mails.at(-1).text)[1];
  await query('update password_resets set expires_at = expires_at - 7200 where used_at is null');
  assert.equal((await call('POST', '/api/auth/reset', { body: { token: t2, password: 'Another1Pass', confirm_password: 'Another1Pass' } })).status, 400);
  const raw = (await query('select token_hash from password_resets order by id desc limit 1'))[0].token_hash;
  assert.notEqual(raw, t2); // only a hash is stored
});

test('config, demo page, QR', async () => {
  const cfg = (await call('GET', '/api/config')).data;
  assert.equal(cfg.contact_email, 'devprakashsahu348@gmail.com'); assert.ok(cfg.demo_token); assert.equal(cfg.payments, true);
  const pub = (await call('GET', '/api/public/' + cfg.demo_token)).data;
  assert.equal(pub.batch_code, 'TEA-DEMO-001'); assert.equal(pub.record_status, 'complete');
  assert.match((await call('GET', `/api/qr/${cfg.demo_token}.svg`)).res.headers.get('content-type'), /svg/);
  assert.equal((await call('GET', '/api/nope')).status, 404);
  assert.equal((await call('GET', '/api/public/demo-honey-002')).data.record_status, 'needs_review');
});

test('producer journey, privacy, evidence, roles, isolation', async () => {
  const c = (await signup('prod@example.com', 'Prod Org')).cookie, c2 = (await signup('other@example.com', 'Other Org')).cookie;
  const p = (await call('POST', '/api/products', { cookie: c, body: { name: 'Tea', category: 'Tea' } })).data;
  let b = (await call('POST', '/api/batches', { cookie: c, body: { product_id: p.id, batch_code: 'tea-1', production_date: '2026-10-20', quantity: 10 } })).data;
  assert.equal(b.batch_code, 'TEA-1');
  assert.equal((await call('GET', `/api/batches/${b.id}`, { cookie: c2 })).status, 404);
  for (const [t, d] of [['production', '2026-10-20'], ['quality', '2026-10-21'], ['packing', '2026-10-22'], ['dispatch', '2026-10-24']])
    b = (await call('POST', `/api/batches/${b.id}/events`, { cookie: c, body: { event_type: t, event_time: d } })).data;
  assert.equal(b.status, 'needs_review');
  const q = b.events.find(e => e.event_type === 'quality');
  const fd = new FormData(); fd.append('file', new File([Buffer.from('%PDF-1.4 hi')], 'q.pdf')); fd.append('visibility', 'private');
  b = (await call('POST', `/api/events/${q.id}/evidence`, { cookie: c, form: fd })).data;
  assert.equal(b.status, 'complete');
  const bad = new FormData(); bad.append('file', new File([Buffer.from('MZ....')], 'x.exe'));
  assert.equal((await call('POST', `/api/events/${q.id}/evidence`, { cookie: c, form: bad })).status, 415);
  assert.equal((await call('GET', '/api/public/' + b.public_token)).status, 404);
  await call('PATCH', `/api/batches/${b.id}/publish`, { cookie: c, body: { published: true, public_fields: { quantity: false } } });
  const pub = (await call('GET', '/api/public/' + b.public_token)).data;
  assert.ok(!('quantity' in pub) && !('notes' in pub.events[0]));
  // role limits + dated-before-production rule
  await call('POST', '/api/team', { cookie: c, body: { name: 'Dist', email: 'd@example.com', password: GOOD, role: 'distributor' } });
  const dc = (await call('POST', '/api/auth/login', { body: { email: 'd@example.com', password: GOOD } })).cookie;
  assert.equal((await call('POST', `/api/batches/${b.id}/events`, { cookie: dc, body: { event_type: 'production', event_time: '2026-10-10' } })).status, 403);
  assert.equal((await call('GET', '/api/team', { cookie: dc })).status, 403);
  const b2 = (await call('POST', `/api/batches/${b.id}/events`, { cookie: c, body: { event_type: 'dispatch', event_time: '2026-10-01', corrects_id: b.events.find(e => e.event_type === 'dispatch').id } })).data;
  assert.ok(b2.flags.some(f => f.code === 'dispatch_before_production'));
  assert.equal(b2.events.find(e => e.event_type === 'dispatch' && e.superseded).superseded, true);
});

test('contact form stores lead (with UTM) and emails the owner', async () => {
  mails.length = 0;
  assert.equal((await call('POST', '/api/leads', { body: { name: 'A', email: 'x@y.com', message: 'hello there friend' } })).status, 422);
  const r = await call('POST', '/api/leads', { body: { name: 'Asha Rao', email: 'asha@example.com', subject: 'Pilot', message: 'We make honey and want a pilot.', utm: { utm_source: 'whatsapp', utm_campaign: 'launch' } } });
  assert.equal(r.status, 200); assert.equal(mails.at(-1).to, 'devprakashsahu348@gmail.com');
  const row = (await query('select utm from leads order by id desc limit 1'))[0];
  assert.match(row.utm, /whatsapp/);
});

test('payments: order, signature verification, plan activation', async () => {
  const c = (await signup('pay@example.com', 'Pay Org')).cookie;
  assert.equal((await call('POST', '/api/payments/order', { cookie: c, body: { plan: 'platinum' } })).status, 422);
  const o = (await call('POST', '/api/payments/order', { cookie: c, body: { plan: 'growth' } })).data;
  assert.equal(o.amount, 199900); assert.equal(o.currency, 'INR'); assert.ok(o.order_id.startsWith('order_'));
  const pid = 'pay_TEST123';
  const bad = await call('POST', '/api/payments/verify', { cookie: c, body: { razorpay_order_id: o.order_id, razorpay_payment_id: pid, razorpay_signature: 'f'.repeat(64) } });
  assert.equal(bad.status, 400);
  const sig = createHmac('sha256', 'test_secret').update(`${o.order_id}|${pid}`).digest('hex');
  assert.equal((await call('POST', '/api/payments/verify', { cookie: c, body: { razorpay_order_id: o.order_id, razorpay_payment_id: pid, razorpay_signature: sig } })).status, 200);
  assert.equal((await call('POST', '/api/payments/verify', { cookie: c, body: { razorpay_order_id: o.order_id, razorpay_payment_id: pid, razorpay_signature: sig } })).data.already, true);
  const bill = (await call('GET', '/api/billing', { cookie: c })).data;
  assert.equal(bill.plan, 'growth'); assert.ok(bill.plan_until); assert.equal(bill.history[0].status, 'paid');
  const other = (await signup('pay2@example.com', 'Pay Org 2')).cookie; // cannot confirm someone else's order
  assert.equal((await call('POST', '/api/payments/verify', { cookie: other, body: { razorpay_order_id: o.order_id, razorpay_payment_id: pid, razorpay_signature: sig } })).status, 404);
});
