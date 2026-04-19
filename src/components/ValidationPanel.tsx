import React, { useState, useMemo, useCallback, useRef } from 'react'
import { useValidationStore } from '../stores/validationStore'
import { useEditorStore } from '../stores/editorStore'
import { useUIStore } from '../stores/uiStore'
import { useModelStore } from '../stores/modelStore'
import { buildFixGuidCommand, buildRenameCommand, downloadBlob } from '../lib/diffStore'
import { useEditorHistory } from '../hooks/useEditorHistory'
import { runValidation } from '../lib/validator'
import type { ValidationIssue } from '../types'

// ── Severity icon ─────────────────────────────────────────────────────────────

function SeverityIcon({ severity }: { severity: ValidationIssue['severity'] }) {
  if (severity === 'error')
    return <span className="text-[var(--danger)] text-[14px] leading-none">✕</span>
  if (severity === 'warning')
    return <span style={{ color: '#F5A623' }} className="text-[14px] leading-none">!</span>
  return <span style={{ color: '#5E9ED6' }} className="text-[14px] leading-none">i</span>
}

// ── Rule ID badge ─────────────────────────────────────────────────────────────

const RULE_COLORS: Record<string, string> = {
  RULE_EMPTY_NAME:          '#E5484D',
  RULE_EMPTY_LONGNAME:      '#F5A623',
  RULE_DUPLICATE_NAME:      '#F5A623',
  RULE_NAMING_CONVENTION:   '#F5A623',
  RULE_MISSING_TYPE:        '#5E9ED6',
  RULE_DUPLICATE_GUID:      '#E5484D',
  RULE_MISSING_PROPERTY_SET:'#F5A623',
  RULE_ORPHAN_ELEMENT:      '#E5484D',
  RULE_WRONG_CONTAINER:     '#E5484D',
  RULE_BROKEN_AGGREGATE:    '#E5484D',
}

function RuleBadge({ ruleId }: { ruleId: string }) {
  const color  = RULE_COLORS[ruleId] ?? '#54555E'
  const short  = ruleId.replace('RULE_', '').replace(/_/g, ' ').toLowerCase()
  return (
    <span
      className="px-1.5 py-0.5 rounded text-[9px] font-mono font-bold uppercase leading-none shrink-0"
      style={{ background: `${color}18`, color, border: `1px solid ${color}33` }}
      title={ruleId}
    >
      {short}
    </span>
  )
}

// ── Path breadcrumb ───────────────────────────────────────────────────────────

function PathBreadcrumb({ path }: { path: string[] }) {
  if (path.length === 0) return null
  return (
    <span className="text-[10px] text-[var(--text-faint)] truncate max-w-[200px]" title={path.join(' › ')}>
      {path.join(' › ')}
    </span>
  )
}

// ── Issue row ─────────────────────────────────────────────────────────────────

function IssueRow({
  issue,
  onJumpTo,
  onAutoFix,
}: {
  issue: ValidationIssue
  onJumpTo: (issue: ValidationIssue) => void
  onAutoFix: (issue: ValidationIssue) => void
}) {
  return (
    <div className="flex items-start gap-2.5 px-3 py-2 border-b border-[var(--border)] hover:bg-[var(--surface-2)] group transition-colors">
      {/* Severity */}
      <div className="w-4 flex justify-center shrink-0 pt-0.5">
        <SeverityIcon severity={issue.severity} />
      </div>

      {/* Main content */}
      <div className="flex-1 min-w-0 flex flex-col gap-0.5">
        <div className="flex items-center gap-2 flex-wrap">
          <RuleBadge ruleId={issue.ruleId} />
          <span className="text-[12px] text-[var(--text)] font-medium truncate max-w-[200px]">
            {issue.elementName}
          </span>
          <span className="text-[10px] text-[var(--text-faint)] font-mono shrink-0">
            {issue.ifcClass}
          </span>
        </div>
        <p className="text-[11px] text-[var(--text-dim)]">{issue.message}</p>
        <PathBreadcrumb path={issue.path} />
      </div>

      {/* Actions */}
      <div className="flex items-center gap-1 shrink-0 opacity-0 group-hover:opacity-100 transition-opacity">
        {issue.autoFixable && (
          <button
            onClick={() => onAutoFix(issue)}
            className="px-2 h-6 rounded text-[10px] bg-[var(--ok)]18 text-[var(--ok)] border border-[var(--ok)]33 hover:brightness-125 font-medium"
          >
            Fix
          </button>
        )}
        <button
          onClick={() => onJumpTo(issue)}
          className="px-2 h-6 rounded text-[10px] bg-[var(--surface-2)] text-[var(--text-dim)] border border-[var(--border)] hover:text-[var(--text)] font-medium"
        >
          Jump
        </button>
      </div>
    </div>
  )
}

// ── Group header ──────────────────────────────────────────────────────────────

function GroupHeader({ label, count, color }: { label: string; count: number; color?: string }) {
  return (
    <div className="px-3 py-1.5 bg-[var(--surface)] border-b border-[var(--border)] flex items-center justify-between sticky top-0 z-10">
      <span className="text-[10px] font-semibold uppercase tracking-wider text-[var(--text-dim)]"
        style={color ? { color } : {}}
      >
        {label}
      </span>
      <span className="text-[10px] font-mono text-[var(--text-faint)]">{count}</span>
    </div>
  )
}

// ── Main component ────────────────────────────────────────────────────────────

interface ValidationPanelProps {
  onJumpToElement?: (expressId: number) => void
}

export default function ValidationPanel({ onJumpToElement }: ValidationPanelProps) {
  const { result, partialIssues, isRunning, progress, filters, setFilters, rules } =
    useValidationStore()
  const { validationPanelOpen, toggleValidationPanel, validationPanelFloating, setValidationPanelFloating } =
    useUIStore()
  const { ifcBuffer } = useModelStore()
  const { addCommand } = useEditorHistory()
  const { setSelection } = useEditorStore()

  const [search, setSearch] = useState('')

  const issues = result?.issues ?? partialIssues
  const stats  = result?.stats

  // ── Filter / group ─────────────────────────────────────────────────────
  const filtered = useMemo(() => {
    let list = issues

    if (filters.activeTab === 'errors')   list = list.filter((i) => i.severity === 'error')
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
  }, [issues, filters.activeTab, search])

  const grouped = useMemo(() => {
    if (filters.groupBy === 'rule') {
      const map = new Map<string, ValidationIssue[]>()
      for (const issue of filtered) {
        const g = map.get(issue.ruleId) ?? []
        g.push(issue)
        map.set(issue.ruleId, g)
      }
      return map
    }
    if (filters.groupBy === 'storey') {
      const map = new Map<string, ValidationIssue[]>()
      for (const issue of filtered) {
        const storey = issue.path[issue.path.length - 2] ?? issue.path[0] ?? 'Unknown'
        const g = map.get(storey) ?? []
        g.push(issue)
        map.set(storey, g)
      }
      return map
    }
    // group by class
    const map = new Map<string, ValidationIssue[]>()
    for (const issue of filtered) {
      const g = map.get(issue.ifcClass) ?? []
      g.push(issue)
      map.set(issue.ifcClass, g)
    }
    return map
  }, [filtered, filters.groupBy])

  // ── Handlers ───────────────────────────────────────────────────────────

  const handleJumpTo = useCallback((issue: ValidationIssue) => {
    setSelection([issue.expressId])
    onJumpToElement?.(issue.expressId)
  }, [setSelection, onJumpToElement])

  const handleAutoFix = useCallback((issue: ValidationIssue) => {
    if (issue.ruleId === 'RULE_DUPLICATE_GUID') {
      addCommand(buildFixGuidCommand(issue.expressId, issue.globalId))
    } else if (issue.ruleId === 'RULE_EMPTY_NAME') {
      addCommand(buildRenameCommand(issue.expressId, 'Name', '', `Element_${issue.expressId}`))
    }
  }, [addCommand])

  const handleAutoFixAll = useCallback(() => {
    const fixable = filtered.filter((i) => i.autoFixable)
    for (const issue of fixable) handleAutoFix(issue)
  }, [filtered, handleAutoFix])

  const handleExportJson = useCallback(() => {
    if (!result) return
    const blob = new Blob([JSON.stringify(result, null, 2)], { type: 'application/json' })
    downloadBlob(blob, 'validation-report.json')
  }, [result])

  const handleExportCsv = useCallback(() => {
    if (!result) return
    const header = 'id,ruleId,severity,expressId,globalId,ifcClass,elementName,message,path,autoFixable'
    const rows = result.issues.map((i) =>
      [i.id, i.ruleId, i.severity, i.expressId, i.globalId, i.ifcClass,
       `"${i.elementName.replace(/"/g, '""')}"`,
       `"${i.message.replace(/"/g, '""')}"`,
       `"${i.path.join(' > ').replace(/"/g, '""')}"`,
       i.autoFixable,
      ].join(','),
    )
    const blob = new Blob([[header, ...rows].join('\n')], { type: 'text/csv' })
    downloadBlob(blob, 'validation-report.csv')
  }, [result])

  const handleRunValidation = useCallback(() => {
    void runValidation()
  }, [])

  // ── Collapsed state ────────────────────────────────────────────────────
  const fixableCount = filtered.filter((i) => i.autoFixable).length

  if (!validationPanelOpen) {
    return (
      <button
        onClick={toggleValidationPanel}
        className="flex items-center gap-2 px-3 h-9 border-t border-[var(--border)] bg-[var(--surface)] w-full text-left hover:bg-[var(--surface-2)] transition-colors shrink-0"
      >
        <span className="text-[11px] font-semibold text-[var(--text-dim)] uppercase tracking-wider">
          Validation
        </span>
        {stats && (
          <div className="flex items-center gap-2">
            {stats.errors > 0 && (
              <span className="text-[11px] text-[var(--danger)] font-mono">{stats.errors} errors</span>
            )}
            {stats.warnings > 0 && (
              <span className="text-[11px] font-mono" style={{ color: '#F5A623' }}>{stats.warnings} warnings</span>
            )}
            {stats.errors === 0 && stats.warnings === 0 && (
              <span className="text-[11px] text-[var(--ok)] font-mono">No issues</span>
            )}
          </div>
        )}
        {isRunning && (
          <span className="text-[11px] text-[var(--accent)] font-mono animate-pulse">
            Running… {progress}%
          </span>
        )}
        <span className="ml-auto text-[var(--text-faint)]">
          <svg width="12" height="12" viewBox="0 0 12 12" fill="currentColor">
            <path d="M1 8.5L6 3.5L11 8.5L10 9.5L6 5.5L2 9.5Z" />
          </svg>
        </span>
      </button>
    )
  }

  return (
    <div className="flex flex-col border-t border-[var(--border)] bg-[var(--surface)] shrink-0"
      style={{ height: 300 }}
    >
      {/* Panel header */}
      <div className="flex items-center gap-2 px-3 h-10 border-b border-[var(--border)] shrink-0">
        <span className="text-[11px] font-semibold text-[var(--text-dim)] uppercase tracking-wider">
          Validation
        </span>

        {/* Stats summary */}
        {stats && (
          <div className="flex items-center gap-2 text-[11px] font-mono">
            {stats.errors > 0 && (
              <span className="text-[var(--danger)]">{stats.errors} err</span>
            )}
            {stats.warnings > 0 && (
              <span style={{ color: '#F5A623' }}>{stats.warnings} warn</span>
            )}
            {stats.info > 0 && (
              <span style={{ color: '#5E9ED6' }}>{stats.info} info</span>
            )}
            {stats.total === 0 && (
              <span className="text-[var(--ok)]">✓ No issues</span>
            )}
            {result && (
              <span className="text-[var(--text-faint)]">· {result.durationMs}ms</span>
            )}
          </div>
        )}

        <div className="flex-1" />

        {/* Run validation */}
        <button
          onClick={handleRunValidation}
          disabled={!ifcBuffer || isRunning}
          className="px-2 h-6 rounded text-[11px] bg-[var(--accent)]18 text-[var(--accent)] border border-[var(--accent)]33 hover:brightness-125 disabled:opacity-40 font-medium"
        >
          {isRunning ? `${progress}%` : 'Run'}
        </button>

        {/* Export */}
        {result && (
          <div className="relative group/export">
            <button className="px-2 h-6 rounded text-[11px] bg-[var(--surface-2)] text-[var(--text-dim)] border border-[var(--border)] hover:text-[var(--text)] font-medium">
              Export ▾
            </button>
            <div className="absolute right-0 top-full mt-1 bg-[var(--surface)] border border-[var(--border)] rounded-lg shadow-xl z-50 py-1 hidden group-hover/export:block min-w-[120px]">
              <button onClick={handleExportJson} className="w-full text-left px-3 py-1.5 text-[11px] text-[var(--text-dim)] hover:bg-[var(--surface-2)] hover:text-[var(--text)]">
                JSON report
              </button>
              <button onClick={handleExportCsv} className="w-full text-left px-3 py-1.5 text-[11px] text-[var(--text-dim)] hover:bg-[var(--surface-2)] hover:text-[var(--text)]">
                CSV report
              </button>
            </div>
          </div>
        )}

        {/* Auto-fix all */}
        {fixableCount > 0 && (
          <button
            onClick={handleAutoFixAll}
            className="px-2 h-6 rounded text-[11px] bg-[var(--ok)]18 text-[var(--ok)] border border-[var(--ok)]33 hover:brightness-125 font-medium"
          >
            Fix {fixableCount}
          </button>
        )}

        {/* Collapse */}
        <button onClick={toggleValidationPanel} className="text-[var(--text-faint)] hover:text-[var(--text)] ml-1">
          <svg width="12" height="12" viewBox="0 0 12 12" fill="currentColor">
            <path d="M1 3.5L6 8.5L11 3.5L10 2.5L6 6.5L2 2.5Z" />
          </svg>
        </button>
      </div>

      {/* Toolbar: tabs + group by + search */}
      <div className="flex items-center gap-2 px-3 h-9 border-b border-[var(--border)] shrink-0">
        {/* Tabs */}
        <div className="flex items-center gap-0.5">
          {(['all', 'errors', 'warnings', 'info'] as const).map((tab) => {
            const count =
              tab === 'all'      ? issues.length :
              tab === 'errors'   ? (stats?.errors ?? issues.filter((i) => i.severity === 'error').length) :
              tab === 'warnings' ? (stats?.warnings ?? issues.filter((i) => i.severity === 'warning').length) :
              (stats?.info ?? issues.filter((i) => i.severity === 'info').length)

            return (
              <button
                key={tab}
                onClick={() => setFilters({ activeTab: tab })}
                className={`px-2 h-6 rounded text-[11px] font-medium transition-colors
                  ${filters.activeTab === tab
                    ? 'bg-[var(--surface-2)] text-[var(--text)] border border-[var(--border)]'
                    : 'text-[var(--text-faint)] hover:text-[var(--text-dim)]'}`}
              >
                {tab.charAt(0).toUpperCase() + tab.slice(1)}
                {count > 0 && <span className="ml-1 text-[9px] font-mono">{count}</span>}
              </button>
            )
          })}
        </div>

        <div className="w-px h-4 bg-[var(--border)]" />

        {/* Group by */}
        <div className="flex items-center gap-0.5">
          <span className="text-[10px] text-[var(--text-faint)] mr-1">Group:</span>
          {(['rule', 'storey', 'class'] as const).map((g) => (
            <button
              key={g}
              onClick={() => setFilters({ groupBy: g })}
              className={`px-2 h-5 rounded text-[10px] font-medium transition-colors
                ${filters.groupBy === g
                  ? 'bg-[var(--surface-2)] text-[var(--text)] border border-[var(--border)]'
                  : 'text-[var(--text-faint)] hover:text-[var(--text-dim)]'}`}
            >
              {g}
            </button>
          ))}
        </div>

        <div className="flex-1" />

        {/* Search */}
        <input
          type="text"
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          placeholder="Search issues…"
          className="h-6 px-2 text-[11px] bg-[var(--surface-2)] border border-[var(--border)] rounded text-[var(--text)] placeholder:text-[var(--text-faint)] outline-none focus:border-[var(--accent)] w-40"
        />
      </div>

      {/* Issue list */}
      <div className="flex-1 overflow-y-auto">
        {isRunning && (
          <div className="px-3 py-2 border-b border-[var(--border)] bg-[var(--accent)]08">
            <div className="h-1 bg-[var(--surface-2)] rounded-full overflow-hidden">
              <div
                className="h-full bg-[var(--accent)] rounded-full transition-all duration-300"
                style={{ width: `${progress}%` }}
              />
            </div>
          </div>
        )}

        {!isRunning && issues.length === 0 && (
          <div className="flex flex-col items-center justify-center h-full gap-2 text-center px-4">
            {ifcBuffer ? (
              <>
                <span className="text-2xl">✓</span>
                <p className="text-[12px] text-[var(--text-dim)]">
                  {result ? 'No validation issues found.' : 'Click Run to validate the model.'}
                </p>
              </>
            ) : (
              <p className="text-[12px] text-[var(--text-dim)]">Load an IFC file to validate.</p>
            )}
          </div>
        )}

        {[...grouped.entries()].map(([groupKey, groupIssues]) => (
          <div key={groupKey}>
            <GroupHeader
              label={groupKey}
              count={groupIssues.length}
              color={
                groupIssues[0]?.severity === 'error' ? 'var(--danger)' :
                groupIssues[0]?.severity === 'warning' ? '#F5A623' : undefined
              }
            />
            {groupIssues.map((issue) => (
              <IssueRow
                key={issue.id}
                issue={issue}
                onJumpTo={handleJumpTo}
                onAutoFix={handleAutoFix}
              />
            ))}
          </div>
        ))}
      </div>
    </div>
  )
}
