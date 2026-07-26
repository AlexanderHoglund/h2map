# Engine methodology notes

`packages/lcoh-engine` implements the published methodology of "Motor de
Cálculo LCOH — Principales Características" (Ministerio de Energía de Chile /
Centro de Energía FCFM / USACH / PUC, April 2024). With no `referenceFlags`
set the engine is in **reference mode**: doc-literal behavior everywhere the
document speaks, plus the documented default below everywhere it is silent.
This file logs every such decision.

## Decisions where the source document is explicit

| Topic | Behavior | Source basis |
|---|---|---|
| System boundary | Electrolyzer outlet; no compression/storage/transport | §2.2(1) |
| Dispatch priority | Renewables first, grid/PPA top-up only | §2.2(3) |
| Annual profile | One representative year repeated (engine requires exactly 8760 h) | §2.2(4) |
| Water electricity | Desalination (3.75 kWh/m³) and pumping (0.40 kWh/m³/100 m) counted **only** in emissions, never in cost — enforced by `test/emissionsInvariant.test.ts` | §2.2(5) |
| LCOH/LCOE equations | DCF quotients per §2.1; investment at t=0 undiscounted, production/O&M in years 1..N | §2.1 equations sum over one index t with I₀ at df=1 and H₀=M₀=0 |
| LHV | 33.33 kWh/kg | §2.3 |

## Decisions where the source document is silent (reference-mode defaults)

1. **Degradation indexing** — reference: η_t = η₀(1−d)^t for t = 1..N (first
   operating year already 1 % degraded, doc-literal reading of the formula).
   Flag `nameplateEfficiencyInFirstYear` switches to η₀(1−d)^(t−1). Effect
   ≈ 0.5 % on LCOH at defaults. The Phase 2 parity screen against the 47
   published Chilean projects should disambiguate empirically.
2. **LCOE pricing basis** — reference: LCOE-priced renewables are charged for
   **consumed** energy only, following the doc's LCOE_mix formula which
   weights consumed energies (curtailed energy is free under LCOE pricing;
   under CAPEX pricing curtailment is inherently paid for). Flag
   `lcoePaysForCurtailedEnergy` charges generated energy instead — material
   at high curtailment.
3. **Efficiency reset on stack replacement** — reference: no reset (the doc's
   single monotone formula η₀(1−d)^t has no reset term; replacement is a pure
   CAPEX event). Flag `resetEfficiencyOnStackReplacement` restarts the
   degradation clock the year after each replacement.
4. **Stack-hours semantics** — the 40 000 h counter accumulates *calendar
   operating hours* (hours with load > 0), not full-load-equivalent hours.
   Flag `stackLifeOnEquivalentFullLoadHours` (improved mode) switches to EFLH
   = consumed energy ÷ rated power, which counts partial-load hours
   proportionally; calendar hours over-consume stack life on peaky
   (solar-heavy) profiles and bias against high-capacity-factor sites.
5. **Final-year replacement skip** — a replacement whose crossing falls in
   the final operating year is skipped (no operator replaces a stack the year
   the plant retires). Multiple crossings within one year each charge a
   replacement.
6. **Water-electricity emission factor** — water-related electricity is
   emitted at the grid emission factor when a grid source is configured, and
   at 0 when the plant is renewables-only (the water supply is assumed to
   draw from the same clean supply). The ledger is **operational only**
   (annual-average grid factor); it is not an RFNBO/RED II assessment.
   `performance.renewableMatchedFraction` reports the hourly-matched share of
   consumption served by own renewables (P0 #9).
7. **"Average hourly profile" output** — implemented as a 12×24 month-by-hour
   average-day electrolyzer load matrix (matches the Chilean tool's
   month-wise "perfil horario" display).
8. **Grid top-up level** — grid fills the shortfall up to full electrolyzer
   capacity (subject to the grid's own hourly cap), i.e. the electrolyzer
   always runs as high as supply allows; there is no economic dispatch
   decision in reference mode.

## Numerical determinism

- No `Math.pow` in the engine: discount and degradation factors accumulate
  multiplicatively in fixed order, summations are single-threaded ordered
  loops (`Float64Array`), so results are bit-stable across platforms.
- LCOH is defined as the **sum of per-component quotients** (component PV ÷
  hydrogen PV), so the decomposition sums to LCOH exactly (`toBe`-level), not
  merely within tolerance.
- Golden files compare at relative tolerance 1e-12; `.gitattributes` forces
  LF so golden bytes match between Windows and CI.

## Improved mode (rank-fidelity program)

Beyond reference mode, an **improved** flag set trades doc-literal fidelity for
better screening rank-fidelity. All flags default off, so reference mode and
the Chilean parity run are unaffected, and the reference golden set is
untouched (an `improved-*` golden set is added beside it).

- **P0 #1 — air-density correction for wind** (profile layer;
  `ProfileServiceDeps.windAirDensityCorrection`). A turbine power curve is
  defined at sea-level density ρ₀ = 1.225 kg/m³; the reference profiles ignore
  that thinner air at elevation produces less power at a given wind speed, so
  wind is overstated at exactly the elevated high-resource sites the map exists
  to surface. With the flag, Open-Meteo wind fetches also pull `temperature_2m`
  and the response elevation, compute per-hour ISA air density, and look the
  power curve up at the IEC 61400-12 density-equivalent speed
  v_eq = v_hub·(ρ/1.225)^(1/3) (density clamped to [0.6, 1.4]). Off by default →
  reference wind profiles and the Chilean parity run are unchanged; corrected
  profiles carry an `-airdensity` dataset tag. Measured effect
  (`npm run rankdiff:airdensity`, 22-cell elevation-stratified sample): wind-only
  LCOH +8.3 USD/kg mean at ≥2000 m (thin-air sites correctly penalised) and
  −0.02 at the coast; the map's best-layer moves +0.07 USD/kg mean at elevation
  (individual wind-favoured altitude cells up to +0.74, some flipping off wind)
  and ~0 at sea level. Spearman ρ 0.98 / Kendall τ_b 0.94 on that
  elevation-heavy sample. The correction can only be realised by re-fetching
  wind (the CF cache stores no raw speed), so it lands as a re-seeding step, not
  a recompute.

- **P0 #2 — turbine-class selection** (profile layer;
  `ProfileServiceDeps.windTurbineClassSelection`). One mid-market machine applied
  everywhere penalises low-wind sites, where a developer deploys a lower IEC
  wind class — same generator, larger rotor, lower *specific power* — that
  reaches rated power at a lower speed and yields far more energy in light
  winds. `turbineClasses.ts` derives three curves (Class I rated ≈12.5 m/s, II
  ≈11.5, III ≈10.5) from the digitised generic curve by repositioning its rated
  speed, and selects on the *uncorrected* annual-mean hub-height speed
  (≥9.5 → I, 7.5–9.5 → II, &lt;7.5 → III; IEC classes are defined on wind speed).
  Off by default → reference wind profiles and the golden set are bit-identical;
  selected profiles carry a `iec-class-*` dataset tag and expose the class as a
  per-cell diagnostic. Measured effect (`npm run rankdiff:turbineclass`, 24-cell
  wind-spectrum sample): low/mid-wind (Class III) best-layer −0.22 USD/kg mean,
  up to −0.88 where wind competes with PV (cells flip toward wind); strongest-
  wind (Class I) +0.05 USD/kg — the small robust-turbine penalty a windy site
  really incurs. Best-layer −0.14 USD/kg over the sample; Spearman ρ 0.998 /
  Kendall τ_b 0.986 (selection mostly rescales within wind regime). Re-fetch-
  bound, like #1.

- **P0 #4 — unified PV pathway / seam removal** (profile layer;
  `ProfileServiceDeps.pvUnifiedEra5`). PVGIS auto-resolves a regional satellite
  radiation DB (SARAH/NSRDB); where that coverage ends the map fell back to a
  categorically different crude GHI proxy, so adjacent hexes stopped being
  comparable and a seam appeared. Unified mode pins `raddatabase=PVGIS-ERA5`
  (global reanalysis) for every PV cell and drops the crude fallback — any cell
  PVGIS can't serve is masked as no-data instead of filled with a different
  model. Off by default → reference chain (auto-resolve + crude fallback) and
  the golden set are unchanged; ERA5 profiles carry a `pvgis-...-era5-` dataset
  tag. Measured effect (`npm run rankdiff:pvseam`, 20-cell latitude-spread
  sample): the interior satellite→ERA5 shift is small and rank-preserving
  (best-layer +0.015 USD/kg mean, PV-layer +0.025; Spearman ρ 0.994 / Kendall
  τ_b 0.974) — the point is to erase a discontinuity, not reorder. Notably PVGIS
  auto-resolve already reaches ERA5 at ≥70° latitude (those cells are byte-for-
  byte identical pinned vs auto), so the crude fallback rarely fires in current
  data; its removal is mainly a consistency/robustness guarantee. (Two sample
  cells were masked on transient PVGIS timeouts, so the crude→ERA5 heal
  magnitude wasn't isolated.) Re-fetch-bound like #1/#2. **Follow-up (no rank
  effect):** the spec's per-cell provenance in the map inspector (provider,
  radiation DB, turbine class, fallback used) needs the hex schema + seeding +
  frontend; the data is already encoded in each profile's `datasetVersion`.

- **P0 #3 — stack life on EFLH + efficiency reset**
  (`stackLifeOnEquivalentFullLoadHours` + `resetEfficiencyOnStackReplacement`).
  The calendar-hour counter over-charges stack replacements on peaky profiles,
  and never resetting efficiency means the plant pays replacement CAPEX for no
  performance gain. Both bias against high-CF sites. Measured effect on the
  500-cell rank-diff benchmark (`scripts/rankdiff`): mean LCOH −0.44 to −0.53
  USD/kg, Kendall τ_b 0.94–0.99, top-50 churn 4–6%, largest movement on
  wind-heavy high-elevation cells (bucket mean −0.80 USD/kg).

**P1 — map/financing layers (not engine `referenceFlags`):**

- **P1 #5 — risk-adjusted WACC layer** (map layer; `mapSweep(..., wacc)` +
  `scripts/lib/countryWacc.ts`). Capital recovery over 20 yr swings 0.087→0.134
  as WACC goes 6→12 % — larger than the resource gap between good sites — so
  under a uniform 8 % the map ranks *resource*, not *project cost*. The default
  surface keeps uniform financing (now labelled "resource-driven, uniform
  financing" on the map, not just in the doc); an optional layer applies each
  cell's country cost of capital, matched by point-in-polygon against the
  Natural Earth boundaries to `country_defaults.wacc_suggestion` — a World Bank
  income-group *heuristic* (0.06 OECD-high → 0.12 low-income), labelled as such
  and isolated so a measured source can replace it. Engine-recomputable, no
  re-fetch. Reference invariant: `mapSweep` without a `wacc` arg is unchanged
  (default 0.08), so parity/goldens hold. Measured effect (`npm run
  rankdiff:wacc`, full 500-cell benchmark, best·2024): 419/499 cells matched a
  country (WACC 0.06–0.12); **Kendall τ_b 0.834, Spearman ρ 0.955, top-50 churn
  30 %, top-decile retention 70 %** — the largest, deliberate reorder in the
  program. By bucket: strong-solar developing cells dearer (+0.29 USD/kg mean,
  WACC up to 0.12), OECD high-latitude/mid-wind cheaper (−0.37 to −0.46, WACC
  0.06); a high-resource Indian cell +1.8, Norwegian cells −1.0…−1.6. **To
  deploy** as a live layer needs a stored second value set (jsonb) + a frontend
  toggle, like the cost-year layers.

- **P1 #6 — oversizing + mix sweep** (map layer; `mapSweepOptimal` in
  `scripts/lib/lcohSweep.ts`). The map reports LCOH at one arbitrary design
  point (fixed 200 MW renewables on 100 MW electrolyser = 2:1), not
  best-achievable. The optimal renewable:electrolyser ratio is strongly
  profile-dependent — flat wind wants a lower ratio than peaky solar — so cells
  invert under a different ratio. `mapSweepOptimal` sweeps ratio ∈ {1.25, 1.5,
  2.0, 2.5, 3.0} × PV share ∈ {0, 12.5 … 100 %} (45 configs), returns the min
  LCOH plus the winning ratio+mix as diagnostics; the fixed-2:1 `mapSweep` is
  untouched (parity/goldens hold). Engine-recomputable, no re-fetch. Measured
  (`npm run rankdiff:oversize`, full 500-cell benchmark, best·2024): the fixed
  2:1 is optimal for only **86/499 cells (17 %)** — 324 prefer a *lower* ratio
  (1.25×/1.5×), so the current map systematically over-sizes. Best-achievable is
  **−0.21 USD/kg mean, up to −0.86**, concentrated on flat-wind cells
  (strong_wind −0.33, high_latitude −0.30 by bucket; strong_solar only −0.13).
  Rank change Kendall τ_b 0.940 / Spearman ρ 0.994 / top-50 churn 12 %; largest
  movers are Scandinavian flat-wind cells. **Compute budget for a full rebuild:**
  ~69 ms/cell for the 45-config sweep at one cost year → ~0.28 s/cell across the
  4 cost-year packs, i.e. ~3.8 h / 50k cells single-threaded (mitigated by the
  parallel seeder; the per-hour dispatch is closed-form in the two cached CF
  profiles, so a vectorised grid evaluation would cut this sharply — not yet
  done). **To deploy** as a live layer needs the stored best/ratio/mix per cell
  + a frontend toggle, like the cost-year layers.

## Deferred (v1.1+ `extensions`, not implemented)

Part-load efficiency curve, minimum-load cutoff, oversizing optimizer,
battery buffer, multi-year meteorology. The `extensions` input field is
reserved so adding them is non-breaking.
