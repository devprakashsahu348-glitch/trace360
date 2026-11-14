// Vercel Function entry: adapts Node's req/res to the Web Request/Response API used by server/api.mjs.
import handler from '../server/api.mjs';

export default async function (req, res) {
  const proto = req.headers['x-forwarded-proto'] || 'https';
  const url = `${proto}://${req.headers.host}${req.url}`;
  const chunks = [];
  for await (const c of req) chunks.push(c);
  const body = ['GET', 'HEAD'].includes(req.method) ? undefined : Buffer.concat(chunks);
  const r = await handler(new Request(url, { method: req.method, headers: req.headers, body }));
  res.statusCode = r.status;
  r.headers.forEach((v, k) => { if (k !== 'set-cookie') res.setHeader(k, v); });
  const cookies = r.headers.getSetCookie ? r.headers.getSetCookie() : [];
  if (cookies.length) res.setHeader('set-cookie', cookies);
  res.end(Buffer.from(await r.arrayBuffer()));
}
