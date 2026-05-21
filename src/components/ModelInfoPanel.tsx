// ─── ModelInfoPanel ───────────────────────────────────────────────────────────
// Floating panel showing file weight, element count, and memory stats with
// contextual quality indicators so the user understands what the numbers mean.

import React, { useState } from 'react'
import type { ModelInfo, MemoryStats } from '../types'
import type { GpuBackend } from '../stores/uiStore'

interface ModelInfoPanelProps {
  modelInfo:    ModelInfo
  memoryStats:  MemoryStats
  isFromCache:  boolean
  qualityScore?: number
  gpuBackend?:  GpuBackend
}

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

function getSizeHealth(bytes: number): SizeHealth {
  const mb = bytes / 1024 / 1024
  if (bytes === 0) return { label: 'Unknown', color: '#888', bg: 'rgba(136,136,136,0.12)', tip: 'File size not available (loaded from cache).' }
  if (mb < 1)     return { label: 'Tiny',    color: '#30A46C', bg: 'rgba(48,164,108,0.12)', tip: 'Very small file — loads instantly on any device.' }
  if (mb < 10)    return { label: 'Light',   color: '#30A46C', bg: 'rgba(48,164,108,0.12)', tip: 'Small file — fast performance everywhere.' }
  if (mb < 50)    return { label: 'Normal',  color: '#5E9ED6', bg: 'rgba(94,158,214,0.12)', tip: 'Typical IFC file. Good performance on modern hardware.' }
  if (mb < 150)   return { label: 'Large',   color: '#F5A623', bg: 'rgba(245,166,35,0.12)', tip: 'Large file. Loading may take longer. OPFS cache will help on repeat opens.' }
  return            { label: 'Heavy',   color: '#E5484D', bg: 'rgba(229,72,77,0.12)', tip: 'Very large file. Consider splitting the model or using LOD techniques for better performance.' }
}

function getElementHealth(count: number): SizeHealth {
  if (count < 1_000)  return { label: 'Small',  color: '#30A46C', bg: 'rgba(48,164,108,0.12)', tip: 'Fewer than 1 000 elements — instant performance.' }
  if (count < 10_000) return { label: 'Typical',color: '#5E9ED6', bg: 'rgba(94,158,214,0.12)', tip: 'Typical building model. Smooth interaction on desktop.' }
  if (count < 50_000) return { label: 'Complex',color: '#F5A623', bg: 'rgba(245,166,35,0.12)', tip: 'Complex model. Interaction may feel slower on lower-end GPUs.' }
  return                { label: 'Dense',  color: '#E5484D', bg: 'rgba(229,72,77,0.12)', tip: 'Extremely dense model. Consider LOD or splitting by discipline.' }
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

export default function ModelInfoPanel({ modelInfo, memoryStats, isFromCache, qualityScore, gpuBackend }: ModelInfoPanelProps) {
  const [expanded, setExpanded] = useState(false)

  const sizeHealth    = getSizeHealth(modelInfo.fileSize)
  const elementHealth = getElementHealth(modelInfo.elementCount)
  const totalMemMB    = memoryStats.heapMB + memoryStats.gpuEstimateMB

  return (
    <div className="absolute bottom-4 left-1/2 -translate-x-1/2 z-[8] select-none pointer-events-auto"
         style={{ maxWidth: 320, minWidth: 200 }}>
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
            title={`Puntuación de calidad: ${qualityScore}/100`}
          >
            {qualityScore}
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
            title={gpuBackend === 'webgpu' ? 'WebGPU renderer activo — máximo rendimiento' : 'WebGL renderer'}
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
            label="File size"
            value={modelInfo.fileSize === 0 ? '—' : formatBytes(modelInfo.fileSize)}
            sub={isFromCache ? 'from cache' : undefined}
            badge={sizeHealth}
          />
          <Row
            label="Elements"
            value={formatCount(modelInfo.elementCount)}
            sub={`${modelInfo.categories.length} categories`}
            badge={elementHealth}
          />
          {totalMemMB > 0 && (
            <Row
              label="Memory"
              value={`${totalMemMB.toFixed(0)} MB`}
              sub={`${memoryStats.gpuEstimateMB.toFixed(0)} MB GPU`}
            />
          )}

          {qualityScore != null && (
            <Row
              label="Calidad"
              value={`${qualityScore} / 100`}
              sub={qualityScore >= 80 ? 'Aceptable' : qualityScore >= 50 ? 'Mejorable' : 'Deficiente'}
              badge={{
                label: qualityScore >= 80 ? 'Bien' : qualityScore >= 50 ? 'Regular' : 'Bajo',
                color: qualityScore >= 80 ? '#30A46C' : qualityScore >= 50 ? '#F5A623' : '#E5484D',
                bg:    qualityScore >= 80 ? 'rgba(48,164,108,0.12)' : qualityScore >= 50 ? 'rgba(245,166,35,0.12)' : 'rgba(229,72,77,0.12)',
                tip:   `Puntuación de calidad del modelo: ${qualityScore}/100`,
              }}
            />
          )}

          {gpuBackend && (
            <Row
              label="Renderer"
              value={gpuBackend === 'detecting' ? 'Detecting…' : gpuBackend === 'webgpu' ? 'WebGPU' : 'WebGL'}
              badge={
                gpuBackend === 'webgpu'
                  ? { label: 'GPU', color: '#5E6AD2', bg: 'rgba(94,106,210,0.12)', tip: 'WebGPU renderer activo — máximo rendimiento disponible en este dispositivo.' }
                  : gpuBackend === 'webgl'
                  ? { label: 'GL', color: '#888', bg: 'rgba(136,136,136,0.12)', tip: 'WebGL renderer. WebGPU no está disponible en este navegador.' }
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
              Size unavailable — model was loaded from the OPFS cache. Reload from disk to see file size.
            </p>
          )}
        </div>
      )}
    </div>
  )
}
