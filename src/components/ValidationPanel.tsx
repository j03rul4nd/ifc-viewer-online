// ─── ValidationPanel ─────────────────────────────────────────────────────────
// Bottom panel with drag-to-resize handle, 2-row header, profile card-grid
// dropdown, compact coverage strip, responsive toolbar, redesigned issue rows,
// 3-state run button, 3 SVG empty states, and BCF tab.

import React, {
  useState, useRef, useEffect, useMemo, useCallback, useLayoutEffect,
} from 'react'
import { createPortal } from 'react-dom'
import Bimo from './mascot/Bimo'
import { emotionForScore } from './mascot/bimo-face'
import { useVirtualizer } from '@tanstack/react-virtual'
import { useTranslation } from 'react-i18next'
import type { TFunction } from 'i18next'
import { useShallow } from 'zustand/react/shallow'
import { useValidationStore } from '../stores/validationStore'
import { useEditorStore } from '../stores/editorStore'
import { useUIStore } from '../stores/uiStore'
import { useModelStore } from '../stores/modelStore'
import { useSceneStore } from '../stores/sceneStore'
import { useBcfStore } from '../stores/bcfStore'
import { useWaiverStore, issueKey } from '../stores/waiverStore'
import { diffResults } from '../lib/validation-diff'
import type { ValidationDiff } from '../lib/validation-diff'
import { toast, toastFromError } from '../stores/toastStore'
import { buildFixGuidCommand, buildRenameCommand, pendingNamesForModel } from '../lib/diffStore'
import { useBatchFixStore, type FixBatch } from '../stores/batchFixStore'
import { buildPendingIndex, type PendingIndex } from '../lib/fix/pending'
import {
  countBatchTargets, fixIssueKey, isBatchRenameRule, planBatchRename, planToCommands,
  type BatchRenamePlan, type BatchRenameRule,
} from '../lib/fix/batch-rename'
import type { ParsedPattern } from '../lib/fix/name-pattern'
import { predictScoreAfter } from '../lib/fix/score-delta'
import { runFixChecks, summarizeFixBatch } from '../lib/fix/fix-run'
import { benchmarkCandidates, defaultBenchmarkDeps } from '../lib/benchmark-guard'
import { pickUpsellRule } from '../lib/pricing/catalog'
import { modelRegistry } from '../lib/model-registry'
import { DEMO_FILENAMES } from '../demo-models/models'
import BatchRenameDialog, { type BatchRenameApply } from './fix/BatchRenameDialog'
import BatchFixResultCard, { BatchFixBar, downloadFixedRun, fixCardView } from './fix/BatchFixResultCard'
import { useEditorHistory } from '../hooks/useEditorHistory'
import { runValidation, runValidationAll, explainQualityScore, calculateQualityScore } from '../lib/validator'
import type { ScoreContribution } from '../lib/validator'
import { issuesToBcfTopics } from '../lib/bcf'
import type {
  ValidationIssue, ValidationResult, ViewerHandle,
  ValidationCategoryType, ValidationProfile, ValidationCoverage,
} from '../types'
import { VALIDATION_PROFILES, RULE_METADATA, RULE_COUNT, getRuleLabel, getRuleRemediation, AUTHORING_TOOLS } from '../types'
import type { AuthoringTool } from '../types'
import { fixGuideUrl } from '../lib/fix-guide-url'
import { getCoveredCategories, ALL_CATEGORIES } from './ValidationCoverageSummary'
import BcfPanel from './BcfPanel'
import { useIdsStore } from '../stores/idsStore'
import { ColumnStrip } from './ColumnStrip'
import CustomProfileModal from './CustomProfileModal'
import ValidationExportModal, { type ExportModelEntry } from './ValidationExportModal'
import { getRecentRuns, getAverageQualityScore, getMostUsedRules } from '../lib/validation-analytics'
import type { ValidationRunRecord } from '../lib/validation-analytics'
import {
  trackGuidFixed, trackShareReportClicked, trackValidationPanelOpened,
  trackIssueViewed, trackIssueFixApplied, trackFixFirstClicked, trackValidationProfileChanged, trackFeatureUsed,
} from '../lib/analytics'
import { buildShareUrl, buildBadgeMarkdown, validationResultToSharePayload } from '../lib/share-report'
import { postBenchmark, fetchBenchmark, benchmarkReady, type BenchStats } from '../lib/benchmark'
import { useIsMobile } from '../hooks/useIsMobile'
import ValidationPanelMobile from './mobile/ValidationPanelMobile'
import ScoreUpsell from './pricing/ScoreUpsell'
import { FloodValidationSlot } from '../features/flood/ui/FloodValidationSlot'
import { DRAWER_MIN_PX, drawerHeightCss } from '../lib/ui/lane'
import { useLaneStore, selectDrawerReservePx } from '../stores/laneStore'
import { DrawerResizeGrip } from './DrawerResizeGrip'

// ── Profile i18n ────────────────────────────────────────────────────────────
// Built-in profiles (basic/quality/coordination/iso19650/lod300) resolve their
// name + description from the `profile.<id>` keys in the active locale.
// User-created custom profiles have no translation key, so their stored name
// falls through via defaultValue.

function localizedProfileName(p: { id: string; name: string }, t: TFunction<'validation'>): string {
  return t(`profile.${p.id}.name`, { defaultValue: p.name })
}

function localizedProfileDescription(p: { id: string; description: string }, t: TFunction<'validation'>): string {
  return t(`profile.${p.id}.description`, { defaultValue: p.description })
}

// Total number of validation rules in the catalogue. Uses the canonical
// RULE_COUNT (same derivation as the signed certificate's `+rN` suffix);
// rule-count.test.ts asserts RULE_METADATA stays in sync with it.
const TOTAL_RULE_COUNT = RULE_COUNT

/**
 * Copy text to the clipboard. Uses the async Clipboard API when available and
 * falls back to a hidden-textarea + execCommand for non-secure contexts / older
 * browsers, so the Share action degrades gracefully instead of throwing.
 */
async function copyToClipboard(text: string): Promise<boolean> {
  try {
    if (navigator.clipboard?.writeText) {
      await navigator.clipboard.writeText(text)
      return true
    }
  } catch {
    // fall through to the legacy path
  }
  try {
    const ta = document.createElement('textarea')
    ta.value = text
    ta.setAttribute('readonly', '')
    ta.style.position = 'fixed'
    ta.style.opacity = '0'
    document.body.appendChild(ta)
    ta.select()
    const ok = document.execCommand('copy')
    document.body.removeChild(ta)
    return ok
  } catch {
    return false
  }
}

// Files already posted to the benchmark this session, by file identity (the
// OPFS cache key, else the model id). Module-level so a remount, a Re-validate
// or a profile change never counts the same delivered file twice.
const benchPostedKeys = new Set<string>()

/** The rules "Fix all N" renames, in the order the panel offers them. */
const BATCH_RULE_IDS: readonly BatchRenameRule[] = ['RULE_DUPLICATE_NAME', 'RULE_EMPTY_NAME']

/**
 * RULE_DUPLICATE_NAME issues the pending edits already settle: every other
 * member of the element's group (same parent, same name) has a pending
 * rename, so the exported file has that name once. Keep-first leaves exactly
 * such a member behind; counted as a target, it would keep "Fix all 1" on
 * screen after the batch, offering a rename that clears nothing. `all` holds
 * the muted issues too: a muted member keeps its name, so its group is not
 * settled. Groups are only known for issues that carry `scopeId`.
 */
function settledDuplicateKeys(
  all: readonly ValidationIssue[],
  pending: PendingIndex,
  fallbackModelId: string | undefined,
): Set<string> {
  const members = new Map<string, number>()
  const left = new Map<string, ValidationIssue[]>()
  for (const i of all) {
    if (i.ruleId !== 'RULE_DUPLICATE_NAME' || typeof i.scopeId !== 'number') continue
    const modelId = i.modelId ?? fallbackModelId
    const group = `${modelId ?? ''}\u0001${i.scopeId}\u0001${i.elementName}`
    members.set(group, (members.get(group) ?? 0) + 1)
    if (pending.hasName(modelId, i.expressId)) continue
    const list = left.get(group)
    if (list) list.push(i)
    else left.set(group, [i])
  }
  const settled = new Set<string>()
  for (const [group, remaining] of left) {
    if (remaining.length === 1 && (members.get(group) ?? 0) > 1) settled.add(fixIssueKey(remaining[0]))
  }
  return settled
}

// ── Copy for AI — plain-text report optimised for pasting into Claude / ChatGPT ──
// Pure function, no side-effects. Formats Health Score + issues into structured
// text that any LLM can consume without needing to parse JSON or HTML.
function buildCopyForAIText(result: ValidationResult, fileName: string): string {
  const score = result.qualityScore ?? 0
  const grade =
    score >= 85 ? 'Excellent' :
    score >= 70 ? 'Good'      :
    score >= 50 ? 'Fair'      :
    score >= 30 ? 'Poor'      : 'Critical'
  const { errors, warnings, info, total } = result.stats

  const lines: string[] = [
    `IFC Health Score: ${score}/100 (${grade})`,
    `File: ${fileName}`,
    `Issues: ${total === 0 ? 'none — model is clean' : `${total} found — ${errors} error${errors !== 1 ? 's' : ''}, ${warnings} warning${warnings !== 1 ? 's' : ''}, ${info} info`}`,
    `Validation time: ${result.durationMs} ms`,
    '',
  ]

  if (total === 0) {
    lines.push('No issues detected. Model passed all validation rules.')
    return lines.join('\n')
  }

  const groups: [ValidationIssue['severity'], string][] = [
    ['error',   'ERRORS'],
    ['warning', 'WARNINGS'],
    ['info',    'INFO'],
  ]

  const MAX_PER_GROUP = 15

  for (const [sev, heading] of groups) {
    const bucket = result.issues.filter(i => i.severity === sev)
    if (bucket.length === 0) continue

    lines.push(`${heading} (${bucket.length})`)
    lines.push('─'.repeat(36))

    bucket.slice(0, MAX_PER_GROUP).forEach(iss => {
      const name = iss.elementName ? ` "${iss.elementName}"` : ''
      lines.push(`• [${iss.ruleId}] ${iss.ifcClass}${name}`)
      lines.push(`  ${iss.message}`)
    })
    if (bucket.length > MAX_PER_GROUP) {
      lines.push(`  … and ${bucket.length - MAX_PER_GROUP} more`)
    }
    lines.push('')
  }

  lines.push('─'.repeat(36))
  lines.push('Source: IFC Viewer Online')

  return lines.join('\n')
}

// ── Severity helpers ──────────────────────────────────────────────────────────

function severityBorderColor(sev: ValidationIssue['severity']): string {
  if (sev === 'error')   return 'var(--danger)'
  if (sev === 'warning') return '#F5A623'
  return '#5E9ED6'
}

function SeverityDot({ severity }: { severity: ValidationIssue['severity'] }) {
  return (
    <span
      className="shrink-0 w-1.5 h-1.5 rounded-full mt-1.5"
      style={{ background: severityBorderColor(severity), flexShrink: 0 }}
    />
  )
}

// ── Rule badge ────────────────────────────────────────────────────────────────

function RuleBadge({ ruleId }: { ruleId: string }) {
  const { i18n } = useTranslation('validation')
  const meta   = RULE_METADATA[ruleId]
  const label  = getRuleLabel(ruleId, i18n.language)
  const sev    = meta?.defaultSeverity ?? 'info'
  const color  = sev === 'error' ? 'var(--danger)' : sev === 'warning' ? '#F5A623' : '#5E9ED6'
  const std    = meta?.standard

  return (
    <span className="inline-flex items-center gap-1">
      <span
        className="px-1.5 py-0.5 rounded text-[9px] font-mono font-bold leading-none shrink-0"
        style={{ background: `${color}18`, color, border: `1px solid ${color}30` }}
        title={std ? `${label} · ${std}` : label}
      >
        {label}
      </span>
      {std && (
        <span className="text-[9px] text-[var(--text-faint)] font-mono leading-none shrink-0 hidden sm:inline">
          {std}
        </span>
      )}
    </span>
  )
}

// ── Path breadcrumb ───────────────────────────────────────────────────────────

function PathBreadcrumb({ path }: { path: string[] }) {
  if (path.length === 0) return null
  return (
    <span
      className="text-[10px] text-[var(--text-faint)] truncate max-w-[200px]"
      title={path.join(' › ')}
    >
      {path.join(' › ')}
    </span>
  )
}

// ── Which rules allow inline name editing ─────────────────────────────────────

const NAME_EDIT_RULES = new Set([
  'RULE_EMPTY_NAME', 'RULE_EMPTY_LONGNAME', 'RULE_DUPLICATE_NAME', 'RULE_NAMING_CONVENTION',
])

function getEditField(ruleId: string): 'Name' | 'LongName' {
  return ruleId === 'RULE_EMPTY_LONGNAME' ? 'LongName' : 'Name'
}

// ── Issue row ─────────────────────────────────────────────────────────────────

function IssueRow({
  issue, hasPendingFix, onJumpTo, onAutoFix, onNameFix, onAddToBcf, onMute,
}: {
  issue: ValidationIssue
  hasPendingFix: boolean
  onJumpTo: (issue: ValidationIssue) => void
  onAutoFix: (issue: ValidationIssue) => void
  onNameFix: (issue: ValidationIssue, field: 'Name' | 'LongName', newValue: string) => void
  onAddToBcf?: (issue: ValidationIssue) => void
  onMute?: (issue: ValidationIssue) => void
}) {
  const { t } = useTranslation('validation')
  const [editing, setEditing]     = useState(false)
  const [editValue, setEditValue] = useState('')
  const inputRef = useRef<HTMLInputElement>(null)
  const isNameEditable = NAME_EDIT_RULES.has(issue.ruleId)

  const startEdit = (): void => {
    setEditValue(issue.elementName === '(empty)' ? '' : issue.elementName)
    setEditing(true)
  }

  useLayoutEffect(() => {
    if (editing) inputRef.current?.focus()
  }, [editing])

  const commitEdit = (): void => {
    const trimmed = editValue.trim()
    if (trimmed) onNameFix(issue, getEditField(issue.ruleId), trimmed)
    setEditing(false)
  }

  const borderColor = hasPendingFix ? 'var(--ok)' : severityBorderColor(issue.severity)

  return (
    <>
      <div
        className="flex items-start gap-2.5 px-3 py-2.5 border-b border-[var(--border)] hover:bg-[var(--surface-2)] group transition-colors"
        style={{ borderLeft: `3px solid ${borderColor}`, paddingLeft: 10 }}
      >
        <SeverityDot severity={issue.severity} />

        {/* Main content */}
        <div className="flex-1 min-w-0 flex flex-col gap-1">
          {/* Row 1: rule badge + edited badge */}
          <div className="flex items-center gap-2 flex-wrap min-w-0">
            <RuleBadge ruleId={issue.ruleId} />
            {hasPendingFix && (
              <span className="text-[9px] font-mono text-[var(--ok)] border border-[var(--ok)]33 px-1 rounded leading-none">
                {t('issue.edited')}
              </span>
            )}
          </div>
          {/* Row 2: element name + class */}
          <div className="flex items-center gap-2 min-w-0">
            <span className="text-[12px] text-[var(--text)] font-medium truncate max-w-[180px]">
              {issue.elementName}
            </span>
            <span className="text-[10px] text-[var(--text-faint)] font-mono shrink-0">
              {issue.ifcClass}
            </span>
          </div>
          {/* Row 3: message */}
          <p className="text-[11px] text-[var(--text-dim)] leading-snug">{issue.message}</p>
          <PathBreadcrumb path={issue.path} />
        </div>

        {/* Actions */}
        <div className="flex items-center gap-1 shrink-0 opacity-0 group-hover:opacity-100 [@media(pointer:coarse)]:opacity-100 transition-opacity">
          {isNameEditable && (
            <button
              onClick={() => editing ? setEditing(false) : startEdit()}
              className="px-2 h-6 rounded text-[10px] font-medium border transition-colors"
              style={
                editing
                  ? { background: 'var(--surface-2)', color: 'var(--text-dim)', borderColor: 'var(--border)' }
                  : { background: 'var(--accent)18', color: 'var(--accent)', borderColor: 'var(--accent)33' }
              }
            >
              {editing ? t('issue.cancel') : hasPendingFix ? t('issue.reEdit') : t('issue.rename')}
            </button>
          )}
          {issue.autoFixable && !isNameEditable && (
            <button
              onClick={() => onAutoFix(issue)}
              className="px-2 h-6 rounded text-[10px] font-medium border transition-colors"
              style={{ background: 'var(--ok)18', color: 'var(--ok)', borderColor: 'var(--ok)33' }}
            >
              {t('issue.applyFix')}
            </button>
          )}
          <button
            onClick={() => onJumpTo(issue)}
            className="px-2 h-6 rounded text-[10px] font-medium bg-[var(--surface-2)] text-[var(--text-dim)] border border-[var(--border)] hover:text-[var(--text)] active:bg-[var(--border)] transition-colors"
          >
            {t('issue.view')}
          </button>
          {onAddToBcf && (
            <button
              onClick={() => onAddToBcf(issue)}
              title={t('issue.addToBcf')}
              className="w-6 h-6 flex items-center justify-center rounded text-[10px] font-bold bg-[var(--surface-2)] text-[var(--text-faint)] border border-[var(--border)] hover:text-[var(--accent)] hover:border-[var(--accent)] active:bg-[var(--border)] transition-colors"
            >
              <svg width="10" height="10" viewBox="0 0 10 10" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round">
                <path d="M5 1v8M1 5h8" />
              </svg>
            </button>
          )}
          {onMute && (
            <button
              onClick={() => onMute(issue)}
              title={t('waivers.mute')}
              className="w-6 h-6 flex items-center justify-center rounded bg-[var(--surface-2)] text-[var(--text-faint)] border border-[var(--border)] hover:text-[var(--text)] active:bg-[var(--border)] transition-colors"
            >
              <svg width="11" height="11" viewBox="0 0 12 12" fill="none" stroke="currentColor" strokeWidth="1.3" strokeLinecap="round" strokeLinejoin="round">
                <path d="M2 4.5h2L6.5 2.5v7L4 7.5H2z" />
                <path d="M8 4.5l2.5 3M10.5 4.5l-2.5 3" />
              </svg>
            </button>
          )}
        </div>
      </div>

      {editing && (
        <div className="flex items-center gap-2 px-3 py-2 border-b border-[var(--border)] bg-[var(--surface-2)]">
          <span className="text-[10px] text-[var(--text-dim)] shrink-0 font-medium">
            {getEditField(issue.ruleId)}:
          </span>
          <input
            ref={inputRef}
            value={editValue}
            onChange={(e) => setEditValue(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === 'Enter')  { e.preventDefault(); commitEdit() }
              if (e.key === 'Escape') setEditing(false)
            }}
            placeholder={t('issue.newNamePlaceholder', { field: getEditField(issue.ruleId) })}
            className="flex-1 h-7 px-2 text-[12px] bg-[var(--surface)] border border-[var(--accent)] rounded text-[var(--text)] placeholder:text-[var(--text-faint)] outline-none"
          />
          <button
            onClick={commitEdit}
            disabled={!editValue.trim()}
            className="px-2.5 h-7 rounded text-[11px] bg-[var(--accent)] text-white font-medium hover:brightness-110 disabled:opacity-40"
          >
            {t('issue.apply')}
          </button>
          <button
            onClick={() => setEditing(false)}
            className="w-7 h-7 flex items-center justify-center rounded text-[var(--text-faint)] hover:text-[var(--text)]"
          >
            <svg width="10" height="10" viewBox="0 0 10 10" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round">
              <path d="M2 2l6 6M8 2L2 8" />
            </svg>
          </button>
        </div>
      )}
    </>
  )
}

// ── Group header ──────────────────────────────────────────────────────────────

function GroupHeader({ label, count, ruleId }: { label: string; count: number; ruleId?: string }) {
  const meta  = ruleId ? RULE_METADATA[ruleId] : undefined
  const sev   = meta?.defaultSeverity
  const color = sev === 'error' ? 'var(--danger)' : sev === 'warning' ? '#F5A623' : undefined
  const std   = meta?.standard

  return (
    <div className="px-3 py-1.5 bg-[var(--surface)] border-b border-[var(--border)] flex items-center justify-between gap-2 sticky top-0 z-10">
      <div className="flex items-center gap-2 min-w-0">
        <span
          className="text-[10px] font-semibold uppercase tracking-wider truncate"
          style={{ color: color ?? 'var(--text-dim)' }}
        >
          {label}
        </span>
        {std && (
          <span className="text-[9px] font-mono text-[var(--text-faint)] hidden sm:block">{std}</span>
        )}
      </div>
      <span className="text-[10px] font-mono text-[var(--text-faint)] shrink-0">{count}</span>
    </div>
  )
}

// ── Issue group rows ──────────────────────────────────────────────────────────
// Each rule/storey/class group has a click-to-expand header, shows PREVIEW_ROWS
// issue rows by default, and a "Show N more" button to load the rest. Rows are
// flattened into a single virtualized list (see ValidationPanel) so a group with
// thousands of issues never mounts all its DOM nodes at once.

const PREVIEW_ROWS = 5

// Flattened row model for the virtualized issue list.
type FlatRow =
  | { kind: 'header';      groupKey: string; groupIssues: ValidationIssue[] }
  | { kind: 'remediation'; groupKey: string }
  /** "Fix all N" for a batch-renamable rule; its own row, since the header is a button. */
  | { kind: 'batchfix';    groupKey: BatchRenameRule }
  | { kind: 'issue';       groupKey: string; issue: ValidationIssue }
  | { kind: 'expander';    groupKey: string; hiddenCount: number }

interface GroupHeaderRowProps {
  groupKey: string
  groupIssues: ValidationIssue[]
  isOpen: boolean
  onToggle: () => void
  groupBy: 'rule' | 'storey' | 'class'
  language: string
}

function GroupHeaderRow({
  groupKey, groupIssues, isOpen, onToggle, groupBy, language,
}: GroupHeaderRowProps) {
  const label  = groupBy === 'rule' ? getRuleLabel(groupKey, language) : groupKey
  const meta   = groupBy === 'rule' ? RULE_METADATA[groupKey] : undefined
  const sev    = meta?.defaultSeverity
  const color  = sev === 'error' ? 'var(--danger)' : sev === 'warning' ? '#F5A623' : undefined
  const std    = meta?.standard

  // Severity distribution within this group
  let eCount = 0, wCount = 0, iCount = 0
  for (const i of groupIssues) {
    if (i.severity === 'error') eCount++
    else if (i.severity === 'warning') wCount++
    else iCount++
  }

  return (
    <button
      onClick={onToggle}
      className="w-full flex items-center gap-2 px-3 py-1.5 bg-[var(--surface)] border-b border-[var(--border)] hover:bg-[var(--surface-2)] transition-colors text-left"
    >
      {/* Chevron */}
      <svg
        width="8" height="8" viewBox="0 0 8 8" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round"
        className="shrink-0 text-[var(--text-faint)] transition-transform duration-150"
        style={{ transform: isOpen ? 'rotate(90deg)' : 'none' }}
      >
        <path d="M2 1.5L6 4L2 6.5" />
      </svg>

      {/* Label + standard */}
      <div className="flex items-center gap-2 min-w-0 flex-1">
        <span
          className="text-[10px] font-semibold uppercase tracking-wider truncate"
          style={{ color: color ?? 'var(--text-dim)' }}
        >
          {label}
        </span>
        {std && (
          <span className="text-[9px] font-mono text-[var(--text-faint)] hidden sm:block shrink-0">{std}</span>
        )}
      </div>

      {/* Per-severity counts inside the group */}
      <div className="flex items-center gap-1 shrink-0">
        {eCount > 0 && <span className="text-[9px] font-mono text-[var(--danger)]">{eCount}E</span>}
        {wCount > 0 && <span className="text-[9px] font-mono" style={{ color: '#F5A623' }}>{wCount}W</span>}
        {iCount > 0 && <span className="text-[9px] font-mono" style={{ color: '#5E9ED6' }}>{iCount}I</span>}
      </div>

      {/* Total count */}
      <span className="w-6 text-right text-[10px] font-mono text-[var(--text-faint)] shrink-0">
        {groupIssues.length}
      </span>
    </button>
  )
}

function ExpanderRow({ hiddenCount, onExpandAll }: { hiddenCount: number; onExpandAll: () => void }) {
  const { t } = useTranslation('validation')
  return (
    <button
      onClick={(e) => { e.stopPropagation(); onExpandAll() }}
      className="w-full flex items-center justify-center gap-1.5 py-2 border-b border-[var(--border)] text-[10px] text-[var(--text-faint)] hover:text-[var(--text)] hover:bg-[var(--surface-2)] transition-colors"
    >
      <svg width="8" height="8" viewBox="0 0 8 8" fill="none" stroke="currentColor" strokeWidth="1.4" strokeLinecap="round">
        <path d="M1 2.5L4 5.5L7 2.5" />
      </svg>
      {t('filters.showMore', { count: hiddenCount })}
    </button>
  )
}

// ── Remediation block ─────────────────────────────────────────────────────────
// Per-rule "how to fix in your authoring tool" guidance (D-22). Shown inside an
// expanded rule group. The selected tool is lifted to the panel so it persists
// across rules and across virtualizer remounts.

interface RemediationBlockProps {
  ruleId: string
  language: string
  selectedTool: AuthoringTool
  onSelectTool: (tool: AuthoringTool) => void
}

function RemediationBlock({ ruleId, language, selectedTool, onSelectTool }: RemediationBlockProps) {
  const { t } = useTranslation('validation')
  const remediation = getRuleRemediation(ruleId, language)
  if (!remediation) return null

  const toolSteps = remediation.tools[selectedTool]
  const guideUrl = fixGuideUrl(ruleId, language, import.meta.env.BASE_URL)

  return (
    <div className="px-3 py-2.5 border-b border-[var(--border)] bg-[var(--surface-2)]">
      <div className="flex items-center gap-1.5 mb-2">
        <svg width="11" height="11" viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.4" strokeLinecap="round" strokeLinejoin="round" className="text-[var(--text-faint)] shrink-0">
          <path d="M6 2.5a4 4 0 014 5.5c-.4.8-1 1.3-1 2.2V11H5v-.8c0-.9-.6-1.4-1-2.2a4 4 0 012-5.5z" />
          <path d="M5.5 13h3M6 14.5h2" />
        </svg>
        <span className="text-[10px] font-semibold uppercase tracking-wider text-[var(--text-dim)]">
          {t('remediation.howToFix')}
        </span>
      </div>

      <p className="text-[11px] text-[var(--text-dim)] leading-relaxed mb-2">{remediation.summary}</p>

      {/* Authoring-tool tabs */}
      <div className="flex flex-wrap gap-1 mb-2">
        {AUTHORING_TOOLS.map((tool) => {
          const active = tool === selectedTool
          return (
            <button
              key={tool}
              onClick={() => onSelectTool(tool)}
              className="text-[10px] font-medium px-2 py-0.5 rounded border transition-colors"
              style={{
                background: active ? 'var(--accent)18' : 'transparent',
                color:      active ? 'var(--accent)' : 'var(--text-faint)',
                borderColor: active ? 'var(--accent)40' : 'var(--border)',
              }}
            >
              {t(`remediation.tools.${tool}`)}
            </button>
          )
        })}
      </div>

      <p className="text-[11px] leading-relaxed" style={{ color: toolSteps ? 'var(--text)' : 'var(--text-faint)' }}>
        {toolSteps ?? t('remediation.noToolSteps', { tool: t(`remediation.tools.${selectedTool}`) })}
      </p>

      <a
        href={guideUrl}
        target="_blank"
        rel="noopener noreferrer"
        className="inline-flex items-center gap-1 mt-2.5 text-[10px] font-medium text-[var(--accent)] hover:underline"
      >
        {t('remediation.fullGuide')}
        <svg width="9" height="9" viewBox="0 0 12 12" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round">
          <path d="M2.5 6h7M6.5 3l3 3-3 3" />
        </svg>
      </a>
    </div>
  )
}

// ── Empty states ──────────────────────────────────────────────────────────────

function EmptyStateNoModel() {
  const { t } = useTranslation('validation')
  return (
    <div className="flex flex-col items-center justify-center h-full gap-3 text-center px-6 py-4">
      <svg width="48" height="48" viewBox="0 0 48 48" fill="none" className="opacity-25">
        <rect x="8" y="12" width="32" height="28" rx="3" stroke="currentColor" strokeWidth="1.5" />
        <path d="M16 12V9a2 2 0 012-2h12a2 2 0 012 2v3" stroke="currentColor" strokeWidth="1.5" />
        <path d="M18 22h12M18 28h8" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" />
        <circle cx="36" cy="34" r="7" fill="var(--surface)" stroke="currentColor" strokeWidth="1.5" />
        <path d="M36 31v3l2 2" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" />
      </svg>
      <div className="space-y-1">
        <p className="text-[12px] font-medium text-[var(--text-dim)]">{t('empty.noModel')}</p>
        <p className="text-[10px] text-[var(--text-faint)] max-w-[180px] leading-relaxed">
          {t('empty.noModelDesc')}
        </p>
      </div>
    </div>
  )
}

function EmptyStateNotValidated() {
  const { t } = useTranslation('validation')
  return (
    <div className="flex flex-col items-center justify-center h-full gap-3 text-center px-6 py-4">
      <svg width="48" height="48" viewBox="0 0 48 48" fill="none" className="opacity-25">
        <circle cx="24" cy="24" r="16" stroke="currentColor" strokeWidth="1.5" />
        <path d="M20 24l-2-2M24 20l-2 2 4 4 6-8" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" opacity="0.3" />
        <circle cx="24" cy="24" r="6" stroke="currentColor" strokeWidth="1.5" />
        <path d="M24 21v4M24 27h.01" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" />
      </svg>
      <div className="space-y-1">
        <p className="text-[12px] font-medium text-[var(--text-dim)]">{t('empty.modelReady')}</p>
        <p className="text-[10px] text-[var(--text-faint)] max-w-[200px] leading-relaxed">
          {t('empty.modelReadyDesc')}
        </p>
      </div>
    </div>
  )
}

function EmptyStateError({ error }: { error: string | null }) {
  const { t } = useTranslation('validation')
  return (
    <div className="flex flex-col items-center justify-center h-full gap-3 text-center px-6 py-4">
      <svg width="48" height="48" viewBox="0 0 48 48" fill="none" className="opacity-40">
        <circle cx="24" cy="24" r="16" stroke="var(--danger)" strokeWidth="1.5" />
        <path d="M24 16v10M24 31h.01" stroke="var(--danger)" strokeWidth="2" strokeLinecap="round" />
      </svg>
      <div className="space-y-1">
        <p className="text-[12px] font-semibold" style={{ color: 'var(--danger)' }}>{t('empty.validationError')}</p>
        <p className="text-[10px] text-[var(--text-faint)] max-w-[240px] leading-relaxed">
          {error ?? t('empty.validationErrorDesc')}
        </p>
      </div>
    </div>
  )
}

function EmptyStateClean() {
  const { t } = useTranslation('validation')
  return (
    <div className="flex flex-col items-center justify-center h-full gap-3 text-center px-6 py-4">
      <svg width="48" height="48" viewBox="0 0 48 48" fill="none">
        <circle cx="24" cy="24" r="16" stroke="var(--ok)" strokeWidth="1.5" opacity="0.4" />
        <circle cx="24" cy="24" r="10" stroke="var(--ok)" strokeWidth="1.5" opacity="0.7" />
        <path d="M18 24l4 4 8-8" stroke="var(--ok)" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />
      </svg>
      <div className="space-y-1">
        <p className="text-[12px] font-semibold" style={{ color: 'var(--ok)' }}>{t('empty.noIssues')}</p>
        <p className="text-[10px] text-[var(--text-faint)] max-w-[180px] leading-relaxed">
          {t('results.allGood')}
        </p>
      </div>
    </div>
  )
}

// ── Mini barchart (collapsed pill) ───────────────────────────────────────────

function MiniBarChart({
  errors, warnings, info,
}: { errors: number; warnings: number; info: number }) {
  const total = errors + warnings + info
  if (total === 0) return null

  const pE = errors / total
  const pW = warnings / total
  const pI = info / total

  return (
    <div className="flex h-2 w-14 rounded overflow-hidden gap-px shrink-0" style={{ background: 'var(--border)' }}>
      {errors > 0   && <div style={{ width: `${pE * 100}%`, background: 'var(--danger)', transition: 'width 300ms' }} />}
      {warnings > 0 && <div style={{ width: `${pW * 100}%`, background: '#F5A623', transition: 'width 300ms' }} />}
      {info > 0     && <div style={{ width: `${pI * 100}%`, background: '#5E9ED6', transition: 'width 300ms' }} />}
    </div>
  )
}

// ── Run button (3 states) ─────────────────────────────────────────────────────

function RunButton({
  status, progress, disabled, onClick, note,
}: {
  status: 'idle' | 'running' | 'complete' | 'error' | 'cancelled'
  progress: number
  disabled: boolean
  onClick: () => void
  /** Appended to the tooltip: a validation run reads the file as loaded, not the pending edits. */
  note?: string
}) {
  const { t } = useTranslation('validation')
  if (status === 'running') {
    return (
      <div className="relative flex items-center shrink-0">
        <button
          disabled
          className="flex items-center gap-1.5 px-3 h-8 rounded-lg text-[11px] font-medium text-[var(--accent)] border border-[var(--accent)]33 bg-[var(--accent)]0a cursor-not-allowed overflow-hidden"
        >
          {/* Animated fill behind the text */}
          {progress > 0 && (
            <div
              className="absolute inset-0 rounded-lg pointer-events-none transition-all duration-300"
              style={{ width: `${progress}%`, background: 'var(--accent)', opacity: 0.08 }}
            />
          )}
          <svg
            width="12" height="12" viewBox="0 0 12 12" fill="none" stroke="currentColor" strokeWidth="1.5"
            className="animate-spin shrink-0 relative"
          >
            <circle cx="6" cy="6" r="4.5" strokeOpacity="0.25" />
            <path d="M6 1.5a4.5 4.5 0 014.5 4.5" strokeLinecap="round" />
          </svg>
          <span className="relative tabular-nums">
            {progress > 0 ? `${progress}%` : t('run.validating')}
          </span>
        </button>
      </div>
    )
  }

  if (status === 'complete') {
    return (
      <button
        onClick={onClick}
        disabled={disabled}
        className="flex items-center gap-1.5 px-3 h-8 rounded-lg text-[11px] font-medium border transition-all disabled:opacity-40 shrink-0"
        style={{ color: 'var(--ok)', borderColor: 'var(--ok)33', background: 'var(--ok)12' }}
        title={note}
      >
        <svg width="11" height="11" viewBox="0 0 11 11" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" className="shrink-0">
          <polyline points="2,6 4.5,8.5 9,3" />
        </svg>
        {t('run.revalidate')}
      </button>
    )
  }

  if (status === 'error') {
    return (
      <button
        onClick={onClick}
        disabled={disabled}
        className="flex items-center gap-1.5 px-3 h-8 rounded-lg text-[11px] font-semibold border transition-all disabled:opacity-40 shrink-0"
        style={{ color: 'var(--danger)', borderColor: 'var(--danger)44', background: 'var(--danger)12' }}
        title={[t('empty.validationErrorDesc'), note].filter(Boolean).join(' · ')}
      >
        <svg width="10" height="10" viewBox="0 0 10 10" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" className="shrink-0">
          <path d="M5 3v3M5 7.5h.01" />
          <circle cx="5" cy="5" r="4" />
        </svg>
        {t('run.retry')}
      </button>
    )
  }

  if (status === 'cancelled') {
    return (
      <button
        onClick={onClick}
        disabled={disabled}
        className="flex items-center gap-1.5 px-3 h-8 rounded-lg text-[11px] font-medium border transition-all disabled:opacity-40 shrink-0"
        style={{ color: 'var(--text-dim)', borderColor: 'var(--border)', background: 'var(--surface-2)' }}
        title={note}
      >
        <svg width="10" height="10" viewBox="0 0 10 10" fill="currentColor" className="shrink-0">
          <path d="M3 2.5l5 2.5-5 2.5V2.5z" />
        </svg>
        {t('run.validateAgain')}
      </button>
    )
  }

  return (
    <button
      onClick={onClick}
      disabled={disabled}
      className="flex items-center gap-1.5 px-3 h-8 rounded-lg text-[11px] font-semibold border transition-all disabled:opacity-40 shrink-0"
      style={{ color: 'var(--accent)', borderColor: 'var(--accent)44', background: 'var(--accent)14' }}
      title={note}
    >
      <svg width="10" height="10" viewBox="0 0 10 10" fill="currentColor" className="shrink-0">
        <path d="M3 2.5l5 2.5-5 2.5V2.5z" />
      </svg>
      {t('run.validate')}
    </button>
  )
}

// ── Profile dropdown ──────────────────────────────────────────────────────────

interface ProfileDropdownProps {
  activeProfileId: string | null
  customProfiles: ValidationProfile[]
  onSelect: (id: string | null) => void
  onNewProfile: () => void
  onEditProfile: (profile: ValidationProfile) => void
  onDeleteProfile: (profileId: string) => void
}

function ProfileDropdown({
  activeProfileId, customProfiles, onSelect,
  onNewProfile, onEditProfile, onDeleteProfile,
}: ProfileDropdownProps) {
  const { t } = useTranslation('validation')
  const [open, setOpen]             = useState(false)
  const [deletingId, setDeletingId] = useState<string | null>(null)
  const triggerRef                  = useRef<HTMLButtonElement>(null)
  const dropdownRef                 = useRef<HTMLDivElement>(null)
  const [dropRect, setDropRect]     = useState<{ bottom: number; left: number; width: number } | null>(null)

  const computeRect = useCallback(() => {
    const row = triggerRef.current?.closest<HTMLElement>('[data-profile-row]')
    if (!row) return
    const r = row.getBoundingClientRect()
    setDropRect({
      bottom: window.innerHeight - r.top + 4,
      left:   r.left + 12,
      width:  r.width - 24,
    })
  }, [])

  const handleToggle = () => {
    if (!open) { computeRect(); setDeletingId(null) }
    setOpen((v) => !v)
  }

  useEffect(() => {
    if (!open) return
    window.addEventListener('resize', computeRect, { passive: true })
    return () => window.removeEventListener('resize', computeRect)
  }, [open, computeRect])

  useEffect(() => {
    if (!open) return
    const handler = (e: MouseEvent) => {
      const target = e.target as Node
      if (!triggerRef.current?.contains(target) && !dropdownRef.current?.contains(target)) {
        setOpen(false)
        setDeletingId(null)
      }
    }
    document.addEventListener('mousedown', handler)
    return () => document.removeEventListener('mousedown', handler)
  }, [open])

  const allProfiles   = [...VALIDATION_PROFILES, ...customProfiles]
  const activeProfile = activeProfileId ? allProfiles.find((p) => p.id === activeProfileId) : null
  const canAddMore    = customProfiles.length < 5

  // ── Profile card ──────────────────────────────────────────────────────────────
  const ProfileCard = ({ profile, isCustom }: { profile: ValidationProfile | typeof VALIDATION_PROFILES[number]; isCustom: boolean }) => {
    const isActive   = activeProfileId === profile.id
    const isDeleting = deletingId === profile.id
    const customProfile = isCustom ? profile as ValidationProfile : null

    if (isDeleting && customProfile) {
      return (
        <div
          key={profile.id}
          className="flex flex-col justify-center gap-2 p-2.5 rounded-lg"
          style={{ background: 'rgba(239,68,68,0.08)', border: '1px solid rgba(239,68,68,0.3)' }}
        >
          <p className="text-[10px] font-medium" style={{ color: '#ef4444' }}>
            {t('customProfile.deleteConfirm', { defaultValue: 'Delete this profile?' })}
          </p>
          <div className="flex gap-1.5">
            <button
              onClick={() => setDeletingId(null)}
              className="flex-1 h-6 rounded text-[10px] font-medium transition-colors"
              style={{ background: 'var(--surface-2)', color: 'var(--text-dim)', border: '1px solid var(--border)' }}
            >
              {t('customProfile.cancel')}
            </button>
            <button
              onClick={() => {
                onDeleteProfile(customProfile.id)
                setDeletingId(null)
                if (activeProfileId === customProfile.id) onSelect(null)
              }}
              className="flex-1 h-6 rounded text-[10px] font-semibold transition-colors"
              style={{ background: 'rgba(239,68,68,0.15)', color: '#ef4444', border: '1px solid rgba(239,68,68,0.3)' }}
            >
              {t('customProfile.deleteYes', { defaultValue: 'Delete' })}
            </button>
          </div>
        </div>
      )
    }

    return (
      <div
        className="group relative flex flex-col items-start gap-1 p-2.5 rounded-lg cursor-pointer transition-all"
        style={
          isActive
            ? { background: 'var(--accent)18', border: '1px solid var(--accent)55' }
            : { background: 'var(--surface-2)', border: '1px solid var(--border)' }
        }
        onClick={() => { onSelect(isActive ? null : profile.id); setOpen(false); setDeletingId(null) }}
      >
        {/* Active checkmark */}
        {isActive && (
          <span
            className="absolute top-2 right-2 w-3.5 h-3.5 rounded-full flex items-center justify-center"
            style={{ background: 'var(--accent)' }}
          >
            <svg width="7" height="7" viewBox="0 0 7 7" fill="none" stroke="white" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
              <path d="M1 3.5l1.5 1.5 3.5-3" />
            </svg>
          </span>
        )}

        {/* Edit / delete actions (custom profiles only, shown on hover) */}
        {isCustom && !isActive && customProfile && (
          <div
            className="absolute top-1.5 right-1.5 hidden group-hover:flex gap-0.5"
            onClick={(e) => e.stopPropagation()}
          >
            <button
              onClick={(e) => { e.stopPropagation(); setOpen(false); onEditProfile(customProfile) }}
              className="w-5 h-5 flex items-center justify-center rounded transition-colors"
              style={{ color: 'var(--text-faint)' }}
              onMouseEnter={(e) => { (e.currentTarget as HTMLButtonElement).style.background = 'var(--surface)'; (e.currentTarget as HTMLButtonElement).style.color = 'var(--text)' }}
              onMouseLeave={(e) => { (e.currentTarget as HTMLButtonElement).style.background = 'transparent'; (e.currentTarget as HTMLButtonElement).style.color = 'var(--text-faint)' }}
              title={t('profile.editCustom')}
            >
              <svg width="9" height="9" viewBox="0 0 9 9" fill="none" stroke="currentColor" strokeWidth="1.4" strokeLinecap="round" strokeLinejoin="round">
                <path d="M1.5 7.5h1.5l4-4-1.5-1.5-4 4v1.5z" />
                <path d="M5.5 2.5l1.5 1.5" />
              </svg>
            </button>
            <button
              onClick={(e) => { e.stopPropagation(); setDeletingId(customProfile.id) }}
              className="w-5 h-5 flex items-center justify-center rounded transition-colors"
              style={{ color: 'var(--text-faint)' }}
              onMouseEnter={(e) => { (e.currentTarget as HTMLButtonElement).style.background = 'rgba(239,68,68,0.12)'; (e.currentTarget as HTMLButtonElement).style.color = '#ef4444' }}
              onMouseLeave={(e) => { (e.currentTarget as HTMLButtonElement).style.background = 'transparent'; (e.currentTarget as HTMLButtonElement).style.color = 'var(--text-faint)' }}
              title={t('profile.deleteCustom')}
            >
              <svg width="9" height="9" viewBox="0 0 9 9" fill="none" stroke="currentColor" strokeWidth="1.4" strokeLinecap="round" strokeLinejoin="round">
                <path d="M1.5 2.5h6M3.5 2.5V1.5h2V2.5M3 2.5l.5 5h2l.5-5" />
              </svg>
            </button>
          </div>
        )}

        {/* Icon + name */}
        <div className="flex items-center gap-1.5 w-full min-w-0 pr-5">
          <span className="text-[13px] leading-none shrink-0">{profile.icon}</span>
          <span
            className="text-[11px] font-semibold truncate"
            style={{ color: isActive ? 'var(--accent)' : 'var(--text)' }}
          >
            {localizedProfileName(profile, t)}
          </span>
        </div>

        {/* Description */}
        <p className="text-[9px] leading-tight line-clamp-2 w-full" style={{ color: 'var(--text-faint)' }}>
          {localizedProfileDescription(profile, t)}
        </p>

        {/* Coverage chips */}
        <div className="flex flex-wrap gap-0.5 mt-0.5 w-full">
          {profile.coverageTypes.slice(0, 4).map((cat) => (
            <span
              key={cat}
              className="text-[8px] px-1 rounded font-mono leading-tight whitespace-nowrap"
              style={{ background: 'var(--accent)12', color: 'var(--accent)' }}
            >
              {cat}
            </span>
          ))}
          {profile.coverageTypes.length > 4 && (
            <span className="text-[8px] font-mono" style={{ color: 'var(--text-faint)' }}>
              +{profile.coverageTypes.length - 4}
            </span>
          )}
        </div>
      </div>
    )
  }

  const dropdownPortal = open && dropRect ? createPortal(
    <div
      ref={dropdownRef}
      className="fixed rounded-xl flex flex-col overflow-hidden"
      style={{
        zIndex:    9999,
        bottom:    dropRect.bottom,
        left:      dropRect.left,
        width:     dropRect.width,
        maxHeight: 'min(64dvh, 520px)',
        background: 'rgba(16,16,22,0.98)',
        border: '1px solid var(--border)',
        boxShadow: '0 -8px 40px rgba(0,0,0,0.55), 0 0 0 1px rgba(255,255,255,0.03)',
        backdropFilter: 'blur(16px)',
      }}
    >
      <div className="overflow-y-auto flex-1 p-2.5 flex flex-col gap-3">
        {/* Built-in profiles */}
        <div>
          <p
            className="text-[9px] font-semibold uppercase tracking-widest mb-2 px-0.5"
            style={{ color: 'var(--text-faint)' }}
          >
            {t('profile.label')}
          </p>
          <div className="grid grid-cols-2 gap-1.5">
            {VALIDATION_PROFILES.map((profile) => (
              <ProfileCard key={profile.id} profile={profile} isCustom={false} />
            ))}
          </div>
        </div>

        {/* Custom profiles */}
        <div>
          <div className="flex items-center gap-2 mb-2 px-0.5">
            <p
              className="text-[9px] font-semibold uppercase tracking-widest"
              style={{ color: 'var(--text-faint)' }}
            >
              {t('profile.custom')}
            </p>
            <span
              className="text-[8px] font-mono px-1.5 py-0.5 rounded-full"
              style={{ background: 'var(--surface-2)', color: 'var(--text-faint)' }}
            >
              {customProfiles.length}/5
            </span>
          </div>

          {customProfiles.length > 0 && (
            <div className="grid grid-cols-2 gap-1.5 mb-1.5">
              {customProfiles.map((profile) => (
                <ProfileCard key={profile.id} profile={profile} isCustom={true} />
              ))}
            </div>
          )}

          {/* New profile button */}
          <button
            onClick={() => { setOpen(false); setDeletingId(null); onNewProfile() }}
            disabled={!canAddMore}
            className="flex items-center gap-2 w-full px-3 h-8 rounded-lg text-[11px] font-medium transition-all disabled:opacity-40 disabled:cursor-not-allowed"
            style={{
              color: canAddMore ? 'var(--text-dim)' : 'var(--text-faint)',
              border: '1px dashed var(--border)',
              background: 'transparent',
            }}
            onMouseEnter={(e) => {
              if (!e.currentTarget.disabled) {
                (e.currentTarget as HTMLButtonElement).style.color = 'var(--text)'
                ;(e.currentTarget as HTMLButtonElement).style.borderColor = 'var(--text-dim)'
              }
            }}
            onMouseLeave={(e) => {
              (e.currentTarget as HTMLButtonElement).style.color = canAddMore ? 'var(--text-dim)' : 'var(--text-faint)'
              ;(e.currentTarget as HTMLButtonElement).style.borderColor = 'var(--border)'
            }}
          >
            <svg width="9" height="9" viewBox="0 0 9 9" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round">
              <path d="M4.5 1.5v6M1.5 4.5h6" />
            </svg>
            {t('profile.createCustom')}
          </button>
        </div>
      </div>
    </div>,
    document.body,
  ) : null

  return (
    <div className="flex items-center gap-1 min-w-0 flex-1">
      <button
        ref={triggerRef}
        onClick={handleToggle}
        className="flex items-center gap-1.5 px-2.5 h-8 rounded-lg text-[11px] font-medium border transition-colors min-w-0 flex-1 cursor-pointer text-left"
        style={
          activeProfileId
            ? { color: 'var(--accent)', borderColor: 'var(--accent)44', background: 'var(--accent)10' }
            : { color: 'var(--text-dim)', borderColor: 'var(--border)', background: 'transparent' }
        }
      >
        <span className="truncate flex-1">
          {activeProfile ? `${activeProfile.icon} ${localizedProfileName(activeProfile, t)}` : t('profile.selectProfile')}
        </span>
        <svg
          width="10" height="10" viewBox="0 0 10 10" fill="currentColor" className="shrink-0 opacity-60"
          style={{ transform: open ? 'rotate(180deg)' : 'none', transition: 'transform 150ms' }}
        >
          <path d="M1 3.5L5 7.5L9 3.5L8 2.5L5 5.5L2 2.5Z" />
        </svg>
      </button>

      {activeProfileId && (
        <button
          onClick={() => onSelect(null)}
          className="w-7 h-7 flex items-center justify-center rounded transition-colors shrink-0 cursor-pointer"
          style={{ color: 'var(--text-faint)' }}
          onMouseEnter={(e) => { (e.currentTarget as HTMLButtonElement).style.color = 'var(--text)'; (e.currentTarget as HTMLButtonElement).style.background = 'var(--surface-2)' }}
          onMouseLeave={(e) => { (e.currentTarget as HTMLButtonElement).style.color = 'var(--text-faint)'; (e.currentTarget as HTMLButtonElement).style.background = 'transparent' }}
          title={t('profile.clearProfile')}
        >
          <svg width="9" height="9" viewBox="0 0 9 9" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round">
            <path d="M1.5 1.5l6 6M7.5 1.5l-6 6" />
          </svg>
        </button>
      )}

      {dropdownPortal}
    </div>
  )
}

// ── Compact coverage strip ────────────────────────────────────────────────────
// Replaces the full ValidationCoverageSummary with a single 34px row showing
// quality score + category chips (covered = colored, uncovered = muted).

const CAT_COLOR: Record<string, string> = {
  schema:         '#5E9ED6',
  spatial:        'var(--accent)',
  quality:        'var(--ok)',
  lod:            '#F5A623',
  iso19650:       'var(--accent)',
  classification: '#F5A623',
  mep:            'var(--accent)',
  clash:          'var(--danger)',
}

// CAT_SHORT is now resolved via i18n inside CoverageStrip using t(`catShort.${cat}`)

interface CoverageStripProps {
  rules: Parameters<typeof getCoveredCategories>[0]
  qualityScore: number
  onDismiss: () => void
}

function CoverageStrip({ rules, qualityScore, onDismiss }: CoverageStripProps) {
  const { t } = useTranslation('validation')
  // Guard: getCoveredCategories iterates rules safely, but wrap in case rules
  // shape ever diverges from RulesConfig at runtime.
  let covered: ReturnType<typeof getCoveredCategories> = []
  try { covered = getCoveredCategories(rules) } catch { /* show all uncovered */ }

  // Guard NaN / negative scores (worker rounding edge case)
  const score      = Number.isFinite(qualityScore) ? Math.max(0, Math.min(100, Math.round(qualityScore))) : 0
  const scoreColor =
    score >= 80 ? 'var(--ok)' :
    score >= 50 ? '#F5A623'   : 'var(--danger)'

  return (
    <div className="flex items-center gap-2 px-3 py-1.5 border-b border-[var(--border)] bg-[var(--surface-2)] shrink-0">
      {/* Score pill */}
      <span
        className="text-[10px] font-mono font-bold px-2 py-0.5 rounded-full border shrink-0 leading-none"
        style={{ color: scoreColor, borderColor: `${scoreColor}44`, background: `${scoreColor}14` }}
        title={t('coverage.qualityTitle')}
      >
        {score}
      </span>

      {/* Divider */}
      <div className="w-px h-4 bg-[var(--border)] shrink-0" />

      {/* Category chips */}
      <div className="flex items-center gap-1 overflow-x-auto flex-1 min-w-0 scrollbar-none">
        {ALL_CATEGORIES.map((cat) => {
          const isActive = covered.includes(cat as ValidationCategoryType)
          const color = CAT_COLOR[cat] ?? 'var(--accent)'
          const short = (t as (k: string) => string)(`catShort.${cat}`)
          const full  = (t as (k: string) => string)(`catFull.${cat}`)
          return (
            <span
              key={cat}
              className="shrink-0 text-[9px] px-1.5 py-0.5 rounded border leading-none font-mono whitespace-nowrap"
              style={
                isActive
                  ? { background: `${color}14`, color, borderColor: `${color}33` }
                  : { background: 'transparent', color: 'var(--text-faint)', borderColor: 'var(--border)' }
              }
              title={full}
            >
              {isActive ? '✓ ' : ''}{short}
            </span>
          )
        })}
      </div>

      {/* Dismiss */}
      <button
        onClick={onDismiss}
        className="shrink-0 w-5 h-5 flex items-center justify-center rounded text-[var(--text-faint)] hover:text-[var(--text)] hover:bg-[var(--surface)] transition-colors"
        title={t('coverage.hideTitle')}
      >
        <svg width="8" height="8" viewBox="0 0 8 8" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round">
          <path d="M1.5 1.5l5 5M6.5 1.5l-5 5" />
        </svg>
      </button>
    </div>
  )
}


// ── Coverage integrity strip (honest score) ──────────────────────────────────
// Shown only when a run is incomplete (a rule failed or never ran). Surfaces the
// affected rules so the Health Score is never silently trusted as authoritative.
function CoverageIntegrityStrip({ coverage, language }: { coverage: ValidationCoverage; language: string }) {
  const { t } = useTranslation('validation')
  const problems = coverage.entries.filter((e) => e.status !== 'ok')
  const unreadable = coverage.unreadableEntities ?? 0
  // Unreadable entities are a reason to show this strip in their own right. Every
  // rule can run perfectly on a file where thousands of entities failed to parse,
  // and without this the score would carry its warning mark with nothing anywhere
  // explaining it.
  if (problems.length === 0 && unreadable === 0) return null

  return (
    <div
      className="flex items-start gap-2 px-3 py-1.5 border-b border-[var(--border)] shrink-0"
      style={{ background: 'color-mix(in srgb, var(--danger) 8%, transparent)' }}
    >
      <svg width="11" height="11" viewBox="0 0 12 12" fill="none" stroke="var(--danger)" strokeWidth="1.4" strokeLinecap="round" strokeLinejoin="round" className="shrink-0 mt-0.5">
        <path d="M6 1.5L11 10.5H1L6 1.5z" />
        <path d="M6 5v2.5M6 9h.01" />
      </svg>
      <div className="flex-1 min-w-0">
        {problems.length > 0 && (
          <>
            <p className="text-[10px] font-semibold leading-tight" style={{ color: 'var(--danger)' }}>
              {t('coverage.partialTitle', { ran: coverage.okCount, total: coverage.attempted.length })}
            </p>
            <p className="text-[9px] text-[var(--text-faint)] leading-tight mt-0.5">
              {t('coverage.partialDesc')}
            </p>
          </>
        )}
        {unreadable > 0 && (
          <p
            className={`text-[10px] font-semibold leading-tight${problems.length > 0 ? ' mt-1' : ''}`}
            style={{ color: 'var(--danger)' }}
          >
            {t('coverage.unreadableEntities', { count: unreadable })}
          </p>
        )}
        <div className="flex flex-wrap gap-1 mt-1">
          {problems.map((e) => (
            <span
              key={e.ruleId}
              title={e.error ?? (e.status === 'failed' ? t('coverage.statusFailed') : t('coverage.statusNotRun'))}
              className="text-[9px] font-mono px-1.5 py-0.5 rounded border whitespace-nowrap"
              style={{ color: 'var(--danger)', borderColor: 'color-mix(in srgb, var(--danger) 33%, transparent)', background: 'color-mix(in srgb, var(--danger) 10%, transparent)' }}
            >
              {e.status === 'failed' ? '✕' : '○'} {getRuleLabel(e.ruleId, language)}
            </span>
          ))}
        </div>
      </div>
    </div>
  )
}


// ── Run-to-run comparison bar (Phase 4) ──────────────────────────────────────
// "Since your last run": what got resolved, what newly appeared, score movement.
function RunDiffBar({ diff, onDismiss }: { diff: ValidationDiff; onDismiss: () => void }) {
  const { t } = useTranslation('validation')
  const improved = diff.scoreDelta > 0 || (diff.scoreDelta === 0 && diff.resolved > diff.added)
  const worse    = diff.scoreDelta < 0 || (diff.scoreDelta === 0 && diff.added > diff.resolved)
  const c = improved ? 'var(--ok)' : worse ? 'var(--danger)' : 'var(--text-faint)'
  const deltaStr = `${diff.scoreDelta > 0 ? '+' : ''}${diff.scoreDelta}`
  return (
    <div
      className="flex items-center gap-2 px-3 py-1.5 border-b border-[var(--border)] shrink-0"
      style={{ background: `color-mix(in srgb, ${c} 8%, transparent)` }}
    >
      <svg width="11" height="11" viewBox="0 0 12 12" fill="none" stroke={c} strokeWidth="1.4" strokeLinecap="round" strokeLinejoin="round" className="shrink-0">
        {improved ? <path d="M2 8l3-3 2 2 3-4" /> : worse ? <path d="M2 4l3 3 2-2 3 4" /> : <path d="M2 6h8" />}
      </svg>
      <span className="text-[10px] text-[var(--text-dim)]">
        {t('runDiff.summary', { resolved: diff.resolved, added: diff.added })}
      </span>
      <span className="text-[10px] font-mono font-semibold" style={{ color: c }}>
        {t('runDiff.scoreDelta', { delta: deltaStr })}
      </span>
      <button
        onClick={onDismiss}
        className="ml-auto shrink-0 w-5 h-5 flex items-center justify-center rounded text-[var(--text-faint)] hover:text-[var(--text)] hover:bg-[var(--surface-2)] transition-colors"
        title={t('coverage.hideTitle')}
      >
        <svg width="8" height="8" viewBox="0 0 8 8" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round"><path d="M1.5 1.5l5 5M6.5 1.5l-5 5" /></svg>
      </button>
    </div>
  )
}

// ── Executive summary (actionable score) ─────────────────────────────────────
// "Fix this first": the rules dragging the Health Score down the most, each with
// the points roughly recoverable by clearing it. Clicking one jumps to its group.
// The two name rules also get a "Fix all N" chip, a sibling of the row's button
// (a button inside a button is invalid and swallows the inner click).
function ExecutiveSummary({
  score, contributions, language, onJumpToRule, batchCounts, batchDisabledReason, onBatchFix,
}: {
  score: number
  contributions: ScoreContribution[]
  language: string
  onJumpToRule: (ruleId: string) => void
  batchCounts: Partial<Record<BatchRenameRule, number>>
  batchDisabledReason: Partial<Record<BatchRenameRule, string | null>>
  onBatchFix: (ruleId: BatchRenameRule) => void
}) {
  const { t } = useTranslation('validation')
  const top = contributions.filter((c) => c.penalty > 0).slice(0, 3)
  if (top.length === 0) return null

  const grade =
    score >= 85 ? 'excellent' : score >= 70 ? 'good' : score >= 50 ? 'fair' : score >= 30 ? 'poor' : 'critical'
  const gradeColor = score >= 70 ? 'var(--ok)' : score >= 50 ? '#F5A623' : 'var(--danger)'

  return (
    <div className="px-3 py-2.5 border-b border-[var(--border)] bg-[var(--surface-2)] shrink-0">
      <div className="flex items-center gap-1.5 mb-2">
        {/* Bimo reads the score so the grade lands emotionally, not just as a colour. */}
        <Bimo emotion={emotionForScore(score)} size={26} className="-my-1 -ml-0.5" />
        <span className="text-[11px] font-semibold" style={{ color: gradeColor }}>
          {t(`summary.grade.${grade}`)}
        </span>
        <span className="text-[10px] text-[var(--text-faint)]">·</span>
        <span className="text-[10px] font-medium uppercase tracking-wider text-[var(--text-faint)]">
          {t('summary.fixFirst')}
        </span>
      </div>
      <div className="flex flex-col gap-0.5">
        {top.map((c, i) => {
          const batchRule = isBatchRenameRule(c.ruleId) ? c.ruleId : null
          const batchCount = batchRule ? (batchCounts[batchRule] ?? 0) : 0
          const reason = batchRule ? (batchDisabledReason[batchRule] ?? null) : null
          return (
            <div key={c.ruleId} className="flex items-center gap-1.5 -mx-1.5">
              <button
                onClick={() => { trackFixFirstClicked({ rule_id: c.ruleId, position: i + 1, action: 'jump', points: Math.max(1, Math.round(c.penalty)) }); onJumpToRule(c.ruleId) }}
                className="flex items-center gap-2 flex-1 min-w-0 text-left py-1 px-1.5 rounded hover:bg-[var(--surface)] transition-colors group"
              >
                <span className="text-[10px] font-mono text-[var(--text-faint)] w-3 shrink-0 text-center">{i + 1}</span>
                <span className="text-[11px] text-[var(--text)] font-medium truncate flex-1 min-w-0 group-hover:text-[var(--accent)] transition-colors">
                  {getRuleLabel(c.ruleId, language)}
                  <span className="text-[var(--text-faint)] font-mono ml-1.5">{c.count}</span>
                </span>
                <span className="text-[10px] font-mono font-semibold shrink-0" style={{ color: 'var(--ok)' }}>
                  {t('summary.points', { points: Math.max(1, Math.round(c.penalty)) })}
                </span>
                <svg width="9" height="9" viewBox="0 0 12 12" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round" className="text-[var(--text-faint)] group-hover:text-[var(--accent)] shrink-0 transition-colors">
                  <path d="M4.5 2.5l4 3.5-4 3.5" />
                </svg>
              </button>
              {batchRule && batchCount > 0 && (
                <button
                  type="button"
                  data-testid="batch-fix-chip"
                  onClick={() => { trackFixFirstClicked({ rule_id: batchRule, position: i + 1, action: 'batch', points: Math.max(1, Math.round(c.penalty)) }); onBatchFix(batchRule) }}
                  disabled={!!reason}
                  title={reason ?? t('batchFix.fixAllTitle')}
                  className="px-2 h-5 mr-1.5 rounded text-[10px] border transition-colors font-medium shrink-0 disabled:opacity-40 disabled:cursor-not-allowed"
                  style={{
                    background:  'color-mix(in srgb, var(--ok) 10%, transparent)',
                    color:       'var(--ok)',
                    borderColor: 'color-mix(in srgb, var(--ok) 30%, transparent)',
                  }}
                >
                  {t('batchFix.fixAll', { count: batchCount })}
                </button>
              )}
            </div>
          )
        })}
      </div>
    </div>
  )
}


// ── Validation history panel ──────────────────────────────────────────────────

/** Tiny sparkline chart — renders up to 20 quality-score dots as an SVG polyline. */
function ScoreSparkline({ runs }: { runs: ValidationRunRecord[] }) {
  if (runs.length < 2) return null
  const scores = runs.map((r) => r.qualityScore)
  const min = Math.min(...scores)
  const max = Math.max(...scores)
  const range = max - min || 1
  const W = 120, H = 28, pad = 4
  const pts = scores.map((s, i) => {
    const x = pad + (i / (scores.length - 1)) * (W - pad * 2)
    const y = H - pad - ((s - min) / range) * (H - pad * 2)
    return `${x.toFixed(1)},${y.toFixed(1)}`
  }).join(' ')
  const lastScore = scores[scores.length - 1]
  const lineColor = lastScore >= 80 ? 'var(--ok)' : lastScore >= 50 ? '#F5A623' : 'var(--danger)'
  return (
    <svg width={W} height={H} className="shrink-0">
      <polyline
        points={pts}
        fill="none"
        stroke={lineColor}
        strokeWidth="1.5"
        strokeLinecap="round"
        strokeLinejoin="round"
        opacity="0.7"
      />
      {/* Last point dot */}
      {(() => {
        const parts = pts.split(' '); const last = parts[parts.length - 1]?.split(',')
        if (!last) return null
        return <circle cx={last[0]} cy={last[1]} r="2.5" fill={lineColor} />
      })()}
    </svg>
  )
}

function scoreColor(s: number): string {
  return s >= 80 ? 'var(--ok)' : s >= 50 ? '#F5A623' : 'var(--danger)'
}

function ValidationHistoryPanel({ onClose }: { onClose: () => void }) {
  const { t, i18n } = useTranslation('validation')
  const [runs, setRuns]     = useState<ValidationRunRecord[]>([])
  const [clearing, setClearing] = useState(false)

  useEffect(() => {
    setRuns(getRecentRuns(20))
  }, [])

  const avgScore   = getAverageQualityScore()
  const topIssues  = getMostUsedRules(5)
  const totalRuns  = runs.length

  const handleClear = () => {
    if (!clearing) { setClearing(true); return }
    localStorage.removeItem('ifc-validator-runs')
    setRuns([])
    setClearing(false)
    onClose()
  }

  const fmt = (ms: number) => ms >= 1000 ? `${(ms / 1000).toFixed(1)}s` : `${ms}ms`

  if (totalRuns === 0) {
    return (
      <div className="flex flex-col items-center justify-center h-full gap-2 text-center px-4 py-8">
        <svg width="28" height="28" viewBox="0 0 24 24" fill="none" stroke="var(--text-faint)" strokeWidth="1.2" strokeLinecap="round">
          <polyline points="22 12 18 12 15 21 9 3 6 12 2 12" />
        </svg>
        <p className="text-[12px] text-[var(--text-dim)] font-medium">{t('history.noRuns')}</p>
        <p className="text-[11px] text-[var(--text-faint)]">{t('history.noRunsDesc')}</p>
      </div>
    )
  }

  return (
    <div className="flex flex-col h-full">
      {/* ── Summary strip ── */}
      <div className="flex items-center gap-3 px-3 py-2 border-b border-[var(--border)] bg-[var(--surface-2)] shrink-0">
        {/* Sparkline of last 20 runs */}
        <ScoreSparkline runs={[...runs].reverse()} />

        <div className="flex flex-col gap-0.5 flex-1 min-w-0">
          <div className="flex items-center gap-2">
            <span className="text-[10px] text-[var(--text-faint)] font-mono uppercase tracking-wider">
              {t('history.avgScore')}
            </span>
            {avgScore != null && (
              <span
                className="px-1.5 py-0.5 rounded-full font-mono font-bold text-[10px] border leading-none"
                style={{ color: scoreColor(avgScore), borderColor: `${scoreColor(avgScore)}44`, background: `${scoreColor(avgScore)}14` }}
              >
                {avgScore}
              </span>
            )}
          </div>
          <span className="text-[10px] text-[var(--text-faint)]">
            {t('history.runs', { count: totalRuns })}
          </span>
        </div>

        {/* Clear button */}
        <button
          onClick={handleClear}
          className={`px-2 h-6 rounded text-[10px] font-medium border transition-colors shrink-0 ${clearing ? 'text-[var(--danger)] border-[var(--danger)]44 bg-[var(--danger)]08' : 'text-[var(--text-faint)] border-[var(--border)] bg-transparent hover:text-[var(--danger)]'}`}
        >
          {clearing ? t('history.clearConfirm', { count: totalRuns }) : t('history.clearHistory')}
        </button>
      </div>

      {/* ── Top issues ── */}
      {topIssues.length > 0 && (
        <div className="px-3 py-2 border-b border-[var(--border)] shrink-0">
          <span className="text-[9px] text-[var(--text-faint)] uppercase tracking-wider font-medium">{t('history.topIssues')}</span>
          <div className="flex flex-wrap gap-1 mt-1">
            {topIssues.map((ruleId) => (
              <span key={ruleId} className="text-[9px] font-mono text-[var(--text-dim)] border border-[var(--border)] px-1.5 py-0.5 rounded bg-[var(--surface-2)]">
                {ruleId.replace('RULE_', '')}
              </span>
            ))}
          </div>
        </div>
      )}

      {/* ── Run list ── */}
      <div className="flex-1 overflow-y-auto">
        {runs.map((run, idx) => {
          const date = new Date(run.timestamp)
          const locale = i18n.language
          const sc = run.qualityScore
          const c = scoreColor(sc)
          const issueTotal = Object.values(run.issuesByRule).reduce((a, b) => a + b, 0)
          return (
            <div
              key={idx}
              className="flex items-center gap-2.5 px-3 py-2 border-b border-[var(--border)] hover:bg-[var(--surface-2)] transition-colors"
            >
              {/* Score pill */}
              <span
                className="w-9 text-center px-1.5 py-0.5 rounded-full font-mono font-bold text-[11px] border leading-none shrink-0"
                style={{ color: c, borderColor: `${c}44`, background: `${c}14` }}
              >
                {sc}
              </span>

              <div className="flex-1 min-w-0 flex flex-col gap-0.5">
                {/* File + date */}
                <div className="flex items-center gap-2 min-w-0">
                  <span className="text-[11px] text-[var(--text)] font-medium truncate">
                    {(() => { const p = run.modelFileName.split('/'); return p[p.length - 1] ?? run.modelFileName })()}
                  </span>
                  <span className="text-[9px] text-[var(--text-faint)] font-mono shrink-0">
                    {date.toLocaleDateString(locale, { month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit' })}
                  </span>
                </div>
                {/* Meta row */}
                <div className="flex items-center gap-2 flex-wrap">
                  <span className="text-[9px] text-[var(--text-faint)] font-mono">
                    {fmt(run.durationMs)}
                  </span>
                  {issueTotal > 0 && (
                    <span className="text-[9px] text-[var(--text-faint)] font-mono">
                      {issueTotal} issue{issueTotal !== 1 ? 's' : ''}
                    </span>
                  )}
                  {run.profileId && (
                    <span className="text-[9px] text-[var(--accent)] border border-[var(--accent)]33 px-1 rounded font-mono bg-[var(--accent)]08">
                      {run.profileId}
                    </span>
                  )}
                </div>
              </div>
            </div>
          )
        })}
      </div>
    </div>
  )
}

// ── Search input ──────────────────────────────────────────────────────────────

function SearchInput({ value, onChange }: { value: string; onChange: (v: string) => void }) {
  const { t } = useTranslation('validation')
  const inputRef = useRef<HTMLInputElement>(null)
  return (
    <div className="relative flex items-center shrink-0">
      <svg
        width="12" height="12" viewBox="0 0 12 12" fill="none" stroke="currentColor" strokeWidth="1.3" strokeLinecap="round"
        className="absolute left-2 text-[var(--text-faint)] pointer-events-none"
      >
        <circle cx="5" cy="5" r="3.5" />
        <path d="M8.5 8.5L11 11" />
      </svg>
      <input
        ref={inputRef}
        type="text"
        value={value}
        onChange={(e) => onChange(e.target.value)}
        placeholder={t('filters.search')}
        className="h-6 pl-6 pr-6 text-[11px] bg-[var(--surface-2)] border border-[var(--border)] rounded text-[var(--text)] placeholder:text-[var(--text-faint)] outline-none focus:border-[var(--accent)] w-28 transition-colors"
      />
      {value && (
        <button
          onClick={() => { onChange(''); inputRef.current?.focus() }}
          className="absolute right-1 w-4 h-4 flex items-center justify-center rounded text-[var(--text-faint)] hover:text-[var(--text)]"
        >
          <svg width="8" height="8" viewBox="0 0 8 8" fill="none" stroke="currentColor" strokeWidth="1.3" strokeLinecap="round">
            <path d="M1.5 1.5l5 5M6.5 1.5l-5 5" />
          </svg>
        </button>
      )}
    </div>
  )
}

// ── Main component ────────────────────────────────────────────────────────────

interface ValidationPanelProps {
  /** modelId is not optional decoration — see handleJumpTo. */
  onJumpToElement?: (expressId: number, modelId?: string) => void
  viewer?: Pick<ViewerHandle, 'setCameraViewpoint' | 'getCameraViewpoint' | 'takeSnapshot'> | null | undefined
}

export default function ValidationPanel({ onJumpToElement, viewer }: ValidationPanelProps) {
  const {
    result, partialIssues, isRunning, progress, validationStatus, validationError,
    filters, setFilters,
    rules, activeProfileId, customProfiles, showCoverageSummary, dismissCoverageSummary,
    setActiveProfile, removeCustomProfile,
  } = useValidationStore(
    useShallow((s) => ({
      result:                 s.result,
      partialIssues:          s.partialIssues,
      isRunning:              s.isRunning,
      progress:               s.progress,
      validationStatus:       s.validationStatus,
      validationError:        s.validationError,
      filters:                s.filters,
      setFilters:             s.setFilters,
      rules:                  s.rules,
      activeProfileId:        s.activeProfileId,
      customProfiles:         s.customProfiles,
      showCoverageSummary:    s.showCoverageSummary,
      dismissCoverageSummary: s.dismissCoverageSummary,
      setActiveProfile:       s.setActiveProfile,
      removeCustomProfile:    s.removeCustomProfile,
    })),
  )
  const { validationPanelOpen, toggleValidationPanel } = useUIStore(
    useShallow((s) => ({ validationPanelOpen: s.validationPanelOpen, toggleValidationPanel: s.toggleValidationPanel })),
  )
  const ifcBuffer               = useModelStore((s) => s.ifcBuffer)
  const activeValidationModelId = useValidationStore((s) => s.activeValidationModelId)
  const { addCommand }          = useEditorHistory()
  const { setSelection, diffs, history, historyIndex } = useEditorStore(
    useShallow((s) => ({ setSelection: s.setSelection, diffs: s.diffs, history: s.history, historyIndex: s.historyIndex })),
  )
  const sceneModels  = useSceneStore((s) => s.models)
  const spatialTrees = useValidationStore((s) => s.spatialTrees)
  const fixBatch     = useBatchFixStore((s) => s.batch)
  const fixRunsById  = useBatchFixStore((s) => s.runs)
  const cachedResultsByModel = useValidationStore((s) => s.cachedResultsByModel)
  const previousResultByModel = useValidationStore((s) => s.previousResultByModel)
  const bcfTopicCount = useBcfStore((s) => s.topics.length)

  const { t, i18n } = useTranslation('validation')
  const isMobile = useIsMobile()
  const [search, setSearch]             = useState('')
  const [modelFilter, setModelFilter]   = useState<string | null>(null)
  const [profileModalOpen, setProfileModalOpen] = useState(false)
  const [editingProfile, setEditingProfile]     = useState<ValidationProfile | undefined>(undefined)
  const [exportModalOpen, setExportModalOpen]   = useState(false)
  const [copying,         setCopying]           = useState(false)
  const [activePanel, setActivePanel]   = useState<'issues' | 'bcf' | 'history'>('issues')

  // ── Group expand / collapse state ────────────────────────────────────────────
  // openGroups: which group keys are expanded (showing rows)
  // expandedGroups: which groups are showing ALL rows (vs just PREVIEW_ROWS)
  const [openGroups,     setOpenGroups]     = useState<Set<string>>(new Set())
  const [expandedGroups, setExpandedGroups] = useState<Set<string>>(new Set())
  // Selected authoring tool for the per-rule remediation guidance (D-22).
  // Lifted here so the choice persists across rules and virtualizer remounts.
  const [remediationTool, setRemediationTool] = useState<AuthoringTool>('revit')

  // ── Phantom rules (enabled but always 0 without config) ──────────────────────
  // Bug 2 fix: detect rules that are active but need configuration to produce results.
  // Prevents false confidence — user thinks model passed when rule just wasn't configured.
  const unconfiguredRules = useMemo(() => {
    if (!result) return []
    const phantom: string[] = []
    if (rules.RULE_NAMING_CONVENTION &&
        (!rules.namingConventionPatterns || Object.keys(rules.namingConventionPatterns).length === 0)) {
      phantom.push('RULE_NAMING_CONVENTION')
    }
    if (rules.RULE_MISSING_PROPERTY_SET &&
        (!rules.requiredPsets || Object.keys(rules.requiredPsets).length === 0)) {
      phantom.push('RULE_MISSING_PROPERTY_SET')
    }
    if (rules.RULE_MISSING_CLASSIFICATION &&
        (!rules.classificationSystems || rules.classificationSystems.length === 0)) {
      phantom.push('RULE_MISSING_CLASSIFICATION')
    }
    return phantom
  }, [rules, result])

  // Phantom notice auto-reappears after each new validation run
  const [showPhantomNotice, setShowPhantomNotice] = useState(true)
  const [showRunDiff, setShowRunDiff] = useState(true)
  useEffect(() => { setShowPhantomNotice(true); setShowRunDiff(true) }, [result])

  // ── Drawer height ─────────────────────────────────────────────────
  // One share of the main column for Validation and IDS (uiStore), resized by
  // the shared grip. The reserve is the width an open content panel takes
  // over this drawer's right side (lib/ui/lane, WINDOW_DESIGN R6).
  const drawerRef = useRef<HTMLDivElement>(null)
  const drawerRatio = useUIStore((s) => s.bottomDrawerRatio)
  const drawerReserve = useLaneStore(selectDrawerReservePx)

  // ── Data ──────────────────────────────────────────────────────────────

  const rawIssues = result?.issues ?? partialIssues
  const hasModel = sceneModels.length > 0 || !!ifcBuffer

  // ── Waivers (Phase 3) ─────────────────────────────────────────────────────
  // Muted issues are hidden from the list AND excluded from the shown score/counts.
  // Redefining `issues` as the visible set means filtered/grouped/contributions
  // all inherit the waivers automatically.
  const muted      = useWaiverStore((s) => s.muted)
  const toggleMute = useWaiverStore((s) => s.toggleMute)
  const unmuteAll  = useWaiverStore((s) => s.unmuteAll)
  const mutedSet   = useMemo(() => new Set(muted), [muted])
  const issues     = useMemo(() => rawIssues.filter((i) => !mutedSet.has(issueKey(i))), [rawIssues, mutedSet])
  const mutedCount = rawIssues.length - issues.length
  const handleMute = useCallback((i: ValidationIssue) => toggleMute(issueKey(i)), [toggleMute])

  // Displayed stats/score reflect waivers: reuse the run's own values when nothing
  // is muted, else recompute over the visible issues so the headline matches the list.
  const stats = useMemo(() => {
    if (!result) return undefined
    if (mutedCount === 0) return result.stats
    let errors = 0, warnings = 0, info = 0
    for (const i of issues) {
      if (i.severity === 'error') errors++
      else if (i.severity === 'warning') warnings++
      else info++
    }
    return { ...result.stats, total: issues.length, errors, warnings, info }
  }, [result, issues, mutedCount])

  const displayScore = useMemo(() => {
    if (!result) return null
    return mutedCount > 0 ? calculateQualityScore({ issues }) : (result.qualityScore ?? null)
  }, [result, issues, mutedCount])

  // Honest-score signals: a run is only trustworthy when every enabled rule ran.
  const coverage = result?.metadata?.coverage
  // Two different ways a run can be less than it appears, and they are not the
  // same thing. `complete` says every enabled RULE ran. `unreadableEntities`
  // says how much of the MODEL the rules could actually see — a file where
  // thousands of entities failed to parse still runs every rule, and used to
  // report a Health Score as though it had read the whole thing.
  const coverageIncomplete = !!coverage && (!coverage.complete || coverage.unreadableEntities > 0)

  // Run-to-run comparison for the active model (Phase 4): the panel diffs the
  // current cached result against the snapshot taken before the latest run.
  const runDiff = useMemo<ValidationDiff | null>(() => {
    if (!activeValidationModelId) return null
    const prev = previousResultByModel[activeValidationModelId]
    const curr = cachedResultsByModel[activeValidationModelId]
    if (!prev || !curr) return null
    const d = diffResults(prev, curr)
    return d.unchanged ? null : d
  }, [previousResultByModel, cachedResultsByModel, activeValidationModelId])

  // Elements with an edit not yet exported, per model (renames and GUID fixes).
  // Built from the history, where the modelId lives — the flattened `diffs`
  // drop it, which used to mark #348 "edited" in every loaded model at once.
  const pendingIndex = useMemo(() => buildPendingIndex(history, historyIndex), [history, historyIndex])

  // ── Filter / group ────────────────────────────────────────────────────

  const filtered = useMemo(() => {
    let list = issues
    if (modelFilter) list = list.filter((i) => i.modelId === modelFilter)
    if (filters.activeTab === 'errors')        list = list.filter((i) => i.severity === 'error')
    else if (filters.activeTab === 'warnings') list = list.filter((i) => i.severity === 'warning')
    else if (filters.activeTab === 'info')     list = list.filter((i) => i.severity === 'info')
    if (search) {
      const q = search.toLowerCase()
      list = list.filter(
        (i) =>
          i.elementName.toLowerCase().includes(q) ||
          i.message.toLowerCase().includes(q) ||
          i.path.join(' ').toLowerCase().includes(q) ||
          i.ruleId.toLowerCase().includes(q),
      )
    }
    return list
  }, [issues, filters.activeTab, search, modelFilter])

  const grouped = useMemo(() => {
    const map = new Map<string, ValidationIssue[]>()
    for (const issue of filtered) {
      let key = ''
      if (filters.groupBy === 'rule')        key = issue.ruleId
      else if (filters.groupBy === 'storey') key = issue.path[issue.path.length - 2] ?? issue.path[0] ?? t('filters.unknownStorey')
      else                                   key = issue.ifcClass
      const g = map.get(key) ?? []
      g.push(issue)
      map.set(key, g)
    }
    return map
  }, [filtered, filters.groupBy])

  // ── Actionable score (Phase 2) ────────────────────────────────────────────
  // Per-rule impact on the Health Score: drives the executive summary and the
  // by-impact group ordering. Based on ALL issues (the score is global), not the
  // current view filter.
  const contributions = useMemo(() => explainQualityScore({ issues }), [issues])
  const penaltyByRule = useMemo(
    () => new Map(contributions.map((c) => [c.ruleId, c.penalty])),
    [contributions],
  )

  // Public Health Score benchmark ("your 82 vs industry avg 71"). Fetched once;
  // null until the Worker/KV is configured and the sample reaches BENCH_MIN_N.
  const [bench, setBench] = useState<BenchStats | null>(null)
  useEffect(() => { void fetchBenchmark().then(setBench) }, [])

  // When the user clicks a "fix this first" action, focus that rule's group.
  const [focusRule, setFocusRule] = useState<string | null>(null)
  const handleJumpToRule = useCallback((ruleId: string) => {
    setFilters({ groupBy: 'rule', activeTab: 'all' })
    setSearch('')
    setFocusRule(ruleId)
  }, [setFilters])

  // ── Handlers ──────────────────────────────────────────────────────────

  const handleJumpTo = useCallback((issue: ValidationIssue) => {
    // The modelId travels with the click. Without it the tree lights up every
    // element that happens to share the number, and the viewer frames whichever
    // model it finds first — which in a federated set is usually not this one.
    setSelection([{ expressId: issue.expressId, modelId: issue.modelId }])
    onJumpToElement?.(issue.expressId, issue.modelId)
    trackIssueViewed({ rule_id: issue.ruleId, severity: issue.severity })
  }, [setSelection, onJumpToElement])

  // An element the simulated flood reaches (flood group): same select-and-fly as an issue.
  const handleFloodJump = useCallback((expressId: number, modelId: string) => {
    setSelection([{ expressId, modelId }])
    onJumpToElement?.(expressId, modelId)
  }, [setSelection, onJumpToElement])

  const handleAutoFix = useCallback((issue: ValidationIssue) => {
    if ((issue.ruleId === 'RULE_DUPLICATE_GUID' || issue.ruleId === 'RULE_INVALID_GUID_FORMAT') && issue.globalId) {
      trackGuidFixed({ guid_count: 1 })
      trackIssueFixApplied({ rule_id: issue.ruleId, fix_type: 'auto_fix' })
      addCommand(buildFixGuidCommand(issue.expressId, issue.globalId, issue.modelId))
    }
  }, [addCommand])

  const handleBatchFix = useCallback(() => {
    const fixable = filtered.filter(
      (i) => i.autoFixable && (i.ruleId === 'RULE_DUPLICATE_GUID' || i.ruleId === 'RULE_INVALID_GUID_FORMAT') && i.globalId,
    )
    if (fixable.length === 0) return
    trackGuidFixed({ guid_count: fixable.length })
    trackIssueFixApplied({ rule_id: 'RULE_DUPLICATE_GUID', fix_type: 'batch_guid' })
    for (const issue of fixable) {
      addCommand(buildFixGuidCommand(issue.expressId, issue.globalId!, issue.modelId))
    }
  }, [filtered, addCommand])

  const handleNameFix = useCallback((issue: ValidationIssue, field: 'Name' | 'LongName', newValue: string) => {
    const oldValue = issue.elementName === '(empty)' ? '' : issue.elementName
    addCommand(buildRenameCommand(issue.expressId, field, oldValue, newValue, issue.modelId))
    trackIssueFixApplied({ rule_id: issue.ruleId, fix_type: 'name_edit' })
  }, [addCommand])

  // ── Batch rename ("Fix all N" for duplicate / empty names) ────────────────
  // Preview → one undoable edit per model → export → check those exact bytes
  // in isolation → before/after on the card → download. Nothing here touches
  // `result`, the cache or the history of runs: the headline stays on the file
  // as loaded (D-36).

  // What a batch acts on: the visible issues, minus duplicates the pending
  // edits already settle (see settledDuplicateKeys).
  const batchIssues = useMemo(() => {
    const settled = settledDuplicateKeys(rawIssues, pendingIndex, activeValidationModelId ?? undefined)
    return settled.size === 0 ? issues : issues.filter((i) => !settled.has(fixIssueKey(i)))
  }, [issues, rawIssues, pendingIndex, activeValidationModelId])

  // The card follows the scene: models that left it are not offered. An empty
  // scene keeps none, so the batch (and its bytes) go with the last model.
  const fixModelIds = useMemo(() => {
    if (!fixBatch) return []
    const inScene = new Set(sceneModels.map((m) => m.id))
    return fixBatch.modelIds.filter((id) => inScene.has(id))
  }, [fixBatch, sceneModels])
  const fixRuns = useMemo(
    () => fixModelIds.map((id) => fixRunsById[id]).filter((r): r is NonNullable<typeof r> => !!r),
    [fixModelIds, fixRunsById],
  )
  // A model of the batch is still being written or checked (or queued).
  const fixChecking = !!fixBatch && fixCardView(fixModelIds, fixRuns, fixBatch.batchId).working !== null

  // N on each "Fix all N", and why the button is disabled when it is. The
  // target models are the rule's visible issues within the model filter.
  const batchState = useMemo(() => {
    const counts:  Partial<Record<BatchRenameRule, number>> = {}
    const reasons: Partial<Record<BatchRenameRule, string | null>> = {}
    const fallback = activeValidationModelId ?? undefined
    for (const ruleId of BATCH_RULE_IDS) {
      counts[ruleId] = countBatchTargets(batchIssues, ruleId, pendingIndex, modelFilter, fallback)
      let reason: string | null = null
      if (isRunning || !result) {
        reason = t('batchFix.disabledRunning')
      } else if (fixChecking) {
        // One fixed-file check at a time: each holds its own web-ifc heap and a
        // copy of the model, and a second batch would export and check at once.
        reason = t('batchFix.disabledChecking')
      } else {
        const modelIds = new Set<string>()
        for (const i of batchIssues) {
          if (i.ruleId !== ruleId || (modelFilter && i.modelId !== modelFilter)) continue
          modelIds.add(i.modelId ?? fallback ?? '')
        }
        for (const id of modelIds) {
          // Same check as the toolbar's IFC export: a fragments-only cache load
          // has geometry but no IFC bytes to write the fix into.
          if (!id || !modelRegistry.getBuffer(id)) { reason = t('batchFix.disabledNoBuffer'); break }
          // No tree YET (an empty one is a validated model without spatial
          // structure, which plans fine — re-validating would not change it).
          if (spatialTrees[id] === undefined)       { reason = t('batchFix.disabledNoTree');   break }
        }
      }
      reasons[ruleId] = reason
    }
    return { counts, reasons }
    // sceneModels: a model loading or leaving changes which buffers exist.
  }, [batchIssues, pendingIndex, modelFilter, activeValidationModelId, isRunning, result, fixChecking, spatialTrees, sceneModels, t])

  const [batchDialog, setBatchDialog] = useState<{ ruleId: BatchRenameRule; beforeScore: number } | null>(null)

  const planBatch = useCallback((ruleId: BatchRenameRule, pattern: ParsedPattern, keepFirst: boolean): BatchRenamePlan => {
    const fallback = activeValidationModelId ?? undefined
    const pendingNamesByModel: Record<string, ReadonlyMap<number, string>> = {}
    for (const i of batchIssues) {
      const id = i.modelId ?? fallback
      if (i.ruleId === ruleId && id && !pendingNamesByModel[id]) pendingNamesByModel[id] = pendingNamesForModel(id)
    }
    return planBatchRename({
      ruleId, pattern, keepFirst, modelFilter,
      issues: batchIssues,
      trees: spatialTrees,
      pendingNamesByModel,
      pending: pendingIndex,
      fallbackModelId: fallback,
      // Muted members keep their names, so keep-first must not keep a second one.
      heldIssues: rawIssues.filter((i) => i.ruleId === ruleId && mutedSet.has(issueKey(i))),
    })
  }, [batchIssues, rawIssues, mutedSet, modelFilter, spatialTrees, pendingIndex, activeValidationModelId])

  const dialogRuleId = batchDialog?.ruleId
  const dialogPlanner = useCallback(
    (pattern: ParsedPattern, keepFirst: boolean): BatchRenamePlan =>
      planBatch(dialogRuleId ?? 'RULE_DUPLICATE_NAME', pattern, keepFirst),
    [planBatch, dialogRuleId],
  )
  // What the exported file will no longer have, before this plan: the name
  // issues the pending edits already clear (an element renamed by hand, an
  // earlier batch, a duplicate group they settle). The fixed file carries
  // every pending edit, so predicting from `issues` alone would contradict
  // the measured score — "89 → 97 predicted" for a file that measures 100.
  // The "before" stays the displayed score, as on the card.
  const predictionBase = useMemo(() => {
    const fallback = activeValidationModelId ?? undefined
    return batchIssues.filter((i) => !(isBatchRenameRule(i.ruleId) && pendingIndex.hasName(i.modelId ?? fallback, i.expressId)))
  }, [batchIssues, pendingIndex, activeValidationModelId])
  const predictAfter = useCallback(
    (plan: BatchRenamePlan) => predictScoreAfter(predictionBase, plan.clearedKeys),
    [predictionBase],
  )
  const namingConventionActive = !!rules.RULE_NAMING_CONVENTION
    && Object.keys(rules.namingConventionPatterns ?? {}).length > 0

  const handleOpenBatchRename = useCallback((ruleId: BatchRenameRule) => {
    if (batchState.reasons[ruleId] || displayScore == null) return
    trackFeatureUsed({ feature: 'batch_fix_preview' })
    // The "before" is the score on screen when the preview opened.
    setBatchDialog({ ruleId, beforeScore: displayScore })
  }, [batchState, displayScore])

  const fixFileNames = useMemo(() => {
    const names: Record<string, string> = {}
    for (const m of sceneModels) names[m.id] = m.fileName
    return names
  }, [sceneModels])

  // Undo a whole batch (toast, card). Ctrl+Z gets the same through the editor
  // store, and the batch store notices by itself.
  const handleUndoBatch = useCallback((batchId?: string) => {
    const id = batchId ?? useBatchFixStore.getState().batch?.batchId
    if (!id) return
    const editor = useEditorStore.getState()
    // Already undone (Ctrl+Z first, then the toast's button): nothing left to do.
    if (!editor.history.slice(0, editor.historyIndex + 1).some((c) => c.batchId === id)) return
    if (editor.undoBatch(id)) {
      useBatchFixStore.getState().removeBatch(id)
      toast(t('batchFix.toast.undone'), 'info')
    } else {
      toast(t('batchFix.toast.undoBlocked'), 'warning')
    }
  }, [t])

  const [focusFixCardFor, setFocusFixCardFor] = useState<string | null>(null)

  const handleApplyBatchRename = useCallback(({ pattern, keepFirst, patternEdited }: BatchRenameApply) => {
    const open = batchDialog
    setBatchDialog(null)
    if (!open) return
    const { ruleId, beforeScore } = open
    // The preview was for a finished result. A run that started behind the
    // dialog (another model's auto-validation) streams partial issues, maybe
    // of another model: never plan from those.
    if (isRunning || !result || batchState.reasons[ruleId]) return
    // Plan once more from the live state: the preview can be a render behind.
    const plan = planBatch(ruleId, pattern, keepFirst)
    if (plan.renamed === 0 || plan.missingTree.length > 0) return

    const batchId = crypto.randomUUID()
    for (const cmd of planToCommands(plan, batchId)) addCommand(cmd)

    const modelIds = Object.keys(plan.byModel).sort()
    const keptFirst = ruleId === 'RULE_DUPLICATE_NAME' && keepFirst && plan.keepFirstAvailable
    // Counts and token names only: never a name, the pattern text or a file name.
    trackIssueFixApplied({
      rule_id:        ruleId,
      fix_type:       'batch_name',
      count:          plan.renamed,
      cleared:        plan.cleared,
      model_count:    modelIds.length,
      keep_first:     keptFirst,
      pattern_edited: patternEdited,
      pattern_tokens: pattern.tokens.join(','),
      is_demo:        modelIds.some((id) => DEMO_FILENAMES.has(fixFileNames[id] ?? '')),
    })
    toast(t('batchFix.toast.applied', { count: plan.renamed }), 'success', {
      duration: 10_000,
      action:   { label: t('batchFix.toast.undo'), run: () => handleUndoBatch(batchId) },
    })

    const batch: FixBatch = {
      batchId, ruleId, modelIds,
      renamed:         plan.renamed,
      cleared:         plan.cleared,
      predictedBefore: beforeScore,
      predictedAfter:  predictScoreAfter(predictionBase, plan.clearedKeys),
      patternEdited,
      keepFirst:       keptFirst,
      tokens:          pattern.tokens,
      startedAt:       Date.now(),
    }
    useBatchFixStore.getState().beginBatch(batch)
    // The control that opened the preview is gone (its count dropped to 0):
    // hand focus to the card, where Download and Undo now are.
    setFocusFixCardFor(batchId)
    void runFixChecks(batch, fixFileNames)
  }, [batchDialog, isRunning, result, batchState, planBatch, addCommand, predictionBase, fixFileNames, handleUndoBatch, t])

  // Once the card has taken focus, a later remount must not grab it again.
  useEffect(() => {
    if (focusFixCardFor) setFocusFixCardFor(null)
  }, [focusFixCardFor])

  // A validation run started behind the open preview (a model finished
  // loading and auto-validates): the preview no longer matches what is on
  // screen, so close it rather than apply a plan made from partial issues.
  useEffect(() => {
    if (isRunning) setBatchDialog(null)
  }, [isRunning])

  const handleDismissFixRun = useCallback(() => {
    const batch = useBatchFixStore.getState().batch
    if (batch) useBatchFixStore.getState().removeBatch(batch.batchId)
  }, [])

  // Check again (stale) / Retry (error): export and check every model of the
  // batch afresh, with the edits as they are now.
  const handleRecheckFixed = useCallback(() => {
    const batch = useBatchFixStore.getState().batch
    if (batch) void runFixChecks(batch, fixFileNames)
  }, [fixFileNames])

  // A fresh click, and nothing awaited before the save: see downloadFixedRun.
  const handleDownloadFixed = useCallback((modelId: string) => {
    const run = useBatchFixStore.getState().runs[modelId]
    if (run) downloadFixedRun(run)?.catch((err: unknown) => toastFromError(err))
  }, [])

  const fixSummary = useMemo(() => (fixBatch
    ? summarizeFixBatch(fixBatch, fixRunsById, sceneModels.map((m) => m.id), cachedResultsByModel, mutedSet)
    : null), [fixBatch, fixRunsById, sceneModels, cachedResultsByModel, mutedSet])
  const showFixCard = !!fixBatch && fixModelIds.length > 0

  // Every model of the batch left the scene: drop the batch and its bytes.
  useEffect(() => {
    if (fixBatch && fixModelIds.length === 0) useBatchFixStore.getState().removeBatch(fixBatch.batchId)
  }, [fixBatch, fixModelIds])

  // Per-model results offered to the export modal. Prefer each model's cached
  // result; the scene order is preserved. Falls back to the displayed aggregate
  // result keyed by the active model when no per-model cache exists yet (single
  // model that was validated before multi-model caching kicked in).
  const exportModels = useMemo<ExportModelEntry[]>(() => {
    const entries: ExportModelEntry[] = []
    for (const m of sceneModels) {
      const r = cachedResultsByModel[m.id]
      if (r) entries.push({ modelId: m.id, fileName: m.fileName, result: r })
    }
    if (entries.length === 0 && result) {
      // Fallback: no per-model cache, use the single displayed result.
      const fallbackModel = sceneModels.find((m) => m.id === activeValidationModelId) ?? sceneModels[0]
      entries.push({
        modelId:  fallbackModel?.id ?? 'active',
        fileName: fallbackModel?.fileName ?? 'model.ifc',
        result,
      })
    }
    return entries
  }, [sceneModels, cachedResultsByModel, result, activeValidationModelId])

  const handleRunValidation = useCallback(() => {
    // force=true bypasses the OPFS result cache so that changed profiles /
    // rule configs always produce a fresh run instead of returning stale data.
    // With several models in the scene, validate ALL of them and show the
    // aggregate (runValidationAll falls back to the single active model when
    // only one is loaded).
    void runValidationAll(undefined, true)
  }, [])


  // ── Benchmark (anonymous, aggregate-only) ─────────────────────────────────
  // Fold each delivered file's Health Score into the public benchmark — once
  // per file per session, never the multi-model aggregate, never a demo, a
  // file this app wrote, or a score measured on edited bytes (benchmark-guard).
  // Sends ONLY the integer score (no model data); the IFC never moves.
  // Runs when a result is PUBLISHED, never when the scene changes: `result`
  // outlives the model it describes (removing the last validated model only
  // sets the status to idle), so re-running on a scene change would post the
  // previous file's score under the next model's key — and then block that
  // model's real score as already posted.
  useEffect(() => {
    if (!result) return
    const models = useSceneStore.getState().models
    const base = defaultBenchmarkDeps()
    // A single model validated before the per-model cache existed has only
    // the displayed result; it IS that model's result — when the run is
    // finished and nothing in it names another model.
    const isThisModels = (id: string): boolean =>
      useValidationStore.getState().validationStatus === 'complete'
      && result.issues.every((i) => i.modelId === undefined || i.modelId === id)
    const deps = models.length === 1
      ? { ...base, getResult: (id: string) => base.getResult(id) ?? (isThisModels(id) ? result : undefined) }
      : base
    for (const { key, score } of benchmarkCandidates(models, deps, benchPostedKeys)) {
      benchPostedKeys.add(key)
      postBenchmark(score)
    }
  }, [result])

  // ── Share Report (URL hash — zero server, zero storage) ───────────────────
  // Encodes the Health Score + condensed issue list into a base64 URL fragment.
  // Anyone with the link sees the report without uploading anything.
  const handleShareReport = useCallback(async () => {
    if (!result) return

    const payload = validationResultToSharePayload(result, sceneModels[0]?.fileName ?? 'model.ifc')

    try {
      // Prefer the crawlable Cloudflare Worker route (server-rendered HTML + OG
      // meta = a shareable, indexable backlink — D-21 / moat #3). Falls back to
      // the in-app hash link when no worker URL is configured, so behaviour is
      // unchanged until VITE_REPORT_URL is set. Encoding contract lives in
      // src/lib/share-report.ts (mirrored by the Worker's decodeReport).
      const reportBase = import.meta.env.VITE_REPORT_URL as string | undefined
      const appBase    = `${window.location.origin}${window.location.pathname}`
      const { url }    = buildShareUrl(payload, reportBase, appBase)

      // Prefer the native OS share sheet (Web Share API) — especially powerful
      // on iOS Safari and Android Chrome where it opens WhatsApp, Slack, Mail, etc.
      // On unsupported browsers, or on errors other than user-cancel, falls back
      // to clipboard copy.
      if (typeof navigator.share === 'function' && navigator.canShare?.({ url })) {
        try {
          await navigator.share({
            title: `IFC Health Score: ${result.qualityScore ?? 0}/100`,
            url,
          })
          trackShareReportClicked()
          return // native share sheet handled the UX — no toast needed
        } catch (shareErr) {
          // User dismissed the share sheet — respect that, do nothing
          if (shareErr instanceof DOMException && shareErr.name === 'AbortError') return
          // Other errors (NotAllowedError, etc) → fall through to clipboard
        }
      }

      // Fallback: copy link to clipboard
      const copied = await copyToClipboard(url)
      trackShareReportClicked()
      toast(
        copied ? t('actions.reportLinkCopied') : t('actions.reportLinkError'),
        copied ? 'success' : 'error',
      )
    } catch {
      toast(t('actions.reportLinkError'), 'error')
    }
  }, [result, sceneModels, t])

  // ── Copy Badge (embeddable Health Score) ──────────────────────────────────
  // Copies a markdown snippet — an SVG badge that links to the crawlable report
  // — for the sender to paste into a deliverable README / PR / handoff. This is
  // the distribution primitive: the number travels off-site, verifiably. Only
  // available when the Worker base (VITE_REPORT_URL) is configured.
  const handleCopyBadge = useCallback(async () => {
    if (!result) return
    const fileName   = sceneModels[0]?.fileName ?? 'model.ifc'
    const payload    = validationResultToSharePayload(result, fileName)
    const reportBase = import.meta.env.VITE_REPORT_URL as string | undefined
    const appBase    = `${window.location.origin}${window.location.pathname}`
    const { url }    = buildShareUrl(payload, reportBase, appBase)
    const markdown   = buildBadgeMarkdown(result.qualityScore ?? 0, url, reportBase)
    if (!markdown) {
      toast(t('actions.reportLinkError'), 'error')
      return
    }
    const copied = await copyToClipboard(markdown)
    trackShareReportClicked()
    toast(
      copied ? 'Badge markdown copied — paste it into your deliverable README' : t('actions.reportLinkError'),
      copied ? 'success' : 'error',
    )
  }, [result, sceneModels, t])

  // ── Copy for AI ──────────────────────────────────────────────────────────────
  // Formats the validation result as structured plain text and copies it to the
  // clipboard. Zero server, zero URL — pure clipboard. Debounced via `copying`
  // state so rapid double-taps don't enqueue duplicate toasts.
  const handleCopyForAI = useCallback(async () => {
    if (!result) return
    if (copying) return

    const fileName = sceneModels[0]?.fileName ?? 'model.ifc'
    const text = buildCopyForAIText(result, fileName)

    setCopying(true)
    try {
      const ok = await copyToClipboard(text)
      trackFeatureUsed({ feature: 'copy_for_ai' })
      toast(
        ok
          ? 'Report copied — paste into Claude or ChatGPT'
          : 'Clipboard unavailable — try again',
        ok ? 'success' : 'error',
      )
    } catch {
      toast('Could not copy to clipboard', 'error')
    } finally {
      setTimeout(() => setCopying(false), 2000)
    }
  }, [result, sceneModels, copying])

  const handleAddIssueToBcf = useCallback((issue: ValidationIssue) => {
    const snapshot = viewer?.takeSnapshot?.() ?? undefined
    const [topic]  = issuesToBcfTopics([issue], snapshot)
    if (!topic) return
    useBcfStore.getState().addTopics([topic])
    setActivePanel('bcf')
    toast(t('bcf.addedToBcf'), 'success')
  }, [viewer, t])


  // ── Group open/close logic ───────────────────────────────────────────────────
  // Reset state when grouping strategy / severity tab / model filter changes.
  // Auto-open all groups when there are ≤ 3 groups or ≤ 15 total issues so
  // small / clean files don't require an extra click.
  // Intentionally NOT triggered by `search` changes — the user is mid-type.
  // eslint-disable-next-line react-hooks/exhaustive-deps
  useEffect(() => {
    const keys         = [...grouped.keys()]
    const shouldAutoOpen = keys.length <= 3 || filtered.length <= 15
    setOpenGroups(shouldAutoOpen ? new Set(keys) : new Set())
    setExpandedGroups(new Set())
  // deps: groupBy + tab + modelFilter + result — NOT search
  }, [filters.groupBy, filters.activeTab, modelFilter, result])

  // Focus a specific rule's group when the user clicks a "fix this first" action.
  // Additive (runs after the reset effect above), so it opens the target group
  // without fighting the auto-open logic.
  useEffect(() => {
    if (!focusRule) return
    if (![...grouped.keys()].includes(focusRule)) return
    setOpenGroups((prev) => new Set(prev).add(focusRule))
    setExpandedGroups((prev) => new Set(prev).add(focusRule))
    setFocusRule(null)
  }, [focusRule, grouped])

  const toggleAllGroups = useCallback(() => {
    if (openGroups.size === grouped.size && grouped.size > 0) {
      setOpenGroups(new Set())               // all open → collapse all
    } else {
      setOpenGroups(new Set(grouped.keys())) // some/none → expand all
    }
  }, [openGroups.size, grouped])

  const autoFixableCount = filtered.filter((i) => i.autoFixable).length

  // ── Flattened virtual list ────────────────────────────────────────────
  // Headers + visible issue rows + "show more" expanders collapse into a single
  // flat array. Virtualization keeps DOM node count bounded regardless of how
  // many issues a group holds, so expanding a 10k-issue group never freezes.

  // Order groups by score impact when grouping by rule (biggest drag first);
  // by issue count otherwise — keeps "what matters most" at the top of the list.
  const orderedGroups = useMemo<Array<[string, ValidationIssue[]]>>(() => {
    const entries = [...grouped.entries()]
    if (filters.groupBy === 'rule') {
      entries.sort((a, b) => (penaltyByRule.get(b[0]) ?? 0) - (penaltyByRule.get(a[0]) ?? 0))
    } else {
      entries.sort((a, b) => b[1].length - a[1].length)
    }
    return entries
  }, [grouped, filters.groupBy, penaltyByRule])

  const flatRows = useMemo<FlatRow[]>(() => {
    const rows: FlatRow[] = []
    for (const [groupKey, groupIssues] of orderedGroups) {
      rows.push({ kind: 'header', groupKey, groupIssues })
      if (!openGroups.has(groupKey)) continue
      // "Fix all N" for the two name rules: an offer while there is something
      // to rename, a pointer to the card once a batch for the rule exists.
      if (filters.groupBy === 'rule' && isBatchRenameRule(groupKey)
          && ((batchState.counts[groupKey] ?? 0) > 0 || fixBatch?.ruleId === groupKey)) {
        rows.push({ kind: 'batchfix', groupKey })
      }
      // Per-rule fix guidance, only when grouping by rule and guidance exists.
      if (filters.groupBy === 'rule' && getRuleRemediation(groupKey, i18n.language)) {
        rows.push({ kind: 'remediation', groupKey })
      }
      const fullyExpanded = expandedGroups.has(groupKey)
      const visible = fullyExpanded ? groupIssues : groupIssues.slice(0, PREVIEW_ROWS)
      for (const issue of visible) rows.push({ kind: 'issue', groupKey, issue })
      const hiddenCount = groupIssues.length - PREVIEW_ROWS
      if (!fullyExpanded && hiddenCount > 0) {
        rows.push({ kind: 'expander', groupKey, hiddenCount })
      }
    }
    return rows
  }, [orderedGroups, openGroups, expandedGroups, filters.groupBy, i18n.language, batchState.counts, fixBatch?.ruleId])

  const scrollRef = useRef<HTMLDivElement>(null)
  const listRef   = useRef<HTMLDivElement>(null)
  const [listOffset, setListOffset] = useState(0)

  // The virtualized list does not start at the top of the scroll element
  // (a progress bar may precede it). scrollMargin tells the virtualizer that
  // offset so item positions and scroll math stay correct.
  // The fixed-file card re-measures while it is up (onResize); this catches it
  // appearing and going away.
  useLayoutEffect(() => {
    setListOffset(listRef.current?.offsetTop ?? 0)
  }, [isRunning, activePanel, flatRows.length, showFixCard])

  const virtualizer = useVirtualizer({
    count:           flatRows.length,
    getScrollElement: () => scrollRef.current,
    estimateSize:    (i) => {
      const r = flatRows[i]
      return r.kind === 'header' ? 30 : r.kind === 'expander' ? 37 : r.kind === 'remediation' ? 150 : r.kind === 'batchfix' ? 36 : 92
    },
    overscan:     8,
    scrollMargin: listOffset,
    getItemKey:   (i) => {
      const r = flatRows[i]
      return r.kind === 'issue' ? r.issue.id : `${r.kind}:${r.groupKey}`
    },
  })

  // The batch rename preview. One instance for both layouts: Modal turns into
  // a bottom sheet on phones by itself. Mounted only while open, so every
  // opening starts from the rule's default pattern.
  const batchRenameDialog = batchDialog && (
    <BatchRenameDialog
      key={batchDialog.ruleId}
      ruleId={batchDialog.ruleId}
      onClose={() => setBatchDialog(null)}
      planner={dialogPlanner}
      beforeScore={batchDialog.beforeScore}
      predictAfter={predictAfter}
      namingConventionActive={namingConventionActive}
      onApply={handleApplyBatchRename}
    />
  )

  // Empty names still to fill, offered on the card after a duplicate-name batch.
  const alsoFixEmptyCount = batchState.reasons.RULE_EMPTY_NAME ? 0 : (batchState.counts.RULE_EMPTY_NAME ?? 0)

  // ── Mobile: dedicated bottom-sheet variant (desktop render path untouched) ──
  // All hooks above have run; we forward the already-computed view-model + the
  // handlers so the mobile presentation duplicates none of this component's logic.
  if (isMobile) {
    return (
      <>
        <ValidationPanelMobile
          open={validationPanelOpen}
          vm={{
            language: i18n.language,
            result, stats, displayScore, coverage, coverageIncomplete, contributions, bench,
            issues, orderedGroups, filtered, filters, setFilters, search, setSearch,
            modelFilter, setModelFilter, sceneModels, isRunning, progress, validationStatus, validationError,
            hasModel, autoFixableCount, pendingFixIds: pendingIndex, mutedCount, unmuteAll, runDiff,
            activePanel, setActivePanel, bcfTopicCount, viewer,
            activeProfileId, customProfiles, setActiveProfile,
            exportModels, rules,
            resolveProfileName: (p) => localizedProfileName(p, t),
            onRun: handleRunValidation,
            onJumpTo: handleJumpTo,
            onAutoFix: handleAutoFix,
            onNameFix: handleNameFix,
            onMute: handleMute,
            onAddToBcf: handleAddIssueToBcf,
            onShareReport: handleShareReport,
            onCopyForAI: handleCopyForAI,
            onCopyBadge: handleCopyBadge,
            onBatchFix: handleBatchFix,
            onClose: toggleValidationPanel,
            onFloodJump: handleFloodJump,
            batchCounts: batchState.counts,
            batchDisabledReason: batchState.reasons,
            onOpenBatchRename: handleOpenBatchRename,
            fixBatch: showFixCard ? fixBatch : null,
            fixModelIds,
            fixRuns,
            fixSummary,
            alsoFixEmptyCount,
            onDownloadFixed: handleDownloadFixed,
            onUndoBatch: () => handleUndoBatch(),
            onDismissFixRun: handleDismissFixRun,
            onRecheckFixed: handleRecheckFixed,
            focusFixCard: !!fixBatch && focusFixCardFor === fixBatch.batchId,
          }}
        />
        {batchRenameDialog}
      </>
    )
  }

  // ── Collapsed state ───────────────────────────────────────────────────

  if (!validationPanelOpen) {
    // The same strip component the tree and the sidebar collapse to. This panel
    // already behaved correctly — it was the one the rule was generalised FROM —
    // but three copies of a rule drift apart, and these three already had.
    return (
      <ColumnStrip
        edge="bottom"
        label={t('panel.title')}
        // Below the desktop breakpoint this panel is a different surface
        // entirely; a desktop rail there would be a second, wrong way in.
        className="max-md:hidden"
        onExpand={() => {
          // The bottom slot is shared with the IdsPanel — the two are exclusive.
          useIdsStore.getState().setPanelOpen(false)
          toggleValidationPanel()
          trackValidationPanelOpened({ trigger: 'manual' })
        }}
      >
        {stats ? (
          <div className="flex items-center gap-2">
            <MiniBarChart errors={stats.errors} warnings={stats.warnings} info={stats.info} />
            {stats.errors > 0 && (
              <span className="text-[11px] text-[var(--danger)] font-mono">{stats.errors}E</span>
            )}
            {stats.warnings > 0 && (
              <span className="text-[11px] font-mono" style={{ color: '#F5A623' }}>{stats.warnings}W</span>
            )}
            {stats.info > 0 && (
              <span className="text-[11px] font-mono" style={{ color: '#5E9ED6' }}>{stats.info}I</span>
            )}
            {stats.errors === 0 && stats.warnings === 0 && stats.info === 0 && (
              <span className="text-[11px] text-[var(--ok)] font-mono">✓ {t('results.noIssues')}</span>
            )}
            {displayScore != null && (
              <span
                className="px-1.5 py-0.5 rounded-full font-mono font-bold text-[10px] border leading-none"
                style={(() => {
                  const c = displayScore >= 80 ? 'var(--ok)' : displayScore >= 50 ? '#F5A623' : 'var(--danger)'
                  return { color: c, borderColor: `${c}44`, background: `${c}14` }
                })()}
              >
                {displayScore}
              </span>
            )}
          </div>
        ) : isRunning ? (
          <span className="text-[11px] text-[var(--accent)] font-mono animate-pulse">
            {t('validating', { progress })}
          </span>
        ) : null}
      </ColumnStrip>
    )
  }

  // ── Expanded state ────────────────────────────────────────────────────

  return (
    // Unpositioned on purpose (no relative / z-*): content panels paint over
    // this drawer's right side, and it yields that width with padding.
    <div
      ref={drawerRef}
      data-bottom-drawer="validation"
      className="flex flex-col border-t border-[var(--border)] bg-[var(--surface)] shrink-0"
      style={{
        height:       drawerHeightCss(drawerRatio, DRAWER_MIN_PX),
        minHeight:    DRAWER_MIN_PX,
        paddingRight: drawerReserve || undefined,
      }}
    >
      <DrawerResizeGrip drawerRef={drawerRef} minPx={DRAWER_MIN_PX} />

      {/* ── Row 1: identity + stats + actions ── */}
      <div className="flex items-center gap-2 px-3 h-9 border-b border-[var(--border)] shrink-0 overflow-hidden">
        {/* Labels clip before controls do when a panel takes part of the width. */}
        <div className="flex items-center gap-2 min-w-0 flex-1 overflow-hidden">
        <span className="text-[11px] font-semibold text-[var(--text-dim)] uppercase tracking-wider shrink-0">
          {t('panel.title')}
        </span>

        {stats && (
          <div className="flex items-center gap-1.5 text-[11px] font-mono min-w-0">
            {stats.errors > 0 && (
              <span className="text-[var(--danger)] shrink-0">{stats.errors}E</span>
            )}
            {stats.warnings > 0 && (
              <span style={{ color: '#F5A623' }} className="shrink-0">{stats.warnings}W</span>
            )}
            {stats.info > 0 && (
              <span style={{ color: '#5E9ED6' }} className="shrink-0">{stats.info}I</span>
            )}
            {stats.total === 0 && (
              <span className="text-[var(--ok)] shrink-0">✓</span>
            )}
            {displayScore != null && (
              <span
                className="ml-0.5 px-1.5 py-0.5 rounded-full font-bold text-[9px] border leading-none shrink-0"
                style={(() => {
                  const c = displayScore >= 80 ? 'var(--ok)' : displayScore >= 50 ? '#F5A623' : 'var(--danger)'
                  return { color: c, borderColor: `${c}44`, background: `${c}14` }
                })()}
                title={[
                  t('coverage.qualityTitle'),
                  coverageIncomplete
                    ? t('coverage.partialTitle', { ran: coverage?.okCount ?? 0, total: coverage?.attempted.length ?? 0 })
                    : null,
                  mutedCount > 0 ? t('waivers.scoreNote', { count: mutedCount }) : null,
                  unconfiguredRules.length > 0
                    ? `${TOTAL_RULE_COUNT - unconfiguredRules.length}/${TOTAL_RULE_COUNT} active rules (${unconfiguredRules.length} unconfigured)`
                    : null,
                ].filter(Boolean).join(' · ')}
              >
                {displayScore}
                {coverageIncomplete && (
                  <span className="ml-0.5" style={{ color: 'var(--danger)' }}>⚠</span>
                )}
                {mutedCount > 0 && (
                  <span className="ml-0.5 opacity-60">⊘</span>
                )}
                {unconfiguredRules.length > 0 && (
                  <span className="ml-0.5 opacity-60">⚙</span>
                )}
              </span>
            )}
            {result?.qualityScore != null && benchmarkReady(bench) && (
              <span
                className="text-[9px] font-mono shrink-0 hidden sm:inline"
                style={{ color: result.qualityScore >= bench.avg ? 'var(--ok)' : 'var(--text-dim)' }}
                title={`Industry average is ${bench.avg}/100 across ${bench.n.toLocaleString()} validated models (median ${bench.p50 ?? '—'}, top 10% ≥ ${bench.p90 ?? '—'}).`}
              >
                {result.qualityScore >= bench.avg ? '↑' : '↓'} avg {bench.avg}
              </span>
            )}
            {result && (
              <span className="text-[var(--text-faint)] text-[10px] hidden sm:inline shrink-0">
                · {result.durationMs}ms
              </span>
            )}
          </div>
        )}
        </div>

        {/* Batch auto-fix (GUIDs only — the name rules have their own "Fix all N") */}
        {autoFixableCount > 0 && (
          <button
            onClick={handleBatchFix}
            title={t('actions.fixAllCount', { count: autoFixableCount })}
            className="px-2 h-6 rounded text-[10px] border transition-colors font-medium shrink-0"
            style={{ background: 'var(--ok)14', color: 'var(--ok)', borderColor: 'var(--ok)33' }}
          >
            {t('actions.fixAllCount', { count: autoFixableCount })}
          </button>
        )}

        {/* Share Report — zero-server flywheel: encodes full report into URL hash */}
        {result && (
          <button
            onClick={handleShareReport}
            title={t('actions.shareReportTitle')}
            className="flex items-center gap-1 px-2 h-6 rounded text-[10px] font-medium border transition-colors shrink-0"
            style={{ background: 'var(--accent)14', color: 'var(--accent)', borderColor: 'var(--accent)33' }}
          >
            <svg width="10" height="10" viewBox="0 0 10 10" fill="none" stroke="currentColor" strokeWidth="1.4" strokeLinecap="round" strokeLinejoin="round" className="shrink-0">
              <circle cx="7.5" cy="2" r="1.5" />
              <circle cx="7.5" cy="8" r="1.5" />
              <circle cx="2"   cy="5" r="1.5" />
              <path d="M3.4 4.3l2.7-1.6M3.4 5.7l2.7 1.6" />
            </svg>
            {t('actions.shareReport')}
          </button>
        )}

        {/* Copy Badge — embeddable Health Score badge (markdown) for deliverables.
            Only shown when the Worker base is configured (badge needs the server). */}
        {result && import.meta.env.VITE_REPORT_URL && (
          <button
            onClick={handleCopyBadge}
            title="Copy an embeddable Health Score badge (markdown) for your deliverable README or handoff"
            className="flex items-center gap-1 px-2 h-6 rounded text-[10px] font-medium border transition-colors shrink-0"
            style={{ background: 'var(--surface-2)', color: 'var(--text-dim)', borderColor: 'var(--border)' }}
          >
            <svg width="10" height="10" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className="shrink-0">
              <path d="M12 2l2.5 7.5H22l-6 4.5 2.3 7.5L12 17l-6.3 4.5L8 14 2 9.5h7.5z" />
            </svg>
            Badge
          </button>
        )}

        {/* Copy for AI — formats the full report as plain text for Claude / ChatGPT */}
        {result && (
          <button
            onClick={handleCopyForAI}
            disabled={copying}
            title="Copy validation report as plain text for Claude or ChatGPT"
            aria-label={copying ? 'Copied to clipboard' : 'Copy for AI'}
            className="flex items-center gap-1 px-2 h-6 rounded text-[10px] font-medium border transition-all duration-200 shrink-0 select-none"
            style={
              copying
                ? { background: 'var(--ok)14', color: 'var(--ok)', borderColor: 'var(--ok)33' }
                : { background: 'var(--surface-2)', color: 'var(--text-dim)', borderColor: 'var(--border-strong)' }
            }
          >
            {copying ? (
              <>
                {/* Checkmark */}
                <svg width="9" height="9" viewBox="0 0 12 12" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className="shrink-0">
                  <path d="M2 6.5l3 3 5-6" />
                </svg>
                <span className="hidden sm:inline">Copied</span>
              </>
            ) : (
              <>
                {/* 4-point sparkle — signals AI context */}
                <svg width="9" height="9" viewBox="0 0 12 12" fill="currentColor" className="shrink-0 opacity-80">
                  <path d="M6 1l1.1 3.9L11 6l-3.9 1.1L6 11l-1.1-3.9L1 6l3.9-1.1Z" />
                </svg>
                <span className="hidden sm:inline">Copy for AI</span>
              </>
            )}
          </button>
        )}

        {/* Export — opens the configurable export modal (multi-model aware) */}
        {result && exportModels.length > 0 && (
          <button
            onClick={() => setExportModalOpen(true)}
            className="flex items-center gap-1 px-2 h-6 rounded text-[10px] bg-[var(--surface-2)] text-[var(--text-dim)] border border-[var(--border)] hover:text-[var(--text)] font-medium transition-colors shrink-0"
          >
            <svg width="10" height="10" viewBox="0 0 13 13" fill="none" stroke="currentColor" strokeWidth="1.4" strokeLinecap="round" className="opacity-70">
              <path d="M6.5 1v7M3.5 5.5l3 3.5 3-3.5M1 10v2h11v-2" />
            </svg>
            {t('actions.export')}
          </button>
        )}

        {/* Pending fixes count */}
        {pendingIndex.size > 0 && (
          <span className="px-2 h-6 flex items-center rounded text-[10px] text-[var(--ok)] border border-[var(--ok)]33 font-mono shrink-0">
            {t('pendingFixes', { count: pendingIndex.size })}
          </span>
        )}

        {/* Collapse */}
        <button
          onClick={toggleValidationPanel}
          aria-label={t('actions.collapsePanel')}
          title={t('actions.collapsePanel')}
          className="w-6 h-6 flex items-center justify-center rounded text-[var(--text-faint)] hover:text-[var(--text)] hover:bg-[var(--surface-2)] transition-colors shrink-0"
        >
          <svg width="12" height="12" viewBox="0 0 12 12" fill="currentColor">
            <path d="M1 3.5L6 8.5L11 3.5L10 2.5L6 6.5L2 2.5Z" />
          </svg>
        </button>
      </div>

      {/* ── Row 2: profile dropdown + run button ── */}
      {/* data-profile-row is used by ProfileDropdown's portal to anchor its bounding rect */}
      <div data-profile-row className="flex items-center gap-2 px-3 py-1.5 border-b border-[var(--border)] shrink-0 min-w-0">
        <ProfileDropdown
          activeProfileId={activeProfileId}
          customProfiles={customProfiles}
          onSelect={(id) => { setActiveProfile(id); trackValidationProfileChanged({ profile_id: id }) }}
          onNewProfile={() => { setEditingProfile(undefined); setProfileModalOpen(true) }}
          onEditProfile={(profile) => { setEditingProfile(profile); setProfileModalOpen(true) }}
          onDeleteProfile={removeCustomProfile}
        />
        <div className="flex-1" />
        <RunButton
          status={validationStatus}
          progress={progress}
          disabled={!hasModel}
          onClick={handleRunValidation}
          note={diffs.length > 0 ? t('batchFix.revalidateNote') : undefined}
        />
      </div>

      {/* ── Model filter chips ── */}
      {sceneModels.length > 1 && (
        <div className="flex items-center gap-1 px-3 py-1.5 border-b border-[var(--border)] overflow-x-auto shrink-0">
          <button
            onClick={() => setModelFilter(null)}
            className="shrink-0 px-2 h-5 rounded text-[10px] font-medium transition-colors border"
            style={
              modelFilter === null
                ? { background: 'var(--surface-2)', color: 'var(--text)', borderColor: 'var(--border)' }
                : { background: 'transparent', color: 'var(--text-faint)', borderColor: 'transparent' }
            }
          >
            {t('allModels')}
          </button>
          {sceneModels.map((m) => {
            const count = issues.filter((i) => i.modelId === m.id).length
            return (
              <button
                key={m.id}
                onClick={() => setModelFilter(m.id === modelFilter ? null : m.id)}
                className="shrink-0 flex items-center gap-1 px-2 h-5 rounded text-[10px] font-medium transition-colors border"
                style={
                  modelFilter === m.id
                    ? { background: 'var(--surface-2)', color: 'var(--text)', borderColor: 'var(--border)' }
                    : { background: 'transparent', color: 'var(--text-faint)', borderColor: 'transparent' }
                }
              >
                <span className="max-w-[100px] truncate">{m.fileName.replace(/\.ifc$/i, '')}</span>
                {count > 0 && <span className="font-mono text-[9px] opacity-70">{count}</span>}
              </button>
            )
          })}
        </div>
      )}

      {/* ── Compact coverage strip (replaces full ValidationCoverageSummary) ── */}
      {showCoverageSummary && result && (
        <CoverageStrip
          rules={rules}
          qualityScore={result.qualityScore ?? 0}
          onDismiss={dismissCoverageSummary}
        />
      )}

      {/* ── Next step after the score: price-free interest capture, shown to everyone ── */}
      {/* The rule it names skips what this panel already fixes free (GUIDs, names). */}
      {result && (
        <ScoreUpsell
          score={result.qualityScore ?? 0}
          modelId={result.issues.find((i) => i.modelId)?.modelId}
          topRule={pickUpsellRule(result.stats?.byRule ?? {})}
        />
      )}

      {/* ── Phantom rules notice (Bug 2 fix) ── */}
      {/* Shows when configurable rules are active but won't produce issues with current (empty) config. */}
      {/* Prevents false confidence: user sees "Naming Convention: 0 issues" and thinks model is fine. */}
      {result && showPhantomNotice && unconfiguredRules.length > 0 && (
        <div className="flex items-center gap-2 px-3 py-1 border-b border-[var(--border)] bg-[var(--surface-2)] shrink-0">
          <svg width="10" height="10" viewBox="0 0 10 10" fill="none" stroke="#F5A623" strokeWidth="1.3" strokeLinecap="round" className="shrink-0">
            <circle cx="5" cy="5" r="4.5" />
            <path d="M5 3v2.5M5 7h.01" />
          </svg>
          <span className="text-[9px] text-[var(--text-faint)] shrink-0">{t('phantom.notice')}:</span>
          <div className="flex items-center gap-1 flex-1 min-w-0 overflow-x-auto scrollbar-none">
            {unconfiguredRules.map((ruleId) => (
              <span
                key={ruleId}
                className="shrink-0 text-[9px] font-mono px-1.5 py-0.5 rounded border whitespace-nowrap"
                style={{ color: '#F5A623', borderColor: '#F5A62333', background: '#F5A62314' }}
                title={t('phantom.ruleTooltip')}
              >
                ⚙ {getRuleLabel(ruleId, i18n.language)}
              </span>
            ))}
          </div>
          <button
            onClick={() => setShowPhantomNotice(false)}
            className="shrink-0 w-5 h-5 flex items-center justify-center rounded text-[var(--text-faint)] hover:text-[var(--text)] hover:bg-[var(--surface)] transition-colors"
            title={t('coverage.hideTitle')}
          >
            <svg width="8" height="8" viewBox="0 0 8 8" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round">
              <path d="M1.5 1.5l5 5M6.5 1.5l-5 5" />
            </svg>
          </button>
        </div>
      )}

      {/* ── Clash cap notice (Bug 1 fix) ── */}
      {result?.metadata?.clashCapped && (
        <div className="flex items-center gap-2 px-3 py-1 border-b border-[var(--border)] bg-[var(--surface-2)] shrink-0">
          <svg width="10" height="10" viewBox="0 0 10 10" fill="none" stroke="#F5A623" strokeWidth="1.3" strokeLinecap="round" className="shrink-0">
            <circle cx="5" cy="5" r="4.5" />
            <path d="M5 3v2.5M5 7h.01" />
          </svg>
          <span className="text-[9px] text-[var(--text-faint)] leading-tight">
            {t('clashCap.notice', {
              checked: result.metadata.clashCapped.checkedCount.toLocaleString(),
              total:   result.metadata.clashCapped.totalCount.toLocaleString(),
            })}
          </span>
        </div>
      )}

      {/* ── Coverage integrity (honest score) — only when a run is incomplete ── */}
      {coverageIncomplete && coverage && (
        <CoverageIntegrityStrip coverage={coverage} language={i18n.language} />
      )}

      {/* ── Toolbar row A: tab toggle + severity filter ── */}
      <div className="flex items-center gap-1.5 px-3 h-8 border-b border-[var(--border)] shrink-0 overflow-x-auto">
        {/* Issues / BCF / History toggle */}
        <div className="flex items-center gap-0.5 shrink-0">
          {(['issues', 'bcf', 'history'] as const).map((panel) => (
            <button
              key={panel}
              onClick={() => setActivePanel(panel)}
              className="px-2 h-6 rounded text-[10px] font-medium transition-colors"
              style={
                activePanel === panel
                  ? { background: 'var(--surface-2)', color: 'var(--text)', border: '1px solid var(--border)' }
                  : { color: 'var(--text-faint)', border: '1px solid transparent' }
              }
            >
              {panel === 'issues' ? t('tabs.issues') : panel === 'bcf' ? t('tabs.bcf') : t('tabs.history')}
              {panel === 'bcf' && bcfTopicCount > 0 && (
                <span className="ml-1 text-[9px] font-mono">{bcfTopicCount}</span>
              )}
            </button>
          ))}
        </div>

        {activePanel === 'issues' && (
          <>
            <div className="w-px h-4 bg-[var(--border)] shrink-0" />

            {/* Severity tabs */}
            <div className="flex items-center gap-0.5 shrink-0">
              {(['all', 'errors', 'warnings', 'info'] as const).map((tab) => {
                const count =
                  tab === 'all'      ? issues.length :
                  tab === 'errors'   ? (stats?.errors   ?? issues.filter((i) => i.severity === 'error').length) :
                  tab === 'warnings' ? (stats?.warnings ?? issues.filter((i) => i.severity === 'warning').length) :
                  (stats?.info ?? issues.filter((i) => i.severity === 'info').length)

                const tabColor =
                  tab === 'errors'   ? 'var(--danger)' :
                  tab === 'warnings' ? '#F5A623' :
                  tab === 'info'     ? '#5E9ED6' : undefined

                return (
                  <button
                    key={tab}
                    onClick={() => setFilters({ activeTab: tab })}
                    className="px-1.5 h-5 rounded text-[10px] font-medium transition-colors"
                    style={
                      filters.activeTab === tab
                        ? { background: 'var(--surface-2)', color: tabColor ?? 'var(--text)', border: '1px solid var(--border)' }
                        : { color: 'var(--text-faint)', border: '1px solid transparent' }
                    }
                  >
                    {tab === 'all' ? t('filters.all') : tab === 'errors' ? 'E' : tab === 'warnings' ? 'W' : 'I'}
                    {count > 0 && (
                      <span
                        className="ml-0.5 text-[9px] font-mono"
                        style={{ color: tabColor ?? 'inherit' }}
                      >
                        {count}
                      </span>
                    )}
                  </button>
                )
              })}
            </div>
          </>
        )}

      </div>

      {/* ── Toolbar row B: group by + search (issues only) ── */}
      {activePanel === 'issues' && (
        <div className="flex items-center gap-1.5 px-3 h-7 border-b border-[var(--border)] shrink-0 overflow-x-auto">
          <span className="text-[9px] text-[var(--text-faint)] uppercase tracking-wider shrink-0 font-medium">
            {t('filters.groupBy')}
          </span>
          {/* Group by */}
          <div className="flex items-center gap-0.5 shrink-0">
            {(['rule', 'storey', 'class'] as const).map((g) => (
              <button
                key={g}
                onClick={() => setFilters({ groupBy: g })}
                className="px-1.5 h-5 rounded text-[10px] font-medium transition-colors"
                style={
                  filters.groupBy === g
                    ? { background: 'var(--surface-2)', color: 'var(--text)', border: '1px solid var(--border)' }
                    : { color: 'var(--text-faint)', border: '1px solid transparent' }
                }
              >
                {g === 'rule' ? t('filters.rule') : g === 'storey' ? t('filters.storey') : t('filters.class')}
              </button>
            ))}
          </div>

          {/* Expand / collapse all toggle */}
          {grouped.size > 0 && (
            <>
              <div className="w-px h-4 bg-[var(--border)] shrink-0" />
              <button
                onClick={toggleAllGroups}
                className="px-1.5 h-5 rounded text-[9px] font-medium transition-colors shrink-0"
                style={
                  openGroups.size === grouped.size
                    ? { background: 'var(--surface-2)', color: 'var(--text-dim)', border: '1px solid var(--border)' }
                    : { color: 'var(--text-faint)', border: '1px solid transparent' }
                }
              >
                {openGroups.size === grouped.size
                  ? t('filters.collapseAll')
                  : t('filters.expandAll')}
              </button>
            </>
          )}

          <div className="flex-1" />

          {/* Search */}
          <SearchInput value={search} onChange={setSearch} />
        </div>
      )}

      {/* ── Content ── */}
      <div ref={scrollRef} className="flex-1 overflow-y-auto max-md:pb-[calc(var(--mobile-nav-h)+var(--mobile-nav-margin)+env(safe-area-inset-bottom,0px)+8px)]">
        {activePanel === 'history' ? (
          <ValidationHistoryPanel onClose={() => setActivePanel('issues')} />
        ) : activePanel === 'bcf' ? (
          <BcfPanel viewer={viewer} />
        ) : (
          <>
            {/* Progress bar while running */}
            {isRunning && (
              <div className="px-3 py-2 border-b border-[var(--border)]">
                <div className="h-0.5 bg-[var(--surface-2)] rounded-full overflow-hidden">
                  <div
                    className="h-full rounded-full transition-all duration-300"
                    style={{ width: `${progress}%`, background: 'var(--accent)' }}
                  />
                </div>
              </div>
            )}

            {/* Since-last-run comparison (Phase 4) */}
            {!isRunning && runDiff && showRunDiff && (
              <RunDiffBar diff={runDiff} onDismiss={() => setShowRunDiff(false)} />
            )}

            {/* Waiver bar — muted issues are excluded from the score/counts above */}
            {!isRunning && mutedCount > 0 && (
              <div className="flex items-center gap-2 px-3 py-1.5 border-b border-[var(--border)] bg-[var(--surface-2)] shrink-0">
                <svg width="11" height="11" viewBox="0 0 12 12" fill="none" stroke="var(--text-faint)" strokeWidth="1.3" strokeLinecap="round" strokeLinejoin="round" className="shrink-0">
                  <path d="M2 4.5h2L6.5 2.5v7L4 7.5H2z" />
                  <path d="M8 4.5l2.5 3M10.5 4.5l-2.5 3" />
                </svg>
                <span className="text-[10px] text-[var(--text-faint)]">{t('waivers.mutedCount', { count: mutedCount })}</span>
                <button onClick={unmuteAll} className="ml-auto text-[10px] font-medium text-[var(--accent)] hover:underline">
                  {t('waivers.restoreAll')}
                </button>
              </div>
            )}

            {/* The fixed file from a batch rename: its own score, never the headline's */}
            {showFixCard && fixBatch && fixSummary && (
              <BatchFixResultCard
                batch={fixBatch}
                modelIds={fixModelIds}
                runs={fixRuns}
                summary={fixSummary}
                onDownload={handleDownloadFixed}
                onUndo={() => handleUndoBatch()}
                onDismiss={handleDismissFixRun}
                onRecheck={handleRecheckFixed}
                alsoFixEmptyCount={alsoFixEmptyCount}
                onAlsoFixEmpty={() => handleOpenBatchRename('RULE_EMPTY_NAME')}
                onResize={() => setListOffset(listRef.current?.offsetTop ?? 0)}
                autoFocus={focusFixCardFor === fixBatch.batchId}
              />
            )}

            {/* Actionable summary — what to fix first (Phase 2) */}
            {!isRunning && result && result.stats.total > 0 && (
              <ExecutiveSummary
                score={result.qualityScore ?? 0}
                contributions={contributions}
                language={i18n.language}
                onJumpToRule={handleJumpToRule}
                batchCounts={batchState.counts}
                batchDisabledReason={batchState.reasons}
                onBatchFix={handleOpenBatchRename}
              />
            )}

            {/* Elements a simulated flood reaches — outside the result and the score */}
            {!isRunning && (
              <FloodValidationSlot
                onJump={handleFloodJump}
                onResize={() => setListOffset(listRef.current?.offsetTop ?? 0)}
              />
            )}

            {/* Empty states */}
            {!isRunning && issues.length === 0 && (
              !hasModel
                ? <EmptyStateNoModel />
                : validationStatus === 'error'
                  ? <EmptyStateError error={validationError} />
                  : result === null
                    ? <EmptyStateNotValidated />
                    : <EmptyStateClean />
            )}

            {/* Virtualized issue groups (headers + rows + expanders) */}
            {flatRows.length > 0 && (
              <div ref={listRef} style={{ height: virtualizer.getTotalSize(), position: 'relative' }}>
                {virtualizer.getVirtualItems().map((vItem) => {
                  const row = flatRows[vItem.index]
                  return (
                    <div
                      key={vItem.key}
                      data-index={vItem.index}
                      ref={virtualizer.measureElement}
                      style={{
                        position:  'absolute',
                        top:       0,
                        left:      0,
                        width:     '100%',
                        transform: `translateY(${vItem.start - virtualizer.options.scrollMargin}px)`,
                      }}
                    >
                      {row.kind === 'header' ? (
                        <GroupHeaderRow
                          groupKey={row.groupKey}
                          groupIssues={row.groupIssues}
                          isOpen={openGroups.has(row.groupKey)}
                          onToggle={() => setOpenGroups((prev) => {
                            const next = new Set(prev)
                            next.has(row.groupKey) ? next.delete(row.groupKey) : next.add(row.groupKey)
                            return next
                          })}
                          groupBy={filters.groupBy}
                          language={i18n.language}
                        />
                      ) : row.kind === 'remediation' ? (
                        <RemediationBlock
                          ruleId={row.groupKey}
                          language={i18n.language}
                          selectedTool={remediationTool}
                          onSelectTool={setRemediationTool}
                        />
                      ) : row.kind === 'batchfix' ? (
                        <BatchFixBar
                          count={batchState.counts[row.groupKey] ?? 0}
                          done={fixBatch?.ruleId === row.groupKey}
                          disabledReason={batchState.reasons[row.groupKey]}
                          onFix={() => handleOpenBatchRename(row.groupKey)}
                        />
                      ) : row.kind === 'expander' ? (
                        <ExpanderRow
                          hiddenCount={row.hiddenCount}
                          onExpandAll={() => setExpandedGroups((prev) => new Set([...prev, row.groupKey]))}
                        />
                      ) : (
                        <IssueRow
                          issue={row.issue}
                          hasPendingFix={pendingIndex.has(row.issue.modelId, row.issue.expressId)}
                          onJumpTo={handleJumpTo}
                          onAutoFix={handleAutoFix}
                          onNameFix={handleNameFix}
                          onAddToBcf={handleAddIssueToBcf}
                          onMute={handleMute}
                        />
                      )}
                    </div>
                  )
                })}
              </div>
            )}
          </>
        )}
      </div>

      <CustomProfileModal
        open={profileModalOpen}
        onClose={() => { setProfileModalOpen(false); setEditingProfile(undefined) }}
        editProfile={editingProfile}
      />

      {exportModalOpen && exportModels.length > 0 && (
        <ValidationExportModal
          models={exportModels}
          rules={rules}
          activeProfileId={activeProfileId}
          customProfiles={customProfiles}
          resolveProfileName={(p) => localizedProfileName(p, t)}
          takeSnapshot={viewer?.takeSnapshot}
          onClose={() => setExportModalOpen(false)}
        />
      )}

      {batchRenameDialog}
    </div>
  )
}
