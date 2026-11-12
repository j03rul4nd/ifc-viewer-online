// Client contacts in the workspace (local / cloud data mode): the server's list,
// with consent and its source, and unsubscribe. Nobody is mailed without
// consent and an unsubscribed contact never comes back (the server enforces
// both; this screen only shows and asks).

import { useEffect, useState } from 'react'
import { DataList, Field, Primary, Quiet, inputClass } from '../../ui'
import { paidApi, type ApiContact } from '../../../../lib/cloud/paid-client'
import type { Mx } from './model'

const LANGS = ['en', 'es', 'ca', 'fr', 'de', 'it', 'pt', 'ja', 'zh', 'th'] as const

export default function ContactsLive({ mx }: { mx: Mx }) {
  const [rows, setRows] = useState<ApiContact[] | null>(null)
  const [msg, setMsg] = useState<string | null>(null)
  const [f, setF] = useState({ email: '', name: '', lang: 'es', consent: '' })
  const [busy, setBusy] = useState(false)

  const load = () => void paidApi.contacts().then((r) => {
    if (r.ok) setRows(r.value.contacts)
    else setMsg(mx('Could not load the contacts ({{error}}).', { error: r.error.code }))
  })
  useEffect(load, []) // eslint-disable-line react-hooks/exhaustive-deps

  const add = async () => {
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(f.email.trim())) { setMsg(mx('Write a valid e-mail address.')); return }
    setBusy(true)
    const r = await paidApi.saveContact({ email: f.email.trim(), name: f.name.trim() || undefined, lang: f.lang, consent_source: f.consent.trim() || undefined })
    setBusy(false)
    if (!r.ok) { setMsg(mx('Not saved ({{error}}). Nothing changed.', { error: r.error.code })); return }
    setMsg(r.value.contact.unsubscribed_at ? mx('{{email}} unsubscribed earlier and stays out.', { email: r.value.contact.email })
      : r.value.contact.consent_at ? mx('{{email}} saved with consent.', { email: r.value.contact.email })
        : mx('{{email}} saved without consent: no message will be queued for them.', { email: r.value.contact.email }))
    setF({ email: '', name: '', lang: f.lang, consent: '' })
    load()
  }
  const unsubscribe = async (c: ApiContact) => {
    const r = await paidApi.unsubscribeContact(c.id)
    if (!r.ok) { setMsg(mx('Not saved ({{error}}). Nothing changed.', { error: r.error.code })); return }
    load()
  }

  return (
    <div data-mail="contacts-live" className="space-y-4">
      <div className="grid sm:grid-cols-4 gap-3 items-end">
        <Field label={mx('E-mail')}><input className={inputClass} type="email" value={f.email} onChange={(e) => setF({ ...f, email: e.target.value })} /></Field>
        <Field label={mx('Name')}><input className={inputClass} value={f.name} onChange={(e) => setF({ ...f, name: e.target.value })} /></Field>
        <Field label={mx('Language')}>
          <select className={inputClass} value={f.lang} onChange={(e) => setF({ ...f, lang: e.target.value })}>{LANGS.map((l) => <option key={l} value={l}>{l}</option>)}</select>
        </Field>
        <Field label={mx('Where consent comes from')}><input className={inputClass} placeholder={mx('Signed contract, form…')} value={f.consent} onChange={(e) => setF({ ...f, consent: e.target.value })} /></Field>
      </div>
      <Primary disabled={busy} onClick={() => void add()}>{mx('Add contact')}</Primary>
      {msg && <p role="status" className="text-[12.5px] text-[var(--text-dim)]">{msg}</p>}
      {rows && (
        <DataList rows={rows} rowKey={(c) => c.id} primaryHeader={mx('Contact')}
          primary={(c) => <><p className="font-medium">{c.name ?? c.email}</p><p className="text-[11.5px] text-[var(--text-faint)]">{c.email} · {c.lang}</p></>}
          columns={[
            { key: 'consent', header: mx('Consent'), cell: (c) => <span className="text-[12px]">{c.unsubscribed_at ? mx('Unsubscribed') : c.consent_at ? (c.consent_source ?? mx('Yes')) : mx('No consent')}</span> },
          ]}
          actions={(c) => (c.unsubscribed_at ? null : <Quiet onClick={() => void unsubscribe(c)}>{mx('Unsubscribe')}</Quiet>)} />
      )}
    </div>
  )
}
