import React from 'react'
import LegalLayout from './LegalLayout'
import { SITE_URL } from '../../seo/config'

const CONTACT     = 'joelbenitezdonari@gmail.com'
const DOMAIN      = SITE_URL
const LAST_UPDATED = '2026-06-15'

// ── Prose helpers ─────────────────────────────────────────────────────────────

function H2({ n, children }: { n: number; children: React.ReactNode }) {
  return (
    <h2
      className="text-[17px] font-semibold tracking-tight mt-10 mb-3"
      style={{ color: 'var(--text)' }}
    >
      {n}. {children}
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

function Caps({ children }: { children: React.ReactNode }) {
  return (
    <p
      className="text-[12.5px] leading-relaxed mb-4 font-medium"
      style={{ color: 'var(--text-dim)' }}
    >
      {children}
    </p>
  )
}

// ── Component ─────────────────────────────────────────────────────────────────

interface Props {
  onNavigateToLanding: () => void
}

export default function TermsOfUse({ onNavigateToLanding }: Props) {
  return (
    <LegalLayout
      pageTitle="Terms of Use"
      lastUpdated={LAST_UPDATED}
      onNavigateToLanding={onNavigateToLanding}
    >
      <H2 n={1}>Acceptance</H2>
      <P>
        By accessing or using{' '}
        <a href={DOMAIN} className="underline underline-offset-2" style={{ color: 'var(--accent)' }}>
          {DOMAIN}
        </a>{' '}
        (the "Service") you agree to these Terms. If you do not agree, do not use the Service.
      </P>

      <H2 n={2}>The Service</H2>
      <P>
        The Service is a free, browser-based IFC viewer and validation tool. Validation results,
        issue lists, and health scores are provided for <strong>INFORMATIONAL purposes only</strong>.
        They are not, and must not be relied upon as, professional, engineering, surveying, or legal
        certification of a model's correctness, compliance, or fitness for any purpose. You remain
        solely responsible for verifying your IFC deliverables.
      </P>

      <H2 n={3}>Third-party and demo content</H2>
      <P>
        The Service may load demo models and link to third-party resources we do not control. We are
        not responsible for third-party content or its accuracy.
      </P>

      <H2 n={4}>Acceptable use</H2>
      <P>
        Use the Service only for lawful purposes. You agree not to: disrupt or overload the Service
        or its infrastructure (including the rate-limited shared-report endpoint); attempt to gain
        unauthorized access; or misuse it to infringe others' rights.
      </P>

      <H2 n={5}>Disclaimer of warranties</H2>
      <Caps>
        THE SERVICE IS PROVIDED "AS IS" AND "AS AVAILABLE", WITHOUT WARRANTIES OF ANY KIND, WHETHER
        EXPRESS OR IMPLIED, INCLUDING BUT NOT LIMITED TO IMPLIED WARRANTIES OF MERCHANTABILITY,
        FITNESS FOR A PARTICULAR PURPOSE, ACCURACY, AND NON-INFRINGEMENT. WE DO NOT WARRANT THAT
        THE SERVICE WILL BE UNINTERRUPTED, ERROR-FREE, OR THAT ANY OUTPUT (INCLUDING VALIDATION
        RESULTS OR HEALTH SCORES) IS ACCURATE OR COMPLETE.
      </Caps>

      <H2 n={6}>Limitation of liability</H2>
      <Caps>
        TO THE MAXIMUM EXTENT PERMITTED BY LAW, WE SHALL NOT BE LIABLE FOR ANY INDIRECT,
        INCIDENTAL, SPECIAL, CONSEQUENTIAL, OR PUNITIVE DAMAGES, OR ANY LOSS OF PROFITS, DATA, OR
        GOODWILL, ARISING FROM YOUR USE OF (OR INABILITY TO USE) THE SERVICE. OUR TOTAL AGGREGATE
        LIABILITY FOR ALL CLAIMS SHALL NOT EXCEED EUR 50.
      </Caps>
      <P>
        Nothing in these Terms excludes or limits liability that cannot be excluded by law, including
        liability for death or personal injury caused by negligence, fraud, gross negligence, or
        wilful misconduct, or your statutory consumer rights.
      </P>

      <H2 n={7}>Indemnity</H2>
      <P>
        You agree to hold us harmless from claims arising out of your misuse of the Service or
        violation of these Terms, to the extent permitted by law.
      </P>

      <H2 n={8}>Changes and availability</H2>
      <P>
        We may modify, suspend, or discontinue the Service or these Terms at any time. The "Last
        updated" date at the top reflects the latest version. The Service is a static site hosted on
        third-party infrastructure (Vercel); its availability depends on that provider, and we do not
        guarantee uninterrupted access.
      </P>

      <H2 n={9}>Governing law</H2>
      <P>
        These Terms are governed by the laws of Spain, without prejudice to mandatory
        consumer-protection rights you may have in your country of residence.
      </P>

      <H2 n={10}>Contact</H2>
      <P>
        <a href={`mailto:${CONTACT}`} className="underline underline-offset-2" style={{ color: 'var(--accent)' }}>
          {CONTACT}
        </a>
      </P>
    </LegalLayout>
  )
}
