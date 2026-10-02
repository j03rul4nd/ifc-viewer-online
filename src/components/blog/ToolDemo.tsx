// ─── ToolDemo.tsx ─────────────────────────────────────────────────────────────
// The real viewer, embedded in a post, doing the thing the post is about.
//
// Nothing loads until the reader asks: a poster and one button. Then the app
// boots in an iframe on this origin with the `article` preset (canvas only, a
// tight framing, a wheel that scrolls the page), loads the demo's model(s) by
// URL and — once every model is in — drives the tool through the same
// postMessage commands the public SDK sends (compare, video, cover, walk,
// measure…). The reader can re-run the action or take over the full viewer.
//
// PRESENTATION. The frame keeps one aspect ratio from poster to live view, so
// starting it never shoves the article down; the poster stays up, with the
// real load progress on it, until there is a model to look at, and the viewer
// fades in under it. The scene background follows the article's theme, except
// where the tool needs a light ground to show anything (shadows).

import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { editorialCopy } from '../../lib/blog-editorial-copy'

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
  /** Upper bound of the frame height in px; the frame itself keeps 16:10. */
  height?: number
}

type Phase = 'idle' | 'loading' | 'running' | 'ready' | 'error'

const BASE = import.meta.env.BASE_URL as string

const POBLENOU = 'models/poblenou'

type Cmd = { type: string; [k: string]: unknown }
type View = 'iso' | 'top' | 'front' | 'back' | 'left' | 'right'

interface DemoConfig {
  models: string[]
  params?: Record<string, string>
  /** The SDK command run when the models are in (and by the action button). */
  command?: Cmd
  /** Further commands the action button steps through, after `command`. */
  next?: Cmd[]
  /** Asset fields of `command` to resolve to absolute URLs. */
  assetFields?: string[]
  /**
   * Scene background. 'auto' follows the article: paper on a light page,
   * the dark studio gradient on a dark one.
   */
  bg?: 'auto' | 'paper' | 'white' | 'studio'
  /**
   * Re-frame tightly after the tool has started (starting some tools — the sun
   * study — reframes the scene its own way). Omitted: the `article` preset's
   * own iso framing on load is the shot.
   */
  frame?: { view?: View; fill?: number; azimuth?: number; elevation?: number }
  /**
   * A studio (Clip Studio, Cover Studio, the compare workspace) brings a whole
   * editor; at 16:10 its preview had no room left. Square, up to `height`.
   */
  tall?: boolean
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
    tall: true,
  },
  'video-generator': {
    models: ['models/torre-poblenou/BCN-IVO-ZZ-XX-M3-Z-0002.ifc'],
    bg: 'studio',
    tall: true,
    command: { type: 'ifcviewer:create-presentation', recipe: 'reel', options: { music: 'none', title: 'Torre Poblenou' } },
  },
  'cover-generator': {
    models: ['models/torre-poblenou/BCN-IVO-ZZ-XX-M3-Z-0002.ifc'],
    tall: true,
    command: { type: 'ifcviewer:create-cover', recipe: 'board', text: { title: 'Torre Poblenou', location: 'Barcelona' } },
  },
  'sun-study': {
    models: [`${POBLENOU}/BCN-IVO-ZZ-XX-M3-A-0001.ifc`, `${POBLENOU}/BCN-IVO-ZZ-XX-M3-S-0001.ifc`],
    // Shadows are dark: on a dark ground there is nothing to see.
    bg: 'paper',
    // Room around the building for the evening shadow to fall into.
    frame: { view: 'iso', fill: 0.62, elevation: 34 },
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
    // The Measure card takes the right edge of the frame: leave it room.
    frame: { view: 'iso', fill: 0.62, elevation: 38 },
    command: { type: 'ifcviewer:set-measure-tool', tool: 'distance' },
  },
  'federated-disciplines': {
    models: [
      `${POBLENOU}/BCN-IVO-ZZ-XX-M3-A-0001.ifc`,
      `${POBLENOU}/BCN-IVO-ZZ-XX-M3-S-0001.ifc`,
      `${POBLENOU}/BCN-IVO-ZZ-XX-M3-M-0001.ifc`,
    ],
    params: { tree: '1' },
  },
  'ifc43-bridge': {
    models: ['https://raw.githubusercontent.com/buildingSMART/Sample-Test-Files/main/IFC%204.3.2.0%20(IFC%204.3%20ADD2)/Simple-Scene/Infra-Bridge.ifc'],
    params: { tree: '1' },
  },
}

function absoluteAsset(path: string): string {
  if (/^https?:\/\//i.test(path)) return path
  return new URL(`${BASE}${path.replace(/^\//, '')}`, window.location.origin).href
}

function fileNameOf(url: string): string {
  return decodeURIComponent(url.split(/[?#]/)[0].split('/').pop() || 'model.ifc')
}

const isMac = (): boolean => typeof navigator !== 'undefined' && /Mac|iPhone|iPad/.test(navigator.platform || navigator.userAgent)

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
  const figureRef = useRef<HTMLElement>(null)
  const frameRef = useRef<HTMLIFrameElement>(null)
  const loadedRef = useRef(0)
  const requestIdRef = useRef('')
  const stepRef = useRef(0)
  const [phase, setPhase] = useState<Phase>('idle')
  /** The viewer has something to show: the poster can go. */
  const [revealed, setRevealed] = useState(false)
  const [progress, setProgress] = useState(0)
  const [attempt, setAttempt] = useState(0)
  const [error, setError] = useState('')
  const [lightPage, setLightPage] = useState(false)
  const config = DEMOS[demo]

  // The article's language, not the UI's: a Spanish post says "Reintentar".
  const lang = typeof document !== 'undefined' ? document.documentElement.lang.slice(0, 2) : 'en'
  const copy = editorialCopy(lang).toolDemo

  const viewerUrl = useMemo(() => {
    if (typeof window === 'undefined') return '#'
    const url = new URL(BASE, window.location.origin)
    url.searchParams.set('ui', 'article')
    url.searchParams.set('validate', '0')
    for (const m of config.models) {
      url.searchParams.append('model', absoluteAsset(m))
      url.searchParams.append('name', fileNameOf(m))
    }
    const bg = !config.bg || config.bg === 'auto' ? (lightPage ? 'paper' : 'studio') : config.bg
    url.searchParams.set('bg', bg)
    for (const [k, v] of Object.entries(config.params ?? {})) url.searchParams.set(k, v)
    if (lang) url.searchParams.set('lang', lang)
    return url.href
  }, [config, lightPage, lang])

  // The full viewer link: same models, the normal app around them.
  const fullViewerUrl = useMemo(() => {
    if (typeof window === 'undefined') return '#'
    const url = new URL(BASE, window.location.origin)
    for (const m of config.models) {
      url.searchParams.append('model', absoluteAsset(m))
      url.searchParams.append('name', fileNameOf(m))
    }
    if (lang) url.searchParams.set('lang', lang)
    return url.href
  }, [config, lang])

  const post = useCallback((msg: Record<string, unknown>) => {
    frameRef.current?.contentWindow?.postMessage({ source: 'ifc-article-demo', ...msg }, window.location.origin)
  }, [])

  const reframe = useCallback(() => {
    const f = config.frame
    if (!f) return
    post({
      type: 'ifcviewer:view',
      requestId: `tool-demo-frame-${Date.now().toString(36)}`,
      preset: f.view ?? 'iso',
      fill: f.fill ?? 0.85,
      ...(f.azimuth !== undefined ? { azimuth: f.azimuth } : {}),
      ...(f.elevation !== undefined ? { elevation: f.elevation } : {}),
      animate: false,
    })
  }, [config, post])

  const runCommand = useCallback((step = 0) => {
    const list = config.command ? [config.command, ...(config.next ?? [])] : []
    stepRef.current = list.length ? step % list.length : 0
    const cmd = list[stepRef.current]
    if (!cmd) {
      setPhase('ready')
      reframe()
      return
    }
    const payload: Record<string, unknown> = { ...cmd }
    for (const f of config.assetFields ?? []) {
      const v = payload[f]
      payload[f] = Array.isArray(v) ? v.map((x) => absoluteAsset(String(x))) : absoluteAsset(String(v))
    }
    requestIdRef.current = `tool-demo-${demo}-${Date.now().toString(36)}`
    setPhase('running')
    post({ ...payload, requestId: requestIdRef.current })
  }, [config, demo, post, reframe])

  // The action button: the next command in the list, or the same one again.
  const runNext = useCallback(() => runCommand(config.next?.length ? stepRef.current + 1 : 0), [config, runCommand])

  const start = useCallback(() => {
    loadedRef.current = 0
    setError('')
    setProgress(0)
    setRevealed(false)
    setLightPage(!!figureRef.current?.closest('.lp-light'))
    setPhase('loading')
    setAttempt((n) => n + 1)
  }, [])

  useEffect(() => {
    const onMessage = (event: MessageEvent) => {
      if (event.source !== frameRef.current?.contentWindow) return
      if (event.origin !== window.location.origin) return
      const message = event.data as { source?: unknown; type?: unknown; requestId?: unknown; ok?: unknown; error?: unknown; message?: unknown; percent?: unknown } | null
      if (!message || message.source !== 'ifc-validator' || typeof message.type !== 'string') return

      if (message.type === 'model-progress') {
        // Per job, without saying which: fold it into "models done + this one".
        const pct = typeof message.percent === 'number' ? message.percent : 0
        const total = config.models.length
        setProgress((prev) => Math.max(prev, Math.round(((loadedRef.current + pct / 100) / total) * 100)))
        return
      }
      if (message.type === 'model-error') {
        setError(typeof message.message === 'string' ? message.message : copy.loadFailed)
        setPhase('error')
        return
      }
      if (message.type === 'ready' || message.type === 'model-loaded') {
        // The viewer shares this origin's stored language with the blog, so the
        // ?lang= of the frame can lose a race with it: say it again once mounted.
        if (lang) post({ type: 'ifcviewer:set-language', lang })
        if (message.type === 'ready') return
        loadedRef.current += 1
        setProgress(Math.round((loadedRef.current / config.models.length) * 100))
        if (loadedRef.current === config.models.length) {
          // A moment for the preset's own framing to land, then the tool.
          window.setTimeout(() => {
            setRevealed(true)
            runCommand()
          }, 250)
        }
        return
      }
      if (message.type === 'result' && message.requestId === requestIdRef.current) {
        if (message.ok === true) {
          setPhase('ready')
          // AFTER the tool: starting it (the sun study) reframes on its own.
          if (stepRef.current === 0) reframe()
        } else {
          setError(typeof message.error === 'string' ? message.error : copy.loadFailed)
          setPhase('error')
        }
      }
    }
    window.addEventListener('message', onMessage)
    return () => window.removeEventListener('message', onMessage)
  }, [config, runCommand, post, reframe, copy, lang])

  const live = phase !== 'idle'
  const status = phase === 'loading' ? copy.loading(progress)
    : phase === 'running' ? copy.running
      : ''
  const controls = isMac() ? copy.controls.replace('Ctrl', '⌘') : copy.controls

  return (
    <figure ref={figureRef} className="tool-demo my-9">
      <div
        className={`relative w-full overflow-hidden rounded-2xl border border-[rgba(94,106,210,0.32)] bg-[#0d0d10] shadow-[0_18px_50px_-24px_rgba(0,0,0,0.6)] ${config.tall ? 'aspect-square' : 'aspect-[16/10]'} max-sm:aspect-[4/5]`}
        style={{ maxHeight: height }}
      >
        {live && (
          <iframe
            key={attempt}
            ref={frameRef}
            src={viewerUrl}
            title={title}
            allow="fullscreen; autoplay"
            className={`absolute inset-0 h-full w-full border-0 transition-opacity duration-500 motion-reduce:transition-none ${revealed ? 'opacity-100' : 'opacity-0'}`}
          />
        )}

        {/* The poster: the idle state, and the cover while the model loads. */}
        <div
          aria-hidden={revealed}
          className={`absolute inset-0 transition-opacity duration-500 motion-reduce:transition-none ${revealed ? 'pointer-events-none opacity-0' : 'opacity-100'}`}
        >
          <img
            src={absoluteAsset(poster)}
            alt={posterAlt}
            width={1600}
            height={900}
            loading="lazy"
            decoding="async"
            className="absolute inset-0 h-full w-full object-cover"
          />
          {/* A scrim strong enough to read white text over any poster. */}
          <div className="absolute inset-0 bg-gradient-to-t from-[rgba(9,9,13,0.96)] via-[rgba(9,9,13,0.72)] to-[rgba(9,9,13,0.18)]" />
          <div className="relative z-10 flex h-full flex-col items-start justify-end p-5 sm:p-7">
            <span className="mb-3 rounded-full border border-[rgba(103,232,249,0.35)] bg-[rgba(6,182,212,0.14)] px-2.5 py-1 font-mono text-[10px] font-bold tracking-widest text-[#67e8f9]">{copy.live}</span>
            <h3 className="mb-2 text-[20px] font-semibold tracking-tight text-white sm:text-[24px]">{title}</h3>
            <p className="mb-5 max-w-2xl text-[13px] leading-6 text-slate-200 sm:text-[14px]">{description}</p>
            {phase === 'idle' ? (
              <button type="button" onClick={start} className="rounded-lg bg-[#5e6ad2] px-4 py-2.5 text-[13px] font-semibold text-white transition hover:brightness-110 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[#67e8f9]">
                {launchLabel}
              </button>
            ) : phase !== 'error' && (
              <div className="w-full max-w-sm" role="status" aria-live="polite">
                <div className="mb-2 text-[12px] text-slate-200">{status}</div>
                <div className="h-1 w-full overflow-hidden rounded-full bg-[rgba(255,255,255,0.14)]">
                  <div className="h-full rounded-full bg-[#67e8f9] transition-[width] duration-300" style={{ width: `${Math.max(4, progress)}%` }} />
                </div>
              </div>
            )}
          </div>
        </div>

        {/* While a tool runs over a visible model: a quiet pill, not a curtain. */}
        {revealed && phase === 'running' && (
          <div className="pointer-events-none absolute left-1/2 top-3 z-10 -translate-x-1/2 rounded-full bg-[rgba(9,9,13,0.78)] px-3 py-1.5 text-[11px] text-slate-100 backdrop-blur" role="status" aria-live="polite">
            <span className="mr-2 inline-block h-1.5 w-1.5 animate-pulse rounded-full bg-[#67e8f9] align-middle" />
            {copy.running}
          </div>
        )}

        {phase === 'error' && (
          <div className="absolute inset-0 z-20 flex flex-col items-center justify-center gap-3 bg-[rgba(9,9,13,0.92)] p-6 text-center">
            <p className="max-w-lg text-[13px] leading-6 text-slate-200">{error || copy.loadFailed}</p>
            <button type="button" onClick={start} className="rounded-lg border border-slate-600 px-4 py-2 text-[12px] font-semibold text-white hover:bg-slate-800">{copy.retry}</button>
          </div>
        )}
      </div>
      <figcaption className="mt-2.5 flex flex-wrap items-start justify-between gap-x-4 gap-y-1 text-[12px] leading-5 text-[var(--text-faint)]">
        <span className="min-w-0 flex-1">
          {phase === 'ready' && hint ? hint : revealed ? controls : ''}
          {phase === 'ready' && hint && <span className="block opacity-80">{controls}</span>}
        </span>
        <span className="flex shrink-0 items-center gap-3">
          {/* Under the frame, not on it: the tools bring their own buttons to
              every corner (Cover Studio's export, the compare panel's close). */}
          {phase === 'ready' && config.command && actionLabel && (
            <button
              type="button"
              onClick={runNext}
              className="rounded-md bg-[#5e6ad2] px-3 py-1.5 text-[12px] font-semibold text-white transition hover:brightness-110 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[#67e8f9]"
            >
              {actionLabel}
            </button>
          )}
          <a href={fullViewerUrl} target="_blank" rel="noopener noreferrer" className="text-[var(--accent-2)] hover:underline">{copy.openFull}</a>
        </span>
      </figcaption>
    </figure>
  )
}
