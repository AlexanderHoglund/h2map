# Frontend notes

Conventions for the app UI (`apps/web`). Engine/method notes live in
`ENGINE_NOTES.md`; this file is presentation-layer guidance.

## Charts: separate the outlier, never compress the rest

> A chart whose value range is set by a single outlying point must separate
> that point out — by cost nature, by series, or by axis — rather than
> compressing every other point into illegibility. If one value exceeds the
> median of the series by more than 5×, the default rendering is wrong.

Rationale: the corridor charges all capital in year 1 undiscounted, so a
per-year "total cost" series has a year-1 spike ~12× the recurring years. A
single line/axis scaled to that spike flattens fourteen years of operating
cost into an unreadable band at the floor — numerically correct, visually
useless. The fix is always to _decompose_, not to rescale a summed series:

- **By cost nature** — stack CAPEX / operating / regulation so the tall bar
  reads as _one component_ (capital), and the recurring components stay
  legible (see the annual-cost chart in `ResultsPanel.tsx`).
- **By series** — plot the interesting quantity (e.g. the annual _increment_
  of the cumulative gap, which decays with discounting) as bars and keep the
  running total as a line on a **secondary axis**.
- **By axis** — start a secondary/context axis at a rounded value below the
  first point when that point already sits high (> 20% of the max), and
  **label the break** so the reader knows it is not zero-based.

Hard nos for money in a non-technical panel: **no log axis** (misrepresents
magnitude), **no broken axis on the primary series** (hides the very fact
that matters). Always state the unit (`USD m`) and reserve right-edge axis
margin so the final year label is not clipped.

### The dev-mode guard

`warnIfDominated(label, series, { separated })` in `ResultsPanel.tsx` warns
in development when a series' max exceeds 5× its median and the chart is not
using a separated rendering. Call it with `separated: true` from any chart
that already decomposes the outlier; pass the raw summed series so the check
is meaningful. It is a no-op in production. If you see the warning, the
default rendering is wrong — decompose per the rule above.
