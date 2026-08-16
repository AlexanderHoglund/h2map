# Findings note — re-basing the corridor cost benchmarks

Companion to `fuel-benchmarks-v1.json`. Researched 16 August 2026.
Capex is real 2025 USD; prices are nominal at their stated assessment dates.

---

## 1. The headline: $1,400/tpa is a unit error, not a scope

**$1,400/tpa should be deleted, not re-scoped.** It is not NEOM-derived and it is not a capex.

Every published NEOM ratio, computed from $8.4bn at financial close (May 2023) for 1.2 Mt/yr:

| Basis | Value |
|---|---|
| USD per tonne of annual NH₃ capacity | **$7,000/tpa** |
| USD per kW of electrolyser (2.2 GW) | $3,818/kW |
| USD per tonne of H₂ per year | $38,400 |

None is $1,400, and no combination of published NEOM figures produces it. Two credible origins, both IRENA, both matching the endpoint exactly:

1. **IRENA, *Innovation Outlook: Renewable Ammonia* (2022), p.16** — *"Renewable ammonia production costs for new plants are estimated to be in the range of USD 720 – 1 400 per tonne today."* This is a **levelised production cost per tonne produced**, 2020 USD. Reading it as a capex per tonne of annual capacity confuses a flow with a stock.
2. **IRENA, *Green Hydrogen Cost Reduction* (2020), Table ES1** — PEM system cost *"700–1 400"* USD/kW.

The report title makes (1) the likelier source.

**Three independent tests, all of which the figure fails:**

- **The grey-plant floor.** IRENA's capital intensity for a *natural gas* ammonia plant is **USD 1,500–2,000 per annual tonne**; for coal, ~$2,900. A green plant buys everything a grey plant buys except the reformer, *plus* electrolysers, *plus* hundreds of MW to GW of dedicated generation. $1,400/tpa is below the floor for a grey plant.
- **The electrolysis-island test — the one hypothesis the evidence rules out.** Even if $1,400/tpa were meant as "electrolysers only", it fails: the measured real-world bolt-on (Unigel Camaçari, 60 kt/yr, 3 × 20 MW thyssenkrupp nucera on an existing Petrobras synloop, no renewables) is **$2,000/tpa**, and the IEA 2025 electrolyser range of $2,000–2,600/kW gives **$3,100–6,200/tpa** at 100 kt/yr.
- **Reinterpreting it as $/kW doesn't rescue it either.** 195 MW × $1,400/kW = $273m = **$2,730/tpa** — still ~2× the model's value, and covering only the electrolysers.

### Where the 13× actually comes from

| Step | Factor | Basis |
|---|---|---|
| $1,400/tpa → correct large-scale complete-complex capex ($7,000/tpa) | **×5.0** | Unit error: a production cost (or a $/kW) used as a capex per annual tonne |
| $7,000/tpa at 1.2 Mt → 60 kt/yr | ×1.4–1.9 | Scale |
| Small-plant FOAK premium | ×1.4–1.8 | RAND estimate-class; NEOM's own announcement→close escalation |
| **Product** | **≈10–17×** | vs. the observed 13.1× |

**The code comment was right that something was 20× off, but wrong about what and wrong about the arithmetic.** The dominant term is the unit error, not scope. The comment's own claim — that $917/tpa is "~20x below the NEOM-derived $1,400/tpa" — is internally impossible: $1,400/$917 is 1.5×.

---

## 2. $18,333/tpa: arithmetically defensible, unverifiable at source

**The $1,100m / 60,000 t-yr line item is not in the public MMMCZCS document.** We read *Chilean Green Corridors — Copper Concentrate Export* (11 Sep 2025) in full. It contains: 60,000 t/yr of Chilean green ammonia from 2030; a fossil corridor at *"10 vessels for 15 years at 850 million USD"*; a green corridor at *"2.85 billion USD"*, explicitly a 15-year lifetime NPV; *"~80 $/t for the product"*; a *"~2000 m$"* gap; and a scope naming *"solar PV plant, occupying 200 hectares in the Atacama Desert"*, *"electrolyzers, air separation units, and the Haber-Bosch reactor"* and *"refrigerated tanks"*.

It contains **no $1,100m line item, no plant/vessel/bunkering split, no currency year, no electrolyser MW and no LCOA.**

**Two readings, and we cannot fully exclude the second.**

**Reading A — $1,100m is the plant capex → $18,333/tpa.** Supported by an independent bottom-up on the study's *own described configuration*: 200 ha of Atacama PV is ~130–200 MWp; 60,000 t NH₃ needs 10,653 t H₂ → 565 GWh/yr of electrolysis plus ~48 GWh/yr for ASU and Haber-Bosch, so ~613 GWh/yr, which at Atacama single-axis CF ~33% needs ~212 MW of PV — bracketing the stated 200 ha. Costing that out (PV $160m; 130 MW electrolysis at IEA rates $260–338m; ASU+HB at 60 kt $250–400m; storage, jetty, desal, utilities, EPC, contingency, owner's $200–300m) gives **$870m–1,200m, i.e. $14,500–20,000/tpa**. That reproduces $18,333 without being tuned to it.

**Reading B — $1,100m is a 15-year lifetime cost.** The $2.85bn *is* explicitly a 15-year NPV, so a component of it plausibly is too. Then $1,100m ÷ (60,000 × 15) = **$1,222 per tonne produced**, which sits squarely inside IRENA's $720–1,400/t and Deloitte/GIZ's $916–1,350/t. Under Reading B the bundle's $1,400 and the study's implied $18,333 are *the same quantity*, differing only by whether you divide by lifetime output or by one year's nameplate.

**We favour Reading A** — the bottom-up corroborates it, and $1.1bn of plant inside a $2.85bn 15-year corridor NPV leaves a sensible $1.75bn for vessels, bunkering and operations against an $850m fossil counterfactual. But Reading B is exactly the class of error that generates this problem in the first place, and the coincidence ($18,333 ÷ 15 = $1,222 ≈ IRENA's production cost) is uncomfortably tidy. **Someone with access to the MMMCZCS annex should settle it before this bundle ships.**

### What we recommend instead

`capexUsdPerTpa = { low: 7,500, central: 11,000, high: 18,000 }` at a **100,000 t/yr** reference, for a complete export-ready complex including dedicated renewables.

Central is deliberately **below** the 12,750 midpoint, because the only two datapoints backed by committed capital — NEOM at financial close ($7,000/tpa at 1.2 Mt) and AM Green at FID ($6,667/tpa at 1.5 Mt) — both scale to **$9,500–11,500/tpa**, while the $18,000 end rests on the unverified $1,100m.

**The sanity check the brief asked for.** Scaling the central to 60,000 t/yr at n = 0.85 gives **$11,876/tpa = $713m**:

- **13.0× the bundle's $55m.**
- **35% below the study's $1,100m.**

It lands far nearer the study. The residual gap is scale, FOAK and site quality — not another unit error.

**And the LCOA cross-check, which is the one that matters.** At 8% real WACC, 25-year life (CRF 0.0937), 90% utilisation: our central gives $1,817/t NH₃ at 100 kt — honestly expensive, because small scale *is* expensive — while the same formula applied to NEOM's $7,000/tpa gives **$1,156/t**, inside IRENA's published $720–1,400/t and near Deloitte/GIZ's $916–1,350/t. The framework reproduces the published large-scale LCOA range without being fitted to it.

---

## 3. Recommendation on scaling (§2.2 of the brief)

**Yes — reuse the existing `build-here` machinery for `build-plant`. Do not write a second mechanism.** But three of its parameters are wrong for this asset class.

**a) Read `prodNameplateTonnesPerYear`.** This is the minimal change and it removes the defect. Resolve production capex as

```
capex(Q) = capexUsdPerTpa × (Q / referenceNameplateTonnesPerYear)^(n − 1) × Q
```

**b) The 0.60–0.70 exponent band is wrong for a green ammonia complex.** 0.60–0.70 is the classic process-plant "six-tenths" regime, and it is correct for the ASU and the Haber-Bosch synloop — NREL's fitted exponents are 0.49 and 0.50 — but those are only **~9% of the capex**. The complex is dominated by things that scale *nearly linearly*:

| Block | Weight | n |
|---|---|---|
| Renewables + BESS + transmission | 0.45 | 0.97 (priced in $/kW, flat above ~100 MW) |
| Electrolysis island | 0.28 | 0.92 (modular stack replication) |
| ASU + Haber-Bosch + compression | 0.09 | 0.58 |
| Storage, jetty, desal, site | 0.11 | 0.55 |
| EPC / contingency / owner's | 0.07 | rides the mix |

Weighted **n = 0.87**; we recommend **0.85 central, 0.75–0.95 band**. Applying 0.65 to a green ammonia complex over-rewards scale by a large margin.

Per-fuel exponents differ and are carried per row in the JSON: LNG 0.65 (⚠️ see §4), HVO 0.68, e-methanol 0.85, LH₂ 0.90.

**c) The ×1.25 FOAK multiplier is too low, and must not be applied on top of our central.** RAND R-2569-DOE Table 4.1, inverted, gives actual/estimate ratios of 2.04× (Class 0), 1.61× (Class 1), 1.28× (Class 2), 1.20× (Class 3). NEOM's own natural experiment — $5.0bn announced July 2020 → $8.4bn at close May 2023, on *identical published scope and nameplate* — is **1.68×**, of which ~20–25 points is general EPC inflation, leaving a FOAK/definition premium of ~1.35–1.45×. We recommend **{1.20, 1.50, 2.10}**.

**Should FOAK be the default for a corridor plant? Yes, unambiguously.** As of August 2026 there is not one operating export-scale green ammonia complex anywhere on earth. NEOM is ~90% built and ships nothing before 2027. Every plant reaching FID before ~2030 is first-of-a-kind for its sponsor, its EPC contractor, its site and usually its electrolyser supplier at that scale. NOAK is a 2035+ condition.

**⚠️ But do not double-count.** Our `capexUsdPerTpa.central` of $11,000 is **already FOAK-inclusive** — it is anchored on NEOM at financial close and AM Green at FID, both of which carry FOAK contingency inside their published numbers. Apply the multiplier only to a NOAK or study-derived baseline. A NOAK view of the same 100 kt plant is roughly $11,000 ÷ 1.5 ≈ **$7,300/tpa**, which is our `low`.

**d) One structural warning on the opex formulation.** `opex = pct × capex` is wrong-signed under scale. A small plant has both a *higher* capex/tpa and a *higher* true O&M/tpa (fixed staffing, fixed marine operations), so a constant percentage applied to an already-inflated capex roughly double-counts. If the model keeps the percentage form, consider holding absolute opex nearer $450–500/tpa/yr at 100 kt and letting the percentage fall as capacity rises.

---

## 4. Where credible sources disagree by more than ~2×

Reported, not averaged.

| Disagreement | Spread | Our reading |
|---|---|---|
| **Electrolyser capex: IRENA 2020 ($500–1,400/kW) vs IEA 2025 ($2,000–2,600/kW outside China)** | ~2–3× | Not a methodology artefact — five years of *upward* revision as real projects were procured. **Use IEA 2025.** IRENA's 2020 costs did not survive contact with the market. |
| **Green-ammonia opex: NREL & DOE (5%/yr) vs Djire et al. E3S (1.5%/yr)** | >3× | Side with 5%. DOE's 5% explicitly *excludes* stack replacement, so a complex reserving for it lands above; E3S's 1.5% is applied to a configuration with no renewables, no storage, no port and no desalination — it is not costing the same asset. Our bottom-up gives 5.3%. The bundle's 5.5% and the study's 6.5% are both fine. |
| **Grey ammonia capital intensity: Thunder Said ($650/tpa) vs IRENA ($1,500–2,000/tpa)** | >2× | Thunder Said looks like an ISBL/synloop-plus-reformer number for a very large plant in a low-cost region; IRENA looks total-installed and OSBL-inclusive. We need total-installed, so IRENA. Note the consequence: even IRENA's **grey** figure exceeds the bundle's $1,400/tpa for a *green* plant. |
| **Methanol tankage: TNO 2023 (€1,027/m³) vs Thunder Said ($503/m³)** | 2.2× | **Unresolved.** TNO's Table D.1 may state capacity per tank rather than in total, and its export row is internally inconsistent (4 × 50,000 m³ ≈ 158 kt, not the 114 kt printed). We carry the full range and mark the block unverified. |
| **LH₂ storage: IEA 2019 ($6,382/m³) vs TNO 2023 (~€41,000/m³) vs Thunder Said ($8,000/m³)** | ~6× | Almost entirely scale (50,000 m³ vs 1,440 m³ vs "small-scale"), and **none of the three publishes a scaling law**. Marked unverified. |
| **Ammonia merchant price: China fob Qingdao ($312/t) vs NW Europe ($828/t)** | 2.65× | Real, not an error. The domestic Chinese coal-based market is structurally decoupled from the seaborne merchant market. **Never blend them.** |
| **Methanol posted price: Methanex North America ($1,480/t) vs China ($525/t), 28 Jul 2026** | 2.8× | A genuinely fragmented market in Aug 2026, not an averaging problem. For a Singapore bunker model the Asian posting ($525–550) is the relevant one, and realised prices run ~75–85% of posted. |
| **e-methanol: ACME–Mitsubishi contracted (~$1,000/t) vs modelled e-methanol top ($2,400/t)** | 2.4× | Feedstock route. ACME is biogenic-CO₂ and supported; true e-methanol from DAC CO₂ plus electrolytic H₂ in Europe sits at the top. **The model must declare which molecule it means.** |
| **LNG scale exponent: textbook 0.6 vs observed forward cost inflation** | direction, not magnitude | ⚠️ The famous 0.6 is a *cross-sectional* observation about brownfield train additions (NLNG Trains 4+5: "a doubling of plant capacity with a 50 per cent reduction in $/tpa for the additional capacity" → n = 0.585). It has been **overwhelmed in practice**: Golden Pass +25% with a contractor bankruptcy, Plaquemines +$2.35bn in four months, Woodfibre 4.3×. In a forward-looking model, use n ≈ 0.85 with no escalation **or** n ≈ 0.65 with an explicit real escalation term. Doing both flat will understate LNG capex. |

---

## 5. Findings beyond the fuel rows

Three things we found that are model-structure problems, not data problems.

**a) `fossil = $0 port capex` is the wrong axis.** LNG is fossil and needs a full cryogenic terminal (~$50m at bunker scale) *plus* a $55–90m bunker vessel. The correct split is **incumbent infrastructure (LSFO ≈ $0) versus new infrastructure (everything else)**. The zero is right for LSFO and wrong for LNG.

**b) `bargeCapexUsdM = $5m` fails decisively for every fuel.** The cheapest *newbuild* dedicated bunker vessel figure found for any fuel is **€8m for a 2,850 m³ conventional methanol barge** — the ambient-liquid, cheapest-possible case. A 5,000 m³ ammonia bunker vessel is **$34m**; a 10,000 m³ LNG one **$55m**; an 18,000 m³ LNG one **$87.4m**. $5m is achievable only as a *conversion* of an existing barge (€1.5m, 2015). Similarly `bargeOpexUsdMPerYear = $0.3m` is ~8–13× low: a crewed bunker vessel costs $2–4m/yr to run regardless of what it carries.

**c) `vesselCapexPremium` cannot be one number across segments.** The ammonia dual-fuel fuel system is a roughly **fixed $20–25m**, so the premium *as a fraction* scales inversely with hull value: **16%** on a $150m 15,000 TEU boxship (DNV 2025 and MMMCZCS 2022 agree exactly, the most robust anchor in the vessel dataset), **~26%** on a $73.5m Newcastlemax, **~30%+** on a $37m Kamsarmax. The bundle's 0.25 is close to right for bulk carriers — which is what a copper-concentrate corridor uses — and ~1.6× too high for large container ships. **Consider carrying a fixed USD adder instead of a fraction.** Also note that "ammonia-ready" is nearly free: COSCO's 15 Newcastlemaxes (30 Jul 2026) with conversion provisions priced indistinguishably from conventional.

**d) Two merchant prices are simply stale.** VLSFO at an undated $594/t is 9% below Rotterdam and 28% below both Singapore and the Ship & Bunker Global-20 average as of 14 Aug 2026. EUR/USD at 1.08 is 6.6% below the ECB reference rate of 1.1567 (14 Aug 2026), which understates every EUR-denominated regulatory cost by 6.63%. Neither is a research problem; both just need replacing. On FX, note that neither spot nor a rolling average is strictly right — FuelEU penalties accrue over a calendar year and EU ETS allowances are bought through it, so the **ECB annual average** is the matching convention, and the rate should be a sensitivity rather than a constant.

---

## 6. What we could not source — named explicitly

The brief asked for this rather than plausible-looking fill. In rough order of how much it matters.

1. **IRENA 2022 Table 11**, *"Capital cost for renewable ammonia plants, including or excluding renewable energy generation cost"* (Annex C, p.134) — **the single most directly relevant published table for the headline number, and it was not read.** Every retrieval truncated before the table body and direct PDF download was blocked. Same for Table 10 (p.133). **If this can be obtained, revisit `capexUsdPerTpa` for e-ammonia before publishing.**
2. **Deloitte/GIZ H2Uppp (Aug 2024) Tables 24, 27 and 28** (pp.56–59) — capital costs and full assumptions for a 600 kt/yr complex at *exactly* our required scope, including jetty, EPC, contingency and owner's cost. Retrieval truncated; only the LCOA results (Table 38) were readable.
3. **The MMMCZCS $1,100m line item** — see §2. Its nature (capex vs 15-year cost) and its currency year are both unknown.
4. **Any published capex for an ammonia *bunkering* terminal.** Azane's three Norwegian terminals have a grant figure (NOK 442m across three) but no total investment; the Fjord Base terminal's cost is not disclosed.
5. **Any published capex for a European methanol marine terminal.** Mabanaft Hamburg (4 tanks, ~20,000 m³) and Evos Rotterdam (5 tanks, 67,500 m³ + jetty) both declined to disclose.
6. **Bunker vessel operating costs, for any fuel.** Moore *OpCost* and Drewry *Ship Operating Costs* were not retrievable. Every `bunkering.opexUsdMPerYear` in the JSON is an estimate.
7. **A second source for the $34m ammonia bunker vessel.** ITOCHU's own release confirms the yard, the 5,000 m³ capacity and the delivery date but omits the price.
8. **Any LH₂ bunkering cost at all** — vessel, terminal or shore equipment. Nothing has been built, so nothing is published. Every LH₂ bunkering number is an analogy.
9. **Any LH₂ merchant vessel premium.** DNV AFI recorded *one* hydrogen order in all of 1H-2026 against 73 for LNG. The JSON carries the ammonia premium as an explicit floor, repeated in all three positions, and says so.
10. **Hydrogen liquefaction capex from the IEA.** GHR 2024's Assumptions Annex prints *"CAPEX USD/t H2/day NA"* — withheld for confidentiality — so the field's most-cited source publishes nothing here.
11. **Kassø's construction cost from the developer.** Neither European Energy nor Mitsui has published one; the DKK 1.5bn in circulation is a Nov 2022 Danish trade-press pre-construction estimate. This is why the e-methanol production block is marked unverified despite the plant being real and operating.
12. **A post-2020 replacement for OIES NG137.** The 2018 Songhurst table remains the best public $/tpa LNG dataset and is now eight years stale.
13. **Dated 2025–26 broker quantification of the LNG dual-fuel premium.** Clarksons, Braemar, Gibson, BRS and Fearnleys are all subscription-walled; our LNG premium is inferred from public order prices and is the weakest cell in the vessel table.
14. **Live Argus and Platts assessments** for ammonia, B24/B30 bunkers and green methanol — all paywalled. Free dated proxies (ENGINE, Ship & Bunker, Methanex postings, Quantum Commodity Intelligence) were used and labelled.
15. **A dated August 2026 EUA spot settlement.** ICE and EEX dailies are paywalled; the best free dated observation is the May 2026 monthly average of €74.04/tCO₂. Refresh from EEX before publishing.
16. **CEPCI-type escalators.** The 2017→2025 (×1.40) and 2020→2025 (×1.25) multipliers used in the port-storage derivations were not verified against a retrieved index, and they move the ammonia and LH₂ terminal numbers materially.
17. **A green-ammonia-specific FOAK/NOAK multiplier.** All retrievable FOAK literature is nuclear or generic process plant; our band is RAND plus the NEOM natural experiment.
18. **A citable document making the "attribute zero capex to bunkers" argument directly.** The LSFO zero is argued from IEA capacity/demand data plus standard refinery economics, not lifted from a source — hence `verified: false`.

---

## 7. Verified decisions, at a glance

30 blocks, 13 verified, 17 not.

| Fuel | production | portStorage | bunkering | merchantPrice | vesselPremium |
|---|---|---|---|---|---|
| lsfo | ✗ | ✗ | ✗ | ✓ | ✓ |
| lng | ✓ | ✓ | ✗ | ✓ | ✗ |
| e-ammonia | ✓ | ✓ | ✗ | ✓ | ✓ |
| e-methanol | ✗ | ✗ | ✗ | ✗ | ✓ |
| biodiesel-hvo | ✓ | ✗ | ✗ | ✓ | ✓ |
| lh2 | ✗ | ✗ | ✗ | ✗ | ✗ |

Per-row reasoning is in each block's `sources[].note`. The pattern is not random: **production and price are broadly sourceable; bunkering is sourceable nowhere** (no bunker-vessel opex benchmark exists in the public domain for any fuel, and no ammonia or LH₂ bunkering asset has a published cost), and **everything about LH₂ is an extrapolation** because nothing at bunker scale has been built.

Six of the LSFO and HVO zeros are repeated single figures rather than ranges, as the brief permits; `biodiesel-hvo.vesselCapexPremium` carries a deliberate `low = central = 0` because a drop-in fuel genuinely has no vessel premium, with a 0.02 high covering neat B100 elastomer and coating effects that no source quantifies.

---

## 8. One process note

Four of the six citations we reconstructed from research notes rather than copying verbatim turned out to be wrong URLs and were corrected before delivery (Kassø, Neste, Thunder Said LNG, and the hydrogen liquefaction exponent, which is real but belongs to DOE Program Record 19001 rather than the HDSAM model page). Two source claims were also weaker than first written and were downgraded: the Kassø capex, and the Thunder Said LNG figure, which is an *operating* cash cost of ~$1/mcf and not an all-in cost. Every URL in the JSON has been checked to resolve to the document described.
