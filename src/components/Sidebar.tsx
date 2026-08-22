import React, { useState, useEffect, useMemo, useCallback, useRef } from 'react'
import { motion, AnimatePresence } from 'framer-motion'
import { useTranslation } from 'react-i18next'
import * as Icons from './Icons'
import { useValidationStore } from '../stores/validationStore'
import { useUIStore } from '../stores/uiStore'

type SidebarTab = 'props' | 'cats' | 'qty'
import { makeHiddenKey, expandWithDecomp } from '../lib/visibility'
import { useEditorHistory } from '../hooks/useEditorHistory'
import { useEditorStore, pendingEditsFor } from '../stores/editorStore'
import { useTakeoffStore, selectTakeoffGroups, selectTakeoffStatus } from '../stores/takeoffStore'
import { useSceneStore } from '../stores/sceneStore'
import {
  useInspectorStore, clearInspectorTarget, LAS_CLASSES,
  type PointTarget, type MapFeatureTarget,
} from '../lib/inspector'
import { computeTakeoff } from '../lib/takeoff'
import { buildRenameCommand, buildSetPropertyCommand, exportElementToJson, exportElementToCsv, downloadBlob } from '../lib/diffStore'
import type { Category, SceneModel, SelectedInfo, SpatialNode, SpatialElement, ValidationIssue, TakeoffGroup, EditDiff } from '../types'
import { IFC_DISPLAY_NAMES, IFC_PALETTE } from '../lib/viewer'
import type { IFCItemData, IFCPropertySet, IFCQuantitySet, ViewerAPI } from '../lib/viewer'

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
  dirtyProps = new Map(),
}: {
  pset: IFCPropertySet
  elementExpressId: number
  onEditProperty: (psetName: string, propName: string, propExpressId: number, oldValue: string, newValue: string) => void
  forceOpen?: boolean
  /** propExpressId (as string) → pending new value */
  dirtyProps?: Map<string, string>
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
                const pendingVal = dirtyProps.get(String(prop.expressId))
                const isDirtyProp = pendingVal !== undefined
                const displayVal = isDirtyProp ? pendingVal : prop.value
                return (
                  <div
                    key={i}
                    className="flex items-center px-2.5 py-1 gap-2 hover:bg-[var(--surface-2)] transition-colors group/prop"
                  >
                    <div className="w-[42%] flex-shrink-0 flex items-center gap-1 min-w-0">
                      <span className="text-[11px] text-[var(--text-dim)] truncate" title={prop.name}>
                        {prop.name}
                      </span>
                      {isDirtyProp && (
                        <span className="w-1.5 h-1.5 rounded-full bg-[var(--accent)] shrink-0" title="Unsaved change" />
                      )}
                    </div>
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
                          {prop.type && (
                            <span className="shrink-0 text-[9px] font-mono px-1 py-0.5 rounded bg-[var(--surface-2)] text-[var(--text-faint)] border border-[var(--border)] leading-none">
                              {prop.type.replace(/^IFC/i, '').replace(/MEASURE$/i, '').slice(0, 8)}
                            </span>
                          )}
                          <span
                            className={`flex-1 text-[11.5px] truncate ${
                              isDirtyProp
                                ? 'text-[var(--accent-2)]'
                                : displayVal === null || displayVal === ''
                                  ? 'text-[var(--text-faint)] italic'
                                  : 'text-[var(--text)]'
                            }`}
                            title={String(displayVal ?? '—')}
                          >
                            {formatPropValue(displayVal)}
                          </span>
                          {prop.expressId > 0 && (
                            <button
                              className="shrink-0 opacity-0 group-hover/prop:opacity-60 hover:!opacity-100 transition-opacity p-0.5 rounded hover:bg-[var(--border)]"
                              title="Edit value"
                              onClick={() => startEdit(prop.expressId, String(isDirtyProp ? pendingVal : (prop.value ?? '')))}
                            >
                              <svg width="9" height="9" viewBox="0 0 12 12" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
                                <path d="M8 2l2 2-6 6H2V8l6-6z" />
                              </svg>
                            </button>
                          )}
                          {displayVal !== null && displayVal !== '' && (
                            <CopyButton value={String(displayVal)} label="" />
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

// ─── QuantitySetRow ────────────────────────────────────────────────────────────

const QUANTITY_UNITS: Record<string, string> = {
  Length: 'm', Area: 'm²', Volume: 'm³', Weight: 'kg', Time: 's', Count: '', Unknown: '',
}

function QuantitySetRow({ qset, forceOpen = false }: {
  qset: IFCQuantitySet
  forceOpen?: boolean
}) {
  const [userOpen, setUserOpen] = useState(false)
  const open = forceOpen || userOpen

  return (
    <div className="mx-4 mb-1.5 rounded-lg overflow-hidden border border-[var(--border)]">
      <button
        onClick={() => setUserOpen(v => !v)}
        className="w-full flex items-center gap-2 px-2.5 py-1.5 hover:bg-[var(--surface-2)] transition-colors text-left"
      >
        <svg
          width="7" height="7" viewBox="0 0 8 8" fill="currentColor"
          className="transition-transform shrink-0 text-[var(--text-faint)]"
          style={{ transform: open ? 'rotate(90deg)' : 'rotate(0deg)' }}
        >
          <path d="M2.5 0L6.5 4L2.5 8L1.5 7L4.5 4L1.5 1Z" />
        </svg>
        <span className="flex-1 text-[12px] font-medium text-[var(--text)] truncate">{qset.name}</span>
        <span className="text-[10px] font-mono text-[var(--text-faint)] shrink-0">{qset.quantities.length}</span>
      </button>
      <AnimatePresence initial={false}>
        {open && (
          <motion.div
            initial={{ height: 0 }} animate={{ height: 'auto' }} exit={{ height: 0 }}
            transition={{ duration: 0.15 }}
            style={{ overflow: 'hidden' }}
          >
            <div className="border-t border-[var(--border)]">
              {qset.quantities.map((q, i) => (
                <div key={i} className="flex items-center px-2.5 py-1 gap-2 hover:bg-[var(--surface-2)] transition-colors group/qty">
                  <div className="w-[42%] flex-shrink-0 flex items-center gap-1 min-w-0">
                    <span className="text-[11px] text-[var(--text-dim)] truncate" title={q.name}>{q.name}</span>
                  </div>
                  <div className="flex-1 flex items-center gap-1 min-w-0">
                    <span className="shrink-0 text-[9px] font-mono px-1 py-0.5 rounded bg-[var(--surface-2)] text-[var(--text-faint)] border border-[var(--border)] leading-none">
                      {q.quantityType}
                    </span>
                    <span className="flex-1 font-mono text-[11.5px] text-[var(--text)] truncate">
                      {q.value !== null
                        ? q.value.toLocaleString(undefined, { maximumFractionDigits: 4 })
                        : <span className="text-[var(--text-faint)] italic">—</span>}
                      {q.value !== null && QUANTITY_UNITS[q.quantityType] && (
                        <span className="text-[var(--text-faint)] ml-0.5 text-[10px]">{QUANTITY_UNITS[q.quantityType]}</span>
                      )}
                    </span>
                    {q.value !== null && (
                      <CopyButton value={String(q.value)} label="" />
                    )}
                  </div>
                </div>
              ))}
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


// ─── Non-IFC inspector bodies ─────────────────────────────────────────────────
// A scene here is up to three kinds of thing at once — federated IFC models, a
// survey scan, and the real neighbourhood from OpenStreetMap — and "what is
// this?" used to be answered in three different places: this panel, a readout
// buried in the point cloud panel, and a hover tooltip that vanished when the
// mouse moved. These render the two that are not IFC, in the same panel, so
// there is one place to look.

function InspectorShell({
  source, badge, title, subtitle, onClear, children,
}: {
  source: string
  badge: string
  title: string
  subtitle?: string
  onClear: () => void
  children: React.ReactNode
}) {
  const { t } = useTranslation('sidebar')
  return (
    <motion.div
      initial={{ opacity: 0, y: 4 }} animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.2 }} className="pb-4"
    >
      <div className="px-4 pt-3.5 pb-3 border-b border-[var(--border)]">
        <div className="mb-2 max-w-full flex items-center gap-1.5 h-5 px-1.5 rounded-md bg-[var(--surface-2)] border border-[var(--border)] text-[10px] text-[var(--text-faint)] w-fit">
          <span className="truncate">{source}</span>
        </div>
        <div className="flex items-center gap-2 mb-2">
          <span className="font-mono text-[10px] text-[var(--text-faint)] tracking-wider uppercase">{badge}</span>
          <button
            onClick={onClear}
            className="ml-auto text-[10px] text-[var(--text-faint)] hover:text-[var(--text)] transition-colors"
          >
            {t('inspector.clear')}
          </button>
        </div>
        <div className="text-[13.5px] font-medium text-[var(--text)] leading-snug break-words">{title}</div>
        {subtitle && (
          <div className="mt-0.5 text-[11px] text-[var(--text-faint)] leading-snug break-words">{subtitle}</div>
        )}
      </div>
      {children}
    </motion.div>
  )
}

function InspectorRow({ label, value }: { label: string; value: React.ReactNode }) {
  return (
    <div className="flex items-baseline gap-3 px-4 py-1.5 border-b border-[var(--border)] last:border-0">
      <span className="w-[92px] shrink-0 text-[10.5px] text-[var(--text-faint)]">{label}</span>
      <span className="flex-1 min-w-0 text-[11.5px] text-[var(--text-dim)] font-mono break-words">{value}</span>
    </div>
  )
}

function PointBody({ target, onClear }: { target: PointTarget; onClear: () => void }) {
  const { t } = useTranslation('sidebar')
  const unit = target.unit ?? 'm'
  // Millimetres. A survey point quoted to fewer decimals is not a survey point;
  // quoted to more, it is pretending the scanner was better than it was.
  const xyz = (v: number): string => v.toFixed(3)
  const cls = target.classification
  const clsName = cls !== undefined ? LAS_CLASSES[cls] : undefined

  return (
    <InspectorShell
      source={target.cloudName}
      badge={t('inspector.point.badge')}
      title={`${xyz(target.position.x)}, ${xyz(target.position.y)}, ${xyz(target.position.z)}`}
      subtitle={t('inspector.point.inSourceCoords', { unit })}
      onClear={onClear}
    >
      <div className="pt-1">
        <InspectorRow label="X" value={`${xyz(target.position.x)} ${unit}`} />
        <InspectorRow label="Y" value={`${xyz(target.position.y)} ${unit}`} />
        <InspectorRow label="Z" value={`${xyz(target.position.z)} ${unit}`} />
        {target.intensity !== undefined && (
          <InspectorRow label={t('inspector.point.intensity')} value={String(target.intensity)} />
        )}
        {cls !== undefined && (
          <InspectorRow
            label={t('inspector.point.classification')}
            value={clsName ? `${cls} · ${t(('inspector.point.class.' + clsName) as never)}` : String(cls)}
          />
        )}
        {target.color && (
          <InspectorRow
            label={t('inspector.point.colour')}
            value={
              <span className="inline-flex items-center gap-1.5">
                <span
                  className="w-3 h-3 rounded-[3px] border border-[var(--border)]"
                  style={{ background: `rgb(${target.color.r},${target.color.g},${target.color.b})` }}
                />
                {`${target.color.r}, ${target.color.g}, ${target.color.b}`}
              </span>
            }
          />
        )}
      </div>
    </InspectorShell>
  )
}

function MapFeatureBody({ target, onClear }: { target: MapFeatureTarget; onClear: () => void }) {
  const { t } = useTranslation('sidebar')
  return (
    <InspectorShell
      source="OpenStreetMap"
      badge={target.featureKind}
      // Most OSM buildings carry no name at all. Saying so beats inventing one.
      title={target.name ?? target.label ?? t('inspector.map.unnamed')}
      subtitle={target.name && target.label ? target.label : undefined}
      onClear={onClear}
    >
      <div className="pt-1">
        {target.heightM !== undefined && (
          <InspectorRow
            label={t('inspector.map.height')}
            value={
              <>
                {target.heightM.toFixed(1)} m
                {target.heightEstimated && (
                  <span className="ml-1.5 text-[10px] text-[var(--text-faint)] font-sans">
                    {t('inspector.map.estimated')}
                  </span>
                )}
              </>
            }
          />
        )}
        {target.storeys !== undefined && (
          <InspectorRow label={t('inspector.map.storeys')} value={String(target.storeys)} />
        )}
        <InspectorRow label={t('inspector.map.osmId')} value={target.id} />
      </div>
      <p className="px-4 pt-3 text-[10.5px] text-[var(--text-faint)] leading-relaxed">
        {t('inspector.map.contextNote')}
      </p>
    </InspectorShell>
  )
}

// ─── Properties Panel ──────────────────────────────────────────────────────────

interface PropertiesPanelProps {
  selected: SelectedInfo | null
  categories: Category[]
  isolated: string | null
  viewerApiRef?: React.MutableRefObject<ViewerAPI | null>
  onFrame?: (expressId: number) => void
  onRevealInTree?: (expressId: number, modelId?: string) => void
  onIsolate?: () => void
}

function PropertiesPanel({
  selected, categories, isolated, viewerApiRef, onFrame, onRevealInTree, onIsolate,
}: PropertiesPanelProps) {
  const { t } = useTranslation('sidebar')
  // Read raw record (stable reference) to avoid infinite-loop selector issue
  const spatialTreesRecord = useValidationStore((s) => s.spatialTrees)
  const result             = useValidationStore((s) => s.result)
  // Selectors, not whole stores: this panel re-renders on every selection and
  // was waking on every unrelated store write.
  const hiddenElements     = useUIStore((s) => s.hiddenElements)
  const setElementsVisible = useUIStore((s) => s.setElementsVisible)
  const inspectorTarget = useInspectorStore((s) => s.target)
  const sceneModels    = useSceneStore((s) => s.models)
  const activeModelId  = useSceneStore((s) => s.activeModelId)
  const setActiveModel = useSceneStore((s) => s.setActiveModel)
  const showModelChip  = sceneModels.length > 1
  const { addCommand } = useEditorHistory()
  const diffs = useEditorStore((s) => s.diffs)

  const [sections, setSections] = useState({
    location: true,
    visibility: false,
    attributes: true,
    typeProps: true,
    psets: true,
    quantities: true,
    materials: true,
    validation: true,
  })
  const toggle = (key: keyof typeof sections) =>
    setSections(s => ({ ...s, [key]: !s[key] }))

  const [exportOpen, setExportOpen] = useState(false)
  const exportRef = useRef<HTMLDivElement>(null)

  // Close export dropdown on outside click
  useEffect(() => {
    if (!exportOpen) return
    const handler = (e: MouseEvent): void => {
      if (!exportRef.current?.contains(e.target as Node)) setExportOpen(false)
    }
    document.addEventListener('mousedown', handler)
    return () => document.removeEventListener('mousedown', handler)
  }, [exportOpen])

  // Property-set filter (resets whenever the selected element changes)
  const [psetQuery, setPsetQuery] = useState('')

  const expressId = selected ? parseInt(selected.id, 10) : null

  useEffect(() => { setPsetQuery(''); setExportOpen(false) }, [expressId])

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
  // Scoped to its model. Without that, selecting a column in the structural
  // model listed the issues of whatever shares its number in the architectural
  // and services models too — and every IFC numbers from #1, so something
  // always does.
  const elementIssues = useMemo(() => {
    if (!selected || !result) return []
    const id = parseInt(selected.id, 10)
    return result.issues.filter(
      (i) => i.expressId === id && (!selected.modelId || !i.modelId || i.modelId === selected.modelId),
    )
  }, [selected, result])

  // ── Pending diffs for this element ───────────────────────────────────────
  // `diffs` is in the dependency list but not read: it is the store's own
  // change signal, and pendingEditsFor walks the history (which keeps the
  // modelId that flattening drops).
  const { pendingDiffs, pendingPropDiffs } = useMemo(() => {
    if (!selected) return { pendingDiffs: new Map<string, string>(), pendingPropDiffs: new Map<string, string>() }
    const edits = pendingEditsFor(parseInt(selected.id, 10), selected.modelId)
    return { pendingDiffs: edits.renames, pendingPropDiffs: edits.properties }
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

  const handleExportJson = useCallback(() => {
    if (!selected) return
    const data = ifcState.status === 'loaded' ? ifcState.data : null
    if (!data) return
    const json = exportElementToJson(selected, data, pendingDiffs, pendingPropDiffs)
    downloadBlob(new Blob([json], { type: 'application/json' }), `element-${selected.id}.json`)
    setExportOpen(false)
  }, [selected, ifcState, pendingDiffs, pendingPropDiffs])

  const handleExportCsv = useCallback(() => {
    if (!selected) return
    const data = ifcState.status === 'loaded' ? ifcState.data : null
    if (!data) return
    const csv = exportElementToCsv(selected, data, pendingDiffs, pendingPropDiffs)
    downloadBlob(new Blob([csv], { type: 'text/csv' }), `element-${selected.id}.csv`)
    setExportOpen(false)
  }, [selected, ifcState, pendingDiffs, pendingPropDiffs])

  // Must be called unconditionally (Rules of Hooks) — uses optional chaining internally
  const decompMap = useValidationStore((s) => selected?.modelId ? s.decompMaps[selected.modelId] : undefined)

  // A scanned point or a map feature was picked more recently than any IFC
  // element, so that is what "what is this?" means right now.
  if (inspectorTarget?.kind === 'point') {
    return <PointBody target={inspectorTarget} onClear={clearInspectorTarget} />
  }
  if (inspectorTarget?.kind === 'map-feature') {
    return <MapFeatureBody target={inspectorTarget} onClear={clearInspectorTarget} />
  }

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

  // WHICH MODEL AM I LOOKING AT. In a federated scene the panel used to answer
  // everything about an element except the one thing that disambiguates it: the
  // file it came from. Three disciplines of one building have the same storeys
  // at the same elevations and elements numbered from #1 in each, so "Column A1
  // - Ground" on its own is genuinely ambiguous.
  const ownerModel = selected.modelId
    ? sceneModels.find((m) => m.id === selected.modelId) ?? null
    : null

  const cat = categories.find(c => c.id === selected.type || c.id === selected.type.replace('STANDARDCASE', ''))
  const catColor = cat ? `#${cat.color.toString(16).padStart(6, '0')}` : 'var(--text-dim)'
  const isHidden = expressId != null && hiddenElements.has(makeHiddenKey(selected?.modelId ?? '', expressId))
  const hasDirty = pendingDiffs.size > 0 || pendingPropDiffs.size > 0
  const dirtyCount = pendingDiffs.size + pendingPropDiffs.size
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
  const qsets = ifcData?.quantitySets ?? []
  const materials = ifcData?.materials ?? []
  const typeProperties = ifcData?.typeProperties ?? []
  const typeName = ifcData?.typeName ?? null
  const totalProps = psets.reduce((acc, ps) => acc + ps.properties.length, 0)
  const totalTypeProps = typeProperties.reduce((acc, ps) => acc + ps.properties.length, 0)

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
        {/* Which model this element belongs to — only worth the row when there
            is more than one to confuse it with. Clicking makes it active, which
            is what every other model-targeted action then follows. */}
        {showModelChip && (
          <button
            onClick={() => ownerModel && setActiveModel(ownerModel.id)}
            disabled={!ownerModel || ownerModel.id === activeModelId}
            title={ownerModel ? t('properties.ownerModel', { name: ownerModel.fileName }) : undefined}
            className="mb-2 max-w-full flex items-center gap-1.5 h-5 px-1.5 rounded-md bg-[var(--surface-2)] border border-[var(--border)] text-[10px] text-[var(--text-faint)] hover:text-[var(--text)] hover:border-[var(--accent)] disabled:hover:text-[var(--text-faint)] disabled:hover:border-[var(--border)] transition-colors"
          >
            <svg width="9" height="9" viewBox="0 0 12 12" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinejoin="round">
              <path d="M6 1L11 3.5L6 6L1 3.5Z" /><path d="M1 6.5L6 9L11 6.5" />
            </svg>
            <span className="truncate">{ownerModel?.fileName ?? t('properties.unknownModel')}</span>
            {ownerModel && ownerModel.id === activeModelId && (
              <span className="shrink-0 w-1.5 h-1.5 rounded-full bg-[var(--accent)]" />
            )}
          </button>
        )}

        {/* Type badge row */}
        <div className="flex items-center gap-2 mb-2">
          <div className="w-2.5 h-2.5 rounded-[3px] shrink-0" style={{ background: catColor }} />
          <span className="font-mono text-[10px] text-[var(--text-faint)] tracking-wider uppercase">
            {selected.type}
          </span>
          {hasDirty && (
            <span className="ml-auto text-[10px] px-1.5 py-0.5 rounded-full bg-[var(--accent)] text-white font-medium leading-none">
              {dirtyCount} edit{dirtyCount !== 1 ? 's' : ''}
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
          {/* Export dropdown */}
          {ifcState.status === 'loaded' && (
            <div ref={exportRef} className="relative ml-auto">
              <button
                onClick={() => setExportOpen(v => !v)}
                className="flex items-center gap-1 h-5 px-1.5 rounded-md bg-[var(--surface-2)] border border-[var(--border)] text-[10px] text-[var(--text-dim)] hover:text-[var(--text)] hover:border-[var(--accent)] transition-colors"
                title="Export element data"
              >
                <svg width="9" height="9" viewBox="0 0 12 12" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round">
                  <path d="M6 1v7M3 5l3 3 3-3M1 10h10" />
                </svg>
                Export
              </button>
              {exportOpen && (
                <div className="absolute right-0 top-6 z-50 min-w-[110px] bg-[var(--surface)] border border-[var(--border)] rounded-lg shadow-xl overflow-hidden">
                  <button
                    onClick={handleExportJson}
                    className="w-full text-left px-3 py-2 text-[11.5px] text-[var(--text-dim)] hover:bg-[var(--surface-2)] hover:text-[var(--text)] flex items-center gap-2"
                  >
                    <span className="font-mono text-[9px] text-[#30A46C]">JSON</span>
                    Export JSON
                  </button>
                  <button
                    onClick={handleExportCsv}
                    className="w-full text-left px-3 py-2 text-[11.5px] text-[var(--text-dim)] hover:bg-[var(--surface-2)] hover:text-[var(--text)] flex items-center gap-2"
                  >
                    <span className="font-mono text-[9px] text-[#F5A623]">CSV</span>
                    Export CSV
                  </button>
                </div>
              )}
            </div>
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
          {typeName && (
            <span className="text-[10px] px-1.5 py-0.5 rounded bg-[var(--surface-2)] border border-[var(--border)] text-[var(--text-faint)] font-mono truncate max-w-[100px]" title={typeName}>
              {typeName}
            </span>
          )}
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
            onClick={() => onRevealInTree?.(expressId, selected?.modelId)}
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
                            onClick={() => onRevealInTree?.(node.expressId, selected?.modelId)}
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

                {/* Dirty indicator + discard */}
                {hasDirty && (
                  <div className="mx-4 mt-2 px-2.5 py-1.5 rounded-lg bg-[var(--accent)] bg-opacity-10 border border-[var(--accent)] border-opacity-30 flex items-center gap-2">
                    <svg width="11" height="11" viewBox="0 0 12 12" fill="none" stroke="var(--accent-2)" strokeWidth="1.5" strokeLinecap="round">
                      <circle cx="6" cy="6" r="5" />
                      <path d="M6 4v3M6 8.5v.5" />
                    </svg>
                    <span className="flex-1 text-[10.5px] text-[var(--accent-2)]">
                      {dirtyCount} unsaved edit{dirtyCount !== 1 ? 's' : ''}
                    </span>
                    <button
                      onClick={() => expressId !== null && useEditorStore.getState().discardForElement(expressId, selected?.modelId)}
                      className="text-[10px] text-[var(--accent-2)] hover:text-[var(--text)] underline transition-colors"
                      title="Discard all unsaved edits to this element"
                    >
                      Discard
                    </button>
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
      {/* ── Type Properties ── */}
      {typeProperties.length > 0 && (
        <div className="border-b border-[var(--border)]">
          <SectionHeader
            label="Type Properties"
            open={sections.typeProps}
            onToggle={() => toggle('typeProps')}
            badge={totalTypeProps > 0 ? totalTypeProps : undefined}
          />
          <AnimatePresence initial={false}>
            {sections.typeProps && (
              <motion.div initial={{ height: 0 }} animate={{ height: 'auto' }} exit={{ height: 0 }} transition={{ duration: 0.15 }} style={{ overflow: 'hidden' }}>
                <div className="pt-1 pb-2">
                  {typeProperties.map(ps => (
                    <PsetRow
                      key={`${expressId}:type:${ps.name}`}
                      pset={ps}
                      elementExpressId={expressId ?? 0}
                      onEditProperty={handleEditProperty}
                      dirtyProps={pendingPropDiffs}
                    />
                  ))}
                </div>
              </motion.div>
            )}
          </AnimatePresence>
        </div>
      )}

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
                          key={`${expressId}:${pset.name}`}
                          pset={pset}
                          elementExpressId={expressId ?? 0}
                          onEditProperty={handleEditProperty}
                          forceOpen={psetQuery.trim().length > 0}
                          dirtyProps={pendingPropDiffs}
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

      {/* ── Quantities ── */}
      {qsets.length > 0 && (
        <div className="border-b border-[var(--border)]">
          <SectionHeader
            label="Quantities"
            open={sections.quantities}
            onToggle={() => toggle('quantities')}
            badge={qsets.reduce((acc, qs) => acc + qs.quantities.length, 0)}
          />
          <AnimatePresence initial={false}>
            {sections.quantities && (
              <motion.div initial={{ height: 0 }} animate={{ height: 'auto' }} exit={{ height: 0 }} transition={{ duration: 0.15 }} style={{ overflow: 'hidden' }}>
                <div className="pt-1 pb-2">
                  {qsets.map(qs => (
                    <QuantitySetRow key={`${expressId}:qty:${qs.name}`} qset={qs} />
                  ))}
                </div>
              </motion.div>
            )}
          </AnimatePresence>
        </div>
      )}

      {/* ── Materials ── */}
      {materials.length > 0 && (
        <div className="border-b border-[var(--border)]">
          <SectionHeader
            label="Materials"
            open={sections.materials}
            onToggle={() => toggle('materials')}
            badge={materials.length}
          />
          <AnimatePresence initial={false}>
            {sections.materials && (
              <motion.div initial={{ height: 0 }} animate={{ height: 'auto' }} exit={{ height: 0 }} transition={{ duration: 0.15 }} style={{ overflow: 'hidden' }}>
                <div className="py-1.5 space-y-0.5">
                  {materials.map((m, i) => (
                    <div key={i} className="flex items-center gap-2 px-4 py-1 hover:bg-[var(--surface-2)] transition-colors group/mat">
                      <svg width="10" height="10" viewBox="0 0 12 12" fill="none" stroke="currentColor" strokeWidth="1.4" strokeLinecap="round" className="text-[var(--text-faint)] shrink-0">
                        <rect x="1" y="4" width="10" height="4" rx="1" />
                        <path d="M3 4V3M6 4V2M9 4V3" />
                      </svg>
                      <span className="flex-1 text-[12px] text-[var(--text)] truncate" title={m.name}>{m.name}</span>
                      {m.layerThickness !== undefined && (
                        <span className="font-mono text-[10.5px] text-[var(--text-faint)] shrink-0">
                          {m.layerThickness.toFixed(4)} m
                        </span>
                      )}
                      <CopyButton value={m.name} label="" />
                    </div>
                  ))}
                </div>
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
  nameMap, sceneModels = [], onToggleHidden, onSetIsolated, onFrame, onToggleExpand,
  onSelectElement, onFrameElement, issueCount = 0,
}: {
  cat: Category
  isHidden: boolean
  isIsolated: boolean
  isExpanded: boolean
  nameMap: Map<number, string>
  sceneModels?: SceneModel[]
  onToggleHidden: (id: string) => void
  onSetIsolated: (id: string | null) => void
  onFrame: (id: string) => void
  onToggleExpand: (id: string) => void
  onSelectElement?: (expressId: number) => void
  onFrameElement?: (expressId: number) => void
  issueCount?: number
}) {
  const hexColor    = `#${cat.color.toString(16).padStart(6, '0')}`
  const isMultiModel = sceneModels.length > 1
  // Per-model breakdown: models that have this IFC type
  const modelEntries = isMultiModel
    ? sceneModels.map(m => ({ model: m, cat: m.categories.find(c => c.id === cat.id) }))
        .filter((e): e is { model: SceneModel; cat: Category } => !!e.cat && e.cat.count > 0)
    : []
  const hasElem   = isMultiModel ? modelEntries.length > 0 : cat.elementIds.length > 0
  const visible   = cat.elementIds.slice(0, MAX_VISIBLE)
  const overflow  = cat.elementIds.length - MAX_VISIBLE
  const hasIssues = issueCount > 0

  return (
    <>
      <div
        className="flex items-center gap-2 px-2 py-1.5 text-[12.5px] group/row hover:bg-[var(--surface-2)] transition-colors rounded-[6px] mx-1"
        style={{
          background:  isIsolated ? 'rgba(94,106,210,0.1)' : undefined,
          outline:     isIsolated ? '1px solid rgba(94,106,210,0.3)' : undefined,
          opacity:     isHidden   ? 0.4 : 1,
        }}
      >
        {/* Expand chevron */}
        <button
          onClick={() => hasElem && onToggleExpand(cat.id)}
          className={`w-3.5 h-3.5 flex items-center justify-center transition-transform shrink-0
            ${hasElem ? 'text-[var(--text-faint)] hover:text-[var(--text)] cursor-pointer' : 'opacity-0 pointer-events-none'}`}
          style={{ transform: isExpanded ? 'rotate(90deg)' : 'rotate(0deg)' }}
        >
          <svg width="6" height="6" viewBox="0 0 8 8" fill="currentColor">
            <path d="M2.5 0L6.5 4L2.5 8L1.5 7L4.5 4L1.5 1Z" />
          </svg>
        </button>

        {/* Color swatch — click to isolate */}
        <button
          onClick={() => onSetIsolated(isIsolated ? null : cat.id)}
          className="shrink-0 rounded-[4px] hover:scale-110 active:scale-95 transition-transform cursor-pointer relative group/swatch"
          style={{
            width: 22, height: 14,
            background: hexColor,
            boxShadow: isIsolated
              ? '0 0 0 2px var(--accent), 0 0 0 1px rgba(0,0,0,0.3) inset'
              : '0 0 0 1px rgba(0,0,0,0.25) inset',
          }}
          title={isIsolated ? 'Clear isolation' : 'Isolate in 3D · click to show only this type'}
        />

        {/* Label — click to frame */}
        <button
          className="flex-1 text-left text-[12.5px] text-[var(--text)] truncate hover:text-[var(--accent-2)] transition-colors cursor-pointer"
          onClick={() => onFrame(cat.id)}
          title="Frame in 3D view"
        >
          {cat.label}
        </button>

        {/* Issue badge */}
        {hasIssues && (
          <span
            className="inline-flex items-center gap-0.5 text-[10px] font-mono px-1 py-0.5 rounded leading-none shrink-0"
            style={{ color: '#F5A623', background: 'rgba(245,166,35,0.15)', border: '1px solid rgba(245,166,35,0.25)' }}
            title={`${issueCount} validation issue${issueCount !== 1 ? 's' : ''}`}
          >
            <svg width="8" height="8" viewBox="0 0 12 12" fill="currentColor" style={{ opacity: 0.9 }}>
              <path d="M6 1L11 10H1L6 1zm0 2.5v3m0 1.5v.5" stroke="currentColor" strokeWidth="1.2" strokeLinecap="round" fill="none"/>
            </svg>
            {issueCount}
          </span>
        )}

        {/* Element count */}
        <span className="font-mono text-[11px] text-[var(--text-faint)] shrink-0 tabular-nums">{cat.count}</span>

        {/* Visibility toggle */}
        <button
          onClick={e => { e.stopPropagation(); onToggleHidden(cat.id) }}
          className="p-0.5 rounded text-[var(--text-faint)] hover:text-[var(--text)] hover:bg-[var(--border)] shrink-0 opacity-0 group-hover/row:opacity-100 transition-opacity"
          title={isHidden ? 'Show' : 'Hide'}
        >
          {isHidden ? <Icons.EyeOff size={13} /> : <Icons.Eye size={13} />}
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
            <div className="ml-6 mr-2 mb-1 rounded-lg border border-[var(--border)] overflow-y-auto" style={{ maxHeight: 220 }}>
              {isMultiModel ? (
                /* Multi-model: per-model sections */
                modelEntries.map(({ model, cat: mCat }) => {
                  const mVisible  = mCat.elementIds.slice(0, MAX_VISIBLE)
                  const mOverflow = mCat.elementIds.length - MAX_VISIBLE
                  return (
                    <div key={model.id}>
                      {/* Model header */}
                      <div className="flex items-center gap-1.5 px-2.5 py-1 bg-[var(--surface)] sticky top-0 border-b border-[var(--border)]">
                        <span className="w-1.5 h-1.5 rounded-full shrink-0" style={{ background: hexColor }} />
                        <span className="flex-1 truncate text-[10px] font-medium text-[var(--text-dim)]">{model.fileName}</span>
                        <span className="font-mono text-[9.5px] text-[var(--text-faint)]">{mCat.count}</span>
                      </div>
                      {mVisible.map(eid => {
                        const name = nameMap.get(eid) ?? `#${eid}`
                        return (
                          <button
                            key={`${model.id}:${eid}`}
                            onClick={() => { onSelectElement?.(eid); onFrameElement?.(eid) }}
                            className="w-full flex items-center gap-2 px-2.5 py-1 text-left hover:bg-[var(--surface-2)] transition-colors group/elem"
                          >
                            <span className="flex-1 truncate text-[11.5px] text-[var(--text-dim)] group-hover/elem:text-[var(--text)]">{name}</span>
                            <span className="font-mono text-[9.5px] text-[var(--text-faint)] shrink-0 opacity-0 group-hover/elem:opacity-100">{eid}</span>
                          </button>
                        )
                      })}
                      {mOverflow > 0 && <MoreElementsText count={mOverflow} />}
                    </div>
                  )
                })
              ) : (
                /* Single model: flat list */
                <>
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
                  {overflow > 0 && <MoreElementsText count={overflow} />}
                </>
              )}
            </div>
          </motion.div>
        )}
      </AnimatePresence>
    </>
  )
}

function CategoryPanel({
  categories, elementCount, sceneModels = [], hidden, onToggleHidden,
  isolated, onSetIsolated, onFrame, onSelectElement, onFrameElement,
  issuesByType,
}: {
  categories: Category[]
  elementCount: number
  sceneModels?: SceneModel[]
  hidden: Set<string>
  onToggleHidden: (id: string) => void
  isolated: string | null
  onSetIsolated: (id: string | null) => void
  onFrame: (id: string) => void
  onSelectElement?: (expressId: number) => void
  onFrameElement?: (expressId: number) => void
  issuesByType: Map<string, number>
}) {
  const { t } = useTranslation('sidebar')
  const spatialTreesRecord = useValidationStore((s) => s.spatialTrees)
  const allNodes = useMemo(() => Object.values(spatialTreesRecord).flat(), [spatialTreesRecord])
  const nameMap  = useMemo(() => buildNameMap(allNodes), [allNodes])

  const [expanded,     setExpanded]     = useState<Set<string>>(new Set())
  const [query,        setQuery]        = useState('')
  const [othersOpen,   setOthersOpen]   = useState(false)

  const toggleExpand = useCallback((id: string) => {
    setExpanded(prev => {
      const next = new Set(prev)
      next.has(id) ? next.delete(id) : next.add(id)
      return next
    })
  }, [])

  const catIds = useMemo(() => new Set(categories.map(c => c.id)), [categories])
  useEffect(() => {
    setExpanded(prev => {
      const next = new Set([...prev].filter(id => catIds.has(id)))
      return next.size === prev.size ? prev : next
    })
  }, [catIds])

  // Split into 3D geometry types (in IFC_PALETTE) and other IFC objects
  const { palette3D, otherIFC } = useMemo(() => {
    const palette3D: Category[] = []
    const otherIFC:  Category[] = []
    for (const c of categories) {
      if (c.id in IFC_PALETTE || c.id.replace('STANDARDCASE','').replace('ELEMENTEDCASE','') in IFC_PALETTE) {
        palette3D.push(c)
      } else {
        otherIFC.push(c)
      }
    }
    return { palette3D, otherIFC }
  }, [categories])

  const q = query.trim().toLowerCase()
  const filteredPalette = useMemo(
    () => (q ? palette3D.filter(c => c.label.toLowerCase().includes(q) || c.id.toLowerCase().includes(q)) : palette3D),
    [palette3D, q],
  )
  const filteredOther = useMemo(
    () => (q ? otherIFC.filter(c => c.label.toLowerCase().includes(q) || c.id.toLowerCase().includes(q)) : otherIFC),
    [otherIFC, q],
  )

  const hiddenCount   = useMemo(() => categories.reduce((n, c) => n + (hidden.has(c.id) ? 1 : 0), 0), [categories, hidden])
  const typesWithIssues = useMemo(() => [...issuesByType.keys()].filter(k => (issuesByType.get(k) ?? 0) > 0).length, [issuesByType])

  const showAll = useCallback(() => { categories.forEach(c => { if (hidden.has(c.id)) onToggleHidden(c.id) }) }, [categories, hidden, onToggleHidden])
  const hideAll = useCallback(() => { categories.forEach(c => { if (!hidden.has(c.id)) onToggleHidden(c.id) }) }, [categories, hidden, onToggleHidden])

  const handleIsolate = useCallback((id: string | null) => {
    if (id && hidden.has(id)) onToggleHidden(id)
    onSetIsolated(id)
  }, [hidden, onToggleHidden, onSetIsolated])
  const handleFrame = useCallback((id: string) => {
    if (hidden.has(id)) onToggleHidden(id)
    onFrame(id)
  }, [hidden, onToggleHidden, onFrame])

  const rowProps = (cat: Category) => ({
    cat,
    isHidden:    hidden.has(cat.id),
    isIsolated:  isolated === cat.id,
    isExpanded:  expanded.has(cat.id),
    nameMap,
    sceneModels,
    onToggleHidden, onSetIsolated: handleIsolate, onFrame: handleFrame,
    onToggleExpand: toggleExpand, onSelectElement, onFrameElement,
    issueCount: issuesByType.get(cat.id) ?? 0,
  })

  if (categories.length === 0) {
    return (
      <div className="px-6 py-10 text-center">
        <svg width="32" height="32" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.2" strokeLinecap="round" className="mx-auto mb-3 text-[var(--text-faint)] opacity-40">
          <rect x="3" y="3" width="7" height="5" rx="1"/><rect x="14" y="3" width="7" height="5" rx="1" opacity=".5"/>
          <rect x="3" y="11" width="7" height="5" rx="1" opacity=".5"/><rect x="14" y="11" width="7" height="5" rx="1" opacity=".3"/>
          <rect x="3" y="19" width="7" height="3" rx="1" opacity=".2"/>
        </svg>
        <div className="text-[13px] text-[var(--text-dim)] mb-1">{t('categories.noModel')}</div>
        <div className="text-[11.5px] text-[var(--text-faint)]">{t('categories.noModelDesc')}</div>
      </div>
    )
  }

  return (
    <div className="pb-2">

      {/* ── Header ── */}
      <div className="px-3.5 pt-3 pb-2.5">
        <div className="flex items-center justify-between gap-2 mb-1">
          <div className="flex items-center gap-1.5 min-w-0">
            <span className="text-[11.5px] font-semibold text-[var(--text-dim)] uppercase tracking-[0.07em]">
              {t('categories.title')}
            </span>
            <span className="text-[9px] px-1.5 py-0.5 rounded-full border border-[var(--border)] text-[var(--text-faint)] uppercase tracking-wider font-medium leading-none shrink-0">
              {t('categories.legendBadge')}
            </span>
          </div>
          {isolated && (
            <button onClick={() => onSetIsolated(null)} className="text-[10.5px] text-[var(--accent-2)] shrink-0 hover:underline">
              {t('categories.clearIsolation')}
            </button>
          )}
        </div>

        {/* Stats row */}
        <div className="flex items-center gap-2 flex-wrap">
          <span className="text-[11px] text-[var(--text-faint)]">
            {t('categories.elements', { count: elementCount })} · {palette3D.length} {t('categories.typesShort')}
          </span>
          {typesWithIssues > 0 && (
            <span className="inline-flex items-center gap-1 text-[10px] font-medium px-1.5 py-0.5 rounded-full leading-none"
              style={{ color: '#F5A623', background: 'rgba(245,166,35,0.12)', border: '1px solid rgba(245,166,35,0.2)' }}>
              <svg width="8" height="8" viewBox="0 0 12 12" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round">
                <path d="M6 2L10.5 10H1.5L6 2zm0 2.5v2.5m0 1.5v.01"/>
              </svg>
              {typesWithIssues} {t('categories.withIssues')}
            </span>
          )}
          {hiddenCount > 0 && (
            <span className="text-[10.5px] text-[var(--text-dim)]">{t('categories.hiddenCount', { count: hiddenCount })}</span>
          )}
        </div>

        {/* Context hint */}
        <div className="mt-1.5 text-[10.5px] text-[var(--text-faint)] italic">
          {t('categories.hint')}
        </div>
      </div>

      {/* ── Filter + bulk visibility ── */}
      <div className="px-3 pb-2 space-y-1.5">
        <div className="relative">
          <svg width="11" height="11" viewBox="0 0 12 12" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round"
            className="absolute left-2 top-1/2 -translate-y-1/2 text-[var(--text-faint)] pointer-events-none">
            <circle cx="5" cy="5" r="3.5" /><path d="M8 8l2.5 2.5" />
          </svg>
          <input
            value={query}
            onChange={e => setQuery(e.target.value)}
            onKeyDown={e => { if (e.key === 'Escape') { e.stopPropagation(); setQuery('') } }}
            placeholder={t('categories.filterPlaceholder')}
            className="w-full h-7 pl-7 pr-7 text-[11.5px] bg-[var(--surface-2)] border border-[var(--border)] rounded-lg text-[var(--text)] outline-none focus:border-[var(--accent)] transition-colors placeholder:text-[var(--text-faint)]"
          />
          {query && (
            <button onClick={() => setQuery('')}
              className="absolute right-1.5 top-1/2 -translate-y-1/2 p-0.5 rounded text-[var(--text-faint)] hover:text-[var(--text)] hover:bg-[var(--border)]">
              <svg width="10" height="10" viewBox="0 0 12 12" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round">
                <path d="M3 3l6 6M9 3l-6 6" />
              </svg>
            </button>
          )}
        </div>
        <div className="flex items-center gap-1.5">
          <button onClick={showAll} disabled={hiddenCount === 0}
            className="flex-1 h-6 rounded-md text-[10.5px] font-medium border border-[var(--border)] text-[var(--text-dim)] hover:text-[var(--text)] hover:border-[var(--border-strong)] disabled:opacity-40 disabled:pointer-events-none transition-colors">
            {t('categories.showAll')}
          </button>
          <button onClick={hideAll} disabled={hiddenCount === categories.length}
            className="flex-1 h-6 rounded-md text-[10.5px] font-medium border border-[var(--border)] text-[var(--text-dim)] hover:text-[var(--text)] hover:border-[var(--border-strong)] disabled:opacity-40 disabled:pointer-events-none transition-colors">
            {t('categories.hideAll')}
          </button>
        </div>
      </div>

      {/* ── 3D Elements section ── */}
      {filteredPalette.length > 0 && (
        <div className="mb-1">
          <div className="px-3.5 py-1 flex items-center gap-1.5">
            <span className="text-[9.5px] font-semibold uppercase tracking-[0.1em] text-[var(--text-faint)]">
              {t('categories.section3D')}
            </span>
            <span className="text-[9.5px] text-[var(--text-faint)] font-mono">{filteredPalette.length}</span>
            <div className="flex-1 h-px bg-[var(--border)]" />
          </div>
          <div className="space-y-px">
            {filteredPalette.map(cat => <CategoryRow key={cat.id} {...rowProps(cat)} />)}
          </div>
        </div>
      )}

      {/* ── Other IFC types (collapsed by default) ── */}
      {filteredOther.length > 0 && (
        <div className="mt-1">
          <button
            onClick={() => setOthersOpen(o => !o)}
            className="w-full px-3.5 py-1 flex items-center gap-1.5 hover:text-[var(--text)] transition-colors group"
          >
            <svg width="7" height="7" viewBox="0 0 8 8" fill="currentColor"
              className="text-[var(--text-faint)] transition-transform shrink-0"
              style={{ transform: othersOpen ? 'rotate(90deg)' : 'rotate(0deg)' }}>
              <path d="M2.5 0L6.5 4L2.5 8L1.5 7L4.5 4L1.5 1Z" />
            </svg>
            <span className="text-[9.5px] font-semibold uppercase tracking-[0.1em] text-[var(--text-faint)]">
              {t('categories.sectionOther')}
            </span>
            <span className="text-[9.5px] text-[var(--text-faint)] font-mono">{filteredOther.length}</span>
            <div className="flex-1 h-px bg-[var(--border)]" />
          </button>
          <AnimatePresence initial={false}>
            {othersOpen && (
              <motion.div key="others"
                initial={{ height: 0, opacity: 0 }} animate={{ height: 'auto', opacity: 1 }}
                exit={{ height: 0, opacity: 0 }} transition={{ duration: 0.2, ease: 'easeInOut' }}
                style={{ overflow: 'hidden' }}>
                <div className="space-y-px pb-1">
                  {filteredOther.map(cat => <CategoryRow key={cat.id} {...rowProps(cat)} />)}
                </div>
              </motion.div>
            )}
          </AnimatePresence>
        </div>
      )}

      {/* No results */}
      {filteredPalette.length === 0 && filteredOther.length === 0 && (
        <div className="px-4 py-6 text-center text-[11.5px] text-[var(--text-faint)] italic">
          {t('categories.noMatches')}
        </div>
      )}
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
  /** All loaded scene models — used by the Legend panel for per-model breakdown */
  sceneModels?: SceneModel[]
  selected: SelectedInfo | null
  hidden: Set<string>
  onToggleHidden: (id: string) => void
  isolated: string | null
  onSetIsolated: (id: string | null) => void
  onFrame: (id: string) => void
  onSelectElement?: (expressId: number) => void
  onFrameElement?: (expressId: number) => void
  /** Called when user clicks "Reveal in tree" — parent should expand tree & scroll */
  onRevealInTree?: (expressId: number, modelId?: string) => void
  /** ViewerAPI ref — used to fetch real IFC data for the selected element */
  viewerApiRef?: React.MutableRefObject<ViewerAPI | null>
  /** Mobile-only: whether the drawer is open (ignored on md+ where it's always visible) */
  mobileOpen?: boolean
  /** Mobile-only: called when user taps close button or backdrop */
  onMobileClose?: () => void
}

export default function Sidebar({
  categories, elementCount, sceneModels = [], selected, hidden, onToggleHidden,
  isolated, onSetIsolated, onFrame, onSelectElement, onFrameElement,
  onRevealInTree, viewerApiRef, mobileOpen = false, onMobileClose,
}: SidebarProps) {
  const { t } = useTranslation('sidebar')
  const [tab, setTab] = useState<SidebarTab>('props')
  // In the store, not local state. As a `useState` it forgot itself on every
  // remount and no other surface could open it — which is why this column had a
  // ghost chevron of its own instead of joining the rule the others follow.
  const sidebarExpanded = useUIStore((s) => s.sidebarExpanded)
  const setSidebarExpanded = useUIStore((s) => s.setSidebarExpanded)
  const desktopCollapsed = !sidebarExpanded
  const setDesktopCollapsed = useCallback(
    (collapsed: boolean) => setSidebarExpanded(!collapsed),
    [setSidebarExpanded],
  )

  // Consume pendingSidebarTab from store — works even when Sidebar was unmounted at click time
  const pendingTab = useUIStore(s => s.pendingSidebarTab)
  const clearPendingTab = useUIStore(s => s.clearPendingSidebarTab)
  useEffect(() => {
    if (pendingTab) { setTab(pendingTab); clearPendingTab() }
  }, [pendingTab, clearPendingTab])

  // Switch to Properties when a new element is selected
  useEffect(() => { if (selected) setTab('props') }, [selected]) // eslint-disable-line react-hooks/exhaustive-deps

  // Issue counts per IFC type — aggregate across ALL validated models.
  // Subscribed at the Sidebar level (stable parent) to avoid StrictMode+Zustand loops in CategoryPanel.
  const cachedResultsByModel = useValidationStore(s => s.cachedResultsByModel)
  const partialIssues        = useValidationStore(s => s.partialIssues)
  const issuesByType = useMemo(() => {
    const allIssues = [
      ...Object.values(cachedResultsByModel).flatMap(r => r.issues),
      ...partialIssues,
    ]
    const m = new Map<string, number>()
    for (const i of allIssues) {
      const key = i.ifcClass.toUpperCase()
      m.set(key, (m.get(key) ?? 0) + 1)
    }
    return m
  }, [cachedResultsByModel, partialIssues])

  // Close mobile drawer when user navigates to tree.
  // The modelId has to be forwarded, not just the id: this wrapper dropping it
  // was enough to send "reveal in tree" to whichever loaded model happened to
  // have that expressId first — which, since every IFC numbers from #1, was
  // routinely the wrong one.
  const handleRevealInTree = useCallback((id: number, modelId?: string) => {
    onRevealInTree?.(id, modelId)
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
      {/* No collapsed strip. The right edge has one owner now — the panel
          rail — and properties is its first icon. A vertical PROPIEDADES label
          did exactly what that icon does, in the same 60px, with a second
          gesture to learn. See docs/RIGHT_EDGE.md. */}

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
          // Base: glass + border (desktop always, mobile overridden by mobile-sidebar-sheet media query)
          'glass border border-[var(--border)] flex flex-col overflow-hidden',
          // Desktop
          // Left of the rail, like every other floating panel: the rail is
          // pinned to the edge and owns it, so everything else is offset by the
          // one shared token rather than stacking on top of it.
          'md:absolute md:top-[68px] md:bottom-3 md:w-[340px] md:rounded-xl md:z-[9] md:right-[var(--panel-rail-clearance)]',
          // Mobile: full-width bottom sheet — mobile-sidebar-sheet overrides glass via @media query
          'max-md:fixed max-md:left-0 max-md:right-0 max-md:bottom-0 max-md:z-[22] max-md:rounded-t-[28px] max-md:mobile-sidebar-sheet',
          // Mobile: leave room for the floating nav pill
          'max-md:max-h-[80dvh]',
          // Mobile slide animation — translate Y (CSS transition)
          'max-md:transition-transform max-md:duration-[320ms] max-md:ease-[cubic-bezier(0.25,0.72,0,1)]',
          mobileOpen ? 'max-md:translate-y-0' : 'max-md:translate-y-full',
          // Desktop collapse: slide off to the right
          'md:transition-transform md:duration-[220ms] md:ease-[cubic-bezier(0.32,0.72,0,1)]',
          // Must clear its own right offset, not the old fixed 12px: the column
        // now starts a rail-width further in, so translating by 100%+12px left
        // a 48px sliver of it poking out over the camera controls.
        desktopCollapsed
          ? 'md:translate-x-[calc(100%+var(--panel-rail-clearance))] md:pointer-events-none'
          : 'md:translate-x-0',
        ].join(' ')}
        style={{ WebkitBackfaceVisibility: 'hidden' }}
      >
      {/* Mobile: drag handle + header row */}
      <div className="md:hidden flex flex-col items-center shrink-0">
        <div className="pt-[14px] pb-[6px] w-full flex justify-center">
          <div className="sheet-handle" />
        </div>
        <div className="flex items-center justify-between w-full px-5 pb-3">
          <span className="text-[13px] font-semibold tracking-tight" style={{ color: 'rgba(255,255,255,0.72)' }}>
            {t('panel')}
          </span>
          <button
            onClick={onMobileClose}
            className="flex items-center justify-center rounded-full active:scale-90 transition-transform"
            style={{ width: 28, height: 28, background: 'rgba(255,255,255,0.08)', color: 'rgba(255,255,255,0.4)' }}
            aria-label={t('actions.hidePanel')}
          >
            <svg width="10" height="10" viewBox="0 0 10 10" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round">
              <path d="M2 2l6 6M8 2l-6 6" />
            </svg>
          </button>
        </div>
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
                sceneModels={sceneModels}
                hidden={hidden}
                onToggleHidden={onToggleHidden}
                isolated={isolated}
                onSetIsolated={onSetIsolated}
                onFrame={onFrame}
                onSelectElement={onSelectElement}
                onFrameElement={onFrameElement}
                issuesByType={issuesByType}
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