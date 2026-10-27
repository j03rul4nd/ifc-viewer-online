// Privacy & data: the GDPR rights as buttons, not as an email address in a
// policy. What we hold and for how long (art. 13), a copy of it (art. 15/20),
// erasure (art. 17) with its honest exceptions — invoices stay 6 years by tax
// law, certificates stay verifiable unless revoked — and the processors list.
// Design only: requests show their states without being sent.

import { useState } from 'react'
import { DATA_INVENTORY, type DataRequest } from '../sample-data'
import type { SectionProps } from '../registry'
import { Head, Panel, SettingGroup, SettingRow, Primary, Quiet, Danger, Dialog, Field, inputClass, DataList, Dot } from '../ui'

const PROCESSORS = [
  { name: 'Neon', role: 'Database', region: 'EU (Frankfurt)' },
  { name: 'Cloudflare', role: 'Cloud job workers and file storage', region: 'EU jurisdiction' },
  { name: 'Clerk', role: 'Sign-in', region: 'US · EU SCCs' },
  { name: 'Payment provider (merchant of record)', role: 'Payments, invoices, VAT', region: 'EU' },
  { name: 'PostHog', role: 'Product analytics, cookieless', region: 'EU (Frankfurt)' },
]

const REQUEST_LABEL: Record<DataRequest['kind'], string> = { export: 'Copy of your data', erase_files: 'Delete stored files', delete_account: 'Delete account' }

function DeleteAccountDialog({ email, onClose }: { email: string; onClose: () => void }) {
  const [step, setStep] = useState<'explain' | 'confirm' | 'scheduled'>('explain')
  const [typed, setTyped] = useState('')
  const [exportFirst, setExportFirst] = useState(true)
  if (step === 'scheduled') {
    return (
      <Dialog title="Deletion scheduled" onClose={onClose} footer={<Primary onClick={onClose}>Done</Primary>}>
        <p className="text-[13.5px]">Your account will be deleted on <b>2026-11-09</b>. Until then you can sign in and cancel the deletion from this page.</p>
        {exportFirst && <p className="mt-2 text-[12.5px] text-[var(--text-dim)]">We're preparing your copy first; the download link arrives by email.</p>}
        <p className="mt-2 text-[12.5px] text-[var(--text-dim)]">We emailed a confirmation to {email}.</p>
      </Dialog>
    )
  }
  if (step === 'confirm') {
    return (
      <Dialog title="Delete your account" onClose={onClose}
        footer={<><Quiet onClick={onClose}>Keep my account</Quiet><Danger disabled={typed.trim().toLowerCase() !== email} onClick={() => setStep('scheduled')}>Delete account</Danger></>}>
        <label className="flex items-start gap-2.5 text-[12.5px] mb-4">
          <input type="checkbox" checked={exportFirst} onChange={(e) => setExportFirst(e.target.checked)} className="mt-0.5 shrink-0" />
          <span>Email me a copy of my data before deleting it.</span>
        </label>
        <Field label={`Type ${email} to confirm`}>
          <input className={inputClass} value={typed} onChange={(e) => setTyped(e.target.value)} autoComplete="off" spellCheck={false} />
        </Field>
      </Dialog>
    )
  }
  return (
    <Dialog title="Delete your account?" onClose={onClose}
      footer={<><Quiet onClick={onClose}>Cancel</Quiet><Danger onClick={() => setStep('confirm')}>Continue</Danger></>}>
      <p className="text-[13px] font-medium">After 14 days we delete:</p>
      <ul className="mt-2 space-y-1 text-[12.5px] text-[var(--text-dim)]">
        <li>· Your profile, projects, deliveries, scores and issue lists</li>
        <li>· Stored and corrected IFC files, support conversations</li>
        <li>· Unused credits — they are not refunded after the 14-day withdrawal period</li>
      </ul>
      <p className="mt-4 text-[13px] font-medium">We have to keep:</p>
      <ul className="mt-2 space-y-1 text-[12.5px] text-[var(--text-dim)]">
        <li>· Invoices, for 6 years (Spanish tax law), with your billing details only</li>
        <li>· Certificates you didn't revoke: the file hash and result, so links your clients hold keep working. Revoke them first if you prefer.</li>
      </ul>
      <p className="mt-4 text-[12px] text-[var(--text-faint)]">Your plan is cancelled now; nothing more is charged.</p>
    </Dialog>
  )
}

export default function Privacy({ data, actions }: SectionProps) {
  const [requests, setRequests] = useState(data.dataRequests)
  const [eraseOpen, setEraseOpen] = useState(false)
  const [deleteOpen, setDeleteOpen] = useState(false)
  const pendingExport = requests.some((r) => r.kind === 'export' && r.status === 'processing')
  const request = (kind: DataRequest['kind']) =>
    setRequests([{ id: `D-${105 + requests.length}`, kind, requestedAt: '2026-10-26', status: 'processing' }, ...requests])

  return (
    <>
      <Head title="Privacy & data" sub="What we keep about you, where, for how long — and how to take it with you or have it deleted. No email needed for any of it." />

      <SettingGroup title="Your rights">
        <SettingRow title="Get a copy of your data" detail="Profile, projects, scores, issues, certificates, credit history and support tickets as JSON + CSV. Ready within 24 h; the link lasts 7 days.">
          <Primary disabled={pendingExport} onClick={() => request('export')}>{pendingExport ? 'Preparing…' : 'Request copy'}</Primary>
        </SettingRow>
        <SettingRow title="Delete stored files now" detail="Removes every IFC file still on our servers (cloud job inputs and corrected files). Scores and history stay.">
          <Quiet onClick={() => setEraseOpen(true)}>Delete files</Quiet>
        </SettingRow>
        <SettingRow title="Correct your data" detail="Name, company and email are editable in Settings; for anything else, ask us.">
          <Quiet onClick={() => actions.go('settings')}>Open settings</Quiet>
          <Quiet onClick={() => actions.contact('data_request')}>Ask us</Quiet>
        </SettingRow>
        <SettingRow title="Product analytics" detail="Cookieless and anonymous. Turning it off stops even that, in every browser where you sign in.">
          <Quiet>Opt out</Quiet>
        </SettingRow>
      </SettingGroup>

      {requests.length > 0 && (
        <section className="mb-6">
          <DataList
            rows={requests}
            rowKey={(r) => r.id}
            primaryHeader="Request"
            primary={(r) => <><p className="font-medium">{REQUEST_LABEL[r.kind]}</p><p className="text-[11.5px] text-[var(--text-faint)]">{r.id} · {r.requestedAt}</p></>}
            columns={[
              { key: 'status', header: 'Status', cell: (r) => (
                <span className="inline-flex items-center gap-1.5 text-[12px] whitespace-nowrap">
                  <Dot color={r.status === 'processing' ? 'var(--text-dim)' : 'var(--ok)'} />
                  {r.status === 'processing' ? 'Processing' : r.status === 'ready' ? `Ready · until ${r.expiresAt}` : 'Done'}
                </span>) },
            ]}
            actions={(r) => (r.status === 'ready' && r.kind === 'export' ? <Quiet>Download</Quiet> : null)}
          />
        </section>
      )}

      <section className="mb-6">
        <h2 className="text-[12px] uppercase tracking-[0.08em] text-[var(--text-faint)] mb-2">What we hold</h2>
        <DataList
          rows={DATA_INVENTORY}
          rowKey={(r) => r.what}
          primaryHeader="Data"
          primary={(r) => <span className="font-medium">{r.what}</span>}
          columns={[
            { key: 'where', header: 'Where', wide: true, cell: (r) => <span className="text-[var(--text-dim)]">{r.where}</span> },
            { key: 'kept', header: 'Kept', wide: true, cell: (r) => <span className="text-[var(--text-dim)] whitespace-normal">{r.kept}</span> },
          ]}
        />
        <p className="mt-2 text-[12px] text-[var(--text-dim)]">The free viewer never uploads your models: files opened there stay in your browser and are not on this list.</p>
      </section>

      <section className="mb-6">
        <h2 className="text-[12px] uppercase tracking-[0.08em] text-[var(--text-faint)] mb-2">Who processes it for us</h2>
        <Panel>
          <ul className="divide-y divide-[var(--border)] text-[13px]">
            {PROCESSORS.map((p) => (
              <li key={p.name} className="px-4 py-2.5 flex flex-col sm:flex-row sm:items-center gap-0.5 sm:gap-3">
                <span className="font-medium sm:w-[260px] shrink-0">{p.name}</span>
                <span className="flex-1 text-[var(--text-dim)]">{p.role}</span>
                <span className="text-[12px] text-[var(--text-faint)]">{p.region}</span>
              </li>
            ))}
          </ul>
        </Panel>
        <p className="mt-2 text-[12px] text-[var(--text-dim)]">Questions or a complaint: privacy@ifcvieweronline.eu. You can also contact the Spanish Data Protection Agency (AEPD).</p>
      </section>

      <SettingGroup title="Delete account" tone="danger">
        <SettingRow title="Delete your account and all your data" detail="Cancels your plan now and deletes everything after 14 days, except what the law makes us keep.">
          <Danger onClick={() => setDeleteOpen(true)}>Delete account…</Danger>
        </SettingRow>
      </SettingGroup>

      {eraseOpen && (
        <Dialog title="Delete stored files?" onClose={() => setEraseOpen(false)}
          footer={<><Quiet onClick={() => setEraseOpen(false)}>Cancel</Quiet><Danger onClick={() => { request('erase_files'); setEraseOpen(false) }}>Delete files</Danger></>}>
          <p className="text-[13px]">Corrected IFC files you haven't downloaded will be gone. Running jobs are stopped and their credits returned.</p>
        </Dialog>
      )}
      {deleteOpen && <DeleteAccountDialog email={data.account.email} onClose={() => setDeleteOpen(false)} />}
    </>
  )
}
