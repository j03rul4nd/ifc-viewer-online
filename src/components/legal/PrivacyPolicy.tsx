import React from 'react'
import LegalLayout from './LegalLayout'
import { SITE_URL } from '../../seo/config'
import { useConsentStore } from '../../stores/consentStore'

const CONTACT = 'privacy@ifcvieweronline.eu'
const DOMAIN  = SITE_URL
const LAST_UPDATED = '2026-10-10'

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

// ── Analytics opt-out control (GDPR Art. 21 — right to object) ─────────────────

function AnalyticsChoice() {
  const optedOut = useConsentStore((s) => s.analyticsOptedOut)
  const setOptOut = useConsentStore((s) => s.setAnalyticsOptOut)
  const enabled = !optedOut

  return (
    <div
      className="rounded-xl border px-5 py-4 mb-4 flex items-center justify-between gap-4"
      style={{ borderColor: 'var(--border)', background: 'var(--surface-2)' }}
    >
      <div>
        <p className="text-[13px] font-medium" style={{ color: 'var(--text)' }}>
          Anonymous analytics
        </p>
        <p className="text-[12.5px] leading-relaxed" style={{ color: 'var(--text-dim)' }}>
          {enabled
            ? 'Currently ON. We measure aggregate, cookieless usage to improve the tool. Turn it off to object at any time — the app works exactly the same.'
            : 'Currently OFF. No usage events are collected from this browser. We also honour your browser’s Global Privacy Control / Do Not Track signal.'}
        </p>
      </div>
      <button
        type="button"
        role="switch"
        aria-checked={enabled}
        aria-label="Toggle anonymous analytics"
        onClick={() => setOptOut(enabled)}
        className="relative inline-flex h-6 w-11 flex-none items-center rounded-full transition-colors"
        style={{ background: enabled ? 'var(--accent)' : 'var(--border-strong)' }}
      >
        <span
          className="inline-block h-5 w-5 transform rounded-full bg-white transition-transform"
          style={{ transform: enabled ? 'translateX(22px)' : 'translateX(2px)' }}
        />
      </button>
    </div>
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
              data="The Health Score of a validation you run (a whole number from 0 to 100, nothing else)"
              purpose="Build the anonymous industry average shown next to your score"
              basis="Legitimate interest (Art. 6(1)(f)) — not sent if you object to analytics (below) or your browser signals GPC / Do Not Track"
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
        is written to your device. The page addresses it receives are stripped of their content:
        which link parameters a visit used, never their values (a linked file&apos;s address, a shared
        scene or report).
      </P>

      {/* Analytics choice / opt-out */}
      <H2>Your analytics choice (opt out anytime)</H2>
      <P>
        Because analytics relies on legitimate interest, you can object at any time with the switch
        below. Your choice is stored locally on your device (a single setting, not tracking) and
        takes effect immediately. We also automatically respect your browser&apos;s Global Privacy
        Control or Do Not Track signal as an objection.
      </P>
      <AnalyticsChoice />

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

      {/* Cookies & local storage */}
      <H2>Cookies and local storage</H2>
      <P>
        We do <strong>not</strong> use tracking or advertising cookies. The Service stores a few
        small values in your browser&apos;s local storage <em>purely to make the app work and
        remember your settings</em> (these are strictly necessary / functional, not tracking):
      </P>
      <UL>
        <li><code>ifc-locale</code> — your selected interface language.</li>
        <li><code>ifc-viewer:prefs</code> — UI layout preferences (panel sizes, visibility).</li>
        <li><code>ifc-geo-*</code> — your choices for the optional map view (consent to load map tiles, selected layer). Withdrawing the consent in the Map panel deletes it.</li>
        <li><code>ifc-analytics-optout</code> — your analytics opt-out choice, so we can honour it.</li>
        <li>A short, non-personal campaign tag (in <em>sessionStorage</em>) if you arrived from an invitation link — cleared when you close the tab.</li>
      </UL>
      <P>
        These never leave your device and we cannot read them. You can clear them at any time from
        your browser settings.
      </P>

      {/* Third-party content sources */}
      <H2>Content your browser loads from other services</H2>
      <P>
        Some features load public data directly from other organisations&apos; servers. We are not
        in the middle: your browser talks to them, and like any website they receive the request
        metadata — your IP address and what was asked for, which for anything placed on a map
        reveals the approximate location of the site. They act as independent controllers under their
        own privacy policies. Your IFC files are never sent to any of them.
      </P>
      <UL>
        <li>
          <strong>Demo models</strong> you open from the gallery are downloaded from public
          repositories (GitHub).
        </li>
        <li>
          <strong>Links</strong> that name a file (<code>?model=</code>, <code>?scan=</code>,{' '}
          <code>?scene=</code>, <code>?layers=</code>) download it from the server in the link.
          When a link or a scene also brings data layers or live data sources, the app first lists
          the servers involved and asks you; nothing is requested from them until you agree. When a
          link asks for the map view, you are asked for the map consent below.
        </li>
        <li>
          The optional <strong>map view</strong> requests data only <em>after you explicitly
          consent</em>: map tiles (OpenFreeMap and OpenStreetMap; in Spain, depending on the style,
          also orthophotos from the Instituto Geográfico Nacional and parcels from the Dirección
          General del Catastro; OpenTopoMap, Esri, EOX or NASA GIBS if you pick those basemaps),
          terrain elevation (the Institut Cartogràfic i Geològic de Catalunya inside Catalonia, the
          Geospatial Information Authority of Japan in Japan, AWS Open Data elsewhere) and surrounding
          buildings (OpenStreetMap, through the Overpass API). You can withdraw the
          consent at any time in the Map panel (&ldquo;Data and permission&rdquo;): the map turns off,
          your stored choice is deleted, and nothing more is requested until you consent again. When
          the viewer is embedded in another website, that website decides whether its map is shown;
          that decision lasts the visit only and is not stored as your choice.
        </li>
        <li>
          <strong>Data layers and live feeds</strong> you add — a GeoJSON or WFS address you enter,
          or a ready-made source such as Barcelona, Catalonia or Madrid open data, Bicing, FGC,
          Renfe, TMB (with your own API key), Catastro, ICGC, IGN or the Tokyo ODPT feeds — are read
          from those servers, which receive the area requested. Live device connections go to the
          addresses you configure. If you set a proxy, requests go through it.
        </li>
        <li>
          The <strong>sun study</strong> can fetch climate statistics for the site from Open-Meteo
          when you ask for them (it sends the site&apos;s latitude and longitude).
        </li>
        <li>
          In the <strong>Clip Studio</strong>, pasting a TikTok link asks TikTok for that
          video&apos;s title and cover.
        </li>
      </UL>
      <P>
        Analyses such as the <strong>flood simulation</strong> run entirely in your browser, on
        your device&apos;s GPU. When they use the map&apos;s terrain or buildings they only read data
        the map view has already loaded; neither the model nor the results are sent anywhere.
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
          <strong>Cloudflare</strong> — running the shared-report function, the anonymous Health
          Score benchmark, and basic abuse protection (rate limiting by IP). Cloudflare processes request metadata (including IP
          addresses) as part of its infrastructure; see{' '}
          <a href="https://www.cloudflare.com/privacypolicy/" target="_blank" rel="noopener noreferrer"
             className="underline underline-offset-2" style={{ color: 'var(--accent)' }}>
            Cloudflare's Privacy Policy
          </a>.
        </li>
        <li>
          <strong>Clerk</strong> — sign-in and accounts, where they are offered. When sign-in is
          enabled on the site, Clerk&apos;s script loads with the page and contacts Clerk&apos;s servers
          (request metadata, including IP addresses); your account details are processed only if you
          create an account. See{' '}
          <a href="https://clerk.com/legal/privacy" target="_blank" rel="noopener noreferrer"
             className="underline underline-offset-2" style={{ color: 'var(--accent)' }}>
            Clerk&apos;s Privacy Policy
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
        Some processors (PostHog, Cloudflare, Clerk, Vercel) process data in the United States, outside the
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
