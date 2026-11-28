# TDC Dental Daysheet — notes for agents

Read the shared plan first: **MULLET156/TDC-Office-Plan** (README, PLAN, CONTRACT, DESIGN, SITE-OUTLINE, STATUS) and the kickoff `prompts/3-daysheet.md`. Follow CONTRACT.md exactly; propose changes as an issue there titled `Contract change: ...` and wait for Ryan.

Module id `daysheet`, port 3101, **read only**. Pages: Today (`/`, next clinic day when closed), any day (`/day?date=`), Appointment book (`/book`), This week (`/week`), Unscheduled (`/unscheduled`), patient panel (`/patient?patient=&apt=&date=`, `&fragment=1` for the panel only). Tiles: `/tiles/today`, `/tiles/lab-due`.

## Rules
- Node.js 20+ built-ins only. No npm dependencies.
- Pull `main` and check open PRs first. Short branch → PR → **merge it yourself when CI is green and your checks pass** (Ryan, 2026-11-16). Never push to `main` directly (the first "Start the repository" commit was the only exception, to give PRs a base). `main` deploys the design-stage app on Hostinger: after merging, check its `/health` and revert at once if something broke.
- **No patient data** in code, tests, issues, logs or screenshots, not even from the demo database. Tests use invented people (`test/helpers.js`).
- **Open Dental only through the gateway**, with this module's own key, via `vendor/opendental-core/` (copied with `node scripts/sync-core.js <version>`, never edited; `test/vendor.test.js` checks it). Reports used: `daysheet`, `xray_history`, `unscheduled_treatment`, `insurance_remaining`, `lab_cases_open`, `operatories`, and `daysheet_goals` (requested, optional: pages work without it). Pending asks are in docs/REPORT-REQUESTS.md; `scripts/fake-gateway.js` serves fake data shaped like them. Need another? Open `Report request: <name>` in opendental-claude; only the Connector agent changes that repo.
- **Stage guard** (CONTRACT §1): `lib/data.js` checks the gateway's `/health` stage at startup and every 5 minutes; on mismatch patient pages answer 503 and the cache is cleared.
- **Keep Open Dental data off disk.** In-memory cache only (60 s). No `data/` folder.
- **Logs:** path only, no query strings (they carry PatNums), no names.
- **Look:** DESIGN.md and the shared classes from `/shared/tdc.css` only; no own fonts or colours; no inline scripts (`public/daysheet.js`). Check 1400, 768 and 390 px and dark mode. Design questions go to the Shared Design agent (`Design: ...` issue in TDC-Office-Plan).
- Hygiene codes are left out by the gateway (`hygieneCodes` in its config, one office-wide list). Don't hard-code them here.
- Never print or commit secrets (`.env` is git-ignored).
- README and PR descriptions in plain language, Windows first, with "How to test".
- Update only the Dental Daysheet row in TDC-Office-Plan/STATUS.md, by PR there.
- Before a PR: `npm test`, and `node scripts/check-module.js http://127.0.0.1:3101 --env <this repo>\.env` from the Dashboard repo against a running copy (demo gateway: `npm run dev` in opendental-claude).
- Design direction (Ryan, 2026-11-27): blend the original Daysheet with his preview, keeping what suits most dental practices. Practice-specific things are settings, not code. Clinic days, closed dates and time zone come from the Dashboard's `X-TDC-Office` header (CONTRACT §3, issue #56, `lib/office.js`); `CLINIC_DAYS`/`OFFICE_TZ` are only the fallback. Names on lists are first initial + last name. Provider colours aren't in DESIGN.md: blocks and rows use status colours until the Shared Design agent adds them.
