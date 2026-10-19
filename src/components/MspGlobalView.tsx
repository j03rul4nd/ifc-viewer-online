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

function Demo({ entry, onTalk }: { entry: EventEntry; onTalk: () => void }) {
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
    trackEventDemoOpened({ event: EVENT_ID, entry })
  }, [entry])

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
    <div className="grid gap-5 lg:grid-cols-[minmax(0,1fr)_320px]">
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

      <aside aria-label="What to try" className="flex flex-col gap-4">
        <ol className="flex flex-col gap-4">
          <Step n={1} done={loaded} title="A building opens in the browser">
            {loaded && facts.elements != null
              ? <>{facts.elements.toLocaleString('en')} elements, read on this device. No install, no upload.</>
              : <>A public sample house. Its data is read on this device.</>}
          </Step>
          <Step n={2} done={!!facts.picked} title="Tap any wall, door or window">
            {facts.picked
              ? <>You picked a <strong className="text-[var(--text)]">{prettyType(facts.picked.type)}</strong>{facts.picked.name ? <> — “{facts.picked.name}”</> : null}.{facts.picked.id && <> Its permanent ID: <code className="break-all text-[13px] text-[var(--text)]">{facts.picked.id}</code></>}</>
              : <>Every element carries its own data and a permanent ID that other systems can link to.</>}
          </Step>
          <Step n={3} done={facts.score != null} title="Read the automatic health check">
            {facts.score != null
              ? <>Score <strong className="text-[var(--text)]">{facts.score}/100</strong>{facts.errors != null && <> · {facts.errors} {facts.errors === 1 ? 'error' : 'errors'} · {facts.warnings ?? 0} {facts.warnings === 1 ? 'warning' : 'warnings'}</>}. Open the bar at the bottom to see each issue.</>
              : <>The file is checked for missing or broken data as it opens.</>}
          </Step>
        </ol>

        <div className="rounded-lg border border-[var(--border)] bg-[var(--surface)] p-4 text-[14px] leading-relaxed text-[var(--text-dim)]">
          <p>
            <strong className="text-[var(--text)]">Notice the ticks.</strong> This page heard every step from inside the viewer.
            That's how it plugs into your software: a tap in 3D can open a ticket, fill a record or start a workflow.
          </p>
        </div>

        <div className="flex flex-wrap gap-2">
          {state !== 'idle' && (
            <button type="button" onClick={open} className="rounded-lg border border-[var(--border-strong)] px-3.5 py-2 text-[14px] text-[var(--text)] hover:bg-[var(--surface)]">
              Restart demo
            </button>
          )}
          <button type="button" onClick={onTalk} className="rounded-lg px-3.5 py-2 text-[14px] font-medium text-[var(--accent-2)] hover:underline">
            Talk about your case →
          </button>
        </div>
      </aside>
    </div>
  )
}

// ── Contact ───────────────────────────────────────────────────────────────────

type SendState = { kind: 'idle' } | { kind: 'sending' } | { kind: 'sent' } | { kind: 'error'; msg: string }

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/

function Contact({ entry }: { entry: EventEntry }) {
  const startedAt = useRef(Date.now())
  const [send, setSend] = useState<SendState>({ kind: 'idle' })
  const [fieldError, setFieldError] = useState<string | null>(null)

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
          event: EVENT_ID, entry,
        }),
      })
      const data = (await res.json().catch(() => null)) as { ok?: boolean; error?: string } | null
      if (res.ok && data?.ok) {
        setSend({ kind: 'sent' })
        trackEventContactSent({ event: EVENT_ID, entry })
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
          I'll reply by email after the event, about what you wrote. Nothing else.
        </p>
      </div>
    )
  }

  const input = 'mt-1.5 w-full rounded-lg border border-[var(--border-strong)] bg-[var(--bg)] px-3 py-2.5 text-[16px] text-[var(--text)] placeholder:text-[var(--text-faint)] focus:border-[var(--accent)] focus:outline-none'
  const label = 'block text-[14px] font-medium text-[var(--text)]'

  return (
    <form onSubmit={onSubmit} noValidate className="grid gap-4 rounded-xl border border-[var(--border)] bg-[var(--surface)] p-5 sm:p-6">
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
      <label className={label}>What would you like to solve or explore?
        <textarea name="message" required rows={3} maxLength={1000} className={input} placeholder="e.g. show equipment from our CMMS on a building model" />
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
          I'll use these details only to reply to you. No newsletter.{' '}
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

// ── Page ──────────────────────────────────────────────────────────────────────

export default function MspGlobalView() {
  const entry = useMemo(readEntry, [])
  const contactRef = useRef<HTMLElement>(null)
  const demoRef = useRef<HTMLElement>(null)

  useEffect(() => {
    document.title = 'Joel Benítez at MSP GLOBAL 2026 — IFC Viewer Online'
    trackEventPageViewed({ event: EVENT_ID, entry })
  }, [entry])

  const toContact = () => contactRef.current?.scrollIntoView({ behavior: 'smooth', block: 'start' })
  const toDemo = () => demoRef.current?.scrollIntoView({ behavior: 'smooth', block: 'start' })

  const a = 'underline decoration-[var(--border-strong)] underline-offset-4 hover:decoration-[var(--text-dim)]'

  return (
    <div className="min-h-full bg-[var(--bg)] text-[var(--text)]">
      <div className="mx-auto max-w-[1100px] px-4 pb-16 sm:px-6">
        <header className="flex items-center justify-between py-4 text-[13px] text-[var(--text-faint)]">
          <a href="/" className="font-semibold text-[var(--text-dim)] hover:text-[var(--text)]">IFC Viewer Online</a>
          <span>MSP GLOBAL 2026<span className="hidden sm:inline"> · PortAventura</span></span>
        </header>

        {/* First screen: who, what, two actions. */}
        <section className="pt-4 sm:pt-10">
          <p className="text-[14px] text-[var(--text-dim)]">Joel Benítez · full-stack developer</p>
          <h1 className="mt-2 max-w-[22ch] text-[34px] font-semibold leading-[1.1] tracking-tight sm:text-[48px]">
            I turn heavy technical data into web tools people can use.
          </h1>
          <p className="mt-4 max-w-[60ch] text-[17px] leading-relaxed text-[var(--text-dim)]">
            3D, maps and digital twins for industry and buildings. Here is one product I built and run, live on your phone.
          </p>
          <div className="mt-6 flex flex-col gap-3 sm:flex-row">
            <button type="button" onClick={toDemo} className="rounded-lg bg-[var(--accent)] px-5 py-3 text-[16px] font-semibold text-white hover:brightness-110">
              See the live demo
            </button>
            <button type="button" onClick={toContact} className="rounded-lg border border-[var(--border-strong)] px-5 py-3 text-[16px] font-medium text-[var(--text)] hover:bg-[var(--surface)]">
              Talk about your case
            </button>
          </div>
        </section>

        <section ref={demoRef} id="demo" className="scroll-mt-4 pt-12">
          <h2 className="text-[22px] font-semibold tracking-tight">IFC Viewer Online</h2>
          <p className="mt-2 max-w-[68ch] text-[15px] leading-relaxed text-[var(--text-dim)]">
            Buildings are designed in software that exports <strong className="text-[var(--text)]">IFC</strong>: an open file where every wall,
            door and pipe carries its data. Those files are large and usually need desktop software. This opens them in a browser,
            checks their quality and lets other apps embed the viewer. The file is processed on the device, not on a server.
          </p>
          <div className="mt-5">
            <Demo entry={entry} onTalk={toContact} />
          </div>
        </section>

        <section className="pt-14">
          <h2 className="text-[22px] font-semibold tracking-tight">Where this pattern fits</h2>
          <ul className="mt-4 grid max-w-[72ch] gap-3 text-[15px] leading-relaxed text-[var(--text-dim)]">
            <li><strong className="text-[var(--text)]">Software vendors.</strong> Add a 3D view of a site or asset to your product with an iframe and a <a href={LINKS.sdk} className={a}>documented SDK</a>.</li>
            <li><strong className="text-[var(--text)]">Facilities and operations.</strong> Put equipment, tickets or sensor readings on the building they belong to.</li>
            <li><strong className="text-[var(--text)]">Data-heavy tools.</strong> Large technical files, checked and shown in a browser, without installing anything.</li>
          </ul>
        </section>

        <section className="pt-14">
          <h2 className="text-[22px] font-semibold tracking-tight">About me</h2>
          <div className="mt-4 max-w-[68ch] space-y-3 text-[15px] leading-relaxed text-[var(--text-dim)]">
            <p>
              I'm Joel Benítez Donari. I build products end to end: from understanding the problem to shipping
              the thing people use. TypeScript, React, Three.js, WebAssembly and Node.
            </p>
            <p>
              My background is industrial software: IoT gateways, GIS and R&amp;D teams. IFC Viewer Online is my own product,
              and it's open source.
            </p>
          </div>
          <p className="mt-4 flex flex-wrap gap-x-5 gap-y-2 text-[15px]">
            <a href={LINKS.portfolio} className={a} target="_blank" rel="noopener">Portfolio</a>
            <a href={LINKS.linkedin} className={a} target="_blank" rel="noopener">LinkedIn</a>
            <a href={LINKS.github} className={a} target="_blank" rel="noopener">Source code</a>
          </p>
        </section>

        <section ref={contactRef} id="contact" className="scroll-mt-4 pt-14">
          <h2 className="text-[22px] font-semibold tracking-tight">Have a case in mind?</h2>
          <p className="mt-2 max-w-[60ch] text-[15px] leading-relaxed text-[var(--text-dim)]">
            An integration, a product idea or a collaboration. Two lines are enough. I'll reply after the event.
          </p>
          <div className="mt-5 max-w-[720px]">
            <Contact entry={entry} />
          </div>
        </section>
      </div>
    </div>
  )
}
