// ─── DemoGallery ──────────────────────────────────────────────────────────────
// The modal for picking a demo. Someone opening it for the first time sees three
// recommended demos; someone looking for something searches, or filters by their
// field or by what they want to do. Cards carry a picture, a short title and the
// size: the long text waits behind the info button.
//
// With `onSetSelected` (the app's path) the gallery only PICKS: the whole set
// goes to the loading manager as one batch of URL jobs, which downloads with
// real progress in the Loading Center, converts members in parallel and
// attaches them in discipline order. The gallery closes at once.
//
// Without it (the legacy path) the gallery downloads each member itself, with
// a live progress bar, and hands each File to `onModelReady` in turn.

import { lazy, Suspense, useDeferredValue, useEffect, useMemo, useRef, useState, type ReactNode } from 'react'
import { motion, AnimatePresence } from 'framer-motion'
import { useTranslation } from 'react-i18next'
import * as Icons from './Icons'
import {
  DEMO_DOMAINS, DEMO_GOALS, demoCatalog, formatDemoBytes, matchesQuery, recommendedDemos,
  type DemoDomain, type DemoEntry, type DemoGoal,
} from '../demo-models/catalog'
import type { DemoModel, DemoSet } from '../demo-models/models'
import { isGisEnabled } from '../lib/geo/gis-flag'
import { isPointCloudEnabled } from '../lib/pointcloud/pc-flag'
import { fetchDemoModel, type FetchProgress } from '../demo-models/fetchDemoModel'
import { ModelIllustration } from '../demo-models/illustrations'
import { createLogger } from '../lib/logger'
import { trackDemoGalleryOpened, trackDemoModelSelected } from '../lib/analytics'

const log = createLogger('DemoGallery')
const PortLibrary = lazy(() => import('./PortLibrary'))

// Dynamic keys: the ids come from the catalogue, and the parity test pins them.
type Tr = (key: string, options?: Record<string, unknown>) => string

interface DemoGalleryProps {
  open: boolean
  onClose: () => void
  /**
   * Called with each downloaded File. May return a promise, and when it does
   * the gallery WAITS for it before fetching the next member of a set.
   *
   * The old single-flight loader rejected a second file while the first was
   * still being read, which is why this await existed. The loading manager
   * queues instead, so on this legacy path it only paces the downloads.
   */
  onModelReady: (model: DemoModel, file: File) => void | Promise<void>
  /**
   * Hand the whole set to the caller instead of downloading it here. When
   * given, `onModelReady` is never called.
   */
  onSetSelected?: (set: DemoSet) => void
}

export default function DemoGallery({ open, onClose, onModelReady, onSetSelected }: DemoGalleryProps) {
  const { t: tRaw } = useTranslation('landing')
  const { t: tLayersRaw } = useTranslation('layers')
  const { t: tCloudRaw } = useTranslation('pointcloud')
  const t = tRaw as unknown as Tr
  const tLayers = tLayersRaw as unknown as Tr
  const tCloud = tCloudRaw as unknown as Tr
  const [query, setQuery]         = useState('')
  const [domain, setDomain]       = useState<DemoDomain | 'port' | null>(null)
  const [goal, setGoal]           = useState<DemoGoal | null>(null)
  const [loadingId, setLoadingId] = useState<string | null>(null)
  const [progress, setProgress]   = useState<FetchProgress | null>(null)
  const [errorId, setErrorId]     = useState<string | null>(null)
  const abortRef = useRef<AbortController | null>(null)
  const deferredQuery = useDeferredValue(query)

  // Twins and clouds start from the app, which the legacy path has no way into.
  const catalog = useMemo(() => demoCatalog({
    maps: isGisEnabled(), clouds: Boolean(onSetSelected) && isPointCloudEnabled(), twins: Boolean(onSetSelected),
  }), [onSetSelected])
  const recommended = useMemo(() => recommendedDemos(catalog), [catalog])

  const describe = (e: DemoEntry): string => {
    if (e.kind === 'scene') return tLayers(`scene.demos.${e.scene.key}.description`)
    if (e.kind === 'cloud') return tCloud(`demos.items.${e.cloud.descriptionKey}`)
    if (e.set.twin) return tLayers(`devices.gallery.${e.set.twin}.description`)
    return e.set.models[0].description
  }
  const titleOf = (e: DemoEntry): string => t(`demoGallery.items.${e.id}`)

  // One predicate for the results AND for the chip counts: a chip counts what
  // it would show with the other filters kept, so it never leads to nothing.
  const matches = (e: DemoEntry, d: DemoDomain | 'port' | null, g: DemoGoal | null): boolean => {
    if (d && e.domain !== d) return false
    if (g && !e.goals.includes(g)) return false
    if (!deferredQuery.trim()) return true
    // Everything the visitor can read about a card, plus the file's own English
    // name and format, so a specialist's "IFC2x3" or "LiDAR" still finds it.
    const technical = e.kind === 'set' ? `${e.set.name} ${e.set.models.map((m) => `${m.schema} ${m.description}`).join(' ')}`
      : e.kind === 'cloud' ? `${e.cloud.name} ${e.cloud.format}` : ''
    const labels = [t(`demoGallery.domains.${e.domain}`), ...e.goals.map((g) => t(`demoGallery.goals.${g}`))].join(' ')
    return matchesQuery(`${titleOf(e)} ${describe(e)} ${technical} ${labels}`, deferredQuery)
  }
  const results = catalog.filter((e) => matches(e, domain, goal))
  const domainCount = (d: DemoDomain): number => catalog.filter((e) => matches(e, d, goal)).length
  const goalCount = (g: DemoGoal): number => catalog.filter((e) => matches(e, domain, g)).length

  const filtering = domain !== null || goal !== null || deferredQuery.trim() !== ''

  useEffect(() => {
    if (open) trackDemoGalleryOpened()
  }, [open])

  const handleLoad = async (set: DemoSet): Promise<void> => {
    if (loadingId) return
    trackDemoModelSelected({
      model_id: set.id,
      category: set.category,
      size_mb:  Math.round((set.sizeBytes / 1_048_576) * 10) / 10,
    })
    if (onSetSelected) {
      onSetSelected(set)
      return
    }
    abortRef.current?.abort()
    const ac = new AbortController()
    abortRef.current = ac
    setErrorId(null)
    setLoadingId(set.id)
    setProgress({ ratio: 0, receivedBytes: 0, totalBytes: set.sizeBytes })
    try {
      // Sequential: this legacy path hands files over one at a time and
      // waits for each (see onModelReady). The app path (onSetSelected) gives
      // the set to the loading manager instead, which keeps the disciplines in
      // order without serialising the downloads.
      //
      // Progress is reported against the WHOLE set, so a three-file project
      // shows one bar that fills once rather than three that each restart.
      let done = 0
      for (const model of set.models) {
        const file = await fetchDemoModel(model, {
          signal: ac.signal,
          onProgress: (p) => setProgress({
            ratio: (done + p.receivedBytes) / Math.max(1, set.sizeBytes),
            receivedBytes: done + p.receivedBytes,
            totalBytes: set.sizeBytes,
          }),
        })
        if (ac.signal.aborted) return
        done += model.sizeBytes
        await onModelReady(model, file)
      }
      setLoadingId(null)
      setProgress(null)
    } catch (err) {
      if (ac.signal.aborted) return
      log.warn('Demo download failed', err)
      setErrorId(set.id)
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

  const clearFilters = (): void => { setQuery(''); setDomain(null); setGoal(null) }

  const card = (e: DemoEntry, large = false): ReactNode => (
    <DemoCard
      key={e.id}
      entry={e}
      large={large}
      title={titleOf(e)}
      hint={large || recommended.includes(e) && !filtering ? t(`demoGallery.hints.${e.id}`, { defaultValue: '' }) : ''}
      description={describe(e)}
      loadingPct={loadingId === e.id ? Math.round((progress?.ratio ?? 0) * 100) : null}
      error={errorId === e.id}
      disabled={loadingId !== null && loadingId !== e.id}
      onLoad={(s) => void handleLoad(s)}
    />
  )

  return (
    <AnimatePresence>
      {open && (
        <motion.div
          initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}
          className="fixed inset-0 z-[80] bg-[var(--overlay)] flex items-center justify-center p-0 sm:p-6"
          style={{
            paddingTop:    'max(0px, env(safe-area-inset-top))',
            paddingBottom: 'max(0px, env(safe-area-inset-bottom))',
          }}
          onClick={handleClose}
        >
          <motion.div
            role="dialog" aria-modal="true" aria-label={t('demoGallery.pickTitle')}
            initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}
            transition={{ duration: 0.15 }}
            onClick={(e) => e.stopPropagation()}
            onKeyDown={(e) => { if (e.key === 'Escape') handleClose() }}
            className="w-full h-full sm:max-w-[1040px] sm:h-[88dvh]
                       sm:rounded-2xl bg-[var(--bg)] border-[var(--border-strong)] sm:border
                       shadow-[var(--shadow)] overflow-hidden flex flex-col"
          >
            {/* Header: search stays in reach whatever the scroll position. */}
            <div className="flex-none px-4 sm:px-6 pt-3 sm:pt-4 pb-3 border-b border-[var(--border)] flex flex-col gap-2.5">
              <div className="flex items-center justify-between gap-3">
                <h2 className="text-[16px] sm:text-[18px] font-semibold tracking-tight">{t('demoGallery.pickTitle')}</h2>
                <button
                  onClick={handleClose}
                  aria-label={t('demoGallery.close')}
                  className="flex-none w-10 h-10 -mr-2 rounded-lg grid place-items-center text-[var(--text-faint)] hover:text-[var(--text)] hover:bg-[var(--bg-hover)] transition-colors"
                >
                  <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round">
                    <path d="M6 6l12 12M18 6L6 18" />
                  </svg>
                </button>
              </div>
              {domain !== 'port' && (
                <input
                  type="search" value={query} onChange={(e) => setQuery(e.target.value)}
                  placeholder={t('demoGallery.searchPlaceholder')} aria-label={t('demoGallery.searchPlaceholder')}
                  data-testid="demo-search"
                  className="w-full h-10 px-3 rounded-lg text-[13px] max-md:text-[16px] bg-[var(--surface-2)] border border-[var(--border)] text-[var(--text)] placeholder:text-[var(--text-faint)] focus:outline-none focus:border-[var(--accent)]"
                />
              )}
              <ChipRow label={t('demoGallery.byDomain')}>
                {DEMO_DOMAINS.map((d) => ({ d, n: domainCount(d) })).filter(({ d, n }) => n > 0 || domain === d).map(({ d, n }) => (
                  <FilterChip key={d} active={domain === d} count={n} onClick={() => setDomain(domain === d ? null : d)}>
                    {t(`demoGallery.domains.${d}`)}
                  </FilterChip>
                ))}
                <FilterChip active={domain === 'port'} onClick={() => setDomain(domain === 'port' ? null : 'port')}>
                  {t('demoGallery.domains.port')}
                </FilterChip>
              </ChipRow>
              {domain !== 'port' && DEMO_GOALS.some((g) => goal === g || goalCount(g) > 0) && (
                <ChipRow label={t('demoGallery.byGoal')}>
                  {DEMO_GOALS.map((g) => ({ g, n: goalCount(g) })).filter(({ g, n }) => n > 0 || goal === g).map(({ g, n }) => (
                    <FilterChip key={g} active={goal === g} count={n} onClick={() => setGoal(goal === g ? null : g)}>
                      {t(`demoGallery.goals.${g}`)}
                    </FilterChip>
                  ))}
                </ChipRow>
              )}
            </div>

            <div className="flex-1 min-h-0 overflow-y-auto px-4 sm:px-6 py-4 [-webkit-overflow-scrolling:touch]">
              {domain === 'port' ? (
                <Suspense fallback={null}><PortLibrary onPick={(s) => void handleLoad(s)} /></Suspense>
              ) : filtering ? (
                <>
                  <div className="mb-3 flex items-center justify-between gap-3">
                    <p aria-live="polite" className="text-[12px] text-[var(--text-faint)]">
                      {t('demoGallery.resultCount', { count: results.length })}
                    </p>
                    <button type="button" onClick={clearFilters} className="min-h-8 text-[12px] text-[var(--accent-2)] hover:underline">
                      {t('demoGallery.clear')}
                    </button>
                  </div>
                  {results.length === 0 ? (
                    <div className="py-12 text-center" data-testid="demo-empty">
                      <p className="text-[14px] text-[var(--text)]">{t('demoGallery.emptyTitle')}</p>
                      <p className="mt-1 text-[12.5px] text-[var(--text-faint)]">{t('demoGallery.emptyHint')}</p>
                    </div>
                  ) : (
                    <CardGrid>{results.map((e) => card(e))}</CardGrid>
                  )}
                </>
              ) : (
                <>
                  <section aria-labelledby="demo-start" data-testid="demo-recommended">
                    <h3 id="demo-start" className="text-[13px] font-semibold tracking-tight mb-2.5">{t('demoGallery.startHere')}</h3>
                    <div className="grid grid-cols-2 sm:grid-cols-3 gap-3">
                      {recommended.map((e, i) => (
                        <div key={e.id} className={i === 0 ? 'col-span-2 sm:col-span-1' : ''}>{card(e, i === 0)}</div>
                      ))}
                    </div>
                  </section>
                  {/* Browse rows, not every card: one row per field with a way into
                      the rest, so the whole catalogue reads in a couple of screens. */}
                  {DEMO_DOMAINS.map((d) => {
                    const members = catalog.filter((e) => e.domain === d && !recommended.includes(e))
                    if (members.length === 0) return null
                    return (
                      <section key={d} className="mt-6" data-testid={`demo-row-${d}`}>
                        <div className="mb-2.5 flex items-baseline justify-between gap-3">
                          <h3 className="text-[13px] font-semibold tracking-tight">{t(`demoGallery.domains.${d}`)}</h3>
                          {members.length > ROW && (
                            <button type="button" onClick={() => setDomain(d)} className="min-h-8 text-[12px] text-[var(--accent-2)] hover:underline">
                              {t('demoGallery.seeAll', { count: members.length })}
                            </button>
                          )}
                        </div>
                        <CardGrid>{members.slice(0, ROW).map((e) => card(e))}</CardGrid>
                      </section>
                    )
                  })}
                </>
              )}
            </div>
          </motion.div>
        </motion.div>
      )}
    </AnimatePresence>
  )
}

/** Cards per browse row: one row of four on desktop, two rows of two on a phone. */
const ROW = 4

function CardGrid({ children }: { children: ReactNode }) {
  return <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 gap-3">{children}</div>
}

function ChipRow({ label, children }: { label: string; children: ReactNode }) {
  return (
    <div className="flex items-center gap-2 min-w-0" role="group" aria-label={label}>
      <span className="flex-none w-[52px] text-[11px] leading-tight text-[var(--text-faint)]">{label}</span>
      <div className="flex-1 min-w-0 flex gap-1.5 overflow-x-auto [scrollbar-width:none] [&::-webkit-scrollbar]:hidden">{children}</div>
    </div>
  )
}

function FilterChip({ active, count, onClick, children }: { active: boolean; count?: number; onClick: () => void; children: ReactNode }) {
  return (
    <button
      type="button"
      aria-pressed={active}
      onClick={onClick}
      className={`flex-none h-8 px-2.5 rounded-lg text-[12px] whitespace-nowrap border transition-colors ${
        active
          ? 'bg-[var(--surface-2)] border-[var(--accent)] text-[var(--text)]'
          : 'border-[var(--border)] text-[var(--text-dim)] hover:text-[var(--text)] hover:border-[var(--border-strong)]'
      }`}
    >
      {children}
      {count != null && <span className="ml-1.5 text-[var(--text-faint)] [font-variant-numeric:tabular-nums]">{count}</span>}
    </button>
  )
}

// ── Card ───────────────────────────────────────────────────────────────────────
function DemoCard({
  entry, large, title, hint, description, loadingPct, error, disabled, onLoad,
}: {
  entry: DemoEntry
  large: boolean
  title: string
  hint: string
  description: string
  loadingPct: number | null
  error: boolean
  disabled: boolean
  onLoad: (set: DemoSet) => void
}) {
  const { t: tRaw } = useTranslation('landing')
  const t = tRaw as unknown as Tr
  const [imageFailed, setImageFailed] = useState(false)
  const [details, setDetails] = useState(false)

  const facts: string[] = []
  if (entry.kind === 'scene') facts.push(t('demoGallery.onMap'))
  if (entry.kind === 'cloud') facts.push(t('demoGallery.scan'))
  if (entry.kind === 'set' && entry.set.models.length > 1) facts.push(t('demoGallery.fileCount', { count: entry.set.models.length }))
  if (entry.sizeBytes != null) facts.push(formatDemoBytes(entry.sizeBytes))

  const body = (
    <>
      <span className={`relative block ${large ? 'aspect-[16/9] sm:aspect-[16/10]' : 'aspect-[16/10]'} bg-[var(--surface-2)]`}>
        {imageFailed ? (
          <span className="absolute inset-0 px-8 py-5 block">
            <ModelIllustration id={entry.kind === 'set' ? entry.set.models[0].id : entry.id} accent="#A09E98" />
          </span>
        ) : (
          <img
            src={entry.image} alt="" width={640} height={400} loading="lazy" decoding="async"
            onError={() => setImageFailed(true)}
            className="absolute inset-0 w-full h-full object-cover"
          />
        )}
      </span>
      <span className="block p-2.5">
        <span className={`block font-medium leading-snug text-[var(--text)] ${large ? 'text-[15px]' : 'text-[13px]'}`}>{title}</span>
        {hint && <span className="block mt-1 text-[12px] leading-snug text-[var(--text-dim)]">{hint}</span>}
        <span className="block mt-1 pr-8 text-[11.5px] text-[var(--text-faint)] [font-variant-numeric:tabular-nums]">
          {loadingPct != null ? `${t('demoGallery.loading')} ${loadingPct}%` : facts.join(' · ')}
        </span>
      </span>
    </>
  )
  const cls = 'block w-full text-left no-underline hover:bg-[var(--surface-2)] transition-colors focus-visible:outline-2 focus-visible:outline-[var(--accent)]'

  return (
    <div
      data-testid={`demo-card-${entry.id}`}
      className={`relative min-w-0 rounded-[10px] border border-[var(--border)] overflow-hidden hover:border-[var(--border-strong)] transition-colors ${
        disabled ? 'opacity-50 pointer-events-none' : ''
      }`}
    >
      {entry.kind === 'set'
        ? <button type="button" className={cls} disabled={loadingPct != null} onClick={() => onLoad(entry.set)}>{body}</button>
        : <a className={cls} href={entry.href}>{body}</a>}

      {/* A sibling of the card's main action, never nested in it. */}
      <button
        type="button"
        aria-expanded={details}
        aria-label={t('demoGallery.moreInfo', { title })}
        onClick={() => setDetails((v) => !v)}
        className="absolute right-0 bottom-0 w-10 h-10 grid place-items-center text-[var(--text-faint)] hover:text-[var(--text)]"
      >
        <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" aria-hidden="true">
          {details ? <path d="M6 15l6-6 6 6" /> : <><circle cx="12" cy="12" r="9" /><path d="M12 11v5M12 8h.01" /></>}
        </svg>
      </button>

      {error && <p className="px-2.5 pb-2.5 text-[11.5px] text-[var(--err,#e5707e)]">{t('demoGallery.loadFailed')}</p>}

      {details && (
        <div className="px-2.5 pb-2.5 pt-2 border-t border-[var(--border)] text-[12px] leading-snug text-[var(--text-dim)]">
          <p>{description}</p>
          <SourceLine entry={entry} />
        </div>
      )}
    </div>
  )
}

/** Attribution: several of these licences require it, so it stays one tap away. */
function SourceLine({ entry }: { entry: DemoEntry }) {
  const source = entry.kind === 'set' ? entry.set.models[0] : entry.kind === 'cloud' ? entry.cloud : null
  if (!source) return null
  const format = entry.kind === 'set' ? entry.set.models[0].schema : entry.kind === 'cloud' ? entry.cloud.format : ''
  return (
    <p className="mt-2 text-[11.5px] text-[var(--text-faint)] [overflow-wrap:anywhere]">
      {format} ·{' '}
      <a href={source.sourceUrl} target="_blank" rel="noopener noreferrer" className="inline-flex items-center gap-1 hover:text-[var(--accent-2)]">
        <Icons.Link size={11} className="flex-none" />
        {source.sourceLabel}
      </a>
    </p>
  )
}
