// ─── Loading Center — Advanced sections ───────────────────────────────────────
// Session, Resources, Renderer and Cache: the numbers behind the scheduler's
// decisions, for someone asking "why is this slow" or "why did it wait".
//
// Every section is folded by default and mounts its content only when opened,
// so the renderer poll (1 s) and the OPFS listing run only while someone is
// actually reading them — the Loading Center being open is not enough.

import React, { useCallback, useEffect, useRef, useState } from 'react'
import type { CacheEntry } from '../../types'
import { loadingController, type RenderStats } from '../../lib/loading/controller'
import { useLoadingStore } from '../../stores/loadingStore'
import { formatBytes } from '../../lib/utils'
import { createLogger } from '../../lib/logger'
import { useLoadingT } from '../../i18n/hooks/namespaces'
import { meanConvertMBps } from './job-view'
import { PRESSURE_KEYS } from './labels'
import { useConfirmFocus } from './useConfirmFocus'
import { ChevronIcon, TextButton } from './glyphs'

const log = createLogger('LoadingCenter')

const DASH = '—'

function formatInt(n: number): string {
  return Math.round(n).toLocaleString()
}

function Collapsible({ title, children }: { title: string; children: () => React.ReactNode }) {
  const [open, setOpen] = useState(false)
  return (
    <section className="border-t border-[var(--border)]">
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        aria-expanded={open}
        className="w-full flex items-center gap-1.5 px-3 h-[30px] text-[10px] uppercase tracking-wider font-semibold text-[var(--text-faint)] hover:text-[var(--text-dim)] focus-visible:outline focus-visible:outline-1 focus-visible:outline-[var(--accent)]"
      >
        <ChevronIcon size={11} className={`transition-transform duration-150 ${open ? 'rotate-90' : ''}`} />
        {title}
      </button>
      {open && <div className="px-3 pb-2.5">{children()}</div>}
    </section>
  )
}

function KV({ label, value, tone }: { label: string; value: React.ReactNode; tone?: string }) {
  return (
    <div className="flex items-baseline justify-between gap-3 min-w-0 py-[1px]">
      <dt className="truncate text-[10.5px] text-[var(--text-faint)]">{label}</dt>
      <dd className={`truncate text-right text-[10.5px] font-mono tabular-nums ${tone ?? 'text-[var(--text-dim)]'}`}>{value}</dd>
    </div>
  )
}

function SessionBody() {
  const { t } = useLoadingT()
  const s = useLoadingStore((st) => st.session)
  const mbps = meanConvertMBps(s)
  return (
    <dl className="flex flex-col">
      <KV label={t('session.jobs')} value={t('session.jobsValue', {
        submitted: s.jobsSubmitted, loaded: s.jobsLoaded, failed: s.jobsFailed, cancelled: s.jobsCancelled,
      })} />
      <KV label={t('session.cache')} value={t('session.cacheValue', { hits: s.cacheHits, misses: s.cacheMisses })} />
      <KV label={t('session.retries')} value={formatInt(s.retries)} />
      <KV label={t('session.converted')} value={s.bytesConverted > 0 ? formatBytes(s.bytesConverted) : DASH} />
      <KV label={t('session.throughput')} value={mbps != null ? `${mbps.toFixed(1)} MB/s` : DASH} />
      <KV label={t('session.workers')} value={t('session.workersValue', {
        spawns: s.workerSpawns, recycles: s.workerRecycles, crashes: s.workerCrashes,
      })} />
      <KV label={t('session.peakHeap')} value={s.peakHeapBytes > 0 ? formatBytes(s.peakHeapBytes) : DASH} />
    </dl>
  )
}

function ResourcesBody() {
  const { t } = useLoadingT()
  const p = useLoadingStore((st) => st.policy)
  const yesNo = (v: boolean): string => (v ? t('resources.yes') : t('resources.no'))
  const pressureTone = p.pressure === 'critical' ? 'text-[var(--danger)]' : p.pressure === 'elevated' ? 'text-[var(--warn)]' : undefined
  return (
    <dl className="flex flex-col">
      <KV label={t('resources.cores')} value={p.cores ?? t('resources.unknown')} />
      <KV label={t('resources.deviceMemory')} value={p.deviceMemoryGB != null ? `${p.deviceMemoryGB} GB` : t('resources.unknown')} />
      <KV label={t('resources.isolated')} value={yesNo(p.crossOriginIsolated)} />
      <KV label={t('resources.mobile')} value={yesNo(p.mobile)} />
      <KV label={t('resources.maxConverts')} value={p.maxConcurrentConverts} />
      <KV label={t('resources.maxDownloads')} value={p.maxConcurrentDownloads} />
      {/* The decode lane (scans, meshes) never shares the convert lane's slot,
          so it gets its own line — already lowered to 1 under memory pressure. */}
      <KV label={t('resources.maxDecodes')} value={p.maxConcurrentDecodes} />
      <KV label={t('resources.budget')} value={formatBytes(p.memoryBudgetBytes)} />
      <KV label={t('resources.largeFile')} value={formatBytes(p.largeFileBytes)} />
      <KV label={t('resources.pressure')} value={t(PRESSURE_KEYS[p.pressure])} tone={pressureTone} />
    </dl>
  )
}

function RendererBody() {
  const { t } = useLoadingT()
  const [stats, setStats] = useState<RenderStats | null>(() => loadingController.getRenderStats())
  useEffect(() => {
    // 1 s is plenty: these numbers change when tiles stream, not per frame,
    // and reading them costs nothing only if we do not do it sixty times a second.
    const id = window.setInterval(() => setStats(loadingController.getRenderStats()), 1000)
    return () => window.clearInterval(id)
  }, [])
  if (!stats) return <p className="text-[10.5px] text-[var(--text-faint)]">{t('renderer.unavailable')}</p>
  return (
    <dl className="flex flex-col">
      <KV label={t('renderer.calls')} value={formatInt(stats.calls)} />
      <KV label={t('renderer.triangles')} value={formatInt(stats.triangles)} />
      <KV label={t('renderer.geometries')} value={formatInt(stats.geometries)} />
      <KV label={t('renderer.textures')} value={formatInt(stats.textures)} />
      <KV label={t('renderer.programs')} value={formatInt(stats.programs)} />
    </dl>
  )
}

function CacheBody() {
  const { t, i18n } = useLoadingT()
  const [entries, setEntries] = useState<CacheEntry[] | null>(null)
  const [confirming, setConfirming] = useState(false)
  const [busy, setBusy] = useState(false)
  const rowRef = useRef<HTMLDivElement>(null)
  const clearRef = useRef<HTMLButtonElement>(null)
  const noRef = useRef<HTMLButtonElement>(null)
  // No → back to "Clear cache". Yes empties the list, and this whole block
  // gives way to "No models are cached", so focus goes to the section's own
  // header — the one control here that outlives the entries.
  const sectionToggle = (): HTMLElement | null =>
    rowRef.current?.closest('section')?.querySelector<HTMLElement>('button[aria-expanded]') ?? null
  const returnFocus = useConfirmFocus(confirming, { answer: noRef, scope: rowRef, fallback: sectionToggle })

  const refresh = useCallback(async (isAlive: () => boolean = () => true) => {
    try {
      const list = await loadingController.listCache()
      if (isAlive()) setEntries(list.slice().sort((a, b) => b.cachedAt - a.cachedAt))
    } catch (err) {
      log.warn('cache listing failed', err)
      if (isAlive()) setEntries([])
    }
  }, [])

  useEffect(() => {
    let alive = true
    void refresh(() => alive)
    return () => { alive = false }
  }, [refresh])

  const clear = async (): Promise<void> => {
    setBusy(true)
    try {
      await loadingController.clearCache()
    } catch (err) {
      log.warn('cache clear failed', err)
    } finally {
      returnFocus(sectionToggle)
      setConfirming(false)
      setBusy(false)
      await refresh()
    }
  }

  if (entries === null) return <p className="text-[10.5px] text-[var(--text-faint)]">{t('cache.reading')}</p>
  if (entries.length === 0) return <p className="text-[10.5px] text-[var(--text-faint)]">{t('cache.empty')}</p>

  const total = entries.reduce((acc, e) => acc + e.fileSize + e.fragmentsSize, 0)
  const dateFmt = new Intl.DateTimeFormat(i18n.language || undefined, { dateStyle: 'medium' })
  return (
    <div className="flex flex-col gap-2">
      <p className="text-[10.5px] leading-snug text-[var(--text-faint)]">{t('cache.hint')}</p>
      <ul className="flex flex-col gap-1 max-h-[160px] overflow-y-auto overscroll-contain pr-1">
        {entries.map((e) => (
          <li key={e.key} className="flex items-baseline gap-2 min-w-0 text-[10.5px]">
            <span className="min-w-0 flex-1 truncate text-[var(--text-dim)]" title={e.fileName}>{e.fileName}</span>
            <span className="shrink-0 font-mono tabular-nums text-[var(--text-faint)]" title={t('cache.fragments', { size: formatBytes(e.fragmentsSize) })}>
              {formatBytes(e.fileSize + e.fragmentsSize)}
            </span>
            <span className="shrink-0 tabular-nums text-[var(--text-faint)]">{dateFmt.format(new Date(e.cachedAt))}</span>
          </li>
        ))}
      </ul>
      <div ref={rowRef} className="flex items-center gap-2">
        <span className="flex-1 min-w-0 truncate text-[10.5px] font-mono tabular-nums text-[var(--text-faint)]">
          {t('cache.total', { count: entries.length, size: formatBytes(total) })}
        </span>
        {confirming ? (
          <>
            {/* Announced as it appears; focus moves to "No". */}
            <span role="alert" className="text-[10.5px] text-[var(--text-dim)]">{t('cache.clearConfirm', { count: entries.length })}</span>
            <TextButton tone="danger" disabled={busy} onClick={() => void clear()}>{t('cache.yes')}</TextButton>
            <TextButton
              buttonRef={noRef}
              disabled={busy}
              onClick={() => { returnFocus(() => clearRef.current); setConfirming(false) }}
            >
              {t('cache.no')}
            </TextButton>
          </>
        ) : (
          <TextButton tone="danger" buttonRef={clearRef} onClick={() => setConfirming(true)}>{t('cache.clear')}</TextButton>
        )}
      </div>
    </div>
  )
}

export function AdvancedSections() {
  const { t } = useLoadingT()
  return (
    <div className="mt-1">
      <Collapsible title={t('session.title')}>{() => <SessionBody />}</Collapsible>
      <Collapsible title={t('resources.title')}>{() => <ResourcesBody />}</Collapsible>
      <Collapsible title={t('renderer.title')}>{() => <RendererBody />}</Collapsible>
      <Collapsible title={t('cache.title')}>{() => <CacheBody />}</Collapsible>
    </div>
  )
}
