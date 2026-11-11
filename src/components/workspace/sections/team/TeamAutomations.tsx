// B3 · Automatic validation by folder, CI or API with webhooks (doc 25b F4,
// "Iteración UI Team"). Built dark on sample data: connect a source, pick a
// profile, see runs, webhooks, and failures turned into issues. The routine
// rules designed earlier live in their own tab. Nothing is saved or sent.
import { useState } from 'react'
import { FolderSync, GitBranch, Code2, RotateCcw } from 'lucide-react'
import type { SectionProps } from '../../registry'
import { CopyField, DataList, Dialog, Dot, Empty, Field, Head, Panel, Primary, Quiet, SectionLabel, Sparkline, Tabs, Toggle, inputClass, scoreColor } from '../../ui'
import { SoonBanner } from '../../Soon'
import Automations from '../Automations'
import { useTeamTx, type TeamTx } from './i18n'
import {
  MAX_UPLOAD_MB, MEMBERS, PROFILES, RUNS, SOURCES, WEBHOOKS, WEEK, issueForRun, member, snippet,
  type RunResult, type SourceKind, type ValidationSource, type Webhook, type WebhookEvent,
} from './sample'

type View = 'runs' | 'sources' | 'webhooks' | 'rules'
const KIND_ICON = { folder: FolderSync, ci: GitBranch, api: Code2 }
const kindLabel = (tt: TeamTx, k: SourceKind) => ({ folder: tt('Watched folder'), ci: tt('CI pipeline'), api: tt('Direct API') })[k]
const kindBody = (tt: TeamTx, k: SourceKind) => ({
  folder: tt('A small script on your server checks a shared folder every few minutes. Files never leave your network until they are checked.'),
  ci: tt('A step in GitHub Actions, GitLab or Azure DevOps. A failing model can stop the merge.'),
  api: tt('Your own platform posts the file and gets the report and a webhook back.'),
})[k]
const RESULT: Record<RunResult, string> = { passed: 'var(--ok)', failed: 'var(--danger)', error: 'var(--warn)' }
const resultLabel = (tt: TeamTx, r: RunResult) => ({ passed: tt('Passed'), failed: tt('Failed'), error: tt('Not checked') })[r]
const profileName = (id: string) => PROFILES.find((p) => p.id === id)?.name ?? id
const EVENTS: WebhookEvent[] = ['validation.completed', 'validation.failed', 'issue.created']

export default function TeamAutomations(props: SectionProps) {
  const tt = useTeamTx()
  const empty = props.data.projects.length === 0
  const [view, setView] = useState<View>('runs')
  const [sources, setSources] = useState<ValidationSource[]>(empty ? [] : SOURCES)
  const [hooks, setHooks] = useState<Webhook[]>(empty ? [] : WEBHOOKS)
  const [wizard, setWizard] = useState(false)
  const [hookEdit, setHookEdit] = useState<Webhook | 'new' | null>(null)
  const [only, setOnly] = useState<'all' | RunResult>('all')
  const runs = empty ? [] : RUNS.filter((r) => only === 'all' || r.result === only)
  const srcOf = (id: string) => sources.find((s) => s.id === id) ?? SOURCES.find((s) => s.id === id)!

  const TABS = [
    { id: 'runs' as const, label: tt('Runs'), count: empty ? 0 : RUNS.length },
    { id: 'sources' as const, label: tt('Sources'), count: sources.length },
    { id: 'webhooks' as const, label: tt('Webhooks'), count: hooks.length },
    { id: 'rules' as const, label: tt('Routine rules') },
  ]

  return (
    <>
      <Head title={tt('Automations')} sub={tt('Every delivery checked against your profile the moment it lands, by folder, CI or API. Failures become issues; results go to your webhooks.')}
        action={<Primary onClick={() => setWizard(true)}>{tt('Connect a source')}</Primary>} />
      <SoonBanner section="automations" />
      <div className="mb-5"><Tabs tabs={TABS} value={view} onChange={setView} label={tt('Automations')} /></div>

      {view === 'runs' && (empty || sources.length === 0
        ? <EmptySources tt={tt} onConnect={() => setWizard(true)} />
        : <>
            <div className="grid gap-3 grid-cols-2 lg:grid-cols-4 mb-6">
              <Panel className="px-4 py-3 min-w-0"><p className="text-[11.5px] text-[var(--text-faint)]">{tt('Checked this week')}</p><div className="flex items-end justify-between gap-2"><p className="text-[20px] font-semibold tabular-nums">{WEEK.validated}</p><Sparkline values={WEEK.daily} width={64} height={22} /></div></Panel>
              <Panel className="px-4 py-3 min-w-0"><p className="text-[11.5px] text-[var(--text-faint)]">{tt('Failed')}</p><p className="text-[20px] font-semibold tabular-nums">{WEEK.failed}<span className="ml-1.5 text-[12px] font-normal text-[var(--text-faint)]">{tt('{{n}} not checked', { n: WEEK.errors })}</span></p></Panel>
              <Panel className="px-4 py-3 min-w-0"><p className="text-[11.5px] text-[var(--text-faint)]">{tt('Issues opened on their own')}</p><p className="text-[20px] font-semibold tabular-nums">{WEEK.issuesOpened}</p></Panel>
              <Panel className="px-4 py-3 min-w-0"><p className="text-[11.5px] text-[var(--text-faint)]">{tt('Median time to report')}</p><p className="text-[20px] font-semibold tabular-nums">{WEEK.medianSeconds} s</p></Panel>
            </div>
            <div className="flex items-center justify-between gap-3 mb-3 [&_h2]:mb-0">
              <SectionLabel>{tt('Latest deliveries')}</SectionLabel>
              <select aria-label={tt('Result')} value={only} onChange={(e) => setOnly(e.target.value as typeof only)} className={`${inputClass} !w-[170px]`}>
                <option value="all">{tt('All results')}</option>
                {(['passed', 'failed', 'error'] as RunResult[]).map((r) => <option key={r} value={r}>{resultLabel(tt, r)}</option>)}
              </select>
            </div>
            <DataList rows={runs} rowKey={(r) => r.id} primaryHeader={tt('File')}
              primary={(r) => <><p className="font-medium [overflow-wrap:anywhere]">{r.file}</p><p className="text-[11.5px] text-[var(--text-faint)] [overflow-wrap:anywhere]">{r.at} · {srcOf(r.source).name}</p></>}
              columns={[
                { key: 'result', header: tt('Result'), cell: (r) => <span className="inline-flex items-center gap-1.5 text-[12px] whitespace-nowrap"><Dot color={RESULT[r.result]} />{resultLabel(tt, r.result)}</span> },
                { key: 'score', header: tt('Score'), cell: (r) => r.score === null ? <span className="text-[12px] text-[var(--text-faint)]">—</span> : <span className="text-[12.5px] tabular-nums font-medium" style={{ color: scoreColor(r.score) }}>{r.score}</span> },
                { key: 'what', header: tt('What happened'), wide: true, cell: (r) => <RunOutcome r={r} tt={tt} src={srcOf(r.source)} /> },
                { key: 'profile', header: tt('Profile'), desktopOnly: true, cell: (r) => <span className="text-[12px] text-[var(--text-dim)]">{profileName(r.profile)}</span> },
                { key: 'time', header: tt('Time'), hideOnPhone: true, align: 'right', cell: (r) => <span className="text-[12px] tabular-nums text-[var(--text-dim)]">{r.seconds} s</span> },
              ]} />
          </>)}

      {view === 'sources' && (sources.length === 0
        ? <EmptySources tt={tt} onConnect={() => setWizard(true)} />
        : <div className="flex flex-col gap-3">
            {sources.map((s) => {
              const Icon = KIND_ICON[s.kind]
              return (
                <Panel key={s.id} className="p-4 min-w-0">
                  <div className="flex items-start gap-3">
                    <Icon size={18} aria-hidden className="mt-0.5 shrink-0 text-[var(--text-dim)]" />
                    <div className="flex-1 min-w-0">
                      <p className="text-[13.5px] font-medium">{s.name}</p>
                      <p className="text-[12px] text-[var(--text-faint)] font-mono [overflow-wrap:anywhere]">{s.where}</p>
                      <p className="mt-1.5 text-[12.5px] text-[var(--text-dim)]">{kindLabel(tt, s.kind)} · {profileName(s.profile)} · {tt('{{n}} this week', { n: s.week })}</p>
                      <p className="mt-1 text-[12.5px] text-[var(--text-dim)]">{s.onFail.issue
                        ? tt('If it fails: issue for {{name}}, due in {{d}} days', { name: member(s.onFail.assignee)?.name ?? '—', d: s.onFail.dueDays })
                        : tt('If it fails: no issue, only the report')}{s.onFail.webhook ? ` · ${tt('webhook')}` : ''}</p>
                      {s.health === 'quiet' && <p className="mt-1.5 text-[12.5px] text-[var(--warn)]">{tt('Nothing received since {{at}}. Check that the script or key still works.', { at: s.lastSeen })}</p>}
                      {s.health === 'paused' && <p className="mt-1.5 text-[12.5px] text-[var(--warn)]">{tt('Paused: its profile was deleted. Choose another one to resume.')}</p>}
                    </div>
                    <Toggle checked={s.health !== 'paused'} label={s.name} onChange={(on) => setSources((all) => all.map((x) => (x.id === s.id ? { ...x, health: on ? 'ok' : 'paused' } : x)))} />
                  </div>
                </Panel>
              )
            })}
            <p className="text-[12px] text-[var(--text-faint)]">{tt('Files up to {{mb}} MB. The same file twice is checked once (matched by content hash).', { mb: MAX_UPLOAD_MB })}</p>
          </div>)}

      {view === 'webhooks' && (hooks.length === 0
        ? <Empty title={tt('No webhooks yet')} body={tt('Send each result to Teams, Slack or your document system the moment it is ready.')} action={<Primary onClick={() => setHookEdit('new')}>{tt('Add a webhook')}</Primary>} />
        : <div className="flex flex-col gap-3">
            <div className="flex justify-end"><Quiet onClick={() => setHookEdit('new')}>{tt('Add a webhook')}</Quiet></div>
            {hooks.map((h) => (
              <Panel key={h.id} className="p-4 min-w-0">
                <div className="flex flex-col sm:flex-row sm:items-start gap-2 justify-between">
                  <div className="min-w-0">
                    <p className="text-[13.5px] font-medium inline-flex items-center gap-1.5"><Dot color={h.state === 'active' ? 'var(--ok)' : h.state === 'failing' ? 'var(--danger)' : 'var(--text-faint)'} />{h.name}</p>
                    <p className="text-[12px] text-[var(--text-faint)] font-mono [overflow-wrap:anywhere]">{h.url}</p>
                    <p className="mt-1 text-[12px] text-[var(--text-dim)] font-mono">{h.events.join(' · ')}</p>
                  </div>
                  <Quiet onClick={() => setHookEdit(h)}>{tt('Edit')}</Quiet>
                </div>
                {h.state === 'failing' && <p role="status" className="mt-2 text-[12.5px] text-[var(--danger)]">{tt('The last {{n}} deliveries failed. We retry 3 times, then pause it and tell the admin.', { n: h.deliveries.filter((d) => d.code >= 400).length })}</p>}
                <ul className="mt-3 divide-y divide-[var(--border)] text-[12px]">
                  {h.deliveries.map((d, k) => (
                    <li key={k} className="py-1.5 flex items-center gap-3 min-w-0">
                      <span className={`tabular-nums font-medium w-[34px] ${d.code >= 400 ? 'text-[var(--danger)]' : 'text-[var(--ok)]'}`}>{d.code}</span>
                      <span className="flex-1 min-w-0 truncate font-mono text-[var(--text-dim)]">{d.event}</span>
                      <span className="hidden sm:inline tabular-nums text-[var(--text-faint)]">{d.ms} ms</span>
                      <span className="tabular-nums text-[var(--text-faint)]">{d.at.slice(5)}</span>
                      {d.code >= 400 && <button type="button" aria-label={tt('Retry')} title={tt('Retry')} className="text-[var(--text-dim)] hover:text-[var(--text)]"><RotateCcw size={13} /></button>}
                    </li>
                  ))}
                </ul>
              </Panel>
            ))}
          </div>)}

      {view === 'rules' && <Automations {...props} embedded />}

      {wizard && <ConnectWizard tt={tt} onClose={() => setWizard(false)} onDone={(s) => { setSources((all) => [...all, s]); setWizard(false); setView('sources') }} />}
      {hookEdit && <WebhookDialog tt={tt} hook={hookEdit === 'new' ? null : hookEdit} onClose={() => setHookEdit(null)}
        onSave={(h) => { setHooks((all) => all.some((x) => x.id === h.id) ? all.map((x) => (x.id === h.id ? h : x)) : [...all, h]); setHookEdit(null) }} />}
    </>
  )
}

function RunOutcome({ r, tt, src }: { r: (typeof RUNS)[number]; tt: TeamTx; src: ValidationSource }) {
  if (r.result === 'error') return <span className="text-[12px] text-[var(--warn)]">{tt('File is {{mb}} MB; the limit is {{max}} MB.', { mb: r.sizeMb, max: MAX_UPLOAD_MB })}</span>
  if (r.result === 'passed') return <span className="text-[12px] text-[var(--text-dim)]">{tt('Meets the profile')}</span>
  const k = issueForRun(r, src)
  return <span className="text-[12px] text-[var(--text-dim)]">{tt('{{n}} rules fail', { n: r.failed })} · {k === 'opened' ? <span className="text-[var(--text)]">{tt('issue #{{n}} opened', { n: r.issue ?? 0 })}</span> : k === 'off' ? tt('report only') : tt('already open')}</span>
}

function EmptySources({ tt, onConnect }: { tt: TeamTx; onConnect: () => void }) {
  return (
    <div className="flex flex-col gap-4">
      <Empty title={tt('Connect your first folder or pipeline')} body={tt('From then on every delivery is checked when it lands, without anyone opening it.')} action={<Primary onClick={onConnect}>{tt('Connect a source')}</Primary>} />
      <div className="grid gap-3 sm:grid-cols-3">
        {(['folder', 'ci', 'api'] as SourceKind[]).map((k) => { const Icon = KIND_ICON[k]; return (
          <Panel key={k} className="p-4 min-w-0"><Icon size={16} aria-hidden className="text-[var(--text-dim)]" /><p className="mt-2 text-[13px] font-medium">{kindLabel(tt, k)}</p><p className="mt-1 text-[12.5px] text-[var(--text-dim)] leading-[1.5]">{kindBody(tt, k)}</p></Panel>
        ) })}
      </div>
    </div>
  )
}

function ConnectWizard({ tt, onClose, onDone }: { tt: TeamTx; onClose: () => void; onDone: (s: ValidationSource) => void }) {
  const [step, setStep] = useState(0)
  const [kind, setKind] = useState<SourceKind>('folder')
  const [name, setName] = useState('CEIP deliveries folder')
  const [profile, setProfile] = useState(PROFILES[0].id)
  const [issue, setIssue] = useState(true)
  const [assignee, setAssignee] = useState('m1')
  const [dueDays, setDueDays] = useState(3)
  const [webhook, setWebhook] = useState(true)
  const steps = [tt('Source'), tt('Profile'), tt('If it fails'), tt('Install')]
  const finish = () => onDone({ id: `s${Date.now().toString(36)}`, kind, name: name.trim(), where: kind === 'folder' ? '\\\\nas01\\Projects\\CEIP\\04_Shared' : kind === 'ci' ? 'github.com/ribera-ing/ceip-models' : 'API key ws_live_…new', profile, onFail: { issue, assignee: issue ? assignee : null, dueDays, webhook }, health: 'quiet', lastSeen: '—', week: 0 })
  return (
    <Dialog title={tt('Connect a source')} size="lg" onClose={onClose}
      footer={<>
        {step > 0 ? <Quiet onClick={() => setStep(step - 1)}>{tt('Back')}</Quiet> : <Quiet onClick={onClose}>{tt('Cancel')}</Quiet>}
        {step < 3 ? <Primary disabled={step === 0 && name.trim().length < 3} onClick={() => setStep(step + 1)}>{tt('Continue')}</Primary> : <Primary onClick={finish}>{tt('Done, start watching')}</Primary>}
      </>}>
      <ol className="flex gap-1.5 mb-5 text-[11.5px]" aria-label={tt('Steps')}>
        {steps.map((s, k) => <li key={s} aria-current={k === step ? 'step' : undefined} className={`flex-1 min-w-0 truncate border-t-2 pt-1.5 ${k <= step ? 'border-[var(--accent)] text-[var(--text)]' : 'border-[var(--border)] text-[var(--text-faint)]'}`}>{s}</li>)}
      </ol>
      {step === 0 && (
        <div className="flex flex-col gap-3">
          <div role="radiogroup" aria-label={tt('Source')} className="grid gap-2 sm:grid-cols-3">
            {(['folder', 'ci', 'api'] as SourceKind[]).map((k) => { const Icon = KIND_ICON[k]; return (
              <button key={k} type="button" role="radio" aria-checked={kind === k} onClick={() => setKind(k)}
                className={`text-left rounded-[10px] border p-3 min-w-0 ${kind === k ? 'border-[var(--accent)] bg-[var(--surface-2)]' : 'border-[var(--border)] hover:bg-[var(--surface-2)]'}`}>
                <Icon size={16} aria-hidden className="text-[var(--text-dim)]" /><p className="mt-1.5 text-[13px] font-medium">{kindLabel(tt, k)}</p>
              </button>) })}
          </div>
          <p className="text-[12.5px] text-[var(--text-dim)]">{kindBody(tt, kind)}</p>
          <Field label={tt('Name')}><input className={inputClass} value={name} onChange={(e) => setName(e.target.value)} /></Field>
          <p className="text-[12px] text-[var(--text-faint)]">{tt('SharePoint, ACC or Drive connectors are built when a paying customer asks for one.')}</p>
        </div>
      )}
      {step === 1 && (
        <div role="radiogroup" aria-label={tt('Profile')} className="flex flex-col gap-2">
          {PROFILES.map((p) => (
            <button key={p.id} type="button" role="radio" aria-checked={profile === p.id} onClick={() => setProfile(p.id)}
              className={`text-left rounded-[10px] border px-3 py-2.5 text-[13px] ${profile === p.id ? 'border-[var(--accent)] bg-[var(--surface-2)]' : 'border-[var(--border)] hover:bg-[var(--surface-2)]'}`}>{p.name}</button>
          ))}
          <p className="text-[12px] text-[var(--text-faint)]">{tt('Profiles are versioned: a change applies from the next delivery and old reports keep the version they used.')}</p>
        </div>
      )}
      {step === 2 && (
        <div className="flex flex-col gap-4">
          <div className="flex items-center justify-between gap-3"><span className="text-[13px]">{tt('Open an issue when a delivery fails')}</span><Toggle checked={issue} onChange={setIssue} label={tt('Open an issue when a delivery fails')} /></div>
          {issue && (
            <div className="grid gap-4 sm:grid-cols-2">
              <Field label={tt('Assign to')}><select className={inputClass} value={assignee} onChange={(e) => setAssignee(e.target.value)}>{MEMBERS.filter((m) => m.role !== 'guest').map((m) => <option key={m.id} value={m.id}>{m.name}</option>)}</select></Field>
              <Field label={tt('Due in (days)')}><input className={`${inputClass} tabular-nums`} inputMode="numeric" value={dueDays} onChange={(e) => setDueDays(Number(e.target.value.replace(/\D/g, '')) || 1)} /></Field>
            </div>
          )}
          <p className="text-[12px] text-[var(--text-faint)]">{tt('The issue carries the failing rule, the file and a camera on the first failing element. The same file never opens two issues.')}</p>
          <div className="flex items-center justify-between gap-3"><span className="text-[13px]">{tt('Send the result to the webhooks')}</span><Toggle checked={webhook} onChange={setWebhook} label={tt('Send the result to the webhooks')} /></div>
        </div>
      )}
      {step === 3 && (
        <div className="flex flex-col gap-3">
          <p className="text-[12.5px] text-[var(--text-dim)]">{kind === 'folder' ? tt('Run this on the machine that sees the folder. It only uploads new or changed files.') : kind === 'ci' ? tt('Add this step to your pipeline and save the key as a secret.') : tt('Post each file; the answer has the report link, and the webhook follows.')}</p>
          <pre className="rounded-[8px] border border-[var(--border)] bg-[var(--surface-2)] p-3 text-[11.5px] leading-[1.55] overflow-x-auto whitespace-pre"><code>{snippet(kind, profile)}</code></pre>
          <CopyField label={tt('Key for this source')} value="ws_live_9Hc2…preview" secret />
          <p className="text-[12px] text-[var(--text-faint)]">{tt('Preview: the key is not real and nothing is checked until the Team plan opens.')}</p>
        </div>
      )}
    </Dialog>
  )
}

function WebhookDialog({ tt, hook, onClose, onSave }: { tt: TeamTx; hook: Webhook | null; onClose: () => void; onSave: (h: Webhook) => void }) {
  const [name, setName] = useState(hook?.name ?? '')
  const [url, setUrl] = useState(hook?.url ?? '')
  const [events, setEvents] = useState<WebhookEvent[]>(hook?.events ?? ['validation.failed'])
  const [tested, setTested] = useState<null | 'ok' | 'bad'>(null)
  const valid = /^https:\/\/[^\s]+\.[^\s]+/.test(url) && name.trim().length > 1 && events.length > 0
  return (
    <Dialog title={hook ? tt('Edit webhook') : tt('Add a webhook')} onClose={onClose}
      footer={<><Quiet onClick={() => setTested(/^https:\/\//.test(url) ? 'ok' : 'bad')}>{tt('Send a test')}</Quiet><Primary disabled={!valid} onClick={() => onSave({ id: hook?.id ?? `w${Date.now().toString(36)}`, name: name.trim(), url, events, state: hook?.state ?? 'active', deliveries: hook?.deliveries ?? [] })}>{tt('Save')}</Primary></>}>
      <div className="flex flex-col gap-4">
        <Field label={tt('Name')}><input className={inputClass} value={name} placeholder="Slack · #bim" onChange={(e) => setName(e.target.value)} /></Field>
        <Field label="URL" hint={url && !/^https:\/\//.test(url) ? <span className="text-[var(--danger)]">{tt('Use an https:// address.')}</span> : undefined}>
          <input className={inputClass} value={url} placeholder="https://" onChange={(e) => { setUrl(e.target.value); setTested(null) }} /></Field>
        <fieldset className="flex flex-col gap-2">
          <legend className="text-[12px] text-[var(--text-dim)] mb-1">{tt('Events')}</legend>
          {EVENTS.map((ev) => (
            <label key={ev} className="flex items-center gap-2 text-[12.5px] font-mono">
              <input type="checkbox" checked={events.includes(ev)} onChange={(e) => setEvents((all) => (e.target.checked ? [...all, ev] : all.filter((x) => x !== ev)))} />{ev}
            </label>
          ))}
        </fieldset>
        <CopyField label={tt('Signing secret')} value="whsec_3f9a…preview" secret />
        <p className="text-[12px] text-[var(--text-faint)]">{tt('Each call is signed with this secret (HMAC-SHA256 header) so your side can reject anything else.')}</p>
        {tested === 'ok' && <p role="status" className="text-[12.5px] text-[var(--text-dim)]">{tt('Preview: a real test call is sent once the Team plan opens.')}</p>}
        {tested === 'bad' && <p role="alert" className="text-[12.5px] text-[var(--danger)]">{tt('Use an https:// address.')}</p>}
      </div>
    </Dialog>
  )
}
