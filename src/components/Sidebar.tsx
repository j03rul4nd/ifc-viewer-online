import React, { useState, useEffect, useMemo, useCallback } from 'react'
import { motion, AnimatePresence } from 'framer-motion'
import * as Icons from './Icons'
import { useValidationStore } from '../stores/validationStore'
import type { Category, SelectedInfo, SpatialNode } from '../types'

// ── Helpers ────────────────────────────────────────────────────────────────────

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

// ── Properties Panel ───────────────────────────────────────────────────────────

function PropertiesPanel({ selected, categories }: { selected: SelectedInfo | null; categories: Category[] }) {
  if (!selected) {
    return (
      <div className="px-6 py-10 text-center text-[var(--text-faint)]">
        <div className="w-10 h-10 mx-auto mb-3 rounded-[10px] bg-[var(--surface-2)] flex items-center justify-center text-[var(--text-dim)] border border-[var(--border)]">
          <Icons.Isolate size={18} />
        </div>
        <div className="text-[13px] text-[var(--text-dim)] mb-1">Nothing selected</div>
        <div className="text-[11.5px] leading-relaxed">
          Click any element in the viewer to inspect its IFC properties.
        </div>
      </div>
    )
  }

  const cat = categories.find(c => c.id === selected.type)
  const catColor = cat ? `#${cat.color.toString(16).padStart(6, '0')}` : 'var(--text-dim)'

  return (
    <motion.div initial={{ opacity: 0, x: 8 }} animate={{ opacity: 1, x: 0 }} transition={{ duration: 0.2 }}>
      <div className="px-4 py-3.5 border-b border-[var(--border)]">
        <div className="flex items-center gap-2 mb-2">
          <div className="w-2.5 h-2.5 rounded-[3px]" style={{ background: catColor }} />
          <span className="font-mono text-[10.5px] text-[var(--text-faint)] tracking-wider">{selected.type}</span>
        </div>
        <div className="text-[15px] font-semibold tracking-tight mb-1">{selected.name}</div>
        <div className="font-mono text-[10.5px] text-[var(--text-faint)]">Express ID: {selected.id}</div>
      </div>

      <div className="border-b border-[var(--border)]">
        <div className="px-4 pt-2.5 pb-1.5 text-[11px] font-semibold text-[var(--text-dim)] uppercase tracking-[0.06em] flex items-center gap-1.5">
          <Icons.Chevron size={10} className="rotate-90" />
          IFC Attributes
        </div>
        <div className="pb-2">
          {[
            ['Name', selected.name],
            ['Type', selected.type],
            ['Express ID', selected.id],
          ].map(([k, v]) => (
            <div key={k} className="flex px-4 py-1 text-[12px] items-baseline">
              <div className="w-[44%] flex-shrink-0 text-[11.5px] text-[var(--text-dim)]">{k}</div>
              <div className="flex-1 text-[var(--text)] break-words">{v}</div>
            </div>
          ))}
        </div>
      </div>
    </motion.div>
  )
}

// ── Category row ───────────────────────────────────────────────────────────────

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
  const hexColor  = `#${cat.color.toString(16).padStart(6, '0')}`
  const hasElem   = cat.elementIds.length > 0
  const visible   = cat.elementIds.slice(0, MAX_VISIBLE)
  const overflow  = cat.elementIds.length - MAX_VISIBLE

  return (
    <>
      {/* Category header row */}
      <div
        className="flex items-center gap-2 px-2 py-1.5 text-[12.5px] group transition-colors"
        style={{
          background:  isIsolated ? 'rgba(94,106,210,0.08)' : undefined,
          borderLeft:  isIsolated ? '2px solid var(--accent)' : '2px solid transparent',
          opacity:     isHidden   ? 0.45 : 1,
        }}
      >
        {/* Chevron expand/collapse */}
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

        {/* Color dot — click to toggle isolation */}
        <button
          onClick={() => onSetIsolated(isIsolated ? null : cat.id)}
          className="w-2.5 h-2.5 rounded-[3px] shrink-0 hover:scale-125 transition-transform cursor-pointer"
          style={{ background: hexColor, boxShadow: '0 0 0 1px rgba(0,0,0,0.4) inset' }}
          title={isIsolated ? 'Clear isolation' : 'Isolate (solo) category'}
        />

        {/* Label — click to frame in 3D */}
        <span
          className="flex-1 text-[var(--text)] cursor-pointer truncate hover:text-[var(--accent-2)] transition-colors"
          onClick={() => onFrame(cat.id)}
          title="Frame in 3D view"
        >
          {cat.label}
        </span>

        {/* Count */}
        <span className="font-mono text-[11px] text-[var(--text-faint)] shrink-0">{cat.count}</span>

        {/* Eye toggle */}
        <button
          onClick={e => { e.stopPropagation(); onToggleHidden(cat.id) }}
          className="p-0.5 rounded text-[var(--text-dim)] hover:bg-[var(--border)] shrink-0"
          title={isHidden ? 'Show' : 'Hide'}
        >
          {isHidden ? <Icons.EyeOff size={14} /> : <Icons.Eye size={14} />}
        </button>
      </div>

      {/* Expanded element list */}
      <AnimatePresence initial={false}>
        {isExpanded && (
          <motion.div
            initial={{ height: 0, opacity: 0 }}
            animate={{ height: 'auto', opacity: 1 }}
            exit={{ height: 0, opacity: 0 }}
            transition={{ duration: 0.18, ease: 'easeInOut' }}
            style={{ overflow: 'hidden' }}
          >
            <div
              className="ml-8 mr-2 mb-1 rounded-lg border border-[var(--border)] overflow-y-auto"
              style={{ maxHeight: 180 }}
            >
              {visible.map(eid => {
                const name = nameMap.get(eid) ?? `#${eid}`
                return (
                  <button
                    key={eid}
                    onClick={() => { onSelectElement?.(eid); onFrameElement?.(eid) }}
                    className="w-full flex items-center gap-2 px-2.5 py-1 text-left hover:bg-[var(--surface-2)] transition-colors group/elem"
                  >
                    <span
                      className="w-1.5 h-1.5 rounded-full shrink-0"
                      style={{ background: hexColor, opacity: 0.7 }}
                    />
                    <span className="flex-1 truncate text-[11.5px] text-[var(--text-dim)] group-hover/elem:text-[var(--text)]">
                      {name}
                    </span>
                    <span className="font-mono text-[9.5px] text-[var(--text-faint)] shrink-0 opacity-0 group-hover/elem:opacity-100">
                      {eid}
                    </span>
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

// ── Category Panel ─────────────────────────────────────────────────────────────

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

// ── Main Sidebar ───────────────────────────────────────────────────────────────

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
}

export default function Sidebar({
  categories, elementCount, selected, hidden, onToggleHidden,
  isolated, onSetIsolated, onFrame, onSelectElement, onFrameElement,
}: SidebarProps) {
  const [tab, setTab] = useState<'props' | 'cats'>('props')
  useEffect(() => { if (selected) setTab('props') }, [selected])

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
          <button key={id} onClick={() => setTab(id)}
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
              <PropertiesPanel selected={selected} categories={categories} />
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
