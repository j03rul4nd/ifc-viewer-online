import React, { useState, useEffect } from 'react'
import { motion, AnimatePresence } from 'framer-motion'
import * as Icons from './Icons'
import type { Category, SelectedInfo } from '../types'

// ---------- Properties Panel ----------
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

// ---------- Category Panel ----------
function CategoryPanel({ categories, elementCount, hidden, onToggleHidden, isolated, onSetIsolated, onFrame }: {
  categories: Category[]
  elementCount: number
  hidden: Set<string>
  onToggleHidden: (id: string) => void
  isolated: string | null
  onSetIsolated: (id: string | null) => void
  onFrame: (id: string) => void
}) {
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
          <button onClick={() => onSetIsolated(null)} className="text-[11px] text-[var(--accent-2)]">Clear isolation</button>
        )}
      </div>
      <div>
        {categories.map(cat => {
          const isHidden = hidden.has(cat.id)
          const isIsolated = isolated === cat.id
          const hexColor = `#${cat.color.toString(16).padStart(6, '0')}`
          return (
            <div
              key={cat.id}
              className="flex items-center gap-2 px-3.5 py-1.5 text-[12.5px] cursor-pointer transition-colors"
              style={{
                background: isIsolated ? 'rgba(94,106,210,0.08)' : undefined,
                borderLeft: isIsolated ? '2px solid var(--accent)' : '2px solid transparent',
                opacity: isHidden ? 0.45 : 1,
              }}
              onClick={() => { onFrame(cat.id); onSetIsolated(isIsolated ? null : cat.id) }}
            >
              <div className="w-2.5 h-2.5 rounded-[3px] flex-shrink-0" style={{ background: hexColor, boxShadow: '0 0 0 1px rgba(0,0,0,0.4) inset' }} />
              <span className="flex-1 text-[var(--text)]">{cat.label}</span>
              <span className="font-mono text-[11px] text-[var(--text-faint)]">{cat.count}</span>
              <button
                onClick={e => { e.stopPropagation(); onToggleHidden(cat.id) }}
                className="p-0.5 rounded text-[var(--text-dim)] hover:bg-[var(--border)]"
              >
                {isHidden ? <Icons.EyeOff size={14} /> : <Icons.Eye size={14} />}
              </button>
            </div>
          )
        })}
      </div>
    </div>
  )
}

// ---------- Main Sidebar ----------
interface SidebarProps {
  categories: Category[]
  elementCount: number
  selected: SelectedInfo | null
  hidden: Set<string>
  onToggleHidden: (id: string) => void
  isolated: string | null
  onSetIsolated: (id: string | null) => void
  onFrame: (id: string) => void
}

export default function Sidebar({ categories, elementCount, selected, hidden, onToggleHidden, isolated, onSetIsolated, onFrame }: SidebarProps) {
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
              color: tab === id ? 'var(--text)' : 'var(--text-dim)',
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
              />
            </motion.div>
          )}
        </AnimatePresence>
      </div>
    </motion.div>
  )
}
