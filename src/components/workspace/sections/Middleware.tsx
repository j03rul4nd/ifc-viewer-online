import { useState } from 'react'
import type { SectionProps } from '../registry'
import { Banner, CopyField, DataList, Danger, Dialog, Dot, Field, Head, Panel, Primary, Quiet, SectionLabel, Tabs, fmtInt, inputClass } from '../ui'
import { SoonBanner } from '../Soon'
import { useTx } from '../i18n'

type Kind = 'api' | 'cron' | 'etl'
type Status = 'running' | 'idle' | 'stopped' | 'failed'

interface Service {
  id: string; name: string; kind: Kind; image: string; repo: string; schedule: string; port: string
  memory: number; envKeys: string[]; origins: string; status: Status; gbHours: number; note?: string
}

const GATEWAY = 'https://api.ifcvieweronline.eu/mw/'
const QUOTA = { gbHours: 250, services: 4, requests: 1_000_000 }

const SAMPLE: Service[] = [
  { id: 'trains-api', name: 'Trains API', kind: 'api', image: 'ghcr.io/acme/trains-api:1.4', repo: 'https://github.com/acme/trains-api', schedule: '', port: '8080', memory: 256, envKeys: ['DATABASE_URL'], origins: 'https://www.ifcvieweronline.eu', status: 'running', gbHours: 118 },
  { id: 'stations-etl', name: 'Stations collector', kind: 'cron', image: 'ghcr.io/acme/stations-etl:2.0', repo: 'https://github.com/acme/stations-etl', schedule: '*/5 * * * *', port: '', memory: 256, envKeys: ['DATABASE_URL', 'SOURCE_URL'], origins: '', status: 'idle', gbHours: 21 },
  { id: 'nightly', name: 'Nightly clean-up', kind: 'etl', image: 'ghcr.io/acme/cleanup:0.3', repo: '', schedule: '0 3 * * *', port: '', memory: 512, envKeys: ['DATABASE_URL'], origins: '', status: 'failed', gbHours: 2, note: 'Exited with code 1' },
]

const STATUS_COLOR: Record<Status, string> = { running: 'var(--ok)', idle: 'var(--text-faint)', stopped: 'var(--text-faint)', failed: 'var(--danger)' }

/** Customers' own containers, next to their own database. The twin reads the API through the gateway. */
export default function Middleware(_: SectionProps) {
  const tx = useTx()
  const [services, setServices] = useState(SAMPLE)
  const [adding, setAdding] = useState(false)
  const [cap, setCap] = useState('')
  const KIND: Record<Kind, string> = { api: tx('API'), cron: tx('Cron job'), etl: tx('ETL') }
  const STATUS: Record<Status, string> = { running: tx('Running'), idle: tx('Waiting for its schedule'), stopped: tx('Stopped'), failed: tx('Failed') }

  const used = services.reduce((a, s) => a + s.gbHours, 0)
  const limit = Math.min(QUOTA.gbHours, Number(cap) > 0 ? Number(cap) : Infinity)
  const pct = Math.min(100, Math.round((used / limit) * 100))
  const set = (id: string, status: Status): void => setServices((all) => all.map((s) => (s.id === id ? { ...s, status, note: undefined } : s)))
  const apis = services.filter((s) => s.kind === 'api')

  return (
    <>
      <Head title={tx('Middleware')} sub={tx('Run your own APIs, cron jobs and ETLs next to your database. The digital twin reads your API, never your database directly.')}
        action={<Primary disabled={services.length >= QUOTA.services} onClick={() => setAdding(true)}>{tx('New service')}</Primary>} />
      <SoonBanner section="middleware" />
      {pct >= 80 && <div className="mb-6"><Banner tone="warn" title={tx('{{pct}}% of this month\'s budget is used', { pct })}>{tx('At 100% jobs pause and APIs stop until next month or until you raise the cap.')}</Banner></div>}

      <div className="grid gap-3 sm:grid-cols-3 mb-8">
        <Panel className="p-4 sm:col-span-2 min-w-0">
          <p className="text-[12px] text-[var(--text-dim)]">{tx('Compute this month')}</p>
          <p className="mt-1 text-[20px] font-semibold tabular-nums">{fmtInt(Math.round(used))} <span className="text-[13px] font-normal text-[var(--text-dim)]">/ {fmtInt(limit)} GB·h</span></p>
          <div className="mt-3 h-1.5 rounded-full bg-[var(--surface-2)] overflow-hidden" role="progressbar" aria-valuenow={pct} aria-valuemin={0} aria-valuemax={100}>
            <div className="h-full rounded-full" style={{ width: `${pct}%`, background: pct >= 80 ? 'var(--warn)' : 'var(--accent)' }} />
          </div>
          <p className="mt-2 text-[12px] text-[var(--text-faint)]">{tx('1 GB running for 1 hour is 1 GB·h.')}</p>
        </Panel>
        <Panel className="p-4 min-w-0">
          <Field label={tx('Team spending cap (GB·h a month)')} hint={tx('Only the owner can change it. Empty means the plan\'s allowance.')}>
            <input className={inputClass} inputMode="numeric" value={cap} placeholder={String(QUOTA.gbHours)} onChange={(e) => setCap(e.target.value.replace(/\D/g, ''))} />
          </Field>
        </Panel>
      </div>

      <SectionLabel>{tx('Services')}</SectionLabel>
      <div className="mb-8">
        <DataList rows={services} rowKey={(s) => s.id} primaryHeader={tx('Service')}
          primary={(s) => <><p className="font-medium [overflow-wrap:anywhere]">{s.name}</p><p className="text-[11.5px] text-[var(--text-faint)] [overflow-wrap:anywhere]">{s.image}</p></>}
          columns={[
            { key: 'kind', header: tx('Type'), cell: (s) => <span className="text-[12.5px]">{KIND[s.kind]}</span> },
            { key: 'status', header: tx('Status'), cell: (s) => <span className="inline-flex items-center gap-1.5 text-[12.5px]"><Dot color={STATUS_COLOR[s.status]} />{STATUS[s.status]}</span> },
            { key: 'when', header: tx('Schedule'), hideOnPhone: true, cell: (s) => <span className="font-mono text-[12px] text-[var(--text-dim)]">{s.schedule || '—'}</span> },
            { key: 'use', header: tx('Use'), hideOnPhone: true, cell: (s) => <span className="text-[12.5px] tabular-nums whitespace-nowrap">{fmtInt(Math.round(s.gbHours))} GB·h</span> },
          ]}
          actions={(s) => (
            <div className="flex flex-wrap justify-end gap-1.5">
              {s.status === 'running'
                ? <Quiet onClick={() => set(s.id, 'stopped')}>{tx('Stop')}</Quiet>
                : <Quiet onClick={() => set(s.id, s.kind === 'api' ? 'running' : 'idle')}>{tx('Start')}</Quiet>}
              {s.kind !== 'api' && <Quiet onClick={() => set(s.id, 'running')}>{tx('Run now')}</Quiet>}
              <Danger onClick={() => setServices((all) => all.filter((x) => x.id !== s.id))}>{tx('Remove')}</Danger>
            </div>
          )} />
      </div>

      {apis.length > 0 && (
        <>
          <SectionLabel>{tx('Use it in the digital twin')}</SectionLabel>
          <Panel className="p-4 mb-8 flex flex-col gap-3 min-w-0">
            <p className="text-[13px] leading-[1.5] text-[var(--text-dim)]">{tx('Paste this address as an API source in the twin, then choose how to read its payload. The gateway adds the CORS your browser needs, for the origins you list.')}</p>
            {apis.map((s) => <CopyField key={s.id} label={s.name} value={`${GATEWAY}${s.id}`} />)}
          </Panel>
        </>
      )}

      <SectionLabel>{tx('Monitoring')}</SectionLabel>
      <Panel className="p-4 mb-8 min-w-0">
        <p className="text-[13px] leading-[1.5] text-[var(--text-dim)]">{tx('Point Grafana at this Prometheus endpoint with a metrics token: state, runs, compute and requests per service.')}</p>
        <div className="mt-3"><CopyField label={tx('Metrics endpoint')} value="https://api.ifcvieweronline.eu/middleware/metrics" /></div>
      </Panel>

      {adding && <NewService onClose={() => setAdding(false)} onAdd={(s) => { setServices((all) => [...all, s]); setAdding(false) }} />}
    </>
  )
}

const CRON = /^(\S+\s+){4}\S+$/
const IMAGE = /^[a-z0-9][\w./:@-]*$/

function NewService({ onClose, onAdd }: { onClose: () => void; onAdd: (s: Service) => void }) {
  const tx = useTx()
  const [kind, setKind] = useState<Kind>('api')
  const [name, setName] = useState('')
  const [image, setImage] = useState('')
  const [repo, setRepo] = useState('')
  const [schedule, setSchedule] = useState('*/5 * * * *')
  const [port, setPort] = useState('8080')
  const [memory, setMemory] = useState(256)
  const [origins, setOrigins] = useState('https://www.ifcvieweronline.eu')
  const [env, setEnv] = useState<Array<[string, string]>>([['', '']])
  const [tried, setTried] = useState(false)

  const errors = {
    name: !name.trim(),
    image: !IMAGE.test(image.trim()),
    schedule: kind === 'cron' && !CRON.test(schedule.trim()),
    port: kind === 'api' && !(Number(port) > 0 && Number(port) < 65536),
  }
  const invalid = Object.values(errors).some(Boolean)
  const error = (bad: boolean, text: string) => (tried && bad ? <span className="text-[var(--danger)]">{text}</span> : undefined)
  const submit = (): void => {
    setTried(true)
    if (invalid) return
    onAdd({
      id: name.trim().toLowerCase().replace(/[^a-z0-9]+/g, '-'), name: name.trim(), kind, image: image.trim(), repo: repo.trim(), schedule: kind === 'api' ? '' : schedule.trim(), port: kind === 'api' ? port : '',
      memory, envKeys: env.map(([k]) => k.trim()).filter(Boolean), origins, status: 'stopped', gbHours: 0,
    })
  }
  const TYPES: Array<{ id: Kind; label: string }> = [{ id: 'api', label: tx('API') }, { id: 'cron', label: tx('Cron job') }, { id: 'etl', label: tx('ETL') }]
  const HELP: Record<Kind, string> = {
    api: tx('Stays on and answers requests. This is what the twin connects to.'),
    cron: tx('Starts on a schedule, does its work and stops. You pay only while it runs.'),
    etl: tx('Runs when you start it, or on an optional schedule. For heavier imports.'),
  }

  return (
    <Dialog title={tx('New service')} onClose={onClose} size="lg"
      footer={<><Quiet onClick={onClose}>{tx('Cancel')}</Quiet><Primary onClick={submit}>{tx('Create service')}</Primary></>}>
      <div className="flex flex-col gap-4">
        <Tabs tabs={TYPES} value={kind} onChange={setKind} label={tx('Type')} />
        <p className="text-[12.5px] leading-[1.5] text-[var(--text-dim)]">{HELP[kind]}</p>
        <Field label={tx('Name')} hint={error(errors.name, tx('Give it a name.'))}><input className={inputClass} value={name} onChange={(e) => setName(e.target.value)} /></Field>
        <Field label={tx('Docker image')} hint={error(errors.image, tx('Use a registry reference, not a web address.')) ?? tx('A public image or one in our registry, for example ghcr.io/acme/api:1.0')}>
          <input className={`${inputClass} font-mono`} spellCheck={false} value={image} placeholder="ghcr.io/acme/api:1.0" onChange={(e) => setImage(e.target.value)} />
        </Field>
        <Field label={tx('Repository (optional)')} hint={tx('For your team\'s reference. We run the image and do not build from it.')}>
          <input className={inputClass} inputMode="url" spellCheck={false} value={repo} placeholder="https://github.com/acme/api" onChange={(e) => setRepo(e.target.value)} />
        </Field>
        <div className="grid gap-4 sm:grid-cols-2">
          {kind === 'api'
            ? <Field label={tx('Port it listens on')} hint={error(errors.port, tx('Enter a port between 1 and 65535.'))}><input className={inputClass} inputMode="numeric" value={port} onChange={(e) => setPort(e.target.value.replace(/\D/g, ''))} /></Field>
            : <Field label={kind === 'cron' ? tx('Schedule (cron, UTC)') : tx('Schedule (optional, cron, UTC)')} hint={error(errors.schedule, tx('Five fields, for example */5 * * * *'))}><input className={`${inputClass} font-mono`} spellCheck={false} value={schedule} onChange={(e) => setSchedule(e.target.value)} /></Field>}
          <Field label={tx('Memory')}>
            <select className={inputClass} value={memory} onChange={(e) => setMemory(Number(e.target.value))}>
              {[256, 512].map((m) => <option key={m} value={m}>{m} MB</option>)}
            </select>
          </Field>
        </div>
        {kind === 'api' && (
          <Field label={tx('Allowed origins')} hint={tx('Websites that may call this API from a browser, separated by commas.')}>
            <input className={inputClass} spellCheck={false} value={origins} onChange={(e) => setOrigins(e.target.value)} />
          </Field>
        )}
        <div>
          <p className="text-[12px] text-[var(--text-dim)]">{tx('Environment variables')}</p>
          <p className="mt-0.5 mb-2 text-[11.5px] leading-[1.45] text-[var(--text-faint)]">{tx('Encrypted when saved. After that we show the names only. Your database address goes here: the database stays yours.')}</p>
          <div className="flex flex-col gap-2">
            {env.map(([k, v], i) => (
              <div key={i} className="grid grid-cols-[1fr_1fr_auto] gap-2 items-center">
                <input className={`${inputClass} font-mono`} aria-label={tx('Name')} spellCheck={false} placeholder="DATABASE_URL" value={k} onChange={(e) => setEnv(env.map((r, j) => (j === i ? [e.target.value, r[1]] : r)))} />
                <input className={inputClass} aria-label={tx('Value')} type="password" autoComplete="off" value={v} onChange={(e) => setEnv(env.map((r, j) => (j === i ? [r[0], e.target.value] : r)))} />
                <Quiet onClick={() => setEnv(env.length > 1 ? env.filter((_, j) => j !== i) : [['', '']])}>{tx('Remove')}</Quiet>
              </div>
            ))}
          </div>
          <div className="mt-2"><Quiet onClick={() => setEnv([...env, ['', '']])}>{tx('Add variable')}</Quiet></div>
        </div>
      </div>
    </Dialog>
  )
}
