// ─── ToolDemo.tsx ─────────────────────────────────────────────────────────────
// The real viewer, embedded in a post, doing the thing the post is about.
//
// Nothing loads until the reader asks: a poster and one button. Then the app
// boots in an iframe on this origin, loads the demo's model(s) by URL, and —
// once every model is in — drives the tool through the same postMessage
// commands the public SDK sends (compare, video, cover, walk, measure…). The
// reader can re-run the action or take over the full viewer.

import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react'

export type ToolDemoId =
  | 'compare-versions'
  | 'video-generator'
  | 'cover-generator'
  | 'sun-study'
  | 'walk-mode'
  | 'measure'
  | 'federated-disciplines'
  | 'ifc43-bridge'

interface ToolDemoProps {
  demo: ToolDemoId
  title: string
  description: string
  poster: string
  posterAlt: string
  launchLabel?: string
  /** Label of the button that (re-)runs the tool once the model is in. */
  actionLabel?: string
  /** One line shown under the frame once it is ready — what to try next. */
  hint?: string
  height?: number
}

type Phase = 'idle' | 'loading' | 'running' | 'ready' | 'error'

const BASE = import.meta.env.BASE_URL as string

type V = { x: number; y: number; z: number }
const POBLENOU = 'models/poblenou'

type Cmd = { type: string; [k: string]: unknown }

interface DemoConfig {
  models: string[]
  ui?: 'minimal' | 'full' | 'kiosk'
  params?: Record<string, string>
  /** The SDK command run when the models are in (and by the action button). */
  command?: Cmd
  /** Further commands the action button steps through, after `command`. */
  next?: Cmd[]
  /** Swing the camera up to an oblique aerial view before running the tool. */
  aerial?: boolean
  /** Asset fields of `command` to resolve to absolute URLs. */
  assetFields?: string[]
}

const DEMOS: Record<ToolDemoId, DemoConfig> = {
  'compare-versions': {
    models: [`${POBLENOU}/p02/BCN-IVO-ZZ-XX-M3-A-0001.ifc`],
    command: {
      type: 'ifcviewer:compare',
      base: `${POBLENOU}/BCN-IVO-ZZ-XX-M3-A-0001.ifc`,
      head: `${POBLENOU}/p02/BCN-IVO-ZZ-XX-M3-A-0001.ifc`,
      baseLabel: 'P01 · 2026-08-09',
      headLabel: 'P02 · 2026-09-28',
    },
    assetFields: ['base', 'head'],
  },
  'video-generator': {
    models: ['models/torre-poblenou/BCN-IVO-ZZ-XX-M3-Z-0002.ifc'],
    params: { bg: 'studio' },
    command: { type: 'ifcviewer:create-presentation', recipe: 'reel', options: { music: 'none', title: 'Torre Poblenou' } },
  },
  'cover-generator': {
    models: ['models/torre-poblenou/BCN-IVO-ZZ-XX-M3-Z-0002.ifc'],
    command: { type: 'ifcviewer:create-cover', recipe: 'board', text: { title: 'Torre Poblenou', location: 'Barcelona' } },
  },
  'sun-study': {
    models: [`${POBLENOU}/BCN-IVO-ZZ-XX-M3-A-0001.ifc`, `${POBLENOU}/BCN-IVO-ZZ-XX-M3-S-0001.ifc`],
    aerial: true,
    command: { type: 'ifcviewer:set-solar', solar: { active: true, date: '06-21', time: '19:30' } },
    next: [
      { type: 'ifcviewer:set-solar', solar: { time: '09:00' } },
      { type: 'ifcviewer:set-solar', solar: { time: '13:00' } },
      { type: 'ifcviewer:set-solar', solar: { date: '12-21', time: '13:00' } },
      { type: 'ifcviewer:set-solar', solar: { date: '06-21', time: '19:30' } },
    ],
  },
  'walk-mode': {
    models: [`${POBLENOU}/BCN-IVO-ZZ-XX-M3-A-0001.ifc`],
    command: { type: 'ifcviewer:set-walk', enabled: true, speed: 1.4 },
  },
  measure: {
    models: [`${POBLENOU}/BCN-IVO-ZZ-XX-M3-A-0001.ifc`],
    aerial: true,
    command: { type: 'ifcviewer:set-measure-tool', tool: 'distance' },
  },
  'federated-disciplines': {
    models: [
      `${POBLENOU}/BCN-IVO-ZZ-XX-M3-A-0001.ifc`,
      `${POBLENOU}/BCN-IVO-ZZ-XX-M3-S-0001.ifc`,
      `${POBLENOU}/BCN-IVO-ZZ-XX-M3-M-0001.ifc`,
    ],
    params: { tree: '1' },
    aerial: true,
  },
  'ifc43-bridge': {
    models: ['https://raw.githubusercontent.com/buildingSMART/Sample-Test-Files/main/IFC%204.3.2.0%20(IFC%204.3%20ADD2)/Simple-Scene/Infra-Bridge.ifc'],
    params: { tree: '1' },
    aerial: true,
  },
}

function absoluteAsset(path: string): string {
  if (/^https?:\/\//i.test(path)) return path
  return new URL(`${BASE}${path.replace(/^\//, '')}`, window.location.origin).href
}

function fileNameOf(url: string): string {
  return decodeURIComponent(url.split(/[?#]/)[0].split('/').pop() || 'model.ifc')
}

export default function ToolDemo({
  demo,
  title,
  description,
  poster,
  posterAlt,
  launchLabel = 'Start live example',
  actionLabel,
  hint,
  height = 680,
}: ToolDemoProps) {
  const frameRef = useRef<HTMLIFrameElement>(null)
  const loadedRef = useRef(0)
  const requestIdRef = useRef('')
  const cameraReqRef = useRef('')
  const stepRef = useRef(0)
  const [phase, setPhase] = useState<Phase>('idle')
  const [attempt, setAttempt] = useState(0)
  const [error, setError] = useState('')
  const config = DEMOS[demo]

  const viewerUrl = useMemo(() => {
    if (typeof window === 'undefined') return '#'
    const url = new URL(BASE, window.location.origin)
    url.searchParams.set('embed', '1')
    url.searchParams.set('ui', config.ui ?? 'minimal')
    url.searchParams.set('validate', '0')
    for (const m of config.models) {
      url.searchParams.append('model', absoluteAsset(m))
      url.searchParams.append('name', fileNameOf(m))
    }
    for (const [k, v] of Object.entries(config.params ?? {})) url.searchParams.set(k, v)
    const lang = document.documentElement.lang
    if (lang) url.searchParams.set('lang', lang.slice(0, 2))
    return url.href
  }, [config])

  // Ask for the camera; its result turns it into an oblique aerial view.
  // Delayed: the viewer frames the scene once more after the last model settles.
  const swing = useCallback(() => {
    cameraReqRef.current = `tool-demo-cam-${Date.now().toString(36)}`
    window.setTimeout(() => frameRef.current?.contentWindow?.postMessage(
      { source: 'ifc-article-demo', type: 'ifcviewer:get-camera', requestId: cameraReqRef.current },
      window.location.origin,
    ), 1500)
  }, [])

  const runCommand = useCallback((step = 0) => {
    const list = config.command ? [config.command, ...(config.next ?? [])] : []
    stepRef.current = list.length ? step % list.length : 0
    const cmd = list[stepRef.current]
    if (!cmd) {
      setPhase('ready')
      if (config.aerial) swing()
      return
    }
    const payload: Record<string, unknown> = { ...cmd }
    for (const f of config.assetFields ?? []) {
      const v = payload[f]
      payload[f] = Array.isArray(v) ? v.map((x) => absoluteAsset(String(x))) : absoluteAsset(String(v))
    }
    requestIdRef.current = `tool-demo-${demo}-${Date.now().toString(36)}`
    setPhase('running')
    frameRef.current?.contentWindow?.postMessage(
      { source: 'ifc-article-demo', ...payload, requestId: requestIdRef.current },
      window.location.origin,
    )
  }, [config, demo, swing])

  // The action button: the next command in the list, or the same one again.
  const runNext = useCallback(() => runCommand(config.next?.length ? stepRef.current + 1 : 0), [config, runCommand])

  const post = useCallback((msg: Record<string, unknown>) => {
    frameRef.current?.contentWindow?.postMessage({ source: 'ifc-article-demo', ...msg }, window.location.origin)
  }, [])

  const start = useCallback(() => {
    loadedRef.current = 0
    setError('')
    setPhase('loading')
    setAttempt((n) => n + 1)
  }, [])

  useEffect(() => {
    const onMessage = (event: MessageEvent) => {
      if (event.source !== frameRef.current?.contentWindow) return
      if (event.origin !== window.location.origin) return
      const message = event.data as { source?: unknown; type?: unknown; requestId?: unknown; ok?: unknown; error?: unknown; message?: unknown } | null
      if (!message || message.source !== 'ifc-validator' || typeof message.type !== 'string') return

      if (message.type === 'model-error') {
        setError(typeof message.message === 'string' ? message.message : 'The IFC model could not be loaded.')
        setPhase('error')
        return
      }
      if (message.type === 'ready' || message.type === 'model-loaded') {
        // The viewer shares this origin's stored language with the blog, so the
        // ?lang= of the frame can lose a race with it: say it again once mounted.
        const lang = document.documentElement.lang.slice(0, 2)
        if (lang) post({ type: 'ifcviewer:set-language', lang })
        if (message.type === 'ready') return
        loadedRef.current += 1
        if (loadedRef.current === config.models.length) runCommand()
        return
      }
      if (message.type === 'result' && message.requestId === cameraReqRef.current) {
        // Same distance from the target, raised to ~35° and swung 40° round:
        // a front elevation hides every shadow on the ground.
        const cam = (message as { data?: { position?: V; target?: V } }).data
        if (cam?.position && cam.target) {
          const t = cam.target, dx = cam.position.x - t.x, dz = cam.position.z - t.z
          const d = Math.hypot(dx, cam.position.y - t.y, dz) * 1.2
          const az = Math.atan2(dz, dx) + (40 * Math.PI) / 180, el = (35 * Math.PI) / 180
          post({
            type: 'ifcviewer:look-at',
            requestId: `${cameraReqRef.current}-look`,
            position: { x: t.x + d * Math.cos(el) * Math.cos(az), y: t.y + d * Math.sin(el), z: t.z + d * Math.cos(el) * Math.sin(az) },
            target: t,
            animate: false,
          })
        }
        return
      }
      if (message.type === 'result' && message.requestId === requestIdRef.current) {
        if (message.ok === true) {
          setPhase('ready')
          // Swing the camera AFTER the tool: starting it (the sun study) reframes.
          if (config.aerial && stepRef.current === 0) swing()
        }
        else {
          setError(typeof message.error === 'string' ? message.error : 'The tool could not be started.')
          setPhase('error')
        }
      }
    }
    window.addEventListener('message', onMessage)
    return () => window.removeEventListener('message', onMessage)
  }, [config, runCommand, post, swing])

  const status = phase === 'loading' ? 'Loading IFC…'
    : phase === 'running' ? 'Running the tool…'
      : phase === 'error' ? error
        : ''

  return (
    <figure className="my-9">
      <div
        className="relative overflow-hidden rounded-2xl border border-[rgba(94,106,210,0.32)] bg-[#0d0d10]"
        style={{ minHeight: phase === 'idle' ? 390 : height }}
      >
        {phase === 'idle' ? (
          <>
            <img
              src={absoluteAsset(poster)}
              alt={posterAlt}
              width={1600}
              height={900}
              loading="lazy"
              decoding="async"
              className="absolute inset-0 h-full w-full object-cover opacity-60"
            />
            <div className="absolute inset-0 bg-gradient-to-t from-[#09090d] via-[rgba(9,9,13,0.45)] to-[rgba(9,9,13,0.12)]" />
            <div className="relative z-10 flex min-h-[390px] flex-col items-start justify-end p-5 sm:p-7">
              <span className="mb-3 rounded-full border border-[rgba(103,232,249,0.35)] bg-[rgba(6,182,212,0.12)] px-2.5 py-1 font-mono text-[10px] font-bold tracking-widest text-[#67e8f9]">LIVE · REAL VIEWER</span>
              <h3 className="mb-2 text-[20px] font-semibold tracking-tight text-white sm:text-[24px]">{title}</h3>
              <p className="mb-5 max-w-2xl text-[13px] leading-6 text-slate-200 sm:text-[14px]">{description}</p>
              <button type="button" onClick={start} className="rounded-lg bg-[#5e6ad2] px-4 py-2.5 text-[13px] font-semibold text-white transition hover:brightness-110 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[#67e8f9]">
                {launchLabel}
              </button>
            </div>
          </>
        ) : (
          <>
            <iframe
              key={attempt}
              ref={frameRef}
              src={viewerUrl}
              title={title}
              allow="fullscreen; autoplay"
              className="absolute inset-0 h-full w-full border-0"
            />
            {(phase === 'loading' || phase === 'running') && (
              <div className="absolute inset-x-0 top-0 z-10 flex items-center gap-2 bg-[rgba(9,9,13,0.82)] px-4 py-2.5 text-[11px] text-slate-200 backdrop-blur" role="status" aria-live="polite">
                <span className="h-2 w-2 animate-pulse rounded-full bg-[#67e8f9]" />
                {status}
              </div>
            )}
            {phase === 'error' && (
              <div className="absolute inset-0 z-20 flex flex-col items-center justify-center gap-3 bg-[rgba(9,9,13,0.9)] p-6 text-center">
                <p className="max-w-lg text-[13px] leading-6 text-slate-200">{error}</p>
                <button type="button" onClick={start} className="rounded-lg border border-slate-600 px-4 py-2 text-[12px] font-semibold text-white hover:bg-slate-800">Try again</button>
              </div>
            )}
          </>
        )}
      </div>
      <figcaption className="mt-2.5 flex flex-wrap items-center justify-between gap-2 text-[12px] text-[var(--text-faint)]">
        <span>{phase === 'ready' && hint ? hint : ''}</span>
        <span className="flex items-center gap-3">
          {phase === 'ready' && config.command && actionLabel && (
            <button type="button" onClick={runNext} className="text-[var(--accent-2)] hover:underline">{actionLabel}</button>
          )}
          <a href={viewerUrl} target="_blank" rel="noopener noreferrer" className="text-[var(--accent-2)] hover:underline">Open full viewer</a>
        </span>
      </figcaption>
    </figure>
  )
}
