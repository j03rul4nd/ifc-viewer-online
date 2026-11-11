// ─── BatchRenameDialog ───────────────────────────────────────────────────────
// The preview behind "Fix all N" on the two name rules: an editable naming
// pattern, a sample of old → new names, the warnings worth reading first and
// the predicted Health Score. Nothing is renamed until Apply, and even then
// only as queued edits; the panel exports and checks the fixed file after.
//
// The dialog plans nothing by itself. The panel hands in `planner`, closed over
// the visible issues, the spatial trees and the pending edits, so this file
// only deals with the pattern text and with what to show for a plan.

import { useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState } from 'react'
import { useTranslation } from 'react-i18next'
import { Modal } from '../Modal'
import {
  DEFAULT_PATTERNS, PATTERN_MAX, parseNamePattern, renderStem,
  type ParsedPattern, type PatternErrorCode,
} from '../../lib/fix/name-pattern'
import type { BatchRenamePlan, BatchRenameRule, RenameItem } from '../../lib/fix/batch-rename'

/** What Apply hands back. The panel re-plans from `pattern` once more before it pushes anything. */
export interface BatchRenameApply {
  plan: BatchRenamePlan
  pattern: ParsedPattern
  keepFirst: boolean
  /** The pattern differs from the rule's default (reported as a flag, never as text). */
  patternEdited: boolean
}

export interface BatchRenameDialogProps {
  ruleId: BatchRenameRule
  onClose: () => void
  /** Plan the batch for a pattern. Pure; called again on every pattern or option change. */
  planner: (pattern: ParsedPattern, keepFirst: boolean) => BatchRenamePlan
  /** The Health Score shown when the dialog opened. */
  beforeScore: number
  /** The score once a plan's cleared issues are gone. */
  predictAfter: (plan: BatchRenamePlan) => number
  /** The profile checks a naming convention, so generated names may trip it. */
  namingConventionActive?: boolean
  onApply: (input: BatchRenameApply) => void
  /** Wait after typing before re-planning. 0 plans on every change (tests). */
  debounceMs?: number
}

/** Tokens offered as chips, in the order they are most useful. */
const TOKEN_CHIPS = ['{class}', '{storey}', '{name}', '{n}', '{ifcclass}'] as const

const ERROR_KEY = {
  empty:         'batchFix.dialog.errEmpty',
  too_long:      'batchFix.dialog.errTooLong',
  brace:         'batchFix.dialog.errBrace',
  unknown_token: 'batchFix.dialog.errUnknownToken',
  type_later:    'batchFix.dialog.errTypeLater',
  bad_pad:       'batchFix.dialog.errBadPad',
} as const satisfies Record<PatternErrorCode, string>

export const SAMPLE_ROWS = 8

/**
 * The rows the preview shows: one per distinct stem first, so every kind of
 * name the pattern makes is visible, then the rest in file order to fill up.
 * Returned in file order, so the table reads the way the model is laid out.
 */
export function pickSampleRows(
  plan: BatchRenamePlan,
  pattern: ParsedPattern,
  max: number = SAMPLE_ROWS,
): RenameItem[] {
  const picked = new Set<number>()
  const stems = new Set<string>()
  const isEmptyRule = plan.ruleId === 'RULE_EMPTY_NAME'
  plan.items.forEach((item, i) => {
    if (picked.size >= max) return
    const stem = `${item.modelId}\u0001${renderStem(pattern, {
      ifcClass: item.ifcClass,
      storey:   item.storey,
      name:     isEmptyRule ? '' : item.oldValue,
    })}`
    if (stems.has(stem)) return
    stems.add(stem)
    picked.add(i)
  })
  for (let i = 0; i < plan.items.length && picked.size < max; i++) picked.add(i)
  return [...picked].sort((a, b) => a - b).map((i) => plan.items[i])
}

export default function BatchRenameDialog({
  ruleId, onClose, planner, beforeScore, predictAfter, namingConventionActive = false,
  onApply, debounceMs = 150,
}: BatchRenameDialogProps) {
  const { t } = useTranslation('validation')
  const defaultPattern = DEFAULT_PATTERNS[ruleId]
  const isDuplicate = ruleId === 'RULE_DUPLICATE_NAME'

  // `source` is what the input shows; `committed` is what the error line and
  // Apply's state follow; `planned` is the last pattern that parsed, which
  // the summary, the sample and the score keep showing while the input holds
  // a half-typed token. Without it the preview would unmount on every `{`
  // and come back on `}` — on a phone, the sheet jumping above the keyboard.
  // A pattern that parses is committed after a short pause; one that does
  // not waits longer, so typing `{storey}` by hand does not flash an error
  // between keys.
  const [source, setSource] = useState(defaultPattern)
  const [committed, setCommitted] = useState(defaultPattern)
  const [planned, setPlanned] = useState(defaultPattern)
  const [keepFirst, setKeepFirst] = useState(true)
  const inputRef = useRef<HTMLInputElement>(null)
  const cursorAfter = useRef<number | null>(null)

  const commit = useCallback((s: string): void => {
    setCommitted(s)
    if (parseNamePattern(s).ok) setPlanned(s)
  }, [])

  useEffect(() => {
    if (source === committed) return
    if (debounceMs <= 0) { commit(source); return }
    const wait = parseNamePattern(source).ok ? debounceMs : debounceMs * 3
    const h = setTimeout(() => commit(source), wait)
    return () => clearTimeout(h)
  }, [source, committed, debounceMs, commit])

  // Put the caret back after a chip inserted its token.
  useLayoutEffect(() => {
    const at = cursorAfter.current
    if (at === null) return
    cursorAfter.current = null
    const el = inputRef.current
    if (!el) return
    el.focus()
    el.setSelectionRange(at, at)
  }, [source])

  const parsed = useMemo(() => parseNamePattern(committed), [committed])
  const plannedPattern = useMemo(() => {
    const p = parseNamePattern(planned)
    return p.ok ? p.value : null
  }, [planned])
  const plan = useMemo(
    () => (plannedPattern ? planner(plannedPattern, keepFirst) : null),
    [plannedPattern, planner, keepFirst],
  )
  const after = useMemo(() => (plan ? predictAfter(plan) : null), [plan, predictAfter])
  const samples = useMemo(
    () => (plan && plannedPattern ? pickSampleRows(plan, plannedPattern) : []),
    [plan, plannedPattern],
  )

  const errorText = parsed.ok
    ? null
    : t(ERROR_KEY[parsed.error.code], { token: parsed.error.token !== undefined ? `{${parsed.error.token}}` : '' })
  // The preview is for the last pattern that parsed, not for what the input
  // shows: dimmed, and Apply waits for a pattern that parses.
  const outdated = !parsed.ok
  const blocked = !plan || outdated || plan.renamed === 0 || plan.missingTree.length > 0
  const modelCount = plan ? Object.keys(plan.byModel).length : 0

  const insertToken = (token: string): void => {
    const el = inputRef.current
    const start = el?.selectionStart ?? source.length
    const end = el?.selectionEnd ?? start
    cursorAfter.current = start + token.length
    setSource(source.slice(0, start) + token + source.slice(end))
  }

  const reset = (): void => {
    setSource(defaultPattern)
    commit(defaultPattern)
  }

  // Apply plans from what the input shows NOW: a click inside the debounce
  // must not apply the previous pattern.
  const apply = (): void => {
    if (source !== committed) commit(source)
    const now = parseNamePattern(source)
    if (!now.ok) return
    const fresh = planner(now.value, keepFirst)
    if (fresh.renamed === 0 || fresh.missingTree.length > 0) return
    onApply({ plan: fresh, pattern: now.value, keepFirst, patternEdited: source !== defaultPattern })
  }

  const delta = after !== null ? after - beforeScore : 0
  const afterColor = delta > 0 ? 'var(--ok)' : delta < 0 ? 'var(--danger)' : 'var(--text)'

  const warnings: string[] = []
  if (plan) {
    if (plan.bumped > 0)        warnings.push(t('batchFix.dialog.warnBumped', { count: plan.bumped }))
    if (plan.noStorey > 0)      warnings.push(t('batchFix.dialog.warnNoStorey', { count: plan.noStorey }))
    if (plan.skippedEdited > 0) warnings.push(t('batchFix.dialog.warnSkipped', { count: plan.skippedEdited }))
  }
  if (namingConventionActive) warnings.push(t('batchFix.dialog.warnNamingConvention'))

  return (
    <Modal
      open
      onClose={onClose}
      size="md"
      title={isDuplicate ? t('batchFix.dialog.titleDuplicate') : t('batchFix.dialog.titleEmpty')}
      description={t('batchFix.dialog.description')}
      footer={(
        <>
          <button
            type="button"
            data-testid="batch-rename-cancel"
            onClick={onClose}
            className="h-9 px-4 rounded-[8px] border border-[var(--border-strong)] text-[12px] text-[var(--text)] hover:bg-[var(--surface-2)]"
          >
            {t('batchFix.dialog.cancel')}
          </button>
          <button
            type="button"
            data-testid="batch-rename-apply"
            onClick={apply}
            disabled={blocked}
            className="h-9 px-4 rounded-[8px] text-[12px] font-semibold text-white disabled:opacity-40 disabled:cursor-not-allowed"
            style={{ background: 'var(--accent)' }}
          >
            {t('batchFix.dialog.apply', { count: plan?.renamed ?? 0 })}
          </button>
        </>
      )}
    >
      <div className="px-4 py-3 flex flex-col gap-3 text-[12px] text-[var(--text-dim)]">
        {/* ── Pattern ── */}
        <div className="flex flex-col gap-1.5">
          <div className="flex items-center gap-2">
            <label htmlFor="batch-rename-pattern" className="text-[11px] font-semibold uppercase tracking-wider text-[var(--text-faint)]">
              {t('batchFix.dialog.patternLabel')}
            </label>
            {source !== defaultPattern && (
              <button
                type="button"
                data-testid="batch-rename-reset"
                onClick={reset}
                className="ml-auto text-[11px] font-medium text-[var(--accent)] hover:underline"
              >
                {t('batchFix.dialog.reset')}
              </button>
            )}
          </div>
          <input
            id="batch-rename-pattern"
            ref={inputRef}
            data-testid="batch-rename-pattern"
            value={source}
            maxLength={PATTERN_MAX}
            spellCheck={false}
            autoComplete="off"
            onChange={(e) => setSource(e.target.value)}
            onKeyDown={(e) => {
              // The Enter that confirms an IME composition (ja, zh…) is not a
              // request to apply: Chrome flags it isComposing, Safari sends
              // keyCode 229 right after compositionend.
              if (e.key !== 'Enter' || e.nativeEvent.isComposing || e.keyCode === 229) return
              e.preventDefault()
              apply()
            }}
            aria-invalid={!parsed.ok}
            aria-describedby={errorText ? 'batch-rename-pattern-error' : 'batch-rename-pattern-help'}
            className="h-9 px-2.5 rounded-[8px] bg-[var(--surface-2)] border text-[13px] font-mono text-[var(--text)] outline-none focus:border-[var(--accent)]"
            style={{ borderColor: parsed.ok ? 'var(--border)' : 'var(--danger)' }}
          />
          <div className="flex flex-wrap gap-1">
            {TOKEN_CHIPS.map((token) => (
              <button
                key={token}
                type="button"
                // Keep the caret where it is: the chip inserts at the cursor.
                onMouseDown={(e) => e.preventDefault()}
                onClick={() => insertToken(token)}
                className="h-6 px-2 rounded-full text-[11px] font-mono border border-[var(--border)] text-[var(--text-dim)] hover:text-[var(--accent)] hover:border-[var(--accent)] transition-colors"
              >
                {token}
              </button>
            ))}
          </div>
          {errorText ? (
            <p id="batch-rename-pattern-error" role="alert" data-testid="batch-rename-error" className="text-[11px] text-[var(--danger)] m-0">{errorText}</p>
          ) : (
            <p id="batch-rename-pattern-help" className="text-[11px] text-[var(--text-faint)] leading-snug m-0">
              {t('batchFix.dialog.patternHelp')}
            </p>
          )}
        </div>

        {/* ── Keep-first (duplicates only) ── */}
        {isDuplicate && (
          <label className="flex items-start gap-2 text-[12px] text-[var(--text)]">
            <input
              type="checkbox"
              data-testid="batch-rename-keep-first"
              checked={keepFirst && (plan?.keepFirstAvailable ?? true)}
              disabled={plan !== null && !plan.keepFirstAvailable}
              onChange={(e) => setKeepFirst(e.target.checked)}
              className="mt-0.5 accent-[var(--accent)]"
            />
            <span className="flex flex-col gap-0.5">
              {t('batchFix.dialog.keepFirst')}
              {plan !== null && !plan.keepFirstAvailable && (
                <span className="text-[11px] text-[var(--text-faint)]">{t('batchFix.dialog.keepFirstUnavailable')}</span>
              )}
            </span>
          </label>
        )}

        {/* ── Summary + predicted score ── */}
        {plan && (
          <div
            data-testid="batch-rename-preview-summary"
            data-outdated={outdated ? 'true' : 'false'}
            className="flex flex-col gap-1 rounded-[8px] px-3 py-2 bg-[var(--surface-2)] border border-[var(--border)] transition-opacity"
            style={{ opacity: outdated ? 0.45 : 1 }}
          >
            <span data-testid="batch-rename-summary" className="text-[12px] text-[var(--text)] font-medium">
              {t('batchFix.dialog.summaryRenamed', { count: plan.renamed })}
              {' · '}
              {t('batchFix.dialog.summaryCleared', { count: plan.cleared })}
              {modelCount > 1 && (
                <span className="text-[var(--text-faint)] font-normal"> · {t('batchFix.dialog.multiModel', { count: modelCount })}</span>
              )}
            </span>
            {after !== null && (
              <span data-testid="batch-rename-predicted" className="text-[12px] font-mono font-semibold" style={{ color: afterColor }}>
                {t('batchFix.dialog.predicted', { before: beforeScore, after })}
              </span>
            )}
            <span className="text-[11px] text-[var(--text-faint)]">{t('batchFix.dialog.predictedNote')}</span>
          </div>
        )}

        {/* ── Blocked: a model was validated without its tree ── */}
        {plan && plan.missingTree.length > 0 && (
          <p className="m-0 text-[11.5px] text-[var(--danger)]">{t('batchFix.disabledNoTree')}</p>
        )}

        {/* ── Warnings ── */}
        {warnings.length > 0 && (
          <ul data-testid="batch-rename-warnings" className="m-0 pl-0 list-none flex flex-col gap-1">
            {warnings.map((w) => (
              <li key={w} className="flex items-start gap-1.5 text-[11.5px] leading-snug" style={{ color: 'var(--warn, #E9A23B)' }}>
                <svg width="11" height="11" viewBox="0 0 10 10" fill="none" stroke="currentColor" strokeWidth="1.3" strokeLinecap="round" className="shrink-0 mt-0.5">
                  <circle cx="5" cy="5" r="4.5" />
                  <path d="M5 3v2.5M5 7h.01" />
                </svg>
                <span>{w}</span>
              </li>
            ))}
          </ul>
        )}

        {/* ── Sample ── */}
        {samples.length > 0 && (
          <div className="flex flex-col gap-1 transition-opacity" style={{ opacity: outdated ? 0.45 : 1 }}>
            <span className="text-[11px] font-semibold uppercase tracking-wider text-[var(--text-faint)]">
              {t('batchFix.dialog.sampleHeading')}
            </span>
            <div className="overflow-x-auto rounded-[8px] border border-[var(--border)]">
              <table data-testid="batch-rename-sample" className="w-full text-[11.5px] border-collapse">
                <thead>
                  <tr className="text-left text-[10px] uppercase tracking-wider text-[var(--text-faint)] bg-[var(--surface-2)]">
                    <th className="px-2 py-1.5 font-medium">{t('batchFix.dialog.colStorey')}</th>
                    <th className="px-2 py-1.5 font-medium">{t('batchFix.dialog.colCurrent')}</th>
                    <th className="px-2 py-1.5 font-medium">{t('batchFix.dialog.colNew')}</th>
                  </tr>
                </thead>
                <tbody>
                  {samples.map((item) => (
                    <tr key={`${item.modelId}:${item.expressId}`} className="border-t border-[var(--border)]">
                      <td className="px-2 py-1.5 text-[var(--text-faint)] max-w-[140px] truncate" title={item.storey || undefined}>
                        {item.storey || '—'}
                      </td>
                      <td className="px-2 py-1.5 max-w-[160px] truncate" title={item.oldValue || undefined}>
                        {item.oldValue === ''
                          ? <em className="text-[var(--text-faint)]">{t('batchFix.dialog.empty')}</em>
                          : item.oldValue}
                      </td>
                      <td className="px-2 py-1.5 font-mono text-[var(--text)] max-w-[200px] truncate" title={item.newValue}>
                        {item.newValue}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
            {plan && plan.items.length > samples.length && (
              <span className="text-[11px] text-[var(--text-faint)]">
                {t('batchFix.dialog.more', { count: plan.items.length - samples.length })}
              </span>
            )}
          </div>
        )}
      </div>
    </Modal>
  )
}
