import { useState } from 'react'
import type { SectionProps } from '../registry'
import { Banner, CopyField, DataList, Danger, Dialog, Dot, Field, Head, Panel, Primary, Quiet, SectionLabel, fmtInt, inputClass } from '../ui'
import { SoonBanner } from '../Soon'
import { useTx } from '../i18n'

type Kind = 'api' | 'cron'
type Status = 'running' | 'idle' | 'stopped' | 'failed' | 'review'

interface Service { id: string; name: string; kind: Kind; source: string; schedule: string; hosts: string[]; status: Status; gbHours: number }
interface TemplateVar { name: string; secret?: boolean; required?: boolean; placeholder?: string }
interface Template { id: string; kind: Kind; name: string; body: string; vars: TemplateVar[] }

const GATEWAY = 'https://api.ifcvieweronline.eu/mw/'
const QUOTA_GB_HOURS = 250

/** Mirrors lib/middleware-templates in the API: the terms are signed in this exact wording. */
const TERMS = [
  'I act on behalf of the organization named here and may bind it.',
  'The organization owns the data sources it configures, or is authorized to access them in this way, and complies with their terms.',
  'It owns or is authorized to run any repository or image it submits.',
  'It will not use this service to mine, send unsolicited messages, attack, overload, scan or gain unauthorized access to any system.',
  'It is responsible for the data it processes and for claims or penalties arising from its configuration and its containers.',
  'The provider may suspend a service at once on suspected abuse, and may disclose these records to the authorities when legally required.',
]

const SAMPLE: Service[] = [
  { id: 'trains', name: 'Trains API', kind: 'api', source: 'Read-only API over your table', schedule: '', hosts: [], status: 'running', gbHours: 118 },
  { id: 'stations', name: 'Stations collector', kind: 'cron', source: 'Collect an API into your database', schedule: '*/5 * * * *', hosts: ['data.renfe.example'], status: 'idle', gbHours: 21 },
  { id: 'own', name: 'Delay predictor', kind: 'cron', source: 'Your container', schedule: '0 * * * *', hosts: [], status: 'review', gbHours: 0 },
]

const COLOR: Record<Status, string> = { running: 'var(--ok)', idle: 'var(--text-faint)', stopped: 'var(--text-faint)', failed: 'var(--danger)', review: 'var(--warn)' }

/** By agreement with us. Verified templates take variables; a customer's own container takes a review. */
export default function Middleware({ actions }: SectionProps) {
  const tx = useTx()
  const TEMPLATES: Template[] = [
    { id: 'fetch-to-postgres', kind: 'cron', name: tx('Collect an API into your database'), body: tx('On a schedule, reads one address of yours and saves its items in your table.'), vars: [
      { name: 'SOURCE_URL', required: true, placeholder: 'https://data.example.com/stations' }, { name: 'LIST_PATH', placeholder: 'data.items' }, { name: 'ID_FIELD', placeholder: 'id' },
      { name: 'SOURCE_AUTH_HEADER', secret: true }, { name: 'DATABASE_URL', secret: true, required: true, placeholder: 'postgres://…' }, { name: 'TARGET_TABLE', required: true, placeholder: 'trains' },
    ] },
    { id: 'postgres-read-api', kind: 'api', name: tx('Read-only API over your table'), body: tx('The twin reads this API, never your database. It can only read.'), vars: [
      { name: 'DATABASE_URL', secret: true, required: true, placeholder: 'postgres://…' }, { name: 'SOURCE_TABLE', required: true, placeholder: 'trains' },
    ] },
    { id: 'fetch-cache-api', kind: 'api', name: tx('Cached API over a public source'), body: tx('For a source that blocks browsers: refreshes at most once a minute and serves the copy.'), vars: [
      { name: 'SOURCE_URL', required: true, placeholder: 'https://data.example.com/stations' }, { name: 'LIST_PATH', placeholder: 'data.items' }, { name: 'SOURCE_AUTH_HEADER', secret: true }, { name: 'REFRESH_SECONDS', placeholder: '300' },
    ] },
  ]
  const [services, setServices] = useState(SAMPLE)
  const [signed, setSigned] = useState<{ name: string; company: string } | null>(null)
  const [signing, setSigning] = useState<Template | null | 'terms'>(null)
  const [using, setUsing] = useState<Template | null>(null)
  const [cap, setCap] = useState('')
  const STATUS: Record<Status, string> = { running: tx('Running'), idle: tx('Waiting for its schedule'), stopped: tx('Stopped'), failed: tx('Failed'), review: tx('In review by our team') }
  const used = services.reduce((a, s) => a + s.gbHours, 0)
  const limit = Math.min(QUOTA_GB_HOURS, Number(cap) > 0 ? Number(cap) : Infinity)
  const pct = Math.min(100, Math.round((used / limit) * 100))
  const set = (id: string, status: Status): void => setServices((all) => all.map((s) => (s.id === id ? { ...s, status } : s)))
  const apis = services.filter((s) => s.kind === 'api')
  const choose = (t: Template): void => { if (signed) setUsing(t); else setSigning(t) }

  return (
    <>
      <Head title={tx('Middleware')} sub={tx('Feed the digital twin from your own data, through containers we verified. The database stays yours.')} />
      <SoonBanner section="middleware" />
      <div className="mb-8">
        <Banner tone="info" title={tx('Enabled by agreement')} action={<Quiet onClick={() => actions.contact('question', 'middleware')}>{tx('Talk to us')}</Quiet>}>
          {tx('We switch this on after talking to your team, as an Enterprise feature or an extra on your plan.')}
        </Banner>
      </div>

      <SectionLabel>{tx('Verified containers')}</SectionLabel>
      <p className="mb-3 text-[13px] leading-[1.5] text-[var(--text-dim)] max-w-[680px]">{tx('Set the variables and you are done. They cannot run other code: one declared public address, read only, on a limited schedule.')}</p>
      <div className="grid gap-3 sm:grid-cols-3 mb-8">
        {TEMPLATES.map((t) => (
          <Panel key={t.id} className="p-4 flex flex-col gap-2 min-w-0">
            <p className="text-[13.5px] font-medium">{t.name}</p>
            <p className="flex-1 text-[12.5px] leading-[1.5] text-[var(--text-dim)]">{t.body}</p>
            <div className="pt-1"><Quiet onClick={() => choose(t)}>{tx('Set up')}</Quiet></div>
          </Panel>
        ))}
      </div>

      <SectionLabel>{tx('Your own containers')}</SectionLabel>
      <Panel className="p-4 mb-8 flex flex-col sm:flex-row sm:items-center gap-3 min-w-0">
        <p className="flex-1 text-[13px] leading-[1.5] text-[var(--text-dim)]">{tx('Only by agreement. Tell us what it does and show us the repository; we review it and approve that exact image before it can start. A new image needs a new review.')}</p>
        <Quiet onClick={() => actions.contact('question', 'middleware own container')}>{tx('Request a review')}</Quiet>
      </Panel>

      <SectionLabel>{tx('Services')}</SectionLabel>
      <div className="mb-8">
        <DataList rows={services} rowKey={(s) => s.id} primaryHeader={tx('Service')}
          primary={(s) => <><p className="font-medium [overflow-wrap:anywhere]">{s.name}</p><p className="text-[11.5px] text-[var(--text-faint)] [overflow-wrap:anywhere]">{tx(s.source)}</p></>}
          columns={[
            { key: 'status', header: tx('Status'), cell: (s) => <span className="inline-flex items-center gap-1.5 text-[12.5px]"><Dot color={COLOR[s.status]} />{STATUS[s.status]}</span> },
            { key: 'when', header: tx('Schedule'), hideOnPhone: true, cell: (s) => <span className="font-mono text-[12px] text-[var(--text-dim)]">{s.schedule || '—'}</span> },
            { key: 'hosts', header: tx('Reads from'), hideOnPhone: true, cell: (s) => <span className="text-[12px] text-[var(--text-dim)] [overflow-wrap:anywhere]">{s.hosts.join(', ') || '—'}</span> },
            { key: 'use', header: tx('Use'), hideOnPhone: true, cell: (s) => <span className="text-[12.5px] tabular-nums whitespace-nowrap">{fmtInt(Math.round(s.gbHours))} GB·h</span> },
          ]}
          actions={(s) => (
            <div className="flex flex-wrap justify-end gap-1.5">
              {s.status !== 'review' && (s.status === 'running'
                ? <Quiet onClick={() => set(s.id, 'stopped')}>{tx('Stop')}</Quiet>
                : <Quiet onClick={() => set(s.id, s.kind === 'api' ? 'running' : 'idle')}>{tx('Start')}</Quiet>)}
              <Danger onClick={() => setServices((all) => all.filter((x) => x.id !== s.id))}>{tx('Remove')}</Danger>
            </div>
          )} />
      </div>

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
            <input className={inputClass} inputMode="numeric" value={cap} placeholder={String(QUOTA_GB_HOURS)} onChange={(e) => setCap(e.target.value.replace(/\D/g, ''))} />
          </Field>
        </Panel>
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
      <Panel className="p-4 mb-8 min-w-0 flex flex-col gap-3">
        <p className="text-[13px] leading-[1.5] text-[var(--text-dim)]">{tx('Point Grafana at this Prometheus endpoint with a metrics token: state, runs, compute and requests per service.')}</p>
        <CopyField label={tx('Metrics endpoint')} value="https://api.ifcvieweronline.eu/middleware/metrics" />
      </Panel>

      <SectionLabel>{tx('Signed terms')}</SectionLabel>
      <Panel className="p-4 mb-8 flex flex-col sm:flex-row sm:items-center gap-3 min-w-0">
        <p className="flex-1 text-[13px] leading-[1.5] text-[var(--text-dim)] [overflow-wrap:anywhere]">{signed ? tx('Signed by {{name}} for {{company}}.', signed) : tx('Not signed yet. Required before the first service.')}</p>
        <Quiet onClick={() => setSigning('terms')}>{signed ? tx('Read the terms') : tx('Read and sign')}</Quiet>
      </Panel>

      {signing && <SignTerms signed={signed} onClose={() => setSigning(null)} onSign={(s) => { setSigned(s); const next = signing; setSigning(null); if (next !== 'terms') setUsing(next) }} />}
      {using && <UseTemplate template={using} onClose={() => setUsing(null)} onAdd={(s) => { setServices((all) => [...all, s]); setUsing(null) }} />}
    </>
  )
}

function SignTerms({ signed, onClose, onSign }: { signed: { name: string; company: string } | null; onClose: () => void; onSign: (s: { name: string; company: string }) => void }) {
  const tx = useTx()
  const [name, setName] = useState('')
  const [company, setCompany] = useState('')
  const [accept, setAccept] = useState(false)
  const ready = name.trim().length >= 3 && company.trim().length >= 2 && accept
  return (
    <Dialog title={tx('Terms of use of the middleware')} onClose={onClose} size="lg"
      footer={signed ? <Quiet onClick={onClose}>{tx('Close')}</Quiet> : <><Quiet onClick={onClose}>{tx('Cancel')}</Quiet><Primary disabled={!ready} onClick={() => onSign({ name: name.trim(), company: company.trim() })}>{tx('Sign')}</Primary></>}>
      <div className="flex flex-col gap-4">
        <p className="text-[12.5px] leading-[1.5] text-[var(--text-dim)]">{tx('These terms apply in English. We keep who signed, when and from which address.')}</p>
        <ul lang="en" className="flex flex-col gap-2 pl-4 list-disc text-[13px] leading-[1.5]">{TERMS.map((t) => <li key={t}>{t}</li>)}</ul>
        {!signed && (
          <>
            <div className="grid gap-4 sm:grid-cols-2">
              <Field label={tx('Your full name')}><input className={inputClass} autoComplete="name" value={name} onChange={(e) => setName(e.target.value)} /></Field>
              <Field label={tx('Organization')}><input className={inputClass} autoComplete="organization" value={company} onChange={(e) => setCompany(e.target.value)} /></Field>
            </div>
            <label className="flex items-start gap-2.5 text-[13px] leading-[1.5]">
              <input type="checkbox" className="mt-1" checked={accept} onChange={(e) => setAccept(e.target.checked)} />
              <span>{tx('I have read these terms and accept them on behalf of this organization.')}</span>
            </label>
          </>
        )}
      </div>
    </Dialog>
  )
}

function UseTemplate({ template: t, onClose, onAdd }: { template: Template; onClose: () => void; onAdd: (s: Service) => void }) {
  const tx = useTx()
  const [name, setName] = useState(t.name)
  const [values, setValues] = useState<Record<string, string>>({})
  const [schedule, setSchedule] = useState('*/5 * * * *')
  const [origins, setOrigins] = useState('https://www.ifcvieweronline.eu')
  const [tried, setTried] = useState(false)
  const missing = t.vars.some((v) => v.required && !values[v.name]?.trim())
  const badUrl = values.SOURCE_URL ? !/^https:\/\/[^/@]+/.test(values.SOURCE_URL.trim()) : false
  const invalid = missing || badUrl || !name.trim() || (t.kind === 'cron' && !/^(\S+\s+){4}\S+$/.test(schedule.trim()))
  const create = (): void => {
    setTried(true)
    if (invalid) return
    let host: string[] = []
    try { host = values.SOURCE_URL ? [new URL(values.SOURCE_URL).hostname] : [] } catch { /* checked above */ }
    onAdd({ id: `${t.id}-${Date.now().toString(36)}`, name: name.trim(), kind: t.kind, source: t.id === 'fetch-to-postgres' ? 'Collect an API into your database' : t.id === 'postgres-read-api' ? 'Read-only API over your table' : 'Cached API over a public source', schedule: t.kind === 'cron' ? schedule.trim() : '', hosts: host, status: 'stopped', gbHours: 0 })
  }
  return (
    <Dialog title={t.name} onClose={onClose} size="lg"
      footer={<><Quiet onClick={onClose}>{tx('Cancel')}</Quiet><Primary onClick={create}>{tx('Create service')}</Primary></>}>
      <div className="flex flex-col gap-4">
        <p className="text-[12.5px] leading-[1.5] text-[var(--text-dim)]">{t.body}</p>
        <Field label={tx('Name')}><input className={inputClass} value={name} onChange={(e) => setName(e.target.value)} /></Field>
        {t.vars.map((v) => (
          <Field key={v.name} label={v.required ? v.name : `${v.name} · ${tx('optional')}`}
            hint={tried && v.required && !values[v.name]?.trim() ? <span className="text-[var(--danger)]">{tx('This is required.')}</span> : v.name === 'SOURCE_URL' && badUrl ? <span className="text-[var(--danger)]">{tx('Use a public https address.')}</span> : undefined}>
            <input className={`${inputClass} font-mono`} spellCheck={false} autoComplete="off" type={v.secret ? 'password' : 'text'} placeholder={v.placeholder}
              value={values[v.name] ?? ''} onChange={(e) => setValues({ ...values, [v.name]: e.target.value })} />
          </Field>
        ))}
        {t.kind === 'cron'
          ? <Field label={tx('Schedule (cron, UTC)')} hint={tx('At most every 5 minutes.')}><input className={`${inputClass} font-mono`} spellCheck={false} value={schedule} onChange={(e) => setSchedule(e.target.value)} /></Field>
          : <Field label={tx('Allowed origins')} hint={tx('Websites that may call this API from a browser, separated by commas.')}><input className={inputClass} spellCheck={false} value={origins} onChange={(e) => setOrigins(e.target.value)} /></Field>}
        <p className="text-[11.5px] leading-[1.45] text-[var(--text-faint)]">{tx('Secrets are encrypted when saved. After that we show the names only.')}</p>
      </div>
    </Dialog>
  )
}
