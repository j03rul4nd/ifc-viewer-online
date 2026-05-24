// ─── ValidationCoverageSummary ────────────────────────────────────────────────
// Post-run banner showing category coverage, quality score and smart profile
// suggestion. Auto-dismisses after autoDismissMs (default 6 s).

import React, { useEffect, useRef } from 'react'
import { useTranslation } from 'react-i18next'
import type { ValidationCategoryType, RulesConfig } from '../types'
import { RULE_METADATA, VALIDATION_PROFILES } from '../types'

// ── Exports used by ValidationPanel ──────────────────────────────────────────

export const ALL_CATEGORIES: ValidationCategoryType[] = [
  'schema', 'spatial', 'quality', 'lod', 'iso19650', 'classification', 'mep', 'clash',
]

/** Derive which category types are covered by the given rules config */
export function getCoveredCategories(rules: RulesConfig): ValidationCategoryType[] {
  const covered = new Set<ValidationCategoryType>()
  for (const [key, value] of Object.entries(rules)) {
    if (!value || key === 'namingConventionPatterns' || key === 'requiredPsets' ||
        key === 'lodLevel' || key === 'classificationSystems' ||
        key === 'iso19650FilenamePattern') continue
    const meta = RULE_METADATA[key]
    if (meta) covered.add(meta.category)
  }
  return ALL_CATEGORIES.filter((c) => covered.has(c))
}

// ── Category badge ────────────────────────────────────────────────────────────

const CATEGORY_COLORS: Partial<Record<ValidationCategoryType, string>> = {
  schema:         '#5E9ED6',
  spatial:        '#5E9ED6',
  quality:        '#30A46C',
  lod:            '#F5A623',
  iso19650:       '#9B8EF7',
  classification: '#F5A623',
  mep:            '#5E9ED6',
  clash:          '#E5484D',
}

function CategoryChip({ cat, checked }: { cat: ValidationCategoryType; checked: boolean }) {
  const { t } = useTranslation('validation')
  const color = checked ? (CATEGORY_COLORS[cat] ?? 'var(--ok)') : undefined
  return (
    <span
      className="inline-flex items-center gap-1 px-2 py-1 rounded-md text-[10px] font-medium border leading-none"
      style={
        checked
          ? { background: `${color}14`, color, borderColor: `${color}33` }
          : { background: 'var(--surface)', color: 'var(--text-faint)', borderColor: 'var(--border)' }
      }
    >
      {checked && (
        <svg width="8" height="8" viewBox="0 0 8 8" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round">
          <polyline points="1.5,4 3,5.5 6.5,2" />
        </svg>
      )}
      {(t as (k: string) => string)(`catFull.${cat}`)}
    </span>
  )
}

// ── Smart profile suggestion ───────────────────────────────────────────────────

function getSuggestedProfile(uncovered: ValidationCategoryType[]): string | null {
  if (uncovered.length === 0) return null
  // Find the profile that covers the most uncovered categories
  let bestProfile: string | null = null
  let bestScore = 0
  for (const profile of VALIDATION_PROFILES) {
    const score = profile.coverageTypes.filter((c) => uncovered.includes(c)).length
    if (score > bestScore) {
      bestScore = score
      bestProfile = profile.name
    }
  }
  return bestProfile
}

// ── Score ring ────────────────────────────────────────────────────────────────

function ScoreRing({ score }: { score: number }) {
  const { t } = useTranslation('validation')
  const color =
    score >= 80 ? '#30A46C' :
    score >= 50 ? '#F5A623' :
    'var(--danger)'

  const label =
    score >= 80 ? t('coverage.excellent') :
    score >= 50 ? t('coverage.acceptable') :
    t('coverage.critical')

  const r = 18
  const circ = 2 * Math.PI * r
  const fill = (score / 100) * circ

  return (
    <div className="flex flex-col items-center gap-0.5 shrink-0">
      <svg width="48" height="48" viewBox="0 0 48 48">
        {/* Track */}
        <circle
          cx="24" cy="24" r={r}
          fill="none"
          stroke="var(--border)"
          strokeWidth="4"
        />
        {/* Fill */}
        <circle
          cx="24" cy="24" r={r}
          fill="none"
          stroke={color}
          strokeWidth="4"
          strokeLinecap="round"
          strokeDasharray={`${fill} ${circ}`}
          transform="rotate(-90 24 24)"
          style={{ transition: 'stroke-dasharray 0.6s ease' }}
        />
        {/* Score text */}
        <text
          x="24" y="24"
          textAnchor="middle"
          dominantBaseline="central"
          fontSize="12"
          fontWeight="700"
          fill={color}
          fontFamily="ui-monospace, monospace"
        >
          {score}
        </text>
      </svg>
      <span className="text-[9px] font-semibold" style={{ color }}>{label}</span>
    </div>
  )
}

// ── Main component ─────────────────────────────────────────────────────────────

interface ValidationCoverageSummaryProps {
  activeRules:       RulesConfig
  activeProfileName: string | null
  qualityScore:      number
  onDismiss:         () => void
  /** Auto-dismiss after this many ms (default 6000) */
  autoDismissMs?:    number
}

export default function ValidationCoverageSummary({
  activeRules,
  activeProfileName,
  qualityScore,
  onDismiss,
  autoDismissMs = 6000,
}: ValidationCoverageSummaryProps) {
  const { t } = useTranslation('validation')
  const timerRef = useRef<ReturnType<typeof setTimeout> | null>(null)

  useEffect(() => {
    timerRef.current = setTimeout(onDismiss, autoDismissMs)
    return () => { if (timerRef.current !== null) clearTimeout(timerRef.current) }
  }, [onDismiss, autoDismissMs])

  const covered   = getCoveredCategories(activeRules)
  const uncovered = ALL_CATEGORIES.filter((c) => !covered.includes(c))
  const pct       = Math.round((covered.length / ALL_CATEGORIES.length) * 100)
  const suggested = getSuggestedProfile(uncovered)

  return (
    <div className="mx-3 my-2 rounded-xl border border-[var(--border)] bg-[var(--surface-2)] overflow-hidden shrink-0"
         style={{ boxShadow: '0 2px 12px rgba(0,0,0,0.18)' }}>
      {/* Top progress bar */}
      <div className="h-0.5 bg-[var(--border)]">
        <div
          className="h-full rounded-full transition-all duration-700"
          style={{ width: `${pct}%`, background: 'var(--accent)' }}
        />
      </div>

      <div className="flex gap-3 px-3 py-2.5">
        {/* Score ring */}
        <ScoreRing score={qualityScore} />

        {/* Main content */}
        <div className="flex-1 min-w-0 flex flex-col gap-1.5">
          {/* Header */}
          <div className="flex items-center justify-between gap-2">
            <div className="min-w-0">
              <span className="text-[11px] font-semibold text-[var(--text)]">
                {t('coverage.scoreLabel')}
              </span>
              {activeProfileName && (
                <span className="ml-1.5 text-[10px] text-[var(--text-faint)]">
                  · {activeProfileName}
                </span>
              )}
            </div>
            <div className="flex items-center gap-2 shrink-0">
              <span className="text-[10px] font-mono text-[var(--text-dim)]">
                {t('coverage.covered', { count: covered.length, total: ALL_CATEGORIES.length })}
              </span>
              <button
                onClick={onDismiss}
                className="text-[var(--text-faint)] hover:text-[var(--text)] w-5 h-5 flex items-center justify-center rounded hover:bg-[var(--border)] transition-colors"
                aria-label={t('customProfile.close')}
              >
                <svg width="10" height="10" viewBox="0 0 10 10" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round">
                  <path d="M2 2l6 6M8 2L2 8" />
                </svg>
              </button>
            </div>
          </div>

          {/* Category chips */}
          <div className="flex flex-wrap gap-1">
            {ALL_CATEGORIES.map((cat) => (
              <CategoryChip key={cat} cat={cat} checked={covered.includes(cat)} />
            ))}
          </div>

          {/* Smart suggestion */}
          {suggested && uncovered.length > 0 && (
            <p className="text-[10px] text-[var(--text-faint)] leading-tight">
              <span className="text-[var(--accent)] font-medium">
                {t('coverage.suggestedProfile', { name: suggested })}
              </span>
              {' '}— {uncovered.map((c) => (t as (k: string) => string)(`catFull.${c}`)).join(', ')}.
            </p>
          )}
        </div>
      </div>
    </div>
  )
}
