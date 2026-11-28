# TDC Dental Daysheet

The day at a glance for a dental office, built for Toledo Dental Care but meant to suit most practices that use Open Dental.

- **Today:** goal cards for the office and each provider on the schedule (scheduled production against the provider's hourly goal × scheduled hours), then every appointment grouped Morning / Afternoon. Each row shows:
  - the time and length, and the name as first initial + last name, patient number and age;
  - what's being done, plus chips for provider, chair, **Add FMX / Add BWX** (or "on appt"), **Unsched Tx $…**, **No ins max on file**, confirmation and lab case;
  - the production and the insurance carrier on the right.

  Coloured tiles filter the list: *Patients*, *X-rays to add*, *Unsched Tx* (the red corner badge counts those with insurance left), *Lab not back*, *Done*. On a day the office is closed, Today shows the next clinic day.
- **Tap a patient** for the panel:
  - planned treatment that isn't scheduled (hygiene left out; a crown and its buildup, or an implant crown and its abutment, show as one item), sorted by priority then fee;
  - insurance left this year ("$932 of $2,000 left");
  - x-rays due with the last FMX and BWX dates, plus the plan's frequency limits and next covered dates;
  - lab cases for the visit.
- **Appointment book:** the day by chair, like Open Dental's. Each block shows the name, procedure and production, with a small **+FMX / +BWX** tag. Tapping a block opens that patient. On phones the chairs scroll sideways.
- **This week:** patients coming in this week who have insurance left *and* unscheduled treatment, grouped by day with totals.
- **Unscheduled:** every patient with planned treatment that isn't scheduled. It's grouped by *insurance left this year / no insurance max on file / used up / no insurance*, or by plan age or amount, with the total and an insurance-left bar.
- Two **Dashboard tiles**: *Today's schedule* and *Lab cases due before seat*.

It is part of **TDC Office** ([the plan](https://github.com/MULLET156/TDC-Office-Plan)). Staff open it through the Dental Dashboard; it never shows up on its own. It **only reads** from Open Dental, and only through the office gateway.

**Waiting on the gateway:** goal cards, production, age and the "$… of $… left" bar need report changes the Connector agent hasn't released yet ([docs/REPORT-REQUESTS.md](docs/REPORT-REQUESTS.md)). Until then those parts just don't show. To see everything now, use the fake gateway below.

## What you need

- **Node.js 20 or newer.** Check in a Command Prompt: `node -v`. If it's missing or older, install the "LTS" version from [nodejs.org](https://nodejs.org).
- The **Dental Dashboard** running (it handles logins).
- An **Open Dental gateway**: on a laptop, the demo gateway with fake data; in the design stage, the office gateway (demo database) through its secure tunnel; in the live stage, the gateway on the office server.

Nothing to install with npm: this module uses Node.js only.

## Try it on your Windows computer (fake data)

This runs everything on your own computer with made-up patients.

1. **Start the demo gateway.** Download [opendental-claude](https://github.com/MULLET156/opendental-claude) (**Code → Download ZIP**, then right-click → **Extract All**) and double-click **start-demo.cmd** in it. Leave that window open. It prints a test key for `daysheet` (it starts with `odg_test_daysheet`).
2. **Start the Dashboard** as its README says, and log in as the owner.
3. **Add the Daysheet to the Dashboard.** In the Dashboard: **Settings → Modules → Add a module**:
   - id: `daysheet`
   - address: `http://127.0.0.1:3101`
   - leave **Secret** empty and click **Add module**. The Dashboard shows a new secret once. Keep that page open.
4. **Download this repository** (**Code → Download ZIP**, then **Extract All**).
5. In the extracted folder, copy **`.env.example`** and rename the copy to **`.env`**. Open `.env` in Notepad and fill in:
   - `MODULE_SECRET=` the secret from step 3
   - `GATEWAY_KEY=` the `daysheet` test key from step 1
   - leave the rest as it is. Save.
6. Double-click **`start.cmd`**. You should see `Dental Daysheet 0.2.0 (design stage) listening on http://127.0.0.1:3101/`. Leave it open.
7. In the browser, open the Dashboard. The home page now shows **Today's schedule** and **Lab cases due before seat**, and the **Apps** menu has **Dental Daysheet**.

To stop it, close the `start.cmd` window (or press Ctrl+C in it).

### Seeing every new part (fake gateway)

The Connector's demo gateway doesn't have the goal and production columns yet. This repository has its own pretend gateway with made-up patients that does:

1. Close the demo gateway window from step 1 above.
2. In this folder, open a Command Prompt (type `cmd` in the folder's address bar and press Enter) and run `npm run fake-gateway`. Leave it open.
3. In `.env` set `GATEWAY_URL=http://127.0.0.1:8788` and `GATEWAY_KEY=odg_fake_daysheet_key_0001`, then restart `start.cmd`.

## How to test

With the steps above running (the fake gateway shows every part):

1. **Home page tiles.** On the Dashboard home, *Today's schedule* shows the number of patients and production and the next appointments; *Lab cases due before seat* lists cases not back with a seat appointment in the next 7 days. Tap a line: it opens that patient.
2. **Today.** Open **Apps → Dental Daysheet**. Check the five coloured tiles, the blue banner (patients · production), the goal cards (office, then each provider, with a dark tick at the goal), and the rows under MORNING and AFTERNOON with a total on the right of each heading.
   - Tap **X-rays to add**: only rows with an amber *Add FMX* / *Add BWX* chip stay. Tap **Patients** to see everyone again.
   - Search for a name or a code like `D2740`. Try **Group by → Provider** and **Chair** (remembered on this device).
3. **Patient panel.** Tap a patient with an *Unsched Tx* chip. Check:
   - crowns with a buildup appear as one line "Crown + buildup #n" with both codes, sorted by priority;
   - **Insurance this year** shows "$… of $… left" (amber under $500), or *No ins max on file*;
   - **X-rays** shows *Add* or *on appt* chips, the last FMX and BWX dates, and the plan's limits;
   - *Close*, tapping outside, or Esc closes it.
4. **Appointment book.** Tap **Appointment book**. Chairs run across in Open Dental's order with the provider under each; times run down. Tap a block: Today opens on that patient. On a phone, swipe the chairs sideways.
5. **This week.** Tap **This week**. Only patients with insurance left and unscheduled treatment are listed, by day, with "$… ins left" (red under $100). Use **Next ›** for next week.
6. **Unscheduled.** Tap **Unscheduled**. Groups: *Insurance left in 2026*, *No insurance max on file - verify coverage*, *used up*, *no insurance*. Try **Group by → Plan age** and the **$1,000 and up** filter. Tap a patient for the panel.
7. **Phone and dark mode.** Open the pages on a phone (tiles become the bottom tab bar; goal cards sit two to a row), and try the moon button.
8. **Safety check.** Close the gateway window and reload: a red message replaces the patient data. Start it again and reload after a minute.

For developers: `npm test` runs the automated tests (fake data only), and from the Dashboard folder `node scripts\check-module.js http://127.0.0.1:3101 --env C:\path\to\TDC-Dental-Daysheet\.env` checks the module against the contract.

## Design stage: Hostinger

In the design stage the Daysheet runs as its own **Node.js app on Hostinger**, deployed from this repository's `main` branch, reading Open Dental's **demo database** through the office gateway's secure tunnel. Step-by-step: [docs/HOSTINGER.md](docs/HOSTINGER.md).

## Live stage: office server (later)

The same code runs on the office server. Set `TDC_STAGE=live`, `PORT=3101` and `GATEWAY_URL=http://127.0.0.1:8787` in `.env`. In the live stage it only listens on `127.0.0.1`, so only the Dashboard on the same server can reach it. The Installer will set it up as a Windows service; until then, `start.cmd` runs it by hand.

## Settings (`.env`)

| Setting | What it is |
|---|---|
| `TDC_STAGE` | `design` (Hostinger + demo database) or `live` (office server). It must match what the gateway says, or patient pages stop. |
| `PORT` | `3101`. On Hostinger leave it out; Hostinger sets it. |
| `HOST` | Hostinger only: `0.0.0.0`. Ignored in the live stage. |
| `MODULE_SECRET` | From Dashboard → Settings → Modules. 64 characters. |
| `GATEWAY_URL` | The gateway's address. |
| `GATEWAY_KEY` | This module's own gateway key (`node gateway/cli.js new-key daysheet` in opendental-claude). |
| `OFFICE_TZ` | Time zone for "today" **if the Dashboard doesn't send one**. Default `America/Los_Angeles`. |
| `CLINIC_DAYS` | Days the office sees patients (0 = Sunday … 6 = Saturday), **only if the Dashboard doesn't send them**. Default `1,2,3,4,5`. |
| `XRAY_FMX_MONTHS` | FMX is due this many months after the last one. Default `60` (5 years). |
| `XRAY_BWX_MONTHS` | Bitewings are due this many months after the last bitewings or FMX. Default `12`. |
| `INSURANCE_LOW` | Insurance left below this shows amber. Default `500`. |

**Clinic days, closed dates and the time zone are set once for every app in Dashboard → Settings → Office** (CONTRACT §3, `X-TDC-Office`). The Daysheet uses those; the two settings above are only a fallback for an older Dashboard. On a day the office is closed, Today shows the next clinic day, and opening a closed date shows *Office closed*.

`.env` is never committed to GitHub. Never paste the secret or keys into GitHub, email or chat.

## How it keeps patient data safe

- **Read only.** It never writes to Open Dental, and refuses anything but GET.
- **Gateway only**, with its own key that can only read the schedule, x-rays, planned treatment and lab cases.
- **Stage check.** At startup and every 5 minutes it asks the gateway which stage it's in. If that doesn't match `TDC_STAGE` (for example the gateway switched to the real database while this copy still runs on Hostinger), it stops showing patient pages by itself and forgets what it had.
- **Nothing on disk.** Open Dental answers are kept in memory for one minute at most, never saved to a file.
- **Logs** list only who opened which page, never patient names or numbers.
- **Every request is signed** by the Dashboard; anything else gets "Unauthorized".

## Files

| Path | What |
|---|---|
| `server.js` | Starts the module |
| `lib/app.js` | Pages, tiles, manifest, signatures, logs |
| `lib/data.js` | Reads the gateway reports and shapes them for the pages |
| `lib/render.js` | The HTML, using the shared TDC look |
| `public/daysheet.js` | The page script (tiles, search, group by, patient panel) |
| `scripts/fake-gateway.js` | A pretend gateway with made-up patients, for trying the pages |
| `docs/REPORT-REQUESTS.md` | What the Daysheet has asked the Connector agent to add |
| `vendor/opendental-core/` | The shared Open Dental code, copied from opendental-claude 0.13.0. Never edit; update with `node scripts/sync-core.js <version>` |
| `test/` | Automated tests with invented patients |
