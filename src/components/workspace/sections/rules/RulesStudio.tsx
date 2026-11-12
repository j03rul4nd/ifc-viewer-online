// ─── Rules · rule studio (Pro) and company library (Team) ────────────────────
// Writing rules, testing them and seeing what they cover runs on the real
// engine (rules-lib). The model is a sample and the library lives in this
// screen's state until a backend exists. The free EIR editor and IDS checks
// in the viewer stay free; this is the authoring and governance layer.

import { useEffect, useMemo, useRef, useState } from 'react'
import { usePaidDataSource } from '../../../../hooks/usePaidQuery'
import { loadLibrary, saveSet, type Synced, type SyncMap } from './library-sync'
import type { SectionProps } from '../../registry'
import type { EirRule, EirSeverity, NumericOperator } from '../../../../lib/eir/eir-types'
import { Head, Panel, Primary, Quiet, Banner, Dot, Tabs, inputClass, Field, useSubTab } from '../../ui'
import {
  SAMPLE_ELEMENTS, SAMPLE_MODEL_NAME, ENTITIES, SEVERITIES, RULE_KINDS, type RuleKind, ruleOfKind, DEFAULT_RULE, DEFAULT_TESTS,
  previewRule, ruleIdsXml, runTests, type RuleTest, type Expectation, coverage, prettyClass, TEMPLATES, templateScore,
  SAMPLE_LIBRARY, type RuleSet, latest, approved, diffRules, submitForReview, approveLatest, addComment, newVersion,
  exportSetIds, importIds, newId,
} from './rules-lib'
import { useR } from './rules-i18n'
import { AdvancedTab, LibraryExtras } from './AdvancedRules'

const TABS = [
  { id: 'editor', label: 'Editor' }, { id: 'advanced', label: 'Geometry and relations' }, { id: 'tests', label: 'Tests' }, { id: 'coverage', label: 'Coverage' },
  { id: 'templates', label: 'Templates' }, { id: 'library', label: 'Library' },
] as const
type Tab = (typeof TABS)[number]['id']

const SEV_COLOR: Record<EirSeverity, string> = { error: 'var(--danger)', warning: 'var(--warn)', info: 'var(--text-dim)', ignored: 'var(--text-faint)' }
const ME = 'Marta Vidal'
const TODAY = '2026-11-11'

function download(name: string, text: string) {
  const url = URL.createObjectURL(new Blob([text], { type: 'application/xml' }))
  const a = document.createElement('a'); a.href = url; a.download = name; a.click()
  setTimeout(() => URL.revokeObjectURL(url), 1000)
}

export default function RulesStudio(_: SectionProps) {
  const r = useR()
  const [tab, setTab] = useSubTab<Tab>('rules', TABS)
  const [rule, setRule] = useState<EirRule>(DEFAULT_RULE)
  const live = usePaidDataSource() !== 'sample'
  // Preview: the sample library. Workspace (local/cloud): the server's, empty until loaded.
  const [library, setLibrary] = useState<RuleSet[]>(live ? [] : SAMPLE_LIBRARY)
  const [sync, setSync] = useState<SyncMap>({})
  const [syncMsg, setSyncMsg] = useState<string | null>(null)
  const [conflict, setConflict] = useState<{ mine: RuleSet; theirs: RuleSet; synced: Synced } | null>(null)
  const before = useRef<RuleSet[] | null>(null)
  useEffect(() => {
    if (!live) return
    void loadLibrary().then((res) => {
      if (!res.ok) { setSyncMsg(r('Could not load the library ({{error}}). Nothing was changed.', { error: res.error.code })); return }
      before.current = res.sets
      setLibrary(res.sets); setSync(res.sync)
    })
  }, [live]) // eslint-disable-line react-hooks/exhaustive-deps
  // Save every set that changed, one request each, with the version the screen loaded.
  useEffect(() => {
    if (!live || before.current === null) return
    const prev = before.current
    before.current = library
    for (const set of library) {
      if (prev.includes(set)) continue
      void saveSet(set, sync[set.id]).then((res) => {
        if (res.ok) { setSync((m) => ({ ...m, [set.id]: res.synced })); setSyncMsg(r('Saved in the workspace.')); return }
        if ('conflict' in res) { setConflict({ mine: set, theirs: res.conflict, synced: res.synced }); return }
        setSyncMsg(r('Not saved ({{error}}). Your change is still on screen; try again.', { error: res.error.code }))
      })
    }
  }, [library]) // eslint-disable-line react-hooks/exhaustive-deps
  const keepTheirs = () => {
    if (!conflict) return
    before.current = library.map((x) => (x.id === conflict.mine.id ? conflict.theirs : x))
    setLibrary(before.current); setSync((m) => ({ ...m, [conflict.mine.id]: conflict.synced })); setConflict(null)
  }
  const keepMine = () => {
    if (!conflict) return
    const c = conflict
    setConflict(null)
    void saveSet(c.mine, c.synced).then((res) => {
      if (res.ok) { setSync((m) => ({ ...m, [c.mine.id]: res.synced })); setSyncMsg(r('Saved in the workspace.')) }
      else if ('conflict' in res) setConflict({ mine: c.mine, theirs: res.conflict, synced: res.synced })
      else setSyncMsg(r('Not saved ({{error}}). Your change is still on screen; try again.', { error: res.error.code }))
    })
  }
  const useInEditor = (x: EirRule) => { setRule({ ...x, id: 'draft' }); setTab('editor') }

  return (
    <>
      <Head title={r('Rules')} sub={r('Write your own rules as a sentence, test them, see what they cover and govern them as a company. Every rule is IDS 1.0, so it runs in any checker.')} />
      <Banner tone="info" title={r('Preview on a sample model · Pro and Team plans')}>
        {r('Checking against your rules stays free in the viewer. Writing, testing and governing rules here is part of Pro; the shared library with approval is Team.')}
      </Banner>
      {syncMsg && <p role="status" className="text-[12.5px] text-[var(--text-dim)] mb-2">{syncMsg}</p>}
      {conflict && (
        <Banner tone="warn" title={r('Someone else saved “{{name}}” while you were editing it', { name: conflict.mine.name })}>
          <p className="text-[12.5px]">{r('Yours: v{{a}} · Theirs: v{{b}}. Nothing was overwritten. Choose which one stays.', { a: latest(conflict.mine).version, b: latest(conflict.theirs).version })}</p>
          <div className="flex gap-2 mt-2"><Primary onClick={keepTheirs}>{r('Keep theirs')}</Primary><Quiet onClick={keepMine}>{r('Keep mine')}</Quiet></div>
        </Banner>
      )}
      <Tabs tabs={TABS.map((t) => ({ id: t.id, label: t.id === 'library' ? `${r('Library')} · Team` : r(t.label) }))} value={tab} onChange={setTab} label={r('Rules')} />
      {tab === 'editor' && <Editor rule={rule} setRule={setRule} onSave={(set) => setLibrary((l) => l.map((s) => s.id === set ? newVersion(s, ME, TODAY, [...latest(s).rules.filter((x) => x.id !== rule.id), { ...rule, id: rule.id === 'draft' ? newId() : rule.id }], r('Rule added from the editor.')) : s))} library={library} />}
      {tab === 'advanced' && <AdvancedTab />}
      {tab === 'tests' && <TestsTab rule={rule} />}
      {tab === 'coverage' && <CoverageTab library={library} />}
      {tab === 'templates' && <TemplatesTab onUse={useInEditor} onAdopt={(t) => { setLibrary((l) => [...l, { id: newId(), name: t.profile.name, discipline: t.discipline, versions: [{ version: 1, author: ME, date: TODAY, status: 'draft', note: r('From the template {{name}}.', { name: t.standard }), rules: t.profile.rules }], comments: [] }]); setTab('library') }} />}
      {tab === 'library' && <LibraryTab library={library} setLibrary={setLibrary} onUse={useInEditor} />}
    </>
  )
}

// ── Editor: condition → requirement → severity, with a live preview ──────────

function kindOf(rule: EirRule): RuleKind {
  return (RULE_KINDS as readonly string[]).includes(rule.type) ? rule.type as RuleKind : 'propertyNotEmpty'
}

function Editor({ rule, setRule, onSave, library }: { rule: EirRule; setRule: (r: EirRule) => void; onSave: (setId: string) => void; library: RuleSet[] }) {
  const r = useR()
  const preview = useMemo(() => previewRule(rule), [rule])
  const xml = useMemo(() => ruleIdsXml(rule, r('Rule')), [rule, r])
  const [showXml, setShowXml] = useState(false)
  const [target, setTarget] = useState(library[0]?.id ?? '')
  const [saved, setSaved] = useState(false)
  const set = (patch: Partial<EirRule>) => { setSaved(false); setRule({ ...rule, ...patch } as EirRule) }
  const anyRule = rule as EirRule & { pset?: string; property?: string; values?: string[]; operator?: NumericOperator; value?: number | string; pattern?: string; system?: string; target?: string }

  return (
    <div className="grid lg:grid-cols-[minmax(0,1fr)_minmax(0,1fr)] gap-4">
      <Panel className="p-4">
        <p className="text-[11px] font-semibold uppercase tracking-wide text-[var(--text-faint)] mb-2">1 · {r('Which elements')}</p>
        <div className="grid sm:grid-cols-2 gap-3">
          <Field label={r('For every')}>
            <select className={inputClass} value={rule.entity} onChange={(e) => set({ entity: e.target.value })}>{ENTITIES.map((x) => <option key={x}>{x}</option>)}</select>
          </Field>
          <Field label={r('Only where (optional)')}>
            <select className={inputClass} value={rule.where ? `${rule.where.property}=${rule.where.value}` : ''}
              onChange={(e) => { const [property, value] = e.target.value.split('='); set({ where: e.target.value ? { pset: `Pset_${rule.entity.replace(/^Ifc/, '')}Common`, property, value } : undefined }) }}>
              <option value="">{r('All of them')}</option>
              <option value="IsExternal=true">IsExternal = true</option>
              <option value="IsExternal=false">IsExternal = false</option>
              <option value="LoadBearing=true">LoadBearing = true</option>
            </select>
          </Field>
        </div>
        <p className="text-[11px] font-semibold uppercase tracking-wide text-[var(--text-faint)] mt-4 mb-2">2 · {r('Must have')}</p>
        <Field label={r('Requirement')}>
          <select className={inputClass} value={kindOf(rule)} onChange={(e) => setRule(ruleOfKind(e.target.value as RuleKind, { id: rule.id, entity: rule.entity, severity: rule.severity, where: rule.where }))}>
            <option value="propertyNotEmpty">{r('A property with a value')}</option>
            <option value="allowedValues">{r('A value from a list')}</option>
            <option value="numeric">{r('A number within a limit')}</option>
            <option value="regex">{r('A name or code with a pattern')}</option>
            <option value="classification">{r('A classification')}</option>
            <option value="requiredPropertySet">{r('A property set')}</option>
          </select>
        </Field>
        <div className="grid sm:grid-cols-2 gap-3 mt-3">
          {anyRule.pset !== undefined && rule.type !== 'regex' && <Field label={r('Property set')}><input className={inputClass} value={anyRule.pset ?? ''} onChange={(e) => set({ pset: e.target.value } as Partial<EirRule>)} /></Field>}
          {anyRule.property !== undefined && <Field label={rule.type === 'regex' ? r('Attribute') : r('Property')}><input className={inputClass} value={anyRule.property ?? ''} onChange={(e) => set({ property: e.target.value } as Partial<EirRule>)} /></Field>}
          {rule.type === 'allowedValues' && <Field label={r('Allowed values, comma separated')} className="sm:col-span-2"><input className={inputClass} value={anyRule.values!.join(', ')} onChange={(e) => set({ values: e.target.value.split(',').map((s) => s.trim()).filter(Boolean) } as Partial<EirRule>)} /></Field>}
          {rule.type === 'numeric' && <>
            <Field label={r('Comparison')}><select className={inputClass} value={anyRule.operator} onChange={(e) => set({ operator: e.target.value as NumericOperator } as Partial<EirRule>)}>{['<', '<=', '=', '>=', '>'].map((o) => <option key={o}>{o}</option>)}</select></Field>
            <Field label={r('Limit')}><input type="number" step="any" className={inputClass} value={String(anyRule.value)} onChange={(e) => set({ value: Number(e.target.value) } as Partial<EirRule>)} /></Field>
          </>}
          {rule.type === 'regex' && <Field label={r('Pattern')}><input className={`${inputClass} font-mono`} value={anyRule.pattern} onChange={(e) => set({ pattern: e.target.value } as Partial<EirRule>)} /></Field>}
          {rule.type === 'classification' && <Field label={r('System')}><select className={inputClass} value={anyRule.system} onChange={(e) => set({ system: e.target.value } as Partial<EirRule>)}>{['GuBIMClass', 'Uniclass 2015', 'OmniClass'].map((o) => <option key={o}>{o}</option>)}</select></Field>}
        </div>
        <p className="text-[11px] font-semibold uppercase tracking-wide text-[var(--text-faint)] mt-4 mb-2">3 · {r('If it fails')}</p>
        <div role="radiogroup" aria-label={r('Severity')} className="flex flex-wrap gap-1.5">
          {SEVERITIES.map((s) => (
            <button key={s} role="radio" aria-checked={rule.severity === s} onClick={() => set({ severity: s })}
              className={`inline-flex items-center gap-1.5 h-[34px] sm:h-[30px] px-3 rounded-[8px] border text-[12.5px] ${rule.severity === s ? 'border-[var(--text-dim)] text-[var(--text)] bg-[var(--surface-2)]' : 'border-[var(--border)] text-[var(--text-dim)]'}`}>
              <Dot color={SEV_COLOR[s]} />{s === 'error' ? r('Error') : s === 'warning' ? r('Warning') : r('Info')}
            </button>
          ))}
        </div>
        <div className="mt-5 pt-4 border-t border-[var(--border)] flex flex-col sm:flex-row gap-2 sm:items-end">
          <Field label={r('Add to the company set')} className="flex-1">
            <select className={inputClass} value={target} onChange={(e) => { setTarget(e.target.value); setSaved(false) }}>{library.map((s) => <option key={s.id} value={s.id}>{s.name}</option>)}</select>
          </Field>
          <Primary disabled={!preview.ok || !target} onClick={() => { onSave(target); setSaved(true) }}>{r('Save as new draft version')}</Primary>
        </div>
        {saved && <p role="status" className="text-[12px] mt-2 text-[var(--ok)]">{r('Saved as a draft. It needs a reviewer before anyone uses it.')}</p>}
      </Panel>

      <div className="space-y-4 min-w-0">
        <Panel className="p-4">
          <div className="flex items-baseline justify-between gap-2 flex-wrap">
            <p className="text-[13px] font-semibold">{r('Live preview')}</p>
            <p className="text-[11.5px] text-[var(--text-faint)]">{SAMPLE_MODEL_NAME} · {r('{{n}} elements', { n: SAMPLE_ELEMENTS.length })}</p>
          </div>
          {!preview.ok ? <p className="text-[12.5px] text-[var(--danger)] mt-2">{r('This rule is not complete yet.')}</p> : <>
            <div className="grid grid-cols-3 gap-2 mt-3 text-center">
              <Stat label={r('Checked')} value={preview.applicable.length} />
              <Stat label={r('Pass')} value={preview.passed.length} color="var(--ok)" />
              <Stat label={r('Fail')} value={preview.failed.length} color={SEV_COLOR[rule.severity]} />
            </div>
            <ul className="mt-3 divide-y divide-[var(--border)] text-[12.5px]">
              {preview.failed.map(({ element }) => <li key={element.expressId} className="py-1.5 flex gap-2 items-center"><Dot color={SEV_COLOR[rule.severity]} /><span className="font-medium">{element.name}</span><span className="ml-auto font-mono text-[11px] text-[var(--text-faint)] hidden sm:inline">{element.globalId}</span></li>)}
              {preview.passed.map((e) => <li key={e.expressId} className="py-1.5 flex gap-2 items-center text-[var(--text-dim)]"><Dot color="var(--ok)" />{e.name}<span className="ml-auto font-mono text-[11px] text-[var(--text-faint)] hidden sm:inline">{e.globalId}</span></li>)}
              {preview.applicable.length === 0 && <li className="py-2 text-[var(--text-faint)]">{r('No element of the sample model matches. Check the class and the condition.')}</li>}
            </ul>
          </>}
        </Panel>
        <Panel className="p-4">
          <div className="flex items-center justify-between gap-2">
            <p className="text-[13px] font-semibold">IDS 1.0</p>
            <span className="flex gap-1.5">
              <Quiet onClick={() => setShowXml(!showXml)}>{showXml ? r('Hide') : r('Show')}</Quiet>
              <Quiet disabled={!xml} onClick={() => download('rule.ids', xml)}>{r('Download .ids')}</Quiet>
            </span>
          </div>
          <p className="text-[12px] text-[var(--text-dim)] mt-1">{r('The same rule as buildingSMART IDS 1.0. Your suppliers can check it free in the viewer or in any IDS checker.')}</p>
          {showXml && <pre className="mt-3 max-h-[260px] overflow-auto rounded-[8px] bg-[var(--surface-2)] p-3 text-[11px] leading-[1.45] font-mono whitespace-pre">{xml}</pre>}
        </Panel>
      </div>
    </div>
  )
}

function Stat({ label, value, color }: { label: string; value: number; color?: string }) {
  return <div className="rounded-[8px] bg-[var(--surface-2)] py-2"><p className="text-[20px] font-semibold tabular-nums" style={color ? { color } : undefined}>{value}</p><p className="text-[11px] text-[var(--text-faint)]">{label}</p></div>
}

// ── Tests: "this element must pass / fail / not apply" ───────────────────────

function TestsTab({ rule }: { rule: EirRule }) {
  const r = useR()
  const [tests, setTests] = useState<RuleTest[]>(DEFAULT_TESTS)
  const [ran, setRan] = useState(false)
  const outcomes = useMemo(() => runTests(rule, tests), [rule, tests])
  const label = (x: Expectation) => x === 'pass' ? r('Passes') : x === 'fail' ? r('Fails') : r('Does not apply')
  const bad = outcomes.filter((o) => !o.ok).length
  return (
    <Panel className="p-4">
      <p className="text-[13px] font-semibold">{r('Test the rule before you publish it')}</p>
      <p className="text-[12.5px] text-[var(--text-dim)] mt-1 max-w-[640px]">{r('Pick sample elements and say what should happen. A rule that publishes wrong blocks every supplier; a test catches it first.')}</p>
      <div className="overflow-x-auto mt-3">
        <table className="w-full text-[12.5px] min-w-[480px]">
          <thead><tr className="text-left text-[11px] text-[var(--text-faint)]"><th className="py-1.5 font-medium">{r('Element')}</th><th className="font-medium">{r('Expected')}</th><th className="font-medium">{r('Result')}</th><th /></tr></thead>
          <tbody className="divide-y divide-[var(--border)]">
            {outcomes.map(({ test, got, ok }) => (
              <tr key={test.id}>
                <td className="py-1.5 pr-2"><select className={inputClass} value={test.expressId} onChange={(e) => setTests(tests.map((t) => t.id === test.id ? { ...t, expressId: Number(e.target.value) } : t))}>{SAMPLE_ELEMENTS.map((e) => <option key={e.expressId} value={e.expressId}>{prettyClass(e.ifcClass)} · {e.name}</option>)}</select></td>
                <td className="pr-2"><select className={inputClass} value={test.expect} onChange={(e) => setTests(tests.map((t) => t.id === test.id ? { ...t, expect: e.target.value as Expectation } : t))}>{(['pass', 'fail', 'skip'] as const).map((x) => <option key={x} value={x}>{label(x)}</option>)}</select></td>
                <td className="whitespace-nowrap pr-2">{ran ? <span className="inline-flex items-center gap-1.5" style={{ color: ok ? 'var(--ok)' : 'var(--danger)' }}><Dot color={ok ? 'var(--ok)' : 'var(--danger)'} />{ok ? r('OK') : r('Got: {{what}}', { what: label(got) })}</span> : <span className="text-[var(--text-faint)]">—</span>}</td>
                <td className="text-right"><Quiet aria-label={r('Remove')} onClick={() => setTests(tests.filter((t) => t.id !== test.id))}>×</Quiet></td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      <div className="flex flex-wrap gap-2 mt-3 items-center">
        <Primary onClick={() => setRan(true)}>{r('Run {{n}} tests', { n: tests.length })}</Primary>
        <Quiet onClick={() => setTests([...tests, { id: newId(), expressId: SAMPLE_ELEMENTS[0].expressId, expect: 'pass' }])}>{r('Add a case')}</Quiet>
        {ran && <span role="status" className="text-[12.5px]" style={{ color: bad ? 'var(--danger)' : 'var(--ok)' }}>{bad ? r('{{n}} cases do not match. Fix the rule or the case.', { n: bad }) : r('All cases match. Safe to send for review.')}</span>}
      </div>
    </Panel>
  )
}

// ── Coverage: which rules check which classes, and what nobody checks ────────

function CoverageTab({ library }: { library: RuleSet[] }) {
  const r = useR()
  const sources = [...library.map((s) => ({ id: s.id, name: s.name, rules: latest(s).rules })), ...TEMPLATES.map((t) => ({ id: t.id, name: t.profile.name, rules: t.profile.rules }))]
  const [src, setSrc] = useState(sources[0].id)
  const chosen = sources.find((s) => s.id === src) ?? sources[0]
  const c = useMemo(() => coverage(chosen.rules), [chosen])
  return (
    <div className="space-y-4">
      <div className="flex flex-col sm:flex-row gap-3 sm:items-end">
        <Field label={r('Rule set')} className="sm:w-[360px]"><select className={inputClass} value={src} onChange={(e) => setSrc(e.target.value)}>{sources.map((s) => <option key={s.id} value={s.id}>{s.name}</option>)}</select></Field>
        <p className="text-[12.5px] text-[var(--text-dim)]">{r('{{pct}}% of the elements of {{model}} are checked by at least one rule.', { pct: c.checkedShare, model: SAMPLE_MODEL_NAME })}</p>
      </div>
      <Panel className="p-0 overflow-x-auto">
        <table className="text-[12px] min-w-full">
          <thead><tr className="text-[11px] text-[var(--text-faint)]"><th className="text-left font-medium px-3 py-2 sticky left-0 bg-[var(--surface)]">{r('Rule')}</th>{c.classes.map((k) => <th key={k.ifcClass} className="font-medium px-2 py-2 whitespace-nowrap">{prettyClass(k.ifcClass).replace(/^Ifc/, '')}<br /><span className="tabular-nums">{k.total}</span></th>)}</tr></thead>
          <tbody className="divide-y divide-[var(--border)]">
            {chosen.rules.map((rule, i) => (
              <tr key={rule.id}>
                <td className="px-3 py-1.5 sticky left-0 bg-[var(--surface)] whitespace-nowrap"><Dot color={SEV_COLOR[rule.severity]} /> <span className="ml-1">{describe(rule)}</span></td>
                {c.cells[i].map((n, j) => <td key={j} className="text-center tabular-nums px-2" style={n ? { background: 'color-mix(in srgb, var(--ok) 14%, transparent)' } : undefined}>{n || <span className="text-[var(--text-faint)]">·</span>}</td>)}
              </tr>
            ))}
          </tbody>
        </table>
      </Panel>
      {c.uncovered.length > 0 && (
        <Banner tone="warn" title={r('No rule checks these elements')}>
          {c.uncovered.map((u) => `${prettyClass(u.ifcClass)} (${u.count})`).join(' · ')}
        </Banner>
      )}
    </div>
  )
}

function describe(rule: EirRule): string {
  const x = rule as EirRule & { pset?: string; property?: string; system?: string }
  const what = x.property ?? x.pset ?? x.system ?? ''
  return `${rule.entity}${rule.where ? ` [${rule.where.property}=${rule.where.value}]` : ''} → ${what}`
}

// ── Templates by standard and discipline ─────────────────────────────────────

function TemplatesTab({ onUse, onAdopt }: { onUse: (r: EirRule) => void; onAdopt: (t: (typeof TEMPLATES)[number]) => void }) {
  const r = useR()
  return (
    <div className="grid sm:grid-cols-2 xl:grid-cols-3 gap-3">
      {TEMPLATES.map((t) => {
        const s = templateScore(t)
        return (
          <Panel key={t.id} className="p-4 flex flex-col">
            <p className="text-[11px] text-[var(--text-faint)]">{t.standard} · {r(t.discipline)}</p>
            <p className="text-[14px] font-semibold mt-0.5">{t.profile.name}</p>
            <ul className="mt-2 text-[12px] text-[var(--text-dim)] space-y-1 flex-1">
              {t.profile.rules.map((x) => <li key={x.id} className="flex gap-1.5 items-center"><Dot color={SEV_COLOR[x.severity]} /><button className="text-left hover:underline" onClick={() => onUse(x)}>{describe(x)}</button></li>)}
            </ul>
            <p className="text-[11.5px] text-[var(--text-faint)] mt-3">{r('On the sample: {{checked}} checks, {{failed}} fail', s)}</p>
            <div className="mt-3"><Quiet onClick={() => onAdopt(t)}>{r('Add to the company library')}</Quiet></div>
          </Panel>
        )
      })}
      <p className="text-[11.5px] text-[var(--text-faint)] sm:col-span-2 xl:col-span-3">{r('Templates are a starting point with checks a machine can verify. They do not certify that a model meets the standard.')}</p>
    </div>
  )
}

// ── Library: versions, author, comments, approval, IDS in and out ────────────

function LibraryTab({ library, setLibrary, onUse }: { library: RuleSet[]; setLibrary: (f: (l: RuleSet[]) => RuleSet[]) => void; onUse: (r: EirRule) => void }) {
  const r = useR()
  const [open, setOpen] = useState(library[0]?.id)
  const [msg, setMsg] = useState<{ ok: boolean; text: string } | null>(null)
  const [comment, setComment] = useState('')
  const [reviewer, setReviewer] = useState(ME)
  const file = useRef<HTMLInputElement>(null)
  const s = library.find((x) => x.id === open) ?? library[0]
  const update = (next: RuleSet) => setLibrary((l) => l.map((x) => x.id === next.id ? next : x))
  const statusLabel = (st: string) => st === 'approved' ? r('Approved') : st === 'review' ? r('In review') : r('Draft')
  const statusColor = (st: string) => st === 'approved' ? 'var(--ok)' : st === 'review' ? 'var(--warn)' : 'var(--text-faint)'

  async function onImport(f: File | undefined) {
    if (!f) return
    try {
      const { set, warnings } = importIds(await f.text(), ME, TODAY)
      setLibrary((l) => [...l, set]); setOpen(set.id)
      setMsg({ ok: true, text: warnings.length ? r('Imported as a draft. {{n}} parts could not be turned into rules.', { n: warnings.length }) : r('Imported as a draft.') })
    } catch { setMsg({ ok: false, text: r('This file is not a valid IDS 1.0.') }) }
  }

  if (!s) return null
  const cur = latest(s)
  const prev = s.versions.length > 1 ? s.versions[s.versions.length - 2] : null
  const d = prev ? diffRules(prev.rules, cur.rules) : null
  const ok = approved(s)

  return (
    <div className="grid lg:grid-cols-[280px_minmax(0,1fr)] gap-4">
      <div className="space-y-2">
        {library.map((x) => { const v = latest(x); return (
          <button key={x.id} onClick={() => { setOpen(x.id); setMsg(null) }} className={`w-full text-left rounded-[10px] border px-3 py-2.5 ${x.id === s.id ? 'border-[var(--text-dim)] bg-[var(--surface-2)]' : 'border-[var(--border)] bg-[var(--surface)]'}`}>
            <p className="text-[13px] font-medium">{x.name}</p>
            <p className="text-[11.5px] text-[var(--text-faint)] flex items-center gap-1.5 mt-0.5"><Dot color={statusColor(v.status)} />v{v.version} · {statusLabel(v.status)} · {r(x.discipline)}</p>
          </button>
        ) })}
        <input ref={file} type="file" accept=".ids,.xml" className="hidden" onChange={(e) => { void onImport(e.target.files?.[0]); e.target.value = '' }} />
        <Quiet className="w-full" onClick={() => file.current?.click()}>{r('Import IDS 1.0')}</Quiet>
      </div>

      <div className="space-y-4 min-w-0">
        {msg && <p role="status" className="text-[12.5px]" style={{ color: msg.ok ? 'var(--ok)' : 'var(--danger)' }}>{msg.text}</p>}
        <Panel className="p-4">
          <div className="flex flex-col sm:flex-row sm:items-start justify-between gap-3">
            <div>
              <p className="text-[15px] font-semibold">{s.name}</p>
              <p className="text-[12px] text-[var(--text-dim)] mt-0.5">{r('Version {{v}} by {{author}} on {{date}}', { v: cur.version, author: cur.author, date: cur.date })} · <span style={{ color: statusColor(cur.status) }}>{statusLabel(cur.status)}</span></p>
              <p className="text-[12px] text-[var(--text-faint)] mt-0.5">{ok ? r('Suppliers check against v{{v}}.', { v: ok.version }) : r('Not approved yet: nobody checks against it.')}</p>
            </div>
            <div className="flex flex-wrap gap-1.5">
              {cur.status === 'draft' && <Primary onClick={() => { update(submitForReview(s)); setMsg({ ok: true, text: r('Sent for review.') }) }}>{r('Send for review')}</Primary>}
              {cur.status === 'review' && <>
                <select aria-label={r('Reviewer')} className={`${inputClass} w-auto`} value={reviewer} onChange={(e) => setReviewer(e.target.value)}>{['Marta Vidal', 'Jordi Puig', 'Ana Ruiz'].map((p) => <option key={p}>{p}</option>)}</select>
                <Primary onClick={() => { const res = approveLatest(s, reviewer); if ('error' in res) setMsg({ ok: false, text: res.error === 'own' ? r('The author cannot approve their own version.') : r('Only a version in review can be approved.') }); else { update(res); setMsg({ ok: true, text: r('Approved. Suppliers now check against v{{v}}.', { v: cur.version }) }) } }}>{r('Approve')}</Primary>
              </>}
              {ok && <Quiet onClick={() => download(`${s.id}-v${ok.version}.ids`, exportSetIds(s, ok))}>{r('Export v{{v}} as IDS 1.0', { v: ok.version })}</Quiet>}
            </div>
          </div>
          <p className="text-[12.5px] mt-3 italic text-[var(--text-dim)]">“{r(cur.note)}”</p>
          <ul className="mt-3 divide-y divide-[var(--border)] text-[12.5px]">
            {cur.rules.map((x) => <li key={x.id} className="py-1.5 flex items-center gap-2"><Dot color={SEV_COLOR[x.severity]} /><span className="min-w-0 [overflow-wrap:anywhere]">{describe(x)}</span><button className="ml-auto text-[12px] text-[var(--text-faint)] hover:text-[var(--text)] shrink-0" onClick={() => onUse(x)}>{r('Edit')}</button></li>)}
          </ul>
        </Panel>

        {d && prev && (
          <Panel className="p-4">
            <p className="text-[13px] font-semibold">{r('What changed from v{{a}} to v{{b}}', { a: prev.version, b: cur.version })}</p>
            {d.added.length + d.removed.length + d.changed.length === 0 ? <p className="text-[12.5px] text-[var(--text-faint)] mt-2">{r('No rule changed.')}</p> : (
              <ul className="mt-2 text-[12.5px] space-y-1">
                {d.added.map((x) => <li key={`a${x.id}`}><span className="text-[var(--ok)] font-medium">+ {r('Added')}</span> {describe(x)}</li>)}
                {d.removed.map((x) => <li key={`r${x.id}`}><span className="text-[var(--danger)] font-medium">− {r('Removed')}</span> {describe(x)}</li>)}
                {d.changed.map((c) => <li key={`c${c.after.id}`}><span className="text-[var(--warn)] font-medium">~ {r('Changed')}</span> {describe(c.after)}{'values' in c.after && 'values' in c.before ? <span className="text-[var(--text-faint)]"> · {(c.before as { values: string[] }).values.join(', ')} → {(c.after as { values: string[] }).values.join(', ')}</span> : null}</li>)}
              </ul>
            )}
          </Panel>
        )}

        <LibraryExtras set={s} />
        <Panel className="p-4">
          <p className="text-[13px] font-semibold">{r('Comments')}</p>
          <ul className="mt-2 space-y-2">
            {s.comments.map((c, i) => <li key={i} className="text-[12.5px]"><span className="font-medium">{c.author}</span> <span className="text-[11px] text-[var(--text-faint)]">v{c.version} · {c.date}</span><p className="text-[var(--text-dim)]">{r(c.text)}</p></li>)}
            {s.comments.length === 0 && <li className="text-[12.5px] text-[var(--text-faint)]">{r('No comments yet.')}</li>}
          </ul>
          <div className="flex gap-2 mt-3">
            <input className={inputClass} placeholder={r('Write a comment')} value={comment} onChange={(e) => setComment(e.target.value)} aria-label={r('Write a comment')} />
            <Quiet onClick={() => { update(addComment(s, ME, comment, TODAY)); setComment('') }}>{r('Send')}</Quiet>
          </div>
        </Panel>

        <Panel className="p-4">
          <p className="text-[13px] font-semibold">{r('History')}</p>
          <ul className="mt-2 text-[12.5px] space-y-1">
            {[...s.versions].reverse().map((v) => <li key={v.version} className="flex items-center gap-2 flex-wrap"><Dot color={statusColor(v.status)} /><span className="font-medium">v{v.version}</span><span className="text-[var(--text-dim)]">{v.author} · {v.date} · {statusLabel(v.status)}</span></li>)}
          </ul>
        </Panel>
      </div>
    </div>
  )
}
