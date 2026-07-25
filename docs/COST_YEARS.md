# Cost-year projections (2030 / 2040 / 2050)

The Explorer's cost-year buttons re-price every cell for a future year. The
**resource profiles are held constant** — we are not simulating a future
climate, only applying future technology costs to the same hourly wind/solar
capacity factors. So all four cost-year maps come from one set of cached
profiles via `mapSweepAllYears` (`scripts/lib/lcohSweep.ts`); generating them
is a `npm run hex:recompute` with no provider calls.

## What changes between years

Only the techno-economic pack (`COST_PACKS` in `lcohSweep.ts`). Everything
else — finance (8 %/20 yr), water, the 200 MW sweep, the electrolyser stack
life/OPEX — is unchanged.

| Driver | 2024 | 2030 | 2040 | 2050 | Basis |
|---|---|---|---|---|---|
| Electrolyser CAPEX (USD/kW) | 1000 | 700 | 580 | 500 | ×0.70 / 0.58 / 0.50 |
| Solar PV CAPEX (USD/kWp) | 800 | 552 | 496 | 456 | ×0.69 / 0.62 / 0.57 |
| Onshore wind CAPEX (USD/kW) | 1200 | 1104 | 1056 | 1020 | ×0.92 / 0.88 / 0.85 |
| Electrolyser efficiency (LHV) | 60 % | 61 % | 63 % | 65 % | +1 / +3 / +5 pts |

## Provenance

The **2030** multipliers are derived from the **IEA Global Hydrogen Review
2025 — Assumptions Annex** (USD 2024):

- Electrolyser system CAPEX (global avg, installed): 2024 = 2000–2600, 2030 =
  1400–1820 USD/kW → midpoints 2300 → 1610 = **×0.70**.
- Solar PV cost decline (regional LCOE avg, a valid CAPEX-decline proxy since
  the model holds capacity factor and WACC constant): 2024→2030 ≈ **×0.69**.
- Onshore wind cost decline (regional LCOE avg): 2024→2030 ≈ **×0.92**.
- Electrolyser efficiency (LHV): 63 % → 64 % (annex); we express the same
  small gain on our 60 % base.

The **2040 and 2050** multipliers are **extrapolated** along IEA's stated
direction (declining learning, solar-led) — IEA's hydrogen publications are a
2030-horizon product and do not publish 2040/2050 CAPEX in accessible form.
These rows are clearly marked as projected in the UI. To replace them with
sourced values, obtain the IEA World Energy Outlook / Global Energy & Climate
Model input dataset and edit `COST_PACKS`, then `npm run hex:recompute`.

Scenario: IEA **Announced Pledges Scenario (APS)**, the middle of IEA's three
scenarios. Cost-down is applied **globally** (not region-specific).

Source: IEA Global Hydrogen Review 2025 — Assumptions Annex
(https://iea.blob.core.windows.net/assets/15673ab3-a86a-4434-bff4-490bb42d3563/GlobalHydrogenReview2025AssumptionsAnnex.pdf).
