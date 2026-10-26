// New connection, in six steps that each answer one question:
//   1 How does the data arrive?   (pull / push / stream / database / files)
//   2 Where is it?                (fields of that protocol + a saved credential)
//   3 Does it answer?             (test, or wait for the first webhook)
//   4 How do we read it?          (records, id, place, time, values — guessed)
//   5 When?                       (schedule, only for what we fetch)
//   6 Name and scenes             (default in new scenes or not)
// Every field carries its own help and an example; anchors named data-tour
// let a guided tour walk the same steps later. Design only: Test returns a
// sample payload and Save closes.

import { useMemo, useState } from 'react'
import {
  MODES, CREDENTIAL_KINDS, protocolById, protocolsFor, missingFields,
  type IngestMode, type ProtocolId, type FieldDef,
} from '../../lib/connections/protocols'
import { INTERVAL_PRESETS, describeSchedule, nextRuns, validateSchedule, type Schedule } from '../../lib/connections/schedule'
import { findRecordArrays, extractRecords, fieldsOf, guessMapping, getPath, type FieldMapping } from '../../lib/connections/mapping'
import { SAMPLE_TEST_PAYLOAD, type SampleCredential } from './connections-sample'
import { Dialog, Primary, Quiet, Field, Hint, Toggle, CopyField, inputClass, Dot } from './ui'

const STEPS = ['Arrival', 'Source', 'Test', 'Read', 'When', 'Save'] as const

function ProtocolField({ f, value, onChange }: { f: FieldDef; value: string; onChange: (v: string) => void }) {
  const control = f.type === 'select'
    ? <select className={inputClass} value={value || f.options?.[0]?.value} onChange={(e) => onChange(e.target.value)}>{f.options?.map((o) => <option key={o.value} value={o.value}>{o.label}</option>)}</select>
    : f.type === 'textarea'
      ? <textarea className={`${inputClass} !h-[84px] py-2 font-mono text-[12px] resize-y`} value={value} placeholder={f.example} onChange={(e) => onChange(e.target.value)} />
      : <input className={`${inputClass} ${f.type === 'url' ? 'font-mono text-[12px]' : ''}`} type={f.type === 'number' ? 'number' : 'text'} inputMode={f.type === 'url' ? 'url' : undefined} value={value} placeholder={f.example} onChange={(e) => onChange(e.target.value)} />
  return (
    <div data-tour={`field-${f.key}`}>
      <Field label={`${f.label}${f.required ? '' : ' (optional)'}`} hint={<>{f.help}{f.example && !value && f.type !== 'select' && <> <button type="button" className="text-[var(--accent)] hover:underline" onClick={() => onChange(f.example!)}>Use the example</button></>}</>}>
        {control}
      </Field>
    </div>
  )
}

export default function ConnectionWizard({ credentials, onClose }: { credentials: SampleCredential[]; onClose: () => void }) {
  const [step, setStep] = useState(0)
  const [mode, setMode] = useState<IngestMode | null>(null)
  const [protocol, setProtocol] = useState<ProtocolId | null>(null)
  const [values, setValues] = useState<Record<string, string>>({})
  const [credId, setCredId] = useState<string>('')
  const [newCred, setNewCred] = useState<Record<string, string>>({})
  const [tested, setTested] = useState<'idle' | 'running' | 'ok'>('idle')
  const [mapping, setMapping] = useState<FieldMapping | null>(null)
  const [schedule, setSchedule] = useState<Schedule>({ kind: 'interval', seconds: 300 })
  const [scheduleKind, setScheduleKind] = useState<'preset' | 'daily' | 'cron'>('preset')
  const [name, setName] = useState('')
  const [inNewScenes, setInNewScenes] = useState(true)
  const [alertOnFail, setAlertOnFail] = useState(true)

  const p = protocol ? protocolById(protocol) : null
  const isPush = p?.mode === 'push'
  const scheduled = p && (p.mode === 'pull' || p.mode === 'database' || p.mode === 'file')
  const records = useMemo(() => (mapping ? extractRecords(SAMPLE_TEST_PAYLOAD, mapping.recordsPath) : []), [mapping])
  const fields = useMemo(() => fieldsOf(records), [records])
  const scheduleError = scheduled ? validateSchedule(schedule, p?.minIntervalS) : null
  const credsForProtocol = credentials.filter((c) => p?.auth.includes(c.kind))

  const runTest = () => {
    setTested('running')
    setTimeout(() => { setTested('ok'); setMapping(guessMapping(SAMPLE_TEST_PAYLOAD)) }, 700)
  }

  // Why Next is disabled — said in words, never a silent grey button.
  const blocker: string | null = [
    !protocol ? 'Pick how the data arrives and the protocol' : null,
    p && missingFields(p, values).length ? `Fill in: ${missingFields(p, values).map((f) => f.label).join(', ')}` : null,
    tested === 'ok' ? null : isPush ? 'Send a test request first' : 'Run the test first',
    mapping && (mapping.place.kind !== 'none' || mapping.values.length) ? null : 'Tell us where each record is, or pick a value',
    scheduleError,
    name.trim().length > 1 ? null : 'Give the connection a name',
  ][step] ?? null

  const set = (k: string, v: string) => { setValues({ ...values, [k]: v }); setTested('idle') }
  const webhookUrl = 'https://in.ifcvieweronline.eu/h/4b7e2a9c1d'
  const webhookSecret = 'whsec_7Qm2r9XcV1pLk3Hs8Tn0'

  return (
    <Dialog title="New data connection" onClose={onClose} size="lg"
      footer={<>
        {step > 0 ? <Quiet onClick={() => setStep(step === 5 && !scheduled ? 3 : step - 1)}>Back</Quiet> : <Quiet onClick={onClose}>Cancel</Quiet>}
        {blocker && <span className="text-[11.5px] text-[var(--text-faint)] sm:self-center sm:mr-auto sm:order-first">{blocker}</span>}
        {step < STEPS.length - 1
          ? <Primary disabled={!!blocker} onClick={() => setStep(step === 3 && !scheduled ? 5 : step + 1)}>Next</Primary>
          : <Primary disabled={!!blocker} onClick={onClose}>Save connection</Primary>}
      </>}>
      <ol aria-label="Steps" className="flex gap-1 mb-5 overflow-x-auto -mx-1 px-1">
        {STEPS.map((s, i) => (
          <li key={s} aria-current={i === step ? 'step' : undefined}
            className={`shrink-0 flex items-center gap-1.5 text-[11.5px] ${i === step ? 'text-[var(--text)] font-medium' : i < step ? 'text-[var(--text-dim)]' : 'text-[var(--text-faint)]'}`}>
            <span className={`w-5 h-5 grid place-items-center rounded-full text-[10.5px] ${i < step ? 'text-white' : i === step ? 'border border-[var(--accent)]' : 'border border-[var(--border)]'}`} style={i < step ? { background: 'var(--ok)' } : undefined}>{i < step ? '✓' : i + 1}</span>
            {s}{i < STEPS.length - 1 && <span aria-hidden className="mx-1 text-[var(--text-faint)]">›</span>}
          </li>
        ))}
      </ol>

      {step === 0 && (
        <div data-tour="arrival">
          <p className="text-[13px] font-medium mb-1">How does the data arrive? <Hint>Not sure? Ask who runs the system: “Can you give me a URL I can read, or can your system call a URL of ours?” The first is <b>fetch on a schedule</b>, the second is <b>your system sends it</b>.</Hint></p>
          <div className="grid gap-2 sm:grid-cols-2 mt-2">
            {MODES.map((m) => (
              <button key={m.id} aria-pressed={mode === m.id} onClick={() => { setMode(m.id); setProtocol(protocolsFor(m.id).length === 1 ? protocolsFor(m.id)[0].id : null) }}
                className={`text-left rounded-[10px] border p-3 ${mode === m.id ? 'border-[var(--accent)] bg-[var(--surface-2)]' : 'border-[var(--border)] hover:bg-[var(--surface-2)]'}`}>
                <p className="text-[13px] font-medium">{m.title}</p>
                <p className="text-[12px] text-[var(--text-dim)] mt-0.5">{m.body}</p>
                <p className="text-[11px] text-[var(--text-faint)] mt-1.5">e.g. {m.examples}</p>
              </button>
            ))}
          </div>
          {mode && protocolsFor(mode).length > 1 && (
            <div className="mt-4" data-tour="protocol">
              <p className="text-[12px] text-[var(--text-dim)] mb-2">Which kind?</p>
              <div className="space-y-1.5">
                {protocolsFor(mode).map((x) => (
                  <label key={x.id} className={`flex items-start gap-2.5 rounded-[9px] border px-3 py-2.5 cursor-pointer ${protocol === x.id ? 'border-[var(--accent)] bg-[var(--surface-2)]' : 'border-[var(--border)]'}`}>
                    <input type="radio" name="protocol" className="mt-0.5" checked={protocol === x.id} onChange={() => setProtocol(x.id)} />
                    <span><span className="block text-[13px] font-medium">{x.name}</span><span className="block text-[12px] text-[var(--text-dim)]">{x.pickWhen}</span></span>
                  </label>
                ))}
              </div>
            </div>
          )}
        </div>
      )}

      {step === 1 && p && (
        <div className="grid gap-4 grid-cols-[minmax(0,1fr)]">
          <p className="text-[12px] text-[var(--text-faint)]">{p.name}</p>
          {isPush && (
            <div className="rounded-[10px] bg-[var(--surface-2)] p-3 text-[12.5px] text-[var(--text-dim)]" data-tour="webhook-intro">
              We create a private URL for this connection. Your system sends each update to it as an HTTPS POST with a JSON body. You'll get the URL and its secret in the next step.
            </div>
          )}
          {p.fields.filter((f) => !f.when || values[f.when.key] === f.when.equals).map((f) => (
            <ProtocolField key={f.key} f={f} value={values[f.key] ?? ''} onChange={(v) => set(f.key, v)} />
          ))}
          {p.auth.length > 0 && (
            <div data-tour="credential">
              <Field label="Credentials" hint="Saved once, encrypted in the EU, reused by every connection that needs them. We never show a secret again after you save it.">
                <select className={inputClass} value={credId} onChange={(e) => setCredId(e.target.value)}>
                  <option value="">None — the source is public</option>
                  {credsForProtocol.map((c) => <option key={c.id} value={c.id}>{c.name} ({c.preview})</option>)}
                  {p.auth.map((k) => <option key={k} value={`new:${k}`}>+ New: {CREDENTIAL_KINDS[k].label}</option>)}
                </select>
              </Field>
              {credId.startsWith('new:') && (
                <div className="mt-3 rounded-[10px] border border-[var(--border)] p-3 grid gap-3 sm:grid-cols-2">
                  <Field label="Name it" className="sm:col-span-2" hint="So you recognise it later, e.g. “TMB developer key”."><input className={inputClass} value={newCred.name ?? ''} onChange={(e) => setNewCred({ ...newCred, name: e.target.value })} /></Field>
                  {CREDENTIAL_KINDS[credId.slice(4) as keyof typeof CREDENTIAL_KINDS].fields.map((f) => (
                    <Field key={f.key} label={f.label} hint={f.help || undefined}>
                      <input className={`${inputClass} font-mono text-[12px]`} type={f.secret ? 'password' : 'text'} autoComplete="off" placeholder={f.example} value={newCred[f.key] ?? ''} onChange={(e) => setNewCred({ ...newCred, [f.key]: e.target.value })} />
                    </Field>
                  ))}
                </div>
              )}
            </div>
          )}
        </div>
      )}

      {step === 2 && p && (
        isPush ? (
          <div className="grid gap-4 grid-cols-[minmax(0,1fr)]" data-tour="webhook">
            <Field label="Your webhook URL" hint="Paste it in your system's webhook or HTTP action settings."><CopyField label="Webhook URL" value={webhookUrl} /></Field>
            <Field label="Signing secret" hint="Your system signs each body with it (HMAC-SHA256, header X-Signature). Shown in full only now — store it in your system."><CopyField label="Signing secret" value={webhookSecret} secret /></Field>
            <Field label="Try it from a terminal" hint="Sends one sample message; this screen updates when it arrives.">
              <CopyField label="Example request" value={`curl -X POST ${webhookUrl} -H "Content-Type: application/json" -d '{"alarms":[{"alarm_id":"A1","asset_tag":"AHU-03","severity":2,"raised_at":"2026-10-26T10:00:00Z"}]}'`} />
            </Field>
            <div className="rounded-[10px] bg-[var(--surface-2)] p-3 flex items-center gap-3" role="status">
              <Dot color={tested === 'ok' ? 'var(--ok)' : 'var(--text-dim)'} />
              <span className="flex-1 text-[12.5px]">{tested === 'ok' ? 'Request received · 200 OK · 3 records' : tested === 'running' ? 'Waiting for the first request…' : 'Nothing received yet'}</span>
              {tested !== 'ok' && <Quiet onClick={runTest}>{tested === 'running' ? 'Listening…' : 'Start listening'}</Quiet>}
            </div>
          </div>
        ) : (
          <div className="grid gap-3 grid-cols-[minmax(0,1fr)]" data-tour="test">
            <p className="text-[13px]">We'll make one request to <span className="font-mono text-[12px] break-all">{values.url || values.broker || values.host || values.bucket}</span> and show what comes back. Nothing is saved yet.</p>
            <div className="flex items-center gap-3">
              <Primary onClick={runTest} disabled={tested === 'running'}>{tested === 'running' ? 'Testing…' : tested === 'ok' ? 'Test again' : 'Test connection'}</Primary>
              {tested === 'ok' && <span className="text-[12.5px]" style={{ color: 'var(--ok)' }}>✓ 200 OK · 412 ms · 1.2 KB · 3 records</span>}
            </div>
            {tested === 'ok' && (
              <details className="rounded-[10px] border border-[var(--border)]">
                <summary className="cursor-pointer px-3 py-2 text-[12.5px] text-[var(--text-dim)]">See the raw response</summary>
                <pre className="px-3 pb-3 text-[11.5px] font-mono overflow-x-auto max-h-[220px]">{JSON.stringify(SAMPLE_TEST_PAYLOAD, null, 2)}</pre>
              </details>
            )}
            <p className="text-[11.5px] text-[var(--text-faint)]">If it fails we say why in plain words — wrong key, not reachable, blocked by a firewall — and what to try.</p>
          </div>
        )
      )}

      {step === 3 && mapping && (
        <div className="grid gap-4 grid-cols-[minmax(0,1fr)]" data-tour="mapping">
          <p className="text-[12.5px] text-[var(--text-dim)]">We guessed from the test response. Check the preview below and fix anything that's off.</p>
          <div className="grid gap-3 sm:grid-cols-2">
            <Field label="List of records" hint="Where in the response each reading or item is.">
              <select className={`${inputClass} font-mono text-[12px]`} value={mapping.recordsPath} onChange={(e) => setMapping({ ...guessMapping(getPath(SAMPLE_TEST_PAYLOAD, '')), recordsPath: e.target.value })}>
                {findRecordArrays(SAMPLE_TEST_PAYLOAD).map((a) => <option key={a.path} value={a.path}>{a.path || '(top level)'} — {a.count} items</option>)}
              </select>
            </Field>
            <Field label="Unique id" hint="Same value every time for the same sensor or asset, so history lines up.">
              <select className={`${inputClass} font-mono text-[12px]`} value={mapping.id ?? ''} onChange={(e) => setMapping({ ...mapping, id: e.target.value || undefined })}>
                <option value="">None</option>{fields.map((f) => <option key={f}>{f}</option>)}
              </select>
            </Field>
          </div>
          <fieldset>
            <legend className="text-[12px] text-[var(--text-dim)] mb-1.5">Where each record is <Hint>Coordinates put a point on the map. An IFC element links the reading to a room, a pump or a door in the model — the scene colours that element.</Hint></legend>
            <div className="grid gap-1.5 sm:grid-cols-2">
              {([['ifc', 'An IFC element (GlobalId, tag or name)'], ['latlon', 'Latitude and longitude'], ['geojson', 'GeoJSON geometry'], ['none', 'No position — a table only']] as const).map(([k, label]) => (
                <label key={k} className={`flex items-center gap-2 rounded-[9px] border px-3 py-2 text-[12.5px] cursor-pointer ${mapping.place.kind === k ? 'border-[var(--accent)] bg-[var(--surface-2)]' : 'border-[var(--border)]'}`}>
                  <input type="radio" name="place" checked={mapping.place.kind === k} onChange={() => setMapping({ ...mapping, place: k === 'ifc' ? { kind: 'ifc', field: fields[0], matchBy: 'GlobalId' } : k === 'latlon' ? { kind: 'latlon', lat: fields[0], lon: fields[1] } : { kind: k } })} />{label}
                </label>
              ))}
            </div>
            {mapping.place.kind === 'ifc' && (() => { const pl = mapping.place; return (
              <div className="mt-2 grid gap-3 sm:grid-cols-2">
                <Field label="Field"><select className={`${inputClass} font-mono text-[12px]`} value={pl.field} onChange={(e) => setMapping({ ...mapping, place: { ...pl, field: e.target.value } })}>{fields.map((f) => <option key={f}>{f}</option>)}</select></Field>
                <Field label="Matches the element's"><select className={inputClass} value={pl.matchBy} onChange={(e) => setMapping({ ...mapping, place: { ...pl, matchBy: e.target.value as 'GlobalId' } })}><option>GlobalId</option><option>Tag</option><option>Name</option></select></Field>
              </div>) })()}
            {mapping.place.kind === 'latlon' && (() => { const pl = mapping.place; return (
              <div className="mt-2 grid gap-3 grid-cols-2">
                <Field label="Latitude"><select className={`${inputClass} font-mono text-[12px]`} value={pl.lat} onChange={(e) => setMapping({ ...mapping, place: { ...pl, lat: e.target.value } })}>{fields.map((f) => <option key={f}>{f}</option>)}</select></Field>
                <Field label="Longitude"><select className={`${inputClass} font-mono text-[12px]`} value={pl.lon} onChange={(e) => setMapping({ ...mapping, place: { ...pl, lon: e.target.value } })}>{fields.map((f) => <option key={f}>{f}</option>)}</select></Field>
              </div>) })()}
          </fieldset>
          <div className="grid gap-3 sm:grid-cols-2">
            <Field label="Time of the reading" hint="Without it we use the time it arrived.">
              <select className={`${inputClass} font-mono text-[12px]`} value={mapping.time ?? ''} onChange={(e) => setMapping({ ...mapping, time: e.target.value || undefined })}><option value="">Arrival time</option>{fields.map((f) => <option key={f}>{f}</option>)}</select>
            </Field>
            <fieldset>
              <legend className="text-[12px] text-[var(--text-dim)]">Values to show and keep</legend>
              <div className="mt-1 flex flex-wrap gap-1.5">
                {fields.filter((f) => f !== mapping.id && f !== mapping.time).map((f) => {
                  const on = mapping.values.includes(f)
                  return <button key={f} type="button" aria-pressed={on} onClick={() => setMapping({ ...mapping, values: on ? mapping.values.filter((x) => x !== f) : [...mapping.values, f] })}
                    className={`h-[28px] px-2.5 rounded-full border text-[12px] font-mono ${on ? 'border-[var(--accent)] bg-[var(--surface-2)] text-[var(--text)]' : 'border-[var(--border)] text-[var(--text-faint)]'}`}>{f}</button>
                })}
              </div>
            </fieldset>
          </div>
          <div>
            <p className="text-[12px] text-[var(--text-dim)] mb-1.5">Preview — first {Math.min(3, records.length)} records as the scene will see them</p>
            <div className="overflow-x-auto rounded-[10px] border border-[var(--border)]">
              <table className="w-full text-[12px] font-mono">
                <thead className="text-left text-[10.5px] uppercase tracking-[0.06em] text-[var(--text-faint)] font-sans">
                  <tr><th className="px-3 py-2">id</th><th className="pr-3">where</th><th className="pr-3">time</th>{mapping.values.map((v) => <th key={v} className="pr-3">{v}</th>)}</tr>
                </thead>
                <tbody className="divide-y divide-[var(--border)]">
                  {records.slice(0, 3).map((r, i) => (
                    <tr key={i}>
                      <td className="px-3 py-1.5">{String(mapping.id ? getPath(r, mapping.id) : '—')}</td>
                      <td className="pr-3 whitespace-nowrap">{mapping.place.kind === 'ifc' ? `${String(getPath(r, mapping.place.field)).slice(0, 8)}… ✓ in model` : mapping.place.kind === 'latlon' ? `${getPath(r, mapping.place.lat)}, ${getPath(r, mapping.place.lon)}` : '—'}</td>
                      <td className="pr-3 whitespace-nowrap">{String(mapping.time ? getPath(r, mapping.time) : 'on arrival')}</td>
                      {mapping.values.map((v) => <td key={v} className="pr-3">{String(getPath(r, v))}</td>)}
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        </div>
      )}

      {step === 4 && p && (
        <div className="grid gap-4 grid-cols-[minmax(0,1fr)]" data-tour="schedule">
          <div role="radiogroup" aria-label="Schedule type" className="grid grid-cols-3 gap-2">
            {([['preset', 'Every…'], ['daily', 'Once a day'], ['cron', 'Cron']] as const).map(([k, label]) => (
              <button key={k} role="radio" aria-checked={scheduleKind === k} onClick={() => { setScheduleKind(k); setSchedule(k === 'preset' ? { kind: 'interval', seconds: 300 } : k === 'daily' ? { kind: 'daily', time: '06:30' } : { kind: 'cron', expr: '*/15 * * * *' }) }}
                className={`h-[36px] rounded-[9px] border text-[12.5px] ${scheduleKind === k ? 'border-[var(--accent)] bg-[var(--surface-2)]' : 'border-[var(--border)]'}`}>{label}</button>
            ))}
          </div>
          {schedule.kind === 'interval' && (
            <Field label="How often" hint={`This source allows every ${p.minIntervalS ?? 10} s at most often. Faster isn't always better: most open data changes every few minutes.`}>
              <select className={inputClass} value={schedule.seconds} onChange={(e) => setSchedule({ kind: 'interval', seconds: Number(e.target.value) })}>
                {INTERVAL_PRESETS.map((x) => <option key={x.seconds} value={x.seconds} disabled={x.seconds < (p.minIntervalS ?? 0)}>{x.label}</option>)}
              </select>
            </Field>
          )}
          {schedule.kind === 'daily' && (
            <Field label="At" hint="In your time zone (Europe/Madrid). Change it in Settings → Preferences.">
              <input type="time" className={inputClass} value={schedule.time} onChange={(e) => setSchedule({ kind: 'daily', time: e.target.value })} />
            </Field>
          )}
          {schedule.kind === 'cron' && (
            <Field label="Cron line" hint={<>Five parts: minute hour day month weekday. <code className="font-mono">30 6 * * 1-5</code> = weekdays at 06:30. <code className="font-mono">*/15 * * * *</code> = every 15 minutes.</>}>
              <input className={`${inputClass} font-mono`} value={schedule.expr} spellCheck={false} onChange={(e) => setSchedule({ kind: 'cron', expr: e.target.value })} aria-invalid={!!scheduleError} />
            </Field>
          )}
          <div className="rounded-[10px] bg-[var(--surface-2)] p-3 text-[12.5px]" role="status">
            {scheduleError
              ? <span style={{ color: 'var(--danger)' }}>{scheduleError}</span>
              : <><p className="font-medium">{describeSchedule(schedule)}</p><p className="text-[var(--text-dim)] mt-0.5">Next: {nextRuns(schedule, new Date(), 3).map((d) => d.toLocaleString(undefined, { weekday: 'short', hour: '2-digit', minute: '2-digit' })).join(' · ')}</p></>}
          </div>
          <p className="text-[11.5px] text-[var(--text-faint)]">Reading data never uses credits. If the source fails 3 times in a row we pause and tell you, instead of hammering it.</p>
        </div>
      )}

      {step === 5 && p && (
        <div className="grid gap-4 grid-cols-[minmax(0,1fr)]" data-tour="save">
          <Field label="Name" hint="What you'll see in scenes and alerts."><input className={inputClass} value={name} placeholder={`${p.name} — HQ`} onChange={(e) => setName(e.target.value)} /></Field>
          <div className="rounded-[10px] border border-[var(--border)] divide-y divide-[var(--border)]">
            <div className="flex items-center gap-4 px-4 py-3">
              <div className="flex-1"><p className="text-[13px] font-medium">Turn on in every new scene</p><p className="text-[12px] text-[var(--text-dim)]">New scenes start with it. Each scene can still switch it off or change it — that never changes this connection.</p></div>
              <Toggle label="Turn on in every new scene" checked={inNewScenes} onChange={setInNewScenes} />
            </div>
            <div className="flex items-center gap-4 px-4 py-3">
              <div className="flex-1"><p className="text-[13px] font-medium">Email me if it stops working</p><p className="text-[12px] text-[var(--text-dim)]">After 3 failures in a row, or no data for 1 hour on a live source.</p></div>
              <Toggle label="Email me if it stops working" checked={alertOnFail} onChange={setAlertOnFail} />
            </div>
          </div>
          <dl className="grid grid-cols-[auto_1fr] gap-x-4 gap-y-1 text-[12px]">
            <dt className="text-[var(--text-faint)]">Arrives</dt><dd>{MODES.find((m) => m.id === p.mode)?.title} · {p.name}</dd>
            {scheduled && <><dt className="text-[var(--text-faint)]">When</dt><dd>{describeSchedule(schedule)}</dd></>}
            <dt className="text-[var(--text-faint)]">Reads</dt><dd>{mapping?.values.join(', ') || '—'} {mapping?.place.kind === 'ifc' ? 'on IFC elements' : mapping?.place.kind === 'latlon' ? 'as map points' : ''}</dd>
          </dl>
        </div>
      )}
    </Dialog>
  )
}

