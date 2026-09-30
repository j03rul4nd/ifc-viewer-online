// IDS across versions + derive an IDS from what a delivery contains.
import React, { useRef, useState } from 'react'
import { useTranslation } from 'react-i18next'
import { useCompareStore } from '../../stores/compareStore'
import { useIdsStore } from '../../stores/idsStore'
import { parseIds } from '../../lib/ids/ids-parser'
import { writeIds } from '../../lib/ids/ids-writer'
import type { IdsDocument } from '../../lib/ids/ids-types'
import { runIdsOnSet, diffIdsAcrossVersions } from '../../lib/compare/ids-versions'
import { deriveIdsFromSnapshots } from '../../lib/compare/ids-from-model'
import { toast } from '../../stores/toastStore'
import { Button, Check, Hint, Section, Stat, downloadBlob, stamp } from './ui'

export default function IdsTab() {
  const { t } = useTranslation('compare')
  const { base, head, diff, ids, setIds } = useCompareStore()
  const activeDoc = useIdsStore((s) => s.doc)
  const activeName = useIdsStore((s) => s.fileName)
  const setLoaded = useIdsStore((s) => s.setLoaded)
  const fileRef = useRef<HTMLInputElement>(null)
  const [running, setRunning] = useState(false)

  // Derivation options
  const [from, setFrom] = useState<'base' | 'head'>('base')
  const [coverage, setCoverage] = useState(95)
  const [minInstances, setMinInstances] = useState(3)
  const [lockValues, setLockValues] = useState(false)
  const [changedOnly, setChangedOnly] = useState(false)

  const ready = base.snapshots.length > 0 && head.snapshots.length > 0

  const run = (doc: IdsDocument, title: string): void => {
    if (!ready) return
    setRunning(true)
    // Defer a frame so the button state paints before the synchronous check.
    requestAnimationFrame(() => {
      try {
        const b = runIdsOnSet(doc, base.snapshots)
        const h = runIdsOnSet(doc, head.snapshots)
        setIds({ title, doc, base: b, head: h, diff: diffIdsAcrossVersions(b, h, diff ?? undefined) })
      } catch (err) {
        toast(t('ids.runError', { message: err instanceof Error ? err.message : String(err) }), 'error')
      } finally { setRunning(false) }
    })
  }

  const derive = (): { doc: IdsDocument; summary: { classes: number; requirements: number } } | null => {
    const snaps = from === 'base' ? base.snapshots : head.snapshots
    if (!snaps.length) return null
    const classes = changedOnly && diff ? [...new Set(diff.elements.map((e) => e.ifcClass))] : undefined
    return deriveIdsFromSnapshots(snaps, {
      title: t('derive.docTitle', { label: from === 'base' ? base.label : head.label }),
      coverage: coverage / 100, minInstances, lockValues, classes,
    })
  }

  const d = ids?.diff
  const numInput = 'w-16 h-7 px-1.5 rounded-md border border-[var(--border)] bg-transparent text-[11.5px] text-[var(--text)]'

  return (
    <div className="flex flex-col gap-5">
      <Section title={t('ids.runTitle')}>
        <Hint>{t('ids.runHint')}</Hint>
        <input
          ref={fileRef} type="file" accept=".ids,.xml" className="hidden"
          onChange={async (e) => {
            const f = e.target.files?.[0]
            e.target.value = ''
            if (!f) return
            try { run(parseIds(await f.text()), f.name) } catch (err) {
              toast(t('ids.parseError', { message: err instanceof Error ? err.message : String(err) }), 'error')
            }
          }}
        />
        <div className="flex flex-wrap gap-2">
          <Button small primary disabled={!ready || !activeDoc || running} onClick={() => activeDoc && run(activeDoc, activeName ?? 'IDS')}>
            {activeDoc ? t('ids.runActive', { name: activeName ?? 'IDS' }) : t('ids.noActive')}
          </Button>
          <Button small disabled={!ready || running} onClick={() => fileRef.current?.click()}>{t('ids.runFile')}</Button>
        </div>
        {!ready && <Hint>{t('ids.needBoth')}</Hint>}
      </Section>

      {ids && d && (
        <Section title={ids.title}>
          <div className="flex flex-wrap gap-2">
            <Stat label={t('ids.score')} value={`${d.baseScore} → ${d.headScore}`} color={d.headScore >= d.baseScore ? 'var(--ok)' : 'var(--danger)'} />
            <Stat label={t('ids.resolved')} value={d.resolved.length} color="var(--ok)" />
            <Stat label={t('ids.introduced')} value={d.introduced.length} color="var(--danger)" />
            <Stat label={t('ids.persistent')} value={d.persistent} />
          </div>
          <table className="w-full text-[11.5px]">
            <thead>
              <tr className="text-[10.5px] text-[var(--text-faint)] text-left">
                <th className="font-normal py-1">{t('ids.spec')}</th>
                <th className="font-normal py-1 text-right">{t('ids.failedBefore')}</th>
                <th className="font-normal py-1 text-right">{t('ids.failedAfter')}</th>
              </tr>
            </thead>
            <tbody>
              {d.bySpec.map((s) => (
                <tr key={s.spec} className="border-t border-[var(--border)]">
                  <td className="py-1 pr-2 text-[var(--text-dim)]">{s.spec}</td>
                  <td className="py-1 text-right tabular-nums">{s.baseFailed}/{s.baseApplicable}</td>
                  <td className="py-1 text-right tabular-nums" style={{ color: s.headFailed > s.baseFailed ? 'var(--danger)' : s.headFailed < s.baseFailed ? 'var(--ok)' : undefined }}>
                    {s.headFailed}/{s.headApplicable}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
          {d.introduced.length > 0 && (
            <details>
              <summary className="text-[11.5px] cursor-pointer text-[var(--danger)]">{t('ids.introducedList', { count: d.introduced.length })}</summary>
              <ul className="m-0 mt-1 pl-4 text-[11px] text-[var(--text-dim)] max-h-[220px] overflow-auto">
                {d.introduced.slice(0, 300).map((f, i) => (
                  <li key={i}>
                    <b className="font-medium">{f.name || f.ifcClass}</b> · {f.spec}
                    {f.elementChanged && <span className="text-[#F5A623]"> · {t('ids.changedElement')}</span>}
                    <div className="text-[var(--text-faint)]">{f.reasons.join('; ')}</div>
                  </li>
                ))}
              </ul>
            </details>
          )}
        </Section>
      )}

      <Section title={t('derive.title')}>
        <Hint>{t('derive.hint')}</Hint>
        <div className="flex flex-wrap gap-3 items-center text-[11.5px] text-[var(--text-dim)]">
          <label className="inline-flex items-center gap-1.5">{t('derive.from')}
            <select value={from} onChange={(e) => setFrom(e.target.value as 'base' | 'head')} className="h-7 px-1.5 rounded-md border border-[var(--border)] bg-transparent text-[11.5px]">
              <option value="base" disabled={!base.snapshots.length}>{t('side.base')}{base.label ? ` · ${base.label}` : ''}</option>
              <option value="head" disabled={!head.snapshots.length}>{t('side.head')}{head.label ? ` · ${head.label}` : ''}</option>
            </select>
          </label>
          <label className="inline-flex items-center gap-1.5">{t('derive.coverage')}
            <input type="number" min={50} max={100} value={coverage} onChange={(e) => setCoverage(Math.min(100, Math.max(50, Number(e.target.value) || 95)))} className={numInput} /> %
          </label>
          <label className="inline-flex items-center gap-1.5">{t('derive.minInstances')}
            <input type="number" min={1} max={1000} value={minInstances} onChange={(e) => setMinInstances(Math.max(1, Number(e.target.value) || 1))} className={numInput} />
          </label>
          <Check checked={lockValues} onChange={setLockValues}>{t('derive.lockValues')}</Check>
          <Check checked={changedOnly} onChange={setChangedOnly}>{t('derive.changedOnly')}</Check>
        </div>
        <div className="flex flex-wrap gap-2">
          <Button small disabled={!(from === 'base' ? base : head).snapshots.length} onClick={() => {
            const r = derive()
            if (!r) return
            if (!r.doc.specifications.length) { toast(t('derive.nothing'), 'warning'); return }
            downloadBlob(new Blob([writeIds(r.doc, { title: r.doc.title, date: stamp(), description: t('derive.description') })], { type: 'application/xml' }), `${stamp()}_derived.ids`)
            toast(t('derive.done', { classes: r.summary.classes, requirements: r.summary.requirements }), 'success')
          }}>{t('derive.download')}</Button>
          <Button small disabled={!(from === 'base' ? base : head).snapshots.length} onClick={() => {
            const r = derive()
            if (!r || !r.doc.specifications.length) { toast(t('derive.nothing'), 'warning'); return }
            setLoaded(`${r.doc.title}.ids`, r.doc)
            run(r.doc, r.doc.title ?? 'IDS')
          }}>{t('derive.useAndRun')}</Button>
        </div>
      </Section>
    </div>
  )
}
