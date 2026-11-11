// ─── Rules v2 screens ─────────────────────────────────────────────────────────
// Geometry and relation rules by ISO phase, failure → issue with its fix, and
// in the library: impact of a rule change on the model and the free
// requirements link for subcontractors. Logic in rules-v2.ts.

import { useMemo, useState } from 'react'
import { useTranslation } from 'react-i18next'
import type { EirSeverity } from '../../../../lib/eir/eir-types'
import { Panel, Primary, Quiet, Dot, inputClass, Field } from '../../ui'
import { prettyClass, latest, approved, type RuleSet, SAMPLE_MODEL_NAME } from './rules-lib'
import {
  ADVANCED_RULES, PHASES, type Phase, type AdvancedRule, appliesAt, runAdvanced, issueFor, type DraftIssue, type SpatialFailure,
  compareRuleVersions, subcontractorLink,
} from './rules-v2'
import { useR } from './rules-i18n'

const SEV: Record<EirSeverity, string> = { error: 'var(--danger)', warning: 'var(--warn)', info: 'var(--text-dim)', ignored: 'var(--text-faint)' }
const TOOL: Record<string, string> = { revit: 'Revit', archicad: 'Archicad', tekla: 'Tekla', allplan: 'Allplan' }

function PhasePicker({ value, onChange }: { value: Phase; onChange: (p: Phase) => void }) {
  const r = useR()
  return (
    <div role="radiogroup" aria-label={r('ISO 19650 status')} className="flex flex-wrap gap-1.5">
      {PHASES.map((p) => (
        <button key={p} role="radio" aria-checked={value === p} onClick={() => onChange(p)}
          className={`h-[34px] sm:h-[30px] px-3 rounded-[8px] border text-[12.5px] tabular-nums ${value === p ? 'border-[var(--text-dim)] bg-[var(--surface-2)] text-[var(--text)] font-medium' : 'border-[var(--border)] text-[var(--text-dim)]'}`}>{p}</button>
      ))}
    </div>
  )
}

export function AdvancedTab() {
  const r = useR()
  const { i18n } = useTranslation()
  const [phase, setPhase] = useState<Phase>('S4')
  const [issues, setIssues] = useState<Record<string, DraftIssue>>({})
  const [open, setOpen] = useState<DraftIssue | null>(null)
  const results = useMemo(() => ADVANCED_RULES.map((a) => ({ a, on: appliesAt(a.rule.phases, phase), res: runAdvanced(a) })), [phase])

  const label = (a: AdvancedRule) => a.type === 'relation'
    ? r('Every {{a}} sits in a {{b}}', { a: prettyClass(a.rule.entity), b: prettyClass(a.rule.parent) })
    : a.rule.kind === 'clearance' ? r('{{min}} m free in front of every {{a}}', { min: a.rule.min, a: prettyClass(a.rule.entity) })
    : r('Free height of every {{a}} at least {{min}} m', { min: a.rule.min, a: prettyClass(a.rule.entity) })
  const why = (a: AdvancedRule, f: SpatialFailure) => a.type === 'relation' ? r('No host found')
    : r('{{m}} m to {{other}}', { m: f.measured, other: f.other?.name ?? '—' })
  const make = (a: AdvancedRule, f: SpatialFailure) => {
    const i = issueFor(a, f, i18n?.language || 'en', `${label(a)} · ${f.element.name}`)
    setIssues((l) => ({ ...l, [a.rule.id + ':' + f.element.expressId]: l[a.rule.id + ':' + f.element.expressId] ?? i })); setOpen(i)
  }

  return (
    <div className="space-y-4">
      <div className="flex flex-col sm:flex-row sm:items-center gap-3 justify-between">
        <div>
          <p className="text-[13px] font-semibold">{r('Geometry and relation rules')}</p>
          <p className="text-[12.5px] text-[var(--text-dim)] max-w-[620px]">{r('Clearances, free heights and hosts, checked on the geometry of {{model}}. Each rule says at which ISO 19650 status it applies.', { model: SAMPLE_MODEL_NAME })}</p>
        </div>
        <PhasePicker value={phase} onChange={setPhase} />
      </div>
      <div className="grid lg:grid-cols-[minmax(0,1fr)_340px] gap-4">
        <div className="space-y-3 min-w-0">
          {results.map(({ a, on, res }) => (
            <Panel key={a.rule.id} className={`p-4 ${on ? '' : 'opacity-55'}`}>
              <div className="flex items-start gap-2 flex-wrap">
                <Dot color={SEV[a.rule.severity]} />
                <p className="text-[13px] font-medium flex-1 min-w-0 -mt-1">{label(a)}</p>
                <span className="text-[11px] text-[var(--text-faint)]">{a.type === 'spatial' ? r('Geometry') : r('Relation · IDS')} · {(a.rule.phases ?? []).join(' ')}</span>
              </div>
              {!on ? <p className="text-[12px] text-[var(--text-faint)] mt-2">{r('Not required at {{phase}}.', { phase })}</p> : <>
                <p className="text-[12px] text-[var(--text-dim)] mt-1.5">{r('{{checked}} checked · {{failed}} fail', { checked: res.checked, failed: res.failures.length })}</p>
                <ul className="mt-2 divide-y divide-[var(--border)] text-[12.5px]">
                  {res.failures.map((f) => (
                    <li key={f.element.expressId} className="py-1.5 flex items-center gap-2 flex-wrap">
                      <span className="font-medium">{f.element.name}</span>
                      <span className="text-[var(--text-faint)]">{why(a, f)}</span>
                      <Quiet className="ml-auto" onClick={() => make(a, f)}>{issues[a.rule.id + ':' + f.element.expressId] ? r('Issue created') : r('Create issue with the fix')}</Quiet>
                    </li>
                  ))}
                  {res.failures.length === 0 && <li className="py-1.5 text-[var(--ok)]">{r('All pass.')}</li>}
                </ul>
              </>}
            </Panel>
          ))}
        </div>
        <Panel className="p-4 h-fit lg:sticky lg:top-4">
          <p className="text-[13px] font-semibold">{r('Issue')}</p>
          {!open ? <p className="text-[12.5px] text-[var(--text-faint)] mt-2">{r('Pick a failure to open an issue. It carries the element, the rule and how to fix it in each authoring tool.')}</p> : <>
            <p className="text-[12.5px] mt-2 font-medium [overflow-wrap:anywhere]">{open.title}</p>
            <p className="font-mono text-[11px] text-[var(--text-faint)] mt-0.5">{open.guid}</p>
            <p className="text-[11px] uppercase tracking-wide text-[var(--text-faint)] mt-3">{r('How to fix it')}</p>
            <p className="text-[12.5px] mt-1">{open.fixSummary}</p>
            <ul className="mt-2 space-y-2">
              {open.fixSteps.map((s) => <li key={s.tool} className="text-[12px] text-[var(--text-dim)]"><span className="font-medium text-[var(--text)]">{TOOL[s.tool] ?? s.tool}:</span> {s.text}</li>)}
            </ul>
            <p className="text-[11px] text-[var(--text-faint)] mt-3">{r('Guidance written by hand for each rule and tool, the same as the free fix guides.')}</p>
          </>}
          {Object.keys(issues).length > 0 && <p className="text-[12px] mt-3 pt-3 border-t border-[var(--border)] text-[var(--text-dim)]">{r('{{n}} issues ready for the team board.', { n: Object.keys(issues).length })}</p>}
        </Panel>
      </div>
    </div>
  )
}

// ── Library extras: impact of a change on the model, and sharing ─────────────

export function LibraryExtras({ set }: { set: RuleSet }) {
  const r = useR()
  const cur = latest(set)
  const prev = set.versions.length > 1 ? set.versions[set.versions.length - 2] : null
  const impacts = useMemo(() => !prev ? [] : cur.rules.flatMap((after) => {
    const before = prev.rules.find((x) => x.id === after.id)
    return before && JSON.stringify(before) !== JSON.stringify(after) ? [{ id: after.id, entity: after.entity, d: compareRuleVersions(before, after) }] : []
  }), [cur, prev])
  const ok = approved(set)
  const [phase, setPhase] = useState<Phase>('S4')
  const [link, setLink] = useState<{ ok: boolean; text: string } | null>(null)
  const [copied, setCopied] = useState(false)

  async function make() {
    if (!ok) return
    const base = typeof location !== 'undefined' ? location.origin + '/' : 'https://www.ifcvieweronline.eu/'
    const res = await subcontractorLink(base, set.name, 'Constructora Norte', ok.rules, phase)
    setCopied(false)
    setLink(res.ok ? { ok: true, text: res.url } : { ok: false, text: r('The rule set is too long for a link. Split it by discipline.') })
  }

  return (
    <>
      {impacts.length > 0 && prev && (
        <Panel className="p-4">
          <p className="text-[13px] font-semibold">{r('Effect on {{model}}', { model: SAMPLE_MODEL_NAME })}</p>
          <p className="text-[12px] text-[var(--text-dim)] mt-0.5">{r('Same model, v{{a}} against v{{b}}: who starts or stops failing before you approve.', { a: prev.version, b: cur.version })}</p>
          {impacts.map(({ id, entity, d }) => (
            <div key={id} className="mt-3 text-[12.5px]">
              <p className="font-medium">{entity} · {r('{{a}} fail → {{b}} fail', { a: d.before, b: d.after })}</p>
              {d.newlyPassing.length > 0 && <p className="text-[var(--warn)]">{r('Stop failing:')} {d.newlyPassing.map((e) => e.name).join(', ')}</p>}
              {d.newlyFailing.length > 0 && <p className="text-[var(--danger)]">{r('Start failing:')} {d.newlyFailing.map((e) => e.name).join(', ')}</p>}
              {d.newlyFailing.length + d.newlyPassing.length === 0 && <p className="text-[var(--text-faint)]">{r('No element changes on this model.')}</p>}
            </div>
          ))}
        </Panel>
      )}
      <Panel className="p-4">
        <p className="text-[13px] font-semibold">{r('Give it to your subcontractors')}</p>
        <p className="text-[12px] text-[var(--text-dim)] mt-0.5">{r('A requirements link with the approved version for one status. They check their model free in their browser, without an account. Geometry rules stay here.')}</p>
        {!ok ? <p className="text-[12px] text-[var(--text-faint)] mt-2">{r('Approve a version first.')}</p> : <>
          <div className="flex flex-col sm:flex-row gap-3 sm:items-end mt-3">
            <Field label={r('ISO 19650 status')}><PhasePicker value={phase} onChange={(p) => { setPhase(p); setLink(null) }} /></Field>
            <Primary onClick={() => void make()}>{r('Create link for v{{v}}', { v: ok.version })}</Primary>
          </div>
          {link && (link.ok
            ? <div className="flex gap-2 mt-3"><input readOnly aria-label={r('Link')} className={`${inputClass} font-mono text-[11.5px]`} value={link.text} /><Quiet onClick={() => { void navigator.clipboard?.writeText(link.text); setCopied(true) }}>{copied ? r('Copied') : r('Copy')}</Quiet></div>
            : <p className="text-[12px] mt-2 text-[var(--danger)]">{link.text}</p>)}
        </>}
      </Panel>
    </>
  )
}
