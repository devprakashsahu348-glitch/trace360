import { createHash, createHmac, randomBytes, scryptSync, timingSafeEqual } from 'node:crypto';
import bcrypt from 'bcryptjs';
import { HttpError, env } from './util.mjs';

function secret() {
  const s = env('SECRET_KEY');
  if (s) return s;
  if (process.env.TRACE360_DEV === 'true') return 'dev-only-insecure-key-change-me'; // local dev server & tests only
  throw new HttpError(500, 'Server is not configured: set SECRET_KEY in the Vercel environment variables.');
}
export const sha256 = v => createHash('sha256').update(String(v)).digest('hex');
export const randomToken = (n = 32) => randomBytes(n).toString('base64url');

const rounds = () => Number(env('BCRYPT_ROUNDS', '12'));
export const hashPassword = pw => bcrypt.hash(pw, rounds());
export async function verifyPassword(pw, stored) {
  try {
    if (stored.startsWith('scrypt$')) { // legacy hashes from the first release
      const [, salt, hash] = stored.split('$');
      const a = scryptSync(pw, Buffer.from(salt, 'base64'), 64), b = Buffer.from(hash, 'base64');
      return a.length === b.length && timingSafeEqual(a, b);
    }
    return await bcrypt.compare(pw, stored);
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
  const good = createHmac('sha256', secret()).update(`${h}.${b}`).digest(), given = Buffer.from(s, 'base64url');
  if (good.length !== given.length || !timingSafeEqual(good, given)) return null;
  try { const p = JSON.parse(Buffer.from(b, 'base64url').toString()); return p.exp > Date.now() / 1000 ? p.sub : null; } catch { return null; }
}

export const COOKIE = 't360';
export const readCookie = (req, name) => (req.headers.get('cookie') || '').split(/;\s*/).map(c => c.split('=')).find(([k]) => k === name)?.[1] || '';
export const sessionCookie = (token, secure) => `${COOKIE}=${token}; HttpOnly; SameSite=Lax; Path=/; Max-Age=${Number(env('TOKEN_HOURS', '12')) * 3600}${secure ? '; Secure' : ''}`;
export const clearCookie = secure => `${COOKIE}=; HttpOnly; SameSite=Lax; Path=/; Max-Age=0${secure ? '; Secure' : ''}`;
export const clientIp = req => (req.headers.get('x-forwarded-for') || req.headers.get('x-real-ip') || '?').split(',')[0].trim();
