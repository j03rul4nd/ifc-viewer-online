// ─── Event panels for /msp-global ─────────────────────────────────────────────
// Three pieces written for an MSP / integrator audience, each built from what
// the demo really does:
//
//  - IntegrationPreview: the event a host app receives when someone taps an
//    element, shaped like the webhook body a PSA or ticketing system would get.
//    It is a preview: nothing is sent anywhere, and it says so.
//  - DataFlow: which servers the viewer frame contacted, read from the frame's
//    own Resource Timing. Answers the security question with a measurement.
//  - PilotIdeas: what we could build together, each marked Live (exists and can
//    be opened) or Pilot (an idea that needs a partner).

import { useEffect, useState, type RefObject } from 'react'

// ── Integration preview ──────────────────────────────────────────────────────

export interface PickedElement { type: string; name: string; id: string }

export function IntegrationPreview({ picked, score }: { picked?: PickedElement; score?: number | null }) {
  const [copied, setCopied] = useState(false)
  if (!picked) return null
  const body = {
    event: 'element.selected',
    model: 'Duplex house (sample)',
    element: { ifcType: picked.type, name: picked.name || null, globalId: picked.id || null },
    health: score != null ? { score } : undefined,
    at: new Date().toISOString().slice(0, 19) + 'Z',
  }
  const json = JSON.stringify(body, null, 2)
  const copy = async () => {
    try { await navigator.clipboard.writeText(json); setCopied(true); window.setTimeout(() => setCopied(false), 1500) } catch { /* ignore */ }
  }
  return (
    <div className="rounded-lg border border-[var(--border)] bg-[var(--surface)]">
      <div className="flex items-center justify-between gap-2 border-b border-[var(--border)] px-3 py-2">
        <p className="text-[13px] font-medium text-[var(--text)]">What your system would receive</p>
        <button type="button" onClick={copy} className="text-[12px] text-[var(--accent-2)] hover:underline">{copied ? 'Copied' : 'Copy'}</button>
      </div>
      <pre className="max-h-48 overflow-auto px-3 py-2 text-[12px] leading-snug text-[var(--text-dim)]"><code>{json}</code></pre>
      <p className="border-t border-[var(--border)] px-3 py-2 text-[12px] text-[var(--text-faint)]">
        Preview only, nothing is sent. In your app, this arrives as an SDK event you forward to your PSA, CMMS or webhook.
      </p>
    </div>
  )
}

// ── Where the data went ──────────────────────────────────────────────────────

interface HostRow { host: string; kind: string; count: number }

function describe(host: string, self: string): string {
  if (host === self) return 'this site (app + sample file)'
  if (/posthog\.com$/.test(host)) return 'anonymous usage stats, no file data'
  return 'third party'
}

export function DataFlow({ frameRef, active }: { frameRef: RefObject<HTMLIFrameElement | null>; active: boolean }) {
  const [rows, setRows] = useState<HostRow[] | null>(null)

  useEffect(() => {
    if (!active) { setRows(null); return }
    // Cumulative: entries are counted then cleared, so the frame's 250-entry
    // Resource Timing buffer never fills and hides a later request.
    const counts = new Map<string, number>()
    const read = () => {
      try {
        const win = frameRef.current?.contentWindow
        if (!win) return
        const self = window.location.host
        for (const e of win.performance.getEntriesByType('resource')) {
          let host = ''
          try { host = new URL(e.name).host } catch { continue }
          if (!host) continue
          counts.set(host, (counts.get(host) ?? 0) + 1)
        }
        win.performance.clearResourceTimings()
        setRows([...counts].map(([host, count]) => ({ host, count, kind: describe(host, self) }))
          .sort((a, b) => (a.host === self ? -1 : b.host === self ? 1 : b.count - a.count)))
      } catch {
        setRows(null)
      }
    }
    read()
    const t = window.setInterval(read, 1000)
    return () => window.clearInterval(t)
  }, [active, frameRef])

  if (!active || !rows) return null
  const self = window.location.host
  const others = rows.filter((r) => r.host !== self && !/posthog\.com$/.test(r.host))
  return (
    <div className="rounded-lg border border-[var(--border)] bg-[var(--surface)] px-3 py-2.5">
      <p className="text-[13px] font-medium text-[var(--text)]">Where the data went</p>
      <ul className="mt-1.5 space-y-1 text-[12px] text-[var(--text-dim)]">
        {rows.map((r) => (
          <li key={r.host} className="flex justify-between gap-3">
            <span className="truncate"><span className="text-[var(--text)]">{r.host}</span> · {r.kind}</span>
            <span className="flex-none tabular-nums">{r.count}</span>
          </li>
        ))}
      </ul>
      <p className="mt-1.5 text-[12px] text-[var(--text-faint)]">
        {others.length === 0
          ? 'Measured live in this frame. The model was read on your device; no file was sent to a third party.'
          : 'Measured live in this frame.'}
      </p>
    </div>
  )
}

// ── Pilot ideas ──────────────────────────────────────────────────────────────

export type Role = 'msp' | 'isv' | 'ops'

interface Idea { title: string; line: string; status: 'Live' | 'Pilot'; href?: string }

const IDEAS: Record<Role, Idea[]> = {
  msp: [
    { title: 'Client site viewer', line: 'Every building of a client in one browser view. Nothing to deploy.', status: 'Live', href: '/?scene=/scenes/barcelona-placa-catalunya.scene.json' },
    { title: 'Tap an asset, open a ticket', line: 'The tap you just tried, wired to your PSA.', status: 'Pilot' },
    { title: 'Live feeds on the model', line: 'Real-time status on the element it belongs to, like Helsinki’s bus bays.', status: 'Live', href: '/?scene=/scenes/helsinki-rautatientori.scene.json' },
  ],
  isv: [
    { title: '3D tab in your product', line: 'One iframe, typed SDK, events back.', status: 'Live', href: '/sdk/' },
    { title: 'Data checks as a feature', line: 'File quality score inside your workflow.', status: 'Live', href: '/ifc-validator/' },
    { title: 'White-label viewer', line: 'Your brand, your domain.', status: 'Pilot' },
  ],
  ops: [
    { title: 'Find any asset', line: 'Search, tap, see its data and ID.', status: 'Live' },
    { title: 'Live city context', line: 'Live transit around a site, on the 3D city.', status: 'Live', href: '/?scene=/scenes/tokyo-tochomae.scene.json' },
    { title: 'Maintenance by location', line: 'Work orders pinned to the element they are about.', status: 'Pilot' },
  ],
}

export function PilotIdeas({ role }: { role: Role | null }) {
  const list = IDEAS[role ?? 'msp']
  return (
    <ul className="grid gap-2.5 sm:grid-cols-3">
      {list.map((i) => {
        const inner = (
          <>
            <span className={`inline-block rounded px-1.5 py-0.5 text-[11px] font-semibold uppercase tracking-wide ${
              i.status === 'Live' ? 'border border-[var(--ok)] text-[var(--ok)]' : 'border border-[var(--warn)] text-[var(--warn)]'
            }`}>{i.status === 'Live' ? 'Live' : 'Pilot idea'}</span>
            <span className="mt-1.5 block text-[16px] font-medium text-[var(--text)]">{i.title}{i.href ? ' →' : ''}</span>
            <span className="mt-0.5 block text-[14px] leading-snug text-[var(--text-dim)]">{i.line}</span>
          </>
        )
        return (
          <li key={i.title} className="rounded-xl border border-[var(--border)] bg-[var(--surface)] p-3.5">
            {i.href ? <a href={i.href} target="_blank" rel="noopener" className="block">{inner}</a> : inner}
          </li>
        )
      })}
    </ul>
  )
}

// ── What I'm looking for ─────────────────────────────────────────────────────

export type Intent = 'pilot' | 'integration' | 'partner' | 'invest'

export const INTENTS: Record<Intent, string> = {
  pilot: 'A pilot for a client',
  integration: 'Integrate it in our product',
  partner: 'Partner or resell',
  invest: 'Invest or support',
}
