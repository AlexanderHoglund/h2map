# Cruise ships — research results, wave C1–C5

**Bundle target:** `2026-08-21-cruise-v6` · **Written:** 2026-08-21
**Standard:** two independent sources per datapoint · **Scope:** ocean cruise only

> **Ingestion resolutions (2026-08-21):** (1) **corridor placement = deployment
> loop** — a cruise "corridor" is one ship class on a repeating itinerary
> (distance = loop length, roundtrips = loops/yr, cargo unit = passengers);
> the engine math is reused, the reinterpretation documented on the rows.
> (2) **3-term energy shipped**: `hotelLoadGjPerDay` covers hotel services for
> ALL 365 days, speed-independent; `gjPerNm` carries the propulsion-only
> values; cruise rows ship `portGjPerDay = 0` so berth hotel is not counted
> twice — exactly the closure-test construction below. (3) **hotel opex is
> data-only** (`hotelOpexUsdMPerYear`): fuel-invariant, cancels in the gap;
> excluded from the engine by designation. AFIR/FuelEU shore power stays a
> designation, not a model behaviour.

**Defaults taken so research could proceed** (none were answered; all reversible):
corridor placement left as an open modelling question — the data is needed either way ·
two opex fields carried · lower berths as denominator, occupancy recorded separately ·
AFIR/FuelEU documented as designations, not modelled · pro-rata hotel split, benchmarked.

---

## 1. The six rows

| id | GT | lower berths | max pax | crew | cabins | inst. MW | svc kn | capex $m | $/berth | $/GT | vessel opex $/day | hotel opex $/day | hotel GJ/day | gjPerNm |
|---|---:|---:|---:|---:|---:|---:|---:|---:|---:|---:|---:|---:|---:|---:|
| `cruise-expedition-190` | 12,000 | 190 | 265 | 140 | 95 | 6.5 | 15.0 | 130 | 684k | 10,833 | 30,100 | 173,500 | 117 | 3.59 |
| `cruise-luxury-780` | 55,000 | 780 | 830 | 540 | 410 | 28 | 18.5 | 540 | 692k | 9,818 | 29,400 | 165,600 | 537 | 6.92 |
| `cruise-premium-2400` | 95,000 | 2,400 | 2,850 | 1,010 | 1,205 | 50 | 18.0 | 870 | 362k | 9,158 | 50,800 | 297,200 | 928 | 8.75 |
| `cruise-contemporary-3100` | 143,500 | 3,100 | 3,950 | 1,500 | 1,630 | 56 | 20.0 | 1,200 | 387k | 8,362 | 76,700 | 320,100 | 1,402 | 10.45 |
| `cruise-large-4300` | 178,000 | 4,300 | 5,100 | 1,735 | 2,157 | 68 | 19.0 | 1,600 | 372k | 8,989 | 95,100 | 429,500 | 1,739 | 11.46 |
| `cruise-mega-5610` | 237,000 | 5,610 | 7,000 | 2,300 | 2,805 | 89 | 20.5 | 2,100 | 374k | 8,861 | 126,600 | 546,600 | 2,315 | 12.96 |

Common: `ladenBallastSplit` = 1.0 DESIGNATED · sea days ≈ 230, port days ≈ 135 · occupancy
105–110% of lower berths (Carnival 105%, RCL 109.7%, NCLH 103.5%) · annual nm ≈ 70,000–95,000.

---

## 2. The archetype ladder had to move — four of six targets were wrong

| archetype | plan target | what the fleet does | moved to |
|---|---|---|---|
| expedition | 10,000 GT / 200 berths | 12,000–23,000 GT at 126–500 berths; GT/berth spans 42–128 (3× — widest of any archetype; ice class is the driver: PC6 60–90, PC2 128) | 12,000 / 190 |
| luxury | 45,000 / 750 | 750 berths buys a 55,000 GT hull; 45,000 GT only gets ~600 (Seabourn Ovation) | 55,000 / 780 |
| premium | 75,000 / 2,000 | the expected 45–55 GT/berth does not exist — modern premium (HAL Pinnacle, Cunard) converged on 37–38; 2,000 berths needs 82,000–91,000 GT | 95,000 / 2,400 |
| contemporary | 135,000 / 3,200 | good fit, real 43–46 | 143,500 / 3,100 |
| large | 180,000 / 4,500 | bimodal — Carnival Excel 34 GT/berth, RCL/Princess/NCL 40–44; the target falls in the gap | 178,000 / 4,300 |
| mega | 230,000 / 6,000 | 6,000 lower berths does not exist on any ship in service or on order; ceiling Wonder of the Seas 5,734; Icon class 5,610 despite +14,000 GT | 237,000 / 5,610 |

What grows past ~5,700 is *maximum* passengers, not berths — Icon carries 7,600 on 5,610 lower
berths, an upper-berth factor of **1.35**. If energy or catering is driven by people aboard rather
than cabins sold, mega-ships need the max-pax figure and the gap is 1,400–2,000 people.

**Corrections to the brief's own ship list:** *Celebrity Xcite* is **Celebrity Xcel**, delivered
**November 2025** (not ordered for 2028). *Disney Believe* could not be confirmed — the 2027
Wish-class hull is listed unnamed. Wonder of the Seas was built by Chantiers de l'Atlantique, not
Meyer.

---

## 3. Capex — the cost curve is a composition effect, not a scale economy

Three 2025 filings converge on contracts signed 2023–26: NCLH **$461.7k/berth** and **$9,083/GT**
(17 ships, $21.5bn aggregate contract price — best disclosure in the set), Viking **$463.5k** and
**$8,519/GT** (10 ships, $4.63bn), RCL **$427.5k** (9 ships, $11.3bn). NCLH and Viking agree on
$/GT to 0.1%.

Across 27 priced ships, cost per berth falls with size (elasticity −0.34) — but **R² collapses to
0.05 once restricted to ≥2,000 berths**, and Icon ($356k/berth) prices above Excel ($256k) despite
being larger. **Cost per GT is close to flat** across the whole ladder (elasticity −0.11, median
$8,527/GT, range $5,700–13,462): steel is bought by the tonne, cabins sold by the berth; small
ships buy 2–3× the tonnes per berth. So **capex was priced on $/GT**; the $/berth column is an
output, not an input.

**Escalation is real:** orderbook $/berth $266k (2019) → $384.5k (Feb 2026), +44% ≈ 5.4%/yr; $/GT
$6,212 → $8,689. Corroborating: Meyer Werft's September 2024 state rescue (€400m for ~80% equity
plus ~€2bn guarantees) — "80 percent of the construction price of a cruise ship is usually only
paid when the ship is delivered", so yards carry input-cost inflation on fixed-price contracts.
Fincantieri holds over half the global orderbook with contracts to 2039.

| row | verdict | basis |
|---|---|---|
| `cruise-mega-5610` | VERIFIED | Icon $2,000m/248,663 GT; Legend D80 $2,000m; orderbook $8,689/GT; Icon-4 ECA-derived ~$3,000m upper bound. Band $1,900–2,600m |
| `cruise-large-4300` | VERIFIED | Mardi Gras $1,350m (2020) escalated; orderbook $/GT; Princess 3-ship floor. Band $1,350–1,900m |
| `cruise-contemporary-3100` | VERIFIED | Norwegian Prima $850m (2022 contract); Celebrity Xcel D80 $1,500m; Disney Treasure $1,100m (10-K borrowing). Band $1,050–1,500m |
| `cruise-premium-2400` | POOLED | weakest row — Koningsdam price not disclosed anywhere; only aggregator figures exist. Band $700–1,000m |
| `cruise-luxury-780` | VERIFIED | four independent ships at 54,300–55,500 GT: Silver Ray D80 $634m, Seven Seas Splendor $536m, Grandeur $517m, Viking programme $463m avg. Median $9,700/GT |
| `cruise-expedition-190` | VERIFIED | the strongest capex evidence in the exercise: Lindblad filed the actual Ulstein shipbuilding contracts as SEC exhibits — NG Endurance NOK 1,066,000,000 ($134.6m), Resolution NOK 1,290,950,000 ($153.5m); cross-checked against Ultramarine (€106m / 199 berths, PC6, Brodosplit). PC6 series-built ~190 berths lands $110–155m |

⚠️ **D80** figures back a contract price out of a disclosed export-credit loan ÷ 0.80 (convention
documented in NCLH 10-K, Viking 20-F, RCL 2017 Icon financing); the RCL Icon-4 facility may include
non-yard costs (+10–15% possible overstatement). **Aggregator prices are unreliable**: CruiseMapper
puts Silver Nova at €180m against a $507m ECA term loan on the identical sister in RCL's audited
filing — a 3.5× error.

---

## 4. Opex — the hotel/technical split, and where the numbers converge

Disclosed: food, onboard COGS, fuel, commissions, total shipboard payroll. **No filer anywhere
discloses** the marine-vs-hotel payroll split, "other operating" contents, R&M, dry-dock, ship
insurance, lubricants, stores, spares, technical management, or class fees. Carnival's one scope
sentence — repairs/maintenance/dry-dock live in "other ship operating expenses" — is the entire
published basis for the technical bucket.

Of ex-fuel shipboard cost, 32–40% is unambiguously hotel (COGS + food), 0% identifiably
technical, 60–68% unallocated. With two stated assumptions (marine crew = 15% of shipboard payroll;
technical = 50% of other-operating): technical share 18.8–23.5%, $24.25–24.49 per berth-day across
Carnival/RCL/NCLH — ⚠️ partly coincidence (Carnival: low payroll + high other-op; NCLH the inverse
— evidence the filers classify the boundary differently).

**The better denominator is GT, converging independently:** Carnival $205, RCL $191, NCLH $186 per
GT per year. **Adopted: $195/GT/yr ($0.534/GT/day)**, ±10% across three independently-prepared
filings on a denominator none of them uses — the single most useful number of the wave.

Full-cost spread per ALBD ex-fuel is ~9× (Carnival $116.99 → Lindblad $1,067.72), but ex-fuel cost
**per ship-day** for the three big filers lands within 4.5% ($338,908 / $354,392 / $339,558): cost
per berth-day is essentially cost per ship-day ÷ ship size. Lindblad's 96.5-berth ship costs
$103,044/day — 30% of a mega-ship's daily cost for 3.3% of the berths. `cruise-expedition-190` opex
is **POOLED** — Lindblad is the only per-passenger-day expedition figure published anywhere.

At all three big filers, almost exactly **half of vessel-level operating expense scales with heads
aboard**, not with the ship; Lindblad's passenger-scaling share is 13%.

---

## 5. Energy — MRV closure test, and where the two-term model breaks

Per-ship EU MRV records for 15 named cruise ships, 2018–2025 (via a mirror reproducing the
Commission's data unmodified; validated against ICCT's independently published 317 g CO₂/pax-nm for
Anthem of the Seas). Observed full-year EEA service: fuel 24,000–41,000 t/yr, distance
70,000–97,000 nm/yr, sea time 4,600–6,250 h/yr, 7–20% of annual CO₂ at berth, sea speed 12–17 kn.

**Hotel load from six ships: 9.77 GJ/day per 1,000 GT** (range 7.37–14.85); implied electrical
hotel load 2–11 MW reproduces Lloyd's Register's "at least 5 MW, perhaps approaching 10 MW". Hotel
share of annual energy 23–54%, clustering 30–50% (matches Baldi et al.'s metered 46/27/27
propulsion/heat/electric split). MRV-vs-ICCT at-berth cross-check agrees within 10%.

⚠️ The ICCT 68/32 aux/boiler split is the all-ship-types EU average; **cruise-specific is 83/17**.

### Closure test — MSC World Europa, 2025

Observed: 39,325 t fuel · 93,434 nm · 241 sea days · 124 port days · 13.0% of CO₂ at berth.
True 3-term: hotel 1,983 GJ/day × 365 (38.3% of annual energy) + propulsion 12.46 GJ/nm.
Bundle 2-term: port load 1,983 × 124 + gjPerNm 17.58.

| sensitivity | error (2-term vs true) |
|---|---:|
| base case | 0.0% |
| itinerary −25% distance | −0.5% |
| repositioning year, 60 port days | −6.7% |
| port-heavy, 200 port days | +8.0% |
| **slow steaming, −20% speed** | **−19.9%** |

**Speed is where it breaks**: the 2-term model scales the whole gjPerNm by speed² — including the
hotel energy hidden inside it, which does not fall when the ship slows. Observed cruise speeds
already run at 0.68–0.72 of design, so the fleet lives where the error is largest.

**Verdict: the `hotelLoadGjPerDay` third term is needed; the trigger is speed sensitivity, not
itinerary mix.** The rows carry hotel GJ/day separately — shipped as the third term in v6.

---

## 6. Designations

- `ladenBallastSplit` = 1.0, all six rows: passenger vessels do not sail in ballast; set as a
  modelling designation, not a measurement.
- **AFIR** (Reg. (EU) 2023/1804 Art. 9): TEN-T core maritime ports must provide shore power for
  passenger ships ≥5,000 GT from 1 Jan 2030 (exempt <100 average annual calls).
- **FuelEU Maritime** (Reg. (EU) 2023/1805 Art. 6): passenger ships ≥5,000 GT must connect at AFIR
  core ports from 1 Jan 2030, all EU ports with OPS from 1 Jan 2035 (exempt <2 h moored).
  GHG-intensity trajectory −6% (2030) → −80% (2050) WtW against 91.16 gCO₂e/MJ.

Together these remove most European at-berth fuel demand from 2030 — 7–20% of annual energy for
these rows, up to 54% on port-heavy ships. The rows must not silently assume 2019 behaviour to
2050. **Documented, not modelled** (ingestion resolution).

---

## 7. Open, and what would close it

| item | status | what closes it |
|---|---|---|
| corridor placement | **RESOLVED at ingestion: deployment loop** | — |
| `cruise-premium-2400` capex | POOLED | Cruise Industry News Annual Report (paid) is the only systematic per-ship series |
| `cruise-expedition-190` opex | POOLED, single source | Hurtigruten Expedition Cruises AS statutory accounts (operating company, not the charter SPV) |
| marine/hotel payroll split | estimated, not disclosed | does not exist in any filing; the 15% assumption drives a 17–27% band on technical share |
| Viking ocean-only vessel opex | not separable | 20-F gives segment totals only |
| IMO 4th GHG Study Table 17 cruise rows | not retrieved | same blocked document as wave 8; CARB 2025 Tables 9/10 cover Cruise 1500–5000 and are in hand |
| dry-dock spend | no filer discloses a dollar amount | invisible inside "other operating" |
