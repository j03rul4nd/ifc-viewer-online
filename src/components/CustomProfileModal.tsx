// ─── CustomProfileModal ───────────────────────────────────────────────────────
// Modal for creating or editing a custom validation profile.
// Rules are grouped by ValidationCategoryType with Radix Switch toggles.
// Persists up to 5 custom profiles in localStorage via validationStore.

import React, { useState, useMemo } from 'react'
import * as Dialog from '@radix-ui/react-dialog'
import * as Switch from '@radix-ui/react-switch'
import { useShallow } from 'zustand/react/shallow'
import { useTranslation } from 'react-i18next'
import { useValidationStore } from '../stores/validationStore'
import {
  RULE_METADATA,
  DEFAULT_RULES,
  getRuleLabel,
  getRuleDescription,
} from '../types'
import type { RulesConfig, ValidationCategoryType, ValidationProfile } from '../types'
import { getCoveredCategories } from './ValidationCoverageSummary'
import SavedRulesetPicker from './pro/SavedRulesetPicker'

// The serialised shape of a synced validator_profile — name + the full rules
// config (which already carries severityOverrides + thresholds). Kept minimal
// and versioned so a future field is additive.
interface SyncedValidatorProfile {
  v: 1
  name: string
  description?: string
  icon?: string
  rules: RulesConfig
}

function severityColor(sev: 'error' | 'warning' | 'info'): string {
  if (sev === 'error')   return 'var(--danger)'
  if (sev === 'warning') return '#F5A623'
  return '#5E9ED6'
}

const ICON_OPTIONS = ['⚙️', '🏗️', '🏢', '📐', '🔧', '🔍', '📋', '✅', '🌍', '🏛️']

const CATEGORY_ORDER: ValidationCategoryType[] = [
  'schema', 'spatial', 'quality', 'lod', 'classification', 'mep', 'clash', 'iso19650',
]

// ── Severity picker ───────────────────────────────────────────────────────────

type Sev = 'error' | 'warning' | 'info'

function SeverityPicker({ value, defaultSeverity, onChange }: {
  value: Sev
  defaultSeverity: Sev
  onChange: (s: Sev) => void
}) {
  const opts: Sev[] = ['error', 'warning', 'info']
  return (
    <div className="flex items-center gap-0.5 shrink-0 mt-0.5">
      {opts.map((s) => {
        const active = s === value
        const c = severityColor(s)
        return (
          <button
            key={s}
            type="button"
            onClick={(e) => { e.preventDefault(); onChange(s) }}
            title={s === defaultSeverity ? `${s} (default)` : s}
            className="w-5 h-5 rounded text-[9px] font-mono font-bold leading-none transition-colors border"
            style={active
              ? { color: c, borderColor: `${c}66`, background: `${c}1a` }
              : { color: 'var(--text-faint)', borderColor: 'transparent', background: 'transparent' }}
          >
            {s[0].toUpperCase()}
          </button>
        )
      })}
    </div>
  )
}

// ── Rule row ──────────────────────────────────────────────────────────────────

function RuleRow({
  ruleId,
  checked,
  severity,
  onChange,
  onSeverityChange,
}: {
  ruleId: string
  checked: boolean
  severity: Sev
  onChange: (val: boolean) => void
  onSeverityChange: (s: Sev) => void
}) {
  const { i18n } = useTranslation()
  const locale = i18n.language?.split('-')[0] ?? 'en'
  const meta = RULE_METADATA[ruleId]
  if (!meta) return null

  return (
    <div className="flex items-start gap-3 py-2.5 group">
      <Switch.Root
        checked={checked}
        onCheckedChange={onChange}
        id={`rule-${ruleId}`}
        className="shrink-0 w-8 h-4 rounded-full relative outline-none focus-visible:ring-2 focus-visible:ring-[var(--accent)] transition-colors mt-0.5"
        style={{ background: checked ? 'var(--accent)' : 'var(--border)' }}
      >
        <Switch.Thumb
          className="block w-3 h-3 bg-white rounded-full shadow-sm"
          style={{
            transform: checked ? 'translateX(17px)' : 'translateX(2px)',
            transition: 'transform 150ms ease',
          }}
        />
      </Switch.Root>

      <label htmlFor={`rule-${ruleId}`} className="flex-1 min-w-0 cursor-pointer select-none">
        <div className="flex items-center gap-2 flex-wrap">
          <span className="text-[11px] text-[var(--text)] font-medium leading-tight">
            {getRuleLabel(ruleId, locale)}
          </span>
          {meta.standard && (
            <span
              className="text-[9px] font-mono px-1.5 py-0.5 rounded border leading-none"
              style={{
                color: 'var(--text-faint)',
                borderColor: 'var(--border)',
                background: 'var(--surface)',
              }}
            >
              {meta.standard}
            </span>
          )}
          {meta.autoFixable && (
            <span className="text-[9px] font-mono text-[var(--ok)] border border-[var(--ok)]33 px-1 rounded leading-none">
              auto-fix
            </span>
          )}
        </div>
        <p className="text-[10px] text-[var(--text-dim)] mt-0.5 leading-tight">
          {getRuleDescription(ruleId, locale)}
        </p>
      </label>

      <SeverityPicker
        value={severity}
        defaultSeverity={meta.defaultSeverity}
        onChange={onSeverityChange}
      />
    </div>
  )
}

// ── Category section ──────────────────────────────────────────────────────────

function CategorySection({
  cat,
  ruleIds,
  localRules,
  onToggle,
  onSeverityChange,
}: {
  cat: ValidationCategoryType
  ruleIds: string[]
  localRules: RulesConfig
  onToggle: (ruleId: string, val: boolean) => void
  onSeverityChange: (ruleId: string, s: 'error' | 'warning' | 'info') => void
}) {
  const { t } = useTranslation('validation')
  const rulesRecord = localRules as Record<string, unknown>
  const checkedCount = ruleIds.filter((id) => rulesRecord[id] === true).length
  const allOn = checkedCount === ruleIds.length

  const toggleAll = (): void => {
    ruleIds.forEach((id) => onToggle(id, !allOn))
  }

  return (
    <div className="mb-0.5">
      <div
        className="flex items-center gap-2 py-2 sticky top-0 z-10"
        style={{ background: 'var(--surface)' }}
      >
        <span className="text-[10px] font-semibold uppercase tracking-wider text-[var(--text-faint)]">
          {(t as (k: string) => string)(`catFull.${cat}`)}
        </span>
        <span
          className="text-[9px] font-mono px-1.5 py-0.5 rounded-full leading-none"
          style={{
            background: checkedCount > 0 ? 'var(--accent)15' : 'var(--surface-2)',
            color: checkedCount > 0 ? 'var(--accent)' : 'var(--text-faint)',
          }}
        >
          {checkedCount}/{ruleIds.length}
        </span>
        <div className="flex-1 h-px" style={{ background: 'var(--border)' }} />
        <button
          onClick={toggleAll}
          className="text-[9px] font-medium transition-colors"
          style={{ color: allOn ? 'var(--accent)' : 'var(--text-faint)' }}
          onMouseEnter={(e) => { (e.currentTarget as HTMLButtonElement).style.color = 'var(--accent)' }}
          onMouseLeave={(e) => { (e.currentTarget as HTMLButtonElement).style.color = allOn ? 'var(--accent)' : 'var(--text-faint)' }}
        >
          {allOn ? t('customProfile.removeAll') : t('customProfile.toggleAll')}
        </button>
      </div>

      <div className="divide-y" style={{ borderColor: 'var(--border)' }}>
        {ruleIds.map((ruleId) => {
          const meta = RULE_METADATA[ruleId]
          const sev = (localRules.severityOverrides?.[ruleId] ?? meta?.defaultSeverity ?? 'warning') as 'error' | 'warning' | 'info'
          return (
            <RuleRow
              key={ruleId}
              ruleId={ruleId}
              checked={(rulesRecord[ruleId] as boolean | undefined) ?? false}
              severity={sev}
              onChange={(val) => onToggle(ruleId, val)}
              onSeverityChange={(s) => onSeverityChange(ruleId, s)}
            />
          )
        })}
      </div>
    </div>
  )
}

// ── Main modal ────────────────────────────────────────────────────────────────

interface CustomProfileModalProps {
  open: boolean
  onClose: () => void
  editProfile?: ValidationProfile
}

export default function CustomProfileModal({ open, onClose, editProfile }: CustomProfileModalProps) {
  const { t } = useTranslation('validation')
  const isEditMode = !!editProfile

  const { rules: storeRules, customProfiles, addCustomProfile, updateCustomProfile } = useValidationStore(
    useShallow((s) => ({
      rules:               s.rules,
      customProfiles:      s.customProfiles,
      addCustomProfile:    s.addCustomProfile,
      updateCustomProfile: s.updateCustomProfile,
    })),
  )

  const [name, setName]               = useState('')
  const [description, setDescription] = useState('')
  const [icon, setIcon]               = useState(ICON_OPTIONS[0])
  const [localRules, setLocalRules]   = useState<RulesConfig>(() => ({ ...DEFAULT_RULES, ...storeRules }))
  const [error, setError]             = useState<string | null>(null)

  const handleOpenChange = (isOpen: boolean): void => {
    if (isOpen) {
      if (editProfile) {
        setName(editProfile.name)
        setDescription(editProfile.description)
        setIcon(editProfile.icon)
        setLocalRules({ ...DEFAULT_RULES, ...editProfile.rules })
      } else {
        setName('')
        setDescription('')
        setIcon(ICON_OPTIONS[0])
        setLocalRules({ ...DEFAULT_RULES, ...storeRules })
      }
      setError(null)
    } else {
      onClose()
    }
  }

  const toggleRule = (ruleId: string, value: boolean): void => {
    setLocalRules((prev) => ({ ...prev, [ruleId]: value }))
  }

  const setSeverity = (ruleId: string, sev: 'error' | 'warning' | 'info'): void => {
    setLocalRules((prev) => {
      const meta = RULE_METADATA[ruleId]
      const next = { ...(prev.severityOverrides ?? {}) }
      // Storing the rule's own default is a no-op → drop it to keep profiles clean.
      if (meta && sev === meta.defaultSeverity) delete next[ruleId]
      else next[ruleId] = sev
      return { ...prev, severityOverrides: next }
    })
  }

  const setThreshold = (
    key: 'proxyOverusePct' | 'coordinateOffsetKm' | 'fileSizePerElementKB',
    raw: string,
  ): void => {
    setLocalRules((prev) => {
      const next = { ...(prev.thresholds ?? {}) }
      const n = parseFloat(raw)
      // Empty / invalid / non-positive clears the override → rule uses its default.
      if (raw.trim() === '' || Number.isNaN(n) || n <= 0) delete next[key]
      else next[key] = n
      return { ...prev, thresholds: Object.keys(next).length > 0 ? next : undefined }
    })
  }

  const handleSave = (): void => {
    const trimmed = name.trim()
    if (!trimmed) { setError(t('customProfile.errorNameEmpty')); return }
    if (!isEditMode && customProfiles.length >= 5) { setError(t('customProfile.errorMaxProfiles')); return }

    const coverageTypes = getCoveredCategories(localRules)
    const profileData = {
      name:          trimmed,
      description:   description.trim() || t('customProfile.defaultDescription'),
      icon,
      rules:         localRules,
      coverageTypes,
    }

    if (isEditMode && editProfile) {
      updateCustomProfile(editProfile.id, profileData)
    } else {
      addCustomProfile(profileData)
    }
    onClose()
  }

  const grouped = useMemo(() => {
    const map = new Map<ValidationCategoryType, string[]>()
    for (const [ruleId, meta] of Object.entries(RULE_METADATA)) {
      const cat = meta.category
      const arr = map.get(cat) ?? []
      arr.push(ruleId)
      map.set(cat, arr)
    }
    return map
  }, [])

  const activeCount = useMemo(
    () => Object.entries(localRules).filter(([, v]) => v === true).length,
    [localRules],
  )

  const atLimit = !isEditMode && customProfiles.length >= 5

  // ── Cloud sync (F2 P6) ─────────────────────────────────────────────────────
  // Serialise the current editor state (rules already include severityOverrides
  // + thresholds) for the account; apply a fetched profile back into the editor.
  const serializeCurrent = (): { name: string; content: string } | null => {
    const trimmed = name.trim()
    if (!trimmed) return null
    const doc: SyncedValidatorProfile = {
      v: 1, name: trimmed, description: description.trim() || undefined, icon, rules: localRules,
    }
    return { name: trimmed, content: JSON.stringify(doc) }
  }
  const loadFromCloud = (content: string): void => {
    try {
      const doc = JSON.parse(content) as Partial<SyncedValidatorProfile>
      if (!doc || typeof doc !== 'object' || typeof doc.rules !== 'object' || doc.rules === null) {
        setError(t('customProfile.errorNameEmpty')); return
      }
      if (typeof doc.name === 'string') setName(doc.name)
      if (typeof doc.description === 'string') setDescription(doc.description)
      if (typeof doc.icon === 'string') setIcon(doc.icon)
      // Re-validate: only keep known rule keys, merged over defaults.
      setLocalRules({ ...DEFAULT_RULES, ...(doc.rules as RulesConfig) })
      setError(null)
    } catch {
      setError(t('customProfile.errorNameEmpty'))
    }
  }

  return (
    <Dialog.Root open={open} onOpenChange={handleOpenChange}>
      <Dialog.Portal>
        <Dialog.Overlay
          className="fixed inset-0 z-[100] bg-black/60 backdrop-blur-sm"
          style={{ animation: 'fadeIn 150ms ease' }}
        />
        <Dialog.Content
          className="fixed left-1/2 top-1/2 -translate-x-1/2 -translate-y-1/2 z-[101] w-[540px] max-w-[calc(100vw-1.5rem)] max-h-[90dvh] flex flex-col rounded-2xl outline-none"
          style={{
            background: 'var(--surface)',
            border: '1px solid var(--border)',
            boxShadow: '0 24px 80px rgba(0,0,0,0.55), 0 0 0 1px rgba(255,255,255,0.04)',
          }}
        >
          {/* ── Header ── */}
          <div
            className="flex items-center gap-3 px-5 py-4 shrink-0"
            style={{ borderBottom: '1px solid var(--border)' }}
          >
            <div className="flex-1 min-w-0">
              <Dialog.Title className="text-[13px] font-semibold leading-none" style={{ color: 'var(--text)' }}>
                {isEditMode ? t('customProfile.editTitle', { defaultValue: 'Edit profile' }) : t('customProfile.title')}
              </Dialog.Title>
              <p className="text-[11px] mt-1 leading-tight" style={{ color: 'var(--text-faint)' }}>
                {isEditMode
                  ? t('customProfile.editSubtitle', { defaultValue: 'Modify the rules and settings of this profile' })
                  : t('customProfile.subtitle')}
              </p>
            </div>
            <span
              className="shrink-0 text-[10px] font-mono px-2 py-0.5 rounded-full"
              style={{ color: 'var(--text-dim)', border: '1px solid var(--border)' }}
            >
              {t('customProfile.activeRules', { count: activeCount })}
            </span>
            <Dialog.Close
              className="shrink-0 w-7 h-7 flex items-center justify-center rounded-lg transition-colors"
              style={{ color: 'var(--text-faint)' }}
              aria-label={t('customProfile.close')}
              onMouseEnter={(e) => { (e.currentTarget as HTMLButtonElement).style.background = 'var(--surface-2)'; (e.currentTarget as HTMLButtonElement).style.color = 'var(--text)' }}
              onMouseLeave={(e) => { (e.currentTarget as HTMLButtonElement).style.background = 'transparent'; (e.currentTarget as HTMLButtonElement).style.color = 'var(--text-faint)' }}
            >
              <svg width="11" height="11" viewBox="0 0 11 11" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round">
                <path d="M1.5 1.5l8 8M9.5 1.5l-8 8" />
              </svg>
            </Dialog.Close>
          </div>

          {/* ── Identity: icon + name + description ── */}
          <div
            className="px-5 py-4 shrink-0"
            style={{ borderBottom: '1px solid var(--border)' }}
          >
            <div className="flex gap-4">
              {/* Icon column */}
              <div className="shrink-0 w-[108px]">
                <label
                  className="block text-[10px] font-semibold uppercase tracking-wider mb-2"
                  style={{ color: 'var(--text-faint)' }}
                >
                  {t('customProfile.icon')}
                </label>
                <div className="grid grid-cols-5 gap-1">
                  {ICON_OPTIONS.map((em) => (
                    <button
                      key={em}
                      type="button"
                      onClick={() => setIcon(em)}
                      className="w-8 h-8 flex items-center justify-center rounded-lg text-[14px] transition-all"
                      style={
                        icon === em
                          ? {
                              background: 'var(--accent)20',
                              border: '1.5px solid var(--accent)',
                              outline: 'none',
                            }
                          : {
                              background: 'var(--surface-2)',
                              border: '1px solid var(--border)',
                            }
                      }
                    >
                      {em}
                    </button>
                  ))}
                </div>
              </div>

              {/* Name + description column */}
              <div className="flex-1 min-w-0 flex flex-col gap-2.5">
                <div>
                  <label
                    className="block text-[10px] font-semibold uppercase tracking-wider mb-1.5"
                    style={{ color: 'var(--text-faint)' }}
                  >
                    {t('customProfile.profileName')}
                    {' '}
                    <span style={{ color: 'var(--danger)' }}>*</span>
                  </label>
                  <input
                    value={name}
                    onChange={(e) => { setName(e.target.value); setError(null) }}
                    onKeyDown={(e) => { if (e.key === 'Enter') handleSave() }}
                    placeholder={t('customProfile.profileNamePlaceholder')}
                    className="w-full h-8 px-3 text-[12px] rounded-lg outline-none transition-all"
                    style={{
                      background: 'var(--surface-2)',
                      border: error ? '1px solid var(--danger)' : '1px solid var(--border)',
                      color: 'var(--text)',
                    }}
                    onFocus={(e) => {
                      if (!error) (e.currentTarget as HTMLInputElement).style.borderColor = 'var(--accent)'
                    }}
                    onBlur={(e) => {
                      if (!error) (e.currentTarget as HTMLInputElement).style.borderColor = 'var(--border)'
                    }}
                  />
                  {error && (
                    <p className="text-[10px] mt-1.5 flex items-center gap-1" style={{ color: 'var(--danger)' }}>
                      <svg width="10" height="10" viewBox="0 0 10 10" fill="none" stroke="currentColor" strokeWidth="1.5">
                        <circle cx="5" cy="5" r="4" />
                        <path d="M5 3v2.5M5 7h.01" />
                      </svg>
                      {error}
                    </p>
                  )}
                </div>

                <div>
                  <label
                    className="block text-[10px] font-semibold uppercase tracking-wider mb-1.5"
                    style={{ color: 'var(--text-faint)' }}
                  >
                    {t('customProfile.descriptionLabel')}
                    {' '}
                    <span style={{ color: 'var(--text-faint)', fontWeight: 400, textTransform: 'none', letterSpacing: 0 }}>
                      {t('customProfile.descriptionOptional')}
                    </span>
                  </label>
                  <input
                    value={description}
                    onChange={(e) => setDescription(e.target.value)}
                    placeholder={t('customProfile.descriptionPlaceholder')}
                    className="w-full h-8 px-3 text-[12px] rounded-lg outline-none transition-all"
                    style={{
                      background: 'var(--surface-2)',
                      border: '1px solid var(--border)',
                      color: 'var(--text)',
                    }}
                    onFocus={(e) => { (e.currentTarget as HTMLInputElement).style.borderColor = 'var(--accent)' }}
                    onBlur={(e) => { (e.currentTarget as HTMLInputElement).style.borderColor = 'var(--border)' }}
                  />
                </div>
              </div>
            </div>
          </div>

          {/* ── Rule groups ── */}
          <div className="flex-1 overflow-y-auto px-5 py-3">
            {CATEGORY_ORDER.map((cat) => {
              const ruleIds = grouped.get(cat)
              if (!ruleIds || ruleIds.length === 0) return null
              return (
                <CategorySection
                  key={cat}
                  cat={cat}
                  ruleIds={ruleIds}
                  localRules={localRules}
                  onToggle={toggleRule}
                  onSeverityChange={setSeverity}
                />
              )
            })}

            {/* ── Advanced thresholds (Phase 3c) ── */}
            <div className="mt-3 pt-3 border-t" style={{ borderColor: 'var(--border)' }}>
              <span className="text-[10px] font-semibold uppercase tracking-wider text-[var(--text-faint)]">
                {t('customProfile.thresholds.title')}
              </span>
              <div className="flex flex-col gap-2 mt-2">
                {([
                  { key: 'proxyOverusePct',     def: 5,   unit: '%' },
                  { key: 'coordinateOffsetKm',  def: 10,  unit: 'km' },
                  { key: 'fileSizePerElementKB', def: 500, unit: 'KB/el' },
                ] as const).map(({ key, def, unit }) => (
                  <div key={key} className="flex items-center gap-2">
                    <label className="text-[11px] text-[var(--text-dim)] flex-1 min-w-0">
                      {t(`customProfile.thresholds.${key}`)}
                    </label>
                    <input
                      type="number"
                      min={0}
                      value={localRules.thresholds?.[key] ?? ''}
                      onChange={(e) => setThreshold(key, e.target.value)}
                      placeholder={String(def)}
                      className="w-16 h-7 px-2 text-[11px] rounded-md text-right outline-none"
                      style={{ background: 'var(--surface-2)', border: '1px solid var(--border)', color: 'var(--text)' }}
                    />
                    <span className="text-[10px] text-[var(--text-faint)] w-12">{unit}</span>
                  </div>
                ))}
              </div>
            </div>
          </div>

          {/* ── Cloud sync (F2 P6) — renders nothing when accounts are off ── */}
          <div className="px-5 pb-3 shrink-0">
            <SavedRulesetPicker
              kind="validator_profile"
              serializeCurrent={serializeCurrent}
              onLoad={loadFromCloud}
            />
          </div>

          {/* ── Footer ── */}
          <div
            className="flex items-center gap-3 px-5 py-3.5 shrink-0"
            style={{ borderTop: '1px solid var(--border)' }}
          >
            {atLimit && (
              <span className="text-[10px] flex-1" style={{ color: 'var(--danger)' }}>
                {t('customProfile.atLimit')}
              </span>
            )}
            <div className="flex gap-2 ml-auto">
              <Dialog.Close
                className="px-4 h-8 rounded-lg text-[11px] font-medium transition-colors"
                style={{ color: 'var(--text-dim)', border: '1px solid var(--border)' }}
                onMouseEnter={(e) => { const el = e.currentTarget as HTMLButtonElement; el.style.color = 'var(--text)'; el.style.borderColor = 'var(--text-dim)' }}
                onMouseLeave={(e) => { const el = e.currentTarget as HTMLButtonElement; el.style.color = 'var(--text-dim)'; el.style.borderColor = 'var(--border)' }}
              >
                {t('customProfile.cancel')}
              </Dialog.Close>
              <button
                onClick={handleSave}
                disabled={!name.trim() || atLimit}
                className="px-5 h-8 rounded-lg text-[11px] font-semibold text-white transition-all disabled:opacity-40"
                style={{ background: 'var(--accent)' }}
                onMouseEnter={(e) => { if (!e.currentTarget.disabled) (e.currentTarget as HTMLButtonElement).style.filter = 'brightness(1.12)' }}
                onMouseLeave={(e) => { (e.currentTarget as HTMLButtonElement).style.filter = 'none' }}
              >
                {isEditMode
                  ? t('customProfile.saveChanges', { defaultValue: 'Save changes' })
                  : t('customProfile.save')}
              </button>
            </div>
          </div>
        </Dialog.Content>
      </Dialog.Portal>
    </Dialog.Root>
  )
}
