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

import React, { useState } from 'react'
import { motion } from 'framer-motion'
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

      {/* Categories sidebar — hidden on narrow screens */}
      <div className="hidden sm:flex w-[220px] md:w-[260px] border-l border-[var(--border)] bg-[var(--surface)] p-3 md:p-4 flex-col gap-3 md:gap-3.5 shrink-0">
        <div className="font-mono text-[10px] text-[var(--text-faint)] tracking-[0.1em] mb-0.5">CATEGORIES</div>
        {[
          { c: '#C7C9D4', l: 'Walls',   n: 142 },
          { c: '#8B93E8', l: 'Doors',   n: 27  },
          { c: '#6FB8D9', l: 'Windows', n: 41  },
          { c: '#B9A77A', l: 'Beams',   n: 34  },
          { c: '#9B8CC4', l: 'Stairs',  n: 3   },
          { c: '#F5A623', l: 'MEP',     n: 187 },
        ].map((c, i) => (
          <div key={i} className="flex items-center gap-2 py-0.5 text-[11px]">
            <div className="w-2 h-2 rounded-[2px] shrink-0" style={{ background: c.c }} />
            <span className="flex-1 truncate">{c.l}</span>
            <span className="font-mono text-[var(--text-faint)] text-[10px]">{c.n}</span>
          </div>
        ))}
        <div className="border-t border-[var(--border)] pt-2.5 mt-auto text-[11px] text-[var(--text-dim)]">
          <div className="flex items-center gap-1.5 mb-1">
            <span className="font-mono text-[var(--ok)]">●</span>
            Model loaded
          </div>
          <div className="text-[var(--text-faint)] text-[10px]">Processed in-browser via WebAssembly</div>
        </div>
      </div>
    </div>
  )
}

// ── Animation helpers ─────────────────────────────────────────────────────────
const fadeUp = { hidden: { opacity: 0, y: 16 }, show: { opacity: 1, y: 0 } }

// ── Feature data ──────────────────────────────────────────────────────────────
const FEATURES = [
  {
    icon: Icons.Upload,
    title: 'Drag & drop, no upload',
    body: 'Open any .ifc file instantly. Parsed client-side via web-ifc WebAssembly — your data never leaves the browser. No account, no server, works fully offline.',
    tip: 'Client-side WebAssembly parsing',
  },
  {
    icon: Icons.Sparkles,
    title: '18-rule IFC validator',
    body: 'Stream results as each rule runs in a background worker. Covers GUID duplicates, spatial hierarchy, orphan elements, naming conventions, missing type assignments, and more.',
    tip: 'IFC / ISO 19650 rule engine',
  },
  {
    icon: Icons.Layers,
    title: 'Non-destructive editing',
    body: 'Edit GlobalIds, names, LongNames, and property set values inline. Every change is held as a diff with full undo/redo history — the source file is never mutated.',
    tip: 'Full undo/redo diff stack',
  },
  {
    icon: Icons.Ruler,
    title: 'Measurement tools',
    body: 'Measure length, area, volume, and edge dimensions directly in the 3D viewport. Results persist as labelled annotations and export alongside your model.',
    tip: 'Length · area · volume · edge measurements',
  },
  {
    icon: Icons.Building,
    title: 'Floor plans & section cuts',
    body: 'Generate accurate 2D floor plan views from any storey. Cut live section planes at any angle or axis to inspect internal structure without hiding geometry.',
    tip: '2D floor plans · clipping planes',
  },
  {
    icon: Icons.Zap,
    title: 'Postproduction renderer',
    body: 'Toggle SSAO (ambient occlusion), edge rendering, and bloom postprocessing for presentation-quality stills — no external render farm needed.',
    tip: 'SSAO · edge rendering · bloom',
  },
  {
    icon: Icons.Ruler,
    title: 'Multi-model support',
    body: 'Load multiple IFC files simultaneously. Independent visibility, transforms, validation, quantity takeoff, and export per model. Manage everything from the Scene panel.',
    tip: 'Independent per-model state',
  },
  {
    icon: Icons.Zap,
    title: 'OPFS geometry cache',
    body: "Parsed geometry is stored in the browser's Origin Private File System. Repeat loads are ~10× faster with no re-parsing — and it works completely offline.",
    tip: 'Origin Private File System cache',
  },
  {
    icon: Icons.Building,
    title: 'IFC2x3, IFC4, IFC4x1, IFC4x3',
    body: 'All current IFC schema versions supported — Revit, ArchiCAD, Tekla, Allplan, Vectorworks, BricsCAD BIM, Solibri and more. Outdated schemas are flagged by the validator.',
    tip: 'All major IFC schema versions',
  },
  {
    icon: Icons.Sparkles,
    title: 'Quantity takeoff',
    body: 'Reads IfcElementQuantity data to aggregate area, volume, and length per IFC class. Per-model results update in real time as you load or filter models.',
    tip: 'IfcElementQuantity aggregation',
  },
  {
    icon: Icons.Layers,
    title: 'IFC + GLB export',
    body: 'Export the corrected IFC binary (all diffs applied in a Web Worker) or export visible geometry as a standard GLB file. Multi-model batch export supported.',
    tip: 'Server-free binary IFC export',
  },
  {
    icon: Icons.Upload,
    title: 'IfcRelationsIndexer',
    body: 'Every relationship in the model is pre-indexed on load. Near-instant lookup for spatial containment, classification trees, type assignments, and element properties.',
    tip: 'Pre-indexed relationship graph',
  },
] as const

// ── Main component ────────────────────────────────────────────────────────────
export default function Landing({ onLaunch, onOpenUpload }: LandingProps) {
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
            <a href="#features" className="text-inherit no-underline hover:text-[var(--text)] transition-colors">Features</a>
            <a href="#how"      className="text-inherit no-underline hover:text-[var(--text)] transition-colors">How it works</a>
            <a href="#faq"      className="text-inherit no-underline hover:text-[var(--text)] transition-colors">FAQ</a>
            <a href={GITHUB_URL} target="_blank" rel="noopener noreferrer"
              className="text-inherit no-underline hover:text-[var(--text)] transition-colors"
              aria-label="View source code on GitHub"
            >
              GitHub
            </a>
            <button
              onClick={onLaunch}
              className="inline-flex items-center gap-2 h-[30px] px-3 text-[13px] font-medium rounded-[9px] bg-[var(--accent)] text-white hover:brightness-110 active:brightness-90 transition-all cursor-pointer"
            >
              <Icons.ArrowRight size={14} />
              Open viewer
            </button>
          </div>

          {/* Mobile: GitHub icon + primary CTA */}
          <div className="flex md:hidden items-center gap-2">
            <a href={GITHUB_URL} target="_blank" rel="noopener noreferrer"
              className="w-9 h-9 flex items-center justify-center rounded-lg text-[var(--text-dim)] hover:text-[var(--text)] transition-colors"
              aria-label="GitHub repository"
            >
              {GITHUB_SVG}
            </a>
            <button
              onClick={onLaunch}
              className="inline-flex items-center gap-1.5 h-9 px-3.5 text-[13px] font-semibold rounded-[9px] bg-[var(--accent)] text-white active:brightness-90 cursor-pointer"
            >
              Launch
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
                No login · runs in your browser
              </span>
              <span className="hidden sm:inline">
                <ShinyText
                  text="No login required — runs entirely in your browser"
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
              text={[
                'Open any .ifc file instantly — no upload',
                'Validate with 18 built-in rules',
                'Measure lengths, areas, and volumes in 3D',
                'Generate 2D floor plans from any storey',
                'Edit GUIDs, names, and property sets',
                'Export corrected IFC in one click',
              ]}
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
            Open, validate, measure, and{' '}
            <GradientText colors={[...GRADIENT_SUBTEXT]} animationSpeed={7}>
              non-destructively edit
            </GradientText>{' '}
            IFC files directly in your browser.
            No installation, no server, no account — WebAssembly parsing, WebGL rendering,
            18 validation rules, 2D floor plans, measurements, and IFC export.
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
                Open an IFC file
              </span>
            </StarBorder>

            <a
              href={GITHUB_URL}
              target="_blank" rel="noopener noreferrer"
              className="inline-flex items-center gap-2 h-[38px] px-4 text-[13px] sm:text-[14px] font-medium rounded-[9px] border border-[var(--border-strong)] text-[var(--text)] hover:bg-[var(--surface-2)] transition-colors no-underline"
              aria-label="View source code on GitHub"
            >
              {GITHUB_SVG}
              View on GitHub
            </a>
          </motion.div>

          {/* Trust line */}
          <motion.div
            variants={fadeUp} initial="hidden" animate="show" transition={{ duration: 0.5, delay: 0.35 }}
            className="mt-4 text-[10.5px] sm:text-[11.5px] text-[var(--text-faint)]"
          >
            <span className="hidden sm:inline">Free · Open source · 100% client-side · IFC2x3 · IFC4 · IFC4x1 · IFC4x3</span>
            <span className="sm:hidden">Free · Open source · IFC2x3 · IFC4 · IFC4x3</span>
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
            Compatible with every major BIM authoring tool
          </div>
          <div className="flex gap-4 sm:gap-10 justify-center flex-wrap text-[13px] sm:text-[15px] font-medium text-[var(--text-dim)] tracking-tight">
            {['Revit', 'ArchiCAD', 'Tekla', 'Allplan', 'Vectorworks', 'BricsCAD BIM', 'Solibri'].map((t) => (
              <span key={t}>{t}</span>
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
              { to: 18,  suffix: '+', label: 'Validation rules',    stiffness: 70 },
              { to: 4,   suffix: '',  label: 'IFC schema versions', stiffness: 90 },
              { to: 100, suffix: '%', label: 'Runs in the browser', stiffness: 60 },
              { to: 0,   suffix: '',  label: 'Server uploads',      stiffness: 90 },
            ].map((s, i) => (
              <CountUp
                key={i}
                to={s.to}
                suffix={s.suffix}
                label={s.label}
                stiffness={s.stiffness}
                damping={22}
                numberClassName="text-[38px] sm:text-[52px] font-semibold tracking-[-0.04em] text-[var(--text)]"
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
                text="FEATURES"
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
              View, validate, measure, and edit IFC
            </h2>
            <p className="text-[14px] sm:text-[16px] text-[var(--text-dim)] mt-3 max-w-[600px] mx-auto">
              Every tool you need in a single browser tab — private, fast, and completely free.
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
                  text="HOW IT WORKS"
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
                From file to validated, measured model
              </h2>
            </div>

            <div className="grid gap-4 sm:gap-6" style={{ gridTemplateColumns: 'repeat(auto-fit, minmax(240px, 1fr))' }}>
              {[
                {
                  n: '01',
                  title: 'Open your IFC',
                  body: 'Drag & drop or click to open any IFC file. web-ifc WebAssembly parses it entirely in your browser — no upload, no network required. OPFS caches geometry for instant repeat loads.',
                },
                {
                  n: '02',
                  title: 'Inspect & validate',
                  body: 'Explore the model tree, filter by category, and run 18 built-in validation rules in a background worker. Duplicate GUIDs, spatial hierarchy errors, missing type assignments — all flagged instantly.',
                },
                {
                  n: '03',
                  title: 'Edit & measure',
                  body: 'Fix GUIDs with one click. Edit names and property values inline with full undo/redo. Measure lengths, areas, and volumes in 3D. View 2D floor plans and cut live section planes.',
                },
                {
                  n: '04',
                  title: 'Visualise & export',
                  body: 'Toggle SSAO, edge rendering, and bloom for presentation renders. Export the corrected IFC binary (all diffs applied server-free) or visible geometry as a standard GLB.',
                },
              ].map((s, i) => (
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
                text="OPEN SOURCE"
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
              Built in public, free forever
            </h2>
            <p className="text-[13.5px] sm:text-[15px] text-[var(--text-dim)] leading-[1.55] mb-6 sm:mb-7 max-w-[540px] mx-auto">
              The source code is on GitHub. Built with <strong>@thatopen/components</strong>,{' '}
              <strong>three.js</strong>, <strong>web-ifc</strong>, and <strong>React</strong>.
              If you need a custom BIM web viewer, validator, or IFC tooling — the author is available for contract work.
            </p>
            <div className="flex gap-3 justify-center flex-wrap">
              <a
                href={GITHUB_URL}
                target="_blank" rel="noopener noreferrer"
                className="inline-flex items-center gap-2 h-[38px] px-4 sm:px-5 text-[13.5px] sm:text-[14px] font-medium rounded-[9px] border border-[var(--border-strong)] text-[var(--text)] hover:bg-[var(--surface-2)] transition-colors no-underline"
                aria-label="View source code on GitHub"
              >
                {GITHUB_SVG}
                View source on GitHub
              </a>
              <a
                href="mailto:joelbenitezdonari@gmail.com"
                className="inline-flex items-center gap-2 h-[38px] px-4 sm:px-5 text-[13.5px] sm:text-[14px] font-medium rounded-[9px] bg-[var(--accent)] text-white hover:brightness-110 transition-all no-underline"
                aria-label="Contact for custom BIM development"
              >
                Contact for custom work
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
              Questions
            </h2>
            {[
              {
                q: 'Is my IFC file uploaded anywhere?',
                a: 'No. Files are parsed entirely in your browser via web-ifc, a WebAssembly build of the open-source IFC parser. Nothing leaves your machine. The app works completely offline once loaded.',
              },
              {
                q: 'What IFC versions are supported?',
                a: 'IFC2x3, IFC4, IFC4x1, and IFC4x3. The viewer uses the open-source web-ifc parser — the same engine used by most modern BIM tools and @thatopen/components. Outdated schemas are automatically flagged by the validator.',
              },
              {
                q: 'What measurement tools are available?',
                a: 'You can measure lengths between any two points, areas of surfaces, volumes of enclosed elements, and individual edge lengths — all directly in the 3D viewport. Measurements persist as labelled annotations and can be exported alongside your model.',
              },
              {
                q: 'Can I view floor plans and cut sections?',
                a: 'Yes. Floor plan mode generates accurate 2D orthographic views from any IfcBuildingStorey in the model. Section cuts let you define clipping planes at any position and angle to inspect internal structure without hiding geometry.',
              },
              {
                q: 'How does the validation work?',
                a: 'The validator runs 18 built-in rules in a background Web Worker so the UI stays responsive. Rules cover GUID duplicates, spatial hierarchy, orphan elements, naming conventions, missing type assignments, clash detection, and more. Results stream in as each rule completes.',
              },
              {
                q: 'Can I fix errors and re-export a corrected IFC?',
                a: 'Yes. All edits (GUID fixes, renames, property value changes) are held as non-destructive diffs with full undo/redo. Clicking Export IFC applies all diffs to the original binary in a Web Worker and downloads the corrected file — no server involved.',
              },
              {
                q: 'Can I load multiple IFC files at once?',
                a: 'Yes. Load as many IFC files as your device memory allows. Each model has independent visibility, transforms, validation, quantity takeoff, and export. Use the Scene panel to manage, reorder, or remove models at any time.',
              },
              {
                q: 'Does it work offline?',
                a: 'Yes, once the page is loaded. The WebAssembly parser and WebGL renderer run entirely in the browser. Parsed geometry is cached in OPFS so repeat loads are instant even without a network connection.',
              },
              {
                q: 'What are the file size limits?',
                a: 'There is no enforced limit — performance depends on your device. Files up to ~200 MB typically load well on modern hardware. The OPFS geometry cache means you only pay the parse cost once per file.',
              },
              {
                q: 'Is it free? Can I use it for commercial projects?',
                a: 'Yes, completely free. The source code is MIT-licensed. You can use the live app or fork the repository for your own projects, including commercial ones.',
              },
            ].map((f, i) => <FAQItem key={i} q={f.q} a={f.a} />)}
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
              Open an <span className="font-serif italic font-normal">IFC</span> now.
            </motion.h2>

            <motion.p
              variants={fadeUp} initial="hidden" whileInView="show" viewport={{ once: true }}
              transition={{ delay: 0.08 }}
              className="text-[14px] sm:text-[16px] text-[var(--text-dim)] mb-2 sm:mb-3"
            >
              No login. No upload. Runs in your browser.
            </motion.p>

            <motion.p
              variants={fadeUp} initial="hidden" whileInView="show" viewport={{ once: true }}
              transition={{ delay: 0.12 }}
              className="text-[12px] sm:text-[13px] text-[var(--text-faint)] mb-7 sm:mb-8"
            >
              Or explore the source on{' '}
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
                  Open an IFC file
                </span>
              </StarBorder>
            </motion.div>
          </div>
        </section>

        {/* ── Footer ── */}
        <footer className="border-t border-[var(--border)] py-5 sm:py-[26px] px-4 sm:px-7 flex flex-col sm:flex-row sm:justify-between sm:items-center gap-3 sm:gap-0 text-[11px] sm:text-[12px] text-[var(--text-faint)] max-w-[1200px] mx-auto">
          <div className="flex items-center gap-2">
            <Icons.Logo size={16} aria-hidden="true" />
            <span>
              IFC Viewer Online © 2026 —{' '}
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
              href={GITHUB_URL}
              target="_blank" rel="noopener noreferrer"
              className="hover:text-[var(--text)] transition-colors no-underline"
              aria-label="GitHub repository"
            >
              GitHub
            </a>
            <span className="text-[var(--text-faint)]">Built with @thatopen/components · three.js · web-ifc</span>
          </div>
        </footer>

        {/* ── Bottom safe-area spacer (iOS home indicator) ── */}
        <div style={{ height: 'env(safe-area-inset-bottom, 0px)' }} />

      </div>
    </Tooltip.Provider>
  )
}
