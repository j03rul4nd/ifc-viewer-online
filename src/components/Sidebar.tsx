import React, { useState, useEffect, useMemo, useCallback, useRef } from 'react'
import { motion, AnimatePresence } from 'framer-motion'
import { useTranslation } from 'react-i18next'
import * as Icons from './Icons'
import { useValidationStore } from '../stores/validationStore'
import { useUIStore } from '../stores/uiStore'
import { makeHiddenKey, expandWithDecomp } from '../lib/visibility'
import { useEditorHistory } from '../hooks/useEditorHistory'
import { useEditorStore } from '../stores/editorStore'
import { useTakeoffStore, selectTakeoffGroups, selectTakeoffStatus } from '../stores/takeoffStore'
import { useSceneStore } from '../stores/sceneStore'
import { computeTakeoff } from '../lib/takeoff'
import { buildRenameCommand, buildSetPropertyCommand } from '../lib/diffStore'
import type { Category, SelectedInfo, SpatialNode, SpatialElement, ValidationIssue, TakeoffGroup } from '../types'
import type { IFCItemData, IFCPropertySet, ViewerAPI } from '../lib/viewer'

// ─── helpers ──────────────────────────────────────────────────────────────────

function buildNameMap(nodes: SpatialNode[]): Map<number, string> {
  const map = new Map<number, string>()
  const walk = (ns: SpatialNode[]) => {
    for (const n of ns) {
      map.set(n.expressId, n.name || `#${n.expressId}`)
      for (const e of n.containedElements) map.set(e.expressId, e.name || `#${e.expressId}`)
      walk(n.children)
    }
  }
  walk(nodes)
  return map
}

/** Returns [Site, Building, Storey, …] path to `targetId` */
function findSpatialPath(
  nodes: SpatialNode[],
  targetId: number,
  ancestors: SpatialNode[] = [],
): SpatialNode[] | null {
  for (const node of nodes) {
    const path = [...ancestors, node]
    if (node.expressId === targetId) return path
    for (const el of node.containedElements) {
      if (el.expressId === targetId) return path
    }
    const found = findSpatialPath(node.children, targetId, path)
    if (found) return found
  }
  return null
}

const IFC_DISPLAY_NAMES: Record<string, string> = {
  IFCWALL: 'Walls', IFCWALLSTANDARDCASE: 'Walls',
  IFCSLAB: 'Slabs', IFCSLABSTANDARDCASE: 'Slabs',
  IFCBEAM: 'Beams', IFCBEAMSTANDARDCASE: 'Beams',
  IFCCOLUMN: 'Columns', IFCCOLUMNSTANDARDCASE: 'Columns',
  IFCDOOR: 'Doors', IFCWINDOW: 'Windows',
  IFCROOF: 'Roofs', IFCSTAIR: 'Stairs', IFCSTAIRFLIGHT: 'Stairs',
  IFCRAILING: 'Railings', IFCSPACE: 'Spaces',
  IFCFURNISHINGELEMENT: 'Furniture', IFCFLOWSEGMENT: 'MEP',
  IFCPIPESEGMENT: 'Pipes', IFCDUCTSEGMENT: 'Ducts',
  IFCMEMBER: 'Members', IFCPLATE: 'Plates',
  IFCCOVERING: 'Coverings', IFCFOOTING: 'Footings', IFCPILE: 'Piles',
}

const CLASS_COLOR: Record<string, string> = {
  IfcProject: '#5E6AD2', IfcSite: '#30A46C',
  IfcBuilding: '#8B93E8', IfcBuildingStorey: '#F5A623',
  IfcSpace: '#6FB8D9', IfcZone: '#D4A373',
}

function prettyType(raw: string): string {
  const noPrefix = raw.startsWith('IFC') ? raw.slice(3) : raw
  return noPrefix.charAt(0) + noPrefix.slice(1).toLowerCase()
}

function formatPropValue(value: string | number | boolean | null): string {
  if (value === null || value === undefined) return '—'
  if (typeof value === 'boolean') return value ? 'True' : 'False'
  if (typeof value === 'number') return String(value)
  if (value === '') return '—'
  return value
}

// ─── sub-components ───────────────────────────────────────────────────────────

function SectionHeader({ label, open, onToggle, badge }: {
  label: string
  open: boolean
  onToggle: () => void
  badge?: number
}) {
  return (
    <button
      onClick={onToggle}
      className="w-full flex items-center gap-1.5 px-4 py-2 text-[10.5px] font-semibold text-[var(--text-dim)] uppercase tracking-[0.08em] hover:text-[var(--text)] transition-colors group"
    >
      <svg
        width="7" height="7" viewBox="0 0 8 8" fill="currentColor"
        className="transition-transform shrink-0"
        style={{ transform: open ? 'rotate(90deg)' : 'rotate(0deg)' }}
      >
        <path d="M2.5 0L6.5 4L2.5 8L1.5 7L4.5 4L1.5 1Z" />
      </svg>
      {label}
      {badge !== undefined && badge > 0 && (
        <span className="ml-auto text-[9px] px-1.5 py-0.5 rounded-full bg-[var(--surface-2)] text-[var(--text-faint)] font-mono border border-[var(--border)]">
          {badge}
        </span>
      )}
    </button>
  )
}

function CopyButton({ value, label }: { value: string; label?: string }) {
  const [copied, setCopied] = useState(false)
  return (
    <button
      onClick={() => {
        navigator.clipboard.writeText(value).catch(() => {})
        setCopied(true)
        setTimeout(() => setCopied(false), 1500)
      }}
      className="inline-flex items-center gap-1 px-1.5 py-0.5 rounded text-[10px] font-mono text-[var(--text-faint)] hover:text-[var(--text)] hover:bg-[var(--surface-2)] transition-colors"
      title={`Copy ${label ?? value}`}
    >
      {copied ? (
        <svg width="10" height="10" viewBox="0 0 12 12" fill="none" stroke="#30A46C" strokeWidth="1.8" strokeLinecap="round">
          <path d="M2 6l3 3 5-5" />
        </svg>
      ) : (
        <svg width="10" height="10" viewBox="0 0 12 12" fill="none" stroke="currentColor" strokeWidth="1.4" strokeLinecap="round">
          <rect x="4" y="4" width="7" height="7" rx="1" />
          <path d="M8 4V2a1 1 0 00-1-1H2a1 1 0 00-1 1v5a1 1 0 001 1h2" />
        </svg>
      )}
      {label && <span>{label}</span>}
    </button>
  )
}

// ─── EmptyText ────────────────────────────────────────────────────────────────

function EmptyText() {
  const { t } = useTranslation('sidebar')
  return <span className="text-[var(--text-faint)] italic">{t('properties.empty')}</span>
}

// ─── EditableField ─────────────────────────────────────────────────────────────

interface EditableFieldProps {
  label: string
  value: string
  isDirty: boolean
  onCommit: (val: string) => void
}

function EditableField({ label, value, isDirty, onCommit }: EditableFieldProps) {
  const [editing, setEditing] = useState(false)
  const [draft, setDraft] = useState(value)
  const inputRef = useRef<HTMLInputElement>(null)

  // Only resync the draft from the incoming value while NOT editing.
  // Otherwise an async IFC-data load (or any external update) would wipe
  // what the user is currently typing.
  useEffect(() => { if (!editing) setDraft(value) }, [value, editing])
  useEffect(() => {
    if (editing) { inputRef.current?.focus(); inputRef.current?.select() }
  }, [editing])

  const commit = () => {
    setEditing(false)
    const trimmed = draft.trim()
    if (trimmed !== value) onCommit(trimmed)
  }

  return (
    <div className="flex items-baseline px-4 py-1 gap-2 group/field">
      <div className="w-[38%] flex-shrink-0 flex items-center gap-1">
        <span className="text-[11px] text-[var(--text-dim)]">{label}</span>
        {isDirty && (
          <span className="w-1.5 h-1.5 rounded-full bg-[var(--accent)] shrink-0" title="Unsaved change" />
        )}
      </div>
      {editing ? (
        <input
          ref={inputRef}
          value={draft}
          onChange={e => setDraft(e.target.value)}
          onKeyDown={e => {
            if (e.key === 'Enter')  { e.stopPropagation(); commit() }
            if (e.key === 'Escape') { e.stopPropagation(); setDraft(value); setEditing(false) }
          }}
          onBlur={commit}
          className="flex-1 bg-[var(--surface-2)] border border-[var(--accent)] rounded px-1.5 text-[12px] text-[var(--text)] outline-none h-6"
        />
      ) : (
        <div
          className="flex-1 flex items-center gap-1 min-w-0 cursor-text"
          onClick={() => setEditing(true)}
        >
          <span
            className={`flex-1 text-[12px] break-words leading-snug ${
              isDirty ? 'text-[var(--accent-2)]' : 'text-[var(--text)]'
            }`}
          >
            {value || <EmptyText />}
          </span>
          <button
            className="shrink-0 opacity-0 group-hover/field:opacity-50 hover:!opacity-100 transition-opacity p-0.5 rounded hover:bg-[var(--border)]"
            title="Edit"
            onClick={e => { e.stopPropagation(); setEditing(true) }}
          >
            <svg width="10" height="10" viewBox="0 0 12 12" fill="none" stroke="currentColor" strokeWidth="1.4" strokeLinecap="round" strokeLinejoin="round">
              <path d="M8 2l2 2-6 6H2V8l6-6z" />
            </svg>
          </button>
        </div>
      )}
    </div>
  )
}

// ─── ReadOnlyField ─────────────────────────────────────────────────────────────

function ReadOnlyField({ label, value, mono = false, copyable = false }: {
  label: string
  value: string | null
  mono?: boolean
  copyable?: boolean
}) {
  if (!value) return null
  return (
    <div className="flex items-baseline px-4 py-1">
      <div className="w-[38%] flex-shrink-0 text-[11px] text-[var(--text-dim)]">{label}</div>
      <div className="flex-1 flex items-center gap-1 min-w-0">
        <span className={`flex-1 text-[12px] text-[var(--text)] truncate ${mono ? 'font-mono text-[11px]' : ''}`} title={value}>
          {value}
        </span>
        {copyable && <CopyButton value={value} />}
      </div>
    </div>
  )
}

// ─── IssuePill ─────────────────────────────────────────────────────────────────

function IssuePill({ issue }: { issue: ValidationIssue }) {
  const [open, setOpen] = useState(false)
  const colors = {
    error:   { bg: '#E5484D18', border: '#E5484D44', text: '#E5484D', dot: '#E5484D' },
    warning: { bg: '#F5A62318', border: '#F5A62344', text: '#F5A623', dot: '#F5A623' },
    info:    { bg: '#5E9ED618', border: '#5E9ED644', text: '#5E9ED6', dot: '#5E9ED6' },
  }[issue.severity]

  return (
    <div
      className="mx-4 mb-1.5 rounded-lg overflow-hidden cursor-pointer"
      style={{ background: colors.bg, border: `1px solid ${colors.border}` }}
      onClick={() => setOpen(v => !v)}
    >
      <div className="flex items-center gap-2 px-2.5 py-1.5">
        <span className="w-1.5 h-1.5 rounded-full shrink-0" style={{ background: colors.dot }} />
        <span className="flex-1 text-[11.5px] truncate" style={{ color: colors.text }}>
          {issue.message}
        </span>
        {issue.autoFixable && (
          <span className="text-[9px] px-1 py-0.5 rounded bg-[#30A46C18] text-[#30A46C] border border-[#30A46C33] shrink-0 font-medium">
            AUTO-FIX
          </span>
        )}
        <svg
          width="8" height="8" viewBox="0 0 8 8" fill="currentColor"
          className="transition-transform shrink-0 text-[var(--text-faint)]"
          style={{ transform: open ? 'rotate(90deg)' : 'rotate(0deg)' }}
        >
          <path d="M2.5 0L6.5 4L2.5 8L1.5 7L4.5 4L1.5 1Z" />
        </svg>
      </div>
      <AnimatePresence>
        {open && (
          <motion.div
            initial={{ height: 0 }} animate={{ height: 'auto' }} exit={{ height: 0 }}
            transition={{ duration: 0.15 }}
            style={{ overflow: 'hidden' }}
          >
            <div className="px-2.5 pb-2 pt-0.5 space-y-0.5">
              <div className="text-[10.5px] text-[var(--text-dim)]">
                Rule: <span className="font-mono text-[var(--text-faint)]">{issue.ruleId}</span>
              </div>
              {issue.path.length > 0 && (
                <div className="text-[10.5px] text-[var(--text-dim)]">
                  Path: <span className="text-[var(--text-faint)]">{issue.path.join(' › ')}</span>
                </div>
              )}
            </div>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  )
}

// ─── PsetSection ──────────────────────────────────────────────────────────────

function PsetRow({
  pset,
  elementExpressId,
  onEditProperty,
  forceOpen = false,
}: {
  pset: IFCPropertySet
  elementExpressId: number
  onEditProperty: (psetName: string, propName: string, propExpressId: number, oldValue: string, newValue: string) => void
  /** When true (active filter), the set is forced open so matches are visible. */
  forceOpen?: boolean
}) {
  const [userOpen, setUserOpen] = useState(false)
  const open = forceOpen || userOpen
  const setOpen = setUserOpen
  const [editingPropId, setEditingPropId] = useState<number | null>(null)
  const [editValue, setEditValue] = useState('')

  const startEdit = (propExpressId: number, currentValue: string): void => {
    setEditingPropId(propExpressId)
    setEditValue(currentValue)
  }

  const commitEdit = (prop: IFCPropertySet['properties'][number]): void => {
    const trimmed = editValue.trim()
    if (trimmed !== String(prop.value ?? '')) {
      onEditProperty(pset.name, prop.name, prop.expressId, String(prop.value ?? ''), trimmed)
    }
    setEditingPropId(null)
  }

  return (
    <div className="mx-4 mb-1.5 rounded-lg overflow-hidden border border-[var(--border)]">
      <button
        onClick={() => setOpen(v => !v)}
        className="w-full flex items-center gap-2 px-2.5 py-1.5 hover:bg-[var(--surface-2)] transition-colors text-left"
      >
        <svg
          width="7" height="7" viewBox="0 0 8 8" fill="currentColor"
          className="transition-transform shrink-0 text-[var(--text-faint)]"
          style={{ transform: open ? 'rotate(90deg)' : 'rotate(0deg)' }}
        >
          <path d="M2.5 0L6.5 4L2.5 8L1.5 7L4.5 4L1.5 1Z" />
        </svg>
        <span className="flex-1 text-[12px] font-medium text-[var(--text)] truncate">{pset.name}</span>
        <span className="text-[10px] font-mono text-[var(--text-faint)] shrink-0">{pset.properties.length}</span>
      </button>

      <AnimatePresence initial={false}>
        {open && (
          <motion.div
            initial={{ height: 0 }} animate={{ height: 'auto' }} exit={{ height: 0 }}
            transition={{ duration: 0.15 }}
            style={{ overflow: 'hidden' }}
          >
            <div className="border-t border-[var(--border)]">
              {pset.properties.map((prop, i) => {
                const isEditingThis = editingPropId === prop.expressId
                return (
                  <div
                    key={i}
                    className="flex items-center px-2.5 py-1 gap-2 hover:bg-[var(--surface-2)] transition-colors group/prop"
                  >
                    <span className="w-[42%] flex-shrink-0 text-[11px] text-[var(--text-dim)] truncate" title={prop.name}>
                      {prop.name}
                    </span>
                    <div className="flex-1 flex items-center gap-1 min-w-0">
                      {isEditingThis ? (
                        <>
                          <input
                            autoFocus
                            value={editValue}
                            onChange={(e) => setEditValue(e.target.value)}
                            onKeyDown={(e) => {
                              if (e.key === 'Enter')  { e.preventDefault(); e.stopPropagation(); commitEdit(prop) }
                              if (e.key === 'Escape') { e.preventDefault(); e.stopPropagation(); setEditingPropId(null) }
                            }}
                            onBlur={() => commitEdit(prop)}
                            className="flex-1 h-5 px-1 text-[11px] bg-[var(--surface)] border border-[var(--accent)] rounded text-[var(--text)] outline-none"
                          />
                          <button
                            onMouseDown={(e) => e.preventDefault()}
                            onClick={() => setEditingPropId(null)}
                            className="text-[10px] text-[var(--text-faint)] hover:text-[var(--text)] shrink-0 px-0.5"
                          >✕</button>
                        </>
                      ) : (
                        <>
                          <span
                            className={`flex-1 text-[11.5px] truncate ${
                              prop.value === null || prop.value === ''
                                ? 'text-[var(--text-faint)] italic'
                                : 'text-[var(--text)]'
                            }`}
                            title={String(prop.value ?? '—')}
                          >
                            {formatPropValue(prop.value)}
                          </span>
                          {/* Only show edit button when prop has an expressId from the viewer */}
                          {prop.expressId > 0 && (
                            <button
                              className="shrink-0 opacity-0 group-hover/prop:opacity-60 hover:!opacity-100 transition-opacity p-0.5 rounded hover:bg-[var(--border)]"
                              title="Edit value"
                              onClick={() => startEdit(prop.expressId, String(prop.value ?? ''))}
                            >
                              <svg width="9" height="9" viewBox="0 0 12 12" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
                                <path d="M8 2l2 2-6 6H2V8l6-6z" />
                              </svg>
                            </button>
                          )}
                          {prop.value !== null && prop.value !== '' && (
                            <CopyButton value={String(prop.value)} label="" />
                          )}
                        </>
                      )}
                    </div>
                  </div>
                )
              })}
            </div>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  )
}

// ─── IFC Data loading hook ────────────────────────────────────────────────────

type IFCDataState =
  | { status: 'idle' }
  | { status: 'loading' }
  | { status: 'loaded'; data: IFCItemData }
  | { status: 'error' }

function useIFCItemData(
  expressId: number | null,
  modelId:   string | null | undefined,
  viewerApiRef: React.MutableRefObject<ViewerAPI | null> | undefined,
): IFCDataState {
  const [state, setState] = useState<IFCDataState>({ status: 'idle' })

  useEffect(() => {
    if (expressId === null || !viewerApiRef) {
      setState({ status: 'idle' })
      return
    }

    let cancelled = false
    setState({ status: 'loading' })

    // Pass modelId so the viewer fetches attributes from the correct model
    // when multiple IFC files are loaded simultaneously.
    viewerApiRef.current?.getItemData(expressId, modelId ?? undefined)
      .then((data) => {
        if (cancelled) return
        if (data) {
          setState({ status: 'loaded', data })
        } else {
          setState({ status: 'error' })
        }
      })
      .catch(() => {
        if (!cancelled) setState({ status: 'error' })
      })

    return () => { cancelled = true }
  }, [expressId, modelId, viewerApiRef])

  return state
}

// ─── Properties Panel ──────────────────────────────────────────────────────────

interface PropertiesPanelProps {
  selected: SelectedInfo | null
  categories: Category[]
  isolated: string | null
  viewerApiRef?: React.MutableRefObject<ViewerAPI | null>
  onFrame?: (expressId: number) => void
  onRevealInTree?: (expressId: number) => void
  onIsolate?: () => void
}

function PropertiesPanel({
  selected, categories, isolated, viewerApiRef, onFrame, onRevealInTree, onIsolate,
}: PropertiesPanelProps) {
  const { t } = useTranslation('sidebar')
  // Read raw record (stable reference) to avoid infinite-loop selector issue
  const spatialTreesRecord = useValidationStore((s) => s.spatialTrees)
  const result             = useValidationStore((s) => s.result)
  const { hiddenElements, setElementsVisible } = useUIStore()
  const { addCommand } = useEditorHistory()
  const { diffs } = useEditorStore()

  const [sections, setSections] = useState({
    location: true,
    visibility: true,
    attributes: true,
    psets: true,
    validation: true,
  })
  const toggle = (key: keyof typeof sections) =>
    setSections(s => ({ ...s, [key]: !s[key] }))

  // Property-set filter (resets whenever the selected element changes)
  const [psetQuery, setPsetQuery] = useState('')

  const expressId = selected ? parseInt(selected.id, 10) : null

  useEffect(() => { setPsetQuery('') }, [expressId])

  // Resolve the spatial tree for the selected element's model.
  // If modelId is known, use that model's tree directly.
  // Otherwise combine all trees so the Location breadcrumb still works in single-model mode.
  const spatialTree = useMemo(() => {
    if (!selected) return []
    if (selected.modelId) return spatialTreesRecord[selected.modelId] ?? []
    return Object.values(spatialTreesRecord).flat()
  }, [selected?.modelId, spatialTreesRecord])

  // ── Load real IFC data — pass modelId so the viewer targets the right model ──
  const ifcState = useIFCItemData(expressId, selected?.modelId ?? null, viewerApiRef)

  // ── Spatial path from tree (still used for Location breadcrumb) ──────────
  const spatialPath = useMemo(() => {
    if (!selected || spatialTree.length === 0) return null
    return findSpatialPath(spatialTree, parseInt(selected.id, 10))
  }, [selected, spatialTree])

  // ── Issues for this element ──────────────────────────────────────────────
  const elementIssues = useMemo(() => {
    if (!selected || !result) return []
    const id = parseInt(selected.id, 10)
    return result.issues.filter(i => i.expressId === id)
  }, [selected, result])

  // ── Pending diffs for this element ───────────────────────────────────────
  const pendingDiffs = useMemo(() => {
    if (!selected) return new Map<string, string>()
    const id = parseInt(selected.id, 10)
    const map = new Map<string, string>()
    for (const d of diffs) {
      if (d.type === 'RENAME' && d.expressId === id) {
        map.set(d.field, d.newValue)
      }
    }
    return map
  }, [selected, diffs])

  // Resolve display value: pending diff → real IFC data → synthetic fallback
  const getDisplayValue = useCallback((field: string, ifcFallback: string | null): string => {
    if (pendingDiffs.has(field)) return pendingDiffs.get(field)!
    if (ifcFallback !== null && ifcFallback !== '') return ifcFallback
    return ''
  }, [pendingDiffs])

  const handleRename = useCallback((field: 'Name' | 'LongName' | 'Description', newVal: string) => {
    if (!selected) return
    const id = parseInt(selected.id, 10)
    const currentVal = pendingDiffs.get(field) ?? (field === 'Name' ? selected.name : '')
    addCommand(buildRenameCommand(id, field, currentVal, newVal, selected.modelId))
  }, [selected, pendingDiffs, addCommand])

  const handleEditProperty = useCallback((
    psetName: string,
    propName: string,
    propExpressId: number,
    oldValue: string,
    newValue: string,
  ) => {
    if (!expressId) return
    addCommand(buildSetPropertyCommand(expressId, psetName, propName, propExpressId, oldValue, newValue, selected?.modelId))
  }, [expressId, selected, addCommand])

  if (!selected || expressId === null) {
    return (
      <div className="px-6 py-10 text-center">
        <div className="w-10 h-10 mx-auto mb-3 rounded-[10px] bg-[var(--surface-2)] flex items-center justify-center text-[var(--text-dim)] border border-[var(--border)]">
          <Icons.Isolate size={18} />
        </div>
        <div className="text-[13px] text-[var(--text-dim)] mb-1">{t('nothingSelected')}</div>
        <div className="text-[11.5px] text-[var(--text-faint)] leading-relaxed">
          {t('nothingSelectedDesc')}
        </div>
      </div>
    )
  }

  const cat = categories.find(c => c.id === selected.type || c.id === selected.type.replace('STANDARDCASE', ''))
  const catColor = cat ? `#${cat.color.toString(16).padStart(6, '0')}` : 'var(--text-dim)'
  const decompMap = useValidationStore((s) => selected?.modelId ? s.decompMaps[selected.modelId] : undefined)
  const isHidden = expressId != null && hiddenElements.has(makeHiddenKey(selected?.modelId ?? '', expressId))
  const hasDirty = pendingDiffs.size > 0
  const errorCount   = elementIssues.filter(i => i.severity === 'error').length
  const warningCount = elementIssues.filter(i => i.severity === 'warning').length

  // Resolved display values from real IFC data
  const ifcData = ifcState.status === 'loaded' ? ifcState.data : null

  // The "display name" shown in the header: prefer real IFC Name, fall back to synthetic
  const displayName = getDisplayValue('Name', ifcData?.name ?? null) || selected.name
  const displayLongName = getDisplayValue('LongName', ifcData?.longName ?? null)
  const displayDescription = getDisplayValue('Description', ifcData?.description ?? null)

  // Storey: prefer real IFC ContainedInStructure, fall back to spatial tree path
  const storeyName = ifcData?.storey
    ?? spatialPath?.find(n => n.ifcClass === 'IfcBuildingStorey')?.name
    ?? null

  const psets = ifcData?.propertySets ?? []
  const totalProps = psets.reduce((acc, ps) => acc + ps.properties.length, 0)

  // Filter psets/properties by the search query. A pset whose NAME matches keeps
  // all its props; otherwise only props matching by name or value are kept, and
  // empty psets are dropped. Cheap enough to run inline per render.
  const psetFilter = psetQuery.trim().toLowerCase()
  const filteredPsets = psetFilter
    ? psets
        .map(ps => {
          if (ps.name.toLowerCase().includes(psetFilter)) return ps
          const properties = ps.properties.filter(p =>
            p.name.toLowerCase().includes(psetFilter) ||
            String(p.value ?? '').toLowerCase().includes(psetFilter),
          )
          return { ...ps, properties }
        })
        .filter(ps => ps.properties.length > 0)
    : psets

  return (
    <motion.div
      initial={{ opacity: 0, y: 4 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.2 }}
      className="pb-4"
    >
      {/* ── Header ── */}
      <div className="px-4 pt-3.5 pb-3 border-b border-[var(--border)]">
        {/* Type badge row */}
        <div className="flex items-center gap-2 mb-2">
          <div className="w-2.5 h-2.5 rounded-[3px] shrink-0" style={{ background: catColor }} />
          <span className="font-mono text-[10px] text-[var(--text-faint)] tracking-wider uppercase">
            {selected.type}
          </span>
          {hasDirty && (
            <span className="ml-auto text-[10px] px-1.5 py-0.5 rounded-full bg-[var(--accent)] text-white font-medium leading-none">
              {t('properties.edited')}
            </span>
          )}
          {errorCount > 0 && (
            <span className="text-[10px] px-1.5 py-0.5 rounded-full bg-[#E5484D22] text-[#E5484D] border border-[#E5484D44] font-medium leading-none">
              {errorCount} err
            </span>
          )}
          {warningCount > 0 && (
            <span className="text-[10px] px-1.5 py-0.5 rounded-full bg-[#F5A62322] text-[#F5A623] border border-[#F5A62344] font-medium leading-none">
              {warningCount} warn
            </span>
          )}
          {/* IFC data loading indicator */}
          {ifcState.status === 'loading' && (
            <span className="ml-auto text-[10px] text-[var(--text-faint)] italic">{t('properties.loading')}</span>
          )}
        </div>

        {/* Name */}
        <div className="text-[15px] font-semibold tracking-tight mb-1.5 leading-snug">
          {displayName}
        </div>

        {/* Express ID + copy */}
        <div className="flex items-center gap-2">
          <span className="font-mono text-[10.5px] text-[var(--text-faint)]">#{selected.id}</span>
          <CopyButton value={selected.id} label="ID" />
          {storeyName && (
            <span className="ml-auto text-[10.5px] text-[var(--text-faint)] truncate max-w-[120px]" title={storeyName}>
              📍 {storeyName}
            </span>
          )}
        </div>

        {/* Quick actions */}
        <div className="flex gap-1.5 mt-3">
          <button
            onClick={() => onFrame?.(expressId)}
            className="flex items-center gap-1.5 h-7 px-2.5 rounded-lg bg-[var(--surface-2)] border border-[var(--border)] text-[11px] text-[var(--text-dim)] hover:text-[var(--text)] hover:border-[var(--accent)] transition-colors"
          >
            <svg width="11" height="11" viewBox="0 0 12 12" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round">
              <rect x="1" y="1" width="4" height="4" rx="0.5" />
              <rect x="7" y="1" width="4" height="4" rx="0.5" />
              <rect x="1" y="7" width="4" height="4" rx="0.5" />
              <rect x="7" y="7" width="4" height="4" rx="0.5" />
            </svg>
            {t('actions.frame')}
          </button>
          {(() => {
            const isIsolated = isolated === selected.type
            return (
              <button
                onClick={() => onIsolate?.()}
                className={`flex items-center gap-1.5 h-7 px-2.5 rounded-lg border text-[11px] transition-colors ${
                  isIsolated
                    ? 'bg-[var(--accent)] border-[var(--accent)] text-white hover:brightness-110'
                    : 'bg-[var(--surface-2)] border-[var(--border)] text-[var(--text-dim)] hover:text-[var(--text)] hover:border-[var(--accent)]'
                }`}
                title={isIsolated ? t('actions.clearIsolation') : t('actions.isolate')}
              >
                <Icons.Isolate size={11} />
                {isIsolated ? t('actions.clearIsolation') : t('actions.isolate')}
              </button>
            )
          })()}
          <button
            onClick={() => onRevealInTree?.(expressId)}
            className="flex items-center gap-1.5 h-7 px-2.5 rounded-lg bg-[var(--surface-2)] border border-[var(--border)] text-[11px] text-[var(--text-dim)] hover:text-[var(--text)] hover:border-[var(--accent)] transition-colors"
            title={t('actions.revealInTree')}
          >
            <svg width="11" height="11" viewBox="0 0 12 12" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round">
              <path d="M1 2h2M1 6h4M1 10h2" />
              <circle cx="9" cy="6" r="3" />
              <path d="M11 8l1.5 1.5" />
            </svg>
            {t('actions.revealInTree')}
          </button>
          <button
            onClick={() => setElementsVisible(expandWithDecomp(expressId!, decompMap), isHidden, selected?.modelId ?? '')}
            className={`flex items-center gap-1.5 h-7 px-2.5 rounded-lg border text-[11px] transition-colors ${
              isHidden
                ? 'bg-[var(--accent)] border-[var(--accent)] text-white'
                : 'bg-[var(--surface-2)] border-[var(--border)] text-[var(--text-dim)] hover:text-[var(--text)] hover:border-[var(--accent)]'
            }`}
          >
            {isHidden ? <Icons.EyeOff size={11} /> : <Icons.Eye size={11} />}
            {isHidden ? t('actions.show') : t('actions.hide')}
          </button>
        </div>
      </div>

      {/* ── Location ── */}
      <div className="border-b border-[var(--border)]">
        <SectionHeader label={t('properties.location')} open={sections.location} onToggle={() => toggle('location')} />
        <AnimatePresence initial={false}>
          {sections.location && (
            <motion.div initial={{ height: 0 }} animate={{ height: 'auto' }} exit={{ height: 0 }} transition={{ duration: 0.15 }} style={{ overflow: 'hidden' }}>
              <div className="px-4 pb-3">
                {spatialPath && spatialPath.length > 0 ? (
                  <div className="flex flex-wrap items-center gap-1">
                    {spatialPath.map((node, idx) => {
                      const color = CLASS_COLOR[node.ifcClass] ?? 'var(--text-faint)'
                      return (
                        <React.Fragment key={node.expressId}>
                          <button
                            onClick={() => onRevealInTree?.(node.expressId)}
                            className="flex items-center gap-1 px-1.5 py-0.5 rounded text-[11px] hover:bg-[var(--surface-2)] transition-colors"
                            style={{ color }}
                            title={`Go to ${node.name}`}
                          >
                            <span className="font-mono text-[9px] opacity-60 uppercase">
                              {node.ifcClass.replace('Ifc', '')}
                            </span>
                            <span className="truncate max-w-[80px]">{node.name || `#${node.expressId}`}</span>
                          </button>
                          {idx < spatialPath.length - 1 && (
                            <svg width="5" height="8" viewBox="0 0 5 8" fill="currentColor" className="text-[var(--text-faint)] shrink-0">
                              <path d="M0.5 0.5L4 4L0.5 7.5" stroke="currentColor" fill="none" strokeWidth="1" strokeLinecap="round" />
                            </svg>
                          )}
                        </React.Fragment>
                      )
                    })}
                  </div>
                ) : (
                  <span className="text-[11.5px] text-[var(--text-faint)] italic">
                    {t('properties.notInTree')}
                  </span>
                )}

                {/* Category */}
                <div className="mt-2 flex items-center gap-2">
                  <span className="text-[11px] text-[var(--text-dim)]">{t('properties.category')}</span>
                  <div className="flex items-center gap-1.5">
                    <div className="w-2 h-2 rounded-sm" style={{ background: catColor }} />
                    <span className="text-[11.5px] text-[var(--text)]">
                      {IFC_DISPLAY_NAMES[selected.type] ?? prettyType(selected.type)}
                    </span>
                    <span className="text-[10px] font-mono text-[var(--text-faint)]">
                      ({cat?.count ?? '—'})
                    </span>
                  </div>
                </div>
              </div>
            </motion.div>
          )}
        </AnimatePresence>
      </div>

      {/* ── Visibility ── */}
      <div className="border-b border-[var(--border)]">
        <SectionHeader label={t('properties.visibility')} open={sections.visibility} onToggle={() => toggle('visibility')} />
        <AnimatePresence initial={false}>
          {sections.visibility && (
            <motion.div initial={{ height: 0 }} animate={{ height: 'auto' }} exit={{ height: 0 }} transition={{ duration: 0.15 }} style={{ overflow: 'hidden' }}>
              <div className="px-4 pb-3 flex items-center justify-between">
                <div className="flex items-center gap-2">
                  <div className="w-2 h-2 rounded-full" style={{ background: isHidden ? '#E5484D' : '#30A46C' }} />
                  <span className="text-[12px] text-[var(--text)]">{isHidden ? t('properties.hidden') : t('properties.visible')}</span>
                </div>
                <button
                  onClick={() => setElementsVisible(expandWithDecomp(expressId!, decompMap), isHidden, selected?.modelId ?? '')}
                  className={`h-6 px-2.5 rounded-md text-[11px] font-medium transition-colors border ${
                    isHidden
                      ? 'bg-[#30A46C22] border-[#30A46C44] text-[#30A46C] hover:bg-[#30A46C33]'
                      : 'bg-[#E5484D22] border-[#E5484D44] text-[#E5484D] hover:bg-[#E5484D33]'
                  }`}
                >
                  {isHidden ? t('actions.showElement') : t('actions.hideElement')}
                </button>
              </div>
            </motion.div>
          )}
        </AnimatePresence>
      </div>

      {/* ── IFC Attributes ── */}
      <div className="border-b border-[var(--border)]">
        <SectionHeader label={t('properties.ifcAttributes')} open={sections.attributes} onToggle={() => toggle('attributes')} />
        <AnimatePresence initial={false}>
          {sections.attributes && (
            <motion.div initial={{ height: 0 }} animate={{ height: 'auto' }} exit={{ height: 0 }} transition={{ duration: 0.15 }} style={{ overflow: 'hidden' }}>
              <div className="pb-2">
                {/* Editable fields — use real IFC data as initial value */}
                <EditableField
                  label="Name"
                  value={getDisplayValue('Name', ifcData?.name ?? null) || selected.name}
                  isDirty={pendingDiffs.has('Name')}
                  onCommit={v => handleRename('Name', v)}
                />
                <EditableField
                  label="LongName"
                  value={displayLongName}
                  isDirty={pendingDiffs.has('LongName')}
                  onCommit={v => handleRename('LongName', v)}
                />
                <EditableField
                  label="Description"
                  value={displayDescription}
                  isDirty={pendingDiffs.has('Description')}
                  onCommit={v => handleRename('Description', v)}
                />

                {/* Read-only IFC fields */}
                <div className="flex items-baseline px-4 py-1">
                  <div className="w-[38%] flex-shrink-0 text-[11px] text-[var(--text-dim)]">Type</div>
                  <div className="flex-1 flex items-center gap-1.5">
                    <span className="text-[12px] text-[var(--text)]">{selected.type}</span>
                    <CopyButton value={selected.type} />
                  </div>
                </div>

                <div className="flex items-baseline px-4 py-1">
                  <div className="w-[38%] flex-shrink-0 text-[11px] text-[var(--text-dim)]">Express ID</div>
                  <div className="flex-1 flex items-center gap-1.5">
                    <span className="font-mono text-[12px] text-[var(--text)]">{selected.id}</span>
                    <CopyButton value={selected.id} />
                  </div>
                </div>

                {/* Real IFC read-only attributes (when loaded) */}
                {ifcData?.globalId && (
                  <div className="flex items-baseline px-4 py-1">
                    <div className="w-[38%] flex-shrink-0 text-[11px] text-[var(--text-dim)]">GlobalId</div>
                    <div className="flex-1 flex items-center gap-1 min-w-0">
                      <span
                        className="font-mono text-[11px] text-[var(--text)] truncate flex-1"
                        title={ifcData.globalId}
                      >
                        {ifcData.globalId}
                      </span>
                      <CopyButton value={ifcData.globalId} />
                    </div>
                  </div>
                )}

                <ReadOnlyField label="ObjectType" value={ifcData?.objectType ?? null} />
                <ReadOnlyField label="Tag" value={ifcData?.tag ?? null} />

                {/* Dirty indicator + undo tip */}
                {hasDirty && (
                  <div className="mx-4 mt-2 px-2.5 py-1.5 rounded-lg bg-[var(--accent)] bg-opacity-10 border border-[var(--accent)] border-opacity-30 flex items-center gap-2">
                    <svg width="11" height="11" viewBox="0 0 12 12" fill="none" stroke="var(--accent-2)" strokeWidth="1.5" strokeLinecap="round">
                      <circle cx="6" cy="6" r="5" />
                      <path d="M6 4v3M6 8.5v.5" />
                    </svg>
                    <span className="text-[10.5px] text-[var(--accent-2)]">
                      {t('properties.unsavedChanges', { count: pendingDiffs.size })}
                    </span>
                  </div>
                )}

                {/* IFC data load error notice */}
                {ifcState.status === 'error' && (
                  <div className="mx-4 mt-2 px-2.5 py-1.5 rounded-lg bg-[#F5A62312] border border-[#F5A62330] flex items-center gap-2">
                    <span className="text-[10.5px] text-[#F5A623]">{t('properties.loadError')}</span>
                  </div>
                )}
              </div>
            </motion.div>
          )}
        </AnimatePresence>
      </div>

      {/* ── Property Sets ── */}
      {(psets.length > 0 || ifcState.status === 'loading') && (
        <div className="border-b border-[var(--border)]">
          <SectionHeader
            label={t('properties.psets')}
            open={sections.psets}
            onToggle={() => toggle('psets')}
            badge={psets.length > 0 ? totalProps : undefined}
          />
          <AnimatePresence initial={false}>
            {sections.psets && (
              <motion.div
                initial={{ height: 0 }} animate={{ height: 'auto' }} exit={{ height: 0 }}
                transition={{ duration: 0.15 }}
                style={{ overflow: 'hidden' }}
              >
                {ifcState.status === 'loading' ? (
                  <div className="px-4 pb-3 flex items-center gap-2 text-[var(--text-faint)]">
                    <svg width="12" height="12" viewBox="0 0 12 12" fill="none" className="animate-spin shrink-0">
                      <circle cx="6" cy="6" r="4.5" stroke="currentColor" strokeWidth="1.5" strokeOpacity="0.3" />
                      <path d="M6 1.5A4.5 4.5 0 0110.5 6" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" />
                    </svg>
                    <span className="text-[11.5px] italic">{t('properties.loadingPsets')}</span>
                  </div>
                ) : (
                  <div className="pt-1 pb-2">
                    {totalProps > 6 && (
                      <div className="px-4 pb-2 pt-0.5">
                        <div className="relative">
                          <svg
                            width="11" height="11" viewBox="0 0 12 12" fill="none"
                            stroke="currentColor" strokeWidth="1.5" strokeLinecap="round"
                            className="absolute left-2 top-1/2 -translate-y-1/2 text-[var(--text-faint)] pointer-events-none"
                          >
                            <circle cx="5" cy="5" r="3.5" />
                            <path d="M8 8l2.5 2.5" />
                          </svg>
                          <input
                            value={psetQuery}
                            onChange={e => setPsetQuery(e.target.value)}
                            onKeyDown={e => { if (e.key === 'Escape') { e.stopPropagation(); setPsetQuery('') } }}
                            placeholder={t('properties.filterProps')}
                            className="w-full h-7 pl-7 pr-7 text-[11.5px] bg-[var(--surface-2)] border border-[var(--border)] rounded-lg text-[var(--text)] outline-none focus:border-[var(--accent)] transition-colors placeholder:text-[var(--text-faint)]"
                          />
                          {psetQuery && (
                            <button
                              onClick={() => setPsetQuery('')}
                              className="absolute right-1.5 top-1/2 -translate-y-1/2 p-0.5 rounded text-[var(--text-faint)] hover:text-[var(--text)] hover:bg-[var(--border)]"
                              title="Clear"
                            >
                              <svg width="10" height="10" viewBox="0 0 12 12" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round">
                                <path d="M3 3l6 6M9 3l-6 6" />
                              </svg>
                            </button>
                          )}
                        </div>
                      </div>
                    )}
                    {filteredPsets.length === 0 ? (
                      <div className="px-4 py-2 text-[11.5px] text-[var(--text-faint)] italic">
                        {t('properties.noPropsMatch')}
                      </div>
                    ) : (
                      filteredPsets.map((pset) => (
                        <PsetRow
                          // Key by element + pset name so edit/expand state never
                          // leaks across element selections (each element remounts).
                          key={`${expressId}:${pset.name}`}
                          pset={pset}
                          elementExpressId={expressId ?? 0}
                          onEditProperty={handleEditProperty}
                          forceOpen={psetQuery.trim().length > 0}
                        />
                      ))
                    )}
                  </div>
                )}
              </motion.div>
            )}
          </AnimatePresence>
        </div>
      )}

      {/* ── Validation ── */}
      {elementIssues.length > 0 && (
        <div className="border-b border-[var(--border)]">
          <SectionHeader
            label={t('validation.issueCount', { count: elementIssues.length })}
            open={sections.validation}
            onToggle={() => toggle('validation')}
          />
          <AnimatePresence initial={false}>
            {sections.validation && (
              <motion.div initial={{ height: 0 }} animate={{ height: 'auto' }} exit={{ height: 0 }} transition={{ duration: 0.15 }} style={{ overflow: 'hidden' }}>
                <div className="pt-1 pb-1">
                  {elementIssues.map(issue => (
                    <IssuePill key={issue.id} issue={issue} />
                  ))}
                </div>
              </motion.div>
            )}
          </AnimatePresence>
        </div>
      )}
    </motion.div>
  )
}

// ─── Category Panel ─────────────────────────────────────────────────────────────

const MAX_VISIBLE = 80

function MoreElementsText({ count }: { count: number }) {
  const { t } = useTranslation('sidebar')
  return (
    <div className="px-2.5 py-1 text-[11px] text-[var(--text-faint)] italic">
      {t('categories.moreElements', { count })}
    </div>
  )
}

function CategoryRow({
  cat, isHidden, isIsolated, isExpanded,
  nameMap, onToggleHidden, onSetIsolated, onFrame, onToggleExpand, onSelectElement, onFrameElement,
}: {
  cat: Category
  isHidden: boolean
  isIsolated: boolean
  isExpanded: boolean
  nameMap: Map<number, string>
  onToggleHidden: (id: string) => void
  onSetIsolated: (id: string | null) => void
  onFrame: (id: string) => void
  onToggleExpand: (id: string) => void
  onSelectElement?: (expressId: number) => void
  onFrameElement?: (expressId: number) => void
}) {
  const hexColor = `#${cat.color.toString(16).padStart(6, '0')}`
  const hasElem  = cat.elementIds.length > 0
  const visible  = cat.elementIds.slice(0, MAX_VISIBLE)
  const overflow = cat.elementIds.length - MAX_VISIBLE

  return (
    <>
      <div
        className="flex items-center gap-2 px-2 py-1.5 text-[12.5px] group transition-colors"
        style={{
          background:  isIsolated ? 'rgba(94,106,210,0.08)' : undefined,
          borderLeft:  isIsolated ? '2px solid var(--accent)' : '2px solid transparent',
          opacity:     isHidden   ? 0.45 : 1,
        }}
      >
        <button
          onClick={() => hasElem && onToggleExpand(cat.id)}
          className={`w-4 h-4 flex items-center justify-center transition-transform shrink-0
            ${hasElem ? 'text-[var(--text-faint)] hover:text-[var(--text)] cursor-pointer' : 'opacity-0 pointer-events-none'}`}
          style={{ transform: isExpanded ? 'rotate(90deg)' : 'rotate(0deg)' }}
        >
          <svg width="7" height="7" viewBox="0 0 8 8" fill="currentColor">
            <path d="M2.5 0L6.5 4L2.5 8L1.5 7L4.5 4L1.5 1Z" />
          </svg>
        </button>

        <button
          onClick={() => onSetIsolated(isIsolated ? null : cat.id)}
          className="w-2.5 h-2.5 rounded-[3px] shrink-0 hover:scale-125 transition-transform cursor-pointer"
          style={{ background: hexColor, boxShadow: '0 0 0 1px rgba(0,0,0,0.4) inset' }}
          title={isIsolated ? 'Clear isolation' : 'Isolate category'}
        />

        <span
          className="flex-1 text-[var(--text)] cursor-pointer truncate hover:text-[var(--accent-2)] transition-colors"
          onClick={() => onFrame(cat.id)}
          title="Frame in 3D view"
        >
          {cat.label}
        </span>

        <span className="font-mono text-[11px] text-[var(--text-faint)] shrink-0">{cat.count}</span>

        <button
          onClick={e => { e.stopPropagation(); onToggleHidden(cat.id) }}
          className="p-0.5 rounded text-[var(--text-dim)] hover:bg-[var(--border)] shrink-0"
          title={isHidden ? 'Show' : 'Hide'}
        >
          {isHidden ? <Icons.EyeOff size={14} /> : <Icons.Eye size={14} />}
        </button>
      </div>

      <AnimatePresence initial={false}>
        {isExpanded && (
          <motion.div
            initial={{ height: 0, opacity: 0 }}
            animate={{ height: 'auto', opacity: 1 }}
            exit={{ height: 0, opacity: 0 }}
            transition={{ duration: 0.18, ease: 'easeInOut' }}
            style={{ overflow: 'hidden' }}
          >
            <div className="ml-8 mr-2 mb-1 rounded-lg border border-[var(--border)] overflow-y-auto" style={{ maxHeight: 180 }}>
              {visible.map(eid => {
                const name = nameMap.get(eid) ?? `#${eid}`
                return (
                  <button
                    key={eid}
                    onClick={() => { onSelectElement?.(eid); onFrameElement?.(eid) }}
                    className="w-full flex items-center gap-2 px-2.5 py-1 text-left hover:bg-[var(--surface-2)] transition-colors group/elem"
                  >
                    <span className="w-1.5 h-1.5 rounded-full shrink-0" style={{ background: hexColor, opacity: 0.7 }} />
                    <span className="flex-1 truncate text-[11.5px] text-[var(--text-dim)] group-hover/elem:text-[var(--text)]">{name}</span>
                    <span className="font-mono text-[9.5px] text-[var(--text-faint)] shrink-0 opacity-0 group-hover/elem:opacity-100">{eid}</span>
                  </button>
                )
              })}
              {overflow > 0 && (
                <MoreElementsText count={overflow} />
              )}
            </div>
          </motion.div>
        )}
      </AnimatePresence>
    </>
  )
}

function CategoryPanel({
  categories, elementCount, hidden, onToggleHidden,
  isolated, onSetIsolated, onFrame, onSelectElement, onFrameElement,
}: {
  categories: Category[]
  elementCount: number
  hidden: Set<string>
  onToggleHidden: (id: string) => void
  isolated: string | null
  onSetIsolated: (id: string | null) => void
  onFrame: (id: string) => void
  onSelectElement?: (expressId: number) => void
  onFrameElement?: (expressId: number) => void
}) {
  const { t } = useTranslation('sidebar')
  // Combine all loaded models' trees so element names resolve correctly
  // regardless of which model they belong to.
  const spatialTreesRecord = useValidationStore((s) => s.spatialTrees)
  const allNodes = useMemo(
    () => Object.values(spatialTreesRecord).flat(),
    [spatialTreesRecord],
  )
  const nameMap = useMemo(() => buildNameMap(allNodes), [allNodes])
  const [expanded, setExpanded] = useState<Set<string>>(new Set())
  const [query, setQuery] = useState('')
  const toggleExpand = useCallback((id: string) => {
    setExpanded(prev => {
      const next = new Set(prev)
      next.has(id) ? next.delete(id) : next.add(id)
      return next
    })
  }, [])

  // Prune expanded ids that no longer exist (e.g. after switching active model
  // or removing one), so stale state can't keep phantom rows open.
  const catIds = useMemo(() => new Set(categories.map(c => c.id)), [categories])
  useEffect(() => {
    setExpanded(prev => {
      const next = new Set([...prev].filter(id => catIds.has(id)))
      return next.size === prev.size ? prev : next
    })
  }, [catIds])

  const q = query.trim().toLowerCase()
  const filtered = useMemo(
    () => (q ? categories.filter(c => c.label.toLowerCase().includes(q) || c.id.toLowerCase().includes(q)) : categories),
    [categories, q],
  )
  const hiddenCount = useMemo(() => categories.reduce((n, c) => n + (hidden.has(c.id) ? 1 : 0), 0), [categories, hidden])

  // Bulk visibility. handleToggleHidden in the parent uses a functional update,
  // so these looped calls batch into a single render.
  const showAll = useCallback(() => {
    categories.forEach(c => { if (hidden.has(c.id)) onToggleHidden(c.id) })
  }, [categories, hidden, onToggleHidden])
  const hideAll = useCallback(() => {
    categories.forEach(c => { if (!hidden.has(c.id)) onToggleHidden(c.id) })
  }, [categories, hidden, onToggleHidden])

  // Isolating or framing a hidden category would otherwise show nothing —
  // un-hide it first so the action is never a dead no-op.
  const handleIsolate = useCallback((id: string | null) => {
    if (id && hidden.has(id)) onToggleHidden(id)
    onSetIsolated(id)
  }, [hidden, onToggleHidden, onSetIsolated])
  const handleFrame = useCallback((id: string) => {
    if (hidden.has(id)) onToggleHidden(id)
    onFrame(id)
  }, [hidden, onToggleHidden, onFrame])

  if (categories.length === 0) {
    return (
      <div className="px-6 py-10 text-center text-[var(--text-faint)]">
        <div className="text-[13px] text-[var(--text-dim)] mb-1">{t('categories.noModel')}</div>
        <div className="text-[11.5px]">{t('categories.noModelDesc')}</div>
      </div>
    )
  }

  return (
    <div className="py-2">
      <div className="px-3.5 pt-1 pb-2 flex items-start justify-between gap-2">
        <div className="min-w-0">
          <div className="text-[11.5px] font-semibold text-[var(--text-dim)] uppercase tracking-[0.06em]">{t('categories.title')}</div>
          <div className="text-[11px] text-[var(--text-faint)] mt-0.5">
            {t('categories.types', { count: categories.length })} · {t('categories.elements', { count: elementCount })}
            {hiddenCount > 0 && <span className="text-[var(--text-dim)]"> · {t('categories.hiddenCount', { count: hiddenCount })}</span>}
          </div>
        </div>
        {isolated && (
          <button onClick={() => onSetIsolated(null)} className="text-[11px] text-[var(--accent-2)] shrink-0 hover:underline">
            {t('categories.clearIsolation')}
          </button>
        )}
      </div>

      {/* Controls: filter + bulk visibility */}
      <div className="px-3.5 pb-2 space-y-2">
        {categories.length > 4 && (
          <div className="relative">
            <svg
              width="11" height="11" viewBox="0 0 12 12" fill="none"
              stroke="currentColor" strokeWidth="1.5" strokeLinecap="round"
              className="absolute left-2 top-1/2 -translate-y-1/2 text-[var(--text-faint)] pointer-events-none"
            >
              <circle cx="5" cy="5" r="3.5" />
              <path d="M8 8l2.5 2.5" />
            </svg>
            <input
              value={query}
              onChange={e => setQuery(e.target.value)}
              onKeyDown={e => { if (e.key === 'Escape') { e.stopPropagation(); setQuery('') } }}
              placeholder={t('categories.filterPlaceholder')}
              className="w-full h-7 pl-7 pr-7 text-[11.5px] bg-[var(--surface-2)] border border-[var(--border)] rounded-lg text-[var(--text)] outline-none focus:border-[var(--accent)] transition-colors placeholder:text-[var(--text-faint)]"
            />
            {query && (
              <button
                onClick={() => setQuery('')}
                className="absolute right-1.5 top-1/2 -translate-y-1/2 p-0.5 rounded text-[var(--text-faint)] hover:text-[var(--text)] hover:bg-[var(--border)]"
                title="Clear"
              >
                <svg width="10" height="10" viewBox="0 0 12 12" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round">
                  <path d="M3 3l6 6M9 3l-6 6" />
                </svg>
              </button>
            )}
          </div>
        )}
        <div className="flex items-center gap-1.5">
          <button
            onClick={showAll}
            disabled={hiddenCount === 0}
            className="flex-1 h-6 rounded-md text-[10.5px] font-medium border border-[var(--border)] text-[var(--text-dim)] hover:text-[var(--text)] hover:border-[var(--border-strong)] disabled:opacity-40 disabled:pointer-events-none transition-colors"
          >
            {t('categories.showAll')}
          </button>
          <button
            onClick={hideAll}
            disabled={hiddenCount === categories.length}
            className="flex-1 h-6 rounded-md text-[10.5px] font-medium border border-[var(--border)] text-[var(--text-dim)] hover:text-[var(--text)] hover:border-[var(--border-strong)] disabled:opacity-40 disabled:pointer-events-none transition-colors"
          >
            {t('categories.hideAll')}
          </button>
        </div>
      </div>

      <div>
        {filtered.length === 0 ? (
          <div className="px-4 py-6 text-center text-[11.5px] text-[var(--text-faint)] italic">
            {t('categories.noMatches')}
          </div>
        ) : (
          filtered.map(cat => (
            <CategoryRow
              key={cat.id}
              cat={cat}
              isHidden={hidden.has(cat.id)}
              isIsolated={isolated === cat.id}
              isExpanded={expanded.has(cat.id)}
              nameMap={nameMap}
              onToggleHidden={onToggleHidden}
              onSetIsolated={handleIsolate}
              onFrame={handleFrame}
              onToggleExpand={toggleExpand}
              onSelectElement={onSelectElement}
              onFrameElement={onFrameElement}
            />
          ))
        )}
      </div>
    </div>
  )
}

// ─── Takeoff Panel ──────────────────────────────────────────────────────────────

function TakeoffPanel() {
  const { t } = useTranslation('sidebar')
  const sceneModels = useSceneStore((s) => s.models)
  const activeModelId = useSceneStore((s) => s.activeModelId)

  // Default to the active scene model; fall back to first loaded
  const [selectedModelId, setSelectedModelId] = React.useState<string | null>(null)
  const modelId = selectedModelId ?? activeModelId ?? sceneModels[0]?.id ?? ''

  const groups    = useTakeoffStore(selectTakeoffGroups(modelId))
  const status    = useTakeoffStore(selectTakeoffStatus(modelId))
  const isRunning = status === 'running'

  // Auto-select active model when it changes and we haven't pinned a choice
  React.useEffect(() => {
    if (!selectedModelId && activeModelId) setSelectedModelId(activeModelId)
  }, [activeModelId, selectedModelId])

  const modelSelector = sceneModels.length > 1 ? (
    <div className="flex items-center gap-1 px-3 py-1.5 border-b border-[var(--border)] overflow-x-auto">
      {sceneModels.map((m) => (
        <button
          key={m.id}
          onClick={() => setSelectedModelId(m.id)}
          className={`shrink-0 px-2 h-5 rounded text-[10px] font-medium transition-colors ${
            m.id === modelId
              ? 'bg-[var(--surface-2)] text-[var(--text)] border border-[var(--border)]'
              : 'text-[var(--text-faint)] hover:text-[var(--text-dim)]'
          }`}
        >
          {m.fileName.replace(/\.ifc$/i, '')}
        </button>
      ))}
    </div>
  ) : null

  if (!modelId) {
    return (
      <div className="px-6 py-10 text-center text-[var(--text-faint)] text-[12px]">
        {t('takeoff.noModel')}
      </div>
    )
  }

  if (status === 'idle') {
    return (
      <div>
        {modelSelector}
        <div className="px-6 py-8 text-center">
          <div className="w-10 h-10 mx-auto mb-3 rounded-[10px] bg-[var(--surface-2)] flex items-center justify-center text-[var(--text-dim)]">
            <svg width="18" height="18" viewBox="0 0 16 16" fill="currentColor">
              <path d="M1 14h2V8H1v6zm4 0h2V4H5v10zm4 0h2V6H9v8zm4 0h2V2h-2v12z" opacity="0.8"/>
            </svg>
          </div>
          <div className="text-[13px] text-[var(--text-dim)] mb-1">{t('takeoff.title')}</div>
          <div className="text-[11.5px] text-[var(--text-faint)] leading-relaxed mb-4">
            {t('takeoff.description')}
          </div>
          <button
            onClick={() => void computeTakeoff(modelId)}
            className="px-3.5 py-1.5 rounded-lg bg-[var(--surface-2)] border border-[var(--border)] text-[12px] text-[var(--text-dim)] hover:text-[var(--text)] hover:border-[var(--border-strong)] transition-colors"
          >
            {t('takeoff.computeQuantities')}
          </button>
        </div>
      </div>
    )
  }

  if (isRunning) {
    return (
      <div>
        {modelSelector}
        <div className="px-6 py-10 text-center text-[var(--text-faint)]">
          <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"
            strokeLinecap="round" className="animate-spin mx-auto mb-3 opacity-50">
            <circle cx="12" cy="12" r="10" strokeOpacity="0.25" />
            <path d="M12 2a10 10 0 0 1 7.07 2.93" />
          </svg>
          <div className="text-[12px]">{t('takeoff.running')}</div>
        </div>
      </div>
    )
  }

  if (status === 'error') {
    return (
      <div>
        {modelSelector}
        <div className="px-6 py-8 text-center">
          <div className="text-[12px] text-[var(--danger)] mb-3">{t('takeoff.failed')}</div>
          <button
            onClick={() => void computeTakeoff(modelId)}
            className="px-3.5 py-1.5 rounded-lg bg-[var(--surface-2)] border border-[var(--border)] text-[12px] text-[var(--text-dim)] hover:text-[var(--text)] transition-colors"
          >
            {t('takeoff.retry')}
          </button>
        </div>
      </div>
    )
  }

  if (groups.length === 0) {
    return (
      <div>
        {modelSelector}
        <div className="px-6 py-8 text-center text-[var(--text-faint)] text-[12px]">
          {t('takeoff.noData')}
          <br />{t('takeoff.noDataIfc')}
        </div>
      </div>
    )
  }

  const hasQuantities = groups.some(g => g.quantities.length > 0)

  return (
    <div className="py-2">
      {modelSelector}
      <div className="px-3.5 pt-1 pb-2.5 flex items-center justify-between">
        <div>
          <div className="text-[11.5px] font-semibold text-[var(--text-dim)] uppercase tracking-[0.06em]">{t('takeoff.title')}</div>
          <div className="text-[11px] text-[var(--text-faint)] mt-0.5">{t('takeoff.classes', { count: groups.length })}</div>
        </div>
        <button
          onClick={() => void computeTakeoff(modelId)}
          title={t('takeoff.refresh')}
          className="text-[11px] text-[var(--text-faint)] hover:text-[var(--text-dim)] transition-colors"
        >
          {t('takeoff.refresh')}
        </button>
      </div>

      <div className="divide-y divide-[var(--border)]">
        {groups.map((g: TakeoffGroup) => (
          <div key={g.ifcClass} className="px-3.5 py-2.5 hover:bg-[var(--surface-2)] transition-colors">
            <div className="flex items-baseline justify-between gap-2 mb-1">
              <span className="text-[12.5px] font-medium text-[var(--text)]">{g.label}</span>
              <span className="text-[11px] font-mono text-[var(--text-dim)] shrink-0">{g.count.toLocaleString()}</span>
            </div>
            {g.quantities.length > 0 ? (
              <div className="space-y-0.5">
                {g.quantities.map((q) => (
                  <div key={q.name} className="flex justify-between text-[11px]">
                    <span className="text-[var(--text-faint)] truncate pr-2">{q.name}</span>
                    <span className="font-mono text-[var(--text-dim)] shrink-0">
                      {q.value.toLocaleString(undefined, { maximumFractionDigits: 1 })}
                      {q.unit && <span className="text-[var(--text-faint)] ml-0.5">{q.unit}</span>}
                    </span>
                  </div>
                ))}
              </div>
            ) : (
              hasQuantities && (
                <div className="text-[11px] text-[var(--text-faint)]">{t('takeoff.noQuantityData')}</div>
              )
            )}
          </div>
        ))}
      </div>
    </div>
  )
}

// ─── Main Sidebar ───────────────────────────────────────────────────────────────

interface SidebarProps {
  categories: Category[]
  elementCount: number
  selected: SelectedInfo | null
  hidden: Set<string>
  onToggleHidden: (id: string) => void
  isolated: string | null
  onSetIsolated: (id: string | null) => void
  onFrame: (id: string) => void
  onSelectElement?: (expressId: number) => void
  onFrameElement?: (expressId: number) => void
  /** Called when user clicks "Reveal in tree" — parent should expand tree & scroll */
  onRevealInTree?: (expressId: number) => void
  /** ViewerAPI ref — used to fetch real IFC data for the selected element */
  viewerApiRef?: React.MutableRefObject<ViewerAPI | null>
  /** Mobile-only: whether the drawer is open (ignored on md+ where it's always visible) */
  mobileOpen?: boolean
  /** Mobile-only: called when user taps close button or backdrop */
  onMobileClose?: () => void
}

export default function Sidebar({
  categories, elementCount, selected, hidden, onToggleHidden,
  isolated, onSetIsolated, onFrame, onSelectElement, onFrameElement,
  onRevealInTree, viewerApiRef, mobileOpen = false, onMobileClose,
}: SidebarProps) {
  const { t } = useTranslation('sidebar')
  const [tab, setTab] = useState<'props' | 'cats' | 'qty'>('props')
  const [desktopCollapsed, setDesktopCollapsed] = useState(false)

  useEffect(() => { if (selected) setTab('props') }, [selected])

  // Close mobile drawer when user navigates to tree
  const handleRevealInTree = useCallback((id: number) => {
    onRevealInTree?.(id)
    onMobileClose?.()
  }, [onRevealInTree, onMobileClose])

  const handleFrame = useCallback((id: number) => {
    onFrameElement?.(id)
  }, [onFrameElement])

  const handleIsolate = useCallback(() => {
    if (!selected) return
    onSetIsolated(isolated === selected.type ? null : selected.type)
  }, [selected, isolated, onSetIsolated])

  return (
    <>
      {/* Desktop: expand button — visible only when sidebar is collapsed */}
      <AnimatePresence>
        {desktopCollapsed && (
          <motion.button
            initial={{ opacity: 0, x: 8 }}
            animate={{ opacity: 1, x: 0 }}
            exit={{ opacity: 0, x: 8 }}
            transition={{ duration: 0.18 }}
            onClick={() => setDesktopCollapsed(false)}
            title={t('actions.showPanel')}
            className="hidden md:flex absolute top-[68px] right-3 z-[9] glass border border-[var(--border)] rounded-xl w-8 h-8 items-center justify-center text-[var(--text-dim)] hover:text-[var(--text)] transition-colors pointer-events-auto"
          >
            <svg width="12" height="12" viewBox="0 0 14 14" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round">
              <path d="M9 2L4 7l5 5" />
            </svg>
          </motion.button>
        )}
      </AnimatePresence>

      <motion.div
        // Only fade opacity — NO x/y transform from Framer Motion.
        // The mobile drawer translate is handled entirely by CSS classes so that
        // Framer's inline `transform` style doesn't override Tailwind's translate-x-*.
        // Desktop collapse also uses CSS classes (translate-x) for the same reason.
        initial={{ opacity: 0 }}
        animate={{ opacity: 1 }}
        transition={{ duration: 0.3, ease: 'easeOut' }}
        // Desktop (md+): absolute floating panel anchored top-right of viewer
        // Mobile (<md): fixed full-height drawer from right edge
        className={[
          // Shared
          'glass border border-[var(--border)] flex flex-col overflow-hidden',
          // Desktop
          'md:absolute md:top-[68px] md:right-3 md:bottom-3 md:w-[340px] md:rounded-xl md:z-[9]',
          // Mobile: full-height drawer from the right edge
          'max-md:fixed max-md:right-0 max-md:top-0 max-md:bottom-0 max-md:w-full max-md:max-w-[360px] max-md:z-[19] max-md:rounded-l-2xl',
          // Mobile slide animation (CSS transition, not FM transform)
          'max-md:transition-transform max-md:duration-300 max-md:ease-[cubic-bezier(0.32,0.72,0,1)]',
          mobileOpen ? 'max-md:translate-x-0' : 'max-md:translate-x-full',
          // Desktop collapse: slide off to the right (CSS transition, not FM)
          'md:transition-transform md:duration-[220ms] md:ease-[cubic-bezier(0.32,0.72,0,1)]',
          desktopCollapsed ? 'md:translate-x-[calc(100%+12px)] md:pointer-events-none' : 'md:translate-x-0',
        ].join(' ')}
        style={{ WebkitBackfaceVisibility: 'hidden' }}
      >
      {/* Mobile close bar */}
      <div className="md:hidden flex items-center justify-between px-4 pt-safe h-12 border-b border-[var(--border)] shrink-0"
        style={{ paddingTop: `max(16px, env(safe-area-inset-top))` }}
      >
        <span className="text-[13px] font-semibold text-[var(--text)]">{t('panel')}</span>
        <button
          onClick={onMobileClose}
          className="w-9 h-9 flex items-center justify-center rounded-lg text-[var(--text-dim)] hover:text-[var(--text)] hover:bg-[var(--surface-2)] active:bg-[var(--surface-2)] transition-colors"
          aria-label={t('actions.hidePanel')}
        >
          <svg width="14" height="14" viewBox="0 0 14 14" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round">
            <path d="M2 2l10 10M12 2L2 12" />
          </svg>
        </button>
      </div>

      {/* Tabs */}
      <div className="flex items-center p-1.5 gap-0.5 border-b border-[var(--border)] shrink-0">
        {([['props', t('tabs.properties')], ['cats', t('tabs.categories')], ['qty', t('tabs.takeoff')]] as const).map(([id, label]) => (
          <button
            key={id}
            onClick={() => setTab(id)}
            className="flex-1 h-8 xs:h-7 text-[13px] xs:text-[12px] font-medium rounded-[6px] transition-colors"
            style={{
              background: tab === id ? 'var(--surface-2)' : 'transparent',
              color:      tab === id ? 'var(--text)' : 'var(--text-dim)',
            }}
          >
            {label}
          </button>
        ))}
        {/* Desktop only: collapse button */}
        <button
          onClick={() => setDesktopCollapsed(true)}
          title={t('actions.hidePanel')}
          className="hidden md:flex shrink-0 items-center justify-center w-7 h-7 rounded-[6px] text-[var(--text-faint)] hover:text-[var(--text)] hover:bg-[var(--surface-2)] transition-colors ml-0.5"
        >
          <svg width="11" height="11" viewBox="0 0 14 14" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round">
            <path d="M5 2l5 5-5 5" />
          </svg>
        </button>
      </div>

      <div className="flex-1 overflow-y-auto scroll-contain">
        <AnimatePresence>
          {tab === 'props' && (
            <motion.div key="props" initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}>
              <PropertiesPanel
                selected={selected}
                categories={categories}
                isolated={isolated}
                viewerApiRef={viewerApiRef}
                onFrame={handleFrame}
                onRevealInTree={handleRevealInTree}
                onIsolate={handleIsolate}
              />
            </motion.div>
          )}
          {tab === 'cats' && (
            <motion.div key="cats" initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}>
              <CategoryPanel
                categories={categories}
                elementCount={elementCount}
                hidden={hidden}
                onToggleHidden={onToggleHidden}
                isolated={isolated}
                onSetIsolated={onSetIsolated}
                onFrame={onFrame}
                onSelectElement={onSelectElement}
                onFrameElement={onFrameElement}
              />
            </motion.div>
          )}
          {tab === 'qty' && (
            <motion.div key="qty" initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}>
              <TakeoffPanel />
            </motion.div>
          )}
        </AnimatePresence>
      </div>

      {/* Mobile: safe-area bottom spacer */}
      <div className="md:hidden shrink-0"
        style={{ height: 'env(safe-area-inset-bottom, 0px)' }}
      />
    </motion.div>
    </>
  )
}