import React, {
  useRef, useState, useCallback, useMemo, useEffect, useLayoutEffect,
} from 'react'
import { useVirtualizer } from '@tanstack/react-virtual'
import { useValidationStore } from '../stores/validationStore'
import { useEditorStore } from '../stores/editorStore'
import { useUIStore } from '../stores/uiStore'
import { useEditorHistory } from '../hooks/useEditorHistory'
import { buildRenameCommand, buildFixGuidCommand } from '../lib/diffStore'
import { generateIfcGuid } from '../lib/diffStore'
import type { SpatialNode, SpatialElement, ValidationIssue } from '../types'

// ── Flat list items ────────────────────────────────────────────────────────────

type FlatNode =
  | {
      kind: 'spatial'
      depth: number
      node: SpatialNode
      isExpanded: boolean
      hasChildren: boolean
    }
  | {
      kind: 'element'
      depth: number
      element: SpatialElement
      parentExpressId: number
    }

function flattenTree(
  nodes: SpatialNode[],
  expanded: Set<number>,
  depth = 0,
  result: FlatNode[] = [],
): FlatNode[] {
  for (const node of nodes) {
    const hasChildren =
      node.children.length > 0 || node.containedElements.length > 0
    result.push({
      kind: 'spatial',
      depth,
      node,
      isExpanded: expanded.has(node.expressId),
      hasChildren,
    })
    if (expanded.has(node.expressId)) {
      flattenTree(node.children, expanded, depth + 1, result)
      for (const elem of node.containedElements) {
        result.push({ kind: 'element', depth: depth + 1, element: elem, parentExpressId: node.expressId })
      }
    }
  }
  return result
}

// ── Issue rollup ──────────────────────────────────────────────────────────────

function buildIssueRollup(
  issues: ValidationIssue[],
): Map<number, { errors: number; warnings: number; info: number }> {
  const map = new Map<number, { errors: number; warnings: number; info: number }>()
  for (const issue of issues) {
    const cur = map.get(issue.expressId) ?? { errors: 0, warnings: 0, info: 0 }
    if (issue.severity === 'error')        cur.errors++
    else if (issue.severity === 'warning') cur.warnings++
    else                                   cur.info++
    map.set(issue.expressId, cur)
  }
  return map
}

function rollupSubtree(
  node: SpatialNode,
  directMap: Map<number, { errors: number; warnings: number; info: number }>,
  rollupMap: Map<number, { errors: number; warnings: number; info: number }>,
): void {
  let errors = 0, warnings = 0, info = 0

  const direct = directMap.get(node.expressId)
  if (direct) { errors += direct.errors; warnings += direct.warnings; info += direct.info }

  for (const elem of node.containedElements) {
    const d = directMap.get(elem.expressId)
    if (d) { errors += d.errors; warnings += d.warnings; info += d.info }
  }

  for (const child of node.children) {
    rollupSubtree(child, directMap, rollupMap)
    const c = rollupMap.get(child.expressId)
    if (c) { errors += c.errors; warnings += c.warnings; info += c.info }
  }

  rollupMap.set(node.expressId, { errors, warnings, info })
}

// ── IFC class icons (text-based abbreviations) ────────────────────────────────

const CLASS_ABBR: Record<string, string> = {
  IfcProject:        'PRJ',
  IfcSite:           'STE',
  IfcBuilding:       'BLD',
  IfcBuildingStorey: 'STR',
  IfcSpace:          'SPC',
  IfcZone:           'ZNE',
  IfcWall:           'WL',
  IfcSlab:           'SB',
  IfcBeam:           'BM',
  IfcColumn:         'COL',
  IfcDoor:           'DR',
  IfcWindow:         'WN',
  IfcRoof:           'RF',
  IfcStair:          'ST',
  IfcMember:         'MB',
  IfcPlate:          'PL',
  IfcRailing:        'RL',
  IfcFurnishingElement: 'FF',
  IfcFlowSegment:    'MEP',
  IfcPipeSegment:    'PP',
  IfcDuctSegment:    'DC',
  IfcCovering:       'CV',
  IfcFooting:        'FT',
  IfcPile:           'PI',
}

const CLASS_COLOR: Record<string, string> = {
  IfcProject:        '#5E6AD2',
  IfcSite:           '#30A46C',
  IfcBuilding:       '#8B93E8',
  IfcBuildingStorey: '#F5A623',
  IfcSpace:          '#6FB8D9',
  IfcZone:           '#D4A373',
}

function ClassBadge({ cls }: { cls: string }) {
  const abbr  = CLASS_ABBR[cls] ?? cls.replace('Ifc', '').slice(0, 3).toUpperCase()
  const color = CLASS_COLOR[cls] ?? '#54555E'
  return (
    <span
      className="inline-flex items-center justify-center rounded px-1 text-[9px] font-mono font-bold leading-none shrink-0"
      style={{ background: `${color}22`, color, border: `1px solid ${color}44`, minWidth: 22, height: 16 }}
    >
      {abbr}
    </span>
  )
}

// ── Issue badge ───────────────────────────────────────────────────────────────

function IssueBadge({
  errors, warnings, onClick,
}: { errors: number; warnings: number; onClick?: (e: React.MouseEvent) => void }) {
  if (errors === 0 && warnings === 0) return null
  return (
    <button
      onClick={onClick}
      className="inline-flex items-center gap-0.5 px-1 rounded text-[10px] font-mono font-semibold leading-none shrink-0 hover:brightness-125 transition-all"
      style={{
        background: errors > 0 ? '#E5484D22' : '#F5A62322',
        color:      errors > 0 ? '#E5484D'   : '#F5A623',
        border: `1px solid ${errors > 0 ? '#E5484D44' : '#F5A62344'}`,
        height: 16,
      }}
      title={`${errors} error(s), ${warnings} warning(s)`}
    >
      {errors > 0 && <span className="text-[var(--danger)]">{errors}</span>}
      {errors > 0 && warnings > 0 && <span className="opacity-40">·</span>}
      {warnings > 0 && <span style={{ color: '#F5A623' }}>{warnings}</span>}
    </button>
  )
}

// ── Inline edit input ─────────────────────────────────────────────────────────

function InlineEdit({
  value, onCommit, onCancel,
}: { value: string; onCommit: (v: string) => void; onCancel: () => void }) {
  const [text, setText] = useState(value)
  const inputRef = useRef<HTMLInputElement>(null)

  useLayoutEffect(() => {
    inputRef.current?.focus()
    inputRef.current?.select()
  }, [])

  return (
    <input
      ref={inputRef}
      value={text}
      onChange={(e) => setText(e.target.value)}
      onKeyDown={(e) => {
        if (e.key === 'Enter')  { e.stopPropagation(); onCommit(text) }
        if (e.key === 'Escape') { e.stopPropagation(); onCancel() }
      }}
      onBlur={() => onCommit(text)}
      className="flex-1 min-w-0 bg-[var(--surface-2)] border border-[var(--accent)] rounded px-1 text-[12px] text-[var(--text)] outline-none"
      onClick={(e) => e.stopPropagation()}
    />
  )
}

// ── GUID warning dialog ───────────────────────────────────────────────────────

function GuidEditWarning({
  expressId, currentGuid,
  onGenerate, onCancel,
}: {
  expressId: number
  currentGuid: string
  onGenerate: (newGuid: string) => void
  onCancel: () => void
}) {
  return (
    <div className="absolute inset-0 z-50 flex items-center justify-center bg-black/60">
      <div className="bg-[var(--surface)] border border-[var(--border-strong)] rounded-xl p-5 max-w-sm w-full mx-4 shadow-2xl">
        <div className="text-[13px] font-semibold text-[var(--text)] mb-2">Change GlobalId?</div>
        <p className="text-[12px] text-[var(--text-dim)] mb-1">
          Changing a GlobalId breaks external references (BCF issues, links, COBie).
        </p>
        <p className="text-[10px] font-mono text-[var(--text-faint)] mb-4 truncate">
          Current: {currentGuid}
        </p>
        <div className="flex gap-2 justify-end">
          <button
            onClick={onCancel}
            className="px-3 h-8 rounded-lg text-[12px] bg-[var(--surface-2)] text-[var(--text-dim)] border border-[var(--border)] hover:text-[var(--text)]"
          >
            Cancel
          </button>
          <button
            onClick={() => onGenerate(generateIfcGuid())}
            className="px-3 h-8 rounded-lg text-[12px] bg-[var(--accent)] text-white hover:brightness-110"
          >
            Generate new GUID
          </button>
        </div>
      </div>
    </div>
  )
}

// ── Row heights ───────────────────────────────────────────────────────────────

const ROW_HEIGHT = 30

// ── Main component ────────────────────────────────────────────────────────────

interface ModelTreeProps {
  onSelectElement?: (expressId: number) => void
  onFilterBySubtree?: (expressIds: number[]) => void
  onFocusElements?: (ids: number[]) => void
}

export default function ModelTree({ onSelectElement, onFilterBySubtree, onFocusElements }: ModelTreeProps) {
  const { spatialTree, result, partialIssues } = useValidationStore()
  const { selection, setSelection }            = useEditorStore()
  const { addCommand }                         = useEditorHistory()

  const [expanded, setExpanded] = useState<Set<number>>(new Set())
  const [editingId, setEditingId]           = useState<number | null>(null)
  const [editingField, setEditingField]     = useState<'Name' | 'LongName' | 'Description' | 'GlobalId'>('Name')
  const [guidWarning, setGuidWarning]       = useState<{ expressId: number; currentGuid: string } | null>(null)

  const parentRef = useRef<HTMLDivElement>(null)

  // Auto-expand first two levels on tree load
  useEffect(() => {
    if (spatialTree.length === 0) return
    const toExpand = new Set<number>()
    for (const root of spatialTree) {
      toExpand.add(root.expressId)
      for (const child of root.children) toExpand.add(child.expressId)
    }
    setExpanded(toExpand)
  }, [spatialTree])

  // Build issue rollup
  const issueRollup = useMemo(() => {
    const issues = result?.issues ?? partialIssues
    const direct = buildIssueRollup(issues)
    const rollup = new Map<number, { errors: number; warnings: number; info: number }>()
    for (const root of spatialTree) rollupSubtree(root, direct, rollup)
    return { direct, rollup }
  }, [result, partialIssues, spatialTree])

  // Flatten visible tree
  const flatNodes = useMemo(
    () => flattenTree(spatialTree, expanded),
    [spatialTree, expanded],
  )

  const virtualizer = useVirtualizer({
    count:            flatNodes.length,
    getScrollElement: () => parentRef.current,
    estimateSize:     () => ROW_HEIGHT,
    overscan:         8,
  })

  const toggleExpand = useCallback((expressId: number) => {
    setExpanded((prev) => {
      const next = new Set(prev)
      if (next.has(expressId)) next.delete(expressId)
      else                     next.add(expressId)
      return next
    })
  }, [])

  const startEdit = useCallback((expressId: number, field: typeof editingField) => {
    if (field === 'GlobalId') {
      // We need the current GUID — find it in tree
      const findGuid = (nodes: SpatialNode[]): string | null => {
        for (const n of nodes) {
          if (n.expressId === expressId) return n.globalId
          const found = findGuid(n.children)
          if (found !== null) return found
        }
        return null
      }
      const guid = findGuid(spatialTree) ?? ''
      setGuidWarning({ expressId, currentGuid: guid })
      return
    }
    setEditingId(expressId)
    setEditingField(field)
  }, [spatialTree])

  const commitEdit = useCallback((
    expressId: number,
    field: 'Name' | 'LongName' | 'Description',
    oldValue: string,
    newValue: string,
  ) => {
    setEditingId(null)
    const trimmed = newValue.trim()
    if (trimmed === oldValue) return
    addCommand(buildRenameCommand(expressId, field, oldValue, trimmed))
  }, [addCommand])

  const handleSelectNode = useCallback((expressId: number) => {
    setSelection([expressId])
    onSelectElement?.(expressId)
  }, [setSelection, onSelectElement])

  const getNodeCurrentName = useCallback((
    expressId: number,
    defaultName: string,
  ): string => {
    // Check diffs for any pending renames
    const { diffs } = useEditorStore.getState()
    const rename = [...diffs].reverse().find(
      (d) => d.type === 'RENAME' && d.expressId === expressId && d.field === 'Name',
    )
    return (rename?.type === 'RENAME' ? rename.newValue : undefined) ?? defaultName
  }, [])

  if (spatialTree.length === 0) {
    return (
      <div className="flex flex-col items-center justify-center h-full gap-3 px-4 text-center">
        <div className="w-10 h-10 rounded-full bg-[var(--surface-2)] flex items-center justify-center text-lg">🌲</div>
        <p className="text-[12px] text-[var(--text-dim)]">
          Load an IFC file and run validation to see the spatial tree.
        </p>
      </div>
    )
  }

  return (
    <div className="relative flex flex-col h-full">
      {/* Header */}
      <div className="flex-none px-3 py-2.5 border-b border-[var(--border)] flex items-center justify-between bg-[var(--surface)]">
        <span className="text-[11px] font-semibold text-[var(--text-dim)] uppercase tracking-wider">
          Spatial Tree
        </span>
        <span className="text-[10px] text-[var(--text-faint)] font-mono bg-[var(--surface-2)] px-1.5 py-0.5 rounded-md">
          {flatNodes.length}
        </span>
      </div>

      {/* Virtual list */}
      <div ref={parentRef} className="flex-1 overflow-y-auto overflow-x-hidden">
        <div style={{ height: virtualizer.getTotalSize(), position: 'relative' }}>
          {virtualizer.getVirtualItems().map((vRow) => {
            const flat = flatNodes[vRow.index]
            if (!flat) return null

            return (
              <div
                key={vRow.key}
                style={{
                  position:  'absolute',
                  top:       0,
                  left:      0,
                  width:     '100%',
                  height:    ROW_HEIGHT,
                  transform: `translateY(${vRow.start}px)`,
                }}
              >
                {flat.kind === 'spatial' ? (
                  <SpatialRow
                    flat={flat}
                    issueRollup={issueRollup.rollup}
                    isSelected={selection.includes(flat.node.expressId)}
                    editingId={editingId}
                    editingField={editingField}
                    onToggle={toggleExpand}
                    onSelect={handleSelectNode}
                    onFocusElements={onFocusElements}
                    onStartEdit={startEdit}
                    onCommitEdit={commitEdit}
                    onCancelEdit={() => setEditingId(null)}
                    onBadgeClick={(eid) => {
                      const allIds = collectSubtreeIds(flat.node)
                      onFilterBySubtree?.(allIds)
                    }}
                    getNodeCurrentName={getNodeCurrentName}
                  />
                ) : (
                  <ElementRow
                    flat={flat}
                    directIssues={issueRollup.direct}
                    isSelected={selection.includes(flat.element.expressId)}
                    onSelect={handleSelectNode}
                    onFocusElements={onFocusElements}
                    onCommitRename={(expressId, oldName, newName) =>
                      addCommand(buildRenameCommand(expressId, 'Name', oldName, newName))
                    }
                  />
                )}
              </div>
            )
          })}
        </div>
      </div>

      {/* GUID warning dialog */}
      {guidWarning && (
        <GuidEditWarning
          expressId={guidWarning.expressId}
          currentGuid={guidWarning.currentGuid}
          onGenerate={(newGuid) => {
            addCommand(buildFixGuidCommand(guidWarning.expressId, guidWarning.currentGuid))
            setGuidWarning(null)
          }}
          onCancel={() => setGuidWarning(null)}
        />
      )}
    </div>
  )
}

// ── Collect all physical element IDs within a spatial subtree ─────────────────

function collectElementIds(node: SpatialNode): number[] {
  const ids: number[] = node.containedElements.map((e) => e.expressId)
  for (const child of node.children) ids.push(...collectElementIds(child))
  return ids
}

// ── Eye icon (visibility toggle) ──────────────────────────────────────────────

function EyeBtn({
  hidden, partial = false, onClick,
}: { hidden: boolean; partial?: boolean; onClick: (e: React.MouseEvent) => void }) {
  return (
    <button
      onClick={(e) => { e.stopPropagation(); onClick(e) }}
      className="w-5 h-5 flex items-center justify-center rounded shrink-0 transition-colors hover:bg-[var(--border)]"
      style={{ opacity: hidden || partial ? 1 : undefined }}
      title={hidden ? 'Show' : partial ? 'Show all' : 'Hide'}
    >
      {hidden ? (
        /* eye-off */
        <svg width="13" height="13" viewBox="0 0 14 14" fill="none" stroke="currentColor" strokeWidth="1.3" strokeLinecap="round">
          <path d="M1 1l12 12M5.5 5.6A2 2 0 009.4 9.5" />
          <path d="M3 3.5C1.5 4.7 1 7 1 7s2 4 6 4a6.5 6.5 0 003.5-1M11.5 10C12.8 8.8 13 7 13 7s-2-4-6-4c-.7 0-1.4.1-2 .3" />
        </svg>
      ) : (
        /* eye-on */
        <svg width="13" height="13" viewBox="0 0 14 14" fill="none" stroke="currentColor" strokeWidth="1.3" strokeLinecap="round">
          <path d="M1 7s2-4 6-4 6 4 6 4-2 4-6 4-6-4-6-4z" />
          <circle cx="7" cy="7" r="1.7" fill="currentColor" stroke="none" style={{ opacity: partial ? 0.4 : 1 }} />
        </svg>
      )}
    </button>
  )
}

// ── Spatial structure row ─────────────────────────────────────────────────────

function SpatialRow({
  flat, issueRollup, isSelected, editingId, editingField,
  onToggle, onSelect, onFocusElements, onStartEdit, onCommitEdit, onCancelEdit, onBadgeClick, getNodeCurrentName,
}: {
  flat: FlatNode & { kind: 'spatial' }
  issueRollup: Map<number, { errors: number; warnings: number; info: number }>
  isSelected: boolean
  editingId: number | null
  editingField: 'Name' | 'LongName' | 'Description' | 'GlobalId'
  onToggle: (id: number) => void
  onSelect: (id: number) => void
  onFocusElements?: (ids: number[]) => void
  onStartEdit: (id: number, field: 'Name' | 'LongName' | 'Description' | 'GlobalId') => void
  onCommitEdit: (id: number, field: 'Name' | 'LongName' | 'Description', old: string, newVal: string) => void
  onCancelEdit: () => void
  onBadgeClick: (id: number) => void
  getNodeCurrentName: (id: number, def: string) => string
}) {
  const { node, depth, isExpanded, hasChildren } = flat
  const rollup    = issueRollup.get(node.expressId)
  const isEditing = editingId === node.expressId && editingField === 'Name'
  const displayName = getNodeCurrentName(node.expressId, node.name)
  const childCount  = node.containedElements.length + node.children.length

  const { hiddenElements, setElementsVisible } = useUIStore()
  const elemIds   = useMemo(() => collectElementIds(node), [node])
  const anyHidden = elemIds.length > 0 && elemIds.some((id) => hiddenElements.has(id))
  const allHidden = elemIds.length > 0 && elemIds.every((id) => hiddenElements.has(id))

  const handleVisibilityToggle = (e: React.MouseEvent): void => {
    e.stopPropagation()
    setElementsVisible(elemIds, allHidden) // if all hidden → show; else hide all
  }

  return (
    <div
      className={`flex items-center gap-1.5 px-2 h-[30px] cursor-pointer select-none group transition-colors
        ${isSelected
          ? 'text-[var(--text)]'
          : 'hover:bg-[var(--surface-2)] text-[var(--text-dim)]'}`}
      style={{
        paddingLeft: 8 + depth * 16,
        opacity: allHidden ? 0.45 : 1,
        backgroundColor: isSelected ? 'rgba(94,106,210,0.12)' : undefined,
      }}
      onClick={() => onSelect(node.expressId)}
      onDoubleClick={(e) => {
        e.stopPropagation()
        const ids = collectElementIds(node)
        if (ids.length > 0) onFocusElements?.(ids)
      }}
    >
      {/* Expand toggle */}
      <button
        className={`w-4 h-4 flex items-center justify-center text-[var(--text-faint)] shrink-0
          ${hasChildren ? 'hover:text-[var(--text)]' : 'opacity-0 pointer-events-none'}`}
        onClick={(e) => { e.stopPropagation(); onToggle(node.expressId) }}
      >
        <svg width="8" height="8" viewBox="0 0 8 8" fill="currentColor">
          {isExpanded
            ? <path d="M0 2.5L4 6.5L8 2.5L7 1.5L4 4.5L1 1.5Z" />
            : <path d="M2.5 0L6.5 4L2.5 8L1.5 7L4.5 4L1.5 1Z" />}
        </svg>
      </button>

      {/* Class badge */}
      <ClassBadge cls={node.ifcClass} />

      {/* Name */}
      {isEditing ? (
        <InlineEdit
          value={displayName}
          onCommit={(v) => onCommitEdit(node.expressId, 'Name', node.name, v)}
          onCancel={onCancelEdit}
        />
      ) : (
        <>
          <span
            className="flex-1 min-w-0 truncate text-[12px] leading-none"
            title={displayName}
          >
            {displayName}
          </span>
          <button
            className="shrink-0 opacity-0 group-hover:opacity-60 hover:!opacity-100 transition-opacity p-0.5 rounded hover:bg-[var(--border)]"
            title="Rename"
            onClick={(e) => { e.stopPropagation(); onStartEdit(node.expressId, 'Name') }}
          >
            <svg width="11" height="11" viewBox="0 0 12 12" fill="none" stroke="currentColor" strokeWidth="1.4" strokeLinecap="round" strokeLinejoin="round">
              <path d="M8 2l2 2-6 6H2V8l6-6z" />
            </svg>
          </button>
        </>
      )}

      {/* Container count */}
      {childCount > 0 && !isEditing && (
        <span className="text-[10px] text-[var(--text-faint)] font-mono shrink-0 opacity-0 group-hover:opacity-100">
          {childCount}
        </span>
      )}

      {/* GlobalId (truncated) */}
      {node.globalId && !isEditing && (
        <span
          className="text-[9px] font-mono text-[var(--text-faint)] shrink-0 truncate opacity-0 group-hover:opacity-100 max-w-[60px]"
          title={node.globalId}
          onDoubleClick={(e) => { e.stopPropagation(); onStartEdit(node.expressId, 'GlobalId') }}
        >
          {node.globalId.slice(0, 8)}
        </span>
      )}

      {/* Issue badge */}
      {rollup && (rollup.errors > 0 || rollup.warnings > 0) && !isEditing && (
        <IssueBadge
          errors={rollup.errors}
          warnings={rollup.warnings}
          onClick={(e) => { e.stopPropagation(); onBadgeClick(node.expressId) }}
        />
      )}

      {/* Visibility toggle — always shown if hidden, on hover otherwise */}
      {elemIds.length > 0 && !isEditing && (
        <span className={anyHidden ? 'shrink-0' : 'shrink-0 opacity-0 group-hover:opacity-100'}>
          <EyeBtn hidden={allHidden} partial={anyHidden && !allHidden} onClick={handleVisibilityToggle} />
        </span>
      )}
    </div>
  )
}

// ── Element row ───────────────────────────────────────────────────────────────

function ElementRow({
  flat, directIssues, isSelected, onSelect, onFocusElements, onCommitRename,
}: {
  flat: FlatNode & { kind: 'element' }
  directIssues: Map<number, { errors: number; warnings: number; info: number }>
  isSelected: boolean
  onSelect: (id: number) => void
  onFocusElements?: (ids: number[]) => void
  onCommitRename: (expressId: number, oldName: string, newName: string) => void
}) {
  const { element, depth } = flat
  const issues = directIssues.get(element.expressId)

  const [editing, setEditing] = useState(false)
  const [editVal, setEditVal] = useState('')
  const inputRef = useRef<HTMLInputElement>(null)

  const { hiddenElements, setElementsVisible } = useUIStore()
  const isHidden = hiddenElements.has(element.expressId)

  useLayoutEffect(() => { if (editing) inputRef.current?.focus() }, [editing])

  const startEdit = (e: React.MouseEvent): void => {
    e.stopPropagation()
    setEditVal(element.name)
    setEditing(true)
  }

  const commitEdit = (): void => {
    const trimmed = editVal.trim()
    if (trimmed && trimmed !== element.name) onCommitRename(element.expressId, element.name, trimmed)
    setEditing(false)
  }

  return (
    <div
      className={`flex items-center gap-1.5 px-2 h-[30px] cursor-pointer select-none group transition-colors
        ${isSelected
          ? 'text-[var(--text)]'
          : 'hover:bg-[var(--surface-2)] text-[var(--text-dim)]'}`}
      style={{ paddingLeft: 8 + depth * 16, opacity: isHidden ? 0.4 : 1, backgroundColor: isSelected ? 'rgba(94,106,210,0.12)' : undefined }}
      onClick={() => !editing && onSelect(element.expressId)}
      onDoubleClick={(e) => { e.stopPropagation(); if (!editing) onFocusElements?.([element.expressId]) }}
    >
      {/* Leaf indent */}
      <span className="w-4 shrink-0" />

      {/* Class badge */}
      <ClassBadge cls={element.ifcClass} />

      {/* Name */}
      {editing ? (
        <input
          ref={inputRef}
          value={editVal}
          onChange={(e) => setEditVal(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === 'Enter')  { e.stopPropagation(); commitEdit() }
            if (e.key === 'Escape') { e.stopPropagation(); setEditing(false) }
          }}
          onBlur={commitEdit}
          onClick={(e) => e.stopPropagation()}
          className="flex-1 min-w-0 bg-[var(--surface-2)] border border-[var(--accent)] rounded px-1 text-[12px] text-[var(--text)] outline-none h-5"
        />
      ) : (
        <>
          <span
            className="flex-1 min-w-0 truncate text-[12px] leading-none"
            title={element.name}
          >
            {element.name}
          </span>
          <button
            className="shrink-0 opacity-0 group-hover:opacity-60 hover:!opacity-100 transition-opacity p-0.5 rounded hover:bg-[var(--border)]"
            title="Rename"
            onClick={startEdit}
          >
            <svg width="11" height="11" viewBox="0 0 12 12" fill="none" stroke="currentColor" strokeWidth="1.4" strokeLinecap="round" strokeLinejoin="round">
              <path d="M8 2l2 2-6 6H2V8l6-6z" />
            </svg>
          </button>
        </>
      )}

      {/* GlobalId */}
      {element.globalId && !editing && (
        <span className="text-[9px] font-mono text-[var(--text-faint)] shrink-0 truncate opacity-0 group-hover:opacity-100 max-w-[60px]"
          title={element.globalId}
        >
          {element.globalId.slice(0, 8)}
        </span>
      )}

      {/* Issue badge */}
      {issues && (issues.errors > 0 || issues.warnings > 0) && !editing && (
        <IssueBadge errors={issues.errors} warnings={issues.warnings} />
      )}

      {/* Visibility toggle */}
      {!editing && (
        <span className={isHidden ? 'shrink-0' : 'shrink-0 opacity-0 group-hover:opacity-100'}>
          <EyeBtn
            hidden={isHidden}
            onClick={(e) => { e.stopPropagation(); setElementsVisible([element.expressId], isHidden) }}
          />
        </span>
      )}
    </div>
  )
}

// ── Helpers ───────────────────────────────────────────────────────────────────

function collectSubtreeIds(node: SpatialNode): number[] {
  const ids: number[] = [node.expressId]
  for (const elem of node.containedElements) ids.push(elem.expressId)
  for (const child of node.children) ids.push(...collectSubtreeIds(child))
  return ids
}
