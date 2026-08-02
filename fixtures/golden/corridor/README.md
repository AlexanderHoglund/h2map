# Corridor golden fixtures — FROZEN

`excel-baseline.input.json` + `excel-baseline.expected.json` are the
machine-checked reproduction contract for the Green Corridor engine against
`Green_Corridor_Model_Simplified_30_07.xlsx`
(sha256 `d3b219379402e211249ac336d98461fca98eb9c742dfde9498f03c045da38fbd`).

Rules (build-plan cross-cutting rule 4):

- **The expected file comes from the workbook's cached values** — emitted by
  `python scripts/corridor/transcribe.py` — never from the engine. That is why,
  unlike `packages/lcoh-engine`, there is deliberately **no `golden:update`
  script** here: regenerating expectations from the engine would make the
  fixture test the engine against itself.
- **Never edit a fixture to make a change pass.** A deliberate behaviour change
  (a divergence flag graduating to default, a new workbook version) adds a NEW
  fixture pair alongside (`excel-baseline-v2.*`), with a changelog entry here,
  and the old pair stays.
- All overrides in the input are `null` on purpose: the golden exercises the
  entire resolution layer (benchmark lookups, distance-derived consumption,
  vessel premium, fossil ×0.3 / =0 rules, Purchase-zeroing), not just the
  arithmetic.
- Tolerance: 1e-9 relative (`packages/corridor-engine/test/golden/`).

## Changelog

- `excel-baseline` (2026-07-30): initial transcription of the workbook's
  default scenario (Denmark, 500 nm, 2027 +20y, Tanker 35k, e-ammonia
  Construct vs LSFO Purchase, ETS + FuelEU on).

- App default divergence (2026-07-31): the corridor UI creates new scenarios
  with `flags.emissionsBasis = "wellToWake"` (D1) — CO2 abated and $/tCO2
  count the full fuel chain by default. The FIXTURE is unchanged and still
  pins the workbook's combustion-basis numbers exactly: the engine's
  flag-absent behaviour remains pure Excel, and TTW stays selectable in the
  UI's Model options.

## 2026-08-01 — IMO Net-Zero reference rows added to the bundle (additive)

`data/corridor-ref/2026-07-30-excel-v1.json` gained OPTIONAL rows for the
IMO Net-Zero Framework (schedules.imoBaseTargets / imoDirectTargets +
regulationDefaults.imoNetZero) — draft MEPC 83 values, PROVISIONAL pending
adoption (targeted MEPC 85, Oct 2026), sourceNote on the row. This is a
documented exception to the new-bundle-id rule: the addition is purely
additive (every pre-existing row byte-identical), the golden scenario never
enables the module, and the frozen expected file is untouched. A bundle
whose EXISTING rows change still requires a new bundle id.

## 2026-08-01 — schema v3: fuel-sourcing restructure

`construct` was removed from the sourcing menu. The v2→v3 migration maps it
to `build-plant`, setting `flags.legacyExcelConstruct` ONLY where the Excel
double-count was actually live (a price row charging something — the frozen
fixture, whose benchmark price row is live). The fixture stays at v1 and
reproduces exactly through the migration chain. v2 payloads with
`sourcing: "build-here"` are REJECTED at migration — the calculation basis
changed from a delivered price in OPEX to capital+operating; the scenarios
table was verified EMPTY at this date, so no archival machinery exists.

## 2026-08-01 — schema v4: `named-plant` folded into `purchase`

`named-plant` and `purchase` were the same arithmetic (price × tonnage,
production lines zeroed) differing only in where the price came from. The
v3→v4 migration maps `named-plant` to `purchase`, carrying the typed
`deliveredPriceUsdPerTonne` over as the `priceUsdPerTonne` override —
identical numbers by construction. The `deliveredPriceUsdPerTonne` field is
removed from the schema entirely (stripped from every side at migration).
The frozen fixture (v1, construct) is unaffected: it walks 1→2→3→4 and
reproduces exactly.

## 2026-08-02 — production nameplate added to bundle fuel rows (additive)

The realism pass added an OPTIONAL `prodNameplateTonnesPerYear` to each fuel
row that carries a non-zero `prodCapexUsdM`, stating the capacity those
production rows describe (60,000 t/yr — the workbook's implicit small
corridor plant). Without a stated capacity a bare "$55m" is unrelatable to
any $/tpa benchmark, which is exactly how the build-here path came to sit
~20× below an anchored reference.

This follows the same additive exception as the IMO rows above: the field is
`.optional()` in the zod schema, every pre-existing row is byte-identical,
the golden scenario never reads it, and the frozen expected file is
untouched. A bundle whose EXISTING rows change still requires a new bundle
id.
