import React from 'react'
import * as Icons from '../Icons'
import { editorialCopy } from '../../lib/blog-editorial-copy'
import './editorial.css'

// ─── Editorial blocks ────────────────────────────────────────────────────────
// Each block answers one reader problem; if a post doesn't have that problem,
// it shouldn't use the block. See docs/BLOG_COMPONENTS.md for when-to-use.
//
//   Callout    — an aside the reader must not miss (tip / warning / note).
//   Takeaways  — "what do I leave with?" before or after a long read.
//   Steps      — a procedure; optional detail folds away so the sequence scans.
//   Decision   — "which of these applies to ME?": pick a situation, get a verdict.
//   Bars       — compare magnitudes that a stat-row can't put side by side.
//   Term       — a jargon word explained in place, without leaving the sentence.

type Lang = { lang?: string }

// ── Callout ─────────────────────────────────────────────────────────────────

export type CalloutVariant = 'tip' | 'warning' | 'info'

const CALLOUT_TONE: Record<CalloutVariant, { color: string; Icon: (p: { size?: number }) => React.ReactElement }> = {
  tip:     { color: 'var(--ok)',       Icon: Icons.Sparkles },
  warning: { color: 'var(--warn)',     Icon: Icons.Warn },
  info:    { color: 'var(--accent-2)', Icon: Icons.Info },
}

export function Callout({ variant, title, children, lang = 'en' }: Lang & {
  variant: CalloutVariant
  title?: string
  children: React.ReactNode
}) {
  const { color, Icon } = CALLOUT_TONE[variant]
  const label = editorialCopy(lang).callout[variant]
  return (
    // role="note": an aside related to, but separable from, the main flow.
    <aside
      role="note"
      aria-label={title ?? label}
      className="my-6 flex gap-3 rounded-xl border px-4 py-3.5 sm:px-5 sm:py-4"
      style={{
        borderColor: `color-mix(in srgb, ${color} 32%, var(--border))`,
        background: `color-mix(in srgb, ${color} 6%, var(--surface))`,
      }}
    >
      <span className="mt-[3px] shrink-0" style={{ color }} aria-hidden="true"><Icon size={17} /></span>
      <div className="min-w-0 text-[14.5px] leading-[1.72] text-[var(--text-dim)]">
        <p className="mb-0.5 text-[11px] font-semibold uppercase tracking-[0.1em]" style={{ color }}>
          {title ?? label}
        </p>
        {children}
      </div>
    </aside>
  )
}

// ── Takeaways ───────────────────────────────────────────────────────────────

export function Takeaways({ title, items, lang = 'en' }: Lang & { title?: string; items: React.ReactNode[] }) {
  const id = React.useId()
  return (
    <section
      aria-labelledby={id}
      className="my-8 rounded-2xl border border-[var(--border)] bg-[var(--surface)] px-5 py-5 sm:px-6"
    >
      <h2 id={id} className="flex items-center gap-2 text-[12px] font-semibold uppercase tracking-[0.12em] text-[var(--accent-2)]">
        <Icons.Check size={15} strokeWidth={2} aria-hidden="true" />
        {title ?? editorialCopy(lang).takeaways}
      </h2>
      <ul className="mt-3.5 space-y-2.5" role="list">
        {items.map((item, i) => (
          <li key={i} className="flex gap-3 text-[15px] leading-[1.65] text-[var(--text)]">
            <span className="mt-[9px] h-1.5 w-1.5 shrink-0 rounded-full bg-[var(--accent)]" aria-hidden="true" />
            <span>{item}</span>
          </li>
        ))}
      </ul>
    </section>
  )
}

// ── Steps ───────────────────────────────────────────────────────────────────

export interface StepItem { title: string; body?: React.ReactNode; detail?: React.ReactNode; detailLabel?: string }

export function Steps({ items, lang = 'en' }: Lang & { items: StepItem[] }) {
  const copy = editorialCopy(lang)
  return (
    <ol className="ed-focus my-8 list-none pl-0" role="list">
      {items.map((step, i) => {
        const last = i === items.length - 1
        return (
          <li key={i} className="relative flex gap-4 pb-6 last:pb-0">
            {/* The rail ties the steps into one sequence; decorative only. */}
            {!last && <span className="absolute left-[13px] top-8 bottom-1 w-px bg-[var(--border)]" aria-hidden="true" />}
            <span
              className="relative z-[1] flex h-[27px] w-[27px] shrink-0 items-center justify-center rounded-full border border-[color-mix(in_srgb,var(--accent)_45%,var(--border))] bg-[var(--surface)] font-mono text-[12px] font-bold text-[var(--accent-2)]"
              aria-hidden="true"
            >
              {i + 1}
            </span>
            <div className="min-w-0 pt-[2px]">
              <p className="text-[15.5px] font-semibold leading-snug tracking-tight text-[var(--text)]">
                <span className="sr-only">{copy.step(i + 1, items.length)}: </span>
                {step.title}
              </p>
              {step.body && <div className="mt-1.5 text-[14.5px] leading-[1.72] text-[var(--text-dim)]">{step.body}</div>}
              {step.detail && (
                <details className="ed-details mt-2">
                  <summary className="inline-flex min-h-[36px] items-center gap-1.5 text-[13px] font-medium text-[var(--accent-2)]">
                    <Icons.Chevron size={13} className="ed-caret" aria-hidden="true" />
                    {step.detailLabel ?? copy.stepDetail}
                  </summary>
                  <div className="mt-1.5 rounded-lg border border-[var(--border)] bg-[var(--surface)] px-3.5 py-3 text-[14px] leading-[1.7] text-[var(--text-dim)]">
                    {step.detail}
                  </div>
                </details>
              )}
            </div>
          </li>
        )
      })}
    </ol>
  )
}

// ── Decision ────────────────────────────────────────────────────────────────

export interface DecisionOption {
  label: string
  verdict: string
  body: React.ReactNode
  /** Optional follow-up link, already rendered (keeps SPA routing in Blog.tsx). */
  link?: React.ReactNode
}

export function Decision({ question, options, lang = 'en' }: Lang & { question: string; options: DecisionOption[] }) {
  const copy = editorialCopy(lang)
  const [picked, setPicked] = React.useState<number | null>(null)
  const name = React.useId()
  const qid = React.useId()
  const chosen = picked === null ? null : options[picked]
  return (
    <section aria-labelledby={qid} className="ed-focus my-9 rounded-2xl border border-[var(--border)] bg-[var(--surface)] p-5 sm:p-6">
      <h3 id={qid} className="text-[16.5px] font-semibold tracking-tight text-[var(--text)]">{question}</h3>
      <p className="mt-1 text-[13px] text-[var(--text-faint)]">{copy.decisionPick}</p>
      {/* Native radios: arrow keys, form semantics and screen-reader state for free. */}
      <fieldset className="mt-4">
        <legend className="sr-only">{question}</legend>
        <div className="grid gap-2 sm:grid-cols-2">
          {options.map((opt, i) => (
            <label
              key={i}
              className="flex min-h-[48px] cursor-pointer items-center gap-3 rounded-xl border px-3.5 py-2.5 text-[14px] leading-snug transition-colors has-[:focus-visible]:outline has-[:focus-visible]:outline-2 has-[:focus-visible]:outline-[var(--accent-2)]"
              style={picked === i
                ? { borderColor: 'color-mix(in srgb, var(--accent) 60%, var(--border))', background: 'color-mix(in srgb, var(--accent) 12%, var(--surface))', color: 'var(--text)' }
                : { borderColor: 'var(--border)', color: 'var(--text-dim)' }}
            >
              <input type="radio" name={name} className="sr-only" checked={picked === i} onChange={() => setPicked(i)} />
              <span
                className="flex h-4 w-4 shrink-0 items-center justify-center rounded-full border"
                style={{ borderColor: picked === i ? 'var(--accent-2)' : 'var(--border-strong)' }}
                aria-hidden="true"
              >
                {picked === i && <span className="h-2 w-2 rounded-full bg-[var(--accent-2)]" />}
              </span>
              {opt.label}
            </label>
          ))}
        </div>
      </fieldset>
      <div aria-live="polite">
        {chosen && (
          <div key={picked} className="ed-fade-in mt-4 rounded-xl border-l-[3px] border-[var(--accent)] bg-[var(--surface-2)] px-4 py-3.5">
            <p className="text-[15px] font-semibold text-[var(--text)]">{chosen.verdict}</p>
            <div className="mt-1 text-[14px] leading-[1.7] text-[var(--text-dim)]">{chosen.body}</div>
            {chosen.link && <div className="mt-2 text-[13.5px] font-medium">{chosen.link}</div>}
          </div>
        )}
      </div>
    </section>
  )
}

// ── Bars ────────────────────────────────────────────────────────────────────

export interface BarItem { label: string; value: number; note?: string; highlight?: boolean }

export function Bars({ title, unit = '', items, max, caption, lang = 'en' }: Lang & {
  title?: string
  unit?: string
  items: BarItem[]
  max?: number
  caption?: string
}) {
  const ref = React.useRef<HTMLElement>(null)
  const [shown, setShown] = React.useState(false)
  const top = max ?? Math.max(...items.map((i) => i.value), 1)
  // Format in the ARTICLE's locale: "0.7 min" in an English post, not "0,7".
  const fmt = (v: number) => `${v.toLocaleString(lang)}${unit}`

  // Grow once, when first seen — the motion shows "these are magnitudes".
  React.useEffect(() => {
    const el = ref.current
    // Already on screen (or no observer): show at once. Bars must never stay
    // collapsed just because an observer didn't fire.
    if (!el || typeof IntersectionObserver === 'undefined' || el.getBoundingClientRect().top < window.innerHeight) {
      setShown(true)
      return
    }
    const io = new IntersectionObserver(([e]) => { if (e.isIntersecting) { setShown(true); io.disconnect() } }, { threshold: 0.3 })
    io.observe(el)
    return () => io.disconnect()
  }, [])

  return (
    <figure ref={ref} className="ed-bars my-8 rounded-2xl border border-[var(--border)] bg-[var(--surface)] p-5 sm:p-6" data-shown={shown}>
      {title && <p className="mb-4 text-[14.5px] font-semibold tracking-tight text-[var(--text)]">{title}</p>}
      {/* A list, not an image: every value is real text a screen reader reads. */}
      <ul className="space-y-3.5" role="list">
        {items.map((item, i) => (
          <li key={i}>
            <div className="flex items-baseline justify-between gap-3 text-[13.5px]">
              <span className={item.highlight ? 'font-semibold text-[var(--text)]' : 'text-[var(--text-dim)]'}>{item.label}</span>
              <span className="shrink-0 font-mono tabular-nums text-[var(--text)]">{fmt(item.value)}</span>
            </div>
            <div className="mt-1.5 h-2 overflow-hidden rounded-full bg-[var(--surface-2)]" aria-hidden="true">
              <div
                className="ed-bar-fill h-full rounded-full"
                style={{
                  width: `${Math.max(0, Math.min(100, (item.value / top) * 100))}%`,
                  background: item.highlight ? 'var(--accent)' : 'color-mix(in srgb, var(--accent-2) 45%, var(--surface-2))',
                  transitionDelay: `${i * 60}ms`,
                }}
              />
            </div>
            {item.note && <p className="mt-1 text-[12px] leading-snug text-[var(--text-faint)]">{item.note}</p>}
          </li>
        ))}
      </ul>
      {caption && <figcaption className="mt-4 text-[12px] leading-[1.6] text-[var(--text-faint)]">{caption}</figcaption>}
    </figure>
  )
}

// ── Term (inline definition) ────────────────────────────────────────────────
// A toggletip, not a hover tooltip: touch screens have no hover, and a
// definition that only exists under a mouse pointer doesn't exist on a phone.

export function Term({ text, def, lang = 'en' }: Lang & { text: string; def: string }) {
  const copy = editorialCopy(lang)
  const [open, setOpen] = React.useState(false)
  const wrapRef = React.useRef<HTMLSpanElement>(null)
  const popId = React.useId()
  const [shift, setShift] = React.useState(0)

  // Keep the card inside the viewport: a term near the right edge of a phone
  // would otherwise push a 300px card off-screen and cause sideways scroll.
  React.useLayoutEffect(() => {
    if (!open || !wrapRef.current) return
    const left = wrapRef.current.getBoundingClientRect().left
    const width = Math.min(300, window.innerWidth * 0.8)
    setShift(Math.min(0, window.innerWidth - 16 - (left + width)))
  }, [open])

  React.useEffect(() => {
    if (!open) return
    const onDown = (e: PointerEvent) => { if (!wrapRef.current?.contains(e.target as Node)) setOpen(false) }
    const onKey = (e: KeyboardEvent) => { if (e.key === 'Escape') setOpen(false) }
    document.addEventListener('pointerdown', onDown)
    document.addEventListener('keydown', onKey)
    return () => { document.removeEventListener('pointerdown', onDown); document.removeEventListener('keydown', onKey) }
  }, [open])

  return (
    <span ref={wrapRef} className="relative inline">
      <button
        type="button"
        className="ed-term ed-focus inline p-0 font-[inherit] text-[inherit] leading-[inherit]"
        aria-expanded={open}
        aria-controls={popId}
        onClick={() => setOpen((o) => !o)}
      >
        {text}
      </button>
      {/* Live region so the definition is announced when it opens. */}
      <span id={popId} role="status" className={open ? '' : 'sr-only'}>
        {open && (
          <span className="ed-fade-in absolute top-full z-20 mt-2 block w-[min(300px,80vw)] rounded-xl border border-[var(--border-strong)] bg-[var(--surface-2)] px-3.5 py-3 text-left text-[13.5px] leading-[1.6] text-[var(--text-dim)] shadow-[0_12px_32px_-12px_rgba(0,0,0,0.5)]" style={{ left: shift }}>
            <span className="mb-0.5 block text-[10.5px] font-semibold uppercase tracking-[0.1em] text-[var(--accent-2)]">
              {copy.definition} · {text}
            </span>
            {def}
          </span>
        )}
      </span>
    </span>
  )
}

// ── StatRow (upgraded stat-row) ─────────────────────────────────────────────
// The count-up is decoration; the NUMBER is content. Screen readers get the
// final value as text, reduced-motion readers get it without the animation,
// and the grid follows the count so three stats don't leave an orphan tile.

export function StatRow({ stats, renderCount }: {
  stats: Array<{ value: number; prefix?: string; suffix?: string; label: string }>
  renderCount: (s: { value: number; prefix?: string; suffix?: string; label: string }, reduced: boolean) => React.ReactNode
}) {
  const reduced = usePrefersReducedMotion()
  const n = stats.length
  const cols = n === 1 ? 'grid-cols-1' : n === 3 ? 'grid-cols-3' : 'grid-cols-2'
  const smCols = n >= 4 ? 'sm:grid-cols-4' : n === 3 ? 'sm:grid-cols-3' : n === 2 ? 'sm:grid-cols-2' : ''
  return (
    <ul role="list" className={`my-6 sm:my-8 grid ${cols} ${smCols} gap-2 sm:gap-3`}>
      {stats.map((s, i) => (
        <li
          key={i}
          className={`flex flex-col items-center justify-center rounded-xl border border-[var(--border)] bg-[var(--surface)] px-2 text-center ${n === 3 ? 'py-3.5' : 'py-4'} sm:py-5`}
        >
          <span className="sr-only">{`${s.prefix ?? ''}${s.value}${s.suffix ?? ''} ${s.label}`}</span>
          <span aria-hidden="true" className="contents">{renderCount(s, reduced)}</span>
        </li>
      ))}
    </ul>
  )
}

function usePrefersReducedMotion(): boolean {
  const [reduced, setReduced] = React.useState(false)
  React.useEffect(() => {
    const mq = window.matchMedia?.('(prefers-reduced-motion: reduce)')
    if (!mq) return
    setReduced(mq.matches)
    const on = (e: MediaQueryListEvent) => setReduced(e.matches)
    mq.addEventListener?.('change', on)
    return () => mq.removeEventListener?.('change', on)
  }, [])
  return reduced
}
