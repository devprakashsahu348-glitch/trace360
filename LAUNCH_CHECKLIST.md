# TRACE360 — Launch checklist (Vercel + Neon + GitHub, all free)

## 1. Put the code on GitHub (use GitHub Desktop: it keeps folders and hidden files)
1. Unzip `trace360-vercel.zip` (right-click → Extract All).
2. Install **GitHub Desktop** (desktop.github.com), sign in, then **File → Clone repository** → pick your existing `trace360` repo.
3. In the cloned folder, delete the old files (keep the hidden `.git` folder), then copy in **everything** from the unzipped `trace360` folder (turn on *View → Hidden items* so `.github`, `.gitignore` and `.env.example` come along).
4. In GitHub Desktop: write `TRACE360 on Vercel`, **Commit to main**, **Push origin**.
5. Check on github.com that you see `api`, `server`, `site`, `scripts`, `tests`, `package.json`, `vercel.json` at the top level.

## 2. Neon (database)
You already have the project `trace360` (AWS US East Ohio). Click **Connect**, tick *Show password*, copy the connection string, and remove `&channel_binding=require` if present.
Tables are created automatically on the first request, and the earlier test tables are upgraded in place.

## 3. Vercel (hosting)
1. vercel.com → sign up with GitHub → **Add New → Project** → import `trace360`.
2. Framework preset: **Other**. Leave Build Command and Output Directory as they are (`vercel.json` sets them).
3. Open **Environment Variables** and add at least:

| Name | Value |
|---|---|
| `DATABASE_URL` | your Neon string (required) |
| `SECRET_KEY` | 48+ random characters (required) |
| `DEMO_LOGIN` | `false` |
| `CONTACT_EMAIL` / `OWNER_NAME` | `devprakashsahu348@gmail.com` / `Dev Prakash Sahu` (already the defaults) |

The full list (email, Razorpay, WhatsApp, Google Analytics, custom domain) is in `.env.example`. Click **Deploy**.
4. After the first deploy, copy your address (for example `https://trace360.vercel.app`). If it differs from the name Vercel guessed, add `SITE_URL` with the exact address and **Redeploy**, so canonical tags, the sitemap and QR codes use it.
Note: `SITE_URL`, `WHATSAPP_NUMBER` and `GA_ID` are read when the site is built, so redeploy after changing them.

## 4. Test the live site (10 minutes)
- `/api/health` shows `{"ok":true}`; `/t/demo-tea-001` shows the demo trace page.
- Sign up (try mismatching passwords, then a valid one) → you land in the workspace → create a product, a batch, events, attach a PDF, publish.
- Scan the batch QR with your phone: it opens the public page.
- Sign out, sign in, then **Forgot password** (needs the email settings below).
- Open the contact form and send a message.
- Try dark mode, the cookie banner, search (press `/`), and the mobile menu on your phone.
- Visit a wrong address such as `/abc` to see the custom 404.
- Test in **Chrome and Safari** (iPhone or Mac). I could only test Chromium, so please check Safari yourself and tell me anything that looks off.

## 5. Switch on the extras (each takes a few minutes)
**Password-reset and contact emails (Gmail):** turn on 2-step verification on your Google account → Security → *App passwords* → create one → add `SMTP_HOST=smtp.gmail.com`, `SMTP_PORT=587`, `SMTP_USER=devprakashsahu348@gmail.com`, `SMTP_PASS=<the 16-character app password>`, `MAIL_FROM=TRACE360 <devprakashsahu348@gmail.com>` → Redeploy. (Later you can move to a domain email, for example with Zoho Mail's free plan, and change these values.)
**Payments (Razorpay):** create an account at razorpay.com → *Settings → API Keys* → generate **Test** keys → add `RAZORPAY_KEY_ID` and `RAZORPAY_KEY_SECRET` → Redeploy → in the workspace open **Billing**, pay with Razorpay's test card, and confirm the plan activates. Switch to **Live** keys only after Razorpay approves your KYC (it needs your business and bank details, and may ask for your terms, privacy and refund pages, which are already on the site).
**WhatsApp button:** set `WHATSAPP_NUMBER` (digits with country code) → Redeploy. The link preview uses the share image and page descriptions already in place; to refresh WhatsApp's cache, paste the link into the *Facebook Sharing Debugger* once.
**Google Analytics:** create a GA4 property → copy the Measurement ID (`G-…`) → set `GA_ID` → Redeploy. It loads only after a visitor accepts cookies.
**Submit to Google:** open Google Search Console → add your site (verify with the DNS record or HTML tag they give) → *Sitemaps* → submit `sitemap.xml`.
**Custom domain:** Vercel → Project → *Settings → Domains* → add it and follow the DNS instructions (HTTPS padlock is automatic) → set `SITE_URL` to it → Redeploy → reprint any QR codes made on the old address.
**Backups:** Neon keeps a short history on the free plan. For your own copy, run `pg_dump "<your Neon connection string>" > backup.sql` monthly (needs PostgreSQL tools), and keep it somewhere private.

## 6. Details I still need from you
1. Your final domain (or confirm the free `*.vercel.app` address).
2. The WhatsApp number to show (digits with country code), or say no WhatsApp.
3. Which email you want password resets to come from (Gmail now, or a domain email later).
4. Whether you will take real payments now (Razorpay account) or keep billing switched off.
5. Refund rules you want. The payment terms currently say: duplicate or mistaken charges are refunded in full, other requests within 7 days are considered case by case, plans last 30 days and never auto-renew.
6. Whether any plan or service is free for cooperatives (public welfare), so I can add that to Pricing.
7. A business address if you want one shown (it also enables local-business schema).
8. Your Google Analytics ID, if you want analytics.

## 7. Free-tier limits and honest notes
- Evidence files are stored inside the Neon database (limit 4 MB each, 0.5 GB total on the free plan). Heavy use will need object storage later (Vercel Blob or Cloudflare R2).
- Vercel Hobby is for personal and non-commercial use. Taking payments is commercial use, so move to a paid plan when you start charging.
- Neon may pause an idle database, so the first request after a quiet spell is slower.
- Legal pages are plain-language drafts. Have them reviewed by a qualified adviser (and check food-labelling rules such as FSSAI) before relying on them. Do not describe TRACE360 as certifying compliance.
- Not included yet: email verification at sign-up, CSV import/export, multi-language pages, offline mode, the "Independently verified" label (needs a real third-party process).
