# Corridor cost research — source documents

Research deliverables, stored verbatim. These are the **provenance** for cost rows in the
reference bundles: a `sources[]` entry in a bundle points at a document here, and a reader
who wants to check a number should be able to walk bundle → this directory → the cited
publication without leaving the repo.

**Do not edit these files to make anything pass.** They record what a research pass found
on a given date, including the parts that turned out to be unverifiable. If a figure is
wrong, that is a finding to record in the next research pass, not a line to change here —
the same rule the golden fixtures carry (`fixtures/golden/corridor/README.md`).

| File | Commissioned by | Researched | Covers |
|---|---|---|---|
| `fuel-benchmarks-v1.json` | `docs/corridor/benchmark-research-brief.md` | 2026-08-16 | Production, port storage, bunkering, merchant price and vessel premium for all six fuels; EUR/USD |
| `fuel-benchmarks-v1-findings.md` | as above | 2026-08-16 | The reasoning: what was wrong, where sources disagree, and what could not be sourced |

## Why the findings note matters as much as the data

The JSON carries numbers; the note carries the parts that cannot be expressed as numbers
and that a later reader will need:

- **What is unverified and why.** 17 of 30 blocks are honestly `false`. Bunkering is
  sourceable nowhere — no public bunker-vessel operating-cost benchmark exists for any
  fuel — and everything about LH₂ is extrapolation, because nothing at bunker scale has
  been built.
- **Where credible sources disagree by more than ~2×**, reported rather than averaged.
- **What could not be sourced**, named explicitly instead of filled with a plausible
  number. IRENA 2022 Table 11 is the single most relevant published table for the headline
  figure and it could not be retrieved; if it ever is, the e-ammonia production row should
  be revisited before anything else.

## The one finding worth reading first

The bundle's `$1,400/tpa` for a green ammonia complex was **a unit error, not a scope
difference**: almost certainly IRENA's levelised *production cost per tonne produced*
(USD 720–1,400/t) read as a *capex per annual tonne*. A flow read as a stock.

It fails three independent tests, and the decisive one needs no new research: IRENA's
capital intensity for a **natural-gas** ammonia plant is USD 1,500–2,000 per annual tonne.
A green plant buys everything a grey plant buys except the reformer, plus electrolysers,
plus hundreds of MW of dedicated generation. $1,400/tpa is below the floor for a *grey*
plant and cannot describe a green one under any scope definition.
