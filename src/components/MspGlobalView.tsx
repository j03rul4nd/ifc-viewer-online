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
import { IntegrationPreview, DataFlow, PilotIdeas, INTENTS, type Intent } from './msp/EventPanels'
import {
  trackEventPageViewed, trackEventDemoOpened, trackEventDemoInteraction, trackEventContactSent,
  type EventEntry,
} from '../lib/analytics'

const EVENT_ID = 'msp-global-2026'
const DEMO_MODEL = '/Ifc2x3_Duplex_Architecture.ifc'
const POSTER = '/modelscene.png'
const LOAD_TIMEOUT_MS = 30_000

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
  elements?: number
  picked?: { type: string; name: string; id: string }
  score?: number | null
  errors?: number
  warnings?: number
}

const FRIENDLY: Record<string, string> = {
  BUILDINGELEMENTPROXY: 'generic element', CURTAINWALL: 'curtain wall', FLOWTERMINAL: 'fixture',
  FURNISHINGELEMENT: 'furniture item', STAIRFLIGHT: 'stair flight', OPENINGELEMENT: 'opening',
}

/** IFCWALLSTANDARDCASE → "wall". The viewer reports the raw upper-case type. */
function prettyType(t: string): string {
  const core = t.toUpperCase().replace(/^IFC/, '').replace(/STANDARDCASE$|ELEMENTEDCASE$/, '')
  return FRIENDLY[core] ?? core.toLowerCase()
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
    const model = `${window.location.origin}${DEMO_MODEL}`
    const q = new URLSearchParams({ model, name: 'Duplex house (sample)', embed: '1', ui: 'minimal', lang: 'en' })
    return `/?${q.toString()}`
  }, [])

  const open = useCallback(() => {
    if (!hasWebGL()) { setState('failed'); return }
    setFacts({})
    setState('loading')
    setRun((r) => r + 1)
    trackEventDemoOpened({ event: EVENT_ID, entry, profile: profile ?? 'none' })
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
        setFacts((f) => ({ ...f, elements: typeof d.elementCount === 'number' ? d.elementCount : undefined }))
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
            <img src={POSTER} alt="The viewer showing a building model with its element tree and properties" className="absolute inset-0 h-full w-full object-cover opacity-70" />
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
                Opening a 2.4 MB sample model…
              </div>
            )}
          </>
        )}
        {state === 'failed' && (
          <div className="absolute inset-0">
            <img src={POSTER} alt="Screenshot of the viewer with a building model loaded" className="absolute inset-0 h-full w-full object-cover opacity-40" />
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
          <Step n={1} done={loaded} title="Open a building">
            {loaded && facts.elements != null
              ? <>{facts.elements.toLocaleString('en')} elements. On your phone. Nothing uploaded.</>
              : <>Sample house, 2.4 MB.</>}
          </Step>
          <Step n={2} done={!!facts.picked} title="Tap a wall or a door">
            {facts.picked
              ? <>You picked a <strong className="text-[var(--text)]">{prettyType(facts.picked.type)}</strong>{facts.picked.name ? <> — “{facts.picked.name}”</> : null}.{facts.picked.id && <> ID: <code className="break-all text-[13px] text-[var(--text)]">{facts.picked.id}</code></>}</>
              : <>Every part has data and a permanent ID.</>}
          </Step>
          <Step n={3} done={facts.score != null} title="Get the health check">
            {facts.score != null
              ? <>Score <strong className="text-[var(--text)]">{facts.score}/100</strong>{facts.errors != null && <> · {facts.errors} {facts.errors === 1 ? 'error' : 'errors'} · {facts.warnings ?? 0} {facts.warnings === 1 ? 'warning' : 'warnings'}</>}.</>
              : <>Broken data, found automatically.</>}
          </Step>
        </ol>

        <div className="rounded-lg border border-[var(--border)] bg-[var(--surface)] p-4 text-[14px] leading-relaxed text-[var(--text-dim)]">
          <p>
            <strong className="text-[var(--text)]">See the ticks?</strong> This page heard you inside the 3D view.
            Same hook can open a ticket in your system.
          </p>
        </div>

        <IntegrationPreview picked={facts.picked} score={facts.score} />
        <DataFlow key={run} frameRef={frameRef} active={state === 'loading' || loaded} />

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

function Contact({ entry, profile }: { entry: EventEntry; profile: Profile | null }) {
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
          event: EVENT_ID, entry, profile: profile ?? '', intent: intent ?? '',
        }),
      })
      const data = (await res.json().catch(() => null)) as { ok?: boolean; error?: string } | null
      if (res.ok && data?.ok) {
        setSend({ kind: 'sent' })
        trackEventContactSent({ event: EVENT_ID, entry, profile: profile ?? 'none' })
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
        <p className="text-[18px] font-semibold text-[var(--text)]">Got it. Thank you.</p>
        <p className="mt-2 text-[15px] leading-relaxed text-[var(--text-dim)]">
          I'll reply by email this week. About what you wrote, nothing else.
        </p>
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
      <label className={label}>What would you build with this?
        <textarea name="message" required rows={2} maxLength={1000} className={input} placeholder={profile ? PROFILES[profile].hint : 'One line is enough'} />
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
          Used only to reply to you. No newsletter.{' '}
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
// MSP GLOBAL is MSPs, integrators, software vendors and corporate IT. One tap
// tells the page which, and the rest speaks to that person: one line of why,
// the proof that fits them, and a form hint in their own words.

type Profile = 'msp' | 'isv' | 'ops'

const PROFILES: Record<Profile, { chip: string; why: string; hint: string }> = {
  msp: {
    chip: 'I run IT for clients',
    why: 'Your clients have buildings, sites and sensors. Give them one live view of all of it. It runs in the browser: nothing to install or patch.',
    hint: 'e.g. a site dashboard for a client with 12 buildings',
  },
  isv: {
    chip: 'I build software',
    why: 'Put a 3D view inside your product. One iframe, a typed SDK, and every click comes back to your app.',
    hint: 'e.g. show our assets in 3D inside our platform',
  },
  ops: {
    chip: 'I run sites or assets',
    why: 'Tap any asset to see what it is, where it is and its live readings. Files stay on your device.',
    hint: 'e.g. find equipment and its sensor data by floor',
  },
}

const GALLERY = [
  { src: '/blog/images/urban-digital-twin-helsinki-live-800.jpg', cap: 'Live buses on a Helsinki terminal', tag: 'Live data' },
  { src: '/blog/images/bim-model-in-city-context-800.jpg', cap: 'Barcelona, built from open data', tag: 'City scale' },
  { src: '/blog/images/urban-digital-twin-tokyo-live-800.jpg', cap: 'Tokyo transit, live', tag: 'Live data' },
]

const LIVE_TWIN = '/?scene=/scenes/helsinki-rautatientori.scene.json'

// ── Page ──────────────────────────────────────────────────────────────────────

export default function MspGlobalView() {
  const entry = useMemo(readEntry, [])
  const [profile, setProfile] = useState<Profile | null>(null)
  const contactRef = useRef<HTMLElement>(null)
  const demoRef = useRef<HTMLElement>(null)

  useEffect(() => {
    document.title = 'Joel Benítez · Digital twins in the browser'
    trackEventPageViewed({ event: EVENT_ID, entry })
  }, [entry])

  const toContact = () => contactRef.current?.scrollIntoView({ behavior: 'smooth', block: 'start' })
  const toDemo = () => demoRef.current?.scrollIntoView({ behavior: 'smooth', block: 'start' })

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
            Digital twins that open in a browser.
          </h1>
          <p className="mt-3 text-[18px] text-[var(--text-dim)]">Buildings. Cities. Live sensors. No install.</p>
          <figure className="mt-5 overflow-hidden rounded-xl border border-[var(--border)]">
            <img
              src="/blog/images/bus-terminal-digital-twin-bay-card-800.jpg"
              alt="A Helsinki bus terminal model on the city map, with one bay selected showing its live data and properties"
              width={800} height={450}
              className="block h-auto w-full"
              fetchPriority="high"
            />
            <figcaption className="flex items-center gap-2 bg-[var(--surface)] px-3 py-2 text-[13px] text-[var(--text-dim)]">
              <span className="h-2 w-2 flex-none rounded-full bg-[var(--ok)]" aria-hidden="true" />
              Real screen. Tap a bus bay, get its data and live status.
            </figcaption>
          </figure>
          <button type="button" onClick={toDemo} className="mt-5 w-full rounded-lg bg-[var(--accent)] px-5 py-3.5 text-[17px] font-semibold text-white hover:brightness-110 sm:w-auto">
            Try it now · 30 s
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
        </section>

        {/* Screen 3: the proof, in their hands. */}
        <section ref={demoRef} id="demo" className="scroll-mt-4 pt-12">
          <h2 className={h2}>Try it on your phone</h2>
          <p className="mt-2 text-[16px] text-[var(--text-dim)]">A real building file. Three taps.</p>
          <div className="mt-5">
            <Demo entry={entry} profile={profile} onTalk={toContact} />
          </div>
        </section>

        {/* Screen 3b: concrete things to build together, marked Live or Pilot. */}
        <section className="pt-14">
          <h2 className={h2}>What we could build together</h2>
          <p className="mt-2 text-[16px] text-[var(--text-dim)]">
            <span className="text-[var(--ok)]">Live</span> opens now. <span className="text-[var(--warn)]">Pilot</span> needs a first partner.
          </p>
          <div className="mt-5">
            <PilotIdeas role={profile} />
          </div>
        </section>

        {/* Screen 4: the range. Pictures, not paragraphs. */}
        <section className="pt-14">
          <h2 className={h2}>That was the small part</h2>
          <div className="-mx-4 mt-5 flex snap-x snap-mandatory gap-3 overflow-x-auto px-4 pb-2 sm:mx-0 sm:grid sm:grid-cols-3 sm:overflow-visible sm:px-0">
            {GALLERY.map((g) => (
              <figure key={g.src} className="w-[82%] flex-none snap-start overflow-hidden rounded-xl border border-[var(--border)] bg-[var(--surface)] sm:w-auto">
                <img src={g.src} alt={g.cap} width={800} height={450} loading="lazy" className="block aspect-video h-auto w-full object-cover" />
                <figcaption className="px-3 py-2.5">
                  <span className="text-[12px] font-medium uppercase tracking-wide text-[var(--accent-2)]">{g.tag}</span>
                  <span className="mt-0.5 block text-[15px] text-[var(--text)]">{g.cap}</span>
                </figcaption>
              </figure>
            ))}
          </div>
          <a href={LIVE_TWIN} target="_blank" rel="noopener" className="mt-4 inline-block text-[16px] font-medium text-[var(--accent-2)] hover:underline">
            Open the live Helsinki twin →
          </a>
          <p className="mt-1 text-[13px] text-[var(--text-faint)]">Best on a laptop. Allow the map data when asked.</p>
          <p className="mt-6 max-w-[56ch] text-[15px] leading-relaxed text-[var(--text-dim)]">
            Open-source 3D engine underneath. On top, built by me: the city, the live feeds, the data checks, the SDK.
          </p>
        </section>

        {/* Screen 5: who, in two lines. */}
        <section className="pt-14">
          <div className="flex items-center gap-4">
            <img src="/founder.jpg" alt="" width={56} height={56} className="h-14 w-14 flex-none rounded-full object-cover" />
            <div>
              <p className="text-[17px] font-semibold">Joel Benítez Donari</p>
              <p className="text-[14px] text-[var(--text-dim)]">Full-stack · 3D, GIS, industrial IoT</p>
            </div>
          </div>
          <p className="mt-4 max-w-[52ch] text-[16px] leading-relaxed text-[var(--text-dim)]">
            I take a messy technical problem and ship the tool people use. This product is mine, end to end.
          </p>
          <p className="mt-3 flex flex-wrap gap-x-5 gap-y-2 text-[15px]">
            <a href={LINKS.linkedin} className={a} target="_blank" rel="noopener">LinkedIn</a>
            <a href={LINKS.portfolio} className={a} target="_blank" rel="noopener">Portfolio</a>
            <a href={LINKS.github} className={a} target="_blank" rel="noopener">Code</a>
          </p>
        </section>

        {/* Screen 6: one reason to keep talking. */}
        <section ref={contactRef} id="contact" className="scroll-mt-4 pt-14">
          <h2 className={h2}>Be the first pilot</h2>
          <p className="mt-2 text-[16px] text-[var(--text-dim)]">I'm looking for first clients, partners and backers. Tell me in one line; I'll come back with a concrete idea.</p>
          <div className="mt-5 max-w-[720px]">
            <Contact entry={entry} profile={profile} />
          </div>
        </section>
      </div>

      {/* Phone: the next step is always one thumb away. */}
      <div className="fixed inset-x-0 bottom-0 z-10 border-t border-[var(--border)] bg-[var(--bg)] px-4 py-3 sm:hidden" style={{ paddingBottom: 'max(12px, env(safe-area-inset-bottom))' }}>
        <button type="button" onClick={toContact} className="w-full rounded-lg border border-[var(--border-strong)] py-3 text-[16px] font-medium text-[var(--text)]">
          Talk to Joel
        </button>
      </div>
    </div>
  )
}
