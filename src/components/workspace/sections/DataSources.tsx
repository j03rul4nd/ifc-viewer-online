// Data sources: everything a scene can read, saved once for the account.
//   Connections  where data comes from and how we read it
//   Credentials  the keys and passwords those connections use (the vault)
//   API keys     keys for YOUR systems to call us (CI, Node-RED, your app)
//   Activity     what each connection did, in plain words
// The explainer at the top is the mental model in three boxes, so nobody
// needs a video to understand defaults vs. per-scene changes.

import { useState } from 'react'
import { CREDENTIAL_KINDS, protocolById, MODES } from '../../../lib/connections/protocols'
import { describeSchedule } from '../../../lib/connections/schedule'
import {
  SAMPLE_CONNECTIONS, SAMPLE_CREDENTIALS, SAMPLE_API_KEYS, SAMPLE_INGEST_LOG, API_SCOPES,
  type ConnectionHealth, type SampleConnection, type ApiScope,
} from '../connections-sample'
import type { SectionProps } from '../registry'
import {
  Head, Panel, Tabs, useSubTab, DataList, Primary, Quiet, Danger, Dot, Empty, Dialog, Field, CopyField,
  Toggle, Hint, inputClass, fmtInt,
} from '../ui'
import ConnectionWizard from '../ConnectionWizard'

const TABS = [
  { id: 'connections', label: 'Connections' },
  { id: 'credentials', label: 'Credentials' },
  { id: 'api-keys', label: 'API keys' },
  { id: 'activity', label: 'Activity' },
] as const
type Tab = (typeof TABS)[number]['id']

export const HEALTH: Record<ConnectionHealth, [string, string]> = {
  ok: ['Working', 'var(--ok)'], warning: ['Working, with errors', 'var(--warn)'], failing: ['Failing', 'var(--danger)'],
  paused: ['Paused', 'var(--text-faint)'], waiting: ['Waiting for first data', 'var(--text-dim)'],
}

function Health({ h }: { h: ConnectionHealth }) {
  const loud = h === 'failing' || h === 'warning'
  return <span className="inline-flex items-center gap-1.5 text-[12px] whitespace-nowrap" style={{ color: loud ? HEALTH[h][1] : 'var(--text)' }}><Dot color={HEALTH[h][1]} />{HEALTH[h][0]}</span>
}

function HowItWorks() {
  const boxes = [
    ['1', 'Save a connection once', 'Endpoint, credentials, how to read it and how often.'],
    ['2', 'New scenes start with it', 'Mark it “on in new scenes” and you never set it up again.'],
    ['3', 'Change it per scene', 'Off, slower, or filtered in one scene — the saved one stays as it is.'],
  ]
  return (
    <ol className="grid gap-2 sm:grid-cols-3 mb-6" data-tour="data-explainer">
      {boxes.map(([n, t, b]) => (
        <li key={n} className="rounded-[10px] border border-[var(--border)] p-3 flex gap-3">
          <span className="w-6 h-6 shrink-0 grid place-items-center rounded-full border border-[var(--border)] text-[11.5px] text-[var(--text-dim)]">{n}</span>
          <span><span className="block text-[13px] font-medium">{t}</span><span className="block text-[12px] text-[var(--text-dim)]">{b}</span></span>
        </li>
      ))}
    </ol>
  )
}

function ConnectionDetail({ c, onClose, onReport }: { c: SampleConnection; onClose: () => void; onReport: () => void }) {
  const p = protocolById(c.protocol)
  const cred = SAMPLE_CREDENTIALS.find((x) => x.id === c.credentialId)
  const [inNew, setInNew] = useState(c.defaultInNewScenes)
  const log = SAMPLE_INGEST_LOG.filter((e) => e.connectionId === c.id)
  return (
    <Dialog title={c.name} onClose={onClose} size="lg"
      footer={<><Danger>Delete</Danger><Quiet>{c.health === 'paused' ? 'Resume' : 'Pause'}</Quiet><Quiet>Edit</Quiet><Primary>Run now</Primary></>}>
      <div className="flex flex-wrap items-center gap-3 mb-4"><Health h={c.health} />{c.note && <span className="text-[12px] text-[var(--text-dim)]">{c.note}</span>}</div>
      {c.health === 'failing' && (
        <div className="mb-4 rounded-[10px] border p-3 text-[12.5px]" style={{ borderColor: 'var(--danger)' }}>
          <p className="font-medium">The database rejected the password.</p>
          <p className="text-[var(--text-dim)] mt-0.5">Usually it was rotated. Update “{cred?.name}” under Credentials — every connection using it recovers at once.</p>
          <div className="mt-2 flex flex-wrap gap-2"><Primary>Update credential</Primary><Quiet onClick={onReport}>It's not that — tell support</Quiet></div>
        </div>
      )}
      <dl className="grid grid-cols-[auto_1fr] gap-x-4 gap-y-1.5 text-[12.5px]">
        <dt className="text-[var(--text-faint)]">Arrives</dt><dd>{MODES.find((m) => m.id === c.mode)?.title} · {p.name}</dd>
        <dt className="text-[var(--text-faint)]">Endpoint</dt><dd className="font-mono text-[12px] break-all">{c.endpoint}</dd>
        <dt className="text-[var(--text-faint)]">Credential</dt><dd>{cred ? `${cred.name} (${cred.preview})` : 'None'}</dd>
        {c.schedule && <><dt className="text-[var(--text-faint)]">When</dt><dd>{describeSchedule(c.schedule)}</dd></>}
        <dt className="text-[var(--text-faint)]">Reads</dt><dd>{c.mapping.values.join(', ')} · {c.mapping.place.kind === 'ifc' ? `on IFC elements by ${c.mapping.place.matchBy}` : c.mapping.place.kind === 'latlon' ? 'as map points' : 'as a table'}</dd>
        <dt className="text-[var(--text-faint)]">Last 24 h</dt><dd className="tabular-nums">{fmtInt(c.records24h)} records{c.lastEvent && ` · last ${c.lastEvent}`}</dd>
      </dl>
      <div className="mt-4 flex items-center gap-4 rounded-[10px] border border-[var(--border)] px-4 py-3">
        <div className="flex-1"><p className="text-[13px] font-medium">On in every new scene</p><p className="text-[12px] text-[var(--text-dim)]">Existing scenes keep what they have.</p></div>
        <Toggle label="On in every new scene" checked={inNew} onChange={setInNew} />
      </div>
      {log.length > 0 && (
        <ul className="mt-4 space-y-1 text-[12px]">
          {log.map((e, i) => <li key={i} className="flex gap-3"><span className="text-[var(--text-faint)] tabular-nums shrink-0">{e.at}</span><span style={{ color: e.level === 'error' ? 'var(--danger)' : e.level === 'warn' ? 'var(--warn)' : undefined }}>{e.message}</span></li>)}
        </ul>
      )}
    </Dialog>
  )
}

function NewApiKeyDialog({ onClose }: { onClose: () => void }) {
  const [name, setName] = useState('')
  const [scopes, setScopes] = useState<ApiScope[]>(['validate'])
  const [expiry, setExpiry] = useState('365')
  const [created, setCreated] = useState(false)
  if (created) {
    return (
      <Dialog title="Copy your key now" onClose={onClose} footer={<Primary onClick={onClose}>I've stored it</Primary>}>
        <p className="text-[13px] mb-3">This is the only time we show it. Store it in your CI secrets or password manager; if you lose it, revoke it and make another.</p>
        <CopyField label="API key" value="ivo_live_8Kq2Zm1VbT4xR9pLc6NsWd0Ha3Ye" />
        <Field label="Try it" className="mt-4">
          <CopyField label="Example request" value={'curl -H "Authorization: Bearer ivo_live_8Kq2…" -F file=@model.ifc https://api.ifcvieweronline.eu/v1/validate'} />
        </Field>
      </Dialog>
    )
  }
  return (
    <Dialog title="New API key" onClose={onClose}
      footer={<><Quiet onClick={onClose}>Cancel</Quiet><Primary disabled={name.trim().length < 2 || scopes.length === 0} onClick={() => setCreated(true)}>Create key</Primary></>}>
      <div className="grid gap-4">
        <Field label="What is it for?" hint="Shown in the list and in the audit log."><input className={inputClass} value={name} placeholder="GitHub Actions — validate on push" onChange={(e) => setName(e.target.value)} /></Field>
        <fieldset>
          <legend className="text-[12px] text-[var(--text-dim)] mb-1.5">What can it do? <Hint>Give each system only what it needs. A leaked key with “Send data” only can't read your projects.</Hint></legend>
          <div className="space-y-1.5">
            {API_SCOPES.map((s) => (
              <label key={s.id} className="flex items-start gap-2.5 rounded-[9px] border border-[var(--border)] px-3 py-2 cursor-pointer">
                <input type="checkbox" className="mt-0.5" checked={scopes.includes(s.id)} onChange={(e) => setScopes(e.target.checked ? [...scopes, s.id] : scopes.filter((x) => x !== s.id))} />
                <span><span className="block text-[13px]">{s.label}</span><span className="block text-[11.5px] text-[var(--text-dim)]">{s.detail}</span></span>
              </label>
            ))}
          </div>
        </fieldset>
        <Field label="Expires">
          <select className={inputClass} value={expiry} onChange={(e) => setExpiry(e.target.value)}>
            <option value="30">In 30 days</option><option value="90">In 90 days</option><option value="365">In 1 year</option><option value="never">Never (not recommended)</option>
          </select>
        </Field>
      </div>
    </Dialog>
  )
}

export default function DataSources({ actions }: SectionProps) {
  const [tab, setTab] = useSubTab<Tab>('data', TABS)
  const [wizard, setWizard] = useState(false)
  const [open, setOpen] = useState<SampleConnection | null>(null)
  const [newKey, setNewKey] = useState(false)
  const [revoke, setRevoke] = useState<string | null>(null)
  const failing = SAMPLE_CONNECTIONS.filter((c) => c.health === 'failing').length

  return (
    <>
      <Head title="Data sources" sub="Sensors, APIs, databases and files your scenes read — set up once, reused everywhere."
        action={tab === 'api-keys' ? <Primary onClick={() => setNewKey(true)}>New API key</Primary> : <Primary onClick={() => setWizard(true)}>New connection</Primary>} />
      <Tabs label="Data sources" value={tab} onChange={setTab}
        tabs={TABS.map((t) => ({ ...t, count: t.id === 'connections' ? SAMPLE_CONNECTIONS.length : t.id === 'credentials' ? SAMPLE_CREDENTIALS.length : t.id === 'api-keys' ? SAMPLE_API_KEYS.length : undefined }))} />

      {tab === 'connections' && (
        <>
          <HowItWorks />
          {failing > 0 && <p className="mb-3 text-[12.5px]" style={{ color: 'var(--danger)' }}>{failing} connection{failing > 1 ? 's are' : ' is'} failing — open {failing > 1 ? 'them' : 'it'} to see why.</p>}
          {SAMPLE_CONNECTIONS.length === 0 ? (
            <Empty title="No connections yet" body="Connect a sensor broker, an API, a database or a webhook. It takes about two minutes and you test it before saving." action={<Primary onClick={() => setWizard(true)}>New connection</Primary>} />
          ) : (
            <DataList tour="connection-list"
              rows={SAMPLE_CONNECTIONS}
              rowKey={(c) => c.id}
              primaryHeader="Connection"
              primary={(c) => <><button onClick={() => setOpen(c)} className="font-medium text-left hover:underline">{c.name}</button><p className="text-[11.5px] text-[var(--text-faint)]">{protocolById(c.protocol).name}{c.schedule ? ` · ${describeSchedule(c.schedule).toLowerCase()}` : c.mode === 'stream' ? ' · live' : c.mode === 'push' ? ' · when your system sends' : ''}</p></>}
              columns={[
                { key: 'health', header: 'Status', cell: (c) => <Health h={c.health} /> },
                { key: 'records', header: 'Last 24 h', align: 'right', cell: (c) => <span className="tabular-nums">{fmtInt(c.records24h)}</span> },
                { key: 'scenes', header: 'New scenes', cell: (c) => <span className={c.defaultInNewScenes ? '' : 'text-[var(--text-faint)]'}>{c.defaultInNewScenes ? 'On by default' : 'Off'}</span> },
              ]}
              actions={(c) => <Quiet onClick={() => setOpen(c)}>Open</Quiet>}
            />
          )}
        </>
      )}

      {tab === 'credentials' && (
        <>
          <Panel tour="vault-note" className="p-4 mb-4 text-[12.5px] text-[var(--text-dim)]">
            Keys and passwords for the systems you read from. Encrypted at rest in the EU; we never show a secret again once saved — only its last four characters. Update one here and every connection using it picks it up.
            <span className="block mt-2 text-[11.5px] text-[var(--text-faint)]">Allow-list our gateway if your firewall needs it: 185.199.110.42, 185.199.111.42</span>
          </Panel>
          <DataList tour="credential-list"
            rows={SAMPLE_CREDENTIALS}
            rowKey={(c) => c.id}
            primaryHeader="Credential"
            primary={(c) => <><p className="font-medium">{c.name}</p><p className="text-[11.5px] text-[var(--text-faint)]">{CREDENTIAL_KINDS[c.kind].label} · <span className="font-mono">{c.preview}</span></p></>}
            columns={[
              { key: 'used', header: 'Used by', wide: true, cell: (c) => <span className="text-[var(--text-dim)]">{c.usedBy.map((id) => SAMPLE_CONNECTIONS.find((x) => x.id === id)?.name).join(', ')}</span> },
              { key: 'last', header: 'Last used', hideOnPhone: true, cell: (c) => <span className="tabular-nums text-[var(--text-dim)]">{c.lastUsed ?? 'Never'}</span> },
              { key: 'exp', header: 'Expires', cell: (c) => c.expiresAt ? <span style={{ color: 'var(--warn)' }}>{c.expiresAt}</span> : <span className="text-[var(--text-faint)]">—</span> },
            ]}
            actions={() => <><Quiet>Replace secret</Quiet><Quiet>Delete</Quiet></>}
          />
        </>
      )}

      {tab === 'api-keys' && (
        <>
          <Panel className="p-4 mb-4 text-[12.5px] text-[var(--text-dim)]">
            Keys for your own systems to call us: validate models from CI, send readings from Node-RED, embed private scenes. Each key does only what you tick. <a className="text-[var(--accent)] hover:underline" href="/sdk/">API reference →</a>
          </Panel>
          <DataList tour="apikey-list"
            rows={SAMPLE_API_KEYS}
            rowKey={(k) => k.id}
            primaryHeader="Key"
            primary={(k) => <><p className="font-medium">{k.name}</p><p className="text-[11.5px] text-[var(--text-faint)] font-mono">{k.prefix}…</p></>}
            columns={[
              { key: 'scopes', header: 'Can', wide: true, cell: (k) => <span className="text-[var(--text-dim)]">{k.scopes.map((s) => API_SCOPES.find((x) => x.id === s)?.label).join(', ')}</span> },
              { key: 'last', header: 'Last used', hideOnPhone: true, cell: (k) => <span className="tabular-nums text-[var(--text-dim)]">{k.lastUsed ?? 'Never'}</span> },
              { key: 'exp', header: 'Expires', desktopOnly: true, cell: (k) => <span className="text-[var(--text-dim)]">{k.expiresAt ?? 'Never'}</span> },
            ]}
            actions={(k) => <Danger onClick={() => setRevoke(k.name)}>Revoke</Danger>}
          />
        </>
      )}

      {tab === 'activity' && (
        <DataList tour="activity-log"
          rows={SAMPLE_INGEST_LOG}
          rowKey={(e) => e.at + e.connectionId}
          primaryHeader="When"
          primary={(e) => <span className="tabular-nums text-[12.5px]">{e.at}</span>}
          columns={[
            { key: 'conn', header: 'Connection', wide: true, cell: (e) => SAMPLE_CONNECTIONS.find((c) => c.id === e.connectionId)?.name },
            { key: 'msg', header: 'What happened', wide: true, cell: (e) => <span className="whitespace-normal" style={{ color: e.level === 'error' ? 'var(--danger)' : e.level === 'warn' ? 'var(--warn)' : 'var(--text-dim)' }}>{e.message}</span> },
          ]}
        />
      )}

      {wizard && <ConnectionWizard credentials={SAMPLE_CREDENTIALS} onClose={() => setWizard(false)} />}
      {open && <ConnectionDetail c={open} onClose={() => setOpen(null)} onReport={() => { setOpen(null); actions.contact('bug', open.id) }} />}
      {newKey && <NewApiKeyDialog onClose={() => setNewKey(false)} />}
      {revoke && (
        <Dialog title="Revoke this key?" onClose={() => setRevoke(null)}
          footer={<><Quiet onClick={() => setRevoke(null)}>Cancel</Quiet><Danger onClick={() => setRevoke(null)}>Revoke now</Danger></>}>
          <p className="text-[13px]">“{revoke}” stops working immediately. Whatever uses it will get 401 errors until you give it a new key.</p>
        </Dialog>
      )}
    </>
  )
}
