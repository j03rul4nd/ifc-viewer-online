// ─── MspGlobalView ────────────────────────────────────────────────────────────
// /msp-global — the page behind the QR at MSP GLOBAL 2026 (PortAventura, 21 Oct).
//
// Built for someone standing at a fair with a phone: the first screen says who
// and what, one button opens the real viewer, and a short form starts a
// conversation. English only — an international audience reads it.
//
// The demo is the product itself, framed like any embed (`?embed=1`), with a
// public sample model served from this site. The checklist beside it is driven
// by the embed's own postMessage events, so every tick is something that really
// happened in the frame — which is also the integration story we tell.
//
// Contacts go to the Worker (POST /api/lead → KV). The page only says "sent"
// after a 200; any other answer is shown as an error.

import { useCallback, useEffect, useMemo, useRef, useState, type FormEvent, type ReactNode } from 'react'
import { PilotIdeas, INTENTS, type Intent } from './msp/EventPanels'
import { FeatureSheet, FEATURES, type FeatureId } from './msp/FeatureSheet'
import {
  trackEventPageViewed, trackEventDemoOpened, trackEventDemoInteraction, trackEventContactSent,
  type EventEntry,
} from '../lib/analytics'

const EVENT_ID = 'msp-global-2026'
// The live Barcelona twin: 8 IFC models on the real city, with bikes, EV
// chargers, traffic and air quality read live. `ui=article` gives the tap-to-read
// data card and the guided tour.
const DEMO_SCENE = '/scenes/barcelona-placa-catalunya.scene.json'
const POSTER = '/msp-global/data-card.jpg'
const LOAD_TIMEOUT_MS = 90_000

const LINKS = {
  portfolio: 'https://joelbenitez.dev',
  linkedin:  'https://www.linkedin.com/in/joel-benitez-iiot-industry/',
  github:    'https://github.com/j03rul4nd/ifc-viewer-online',
  product:   'https://www.ifcvieweronline.eu/',
  sdk:       '/sdk/',
  privacy:   '/privacy',
}

function readEntry(): EventEntry {
  try {
    const p = new URLSearchParams(window.location.search)
    const v = (p.get('src') ?? p.get('utm_source') ?? '').toLowerCase()
    if (v === 'qr') return 'qr'
    if (v === 'profile') return 'profile'
    if (v === 'share') return 'share'
  } catch { /* ignore */ }
  return 'direct'
}

function hasWebGL(): boolean {
  try {
    const c = document.createElement('canvas')
    return !!(c.getContext('webgl2') || c.getContext('webgl'))
  } catch {
    return false
  }
}

// ── Demo ──────────────────────────────────────────────────────────────────────

type DemoState = 'idle' | 'loading' | 'ready' | 'failed'

interface DemoFacts {
  live?: string
  elements?: number
  picked?: { type: string; name: string; id: string }
  score?: number | null
  errors?: number
  warnings?: number
}

function Step({ n, done, title, children }: { n: number; done: boolean; title: string; children?: ReactNode }) {
  return (
    <li className="flex gap-3">
      <span
        aria-hidden="true"
        className={`mt-0.5 flex h-6 w-6 flex-none items-center justify-center rounded-full text-[12px] font-semibold ${
          done ? 'bg-[var(--ok)] text-black' : 'border border-[var(--border-strong)] text-[var(--text-dim)]'
        }`}
      >
        {done ? '✓' : n}
      </span>
      <div className="min-w-0">
        <p className="text-[15px] font-medium text-[var(--text)] md:text-[18px]">
          {title}
          <span className="sr-only">{done ? ' (done)' : ''}</span>
        </p>
        {children && <div className="mt-0.5 text-[14px] leading-snug text-[var(--text-dim)] md:text-[16px]">{children}</div>}
      </div>
    </li>
  )
}

function Demo({ entry, profile, onTalk, suspended }: { entry: EventEntry; profile: Profile | null; onTalk: () => void; suspended: boolean }) {
  const [state, setState] = useState<DemoState>('idle')
  const [facts, setFacts] = useState<DemoFacts>({})
  const [run, setRun] = useState(0)
  const interacted = useRef(false)
  const frameRef = useRef<HTMLIFrameElement>(null)

  const src = useMemo(() => {
    if (typeof window === 'undefined') return ''
    const q = new URLSearchParams({ scene: DEMO_SCENE, ui: 'article', lang: 'en' })
    return `/?${q.toString()}`
  }, [])

  // Only one live 3D frame on the page: when a feature opens full screen this
  // one stops (its frame unmounts). Two twins at once ran out of memory on
  // tablets, and Safari reloaded the tab mid-load, again and again.
  useEffect(() => {
    if (!suspended) return
    setState((st) => (st === 'loading' || st === 'ready' ? 'idle' : st))
    setFacts({})
    interacted.current = false
  }, [suspended])

  const open = useCallback(() => {
    if (!hasWebGL()) { setState('failed'); return }
    setFacts({})
    setState('loading')
    setRun((r) => r + 1)
    trackEventDemoOpened({ event: EVENT_ID, entry, profile: profile ?? 'none', feature: 'demo' })
  }, [entry, profile])

  // Events from the framed viewer. Same origin only.
  useEffect(() => {
    if (state === 'idle' || state === 'failed') return
    const onMsg = (e: MessageEvent) => {
      if (e.origin !== window.location.origin || e.source !== frameRef.current?.contentWindow) return
      const d = e.data as { source?: string; type?: string; [k: string]: unknown } | null
      if (!d || d.source !== 'ifc-validator') return
      if (d.type === 'model-loaded') {
        setState('ready')
      } else if (d.type === 'layer-feature-picked') {
        setFacts((f) => ({ ...f, live: typeof d.layer === 'string' ? d.layer : 'live data' }))
        if (!interacted.current) {
          interacted.current = true
          trackEventDemoInteraction({ event: EVENT_ID, entry })
        }
      } else if (d.type === 'model-error') {
        setState('failed')
      } else if (d.type === 'validation-completed') {
        setFacts((f) => ({
          ...f,
          score: typeof d.qualityScore === 'number' ? Math.round(d.qualityScore) : null,
          errors: typeof d.errors === 'number' ? d.errors : undefined,
          warnings: typeof d.warnings === 'number' ? d.warnings : undefined,
        }))
      } else if (d.type === 'element-selected' && typeof d.ifcType === 'string') {
        setFacts((f) => ({ ...f, picked: { type: d.ifcType as string, name: typeof d.name === 'string' ? d.name : '', id: typeof d.globalId === 'string' ? d.globalId : '' } }))
        if (!interacted.current) {
          interacted.current = true
          trackEventDemoInteraction({ event: EVENT_ID, entry })
        }
      }
    }
    window.addEventListener('message', onMsg)
    return () => window.removeEventListener('message', onMsg)
  }, [state, entry])

  // A frame that never reports back (blocked, offline, slow network) falls back.
  useEffect(() => {
    if (state !== 'loading') return
    const t = window.setTimeout(() => setState((s) => (s === 'loading' ? 'failed' : s)), LOAD_TIMEOUT_MS)
    return () => window.clearTimeout(t)
  }, [state, run])

  const loaded = state === 'ready'

  return (
    <div className="grid grid-cols-[minmax(0,1fr)] gap-5 lg:grid-cols-[minmax(0,1fr)_320px]">
      <div className="relative overflow-hidden rounded-xl border border-[var(--border)] bg-black" style={{ height: 'min(68svh, 620px)', minHeight: 360 }}>
        {state === 'idle' && (
          <button
            type="button"
            onClick={open}
            className="group absolute inset-0 flex items-end justify-center"
            aria-label="Open the live demo"
          >
            <img src={POSTER} alt="Barcelona's Plaça de Catalunya in 3D, with live bike, charger and traffic markers" className="absolute inset-0 h-full w-full object-cover opacity-70" />
            <span className="relative mb-6 rounded-lg bg-[var(--accent)] px-5 py-3 text-[15px] font-semibold text-white shadow-lg group-hover:brightness-110">
              Open the live demo
            </span>
          </button>
        )}
        {(state === 'loading' || state === 'ready') && (
          <>
            <iframe
              key={run}
              ref={frameRef}
              src={src}
              title="IFC Viewer Online — live demo"
              className="absolute inset-0 h-full w-full border-0"
              allow="fullscreen"
            />
            {state === 'loading' && (
              <div className="pointer-events-none absolute left-3 top-3 rounded-md bg-black/70 px-3 py-1.5 text-[13px] text-white" role="status">
                Opening Barcelona, live…
              </div>
            )}
          </>
        )}
        {state === 'failed' && (
          <div className="absolute inset-0">
            <img src={POSTER} alt="Screenshot of the live Barcelona twin" className="absolute inset-0 h-full w-full object-cover opacity-40" />
            <div className="relative flex h-full flex-col items-center justify-center gap-3 p-6 text-center" role="alert">
              <p className="max-w-sm text-[15px] text-white">
                The live demo couldn't start on this device or connection. The screenshot behind this message is the real viewer.
              </p>
              <button type="button" onClick={open} className="rounded-lg border border-white/40 px-4 py-2 text-[14px] font-medium text-white hover:bg-white/10">
                Try again
              </button>
            </div>
          </div>
        )}
      </div>

      <aside aria-label="What to try" className="flex min-w-0 flex-col gap-4">
        <ol className="flex flex-col gap-4 md:grid md:grid-cols-3 md:gap-6 lg:flex lg:flex-col lg:gap-5">
          <Step n={1} done={loaded} title="Open Barcelona, live">
            {loaded ? <>Real city. Live bikes, chargers, traffic.</> : <>Live city data, loading.</>}
          </Step>
          
          <Step n={2} done={!!facts.live} title="Tap a bike or charger icon">
            {facts.live ? <>{facts.live}: live from the city.</> : <>Real-time city data.</>}
          </Step>
          <Step n={3} done={!!facts.picked} title="Tap a building">
            {facts.picked
              ? <>{facts.picked.name ? <>“{facts.picked.name}”. </> : null}Its data opens in a card.</>
              : <>Every part knows what it is.</>}
          </Step>
        </ol>

        <div className="rounded-lg border border-[var(--border)] bg-[var(--surface)] p-4 text-[14px] leading-relaxed text-[var(--text-dim)] md:text-[16px]">
          <p>
            <strong className="text-[var(--text)]">Swap the city data for yours:</strong> sensors, tickets, assets.
          </p>
        </div>

        <div className="flex flex-wrap gap-2">
          {state !== 'idle' && (
            <button type="button" onClick={open} className="rounded-lg border border-[var(--border-strong)] px-3.5 py-2 text-[14px] text-[var(--text)] hover:bg-[var(--surface)]">
              Restart demo
            </button>
          )}
          <button type="button" onClick={onTalk} className="rounded-lg px-3.5 py-2 text-[14px] font-medium text-[var(--accent-2)] hover:underline">
            Talk to Joel →
          </button>
        </div>
      </aside>
    </div>
  )
}

// ── Contact ───────────────────────────────────────────────────────────────────

type SendState = { kind: 'idle' } | { kind: 'sending' } | { kind: 'sent' } | { kind: 'error'; msg: string }

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/

function Contact({ entry, profile, feature }: { entry: EventEntry; profile: Profile | null; feature: FeatureId | null }) {
  const startedAt = useRef(Date.now())
  const [send, setSend] = useState<SendState>({ kind: 'idle' })
  const [fieldError, setFieldError] = useState<string | null>(null)
  const [intent, setIntent] = useState<Intent | null>(null)

  const onSubmit = async (e: FormEvent<HTMLFormElement>) => {
    e.preventDefault()
    if (send.kind === 'sending') return
    const fd = new FormData(e.currentTarget)
    const val = (k: string) => String(fd.get(k) ?? '').trim()
    const name = val('name'), email = val('email'), company = val('company'), message = val('message')
    if (name.length < 2) return setFieldError('Please add your name.')
    if (!EMAIL_RE.test(email)) return setFieldError('That email address does not look right.')
    if (message.length < 3) return setFieldError('Tell me briefly what you want to solve.')
    setFieldError(null)
    setSend({ kind: 'sending' })
    try {
      const res = await fetch('/api/lead', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          name, email, company, message,
          website: val('website'),
          elapsed_ms: Date.now() - startedAt.current,
          event: EVENT_ID, entry, profile: profile ?? '', intent: intent ?? '', feature: feature ?? '',
        }),
      })
      const data = (await res.json().catch(() => null)) as { ok?: boolean; error?: string } | null
      if (res.ok && data?.ok) {
        setSend({ kind: 'sent' })
        trackEventContactSent({ event: EVENT_ID, entry, profile: profile ?? 'none', feature: feature ?? 'none' })
      } else {
        setSend({ kind: 'error', msg: data?.error ?? 'Something went wrong on my side. Please try again, or find me on LinkedIn.' })
      }
    } catch {
      setSend({ kind: 'error', msg: 'No connection. Your message was not sent. Try again in a moment.' })
    }
  }

  if (send.kind === 'sent') {
    return (
      <div className="rounded-xl border border-[var(--border)] bg-[var(--surface)] p-6" role="status">
        <p className="text-[18px] font-semibold text-[var(--text)]">Thanks. I'll write to you this week.</p>
      </div>
    )
  }

  const input = 'mt-1.5 w-full rounded-lg border border-[var(--border-strong)] bg-[var(--bg)] px-3 py-2.5 text-[16px] text-[var(--text)] placeholder:text-[var(--text-faint)] focus:border-[var(--accent)] focus:outline-none'
  const label = 'block text-[14px] font-medium text-[var(--text)]'

  return (
    <form onSubmit={onSubmit} noValidate className="grid gap-4 rounded-xl border border-[var(--border)] bg-[var(--surface)] p-5 sm:p-6">
      <fieldset>
        <legend className={label}>I'm interested in</legend>
        <div className="mt-2 flex flex-wrap gap-2">
          {(Object.keys(INTENTS) as Intent[]).map((k) => (
            <button
              key={k}
              type="button"
              aria-pressed={intent === k}
              onClick={() => setIntent(intent === k ? null : k)}
              className={`rounded-full border px-3.5 py-2 text-[14px] ${
                intent === k ? 'border-[var(--accent)] bg-[var(--accent)] text-white' : 'border-[var(--border-strong)] text-[var(--text)] hover:bg-[var(--bg)]'
              }`}
            >
              {INTENTS[k]}
            </button>
          ))}
        </div>
      </fieldset>
      <div className="grid gap-4 sm:grid-cols-2">
        <label className={label}>Name
          <input name="name" autoComplete="name" required maxLength={120} className={input} />
        </label>
        <label className={label}>Email
          <input name="email" type="email" inputMode="email" autoComplete="email" required maxLength={254} className={input} />
        </label>
      </div>
      <label className={label}>Company <span className="font-normal text-[var(--text-faint)]">(optional)</span>
        <input name="company" autoComplete="organization" maxLength={160} className={input} />
      </label>
      <label className={label}>What would you use it for?
        <textarea name="message" required rows={2} maxLength={1000} className={input} placeholder={feature ? `e.g. ${FEATURES[feature].title} for our clients` : profile ? PROFILES[profile].hint : 'One line is enough'} />
      </label>
      {/* Honeypot: hidden from people and screen readers; bots fill it. */}
      <div aria-hidden="true" style={{ position: 'absolute', left: '-9999px', width: 1, height: 1, overflow: 'hidden' }}>
        <label>Website<input name="website" tabIndex={-1} autoComplete="off" /></label>
      </div>
      {(fieldError || send.kind === 'error') && (
        <p role="alert" className="text-[14px] text-[var(--danger)]">{fieldError ?? (send.kind === 'error' ? send.msg : '')}</p>
      )}
      <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <p className="text-[13px] leading-snug text-[var(--text-faint)]">
          Only used to reply. No newsletter.{' '}
          <a href={LINKS.privacy} className="underline hover:text-[var(--text-dim)]">Privacy policy</a>
        </p>
        <button
          type="submit"
          disabled={send.kind === 'sending'}
          className="rounded-lg bg-[var(--accent)] px-5 py-2.5 text-[15px] font-semibold text-white hover:brightness-110 disabled:opacity-60"
        >
          {send.kind === 'sending' ? 'Sending…' : 'Send'}
        </button>
      </div>
    </form>
  )
}

// ── Who is reading ────────────────────────────────────────────────────────────
// Who walks MSP GLOBAL: MSP owners and their sales people, security providers
// (MSSPs), software vendors selling into the channel, and corporate IT. One tap
// tells the page which, and the rest speaks to that person: one line of why,
// the feature to see first, and a form hint in their own words.

type Profile = 'msp' | 'mssp' | 'isv' | 'ops'

const PROFILES: Record<Profile, { chip: string; why: string; hint: string }> = {
  msp: {
    chip: 'I run an MSP',
    why: 'Sell a site service. Every client building, its Wi-Fi, servers and cameras on one live screen. No hardware.',
    hint: 'e.g. a client with 6 offices and 40 access points',
  },
  mssp: {
    chip: 'I sell security',
    why: 'Badge readers, cameras and server rooms on the building. Alerts show where they happen.',
    hint: 'e.g. physical security for a client’s HQ',
  },
  isv: {
    chip: 'I sell software',
    why: 'Add a live 3D view to your product. One line of code. Your data on your client’s building.',
    hint: 'e.g. a 3D tab in our platform',
  },
  ops: {
    chip: 'I run IT or facilities',
    why: 'Know what is where, and what is down. Tap anything, see everything.',
    hint: 'e.g. find equipment by floor',
  },
}

const ROLE_START: Record<Profile, FeatureId> = { msp: 'itops', mssp: 'itops', isv: 'barcelona', ops: 'itops' }

const GALLERY = [
  { feature: 'itops' as FeatureId, src: '/msp-global/office-it.jpg', cap: 'An office’s Wi-Fi, servers and doors, live. Red when something is down.', tag: 'Managed IT' },
  { feature: 'hotel' as FeatureId, src: '/msp-global/hotel-vela.jpg', cap: 'Your client’s building, in its real city.', tag: 'Real estate' },
  { feature: 'solar' as FeatureId, src: '/msp-global/solar.jpg', cap: 'Sun and heat on every facade, from real climate data.', tag: 'Energy' },
  { feature: 'helsinki' as FeatureId, src: '/msp-global/helsinki-live.jpg', cap: 'A station and its bus bays, live as buses arrive.', tag: 'Transport' },
  { feature: 'barcelona' as FeatureId, src: '/msp-global/barcelona-district.jpg', cap: 'A whole district: traffic, bikes, chargers, live.', tag: 'Cities' },
]


// ── Page ──────────────────────────────────────────────────────────────────────

export default function MspGlobalView() {
  const entry = useMemo(readEntry, [])
  const [profile, setProfile] = useState<Profile | null>(null)
  const [sheet, setSheet] = useState<FeatureId | null>(null)
  const [interest, setInterest] = useState<FeatureId | null>(null)
  const heroRef = useRef<HTMLVideoElement>(null)
  const [heroVisible, setHeroVisible] = useState(true)
  useEffect(() => {
    const v = heroRef.current
    if (!v || typeof IntersectionObserver === 'undefined') return
    const io = new IntersectionObserver(([e]) => setHeroVisible(e.isIntersecting), { threshold: 0.1 })
    io.observe(v)
    return () => io.disconnect()
  }, [])
  useEffect(() => {
    const v = heroRef.current
    if (!v) return
    // The decoder shares the GPU with the 3D frame: give it back while a twin runs.
    if (heroVisible && sheet === null) void v.play().catch(() => {})
    else v.pause()
  }, [heroVisible, sheet])
  const contactRef = useRef<HTMLElement>(null)
  const demoRef = useRef<HTMLElement>(null)

  useEffect(() => {
    document.title = 'Joel Benítez · Digital twins in the browser'
    trackEventPageViewed({ event: EVENT_ID, entry })
  }, [entry])

  const toContact = () => contactRef.current?.scrollIntoView({ behavior: 'smooth', block: 'start' })
  const toDemo = () => demoRef.current?.scrollIntoView({ behavior: 'smooth', block: 'start' })
  const [shared, setShared] = useState<'idle' | 'copied'>('idle')
  const share = async () => {
    const url = `${window.location.origin}/msp-global?src=share`
    const data = { title: 'Joel Benítez · digital twins', text: 'Live 3D of buildings and cities, on any phone.', url }
    try {
      if (navigator.share) { await navigator.share(data); return }
      await navigator.clipboard.writeText(url)
      setShared('copied'); window.setTimeout(() => setShared('idle'), 1800)
    } catch { /* dismissed */ }
  }
  const openFeature = (id: FeatureId) => {
    setSheet(id)
    trackEventDemoOpened({ event: EVENT_ID, entry, profile: profile ?? 'none', feature: id })
  }
  const want = () => {
    setInterest(sheet)
    setSheet(null)
    window.setTimeout(toContact, 50)
  }

  const a = 'underline decoration-[var(--border-strong)] underline-offset-4 hover:decoration-[var(--text-dim)]'
  // One type scale, stepped up on tablets: the eye lands on the headline, then
  // the moving picture, then the one button — nothing else competes in size.
  const h2 = 'text-[26px] font-semibold leading-[1.15] tracking-tight md:text-[36px]'
  const lead = 'mt-2 max-w-[56ch] text-[16px] leading-relaxed text-[var(--text-dim)] md:mt-3 md:text-[19px]'
  const kicker = 'mb-2 text-[12px] font-semibold uppercase tracking-[0.14em] text-[var(--accent-2)] md:mb-3 md:text-[13px]'
  const primary = 'rounded-xl bg-[var(--accent)] px-6 py-3.5 text-[17px] font-semibold text-white shadow-[0_8px_24px_-12px_var(--accent)] hover:brightness-110 md:px-7 md:py-4 md:text-[18px]'
  const secondary = 'rounded-xl border border-[var(--border-strong)] px-6 py-3.5 text-[17px] font-medium text-[var(--text)] hover:bg-[var(--surface)] md:px-7 md:py-4 md:text-[18px]'
  const section = 'pt-14 md:pt-24'

  const heroCtas = (
    <>
      <button type="button" onClick={toDemo} className={primary}>Try it · 30 seconds</button>
      <button type="button" onClick={toContact} className={`${secondary} hidden md:inline-block`}>Talk to Joel</button>
    </>
  )

  return (
    <div className="min-h-full bg-[var(--bg)] text-[var(--text)]">
      {/* Tablets and up: the next step stays in the top bar. Phones: bottom bar. */}
      <header className="sticky top-0 z-20 border-b border-transparent bg-[var(--bg)] md:border-[var(--border)]">
        <div className="mx-auto flex max-w-[1180px] items-center justify-between px-4 py-3.5 sm:px-6 md:px-10 md:py-4">
          <p className="text-[13px] md:text-[15px]">
            <span className="font-semibold text-[var(--text)]">Joel Benítez</span>
            <span className="text-[var(--text-faint)]"> · MSP GLOBAL 2026</span>
          </p>
          <div className="hidden items-center gap-2 md:flex">
            <a href="/msp-global/joel-benitez.vcf" download="Joel Benitez.vcf" className="rounded-lg px-4 py-2 text-[15px] text-[var(--text-dim)] hover:bg-[var(--surface)] hover:text-[var(--text)]">Save contact</a>
            <button type="button" onClick={toContact} className="rounded-lg bg-[var(--accent)] px-4 py-2 text-[15px] font-semibold text-white hover:brightness-110">Talk to Joel</button>
          </div>
        </div>
      </header>

      <div className="mx-auto max-w-[1180px] px-4 pb-28 sm:px-6 md:px-10 md:pb-24">
        {/* 1 · One claim, one moving picture, one button. Side by side on landscape tablets. */}
        <section className="pt-4 md:pt-12 lg:grid lg:grid-cols-[5fr_7fr] lg:items-center lg:gap-12">
          <div>
            <p className={kicker}>Live digital twins</p>
            <h1 className="max-w-[14ch] text-[40px] font-semibold leading-[1.03] tracking-tight sm:text-[56px] md:text-[64px] lg:text-[58px]">
              Show clients their buildings. Live.
            </h1>
            <p className="mt-4 max-w-[34ch] text-[18px] leading-snug text-[var(--text-dim)] md:mt-5 md:text-[23px]">
              Every site, asset and sensor in <strong className="font-semibold text-[var(--text)]">one link</strong>. Opens on any phone.
            </p>
            <div className="mt-8 hidden flex-wrap gap-3 lg:flex">{heroCtas}</div>
          </div>
          <figure className="mt-6 overflow-hidden rounded-2xl border border-[var(--border)] md:mt-10 lg:mt-0">
            <button type="button" onClick={() => openFeature('barcelona')} className="group relative block w-full" aria-label="Open Barcelona live">
              <video
                ref={heroRef}
                poster="/msp-global/hero-poster.jpg"
                width={960} height={540}
                autoPlay muted loop playsInline preload="auto"
                aria-label="18-second tour of the product: Barcelona live, a tap opening live bike data, Hotel Vela on the map, a solar heat map and Helsinki station"
                className="block aspect-video h-auto w-full bg-black object-cover"
                disablePictureInPicture
              >
                <source src="/msp-global/hero.mp4" type="video/mp4" />
                <source src="/msp-global/hero.webm" type="video/webm" />
              </video>
            </button>
            <figcaption className="flex items-center gap-2 bg-[var(--surface)] px-3 py-2 text-[13px] text-[var(--text-dim)] md:px-4 md:py-3 md:text-[15px]">
              <span className="h-2 w-2 flex-none rounded-full bg-[var(--ok)]" aria-hidden="true" />
              Real screens, 18 seconds. <span className="font-medium text-[var(--text)]">Tap to try it live.</span>
            </figcaption>
          </figure>
          <div className="mt-6 flex flex-col gap-3 sm:flex-row lg:hidden">{heroCtas}</div>
        </section>

        {/* 2 · Who is reading. Everything below speaks to that person. */}
        <section className={`${section} md:grid md:grid-cols-2 md:gap-12`} aria-labelledby="who">
          <div>
            <p className={kicker}>For you</p>
            <h2 id="who" className={h2}>What do you do?</h2>
            <div className="mt-5 grid grid-cols-2 gap-2.5 md:gap-3" role="radiogroup" aria-label="Your role">
              {(Object.keys(PROFILES) as Profile[]).map((k) => (
                <button
                  key={k}
                  type="button"
                  role="radio"
                  aria-checked={profile === k}
                  onClick={() => setProfile(k)}
                  className={`rounded-xl border px-4 py-3 text-left text-[15px] font-medium leading-snug transition-colors md:px-5 md:py-4 md:text-[17px] ${
                    profile === k
                      ? 'border-[var(--accent)] bg-[var(--accent)] text-white'
                      : 'border-[var(--border-strong)] text-[var(--text)] hover:bg-[var(--surface)]'
                  }`}
                >
                  {PROFILES[k].chip}
                </button>
              ))}
            </div>
          </div>
          <div className="mt-5 md:mt-0 md:self-end">
            {profile ? (
              <div aria-live="polite">
                <p className="max-w-[40ch] text-[19px] font-medium leading-snug text-[var(--text)] md:text-[24px] md:leading-[1.3]">
                  {PROFILES[profile].why}
                </p>
                <button type="button" onClick={() => openFeature(ROLE_START[profile])} className={`mt-5 ${primary}`}>
                  See it live: {FEATURES[ROLE_START[profile]].title} →
                </button>
              </div>
            ) : (
              <p className="hidden text-[19px] leading-snug text-[var(--text-faint)] md:block">Pick one. The rest of the page adapts to you.</p>
            )}
          </div>
        </section>

        {/* 3 · The proof, in their hands. */}
        <section ref={demoRef} id="demo" className={`scroll-mt-20 ${section}`}>
          <p className={kicker}>Try it</p>
          <h2 className={h2}>Three taps</h2>
          <p className={lead}>Barcelona, live. On the screen in your hand.</p>
          <div className="mt-6 md:mt-8">
            <Demo entry={entry} profile={profile} onTalk={toContact} suspended={sheet !== null} />
          </div>
        </section>

        {/* 4 · Concrete things to sell, marked Ready or Pilot. */}
        <section className={section}>
          <p className={kicker}>Your next offer</p>
          <h2 className={h2}>What you could sell next</h2>
          <p className={lead}>
            <span className="font-semibold text-[var(--ok)]">Ready</span> works today. <span className="font-semibold text-[var(--warn)]">Pilot</span> needs a first partner.
          </p>
          <div className="mt-6 md:mt-8">
            <PilotIdeas role={profile} onOpen={openFeature} />
          </div>
        </section>

        {/* 5 · The range. One large picture, then a calm grid. */}
        <section className={section}>
          <p className={kicker}>Live examples</p>
          <h2 className={h2}>What your clients could see</h2>
          <div className="-mx-4 mt-6 flex snap-x snap-mandatory gap-3 overflow-x-auto px-4 pb-2 sm:mx-0 sm:grid sm:grid-cols-2 sm:gap-4 sm:overflow-visible sm:px-0 md:mt-8 md:gap-5">
            {GALLERY.map((g, i) => (
              <button
                key={g.src}
                type="button"
                onClick={() => openFeature(g.feature)}
                className={`group w-[82%] flex-none snap-start overflow-hidden rounded-2xl border border-[var(--border)] bg-[var(--surface)] text-left hover:border-[var(--border-strong)] sm:w-auto ${i === 0 ? 'sm:col-span-2 sm:grid sm:grid-cols-[3fr_2fr] sm:items-center' : ''}`}
              >
                <img src={g.src} alt={g.cap} width={1200} height={750} loading="lazy" className="block aspect-[8/5] h-auto w-full object-cover" />
                <span className={`block px-4 py-3 ${i === 0 ? 'md:px-8' : 'md:px-5 md:py-4'}`}>
                  <span className="text-[12px] font-semibold uppercase tracking-[0.12em] text-[var(--accent-2)] md:text-[13px]">{g.tag}</span>
                  <span className={`mt-1 block leading-snug text-[var(--text)] ${i === 0 ? 'text-[16px] md:text-[24px] md:font-medium' : 'text-[15px] md:text-[18px]'}`}>{g.cap}</span>
                  <span className="mt-2 block text-[14px] font-semibold text-[var(--accent-2)] group-hover:underline md:text-[15px]">Open it live →</span>
                </span>
              </button>
            ))}
          </div>
          <p className="mt-4 text-[11px] leading-snug text-[var(--text-faint)] md:text-[12px]">
            Real screens. Map data © OpenStreetMap contributors, OpenFreeMap, Overture Maps; terrain ICGC and Mapzen; live data from Barcelona, HSL and FMI open data; climate ERA5 via Open-Meteo.
          </p>
        </section>

        {/* 6 · Who, in two lines; the two ways to keep in touch beside it. */}
        <section className={`${section} md:grid md:grid-cols-[1fr_auto] md:items-center md:gap-12`}>
          <div>
            <div className="flex items-center gap-4">
              <img src="/founder.jpg" alt="" width={72} height={72} className="h-14 w-14 flex-none rounded-full object-cover md:h-[72px] md:w-[72px]" />
              <div>
                <p className="text-[17px] font-semibold md:text-[22px]">Joel Benítez Donari</p>
                <p className="text-[14px] text-[var(--text-dim)] md:text-[16px]">Built IFC Viewer Online</p>
              </div>
            </div>
            <p className="mt-4 max-w-[46ch] text-[16px] leading-relaxed text-[var(--text-dim)] md:text-[19px]">
              I built this alone, end to end. <span className="text-[var(--text)]">Now I'm looking for the first teams to take it further.</span>
            </p>
            <p className="mt-3 flex flex-wrap gap-x-5 gap-y-2 text-[15px] md:text-[16px]">
              <a href={LINKS.linkedin} className={a} target="_blank" rel="noopener">LinkedIn</a>
              <a href={LINKS.portfolio} className={a} target="_blank" rel="noopener">Portfolio</a>
              <a href={LINKS.github} className={a} target="_blank" rel="noopener">Code</a>
            </p>
          </div>
          <div className="mt-5 flex flex-wrap gap-3 md:mt-0 md:flex-col">
            <a href="/msp-global/joel-benitez.vcf" download="Joel Benitez.vcf" className={`${primary} text-center`}>Save my contact</a>
            <button type="button" onClick={share} className={secondary}>{shared === 'copied' ? 'Link copied' : 'Send to a colleague'}</button>
          </div>
        </section>

        {/* 7 · One reason to keep talking. */}
        <section ref={contactRef} id="contact" className={`scroll-mt-20 ${section} lg:grid lg:grid-cols-[2fr_3fr] lg:gap-12`}>
          <div>
            <p className={kicker}>Let's talk</p>
            <h2 className={h2}>Want to be first?</h2>
            <p className={lead}>Pilot, partnership or investment. <span className="text-[var(--text)]">One line is enough.</span></p>
            <ul className="mt-6 hidden space-y-2 text-[16px] text-[var(--text-dim)] lg:block">
              <li>· A reply this week, about what you wrote.</li>
              <li>· A concrete idea for your case, not a brochure.</li>
              <li>· No newsletter.</li>
            </ul>
          </div>
          <div className="mt-6 md:mt-8 lg:mt-0">
            <Contact entry={entry} profile={profile} feature={interest} />
          </div>
        </section>
      </div>

      {sheet && <FeatureSheet id={sheet} onClose={() => setSheet(null)} onWant={want} />}

      {/* Phones: the next step is always one thumb away. */}
      <div className="fixed inset-x-0 bottom-0 z-10 border-t border-[var(--border)] bg-[var(--bg)] px-4 py-3 md:hidden" style={{ paddingBottom: 'max(12px, env(safe-area-inset-bottom))' }}>
        <div className="flex gap-2">
          <a href="/msp-global/joel-benitez.vcf" download="Joel Benitez.vcf" className="flex-1 rounded-lg border border-[var(--border-strong)] py-3 text-center text-[16px] font-medium text-[var(--text)]">
            Save contact
          </a>
          <button type="button" onClick={toContact} className="flex-1 rounded-lg bg-[var(--accent)] py-3 text-[16px] font-semibold text-white">
            Talk to Joel
          </button>
        </div>
      </div>
    </div>
  )
}
