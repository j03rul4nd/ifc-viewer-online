// Scenes: each one starts from the saved connections that are "on in new
// scenes" and may change them locally. The table makes that inheritance
// visible — "Default" vs "Changed here" — and Reset puts a source back.

import { useState } from 'react'
import { resolveSceneSources, setOverride, type SceneOverride } from '../../../lib/connections/scenes'
import { describeSchedule, INTERVAL_PRESETS } from '../../../lib/connections/schedule'
import { SAMPLE_CONNECTIONS, SAMPLE_SCENES, type SampleScene } from '../connections-sample'
import type { SectionProps } from '../registry'
import { Head, Primary, Quiet, Empty, DataList, Toggle, Dialog, Field, Hint, inputClass, Panel } from '../ui'
import { HEALTH } from './DataSources'

const saved = SAMPLE_CONNECTIONS.map((c) => ({ id: c.id, name: c.name, defaultInNewScenes: c.defaultInNewScenes, schedule: c.schedule }))

function SceneSources({ scene, onBack, onData }: { scene: SampleScene; onBack: () => void; onData: () => void }) {
  const [overrides, setOverrides] = useState<SceneOverride[]>(scene.overrides)
  const rows = resolveSceneSources(saved, overrides)
  const update = (next: SceneOverride) => setOverrides(setOverride(overrides, next, saved.find((s) => s.id === next.connectionId)!))
  return (
    <>
      <button onClick={onBack} className="text-[12.5px] text-[var(--text-dim)] hover:text-[var(--text)] mb-3 min-h-[32px]">← Scenes</button>
      <Head title={scene.name} sub={scene.project ?? 'No project'} action={<><Quiet>Share</Quiet><Primary>Open scene</Primary></>} />
      <div className="flex items-baseline justify-between mb-2">
        <h2 className="text-[12px] uppercase tracking-[0.08em] text-[var(--text-faint)]">Data in this scene <Hint>Each source starts as you saved it under Data sources. Change it here and only this scene changes; Reset brings back the saved setting.</Hint></h2>
        <button onClick={onData} className="text-[12.5px] text-[var(--accent)] hover:underline">Manage connections →</button>
      </div>
      <DataList
        rows={rows}
        rowKey={(r) => r.connectionId}
        primaryHeader="Source"
        primary={(r) => {
          const c = SAMPLE_CONNECTIONS.find((x) => x.id === r.connectionId)!
          return <><p className={`font-medium ${r.enabled ? '' : 'text-[var(--text-faint)]'}`}>{r.name}</p><p className="text-[11.5px]" style={{ color: c.health === 'failing' || c.health === 'warning' ? HEALTH[c.health][1] : 'var(--text-faint)' }}>{HEALTH[c.health][0]}</p></>
        }}
        columns={[
          { key: 'on', header: 'In scene', cell: (r) => <Toggle label={`${r.name} in this scene`} checked={r.enabled} onChange={(v) => update({ ...overrides.find((o) => o.connectionId === r.connectionId), connectionId: r.connectionId, enabled: v })} /> },
          { key: 'refresh', header: 'Refresh', cell: (r) => r.schedule && !['stream', 'push'].includes(SAMPLE_CONNECTIONS.find((x) => x.id === r.connectionId)!.mode) ? (
            <select aria-label={`Refresh ${r.name}`} disabled={!r.enabled} className={`${inputClass} !w-auto !h-[30px]`} value={r.schedule.kind === 'interval' ? r.schedule.seconds : ''}
              onChange={(e) => update({ ...overrides.find((o) => o.connectionId === r.connectionId), connectionId: r.connectionId, schedule: { kind: 'interval', seconds: Number(e.target.value) } })}>
              {r.schedule.kind !== 'interval' && <option value="">{describeSchedule(r.schedule)}</option>}
              {INTERVAL_PRESETS.map((p) => <option key={p.seconds} value={p.seconds}>{p.label}</option>)}
            </select>) : <span className="text-[var(--text-faint)]">Live</span> },
          { key: 'filter', header: 'Only records where', hideOnPhone: true, cell: (r) => (
            <input aria-label={`Filter ${r.name}`} disabled={!r.enabled} className={`${inputClass} !h-[30px] font-mono text-[12px] max-w-[200px]`} placeholder="floor = 3" defaultValue={r.filter}
              onBlur={(e) => update({ ...overrides.find((o) => o.connectionId === r.connectionId), connectionId: r.connectionId, filter: e.target.value })} />) },
          { key: 'origin', header: 'Setting', cell: (r) => r.origin === 'scene'
            ? <span className="whitespace-nowrap">Changed here · <button className="text-[var(--accent)] hover:underline" onClick={() => setOverrides(overrides.filter((o) => o.connectionId !== r.connectionId))}>Reset</button></span>
            : <span className="text-[var(--text-faint)]">Default</span> },
        ]}
      />
      <Panel className="mt-4 p-4 text-[12.5px] text-[var(--text-dim)]">
        Need a source only this scene uses? Add it under Data sources with “On in new scenes” off, then switch it on here.
      </Panel>
    </>
  )
}

export default function Scenes({ actions }: SectionProps) {
  const [open, setOpen] = useState<string | null>(null)
  const [newOpen, setNewOpen] = useState(false)
  const scene = SAMPLE_SCENES.find((s) => s.id === open)
  if (scene) return <SceneSources scene={scene} onBack={() => setOpen(null)} onData={() => actions.go('data')} />
  const defaults = SAMPLE_CONNECTIONS.filter((c) => c.defaultInNewScenes)
  return (
    <>
      <Head title="Scenes" sub="Saved views of your models and data, to present, share or embed." action={<Primary onClick={() => setNewOpen(true)}>New scene</Primary>} />
      {SAMPLE_SCENES.length === 0 ? <Empty title="No scenes yet" body="A scene keeps the camera, the models, the map and the live data together, ready to open or embed." /> : (
        <DataList
          rows={SAMPLE_SCENES}
          rowKey={(s) => s.id}
          primaryHeader="Scene"
          primary={(s) => <><button onClick={() => setOpen(s.id)} className="font-medium text-left hover:underline">{s.name}</button><p className="text-[11.5px] text-[var(--text-faint)]">{s.project ?? 'No project'} · {s.updatedAt}</p></>}
          columns={[
            { key: 'data', header: 'Live data', wide: true, cell: (s) => { const on = resolveSceneSources(saved, s.overrides).filter((r) => r.enabled); return <span className="text-[var(--text-dim)]">{on.length ? on.map((r) => r.name.split(' — ')[0].split(' (')[0]).join(', ') : 'None'}</span> } },
            { key: 'changed', header: 'Own settings', hideOnPhone: true, cell: (s) => <span className="tabular-nums text-[var(--text-dim)]">{s.overrides.length || '—'}</span> },
          ]}
          actions={(s) => <Quiet onClick={() => setOpen(s.id)}>Data</Quiet>}
        />
      )}
      {newOpen && (
        <Dialog title="New scene" onClose={() => setNewOpen(false)} footer={<><Quiet onClick={() => setNewOpen(false)}>Cancel</Quiet><Primary onClick={() => setNewOpen(false)}>Create and open</Primary></>}>
          <Field label="Name"><input className={inputClass} placeholder="HQ — operations dashboard" /></Field>
          <p className="mt-4 text-[12.5px] font-medium">Starts with {defaults.length} saved source{defaults.length === 1 ? '' : 's'}:</p>
          <ul className="mt-1 text-[12.5px] text-[var(--text-dim)] space-y-0.5">{defaults.map((c) => <li key={c.id}>· {c.name}</li>)}</ul>
          <p className="mt-2 text-[11.5px] text-[var(--text-faint)]">Change them in the scene afterwards — this doesn't alter the saved connections.</p>
        </Dialog>
      )}
    </>
  )
}
