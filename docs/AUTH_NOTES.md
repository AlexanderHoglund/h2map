# Auth notes

## Stale refresh tokens (2026-08-04)

`AuthApiError: Invalid Refresh Token: Refresh Token Not Found` recurred on
every navigation. Cause: `supabase.auth.getClaims()` **returns** `{data: null,
error}` for a dead refresh token rather than throwing, and `@supabase/ssr`
does not clear the cookie that carried it. Every server call site destructured
only `data`, so the invalid token was re-sent forever. Sources of a dead
token: a user deleted server-side (the e2e teardown does this) while their
browser cookie lives on, a revoked session, or an already-rotated token.

Fix: `apps/web/proxy.ts` — the one place that can write cookies on any
navigation — detects the condition (`isStaleRefreshToken`) and deletes the
`sb-*-auth-token(.N)?` cookies, then treats the visitor as anonymous
(redirecting gated paths to the landing with a return-to). It deliberately
matches only refresh-token failures, NOT transient network/5xx errors, where
dropping a good session would be wrong.

Note on the log line: the error object is still *printed once* by Next's dev
error formatter (`next/dist/esm/server/patch-error-inspect.js`) on the request
that clears the cookie — it decorates AuthError objects even when they are
handled. That single line is expected and does not repeat, because the cookie
is gone. Adding `.catch()` at the call sites does NOT silence it (verified)
and would swallow real errors, so the call sites are left alone.

Regression cover: `e2e/stale-session.anon.spec.ts` plants a cookie with an
invalid refresh token and asserts (a) it is cleared and (b) later navigations
render the signed-out landing with no auth cookie remaining.
