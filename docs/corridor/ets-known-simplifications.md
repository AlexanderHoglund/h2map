# EU ETS — known simplifications

Two parts of the Directive the corridor model does not price. Both are
deliberate omissions with measured magnitudes, recorded here so they are a
stated decision rather than an accident.

Written 2026-08-17, alongside the carbon-origin and gas-coverage work. Hand
maintained — this file is not generated.

---

## 1. Berth emissions are charged at the voyage scope, not at 100%

**What the Directive says.** Emissions at berth in an EEA port are chargeable
at **100%** regardless of voyage type. The 50% scope applies to the *voyage*
between an EEA and a third-country port, not to the time alongside.

**What the model does.** One `scope` fraction multiplies the whole fuel
consumption, berth included. A corridor of extra-EEA voyages set to scope 0.5
therefore charges berth fuel at 50% when it should be 100%.

**Measured understatement of the ETS line**, at scope 0.5:

| Corridor | Port share of round-trip energy | ETS understated by |
|---|---|---|
| Skagerrak short-sea (562 nm, Handymax) | 15.5% | **~8.4%** |
| Chile–Japan deep-sea (9,500 nm, Handymax) | 1.1% | ~0.5% |

**Decision: document, do not model — for now.**

The reasoning is not that it is small; on a short-sea corridor it is not. It
is that the model already has the harder half of the problem solved and the
remaining half is a scoping question, not an arithmetic one.

`ScenarioPortEnergy` (`result.ts`) already computes `portGjPerRoundTrip`,
`steamingGjPerRoundTrip` and their `share`, and already flags `material: true`
past ~10%. So a berth split is available without new physics. What is missing
is a decision the model cannot make for the user: **how much of the port time
is in an EEA port**. On a Gothenburg–Rotterdam run both ends are EEA and the
answer is 100%; on Chile–Japan neither is, and the answer is 0%. A single
`berthShareInEea` parameter would express it, and the arithmetic would be

```
chargeable = steamingGj × scope + portGj × berthShareInEea
```

That is a small change and the right one, but it adds an input to a step the
Chilean and Australian reference scenarios do not currently carry, so it
belongs in its own commit with its own defaults decision. **The scope field's
help text now states the omission explicitly** so nobody reads scope 0.5 as
complete.

Note the interaction with the port-share warning: a corridor where this matters
most (short-sea, high port share) is exactly the one where `material` is
already true, so the existing badge points at the right scenarios.

---

## 2. The ice-class allowance is not modelled

**What the Directive says.** Shipping companies may surrender **5% fewer
allowances** than their verified emissions for ships of ice class 1A or above
(Article 3gb, the winter-navigation provision).

**What the model does.** Nothing — there is no ice-class concept anywhere in
the vessel catalogue or the scenario schema. Verified across
`packages/corridor-schema/src` and the reference bundles: no `iceClass` field
exists.

**Magnitude.** A flat 5% reduction of the ETS line for a qualifying vessel.
Measured on the Skagerrak box (2 × 1,800 TEU feeder, 2029–2043, EUA €100):

| | ETS PV | 5% relief |
|---|---|---|
| fossil side | $16.692m | $0.835m |
| green side | $0.910m | $0.046m |
| **net effect on the gap** | | **−$0.789m** |

Note the relief applies to **both** sides — a qualifying green vessel gets it
too — so the effect on the corridor gap is the *difference*, not the fossil
figure alone. A naive implementation that relieved only the fossil side would
overstate the benefit by about 6%.

**Decision: document, do not model — but flag it as directly relevant.**

This is a one-multiplier change and genuinely easy. It is left out because
adding it *correctly* means adding an ice-class attribute to the vessel
catalogue and deciding, per vessel row, which hulls qualify — that is
catalogue research, not a code change, and the brief's own rule against
inventing sourced data applies.

**It is not hypothetical for this tool.** The Skagerrak reference vessels are
ice class 1A, and Baltic corridors are exactly where this model gets used. A
user modelling a Baltic route today over-states their ETS cost by 5% and has
no way to know it. If one of these two simplifications is worth closing first,
it is this one — the input is a boolean per vessel and the effect is exact,
whereas the berth split needs a judgement call about port geography.

---

## What is NOT a simplification

Recorded because each looks like an omission and is not:

- **Blue, grey and e-ammonia carry identical ETS charges.** ETS is
  tank-to-wake and all three are carbon-free at the stack. Their upstream
  differences appear in FuelEU, the IMO GFI and the abatement figure. This is
  counterintuitive and correct.
- **ETS ignores the emissions-basis flag.** It is a tank-to-wake instrument by
  construction. The self-designed scheme follows the flag; ETS must not.
- **A certified RFNBO still pays.** Zero-rating covers the fuel's own captured
  carbon, not its fossil pilot — e-methanol is chargeable for 0.0800 tCO2/t,
  not zero.
- **A zero-rated fuel still pays for CH4 and N2O.** Those are charged on
  warming effect from 2026 regardless of carbon origin. Bio-LNG's methane slip
  is the case that matters.
