// ─── Cover Studio UI primitives ────────────────────────────────────────────────
// The handful of controls every panel uses, styled once with the app's tokens.

import type { ReactNode } from 'react'

export const cls = {
  section: 'text-[10.5px] font-semibold uppercase tracking-[0.08em] text-[var(--text-dim)] mb-2',
  sub: 'text-[11px] text-[var(--text-dim)] mb-1',
  input: 'w-full h-[30px] px-2 rounded-[6px] bg-[var(--surface-2)] border border-[var(--border)] text-[12.5px] text-[var(--text)] outline-none focus:border-[var(--accent)]',
  btn: 'inline-flex items-center justify-center gap-1.5 h-[32px] px-3 rounded-[7px] text-[12.5px] font-medium border border-[var(--border)] text-[var(--text)] hover:bg-[var(--surface-2)] disabled:opacity-40 disabled:cursor-not-allowed',
  btnSm: 'inline-flex items-center justify-center gap-1 h-[26px] px-2 rounded-[6px] text-[11.5px] font-medium border border-[var(--border)] text-[var(--text)] hover:bg-[var(--surface-2)] disabled:opacity-40 disabled:cursor-not-allowed',
  primary: 'inline-flex items-center justify-center gap-1.5 h-[32px] px-3 rounded-[7px] text-[12.5px] font-semibold bg-[var(--accent)] text-white hover:opacity-90 disabled:opacity-40 disabled:cursor-not-allowed',
  icon: 'p-1.5 rounded-[6px] text-[var(--text-dim)] hover:text-[var(--text)] hover:bg-[var(--surface-2)] disabled:opacity-30 disabled:cursor-not-allowed',
  card: 'rounded-[8px] border border-[var(--border)] p-2.5',
}

export function chip(on: boolean): string {
  return `px-2.5 h-[28px] rounded-[6px] text-[12px] border transition-colors ${on ? 'border-[var(--accent)] bg-[var(--accent)]/10 text-[var(--text)]' : 'border-[var(--border)] text-[var(--text-dim)] hover:text-[var(--text)] hover:bg-[var(--surface-2)]'}`
}

export function Section({ title, children, right }: { title: string; children: ReactNode; right?: ReactNode }) {
  return (
    <section>
      <div className="flex items-center justify-between gap-2">
        <div className={cls.section}>{title}</div>
        {right}
      </div>
      {children}
    </section>
  )
}

export function Slider({ label, value, min, max, step, onChange, format, onReset }: {
  label: string; value: number; min: number; max: number; step: number
  onChange: (v: number) => void; format?: (v: number) => string; onReset?: () => void
}) {
  return (
    <label className="flex items-center gap-2 text-[11px] text-[var(--text-dim)]" onDoubleClick={onReset}>
      <span className="w-[76px] shrink-0 truncate" title={label}>{label}</span>
      <input type="range" min={min} max={max} step={step} value={value} onChange={(e) => onChange(Number(e.target.value))} className="flex-1 min-w-0" />
      <span className="tabular-nums w-10 text-right">{format ? format(value) : value.toFixed(2)}</span>
    </label>
  )
}

export function Toggle({ label, checked, onChange, hint }: { label: string; checked: boolean; onChange: (v: boolean) => void; hint?: string }) {
  return (
    <label className="flex items-start gap-2 text-[12.5px] text-[var(--text)] py-0.5" title={hint}>
      <input type="checkbox" className="mt-[3px]" checked={checked} onChange={(e) => onChange(e.target.checked)} />
      <span className="min-w-0">
        {label}
        {hint && <span className="block text-[11px] text-[var(--text-dim)] leading-snug">{hint}</span>}
      </span>
    </label>
  )
}
