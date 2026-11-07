# TRACE360 — Launch checklist (100% free, on Netlify)

## 1. GitHub
Unzip, then upload **the contents** of the `trace360` folder (so `netlify.toml`, `package.json`, `frontend/`, `netlify/` are at the top level of the repo).
```bash
git init && git add . && git commit -m "TRACE360 initial release"
git branch -M main && git remote add origin https://github.com/<you>/trace360.git && git push -u origin main
```

## 2. Neon (free database)
1. neon.com → your **Dev prakash** organization → **New project** → name `trace360` → pick a region → **Create**.
2. Click **Connect**, choose branch `main`, database `neondb`, and copy the **connection string** (`postgresql://…?sslmode=require`).
Tables are created automatically on the first request. Keep the string secret.

## 3. Netlify
1. netlify.com → sign up with GitHub → **Add new project → Import an existing project → GitHub → trace360**.
2. Build command: *(leave empty)*. Publish directory and functions folder come from `netlify.toml`.
3. **Before deploying**, open *Site configuration → Environment variables* and add:

| Variable | Value |
|---|---|
| `DATABASE_URL` | your Neon connection string **(required)** |
| `SECRET_KEY` | long random text **(required)** — `node -e "console.log(require('crypto').randomBytes(48).toString('base64url'))"` |
| `CONTACT_EMAIL` | devprakashsahu348@gmail.com |
| `OWNER_NAME` | Dev Prakash Sahu |
| `DEMO_LOGIN` | `false` |
| `PLATFORM_ADMIN_KEY` | optional random text (to read pilot requests) |

4. Click **Deploy**. When it finishes you get `https://<name>.netlify.app` (you can rename it under *Site configuration → Change site name*).

## 4. Test the live site
- Landing page loads, with styling · `/t/demo-tea-001` shows the demo trace page.
- Register → add a product → create a batch → record events → attach a PDF → publish.
- Scan the batch QR with a phone: it opens the public page. QR codes use the site's own address automatically.
- Open `/api/health` → `{"ok":true}`.
- Neon console → **Tables** shows `users`, `batches`, `events`, …

## 5. Things you must decide / provide
- Final **domain** (free `.netlify.app` works; a custom domain is optional — **reprint QR codes** if the address changes).
- **Registration**: open (`ALLOW_REGISTRATION=true`) or invite-only (`false`).
- **Public-welfare model**: the pricing section shows illustrative ₹499/₹1,999/₹4,999 hypotheses. Edit `landing()` in `frontend/js/app.js` if the service is free for cooperatives.
- **Legal review** of the Privacy/Terms page (a plain-language draft). Check food-labelling rules (FSSAI/FSSR) with a qualified adviser. Never present TRACE360 as certifying compliance.
- Permission before publishing any real supplier names, photos or certificates.

## 6. Free-tier limits to know
- Neon free: limited storage. Evidence files are stored **inside the database** (≈4 MB max each), so heavy use of uploads will fill it — move files to object storage if usage grows.
- Netlify free: monthly bandwidth and function-call allowance; fine for a pilot.
- Neon may pause an idle database; the first request after a pause is slower (a second or two).
- Rate limiting is per function instance (best-effort). Add Netlify rate-limit rules if abused.

## 7. Not included yet
Password reset & email verification (needs an email service) · email notifications · CSV import/export · OCR · multi-language pages · offline mode · "Independently verified" label.
