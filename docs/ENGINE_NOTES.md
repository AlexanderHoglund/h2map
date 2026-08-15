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

- **P0 #4 — PV pathway / seam removal** (profile layer;
  `ProfileServiceDeps.pvMaskUnservable`). PVGIS auto-resolves a per-cell
  radiation DB (SARAH3/NSRDB satellite, its own tilt-aware PV model); where that
  coverage ends the map fell back to a categorically different crude GHI proxy,
  so adjacent hexes stopped being comparable and a seam appeared. Map/mask mode
  removes the crude fallback: a cell PVGIS can't serve renders **no-data** rather
  than a non-comparable value. Off by default → reference chain (auto-resolve +
  crude fallback) that parity and the calculator use is unchanged.
  **Correction (2026-07-29) — this reverses the original ERA5 pin.** The first
  version of #4 pinned `raddatabase=PVGIS-ERA5` for one "consistent global"
  model. Auto-resolve replaced it and remains the right pathway, so mask mode
  is now just `[pvgis-auto] → mask`.

  **Re-correction (2026-08-15) — the REASON given above was wrong.** This note
  claimed pinned ERA5 was "broken", returning HTTP 500 and ~3× too-low
  capacity factors. A live probe disproved both: pinned ERA5 returns 200 and
  lands within 5% of SARAH3 at the very cells that motivated the change
  (Turkana SARAH3 0.203 vs ERA5 0.194; Namibia 0.221 vs 0.224; Ouarzazate
  0.217 vs 0.217, no systematic direction). The Kenya speckle was the
  `optimalangles` problem, fixed by the latitude mounting rule — a
  misattribution, not an ERA5 fault.

  Two further claims here are also wrong. **NSRDB no longer exists**: v5_3
  accepts exactly `['PVGIS-ERA5','PVGIS-SARAH3']` worldwide, NSRDB having been
  dropped after v5_2, and it is rejected even over the United States. And
  auto-resolve does **not** reach ERA5 "only at high latitude" — the
  predictor is LONGITUDE, because SARAH3 is Meteosat-disc-only. Measured over
  the 3,264-row PV cache: SARAH3 appears only in the +0..60° longitude bands
  (50% and 92% of cells) and is entirely absent from every other band — 0%
  across the Americas, Asia-Pacific and Oceania. By latitude there is no such
  pattern at all (+45..60° is 68% SARAH3 while +15..30° is 0%). So for most
  of the map ERA5 is not a degraded fallback, it is the only database PVGIS
  has. Because improved-mode PV now auto-resolves to the same
  DB as reference-mode PV, both build the same `dataset_version`; they coexist in
  the cache only because `mode` is now part of the resource-profile unique key
  (migration `20260729000001_resource_profiles_mode_unique`). The flag was
  renamed `pvUnifiedEra5` → `pvMaskUnservable` to match. Re-fetch-bound like
  #1/#2; broken ERA5 profiles must be purged and re-seeded (Kenya done first).
  **Follow-up (T1.1, done):** see the profile-validation gate below.

- **T1.1 — profile-validation gate** (profile layer; `validate.ts`,
  `ProfileServiceDeps.validateProfiles`). Auto-resolve fixed the ERA5 breakage,
  but a live probe showed PVGIS returning non-physical series in Kenya — e.g.
  (0.5, 37.3) peaking at CF 0.39 (mean 0.059) every year where ~0.19 is real —
  cleanly bimodal against the good cells (peak ~0.82). **Correction
  (2026-08-04): this was NOT a SARAH3 data fault as originally recorded.** The
  root cause was our own request: `optimalangles=1` made PVGIS's tilt optimiser
  return non-physical mountings near the equator (a 90° vertical north-facing
  panel, a nonsense azimuth, or HTTP 500). The same cells fetched with an
  explicit latitude-rule tilt return healthy data (mean 0.178-0.207, peak
  ~0.80) and pass the gate. See "Fixed-mount geometry" below. A structurally
  valid 8760-hour profile can still be physically impossible, and it renders as
  a colour that breaks comparability with its true neighbours. `validateProfile`
  screens each built (and cached-on-read) profile against loose one-sided
  physical bounds — for PV the decisive one is a **peak-CF floor** (0.55: real
  PV always has near-clear-sky hours, so a lower annual peak is the fingerprint
  of a scaling/artifact fault), plus mean-CF range, daylight-hour band and a
  monthly-share cap; for wind a mean-CF range, peak floor and a non-degeneracy
  (distinct-values) check. Bounds are chosen to pass every real site and reject
  only the non-physical. **Additive & map-only:** enforcement is gated behind
  `validateProfiles` (the seed/recompute path), so a failing profile is treated
  as a provider failure → the layer MASKS (no-data) instead of colouring. With
  the flag off (parity, calculator) the verdict is computed and attached to the
  result for provenance but never enforced, so reference stays bit-comparable.
  Masking is **per-source**: a cell whose solar profile fails keeps its valid
  wind value (separate `lcoh_solar` / `lcoh_wind` layers) rather than becoming a
  full hole. Golden set and parity unchanged.

- **Fixed-mount geometry — do not delegate the panel angle** (profile layer;
  `providers/pvgis.ts` `fixedMounting`, 2026-08-04). We used to send
  `optimalangles=1` and let PVGIS choose the tilt. Near the equator its
  optimiser is unreliable: measured at (−0.86, 37.92) it returned a **90°
  vertical, north-facing panel** (azimuth −180°) giving mean CF 0.084 / peak
  0.41, where the same cell mounted flat gives **0.179 / 0.83**. Other observed
  failures: a valid 0° slope with a nonsense 52° azimuth, and outright HTTP
  500 from the optimiser. T1.1 then correctly rejected the collapsed series as
  non-physical, so the cell rendered as no-data — this, not bad satellite data,
  is what put the holes in Kenya's solar layer (**46 % of all |lat|<10° cells
  were missing solar, vs 0.4–5 % elsewhere**). The tilt is now computed
  locally: `tilt = min(round(|lat|), 35)`, equator-facing. The 35° cap reflects
  that the yield curve flattens while self-shading and wind load grow. Azimuth
  convention was verified against the live API rather than assumed —
  `aspect=0` is equator-facing in the northern hemisphere (Spain 40.4°N: 0.175
  at aspect 0 vs 0.090 at 180), `aspect=180` in the southern (Chile 23.5°S:
  0.249 at 180 vs 0.180 at 0). **The mounting is part of the dataset tag**
  (`…-pv_fixed-tilt<N>a<A>-<years>`) because the cache key is
  `(lat_r, lon_r, kind, mode, dataset_version)` — without it a re-mounted
  profile would silently upsert onto rows computed under the old assumption.
  Consequence: every pre-existing PV profile is a cache miss and re-fetches on
  next touch. Controls improved as a side effect (Chile 0.229→0.250, Spain
  0.175→0.190). Tracking kinds (`pv_1axis`/`pv_2axis`) keep PVGIS's geometry —
  a tracker has no fixed tilt to get wrong. The frozen provider spike
  (`scripts/providers/fetch-pvgis.ts`, whose output feeds the LCOH goldens)
  deliberately still uses `optimalangles` and must not be "fixed".

  **Re-seed outcome (Kenya, 2026-08-04).** `npm run hex:recover-solar` over the
  Kenya bbox: **171 → 13 cells without solar**, 193 → 351 with solar, and *no
  cell that had solar lost it* (the script can only upgrade a cell). Recovered
  cells land at solar CF 0.164–0.238 (median 0.194), LCOH 6.0–11.1 USD/kg —
  matching the predicted 0.17–0.20 band and confirming the diagnosis rather
  than merely filling holes. The vertical-panel signature (CF ≈ 0.084) is gone:
  **zero** Kenya cells now sit below the `solar_cf < 0.12` threshold of the old
  ad-hoc mask, which is therefore obsolete rather than load-bearing. Global
  `lcoh_solar IS NULL` fell 320 → 163; the residue is non-Kenya and mostly
  >45° latitude, where rejection may be legitimate polar-winter behaviour.

- **Known open items (data layer, 2026-08-04):**
  - `apps/web/lib/server/profileCache.ts` upserts on
    `"lat_r,lon_r,kind,dataset_version"` — **missing `mode`**, inconsistent
    with migration `20260729000001` and with `scripts/lib/serviceDeps.ts`
    (which is correct). Reference and improved profiles sharing a dataset
    version would collide on the WEB path (calculator / lcoh-evaluate); the
    seeding path is unaffected. Not bundled with the mounting fix.
  - `scripts/hex/pvgis-health.ts` counts only HTTP success, so it reports
    "healthy" for cells whose data the T1.1 gate rejects — its canary
    (0.5, 37.3) was exactly such a cell. The health gate blocks the
    `kenya-recover` cron, so a false "healthy" is benign but a false
    "unhealthy" silently stalls recovery. Worth teaching it the gate.
  - Some `hex_lcoh.lcoh_solar` values were nulled by **ad-hoc SQL** during the
    July Kenya work (a `solar_cf < 0.12` mask). No committed script or
    migration performs it, so that DB state is not reproducible from the repo.
    The 2026-08-04 re-seed supersedes it for Kenya.
  - ~149 non-Kenya cells still lack solar, mostly above 45° latitude where a
    genuine polar-winter profile can legitimately fail the gate. Unverified
    whether those are the same mounting bug — the fix makes them recoverable
    whenever a wider re-seed is run.

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

- **P2 #10 — cost-year coherence** (map layer; `COST_PACKS` durability fields in
  `scripts/lib/lcohSweep.ts`). The future packs cut CAPEX and lifted efficiency
  but held stack life at 40 000 h and degradation at 1 %/yr — incoherent, since
  durability is a primary learning-curve target, and it made the cost-down
  conservative. `CostPack` gains `stackLifetimeHours` + `degradationPerYear`
  trajectories (2024 = reference 40 000 h / 1 %; 2030/2040/2050 = 60/80/100 k h
  and 0.8/0.6/0.5 %), documented as an IEA/DOE-direction *extrapolation*, not an
  IEA figure. 2024 keeps the reference values so the current map is bit-identical
  (parity/goldens hold). **⚠ Superseded 2026-08-02** — the fuel-production
  realism pass re-based the electrolyser cost anchor to IEA GHR 2025's 2024
  vintage (1000 → 2300 USD/kW, stack life 40 k → 50 k h, with the OPEX and
  stack-replacement FRACTIONS retuned to hold absolute $/kW/yr). The
  "2024 is bit-identical" invariant no longer holds: every map cell moved and
  a full `hex:recompute` is required. Measured effect (500-cell benchmark,
  improved mode): `best` layer mean +1.83 USD/kg (2024) falling to +0.91
  (2050), **top-decile retention 100 % and top-50 churn 0–2 %** — a level
  re-base, not a re-ranking. See docs/COST_YEARS.md and PARITY_NOTES.md. Measured (`npm run rankdiff:costyear`, full 500-cell
  benchmark): 2024 shift exactly 0 (invariant); future-year LCOH −0.25 (2030) →
  −0.34 (2050) USD/kg mean — the size of the prior conservatism. Because solar
  CAPEX falls faster than wind, the best PV/wind mix shifts toward solar
  (mean +0.19 share 2024→2050, 305/499 cells) and **55 cells (11 %) flip
  dominant source wind→solar, 0 the other way** — the data behind an explicit
  flip diff layer. **To deploy:** the trajectory just re-prices future years on
  the next seed; the flip layer needs the per-year winning mix stored + a
  frontend diff view.

- **P2 #8 — validation rebuild** (reporting; `scripts/lib/screeningMetrics.ts`,
  `scripts/parity/sensitivity.ts`). No model change — it corrects how the
  Chilean parity is presented and what it reports.
  - *Split verification from validation.* Methodology §13 (Verification:
    analytical 1e-6, property tests, golden 1e-12 — the code computes the spec)
    is now separate from §14 (Validation: the Chilean empirical comparison), so
    the test suite no longer lends false empirical weight; the /parity page
    states the same distinction.
  - *Screening metrics.* `run-parity` now also reports precision@5, precision@10,
    top-decile retention, and Kendall τ_b with a bootstrap 95 % CI. Result:
    **precision@5 = @10 = top-decile = 1.0** (the model nails the cheapest sites
    — the actual screening use), while τ_b = 0.66 [0.53, 0.78] shows the
    discordance sits in the middle of the distribution, not the shortlist. The
    global ρ = 0.85 alone understated shortlist fidelity.
  - *Bias decomposition* (`npm run parity:sensitivity`). The −0.207 USD/kg mean
    gap is **structural, not geolocation**: each baseline moves it by a plausible
    step (efficiency 0.57 → +0.226 closes it; electrolyser CAPEX ±10 % → ∓0.25;
    discount 0.06/0.10 → −0.17/+0.19; oversizing 1.5:1 → +0.365), while ±0.2°
    coordinate jitter is symmetric noise (~0.40 USD/kg per-site spread in either
    direction, up to ~1.0 at biobío/loslagos) that cannot create a one-directional
    offset. So the bias is a baseline difference and likely non-uniform across
    geographies — relevant to every map cell.
  - *Second benchmark* — **outstanding.** One country, n = 32, is thin; the
    harness is dataset-agnostic so a second published study with disclosed
    assumptions and coordinates can be wired into the same metrics. No suitable
    second dataset is committed yet — documented as the open validation gap
    rather than filled with an unspecified source.

## Deferred (v1.1+ `extensions`, not implemented)

Part-load efficiency curve, minimum-load cutoff, oversizing optimizer,
battery buffer, multi-year meteorology. The `extensions` input field is
reserved so adding them is non-breaking.
