import React from 'react'
import { motion } from 'framer-motion'
import { getBlogPost, getBlogPostsByLang, getFeaturedPost, type BlogPost, type ContentBlock, type RichText } from '../lib/blog-posts'
import * as Icons from './Icons'
import { EBOOKS, PRIMARY_EBOOK, ebookById } from '../lib/ebook'
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
import EmbedConfigurator from './blog/EmbedConfigurator'
import SpatialMediaDemo from './blog/SpatialMediaDemo'
import {
  filterBlogPosts,
  getBlogHubCopy,
  type BlogJourney,
  type BlogSort,
} from '../lib/blog-hub'

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
  if (MAP[name]) return MAP[name]
  if (name.includes('/') || /\.(?:avif|gif|jpe?g|png|svg|webp)$/i.test(name)) {
    return `${BASE}${name.replace(/^\//, '')}`
  }
  return `${BASE}blog/covers/${name}.png`
}

const BLOG_LIST_META: Record<string, { title: string; description: string }> = {
  en: {
    title: 'BIM & IFC Blog — Practical Guides for BIM Coordinators | IFC Viewer',
    description: 'Practical guides for BIM coordinators: fix IFC validation errors, improve IFC Health Scores, and deliver clean models to the CDE.',
  },
  es: {
    title: 'Blog BIM e IFC — Guías prácticas para coordinadores BIM | IFC Viewer',
    description: 'Guías prácticas para coordinadores BIM: corrige errores de validación IFC, mejora el Health Score y entrega modelos limpios al ECD.',
  },
  de: {
    title: 'BIM & IFC Blog — Praxisanleitungen für BIM-Koordinatoren | IFC Viewer',
    description: 'Praxisanleitungen für BIM-Koordinatoren: IFC-Validierungsfehler beheben, Health Scores verbessern und saubere Modelle ans CDE liefern.',
  },
  fr: {
    title: 'Blog BIM & IFC — Guides pratiques pour coordinateurs BIM | IFC Viewer',
    description: 'Guides pratiques pour coordinateurs BIM : corriger les erreurs IFC, améliorer le Health Score et livrer des modèles propres à la GED.',
  },
}

function patchDocumentMeta(selector: string, value: string): string {
  const element = document.querySelector<HTMLMetaElement>(selector)
  const previous = element?.content ?? ''
  if (element) element.content = value
  return previous
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
  'digital-twins':  'bg-[rgba(34,211,238,0.10)] text-[#22d3ee]',
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
      const srcSet = block.srcSet?.map((item) => `${asset(item.src)} ${item.width}w`).join(', ')
      return (
        <figure className="my-8">
          <div className="rounded-xl overflow-hidden border border-[var(--border)]">
            <img
              src={src}
              srcSet={srcSet}
              sizes={block.sizes ?? '(max-width: 760px) 100vw, 720px'}
              alt={block.alt}
              width={block.width}
              height={block.height}
              className="w-full block"
              loading="lazy"
              decoding="async"
            />
          </div>
          {(block.caption || block.credit) && (
            <figcaption className="text-[12px] text-[var(--text-faint)] text-center mt-2.5">
              {block.caption}
              {block.credit && <span>{block.caption ? ' · ' : ''}{block.credit}</span>}
              {block.license && (
                <span> · <a href={block.license} target="_blank" rel="license noopener noreferrer" className="hover:underline">
                  {block.license.includes('creativecommons.org/licenses/by/4.0') ? 'CC BY 4.0' : 'Image licence'}
                </a></span>
              )}
            </figcaption>
          )}
        </figure>
      )
    }

    case 'spatial-demo':
      return <SpatialMediaDemo {...block} />

    case 'video':
      return (
        <figure className="my-9">
          <div className="overflow-hidden rounded-2xl border border-[var(--border)] bg-black">
            <video
              src={asset(block.src)}
              poster={asset(block.poster)}
              width={block.width ?? 960}
              height={block.height ?? 540}
              controls
              muted
              loop
              playsInline
              preload="metadata"
              aria-label={`${block.title}. ${block.description}`}
              className="block aspect-video w-full bg-black"
            >
              <a href={asset(block.src)}>Download {block.title}</a>
            </video>
          </div>
          <figcaption className="mt-2.5 text-center text-[12px] text-[var(--text-faint)]">
            {block.caption ?? block.description}
          </figcaption>
        </figure>
      )

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

    case 'ebook-cta': {
      const book = (block.book ? ebookById(block.book) : undefined) ?? PRIMARY_EBOOK
      return (
        <aside className="my-9 rounded-2xl border border-[var(--border)] bg-[var(--surface-2)] overflow-hidden">
          <div className="flex flex-col sm:flex-row gap-5 p-5 sm:p-6">
            <img
              src={`/${book.coverFile}`}
              alt={`Cover of ${book.title}`}
              width={794}
              height={1123}
              loading="lazy"
              className="w-[92px] sm:w-[104px] h-auto shrink-0 self-start rounded-md"
              style={{ boxShadow: '0 12px 26px -12px rgba(0,0,0,.7), 0 0 0 1px rgba(255,255,255,.06)' }}
            />
            <div className="min-w-0">
              <p className="text-[10.5px] font-medium uppercase tracking-[0.14em] text-[var(--accent-2)]">
                Free PDF · normally {book.retail}
              </p>
              <p className="mt-1.5 text-[16px] font-semibold tracking-tight text-[var(--text)]">
                {block.headline ?? book.title}
              </p>
              <p className="mt-2 text-[14px] leading-[1.7] text-[var(--text-dim)]">
                {block.body ?? `${book.pages} pages. ${book.blurb}`}
              </p>
              <a
                href={`/ebook/${book.route ? `${book.route}/` : ''}`}
                className="mt-4 inline-flex items-center gap-2 rounded-lg px-4 py-2.5 text-[13.5px] font-semibold text-white transition-opacity hover:opacity-90"
                style={{ background: 'var(--accent)' }}
              >
                {block.cta ?? 'Get the free handbook'}
                <Icons.ArrowRight size={14} aria-hidden="true" />
              </a>
            </div>
          </div>
        </aside>
      )
    }

    case 'table': {
      const rowHeaders = block.rowHeaders ?? true
      return (
        <div className="my-8">
          {/* -mx-4 lets the table touch viewport edges on mobile; sm:mx-0 restores inset */}
          <div className="-mx-4 sm:mx-0 overflow-x-auto">
            <div className="min-w-full sm:rounded-xl border border-[var(--border)] overflow-hidden">
              <table className="w-full text-[13px] border-collapse">
                <thead>
                  <tr className="bg-[var(--surface)]">
                    {block.headers.map((h, hi) => (
                      <th
                        key={hi}
                        scope="col"
                        className="px-3.5 py-2.5 text-left text-[10px] font-mono font-bold tracking-[0.09em] uppercase text-[var(--text-dim)] border-b border-[var(--border)] whitespace-nowrap"
                      >
                        {h}
                      </th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {block.rows.map((row, ri) => (
                    <tr
                      key={ri}
                      className={`border-b border-[var(--border)] last:border-0 transition-colors hover:bg-[rgba(94,106,210,0.04)] ${
                        ri % 2 === 1 ? 'bg-[rgba(94,106,210,0.015)]' : ''
                      }`}
                    >
                      {row.map((cell, ci) => {
                        const isRH = rowHeaders && ci === 0
                        return isRH ? (
                          <th
                            key={ci}
                            scope="row"
                            className="px-3.5 py-2.5 text-left align-top text-[12.5px] font-medium text-[var(--text)] whitespace-nowrap leading-[1.5]"
                          >
                            {cell}
                          </th>
                        ) : (
                          <td
                            key={ci}
                            className="px-3.5 py-2.5 align-top text-[12.5px] leading-[1.6] text-[var(--text-dim)]"
                          >
                            {cell}
                          </td>
                        )
                      })}
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
          {block.caption && (
            <p className="mt-2 px-1 text-[11px] text-[var(--text-faint)]">{block.caption}</p>
          )}
        </div>
      )
    }

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

    case 'embed-configurator':
      return (
        <EmbedConfigurator
          title={block.title}
          description={block.description}
          defaultModelUrl={block.defaultModelUrl}
          defaultFileName={block.defaultFileName}
          defaultHeight={block.defaultHeight}
        />
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
      <a
        href={postHref(post.slug, post.lang ?? 'en')}
        onClick={(event) => {
          if (event.metaKey || event.ctrlKey || event.shiftKey || event.altKey) return
          event.preventDefault()
          onClick()
        }}
        className="flex flex-col h-full cursor-pointer focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--accent)] focus-visible:ring-inset"
        aria-label={post.title}
      >
        {/* Cover image strip */}
        {showCover && (
          <div className="relative h-[138px] overflow-hidden bg-[var(--surface-2,#0e0e12)] flex-shrink-0">
            <img
              src={asset(post.slug)}
              alt={`${post.title} — IFC Viewer Online article cover`}
              width={1800}
              height={945}
              loading="lazy"
              decoding="async"
              className="w-full h-full object-cover object-center opacity-90 group-hover:opacity-100 transition-opacity duration-300"
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
      </a>
    </SpotlightCard>
  )
}

// ─── Featured card ────────────────────────────────────────────────────────────

function FeaturedCard({ post, onClick, theme = 'dark', featuredLabel = 'FEATURED', readLabel = 'Read' }: {
  post: BlogPost
  onClick: () => void
  theme?: 'dark' | 'light'
  featuredLabel?: string
  readLabel?: string
}) {
  return (
    <a
      href={postHref(post.slug, post.lang ?? 'en')}
      onClick={(event) => {
        if (event.metaKey || event.ctrlKey || event.shiftKey || event.altKey) return
        event.preventDefault()
        onClick()
      }}
      className="group block relative rounded-2xl border border-[var(--border)] bg-[var(--surface)] hover:border-[rgba(94,106,210,0.5)] transition-all duration-200 cursor-pointer overflow-hidden focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--accent)]"
      aria-label={post.title}
    >
      {/* Accent gradient overlay on hover */}
      <div
        className="absolute inset-0 opacity-0 group-hover:opacity-100 transition-opacity duration-500 pointer-events-none z-10"
        style={{ background: 'radial-gradient(ellipse at 0% 0%, rgba(94,106,210,0.07) 0%, transparent 65%)' }}
      />

      {/* Mobile hero image strip — shown only on mobile */}
      <div className="sm:hidden relative h-[130px] overflow-hidden bg-black">
        <img
          src={asset(post.slug)}
          alt={`${post.title} — IFC Viewer Online featured article cover`}
          width={1800}
          height={945}
          loading="eager"
          decoding="async"
          className="w-full h-full object-cover opacity-90 group-hover:opacity-100 transition-opacity duration-300"
        />
        <div
          className="absolute inset-0"
          style={{ background: 'linear-gradient(to bottom, transparent 30%, var(--surface) 100%)' }}
        />
      </div>

      {/* Content + desktop image layout */}
      <div className="sm:grid sm:grid-cols-[1fr_300px] lg:grid-cols-[1fr_380px]">
        {/* Text column */}
        <div className="relative flex flex-col gap-3 sm:gap-4 p-5 sm:p-8 z-20">
          <div className="flex items-center gap-2">
            <span className="inline-flex items-center gap-1.5 px-2 py-0.5 rounded-full border border-[rgba(94,106,210,0.35)] bg-[rgba(94,106,210,0.10)] text-[10px] font-mono font-bold text-[var(--accent-2)] tracking-wider">
              {featuredLabel}
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
              {readLabel}
              <Icons.ArrowRight size={11} />
            </span>
          </div>
        </div>

        {/* Desktop hero image column */}
        <div className="hidden sm:block relative overflow-hidden bg-black border-l border-[var(--border)]">
          <img
            src={asset(post.slug)}
            alt={`${post.title} — IFC Viewer Online featured article cover`}
            width={1800}
            height={945}
            loading="eager"
            decoding="async"
            className="absolute inset-0 w-full h-full object-cover opacity-90 group-hover:opacity-100 transition-opacity duration-500"
          />
          <div
            className="absolute inset-0"
            style={{ background: 'linear-gradient(to right, var(--surface) 0%, transparent 35%)' }}
          />
        </div>
      </div>
    </a>
  )
}

// ─── Blog list ────────────────────────────────────────────────────────────────

/** Free-handbook shelf on the blog index — real links, so it also feeds /ebook. */
function EbookBanner() {
  return (
    <div className="mt-4 sm:mt-5 grid gap-3 sm:gap-4 sm:grid-cols-2">
      {EBOOKS.map((book) => (
        <a
          key={book.id}
          href={`/ebook/${book.route ? `${book.route}/` : ''}`}
          className="flex items-start gap-4 rounded-2xl border border-[var(--border)] bg-[var(--surface-2)] p-4 sm:p-5 transition-colors hover:border-[var(--accent)]"
        >
          <img
            src={`/${book.coverFile}`}
            alt={`Cover of ${book.title}`}
            width={794}
            height={1123}
            loading="lazy"
            className="w-[58px] sm:w-[64px] h-auto shrink-0 rounded-md"
            style={{ boxShadow: '0 10px 22px -12px rgba(0,0,0,.7), 0 0 0 1px rgba(255,255,255,.06)' }}
          />
          <div className="min-w-0 flex-1">
            <p className="text-[10.5px] font-medium uppercase tracking-[0.14em] text-[var(--accent-2)]">
              Free PDF · {book.pages} pages
            </p>
            <p className="mt-1 text-[15px] sm:text-[16px] font-semibold tracking-tight text-[var(--text)]">
              {book.title}
            </p>
            <p className="mt-1.5 text-[13px] leading-[1.6] text-[var(--text-dim)]">{book.blurb}</p>
            <span className="mt-2.5 inline-flex items-center gap-1.5 text-[12.5px] font-semibold text-[var(--accent-2)]">
              Get it free
              <Icons.ArrowRight size={12} aria-hidden="true" />
            </span>
          </div>
        </a>
      ))}
    </div>
  )
}

function JourneyIcon({ id }: { id: string }) {
  const Icon = id === 'start' ? Icons.FileIfc
    : id === 'validate' ? Icons.Check
      : id === 'repair' ? Icons.Warn
        : id === 'deliver' ? Icons.Layers
          : id === 'choose' ? Icons.Search
            : Icons.Globe
  return <Icon size={18} aria-hidden="true" />
}

function JourneyCard({ journey, active, onSelect }: {
  journey: BlogJourney
  active: boolean
  onSelect: () => void
}) {
  return (
    <button
      type="button"
      onClick={onSelect}
      aria-pressed={active}
      className={`group min-h-[176px] text-left rounded-2xl border p-5 sm:p-6 cursor-pointer transition-colors duration-200 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--accent)] ${
        active
          ? 'border-[var(--accent)] bg-[rgba(94,106,210,0.12)]'
          : 'border-[var(--border)] bg-[var(--surface)] hover:border-[var(--border-strong)] hover:bg-[var(--surface-2)]'
      }`}
    >
      <span className={`inline-flex w-10 h-10 items-center justify-center rounded-xl border ${active ? 'border-[rgba(129,140,248,.45)] bg-[rgba(94,106,210,.18)] text-[var(--accent-2)]' : 'border-[var(--border)] bg-[var(--surface-2)] text-[var(--text-dim)] group-hover:text-[var(--accent-2)]'}`}>
        <JourneyIcon id={journey.id} />
      </span>
      <span className="mt-4 block text-[15px] sm:text-[16px] font-semibold tracking-[-0.015em] text-[var(--text)]">{journey.title}</span>
      <span className="mt-1.5 block text-[13px] leading-[1.6] text-[var(--text-dim)]">{journey.description}</span>
      <span className="mt-4 inline-flex items-center gap-1.5 text-[12px] font-semibold text-[var(--accent-2)]">
        {journey.cta}
        <Icons.ArrowRight size={12} className="transition-transform duration-200 group-hover:translate-x-0.5" aria-hidden="true" />
      </span>
    </button>
  )
}

function LabCard({ post, label, cta, onClick }: { post: BlogPost; label: string; cta: string; onClick: () => void }) {
  return (
    <a
      href={postHref(post.slug, post.lang ?? 'en')}
      onClick={(event) => {
        if (event.metaKey || event.ctrlKey || event.shiftKey || event.altKey) return
        event.preventDefault()
        onClick()
      }}
      className="group relative min-h-[260px] overflow-hidden rounded-2xl border border-[var(--border)] bg-black cursor-pointer focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--accent)]"
    >
      <img
        src={asset(post.slug)}
        alt={`${post.title} — ${label}`}
        width={1800}
        height={945}
        loading="lazy"
        decoding="async"
        className="absolute inset-0 w-full h-full object-cover opacity-75 transition-opacity duration-300 group-hover:opacity-90"
      />
      <span className="absolute inset-0 bg-[linear-gradient(to_bottom,rgba(5,7,12,.08),rgba(5,7,12,.94)_78%)]" aria-hidden="true" />
      <span className="relative z-10 flex min-h-[260px] flex-col justify-end p-5">
        <span className="mb-2 font-mono text-[9px] font-bold tracking-[0.14em] text-cyan-300">{label}</span>
        <span className="text-[16px] font-semibold leading-[1.35] text-white">{post.title}</span>
        <span className="mt-3 inline-flex items-center gap-1.5 text-[12px] font-semibold text-cyan-200">
          {cta}<Icons.ArrowRight size={12} aria-hidden="true" />
        </span>
      </span>
    </a>
  )
}

function BlogFaqSection({ title, description, faqs }: {
  title: string
  description: string
  faqs: Array<{ q: string; a: string }>
}) {
  const [open, setOpen] = React.useState<number | null>(0)
  return (
    <section className="border-t border-[var(--border)] bg-[var(--surface)]" aria-labelledby="blog-faq-title">
      <div className="max-w-[920px] mx-auto px-4 sm:px-7 py-12 sm:py-16">
        <div className="max-w-[620px]">
          <p className="font-mono text-[10px] font-bold tracking-[0.14em] text-[var(--accent-2)]">FAQ</p>
          <h2 id="blog-faq-title" className="mt-2 text-[24px] sm:text-[32px] font-semibold tracking-[-0.03em] text-[var(--text)]">{title}</h2>
          <p className="mt-3 text-[14px] sm:text-[15px] leading-[1.7] text-[var(--text-dim)]">{description}</p>
        </div>
        <div className="mt-7 divide-y divide-[var(--border)] border-y border-[var(--border)]">
          {faqs.map((faq, index) => {
            const expanded = open === index
            const panelId = `blog-faq-panel-${index}`
            return (
              <div key={faq.q}>
                <button
                  type="button"
                  onClick={() => setOpen(expanded ? null : index)}
                  aria-expanded={expanded}
                  aria-controls={panelId}
                  className="w-full min-h-14 py-4 flex items-center justify-between gap-5 text-left cursor-pointer focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-[var(--accent)]"
                >
                  <span className="text-[14px] sm:text-[15px] font-medium leading-[1.45] text-[var(--text)]">{faq.q}</span>
                  <Icons.Chevron size={15} className={`shrink-0 text-[var(--text-faint)] transition-transform duration-200 ${expanded ? '-rotate-90' : 'rotate-90'}`} aria-hidden="true" />
                </button>
                {expanded && (
                  <div id={panelId} role="region" className="pb-5 pr-10 text-[13.5px] sm:text-[14px] leading-[1.75] text-[var(--text-dim)]">
                    {faq.a}
                  </div>
                )}
              </div>
            )
          })}
        </div>
      </div>
    </section>
  )
}

function BlogList({ lang = 'en', onNavigateToPost, onNavigateToLanding, landingTheme, onToggleLandingTheme }: {
  lang?: string
  onNavigateToPost: (slug: string) => void
  onNavigateToLanding: () => void
  landingTheme: 'dark' | 'light'
  onToggleLandingTheme: () => void
}) {
  const posts    = React.useMemo(() => getBlogPostsByLang(lang), [lang])
  const featured = React.useMemo(() => getFeaturedPost(lang), [lang])
  const copy     = React.useMemo(() => getBlogHubCopy(lang), [lang])
  const [query, setQuery] = React.useState('')
  const deferredQuery = React.useDeferredValue(query)
  const [category, setCategory] = React.useState('all')
  const [sort, setSort] = React.useState<BlogSort>('newest')
  const [activeJourneyId, setActiveJourneyId] = React.useState('')
  const searchRef = React.useRef<HTMLInputElement>(null)
  const resultsRef = React.useRef<HTMLDivElement>(null)
  const activeJourney = copy.journeys.find((journey) => journey.id === activeJourneyId)
  const categories = React.useMemo(() => {
    const found = new Map<string, string>()
    posts.forEach((post) => found.set(post.categorySlug, post.category))
    return [...found.entries()].sort((a, b) => a[1].localeCompare(b[1]))
  }, [posts])
  const filteredPosts = React.useMemo(
    () => filterBlogPosts(posts, { query: deferredQuery, category, journey: activeJourney, sort }),
    [posts, deferredQuery, category, activeJourney, sort],
  )
  const hasFilters = query.trim().length > 0 || category !== 'all' || Boolean(activeJourneyId)
  const gridPosts = hasFilters ? filteredPosts : filteredPosts.filter((post) => post.slug !== featured.slug)
  const spatialJourney = copy.journeys.find((journey) => journey.id === 'spatial')
  const spatialPosts = React.useMemo(
    () => filterBlogPosts(posts, { journey: spatialJourney, sort: 'newest' }).slice(0, 3),
    [posts, spatialJourney],
  )
  const demoCount = posts.filter((post) => post.content.some((block) => block.type === 'spatial-demo')).length

  const revealResults = React.useCallback(() => {
    window.requestAnimationFrame(() => {
      const reduceMotion = window.matchMedia('(prefers-reduced-motion: reduce)').matches
      resultsRef.current?.scrollIntoView({ behavior: reduceMotion ? 'auto' : 'smooth', block: 'start' })
    })
  }, [])

  const selectJourney = (id: string) => {
    setActiveJourneyId((current) => current === id ? '' : id)
    setQuery('')
    setCategory('all')
    revealResults()
  }

  const clearFilters = () => {
    setQuery('')
    setCategory('all')
    setActiveJourneyId('')
    setSort('newest')
    searchRef.current?.focus()
  }

  React.useEffect(() => {
    const onKeyDown = (event: KeyboardEvent) => {
      const target = event.target as HTMLElement | null
      if (event.key !== '/' || event.metaKey || event.ctrlKey || event.altKey || target?.matches('input, textarea, select, [contenteditable="true"]')) return
      event.preventDefault()
      searchRef.current?.focus()
    }
    window.addEventListener('keydown', onKeyDown)
    return () => window.removeEventListener('keydown', onKeyDown)
  }, [])

  React.useEffect(() => {
    const meta = BLOG_LIST_META[lang] ?? BLOG_LIST_META.en
    const previousTitle = document.title
    const previousLang = document.documentElement.lang
    document.title = meta.title
    document.documentElement.lang = lang

    const canonical = document.querySelector<HTMLLinkElement>('link[rel="canonical"]')
    const previousCanonical = canonical?.href ?? ''
    const canonicalUrl = canonical
      ? new URL(window.location.pathname, canonical.href).href
      : window.location.href
    if (canonical) canonical.href = canonicalUrl

    const previous = [
      patchDocumentMeta('meta[name="description"]', meta.description),
      patchDocumentMeta('meta[property="og:type"]', 'website'),
      patchDocumentMeta('meta[property="og:title"]', meta.title),
      patchDocumentMeta('meta[property="og:description"]', meta.description),
      patchDocumentMeta('meta[property="og:url"]', canonicalUrl),
      patchDocumentMeta('meta[name="twitter:title"]', meta.title),
      patchDocumentMeta('meta[name="twitter:description"]', meta.description),
    ]

    return () => {
      document.title = previousTitle
      document.documentElement.lang = previousLang
      if (canonical) canonical.href = previousCanonical
      const selectors = [
        'meta[name="description"]',
        'meta[property="og:type"]',
        'meta[property="og:title"]',
        'meta[property="og:description"]',
        'meta[property="og:url"]',
        'meta[name="twitter:title"]',
        'meta[name="twitter:description"]',
      ]
      selectors.forEach((selector, index) => patchDocumentMeta(selector, previous[index]))
    }
  }, [lang])

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
            {copy.eyebrow}
          </div>

          <h1
            aria-label={`${copy.heroLead} ${copy.heroAccent}`}
            className="font-semibold tracking-[-0.035em] leading-[1.1] text-[var(--text)] mb-3 sm:mb-5 max-w-[640px]"
            style={{ fontSize: 'clamp(26px, 7vw, 54px)' }}
          >
            <BlurText text={copy.heroLead} animateBy="words" delay={50} className="block" />
            <BlurText text={copy.heroAccent} animateBy="words" delay={50} className="block text-[var(--accent-2)]" />
          </h1>

          <p className="text-[14px] sm:text-[16px] leading-[1.65] text-[var(--text-dim)] max-w-[520px]">
            {copy.heroDescription}
          </p>

          <form
            role="search"
            className="mt-6 sm:mt-8 max-w-[720px]"
            onSubmit={(event) => { event.preventDefault(); revealResults() }}
          >
            <label htmlFor="blog-search" className="sr-only">{copy.searchLabel}</label>
            <div className="relative">
              <Icons.Search size={20} className="absolute left-4 top-1/2 -translate-y-1/2 text-[var(--text-faint)]" aria-hidden="true" />
              <input
                ref={searchRef}
                id="blog-search"
                type="search"
                value={query}
                onChange={(event) => setQuery(event.target.value)}
                placeholder={copy.searchPlaceholder}
                autoComplete="off"
                className="w-full h-14 sm:h-[60px] rounded-2xl border border-[var(--border-strong)] bg-[color:var(--surface)] pl-12 pr-24 text-[16px] text-[var(--text)] placeholder:text-[var(--text-faint)] shadow-[0_18px_50px_rgba(0,0,0,.18)] outline-none transition-colors focus:border-[var(--accent)] focus:ring-2 focus:ring-[rgba(94,106,210,.24)]"
              />
              {query ? (
                <button
                  type="button"
                  onClick={() => { setQuery(''); searchRef.current?.focus() }}
                  className="absolute right-2 top-1/2 -translate-y-1/2 w-11 h-11 inline-flex items-center justify-center rounded-xl text-[var(--text-faint)] hover:bg-[var(--surface-2)] hover:text-[var(--text)] cursor-pointer focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--accent)]"
                  aria-label={copy.clearFilters}
                >
                  <Icons.X size={16} aria-hidden="true" />
                </button>
              ) : (
                <kbd className="hidden sm:inline-flex absolute right-3 top-1/2 -translate-y-1/2 items-center h-8 px-2.5 rounded-lg border border-[var(--border)] bg-[var(--surface-2)] font-mono text-[10px] text-[var(--text-faint)]">{copy.searchHint}</kbd>
              )}
            </div>
          </form>

          <dl className="mt-5 flex flex-wrap gap-x-6 gap-y-2 text-[11px] sm:text-[12px] text-[var(--text-faint)]">
            <div className="flex items-baseline gap-1.5"><dt className="order-2">{copy.guidesStat}</dt><dd className="font-mono font-bold text-[var(--text)]">{posts.length}</dd></div>
            <div className="flex items-baseline gap-1.5"><dt className="order-2">{copy.topicsStat}</dt><dd className="font-mono font-bold text-[var(--text)]">{categories.length}</dd></div>
            <div className="flex items-baseline gap-1.5"><dt className="order-2">{copy.demosStat}</dt><dd className="font-mono font-bold text-[var(--text)]">{demoCount}</dd></div>
          </dl>
        </div>
      </header>

      <main className="max-w-[1120px] mx-auto px-4 sm:px-7 py-10 sm:py-16">
        {/* ── Outcome-led paths ── */}
        <section aria-labelledby="blog-journeys-title">
          <div className="max-w-[650px]">
            <p className="font-mono text-[10px] font-bold tracking-[0.14em] text-[var(--accent-2)]">
              {lang === 'es' ? 'RECORRIDOS GUIADOS' : 'GUIDED PATHS'}
            </p>
            <h2 id="blog-journeys-title" className="mt-2 text-[24px] sm:text-[32px] font-semibold tracking-[-0.03em] text-[var(--text)]">
              {copy.journeysTitle}
            </h2>
            <p className="mt-3 text-[14px] sm:text-[15px] leading-[1.7] text-[var(--text-dim)]">{copy.journeysDescription}</p>
          </div>

          <div className="mt-7 grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3 sm:gap-4">
            {copy.journeys.map((journey) => (
              <JourneyCard
                key={journey.id}
                journey={journey}
                active={activeJourneyId === journey.id}
                onSelect={() => selectJourney(journey.id)}
              />
            ))}
          </div>
        </section>

        {/* ── Question shortcuts ── */}
        <section className="mt-12 sm:mt-16 rounded-2xl border border-[var(--border)] bg-[var(--surface)] p-5 sm:p-7" aria-labelledby="blog-questions-title">
          <div className="grid gap-5 lg:grid-cols-[280px_1fr] lg:items-start">
            <div>
              <h2 id="blog-questions-title" className="text-[18px] sm:text-[20px] font-semibold tracking-[-0.02em] text-[var(--text)]">{copy.questionsTitle}</h2>
              <p className="mt-2 text-[13px] leading-[1.65] text-[var(--text-dim)]">{copy.questionsDescription}</p>
            </div>
            <div className="grid gap-2 sm:grid-cols-2">
              {copy.questions.map((question) => (
                <button
                  key={question.label}
                  type="button"
                  onClick={() => {
                    setQuery(question.query ?? '')
                    setActiveJourneyId(question.intent ?? '')
                    setCategory('all')
                    revealResults()
                  }}
                  className="group min-h-12 flex items-center justify-between gap-3 rounded-xl border border-[var(--border)] bg-[var(--surface-2)] px-4 py-3 text-left text-[13px] leading-[1.45] text-[var(--text)] cursor-pointer transition-colors hover:border-[var(--accent)] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--accent)]"
                >
                  <span>{question.label}</span>
                  <Icons.ArrowRight size={13} className="shrink-0 text-[var(--text-faint)] transition-transform duration-200 group-hover:translate-x-0.5 group-hover:text-[var(--accent-2)]" aria-hidden="true" />
                </button>
              ))}
            </div>
          </div>
        </section>

        {!hasFilters && (
          <>
            {/* ── Editorial starting point ── */}
            <section className="mt-12 sm:mt-16" aria-labelledby="blog-featured-title">
              <div className="mb-4 flex items-center justify-between gap-4">
                <h2 id="blog-featured-title" className="text-[18px] sm:text-[20px] font-semibold tracking-[-0.02em] text-[var(--text)]">
                  {lang === 'es' ? 'Empieza por aquí' : 'Start here'}
                </h2>
                <span className="hidden sm:inline text-[12px] text-[var(--text-faint)]">
                  {lang === 'es' ? 'Selección editorial' : 'Editor’s pick'}
                </span>
              </div>
              <FeaturedCard
                post={featured}
                onClick={() => onNavigateToPost(featured.slug)}
                theme={landingTheme}
                featuredLabel={lang === 'es' ? 'DESTACADO' : 'FEATURED'}
                readLabel={lang === 'es' ? 'Leer' : 'Read'}
              />
            </section>

            {/* Free handbooks are English, so they remain on the English index. */}
            {lang === 'en' && (
              <section className="mt-12 sm:mt-16" aria-labelledby="blog-handbooks-title">
                <div className="max-w-[600px]">
                  <p className="font-mono text-[10px] font-bold tracking-[0.14em] text-[var(--accent-2)]">FREE FIELD GUIDES</p>
                  <h2 id="blog-handbooks-title" className="mt-2 text-[22px] sm:text-[26px] font-semibold tracking-[-0.025em] text-[var(--text)]">Take the workflow with you</h2>
                  <p className="mt-2 text-[14px] leading-[1.65] text-[var(--text-dim)]">Downloadable checklists for validation, coordination and IFC delivery.</p>
                </div>
                <EbookBanner />
              </section>
            )}

            {/* ── Working spatial examples ── */}
            {spatialPosts.length > 0 && (
              <section className="mt-12 sm:mt-16" aria-labelledby="blog-lab-title">
                <div className="flex flex-col gap-4 sm:flex-row sm:items-end sm:justify-between">
                  <div className="max-w-[650px]">
                    <p className="font-mono text-[10px] font-bold tracking-[0.14em] text-cyan-500">{copy.labBadge}</p>
                    <h2 id="blog-lab-title" className="mt-2 text-[24px] sm:text-[32px] font-semibold tracking-[-0.03em] text-[var(--text)]">{copy.labTitle}</h2>
                    <p className="mt-3 text-[14px] sm:text-[15px] leading-[1.7] text-[var(--text-dim)]">{copy.labDescription}</p>
                  </div>
                  <button
                    type="button"
                    onClick={() => selectJourney('spatial')}
                    className="self-start sm:self-auto min-h-11 inline-flex items-center gap-2 rounded-xl border border-[var(--border)] bg-[var(--surface)] px-4 text-[13px] font-semibold text-[var(--text)] cursor-pointer transition-colors hover:border-cyan-500 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-cyan-500"
                  >
                    {copy.journeys.find((journey) => journey.id === 'spatial')?.cta}
                    <Icons.ArrowRight size={13} aria-hidden="true" />
                  </button>
                </div>
                <div className="mt-7 grid gap-3 sm:gap-4 md:grid-cols-3">
                  {spatialPosts.map((post) => (
                    <LabCard key={post.slug} post={post} label={copy.labBadge} cta={copy.labCta} onClick={() => onNavigateToPost(post.slug)} />
                  ))}
                </div>
              </section>
            )}
          </>
        )}

        {/* ── Searchable library ── */}
        <section ref={resultsRef} className="mt-14 sm:mt-20 scroll-mt-20" aria-labelledby="all-guides-title">
          <div className="flex flex-col gap-4 lg:flex-row lg:items-end lg:justify-between">
            <div className="max-w-[620px]">
              <p className="font-mono text-[10px] font-bold tracking-[0.14em] text-[var(--accent-2)]">{lang === 'es' ? 'BIBLIOTECA' : 'LIBRARY'}</p>
              <h2 id="all-guides-title" className="mt-2 text-[24px] sm:text-[32px] font-semibold tracking-[-0.03em] text-[var(--text)]">{copy.allGuidesTitle}</h2>
              <p className="mt-3 text-[14px] sm:text-[15px] leading-[1.7] text-[var(--text-dim)]">{copy.allGuidesDescription}</p>
            </div>
            <div className="flex items-center gap-3">
              <label htmlFor="blog-sort" className="text-[12px] font-medium text-[var(--text-dim)]">{copy.sortLabel}</label>
              <select
                id="blog-sort"
                value={sort}
                onChange={(event) => setSort(event.target.value as BlogSort)}
                className="min-h-11 rounded-xl border border-[var(--border)] bg-[var(--surface)] px-3 text-[13px] text-[var(--text)] outline-none cursor-pointer focus:border-[var(--accent)] focus:ring-2 focus:ring-[rgba(94,106,210,.24)]"
              >
                <option value="newest">{copy.newest}</option>
                <option value="shortest">{copy.shortest}</option>
                <option value="title">{copy.alphabetical}</option>
              </select>
            </div>
          </div>

          <div className="mt-7 border-y border-[var(--border)] py-4">
            <p className="mb-3 text-[11px] font-medium uppercase tracking-[0.1em] text-[var(--text-faint)]">{copy.topicsLabel}</p>
            <div className="flex flex-wrap gap-2">
              <button
                type="button"
                aria-pressed={category === 'all'}
                onClick={() => setCategory('all')}
                className={`min-h-11 rounded-xl border px-4 text-[12.5px] font-medium cursor-pointer transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--accent)] ${category === 'all' ? 'border-[var(--accent)] bg-[rgba(94,106,210,.14)] text-[var(--accent-2)]' : 'border-[var(--border)] bg-[var(--surface)] text-[var(--text-dim)] hover:border-[var(--border-strong)] hover:text-[var(--text)]'}`}
              >
                {copy.allTopics}
              </button>
              {categories.map(([slug, label]) => (
                <button
                  key={slug}
                  type="button"
                  aria-pressed={category === slug}
                  onClick={() => setCategory(slug)}
                  className={`min-h-11 rounded-xl border px-4 text-[12.5px] font-medium cursor-pointer transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--accent)] ${category === slug ? 'border-[var(--accent)] bg-[rgba(94,106,210,.14)] text-[var(--accent-2)]' : 'border-[var(--border)] bg-[var(--surface)] text-[var(--text-dim)] hover:border-[var(--border-strong)] hover:text-[var(--text)]'}`}
                >
                  {label}
                </button>
              ))}
            </div>
          </div>

          <div className="mt-5 min-h-11 flex flex-wrap items-center justify-between gap-3">
            <div className="flex flex-wrap items-center gap-2">
              <p aria-live="polite" className="text-[13px] font-medium text-[var(--text-dim)]">
                <span className="font-mono font-bold text-[var(--text)]">{filteredPosts.length}</span>{' '}
                {filteredPosts.length === 1 ? copy.oneResult : copy.manyResults}
              </p>
              {activeJourney && (
                <span className="inline-flex min-h-8 items-center gap-2 rounded-lg border border-[rgba(94,106,210,.35)] bg-[rgba(94,106,210,.10)] px-2.5 text-[11.5px] text-[var(--accent-2)]">
                  {activeJourney.title}
                  <button
                    type="button"
                    onClick={() => setActiveJourneyId('')}
                    className="w-7 h-7 -mr-1 inline-flex items-center justify-center rounded-md cursor-pointer hover:bg-[rgba(94,106,210,.16)] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--accent)]"
                    aria-label={`${copy.clearFilters}: ${activeJourney.title}`}
                  >
                    <Icons.X size={12} aria-hidden="true" />
                  </button>
                </span>
              )}
            </div>
            {hasFilters && (
              <button
                type="button"
                onClick={clearFilters}
                className="min-h-11 inline-flex items-center gap-2 rounded-xl px-3 text-[12.5px] font-semibold text-[var(--accent-2)] cursor-pointer hover:bg-[var(--surface)] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--accent)]"
              >
                <Icons.X size={13} aria-hidden="true" />
                {copy.clearFilters}
              </button>
            )}
          </div>

          {gridPosts.length > 0 ? (
            <div className="mt-4 grid gap-3 sm:gap-4 grid-cols-1 sm:grid-cols-2 lg:grid-cols-3">
              {gridPosts.map((post) => (
                <PostCard key={post.slug} post={post} onClick={() => onNavigateToPost(post.slug)} theme={landingTheme} />
              ))}
            </div>
          ) : (
            <div className="mt-4 rounded-2xl border border-dashed border-[var(--border-strong)] bg-[var(--surface)] px-5 py-12 text-center">
              <span className="mx-auto inline-flex w-12 h-12 items-center justify-center rounded-2xl border border-[var(--border)] bg-[var(--surface-2)] text-[var(--text-faint)]">
                <Icons.Search size={20} aria-hidden="true" />
              </span>
              <h3 className="mt-4 text-[17px] font-semibold text-[var(--text)]">{copy.noResultsTitle}</h3>
              <p className="mx-auto mt-2 max-w-[480px] text-[13.5px] leading-[1.7] text-[var(--text-dim)]">{copy.noResultsBody}</p>
              <button
                type="button"
                onClick={clearFilters}
                className="mt-5 min-h-11 rounded-xl bg-[var(--accent)] px-5 text-[13px] font-semibold text-white cursor-pointer transition-[filter] hover:brightness-110 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--accent)] focus-visible:ring-offset-2 focus-visible:ring-offset-[var(--bg)]"
              >
                {copy.clearFilters}
              </button>
            </div>
          )}
        </section>
      </main>

      <BlogFaqSection title={copy.faqTitle} description={copy.faqDescription} faqs={copy.faqs} />

      {/* ── Footer CTA ── */}
      <div className="border-t border-[var(--border)] bg-[var(--surface-2)] py-8 sm:py-12 px-4 text-center">
        <div className="max-w-[440px] mx-auto">
          <p className="text-[13.5px] sm:text-[15px] text-[var(--text-dim)] mb-4">
            {copy.viewerPrompt}
          </p>
          <button
            onClick={onNavigateToLanding}
            className="w-full sm:w-auto inline-flex items-center justify-center gap-2 min-h-11 px-6 text-[14px] sm:text-[13.5px] font-semibold rounded-xl bg-[var(--accent)] text-white cursor-pointer hover:brightness-110 active:brightness-90 transition-all focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--accent)] focus-visible:ring-offset-2 focus-visible:ring-offset-[var(--surface-2)]"
          >
            {copy.viewerCta}
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
function HeroCoverStrip({ slug, heroImage, alt }: { slug: string; heroImage?: string; alt?: string }) {
  const [visible, setVisible] = React.useState(true)
  if (!visible) return null
  const src = heroImage ? asset(heroImage) : asset(slug)
  const compactHero = heroImage?.replace(/-1600x900(\.[a-z0-9]+)$/i, '-800x450$1')
  const srcSet = compactHero && compactHero !== heroImage
    ? `${asset(compactHero)} 800w, ${src} 1600w`
    : undefined
  return (
    <div className="relative h-[240px] sm:h-[420px] overflow-hidden bg-black border-b border-[var(--border)]">
      <img
        src={src}
        srcSet={srcSet}
        sizes="100vw"
        alt={alt ?? ''}
        width={1600}
        height={900}
        className="w-full h-full object-cover object-center opacity-[0.88]"
        decoding="async"
        onError={() => setVisible(false)}
      />
      <div
        className="absolute inset-0"
        style={{ background: 'linear-gradient(to bottom, transparent 58%, var(--bg) 100%)' }}
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
    const metaTitle = post.seoTitle ?? post.title
    const metaDescription = post.seoDescription ?? post.excerpt
    const brandedTitle = `${metaTitle} | IFC Viewer Online`
    document.title = brandedTitle.length <= 64 ? brandedTitle : metaTitle
    const prevLang = document.documentElement.lang
    document.documentElement.lang = post.lang ?? 'en'

    const coverUrl = new URL(asset(post.heroImage ?? post.slug), window.location.origin).href

    const update = (sel: string, attr: string, val: string) => {
      const el = document.querySelector(sel)
      const prev = el?.getAttribute(attr) ?? ''
      el?.setAttribute(attr, val)
      return prev
    }

    const prevOgImg  = update('meta[property="og:image"]',       'content', coverUrl)
    const prevTwImg  = update('meta[name="twitter:image"]',      'content', coverUrl)
    const prevDesc   = update('meta[name="description"]',         'content', metaDescription)
    const prevOgType = update('meta[property="og:type"]',         'content', 'article')
    const prevOgT    = update('meta[property="og:title"]',       'content', post.title)
    const prevTwT    = update('meta[name="twitter:title"]',      'content', post.title)
    const prevOgD    = update('meta[property="og:description"]', 'content', metaDescription)
    const prevTwD    = update('meta[name="twitter:description"]','content', metaDescription)
    const prevOgAlt  = update('meta[property="og:image:alt"]',    'content', post.heroAlt ?? post.title)
    const prevTwAlt  = update('meta[name="twitter:image:alt"]',   'content', post.heroAlt ?? post.title)
    const canonical = document.querySelector<HTMLLinkElement>('link[rel="canonical"]')
    const prevCanonical = canonical?.href ?? ''
    const canonicalUrl = canonical ? new URL(window.location.pathname, canonical.href).href : window.location.href
    if (canonical) canonical.href = canonicalUrl
    const prevOgUrl = update('meta[property="og:url"]', 'content', canonicalUrl)

    return () => {
      document.title = prevTitle
      document.documentElement.lang = prevLang
      update('meta[property="og:image"]',       'content', prevOgImg)
      update('meta[name="twitter:image"]',      'content', prevTwImg)
      update('meta[name="description"]',         'content', prevDesc)
      update('meta[property="og:type"]',         'content', prevOgType)
      update('meta[property="og:title"]',       'content', prevOgT)
      update('meta[name="twitter:title"]',      'content', prevTwT)
      update('meta[property="og:description"]', 'content', prevOgD)
      update('meta[name="twitter:description"]','content', prevTwD)
      update('meta[property="og:image:alt"]',    'content', prevOgAlt)
      update('meta[name="twitter:image:alt"]',   'content', prevTwAlt)
      update('meta[property="og:url"]',          'content', prevOgUrl)
      if (canonical) canonical.href = prevCanonical
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
      <HeroCoverStrip slug={post.slug} heroImage={post.heroImage} alt={post.heroAlt} />

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
