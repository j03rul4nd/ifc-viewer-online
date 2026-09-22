import React from 'react'
import * as Icons from '../Icons'
import { editorialCopy } from '../../lib/blog-editorial-copy'
import './editorial.css'

// ─── Share kit ───────────────────────────────────────────────────────────────
// The sharing patterns readers know from Medium and community blogs, kept to
// the ones that carry the READER's intent rather than ours:
//
//   SelectionShare — select a sentence → copy it as a quote with a link that
//                    scrolls straight to it (text fragment), or share it.
//   QuoteShare     — the same, one tap, on an editor-chosen pull-quote.
//   SectionLink    — copy a link to a heading, to point a colleague at the
//                    exact answer instead of a 20-minute article.
//
// No counters, no claps, no third-party scripts: share targets are plain URLs.

/** Link that scrolls to (and highlights) `quote` in supporting browsers. */
export function quoteUrl(pageUrl: string, quote: string): string {
  const words = quote.trim().replace(/\s+/g, ' ').split(' ')
  const enc = (s: string) => encodeURIComponent(s).replace(/-/g, '%2D')
  const frag = words.length <= 10
    ? enc(words.join(' '))
    : `${enc(words.slice(0, 5).join(' '))},${enc(words.slice(-5).join(' '))}`
  return `${pageUrl.split('#')[0]}#:~:text=${frag}`
}

async function copyText(text: string): Promise<boolean> {
  try {
    await navigator.clipboard.writeText(text)
    return true
  } catch {
    return false
  }
}

function useFlag(ms = 1600): [boolean, () => void] {
  const [on, setOn] = React.useState(false)
  const t = React.useRef<number>()
  React.useEffect(() => () => window.clearTimeout(t.current), [])
  return [on, () => { setOn(true); window.clearTimeout(t.current); t.current = window.setTimeout(() => setOn(false), ms) }]
}

const canNativeShare = () => typeof navigator !== 'undefined' && typeof navigator.share === 'function'

function ShareActions({ quote, pageUrl, title, lang, onDone }: {
  quote: string
  pageUrl: string
  title: string
  lang: string
  onDone?: () => void
}) {
  const copy = editorialCopy(lang)
  const [copied, flagCopied] = useFlag()
  const link = quoteUrl(pageUrl, quote)
  const quoted = `“${quote}”`
  const btn = 'inline-flex min-h-[40px] items-center gap-1.5 rounded-lg px-3 text-[13px] font-medium text-[var(--text)] hover:bg-[var(--surface)]'
  return (
    <>
      <button type="button" className={btn} onClick={async () => { if (await copyText(`${quoted}\n\n— ${title}\n${link}`)) flagCopied() }}>
        {copied ? <Icons.Check size={14} aria-hidden="true" /> : <Icons.Copy size={14} aria-hidden="true" />}
        <span aria-live="polite">{copied ? copy.copied : copy.copyQuote}</span>
      </button>
      {canNativeShare() ? (
        <button type="button" className={btn} onClick={() => { navigator.share({ title, text: quoted, url: link }).catch(() => {}); onDone?.() }}>
          <Icons.Share size={14} aria-hidden="true" />{copy.share}
        </button>
      ) : (
        <>
          <a className={btn} target="_blank" rel="noopener noreferrer" onClick={onDone}
            href={`https://www.linkedin.com/sharing/share-offsite/?url=${encodeURIComponent(link)}`}>
            LinkedIn
          </a>
          <a className={btn} target="_blank" rel="noopener noreferrer" onClick={onDone}
            href={`https://twitter.com/intent/tweet?text=${encodeURIComponent(quoted)}&url=${encodeURIComponent(link)}`}>
            X
          </a>
        </>
      )}
    </>
  )
}

// ── SelectionShare ──────────────────────────────────────────────────────────

const MIN_CHARS = 12
const MAX_CHARS = 320

export function SelectionShare({ containerRef, pageUrl, title, lang = 'en' }: {
  containerRef: React.RefObject<HTMLElement>
  pageUrl: string
  title: string
  lang?: string
}) {
  const [sel, setSel] = React.useState<{ text: string; top: number; left: number } | null>(null)
  const barRef = React.useRef<HTMLDivElement>(null)
  // Touch devices draw their own selection menu at the selection; a second
  // popover there would fight it. On coarse pointers the bar docks at the bottom.
  const coarse = typeof window !== 'undefined' && window.matchMedia?.('(pointer: coarse)').matches

  React.useEffect(() => {
    let timer = 0
    const read = () => {
      const s = window.getSelection()
      const root = containerRef.current
      if (!s || s.isCollapsed || !root || s.rangeCount === 0) {
        // On touch, tapping the docked bar collapses the selection before the
        // tap lands; keep the bar until the reader taps elsewhere.
        if (!coarse) setSel(null)
        return
      }
      const range = s.getRangeAt(0)
      if (!root.contains(range.commonAncestorContainer)) { setSel(null); return }
      // Don't offer to share text typed in a field or inside a code sample.
      const el = range.commonAncestorContainer instanceof Element ? range.commonAncestorContainer : range.commonAncestorContainer.parentElement
      if (el?.closest('input, textarea, pre, code, button')) { setSel(null); return }
      const text = s.toString().trim().replace(/\s+/g, ' ')
      if (text.length < MIN_CHARS || text.length > MAX_CHARS) { setSel(null); return }
      const r = range.getBoundingClientRect()
      setSel({ text, top: r.top, left: r.left + r.width / 2 })
    }
    // Debounced: selectionchange fires per character while a drag extends.
    const onChange = () => { window.clearTimeout(timer); timer = window.setTimeout(read, 120) }
    const onScroll = () => setSel((cur) => (cur ? null : cur))
    const onDown = (e: PointerEvent) => {
      if (coarse && !barRef.current?.contains(e.target as Node)) setSel(null)
    }
    document.addEventListener('selectionchange', onChange)
    document.addEventListener('pointerdown', onDown)
    if (!coarse) window.addEventListener('scroll', onScroll, { passive: true })
    return () => {
      window.clearTimeout(timer)
      document.removeEventListener('selectionchange', onChange)
      document.removeEventListener('pointerdown', onDown)
      window.removeEventListener('scroll', onScroll)
    }
  }, [containerRef, coarse])

  if (!sel) return null
  const clear = () => { window.getSelection()?.removeAllRanges(); setSel(null) }
  const label = editorialCopy(lang).shareQuote

  if (coarse) {
    return (
      <div
        ref={barRef}
        role="toolbar"
        aria-label={label}
        className="ed-fade-in fixed inset-x-3 z-50 flex flex-wrap items-center justify-center gap-1 rounded-2xl border border-[var(--border-strong)] bg-[var(--surface-2)] p-1.5 shadow-[0_16px_40px_-12px_rgba(0,0,0,0.6)]"
        style={{ bottom: 'calc(12px + env(safe-area-inset-bottom))' }}
      >
        <ShareActions quote={sel.text} pageUrl={pageUrl} title={title} lang={lang} onDone={clear} />
      </div>
    )
  }

  const top = Math.max(8, sel.top - 52)
  const left = Math.min(Math.max(sel.left, 170), window.innerWidth - 170)
  return (
    <div
      ref={barRef}
      role="toolbar"
      aria-label={label}
      // Keep the selection alive while clicking the bar.
      onMouseDown={(e) => e.preventDefault()}
      className="fixed z-50 flex -translate-x-1/2 items-center gap-0.5 rounded-xl border border-[var(--border-strong)] bg-[var(--surface-2)] p-1 shadow-[0_12px_32px_-10px_rgba(0,0,0,0.55)]"
      style={{ top, left }}
    >
      <ShareActions quote={sel.text} pageUrl={pageUrl} title={title} lang={lang} onDone={clear} />
    </div>
  )
}

// ── QuoteShare (on pull-quotes) ─────────────────────────────────────────────

export function QuoteShare({ quote, pageUrl, title, lang = 'en' }: { quote: string; pageUrl: string; title: string; lang?: string }) {
  const [open, setOpen] = React.useState(false)
  const copy = editorialCopy(lang)
  return (
    <div className="mt-3 flex flex-wrap items-center gap-1">
      {open ? (
        <div role="group" aria-label={copy.shareQuote} className="ed-fade-in flex flex-wrap items-center gap-0.5 rounded-xl border border-[var(--border)] bg-[var(--surface)] p-1">
          <ShareActions quote={quote} pageUrl={pageUrl} title={title} lang={lang} onDone={() => setOpen(false)} />
        </div>
      ) : (
        <button
          type="button"
          onClick={() => setOpen(true)}
          className="ed-focus inline-flex min-h-[36px] items-center gap-1.5 rounded-lg px-2 text-[12.5px] font-medium text-[var(--text-faint)] hover:text-[var(--accent-2)]"
        >
          <Icons.Share size={13} aria-hidden="true" />
          {copy.shareQuote}
        </button>
      )}
    </div>
  )
}

// ── SectionLink (next to h2/h3) ─────────────────────────────────────────────

export function SectionLink({ id, heading, lang = 'en' }: { id: string; heading: string; lang?: string }) {
  const [copied, flag] = useFlag()
  const copy = editorialCopy(lang)
  return (
    <button
      type="button"
      onClick={async () => {
        const url = `${location.origin}${location.pathname}#${id}`
        history.replaceState(null, '', `#${id}`)
        if (await copyText(url)) flag()
      }}
      aria-label={copy.copyLink(heading)}
      title={copied ? copy.copied : copy.copyLink(heading)}
      // Always visible on touch (no hover); revealed on hover/focus with a mouse.
      className="ed-focus ed-section-link ml-2 inline-flex h-8 w-8 shrink-0 items-center justify-center rounded-md align-middle text-[var(--text-faint)] hover:text-[var(--accent-2)]"
    >
      {copied ? <Icons.Check size={14} aria-hidden="true" /> : <Icons.Link size={14} aria-hidden="true" />}
      <span className="sr-only" aria-live="polite">{copied ? copy.copied : ''}</span>
    </button>
  )
}
