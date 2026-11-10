// ─── Landing.tsx ──────────────────────────────────────────────────────────────
// The home page. Plain surfaces from the theme tokens, one accent, no animated
// backgrounds or text effects: the product screenshot is the picture, and the
// first paint is the final paint (no entry animation on the hero).
// landing-home-design.test.ts pins this.

import React, { useState, useCallback } from 'react'
import { useTranslation } from 'react-i18next'
import { subscribeEmail } from '../lib/subscribe'
import { trackEmailCaptured, trackProEntryClick } from '../lib/analytics'
import { LanguageSelectorNav } from './LanguageSelector'
import * as Tooltip from '@radix-ui/react-tooltip'
import * as Icons from './Icons'
import CountUp       from './reactbits/CountUp'
import ProfilePaths  from './landing/ProfilePaths'
import { HOME_COPY, PRIMARY_FEATURES, homeLang } from './landing/home-copy'
import { HeroFigure, ShowcaseSection, CompareSection } from './landing/HomeShowcase'
import { SHOWCASE_COPY, examplesPath } from './landing/home-showcase'
import BimoMascot, { type BimoMood } from './mascot/BimoMascot'

interface LandingProps {
  onLaunch: () => void
  onOpenUpload: () => void
  onOpenDemoGallery: () => void
  onNavigateToBlog: (lang?: string) => void
  onNavigateToPrivacy: () => void
  onNavigateToTerms: () => void
  landingTheme: 'dark' | 'light'
  onToggleLandingTheme: () => void
}

// ── Theme toggle button ───────────────────────────────────────────────────────
function ThemeToggleBtn({ theme, onToggle }: { theme: 'dark' | 'light'; onToggle: () => void }) {
  return (
    <button
      onClick={onToggle}
      className="w-[30px] h-[30px] flex items-center justify-center rounded-lg border border-[var(--border)] text-[var(--text-dim)] hover:text-[var(--text)] hover:border-[var(--border-strong)] transition-all flex-shrink-0"
      aria-label={theme === 'dark' ? 'Switch to light mode' : 'Switch to dark mode'}
      title={theme === 'dark' ? 'Switch to professional light mode' : 'Switch to dark mode'}
    >
      {theme === 'dark' ? (
        <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
          <circle cx="12" cy="12" r="4"/>
          <path d="M12 2v2M12 20v2M4.93 4.93l1.41 1.41M17.66 17.66l1.41 1.41M2 12h2M20 12h2M6.34 17.66l-1.41 1.41M19.07 4.93l-1.41 1.41"/>
        </svg>
      ) : (
        <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
          <path d="M21 12.79A9 9 0 1 1 11.21 3 7 7 0 0 0 21 12.79z"/>
        </svg>
      )}
    </button>
  )
}

// ── Design tokens ─────────────────────────────────────────────────────────────

const GITHUB_URL = 'https://github.com/j03rul4nd/ifc-viewer-online'

const GITHUB_SVG = (
  <svg width="15" height="15" viewBox="0 0 24 24" fill="currentColor" aria-hidden="true">
    <path d="M12 0c-6.626 0-12 5.373-12 12 0 5.302 3.438 9.8 8.207 11.387.599.111.793-.261.793-.577v-2.234c-3.338.726-4.033-1.416-4.033-1.416-.546-1.387-1.333-1.756-1.333-1.756-1.089-.745.083-.729.083-.729 1.205.084 1.839 1.237 1.839 1.237 1.07 1.834 2.807 1.304 3.492.997.107-.775.418-1.305.762-1.604-2.665-.305-5.467-1.334-5.467-5.931 0-1.311.469-2.381 1.236-3.221-.124-.303-.535-1.524.117-3.176 0 0 1.008-.322 3.301 1.23.957-.266 1.983-.399 3.003-.404 1.02.005 2.047.138 3.006.404 2.291-1.552 3.297-1.23 3.297-1.23.653 1.653.242 2.874.118 3.176.77.84 1.235 1.911 1.235 3.221 0 4.609-2.807 5.624-5.479 5.921.43.372.823 1.102.823 2.222v3.293c0 .319.192.694.801.576 4.765-1.589 8.199-6.086 8.199-11.386 0-6.627-5.373-12-12-12z"/>
  </svg>
)

// ── FAQ accordion ─────────────────────────────────────────────────────────────
function FAQItem({ q, a }: { q: string; a: string }) {
  const [open, setOpen] = useState(false)
  return (
    <div className="border-b border-[var(--border)]" itemScope itemType="https://schema.org/Question">
      <button
        onClick={() => setOpen(!open)}
        aria-expanded={open}
        className="w-full py-4 sm:py-[18px] flex items-center justify-between text-left text-[14px] sm:text-[15px] font-medium tracking-tight gap-3"
        itemProp="name"
      >
        <span>{q}</span>
        <Icons.Chevron
          size={14}
          className="text-[var(--text-dim)] transition-transform flex-shrink-0"
          style={{ transform: open ? 'rotate(90deg)' : 'none' }}
        />
      </button>
      {open && (
        <div
          className="pb-4 text-[13px] sm:text-[13.5px] text-[var(--text-dim)] leading-relaxed"
          itemScope itemType="https://schema.org/Answer"
        >
          <span itemProp="text">{a}</span>
        </div>
      )}
    </div>
  )
}

// ── Hero preview card ─────────────────────────────────────────────────────────
function HeroPreview({ lightBg }: { lightBg?: boolean }) {
  const tooltipBg = lightBg
    ? 'bg-[var(--surface)] shadow-sm'
    : 'bg-[var(--surface)]'
  return (
    <div className="relative bg-[var(--bg)] flex overflow-hidden">
      {/* 3D render — always shown */}
      <div className="flex-1 relative overflow-hidden bg-black min-w-0">
        <img
          src={`${import.meta.env.BASE_URL}Renderizado_3D_detallado_de_edificio_modular.png`}
          alt="Illustration: exploded view of a modular building with labels on its walls, slabs, beams and ducts"
          className="w-full h-auto block"
          width="1536"
          height="1024"
          loading="lazy"
          decoding="async"
        />
        {/* Element tooltip — smaller on mobile */}
        <div className={`absolute top-[46%] right-[4%] border border-[var(--border-strong)] rounded-lg px-2 sm:px-3 py-1.5 sm:py-2 text-[13px] backdrop-blur-md ${tooltipBg}`}>
          <div className="font-mono text-[13px] text-[var(--accent-2)] mb-0.5">IfcWall</div>
          <div className="font-medium">Exterior — 300mm</div>
          <div className="text-[var(--text-dim)] text-[13px] mt-0.5">REI 60 · Load bearing</div>
        </div>
      </div>

      {/* Validation panel mock — hidden on narrow screens */}
      <div className="hidden sm:flex w-[220px] md:w-[260px] border-l border-[var(--border)] bg-[var(--surface)] flex-col shrink-0 overflow-hidden" aria-label="Validation panel preview">
        {/* Panel header */}
        <div className="px-3 py-2.5 border-b border-[var(--border)] flex items-center justify-between bg-[var(--surface-2)]">
          <span className="font-mono text-[13px] text-[var(--text-faint)] tracking-[0.1em]">VALIDATION</span>
          <div className="flex items-center gap-1.5">
            <div className="w-1.5 h-1.5 rounded-full bg-[var(--ok)]" aria-hidden="true" />
            <span className="text-[13px] font-semibold" style={{ color: 'var(--ok)' }}>87 / 100</span>
          </div>
        </div>

        {/* Issue rows */}
        <div className="flex-1 overflow-hidden p-2 flex flex-col gap-1" aria-hidden="true">
          {[
            { dot: 'var(--danger)', label: '3 duplicate GUIDs' },
            { dot: 'var(--warn)',   label: '2 orphan elements' },
            { dot: 'var(--warn)',   label: 'Coordinate offset > 10 km' },
            { dot: 'var(--accent-2)', label: '18 empty property values' },
            { dot: 'var(--ok)',     label: 'Spatial hierarchy OK' },
            { dot: 'var(--ok)',     label: 'No MEP / structural clashes' },
          ].map((row, i) => (
            <div key={i} className="flex items-start gap-2 px-2 py-1.5 rounded-[6px] bg-[var(--surface-2)] text-[13px]">
              <div className="w-1.5 h-1.5 rounded-full shrink-0 mt-[3px]" style={{ background: row.dot }} />
              <span className="text-[var(--text-dim)] leading-tight truncate">{row.label}</span>
            </div>
          ))}
        </div>

        {/* Score bar */}
        <div className="px-3 py-2.5 border-t border-[var(--border)]" aria-hidden="true">
          <div className="flex justify-between text-[13px] text-[var(--text-faint)] mb-1.5">
            <span>Health Score</span>
            <span className="font-semibold" style={{ color: 'var(--ok)' }}>87</span>
          </div>
          <div className="h-[3px] bg-[var(--border)] rounded-full overflow-hidden">
            <div className="h-full rounded-full" style={{ width: '87%', background: 'var(--ok)' }} />
          </div>
          <div className="text-[13px] text-[var(--text-faint)] mt-1.5">Processed in-browser · 0 uploads</div>
        </div>
      </div>
    </div>
  )
}

// ── Animation helpers ─────────────────────────────────────────────────────────

// ── Feature icon map (static — icons don't need i18n) ─────────────────────────
// Order mirrors the features array in locales: validator, IDS, 3D map, BCF,
// multi-model, drag&drop, OPFS cache, editing, QTO, measurements, floor plans,
// export, schemas, renderer, indexer.
const FEATURE_ICONS = [
  Icons.Sparkles, Icons.Shield,   Icons.Globe,    Icons.Comment,
  Icons.Layers,   Icons.Upload,   Icons.Zap,      Icons.Ruler,
  Icons.Building, Icons.Ruler,    Icons.Building, Icons.Upload,
  Icons.Zap,      Icons.Sparkles, Icons.Layers,
] as const

// ── Privacy section icon map ───────────────────────────────────────────────────
// Order: zero-uploads, verify-devtools, open-source, privacy-policy
const PRIVACY_ICONS = [Icons.Lock, Icons.Eye, Icons.Zap, Icons.FileIfc] as const

// ── Fix-guide categories ────────────────────────────────────────────────────
// The 8 validation categories, each backed by a static, crawlable silo page at
// /[lang/]fix/category/<cat>/ (generated by scripts/seo/generate-fix-pages.ts).
// Surfacing them here gives users — and crawlers — a natural path into the ~360
// per-rule fix pages, which would otherwise be orphaned behind a single footer
// link. Labels are reused from the validation namespace (catFull.*) so they stay
// in sync with the rest of the app and require no extra translation here.
const FIX_CATEGORIES = ['schema', 'spatial', 'quality', 'lod', 'iso19650', 'classification', 'mep', 'clash'] as const

// Languages that ship localized fix pages under a /<lang>/ prefix. EN lives at
// the site root. Mirrors LANG_PATH in scripts/seo/generate-fix-pages.ts.
import { validatorPath, solibriPath, toolLandings } from '../lib/localized-landings'
import { pricingPath } from '../lib/pricing/pricing-paths'

const FIX_LANG_PREFIXES = ['es', 'de', 'fr', 'pt', 'it', 'ca', 'zh', 'ja', 'th']

// ── Main component ────────────────────────────────────────────────────────────
export default function Landing({ onLaunch, onOpenUpload, onOpenDemoGallery, onNavigateToBlog, onNavigateToPrivacy, onNavigateToTerms, landingTheme, onToggleLandingTheme }: LandingProps) {
  // 'validation' is loaded alongside 'landing' so the fix-guide section can reuse
  // the already-translated category labels (catFull.*). 'landing' stays the default
  // namespace, so every other t() call in this component is unchanged.
  const { t, i18n } = useTranslation(['landing', 'validation'])
  const { t: te } = useTranslation('common', { keyPrefix: 'emailCapture.footer' })

  // Base URL for the static fix-guide pages. EN at the site root, other locales
  // under a /<lang>/ prefix (mirrors LANG_PATH in the page generator).
  const langShort = i18n.language.slice(0, 2)
  const fixBase = `${import.meta.env.BASE_URL}${FIX_LANG_PREFIXES.includes(langShort) ? langShort + '/' : ''}fix/`
  // The blog links used to be <button onClick>, so the only path from the home
  // page to ~130 blog URLs was invisible to a crawler. They stay client-side
  // navigations, but now carry the href they actually navigate to. Mirrors
  // blogUrlBase() in App.tsx.
  const blogBase = `${import.meta.env.BASE_URL}${langShort !== 'en' ? langShort + '/' : ''}blog/`
  // The hand-authored SEO landings only ever linked to each other and to their
  // own translations — a closed island with no edge from the home page, which
  // is why Search Console reports them "crawled, currently not indexed".
  const validatorHref = `${import.meta.env.BASE_URL}${validatorPath(langShort)}`
  const solibriHref = `${import.meta.env.BASE_URL}${solibriPath(langShort)}`

  // ── Safety-net re-render subscription ────────────────────────────────────────
  // react-i18next v17 uses useSyncExternalStore internally. In some timing
  // scenarios (lazy namespace load races, React concurrent-mode batching) the
  // store subscription may miss the 'added' event that fires when a non-EN
  // namespace finishes loading. As a belt-and-suspenders fallback we subscribe
  // directly to i18n.store events here and force a re-render via useReducer.
  // This is safe — the extra render is cheap and the new `t` snapshot already
  // has the correct language because useSyncExternalStore re-reads getSnapshot
  // on the same React flush that applies the state update.
  const [, forceUpdate] = React.useReducer((x: number) => x + 1, 0)

  // ── Email capture form state ──────────────────────────────────────────────
  const [emailValue,   setEmailValue]   = useState('')
  const [emailStatus,  setEmailStatus]  = useState<'idle' | 'loading' | 'success' | 'error'>('idle')
  const [emailError,   setEmailError]   = useState('')
  const [bimoMood,     setBimoMood]     = useState<BimoMood | undefined>()

  const handleEmailSubmit = useCallback(async (e: React.FormEvent) => {
    e.preventDefault()
    const email = emailValue.trim()
    if (!email) return
    setEmailStatus('loading')
    setEmailError('')
    const result = await subscribeEmail(email, 'landing_footer', i18n.language)
    if (result.ok || result.already) {
      setEmailStatus('success')
      setBimoMood({ clip: 'celebrate', textKey: 'emailThanks', id: Date.now() })
      trackEmailCaptured({ source: 'landing_footer', already_subscribed: !!result.already, locale: i18n.language })
    } else if (result.disabled) {
      // Worker not yet deployed — silently succeed in dev, show message in prod
      if (import.meta.env.DEV) setEmailStatus('success')
      else { setEmailStatus('error'); setEmailError(te('notAvailable')) }
    } else {
      setEmailStatus('error')
      setEmailError(result.error ?? te('genericError'))
      setBimoMood({ clip: 'confused', textKey: 'emailError', id: Date.now() })
    }
  }, [emailValue, i18n.language])

  React.useEffect(() => {
    const cb = () => forceUpdate()
    i18n.on('languageChanged', cb)
    i18n.store.on('added', cb)
    return () => {
      i18n.off('languageChanged', cb)
      i18n.store.off('added', cb)
    }
  }, [i18n])

  // During a language switch the 'landing' namespace is fetched asynchronously.
  // While loading, t(key, { returnObjects:true }) may return the key string instead
  // of an array. Guard every returnObjects call with Array.isArray so we never
  // call .map() on a string — EN fallback shows until the new namespace arrives.
  const raw = {
    features:     t('features',              { returnObjects: true }),
    typing:       t('typing',                { returnObjects: true }),
    stats:        t('stats',                 { returnObjects: true }),
    steps:        t('steps',                 { returnObjects: true }),
    faq:          t('faq',                   { returnObjects: true }),
    privacyCards: t('privacySection.cards',  { returnObjects: true }),
  }

  const FEATURES = (Array.isArray(raw.features) ? raw.features as Array<{ title: string; body: string; tip: string }> : [])
    .map((f, i) => ({ ...f, icon: FEATURE_ICONS[i] ?? Icons.Upload }))

  const PRIVACY_CARDS = (Array.isArray(raw.privacyCards) ? raw.privacyCards as Array<{ title: string; body: string }> : [])
    .map((c, i) => ({ ...c, icon: PRIVACY_ICONS[i] ?? Icons.Check }))
  const STATS        = Array.isArray(raw.stats)   ? raw.stats  as Array<{ label: string }> : []
  const STEPS        = Array.isArray(raw.steps)   ? raw.steps  as Array<{ n: string; title: string; body: string }> : []
  const FAQ          = Array.isArray(raw.faq)     ? raw.faq    as Array<{ q: string; a: string }> : []

  // Keep <html lang> in sync — i18n.language updates synchronously on changeLanguage
  // even before the namespace finishes loading, so the attribute is always current.
  React.useEffect(() => {
    document.documentElement.lang = i18n.language
  }, [i18n.language])

  return (
    <Tooltip.Provider delayDuration={300}>
      {/*
        Root scroll container. On iOS Safari the body has overflow:hidden — this
        div owns the vertical scroll so momentum / rubber-band works correctly.
        -webkit-overflow-scrolling is set here for older Safari compat.
      */}
      <div className={`landing-scroll absolute inset-0 overflow-auto bg-[var(--bg)] text-[var(--text)]${landingTheme === 'light' ? ' lp-light' : ''}`}>

        {/* ── Nav ── */}
        <nav
          className="relative max-w-[1200px] mx-auto px-4 sm:px-7 py-4 sm:py-[22px] flex items-center justify-between"
          style={{ zIndex: 3 }}
          aria-label="Main navigation"
        >
          {/* Logo */}
          <div className="flex items-center gap-2 sm:gap-2.5">
            <Icons.Logo size={22} aria-hidden="true" />
            <span className="text-[14px] sm:text-[15px] font-semibold tracking-tight whitespace-nowrap">IFC Viewer</span>
          </div>

          {/* Desktop nav — md (768px+) tablet-friendly, lg (1024px+) full */}
          <div className="hidden md:flex items-center gap-3 lg:gap-5">
            {/* Nav links — small subset at md, full set at lg */}
            <a href="#features"
              className="text-[13px] text-[var(--text-dim)] no-underline hover:text-[var(--text)] transition-colors whitespace-nowrap"
            >{t('nav.features')}</a>
            <a href="#how"
              className="text-[13px] text-[var(--text-dim)] no-underline hover:text-[var(--text)] transition-colors whitespace-nowrap"
            >{t('nav.howItWorks')}</a>
            <a href="#fix-guides"
              className="hidden lg:inline text-[13px] text-[var(--text-dim)] no-underline hover:text-[var(--text)] transition-colors whitespace-nowrap"
            >{t('nav.fixGuides')}</a>
            <a href="#integrations"
              className="hidden lg:inline text-[13px] text-[var(--text-dim)] no-underline hover:text-[var(--text)] transition-colors whitespace-nowrap"
            >{t('nav.sdk')}</a>
            <a href="#faq"
              className="text-[13px] text-[var(--text-dim)] no-underline hover:text-[var(--text)] transition-colors whitespace-nowrap"
            >{t('nav.faq')}</a>
            <a
              href={blogBase}
              onClick={(e) => { e.preventDefault(); onNavigateToBlog(langShort) }}
              className="text-[13px] text-[var(--text-dim)] bg-transparent border-0 p-0 cursor-pointer hover:text-[var(--text)] transition-colors whitespace-nowrap"
            >Blog</a>
            {/* Public pricing page (static, crawlable): plans and their waitlists. */}
            <a
              href={`${import.meta.env.BASE_URL}${pricingPath(langShort).slice(1)}`}
              onClick={() => trackProEntryClick({ source: 'landing' })}
              className="text-[13px] text-[var(--text-dim)] no-underline hover:text-[var(--text)] transition-colors whitespace-nowrap"
            >{t('nav.pricing')}</a>
            <a href={GITHUB_URL} target="_blank" rel="noopener noreferrer"
              className="hidden lg:inline text-[13px] text-[var(--text-dim)] no-underline hover:text-[var(--text)] transition-colors whitespace-nowrap"
              aria-label="View source code on GitHub"
            >{t('nav.github')}</a>

            {/* Controls — always visible */}
            <ThemeToggleBtn theme={landingTheme} onToggle={onToggleLandingTheme} />
            <LanguageSelectorNav landingTheme={landingTheme} />
            <button
              onClick={onLaunch}
              className="inline-flex items-center gap-1.5 lg:gap-2 h-[30px] px-2.5 lg:px-3 text-[13px] font-medium rounded-[9px] bg-[var(--accent)] text-white hover:brightness-110 active:brightness-90 transition-all cursor-pointer whitespace-nowrap"
            >
              <Icons.ArrowRight size={13} />
              <span className="hidden lg:inline">{t('actions.openViewer')}</span>
              <span className="lg:hidden">{t('actions.launch')}</span>
            </button>
          </div>

          {/* Mobile: Blog + Pricing + GitHub icon + theme toggle + language selector + primary CTA */}
          <div className="flex md:hidden items-center gap-1.5 min-w-0">
            <a
              href={`${import.meta.env.BASE_URL}${pricingPath(langShort).slice(1)}`}
              onClick={() => trackProEntryClick({ source: 'landing' })}
              className="text-[13px] font-medium text-[var(--text-dim)] px-1 py-1 no-underline hover:text-[var(--text)] transition-colors whitespace-nowrap"
            >{t('nav.pricing')}</a>
            <a
              href={blogBase}
              onClick={(e) => { e.preventDefault(); onNavigateToBlog(langShort) }}
              className="text-[13px] font-medium text-[var(--text-dim)] bg-transparent border-0 px-1 py-1 cursor-pointer hover:text-[var(--text)] transition-colors whitespace-nowrap"
            >Blog</a>
            <a href={GITHUB_URL} target="_blank" rel="noopener noreferrer"
              className="w-9 h-9 hidden sm:flex items-center justify-center rounded-lg text-[var(--text-dim)] hover:text-[var(--text)] transition-colors"
              aria-label="GitHub repository"
            >
              {GITHUB_SVG}
            </a>
            <ThemeToggleBtn theme={landingTheme} onToggle={onToggleLandingTheme} />
            <LanguageSelectorNav landingTheme={landingTheme} />
            <button
              onClick={onLaunch}
              className="inline-flex items-center gap-1.5 h-9 px-3 text-[13px] font-semibold rounded-[9px] bg-[var(--accent)] text-white active:brightness-90 cursor-pointer whitespace-nowrap"
            >
              {t('actions.launch')}
            </button>
          </div>
        </nav>

        {/* ── Hero ── */}
        <header
          className="relative max-w-[1200px] mx-auto px-4 sm:px-7 pt-8 sm:pt-12 pb-10 sm:pb-[60px] text-left"
          style={{ zIndex: 2 }}
        >
          {/* What it costs and where it runs, as a line of text (no pill). */}
          <p className="m-0 mb-4 sm:mb-5 text-[13px] sm:text-[14px] text-[var(--text-dim)]">
            <span className="sm:hidden">{t('hero.badgeMobile')}</span>
            <span className="hidden sm:inline">{t('hero.badge')}</span>
          </p>

          {/* H1 */}
          <h1
            className="font-semibold tracking-[-0.03em] leading-[1.08] mb-4 sm:mb-5 max-w-[900px] text-balance"
            style={{ fontSize: 'clamp(30px, 5.6vw, 54px)' }}
          >
            <span className="block text-[15px] sm:text-[17px] font-medium tracking-normal text-[var(--accent-2)] mb-3 sm:mb-4">
              {HOME_COPY[homeLang(langShort)].kicker}
            </span>
            {HOME_COPY[homeLang(langShort)].h1}
          </h1>

          {/* Subtitle */}
          <p
            className="text-[var(--text-dim)] leading-[1.5] sm:leading-[1.45] max-w-[700px] tracking-[-0.005em]"
            style={{ fontSize: 'clamp(14px, 3.5vw, 19px)' }}
          >
            {t('hero.subtitleFull')}
          </p>

          {/* CTA row */}
          <div
            className="flex gap-3 mt-6 sm:mt-7 flex-wrap items-center"
          >
            {/* Phone first: one tap loads the sample model. Only 24% of phone
                visitors opened a model (desktop 57%) — few carry an IFC on
                their phone, and the second button used to be GitHub. */}
            <button
              type="button"
              onClick={onLaunch}
              className="sm:hidden inline-flex items-center gap-2 h-[44px] px-5 text-[14px] font-semibold rounded-[10px] bg-[var(--accent)] text-white active:brightness-90 cursor-pointer"
            >
              <Icons.ArrowRight size={15} />
              {t('actions.loadDemo')}
            </button>
            <button type="button" onClick={onOpenUpload} className="inline-flex items-center gap-2 h-11 px-5 rounded-[10px] border border-[var(--border-strong)] text-[var(--text)] sm:border-transparent sm:bg-[var(--accent)] sm:text-white font-semibold hover:brightness-110 active:brightness-95 transition-[filter] cursor-pointer">
              <span className="inline-flex items-center gap-2 text-[13px] sm:text-[14px] font-medium">
                <Icons.Upload size={14} />
                {t('actions.openAnIfc')}
              </span>
            </button>

            <a
              href={GITHUB_URL}
              target="_blank" rel="noopener noreferrer"
              className="hidden sm:inline-flex items-center gap-2 h-[38px] px-4 text-[13px] sm:text-[14px] font-medium rounded-[9px] border border-[var(--border-strong)] text-[var(--text)] hover:bg-[var(--surface-2)] transition-colors no-underline"
              aria-label="View source code on GitHub"
            >
              {GITHUB_SVG}
              {t('actions.viewOnGithub')}
            </a>
          </div>

          {/* Trust line */}
          <div
            className="mt-4 flex flex-wrap items-center gap-x-2 gap-y-0.5 text-[13px] text-[var(--text-faint)]"
          >
            <span className="hidden sm:inline">{t('hero.trustLine')}</span>
            <span className="sm:hidden">{t('hero.trustLineMobile')}</span>
            <span aria-hidden="true">·</span>
            <button
              onClick={onNavigateToPrivacy}
              className="inline-flex items-center gap-1 font-medium cursor-pointer bg-transparent border-0 p-0 hover:underline underline-offset-2 transition-colors"
              style={{ color: 'var(--ok)' }}
            >
              <Icons.Lock size={9} />
              Privacy Policy
            </button>
          </div>

          {/* Demo gallery link — captures users who don't have an IFC at hand */}
          <div
            className="mt-3"
          >
            <button
              onClick={onOpenDemoGallery}
              className="text-[13px] text-[var(--text-faint)] hover:text-[var(--accent-2)] transition-colors cursor-pointer underline-offset-2 hover:underline"
            >
              {t('demoGallery.openCta')} →
            </button>
          </div>

          {/* The product itself: a capture of the viewer, not an illustration. */}
          <HeroFigure lang={langShort} />
        </header>

        {/* ── Compatible strip ── */}
        <section
          className="border-t border-b border-[var(--border)] py-5 sm:py-[26px] px-4 sm:px-7 text-center"
          style={{ zIndex: 2, position: 'relative' }}
          aria-label="Supported BIM authoring tools"
        >
          <div className="text-[13px] text-[var(--text-faint)] mb-3 sm:mb-4 font-medium">
            {t('compatible.label')}
          </div>
          <div className="flex gap-4 sm:gap-10 justify-center flex-wrap text-[13px] sm:text-[15px] font-medium text-[var(--text-dim)] tracking-tight">
            {['Revit', 'ArchiCAD', 'Tekla', 'Allplan', 'Vectorworks', 'BricsCAD BIM'].map((name) => (
              <span key={name}>{name}</span>
            ))}
          </div>
        </section>

        {/* ── Stats strip ── */}
        <section
          className="border-b border-[var(--border)] py-10 sm:py-[52px] px-4 sm:px-7"
          style={{
            zIndex: 2,
            position: 'relative',
          }}
          aria-label="Key statistics"
        >
          <div className="max-w-[900px] mx-auto grid grid-cols-2 gap-y-8 sm:gap-y-10 gap-x-4 sm:gap-x-6 sm:grid-cols-4">
            {[
              { to: 44,  suffix: '',  stiffness: 70,  numCls: '' },
              { to: 4,   suffix: '',  stiffness: 90,  numCls: '' },
              { to: 100, suffix: '%', stiffness: 60,  numCls: '' },
              { to: 0,   suffix: '',  stiffness: 90,  numCls: 'text-[var(--ok)]' },
            ].map((s, i) => (
              <CountUp
                key={i}
                to={s.to}
                suffix={s.suffix}
                label={STATS[i]?.label ?? ''}
                stiffness={s.stiffness}
                damping={22}
                numberClassName={`text-[38px] sm:text-[52px] font-semibold tracking-[-0.04em] ${s.numCls || 'text-[var(--text)]'}`}
                labelClassName="text-[13px] text-[var(--text-faint)] mt-1 tracking-[0.02em]"
              />
            ))}
          </div>
        </section>

        <ShowcaseSection
          lang={langShort}
          links={{
            validation: validatorHref,
            skyline: `${import.meta.env.BASE_URL}${examplesPath(homeLang(langShort))}`,
            aerial: `${blogBase}ifc-coordinates-georeferencing/`,
          }}
        />

        <CompareSection lang={langShort} solibriHref={solibriHref} />

        <ProfilePaths lang={langShort} onLaunch={onLaunch} />

        {/* ── Privacy & Security ── */}
        <section
          id="privacy-security"
          className="border-t border-[var(--border)] py-14 sm:py-[90px] px-4 sm:px-7"
          aria-labelledby="privacy-heading"
        >
          <div className="max-w-[1200px] mx-auto">
            <div className="text-center mb-10 sm:mb-[60px]">
              <div className="text-[13px] font-medium mb-2 sm:mb-2.5" style={{ color: 'var(--ok)' }}>
                {t('privacySection.label')}
              </div>
              <h2
                id="privacy-heading"
                className="font-semibold tracking-[-0.03em] m-0"
                style={{ fontSize: 'clamp(24px, 6.5vw, 42px)' }}
              >
                {t('privacySection.title')}
              </h2>
              <p className="text-[14px] sm:text-[16px] text-[var(--text-dim)] mt-3 max-w-[540px] mx-auto">
                {t('privacySection.subtitle')}
              </p>
            </div>

            <div
              className="lp-card-grid grid border border-[var(--border)] rounded-xl sm:rounded-2xl overflow-hidden"
              style={{ gridTemplateColumns: 'repeat(auto-fit, minmax(240px, 1fr))' }}
            >
              {PRIVACY_CARDS.map((card, i) => (
                <div
                  key={i}
                  className="p-5 sm:p-7 bg-[var(--surface)] hover:bg-[var(--surface-2)] transition-colors"
                >
                  <div
                    className="w-[30px] sm:w-[34px] h-[30px] sm:h-[34px] rounded-lg flex items-center justify-center mb-3 sm:mb-4"
                    style={{ background: 'color-mix(in srgb, var(--ok) 10%, transparent)', color: 'var(--ok)' }}
                    aria-hidden="true"
                  >
                    <card.icon size={15} />
                  </div>
                  <div className="text-[14px] sm:text-[15px] font-semibold tracking-tight mb-1.5">
                    {card.title}
                  </div>
                  <div className="text-[13px] text-[var(--text-dim)] leading-[1.55]">{card.body}</div>
                </div>
              ))}
            </div>

            <div className="text-center mt-8 sm:mt-10">
              <button
                onClick={onNavigateToPrivacy}
                className="inline-flex items-center gap-1.5 text-[13px] font-medium hover:underline underline-offset-2 cursor-pointer bg-transparent border-0 p-0 transition-colors"
                style={{ color: 'var(--ok)' }}
              >
                <Icons.Lock size={11} />
                {t('privacySection.ctaText')}
              </button>
            </div>
          </div>
        </section>

        {/* ── Features ── */}
        <section id="features" className="max-w-[1200px] mx-auto px-4 sm:px-7 py-14 sm:py-[90px]" aria-labelledby="features-heading">
          <div className="text-center mb-10 sm:mb-[60px]">
            <div className="text-[13px] text-[var(--accent-2)] font-medium mb-2 sm:mb-2.5">
              {t('featuresSection.label')}
            </div>
            <h2
              id="features-heading"
              className="font-semibold tracking-[-0.03em] m-0"
              style={{ fontSize: 'clamp(24px, 6.5vw, 42px)' }}
            >
              {t('featuresSection.title')}
            </h2>
            <p className="text-[14px] sm:text-[16px] text-[var(--text-dim)] mt-3 max-w-[600px] mx-auto">
              {t('featuresSection.subtitle')}
            </p>
          </div>

          {/* Feature cards grid */}
          <div
            className="lp-card-grid grid border border-[var(--border)] rounded-xl sm:rounded-2xl overflow-hidden"
            style={{ gridTemplateColumns: 'repeat(auto-fit, minmax(260px, 1fr))' }}
          >
            {PRIMARY_FEATURES.map((idx) => FEATURES[idx]).filter(Boolean).map((f, i) => (
              <div className="w-full" key={i}>
                <div
                  className="p-5 sm:p-7 h-full bg-[var(--surface)] hover:bg-[var(--surface-2)] transition-colors"
                >
                  <Tooltip.Root>
                    <Tooltip.Trigger asChild>
                      <div
                        className="w-[30px] sm:w-[34px] h-[30px] sm:h-[34px] rounded-lg bg-[color-mix(in_srgb,var(--accent)_12%,transparent)] text-[var(--accent-2)] flex items-center justify-center mb-3 sm:mb-4 cursor-default"
                        aria-hidden="true"
                      >
                        <f.icon size={15} />
                      </div>
                    </Tooltip.Trigger>
                    <Tooltip.Portal>
                      <Tooltip.Content
                        side="top"
                        sideOffset={6}
                        className="px-2.5 py-1.5 rounded-lg text-[13px] font-medium bg-[var(--surface)] border border-[var(--border)] text-[var(--text-dim)] shadow-xl backdrop-blur-sm z-50 select-none"
                      >
                        {f.tip}
                        <Tooltip.Arrow className="fill-[var(--border)]" />
                      </Tooltip.Content>
                    </Tooltip.Portal>
                  </Tooltip.Root>

                  <div className="text-[14px] sm:text-[15px] font-semibold tracking-tight mb-1.5">
                    {f.title}
                  </div>
                  <div className="text-[13px] sm:text-[14px] text-[var(--text-dim)] leading-[1.55]">{f.body}</div>
                </div>
              </div>
            ))}
          </div>

          {/* The generated picture that used to open the page: kept, lower, and
              labelled for what it is. */}
          <figure className="m-0 mt-10 sm:mt-14 max-w-[920px] mx-auto">
            <div className="rounded-xl sm:rounded-2xl overflow-hidden border border-[var(--border)] bg-[var(--surface)]">
              <HeroPreview lightBg={landingTheme === 'light'} />
            </div>
            <figcaption className="mt-3 text-[13px] text-[var(--text-faint)] text-center">
              {SHOWCASE_COPY[homeLang(langShort)].illustration}
            </figcaption>
          </figure>

          {/* The rest, without competing with the six above. */}
          <div className="mt-8 sm:mt-10 text-center">
            <h3 className="text-[13px] font-medium text-[var(--text-dim)] m-0 mb-3">{HOME_COPY[homeLang(langShort)].moreFeatures}</h3>
            <ul className="list-none m-0 p-0 flex flex-wrap justify-center gap-2" data-testid="more-features">
              {FEATURES.filter((_, i) => !(PRIMARY_FEATURES as readonly number[]).includes(i)).map((f) => (
                <li key={f.title} className="text-[13px] text-[var(--text-dim)] px-3 py-1.5 rounded-full border border-[var(--border)]" title={f.body}>{f.title}</li>
              ))}
            </ul>
          </div>
        </section>

        {/* ── How it works ── */}
        <section id="how" className="border-t border-[var(--border)] py-14 sm:py-[90px] px-4 sm:px-7" aria-labelledby="how-heading">
          <div className="max-w-[1200px] mx-auto">
            <div className="text-center mb-10 sm:mb-[60px]">
              <div className="text-[13px] text-[var(--accent-2)] font-medium mb-2 sm:mb-2.5">
                {t('howItWorksSection.label')}
              </div>
              <h2
                id="how-heading"
                className="font-semibold tracking-[-0.03em] m-0"
                style={{ fontSize: 'clamp(24px, 6.5vw, 42px)' }}
              >
                {t('howItWorksSection.title')}
              </h2>
            </div>

            <div className="grid gap-4 sm:gap-6" style={{ gridTemplateColumns: 'repeat(auto-fit, minmax(240px, 1fr))' }}>
              {STEPS.map((s, i) => (
                <div key={i} className="rounded-xl w-full border border-[var(--border)] bg-[var(--surface)]">
                  <div
                    className="p-5 sm:p-[26px] h-full"
                  >
                    <div
                      className="text-[24px] sm:text-[28px] font-semibold mb-3 tracking-tight"
                      style={{ color: 'var(--accent-2)' }}
                      aria-hidden="true"
                    >
                      {s.n}
                    </div>
                    <div className="text-[15px] sm:text-[16px] font-semibold tracking-tight mb-2">{s.title}</div>
                    <div className="text-[13px] text-[var(--text-dim)] leading-[1.55]">{s.body}</div>
                  </div>
                </div>
              ))}
            </div>
          </div>
        </section>

        {/* ── Fix guides (internal linking → crawlable /fix/ SEO pages) ── */}
        <section
          id="fix-guides"
          className="border-t border-[var(--border)] py-14 sm:py-[90px] px-4 sm:px-7"
          aria-labelledby="fix-guides-heading"
          style={{ position: 'relative', overflow: 'hidden' }}
        >
          <div className="max-w-[1200px] mx-auto" style={{ position: 'relative', zIndex: 1 }}>
            <div className="text-center mb-10 sm:mb-[60px]">
              <div className="text-[13px] text-[var(--accent-2)] font-medium mb-2 sm:mb-2.5">
                {t('fixGuides.label')}
              </div>
              <h2
                id="fix-guides-heading"
                className="font-semibold tracking-[-0.03em] m-0"
                style={{ fontSize: 'clamp(24px, 6.5vw, 42px)' }}
              >
                {t('fixGuides.title')}
              </h2>
              <p className="text-[14px] sm:text-[16px] text-[var(--text-dim)] mt-3 max-w-[600px] mx-auto">
                {t('fixGuides.subtitle')}
              </p>
            </div>

            {/* Category silo links — one crawlable page per category */}
            <div className="grid gap-3 sm:gap-4" style={{ gridTemplateColumns: 'repeat(auto-fit, minmax(200px, 1fr))' }}>
              {FIX_CATEGORIES.map((cat) => (
                <a
                  key={cat}
                  href={`${fixBase}category/${cat}/`}
                  className="group flex items-center justify-between gap-3 px-4 sm:px-5 py-3.5 sm:py-4 rounded-xl border border-[var(--border)] bg-[var(--surface)] hover:bg-[var(--surface-2)] hover:border-[var(--border-strong)] transition-colors no-underline"
                >
                  <span className="text-[13.5px] sm:text-[14px] font-medium tracking-tight text-[var(--text)]">
                    {t(`catFull.${cat}`, { ns: 'validation' })}
                  </span>
                  <Icons.ArrowRight
                    size={14}
                    className="text-[var(--text-faint)] group-hover:text-[var(--accent-2)] transition-colors shrink-0"
                  />
                </a>
              ))}
            </div>

            {/* Link to the full hub (all checks), and to the model-checker pillar:
                the page the validation queries in Search Console should land on */}
            <div className="flex flex-wrap justify-center gap-3 mt-8 sm:mt-10">
              <a
                href={fixBase}
                className="inline-flex items-center gap-2 h-[38px] px-5 text-[13.5px] sm:text-[14px] font-medium rounded-[9px] border border-[var(--border-strong)] text-[var(--text)] hover:bg-[var(--surface-2)] transition-colors no-underline"
              >
                {t('fixGuides.cta')}
                <Icons.ArrowRight size={14} />
              </a>
              <a
                href={`${blogBase}ifc-model-checker/`}
                className="inline-flex items-center gap-2 h-[38px] px-5 text-[13.5px] sm:text-[14px] font-medium rounded-[9px] border border-[var(--border-strong)] text-[var(--text)] hover:bg-[var(--surface-2)] transition-colors no-underline"
              >
                {t('fixGuides.checkerCta')}
                <Icons.ArrowRight size={14} />
              </a>
            </div>
          </div>
        </section>

        {/* ── Integrations / SDK ── */}
        {(() => {
          const base = (import.meta.env.BASE_URL ?? '/').replace(/\/$/, '')
          const sdkDocsHref = `${base}/sdk/`
          const embedBuilderHref = `${base}/embed/`
          const snippet =
`<div id="viewer" style="height:520px"></div>
<script type="module">
  import { IfcViewer } from "${base}/sdk/ifc-viewer.es.js";

  // Mount the viewer in your page
  const viewer = new IfcViewer("#viewer");

  // Load IFC bytes from your app or CDE — nothing is uploaded
  await viewer.add("project.ifc", ifcBytes);
</script>`
          return (
        <section
          id="integrations"
          className="border-t border-[var(--border)] py-14 sm:py-[90px] px-4 sm:px-7"
          aria-labelledby="integrations-heading"
        >
          <div className="max-w-[1100px] mx-auto grid lg:grid-cols-2 gap-8 lg:gap-12 items-center">
            {/* Left — pitch */}
            <div>
              <div className="text-[13px] text-[var(--accent-2)] font-medium mb-2.5">
                {t('sdk.label')}
              </div>
              <h2
                id="integrations-heading"
                className="font-semibold tracking-[-0.03em] mb-3 sm:mb-4"
                style={{ fontSize: 'clamp(20px, 5vw, 30px)' }}
              >
                {t('sdk.title')}
              </h2>
              <p className="text-[13.5px] sm:text-[15px] text-[var(--text-dim)] leading-[1.55] mb-5 max-w-[520px]">
                {t('sdk.body')}
              </p>
              <ul className="flex flex-col gap-2 mb-7 list-none p-0">
                {/* The fourth is new: a host can now limit which tools the
                    embedded viewer offers, per audience, from the URL or the
                    SDK. It is an integration capability rather than a viewer
                    feature, which is why it belongs in this section. */}
                {[t('sdk.b1'), t('sdk.b2'), t('sdk.b3'), t('sdk.b4')].map((b, i) => (
                  <li key={i} className="flex items-center gap-2.5 text-[13.5px] text-[var(--text-dim)]">
                    <span className="text-[var(--ok)] shrink-0"><Icons.Check size={15} /></span>
                    {b}
                  </li>
                ))}
              </ul>
              <div className="flex gap-3 flex-wrap">
                <a
                  href={embedBuilderHref}
                  target="_blank" rel="noopener noreferrer"
                  className="inline-flex items-center gap-2 h-[38px] px-4 sm:px-5 text-[13.5px] sm:text-[14px] font-medium rounded-[9px] bg-[var(--accent)] text-white hover:brightness-110 transition-all no-underline"
                >
                  {t('sdk.explore')}
                  <Icons.ArrowRight size={14} />
                </a>
                <a
                  href={sdkDocsHref}
                  target="_blank" rel="noopener noreferrer"
                  className="inline-flex items-center gap-2 h-[38px] px-4 sm:px-5 text-[13.5px] sm:text-[14px] font-medium rounded-[9px] border border-[var(--border-strong)] text-[var(--text)] hover:bg-[var(--surface-2)] transition-colors no-underline"
                >
                  {t('sdk.docs')}
                </a>
              </div>
            </div>

            {/* Right — code snippet */}
            <div className="rounded-2xl border border-[var(--border)] bg-[var(--surface)] overflow-hidden">
              <div className="flex items-center gap-1.5 px-4 h-9 border-b border-[var(--border)]">
                <span className="ml-2 text-[13px] font-mono text-[var(--text-faint)]">index.html</span>
              </div>
              <pre className="m-0 p-4 overflow-x-auto text-[13px] leading-[1.6] font-mono text-[var(--text-dim)]">
{snippet}
              </pre>
            </div>
          </div>
        </section>
          )
        })()}

        {/* ── Open source callout ── */}
        <section
          className="border-t border-[var(--border)] py-10 sm:py-[60px] px-4 sm:px-7"
          aria-labelledby="opensource-heading"
        >
          <div className="max-w-[760px] mx-auto text-center">
            {/* Light mode: inner card with border + shadow */}
            {landingTheme === 'light' && (
              <div
                className="relative mx-auto mb-8 sm:mb-10 rounded-2xl border border-[color-mix(in_srgb,var(--accent)_18%,transparent)] overflow-hidden"
                style={{
                  background: 'var(--surface)',
                  boxShadow: '0 1px 3px color-mix(in srgb, var(--text) 8%, transparent)',
                  backdropFilter: 'blur(8px)',
                  padding: 'clamp(28px, 5vw, 52px)',
                }}
              >
                <div className="relative">
                  <div className="text-[13px] text-[var(--accent-2)] font-medium mb-2 sm:mb-2.5">
                    {t('openSource.label')}
                  </div>
                  <h2
                    id="opensource-heading"
                    className="font-semibold tracking-[-0.03em] mb-3 sm:mb-4"
                    style={{ fontSize: 'clamp(20px, 5.5vw, 32px)' }}
                  >
                    {t('openSource.title')}
                  </h2>
                  <p className="text-[13.5px] sm:text-[15px] text-[var(--text-dim)] leading-[1.55] mb-6 sm:mb-7 max-w-[540px] mx-auto">
                    {t('openSource.body')}
                  </p>
                  <div className="flex gap-3 justify-center flex-wrap">
                    <a
                      href={GITHUB_URL}
                      target="_blank" rel="noopener noreferrer"
                      className="inline-flex items-center gap-2 h-[38px] px-4 sm:px-5 text-[13.5px] sm:text-[14px] font-medium rounded-[9px] border border-[var(--border-strong)] text-[var(--text)] hover:bg-[color-mix(in_srgb,var(--accent)_6%,transparent)] transition-colors no-underline"
                      aria-label="View source code on GitHub"
                    >
                      {GITHUB_SVG}
                      {t('actions.viewSourceOnGithub')}
                    </a>
                  </div>
                </div>
              </div>
            )}

            {/* Dark mode: original layout */}
            {landingTheme === 'dark' && (
              <>
                <div className="text-[13px] text-[var(--accent-2)] font-medium mb-2 sm:mb-2.5">
                  {t('openSource.label')}
                </div>
                <h2
                  id="opensource-heading"
                  className="font-semibold tracking-[-0.03em] mb-3 sm:mb-4"
                  style={{ fontSize: 'clamp(20px, 5.5vw, 32px)' }}
                >
                  {t('openSource.title')}
                </h2>
                <p className="text-[13.5px] sm:text-[15px] text-[var(--text-dim)] leading-[1.55] mb-6 sm:mb-7 max-w-[540px] mx-auto">
                  {t('openSource.body')}
                </p>
                <div className="flex gap-3 justify-center flex-wrap">
                  <a
                    href={GITHUB_URL}
                    target="_blank" rel="noopener noreferrer"
                    className="inline-flex items-center gap-2 h-[38px] px-4 sm:px-5 text-[13.5px] sm:text-[14px] font-medium rounded-[9px] border border-[var(--border-strong)] text-[var(--text)] hover:bg-[var(--surface-2)] transition-colors no-underline"
                    aria-label="View source code on GitHub"
                  >
                    {GITHUB_SVG}
                    {t('actions.viewSourceOnGithub')}
                  </a>
                </div>
              </>
            )}
          </div>
        </section>

        {/* ── FAQ ── */}
        <section
          id="faq"
          className="border-t border-[var(--border)] py-12 sm:py-[90px] px-4 sm:px-7"
          aria-labelledby="faq-heading"
          itemScope
          itemType="https://schema.org/FAQPage"
        >
          <div className="max-w-[760px] mx-auto">
            <h2
              id="faq-heading"
              className="font-semibold tracking-[-0.03em] mb-6 sm:mb-8 text-center"
              style={{ fontSize: 'clamp(22px, 6vw, 36px)' }}
            >
              {t('faqSection.title')}
            </h2>
            {FAQ.map((f, i) => <FAQItem key={i} q={f.q} a={f.a} />)}
          </div>
        </section>

        {/* ── Final CTA ── */}
        <section
          className="border-t border-[var(--border)] py-14 sm:py-20 px-4 sm:px-7 text-center"
          style={{ position: 'relative', overflow: 'hidden', minHeight: '300px' }}
        >
          <div
            style={{ position: 'relative', zIndex: 1 }}
            className="mx-auto max-w-[680px]"
          >
            <h2
              className="font-semibold tracking-[-0.03em] mb-3 sm:mb-4"
              style={{ fontSize: 'clamp(28px, 8vw, 48px)' }}
            >
              {t('finalCta.title')}
            </h2>

            <p
              className="text-[14px] sm:text-[16px] text-[var(--text-dim)] mb-2 sm:mb-3"
            >
              {t('finalCta.subtitle')}
            </p>

            <p
              className="text-[13px] text-[var(--text-faint)] mb-7 sm:mb-8"
            >
              {t('finalCta.githubLine')}{' '}
              <a
                href={GITHUB_URL}
                target="_blank" rel="noopener noreferrer"
                className="text-[var(--accent-2)] hover:underline"
              >
                GitHub
              </a>
            </p>

            <div
              className="flex flex-col items-center gap-3"
            >
              <button type="button" onClick={onOpenUpload} className="inline-flex items-center gap-2 h-11 px-5 rounded-[10px] bg-[var(--accent)] text-white font-semibold hover:brightness-110 active:brightness-95 transition-[filter] cursor-pointer">
                <span className="inline-flex items-center gap-2 text-[14px] sm:text-[15px] font-medium">
                  <Icons.Upload size={15} />
                  {t('actions.openAnIfc')}
                </span>
              </button>
              <button
                onClick={onOpenDemoGallery}
                className="text-[13px] text-[var(--text-faint)] hover:text-[var(--accent-2)] transition-colors cursor-pointer underline-offset-2 hover:underline"
              >
                {t('demoGallery.openCta')} →
              </button>
            </div>

            {/* ── Email capture ── */}
            <div
              className="mt-10 sm:mt-12 pt-8 sm:pt-10 border-t border-[var(--border)]"
            >
              <div className="relative mx-auto -mt-2 mb-1 w-[96px] h-[96px]">
                <BimoMascot variant="inline" className="absolute inset-0" greetingKey="newsPrompt" bubble="right" mood={bimoMood} />
              </div>
              {emailStatus === 'success' ? (
                <div className="flex flex-col items-center gap-2 text-center">
                  <svg width="28" height="28" viewBox="0 0 28 28" fill="none">
                    <circle cx="14" cy="14" r="12" stroke="var(--ok)" strokeWidth="1.5" opacity="0.5" />
                    <path d="M8 14l4 4 8-8" stroke="var(--ok)" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />
                  </svg>
                  <p className="text-[13px] font-medium" style={{ color: 'var(--ok)' }}>
                    {te('successTitle')}
                  </p>
                  <p className="text-[13px] text-[var(--text-faint)]">
                    {te('successBody')}
                  </p>
                </div>
              ) : (
                <>
                  <p className="text-[13px] text-[var(--text-dim)] text-center mb-3">
                    {te('prompt')}
                    <span className="hidden sm:inline">{te('promptSuffix')}</span>
                  </p>
                  <form
                    onSubmit={(e) => { void handleEmailSubmit(e) }}
                    className="flex gap-2 justify-center"
                  >
                    <input
                      type="email"
                      value={emailValue}
                      onChange={(e) => setEmailValue(e.target.value)}
                      placeholder={te('placeholder')}
                      required
                      disabled={emailStatus === 'loading'}
                      className="h-9 px-3 rounded-lg text-[13px] border bg-[var(--surface-2)] text-[var(--text)] placeholder:text-[var(--text-faint)] outline-none focus:border-[var(--accent)] transition-colors w-52 disabled:opacity-60"
                      style={{ borderColor: 'var(--border)' }}
                    />
                    <button
                      type="submit"
                      disabled={emailStatus === 'loading' || !emailValue.trim()}
                      className="h-9 px-4 rounded-lg text-[13px] font-semibold transition-all disabled:opacity-50"
                      style={{ background: 'var(--accent)', color: 'white' }}
                    >
                      {emailStatus === 'loading' ? '...' : te('submit')}
                    </button>
                  </form>
                  {emailStatus === 'error' && emailError && (
                    <p className="text-[13px] text-center mt-2" style={{ color: 'var(--danger)' }}>
                      {emailError}
                    </p>
                  )}
                  <p className="text-[13px] text-center mt-3 text-[var(--text-faint)] max-w-sm mx-auto leading-relaxed">
                    {te('consentBefore')}
                    <button
                      type="button"
                      onClick={onNavigateToPrivacy}
                      className="underline underline-offset-2 hover:text-[var(--accent-2)] transition-colors"
                    >
                      {te('privacyLink')}
                    </button>
                    {te('consentAfter')}
                  </p>
                </>
              )}
            </div>
          </div>
        </section>

        {/* ── Footer ── */}
        <footer className="border-t border-[var(--border)] py-5 sm:py-[26px] px-4 sm:px-7 flex flex-col sm:flex-row sm:justify-between sm:items-center gap-3 sm:gap-0 text-[13px] text-[var(--text-faint)] max-w-[1200px] mx-auto">
          <div className="flex items-center gap-2">
            <Icons.Logo size={16} aria-hidden="true" />
            <span>
              {t('footer.copyright')} —{' '}
              <a
                href="https://github.com/j03rul4nd"
                target="_blank" rel="noopener noreferrer"
                className="hover:text-[var(--text)] transition-colors no-underline"
              >
                Joel Benitez
              </a>
            </span>
          </div>
          <div className="flex gap-4 sm:gap-5 items-center flex-wrap">
            <a
              href={fixBase}
              className="hover:text-[var(--text)] transition-colors no-underline"
            >
              {t('footer.fixGuide')}
            </a>
            <a
              href={validatorHref}
              className="hover:text-[var(--text)] transition-colors no-underline"
            >
              {t('footer.validator', 'IFC Validator')}
            </a>
            <a
              href={solibriHref}
              className="hover:text-[var(--text)] transition-colors no-underline"
            >
              {t('footer.solibri', 'Solibri alternative')}
            </a>
            {/* Editor / classification / health-check landings: without a link
                from the home, static landings stay "crawled, not indexed". */}
            {toolLandings(langShort).map((l) => (
              <a
                key={l.key}
                href={`${import.meta.env.BASE_URL}${l.path}`}
                className="hover:text-[var(--text)] transition-colors no-underline"
              >
                {l.label}
              </a>
            ))}
            <a
              href={blogBase}
              onClick={(e) => { e.preventDefault(); onNavigateToBlog(langShort) }}
              className="bg-transparent border-0 p-0 text-[var(--text-faint)] text-[13px] cursor-pointer hover:text-[var(--text)] transition-colors"
            >
              Blog
            </a>
            {/* The handbook is English-only, so it is only offered on the EN landing. */}
            {langShort === 'en' && (
              <a
                href="/ebook/"
                className="hover:text-[var(--text)] transition-colors no-underline"
              >
                Free handbook
              </a>
            )}
            <a
              href={GITHUB_URL}
              target="_blank" rel="noopener noreferrer"
              className="hover:text-[var(--text)] transition-colors no-underline"
              aria-label="GitHub repository"
            >
              {t('nav.github')}
            </a>
            <button
              onClick={onNavigateToPrivacy}
              className="bg-transparent border-0 p-0 text-[var(--text-faint)] text-[13px] cursor-pointer hover:text-[var(--text)] transition-colors"
            >
              Privacy
            </button>
            <button
              onClick={onNavigateToTerms}
              className="bg-transparent border-0 p-0 text-[var(--text-faint)] text-[13px] cursor-pointer hover:text-[var(--text)] transition-colors"
            >
              Terms
            </button>
            <span className="text-[var(--text-faint)]">{t('footer.builtWith')}</span>
          </div>
        </footer>

        {/* ── Bottom safe-area spacer (iOS home indicator) ── */}
        <div style={{ height: 'env(safe-area-inset-bottom, 0px)' }} />

      </div>
    </Tooltip.Provider>
  )
}
