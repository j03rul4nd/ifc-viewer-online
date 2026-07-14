// ─── ModelInfoPanel ───────────────────────────────────────────────────────────
// Floating panel showing file weight, element count, and memory stats with
// contextual quality indicators so the user understands what the numbers mean.

import React, { useState } from 'react'
import { useTranslation } from 'react-i18next'
import type { ModelInfo, MemoryStats } from '../types'
import type { GpuBackend } from '../stores/uiStore'
import { useCobieStore } from '../stores/cobieStore'
import type { FmTier } from '../lib/cobie/fm-readiness'

interface ModelInfoPanelProps {
  modelInfo:    ModelInfo
  /** Active model id — lets the panel read the cached COBie/FM-readiness result. */
  modelId?:     string
  memoryStats:  MemoryStats
  isFromCache:  boolean
  qualityScore?: number
  gpuBackend?:  GpuBackend
}

const FM_COLOR: Record<FmTier, string> = { ready: '#30A46C', partial: '#F5A623', insufficient: '#E5484D' }

function formatBytes(bytes: number): string {
  if (bytes === 0) return '—'
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(0)} KB`
  return `${(bytes / 1024 / 1024).toFixed(1)} MB`
}

function formatCount(n: number): string {
  if (n >= 1_000_000) return `${(n / 1_000_000).toFixed(1)}M`
  if (n >= 1_000) return `${(n / 1_000).toFixed(0)}K`
  return n.toString()
}

interface SizeHealth {
  label:   string
  color:   string
  bg:      string
  tip:     string
}

function getSizeHealth(bytes: number, t: (key: string, opts?: Record<string, unknown>) => string): SizeHealth {
  const mb = bytes / 1024 / 1024
  if (bytes === 0) return { label: t('health.unknown'), color: '#888', bg: 'rgba(136,136,136,0.12)', tip: t('info.sizeUnavailable') }
  if (mb < 1)     return { label: t('health.tiny'),    color: '#30A46C', bg: 'rgba(48,164,108,0.12)', tip: t('info.sizeTip.tiny') }
  if (mb < 10)    return { label: t('health.light'),   color: '#30A46C', bg: 'rgba(48,164,108,0.12)', tip: t('info.sizeTip.light') }
  if (mb < 50)    return { label: t('health.normal'),  color: '#5E9ED6', bg: 'rgba(94,158,214,0.12)', tip: t('info.sizeTip.normal') }
  if (mb < 150)   return { label: t('health.large'),   color: '#F5A623', bg: 'rgba(245,166,35,0.12)', tip: t('info.sizeTip.large') }
  return            { label: t('health.heavy'),   color: '#E5484D', bg: 'rgba(229,72,77,0.12)', tip: t('info.sizeTip.heavy') }
}

function getElementHealth(count: number, t: (key: string, opts?: Record<string, unknown>) => string): SizeHealth {
  if (count < 1_000)  return { label: t('health.small'),   color: '#30A46C', bg: 'rgba(48,164,108,0.12)', tip: t('info.elementTip.small') }
  if (count < 10_000) return { label: t('health.typical'), color: '#5E9ED6', bg: 'rgba(94,158,214,0.12)', tip: t('info.elementTip.typical') }
  if (count < 50_000) return { label: t('health.complex'), color: '#F5A623', bg: 'rgba(245,166,35,0.12)', tip: t('info.elementTip.complex') }
  return                { label: t('health.dense'),   color: '#E5484D', bg: 'rgba(229,72,77,0.12)', tip: t('info.elementTip.dense') }
}

function HealthBadge({ h }: { h: SizeHealth }) {
  return (
    <span
      title={h.tip}
      className="inline-block px-1.5 py-0.5 rounded text-[10px] font-semibold leading-none cursor-help"
      style={{ color: h.color, background: h.bg }}
    >
      {h.label}
    </span>
  )
}

function Row({ label, value, sub, badge }: {
  label: string; value: string; sub?: string; badge?: SizeHealth
}) {
  return (
    <div className="flex items-center justify-between gap-2 py-1.5 border-b border-[var(--border)] last:border-0">
      <span className="text-[11px] text-[var(--text-dim)] shrink-0">{label}</span>
      <div className="flex items-center gap-1.5 min-w-0">
        {sub && <span className="text-[10px] text-[var(--text-muted)] hidden sm:block truncate">{sub}</span>}
        <span className="text-[12px] text-[var(--text)] font-medium tabular-nums">{value}</span>
        {badge && <HealthBadge h={badge} />}
      </div>
    </div>
  )
}

export default function ModelInfoPanel({ modelInfo, modelId, memoryStats, isFromCache, qualityScore, gpuBackend }: ModelInfoPanelProps) {
  const { t } = useTranslation('viewer')
  const [expanded, setExpanded] = useState(false)

  // FM-readiness: present only once a COBie export has been run for this model
  // (the extraction is cached in cobieStore — no eager worker pass).
  const fm = useCobieStore((s) => (modelId ? s.byModel[modelId]?.readiness : undefined))
  const fmTierLabel = fm
    ? fm.tier === 'ready' ? t('fm.ready') : fm.tier === 'partial' ? t('fm.partial') : t('fm.insufficient')
    : ''

  const tAny = t as (key: string, opts?: Record<string, unknown>) => string
  const sizeHealth    = getSizeHealth(modelInfo.fileSize, tAny)
  const elementHealth = getElementHealth(modelInfo.elementCount, tAny)
  const totalMemMB    = memoryStats.heapMB + memoryStats.gpuEstimateMB

  const qualityLabel = qualityScore != null
    ? qualityScore >= 80 ? t('health.acceptable')
    : qualityScore >= 50 ? t('health.improvable')
    : t('health.deficient')
    : ''

  const qualityBadgeLabel = qualityScore != null
    ? qualityScore >= 80 ? t('health.good')
    : qualityScore >= 50 ? t('health.fair')
    : t('health.poor')
    : ''

  return (
    <div
      className="absolute bottom-[76px] sm:bottom-4 left-1/2 -translate-x-1/2 z-[8] select-none pointer-events-auto"
      style={{ maxWidth: 'min(320px, calc(100vw - 120px))', minWidth: 200 }}
    >
      {/* Collapsed pill */}
      <button
        onClick={() => setExpanded((e) => !e)}
        className="w-full flex items-center gap-2 px-3 py-1.5 rounded-lg bg-[rgba(12,12,16,0.88)] backdrop-blur-[14px] border border-[var(--border)] text-[var(--text-dim)] hover:text-[var(--text)] transition-colors"
      >
        {/* File size badge */}
        <HealthBadge h={sizeHealth} />
        <span className="text-[11px] font-medium truncate max-w-[140px]" title={modelInfo.fileName}>
          {modelInfo.fileName}
        </span>
        <span className="text-[11px] text-[var(--text-muted)] tabular-nums ml-auto shrink-0">
          {formatBytes(modelInfo.fileSize)}
        </span>
        {qualityScore != null && (
          <span
            className="shrink-0 px-1.5 py-0.5 rounded-full text-[10px] font-mono font-bold border"
            style={(() => {
              const c = qualityScore >= 80 ? '#30A46C' : qualityScore >= 50 ? '#F5A623' : '#E5484D'
              return { color: c, borderColor: `${c}44`, background: `${c}14` }
            })()}
            title={t('info.qualityScore', { score: qualityScore })}
          >
            {qualityScore}
          </span>
        )}
        {fm && (
          <span
            className="shrink-0 px-1.5 py-0.5 rounded-full text-[9px] font-mono font-bold border leading-none"
            style={{ color: FM_COLOR[fm.tier], borderColor: `${FM_COLOR[fm.tier]}44`, background: `${FM_COLOR[fm.tier]}14` }}
            title={t('fm.tip', { score: fm.score })}
          >
            FM {fm.score}
          </span>
        )}
        {gpuBackend && gpuBackend !== 'detecting' && (
          <span
            className="shrink-0 px-1.5 py-0.5 rounded-full text-[9px] font-mono font-semibold border leading-none"
            style={
              gpuBackend === 'webgpu'
                ? { color: '#5E6AD2', borderColor: '#5E6AD244', background: '#5E6AD214' }
                : { color: '#888', borderColor: '#88888844', background: '#88888814' }
            }
            title={gpuBackend === 'webgpu' ? t('info.rendererTip.webgpu') : t('info.rendererTip.webgl')}
          >
            {gpuBackend === 'webgpu' ? 'WebGPU' : 'WebGL'}
          </span>
        )}
        <span className="text-[10px] opacity-50">{expanded ? '▲' : '▼'}</span>
      </button>

      {/* Expanded panel */}
      {expanded && (
        <div className="mt-1 px-3 py-2 rounded-lg bg-[rgba(12,12,16,0.92)] backdrop-blur-[14px] border border-[var(--border)]">
          <Row
            label={t('info.fileSize')}
            value={modelInfo.fileSize === 0 ? '—' : formatBytes(modelInfo.fileSize)}
            sub={isFromCache ? t('info.fromCache') : undefined}
            badge={sizeHealth}
          />
          <Row
            label={t('info.elements')}
            value={formatCount(modelInfo.elementCount)}
            sub={t('info.categories', { count: modelInfo.categories.length })}
            badge={elementHealth}
          />
          {totalMemMB > 0 && (
            <Row
              label={t('info.memory')}
              value={`${totalMemMB.toFixed(0)} MB`}
              sub={t('info.gpuMemory', { mb: memoryStats.gpuEstimateMB.toFixed(0) })}
            />
          )}

          {qualityScore != null && (
            <Row
              label={t('info.quality')}
              value={`${qualityScore} / 100`}
              sub={qualityLabel}
              badge={{
                label: qualityBadgeLabel,
                color: qualityScore >= 80 ? '#30A46C' : qualityScore >= 50 ? '#F5A623' : '#E5484D',
                bg:    qualityScore >= 80 ? 'rgba(48,164,108,0.12)' : qualityScore >= 50 ? 'rgba(245,166,35,0.12)' : 'rgba(229,72,77,0.12)',
                tip:   t('info.qualityScore', { score: qualityScore }),
              }}
            />
          )}

          {gpuBackend && (
            <Row
              label={t('info.renderer')}
              value={gpuBackend === 'detecting' ? t('info.detecting') : gpuBackend === 'webgpu' ? 'WebGPU' : 'WebGL'}
              badge={
                gpuBackend === 'webgpu'
                  ? { label: 'GPU', color: '#5E6AD2', bg: 'rgba(94,106,210,0.12)', tip: t('info.rendererTip.webgpu') }
                  : gpuBackend === 'webgl'
                  ? { label: 'GL', color: '#888', bg: 'rgba(136,136,136,0.12)', tip: t('info.rendererTip.webgl') }
                  : undefined
              }
            />
          )}

          {/* Tip */}
          <p className="mt-2 text-[10px] text-[var(--text-muted)] leading-relaxed">
            {sizeHealth.tip}
          </p>

          {modelInfo.fileSize === 0 && (
            <p className="mt-1 text-[10px] text-[var(--text-muted)] leading-relaxed">
              {t('info.sizeUnavailable')}
            </p>
          )}
        </div>
      )}
    </div>
  )
}
