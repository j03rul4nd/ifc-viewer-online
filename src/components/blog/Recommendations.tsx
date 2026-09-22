import React from 'react'
import * as Icons from '../Icons'
import { Modal } from '../Modal'
import { getBlogPost, getBlogPostsByLang, type BlogPost } from '../../lib/blog-posts'
import { postSections, relatedPosts, type RelatedPost } from '../../lib/blog-related'
import { toolById, toolCopy, toolHref, toolsForPost, type BlogTool } from '../../lib/blog-tools'
import { editorialCopy, type EditorialCopy } from '../../lib/blog-editorial-copy'
import './editorial.css'

// ─── Recommendations ─────────────────────────────────────────────────────────
// Getting from this article to the next useful thing without losing the thread.
//
//   RelatedPoint    — author-placed, mid-article: a SECTION of another post
//                     that answers the question this paragraph raises.
//   ToolCard        — author-placed: the tool that does what the text explains.
//   ArticlePeek     — "quick look": another post's summary and sections in a
//                     dialog, so the reader can consult it and come back.
//   ContinueReading — end of article: next read with the reason it was
//                     picked, more to explore, and the tools for the topic.
//
// Read history is a per-browser convenience (localStorage): already-read posts
// sink in the ranking and are marked, so "next" really is next.

// ── Navigation context ──────────────────────────────────────────────────────

export interface RecsNav {
  lang: string
  slugify: (s: string) => string
  hrefFor: (slug: string) => string
  /** SPA navigation; `section` lands on that heading of the target post. */
  navigate: (slug: string, section?: string) => void
}

const NavCtx = React.createContext<RecsNav | null>(null)
export const RecsProvider = NavCtx.Provider

function useNav(): RecsNav {
  const nav = React.useContext(NavCtx)
  if (!nav) throw new Error('Recommendations need <RecsProvider>')
  return nav
}

// ── Read history ────────────────────────────────────────────────────────────

const READ_KEY = 'blog:read:v1'

export function readHistory(): Set<string> {
  try {
    return new Set(JSON.parse(localStorage.getItem(READ_KEY) ?? '[]') as string[])
  } catch {
    return new Set()
  }
}

function markRead(slug: string) {
  try {
    const s = readHistory()
    s.add(slug)
    localStorage.setItem(READ_KEY, JSON.stringify([...s].slice(-200)))
  } catch { /* storage blocked: history is a nicety */ }
}

// ── Shared bits ─────────────────────────────────────────────────────────────

function SpaLink({ slug, section, className, children, onDone }: {
  slug: string
  section?: string
  className?: string
  children: React.ReactNode
  onDone?: () => void
}) {
  const nav = useNav()
  return (
    <a
      href={`${nav.hrefFor(slug)}${section ? `#${section}` : ''}`}
      onClick={(e) => {
        if (e.metaKey || e.ctrlKey || e.shiftKey || e.button !== 0) return
        e.preventDefault()
        onDone?.()
        nav.navigate(slug, section)
      }}
      className={className}
    >
      {children}
    </a>
  )
}

function ToolIcon({ icon, size = 18 }: { icon: BlogTool['icon']; size?: number }) {
  const I = icon === 'check' ? Icons.OK : icon === 'wrench' ? Icons.Sliders : icon === 'code' ? Icons.Code
    : icon === 'book' ? Icons.Layers : icon === 'share' ? Icons.Share : Icons.Building
  return <I size={size} aria-hidden="true" />
}

const btnGhost = 'ed-focus inline-flex min-h-[40px] items-center gap-1.5 rounded-lg px-3 text-[13px] font-medium'

// ── ArticlePeek ─────────────────────────────────────────────────────────────

export function ArticlePeek({ post, focusSection, onClose }: { post: BlogPost; focusSection?: string; onClose: () => void }) {
  const nav = useNav()
  const copy = editorialCopy(nav.lang)
  const sections = postSections(post, nav.slugify)
  return (
    <Modal
      open
      onClose={onClose}
      title={post.title}
      description={`${post.category} · ${copy.minRead(post.readTimeMin)}`}
      size="lg"
      footer={
        <div className="flex justify-end px-4 py-3">
          <SpaLink slug={post.slug} onDone={onClose} className={`${btnGhost} bg-[var(--accent)] text-white hover:brightness-110`}>
            {copy.openArticle} <Icons.ArrowRight size={14} aria-hidden="true" />
          </SpaLink>
        </div>
      }
    >
      <div className="px-4 py-4 sm:px-5">
        <p className="text-[14.5px] leading-[1.7] text-[var(--text-dim)]">{post.excerpt}</p>
        {sections.length > 0 && (
          <>
            <h3 className="mt-5 text-[11px] font-semibold uppercase tracking-[0.1em] text-[var(--text-faint)]">{copy.inThisArticle}</h3>
            <ol className="mt-2 divide-y divide-[var(--border)]" role="list">
              {sections.map((s) => (
                <li key={s.id}>
                  <SpaLink
                    slug={post.slug}
                    section={s.id}
                    onDone={onClose}
                    className={`ed-focus group block rounded-lg px-2 py-2.5 -mx-2 hover:bg-[var(--surface-2)] ${s.id === focusSection ? 'bg-[var(--surface-2)]' : ''}`}
                  >
                    <span className="flex items-start justify-between gap-3">
                      <span className="text-[14px] font-medium text-[var(--text)]">{s.title}</span>
                      <Icons.ArrowRight size={13} aria-hidden="true" className="mt-1 shrink-0 text-[var(--text-faint)] group-hover:text-[var(--accent-2)]" />
                    </span>
                    {s.lead && <span className="mt-0.5 block text-[12.5px] leading-[1.55] text-[var(--text-faint)] line-clamp-2">{s.lead}</span>}
                  </SpaLink>
                </li>
              ))}
            </ol>
          </>
        )}
      </div>
    </Modal>
  )
}

function usePeek() {
  const [peek, setPeek] = React.useState<{ post: BlogPost; section?: string } | null>(null)
  const node = peek ? <ArticlePeek post={peek.post} focusSection={peek.section} onClose={() => setPeek(null)} /> : null
  return { open: (post: BlogPost, section?: string) => setPeek({ post, section }), node }
}

// ── RelatedPoint (inline) ───────────────────────────────────────────────────

export function RelatedPoint({ to, section, why }: { to: string; section?: string; why?: string }) {
  const nav = useNav()
  const copy = editorialCopy(nav.lang)
  const post = getBlogPost(to, nav.lang)
  const { open, node } = usePeek()
  if (!post) return null
  const target = section ? postSections(post, nav.slugify).find((s) => s.title === section || s.id === section) : undefined

  return (
    <aside
      aria-label={`${copy.pointOfInterest}: ${post.title}`}
      className="my-7 rounded-xl border border-[var(--border)] border-l-[3px] border-l-[var(--accent)] bg-[var(--surface)] px-4 py-3.5 sm:px-5"
    >
      <p className="flex items-center gap-2 text-[10.5px] font-semibold uppercase tracking-[0.1em] text-[var(--accent-2)]">
        <Icons.Link size={12} aria-hidden="true" /> {copy.pointOfInterest} · {post.category}
      </p>
      <p className="mt-1.5 text-[15px] font-semibold leading-snug tracking-tight text-[var(--text)]">
        {target ? target.title : post.title}
      </p>
      {target && <p className="mt-0.5 text-[12.5px] text-[var(--text-faint)]">{post.title}</p>}
      <p className="mt-1.5 text-[14px] leading-[1.65] text-[var(--text-dim)] line-clamp-3">
        {why ?? target?.lead ?? post.excerpt}
      </p>
      <div className="mt-2.5 -ml-3 flex flex-wrap items-center gap-1">
        <SpaLink slug={post.slug} section={target?.id} className={`${btnGhost} text-[var(--accent-2)] hover:bg-[var(--surface-2)]`}>
          {target ? copy.goToSection : copy.openArticle} <Icons.ArrowRight size={13} aria-hidden="true" />
        </SpaLink>
        <button type="button" onClick={() => open(post, target?.id)} className={`${btnGhost} text-[var(--text-dim)] hover:bg-[var(--surface-2)] hover:text-[var(--text)]`}>
          <Icons.Eye size={14} aria-hidden="true" /> {copy.quickLook}
        </button>
      </div>
      {node}
    </aside>
  )
}

// ── ToolCard (inline) ───────────────────────────────────────────────────────

export function ToolCard({ id, why, compact = false }: { id: string; why?: string; compact?: boolean }) {
  const nav = useNav()
  const tool = toolById(id)
  if (!tool) return null
  const t = toolCopy(tool, nav.lang)
  const label = editorialCopy(nav.lang).toolLabel
  return (
    <a
      href={toolHref(tool, nav.lang)}
      className={`ed-focus group flex items-start gap-3.5 rounded-xl border border-[var(--border)] bg-[var(--surface)] transition-colors hover:border-[color-mix(in_srgb,var(--accent)_50%,var(--border))] ${compact ? 'p-3.5 h-full' : 'my-7 p-4 sm:p-5'}`}
    >
      <span className="mt-0.5 flex h-9 w-9 shrink-0 items-center justify-center rounded-lg bg-[color-mix(in_srgb,var(--accent)_16%,var(--surface))] text-[var(--accent-2)]">
        <ToolIcon icon={tool.icon} />
      </span>
      <span className="min-w-0 flex-1">
        {!compact && <span className="block text-[10.5px] font-semibold uppercase tracking-[0.1em] text-[var(--text-faint)]">{label}</span>}
        <span className="block text-[14.5px] font-semibold tracking-tight text-[var(--text)]">{t.name}</span>
        <span className="mt-0.5 block text-[13.5px] leading-[1.6] text-[var(--text-dim)]">{why ?? t.blurb}</span>
        <span className="mt-2 inline-flex items-center gap-1 text-[13px] font-medium text-[var(--accent-2)]">
          {t.action} <Icons.ArrowRight size={13} aria-hidden="true" className="transition-transform group-hover:translate-x-0.5" />
        </span>
      </span>
    </a>
  )
}

// ── ContinueReading (end of article) ────────────────────────────────────────

function reasonText(r: RelatedPost['reason'], copy: EditorialCopy): string {
  switch (r.kind) {
    case 'linked': return copy.reason.linked
    case 'backlink': return copy.reason.backlink
    case 'keywords': return copy.reason.keywords(r.shared.join(', '))
    case 'category': return copy.reason.category(r.category)
  }
}

export function ContinueReading({ post }: { post: BlogPost }) {
  const nav = useNav()
  const copy = editorialCopy(nav.lang)
  const ref = React.useRef<HTMLElement>(null)
  const [read, setRead] = React.useState<Set<string>>(() => readHistory())
  const { open, node } = usePeek()

  // Reaching the end of the article counts as having read it.
  React.useEffect(() => {
    const el = ref.current
    setRead(readHistory())
    if (!el || typeof IntersectionObserver === 'undefined') return
    const io = new IntersectionObserver(([e]) => { if (e.isIntersecting) { markRead(post.slug); io.disconnect() } })
    io.observe(el)
    return () => io.disconnect()
  }, [post.slug])

  const recs = React.useMemo(() => relatedPosts(post, getBlogPostsByLang(nav.lang), 5, read), [post, nav.lang, read])
  const tools = React.useMemo(() => toolsForPost(post, 3), [post])
  const [next, ...more] = recs
  if (!next && tools.length === 0) return null

  return (
    <section ref={ref} aria-labelledby="continue-reading" className="border-t border-[var(--border)] bg-[var(--surface)]">
      <div className="mx-auto max-w-[1120px] px-4 py-9 sm:px-7 sm:py-12">
        <h2 id="continue-reading" className="sr-only">{copy.nextUp}</h2>
        <div className="grid gap-8 lg:grid-cols-[minmax(0,1.35fr)_minmax(0,1fr)] lg:gap-10">
          <div className="min-w-0">
            {next && (
              <>
                <p className="text-[11px] font-semibold uppercase tracking-[0.12em] text-[var(--accent-2)]">{copy.nextUp}</p>
                <article className="mt-3 rounded-2xl border border-[var(--border)] bg-[var(--bg)] p-5 sm:p-6">
                  <p className="text-[12px] text-[var(--text-faint)]">
                    <span className="text-[var(--accent-2)]">{reasonText(next.reason, copy)}</span> · {copy.minRead(next.post.readTimeMin)}
                  </p>
                  <h3 className="mt-1.5 text-[19px] sm:text-[21px] font-semibold leading-snug tracking-[-0.02em] text-[var(--text)]">
                    <SpaLink slug={next.post.slug} className="ed-focus hover:underline decoration-[var(--border-strong)] underline-offset-4">{next.post.title}</SpaLink>
                  </h3>
                  <p className="mt-2 text-[14.5px] leading-[1.7] text-[var(--text-dim)] line-clamp-3">{next.post.excerpt}</p>
                  <div className="mt-4 -ml-3 flex flex-wrap gap-1">
                    <SpaLink slug={next.post.slug} className={`${btnGhost} text-[var(--accent-2)] hover:bg-[var(--surface-2)]`}>
                      {copy.openArticle} <Icons.ArrowRight size={13} aria-hidden="true" />
                    </SpaLink>
                    <button type="button" onClick={() => open(next.post)} className={`${btnGhost} text-[var(--text-dim)] hover:bg-[var(--surface-2)] hover:text-[var(--text)]`}>
                      <Icons.Eye size={14} aria-hidden="true" /> {copy.quickLook}
                    </button>
                  </div>
                </article>
              </>
            )}

            {more.length > 0 && (
              <>
                <p className="mt-8 text-[11px] font-semibold uppercase tracking-[0.12em] text-[var(--text-faint)]">{copy.keepExploring}</p>
                <ul className="mt-2 divide-y divide-[var(--border)]" role="list">
                  {more.map((r) => (
                    <li key={r.post.slug} className="flex items-start gap-3 py-3">
                      <div className="min-w-0 flex-1">
                        <SpaLink slug={r.post.slug} className="ed-focus text-[15px] font-medium leading-snug text-[var(--text)] hover:text-[var(--accent-2)]">
                          {r.post.title}
                        </SpaLink>
                        <p className="mt-0.5 flex flex-wrap items-center gap-x-2 text-[12px] text-[var(--text-faint)]">
                          <span>{reasonText(r.reason, copy)}</span>
                          <span aria-hidden="true">·</span>
                          <span>{copy.minRead(r.post.readTimeMin)}</span>
                          {read.has(r.post.slug) && (
                            <span className="inline-flex items-center gap-0.5 text-[var(--ok)]"><Icons.Check size={11} strokeWidth={2.2} aria-hidden="true" />{copy.alreadyRead}</span>
                          )}
                        </p>
                      </div>
                      <button
                        type="button"
                        onClick={() => open(r.post)}
                        aria-label={`${copy.quickLook}: ${r.post.title}`}
                        className="ed-focus inline-flex h-10 w-10 shrink-0 items-center justify-center rounded-lg text-[var(--text-faint)] hover:bg-[var(--surface-2)] hover:text-[var(--text)]"
                      >
                        <Icons.Eye size={16} aria-hidden="true" />
                      </button>
                    </li>
                  ))}
                </ul>
              </>
            )}
          </div>

          {tools.length > 0 && (
            <div className="min-w-0">
              <p className="text-[11px] font-semibold uppercase tracking-[0.12em] text-[var(--text-faint)]">{copy.toolsForTopic}</p>
              <ul className="mt-3 grid gap-2.5" role="list">
                {tools.map((t) => <li key={t.id}><ToolCard id={t.id} compact /></li>)}
              </ul>
            </div>
          )}
        </div>
      </div>
      {node}
    </section>
  )
}
