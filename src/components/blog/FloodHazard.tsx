// ─── FloodHazard.tsx ──────────────────────────────────────────────────────────
// "Is this water dangerous?" — the question a flood map raises and does not
// answer. Depth alone does not decide it: 20 cm still and 20 cm at 2.5 m/s are
// different floods. The reader sets a depth and a speed (from the simulation,
// or from the street) and gets the hazard rating of Defra / EA research
// FD2320/FD2321 with its class, on a depth × speed chart of the four zones.
//
// Every value is text in an aria-live region; the chart is decoration
// (aria-hidden). The maths is lib/flood-hazard.ts (tested against the
// published table); the words come with the post, so they are translated
// with it.

import React from 'react'
import { hazardClass, hazardRating, type DebrisMode } from '../../lib/flood-hazard'

export interface FloodHazardLabels {
  depth: string
  velocity: string
  debris: string
  debrisModes: Record<DebrisMode, string>
  rating: string
  /** Low, danger for some, for most, for all. */
  classes: [string, string, string, string]
  /** Who each class is dangerous for. */
  notes: [string, string, string, string]
  dry: string
}

interface Props {
  title?: string
  caption?: string
  depth?: number
  velocity?: number
  labels: FloodHazardLabels
  lang?: string
}

const D_MAX = 2.5
const V_MAX = 4
const ZONE = ['var(--ok)', 'var(--warn)', 'color-mix(in srgb, var(--warn) 45%, var(--danger))', 'var(--danger)']
const MODES: DebrisMode[] = ['precautionary', 'urban', 'woodland', 'pasture']

/** The four zones over depth × speed, as rectangles (coarse: it is a backdrop). */
function zoneRects(mode: DebrisMode): Array<{ x: number; y: number; w: number; h: number; k: number }> {
  const cols = 50, rows = 32
  const out: Array<{ x: number; y: number; w: number; h: number; k: number }> = []
  for (let r = 0; r < rows; r++) {
    for (let c = 0; c < cols; c++) {
      const d = ((c + 0.5) / cols) * D_MAX
      const v = ((r + 0.5) / rows) * V_MAX
      const k = hazardClass(hazardRating(d, v, mode))
      // Merge runs along the row: fewer nodes.
      const last = out[out.length - 1]
      if (last && last.y === rows - 1 - r && last.k === k && last.x + last.w === c) last.w++
      else out.push({ x: c, y: rows - 1 - r, w: 1, h: 1, k })
    }
  }
  return out.map((q) => ({ ...q, x: (q.x / cols) * 100, y: (q.y / rows) * 100, w: (q.w / cols) * 100, h: (1 / rows) * 100 }))
}

export default function FloodHazard({ title, caption, depth = 0.3, velocity = 0.5, labels, lang = 'en' }: Props) {
  const [d, setD] = React.useState(depth)
  const [v, setV] = React.useState(velocity)
  const [mode, setMode] = React.useState<DebrisMode>('precautionary')
  const id = React.useId()
  const hr = hazardRating(d, v, mode)
  const k = hazardClass(hr)
  const rects = React.useMemo(() => zoneRects(mode), [mode])
  const fmt = (x: number, digits: number) => x.toLocaleString(lang, { minimumFractionDigits: digits, maximumFractionDigits: digits })

  return (
    <figure className="my-8 rounded-2xl border border-[var(--border)] bg-[var(--surface)] p-5 sm:p-6">
      {title && <p className="mb-4 text-[14.5px] font-semibold tracking-tight text-[var(--text)]">{title}</p>}
      <div className="grid gap-5 sm:grid-cols-[1fr_minmax(0,260px)]">
        <div className="space-y-4">
          <label className="block">
            <span className="flex items-baseline justify-between text-[13px] text-[var(--text-dim)]">
              {labels.depth}<output htmlFor={`${id}-d`} className="font-mono tabular-nums text-[var(--text)]">{fmt(d, 2)} m</output>
            </span>
            <input id={`${id}-d`} type="range" min={0} max={D_MAX} step={0.05} value={d}
              onChange={(e) => setD(Number(e.target.value))} className="mt-2 w-full accent-[var(--accent)]" />
          </label>
          <label className="block">
            <span className="flex items-baseline justify-between text-[13px] text-[var(--text-dim)]">
              {labels.velocity}<output htmlFor={`${id}-v`} className="font-mono tabular-nums text-[var(--text)]">{fmt(v, 1)} m/s</output>
            </span>
            <input id={`${id}-v`} type="range" min={0} max={V_MAX} step={0.1} value={v}
              onChange={(e) => setV(Number(e.target.value))} className="mt-2 w-full accent-[var(--accent)]" />
          </label>
          <label className="block text-[13px] text-[var(--text-dim)]">
            {labels.debris}
            <select value={mode} onChange={(e) => setMode(e.target.value as DebrisMode)}
              className="mt-1.5 block w-full min-h-[40px] rounded-lg border border-[var(--border)] bg-[var(--surface-2)] px-2.5 text-[13px] text-[var(--text)]">
              {MODES.map((m) => <option key={m} value={m}>{labels.debrisModes[m]}</option>)}
            </select>
          </label>
          <div role="status" aria-live="polite" className="rounded-xl border p-3.5"
            style={{ borderColor: d > 0 ? `color-mix(in srgb, ${ZONE[k]} 55%, var(--border))` : 'var(--border)', background: d > 0 ? `color-mix(in srgb, ${ZONE[k]} 12%, var(--surface))` : 'var(--surface-2)' }}>
            {d > 0 ? (
              <>
                <p className="text-[12px] uppercase tracking-[0.08em] text-[var(--text-faint)]">{labels.rating} <span className="font-mono normal-case tracking-normal text-[var(--text)]">{fmt(hr, 2)}</span></p>
                <p className="mt-1 text-[15px] font-semibold text-[var(--text)]">{labels.classes[k]}</p>
                <p className="mt-0.5 text-[12.5px] leading-snug text-[var(--text-dim)]">{labels.notes[k]}</p>
              </>
            ) : (
              <p className="text-[13px] text-[var(--text-dim)]">{labels.dry}</p>
            )}
          </div>
        </div>
        {/* Depth across, speed up: the four zones and where this water sits. */}
        <div aria-hidden="true">
          <div className="mb-1 flex justify-between font-mono text-[10.5px] text-[var(--text-faint)]">
            <span>↑ {labels.velocity}</span><span>{fmt(V_MAX, 0)} m/s</span>
          </div>
          <svg viewBox="0 0 100 100" preserveAspectRatio="none" className="block aspect-[5/4] w-full overflow-hidden rounded-lg border border-[var(--border)]">
            {rects.map((q, i) => (
              <rect key={i} x={q.x} y={q.y} width={q.w + 0.05} height={q.h + 0.05} fill={ZONE[q.k]} opacity={0.55} />
            ))}
            {d > 0 && (
              <circle cx={(Math.min(d, D_MAX) / D_MAX) * 100} cy={100 - (Math.min(v, V_MAX) / V_MAX) * 100} r={2.6}
                fill="var(--surface)" stroke="var(--text)" strokeWidth={1.2} vectorEffect="non-scaling-stroke" />
            )}
          </svg>
          <div className="mt-1 flex justify-between font-mono text-[10.5px] text-[var(--text-faint)]">
            <span>0</span><span>{labels.depth} →</span><span>{fmt(D_MAX, 1)} m</span>
          </div>
        </div>
      </div>
      {caption && <figcaption className="mt-4 text-[12px] leading-[1.6] text-[var(--text-faint)]">{caption}</figcaption>}
    </figure>
  )
}
