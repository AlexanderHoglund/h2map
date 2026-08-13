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
| 4 — financing | Task 1: differentiated green financing as an explicit interest line (`d5825f7`) — NOT a per-side discount rate (the $141m inversion, documented). Task 2: capital deployment schedule, sum-to-1 weights per side, financing drawdown follows (`85411ec`). Task 3 (amended on review): Regulation and Financing are fully separated into two tabs — 06 Financing (WACC, inflation, green financing, capital deployment) and 07 Regulation (the schemes); Results is 08. Support instruments stay inside self-designed regulation (ADR in methodology §8). Calibration is bounds, not targets: $196.0m amortizing / $312.5m bullet bracket the study's ≈$250m; the four 30/40/30 phasing figures reproduced ±$0.1m. | **Done** |
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

## Simplified-mode overhaul (2026-08-10, post-sprint-4 amendment)

View modes renamed **Simplified / Standard** ("Advanced" removed from the
UI); Simplified is the default for new users. Simplified shows only the
structural inputs + the sensitivity top-level set (≥5% headline movement);
the other ~45 fields run on their defaults/benchmarks behind the counted
hidden-settings strip (the regulation-tab pattern, now on every tab).
Departure counting completed everywhere (fuel properties, fossil side,
barge pair, model options, all scheme parameters, financing baseRate/tenor).
Output-neutrality invariant unchanged and still e2e-proven.

## Projects-first entry (2026-08-11)

The platform lands on the Projects tab until a project is selected or
created; input tabs render disabled until then. New-project creation asks
name + starting view (Simplified/Standard); the mode is stored per project
(scenarios.view_mode, migration 20260811000001) and the header toggle
persists flips to the open project. The Chilean example (Standard) is seeded
once per user, ever (profiles.projects_seeded_at, race-safe seed route);
the Simplified starter became "Simple corridor (template)" and is ensured
BY NAME on every seed call — existing users gain it on their next visit
and deleting it brings the template back (cbb13db). Unsaved-changes
confirm before switching projects; Open lands on Intro (was Cargo).

## Simplified as a one-way project level (2026-08-13)

Simplified/Standard is a project LEVEL, not a switchable view: simple ->
standard is a permanent upgrade (header button + strips, confirmed);
standard never goes back. Future: the two Standard entry points (upgrade +
create radio) gate on account access level via canUseStandard(). Within
Simplified: Energy is purchase-only (sourcing selector + build flows are
Standard capabilities; non-purchase imports keep computing with a note) and
Regulation is self-designed only (toggle + CO2 price; the other four
schemes render in Standard, with a counted strip reporting any active).
