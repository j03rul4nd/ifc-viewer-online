// Client links (Pro, dark): the model + report for a client, no account, with
// an expiry and an optional password. Sample data; nothing is created.

import { useState } from 'react'
import { Primary, Quiet, Danger, Dialog, DataList, Empty, Field, Toggle, inputClass, Dot } from '../../ui'
import { SAMPLE_LINKS, TODAY, linkState, type ClientLink } from './pro-sample'
import { useP } from './pro-i18n'
import ClientView from './ClientView'

const addDays = (iso: string, days: number) => new Date(Date.parse(iso) + days * 864e5).toISOString().slice(0, 10)

export function linkErrors(f: { label: string; password: boolean; secret: string; expiry: string; date: string }, today = TODAY): string[] {
  const e: string[] = []
  if (f.label.trim().length < 2) e.push('Give the link a name you will recognise.')
  if (f.password && f.secret.length < 8) e.push('The password needs at least 8 characters.')
  if (f.expiry === 'date' && (!f.date || f.date <= today)) e.push('Pick a date after today.')
  return e
}

function NewLinkDialog({ versions, preset, onClose, onCreate }: { versions: string[]; preset?: string; onClose: () => void; onCreate: (l: ClientLink) => void }) {
  const p = useP()
  const [f, setF] = useState({ label: preset ?? '', version: 'latest', expiry: '30', date: '', password: true, secret: '', download: false, report: true, more: false })
  const [touched, setTouched] = useState(false)
  const errors = linkErrors(f)
  const create = () => {
    setTouched(true)
    if (errors.length) return
    onCreate({ id: `lk_${Math.random().toString(16).slice(2, 6)}`, label: f.label, project: 'hospital', version: f.version, expires: f.expiry === 'never' ? null : f.expiry === 'date' ? f.date : addDays(TODAY, Number(f.expiry)), password: f.password, download: f.download, views: 0 })
  }
  return (
    <Dialog title={p('New client link')} onClose={onClose}
      footer={<><Quiet onClick={onClose}>{p('Cancel')}</Quiet><Primary onClick={create}>{p('Create link')}</Primary></>}>
      <div className="grid gap-3 sm:grid-cols-2">
        <Field label={p('Name')} className="sm:col-span-2"><input className={inputClass} value={f.label} placeholder={p('Site management — review v4')} onChange={(e) => setF({ ...f, label: e.target.value })} /></Field>
        <Field label={p('Version')}>
          <select className={inputClass} value={f.version} onChange={(e) => setF({ ...f, version: e.target.value })}>
            <option value="latest">{p('Always the latest')}</option>
            {versions.map((v) => <option key={v} value={v}>{v}</option>)}
          </select>
        </Field>
        <Field label={p('Expires')}>
          <select className={inputClass} value={f.expiry} onChange={(e) => setF({ ...f, expiry: e.target.value })}>
            <option value="7">{p('In 7 days')}</option><option value="30">{p('In 30 days')}</option><option value="90">{p('In 90 days')}</option>
            <option value="date">{p('On a date…')}</option><option value="never">{p('Never')}</option>
          </select>
        </Field>
        {f.expiry === 'date' && <Field label={p('Date')} className="sm:col-span-2"><input type="date" className={inputClass} value={f.date} onChange={(e) => setF({ ...f, date: e.target.value })} /></Field>}
        <div className="sm:col-span-2 flex items-center justify-between gap-3 min-h-[38px]">
          <span className="text-[13px]">{p('Ask for a password')}</span>
          <Toggle label={p('Ask for a password')} checked={f.password} onChange={(v) => setF({ ...f, password: v })} />
        </div>
        {f.password && <Field label={p('Password')} className="sm:col-span-2" hint={p('Send it by another channel, not with the link.')}><input type="text" autoComplete="off" className={inputClass} value={f.secret} onChange={(e) => setF({ ...f, secret: e.target.value })} /></Field>}
        <button type="button" className="sm:col-span-2 text-left text-[12.5px] text-[var(--text-dim)] hover:text-[var(--text)] min-h-[32px]" onClick={() => setF({ ...f, more: !f.more })}>{f.more ? '▾' : '▸'} {p('More options')}</button>
        {f.more && <>
          <div className="sm:col-span-2 flex items-center justify-between gap-3"><span className="text-[13px]">{p('Allow downloading the IFC')}</span><Toggle label={p('Allow downloading the IFC')} checked={f.download} onChange={(v) => setF({ ...f, download: v })} /></div>
          <div className="sm:col-span-2 flex items-center justify-between gap-3"><span className="text-[13px]">{p('Include the validation report')}</span><Toggle label={p('Include the validation report')} checked={f.report} onChange={(v) => setF({ ...f, report: v })} /></div>
        </>}
      </div>
      {touched && errors.length > 0 && <ul role="alert" className="mt-3 text-[12.5px] text-[var(--danger)] list-disc pl-5">{errors.map((e) => <li key={e}>{p(e)}</li>)}</ul>}
      <p className="mt-4 text-[12px] text-[var(--text-dim)]">{p('Your client sees the model and the report in the browser, without an account. You see each visit.')}</p>
    </Dialog>
  )
}

export default function ClientLinks({ versions, initial = SAMPLE_LINKS, newOpen, setNewOpen, preset }: { versions: string[]; initial?: ClientLink[]; newOpen: boolean; setNewOpen: (v: boolean) => void; preset?: string }) {
  const p = useP()
  const [links, setLinks] = useState<ClientLink[]>(initial)
  const [revoke, setRevoke] = useState<ClientLink | null>(null)
  const [copied, setCopied] = useState<string | null>(null)
  const [viewing, setViewing] = useState<ClientLink | null>(null)
  const update = (id: string, patch: Partial<ClientLink>) => setLinks((ls) => ls.map((l) => (l.id === id ? { ...l, ...patch } : l)))
  const STATE: Record<ReturnType<typeof linkState>, [string, string]> = { active: ['Active', 'var(--ok)'], expired: ['Expired', 'var(--warn)'], revoked: ['Revoked', 'var(--text-faint)'] }

  return (
    <div data-pro="client-links">
      <div className="flex items-center justify-between gap-3 mb-3">
        <p className="text-[12.5px] text-[var(--text-dim)]">{p('Model + report for your client, with expiry and password. Clients never pay.')}</p>
        {links.length > 0 && <Primary onClick={() => setNewOpen(true)}>{p('New link')}</Primary>}
      </div>
      {links.length === 0 ? (
        <Empty title={p('You have not shared this project yet')} body={p('A link opens the model and its report in any browser, no account or install. You choose the version, the expiry and the password.')} action={<Primary onClick={() => setNewOpen(true)}>{p('Create the first link')}</Primary>} />
      ) : (
        <DataList rows={links} rowKey={(l) => l.id}
          rowClassName={(l) => (linkState(l) === 'revoked' ? 'text-[var(--text-faint)]' : '')}
          primaryHeader={p('Link')}
          primary={(l) => <><p className="font-medium">{l.label}</p><p className="text-[11.5px] text-[var(--text-faint)]">{l.version === 'latest' ? p('Always the latest') : l.version} · {l.password ? p('Password') : p('No password')}{l.download ? ` · ${p('Download on')}` : ''}</p></>}
          columns={[
            { key: 'state', header: p('Status'), cell: (l) => { const [label, c] = STATE[linkState(l)]; return <span className="inline-flex items-center gap-1.5 text-[12px] whitespace-nowrap"><Dot color={c} />{p(label)}</span> } },
            { key: 'expires', header: p('Expires'), cell: (l) => <span className="tabular-nums text-[var(--text-dim)] whitespace-nowrap">{l.expires ?? p('Never')}</span> },
            { key: 'views', header: p('Visits'), hideOnPhone: true, cell: (l) => <span className="tabular-nums">{l.views}{l.lastView && <span className="block text-[11px] text-[var(--text-faint)]">{p('last {{when}}', { when: l.lastView })}</span>}</span> },
          ]}
          actions={(l) => {
            const st = linkState(l)
            if (st === 'revoked') return null
            if (st === 'expired') return <><Quiet onClick={() => setViewing(l)}>{p('See as client')}</Quiet><Quiet onClick={() => update(l.id, { expires: addDays(TODAY, 30) })}>{p('Extend 30 days')}</Quiet></>
            return <><Quiet onClick={() => setViewing(l)}>{p('See as client')}</Quiet><Quiet onClick={() => { void navigator.clipboard?.writeText(`https://www.ifcvieweronline.eu/s/${l.id}`).catch(() => {}); setCopied(l.id) }}>{copied === l.id ? p('Copied') : p('Copy link')}</Quiet><Quiet onClick={() => setRevoke(l)}>{p('Revoke')}</Quiet></>
          }} />
      )}
      {newOpen && <NewLinkDialog versions={versions} preset={preset} onClose={() => setNewOpen(false)} onCreate={(l) => { setLinks((ls) => [l, ...ls]); setNewOpen(false) }} />}
      {viewing && <ClientView link={viewing} onClose={() => setViewing(null)} />}
      {revoke && (
        <Dialog title={p('Revoke “{{name}}”?', { name: revoke.label })} onClose={() => setRevoke(null)}
          footer={<><Quiet onClick={() => setRevoke(null)}>{p('Cancel')}</Quiet><Danger onClick={() => { update(revoke.id, { revoked: true }); setRevoke(null) }}>{p('Revoke link')}</Danger></>}>
          <p className="text-[13px]">{p('Whoever has it stops seeing the model at once. You can create a new link later.')}</p>
        </Dialog>
      )}
    </div>
  )
}
