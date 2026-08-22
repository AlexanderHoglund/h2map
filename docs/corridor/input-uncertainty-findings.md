# Input uncertainty — what the research found beyond the ranges

The 2026-08-18 uncertainty research returned six items of declared exposure
(imported as `data/input-uncertainty-ref/2026-08-19-uncertainty-v1.json`). It
also returned **four observations about the model itself**. None is actioned
here: each would move a number, and moving a number because a research note
mentioned it in passing is how a model drifts.

They are recorded so the decisions are deliberate.

Hand-maintained. Written 2026-08-19.

---

## 1. Newcastlemax CAPEX sits near the top of its researched band

The model holds **$80.5m**. Reported 2026 contracts:

| | $m |
|---|---|
| COSCO, 5 × 210,000 dwt, Nantong Xiangyu (methanol/ammonia-ready) | 78.25 |
| Cape Shipping, 3 × 181,000 dwt Capesize, Hengli | ~76 |
| 180,000 dwt assessed newbuild value (2024, then a 15-year high) | 69.63 |

Researched band **70 / 76 / 82**, so the model's point sits at roughly the
**88th percentile** — above every conventional contract found.

**Not wrong, but not central either.** Vessel CAPEX carries elasticity up to
0.79 on archetype B, so a ~6% level error is worth a deliberate decision
rather than a drive-by edit. Changing it means publishing a new bundle.

## 2. The 58k dwt row describes a size no longer built

Every 2026 order the research found was **63,500–64,500 dwt Ultramax**, and
one broker source states that 60,000–65,000 dwt is *"the current newbuilding
standard for the Handymax segment"*.

**This one needs no new data.** `bulk-ultramax-64k` **already exists in the
bundle**, at the same $34m as `bulk-handymax-58k`. So re-baselining archetype
A is a scenario choice, not a data-gathering exercise — though the fact that
two different sizes carry an identical CAPEX is itself worth a look.

## 3. Yard prices do NOT move together across classes

This one **contradicts a rationale already written into the model.**

`fleet-capital`'s rationale says both sides are ordered from the same yard
market. That remains true — it couples the two *sides of one hull class*. But
the research shows the assumption does not extend across *classes* over the
horizon this model runs:

- Clarksons Newbuilding Price Index: **182.14** (Feb 2026) against a 2007 peak
  of 184.83 — an aggregate move of a few percent over seventeen years.
- Within that: **Ultramax −27%** (48 → 35) and **Kamsarmax −19%** (46.5 →
  37.5) from 2007 to 2024, while VLGCs rose substantially.

**This is a Phase 4 input.** In the Monte Carlo the three vessel classes must
not be perfectly correlated; the research suggests ~0.6–0.8 within dry bulk and
lower between bulk and container, and notes that independent draws would be
more defensible than perfect correlation. The `fleet-capital` rationale has
been amended to say explicitly that it couples sides, never classes.

A second finding sits underneath: the dominant short-run driver of newbuild
price spread is **build country, not class** — one Japanese Ultramax order at
$39.2m against a Chinese cluster at $33.5–35m, a **17% premium for the same
deadweight**. If these bands ever need narrowing, specifying build country
would narrow them more than any other single input.

## 4. One order prices the methanol premium cleanly

Out of scope for the research, but a better datapoint than most published
premium figures: an April 2026 Imabari order prices **four conventional 64,000
dwt Ultramaxes at $39.2m** and options **two methanol dual-fuel at $45.5m** —
same owner, same yard, same deadweight, same announcement.

That is **+16.1%** like-for-like, against the model's verified premium band of
**11 / 22 / 28%**. It sits at the bottom of the band and suggests the 22%
central may be high for bulk carriers. The band is `verified: true` and this
is one order, so it is evidence to weigh, not a correction to apply.

---

## What the import itself revealed

**The e-methanol range currently reaches nothing.** Only archetype B purchases
its fuel — A and C build a plant, so their resolved merchant price is 0 and
there is nothing to perturb — and B runs e-ammonia. The methanol range is
correctly scoped to C and is inert there.

It is kept rather than dropped because it becomes live the moment a
purchase-sourced methanol corridor is modelled, which is exactly the case a
user is most likely to build. Recorded here so it does not later look like an
oversight.

**Two count discrepancies in the research's own prose**, both resolved in
favour of its data: its status line says six verified rows where its flags say
four, and it reports 27 sources against 28 citation entries (one document is
cited twice in the same row for two different figures). The flags and entries
are what the model reads.

## 5. What the Monte Carlo added (Phase 4)

Sampling every declared range in the same draw surfaced one thing the tornado
could not, because it is a property of the *joint* sample rather than of any
single bar.

**On archetype A the deterministic gap sits at the 99th percentile of its own
uncertainty band** — P10 $1,652.7m, P50 $1,690.3m, P90 $1,730.3m against a
point estimate of $1,729.2m.

That is not a sampler fault. Archetype A discounts at **8%** while the
researched WACC range for its region is **7.5 / 10 / 13** — so nearly every
draw discounts harder than the scenario does, and since the model discounts
*cost* flows a higher WACC yields a **smaller** gap. The band lands below the
point estimate because the scenario's own discount rate is optimistic relative
to the research.

Two consequences worth holding together:

- It is the same directional trap recorded in §"One directional note" below,
  now visible as a distribution rather than an argument.
- The WACC row driving it is `verified: false` and uses an **Indian solar
  proxy for Chile** — which the research itself flags as the weakest row in
  the file. So the finding is real but its magnitude rests on the shakiest
  input in the dataset. Replacing that row is the highest-value follow-up
  precisely because of this.

The rank-correlation ranking (interaction-aware, which neither the sweep nor
the elasticity artifact can produce) puts WACC first on A and C at −0.73 and
−0.80, and **inflation** first on B at +0.83.

## The research's own follow-ups

Named as the cheapest remaining wins, in its order:

1. Pull MPC Container Ships' *"Adj. OPEX per day"* from its full quarterly
   report — a single figure that would move the feeder OPEX row to verified.
2. Find a second 1,800 TEU feeder newbuild price — likewise for feeder CAPEX.
3. Replace the Indian WACC proxy with Chilean project-finance evidence. India
   is not Chile, and the research says so in the row itself.

## One directional note worth keeping

The model discounts **cost** flows, so a **higher** WACC produces a **smaller**
gap. At the time of writing the model carried a 6% OECD benchmark, which the
OECD energy-infrastructure evidence suggested was low — meaning corridor gaps
were being **overstated**, not understated. (Since bundle
`2026-08-21-verified-v5` the country WACC benchmarks are verified nominal
rates — Denmark/Netherlands/Singapore 8.0%, US 8.3%, India 10.2%, Brazil
10.5%, all other countries 11.6% — which resolves the level concern; the
directional sign below still holds.)

This is the same counterintuitive sign that governs the green-financing
question, and it means the WACC row is not a symmetric risk.
