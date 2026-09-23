// ─── Clip Studio ───────────────────────────────────────────────────────────────
// A multi-clip editor for social video, CapCut-style: media on the left,
// preview in the middle, inspector on the right, timeline underneath. On a
// tablet or phone the same parts stack — preview, timeline, then a tabbed
// sheet for media and the inspector — because a phone is not a small desktop.
//
// Lazy-loaded; nothing here (or Mediabunny) reaches the main bundle until the
// studio opens.

import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { createPortal } from 'react-dom'
import { useTranslation } from 'react-i18next'
import * as Icons from '../Icons'
import { useClipStudioStore } from '../../stores/clipStudioStore'
import { useCaptureStore } from '../../stores/captureStore'
import { useEditorStore } from '../../stores/editorStore'
import { toast } from '../../stores/toastStore'
import { downloadBlob } from '../../lib/diffStore'
import {
  clipIndexAt, duplicateClip, projectDuration, removeClip, splitAt,
  createMediaOverlay, type EditProject,
} from '../../lib/capture/project'
import { createTextOverlay } from '../../lib/capture/timeline'
import { SHOT_TYPES, type ShotType } from '../../lib/capture/shots'
import { hasWebCodecs } from '../../lib/capture/media-codec'
import { formatBytes } from '../../lib/capture/replay-buffer-core'
import {
  addCaptureBlob, addFiles, addFocusShot, addShot, canRenderShots, exportStudio,
} from '../../lib/capture/studio-actions'
import { usePreviewEngine } from './usePreviewEngine'
import { StudioTimeline } from './StudioTimeline'
import { StudioInspector } from './StudioInspector'
import { StudioDirector, runRecipe, useDirectorLabels } from './StudioDirector'
import './studio.css'

const FRAME = 1 / 30

export default function ClipStudio() {
  const { t, i18n } = useTranslation('capture')
  const open = useClipStudioStore((s) => s.open)
  const close = useClipStudioStore((s) => s.closeStudio)
  const project = useClipStudioStore((s) => s.project)
  const media = useClipStudioStore((s) => s.media)
  const output = useClipStudioStore((s) => s.output)
  const playhead = useClipStudioStore((s) => s.playhead)
  const setPlayhead = useClipStudioStore((s) => s.setPlayhead)
  const selection = useClipStudioStore((s) => s.selection)
  const select = useClipStudioStore((s) => s.select)
  const edit = useClipStudioStore((s) => s.edit)
  const undo = useClipStudioStore((s) => s.undo)
  const redo = useClipStudioStore((s) => s.redo)
  const canUndo = useClipStudioStore((s) => s.past.length > 0)
  const canRedo = useClipStudioStore((s) => s.future.length > 0)
  const job = useClipStudioStore((s) => s.job)
  const capturedClip = useCaptureStore((s) => s.clip)
  const hasSelection = useEditorStore((s) => s.selection.length > 0)

  const canvasRef = useRef<HTMLCanvasElement>(null)
  const fileRef = useRef<HTMLInputElement>(null)
  const abortRef = useRef<AbortController | null>(null)
  const [mobileTab, setMobileTab] = useState<'media' | 'edit'>('media')
  const [safeZones, setSafeZones] = useState(false)
  const duration = projectDuration(project)

  const engine = usePreviewEngine({ canvasRef, project, media, output, playhead, setPlayhead })

  // Preview renders at half the output size: sharp on screen, light to draw.
  const preview = useMemo(() => {
    const scale = Math.min(1, 960 / Math.max(output.width, output.height))
    return { width: Math.round(output.width * scale), height: Math.round(output.height * scale) }
  }, [output.width, output.height])

  // ── Long jobs (render, export) ──────────────────────────────────────────────
  const run = useCallback(async (fn: (signal: AbortSignal) => Promise<void>) => {
    engine.pause()
    const ctrl = new AbortController()
    abortRef.current = ctrl
    try {
      await fn(ctrl.signal)
    } catch (e) {
      if (!(e instanceof DOMException && e.name === 'AbortError')) {
        toast(t('studio.exportFailed', { reason: e instanceof Error ? e.message : String(e) }), 'error')
      }
    } finally {
      abortRef.current = null
    }
  }, [engine, t])

  // A presentation requested from outside (the tour player's "Video" button).
  const pendingRecipe = useClipStudioStore((s) => s.pendingRecipe)
  const directorLabels = useDirectorLabels()
  useEffect(() => {
    if (!open || !pendingRecipe || job) return
    const recipe = useClipStudioStore.getState().takePendingRecipe()
    if (recipe) void run((signal) => runRecipe(recipe, i18n.language, directorLabels, t as never, signal))
  }, [open, pendingRecipe, job, run, i18n.language, directorLabels, t])

  const onAddShot = (type: ShotType) => run((signal) => addShot(type, t(`studio.shots.${type}`), 4, signal))

  const onExport = () => run(async (signal) => {
    const blob = await exportStudio(signal, t('studio.exporting', { percent: 0 }))
    const ext = blob.type.includes('webm') ? 'webm' : 'mp4'
    downloadBlob(blob, `ifc-clip-${output.preset}-${new Date().toISOString().slice(0, 19).replace(/[:T]/g, '-')}.${ext}`)
    toast(t('studio.exportDone', { size: formatBytes(blob.size) }), 'success')
  })

  // ── Editing shortcuts ───────────────────────────────────────────────────────
  const addText = useCallback(() => {
    const text = createTextOverlay({ text: t('editor.text.newCard'), startSec: playhead, style: 'title', anim: 'pop' }, Math.max(duration, 0.5))
    edit((p) => ({ ...p, texts: [...p.texts, text] }))
    select({ kind: 'text', id: text.id })
  }, [duration, edit, playhead, select, t])

  const deleteSelected = useCallback(() => {
    if (!selection) return
    if (selection.kind === 'clip') edit((p) => removeClip(p, selection.id))
    if (selection.kind === 'text') edit((p) => ({ ...p, texts: p.texts.filter((o) => o.id !== selection.id) }))
    if (selection.kind === 'overlay') edit((p) => ({ ...p, overlays: p.overlays.filter((o) => o.id !== selection.id) }))
    select(null)
  }, [edit, select, selection])

  useEffect(() => {
    if (!open) return
    const onKey = (e: KeyboardEvent) => {
      const el = e.target as HTMLElement
      if (el.closest('input, textarea, select, [contenteditable="true"]')) return
      const mod = e.ctrlKey || e.metaKey
      if (mod && e.key.toLowerCase() === 'z') { e.preventDefault(); if (e.shiftKey) redo(); else undo(); return }
      if (mod && e.key.toLowerCase() === 'y') { e.preventDefault(); redo(); return }
      if (mod) return
      switch (e.key) {
        case ' ': e.preventDefault(); engine.toggle(); break
        case 's': case 'S': edit((p) => splitAt(p, playhead)); break
        case 'Delete': case 'Backspace': deleteSelected(); break
        case 'd': case 'D': if (selection?.kind === 'clip') edit((p) => duplicateClip(p, selection.id)); break
        case 't': case 'T': addText(); break
        case 'ArrowLeft': setPlayhead(Math.max(0, playhead - (e.shiftKey ? 1 : FRAME))); break
        case 'ArrowRight': setPlayhead(Math.min(duration, playhead + (e.shiftKey ? 1 : FRAME))); break
        case 'Escape': if (job) abortRef.current?.abort(); else close(); break
        default: return
      }
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [open, engine, edit, playhead, deleteSelected, selection, addText, setPlayhead, duration, undo, redo, job, close])

  const onFiles = async (files: FileList | null) => {
    if (!files?.length) return
    await run(async () => addFiles(files))
  }

  const addOverlayFromSource = (sourceId: string) => {
    const ov = createMediaOverlay(sourceId, playhead, Math.min(3, Math.max(1, duration - playhead)))
    edit((p: EditProject) => ({ ...p, overlays: [...p.overlays, ov] }))
    select({ kind: 'overlay', id: ov.id })
  }

  if (!open) return null
  const webcodecs = hasWebCodecs()
  const shotsOk = canRenderShots()
  const vertical = output.height > output.width

  const mediaBin = (
    <div className="flex flex-col gap-5 p-4">
      <StudioDirector run={run} busy={!!job} canRender={shotsOk} />
      {project.clips.length > 0 && <p className="-mt-3 text-[11px] text-[var(--text-faint)]">{t('studio.autoClipReplace')}</p>}

      <section className="flex flex-col gap-2">
        <h3 className="studio-h">{t('studio.addShot')}</h3>
        <div className="grid grid-cols-2 gap-1.5">
          {SHOT_TYPES.filter((s): s is Exclude<ShotType, 'focus' | 'path'> => s !== 'focus').map((s) => (
            <button key={s} type="button" className="studio-chip justify-center" disabled={!shotsOk || !!job} onClick={() => onAddShot(s)}>
              {t(`studio.shots.${s}`)}
            </button>
          ))}
        </div>
        <button type="button" className="studio-btn" disabled={!shotsOk || !!job || !hasSelection} onClick={() => run((signal) => addFocusShot(t('studio.shots.focus'), 4, signal))}>
          <Icons.Search size={14} aria-hidden="true" /> {t('studio.focusSelection')}
        </button>
        <p className="text-[11px] leading-relaxed text-[var(--text-faint)]">{shotsOk ? (hasSelection ? t('studio.addShotHint') : t('studio.focusHint')) : t('studio.needModel')}</p>
      </section>

      <section className="flex flex-col gap-2">
        <h3 className="studio-h">{t('studio.media')}</h3>
        <button type="button" className="studio-btn" disabled={!!job} onClick={() => fileRef.current?.click()}>
          <Icons.Upload size={14} aria-hidden="true" /> {t('studio.importMedia')}
        </button>
        <input ref={fileRef} type="file" accept="video/*,image/*" multiple hidden onChange={(e) => { void onFiles(e.target.files); e.target.value = '' }} />
        {capturedClip && (
          <button type="button" className="studio-btn" disabled={!!job} onClick={() => run(() => addCaptureBlob(capturedClip.blob, t('editor.preview')))}>
            <Icons.Film size={14} aria-hidden="true" /> {t('studio.addCapture')}
          </button>
        )}
        {project.sources.length > 0 && (
          <ul className="flex flex-col gap-1" role="list">
            {project.sources.map((s) => (
              <li key={s.id} className="studio-source">
                <span className="min-w-0 flex-1 truncate" title={s.label}>{s.label}</span>
                <span className="shrink-0 font-mono text-[10px] text-[var(--text-faint)]">{t('studio.duration', { seconds: s.durationSec.toFixed(1) })}</span>
                <button type="button" className="studio-icon-btn" title={t('studio.addOverlay')} aria-label={`${t('studio.addOverlay')}: ${s.label}`} onClick={() => addOverlayFromSource(s.id)}>
                  <Icons.Layers size={13} aria-hidden="true" />
                </button>
              </li>
            ))}
          </ul>
        )}
      </section>
    </div>
  )

  return createPortal(
    <div className="studio-root lp-studio fixed inset-0 z-[80] flex flex-col bg-[var(--bg)] text-[var(--text)]" role="dialog" aria-modal="true" aria-label={t('studio.title')}>
      {/* Top bar */}
      <header className="flex h-12 shrink-0 items-center gap-2 border-b border-[var(--border)] px-3">
        <button type="button" className="studio-icon-btn" onClick={close} aria-label={t('studio.close')}><Icons.X size={16} /></button>
        <h2 className="text-[14px] font-semibold tracking-tight">{t('studio.title')}</h2>
        <div className="ml-2 hidden items-center gap-1 sm:flex">
          <button type="button" className="studio-icon-btn" disabled={!canUndo} onClick={undo} aria-label={t('studio.undo')} title={t('studio.undo')}><Icons.StepBack size={14} /></button>
          <button type="button" className="studio-icon-btn" disabled={!canRedo} onClick={redo} aria-label={t('studio.redo')} title={t('studio.redo')}><Icons.StepFwd size={14} /></button>
        </div>
        <span className="ml-auto hidden text-[11px] text-[var(--text-faint)] lg:inline">{t('studio.shortcuts')}</span>
        <button type="button" className="studio-btn studio-btn--accent ml-auto lg:ml-3" disabled={!webcodecs || duration <= 0 || !!job} onClick={onExport}>
          <Icons.Download size={14} aria-hidden="true" /> {t('studio.export')}
        </button>
      </header>

      {!webcodecs && <p className="bg-[color-mix(in_srgb,var(--warn)_18%,transparent)] px-4 py-2 text-[12px]">{t('studio.noCodec')}</p>}

      <div className="studio-body min-h-0 flex-1">
        <aside className="studio-bin hidden overflow-y-auto border-r border-[var(--border)] lg:block">{mediaBin}</aside>

        {/* Preview */}
        <main className="studio-stage flex min-h-0 min-w-0 flex-col">
          <div className="relative flex min-h-0 flex-1 items-center justify-center p-3">
            <div className="studio-canvas-wrap relative" style={{ aspectRatio: `${output.width} / ${output.height}` }}>
              <canvas ref={canvasRef} width={preview.width} height={preview.height} className="block h-full w-full rounded-lg bg-black" onClick={() => engine.toggle()} />
              {safeZones && vertical && (output.preset === 'reel' || output.preset === 'tiktok') && (
                <div className="studio-safe pointer-events-none absolute inset-0" aria-hidden="true">
                  <span className="studio-safe__top" /><span className="studio-safe__bottom" /><span className="studio-safe__right" />
                </div>
              )}
              {project.clips.length === 0 && !job && (
                <div className="absolute inset-0 flex flex-col items-center justify-center gap-2 p-6 text-center">
                  <p className="text-[14px] font-semibold">{t('studio.empty')}</p>
                  <p className="max-w-[280px] text-[12px] text-[var(--text-faint)]">{t('studio.emptyHint')}</p>
                </div>
              )}
              {job && (
                <div className="absolute inset-0 flex flex-col items-center justify-center gap-3 rounded-lg bg-black/70 p-6 text-center text-white">
                  <p className="text-[13px] font-medium">{job.label.replace(/\d+%$/, '')}{job.progress !== null && ` ${Math.round(job.progress * 100)}%`}</p>
                  <div className="h-1.5 w-48 overflow-hidden rounded-full bg-white/20">
                    <div className="h-full bg-white transition-[width]" style={{ width: `${Math.round((job.progress ?? 0) * 100)}%` }} />
                  </div>
                  <button type="button" className="studio-btn" onClick={() => abortRef.current?.abort()}>{t('studio.cancel')}</button>
                </div>
              )}
            </div>
          </div>

          {/* Transport */}
          <div className="flex items-center justify-center gap-1.5 px-3 pb-2">
            <button type="button" className="studio-icon-btn" onClick={() => setPlayhead(0)} aria-label={t('editor.transport.toStart')}><Icons.SkipStart size={14} /></button>
            <button type="button" className="studio-icon-btn" onClick={() => setPlayhead(Math.max(0, playhead - FRAME))} aria-label={t('editor.transport.stepBack')}><Icons.StepBack size={14} /></button>
            <button type="button" className="studio-play" onClick={() => engine.toggle()} aria-label={engine.playing ? t('studio.pause') : t('studio.play')} disabled={duration <= 0}>
              {engine.playing ? <Icons.Pause size={16} /> : <Icons.Play size={16} />}
            </button>
            <button type="button" className="studio-icon-btn" onClick={() => setPlayhead(Math.min(duration, playhead + FRAME))} aria-label={t('editor.transport.stepFwd')}><Icons.StepFwd size={14} /></button>
            <span className="mx-1 h-5 w-px bg-[var(--border)]" aria-hidden="true" />
            <button type="button" className="studio-icon-btn" onClick={() => edit((p) => splitAt(p, playhead))} disabled={clipIndexAt(project, playhead) < 0} aria-label={t('studio.split')} title={t('studio.split')}><Icons.Ruler size={14} /></button>
            <button type="button" className="studio-icon-btn" onClick={addText} disabled={duration <= 0} aria-label={t('studio.addText')} title={t('studio.addText')}><Icons.TypeTool size={14} /></button>
            <button type="button" className="studio-icon-btn" onClick={() => selection?.kind === 'clip' && edit((p) => duplicateClip(p, selection.id))} disabled={selection?.kind !== 'clip'} aria-label={t('studio.duplicate')} title={t('studio.duplicate')}><Icons.Copy size={14} /></button>
            <button type="button" className="studio-icon-btn" onClick={deleteSelected} disabled={!selection} aria-label={t('studio.delete')} title={t('studio.delete')}><Icons.Trash size={14} /></button>
            {vertical && (
              <button type="button" className="studio-icon-btn" aria-pressed={safeZones} onClick={() => setSafeZones((v) => !v)} aria-label={t('studio.safeZone')} title={t('studio.safeZoneHint')}><Icons.Eye size={14} /></button>
            )}
          </div>
        </main>

        <aside className="studio-side hidden overflow-y-auto border-l border-[var(--border)] lg:block"><StudioInspector /></aside>
      </div>

      <StudioTimeline onSeek={(tt) => { engine.pause(); setPlayhead(tt) }} />

      {/* Tablet / phone: media and inspector as tabs under the timeline */}
      <div className="studio-sheet flex flex-col border-t border-[var(--border)] lg:hidden">
        <div className="flex" role="tablist">
          {(['media', 'edit'] as const).map((tab) => (
            <button key={tab} type="button" role="tab" aria-selected={mobileTab === tab} className="studio-tab flex-1" onClick={() => setMobileTab(tab)}>
              {tab === 'media' ? t('studio.media') : selection ? t(`studio.${selection.kind === 'clip' ? 'clip' : selection.kind === 'text' ? 'text' : 'overlay'}`) : t('studio.project')}
            </button>
          ))}
        </div>
        <div className="max-h-[38dvh] overflow-y-auto">{mobileTab === 'media' ? mediaBin : <StudioInspector />}</div>
      </div>
    </div>,
    document.body,
  )
}
