// ─── Export sheet ──────────────────────────────────────────────────────────────
// Export the way CapCut does it: one sheet, three stages, no dialogs in between.
//
//   settings — resolution, frame rate, quality; the file size and (after the
//              first export on this device) how long it will take; the name;
//              music on/off with the rights note inline, not as a pop-up.
//   export   — the frames as they encode, a bar, time left, cancel.
//   done     — saved automatically; share (the phone's share sheet reaches
//              TikTok and Instagram directly), open TikTok, and — when the
//              sound is added in the app — exactly where to start it.

import { useEffect, useMemo, useRef, useState } from 'react'
import { useTranslation } from 'react-i18next'
import * as Icons from '../Icons'
import { useClipStudioStore } from '../../stores/clipStudioStore'
import { toast } from '../../stores/toastStore'
import { downloadBlob } from '../../lib/diffStore'
import { projectDuration } from '../../lib/capture/project'
import { needsRightsWarning } from '../../lib/capture/timeline'
import { formatStart } from '../../lib/capture/tiktok-link'
import { formatBytes } from '../../lib/capture/replay-buffer-core'
import { exportStudio } from '../../lib/capture/studio-actions'
import {
  EXPORT_FPS, EXPORT_QUALITIES, EXPORT_RESOLUTIONS, estimateBytes, estimateExportSec, exportSize,
  lastExportSettings, rememberExportSettings, type ExportSettings,
} from '../../lib/capture/export-settings'

type Stage = 'settings' | 'export' | 'done'

function defaultName(preset: string): string {
  return `ifc-clip-${preset}-${new Date().toISOString().slice(0, 16).replace(/[:T]/g, '-')}`
}

/** "~1 min 20 s" / "~35 s". */
function formatDuration(sec: number): string {
  const s = Math.max(1, Math.round(sec))
  return s >= 60 ? `${Math.floor(s / 60)} min ${String(s % 60).padStart(2, '0')} s` : `${s} s`
}

export function ExportSheet({ onClose, previewCanvas }: { onClose: () => void; previewCanvas: HTMLCanvasElement | null }) {
  const { t } = useTranslation('capture')
  const project = useClipStudioStore((s) => s.project)
  const output = useClipStudioStore((s) => s.output)
  const hasSound = useClipStudioStore((s) => !!s.sound)
  const duration = projectDuration(project)

  const [stage, setStage] = useState<Stage>('settings')
  const [settings, setSettings] = useState<ExportSettings>(lastExportSettings)
  const [name, setName] = useState(() => defaultName(output.preset))
  const rights = needsRightsWarning(project.audio)
  const hasMusic = project.audio.kind === 'builtin' || (project.audio.kind === 'user' && hasSound)
  // A viral sound starts OFF: the in-app sound is both safer and better for reach.
  const [withMusic, setWithMusic] = useState(hasMusic && !rights)
  const [progress, setProgress] = useState(0)
  const [result, setResult] = useState<{ blob: Blob; file: string; seconds: number } | null>(null)
  const [thumb, setThumb] = useState<string | null>(null)
  const abort = useRef<AbortController | null>(null)
  const started = useRef(0)
  const liveRef = useRef<HTMLCanvasElement>(null)

  const size = exportSize(output, settings.resolution)
  const bytes = estimateBytes(size, settings, duration, withMusic && hasMusic)
  const eta = estimateExportSec(size, settings, duration)
  const set = (p: Partial<ExportSettings>) => setSettings((s) => ({ ...s, ...p }))

  // The cover: the frame under the playhead, as the preview shows it.
  useEffect(() => {
    try { setThumb(previewCanvas?.toDataURL('image/jpeg', 0.8) ?? null) } catch { setThumb(null) }
  }, [previewCanvas])

  // Esc closes the sheet (and cancels a running export).
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key !== 'Escape') return
      e.stopImmediatePropagation()
      if (stage === 'export') abort.current?.abort()
      else onClose()
    }
    window.addEventListener('keydown', onKey, true)
    return () => window.removeEventListener('keydown', onKey, true)
  }, [stage, onClose])

  const start = async () => {
    rememberExportSettings(settings)
    const ctrl = new AbortController()
    abort.current = ctrl
    started.current = performance.now()
    setProgress(0)
    setStage('export')
    try {
      const blob = await exportStudio(ctrl.signal, t('studio.exporting', { percent: 0 }), {
        withMusic: withMusic && hasMusic,
        settings,
        onProgress: setProgress,
        onPreview: (canvas) => {
          const live = liveRef.current
          const ctx = live?.getContext('2d')
          if (live && ctx) ctx.drawImage(canvas, 0, 0, live.width, live.height)
        },
      })
      const ext = blob.type.includes('webm') ? 'webm' : 'mp4'
      const file = `${(name.trim() || defaultName(output.preset)).replace(/[\\/:*?"<>|]+/g, '-')}.${ext}`
      // Saved at once, like CapCut: the sharing options come after.
      downloadBlob(blob, file)
      setResult({ blob, file, seconds: (performance.now() - started.current) / 1000 })
      setStage('done')
    } catch (e) {
      if (e instanceof DOMException && e.name === 'AbortError') { setStage('settings'); return }
      toast(t('studio.exportFailed', { reason: e instanceof Error ? e.message : String(e) }), 'error')
      setStage('settings')
    } finally {
      abort.current = null
    }
  }

  const shareFile = useMemo(() => (result ? new File([result.blob], result.file, { type: result.blob.type }) : null), [result])
  const canShare = !!shareFile && typeof navigator.canShare === 'function' && navigator.canShare({ files: [shareFile] })
  const share = async () => {
    if (!shareFile) return
    try { await navigator.share({ files: [shareFile], title: result?.file }) } catch { /* dismissed */ }
  }

  const elapsed = stage === 'export' ? (performance.now() - started.current) / 1000 : 0
  const left = progress > 0.04 && elapsed > 1 ? (elapsed / progress) * (1 - progress) : null
  const inApp = !!project.audio.link && !!project.audio.music && !(withMusic && hasMusic && project.audio.kind === 'user')
  const aspect = `${output.width} / ${output.height}`

  return (
    <div className="studio-export-backdrop" role="presentation" onClick={(e) => { if (e.target === e.currentTarget && stage !== 'export') onClose() }}>
      <section className="studio-export" role="dialog" aria-modal="true" aria-labelledby="studio-export-title">
        <header className="flex items-center justify-between">
          <h3 id="studio-export-title" className="text-[15px] font-semibold">
            {stage === 'done' ? t('studio.export2.doneTitle') : stage === 'export' ? t('studio.export2.exportingTitle') : t('studio.export')}
          </h3>
          {stage !== 'export' && (
            <button type="button" className="studio-icon-btn" onClick={onClose} aria-label={t('studio.close')}><Icons.X size={15} /></button>
          )}
        </header>

        <div className="flex gap-4">
          {/* Cover / live frames */}
          <div className="studio-export-cover" style={{ aspectRatio: aspect }}>
            {stage === 'export' ? (
              <canvas ref={liveRef} width={216} height={Math.round((216 * output.height) / output.width)} className="h-full w-full" />
            ) : thumb ? (
              <img src={thumb} alt="" className="h-full w-full object-cover" />
            ) : null}
            {stage === 'done' && <span className="studio-export-check" aria-hidden="true">✓</span>}
          </div>

          <div className="flex min-w-0 flex-1 flex-col gap-3">
            {stage === 'settings' && (
              <>
                <Row label={t('studio.export2.resolution')}>
                  {EXPORT_RESOLUTIONS.map((r) => (
                    <button key={r} type="button" className="studio-chip" aria-pressed={settings.resolution === r} onClick={() => set({ resolution: r })}>
                      {r === 1440 ? '2K' : `${r}p`}
                    </button>
                  ))}
                </Row>
                <Row label={t('studio.export2.fps')}>
                  {EXPORT_FPS.map((f) => (
                    <button key={f} type="button" className="studio-chip" aria-pressed={settings.fps === f} onClick={() => set({ fps: f })}>{f}</button>
                  ))}
                </Row>
                <Row label={t('studio.export2.quality')}>
                  {EXPORT_QUALITIES.map((q) => (
                    <button key={q} type="button" className="studio-chip" aria-pressed={settings.quality === q} onClick={() => set({ quality: q })}>{t(`studio.export2.q.${q}`)}</button>
                  ))}
                </Row>
                <p className="text-[11.5px] text-[var(--text-dim)]">
                  {size.width}×{size.height} · {duration.toFixed(1)} s · ~{formatBytes(bytes)}
                  {eta !== null && ` · ${t('studio.export2.eta', { time: formatDuration(eta) })}`}
                </p>
                {settings.resolution === 720 && <p className="-mt-2 text-[11px] text-[var(--text-faint)]">{t('studio.export2.fastHint')}</p>}

                {hasMusic && (
                  <label className="flex items-start gap-2 text-[12px]">
                    <input type="checkbox" className="mt-0.5" checked={withMusic} onChange={(e) => setWithMusic(e.target.checked)} />
                    <span>
                      {t('studio.export2.withMusic')}
                      {rights && <span className="mt-0.5 block text-[11px] leading-relaxed text-[var(--warn)]">⚠ {t('studio.export2.rightsNote')}</span>}
                    </span>
                  </label>
                )}

                <label className="flex flex-col gap-1 text-[11.5px] text-[var(--text-dim)]">
                  {t('studio.export2.name')}
                  <input className="studio-input" value={name} onChange={(e) => setName(e.target.value)} spellCheck={false} />
                </label>
              </>
            )}

            {stage === 'export' && (
              <div className="flex flex-1 flex-col justify-center gap-3">
                <p className="text-[28px] font-semibold tabular-nums">{Math.round(progress * 100)}%</p>
                <div className="h-1.5 w-full overflow-hidden rounded-full bg-[var(--border)]">
                  <div className="h-full bg-[var(--accent)] transition-[width]" style={{ width: `${Math.round(progress * 100)}%` }} />
                </div>
                <p className="text-[12px] text-[var(--text-dim)]">
                  {left !== null ? t('studio.export2.left', { time: formatDuration(left) }) : t('studio.export2.starting')}
                </p>
                <p className="text-[11px] text-[var(--text-faint)]">{t('studio.export2.keepOpen')}</p>
              </div>
            )}

            {stage === 'done' && result && (
              <div className="flex flex-col gap-2">
                <p className="text-[12px] text-[var(--text-dim)]">
                  {t('studio.export2.saved', { file: result.file, size: formatBytes(result.blob.size), time: formatDuration(result.seconds) })}
                </p>
                {inApp && project.audio.music && (
                  <p className="rounded-lg bg-[color-mix(in_srgb,var(--ok)_14%,transparent)] p-2 text-[11.5px] leading-relaxed">
                    {t('studio.tiktok.howTo', { start: formatStart(project.audio.offsetSec), bpm: Math.round(project.audio.music.bpm) })}
                  </p>
                )}
              </div>
            )}
          </div>
        </div>

        <footer className="flex flex-wrap justify-end gap-2">
          {stage === 'settings' && (
            <button type="button" className="studio-btn studio-btn--accent h-11 min-w-[160px] justify-center text-[14px]" onClick={() => void start()} disabled={duration <= 0}>
              <Icons.Download size={15} aria-hidden="true" /> {t('studio.export')}
            </button>
          )}
          {stage === 'export' && (
            <button type="button" className="studio-btn" onClick={() => abort.current?.abort()}>{t('studio.cancel')}</button>
          )}
          {stage === 'done' && result && (
            <>
              <button type="button" className="studio-btn" onClick={() => downloadBlob(result.blob, result.file)}>{t('studio.export2.saveAgain')}</button>
              <a className="studio-btn" href="https://www.tiktok.com/upload" target="_blank" rel="noopener noreferrer">{t('studio.export2.openTiktok')}</a>
              {canShare && <button type="button" className="studio-btn" onClick={() => void share()}>{t('studio.export2.share')}</button>}
              <button type="button" className="studio-btn studio-btn--accent min-w-[120px] justify-center" onClick={onClose}>{t('studio.export2.done')}</button>
            </>
          )}
        </footer>
      </section>
    </div>
  )
}

function Row({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div className="flex flex-col gap-1">
      <span className="text-[11.5px] text-[var(--text-dim)]">{label}</span>
      <div className="flex flex-wrap gap-1">{children}</div>
    </div>
  )
}
