// ─── ValidationExportModal ───────────────────────────────────────────────────
// Configurable export dialog for validation results. Replaces the flat export
// dropdown with a modal that lets the user choose:
//   • Scope    — which models to include (all / a subset), when >1 is loaded
//   • Severity — errors / warnings / info
//   • Format   — JSON report · CSV table · Certificate · BCF
//   • Packaging — one combined file, or one file per model in a .zip
// A live summary shows exactly how many issues will be exported before they hit
// "Download", so the action is predictable and intuitive.
//
// Everything runs client-side: JSON/CSV/Certificate are built here, BCF reuses
// the existing bcf.ts pipeline, and the .zip uses fflate (already a dependency
// via the BCF export — no new package).

import React, { useMemo, useState, useEffect } from 'react'
import { createPortal } from 'react-dom'
import { motion, AnimatePresence } from 'framer-motion'
import { useTranslation } from 'react-i18next'
import { zipSync, strToU8 } from 'fflate'
import { downloadBlob } from '../lib/diffStore'
import { APP_VERSION } from '../lib/app-version'
import { issuesToBcfTopics, exportBcfZip } from '../lib/bcf'
import { getCoveredCategories, ALL_CATEGORIES } from './ValidationCoverageSummary'
import { VALIDATION_PROFILES } from '../types'
import type {
  ValidationIssue, ValidationResult, ValidationCertificate,
  RulesConfig, ValidationProfile,
} from '../types'
import { trackFeatureUsed, trackCertificateIssued, trackProEntryClick } from '../lib/analytics'
import { isCloudEnabled, certify, type ApiError, type CertifyResponse } from '../lib/cloud/api-client'
import { useCloudAccountStore, isAccountEnabled, openAccountModal } from '../stores/cloudAccountStore'
import { buildCertifyPayload } from '../lib/certify/build-payload'
import { sha256Hex } from '../lib/certify/canonical'
import { modelRegistry } from '../lib/model-registry'
import { buildBadgeMarkdown } from '../lib/share-report'

type ExportFormat = 'json' | 'csv' | 'certificate' | 'bcf'
type Severity = 'error' | 'warning' | 'info'

export interface ExportModelEntry {
  modelId: string
  fileName: string
  result: ValidationResult
}

interface ValidationExportModalProps {
  /** Per-model results to choose from. Aggregate is derived from the selection. */
  models: ExportModelEntry[]
  /** Active rules config (for the certificate coverage summary). */
  rules: RulesConfig
  activeProfileId: string | null
  customProfiles: ValidationProfile[]
  /** Localised profile-name resolver (passed in to avoid duplicating i18n logic). */
  resolveProfileName: (p: ValidationProfile) => string
  /** Optional viewer snapshot for BCF viewpoints. */
  takeSnapshot?: () => string | undefined
  onClose: () => void
}

// ── CSV helpers ─────────────────────────────────────────────────────────────────

const CSV_HEADER = 'modelId,modelFile,id,ruleId,severity,expressId,globalId,ifcClass,elementName,message,path,autoFixable'

function csvRow(i: ValidationIssue, modelId: string, modelFile: string): string {
  const q = (s: string) => `"${s.replace(/"/g, '""')}"`
  return [
    modelId, q(modelFile), i.id, i.ruleId, i.severity, i.expressId, i.globalId ?? '',
    i.ifcClass, q(i.elementName), q(i.message), q(i.path.join(' > ')), i.autoFixable,
  ].join(',')
}

// ── Certificate builder (one model) ──────────────────────────────────────────────

function buildCertificate(
  entry: ExportModelEntry,
  rules: RulesConfig,
  profileName: string,
  profileId: string,
): ValidationCertificate {
  const covered   = getCoveredCategories(rules)
  const uncovered = ALL_CATEGORIES.filter((c) => !covered.includes(c))
  return {
    timestamp:     new Date().toISOString(),
    modelFileName: entry.fileName,
    modelId:       entry.modelId,
    profileUsed: {
      id:          profileId,
      name:        profileName,
      rulesActive: Object.entries(rules).filter(([, v]) => typeof v === 'boolean' && v).map(([k]) => k),
    },
    coverageSummary: {
      categoriesChecked:   covered,
      categoriesUnchecked: uncovered,
      rulesRun: [...new Set(entry.result.issues.map((i) => i.ruleId))],
    },
    stats:        entry.result.stats,
    qualityScore: entry.result.qualityScore ?? 0,
    issues:       entry.result.issues,
    generatedBy:  'IFC Viewer — Validator V2',
    appVersion:   APP_VERSION,
    durationMs:   entry.result.durationMs,
  }
}

// ── Verifiable certificate issuance (F1) ─────────────────────────────────────────
// Hash the raw IFC bytes in-browser (only the digest travels — I-2), build the
// frozen CertifyPayloadV1 and ask the Worker to sign it. Exported so the
// contract test can assert the exact body without rendering the modal.

export interface IssueVerifiableDeps {
  /** Injectable for tests; defaults to the modelRegistry buffer authority. */
  getBuffer?: (modelId: string) => ArrayBuffer | null
  /** Injectable for tests; defaults to the real api-client certify(). */
  certifyFn?: typeof certify
  /** Session token — when present the Worker saves the cert to the issuer's
   *  history. Omitted = anonymous issuance (byte-identical to F1). */
  token?: string
}

export type IssueVerifiableResult =
  | { ok: true; response: CertifyResponse }
  | { ok: false; reason: ApiError['code'] | 'no_buffer' | 'build_failed' }

export async function issueVerifiableCertificate(
  entry: ExportModelEntry,
  rules: RulesConfig,
  profileId: string | null,
  deps: IssueVerifiableDeps = {},
): Promise<IssueVerifiableResult> {
  const getBuffer = deps.getBuffer ?? ((id: string) => modelRegistry.getBuffer(id))
  const certifyFn = deps.certifyFn ?? certify
  const buffer = getBuffer(entry.modelId)
  if (!buffer) return { ok: false, reason: 'no_buffer' }
  try {
    const fileHashSha256 = await sha256Hex(buffer)
    const payload = await buildCertifyPayload({ result: entry.result, rules, profileId, fileHashSha256 })
    const r = await certifyFn(payload, deps.token)
    return r.ok ? { ok: true, response: r.value } : { ok: false, reason: r.error.code }
  } catch {
    // buildCertifyPayload only rejects on malformed input; degrade, never throw.
    return { ok: false, reason: 'build_failed' }
  }
}

// ── Stats helper ─────────────────────────────────────────────────────────────────

function countBySeverity(issues: ValidationIssue[]): Record<Severity, number> {
  const c: Record<Severity, number> = { error: 0, warning: 0, info: 0 }
  for (const i of issues) c[i.severity as Severity] = (c[i.severity as Severity] ?? 0) + 1
  return c
}

function safeStem(fileName: string): string {
  return fileName.replace(/\.ifc$/i, '').replace(/[^a-z0-9._-]+/gi, '_') || 'model'
}

// ── Component ─────────────────────────────────────────────────────────────────────

export default function ValidationExportModal({
  models, rules, activeProfileId, customProfiles, resolveProfileName, takeSnapshot, onClose,
}: ValidationExportModalProps) {
  const { t } = useTranslation('validation')

  const multiModel = models.length > 1

  // ── Selection state ──────────────────────────────────────────────────────────
  const [selectedIds, setSelectedIds] = useState<Set<string>>(() => new Set(models.map((m) => m.modelId)))
  const [severities, setSeverities]   = useState<Set<Severity>>(() => new Set<Severity>(['error', 'warning', 'info']))
  const [format, setFormat]           = useState<ExportFormat>('json')
  // 'combined' = one file with all selected models; 'split' = one file per model in a .zip
  const [packaging, setPackaging]     = useState<'combined' | 'split'>('combined')

  // ── Verifiable certificate (F1) — only exists when a backend is configured ────
  type CertifyUiState = 'idle' | 'busy' | 'failed' | { response: CertifyResponse }
  const cloudAvailable = isCloudEnabled()
  const [certifyState, setCertifyState] = useState<CertifyUiState>('idle')
  const [copiedKey, setCopiedKey] = useState<'link' | 'badge' | null>(null)
  const [savedToHistory, setSavedToHistory] = useState(false)

  // Close on Escape
  useEffect(() => {
    const h = (e: KeyboardEvent) => { if (e.key === 'Escape') onClose() }
    document.addEventListener('keydown', h)
    return () => document.removeEventListener('keydown', h)
  }, [onClose])

  // ── Derived: selected models + filtered issue counts ───────────────────────────
  const selectedModels = useMemo(
    () => models.filter((m) => selectedIds.has(m.modelId)),
    [models, selectedIds],
  )

  const matchesSeverity = (i: ValidationIssue) => severities.has(i.severity as Severity)

  const summary = useMemo(() => {
    let total = 0
    const perModel: Array<{ fileName: string; count: number }> = []
    for (const m of selectedModels) {
      const n = m.result.issues.filter(matchesSeverity).length
      total += n
      perModel.push({ fileName: m.fileName, count: n })
    }
    return { total, perModel, modelCount: selectedModels.length }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [selectedModels, severities])

  // BCF + Certificate always cover all severities (they're full deliverables);
  // the severity filter only meaningfully applies to JSON/CSV.
  const severityApplies = format === 'json' || format === 'csv'
  // Packaging only matters with >1 selected model and a per-model-friendly format.
  const packagingApplies = selectedModels.length > 1

  const profileId   = activeProfileId ?? 'custom'
  const profileName = useMemo(() => {
    const all = [...VALIDATION_PROFILES, ...customProfiles]
    const p = activeProfileId ? all.find((x) => x.id === activeProfileId) : null
    return p ? resolveProfileName(p) : 'Manual'
  }, [activeProfileId, customProfiles, resolveProfileName])

  // ── Per-model serialisers ──────────────────────────────────────────────────────
  function serialiseModel(entry: ExportModelEntry): { ext: string; mime: string; data: string | Uint8Array } {
    const issues = severityApplies ? entry.result.issues.filter(matchesSeverity) : entry.result.issues
    switch (format) {
      case 'json': {
        const filtered: ValidationResult = {
          ...entry.result,
          issues,
          stats: { ...entry.result.stats, ...recomputeStats(issues) },
        }
        return { ext: 'json', mime: 'application/json', data: JSON.stringify({ modelFile: entry.fileName, ...filtered }, null, 2) }
      }
      case 'csv': {
        const rows = issues.map((i) => csvRow(i, entry.modelId, entry.fileName))
        return { ext: 'csv', mime: 'text/csv', data: [CSV_HEADER, ...rows].join('\n') }
      }
      case 'certificate': {
        const cert = buildCertificate(entry, rules, profileName, profileId)
        return { ext: 'json', mime: 'application/json', data: JSON.stringify(cert, null, 2) }
      }
      case 'bcf': {
        const snapshot = takeSnapshot?.()
        const bytes = exportBcfZip(issuesToBcfTopics(entry.result.issues, snapshot))
        return { ext: 'bcfzip', mime: 'application/octet-stream', data: bytes }
      }
    }
  }

  function recomputeStats(issues: ValidationIssue[]) {
    const byRule: Record<string, number> = {}
    let errors = 0, warnings = 0, info = 0
    for (const i of issues) {
      byRule[i.ruleId] = (byRule[i.ruleId] ?? 0) + 1
      if (i.severity === 'error') errors++
      else if (i.severity === 'warning') warnings++
      else info++
    }
    return { total: issues.length, errors, warnings, info, byRule }
  }

  // ── Combined serialiser (all selected models in one file) ──────────────────────
  function serialiseCombined(): { ext: string; mime: string; data: string | Uint8Array } {
    const allIssues = selectedModels.flatMap((m) =>
      (severityApplies ? m.result.issues.filter(matchesSeverity) : m.result.issues)
        .map((i) => (i.modelId ? i : { ...i, modelId: m.modelId })),
    )
    switch (format) {
      case 'json': {
        const combined = {
          generatedAt: new Date().toISOString(),
          models: selectedModels.map((m) => ({
            modelId: m.modelId, modelFile: m.fileName,
            qualityScore: m.result.qualityScore ?? 0,
            stats: m.result.stats,
          })),
          stats: recomputeStats(allIssues),
          issues: allIssues,
        }
        return { ext: 'json', mime: 'application/json', data: JSON.stringify(combined, null, 2) }
      }
      case 'csv': {
        const map = new Map(selectedModels.map((m) => [m.modelId, m.fileName]))
        const rows = allIssues.map((i) => csvRow(i, i.modelId ?? '', map.get(i.modelId ?? '') ?? ''))
        return { ext: 'csv', mime: 'text/csv', data: [CSV_HEADER, ...rows].join('\n') }
      }
      case 'certificate': {
        // A combined certificate wraps one certificate per model.
        const certs = selectedModels.map((m) => buildCertificate(m, rules, profileName, profileId))
        return { ext: 'json', mime: 'application/json', data: JSON.stringify({ certificates: certs }, null, 2) }
      }
      case 'bcf': {
        const snapshot = takeSnapshot?.()
        const topics = selectedModels.flatMap((m) => issuesToBcfTopics(m.result.issues, snapshot))
        return { ext: 'bcfzip', mime: 'application/octet-stream', data: exportBcfZip(topics) }
      }
    }
  }

  // ── Download orchestration ─────────────────────────────────────────────────────
  const canExport = selectedModels.length > 0 && (severityApplies ? severities.size > 0 : true) && summary.total >= 0

  const handleDownload = () => {
    if (selectedModels.length === 0) return
    const stamp = new Date().toISOString().slice(0, 10)

    // Single model, or combined packaging → one file.
    if (selectedModels.length === 1 || packaging === 'combined') {
      const { ext, mime, data } =
        selectedModels.length === 1 ? serialiseModel(selectedModels[0]) : serialiseCombined()
      const base =
        selectedModels.length === 1 ? safeStem(selectedModels[0].fileName) : `validation-${selectedModels.length}-models`
      const name = `${base}-${format}-${stamp}.${ext}`
      const blob = typeof data === 'string' ? new Blob([data], { type: mime }) : new Blob([data], { type: mime })
      downloadBlob(blob, name)
    } else {
      // Split packaging → one file per model, bundled in a .zip.
      const entries: Record<string, Uint8Array> = {}
      const seen = new Map<string, number>()
      for (const m of selectedModels) {
        const { ext, data } = serialiseModel(m)
        let stem = safeStem(m.fileName)
        const dup = seen.get(stem) ?? 0
        seen.set(stem, dup + 1)
        if (dup > 0) stem = `${stem}-${dup + 1}`
        entries[`${stem}.${ext}`] = typeof data === 'string' ? strToU8(data) : data
      }
      const zipped = zipSync(entries, { level: 6 })
      downloadBlob(new Blob([zipped], { type: 'application/zip' }), `validation-${format}-${stamp}.zip`)
    }

    const featureByFormat = {
      json: 'report_export_json', csv: 'report_export_csv',
      certificate: 'report_export_cert', bcf: 'bcf_export',
    } as const
    trackFeatureUsed({ feature: featureByFormat[format] })
    onClose()
  }

  // ── Verifiable certificate handlers ────────────────────────────────────────────
  const handleIssueVerifiable = async () => {
    if (selectedModels.length !== 1 || certifyState === 'busy') return
    setCertifyState('busy')
    // Signed in → pass the session token so the Worker saves it to history.
    const account = useCloudAccountStore.getState()
    const token = account.status === 'signed-in' ? (await account.getToken?.()) ?? undefined : undefined
    setSavedToHistory(Boolean(token))
    const res = await issueVerifiableCertificate(selectedModels[0], rules, activeProfileId, { token })
    setCertifyState(res.ok ? { response: res.response } : 'failed')
    if (res.ok) {
      // Coarse category only — never the profile id/name (INV-5).
      const profileKind = activeProfileId && VALIDATION_PROFILES.some((p) => p.id === activeProfileId)
        ? 'default' as const
        : 'custom' as const
      trackCertificateIssued({
        deduplicated: res.response.deduplicated,
        rules_evaluated: res.response.payload.rules_result.length,
        profile_kind: profileKind,
      })
    }
  }

  const copyText = async (text: string, key: 'link' | 'badge') => {
    try {
      await navigator.clipboard.writeText(text)
      setCopiedKey(key)
      setTimeout(() => setCopiedKey(null), 2000)
    } catch { /* clipboard denied — the URL stays visible and selectable */ }
  }

  const downloadSignedJson = (r: CertifyResponse) => {
    const doc = { payload: r.payload, signature: r.signature, key_id: r.key_id }
    const blob = new Blob([JSON.stringify(doc, null, 2)], { type: 'application/json' })
    downloadBlob(blob, `ifc-certificate-${r.cert_hash.slice(0, 12)}.json`)
  }

  // ── Render helpers ─────────────────────────────────────────────────────────────
  const FORMATS: Array<{ id: ExportFormat; label: string; desc: string; tag: string; color: string }> = [
    { id: 'json',        label: t('export.fmtJsonLabel'),  desc: t('export.fmtJsonDesc'),  tag: 'JSON', color: 'var(--accent)' },
    { id: 'csv',         label: t('export.fmtCsvLabel'),   desc: t('export.fmtCsvDesc'),   tag: 'CSV',  color: 'var(--ok)' },
    { id: 'certificate', label: t('export.fmtCertLabel'),  desc: t('export.fmtCertDesc'),  tag: 'CERT', color: '#F5A623' },
    { id: 'bcf',         label: t('export.fmtBcfLabel'),   desc: t('export.fmtBcfDesc'),   tag: 'BCF',  color: 'var(--accent)' },
  ]

  const SEVERITIES: Array<{ id: Severity; label: string; color: string }> = [
    { id: 'error',   label: t('filters.errors'),   color: 'var(--danger)' },
    { id: 'warning', label: t('filters.warnings'), color: '#F5A623' },
    { id: 'info',    label: t('filters.info'),     color: '#5E9ED6' },
  ]

  const toggleId = (set: Set<string>, id: string, setter: (s: Set<string>) => void) => {
    const next = new Set(set)
    next.has(id) ? next.delete(id) : next.add(id)
    setter(next)
  }

  // Rendered through a portal to document.body so the fixed-position overlay is
  // centered on the viewport — not trapped inside an ancestor with a `transform`
  // (the validation panel uses framer-motion transforms, which would otherwise
  // make `position: fixed` resolve relative to the panel instead of the window).
  return createPortal(
    <AnimatePresence>
      {/* Full-viewport flex container centers the modal. Centering is done here
          (flex) rather than via translate on the modal itself, because
          framer-motion writes an inline `transform` for the scale/y animation
          that would otherwise clobber any `-translate-x/y-1/2` centering. */}
      <div className="fixed inset-0 z-[80] flex items-center justify-center p-4">
        <motion.div
          initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}
          transition={{ duration: 0.15 }}
          className="absolute inset-0 bg-black/50 backdrop-blur-sm"
          onClick={onClose}
        />
        <motion.div
          initial={{ opacity: 0, scale: 0.97, y: 8 }}
          animate={{ opacity: 1, scale: 1, y: 0 }}
          exit={{ opacity: 0, scale: 0.97, y: 8 }}
          transition={{ duration: 0.18 }}
          role="dialog" aria-modal="true" aria-label={t('export.title')}
          className="relative z-[81] w-[440px] max-w-full max-h-[calc(100dvh-3rem)] rounded-2xl bg-[rgba(14,14,18,0.98)] backdrop-blur-[20px] border border-[var(--border-strong)] shadow-[0_24px_64px_rgba(0,0,0,0.6)] overflow-hidden flex flex-col"
          onClick={(e) => e.stopPropagation()}
        >
        {/* Header */}
        <div className="flex items-center justify-between px-4 py-3 border-b border-[var(--border)] shrink-0">
          <div className="flex items-center gap-2">
            <svg width="14" height="14" viewBox="0 0 13 13" fill="none" stroke="currentColor" strokeWidth="1.4" strokeLinecap="round" className="text-[var(--accent)]">
              <path d="M6.5 1v7M3.5 5.5l3 3.5 3-3.5M1 10v2h11v-2" />
            </svg>
            <span className="text-[13px] font-semibold text-[var(--text)]">{t('export.title')}</span>
          </div>
          <button onClick={onClose} className="w-6 h-6 flex items-center justify-center text-[var(--text-muted)] hover:text-[var(--text)] transition-colors" aria-label={t('export.close')}>
            <svg width="10" height="10" viewBox="0 0 10 10" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round"><path d="M1 1l8 8M9 1L1 9"/></svg>
          </button>
        </div>

        {/* Body */}
        <div className="overflow-y-auto flex-1 px-4 py-3 flex flex-col gap-4">

          {/* Format */}
          <section>
            <p className="text-[10px] font-semibold uppercase tracking-wider text-[var(--text-muted)] mb-2">{t('export.format')}</p>
            <div className="grid grid-cols-2 gap-2">
              {FORMATS.map((f) => {
                const active = format === f.id
                return (
                  <button
                    key={f.id}
                    onClick={() => setFormat(f.id)}
                    className="flex flex-col items-start gap-1 p-2.5 rounded-lg text-left transition-all border"
                    style={active
                      ? { background: 'var(--surface-2)', borderColor: f.color }
                      : { background: 'transparent', borderColor: 'var(--border)' }}
                  >
                    <span className="font-mono text-[9px] px-1.5 py-0.5 rounded" style={{ color: f.color, background: `${f.color}1a` }}>{f.tag}</span>
                    <span className="text-[12px] font-medium text-[var(--text)]">{f.label}</span>
                    <span className="text-[10px] text-[var(--text-muted)] leading-tight">{f.desc}</span>
                  </button>
                )
              })}
            </div>
          </section>

          {/* Verifiable certificate (F1) — only rendered with a configured backend */}
          {format === 'certificate' && cloudAvailable && (
            <section className="rounded-lg border border-[#F5A62333] bg-[#F5A6230a] p-2.5 flex flex-col gap-2">
              <div className="flex items-center gap-1.5">
                <svg width="12" height="12" viewBox="0 0 12 12" fill="none" stroke="#F5A623" strokeWidth="1.4" strokeLinecap="round" strokeLinejoin="round">
                  <path d="M6 1l4 1.5v3c0 2.5-1.7 4.4-4 5.5-2.3-1.1-4-3-4-5.5v-3L6 1z"/><path d="M4.2 6l1.3 1.3 2.3-2.6"/>
                </svg>
                <span className="text-[11px] font-semibold text-[var(--text)]">{t('export.verifiableTitle')}</span>
              </div>
              <p className="text-[10px] text-[var(--text-muted)] leading-snug">{t('export.verifiableDesc')}</p>

              {certifyState === 'failed' && (
                <p className="text-[10px] leading-snug" style={{ color: '#F5A623' }}>{t('export.verifiableError')}</p>
              )}

              {typeof certifyState === 'object' ? (
                <div className="flex flex-col gap-1.5">
                  <p className="text-[10px] font-medium" style={{ color: 'var(--ok)' }}>
                    {certifyState.response.deduplicated ? t('export.verifiableDedup') : t('export.verifiableReady')}
                  </p>
                  {savedToHistory && !certifyState.response.deduplicated && (
                    <p className="text-[10px] text-[var(--text-muted)]">{t('export.verifiableSavedHistory')}</p>
                  )}
                  {/* F2-TRIGGERS: passive post-issuance hint for anonymous issuers.
                      Never adds a click to the anonymous issue path (the cert is
                      already issued); invisible when accounts are disabled. */}
                  {!savedToHistory && isAccountEnabled() && (
                    <p className="text-[10px] text-[var(--text-muted)]">
                      {t('export.verifiableSignInHint')}{' '}
                      <button
                        onClick={() => { trackProEntryClick({ source: 'export_modal' }); openAccountModal() }}
                        className="underline hover:text-[var(--accent)] transition-colors"
                      >
                        {t('export.verifiableSignInCta')}
                      </button>
                    </p>
                  )}
                  <div className="flex items-center gap-1.5">
                    <span className="flex-1 truncate font-mono text-[10px] text-[var(--text)] px-2 py-1 rounded bg-[var(--surface-2)] border border-[var(--border)]">
                      {certifyState.response.verify_url}
                    </span>
                    <button
                      onClick={() => copyText(certifyState.response.verify_url, 'link')}
                      className="shrink-0 h-6 px-2 rounded text-[10px] font-medium border border-[var(--border)] text-[var(--text)] hover:border-[var(--accent)] transition-colors"
                    >
                      {copiedKey === 'link' ? t('export.copied') : t('export.copyLink')}
                    </button>
                  </div>
                  <div className="flex gap-1.5">
                    <button
                      onClick={() => downloadSignedJson(certifyState.response)}
                      className="h-6 px-2 rounded text-[10px] font-medium border border-[var(--border)] text-[var(--text)] hover:border-[var(--accent)] transition-colors"
                    >
                      {t('export.downloadSigned')}
                    </button>
                    {(() => {
                      const badge = buildBadgeMarkdown(
                        certifyState.response.payload.health_score,
                        certifyState.response.verify_url,
                        import.meta.env.VITE_REPORT_URL as string | undefined,
                      )
                      return badge ? (
                        <button
                          onClick={() => copyText(badge, 'badge')}
                          className="h-6 px-2 rounded text-[10px] font-medium border border-[var(--border)] text-[var(--text)] hover:border-[var(--accent)] transition-colors"
                        >
                          {copiedKey === 'badge' ? t('export.copied') : t('export.copyBadge')}
                        </button>
                      ) : null
                    })()}
                  </div>
                </div>
              ) : (
                <>
                  <button
                    onClick={handleIssueVerifiable}
                    disabled={certifyState === 'busy' || selectedModels.length !== 1}
                    className="self-start h-7 px-3 rounded-lg text-[11px] font-semibold transition-colors disabled:opacity-40 disabled:cursor-not-allowed"
                    style={{ background: '#F5A623', color: '#1a1205' }}
                  >
                    {certifyState === 'busy' ? t('export.verifiableBusy') : t('export.verifiableBtn')}
                  </button>
                  {selectedModels.length !== 1 && (
                    <p className="text-[10px] text-[var(--text-muted)]">{t('export.verifiableSelectOne')}</p>
                  )}
                </>
              )}
            </section>
          )}

          {/* Model scope (only when >1 model) */}
          {multiModel && (
            <section>
              <div className="flex items-center justify-between mb-2">
                <p className="text-[10px] font-semibold uppercase tracking-wider text-[var(--text-muted)]">{t('export.models')}</p>
                <div className="flex gap-2">
                  <button onClick={() => setSelectedIds(new Set(models.map((m) => m.modelId)))} className="text-[10px] text-[var(--accent)] hover:underline">{t('export.selectAll')}</button>
                  <button onClick={() => setSelectedIds(new Set())} className="text-[10px] text-[var(--text-muted)] hover:underline">{t('export.selectNone')}</button>
                </div>
              </div>
              <div className="flex flex-col gap-1 max-h-[140px] overflow-y-auto">
                {models.map((m) => {
                  const active = selectedIds.has(m.modelId)
                  const n = m.result.issues.filter(matchesSeverity).length
                  return (
                    <button
                      key={m.modelId}
                      onClick={() => toggleId(selectedIds, m.modelId, setSelectedIds)}
                      className="flex items-center gap-2 px-2 py-1.5 rounded-lg text-left transition-colors border"
                      style={active
                        ? { background: 'var(--surface-2)', borderColor: 'var(--accent)' }
                        : { background: 'transparent', borderColor: 'var(--border)' }}
                    >
                      <span className="w-3.5 h-3.5 rounded flex items-center justify-center shrink-0 border" style={active ? { background: 'var(--accent)', borderColor: 'var(--accent)' } : { borderColor: 'var(--border-strong)' }}>
                        {active && <svg width="8" height="8" viewBox="0 0 8 8" fill="none" stroke="white" strokeWidth="1.6" strokeLinecap="round"><path d="M1 4l2 2 4-4.5"/></svg>}
                      </span>
                      <span className="text-[11px] text-[var(--text)] truncate flex-1">{m.fileName}</span>
                      <span className="text-[10px] font-mono text-[var(--text-muted)] shrink-0">{n}</span>
                    </button>
                  )
                })}
              </div>
            </section>
          )}

          {/* Severity (JSON/CSV only) */}
          {severityApplies && (
            <section>
              <p className="text-[10px] font-semibold uppercase tracking-wider text-[var(--text-muted)] mb-2">{t('export.severity')}</p>
              <div className="flex gap-2">
                {SEVERITIES.map((s) => {
                  const active = severities.has(s.id)
                  return (
                    <button
                      key={s.id}
                      onClick={() => toggleId(severities as Set<string>, s.id, (set) => setSeverities(set as Set<Severity>))}
                      className="flex items-center gap-1.5 px-2.5 h-7 rounded-lg text-[11px] font-medium transition-colors border"
                      style={active
                        ? { background: `${s.color}1a`, borderColor: `${s.color}66`, color: s.color }
                        : { background: 'transparent', borderColor: 'var(--border)', color: 'var(--text-muted)' }}
                    >
                      <span className="w-1.5 h-1.5 rounded-full" style={{ background: active ? s.color : 'var(--text-faint)' }} />
                      {s.label}
                    </button>
                  )
                })}
              </div>
            </section>
          )}

          {/* Packaging (only when >1 selected model) */}
          {packagingApplies && (
            <section>
              <p className="text-[10px] font-semibold uppercase tracking-wider text-[var(--text-muted)] mb-2">{t('export.packaging')}</p>
              <div className="grid grid-cols-2 gap-2">
                <button
                  onClick={() => setPackaging('combined')}
                  className="flex flex-col items-start gap-0.5 p-2.5 rounded-lg text-left transition-all border"
                  style={packaging === 'combined' ? { background: 'var(--surface-2)', borderColor: 'var(--accent)' } : { background: 'transparent', borderColor: 'var(--border)' }}
                >
                  <span className="text-[12px] font-medium text-[var(--text)]">{t('export.combined')}</span>
                  <span className="text-[10px] text-[var(--text-muted)] leading-tight">{t('export.combinedDesc')}</span>
                </button>
                <button
                  onClick={() => setPackaging('split')}
                  className="flex flex-col items-start gap-0.5 p-2.5 rounded-lg text-left transition-all border"
                  style={packaging === 'split' ? { background: 'var(--surface-2)', borderColor: 'var(--accent)' } : { background: 'transparent', borderColor: 'var(--border)' }}
                >
                  <span className="text-[12px] font-medium text-[var(--text)]">{t('export.split')}</span>
                  <span className="text-[10px] text-[var(--text-muted)] leading-tight">{t('export.splitDesc')}</span>
                </button>
              </div>
            </section>
          )}
        </div>

        {/* Footer — live summary + download */}
        <div className="px-4 py-3 border-t border-[var(--border)] bg-[rgba(255,255,255,0.02)] shrink-0 flex items-center justify-between gap-3">
          <p className="text-[11px] text-[var(--text-muted)] leading-tight">
            {severityApplies
              ? t('export.summaryIssues', { count: summary.total, models: summary.modelCount })
              : t('export.summaryModels', { count: summary.modelCount })}
          </p>
          <button
            onClick={handleDownload}
            disabled={!canExport}
            className="shrink-0 h-8 px-4 rounded-lg text-[12px] font-semibold transition-colors disabled:opacity-40 disabled:cursor-not-allowed"
            style={{ background: 'var(--accent)', color: 'white' }}
          >
            {t('export.download')}
          </button>
        </div>
        </motion.div>
      </div>
    </AnimatePresence>,
    document.body,
  )
}
