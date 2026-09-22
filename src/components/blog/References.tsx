import React from 'react'
import * as Icons from '../Icons'
import { getBlogPost, type BlogReference } from '../../lib/blog-posts'
import { editorialCopy } from '../../lib/blog-editorial-copy'
import './editorial.css'

// ─── References ──────────────────────────────────────────────────────────────
// Niche content leans on sources — ISO 19650, IFC schema docs, earlier posts.
// Study-Bible style cross-references let the reader check one WITHOUT losing
// their place: a numbered marker opens a context card (what the source is,
// why it matters here, where to read it), and a References list at the end
// gathers them all, each with a way back to where it was cited.
//
//   ReferencesProvider — one per post: the list, its numbering, navigation.
//   Citation           — the inline [n] marker + context card.
//   ReferenceList      — the numbered bibliography.
//   PostPreviewLink    — an internal link that previews its target post on
//                        hover/focus (pointer devices; touch just navigates).

interface RefsCtx {
  refs: BlogReference[]
  lang: string
  hrefFor: (slug: string) => string
  navigate: (slug: string) => void
}

const Ctx = React.createContext<RefsCtx | null>(null)

export function ReferencesProvider({ value, children }: { value: RefsCtx; children: React.ReactNode }) {
  return <Ctx.Provider value={value}>{children}</Ctx.Provider>
}

/** Smooth-scroll to an id and move focus there, honouring reduced motion. */
function jumpTo(id: string) {
  const el = document.getElementById(id)
  if (!el) return
  const reduce = window.matchMedia?.('(prefers-reduced-motion: reduce)').matches
  el.scrollIntoView({ behavior: reduce ? 'auto' : 'smooth', block: 'center' })
  if (!el.hasAttribute('tabindex')) el.setAttribute('tabindex', '-1')
  el.focus({ preventScroll: true })
  el.classList.remove('ed-flash')
  void el.offsetWidth
  el.classList.add('ed-flash')
}

/** Popover that stays within the viewport and closes on outside tap / Escape. */
function usePopover() {
  const [open, setOpen] = React.useState(false)
  const [shift, setShift] = React.useState(0)
  const wrapRef = React.useRef<HTMLSpanElement>(null)
  React.useEffect(() => {
    if (!open) return
    const onDown = (e: PointerEvent) => { if (!wrapRef.current?.contains(e.target as Node)) setOpen(false) }
    const onKey = (e: KeyboardEvent) => { if (e.key === 'Escape') setOpen(false) }
    document.addEventListener('pointerdown', onDown)
    document.addEventListener('keydown', onKey)
    return () => { document.removeEventListener('pointerdown', onDown); document.removeEventListener('keydown', onKey) }
  }, [open])
  React.useLayoutEffect(() => {
    if (!open || !wrapRef.current) return
    const left = wrapRef.current.getBoundingClientRect().left
    const width = Math.min(320, window.innerWidth - 32)
    setShift(Math.min(0, window.innerWidth - 16 - (left + width)))
  }, [open])
  return { open, setOpen, shift, wrapRef }
}

const CARD = 'ed-fade-in absolute top-full z-30 mt-2 block w-[min(320px,calc(100vw-32px))] rounded-xl border border-[var(--border-strong)] bg-[var(--surface-2)] p-3.5 text-left text-[13.5px] leading-[1.55] shadow-[0_14px_36px_-12px_rgba(0,0,0,0.6)]'

// ── Citation ────────────────────────────────────────────────────────────────

export function Citation({ id, text }: { id: string; text?: string }) {
  const ctx = React.useContext(Ctx)
  const { open, setOpen, shift, wrapRef } = usePopover()
  const cardId = React.useId()
  const index = ctx?.refs.findIndex((r) => r.id === id) ?? -1
  const ref = index >= 0 ? ctx!.refs[index] : undefined
  if (!ctx || !ref) return <>{text}</>
  const copy = editorialCopy(ctx.lang)
  const n = index + 1
  const linked = ref.to ? getBlogPost(ref.to, ctx.lang) : undefined

  return (
    <span ref={wrapRef} className="relative inline">
      {text}
      <button
        type="button"
        id={`cite-${id}`}
        className="ed-focus ed-cite"
        aria-expanded={open}
        aria-controls={cardId}
        aria-label={copy.citation(n, ref.title)}
        onClick={() => setOpen((o) => !o)}
      >
        {n}
      </button>
      <span id={cardId} role="status" className={open ? '' : 'sr-only'}>
        {open && (
          <span className={CARD} style={{ left: shift }}>
            <span className="mb-1 flex items-center gap-2 text-[10.5px] font-semibold uppercase tracking-[0.1em] text-[var(--accent-2)]">
              <span className="ed-cite !ml-0" aria-hidden="true">{n}</span>
              {ref.to ? copy.relatedGuide : copy.source}
            </span>
            <span className="block font-semibold text-[var(--text)]">{ref.title}</span>
            {(ref.source || ref.year) && (
              <span className="mt-0.5 block text-[12px] text-[var(--text-faint)]">
                {[ref.source, ref.year].filter(Boolean).join(' · ')}
              </span>
            )}
            {(ref.note || linked?.excerpt) && (
              <span className="mt-2 block text-[var(--text-dim)]">{ref.note ?? linked?.excerpt}</span>
            )}
            <span className="mt-3 flex flex-wrap items-center gap-x-4 gap-y-1 text-[13px] font-medium">
              {ref.to && (
                <a
                  href={ctx.hrefFor(ref.to)}
                  onClick={(e) => {
                    if (e.metaKey || e.ctrlKey || e.shiftKey || e.button !== 0) return
                    e.preventDefault()
                    ctx.navigate(ref.to!)
                  }}
                  className="inline-flex min-h-[36px] items-center gap-1 text-[var(--accent-2)] hover:underline"
                >
                  {copy.readGuide} <Icons.ArrowRight size={13} aria-hidden="true" />
                </a>
              )}
              {ref.url && (
                <a href={ref.url} target="_blank" rel="noopener noreferrer" className="inline-flex min-h-[36px] items-center gap-1 text-[var(--accent-2)] hover:underline">
                  {copy.openSource} <span aria-hidden="true">↗</span>
                </a>
              )}
              <button
                type="button"
                onClick={() => { setOpen(false); jumpTo(`ref-${id}`) }}
                className="inline-flex min-h-[36px] items-center text-[var(--text-faint)] hover:text-[var(--text)]"
              >
                {copy.allReferences}
              </button>
            </span>
          </span>
        )}
      </span>
    </span>
  )
}

// ── ReferenceList ───────────────────────────────────────────────────────────

export function ReferenceList() {
  const ctx = React.useContext(Ctx)
  if (!ctx || ctx.refs.length === 0) return null
  const copy = editorialCopy(ctx.lang)
  return (
    <section aria-labelledby="references" className="mt-12 border-t border-[var(--border)] pt-8">
      <h2 id="references" className="scroll-mt-20 text-[19px] sm:text-[22px] font-semibold tracking-[-0.025em] text-[var(--text)]">
        {copy.references}
      </h2>
      <ol className="mt-5 space-y-3" role="list">
        {ctx.refs.map((r, i) => (
          <li key={r.id} id={`ref-${r.id}`} className="flex scroll-mt-24 gap-3 rounded-lg p-1 -m-1 text-[14px] leading-[1.6]">
            <span className="ed-cite !ml-0 mt-0.5" aria-hidden="true">{i + 1}</span>
            <div className="min-w-0">
              <p>
                {r.url ? (
                  <a href={r.url} target="_blank" rel="noopener noreferrer" className="font-medium text-[var(--text)] underline decoration-[var(--border-strong)] underline-offset-2 hover:decoration-[var(--accent-2)]">
                    {r.title}
                  </a>
                ) : r.to ? (
                  <a
                    href={ctx.hrefFor(r.to)}
                    onClick={(e) => {
                      if (e.metaKey || e.ctrlKey || e.shiftKey || e.button !== 0) return
                      e.preventDefault()
                      ctx.navigate(r.to!)
                    }}
                    className="font-medium text-[var(--text)] underline decoration-[var(--border-strong)] underline-offset-2 hover:decoration-[var(--accent-2)]"
                  >
                    {r.title}
                  </a>
                ) : (
                  <span className="font-medium text-[var(--text)]">{r.title}</span>
                )}
                {(r.source || r.year) && <span className="text-[var(--text-faint)]"> — {[r.source, r.year].filter(Boolean).join(', ')}</span>}
              </p>
              {r.note && <p className="mt-0.5 text-[13.5px] text-[var(--text-dim)]">{r.note}</p>}
              <button
                type="button"
                onClick={() => jumpTo(`cite-${r.id}`)}
                className="mt-0.5 inline-flex min-h-[32px] items-center gap-1 text-[12.5px] text-[var(--accent-2)] hover:underline"
                aria-label={copy.backToCitation(i + 1)}
              >
                <span aria-hidden="true">↩</span> {copy.backToText}
              </button>
            </div>
          </li>
        ))}
      </ol>
    </section>
  )
}

// ── PostPreviewLink ─────────────────────────────────────────────────────────

export function PostPreviewLink({ slug, lang, href, className, onNavigate, children }: {
  slug: string
  lang: string
  href: string
  className: string
  onNavigate: () => void
  children: React.ReactNode
}) {
  const [open, setOpen] = React.useState(false)
  const timer = React.useRef<number>()
  const wrapRef = React.useRef<HTMLSpanElement>(null)
  const [shift, setShift] = React.useState(0)
  const post = getBlogPost(slug, lang)
  const cardId = React.useId()
  // Hover intent: only after the pointer rests, so skimming the text with the
  // mouse doesn't flash cards. Touch never gets here (no hover) and navigates.
  const fine = typeof window !== 'undefined' && window.matchMedia?.('(hover: hover) and (pointer: fine)').matches
  const show = () => { if (!post || !fine) return; window.clearTimeout(timer.current); timer.current = window.setTimeout(() => setOpen(true), 350) }
  const hide = () => { window.clearTimeout(timer.current); timer.current = window.setTimeout(() => setOpen(false), 120) }
  React.useEffect(() => () => window.clearTimeout(timer.current), [])
  React.useLayoutEffect(() => {
    if (!open || !wrapRef.current) return
    const left = wrapRef.current.getBoundingClientRect().left
    setShift(Math.min(0, window.innerWidth - 16 - (left + 320)))
  }, [open])

  return (
    <span ref={wrapRef} className="relative inline" onMouseEnter={show} onMouseLeave={hide}>
      <a
        href={href}
        onFocus={show}
        onBlur={hide}
        aria-describedby={open ? cardId : undefined}
        onClick={(e) => {
          if (e.metaKey || e.ctrlKey || e.shiftKey || e.button !== 0) return
          e.preventDefault()
          onNavigate()
        }}
        className={className}
      >
        {children}
      </a>
      {open && post && (
        <span id={cardId} role="tooltip" className={CARD} style={{ left: shift }}>
          <span className="block text-[10.5px] font-semibold uppercase tracking-[0.1em] text-[var(--accent-2)]">
            {post.category} · {post.readTimeMin} min
          </span>
          <span className="mt-1 block font-semibold text-[var(--text)]">{post.title}</span>
          <span className="mt-1.5 block text-[var(--text-dim)] line-clamp-3">{post.excerpt}</span>
        </span>
      )}
    </span>
  )
}
