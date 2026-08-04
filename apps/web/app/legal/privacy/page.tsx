import type { Metadata } from "next";
import Link from "next/link";
import { CONTROLLER, LAST_UPDATED, Todo } from "../controller";

export const metadata: Metadata = { title: "Privacy policy — Thaduberg" };

/**
 * GDPR Art. 13 notice. Every factual claim here is checked against the code:
 *   - collected fields → `components/landing/LandingClient.tsx` (signUp)
 *   - profile columns  → `supabase/migrations/20260803000001_profiles.sql`
 *   - scenario columns → `supabase/migrations/20260722000002_scenarios.sql`
 *   - erasure cascade  → `owner ... on delete cascade` in both migrations,
 *                        exercised by `npm run auth:smoke`
 *   - third parties    → `components/hexplorer/HexplorerMap.tsx`,
 *                        `components/calculator/MiniMap.tsx`,
 *                        `components/hexplorer/SearchBox.tsx`
 * If any of those change, this page is part of the change.
 */

function H2({ children }: { children: React.ReactNode }) {
  return <h2 className="mt-8 mb-2 text-base font-semibold text-neutral-900">{children}</h2>;
}

const Mail = () => (
  <a
    href={`mailto:${CONTROLLER.contactEmail}`}
    className="underline underline-offset-2 hover:text-brand"
  >
    <Todo>{CONTROLLER.contactEmail}</Todo>
  </a>
);

const BASES: [string, string][] = [
  [
    "Create and run your account, give you access to the platform, and keep you signed in",
    "Art. 6(1)(b) — performing our contract with you",
  ],
  ["Store and retrieve the scenarios you save, and make shared links work", "Art. 6(1)(b)"],
  [
    "Send you account emails (confirming your address, resetting your password)",
    "Art. 6(1)(b)",
  ],
  [
    "Keep the service secure, prevent abuse, and investigate faults",
    "Art. 6(1)(f) — our legitimate interest in a secure, working service, weighed against your interest in not being over-monitored. We keep no analytics and no record of your behaviour on the site.",
  ],
  [
    "Administer time-limited trial and teaching accounts, including expiring them",
    "Art. 6(1)(b), and Art. 6(1)(f) for managing access we granted",
  ],
  [
    "Meet our legal obligations, such as answering your data-protection requests",
    "Art. 6(1)(c)",
  ],
];

export default function PrivacyPage() {
  return (
    <article>
      <h1 className="text-2xl font-semibold tracking-tight">Privacy policy</h1>
      <p className="mt-1 text-xs text-neutral-600">Last updated {LAST_UPDATED}</p>

      <p className="mt-6">
        This policy explains what personal data we collect when you use the Thaduberg
        platform, why we hold it, and what you can require us to do with it. What we
        store in your browser is listed separately in our{" "}
        <Link href="/legal/cookies" className="underline underline-offset-2 hover:text-brand">
          cookie and local-storage notice
        </Link>
        .
      </p>

      <H2>1. Who we are</H2>
      <p>
        The controller responsible for your personal data is{" "}
        <Todo>{CONTROLLER.legalName}</Todo>, <Todo>{CONTROLLER.address}</Todo>{" "}
        (registration <Todo>{CONTROLLER.registrationNumber}</Todo>). You can reach us at{" "}
        <Mail />. Full company registration details will be published on our imprint
        page.
      </p>

      <H2>2. What this policy covers</H2>
      <p>
        The platform at this domain: the landing and sign-up pages, the corridor
        workspace, the map explorer and calculator, the documentation, and anonymous
        shared-scenario links.
      </p>

      <H2>3. What we collect, and where it comes from</H2>
      <ul className="list-disc space-y-2 pl-5 text-neutral-700">
        <li>
          <strong>You give us, when you request access:</strong> your full name, your
          organisation, your email address and a password. The password is stored only
          as a salted hash by our authentication provider — we never see it.
        </li>
        <li>
          <strong>We create about your account:</strong> the account type (full, trial
          or teaching), any access expiry date, whether you are an administrator, and
          timestamps for when the record was created and changed. Account type and
          expiry are <strong>set by us, not by you</strong>.
        </li>
        <li>
          <strong>Your use creates:</strong> the scenarios you save — the name you give
          them, the modelling inputs, the computed results, and hashes identifying which
          source data was used. These are engineering parameters, but the site
          coordinates you enter may reveal a commercially sensitive location, so we
          treat them as confidential.
        </li>
        <li>
          <strong>Our authentication provider records automatically:</strong> when you
          last signed in, plus standard server and security logs which include your IP
          address.
        </li>
        <li>
          <strong>If you create a shared link:</strong> an unguessable token that lets
          anyone holding the link read that one scenario, until you revoke it.
        </li>
      </ul>

      <H2>4. Why we use it, and on what legal basis</H2>
      <div className="my-4 overflow-x-auto">
        <table className="w-full border border-neutral-300 text-[13px]">
          <caption className="sr-only">
            Purposes for processing personal data and the legal basis for each
          </caption>
          <thead>
            <tr className="border-b border-neutral-300 bg-neutral-50 text-left text-[11px] uppercase tracking-wider text-neutral-600">
              <th scope="col" className="px-3 py-2 font-medium">
                Purpose
              </th>
              <th scope="col" className="px-3 py-2 font-medium">
                Legal basis
              </th>
            </tr>
          </thead>
          <tbody>
            {BASES.map(([purpose, basis]) => (
              <tr key={purpose} className="border-b border-neutral-200 align-top last:border-0">
                <td className="px-3 py-2 text-neutral-700">{purpose}</td>
                <td className="px-3 py-2 text-neutral-700">{basis}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      <p>
        We rely on no consent-based processing. We do not profile you, we do not
        advertise to you, we do not sell or rent your data, and we make no automated
        decisions that produce legal or similarly significant effects (Art. 22).
      </p>

      <H2>5. Who else sees it</H2>
      <h3 className="mt-4 mb-1 font-medium text-neutral-900">
        5a. Processors — parties that hold data for us
      </h3>
      <ul className="list-disc space-y-2 pl-5 text-neutral-700">
        <li>
          <strong>Supabase</strong> — our database, authentication and account email
          delivery, acting as our processor under a data processing agreement. Holds
          your account record, your saved scenarios, and authentication logs including
          IP addresses.
        </li>
        <li>
          <strong><Todo>{CONTROLLER.hostingProvider}</Todo></strong> — serves the pages
          and keeps standard request logs.
        </li>
      </ul>

      <h3 className="mt-4 mb-1 font-medium text-neutral-900">
        5b. Third parties your browser contacts directly
      </h3>
      <p>
        Some parts of the platform load content straight from other
        organisations&rsquo; servers. When that happens your browser talks to them
        directly, and they necessarily see your IP address, your browser type and the
        specific thing you requested. We do not control their systems and they are not
        acting for us. None of them sets a cookie through this site.
      </p>
      <ul className="mt-3 list-disc space-y-2 pl-5 text-neutral-700">
        <li>
          <strong>CARTO</strong> — map background tiles, loaded on any page showing a
          map, including the small map in the calculator.
        </li>
        <li>
          <strong>Esri</strong> — the satellite and terrain backgrounds, loaded only if
          you switch to one of them.
        </li>
        <li>
          <strong>OpenStreetMap Foundation</strong> — place-name search.{" "}
          <strong>What you type into the map search box is sent to them.</strong>
        </li>
      </ul>
      <p className="mt-3">
        We send a restricted referrer policy, so these requests reveal only that they
        came from this site — never which scenario, page or shared link you were
        viewing. Details are in our{" "}
        <Link href="/legal/cookies" className="underline underline-offset-2 hover:text-brand">
          cookie notice
        </Link>
        .
      </p>

      <H2>6. Where your data goes</H2>
      <p>
        Our database and authentication run in the{" "}
        <Todo>{CONTROLLER.supabaseRegion}</Todo> region. Supabase is a US company whose
        staff may access data when providing support; those transfers rely on the
        Standard Contractual Clauses and the safeguards in its data processing
        agreement. The third parties in section 5b receive only the connection details
        described there: CARTO is established in the EU but serves from a global
        network, Esri is a US company, and the OpenStreetMap Foundation is in the UK,
        which the European Commission has found to provide adequate protection.
      </p>

      <H2>7. How long we keep it</H2>
      <ul className="list-disc space-y-2 pl-5 text-neutral-700">
        <li>
          <strong>Your account and profile:</strong> for as long as you have an account.
        </li>
        <li>
          <strong>Your saved scenarios:</strong> until you delete them, or until the
          account is deleted — deleting an account removes every scenario saved under
          it.
        </li>
        <li>
          <strong>Expired trial and teaching accounts:</strong> when one reaches its
          expiry date, access stops but nothing is deleted, so that extending it
          restores your work exactly as it was. If you would rather we deleted an
          expired account and its scenarios instead of keeping them, ask us and we will.
        </li>
        <li>
          <strong>Shared links:</strong> until you revoke the link or delete the
          scenario.
        </li>
        <li>
          <strong>Authentication and server logs:</strong> kept by our providers for a
          short period for security and troubleshooting, under their own retention
          schedules.
        </li>
      </ul>

      <H2>8. Your rights</H2>
      <p>You can require us to:</p>
      <ul className="mt-2 list-disc space-y-1 pl-5 text-neutral-700">
        <li>
          <strong>give you a copy</strong> of the personal data we hold about you
          (access);
        </li>
        <li>
          <strong>correct</strong> anything inaccurate or incomplete (rectification);
        </li>
        <li>
          <strong>delete</strong> your data (erasure);
        </li>
        <li>
          <strong>pause</strong> our use of it while a dispute is resolved
          (restriction);
        </li>
        <li>
          <strong>hand it over</strong> in a machine-readable form (portability);
        </li>
        <li>
          <strong>object</strong> to processing we base on our legitimate interests.
        </li>
      </ul>
      <p className="mt-3">
        Where processing is based on consent you may withdraw it at any time — though as
        section 4 says, we currently rely on no consent, so there is nothing to
        withdraw.
      </p>
      <p className="mt-3">
        <strong>To exercise any of these, email <Mail />.</strong> We answer within one
        month, and it is free. In practice:
      </p>
      <ul className="mt-2 list-disc space-y-1 pl-5 text-neutral-700">
        <li>
          <strong>Access and portability</strong> — we send you your account record and
          scenarios; you can also export any scenario from the app yourself at any time.
        </li>
        <li>
          <strong>Correction</strong> — email us to change your name or organisation.
          There is no self-service edit for these, by design, so a person handles it.
        </li>
        <li>
          <strong>Erasure</strong> — we delete the account. That removes your account
          record and every scenario saved under it, and it cannot be undone.
        </li>
      </ul>

      <H2>9. Complaining to a regulator</H2>
      <p>
        If you think we have handled your data wrongly, please tell us first so we can
        put it right. You can also complain to{" "}
        <a
          href={CONTROLLER.supervisoryAuthorityUrl}
          className="underline underline-offset-2 hover:text-brand"
        >
          <Todo>{CONTROLLER.supervisoryAuthority}</Todo>
        </a>
        , or to the supervisory authority in the country where you live or work.
      </p>

      <H2>10. Whether you have to give us this data</H2>
      <p>
        Providing your name, organisation and email is a contractual requirement:
        without them we cannot create an account for you. No law obliges you to give us
        anything, and there is no consequence to declining other than being unable to
        use the platform.
      </p>

      <H2>11. Children</H2>
      <p>
        The platform is built for professional and academic use and is not directed at
        children under 16.
      </p>

      <H2>12. Changes to this policy</H2>
      <p>
        If we change it we will update this page and the date at the top. If a change
        materially affects you, we will email account holders rather than rely on you
        noticing.
      </p>

      <H2>13. Contact</H2>
      <p>
        Questions about this policy or about your data: <Mail />.
      </p>
    </article>
  );
}
