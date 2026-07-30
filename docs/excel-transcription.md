# Green Corridor workbook transcription

Cell-by-cell transcription of **`Green_Corridor_Model_Simplified_30_07.xlsx`**
into the design of the corridor engine (`@h2map/corridor-engine`) and its
resolution layer (`@h2map/corridor-schema`). Per the build plan, the engine
must reproduce this workbook **exactly** (golden fixture, 1e-9 relative)
before any improvement; every formula below is transcribed as implemented,
including its quirks, with divergences deferred to Phase-1 flags.

## 1. Provenance

- Workbook: `Green_Corridor_Model_Simplified_30_07.xlsx` (repo root)
- sha256: `d3b219379402e211249ac336d98461fca98eb9c742dfde9498f03c045da38fbd`
- Tabs (9): Cover, Cargo, Vessel, Fuel, Port, Regulation, Calculation, Output, Data_tables
- Transcribed: 2026-07-30, openpyxl 3.1.2 (`data_only=False` for formulas, `=True` for cached values)
- Machine-readable companion: [`excel-transcription-dump.json`](excel-transcription-dump.json)
  (every non-empty cell, formula + cached value), regenerable via
  `python scripts/corridor/transcribe.py` (byte-deterministic). The same script
  emits the golden expected file from **cached values only** — formulas are
  never re-evaluated.
- Any workbook change ⇒ new sha256 ⇒ NEW reference-bundle id and NEW fixture
  pair. Existing fixtures are frozen (see `fixtures/golden/corridor/README.md`).

## 2. Timeline semantics

- Year columns: `Calculation!D..AQ` = year index 1..40, the index baked into
  each column's formulas as a literal constant.
- Calendar year (row 8): `Cargo!$D$14 + idx − 1` (fixture: 2027..2046).
- Horizon guard: every row wraps in `IF(idx <= Cargo!$D$15, …, 0)` (or `""` for
  the calendar row). The engine models **horizon-length arrays only**
  (`Timeline.years`, length = `horizonYears`) — no 40-column padding.
- Engine home: `src/timeline.ts` (`buildTimeline`).

## 3. Input-resolution convention

Every input row across Cargo/Vessel/Fuel/Port is the triplet
**D = your override, F = benchmark (INDEX/MATCH into Data_tables or a derived
formula), E = `IF(D="", F, D)` = value used**. Two special forms:

- Fuel production capex/opex: `E = IF(sourcing="Purchase", 0, IF(D="", F, D))`
  — Purchase forces 0 regardless of override.
- `Cargo!E17` (WACC): benchmark = country lookup; the discount factor reads E17.

Engine mapping: `@h2map/corridor-schema/src/resolve.ts` — a single primitive
`resolve(override, benchmarkFn)` with `Resolved<T> = { value, source }`,
`source: "override" | "benchmark" | "derived"` (derived = computed benchmarks:
distance-mode consumption, vessel premium, fossil ×0.3/`=0` rules,
Purchase-zeroing — in Excel these ARE the F cells, so precedence is identical).
The engine itself receives only bare resolved scalars (`toSideInputs`).

## 4. Scenario-input inventory (cell → `ScenarioInput` field)

| Cell | Meaning | Field |
|---|---|---|
| Cargo!D6 | Country (WACC benchmark key) | `cargo.countryId` |
| Cargo!D7 | Corridor type | `cargo.routeType` (cosmetic in v1) |
| Cargo!D8–D10 | Corridor/port names | out of model (labels) |
| Cargo!D11 | One-way distance, nm | `cargo.oneWayDistanceNm` |
| Cargo!D14 | Model start year | `cargo.startYear` |
| Cargo!D15 | Years modelled (max 40) | `cargo.horizonYears` |
| Cargo!D16 | Annual cargo throughput | `cargo.unitsPerYear` |
| Cargo!D17/E17/F17 | WACC override/used/country benchmark | `cargo.waccOverride` |
| Cargo!D18 | Inflation | `cargo.inflation` |
| Vessel!D6 | Vessel type (shared) | `vessel.typeId` |
| Vessel!D7 | Number of vessels | `cargo.vessels` |
| Vessel!D8 | Roundtrips/yr/vessel | `cargo.roundtripsPerYear` |
| Vessel!D12/D13 | Green vessel capex/opex overrides | `vessel.green.*` |
| Vessel!D18/D19 | Fossil vessel capex/opex overrides | `vessel.fossil.*` |
| Fuel!D4 | Consumption basis (Distance / vessel benchmark) | `vessel.consumptionMode` |
| Fuel!D8 / D21 | Green / fossil fuel type | `green.fuelId` / `fossil.fuelId` |
| Fuel!D9 / D22 | Sourcing Construct/Purchase | `green.sourcing` / `fossil.sourcing` |
| Fuel!D11–D17 / D24–D30 | Price, combustion EF, LHV, WTW, consumption, prod capex, prod O&M overrides | `green.overrides.*` / `fossil.overrides.*` |
| Port!D8/D9, D11/D12 | Green storage / barge capex+opex overrides | `green.overrides.portStorage*/barge*` |
| Port!D17/D18, D20/D21 | Fossil storage / barge overrides | `fossil.overrides.*` |
| Regulation!D6–D9 | ETS on, EUA €, EURUSD, scope | `regulation.ets.*`, `regulation.eurUsd` |
| Regulation!D14–D18 | FuelEU on, penalty, VLSFO MJ/t, baseline, scope | `regulation.fuelEu.*` |
| Regulation!D24–D27 | 45Z on, US-produced, rate $/gal, MJ/gal (122.5) | `regulation.ira45z.*` (MJ/gal = bundle constant) |
| Regulation!D31–D36 | Self-designed on + 5 terms | `regulation.selfDesigned.*` |

## 5. Calculation row map — GREEN corridor (rows 13–35)

`idx` = year index, `cal` = calendar year, `infl(idx) = (1+Cargo!D18)^(idx−1)`,
all `$m`. Every row is horizon-guarded (§2).

| Row | Verbatim formula (year column) | Engine function |
|---|---|---|
| 13 Fuel prod CAPEX | `IF(idx=1, Fuel!E16, 0)` | `costs.componentCapex` (year-1-only, data-driven) |
| 14 Fuel OPEX | `V!D7 × Fuel!E15 × Fuel!E11 / 1e6 × infl(idx) + Fuel!E17 × infl(idx)` — fuel purchase + production O&M | `fuelCost.ts` + prod-O&M as component opex |
| 16 Port storage CAPEX | `IF(idx=1, Port!E8, 0)` | `costs.componentCapex` |
| 17 Port storage OPEX | `Port!E9 × infl(idx)` | `costs.componentOpex` |
| 19 Barge CAPEX | `IF(idx=1, Port!E11, 0)` | `costs.componentCapex` |
| 20 Barge OPEX | `Port!E12 × infl(idx)` | `costs.componentOpex` |
| 22 Vessel CAPEX | `IF(idx=1, Vessel!E12, 0)` | `costs.componentCapex` |
| 23 Vessel OPEX | `Vessel!E13 × infl(idx)` | `costs.componentOpex` |
| 25 Total CAPEX | `r13 + r16 + r19 + r22` | `side.ts` Σ componentCapex |
| 26 Total OPEX | `r14 + r17 + r20 + r23` | `side.ts` Σ componentOpex + fuelCost |
| 28 EU ETS | see §7 | `regulation/ets.ts` |
| 29 FuelEU | see §7 | `regulation/fuelEu.ts` |
| 30 IRA 45Z | see §7 (green only) | `regulation/ira45z.ts` |
| 31 Self-designed | see §7 (5 terms) | `regulation/selfDesigned.ts` |
| 33 Total | `r25 + r26 + r28 + r29 + r30 + r31` | `side.ts` (exhaustiveness identity) |
| 34 Discount factor | `1 / (1+Cargo!E17)^(idx−1)` | `discounting.ts` (per-year direct; df₁ = 1 exactly) |
| 35 PV | `r33 × r34` | `side.ts` |

## 6. Calculation row map — FOSSIL corridor (rows 39–60)

Same shape via the **same** `evaluateSide` — the Excel's duplicated block must
not survive as a second code path. The three asymmetries are **data on
`SideInputs`**, never `if (green)` branches:

1. **No 45Z row** — the fossil side's `regulations.ira45z` is simply absent
   (engine emits 0). Rows 39–56 ↔ 13–31 otherwise 1:1 (39/40 fuel, 42/43
   storage, 45/46 barge, 48/49 vessel, 51/52 totals, 54 ETS, 55 FuelEU).
2. **Self-designed (row 56) = CO2-price term only**:
   `V!D7 × Fuel!E28 × Fuel!E25 × Reg!D32 / 1e6` — the fossil side's
   `SelfDesignedParams` contains only `co2PriceUsdPerTonne`.
3. **Fossil benchmarks** (resolution layer, §8): vessel capex `F18 = 0`;
   storage/barge capex `= 0`; storage/barge opex `= fuel-table opex × 0.3`.

Rows 58/59/60 ↔ 33/34/35 (total is 5-term — no 45Z; the engine's uniform
6-term sum with 45Z = 0 is identical).

## 7. Regulation formulas (verbatim) and schedule semantics

All gated on their Regulation-tab "Yes" and the horizon guard; all `/1e6` to $m.

- **EU ETS** (r28/54):
  `vessels × fuelTonnes × combustionEF × phaseIn(cal) × scope × EUA€ × EURUSD / 1e6`
  with `phaseIn`: cal<2024→0, 2024→0.4, 2025→0.7, ≥2026→1.0.
- **FuelEU Maritime** (r29/55):
  `MAX(0, WTW − baseline×(1−target(cal))) × (vessels × fuelTonnes × LHV) / WTW / vlsfoMjPerTonne × penalty€ × scope × EURUSD / 1e6`
  with `target`: <2025→0, 2025→0.02, 2030→0.06, 2035→0.145, 2040→0.31,
  2045→0.62, ≥2050→0.8; baseline `Reg!D17` = 91.16; VLSFO `Reg!D16` = 41000.
  **The MAX(0,·) clamps the deficit intensity BEFORE the energy/penalty
  multiplication** — the division by the fuel's own WTW (energy → notional
  fuel mass) is preserved exactly. Green e-ammonia (WTW 15) is always
  compliant ⇒ green FuelEU ≡ 0 in the fixture *because of this clamp*.
- **IRA 45Z** (r30, green only): if 45Z=Yes AND US-produced=Yes:
  `−vessels × fuelTonnes × (rate$/gal ÷ 122.5 MJ/gal × LHV) / 1e6` — a credit
  (negative). **No calendar sunset in the workbook** — reproduced as-is
  (divergence D5 will parameterize `effectiveUntil` in Phase 1).
- **Self-designed** (r31 green):
  `+ vessels × t × combEF × CO2$/t /1e6 − vessels × t × 1000 × $/kg /1e6 − capexSupport% × r25 − opexSupport% × r26 − other$m`.
  Fossil (r56): first term only.
- **Step-function semantics** (`schedule.ts`): value = last step with
  `fromCalendarYear ≤ cal`, else 0 — reproduces the Excel `IF(cal<X, …)`
  ladders including boundaries (unit-tested at 2024/25/26/30/35/40/45/50).
  Schedules ship in the reference bundle (`schedules.etsPhaseIn/fuelEuTargets`).

## 8. Benchmark derivation rules (resolution layer)

| Rule | Verbatim source | Engine home |
|---|---|---|
| Fuel consumption, Distance mode | `(Cargo!D11×2) × Vessel!D8 × gjPerNm × 1000 / LHV` (Fuel!F15/F28; LHV = the side's resolved E13/E26) | `resolve.ts` → `source:"derived"`. Fixture: 500×2×12×4×1000/18600 = **2580.6451612903224** green; /40200 = **1194.0298507462687** fossil |
| Fuel consumption, benchmark mode | vessel-type `fuelTonnesPerYear` | `resolve.ts` → `"benchmark"` |
| Green vessel CAPEX | `vesselCapex × (1 + fuelPremium)` (Vessel!F12). Fixture: 20 × 1.25 = **25** | `"derived"` |
| Fossil vessel CAPEX | `F18 = 0` ("existing baseline vessel") | bundle `benchmarkRules.fossilVesselCapexUsdM` |
| Fossil storage/barge CAPEX | `= 0` ("existing infrastructure assumed") | `benchmarkRules.fossilPortCapexUsdM` |
| Fossil storage/barge OPEX | fossil-fuel-table opex `× 0.3` (Port!F18/F21) | `benchmarkRules.fossilPortLogisticsOpexFactor` |
| Purchase sourcing | prod capex & O&M forced 0 (`Fuel!E16/E17/E29/E30`) | `resolve.ts` (override cannot resurrect them) |
| WACC | country table via Cargo!D6 | `getCountryWacc` (bundle, `verified:false`) |

## 9. Data_tables (verbatim → `data/corridor-ref/2026-07-30-excel-v1.json`)

- **6 vessel types** `(capex $m, opex $m/yr, fuel t/yr, GJ/nm)`: Tanker 35k
  (20, 1.2, 2400, 4) · Tanker 80k (35, 2, 5200, 7) · Bulk 60k (25, 1.5, 3000, 5)
  · Container 5k TEU (45, 2.8, 6500, 6) · Container 15k TEU (90, 5, 14000, 10)
  · Ro-Ro/Ferry (30, 2, 3500, 4.5).
- **6 fuels × 11 columns** (price, combEF, prodCapex, prodOpex, storageCapex,
  storageOpex, bargeCapex, bargeOpex, vesselPremium, LHV, WTW): LSFO
  (594, 3.3, 0, 0, 0, 0, 0, 0, 0, 40200, 92.4) · LNG (550, 2.75, 15, 1, 8, 0.3,
  3, 0.1, 0.1, 48000, 84) · e-Ammonia (900, 0.1, 55, 3, 12, 0.5, 5, 0.3, 0.25,
  18600, 15) · e-Methanol (850, 0.2, 45, 2.5, 8, 0.4, 4, 0.2, 0.15, 19900, 15)
  · Biodiesel/HVO (1100, 0.3, 5, 0.5, 1, 0.1, 0.5, 0.05, 0.05, 44000, 25) ·
  LH2 (1200, 0, 80, 4, 20, 0.8, 8, 0.4, 0.3, 120000, 10).
- **7 country WACCs**: DK .055, NL .055, IN .095, BR .115, SG .06, US .07,
  Other .08 — workbook note *"Illustrative country risk-premium benchmarks,
  not a verified source"* → every row carries **`verified: false`** in the
  bundle (surfaced as an "unverified benchmark" badge in Phase 3).
- Regulation parameters (EUA €80, EURUSD 1.08, penalty €2400, VLSFO 41000,
  baseline 91.16, 45Z $1/gal, 122.5 MJ/gal) are Regulation-tab **inputs**
  (fixture defaults), with the schedules (§7) as bundle data.

## 10. Emissions (row 65) and summary rows (70–85)

- **CO2 abated** (r65): `vessels × fossilTonnes × fossilCombEF − vessels ×
  greenTonnes × greenCombEF` — **combustion (TTW) factors, per-side
  tonnages** (fossil 1194.03 t with EF 3.3, green 2580.65 t with EF 0.1).
  Note the model's two emissions bases: FuelEU uses WTW, this uses TTW
  (divergence D1, Phase 1). Engine: `emissions.ts`.
- Summary (`summary.ts`): r70/71 `SUM(pv)` per side; r72–78 regulatory PV
  lines `SUMPRODUCT(row, df)` (≡ Σ row×df, same associativity); r79 gap =
  green − fossil; r80 lifetime cargo = `Σ throughput` = unitsPerYear ×
  horizon (**cargo only, no fuel linkage**); r81 Σ r65; r82–85 CAPEX/OPEX PV
  splits. Output!D26 `= gap × 1e6 / units`; Output!D31 `= gap × 1e6 / tCO2`
  (the ×1e6 $m→$ is explicit).
- Output tab waterfall (rows 33–42: fossil → ΔCAPEX → ΔOPEX → Δregulation →
  green, hidden float-base helper) is a Phase-3 UI artifact; its Δ terms are
  differences of the summary lines above.

## 11. Drift log (recorded, intentionally NOT given code paths)

| Cell | Drift | Status |
|---|---|---|
| `Fuel!F29` | Fossil prod-CAPEX benchmark hardcoded `15` where the green mirror (F16) uses INDEX/MATCH (LSFO's table value is 0) | Inert under defaults (Purchase forces 0). The engine benchmarks from the fuel table (0 for LSFO); if a scenario ever sets fossil sourcing = Construct, Excel would say 15, engine says 0 — a **documented intentional divergence** of a drifted cell |
| `Vessel!F18` | Fossil vessel CAPEX benchmark `=0` as a bare formula (green mirror computes from table × premium) | Transcribed as the deliberate "existing baseline vessel" rule (`benchmarkRules.fossilVesselCapexUsdM = 0`) |

These mirrored-block inconsistencies are exactly why the engine has **one**
`evaluateSide` — the duplication that produced them cannot exist in code.

## 12. Golden fixture

- `fixtures/golden/corridor/excel-baseline.input.json` — the workbook default
  scenario, **all overrides null** so the golden exercises the full resolution
  layer. `excel-baseline.expected.json` — generated from cached values:
  18 summary metrics, 3 resolved intermediates, and **all 20 horizon years of
  9 per-year rows for both sides + CO2** (far stronger than spot checks).
- Headline expectations: greenTotalPV 205.59516274382005 · fossilTotalPV
  38.64457155477502 · gap 166.95059118904504 · green CAPEX PV exactly 97
  (year-1 discount factor exactly 1: 55+12+5+25) · green FuelEU exactly 0
  (clamp, §7) · CO2 73644.67982667309 t · $/unit 376.57461810133316 ·
  $/tCO2 2266.974227900409.
- Tolerance 1e-9 relative; float fidelity end-to-end (Python repr → JSON →
  JS doubles are shortest-round-trip identical).
- Not covered by this fixture (hand-computed unit tests instead; a second
  workbook variant is Phase-1 scope): 45Z enabled, self-designed enabled,
  green Purchase sourcing.
