import { neon } from '@neondatabase/serverless';
import { HttpError, env, flag, nowIso } from './util.mjs';
import { hashPassword } from './auth.mjs';
import { randomBytes } from 'node:crypto';

let runner = null, ready = null;
/** Tests / local dev inject their own query function (PGlite). Production uses Neon over HTTPS. */
export function setQuery(fn) { runner = fn; ready = null; }
function getRunner() {
  if (runner) return runner;
  const url = env('DATABASE_URL') || env('NETLIFY_DATABASE_URL');
  if (!url) throw new HttpError(500, 'Server is not configured: set DATABASE_URL (your Neon connection string) in Netlify environment variables.');
  const sql = neon(url);
  runner = (text, params = []) => sql.query(text, params);
  return runner;
}
export const query = (text, params = []) => getRunner()(text, params);
export const one = async (text, params) => (await query(text, params))[0] || null;
export async function insert(table, data) {
  const keys = Object.keys(data);
  const rows = await query(`insert into ${table} (${keys.join(',')}) values (${keys.map((_, i) => `$${i + 1}`).join(',')}) returning *`, keys.map(k => data[k]));
  return rows[0];
}
export async function audit(user, action, recordType, recordId = 0, detail = '') {
  await query('insert into audit_logs (organisation_id, actor_id, action, record_type, record_id, detail, timestamp) values ($1,$2,$3,$4,$5,$6,$7)',
    [user.organisation_id, user.id, action, recordType, recordId, String(detail).slice(0, 300), nowIso()]);
}

const SCHEMA = [
  `create table if not exists organisations (id serial primary key, name text not null, business_type text default 'Food producer', contact_email text, created_at text)`,
  `create table if not exists users (id serial primary key, organisation_id int not null, name text not null, email text not null unique, password_hash text not null, role text not null default 'operator', active boolean not null default true, created_at text)`,
  `create table if not exists products (id serial primary key, organisation_id int not null, name text not null, category text default 'Other', description text default '', created_at text)`,
  `create table if not exists batches (id serial primary key, organisation_id int not null, product_id int not null, batch_code text not null, origin text default '', production_date text not null, quantity double precision default 0, unit text default 'kg', is_demo boolean default false, public_token text not null unique, published boolean default false, public_fields text default '{}', scan_count int default 0, created_by int, created_at text, unique (organisation_id, batch_code))`,
  `create table if not exists events (id serial primary key, batch_id int not null, event_type text not null, event_time text not null, location_text text default '', notes text default '', corrects_id int, reviewed_by int, created_by int, created_at text)`,
  `create table if not exists evidence (id serial primary key, event_id int not null, original_name text, file_type text, size int default 0, visibility text default 'private', data text not null, uploaded_by int, created_at text)`,
  `create table if not exists audit_logs (id serial primary key, organisation_id int not null, actor_id int, action text, record_type text, record_id int default 0, detail text default '', timestamp text)`,
  `create table if not exists leads (id serial primary key, name text, email text, organisation text default '', message text default '', created_at text)`,
  `create index if not exists ix_batches_org on batches (organisation_id)`,
  `create index if not exists ix_events_batch on events (batch_id)`,
];

/** Creates tables (idempotent) and optional synthetic demo data once per warm function instance. */
export function ensureReady() {
  if (!ready) ready = (async () => {
    for (const stmt of SCHEMA) await query(stmt);
    if (flag('SEED_DEMO', 'true')) await seedDemo();
  })().catch(e => { ready = null; throw e; });
  return ready;
}

const PDF = Buffer.from('%PDF-1.4\n1 0 obj<</Type/Catalog/Pages 2 0 R>>endobj\n2 0 obj<</Type/Pages/Kids[3 0 R]/Count 1>>endobj\n3 0 obj<</Type/Page/Parent 2 0 R/MediaBox[0 0 300 120]/Contents 4 0 R/Resources<</Font<</F1 5 0 R>>>>>>endobj\n4 0 obj<</Length 72>>stream\nBT /F1 12 Tf 20 60 Td (DEMO quality note - synthetic sample, not a certificate) Tj ET\nendstream endobj\n5 0 obj<</Type/Font/Subtype/Type1/BaseFont/Helvetica>>endobj\ntrailer<</Root 1 0 R>>\n%%EOF\n').toString('base64');
export const DEMO_EMAIL = 'demo@trace360.app', DEMO_PASSWORD = 'Demo@12345';

async function seedDemo() {
  const NAME = 'Himalaya Leaf Co. (DEMO)';
  if (await one('select id from organisations where name=$1', [NAME])) return;
  const t = nowIso();
  const org = await insert('organisations', { name: NAME, business_type: 'Tea & honey producer', contact_email: DEMO_EMAIL, created_at: t });
  const pw = flag('DEMO_LOGIN', 'false') ? DEMO_PASSWORD : randomBytes(18).toString('base64url');
  const admin = await insert('users', { organisation_id: org.id, name: 'Demo Admin', email: DEMO_EMAIL, password_hash: hashPassword(pw), role: 'admin', created_at: t });
  const prod = (name, category) => insert('products', { organisation_id: org.id, name, category, description: 'Synthetic demo product.', created_at: t });
  const [tea, honey, spice] = [await prod('Darjeeling-style First Flush Tea (demo)', 'Tea'), await prod('Wild Forest Honey (demo)', 'Honey'), await prod('Ground Turmeric (demo)', 'Spices')];
  const allPublic = JSON.stringify({ origin: true, production_date: true, organisation: true, quantity: true, locations: true, notes: true, evidence: true });
  const mk = async (p, code, origin, date, qty, unit, token, published, evs) => {
    const b = await insert('batches', { organisation_id: org.id, product_id: p.id, batch_code: code, origin, production_date: date, quantity: qty, unit, is_demo: true, public_token: token, published, public_fields: allPublic, created_by: admin.id, created_at: t });
    for (const [type, when, loc, notes, reviewed, doc] of evs) {
      const e = await insert('events', { batch_id: b.id, event_type: type, event_time: when, location_text: loc, notes, reviewed_by: reviewed ? admin.id : null, created_by: admin.id, created_at: t });
      if (doc) await insert('evidence', { event_id: e.id, original_name: 'demo-quality-note.pdf', file_type: 'application/pdf', size: 700, visibility: 'public', data: PDF, uploaded_by: admin.id, created_at: t });
    }
  };
  await mk(tea, 'TEA-DEMO-001', 'Sample hill garden, Darjeeling district (demo)', '2026-10-20', 250, 'kg', 'demo-tea-001', true, [
    ['production', '2026-10-20T08:30:00', 'Sample Tea Estate (demo)', 'Hand-plucked, withered and rolled.', true, false],
    ['quality', '2026-10-21T11:00:00', 'Estate lab (demo)', 'Moisture and aroma check logged. Sample document attached.', true, true],
    ['packing', '2026-10-22T14:15:00', 'Packing shed (demo)', 'Foil-lined 100 g pouches.', true, false],
    ['dispatch', '2026-10-24T09:40:00', 'Siliguri hub (demo)', 'Handed to demo logistics partner.', true, false]]);
  await mk(honey, 'HNY-DEMO-002', 'Sample forest range (demo)', '2026-10-12', 120, 'kg', 'demo-honey-002', true, [
    ['production', '2026-10-12T10:00:00', 'Collection point (demo)', 'Raw honey collected.', false, false],
    ['dispatch', '2026-10-13T16:00:00', 'Cold store (demo)', 'Dated before packing on purpose, so the dashboard can flag it.', false, false],
    ['packing', '2026-10-14T12:00:00', 'Packing shed (demo)', 'Glass jars, 500 g.', false, false]]);
  await mk(spice, 'SPC-DEMO-003', 'Sample farm cluster (demo)', '2026-10-28', 80, 'kg', 'demo-spice-003', false, [
    ['production', '2026-10-28T09:00:00', 'Sample mill (demo)', 'Grinding complete.', false, false]]);
}
