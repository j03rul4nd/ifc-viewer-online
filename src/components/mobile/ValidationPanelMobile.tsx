// ─── ValidationPanelMobile ───────────────────────────────────────────────────
// Dedicated touch-first Validation experience (mobile < md). Rendered instead of
// the docked ValidationPanel via an early return; the desktop panel is untouched.
// It receives an already-computed view-model (`vm`) from the desktop component so
// there is zero logic duplication — only the presentation is re-imagined for
// thumbs: frosted bottom-sheet, score hero, "Fix first", filter chips, grouped
// issue *cards* (expand → message + remediation + jump-to-3D / fix / mute / BCF),
// secondary actions tucked into an overflow sheet so nothing clips off a 320px
// screen. BCF gets a lighter mobile-fit (the existing panel inside the sheet).

import React, { useState, useMemo, useEffect, useCallback, useRef, useLayoutEffect } from 'react'
import { useTranslation } from 'react-i18next'
import BcfPanel from '../BcfPanel'
import {
  getRuleLabel, getRuleRemediation, RULE_METADATA, AUTHORING_TOOLS, VALIDATION_PROFILES,
} from '../../types'
import type {
  ValidationIssue, ValidationResult, ValidationCoverage, ValidationProfile, RulesConfig,
  ViewerHandle, AuthoringTool,
} from '../../types'
import type { ScoreContribution } from '../../lib/validator'
import { benchmarkReady, type BenchStats } from '../../lib/benchmark'
import type { ValidationDiff } from '../../lib/validation-diff'
import ValidationExportModal, { type ExportModelEntry } from '../ValidationExportModal'
import * as Icons from '../Icons'
import { MobileSheet } from './MobileSheet'
import { MobileActionSheet, type SheetAction } from './MobileActionSheet'
import {
  SheetHeaderBar, ScoreHero, StatPill, PrimaryCTA, Chip, Segmented, Strip,
  MobileSearch, MobileEmpty,
} from './mobileUi'

const TAP = { WebkitTapHighlightColor: 'transparent' } as const
const PREVIEW = 8

type ActiveTab = 'all' | 'errors' | 'warnings' | 'info'
type GroupBy = 'rule' | 'storey' | 'class'

export interface ValidationMobileVM {
  language: string
  result: ValidationResult | null
  stats?: { total: number; errors: number; warnings: number; info: number }
  displayScore: number | null
  coverage?: ValidationCoverage
  coverageIncomplete: boolean
  contributions: ScoreContribution[]
  bench: BenchStats | null
  issues: ValidationIssue[]
  orderedGroups: Array<[string, ValidationIssue[]]>
  filtered: ValidationIssue[]
  filters: { activeTab: ActiveTab; groupBy: GroupBy }
  setFilters: (f: Partial<{ activeTab: ActiveTab; groupBy: GroupBy }>) => void
  search: string
  setSearch: (v: string) => void
  modelFilter: string | null
  setModelFilter: (id: string | null) => void
  sceneModels: Array<{ id: string; fileName: string }>
  isRunning: boolean
  progress: number
  validationStatus: string
  validationError: string | null
  hasModel: boolean
  autoFixableCount: number
  pendingFixIds: Set<number>
  mutedCount: number
  unmuteAll: () => void
  runDiff: ValidationDiff | null
  activePanel: 'issues' | 'bcf' | 'history'
  setActivePanel: (p: 'issues' | 'bcf' | 'history') => void
  bcfTopicCount: number
  viewer?: Pick<ViewerHandle, 'setCameraViewpoint' | 'getCameraViewpoint' | 'takeSnapshot'> | null
  activeProfileId: string | null
  customProfiles: ValidationProfile[]
  setActiveProfile: (id: string) => void
  exportModels: ExportModelEntry[]
  rules: RulesConfig
  resolveProfileName: (p: { id: string; name: string }) => string
  onRun: () => void
  onJumpTo: (i: ValidationIssue) => void
  onAutoFix: (i: ValidationIssue) => void
  onNameFix: (i: ValidationIssue, field: 'Name' | 'LongName', v: string) => void
  onMute: (i: ValidationIssue) => void
  onAddToBcf: (i: ValidationIssue) => void
  onShareReport: () => void
  onCopyForAI: () => void
  onCopyBadge: () => void
  onBatchFix: () => void
  onClose: () => void
}

// ── Local helpers (kept out of the desktop module to avoid an import cycle) ────

const NAME_EDIT_RULES = new Set([
  'RULE_EMPTY_NAME', 'RULE_EMPTY_LONGNAME', 'RULE_DUPLICATE_NAME', 'RULE_NAMING_CONVENTION',
])
const editField = (ruleId: string): 'Name' | 'LongName' => (ruleId === 'RULE_EMPTY_LONGNAME' ? 'LongName' : 'Name')

function sevColor(sev: ValidationIssue['severity']): string {
  return sev === 'error' ? 'var(--danger)' : sev === 'warning' ? 'var(--warn)' : '#5E9ED6'
}
function scoreColor(s: number): string {
  return s >= 70 ? 'var(--ok)' : s >= 50 ? 'var(--warn)' : 'var(--danger)'
}
function gradeKey(s: number): 'excellent' | 'good' | 'fair' | 'poor' | 'critical' {
  return s >= 85 ? 'excellent' : s >= 70 ? 'good' : s >= 50 ? 'fair' : s >= 30 ? 'poor' : 'critical'
}
function fixGuideUrl(ruleId: string, language: string): string {
  const base = import.meta.env.BASE_URL
  if (ruleId === 'RULE_DUPLICATE_GUID' || ruleId === 'RULE_INVALID_GUID_FORMAT') return `${base}tools/fix-duplicate-guids/`
  const lang = language.slice(0, 2)
  const prefix = ['es', 'de', 'fr', 'pt', 'it', 'ca', 'zh', 'ja', 'th'].includes(lang) ? `${lang}/` : ''
  const slug = ruleId.replace(/^RULE_/, '').toLowerCase().replace(/_/g, '-')
  return `${base}${prefix}fix/${slug}/`
}

// ─── Main ─────────────────────────────────────────────────────────────────────

export default function ValidationPanelMobile({ vm, open }: { vm: ValidationMobileVM; open: boolean }) {
  const { t } = useTranslation('validation')
  const {
    language, result, stats, displayScore, coverage, coverageIncomplete, contributions, bench,
    issues, orderedGroups, filtered, filters, setFilters, search, setSearch,
    modelFilter, setModelFilter, sceneModels, isRunning, progress, validationStatus, validationError,
    hasModel, autoFixableCount, pendingFixIds, mutedCount, unmuteAll, runDiff,
    activePanel, setActivePanel, bcfTopicCount, viewer, activeProfileId, customProfiles, setActiveProfile,
    exportModels, rules, resolveProfileName,
    onRun, onJumpTo, onAutoFix, onNameFix, onMute, onAddToBcf,
    onShareReport, onCopyForAI, onCopyBadge, onBatchFix, onClose,
  } = vm

  const [openGroups, setOpenGroups] = useState<Set<string>>(new Set())
  const [shownAll, setShownAll] = useState<Set<string>>(new Set())
  const [remediationTool, setRemediationTool] = useState<AuthoringTool>('revit')
  const [actionsOpen, setActionsOpen] = useState(false)
  const [profileOpen, setProfileOpen] = useState(false)
  const [exportOpen, setExportOpen] = useState(false)
  const [runDiffDismissed, setRunDiffDismissed] = useState(false)

  useEffect(() => { setRunDiffDismissed(false) }, [result])

  // Auto-open groups for small / clean result sets (mirrors desktop).
  useEffect(() => {
    const keys = orderedGroups.map(([k]) => k)
    const autoOpen = keys.length <= 3 || filtered.length <= 12
    setOpenGroups(autoOpen ? new Set(keys) : new Set())
    setShownAll(new Set())
  }, [filters.groupBy, filters.activeTab, modelFilter, result]) // eslint-disable-line react-hooks/exhaustive-deps

  const toggleGroup = useCallback((k: string) => {
    setOpenGroups((prev) => {
      const next = new Set(prev)
      next.has(k) ? next.delete(k) : next.add(k)
      return next
    })
  }, [])

  const score = displayScore
  const grade = score != null ? t(`summary.grade.${gradeKey(score)}`) : ''
  const topFix = useMemo(() => contributions.filter((c) => c.penalty > 0).slice(0, 3), [contributions])

  // ── Overflow secondary actions ──────────────────────────────────────────────
  const overflowActions = useMemo<SheetAction[]>(() => {
    const list: SheetAction[] = []
    if (autoFixableCount > 0) {
      list.push({
        key: 'fixall', label: t('actions.fixAllCount', { count: autoFixableCount }), tone: 'ok',
        icon: <Icons.Check size={17} />, onClick: onBatchFix,
      })
    }
    if (result) {
      list.push(
        { key: 'share', label: t('actions.shareReport'), desc: t('actions.shareReportTitle'), tone: 'accent', icon: <ShareIcon />, onClick: onShareReport },
        { key: 'ai', label: 'Copy for AI', desc: 'Plain-text report for Claude / ChatGPT', icon: <SparkIcon />, onClick: onCopyForAI },
      )
      if (import.meta.env.VITE_REPORT_URL) {
        list.push({ key: 'badge', label: 'Copy badge', desc: 'Embeddable Health Score badge (markdown)', icon: <BadgeIcon />, onClick: onCopyBadge })
      }
      if (exportModels.length > 0) {
        list.push({ key: 'export', label: t('actions.export'), icon: <ExportIcon />, onClick: () => setExportOpen(true) })
      }
    }
    return list
  }, [t, autoFixableCount, result, exportModels.length, onBatchFix, onShareReport, onCopyForAI, onCopyBadge])

  // ── Profile picker actions ──────────────────────────────────────────────────
  const profileActions = useMemo<SheetAction[]>(() => {
    const builtIns = VALIDATION_PROFILES.map((p) => ({
      key: p.id,
      label: resolveProfileName(p),
      tone: (p.id === activeProfileId ? 'accent' : 'default') as SheetAction['tone'],
      onClick: () => setActiveProfile(p.id),
    }))
    const customs = customProfiles.map((p) => ({
      key: p.id,
      label: p.name,
      tone: (p.id === activeProfileId ? 'accent' : 'default') as SheetAction['tone'],
      onClick: () => setActiveProfile(p.id),
    }))
    return [...builtIns, ...customs]
  }, [activeProfileId, customProfiles, resolveProfileName, setActiveProfile])

  const activeProfileName = useMemo(() => {
    const builtIn = VALIDATION_PROFILES.find((p) => p.id === activeProfileId)
    if (builtIn) return resolveProfileName(builtIn)
    return customProfiles.find((p) => p.id === activeProfileId)?.name ?? activeProfileId
  }, [activeProfileId, customProfiles, resolveProfileName])

  const busy = isRunning || validationStatus === 'running'

  const scoreBadge = score != null ? (
    <span className="font-mono font-bold text-[15px] tabular-nums" style={{ color: scoreColor(score) }}>{score}</span>
  ) : null

  return (
    <>
      <MobileSheet open={open} onClose={onClose} label={t('panel.title')}>
        <SheetHeaderBar
          icon={<ShieldIcon />}
          title={t('panel.title')}
          badge={scoreBadge}
          onOverflow={overflowActions.length ? () => setActionsOpen(true) : undefined}
          onClose={onClose}
        />

        {/* Tabs */}
        <div className="px-4 pt-3 shrink-0">
          <Segmented<'issues' | 'bcf'>
            value={activePanel === 'bcf' ? 'bcf' : 'issues'}
            onChange={(v) => setActivePanel(v)}
            options={[
              { value: 'issues', label: t('tabs.issues') },
              {
                value: 'bcf',
                label: (
                  <span className="flex items-center gap-1.5">
                    {t('tabs.bcf')}
                    {bcfTopicCount > 0 && <span className="font-mono text-[10px] opacity-80">{bcfTopicCount}</span>}
                  </span>
                ),
              },
            ]}
          />
        </div>

        {activePanel === 'bcf' ? (
          <div className="flex-1 min-h-0 overflow-y-auto scroll-contain mt-2"
            style={{ paddingBottom: 'calc(env(safe-area-inset-bottom, 0px) + 16px)' }}>
            <BcfPanel viewer={viewer ?? undefined} />
          </div>
        ) : (
          <div className="flex-1 overflow-y-auto scroll-contain overscroll-contain"
            style={{ paddingBottom: 'calc(env(safe-area-inset-bottom, 0px) + 24px)' }}>

            {/* Hero */}
            {result && score != null ? (
              <ScoreHero
                score={score}
                color={scoreColor(score)}
                grade={grade}
                subtitle={
                  <span className="flex items-center gap-1.5 flex-wrap">
                    {result.qualityScore != null && benchmarkReady(bench) && (
                      <span style={{ color: result.qualityScore >= bench!.avg ? 'var(--ok)' : 'var(--text-dim)' }}>
                        {result.qualityScore >= bench!.avg ? '↑' : '↓'} {t('summary.vsAvg', { avg: bench!.avg })}
                      </span>
                    )}
                    {result.durationMs != null && <span className="text-[var(--text-faint)]">· {result.durationMs}ms</span>}
                  </span>
                }
                stats={
                  stats && (
                    <>
                      {stats.errors > 0 && <StatPill value={stats.errors} label="E" color="var(--danger)" />}
                      {stats.warnings > 0 && <StatPill value={stats.warnings} label="W" color="var(--warn)" />}
                      {stats.info > 0 && <StatPill value={stats.info} label="I" color="#5E9ED6" />}
                      {stats.total === 0 && <StatPill value={'✓'} label={t('results.noIssues')} color="var(--ok)" />}
                    </>
                  )
                }
              />
            ) : (
              <div className="px-4 pt-3 text-[13px] text-[var(--text-dim)] leading-relaxed">
                {!hasModel ? t('empty.noModelDesc') : t('empty.modelReadyDesc')}
              </div>
            )}

            {/* Run + profile */}
            <div className="px-4 pt-1 pb-3 flex flex-col gap-2.5">
              <PrimaryCTA onClick={onRun} disabled={!hasModel || busy} busy={busy}>
                {busy ? t('validating', { progress }) : result ? t('run.revalidate') : t('run.validate')}
              </PrimaryCTA>
              <button
                onClick={() => setProfileOpen(true)}
                className="flex items-center gap-2 h-10 px-3.5 rounded-xl text-[12.5px] font-medium text-[var(--text-dim)] active:scale-[0.98] transition-transform"
                style={{ background: 'var(--surface-2)', border: '1px solid var(--border)', ...TAP }}
              >
                <span className="text-[var(--text-faint)]">{t('profile.label')}</span>
                <span className="text-[var(--text)] font-semibold truncate">{activeProfileName}</span>
                <Icons.Chevron size={13} className="ml-auto text-[var(--text-faint)] rotate-90" />
              </button>
            </div>

            {/* Progress */}
            {busy && (
              <div className="px-4 pb-3">
                <div className="h-1 bg-[var(--surface-2)] rounded-full overflow-hidden">
                  <div className="h-full rounded-full bg-[var(--accent)] transition-all duration-300" style={{ width: `${progress}%` }} />
                </div>
              </div>
            )}

            {/* Strips */}
            <div className="px-4 flex flex-col gap-2 empty:hidden">
              {validationStatus === 'error' && validationError && (
                <Strip tone="danger" action={{ label: t('run.retry'), onClick: onRun }}>{validationError}</Strip>
              )}
              {coverageIncomplete && coverage && (
                <Strip tone="warn">
                  {t('coverage.partialTitle', { ran: coverage.okCount, total: coverage.attempted.length })}
                </Strip>
              )}
              {runDiff && !runDiffDismissed && !busy && (
                <Strip
                  tone={runDiff.scoreDelta > 0 ? 'ok' : runDiff.scoreDelta < 0 ? 'danger' : 'info'}
                  onDismiss={() => setRunDiffDismissed(true)}
                >
                  {t('runDiff.summary', { resolved: runDiff.resolved, added: runDiff.added })}
                  {runDiff.scoreDelta !== 0 ? ` · ${t('runDiff.scoreDelta', { delta: `${runDiff.scoreDelta > 0 ? '+' : ''}${runDiff.scoreDelta}` })}` : ''}
                </Strip>
              )}
              {mutedCount > 0 && !busy && (
                <Strip tone="info" action={{ label: t('waivers.restoreAll'), onClick: unmuteAll }}>
                  {t('waivers.mutedCount', { count: mutedCount })}
                </Strip>
              )}
            </div>

            {/* Fix first */}
            {!busy && result && topFix.length > 0 && (
              <div className="px-4 pt-3">
                <div className="rounded-2xl p-3.5" style={{ background: 'var(--surface-2)', border: '1px solid var(--border)' }}>
                  <div className="flex items-baseline gap-1.5 mb-2.5">
                    <span className="text-[12px] font-semibold" style={{ color: scoreColor(score ?? 0) }}>{grade}</span>
                    <span className="text-[10px] text-[var(--text-faint)]">·</span>
                    <span className="text-[10px] font-semibold uppercase tracking-wider text-[var(--text-faint)]">{t('summary.fixFirst')}</span>
                  </div>
                  <div className="flex flex-col gap-1.5">
                    {topFix.map((c, i) => (
                      <button
                        key={c.ruleId}
                        onClick={() => { setFilters({ groupBy: 'rule', activeTab: 'all' }); setSearch(''); setOpenGroups((p) => new Set(p).add(c.ruleId)); setShownAll((p) => new Set(p).add(c.ruleId)) }}
                        className="flex items-center gap-2.5 w-full text-left py-2 px-2.5 rounded-xl active:scale-[0.99] transition-transform"
                        style={{ background: 'var(--bg)', ...TAP }}
                      >
                        <span className="text-[11px] font-mono text-[var(--text-faint)] w-3.5 shrink-0 text-center">{i + 1}</span>
                        <span className="text-[12.5px] text-[var(--text)] font-medium truncate flex-1 min-w-0">
                          {getRuleLabel(c.ruleId, language)}
                          <span className="text-[var(--text-faint)] font-mono ml-1.5">{c.count}</span>
                        </span>
                        <span className="text-[11px] font-mono font-semibold shrink-0" style={{ color: 'var(--ok)' }}>
                          {t('summary.points', { points: Math.max(1, Math.round(c.penalty)) })}
                        </span>
                      </button>
                    ))}
                  </div>
                </div>
              </div>
            )}

            {/* Filters */}
            {result && issues.length > 0 && (
              <div className="px-4 pt-3 flex flex-col gap-2.5">
                <div className="flex items-center gap-2 overflow-x-auto no-scrollbar -mx-4 px-4">
                  <Chip active={filters.activeTab === 'all'} onClick={() => setFilters({ activeTab: 'all' })}>{t('filters.all')} {stats ? stats.total : ''}</Chip>
                  {(stats?.errors ?? 0) > 0 && <Chip active={filters.activeTab === 'errors'} color="var(--danger)" onClick={() => setFilters({ activeTab: filters.activeTab === 'errors' ? 'all' : 'errors' })}>{stats!.errors}E</Chip>}
                  {(stats?.warnings ?? 0) > 0 && <Chip active={filters.activeTab === 'warnings'} color="var(--warn)" onClick={() => setFilters({ activeTab: filters.activeTab === 'warnings' ? 'all' : 'warnings' })}>{stats!.warnings}W</Chip>}
                  {(stats?.info ?? 0) > 0 && <Chip active={filters.activeTab === 'info'} color="#5E9ED6" onClick={() => setFilters({ activeTab: filters.activeTab === 'info' ? 'all' : 'info' })}>{stats!.info}I</Chip>}
                  <span className="w-px h-5 bg-[var(--border)] shrink-0 mx-0.5" />
                  {(['rule', 'storey', 'class'] as GroupBy[]).map((g) => (
                    <Chip key={g} active={filters.groupBy === g} onClick={() => setFilters({ groupBy: g })}>{t(`filters.${g}`)}</Chip>
                  ))}
                </div>
                {sceneModels.length > 1 && (
                  <div className="flex items-center gap-2 overflow-x-auto no-scrollbar -mx-4 px-4">
                    <Chip active={modelFilter === null} onClick={() => setModelFilter(null)}>{t('allModels')}</Chip>
                    {sceneModels.map((m) => {
                      const count = issues.filter((i) => i.modelId === m.id).length
                      return (
                        <Chip key={m.id} active={modelFilter === m.id} onClick={() => setModelFilter(m.id === modelFilter ? null : m.id)}>
                          <span className="max-w-[120px] truncate inline-block align-bottom">{m.fileName.replace(/\.ifc$/i, '')}</span>
                          {count > 0 ? ` ${count}` : ''}
                        </Chip>
                      )
                    })}
                  </div>
                )}
                <MobileSearch value={search} onChange={setSearch} placeholder={t('filters.search')} />
              </div>
            )}

            {/* Issue groups */}
            {!busy && (
              <div className="px-4 pt-3 flex flex-col gap-2.5">
                {issues.length === 0 ? (
                  <MobileEmpty
                    icon={<ShieldIcon size={30} />}
                    text={!hasModel ? t('empty.noModel')
                      : validationStatus === 'error' ? (validationError ?? t('empty.validationError'))
                      : result === null ? t('empty.modelReady')
                      : t('results.noIssues')}
                    action={result === null && hasModel ? { label: t('run.validate'), onClick: onRun } : undefined}
                  />
                ) : orderedGroups.length === 0 ? (
                  <MobileEmpty text={t('results.noIssues')} />
                ) : (
                  orderedGroups.map(([groupKey, groupIssues]) => (
                    <IssueGroup
                      key={groupKey}
                      groupKey={groupKey}
                      groupIssues={groupIssues}
                      groupBy={filters.groupBy}
                      language={language}
                      open={openGroups.has(groupKey)}
                      showAll={shownAll.has(groupKey)}
                      onToggle={() => toggleGroup(groupKey)}
                      onShowAll={() => setShownAll((p) => new Set(p).add(groupKey))}
                      remediationTool={remediationTool}
                      onSelectTool={setRemediationTool}
                      pendingFixIds={pendingFixIds}
                      onJumpTo={onJumpTo}
                      onAutoFix={onAutoFix}
                      onNameFix={onNameFix}
                      onMute={onMute}
                      onAddToBcf={onAddToBcf}
                    />
                  ))
                )}
              </div>
            )}
          </div>
        )}
      </MobileSheet>

      <MobileActionSheet open={actionsOpen} title={t('panel.title')} actions={overflowActions} onClose={() => setActionsOpen(false)} />
      <MobileActionSheet open={profileOpen} title={t('profile.label', { defaultValue: 'Profile' })} actions={profileActions} onClose={() => setProfileOpen(false)} />

      {exportOpen && exportModels.length > 0 && (
        <ValidationExportModal
          models={exportModels}
          rules={rules}
          activeProfileId={activeProfileId}
          customProfiles={customProfiles}
          resolveProfileName={resolveProfileName}
          takeSnapshot={viewer?.takeSnapshot}
          onClose={() => setExportOpen(false)}
        />
      )}
    </>
  )
}

// ── Issue group card ──────────────────────────────────────────────────────────

function IssueGroup({
  groupKey, groupIssues, groupBy, language, open, showAll, onToggle, onShowAll,
  remediationTool, onSelectTool, pendingFixIds, onJumpTo, onAutoFix, onNameFix, onMute, onAddToBcf,
}: {
  groupKey: string
  groupIssues: ValidationIssue[]
  groupBy: GroupBy
  language: string
  open: boolean
  showAll: boolean
  onToggle: () => void
  onShowAll: () => void
  remediationTool: AuthoringTool
  onSelectTool: (t: AuthoringTool) => void
  pendingFixIds: Set<number>
  onJumpTo: (i: ValidationIssue) => void
  onAutoFix: (i: ValidationIssue) => void
  onNameFix: (i: ValidationIssue, field: 'Name' | 'LongName', v: string) => void
  onMute: (i: ValidationIssue) => void
  onAddToBcf: (i: ValidationIssue) => void
}) {
  const { t } = useTranslation('validation')
  const label = groupBy === 'rule' ? getRuleLabel(groupKey, language) : groupKey
  const meta = groupBy === 'rule' ? RULE_METADATA[groupKey] : undefined
  const headColor = meta?.defaultSeverity === 'error' ? 'var(--danger)' : meta?.defaultSeverity === 'warning' ? 'var(--warn)' : 'var(--text-dim)'

  let e = 0, w = 0, inf = 0
  for (const i of groupIssues) { if (i.severity === 'error') e++; else if (i.severity === 'warning') w++; else inf++ }

  const remediation = groupBy === 'rule' ? getRuleRemediation(groupKey, language) : null
  const visible = showAll ? groupIssues : groupIssues.slice(0, PREVIEW)
  const hidden = groupIssues.length - visible.length

  return (
    <div className="rounded-2xl overflow-hidden" style={{ background: 'var(--surface-2)', border: '1px solid var(--border)' }}>
      <button onClick={onToggle} className="w-full flex items-center gap-2.5 px-3.5 py-3 text-left active:bg-[rgba(255,255,255,0.03)]" style={TAP}>
        <Icons.Chevron size={13} className={`text-[var(--text-faint)] shrink-0 transition-transform ${open ? 'rotate-90' : ''}`} />
        <span className="text-[12px] font-semibold uppercase tracking-wider truncate flex-1 min-w-0" style={{ color: headColor }}>{label}</span>
        <span className="flex items-center gap-1.5 shrink-0 font-mono text-[10px]">
          {e > 0 && <span style={{ color: 'var(--danger)' }}>{e}E</span>}
          {w > 0 && <span style={{ color: 'var(--warn)' }}>{w}W</span>}
          {inf > 0 && <span style={{ color: '#5E9ED6' }}>{inf}I</span>}
        </span>
        <span className="w-6 text-right text-[11px] font-mono text-[var(--text-faint)] shrink-0">{groupIssues.length}</span>
      </button>

      {open && (
        <div className="px-2.5 pb-2.5 flex flex-col gap-2">
          {remediation && (
            <MobileRemediation ruleId={groupKey} language={language} tool={remediationTool} onSelectTool={onSelectTool} />
          )}
          {visible.map((issue) => (
            <IssueCard
              key={issue.id}
              issue={issue}
              hasPendingFix={pendingFixIds.has(issue.expressId)}
              onJumpTo={onJumpTo}
              onAutoFix={onAutoFix}
              onNameFix={onNameFix}
              onMute={onMute}
              onAddToBcf={onAddToBcf}
            />
          ))}
          {hidden > 0 && (
            <button onClick={onShowAll} className="h-10 rounded-xl text-[12px] font-medium text-[var(--accent-2)] active:scale-[0.98] transition-transform" style={{ background: 'var(--bg)', ...TAP }}>
              {t('filters.showMore', { count: hidden })}
            </button>
          )}
        </div>
      )}
    </div>
  )
}

// ── Issue card ────────────────────────────────────────────────────────────────

function IssueCard({
  issue, hasPendingFix, onJumpTo, onAutoFix, onNameFix, onMute, onAddToBcf,
}: {
  issue: ValidationIssue
  hasPendingFix: boolean
  onJumpTo: (i: ValidationIssue) => void
  onAutoFix: (i: ValidationIssue) => void
  onNameFix: (i: ValidationIssue, field: 'Name' | 'LongName', v: string) => void
  onMute: (i: ValidationIssue) => void
  onAddToBcf: (i: ValidationIssue) => void
}) {
  const { t, i18n } = useTranslation('validation')
  const [editing, setEditing] = useState(false)
  const [editValue, setEditValue] = useState('')
  const inputRef = useRef<HTMLInputElement>(null)
  const isNameEditable = NAME_EDIT_RULES.has(issue.ruleId)
  const ruleMeta = RULE_METADATA[issue.ruleId]
  const ruleLabel = getRuleLabel(issue.ruleId, i18n.language)
  const ruleColor = ruleMeta?.defaultSeverity === 'error' ? 'var(--danger)' : ruleMeta?.defaultSeverity === 'warning' ? 'var(--warn)' : '#5E9ED6'

  useLayoutEffect(() => { if (editing) inputRef.current?.focus() }, [editing])

  const startEdit = (): void => { setEditValue(issue.elementName === '(empty)' ? '' : issue.elementName); setEditing(true) }
  const commit = (): void => {
    const v = editValue.trim()
    if (v) onNameFix(issue, editField(issue.ruleId), v)
    setEditing(false)
  }

  return (
    <div className="rounded-xl overflow-hidden" style={{ background: 'var(--bg)', border: '1px solid var(--border)', borderLeft: `3px solid ${hasPendingFix ? 'var(--ok)' : sevColor(issue.severity)}` }}>
      <div className="px-3 py-2.5 flex flex-col gap-1.5">
        <div className="flex items-center gap-2 flex-wrap">
          <span className="px-1.5 py-0.5 rounded text-[9px] font-mono font-bold leading-none" style={{ background: `${ruleColor}18`, color: ruleColor, border: `1px solid ${ruleColor}30` }}>{ruleLabel}</span>
          {hasPendingFix && <span className="text-[9px] font-mono text-[var(--ok)] border border-[var(--ok)] border-opacity-30 px-1 rounded leading-none">{t('issue.edited')}</span>}
          <span className="text-[10px] text-[var(--text-faint)] font-mono ml-auto shrink-0">{issue.ifcClass}</span>
        </div>
        <div className="text-[13px] text-[var(--text)] font-medium break-words">{issue.elementName}</div>
        <p className="text-[11.5px] text-[var(--text-dim)] leading-snug m-0">{issue.message}</p>
        {issue.path.length > 0 && (
          <span className="text-[10px] text-[var(--text-faint)] truncate" title={issue.path.join(' › ')}>{issue.path.join(' › ')}</span>
        )}

        {editing && (
          <div className="flex items-center gap-1.5 mt-1">
            <input
              ref={inputRef}
              value={editValue}
              onChange={(e) => setEditValue(e.target.value)}
              onKeyDown={(e) => { if (e.key === 'Enter') commit(); if (e.key === 'Escape') setEditing(false) }}
              placeholder={t('issue.newNamePlaceholder', { field: editField(issue.ruleId) })}
              className="flex-1 h-10 px-3 rounded-lg bg-[var(--surface-2)] border border-[var(--accent)] text-[13px] text-[var(--text)] outline-none"
              style={TAP}
            />
            <button onClick={commit} className="h-10 px-3.5 rounded-lg text-[12.5px] font-semibold text-white" style={{ background: 'var(--accent)', ...TAP }}>{t('issue.apply')}</button>
          </div>
        )}

        {/* Actions */}
        <div className="flex items-center gap-1.5 mt-1.5">
          <button onClick={() => onJumpTo(issue)} className="h-9 px-3.5 rounded-lg text-[12px] font-semibold text-white flex items-center gap-1.5 active:scale-[0.97] transition-transform" style={{ background: 'var(--accent)', ...TAP }}>
            <EyeIcon />{t('issue.view')}
          </button>
          {isNameEditable ? (
            <button onClick={() => (editing ? setEditing(false) : startEdit())} className="h-9 px-3 rounded-lg text-[12px] font-medium active:scale-[0.97] transition-transform" style={{ background: 'var(--accent)14', color: 'var(--accent-2)', border: '1px solid var(--accent)33', ...TAP }}>
              {editing ? t('issue.cancel') : hasPendingFix ? t('issue.reEdit') : t('issue.rename')}
            </button>
          ) : issue.autoFixable ? (
            <button onClick={() => onAutoFix(issue)} className="h-9 px-3 rounded-lg text-[12px] font-medium active:scale-[0.97] transition-transform" style={{ background: 'var(--ok)14', color: 'var(--ok)', border: '1px solid var(--ok)33', ...TAP }}>
              {t('issue.applyFix')}
            </button>
          ) : null}
          <div className="flex-1" />
          <button onClick={() => onAddToBcf(issue)} aria-label={t('issue.addToBcf')} className="w-9 h-9 rounded-lg flex items-center justify-center text-[var(--text-faint)] active:scale-90 transition-transform" style={{ background: 'var(--surface-2)', border: '1px solid var(--border)', ...TAP }}>
            <svg width="13" height="13" viewBox="0 0 10 10" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round"><path d="M5 1v8M1 5h8" /></svg>
          </button>
          <button onClick={() => onMute(issue)} aria-label={t('waivers.mute')} className="w-9 h-9 rounded-lg flex items-center justify-center text-[var(--text-faint)] active:scale-90 transition-transform" style={{ background: 'var(--surface-2)', border: '1px solid var(--border)', ...TAP }}>
            <svg width="13" height="13" viewBox="0 0 12 12" fill="none" stroke="currentColor" strokeWidth="1.3" strokeLinecap="round" strokeLinejoin="round"><path d="M2 4.5h2L6.5 2.5v7L4 7.5H2z" /><path d="M8 4.5l2.5 3M10.5 4.5l-2.5 3" /></svg>
          </button>
        </div>
      </div>
    </div>
  )
}

// ── Compact remediation ───────────────────────────────────────────────────────

function MobileRemediation({ ruleId, language, tool, onSelectTool }: {
  ruleId: string
  language: string
  tool: AuthoringTool
  onSelectTool: (t: AuthoringTool) => void
}) {
  const { t } = useTranslation('validation')
  const remediation = getRuleRemediation(ruleId, language)
  if (!remediation) return null
  const steps = remediation.tools[tool]
  return (
    <div className="rounded-xl p-3" style={{ background: 'var(--surface)', border: '1px solid var(--border)' }}>
      <div className="text-[10px] font-semibold uppercase tracking-wider text-[var(--text-dim)] mb-1.5">{t('remediation.howToFix')}</div>
      <p className="text-[11.5px] text-[var(--text-dim)] leading-relaxed m-0 mb-2">{remediation.summary}</p>
      <div className="flex items-center gap-1.5 overflow-x-auto no-scrollbar -mx-1 px-1 mb-2">
        {AUTHORING_TOOLS.map((tl) => {
          const active = tl === tool
          return (
            <button key={tl} onClick={() => onSelectTool(tl)} className="shrink-0 h-7 px-2.5 rounded-full text-[11px] font-medium" style={{ background: active ? 'var(--accent)18' : 'var(--surface-2)', color: active ? 'var(--accent-2)' : 'var(--text-faint)', border: `1px solid ${active ? 'var(--accent)40' : 'var(--border)'}`, ...TAP }}>
              {t(`remediation.tools.${tl}`)}
            </button>
          )
        })}
      </div>
      <p className="text-[11.5px] leading-relaxed m-0" style={{ color: steps ? 'var(--text)' : 'var(--text-faint)' }}>
        {steps ?? t('remediation.noToolSteps', { tool: t(`remediation.tools.${tool}`) })}
      </p>
      <a href={fixGuideUrl(ruleId, language)} target="_blank" rel="noopener noreferrer" className="inline-flex items-center gap-1 mt-2 text-[11px] font-semibold text-[var(--accent-2)]">
        {t('remediation.fullGuide')}
        <svg width="10" height="10" viewBox="0 0 12 12" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round"><path d="M2.5 6h7M6.5 3l3 3-3 3" /></svg>
      </a>
    </div>
  )
}

// ── Icons (local, to keep the sheet self-contained) ───────────────────────────

const ShieldIcon = ({ size = 15 }: { size?: number }) => (
  <svg width={size} height={size} viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.4" strokeLinejoin="round"><path d="M8 1.5l5.5 2v4c0 3.2-2.3 5.6-5.5 6.5C4.8 13.1 2.5 10.7 2.5 7.5v-4z" /><path d="M5.5 8l1.8 1.8L11 6" strokeLinecap="round" /></svg>
)
const EyeIcon = () => (
  <svg width="12" height="12" viewBox="0 0 14 14" fill="none" stroke="currentColor" strokeWidth="1.4"><path d="M1 7s2.2-4 6-4 6 4 6 4-2.2 4-6 4-6-4-6-4z" /><circle cx="7" cy="7" r="1.6" /></svg>
)
const ShareIcon = () => (
  <svg width="16" height="16" viewBox="0 0 10 10" fill="none" stroke="currentColor" strokeWidth="1.2" strokeLinecap="round" strokeLinejoin="round"><circle cx="7.5" cy="2" r="1.5" /><circle cx="7.5" cy="8" r="1.5" /><circle cx="2" cy="5" r="1.5" /><path d="M3.4 4.3l2.7-1.6M3.4 5.7l2.7 1.6" /></svg>
)
const SparkIcon = () => (
  <svg width="16" height="16" viewBox="0 0 12 12" fill="currentColor"><path d="M6 1l1.1 3.9L11 6l-3.9 1.1L6 11l-1.1-3.9L1 6l3.9-1.1Z" /></svg>
)
const BadgeIcon = () => (
  <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M12 2l2.5 7.5H22l-6 4.5 2.3 7.5L12 17l-6.3 4.5L8 14 2 9.5h7.5z" /></svg>
)
const ExportIcon = () => (
  <svg width="16" height="16" viewBox="0 0 13 13" fill="none" stroke="currentColor" strokeWidth="1.4" strokeLinecap="round"><path d="M6.5 1v7M3.5 5.5l3 3.5 3-3.5M1 10v2h11v-2" /></svg>
)
