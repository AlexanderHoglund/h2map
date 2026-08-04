# Legal Notes

Why the site's privacy and cookie notices say what they say, and the decisions
behind them. Auth mechanics live in `AUTH_NOTES.md`; this file is the
compliance-facing reasoning.

## Nothing non-essential is stored, so the site ships no consent banner

Consent under ePrivacy Art. 5(3) is triggered by *storing or reading*
non-essential information on the visitor's device. An audit of every storage
call site found only three things, all exempt:

| What | Where | Why exempt |
|---|---|---|
| `sb-<ref>-auth-token` (+ `.0`/`.1` chunks) | `@supabase/ssr`, first-party | Strictly necessary — it is the login session |
| `sb-<ref>-auth-token-code-verifier` | PKCE, minutes-lived | Strictly necessary — ties an auth link to the browser that requested it |
| `corridor-draft-v2` | `components/corridor/state.ts:194` | Functional autosave of the user's own work; no identifiers, never transmitted |

Verified absent: analytics of any kind, Sentry, GA/GTM, ad pixels, iframes,
service worker, IndexedDB, `sessionStorage`. `next/font/google` self-hosts the
font files at build time, so no visitor IP reaches Google — the exact failure
the LG München Google Fonts judgment (3 O 17493/20) turned on.

Note the Supabase browser client is **cookie**-backed, not localStorage
(`lib/supabase/browser.ts` passes no options, so `@supabase/ssr` supplies a
cookie storage adapter and auth-js never falls through to `localStorage`).

**Rejected alternative: a consent management platform.** A banner asking
permission for storage that is legally exempt is not a neutral "safe" choice —
it trains users to dismiss dialogs, implies we do something we do not, and
invites someone to later attach real tracking to the machinery. If a
non-essential cookie is ever added, that decision reopens this one.

## The real exposure was outbound requests, not storage

Three third-party hosts receive visitor IP addresses directly from the browser:

| Host | Receives | When | Source |
|---|---|---|---|
| `basemaps.cartocdn.com` | IP, User-Agent | **Every map view, before any user action** | `HexplorerMap.tsx:30-31`, `MiniMap.tsx:7` |
| `server.arcgisonline.com` | IP, User-Agent | On satellite/topographic basemap switch | `HexplorerMap.tsx:44,64` |
| `nominatim.openstreetmap.org` | IP **+ the user's typed search text** | On place search | `SearchBox.tsx:52-55` |

Checked by direct request: **none sets a cookie**, so none creates a consent
trigger. They are disclosed under Art. 13(1)(e) instead.

> **This is a point-in-time fact, not an enforced property.** A provider could
> start setting a cookie with no change on our side, silently falsifying the
> notice. Re-run the manual walkthrough below periodically.

## Map third parties are disclosed, not proxied

Decision: name them in the notices and restrict the referrer. Rejected
alternatives and why:

- **Proxy the tiles.** Would remove the exposure entirely, but CARTO's and
  Esri's keyless fair-use terms do not clearly permit re-serving, and it adds
  bandwidth plus a caching layer.
- **Consent-gate the map** ("click to load"). The strictest reading, and
  materially harmful to a map-first product.

**Residual risk, accepted knowingly:** CARTO loads unconditionally, so a
visitor's IP reaches it on ordinary use with no action by them — the one item
where the data subject has no choice. And Nominatim receives free text, which
can be more revealing than an IP ("Port of ___ hydrogen site"). **Proxying just
the geocoder is one route and remains the cheapest available risk reduction** if
this is revisited.

## `Referrer-Policy` is set in `next.config.ts` so a share token never leaks

Without it, a browser on `/corridor/s/<token>` fetching a map tile would send
the full URL in `Referer` — handing a working, capability-bearing share link to
a third party's access logs. The `?c=` scenario blob on the calculator has the
same exposure. Fixed with `strict-origin-when-cross-origin` over `source:
"/:path*"` in `next.config.ts`.

- **Not `proxy.ts`** — its matcher skips `/api` and any dotted path, so assets
  would go uncovered. `next.config.ts` `headers()` covers everything.
- **Not `<meta name="referrer">`** — parsed only once the HTML arrives, so early
  subresource requests can race it. A header applies from the first byte.
- **Rejected `strict-origin`** (also strips the path same-origin): the chosen
  value already sends origin-only cross-origin, which fully closes the leak, and
  is the value a reviewer expects to see.

Correction to an early assumption: the map camera state is a URL **fragment**
(`formatCameraHash`, `lib/url-state.ts:23`), and fragments are never sent in
`Referer`. The `?c=` query and the share-token path were the real exposure.

Regression cover: `e2e/legal.anon.spec.ts` asserts the header is served.

## Legal prose lives in JSX, not in `messages/en/common.json`

Only link labels and page titles go through next-intl (`footer.privacy`,
`footer.cookies`, `legal.*`). Body copy is JSX in the page files.

- Precedent is unanimous — `app/docs/page.tsx` (~2000 lines) and
  `app/about/data/page.tsx` already hold long-form prose in JSX; `common.json`
  holds labels and short notes.
- Legal text needs tables, `<code>`, `mailto:` and external links. In next-intl
  that means `t.rich()` per paragraph, which is unreviewable by the
  non-developer who has to check the wording.
- **Diffability is a compliance property**: you may need to show what the notice
  said on a given date. A JSX `<p>` diff is legible; a 900-character JSON string
  on one line is not.
- Notices get re-drafted per jurisdiction, not string-translated, so the future
  pattern is a locale-routed page, not `messages/de/privacy.json`.

## The legal pages must never redirect

Their audience is the logged-out visitor. Two ways that breaks:

1. missing the `/legal/` prefix in `proxy.ts` `isPublic()`;
2. copy-pasting a content page as a template and inheriting its
   `requireAccess()` call, which redirects independently of the proxy — the
   likelier mistake, since every other content page opens with it.

`app/legal/layout.tsx` carries a comment saying so. Regression cover:
`e2e/legal.anon.spec.ts` asserts neither page redirects to `/?next=`.

## Placeholders must be impossible to ship

Seven values in `app/legal/controller.tsx` still read `«TODO: …»`: legal name,
registered address, registration number, contact email, supervisory authority
(+ URL), Supabase project region, and hosting provider.

Three layers, so a miss is caught three ways: one grep-able constant; a `<Todo>`
component that renders unfilled values as orange boxes on the live page; and a
Playwright assertion that **fails** while any `TODO` survives. That test is
currently red on `/legal/privacy` **by design** — it is the deploy blocker, and
it goes green the moment the values are filled in.

Deliberately not `.env` variables: this is public, permanent,
legally-significant text that belongs in git history and in the diff record.

## Before publishing — checks no test can replace

1. Fill the seven placeholders; confirm the orange boxes are gone.
2. **Confirm the Supabase project region** in the dashboard and write the
   correct transfer statement. Not inferable from the repo.
3. Confirm the hosting provider for the processor list.
4. **Re-run the storage inventory by hand** in a clean browser profile: sign up,
   confirm, sign in, build and save a scenario, create a share link, open the
   explorer, switch to the Esri basemap, use the search box, sign out — checking
   DevTools → Application after each step. This is what catches a dependency
   quietly adding storage.
5. Watch the Network tab across the same walkthrough: the only external hosts
   may be CARTO (×2), Esri, Nominatim and Supabase. A fifth means the notice is
   wrong.
6. Load a real `/corridor/s/<token>` and confirm an outgoing tile request's
   `Referer` is the bare origin with no path.
7. **Decide the expired-account retention bound.** The policy says expired trial
   and teaching accounts keep their data so an extension restores it, and offers
   deletion on request. Only state an outer bound if you will enforce it — an
   unkept retention promise is worse than none.

## Imprint is deferred, not resolved

An EU-established commercial operator generally must publish provider
identification (§5 DDG and equivalents). The privacy policy names the controller
but does not satisfy the full duty. `/legal/imprint` needs **no** proxy or layout
change — the `/legal/` prefix rule and the shared layout already cover it, so it
costs one page plus a footer link.

## Known open items

- **A CSP** pinning `connect-src`/`img-src` to the four known hosts would make
  "these are the only third parties" *enforced* rather than asserted. Nothing in
  `next.config.ts` sets one today.
- **Rectification is manual by design.** `profiles` has no authenticated write
  policy, so users cannot edit their own name or organisation; the policy
  therefore promises a human route, which is a real commitment to service.
- **Terms of use** are not written. The "not investment advice" line currently
  lives only as a landing-page footnote.
