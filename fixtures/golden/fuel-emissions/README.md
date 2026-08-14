# Fuel-emissions golden fixtures

`golden-fixtures.json` is AUTHORITATIVE. Every expected value was computed
by hand from the reference dataset (`data/fuel-emissions-ref/`) BEFORE the
engine existed, so the fixtures are independent of the implementation:
**if the engine disagrees with a fixture, the engine is wrong.**

Rules (same discipline as `fixtures/golden/corridor/`):

- Never regenerate these from code output. There is deliberately no
  `golden:update` path for this suite.
- A fixture changes ONLY when its underlying reference row changes (see
  `openItems`), and then by a new hand computation recorded here.
- New fixtures are appended; existing ids are never edited in place.
- Tolerances: F2 carries its own (0.001, the BetterSea reproduction);
  everything else asserts to the printed decimal (±0.05 of the last
  digit shown).

## Changelog

- 2026-08-13 — initial set F1–F6 against dataset `2026-08-13-seed-1`
  (F1 energy equivalence, F2 BetterSea, F3 pilot fuel, F4 N2O
  sensitivity at GWP 273, F5 GWP-set switch, F6 identity property).
- 2026-08-14 — dataset `2026-08-14-seed-2`: the former "VLSFO" row mixed
  the LFO LCV/WtT (0.0410 / 13.2) with the HFO carbon factor (3.114) — a
  combination in neither Annex II row (verification report; rows
  confirmed against the DG MOVE FuelEU guidance document and the ESSF
  SAPS WS1 working document). Baselines are now atomic Annex II rows;
  F1/F3/F4 rebased BY HAND onto the HFO row (RME–RMK, covering most
  VLSFO; WtW 91.744 AR4):
  F1: mass 18.6e6/40,500 = 459.3 t; baseline 18.6e6×91.744×1e-6 =
  1,706.4; avoided 1,706.4−279.0 = 1,427.4; reduction 1−15/91.744 = 83.65%.
  F3: mass 19,578,947/40,500 = 483.4 t; pilot 978,947×90.768×1e-6 = 88.9;
  avoided 1,796.3−(279.0+88.9) = 1,428.4; blend unchanged 18.79.
  F4: avoided vs 91.744 from the rounded adds (1.0/3.23/36.69):
  1,408.8 / 1,367.4 / 745.0.
  F2 and F5 exercise the HFO row directly and are unchanged —
  re-verified exactly (BetterSea 91.744 under AR4).
