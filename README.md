# TDC Dental Daysheet

Today's patients for Toledo Dental Care, on one page:

- **Today** and **any day**: every appointment, with time, chair, provider and procedures. Coloured tiles at the top filter the list: *Lab not back*, *Planned work*, *X-rays covered*, *Done*.
- **Tap a patient** to open the patient panel:
  - **Planned, not scheduled**: procedure, tooth, priority, date planned and fee. Hygiene codes are left out.
  - **X-rays** (BWX, FMX, Pano): last taken, the plan's limit (for example "1 per 12 months"), and the date it's next covered. *Overdue*, *Due today* and *Not covered yet* each have their own colour.
  - **Lab cases** for this visit, and any other open lab cases for the patient.
- **Unscheduled**: every patient with planned treatment that isn't scheduled, with the total and the oldest plan date, grouped by how long it has waited.
- Two **Dashboard tiles**: *Today's schedule* and *Lab cases due before seat*.

It is part of **TDC Office** ([the plan](https://github.com/MULLET156/TDC-Office-Plan)). Staff open it through the Dental Dashboard; it never shows up on its own. It **only reads** from Open Dental, and only through the office gateway.

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
6. Double-click **`start.cmd`**. You should see `Dental Daysheet 0.1.0 (design stage) listening on http://127.0.0.1:3101/`. Leave it open.
7. In the browser, open the Dashboard. The home page now shows **Today's schedule** and **Lab cases due before seat**, and the **Apps** menu has **Dental Daysheet**.

To stop it, close the `start.cmd` window (or press Ctrl+C in it).

## How to test

With the steps above running:

1. **Home page tiles.** On the Dashboard home, *Today's schedule* shows the number of patients and the next few appointments. *Lab cases due before seat* shows lab cases that aren't back yet with a seat appointment in the next 7 days. Tap a line on a tile: it opens that day with the patient panel open.
2. **Today.** Open **Apps → Dental Daysheet**. You should see the coloured tiles (Patients, Lab not back, Planned work, X-rays covered, Done), the blue banner with today's date, and the appointments grouped under MORNING and AFTERNOON.
   - Tap **Planned work**: only patients with planned, unscheduled treatment stay. Tap **Patients** to see everyone again.
   - Type part of a name or a code like `D2740` in the search box.
   - Change **Group by** to **Provider** or **Chair**. Reload the page: your choice is remembered on this device.
3. **Patient panel.** Tap any patient. Check that:
   - *Planned, not scheduled* lists procedures with tooth, priority and fee, and **no** hygiene codes (D0120, D1110, D4910 and so on).
   - *X-rays* shows BWX, FMX and Pano with the last date, the plan limit and the next covered date, coloured: red *Overdue*, amber *Due today*, grey *Not covered yet*.
   - *Lab cases for this visit* shows a lab case if one is tied to this appointment.
   - **Close** (or tapping outside, or Esc) closes it.
4. **Any day.** Tap **Pick a day** (or **Next ›**) and choose a day next week. Days with a lab case that isn't back show a red count on **Lab not back**.
5. **Unscheduled.** Tap **Unscheduled**. Each patient appears once, with the number of procedures, the total and the oldest plan date, grouped by *over a year / 6 to 12 months / under 6 months*. Try **Group by → Amount** and the **$1,000 and up** filter. Tap a patient to open the panel.
6. **Phone and tablet.** Open the same pages on a phone or tablet (or make the browser window narrow). The tiles become the bottom tab bar, and the panel slides up from the bottom.
7. **Dark mode.** Tap the moon button in the header.
8. **Safety check.** Close the demo gateway window and reload the Daysheet: it shows a red message (*"Could not load from Open Dental"* or *"Open Dental is not available here right now"*) instead of patient data. Start the demo gateway again and reload after a minute: the page works again.

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
| `OFFICE_TZ` | Time zone for "today". Default `America/Los_Angeles`. |

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
| `vendor/opendental-core/` | The shared Open Dental code, copied from opendental-claude 0.13.0. Never edit; update with `node scripts/sync-core.js <version>` |
| `test/` | Automated tests with invented patients |
