// ─── Workspace building blocks ────────────────────────────────────────────────
// Shared by every paid screen so a new feature section is composition, not
// copy-paste. Responsive by CSS only (no JS breakpoint), so the markup is the
// same on the server and on every device:
//   phone   < 768  → lists render as cards, dialogs as bottom sheets
//   tablet  ≥ 768  → tables, centred dialogs
//   desktop ≥ 1024 → wider grids

import { useCallback, useEffect, useId, useRef, useState } from 'react'
import { wsLocale, wsT, useTx } from './i18n'


export function scoreColor(score: number): string {
  return score >= 80 ? 'var(--ok)' : score >= 60 ? 'var(--warn)' : 'var(--danger)'
}

export const fmtInt = (n: number) => new Intl.NumberFormat(wsLocale()).format(n)

export function Panel({ children, className = '', tour }: { children: React.ReactNode; className?: string; tour?: string }) {
  return <div data-tour={tour} className={`rounded-[10px] border border-[var(--border)] bg-[var(--surface)] ${className}`}>{children}</div>
}

export function Head({ title, sub, action }: { title: string; sub?: React.ReactNode; action?: React.ReactNode }) {
  return (
    <div className="flex flex-col sm:flex-row sm:items-end justify-between gap-3 mb-6">
      <div className="min-w-0">
        <h1 className="text-[20px] sm:text-[22px] font-semibold tracking-[-0.015em] [overflow-wrap:anywhere]">{title}</h1>
        {sub && <p className="text-[13px] text-[var(--text-dim)] mt-1 max-w-[640px]">{sub}</p>}
      </div>
      {action && <div data-tour="page-action" className="shrink-0 flex flex-wrap gap-2">{action}</div>}
    </div>
  )
}

export function SectionLabel({ children, id }: { children: React.ReactNode; id?: string }) {
  return <h2 id={id} className="text-[13px] font-medium text-[var(--text-dim)] mb-2.5">{children}</h2>
}

type BtnProps = { children: React.ReactNode; onClick?: () => void; disabled?: boolean; type?: 'button' | 'submit'; className?: string; 'aria-label'?: string }

/** The accent is reserved for the one action that moves the user forward. */
export function Primary({ children, onClick, disabled, type = 'button', className = '', ...rest }: BtnProps) {
  return (
    <button type={type} onClick={onClick} disabled={disabled} aria-label={rest['aria-label']}
      className={`inline-flex items-center justify-center h-[38px] sm:h-[34px] px-3.5 rounded-[8px] text-[13px] font-medium whitespace-nowrap bg-[var(--accent)] text-white hover:brightness-110 disabled:opacity-50 disabled:cursor-not-allowed focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[var(--accent)] ${className}`}>
      {children}
    </button>
  )
}

export function Quiet({ children, onClick, disabled, type = 'button', className = '', ...rest }: BtnProps) {
  return (
    <button type={type} onClick={onClick} disabled={disabled} aria-label={rest['aria-label']}
      className={`inline-flex items-center justify-center h-[38px] sm:h-[32px] px-3 rounded-[8px] text-[13px] whitespace-nowrap text-[var(--text-dim)] border border-[var(--border)] hover:text-[var(--text)] hover:bg-[var(--surface-2)] disabled:opacity-50 focus-visible:outline focus-visible:outline-2 focus-visible:outline-[var(--accent)] ${className}`}>
      {children}
    </button>
  )
}

/** Empty state: what this place is for, and the one next step. */
export function Empty({ title, body, action }: { title: string; body: string; action?: React.ReactNode }) {
  return (
    <div className="rounded-[10px] border border-dashed border-[var(--border-strong,var(--border))] px-5 sm:px-6 py-10 text-center">
      <p className="text-[14px] font-medium">{title}</p>
      <p className="text-[13px] text-[var(--text-dim)] mt-1 max-w-[460px] mx-auto">{body}</p>
      {action && <div className="mt-4 flex flex-wrap justify-center gap-2">{action}</div>}
    </div>
  )
}

export type Tone = 'danger' | 'warn' | 'info' | 'ok'
const TONE: Record<Tone, string> = { danger: 'var(--danger)', warn: 'var(--warn)', info: 'var(--text-dim)', ok: 'var(--ok)' }

/** A message about the account as a whole (payment failed, plan ending…). */
export function Banner({ tone, title, children, action }: { tone: Tone; title: string; children?: React.ReactNode; action?: React.ReactNode }) {
  return (
    <div role={tone === 'danger' ? 'alert' : 'status'} className="mb-5 flex flex-col sm:flex-row sm:items-center gap-3 rounded-[10px] border px-4 py-3"
      style={{ borderColor: TONE[tone], background: `color-mix(in srgb, ${TONE[tone]} 8%, transparent)` }}>
      <div className="flex-1 min-w-0">
        <p className="text-[13.5px] font-medium">{title}</p>
        {children && <p className="text-[12.5px] text-[var(--text-dim)] mt-0.5">{children}</p>}
      </div>
      {action}
    </div>
  )
}

export function Dot({ color }: { color: string }) {
  return <span aria-hidden className="inline-block w-1.5 h-1.5 rounded-full shrink-0" style={{ background: color }} />
}

/** Placeholder blocks while data loads. Static on purpose: no pulsing. */
export function Skeleton({ rows = 3 }: { rows?: number }) {
  const tx = useTx()
  return (
    <div aria-busy="true" aria-label={tx("Loading")} className="space-y-2">
      {Array.from({ length: rows }, (_, i) => (
        <div key={i} className="h-[52px] rounded-[10px] bg-[var(--surface-2)]" style={{ opacity: 1 - i * 0.2 }} />
      ))}
    </div>
  )
}

export function Sparkline({ values, width = 110, height = 28, className = '' }: { values: number[]; width?: number; height?: number; className?: string }) {
  const tx = useTx()
  if (values.length < 2) return <span className="text-[11.5px] text-[var(--text-faint)]">{tx("First delivery")}</span>
  const min = Math.min(...values, 50), max = Math.max(...values, 100)
  const x = (i: number) => (i / (values.length - 1)) * (width - 6) + 3
  const y = (v: number) => height - 3 - ((v - min) / (max - min || 1)) * (height - 6)
  const d = values.map((v, i) => `${i ? 'L' : 'M'}${x(i).toFixed(1)},${y(v).toFixed(1)}`).join(' ')
  const last = values[values.length - 1]
  return (
    <svg viewBox={`0 0 ${width} ${height}`} width={width} height={height} preserveAspectRatio="none" className={`max-w-full ${className}`} role="img" aria-label={wsT('Score per delivery: {{values}}', { values: values.join(', ') })}>
      <path d={d} fill="none" stroke="var(--text-dim)" strokeWidth={1.4} strokeLinejoin="round" strokeLinecap="round" vectorEffect="non-scaling-stroke" />
      <circle cx={x(values.length - 1)} cy={y(last)} r={2.6} fill={scoreColor(last)} />
    </svg>
  )
}

// ── Responsive list ───────────────────────────────────────────────────────────
// One column definition renders a table from tablet up and stacked cards on a
// phone, so no screen needs a horizontal scroll to read a row.

export interface Column<T> {
  key: string
  header: string
  cell: (row: T) => React.ReactNode
  /** Left out of the phone card (secondary detail). */
  hideOnPhone?: boolean
  /** Phone card: the value needs the full card width (long names, lists). */
  wide?: boolean
  /** Only on desktop (≥1024): low-priority columns that would crush a tablet table. */
  desktopOnly?: boolean
  align?: 'right'
  className?: string
}

export function DataList<T>({ rows, columns, rowKey, primary, primaryHeader, actions, rowClassName, tour }: {
  tour?: string
  rows: T[]
  primaryHeader: string
  columns: Column<T>[]
  rowKey: (row: T) => string
  /** Title of the phone card. */
  primary: (row: T) => React.ReactNode
  actions?: (row: T) => React.ReactNode
  rowClassName?: (row: T) => string
}) {
  const tx = useTx()
  return (
    <Panel tour={tour}>
      <ul className="md:hidden divide-y divide-[var(--border)]">
        {rows.map((r) => (
          <li key={rowKey(r)} className={`px-4 py-3 ${rowClassName?.(r) ?? ''}`}>
            <div className="text-[13.5px] min-w-0 [overflow-wrap:anywhere]">{primary(r)}</div>
            <dl className="mt-2 grid grid-cols-2 gap-x-3 gap-y-1.5 text-[12.5px]">
              {columns.filter((c) => !c.hideOnPhone).map((c) => (
                <div key={c.key} className={`min-w-0 ${c.wide ? 'col-span-2' : ''}`}>
                  <dt className="text-[11.5px] text-[var(--text-faint)]">{c.header}</dt>
                  <dd className="[overflow-wrap:anywhere]">{c.cell(r)}</dd>
                </div>
              ))}
            </dl>
            {actions && <div className="mt-3 flex flex-wrap gap-2">{actions(r)}</div>}
          </li>
        ))}
      </ul>
      <div className="hidden md:block overflow-x-auto">
        <table className="w-full text-[13px]">
          <thead className="text-left text-[12px] text-[var(--text-faint)]">
            <tr>
              <th className="px-4 py-2.5 font-medium">{primaryHeader}</th>
              {columns.map((c) => <th key={c.key} className={`py-2.5 pr-4 font-medium ${c.align === 'right' ? 'text-right' : ''} ${c.desktopOnly ? 'hidden lg:table-cell' : ''}`}>{c.header}</th>)}
              {actions && <th className="pr-4 text-right"><span className="sr-only">{tx("Actions")}</span></th>}
            </tr>
          </thead>
          <tbody className="divide-y divide-[var(--border)]">
            {rows.map((r) => (
              <tr key={rowKey(r)} className={`hover:bg-[var(--surface-2)] ${rowClassName?.(r) ?? ''}`}>
                <td className="px-4 py-2 min-w-[150px] lg:min-w-[200px]">{primary(r)}</td>
                {columns.map((c) => <td key={c.key} className={`py-2 pr-4 ${c.align === 'right' ? 'text-right' : ''} ${c.desktopOnly ? 'hidden lg:table-cell' : ''} ${c.className ?? ''}`}>{c.cell(r)}</td>)}
                {actions && <td className="pr-4 py-2 text-right whitespace-nowrap"><div className="inline-flex gap-1.5">{actions(r)}</div></td>}
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </Panel>
  )
}

// ── Dialog ────────────────────────────────────────────────────────────────────
// Bottom sheet on a phone (thumb reach, full width), centred card from tablet
// up. Escape and the backdrop close it; focus moves in on open and returns to
// the opener on close; the page behind does not scroll.

export function Dialog({ title, onClose, children, footer, size = 'md', dismissable = true }: {
  title: string
  onClose: () => void
  children: React.ReactNode
  footer?: React.ReactNode
  size?: 'md' | 'lg'
  /** False while something irreversible is in flight (payment redirect). */
  dismissable?: boolean
}) {
  const tx = useTx()
  const titleId = useId()
  const ref = useRef<HTMLDivElement>(null)
  const close = useRef(onClose)
  close.current = onClose
  useEffect(() => {
    const opener = document.activeElement as HTMLElement | null
    const first = ref.current?.querySelector<HTMLElement>('input, select, button:not([data-close]), [href]')
    first?.focus()
    const prev = document.body.style.overflow
    document.body.style.overflow = 'hidden'
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape' && dismissable) close.current()
      if (e.key === 'Tab' && ref.current) {
        const f = [...ref.current.querySelectorAll<HTMLElement>('button, input, select, [href], [tabindex]:not([tabindex="-1"])')].filter((el) => !el.hasAttribute('disabled'))
        if (f.length === 0) return
        if (e.shiftKey && document.activeElement === f[0]) { e.preventDefault(); f[f.length - 1].focus() }
        else if (!e.shiftKey && document.activeElement === f[f.length - 1]) { e.preventDefault(); f[0].focus() }
      }
    }
    addEventListener('keydown', onKey)
    return () => { removeEventListener('keydown', onKey); document.body.style.overflow = prev; opener?.focus?.() }
  }, [dismissable])

  return (
    <div role="dialog" aria-modal="true" aria-labelledby={titleId}
      className="fixed inset-0 z-50 flex items-end sm:items-center justify-center bg-black/50 sm:p-4"
      onClick={dismissable ? onClose : undefined}>
      <div ref={ref} onClick={(e) => e.stopPropagation()}
        className={`w-full ${size === 'lg' ? 'sm:max-w-[640px]' : 'sm:max-w-[500px]'} max-h-[92dvh] flex flex-col rounded-t-[16px] sm:rounded-[14px] border border-[var(--border)] bg-[var(--surface)] text-[var(--text)] shadow-2xl`}>
        <div className="sm:hidden mx-auto mt-2 h-1 w-10 rounded-full bg-[var(--border)]" aria-hidden />
        <div className="flex items-center gap-3 px-5 sm:px-6 pt-4 sm:pt-5">
          <h2 id={titleId} className="flex-1 text-[17px] font-semibold">{title}</h2>
          {dismissable && (
            <button data-close onClick={onClose} aria-label={tx("Close")} className="w-8 h-8 -mr-2 grid place-items-center rounded-[7px] text-[var(--text-dim)] hover:bg-[var(--surface-2)]">✕</button>
          )}
        </div>
        <div className="flex-1 overflow-y-auto overscroll-contain px-5 sm:px-6 py-4">{children}</div>
        {footer && (
          <div className="px-5 sm:px-6 py-4 border-t border-[var(--border)] flex flex-col-reverse sm:flex-row sm:justify-end gap-2 pb-[max(1rem,env(safe-area-inset-bottom))]">
            {footer}
          </div>
        )}
      </div>
    </div>
  )
}

// ── Forms and settings ────────────────────────────────────────────────────────

export const inputClass = 'w-full h-[38px] sm:h-[34px] rounded-[8px] border border-[var(--border)] bg-[var(--surface-2)] px-2.5 text-[13px] text-[var(--text)] focus:outline focus:outline-2 focus:outline-[var(--accent)]'

export function Field({ label, hint, children, className = '' }: { label: string; hint?: React.ReactNode; children: React.ReactNode; className?: string }) {
  return (
    <label className={`block min-w-0 text-[12px] text-[var(--text-dim)] ${className}`}>
      {label}
      <div className="mt-1">{children}</div>
      {hint && <span className="block mt-1 text-[11.5px] text-[var(--text-faint)]">{hint}</span>}
    </label>
  )
}

export function Toggle({ checked, onChange, label, disabled }: { checked: boolean; onChange: (v: boolean) => void; label: string; disabled?: boolean }) {
  return (
    <button type="button" role="switch" aria-checked={checked} aria-label={label} disabled={disabled} onClick={() => onChange(!checked)}
      className={`relative shrink-0 w-[38px] h-[22px] rounded-full transition-colors disabled:opacity-50 ${checked ? 'bg-[var(--accent)]' : 'bg-[var(--surface-2)] border border-[var(--border)]'}`}>
      <span aria-hidden className={`absolute top-[3px] w-4 h-4 rounded-full bg-white transition-[left] ${checked ? 'left-[19px]' : 'left-[3px]'}`} />
    </button>
  )
}

/** One setting: what it is on the left, its control on the right (stacked on a phone). */
export function SettingRow({ title, detail, children }: { title: string; detail?: React.ReactNode; children?: React.ReactNode }) {
  return (
    <div className="flex flex-col sm:flex-row sm:items-center gap-2 sm:gap-6 px-4 sm:px-5 py-3.5">
      <div className="flex-1 min-w-0">
        <p className="text-[13.5px] font-medium">{title}</p>
        {detail && <p className="text-[12px] text-[var(--text-dim)] mt-0.5">{detail}</p>}
      </div>
      {children && <div className="shrink-0 flex flex-wrap items-center gap-2">{children}</div>}
    </div>
  )
}

/** A titled group of settings rows. */
export function SettingGroup({ title, children, tone, tour }: { title: string; children: React.ReactNode; tone?: 'danger'; tour?: string }) {
  return (
    <section className="mb-6" data-tour={tour}>
      <SectionLabel>{title}</SectionLabel>
      <div className="rounded-[10px] border bg-[var(--surface)] divide-y divide-[var(--border)]" style={{ borderColor: tone === 'danger' ? 'color-mix(in srgb, var(--danger) 45%, var(--border))' : 'var(--border)' }}>
        {children}
      </div>
    </section>
  )
}

export function Danger({ children, onClick, disabled, type = 'button', className = '' }: BtnProps) {
  return (
    <button type={type} onClick={onClick} disabled={disabled}
      className={`inline-flex items-center justify-center h-[34px] sm:h-[30px] px-3 rounded-[7px] text-[12.5px] font-medium border text-[var(--danger)] hover:bg-[color-mix(in_srgb,var(--danger)_10%,transparent)] disabled:opacity-50 ${className}`}
      style={{ borderColor: 'color-mix(in srgb, var(--danger) 50%, var(--border))' }}>
      {children}
    </button>
  )
}

/** Fired after any in-workspace pushState, so the shell knows the URL changed. */
export const NAV_EVENT = 'workspace:navigate'
export const notifyNav = () => { if (typeof dispatchEvent === 'function') dispatchEvent(new Event(NAV_EVENT)) }

// ── Tabs inside a section ─────────────────────────────────────────────────────
// The tab is the second URL segment (/workspace/settings/security), so every
// screen is linkable and survives a refresh — the same rule as sections.

export function subFromPath<T extends string>(tabs: readonly { id: T }[], pathname = typeof location !== 'undefined' ? location.pathname : ''): T {
  const seg = pathname.split('/workspace/')[1]?.split('/')[1]
  return tabs.find((t) => t.id === seg)?.id ?? tabs[0].id
}

export function useSubTab<T extends string>(section: string, tabs: readonly { id: T }[]): [T, (t: T) => void] {
  const [tab, setTab] = useState<T>(() => subFromPath(tabs))
  const go = useCallback((t: T) => {
    setTab(t)
    const base = `${import.meta.env.BASE_URL ?? '/'}workspace/${section}`
    const url = t === tabs[0].id ? base : `${base}/${t}`
    if (typeof history !== 'undefined' && location.pathname !== url) { history.pushState(null, '', url); notifyNav() }
  }, [section, tabs])
  useEffect(() => {
    const onPop = () => setTab(subFromPath(tabs))
    addEventListener('popstate', onPop)
    return () => removeEventListener('popstate', onPop)
  }, [tabs])
  return [tab, go]
}

export function Tabs<T extends string>({ tabs, value, onChange, label }: { tabs: readonly { id: T; label: string; count?: number }[]; value: T; onChange: (t: T) => void; label: string }) {
  const tx = useTx()
  return (
    <>
    {/* Phone: a select, so no tab hides past the edge of a sideways-scrolling strip. */}
    <select data-tour="tabs" aria-label={label} className={`${inputClass} sm:hidden mb-5 font-medium`} value={value} onChange={(e) => onChange(e.target.value as T)}>
      {tabs.map((t) => <option key={t.id} value={t.id}>{tx(t.label)}{t.count ? ` (${t.count})` : ''}</option>)}
    </select>
    <div data-tour="tabs" role="tablist" aria-label={label} className="hidden sm:flex gap-1 overflow-x-auto border-b border-[var(--border)] mb-5">
      {tabs.map((t) => (
        <button key={t.id} role="tab" aria-selected={value === t.id} onClick={() => onChange(t.id)}
          className={`shrink-0 h-[38px] px-3 -mb-px border-b-2 text-[13px] whitespace-nowrap ${value === t.id ? 'border-[var(--accent)] text-[var(--text)] font-medium' : 'border-transparent text-[var(--text-faint)] hover:text-[var(--text)]'}`}>
          {tx(t.label)}{t.count ? <span className="ml-1.5 text-[11px] tabular-nums text-[var(--text-faint)]">{t.count}</span> : null}
        </button>
      ))}
    </div>
    </>
  )
}

// ── Inline help ───────────────────────────────────────────────────────────────
// Help sits next to what it explains, collapsed to one "?" so the form stays
// calm; a guided tour can open the same text via its data-tour anchor.

export function Hint({ children, label = 'What is this?' }: { children: React.ReactNode; label?: string }) {
  const [open, setOpen] = useState(false)
  return (
    <span className="inline">
      <button type="button" aria-expanded={open} aria-label={label} onClick={(e) => { e.preventDefault(); setOpen((o) => !o) }}
        className="ml-1 inline-grid place-items-center w-[16px] h-[16px] rounded-full border border-[var(--border)] text-[10px] leading-none text-[var(--text-faint)] hover:text-[var(--text)] align-[1px]">?</button>
      {open && <span role="note" className="block mt-1.5 mb-1 rounded-[8px] bg-[var(--surface-2)] px-3 py-2 text-[12px] text-[var(--text-dim)] font-normal normal-case tracking-normal">{children}</span>}
    </span>
  )
}

/** Copy-to-clipboard for URLs, secrets shown once and code samples. */
export function CopyField({ value, label, secret, mono = true }: { value: string; label: string; secret?: boolean; mono?: boolean }) {
  const tx = useTx()
  const [copied, setCopied] = useState(false)
  const [shown, setShown] = useState(!secret)
  return (
    <div className="flex gap-2">
      <input readOnly aria-label={label} value={shown ? value : '•'.repeat(Math.min(value.length, 32))} className={`${inputClass} ${mono ? 'font-mono text-[12px]' : ''}`} onFocus={(e) => e.currentTarget.select()} />
      {secret && <Quiet className="shrink-0 !h-[38px] sm:!h-[34px]" onClick={() => setShown((s) => !s)}>{shown ? tx("Hide") : tx("Show")}</Quiet>}
      <Quiet className="shrink-0 !h-[38px] sm:!h-[34px]" onClick={() => { void navigator.clipboard?.writeText(value); setCopied(true); setTimeout(() => setCopied(false), 1500) }}>{copied ? tx("Copied") : tx("Copy")}</Quiet>
    </div>
  )
}
