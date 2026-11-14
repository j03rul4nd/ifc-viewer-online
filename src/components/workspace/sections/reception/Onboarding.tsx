// First-use checklist for the receiving company (workspace mode only). Every
// step is read back from the server: done means the data is there (a project,
// a supplier, a validated delivery), or — for the two steps only a person can
// know — that someone ticked it. Progress and "hide" are saved on the server,
// so the next admin sees the same list.

import { useCallback, useEffect, useState } from 'react'
import { Banner, CopyField, Dialog, Field, Panel, Primary, Quiet, inputClass } from '../../ui'
import { deliverFile, paidApi, type ApiOnboarding, type ApiOnboardingStep } from '../../../../lib/cloud/paid-client'
import { originatorOf } from './live'
import type { RxProject } from './sample'
import type { Rx } from './strings'

/** A small, real public IFC (Port de Barcelona library) for the test delivery. */
export const SAMPLE_IFC = '/models/port-bcn/APBCN-URB-CER-Cerramiento_Horizontal_Tubular.ifc'
export const TEST_SUPPLIER = 'Test supplier'

const COPY: Record<ApiOnboardingStep, { title: string; body: string }> = {
  project: { title: 'Create the project', body: 'Its name, its code for file names and the score a delivery needs.' },
  requirements: { title: 'Set the requirements', body: 'Pick a template (EIR profile) or upload your own IDS; suppliers are checked against it.' },
  suppliers: { title: 'Invite the suppliers', body: 'Each gets an upload link of their own, no account needed. Copy the message we prepare and send it yourself.' },
  connect: { title: 'Connect a folder or a webhook', body: 'Deliveries can also arrive from a SharePoint or Drive folder, and each verdict can reach your tools by webhook.' },
  first_delivery: { title: 'Send a test delivery', body: 'A sample IFC goes through the same checks a supplier’s would, so you see a verdict before anyone delivers.' },
}

/** Strings looked up from COPY (not literal rx calls): listed for the translation check. */
export const ONBOARDING_LABELS = Object.values(COPY).flatMap((c) => [c.title, c.body])

export function Onboarding({ rx, project, tick, onCreateProject, onRequirements, onInvite, onConnect, onDelivered }: {
  rx: Rx; project: RxProject | null; tick: number
  onCreateProject: () => void; onRequirements: () => void; onInvite: () => void; onConnect: () => void; onDelivered: () => void
}) {
  const [state, setState] = useState<ApiOnboarding | null>(null)
  const [busy, setBusy] = useState<ApiOnboardingStep | null>(null)
  const [message, setMessage] = useState<string | null>(null)
  const load = useCallback(() => { void paidApi.onboarding().then((r) => { if (r.ok) setState(r.value) }) }, [])
  useEffect(() => { load() }, [load, tick])

  if (!state) return null
  if (state.dismissed) {
    return state.done < state.total
      ? <p className="text-[12px] text-[var(--text-faint)] mb-4"><button className="underline" onClick={() => void paidApi.dismissOnboarding(false).then(load)}>{rx('Show the getting-started list ({{done}} of {{total}})', { done: state.done, total: state.total })}</button></p>
      : null
  }

  async function mark(step: ApiOnboardingStep, done: boolean) {
    setBusy(step); await paidApi.markOnboarding(step, done); setBusy(null); load()
  }

  /** The test delivery: a "Test supplier" of this project delivers a real sample IFC with a valid ISO name. */
  async function testDelivery() {
    if (!project?.slug) return
    setBusy('first_delivery'); setMessage(null)
    try {
      const sups = await paidApi.suppliers()
      let token: string | null = null
      if (!sups.ok || !sups.value.suppliers.some((s) => s.name === TEST_SUPPLIER)) {
        const s = await paidApi.createSupplier(TEST_SUPPLIER, 'TEST')
        if (!s.ok) { setMessage(rx('Could not save: {{error}}. Nothing changed.', { error: s.error.code })); return }
        token = s.value.token
      } else {
        const existing = sups.value.suppliers.find((s) => s.name === TEST_SUPPLIER)!
        const r = await paidApi.rotateSupplier(existing.id)
        if (!r.ok) { setMessage(rx('Could not save: {{error}}. Nothing changed.', { error: r.error.code })); return }
        token = r.value.token
      }
      const bytes = await (await fetch(SAMPLE_IFC)).arrayBuffer()
      // A fresh copy each time (a comment line), so a second test is a new delivery, not a replay.
      const stamp = new TextEncoder().encode(`\n/* test ${Date.now()} */\n`)
      const body = new Uint8Array(bytes.byteLength + stamp.byteLength); body.set(new Uint8Array(bytes)); body.set(stamp, bytes.byteLength)
      const name = `${project.code}-${originatorOf(TEST_SUPPLIER)}-ZZ-XX-M3-A-${String(Date.now() % 10000).padStart(4, '0')}-S2-P01.ifc`
      const d = await deliverFile(token, project.slug, name, body.buffer, 'page')
      if (!d.ok) { setMessage(rx('Could not send it: {{reason}}', { reason: d.error.message ?? d.error.code })); return }
      setMessage(rx('Test delivery sent as {{file}}. Its verdict appears in the inbox in a few seconds.', { file: name }))
      onDelivered()
    } finally { setBusy(null); load() }
  }

  const actions: Record<ApiOnboardingStep, React.ReactNode> = {
    project: <Primary onClick={onCreateProject}>{rx('Create the project')}</Primary>,
    requirements: <><Quiet onClick={onRequirements}>{rx('Open the requirements')}</Quiet><Quiet disabled={busy === 'requirements'} onClick={() => void mark('requirements', true)}>{rx('Mark as done')}</Quiet></>,
    suppliers: <Quiet onClick={onInvite} disabled={!project}>{rx('Invite a supplier')}</Quiet>,
    connect: <><Quiet onClick={onConnect}>{rx('Open integrations')}</Quiet><Quiet disabled={busy === 'connect'} onClick={() => void mark('connect', true)}>{rx('I will do it later')}</Quiet></>,
    first_delivery: <Quiet onClick={() => void testDelivery()} disabled={!project?.slug || busy === 'first_delivery'}>{busy === 'first_delivery' ? rx('Sending…') : rx('Send a test delivery')}</Quiet>,
  }
  const next = state.steps.find((s) => !s.done)?.key

  return (
    <Panel className="p-4 sm:p-5 mb-5">
      <div className="flex flex-wrap items-center justify-between gap-2 mb-1">
        <h2 className="text-[14px] font-medium">{rx('Get started')} <span className="text-[12px] text-[var(--text-dim)] font-normal tabular-nums">{rx('{{done}} of {{total}}', { done: state.done, total: state.total })}</span></h2>
        <Quiet onClick={() => void paidApi.dismissOnboarding(true).then(load)}>{rx('Hide')}</Quiet>
      </div>
      <div className="h-1.5 rounded-full bg-[var(--surface-2)] mb-4 overflow-hidden" role="progressbar" aria-valuemin={0} aria-valuemax={state.total} aria-valuenow={state.done} aria-label={rx('Get started')}>
        <div className="h-full bg-[var(--accent)]" style={{ width: `${(state.done / state.total) * 100}%` }} />
      </div>
      <ol className="space-y-3">
        {state.steps.map((s, i) => (
          <li key={s.key} className="flex gap-3">
            <span aria-hidden className={`mt-0.5 shrink-0 grid place-items-center w-5 h-5 rounded-full text-[11px] ${s.done ? 'bg-[var(--ok)] text-white' : 'border border-[var(--border)] text-[var(--text-dim)]'}`}>{s.done ? '✓' : i + 1}</span>
            <div className="min-w-0 flex-1">
              <p className={`text-[13px] ${s.done ? 'text-[var(--text-dim)] line-through decoration-[var(--border)]' : 'font-medium'}`}>{rx(COPY[s.key].title)}<span className="sr-only">{s.done ? ` — ${rx('done')}` : ''}</span></p>
              {!s.done && s.key === next && <>
                <p className="text-[12.5px] text-[var(--text-dim)] mt-0.5 mb-2">{rx(COPY[s.key].body)}</p>
                <div className="flex flex-wrap gap-2">{actions[s.key]}</div>
              </>}
              {s.done && s.by === 'mark' && <button className="text-[11.5px] text-[var(--text-faint)] underline" onClick={() => void mark(s.key, false)}>{rx('Undo')}</button>}
            </div>
          </li>
        ))}
      </ol>
      {message && <p className="text-[12.5px] mt-3" role="status">{message}</p>}
    </Panel>
  )
}

/** The message a receiver copies to a supplier while no e-mail is sent for real. */
export function invitationText(rx: Rx, o: { supplier: string; project: string; company: string; link: string; minScore: number; code: string }): string {
  return [
    rx('Subject: Deliveries for {{project}} — your upload link', o),
    '',
    rx('Hello {{supplier}},', o),
    '',
    rx('We receive the IFC models for {{project}} through a delivery page. Your own link (no account needed):', o),
    o.link,
    '',
    rx('Before you deliver, the page checks your file for free: the score it needs ({{minScore}}), the file name rule (it starts with {{code}}) and whether the file is complete. If something fails it tells you how to fix it.', o),
    rx('Keep this link to yourself: anyone with it can deliver in your name. If it leaks, tell us and we will send a new one.', o),
    '',
    rx('Thank you,', o),
    o.company,
  ].join('\n')
}

/** After inviting: the link and a ready-to-send message (editable), shown once. */
export function InvitationDialog({ rx, text, link, supplier, onClose }: { rx: Rx; text: string; link: string; supplier: string; onClose: () => void }) {
  const [body, setBody] = useState(text)
  const [copied, setCopied] = useState(false)
  return (
    <Dialog title={rx('{{name}} invited', { name: supplier })} onClose={onClose} size="lg" footer={<>
      <Quiet onClick={onClose}>{rx('Close')}</Quiet>
      <Primary onClick={() => { void navigator.clipboard?.writeText(body); setCopied(true); setTimeout(() => setCopied(false), 1500) }}>{copied ? rx('Copied') : rx('Copy the message')}</Primary>
    </>}>
      <Banner tone="warn" title={rx('Shown only once')}>{rx('We keep only a fingerprint of the link. Copy it now; if it gets lost, make a new one from the supplier’s card.')}</Banner>
      <Field label={rx('Upload link')}><CopyField value={link} label={rx('Upload link')} /></Field>
      <Field label={rx('Message to send')} hint={rx('No e-mail is sent yet: paste it into your own e-mail or chat. You can edit it here first.')}>
        <textarea aria-label={rx('Message to send')} value={body} onChange={(e) => setBody(e.target.value)} rows={12} className={`${inputClass} !h-auto font-[inherit] text-[12.5px] leading-[1.5]`} />
      </Field>
    </Dialog>
  )
}
