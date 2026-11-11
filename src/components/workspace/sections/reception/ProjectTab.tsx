// Project setup: what the suppliers are checked against (B2 profile + N1
// naming rule) and when they deliver. The same form opens a new project.

import { useState } from 'react'
import { Dialog, Field, Primary, Quiet, Panel, SectionLabel, inputClass } from '../../ui'
import type { RxProject } from './sample'
import type { Rx } from './strings'

const PROFILES: [string, number][] = [['EIR Mirador', 3], ['EIR Naves', 1], ['EIR Residencial (company)', 5]]
const DAYS = ['Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday']
export const PROJECT_LABELS = [...DAYS]

type Draft = Pick<RxProject, 'name' | 'place' | 'code' | 'client' | 'profile' | 'profileVersion' | 'minScore' | 'dueDay' | 'dueHour'>

function useDraft(p?: RxProject) {
  return useState<Draft>(() => p ? { name: p.name, place: p.place, code: p.code, client: p.client, profile: p.profile, profileVersion: p.profileVersion, minScore: p.minScore, dueDay: p.dueDay, dueHour: p.dueHour }
    : { name: '', place: '', code: '', client: '', profile: PROFILES[2][0], profileVersion: PROFILES[2][1], minScore: 80, dueDay: 1, dueHour: 12 })
}

function errorsOf(d: Draft, rx: Rx, codes: string[]) {
  return {
    name: d.name.trim() ? null : rx('Write the project name.'),
    code: !/^[A-Z0-9]{2,6}$/.test(d.code) ? rx('2 to 6 capital letters or digits.') : codes.includes(d.code) ? rx('Another project already uses {{code}}.', { code: d.code }) : null,
    minScore: d.minScore >= 0 && d.minScore <= 100 ? null : rx('Between 0 and 100.'),
  }
}

function Form({ d, set, rx, errors, show }: { d: Draft; set: (d: Draft) => void; rx: Rx; errors: ReturnType<typeof errorsOf>; show: boolean }) {
  const err = (k: keyof typeof errors) => show && errors[k] ? <span role="alert" className="block text-[var(--danger)] mt-1">{errors[k]}</span> : null
  return (
    <div className="space-y-3">
      <div className="grid sm:grid-cols-2 gap-3">
        <Field label={rx('Project name')}><input className={inputClass} value={d.name} onChange={(e) => set({ ...d, name: e.target.value })} />{err('name')}</Field>
        <Field label={rx('Project code')} hint={rx('Field 1 of every file name')}><input className={`${inputClass} font-mono uppercase`} maxLength={6} value={d.code} onChange={(e) => set({ ...d, code: e.target.value.toUpperCase() })} />{err('code')}</Field>
        <Field label={rx('Town')}><input className={inputClass} value={d.place} onChange={(e) => set({ ...d, place: e.target.value })} /></Field>
        <Field label={rx('Client')}><input className={inputClass} value={d.client} onChange={(e) => set({ ...d, client: e.target.value })} /></Field>
      </div>
      <div className="grid sm:grid-cols-3 gap-3">
        <Field label={rx('Requirements profile')} className="sm:col-span-2">
          <select className={inputClass} value={d.profile} onChange={(e) => { const p = PROFILES.find(([n]) => n === e.target.value)!; set({ ...d, profile: p[0], profileVersion: p[1] }) }}>
            {PROFILES.map(([n, v]) => <option key={n} value={n}>{rx('{{profile}} v{{v}}', { profile: n, v })}</option>)}
          </select>
        </Field>
        <Field label={rx('Minimum score')}><input type="number" min={0} max={100} className={`${inputClass} tabular-nums`} value={d.minScore} onChange={(e) => set({ ...d, minScore: Number(e.target.value) })} />{err('minScore')}</Field>
      </div>
      <div className="grid grid-cols-2 gap-3">
        <Field label={rx('Weekly delivery day')}>
          <select className={inputClass} value={d.dueDay} onChange={(e) => set({ ...d, dueDay: Number(e.target.value) })}>{DAYS.map((x, i) => <option key={x} value={i + 1}>{rx(x)}</option>)}</select>
        </Field>
        <Field label={rx('By')}>
          <select className={inputClass} value={d.dueHour} onChange={(e) => set({ ...d, dueHour: Number(e.target.value) })}>{[9, 10, 12, 14, 18].map((h) => <option key={h} value={h}>{`${h}:00`}</option>)}</select>
        </Field>
      </div>
    </div>
  )
}

export default function ProjectTab({ project, rx, codes, onSave }: { project: RxProject; rx: Rx; codes: string[]; onSave: (p: RxProject) => void }) {
  const [d, set] = useDraft(project)
  const [show, setShow] = useState(false)
  const errors = errorsOf(d, rx, codes.filter((c) => c !== project.code))
  const example = [d.code || 'XXX', ...project.naming.f.slice(1).map((f) => f.v?.[0] ?? ({ Volume: 'ZZ', Level: 'XX', Number: '0001' } as Record<string, string>)[f.c] ?? 'X')].join(project.naming.sep) + '-S2-P01.ifc'
  return (
    <div className="grid lg:grid-cols-[1fr_300px] gap-5">
      <Panel className="p-4 sm:p-5">
        <SectionLabel>{rx('Project and requirements')}</SectionLabel>
        <Form d={d} set={set} rx={rx} errors={errors} show={show} />
        <div className="mt-4 flex justify-end"><Primary onClick={() => { setShow(true); if (!Object.values(errors).some(Boolean)) onSave({ ...project, ...d }) }}>{rx('Save changes')}</Primary></div>
      </Panel>
      <Panel className="p-4 sm:p-5 text-[12.5px] text-[var(--text-dim)] space-y-2.5 self-start">
        <SectionLabel>{rx('Naming rule (ISO 19650)')}</SectionLabel>
        <p className="font-mono text-[12px] text-[var(--text)] [overflow-wrap:anywhere]">{example}</p>
        <p>{project.naming.f.map((f) => rx(f.c)).join(' · ')} · {rx('Status')} · {rx('Revision')}</p>
        <p>{rx('Status S0–S4 and revision P01/C01 are checked. The same rule runs free in the suppliers’ browser before they send.')}</p>
      </Panel>
    </div>
  )
}

export function NewProjectDialog({ rx, codes, onCreate, onClose }: { rx: Rx; codes: string[]; onCreate: (d: Draft) => void; onClose: () => void }) {
  const [d, set] = useDraft()
  const [show, setShow] = useState(false)
  const errors = errorsOf(d, rx, codes)
  return (
    <Dialog title={rx('New project')} onClose={onClose} size="lg"
      footer={<><Quiet onClick={onClose}>{rx('Cancel')}</Quiet><Primary onClick={() => { setShow(true); if (!Object.values(errors).some(Boolean)) onCreate(d) }}>{rx('Create project')}</Primary></>}>
      <p className="text-[12.5px] text-[var(--text-dim)] -mt-1 mb-4">{rx('One project, up to 15 suppliers. You invite them next.')}</p>
      <Form d={d} set={set} rx={rx} errors={errors} show={show} />
    </Dialog>
  )
}
