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
        <p className="text-[15px] font-medium text-[var(--text)]">
          {title}
          <span className="sr-only">{done ? ' (done)' : ''}</span>
        </p>
        {children && <div className="mt-0.5 text-[14px] leading-snug text-[var(--text-dim)]">{children}</div>}
      </div>
    </li>
  )
}

function Demo({ entry, profile, onTalk }: { entry: EventEntry; profile: Profile | null; onTalk: () => void }) {
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
        <ol className="flex flex-col gap-4">
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

        <div className="rounded-lg border border-[var(--border)] bg-[var(--surface)] p-4 text-[14px] leading-relaxed text-[var(--text-dim)]">
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
  const h2 = 'text-[24px] font-semibold leading-tight tracking-tight sm:text-[28px]'

  return (
    <div className="min-h-full bg-[var(--bg)] text-[var(--text)]">
      <div className="mx-auto max-w-[1100px] px-4 pb-28 sm:px-6 sm:pb-16">
        <header className="flex items-center justify-between py-4 text-[13px] text-[var(--text-faint)]">
          <span className="font-semibold text-[var(--text-dim)]">Joel Benítez</span>
          <span>MSP GLOBAL 2026</span>
        </header>

        {/* Screen 1: one claim, one picture, one button. */}
        <section className="pt-2 sm:pt-8">
          <h1 className="max-w-[16ch] text-[38px] font-semibold leading-[1.05] tracking-tight sm:text-[56px]">
            Show clients their buildings. Live.
          </h1>
          <p className="mt-3 text-[18px] text-[var(--text-dim)]">Every site, asset and sensor in one link. Opens on any phone.</p>
          <figure className="mt-5 overflow-hidden rounded-xl border border-[var(--border)]">
            <button type="button" onClick={() => openFeature('barcelona')} className="group relative block w-full" aria-label="Open Barcelona live">
              <video
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
            <figcaption className="flex items-center gap-2 bg-[var(--surface)] px-3 py-2 text-[13px] text-[var(--text-dim)]">
              <span className="h-2 w-2 flex-none rounded-full bg-[var(--ok)]" aria-hidden="true" />
              Real screens, 18 seconds. Tap to try it live.
            </figcaption>
          </figure>
          <button type="button" onClick={toDemo} className="mt-5 w-full rounded-lg bg-[var(--accent)] px-5 py-3.5 text-[17px] font-semibold text-white hover:brightness-110 sm:w-auto">
            Try it · 30 seconds
          </button>
        </section>

        {/* Screen 2: who are you. Everything below adapts. */}
        <section className="pt-12" aria-labelledby="who">
          <h2 id="who" className={h2}>What do you do?</h2>
          <div className="mt-4 flex flex-wrap gap-2" role="radiogroup" aria-label="Your role">
            {(Object.keys(PROFILES) as Profile[]).map((k) => (
              <button
                key={k}
                type="button"
                role="radio"
                aria-checked={profile === k}
                onClick={() => setProfile(k)}
                className={`rounded-full border px-4 py-2.5 text-[15px] transition-colors ${
                  profile === k
                    ? 'border-[var(--accent)] bg-[var(--accent)] text-white'
                    : 'border-[var(--border-strong)] text-[var(--text)] hover:bg-[var(--surface)]'
                }`}
              >
                {PROFILES[k].chip}
              </button>
            ))}
          </div>
          {profile && (
            <p className="mt-4 max-w-[52ch] text-[18px] leading-snug text-[var(--text)]" aria-live="polite">
              {PROFILES[profile].why}
            </p>
          )}
          {profile && (
            <button type="button" onClick={() => openFeature(ROLE_START[profile])} className="mt-4 rounded-lg bg-[var(--accent)] px-5 py-3 text-[16px] font-semibold text-white hover:brightness-110">
              See it live: {FEATURES[ROLE_START[profile]].title} →
            </button>
          )}
        </section>

        {/* Screen 3: the proof, in their hands. */}
        <section ref={demoRef} id="demo" className="scroll-mt-4 pt-12">
          <h2 className={h2}>Three taps</h2>
          <p className="mt-2 text-[16px] text-[var(--text-dim)]">Barcelona, live. On your phone.</p>
          <div className="mt-5">
            <Demo entry={entry} profile={profile} onTalk={toContact} />
          </div>
        </section>

        {/* Screen 3b: concrete things to build together, marked Live or Pilot. */}
        <section className="pt-14">
          <h2 className={h2}>What you could sell next</h2>
          <p className="mt-2 text-[16px] text-[var(--text-dim)]">
            <span className="text-[var(--ok)]">Ready</span> works today. <span className="text-[var(--warn)]">Pilot</span> needs a first partner.
          </p>
          <div className="mt-5">
            <PilotIdeas role={profile} onOpen={openFeature} />
          </div>
        </section>

        {/* Screen 4: the range. Pictures, not paragraphs. */}
        <section className="pt-14">
          <h2 className={h2}>What your clients could see</h2>
          <div className="-mx-4 mt-5 flex snap-x snap-mandatory gap-3 overflow-x-auto px-4 pb-2 sm:mx-0 sm:grid sm:grid-cols-2 sm:overflow-visible sm:px-0">
            {GALLERY.map((g) => (
              <button
                key={g.src}
                type="button"
                onClick={() => openFeature(g.feature)}
                className="w-[82%] flex-none snap-start overflow-hidden rounded-xl border border-[var(--border)] bg-[var(--surface)] text-left hover:border-[var(--border-strong)] sm:w-auto"
              >
                <img src={g.src} alt={g.cap} width={1200} height={750} loading="lazy" className="block aspect-[8/5] h-auto w-full object-cover" />
                <span className="block px-3 py-2.5">
                  <span className="text-[12px] font-medium uppercase tracking-wide text-[var(--accent-2)]">{g.tag}</span>
                  <span className="mt-0.5 block text-[15px] text-[var(--text)]">{g.cap}</span>
                  <span className="mt-1 block text-[13px] font-medium text-[var(--accent-2)]">Open it live →</span>
                </span>
              </button>
            ))}
          </div>
          <p className="mt-3 text-[11px] leading-snug text-[var(--text-faint)]">
            Real screens. Map data © OpenStreetMap contributors, OpenFreeMap, Overture Maps; terrain ICGC and Mapzen; live data from Barcelona, HSL and FMI open data; climate ERA5 via Open-Meteo.
          </p>
        </section>

        {/* Screen 5: who, in two lines. */}
        <section className="pt-14">
          <div className="flex items-center gap-4">
            <img src="/founder.jpg" alt="" width={56} height={56} className="h-14 w-14 flex-none rounded-full object-cover" />
            <div>
              <p className="text-[17px] font-semibold">Joel Benítez Donari</p>
              <p className="text-[14px] text-[var(--text-dim)]">Built IFC Viewer Online</p>
            </div>
          </div>
          <p className="mt-4 max-w-[52ch] text-[16px] leading-relaxed text-[var(--text-dim)]">
            I built this alone, end to end. Now I'm looking for the first teams to take it further.
          </p>
          <div className="mt-4 flex flex-wrap gap-2">
            <a href="/msp-global/joel-benitez.vcf" download="Joel Benitez.vcf" className="rounded-lg bg-[var(--accent)] px-4 py-2.5 text-[15px] font-semibold text-white hover:brightness-110">
              Save my contact
            </a>
            <button type="button" onClick={share} className="rounded-lg border border-[var(--border-strong)] px-4 py-2.5 text-[15px] text-[var(--text)] hover:bg-[var(--surface)]">
              {shared === 'copied' ? 'Link copied' : 'Send to a colleague'}
            </button>
          </div>
          <p className="mt-3 flex flex-wrap gap-x-5 gap-y-2 text-[15px]">
            <a href={LINKS.linkedin} className={a} target="_blank" rel="noopener">LinkedIn</a>
            <a href={LINKS.portfolio} className={a} target="_blank" rel="noopener">Portfolio</a>
            <a href={LINKS.github} className={a} target="_blank" rel="noopener">Code</a>
          </p>
        </section>

        {/* Screen 6: one reason to keep talking. */}
        <section ref={contactRef} id="contact" className="scroll-mt-4 pt-14">
          <h2 className={h2}>Want to be first?</h2>
          <p className="mt-2 text-[16px] text-[var(--text-dim)]">Pilot, partnership or investment. One line is enough.</p>
          <div className="mt-5 max-w-[720px]">
            <Contact entry={entry} profile={profile} feature={interest} />
          </div>
        </section>
      </div>

      {sheet && <FeatureSheet id={sheet} onClose={() => setSheet(null)} onWant={want} />}

      {/* Phone: the next step is always one thumb away. */}
      <div className="fixed inset-x-0 bottom-0 z-10 border-t border-[var(--border)] bg-[var(--bg)] px-4 py-3 sm:hidden" style={{ paddingBottom: 'max(12px, env(safe-area-inset-bottom))' }}>
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
