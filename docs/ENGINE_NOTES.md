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
5. **Final-year replacement skip** — a replacement whose crossing falls in
   the final operating year is skipped (no operator replaces a stack the year
   the plant retires). Multiple crossings within one year each charge a
   replacement.
6. **Water-electricity emission factor** — water-related electricity is
   emitted at the grid emission factor when a grid source is configured, and
   at 0 when the plant is renewables-only (the water supply is assumed to
   draw from the same clean supply).
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

## Deferred (v1.1+ `extensions`, not implemented)

Part-load efficiency curve, minimum-load cutoff, oversizing optimizer,
battery buffer, multi-year meteorology. The `extensions` input field is
reserved so adding them is non-breaking.
