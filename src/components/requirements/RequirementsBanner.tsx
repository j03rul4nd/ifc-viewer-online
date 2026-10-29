// ─── RequirementsBanner ───────────────────────────────────────────────────────
// What a supplier sees after opening a receiver's requirements link: who asks
// for what, and — once the model is in and checked — Meets / Does not meet.
// The checks themselves are the app's own (validator + IDS); this only reads
// their results and compares them with the link (lib/requirements).

import React, { useEffect, useMemo, useRef } from 'react'
import { useTranslation } from 'react-i18next'
import { useRequirementsStore } from '../../stores/requirementsStore'
import { useValidationStore } from '../../stores/validationStore'
import { useIdsStore } from '../../stores/idsStore'
import { useSceneStore } from '../../stores/sceneStore'
import { useUIStore } from '../../stores/uiStore'
import { calculateQualityScore } from '../../lib/validator'
import { evaluateRequirements, type CheckState } from '../../lib/requirements/requirements-link'
import { trackRequirementsVerdict } from '../../lib/analytics'

const STATE_STYLE: Record<CheckState, { dot: string; text: string }> = {
  pending: { dot: 'bg-[var(--text-faint)]', text: 'text-[var(--text-muted)]' },
  pass: { dot: 'bg-emerald-500', text: 'text-emerald-400' },
  fail: { dot: 'bg-red-500', text: 'text-red-400' },
}

export default function RequirementsBanner({ onOpenFile }: { onOpenFile: () => void }) {
  const { t } = useTranslation('ids')
  const req = useRequirementsStore((s) => s.active)
  const dismissed = useRequirementsStore((s) => s.dismissed)
  const result = useValidationStore((s) => s.result)
  const isRunning = useValidationStore((s) => s.isRunning)
  const hasModel = useSceneStore((s) => s.models.length > 0)
  const targetId = useSceneStore((s) => s.activeModelId ?? s.models[0]?.id ?? null)
  const idsResult = useIdsStore((s) => (targetId ? s.resultsByModel[targetId] ?? null : null))

  const verdict = useMemo(() => {
    if (!req) return null
    const score = result && !isRunning ? calculateQualityScore(result) : null
    return evaluateRequirements(req, { score, ids: idsResult })
  }, [req, result, isRunning, idsResult])

  // One verdict event per model checked against the link.
  const reported = useRef<string | null>(null)
  useEffect(() => {
    if (!verdict || verdict.state === 'pending' || !targetId || reported.current === targetId) return
    reported.current = targetId
    const value = verdict.score?.value
    trackRequirementsVerdict({
      pass: verdict.state === 'pass',
      score_bucket: typeof value === 'number' ? `${Math.floor(value / 10) * 10}` : null,
    })
  }, [verdict, targetId])

  if (!req || !verdict || dismissed) return null

  // A profile change (second link on an open model) clears the result: the
  // supplier has to run the validation again before there is a verdict.
  const needsRun = hasModel && !!verdict.score && verdict.score.value === null && !isRunning

  const headline = !hasModel ? t('requirements.banner.dropModel')
    : needsRun ? t('requirements.banner.needsRun')
    : verdict.state === 'pass' ? t('requirements.banner.pass')
    : verdict.state === 'fail' ? t('requirements.banner.fail')
    : t('requirements.banner.checking')

  return (
    <aside
      role="status"
      aria-live="polite"
      className="absolute left-1/2 -translate-x-1/2 top-3 z-[9] w-[min(560px,calc(100%-32px))] rounded-2xl glass border border-[var(--border-strong)] shadow-[0_16px_48px_rgba(0,0,0,0.45)] p-3.5"
    >
      <div className="flex items-start gap-3">
        <span className={`mt-1.5 h-2.5 w-2.5 shrink-0 rounded-full ${STATE_STYLE[hasModel ? verdict.state : 'pending'].dot}`} aria-hidden />
        <div className="min-w-0 flex-1">
          <p className="m-0 text-[11px] uppercase tracking-wide text-[var(--text-faint)]">
            {req.i ? t('requirements.banner.from', { issuer: req.i }) : t('requirements.banner.label')}
          </p>
          <p className="m-0 text-[13.5px] font-medium text-[var(--text)] truncate">{req.t}</p>
          <p className={`m-0 mt-1 text-[13px] font-semibold ${STATE_STYLE[hasModel ? verdict.state : 'pending'].text}`}>{headline}</p>
          <ul className="m-0 mt-2 p-0 list-none flex flex-col gap-1 text-[12.5px] text-[var(--text-muted)]">
            {verdict.score && (
              <li className="flex items-center gap-2">
                <span className={`h-1.5 w-1.5 rounded-full ${STATE_STYLE[verdict.score.state].dot}`} aria-hidden />
                {verdict.score.value === null
                  ? t('requirements.banner.scoreMin', { min: verdict.score.min })
                  : t('requirements.banner.scoreValue', { value: verdict.score.value, min: verdict.score.min })}
              </li>
            )}
            {verdict.ids && (
              <li className="flex items-center gap-2">
                <span className={`h-1.5 w-1.5 rounded-full ${STATE_STYLE[verdict.ids.state].dot}`} aria-hidden />
                {verdict.ids.state === 'pending'
                  ? t('requirements.banner.idsPending', { name: req.xn ?? 'IDS' })
                  : t('requirements.banner.idsValue', { name: req.xn ?? 'IDS', passed: verdict.ids.passed, total: verdict.ids.total })}
              </li>
            )}
          </ul>
        </div>
        <div className="flex shrink-0 flex-col items-end gap-2">
          {needsRun && (
            <button type="button" onClick={() => useUIStore.getState().setValidationPanelOpen(true)} className="px-2.5 py-1.5 rounded-[8px] text-[12.5px] font-semibold bg-[var(--accent)] text-white hover:brightness-110">
              {t('requirements.banner.runValidation')}
            </button>
          )}
          {!hasModel && (
            <button type="button" onClick={onOpenFile} className="px-2.5 py-1.5 rounded-[8px] text-[12.5px] font-semibold bg-[var(--accent)] text-white hover:brightness-110">
              {t('requirements.banner.openFile')}
            </button>
          )}
          <button
            type="button"
            onClick={() => useRequirementsStore.getState().setDismissed(true)}
            className="text-[12px] text-[var(--text-faint)] hover:text-[var(--text)]"
            aria-label={t('requirements.banner.close')}
          >
            ✕
          </button>
        </div>
      </div>
    </aside>
  )
}
