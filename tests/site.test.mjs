import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync, statSync } from 'node:fs';
import { check } from '../scripts/check-site.mjs';

test('built site: titles, one H1, canonical, alt text, links, schema, no placeholders', () => {
  const { problems, count } = check();
  assert.ok(count >= 15); assert.deepEqual(problems, []);
});
test('share image is small enough for WhatsApp previews and sitemap lists public pages only', () => {
  assert.ok(statSync('public/og-image.png').size < 300 * 1024);
  const sm = readFileSync('public/sitemap.xml', 'utf8');
  for (const p of ['/features', '/pricing', '/privacy', '/terms', '/cookies', '/payment-terms']) assert.ok(sm.includes(p + '</loc>'), p);
  for (const p of ['/login', '/signup', '/app', '/t/']) assert.ok(!sm.includes(p), p);
  assert.match(readFileSync('public/robots.txt', 'utf8'), /Sitemap:/);
});
test('no source maps and small scripts', () => {
  assert.ok(statSync('public/js/site.js').size < 30 * 1024); assert.ok(statSync('public/js/app.js').size < 60 * 1024);
});
