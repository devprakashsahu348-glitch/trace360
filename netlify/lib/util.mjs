export class HttpError extends Error {
  constructor(status, detail) { super(detail); this.status = status; this.detail = detail; }
}
export const json = (data, status = 200, headers = {}) =>
  new Response(JSON.stringify(data), { status, headers: { 'content-type': 'application/json; charset=utf-8', 'cache-control': 'no-store', ...headers } });

export const env = (k, d = '') => (process.env[k] ?? d);
export const flag = (k, d) => String(env(k, d)).toLowerCase() === 'true';
export const nowIso = () => new Date().toISOString().slice(0, 19);

const EMAIL = /^[^@\s]+@[^@\s]+\.[^@\s]+$/;
export function str(v, name, { min = 0, max = 500, def } = {}) {
  if (v === undefined || v === null || v === '') { if (def !== undefined) return def; if (min > 0) throw new HttpError(422, `${name} is required.`); return ''; }
  const s = String(v).trim();
  if (s.length < min) throw new HttpError(422, `${name} must be at least ${min} characters.`);
  if (s.length > max) throw new HttpError(422, `${name} must be at most ${max} characters.`);
  return s;
}
export function email(v) {
  const s = String(v ?? '').trim().toLowerCase();
  if (!EMAIL.test(s) || s.length > 200) throw new HttpError(422, 'Enter a valid email address.');
  return s;
}
export function password(v) {
  const s = String(v ?? '');
  if (s.length < 8 || s.length > 72) throw new HttpError(422, 'Password must be 8 to 72 characters.');
  return s;
}
export function oneOf(v, list, name) {
  if (!list.includes(v)) throw new HttpError(422, `Invalid ${name}.`);
  return v;
}
export function isoDate(v, name = 'date') {
  const m = /^(\d{4})-(\d{2})-(\d{2})/.exec(String(v ?? ''));
  if (!m || isNaN(Date.parse(m[0]))) throw new HttpError(422, `${name} must be a valid date.`);
  return m[0];
}
/** Normalise "2026-10-20", "2026-10-20T08:30" or full ISO into naive "YYYY-MM-DDTHH:MM:SS". */
export function isoTime(v) {
  const m = /^(\d{4}-\d{2}-\d{2})(?:[T ](\d{2}):(\d{2})(?::(\d{2}))?)?/.exec(String(v ?? ''));
  if (!m || isNaN(Date.parse(m[1]))) throw new HttpError(422, 'Enter a valid date and time.');
  return `${m[1]}T${m[2] || '00'}:${m[3] || '00'}:${m[4] || '00'}`;
}
