import type { Metadata } from "next";
import Link from "next/link";
import { LAST_UPDATED } from "../controller";

export const metadata: Metadata = { title: "Cookies & local storage — Thaduberg" };

/**
 * The device-storage inventory. Every entry here was verified against the
 * source, not assumed:
 *   - auth cookies: `lib/supabase/browser.ts` (cookie-backed, NOT localStorage)
 *     and the deletion regex in `proxy.ts` which documents the chunk naming;
 *   - `corridor-draft-v2`: key at `components/corridor/state.ts:194`, written
 *     at `state.ts:439` and `app/corridor/s/[token]/SharedViewer.tsx:120`,
 *     removed at `state.ts:428` and `:456`.
 *
 * If you add ANY new cookie or storage key, it must appear in a table below —
 * `e2e/legal.anon.spec.ts` asserts the known keys are listed.
 */

/** Shared table shell: scoped headers + a caption, which the docs pattern omits. */
function Table({
  caption,
  columns,
  rows,
}: {
  caption: string;
  columns: string[];
  rows: React.ReactNode[][];
}) {
  return (
    <div className="my-4 overflow-x-auto">
      <table className="w-full border border-neutral-300 text-[13px]">
        <caption className="sr-only">{caption}</caption>
        <thead>
          <tr className="border-b border-neutral-300 bg-neutral-50 text-left text-[11px] uppercase tracking-wider text-neutral-600">
            {columns.map((c) => (
              <th key={c} scope="col" className="px-3 py-2 font-medium">
                {c}
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {rows.map((cells, i) => (
            <tr key={i} className="border-b border-neutral-200 align-top last:border-0">
              {cells.map((cell, j) => (
                <td key={j} className="px-3 py-2 text-neutral-700">
                  {cell}
                </td>
              ))}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

function H2({ children }: { children: React.ReactNode }) {
  return <h2 className="mt-8 mb-2 text-base font-semibold text-neutral-900">{children}</h2>;
}

const Code = ({ children }: { children: React.ReactNode }) => (
  <code className="font-mono text-xs text-neutral-800">{children}</code>
);

export default function CookiesPage() {
  return (
    <article>
      <h1 className="text-2xl font-semibold tracking-tight">Cookies &amp; local storage</h1>
      <p className="mt-1 text-xs text-neutral-600">Last updated {LAST_UPDATED}</p>

      <p className="mt-6">
        This page lists everything this site stores on your device, what each item is
        for, and how long it stays. It is the companion to our{" "}
        <Link href="/legal/privacy" className="underline underline-offset-2 hover:text-brand">
          privacy policy
        </Link>
        , which covers the personal data we hold on our own systems.
      </p>

      <H2>Why you are not seeing a cookie banner</H2>
      <p>
        Because everything we store on your device is strictly necessary to run the
        service you asked for, we do not need — and therefore do not show — a cookie
        consent banner. We set no analytics, advertising or tracking cookies, and no
        third party sets a cookie through this site. The tables below are the whole
        inventory; if that ever changes, this page changes with it.
      </p>

      <H2>Cookies we set</H2>
      <p>
        All of these are first-party (set by this site, readable only by it) and all
        relate to signing you in. <Code>&lt;project-ref&gt;</Code> is the identifier of
        our authentication project.
      </p>
      <Table
        caption="Cookies set by this site, with purpose, duration and legal basis"
        columns={["Name", "Purpose", "How long it stays", "Basis"]}
        rows={[
          [
            <>
              <Code>sb-&lt;project-ref&gt;-auth-token</Code>
              <span className="block text-neutral-600">
                plus numbered <Code>.0</Code> / <Code>.1</Code> parts
              </span>
            </>,
            <>
              Keeps you signed in. Holds your session: a short-lived access token and a
              refresh token. Browsers cap the size of a single cookie, so when the
              session exceeds it the value is split across numbered parts.
            </>,
            <>
              Persistent. The access token inside is short-lived — on the order of an
              hour — and is exchanged automatically for a new one; the refresh token
              rotates each time. The cookie survives restarts until you sign out, until
              the session is revoked, or until the refresh token lapses from disuse.
              Signing out deletes it immediately.
            </>,
            <>
              Not consent. Strictly necessary to provide a service you explicitly asked
              for (ePrivacy Art. 5(3) exemption); the underlying processing is Art.
              6(1)(b) GDPR — performing our contract with you.
            </>,
          ],
          [
            <Code key="pkce">sb-&lt;project-ref&gt;-auth-token-code-verifier</Code>,
            <>
              A one-time secret that ties a sign-in, email-confirmation or
              password-reset link back to the browser that started the request, so
              nobody else&rsquo;s browser can redeem your link.
            </>,
            <>
              Very short-lived: written when the flow starts and deleted the moment the
              link is redeemed. Minutes at most.
            </>,
            <>
              Strictly necessary (same exemption); Art. 6(1)(b), and Art. 6(1)(f) for
              the security purpose.
            </>,
          ],
        ]}
      />
      <p className="text-neutral-700">
        Exact lifetimes are set by our authentication provider&rsquo;s configuration and
        may change; the mechanism described here does not.
      </p>

      <H2>Other storage in your browser</H2>
      <p>
        The law that covers cookies covers any storage on your device, so we list this
        too.
      </p>
      <Table
        caption="Browser local storage used by this site"
        columns={["Key", "Purpose", "How long it stays", "Basis"]}
        rows={[
          [
            <>
              <Code>corridor-draft-v2</Code>
              <span className="block text-neutral-600">local storage</span>
            </>,
            <>
              Keeps your unsaved corridor scenario so a refresh or an accidentally
              closed tab does not lose your work. It holds the modelling parameters you
              entered, including the coordinates of a production site you picked. It
              contains no name, email, account ID or device identifier, and a draft is
              never sent to us.
            </>,
            <>
              Until you clear it. Written about half a second after you stop typing, and
              removed when you reset the scenario or use your browser&rsquo;s
              &ldquo;clear site data&rdquo;. It is not tied to your account and does not
              follow you to another device.
            </>,
            <>
              Strictly necessary for the feature you were using; Art. 6(1)(b) / (f). It
              holds no identifiers, so it cannot build a profile of you.
            </>,
          ],
        ]}
      />

      <H2>What we do not use</H2>
      <ul className="list-disc space-y-1 pl-5 text-neutral-700">
        <li>No analytics or measurement of any kind — no Google Analytics, Tag Manager, Plausible or Vercel Analytics.</li>
        <li>No error-tracking or session-replay tools.</li>
        <li>No advertising or social-media pixels.</li>
        <li>No embedded third-party iframes.</li>
        <li>No service worker, no IndexedDB, no session storage.</li>
        <li>
          Fonts are served from our own servers, so opening a page makes no request to
          Google.
        </li>
      </ul>

      <H2>Third parties your browser contacts</H2>
      <p>
        Some parts of the platform load content straight from other
        organisations&rsquo; servers. When that happens your browser talks to them
        directly, and they necessarily see your IP address, your browser type, and the
        specific thing you requested. We do not control their systems and they are not
        acting on our behalf. <strong>None of them sets a cookie through this site.</strong>
      </p>
      <ul className="mt-3 list-disc space-y-2 pl-5 text-neutral-700">
        <li>
          <strong>CARTO</strong> — the map background. Loaded on any page showing a map,
          including the small map in the calculator, so this happens as soon as a map
          appears rather than in response to anything you do.
        </li>
        <li>
          <strong>Esri</strong> — the satellite and terrain map backgrounds. Loaded only
          if you switch to one of those.
        </li>
        <li>
          <strong>OpenStreetMap Foundation</strong> — place-name search.{" "}
          <strong>What you type into the map search box is sent to them.</strong> This
          happens only when you use that box.
        </li>
      </ul>
      <p className="mt-3">
        We send a restricted referrer policy, so these requests reveal only that they
        came from this site — never which scenario, page or shared link you were
        looking at.
      </p>

      <H2>Controlling what is stored</H2>
      <p>
        Your browser can block or delete cookies and local storage for this site at any
        time, and every browser offers this in its privacy settings. Because the items
        above are the ones that keep you signed in and protect your unsaved work,
        blocking them will sign you out and may lose a draft — but nothing else on the
        site depends on them.
      </p>
    </article>
  );
}
