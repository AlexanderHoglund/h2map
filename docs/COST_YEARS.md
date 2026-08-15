# Cost-year projections (2030 / 2040 / 2050)

The Explorer's cost-year buttons re-price every cell for a future year. The
**resource profiles are held constant** — we are not simulating a future
climate, only applying future technology costs to the same hourly wind/solar
capacity factors. So all four cost-year maps come from one set of cached
profiles via `mapSweepAllYears` (`scripts/lib/lcohSweep.ts`); generating them
is a `npm run hex:recompute` with no provider calls.

## What changes between years

Only the techno-economic pack (`COST_PACKS` in `lcohSweep.ts`). Everything
else — finance (8 %/20 yr), water, the 200 MW sweep, the electrolyser OPEX
fraction — is unchanged.

| Driver | 2024 | 2030 | 2040 | 2050 | Basis |
|---|---|---|---|---|---|
| Electrolyser CAPEX (USD/kW) | 2300 | 1610 | 1334 | 1150 | ×0.70 / 0.58 / 0.50 |
| Solar PV CAPEX (USD/kWp) | 691 | 509 | 349 | 297 | ×0.74 / 0.51 / 0.43 |
| Onshore wind CAPEX (USD/kW) | 1041 | 911 | 850 | 850 | ×0.88 / 0.82 / 0.82 |
| Electrolyser efficiency (LHV) | 60 % | 61 % | 63 % | 65 % | +1 / +3 / +5 pts |
| Stack life (h) | 50 000 | 75 000 | 100 000 | 125 000 | ×1.5 / 2.0 / 2.5 |

**Corrected 2026-08-02.** The 2024 electrolyser anchor was previously **1000
USD/kW**, which contradicted the very IEA basis the multipliers are derived
from (midpoint 2300). The realism pass re-based it to 2300 and re-derived the
future years from the same source.

**Corrected 2026-08-15.** Generation CAPEX was re-based from IRENA 2023
(800 / 1200) to **IRENA *Renewable Power Generation Costs in 2024*** (691 /
1041) — a map labelled 2024 had been running 2023 costs. The future-year
generation multipliers were then re-derived from IRENA as well, replacing
multipliers taken from IEA's LCOE-decline proxy. This matters beyond
housekeeping: the level and the trajectory now come from **one** source per
driver instead of two, which is what the mixed-vintage problem was.

## Provenance

Two drivers, two sources, each internally consistent:

### Electrolyser — IEA Global Hydrogen Review 2025, Assumptions Annex (USD 2024)

- System CAPEX (global avg, installed): 2024 = 2000–2600, 2030 = 1400–1820
  USD/kW → midpoints 2300 → 1610 = **×0.70**.
- Efficiency (LHV): 63 % → 64 % (annex); the same small gain expressed on our
  60 % base.
- Stack life: 50 000 h is IEA's stated **economic optimum** (up to 95 000 h
  technically achievable). The ×1.5 / ×2.0 / ×2.5 durability trajectory is an
  extrapolation along IEA's direction.

### Generation — IRENA Renewable Power Generation Costs in 2024 / 2025

IRENA publishes direction rather than a year-by-year table:

- **Solar PV**: total installed cost falls **~40 % over the coming decade**
  (and below USD 600/kW as early as 2026). Applied as a geometric decade rate
  from 691, decelerating after the first decade as learning rates flatten:
  509 (2030), 349 (2040), 297 (2050).
- **Onshore wind**: **~20 % over the coming decade**, then **stabilising at
  USD 850–1 000/kW**. Applied as the same geometric rate but **floored at
  850**, because continuing 20 %/decade indefinitely gives 583 by 2050 and
  contradicts the "stabilises" language. This is why the 2040 and 2050 wind
  figures are identical — the projection has reached its floor, and a test
  asserts no projected wind value falls below it.

Note the wind trajectory **reversed direction** versus the previous table:
IEA's regional LCOE proxy gave ×0.92 by 2030, IRENA's decade view is steeper
near-term (×0.88) but flatter afterwards.

The **2040 and 2050** figures remain **extrapolations** for both drivers —
IEA's hydrogen publications are a 2030-horizon product and IRENA publishes a
decade horizon; neither gives mid-century CAPEX in accessible form. These
rows are clearly marked as projected in the UI. To replace them with sourced
values, obtain the IEA World Energy Outlook / Global Energy & Climate Model
input dataset and edit `COST_PACKS`, then `npm run hex:recompute`.

Scenario: IEA **Announced Pledges Scenario (APS)**, the middle of IEA's three
scenarios. Cost-down is applied **globally** (not region-specific).

Source: IEA Global Hydrogen Review 2025 — Assumptions Annex
(https://iea.blob.core.windows.net/assets/15673ab3-a86a-4434-bff4-490bb42d3563/GlobalHydrogenReview2025AssumptionsAnnex.pdf).
