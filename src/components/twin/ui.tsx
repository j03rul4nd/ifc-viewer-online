// ─── Twin panel layout system ─────────────────────────────────────────────────
// One type scale, one control height, one margin. A new feature composes these
// instead of choosing sizes: 12.5 px content, 11.5 px support, 32 px controls
// (44 px on touch), 16 px margin. Rows divided by a hairline, not boxed in cards;
// accent only for actions and selection; colour otherwise only where it means
// something (a rule's own colour, an error).

import React, { createContext, useContext, useLayoutEffect, useRef, useState } from 'react'
import { useVirtualizer } from '@tanstack/react-virtual'

export const MARGIN = 'px-4'
// 16 px on touch: iOS zooms the page into any smaller field.
export const inputCls =
  'w-full min-w-0 h-8 max-md:h-11 px-2.5 rounded-[8px] text-[12.5px] max-md:text-[16px] bg-[var(--surface-2)] border border-[var(--border)] text-[var(--text)] placeholder:text-[var(--text-faint)] focus:outline-none focus:border-[var(--accent)]'

export function Field({ label, hint, className = '', children }: { label: string; hint?: string; className?: string; children: React.ReactNode }) {
  return (
    <label className={`flex flex-col gap-1.5 min-w-0 ${className}`}>
      <span className="text-[11.5px] max-md:text-[13px] text-[var(--text-dim)]">{label}</span>
      {children}
      {hint && <span className="text-[11.5px] leading-[1.45] text-[var(--text-faint)]">{hint}</span>}
    </label>
  )
}

export function Btn({ variant = 'secondary', className = '', ...rest }: React.ButtonHTMLAttributes<HTMLButtonElement> & { variant?: 'primary' | 'secondary' | 'ghost' | 'danger' }) {
  const v = variant === 'primary' ? 'bg-[var(--accent)] text-white hover:brightness-110'
    : variant === 'ghost' ? 'text-[var(--accent-2,var(--accent))] hover:bg-[var(--surface-2)]'
    : variant === 'danger' ? 'text-[var(--danger,#ef4444)] hover:bg-[var(--surface-2)]'
    : 'border border-[var(--border-strong)] text-[var(--text)] hover:bg-[var(--surface-2)]'
  return (
    <button type="button" {...rest}
      className={`inline-flex items-center justify-center gap-1.5 h-8 max-md:h-11 px-3 shrink-0 rounded-[8px] text-[12px] max-md:text-[14px] font-medium transition-colors disabled:opacity-40 disabled:pointer-events-none ${v} ${className}`} />
  )
}

export function IconBtn({ label, className = '', ...rest }: React.ButtonHTMLAttributes<HTMLButtonElement> & { label: string }) {
  return (
    <button type="button" aria-label={label} title={label} {...rest}
      className={`inline-flex items-center justify-center w-8 h-8 max-md:w-11 max-md:h-11 shrink-0 rounded-[8px] text-[var(--text-dim)] hover:text-[var(--text)] hover:bg-[var(--surface-2)] transition-colors disabled:opacity-40 disabled:pointer-events-none ${className}`} />
  )
}

export function Switch({ checked, onChange, label, testId }: { checked: boolean; onChange: (v: boolean) => void; label: string; testId?: string }) {
  return (
    <label className="relative inline-flex shrink-0 items-center cursor-pointer max-md:p-2.5 max-md:-m-2.5" title={label}>
      <input type="checkbox" role="switch" aria-label={label} checked={checked} data-testid={testId}
        onChange={(e) => onChange(e.target.checked)} className="sr-only peer" />
      <span aria-hidden className={`relative block w-8 h-[18px] rounded-full transition-colors peer-focus-visible:ring-2 peer-focus-visible:ring-[var(--accent)] ${checked ? 'bg-[var(--accent)]' : 'bg-[var(--border-strong)]'}`}>
        <span className={`absolute top-[2px] left-[2px] w-[14px] h-[14px] rounded-full bg-white transition-transform duration-150 ${checked ? 'translate-x-[14px]' : ''}`} />
      </span>
    </label>
  )
}

/** A group of related things. The heading is plain: hierarchy comes from space. */
export function Section({ title, trailing, children }: { title?: string; trailing?: React.ReactNode; children: React.ReactNode }) {
  return (
    <section className={`${MARGIN} py-4 flex flex-col gap-3 border-t border-[var(--border)] first:border-t-0`}>
      {(title || trailing) && (
        <div className="flex items-center gap-2 min-h-6">
          <h3 className="flex-1 min-w-0 text-[12.5px] font-semibold text-[var(--text)]">{title}</h3>
          {trailing}
        </div>
      )}
      {children}
    </section>
  )
}

export function Hint({ children, tone = 'muted' }: { children: React.ReactNode; tone?: 'muted' | 'warn' | 'danger' | 'ok' }) {
  const color = tone === 'danger' ? 'text-[var(--danger,#ef4444)]' : tone === 'warn' ? 'text-[var(--warn,#f59e0b)]' : tone === 'ok' ? 'text-[var(--text)]' : 'text-[var(--text-faint)]'
  return <p className={`text-[11.5px] max-md:text-[13px] leading-[1.45] ${color}`}>{children}</p>
}

export function EmptyNote({ title, hint, children }: { title: string; hint?: string; children?: React.ReactNode }) {
  return (
    <div className={`${MARGIN} py-10 flex flex-col items-center gap-3 text-center`}>
      <div className="text-[13px] font-medium text-[var(--text)]">{title}</div>
      {hint && <div className="max-w-[280px] text-[12px] leading-[1.5] text-[var(--text-dim)]">{hint}</div>}
      {children}
    </div>
  )
}

/** The scroller every tab shares, so a list can virtualise against the panel itself. */
export const ScrollContext = createContext<React.RefObject<HTMLDivElement> | null>(null)

/**
 * A list that renders only what is on screen, inside the panel's one scroller.
 * The sticky chrome and anything above the list count through `scrollMargin`.
 */
export function VirtualRows({ count, estimate, render }: { count: number; estimate: number; render: (i: number) => React.ReactNode }) {
  const scroller = useContext(ScrollContext)
  const listRef = useRef<HTMLDivElement>(null)
  const [margin, setMargin] = useState(0)
  useLayoutEffect(() => {
    const el = listRef.current
    const sc = scroller?.current
    if (!el || !sc) return
    const m = el.getBoundingClientRect().top - sc.getBoundingClientRect().top + sc.scrollTop
    if (Math.abs(m - margin) > 0.5) setMargin(m)
  })
  const v = useVirtualizer({
    count, estimateSize: () => estimate, overscan: 6, scrollMargin: margin,
    getScrollElement: () => scroller?.current ?? null,
  })
  return (
    <div ref={listRef} className="relative w-full" style={{ height: v.getTotalSize() }}>
      {v.getVirtualItems().map((it) => (
        <div key={it.key} data-index={it.index} ref={v.measureElement} className="absolute left-0 right-0 top-0"
          style={{ transform: `translateY(${it.start - margin}px)` }}>
          {render(it.index)}
        </div>
      ))}
    </div>
  )
}
