// ─── Landing.tsx ──────────────────────────────────────────────────────────────
// Dependencies installed / used:
//
//   Raw WebGL            – LineWaves (no OGL dependency)
//   framer-motion        – page-entry animations + ShinyText / DecryptedText / CountUp
//   gsap                 – TextType cursor blink
//   @radix-ui/react-tooltip – feature-card icon tooltips
//
// React Bits components (src/components/reactbits/):
//   LineWaves      – WebGL wave-line hero background
//   StarBorder     – animated comet-border CTA buttons
//   BorderGlow     – cursor-tracked glow border for feature / step cards
//   ShapeGrid      – scrolling square-grid canvas for final CTA background
//   GradualBlur    – stacked backdrop-blur strips at hero bottom edge
//   GradientText   – animated flowing gradient text (H1 "Online" + subtitle)
//   ShinyText      – framer-motion shimmer sweep (hero badge)
//   TextType       – gsap-cursor typewriter (hero typing tagline)
//   DecryptedText  – scramble-reveal text (section labels)
//   CountUp        – spring-animated number counter (stats strip)

import React, { useState, useCallback } from 'react'
import { motion } from 'framer-motion'
import { useTranslation } from 'react-i18next'
import { subscribeEmail } from '../lib/subscribe'
import { trackEmailCaptured } from '../lib/analytics'
import { LanguageSelectorNav } from './LanguageSelector'
import * as Tooltip from '@radix-ui/react-tooltip'
import * as Icons from './Icons'
import GradientText  from './reactbits/GradientText'
import ShinyText     from './reactbits/ShinyText'
import TextType      from './reactbits/TextType'
import DecryptedText from './reactbits/DecryptedText'
import CountUp       from './reactbits/CountUp'
import LineWaves     from './reactbits/LineWaves'
import StarBorder    from './reactbits/StarBorder'
import BorderGlow    from './reactbits/BorderGlow'
import ShapeGrid     from './reactbits/ShapeGrid'
import GradualBlur   from './reactbits/GradualBlur'

interface LandingProps {
  onLaunch: () => void
  // Opens the upload overlay so the user can pick their own IFC file.
  // Used by "Open an IFC file" CTAs. onLaunch is kept for nav-bar buttons
  // that demo the app by loading the bundled sample file.
  onOpenUpload: () => void
}

// ── Design tokens ─────────────────────────────────────────────────────────────
const GRADIENT_HERO    = ['#5E6AD2', '#A78BFA', '#6FB8D9', '#5E6AD2'] as const
const GRADIENT_SUBTEXT = ['#5E6AD2', '#A78BFA', '#6FB8D9', '#5E6AD2'] as const

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
        <motion.div
          initial={{ opacity: 0, height: 0 }}
          animate={{ opacity: 1, height: 'auto' }}
          exit={{ opacity: 0, height: 0 }}
          className="pb-4 text-[13px] sm:text-[13.5px] text-[var(--text-dim)] leading-relaxed"
          itemScope itemType="https://schema.org/Answer"
        >
          <span itemProp="text">{a}</span>
        </motion.div>
      )}
    </div>
  )
}

// ── Hero preview card ─────────────────────────────────────────────────────────
function HeroPreview() {
  return (
    <div className="relative bg-[var(--bg)] flex overflow-hidden">
      {/* 3D render — always shown */}
      <div className="flex-1 relative overflow-hidden bg-black min-w-0">
        <img
          src={`${import.meta.env.BASE_URL}Renderizado_3D_detallado_de_edificio_modular.png`}
          alt="IFC building model rendered in browser — multi-storey modular structure with walls, windows, and structural elements highlighted by category"
          className="w-full h-auto block"
          loading="lazy"
        />
        {/* Element tooltip — smaller on mobile */}
        <div className="absolute top-[46%] right-[4%] bg-[rgba(16,16,20,0.92)] border border-[var(--border-strong)] rounded-lg px-2 sm:px-3 py-1.5 sm:py-2 text-[10px] sm:text-[11.5px] backdrop-blur-md">
          <div className="font-mono text-[9px] sm:text-[10px] text-[var(--accent-2)] mb-0.5">IfcWall</div>
          <div className="font-medium">Exterior — 300mm</div>
          <div className="text-[var(--text-dim)] text-[9px] sm:text-[10.5px] mt-0.5">REI 60 · Load bearing</div>
        </div>
      </div>

      {/* Validation panel mock — hidden on narrow screens */}
      <div className="hidden sm:flex w-[220px] md:w-[260px] border-l border-[var(--border)] bg-[var(--surface)] flex-col shrink-0 overflow-hidden" aria-label="Validation panel preview">
        {/* Panel header */}
        <div className="px-3 py-2.5 border-b border-[var(--border)] flex items-center justify-between bg-[var(--surface-2)]">
          <span className="font-mono text-[10px] text-[var(--text-faint)] tracking-[0.1em]">VALIDATION</span>
          <div className="flex items-center gap-1.5">
            <div className="w-1.5 h-1.5 rounded-full bg-[var(--ok)]" aria-hidden="true" />
            <span className="text-[12px] font-semibold" style={{ color: 'var(--ok)' }}>87 / 100</span>
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
            <div key={i} className="flex items-start gap-2 px-2 py-1.5 rounded-[6px] bg-[var(--surface-2)] text-[10.5px]">
              <div className="w-1.5 h-1.5 rounded-full shrink-0 mt-[3px]" style={{ background: row.dot }} />
              <span className="text-[var(--text-dim)] leading-tight truncate">{row.label}</span>
            </div>
          ))}
        </div>

        {/* Score bar */}
        <div className="px-3 py-2.5 border-t border-[var(--border)]" aria-hidden="true">
          <div className="flex justify-between text-[9.5px] text-[var(--text-faint)] mb-1.5">
            <span>Health Score</span>
            <span className="font-semibold" style={{ color: 'var(--ok)' }}>87</span>
          </div>
          <div className="h-[3px] bg-[var(--border)] rounded-full overflow-hidden">
            <div className="h-full rounded-full" style={{ width: '87%', background: 'var(--ok)' }} />
          </div>
          <div className="text-[9px] text-[var(--text-faint)] mt-1.5">Processed in-browser · 0 uploads</div>
        </div>
      </div>
    </div>
  )
}

// ── Animation helpers ─────────────────────────────────────────────────────────
const fadeUp = { hidden: { opacity: 0, y: 16 }, show: { opacity: 1, y: 0 } }

// ── Feature icon map (static — icons don't need i18n) ─────────────────────────
// Order mirrors the features array in locales: validator, multi-model, drag&drop,
// OPFS cache, editing, QTO, measurements, floor plans, export, schemas, renderer, indexer.
const FEATURE_ICONS = [
  Icons.Sparkles, Icons.Layers,   Icons.Upload,   Icons.Zap,
  Icons.Ruler,    Icons.Building, Icons.Ruler,    Icons.Building,
  Icons.Upload,   Icons.Zap,      Icons.Sparkles, Icons.Layers,
] as const

// ── Main component ────────────────────────────────────────────────────────────
export default function Landing({ onLaunch, onOpenUpload }: LandingProps) {
  const { t, i18n } = useTranslation('landing')

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

  const handleEmailSubmit = useCallback(async (e: React.FormEvent) => {
    e.preventDefault()
    const email = emailValue.trim()
    if (!email) return
    setEmailStatus('loading')
    setEmailError('')
    const result = await subscribeEmail(email, 'landing_footer', i18n.language)
    if (result.ok || result.already) {
      setEmailStatus('success')
      trackEmailCaptured({ source: 'landing_footer', already_subscribed: !!result.already, locale: i18n.language })
    } else if (result.disabled) {
      // Worker not yet deployed — silently succeed in dev, show message in prod
      if (import.meta.env.DEV) setEmailStatus('success')
      else { setEmailStatus('error'); setEmailError('Not available yet — try again soon.') }
    } else {
      setEmailStatus('error')
      setEmailError(result.error ?? 'Something went wrong. Try again.')
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
    features: t('features', { returnObjects: true }),
    typing:   t('typing',   { returnObjects: true }),
    stats:    t('stats',    { returnObjects: true }),
    steps:    t('steps',    { returnObjects: true }),
    faq:      t('faq',      { returnObjects: true }),
  }

  const FEATURES = (Array.isArray(raw.features) ? raw.features as Array<{ title: string; body: string; tip: string }> : [])
    .map((f, i) => ({ ...f, icon: FEATURE_ICONS[i] ?? Icons.Upload }))

  const TYPING_TEXTS = Array.isArray(raw.typing) ? raw.typing as string[] : []
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
      <div className="landing-scroll absolute inset-0 overflow-auto bg-[var(--bg)] text-[var(--text)]">

        {/* ── LineWaves hero background (z-0) — disabled on small screens for perf ── */}
        <div
          className="hidden sm:block absolute left-0 right-0 top-0 overflow-hidden pointer-events-none"
          style={{ height: '100vh', zIndex: 0 }}
          aria-hidden="true"
        >
          <LineWaves
            speed={0.15}
            innerLineCount={14}
            outerLineCount={18}
            warpIntensity={0.6}
            rotation={-30}
            edgeFadeWidth={0.15}
            colorCycleSpeed={0.0}
            brightness={0.07}
            color1="#5E6AD2"
            color2="#8B93E8"
            color3="#4a5280"
            enableMouseInteraction={false}
            mouseInfluence={0.8}
          />
        </div>

        {/* Grid bg */}
        <div
          className="grid-bg absolute inset-0 pointer-events-none"
          style={{
            maskImage: 'radial-gradient(ellipse at 50% 0%, black 30%, transparent 75%)',
            zIndex: 1,
          }}
        />

        {/* ── Nav ── */}
        <nav
          className="relative max-w-[1200px] mx-auto px-4 sm:px-7 py-4 sm:py-[22px] flex items-center justify-between"
          style={{ zIndex: 3 }}
          aria-label="Main navigation"
        >
          {/* Logo */}
          <div className="flex items-center gap-2 sm:gap-2.5">
            <Icons.Logo size={22} aria-hidden="true" />
            <span className="text-[14px] sm:text-[15px] font-semibold tracking-tight">IFC Viewer</span>
          </div>

          {/* Desktop nav links */}
          <div className="hidden md:flex items-center gap-5 text-[13px] text-[var(--text-dim)]">
            <a href="#features" className="text-inherit no-underline hover:text-[var(--text)] transition-colors">{t('nav.features')}</a>
            <a href="#how"      className="text-inherit no-underline hover:text-[var(--text)] transition-colors">{t('nav.howItWorks')}</a>
            <a href="#faq"      className="text-inherit no-underline hover:text-[var(--text)] transition-colors">{t('nav.faq')}</a>
            <a href={GITHUB_URL} target="_blank" rel="noopener noreferrer"
              className="text-inherit no-underline hover:text-[var(--text)] transition-colors"
              aria-label="View source code on GitHub"
            >
              {t('nav.github')}
            </a>
            <LanguageSelectorNav />
            <button
              onClick={onLaunch}
              className="inline-flex items-center gap-2 h-[30px] px-3 text-[13px] font-medium rounded-[9px] bg-[var(--accent)] text-white hover:brightness-110 active:brightness-90 transition-all cursor-pointer"
            >
              <Icons.ArrowRight size={14} />
              {t('actions.openViewer')}
            </button>
          </div>

          {/* Mobile: GitHub icon + language selector + primary CTA */}
          <div className="flex md:hidden items-center gap-2">
            <a href={GITHUB_URL} target="_blank" rel="noopener noreferrer"
              className="w-9 h-9 flex items-center justify-center rounded-lg text-[var(--text-dim)] hover:text-[var(--text)] transition-colors"
              aria-label="GitHub repository"
            >
              {GITHUB_SVG}
            </a>
            <LanguageSelectorNav />
            <button
              onClick={onLaunch}
              className="inline-flex items-center gap-1.5 h-9 px-3.5 text-[13px] font-semibold rounded-[9px] bg-[var(--accent)] text-white active:brightness-90 cursor-pointer"
            >
              {t('actions.launch')}
            </button>
          </div>
        </nav>

        {/* ── Hero ── */}
        <header
          className="relative max-w-[1100px] mx-auto px-4 sm:px-7 pt-10 sm:pt-[70px] pb-10 sm:pb-[60px] text-center"
          style={{ zIndex: 2 }}
        >
          {/* Badge */}
          <motion.div variants={fadeUp} initial="hidden" animate="show" transition={{ duration: 0.5 }}>
            <div className="inline-flex items-center gap-2 px-2.5 sm:px-3 py-1 rounded-full border border-[var(--border)] bg-[var(--surface)] text-[11px] sm:text-[12px] text-[var(--text-dim)] mb-5 sm:mb-7 max-w-full overflow-hidden">
              <span className="px-1.5 sm:px-2 py-0.5 rounded-full bg-[rgba(94,106,210,0.15)] text-[var(--accent-2)] text-[10px] sm:text-[10.5px] font-semibold font-mono tracking-wider shrink-0">
                FREE
              </span>
              {/* Shortened text on mobile */}
              <span className="sm:hidden text-[11px] text-[var(--text-dim)] truncate">
                {t('hero.badgeMobile')}
              </span>
              <span className="hidden sm:inline">
                <ShinyText
                  text={t('hero.badge')}
                  speed={6}
                  color="var(--text-dim)"
                  shineColor="var(--text)"
                  spread={100}
                />
              </span>
              <Icons.ArrowRight size={11} aria-hidden="true" className="shrink-0" />
            </div>
          </motion.div>

          {/* H1 */}
          <motion.h1
            variants={fadeUp}
            initial="hidden"
            animate="show"
            transition={{ duration: 0.5, delay: 0.1 }}
            className="font-semibold tracking-[-0.035em] leading-[1.04] mb-4 sm:mb-5 max-w-[900px] mx-auto"
            style={{ fontSize: 'clamp(36px, 9vw, 82px)' }}
          >
            IFC Viewer{' '}
            <span className="font-serif italic font-normal">
              <GradientText colors={[...GRADIENT_HERO]} animationSpeed={6}>
                Online
              </GradientText>
            </span>
          </motion.h1>

          {/* TextType cycling tagline */}
          <motion.div
            variants={fadeUp} initial="hidden" animate="show" transition={{ duration: 0.5, delay: 0.18 }}
            className="font-mono tracking-[-0.01em] mb-3 sm:mb-4 flex justify-center items-center"
            style={{ fontSize: 'clamp(11px, 3.5vw, 16px)', minHeight: '22px' }}
            aria-hidden="true"
          >
            <TextType
              key={i18n.language}
              text={TYPING_TEXTS}
              typingSpeed={52}
              deletingSpeed={26}
              pauseDuration={1800}
              showCursor
              cursorCharacter="_"
              cursorClassName="text-[var(--accent)]"
              className="text-[var(--text-dim)]"
            />
          </motion.div>

          {/* Subtitle */}
          <motion.p
            variants={fadeUp} initial="hidden" animate="show" transition={{ duration: 0.5, delay: 0.2 }}
            className="text-[var(--text-dim)] leading-[1.5] sm:leading-[1.45] max-w-[700px] mx-auto tracking-[-0.005em]"
            style={{ fontSize: 'clamp(14px, 3.5vw, 19px)' }}
          >
            {t('hero.subtitleFull')}
          </motion.p>

          {/* CTA row */}
          <motion.div
            variants={fadeUp} initial="hidden" animate="show" transition={{ duration: 0.5, delay: 0.3 }}
            className="flex gap-3 justify-center mt-7 sm:mt-8 flex-wrap"
          >
            <StarBorder
              as="button"
              color="rgba(94,106,210,0.9)"
              speed="5s"
              thickness={1}
              onClick={onOpenUpload}
              className="cursor-pointer"
            >
              <span className="inline-flex items-center gap-2 text-[13px] sm:text-[14px] font-medium">
                <Icons.Upload size={14} />
                {t('actions.openAnIfc')}
              </span>
            </StarBorder>

            <a
              href={GITHUB_URL}
              target="_blank" rel="noopener noreferrer"
              className="inline-flex items-center gap-2 h-[38px] px-4 text-[13px] sm:text-[14px] font-medium rounded-[9px] border border-[var(--border-strong)] text-[var(--text)] hover:bg-[var(--surface-2)] transition-colors no-underline"
              aria-label="View source code on GitHub"
            >
              {GITHUB_SVG}
              {t('actions.viewOnGithub')}
            </a>
          </motion.div>

          {/* Trust line */}
          <motion.div
            variants={fadeUp} initial="hidden" animate="show" transition={{ duration: 0.5, delay: 0.35 }}
            className="mt-4 text-[10.5px] sm:text-[11.5px] text-[var(--text-faint)]"
          >
            <span className="hidden sm:inline">{t('hero.trustLine')}</span>
            <span className="sm:hidden">{t('hero.trustLineMobile')}</span>
          </motion.div>

          {/* Demo model link — captures users who don't have an IFC at hand */}
          <motion.div
            variants={fadeUp} initial="hidden" animate="show" transition={{ duration: 0.5, delay: 0.4 }}
            className="mt-3"
          >
            <button
              onClick={onLaunch}
              className="text-[11px] sm:text-[12px] text-[var(--text-faint)] hover:text-[var(--accent-2)] transition-colors cursor-pointer underline-offset-2 hover:underline"
            >
              {t('actions.loadDemo')} →
            </button>
          </motion.div>

          {/* Hero card */}
          <motion.div
            initial={{ opacity: 0, y: 24 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.7, delay: 0.45, ease: 'easeOut' }}
            className="relative mt-10 sm:mt-14 rounded-xl sm:rounded-2xl overflow-hidden border border-[var(--border-strong)] bg-[var(--surface)] shadow-[0_40px_90px_-30px_rgba(94,106,210,0.3)]"
            aria-label="Application preview"
          >
            {/* Mock browser bar */}
            <div className="px-2 sm:px-3 py-1.5 sm:py-2 border-b border-[var(--border)] bg-[var(--surface-2)] flex items-center gap-2">
              <div className="flex gap-1 sm:gap-1.5" aria-hidden="true">
                <div className="w-2 sm:w-2.5 h-2 sm:h-2.5 rounded-full bg-[#FF5F57]" />
                <div className="w-2 sm:w-2.5 h-2 sm:h-2.5 rounded-full bg-[#FEBC2E]" />
                <div className="w-2 sm:w-2.5 h-2 sm:h-2.5 rounded-full bg-[#28C840]" />
              </div>
              <div className="flex-1 text-center text-[10px] sm:text-[11.5px] text-[var(--text-faint)] font-mono truncate px-2">
                IFC Viewer Online
              </div>
            </div>
            <HeroPreview />
          </motion.div>

          {/* Gradual blur at the hero bottom edge */}
          <GradualBlur
            position="bottom"
            height="4rem"
            strength={1.5}
            divCount={5}
            curve="ease-out"
            target="parent"
            zIndex={3}
          />
        </header>

        {/* ── Compatible strip ── */}
        <section
          className="border-t border-b border-[var(--border)] py-5 sm:py-[26px] px-4 sm:px-7 text-center"
          style={{ zIndex: 2, position: 'relative' }}
          aria-label="Supported BIM authoring tools"
        >
          <div className="text-[10.5px] sm:text-[11.5px] text-[var(--text-faint)] mb-3 sm:mb-4 tracking-[0.08em] uppercase">
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
          style={{ zIndex: 2, position: 'relative' }}
          aria-label="Key statistics"
        >
          <div className="max-w-[900px] mx-auto grid grid-cols-2 gap-y-8 sm:gap-y-10 gap-x-4 sm:gap-x-6 sm:grid-cols-4">
            {[
              { to: 38,  suffix: '+', stiffness: 70,  numCls: '' },
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
                labelClassName="text-[11.5px] sm:text-[13px] text-[var(--text-faint)] mt-1 tracking-[0.02em]"
              />
            ))}
          </div>
        </section>

        {/* ── Features ── */}
        <section id="features" className="max-w-[1200px] mx-auto px-4 sm:px-7 py-14 sm:py-[90px]" aria-labelledby="features-heading">
          <div className="text-center mb-10 sm:mb-[60px]">
            <div className="text-[11px] sm:text-[12px] text-[var(--accent-2)] tracking-[0.1em] font-mono mb-2 sm:mb-2.5">
              <DecryptedText
                text={t('featuresSection.label')}
                animateOn="view"
                sequential
                revealDirection="start"
                speed={60}
                className="text-[var(--accent-2)]"
                encryptedClassName="text-[var(--text-faint)]"
              />
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
            className="grid gap-px bg-[var(--border)] border border-[var(--border)] rounded-xl sm:rounded-2xl overflow-hidden"
            style={{ gridTemplateColumns: 'repeat(auto-fit, minmax(260px, 1fr))' }}
          >
            {FEATURES.map((f, i) => (
              <BorderGlow
                key={i}
                backgroundColor="#18181f"
                borderRadius={0}
                glowColor="94 106 210"
                glowRadius={30}
                glowIntensity={0.6}
                coneSpread={20}
                colors={['#5E6AD2', '#8B93E8', '#3B82F6']}
                className="w-full"
              >
                <motion.div
                  variants={fadeUp}
                  initial="hidden"
                  whileInView="show"
                  viewport={{ once: true }}
                  transition={{ delay: i * 0.05 }}
                  className="p-5 sm:p-7 h-full bg-[var(--surface)] hover:bg-[var(--surface-2)] transition-colors"
                >
                  <Tooltip.Root>
                    <Tooltip.Trigger asChild>
                      <div
                        className="w-[30px] sm:w-[34px] h-[30px] sm:h-[34px] rounded-lg bg-[rgba(94,106,210,0.12)] text-[var(--accent-2)] flex items-center justify-center mb-3 sm:mb-4 cursor-default"
                        aria-hidden="true"
                      >
                        <f.icon size={15} />
                      </div>
                    </Tooltip.Trigger>
                    <Tooltip.Portal>
                      <Tooltip.Content
                        side="top"
                        sideOffset={6}
                        className="px-2.5 py-1.5 rounded-lg text-[11px] font-medium bg-[var(--surface)] border border-[var(--border)] text-[var(--text-dim)] shadow-xl backdrop-blur-sm z-50 select-none"
                      >
                        {f.tip}
                        <Tooltip.Arrow className="fill-[var(--border)]" />
                      </Tooltip.Content>
                    </Tooltip.Portal>
                  </Tooltip.Root>

                  <div className="text-[14px] sm:text-[15px] font-semibold tracking-tight mb-1.5">
                    <DecryptedText
                      text={f.title}
                      animateOn="hover"
                      speed={35}
                      maxIterations={8}
                      className="text-[var(--text)]"
                      encryptedClassName="text-[var(--text-faint)]"
                    />
                  </div>
                  <div className="text-[12.5px] sm:text-[13px] text-[var(--text-dim)] leading-[1.55]">{f.body}</div>
                </motion.div>
              </BorderGlow>
            ))}
          </div>
        </section>

        {/* ── How it works ── */}
        <section id="how" className="border-t border-[var(--border)] py-14 sm:py-[90px] px-4 sm:px-7" aria-labelledby="how-heading">
          <div className="max-w-[1200px] mx-auto">
            <div className="text-center mb-10 sm:mb-[60px]">
              <div className="text-[11px] sm:text-[12px] text-[var(--accent-2)] tracking-[0.1em] font-mono mb-2 sm:mb-2.5">
                <DecryptedText
                  text={t('howItWorksSection.label')}
                  animateOn="view"
                  sequential
                  revealDirection="start"
                  speed={55}
                  className="text-[var(--accent-2)]"
                  encryptedClassName="text-[var(--text-faint)]"
                />
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
                <BorderGlow
                  key={i}
                  backgroundColor="#18181f"
                  borderRadius={12}
                  glowColor="94 106 210"
                  glowRadius={25}
                  glowIntensity={0.5}
                  coneSpread={18}
                  colors={['#5E6AD2', '#A78BFA', '#6FB8D9']}
                  className="w-full"
                >
                  <motion.div
                    variants={fadeUp}
                    initial="hidden"
                    whileInView="show"
                    viewport={{ once: true }}
                    transition={{ delay: i * 0.08 }}
                    className="p-5 sm:p-[26px]"
                  >
                    <div
                      className="font-serif text-[24px] sm:text-[28px] font-normal mb-3 tracking-tight"
                      style={{ color: 'var(--accent-2)' }}
                      aria-hidden="true"
                    >
                      {s.n}
                    </div>
                    <div className="text-[15px] sm:text-[16px] font-semibold tracking-tight mb-2">{s.title}</div>
                    <div className="text-[12.5px] sm:text-[13px] text-[var(--text-dim)] leading-[1.55]">{s.body}</div>
                  </motion.div>
                </BorderGlow>
              ))}
            </div>
          </div>
        </section>

        {/* ── Open source callout ── */}
        <section className="border-t border-[var(--border)] py-10 sm:py-[60px] px-4 sm:px-7" aria-labelledby="opensource-heading">
          <div className="max-w-[760px] mx-auto text-center">
            <div className="text-[11px] sm:text-[12px] text-[var(--accent-2)] tracking-[0.1em] font-mono mb-2 sm:mb-2.5">
              <DecryptedText
                text={t('openSource.label')}
                animateOn="view"
                sequential
                revealDirection="center"
                speed={55}
                className="text-[var(--accent-2)]"
                encryptedClassName="text-[var(--text-faint)]"
              />
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
              <a
                href="mailto:joelbenitezdonari@gmail.com"
                className="inline-flex items-center gap-2 h-[38px] px-4 sm:px-5 text-[13.5px] sm:text-[14px] font-medium rounded-[9px] bg-[var(--accent)] text-white hover:brightness-110 transition-all no-underline"
                aria-label="Contact for custom BIM development"
              >
                {t('actions.contactForWork')}
              </a>
            </div>
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

        {/* ── Final CTA — ShapeGrid background ── */}
        <section
          className="border-t border-[var(--border)] py-14 sm:py-20 px-4 sm:px-7 text-center"
          style={{ position: 'relative', overflow: 'hidden', minHeight: '300px' }}
        >
          <div className="absolute inset-0 hidden sm:block" aria-hidden="true">
            <ShapeGrid
              direction="diagonal"
              speed={0.3}
              borderColor="rgba(94,106,210,0.08)"
              squareSize={48}
              hoverFillColor="rgba(94,106,210,0.06)"
              shape="square"
              hoverTrailAmount={3}
            />
          </div>

          <div style={{ position: 'relative', zIndex: 1 }}>
            <motion.h2
              variants={fadeUp} initial="hidden" whileInView="show" viewport={{ once: true }}
              className="font-semibold tracking-[-0.03em] mb-3 sm:mb-4"
              style={{ fontSize: 'clamp(28px, 8vw, 48px)' }}
            >
              {t('finalCta.title')}
            </motion.h2>

            <motion.p
              variants={fadeUp} initial="hidden" whileInView="show" viewport={{ once: true }}
              transition={{ delay: 0.08 }}
              className="text-[14px] sm:text-[16px] text-[var(--text-dim)] mb-2 sm:mb-3"
            >
              {t('finalCta.subtitle')}
            </motion.p>

            <motion.p
              variants={fadeUp} initial="hidden" whileInView="show" viewport={{ once: true }}
              transition={{ delay: 0.12 }}
              className="text-[12px] sm:text-[13px] text-[var(--text-faint)] mb-7 sm:mb-8"
            >
              {t('finalCta.githubLine')}{' '}
              <a
                href={GITHUB_URL}
                target="_blank" rel="noopener noreferrer"
                className="text-[var(--accent-2)] hover:underline"
              >
                GitHub
              </a>
            </motion.p>

            <motion.div
              variants={fadeUp} initial="hidden" whileInView="show" viewport={{ once: true }}
              transition={{ delay: 0.16 }}
              className="flex flex-col items-center gap-3"
            >
              <StarBorder
                as="button"
                color="rgba(94,106,210,0.9)"
                speed="4s"
                thickness={1}
                onClick={onOpenUpload}
                className="cursor-pointer"
              >
                <span className="inline-flex items-center gap-2 text-[14px] sm:text-[15px] font-medium">
                  <Icons.Upload size={15} />
                  {t('actions.openAnIfc')}
                </span>
              </StarBorder>
              <button
                onClick={onLaunch}
                className="text-[12px] text-[var(--text-faint)] hover:text-[var(--accent-2)] transition-colors cursor-pointer underline-offset-2 hover:underline"
              >
                {t('actions.loadDemo')} →
              </button>
            </motion.div>

            {/* ── Email capture ── */}
            <motion.div
              variants={fadeUp} initial="hidden" whileInView="show" viewport={{ once: true }}
              transition={{ delay: 0.24 }}
              className="mt-10 sm:mt-12 pt-8 sm:pt-10 border-t border-[var(--border)]"
            >
              {emailStatus === 'success' ? (
                <div className="flex flex-col items-center gap-2 text-center">
                  <svg width="28" height="28" viewBox="0 0 28 28" fill="none">
                    <circle cx="14" cy="14" r="12" stroke="var(--ok)" strokeWidth="1.5" opacity="0.5" />
                    <path d="M8 14l4 4 8-8" stroke="var(--ok)" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />
                  </svg>
                  <p className="text-[13px] font-medium" style={{ color: 'var(--ok)' }}>
                    You&apos;re on the list
                  </p>
                  <p className="text-[11px] text-[var(--text-faint)]">
                    We&apos;ll let you know when new features ship — no spam, unsubscribe anytime.
                  </p>
                </div>
              ) : (
                <>
                  <p className="text-[12px] sm:text-[13px] text-[var(--text-dim)] text-center mb-3">
                    Get notified when new features ship
                    <span className="hidden sm:inline"> — no spam, unsubscribe anytime</span>
                  </p>
                  <form
                    onSubmit={(e) => { void handleEmailSubmit(e) }}
                    className="flex gap-2 justify-center"
                  >
                    <input
                      type="email"
                      value={emailValue}
                      onChange={(e) => setEmailValue(e.target.value)}
                      placeholder="your@email.com"
                      required
                      disabled={emailStatus === 'loading'}
                      className="h-9 px-3 rounded-lg text-[13px] border bg-[var(--surface-2)] text-[var(--text)] placeholder:text-[var(--text-faint)] outline-none focus:border-[var(--accent)] transition-colors w-52 disabled:opacity-60"
                      style={{ borderColor: 'var(--border)' }}
                    />
                    <button
                      type="submit"
                      disabled={emailStatus === 'loading' || !emailValue.trim()}
                      className="h-9 px-4 rounded-lg text-[12px] font-semibold transition-all disabled:opacity-50"
                      style={{ background: 'var(--accent)', color: '#fff' }}
                    >
                      {emailStatus === 'loading' ? '...' : 'Notify me'}
                    </button>
                  </form>
                  {emailStatus === 'error' && emailError && (
                    <p className="text-[11px] text-center mt-2" style={{ color: 'var(--danger)' }}>
                      {emailError}
                    </p>
                  )}
                </>
              )}
            </motion.div>
          </div>
        </section>

        {/* ── Footer ── */}
        <footer className="border-t border-[var(--border)] py-5 sm:py-[26px] px-4 sm:px-7 flex flex-col sm:flex-row sm:justify-between sm:items-center gap-3 sm:gap-0 text-[11px] sm:text-[12px] text-[var(--text-faint)] max-w-[1200px] mx-auto">
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
              href={`${import.meta.env.BASE_URL}${['es', 'de', 'fr', 'pt', 'it', 'ca', 'zh', 'ja', 'th'].includes(i18n.language.slice(0, 2)) ? i18n.language.slice(0, 2) + '/' : ''}fix/`}
              className="hover:text-[var(--text)] transition-colors no-underline"
            >
              {t('footer.fixGuide')}
            </a>
            <a
              href={GITHUB_URL}
              target="_blank" rel="noopener noreferrer"
              className="hover:text-[var(--text)] transition-colors no-underline"
              aria-label="GitHub repository"
            >
              {t('nav.github')}
            </a>
            <span className="text-[var(--text-faint)]">{t('footer.builtWith')}</span>
          </div>
        </footer>

        {/* ── Bottom safe-area spacer (iOS home indicator) ── */}
        <div style={{ height: 'env(safe-area-inset-bottom, 0px)' }} />

      </div>
    </Tooltip.Provider>
  )
}
