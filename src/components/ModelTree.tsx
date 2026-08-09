import React, {
  useRef, useState, useCallback, useMemo, useEffect, useLayoutEffect,
  forwardRef, useImperativeHandle,
} from 'react'
import { useTranslation } from 'react-i18next'
import * as ContextMenu from '@radix-ui/react-context-menu'
import { useVirtualizer } from '@tanstack/react-virtual'
import { useShallow } from 'zustand/react/shallow'
import { useValidationStore, selectAllSpatialTrees } from '../stores/validationStore'
import { useEditorStore } from '../stores/editorStore'
import { useUIStore } from '../stores/uiStore'
import { modelRegistry } from '../lib/model-registry'
import { makeHiddenKey, expandWithDecomp } from '../lib/visibility'
import {
  scopedElementKey, flattenTrees, flattenTreesFiltered, collectSpatialKeys,
  nextExpansion, locateElement, resolveRevealTarget, invertDecomposition,
  buildIssueIndex, emptyIssueIndex, fileNameFromModelId,
  type FlatNode, type ModelIssueIndex, type ModelTreeSource,
} from '../lib/spatial-tree'
import { useEditorHistory } from '../hooks/useEditorHistory'
import { buildRenameCommand, buildFixGuidCommand } from '../lib/diffStore'
import { generateIfcGuid } from '../lib/diffStore'
import type { SpatialNode } from '../types'

// ── Imperative handle ─────────────────────────────────────────────────────────

/** What `revealElement` actually managed to do — see the Sidebar's button. */
export type RevealOutcome =
  | { ok: true; viaHost: false }
  /** The element is not in the tree; its host was shown instead. */
  | { ok: true; viaHost: true; hostName: string }
  /** Nothing to reveal: not in any tree, and nothing above it is either. */
  | { ok: false }

export interface ModelTreeHandle {
  /**
   * Open the tree down to an element and scroll to it.
   *
   * `modelId` is not optional decoration: with federated models the same
   * expressId exists in all of them, so without it this reveals whichever model
   * happens to be first — the right row number in the wrong building.
   *
   * Returns what it did, because it cannot always do what was asked and a
   * button that silently does nothing is worse than one that says why.
   */
  revealElement: (expressId: number, modelId?: string) => RevealOutcome
}

// The flattening, filtering, expansion and issue-indexing all live in
// ../lib/spatial-tree, because all of it turns on one thing that is invisible
// in a screenshot: an expressId is only unique inside its own file. See the
// header there, and spatial-tree.test.ts for the two-model fixture that proves
// it.

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
  const { t } = useTranslation('tree')
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
            {t('actions.selectIn3D')}
          </ContextMenu.Item>

          <ContextMenu.Item className={menuItemCls} onSelect={onFocus}>
            <svg width="13" height="13" viewBox="0 0 14 14" fill="none" stroke="currentColor" strokeWidth="1.4" strokeLinecap="round">
              <path d="M1 5V1h4M9 1h4v4M13 9v4H9M5 13H1V9" />
            </svg>
            {t('actions.frameCamera')}
          </ContextMenu.Item>

          <div className={menuSepCls} />

          <ContextMenu.Item className={menuItemCls} onSelect={onRename}>
            <svg width="13" height="13" viewBox="0 0 12 12" fill="none" stroke="currentColor" strokeWidth="1.4" strokeLinecap="round" strokeLinejoin="round">
              <path d="M8 2l2 2-6 6H2V8l6-6z" />
            </svg>
            {t('actions.rename')}
          </ContextMenu.Item>

          {onFixGuid && (
            <ContextMenu.Item className={menuItemCls} onSelect={onFixGuid}>
              <svg width="13" height="13" viewBox="0 0 14 14" fill="none" stroke="currentColor" strokeWidth="1.4" strokeLinecap="round">
                <path d="M2 7a5 5 0 1010 0 5 5 0 00-10 0zM7 4v4M5 6h4" />
              </svg>
              {t('actions.fixGuid')}
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
            {t('actions.copyGlobalId')}
          </ContextMenu.Item>

          <ContextMenu.Item className={menuItemCls} onSelect={handleCopyId}>
            <svg width="13" height="13" viewBox="0 0 14 14" fill="currentColor" opacity="0.7">
              <text x="1" y="11" fontSize="9" fontFamily="monospace">#id</text>
            </svg>
            {t('actions.copyExpressId')}
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
  const { t } = useTranslation('tree')
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
      title={t('issueBadge', { errors, warnings })}
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
  const { t } = useTranslation(['tree', 'common'])
  return (
    <div
      className="absolute inset-0 z-50 flex items-center justify-center bg-black/60"
      onClick={onCancel}
    >
      <div
        className="bg-[var(--surface)] border border-[var(--border-strong)] rounded-xl p-5 max-w-sm w-full mx-4 shadow-2xl"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="text-[13px] font-semibold text-[var(--text)] mb-2">{t('context.changeGuid')}</div>
        <p className="text-[12px] text-[var(--text-dim)] mb-1">
          {t('context.changeGuidWarning')}
        </p>
        <p className="text-[10px] font-mono text-[var(--text-faint)] mb-4 truncate">
          {t('context.current', { guid: currentGuid })}
        </p>
        <div className="flex gap-2 justify-end">
          <button
            onClick={onCancel}
            className="px-3 h-8 rounded-lg text-[12px] bg-[var(--surface-2)] text-[var(--text-dim)] border border-[var(--border)] hover:text-[var(--text)]"
          >
            {t('common:actions.cancel')}
          </button>
          <button
            onClick={() => onGenerate(generateIfcGuid())}
            className="px-3 h-8 rounded-lg text-[12px] bg-[var(--accent)] text-white hover:brightness-110"
          >
            {t('context.generateNew')}
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
    // Narrow selectors, not the whole store. Subscribing to all of
    // useValidationStore re-rendered the entire tree on every partial issue
    // batch — which, while a large model streams, is many times a second.
    const spatialTreesRecord = useValidationStore((s) => s.spatialTrees)
    const result        = useValidationStore((s) => s.result)
    const partialIssues = useValidationStore((s) => s.partialIssues)

    const allTrees: ModelTreeSource[] = useMemo(
      () => Object.entries(spatialTreesRecord).map(([modelId, tree]) => ({ modelId, tree })),
      [spatialTreesRecord],
    )
    const { selection, setSelection } = useEditorStore(
      useShallow((s) => ({ selection: s.selection, setSelection: s.setSelection })),
    )
    const { addCommand }                         = useEditorHistory()
    const { t } = useTranslation('tree')

    // Expansion is keyed by scopedElementKey, never by expressId. Every IFC
    // numbers from #1, so a bare number opens the same-numbered node in every
    // other loaded model at once.
    const [expanded,        setExpanded]        = useState<Set<string>>(new Set())
    const [collapsedModels, setCollapsedModels] = useState<Set<string>>(new Set())
    const [query,           setQuery]           = useState('')
    const [editingKey, setEditingKey]     = useState<string | null>(null)
    const [editingField, setEditingField] = useState<'Name' | 'LongName' | 'Description' | 'GlobalId'>('Name')
    const [guidWarning, setGuidWarning]   = useState<{ expressId: number; currentGuid: string; modelId?: string } | null>(null)

    const parentRef = useRef<HTMLDivElement>(null)

    const showModelHeaders = allTrees.length > 1

    const fileNameOf = useCallback(
      (modelId: string) => modelRegistry.get(modelId)?.fileName ?? fileNameFromModelId(modelId),
      [],
    )

    const allModelIds = useMemo(() => new Set(allTrees.map((m) => m.modelId)), [allTrees])

    // Auto-expand the first two levels when a tree arrives, and drop expansion
    // belonging to models that are gone. Pruning by scoped key rather than by
    // number is what stops a removed model's open storeys from reappearing on
    // the next model to reuse those ids — which, ids starting at #1 everywhere,
    // is every model.
    useEffect(() => {
      if (allTrees.length === 0) {
        setExpanded((prev) => (prev.size ? new Set() : prev))
        setCollapsedModels((prev) => (prev.size ? new Set() : prev))
        return
      }
      setExpanded((prev) => nextExpansion(allTrees, prev))
      setCollapsedModels((prev) => {
        let changed = false
        const next = new Set<string>()
        for (const id of prev) {
          if (allModelIds.has(id)) next.add(id)
          else changed = true
        }
        return changed ? next : prev
      })
    }, [allTrees, allModelIds])

    const trimmedQuery = query.trim().toLowerCase()
    const isFiltering = trimmedQuery.length > 0

    const expandAll = useCallback(() => {
      setExpanded(collectSpatialKeys(allTrees))
      setCollapsedModels(new Set())
    }, [allTrees])

    const collapseAll = useCallback(() => {
      setExpanded(new Set())
    }, [])

    /**
     * Issues indexed onto their own model, once. Rows read from it instead of
     * scanning the issue array themselves — which they used to do, per row, on
     * every partial batch.
     */
    const issueIndex = useMemo(
      () => buildIssueIndex(result?.issues ?? partialIssues, allTrees),
      [result, partialIssues, allTrees],
    )

    /**
     * The rows to highlight. A selection that names no model is resolved
     * against the loaded trees rather than lighting up its number everywhere:
     * three models, one click, three highlights is exactly the confusion this
     * whole file is about.
     */
    const selectedKeys = useMemo(() => {
      const keys = new Set<string>()
      for (const ref of selection) {
        if (ref.modelId) { keys.add(scopedElementKey(ref.modelId, ref.expressId)); continue }
        const found = locateElement(allTrees, ref.expressId)
        if (found) keys.add(scopedElementKey(found.modelId, ref.expressId))
      }
      return keys
    }, [selection, allTrees])

    // Flatten visible tree(s) — filtered view when a query is active
    const flatNodes = useMemo(
      () => isFiltering
        ? flattenTreesFiltered(allTrees, trimmedQuery, { showHeaders: showModelHeaders, fileNameOf })
        : flattenTrees(allTrees, { expanded, collapsedModels, showHeaders: showModelHeaders, fileNameOf }),
      [allTrees, expanded, collapsedModels, showModelHeaders, isFiltering, trimmedQuery, fileNameOf],
    )

    const virtualizer = useVirtualizer({
      count:            flatNodes.length,
      getScrollElement: () => parentRef.current,
      estimateSize:     () => ROW_HEIGHT,
      overscan:         8,
    })

    const toggleExpand = useCallback((key: string) => {
      setExpanded((prev) => {
        const next = new Set(prev)
        if (next.has(key)) next.delete(key)
        else               next.add(key)
        return next
      })
    }, [])

    const startEdit = useCallback((expressId: number, field: typeof editingField, modelId?: string) => {
      if (field === 'GlobalId') {
        // Search the OWNING model only. Searching every tree finds the first
        // node with that number, which in a federated set is routinely a
        // different element in a different building with a different GUID —
        // and this dialog then offers to rewrite it.
        const findGuid = (nodes: SpatialNode[]): string | null => {
          for (const n of nodes) {
            if (n.expressId === expressId) return n.globalId
            const found = findGuid(n.children)
            if (found !== null) return found
          }
          return null
        }
        const owning = allTrees.find((m) => m.modelId === modelId)?.tree
          ?? allTrees.flatMap((m) => m.tree)
        setGuidWarning({ expressId, currentGuid: findGuid(owning) ?? '', modelId })
        return
      }
      setEditingKey(modelId ? scopedElementKey(modelId, expressId) : String(expressId))
      setEditingField(field)
    }, [allTrees])

    const commitEdit = useCallback((
      expressId: number,
      field: 'Name' | 'LongName' | 'Description',
      oldValue: string,
      newValue: string,
      modelId?: string,
    ) => {
      setEditingKey(null)
      const trimmed = newValue.trim()
      if (trimmed === oldValue) return
      addCommand(buildRenameCommand(expressId, field, oldValue, trimmed, modelId))
    }, [addCommand])

    const handleSelectNode = useCallback((expressId: number, modelId?: string) => {
      setSelection([{ expressId, modelId }])
      onSelectElement?.(expressId, modelId)
    }, [setSelection, onSelectElement])

    /**
     * The name after any pending rename. Scoped to the model, because a rename
     * diff carries one — without the check, renaming a storey in one model
     * relabels the same-numbered storey in the others.
     */
    const getNodeCurrentName = useCallback((
      expressId: number,
      defaultName: string,
      modelId?: string,
    ): string => {
      // Walked over the HISTORY rather than the flattened diffs, because the
      // modelId lives on the command — flattening throws away the only thing
      // that says which model a rename belongs to.
      const { history, historyIndex } = useEditorStore.getState()
      for (let i = historyIndex; i >= 0; i--) {
        const command = history[i]
        if (!command) continue
        if (modelId && command.modelId && command.modelId !== modelId) continue
        for (let j = command.diffs.length - 1; j >= 0; j--) {
          const diff = command.diffs[j]
          if (diff.type === 'RENAME' && diff.expressId === expressId && diff.field === 'Name') {
            return diff.newValue
          }
        }
      }
      return defaultName
    }, [])

    // ── Imperative handle: revealElement ────────────────────────────────────
    const decompMaps = useValidationStore((s) => s.decompMaps)
    const hostOf = useCallback((modelId: string, id: number): number | undefined => {
      // Inverted lazily and per call: reveal is a click, not a render, and the
      // maps are per model so caching them here would just be another thing to
      // invalidate when a model is removed.
      return invertDecomposition(decompMaps[modelId]).get(id)
    }, [decompMaps])

    useImperativeHandle(ref, () => ({
      revealElement(expressId: number, modelId?: string): RevealOutcome {
        // Which model, decided once and up front. The old version expanded
        // ancestors in whichever tree matched first and then selected without a
        // model at all, so revealing an issue in a federated set opened the
        // right row number in the wrong building.
        const target = resolveRevealTarget(allTrees, expressId, modelId, hostOf)
        if (!target) return { ok: false }

        setQuery('')   // a filtered list may not contain the target row
        setCollapsedModels((prev) => {
          if (!prev.has(target.modelId)) return prev
          const next = new Set(prev)
          next.delete(target.modelId)
          return next
        })
        const expandedNext = new Set(expanded)
        for (const key of target.ancestorKeys) expandedNext.add(key)
        setExpanded(expandedNext)

        // Scroll after React has rendered the newly opened rows. The list is
        // recomputed from the state we just set rather than read back out of
        // it, so this does not depend on the re-render having landed.
        const collapsedNext = new Set([...collapsedModels].filter((m) => m !== target.modelId))
        const flat = flattenTrees(allTrees, {
          expanded: expandedNext, collapsedModels: collapsedNext,
          showHeaders: showModelHeaders, fileNameOf,
        })
        const wanted = scopedElementKey(target.modelId, target.expressId)
        const idx = flat.findIndex((f) => f.kind !== 'model-header' && f.key === wanted)
        requestAnimationFrame(() => {
          requestAnimationFrame(() => {
            if (idx !== -1) virtualizer.scrollToIndex(idx, { align: 'center', behavior: 'smooth' })
          })
        })

        setSelection([{ expressId: target.expressId, modelId: target.modelId }])
        onSelectElement?.(target.expressId, target.modelId)

        if (!target.viaHost) return { ok: true, viaHost: false }
        const row = flat[idx]
        const hostName = row?.kind === 'spatial' ? row.node.name
          : row?.kind === 'element' ? row.element.name
          : `#${target.expressId}`
        return { ok: true, viaHost: true, hostName }
      },
    }), [allTrees, expanded, collapsedModels, showModelHeaders, fileNameOf, virtualizer,
         hostOf, setSelection, onSelectElement])

    // ────────────────────────────────────────────────────────────────────────

    if (allTrees.length === 0 || allTrees.every(({ tree }) => tree.length === 0)) {
      return (
        <div className="flex flex-col items-center justify-center h-full gap-3 px-4 text-center">
          <div className="w-10 h-10 rounded-full bg-[var(--surface-2)] flex items-center justify-center text-lg">🌲</div>
          <p className="text-[12px] text-[var(--text-dim)]">
            {t('noModelDesc')}
          </p>
        </div>
      )
    }

    return (
      <div className="relative flex flex-col h-full">
        {/* Header */}
        <div className="flex-none px-3 py-2.5 border-b border-[var(--border)] flex items-center justify-between gap-2 bg-[var(--surface)]">
          <span className="text-[11px] font-semibold text-[var(--text-dim)] uppercase tracking-wider truncate">
            {showModelHeaders ? t('models.count', { count: allTrees.length }) : t('spatialTree')}
          </span>
          <div className="flex items-center gap-1 shrink-0">
            {/* Expand all */}
            <button
              onClick={expandAll}
              disabled={isFiltering}
              title={t('actions.expandAll')}
              aria-label={t('actions.expandAll')}
              className="w-6 h-6 flex items-center justify-center rounded text-[var(--text-faint)] hover:text-[var(--text)] hover:bg-[var(--surface-2)] disabled:opacity-30 disabled:pointer-events-none transition-colors"
            >
              <svg width="13" height="13" viewBox="0 0 14 14" fill="none" stroke="currentColor" strokeWidth="1.4" strokeLinecap="round" strokeLinejoin="round">
                <path d="M4 5.5L7 8.5L10 5.5" /><path d="M2 2.5h10M2 11.5h10" />
              </svg>
            </button>
            {/* Collapse all */}
            <button
              onClick={collapseAll}
              disabled={isFiltering}
              title={t('actions.collapseAll')}
              aria-label={t('actions.collapseAll')}
              className="w-6 h-6 flex items-center justify-center rounded text-[var(--text-faint)] hover:text-[var(--text)] hover:bg-[var(--surface-2)] disabled:opacity-30 disabled:pointer-events-none transition-colors"
            >
              <svg width="13" height="13" viewBox="0 0 14 14" fill="none" stroke="currentColor" strokeWidth="1.4" strokeLinecap="round" strokeLinejoin="round">
                <path d="M4 8.5L7 5.5L10 8.5" /><path d="M2 2.5h10M2 11.5h10" />
              </svg>
            </button>
            <span className="text-[10px] text-[var(--text-faint)] font-mono bg-[var(--surface-2)] px-1.5 py-0.5 rounded-md ml-0.5">
              {flatNodes.length}
            </span>
          </div>
        </div>

        {/* Search / filter */}
        <div className="flex-none px-2 py-2 border-b border-[var(--border)] bg-[var(--surface)]">
          <div className="relative">
            <svg
              width="12" height="12" viewBox="0 0 14 14" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round"
              className="absolute left-2 top-1/2 -translate-y-1/2 text-[var(--text-faint)] pointer-events-none"
            >
              <circle cx="6" cy="6" r="4.5" /><path d="M9.5 9.5L13 13" />
            </svg>
            <input
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              onKeyDown={(e) => { if (e.key === 'Escape') { e.stopPropagation(); setQuery('') } }}
              placeholder={t('search')}
              className="w-full h-7 pl-7 pr-7 bg-[var(--surface-2)] border border-[var(--border)] rounded-md text-[12px] text-[var(--text)] outline-none focus:border-[var(--accent)] placeholder:text-[var(--text-faint)]"
            />
            {query && (
              <button
                onClick={() => setQuery('')}
                aria-label={t('clear', { defaultValue: 'Clear' })}
                className="absolute right-1.5 top-1/2 -translate-y-1/2 w-5 h-5 flex items-center justify-center rounded text-[var(--text-faint)] hover:text-[var(--text)] hover:bg-[var(--border)]"
              >
                <svg width="11" height="11" viewBox="0 0 12 12" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round">
                  <path d="M2.5 2.5l7 7M9.5 2.5l-7 7" />
                </svg>
              </button>
            )}
          </div>
        </div>

        {/* No-results state for active filter */}
        {isFiltering && flatNodes.length === 0 && (
          <div className="flex-1 flex items-center justify-center px-4 text-center">
            <p className="text-[12px] text-[var(--text-dim)]">{t('noResults', { query: query.trim() })}</p>
          </div>
        )}

        {/* Virtual list */}
        <div
          ref={parentRef}
          className="flex-1 overflow-y-auto overflow-x-hidden"
          style={{ display: isFiltering && flatNodes.length === 0 ? 'none' : undefined }}
        >
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
                      issues={issueIndex.get(flat.modelId) ?? emptyIssueIndex()}
                      isSelected={selectedKeys.has(flat.key)}
                      editingKey={editingKey}
                      editingField={editingField}
                      onToggle={toggleExpand}
                      onSelect={handleSelectNode}
                      onFocusElements={onFocusElements}
                      onStartEdit={startEdit}
                      onCommitEdit={commitEdit}
                      onCancelEdit={() => setEditingKey(null)}
                      onBadgeClick={(eid) => {
                        const allIds = collectSubtreeIds(flat.node)
                        onFilterBySubtree?.(allIds)
                      }}
                      getNodeCurrentName={getNodeCurrentName}
                    />
                  ) : (
                    <ElementRow
                      flat={flat}
                      issues={issueIndex.get(flat.modelId) ?? emptyIssueIndex()}
                      isSelected={selectedKeys.has(flat.key)}
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

// Spatial structure types that carry no renderable geometry in the 3D model.
// IfcSpace IS renderable (semi-transparent room volume) so it is NOT in this set.
const GEOMETRY_FREE_SPATIAL = new Set([
  'IFCPROJECT', 'IFCSITE', 'IFCBUILDING', 'IFCBUILDINGSTOREY', 'IFCZONE',
])

function collectElementIds(node: SpatialNode, decompMap?: Map<number, number[]>): number[] {
  const ids: number[] = []
  for (const e of node.containedElements) ids.push(...expandWithDecomp(e.expressId, decompMap))
  for (const child of node.children) {
    // Spatial child nodes that carry renderable geometry (e.g. IfcSpace room volumes)
    // must be included so that hiding a storey also hides those 3D volumes.
    // Pure containers (IfcBuilding, IfcBuildingStorey, etc.) have no geometry and
    // are excluded to avoid corrupting the allHidden EyeBtn state.
    if (!GEOMETRY_FREE_SPATIAL.has(child.ifcClass.toUpperCase())) {
      ids.push(...expandWithDecomp(child.expressId, decompMap))
    }
    ids.push(...collectElementIds(child, decompMap))
  }
  return ids
}

// ── Eye button ────────────────────────────────────────────────────────────────

function EyeBtn({
  hidden, partial = false, onClick,
}: { hidden: boolean; partial?: boolean; onClick: (e: React.MouseEvent) => void }) {
  const { t } = useTranslation('tree')
  return (
    <button
      onClick={(e) => { e.stopPropagation(); onClick(e) }}
      className="w-5 h-5 flex items-center justify-center rounded shrink-0 transition-colors hover:bg-[var(--border)]"
      style={{ opacity: hidden || partial ? 1 : undefined }}
      title={hidden ? t('actions.show') : partial ? t('actions.showAll') : t('actions.hide')}
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
  const { t } = useTranslation('tree')
  return (
    <div
      className="flex items-center gap-2 px-2 h-[30px] cursor-pointer select-none border-b border-[var(--border)] bg-[var(--surface)] hover:bg-[var(--surface-2)] transition-colors"
      onClick={onToggleCollapse}
      title={`${flat.isCollapsed ? t('actions.expand') : t('actions.collapse')} · ${flat.fileName}`}
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
  flat, issues, isSelected, editingKey, editingField,
  onToggle, onSelect, onFocusElements, onStartEdit, onCommitEdit, onCancelEdit, onBadgeClick, getNodeCurrentName,
}: {
  flat: FlatNode & { kind: 'spatial' }
  /** This model's issue index — never another model's, and never rebuilt here. */
  issues: ModelIssueIndex
  isSelected: boolean
  editingKey: string | null
  editingField: 'Name' | 'LongName' | 'Description' | 'GlobalId'
  onToggle: (key: string) => void
  onSelect: (id: number, modelId?: string) => void
  onFocusElements?: (ids: number[]) => void
  onStartEdit: (id: number, field: 'Name' | 'LongName' | 'Description' | 'GlobalId', modelId?: string) => void
  onCommitEdit: (id: number, field: 'Name' | 'LongName' | 'Description', old: string, newVal: string, modelId?: string) => void
  onCancelEdit: () => void
  onBadgeClick: (id: number) => void
  getNodeCurrentName: (id: number, def: string, modelId?: string) => string
}) {
  const { t } = useTranslation('tree')
  const { node, depth, isExpanded, hasChildren } = flat
  const modelId = flat.modelId
  const rollup    = issues.rollup.get(node.expressId)
  const isEditingName     = editingKey === flat.key && editingField === 'Name'
  const isEditingLongName = editingKey === flat.key && editingField === 'LongName'
  const isEditingDesc     = editingKey === flat.key && editingField === 'Description'
  const isEditing         = isEditingName || isEditingLongName || isEditingDesc
  const displayName = getNodeCurrentName(node.expressId, node.name, modelId)
  const childCount  = node.containedElements.length + node.children.length

  // Selectors, not the whole store: these rows re-render for every visible row
  // and useUIStore() without one wakes all of them on any UI change.
  const hiddenElements    = useUIStore((s) => s.hiddenElements)
  const setElementsVisible = useUIStore((s) => s.setElementsVisible)
  const decompMap = useValidationStore((s) => modelId ? s.decompMaps[modelId] : undefined)
  const elemIds   = useMemo(() => collectElementIds(node, decompMap), [node, decompMap])
  const anyHidden = elemIds.length > 0 && elemIds.some((id) => hiddenElements.has(makeHiddenKey(modelId, id)))
  const allHidden = elemIds.length > 0 && elemIds.every((id) => hiddenElements.has(makeHiddenKey(modelId, id)))

  const handleVisibilityToggle = (e: React.MouseEvent): void => {
    e.stopPropagation()
    setElementsVisible(elemIds, allHidden, modelId)
  }

  const addCommand = useEditorStore((s) => s.addCommand)

  // Indexed once for the whole tree, per model. Asking the issue array itself —
  // inside every visible row, on every partial validation batch — was O(rows x
  // issues) several times a second, and answered for the wrong model besides.
  const hasGuidIssue = issues.guidIssues.has(node.expressId)

  return (
    <TreeContextMenu
      expressId={node.expressId}
      globalId={node.globalId}
      displayName={displayName}
      onSelect={() => onSelect(node.expressId, modelId)}
      onFocus={() => {
        const ids = collectElementIds(node, decompMap)
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
        const ids = collectElementIds(node, decompMap)
        if (ids.length > 0) onFocusElements?.(ids)
      }}
    >
      <button
        className={`w-4 h-4 flex items-center justify-center text-[var(--text-faint)] shrink-0
          ${hasChildren ? 'hover:text-[var(--text)]' : 'opacity-0 pointer-events-none'}`}
        onClick={(e) => { e.stopPropagation(); onToggle(flat.key) }}
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
            title={t('editName')}
            onClick={(e) => { e.stopPropagation(); onStartEdit(node.expressId, 'Name') }}
          >
            <svg width="11" height="11" viewBox="0 0 12 12" fill="none" stroke="currentColor" strokeWidth="1.4" strokeLinecap="round" strokeLinejoin="round">
              <path d="M8 2l2 2-6 6H2V8l6-6z" />
            </svg>
          </button>
          {/* Edit LongName */}
          <button
            className="shrink-0 opacity-0 group-hover:opacity-50 hover:!opacity-100 transition-opacity p-0.5 rounded hover:bg-[var(--border)] text-[9px] font-mono leading-none"
            title={`${t('editLongName')}${node.longName ? `: ${node.longName}` : ''}`}
            onClick={(e) => { e.stopPropagation(); onStartEdit(node.expressId, 'LongName') }}
          >
            LN
          </button>
          {/* Edit Description */}
          <button
            className="shrink-0 opacity-0 group-hover:opacity-50 hover:!opacity-100 transition-opacity p-0.5 rounded hover:bg-[var(--border)] text-[9px] font-mono leading-none"
            title={`${t('editDescription')}${node.description ? `: ${node.description}` : ''}`}
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
  flat, issues, isSelected, onSelect, onFocusElements, onCommitRename,
}: {
  flat: FlatNode & { kind: 'element' }
  /** This model's issue index — never another model's. */
  issues: ModelIssueIndex
  isSelected: boolean
  onSelect: (id: number, modelId?: string) => void
  onFocusElements?: (ids: number[]) => void
  onCommitRename: (expressId: number, oldName: string, newName: string) => void
}) {
  const { t } = useTranslation('tree')
  const { element, depth } = flat
  const modelId = flat.modelId
  const counts = issues.direct.get(element.expressId)

  const [editing, setEditing] = useState(false)
  const [editVal, setEditVal] = useState('')
  const inputRef = useRef<HTMLInputElement>(null)

  const hiddenElements     = useUIStore((s) => s.hiddenElements)
  const setElementsVisible = useUIStore((s) => s.setElementsVisible)
  const decompMap = useValidationStore((s) => modelId ? s.decompMaps[modelId] : undefined)
  const isHidden = hiddenElements.has(makeHiddenKey(modelId, element.expressId))

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

  const addCommand = useEditorStore((s) => s.addCommand)
  const hasGuidIssue = issues.guidIssues.has(element.expressId)

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
            title={t('actions.rename')}
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

      {counts && (counts.errors > 0 || counts.warnings > 0) && !editing && (
        <IssueBadge errors={counts.errors} warnings={counts.warnings} />
      )}

      {!editing && (
        <span className={isHidden ? 'shrink-0' : 'shrink-0 opacity-0 group-hover:opacity-100'}>
          <EyeBtn
            hidden={isHidden}
            onClick={(e) => {
              e.stopPropagation()
              setElementsVisible(expandWithDecomp(element.expressId, decompMap), isHidden, modelId)
            }}
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