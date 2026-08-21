import React, { useCallback, useEffect, useRef, useState } from 'react'
import { useTranslation } from 'react-i18next'
import { ViewportPanel } from './ViewportPanel'
import { useVideoStore, pendingVideo } from '../stores/videoStore'
import { placementForMode } from '../lib/video/video-placement'
import type { VideoPlacement, VideoSourceKind, VideoSurfaceMode } from '../lib/video/video-types'
import {
  CAMERA_CONSTRAINTS,
  DISPLAY_CONSTRAINTS,
  isLiveVideoKind,
  liveVideoErrorKey,
  stopMediaStream,
  type LiveVideoKind,
} from '../lib/video/live-video'
import { DEMO_VIDEOS, type DemoVideo } from '../demo-models/videos'
import { toast } from '../stores/toastStore'
import type { ViewerAPI } from '../lib/viewer'
import type { VideoSystemAPI } from '../lib/video/video-system'
import { appBus } from '../lib/event-bus'

interface Props {
  viewerApiRef: React.RefObject<ViewerAPI | null>
  companionLoaded: boolean
  onLoadCompanionModel: () => Promise<void>
  onClose: () => void
}

function uid(): string {
  return typeof crypto !== 'undefined' && 'randomUUID' in crypto
    ? crypto.randomUUID()
    : `video-${Date.now()}-${Math.random().toString(36).slice(2)}`
}

function clock(seconds: number): string {
  if (!Number.isFinite(seconds) || seconds < 0) return '0:00'
  const whole = Math.floor(seconds)
  return `${Math.floor(whole / 60)}:${String(whole % 60).padStart(2, '0')}`
}

export default function VideoPanel({
  viewerApiRef,
  companionLoaded,
  onLoadCompanionModel,
  onClose,
}: Props) {
  const { t } = useTranslation('video')
  const store = useVideoStore()
  const fileRef = useRef<HTMLInputElement>(null)
  const [busy, setBusy] = useState(false)
  const [playback, setPlayback] = useState({ currentTime: 0, duration: 0, paused: true })
  const active = store.videos.find((video) => video.id === store.activeVideoId) ?? null
  const activeIsLive = active ? isLiveVideoKind(active.sourceKind) : false

  const getSystem = useCallback((): Promise<VideoSystemAPI> | null => {
    const viewer = viewerApiRef.current
    return viewer ? viewer.getVideos() : null
  }, [viewerApiRef])

  const loadSource = useCallback(async (input: {
    fileName: string
    fileSize: number
    sourceKey: string
    sourceKind: Extract<VideoSourceKind, 'file' | 'demo'>
    src: string
    revokeSrcOnDispose: boolean
    mode?: VideoSurfaceMode
    placement?: VideoPlacement
  }): Promise<void> => {
    const systemPromise = getSystem()
    if (!systemPromise) return
    setBusy(true)
    const id = uid()
    try {
      const system = await systemPromise
      const mode = input.mode ?? 'screen'
      const placement = input.placement ?? placementForMode(
        mode,
        system.getModelBounds(),
        system.getCameraPosition(),
      )
      const entry = pendingVideo({
        id,
        fileName: input.fileName,
        fileSize: input.fileSize,
        sourceKey: input.sourceKey,
        sourceKind: input.sourceKind,
        mode,
        placement,
      })
      useVideoStore.getState().addVideo(entry)
      const metadata = await system.add({
        id,
        src: input.src,
        revokeSrcOnDispose: input.revokeSrcOnDispose,
        mode,
        placement,
        muted: true,
        loop: true,
        volume: entry.volume,
      })
      useVideoStore.getState().updateVideo(id, {
        status: 'ready',
        aspectRatio: metadata.aspectRatio,
        duration: metadata.duration,
      })
      // First reveal the relationship, not just a full-screen rectangle: the
      // composed IFC + video view is the product being demonstrated.
      system.frameWithModel(id)
      const playing = await system.play(id)
      useVideoStore.getState().updateVideo(id, { playing })
      if (!playing) toast(t('playback.autoplayBlocked'), 'warning')
    } catch (error) {
      console.warn('[VideoPanel] video load failed:', error)
      useVideoStore.getState().updateVideo(id, { status: 'error', errorKey: 'error.decode' })
      toast(t('error.decode'), 'error')
    } finally {
      setBusy(false)
    }
  }, [getSystem, t])

  const loadFile = useCallback(async (file: File): Promise<void> => {
    const url = URL.createObjectURL(file)
    await loadSource({
      fileName: file.name,
      fileSize: file.size,
      sourceKey: `${file.name}:${file.size}:${file.lastModified}`,
      sourceKind: 'file',
      src: url,
      revokeSrcOnDispose: true,
    })
  }, [loadSource])

  const loadDemo = useCallback(async (demo: DemoVideo): Promise<void> => {
    await loadSource({
      fileName: demo.fileName,
      fileSize: demo.sizeBytes,
      sourceKey: demo.url,
      sourceKind: 'demo',
      src: demo.url,
      revokeSrcOnDispose: false,
      mode: demo.mode,
      placement: demo.placement,
    })
  }, [loadSource])

  const loadLive = useCallback(async (kind: LiveVideoKind): Promise<void> => {
    const systemPromise = getSystem()
    if (!systemPromise) return
    const media = navigator.mediaDevices
    const supported = Boolean(media) && (kind === 'camera'
      ? typeof media?.getUserMedia === 'function'
      : typeof media?.getDisplayMedia === 'function')
    if (!supported) {
      toast(t('error.liveUnsupported'), 'warning')
      return
    }

    setBusy(true)
    let stream: MediaStream | null = null
    let id: string | null = null
    try {
      // These calls stay directly behind the button click: display capture in
      // particular requires transient user activation and fresh permission.
      stream = kind === 'camera'
        ? await media.getUserMedia(CAMERA_CONSTRAINTS)
        : await media.getDisplayMedia(DISPLAY_CONSTRAINTS)
      const system = await systemPromise
      id = uid()
      const mode: VideoSurfaceMode = 'screen'
      const placement = placementForMode(
        mode,
        system.getModelBounds(),
        system.getCameraPosition(),
      )
      const entry = {
        ...pendingVideo({
          id,
          fileName: t(`live.${kind}Name` as never),
          fileSize: 0,
          sourceKey: `${kind}:${Date.now()}`,
          sourceKind: kind,
          mode,
          placement,
        }),
        loop: false,
      }
      useVideoStore.getState().addVideo(entry)
      const metadata = await system.addStream({
        id,
        stream,
        stopTracksOnDispose: true,
        mode,
        placement,
        muted: true,
        loop: false,
        volume: 0,
        onStreamEnded: () => {
          useVideoStore.getState().updateVideo(id!, { status: 'ended', playing: false })
        },
      })
      useVideoStore.getState().updateVideo(id, {
        status: 'ready',
        aspectRatio: metadata.aspectRatio,
        duration: 0,
      })
      system.frameWithModel(id)
      const playing = await system.play(id)
      useVideoStore.getState().updateVideo(id, { playing })
      if (!playing) toast(t('playback.autoplayBlocked'), 'warning')
    } catch (error) {
      if (stream) stopMediaStream(stream)
      const key = liveVideoErrorKey(error, supported)
      if (id) useVideoStore.getState().updateVideo(id, { status: 'error', errorKey: key })
      console.warn('[VideoPanel] live video failed:', error)
      toast(t(key), key === 'error.permission' ? 'warning' : 'error')
    } finally {
      setBusy(false)
    }
  }, [getSystem, t])

  const loadFairDemo = useCallback((): void => {
    void (async () => {
      setBusy(true)
      try {
        // Await the actual model:loaded event so automatic placement reads the
        // companion IFC bounds, not whichever unrelated model happened to be
        // active when the user opened the panel.
        if (!companionLoaded) await onLoadCompanionModel()
        await loadDemo(DEMO_VIDEOS[0])
      } catch (error) {
        console.warn('[VideoPanel] fair demo could not start:', error)
      } finally {
        setBusy(false)
      }
    })()
  }, [companionLoaded, onLoadCompanionModel, loadDemo])

  // Article/SDK bridge: the owning panel remains the only place that creates
  // video textures and computes placement from the companion IFC bounds.
  useEffect(() => appBus.on('sdk:video', (command) => {
    void (async () => {
      try {
        if (command.action !== 'demo') throw new Error('Unsupported video command')
        await new Promise<void>((resolve, reject) => {
          void (async () => {
            try {
              if (!companionLoaded) await onLoadCompanionModel()
              await loadDemo(DEMO_VIDEOS[0])
              resolve()
            } catch (error) {
              reject(error)
            }
          })()
        })
        command.done?.(true)
      } catch (error) {
        command.done?.(false, error instanceof Error ? error.message : String(error))
      }
    })()
  }), [companionLoaded, onLoadCompanionModel, loadDemo])

  const applyPresentation = useCallback((id: string): void => {
    const entry = useVideoStore.getState().videos.find((item) => item.id === id)
    if (!entry) return
    void getSystem()?.then((system) => system.setPresentation(id, entry.mode, entry.placement))
  }, [getSystem])

  const patchPlacement = useCallback((patch: Partial<VideoPlacement>): void => {
    const id = useVideoStore.getState().activeVideoId
    if (!id) return
    useVideoStore.getState().setPlacement(id, patch)
    applyPresentation(id)
  }, [applyPresentation])

  const setMode = useCallback((mode: VideoSurfaceMode): void => {
    const id = useVideoStore.getState().activeVideoId
    if (!id) return
    void getSystem()?.then((system) => {
      const entry = useVideoStore.getState().videos.find((item) => item.id === id)
      if (!entry) return
      const placement = placementForMode(
        mode,
        system.getModelBounds(),
        system.getCameraPosition(),
        entry.placement,
      )
      useVideoStore.getState().setMode(id, mode)
      useVideoStore.getState().setPlacement(id, placement)
      const next = useVideoStore.getState().videos.find((item) => item.id === id)
      if (next) system.setPresentation(id, mode, next.placement)
      system.frameWithModel(id)
    })
  }, [getSystem])

  const snapGroundToSurface = useCallback((): void => {
    const id = useVideoStore.getState().activeVideoId
    if (!id) return
    void getSystem()?.then((system) => {
      const entry = useVideoStore.getState().videos.find((item) => item.id === id)
      if (!entry) return
      const result = system.snapToSurface(id, entry.placement)
      if (!result) {
        toast(t('placement.noSurface'), 'warning')
        return
      }
      useVideoStore.getState().setPlacement(id, result.placement)
      if (result.variation > Math.max(0.25, result.placement.surfaceOffset * 4)) {
        toast(t('placement.reliefWarning', { variation: result.variation.toFixed(2) }), 'warning')
      } else {
        toast(t('placement.surfaceReady'), 'success')
      }
    })
  }, [getSystem, t])

  const remove = useCallback((id: string): void => {
    void getSystem()?.then((system) => system.remove(id))
    useVideoStore.getState().removeVideo(id)
  }, [getSystem])

  const setVisible = useCallback((id: string, visible: boolean): void => {
    useVideoStore.getState().setVisible(id, visible)
    if (!visible) useVideoStore.getState().updateVideo(id, { playing: false })
    void getSystem()?.then((system) => system.setVisible(id, visible))
  }, [getSystem])

  const togglePlay = useCallback((): void => {
    if (!active) return
    void getSystem()?.then(async (system) => {
      if (playback.paused) {
        const playing = await system.play(active.id)
        useVideoStore.getState().updateVideo(active.id, { playing })
      } else {
        system.pause(active.id)
        useVideoStore.getState().updateVideo(active.id, { playing: false })
      }
    })
  }, [active, playback.paused, getSystem])

  // The media element owns playback time. Poll only while this panel is visible;
  // the VideoTexture itself stays event-driven and needs no second render loop.
  useEffect(() => {
    if (!store.panelOpen || !active || active.status !== 'ready') return
    let alive = true
    const poll = (): void => {
      void getSystem()?.then((system) => {
        if (!alive) return
        const snapshot = system.getPlayback(active.id)
        if (!snapshot) return
        setPlayback({
          currentTime: snapshot.currentTime,
          duration: snapshot.duration,
          paused: snapshot.paused,
        })
      })
    }
    poll()
    const timer = window.setInterval(poll, 250)
    return () => {
      alive = false
      window.clearInterval(timer)
    }
  }, [store.panelOpen, active?.id, active?.status, getSystem])

  return (
    <ViewportPanel
      open={store.panelOpen}
      onClose={onClose}
      label={t('title')}
      mobile="sheet"
      widthPx={318}
      anchor="top"
      maxHeight="calc(100vh - 140px)"
    >
      <div className="flex flex-col gap-3 p-3 overflow-y-auto" data-testid="video-panel">
        <section className="rounded-[9px] border border-[var(--accent)]/50 bg-[var(--surface-2)] p-2.5">
          <div className="flex items-start gap-2">
            <img
              src={DEMO_VIDEOS[0].posterUrl}
              alt=""
              className="w-20 aspect-video object-cover rounded-[6px] bg-black/30"
            />
            <div className="min-w-0 flex-1">
              <div className="text-[11px] font-semibold">{t('fair.title')}</div>
              <div className="text-[10px] text-[var(--text-faint)] leading-snug mt-0.5">
                {t('fair.description')}
              </div>
            </div>
          </div>
          <button
            onClick={loadFairDemo}
            disabled={busy}
            className="w-full mt-2 px-2 py-2 rounded-[7px] text-[11px] font-semibold bg-[var(--accent)] text-white hover:brightness-110 disabled:opacity-50"
          >
            {busy ? t('load.working') : companionLoaded ? t('fair.loadVideo') : t('fair.loadBoth')}
          </button>
          <div className="text-[9px] text-[var(--text-faint)] mt-1">
            {DEMO_VIDEOS[0].durationLabel} · {t('fair.offline')}
          </div>
        </section>

        <section>
          <input
            ref={fileRef}
            type="file"
            accept="video/mp4,video/webm,video/ogg,.mp4,.webm,.ogv,.ogg"
            className="hidden"
            onChange={(event) => {
              const file = event.target.files?.[0]
              if (file) void loadFile(file)
              event.target.value = ''
            }}
          />
          <button
            onClick={() => fileRef.current?.click()}
            disabled={busy}
            className="w-full px-2 py-2 rounded-[7px] text-[11px] font-medium border border-dashed border-[var(--border-strong)] text-[var(--text-dim)] hover:text-[var(--text)] hover:bg-[var(--surface-2)] disabled:opacity-50"
          >
            {t('load.file')}
          </button>
          <div className="text-[10px] text-[var(--text-faint)] mt-1 leading-snug">{t('load.hint')}</div>
          <div className="grid grid-cols-2 gap-1 mt-2">
            <button
              onClick={() => void loadLive('camera')}
              disabled={busy}
              className="px-2 py-2 rounded-[7px] text-[10px] font-medium border border-[var(--border-strong)] hover:bg-[var(--surface-2)] disabled:opacity-50"
            >
              {t('live.camera')}
            </button>
            <button
              onClick={() => void loadLive('screen')}
              disabled={busy}
              className="px-2 py-2 rounded-[7px] text-[10px] font-medium border border-[var(--border-strong)] hover:bg-[var(--surface-2)] disabled:opacity-50"
            >
              {t('live.screen')}
            </button>
          </div>
          <div className="text-[9px] text-[var(--text-faint)] mt-1 leading-snug">{t('live.hint')}</div>
        </section>

        {store.videos.length > 0 && (
          <section className="flex flex-col gap-1 pt-2 border-t border-[var(--border)]">
            {store.videos.map((video) => (
              <div
                key={video.id}
                onClick={() => useVideoStore.getState().setActiveVideo(video.id)}
                className={`px-2 py-1.5 rounded-[7px] cursor-pointer border ${
                  video.id === store.activeVideoId
                    ? 'border-[var(--accent)] bg-[var(--surface-2)]'
                    : 'border-transparent hover:bg-[var(--surface-2)]'
                }`}
              >
                <div className="flex items-center gap-2">
                  <span className="flex-1 truncate text-[11px]">{video.fileName}</span>
                  <button
                    onClick={(event) => { event.stopPropagation(); setVisible(video.id, !video.visible) }}
                    className="text-[10px] text-[var(--text-faint)] hover:text-[var(--text)]"
                  >
                    {video.visible ? t('actions.hide') : t('actions.show')}
                  </button>
                  <button
                    onClick={(event) => { event.stopPropagation(); remove(video.id) }}
                    className="text-[10px] text-[var(--text-faint)] hover:text-[var(--danger,#e05252)]"
                  >
                    {t('actions.remove')}
                  </button>
                </div>
                <div className="text-[9px] text-[var(--text-faint)] font-mono">
                  {video.status === 'loading' ? t('load.working')
                    : video.status === 'error' ? t((video.errorKey ?? 'error.decode') as never)
                      : video.status === 'ended' ? t('live.ended')
                        : isLiveVideoKind(video.sourceKind)
                          ? `${t('live.badge')} · ${video.mode}`
                          : `${video.mode} · ${clock(video.duration)}`}
                </div>
              </div>
            ))}
          </section>
        )}

        {active?.status === 'ready' && (
          <>
            <section className="flex flex-col gap-2 pt-2 border-t border-[var(--border)]">
              <div className="text-[11px] font-medium">{t('mode.title')}</div>
              <div className="grid grid-cols-3 gap-1">
                {(['screen', 'ground', 'billboard'] as const).map((mode) => (
                  <button
                    key={mode}
                    aria-pressed={active.mode === mode}
                    onClick={() => setMode(mode)}
                    className={`px-1 py-1.5 rounded-[7px] text-[10px] font-medium border transition-colors ${
                      active.mode === mode
                        ? 'bg-[var(--accent)] border-[var(--accent)] text-white'
                        : 'border-[var(--border-strong)] text-[var(--text-dim)] hover:bg-[var(--surface-2)]'
                    }`}
                  >
                    {t(`mode.${mode}` as never)}
                  </button>
                ))}
              </div>
              <div className="text-[10px] text-[var(--text-faint)] leading-snug">
                {t(`mode.${active.mode}Hint` as never)}
              </div>
            </section>

            <section className="flex flex-col gap-2 pt-2 border-t border-[var(--border)]">
              {activeIsLive ? (
                <div className="flex items-center gap-2 rounded-[7px] border border-emerald-500/40 bg-emerald-500/10 px-2 py-1.5">
                  <span className="h-2 w-2 rounded-full bg-emerald-400 animate-pulse" aria-hidden="true" />
                  <span className="flex-1 text-[10px] font-semibold text-emerald-300">{t('live.active')}</span>
                  <button
                    onClick={() => remove(active.id)}
                    className="px-2 py-1 rounded-[6px] text-[10px] border border-emerald-500/40 hover:bg-emerald-500/15"
                  >
                    {t('live.stop')}
                  </button>
                </div>
              ) : (
                <>
                  <div className="flex items-center gap-2">
                    <button
                      onClick={togglePlay}
                      className="w-16 px-2 py-1.5 rounded-[7px] text-[10px] font-medium border border-[var(--border-strong)] hover:bg-[var(--surface-2)]"
                    >
                      {playback.paused ? t('playback.play') : t('playback.pause')}
                    </button>
                    <input
                      aria-label={t('playback.timeline')}
                      type="range"
                      min={0}
                      max={Math.max(0.01, playback.duration)}
                      step={0.04}
                      value={Math.min(playback.currentTime, Math.max(0.01, playback.duration))}
                      onChange={(event) => void getSystem()?.then((system) => system.seek(active.id, Number(event.target.value)))}
                      className="flex-1 accent-[var(--accent)]"
                    />
                    <span className="text-[9px] font-mono text-[var(--text-faint)]">
                      {clock(playback.currentTime)}/{clock(playback.duration)}
                    </span>
                  </div>
                  <div className="flex gap-1">
                    <button
                      onClick={() => {
                        const loop = !active.loop
                        useVideoStore.getState().updateVideo(active.id, { loop })
                        void getSystem()?.then((system) => system.setLoop(active.id, loop))
                      }}
                      aria-pressed={active.loop}
                      className={`flex-1 px-2 py-1 rounded-[6px] text-[10px] border ${active.loop ? 'border-[var(--accent)] text-[var(--accent)]' : 'border-[var(--border)] text-[var(--text-faint)]'}`}
                    >
                      {t('playback.loop')}
                    </button>
                    <button
                      onClick={() => {
                        const muted = !active.muted
                        useVideoStore.getState().updateVideo(active.id, { muted })
                        void getSystem()?.then((system) => system.setMuted(active.id, muted))
                      }}
                      aria-pressed={active.muted}
                      className={`flex-1 px-2 py-1 rounded-[6px] text-[10px] border ${active.muted ? 'border-[var(--accent)] text-[var(--accent)]' : 'border-[var(--border)] text-[var(--text-faint)]'}`}
                    >
                      {active.muted ? t('playback.muted') : t('playback.sound')}
                    </button>
                  </div>
                </>
              )}
            </section>

            <section className="flex flex-col gap-2 pt-2 border-t border-[var(--border)]">
              <div className="text-[11px] font-medium">{t('placement.title')}</div>
              <Slider label={t('placement.x')} value={active.placement.x} min={-250} max={250} step={0.05} unit="m" onChange={(x) => patchPlacement({ x })} />
              <Slider label={t('placement.y')} value={active.placement.y} min={-100} max={200} step={0.05} unit="m" onChange={(y) => patchPlacement({ y })} />
              <Slider label={t('placement.z')} value={active.placement.z} min={-250} max={250} step={0.05} unit="m" onChange={(z) => patchPlacement({ z })} />
              <Slider label={t('placement.width')} value={active.placement.width} min={0.5} max={100} step={0.1} unit="m" onChange={(width) => patchPlacement({ width })} />
              <Slider label={t('placement.opacity')} value={active.placement.opacity} min={0.05} max={1} step={0.01} unit="" digits={2} onChange={(opacity) => patchPlacement({ opacity })} />
              {active.mode !== 'billboard' && (
                <>
                  <Slider label={t('placement.yaw')} value={active.placement.yawDeg} min={-180} max={180} step={1} unit="°" digits={0} onChange={(yawDeg) => patchPlacement({ yawDeg })} />
                  <Slider label={t('placement.pitch')} value={active.placement.pitchDeg} min={-45} max={45} step={0.5} unit="°" digits={1} onChange={(pitchDeg) => patchPlacement({ pitchDeg })} />
                  <Slider label={t('placement.roll')} value={active.placement.rollDeg} min={-45} max={45} step={0.5} unit="°" digits={1} onChange={(rollDeg) => patchPlacement({ rollDeg })} />
                </>
              )}
              {active.mode === 'ground' && (
                <>
                  <Slider label={t('placement.offset')} value={active.placement.surfaceOffset} min={0.005} max={1} step={0.005} unit="m" digits={3} onChange={(surfaceOffset) => patchPlacement({ surfaceOffset })} />
                  <button
                    onClick={snapGroundToSurface}
                    className="w-full px-2 py-1.5 rounded-[7px] text-[10px] font-semibold border border-[var(--accent)]/60 text-[var(--accent)] hover:bg-[var(--accent)]/10"
                  >
                    {t('placement.snapSurface')}
                  </button>
                </>
              )}
              <div className="grid grid-cols-3 gap-1">
                <button
                  onClick={() => setMode(active.mode)}
                  className="px-1 py-1.5 rounded-[7px] text-[9px] font-medium border border-[var(--border-strong)] hover:bg-[var(--surface-2)]"
                >
                  {t('placement.auto')}
                </button>
                <button
                  onClick={() => void getSystem()?.then((system) => system.frame(active.id))}
                  className="px-1 py-1.5 rounded-[7px] text-[9px] font-medium border border-[var(--border-strong)] hover:bg-[var(--surface-2)]"
                >
                  {t('placement.frame')}
                </button>
                <button
                  onClick={() => void getSystem()?.then((system) => system.frameWithModel(active.id))}
                  className="px-1 py-1.5 rounded-[7px] text-[9px] font-medium border border-[var(--border-strong)] hover:bg-[var(--surface-2)]"
                >
                  {t('placement.frameTogether')}
                </button>
              </div>
              <div className="text-[9px] text-[var(--text-faint)] leading-snug">{t('placement.cameraHint')}</div>
            </section>
          </>
        )}
      </div>
    </ViewportPanel>
  )
}

function Slider(props: {
  label: string
  value: number
  min: number
  max: number
  step: number
  unit: string
  digits?: number
  onChange(value: number): void
}) {
  const { label, value, min, max, step, unit, digits = 2, onChange } = props
  return (
    <label className="flex flex-col gap-0.5">
      <span className="flex justify-between text-[10px] text-[var(--text-faint)]">
        <span>{label}</span>
        <span className="font-mono">{value.toFixed(digits)}{unit}</span>
      </span>
      <input
        type="range"
        min={min}
        max={max}
        step={step}
        value={value}
        onChange={(event) => onChange(Number(event.target.value))}
        className="w-full accent-[var(--accent)]"
      />
    </label>
  )
}
