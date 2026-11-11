// N4 · Folder check in the browser (Pro, dark). Drop a folder or a zip, check
// every IFC with one profile, read one table, export CSV or BCF. Runs locally:
// no credits, nothing uploaded. Fixing one file at a time stays free in the
// viewer; this only links to it. The public fake door (BatchFolderDoor) is
// separate and unchanged.

import { useEffect, useRef, useState } from 'react'
import { unzipSync } from 'fflate'
import { Panel, Primary, Quiet, Banner, DataList, Dot, Field, inputClass, scoreColor, fmtInt } from '../../ui'
import { PRO_PROFILES, SAMPLE_FOLDER, SAMPLE_SKIPPED, MAX_FILES, MAX_TOTAL_MB, type BatchFile, type BatchStatus } from './pro-sample'
import { intake, statusOf, summary, toBcf, toCsv } from './batch-export'
import { useP } from './pro-i18n'

interface Row { file: BatchFile; status: BatchStatus }

function save(name: string, data: BlobPart, type: string) {
  const url = URL.createObjectURL(new Blob([data], { type }))
  const a = Object.assign(document.createElement('a'), { href: url, download: name })
  a.click()
  setTimeout(() => URL.revokeObjectURL(url), 1000)
}

/** Sample engine: real file names get a result from the example folder, by position. */
function sampleResult(f: { name: string; sizeMb: number }, i: number): BatchFile {
  const known = SAMPLE_FOLDER.find((s) => s.name === f.name) ?? SAMPLE_FOLDER[i % SAMPLE_FOLDER.length]
  return { ...known, name: f.name, sizeMb: f.sizeMb }
}

function StatusCell({ s }: { s: BatchStatus }) {
  const p = useP()
  const map: Record<BatchStatus, [string, string]> = {
    pending: ['Waiting', 'var(--text-faint)'], checking: ['Checking…', 'var(--text)'], pass: ['Passes', 'var(--ok)'],
    fail: ['Fails', 'var(--danger)'], unreadable: ['Could not be read', 'var(--danger)'], cancelled: ['Cancelled', 'var(--text-faint)'],
  }
  const [label, color] = map[s]
  return <span className="inline-flex items-center gap-1.5 text-[12px] whitespace-nowrap" style={{ color: s === 'fail' || s === 'unreadable' ? color : 'var(--text)' }}><Dot color={color} />{p(label)}</span>
}

export default function BatchFolder() {
  const p = useP()
  const [profile, setProfile] = useState<string>(PRO_PROFILES[0])
  const [rows, setRows] = useState<Row[]>([])
  const [skipped, setSkipped] = useState<string[]>([])
  const [overLimit, setOverLimit] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [running, setRunning] = useState(false)
  const [onlyFailing, setOnlyFailing] = useState(false)
  const [over, setOver] = useState(false)
  const timer = useRef<ReturnType<typeof setTimeout>>()
  const input = useRef<HTMLInputElement>(null)

  useEffect(() => () => clearTimeout(timer.current), [])

  // Step through the queue one file at a time, as the worker would.
  useEffect(() => {
    if (!running) return
    const i = rows.findIndex((r) => r.status === 'pending' || r.status === 'checking')
    if (i < 0) { setRunning(false); return }
    timer.current = setTimeout(() => {
      setRows((rs) => rs.map((r, k) => (k !== i ? r : r.status === 'pending' ? { ...r, status: 'checking' } : { ...r, status: statusOf(r.file) })))
    }, rows[i].status === 'pending' ? 120 : 260 + Math.min(rows[i].file.sizeMb, 90) * 4)
    return () => clearTimeout(timer.current)
  }, [running, rows])

  const start = (files: { name: string; sizeMb: number }[], extraSkipped: string[] = []) => {
    const res = intake(files)
    setError(null); setSkipped([...extraSkipped, ...res.skipped]); setOverLimit(res.overLimit)
    if (res.accepted.length === 0) { setRows([]); setError(p('No IFC files in what you dropped. Drop .ifc files, a folder or a .zip.')); return }
    setRows(res.accepted.map((f, i) => ({ file: sampleResult(f, i), status: 'pending' as BatchStatus })))
    setRunning(true)
  }

  const fromFileList = async (list: FileList | File[]) => {
    const all: { name: string; sizeMb: number }[] = []
    for (const f of Array.from(list)) {
      if (/\.zip$/i.test(f.name)) {
        try {
          const entries = unzipSync(new Uint8Array(await f.arrayBuffer()))
          for (const [name, data] of Object.entries(entries)) if (!name.endsWith('/')) all.push({ name: name.split('/').pop()!, sizeMb: Math.max(1, Math.round(data.length / 1e6)) })
        } catch {
          setRows([]); setError(p('{{name}} is damaged or not a zip. Nothing was checked.', { name: f.name })); return
        }
      } else all.push({ name: f.name, sizeMb: Math.max(1, Math.round(f.size / 1e6)) })
    }
    start(all)
  }

  const cancel = () => {
    clearTimeout(timer.current); setRunning(false)
    setRows((rs) => rs.map((r) => (r.status === 'pending' || r.status === 'checking' ? { ...r, status: 'cancelled' } : r)))
  }
  const reset = () => { cancel(); setRows([]); setSkipped([]); setError(null); setOverLimit(false) }

  const done = rows.filter((r) => r.status !== 'pending' && r.status !== 'checking').length
  const s = summary(rows)
  const shown = onlyFailing ? rows.filter((r) => r.status === 'fail' || r.status === 'unreadable') : rows
  const stamp = `${profile.replace(/\W+/g, '-').toLowerCase()}`

  return (
    <div data-pro="batch-folder">
      <div className="flex flex-col sm:flex-row sm:items-end gap-3 mb-4">
        <Field label={p('Check against')} className="sm:w-[300px]">
          <select className={inputClass} value={profile} disabled={running} onChange={(e) => setProfile(e.target.value)}>
            {PRO_PROFILES.map((x) => <option key={x} value={x}>{p(x)}</option>)}
          </select>
        </Field>
        <p className="text-[12px] text-[var(--text-dim)] sm:ml-auto">{p('Runs in your browser: no credits, files never leave this computer.')}</p>
      </div>

      {error && <Banner tone="danger" title={error} />}

      {rows.length === 0 ? (
        <div
          onDragOver={(e) => { e.preventDefault(); setOver(true) }} onDragLeave={() => setOver(false)}
          onDrop={(e) => { e.preventDefault(); setOver(false); void fromFileList(e.dataTransfer.files) }}
          className="rounded-[10px] border border-dashed px-5 py-12 text-center transition-colors"
          style={{ borderColor: over ? 'var(--accent)' : 'var(--border-strong, var(--border))', background: over ? 'color-mix(in srgb, var(--accent) 6%, transparent)' : undefined }}>
          <p className="text-[14px] font-medium">{p('Drop a folder or a .zip of IFC files')}</p>
          <p className="text-[13px] text-[var(--text-dim)] mt-1 max-w-[460px] mx-auto">{p('Every file is checked with the same profile and you get one table. Up to {{files}} files and {{gb}} GB in total.', { files: MAX_FILES, gb: MAX_TOTAL_MB / 1024 })}</p>
          <div className="mt-4 flex flex-wrap justify-center gap-2">
            <Primary onClick={() => start([...SAMPLE_FOLDER, ...SAMPLE_SKIPPED.map((name) => ({ name, sizeMb: 2 }))])}>{p('Try the example folder')}</Primary>
            <Quiet onClick={() => input.current?.click()}>{p('Choose files')}</Quiet>
          </div>
          <input ref={input} type="file" multiple accept=".ifc,.ifczip,.zip" className="hidden" onChange={(e) => e.target.files && void fromFileList(e.target.files)} />
          <p className="mt-4 text-[11.5px] text-[var(--text-faint)]">{p('Preview: results come from sample data.')}</p>
        </div>
      ) : (
        <>
          {overLimit && <Banner tone="warn" title={p('Only the first {{files}} files or {{gb}} GB are checked', { files: MAX_FILES, gb: MAX_TOTAL_MB / 1024 })}>{p('Split the folder and run the rest afterwards.')}</Banner>}
          {skipped.length > 0 && <p className="mb-3 text-[12px] text-[var(--text-dim)]">{p('{{count}} files skipped (not IFC): {{names}}', { count: skipped.length, names: skipped.join(', ') })}</p>}

          <Panel className="p-4 mb-4">
            <div className="flex flex-wrap items-center gap-x-6 gap-y-2">
              <div className="min-w-[160px] flex-1">
                <p className="text-[12px] text-[var(--text-dim)]">{running ? p('Checking {{done}} of {{total}}', { done: Math.min(done + 1, rows.length), total: rows.length }) : p('{{done}} of {{total}} checked', { done, total: rows.length })}</p>
                <div className="mt-1.5 h-1.5 rounded-full bg-[var(--surface-2)] overflow-hidden" role="progressbar" aria-valuemin={0} aria-valuemax={rows.length} aria-valuenow={done}>
                  <div className="h-full bg-[var(--text-dim)]" style={{ width: `${(done / rows.length) * 100}%` }} />
                </div>
              </div>
              {[[p('Pass'), s.pass], [p('Fail'), s.fail], [p('Unreadable'), s.unreadable], [p('Average score'), s.avg || '—']].map(([k, v]) => (
                <div key={String(k)}><p className="text-[11.5px] text-[var(--text-dim)]">{k}</p><p className="text-[18px] font-semibold tabular-nums">{v}</p></div>
              ))}
            </div>
          </Panel>

          <div className="flex flex-wrap items-center gap-2 mb-3">
            {running ? <Quiet onClick={cancel}>{p('Cancel')}</Quiet> : <>
              <Primary disabled={done === 0} onClick={() => save(`folder-check-${stamp}.csv`, toCsv(rows.filter((r) => r.status !== 'cancelled'), profile), 'text/csv')}>{p('Export CSV')}</Primary>
              <Quiet disabled={s.fail + s.unreadable === 0} onClick={() => save(`folder-check-${stamp}.bcf`, toBcf(rows, profile), 'application/octet-stream')}>{p('Export BCF')}</Quiet>
              <Quiet onClick={reset}>{p('Check another folder')}</Quiet>
            </>}
            <label className="sm:ml-auto inline-flex items-center gap-2 text-[12.5px] text-[var(--text-dim)] min-h-[32px]">
              <input type="checkbox" checked={onlyFailing} onChange={(e) => setOnlyFailing(e.target.checked)} />{p('Only files that fail')}
            </label>
          </div>

          <DataList
            rows={shown}
            rowKey={(r) => r.file.name}
            primaryHeader={p('File')}
            primary={(r) => <><p className="font-medium [overflow-wrap:anywhere]">{r.file.name}</p><p className="text-[11.5px] text-[var(--text-faint)]">{fmtInt(r.file.sizeMb)} MB</p></>}
            columns={[
              { key: 'status', header: p('Status'), cell: (r) => <StatusCell s={r.status} /> },
              { key: 'score', header: p('Score'), cell: (r) => (r.status === 'pass' || r.status === 'fail' ? <span className="font-semibold tabular-nums" style={{ color: scoreColor(r.file.score!) }}>{r.file.score}</span> : <span className="text-[var(--text-faint)]">—</span>) },
              { key: 'issues', header: p('Issues'), cell: (r) => (r.status === 'pass' || r.status === 'fail' ? <span className="tabular-nums">{fmtInt(r.file.issues!)}</span> : <span className="text-[var(--text-faint)]">—</span>) },
              { key: 'worst', header: p('Most frequent problem'), hideOnPhone: true, cell: (r) => <span className="text-[var(--text-dim)]">{r.status === 'unreadable' ? p('The file header or geometry is broken.') : r.file.worstRule && (r.status === 'pass' || r.status === 'fail') ? p(r.file.worstRule) : '—'}</span> },
            ]}
            actions={(r) => (r.status === 'pass' || r.status === 'fail' ? <Quiet>{p('Open in viewer')}</Quiet> : null)}
          />
          {!running && s.fail > 0 && <p className="mt-3 text-[12px] text-[var(--text-dim)]">{p('To fix a file, open it in the viewer: “Fix all” there stays free, one file at a time.')}</p>}
        </>
      )}
    </div>
  )
}
