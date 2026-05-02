import React, { useState, useEffect, useMemo, useCallback, useRef } from 'react'
import { motion, AnimatePresence } from 'framer-motion'
import * as Icons from './Icons'
import { useValidationStore } from '../stores/validationStore'
import { useUIStore } from '../stores/uiStore'
import { useEditorHistory } from '../hooks/useEditorHistory'
import { useEditorStore } from '../stores/editorStore'
import { buildRenameCommand } from '../lib/diffStore'
import type { Category, SelectedInfo, SpatialNode, SpatialElement, ValidationIssue } from '../types'

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
    // check contained elements
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

// ─── sub-components ───────────────────────────────────────────────────────────

function SectionHeader({ label, open, onToggle }: { label: string; open: boolean; onToggle: () => void }) {
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

  useEffect(() => { setDraft(value) }, [value])
  useEffect(() => { if (editing) inputRef.current?.focus() }, [editing])

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
          <span
            className="w-1.5 h-1.5 rounded-full bg-[var(--accent)] shrink-0"
            title="Unsaved change"
          />
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
            {value || <span className="text-[var(--text-faint)] italic">empty</span>}
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

// ─── Properties Panel ──────────────────────────────────────────────────────────

interface PropertiesPanelProps {
  selected: SelectedInfo | null
  categories: Category[]
  onFrame?: (expressId: number) => void
  onRevealInTree?: (expressId: number) => void
  onIsolate?: () => void
}

function PropertiesPanel({
  selected, categories, onFrame, onRevealInTree, onIsolate,
}: PropertiesPanelProps) {
  const { spatialTree, result } = useValidationStore()
  const { hiddenElements, setElementsVisible } = useUIStore()
  const { addCommand } = useEditorHistory()
  const { diffs } = useEditorStore()

  const [sections, setSections] = useState({
    location: true,
    visibility: true,
    attributes: true,
    validation: true,
  })
  const toggle = (key: keyof typeof sections) =>
    setSections(s => ({ ...s, [key]: !s[key] }))

  // Spatial path
  const spatialPath = useMemo(() => {
    if (!selected) return null
    return findSpatialPath(spatialTree, parseInt(selected.id, 10))
  }, [selected, spatialTree])

  // Issues for this element
  const elementIssues = useMemo(() => {
    if (!selected || !result) return []
    const id = parseInt(selected.id, 10)
    return result.issues.filter(i => i.expressId === id)
  }, [selected, result])

  // Pending diffs for this element
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

  const getDisplayValue = (field: string, fallback: string) =>
    pendingDiffs.get(field) ?? fallback

  const handleRename = useCallback((field: 'Name' | 'LongName' | 'Description', newVal: string) => {
    if (!selected) return
    const id = parseInt(selected.id, 10)
    const currentVal = pendingDiffs.get(field) ?? (field === 'Name' ? selected.name : '')
    addCommand(buildRenameCommand(id, field, currentVal, newVal))
  }, [selected, pendingDiffs, addCommand])

  if (!selected) {
    return (
      <div className="px-6 py-10 text-center">
        <div className="w-10 h-10 mx-auto mb-3 rounded-[10px] bg-[var(--surface-2)] flex items-center justify-center text-[var(--text-dim)] border border-[var(--border)]">
          <Icons.Isolate size={18} />
        </div>
        <div className="text-[13px] text-[var(--text-dim)] mb-1">Nothing selected</div>
        <div className="text-[11.5px] text-[var(--text-faint)] leading-relaxed">
          Click any element in the viewer to inspect its IFC properties.
        </div>
      </div>
    )
  }

  const expressId = parseInt(selected.id, 10)
  const cat = categories.find(c => c.id === selected.type || c.id === selected.type.replace('STANDARDCASE', ''))
  const catColor = cat ? `#${cat.color.toString(16).padStart(6, '0')}` : 'var(--text-dim)'
  const isHidden = hiddenElements.has(expressId)
  const hasDirty = pendingDiffs.size > 0
  const errorCount   = elementIssues.filter(i => i.severity === 'error').length
  const warningCount = elementIssues.filter(i => i.severity === 'warning').length

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
          <div
            className="w-2.5 h-2.5 rounded-[3px] shrink-0"
            style={{ background: catColor }}
          />
          <span className="font-mono text-[10px] text-[var(--text-faint)] tracking-wider uppercase">
            {selected.type}
          </span>
          {hasDirty && (
            <span className="ml-auto text-[10px] px-1.5 py-0.5 rounded-full bg-[var(--accent)] text-white font-medium leading-none">
              edited
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
        </div>

        {/* Name */}
        <div className="text-[15px] font-semibold tracking-tight mb-1.5 leading-snug">
          {getDisplayValue('Name', selected.name)}
        </div>

        {/* Express ID + copy */}
        <div className="flex items-center gap-2">
          <span className="font-mono text-[10.5px] text-[var(--text-faint)]">
            #{selected.id}
          </span>
          <CopyButton value={selected.id} label="ID" />
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
            Frame
          </button>
          <button
            onClick={() => onIsolate?.()}
            className="flex items-center gap-1.5 h-7 px-2.5 rounded-lg bg-[var(--surface-2)] border border-[var(--border)] text-[11px] text-[var(--text-dim)] hover:text-[var(--text)] hover:border-[var(--accent)] transition-colors"
          >
            <Icons.Isolate size={11} />
            Isolate
          </button>
          <button
            onClick={() => onRevealInTree?.(expressId)}
            className="flex items-center gap-1.5 h-7 px-2.5 rounded-lg bg-[var(--surface-2)] border border-[var(--border)] text-[11px] text-[var(--text-dim)] hover:text-[var(--text)] hover:border-[var(--accent)] transition-colors"
            title="Reveal in spatial tree"
          >
            <svg width="11" height="11" viewBox="0 0 12 12" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round">
              <path d="M1 2h2M1 6h4M1 10h2" />
              <circle cx="9" cy="6" r="3" />
              <path d="M11 8l1.5 1.5" />
            </svg>
            Tree
          </button>
          <button
            onClick={() => setElementsVisible([expressId], isHidden)}
            className={`flex items-center gap-1.5 h-7 px-2.5 rounded-lg border text-[11px] transition-colors ${
              isHidden
                ? 'bg-[var(--accent)] border-[var(--accent)] text-white'
                : 'bg-[var(--surface-2)] border-[var(--border)] text-[var(--text-dim)] hover:text-[var(--text)] hover:border-[var(--accent)]'
            }`}
          >
            {isHidden ? <Icons.EyeOff size={11} /> : <Icons.Eye size={11} />}
            {isHidden ? 'Show' : 'Hide'}
          </button>
        </div>
      </div>

      {/* ── Location ── */}
      <div className="border-b border-[var(--border)]">
        <SectionHeader label="Location" open={sections.location} onToggle={() => toggle('location')} />
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
                    Not found in spatial tree
                  </span>
                )}

                {/* Category */}
                <div className="mt-2 flex items-center gap-2">
                  <span className="text-[11px] text-[var(--text-dim)]">Category</span>
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
        <SectionHeader label="Visibility" open={sections.visibility} onToggle={() => toggle('visibility')} />
        <AnimatePresence initial={false}>
          {sections.visibility && (
            <motion.div initial={{ height: 0 }} animate={{ height: 'auto' }} exit={{ height: 0 }} transition={{ duration: 0.15 }} style={{ overflow: 'hidden' }}>
              <div className="px-4 pb-3 flex items-center justify-between">
                <div className="flex items-center gap-2">
                  <div
                    className="w-2 h-2 rounded-full"
                    style={{ background: isHidden ? '#E5484D' : '#30A46C' }}
                  />
                  <span className="text-[12px] text-[var(--text)]">
                    {isHidden ? 'Hidden' : 'Visible'}
                  </span>
                </div>
                <button
                  onClick={() => setElementsVisible([expressId], isHidden)}
                  className={`h-6 px-2.5 rounded-md text-[11px] font-medium transition-colors border ${
                    isHidden
                      ? 'bg-[#30A46C22] border-[#30A46C44] text-[#30A46C] hover:bg-[#30A46C33]'
                      : 'bg-[#E5484D22] border-[#E5484D44] text-[#E5484D] hover:bg-[#E5484D33]'
                  }`}
                >
                  {isHidden ? 'Show element' : 'Hide element'}
                </button>
              </div>
            </motion.div>
          )}
        </AnimatePresence>
      </div>

      {/* ── IFC Attributes ── */}
      <div className="border-b border-[var(--border)]">
        <SectionHeader label="IFC Attributes" open={sections.attributes} onToggle={() => toggle('attributes')} />
        <AnimatePresence initial={false}>
          {sections.attributes && (
            <motion.div initial={{ height: 0 }} animate={{ height: 'auto' }} exit={{ height: 0 }} transition={{ duration: 0.15 }} style={{ overflow: 'hidden' }}>
              <div className="pb-2">
                <EditableField
                  label="Name"
                  value={getDisplayValue('Name', selected.name)}
                  isDirty={pendingDiffs.has('Name')}
                  onCommit={v => handleRename('Name', v)}
                />
                <EditableField
                  label="LongName"
                  value={getDisplayValue('LongName', '')}
                  isDirty={pendingDiffs.has('LongName')}
                  onCommit={v => handleRename('LongName', v)}
                />
                <EditableField
                  label="Description"
                  value={getDisplayValue('Description', '')}
                  isDirty={pendingDiffs.has('Description')}
                  onCommit={v => handleRename('Description', v)}
                />

                {/* Read-only fields */}
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

                {/* Dirty indicator + undo tip */}
                {hasDirty && (
                  <div className="mx-4 mt-2 px-2.5 py-1.5 rounded-lg bg-[var(--accent)] bg-opacity-10 border border-[var(--accent)] border-opacity-30 flex items-center gap-2">
                    <svg width="11" height="11" viewBox="0 0 12 12" fill="none" stroke="var(--accent-2)" strokeWidth="1.5" strokeLinecap="round">
                      <circle cx="6" cy="6" r="5" />
                      <path d="M6 4v3M6 8.5v.5" />
                    </svg>
                    <span className="text-[10.5px] text-[var(--accent-2)]">
                      {pendingDiffs.size} unsaved change{pendingDiffs.size > 1 ? 's' : ''} · Ctrl+Z to undo
                    </span>
                  </div>
                )}
              </div>
            </motion.div>
          )}
        </AnimatePresence>
      </div>

      {/* ── Validation ── */}
      {elementIssues.length > 0 && (
        <div className="border-b border-[var(--border)]">
          <SectionHeader
            label={`Validation · ${elementIssues.length} issue${elementIssues.length > 1 ? 's' : ''}`}
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
                <div className="px-2.5 py-1 text-[11px] text-[var(--text-faint)] italic">
                  + {overflow} more elements
                </div>
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
  const { spatialTree } = useValidationStore()
  const nameMap = useMemo(() => buildNameMap(spatialTree), [spatialTree])
  const [expanded, setExpanded] = useState<Set<string>>(new Set())
  const toggleExpand = useCallback((id: string) => {
    setExpanded(prev => {
      const next = new Set(prev)
      next.has(id) ? next.delete(id) : next.add(id)
      return next
    })
  }, [])

  if (categories.length === 0) {
    return (
      <div className="px-6 py-10 text-center text-[var(--text-faint)]">
        <div className="text-[13px] text-[var(--text-dim)] mb-1">No model loaded</div>
        <div className="text-[11.5px]">Open an IFC file to see categories.</div>
      </div>
    )
  }

  return (
    <div className="py-2">
      <div className="px-3.5 pt-1 pb-2.5 flex items-center justify-between">
        <div>
          <div className="text-[11.5px] font-semibold text-[var(--text-dim)] uppercase tracking-[0.06em]">Categories</div>
          <div className="text-[11px] text-[var(--text-faint)] mt-0.5">{categories.length} types · {elementCount} elements</div>
        </div>
        {isolated && (
          <button onClick={() => onSetIsolated(null)} className="text-[11px] text-[var(--accent-2)]">
            Clear isolation
          </button>
        )}
      </div>
      <div>
        {categories.map(cat => (
          <CategoryRow
            key={cat.id}
            cat={cat}
            isHidden={hidden.has(cat.id)}
            isIsolated={isolated === cat.id}
            isExpanded={expanded.has(cat.id)}
            nameMap={nameMap}
            onToggleHidden={onToggleHidden}
            onSetIsolated={onSetIsolated}
            onFrame={onFrame}
            onToggleExpand={toggleExpand}
            onSelectElement={onSelectElement}
            onFrameElement={onFrameElement}
          />
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
}

export default function Sidebar({
  categories, elementCount, selected, hidden, onToggleHidden,
  isolated, onSetIsolated, onFrame, onSelectElement, onFrameElement, onRevealInTree,
}: SidebarProps) {
  const [tab, setTab] = useState<'props' | 'cats'>('props')

  useEffect(() => { if (selected) setTab('props') }, [selected])

  const handleFrame = useCallback((id: number) => {
    onFrameElement?.(id)
  }, [onFrameElement])

  const handleIsolate = useCallback(() => {
    if (!selected) return
    onSetIsolated(selected.type)
  }, [selected, onSetIsolated])

  return (
    <motion.div
      initial={{ opacity: 0, x: 16 }}
      animate={{ opacity: 1, x: 0 }}
      transition={{ duration: 0.4, ease: 'easeOut', delay: 0.1 }}
      className="absolute top-[68px] right-3 bottom-3 w-[340px] z-[9] bg-[rgba(16,16,20,0.82)] backdrop-blur-[14px] border border-[var(--border)] rounded-xl flex flex-col overflow-hidden"
    >
      {/* Tabs */}
      <div className="flex p-1.5 gap-0.5 border-b border-[var(--border)]">
        {([['props', 'Properties'], ['cats', 'Categories']] as const).map(([id, label]) => (
          <button
            key={id}
            onClick={() => setTab(id)}
            className="flex-1 h-7 text-[12px] font-medium rounded-[6px] transition-colors"
            style={{
              background: tab === id ? 'var(--surface-2)' : 'transparent',
              color:      tab === id ? 'var(--text)' : 'var(--text-dim)',
            }}
          >
            {label}
          </button>
        ))}
      </div>

      <div className="flex-1 overflow-y-auto">
        <AnimatePresence mode="wait">
          {tab === 'props' && (
            <motion.div key="props" initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}>
              <PropertiesPanel
                selected={selected}
                categories={categories}
                onFrame={handleFrame}
                onRevealInTree={onRevealInTree}
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
        </AnimatePresence>
      </div>
    </motion.div>
  )
}