// Help / Feedback for revision compare, and the guided tour host.
//   - "?" button, always on the comparator bar: send feedback (the existing
//     feature-request channel, source `revision-compare`, lands in
//     /admin/feedback) or replay the tour. No call booking in this flow.
//   - One-line tour offer when the demo opened without `tour=revision`: tours
//     never start on their own.
//   - The tour itself (GuidedTourView with the compare namespace), measured
//     as rc_tour_started / _step / _completed / _dismissed.
import { useCallback, useEffect, useRef, useState } from 'react'
import { useTranslation } from 'react-i18next'
import { GuidedTourView } from '../workspace/GuidedTour'
import { REVISION_TOUR_STEPS, TOUR_UI_KEYS, type RevisionTourStep } from '../../lib/workspace-tours/revision-tour'
import { trackRcHelpClicked, trackRcTourCompleted, trackRcTourDismissed, trackRcTourStarted, trackRcTourStep } from '../../lib/analytics'
import { openFeatureRequest } from '../../stores/cloudAccountStore'
import { useRevisionStore } from './revisionStore'

/** Start the tour (link, offer or Help). Shows a moved change first so step 3 has its arrow. */
export function startRevisionTour(): void {
  const s = useRevisionStore.getState()
  const moved = s.diff?.changes.find((c) => c.kind === 'moved')
  if (moved) s.select(moved.globalId)
  s.setTour(true)
}

export function HelpButton({ compact }: { compact?: boolean }) {
  const { t } = useTranslation('compare')
  const [open, setOpen] = useState(false)
  const box = useRef<HTMLDivElement>(null)
  useEffect(() => {
    if (!open) return
    const off = (e: PointerEvent) => { if (!box.current?.contains(e.target as Node)) setOpen(false) }
    window.addEventListener('pointerdown', off)
    return () => window.removeEventListener('pointerdown', off)
  }, [open])
  const item = 'w-full text-left h-10 px-3 rounded-lg text-[12.5px] text-[var(--text)] hover:bg-[var(--bg-hover)]'
  return (
    <div className="relative" ref={box}>
      <button
        type="button" data-tour="rc-help" data-testid="rc-help" aria-expanded={open} aria-haspopup="menu"
        onClick={() => setOpen((x) => !x)} title={t('rc.help.button')}
        className="h-8 px-2.5 rounded-md border border-[var(--border)] text-[11.5px] text-[var(--text-dim)] hover:text-[var(--text)] whitespace-nowrap"
      >? {!compact && <span className="hidden sm:inline">{t('rc.help.button')}</span>}</button>
      {open && (
        <div role="menu" className="absolute right-0 top-full mt-1 w-[220px] p-1 rounded-xl border border-[var(--border-strong)] bg-[var(--bg-surface)] shadow-lg z-10">
          <button type="button" role="menuitem" className={item} data-testid="rc-help-feedback"
            onClick={() => { setOpen(false); trackRcHelpClicked({ option: 'feedback' }); openFeatureRequest('revision-compare', { feature: 'versions' }) }}>
            ✉ {t('rc.help.feedback')}
          </button>
          <button type="button" role="menuitem" className={item} data-testid="rc-help-tour"
            onClick={() => { setOpen(false); trackRcHelpClicked({ option: 'tour' }); startRevisionTour() }}>
            ▶ {t('rc.help.tour')}
          </button>
        </div>
      )}
    </div>
  )
}

/** "New here? …" — only for the demo, only until started or dismissed. */
export function TourOffer() {
  const { t } = useTranslation('compare')
  const source = useRevisionStore((s) => s.source)
  const tour = useRevisionStore((s) => s.tour)
  const [gone, setGone] = useState(false)
  useEffect(() => { if (tour) setGone(true) }, [tour])
  if (source !== 'demo' || tour || gone) return null
  return (
    <div className="flex items-center gap-2 px-3 py-1.5 rounded-lg border border-[var(--accent)]/50 bg-[var(--accent)]/10 text-[11.5px] text-[var(--text)]" data-testid="rc-tour-offer">
      <span className="flex-1 min-w-0">{t('rc.tour.offer')}</span>
      <button type="button" onClick={startRevisionTour} className="h-7 px-2.5 rounded-md bg-[var(--accent)] text-[var(--accent-contrast)] text-[11.5px] font-medium whitespace-nowrap">{t('rc.tour.start')}</button>
      <button type="button" onClick={() => setGone(true)} className="h-7 px-2 rounded-md text-[11px] text-[var(--text-faint)] hover:text-[var(--text)] whitespace-nowrap">{t('rc.tour.dismiss')}</button>
    </div>
  )
}

/** Mounted inside the workspace: shows the tour while the store says so. */
export function RevisionTourHost() {
  const { t } = useTranslation('compare')
  const tour = useRevisionStore((s) => s.tour)
  // Let the list, card and table settle before the overlay picks its live steps.
  const [ready, setReady] = useState(false)
  const last = useRef<RevisionTourStep['id']>('local')
  useEffect(() => {
    if (!tour) { setReady(false); return }
    trackRcTourStarted()
    const id = window.setTimeout(() => setReady(true), 500)
    return () => window.clearTimeout(id)
  }, [tour])
  const tx = useCallback((text: string, vars?: Record<string, unknown>) => (t as unknown as (k: string, o?: Record<string, unknown>) => string)(TOUR_UI_KEYS[text] ?? text, vars), [t])
  const onStep = useCallback((_: number, step: unknown) => {
    last.current = (step as RevisionTourStep).id
    trackRcTourStep({ step: last.current })
  }, [])
  const onClose = useCallback((finished: boolean) => {
    if (finished) trackRcTourCompleted(); else trackRcTourDismissed({ step: last.current })
    useRevisionStore.getState().setTour(false)
  }, [])
  if (!tour || !ready) return null
  return <GuidedTourView title="rc.tour.title" steps={REVISION_TOUR_STEPS} onClose={onClose} onStep={onStep} zIndex={70} tx={tx} />
}
