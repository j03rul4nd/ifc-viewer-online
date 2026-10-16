// ─── MeasureSession ───────────────────────────────────────────────────────────
// Measurements that outlive the tab:
//
//   SAVE / OPEN  The list as a .json file (lib/measure/measure-file) — with its
//                requirements, heights and notes — to reopen tomorrow or hand
//                to someone who has the same models. Opening adds to the list;
//                models in the file that are not loaded are named in a warning.
//   LAST SESSION Kept in this browser per set of loaded models. When the panel
//                opens on those models with an empty list, a bar offers them
//                back; nothing is restored without the click.
//
// Browser storage only (never sent anywhere), wrapped in try/catch: a private
// window simply has no last session.

import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { useTranslation } from 'react-i18next'
import type { MeasureSystem } from '../../lib/measure/measure-system'
import type { MeasureItem } from '../../lib/measure/measure-types'
import { missingModels, modelSetKey, parseMeasurements, serializeMeasurements, type SavedMeasurement } from '../../lib/measure/measure-file'
import { shareOrDownload } from '../../lib/share-file'
import { useModelStore } from '../../stores/modelStore'

const STORAGE_PREFIX = 'pv.measure.session:'

function readSession(key: string): SavedMeasurement[] | null {
  try {
    const raw = localStorage.getItem(STORAGE_PREFIX + key)
    if (!raw) return null
    const r = parseMeasurements(raw)
    return r.ok && r.file.measurements.length ? r.file.measurements : null
  } catch { return null }
}

export function useLoadedModelNames(): string[] {
  const models = useModelStore((s) => s.models)
  return useMemo(() => Object.values(models).map((m) => m.modelInfo.fileName).filter(Boolean), [models])
}

/**
 * Keeps the last session of these models in localStorage, debounced. An empty
 * list only erases it when it held items before — a fresh load starts empty,
 * and that must not wipe the session it is about to offer back.
 */
export function useMeasureAutosave(items: readonly MeasureItem[] | undefined, modelNames: readonly string[]): void {
  const key = modelSetKey(modelNames)
  const hadItems = useRef(false)
  useEffect(() => { hadItems.current = false }, [key])
  useEffect(() => {
    if (!items || !key) return
    if (items.length === 0 && !hadItems.current) return
    hadItems.current = items.length > 0
    const id = setTimeout(() => {
      try {
        if (items.length === 0) localStorage.removeItem(STORAGE_PREFIX + key)
        else localStorage.setItem(STORAGE_PREFIX + key, serializeMeasurements(items, modelNames))
      } catch { /* storage full or blocked: the session is simply not kept */ }
    }, 600)
    return () => clearTimeout(id)
  }, [items, key, modelNames])
}

export function MeasureSession({ system, items, modelNames, onFlash, touch }: {
  system: MeasureSystem | null
  items: readonly MeasureItem[]
  modelNames: readonly string[]
  onFlash(message: string): void
  touch?: boolean
}) {
  const { t } = useTranslation('measurement')
  const key = modelSetKey(modelNames)
  const [offer, setOffer] = useState<SavedMeasurement[] | null>(null)
  const [warning, setWarning] = useState<string | null>(null)
  const fileRef = useRef<HTMLInputElement>(null)

  // Offer the last session once per model set, only onto an empty list.
  const offeredFor = useRef<string | null>(null)
  useEffect(() => {
    if (!key || offeredFor.current === key) return
    offeredFor.current = key
    setOffer(items.length === 0 ? readSession(key) : null)
  }, [key, items.length])
  useEffect(() => { if (items.length > 0 && offer) setOffer(null) }, [items.length, offer])

  const restore = () => {
    if (!system || !offer) return
    const n = system.restore(offer)
    setOffer(null)
    onFlash(t('session.restored', { count: n }))
  }

  const save = useCallback(() => {
    if (!items.length) return
    const blob = new Blob([serializeMeasurements(items, modelNames)], { type: 'application/json' })
    const stamp = new Date().toISOString().slice(0, 16).replace(/[-:T]/g, '')
    void shareOrDownload(blob, `${t('export.filename')}-${stamp}.json`)
  }, [items, modelNames, t])

  const open = async (file: File) => {
    if (!system) return
    let raw = ''
    try { raw = await file.text() } catch { setWarning(t('session.error.not-json')); return }
    const r = parseMeasurements(raw)
    if (!r.ok) { setWarning(t(`session.error.${r.error}`)); return }
    const n = system.restore(r.file.measurements)
    const missing = missingModels(r.file.models, modelNames)
    setWarning(missing.length ? t('session.missing', { models: missing.join(', ') }) : r.skipped ? t('session.skipped', { count: r.skipped }) : null)
    onFlash(t('session.opened', { count: n }))
  }

  const btn = ['flex items-center gap-1.5 rounded-[7px] text-[var(--text-dim)] hover:text-[var(--text)] hover:bg-[var(--surface-2)] transition-colors',
    touch ? 'px-3 py-2 text-[12.5px]' : 'px-2 py-1.5 text-[11px]'].join(' ')

  return (
    <div className="shrink-0">
      {offer && (
        <div className="mx-2 my-1.5 rounded-[8px] border border-[rgba(94,106,210,0.45)] bg-[rgba(94,106,210,0.1)] px-2.5 py-2 flex items-center gap-2" role="status">
          <span className={['flex-1 text-[var(--text)]', touch ? 'text-[12.5px]' : 'text-[11px]'].join(' ')}>{t('session.offer', { count: offer.length })}</span>
          <button type="button" onClick={restore} className={['rounded-[6px] font-semibold text-white bg-[var(--accent)] hover:brightness-110', touch ? 'px-3 py-2 text-[12.5px]' : 'px-2 py-1 text-[11px]'].join(' ')}>
            {t('session.restore')}
          </button>
          <button type="button" onClick={() => setOffer(null)} aria-label={t('session.dismiss')} title={t('session.dismiss')}
            className="px-1 text-[var(--text-faint)] hover:text-[var(--text)]">×</button>
        </div>
      )}
      {warning && (
        <div className="mx-2 mb-1 text-[10.5px] leading-snug text-[#FFB224] flex items-start gap-1.5" role="alert">
          <span className="flex-1">{warning}</span>
          <button type="button" onClick={() => setWarning(null)} aria-label={t('session.dismiss')} className="text-[var(--text-faint)] hover:text-[var(--text)]">×</button>
        </div>
      )}
      <div className="flex items-center gap-1 px-1.5">
        <button type="button" className={btn} onClick={() => fileRef.current?.click()} title={t('session.openHint')}>
          <svg width="12" height="12" viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true"><path d="M2 4.5h4l1.5 1.5H14v7.5H2z" /></svg>
          {t('session.open')}
        </button>
        {items.length > 0 && (
          <button type="button" className={btn} onClick={save} title={t('session.saveHint')}>
            <svg width="12" height="12" viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true"><path d="M3 2.5h8l2 2v9H3z" /><path d="M5.5 2.5v3h5v-3M5.5 13.5v-4h5v4" /></svg>
            {t('session.save')}
          </button>
        )}
        <input ref={fileRef} type="file" accept=".json,application/json" className="hidden"
          onChange={(e) => { const f = e.target.files?.[0]; e.target.value = ''; if (f) void open(f) }} />
      </div>
    </div>
  )
}
