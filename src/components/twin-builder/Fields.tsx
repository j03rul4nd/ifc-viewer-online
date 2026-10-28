// Small form pieces shared by the two builders. Plain inputs, labelled, with
// the hint under them: a non-technical buyer fills these in.

import { useId, useRef, type ReactNode } from 'react'
import { parseCsv } from './csv'

export const input = 'w-full rounded-lg border border-[var(--border-strong)] bg-[var(--bg)] px-3 py-2 text-[14px] text-[var(--text)] placeholder:text-[var(--text-faint)] focus:border-[var(--accent)] focus:outline-none'
export const btn = 'inline-flex items-center justify-center gap-1.5 rounded-lg border border-[var(--border-strong)] px-3 py-1.5 text-[13px] font-medium text-[var(--text)] hover:bg-[var(--surface)] disabled:opacity-40'
export const btnPrimary = 'inline-flex items-center justify-center gap-1.5 rounded-lg bg-[var(--accent)] px-3.5 py-2 text-[13px] font-semibold text-white hover:opacity-90 disabled:opacity-40'

export function Section({ n, title, hint, children, open = false }: { n: number; title: string; hint?: string; children: ReactNode; open?: boolean }) {
  return (
    <details open={open} className="group border-b border-[var(--border)] py-1">
      <summary className="flex cursor-pointer list-none items-center gap-3 py-3 [&::-webkit-details-marker]:hidden">
        <span className="flex h-6 w-6 flex-none items-center justify-center rounded-full bg-[var(--surface)] text-[12px] font-semibold text-[var(--text-dim)]">{n}</span>
        <span className="min-w-0 flex-1">
          <span className="block text-[15px] font-semibold text-[var(--text)]">{title}</span>
          {hint && <span className="block text-[12.5px] text-[var(--text-dim)]">{hint}</span>}
        </span>
        <span className="text-[var(--text-faint)] transition-transform group-open:rotate-90">›</span>
      </summary>
      <div className="space-y-4 pb-5 pl-9">{children}</div>
    </details>
  )
}

export function Field({ label, hint, children }: { label: string; hint?: ReactNode; children: ReactNode }) {
  return (
    <label className="block">
      <span className="mb-1 block text-[13px] font-medium text-[var(--text)]">{label}</span>
      {children}
      {hint && <span className="mt-1 block text-[12px] leading-snug text-[var(--text-faint)]">{hint}</span>}
    </label>
  )
}

export function Num({ label, hint, value, onChange, min, max, step = 1 }: { label: string; hint?: string; value: number; onChange: (v: number) => void; min?: number; max?: number; step?: number }) {
  return (
    <Field label={label} hint={hint}>
      <input type="number" inputMode="decimal" className={input} value={Number.isFinite(value) ? value : ''} min={min} max={max} step={step}
        onChange={(e) => { const v = Number(e.target.value); if (Number.isFinite(v)) onChange(v) }} />
    </Field>
  )
}

export function Text({ label, hint, value, onChange, placeholder, type = 'text' }: { label: string; hint?: ReactNode; value: string; onChange: (v: string) => void; placeholder?: string; type?: string }) {
  return (
    <Field label={label} hint={hint}>
      <input type={type} className={input} value={value} placeholder={placeholder} onChange={(e) => onChange(e.target.value)} autoComplete="off" spellCheck={false} />
    </Field>
  )
}

export function Lines({ label, hint, value, onChange, rows = 4 }: { label: string; hint?: string; value: string[]; onChange: (v: string[]) => void; rows?: number }) {
  return (
    <Field label={label} hint={hint ?? 'One per line.'}>
      <textarea className={`${input} font-mono text-[13px]`} rows={rows} value={value.join('\n')} onChange={(e) => onChange(e.target.value.split('\n'))} onBlur={(e) => onChange(e.target.value.split('\n').map((x) => x.trim()).filter(Boolean))} spellCheck={false} />
    </Field>
  )
}

export function Toggle({ label, hint, checked, onChange }: { label: string; hint?: ReactNode; checked: boolean; onChange: (v: boolean) => void }) {
  const id = useId()
  return (
    <div className="flex items-start gap-3">
      <button id={id} type="button" role="switch" aria-checked={checked} onClick={() => onChange(!checked)}
        className={`mt-0.5 h-5 w-9 flex-none rounded-full p-0.5 transition-colors ${checked ? 'bg-[var(--accent)]' : 'bg-[var(--border-strong)]'}`}>
        <span className={`block h-4 w-4 rounded-full bg-white transition-transform ${checked ? 'translate-x-4' : ''}`} />
      </button>
      <label htmlFor={id} className="cursor-pointer">
        <span className="block text-[13px] font-medium text-[var(--text)]">{label}</span>
        {hint && <span className="block text-[12px] leading-snug text-[var(--text-faint)]">{hint}</span>}
      </label>
    </div>
  )
}

export function Select<T extends string>({ label, hint, value, options, onChange }: { label: string; hint?: string; value: T; options: { value: T; label: string }[]; onChange: (v: T) => void }) {
  return (
    <Field label={label} hint={hint}>
      <select className={input} value={value} onChange={(e) => onChange(e.target.value as T)}>
        {options.map((o) => <option key={o.value} value={o.value}>{o.label}</option>)}
      </select>
    </Field>
  )
}

/** Paste "41.65, -0.88" (as Google Maps copies it) or type both numbers. */
export function Coords({ label, hint, value, onChange }: { label: string; hint?: string; value: [number, number]; onChange: (v: [number, number]) => void }) {
  return (
    <Field label={label} hint={hint ?? 'Latitude, longitude. In Google Maps: right-click the place and click the numbers to copy them.'}>
      <input className={`${input} font-mono`} defaultValue={`${value[0]}, ${value[1]}`} key={`${value[0]},${value[1]}`}
        onBlur={(e) => {
          const m = e.target.value.match(/(-?\d+(?:[.,]\d+)?)\s*[,; ]\s*(-?\d+(?:[.,]\d+)?)/)
          if (!m) return
          const la = Number(m[1].replace(',', '.')), lo = Number(m[2].replace(',', '.'))
          if (Math.abs(la) <= 90 && Math.abs(lo) <= 180) onChange([la, lo])
        }} />
    </Field>
  )
}

/** Load a spreadsheet: pick a .csv file, or paste the cells straight from Excel. */
export function CsvInput({ label, hint, onRows, template }: { label: string; hint?: ReactNode; onRows: (rows: string[][]) => void; template?: () => void }) {
  const file = useRef<HTMLInputElement>(null)
  return (
    <div>
      <p className="mb-1 text-[13px] font-medium text-[var(--text)]">{label}</p>
      <div className="flex flex-wrap gap-2">
        <button type="button" className={btn} onClick={() => file.current?.click()}>Choose a .csv file</button>
        {template && <button type="button" className={btn} onClick={template}>Download a template</button>}
        <input ref={file} type="file" accept=".csv,.tsv,.txt,text/csv" className="hidden"
          onChange={async (e) => { const f = e.target.files?.[0]; if (f) onRows(parseCsv(await f.text())); e.target.value = '' }} />
      </div>
      <textarea className={`${input} mt-2 font-mono text-[12px]`} rows={3} placeholder="…or paste the cells from Excel / Google Sheets here (with the header row)"
        onPaste={(e) => { const t = e.clipboardData.getData('text'); if (t.includes('\n')) { e.preventDefault(); onRows(parseCsv(t)) } }} />
      {hint && <p className="mt-1 text-[12px] leading-snug text-[var(--text-faint)]">{hint}</p>}
    </div>
  )
}

export function Note({ tone = 'info', children }: { tone?: 'info' | 'ok' | 'warn'; children: ReactNode }) {
  const c = tone === 'ok' ? 'border-[var(--ok)]/40 bg-[var(--ok)]/10' : tone === 'warn' ? 'border-[var(--warn)]/40 bg-[var(--warn)]/10' : 'border-[var(--border)] bg-[var(--surface)]'
  return <div className={`rounded-lg border px-3 py-2 text-[12.5px] leading-snug text-[var(--text-dim)] ${c}`}>{children}</div>
}

export function Code({ children }: { children: string }) {
  return <pre className="max-h-56 overflow-auto rounded-lg bg-black/50 p-2.5 text-[11.5px] leading-snug text-[#c7d2fe]"><code>{children}</code></pre>
}
