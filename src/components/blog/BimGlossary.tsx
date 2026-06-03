// ─── BIM Glossary ─────────────────────────────────────────────────────────────
// Inline tooltip for BIM/IFC terms + a collapsible glossary section at the
// bottom of articles. Helps readers who are new to the terminology
// without interrupting the flow for those who already know it.

import React, { useState } from 'react'
import * as Tooltip from '@radix-ui/react-tooltip'
import { motion, AnimatePresence } from 'framer-motion'

// ── Term database ─────────────────────────────────────────────────────────────

export const BIM_TERMS: Record<string, string> = {
  CDE:    'Common Data Environment — a shared digital space for managing project information. Examples: Autodesk ACC, Trimble Connect, Dalux, BIM 360.',
  BCF:    'BIM Collaboration Format — an open format for communicating coordination issues between BIM tools. A BCF comment links a viewpoint in the 3D model to a written issue.',
  GUID:   'Globally Unique Identifier — a permanent 22-character string that identifies an IFC element across software, versions, and revisions. Must be globally unique.',
  GlobalId: 'The IFC attribute name for an element\'s GUID. Every IfcRoot subclass has one.',
  IFC:    'Industry Foundation Classes — the ISO 16739-1 open standard for BIM data exchange, maintained by buildingSMART. File extension: .ifc.',
  BEP:    'BIM Execution Plan — a project document that defines who delivers what BIM data, in what format, to what quality standard.',
  EIR:    'Employer\'s Information Requirements — the contractual document specifying what BIM data a client requires from the design/construction team.',
  LOD:    'Level of Development (or Level of Detail) — a scale (100–500) describing how much geometric and data information an IFC element must contain at each project stage.',
  LOIN:   'Level of Information Need — ISO 17412 framework defining the required information for specific purposes (geometric, documentation, alphanumeric).',
  MEP:    'Mechanical, Electrical, Plumbing — the building services disciplines. MEP models often contain IfcDuctSegment, IfcPipeSegment, IfcCableCarrierSegment.',
  COBie:  'Construction Operations Building Information Exchange — a spreadsheet format for building handover data, keyed to IFC GlobalIds.',
  Pset:   'Property Set — a named group of properties attached to an IFC element. Standard Psets (Pset_WallCommon, Pset_DoorCommon, …) are defined by buildingSMART.',
  STEP:   'Standard for the Exchange of Product model data — ISO 10303. The file format underlying IFC (.ifc files are STEP Part 21 ASCII).',
  IfcProject: 'The root entity of every IFC file. Exactly one IfcProject must exist; it anchors the spatial hierarchy.',
  IfcSite: 'The second level of the IFC spatial hierarchy (Project → Site → Building → Storey).',
  IfcBuilding: 'Represents a physical building in the IFC hierarchy. Contains IfcBuildingStorey children.',
  IfcBuildingStorey: 'A floor or level within a building. Physical elements are contained inside storeys.',
  IfcRelAggregates: 'The IFC relationship that builds the spatial hierarchy tree (Project → Site → Building → Storey).',
  IfcRelContainedInSpatialStructure: 'The IFC relationship that places physical elements inside a spatial structure element (storey, building, site).',
  WCS:    'World Coordinate System — the absolute reference frame in a 3D model. Large coordinate offsets (>10 km from origin) cause floating-point precision errors in viewers.',
  ISO19650: 'ISO 19650 — the international standard for managing information over the whole life cycle of a built asset using BIM. Part 2 covers capital delivery.',
  Uniclass: 'A UK classification system for construction works, maintained by NBS. Used for IfcRelAssociatesClassification in ISO 19650-compliant models.',
  OmniClass: 'A North American BIM classification system. Used for IfcRelAssociatesClassification in US/Canadian projects.',
  IFC4:   'The current IFC schema version — ISO 16739-1:2018. Introduces tessellated geometry (smaller files), improved material layers, and proper quantities.',
  'IFC2x3': 'The legacy IFC schema from 2006. Still widely used but superseded by IFC4. Some CDEs still require it.',
}

// ── Inline term tooltip ───────────────────────────────────────────────────────

interface TermProps {
  term: string
  children: React.ReactNode
}

export function BimTerm({ term, children }: TermProps) {
  const definition = BIM_TERMS[term]
  if (!definition) return <>{children}</>

  return (
    <Tooltip.Provider delayDuration={300}>
      <Tooltip.Root>
        <Tooltip.Trigger asChild>
          <span
            className="border-b border-dashed border-[rgba(94,106,210,0.5)] cursor-help text-[var(--text)]
                       hover:border-[var(--accent)] hover:text-white transition-colors"
          >
            {children}
          </span>
        </Tooltip.Trigger>
        <Tooltip.Portal>
          <Tooltip.Content
            side="top"
            align="center"
            sideOffset={6}
            className="max-w-[300px] px-3 py-2.5 rounded-xl border border-[var(--border-strong)]
                       bg-[rgba(16,16,20,0.96)] backdrop-blur-lg text-[12.5px] leading-[1.55]
                       text-[var(--text-dim)] shadow-xl z-50 select-none"
          >
            <span className="font-semibold text-[var(--text)]">{term}</span>
            {' — '}
            {definition}
            <Tooltip.Arrow className="fill-[var(--border-strong)]" />
          </Tooltip.Content>
        </Tooltip.Portal>
      </Tooltip.Root>
    </Tooltip.Provider>
  )
}

// ── Glossary section ──────────────────────────────────────────────────────────
// Shows a filterable glossary section at the bottom of the article,
// listing only the terms that appear in the article text.

interface GlossaryProps {
  /** Filter to only terms relevant to this article. Pass empty array to show all. */
  highlight?: string[]
}

export default function BimGlossary({ highlight = [] }: GlossaryProps) {
  const [open,   setOpen]   = useState(false)
  const [filter, setFilter] = useState('')

  const terms = Object.entries(BIM_TERMS)
  const shown = terms.filter(([term]) => {
    const matchFilter  = !filter || term.toLowerCase().includes(filter.toLowerCase())
    const matchHighlight = highlight.length === 0 || highlight.includes(term)
    return matchFilter && (highlight.length > 0 ? matchHighlight : true)
  })

  if (shown.length === 0) return null

  return (
    <div className="mt-10 border border-[var(--border)] rounded-2xl overflow-hidden">
      <button
        onClick={() => setOpen(v => !v)}
        className="w-full flex items-center justify-between px-4 sm:px-5 py-4 bg-[var(--surface)] hover:bg-[var(--surface-2)] transition-colors min-h-[60px]"
      >
        <div className="flex items-center gap-3">
          <span className="text-lg">📖</span>
          <div className="text-left">
            <div className="text-[13.5px] font-semibold text-[var(--text)]">BIM Glossary</div>
            <div className="text-[11.5px] text-[var(--text-faint)] mt-0.5">
              {shown.length} terms used in this article
            </div>
          </div>
        </div>
        <svg
          width="14" height="14" viewBox="0 0 14 14" fill="none"
          stroke="currentColor" strokeWidth="1.5" strokeLinecap="round"
          className={`text-[var(--text-faint)] transition-transform ${open ? 'rotate-180' : ''}`}
        >
          <path d="M2 5l5 5 5-5" />
        </svg>
      </button>

      <AnimatePresence>
        {open && (
          <motion.div
            initial={{ height: 0 }} animate={{ height: 'auto' }} exit={{ height: 0 }}
            className="overflow-hidden border-t border-[var(--border)]"
          >
            {shown.length > 5 && (
              <div className="px-5 pt-4 pb-1">
                <input
                  type="text"
                  placeholder="Search terms…"
                  value={filter}
                  onChange={e => setFilter(e.target.value)}
                  className="w-full h-8 px-3 rounded-lg text-[13px] border bg-[var(--surface-2)]
                             text-[var(--text)] placeholder:text-[var(--text-faint)]
                             outline-none focus:border-[var(--accent)] transition-colors"
                  style={{ borderColor: 'var(--border)' }}
                />
              </div>
            )}

            <dl className="px-5 py-4 grid gap-3">
              {shown.map(([term, def]) => (
                <div key={term} className="grid grid-cols-[auto_1fr] gap-x-3 gap-y-0.5">
                  <dt className="font-mono text-[12px] font-bold text-[var(--accent-2)] pt-[2px] whitespace-nowrap">
                    {term}
                  </dt>
                  <dd className="text-[13px] leading-[1.6] text-[var(--text-dim)]">
                    {def}
                  </dd>
                </div>
              ))}
            </dl>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  )
}
