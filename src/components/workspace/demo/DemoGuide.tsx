// ─── Demo guide card ──────────────────────────────────────────────────────────
// Floats over the workspace while `?demo=reception-flow` is on: step N of 8,
// a short guide, what to point at, and back/next. Bottom sheet on phones.
// It only moves between screens; it never changes what a screen does.

import { useCallback, useEffect, useState } from 'react'
import { ArrowLeft, ArrowRight, X } from 'lucide-react'
import { useTranslation } from 'react-i18next'
import { trendSvg } from '../../../lib/clash/trend'
import { CLASH_TREND } from '../sections/mail/sample'
import { notifyNav } from '../ui'
import { STEPS, clampStep, endDemo, estimate, readDemo, saveStep } from './flow'
import { DEMO_LOCALES } from './locales'

export type Dx = (text: string, vars?: Record<string, unknown>) => string

export function dxFor(lang: string): Dx {
  const dict = DEMO_LOCALES[lang.split('-')[0]]
  return (text, vars) => { const s = dict?.[text] ?? text; return vars ? s.replace(/\{\{(\w+)\}\}/g, (_, k) => String(vars[k] ?? '')) : s }
}

const store = () => (typeof sessionStorage !== 'undefined' ? sessionStorage : null)
const BASE = () => (import.meta.env.BASE_URL ?? '/').replace(/\/$/, '')

/** Opens the screen of a step through the same history the workspace listens to. */
function open(n: number) {
  const s = STEPS[n]
  const url = `${BASE()}/workspace/${s.path}`
  if (location.pathname !== url) { history.pushState(null, '', url); dispatchEvent(new PopStateEvent('popstate')); notifyNav() }
  saveStep(n, store())
  scrollTo?.({ top: 0 })
}

export function useDemoStep(): [number | null, (n: number | null) => void] {
  const [step, setStep] = useState<number | null>(() => (typeof location !== 'undefined' ? readDemo(location.search, store()) : null))
  const go = useCallback((n: number | null) => {
    if (n === null) { endDemo(store()); setStep(null); return }
    const k = clampStep(n)
    setStep(k)
    open(k)
  }, [])
  // First load: land on the step's screen. Child effects run before the
  // workspace's own listeners are attached, so wait one tick.
  useEffect(() => {
    if (step === null) return
    const t = setTimeout(() => open(step), 0)
    return () => clearTimeout(t)
  }, []) // eslint-disable-line react-hooks/exhaustive-deps
  return [step, go]
}

export default function DemoGuide() {
  const { i18n } = useTranslation()
  const dx = dxFor(i18n?.language || 'en')
  const [step, go] = useDemoStep()
  const [small, setSmall] = useState(false)
  useEffect(() => {
    if (step === null) return
    const onKey = (e: KeyboardEvent) => {
      if ((e.target as HTMLElement)?.closest?.('input, textarea, select, [contenteditable]')) return
      if (e.key === 'ArrowRight' && e.altKey) go(step + 1)
      if (e.key === 'ArrowLeft' && e.altKey) go(step - 1)
    }
    addEventListener('keydown', onKey)
    return () => removeEventListener('keydown', onKey)
  }, [step, go])
  if (step === null) return null
  const s = STEPS[step]
  const last = step === STEPS.length - 1
  const est = estimate()
  return (
    <aside aria-label={dx('Demo')} data-demo-step={s.id}
      className="fixed z-[60] inset-x-2 bottom-[calc(64px+env(safe-area-inset-bottom))] sm:inset-x-auto sm:right-5 sm:bottom-5 sm:w-[380px] rounded-[12px] border border-[var(--accent)] bg-[var(--surface)] shadow-2xl">
      <div className="flex items-center gap-2 px-4 pt-3">
        <span className="text-[11px] uppercase tracking-wide text-[var(--accent)] font-semibold">{dx('Demo · step {{n}} of {{t}}', { n: step + 1, t: STEPS.length })}</span>
        <span className="flex-1" />
        <button className="text-[12px] text-[var(--text-faint)] sm:hidden" onClick={() => setSmall(!small)}>{small ? dx('Show') : dx('Hide')}</button>
        <button aria-label={dx('Leave the demo')} className="p-1 text-[var(--text-faint)] hover:text-[var(--text)]" onClick={() => go(null)}><X size={15} /></button>
      </div>
      <div className="px-4 pb-1 pt-1 flex gap-1" aria-hidden>
        {STEPS.map((x, i) => <span key={x.id} className={`h-[3px] flex-1 rounded-full ${i <= step ? 'bg-[var(--accent)]' : 'bg-[var(--surface-2)]'}`} />)}
      </div>
      {!small && <div className="px-4 pt-2">
        <h2 className="text-[15px] font-semibold">{dx(s.title)}</h2>
        <p className="mt-1 text-[13px] text-[var(--text-dim)]">{dx(s.guide)}</p>
        <p className="mt-2 text-[12.5px]"><span className="text-[var(--text-faint)]">{dx('Look at')}:</span> {dx(s.look)}</p>
        {s.clashes && (() => {
          const now = CLASH_TREND[CLASH_TREND.length - 1], prev = CLASH_TREND[CLASH_TREND.length - 2]
          return (
            <div className="mt-3 rounded-[8px] border border-[var(--border)] p-2.5">
              <p className="text-[13px] font-medium">{dx('{{n}} clashes resolved this week, {{o}} still open', { n: now.resolved - prev.resolved, o: now.open })}</p>
              <div className="mt-1 overflow-hidden [&_svg]:max-w-full [&_svg]:h-auto" dangerouslySetInnerHTML={{ __html: trendSvg(CLASH_TREND, 340, 70, { open: dx('Open'), resolved: dx('Resolved') }) }} />
            </div>
          )
        })()}
        {last && <p className="mt-3 text-[13px]">{dx('About {{h}} hours and {{eur}} € a month for one coordinator (estimate).', { h: est.hours, eur: est.eur })}</p>}
      </div>}
      <div className="flex items-center gap-2 px-4 py-3">
        <button disabled={step === 0} onClick={() => go(step - 1)} className="inline-flex items-center gap-1 h-[32px] px-3 rounded-[8px] border border-[var(--border)] text-[12.5px] disabled:opacity-40"><ArrowLeft size={13} aria-hidden />{dx('Back')}</button>
        <span className="flex-1 text-[11px] text-[var(--text-faint)] hidden sm:block">{dx('Alt + arrows')}</span>
        {last
          ? <button onClick={() => go(0)} className="inline-flex items-center gap-1 h-[32px] px-3 rounded-[8px] bg-[var(--accent)] text-white text-[12.5px] font-medium">{dx('Start again')}</button>
          : <button onClick={() => go(step + 1)} className="inline-flex items-center gap-1 h-[32px] px-3 rounded-[8px] bg-[var(--accent)] text-white text-[12.5px] font-medium">{dx('Next')}<ArrowRight size={13} aria-hidden /></button>}
      </div>
    </aside>
  )
}

export const UI_TEXTS = ['Demo', 'Demo · step {{n}} of {{t}}', 'Show', 'Hide', 'Leave the demo', 'Look at', '{{n}} clashes resolved this week, {{o}} still open', 'Open', 'Resolved',
  'About {{h}} hours and {{eur}} € a month for one coordinator (estimate).', 'Back', 'Alt + arrows', 'Start again', 'Next']
