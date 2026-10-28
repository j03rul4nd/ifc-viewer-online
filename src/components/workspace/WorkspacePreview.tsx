// ─── WorkspacePreview ─────────────────────────────────────────────────────────
// /workspace/<section> — design of the paid workspace on sample data, so the
// layout and copy can mature before anything is spent on a backend
// (docs-planning/08, 11). Team-only: the route exists only behind the pricing
// preview gate. English-only until the design settles.
//
// Design rules (docs-planning/10): the work leads and chrome recedes; accent
// colour only for actions and the active item; every screen has its empty,
// loading, dense and error state; the section lives in the URL; motion only
// where it carries information; cost is visible before any action.
//
// Layout by device (CSS only, same markup everywhere):
//   phone  < 768   top bar + bottom tab bar (secondary sections under "More")
//   tablet 768–1023 icon rail
//   desktop ≥ 1024 labelled sidebar
// Sections, their plan and their nav entry come from ./registry.

import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { MoreHorizontal, Lock, LifeBuoy } from 'lucide-react'
import { SCENARIOS, scenarioData, type Scenario, type TicketKind } from './sample-data'
import { SECTIONS, canUse, sectionFromPath, type SectionActions, type SectionId, type SectionDef } from './registry'
import { Banner, Primary, Quiet, Skeleton, fmtInt, NAV_EVENT, notifyNav } from './ui'
import { previewProvider, type CheckoutItem, type CheckoutOutcome } from '../../lib/pricing/checkout'
import CloudJobDialog from './CloudJobDialog'
import CheckoutDialog from './CheckoutDialog'
import LockedSection from './LockedSection'
import ContactDialog from './ContactDialog'
import GuidedTour from './GuidedTour'
import { TOURS, tourForPath, seenTours, markSeen, type Tour } from '../../lib/workspace-tours/tours'
import { useTx, rich } from './i18n'


const BASE = `${import.meta.env.BASE_URL ?? '/'}workspace`
const hrefOf = (id: SectionId) => (id === 'overview' ? BASE : `${BASE}/${id}`)
const TOP_UP: CheckoutItem = { kind: 'pack', pack: 'pack_19' }

function NavLink({ s, active, locked, go, variant }: { s: SectionDef; active: boolean; locked: boolean; go: (id: SectionId) => void; variant: 'side' | 'rail' | 'tab' | 'menu' }) {
  const tx = useTx()
  const Icon = s.icon
  const base = {
    side: 'h-[32px] px-2.5 gap-2.5 rounded-[7px] text-[13px]',
    rail: 'w-10 h-10 justify-center rounded-[9px]',
    tab: 'flex-1 flex-col justify-center gap-0.5 h-full text-[10.5px]',
    menu: 'h-[44px] px-4 gap-3 text-[14px]',
  }[variant]
  const tone = active
    ? (variant === 'tab' ? 'text-[var(--text)] font-medium' : 'bg-[var(--surface-2)] text-[var(--text)] font-medium')
    : 'text-[var(--text-faint)] hover:text-[var(--text)]'
  return (
    <a href={hrefOf(s.id)} title={variant === 'rail' ? tx(s.label) : undefined} aria-label={variant === 'rail' ? tx(s.label) : undefined}
      onClick={(e) => { if (e.metaKey || e.ctrlKey || e.shiftKey || e.button !== 0) return; e.preventDefault(); go(s.id) }}
      aria-current={active ? 'page' : undefined}
      className={`shrink-0 flex items-center no-underline ${base} ${tone}`}>
      <Icon aria-hidden size={variant === 'tab' ? 20 : 16} strokeWidth={active ? 2.1 : 1.7} />
      {variant !== 'rail' && <span className={variant === 'side' || variant === 'menu' ? 'flex-1' : ''}>{variant === 'tab' ? tx(s.short ?? s.label) : tx(s.label)}</span>}
      {locked && variant !== 'tab' && variant !== 'rail' && <Lock aria-label={tx("Needs an upgrade")} size={12} className="text-[var(--text-faint)]" />}
    </a>
  )
}

export default function WorkspacePreview({ onNavigateHome }: { onNavigateHome: () => void }) {
  const tx = useTx()
  const [section, setSection] = useState<SectionId>(() => (typeof location !== 'undefined' ? sectionFromPath(location.pathname) : 'overview'))
  const [scenario, setScenario] = useState<Scenario>('active')
  const [checkoutOutcome, setCheckoutOutcome] = useState<CheckoutOutcome['status']>('paid')
  const [jobOpen, setJobOpen] = useState(false)
  const [moreOpen, setMoreOpen] = useState(false)
  const [checkout, setCheckout] = useState<CheckoutItem | null>(null)
  const [contact, setContact] = useState<{ kind: TicketKind; ref?: string } | null>(null)
  const [tour, setTour] = useState<Tour | null>(null)
  const [seen, setSeen] = useState(() => seenTours())
  // Re-read the URL's second segment on every navigation, for sub-page tours.
  const [path, setPath] = useState(() => (typeof location !== 'undefined' ? location.pathname : ''))
  useEffect(() => {
    const sync = () => setPath(location.pathname)
    addEventListener('popstate', sync)
    addEventListener(NAV_EVENT, sync)
    return () => { removeEventListener('popstate', sync); removeEventListener(NAV_EVENT, sync) }
  }, [])
  const data = useMemo(() => scenarioData(scenario), [scenario])
  const top = useRef<HTMLDivElement>(null)
  const provider = useMemo(() => previewProvider(checkoutOutcome), [checkoutOutcome])

  // The section is part of the URL so refresh, Back/Forward and links work.
  const go = useCallback((s: SectionId) => {
    setSection(s)
    setMoreOpen(false)
    if (typeof history !== 'undefined' && location.pathname !== hrefOf(s)) { history.pushState(null, '', hrefOf(s)); notifyNav() }
    // The app scrolls inside its route container, not the window.
    top.current?.scrollIntoView?.({ block: 'start' })
  }, [])
  useEffect(() => {
    const onPop = () => setSection(sectionFromPath(location.pathname))
    addEventListener('popstate', onPop)
    return () => removeEventListener('popstate', onPop)
  }, [])

  const actions: SectionActions = useMemo(() => ({
    go, newJob: () => setJobOpen(true), topUp: () => setCheckout(TOP_UP), buy: setCheckout,
    contact: (kind, ref) => setContact({ kind, ref }),
    // The project id rides in the URL; Projects reads it when it mounts.
    tour: (id) => {
      const t = TOURS.find((x) => x.id === id)
      if (!t) return
      const [sec, sub] = t.section.split('/')
      if (sub && sub !== 'detail') { history.pushState(null, '', `${hrefOf(sec as SectionId)}/${sub}`); dispatchEvent(new PopStateEvent('popstate')) }
      // Detail tours start from the detail page the user is already on.
      else if (!sub) go(sec as SectionId)
      // Let the page render before the tour looks for its anchors.
      setTimeout(() => setTour(t), 120)
    },
    openProject: (id) => {
      if (typeof history !== 'undefined') { history.pushState(null, '', `${hrefOf('projects')}/${id}`); notifyNav() }
      setSection('projects')
      top.current?.scrollIntoView?.({ block: 'start' })
    },
  }), [go])

  const plan = data.account.plan
  const current = SECTIONS.find((s) => s.id === section)!
  const tabs = SECTIONS.filter((s) => !s.secondary)
  const more = SECTIONS.filter((s) => s.secondary)
  const work = SECTIONS.filter((s) => s.group !== 'account')
  const account = SECTIONS.filter((s) => s.group === 'account')
  const initials = data.account.name.split(' ').map((w) => w[0]).slice(0, 2).join('')
  const moreActive = more.some((s) => s.id === section)

  let body: React.ReactNode
  if (scenario === 'loading') body = <><div className="h-[28px] w-[180px] mb-5 rounded-[6px] bg-[var(--surface-2)]" /><Skeleton rows={4} /></>
  else if (scenario === 'error') body = (
    <Banner tone="danger" title={tx("We couldn't load your workspace")} action={<Primary onClick={() => setScenario('active')}>{tx("Retry")}</Primary>}>
      {rich(tx('Your projects and credits are safe. Check your connection; if it keeps failing, <0>tell us</0> — the report includes what we need.'), [(c) => <button className="text-[var(--accent)] hover:underline" onClick={() => setContact({ kind: 'bug' })}>{c}</button>])}
    </Banner>
  )
  else if (!canUse(plan, current)) body = <LockedSection section={current} current={plan} period={data.account.billing} onUpgrade={setCheckout} />
  else body = <current.Component key={section} data={data} actions={actions} />

  const sub = path.split('/workspace/')[1]?.split('/')[1]
  const pageTour = scenario === 'loading' || scenario === 'error' || !canUse(plan, current) ? undefined
    : tourForPath(section, section === 'projects' && sub ? 'detail' : sub)
  // Offered once per tour, never started on its own.
  const offerTour = pageTour && !seen.has(pageTour.id) && !tour ? pageTour : undefined
  const status = data.account.status
  return (
    <div ref={top} className="min-h-[100dvh] bg-[var(--bg)] text-[var(--text)]">
      <header className="sticky top-0 z-20 flex items-center gap-2 sm:gap-3 px-4 sm:px-6 h-[48px] border-b border-[var(--border)] bg-[var(--bg)] pt-[env(safe-area-inset-top)] box-content">
        <button onClick={onNavigateHome} className="text-[13.5px] font-semibold truncate">{tx("IFC Viewer Online")}</button>
        <span className="hidden sm:inline text-[11px] px-2 py-0.5 rounded-full border border-[var(--border)] text-[var(--text-dim)] whitespace-nowrap">{tx("Design preview · sample data")}</span>
        <span className="flex-1" />
        <details className="relative">
          <summary className="list-none cursor-pointer text-[11.5px] px-2 h-[28px] flex items-center rounded-[6px] border border-[var(--border)] text-[var(--text-faint)] hover:text-[var(--text)]">{tx("Preview")}</summary>
          <div className="absolute right-0 mt-2 w-[240px] rounded-[10px] border border-[var(--border)] bg-[var(--surface)] p-3 shadow-xl z-30 space-y-3">
            <label className="block text-[11.5px] text-[var(--text-faint)]">
              {tx("Account state")}
              <select value={scenario} onChange={(e) => setScenario(e.target.value as Scenario)} className="mt-1 w-full h-[32px] bg-[var(--surface-2)] border border-[var(--border)] rounded-[6px] px-1.5 text-[12.5px] text-[var(--text)]">
                {SCENARIOS.map((s) => <option key={s.id} value={s.id}>{tx(s.label)}</option>)}
              </select>
            </label>
            <label className="block text-[11.5px] text-[var(--text-faint)]">
              {tx("Checkout ends in")}
              <select value={checkoutOutcome} onChange={(e) => setCheckoutOutcome(e.target.value as CheckoutOutcome['status'])} className="mt-1 w-full h-[32px] bg-[var(--surface-2)] border border-[var(--border)] rounded-[6px] px-1.5 text-[12.5px] text-[var(--text)]">
                <option value="paid">{tx("Payment succeeds")}</option>
                <option value="canceled">{tx("Buyer leaves the payment page")}</option>
                <option value="failed">{tx("Card declined")}</option>
              </select>
            </label>
          </div>
        </details>
        <button onClick={() => go('billing')} className="hidden sm:inline text-[12.5px] tabular-nums text-[var(--text-dim)] hover:text-[var(--text)] whitespace-nowrap min-h-[32px]">{tx('{{n}} credits', { n: fmtInt(data.account.credits.balance) })}</button>
        <button onClick={() => go('support')} aria-label={tx("Help & support")} title={tx("Help & support")} className="w-8 h-8 grid place-items-center rounded-[7px] text-[var(--text-dim)] hover:text-[var(--text)] hover:bg-[var(--surface-2)]"><LifeBuoy size={16} aria-hidden /></button>
        <details className="relative" data-account-menu>
          <summary aria-label={tx("Account")} className="list-none cursor-pointer w-8 h-8 grid place-items-center rounded-full bg-[var(--surface-2)] border border-[var(--border)] text-[11.5px] font-semibold">{initials}</summary>
          <div className="absolute right-0 mt-2 w-[260px] rounded-[10px] border border-[var(--border)] bg-[var(--surface)] shadow-xl z-30 py-1.5">
            <div className="px-4 py-2 border-b border-[var(--border)] mb-1">
              <p className="text-[13px] font-medium truncate" title={data.account.name}>{data.account.name}</p>
              <p className="text-[11.5px] text-[var(--text-faint)] truncate" title={data.account.email}>{data.account.email}</p>
              <p className="mt-1 text-[11.5px] text-[var(--text-dim)]">{data.account.plan === 'team' ? tx("Team") : tx("Pro")} · {tx('{{n}} credits', { n: fmtInt(data.account.credits.balance) })}</p>
            </div>
            {[...account, SECTIONS.find((s) => s.id === 'billing')!].map((s) => (
              <button key={s.id} onClick={(e) => { (e.currentTarget.closest('details') as HTMLDetailsElement).open = false; go(s.id) }}
                className="w-full text-left px-4 h-[36px] text-[13px] hover:bg-[var(--surface-2)] flex items-center gap-2.5"><s.icon size={15} aria-hidden className="text-[var(--text-dim)]" />{tx(s.label)}</button>
            ))}
            <button onClick={(e) => { (e.currentTarget.closest('details') as HTMLDetailsElement).open = false; setContact({ kind: 'bug' }) }}
              className="w-full text-left px-4 h-[36px] text-[13px] hover:bg-[var(--surface-2)]">{tx("Report a problem")}</button>
            {pageTour && (
              <button onClick={(e) => { (e.currentTarget.closest('details') as HTMLDetailsElement).open = false; setTour(pageTour) }}
                className="w-full text-left px-4 h-[36px] text-[13px] hover:bg-[var(--surface-2)]">{tx("Tour this page")}</button>
            )}
            <div className="border-t border-[var(--border)] mt-1 pt-1">
              <button className="w-full text-left px-4 h-[36px] text-[13px] text-[var(--text-dim)] hover:bg-[var(--surface-2)]">{tx("Sign out")}</button>
            </div>
          </div>
        </details>
      </header>

      <div className="flex max-w-[1240px] mx-auto">
        <nav aria-label={tx("Workspace")} className="hidden md:flex md:flex-col md:shrink-0 md:sticky md:top-[48px] md:self-start md:h-[calc(100dvh-48px)] md:py-5 md:px-2 lg:px-3 md:gap-0.5 md:items-center lg:items-stretch lg:w-[200px]">
          {[work, account].map((group, gi) => (
            <div key={gi} className={`flex flex-col gap-0.5 md:items-center lg:items-stretch ${gi ? 'mt-auto pt-3 border-t border-[var(--border)] w-full' : ''}`}>
              {group.map((s) => (
                <span key={s.id} className="contents">
                  <span className="lg:hidden"><NavLink s={s} active={section === s.id} locked={!canUse(plan, s)} go={go} variant="rail" /></span>
                  <span className="hidden lg:contents"><NavLink s={s} active={section === s.id} locked={!canUse(plan, s)} go={go} variant="side" /></span>
                </span>
              ))}
            </div>
          ))}
        </nav>
        <main className="flex-1 min-w-0 px-4 sm:px-6 py-5 pb-[calc(76px+env(safe-area-inset-bottom))] md:pb-8">
          {status === 'past_due' && scenario !== 'loading' && scenario !== 'error' && (
            <Banner tone="danger" title={tx("Your last payment didn't go through")}
              action={<Primary onClick={() => go('billing')}>{tx("Update card")}</Primary>}>
              {tx("We'll retry over the next 14 days and your plan keeps working meanwhile. Card ending {{last4}}.", { last4: data.account.card.last4 })}
            </Banner>
          )}
          {status === 'canceled' && scenario !== 'loading' && scenario !== 'error' && (
            <Banner tone="warn" title={tx('Your plan ends on {{date}}', { date: data.account.renewsOn })}
              action={<Quiet onClick={() => go('billing')}>{tx("Resume plan")}</Quiet>}>
              {tx("Projects become read-only after that; certificates stay verifiable.")}
            </Banner>
          )}
          {offerTour && (
            <div className="mb-5 flex flex-col sm:flex-row sm:items-center gap-2 sm:gap-3 rounded-[10px] border border-[var(--border)] px-4 py-2.5" data-tour-offer>
              <p className="flex-1 min-w-0 text-[12.5px] text-[var(--text-dim)]"><span className="text-[var(--text)] font-medium">{tx("New here?")}</span> {tx('A 1-minute tour: {{title}}. {{summary}}', { title: tx(offerTour.title), summary: tx(offerTour.summary) })}</p>
              <div className="flex gap-2 shrink-0">
                <Quiet onClick={() => { markSeen(offerTour.id); setSeen(seenTours()) }}>{tx("Not now")}</Quiet>
                <Primary onClick={() => setTour(offerTour)}>{tx("Show me")}</Primary>
              </div>
            </div>
          )}
          {body}
        </main>
      </div>

      {/* Phone tab bar: thumb reach, safe-area aware. */}
      <nav aria-label={tx("Workspace")} className="md:hidden fixed bottom-0 inset-x-0 z-20 border-t border-[var(--border)] bg-[var(--bg)] pb-[env(safe-area-inset-bottom)]">
        <div className="flex h-[60px]">
          {tabs.map((s) => <NavLink key={s.id} s={s} active={section === s.id} locked={!canUse(plan, s)} go={go} variant="tab" />)}
          <button onClick={() => setMoreOpen((o) => !o)} aria-expanded={moreOpen} aria-haspopup="menu"
            className={`flex-1 flex flex-col items-center justify-center gap-0.5 text-[10.5px] ${moreActive || moreOpen ? 'text-[var(--text)] font-medium' : 'text-[var(--text-faint)]'}`}>
            <MoreHorizontal aria-hidden size={20} />{tx("More")}
          </button>
        </div>
      </nav>
      {moreOpen && (
        <div className="md:hidden fixed inset-0 z-10 bg-black/40" onClick={() => setMoreOpen(false)}>
          <div role="menu" onClick={(e) => e.stopPropagation()}
            className="absolute inset-x-0 bottom-[calc(60px+env(safe-area-inset-bottom))] rounded-t-[14px] border-t border-[var(--border)] bg-[var(--surface)] py-2">
            {more.map((s, i) => (
              <div key={s.id} className={i > 0 && s.group === 'account' && more[i - 1].group !== 'account' ? 'border-t border-[var(--border)] mt-1 pt-1' : ''}>
                <NavLink s={s} active={section === s.id} locked={!canUse(plan, s)} go={go} variant="menu" />
              </div>
            ))}
            <div className="border-t border-[var(--border)] mt-1 pt-1">
              <button onClick={() => { setMoreOpen(false); setContact({ kind: 'bug' }) }} className="w-full text-left h-[44px] px-4 text-[14px] text-[var(--text-faint)]">{tx("Report a problem")}</button>
            </div>
          </div>
        </div>
      )}

      {jobOpen && <CloudJobDialog balance={data.account.credits.balance} onClose={() => setJobOpen(false)} onTopUp={() => { setJobOpen(false); setCheckout(TOP_UP) }} />}
      {tour && <GuidedTour key={tour.id} title={tour.title} steps={tour.steps} onClose={() => { markSeen(tour.id); setSeen(seenTours()); setTour(null) }} />}
      {contact && <ContactDialog kind={contact.kind} refId={contact.ref} section={section} onClose={() => setContact(null)} />}
      {checkout && <CheckoutDialog item={checkout} provider={provider} onClose={() => setCheckout(null)} />}
    </div>
  )
}
