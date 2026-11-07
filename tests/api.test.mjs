import test from 'node:test';
import assert from 'node:assert/strict';
import { PGlite } from '@electric-sql/pglite';
process.env.TRACE360_DEV = 'true'; process.env.SEED_DEMO = 'true'; process.env.DEMO_LOGIN = 'false';
const { setQuery } = await import('../netlify/lib/db.mjs');
const pg = new PGlite(); await pg.waitReady;
setQuery(async (t, p = []) => (await pg.query(t, p)).rows);
const { default: api } = await import('../netlify/functions/api.mjs');

const call = async (method, path, { token, body, form } = {}) => {
  const headers = {}; if (token) headers.authorization = 'Bearer ' + token;
  let b; if (form) b = form; else if (body) { headers['content-type'] = 'application/json'; b = JSON.stringify(body); }
  const res = await api(new Request('http://x.test' + path, { method, headers, body: b }));
  const ct = res.headers.get('content-type') || '';
  return { status: res.status, res, data: ct.includes('json') ? await res.json() : null };
};
const reg = async (email, org) => (await call('POST', '/api/auth/register', { body: { organisation: org, name: 'Boss', email, password: 'Passw0rd!x' } })).data.token;

test('config + demo public page + QR + SPA-safe 404', async () => {
  const cfg = (await call('GET', '/api/config')).data;
  assert.equal(cfg.contact_email, 'devprakashsahu348@gmail.com'); assert.ok(cfg.demo_token); assert.equal(cfg.demo_login, false);
  const pub = (await call('GET', '/api/public/' + cfg.demo_token)).data;
  assert.equal(pub.batch_code, 'TEA-DEMO-001'); assert.equal(pub.record_status, 'complete');
  const qr = await call('GET', `/api/qr/${cfg.demo_token}.svg`);
  assert.match(qr.res.headers.get('content-type'), /svg/);
  assert.equal((await call('GET', '/api/nope')).status, 404);
  const honey = (await call('GET', '/api/public/demo-honey-002')).data;
  assert.equal(honey.record_status, 'needs_review');
});

test('full producer journey, privacy and evidence', async () => {
  const t = await reg('boss@example.com', 'Acme Tea');
  const p = (await call('POST', '/api/products', { token: t, body: { name: 'Tea', category: 'Tea' } })).data;
  let b = (await call('POST', '/api/batches', { token: t, body: { product_id: p.id, batch_code: 'tea-1', production_date: '2026-10-20', origin: 'Hills', quantity: 10 } })).data;
  assert.equal(b.batch_code, 'TEA-1'); assert.equal(b.status, 'in_progress');
  assert.equal((await call('POST', '/api/batches', { token: t, body: { product_id: p.id, batch_code: 'TEA-1', production_date: '2026-10-20' } })).status, 409);
  for (const [type, d] of [['production', '2026-10-20'], ['quality', '2026-10-21'], ['packing', '2026-10-22'], ['dispatch', '2026-10-24']])
    b = (await call('POST', `/api/batches/${b.id}/events`, { token: t, body: { event_type: type, event_time: d } })).data;
  assert.equal(b.status, 'needs_review');
  const q = b.events.find(e => e.event_type === 'quality');
  const fd = new FormData(); fd.append('file', new File([Buffer.from('%PDF-1.4 hi')], 'q.pdf', { type: 'application/pdf' })); fd.append('visibility', 'private');
  b = (await call('POST', `/api/events/${q.id}/evidence`, { token: t, form: fd })).data;
  assert.equal(b.status, 'complete');
  const bad = new FormData(); bad.append('file', new File([Buffer.from('MZ....')], 'x.exe'));
  assert.equal((await call('POST', `/api/events/${q.id}/evidence`, { token: t, form: bad })).status, 415);
  assert.equal((await call('GET', '/api/public/' + b.public_token)).status, 404); // unpublished
  await call('PATCH', `/api/batches/${b.id}/publish`, { token: t, body: { published: true, public_fields: { quantity: false } } });
  const pub = (await call('GET', '/api/public/' + b.public_token)).data;
  assert.equal(pub.product, 'Tea'); assert.ok(!('quantity' in pub)); assert.ok(!('notes' in pub.events[0]));
  const file = await call('GET', `/api/evidence/${q.evidence?.[0]?.id ?? b.events.find(e => e.event_type === 'quality').evidence[0].id}/file`, { token: t });
  assert.equal(file.status, 200);
});

test('rules, roles and organisation isolation', async () => {
  const a = await reg('a@example.com', 'Org A'), b2 = await reg('b@example.com', 'Org B');
  const p = (await call('POST', '/api/products', { token: a, body: { name: 'Honey' } })).data;
  let b = (await call('POST', '/api/batches', { token: a, body: { product_id: p.id, batch_code: 'H1', production_date: '2026-10-10' } })).data;
  assert.equal((await call('GET', `/api/batches/${b.id}`, { token: b2 })).status, 404);
  await call('POST', `/api/batches/${b.id}/events`, { token: a, body: { event_type: 'production', event_time: '2026-10-10' } });
  b = (await call('POST', `/api/batches/${b.id}/events`, { token: a, body: { event_type: 'dispatch', event_time: '2026-10-09' } })).data;
  const codes = b.flags.map(f => f.code);
  assert.ok(codes.includes('dispatch_before_production') && codes.includes('missing_packing'));
  await call('POST', '/api/team', { token: a, body: { name: 'Dist', email: 'd@example.com', password: 'Passw0rd!x', role: 'distributor' } });
  const dt = (await call('POST', '/api/auth/login', { body: { email: 'd@example.com', password: 'Passw0rd!x' } })).data.token;
  assert.equal((await call('POST', `/api/batches/${b.id}/events`, { token: dt, body: { event_type: 'production', event_time: '2026-10-10' } })).status, 403);
  assert.equal((await call('GET', '/api/team', { token: dt })).status, 403);
  assert.equal((await call('GET', '/api/team')).status, 401);
  // correction keeps history
  const prod = b.events.find(e => e.event_type === 'production');
  b = (await call('POST', `/api/batches/${b.id}/events`, { token: a, body: { event_type: 'production', event_time: '2026-10-08', corrects_id: prod.id } })).data;
  assert.equal(b.events.find(e => e.id === prod.id).superseded, true);
  assert.equal((await call('POST', '/api/auth/login', { body: { email: 'a@example.com', password: 'wrong-password' } })).status, 401);
});
