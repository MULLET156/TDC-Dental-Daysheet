# Report requests for the Connector agent

The Daysheet needs a little more from the gateway. Filed in **MULLET156/opendental-claude** on 2026-11-27: [#19 daysheet_goals](https://github.com/MULLET156/opendental-claude/issues/19) and [#20 more columns](https://github.com/MULLET156/opendental-claude/issues/20). Until they're released, the Daysheet uses fake data shaped like this and simply hides what it doesn't get yet.

---

## Report request: daysheet_goals

**What it's for:** the goal cards on the Daysheet's Today page (office plus each provider on the schedule).

**Input:** `date` (required).

**Output, one row per provider with a schedule or scheduled work that day:**

| Column | Meaning |
|---|---|
| `ProvNum` | provider |
| `Provider` | provider Abbr |
| `IsHygienist` | `provider.IsSecondary` |
| `HourlyGoal` | `provider.HourlyProdGoalAmt` |
| `Hours` | that provider's scheduled hours that day (provider schedule rows, `SchedType = 1`, StopTime − StartTime) |
| `Goal` | `HourlyGoal × Hours`, rounded to cents |
| `ScheduledProduction` | office fees (`ProcFee × (UnitQty + BaseUnits)`) of procedures with that ProvNum attached to that day's Scheduled and Complete appointments |

Please add it to the `daysheet` preset.

---

## Report request: more columns on daysheet and insurance_remaining

Both reports already compute these, but the `columns` list trims them before they leave the gateway.

**daysheet**, add:

| Column | Meaning |
|---|---|
| `ScheduledFee` | already in the SQL: production of the procedures on the appointment |
| `ProvNum`, `OpNum` | already in the SQL |
| `OpOrder` | `operatory.ItemOrder` (for the appointment book's column order) |
| `Age` | whole years on the appointment date, from `patient.Birthdate` (null if no birthdate). Age only, no birthdate. |
| `ProcDescript` | `appointment.ProcDescript` (the short procedure description Open Dental shows on the appointment) |

**insurance_remaining**, add `AnnualMax`, `Used` and `BenefitYearStart` (all already in the SQL), so the Daysheet can draw "$932 of $2,000 left". Note for service-year plans: the benefit-year window already follows `MonthRenew`; please keep that.

No new patient fields beyond Age.
