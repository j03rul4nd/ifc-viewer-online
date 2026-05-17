import React, { useState, useRef, useEffect, useMemo, useCallback, useLayoutEffect } from 'react'
import { useShallow } from 'zustand/react/shallow'
import { useValidationStore } from '../stores/validationStore'
import { useEditorStore } from '../stores/editorStore'
import { useUIStore } from '../stores/uiStore'
import { useModelStore } from '../stores/modelStore'
import { useSceneStore } from '../stores/sceneStore'
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
  // Naming & identity
  RULE_EMPTY_NAME:            '#E5484D',
  RULE_EMPTY_LONGNAME:        '#F5A623',
  RULE_DUPLICATE_NAME:        '#F5A623',
  RULE_NAMING_CONVENTION:     '#F5A623',
  RULE_DUPLICATE_GUID:        '#E5484D',
  RULE_INVALID_GUID_FORMAT:   '#E5484D',
  // Structure & hierarchy
  RULE_ORPHAN_ELEMENT:        '#E5484D',
  RULE_WRONG_CONTAINER:       '#E5484D',
  RULE_BROKEN_AGGREGATE:      '#E5484D',
  RULE_SPATIAL_HIERARCHY:     '#E5484D',
  RULE_CIRCULAR_REFERENCE:    '#E5484D',
  RULE_ELEMENT_IN_BUILDING:   '#F5A623',
  // Properties & types
  RULE_MISSING_TYPE:          '#5E9ED6',
  RULE_MISSING_PROPERTY_SET:  '#F5A623',
  RULE_EMPTY_PROPERTY_VALUE:  '#F5A623',
  RULE_MISSING_MATERIAL:      '#F5A623',
  RULE_INVALID_IFC_VERSION:   '#5E9ED6',
  RULE_ELEMENT_CLASH:         '#F5A623',
}

function RuleBadge({ ruleId }: { ruleId: string }) {
  const color = RULE_COLORS[ruleId] ?? '#54555E'
  const short = ruleId.replace('RULE_', '').replace(/_/g, ' ').toLowerCase()
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

// ── Which rules allow inline name editing ─────────────────────────────────────

const NAME_EDIT_RULES = new Set([
  'RULE_EMPTY_NAME',
  'RULE_EMPTY_LONGNAME',
  'RULE_DUPLICATE_NAME',
  'RULE_NAMING_CONVENTION',
])

function getEditField(ruleId: string): 'Name' | 'LongName' {
  return ruleId === 'RULE_EMPTY_LONGNAME' ? 'LongName' : 'Name'
}

// ── Issue row ─────────────────────────────────────────────────────────────────

function IssueRow({
  issue,
  hasPendingFix,
  onJumpTo,
  onAutoFix,
  onNameFix,
}: {
  issue: ValidationIssue
  hasPendingFix: boolean
  onJumpTo: (issue: ValidationIssue) => void
  onAutoFix: (issue: ValidationIssue) => void
  onNameFix: (issue: ValidationIssue, field: 'Name' | 'LongName', newValue: string) => void
}) {
  const [editing, setEditing] = useState(false)
  const [editValue, setEditValue] = useState('')
  const inputRef = useRef<HTMLInputElement>(null)

  const isNameEditable = NAME_EDIT_RULES.has(issue.ruleId)

  const startEdit = (): void => {
    const defaultVal = issue.elementName === '(empty)' ? '' : issue.elementName
    setEditValue(defaultVal)
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

  return (
    <>
      <div
        className="flex items-start gap-2.5 px-3 py-2 border-b border-[var(--border)] hover:bg-[var(--surface-2)] group transition-colors"
        style={hasPendingFix ? { borderLeft: '2px solid var(--ok)', paddingLeft: 10 } : undefined}
      >
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
            {hasPendingFix && (
              <span className="text-[9px] font-mono text-[var(--ok)] border border-[var(--ok)]44 px-1 rounded">
                edited
              </span>
            )}
          </div>
          <p className="text-[11px] text-[var(--text-dim)]">{issue.message}</p>
          <PathBreadcrumb path={issue.path} />
        </div>

        {/* Actions: visible on hover (desktop) or always visible on touch */}
        <div className="flex items-center gap-1 shrink-0 opacity-0 group-hover:opacity-100 [@media(pointer:coarse)]:opacity-100 transition-opacity">
          {isNameEditable && (
            <button
              onClick={() => editing ? setEditing(false) : startEdit()}
              className="px-2 h-7 xs:h-6 rounded text-[10px] font-medium border transition-colors"
              style={
                editing
                  ? { background: 'var(--surface-2)', color: 'var(--text-dim)', borderColor: 'var(--border)' }
                  : { background: 'var(--accent)18', color: 'var(--accent)', borderColor: 'var(--accent)33' }
              }
            >
              {editing ? 'Cancel' : hasPendingFix ? 'Re-edit' : 'Fix name'}
            </button>
          )}
          {issue.autoFixable && !isNameEditable && (
            <button
              onClick={() => onAutoFix(issue)}
              className="px-2 h-7 xs:h-6 rounded text-[10px] bg-[var(--ok)]18 text-[var(--ok)] border border-[var(--ok)]33 hover:brightness-125 active:brightness-90 font-medium"
            >
              Auto-fix
            </button>
          )}
          <button
            onClick={() => onJumpTo(issue)}
            className="px-2 h-7 xs:h-6 rounded text-[10px] bg-[var(--surface-2)] text-[var(--text-dim)] border border-[var(--border)] hover:text-[var(--text)] active:bg-[var(--border)] font-medium"
          >
            Jump
          </button>
        </div>
      </div>

      {/* Inline edit panel */}
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
            placeholder={`Enter ${getEditField(issue.ruleId).toLowerCase()}…`}
            className="flex-1 h-7 px-2 text-[12px] bg-[var(--surface)] border border-[var(--accent)] rounded text-[var(--text)] placeholder:text-[var(--text-faint)] outline-none"
          />
          <button
            onClick={commitEdit}
            disabled={!editValue.trim()}
            className="px-2.5 h-7 rounded text-[11px] bg-[var(--accent)] text-white font-medium hover:brightness-110 disabled:opacity-40"
          >
            Apply
          </button>
          <button
            onClick={() => setEditing(false)}
            className="px-2 h-7 rounded text-[11px] text-[var(--text-dim)] hover:text-[var(--text)]"
          >
            ✕
          </button>
        </div>
      )}
    </>
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
  // useShallow prevents re-renders when unrelated validationStore fields change
  // (e.g. spatialTrees updates while a model loads should not repaint this panel)
  const { result, partialIssues, isRunning, progress, filters, setFilters } =
    useValidationStore(
      useShallow((s) => ({
        result:        s.result,
        partialIssues: s.partialIssues,
        isRunning:     s.isRunning,
        progress:      s.progress,
        filters:       s.filters,
        setFilters:    s.setFilters,
      })),
    )
  const { validationPanelOpen, toggleValidationPanel } = useUIStore(
    useShallow((s) => ({ validationPanelOpen: s.validationPanelOpen, toggleValidationPanel: s.toggleValidationPanel })),
  )
  const ifcBuffer    = useModelStore((s) => s.ifcBuffer)
  // Use sceneModelId (activeValidationModelId) — NOT modelStore.activeModelId (cacheKey).
  // The two are different namespaces; mixing them creates duplicate spatialTree entries.
  const activeValidationModelId = useValidationStore((s) => s.activeValidationModelId)
  const { addCommand } = useEditorHistory()
  const { setSelection, diffs } = useEditorStore(
    useShallow((s) => ({ setSelection: s.setSelection, diffs: s.diffs })),
  )

  const [search, setSearch]         = useState('')
  const [modelFilter, setModelFilter] = useState<string | null>(null)

  const sceneModels = useSceneStore((s) => s.models)

  const issues = result?.issues ?? partialIssues
  const stats  = result?.stats

  // Set of expressIds that already have a pending rename diff
  const pendingFixIds = useMemo(
    () => new Set(diffs.filter((d) => d.type === 'RENAME').map((d) => d.expressId)),
    [diffs],
  )

  // ── Filter / group ─────────────────────────────────────────────────────
  const filtered = useMemo(() => {
    let list = issues

    // Per-model filter (only when multiple models are loaded)
    if (modelFilter) list = list.filter((i) => i.modelId === modelFilter)

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
  }, [issues, filters.activeTab, search, modelFilter])

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
    if ((issue.ruleId === 'RULE_DUPLICATE_GUID' || issue.ruleId === 'RULE_INVALID_GUID_FORMAT') && issue.globalId) {
      addCommand(buildFixGuidCommand(issue.expressId, issue.globalId, issue.modelId))
    }
  }, [addCommand])

  const handleBatchFix = useCallback(() => {
    const fixable = filtered.filter((i) => i.autoFixable)
    for (const issue of fixable) {
      if ((issue.ruleId === 'RULE_DUPLICATE_GUID' || issue.ruleId === 'RULE_INVALID_GUID_FORMAT') && issue.globalId) {
        addCommand(buildFixGuidCommand(issue.expressId, issue.globalId, issue.modelId))
      }
    }
  }, [filtered, addCommand])

  const handleNameFix = useCallback((
    issue: ValidationIssue,
    field: 'Name' | 'LongName',
    newValue: string,
  ) => {
    const oldValue = issue.elementName === '(empty)' ? '' : issue.elementName
    addCommand(buildRenameCommand(issue.expressId, field, oldValue, newValue, issue.modelId))
  }, [addCommand])

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
    void runValidation(activeValidationModelId ?? undefined)
  }, [activeValidationModelId])

  const fixableCount = filtered.filter((i) => i.autoFixable || NAME_EDIT_RULES.has(i.ruleId)).length

  // ── Collapsed state ────────────────────────────────────────────────────
  if (!validationPanelOpen) {
    return (
      <button
        onClick={toggleValidationPanel}
        className="flex items-center gap-2 px-3 h-10 xs:h-9 border-t border-[var(--border)] bg-[var(--surface)] w-full text-left hover:bg-[var(--surface-2)] active:bg-[var(--surface-2)] transition-colors shrink-0"
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
    <div
      className="flex flex-col border-t border-[var(--border)] bg-[var(--surface)] shrink-0"
      style={{
        // Responsive height: 40vh on mobile (≤ 640px), 300px on desktop
        height: 'clamp(200px, 40vh, 300px)',
      }}
    >
      {/* Panel header */}
      <div className="flex items-center gap-2 px-3 h-10 border-b border-[var(--border)] shrink-0">
        <span className="text-[11px] font-semibold text-[var(--text-dim)] uppercase tracking-wider">
          Validation
        </span>

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

        {/* Batch auto-fix */}
        {(() => {
          const autoFixableCount = filtered.filter((i) => i.autoFixable).length
          return autoFixableCount > 0 ? (
            <button
              onClick={handleBatchFix}
              title={`Auto-fix all ${autoFixableCount} fixable issue${autoFixableCount !== 1 ? 's' : ''}`}
              className="px-2 h-6 rounded text-[11px] bg-[var(--ok)]18 text-[var(--ok)] border border-[var(--ok)]33 hover:brightness-125 font-medium"
            >
              Fix {autoFixableCount}
            </button>
          ) : null
        })()}

        {/* Run validation */}
        <button
          onClick={handleRunValidation}
          disabled={(sceneModels.length === 0 && !ifcBuffer) || isRunning}
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

        {/* Pending fixes count */}
        {pendingFixIds.size > 0 && (
          <span className="px-2 h-6 flex items-center rounded text-[11px] text-[var(--ok)] border border-[var(--ok)]33 font-mono">
            {pendingFixIds.size} fixed
          </span>
        )}

        {/* Collapse */}
        <button onClick={toggleValidationPanel} className="text-[var(--text-faint)] hover:text-[var(--text)] ml-1">
          <svg width="12" height="12" viewBox="0 0 12 12" fill="currentColor">
            <path d="M1 3.5L6 8.5L11 3.5L10 2.5L6 6.5L2 2.5Z" />
          </svg>
        </button>
      </div>

      {/* Model filter chips — shown only when 2+ models are loaded */}
      {sceneModels.length > 1 && (
        <div className="flex items-center gap-1 px-3 py-1.5 border-b border-[var(--border)] bg-[rgba(255,255,255,0.01)] overflow-x-auto shrink-0">
          <button
            onClick={() => setModelFilter(null)}
            className={`shrink-0 px-2 h-5 rounded text-[10px] font-medium transition-colors ${
              modelFilter === null
                ? 'bg-[var(--surface-2)] text-[var(--text)] border border-[var(--border)]'
                : 'text-[var(--text-faint)] hover:text-[var(--text-dim)]'
            }`}
          >
            All models
          </button>
          {sceneModels.map((m) => {
            const count = issues.filter((i) => i.modelId === m.id).length
            return (
              <button
                key={m.id}
                onClick={() => setModelFilter(m.id === modelFilter ? null : m.id)}
                className={`shrink-0 flex items-center gap-1 px-2 h-5 rounded text-[10px] font-medium transition-colors ${
                  modelFilter === m.id
                    ? 'bg-[var(--surface-2)] text-[var(--text)] border border-[var(--border)]'
                    : 'text-[var(--text-faint)] hover:text-[var(--text-dim)]'
                }`}
              >
                <span className="max-w-[100px] truncate">{m.fileName.replace(/\.ifc$/i, '')}</span>
                {count > 0 && <span className="font-mono text-[9px] opacity-70">{count}</span>}
              </button>
            )
          })}
        </div>
      )}

      {/* Toolbar: tabs + group by + search */}
      <div className="flex items-center gap-2 px-3 h-9 border-b border-[var(--border)] shrink-0">
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
            {(ifcBuffer || sceneModels.length > 0) ? (
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
                hasPendingFix={pendingFixIds.has(issue.expressId)}
                onJumpTo={handleJumpTo}
                onAutoFix={handleAutoFix}
                onNameFix={handleNameFix}
              />
            ))}
          </div>
        ))}
      </div>
    </div>
  )
}
