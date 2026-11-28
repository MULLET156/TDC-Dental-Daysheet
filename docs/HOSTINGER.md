# Putting the Daysheet on Hostinger (design stage)

In the design stage the Daysheet is its **own Hostinger Node.js app** on its own subdomain (for example `daysheet-dev.toledodentalcare.com`). It reads Open Dental's **demo database** through the office gateway and its secure tunnel (Cloudflare Tunnel). Every merge into `main` on GitHub redeploys it.

**Before you start** you need:
- The Dental Dashboard on Hostinger (already live).
- The **office gateway** running with `"stage": "design"`, and its tunnel address (`https://…`). See opendental-claude's `docs/truenas.md`.
- A **gateway key for the Daysheet**: on the computer that runs the gateway, in the opendental-claude folder: `node gateway/cli.js new-key daysheet --preset daysheet`. It prints a key starting `odg_`. Keep it for step 4; don't put it in GitHub, email or chat.

## One-time setup

1. Log in to **hPanel** → **Websites** → **Add Website** → **Node.js web app** → **Import Git repository**.
2. Choose **MULLET156/TDC-Dental-Daysheet**, branch **main**.
3. Build settings:
   - **Framework:** Other
   - **Node version:** 22 (20 or newer works)
   - **Build command:** leave empty (there's nothing to install)
   - **Entry file:** `server.js`
4. In the **Dashboard** on Hostinger: **Settings → Modules → Add a module**: id `daysheet`, address = this app's `https://` address (step 6), leave **Secret** empty, **Add module**. It shows a new secret once.
5. **Environment variables** of the Daysheet app:

   | Name | Value |
   |---|---|
   | `TDC_STAGE` | `design` |
   | `HOST` | `0.0.0.0` |
   | `MODULE_SECRET` | the secret from step 4 |
   | `GATEWAY_URL` | the office gateway's tunnel address, `https://…` |
   | `GATEWAY_KEY` | the daysheet gateway key |
   | `OFFICE_TZ` | `America/Los_Angeles` |

   Don't set `PORT`; Hostinger sets it. No `DATA_DIR` is needed: the Daysheet stores nothing.
6. Click **Deploy**. When it's running, open `https://<its address>/health`. You should see `{"ok":true,"version":"0.2.0","contract":1}`. Any other page says **Unauthorized**: that's correct, only the Dashboard may open it.
7. Open the Dashboard: the two Daysheet tiles appear on the home page, and **Apps** lists **Dental Daysheet**.

## If something's wrong

- **Tiles say "Paused" / pages say "Open Dental is not available here right now":** the gateway isn't answering, or it says it's not in the design stage. Check `GATEWAY_URL/health` in a browser: it must show `"stage":"design"`. The Daysheet checks again every 5 minutes (every 30 seconds while paused).
- **"This module's gateway key isn't allowed":** the key was made without `--preset daysheet`.
- **Dashboard says the module isn't responding:** check the app's address in Dashboard → Settings → Modules and that `MODULE_SECRET` matches.

## Moving to the live stage

Before Open Dental is switched to the real database, the Daysheet moves **off Hostinger** to the office server (PLAN.md, "Two stages"). When the gateway is set to `live`, this Hostinger copy stops showing patient pages by itself. Then delete the Hostinger app.

## Settings that differ between offices

Clinic days, closed dates and the time zone are set in **Dashboard → Settings → Office**, not here. Add these only if the defaults don't fit: `XRAY_FMX_MONTHS`, `XRAY_BWX_MONTHS`, `INSURANCE_LOW`. See the README's Settings table.
