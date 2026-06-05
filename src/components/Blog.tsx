import React from 'react'
import { motion } from 'framer-motion'
import { getBlogPost, getBlogPostsByLang, getFeaturedPost, type BlogPost, type ContentBlock, type RichText } from '../lib/blog-posts'
import * as Icons from './Icons'
import SpotlightCard  from './reactbits/SpotlightCard'
import CountUp        from './reactbits/CountUp'
import FaultyTerminal from './reactbits/FaultyTerminal'
import BlurText       from './reactbits/BlurText'
import SoftAurora     from './reactbits/SoftAurora'
import Grainient      from './reactbits/Grainient'
import ReadingProgress             from './blog/ReadingProgress'
import TableOfContents, { extractHeadings, slugify } from './blog/TableOfContents'
import CodeBlock                   from './blog/CodeBlock'
import CopyForAI                   from './blog/CopyForAI'
import BimGlossary                 from './blog/BimGlossary'
import HealthScoreWidget, { HealthScoreRow } from './blog/HealthScoreWidget'
import EmbedViewer from './blog/EmbedViewer'

// ─── Theme toggle button (shared by BlogList + PostView navs) ─────────────────

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

// ─── Asset resolution ─────────────────────────────────────────────────────────

const BASE = import.meta.env.BASE_URL as string

function asset(name: string): string {
  const MAP: Record<string, string> = {
    'hero-building': `${BASE}Renderizado_3D_detallado_de_edificio_modular.png`,
    'og-image':      `${BASE}og-image.png`,
    'og-image-en':   `${BASE}og-image-en.png`,
  }
  return MAP[name] ?? `${BASE}blog/covers/${name}.png`
}

// ─── Design helpers ───────────────────────────────────────────────────────────

function formatDate(iso: string): string {
  return new Date(iso).toLocaleDateString('en-US', {
    year: 'numeric', month: 'long', day: 'numeric',
  })
}

const CATEGORY_COLORS: Record<string, string> = {
  validation:       'bg-[rgba(239,68,68,0.10)] text-[#f87171]',
  'best-practices': 'bg-[rgba(94,106,210,0.12)] text-[#818cf8]',
  'tool-guides':    'bg-[rgba(16,185,129,0.10)] text-[#34d399]',
  'ifc-tips':       'bg-[rgba(251,191,36,0.10)] text-[#fbbf24]',
  standards:        'bg-[rgba(167,139,250,0.12)] text-[#a78bfa]',
}
function catColor(slug: string): string {
  return CATEGORY_COLORS[slug] ?? 'bg-[rgba(100,116,139,0.12)] text-[var(--text-dim)]'
}

// ─── Inline rich text (internal/external links inside paragraphs) ──────────────

/** Build a crawlable href for an internal blog post, respecting base path + language prefix. */
function postHref(slug: string, lang: string): string {
  const prefix = lang === 'en' ? '' : `${lang}/`
  return `${BASE}${prefix}blog/${slug}/`
}

const INLINE_LINK_CLASS =
  'text-[var(--accent-2)] underline decoration-[rgba(129,140,248,0.4)] underline-offset-2 ' +
  'hover:decoration-[var(--accent-2)] transition-colors'

function RenderInline({ text, lang, onNavigateToPost }: {
  text: RichText
  lang: string
  onNavigateToPost: (slug: string) => void
}) {
  if (typeof text === 'string') return <>{text}</>
  return (
    <>
      {text.map((seg, i) => {
        if (typeof seg === 'string') return <React.Fragment key={i}>{seg}</React.Fragment>
        if ('to' in seg) {
          // Internal post link — real href for crawlers/middle-click, SPA nav on click.
          return (
            <a
              key={i}
              href={postHref(seg.to, lang)}
              onClick={(e) => {
                // Let modifier-clicks (new tab) and middle-clicks behave natively.
                if (e.metaKey || e.ctrlKey || e.shiftKey || e.button !== 0) return
                e.preventDefault()
                onNavigateToPost(seg.to)
              }}
              className={INLINE_LINK_CLASS}
            >
              {seg.text}
            </a>
          )
        }
        return (
          <a key={i} href={seg.href} target="_blank" rel="noopener noreferrer" className={INLINE_LINK_CLASS}>
            {seg.text}
          </a>
        )
      })}
    </>
  )
}

// ─── Block renderer ───────────────────────────────────────────────────────────

const CALLOUT_STYLES = {
  tip:     { border: 'border-[rgba(52,211,153,0.2)]',  bg: 'bg-[rgba(16,185,129,0.06)]',  icon: '💡', label: 'TIP' },
  warning: { border: 'border-[rgba(251,191,36,0.22)]', bg: 'bg-[rgba(251,191,36,0.06)]',  icon: '⚠️', label: 'WARNING' },
  info:    { border: 'border-[rgba(99,102,241,0.22)]', bg: 'bg-[rgba(94,106,210,0.06)]',  icon: 'ℹ️', label: 'NOTE' },
}

function RenderBlock({ block, lang, onNavigateToPost, onNavigateToLanding }: {
  block: ContentBlock
  lang: string
  onNavigateToPost: (slug: string) => void
  onNavigateToLanding: () => void
}) {
  switch (block.type) {

    case 'p':
      return (
        <p className="text-[15.5px] leading-[1.82] text-[var(--text-dim)] mb-5">
          <RenderInline text={block.text} lang={lang} onNavigateToPost={onNavigateToPost} />
        </p>
      )

    case 'h2':
      return (
        <h2
          id={slugify(block.text)}
          className="scroll-mt-20 text-[19px] sm:text-[22px] font-semibold tracking-[-0.025em] text-[var(--text)] mt-8 sm:mt-12 mb-4 pb-3 border-b border-[var(--border)]"
        >
          {block.text}
        </h2>
      )

    case 'h3':
      return (
        <h3
          id={slugify(block.text)}
          className="scroll-mt-20 text-[15px] sm:text-[16.5px] font-semibold tracking-tight text-[var(--text)] mt-6 sm:mt-8 mb-2.5"
        >
          {block.text}
        </h3>
      )

    case 'ul':
      return (
        <ul className="mb-6 space-y-3 pl-0 list-none">
          {block.items.map((item, i) => (
            <li key={i} className="flex gap-3 text-[15px] leading-[1.72] text-[var(--text-dim)]">
              <span className="mt-[7px] w-1.5 h-1.5 rounded-full bg-[var(--accent)] opacity-70 shrink-0" />
              <span>{item}</span>
            </li>
          ))}
        </ul>
      )

    case 'ol':
      return (
        <ol className="mb-6 space-y-3 pl-0 list-none">
          {block.items.map((item, i) => (
            <li key={i} className="flex gap-3 text-[15px] leading-[1.72] text-[var(--text-dim)]">
              <span className="shrink-0 w-[22px] h-[22px] mt-[0px] rounded-full bg-[rgba(94,106,210,0.15)] text-[var(--accent-2)] text-[11px] font-bold font-mono flex items-center justify-center">
                {i + 1}
              </span>
              <span className="pt-[2px]">{item}</span>
            </li>
          ))}
        </ol>
      )

    case 'code':
      return <CodeBlock code={block.text} lang={block.lang} />

    case 'callout': {
      const s = CALLOUT_STYLES[block.variant]
      return (
        <div className={`mb-6 px-4 sm:px-5 py-4 rounded-xl border ${s.border} ${s.bg} flex gap-3`}>
          <span className="text-[16px] shrink-0 mt-[2px]">{s.icon}</span>
          <div>
            <span className="text-[10.5px] font-mono font-bold tracking-widest text-[var(--text-dim)] mr-2">{s.label}</span>
            <span className="text-[14px] leading-[1.75] text-[var(--text-dim)]">{block.text}</span>
          </div>
        </div>
      )
    }

    case 'image': {
      const src = asset(block.src)
      return (
        <figure className="my-8">
          <div className="rounded-xl overflow-hidden border border-[var(--border)]">
            <img src={src} alt={block.alt} className="w-full block" loading="lazy" />
          </div>
          {block.caption && (
            <figcaption className="text-[12px] text-[var(--text-faint)] text-center mt-2.5">
              {block.caption}
            </figcaption>
          )}
        </figure>
      )
    }

    case 'stat-row':
      return (
        <div className="my-6 sm:my-8 grid grid-cols-2 sm:grid-cols-4 gap-2.5 sm:gap-3">
          {block.stats.map((s, i) => (
            <div
              key={i}
              className="flex flex-col items-center justify-center py-4 sm:py-5 px-2 rounded-xl border border-[var(--border)] bg-[var(--surface)] text-center"
            >
              <CountUp
                to={s.value}
                prefix={s.prefix}
                suffix={s.suffix}
                from={0}
                stiffness={70}
                damping={20}
                numberClassName="text-[26px] sm:text-[32px] font-semibold tracking-tight text-[var(--text)]"
                labelClassName="text-[11px] sm:text-[11.5px] text-[var(--text-faint)] mt-1 leading-tight"
                label={s.label}
                className="flex flex-col items-center"
              />
            </div>
          ))}
        </div>
      )

    case 'feature-grid':
      return (
        <div className="my-8 grid grid-cols-1 sm:grid-cols-2 gap-3">
          {block.items.map((item, i) => (
            <SpotlightCard
              key={i}
              className="p-5 rounded-xl border border-[var(--border)] bg-[var(--surface)] h-full"
              spotlightColor="rgba(94,106,210,0.13)"
            >
              <div className="text-[22px] mb-3 leading-none">{item.icon}</div>
              <div className="text-[14.5px] font-semibold tracking-tight text-[var(--text)] mb-1.5">
                {item.title}
              </div>
              <div className="text-[13.5px] text-[var(--text-dim)] leading-[1.65]">
                {item.body}
              </div>
            </SpotlightCard>
          ))}
        </div>
      )

    case 'comparison':
      return (
        <div className="my-8 grid grid-cols-1 sm:grid-cols-2 gap-3">
          {[block.left, block.right].map((side, si) => (
            <div
              key={si}
              className={`p-5 rounded-xl border ${
                side.color === 'accent'
                  ? 'border-[rgba(94,106,210,0.4)] bg-[rgba(94,106,210,0.05)]'
                  : 'border-[var(--border)] bg-[var(--surface)]'
              }`}
            >
              <div className={`text-[10.5px] font-mono font-bold tracking-[0.12em] mb-4 ${
                side.color === 'accent' ? 'text-[var(--accent-2)]' : 'text-[var(--text-faint)]'
              }`}>
                {side.label.toUpperCase()}
              </div>
              <ul className="space-y-2.5">
                {side.items.map((item, i) => (
                  <li key={i} className="flex gap-2.5 text-[13.5px] leading-[1.6] text-[var(--text-dim)]">
                    <span className={`shrink-0 mt-[2px] text-[12px] font-bold ${
                      side.color === 'accent' ? 'text-[var(--accent-2)]' : 'text-[var(--text-faint)]'
                    }`}>
                      {side.color === 'accent' ? '✓' : '○'}
                    </span>
                    {item}
                  </li>
                ))}
              </ul>
            </div>
          ))}
        </div>
      )

    case 'health-score':
      return (
        <HealthScoreRow items={block.items} />
      )

    case 'pull-quote':
      return (
        <blockquote className="my-8 pl-5 border-l-[3px] border-[var(--accent)]">
          <p className="text-[17px] sm:text-[19px] font-medium leading-[1.6] text-[var(--text)] tracking-[-0.01em] italic">
            "{block.text}"
          </p>
          {block.cite && (
            <cite className="block mt-2 text-[13px] text-[var(--text-faint)] not-italic">
              — {block.cite}
            </cite>
          )}
        </blockquote>
      )

    case 'ifc-demo':
      return (
        <div className="my-7 sm:my-10">
          {/* Schema + size badges above the viewer */}
          <div className="flex items-center gap-2 mb-2.5">
            <span className="text-[9.5px] font-mono font-bold tracking-[0.12em] text-[var(--accent-2)]">
              DEMO MODEL
            </span>
            <span className="px-1.5 py-0.5 rounded bg-[var(--surface)] border border-[var(--border)] text-[9.5px] font-mono text-[var(--text-dim)]">
              {block.schema}
            </span>
            <span className="px-1.5 py-0.5 rounded bg-[var(--surface)] border border-[var(--border)] text-[9.5px] font-mono text-[var(--text-dim)]">
              {block.size}
            </span>
          </div>

          {/* Live interactive 3D viewer */}
          <EmbedViewer
            modelId={block.modelId}
            title={block.title}
            description={block.description}
            showProperties={block.showProperties ?? true}
            allowFullscreen={block.allowFullscreen ?? true}
            height={block.height}
            variant={block.variant ?? 'inline'}
          />

          {/* Footer note */}
          <p className="mt-2 text-[10.5px] text-[var(--text-faint)] text-center">
            Rendered in your browser · zero bytes sent to any server
          </p>
        </div>
      )

    default:
      return null
  }
}

// ─── Post card (grid) ─────────────────────────────────────────────────────────

function PostCard({ post, onClick, theme = 'dark' }: { post: BlogPost; onClick: () => void; theme?: 'dark' | 'light' }) {
  const [showCover, setShowCover] = React.useState(true)
  return (
    <SpotlightCard
      className="group rounded-2xl border border-[var(--border)] bg-[var(--surface)] hover:border-[rgba(94,106,210,0.4)] active:scale-[0.99] hover:-translate-y-[2px] transition-all duration-200 cursor-pointer overflow-hidden"
      spotlightColor={theme === 'dark' ? 'rgba(94,106,210,0.10)' : 'rgba(94,106,210,0.08)'}
    >
      <article onClick={onClick} className="flex flex-col h-full">
        {/* Cover image strip */}
        {showCover && (
          <div className="relative h-[138px] overflow-hidden bg-[var(--surface-2,#0e0e12)] flex-shrink-0">
            <img
              src={asset(post.slug)}
              alt=""
              aria-hidden="true"
              loading="lazy"
              className="w-full h-full object-cover object-center opacity-75 group-hover:opacity-90 transition-opacity duration-300"
              onError={() => setShowCover(false)}
            />
            <div
              className="absolute inset-0 pointer-events-none"
              style={{ background: 'linear-gradient(to bottom, transparent 45%, var(--surface) 100%)' }}
            />
          </div>
        )}

        <div className="flex flex-col flex-1 p-4 sm:p-5">
          {/* Category badge */}
          <div className="mb-3">
            <span className={`inline-flex px-2 py-0.5 rounded-full text-[10px] font-mono font-bold tracking-wider ${catColor(post.categorySlug)}`}>
              {post.category.toUpperCase()}
            </span>
          </div>

          {/* Title */}
          <h2 className={`flex-1 text-[15px] font-semibold tracking-[-0.01em] leading-[1.35] text-[var(--text)] mb-2 transition-colors line-clamp-2 ${theme === 'dark' ? 'group-hover:text-white' : 'group-hover:text-[var(--accent)]'}`}>
            {post.title}
          </h2>

          {/* Excerpt — 2 lines */}
          <p className="text-[13px] leading-[1.6] text-[var(--text-dim)] line-clamp-2 mb-3">
            {post.excerpt}
          </p>

          {/* Meta */}
          <div className="flex items-center justify-between pt-3 border-t border-[var(--border)]">
            <div className="flex items-center gap-1.5 text-[11px] text-[var(--text-faint)]">
              <span>{formatDate(post.date)}</span>
              <span>·</span>
              <span>{post.readTimeMin} min</span>
            </div>
            <Icons.ArrowRight
              size={12}
              className="text-[var(--text-faint)] group-hover:text-[var(--accent-2)] group-hover:translate-x-0.5 transition-all"
            />
          </div>
        </div>
      </article>
    </SpotlightCard>
  )
}

// ─── Featured card ────────────────────────────────────────────────────────────

function FeaturedCard({ post, onClick, theme = 'dark' }: { post: BlogPost; onClick: () => void; theme?: 'dark' | 'light' }) {
  return (
    <article
      onClick={onClick}
      className="group relative rounded-2xl border border-[var(--border)] bg-[var(--surface)] hover:border-[rgba(94,106,210,0.5)] transition-all duration-200 cursor-pointer overflow-hidden"
    >
      {/* Accent gradient overlay on hover */}
      <div
        className="absolute inset-0 opacity-0 group-hover:opacity-100 transition-opacity duration-500 pointer-events-none z-10"
        style={{ background: 'radial-gradient(ellipse at 0% 0%, rgba(94,106,210,0.07) 0%, transparent 65%)' }}
      />

      {/* Mobile hero image strip — shown only on mobile */}
      {post.heroImage && (
        <div className="sm:hidden relative h-[130px] overflow-hidden bg-black">
          <img
            src={asset(post.heroImage)}
            alt=""
            aria-hidden="true"
            className="w-full h-full object-cover opacity-45 group-hover:opacity-55 transition-opacity duration-300"
          />
          <div
            className="absolute inset-0"
            style={{ background: 'linear-gradient(to bottom, transparent 30%, var(--surface) 100%)' }}
          />
        </div>
      )}

      {/* Content + desktop image layout */}
      <div className="sm:grid sm:grid-cols-[1fr_300px] lg:grid-cols-[1fr_380px]">
        {/* Text column */}
        <div className="relative flex flex-col gap-3 sm:gap-4 p-5 sm:p-8 z-20">
          <div className="flex items-center gap-2">
            <span className="inline-flex items-center gap-1.5 px-2 py-0.5 rounded-full border border-[rgba(94,106,210,0.35)] bg-[rgba(94,106,210,0.10)] text-[10px] font-mono font-bold text-[var(--accent-2)] tracking-wider">
              FEATURED
            </span>
            <span className={`inline-flex px-2 py-0.5 rounded-full text-[10px] font-mono font-bold tracking-wider ${catColor(post.categorySlug)}`}>
              {post.category.toUpperCase()}
            </span>
          </div>

          <h2
            className={`font-semibold tracking-[-0.03em] leading-[1.2] text-[var(--text)] transition-colors ${theme === 'dark' ? 'group-hover:text-white' : 'group-hover:text-[var(--accent)]'}`}
            style={{ fontSize: 'clamp(18px, 4vw, 28px)' }}
          >
            {post.title}
          </h2>

          <p className="text-[13.5px] sm:text-[14.5px] leading-[1.7] text-[var(--text-dim)] line-clamp-3 sm:line-clamp-none">
            {post.excerpt}
          </p>

          <div className="flex flex-wrap items-center justify-between gap-2 sm:gap-3 mt-1">
            <div className="flex items-center gap-1.5 text-[11px] sm:text-[11.5px] text-[var(--text-faint)]">
              <div className="w-[16px] h-[16px] rounded-full bg-[rgba(94,106,210,0.2)] flex items-center justify-center text-[8px] font-bold text-[var(--accent-2)] shrink-0">
                {post.author.charAt(0)}
              </div>
              <span>{post.author}</span>
              <span>·</span>
              <span>{formatDate(post.date)}</span>
              <span>·</span>
              <span>{post.readTimeMin} min</span>
            </div>
            <span className="inline-flex items-center gap-1.5 h-8 sm:h-[34px] px-3 sm:px-4 rounded-lg bg-[var(--accent)] text-white text-[12px] sm:text-[12.5px] font-semibold group-hover:brightness-110 transition-all">
              Read
              <Icons.ArrowRight size={11} />
            </span>
          </div>
        </div>

        {/* Desktop hero image column */}
        {post.heroImage && (
          <div className="hidden sm:block relative overflow-hidden bg-black border-l border-[var(--border)]">
            <img
              src={asset(post.heroImage)}
              alt=""
              aria-hidden="true"
              className="absolute inset-0 w-full h-full object-cover opacity-50 group-hover:opacity-65 transition-opacity duration-500"
            />
            <div
              className="absolute inset-0"
              style={{ background: 'linear-gradient(to right, var(--surface) 0%, transparent 40%)' }}
            />
          </div>
        )}
      </div>
    </article>
  )
}

// ─── Blog list ────────────────────────────────────────────────────────────────

function BlogList({ lang = 'en', onNavigateToPost, onNavigateToLanding, landingTheme, onToggleLandingTheme }: {
  lang?: string
  onNavigateToPost: (slug: string) => void
  onNavigateToLanding: () => void
  landingTheme: 'dark' | 'light'
  onToggleLandingTheme: () => void
}) {
  const posts    = getBlogPostsByLang(lang)
  const featured = getFeaturedPost(lang)
  const rest     = posts.filter(p => p !== featured)

  const navBg = landingTheme === 'dark'
    ? 'bg-[rgba(10,10,14,0.88)]'
    : 'bg-[rgba(245,246,250,0.92)]'

  return (
    <motion.div
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      transition={{ duration: 0.3 }}
      className="min-h-screen bg-[var(--bg)]"
    >
      {/* ── Sticky nav ── */}
      <nav className={`lp-sticky-nav sticky top-0 z-20 border-b border-[var(--border)] backdrop-blur-[14px] ${navBg}`}>
        <div className="max-w-[1120px] mx-auto px-4 sm:px-7 h-[54px] flex items-center justify-between">
          <button
            onClick={onNavigateToLanding}
            className="flex items-center gap-2 text-[13px] text-[var(--text-dim)] hover:text-[var(--text)] transition-colors"
          >
            <Icons.Chevron size={12} className="rotate-180" />
            <span>IFC Viewer</span>
          </button>
          <div className="flex items-center gap-1.5">
            <Icons.Logo size={15} className="text-[var(--text-faint)]" aria-hidden="true" />
            <span className="text-[13.5px] font-semibold tracking-tight">Blog</span>
          </div>
          <div className="flex items-center gap-2">
            <ThemeToggleBtn theme={landingTheme} onToggle={onToggleLandingTheme} />
            <button
              onClick={onNavigateToLanding}
              className="inline-flex items-center gap-1.5 h-[30px] px-3 text-[12.5px] font-semibold rounded-[8px] bg-[var(--accent)] text-white hover:brightness-110 transition-all"
            >
              <Icons.ArrowRight size={12} />
              Open viewer
            </button>
          </div>
        </div>
      </nav>

      {/* ── Header: FaultyTerminal (dark) / clean gradient (light) ── */}
      <header className="relative overflow-hidden border-b border-[var(--border)]">
        {landingTheme === 'dark' ? (
          <>
            {/* WebGL terminal background */}
            <div className="absolute inset-0 pointer-events-none">
              <FaultyTerminal
                scale={2.2}
                gridMul={[3, 1]}
                digitSize={1.0}
                timeScale={0.15}
                tint="#5E6AD2"
                scanlineIntensity={0.7}
                glitchAmount={0.9}
                flickerAmount={0.6}
                noiseAmp={0.9}
                brightness={0.55}
                mouseReact={true}
                mouseStrength={0.35}
                curvature={0}
                chromaticAberration={0}
                pageLoadAnimation={false}
                className="w-full h-full"
              />
            </div>
            {/* Fade bottom edge into page background */}
            <div
              className="absolute inset-0 pointer-events-none"
              style={{ background: 'linear-gradient(to bottom, rgba(10,10,14,0.35) 0%, var(--bg) 100%)' }}
            />
          </>
        ) : (
          /* Light mode: premium B2B header — Grainient base + SoftAurora accent */
          <>
            <div className="absolute inset-0 pointer-events-none overflow-hidden">
              <Grainient
                color1="#ECEEFF"
                color2="#D4D9FF"
                color3="#F4F5FC"
                timeSpeed={0.035}
                warpStrength={0.18}
                warpFrequency={2.5}
                warpAmplitude={14.0}
                grainAmount={0.028}
                grainScale={2.0}
                contrast={0.97}
                saturation={0.35}
                zoom={0.92}
                rotationAmount={160.0}
              />
            </div>
            <div className="absolute inset-0 pointer-events-none overflow-hidden" style={{ opacity: 0.7 }}>
              <SoftAurora
                color1="#3645C4"
                color2="#6B7FE8"
                brightness={0.45}
                speed={0.25}
                scale={1.2}
                bandHeight={0.52}
                bandSpread={0.9}
                noiseAmplitude={0.8}
                layerOffset={0.8}
              />
            </div>
          </>
        )}

        <div className="relative max-w-[1120px] mx-auto px-4 sm:px-7 pt-8 sm:pt-[60px] pb-8 sm:pb-14 z-10">
          <div className="inline-flex items-center gap-2 mb-3 sm:mb-4 px-2.5 py-1 rounded-full border border-[var(--border)] bg-[var(--surface)] text-[11px] font-mono text-[var(--text-faint)]">
            <span className="w-1.5 h-1.5 rounded-full bg-[var(--accent)]" />
            BIM & IFC guides
          </div>

          <h1
            className="font-semibold tracking-[-0.035em] leading-[1.1] text-[var(--text)] mb-3 sm:mb-5 max-w-[640px]"
            style={{ fontSize: 'clamp(26px, 7vw, 54px)' }}
          >
            <BlurText text="Practical guides for" animateBy="words" delay={50} className="block" />
            <BlurText text="better IFC delivery" animateBy="words" delay={50} className="block text-[var(--accent-2)]" />
          </h1>

          <p className="text-[14px] sm:text-[16px] leading-[1.65] text-[var(--text-dim)] max-w-[520px]">
            How to fix IFC errors, read Health Scores, and deliver models
            that survive contact with the CDE and your coordination team.
          </p>
        </div>
      </header>

      {/* ── Posts ── */}
      <main className="max-w-[1120px] mx-auto px-4 sm:px-7 py-6 sm:py-12">
        {/* Featured */}
        <FeaturedCard post={featured} onClick={() => onNavigateToPost(featured.slug)} theme={landingTheme} />

        {/* Grid — 1 col on mobile, 2 on sm, 3 on lg */}
        <div className="mt-4 sm:mt-5 grid gap-3 sm:gap-4 grid-cols-1 sm:grid-cols-2 lg:grid-cols-3">
          {rest.map(post => (
            <PostCard key={post.slug} post={post} onClick={() => onNavigateToPost(post.slug)} theme={landingTheme} />
          ))}
        </div>
      </main>

      {/* ── Footer CTA ── */}
      <div className="border-t border-[var(--border)] bg-[var(--surface)] py-8 sm:py-12 px-4 text-center">
        <div className="max-w-[440px] mx-auto">
          <p className="text-[13.5px] sm:text-[15px] text-[var(--text-dim)] mb-4">
            Ready to run your first IFC validation? Free, in your browser, no upload required.
          </p>
          <button
            onClick={onNavigateToLanding}
            className="w-full sm:w-auto inline-flex items-center justify-center gap-2 h-11 sm:h-10 px-6 text-[14px] sm:text-[13.5px] font-semibold rounded-xl bg-[var(--accent)] text-white hover:brightness-110 active:brightness-90 transition-all"
          >
            Open IFC Viewer free
            <Icons.ArrowRight size={14} />
          </button>
        </div>
      </div>
    </motion.div>
  )
}

// ─── Post view ────────────────────────────────────────────────────────────────

// Hero strip shown at the top of every PostView. Tries the generated blog cover
// first (always present after `npm run blog-covers`). Falls back silently.
function HeroCoverStrip({ slug, heroImage }: { slug: string; heroImage?: string }) {
  const [visible, setVisible] = React.useState(true)
  if (!visible) return null
  const src = heroImage ? asset(heroImage) : asset(slug)
  return (
    <div className="relative h-[180px] sm:h-[240px] overflow-hidden bg-black border-b border-[var(--border)]">
      <img
        src={src}
        alt=""
        aria-hidden="true"
        className="w-full h-full object-cover object-center opacity-50"
        onError={() => setVisible(false)}
      />
      <div
        className="absolute inset-0"
        style={{ background: 'linear-gradient(to bottom, transparent 10%, var(--bg) 100%)' }}
      />
    </div>
  )
}

function PostView({ post, onNavigateToBlog, onNavigateToPost, onNavigateToLanding, landingTheme, onToggleLandingTheme }: {
  post: BlogPost
  onNavigateToBlog: () => void
  onNavigateToPost: (slug: string) => void
  onNavigateToLanding: () => void
  landingTheme: 'dark' | 'light'
  onToggleLandingTheme: () => void
}) {
  const related  = getBlogPostsByLang(post.lang ?? 'en').filter(p => p.slug !== post.slug).slice(0, 3)
  const headings = extractHeadings(post.content)

  // Update document title + OG/Twitter meta while viewing a specific post.
  React.useEffect(() => {
    const prevTitle = document.title
    document.title = `${post.title} | IFC Viewer Online`

    const coverUrl = `${window.location.origin}${BASE}blog/covers/${post.slug}.png`

    const update = (sel: string, attr: string, val: string) => {
      const el = document.querySelector(sel)
      const prev = el?.getAttribute(attr) ?? ''
      el?.setAttribute(attr, val)
      return prev
    }

    const prevOgImg  = update('meta[property="og:image"]',       'content', coverUrl)
    const prevTwImg  = update('meta[name="twitter:image"]',      'content', coverUrl)
    const prevOgT    = update('meta[property="og:title"]',       'content', post.title)
    const prevTwT    = update('meta[name="twitter:title"]',      'content', post.title)
    const prevOgD    = update('meta[property="og:description"]', 'content', post.excerpt)
    const prevTwD    = update('meta[name="twitter:description"]','content', post.excerpt)

    return () => {
      document.title = prevTitle
      update('meta[property="og:image"]',       'content', prevOgImg)
      update('meta[name="twitter:image"]',      'content', prevTwImg)
      update('meta[property="og:title"]',       'content', prevOgT)
      update('meta[name="twitter:title"]',      'content', prevTwT)
      update('meta[property="og:description"]', 'content', prevOgD)
      update('meta[name="twitter:description"]','content', prevTwD)
    }
  }, [post.slug])

  const navBg = landingTheme === 'dark'
    ? 'bg-[rgba(10,10,14,0.88)]'
    : 'bg-[rgba(245,246,250,0.92)]'

  return (
    <motion.div
      key={post.slug}
      initial={{ opacity: 0, y: 10 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.28 }}
      className="min-h-screen bg-[var(--bg)]"
    >
      <ReadingProgress />
      {/* ── Sticky nav ── */}
      <nav className={`lp-sticky-nav sticky top-0 z-20 border-b border-[var(--border)] backdrop-blur-[14px] ${navBg}`}>
        <div className="max-w-[1120px] mx-auto px-4 sm:px-7 h-[54px] flex items-center justify-between">
          <button
            onClick={onNavigateToBlog}
            className="flex items-center gap-2 text-[13px] text-[var(--text-dim)] hover:text-[var(--text)] transition-colors"
          >
            <Icons.Chevron size={12} className="rotate-180" />
            <span className="hidden sm:inline">All articles</span>
            <span className="sm:hidden">Blog</span>
          </button>

          <div className="hidden sm:flex items-center gap-1.5">
            <Icons.Logo size={15} className="text-[var(--text-faint)]" aria-hidden="true" />
            <span className="text-[13.5px] font-semibold tracking-tight">Blog</span>
          </div>

          <div className="flex items-center gap-2">
            <ThemeToggleBtn theme={landingTheme} onToggle={onToggleLandingTheme} />
            <button
              onClick={onNavigateToLanding}
              className="inline-flex items-center gap-1.5 h-[30px] px-3 text-[12.5px] font-semibold rounded-[8px] bg-[var(--accent)] text-white hover:brightness-110 transition-all"
            >
              <Icons.ArrowRight size={12} />
              Open viewer
            </button>
          </div>
        </div>
      </nav>

      {/* ── Hero cover strip — always attempt; hidden via state if image 404s ── */}
      <HeroCoverStrip slug={post.slug} heroImage={post.heroImage} />

      {/* ── Article — single col on mobile / 2-col on xl+ ── */}
      <div className="max-w-[1200px] mx-auto px-4 sm:px-8 pt-7 sm:pt-10 pb-16">
        {/* xl: centered flex row  |  below xl: block, article centered with max-w */}
        <div className="xl:flex xl:gap-16 xl:items-start xl:justify-center">

          {/* ── Main column — constrained reading width, centered on non-xl ── */}
          <article className="w-full max-w-[720px] mx-auto min-w-0 xl:w-[720px] xl:max-w-none xl:mx-0 xl:shrink-0 xl:flex-none">

            {/* Article header */}
            <header className="mb-7 sm:mb-10">
              {/* Category + read time chip row */}
              <div className="flex items-center justify-between mb-3">
                <span className={`inline-flex px-2 py-0.5 rounded-full text-[10px] font-mono font-bold tracking-wider ${catColor(post.categorySlug)}`}>
                  {post.category.toUpperCase()}
                </span>
                <span className="text-[11.5px] text-[var(--text-faint)]">{post.readTimeMin} min read</span>
              </div>

              <h1
                className="font-semibold tracking-[-0.03em] leading-[1.12] text-[var(--text)] mb-4"
                style={{ fontSize: 'clamp(22px, 6vw, 40px)' }}
              >
                {post.title}
              </h1>

              <p className="text-[15px] sm:text-[17px] leading-[1.7] text-[var(--text-dim)] mb-5 pb-5"
                style={{ borderBottom: '1px solid var(--border)' }}
              >
                {post.excerpt}
              </p>

              {/* Meta row: author + date | CopyForAI on its own line on mobile */}
              <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
                <div className="flex items-center gap-2 text-[12px] text-[var(--text-faint)]">
                  <div className="w-[18px] h-[18px] rounded-full bg-[rgba(94,106,210,0.18)] flex items-center justify-center text-[9px] font-bold text-[var(--accent-2)] shrink-0">
                    {post.author.charAt(0)}
                  </div>
                  <span>{post.author}</span>
                  <span>·</span>
                  <time dateTime={post.date}>{formatDate(post.date)}</time>
                </div>
                <CopyForAI post={post} />
              </div>
            </header>

            {/* TOC — mobile only (hidden on xl where it's in the sidebar) */}
            <div className="xl:hidden">
              <TableOfContents headings={headings} />
            </div>

            {/* Article body */}
            <div>
              {post.content.map((block, i) => (
                <RenderBlock
                  key={i}
                  block={block}
                  lang={post.lang ?? 'en'}
                  onNavigateToPost={onNavigateToPost}
                  onNavigateToLanding={onNavigateToLanding}
                />
              ))}
            </div>

            {/* BIM Glossary */}
            <BimGlossary />

            {/* Bottom CTA */}
            <div className="mt-10 sm:mt-14 pt-8 sm:pt-10 border-t border-[var(--border)] text-center">
              <p className="text-[13.5px] sm:text-[14px] text-[var(--text-dim)] mb-4">
                Validate your IFC file free — no account, no server upload.
              </p>
              <div className="flex flex-col sm:flex-row items-center justify-center gap-3">
                <button
                  onClick={onNavigateToLanding}
                  className="w-full sm:w-auto inline-flex items-center justify-center gap-2 h-11 sm:h-10 px-5 text-[14px] sm:text-[13.5px] font-semibold rounded-xl bg-[var(--accent)] text-white hover:brightness-110 active:brightness-90 transition-all"
                >
                  Open IFC Viewer
                  <Icons.ArrowRight size={14} />
                </button>
                <CopyForAI post={post} />
              </div>
            </div>
          </article>

          {/* ── Desktop TOC sidebar — xl+ only (hidden on mobile) ── */}
          <div className="hidden xl:block shrink-0">
            <TableOfContents headings={headings} />
          </div>
        </div>
      </div>

      {/* ── Related posts ── */}
      {related.length > 0 && (
        <section className="border-t border-[var(--border)] bg-[var(--surface)]">
          <div className="max-w-[1120px] mx-auto px-4 sm:px-7 py-8 sm:py-12">
            <div className="text-[10.5px] font-mono font-bold tracking-[0.12em] text-[var(--text-faint)] mb-5 sm:mb-7">
              MORE ARTICLES
            </div>
            <div className="grid gap-3 sm:gap-4 grid-cols-1 sm:grid-cols-3">
              {related.map(p => (
                <PostCard key={p.slug} post={p} onClick={() => onNavigateToPost(p.slug)} />
              ))}
            </div>
          </div>
        </section>
      )}
    </motion.div>
  )
}

// ─── Root export ──────────────────────────────────────────────────────────────

interface BlogProps {
  slug: string | null
  lang?: string
  onNavigateToPost: (slug: string) => void
  onNavigateToBlog: () => void
  onNavigateToLanding: () => void
  landingTheme: 'dark' | 'light'
  onToggleLandingTheme: () => void
}

export default function Blog({ slug, lang = 'en', onNavigateToPost, onNavigateToBlog, onNavigateToLanding, landingTheme, onToggleLandingTheme }: BlogProps) {
  if (slug) {
    const post = getBlogPost(slug, lang)
    if (!post) {
      return (
        <div className={`min-h-screen bg-[var(--bg)] flex flex-col items-center justify-center gap-4 px-4 text-center${landingTheme === 'light' ? ' lp-light' : ''}`}>
          <p className="text-[14px] text-[var(--text-dim)]">Article not found.</p>
          <button onClick={onNavigateToBlog} className="text-[13px] text-[var(--accent-2)] hover:underline">
            ← Back to all articles
          </button>
        </div>
      )
    }
    return (
      <div className={landingTheme === 'light' ? 'lp-light' : ''}>
        <PostView
          post={post}
          onNavigateToBlog={onNavigateToBlog}
          onNavigateToPost={onNavigateToPost}
          onNavigateToLanding={onNavigateToLanding}
          landingTheme={landingTheme}
          onToggleLandingTheme={onToggleLandingTheme}
        />
      </div>
    )
  }

  return (
    <div className={landingTheme === 'light' ? 'lp-light' : ''}>
      <BlogList
        lang={lang}
        onNavigateToPost={onNavigateToPost}
        onNavigateToLanding={onNavigateToLanding}
        landingTheme={landingTheme}
        onToggleLandingTheme={onToggleLandingTheme}
      />
    </div>
  )
}
