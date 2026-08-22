# Apply sheet — bundle 2026-08-18-fuel-v4 → v5
Every return line from the verification log, in one place. Format:
`<id>: keep | replace <v> | pool <v> | open — <source> — <note>`

**Read §0 first. Three decisions govern more rows than any individual figure.**

---

## §0 Blocking decisions

1. **WACC basis — real or nominal?** All Group A values below are **real, post-tax, USD**. If the model
   discounts nominal cash flows, add ~230 bp to every one of them.
2. **Vessel capex spec — conventional or as-built?** All Group B2 values below are **conventional**
   newbuild prices, because the bundle carries a separate `vesselCapexPremium`. If the shipped capex
   already includes a dual-fuel spec, every alternative-fuel corridor double-counts the premium.
3. **Fuel opex boundary — is electricity and CO2 feedstock inside or outside `production.opex`?**
   Decides whether the e-methanol opex band is right or 2.5–8× too high.

> **Resolution against the engine (2026-08-21, ingestion):** (1) the engine discounts
> nominal cash flows by default (`rateBasis` defaults to "nominal" and gates only OPEX
> escalation; the discount is unconditional), so every Group A value is shipped
> **+2.30 pp** (FRED T10YIE breakeven, the same instrument the build used); (2) the
> bundle capex is confirmed **conventional** (the green side multiplies
> `1 + vesselCapexPremium` on top); (3) build-plant charges nothing for feedstock
> outside `production.opex`, so the e-methanol band ships **complete-scope composed**
> (renewables capitalized in capex, opex = DEA 3% O&M + CO2 feedstock).

---

## Group A — country WACC (7/7)

```
denmark:       replace 0.057  — Damodaran ctryprem Jan/Jul-2026 + FRED DGS10/DFII10/T10YIE Aug-2026, component build — CRP 0.00%; was 0.055
netherlands:   replace 0.057  — as denmark — CRP 0.00%; ACM pilotage 7.2% nominal pre-tax EUR is a regulated-monopoly floor, not a comparator
singapore:     replace 0.057  — as denmark — CRP 0.00%; the shipped +50bp over DK/NL has no country-risk basis in a USD model
united-states: replace 0.060  — as denmark, CRP 0.23% — shipped 0.070 was 105 bp high
india:         replace 0.079  — Damodaran CRP 2.85% x-checked vs IEA Cost of Capital Observatory India 2024 — shipped 0.095 was 157 bp high
brazil:        replace 0.082  — Damodaran CRP 3.24% x-checked vs IEA Observatory Brazil 2024 — shipped 0.115 was 326 bp high, and above ANTAQ's own 9.92% regulated port WACC
other:         replace 0.093  — Damodaran Jan-2026 ladder, Ba3 notch (default spread 3.06%, CRP 4.66%, ERP 8.89%; Albania/Armenia/Jamaica/Uzbekistan) — CLOSED, was POOLED 0.092. Ba2 0.087 is the minimum that clears the listed set; B1 0.102 is strict worst case
```

## Group B1 — shared vessel terms

**`portAndCargoLoad` — GJ/day per 1,000 GT** (fuel energy input, all machinery, berth hours only)
```
bulk:          replace 2.3   (band 2.0–2.5)   — Hulskotte/TNO Table 3.1 + Port Houston 2023 GMEI Tables 3.11/3.12 — 17% apart
container:     replace 5.0   (band 3.4–6.5)   — same pair — band is the reefer spread (CE Delft 2026 Table 5)
chemical:      replace 17.0  (band 15–18)     — same pair — 15% apart
roro/pctc:     replace 7.0   (band 4.1–9.9)   — same pair
general cargo: pool 7.0      (band 5.5–11.3)  — POOLED, the two sources are 2x apart
oil tanker:    pool 15.0     (band 7.7–19.8)  — POOLED; bimodal by call type, not uncertain: discharge calls run cargo pumps, load calls do not
gas (LPG):     pool 6.0      (band 4.8–9.4)   — POOLED, thin
lng carrier:   replace 900 GJ/day (band 650-1,400) — EU MRV 1,114 t CO2/ship/yr at berth / 2.750 = 405 t LNG/yr = 19,687 GJ/yr over ~20 berth days; + 359 GJ per discharge call of measured cargo-pump work. CLOSED
               NOTE: BOG *generated* is 3,200-5,700 GJ/day (GTT 0.085-0.15 %/day at 174,000 m3) but is NOT BOG *burnt* - loading calls return vapour ashore, 44% of the fleet reliquefies, and JRC finds only 3.8% of an LNG carrier's annual CO2 occurs at berth
```
Structural note: the rate per GT **falls with size** (Port Houston: 17.72 for a handysize tanker, 7.71
for an aframax). Prefer `a x (GT/1000)^0.7` over a flat rate, or use per-size-band values.

**`ladenBallastSplit` — share of distance sailed**
```
bulk:          replace 0.55  — IMO MEPC 68/INF.24 Table 5 (UCL/AIS) — was 0.85
tanker:        replace 0.50  (band 0.42–0.60) — MEPC 68/INF.24 + Bimpikis et al. 2026 (Stanford, 234,795 voyages) — was 0.85
chemical:      replace 0.80  — MEPC 68/INF.24 Table 5 — was 0.85
gas:           replace 0.70  — MEPC 68/INF.24 Table 5 — was 0.90
general cargo: replace 0.65  — MEPC 68/INF.24 Table 5 — was 0.90
container:     replace 1.00 + add a separate utilisation term 0.70 — Clean Cargo/SFC 2024 — was 0.95, which is the wrong construct: liner ships do not ballast
roro/ropax:    pool 0.95     — no published figure exists in any source; liner-service analogy to container
```
⚠️ GLEC v3.2 / ISO 14083 build sea intensities on a **round-trip** basis and publish no maritime
empty-running default. Applying this split on top of a GLEC or IMO default intensity double-counts ballast.

**`serviceSpeed` — knots, observed cruise-phase**
Primary ICCT WP 2020-27 Table 5 (AIS, 2019); cross-check IMO DCS RY2023 Table 3.
```
bulk-postpanamax-93k: replace 11.2   bulk-vloc-325k:  replace 11.3
tank-small-15k:       replace 10.0   MR2:             replace 11.2
chem-imo2-12k/25k/40k: replace 10.0 / 11.2 / 11.2  (oil-tanker proxy — no chemical-specific speed is published)
cont-handy-2800:      replace 13.7   cont-6400:       replace 15.3   cont-13640: replace 15.8
cont-ulcv-18000:      replace 15.1   cont-ulcv-24000: replace 15.7
gas-vlgc-84k:         replace 13.7   vlac-93k:        replace 13.7   gas-lng-174k: replace 13.9
roro-cargo-12k:       replace 14.0   pctc:            replace 14.5
ropax-8k:             pool 15.7      — fleet mean for ro-pax >=5,000 GT; an 8,000 dwt short-sea ropax designs well above 20 kn
genc-12k:             replace 9.4    genc-25k:        replace 10.9
```
⚠️ See Wave 5: observed speed + EEDI-derived `gjPerNm` double-counts slow steaming.

## Group B2 — vessel capex (USD m, conventional)

```
bulk-postpanamax-93k: keep 42     — kamsarmax 82k $38.0m (4 brokers, Aug-26) + 87k dwt open-hatch $45.0m (Oct-25)
bulk-vloc-325k:       keep 118    — 343,000 dwt ore carrier x6 at $121.3m, CMHI, CMES, Jul-26
tank-small-15k:       keep 28     — tanker curve (n=0.488, residuals +/-6% over 50k–310k dwt) -> 29.2
chem-imo2-12k:        keep 32     — chemical curve -> 29.5; nearest print 6,800 dwt stainless $24.9m
chem-imo2-25k:        replace 38  — X3 failure: shipped 50 equals the hard-printed 50,000 dwt price ($50.7m, Hafnia x8, Apr-26)
chem-imo2-40k:        replace 46  — X3 failure: 40,500 dwt LNG-DF $44.9m => ~$39m conventional; shipped 65 exceeds the 50,000 dwt print
cont-handy-2800:      keep 45     — broker $44.0m + contract $46.5m, 2.8% apart. Best-evidenced row in the group
cont-ulcv-18000:      replace 180 (band 165–184) — 190,000 dwt LNG-DF $201.34m (Jiangnan/COSCO, Jan-26) de-rated; shipped 215 is a dual-fuel price in a conventional field
cont-ulcv-24000:      replace 232 — container curve (n=0.805); no 22–24,000 TEU price is public (MSC/Hengli "N/A")
gas-vlgc-84k:         replace 117 — eight independent 2025–26 prints, all $113–121m. Largest capex error found: shipped 95 is 19% below every observation
roro-cargo-12k:       replace 88 (band 85-95) — DIRECT HIT: Tasmanian Achiever II / Victorian Reliance II are 12,000 dwt exactly, A$86m each (~US$62m), CSC Jinling, 2016, conventional; + Finneco 17,377 dwt US$66.7m (2018). Escalated on the Wave-4 broker series (+53-65% 2016->2026). Shipped 55 was ~40% low. CLOSED
ropax-8k:             replace 200 (band 175-230) — TWO DIRECT HITS: MV W.B. Yeats 7,859 dwt EUR 144m (FSG 2016, conventional) and P&O Pioneer 8,850 dwt EUR 130m (Guangzhou 2019, hybrid), escalated on the Tasmanian Parliament's documented +37% (2018->2025) and Grimaldi's 2025 order at ~US$144m. Shipped 90 was LESS THAN HALF - the largest single error in the bundle. CLOSED
                      WARNING: dwt is the wrong cost driver here. Price tracks lane-metres and GT (GT/dwt runs 5.4-6.5). Apply yard region (Europe +40-80%), fuel (LNG/methanol +20-40%) and service profile (cabins, speed) before any size scaling
genc-12k:             replace 19  — general-cargo curve from $15.61m at 7,500 dwt and $29.8m at 40,000 dwt; shipped 22 is +17.6%
genc-25k:             keep 28     — same curve -> 24.8, +12.7%, inside tolerance
```

## Group B3 — vessel opex (USD/day)

```
container (8 rows): replace ~7,200 — Costamare FY2025 $6,516 + Global Ship Lease FY2025 $8,230 (two audited fleets)
                                     WARNING: no listed owner discloses opex above 14,424 TEU; the 18k and 24k TEU rows are extrapolations
gas-vlgc-84k:       replace ~9,000 — BW LPG FY2025 $8,800 + Dorian LPG FY-Mar-26 $10,557 (=~9,300 ex non-capitalisable drydock)
gas-lng-174k:       replace ~15,000 — Flex LNG FY2025 $15,780 (13 ships, 174k cbm); CCEC cross-check contaminated by a boxship. Single-source
vlac-93k:           pool ~9,900    — VLGC central +10%. No ammonia-carrier opex disclosure exists anywhere; labelled an assumption
pctc:               replace ~8,400 — Wallenius Wilhelmsen Q2-26 $8,142 + Hoegh Autoliners FY2025 derived $8,510. 4.5% apart
roro:               pool ~8,400    — PCTC analogy, stated
ropax:              pool ~25,000/day (band 11,000-42,000) — Molslinjen 2024 ~EUR 10,500 + Tallink FY2025 ~EUR 38,285 + Washington State Ferries FY2024 US$29,257 (all derived, arithmetic in the log). POOLED because the segment genuinely varies 4x, driven by CREW NATIONALITY AND HOTEL STAFFING, not ship size. CLOSED
general cargo:      replace genc-12k ~3,800/day, genc-25k ~4,500/day — Wilson AS FY2025 EUR 2,863-3,379/day (131 short-sea general-cargo ships, 1,500-8,500 dwt) + Pacific Basin FY2024 handysize US$4,750/day. Two audited fleets bracketing the targets. CLOSED
```
**MMI covers tankers and bulk carriers only** — confirmed from the FY2024 brochure. The checklist's
assumed route for this group does not exist. Scope differences between owners are worth up to
$839/day (+12.4%) — align denominators, drydock treatment and management fees before pasting.

## Group C — fuel bands

```
lsfo production/portStorage/bunkering:  designate 0/0/0 — modelling designation, incumbent infrastructure. CHEAP WIN
biodiesel-hvo portStorage/bunkering:    designate 0/0/0 — drop-in liquid, existing distillate handling. CHEAP WIN
e-methanol merchantPrice:  keep 1,000/1,400/2,400 — IRENA/MI Innovation Outlook (BECCS 800–1,600, DAC 1,200–2,400) + Methanol Institute EU willingness-to-pay ceiling EUR 2,238–2,405/t. VERIFIED, band re-scoped: low=BECCS CO2, high=DAC CO2. FLAG: the EU ceiling steps down to ~EUR 1,325/t from 2034
e-methanol production capex: replace 3,700/5,500/9,000 $/tpa — Hy2Market D4.8 (EUR ~5,130/tpa incl. dedicated renewables) + C2X Huelva $1.1bn/300kt = $3,667/tpa. Declare the scope boundary
e-methanol production opex:  composed 155/260/410 $/tpa/yr — DEA ch.98 3% of capex O&M + CO2 feedstock 1.4 t/t x $30-100/t (ingestion decision: the corridor's opex line is the ONLY feedstock carrier under build-plant)
e-methanol scale exponent:   replace 0.95/0.89/0.80 — DEA ch.98 synthesis n=0.68-0.69, electrolysis n=0.80-0.97; NETL 0.60-0.70 for CO2 removal. The 0.6 low end had no support
e-methanol portStorage:      keep 6/12/22 + declared volumes (~10,000/21,000/38,000 m3 at $576/m3, Ulsan New Port) — VERIFIED_BY_METHOD; opex replace 0.24/0.48/0.88 (4%-of-capex convention)
e-methanol bunkering:        keep 2/13/25 — POOLED, scope = shore-transfer package; CEF/AFIF LUXIA EUR 55.2m is the vessel-plus-shore upper bound; opex replace 0.12/0.52/1.00
e-ammonia bunkering:         pool 20/34/55 $m — Royal Society (Feb 2020) GBP 20–40m per 10,000 t refrigerated tank. POOLED, scope = tank farm only, excludes jetty, transfer arms, vapour return and bunker vessel; opex replace 0.8/1.4/2.2 (4% convention)
lng bunkering:               keep 40/55/90 — VERIFIED: bunker vessel EUR 4,500-5,000/m3 (LNGHIVE2, EG LNG Baltic, FueLNG Bellina) or shore tank EUR 2,000-2,700/m3 (Pori, Tornio Manga); band buys ~9,000/12,000/20,000 m3 vessel; opex replace 1.6/2.2/3.6
lng vesselCapexPremium:      keep 0.10/0.15/0.22 — SEA-LNG/Opsiana three hull types + MMMCZCS methanol +11% / ammonia +16%. VERIFIED; strongly size-dependent
lh2 production:              replace 12,000/25,000/45,000 $/tpa — DOE Record 19001 (liquefaction $5,000–23,000/tpa, n=0.8) + Hydrogen Council $4,500–7,000/tpa electrolysis. Scope = electrolysis + liquefaction
lh2 portStorage:             keep 175/270/400 $m — DOE AMR 2024 ST235 $2,500–3,000/m3 implies 5.0/6.4/9.4 kt LH2; IEA terminal unit cost (~$90,900/t incl. jetty) implies 1.9/3.0/4.4 kt. VERIFIED_BY_METHOD with capacity + unit-cost basis declared; opex keep (already on the 4% convention)
lh2 bunkering:               keep 45/90/150 — scoped to ~500/1,000/1,650 t LH2 terminal on the IEA unit cost; nothing published between Sandia $1.5m truck-to-ship and IEA $290m terminal; opex replace 1.8/3.6/6.0
lh2 merchantPrice:           replace 5,500/8,500/13,000 $/t — IEA GHR 2024 gaseous $2–9/kg + DOE liquefaction $2.75/kg + terminal $0.39/kg. The shipped low of 5,000 was internally inconsistent
lh2 vesselCapexPremium:      replace 0.50/0.80/1.20 — bottom-up: LH2 needs ~2.6x LNG volume per unit energy; tankage alone ~50–60% of a VLCC newbuild. MMMCZCS states hydrogen is "irrelevant for deep sea shipping". The flat 0.26 was contradicted, not merely unverified
```

## Group D

```
benchmarkRules.fossilVesselCapexUsdM = 0: designate — existing fleet is sunk capital. CAUTION: only correct if the corridor comparison is incremental
benchmarkRules.fossilPortCapexUsdM   = 0: designate — incumbent bunkering infrastructure is existing and sunk
inflation:                                replace 0.023 — FRED T10YIE 2.30% (19 Aug 2026) + IMF WEO Apr-2026 US 2031 projection 2.2%. COUPLED to the WACC basis decision
uncertainty-ref rows:                     inherit from their parents, after them, never in parallel
```

---

## The infrastructure opex convention — one finding that closes five bands

Four independent institutional sources converge on annual opex as a share of capex for fuel storage,
terminal and marine-loading assets: **Danish Energy Agency 3%/yr** (CO2 marine terminal; also 3% for
the methanol and ammonia plants, 5% for CO2 carrier ships), **IEA 4%/yr** (LH2 export/import terminals,
ammonia reconversion) **and 5%/yr** (hydrogen refuelling stations), **Lloyd's Register/UMAS 3.0%/yr**
(refrigerated ammonia storage), **Trafigura 2.7%/yr** (3 mtpa LNG import terminal).

**Adopted: 4% of capex per year, band 2.7-5%.** Measured against it, five of the six shipped
infrastructure opex bands were 2-3x too high and one was already right (`lh2 portStorage`).

## Scoreboard — after wave 8

| outcome | count |
|---|---|
| **keep** (verified as shipped) | 16 |
| **replace** (verified, value moves) | 47 |
| **pool** (conservative, basis stated) | 8 |
| **designate** (modelling choice, documented) | 7 |
| **open** (no public basis anywhere) | 1 |
| **total datapoints resolved** | **79** |

The single remaining `open` row is container opex above 14,500 TEU (shipped as an extrapolation from
Seaspan/Atlas Corp's last public filing, documented as such in provenance).
