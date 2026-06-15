import React from 'react'
import LegalLayout from './LegalLayout'
import { SITE_URL } from '../../seo/config'

const CONTACT = 'joelbenitezdonari@gmail.com'
const DOMAIN  = SITE_URL
const LAST_UPDATED = '2026-06-15'

// ── Prose helpers ─────────────────────────────────────────────────────────────

function H2({ children }: { children: React.ReactNode }) {
  return (
    <h2
      className="text-[17px] font-semibold tracking-tight mt-10 mb-3"
      style={{ color: 'var(--text)' }}
    >
      {children}
    </h2>
  )
}

function P({ children }: { children: React.ReactNode }) {
  return (
    <p className="text-[13.5px] leading-relaxed mb-4" style={{ color: 'var(--text-dim)' }}>
      {children}
    </p>
  )
}

function UL({ children }: { children: React.ReactNode }) {
  return (
    <ul className="list-disc pl-5 mb-4 space-y-1 text-[13.5px] leading-relaxed" style={{ color: 'var(--text-dim)' }}>
      {children}
    </ul>
  )
}

function TableRow({ data, purpose, basis }: { data: string; purpose: string; basis: string }) {
  return (
    <tr className="border-b border-[var(--border)]">
      <td className="py-2.5 pr-4 align-top text-[12.5px] font-medium" style={{ color: 'var(--text)' }}>{data}</td>
      <td className="py-2.5 pr-4 align-top text-[12.5px]" style={{ color: 'var(--text-dim)' }}>{purpose}</td>
      <td className="py-2.5 align-top text-[12.5px]" style={{ color: 'var(--text-dim)' }}>{basis}</td>
    </tr>
  )
}

// ── Component ─────────────────────────────────────────────────────────────────

interface Props {
  onNavigateToLanding: () => void
}

export default function PrivacyPolicy({ onNavigateToLanding }: Props) {
  return (
    <LegalLayout
      pageTitle="Privacy Policy"
      lastUpdated={LAST_UPDATED}
      onNavigateToLanding={onNavigateToLanding}
    >
      {/* The short version */}
      <div
        className="rounded-xl border px-5 py-4 mb-8 text-[13px]"
        style={{ borderColor: 'var(--accent)33', background: 'var(--accent)08', color: 'var(--text-dim)' }}
      >
        <p className="font-semibold mb-1" style={{ color: 'var(--text)' }}>The short version</p>
        <p>
          Your IFC files are processed entirely inside your browser. They are never uploaded to,
          stored on, or transmitted to any server we control. We cannot see your models.
        </p>
      </div>

      <P>
        This Privacy Policy explains how <strong>IFC Viewer Online</strong> ("we", "us") handles your
        information when you use{' '}
        <a href={DOMAIN} className="underline underline-offset-2" style={{ color: 'var(--accent)' }}>
          {DOMAIN}
        </a>{' '}
        (the "Service"). We are the data controller.
        Contact:{' '}
        <a href={`mailto:${CONTACT}`} className="underline underline-offset-2" style={{ color: 'var(--accent)' }}>
          {CONTACT}
        </a>.
      </P>

      {/* What we process locally */}
      <H2>What we process locally (never sent anywhere)</H2>
      <P>
        When you open an IFC file, all parsing, 3D rendering, and validation happen on your device
        using WebAssembly. The file content never leaves your browser. We have no access to it and
        never receive it.
      </P>

      {/* What we collect */}
      <H2>What we collect, why, and our legal basis</H2>

      <div className="overflow-x-auto mb-6">
        <table className="w-full text-left border-collapse">
          <thead>
            <tr className="border-b border-[var(--border)]">
              <th className="pb-2 pr-4 text-[11px] uppercase tracking-wide font-semibold" style={{ color: 'var(--text-faint)' }}>Data</th>
              <th className="pb-2 pr-4 text-[11px] uppercase tracking-wide font-semibold" style={{ color: 'var(--text-faint)' }}>Purpose</th>
              <th className="pb-2 text-[11px] uppercase tracking-wide font-semibold" style={{ color: 'var(--text-faint)' }}>Legal basis (GDPR Art. 6)</th>
            </tr>
          </thead>
          <tbody>
            <TableRow
              data="Anonymous usage events (e.g. 'file opened', 'validation run', 'report shared') via PostHog"
              purpose="Understand and improve how the Service is used"
              basis="Legitimate interest (Art. 6(1)(f)) — aggregate, cookieless analytics; no persistent identifier stored"
            />
            <TableRow
              data="Your email address, only if you submit it"
              purpose="Send product updates you asked for"
              basis="Consent (Art. 6(1)(a)) — withdrawable anytime"
            />
            <TableRow
              data="UI preferences (language, layout) in your browser's localStorage"
              purpose="Remember your settings across sessions"
              basis="Strictly necessary / legitimate interest"
            />
            <TableRow
              data="Invitation / referral tag from a link (e.g. ?ref=… or /i/…)"
              purpose="See which outreach or article a visit came from, to improve it"
              basis="Legitimate interest (Art. 6(1)(f)) — a non-personal campaign label, session-only, no cookie"
            />
          </tbody>
        </table>
      </div>

      <P>
        We do <strong>not</strong> record the contents of your models, we do <strong>not</strong> use
        session replay, and we do <strong>not</strong> use advertising or cross-site tracking.
        PostHog analytics runs in <em>memory-only mode</em>: no cookies and no persistent identifier
        is written to your device.
      </P>

      {/* Invitation / referral links */}
      <H2>Invitation and referral links</H2>
      <P>
        Some links we share personally (for example in a message or an article) include a short
        campaign tag, such as <code>?ref=…</code> or a <code>/i/…</code> path. This tag is a
        non-personal label that tells us which outreach or article a visit came from — it does{' '}
        <strong>not</strong> identify you and contains no personal data. When the page loads we store
        it only for the current browser session (in <em>sessionStorage</em>, not a cookie), remove it
        from the address bar, and attach it to the same anonymous analytics described above so we can
        tell which channels are useful. It is cleared when you close the tab.
      </P>

      {/* Shared reports */}
      <H2>Shared reports (opt-in only)</H2>
      <P>
        If you explicitly choose to share a validation report, the issue summary is encoded into a
        shareable link and rendered by a Cloudflare Worker so it can be viewed and indexed by search
        engines. This does <strong>not</strong> include your model geometry — only the list of
        validation issues you chose to share. Shared links automatically expire after 90 days.
      </P>

      {/* Processors */}
      <H2>Who we share data with (processors)</H2>
      <P>
        We use a small set of service providers ("processors") who act on our behalf:
      </P>
      <UL>
        <li>
          <strong>PostHog</strong> — product analytics. Hosted in the United States.
          See{' '}
          <a href="https://posthog.com/privacy" target="_blank" rel="noopener noreferrer"
             className="underline underline-offset-2" style={{ color: 'var(--accent)' }}>
            PostHog Privacy Policy
          </a>.
        </li>
        <li>
          <strong>Resend</strong> — sending the email updates you subscribed to.
        </li>
        <li>
          <strong>Cloudflare</strong> — running the shared-report function and basic abuse
          protection (rate limiting by IP). Cloudflare processes request metadata (including IP
          addresses) as part of its infrastructure; see{' '}
          <a href="https://www.cloudflare.com/privacypolicy/" target="_blank" rel="noopener noreferrer"
             className="underline underline-offset-2" style={{ color: 'var(--accent)' }}>
            Cloudflare's Privacy Policy
          </a>.
        </li>
        <li>
          <strong>Vercel</strong> — hosting the static site and serving its pages. Vercel
          processes basic request metadata (such as IP addresses) as part of its content-delivery
          infrastructure; it never receives your IFC model data. See{' '}
          <a href="https://vercel.com/legal/privacy-policy" target="_blank" rel="noopener noreferrer"
             className="underline underline-offset-2" style={{ color: 'var(--accent)' }}>
            Vercel's Privacy Policy
          </a>.
        </li>
      </UL>
      <P>We never sell your data or share it with advertisers.</P>

      {/* International transfers */}
      <H2>International data transfers</H2>
      <P>
        Some processors (PostHog, Cloudflare, Vercel) process data in the United States, outside the
        EEA. Where that applies, transfers rely on appropriate safeguards such as Standard
        Contractual Clauses (SCCs) under GDPR Chapter V.
      </P>

      {/* Retention */}
      <H2>How long we keep it</H2>
      <UL>
        <li>Analytics events: retained by PostHog per their default retention policy, then deleted or aggregated.</li>
        <li>Email: until you unsubscribe or ask us to delete it.</li>
        <li>Shared-report links: expire after 90 days (the link stops resolving; no data is stored on our servers).</li>
        <li>Local preferences: live in your browser's localStorage until you clear them; we never see them.</li>
      </UL>

      {/* Your rights */}
      <H2>Your rights (EEA / UK)</H2>
      <P>
        If you are in the EEA or UK you have the right to access, rectify, erase, restrict, port, and
        object to processing of your personal data, and to withdraw consent at any time. To exercise
        any right, email{' '}
        <a href={`mailto:${CONTACT}`} className="underline underline-offset-2" style={{ color: 'var(--accent)' }}>
          {CONTACT}
        </a>.
      </P>
      <P>
        You also have the right to lodge a complaint with your local data protection authority. In
        Spain: <strong>Agencia Española de Protección de Datos (AEPD)</strong> —{' '}
        <a href="https://www.aepd.es" target="_blank" rel="noopener noreferrer"
           className="underline underline-offset-2" style={{ color: 'var(--accent)' }}>
          aepd.es
        </a>.
      </P>
      <P>
        Because we never receive your IFC files, there is nothing to access or delete on our side
        regarding your models.
      </P>

      {/* Children */}
      <H2>Children</H2>
      <P>
        The Service is not directed to children under 16 and we do not knowingly collect their data.
      </P>

      {/* Changes */}
      <H2>Changes to this policy</H2>
      <P>
        We may update this policy; the "Last updated" date at the top reflects the latest version.
        Material changes will be highlighted on this page.
      </P>

      {/* Contact */}
      <H2>Contact</H2>
      <P>
        Questions or requests:{' '}
        <a href={`mailto:${CONTACT}`} className="underline underline-offset-2" style={{ color: 'var(--accent)' }}>
          {CONTACT}
        </a>
      </P>
    </LegalLayout>
  )
}
