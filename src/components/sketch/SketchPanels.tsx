// ─── Sketch studio: the controls ──────────────────────────────────────────────
// Five tabs instead of one long panel, in two arrangements. With room: a rail on
// the side the user chose, which folds away so a tablet gets its whole screen.
// Without room: one row of tools under the thumb, the tabs in a sheet above it.

import { useRef, useState, type ReactNode } from 'react'
import {
  adoptContextFile, applyOrbit, clearContext, clearSelection, deleteSelection, duplicateSelection, rotateSelection, saveBrush, scaleSelection, applyBrush, exportBlender, exportObjFile, exportPng, exportPsd, exportSketchFile, exportVector,
  fitAll, lookAtPlane, orbitBy, planeFacingMe, setPlane, setPlanePreset, shareSketch, toggleContext,
} from '../../hooks/sketch/actions'
import { useReplayRecorder } from '../../hooks/sketch/useReplayRecorder'
import {
  activeLayer, activePage, addLayer, addPage, addView, clearLayer, deleteLayer, deletePage, duplicateLayer, mergeLayerDown, moveLayer, newId, parseDoc, patchLayer, removeView,
  setActiveLayer, setActivePage, setPaper, startHistory,
} from '../../lib/sketch/document'
import { BUILTIN_BRUSHES } from '../../lib/sketch/brushes'
import type { Symmetry } from '../../lib/sketch/edit'
import type { PressureCurve } from '../../lib/sketch/ink'
import { offsetPlane, rotatePlane, type PlanePreset } from '../../lib/sketch/plane'
import type { PaperKind } from '../../lib/sketch/types'
import { useSketchStore, type PanelTab, type SketchTool } from '../../stores/sketchStore'
import type { Tx } from './SketchStudio'

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
  rail: <><rect x="2.5" y="3" width="11" height="10" rx="1.5" /><path d="M6.5 3v10" /></>,
  eye: <><path d="M1.5 8S4 3.5 8 3.5 14.5 8 14.5 8 12 12.5 8 12.5 1.5 8 1.5 8z" /><circle cx="8" cy="8" r="1.8" /></>,
  eyeOff: <path d="M2 2l12 12M6.5 3.7A6.8 6.8 0 018 3.5c4 0 6.5 4.5 6.5 4.5a11 11 0 01-2 2.6M4 5.2A11 11 0 001.5 8S4 12.5 8 12.5c1 0 1.9-.3 2.7-.7" />,
  lock: <><rect x="3.5" y="7" width="9" height="6.5" rx="1" /><path d="M5.5 7V5a2.5 2.5 0 015 0v2" /></>,
  unlock: <><rect x="3.5" y="7" width="9" height="6.5" rx="1" /><path d="M5.5 7V5a2.5 2.5 0 014.8-1" /></>,
  trash: <path d="M3 4.5h10M6.5 4.5V3h3v1.5M4.5 4.5l.6 8.5h5.8l.6-8.5" />,
  plus: <path d="M8 3v10M3 8h10" />,
  back: <path d="M10 3L5 8l5 5" />,
  lasso: <path d="M8 3c3.5 0 6 1.5 6 3.500S11.5 10 8 10 2 8.5 2 6.5 4.5 3 8 3zM4.5 9.500c-1 1.5 0 3 1.5 3.5" strokeDasharray="2 1.5" />,
  picker: <path d="M10 3l3 3-1.5 1.5-3-3L10 3zM8.5 4.500L3 10v3h3l5.5-5.5" />,
  up: <path d="M8 13V3M4 7l4-4 4 4" />,
  down: <path d="M8 3v10M4 9l4 4 4-4" />,
}

function Icon({ name }: { name: string }) {
  return <svg width="16" height="16" viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.4" strokeLinecap="round" strokeLinejoin="round" aria-hidden>{ICONS[name]}</svg>
}

const glass = { background: 'var(--sk-panel)', borderColor: 'var(--sk-line)', WebkitBackdropFilter: 'blur(14px)', backdropFilter: 'blur(14px)' } as const

function IconButton({ label, icon, onClick, active, disabled, size = 40 }: { label: string; icon: string; onClick: () => void; active?: boolean; disabled?: boolean; size?: number }) {
  return (
    <button
      type="button" aria-label={label} title={label} aria-pressed={active} disabled={disabled} onClick={onClick}
      className="shrink-0 grid place-items-center rounded-lg disabled:opacity-30"
      style={{ width: size, height: size, background: active ? 'var(--sk-active)' : 'transparent', color: active ? 'var(--sk-on-active)' : 'var(--sk-text)' }}
    ><Icon name={icon} /></button>
  )
}

function Chip({ children, onClick, active, grow = true }: { children: ReactNode; onClick: () => void; active?: boolean; grow?: boolean }) {
  return (
    <button
      type="button" onClick={onClick} aria-pressed={active}
      className={`h-9 px-1.5 rounded-lg text-[11.5px] font-medium truncate ${grow ? 'flex-1 min-w-0' : 'shrink-0'}`}
      style={{ background: active ? 'var(--sk-active)' : 'var(--sk-soft)', color: active ? 'var(--sk-on-active)' : 'var(--sk-text)' }}
    >{children}</button>
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

function Slider({ label, value, min, max, step, onChange }: { label: string; value: number; min: number; max: number; step: number; onChange: (v: number) => void }) {
  return (
    <label className="flex items-center gap-2 h-9 text-[12px]">
      <span className="w-[42%] truncate">{label}</span>
      <input type="range" min={min} max={max} step={step} value={value} onChange={(e) => onChange(Number(e.target.value))} className="flex-1 min-w-0" style={{ touchAction: 'none' }} />
    </label>
  )
}

function Toggle({ label, checked, onChange }: { label: string; checked: boolean; onChange: (v: boolean) => void }) {
  return (
    <label className="flex items-center justify-between gap-2 h-9 text-[12px]">
      {label}
      <input type="checkbox" checked={checked} onChange={(e) => onChange(e.target.checked)} className="w-5 h-5" />
    </label>
  )
}

// ── Top bar ──────────────────────────────────────────────────────────────────

export function TopBar({ tx, compact }: { tx: Tx; compact: boolean }) {
  const canUndo = useSketchStore((s) => s.history.past.length > 0)
  const canRedo = useSketchStore((s) => s.history.future.length > 0)
  const refsOpen = useSketchStore((s) => s.refsOpen)
  const saveFailed = useSketchStore((s) => s.saveFailed)
  const { undo, redo, set } = useSketchStore.getState()
  return (
    <div className="absolute z-20 flex items-center gap-1 left-2 right-2" style={{ top: 'max(8px, env(safe-area-inset-top))' }}>
      <a href="/" aria-label={tx('back')} title={tx('back')} className="w-10 h-10 grid place-items-center rounded-xl border" style={glass}><Icon name="back" /></a>
      {!compact && <span className="ml-2 text-[13px] font-medium">{tx('title')}</span>}
      {saveFailed && <span role="alert" className="ml-2 px-2 h-7 flex items-center rounded-md text-[11px] truncate" style={{ background: '#C8322B', color: '#fff' }}>{tx('notSaved')}</span>}
      <div className="flex-1" />
      <div className="flex items-center rounded-xl border" style={glass}>
        <IconButton label={tx('undo')} icon="undo" onClick={undo} disabled={!canUndo} />
        <IconButton label={tx('redo')} icon="redo" onClick={redo} disabled={!canRedo} />
        <IconButton label={tx('refs.label')} icon="refs" active={refsOpen} onClick={() => set({ refsOpen: !refsOpen, sheetOpen: false })} />
      </div>
    </div>
  )
}

// ── Page strip ───────────────────────────────────────────────────────────────

export function PageStrip({ tx }: { tx: Tx }) {
  const pages = useSketchStore((s) => s.history.present.pages)
  const activeId = useSketchStore((s) => s.history.present.activePageId)
  const railSide = useSketchStore((s) => s.railSide)
  const railOpen = useSketchStore((s) => s.railOpen)
  const { edit, touch } = useSketchStore.getState()
  const inset = railOpen ? 268 : 58
  return (
    <div
      className="absolute z-10 flex items-center gap-1.5 p-1.5 rounded-xl border overflow-x-auto" aria-label={tx('pages.label')}
      style={{ ...glass, bottom: 'max(10px, env(safe-area-inset-bottom))', left: railSide === 'left' ? inset : 10, right: railSide === 'right' ? inset : 10, width: 'fit-content', maxWidth: `calc(100% - ${inset + 12}px)`, marginInline: 'auto', touchAction: 'pan-x' }}
    >
      {pages.map((p, i) => {
        const active = p.id === activeId
        return (
          <div key={p.id} className="relative shrink-0">
            <button
              type="button" onClick={() => touch((doc) => setActivePage(doc, p.id))} aria-label={tx('pages.name', { n: i + 1 })} aria-current={active}
              className="block w-14 h-10 rounded-md overflow-hidden border-2" style={{ borderColor: active ? 'var(--sk-active)' : 'var(--sk-line)', background: 'var(--sk-soft)' }}
            >{p.thumb && <img src={p.thumb} alt="" className="w-full h-full object-cover" draggable={false} />}</button>
            {active && pages.length > 1 && (
              <button
                type="button" aria-label={tx('pages.delete')} title={tx('pages.delete')} onClick={() => edit((doc) => deletePage(doc, p.id))}
                className="absolute -top-1 -right-1 w-5 h-5 grid place-items-center rounded-full text-[11px] leading-none" style={{ background: 'var(--sk-active)', color: 'var(--sk-on-active)' }}
              >×</button>
            )}
          </div>
        )
      })}
      <IconButton label={tx('pages.add')} icon="plus" onClick={() => edit(addPage)} />
    </div>
  )
}

// ── Compass ──────────────────────────────────────────────────────────────────

const AXES = [
  { key: 'x', dir: [1, 0, 0], color: '#C8322B', preset: 'right' },
  { key: 'y', dir: [0, 1, 0], color: '#2E9E5B', preset: 'top' },
  { key: 'z', dir: [0, 0, 1], color: '#1F5FBF', preset: 'front' },
] as const

const VIEW_ANGLES = {
  top: { azimuth: 0, elevation: Math.PI / 2 - 0.01 },
  front: { azimuth: 0, elevation: 0 },
  right: { azimuth: Math.PI / 2, elevation: 0 },
  iso: { azimuth: 0.62, elevation: 0.42 },
}

function Compass({ label }: { label: string }) {
  const orbit = useSketchStore((s) => s.orbit)
  const last = useRef<{ x: number; y: number; moved: number } | null>(null)
  const size = 92
  const r = 32
  const sa = Math.sin(orbit.azimuth), ca = Math.cos(orbit.azimuth), se = Math.sin(orbit.elevation), ce = Math.cos(orbit.elevation)
  const placed = AXES.map((a) => {
    const [x, y, z] = a.dir
    const depth = (x * sa + z * ca) * ce + y * se
    return { ...a, sx: size / 2 + (x * ca - z * sa) * r, sy: size / 2 - (y * ce - (x * sa + z * ca) * se) * r, depth }
  }).sort((p, q) => p.depth - q.depth)
  return (
    <div
      role="img" aria-label={label} title={label} className="relative mx-auto" style={{ width: size, height: size, touchAction: 'none', cursor: 'grab' }}
      onPointerDown={(e) => { e.currentTarget.setPointerCapture(e.pointerId); last.current = { x: e.clientX, y: e.clientY, moved: 0 } }}
      onPointerMove={(e) => {
        if (!last.current) return
        const dx = e.clientX - last.current.x, dy = e.clientY - last.current.y
        last.current = { x: e.clientX, y: e.clientY, moved: last.current.moved + Math.abs(dx) + Math.abs(dy) }
        orbitBy(dx * 1.6, dy * 1.6)
      }}
      onPointerUp={(e) => {
        const s = last.current
        last.current = null
        if (!s || s.moved > 6) return
        const box = e.currentTarget.getBoundingClientRect()
        const near = placed.slice().reverse().find((p) => Math.hypot(p.sx - (e.clientX - box.left), p.sy - (e.clientY - box.top)) < 16)
        if (near) applyOrbit({ ...orbit, ...VIEW_ANGLES[near.preset] })
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

/** Drag sideways to slide the plane along its normal. Has no end to run out of. */
function NudgeSlider({ label, onDelta }: { label: string; onDelta: (pixels: number) => void }) {
  const last = useRef<number | null>(null)
  const [offset, setOffset] = useState(0)
  return (
    <div
      role="slider" aria-label={label} aria-valuenow={0} tabIndex={0}
      className="relative flex-1 h-9 rounded-lg overflow-hidden select-none flex items-center justify-center text-[12px]" style={{ background: 'var(--sk-soft)', touchAction: 'none', cursor: 'ew-resize' }}
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
      <span className="absolute inset-y-0 w-[200%]" style={{ left: '-50%', transform: `translateX(${offset % 12}px)`, backgroundImage: 'repeating-linear-gradient(90deg, var(--sk-line) 0 1px, transparent 1px 12px)' }} />
      <span className="relative">{label}</span>
    </div>
  )
}

// ── Tabs ─────────────────────────────────────────────────────────────────────

const SWATCHES = ['#17130F', '#FFFFFF', '#C8322B', '#1F5FBF']
const WIDTHS = [1.5, 3, 6, 11]

function BrushSection({ tx }: { tx: Tx }) {
  const brushes = useSketchStore((s) => s.brushes)
  const { setPrefs } = useSketchStore.getState()
  return (
    <Section title={tx('brushes.label')}>
      <div className="grid grid-cols-2 gap-1">
        {BUILTIN_BRUSHES.map((b) => <Chip key={b.id} onClick={() => applyBrush(b)}>{tx(`brushes.${b.id}`)}</Chip>)}
        {brushes.map((b) => (
          <div key={b.id} className="flex items-center gap-0.5 min-w-0">
            <Chip onClick={() => applyBrush(b)}>{b.name}</Chip>
            <IconButton size={28} label={tx('brushes.delete')} icon="trash" onClick={() => setPrefs({ brushes: brushes.filter((o) => o.id !== b.id) })} />
          </div>
        ))}
        <Chip onClick={() => saveBrush(tx('brushes.mine', { n: brushes.length + 1 }))}>{tx('brushes.save')}</Chip>
      </div>
    </Section>
  )
}

function InkTab({ tx }: { tx: Tx }) {
  const opacity = useSketchStore((s) => s.opacity)
  const recent = useSketchStore((s) => s.recent)
  const colorB = useSketchStore((s) => s.colorB)
  const symmetry = useSketchStore((s) => s.symmetry)
  const eraser = useSketchStore((s) => s.eraser)
  const color = useSketchStore((s) => s.color)
  const width = useSketchStore((s) => s.width)
  const ink = useSketchStore((s) => s.ink)
  const snapEnds = useSketchStore((s) => s.snapEnds)
  const fingerDraw = useSketchStore((s) => s.fingerDraw)
  const pen = useSketchStore((s) => s.pen)
  const { setPrefs, setInk } = useSketchStore.getState()
  return (
    <>
      <BrushSection tx={tx} />
      <Section title={tx('color')}>
        <div className="flex items-center gap-2">
          {SWATCHES.map((c) => (
            <button key={c} type="button" aria-label={c} aria-pressed={color === c} onClick={() => setPrefs({ color: c })} className="w-8 h-8 rounded-lg border" style={{ background: c, borderColor: 'var(--sk-line)', outline: color === c ? '2px solid var(--sk-active)' : 'none', outlineOffset: 1 }} />
          ))}
          <label className="relative w-8 h-8 rounded-lg overflow-hidden border cursor-pointer" title={tx('customColor')} style={{ borderColor: 'var(--sk-line)', background: 'conic-gradient(#c8322b,#e0b020,#2e9e5b,#1f5fbf,#a03ab0,#c8322b)' }}>
            <input type="color" aria-label={tx('customColor')} value={color} onChange={(e) => setPrefs({ color: e.target.value })} className="absolute inset-0 opacity-0" />
          </label>
          <button type="button" aria-label={tx('swapColors')} title={tx('swapColors')} onClick={() => setPrefs({ color: colorB, colorB: color })} className="relative w-8 h-8 shrink-0">
            <span className="absolute right-0 bottom-0 w-5 h-5 rounded border" style={{ background: colorB, borderColor: 'var(--sk-line)' }} />
            <span className="absolute left-0 top-0 w-5 h-5 rounded border" style={{ background: color, borderColor: 'var(--sk-line)' }} />
          </button>
        </div>
        {recent.length > 0 && (
          <div className="flex gap-1 mt-2" role="group" aria-label={tx('recentColors')}>
            {recent.map((c) => <button key={c} type="button" aria-label={c} onClick={() => setPrefs({ color: c })} className="w-5 h-5 rounded border" style={{ background: c, borderColor: 'var(--sk-line)' }} />)}
          </div>
        )}
        <div className="flex items-center gap-1 mt-2" role="group" aria-label={tx('size')}>
          {WIDTHS.map((w) => (
            <button key={w} type="button" aria-label={`${tx('size')} ${w}`} aria-pressed={width === w} onClick={() => setPrefs({ width: w })} className="flex-1 h-9 grid place-items-center rounded-lg" style={{ background: width === w ? 'var(--sk-soft)' : 'transparent', outline: width === w ? '1px solid var(--sk-line)' : 'none' }}>
              <span className="rounded-full" style={{ width: Math.max(3, w * 1.3), height: Math.max(3, w * 1.3), background: 'var(--sk-text)' }} />
            </button>
          ))}
        </div>
      </Section>
      <Section title={tx('ink.label')}>
        <Slider label={tx('ink.opacity')} value={opacity} min={0.05} max={1} step={0.05} onChange={(v) => setPrefs({ opacity: v })} />
        <Slider label={tx('ink.stabilizer')} value={ink.stabilizer} min={0} max={10} step={1} onChange={(v) => setInk({ stabilizer: v })} />
        <Slider label={tx('ink.entry')} value={ink.entryTaper} min={0} max={1} step={0.05} onChange={(v) => setInk({ entryTaper: v })} />
        <Slider label={tx('ink.exit')} value={ink.exitTaper} min={0} max={1} step={0.05} onChange={(v) => setInk({ exitTaper: v })} />
        <Toggle label={tx('ink.snap')} checked={snapEnds} onChange={(v) => setPrefs({ snapEnds: v })} />
      </Section>
      <Section title={tx('symmetry.label')}>
        <div className="grid grid-cols-2 gap-1">
          {(['off', 'vertical', 'horizontal', 'both'] as Symmetry[]).map((v) => <Chip key={v} active={symmetry === v} onClick={() => setPrefs({ symmetry: v })}>{tx(`symmetry.${v}`)}</Chip>)}
        </div>
      </Section>
      <Section title={tx('eraser.label')}>
        <div className="flex gap-1">
          <Chip active={eraser === 'part'} onClick={() => setPrefs({ eraser: 'part' })}>{tx('eraser.part')}</Chip>
          <Chip active={eraser === 'stroke'} onClick={() => setPrefs({ eraser: 'stroke' })}>{tx('eraser.stroke')}</Chip>
        </div>
      </Section>
      <Section title={tx('pen.label')}>
        <div className="flex gap-1" role="group" aria-label={tx('pen.curve')}>
          {(['soft', 'normal', 'firm'] as PressureCurve[]).map((c) => <Chip key={c} active={ink.curve === c} onClick={() => setInk({ curve: c })}>{tx(`pen.${c}`)}</Chip>)}
        </div>
        <p className="mt-2 min-h-8 text-[11px] leading-4" style={{ color: 'var(--sk-dim)' }} role="status">
          {!pen ? tx('pen.try') : pen.kind !== 'pen' ? tx('pen.noPen') : pen.hasPressure ? tx('pen.reading', { pressure: Math.round(pen.pressure * 100), tilt: Math.round(pen.tilt * 90) }) : tx('pen.noPressure')}
        </p>
        <Toggle label={tx('fingerDraw')} checked={fingerDraw} onChange={(v) => setPrefs({ fingerDraw: v })} />
      </Section>
    </>
  )
}

function PlaneTab({ tx }: { tx: Tx }) {
  const plane = useSketchStore((s) => s.plane)
  const engine = useSketchStore((s) => s.engine)
  return (
    <Section title={tx('plane.label')}>
      <div className="flex gap-1">
        {(['ground', 'front', 'side'] as PlanePreset[]).map((name) => <Chip key={name} onClick={() => setPlanePreset(name)}>{tx(`plane.${name}`)}</Chip>)}
      </div>
      <div className="flex gap-1 mt-1">
        <Chip onClick={planeFacingMe}>{tx('plane.facing')}</Chip>
        <Chip onClick={lookAtPlane}>{tx('plane.lookAt')}</Chip>
      </div>
      <div className="flex items-center gap-1 mt-1"><NudgeSlider label={tx('plane.move')} onDelta={(px) => setPlane(offsetPlane(plane, px * (engine?.worldPerPixel() ?? 0.02)))} /></div>
      <div className="flex items-center gap-1 mt-1" role="group" aria-label={tx('plane.rotate')}>
        <span className="text-[11px] pr-1" style={{ color: 'var(--sk-dim)' }}>{tx('plane.rotate')}</span>
        {AXES.map((a) => (
          <button key={a.key} type="button" onClick={() => setPlane(rotatePlane(plane, a.dir, Math.PI / 12))} aria-label={`${tx('plane.rotate')} ${a.key.toUpperCase()} 15°`} title={`${a.key.toUpperCase()} +15°`} className="flex-1 h-9 rounded-lg text-[12px] font-semibold" style={{ background: 'var(--sk-soft)', color: a.color }}>{a.key.toUpperCase()}</button>
        ))}
      </div>
    </Section>
  )
}

function ViewTab({ tx }: { tx: Tx }) {
  const orbit = useSketchStore((s) => s.orbit)
  const views = useSketchStore((s) => activePage(s.history.present).views)
  const context = useSketchStore((s) => s.context)
  const { edit } = useSketchStore.getState()
  return (
    <>
      <Section title={tx('view.label')}>
        <Compass label={tx('view.orbitHint')} />
        <div className="flex gap-1 mt-2">{(['top', 'front', 'right', 'iso'] as const).map((v) => <Chip key={v} onClick={() => applyOrbit({ ...orbit, ...VIEW_ANGLES[v] })}>{tx(`view.${v}`)}</Chip>)}</div>
        <div className="flex gap-1 mt-1">
          <Chip active={orbit.mode === 'orthographic'} onClick={() => applyOrbit({ ...orbit, mode: orbit.mode === 'perspective' ? 'orthographic' : 'perspective' })}>{tx('view.ortho')}</Chip>
          <Chip onClick={fitAll}>{tx('view.fit')}</Chip>
          <Chip onClick={() => {
            const { engine, plane } = useSketchStore.getState()
            if (engine) edit((doc) => addView(doc, { id: newId(), orbit: engine.orbitState, plane, thumb: engine.thumbnail(120) }))
          }}>{tx('view.save')}</Chip>
        </div>
        {views.length > 0 && (
          <div className="flex gap-1 mt-2 overflow-x-auto" aria-label={tx('view.views')} style={{ touchAction: 'pan-x' }}>
            {views.map((v) => (
              <div key={v.id} className="relative shrink-0 pt-1 pr-1">
                <button type="button" onClick={() => { applyOrbit(v.orbit); setPlane(v.plane) }} className="block w-14 h-10 rounded-md overflow-hidden border" style={{ borderColor: 'var(--sk-line)' }}><img src={v.thumb} alt="" className="w-full h-full object-cover" draggable={false} /></button>
                <button type="button" aria-label={tx('view.remove')} onClick={() => edit((doc) => removeView(doc, v.id))} className="absolute top-0 right-0 w-5 h-5 rounded-full text-[11px] leading-none" style={{ background: 'var(--sk-active)', color: 'var(--sk-on-active)' }}>×</button>
              </div>
            ))}
          </div>
        )}
      </Section>
      {context.length > 0 && (
        <Section title={tx('context.label')}>
          <ul className="flex flex-col gap-0.5">
            {context.map((c) => (
              <li key={c.id} className="flex items-center gap-1 h-9 text-[12px]">
                <span className="flex-1 min-w-0 truncate" title={c.name}>{c.name}</span>
                <span className="text-[10px]" style={{ color: 'var(--sk-dim)' }}>{tx(`context.${c.kind}`)}</span>
                <IconButton size={34} label={tx(c.visible ? 'layers.hide' : 'layers.show')} icon={c.visible ? 'eye' : 'eyeOff'} onClick={() => toggleContext(c.id)} />
              </li>
            ))}
          </ul>
        </Section>
      )}
    </>
  )
}

function LayersTab({ tx }: { tx: Tx }) {
  const layers = useSketchStore((s) => activePage(s.history.present).layers)
  const activeId = useSketchStore((s) => activePage(s.history.present).activeLayerId)
  const { edit, touch } = useSketchStore.getState()
  const active = layers.find((l) => l.id === activeId) ?? layers[0]
  return (
    <Section title={tx('layers.label')}>
      <ul className="flex flex-col-reverse gap-0.5">
        {layers.map((l, i) => (
          <li key={l.id} className="flex items-center rounded-lg" style={{ background: l.id === activeId ? 'var(--sk-soft)' : 'transparent' }}>
            <button type="button" aria-current={l.id === activeId} onClick={() => touch((doc) => setActiveLayer(doc, l.id))} className="flex-1 min-w-0 h-9 px-2 text-left text-[12px] truncate">
              {tx('layers.name', { n: i + 1 })} <span style={{ color: 'var(--sk-dim)' }}>· {l.strokes.length}</span>
            </button>
            {l.id === activeId && layers.length > 1 && (
              <>
                <IconButton size={26} label={tx('layers.up')} icon="up" onClick={() => edit((doc) => moveLayer(doc, l.id, 1))} disabled={i === layers.length - 1} />
                <IconButton size={26} label={tx('layers.down')} icon="down" onClick={() => edit((doc) => moveLayer(doc, l.id, -1))} disabled={i === 0} />
              </>
            )}
            <IconButton size={34} label={tx(l.visible ? 'layers.hide' : 'layers.show')} icon={l.visible ? 'eye' : 'eyeOff'} onClick={() => edit((doc) => patchLayer(doc, l.id, { visible: !l.visible }))} />
            <IconButton size={34} label={tx(l.locked ? 'layers.unlock' : 'layers.lock')} icon={l.locked ? 'lock' : 'unlock'} onClick={() => edit((doc) => patchLayer(doc, l.id, { locked: !l.locked }))} />
            {layers.length > 1 && <IconButton size={34} label={tx('layers.delete')} icon="trash" onClick={() => edit((doc) => deleteLayer(doc, l.id))} />}
          </li>
        ))}
      </ul>
      <Slider label={tx('ink.opacity')} value={active.opacity ?? 1} min={0} max={1} step={0.05} onChange={(v) => touch((doc) => patchLayer(doc, active.id, { opacity: v }))} />
      <div className="flex gap-1 mt-1">
        <Chip onClick={() => edit(duplicateLayer)}>{tx('layers.duplicate')}</Chip>
        <Chip onClick={() => edit(mergeLayerDown)}>{tx('layers.merge')}</Chip>
      </div>
      <div className="flex gap-1 mt-1">
        <Chip onClick={() => edit((doc) => addLayer(doc, String(activePage(doc).layers.length + 1)))}>{tx('layers.add')}</Chip>
        <Chip onClick={() => edit(clearLayer)}>{tx('clear')}</Chip>
      </div>
    </Section>
  )
}

function FileTab({ tx, regular }: { tx: Tx; regular: boolean }) {
  const paper = useSketchStore((s) => s.history.present.paper)
  const railSide = useSketchStore((s) => s.railSide)
  const hasContext = useSketchStore((s) => s.context.length > 0)
  const pages = useSketchStore((s) => s.history.present.pages)
  const activeId = useSketchStore((s) => s.history.present.activePageId)
  const recording = useSketchStore((s) => s.recording)
  const { edit, touch, setPrefs, set, flash } = useSketchStore.getState()
  const record = useReplayRecorder(tx as (key: string) => string)
  const fileRef = useRef<HTMLInputElement>(null)
  const glbRef = useRef<HTMLInputElement>(null)

  const share = async (target: 'instagram-story' | 'linkedin') => {
    const outcome = await shareSketch(target)
    if (outcome === 'saved') flash(tx(target === 'linkedin' ? 'share.savedLinkedin' : 'share.savedInstagram'))
  }

  return (
    <>
      <Section title={tx('share.label')}>
        <div className="grid grid-cols-2 gap-1">
          <Chip onClick={() => { void share('instagram-story') }}>{tx('share.instagram')}</Chip>
          <Chip onClick={() => { void share('linkedin') }}>{tx('share.linkedin')}</Chip>
        </div>
      </Section>
      <Section title={tx('export.toApps')}>
        <div className="grid grid-cols-2 gap-1">
          <Chip onClick={() => exportPsd((i) => tx('layers.name', { n: i + 1 }))}>{tx('export.psd')}</Chip>
          <Chip onClick={exportBlender}>{tx('export.blender')}</Chip>
          <Chip onClick={exportObjFile}>{tx('export.obj')}</Chip>
          <Chip onClick={exportVector}>{tx('export.svg')}</Chip>
        </div>
        <p className="mt-2 text-[11px] leading-4" style={{ color: 'var(--sk-dim)' }}>{tx('export.psdHint')}</p>
      </Section>
      <Section title={tx('export.label')}>
        <div className="grid grid-cols-2 gap-1">
          <Chip onClick={() => { void exportPng(false) }}>{tx('export.png')}</Chip>
          <Chip onClick={() => { void exportPng(true) }}>{tx('export.pngClear')}</Chip>
          <Chip active={recording} onClick={() => { void record() }}>{tx('export.video')}</Chip>
          <Chip onClick={exportSketchFile}>{tx('export.file')}</Chip>
          <Chip onClick={() => fileRef.current?.click()}>{tx('export.open')}</Chip>
          {hasContext ? <Chip onClick={clearContext}>{tx('context.clear')}</Chip> : <Chip onClick={() => glbRef.current?.click()}>{tx('context.load')}</Chip>}
        </div>
        <input
          ref={fileRef} type="file" accept=".json,application/json" hidden
          onChange={async (e) => {
            const file = e.target.files?.[0]
            e.target.value = ''
            if (!file) return
            const next = parseDoc(await file.text())
            if (next) set({ history: startHistory(next) })
            else flash(tx('export.badFile'))
          }}
        />
        <input ref={glbRef} type="file" accept=".glb,model/gltf-binary" hidden onChange={(e) => {
          const file = e.target.files?.[0]
          e.target.value = ''
          if (file) void adoptContextFile(file, tx as (key: string) => string)
        }} />
      </Section>
      <Section title={tx('keys.label')}>
        <dl className="grid grid-cols-[auto_1fr] gap-x-3 gap-y-1 text-[11px]">
          {SHORTCUTS.map(([keys, label]) => (
            <div key={label} className="contents"><dt className="font-mono" style={{ color: 'var(--sk-dim)' }}>{keys}</dt><dd className="m-0">{tx(`keys.${label}`)}</dd></div>
          ))}
        </dl>
      </Section>
      {!regular && (
        <Section title={tx('pages.label')}>
          <div className="flex items-center gap-1 overflow-x-auto" style={{ touchAction: 'pan-x' }}>
            {pages.map((pg, i) => <Chip key={pg.id} grow={false} active={pg.id === activeId} onClick={() => touch((doc) => setActivePage(doc, pg.id))}>{i + 1}</Chip>)}
            <IconButton size={36} label={tx('pages.add')} icon="plus" onClick={() => edit(addPage)} />
          </div>
        </Section>
      )}
      <Section title={tx('paper.label')}>
        <div className="flex gap-1">
          {(['warm', 'white', 'night'] as PaperKind[]).map((name) => <Chip key={name} active={paper === name} onClick={() => edit((doc) => setPaper(doc, name))}>{tx(`paper.${name}`)}</Chip>)}
        </div>
        {regular && (
          <div className="flex items-center gap-1 mt-2">
            <span className="text-[11px] flex-1" style={{ color: 'var(--sk-dim)' }}>{tx('side.label')}</span>
            <Chip grow={false} active={railSide === 'left'} onClick={() => setPrefs({ railSide: 'left' })}>{tx('side.left')}</Chip>
            <Chip grow={false} active={railSide === 'right'} onClick={() => setPrefs({ railSide: 'right' })}>{tx('side.right')}</Chip>
          </div>
        )}
      </Section>
    </>
  )
}

const SHORTCUTS = [
  ['P B Y U', 'tools'], ['E', 'eraser'], ['L', 'lasso'], ['I · Alt', 'picker'], ['[ ]', 'size'], ['1–0', 'opacity'], ['X · D', 'colors'],
  ['Space', 'pan'], ['Shift+Space', 'orbit'], ['Ctrl+Space', 'zoom'], ['Shift', 'lineFrom'], ['Tab', 'hide'], ['Ctrl+Z · Y', 'undo'], ['Ctrl+D', 'deselect'],
] as const

/** What a lasso can do. Shown only while something is selected. */
export function SelectionBar({ tx, regular }: { tx: Tx; regular: boolean }) {
  const count = useSketchStore((s) => s.selection.length)
  if (count === 0) return null
  return (
    <div role="toolbar" aria-label={tx('selection.label')} className="absolute z-20 flex items-center gap-1 p-1 rounded-xl border left-1/2 -translate-x-1/2 max-w-[96%] overflow-x-auto" style={{ ...glass, top: 'calc(max(8px, env(safe-area-inset-top)) + 48px)', touchAction: 'pan-x' }}>
      <span className="px-2 text-[11px] shrink-0" style={{ color: 'var(--sk-dim)' }}>{tx('selection.count', { n: count })}</span>
      <Chip grow={false} onClick={() => scaleSelection(0.9)}>−10%</Chip>
      <Chip grow={false} onClick={() => scaleSelection(1.1)}>+10%</Chip>
      <Chip grow={false} onClick={() => rotateSelection(-Math.PI / 12)}>↺15°</Chip>
      <Chip grow={false} onClick={() => rotateSelection(Math.PI / 12)}>↻15°</Chip>
      <Chip grow={false} onClick={duplicateSelection}>{tx('selection.duplicate')}</Chip>
      <IconButton size={36} label={tx('selection.delete')} icon="trash" onClick={deleteSelection} />
      {regular && <Chip grow={false} onClick={clearSelection}>{tx('selection.done')}</Chip>}
      {!regular && <IconButton size={36} label={tx('selection.done')} icon="plus" onClick={clearSelection} />}
    </div>
  )
}

const TOOLS: SketchTool[] = ['pen', 'pencil', 'marker', 'line', 'eraser', 'lasso', 'picker', 'pick']
const TABS: PanelTab[] = ['ink', 'plane', 'view', 'layers', 'file']

function TabStrip({ tx }: { tx: Tx }) {
  const tab = useSketchStore((s) => s.tab)
  const { setPrefs } = useSketchStore.getState()
  return (
    <div role="tablist" className="flex gap-0.5 p-1 border-b shrink-0" style={{ borderColor: 'var(--sk-line)' }}>
      {TABS.map((name) => (
        <button key={name} role="tab" type="button" aria-selected={tab === name} onClick={() => setPrefs({ tab: name })} className="flex-1 min-w-0 h-8 rounded-md text-[11px] font-medium truncate" style={{ background: tab === name ? 'var(--sk-soft)' : 'transparent', color: tab === name ? 'var(--sk-text)' : 'var(--sk-dim)' }}>{tx(`tabs.${name}`)}</button>
      ))}
    </div>
  )
}

function TabBody({ tx, regular }: { tx: Tx; regular: boolean }) {
  const tab = useSketchStore((s) => s.tab)
  return (
    <div className="flex-1 min-h-0 overflow-y-auto overscroll-contain" style={{ touchAction: 'pan-y' }}>
      {tab === 'ink' && <InkTab tx={tx} />}
      {tab === 'plane' && <PlaneTab tx={tx} />}
      {tab === 'view' && <ViewTab tx={tx} />}
      {tab === 'layers' && <LayersTab tx={tx} />}
      {tab === 'file' && <FileTab tx={tx} regular={regular} />}
    </div>
  )
}

export function StudioControls({ tx, regular, short }: { tx: Tx; regular: boolean; short: boolean }) {
  const tool = useSketchStore((s) => s.tool)
  const color = useSketchStore((s) => s.color)
  const railSide = useSketchStore((s) => s.railSide)
  const railOpen = useSketchStore((s) => s.railOpen)
  const sheetOpen = useSketchStore((s) => s.sheetOpen)
  const { setPrefs, set } = useSketchStore.getState()
  const top = 'calc(max(8px, env(safe-area-inset-top)) + 48px)'
  const bottom = 'max(10px, env(safe-area-inset-bottom))'

  const toolRow = TOOLS.map((name) => (
    <IconButton key={name} label={tx(`tools.${name}`)} icon={name} active={tool === name} onClick={() => setPrefs({ tool: name })} size={regular ? 34 : 40} />
  ))

  if (regular && !railOpen) {
    return (
      <aside aria-label={tx('tools.label')} className="absolute z-10 w-[46px] rounded-xl border flex flex-col items-center gap-0.5 p-1 overflow-y-auto" style={{ ...glass, top, [railSide]: 8, maxHeight: 'calc(100% - 66px)' }}>
        <IconButton size={36} label={tx('rail.open')} icon="rail" onClick={() => setPrefs({ railOpen: true })} />
        {toolRow}
        <span className="w-6 h-6 m-1 rounded-full border shrink-0" style={{ background: color, borderColor: 'var(--sk-line)' }} />
      </aside>
    )
  }

  if (regular) {
    return (
      <aside aria-label={tx('tools.label')} className="absolute z-10 w-[252px] rounded-xl border flex flex-col overflow-hidden" style={{ ...glass, top, bottom, [railSide]: 8 }}>
        <div className="flex flex-wrap items-center gap-0.5 p-1 border-b shrink-0" style={{ borderColor: 'var(--sk-line)' }}>
          {toolRow}
          <IconButton size={34} label={tx('rail.close')} icon="rail" onClick={() => setPrefs({ railOpen: false })} />
        </div>
        <TabStrip tx={tx} />
        <TabBody tx={tx} regular />
      </aside>
    )
  }

  return (
    <>
      {sheetOpen && (
        <div className="absolute z-20 left-2 right-2 rounded-xl border flex flex-col overflow-hidden" style={{ ...glass, bottom: 'calc(max(8px, env(safe-area-inset-bottom)) + 52px)', height: short ? 'calc(100% - 116px)' : '58%' }}>
          <TabStrip tx={tx} />
          <TabBody tx={tx} regular={false} />
        </div>
      )}
      <div className="absolute z-20 left-2 right-2 h-12 px-1 rounded-xl border flex items-center justify-between overflow-x-auto" style={{ ...glass, bottom: 'max(8px, env(safe-area-inset-bottom))', touchAction: 'pan-x' }}>
        {toolRow}
        <button type="button" aria-label={tx('color')} onClick={() => { setPrefs({ tab: 'ink' }); set({ sheetOpen: !sheetOpen, refsOpen: false }) }} className="shrink-0 w-10 h-10 grid place-items-center">
          <span className="w-6 h-6 rounded-full border" style={{ background: color, borderColor: 'var(--sk-line)' }} />
        </button>
        <IconButton label={tx('more')} icon="more" active={sheetOpen} onClick={() => set({ sheetOpen: !sheetOpen, refsOpen: false })} />
      </div>
    </>
  )
}
