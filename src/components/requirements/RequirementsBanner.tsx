// ─── RequirementsBanner ───────────────────────────────────────────────────────
// What a supplier sees after opening a receiver's requirements link: who asks
// for what, and — once the model is in and checked — Meets / Does not meet.
// The checks themselves are the app's own (validator + IDS); this only reads
// their results and compares them with the link (lib/requirements).

import React, { useEffect, useMemo, useRef, useState } from 'react'
import { useTranslation } from 'react-i18next'
import { useRequirementsStore } from '../../stores/requirementsStore'
import { useValidationStore } from '../../stores/validationStore'
import { useIdsStore } from '../../stores/idsStore'
import { useSceneStore } from '../../stores/sceneStore'
import { useUIStore } from '../../stores/uiStore'
import { calculateQualityScore } from '../../lib/validator'
import { evaluateRequirements, type CheckState } from '../../lib/requirements/requirements-link'
import { checkNaming, type NamingIssue, type ProjectTexts } from '../../lib/requirements/iso-naming'
import { trackRequirementsVerdict } from '../../lib/analytics'

const STATE_STYLE: Record<CheckState, { dot: string; text: string }> = {
  pending: { dot: 'bg-[var(--text-faint)]', text: 'text-[var(--text-muted)]' },
  pass: { dot: 'bg-emerald-500', text: 'text-emerald-400' },
  fail: { dot: 'bg-red-500', text: 'text-red-400' },
}

/** One line per naming problem, in the supplier's language. */
function issueText(t: (k: string, o?: Record<string, unknown>) => string, i: NamingIssue): string {
  switch (i.code) {
    case 'value': return t('requirements.naming.issue.value', { field: i.field, value: i.value, allowed: i.allowed.slice(0, 8).join(', ') + (i.allowed.length > 8 ? '…' : '') })
    case 'length': return t('requirements.naming.issue.length', { field: i.field, value: i.value, min: i.min ?? 1, max: i.max ?? i.min ?? 1 })
    case 'status': return t('requirements.naming.issue.status', { value: i.value, allowed: i.allowed.join(', ') })
    case 'projectStatus': return t('requirements.naming.issue.projectStatus', { file: i.file ?? '—', project: i.project ?? '—' })
    case 'projectRevision': return t('requirements.naming.issue.projectRevision', { file: i.file ?? '—', project: i.project ?? '—' })
    default: return t(`requirements.naming.issue.${i.code}`, i as unknown as Record<string, unknown>)
  }
}

interface BannerProps {
  onOpenFile: () => void
  /** IfcProject text attributes of a loaded model (N1); undefined = unreadable. */
  getProjectTexts?: (modelId: string) => Promise<ProjectTexts | null | undefined>
}

export default function RequirementsBanner({ onOpenFile, getProjectTexts }: BannerProps) {
  const { t } = useTranslation('ids')
  const req = useRequirementsStore((s) => s.active)
  const version = useRequirementsStore((s) => s.version)
  const dismissed = useRequirementsStore((s) => s.dismissed)
  const result = useValidationStore((s) => s.result)
  const isRunning = useValidationStore((s) => s.isRunning)
  const hasModel = useSceneStore((s) => s.models.length > 0)
  const targetId = useSceneStore((s) => s.activeModelId ?? s.models[0]?.id ?? null)
  const idsResult = useIdsStore((s) => (targetId ? s.resultsByModel[targetId] ?? null : null))
  const fileName = useSceneStore((s) => s.models.find((m) => m.id === targetId)?.fileName ?? null)

  // N1: IfcProject is read once per model, only when the rule asks for it.
  const wantsProject = !!req?.n?.pj
  const [project, setProject] = useState<{ id: string; texts: ProjectTexts | null } | null>(null)
  useEffect(() => {
    if (!wantsProject || !targetId || !getProjectTexts) return
    let cancelled = false
    void getProjectTexts(targetId).then((texts) => {
      // undefined (could not read) counts as "no IfcProject text": the
      // supplier sees why and can fix the model.
      if (!cancelled) setProject({ id: targetId, texts: texts ?? null })
    })
    return () => { cancelled = true }
  }, [wantsProject, targetId, getProjectTexts ? 1 : 0]) // eslint-disable-line react-hooks/exhaustive-deps

  const naming = useMemo(() => {
    if (!req?.n || !fileName) return null
    if (req.n.pj && getProjectTexts) {
      if (project?.id !== targetId) return null // still reading IfcProject
      return checkNaming(req.n, fileName, project.texts)
    }
    return checkNaming(req.n, fileName)
  }, [req, fileName, project, targetId, getProjectTexts])

  const verdict = useMemo(() => {
    if (!req) return null
    const score = result && !isRunning ? calculateQualityScore(result) : null
    return evaluateRequirements(req, { score, ids: idsResult, naming })
  }, [req, result, isRunning, idsResult, naming])

  // One verdict event per model checked against the link.
  const reported = useRef<string | null>(null)
  useEffect(() => {
    if (!verdict || verdict.state === 'pending' || !targetId || reported.current === targetId) return
    reported.current = targetId
    const value = verdict.score?.value
    trackRequirementsVerdict({
      pass: verdict.state === 'pass',
      score_bucket: typeof value === 'number' ? `${Math.floor(value / 10) * 10}` : null,
      ...(verdict.naming ? { naming_pass: verdict.naming.state === 'pass' } : {}),
      ...(version ? { managed_version: version.checked, version_moved: version.checked !== version.linked } : {}),
    })
  }, [verdict, targetId, version])

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
            {verdict.naming && (
              <li className="flex flex-col gap-0.5">
                <span className="flex items-center gap-2">
                  <span className={`h-1.5 w-1.5 rounded-full ${STATE_STYLE[verdict.naming.state].dot}`} aria-hidden />
                  {verdict.naming.state === 'pending'
                    ? t('requirements.naming.pending')
                    : verdict.naming.state === 'pass'
                      ? t('requirements.naming.pass', { status: verdict.naming.result?.status ?? '', revision: verdict.naming.result?.revision ?? '' })
                      : t('requirements.naming.fail', { count: verdict.naming.result?.issues.length ?? 0 })}
                </span>
                {verdict.naming.state === 'fail' && verdict.naming.result && (
                  <ul className="m-0 pl-3.5 list-none flex flex-col gap-0.5 text-[11.5px] text-[var(--text-faint)]">
                    <li className="truncate font-mono">{verdict.naming.result.stem}</li>
                    {verdict.naming.result.issues.slice(0, 4).map((i, k) => <li key={k}>· {issueText(t, i)}</li>)}
                    {verdict.naming.result.issues.length > 4 && <li>{t('requirements.naming.more', { count: verdict.naming.result.issues.length - 4 })}</li>}
                  </ul>
                )}
              </li>
            )}
          </ul>
          {version && (
            <p className="m-0 mt-2 text-[11.5px] text-[var(--text-faint)]">
              {version.checked === version.linked
                ? t('requirements.version.checked', { name: version.name ?? req.t, version: version.checked })
                : t('requirements.version.moved', { name: version.name ?? req.t, version: version.checked, linked: version.linked })}
              {version.note ? <> · <span className="italic">{version.note}</span></> : null}
            </p>
          )}
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
