# Research brief — re-basing the corridor cost benchmarks

**Deliverable:** one JSON file (`fuel-benchmarks-v1.json`), schema in §6.
**Audience:** desk researcher or research-capable model with web access.
**Status of this document:** hand-written brief. The figures in §2 were
measured against bundle `2026-08-17-vessel-v3` on 2026-08-16.

---

## 1. Why this exists

The corridor model carries a reference bundle of benchmark costs. The vessel
catalogue was re-researched in August 2026 and is now sourced (EEDI reference
lines, dated broker tables, Moore Maritime Index 2025). **Every other cost row
still comes from a spreadsheet transcription and has never been researched.**

This became impossible to ignore when a "benchmarks only" scenario was built:
the same real corridor (Mejillones→Japan, MMMCZCS 2025), costed entirely from
the bundle with nothing typed in, lands **83% below the published study**.

| | Study | Benchmarks only |
|---|---|---|
| Gap NPV (pre-regulation) | $2,000m | **$334m** (−83%) |
| Cost per cargo tonne | $80/t | **$13.50** (−83%) |
| CO₂ abated | 1.45 Mt | 1.389 Mt (−4.2%) |

The CO₂ figure is close because consumption now derives from researched vessel
data. The cost figures are not, and the difference is almost entirely the
**fuel production plant**.

---

## 2. What is wrong, specifically

### 2.1 The headline defect: production cost is a flat, unsourced scalar

`e-ammonia` in the bundle:

```json
"prodCapexUsdM": 55,
"prodOpexUsdMPerYear": 3,
"prodNameplateTonnesPerYear": 60000,
"verified": true,
"sourceNote": "Data_tables!B17"
```

Three separate problems:

1. **`sourceNote` is a spreadsheet cell reference, not a source.** Every fuel
   row cites `Data_tables!B15`–`B20`. Nobody can check a cell address.
2. **`verified: true` is not supported by that.** The flag drives a real UI
   badge — an unverified row is shown to the user as unverified. Six fuel rows
   currently claim verified status on the strength of a cell reference. By
   contrast the `countries` rows say honestly: *"Illustrative country
   risk-premium benchmarks, not a verified source."*
3. **$55m for 60 kt/yr is $917/tpa** for a complete green-ammonia complex
   (renewables + electrolysis + ASU + Haber-Bosch + storage). The MMMCZCS study
   costs the equivalent Atacama plant at **$1,100m — $18,333/tpa, 20× higher.**

> **Discrepancy to resolve, not inherit.** A code comment in
> `packages/corridor-schema/src/ref/bundle.ts` states the $917/tpa figure is
> "~20x below the NEOM-derived $1,400/tpa". That arithmetic does not work:
> $1,400/$917 is **1.5×**, not 20×. The 20× is against the *study's*
> $18,333/tpa. So there are two incompatible reference points in the codebase
> already ($1,400/tpa and $18,333/tpa, a 13× spread) and **part of your job is
> to determine which — if either — is right, and why they differ.** A plausible
> explanation is scope (electrolysis island only vs. a complete export-ready
> complex including renewables), but do not assume it: establish it.

### 2.2 The structural defect: nothing scales

`prodNameplateTonnesPerYear` exists in the schema and in the data, but **no
code reads it** (verified: the only references are the schema declaration and
its own comment). Production cost resolves as a flat scalar:

```ts
resolve(o.prodCapexUsdM, usdM, () => benchmark(usdM(fuel.prodCapexUsdM)))
```

So a corridor needing 15 kt/yr and one needing 600 kt/yr are charged the same
$55m. This matters more than the level being wrong: **fixing the number without
fixing the scaling just relocates the error.**

The machinery already exists elsewhere — the `build-here` path applies scale
exponents (0.60–0.70), a FOAK multiplier (×1.25) and firming. The flat
`build-plant` benchmark simply does not use it. A recommendation on how to
close that gap is part of the deliverable (§5).

### 2.3 Everything else, ranked by how much it actually moves results

Ranks are from the model's own sensitivity sweep
(`docs/corridor/field-reference.md`, 61 parameters). "Gap movement" is the
share of headline gap movement attributable to that field.

| Priority | Field | Rank | Gap move | Current value | Problem |
|---|---|---|---|---|---|
| **1** | `prodCapexUsdM` (green) | #10 | 32.8% | $55m / 60 kt | 20× below the one real project we can compare to |
| **2** | `prodOpexUsdMPerYear` (green) | #13 | 26.5% | $3m/yr | 5.5% of CAPEX; study implies 6.5% |
| **3** | `priceUsdPerTonne` (green) | #22 | 13.7% | $900/t e-NH₃ | Undated. Merchant price, not a production cost |
| **4** | `portStorageCapexUsdM` | #26 / #18 | 10.7% / 17.9% | $12m green, $0 fossil | Ammonia terminal, refrigerated, jetty |
| **5** | `portStorageOpexUsdMPerYear` | #30 / #23 | 8.8% / 13.2% | $0.5m/yr | — |
| **6** | `bargeOpexUsdMPerYear` | #28 | 10.6% | $0.3m/yr | — |
| **7** | `vesselCapexPremium` | — | — | 0.25 (e-NH₃) | Dual-fuel newbuild premium; testable against broker data |
| **8** | `bargeCapexUsdM` | #38 | 4.2% | $5m | Lowest priority |
| — | `priceUsdPerTonne` (LSFO) | #43 | 3.2% | $594/t | Undated; likely stale but low impact |

Also in scope, lower priority: `lng`, `e-methanol`, `biodiesel-hvo`, `lh2`
rows (same defects), and `regulationDefaults.eurUsd` (1.08, undated).

**Out of scope — do not touch:** the vessel catalogue (`vesselTypes`, already
researched), `fuelEmissions` (separate dataset, `2026-08-14-seed-3`),
`imoNetZero` defaults (correctly sourced to draft MEPC 83 — use its
`sourceNote` as your model for provenance quality), and the `countries` WACC
rows (honestly marked unverified already; a separate exercise).

---

## 3. What "better" means here

The model's standing rules, which your output must respect:

1. **A source is a document, not a cell.** Name the publication, the
   publishing organisation, the year, the table/figure, and a URL or DOI.
2. **State the scope of every cost.** "$X/tpa" is meaningless without knowing
   whether it includes renewables, grid connection, EPC, contingency, owner's
   costs, land, storage, jetty. Scope mismatch is the single most likely way
   this research goes wrong — it is almost certainly what explains the
   $1,400 vs $18,333 conflict in §2.1.
3. **Say what year the money is in.** Give the currency year, and state the
   index if you escalate.
4. **`verified: true` requires a real source.** If the best available figure is
   an estimate, mark it `false` and say why. **An honest `false` is worth more
   than an unsupported `true`** — the UI badges it and the user knows.
5. **Give a range, not just a point.** Central plus low/high, because the model
   has an uncertainty band that consumes exactly this.
6. **Prefer a scaling rule to a single number.** `$/tpa at a stated reference
   size + a scale exponent` beats a flat scalar, because it stays right when
   the corridor changes size.
7. **Report disagreement rather than averaging it away.** Two credible sources
   3× apart is a finding about the technology's cost uncertainty. Say so.
8. **Nothing is tuned to reproduce the MMMCZCS study.** The study is a
   *check*, not a target. If your researched figures disagree with it, that is
   a result — report it. A number reverse-engineered to make the study
   reproduce is worthless, and the model already has a variant that reproduces
   the study by assertion.

---

## 4. Suggested sources

Not exhaustive, and not an instruction to prefer them over better ones you
find. Prefer primary sources with dated, scoped cost tables.

**Green ammonia / hydrogen production**
- IEA *Global Hydrogen Review* (2024/2025) — installed-cost basis, states EPC
  and contingency inclusion
- IRENA *Green Hydrogen Cost Reduction*; *Innovation Outlook: Renewable Ammonia*
- BNEF hydrogen/ammonia cost updates, if accessible
- Announced project FIDs with published capital cost **and nameplate**: NEOM
  (2.2 GW, 1.2 Mt/yr NH₃), CF Industries Blue Point, Yara Sluiskil, Fertiglobe,
  ACME Oman, Ørsted FlagshipONE (note: cancelled — cancellations are evidence)
- IEEFA and academic reviews for *realised* vs announced cost divergence

**Ammonia storage / terminals / bunkering**
- MMMCZCS *Ammonia Bunkering Safety Study*; ammonia fuel-supply-chain reports
- Port of Rotterdam / Singapore MPA ammonia bunkering pilots
- EEA / Clarksons terminal capex references

**Vessel dual-fuel premium**
- Clarksons Research newbuild price tables (dated)
- DNV *Alternative Fuels Insight* orderbook data
- Broker reports quoting ammonia dual-fuel vs conventional for the same hull

**Fuel prices**
- Argus / Platts assessments (state the assessment date)
- Ship & Bunker for LSFO/VLSFO (state port and date)
- Note the distinction between merchant price and production cost — the model
  needs both and conflating them is a known trap

---

## 5. Deliverables

1. **`fuel-benchmarks-v1.json`** — the data, schema in §6.
2. **A short written findings note** covering:
   - the $1,400/tpa vs $18,333/tpa conflict (§2.1) — resolved, with the
     scope difference that explains it, or an explicit "unresolved and why";
   - where credible sources disagree by more than ~2×, and your reading;
   - **a recommendation on scaling** (§2.2): what reference size, what
     exponent, whether FOAK should be default for a corridor plant, and
     whether the existing `build-here` machinery should simply be reused;
   - anything you could not source, named explicitly rather than filled with
     a plausible-looking number.
3. **A `verified` decision per row**, with the reasoning.

---

## 6. Output format — this is a hard contract

One JSON file. UTF-8, 2-space indent, no comments (JSON has none), no trailing
commas. The consuming script validates against this; anything that does not
parse is rejected wholesale.

```json
{
  "researchId": "fuel-benchmarks-v1",
  "researchedAt": "2026-08-DD",
  "currencyYear": 2025,
  "method": "One paragraph: what you did, what you prioritised, what you deliberately excluded.",
  "openQuestions": [
    "Anything unresolved that a reader must know before trusting a row."
  ],
  "fuels": [
    {
      "id": "e-ammonia",
      "production": {
        "referenceNameplateTonnesPerYear": 100000,
        "capexUsdPerTpa":  { "low": 0, "central": 0, "high": 0 },
        "opexUsdPerTpaPerYear": { "low": 0, "central": 0, "high": 0 },
        "scaleExponent": { "low": 0.0, "central": 0.0, "high": 0.0 },
        "foakMultiplier": { "low": 0.0, "central": 0.0, "high": 0.0 },
        "scopeIncluded": ["renewables", "electrolysis", "asu", "haber-bosch", "storage", "epc", "contingency", "owners-cost"],
        "scopeExcluded": ["grid-connection", "land"],
        "verified": true,
        "sources": [
          {
            "title": "",
            "publisher": "",
            "year": 2025,
            "locator": "Table 4.2, p.87",
            "url": "",
            "figureUsed": "",
            "note": "How this maps onto the scope above; any adjustment you applied and why."
          }
        ]
      },
      "portStorage": {
        "basisTonnesPerYearThroughput": 100000,
        "capexUsdM": { "low": 0, "central": 0, "high": 0 },
        "opexUsdMPerYear": { "low": 0, "central": 0, "high": 0 },
        "scopeIncluded": [],
        "verified": false,
        "sources": []
      },
      "bunkering": {
        "mode": "jetty|barge|both",
        "capexUsdM": { "low": 0, "central": 0, "high": 0 },
        "opexUsdMPerYear": { "low": 0, "central": 0, "high": 0 },
        "verified": false,
        "sources": []
      },
      "merchantPrice": {
        "usdPerTonne": { "low": 0, "central": 0, "high": 0 },
        "priceType": "delivered|fob|production-cost",
        "assessmentDate": "2026-08-DD",
        "verified": false,
        "sources": []
      },
      "vesselCapexPremium": {
        "fraction": { "low": 0.0, "central": 0.0, "high": 0.0 },
        "appliesTo": "newbuild-dual-fuel",
        "verified": false,
        "sources": []
      }
    }
  ],
  "regulationDefaults": {
    "eurUsd": { "value": 0, "assessmentDate": "2026-08-DD", "sources": [] }
  }
}
```

### Rules for filling it

- **Every `{low, central, high}` is required.** If you have only one figure,
  repeat it in all three and say so in the row's `note`. Do not invent a spread.
- **`central` is your best estimate, not the mean** of low and high.
- **`capexUsdPerTpa`, not `capexUsdM`,** for production. The whole point is to
  decouple the cost from a single assumed plant size. Port storage and
  bunkering stay absolute, with the throughput they assume stated.
- **`scaleExponent`**: the `n` in `cost ∝ capacity^n`. Note that "low" means
  *low cost at scale* — a **smaller** exponent gives a bigger discount. The
  existing band uses low 0.70 / central 0.65 / high 0.60 for exactly this
  reason. Keep that orientation or say explicitly that you have inverted it.
- **`verified`** is per block, not per fuel. A well-sourced production cost
  alongside a guessed barge cost is normal and should be recorded as such.
- **`sources` may not be empty when `verified` is `true`.**
- **`figureUsed`** must be the number as printed in the source, before any
  adjustment of yours — e.g. `"USD 730/kW installed, 2023 real"`. Put your
  conversion in `note`. This makes every number traceable back to its page.
- **Include all six fuels** (`lsfo`, `lng`, `e-ammonia`, `e-methanol`,
  `biodiesel-hvo`, `lh2`). For LSFO most blocks are legitimately zero — the
  fossil side builds no plant. Say so in `note` rather than omitting the row.
- **Do not include** vessel classes, emission factors, or country WACC rows.

### Sanity checks before submitting

Run these yourself; they catch most of what goes wrong:

- Does `capexUsdPerTpa.central × 60,000 t/yr` land anywhere near either the
  $55m benchmark or the study's $1,100m? Which, and why?
- Is production OPEX a sane fraction of CAPEX? Current benchmark 5.5%, study
  6.5%. A figure outside roughly 3–12% needs explaining.
- Is `lh2` more capital-intensive per tonne than `e-ammonia`? It should be.
- Does the fossil side have zero production cost? It must.
- Are all your `low` values genuinely below `central`, and `high` above? (With
  the deliberate exception of `scaleExponent` — see above.)
