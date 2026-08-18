# Research brief — input uncertainty ranges for the corridor model

**Deliverable:** one JSON file, `input-uncertainty-v1.json`, in the schema at
the end of this document, plus a short findings note.

**What this feeds.** The model already computes how hard each input pushes the
result (*leverage* — an elasticity, measured, committed). It cannot know how
uncertain each input actually *is* (*exposure*). Impact is the product, so
without your ranges the model can rank fields by leverage but cannot say which
uncertainty actually threatens a decision. Your ranges will drive a tornado
chart on the results page and a Monte Carlo band around the headline figure.

---

## The six items

Ordered by leverage. The bracketed figure is the gap elasticity measured across
three corridor archetypes: **0.63 means a 10% move in this input moves the cost
gap 6.3%.** A range that is wide *and* high-leverage is what dominates the
answer.

### 1. Fuel consumption, as a single "delivered energy" range **[0.01–2.63]**

The highest-leverage item, and the one most likely to be got wrong.

**Give ONE percentage range on delivered energy — not two per-side numbers.**
Green and fossil consumption are physically matched on a real corridor (the
same ship does the same voyage at the same speed; only the fuel differs). The
model derives both sides from one geometry, and treating them as independent
uncertainties describes a state the model itself rejects.

So the question is: **how wrong can a naval-architect estimate of a vessel's
energy demand be, expressed as a % of delivered energy?** Sources would be
model-test versus sea-trial deviation, EEDI/EEXI estimate tolerance,
speed–power curve uncertainty, or published charter-party consumption warranty
tolerances (typically ±5%). Weather, hull fouling and routing margin all belong
inside this one number.

State whether the range differs by ship type — a short-sea feeder spends a much
larger share of its energy in port than a Capesize does.

### 2. e-Methanol price, $/t delivered **[2.36]**

The model currently carries **1,000 / 1,400 / 2,400 $/t** flagged
`verified: false`, supported only by a single ACME–Mitsubishi offtake
announcement. Every other fuel price in the model is verified against a price
assessment; this one is not.

Wanted: European (and if available Asian) green/e-methanol offtake and spot
assessments for **2025–26**, ideally distinguishing bio-methanol from
e-methanol, and stating whether prices are delivered, FOB or ex-works. If the
market is too thin for an assessment, say so — *"no liquid assessment exists"*
is a usable finding and I will record the field as `unquantified` rather than
invent a spread.

For reference, the comparable verified band the model already holds:
**e-ammonia 640 / 900 / 1,330 $/t** (Platts assessments, H2Global auction
clearing prices).

### 3. Vessel CAPEX, absolute newbuild price **[0.05–0.79]**

**The biggest genuine hole.** The model holds point values with no range at
all, every one flagged `verified: false`:

| Vessel row | CAPEX | Basis in the model today |
|---|---|---|
| `bulk-handymax-58k` (58,000 dwt) | $34m | EEDI reference line × k |
| `bulk-newcastlemax-210k` (210,000 dwt) | $80.5m | EEDI reference line × k |
| `cont-feeder-1800` (1,800 TEU) | $34m | EEDI reference line × k |

Wanted: **newbuild price ranges** for these three classes — yard quote spreads,
Clarksons/newbuilding price indices, or reported contract prices, 2025–26.

Note the model separately holds a **verified** green *premium* band (ammonia
dual-fuel +16%/+26%/+36%; methanol +11%/+22%/+28%). Do **not** re-research the
premium. What is missing is the base conventional newbuild price the premium
applies to.

Yard prices move together across a cycle, so if you can say anything about
whether these three classes move in step, that matters — the model currently
assumes they do.

### 4. Vessel OPEX, $m/yr **[0.03–0.59]**

Same gap as CAPEX: point values, no range, unverified.
Handymax $2.47m/yr · Newcastlemax $2.93m/yr · 1,800 TEU feeder $2.26m/yr.

Wanted: operating-cost ranges (crew, insurance, stores, maintenance, dry-dock
accrual) for these classes — Moore Stephens/Drewry OpCost-style surveys or
equivalent. Exclude fuel: fuel is modelled separately.

### 5. WACC **[0.11–0.23]**

The model carries per-country discount rates whose own source note reads
*"Illustrative country risk-premium benchmarks, **not a verified source** —
replace with your own project finance / country-risk data."*

Wanted: a defensible spread for **project-financed shipping/energy
infrastructure**, ideally distinguishing an OECD-financed project from an
emerging-market one, since the model's three corridors span Chile, Australia
and northern Europe.

**Express this in percentage points** (e.g. "6.5% central, 5.0–9.0% P10–P90"),
not as a percentage of itself — a rate moves in points, and the model perturbs
it that way.

### 6. Inflation **[0.04–0.21]**

Wanted: a realised-versus-target spread over a **15-year** horizon — long-run
inflation-swap forwards, central-bank target bands, or historical dispersion of
15-year realised averages. Also in **percentage points**.

---

## Rules

**A range without a defensible basis is worse than no range.** If you cannot
source one, mark the item `unquantified` and say why. The model records those
explicitly and excludes them from impact rankings; an incomplete honest table
beats a complete invented one. Do not interpolate a spread from a single data
point, and do not average across incomparable price bases (delivered vs FOB) to
manufacture a range.

**Every number must be traceable.** `figureUsed` records the number *as printed
in the source*, before any conversion of yours; put the conversion in `note`.
If you convert currency or units, state the rate and date.

**Low and high are P10 and P90**, not absolute extremes — the 10th and 90th
percentile of what you would expect the true value to be. A "worst case ever
recorded" is not a P90.

**Distributions**, in order of preference:
- `uniform` when only a defensible range exists (the conservative default)
- `lognormal` for strictly-positive prices with a documented long upper tail
- `triangular` only when you can cite a most-likely value (`mode`)
- `normal` only for a symmetric, well-sampled quantity

**Say when a range is archetype-specific.** A Baltic feeder's yard price is not
a Capesize's, and a European WACC is not a Chilean one. Use `scenarioScope`.

---

## Output format

One JSON file. `rows` may contain fewer than six entries — omit anything you
could not source, and list it under `unquantified` with a reason.

```jsonc
{
  "datasetVersion": "2026-08-XX-uncertainty-v1",   // stem must equal filename
  "retrievedDate": "2026-08-XX",
  "status": "Researched YYYY-MM-DD by <name>. Rows marked verified:false must not drive a headline number without the unverified badge.",

  "rows": [
    {
      "id": "energy-demand",                  // exactly one of the six ids below
      "appliesTo": "group",                   // "group" | "field"
      "unit": "fraction of delivered energy", // the unit low/high are expressed in

      "distribution": "triangular",
      "low": -0.08,                           // P10, in `unit`
      "mode": 0,                              // triangular only
      "high": 0.12,                           // P90, in `unit`

      "basisType": "measurement",             // market-range | quote-spread |
                                              // regulatory-scenario | measurement |
                                              // expert-judgement
      "uncertaintyBasis": "One cited sentence stating the range and where it comes from.",
      "verified": true,                       // false if you would not defend it unbadged
      "scenarioScope": ["A", "B", "C"],       // omit if it applies everywhere

      "sources": [
        {
          "title": "",
          "publisher": "",
          "year": 2026,
          "locator": "page/table/section, or 'assessment of 13 Aug 2026'",
          "url": "",
          "figureUsed": "the number AS PRINTED in the source, before conversion",
          "note": "your conversion, caveats, and why this figure and not another"
        }
      ]
    }
  ],

  "unquantified": [
    { "id": "vessel-opex", "reason": "No public survey covers this class post-2024." }
  ]
}
```

**Use exactly these ids** (they join to the model's own fields):

| id | item |
|---|---|
| `energy-demand` | 1 — fuel consumption, as a group |
| `green.priceUsdPerTonne` | 2 — e-methanol price |
| `vessel.capexUsdM` | 3 — vessel CAPEX |
| `vessel.opexUsdMPerYear` | 4 — vessel OPEX |
| `cargo.wacc` | 5 — WACC |
| `cargo.inflation` | 6 — inflation |

For items 3 and 4, if the range differs by vessel class, return one row per
class using `scenarioScope`: **A** = Handymax bulk (Chile copper), **B** =
Newcastlemax bulk (Australia–Korea iron ore), **C** = 1,800 TEU feeder
(Skagerrak short-sea).

## Findings note

Alongside the JSON, a page or two covering: what you could not source and why;
any figure that contradicts what the model currently holds (especially the
e-methanol 1,000/1,400/2,400 band); whether yard prices for the three classes
move together; and anything you found that changes how a range should be
*interpreted* rather than just its width.

## Explicitly out of scope

Green vessel premium (already verified in the model) · N₂O slip (the ×37 range
is already held) · pilot-fuel share · methane slip · fuel LHVs and WtW
intensities (physical/regulatory constants, not uncertainties) · corridor
distance, vessel count, roundtrips, horizon, start year and regulatory scope
(these are project *decisions* a user makes, not facts about the world) ·
EUA price and EUR/USD (measured leverage ≤0.02 — below the threshold at which a
range would change any ranking).
