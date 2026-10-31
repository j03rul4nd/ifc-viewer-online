// ─── Sketch studio: the controls ──────────────────────────────────────────────
// The same sections in two arrangements. With room: a rail against one edge, on
// the side the user chose, so a left-hander's pen hand does not cover it. Without
// room: one row of tools under the thumb, the rest in a sheet that opens above it.

import { useRef, useState, type ReactNode } from 'react'
import {
  activePage, addLayer, addPage, addView, clearLayer, commit, deleteLayer, deletePage, parseDoc, patchLayer, removeView,
  serializeDoc, setActiveLayer, setActivePage, setPaper, startHistory, type History,
} from '../../lib/sketch/document'
import { exportSvg } from '../../lib/sketch/export-svg'
import { offsetPlane, presetPlane, rotatePlane, type PlanePreset } from '../../lib/sketch/plane'
import { PAPER, type SketchRenderer } from '../../lib/sketch/renderer'
import type { BrushKind, OrbitState, PaperKind, SavedView, SketchDoc, SketchPlane } from '../../lib/sketch/types'
import { downloadBlob } from './SketchStudio'

export type SketchTool = BrushKind | 'line' | 'eraser' | 'pick'
type Tx = (key: string, o?: Record<string, unknown>) => string
type SetHistory = (next: History | ((h: History) => History)) => void

const ICONS: Record<string, ReactNode> = {
  pen: <path d="M3 13l1-3 7-7 2 2-7 7-3 1z" />,
  pencil: <path d="M3 13l.7-2.8L10.5 3.4l2.1 2.1-6.8 6.8L3 13zM9.3 4.6l2.1 2.1" />,
  marker: <path d="M4 12l2-5 5-4 2 2-4 5-5 2zM3 14h5" />,
  line: <path d="M3 13L13 3" />,
  eraser: <path d="M6 13l-3-3 6.5-6.5a1.4 1.4 0 012 0l1 1a1.4 1.4 0 010 2L7 13H6zM6 13h7" />,
  pick: <path d="M2 11l6-3 6 3-6 3-6-3zM8 8V2M6 4l2-2 2 2" />,
  undo: <path d="M6 3L3 6l3 3M3 6h6.5a3.5 3.5 0 010 7H7" />,
  redo: <path d="M10 3l3 3-3 3M13 6H6.5a3.5 3.5 0 000 7H9" />,
  refs: <><rect x="2.5" y="3" width="11" height="10" rx="1.5" /><path d="M3 11l3-3 2.5 2.5L10.5 8.5l2.5 2.5" /></>,
  more: <path d="M3 5h10M3 8h10M3 11h10" />,
  eye: <><path d="M1.5 8S4 3.5 8 3.5 14.5 8 14.5 8 12 12.5 8 12.5 1.5 8 1.5 8z" /><circle cx="8" cy="8" r="1.8" /></>,
  eyeOff: <path d="M2 2l12 12M6.5 3.7A6.8 6.8 0 018 3.5c4 0 6.5 4.5 6.5 4.5a11 11 0 01-2 2.6M4 5.2A11 11 0 001.5 8S4 12.5 8 12.5c1 0 1.9-.3 2.7-.7" />,
  lock: <><rect x="3.5" y="7" width="9" height="6.5" rx="1" /><path d="M5.5 7V5a2.5 2.5 0 015 0v2" /></>,
  unlock: <><rect x="3.5" y="7" width="9" height="6.5" rx="1" /><path d="M5.5 7V5a2.5 2.5 0 014.8-1" /></>,
  trash: <path d="M3 4.500h10M6.5 4.500V3h3v1.500M4.5 4.500l.6 8.500h5.800l.6-8.5" />,
  plus: <path d="M8 3v10M3 8h10" />,
  back: <path d="M10 3L5 8l5 5" />,
}

function Icon({ name, size = 16 }: { name: keyof typeof ICONS; size?: number }) {
  return (
    <svg width={size} height={size} viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.4" strokeLinecap="round" strokeLinejoin="round" aria-hidden>
      {ICONS[name]}
    </svg>
  )
}

const glass = { background: 'var(--sk-panel)', borderColor: 'var(--sk-line)', WebkitBackdropFilter: 'blur(14px)', backdropFilter: 'blur(14px)' } as const

function IconButton({ label, icon, onClick, active, disabled, size = 40 }: { label: string; icon: keyof typeof ICONS; onClick: () => void; active?: boolean; disabled?: boolean; size?: number }) {
  return (
    <button
      type="button" aria-label={label} title={label} aria-pressed={active} disabled={disabled} onClick={onClick}
      className="shrink-0 grid place-items-center rounded-lg disabled:opacity-30"
      style={{ width: size, height: size, background: active ? 'var(--sk-active)' : 'transparent', color: active ? 'var(--sk-on-active)' : 'var(--sk-text)' }}
    >
      <Icon name={icon} />
    </button>
  )
}

function Chip({ children, onClick, active, grow }: { children: ReactNode; onClick: () => void; active?: boolean; grow?: boolean }) {
  return (
    <button
      type="button" onClick={onClick} aria-pressed={active}
      className={`h-9 px-1.5 rounded-lg text-[11.5px] font-medium truncate ${grow ? 'flex-1 min-w-0' : 'shrink-0'}`}
      style={{ background: active ? 'var(--sk-active)' : 'var(--sk-soft)', color: active ? 'var(--sk-on-active)' : 'var(--sk-text)' }}
    >
      {children}
    </button>
  )
}

function Section({ title, children }: { title: string; children: ReactNode }) {
  return (
    <section className="px-3 py-2.5 border-b last:border-b-0" style={{ borderColor: 'var(--sk-line)' }}>
      <h3 className="text-[11px] font-medium mb-2" style={{ color: 'var(--sk-dim)' }}>{title}</h3>
      {children}
    </section>
  )
}

// ── Top bar ──────────────────────────────────────────────────────────────────

export function TopBar({ tx, compact, refsOpen, onToggleRefs, canUndo, canRedo, onUndo, onRedo, saveFailed }: {
  tx: Tx; compact: boolean; refsOpen: boolean; onToggleRefs: () => void
  canUndo: boolean; canRedo: boolean; onUndo: () => void; onRedo: () => void; saveFailed: boolean
}) {
  return (
    <div className="absolute z-20 flex items-center gap-1 left-2 right-2" style={{ top: 'max(8px, env(safe-area-inset-top))' }}>
      <a href="/" aria-label={tx('back')} title={tx('back')} className="w-10 h-10 grid place-items-center rounded-xl border" style={glass}><Icon name="back" /></a>
      {!compact && <span className="ml-2 text-[13px] font-medium">{tx('title')}</span>}
      {saveFailed && <span role="alert" className="ml-2 px-2 h-7 flex items-center rounded-md text-[11px] truncate" style={{ background: '#C8322B', color: '#fff' }}>{tx('notSaved')}</span>}
      <div className="flex-1" />
      <div className="flex items-center rounded-xl border" style={glass}>
        <IconButton label={tx('undo')} icon="undo" onClick={onUndo} disabled={!canUndo} />
        <IconButton label={tx('redo')} icon="redo" onClick={onRedo} disabled={!canRedo} />
        <IconButton label={tx('refs.label')} icon="refs" onClick={onToggleRefs} active={refsOpen} />
      </div>
    </div>
  )
}

// ── Page strip ───────────────────────────────────────────────────────────────

export function PageStrip({ tx, doc, setHistory, railSide }: { tx: Tx; doc: SketchDoc; setHistory: SetHistory; railSide: 'left' | 'right' }) {
  return (
    <div
      className="absolute z-10 flex items-center gap-1.5 p-1.5 rounded-xl border overflow-x-auto"
      style={{ ...glass, bottom: 'max(10px, env(safe-area-inset-bottom))', left: railSide === 'left' ? 268 : 10, right: railSide === 'right' ? 268 : 10, width: 'fit-content', maxWidth: 'calc(100% - 280px)', marginInline: 'auto', touchAction: 'pan-x' }}
      aria-label={tx('pages.label')}
    >
      {doc.pages.map((p, i) => {
        const active = p.id === doc.activePageId
        return (
          <div key={p.id} className="relative shrink-0">
            <button
              type="button" onClick={() => setHistory((h) => ({ ...h, present: setActivePage(h.present, p.id) }))}
              aria-label={tx('pages.name', { n: i + 1 })} aria-current={active}
              className="block w-14 h-10 rounded-md overflow-hidden border-2"
              style={{ borderColor: active ? 'var(--sk-active)' : 'var(--sk-line)', background: 'var(--sk-soft)' }}
            >
              {p.thumb && <img src={p.thumb} alt="" className="w-full h-full object-cover" draggable={false} />}
            </button>
            {active && doc.pages.length > 1 && (
              <button
                type="button" aria-label={tx('pages.delete')} title={tx('pages.delete')}
                onClick={() => setHistory((h) => commit(h, deletePage(h.present, p.id)))}
                className="absolute -top-1 -right-1 w-5 h-5 grid place-items-center rounded-full text-[11px] leading-none"
                style={{ background: 'var(--sk-active)', color: 'var(--sk-on-active)' }}
              >×</button>
            )}
          </div>
        )
      })}
      <IconButton label={tx('pages.add')} icon="plus" onClick={() => setHistory((h) => commit(h, addPage(h.present)))} />
    </div>
  )
}

// ── The compass ──────────────────────────────────────────────────────────────

const AXES: { key: 'x' | 'y' | 'z'; dir: [number, number, number]; color: string; preset: 'right' | 'top' | 'front' }[] = [
  { key: 'x', dir: [1, 0, 0], color: '#C8322B', preset: 'right' },
  { key: 'y', dir: [0, 1, 0], color: '#2E9E5B', preset: 'top' },
  { key: 'z', dir: [0, 0, 1], color: '#1F5FBF', preset: 'front' },
]

const VIEW_ANGLES = {
  top: { azimuth: 0, elevation: Math.PI / 2 - 0.01 },
  front: { azimuth: 0, elevation: 0 },
  right: { azimuth: Math.PI / 2, elevation: 0 },
  iso: { azimuth: 0.62, elevation: 0.42 },
}

/** Drag to orbit, tap an axis to look down it. Live with the camera. */
function Compass({ orbit, onOrbit, onPreset, label }: { orbit: OrbitState; onOrbit: (dx: number, dy: number) => void; onPreset: (p: keyof typeof VIEW_ANGLES) => void; label: string }) {
  const last = useRef<{ x: number; y: number; moved: number } | null>(null)
  const size = 92
  const r = 32
  const sa = Math.sin(orbit.azimuth), ca = Math.cos(orbit.azimuth), se = Math.sin(orbit.elevation), ce = Math.cos(orbit.elevation)
  const placed = AXES.map((a) => {
    const [x, y, z] = a.dir
    const sx = x * ca - z * sa
    const sy = -(y * ce - (x * sa + z * ca) * se)
    const depth = (x * sa + z * ca) * ce + y * se
    return { ...a, sx: size / 2 + sx * r, sy: size / 2 + sy * r, depth }
  }).sort((p, q) => p.depth - q.depth)
  return (
    <div
      role="img" aria-label={label} title={label}
      className="relative mx-auto" style={{ width: size, height: size, touchAction: 'none', cursor: 'grab' }}
      onPointerDown={(e) => { e.currentTarget.setPointerCapture(e.pointerId); last.current = { x: e.clientX, y: e.clientY, moved: 0 } }}
      onPointerMove={(e) => {
        if (!last.current) return
        const dx = e.clientX - last.current.x, dy = e.clientY - last.current.y
        last.current = { x: e.clientX, y: e.clientY, moved: last.current.moved + Math.abs(dx) + Math.abs(dy) }
        onOrbit(dx * 1.6, dy * 1.6)
      }}
      onPointerUp={(e) => {
        const s = last.current
        last.current = null
        if (!s || s.moved > 6) return
        const box = e.currentTarget.getBoundingClientRect()
        const near = placed.slice().reverse().find((p) => Math.hypot(p.sx - (e.clientX - box.left), p.sy - (e.clientY - box.top)) < 16)
        if (near) onPreset(near.preset)
      }}
      onPointerCancel={() => { last.current = null }}
    >
      <svg width={size} height={size} className="absolute inset-0">
        <circle cx={size / 2} cy={size / 2} r={r + 11} fill="var(--sk-soft)" />
        {placed.map((p) => (
          <g key={p.key}>
            <line x1={size / 2} y1={size / 2} x2={p.sx} y2={p.sy} stroke={p.color} strokeWidth="2" />
            <circle cx={p.sx} cy={p.sy} r="9" fill={p.color} opacity={p.depth >= 0 ? 1 : 0.45} />
            <text x={p.sx} y={p.sy + 3.5} textAnchor="middle" fontSize="10" fontWeight="600" fill="#fff" style={{ pointerEvents: 'none' }}>{p.key.toUpperCase()}</text>
          </g>
        ))}
      </svg>
    </div>
  )
}

/** Drag sideways to slide the plane along its normal. Springs back: there is no end to run out of. */
function NudgeSlider({ label, onDelta }: { label: string; onDelta: (pixels: number) => void }) {
  const last = useRef<number | null>(null)
  const [offset, setOffset] = useState(0)
  return (
    <div
      role="slider" aria-label={label} aria-valuenow={0} tabIndex={0}
      className="relative flex-1 h-9 rounded-lg overflow-hidden select-none flex items-center justify-center text-[12px]"
      style={{ background: 'var(--sk-soft)', touchAction: 'none', cursor: 'ew-resize' }}
      onKeyDown={(e) => { if (e.key === 'ArrowLeft') onDelta(-8); if (e.key === 'ArrowRight') onDelta(8) }}
      onPointerDown={(e) => { e.currentTarget.setPointerCapture(e.pointerId); last.current = e.clientX }}
      onPointerMove={(e) => {
        if (last.current === null) return
        onDelta(e.clientX - last.current)
        setOffset((o) => o + e.clientX - last.current!)
        last.current = e.clientX
      }}
      onPointerUp={() => { last.current = null; setOffset(0) }}
      onPointerCancel={() => { last.current = null; setOffset(0) }}
    >
      <span
        className="absolute inset-y-0 w-[200%]"
        style={{ left: '-50%', transform: `translateX(${offset % 12}px)`, backgroundImage: 'repeating-linear-gradient(90deg, var(--sk-line) 0 1px, transparent 1px 12px)' }}
      />
      <span className="relative">{label}</span>
    </div>
  )
}

// ── Everything else ──────────────────────────────────────────────────────────

interface ControlsProps {
  tx: Tx; regular: boolean; short: boolean; railSide: 'left' | 'right'; open: boolean; setOpen: (open: boolean) => void
  tool: SketchTool; setTool: (t: SketchTool) => void
  color: string; setColor: (c: string) => void; swatches: string[]; width: number; setWidth: (w: number) => void
  plane: SketchPlane; setPlane: (p: SketchPlane) => void; planeFacingMe: () => void; lookAtPlane: () => void
  orbit: OrbitState; setOrbit: (o: OrbitState) => void; orbitBy: (dx: number, dy: number) => void; fitAll: () => void
  doc: SketchDoc; setHistory: SetHistory; activeLayerId: string
  engine: SketchRenderer | null; fingerDraw: boolean; setFingerDraw: (on: boolean) => void; setRailSide: (s: 'left' | 'right') => void
  flash: (m: string) => void; recording: boolean; onRecord: () => void; hasContext: boolean; onContextFile: (file: File) => void; onClearContext: () => void
  onSaveView: () => SavedView | undefined
}

const TOOLS: SketchTool[] = ['pen', 'pencil', 'marker', 'line', 'eraser', 'pick']
const WIDTHS = [1.5, 3, 6, 11]

export function StudioControls(p: ControlsProps) {
  const { tx, regular, short, railSide, open, setOpen, tool, setTool, color, setColor, swatches, width, setWidth } = p

  const toolRow = TOOLS.map((name) => (
    <IconButton key={name} label={tx(`tools.${name}`)} icon={name} active={tool === name} onClick={() => setTool(name)} size={regular ? 34 : 40} />
  ))

  const inkSection = (
    <Section title={tx('color')}>
      <div className="flex items-center gap-2">
        {swatches.map((c) => (
          <button
            key={c} type="button" aria-label={c} aria-pressed={color === c} onClick={() => setColor(c)}
            className="w-8 h-8 rounded-lg border" style={{ background: c, borderColor: 'var(--sk-line)', outline: color === c ? '2px solid var(--sk-active)' : 'none', outlineOffset: 1 }}
          />
        ))}
        <label className="relative w-8 h-8 rounded-lg overflow-hidden border cursor-pointer" title={tx('customColor')} style={{ borderColor: 'var(--sk-line)', background: 'conic-gradient(#c8322b,#e0b020,#2e9e5b,#1f5fbf,#a03ab0,#c8322b)' }}>
          <input type="color" aria-label={tx('customColor')} value={color} onChange={(e) => setColor(e.target.value)} className="absolute inset-0 opacity-0" />
        </label>
      </div>
      <div className="flex items-center gap-1 mt-2" role="group" aria-label={tx('size')}>
        {WIDTHS.map((w) => (
          <button key={w} type="button" aria-label={`${tx('size')} ${w}`} aria-pressed={width === w} onClick={() => setWidth(w)} className="flex-1 h-9 grid place-items-center rounded-lg" style={{ background: width === w ? 'var(--sk-soft)' : 'transparent', outline: width === w ? '1px solid var(--sk-line)' : 'none' }}>
            <span className="rounded-full" style={{ width: Math.max(3, w * 1.3), height: Math.max(3, w * 1.3), background: 'var(--sk-text)' }} />
          </button>
        ))}
      </div>
    </Section>
  )

  const viewSection = (
    <Section title={tx('view.label')}>
      <Compass
        orbit={p.orbit} onOrbit={p.orbitBy} label={tx('view.orbitHint')}
        onPreset={(name) => p.setOrbit({ ...p.orbit, ...VIEW_ANGLES[name] })}
      />
      <div className="flex gap-1 mt-2">
        {(['top', 'front', 'right', 'iso'] as const).map((v) => (
          <Chip key={v} grow onClick={() => p.setOrbit({ ...p.orbit, ...VIEW_ANGLES[v] })}>{tx(`view.${v}`)}</Chip>
        ))}
      </div>
      <div className="flex gap-1 mt-1">
        <Chip grow active={p.orbit.mode === 'orthographic'} onClick={() => p.setOrbit({ ...p.orbit, mode: p.orbit.mode === 'perspective' ? 'orthographic' : 'perspective' })}>{tx('view.ortho')}</Chip>
        <Chip grow onClick={p.fitAll}>{tx('view.fit')}</Chip>
        <Chip grow onClick={() => { const v = p.onSaveView(); if (v) p.setHistory((h) => commit(h, addView(h.present, v))) }}>{tx('view.save')}</Chip>
      </div>
      <SavedViews {...p} />
    </Section>
  )

  const planeSection = (
    <Section title={tx('plane.label')}>
      <div className="flex gap-1">
        {(['ground', 'front', 'side'] as PlanePreset[]).map((name) => (
          <Chip key={name} grow onClick={() => p.setPlane(presetPlane(name, p.plane.origin))}>{tx(`plane.${name}`)}</Chip>
        ))}
      </div>
      <div className="flex gap-1 mt-1">
        <Chip grow onClick={p.planeFacingMe}>{tx('plane.facing')}</Chip>
        <Chip grow onClick={p.lookAtPlane}>{tx('plane.lookAt')}</Chip>
      </div>
      <div className="flex items-center gap-1 mt-1">
        <NudgeSlider label={tx('plane.move')} onDelta={(px) => p.setPlane(offsetPlane(p.plane, px * (p.engine?.worldPerPixel() ?? 0.02)))} />
      </div>
      <div className="flex items-center gap-1 mt-1" role="group" aria-label={tx('plane.rotate')}>
        <span className="text-[11px] pr-1" style={{ color: 'var(--sk-dim)' }}>{tx('plane.rotate')}</span>
        {AXES.map((a) => (
          <button
            key={a.key} type="button" onClick={() => p.setPlane(rotatePlane(p.plane, a.dir, Math.PI / 12))}
            aria-label={`${tx('plane.rotate')} ${a.key.toUpperCase()} 15°`} title={`${a.key.toUpperCase()} +15°`}
            className="flex-1 h-9 rounded-lg text-[12px] font-semibold" style={{ background: 'var(--sk-soft)', color: a.color }}
          >{a.key.toUpperCase()}</button>
        ))}
      </div>
    </Section>
  )

  const layersSection = <LayersSection {...p} />
  const moreSection = <MoreSection {...p} />

  if (regular) {
    return (
      <aside
        aria-label={tx('tools.label')}
        className="absolute z-10 w-[252px] rounded-xl border overflow-y-auto overscroll-contain"
        style={{ ...glass, top: 'calc(max(8px, env(safe-area-inset-top)) + 48px)', bottom: 'max(10px, env(safe-area-inset-bottom))', [railSide]: 8, touchAction: 'pan-y' }}
      >
        <div className="flex items-center justify-between px-2 py-1.5 border-b" style={{ borderColor: 'var(--sk-line)' }}>{toolRow}</div>
        {inkSection}{planeSection}{viewSection}{layersSection}{moreSection}
      </aside>
    )
  }

  return (
    <>
      {open && (
        <div
          className="absolute z-20 left-2 right-2 rounded-xl border overflow-y-auto overscroll-contain"
          style={{ ...glass, bottom: 'calc(max(8px, env(safe-area-inset-bottom)) + 52px)', maxHeight: short ? 'calc(100% - 116px)' : '62%', touchAction: 'pan-y' }}
        >
          {inkSection}{planeSection}{viewSection}{layersSection}{moreSection}
        </div>
      )}
      <div className="absolute z-20 left-2 right-2 h-12 px-1 rounded-xl border flex items-center justify-between overflow-x-auto" style={{ ...glass, bottom: 'max(8px, env(safe-area-inset-bottom))', touchAction: 'pan-x' }}>
        {toolRow}
        <button type="button" aria-label={tx('color')} onClick={() => setOpen(!open)} className="shrink-0 w-10 h-10 grid place-items-center">
          <span className="w-6 h-6 rounded-full border" style={{ background: color, borderColor: 'var(--sk-line)' }} />
        </button>
        <IconButton label={tx('more')} icon="more" active={open} onClick={() => setOpen(!open)} />
      </div>
    </>
  )
}

function SavedViews({ tx, doc, engine, setOrbit, setPlane, setHistory }: ControlsProps) {
  const views = activePage(doc).views
  if (views.length === 0) return null
  return (
    <div className="flex gap-1 mt-2 overflow-x-auto" aria-label={tx('view.views')} style={{ touchAction: 'pan-x' }}>
      {views.map((v) => (
        <div key={v.id} className="relative shrink-0">
          <button type="button" onClick={() => { setOrbit(v.orbit); setPlane(v.plane); engine?.invalidate() }} className="block w-14 h-10 rounded-md overflow-hidden border" style={{ borderColor: 'var(--sk-line)' }}>
            <img src={v.thumb} alt="" className="w-full h-full object-cover" draggable={false} />
          </button>
          <button type="button" aria-label={tx('view.remove')} onClick={() => setHistory((h) => commit(h, removeView(h.present, v.id)))} className="absolute -top-1 -right-1 w-5 h-5 rounded-full text-[11px] leading-none" style={{ background: 'var(--sk-active)', color: 'var(--sk-on-active)' }}>×</button>
        </div>
      ))}
    </div>
  )
}

function LayersSection({ tx, doc, setHistory, activeLayerId }: ControlsProps) {
  const layers = activePage(doc).layers
  return (
    <Section title={tx('layers.label')}>
      <ul className="flex flex-col-reverse gap-0.5">
        {layers.map((l, i) => (
          <li key={l.id} className="flex items-center rounded-lg" style={{ background: l.id === activeLayerId ? 'var(--sk-soft)' : 'transparent' }}>
            <button type="button" aria-current={l.id === activeLayerId} onClick={() => setHistory((h) => ({ ...h, present: setActiveLayer(h.present, l.id) }))} className="flex-1 min-w-0 h-9 px-2 text-left text-[12px] truncate">
              {tx('layers.name', { n: i + 1 })} <span style={{ color: 'var(--sk-dim)' }}>· {l.strokes.length}</span>
            </button>
            <IconButton size={34} label={tx(l.visible ? 'layers.hide' : 'layers.show')} icon={l.visible ? 'eye' : 'eyeOff'} onClick={() => setHistory((h) => commit(h, patchLayer(h.present, l.id, { visible: !l.visible })))} />
            <IconButton size={34} label={tx(l.locked ? 'layers.unlock' : 'layers.lock')} icon={l.locked ? 'lock' : 'unlock'} onClick={() => setHistory((h) => commit(h, patchLayer(h.present, l.id, { locked: !l.locked })))} />
            {layers.length > 1 && <IconButton size={34} label={tx('layers.delete')} icon="trash" onClick={() => setHistory((h) => commit(h, deleteLayer(h.present, l.id)))} />}
          </li>
        ))}
      </ul>
      <div className="flex gap-1 mt-1">
        <Chip grow onClick={() => setHistory((h) => commit(h, addLayer(h.present, String(activePage(h.present).layers.length + 1))))}>{tx('layers.add')}</Chip>
        <Chip grow onClick={() => setHistory((h) => commit(h, clearLayer(h.present)))}>{tx('clear')}</Chip>
      </div>
    </Section>
  )
}

function MoreSection(p: ControlsProps) {
  const { tx, doc, engine, setHistory, flash, recording, onRecord, regular, railSide, setRailSide, fingerDraw, setFingerDraw, hasContext, onContextFile, onClearContext } = p
  const fileRef = useRef<HTMLInputElement>(null)
  const glbRef = useRef<HTMLInputElement>(null)

  const exportPng = async () => {
    const blob = await engine?.toBlob()
    if (blob) downloadBlob(blob, 'sketch.png')
  }
  const exportVector = () => {
    if (!engine) return
    const c = engine.canvas
    const svg = exportSvg(activePage(doc).layers, c.clientWidth, c.clientHeight, PAPER[doc.paper].bg, (pt) => engine.project(pt))
    downloadBlob(new Blob([svg], { type: 'image/svg+xml' }), 'sketch.svg')
  }
  return (
    <>
      {!regular && (
        <Section title={tx('pages.label')}>
          <div className="flex items-center gap-1 overflow-x-auto" style={{ touchAction: 'pan-x' }}>
            {doc.pages.map((pg, i) => (
              <Chip key={pg.id} active={pg.id === doc.activePageId} onClick={() => setHistory((h) => ({ ...h, present: setActivePage(h.present, pg.id) }))}>{i + 1}</Chip>
            ))}
            <IconButton size={36} label={tx('pages.add')} icon="plus" onClick={() => setHistory((h) => commit(h, addPage(h.present)))} />
          </div>
        </Section>
      )}
      <Section title={tx('paper.label')}>
        <div className="flex gap-1">
          {(['warm', 'white', 'night'] as PaperKind[]).map((name) => (
            <Chip key={name} grow active={doc.paper === name} onClick={() => setHistory((h) => commit(h, setPaper(h.present, name)))}>{tx(`paper.${name}`)}</Chip>
          ))}
        </div>
        {regular && (
          <div className="flex items-center gap-1 mt-2">
            <span className="text-[11px] flex-1" style={{ color: 'var(--sk-dim)' }}>{tx('side.label')}</span>
            <Chip active={railSide === 'left'} onClick={() => setRailSide('left')}>{tx('side.left')}</Chip>
            <Chip active={railSide === 'right'} onClick={() => setRailSide('right')}>{tx('side.right')}</Chip>
          </div>
        )}
        <label className="flex items-center justify-between gap-2 mt-2 h-8 text-[12px]">
          {tx('fingerDraw')}
          <input type="checkbox" checked={fingerDraw} onChange={(e) => setFingerDraw(e.target.checked)} className="w-5 h-5" />
        </label>
      </Section>
      <Section title={tx('export.label')}>
        <div className="grid grid-cols-2 gap-1">
          <Chip onClick={() => { void exportPng() }}>{tx('export.png')}</Chip>
          <Chip onClick={exportVector}>{tx('export.svg')}</Chip>
          <Chip active={recording} onClick={onRecord}>{tx('export.video')}</Chip>
          <Chip onClick={() => downloadBlob(new Blob([serializeDoc(doc)], { type: 'application/json' }), 'drawing.sketch.json')}>{tx('export.file')}</Chip>
          <Chip onClick={() => fileRef.current?.click()}>{tx('export.open')}</Chip>
          {hasContext
            ? <Chip onClick={onClearContext}>{tx('context.clear')}</Chip>
            : <Chip onClick={() => glbRef.current?.click()}>{tx('context.load')}</Chip>}
        </div>
        <input
          ref={fileRef} type="file" accept=".json,application/json" hidden
          onChange={async (e) => {
            const file = e.target.files?.[0]
            e.target.value = ''
            if (!file) return
            const next = parseDoc(await file.text())
            if (next) setHistory(startHistory(next))
            else flash(tx('export.badFile'))
          }}
        />
        <input
          ref={glbRef} type="file" accept=".glb,model/gltf-binary" hidden
          onChange={(e) => {
            const file = e.target.files?.[0]
            e.target.value = ''
            if (file) onContextFile(file)
          }}
        />
      </Section>
    </>
  )
}
