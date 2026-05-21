// ─── ValidationPanel ─────────────────────────────────────────────────────────
// Bottom panel with drag-to-resize handle, 2-row header, profile card-grid
// dropdown, compact coverage strip, responsive toolbar, redesigned issue rows,
// 3-state run button, 3 SVG empty states, and BCF tab.

import React, {
  useState, useRef, useEffect, useMemo, useCallback, useLayoutEffect,
} from 'react'
import { useShallow } from 'zustand/react/shallow'
import { useValidationStore } from '../stores/validationStore'
import { useEditorStore } from '../stores/editorStore'
import { useUIStore } from '../stores/uiStore'
import { useModelStore } from '../stores/modelStore'
import { useSceneStore } from '../stores/sceneStore'
import { useBcfStore } from '../stores/bcfStore'
import { buildFixGuidCommand, buildRenameCommand, downloadBlob } from '../lib/diffStore'
import { useEditorHistory } from '../hooks/useEditorHistory'
import { runValidation } from '../lib/validator'
import { importBcf, issuesToBcfTopics, downloadBcfBlob } from '../lib/bcf'
import type {
  ValidationIssue, ValidationCertificate, SupportedLocale, BcfTopic, ViewerHandle,
  ValidationCategoryType,
} from '../types'
import { VALIDATION_PROFILES, RULE_METADATA, getRuleLabel, VALIDATION_CATEGORY_LABELS } from '../types'
import { getCoveredCategories, ALL_CATEGORIES } from './ValidationCoverageSummary'
import CustomProfileModal from './CustomProfileModal'

// ── Locale detection ──────────────────────────────────────────────────────────

function detectLocale(): SupportedLocale {
  const lang = (typeof navigator !== 'undefined' ? navigator.language : 'es').toLowerCase()
  if (lang.startsWith('en')) return 'en'
  if (lang.startsWith('de')) return 'de'
  if (lang.startsWith('fr')) return 'fr'
  if (lang.startsWith('pt')) return 'pt'
  return 'es'
}

const UI_LOCALE = detectLocale()

// ── Resize constants ──────────────────────────────────────────────────────────

const MIN_PANEL_H = 180
const DEFAULT_PANEL_H = 360

// ── Severity helpers ──────────────────────────────────────────────────────────

function severityBorderColor(sev: ValidationIssue['severity']): string {
  if (sev === 'error')   return 'var(--danger)'
  if (sev === 'warning') return '#F5A623'
  return '#5E9ED6'
}

function SeverityDot({ severity }: { severity: ValidationIssue['severity'] }) {
  return (
    <span
      className="shrink-0 w-1.5 h-1.5 rounded-full mt-1.5"
      style={{ background: severityBorderColor(severity), flexShrink: 0 }}
    />
  )
}

// ── Rule badge ────────────────────────────────────────────────────────────────

function RuleBadge({ ruleId }: { ruleId: string }) {
  const meta   = RULE_METADATA[ruleId]
  const label  = getRuleLabel(ruleId, UI_LOCALE)
  const sev    = meta?.defaultSeverity ?? 'info'
  const color  = sev === 'error' ? 'var(--danger)' : sev === 'warning' ? '#F5A623' : '#5E9ED6'
  const std    = meta?.standard

  return (
    <span className="inline-flex items-center gap-1">
      <span
        className="px-1.5 py-0.5 rounded text-[9px] font-mono font-bold leading-none shrink-0"
        style={{ background: `${color}18`, color, border: `1px solid ${color}30` }}
        title={std ? `${label} · ${std}` : label}
      >
        {label}
      </span>
      {std && (
        <span className="text-[9px] text-[var(--text-faint)] font-mono leading-none shrink-0 hidden sm:inline">
          {std}
        </span>
      )}
    </span>
  )
}

// ── Path breadcrumb ───────────────────────────────────────────────────────────

function PathBreadcrumb({ path }: { path: string[] }) {
  if (path.length === 0) return null
  return (
    <span
      className="text-[10px] text-[var(--text-faint)] truncate max-w-[200px]"
      title={path.join(' › ')}
    >
      {path.join(' › ')}
    </span>
  )
}

// ── Which rules allow inline name editing ─────────────────────────────────────

const NAME_EDIT_RULES = new Set([
  'RULE_EMPTY_NAME', 'RULE_EMPTY_LONGNAME', 'RULE_DUPLICATE_NAME', 'RULE_NAMING_CONVENTION',
])

function getEditField(ruleId: string): 'Name' | 'LongName' {
  return ruleId === 'RULE_EMPTY_LONGNAME' ? 'LongName' : 'Name'
}

// ── Issue row ─────────────────────────────────────────────────────────────────

function IssueRow({
  issue, hasPendingFix, onJumpTo, onAutoFix, onNameFix,
}: {
  issue: ValidationIssue
  hasPendingFix: boolean
  onJumpTo: (issue: ValidationIssue) => void
  onAutoFix: (issue: ValidationIssue) => void
  onNameFix: (issue: ValidationIssue, field: 'Name' | 'LongName', newValue: string) => void
}) {
  const [editing, setEditing]     = useState(false)
  const [editValue, setEditValue] = useState('')
  const inputRef = useRef<HTMLInputElement>(null)
  const isNameEditable = NAME_EDIT_RULES.has(issue.ruleId)

  const startEdit = (): void => {
    setEditValue(issue.elementName === '(empty)' ? '' : issue.elementName)
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

  const borderColor = hasPendingFix ? 'var(--ok)' : severityBorderColor(issue.severity)

  return (
    <>
      <div
        className="flex items-start gap-2.5 px-3 py-2.5 border-b border-[var(--border)] hover:bg-[var(--surface-2)] group transition-colors"
        style={{ borderLeft: `3px solid ${borderColor}`, paddingLeft: 10 }}
      >
        <SeverityDot severity={issue.severity} />

        {/* Main content */}
        <div className="flex-1 min-w-0 flex flex-col gap-1">
          {/* Row 1: rule badge + edited badge */}
          <div className="flex items-center gap-2 flex-wrap min-w-0">
            <RuleBadge ruleId={issue.ruleId} />
            {hasPendingFix && (
              <span className="text-[9px] font-mono text-[var(--ok)] border border-[var(--ok)]33 px-1 rounded leading-none">
                editado
              </span>
            )}
          </div>
          {/* Row 2: element name + class */}
          <div className="flex items-center gap-2 min-w-0">
            <span className="text-[12px] text-[var(--text)] font-medium truncate max-w-[180px]">
              {issue.elementName}
            </span>
            <span className="text-[10px] text-[var(--text-faint)] font-mono shrink-0">
              {issue.ifcClass}
            </span>
          </div>
          {/* Row 3: message */}
          <p className="text-[11px] text-[var(--text-dim)] leading-snug">{issue.message}</p>
          <PathBreadcrumb path={issue.path} />
        </div>

        {/* Actions */}
        <div className="flex items-center gap-1 shrink-0 opacity-0 group-hover:opacity-100 [@media(pointer:coarse)]:opacity-100 transition-opacity">
          {isNameEditable && (
            <button
              onClick={() => editing ? setEditing(false) : startEdit()}
              className="px-2 h-6 rounded text-[10px] font-medium border transition-colors"
              style={
                editing
                  ? { background: 'var(--surface-2)', color: 'var(--text-dim)', borderColor: 'var(--border)' }
                  : { background: 'var(--accent)18', color: 'var(--accent)', borderColor: 'var(--accent)33' }
              }
            >
              {editing ? 'Cancelar' : hasPendingFix ? 'Re-editar' : 'Renombrar'}
            </button>
          )}
          {issue.autoFixable && !isNameEditable && (
            <button
              onClick={() => onAutoFix(issue)}
              className="px-2 h-6 rounded text-[10px] font-medium border transition-colors"
              style={{ background: 'var(--ok)18', color: 'var(--ok)', borderColor: 'var(--ok)33' }}
            >
              Auto-fix
            </button>
          )}
          <button
            onClick={() => onJumpTo(issue)}
            className="px-2 h-6 rounded text-[10px] font-medium bg-[var(--surface-2)] text-[var(--text-dim)] border border-[var(--border)] hover:text-[var(--text)] active:bg-[var(--border)] transition-colors"
          >
            Ver
          </button>
        </div>
      </div>

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
            placeholder={`Nuevo ${getEditField(issue.ruleId).toLowerCase()}…`}
            className="flex-1 h-7 px-2 text-[12px] bg-[var(--surface)] border border-[var(--accent)] rounded text-[var(--text)] placeholder:text-[var(--text-faint)] outline-none"
          />
          <button
            onClick={commitEdit}
            disabled={!editValue.trim()}
            className="px-2.5 h-7 rounded text-[11px] bg-[var(--accent)] text-white font-medium hover:brightness-110 disabled:opacity-40"
          >
            Aplicar
          </button>
          <button
            onClick={() => setEditing(false)}
            className="w-7 h-7 flex items-center justify-center rounded text-[var(--text-faint)] hover:text-[var(--text)]"
          >
            <svg width="10" height="10" viewBox="0 0 10 10" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round">
              <path d="M2 2l6 6M8 2L2 8" />
            </svg>
          </button>
        </div>
      )}
    </>
  )
}

// ── Group header ──────────────────────────────────────────────────────────────

function GroupHeader({ label, count, ruleId }: { label: string; count: number; ruleId?: string }) {
  const meta  = ruleId ? RULE_METADATA[ruleId] : undefined
  const sev   = meta?.defaultSeverity
  const color = sev === 'error' ? 'var(--danger)' : sev === 'warning' ? '#F5A623' : undefined
  const std   = meta?.standard

  return (
    <div className="px-3 py-1.5 bg-[var(--surface)] border-b border-[var(--border)] flex items-center justify-between gap-2 sticky top-0 z-10">
      <div className="flex items-center gap-2 min-w-0">
        <span
          className="text-[10px] font-semibold uppercase tracking-wider truncate"
          style={{ color: color ?? 'var(--text-dim)' }}
        >
          {label}
        </span>
        {std && (
          <span className="text-[9px] font-mono text-[var(--text-faint)] hidden sm:block">{std}</span>
        )}
      </div>
      <span className="text-[10px] font-mono text-[var(--text-faint)] shrink-0">{count}</span>
    </div>
  )
}

// ── Empty states ──────────────────────────────────────────────────────────────

function EmptyStateNoModel() {
  return (
    <div className="flex flex-col items-center justify-center h-full gap-3 text-center px-6 py-4">
      <svg width="48" height="48" viewBox="0 0 48 48" fill="none" className="opacity-25">
        <rect x="8" y="12" width="32" height="28" rx="3" stroke="currentColor" strokeWidth="1.5" />
        <path d="M16 12V9a2 2 0 012-2h12a2 2 0 012 2v3" stroke="currentColor" strokeWidth="1.5" />
        <path d="M18 22h12M18 28h8" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" />
        <circle cx="36" cy="34" r="7" fill="var(--surface)" stroke="currentColor" strokeWidth="1.5" />
        <path d="M36 31v3l2 2" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" />
      </svg>
      <div className="space-y-1">
        <p className="text-[12px] font-medium text-[var(--text-dim)]">Sin modelo cargado</p>
        <p className="text-[10px] text-[var(--text-faint)] max-w-[180px] leading-relaxed">
          Carga un archivo IFC para comenzar la validación
        </p>
      </div>
    </div>
  )
}

function EmptyStateNotValidated() {
  return (
    <div className="flex flex-col items-center justify-center h-full gap-3 text-center px-6 py-4">
      <svg width="48" height="48" viewBox="0 0 48 48" fill="none" className="opacity-25">
        <circle cx="24" cy="24" r="16" stroke="currentColor" strokeWidth="1.5" />
        <path d="M20 24l-2-2M24 20l-2 2 4 4 6-8" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" opacity="0.3" />
        <circle cx="24" cy="24" r="6" stroke="currentColor" strokeWidth="1.5" />
        <path d="M24 21v4M24 27h.01" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" />
      </svg>
      <div className="space-y-1">
        <p className="text-[12px] font-medium text-[var(--text-dim)]">Modelo listo para validar</p>
        <p className="text-[10px] text-[var(--text-faint)] max-w-[200px] leading-relaxed">
          Selecciona un perfil y pulsa <strong className="text-[var(--text-dim)]">Validar</strong> para analizar el modelo
        </p>
      </div>
    </div>
  )
}

function EmptyStateClean() {
  return (
    <div className="flex flex-col items-center justify-center h-full gap-3 text-center px-6 py-4">
      <svg width="48" height="48" viewBox="0 0 48 48" fill="none">
        <circle cx="24" cy="24" r="16" stroke="var(--ok)" strokeWidth="1.5" opacity="0.4" />
        <circle cx="24" cy="24" r="10" stroke="var(--ok)" strokeWidth="1.5" opacity="0.7" />
        <path d="M18 24l4 4 8-8" stroke="var(--ok)" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />
      </svg>
      <div className="space-y-1">
        <p className="text-[12px] font-semibold" style={{ color: 'var(--ok)' }}>Sin incidencias</p>
        <p className="text-[10px] text-[var(--text-faint)] max-w-[180px] leading-relaxed">
          El modelo supera todas las comprobaciones activas
        </p>
      </div>
    </div>
  )
}

// ── Mini barchart (collapsed pill) ───────────────────────────────────────────

function MiniBarChart({
  errors, warnings, info,
}: { errors: number; warnings: number; info: number }) {
  const total = errors + warnings + info
  if (total === 0) return null

  const pE = errors / total
  const pW = warnings / total
  const pI = info / total

  return (
    <div className="flex h-2 w-14 rounded overflow-hidden gap-px shrink-0" style={{ background: 'var(--border)' }}>
      {errors > 0   && <div style={{ width: `${pE * 100}%`, background: 'var(--danger)', transition: 'width 300ms' }} />}
      {warnings > 0 && <div style={{ width: `${pW * 100}%`, background: '#F5A623', transition: 'width 300ms' }} />}
      {info > 0     && <div style={{ width: `${pI * 100}%`, background: '#5E9ED6', transition: 'width 300ms' }} />}
    </div>
  )
}

// ── Run button (3 states) ─────────────────────────────────────────────────────

function RunButton({
  status, progress, disabled, onClick,
}: {
  status: 'idle' | 'running' | 'complete' | 'error' | 'cancelled'
  progress: number
  disabled: boolean
  onClick: () => void
}) {
  if (status === 'running') {
    return (
      <button
        disabled
        className="flex items-center gap-1.5 px-3 h-8 rounded-lg text-[11px] font-medium text-[var(--accent)] border border-[var(--accent)]33 bg-[var(--accent)]0a cursor-not-allowed shrink-0"
      >
        <svg
          width="12" height="12" viewBox="0 0 12 12" fill="none" stroke="currentColor" strokeWidth="1.5"
          className="animate-spin shrink-0"
        >
          <circle cx="6" cy="6" r="4.5" strokeOpacity="0.25" />
          <path d="M6 1.5a4.5 4.5 0 014.5 4.5" strokeLinecap="round" />
        </svg>
        {progress}%
      </button>
    )
  }

  if (status === 'complete') {
    return (
      <button
        onClick={onClick}
        disabled={disabled}
        className="flex items-center gap-1.5 px-3 h-8 rounded-lg text-[11px] font-medium border transition-all disabled:opacity-40 shrink-0"
        style={{ color: 'var(--ok)', borderColor: 'var(--ok)33', background: 'var(--ok)12' }}
      >
        <svg width="11" height="11" viewBox="0 0 11 11" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" className="shrink-0">
          <polyline points="2,6 4.5,8.5 9,3" />
        </svg>
        Volver a validar
      </button>
    )
  }

  return (
    <button
      onClick={onClick}
      disabled={disabled}
      className="flex items-center gap-1.5 px-3 h-8 rounded-lg text-[11px] font-semibold border transition-all disabled:opacity-40 shrink-0"
      style={{ color: 'var(--accent)', borderColor: 'var(--accent)44', background: 'var(--accent)14' }}
    >
      <svg width="10" height="10" viewBox="0 0 10 10" fill="currentColor" className="shrink-0">
        <path d="M3 2.5l5 2.5-5 2.5V2.5z" />
      </svg>
      Validar
    </button>
  )
}

// ── Profile dropdown ──────────────────────────────────────────────────────────

interface ProfileDropdownProps {
  activeProfileId: string | null
  customProfiles: { id: string; name: string; description: string; icon: string; coverageTypes: string[] }[]
  onSelect: (id: string | null) => void
  onPersonalize: () => void
}

function ProfileDropdown({ activeProfileId, customProfiles, onSelect, onPersonalize }: ProfileDropdownProps) {
  const [open, setOpen] = useState(false)
  const [hoveredId, setHoveredId] = useState<string | null>(null)
  const ref = useRef<HTMLDivElement>(null)

  useEffect(() => {
    if (!open) return
    const handler = (e: MouseEvent) => {
      if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false)
    }
    document.addEventListener('mousedown', handler)
    return () => document.removeEventListener('mousedown', handler)
  }, [open])

  const allProfiles = [...VALIDATION_PROFILES, ...customProfiles]
  const activeProfile = activeProfileId ? allProfiles.find((p) => p.id === activeProfileId) : null

  return (
    <div ref={ref} className="relative flex items-center gap-1 min-w-0">
      {/* Trigger button */}
      <button
        onClick={() => setOpen((v) => !v)}
        className="flex items-center gap-1.5 px-2.5 h-8 rounded-lg text-[11px] font-medium border transition-colors min-w-0 cursor-pointer"
        style={
          activeProfileId
            ? { color: 'var(--accent)', borderColor: 'var(--accent)44', background: 'var(--accent)10', maxWidth: 180 }
            : { color: 'var(--text-dim)', borderColor: 'var(--border)', background: 'transparent', maxWidth: 180 }
        }
      >
        <span className="truncate">
          {activeProfile ? `${activeProfile.icon} ${activeProfile.name}` : 'Seleccionar perfil'}
        </span>
        <svg
          width="10" height="10" viewBox="0 0 10 10" fill="currentColor" className="shrink-0 opacity-60"
          style={{ transform: open ? 'rotate(180deg)' : 'none', transition: 'transform 150ms' }}
        >
          <path d="M1 3.5L5 7.5L9 3.5L8 2.5L5 5.5L2 2.5Z" />
        </svg>
      </button>

      {/* Clear button */}
      {activeProfileId && (
        <button
          onClick={() => onSelect(null)}
          className="w-7 h-7 flex items-center justify-center rounded text-[var(--text-faint)] hover:text-[var(--text)] hover:bg-[var(--surface-2)] transition-colors shrink-0 cursor-pointer"
          title="Limpiar perfil"
        >
          <svg width="9" height="9" viewBox="0 0 9 9" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round">
            <path d="M1.5 1.5l6 6M7.5 1.5l-6 6" />
          </svg>
        </button>
      )}

      {/* Personalizar button */}
      <button
        onClick={() => { setOpen(false); onPersonalize() }}
        className="flex items-center gap-1 px-2.5 h-8 rounded-lg text-[11px] font-medium border border-dashed border-[var(--border)] text-[var(--text-faint)] hover:text-[var(--text-dim)] hover:border-[var(--text-dim)] transition-colors shrink-0 cursor-pointer"
        title={`Crear perfil personalizado (${customProfiles.length}/5)`}
      >
        <svg width="9" height="9" viewBox="0 0 9 9" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round">
          <path d="M4.5 1.5v6M1.5 4.5h6" />
        </svg>
        <span className="hidden sm:inline">Personalizar</span>
      </button>

      {/* Dropdown panel — opens upward */}
      {open && (
        <div
          className="absolute bottom-full left-0 mb-1.5 z-50 rounded-xl border border-[var(--border)] bg-[rgba(18,18,24,0.97)] backdrop-blur-[16px] p-2"
          style={{ minWidth: 300, maxWidth: 440, boxShadow: '0 -8px 32px rgba(0,0,0,0.4)' }}
        >
          <div className="grid grid-cols-2 gap-1.5 min-w-0">
            {allProfiles.map((profile) => {
              const isActive = activeProfileId === profile.id
              const isHovered = hoveredId === profile.id
              return (
                <button
                  key={profile.id}
                  onClick={() => { onSelect(isActive ? null : profile.id); setOpen(false) }}
                  onMouseEnter={() => setHoveredId(profile.id)}
                  onMouseLeave={() => setHoveredId(null)}
                  className="relative flex flex-col items-start gap-1 p-2.5 rounded-lg text-left transition-all cursor-pointer min-w-0"
                  style={
                    isActive
                      ? { background: 'var(--accent)22', border: `1px solid var(--accent)` }
                      : isHovered
                        ? { background: 'var(--border-strong)', border: '1px solid var(--border-strong)' }
                        : { background: 'var(--surface-2)', border: '1px solid var(--border)' }
                  }
                >
                  {/* Selected checkmark */}
                  {isActive && (
                    <span
                      className="absolute top-1.5 right-1.5 w-3.5 h-3.5 rounded-full flex items-center justify-center shrink-0"
                      style={{ background: 'var(--accent)' }}
                    >
                      <svg width="7" height="7" viewBox="0 0 7 7" fill="none" stroke="white" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
                        <path d="M1 3.5l1.5 1.5 3.5-3" />
                      </svg>
                    </span>
                  )}
                  <div className="flex items-center gap-1.5 w-full min-w-0" style={{ paddingRight: isActive ? '1.25rem' : 0 }}>
                    <span className="text-[14px] leading-none shrink-0">{profile.icon}</span>
                    <span
                      className="text-[11px] font-semibold truncate"
                      style={{ color: isActive ? 'var(--accent)' : 'var(--text)' }}
                    >
                      {profile.name}
                    </span>
                  </div>
                  <p className="text-[9px] text-[var(--text-faint)] leading-tight line-clamp-2 w-full">
                    {profile.description}
                  </p>
                  <div className="flex flex-wrap gap-0.5 mt-0.5 w-full">
                    {profile.coverageTypes.slice(0, 4).map((cat) => (
                      <span
                        key={cat}
                        className="text-[8px] px-1 rounded font-mono leading-tight whitespace-nowrap"
                        style={{ background: 'var(--accent)14', color: 'var(--accent)' }}
                      >
                        {cat}
                      </span>
                    ))}
                    {profile.coverageTypes.length > 4 && (
                      <span className="text-[8px] text-[var(--text-faint)] font-mono">
                        +{profile.coverageTypes.length - 4}
                      </span>
                    )}
                  </div>
                </button>
              )
            })}
          </div>
        </div>
      )}
    </div>
  )
}

// ── Compact coverage strip ────────────────────────────────────────────────────
// Replaces the full ValidationCoverageSummary with a single 34px row showing
// quality score + category chips (covered = colored, uncovered = muted).

const CAT_COLOR: Record<string, string> = {
  schema:         '#5E9ED6',
  spatial:        'var(--accent)',
  quality:        'var(--ok)',
  lod:            '#F5A623',
  iso19650:       'var(--accent)',
  classification: '#F5A623',
  mep:            'var(--accent)',
  clash:          'var(--danger)',
}

// Short labels that fit nicely at 8–9px font in chips
const CAT_SHORT: Record<string, string> = {
  schema:         'IFC',
  spatial:        'Espac.',
  quality:        'Cal.',
  lod:            'LOD',
  iso19650:       'ISO',
  classification: 'Clas.',
  mep:            'MEP',
  clash:          'Col.',
}

interface CoverageStripProps {
  rules: Parameters<typeof getCoveredCategories>[0]
  qualityScore: number
  onDismiss: () => void
}

function CoverageStrip({ rules, qualityScore, onDismiss }: CoverageStripProps) {
  // Guard: getCoveredCategories iterates rules safely, but wrap in case rules
  // shape ever diverges from RulesConfig at runtime.
  let covered: ReturnType<typeof getCoveredCategories> = []
  try { covered = getCoveredCategories(rules) } catch { /* show all uncovered */ }

  // Guard NaN / negative scores (worker rounding edge case)
  const score      = Number.isFinite(qualityScore) ? Math.max(0, Math.min(100, Math.round(qualityScore))) : 0
  const scoreColor =
    score >= 80 ? 'var(--ok)' :
    score >= 50 ? '#F5A623'   : 'var(--danger)'

  return (
    <div className="flex items-center gap-2 px-3 py-1.5 border-b border-[var(--border)] bg-[var(--surface-2)] shrink-0">
      {/* Score pill */}
      <span
        className="text-[10px] font-mono font-bold px-2 py-0.5 rounded-full border shrink-0 leading-none"
        style={{ color: scoreColor, borderColor: `${scoreColor}44`, background: `${scoreColor}14` }}
        title="Puntuación de calidad (0–100)"
      >
        {score}
      </span>

      {/* Divider */}
      <div className="w-px h-4 bg-[var(--border)] shrink-0" />

      {/* Category chips */}
      <div className="flex items-center gap-1 overflow-x-auto flex-1 min-w-0 scrollbar-none">
        {ALL_CATEGORIES.map((cat) => {
          const isActive = covered.includes(cat as ValidationCategoryType)
          const color = CAT_COLOR[cat] ?? 'var(--accent)'
          const short = CAT_SHORT[cat] ?? VALIDATION_CATEGORY_LABELS[cat as ValidationCategoryType]
          return (
            <span
              key={cat}
              className="shrink-0 text-[9px] px-1.5 py-0.5 rounded border leading-none font-mono whitespace-nowrap"
              style={
                isActive
                  ? { background: `${color}14`, color, borderColor: `${color}33` }
                  : { background: 'transparent', color: 'var(--text-faint)', borderColor: 'var(--border)' }
              }
              title={VALIDATION_CATEGORY_LABELS[cat as ValidationCategoryType]}
            >
              {isActive ? '✓ ' : ''}{short}
            </span>
          )
        })}
      </div>

      {/* Dismiss */}
      <button
        onClick={onDismiss}
        className="shrink-0 w-5 h-5 flex items-center justify-center rounded text-[var(--text-faint)] hover:text-[var(--text)] hover:bg-[var(--surface)] transition-colors"
        title="Ocultar resumen"
      >
        <svg width="8" height="8" viewBox="0 0 8 8" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round">
          <path d="M1.5 1.5l5 5M6.5 1.5l-5 5" />
        </svg>
      </button>
    </div>
  )
}

// ── BCF topic row ─────────────────────────────────────────────────────────────

function BcfStatusBadge({ status }: { status?: string }) {
  if (!status) return null
  const color =
    status === 'Closed'      ? 'var(--ok)'    :
    status === 'In Progress' ? '#F5A623'       :
    status === 'Open'        ? 'var(--accent)' : 'var(--text-dim)'
  return (
    <span
      className="px-1.5 py-0.5 rounded text-[9px] font-mono font-bold uppercase leading-none shrink-0 border"
      style={{ background: `${color}18`, color, borderColor: `${color}33` }}
    >
      {status}
    </span>
  )
}

function BcfTopicRow({ topic, onNavigate }: { topic: BcfTopic; onNavigate: (t: BcfTopic) => void }) {
  const vp          = topic.viewpoints[0]
  const hasCamera   = vp && vp.cameraPosition && vp.cameraDirection
  const hasSnapshot = vp?.snapshotBase64

  return (
    <div className="flex items-start gap-2.5 px-3 py-2 border-b border-[var(--border)] hover:bg-[var(--surface-2)] group transition-colors">
      {hasSnapshot && (
        <img
          src={hasSnapshot}
          alt="snapshot"
          className="w-12 h-9 object-cover rounded-md border border-[var(--border)] shrink-0"
        />
      )}
      <div className="flex-1 min-w-0 flex flex-col gap-0.5">
        <div className="flex items-center gap-2 flex-wrap">
          <BcfStatusBadge status={topic.status} />
          {topic.topicType && (
            <span className="text-[9px] text-[var(--text-faint)] font-mono uppercase">{topic.topicType}</span>
          )}
          <span className="text-[12px] text-[var(--text)] font-medium truncate max-w-[220px]">{topic.title}</span>
        </div>
        {topic.description && (
          <p className="text-[11px] text-[var(--text-dim)] line-clamp-2">{topic.description}</p>
        )}
        <div className="flex items-center gap-2 mt-0.5">
          {topic.comments.length > 0 && (
            <span className="text-[10px] text-[var(--text-faint)] font-mono">
              {topic.comments.length} comentario{topic.comments.length !== 1 ? 's' : ''}
            </span>
          )}
          {topic.source === 'generated' && (
            <span className="text-[9px] text-[var(--text-faint)] border border-[var(--border)] px-1 rounded font-mono">
              generado
            </span>
          )}
        </div>
      </div>
      {hasCamera && (
        <button
          onClick={() => onNavigate(topic)}
          className="shrink-0 px-2 h-7 rounded text-[10px] bg-[var(--surface-2)] text-[var(--text-dim)] border border-[var(--border)] hover:text-[var(--text)] font-medium opacity-0 group-hover:opacity-100 transition-opacity"
        >
          Navegar
        </button>
      )}
    </div>
  )
}

// ── Search input ──────────────────────────────────────────────────────────────

function SearchInput({ value, onChange }: { value: string; onChange: (v: string) => void }) {
  const inputRef = useRef<HTMLInputElement>(null)
  return (
    <div className="relative flex items-center shrink-0">
      <svg
        width="12" height="12" viewBox="0 0 12 12" fill="none" stroke="currentColor" strokeWidth="1.3" strokeLinecap="round"
        className="absolute left-2 text-[var(--text-faint)] pointer-events-none"
      >
        <circle cx="5" cy="5" r="3.5" />
        <path d="M8.5 8.5L11 11" />
      </svg>
      <input
        ref={inputRef}
        type="text"
        value={value}
        onChange={(e) => onChange(e.target.value)}
        placeholder="Buscar…"
        className="h-6 pl-6 pr-6 text-[11px] bg-[var(--surface-2)] border border-[var(--border)] rounded text-[var(--text)] placeholder:text-[var(--text-faint)] outline-none focus:border-[var(--accent)] w-28 transition-colors"
      />
      {value && (
        <button
          onClick={() => { onChange(''); inputRef.current?.focus() }}
          className="absolute right-1 w-4 h-4 flex items-center justify-center rounded text-[var(--text-faint)] hover:text-[var(--text)]"
        >
          <svg width="8" height="8" viewBox="0 0 8 8" fill="none" stroke="currentColor" strokeWidth="1.3" strokeLinecap="round">
            <path d="M1.5 1.5l5 5M6.5 1.5l-5 5" />
          </svg>
        </button>
      )}
    </div>
  )
}

// ── Main component ────────────────────────────────────────────────────────────

interface ValidationPanelProps {
  onJumpToElement?: (expressId: number) => void
  viewer?: Pick<ViewerHandle, 'setCameraViewpoint'> | null | undefined
}

export default function ValidationPanel({ onJumpToElement, viewer }: ValidationPanelProps) {
  const {
    result, partialIssues, isRunning, progress, validationStatus, filters, setFilters,
    rules, activeProfileId, customProfiles, showCoverageSummary, dismissCoverageSummary,
    setActiveProfile,
  } = useValidationStore(
    useShallow((s) => ({
      result:                 s.result,
      partialIssues:          s.partialIssues,
      isRunning:              s.isRunning,
      progress:               s.progress,
      validationStatus:       s.validationStatus,
      filters:                s.filters,
      setFilters:             s.setFilters,
      rules:                  s.rules,
      activeProfileId:        s.activeProfileId,
      customProfiles:         s.customProfiles,
      showCoverageSummary:    s.showCoverageSummary,
      dismissCoverageSummary: s.dismissCoverageSummary,
      setActiveProfile:       s.setActiveProfile,
    })),
  )
  const { validationPanelOpen, toggleValidationPanel } = useUIStore(
    useShallow((s) => ({ validationPanelOpen: s.validationPanelOpen, toggleValidationPanel: s.toggleValidationPanel })),
  )
  const ifcBuffer               = useModelStore((s) => s.ifcBuffer)
  const activeValidationModelId = useValidationStore((s) => s.activeValidationModelId)
  const { addCommand }          = useEditorHistory()
  const { setSelection, diffs } = useEditorStore(
    useShallow((s) => ({ setSelection: s.setSelection, diffs: s.diffs })),
  )
  const sceneModels  = useSceneStore((s) => s.models)
  const { topics: bcfTopics, isParsing: bcfParsing } = useBcfStore(
    useShallow((s) => ({ topics: s.topics, isParsing: s.isParsing })),
  )

  const [search, setSearch]             = useState('')
  const [modelFilter, setModelFilter]   = useState<string | null>(null)
  const [profileModalOpen, setProfileModalOpen] = useState(false)
  const [activePanel, setActivePanel]   = useState<'issues' | 'bcf'>('issues')
  const bcfFileRef = useRef<HTMLInputElement>(null)

  // ── Resize state ──────────────────────────────────────────────────────

  // Lazy initializer: clamp default to 82 vh so we never start taller than
  // the viewport even on very small screens.
  const [panelHeight, setPanelHeight] = useState<number>(() => {
    if (typeof window === 'undefined') return DEFAULT_PANEL_H
    return Math.min(DEFAULT_PANEL_H, Math.floor(window.innerHeight * 0.82))
  })
  const panelHRef   = useRef(panelHeight)
  const mountedRef  = useRef(true)

  useEffect(() => () => { mountedRef.current = false }, [])

  const updatePanelHeight = useCallback((h: number) => {
    if (!mountedRef.current) return
    const maxH = Math.floor(window.innerHeight * 0.82)
    const clamped = Math.max(MIN_PANEL_H, Math.min(maxH, h))
    panelHRef.current = clamped
    setPanelHeight(clamped)
  }, [])

  const startResize = useCallback((e: React.MouseEvent) => {
    e.preventDefault()
    const startY = e.clientY
    const startH = panelHRef.current

    // Prevent text selection and lock cursor during drag
    document.body.style.userSelect = 'none'
    document.body.style.cursor = 'ns-resize'

    const cleanup = (): void => {
      window.removeEventListener('mousemove', onMove)
      window.removeEventListener('mouseup',   cleanup)
      document.body.style.userSelect = ''
      document.body.style.cursor = ''
    }
    const onMove = (ev: MouseEvent): void => {
      // Panel is bottom-anchored → drag up (negative deltaY) increases height
      updatePanelHeight(startH + (startY - ev.clientY))
    }
    window.addEventListener('mousemove', onMove)
    window.addEventListener('mouseup',   cleanup)
  }, [updatePanelHeight])

  const startTouchResize = useCallback((e: React.TouchEvent) => {
    const startY = e.touches[0].clientY
    const startH = panelHRef.current

    const cleanup = (): void => {
      window.removeEventListener('touchmove', onMove)
      window.removeEventListener('touchend',  cleanup)
      window.removeEventListener('touchcancel', cleanup)
    }
    const onMove = (ev: TouchEvent): void => {
      updatePanelHeight(startH + (startY - ev.touches[0].clientY))
    }
    window.addEventListener('touchmove',   onMove,   { passive: true })
    window.addEventListener('touchend',    cleanup)
    window.addEventListener('touchcancel', cleanup)
  }, [updatePanelHeight])

  // ── Data ──────────────────────────────────────────────────────────────

  const issues = result?.issues ?? partialIssues
  const stats  = result?.stats
  const hasModel = sceneModels.length > 0 || !!ifcBuffer

  const pendingFixIds = useMemo(
    () => new Set(diffs.filter((d) => d.type === 'RENAME').map((d) => d.expressId)),
    [diffs],
  )

  // ── Filter / group ────────────────────────────────────────────────────

  const filtered = useMemo(() => {
    let list = issues
    if (modelFilter) list = list.filter((i) => i.modelId === modelFilter)
    if (filters.activeTab === 'errors')        list = list.filter((i) => i.severity === 'error')
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
    const map = new Map<string, ValidationIssue[]>()
    for (const issue of filtered) {
      let key = ''
      if (filters.groupBy === 'rule')        key = issue.ruleId
      else if (filters.groupBy === 'storey') key = issue.path[issue.path.length - 2] ?? issue.path[0] ?? 'Desconocida'
      else                                   key = issue.ifcClass
      const g = map.get(key) ?? []
      g.push(issue)
      map.set(key, g)
    }
    return map
  }, [filtered, filters.groupBy])

  // ── Handlers ──────────────────────────────────────────────────────────

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
    for (const issue of filtered) {
      if (issue.autoFixable && (issue.ruleId === 'RULE_DUPLICATE_GUID' || issue.ruleId === 'RULE_INVALID_GUID_FORMAT') && issue.globalId) {
        addCommand(buildFixGuidCommand(issue.expressId, issue.globalId, issue.modelId))
      }
    }
  }, [filtered, addCommand])

  const handleNameFix = useCallback((issue: ValidationIssue, field: 'Name' | 'LongName', newValue: string) => {
    const oldValue = issue.elementName === '(empty)' ? '' : issue.elementName
    addCommand(buildRenameCommand(issue.expressId, field, oldValue, newValue, issue.modelId))
  }, [addCommand])

  const handleExportJson = useCallback(() => {
    if (!result) return
    downloadBlob(new Blob([JSON.stringify(result, null, 2)], { type: 'application/json' }), 'validation-report.json')
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
    downloadBlob(new Blob([[header, ...rows].join('\n')], { type: 'text/csv' }), 'validation-report.csv')
  }, [result])

  const handleExportCertificate = useCallback(() => {
    if (!result) return
    const allProfiles = [...VALIDATION_PROFILES, ...customProfiles]
    const activeProfile = activeProfileId ? allProfiles.find((p) => p.id === activeProfileId) : null
    const covered   = getCoveredCategories(rules)
    const uncovered = ALL_CATEGORIES.filter((c) => !covered.includes(c))
    const certificate: ValidationCertificate = {
      timestamp:    new Date().toISOString(),
      modelFileName: sceneModels[0]?.fileName ?? 'unknown.ifc',
      modelId:      activeValidationModelId,
      profileUsed:  {
        id:          activeProfile?.id ?? 'custom',
        name:        activeProfile?.name ?? 'Manual',
        rulesActive: Object.entries(rules).filter(([, v]) => typeof v === 'boolean' && v).map(([k]) => k),
      },
      coverageSummary: {
        categoriesChecked:   covered,
        categoriesUnchecked: uncovered,
        rulesRun: [...new Set(result.issues.map((i) => i.ruleId))],
      },
      stats:       result.stats,
      qualityScore: result.qualityScore ?? 0,
      issues:      result.issues,
      generatedBy: 'IFC Viewer — Validator V2',
      appVersion:  '2.0.0',
      durationMs:  result.durationMs,
    }
    downloadBlob(new Blob([JSON.stringify(certificate, null, 2)], { type: 'application/json' }), 'validation-certificate.json')
  }, [result, activeProfileId, customProfiles, rules, sceneModels, activeValidationModelId])

  const handleRunValidation = useCallback(() => {
    void runValidation(activeValidationModelId ?? undefined)
  }, [activeValidationModelId])

  const handleBcfImport = useCallback((e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0]
    if (!file) return
    void importBcf(file)
    e.target.value = ''
  }, [])

  const handleBcfExport = useCallback(() => {
    if (!result) return
    void downloadBcfBlob(issuesToBcfTopics(result.issues), 'validation-issues.bcfzip')
  }, [result])

  const handleNavigateToBcfTopic = useCallback((topic: BcfTopic) => {
    const vp = topic.viewpoints[0]
    if (!vp?.cameraPosition || !vp?.cameraDirection) return
    viewer?.setCameraViewpoint(vp.cameraPosition, vp.cameraDirection)
  }, [viewer])

  const autoFixableCount = filtered.filter((i) => i.autoFixable).length

  // ── Collapsed state ───────────────────────────────────────────────────

  if (!validationPanelOpen) {
    return (
      <button
        onClick={toggleValidationPanel}
        className="flex items-center gap-2 px-3 h-10 xs:h-9 border-t border-[var(--border)] bg-[var(--surface)] w-full text-left hover:bg-[var(--surface-2)] active:bg-[var(--surface-2)] transition-colors shrink-0"
      >
        <span className="text-[11px] font-semibold text-[var(--text-dim)] uppercase tracking-wider shrink-0">
          Validación
        </span>

        {stats ? (
          <div className="flex items-center gap-2">
            <MiniBarChart errors={stats.errors} warnings={stats.warnings} info={stats.info} />
            {stats.errors > 0 && (
              <span className="text-[11px] text-[var(--danger)] font-mono">{stats.errors}E</span>
            )}
            {stats.warnings > 0 && (
              <span className="text-[11px] font-mono" style={{ color: '#F5A623' }}>{stats.warnings}W</span>
            )}
            {stats.info > 0 && (
              <span className="text-[11px] font-mono" style={{ color: '#5E9ED6' }}>{stats.info}I</span>
            )}
            {stats.errors === 0 && stats.warnings === 0 && stats.info === 0 && (
              <span className="text-[11px] text-[var(--ok)] font-mono">✓ Sin incidencias</span>
            )}
            {result?.qualityScore != null && (
              <span
                className="px-1.5 py-0.5 rounded-full font-mono font-bold text-[10px] border leading-none"
                style={(() => {
                  const c = result.qualityScore >= 80 ? 'var(--ok)' : result.qualityScore >= 50 ? '#F5A623' : 'var(--danger)'
                  return { color: c, borderColor: `${c}44`, background: `${c}14` }
                })()}
              >
                {result.qualityScore}
              </span>
            )}
          </div>
        ) : isRunning ? (
          <span className="text-[11px] text-[var(--accent)] font-mono animate-pulse">
            Validando… {progress}%
          </span>
        ) : null}

        <span className="ml-auto text-[var(--text-faint)]">
          <svg width="12" height="12" viewBox="0 0 12 12" fill="currentColor">
            <path d="M1 8.5L6 3.5L11 8.5L10 9.5L6 5.5L2 9.5Z" />
          </svg>
        </span>
      </button>
    )
  }

  // ── Expanded state ────────────────────────────────────────────────────

  return (
    <div
      className="flex flex-col border-t border-[var(--border)] bg-[var(--surface)] shrink-0"
      style={{ height: panelHeight, minHeight: MIN_PANEL_H, maxHeight: '82vh' }}
    >
      {/* ── Resize grip ── */}
      <div
        onMouseDown={startResize}
        onTouchStart={startTouchResize}
        className="h-3 shrink-0 cursor-ns-resize flex items-center justify-center group hover:bg-[var(--accent)]14 active:bg-[var(--accent)]20 transition-colors select-none"
        title="Arrastrar para redimensionar"
      >
        <div className="flex gap-[3px] items-center">
          {[0,1,2,3,4].map((i) => (
            <div key={i} className="w-[3px] h-[3px] rounded-full bg-[var(--border-strong)] group-hover:bg-[var(--accent)] transition-colors" />
          ))}
        </div>
      </div>

      {/* ── Row 1: identity + stats + actions ── */}
      <div className="flex items-center gap-2 px-3 h-9 border-b border-[var(--border)] shrink-0 overflow-hidden">
        <span className="text-[11px] font-semibold text-[var(--text-dim)] uppercase tracking-wider shrink-0">
          Validación
        </span>

        {stats && (
          <div className="flex items-center gap-1.5 text-[11px] font-mono min-w-0">
            {stats.errors > 0 && (
              <span className="text-[var(--danger)] shrink-0">{stats.errors}E</span>
            )}
            {stats.warnings > 0 && (
              <span style={{ color: '#F5A623' }} className="shrink-0">{stats.warnings}W</span>
            )}
            {stats.info > 0 && (
              <span style={{ color: '#5E9ED6' }} className="shrink-0">{stats.info}I</span>
            )}
            {stats.total === 0 && (
              <span className="text-[var(--ok)] shrink-0">✓</span>
            )}
            {result?.qualityScore != null && (
              <span
                className="ml-0.5 px-1.5 py-0.5 rounded-full font-bold text-[9px] border leading-none shrink-0"
                style={(() => {
                  const c = result.qualityScore >= 80 ? 'var(--ok)' : result.qualityScore >= 50 ? '#F5A623' : 'var(--danger)'
                  return { color: c, borderColor: `${c}44`, background: `${c}14` }
                })()}
                title="Puntuación de calidad (0–100)"
              >
                {result.qualityScore}
              </span>
            )}
            {result && (
              <span className="text-[var(--text-faint)] text-[10px] hidden sm:inline shrink-0">
                · {result.durationMs}ms
              </span>
            )}
          </div>
        )}

        <div className="flex-1" />

        {/* Batch auto-fix */}
        {autoFixableCount > 0 && (
          <button
            onClick={handleBatchFix}
            title={`Auto-fix ${autoFixableCount} incidencia${autoFixableCount !== 1 ? 's' : ''}`}
            className="px-2 h-6 rounded text-[10px] border transition-colors font-medium shrink-0"
            style={{ background: 'var(--ok)14', color: 'var(--ok)', borderColor: 'var(--ok)33' }}
          >
            Fix {autoFixableCount}
          </button>
        )}

        {/* Export dropdown */}
        {result && (
          <div className="relative group/export shrink-0">
            <button className="flex items-center gap-1 px-2 h-6 rounded text-[10px] bg-[var(--surface-2)] text-[var(--text-dim)] border border-[var(--border)] hover:text-[var(--text)] font-medium transition-colors">
              Exportar
              <svg width="9" height="9" viewBox="0 0 9 9" fill="currentColor" className="opacity-50">
                <path d="M1 3L4.5 6.5L8 3" />
              </svg>
            </button>
            <div className="absolute right-0 top-full mt-1 bg-[var(--surface)] border border-[var(--border)] rounded-lg shadow-xl z-50 py-1 hidden group-hover/export:block min-w-[130px]">
              <button onClick={handleExportJson}        className="w-full text-left px-3 py-1.5 text-[11px] text-[var(--text-dim)] hover:bg-[var(--surface-2)] hover:text-[var(--text)] transition-colors">JSON</button>
              <button onClick={handleExportCsv}         className="w-full text-left px-3 py-1.5 text-[11px] text-[var(--text-dim)] hover:bg-[var(--surface-2)] hover:text-[var(--text)] transition-colors">CSV</button>
              <div className="h-px bg-[var(--border)] mx-2 my-0.5" />
              <button onClick={handleExportCertificate} className="w-full text-left px-3 py-1.5 text-[11px] text-[var(--text-dim)] hover:bg-[var(--surface-2)] hover:text-[var(--text)] transition-colors">Certificado JSON</button>
              <div className="h-px bg-[var(--border)] mx-2 my-0.5" />
              <button onClick={handleBcfExport}         className="w-full text-left px-3 py-1.5 text-[11px] text-[var(--text-dim)] hover:bg-[var(--surface-2)] hover:text-[var(--text)] transition-colors">BCF</button>
            </div>
          </div>
        )}

        {/* Pending fixes count */}
        {pendingFixIds.size > 0 && (
          <span className="px-2 h-6 flex items-center rounded text-[10px] text-[var(--ok)] border border-[var(--ok)]33 font-mono shrink-0">
            {pendingFixIds.size} editado{pendingFixIds.size !== 1 ? 's' : ''}
          </span>
        )}

        {/* Collapse */}
        <button
          onClick={toggleValidationPanel}
          className="w-6 h-6 flex items-center justify-center rounded text-[var(--text-faint)] hover:text-[var(--text)] hover:bg-[var(--surface-2)] transition-colors shrink-0"
        >
          <svg width="12" height="12" viewBox="0 0 12 12" fill="currentColor">
            <path d="M1 3.5L6 8.5L11 3.5L10 2.5L6 6.5L2 2.5Z" />
          </svg>
        </button>
      </div>

      {/* ── Row 2: profile dropdown + run button ── */}
      <div className="flex items-center gap-2 px-3 py-1 border-b border-[var(--border)] shrink-0 min-w-0">
        <ProfileDropdown
          activeProfileId={activeProfileId}
          customProfiles={customProfiles}
          onSelect={setActiveProfile}
          onPersonalize={() => setProfileModalOpen(true)}
        />
        <div className="flex-1" />
        <RunButton
          status={validationStatus}
          progress={progress}
          disabled={!hasModel}
          onClick={handleRunValidation}
        />
      </div>

      {/* ── Model filter chips ── */}
      {sceneModels.length > 1 && (
        <div className="flex items-center gap-1 px-3 py-1.5 border-b border-[var(--border)] overflow-x-auto shrink-0">
          <button
            onClick={() => setModelFilter(null)}
            className="shrink-0 px-2 h-5 rounded text-[10px] font-medium transition-colors border"
            style={
              modelFilter === null
                ? { background: 'var(--surface-2)', color: 'var(--text)', borderColor: 'var(--border)' }
                : { background: 'transparent', color: 'var(--text-faint)', borderColor: 'transparent' }
            }
          >
            Todos
          </button>
          {sceneModels.map((m) => {
            const count = issues.filter((i) => i.modelId === m.id).length
            return (
              <button
                key={m.id}
                onClick={() => setModelFilter(m.id === modelFilter ? null : m.id)}
                className="shrink-0 flex items-center gap-1 px-2 h-5 rounded text-[10px] font-medium transition-colors border"
                style={
                  modelFilter === m.id
                    ? { background: 'var(--surface-2)', color: 'var(--text)', borderColor: 'var(--border)' }
                    : { background: 'transparent', color: 'var(--text-faint)', borderColor: 'transparent' }
                }
              >
                <span className="max-w-[100px] truncate">{m.fileName.replace(/\.ifc$/i, '')}</span>
                {count > 0 && <span className="font-mono text-[9px] opacity-70">{count}</span>}
              </button>
            )
          })}
        </div>
      )}

      {/* ── Compact coverage strip (replaces full ValidationCoverageSummary) ── */}
      {showCoverageSummary && result && (
        <CoverageStrip
          rules={rules}
          qualityScore={result.qualityScore ?? 0}
          onDismiss={dismissCoverageSummary}
        />
      )}

      {/* ── Toolbar row A: tab toggle + severity filter ── */}
      <div className="flex items-center gap-1.5 px-3 h-8 border-b border-[var(--border)] shrink-0 overflow-x-auto">
        {/* Issues / BCF toggle */}
        <div className="flex items-center gap-0.5 shrink-0">
          {(['issues', 'bcf'] as const).map((panel) => (
            <button
              key={panel}
              onClick={() => setActivePanel(panel)}
              className="px-2 h-6 rounded text-[10px] font-medium transition-colors"
              style={
                activePanel === panel
                  ? { background: 'var(--surface-2)', color: 'var(--text)', border: '1px solid var(--border)' }
                  : { color: 'var(--text-faint)', border: '1px solid transparent' }
              }
            >
              {panel === 'issues' ? 'Incidencias' : 'BCF'}
              {panel === 'bcf' && bcfTopics.length > 0 && (
                <span className="ml-1 text-[9px] font-mono">{bcfTopics.length}</span>
              )}
            </button>
          ))}
        </div>

        {activePanel === 'issues' && (
          <>
            <div className="w-px h-4 bg-[var(--border)] shrink-0" />

            {/* Severity tabs */}
            <div className="flex items-center gap-0.5 shrink-0">
              {(['all', 'errors', 'warnings', 'info'] as const).map((tab) => {
                const count =
                  tab === 'all'      ? issues.length :
                  tab === 'errors'   ? (stats?.errors   ?? issues.filter((i) => i.severity === 'error').length) :
                  tab === 'warnings' ? (stats?.warnings ?? issues.filter((i) => i.severity === 'warning').length) :
                  (stats?.info ?? issues.filter((i) => i.severity === 'info').length)

                const tabColor =
                  tab === 'errors'   ? 'var(--danger)' :
                  tab === 'warnings' ? '#F5A623' :
                  tab === 'info'     ? '#5E9ED6' : undefined

                return (
                  <button
                    key={tab}
                    onClick={() => setFilters({ activeTab: tab })}
                    className="px-1.5 h-5 rounded text-[10px] font-medium transition-colors"
                    style={
                      filters.activeTab === tab
                        ? { background: 'var(--surface-2)', color: tabColor ?? 'var(--text)', border: '1px solid var(--border)' }
                        : { color: 'var(--text-faint)', border: '1px solid transparent' }
                    }
                  >
                    {tab === 'all' ? 'Todo' : tab === 'errors' ? 'E' : tab === 'warnings' ? 'W' : 'I'}
                    {count > 0 && (
                      <span
                        className="ml-0.5 text-[9px] font-mono"
                        style={{ color: tabColor ?? 'inherit' }}
                      >
                        {count}
                      </span>
                    )}
                  </button>
                )
              })}
            </div>
          </>
        )}

        {activePanel === 'bcf' && (
          <>
            <div className="flex-1" />
            <input ref={bcfFileRef} type="file" accept=".bcfzip,.bcf" className="hidden" onChange={handleBcfImport} />
            <button
              onClick={() => bcfFileRef.current?.click()}
              disabled={bcfParsing}
              className="px-2 h-6 rounded text-[10px] bg-[var(--surface-2)] text-[var(--text-dim)] border border-[var(--border)] hover:text-[var(--text)] disabled:opacity-40 font-medium transition-colors shrink-0"
            >
              {bcfParsing ? 'Importando…' : 'Importar BCF'}
            </button>
            {result && result.issues.length > 0 && (
              <button
                onClick={handleBcfExport}
                className="px-2 h-6 rounded text-[10px] font-medium border transition-colors shrink-0"
                style={{ background: 'var(--accent)14', color: 'var(--accent)', borderColor: 'var(--accent)33' }}
              >
                Exportar BCF
              </button>
            )}
          </>
        )}
      </div>

      {/* ── Toolbar row B: group by + search (issues only) ── */}
      {activePanel === 'issues' && (
        <div className="flex items-center gap-1.5 px-3 h-7 border-b border-[var(--border)] shrink-0 overflow-x-auto">
          <span className="text-[9px] text-[var(--text-faint)] uppercase tracking-wider shrink-0 font-medium">
            Agrupar
          </span>
          {/* Group by */}
          <div className="flex items-center gap-0.5 shrink-0">
            {(['rule', 'storey', 'class'] as const).map((g) => (
              <button
                key={g}
                onClick={() => setFilters({ groupBy: g })}
                className="px-1.5 h-5 rounded text-[10px] font-medium transition-colors"
                style={
                  filters.groupBy === g
                    ? { background: 'var(--surface-2)', color: 'var(--text)', border: '1px solid var(--border)' }
                    : { color: 'var(--text-faint)', border: '1px solid transparent' }
                }
              >
                {g === 'rule' ? 'Regla' : g === 'storey' ? 'Planta' : 'Clase'}
              </button>
            ))}
          </div>

          <div className="flex-1" />

          {/* Search */}
          <SearchInput value={search} onChange={setSearch} />
        </div>
      )}

      {/* ── Content ── */}
      <div className="flex-1 overflow-y-auto">
        {activePanel === 'bcf' ? (
          <>
            {bcfParsing && (
              <div className="px-3 py-2 text-[11px] text-[var(--accent)] animate-pulse border-b border-[var(--border)]">
                Importando BCF…
              </div>
            )}
            {!bcfParsing && bcfTopics.length === 0 && (
              <div className="flex flex-col items-center justify-center h-full gap-2 text-center px-4">
                <p className="text-[11px] text-[var(--text-dim)]">
                  Sin topics BCF. Importa un .bcfzip o exporta incidencias como BCF.
                </p>
              </div>
            )}
            {bcfTopics.map((topic) => (
              <BcfTopicRow key={topic.guid} topic={topic} onNavigate={handleNavigateToBcfTopic} />
            ))}
          </>
        ) : (
          <>
            {/* Progress bar while running */}
            {isRunning && (
              <div className="px-3 py-2 border-b border-[var(--border)]">
                <div className="h-0.5 bg-[var(--surface-2)] rounded-full overflow-hidden">
                  <div
                    className="h-full rounded-full transition-all duration-300"
                    style={{ width: `${progress}%`, background: 'var(--accent)' }}
                  />
                </div>
              </div>
            )}

            {/* Empty states */}
            {!isRunning && issues.length === 0 && (
              !hasModel
                ? <EmptyStateNoModel />
                : result === null
                  ? <EmptyStateNotValidated />
                  : <EmptyStateClean />
            )}

            {/* Issue groups */}
            {[...grouped.entries()].map(([groupKey, groupIssues]) => (
              <div key={groupKey}>
                <GroupHeader
                  label={
                    filters.groupBy === 'rule'
                      ? (getRuleLabel(groupKey, UI_LOCALE))
                      : groupKey
                  }
                  count={groupIssues.length}
                  ruleId={filters.groupBy === 'rule' ? groupKey : undefined}
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
          </>
        )}
      </div>

      <CustomProfileModal open={profileModalOpen} onClose={() => setProfileModalOpen(false)} />
    </div>
  )
}
