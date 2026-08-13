# Fuel-emissions golden fixtures

`golden-fixtures.json` is AUTHORITATIVE. Every expected value was computed
by hand from `data/fuel-emissions-ref/2026-08-13-seed-1.json` BEFORE the
engine existed, so the fixtures are independent of the implementation:
**if the engine disagrees with a fixture, the engine is wrong.**

Rules (same discipline as `fixtures/golden/corridor/`):

- Never regenerate these from code output. There is deliberately no
  `golden:update` path for this suite.
- A fixture changes ONLY when its underlying reference row changes (see
  `openItems` — e.g. the unverified VLSFO WtT of 13.2 would move F1 and
  F3), and then by a new hand computation recorded here.
- New fixtures are appended; existing ids are never edited in place.
- Tolerances: F2 carries its own (0.001, the BetterSea reproduction);
  everything else asserts to the printed decimal (±0.05 of the last
  digit shown).

## Changelog

- 2026-08-13 — initial set F1–F6 against dataset `2026-08-13-seed-1`
  (F1 energy equivalence, F2 BetterSea, F3 pilot fuel, F4 N2O
  sensitivity at GWP 273, F5 GWP-set switch, F6 identity property).
