// Shared bits of the version comparison workspace.
import React from 'react'

export function downloadBlob(blob: Blob, fileName: string): void {
  const url = URL.createObjectURL(blob)
  const a = document.createElement('a')
  a.href = url
  a.download = fileName
  document.body.appendChild(a)
  a.click()
  a.remove()
  setTimeout(() => URL.revokeObjectURL(url), 1000)
}

/** Local calendar date, YYYY-MM-DD (toISOString would give the UTC one). */
export function stamp(d = new Date()): string {
  const p = (n: number): string => String(n).padStart(2, '0')
  return `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())}`
}

export const STATUS_COLOR = {
  added: '#3B82F6',    // matches the overlay's info colour
  removed: 'var(--danger)',
  modified: '#F5A623',
  unchanged: 'var(--text-faint)',
} as const

export function Button({
  children, onClick, disabled, primary, title, small,
}: { children: React.ReactNode; onClick?: () => void; disabled?: boolean; primary?: boolean; title?: string; small?: boolean }) {
  return (
    <button
      type="button"
      onClick={onClick}
      disabled={disabled}
      title={title}
      className={`${small ? 'h-7 px-2.5 text-[11px]' : 'h-8 px-3 text-[12px]'} inline-flex items-center gap-1.5 rounded-md border transition-colors disabled:opacity-40 disabled:cursor-not-allowed ${
        primary
          ? 'bg-[var(--accent)] border-[var(--accent)] text-white hover:brightness-110'
          : 'border-[var(--border)] text-[var(--text-dim)] hover:text-[var(--text)] hover:border-[var(--text-faint)]'
      }`}
    >
      {children}
    </button>
  )
}

export function Stat({ label, value, color }: { label: string; value: React.ReactNode; color?: string }) {
  return (
    <div className="px-3 py-2 rounded-lg border border-[var(--border)] bg-[var(--surface)] min-w-[92px]">
      <div className="text-[18px] font-semibold tabular-nums leading-tight" style={{ color: color ?? 'var(--text)' }}>{value}</div>
      <div className="text-[10.5px] text-[var(--text-faint)]">{label}</div>
    </div>
  )
}

export function Section({ title, children, right }: { title: string; children: React.ReactNode; right?: React.ReactNode }) {
  return (
    <section className="flex flex-col gap-2">
      <div className="flex items-center justify-between gap-2">
        <h3 className="m-0 text-[12px] font-semibold text-[var(--text)]">{title}</h3>
        {right}
      </div>
      {children}
    </section>
  )
}

export function Hint({ children, tone }: { children: React.ReactNode; tone?: 'warn' | 'error' }) {
  const color = tone === 'error' ? 'var(--danger)' : tone === 'warn' ? '#F5A623' : 'var(--text-faint)'
  return <p className="m-0 text-[11px] leading-relaxed" style={{ color }}>{children}</p>
}

export function Check({ checked, onChange, children }: { checked: boolean; onChange: (v: boolean) => void; children: React.ReactNode }) {
  return (
    <label className="inline-flex items-center gap-1.5 text-[11.5px] text-[var(--text-dim)] cursor-pointer select-none">
      <input type="checkbox" checked={checked} onChange={(e) => onChange(e.target.checked)} className="accent-[var(--accent)]" />
      {children}
    </label>
  )
}
