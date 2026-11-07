// TRACE360 API — one Netlify Function serving every /api/* route. Data lives in Neon Postgres.
import QRCode from 'qrcode';
import { timingSafeEqual } from 'node:crypto';
import { HttpError, json, env, flag, nowIso, str, email, password, oneOf, isoDate, isoTime } from '../lib/util.mjs';
import { query, one, insert, audit, ensureReady } from '../lib/db.mjs';
import { hashPassword, verifyPassword, makeToken, readToken, rateLimit } from '../lib/auth.mjs';
import { EVENT_TYPES, ROLE_EVENTS, activeEvents, analyse, eventLabel, supersededIds } from '../lib/rules.mjs';

const DEFAULT_PUBLIC = { origin: true, production_date: true, organisation: true, quantity: false, locations: false, notes: false, evidence: false };
const ROLES = ['admin', 'operator', 'quality', 'distributor'];
const MAGIC = [[[0x25, 0x50, 0x44, 0x46], 'application/pdf'], [[0x89, 0x50, 0x4e, 0x47], 'image/png'], [[0xff, 0xd8, 0xff], 'image/jpeg']];
const maxUpload = () => Number(env('MAX_UPLOAD_MB', '4')) * 1024 * 1024;

// ---------- helpers ----------
const needRole = (u, ...roles) => { if (!roles.includes(u.role)) throw new HttpError(403, 'Your role does not allow this action.'); };
const userOut = u => ({ id: u.id, name: u.name, email: u.email, role: u.role, active: u.active, organisation: u.organisation, organisation_id: u.organisation_id, allowed_events: [...ROLE_EVENTS[u.role]].sort() });
const baseUrl = req => env('PUBLIC_BASE_URL').replace(/\/$/, '') || new URL(req.url).origin;
const parseFields = s => { try { return { ...DEFAULT_PUBLIC, ...JSON.parse(s || '{}') }; } catch { return { ...DEFAULT_PUBLIC }; } };
const body = async req => { try { const b = await req.json(); return b && typeof b === 'object' ? b : {}; } catch { return {}; } };

async function authUser(req) {
  const h = req.headers.get('authorization') || '';
  const sub = readToken(h.startsWith('Bearer ') ? h.slice(7) : '');
  if (!sub) throw new HttpError(401, h ? 'Your session expired. Please sign in again.' : 'Please sign in.');
  const u = await one('select u.*, o.name as organisation from users u join organisations o on o.id=u.organisation_id where u.id=$1', [sub]);
  if (!u || !u.active) throw new HttpError(401, 'Account not available.');
  return u;
}

async function loadBatches(orgId, { id, token } = {}) {
  const params = [], where = [];
  if (token) { params.push(token); where.push(`b.public_token=$${params.length}`); }
  else { params.push(orgId); where.push(`b.organisation_id=$${params.length}`); if (id) { params.push(id); where.push(`b.id=$${params.length}`); } }
  const batches = await query(`select b.*, p.name as product, p.category as category from batches b join products p on p.id=b.product_id where ${where.join(' and ')} order by b.id desc`, params);
  if (!batches.length) return [];
  const evs = await query('select e.*, u.name as author from events e left join users u on u.id=e.created_by where e.batch_id = any($1::int[]) order by e.event_time, e.id', [batches.map(b => b.id)]);
  const evi = evs.length ? await query('select id, event_id, original_name, file_type, size, visibility from evidence where event_id = any($1::int[]) order by id', [evs.map(e => e.id)]) : [];
  for (const e of evs) e.evidence = evi.filter(x => x.event_id === e.id);
  for (const b of batches) { b.events = evs.filter(e => e.batch_id === b.id); b.public_fields = parseFields(b.public_fields); }
  return batches;
}
async function getBatch(user, id) {
  const [b] = await loadBatches(user.organisation_id, { id });
  if (!b) throw new HttpError(404, 'Batch not found.');
  return b;
}
function batchOut(b, full = true) {
  const { status, flags } = analyse(b, b.events), gone = supersededIds(b.events);
  const out = { id: b.id, batch_code: b.batch_code, product_id: b.product_id, product: b.product, category: b.category, origin: b.origin, production_date: b.production_date,
    quantity: b.quantity, unit: b.unit, published: b.published, public_token: b.public_token, public_fields: b.public_fields, scan_count: b.scan_count, status,
    flag_count: flags.filter(f => f.severity === 'warning').length, event_count: activeEvents(b.events).length, created_at: b.created_at, is_demo: b.is_demo };
  if (full) {
    out.flags = flags;
    out.events = b.events.map(e => ({ id: e.id, event_type: e.event_type, event_time: e.event_time, location_text: e.location_text, notes: e.notes, corrects_id: e.corrects_id,
      superseded: gone.has(e.id), label: eventLabel(e), created_by: e.author || '', created_at: e.created_at,
      evidence: e.evidence.map(x => ({ id: x.id, name: x.original_name, type: x.file_type, size: x.size, visibility: x.visibility })) }));
  }
  return out;
}
async function getEvent(user, id) {
  const e = await one('select e.*, b.organisation_id from events e join batches b on b.id=e.batch_id where e.id=$1', [id]);
  if (!e || e.organisation_id !== user.organisation_id) throw new HttpError(404, 'Event not found.');
  return e;
}
const fileResponse = x => new Response(Buffer.from(x.data, 'base64'), { headers: { 'content-type': x.file_type, 'content-disposition': `inline; filename="${String(x.original_name).replace(/[^\w. -]/g, '_')}"`, 'x-content-type-options': 'nosniff', 'cache-control': 'private, max-age=300' } });

// ---------- routes ----------
const routes = [];
const route = (method, path, handler, auth = true) => routes.push({ method, re: new RegExp(`^${path.replace(/:(\w+)/g, '(?<$1>[^/]+)')}$`), handler, auth });

route('GET', '/health', async () => json({ ok: true }), false);
route('GET', '/config', async ({ req }) => {
  const demo = await one('select public_token from batches where is_demo=true and published=true order by id limit 1');
  return json({ contact_email: env('CONTACT_EMAIL', 'devprakashsahu348@gmail.com'), owner: env('OWNER_NAME', 'Dev Prakash Sahu'), year: new Date().getFullYear(),
    demo_token: demo ? demo.public_token : null, registration: flag('ALLOW_REGISTRATION', 'true'), demo_login: flag('DEMO_LOGIN', 'false') && flag('SEED_DEMO', 'true') });
}, false);

route('POST', '/auth/register', async ({ req }) => {
  rateLimit(req, 'register', 8);
  if (!flag('ALLOW_REGISTRATION', 'true')) throw new HttpError(403, 'Registration is currently closed.');
  const b = await body(req);
  const orgName = str(b.organisation, 'Organisation', { min: 2, max: 160 }), type = str(b.business_type, 'Business type', { max: 80, def: 'Food producer' });
  const name = str(b.name, 'Name', { min: 2, max: 120 }), mail = email(b.email), pw = password(b.password);
  if (await one('select id from users where email=$1', [mail])) throw new HttpError(409, 'An account with this email already exists.');
  const t = nowIso(), org = await insert('organisations', { name: orgName, business_type: type, contact_email: mail, created_at: t });
  const u = await insert('users', { organisation_id: org.id, name, email: mail, password_hash: hashPassword(pw), role: 'admin', created_at: t });
  u.organisation = org.name;
  await audit(u, 'register', 'organisation', org.id, org.name);
  return json({ token: makeToken(u.id), user: userOut(u) });
}, false);

route('POST', '/auth/login', async ({ req }) => {
  rateLimit(req, 'login', 10);
  const b = await body(req);
  const u = await one('select u.*, o.name as organisation from users u join organisations o on o.id=u.organisation_id where u.email=$1', [String(b.email || '').trim().toLowerCase()]);
  if (!u || !u.active || !verifyPassword(String(b.password || '').slice(0, 72), u.password_hash)) throw new HttpError(401, 'Incorrect email or password.');
  return json({ token: makeToken(u.id), user: userOut(u) });
}, false);
route('GET', '/auth/me', async ({ user }) => json(userOut(user)));

// team
route('GET', '/team', async ({ user }) => {
  needRole(user, 'admin');
  const rows = await query('select u.*, o.name as organisation from users u join organisations o on o.id=u.organisation_id where u.organisation_id=$1 order by u.id', [user.organisation_id]);
  return json(rows.map(userOut));
});
route('POST', '/team', async ({ req, user }) => {
  needRole(user, 'admin');
  const b = await body(req), mail = email(b.email);
  const name = str(b.name, 'Name', { min: 2, max: 120 }), pw = password(b.password), role = oneOf(b.role, ROLES, 'role');
  if (await one('select id from users where email=$1', [mail])) throw new HttpError(409, 'That email is already registered.');
  const u = await insert('users', { organisation_id: user.organisation_id, name, email: mail, password_hash: hashPassword(pw), role, created_at: nowIso() });
  u.organisation = user.organisation;
  await audit(user, 'add_member', 'user', u.id, `${mail} as ${role}`);
  return json(userOut(u));
});
route('PATCH', '/team/:id', async ({ req, user, params }) => {
  needRole(user, 'admin');
  const id = Number(params.id), b = await body(req);
  const u = await one('select u.*, o.name as organisation from users u join organisations o on o.id=u.organisation_id where u.id=$1', [id]);
  if (!u || u.organisation_id !== user.organisation_id) throw new HttpError(404, 'Member not found.');
  if (u.id === user.id) throw new HttpError(400, 'You cannot change your own role or deactivate yourself.');
  if (typeof b.active === 'boolean') u.active = b.active;
  if (b.role) u.role = oneOf(b.role, ROLES, 'role');
  await query('update users set active=$1, role=$2 where id=$3', [u.active, u.role, id]);
  await audit(user, 'update_member', 'user', id, `active=${u.active} role=${u.role}`);
  return json(userOut(u));
});

// products
route('GET', '/products', async ({ user }) => json(await query('select id, name, category, description from products where organisation_id=$1 order by name', [user.organisation_id])));
route('POST', '/products', async ({ req, user }) => {
  needRole(user, 'admin', 'operator');
  const b = await body(req);
  const p = await insert('products', { organisation_id: user.organisation_id, name: str(b.name, 'Name', { min: 2, max: 160 }), category: str(b.category, 'Category', { max: 80, def: 'Other' }), description: str(b.description, 'Description', { max: 1000 }), created_at: nowIso() });
  await audit(user, 'create', 'product', p.id, p.name);
  return json({ id: p.id, name: p.name, category: p.category, description: p.description });
});

// batches
route('GET', '/batches', async ({ user }) => json((await loadBatches(user.organisation_id)).map(b => batchOut(b, false))));
route('POST', '/batches', async ({ req, user }) => {
  needRole(user, 'admin', 'operator');
  const b = await body(req), code = String(b.batch_code || '').trim();
  if (!/^[A-Za-z0-9._-]{2,60}$/.test(code)) throw new HttpError(422, 'Batch code must be 2–60 letters, numbers, dots, dashes or underscores.');
  const prod = await one('select id from products where id=$1 and organisation_id=$2', [Number(b.product_id), user.organisation_id]);
  if (!prod) throw new HttpError(404, 'Product not found.');
  const qty = Number(b.quantity ?? 0);
  if (!(qty >= 0 && qty <= 1e9)) throw new HttpError(422, 'Quantity must be a positive number.');
  if (await one('select id from batches where organisation_id=$1 and batch_code=$2', [user.organisation_id, code.toUpperCase()])) throw new HttpError(409, 'This batch code already exists in your organisation.');
  const token = (await import('node:crypto')).randomBytes(12).toString('base64url');
  const row = await insert('batches', { organisation_id: user.organisation_id, product_id: prod.id, batch_code: code.toUpperCase(), origin: str(b.origin, 'Origin', { max: 200 }), production_date: isoDate(b.production_date, 'Production date'), quantity: qty, unit: str(b.unit, 'Unit', { max: 20, def: 'kg' }), public_token: token, public_fields: JSON.stringify(DEFAULT_PUBLIC), created_by: user.id, created_at: nowIso() });
  await audit(user, 'create', 'batch', row.id, row.batch_code);
  return json(batchOut(await getBatch(user, row.id)));
});
route('GET', '/batches/:id', async ({ user, params }) => json(batchOut(await getBatch(user, Number(params.id)))));
route('PATCH', '/batches/:id/publish', async ({ req, user, params }) => {
  needRole(user, 'admin', 'quality');
  const b = await getBatch(user, Number(params.id)), inp = await body(req), fields = { ...DEFAULT_PUBLIC };
  for (const k of Object.keys(DEFAULT_PUBLIC)) if (inp.public_fields && k in inp.public_fields) fields[k] = !!inp.public_fields[k];
  await query('update batches set published=$1, public_fields=$2 where id=$3', [!!inp.published, JSON.stringify(fields), b.id]);
  await audit(user, inp.published ? 'publish' : 'unpublish', 'batch', b.id, JSON.stringify(fields));
  return json(batchOut(await getBatch(user, b.id)));
});

// events & evidence
route('POST', '/batches/:id/events', async ({ req, user, params }) => {
  const inp = await body(req), type = String(inp.event_type || '');
  if (!EVENT_TYPES.includes(type)) throw new HttpError(422, 'Unknown event type.');
  if (!ROLE_EVENTS[user.role].has(type)) throw new HttpError(403, `Your role (${user.role}) cannot record '${type}' events.`);
  const b = await getBatch(user, Number(params.id)), when = isoTime(inp.event_time);
  const corrects = inp.corrects_id ? Number(inp.corrects_id) : null;
  if (corrects) {
    const old = b.events.find(e => e.id === corrects);
    if (!old) throw new HttpError(404, 'The event to correct was not found on this batch.');
    if (old.event_type !== type) throw new HttpError(422, 'A correction must use the same event type.');
  }
  const ev = await insert('events', { batch_id: b.id, event_type: type, event_time: when, location_text: str(inp.location_text, 'Location', { max: 200 }), notes: str(inp.notes, 'Notes', { max: 2000 }), corrects_id: corrects, created_by: user.id, created_at: nowIso() });
  await audit(user, corrects ? 'correct_event' : 'add_event', 'event', ev.id, `${b.batch_code}: ${type}`);
  return json(batchOut(await getBatch(user, b.id)));
});
route('POST', '/events/:id/review', async ({ user, params }) => {
  needRole(user, 'admin', 'quality');
  const ev = await getEvent(user, Number(params.id));
  await query('update events set reviewed_by=$1 where id=$2', [user.id, ev.id]);
  await audit(user, 'review_event', 'event', ev.id, ev.event_type);
  return json(batchOut(await getBatch(user, ev.batch_id)));
});
route('POST', '/events/:id/evidence', async ({ req, user, params }) => {
  const ev = await getEvent(user, Number(params.id));
  let fd; try { fd = await req.formData(); } catch { throw new HttpError(400, 'Upload a file using a form.'); }
  const file = fd.get('file');
  if (!file || typeof file.arrayBuffer !== 'function') throw new HttpError(422, 'Choose a file to upload.');
  if (file.size > maxUpload()) throw new HttpError(413, `File is larger than ${env('MAX_UPLOAD_MB', '4')} MB.`);
  const buf = Buffer.from(await file.arrayBuffer());
  const type = (MAGIC.find(([m]) => m.every((x, i) => buf[i] === x)) || (buf.length > 11 && buf.toString('ascii', 0, 4) === 'RIFF' && buf.toString('ascii', 8, 12) === 'WEBP' && [null, 'image/webp']) || [])[1];
  if (!type) throw new HttpError(415, 'Only PDF, PNG, JPEG or WebP files are accepted.');
  const row = await insert('evidence', { event_id: ev.id, original_name: String(file.name || 'evidence').replace(/[\\/]/g, '_').slice(0, 180), file_type: type, size: buf.length, visibility: fd.get('visibility') === 'public' ? 'public' : 'private', data: buf.toString('base64'), uploaded_by: user.id, created_at: nowIso() });
  await audit(user, 'upload_evidence', 'evidence', row.id, row.original_name);
  return json(batchOut(await getBatch(user, ev.batch_id)));
});
route('GET', '/evidence/:id/file', async ({ user, params }) => {
  const x = await one('select x.*, b.organisation_id from evidence x join events e on e.id=x.event_id join batches b on b.id=e.batch_id where x.id=$1', [Number(params.id)]);
  if (!x || x.organisation_id !== user.organisation_id) throw new HttpError(404, 'File not found.');
  return fileResponse(x);
});

// dashboard & audit
route('GET', '/dashboard/summary', async ({ user }) => {
  const outs = (await loadBatches(user.organisation_id)).map(b => batchOut(b));
  const alerts = outs.flatMap(o => o.flags.filter(f => f.severity === 'warning').map(f => ({ batch_id: o.id, batch_code: o.batch_code, ...f })));
  const n = s => outs.filter(o => o.status === s).length;
  return json({ totals: { batches: outs.length, complete: n('complete'), needs_review: n('needs_review'), in_progress: n('in_progress'), published: outs.filter(o => o.published).length, scans: outs.reduce((a, o) => a + o.scan_count, 0) },
    alerts: alerts.slice(0, 10), recent: outs.slice(0, 6).map(({ events, flags, ...rest }) => rest) });
});
route('GET', '/audit', async ({ user }) => {
  needRole(user, 'admin');
  const rows = await query('select a.*, u.name as actor from audit_logs a left join users u on u.id=a.actor_id where a.organisation_id=$1 order by a.id desc limit 60', [user.organisation_id]);
  return json(rows.map(r => ({ time: r.timestamp, actor: r.actor || 'system', action: r.action, record: r.record_type, detail: r.detail })));
});

// PUBLIC trace page — only approved fields leave the server
route('GET', '/public/:token', async ({ params }) => {
  const [b] = await loadBatches(null, { token: params.token });
  if (!b) throw new HttpError(404, 'We could not find a batch for this code.');
  if (!b.published) throw new HttpError(404, 'The producer has not published this batch yet.');
  const pf = b.public_fields, org = await one('select name from organisations where id=$1', [b.organisation_id]);
  await query('update batches set scan_count=scan_count+1 where id=$1', [b.id]);
  const { status, flags } = analyse(b, b.events);
  const events = activeEvents(b.events).map(e => {
    const it = { event_type: e.event_type, event_time: e.event_time, label: eventLabel(e), corrected: !!e.corrects_id };
    if (pf.locations) it.location_text = e.location_text;
    if (pf.notes) it.notes = e.notes;
    if (pf.evidence) it.evidence = e.evidence.filter(x => x.visibility === 'public').map(x => ({ id: x.id, name: x.original_name }));
    return it;
  });
  const out = { product: b.product, category: b.category, batch_code: b.batch_code, events, record_status: status, open_flags: flags.filter(f => f.severity === 'warning').length, is_demo: b.is_demo };
  if (pf.origin) out.origin = b.origin;
  if (pf.production_date) out.production_date = b.production_date;
  if (pf.quantity) out.quantity = `${+b.quantity} ${b.unit}`;
  if (pf.organisation) out.organisation = org.name;
  return json(out);
}, false);
route('GET', '/public/:token/evidence/:xid', async ({ params }) => {
  const [b] = await loadBatches(null, { token: params.token });
  const x = b && await one('select x.*, e.batch_id from evidence x join events e on e.id=x.event_id where x.id=$1', [Number(params.xid)]);
  if (!(b && b.published && b.public_fields.evidence && x && x.visibility === 'public' && x.batch_id === b.id)) throw new HttpError(404, 'File not available.');
  return fileResponse(x);
}, false);
route('GET', '/qr/:token.svg', async ({ req, params }) => {
  if (!(await one('select id from batches where public_token=$1', [params.token]))) throw new HttpError(404, 'Not found.');
  const svg = await QRCode.toString(`${baseUrl(req)}/t/${params.token}`, { type: 'svg', margin: 2, errorCorrectionLevel: 'M' });
  return new Response(svg, { headers: { 'content-type': 'image/svg+xml', 'cache-control': 'public, max-age=3600' } });
}, false);

// pilot requests from the website
route('POST', '/leads', async ({ req }) => {
  rateLimit(req, 'lead', 5, 300);
  const b = await body(req);
  await insert('leads', { name: str(b.name, 'Name', { min: 2, max: 120 }), email: email(b.email), organisation: str(b.organisation, 'Organisation', { max: 160 }), message: str(b.message, 'Message', { max: 2000 }), created_at: nowIso() });
  return json({ ok: true });
}, false);
route('GET', '/leads', async ({ req }) => {
  const key = env('PLATFORM_ADMIN_KEY'), given = req.headers.get('x-admin-key') || '';
  if (!key || key.length !== given.length || !timingSafeEqual(Buffer.from(key), Buffer.from(given))) throw new HttpError(403, 'Not allowed.');
  return json(await query('select name, email, organisation, message, created_at as at from leads order by id desc limit 200'));
}, false);

// ---------- entry ----------
export default async function handler(req) {
  try {
    const url = new URL(req.url), path = url.pathname.replace(/^\/api/, '').replace(/\/$/, '') || '/';
    let hit = null, params = {};
    for (const r of routes) {
      if (r.method !== req.method) continue;
      const m = r.re.exec(path);
      if (m) { hit = r; params = { ...m.groups }; break; }
    }
    if (!hit) throw new HttpError(404, 'Not found.');
    if (path !== '/health') await ensureReady();
    const user = hit.auth ? await authUser(req) : null;
    return await hit.handler({ req, url, user, params });
  } catch (e) {
    if (e instanceof HttpError) return json({ detail: e.detail }, e.status);
    console.error(e);
    return json({ detail: 'Something went wrong on the server.' }, 500);
  }
}
export const config = { path: '/api/*' };
