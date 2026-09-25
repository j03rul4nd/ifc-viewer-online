import React from 'react'
import { motion } from 'framer-motion'
import { getBlogPost, getBlogPostsByLang, getFeaturedPost, isBlogLanguageReady, loadBlogLanguage, type BlogPost, type ContentBlock, type RichText } from '../lib/blog-posts'
import * as Icons from './Icons'
import { EBOOKS, PRIMARY_EBOOK, ebookById } from '../lib/ebook'
import SpotlightCard  from './reactbits/SpotlightCard'
import CountUp        from './reactbits/CountUp'
import FaultyTerminal from './reactbits/FaultyTerminal'
import SoftAurora     from './reactbits/SoftAurora'
import ReadingProgress             from './blog/ReadingProgress'
import TableOfContents, { extractHeadings, slugify } from './blog/TableOfContents'
import CodeBlock                   from './blog/CodeBlock'
import CopyForAI                   from './blog/CopyForAI'
import BimGlossary                 from './blog/BimGlossary'
import HealthScoreWidget, { HealthScoreRow } from './blog/HealthScoreWidget'
import EmbedViewer from './blog/EmbedViewer'
import EmbedConfigurator from './blog/EmbedConfigurator'
import SpatialMediaDemo from './blog/SpatialMediaDemo'
import SmartTable from './blog/SmartTable'
import { editorialCopy } from '../lib/blog-editorial-copy'
import { serpWidth } from '../lib/serp-width'
import { QuoteShare, SectionLink, SelectionShare } from './blog/ShareKit'
import { StatRow } from './blog/EditorialBlocks'
import { AnnotatedImage } from './blog/ImageViewer'
import { Citation, PostPreviewLink, ReferenceList, ReferencesProvider } from './blog/References'
import { ContinueReading, RecsProvider, RelatedPoint, ToolCard, readHistory, type RecsNav } from './blog/Recommendations'
import { relatedPosts } from '../lib/blog-related'
import { foundationalPosts, freshness, inboundLinks, lastTouched, topicsFor, whatsNew, type Topic } from '../lib/blog-topics'
import { BLOG_TOOLS, toolCopy, toolHref, type BlogTool } from '../lib/blog-tools'
import { trackBlogPostOpened, trackBlogSearch, trackBlogToolClicked, trackBlogTopicOpened, type BlogSurface } from '../lib/analytics'
import './blog/editorial.css'
import { Bars, Callout, Decision, Steps, Takeaways, Term } from './blog/EditorialBlocks'
import {
  filterBlogPosts,
  getBlogHubCopy,
  type BlogHubCopy,
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
  pt: {
    title: 'Blog de BIM e IFC — Guias práticos para coordenadores BIM | IFC Viewer',
    description: 'Guias práticos para coordenadores BIM: como corrigir erros de validação IFC, melhorar o Health Score e entregar modelos limpos ao CDE.',
  },
  it: {
    title: 'Blog BIM e IFC — Guide pratiche per BIM coordinator | IFC Viewer',
    description: 'Guide pratiche per BIM coordinator: come correggere gli errori di validazione IFC, migliorare l’Health Score e consegnare modelli puliti al CDE.',
  },
  ca: {
    title: 'Blog BIM i IFC — Guies pràctiques per a coordinadors BIM | IFC Viewer',
    description: 'Guies pràctiques per a coordinadors BIM: com corregir errors de validació IFC, millorar l’Health Score i lliurar models nets al CDE.',
  },
  zh: {
    title: 'BIM 与 IFC 博客——BIM 协调员实用指南 | IFC Viewer',
    description: '面向 BIM 协调员的实用指南：修复 IFC 验证错误、提高 Health Score，并向 CDE 交付干净的模型。',
  },
  ja: {
    title: 'BIM・IFCブログ｜BIMコーディネーターの実践ガイド',
    description: 'BIMコーディネーター向けの実践ガイド。IFCの検証エラーの直し方、Health Scoreの改善、CDEへのクリーンなモデル納品を解説します。',
  },
  th: {
    title: 'บล็อก BIM และ IFC — คู่มือสำหรับผู้ประสานงาน BIM | IFC Viewer',
    description: 'คู่มือเชิงปฏิบัติสำหรับผู้ประสานงาน BIM: แก้ข้อผิดพลาดจากการตรวจสอบ IFC ปรับปรุง Health Score และส่งมอบโมเดลที่เรียบร้อยเข้าสู่ CDE',
  },
}

function patchDocumentMeta(selector: string, value: string): string {
  const element = document.querySelector<HTMLMetaElement>(selector)
  const previous = element?.content ?? ''
  if (element) element.content = value
  return previous
}

// ─── Design helpers ───────────────────────────────────────────────────────────

function formatDate(iso: string, lang = 'en'): string {
  return new Date(iso).toLocaleDateString(lang === 'en' ? 'en-US' : lang, {
    year: 'numeric', month: 'long', day: 'numeric',
  })
}

/** Category pill colours live in editorial.css (`.cat-pill[data-cat]`), with
 *  darker light-mode variants — the dark-mode tints fail contrast on white. */
function catColor(slug: string): string {
  return `cat-pill cat-${slug}`
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
        if ('def' in seg) return <Term key={i} text={seg.text} def={seg.def} lang={lang} />
        if ('cite' in seg) return <Citation key={i} id={seg.cite} text={seg.text} />
        if ('to' in seg) {
          // Internal post link — real href for crawlers/middle-click, SPA nav on
          // click, and a preview of the target post on hover/focus.
          return (
            <PostPreviewLink
              key={i}
              slug={seg.to}
              lang={lang}
              href={postHref(seg.to, lang)}
              onNavigate={() => onNavigateToPost(seg.to)}
              className={INLINE_LINK_CLASS}
            >
              {seg.text}
            </PostPreviewLink>
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
          <SectionLink id={slugify(block.text)} heading={block.text} lang={lang} />
        </h2>
      )

    case 'h3':
      return (
        <h3
          id={slugify(block.text)}
          className="scroll-mt-20 text-[15px] sm:text-[16.5px] font-semibold tracking-tight text-[var(--text)] mt-6 sm:mt-8 mb-2.5"
        >
          {block.text}
          <SectionLink id={slugify(block.text)} heading={block.text} lang={lang} />
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
      return <CodeBlock code={block.text} lang={block.lang} articleLang={lang} />

    case 'callout':
      return (
        <Callout variant={block.variant} title={block.title} lang={lang}>
          <RenderInline text={block.text} lang={lang} onNavigateToPost={onNavigateToPost} />
        </Callout>
      )

    case 'takeaways':
      return (
        <Takeaways
          title={block.title}
          lang={lang}
          items={block.items.map((item, i) => <RenderInline key={i} text={item} lang={lang} onNavigateToPost={onNavigateToPost} />)}
        />
      )

    case 'steps':
      return (
        <Steps
          lang={lang}
          items={block.items.map((step) => ({
            title: step.title,
            detailLabel: step.detailLabel,
            body: step.body && <RenderInline text={step.body} lang={lang} onNavigateToPost={onNavigateToPost} />,
            detail: step.detail && <RenderInline text={step.detail} lang={lang} onNavigateToPost={onNavigateToPost} />,
          }))}
        />
      )

    case 'decision':
      return (
        <Decision
          question={block.question}
          lang={lang}
          options={block.options.map((opt) => ({
            label: opt.label,
            verdict: opt.verdict,
            body: <RenderInline text={opt.body} lang={lang} onNavigateToPost={onNavigateToPost} />,
            link: opt.to && (
              <RenderInline
                text={[{ text: `${opt.linkText ?? editorialCopy(lang).readGuide} →`, to: opt.to }]}
                lang={lang}
                onNavigateToPost={onNavigateToPost}
              />
            ),
          }))}
        />
      )

    case 'related':
      return <RelatedPoint to={block.to} section={block.section} why={block.why} />

    case 'tool':
      return <ToolCard id={block.id} why={block.why} />

    case 'bars':
      return <Bars title={block.title} unit={block.unit} max={block.max} caption={block.caption} items={block.items} lang={lang} />

    case 'image': {
      const src = asset(block.src)
      const srcSet = block.srcSet?.map((item) => `${asset(item.src)} ${item.width}w`).join(', ')
      const ui = editorialCopy(lang)
      return (
        <AnnotatedImage
          annotations={block.annotations}
          copy={{ enlarge: ui.enlarge, close: ui.close, zoomIn: ui.zoomIn, zoomOut: ui.zoomOut, reset: ui.resetZoom, hint: ui.zoomHint }}
          image={
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
          }
          caption={(block.caption || block.credit) && (
            <>
              {block.caption}
              {block.credit && <span>{block.caption ? ' · ' : ''}{block.credit}</span>}
              {block.license && (
                <span> · <a href={block.license} target="_blank" rel="license noopener noreferrer" className="hover:underline">
                  {block.license.includes('creativecommons.org/licenses/by/4.0') ? 'CC BY 4.0' : 'Image licence'}
                </a></span>
              )}
            </>
          )}
        />
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
        <StatRow
          stats={block.stats}
          renderCount={(s, reduced) => (
            <CountUp
              to={s.value}
              prefix={s.prefix}
              suffix={s.suffix}
              from={reduced ? s.value : 0}
              stiffness={70}
              damping={20}
              numberClassName={`${block.stats.length === 3 ? 'text-[22px]' : 'text-[26px]'} sm:text-[32px] font-semibold tracking-tight text-[var(--text)] tabular-nums`}
              labelClassName="text-[11px] sm:text-[11.5px] text-[var(--text-faint)] mt-1 leading-tight"
              label={s.label}
              className="flex flex-col items-center"
            />
          )}
        />
      )

    case 'feature-grid':
      return (
        <div className="my-8 grid grid-cols-1 sm:grid-cols-2 gap-2.5 sm:gap-3">
          {block.items.map((item, i) => (
            <SpotlightCard
              key={i}
              className="p-4 sm:p-5 rounded-xl border border-[var(--border)] bg-[var(--surface)] h-full"
              spotlightColor="rgba(94,106,210,0.13)"
            >
              {/* Phone: icon beside the text — half the height of a stacked card. */}
              <div className="flex gap-3.5 sm:block">
                <div className="text-[20px] sm:text-[22px] sm:mb-3 leading-none shrink-0 mt-0.5 sm:mt-0" aria-hidden="true">{item.icon}</div>
                <div className="min-w-0">
                  <h3 className="text-[14.5px] font-semibold tracking-tight text-[var(--text)] mb-1">
                    {item.title}
                  </h3>
                  <p className="text-[14px] sm:text-[13.5px] text-[var(--text-dim)] leading-[1.65]">
                    {item.body}
                  </p>
                </div>
              </div>
            </SpotlightCard>
          ))}
        </div>
      )

    case 'comparison':
      return (
        <div className="my-8 grid grid-cols-1 sm:grid-cols-2 gap-2.5 sm:gap-3">
          {[block.left, block.right].map((side, si) => {
            const accent = side.color === 'accent'
            return (
              <section
                key={si}
                aria-label={side.label}
                className={`p-4 sm:p-5 rounded-xl border ${
                  accent
                    ? 'border-[rgba(94,106,210,0.4)] bg-[rgba(94,106,210,0.05)]'
                    : 'border-[var(--border)] bg-[var(--surface)]'
                }`}
              >
                <h3 className={`text-[11px] font-mono font-bold uppercase tracking-[0.12em] mb-3.5 ${
                  accent ? 'text-[var(--accent-2)]' : 'text-[var(--text-faint)]'
                }`}>
                  {side.label}
                </h3>
                <ul className="space-y-2.5" role="list">
                  {side.items.map((item, i) => (
                    <li key={i} className="flex gap-2.5 text-[14px] sm:text-[13.5px] leading-[1.6] text-[var(--text-dim)]">
                      <span aria-hidden="true" className={`shrink-0 mt-[3px] ${accent ? 'text-[var(--accent-2)]' : 'text-[var(--text-faint)]'}`}>
                        {accent ? <Icons.Check size={14} strokeWidth={2} /> : <span className="block mt-[4px] mx-[4px] h-1.5 w-1.5 rounded-full border border-current" />}
                      </span>
                      {item}
                    </li>
                  ))}
                </ul>
              </section>
            )
          })}
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
          <QuoteShare quote={block.text} pageUrl={typeof location !== 'undefined' ? location.href : ''} title={typeof document !== 'undefined' ? document.title : ''} lang={lang} />
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
                className="mt-4 flex w-full sm:inline-flex sm:w-auto min-h-[44px] items-center justify-center gap-2 rounded-lg px-4 py-2.5 text-[14px] sm:text-[13.5px] font-semibold text-white transition-opacity hover:opacity-90"
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

    case 'table':
      return (
        <SmartTable
          headers={block.headers}
          rows={block.rows}
          caption={block.caption}
          rowHeaders={block.rowHeaders ?? true}
          layout={block.layout}
          lang={lang}
        />
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

function PostCard({ post, onClick, theme = 'dark', from, position, read, copy, lang = 'en' }: {
  post: BlogPost
  onClick: () => void
  theme?: 'dark' | 'light'
  from: BlogSurface
  position?: number
  read: Set<string>
  copy: BlogHubCopy
  lang?: string
}) {
  const [showCover, setShowCover] = React.useState(true)
  const badges = cardBadges(post, read, copy)
  const touched = lastTouched(post)
  return (
    <SpotlightCard
      className="group rounded-2xl border border-[var(--border)] bg-[var(--surface)] hover:border-[rgba(94,106,210,0.4)] active:scale-[0.99] hover:-translate-y-[2px] transition-all duration-200 cursor-pointer overflow-hidden"
      spotlightColor={theme === 'dark' ? 'rgba(94,106,210,0.10)' : 'rgba(94,106,210,0.08)'}
    >
      <a
        href={postHref(post.slug, post.lang ?? 'en')}
        onClick={(event) => {
          trackBlogPostOpened({ from, lang, position })
          if (event.metaKey || event.ctrlKey || event.shiftKey || event.altKey) return
          event.preventDefault()
          onClick()
        }}
        className="flex flex-col h-full cursor-pointer focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--accent)] focus-visible:ring-inset"
      >
        {/* Cover image strip. The covers restate the title as an image, so a
            phone — where every pixel of height is scroll — skips them. */}
        {showCover && (
          <div className="relative hidden sm:block h-[138px] overflow-hidden bg-[var(--surface-2,#0e0e12)] flex-shrink-0">
            <img
              src={asset(post.slug)}
              alt=""
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
          {/* Category + at most two decision signals (new/updated, read, demo) */}
          <div className="mb-3 flex flex-wrap items-center gap-1.5">
            <span className={`inline-flex px-2 py-0.5 rounded-full text-[10.5px] font-semibold ${catColor(post.categorySlug)}`}>
              {post.category}
            </span>
            {badges.map((b) => <Badge key={b.label} {...b} />)}
          </div>

          {/* Title */}
          <h3 className={`flex-1 text-[15px] font-semibold tracking-[-0.01em] leading-[1.35] text-[var(--text)] mb-2 transition-colors line-clamp-2 ${theme === 'dark' ? 'group-hover:text-white' : 'group-hover:text-[var(--accent)]'}`}>
            {post.title}
          </h3>

          {/* Excerpt — 2 lines */}
          <p className="text-[13px] leading-[1.6] text-[var(--text-dim)] line-clamp-2 mb-3">
            {post.excerpt}
          </p>

          {/* Meta */}
          <div className="flex items-center justify-between pt-3 border-t border-[var(--border)]">
            <div className="flex items-center gap-1.5 text-[11px] text-[var(--text-faint)]">
              <time dateTime={touched}>{touched !== post.date ? `${copy.updatedBadge} · ` : ''}{formatDate(touched, lang)}</time>
              <span aria-hidden="true">·</span>
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

          <h3
            className={`font-semibold tracking-[-0.03em] leading-[1.2] text-[var(--text)] transition-colors ${theme === 'dark' ? 'group-hover:text-white' : 'group-hover:text-[var(--accent)]'}`}
            style={{ fontSize: 'clamp(18px, 4vw, 28px)' }}
          >
            {post.title}
          </h3>

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
    <div className="mt-4 sm:mt-5 grid gap-3 sm:gap-4 sm:grid-cols-2 lg:grid-cols-1">
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

// ─── Landing building blocks ──────────────────────────────────────────────────

const TODAY = new Date()

/** Only what helps decide whether to read: freshness first, then read, then demo. */
function cardBadges(post: BlogPost, read: Set<string>, copy: BlogHubCopy): Array<{ label: string; tone: 'accent' | 'ok' | 'demo' }> {
  const out: Array<{ label: string; tone: 'accent' | 'ok' | 'demo' }> = []
  const fresh = freshness(post, TODAY)
  if (fresh === 'new') out.push({ label: copy.newBadge, tone: 'accent' })
  else if (fresh === 'updated') out.push({ label: copy.updatedBadge, tone: 'accent' })
  if (read.has(post.slug)) out.push({ label: copy.readBadge, tone: 'ok' })
  else if (hasDemo(post)) out.push({ label: copy.demoBadge, tone: 'demo' })
  return out.slice(0, 2)
}

function hasDemo(post: BlogPost): boolean {
  return post.content.some((b) => b.type === 'spatial-demo' || b.type === 'ifc-demo' || b.type === 'embed-configurator')
}

function Badge({ label, tone }: { label: string; tone: 'accent' | 'ok' | 'demo' }) {
  const cls = tone === 'ok'
    ? 'text-[var(--ok)] border-[color-mix(in_srgb,var(--ok)_35%,var(--border))]'
    : tone === 'demo'
      ? 'text-[var(--text-dim)] border-[var(--border-strong)]'
      : 'text-[var(--accent-2)] border-[color-mix(in_srgb,var(--accent)_45%,var(--border))]'
  return (
    <span className={`inline-flex h-5 items-center gap-1 rounded-full border px-2 text-[10.5px] font-semibold ${cls}`}>
      {tone === 'ok' && <Icons.Check size={10} strokeWidth={2.4} aria-hidden="true" />}
      {label}
    </span>
  )
}

/** SPA link to a post, with the surface it was opened from for analytics. */
function PostLink({ post, from, position, onNavigate, className, children }: {
  post: BlogPost
  from: BlogSurface
  position?: number
  onNavigate: (slug: string) => void
  className?: string
  children: React.ReactNode
}) {
  const lang = post.lang ?? 'en'
  return (
    <a
      href={postHref(post.slug, lang)}
      onClick={(event) => {
        trackBlogPostOpened({ from, lang, position })
        if (event.metaKey || event.ctrlKey || event.shiftKey || event.altKey || event.button !== 0) return
        event.preventDefault()
        onNavigate(post.slug)
      }}
      className={className}
    >
      {children}
    </a>
  )
}

/** A compact, text-first row: for lists where the reader scans titles. */
function PostRow({ post, from, position, copy, read, onNavigate, lang }: {
  post: BlogPost
  from: BlogSurface
  position: number
  copy: BlogHubCopy
  read: Set<string>
  onNavigate: (slug: string) => void
  lang: string
}) {
  const badges = cardBadges(post, read, copy)
  const touched = lastTouched(post)
  return (
    <li className="py-3.5 first:pt-0 last:pb-0">
      <PostLink post={post} from={from} position={position} onNavigate={onNavigate} className="group block rounded-lg focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--accent)]">
        <span className="flex flex-wrap items-center gap-x-2 gap-y-1 text-[11.5px] text-[var(--text-faint)]">
          <span className={`inline-flex rounded-full px-2 py-px text-[10px] font-semibold ${catColor(post.categorySlug)}`}>{post.category}</span>
          <time dateTime={touched}>{touched !== post.date ? `${copy.updatedBadge} · ` : ''}{formatDate(touched, lang)}</time>
          <span aria-hidden="true">·</span>
          <span>{post.readTimeMin} min</span>
          {badges.map((b) => <Badge key={b.label} {...b} />)}
        </span>
        <span className="mt-1 block text-[15px] font-semibold leading-snug tracking-[-0.01em] text-[var(--text)] group-hover:text-[var(--accent-2)]">
          {post.title}
        </span>
      </PostLink>
    </li>
  )
}

/**
 * The hero's animated canvas is decoration, so it must never compete with the
 * content for the first paint or for a phone's battery: it mounts only on a
 * wide screen, without reduced motion, once the page is idle. Everyone else
 * gets the static gradient, which is also what shows until it mounts.
 */
function HeroBackdrop({ theme }: { theme: 'dark' | 'light' }) {
  const [live, setLive] = React.useState(false)
  React.useEffect(() => {
    const mq = window.matchMedia?.('(min-width: 1024px) and (prefers-reduced-motion: no-preference)')
    if (!mq?.matches) return
    const w = window as Window & { requestIdleCallback?: (cb: () => void, o?: { timeout: number }) => number; cancelIdleCallback?: (id: number) => void }
    if (w.requestIdleCallback) {
      const id = w.requestIdleCallback(() => setLive(true), { timeout: 2500 })
      return () => w.cancelIdleCallback?.(id)
    }
    const t = window.setTimeout(() => setLive(true), 1200)
    return () => window.clearTimeout(t)
  }, [])

  const staticBg = theme === 'dark'
    ? 'radial-gradient(ellipse 80% 70% at 15% 0%, rgba(94,106,210,0.22), transparent 60%), radial-gradient(ellipse 60% 60% at 90% 10%, rgba(34,211,238,0.08), transparent 60%)'
    : 'radial-gradient(ellipse 80% 70% at 15% 0%, rgba(54,69,196,0.14), transparent 60%), linear-gradient(180deg, #eef0ff 0%, var(--bg) 100%)'

  return (
    <div className="absolute inset-0 pointer-events-none" aria-hidden="true">
      <div className="absolute inset-0" style={{ background: staticBg }} />
      {live && theme === 'dark' && (
        <div className="absolute inset-0 opacity-70">
          <FaultyTerminal
            scale={2.2} gridMul={[3, 1]} digitSize={1.0} timeScale={0.15} tint="#5E6AD2"
            scanlineIntensity={0.7} glitchAmount={0.9} flickerAmount={0.6} noiseAmp={0.9} brightness={0.55}
            mouseReact={true} mouseStrength={0.35} curvature={0} chromaticAberration={0} pageLoadAnimation={false}
            className="w-full h-full"
          />
        </div>
      )}
      {live && theme === 'light' && (
        <div className="absolute inset-0" style={{ opacity: 0.6 }}>
          <SoftAurora color1="#3645C4" color2="#6B7FE8" brightness={0.45} speed={0.25} scale={1.2} bandHeight={0.52} bandSpread={0.9} noiseAmplitude={0.8} layerOffset={0.8} />
        </div>
      )}
      <div className="absolute inset-0" style={{ background: 'linear-gradient(to bottom, transparent 40%, var(--bg) 100%)' }} />
    </div>
  )
}

function SectionHeading({ id, title, description, action }: { id: string; title: string; description?: string; action?: React.ReactNode }) {
  return (
    <div className="flex flex-col gap-3 sm:flex-row sm:items-end sm:justify-between">
      <div className="max-w-[640px]">
        <h2 id={id} className="text-[21px] sm:text-[26px] font-semibold tracking-[-0.025em] text-[var(--text)]">{title}</h2>
        {description && <p className="mt-1.5 text-[14px] leading-[1.65] text-[var(--text-dim)]">{description}</p>}
      </div>
      {action}
    </div>
  )
}

function topicHref(slug: string, lang: string): string {
  const prefix = lang === 'en' ? '' : `${lang}/`
  return `${BASE}${prefix}blog/topic/${slug}/`
}

function blogHomeHref(lang: string): string {
  return `${BASE}${lang === 'en' ? '' : `${lang}/`}blog/`
}

/** A topic entry: the hub link, and its two most-referenced guides as direct routes. */
function TopicCard({ topic, lang, copy, onOpenTopic, onNavigate, inbound }: {
  topic: Topic
  lang: string
  copy: BlogHubCopy
  onOpenTopic: (slug: string, from: BlogSurface) => void
  onNavigate: (slug: string) => void
  inbound: Map<string, number>
}) {
  const top = [...topic.posts].sort((a, b) => (inbound.get(b.slug) ?? 0) - (inbound.get(a.slug) ?? 0) || b.date.localeCompare(a.date)).slice(0, 2)
  return (
    <article className="relative flex h-full flex-col rounded-2xl border border-[var(--border)] bg-[var(--surface)] p-4 sm:p-5">
      <div className="flex items-center justify-between gap-3">
        <span className={`inline-flex rounded-full px-2 py-0.5 text-[10.5px] font-semibold ${catColor(topic.slug)}`}>{topic.label}</span>
        <span className="text-[11.5px] tabular-nums text-[var(--text-faint)]">{copy.topicGuides(topic.posts.length)}</span>
      </div>
      <h3 className="mt-3 text-[16px] font-semibold leading-snug tracking-[-0.015em] text-[var(--text)]">
        <a
          href={topicHref(topic.slug, lang)}
          onClick={(e) => {
            if (e.metaKey || e.ctrlKey || e.shiftKey || e.altKey || e.button !== 0) return
            e.preventDefault()
            onOpenTopic(topic.slug, 'topic_card')
          }}
          // Phone: stretched over the whole card (one big target). From sm up
          // the card also holds direct guide links, so only the title links.
          className="hover:text-[var(--accent-2)] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--accent)] rounded after:absolute after:inset-0 after:content-[''] sm:after:hidden"
        >
          {topic.copy.title}
        </a>
      </h3>
      {/* Phone: the card is a compact route (label, title, count); the intro and
          the two direct guides appear from sm up, where there is room to scan. */}
      <p className="mt-1.5 hidden sm:block text-[13px] leading-[1.6] text-[var(--text-dim)] line-clamp-3">{topic.copy.intro}</p>
      <ul className="mt-3 hidden sm:block space-y-1.5 border-t border-[var(--border)] pt-3" role="list">
        {top.map((p) => (
          <li key={p.slug}>
            <PostLink post={p} from="topic_card" onNavigate={onNavigate} className="group flex items-start gap-2 text-[13px] leading-snug text-[var(--text)] hover:text-[var(--accent-2)]">
              <Icons.ArrowRight size={12} aria-hidden="true" className="mt-[3px] shrink-0 text-[var(--text-faint)] group-hover:text-[var(--accent-2)]" />
              <span className="line-clamp-2">{p.title}</span>
            </PostLink>
          </li>
        ))}
      </ul>
    </article>
  )
}

function ToolLinks({ tools, lang, from }: { tools: BlogTool[]; lang: string; from: BlogSurface }) {
  return (
    <ul className="grid gap-2.5 sm:grid-cols-2 lg:grid-cols-3" role="list">
      {tools.map((tool) => {
        const t = toolCopy(tool, lang)
        return (
          <li key={tool.id}>
            <a
              href={toolHref(tool, lang)}
              onClick={() => trackBlogToolClicked({ tool: tool.id, from, lang })}
              className="group flex h-full flex-col rounded-xl border border-[var(--border)] bg-[var(--surface)] p-4 transition-colors hover:border-[color-mix(in_srgb,var(--accent)_50%,var(--border))] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--accent)]"
            >
              <span className="text-[14.5px] font-semibold tracking-tight text-[var(--text)]">{t.name}</span>
              <span className="mt-1 flex-1 text-[13px] leading-[1.6] text-[var(--text-dim)]">{t.blurb}</span>
              <span className="mt-2.5 inline-flex items-center gap-1 text-[13px] font-medium text-[var(--accent-2)]">
                {t.action}<Icons.ArrowRight size={12} aria-hidden="true" className="transition-transform group-hover:translate-x-0.5" />
              </span>
            </a>
          </li>
        )
      })}
    </ul>
  )
}

// ─── Blog list ────────────────────────────────────────────────────────────────
//
// The landing is organised around what the reader came to do, in the order a
// phone reaches it (see docs/BLOG_LANDING.md):
//
//   1. hero — what this is, a search, and real questions as shortcuts
//   2. picked for you — only for a returning reader (read history)
//   3. start here — the editor's pick + the most-referenced guides
//   4. explore by topic — each topic is a real, indexable hub page
//   5. new and updated — for the reader who comes back
//   6. handbooks (EN) and the 3D lab — the two conversion surfaces
//   7. the full library — search, topic filter, sort
//
// While a search or filter is active, 2–6 step aside so results come first.

const TOPIC_PATH_RE = /\/blog\/topic\/([^/]+)\/?$/

function topicFromPath(): string {
  if (typeof window === 'undefined') return ''
  return TOPIC_PATH_RE.exec(window.location.pathname)?.[1] ?? ''
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
  const chrome   = editorialCopy(lang).post
  const topics   = React.useMemo(() => topicsFor(posts, lang), [posts, lang])
  const inbound  = React.useMemo(() => inboundLinks(posts), [posts])
  const [topicSlug, setTopicSlug] = React.useState(topicFromPath)
  const topic = topics.find((t) => t.slug === topicSlug)
  const [read, setRead] = React.useState<Set<string>>(() => new Set())
  const [query, setQuery] = React.useState('')
  const deferredQuery = React.useDeferredValue(query)
  const [category, setCategory] = React.useState('all')
  const [sort, setSort] = React.useState<BlogSort>('newest')
  const searchRef = React.useRef<HTMLInputElement>(null)
  const resultsRef = React.useRef<HTMLDivElement>(null)

  // Read history is per-browser and only known after mount.
  React.useEffect(() => { setRead(readHistory()) }, [])

  // Topic hubs are real URLs: follow back/forward between them and the index.
  React.useEffect(() => {
    const onPop = () => setTopicSlug(topicFromPath())
    window.addEventListener('popstate', onPop)
    return () => window.removeEventListener('popstate', onPop)
  }, [])

  const openTopic = React.useCallback((slug: string, from: BlogSurface | 'breadcrumb') => {
    history.pushState(null, '', slug ? topicHref(slug, lang) : blogHomeHref(lang))
    setTopicSlug(slug)
    setQuery('')
    setCategory('all')
    if (slug) trackBlogTopicOpened({ topic: slug, from, lang })
    window.scrollTo(0, 0)
  }, [lang])

  const categories = React.useMemo(() => {
    const found = new Map<string, string>()
    posts.forEach((post) => found.set(post.categorySlug, post.category))
    return [...found.entries()].sort((a, b) => a[1].localeCompare(b[1]))
  }, [posts])
  const filteredPosts = React.useMemo(
    () => filterBlogPosts(posts, { query: deferredQuery, category, sort }),
    [posts, deferredQuery, category, sort],
  )
  const hasFilters = query.trim().length > 0 || category !== 'all'

  // Search analytics: one event per settled query, never the text itself.
  React.useEffect(() => {
    const q = deferredQuery.trim()
    if (q.length < 2) return
    const t = window.setTimeout(() => trackBlogSearch({ query_length: q.length, results: filteredPosts.length, lang }), 900)
    return () => window.clearTimeout(t)
  }, [deferredQuery, filteredPosts.length, lang])

  const foundational = React.useMemo(
    () => foundationalPosts(posts.filter((p) => p.slug !== featured.slug), 2, posts),
    [posts, featured.slug],
  )
  const fresh = React.useMemo(() => whatsNew(posts, 5), [posts])
  const picked = React.useMemo(() => {
    if (read.size === 0) return []
    // Recommend from the most recently published posts the reader has read.
    const readPosts = posts.filter((p) => read.has(p.slug))
    const seen = new Set<string>()
    const out: BlogPost[] = []
    for (const p of readPosts.slice(0, 5)) {
      for (const r of relatedPosts(p, posts, 6, read)) {
        if (read.has(r.post.slug) || seen.has(r.post.slug)) continue
        seen.add(r.post.slug)
        out.push(r.post)
      }
    }
    return out.slice(0, 3)
  }, [posts, read])
  const spatialTopic = topics.find((t) => t.slug === 'digital-twins')
  const spatialPosts = React.useMemo(
    () => posts.filter((p) => p.categorySlug === 'digital-twins' && hasDemo(p)).slice(0, 3),
    [posts],
  )
  const demoCount = posts.filter(hasDemo).length

  const revealResults = React.useCallback(() => {
    window.requestAnimationFrame(() => {
      const reduceMotion = window.matchMedia('(prefers-reduced-motion: reduce)').matches
      resultsRef.current?.scrollIntoView({ behavior: reduceMotion ? 'auto' : 'smooth', block: 'start' })
    })
  }, [])

  const clearFilters = () => {
    setQuery('')
    setCategory('all')
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

  // Head tags follow the view: the index, or the topic hub being shown.
  React.useEffect(() => {
    const base = BLOG_LIST_META[lang] ?? BLOG_LIST_META.en
    const meta = topic
      ? { title: `${topic.copy.title} | IFC Viewer Blog`, description: topic.copy.intro }
      : base
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

    const selectors = [
      'meta[name="description"]',
      'meta[property="og:type"]',
      'meta[property="og:title"]',
      'meta[property="og:description"]',
      'meta[property="og:url"]',
      'meta[name="twitter:title"]',
      'meta[name="twitter:description"]',
    ]
    const values = [meta.description, 'website', meta.title, meta.description, canonicalUrl, meta.title, meta.description]
    const previous = selectors.map((selector, i) => patchDocumentMeta(selector, values[i]))

    return () => {
      document.title = previousTitle
      document.documentElement.lang = previousLang
      if (canonical) canonical.href = previousCanonical
      selectors.forEach((selector, index) => patchDocumentMeta(selector, previous[index]))
    }
  }, [lang, topic])

  const navBg = landingTheme === 'dark'
    ? 'bg-[rgba(10,10,14,0.88)]'
    : 'bg-[rgba(245,246,250,0.92)]'

  const nav = (
    <nav className={`lp-sticky-nav sticky top-0 z-20 border-b border-[var(--border)] backdrop-blur-[14px] ${navBg}`}>
      <div className="max-w-[1120px] mx-auto px-4 sm:px-7 h-[54px] flex items-center justify-between">
        <button
          onClick={onNavigateToLanding}
          className="flex items-center gap-2 text-[13px] text-[var(--text-dim)] hover:text-[var(--text)] transition-colors"
        >
          <Icons.Chevron size={12} className="rotate-180" />
          <span>IFC Viewer</span>
        </button>
        <a
          href={blogHomeHref(lang)}
          onClick={(e) => { if (e.metaKey || e.ctrlKey || e.button !== 0) return; e.preventDefault(); openTopic('', 'breadcrumb') }}
          className="flex items-center gap-1.5"
        >
          <Icons.Logo size={15} className="text-[var(--text-faint)]" aria-hidden="true" />
          <span className="text-[13.5px] font-semibold tracking-tight">{chrome.blog}</span>
        </a>
        <div className="flex items-center gap-2">
          <ThemeToggleBtn theme={landingTheme} onToggle={onToggleLandingTheme} />
          <button
            onClick={onNavigateToLanding}
            className="inline-flex items-center gap-1.5 h-[30px] px-3 text-[12.5px] font-semibold rounded-[8px] bg-[var(--accent)] text-white hover:brightness-110 transition-all"
          >
            <Icons.ArrowRight size={12} />
            {chrome.openViewer}
          </button>
        </div>
      </div>
    </nav>
  )

  const footer = (
    <BlogFooter
      lang={lang}
      copy={copy}
      topics={topics}
      onOpenTopic={openTopic}
      onNavigateToLanding={onNavigateToLanding}
    />
  )

  if (topic) {
    return (
      <motion.div key={topic.slug} initial={{ opacity: 0 }} animate={{ opacity: 1 }} transition={{ duration: 0.2 }} className="min-h-screen bg-[var(--bg)]">
        {nav}
        <TopicHubView
          topic={topic}
          topics={topics}
          lang={lang}
          copy={copy}
          read={read}
          inbound={inbound}
          theme={landingTheme}
          onOpenTopic={openTopic}
          onNavigateToPost={onNavigateToPost}
        />
        {footer}
      </motion.div>
    )
  }

  return (
    <motion.div
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      transition={{ duration: 0.3 }}
      className="min-h-screen bg-[var(--bg)]"
    >
      {nav}

      {/* ── 1. Hero: what this is, and the fastest way in ── */}
      <header className="relative overflow-hidden border-b border-[var(--border)]">
        <HeroBackdrop theme={landingTheme} />
        <div className="relative max-w-[1120px] mx-auto px-4 sm:px-7 pt-7 sm:pt-[52px] pb-7 sm:pb-12 z-10">
          <p className="inline-flex items-center gap-2 mb-3 sm:mb-4 px-2.5 py-1 rounded-full border border-[var(--border)] bg-[var(--surface)] text-[11px] font-mono text-[var(--text-faint)]">
            <span className="w-1.5 h-1.5 rounded-full bg-[var(--accent)]" aria-hidden="true" />
            {copy.eyebrow}
          </p>

          {/* Static on purpose: the heading is the page's largest text — its
              LCP element — and must paint at once, not fade in from a blur. */}
          <h1
            className="font-semibold tracking-[-0.035em] leading-[1.1] text-[var(--text)] mb-3 sm:mb-4 max-w-[680px]"
            style={{ fontSize: 'clamp(28px, 7vw, 52px)' }}
          >
            <span className="block">{copy.heroLead}</span>
            <span className="block text-[var(--accent-2)]">{copy.heroAccent}</span>
          </h1>

          <p className="text-[14.5px] sm:text-[16px] leading-[1.65] text-[var(--text-dim)] max-w-[560px]">
            {copy.heroDescription}
          </p>

          <form
            role="search"
            className="mt-5 sm:mt-7 max-w-[720px]"
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
                enterKeyHint="search"
                className="w-full h-14 sm:h-[60px] rounded-2xl border border-[var(--border-strong)] bg-[color:var(--surface)] pl-12 pr-14 sm:pr-24 text-[16px] text-[var(--text)] placeholder:text-[var(--text-faint)] shadow-[0_18px_50px_rgba(0,0,0,.18)] outline-none transition-colors focus:border-[var(--accent)] focus:ring-2 focus:ring-[rgba(94,106,210,.24)]"
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

          {/* Real questions as one-tap routes — for the reader who knows the
              problem but not our vocabulary. Scrolls sideways on a phone. */}
          <div className="mt-3.5 max-w-[720px]">
            <p className="sr-only">{copy.questionsLabel}</p>
            <ul className="ed-chips" role="list">
              {copy.questions.map((question) => (
                <li key={question.label}>
                  <button
                    type="button"
                    onClick={() => {
                      if (question.intent === 'spatial' && spatialTopic) { openTopic(spatialTopic.slug, 'library'); return }
                      setQuery(question.query ?? '')
                      setCategory('all')
                      revealResults()
                    }}
                    className="ed-chip ed-focus"
                  >
                    {question.label}
                  </button>
                </li>
              ))}
            </ul>
          </div>

          <dl className="mt-5 flex flex-wrap gap-x-6 gap-y-2 text-[11.5px] sm:text-[12px] text-[var(--text-faint)]">
            <div className="flex items-baseline gap-1.5"><dt className="order-2">{copy.guidesStat}</dt><dd className="font-mono font-bold text-[var(--text)]">{posts.length}</dd></div>
            <div className="flex items-baseline gap-1.5"><dt className="order-2">{copy.topicsStat}</dt><dd className="font-mono font-bold text-[var(--text)]">{categories.length}</dd></div>
            <div className="flex items-baseline gap-1.5"><dt className="order-2">{copy.demosStat}</dt><dd className="font-mono font-bold text-[var(--text)]">{demoCount}</dd></div>
          </dl>
        </div>
      </header>

      <main className="max-w-[1120px] mx-auto px-4 sm:px-7 py-8 sm:py-14">
        {!hasFilters && (
          <>
            {/* ── 2. Returning reader ── */}
            {picked.length > 0 && (
              <section className="mb-12 sm:mb-16" aria-labelledby="blog-continue-title">
                <SectionHeading id="blog-continue-title" title={copy.continueTitle} description={copy.continueDescription} />
                <div className="mt-5 grid gap-3 sm:gap-4 sm:grid-cols-2 lg:grid-cols-3">
                  {picked.map((post, i) => (
                    <PostCard key={post.slug} post={post} from="continue" position={i} read={read} copy={copy} lang={lang} onClick={() => onNavigateToPost(post.slug)} theme={landingTheme} />
                  ))}
                </div>
              </section>
            )}

            {/* ── 3. Start here ── */}
            <section aria-labelledby="blog-featured-title">
              <SectionHeading id="blog-featured-title" title={copy.startHereTitle} description={copy.startHereDescription} />
              <div className="mt-5 grid gap-3 sm:gap-4 lg:grid-cols-[minmax(0,1.6fr)_minmax(0,1fr)]">
                <FeaturedCard
                  post={featured}
                  onClick={() => { trackBlogPostOpened({ from: 'start_here', lang, position: 0 }); onNavigateToPost(featured.slug) }}
                  theme={landingTheme}
                  featuredLabel={copy.editorsPick.toUpperCase()}
                  readLabel={chrome.read}
                />
                <div className="rounded-2xl border border-[var(--border)] bg-[var(--surface)] p-4 sm:p-5">
                  <p className="text-[11px] font-semibold uppercase tracking-[0.1em] text-[var(--text-faint)]">{copy.foundationalLabel}</p>
                  <ul className="mt-3 divide-y divide-[var(--border)]" role="list">
                    {foundational.map((post, i) => (
                      <PostRow key={post.slug} post={post} from="start_here" position={i + 1} copy={copy} read={read} lang={lang} onNavigate={onNavigateToPost} />
                    ))}
                  </ul>
                </div>
              </div>
            </section>

            {/* ── 4. Topics — each a real page ── */}
            {/* One topic is not a choice — it stays linked from the lab and footer. */}
            {topics.length > 1 && (
              <section className="mt-12 sm:mt-16" aria-labelledby="blog-topics-title">
                <SectionHeading id="blog-topics-title" title={copy.topicsTitle} description={copy.topicsDescription} />
                <div className="mt-5 grid gap-3 sm:gap-4 sm:grid-cols-2 lg:grid-cols-3">
                  {topics.map((t) => (
                    <TopicCard key={t.slug} topic={t} lang={lang} copy={copy} inbound={inbound} onOpenTopic={openTopic} onNavigate={onNavigateToPost} />
                  ))}
                </div>
              </section>
            )}

            {/* ── 5. New and updated ── */}
            <section className="mt-12 sm:mt-16 grid gap-8 lg:grid-cols-[minmax(0,1fr)_minmax(0,1fr)] lg:gap-10" aria-labelledby="blog-new-title">
              <div>
                <SectionHeading id="blog-new-title" title={copy.whatsNewTitle} description={copy.whatsNewDescription} />
                <ul className="mt-5 divide-y divide-[var(--border)]" role="list">
                  {fresh.map((post, i) => (
                    <PostRow key={post.slug} post={post} from="whats_new" position={i} copy={copy} read={read} lang={lang} onNavigate={onNavigateToPost} />
                  ))}
                </ul>
              </div>
              {/* Free handbooks are English, so they stay on the English index. */}
              {lang === 'en' && (
                <div aria-labelledby="blog-handbooks-title" role="region">
                  <p className="font-mono text-[10px] font-bold tracking-[0.14em] text-[var(--accent-2)]">FREE FIELD GUIDES</p>
                  <h2 id="blog-handbooks-title" className="mt-2 text-[21px] sm:text-[26px] font-semibold tracking-[-0.025em] text-[var(--text)]">Take the workflow with you</h2>
                  <p className="mt-1.5 text-[14px] leading-[1.65] text-[var(--text-dim)]">Downloadable checklists for validation, coordination and IFC delivery.</p>
                  <EbookBanner />
                </div>
              )}
            </section>

            {/* ── 6. The 3D lab: the digital-twins topic, shown by its demos ── */}
            {spatialPosts.length > 0 && (
              <section className="mt-12 sm:mt-16" aria-labelledby="blog-lab-title">
                <SectionHeading
                  id="blog-lab-title"
                  title={copy.labTitle}
                  description={copy.labDescription}
                  action={spatialTopic && (
                    <a
                      href={topicHref(spatialTopic.slug, lang)}
                      onClick={(e) => { if (e.metaKey || e.ctrlKey || e.button !== 0) return; e.preventDefault(); openTopic(spatialTopic.slug, 'lab') }}
                      className="self-start sm:self-auto min-h-11 inline-flex items-center gap-2 rounded-xl border border-[var(--border)] bg-[var(--surface)] px-4 text-[13px] font-semibold text-[var(--text)] transition-colors hover:border-cyan-500 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-cyan-500"
                    >
                      {copy.exploreTopic}: {spatialTopic.label}
                      <Icons.ArrowRight size={13} aria-hidden="true" />
                    </a>
                  )}
                />
                <div className="mt-5 grid gap-3 sm:gap-4 md:grid-cols-3">
                  {spatialPosts.map((post, i) => (
                    <LabCard key={post.slug} post={post} label={copy.labBadge} cta={copy.labCta} onClick={() => { trackBlogPostOpened({ from: 'lab', lang, position: i }); onNavigateToPost(post.slug) }} />
                  ))}
                </div>
              </section>
            )}
          </>
        )}

        {/* ── 7. The library ── */}
        <section ref={resultsRef} className={`${hasFilters ? 'mt-0' : 'mt-14 sm:mt-20'} scroll-mt-20`} aria-labelledby="all-guides-title">
          <SectionHeading
            id="all-guides-title"
            title={copy.allGuidesTitle}
            description={copy.allGuidesDescription}
            action={
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
            }
          />

          <div className="mt-5 border-y border-[var(--border)] py-3.5">
            <p className="mb-2.5 text-[11px] font-medium uppercase tracking-[0.1em] text-[var(--text-faint)]" id="blog-topic-filter-label">{copy.topicsLabel}</p>
            <div className="ed-chips" role="group" aria-labelledby="blog-topic-filter-label">
              <button type="button" aria-pressed={category === 'all'} onClick={() => setCategory('all')} className="ed-chip ed-focus">
                {copy.allTopics}
              </button>
              {categories.map(([slug, label]) => (
                <button key={slug} type="button" aria-pressed={category === slug} onClick={() => setCategory(slug)} className="ed-chip ed-focus">
                  {label}
                </button>
              ))}
            </div>
          </div>

          <div className="mt-4 min-h-11 flex flex-wrap items-center justify-between gap-3">
            <p aria-live="polite" className="text-[13px] font-medium text-[var(--text-dim)]">
              <span className="font-mono font-bold text-[var(--text)]">{filteredPosts.length}</span>{' '}
              {filteredPosts.length === 1 ? copy.oneResult : copy.manyResults}
            </p>
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

          {filteredPosts.length > 0 ? (
            <div className="mt-4 grid gap-3 sm:gap-4 grid-cols-1 sm:grid-cols-2 lg:grid-cols-3">
              {filteredPosts.map((post, i) => (
                <PostCard key={post.slug} post={post} from="library" position={i} read={read} copy={copy} lang={lang} onClick={() => onNavigateToPost(post.slug)} theme={landingTheme} />
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
      {footer}
    </motion.div>
  )
}

// ─── Topic hub ────────────────────────────────────────────────────────────────
// A topic's own page: what it covers, the guide to start with, every article in
// it, and the tools for its problems — the "pillar" a search for the topic
// should land on, and what every article's breadcrumb links up to.

function TopicHubView({ topic, topics, lang, copy, read, inbound, theme, onOpenTopic, onNavigateToPost }: {
  topic: Topic
  topics: Topic[]
  lang: string
  copy: BlogHubCopy
  read: Set<string>
  inbound: Map<string, number>
  theme: 'dark' | 'light'
  onOpenTopic: (slug: string, from: BlogSurface | 'breadcrumb') => void
  onNavigateToPost: (slug: string) => void
}) {
  const [pillar, ...rest] = [...topic.posts].sort(
    (a, b) => (inbound.get(b.slug) ?? 0) - (inbound.get(a.slug) ?? 0) || b.date.localeCompare(a.date),
  )
  const others = [...rest].sort((a, b) => lastTouched(b).localeCompare(lastTouched(a)))
  const tools = React.useMemo(() => {
    const hay = [topic.copy.title, topic.copy.intro, ...topic.posts.flatMap((p) => [p.title, ...(p.keywords ?? [])])].join(' ').toLowerCase()
    return BLOG_TOOLS
      .map((t) => ({ t, hits: t.terms.filter((term) => hay.includes(term)).length }))
      .filter((x) => x.hits > 0)
      .sort((a, b) => b.hits - a.hits)
      .slice(0, 3)
      .map((x) => x.t)
  }, [topic])

  return (
    <main className="max-w-[1120px] mx-auto px-4 sm:px-7 pt-6 sm:pt-10 pb-12 sm:pb-16">
      <nav aria-label="Breadcrumb" className="text-[12.5px] text-[var(--text-faint)]">
        <ol className="flex flex-wrap items-center gap-1.5" role="list">
          <li>
            <a
              href={blogHomeHref(lang)}
              onClick={(e) => { if (e.metaKey || e.ctrlKey || e.button !== 0) return; e.preventDefault(); onOpenTopic('', 'breadcrumb') }}
              className="hover:text-[var(--text)]"
            >
              Blog
            </a>
          </li>
          <li aria-hidden="true">/</li>
          <li aria-current="page" className="text-[var(--text-dim)]">{topic.label}</li>
        </ol>
      </nav>

      <header className="mt-4 max-w-[760px]">
        <p className="text-[11px] font-semibold uppercase tracking-[0.12em] text-[var(--accent-2)]">
          {copy.topicEyebrow} · {copy.topicGuides(topic.posts.length)}
        </p>
        <h1 className="mt-2 font-semibold tracking-[-0.03em] leading-[1.15] text-[var(--text)]" style={{ fontSize: 'clamp(26px, 6vw, 44px)' }}>
          {topic.copy.title}
        </h1>
        <p className="mt-3 text-[15px] sm:text-[16.5px] leading-[1.65] text-[var(--text-dim)]">{topic.copy.intro}</p>
      </header>

      {pillar && (
        <section className="mt-8 sm:mt-10" aria-labelledby="topic-start-title">
          <h2 id="topic-start-title" className="mb-3 text-[11px] font-semibold uppercase tracking-[0.12em] text-[var(--text-faint)]">{copy.startWith}</h2>
          <FeaturedCard
            post={pillar}
            onClick={() => { trackBlogPostOpened({ from: 'topic_hub', lang, position: 0 }); onNavigateToPost(pillar.slug) }}
            theme={theme}
            featuredLabel={copy.foundationalLabel.toUpperCase()}
            readLabel={editorialCopy(lang).post.read}
          />
        </section>
      )}

      {others.length > 0 && (
        <section className="mt-10 sm:mt-14" aria-labelledby="topic-all-title">
          <h2 id="topic-all-title" className="text-[21px] sm:text-[26px] font-semibold tracking-[-0.025em] text-[var(--text)]">
            {copy.topicAllGuides(topic.posts.length)}
          </h2>
          <div className="mt-5 grid gap-3 sm:gap-4 grid-cols-1 sm:grid-cols-2 lg:grid-cols-3">
            {others.map((post, i) => (
              <PostCard key={post.slug} post={post} from="topic_hub" position={i + 1} read={read} copy={copy} lang={lang} onClick={() => onNavigateToPost(post.slug)} theme={theme} />
            ))}
          </div>
        </section>
      )}

      {tools.length > 0 && (
        <section className="mt-10 sm:mt-14" aria-labelledby="topic-tools-title">
          <h2 id="topic-tools-title" className="mb-4 text-[21px] sm:text-[26px] font-semibold tracking-[-0.025em] text-[var(--text)]">{copy.topicTools}</h2>
          <ToolLinks tools={tools} lang={lang} from="topic_hub" />
        </section>
      )}

      {topics.length > 1 && (
        <section className="mt-10 sm:mt-14 border-t border-[var(--border)] pt-8" aria-labelledby="topic-others-title">
          <h2 id="topic-others-title" className="mb-3 text-[11px] font-semibold uppercase tracking-[0.12em] text-[var(--text-faint)]">{copy.otherTopics}</h2>
          <ul className="flex flex-wrap gap-2" role="list">
            {topics.filter((t) => t.slug !== topic.slug).map((t) => (
              <li key={t.slug}>
                <a
                  href={topicHref(t.slug, lang)}
                  onClick={(e) => { if (e.metaKey || e.ctrlKey || e.button !== 0) return; e.preventDefault(); onOpenTopic(t.slug, 'topic_hub') }}
                  className="ed-chip ed-focus inline-flex items-center gap-2"
                >
                  {t.label}<span className="text-[11px] tabular-nums text-[var(--text-faint)]">{t.posts.length}</span>
                </a>
              </li>
            ))}
            <li>
              <a
                href={blogHomeHref(lang)}
                onClick={(e) => { if (e.metaKey || e.ctrlKey || e.button !== 0) return; e.preventDefault(); onOpenTopic('', 'breadcrumb') }}
                className="ed-chip ed-focus inline-flex items-center"
              >
                {copy.allArticles}
              </a>
            </li>
          </ul>
        </section>
      )}
    </main>
  )
}

// ─── Editorial footer ─────────────────────────────────────────────────────────
// Every topic and tool, one click from any blog page: the crawl path to the
// hubs, and the route from reading to using the product.

function BlogFooter({ lang, copy, topics, onOpenTopic, onNavigateToLanding }: {
  lang: string
  copy: BlogHubCopy
  topics: Topic[]
  onOpenTopic: (slug: string, from: BlogSurface | 'breadcrumb') => void
  onNavigateToLanding: () => void
}) {
  const tools = BLOG_TOOLS.filter((t) => ['validator', 'fix-guides', 'viewer', 'embed', 'sdk'].includes(t.id))
  return (
    <footer className="border-t border-[var(--border)] bg-[var(--surface-2)]">
      <div className="max-w-[1120px] mx-auto px-4 sm:px-7 py-10 sm:py-14 grid gap-8 sm:grid-cols-[minmax(0,1.2fr)_minmax(0,1fr)_minmax(0,1fr)]">
        <div>
          <p className="text-[15px] sm:text-[16px] font-semibold text-[var(--text)]">{copy.viewerPrompt}</p>
          <button
            onClick={onNavigateToLanding}
            className="mt-4 w-full sm:w-auto inline-flex items-center justify-center gap-2 min-h-11 px-5 text-[14px] font-semibold rounded-xl bg-[var(--accent)] text-white cursor-pointer hover:brightness-110 active:brightness-90 transition-all focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--accent)] focus-visible:ring-offset-2 focus-visible:ring-offset-[var(--surface-2)]"
          >
            {copy.viewerCta}
            <Icons.ArrowRight size={14} />
          </button>
        </div>
        {topics.length > 0 && (
          <nav aria-labelledby="blog-footer-topics">
            <h2 id="blog-footer-topics" className="text-[11px] font-semibold uppercase tracking-[0.12em] text-[var(--text-faint)]">{copy.footerTopics}</h2>
            <ul className="mt-3 space-y-0.5" role="list">
              {topics.map((t) => (
                <li key={t.slug}>
                  <a
                    href={topicHref(t.slug, lang)}
                    onClick={(e) => { if (e.metaKey || e.ctrlKey || e.button !== 0) return; e.preventDefault(); onOpenTopic(t.slug, 'footer') }}
                    className="inline-flex min-h-9 items-center text-[13.5px] text-[var(--text-dim)] hover:text-[var(--text)]"
                  >
                    {t.label}
                  </a>
                </li>
              ))}
            </ul>
          </nav>
        )}
        <nav aria-labelledby="blog-footer-tools">
          <h2 id="blog-footer-tools" className="text-[11px] font-semibold uppercase tracking-[0.12em] text-[var(--text-faint)]">{copy.footerTools}</h2>
          <ul className="mt-3 space-y-0.5" role="list">
            {tools.map((tool) => (
              <li key={tool.id}>
                <a
                  href={toolHref(tool, lang)}
                  onClick={() => trackBlogToolClicked({ tool: tool.id, from: 'footer', lang })}
                  className="inline-flex min-h-9 items-center text-[13.5px] text-[var(--text-dim)] hover:text-[var(--text)]"
                >
                  {toolCopy(tool, lang).name}
                </a>
              </li>
            ))}
          </ul>
        </nav>
      </div>
    </footer>
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
    <div className="relative h-[240px] sm:h-[420px] overflow-hidden bg-[var(--surface-2)] border-b border-[var(--border)]">
      <img
        src={src}
        srcSet={srcSet}
        sizes="100vw"
        alt={alt ?? ''}
        width={1600}
        height={900}
        className="w-full h-full object-cover object-center"
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
  const bodyRef = React.useRef<HTMLDivElement>(null)
  const postTopic = React.useMemo(
    () => topicsFor(getBlogPostsByLang(post.lang ?? 'en'), post.lang ?? 'en').find((t) => t.slug === post.categorySlug),
    [post.lang, post.categorySlug],
  )
  const recsNav = React.useMemo<RecsNav>(() => ({
    lang: post.lang ?? 'en',
    slugify,
    hrefFor: (slug: string) => postHref(slug, post.lang ?? 'en'),
    navigate: (slug: string, section?: string) => {
      if (slug === post.slug) {
        if (section) document.getElementById(section)?.scrollIntoView({ block: 'start' })
        return
      }
      onNavigateToPost(slug)
      // The route change pushed the post URL synchronously; add the section
      // before the next post renders, so it lands there instead of the top.
      if (section) history.replaceState(history.state, '', `${window.location.pathname}#${section}`)
    },
  }), [post.slug, post.lang, onNavigateToPost])

  const refsCtx = React.useMemo(() => ({
    refs: post.references ?? [],
    lang: post.lang ?? 'en',
    hrefFor: (slug: string) => postHref(slug, post.lang ?? 'en'),
    navigate: onNavigateToPost,
  }), [post, onNavigateToPost])

  // Entering a post: land on the section the URL names (#id — shared section
  // links, references), else at the top. Content above can still grow while
  // images and embeds lay out, so re-aim for a short while until it settles.
  React.useLayoutEffect(() => {
    const id = decodeURIComponent(window.location.hash.slice(1))
    if (id.startsWith(':~:')) return // text fragment: the browser scrolls to it
    if (!id || id.includes('=')) { window.scrollTo(0, 0); return }
    let tries = 0
    let timer = 0
    const aim = () => {
      const el = document.getElementById(id)
      if (el && Math.abs(el.getBoundingClientRect().top - 80) > 2) el.scrollIntoView({ block: 'start' })
      if (++tries < 12) timer = window.setTimeout(aim, 120)
    }
    aim()
    // The reader scrolling themselves wins over our correction.
    const stop = () => window.clearTimeout(timer)
    const opts = { once: true, passive: true } as const
    window.addEventListener('wheel', stop, opts)
    window.addEventListener('touchstart', stop, opts)
    window.addEventListener('keydown', stop, { once: true })
    return () => {
      stop()
      window.removeEventListener('wheel', stop)
      window.removeEventListener('touchstart', stop)
      window.removeEventListener('keydown', stop)
    }
  }, [post.slug])
  const headings = extractHeadings(post.content)
  const chrome = editorialCopy(post.lang ?? 'en').post

  // Update document title + OG/Twitter meta while viewing a specific post.
  React.useEffect(() => {
    const prevTitle = document.title
    const metaTitle = post.seoTitle ?? post.title
    const metaDescription = post.seoDescription ?? post.excerpt
    const brandedTitle = `${metaTitle} | IFC Viewer Online`
    // Same rule as the static page (generate-blog-pages.ts): brand only when it fits.
    document.title = serpWidth(brandedTitle) <= 60 ? brandedTitle : metaTitle
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
    <RecsProvider value={recsNav}>
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
            <span className="hidden sm:inline">{chrome.allArticles}</span>
            <span className="sm:hidden">{chrome.blog}</span>
          </button>

          <div className="hidden sm:flex items-center gap-1.5">
            <Icons.Logo size={15} className="text-[var(--text-faint)]" aria-hidden="true" />
            <span className="text-[13.5px] font-semibold tracking-tight">{chrome.blog}</span>
          </div>

          <div className="flex items-center gap-2">
            <ThemeToggleBtn theme={landingTheme} onToggle={onToggleLandingTheme} />
            <button
              onClick={onNavigateToLanding}
              className="inline-flex items-center gap-1.5 h-[30px] px-3 text-[12.5px] font-semibold rounded-[8px] bg-[var(--accent)] text-white hover:brightness-110 transition-all"
            >
              <Icons.ArrowRight size={12} />
              {chrome.openViewer}
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
              {/* Breadcrumb: Blog › Topic. The topic links up to its hub page —
                  the article's place in the site, for readers and crawlers. */}
              <div className="flex items-center justify-between gap-3 mb-3">
                <nav aria-label="Breadcrumb">
                  <ol className="flex flex-wrap items-center gap-1.5 text-[12px] text-[var(--text-faint)]" role="list">
                    <li>
                      <a
                        href={blogHomeHref(post.lang ?? 'en')}
                        onClick={(e) => { if (e.metaKey || e.ctrlKey || e.button !== 0) return; e.preventDefault(); onNavigateToBlog() }}
                        className="hover:text-[var(--text)]"
                      >
                        {chrome.blog}
                      </a>
                    </li>
                    <li aria-hidden="true">/</li>
                    <li>
                      {postTopic ? (
                        <a
                          href={topicHref(postTopic.slug, post.lang ?? 'en')}
                          onClick={(e) => {
                            trackBlogTopicOpened({ topic: postTopic.slug, from: 'breadcrumb', lang: post.lang ?? 'en' })
                            if (e.metaKey || e.ctrlKey || e.button !== 0) return
                            e.preventDefault()
                            onNavigateToBlog()
                            // The list mounts after this; it reads the topic from the URL.
                            history.replaceState(null, '', topicHref(postTopic.slug, post.lang ?? 'en'))
                          }}
                          className={`inline-flex px-2 py-0.5 rounded-full text-[10.5px] font-semibold ${catColor(post.categorySlug)} hover:brightness-125`}
                        >
                          {post.category}
                        </a>
                      ) : (
                        <span className={`inline-flex px-2 py-0.5 rounded-full text-[10.5px] font-semibold ${catColor(post.categorySlug)}`}>{post.category}</span>
                      )}
                    </li>
                  </ol>
                </nav>
                <span className="shrink-0 text-[11.5px] text-[var(--text-faint)]">{chrome.minutes(post.readTimeMin)}</span>
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
                  <time dateTime={post.date}>{formatDate(post.date, post.lang ?? 'en')}</time>
                </div>
                <CopyForAI post={post} />
              </div>
            </header>

            {/* TOC — mobile only (hidden on xl where it's in the sidebar) */}
            <div className="xl:hidden">
              <TableOfContents headings={headings} label={chrome.onThisPage} ariaLabel={chrome.tableOfContents} />
            </div>

            {/* Article body */}
            <ReferencesProvider value={refsCtx}>
            <div ref={bodyRef}>
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

            <ReferenceList />
            </ReferencesProvider>

            <SelectionShare containerRef={bodyRef} pageUrl={`${typeof location !== 'undefined' ? location.origin : ''}${postHref(post.slug, post.lang ?? 'en')}`} title={post.title} lang={post.lang ?? 'en'} />

            {/* BIM Glossary — its definitions are English, and under an article
                in another language a block of English prose reads as a page
                left untranslated. */}
            {(post.lang ?? 'en') === 'en' && <BimGlossary />}

            {/* Bottom CTA */}
            <div className="mt-10 sm:mt-14 pt-8 sm:pt-10 border-t border-[var(--border)] text-center">
              <p className="text-[13.5px] sm:text-[14px] text-[var(--text-dim)] mb-4">
                {chrome.bottomPrompt}
              </p>
              <div className="flex flex-col sm:flex-row items-center justify-center gap-3">
                <button
                  onClick={onNavigateToLanding}
                  className="w-full sm:w-auto inline-flex items-center justify-center gap-2 h-11 sm:h-10 px-5 text-[14px] sm:text-[13.5px] font-semibold rounded-xl bg-[var(--accent)] text-white hover:brightness-110 active:brightness-90 transition-all"
                >
                  {chrome.bottomCta}
                  <Icons.ArrowRight size={14} />
                </button>
                <CopyForAI post={post} />
              </div>
            </div>
          </article>

          {/* ── Desktop TOC sidebar — xl+ only (hidden on mobile) ── */}
          <div className="hidden xl:block shrink-0">
            <TableOfContents headings={headings} label={chrome.onThisPage} ariaLabel={chrome.tableOfContents} />
          </div>
        </div>
      </div>

      {/* ── What next: ranked reads + tools for the topic ── */}
      <ContinueReading post={post} />
    </motion.div>
    </RecsProvider>
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

/**
 * Whether the posts of `lang` are in memory, loading their pack if not (the
 * zh/ja/th libraries are fetched on demand — see blog-posts.ts).
 */
function useBlogLanguage(lang: string): { state: 'ready' | 'loading' | 'failed'; retry: () => void } {
  const [, rerender] = React.useReducer((n: number) => n + 1, 0)
  const [failed, setFailed] = React.useState<string | null>(null)
  const [attempt, setAttempt] = React.useState(0)
  const ready = isBlogLanguageReady(lang)
  React.useEffect(() => {
    if (ready) return
    let alive = true
    setFailed(null)
    loadBlogLanguage(lang).then(
      () => { if (alive) rerender() },
      () => { if (alive) setFailed(lang) },
    )
    return () => { alive = false }
  }, [lang, ready, attempt])
  return {
    state: ready ? 'ready' : failed === lang ? 'failed' : 'loading',
    retry: () => setAttempt((n) => n + 1),
  }
}

function BlogMessage({ lang, theme, children }: { lang: string; theme: 'dark' | 'light'; children: React.ReactNode }) {
  return (
    <div lang={lang} className={`min-h-screen bg-[var(--bg)] flex flex-col items-center justify-center gap-4 px-4 text-center${theme === 'light' ? ' lp-light' : ''}`}>
      {children}
    </div>
  )
}

export default function Blog({ slug, lang = 'en', onNavigateToPost, onNavigateToBlog, onNavigateToLanding, landingTheme, onToggleLandingTheme }: BlogProps) {
  const pack = useBlogLanguage(lang)
  const chrome = editorialCopy(lang).post
  if (pack.state === 'loading') {
    return (
      <BlogMessage lang={lang} theme={landingTheme}>
        <span className="h-5 w-5 rounded-full border-2 border-[var(--border)] border-t-[var(--accent)] animate-spin" aria-hidden="true" />
        <p role="status" className="text-[13px] text-[var(--text-dim)]">{chrome.loading}</p>
      </BlogMessage>
    )
  }
  if (pack.state === 'failed') {
    return (
      <BlogMessage lang={lang} theme={landingTheme}>
        <p role="alert" className="text-[14px] text-[var(--text-dim)]">{chrome.loadFailed}</p>
        <button onClick={pack.retry} className="h-9 px-4 rounded-lg bg-[var(--accent)] text-white text-[13px] font-semibold hover:brightness-110">
          {chrome.retry}
        </button>
      </BlogMessage>
    )
  }
  if (slug) {
    const post = getBlogPost(slug, lang)
    if (!post) {
      return (
        <BlogMessage lang={lang} theme={landingTheme}>
          <p className="text-[14px] text-[var(--text-dim)]">{chrome.notFound}</p>
          <button onClick={onNavigateToBlog} className="text-[13px] text-[var(--accent-2)] hover:underline">
            ← {chrome.backToAll}
          </button>
        </BlogMessage>
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
