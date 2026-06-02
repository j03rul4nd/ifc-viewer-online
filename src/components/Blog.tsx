import React from 'react'
import { motion } from 'framer-motion'
import { BLOG_POSTS, getBlogPost, type BlogPost, type ContentBlock } from '../lib/blog-posts'
import * as Icons from './Icons'
import SpotlightCard  from './reactbits/SpotlightCard'
import CountUp        from './reactbits/CountUp'
import Aurora         from './reactbits/Aurora'
import BlurText       from './reactbits/BlurText'

// ─── Asset resolution ─────────────────────────────────────────────────────────

const BASE = import.meta.env.BASE_URL as string

function asset(name: string): string {
  const MAP: Record<string, string> = {
    'hero-building': `${BASE}Renderizado_3D_detallado_de_edificio_modular.png`,
    'og-image':      `${BASE}og-image.png`,
    'og-image-en':   `${BASE}og-image-en.png`,
  }
  return MAP[name] ?? name
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

// ─── Block renderer ───────────────────────────────────────────────────────────

const CALLOUT_STYLES = {
  tip:     { border: 'border-[rgba(52,211,153,0.2)]',  bg: 'bg-[rgba(16,185,129,0.06)]',  icon: '💡', label: 'TIP' },
  warning: { border: 'border-[rgba(251,191,36,0.22)]', bg: 'bg-[rgba(251,191,36,0.06)]',  icon: '⚠️', label: 'WARNING' },
  info:    { border: 'border-[rgba(99,102,241,0.22)]', bg: 'bg-[rgba(94,106,210,0.06)]',  icon: 'ℹ️', label: 'NOTE' },
}

function RenderBlock({ block, onNavigateToLanding }: { block: ContentBlock; onNavigateToLanding: () => void }) {
  switch (block.type) {

    case 'p':
      return <p className="text-[15.5px] leading-[1.82] text-[var(--text-dim)] mb-5">{block.text}</p>

    case 'h2':
      return (
        <h2 className="text-[20px] sm:text-[22px] font-semibold tracking-[-0.025em] text-[var(--text)] mt-12 mb-5 pb-3 border-b border-[var(--border)]">
          {block.text}
        </h2>
      )

    case 'h3':
      return (
        <h3 className="text-[15px] sm:text-[16.5px] font-semibold tracking-tight text-[var(--text)] mt-8 mb-3">
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
      return (
        <pre className="mb-6 p-4 sm:p-5 rounded-xl bg-[var(--surface-2)] border border-[var(--border)] overflow-x-auto">
          <code className="text-[12.5px] sm:text-[13px] font-mono leading-[1.75] text-[#a5b4fc]">{block.text}</code>
        </pre>
      )

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
        <div className="my-8 grid grid-cols-2 sm:grid-cols-4 gap-3">
          {block.stats.map((s, i) => (
            <div
              key={i}
              className="flex flex-col items-center justify-center py-5 px-3 rounded-xl border border-[var(--border)] bg-[var(--surface)] text-center"
            >
              <CountUp
                to={s.value}
                prefix={s.prefix}
                suffix={s.suffix}
                from={0}
                stiffness={70}
                damping={20}
                numberClassName="text-[28px] sm:text-[32px] font-semibold tracking-tight text-[var(--text)]"
                labelClassName="text-[11.5px] text-[var(--text-faint)] mt-1 leading-tight"
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

    case 'ifc-demo':
      return (
        <div className="my-10">
          <div className="rounded-2xl border border-[rgba(94,106,210,0.35)] bg-[var(--surface)] overflow-hidden">
            {/* Model preview image */}
            <div className="relative h-[160px] sm:h-[200px] bg-black overflow-hidden">
              <img
                src={asset('hero-building')}
                alt="IFC model open in browser viewer"
                className="w-full h-full object-cover opacity-60"
                loading="lazy"
              />
              <div
                className="absolute inset-0"
                style={{ background: 'linear-gradient(to top, var(--surface) 0%, transparent 60%)' }}
              />
              <div className="absolute top-3 left-3 flex gap-1.5">
                <span className="px-2 py-0.5 rounded-full bg-[rgba(0,0,0,0.65)] backdrop-blur-sm text-[10px] font-mono text-white">
                  {block.schema}
                </span>
                <span className="px-2 py-0.5 rounded-full bg-[rgba(0,0,0,0.65)] backdrop-blur-sm text-[10px] font-mono text-[var(--text-dim)]">
                  {block.size}
                </span>
              </div>
              {/* Live indicator */}
              <div className="absolute top-3 right-3 flex items-center gap-1.5 px-2 py-0.5 rounded-full bg-[rgba(16,185,129,0.15)] border border-[rgba(52,211,153,0.3)]">
                <span className="w-1.5 h-1.5 rounded-full bg-[#34d399] animate-pulse" />
                <span className="text-[9.5px] font-mono text-[#34d399] tracking-wide">INTERACTIVE</span>
              </div>
            </div>

            {/* Card content */}
            <div className="p-5 sm:p-6">
              <div className="text-[10.5px] font-mono font-bold tracking-[0.12em] text-[var(--accent-2)] mb-2">
                DEMO MODEL
              </div>
              <h3 className="text-[16px] sm:text-[17px] font-semibold tracking-tight text-[var(--text)] mb-2">
                {block.title}
              </h3>
              <p className="text-[13.5px] leading-[1.65] text-[var(--text-dim)] mb-5">
                {block.description}
              </p>
              <div className="flex items-center justify-between gap-3">
                <p className="text-[11.5px] text-[var(--text-faint)]">
                  Opens in your browser — no account, no upload
                </p>
                <button
                  onClick={onNavigateToLanding}
                  className="shrink-0 inline-flex items-center gap-1.5 h-9 px-4 text-[12.5px] font-semibold rounded-lg bg-[var(--accent)] text-white hover:brightness-110 active:brightness-90 transition-all"
                >
                  Try in viewer
                  <Icons.ArrowRight size={12} />
                </button>
              </div>
            </div>
          </div>
        </div>
      )

    default:
      return null
  }
}

// ─── Post card (grid) ─────────────────────────────────────────────────────────

function PostCard({ post, onClick }: { post: BlogPost; onClick: () => void }) {
  return (
    <SpotlightCard
      className="group flex flex-col gap-0 rounded-2xl border border-[var(--border)] bg-[var(--surface)] hover:border-[rgba(94,106,210,0.4)] hover:-translate-y-[2px] transition-all duration-200 cursor-pointer overflow-hidden"
      spotlightColor="rgba(94,106,210,0.10)"
    >
      <article onClick={onClick} className="flex flex-col gap-0 h-full p-5 sm:p-6">
        <div className="flex items-center gap-2 mb-4">
          <span className={`inline-flex px-2 py-0.5 rounded-full text-[10px] font-mono font-bold tracking-wider ${catColor(post.categorySlug)}`}>
            {post.category.toUpperCase()}
          </span>
        </div>

        <h2 className="flex-1 text-[15px] sm:text-[15.5px] font-semibold tracking-[-0.01em] leading-[1.38] text-[var(--text)] mb-3 group-hover:text-white transition-colors line-clamp-2">
          {post.title}
        </h2>

        <p className="text-[13px] sm:text-[13.5px] leading-[1.65] text-[var(--text-dim)] line-clamp-2 mb-5">
          {post.excerpt}
        </p>

        <div className="flex items-center justify-between pt-4 border-t border-[var(--border)]">
          <div className="flex items-center gap-1.5 text-[11px] text-[var(--text-faint)]">
            <span>{formatDate(post.date)}</span>
            <span>·</span>
            <span>{post.readTimeMin} min</span>
          </div>
          <Icons.ArrowRight
            size={13}
            className="text-[var(--text-faint)] group-hover:text-[var(--accent-2)] group-hover:translate-x-0.5 transition-all"
          />
        </div>
      </article>
    </SpotlightCard>
  )
}

// ─── Featured card ────────────────────────────────────────────────────────────

function FeaturedCard({ post, onClick }: { post: BlogPost; onClick: () => void }) {
  return (
    <article
      onClick={onClick}
      className="group relative grid grid-cols-1 sm:grid-cols-[1fr_300px] lg:grid-cols-[1fr_380px] rounded-2xl border border-[var(--border)] bg-[var(--surface)] hover:border-[rgba(94,106,210,0.5)] transition-all duration-200 cursor-pointer overflow-hidden"
    >
      {/* Accent gradient */}
      <div
        className="absolute inset-0 opacity-0 group-hover:opacity-100 transition-opacity duration-500 pointer-events-none"
        style={{ background: 'radial-gradient(ellipse at 0% 0%, rgba(94,106,210,0.08) 0%, transparent 65%)' }}
      />

      {/* Text column */}
      <div className="relative flex flex-col gap-4 p-6 sm:p-8 z-10">
        <div className="flex items-center gap-2">
          <span className="inline-flex items-center gap-1.5 px-2 py-0.5 rounded-full border border-[rgba(94,106,210,0.35)] bg-[rgba(94,106,210,0.10)] text-[10px] font-mono font-bold text-[var(--accent-2)] tracking-wider">
            FEATURED
          </span>
          <span className={`inline-flex px-2 py-0.5 rounded-full text-[10px] font-mono font-bold tracking-wider ${catColor(post.categorySlug)}`}>
            {post.category.toUpperCase()}
          </span>
        </div>

        <h2
          className="font-semibold tracking-[-0.03em] leading-[1.18] text-[var(--text)] group-hover:text-white transition-colors"
          style={{ fontSize: 'clamp(20px, 3.2vw, 28px)' }}
        >
          {post.title}
        </h2>

        <p className="text-[14px] sm:text-[14.5px] leading-[1.75] text-[var(--text-dim)] max-w-[580px]">
          {post.excerpt}
        </p>

        <div className="mt-auto flex flex-wrap items-center justify-between gap-3">
          <div className="flex items-center gap-1.5 text-[11.5px] text-[var(--text-faint)]">
            <div className="w-[18px] h-[18px] rounded-full bg-[rgba(94,106,210,0.2)] flex items-center justify-center text-[9px] font-bold text-[var(--accent-2)] shrink-0">
              {post.author.charAt(0)}
            </div>
            <span>{post.author}</span>
            <span>·</span>
            <span>{formatDate(post.date)}</span>
            <span>·</span>
            <span>{post.readTimeMin} min read</span>
          </div>
          <span className="hidden sm:inline-flex items-center gap-1.5 h-[34px] px-4 rounded-lg bg-[var(--accent)] text-white text-[12.5px] font-semibold group-hover:brightness-110 transition-all">
            Read article
            <Icons.ArrowRight size={12} />
          </span>
        </div>
      </div>

      {/* Hero image column */}
      {post.heroImage && (
        <div className="hidden sm:block relative overflow-hidden bg-black border-l border-[var(--border)]">
          <img
            src={asset(post.heroImage)}
            alt=""
            aria-hidden="true"
            className="absolute inset-0 w-full h-full object-cover opacity-50 group-hover:opacity-65 transition-opacity duration-500 scale-105 group-hover:scale-100 transition-transform"
          />
          <div
            className="absolute inset-0"
            style={{ background: 'linear-gradient(to right, var(--surface) 0%, transparent 40%)' }}
          />
        </div>
      )}
    </article>
  )
}

// ─── Blog list ────────────────────────────────────────────────────────────────

function BlogList({ onNavigateToPost, onNavigateToLanding }: {
  onNavigateToPost: (slug: string) => void
  onNavigateToLanding: () => void
}) {
  const featured = BLOG_POSTS.find(p => p.featured) ?? BLOG_POSTS[0]
  const rest      = BLOG_POSTS.filter(p => p !== featured)

  return (
    <motion.div
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      transition={{ duration: 0.3 }}
      className="min-h-screen bg-[var(--bg)]"
    >
      {/* ── Sticky nav ── */}
      <nav className="sticky top-0 z-20 border-b border-[var(--border)] bg-[rgba(10,10,14,0.88)] backdrop-blur-[14px]">
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
          <button
            onClick={onNavigateToLanding}
            className="inline-flex items-center gap-1.5 h-[30px] px-3 text-[12.5px] font-semibold rounded-[8px] bg-[var(--accent)] text-white hover:brightness-110 transition-all"
          >
            <Icons.ArrowRight size={12} />
            Open viewer
          </button>
        </div>
      </nav>

      {/* ── Header with Aurora ── */}
      <header className="relative overflow-hidden border-b border-[var(--border)]">
        {/* Aurora background */}
        <div className="absolute inset-0 opacity-35 pointer-events-none">
          <Aurora
            colorStops={['#5E6AD2', '#7C3AED', '#3B82F6']}
            amplitude={0.18}
            speed={0.35}
            blend="screen"
            className="w-full h-full"
          />
        </div>

        <div className="relative max-w-[1120px] mx-auto px-4 sm:px-7 pt-14 sm:pt-[72px] pb-12 sm:pb-16 z-10">
          <div className="inline-flex items-center gap-2 mb-4 px-2.5 py-1 rounded-full border border-[var(--border)] bg-[var(--surface)] text-[11px] font-mono text-[var(--text-faint)]">
            <span className="w-1.5 h-1.5 rounded-full bg-[var(--accent)]" />
            BIM & IFC guides
          </div>

          <h1
            className="font-semibold tracking-[-0.035em] leading-[1.08] text-[var(--text)] mb-5 max-w-[640px]"
            style={{ fontSize: 'clamp(30px, 6vw, 54px)' }}
          >
            <BlurText
              text="Practical guides for"
              animateBy="words"
              delay={50}
              className="block"
            />
            <BlurText
              text="better IFC delivery"
              animateBy="words"
              delay={50}
              className="block text-[var(--accent-2)]"
            />
          </h1>

          <p className="text-[15px] sm:text-[16px] leading-[1.7] text-[var(--text-dim)] max-w-[520px]">
            How to fix IFC errors, read Health Scores, and deliver models
            that survive contact with the CDE and the coordination team.
          </p>
        </div>
      </header>

      {/* ── Posts ── */}
      <main className="max-w-[1120px] mx-auto px-4 sm:px-7 py-10 sm:py-14">
        {/* Featured */}
        <FeaturedCard post={featured} onClick={() => onNavigateToPost(featured.slug)} />

        {/* Grid */}
        <div className="mt-5 grid gap-4 grid-cols-1 sm:grid-cols-2 lg:grid-cols-3">
          {rest.map(post => (
            <PostCard key={post.slug} post={post} onClick={() => onNavigateToPost(post.slug)} />
          ))}
        </div>
      </main>

      {/* ── Footer CTA ── */}
      <div className="border-t border-[var(--border)] bg-[var(--surface)] py-10 sm:py-12 px-4 text-center">
        <div className="max-w-[440px] mx-auto">
          <p className="text-[14px] sm:text-[15px] text-[var(--text-dim)] mb-5">
            Ready to run your first IFC validation? Free, in your browser, no upload required.
          </p>
          <button
            onClick={onNavigateToLanding}
            className="inline-flex items-center gap-2 h-10 px-6 text-[13.5px] font-semibold rounded-[10px] bg-[var(--accent)] text-white hover:brightness-110 transition-all"
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

function PostView({ post, onNavigateToBlog, onNavigateToPost, onNavigateToLanding }: {
  post: BlogPost
  onNavigateToBlog: () => void
  onNavigateToPost: (slug: string) => void
  onNavigateToLanding: () => void
}) {
  const related = BLOG_POSTS.filter(p => p.slug !== post.slug).slice(0, 3)

  return (
    <motion.div
      key={post.slug}
      initial={{ opacity: 0, y: 10 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.28 }}
      className="min-h-screen bg-[var(--bg)]"
    >
      {/* ── Sticky nav ── */}
      <nav className="sticky top-0 z-20 border-b border-[var(--border)] bg-[rgba(10,10,14,0.88)] backdrop-blur-[14px]">
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

          <button
            onClick={onNavigateToLanding}
            className="inline-flex items-center gap-1.5 h-[30px] px-3 text-[12.5px] font-semibold rounded-[8px] bg-[var(--accent)] text-white hover:brightness-110 transition-all"
          >
            <Icons.ArrowRight size={12} />
            Open viewer
          </button>
        </div>
      </nav>

      {/* ── Hero image strip (if post has one) ── */}
      {post.heroImage && (
        <div className="relative h-[180px] sm:h-[240px] overflow-hidden bg-black border-b border-[var(--border)]">
          <img
            src={asset(post.heroImage)}
            alt=""
            aria-hidden="true"
            className="w-full h-full object-cover opacity-45"
          />
          <div
            className="absolute inset-0"
            style={{ background: 'linear-gradient(to bottom, transparent 0%, var(--bg) 100%)' }}
          />
        </div>
      )}

      {/* ── Article ── */}
      <article className="max-w-[740px] mx-auto px-4 sm:px-7 pt-10 sm:pt-14 pb-16">
        {/* Header */}
        <header className="mb-10 sm:mb-12">
          <div className="flex items-center gap-2 mb-4">
            <span className={`inline-flex px-2 py-0.5 rounded-full text-[10px] font-mono font-bold tracking-wider ${catColor(post.categorySlug)}`}>
              {post.category.toUpperCase()}
            </span>
          </div>

          <h1
            className="font-semibold tracking-[-0.03em] leading-[1.12] text-[var(--text)] mb-5"
            style={{ fontSize: 'clamp(24px, 4.5vw, 40px)' }}
          >
            {post.title}
          </h1>

          <p
            className="text-[16px] sm:text-[17px] leading-[1.75] text-[var(--text-dim)] mb-7 pb-7"
            style={{ borderBottom: '1px solid var(--border)' }}
          >
            {post.excerpt}
          </p>

          <div className="flex flex-wrap items-center gap-x-3 gap-y-1.5 text-[12px] text-[var(--text-faint)]">
            <div className="flex items-center gap-1.5">
              <div className="w-[20px] h-[20px] rounded-full bg-[rgba(94,106,210,0.18)] flex items-center justify-center text-[9px] font-bold text-[var(--accent-2)]">
                {post.author.charAt(0)}
              </div>
              <span>{post.author}</span>
            </div>
            <span>·</span>
            <time dateTime={post.date}>{formatDate(post.date)}</time>
            <span>·</span>
            <span>{post.readTimeMin} min read</span>
          </div>
        </header>

        {/* Body */}
        <div>
          {post.content.map((block, i) => (
            <RenderBlock key={i} block={block} onNavigateToLanding={onNavigateToLanding} />
          ))}
        </div>

        {/* Bottom CTA */}
        <div className="mt-14 pt-10 border-t border-[var(--border)] text-center">
          <p className="text-[14px] text-[var(--text-dim)] mb-4">
            Validate your IFC file for free — no account, no upload to any server.
          </p>
          <button
            onClick={onNavigateToLanding}
            className="inline-flex items-center gap-2 h-10 px-5 text-[13.5px] font-semibold rounded-[10px] bg-[var(--accent)] text-white hover:brightness-110 transition-all"
          >
            Open IFC Viewer
            <Icons.ArrowRight size={14} />
          </button>
        </div>
      </article>

      {/* ── Related posts ── */}
      {related.length > 0 && (
        <section className="border-t border-[var(--border)] bg-[var(--surface)]">
          <div className="max-w-[1120px] mx-auto px-4 sm:px-7 py-10 sm:py-14">
            <div className="text-[11px] font-mono font-bold tracking-[0.12em] text-[var(--text-faint)] mb-7">
              MORE ARTICLES
            </div>
            <div className="grid gap-4 grid-cols-1 sm:grid-cols-3">
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
  onNavigateToPost: (slug: string) => void
  onNavigateToBlog: () => void
  onNavigateToLanding: () => void
}

export default function Blog({ slug, onNavigateToPost, onNavigateToBlog, onNavigateToLanding }: BlogProps) {
  if (slug) {
    const post = getBlogPost(slug)
    if (!post) {
      return (
        <div className="min-h-screen bg-[var(--bg)] flex flex-col items-center justify-center gap-4 px-4 text-center">
          <p className="text-[14px] text-[var(--text-dim)]">Article not found.</p>
          <button onClick={onNavigateToBlog} className="text-[13px] text-[var(--accent-2)] hover:underline">
            ← Back to all articles
          </button>
        </div>
      )
    }
    return (
      <PostView
        post={post}
        onNavigateToBlog={onNavigateToBlog}
        onNavigateToPost={onNavigateToPost}
        onNavigateToLanding={onNavigateToLanding}
      />
    )
  }

  return <BlogList onNavigateToPost={onNavigateToPost} onNavigateToLanding={onNavigateToLanding} />
}
