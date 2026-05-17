import React, {
  useRef, useState, useCallback, useMemo, useEffect, useLayoutEffect,
  forwardRef, useImperativeHandle,
} from 'react'
import * as ContextMenu from '@radix-ui/react-context-menu'
import { useVirtualizer } from '@tanstack/react-virtual'
import { useValidationStore, selectAllSpatialTrees } from '../stores/validationStore'
import { useEditorStore } from '../stores/editorStore'
import { useUIStore } from '../stores/uiStore'
import { modelRegistry } from '../lib/model-registry'
import { useEditorHistory } from '../hooks/useEditorHistory'
import { buildRenameCommand, buildFixGuidCommand } from '../lib/diffStore'
import { generateIfcGuid } from '../lib/diffStore'
import type { SpatialNode, SpatialElement, ValidationIssue } from '../types'

// ── Imperative handle ─────────────────────────────────────────────────────────

export interface ModelTreeHandle {
  revealElement: (expressId: number) => void
}

// ── Flat list items ────────────────────────────────────────────────────────────

type FlatNode =
  | {
      kind: 'model-header'
      modelId: string
      fileName: string
      nodeCount: number
      isCollapsed: boolean
    }
  | {
      kind: 'spatial'
      depth: number
      node: SpatialNode
      isExpanded: boolean
      hasChildren: boolean
      modelId: string
    }
  | {
      kind: 'element'
      depth: number
      element: SpatialElement
      parentExpressId: number
      modelId: string
    }

function flattenTree(
  nodes: SpatialNode[],
  modelId: string,
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
      modelId,
    })
    if (expanded.has(node.expressId)) {
      flattenTree(node.children, modelId, expanded, depth + 1, result)
      for (const elem of node.containedElements) {
        result.push({ kind: 'element', depth: depth + 1, element: elem, parentExpressId: node.expressId, modelId })
      }
    }
  }
  return result
}

/** Strips the viewer-appended `-${Date.now()}` suffix to recover the file name. */
function fileNameFromModelId(modelId: string): string {
  return modelId.replace(/-\d{13,}$/, '') || modelId
}

function flattenAllTrees(
  trees: Array<{ modelId: string; tree: SpatialNode[] }>,
  expanded: Set<number>,
  collapsedModels: Set<string>,
  showHeaders: boolean,
): FlatNode[] {
  const result: FlatNode[] = []
  for (const { modelId, tree } of trees) {
    if (tree.length === 0) continue
    const regEntry = modelRegistry.get(modelId)
    const fileName = regEntry?.fileName ?? fileNameFromModelId(modelId)
    const isCollapsed = collapsedModels.has(modelId)
    if (showHeaders) {
      result.push({ kind: 'model-header', modelId, fileName, nodeCount: tree.length, isCollapsed })
    }
    if (!isCollapsed) {
      flattenTree(tree, modelId, expanded, 0, result)
    }
  }
  return result
}

// ── Issue rollup ──────────────────────────────────────────────────────────────

function buildIssueRollup(
  issues: ValidationIssue[],
  modelId?: string,
): Map<number, { errors: number; warnings: number; info: number }> {
  const map = new Map<number, { errors: number; warnings: number; info: number }>()
  for (const issue of issues) {
    // Filter by modelId when provided; include un-stamped issues for backward compat
    if (modelId && issue.modelId && issue.modelId !== modelId) continue
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

// ── IFC class icons ───────────────────────────────────────────────────────────

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

// ── Tree node context menu ────────────────────────────────────────────────────

const menuItemCls = [
  'flex items-center gap-2 px-3 py-1.5 rounded-[5px] text-[12px] cursor-pointer select-none outline-none',
  'text-[var(--text-dim)] hover:bg-[var(--surface-2)] hover:text-[var(--text)]',
  'data-[disabled]:opacity-35 data-[disabled]:pointer-events-none',
].join(' ')

const menuSepCls = 'my-1 h-px bg-[var(--border)]'

function TreeContextMenu({
  expressId,
  globalId,
  displayName,
  onSelect,
  onFocus,
  onRename,
  onFixGuid,
  children,
}: {
  expressId:   number
  globalId:    string | null
  displayName: string
  onSelect:    () => void
  onFocus:     () => void
  onRename:    () => void
  onFixGuid?:  () => void
  children:    React.ReactNode
}) {
  const handleCopyGuid = (): void => {
    if (!globalId) return
    void navigator.clipboard.writeText(globalId)
  }

  const handleCopyId = (): void => {
    void navigator.clipboard.writeText(String(expressId))
  }

  return (
    <ContextMenu.Root>
      <ContextMenu.Trigger asChild>{children}</ContextMenu.Trigger>
      <ContextMenu.Portal>
        <ContextMenu.Content
          className="z-[200] min-w-[180px] bg-[var(--surface)] border border-[var(--border-strong)] rounded-[10px] shadow-2xl p-1.5 overflow-hidden"
          onCloseAutoFocus={(e) => e.preventDefault()}
        >
          {/* Node label */}
          <div className="px-3 py-1 text-[10px] text-[var(--text-faint)] font-mono truncate max-w-[220px]" title={displayName}>
            #{expressId} · {displayName}
          </div>
          <div className={menuSepCls} />

          <ContextMenu.Item className={menuItemCls} onSelect={onSelect}>
            <svg width="13" height="13" viewBox="0 0 14 14" fill="none" stroke="currentColor" strokeWidth="1.4" strokeLinecap="round">
              <circle cx="7" cy="7" r="5" /><circle cx="7" cy="7" r="2" fill="currentColor" stroke="none" />
            </svg>
            Select in 3D
          </ContextMenu.Item>

          <ContextMenu.Item className={menuItemCls} onSelect={onFocus}>
            <svg width="13" height="13" viewBox="0 0 14 14" fill="none" stroke="currentColor" strokeWidth="1.4" strokeLinecap="round">
              <path d="M1 5V1h4M9 1h4v4M13 9v4H9M5 13H1V9" />
            </svg>
            Frame camera
          </ContextMenu.Item>

          <div className={menuSepCls} />

          <ContextMenu.Item className={menuItemCls} onSelect={onRename}>
            <svg width="13" height="13" viewBox="0 0 12 12" fill="none" stroke="currentColor" strokeWidth="1.4" strokeLinecap="round" strokeLinejoin="round">
              <path d="M8 2l2 2-6 6H2V8l6-6z" />
            </svg>
            Rename
          </ContextMenu.Item>

          {onFixGuid && (
            <ContextMenu.Item className={menuItemCls} onSelect={onFixGuid}>
              <svg width="13" height="13" viewBox="0 0 14 14" fill="none" stroke="currentColor" strokeWidth="1.4" strokeLinecap="round">
                <path d="M2 7a5 5 0 1010 0 5 5 0 00-10 0zM7 4v4M5 6h4" />
              </svg>
              Fix GUID
            </ContextMenu.Item>
          )}

          <div className={menuSepCls} />

          <ContextMenu.Item
            className={menuItemCls}
            onSelect={handleCopyGuid}
            disabled={!globalId}
          >
            <svg width="13" height="13" viewBox="0 0 14 14" fill="none" stroke="currentColor" strokeWidth="1.4" strokeLinecap="round">
              <rect x="4" y="4" width="8" height="8" rx="1.5" /><path d="M10 4V2.5A1.5 1.5 0 008.5 1h-6A1.5 1.5 0 001 2.5v6A1.5 1.5 0 002.5 10H4" />
            </svg>
            Copy GlobalId
          </ContextMenu.Item>

          <ContextMenu.Item className={menuItemCls} onSelect={handleCopyId}>
            <svg width="13" height="13" viewBox="0 0 14 14" fill="currentColor" opacity="0.7">
              <text x="1" y="11" fontSize="9" fontFamily="monospace">#id</text>
            </svg>
            Copy express ID
          </ContextMenu.Item>
        </ContextMenu.Content>
      </ContextMenu.Portal>
    </ContextMenu.Root>
  )
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
  value, onCommit, onCancel, placeholder,
}: { value: string; onCommit: (v: string) => void; onCancel: () => void; placeholder?: string }) {
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
      placeholder={placeholder}
      onChange={(e) => setText(e.target.value)}
      onKeyDown={(e) => {
        if (e.key === 'Enter')  { e.stopPropagation(); onCommit(text) }
        if (e.key === 'Escape') { e.stopPropagation(); onCancel() }
      }}
      onBlur={() => onCommit(text)}
      className="flex-1 min-w-0 bg-[var(--surface-2)] border border-[var(--accent)] rounded px-1 text-[12px] text-[var(--text)] outline-none placeholder:text-[var(--text-faint)]"
      onClick={(e) => e.stopPropagation()}
    />
  )
}

// ── GUID warning dialog ───────────────────────────────────────────────────────

function GuidEditWarning({
  expressId, currentGuid, onGenerate, onCancel,
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

// ── Row height ────────────────────────────────────────────────────────────────

const ROW_HEIGHT = 30

// ── Main component ────────────────────────────────────────────────────────────

interface ModelTreeProps {
  onSelectElement?: (expressId: number, modelId?: string) => void
  onFilterBySubtree?: (expressIds: number[]) => void
  onFocusElements?: (ids: number[]) => void
}

const ModelTree = forwardRef<ModelTreeHandle, ModelTreeProps>(
  function ModelTree({ onSelectElement, onFilterBySubtree, onFocusElements }, ref) {
    // Read the raw Record (stable reference when unchanged) — derive array in useMemo
    // to avoid re-creating objects every render, which would trigger an infinite loop.
    const spatialTreesRecord = useValidationStore((s) => s.spatialTrees)
    const { result, partialIssues } = useValidationStore()

    const allTrees = useMemo(
      () => Object.entries(spatialTreesRecord).map(([modelId, tree]) => ({ modelId, tree })),
      [spatialTreesRecord],
    )
    const { selection, setSelection }            = useEditorStore()
    const { addCommand }                         = useEditorHistory()

    const [expanded,        setExpanded]        = useState<Set<number>>(new Set())
    const [collapsedModels, setCollapsedModels] = useState<Set<string>>(new Set())
    const [editingId, setEditingId]       = useState<number | null>(null)
    const [editingField, setEditingField] = useState<'Name' | 'LongName' | 'Description' | 'GlobalId'>('Name')
    const [guidWarning, setGuidWarning]   = useState<{ expressId: number; currentGuid: string; modelId?: string } | null>(null)

    const parentRef = useRef<HTMLDivElement>(null)

    // Backwards-compat: all spatial nodes across all trees (for GUID lookup etc.)
    const spatialTree = useMemo(
      () => allTrees.flatMap((m) => m.tree),
      [allTrees],
    )

    const showModelHeaders = allTrees.length > 1

    // Auto-expand first two levels when a new tree arrives
    useEffect(() => {
      if (allTrees.length === 0) return
      setExpanded((prev) => {
        const next = new Set(prev)
        for (const { tree } of allTrees) {
          for (const root of tree) {
            next.add(root.expressId)
            for (const child of root.children) next.add(child.expressId)
          }
        }
        return next
      })
    }, [allTrees])

    // Build per-model issue rollup (keyed by modelId)
    const issueRollupByModel = useMemo(() => {
      const allIssues = result?.issues ?? partialIssues
      const byModel = new Map<string, { direct: Map<number, { errors: number; warnings: number; info: number }>; rollup: Map<number, { errors: number; warnings: number; info: number }> }>()
      for (const { modelId, tree } of allTrees) {
        const direct = buildIssueRollup(allIssues, modelId)
        const rollup = new Map<number, { errors: number; warnings: number; info: number }>()
        for (const root of tree) rollupSubtree(root, direct, rollup)
        byModel.set(modelId, { direct, rollup })
      }
      return byModel
    }, [result, partialIssues, allTrees])

    // Flatten visible tree(s)
    const flatNodes = useMemo(
      () => flattenAllTrees(allTrees, expanded, collapsedModels, showModelHeaders),
      [allTrees, expanded, collapsedModels, showModelHeaders],
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

    const startEdit = useCallback((expressId: number, field: typeof editingField, modelId?: string) => {
      if (field === 'GlobalId') {
        const findGuid = (nodes: SpatialNode[]): string | null => {
          for (const n of nodes) {
            if (n.expressId === expressId) return n.globalId
            const found = findGuid(n.children)
            if (found !== null) return found
          }
          return null
        }
        const guid = findGuid(spatialTree) ?? ''
        setGuidWarning({ expressId, currentGuid: guid, modelId })
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
      modelId?: string,
    ) => {
      setEditingId(null)
      const trimmed = newValue.trim()
      if (trimmed === oldValue) return
      addCommand(buildRenameCommand(expressId, field, oldValue, trimmed, modelId))
    }, [addCommand])

    const handleSelectNode = useCallback((expressId: number, modelId?: string) => {
      setSelection([expressId])
      onSelectElement?.(expressId, modelId)
    }, [setSelection, onSelectElement])

    const getNodeCurrentName = useCallback((
      expressId: number,
      defaultName: string,
    ): string => {
      const { diffs } = useEditorStore.getState()
      const rename = [...diffs].reverse().find(
        (d) => d.type === 'RENAME' && d.expressId === expressId && d.field === 'Name',
      )
      return (rename?.type === 'RENAME' ? rename.newValue : undefined) ?? defaultName
    }, [])

    // ── Imperative handle: revealElement ────────────────────────────────────
    useImperativeHandle(ref, () => ({
      revealElement(expressId: number) {
        // Step 1 — expand ancestors across all loaded models
        setExpanded(prev => {
          const next = new Set(prev)

          const expandAncestors = (nodes: SpatialNode[]): boolean => {
            for (const node of nodes) {
              if (node.expressId === expressId) {
                next.add(node.expressId)
                return true
              }
              if (node.containedElements.some(e => e.expressId === expressId)) {
                next.add(node.expressId)
                return true
              }
              if (expandAncestors(node.children)) {
                next.add(node.expressId)
                return true
              }
            }
            return false
          }

          // Also make sure the owning model is not collapsed
          for (const { modelId, tree } of allTrees) {
            if (expandAncestors(tree)) {
              setCollapsedModels(c => { const s = new Set(c); s.delete(modelId); return s })
              break
            }
          }

          return next
        })

        // Step 2 — after React re-renders the expanded tree, scroll to the row.
        requestAnimationFrame(() => {
          requestAnimationFrame(() => {
            setExpanded(prev => {
              const flat = flattenAllTrees(allTrees, prev, collapsedModels, showModelHeaders)
              const idx  = flat.findIndex(f =>
                (f.kind === 'spatial' && f.node.expressId === expressId) ||
                (f.kind === 'element' && f.element.expressId === expressId),
              )
              if (idx !== -1) {
                virtualizer.scrollToIndex(idx, { align: 'center', behavior: 'smooth' })
              }
              return prev
            })
          })
        })

        // Step 3 — select the element (modelId unknown at this point — use best-effort)
        setSelection([expressId])
        onSelectElement?.(expressId)
      },
    }), [allTrees, collapsedModels, showModelHeaders, virtualizer, setSelection, onSelectElement])

    // ────────────────────────────────────────────────────────────────────────

    if (allTrees.length === 0 || allTrees.every(({ tree }) => tree.length === 0)) {
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
            {showModelHeaders ? `${allTrees.length} Models` : 'Spatial Tree'}
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
                  {flat.kind === 'model-header' ? (
                    <ModelHeaderRow
                      flat={flat}
                      onToggleCollapse={() =>
                        setCollapsedModels((prev) => {
                          const next = new Set(prev)
                          if (next.has(flat.modelId)) next.delete(flat.modelId)
                          else next.add(flat.modelId)
                          return next
                        })
                      }
                    />
                  ) : flat.kind === 'spatial' ? (
                    <SpatialRow
                      flat={flat}
                      issueRollup={issueRollupByModel.get(flat.modelId)?.rollup ?? new Map()}
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
                      directIssues={issueRollupByModel.get(flat.modelId)?.direct ?? new Map()}
                      isSelected={selection.includes(flat.element.expressId)}
                      onSelect={handleSelectNode}
                      onFocusElements={onFocusElements}
                      onCommitRename={(expressId, oldName, newName) =>
                        addCommand(buildRenameCommand(expressId, 'Name', oldName, newName, flat.modelId))
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
              addCommand(buildFixGuidCommand(guidWarning.expressId, guidWarning.currentGuid, guidWarning.modelId))
              setGuidWarning(null)
            }}
            onCancel={() => setGuidWarning(null)}
          />
        )}
      </div>
    )
  }
)

export default ModelTree

// ── Collect element IDs in subtree ────────────────────────────────────────────

function collectElementIds(node: SpatialNode): number[] {
  const ids: number[] = node.containedElements.map((e) => e.expressId)
  for (const child of node.children) ids.push(...collectElementIds(child))
  return ids
}

// ── Eye button ────────────────────────────────────────────────────────────────

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
        <svg width="13" height="13" viewBox="0 0 14 14" fill="none" stroke="currentColor" strokeWidth="1.3" strokeLinecap="round">
          <path d="M1 1l12 12M5.5 5.6A2 2 0 009.4 9.5" />
          <path d="M3 3.5C1.5 4.7 1 7 1 7s2 4 6 4a6.5 6.5 0 003.5-1M11.5 10C12.8 8.8 13 7 13 7s-2-4-6-4c-.7 0-1.4.1-2 .3" />
        </svg>
      ) : (
        <svg width="13" height="13" viewBox="0 0 14 14" fill="none" stroke="currentColor" strokeWidth="1.3" strokeLinecap="round">
          <path d="M1 7s2-4 6-4 6 4 6 4-2 4-6 4-6-4-6-4z" />
          <circle cx="7" cy="7" r="1.7" fill="currentColor" stroke="none" style={{ opacity: partial ? 0.4 : 1 }} />
        </svg>
      )}
    </button>
  )
}

// ── Model header row ──────────────────────────────────────────────────────────

function ModelHeaderRow({
  flat, onToggleCollapse,
}: {
  flat: FlatNode & { kind: 'model-header' }
  onToggleCollapse: () => void
}) {
  return (
    <div
      className="flex items-center gap-2 px-2 h-[30px] cursor-pointer select-none border-b border-[var(--border)] bg-[var(--surface)] hover:bg-[var(--surface-2)] transition-colors"
      onClick={onToggleCollapse}
      title={`${flat.isCollapsed ? 'Expand' : 'Collapse'} ${flat.fileName}`}
    >
      <svg
        width="8" height="8" viewBox="0 0 8 8" fill="currentColor"
        className="shrink-0 text-[var(--text-faint)]"
        style={{ transform: flat.isCollapsed ? 'rotate(-90deg)' : undefined }}
      >
        <path d="M0 2.5L4 6.5L8 2.5L7 1.5L4 4.5L1 1.5Z" />
      </svg>
      <span
        className="flex-1 min-w-0 truncate text-[11px] font-semibold text-[var(--text-dim)]"
        title={flat.fileName}
      >
        {flat.fileName}
      </span>
      <span className="text-[10px] text-[var(--text-faint)] font-mono bg-[var(--surface-2)] px-1.5 py-0.5 rounded-md shrink-0">
        {flat.nodeCount}
      </span>
    </div>
  )
}

// ── Spatial row ───────────────────────────────────────────────────────────────

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
  onSelect: (id: number, modelId?: string) => void
  onFocusElements?: (ids: number[]) => void
  onStartEdit: (id: number, field: 'Name' | 'LongName' | 'Description' | 'GlobalId', modelId?: string) => void
  onCommitEdit: (id: number, field: 'Name' | 'LongName' | 'Description', old: string, newVal: string, modelId?: string) => void
  onCancelEdit: () => void
  onBadgeClick: (id: number) => void
  getNodeCurrentName: (id: number, def: string) => string
}) {
  const { node, depth, isExpanded, hasChildren } = flat
  const modelId = flat.modelId
  const rollup    = issueRollup.get(node.expressId)
  const isEditingName     = editingId === node.expressId && editingField === 'Name'
  const isEditingLongName = editingId === node.expressId && editingField === 'LongName'
  const isEditingDesc     = editingId === node.expressId && editingField === 'Description'
  const isEditing         = isEditingName || isEditingLongName || isEditingDesc
  const displayName = getNodeCurrentName(node.expressId, node.name)
  const childCount  = node.containedElements.length + node.children.length

  const { hiddenElements, setElementsVisible } = useUIStore()
  const elemIds   = useMemo(() => collectElementIds(node), [node])
  const anyHidden = elemIds.length > 0 && elemIds.some((id) => hiddenElements.has(id))
  const allHidden = elemIds.length > 0 && elemIds.every((id) => hiddenElements.has(id))

  const handleVisibilityToggle = (e: React.MouseEvent): void => {
    e.stopPropagation()
    setElementsVisible(elemIds, allHidden)
  }

  const { addCommand } = useEditorStore()

  // Build Fix GUID handler if this node has a GUID issue in current results
  const { result, partialIssues } = useValidationStore()
  const hasGuidIssue = useMemo(() => {
    const issues = result?.issues ?? partialIssues
    return issues.some(
      (i) => i.expressId === node.expressId &&
        (i.ruleId === 'RULE_INVALID_GUID_FORMAT' || i.ruleId === 'RULE_DUPLICATE_GUID'),
    )
  }, [result, partialIssues, node.expressId])

  return (
    <TreeContextMenu
      expressId={node.expressId}
      globalId={node.globalId}
      displayName={displayName}
      onSelect={() => onSelect(node.expressId, modelId)}
      onFocus={() => {
        const ids = collectElementIds(node)
        if (ids.length > 0) onFocusElements?.(ids)
      }}
      onRename={() => onStartEdit(node.expressId, 'Name')}
      onFixGuid={hasGuidIssue && node.globalId
        ? () => addCommand(buildFixGuidCommand(node.expressId, node.globalId!, modelId))
        : undefined
      }
    >
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
      onClick={() => onSelect(node.expressId, modelId)}
      onDoubleClick={(e) => {
        e.stopPropagation()
        const ids = collectElementIds(node)
        if (ids.length > 0) onFocusElements?.(ids)
      }}
    >
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

      <ClassBadge cls={node.ifcClass} />

      {isEditingName ? (
        <InlineEdit
          value={displayName}
          onCommit={(v) => onCommitEdit(node.expressId, 'Name', node.name, v, modelId)}
          onCancel={onCancelEdit}
        />
      ) : isEditingLongName ? (
        <>
          <span className="text-[9px] text-[var(--text-faint)] font-mono shrink-0">LN</span>
          <InlineEdit
            value={node.longName ?? ''}
            onCommit={(v) => onCommitEdit(node.expressId, 'LongName', node.longName ?? '', v, modelId)}
            onCancel={onCancelEdit}
            placeholder="Long name…"
          />
        </>
      ) : isEditingDesc ? (
        <>
          <span className="text-[9px] text-[var(--text-faint)] font-mono shrink-0">D</span>
          <InlineEdit
            value={node.description ?? ''}
            onCommit={(v) => onCommitEdit(node.expressId, 'Description', node.description ?? '', v, modelId)}
            onCancel={onCancelEdit}
            placeholder="Description…"
          />
        </>
      ) : (
        <>
          <span className="flex-1 min-w-0 truncate text-[12px] leading-none" title={displayName}>
            {displayName}
          </span>
          {/* Rename name */}
          <button
            className="shrink-0 opacity-0 group-hover:opacity-60 hover:!opacity-100 transition-opacity p-0.5 rounded hover:bg-[var(--border)]"
            title="Edit Name"
            onClick={(e) => { e.stopPropagation(); onStartEdit(node.expressId, 'Name') }}
          >
            <svg width="11" height="11" viewBox="0 0 12 12" fill="none" stroke="currentColor" strokeWidth="1.4" strokeLinecap="round" strokeLinejoin="round">
              <path d="M8 2l2 2-6 6H2V8l6-6z" />
            </svg>
          </button>
          {/* Edit LongName */}
          <button
            className="shrink-0 opacity-0 group-hover:opacity-50 hover:!opacity-100 transition-opacity p-0.5 rounded hover:bg-[var(--border)] text-[9px] font-mono leading-none"
            title={`Edit LongName${node.longName ? `: ${node.longName}` : ' (empty)'}`}
            onClick={(e) => { e.stopPropagation(); onStartEdit(node.expressId, 'LongName') }}
          >
            LN
          </button>
          {/* Edit Description */}
          <button
            className="shrink-0 opacity-0 group-hover:opacity-50 hover:!opacity-100 transition-opacity p-0.5 rounded hover:bg-[var(--border)] text-[9px] font-mono leading-none"
            title={`Edit Description${node.description ? `: ${node.description}` : ' (empty)'}`}
            onClick={(e) => { e.stopPropagation(); onStartEdit(node.expressId, 'Description') }}
          >
            D
          </button>
        </>
      )}

      {childCount > 0 && !isEditing && (
        <span className="text-[10px] text-[var(--text-faint)] font-mono shrink-0 opacity-0 group-hover:opacity-100">
          {childCount}
        </span>
      )}

      {node.globalId && !isEditing && (
        <span
          className="text-[9px] font-mono text-[var(--text-faint)] shrink-0 truncate opacity-0 group-hover:opacity-100 max-w-[60px]"
          title={node.globalId}
          onDoubleClick={(e) => { e.stopPropagation(); onStartEdit(node.expressId, 'GlobalId', modelId) }}
        >
          {node.globalId.slice(0, 8)}
        </span>
      )}

      {rollup && (rollup.errors > 0 || rollup.warnings > 0) && !isEditing && (
        <IssueBadge
          errors={rollup.errors}
          warnings={rollup.warnings}
          onClick={(e) => { e.stopPropagation(); onBadgeClick(node.expressId) }}
        />
      )}

      {elemIds.length > 0 && !isEditing && (
        <span className={anyHidden ? 'shrink-0' : 'shrink-0 opacity-0 group-hover:opacity-100'}>
          <EyeBtn hidden={allHidden} partial={anyHidden && !allHidden} onClick={handleVisibilityToggle} />
        </span>
      )}
    </div>
    </TreeContextMenu>
  )
}

// ── Element row ───────────────────────────────────────────────────────────────

function ElementRow({
  flat, directIssues, isSelected, onSelect, onFocusElements, onCommitRename,
}: {
  flat: FlatNode & { kind: 'element' }
  directIssues: Map<number, { errors: number; warnings: number; info: number }>
  isSelected: boolean
  onSelect: (id: number, modelId?: string) => void
  onFocusElements?: (ids: number[]) => void
  onCommitRename: (expressId: number, oldName: string, newName: string) => void
}) {
  const { element, depth } = flat
  const modelId = flat.modelId
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

  const { addCommand } = useEditorStore()
  const { result: vResult, partialIssues: vPartial } = useValidationStore()
  const hasGuidIssue = useMemo(() => {
    const issues = vResult?.issues ?? vPartial
    return issues.some(
      (i) => i.expressId === element.expressId &&
        (i.ruleId === 'RULE_INVALID_GUID_FORMAT' || i.ruleId === 'RULE_DUPLICATE_GUID'),
    )
  }, [vResult, vPartial, element.expressId])

  return (
    <TreeContextMenu
      expressId={element.expressId}
      globalId={element.globalId}
      displayName={element.name}
      onSelect={() => onSelect(element.expressId, modelId)}
      onFocus={() => onFocusElements?.([element.expressId])}
      onRename={() => { setEditVal(element.name); setEditing(true) }}
      onFixGuid={hasGuidIssue && element.globalId
        ? () => addCommand(buildFixGuidCommand(element.expressId, element.globalId!, modelId))
        : undefined
      }
    >
    <div
      className={`flex items-center gap-1.5 px-2 h-[30px] cursor-pointer select-none group transition-colors
        ${isSelected
          ? 'text-[var(--text)]'
          : 'hover:bg-[var(--surface-2)] text-[var(--text-dim)]'}`}
      style={{
        paddingLeft: 8 + depth * 16,
        opacity: isHidden ? 0.4 : 1,
        backgroundColor: isSelected ? 'rgba(94,106,210,0.12)' : undefined,
      }}
      onClick={() => !editing && onSelect(element.expressId, modelId)}
      onDoubleClick={(e) => { e.stopPropagation(); if (!editing) onFocusElements?.([element.expressId]) }}
    >
      <span className="w-4 shrink-0" />

      <ClassBadge cls={element.ifcClass} />

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
          <span className="flex-1 min-w-0 truncate text-[12px] leading-none" title={element.name}>
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

      {element.globalId && !editing && (
        <span
          className="text-[9px] font-mono text-[var(--text-faint)] shrink-0 truncate opacity-0 group-hover:opacity-100 max-w-[60px]"
          title={element.globalId}
        >
          {element.globalId.slice(0, 8)}
        </span>
      )}

      {issues && (issues.errors > 0 || issues.warnings > 0) && !editing && (
        <IssueBadge errors={issues.errors} warnings={issues.warnings} />
      )}

      {!editing && (
        <span className={isHidden ? 'shrink-0' : 'shrink-0 opacity-0 group-hover:opacity-100'}>
          <EyeBtn
            hidden={isHidden}
            onClick={(e) => { e.stopPropagation(); setElementsVisible([element.expressId], isHidden) }}
          />
        </span>
      )}
    </div>
    </TreeContextMenu>
  )
}

// ── collectSubtreeIds ─────────────────────────────────────────────────────────

function collectSubtreeIds(node: SpatialNode): number[] {
  const ids: number[] = [node.expressId]
  for (const elem of node.containedElements) ids.push(elem.expressId)
  for (const child of node.children) ids.push(...collectSubtreeIds(child))
  return ids
}