// ─── /sketch ──────────────────────────────────────────────────────────────────
// Draw in 3D with a pen on a phone, tablet or drawing display. This file only
// composes: state is in stores/sketchStore, behaviour in hooks/sketch, maths in
// lib/sketch. docs/SKETCH_STUDIO.md.

import { useCallback, useEffect, useRef, useState, type CSSProperties } from 'react'
import { useTranslation } from 'react-i18next'
import { isEdgeOn } from '../../lib/sketch/plane'
import { PAPER } from '../../lib/sketch/renderer'
import { planeFacingMe, zoomBy } from '../../hooks/sketch/actions'
import { useSketchEngine } from '../../hooks/sketch/useSketchEngine'
import { useSketchInput } from '../../hooks/sketch/useSketchInput'
import { useSketchPersistence } from '../../hooks/sketch/useSketchPersistence'
import { useStudioLayout } from '../../hooks/sketch/useStudioLayout'
import { useSketchStore } from '../../stores/sketchStore'
import { ErrorBoundary } from '../ErrorBoundary'
import ReferencePane from './ReferencePane'
import ReferenceWindow from './ReferenceWindow'
import { PageStrip, SelectionBar, StudioControls, TopBar } from './SketchPanels'

export type Tx = (key: string, o?: Record<string, unknown>) => string

const CHROME_LIGHT = { '--sk-panel': 'rgba(250,246,242,.92)', '--sk-line': 'rgba(50,35,25,.14)', '--sk-text': '#241C16', '--sk-dim': '#6D5F55', '--sk-active': '#241C16', '--sk-on-active': '#FAF6F2', '--sk-soft': 'rgba(50,35,25,.07)' }
const CHROME_NIGHT = { '--sk-panel': 'rgba(24,25,32,.92)', '--sk-line': 'rgba(255,255,255,.1)', '--sk-text': '#ECEBE7', '--sk-dim': '#9A9CA8', '--sk-active': '#ECEBE7', '--sk-on-active': '#21201D', '--sk-soft': 'rgba(255,255,255,.08)' }

export default function SketchStudio() {
  const { t } = useTranslation('sketch' as never)
  const tx = t as unknown as Tx
  const windowMode = new URLSearchParams(location.search).get('pane') === 'refs'
  return <ErrorBoundary>{windowMode ? <ReferenceWindow tx={tx} /> : <Studio tx={tx} />}</ErrorBoundary>
}

function Studio({ tx }: { tx: Tx }) {
  const rootRef = useRef<HTMLDivElement>(null)
  const boxRef = useRef<HTMLDivElement>(null)
  const canvasRef = useRef<HTMLCanvasElement>(null)
  const ringRef = useRef<HTMLDivElement>(null)
  const lassoRef = useRef<SVGPolylineElement>(null)
  const [webglFailed, setWebglFailed] = useState(false)
  const onFailed = useCallback(() => setWebglFailed(true), [])

  // Read once and taken off the URL: a reload must not wait for a viewer long gone.
  const [handoff] = useState<'none' | 'waiting' | 'ready'>(() => {
    const q = new URLSearchParams(location.search)
    return !q.has('from-viewer') ? 'none' : q.has('ready') ? 'ready' : 'waiting'
  })
  useEffect(() => {
    if (handoff !== 'none') window.history.replaceState(null, '', location.pathname)
    document.title = 'Sketch in 3D on your phone or tablet, free in the browser'
  }, [handoff])

  const railSide = useSketchStore((s) => s.railSide)
  const refsOpen = useSketchStore((s) => s.refsOpen)
  const paper = useSketchStore((s) => s.history.present.paper)
  const drawing = useSketchStore((s) => s.drawing)
  const uiHidden = useSketchStore((s) => s.uiHidden)
  const { width, height, layout, hardware } = useStudioLayout(rootRef, railSide === 'right')

  useSketchEngine(canvasRef, boxRef, onFailed)
  useSketchPersistence(handoff, tx as (key: string) => string)
  const input = useSketchInput(boxRef, ringRef, lassoRef, tx as (key: string) => string)

  // Safari's page pinch ignores touch-action in places; the drawing surface owns gestures.
  useEffect(() => {
    const root = rootRef.current
    const stop = (e: Event) => e.preventDefault()
    root?.addEventListener('gesturestart', stop)
    return () => root?.removeEventListener('gesturestart', stop)
  }, [])

  useEffect(() => {
    const box = boxRef.current
    if (!box) return
    const onWheel = (e: WheelEvent) => {
      e.preventDefault()
      const r = box.getBoundingClientRect()
      zoomBy(Math.exp(-e.deltaY * 0.0012), e.clientX - r.left, e.clientY - r.top, box.clientWidth, box.clientHeight)
    }
    box.addEventListener('wheel', onWheel, { passive: false })
    return () => box.removeEventListener('wheel', onWheel)
  }, [])

  if (webglFailed) return <div className="absolute inset-0 grid place-items-center p-6 text-center bg-[var(--bg)] text-[var(--text)]">{tx('webgl')}</div>

  const regular = layout.density === 'regular'
  const docked = refsOpen && layout.paneMode !== 'floating'
  const side = layout.paneMode === 'docked-side'
  const paneSize = side
    ? (hardware ? hardware.pane.width : Math.round(width * layout.paneShare))
    : (hardware ? hardware.pane.height : Math.round(height * layout.paneShare))
  const hinge = hardware ? (side ? hardware.hinge.width : hardware.hinge.height) : 0
  const paneFirst = hardware ? (side ? hardware.pane.x < hardware.viewer.x : hardware.pane.y < hardware.viewer.y) : railSide === 'right' && side
  const paneStyle: CSSProperties = {
    flex: `0 0 ${paneSize}px`, order: paneFirst ? 0 : 2,
    [side ? (paneFirst ? 'marginRight' : 'marginLeft') : (paneFirst ? 'marginBottom' : 'marginTop')]: hinge,
    [side ? (paneFirst ? 'borderRight' : 'borderLeft') : (paneFirst ? 'borderBottom' : 'borderTop')]: '1px solid var(--sk-line)',
  }
  const rootStyle = {
    ...(paper === 'night' ? CHROME_NIGHT : CHROME_LIGHT),
    background: PAPER[paper].bg, color: 'var(--sk-text)', touchAction: 'none',
    WebkitTouchCallout: 'none', WebkitUserSelect: 'none', userSelect: 'none', flexDirection: side ? 'row' : 'column',
  } as CSSProperties
  // The tools step back while the pen is down: the drawing is what matters then.
  const chrome: CSSProperties = { opacity: drawing ? 0.18 : 1, pointerEvents: drawing ? 'none' : undefined, transition: 'opacity .18s' }

  return (
    <div ref={rootRef} data-sketch-density={layout.density} data-sketch-pane={layout.paneMode} className="absolute inset-0 overflow-hidden flex" style={rootStyle}>
      <div className="relative flex-1 min-w-0 min-h-0 order-1">
        <div
          ref={boxRef} className="absolute inset-0 overflow-hidden" role="application" aria-label={tx('title')}
          style={{ touchAction: 'none', cursor: 'crosshair' }}
          {...input}
          onContextMenu={(e) => e.preventDefault()}
        >
          <canvas ref={canvasRef} className="w-full h-full block" />
          <div ref={ringRef} className="absolute left-0 top-0 rounded-full pointer-events-none" style={{ opacity: 0, border: '1px solid #888' }} />
          <svg className="absolute inset-0 w-full h-full pointer-events-none" aria-hidden>
            <polyline ref={lassoRef} fill="rgba(47,123,255,.08)" stroke="#2F7BFF" strokeWidth="1.5" strokeDasharray="5 4" />
          </svg>
        </div>
        {!uiHidden && (
          <div style={chrome}>
            <TopBar tx={tx} compact={!regular} />
            <StudioControls tx={tx} regular={regular} short={layout.short} />
            {regular && !layout.short && <PageStrip tx={tx} />}
            <SelectionBar tx={tx} regular={regular} />
          </div>
        )}
        {uiHidden && (
          <button
            type="button" aria-label={tx('ui.show')} title={tx('ui.show')} onClick={() => useSketchStore.getState().set({ uiHidden: false })}
            className="absolute right-2 z-20 w-10 h-10 rounded-full opacity-40 text-[14px]" style={{ top: 'max(8px, env(safe-area-inset-top))', background: 'var(--sk-panel)' }}
          >⤢</button>
        )}
        <Notices tx={tx} regular={regular} short={layout.short} />
        {refsOpen && !docked && <FloatingWindow bounds={{ width, height }} short={layout.short}><ReferencePane tx={tx} /></FloatingWindow>}
      </div>
      {docked && <div className="min-w-0 min-h-0" style={paneStyle}><ReferencePane tx={tx} /></div>}
    </div>
  )
}

const pill: CSSProperties = { background: 'var(--sk-panel)', borderColor: 'var(--sk-line)' }

/** Messages over the drawing. Its own component: they change while nothing else does. */
function Notices({ tx, regular, short }: { tx: Tx; regular: boolean; short: boolean }) {
  const notice = useSketchStore((s) => s.notice)
  const preparing = useSketchStore((s) => s.preparing)
  const recording = useSketchStore((s) => s.recording)
  const gpuLost = useSketchStore((s) => s.gpuLost)
  const drawing = useSketchStore((s) => s.drawing)
  const usingPen = useSketchStore((s) => s.usingPen)
  const fingerDraw = useSketchStore((s) => s.fingerDraw)
  const railSide = useSketchStore((s) => s.railSide)
  const railOpen = useSketchStore((s) => s.railOpen)
  const edgeOn = useSketchStore((s) => !!s.engine && isEdgeOn(s.plane, s.engine.viewDirection()))
  const inset = regular && railOpen ? 260 : 0
  const line = 'px-3 py-2 rounded-lg text-[12px] border max-w-[90%] text-center'
  return (
    <div className="absolute pointer-events-none flex flex-col items-center gap-2" style={{ left: railSide === 'left' ? inset : 0, right: railSide === 'right' ? inset : 0, bottom: regular ? (short ? 12 : 84) : 72 }}>
      {edgeOn && !drawing && (
        <div className="pointer-events-auto flex items-center gap-2 pl-3 pr-1 h-10 rounded-full text-[12px] border" style={pill}>
          {tx('plane.edgeOn')}
          <button onClick={planeFacingMe} className="h-8 px-3 rounded-full text-[12px] font-medium" style={{ background: 'var(--sk-active)', color: 'var(--sk-on-active)' }}>{tx('plane.fix')}</button>
        </div>
      )}
      {gpuLost && <div role="alert" className={line} style={pill}>{tx('gpuLost')}</div>}
      {notice && <div role="status" className={line} style={pill}>{notice}</div>}
      {preparing && <div role="status" className={line} style={pill}>{tx('context.preparing')}</div>}
      {recording && <div role="status" className={line} style={pill}>{tx('export.recording')}</div>}
      {!notice && !edgeOn && !recording && !preparing && !drawing && regular && (
        <div className="px-3 h-7 rounded-full flex items-center gap-2 text-[11px]" style={{ background: 'var(--sk-panel)', color: 'var(--sk-dim)' }}>
          <span>{tx(usingPen ? 'status.pen' : fingerDraw ? 'status.finger' : 'status.fingerOff')}</span>
          <span aria-hidden>·</span><span>{tx('status.orbit')}</span>
          <span aria-hidden>·</span><span>{tx('status.pan')}</span>
        </div>
      )}
    </div>
  )
}

/** The references as a window you can move, for when there is no room to dock. */
function FloatingWindow({ bounds, short, children }: { bounds: { width: number; height: number }; short: boolean; children: React.ReactNode }) {
  const width = Math.min(300, bounds.width - 24)
  const height = Math.min(short ? bounds.height - 24 : 400, bounds.height - 120)
  const [pos, setPos] = useState({ x: Math.max(12, bounds.width - width - 12), y: 60 })
  const drag = useRef<{ dx: number; dy: number } | null>(null)
  // The space can shrink under it: a fold must not leave the window out of reach.
  const x = Math.max(0, Math.min(pos.x, bounds.width - width))
  const y = Math.max(0, Math.min(pos.y, bounds.height - height))
  return (
    <div className="absolute z-30 rounded-xl overflow-hidden border shadow-xl flex flex-col" style={{ left: x, top: y, width, height, borderColor: 'var(--sk-line)', background: 'var(--sk-panel)' }}>
      <div
        className="h-6 shrink-0 grid place-items-center cursor-grab" style={{ touchAction: 'none' }}
        onPointerDown={(e) => { e.currentTarget.setPointerCapture(e.pointerId); drag.current = { dx: e.clientX - x, dy: e.clientY - y } }}
        onPointerMove={(e) => { if (drag.current) setPos({ x: e.clientX - drag.current.dx, y: e.clientY - drag.current.dy }) }}
        onPointerUp={() => { drag.current = null }}
        onPointerCancel={() => { drag.current = null }}
      >
        <span className="w-10 h-1 rounded-full" style={{ background: 'var(--sk-line)' }} />
      </div>
      <div className="flex-1 min-h-0">{children}</div>
    </div>
  )
}
