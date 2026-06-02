// ─── DemoGallery ──────────────────────────────────────────────────────────────
// A modal gallery for picking one of the curated demo IFC models. Downloads the
// chosen model (with a live progress bar) and hands the resulting File to the
// parent, which switches to the viewer and runs the normal load pipeline.

import { useEffect, useMemo, useRef, useState } from 'react'
import { motion, AnimatePresence } from 'framer-motion'
import { useTranslation } from 'react-i18next'
import * as Icons from './Icons'
import { CATEGORY_META, type DemoCategory } from '../demo-models/categories'
import { sortedDemoModels, activeCategories, type DemoModel } from '../demo-models/models'
import { fetchDemoModel, type FetchProgress } from '../demo-models/fetchDemoModel'
import { ModelIllustration } from '../demo-models/illustrations'
import { createLogger } from '../lib/logger'
import { trackDemoGalleryOpened, trackDemoModelSelected } from '../lib/analytics'

const log = createLogger('DemoGallery')

// Typed i18n keys for category labels (keeps react-i18next's key-literal typing happy).
const CATEGORY_KEY = {
  Residential:    'demoGallery.categories.residential',
  Commercial:     'demoGallery.categories.commercial',
  Industrial:     'demoGallery.categories.industrial',
  MEP:            'demoGallery.categories.mep',
  Structural:     'demoGallery.categories.structural',
  Infrastructure: 'demoGallery.categories.infrastructure',
} as const satisfies Record<DemoCategory, string>

interface DemoGalleryProps {
  open: boolean
  onClose: () => void
  /** Called with the downloaded File once a model is fetched successfully. */
  onModelReady: (model: DemoModel, file: File) => void
}

export default function DemoGallery({ open, onClose, onModelReady }: DemoGalleryProps) {
  const { t } = useTranslation('landing')
  const [filter, setFilter]       = useState<DemoCategory | 'all'>('all')
  const [loadingId, setLoadingId] = useState<string | null>(null)
  const [progress, setProgress]   = useState<FetchProgress | null>(null)
  const [errorId, setErrorId]     = useState<string | null>(null)
  const abortRef = useRef<AbortController | null>(null)

  const categories = useMemo(() => activeCategories(), [])
  const models     = useMemo(() => sortedDemoModels(), [])
  const visible    = filter === 'all' ? models : models.filter((m) => m.category === filter)

  useEffect(() => {
    if (open) trackDemoGalleryOpened()
  }, [open])

  const handleLoad = async (model: DemoModel): Promise<void> => {
    if (loadingId) return
    trackDemoModelSelected({
      model_id: model.id,
      category: model.category,
      size_mb:  Math.round((model.sizeBytes / 1_048_576) * 10) / 10,
    })
    abortRef.current?.abort()
    const ac = new AbortController()
    abortRef.current = ac
    setErrorId(null)
    setLoadingId(model.id)
    setProgress({ ratio: 0, receivedBytes: 0, totalBytes: model.sizeBytes })
    try {
      const file = await fetchDemoModel(model, {
        signal: ac.signal,
        onProgress: (p) => setProgress(p),
      })
      if (ac.signal.aborted) return
      onModelReady(model, file)
      // Reset for next time; parent closes the gallery.
      setLoadingId(null)
      setProgress(null)
    } catch (err) {
      if (ac.signal.aborted) return
      log.warn('Demo download failed', err)
      setErrorId(model.id)
      setLoadingId(null)
      setProgress(null)
    }
  }

  const handleClose = (): void => {
    abortRef.current?.abort()
    setLoadingId(null)
    setProgress(null)
    onClose()
  }

  return (
    <AnimatePresence>
      {open && (
        <motion.div
          initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}
          className="fixed inset-0 z-[80] bg-black/50 backdrop-blur-sm flex items-center justify-center p-3 sm:p-6"
          style={{
            paddingTop:    'max(0.75rem, env(safe-area-inset-top))',
            paddingBottom: 'max(0.75rem, env(safe-area-inset-bottom))',
          }}
          onClick={handleClose}
        >
          <motion.div
            role="dialog" aria-modal="true" aria-label={t('demoGallery.title')}
            initial={{ opacity: 0, scale: 0.97, y: 16 }}
            animate={{ opacity: 1, scale: 1, y: 0 }}
            exit={{ opacity: 0, scale: 0.97, y: 16 }}
            transition={{ duration: 0.25, ease: 'easeOut' }}
            onClick={(e) => e.stopPropagation()}
            className="w-full sm:max-w-[1040px] max-h-full sm:max-h-[88dvh]
                       rounded-2xl bg-[rgba(12,12,16,0.98)] backdrop-blur-[20px] border border-[var(--border-strong)]
                       shadow-[0_24px_64px_rgba(0,0,0,0.6)] overflow-hidden flex flex-col"
          >
            {/* Header */}
            <div className="flex-none px-4 sm:px-6 py-3.5 sm:py-4 border-b border-[var(--border)] flex items-start justify-between gap-3">
              <div className="min-w-0">
                <h2 className="text-[15px] sm:text-[18px] font-semibold tracking-tight">{t('demoGallery.title')}</h2>
                <p className="mt-1 text-[11.5px] sm:text-[13px] text-[var(--text-faint)] max-w-[640px]">{t('demoGallery.subtitle')}</p>
              </div>
              <button
                onClick={handleClose}
                aria-label={t('demoGallery.close')}
                className="flex-none w-8 h-8 rounded-lg grid place-items-center text-[var(--text-faint)] hover:text-[var(--text)] hover:bg-white/5 transition-colors"
              >
                <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round">
                  <path d="M6 6l12 12M18 6L6 18" />
                </svg>
              </button>
            </div>

            {/* Category filter */}
            <div className="flex-none px-4 sm:px-6 py-2.5 sm:py-3 border-b border-[var(--border)] flex gap-2 overflow-x-auto sm:flex-wrap [scrollbar-width:none] [-ms-overflow-style:none] [&::-webkit-scrollbar]:hidden">
              <FilterChip active={filter === 'all'} onClick={() => setFilter('all')}>
                {t('demoGallery.all')}
              </FilterChip>
              {categories.map((c) => (
                <FilterChip key={c} active={filter === c} accent={CATEGORY_META[c].accent} onClick={() => setFilter(c)}>
                  {t(CATEGORY_KEY[c])}
                </FilterChip>
              ))}
            </div>

            {/* Cards */}
            <div className="flex-1 min-h-0 overflow-y-auto px-4 sm:px-6 py-4 sm:py-5 [-webkit-overflow-scrolling:touch]">
              <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3.5 sm:gap-4">
                {visible.map((m) => (
                  <DemoCard
                    key={m.id}
                    model={m}
                    categoryLabel={t(CATEGORY_KEY[m.category])}
                    loading={loadingId === m.id}
                    progress={loadingId === m.id ? progress : null}
                    error={errorId === m.id}
                    disabled={loadingId !== null && loadingId !== m.id}
                    onLoad={() => void handleLoad(m)}
                  />
                ))}
              </div>
            </div>
          </motion.div>
        </motion.div>
      )}
    </AnimatePresence>
  )
}

// ── Filter chip ────────────────────────────────────────────────────────────────
function FilterChip({
  active, accent, onClick, children,
}: { active: boolean; accent?: string; onClick: () => void; children: React.ReactNode }) {
  return (
    <button
      onClick={onClick}
      className={`px-3 py-1.5 rounded-full text-[12px] font-medium transition-colors border ${
        active
          ? 'bg-white/10 border-[var(--border-strong)] text-[var(--text)]'
          : 'bg-transparent border-[var(--border)] text-[var(--text-faint)] hover:text-[var(--text)] hover:border-[var(--border-strong)]'
      }`}
    >
      <span className="inline-flex items-center gap-1.5">
        {accent && <span className="w-2 h-2 rounded-full" style={{ background: accent }} />}
        {children}
      </span>
    </button>
  )
}

// ── Card ───────────────────────────────────────────────────────────────────────
function DemoCard({
  model, categoryLabel, loading, progress, error, disabled, onLoad,
}: {
  model: DemoModel
  categoryLabel: string
  loading: boolean
  progress: FetchProgress | null
  error: boolean
  disabled: boolean
  onLoad: () => void
}) {
  const { t } = useTranslation('landing')
  const accent = CATEGORY_META[model.category].accent
  const pct = progress?.ratio != null ? Math.round(progress.ratio * 100) : null

  return (
    <div
      className={`group relative rounded-xl border border-[var(--border)] bg-[var(--surface)] overflow-hidden flex flex-col transition-colors hover:border-[var(--border-strong)] ${
        disabled ? 'opacity-50 pointer-events-none' : ''
      }`}
    >
      {/* Thumbnail — model illustration (or an external image if provided) */}
      <div
        className="relative h-[104px] overflow-hidden"
        style={{ background: `linear-gradient(135deg, ${accent}26, ${accent}05)` }}
      >
        {model.thumbnail ? (
          <img src={model.thumbnail} alt="" className="w-full h-full object-cover" loading="lazy" />
        ) : (
          <div className="absolute inset-0 px-6 py-3.5">
            <ModelIllustration id={model.id} accent={accent} />
          </div>
        )}
        <span
          className="absolute top-2 left-2 px-2 py-0.5 rounded-full text-[10px] font-medium tracking-wide"
          style={{ background: `${accent}22`, color: accent }}
        >
          {categoryLabel}
        </span>
        <span className="absolute top-2 right-2 px-2 py-0.5 rounded-full text-[10px] font-medium bg-black/30 text-[var(--text-faint)] border border-[var(--border)]">
          {model.schema}
        </span>
      </div>

      {/* Body */}
      <div className="flex-1 flex flex-col p-3.5">
        <div className="flex items-center justify-between gap-2">
          <h3 className="text-[13.5px] font-semibold tracking-tight">{model.name}</h3>
          <span className="flex-none text-[11px] text-[var(--text-faint)]">{model.approximateSize}</span>
        </div>
        <p className="mt-1.5 text-[12px] leading-snug text-[var(--text-faint)] flex-1">{model.description}</p>

        {/* Footer: source + load */}
        <div className="mt-3 flex items-center justify-between gap-2">
          <a
            href={model.sourceUrl} target="_blank" rel="noopener noreferrer"
            onClick={(e) => e.stopPropagation()}
            className="text-[10.5px] text-[var(--text-faint)] hover:text-[var(--accent-2)] inline-flex items-center gap-1 truncate max-w-[150px]"
            title={model.sourceLabel}
          >
            <Icons.Link size={11} className="flex-none" />
            <span className="truncate">{model.sourceLabel}</span>
          </a>

          <button
            onClick={onLoad}
            disabled={loading}
            className="flex-none px-3 py-1.5 rounded-lg text-[12px] font-medium bg-[var(--accent)] text-white hover:opacity-90 transition-opacity disabled:opacity-70 inline-flex items-center gap-1.5"
          >
            {loading ? (
              <>
                <Spinner />
                {pct != null ? `${pct}%` : t('demoGallery.loading')}
              </>
            ) : error ? (
              <>
                <Icons.Reset size={13} />
                {t('demoGallery.retry')}
              </>
            ) : (
              <>
                <Icons.ArrowRight size={13} />
                {t('demoGallery.load')}
              </>
            )}
          </button>
        </div>

        {error && (
          <p className="mt-2 text-[10.5px] text-[var(--err,#e5707e)]">{t('demoGallery.loadFailed')}</p>
        )}
      </div>

      {/* Progress bar pinned to the bottom while loading */}
      {loading && (
        <div className="absolute bottom-0 left-0 right-0 h-[3px] bg-white/5">
          <div
            className="h-full transition-[width] duration-150"
            style={{ width: pct != null ? `${pct}%` : '40%', background: accent }}
          />
        </div>
      )}
    </div>
  )
}

function Spinner() {
  return (
    <svg className="animate-spin" width="13" height="13" viewBox="0 0 24 24" fill="none" aria-hidden="true">
      <circle cx="12" cy="12" r="9" stroke="currentColor" strokeWidth="3" opacity="0.25" />
      <path d="M21 12a9 9 0 0 0-9-9" stroke="currentColor" strokeWidth="3" strokeLinecap="round" />
    </svg>
  )
}
