import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react'

export type SpatialDemoId =
  | 'poblenou-scan-ifc'
  | 'pavilion-lidar-replay'
  | 'warehouse-lidar-replay'
  | 'construction-lidar-replay'
  | 'tunnel-lidar-replay'
  | 'pavilion-video-terrain'

interface SpatialMediaDemoProps {
  demo: SpatialDemoId
  title: string
  description: string
  poster: string
  posterAlt: string
  launchLabel?: string
  readyLabel?: string
  height?: number
}

type Phase = 'idle' | 'loading-model' | 'loading-media' | 'ready' | 'error'

const BASE = import.meta.env.BASE_URL as string

const DEMOS: Record<SpatialDemoId, {
  model: string
  fileName: string
  command: 'ifcviewer:add-pointcloud' | 'ifcviewer:start-pointcloud-replay' | 'ifcviewer:start-video-demo'
  commandPayload?: Record<string, unknown>
}> = {
  'poblenou-scan-ifc': {
    model: 'models/poblenou/BCN-IVO-ZZ-XX-M3-A-0001.ifc',
    fileName: 'BCN-IVO-ZZ-XX-M3-A-0001.ifc',
    command: 'ifcviewer:add-pointcloud',
    commandPayload: {
      url: 'models/poblenou/poblenou-site-scan.las',
      name: 'poblenou-site-scan.las',
    },
  },
  'pavilion-lidar-replay': {
    model: 'models/video-demo/IVO-Operations-Pavilion.ifc',
    fileName: 'IVO-Operations-Pavilion.ifc',
    command: 'ifcviewer:start-pointcloud-replay',
  },
  'warehouse-lidar-replay': {
    model: 'models/realtime-lidar/IVO-Warehouse-Operations.ifc',
    fileName: 'IVO-Warehouse-Operations.ifc',
    command: 'ifcviewer:start-pointcloud-replay',
    commandPayload: { replayId: 'warehouse-operations' },
  },
  'construction-lidar-replay': {
    model: 'models/realtime-lidar/IVO-Construction-Progress.ifc',
    fileName: 'IVO-Construction-Progress.ifc',
    command: 'ifcviewer:start-pointcloud-replay',
    commandPayload: { replayId: 'construction-progress' },
  },
  'tunnel-lidar-replay': {
    model: 'models/realtime-lidar/IVO-Utility-Tunnel.ifc',
    fileName: 'IVO-Utility-Tunnel.ifc',
    command: 'ifcviewer:start-pointcloud-replay',
    commandPayload: { replayId: 'utility-tunnel' },
  },
  'pavilion-video-terrain': {
    model: 'models/video-demo/IVO-Operations-Pavilion.ifc',
    fileName: 'IVO-Operations-Pavilion.ifc',
    command: 'ifcviewer:start-video-demo',
  },
}

function absoluteAsset(path: string): string {
  if (/^https?:\/\//i.test(path)) return path
  const relative = path.replace(/^\//, '')
  return new URL(`${BASE}${relative}`, window.location.origin).href
}

export default function SpatialMediaDemo({
  demo,
  title,
  description,
  poster,
  posterAlt,
  launchLabel = 'Start live example',
  readyLabel = 'Interactive example ready',
  height = 520,
}: SpatialMediaDemoProps) {
  const frameRef = useRef<HTMLIFrameElement>(null)
  const commandSentRef = useRef(false)
  const requestIdRef = useRef(`article-demo-${demo}-${Math.random().toString(36).slice(2)}`)
  const [phase, setPhase] = useState<Phase>('idle')
  const [attempt, setAttempt] = useState(0)
  const [error, setError] = useState('')
  const config = DEMOS[demo]

  const viewerUrl = useMemo(() => {
    if (typeof window === 'undefined') return '#'
    const url = new URL(BASE, window.location.origin)
    url.searchParams.set('embed', '1')
    url.searchParams.set("ui", "minimal")
    url.searchParams.set('validate', '0')
    url.searchParams.set('model', absoluteAsset(config.model))
    url.searchParams.set('name', config.fileName)
    return url.href
  }, [config])

  const start = useCallback(() => {
    commandSentRef.current = false
    requestIdRef.current = `article-demo-${demo}-${Date.now().toString(36)}`
    setError('')
    setPhase('loading-model')
    setAttempt((value) => value + 1)
  }, [demo])

  useEffect(() => {
    if (phase === 'idle') return
    const onMessage = (event: MessageEvent) => {
      if (event.source !== frameRef.current?.contentWindow) return
      if (event.origin !== window.location.origin) return
      const message = event.data as { source?: unknown; type?: unknown; requestId?: unknown; ok?: unknown; error?: unknown } | null
      if (!message || message.source !== 'ifc-validator' || typeof message.type !== 'string') return

      if (message.type === 'model-error') {
        setError(typeof message.error === 'string' ? message.error : 'The IFC model could not be loaded.')
        setPhase('error')
        return
      }

      if (message.type === 'model-loaded' && !commandSentRef.current) {
        commandSentRef.current = true
        setPhase("loading-media")
        const payload = { ...config.commandPayload }
        if (typeof payload.url === 'string') payload.url = absoluteAsset(payload.url)
        frameRef.current?.contentWindow?.postMessage({
          source: 'ifc-article-demo',
          type: config.command,
          requestId: requestIdRef.current,
          ...payload,
        }, window.location.origin)
        return
      }

      if (message.type === 'result' && message.requestId === requestIdRef.current) {
        if (message.ok === true) setPhase('ready')
        else {
          setError(typeof message.error === 'string' ? message.error : 'The spatial resource could not be started.')
          setPhase('error')
        }
      }
    }
    window.addEventListener('message', onMessage)
    return () => window.removeEventListener('message', onMessage)
  }, [phase, config])

  const status = phase === 'loading-model' ? 'Loading IFC…'
    : phase === 'loading-media' ? 'Aligning spatial media…'
      : phase === 'ready' ? readyLabel
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
              className="absolute inset-0 h-full w-full object-cover opacity-65"
            />
            <div className="absolute inset-0 bg-gradient-to-t from-[#09090d] via-[rgba(9,9,13,0.38)] to-[rgba(9,9,13,0.12)]" />
            <div className="relative z-10 flex min-h-[390px] flex-col items-start justify-end p-5 sm:p-7">
              <span className="mb-3 rounded-full border border-[rgba(103,232,249,0.35)] bg-[rgba(6,182,212,0.12)] px-2.5 py-1 font-mono text-[10px] font-bold tracking-widest text-[#67e8f9]">LIVE 3D EXAMPLE</span>
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
            {phase !== 'ready' && (
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
        <span>{description}</span>
        <a href={viewerUrl} target="_blank" rel="noopener noreferrer" className="text-[var(--accent-2)] hover:underline">Open full viewer</a>
      </figcaption>
    </figure>
  )
}
