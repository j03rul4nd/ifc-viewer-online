// ─── TemplateSelector (D-26) ───────────────────────────────────────────────────
// "What is this presentation for?" — three goal-driven cards that configure
// Tour Mode + Client Mode + Capture Toolkit in one click via applyTemplate().
// Rendered inside the TourRecorder panel; a template is a starting point, the
// user keeps full manual control afterwards.

import React, { useCallback, useMemo, useState } from 'react'
import { useTranslation } from 'react-i18next'
import { useValidationStore } from '../stores/validationStore'
import { useSceneStore } from '../stores/sceneStore'
import { toastFromError } from '../stores/toastStore'
import { applyTemplate, PRESENTATION_TEMPLATES, type PresentationTemplateId } from '../lib/templates/presentationTemplates'
import { createLogger } from '../lib/logger'
import type { ValidationIssue } from '../types'
import type { ViewerAPI } from '../lib/viewer'

const log = createLogger('TemplateSelector')

const CARD_ICONS: Record<PresentationTemplateId, React.ReactNode> = {
  social: (
    // Megaphone — public feed content
    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round">
      <path d="M3 11v2a1 1 0 001 1h2l5 4V6L6 10H4a1 1 0 00-1 1z" /><path d="M15 8.5a5 5 0 010 7" /><path d="M18 6a9 9 0 010 12" />
    </svg>
  ),
  'client-walkthrough': (
    // People — live meeting
    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round">
      <circle cx="9" cy="8" r="3.2" /><path d="M3.5 19c.7-3 2.7-4.5 5.5-4.5s4.8 1.5 5.5 4.5" /><circle cx="17" cy="9.5" r="2.4" /><path d="M15.5 14.8c2.4.2 4 1.5 4.7 3.7" />
    </svg>
  ),
  'technical-review': (
    // Checklist — audit/handoff
    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round">
      <path d="M4 5.5l1.5 1.5L8 4.5" /><path d="M11 6h9" /><path d="M4 12l1.5 1.5L8 11" /><path d="M11 12.5h9" /><path d="M4 18.5L5.5 20 8 17.5" /><path d="M11 19h9" />
    </svg>
  ),
}

interface TemplateSelectorProps {
  viewerApiRef: React.MutableRefObject<ViewerAPI | null>
}

export default function TemplateSelector({ viewerApiRef }: TemplateSelectorProps) {
  const { t } = useTranslation('tour')

  const hasModel = useSceneStore((s) => s.models.length > 0)
  const cachedResults = useValidationStore((s) => s.cachedResultsByModel)
  const result = useValidationStore((s) => s.result)
  const issues = useMemo<ValidationIssue[]>(() => {
    const all = Object.values(cachedResults).flatMap((r) => r.issues)
    return all.length > 0 ? all : (result?.issues ?? [])
  }, [cachedResults, result])
  const score = result?.qualityScore ?? null

  const [applying, setApplying] = useState<PresentationTemplateId | null>(null)
  const [includeImprovements, setIncludeImprovements] = useState(false)

  const handleApply = useCallback(async (id: PresentationTemplateId) => {
    const viewer = viewerApiRef.current
    if (!viewer || applying) return
    setApplying(id)
    try {
      await applyTemplate(id, viewer, {
        issues,
        score,
        includeImprovements,
        strings: {
          title: id === 'technical-review' ? t('autoTitle') : t('showcase.title'),
          showcaseCaptions: [
            t('showcase.captions.overview'),
            t('showcase.captions.perspective'),
            t('showcase.captions.front'),
            t('showcase.captions.side'),
            t('showcase.captions.aerial'),
            t('showcase.captions.closing'),
          ],
          improvementsCaption: t('showcase.improvements'),
          scoreHeadline: score !== null ? t('showcase.headline', { score }) : undefined,
        },
      })
    } catch (e) {
      log.error(`template ${id} failed:`, e)
      toastFromError(e, 'error')
    } finally {
      setApplying(null)
    }
  }, [viewerApiRef, applying, issues, score, includeImprovements, t])

  const cards: { id: PresentationTemplateId; name: string; desc: string; disabled: boolean }[] = [
    { id: 'social', name: t('templates.social.name'), desc: t('templates.social.desc'), disabled: !hasModel },
    { id: 'client-walkthrough', name: t('templates.walkthrough.name'), desc: t('templates.walkthrough.desc'), disabled: !hasModel },
    { id: 'technical-review', name: t('templates.technical.name'), desc: t('templates.technical.desc'), disabled: issues.length === 0 },
  ]

  return (
    <div className="px-3 py-2 border-b border-[var(--border)] shrink-0">
      <div className="mb-1.5 text-[9px] font-semibold uppercase tracking-wider text-[var(--text-faint)]">
        {t('templates.title')}
      </div>
      <div className="flex flex-col gap-1">
        {cards.map((card) => (
          <React.Fragment key={card.id}>
            <button
              onClick={() => void handleApply(card.id)}
              disabled={card.disabled || applying !== null}
              title={card.disabled && card.id === 'technical-review' ? t('templates.needsIssues') : undefined}
              className="group flex items-center gap-2.5 w-full px-2.5 py-2 rounded-lg border border-[var(--border)] text-left transition-all duration-150 hover:border-[var(--accent)] hover:bg-[var(--accent)]/5 active:scale-[0.99] disabled:opacity-40 disabled:cursor-not-allowed disabled:hover:border-[var(--border)] disabled:hover:bg-transparent"
            >
              <span className="shrink-0 text-[var(--text-dim)] group-hover:text-[var(--accent)] transition-colors">
                {applying === card.id
                  ? <svg className="animate-spin" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round"><path d="M12 3a9 9 0 1 1-9 9" /></svg>
                  : CARD_ICONS[card.id]}
              </span>
              <span className="min-w-0">
                <span className="block text-[12px] font-medium text-[var(--text)] leading-tight">{card.name}</span>
                <span className="block text-[10px] text-[var(--text-faint)] leading-snug mt-0.5">{card.desc}</span>
              </span>
            </button>
            {/* Opt-in improvements step — showcase templates never lead with issues (D-26) */}
            {card.id === 'client-walkthrough' && PRESENTATION_TEMPLATES[card.id].offersImprovementsStep && (
              <label className={`flex items-center gap-1.5 pl-2.5 pb-1 cursor-pointer ${issues.length === 0 ? 'opacity-40 pointer-events-none' : ''}`}>
                <input
                  type="checkbox"
                  checked={includeImprovements}
                  onChange={(e) => setIncludeImprovements(e.target.checked)}
                  className="accent-[var(--accent)] w-3 h-3"
                />
                <span className="text-[10px] text-[var(--text-faint)]">{t('templates.includeImprovements')}</span>
              </label>
            )}
          </React.Fragment>
        ))}
      </div>
    </div>
  )
}
