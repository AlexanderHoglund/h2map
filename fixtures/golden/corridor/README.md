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
