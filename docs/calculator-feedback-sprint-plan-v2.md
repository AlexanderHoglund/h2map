# Calculator feedback — sprint plan (v2)

Working record of the sprint programme implementing the 6 Aug 2026 feedback
deck on the corridor calculator. The authoritative per-sprint specs arrive
as prompts; this file tracks status and cross-sprint scope adjustments so
later sprints inherit an accurate baseline. (Recreated in-repo 2026-08-10 —
the original plan document was never committed.)

## Status

| Sprint | Scope | Status |
|---|---|---|
| 1 — correctness, labels, colour | Fuel family separation; 4-sig-fig display; Fleet OPEX labels; MMMCZCS domain palette; Chilean-reference map legend; tab renames; year selectors | **Done** (commits `75f8a99`…`6b850d9`) |
| 2 — information architecture, Simple mode | Tab reorder to the MMMCZCS domain sequence + Cargo tab; nine field moves; country-before-port; Simple/Advanced view modes; per-tab completion indicators | **Done** (commits `7630e24`…`150d96c`) |
| 3 — the sailing route, waterfall, provenance | Task 3 (amended): marnet routing engine, Intro route drawing, routed distance as derived benchmark (`d468212`…`4e80d38` + follow-ups). Task 1: MMMCZCS cost-breakdown waterfall (`7b8b814`). Task 2: provenance tooltips on every source badge, inferred scope — the original spec never reached this machine and may amend it later. | **Done — Sprint 3 closed** |
| 4 | — | Not yet specified here |
| 5 | Port lookup, automatic roundtrips, consumption-basis default | Scope adjusted, below |

## Sprint 5 scope adjustment (from Sprint 3 Task 3, amended)

**Automatic distance is delivered in Sprint 3**, not Sprint 5: the routed
distance over the maritime network (searoute-ts@2.2.0 / marnet-plus-100km)
is the distance field's derived benchmark, adoption-only, with graph-version
provenance stored on the scenario (`cargo.routedDistance`).

Sprint 5 retains:

- **Port lookup** — which will also improve routing inputs by snapping
  named ports to network-accurate coordinates.
- **Automatic roundtrips** — can now derive from the routed distance
  (`oneWayDistanceNm` / `routedDistance`) once it lands.
- **Consumption-basis default.**

## Sprint 3 Task 3 decisions of record

- Routing engine: `searoute-ts@2.2.0` pinned exact (MIT wrapper over
  Eurostat's EUPL-1.2 marnet_plus_100km), wrapped behind
  `apps/web/lib/seaRoute.ts` so it stays swappable; server-side only.
- Snap sanity bound: **500 km**, deviating from the spec's ~100 km sketch
  on measured evidence (Mejillones snaps 325 km on this network; central
  Asia ~2,300 km — the bound's purpose survives).
- Drawing surface: **static SVG** over committed, regenerable Natural Earth
  coastlines (68 KB) — not MapLibre (~800 KB + third-party tiles).
- Distance resolution: **adoption-only** (the spec's auto-populate bullet
  conflicts with its own "adoption is the only path by which a result
  changes" test; the test wins). Divergence notice at >15%.
- Engine validation vs published tables (NGA Pub. 151 11th ed.; SeaNews):
  Mejillones→Yokohama **9,146 nm**, no canal (band 8,550–10,450);
  Mejillones→Rotterdam **6,942 nm** via Panama (band 6,400–7,800);
  Singapore→Rotterdam **8,439 nm** via Suez (published 8,440).
