import { createHmac, randomBytes, scryptSync, timingSafeEqual } from 'node:crypto';
import { HttpError, env } from './util.mjs';

function secret() {
  const s = env('SECRET_KEY');
  if (s) return s;
  if (process.env.TRACE360_DEV === 'true') return 'dev-only-insecure-key-change-me'; // local dev server & tests only
  throw new HttpError(500, 'Server is not configured: set SECRET_KEY in Netlify environment variables.');
}
export function hashPassword(pw) {
  const salt = randomBytes(16);
  return `scrypt$${salt.toString('base64')}$${scryptSync(pw, salt, 64).toString('base64')}`;
}
export function verifyPassword(pw, stored) {
  try {
    const [, salt, hash] = stored.split('$');
    const a = scryptSync(pw, Buffer.from(salt, 'base64'), 64), b = Buffer.from(hash, 'base64');
    return a.length === b.length && timingSafeEqual(a, b);
  } catch { return false; }
}
const b64 = o => Buffer.from(typeof o === 'string' ? o : JSON.stringify(o)).toString('base64url');
export function makeToken(userId) {
  const hours = Number(env('TOKEN_HOURS', '12'));
  const head = b64({ alg: 'HS256', typ: 'JWT' }), body = b64({ sub: userId, exp: Math.floor(Date.now() / 1000) + hours * 3600 });
  return `${head}.${body}.${createHmac('sha256', secret()).update(`${head}.${body}`).digest('base64url')}`;
}
export function readToken(token) {
  const [h, b, s] = String(token || '').split('.');
  if (!h || !b || !s) return null;
  const good = createHmac('sha256', secret()).update(`${h}.${b}`).digest();
  const given = Buffer.from(s, 'base64url');
  if (good.length !== given.length || !timingSafeEqual(good, given)) return null;
  try { const p = JSON.parse(Buffer.from(b, 'base64url').toString()); return p.exp > Date.now() / 1000 ? p.sub : null; } catch { return null; }
}

// Best-effort in-memory limiter (per function instance). Add Netlify rate-limiting rules for stronger protection.
const hits = new Map();
export function rateLimit(req, key, limit = 10, windowSec = 60) {
  const ip = (req.headers.get('x-nf-client-connection-ip') || req.headers.get('x-forwarded-for') || '?').split(',')[0].trim();
  const k = `${key}:${ip}`, now = Date.now(), arr = (hits.get(k) || []).filter(t => t > now - windowSec * 1000);
  if (arr.length >= limit) throw new HttpError(429, 'Too many attempts. Please wait a minute and try again.');
  arr.push(now); hits.set(k, arr);
  if (hits.size > 5000) hits.clear();
}
