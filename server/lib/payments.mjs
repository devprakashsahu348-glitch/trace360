// Razorpay (INR) one-time plan payments via the REST API — no SDK needed.
import { createHmac, timingSafeEqual } from 'node:crypto';
import { HttpError, env } from './util.mjs';
export const PLANS = { starter: { name: 'Starter', amount: 49900 }, growth: { name: 'Growth', amount: 199900 }, business: { name: 'Business', amount: 499900 } };
export const paymentsEnabled = () => !!(env('RAZORPAY_KEY_ID') && env('RAZORPAY_KEY_SECRET'));
export async function createOrder({ amount, receipt, notes }) {
  const auth = Buffer.from(`${env('RAZORPAY_KEY_ID')}:${env('RAZORPAY_KEY_SECRET')}`).toString('base64');
  const res = await fetch('https://api.razorpay.com/v1/orders', { method: 'POST', headers: { authorization: `Basic ${auth}`, 'content-type': 'application/json' }, body: JSON.stringify({ amount, currency: 'INR', receipt, notes }) });
  if (!res.ok) { console.error('Razorpay order error', res.status, await res.text().catch(() => '')); throw new HttpError(502, 'The payment provider could not start this payment. Please try again.'); }
  return res.json();
}
export function verifySignature(orderId, paymentId, signature) {
  const good = createHmac('sha256', env('RAZORPAY_KEY_SECRET')).update(`${orderId}|${paymentId}`).digest('hex'), given = String(signature || '');
  return good.length === given.length && timingSafeEqual(Buffer.from(good), Buffer.from(given));
}
