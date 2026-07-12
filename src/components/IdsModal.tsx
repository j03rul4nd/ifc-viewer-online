// ─── IdsModal ─────────────────────────────────────────────────────────────────
// Loader/runner for IDS checks (P5-1 slimmed it): pick a buildingSMART .ids
// file, run it against the active model, see the score — results live in the
// docked IdsPanel ("View results").

import React, { useEffect, useMemo, useState } from 'react'
import { createPortal } from 'react-dom'
import { motion, AnimatePresence } from 'framer-motion'
import { useTranslation } from 'react-i18next'
import * as Icons from './Icons'
import { useSceneStore } from '../stores/sceneStore'
import { useIdsStore } from '../stores/idsStore'
import { useUIStore } from '../stores/uiStore'
import { modelRegistry } from '../lib/model-registry'
import { parseIds, IdsParseError } from '../lib/ids/ids-parser'
import { IDS_EXAMPLES, type IdsExample } from '../lib/ids/ids-examples'
import { useIdsRun } from '../hooks/useIdsRun'
import { useEirStore } from '../stores/eirStore'
import { trackIdsFileLoaded } from '../lib/analytics'
import { toast } from '../stores/toastStore'
import { ComplianceDonut } from './ids/ComplianceDonut'
import { idsElementStats } from '../lib/ids/ids-stats'
import { weightedCompliance } from '../lib/eir'
import { SCORE_COLOR } from './ids/score'
import { idsResultToSharePayload } from '../lib/ids/ids-share'
import { buildShareUrl } from '../lib/share-report'
import SavedRulesetPicker from './pro/SavedRulesetPicker'

interface IdsModalProps {
  onClose: () => void
}

export default function IdsModal({ onClose }: IdsModalProps) {
  const { t } = useTranslation('ids')
  const { t: te } = useTranslation('eir')
  const activeModelId = useSceneStore((s) => s.activeModelId)
  const models = useSceneStore((s) => s.models)
  const {
    fileName, doc, status, progress, progressPhase, error,
    setLoaded, setError, reset, setPanelOpen,
  } = useIdsStore()

  const modelId = activeModelId ?? models[0]?.id ?? null
  // Per-model results: stable refs out of the records (selector footgun, validationStore.ts:428).
  const result = useIdsStore((s) => (modelId ? s.resultsByModel[modelId] ?? null : null))
  const runMeta = useIdsStore((s) => (modelId ? s.runMetaByModel[modelId] ?? null : null))
  const hasBuffer = useMemo(() => (modelId ? !!modelRegistry.getBuffer(modelId) : false), [modelId, models])
  const busy = status === 'running' || status === 'cancelling'
  const { run, cancel } = useIdsRun()

  // Raw .ids XML kept locally so it can be synced to the account (the store only
  // holds the parsed doc). Set on load, cleared on reset.
  const [rawXml, setRawXml] = useState<string | null>(null)

  useEffect(() => {
    const handler = (e: KeyboardEvent): void => { if (e.key === 'Escape') onClose() }
    document.addEventListener('keydown', handler)
    return () => document.removeEventListener('keydown', handler)
  }, [onClose])

  const onFile = async (file: File): Promise<void> => {
    try {
      const xml = await file.text()
      const parsed = parseIds(xml)
      setLoaded(file.name, parsed)
      setRawXml(xml)
      const facetKinds = new Set<string>()
      for (const s of parsed.specifications) {
        for (const f of s.applicability) facetKinds.add(f.kind)
        for (const r of s.requirements) facetKinds.add(r.facet.kind)
      }
      trackIdsFileLoaded({ spec_count: parsed.specifications.length, facet_count: facetKinds.size })
    } catch (err) {
      const msg = err instanceof IdsParseError ? err.message : (err instanceof Error ? err.message : String(err))
      setError('parse', t('loader.parseError', { message: msg }))
      toast(t('loader.invalidFile', { message: msg }), 'error')
    }
  }

  // Load a bundled sample IDS (for users without their own .ids). Parsing a
  // trusted in-repo string can't realistically throw, but stay defensive.
  const loadExample = (ex: IdsExample): void => {
    try {
      const parsed = parseIds(ex.xml)
      setLoaded(ex.fileName, parsed)
      setRawXml(ex.xml)
      const facetKinds = new Set<string>()
      for (const s of parsed.specifications) {
        for (const f of s.applicability) facetKinds.add(f.kind)
        for (const r of s.requirements) facetKinds.add(r.facet.kind)
      }
      trackIdsFileLoaded({ spec_count: parsed.specifications.length, facet_count: facetKinds.size })
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err)
      setError('parse', t('loader.parseError', { message: msg }))
    }
  }

  const viewResults = (): void => {
    // The bottom slot is shared with the ValidationPanel — the two are exclusive.
    useUIStore.getState().setValidationPanelOpen(false)
    setPanelOpen(true)
    onClose()
  }

  // Build a public, crawlable link to these results (same /r?d= report the
  // validator uses) and share it — native share sheet if available, else copy.
  const shareReport = async (): Promise<void> => {
    if (!result) return
    const payload = idsResultToSharePayload(result, fileName ?? 'model.ifc')
    const reportBase = import.meta.env.VITE_REPORT_URL as string | undefined
    const appBase = `${window.location.origin}${window.location.pathname}`
    const { url } = buildShareUrl(payload, reportBase, appBase)
    try {
      if (typeof navigator !== 'undefined' && navigator.share) {
        await navigator.share({ title: te('share.title'), url })
        return
      }
      if (navigator.clipboard?.writeText) {
        await navigator.clipboard.writeText(url)
        toast(te('share.copied'), 'success')
        return
      }
      throw new Error('no share method')
    } catch (err) {
      if (err instanceof DOMException && err.name === 'AbortError') return // user cancelled
      toast(te('share.failed'), 'error')
    }
  }

  return createPortal(
    <AnimatePresence>
      {/* Full-viewport flex container centers the modal. Centering is done here
          (flex) — not via translate on the panel — because framer-motion writes
          an inline transform for the scale/y animation that would clobber a
          `-translate-x/y-1/2`. Portaled to <body> so `fixed` resolves to the
          viewport even when an ancestor has a transform. */}
      <div className="fixed inset-0 z-[70] flex items-center justify-center p-4">
        <motion.div
          key="ids-backdrop"
          initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}
          transition={{ duration: 0.15 }}
          className="absolute inset-0 bg-black/50 backdrop-blur-sm"
          onClick={onClose}
        />
        <motion.div
          key="ids-panel"
          initial={{ opacity: 0, scale: 0.96, y: -8 }} animate={{ opacity: 1, scale: 1, y: 0 }} exit={{ opacity: 0, scale: 0.96, y: -8 }}
          transition={{ duration: 0.18 }}
          className="relative z-[71] w-[560px] max-w-[calc(100vw-2rem)] rounded-2xl bg-[rgba(12,12,16,0.97)] backdrop-blur-[20px] border border-[var(--border-strong)] shadow-[0_24px_64px_rgba(0,0,0,0.6)] overflow-hidden flex flex-col"
          style={{ maxHeight: 'calc(100dvh - 4rem)' }}
          onClick={(e) => e.stopPropagation()}
        >
        {/* Header */}
        <div className="flex items-center justify-between px-4 py-3 border-b border-[var(--border)]">
          <div className="flex items-center gap-2">
            <Icons.Shield size={15} className="text-[var(--accent)]" />
            <span className="text-[13px] font-semibold text-[var(--text)]">{t('title')}</span>
            <span className="text-[10px] text-[var(--text-muted)] bg-[rgba(255,255,255,0.06)] px-1.5 py-0.5 rounded-full">
              {t('subtitle')}
            </span>
          </div>
          <button onClick={onClose} className="w-6 h-6 flex items-center justify-center text-[var(--text-muted)] hover:text-[var(--text)] transition-colors" aria-label="Close">
            <svg width="10" height="10" viewBox="0 0 10 10" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round"><path d="M1 1l8 8M9 1L1 9" /></svg>
          </button>
        </div>

        <div className="overflow-y-auto flex-1 px-4 py-4 flex flex-col gap-3">
          {/* Load + run row */}
          <div className="flex items-center gap-2 flex-wrap">
            <label className={`inline-flex items-center gap-2 h-9 px-3 rounded-lg bg-[var(--surface-2)] border border-[var(--border)] text-[12px] text-[var(--text-dim)] transition-colors ${busy ? 'opacity-40 pointer-events-none' : 'cursor-pointer hover:text-[var(--text)]'}`}>
              <Icons.Upload size={14} />
              {fileName ? fileName : t('loader.choose')}
              <input type="file" accept=".ids,.xml,application/xml,text/xml" className="hidden" disabled={busy}
                onChange={(e) => { const f = e.target.files?.[0]; if (f) void onFile(f) }} />
            </label>
            <button
              onClick={() => void run()}
              disabled={!doc || !hasBuffer || busy}
              className="inline-flex items-center gap-1.5 h-9 px-4 rounded-lg bg-[var(--accent)] text-white text-[12px] font-medium disabled:opacity-40 hover:brightness-110 transition-all"
            >
              {busy ? t('run.checking') : result ? t('run.rerun') : t('run.run')}
            </button>
            {doc && <span className="text-[11px] text-[var(--text-faint)]">{t('loader.specCount', { count: doc.specifications.length })}</span>}
            {(fileName || result) && !busy && (
              <button onClick={() => { reset(); setRawXml(null) }} className="ml-auto text-[11px] text-[var(--text-faint)] hover:text-[var(--text)]">{t('loader.clear')}</button>
            )}
          </div>

          {/* EIR / BIM Validation — editable rule profiles that compile to the same engine */}
          <button
            onClick={() => { useEirStore.getState().setEditorOpen(true); onClose() }}
            className="flex items-center gap-2 h-9 px-3 rounded-lg bg-[var(--surface-2)] border border-[var(--border)] text-[12px] text-[var(--text-dim)] hover:text-[var(--text)] transition-colors self-start"
          >
            <Icons.Shield size={14} />
            {te('openButton')}
          </button>

          {/* Sample IDS — for users without their own .ids file */}
          {!busy && (
            <div className="flex flex-col gap-1.5">
              <span className="text-[10.5px] text-[var(--text-faint)]">{t('examples.label')}</span>
              <div className="flex flex-wrap gap-1.5">
                {IDS_EXAMPLES.map((ex) => {
                  const active = fileName === ex.fileName
                  return (
                    <button
                      key={ex.id}
                      onClick={() => loadExample(ex)}
                      title={t(`examples.${ex.labelKey}Desc` as 'examples.hasWallsDesc')}
                      className={`h-7 px-2.5 rounded-md border text-[11px] transition-colors ${active ? 'border-[var(--accent)] text-[var(--accent)]' : 'border-[var(--border)] text-[var(--text-dim)] hover:text-[var(--text)]'}`}
                    >
                      {t(`examples.${ex.labelKey}Name` as 'examples.hasWallsName')}
                    </button>
                  )
                })}
              </div>
            </div>
          )}

          {/* Cloud sync (F2 P6) — renders nothing when accounts are off */}
          <SavedRulesetPicker
            kind="ids_spec"
            serializeCurrent={() => (rawXml && fileName ? { name: fileName, content: rawXml } : null)}
            onLoad={(content, name) => {
              try {
                const parsed = parseIds(content)
                setLoaded(name, parsed)
                setRawXml(content)
              } catch (err) {
                const msg = err instanceof IdsParseError ? err.message : (err instanceof Error ? err.message : String(err))
                setError('parse', t('loader.parseError', { message: msg }))
                toast(t('loader.invalidFile', { message: msg }), 'error')
              }
            }}
          />

          {/* Parse warnings (e.g. unsupported XSD patterns) */}
          {doc?.warnings?.length ? (
            <div className="text-[10.5px] leading-relaxed m-0" style={{ color: '#F5A623' }}>
              {doc.warnings.map((w, i) => <p key={i} className="m-0">{w}</p>)}
            </div>
          ) : null}

          {/* Stale-result honesty banner (§5.4): results from a previously loaded IDS. */}
          {result && runMeta && fileName && runMeta.idsFileName !== fileName && !busy && (
            <p className="text-[11px] m-0" style={{ color: '#F5A623' }}>
              {t('states.staleIds', { file: runMeta.idsFileName })}
            </p>
          )}

          {!hasBuffer && modelId && (
            <p className="text-[11px] m-0" style={{ color: '#F5A623' }}>{t('states.bufferUnavailable')}</p>
          )}
          {error && <p className="text-[11.5px] text-[var(--danger)] m-0">{error.message}</p>}

          {/* Progress + cancel (worker protocol v2) */}
          {busy && (
            <div className="flex items-center gap-3 px-3 py-2.5 rounded-lg bg-[var(--surface)] border border-[var(--border)]">
              <div className="flex-1 min-w-0">
                <div className="flex items-center justify-between mb-1.5">
                  <span className="text-[10.5px] text-[var(--text-faint)]">{t(`progress.${progressPhase ?? 'open'}`)}</span>
                  <span className="text-[10.5px] font-mono text-[var(--text-faint)]">{Math.round(progress)}%</span>
                </div>
                <div className="h-1 rounded-full bg-[var(--surface-2)] overflow-hidden">
                  <div
                    className="h-full rounded-full bg-[var(--accent)] transition-[width] duration-150"
                    style={{ width: `${Math.max(2, progress)}%` }}
                  />
                </div>
              </div>
              <button
                onClick={cancel}
                disabled={status === 'cancelling'}
                className="shrink-0 h-7 px-2.5 rounded-md border border-[var(--border)] text-[11px] text-[var(--text-dim)] hover:text-[var(--text)] disabled:opacity-40 transition-colors"
              >
                {status === 'cancelling' ? t('run.cancelling') : t('run.cancel')}
              </button>
            </div>
          )}

          {/* Summary → results live in the docked panel */}
          {result && (
            <div className="flex items-center gap-3 px-3 py-2.5 rounded-lg bg-[var(--surface)] border border-[var(--border)]">
              <ComplianceDonut score={result.score} passed={result.passedSpecs} failed={result.failedSpecs} na={result.naSpecs} size={48} />
              <span className="text-[11px] text-[var(--text-faint)]">{t('summary.outOf')}</span>
              <div className="h-6 w-px bg-[var(--border)]" />
              <span className="text-[12px] text-[var(--ok)]">{t('summary.pass', { count: result.passedSpecs })}</span>
              <span className="text-[12px] text-[var(--danger)]">{t('summary.fail', { count: result.failedSpecs })}</span>
              {result.naSpecs > 0 && <span className="text-[12px] text-[var(--text-faint)]">{t('summary.na', { count: result.naSpecs })}</span>}
              {(() => {
                const w = weightedCompliance(result)
                return w != null ? (
                  <span className="text-[11px] font-mono px-1.5 py-0.5 rounded-full border" style={{ color: SCORE_COLOR(w), borderColor: 'var(--border)' }} title={te('weightedHint')}>
                    {te('weighted', { score: w })}
                  </span>
                ) : null
              })()}
              <button
                onClick={() => void shareReport()}
                title={te('share.hint')}
                className="ml-auto h-7 px-3 rounded-md border border-[var(--border)] text-[11px] text-[var(--text-dim)] hover:text-[var(--text)] transition-colors"
              >
                {te('share.button')}
              </button>
              <button
                onClick={viewResults}
                className="h-7 px-3 rounded-md bg-[var(--accent)] text-white text-[11px] font-medium hover:brightness-110 transition-all"
              >
                {t('loader.viewResults')}
              </button>
            </div>
          )}

          {/* Element-level statistics (Total/Validated/Passed/Failed) */}
          {result && (() => {
            const st = idsElementStats(result)
            return (
              <div className="flex items-center flex-wrap gap-x-4 gap-y-1 px-3 py-1.5 text-[11px] text-[var(--text-dim)]">
                <span><b className="font-mono text-[var(--text)]">{st.validated}</b> {te('stats.validated')}</span>
                <span className="text-[var(--ok)]"><b className="font-mono">{st.passed}</b> {te('stats.passed')}</span>
                <span className="text-[var(--danger)]"><b className="font-mono">{st.failed}</b> {te('stats.failed')}</span>
                <span><b className="font-mono text-[var(--text)]">{st.failingElements}</b> {te('stats.failingElements')}</span>
              </div>
            )
          })()}

          {!doc && !result && (
            <div className="px-3 py-6 rounded-lg border border-dashed border-[var(--border)] text-[11.5px] text-[var(--text-faint)] text-center leading-relaxed">
              {t('loader.intro')}
              <br />{t('loader.introClient')}
            </div>
          )}
        </div>
        </motion.div>
      </div>
    </AnimatePresence>,
    document.body,
  )
}
