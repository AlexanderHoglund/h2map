# Proposal: capital deployment schedule (phased build)

**Status:** open · **Type:** modelling convention · **Priority:** medium
**Filed:** 2026-08-01 (as a tracked doc — `gh` CLI unavailable in the
authoring environment; please mirror to GitHub Issues).

## Summary

The corridor engine charges **all capital in year 1, undiscounted**
(discount factor 1.0), while revenue and operating cost accrue over the full
horizon (15 years for the reference scenario). Real projects spend capital
across a build period *before* first cargo. Charging it entirely at the point
of maximum discount factor **maximises its present value** — and capital is
the dominant term in the gap.

This is a faithful transcription of the *Green Corridor Model Simplified*
workbook and **must remain the default** so `fixtures/golden/corridor/excel-baseline.json`
and the reference scenario's numeric outputs stay bit-identical. But it is an
Excel convention, not a financing assumption, and the source study
(MMMCZCS Chilean copper corridor) models a **phased build**. This issue
proposes making the deployment schedule configurable, defaulting to
all-in-year-1.

## Why it matters (reference scenario)

`scenario-chile-copper-corridor` — Mejillones → Japan, 10 Handymax, 15 yr
from 2030, e-ammonia dedicated plant vs LSFO purchase, self-designed carbon
$280/t well-to-wake.

- Green CAPEX: **$1,690.00m**, all charged year 1 (df 1.0).
- Fossil CAPEX: **$360.00m**, likewise.
- ΔCAPEX = **$1,330m** — **75.5%** of the **$1,762.21m** lifetime gap.

Because the single largest driver of the gap sits at the one point in the
horizon with no discount, the convention is not neutral: it inflates the PV
of capital relative to a phased build.

## Proposed change

Add an optional **capital deployment schedule**: a per-side weight vector over
N years (spend spread before or across the start year), defaulting to
`[1.0]` at year 1 — i.e. exactly today's behaviour. When present, each side's
CAPEX is split by the weights and each tranche discounted at its own year's
factor. Default-absent keeps the golden fixture untouched.

Open design questions to resolve in the implementation issue:

- **Valuation date.** Phasing *across* the start year (years 1..N) is
  unambiguous within the existing discounting. Phasing *before* first cargo
  (years 0, −1, …) requires choosing the valuation date; discounting to the
  investment-decision date vs the first-operating-year date moves the PV in
  opposite directions. The study's convention needs to be pinned before
  implementing the pre-start case.
- Whether the schedule is shared or per-side (green newbuild + plant vs
  fossil newbuild may phase differently).
- Interaction with the `legacyExcelConstruct` flag and the frozen golden
  (must stay default-inert).

## PV effect estimate — 3-year 30/40/30 profile

Spreading CAPEX over years 1–3 as 30% / 40% / 30% (across the start year, the
unambiguous case), discount rate 8%, `df_t = 1/1.08^(t−1)`:

| year | df | weight |
|---|---|---|
| 1 | 1.000000 | 0.30 |
| 2 | 0.925926 | 0.40 |
| 3 | 0.857339 | 0.30 |

PV factor of the profile = 0.30·1.0 + 0.40·0.925926 + 0.30·0.857339 =
**0.927572**.

- **Green CAPEX:** $1,690.00m → $1,567.60m — a **−$122.40m** reduction in PV.
- **Fossil CAPEX:** $360.00m → $333.93m — −$26.07m if phased symmetrically.

Effect on the lifetime gap ($1,762.21m):

| phasing | gap | change |
|---|---|---|
| all-in-year-1 (today) | $1,762.21m | — |
| green CAPEX phased 30/40/30 | **$1,639.81m** | **−$122.40m (−6.95%)** |
| both sides phased 30/40/30 | $1,665.88m | −$96.33m (−5.47%) |

So a plausible 3-year build shaves roughly **$95–122m (5–7%)** off the
headline gap — material, and entirely an artefact of *when* capital is booked,
not *how much* it is. A steeper front-loaded profile or a pre-start valuation
date would move it further.

## Out of scope for the chart task

This was surfaced by the results-chart rework (the year-1 spike the charts now
make legible **is** this convention) and is filed as report-only. **Do not
implement as part of the chart work.** The charts change rendering only; the
model's numbers are unchanged.
