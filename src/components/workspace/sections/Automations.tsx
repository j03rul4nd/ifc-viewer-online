import { useEffect, useState } from 'react'
import { paidApi, type ApiAutomation, type ApiBacktest } from '../../../lib/cloud/paid-client'
import { usePaidQuery } from '../../../hooks/usePaidQuery'
import type { SectionProps } from '../registry'
import { DataList, Dialog, Field, Head, Panel, Primary, Quiet, SectionLabel, Tabs, Toggle, fmtInt, inputClass } from '../ui'
import { SoonBanner } from '../Soon'
import { useTx } from '../i18n'

type Trigger = 'version' | 'delivery' | 'overdue'
type Audience = 'contractor' | 'studio' | 'owner'
type Cond = 'score_below' | 'score_drop' | 'clean' | 'overdue_days'
type Act = 'issue' | 'notify' | 'share' | 'escalate'

interface Rule { id: string; name: string; trigger: Trigger; cond: Cond; value: number; contains: string; act: Act; minutes: number; on: boolean; runs: number }
interface Recipe extends Omit<Rule, 'id' | 'on' | 'runs'> { why: string; for: Audience[] }

const ACTS_FOR: Record<Trigger, Act[]> = { version: ['issue', 'notify', 'share'], delivery: ['issue', 'notify'], overdue: ['escalate', 'notify'] }
const CONDS_FOR: Record<Trigger, Cond[]> = { version: ['score_below', 'score_drop', 'clean'], delivery: ['score_below', 'clean'], overdue: ['overdue_days'] }

/** A sample history to try a rule on; the API runs this on the company's last 90 days. */
const HISTORY: Record<Exclude<Trigger, 'overdue'>, { name: string; score: number; drop: number; failed: number }[]> = {
  version: [
    { name: 'HCA_ARQ_v6.ifc', score: 88, drop: -2, failed: 0 }, { name: 'HCA_MEP_v5.ifc', score: 74, drop: 8, failed: 2 }, { name: 'HCA_EST_v4.ifc', score: 71, drop: 6, failed: 3 },
    { name: 'CEIP_ARQ_v3.ifc', score: 91, drop: 0, failed: 0 }, { name: 'CEIP_MEP_v2.ifc', score: 79, drop: 1, failed: 1 }, { name: 'NAVE_EST_v7.ifc', score: 84, drop: -3, failed: 0 },
  ],
  delivery: [
    { name: 'HCA_MEP_v5.ifc', score: 84, drop: 0, failed: 0 }, { name: 'HCA_EST_v4.ifc', score: 71, drop: 0, failed: 3 }, { name: 'HCA_FAC_v2.ifc', score: 79, drop: 0, failed: 1 }, { name: 'HCA_ARQ_v6.ifc', score: 88, drop: 0, failed: 0 },
  ],
}

export function wouldFire(r: Pick<Rule, 'trigger' | 'cond' | 'value' | 'contains'>): string[] {
  if (r.trigger === 'overdue') return []
  return HISTORY[r.trigger].filter((h) => {
    if (r.contains && !h.name.toLowerCase().includes(r.contains.toLowerCase())) return false
    if (r.cond === 'score_below') return h.score < r.value
    if (r.cond === 'score_drop') return h.drop >= r.value
    return h.score >= r.value && h.failed === 0
  }).map((h) => h.name)
}

const API_TRIGGER = { version: 'version.validated', delivery: 'delivery.validated', overdue: 'issue.overdue' } as const
const API_COND: Record<Cond, (v: number) => Record<string, unknown>> = {
  score_below: (v) => ({ score_below: v }), score_drop: (v) => ({ score_drop_at_least: v }), clean: (v) => ({ score_at_least: v, no_failed_specs: true }), overdue_days: (v) => ({ days_overdue_at_least: v }),
}
const conditionsOf = (r: Pick<Rule, 'cond' | 'value' | 'contains'>) => ({ ...API_COND[r.cond](r.value), ...(r.contains.trim() ? { name_contains: r.contains.trim() } : {}) })
const actionOf = (r: Pick<Rule, 'act' | 'name'>): Record<string, unknown> => (
  r.act === 'issue' ? { type: 'create_issue', title: '{{name}}: {{score}}', priority: 'high', due_days: 3 }
    : r.act === 'notify' ? { type: 'notify', message: `${r.name}: {{name}} ({{score}})` }
      : r.act === 'share' ? { type: 'share_version' } : { type: 'escalate_issue', priority: 'high' })

/** A rule as the API keeps it, in the shape the list and the form use. */
export function ruleFromApi(a: ApiAutomation): Rule {
  const c = a.conditions as Record<string, number | string | boolean | undefined>
  const t = (a.actions[0]?.type as string | undefined) ?? 'notify'
  const cond: Cond = c.score_drop_at_least !== undefined ? 'score_drop' : c.no_failed_specs ? 'clean' : c.days_overdue_at_least !== undefined ? 'overdue_days' : 'score_below'
  return { id: a.id, name: a.name, trigger: a.trigger === 'version.validated' ? 'version' : a.trigger === 'delivery.validated' ? 'delivery' : 'overdue', cond, value: Number(c.score_drop_at_least ?? c.score_at_least ?? c.days_overdue_at_least ?? c.score_below ?? 0), contains: String(c.name_contains ?? ''), act: t === 'create_issue' ? 'issue' : t === 'share_version' ? 'share' : t === 'escalate_issue' ? 'escalate' : 'notify', minutes: a.minutes_saved, on: a.enabled, runs: a.runs_30d ?? 0 }
}

const BLANK: Omit<Rule, 'id' | 'on' | 'runs'> = { name: '', trigger: 'version', cond: 'score_below', value: 80, contains: '', act: 'issue', minutes: 15 }

/** The coordinator's routine, built once. Tried on real history before it runs; never publishes by itself. */
export default function Automations(_: SectionProps) {
  const tx = useTx()
  const RECIPES: Recipe[] = [
    { name: tx('Stop bad supplier models at the door'), why: tx('A failing delivery goes back with its report before anyone on your team opens it.'), for: ['contractor', 'owner'], trigger: 'delivery', cond: 'score_below', value: 80, contains: '', act: 'notify', minutes: 45 },
    { name: tx('Catch a model that got worse'), why: tx('A drop between revisions opens an issue for its discipline lead, due in 3 days.'), for: ['contractor', 'studio'], trigger: 'version', cond: 'score_drop', value: 5, contains: '', act: 'issue', minutes: 20 },
    { name: tx('Clean models go to Shared by themselves'), why: tx('If it meets your standard it reaches the team now. Publishing still needs the gate and a reviewer.'), for: ['studio', 'contractor'], trigger: 'version', cond: 'clean', value: 80, contains: '', act: 'share', minutes: 10 },
    { name: tx('Chase overdue issues for you'), why: tx('Two days late, it rises in priority and moves to the project manager.'), for: ['contractor', 'studio', 'owner'], trigger: 'overdue', cond: 'overdue_days', value: 2, contains: '', act: 'escalate', minutes: 10 },
    { name: tx('Check as-built handover data'), why: tx('An as-built file under your standard opens an issue while the contractor can still fix it.'), for: ['owner'], trigger: 'delivery', cond: 'score_below', value: 90, contains: 'as-built', act: 'issue', minutes: 30 },
    { name: tx('Warn the MEP lead in Teams or Slack'), why: tx('Only MEP files, only when they fail, sent through your webhook.'), for: ['contractor'], trigger: 'version', cond: 'score_below', value: 70, contains: 'mep', act: 'notify', minutes: 10 },
  ]
  const AUDIENCES = [{ id: 'contractor' as const, label: tx('Contractor') }, { id: 'studio' as const, label: tx('Design studio') }, { id: 'owner' as const, label: tx('Owner or developer') }]
  const TRIGGER: Record<Trigger, string> = { version: tx('A version is validated'), delivery: tx('A supplier delivery is validated'), overdue: tx('An issue is overdue') }
  const ACT: Record<Act, string> = { issue: tx('Open an issue'), notify: tx('Notify through a webhook'), share: tx('Move it to Shared'), escalate: tx('Raise priority and reassign') }
  const COND: Record<Cond, string> = { score_below: tx('Score below'), score_drop: tx('Score dropped by at least'), clean: tx('No failed specs and score of at least'), overdue_days: tx('Days overdue, at least') }

  const [audience, setAudience] = useState<Audience>('contractor')
  const [rules, setRules] = useState<Rule[]>([
    { id: 'r1', name: tx('Catch a model that got worse'), trigger: 'version', cond: 'score_drop', value: 5, contains: '', act: 'issue', minutes: 20, on: true, runs: 14 },
    { id: 'r2', name: tx('Stop bad supplier models at the door'), trigger: 'delivery', cond: 'score_below', value: 80, contains: '', act: 'notify', minutes: 45, on: true, runs: 9 },
  ])
  const [draft, setDraft] = useState<Omit<Rule, 'id' | 'on' | 'runs'> | null>(null)
  const minutes = rules.reduce((a, r) => a + r.runs * r.minutes, 0)
  const set = <K extends keyof Rule>(k: K, v: Rule[K]) => setDraft((d) => (d ? { ...d, [k]: v } : d))
  const setTrigger = (t: Trigger) => setDraft((d) => (d ? { ...d, trigger: t, cond: CONDS_FOR[t][0], act: ACTS_FOR[t][0] } : d))
  const q = usePaidQuery(() => paidApi.automations(), { automations: [] as ApiAutomation[] })
  const live = q.source === 'live'
  useEffect(() => { if (live) setRules(q.data.automations.map(ruleFromApi)) }, [live, q.data])
  const [real, setReal] = useState<ApiBacktest | null>(null)
  const [err, setErr] = useState<string | null>(null)
  useEffect(() => {
    setReal(null)
    if (!live || !draft || draft.trigger === 'overdue') return
    const trigger = API_TRIGGER[draft.trigger]
    const t = setTimeout(() => { void paidApi.backtest(trigger, conditionsOf(draft), draft.minutes).then((r) => { if (r.ok) setReal(r.value) }) }, 400)
    return () => clearTimeout(t)
  }, [live, draft])
  const hits = real ? real.examples.map((e) => e.name) : draft ? wouldFire(draft) : []
  const hitCount = real ? real.would_fire : hits.length
  const toggle = (r: Rule, on: boolean) => {
    setRules((all) => all.map((x) => (x.id === r.id ? { ...x, on } : x)))
    if (live) void paidApi.patchAutomation(r.id, { enabled: on }).then((x) => { if (!x.ok) { setErr(x.error.message ?? x.error.code); q.reload() } })
  }
  const create = async (d: NonNullable<typeof draft>) => {
    if (live) {
      const r = await paidApi.createAutomation({ name: d.name.trim(), enabled: true, trigger: API_TRIGGER[d.trigger], conditions: conditionsOf(d), actions: [actionOf(d)], minutes_saved: d.minutes })
      if (!r.ok) { setErr(r.error.message ?? r.error.code); return }
      q.reload()
    } else setRules((all) => [...all, { ...d, id: `r${Date.now().toString(36)}`, on: true, runs: 0 }])
    setErr(null); setDraft(null)
  }

  return (
    <>
      <Head title={tx('Automations')} sub={tx('The routine checks and chasing of a BIM coordinator, done every time, by rules you own.')} action={<Primary onClick={() => setDraft(BLANK)}>{tx('New automation')}</Primary>} />
      <SoonBanner section="automations" source={q.source} error={q.error} />
      {err && <p role="alert" className="mt-3 text-[12.5px] text-[var(--danger)]">{err}</p>}

      <div className="mt-6 mb-8">
        <SectionLabel>{tx('Running now')}</SectionLabel>
        <p className="mb-3 text-[13px] text-[var(--text-dim)]">{tx('{{runs}} firings in 30 days, about {{hours}} hours by your own estimates.', { runs: rules.reduce((a, r) => a + r.runs, 0), hours: fmtInt(Math.round(minutes / 60)) })}</p>
        <DataList rows={rules} rowKey={(r) => r.id} primaryHeader={tx('Automation')}
          primary={(r) => <><p className="font-medium [overflow-wrap:anywhere]">{r.name}</p><p className="text-[11.5px] text-[var(--text-faint)]">{TRIGGER[r.trigger]} → {ACT[r.act]}</p></>}
          columns={[
            { key: 'runs', header: tx('In 30 days'), cell: (r) => <span className="text-[12.5px] tabular-nums">{fmtInt(r.runs)}</span> },
            { key: 'each', header: tx('Saves each time'), hideOnPhone: true, cell: (r) => <span className="text-[12.5px] tabular-nums whitespace-nowrap">{r.minutes} min</span> },
          ]}
          actions={(r) => <Toggle checked={r.on} label={r.name} onChange={(on) => toggle(r, on)} />} />
      </div>

      <SectionLabel>{tx('Start from your situation')}</SectionLabel>
      <div className="mb-3"><Tabs tabs={AUDIENCES} value={audience} onChange={setAudience} label={tx('Start from your situation')} /></div>
      <div className="grid gap-3 sm:grid-cols-2 mb-8">
        {RECIPES.filter((r) => r.for.includes(audience)).map((r) => (
          <Panel key={r.name} className="p-4 flex flex-col gap-2 min-w-0">
            <p className="text-[13.5px] font-medium">{r.name}</p>
            <p className="flex-1 text-[12.5px] leading-[1.5] text-[var(--text-dim)]">{r.why}</p>
            <div className="pt-1"><Quiet onClick={() => { const { why: _w, for: _f, ...rest } = r; setDraft(rest) }}>{tx('Use this')}</Quiet></div>
          </Panel>
        ))}
      </div>

      {draft && (
        <Dialog title={draft.name || tx('New automation')} size="lg" onClose={() => setDraft(null)}
          footer={<><Quiet onClick={() => setDraft(null)}>{tx('Cancel')}</Quiet><Primary disabled={draft.name.trim().length < 3} onClick={() => void create(draft)}>{tx('Turn on')}</Primary></>}>
          <div className="flex flex-col gap-4">
            <Field label={tx('Name')}><input className={inputClass} value={draft.name} onChange={(e) => set('name', e.target.value)} /></Field>
            <Field label={tx('When')}>
              <select className={inputClass} value={draft.trigger} onChange={(e) => setTrigger(e.target.value as Trigger)}>{(Object.keys(TRIGGER) as Trigger[]).map((t) => <option key={t} value={t}>{TRIGGER[t]}</option>)}</select>
            </Field>
            <div className="grid gap-4 sm:grid-cols-[1fr_96px]">
              <Field label={tx('If')}>
                <select className={inputClass} value={draft.cond} onChange={(e) => set('cond', e.target.value as Cond)}>{CONDS_FOR[draft.trigger].map((c) => <option key={c} value={c}>{COND[c]}</option>)}</select>
              </Field>
              <Field label={tx('Value')}><input className={`${inputClass} tabular-nums`} inputMode="numeric" value={draft.value} onChange={(e) => set('value', Number(e.target.value.replace(/\D/g, '')))} /></Field>
            </div>
            {draft.trigger !== 'overdue' && <Field label={`${tx('And the file name contains')} · ${tx('optional')}`}><input className={inputClass} placeholder="MEP" value={draft.contains} onChange={(e) => set('contains', e.target.value)} /></Field>}
            <Field label={tx('Then')}>
              <select className={inputClass} value={draft.act} onChange={(e) => set('act', e.target.value as Act)}>{ACTS_FOR[draft.trigger].map((a) => <option key={a} value={a}>{ACT[a]}</option>)}</select>
            </Field>
            <Field label={tx('Minutes this saves each time')} hint={tx('Your estimate. It feeds the value report, which shows it as an assumption.')}><input className={`${inputClass} tabular-nums`} inputMode="numeric" value={draft.minutes} onChange={(e) => set('minutes', Number(e.target.value.replace(/\D/g, '')))} /></Field>
            {draft.trigger !== 'overdue' && (
              <Panel className="p-3 min-w-0">
                <p className="text-[12.5px] font-medium">{tx('On your last 90 days this would have fired {{n}} times', { n: hitCount })}</p>
                {hits.length > 0 && <p className="mt-1 text-[12px] text-[var(--text-dim)] [overflow-wrap:anywhere]">{hits.join(', ')}</p>}
              </Panel>
            )}
          </div>
        </Dialog>
      )}
    </>
  )
}
