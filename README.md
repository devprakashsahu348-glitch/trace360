# TRACE360 — Know the journey. Trust the product.
   **Live site:** https://YOUR-SITE.netlify.app

A full-stack **product traceability and supply-chain record platform** for small food producers.
Businesses record each batch's journey (production → quality → packing → dispatch → receipt), attach
evidence, and share an honest **QR trace page** with customers and buyers.

> TRACE360 is a record and visibility tool. It is **not** a regulator, laboratory or certifier, and a QR code
> alone does not prove authenticity. Every entry is labelled by how it was recorded.

**Contact:** devprakashsahu348@gmail.com · **© 2026 Dev Prakash Sahu. All rights reserved.**

## Runs 100% free on Netlify
| Part | Tech | Free tier |
|---|---|---|
| Website | Static HTML/CSS/JS in `frontend/` (no build step) | Netlify |
| API | One Netlify Function, `netlify/functions/api.mjs` (Node 20) | Netlify |
| Database + evidence files | Neon Postgres | Neon free plan |
| QR codes | `qrcode` (SVG, generated on request) | — |

## Features
Organisations · 4 roles with per-event permissions · products · batches with unique codes · append-only event
timeline (corrections keep history) · evidence upload (PDF/PNG/JPEG/WebP, content-checked, private by default) ·
QR per batch with a random public token · public "product passport" that shows only approved fields ·
rule-based completeness checks · dashboard · audit trail · team management · pilot-request form · synthetic demo data.
Evidence labels: *Business-entered · Document attached · Reviewed by business*. "Independently verified" is
deliberately **not** enabled — it needs a real named verifier.

## Run locally (no Neon needed)
```bash
npm install
npm run dev          # http://localhost:8888 — uses an embedded database in ./.devdb
npm test             # API, rules, roles, privacy tests
```
Local demo login (click "Try the demo workspace"): `demo@trace360.app` / `Demo@12345`.
Public demo trace page: `/t/demo-tea-001`.

## Deploy
Follow **LAUNCH_CHECKLIST.md** step by step (GitHub → Neon → Netlify → test).

## Layout
```
frontend/            index.html, css/styles.css, js/app.js, img/
netlify/functions/   api.mjs            ← every /api/* route
netlify/lib/         db.mjs rules.mjs auth.mjs util.mjs
scripts/dev-server.mjs   local server     tests/api.test.mjs   tests     netlify.toml   Netlify config
```
