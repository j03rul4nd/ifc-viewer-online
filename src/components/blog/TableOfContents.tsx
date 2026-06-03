// ─── Table of Contents ────────────────────────────────────────────────────────
// Extracts h2 headings from the post's ContentBlock array and renders a
// sticky sidebar list (desktop) or a collapsible panel (mobile).
// Uses IntersectionObserver to highlight the active section while reading.

import React, { useState, useEffect, useRef } from 'react'
import { motion, AnimatePresence } from 'framer-motion'
import type { ContentBlock } from '../../lib/blog-posts'

// ── Heading extraction ────────────────────────────────────────────────────────

export interface Heading { id: string; text: string; depth: 2 | 3 }

export function extractHeadings(blocks: ContentBlock[]): Heading[] {
  return blocks
    .filter((b): b is Extract<ContentBlock, { type: 'h2' | 'h3' }> =>
      b.type === 'h2' || b.type === 'h3',
    )
    .map(b => ({
      id:    slugify(b.text),
      text:  b.text,
      depth: (b.type === 'h2' ? 2 : 3) as 2 | 3,
    }))
}

export function slugify(text: string): string {
  return text
    .toLowerCase()
    .replace(/[^a-z0-9\s-]/g, '')
    .trim()
    .replace(/\s+/g, '-')
}

// ── Active section tracking ───────────────────────────────────────────────────

function useActiveHeading(ids: string[]): string {
  const [activeId, setActiveId] = useState(ids[0] ?? '')

  useEffect(() => {
    if (ids.length === 0) return

    const observers: IntersectionObserver[] = []

    const createObserver = (id: string): void => {
      const el = document.getElementById(id)
      if (!el) return

      const obs = new IntersectionObserver(
        entries => {
          if (entries[0].isIntersecting) setActiveId(id)
        },
        { rootMargin: '-20% 0px -70% 0px' },
      )
      obs.observe(el)
      observers.push(obs)
    }

    ids.forEach(createObserver)
    return () => observers.forEach(o => o.disconnect())
  }, [ids.join(',')])

  return activeId
}

// ── Component ─────────────────────────────────────────────────────────────────

interface Props {
  headings: Heading[]
}

export default function TableOfContents({ headings }: Props) {
  const [open, setOpen] = useState(false)
  const ids             = headings.map(h => h.id)
  const activeId        = useActiveHeading(ids)

  if (headings.length < 2) return null

  const scrollTo = (id: string): void => {
    document.getElementById(id)?.scrollIntoView({ behavior: 'smooth', block: 'start' })
    setOpen(false)
  }

  const List = () => (
    <ul className="space-y-0.5">
      {headings.map(h => (
        <li key={h.id}>
          <button
            onClick={() => scrollTo(h.id)}
            className={[
              'w-full text-left px-2 py-2 sm:py-1.5 rounded-lg text-[13px] sm:text-[12.5px] leading-[1.4] transition-all duration-150 min-h-[40px] sm:min-h-0',
              h.depth === 3 ? 'pl-5' : '',
              h.id === activeId
                ? 'text-[var(--text)] bg-[rgba(94,106,210,0.1)] font-medium'
                : 'text-[var(--text-faint)] hover:text-[var(--text-dim)] hover:bg-[rgba(255,255,255,0.04)]',
            ].join(' ')}
          >
            {h.depth === 2 && (
              <span
                className="mr-2 inline-block w-[3px] h-[3px] rounded-full align-middle mb-[2px] transition-colors"
                style={{ background: h.id === activeId ? 'var(--accent)' : 'var(--text-faint)' }}
              />
            )}
            {h.text}
          </button>
        </li>
      ))}
    </ul>
  )

  return (
    <>
      {/* ── Desktop sticky sidebar ── */}
      <aside
        aria-label="Table of contents"
        className="hidden xl:block w-[220px] shrink-0 self-start sticky top-[70px]"
      >
        <div className="border border-[var(--border)] rounded-xl p-3 bg-[var(--surface)]">
          <p className="text-[10px] font-mono font-bold tracking-[0.12em] text-[var(--text-faint)] px-2 mb-3">
            ON THIS PAGE
          </p>
          <List />
        </div>
      </aside>

      {/* ── Mobile collapsible ── */}
      <div className="xl:hidden mb-6 border border-[var(--border)] rounded-xl overflow-hidden bg-[var(--surface)]">
        <button
          onClick={() => setOpen(v => !v)}
          className="w-full flex items-center justify-between px-4 py-3.5 text-[13px] font-medium text-[var(--text-dim)] hover:text-[var(--text)] transition-colors min-h-[48px]"
        >
          <span className="flex items-center gap-2 text-[11px] font-mono font-bold tracking-widest text-[var(--text-faint)]">
            ON THIS PAGE
          </span>
          <svg
            width="12" height="12" viewBox="0 0 12 12" fill="none"
            stroke="currentColor" strokeWidth="1.5" strokeLinecap="round"
            className={`transition-transform ${open ? 'rotate-180' : ''}`}
          >
            <path d="M2 4l4 4 4-4" />
          </svg>
        </button>

        <AnimatePresence>
          {open && (
            <motion.div
              initial={{ height: 0 }} animate={{ height: 'auto' }} exit={{ height: 0 }}
              className="overflow-hidden border-t border-[var(--border)]"
            >
              <div className="p-3">
                <List />
              </div>
            </motion.div>
          )}
        </AnimatePresence>
      </div>
    </>
  )
}
