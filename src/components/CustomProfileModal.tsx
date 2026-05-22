// ─── CustomProfileModal ───────────────────────────────────────────────────────
// Modal for creating a custom validation profile.
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
  VALIDATION_CATEGORY_LABELS,
  DEFAULT_RULES,
  getRuleLabel,
  getRuleDescription,
} from '../types'
import type { RulesConfig, ValidationCategoryType, SupportedLocale } from '../types'
import { getCoveredCategories } from './ValidationCoverageSummary'

// ── Severity color ────────────────────────────────────────────────────────────

function severityColor(sev: 'error' | 'warning' | 'info'): string {
  if (sev === 'error')   return 'var(--danger)'
  if (sev === 'warning') return '#F5A623'
  return '#5E9ED6'
}

// ── Icon options ──────────────────────────────────────────────────────────────

const ICON_OPTIONS = ['⚙️', '🏗️', '🏢', '📐', '🔧', '🔍', '📋', '✅', '🌍', '🏛️']

// ── Category order ────────────────────────────────────────────────────────────

const CATEGORY_ORDER: ValidationCategoryType[] = [
  'schema', 'spatial', 'quality', 'lod', 'classification', 'mep', 'clash', 'iso19650',
]

// ── Rule row ──────────────────────────────────────────────────────────────────

function RuleRow({
  ruleId,
  checked,
  onChange,
}: {
  ruleId: string
  checked: boolean
  onChange: (val: boolean) => void
}) {
  const { i18n } = useTranslation()
  const locale = (i18n.language?.split('-')[0] ?? 'en') as SupportedLocale
  const meta = RULE_METADATA[ruleId]
  if (!meta) return null

  return (
    <div className="flex items-start gap-3 py-2 group">
      <Switch.Root
        checked={checked}
        onCheckedChange={onChange}
        id={`rule-${ruleId}`}
        className="shrink-0 w-8 h-4 rounded-full relative outline-none focus-visible:ring-2 focus-visible:ring-[var(--accent)] transition-colors mt-0.5"
        style={{ background: checked ? 'var(--accent)' : 'var(--border)' }}
      >
        <Switch.Thumb
          className="block w-3 h-3 bg-white rounded-full"
          style={{
            transform: checked ? 'translateX(17px)' : 'translateX(2px)',
            transition: 'transform 150ms ease',
          }}
        />
      </Switch.Root>

      <label htmlFor={`rule-${ruleId}`} className="flex-1 min-w-0 cursor-pointer">
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

      <span
        className="shrink-0 text-[9px] font-mono font-semibold leading-none mt-1"
        style={{ color: severityColor(meta.defaultSeverity) }}
      >
        {meta.defaultSeverity}
      </span>
    </div>
  )
}

// ── Category section ──────────────────────────────────────────────────────────

function CategorySection({
  cat,
  ruleIds,
  localRules,
  onToggle,
}: {
  cat: ValidationCategoryType
  ruleIds: string[]
  localRules: RulesConfig
  onToggle: (ruleId: string, val: boolean) => void
}) {
  const { t } = useTranslation('validation')
  const rulesRecord = localRules as Record<string, unknown>
  const checkedCount = ruleIds.filter((id) => rulesRecord[id] === true).length

  const toggleAll = (): void => {
    const allOn = checkedCount === ruleIds.length
    ruleIds.forEach((id) => onToggle(id, !allOn))
  }

  return (
    <div className="mb-1">
      {/* Category header */}
      <div className="flex items-center gap-2 py-1.5 sticky top-0 bg-[var(--surface)] z-10">
        <span className="text-[10px] font-semibold uppercase tracking-wider text-[var(--text-dim)]">
          {VALIDATION_CATEGORY_LABELS[cat]}
        </span>
        <span className="text-[9px] font-mono text-[var(--text-faint)]">
          {checkedCount}/{ruleIds.length}
        </span>
        <div className="flex-1 h-px bg-[var(--border)]" />
        <button
          onClick={toggleAll}
          className="text-[9px] text-[var(--text-faint)] hover:text-[var(--accent)] transition-colors font-medium"
        >
          {checkedCount === ruleIds.length ? t('customProfile.removeAll') : t('customProfile.toggleAll')}
        </button>
      </div>

      {/* Rule rows */}
      <div className="divide-y divide-[var(--border)]">
        {ruleIds.map((ruleId) => (
          <RuleRow
            key={ruleId}
            ruleId={ruleId}
            checked={(rulesRecord[ruleId] as boolean | undefined) ?? false}
            onChange={(val) => onToggle(ruleId, val)}
          />
        ))}
      </div>
    </div>
  )
}

// ── Main modal ────────────────────────────────────────────────────────────────

interface CustomProfileModalProps {
  open: boolean
  onClose: () => void
}

export default function CustomProfileModal({ open, onClose }: CustomProfileModalProps) {
  const { t } = useTranslation('validation')
  const { rules: storeRules, customProfiles, addCustomProfile } = useValidationStore(
    useShallow((s) => ({
      rules:            s.rules,
      customProfiles:   s.customProfiles,
      addCustomProfile: s.addCustomProfile,
    })),
  )

  const [name, setName]             = useState('')
  const [description, setDescription] = useState('')
  const [icon, setIcon]             = useState(ICON_OPTIONS[0])
  const [localRules, setLocalRules] = useState<RulesConfig>(() => ({ ...DEFAULT_RULES, ...storeRules }))
  const [error, setError]           = useState<string | null>(null)

  const handleOpenChange = (isOpen: boolean): void => {
    if (isOpen) {
      setName('')
      setDescription('')
      setIcon(ICON_OPTIONS[0])
      setLocalRules({ ...DEFAULT_RULES, ...storeRules })
      setError(null)
    } else {
      onClose()
    }
  }

  const toggleRule = (ruleId: string, value: boolean): void => {
    setLocalRules((prev) => ({ ...prev, [ruleId]: value }))
  }

  const handleSave = (): void => {
    const trimmed = name.trim()
    if (!trimmed) { setError(t('customProfile.errorNameEmpty')); return }
    if (customProfiles.length >= 5) { setError(t('customProfile.errorMaxProfiles')); return }
    // Derive coverage categories automatically from the active rule set
    const coverageTypes = getCoveredCategories(localRules)
    addCustomProfile({
      name:        trimmed,
      description: description.trim() || t('customProfile.defaultDescription'),
      icon,
      rules:       localRules,
      coverageTypes,
    })
    onClose()
  }

  // Group rules by category
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

  const atLimit = customProfiles.length >= 5

  return (
    <Dialog.Root open={open} onOpenChange={handleOpenChange}>
      <Dialog.Portal>
        <Dialog.Overlay
          className="fixed inset-0 z-[100] bg-black/60 backdrop-blur-sm"
          style={{ animation: 'fadeIn 150ms ease' }}
        />
        <Dialog.Content
          className="fixed left-1/2 top-1/2 -translate-x-1/2 -translate-y-1/2 z-[101] w-[520px] max-w-[calc(100vw-1.5rem)] max-h-[90dvh] flex flex-col rounded-2xl border border-[var(--border)] bg-[var(--surface)] outline-none"
          style={{ boxShadow: '0 24px 64px rgba(0,0,0,0.5)' }}
        >
          {/* ── Header ── */}
          <div className="flex items-center gap-3 px-4 sm:px-5 py-3 sm:py-4 border-b border-[var(--border)] shrink-0">
            <div className="flex-1 min-w-0">
              <Dialog.Title className="text-[14px] font-semibold text-[var(--text)] leading-none">
                {t('customProfile.title')}
              </Dialog.Title>
              <p className="text-[11px] text-[var(--text-faint)] mt-0.5">
                {t('customProfile.subtitle')}
              </p>
            </div>
            <span className="shrink-0 text-[10px] font-mono text-[var(--text-dim)] border border-[var(--border)] px-2 py-0.5 rounded-full">
              {t('customProfile.activeRules', { count: activeCount })}
            </span>
            <Dialog.Close
              className="shrink-0 w-7 h-7 flex items-center justify-center rounded-lg text-[var(--text-faint)] hover:text-[var(--text)] hover:bg-[var(--surface-2)] transition-colors"
              aria-label={t('customProfile.close')}
            >
              <svg width="12" height="12" viewBox="0 0 12 12" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round">
                <path d="M2 2l8 8M10 2L2 10" />
              </svg>
            </Dialog.Close>
          </div>

          {/* ── Name + icon + description ── */}
          <div className="px-4 sm:px-5 pt-3 sm:pt-4 pb-3 shrink-0 border-b border-[var(--border)] flex flex-col gap-3">
            {/* Name row: icon picker + name input together */}
            <div className="flex items-end gap-2">
              {/* Icon picker */}
              <div className="shrink-0">
                <label className="block text-[11px] font-medium text-[var(--text-dim)] mb-1.5">{t('customProfile.icon')}</label>
                <div className="flex flex-wrap gap-1">
                  {ICON_OPTIONS.map((em) => (
                    <button
                      key={em}
                      type="button"
                      onClick={() => setIcon(em)}
                      className="w-8 h-8 flex items-center justify-center rounded-lg text-[15px] border transition-all"
                      style={
                        icon === em
                          ? { borderColor: 'var(--accent)', background: 'var(--accent)18' }
                          : { borderColor: 'var(--border)', background: 'var(--surface-2)' }
                      }
                    >
                      {em}
                    </button>
                  ))}
                </div>
              </div>
            </div>

            {/* Name input */}
            <div>
              <label className="block text-[11px] font-medium text-[var(--text-dim)] mb-1.5">
                {t('customProfile.profileName')} <span className="text-[var(--danger)]">*</span>
              </label>
              <input
                value={name}
                onChange={(e) => { setName(e.target.value); setError(null) }}
                onKeyDown={(e) => { if (e.key === 'Enter') handleSave() }}
                placeholder={t('customProfile.profileNamePlaceholder')}
                className="w-full h-9 px-3 text-[12px] bg-[var(--surface-2)] border border-[var(--border)] rounded-lg text-[var(--text)] placeholder:text-[var(--text-faint)] outline-none focus:border-[var(--accent)] transition-colors"
              />
              {error && (
                <p className="text-[10px] text-[var(--danger)] mt-1.5 flex items-center gap-1">
                  <svg width="10" height="10" viewBox="0 0 10 10" fill="none" stroke="currentColor" strokeWidth="1.5">
                    <circle cx="5" cy="5" r="4" />
                    <path d="M5 3v2.5M5 7h.01" />
                  </svg>
                  {error}
                </p>
              )}
            </div>

            {/* Description (optional) */}
            <div>
              <label className="block text-[11px] font-medium text-[var(--text-dim)] mb-1.5">
                {t('customProfile.descriptionLabel')} <span className="text-[var(--text-faint)]">{t('customProfile.descriptionOptional')}</span>
              </label>
              <input
                value={description}
                onChange={(e) => setDescription(e.target.value)}
                placeholder={t('customProfile.descriptionPlaceholder')}
                className="w-full h-8 px-3 text-[12px] bg-[var(--surface-2)] border border-[var(--border)] rounded-lg text-[var(--text)] placeholder:text-[var(--text-faint)] outline-none focus:border-[var(--accent)] transition-colors"
              />
            </div>
          </div>

          {/* ── Rule groups ── */}
          <div className="flex-1 overflow-y-auto px-4 sm:px-5 py-3">
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
                />
              )
            })}
          </div>

          {/* ── Footer ── */}
          <div className="flex items-center gap-3 px-4 sm:px-5 py-3 border-t border-[var(--border)] shrink-0">
            {atLimit && (
              <span className="text-[10px] text-[var(--danger)] flex-1">
                {t('customProfile.atLimit')}
              </span>
            )}
            <div className="flex gap-2 ml-auto">
              <Dialog.Close className="px-4 h-8 rounded-lg text-[11px] font-medium text-[var(--text-dim)] border border-[var(--border)] hover:text-[var(--text)] hover:border-[var(--text-dim)] transition-colors">
                {t('customProfile.cancel')}
              </Dialog.Close>
              <button
                onClick={handleSave}
                disabled={!name.trim() || atLimit}
                className="px-5 h-8 rounded-lg text-[11px] font-semibold bg-[var(--accent)] text-white hover:brightness-110 disabled:opacity-40 transition-all"
              >
                {t('customProfile.save')}
              </button>
            </div>
          </div>
        </Dialog.Content>
      </Dialog.Portal>
    </Dialog.Root>
  )
}
