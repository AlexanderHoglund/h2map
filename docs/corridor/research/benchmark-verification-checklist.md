# Benchmark verification checklist

> **Status (2026-08-21): research COMPLETE — applied as bundle 2026-08-21-verified-v5.** See verification-apply-sheet-v5.md for the return lines; this checklist is retained as the commissioning document.

Research brief, 2026-08-20 · bundle `2026-08-18-fuel-v4`

## Goal and pipeline

The corridor aims for **zero unverified benchmarks**. Three steps:

1. **This list** — every unverified reference value, for item-by-item research
   (this document; the human researcher works through it).
2. **Pooling** — items that cannot be verified individually (notably per-country
   WACC) get a **conservative pooled value** with a stated basis, marked as such.
3. **Warnings** — the field-level plausibility notes then measure user input
   against the repaired benchmarks; the amber "unverified benchmark" badges
   disappear because nothing unverified remains.

**How verification lands in the app:** each reference row carries
`verified` + `sourceNote`. Research results are applied by editing the bundle
(new `bundleId`, scenarios re-pin on open) — the badge logic needs no code
change. The UI badge is driven by **row-level** flags, so the groups below are
ordered by what actually clears badges.

**Return format** — for each item, one line is enough:

```
<id>: keep|replace <value>|pool <value> — <source: publisher, title, date, table/page> — <note>
```

---

## Group A — Country WACCs (7/7 unverified — every corridor shows this badge)

All seven share one source note: *"Illustrative country risk-premium
benchmarks, not a verified source — replace with your own project finance /
country-risk data."* The WACC field wears a permanent amber badge because of
this. Sensitivity leverage 0.11–0.23 (gap elasticity) — and it applies to
every scenario, so this is the highest-value group.

| id | shipped WACC | note |
|---|---|---|
| `denmark` | 0.055 | |
| `netherlands` | 0.055 | |
| `singapore` | 0.060 | |
| `united-states` | 0.070 | |
| `other` | 0.080 | the fallback row — every unlisted country uses it |
| `india` | 0.095 | |
| `brazil` | 0.115 | |

**Research routes:** IRENA *Renewable Power Generation Costs* WACC annex;
IEA *Cost of Capital Observatory* (country-level, updated); Damodaran country
risk premium dataset (NYU, annual); project-finance benchmarks for shipping /
port infrastructure. **If individual figures can't be defended:** your step-2
plan — replace the per-country spread with one conservative pooled rate
(suggest: pool toward the high side, e.g. the Observatory's
emerging/developed split as two pooled rows), documented as `pool` so the
sourceNote says exactly what it is.

---

## Group B — Vessel rows (35/35 active rows unverified — capex, opex and
consumption fields show the badge)

Every non-deprecated vessel row is `verified: false`, but the gaps are
**field-shaped, not row-shaped**: three recurring unsourced terms plus a
handful of named capex/opex holes. Verifying ~20 datapoints flips all 35 rows.
Energy terms carry the model's largest leverage (the energy-demand group
reaches 2.63 gap elasticity); capex 0.05–0.79; opex 0.03–0.59.

### B1 — the three shared terms (every row cites the same estimate)

| term | current basis | what would verify it |
|---|---|---|
| `portAndCargoLoad` (GJ/day in port + cargo systems) | "sector estimate — UNSOURCED, the largest open term" | port-call energy studies: IMO GHG Study port operations data, EU MRV port-time fuel figures, segment-specific reefer/cargo-system loads. One figure per family suffices |
| `ladenBallastSplit` | family ratio assumption (0.85 bulk/tanker, 0.9 gas/general, 0.95 container/roro) | AIS-based laden/ballast leg studies (e.g. UNCTAD/Marine Traffic analyses, GHG Study voyage data) |
| `serviceSpeed` | "typical service speed for class" | Clarksons WFR class averages or AIS observed service speeds |

### B2 — named capex gaps (tier C, one figure each)

| vessel id | shipped capex $m | current basis |
|---|---|---|
| `bulk-postpanamax-93k` | 42 | scaled Kamsarmax–Capesize curve |
| `bulk-vloc-325k` | 118 | scaled from Newcastlemax, no dated quote |
| `tank-small-15k` | 28 | scaled below MR2 quote |
| `chem-imo2-12k` | 32 | stainless premium over product tanker, no dated quote |
| `chem-imo2-25k` | 50 | MMMCZCS indicative ~$50m, needs broker quote |
| `chem-imo2-40k` | 65 | scaled from 25k, no dated quote |
| `cont-handy-2800` | 45 | interpolated 1,800–6,400 TEU contract curve |
| `cont-ulcv-18000` | 215 | scaled above the 13,640 TEU contract |
| `cont-ulcv-24000` | 260 | scaled above the 13,640 TEU contract |
| `gas-vlgc-84k` | 95 | sector estimate, no dated quote |
| `roro-cargo-12k` | 55 | sector estimate |
| `ropax-8k` | 90 | sector estimate, highly design-dependent |
| `genc-12k` | 22 | sector estimate |
| `genc-25k` | 28 | sector estimate |

**Route:** newbuild price tables (the bundle already cites an "Xclusiv NB
table 04-May-2026" as tier A for the researched rows — the same table, or
Clarksons SIN, likely covers most of these).

### B3 — named opex gaps (tier C, one figure per family)

| family | rows affected | current basis |
|---|---|---|
| container | all 8 rows | "no MMI container row" |
| gas | `gas-lng-174k`, `gas-vlgc-84k` | "no MMI gas row" |
| ammonia carrier | `vlac-93k` | VLGC analogue — no segment accounts |
| pctc / roro / ropax / general cargo | 5 rows | "no MMI row" |

**Route:** Moore Maritime Index segment accounts (already the tier-A opex
source for bulk/tanker rows); Drewry Ship Operating Costs for the segments
MMI lacks.

### B4 — energy basis note

Sailing energy (`gjPerNm`) is tier B — EEDI reference line × family
calibration `k` — for every row except `gas-lng-174k` (direct observed).
Tier B is defensible but not "verified"; if the goal is strictly zero
unverified rows, the decision needed here is whether EEDI-derived is accepted
as verified-by-method (recommended: yes, with the calibration documented) or
whether spot-checks against published consumption figures are wanted for the
half-dozen most-used classes.

---

## Group C — Fuel research bands (15 sections unverified — feed bands and
docs, not badges)

The six fuel rows are row-verified (their headline price/LHV/WTW carry
sources), so no badge shows today; these sections mark where the underlying
**band** is not yet sourced. Bands are low/central/high.

| fuel | section | shipped values | note |
|---|---|---|---|
| `lsfo` | production, portStorage, bunkering | all 0/0/0 | zeros-by-designation (incumbent infrastructure) — verifying = confirming the designation. Cheap win |
| `biodiesel-hvo` | portStorage, bunkering | all 0/0/0 | same designation question |
| `lng` | bunkering | capex 40/55/90 $m; opex 2.5/4/6 $m/yr | |
| `lng` | vesselCapexPremium | 0.10/0.15/0.22 | |
| `e-ammonia` | bunkering | capex 20/34/55 $m; opex 2/3/4.5 $m/yr | |
| `e-methanol` | production | capex 6,500/10,500/16,500 $/tpa; opex 260/470/830; scale 0.95/0.85/0.6 | |
| `e-methanol` | portStorage | capex 6/12/22 $m; opex 0.12/0.3/0.9 | |
| `e-methanol` | bunkering | capex 2/13/25 $m; opex 1.2/2/3 | |
| `e-methanol` | merchantPrice | 1,000/1,400/2,400 $/t | green price leverage is 2.36 — high value |
| `lh2` | production | capex 30,000/54,000/90,000 $/tpa; opex 1,050/1,900/3,600 | |
| `lh2` | portStorage | capex 175/270/400 $m; opex 7/12/22 | |
| `lh2` | bunkering | capex 45/90/150 $m; opex 4/7/12 | |
| `lh2` | merchantPrice | 5,000/7,500/9,500 $/t | |
| `lh2` | vesselCapexPremium | 0.26/0.26/0.26 | flat band = placeholder |

**Routes:** MMMCZCS fuel-pathway reports, IRENA green-hydrogen/ammonia cost
studies, IEA G20 hydrogen report, DNV/LR bunkering-infrastructure studies,
Methanol Institute / e-methanol offtake announcements, H2Global auction
results (already the e-ammonia price anchor).

---

## Group D — adjacent, for completeness (no badge, low priority)

- `input-uncertainty-ref/2026-08-19-uncertainty-v1.json`: rows marked
  `verified: false` — green price (archetype C), fleet-capital C, vessel-opex
  B/C, both WACC rows, inflation.
- `benchmarkRules` fossil zeros (`fossilVesselCapexUsdM: 0`,
  `fossilPortCapexUsdM: 0`): modeling designations (existing fleet sails
  free), to confirm as designations, not research.

---

## Priority order (by measured gap leverage × how many scenarios it touches)

1. **A — country WACCs** (every corridor, 0.11–0.23, and the plan's pooling
   candidate)
2. **B1 — port/cargo day rates + laden/ballast split** (energy-demand
   leverage up to 2.63)
3. **C — e-methanol & e-ammonia merchant/bunkering** (green price leverage
   2.36)
4. **B2/B3 — named vessel capex/opex holes** (0.03–0.79)
5. **C remainder + B4 + D** (bands, designations, documentation)
