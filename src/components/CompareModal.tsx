// ─── CompareModal ─────────────────────────────────────────────────────────────
// Version comparison workspace: what changed between two deliveries of a set
// of IFC files, how the IDS compliance moved, and what that means for the open
// BCF issues. Either side can be the loaded models, IFC files, or a saved
// baseline — so "compare this week against last week" works with only this
// week's files at hand.

import React, { useCallback, useEffect, useState } from 'react'
import { useTranslation } from 'react-i18next'
import { Modal } from './Modal'
import type { ViewerAPI } from '../lib/viewer'
import { useCompareStore, type CompareSide } from '../stores/compareStore'
import { useSceneStore } from '../stores/sceneStore'
import { modelRegistry } from '../lib/model-registry'
import { snapshotMany, type SnapshotJob } from '../lib/compare/snapshot-runner'
import { diffSnapshotSets } from '../lib/compare/model-diff'
import { listBaselines, loadBaseline, saveBaseline, type BaselineSummary } from '../lib/compare/baseline-store'
import { toast } from '../stores/toastStore'
import SidePicker, { type SideChoice } from './compare/SidePicker'
import ChangesTab from './compare/ChangesTab'
import IdsTab from './compare/IdsTab'
import BcfTab from './compare/BcfTab'
import HistoryTab from './compare/HistoryTab'
import { Button, Check, Hint, stamp } from './compare/ui'

type Tab = 'changes' | 'ids' | 'bcf' | 'history'

function weekLabel(d = new Date()): string {
  // ISO week number — how departments name their weekly deliveries.
  const x = new Date(Date.UTC(d.getFullYear(), d.getMonth(), d.getDate()))
  const day = x.getUTCDay() || 7
  x.setUTCDate(x.getUTCDate() + 4 - day)
  const y0 = new Date(Date.UTC(x.getUTCFullYear(), 0, 1))
  const week = Math.ceil(((x.getTime() - y0.getTime()) / 86400000 + 1) / 7)
  return `${x.getUTCFullYear()}-W${String(week).padStart(2, '0')}`
}

export default function CompareModal({ onClose, viewerApiRef }: {
  onClose: () => void
  viewerApiRef: React.MutableRefObject<ViewerAPI | null>
}) {
  const { t } = useTranslation('compare')
  const store = useCompareStore()
  const { base, head, diff, busy, progress, error, ids } = store
  const models = useSceneStore((s) => s.models)
  const [tab, setTab] = useState<Tab>('changes')
  const [geometry, setGeometry] = useState(true)
  const [baselines, setBaselines] = useState<BaselineSummary[]>([])

  const refresh = useCallback(async () => {
    try { setBaselines(await listBaselines()) } catch { setBaselines([]) }
  }, [])
  useEffect(() => { void refresh() }, [refresh])

  const loadSide = async (side: CompareSide, choice: SideChoice): Promise<void> => {
    const s = useCompareStore.getState()
    s.setBusy(true)
    try {
      if (choice.kind === 'baseline') {
        const summary = baselines.find((b) => b.id === choice.id)
        const snapshots = await loadBaseline(choice.id)
        s.setSide(side, { label: summary?.label ?? t('source.baseline'), snapshots, modelIds: {}, source: 'baseline' })
        return
      }
      const jobs: SnapshotJob[] = []
      const modelIds: Record<string, string> = {}
      if (choice.kind === 'scene') {
        for (const id of choice.modelIds) {
          const m = models.find((x) => x.id === id)
          const buf = modelRegistry.getBuffer(id)
          if (!m || !buf || buf.byteLength === 0) continue
          jobs.push({ fileName: m.fileName, buffer: buf, geometry })
          modelIds[m.fileName] = id
        }
      } else {
        for (const f of choice.files) jobs.push({ fileName: f.name, buffer: await f.arrayBuffer(), geometry })
      }
      const snapshots = await snapshotMany(jobs, (name, pct) => useCompareStore.getState().setProgress(name, pct))
      const label = choice.kind === 'scene' ? t('source.sceneLabel', { date: stamp() }) : snapshots.length === 1 ? snapshots[0].fileName : t('source.filesLabel', { count: snapshots.length })
      s.setSide(side, { label, snapshots, modelIds, source: choice.kind })
    } catch (err) {
      s.setError(err instanceof Error ? err.message : String(err))
    } finally {
      useCompareStore.getState().setBusy(false)
    }
  }

  const compare = (): void => {
    const s = useCompareStore.getState()
    if (!s.base.snapshots.length || !s.head.snapshots.length) return
    s.setDiff(diffSnapshotSets(s.base.snapshots, s.head.snapshots, { base: s.base.label, head: s.head.label }))
    setTab('changes')
  }

  const compareBaselines = async (baseId: string, headId: string): Promise<void> => {
    await loadSide('base', { kind: 'baseline', id: baseId })
    await loadSide('head', { kind: 'baseline', id: headId })
    compare()
  }

  const saveHead = async (): Promise<void> => {
    const s = useCompareStore.getState()
    if (!s.head.snapshots.length) return
    const label = window.prompt(t('baseline.prompt'), weekLabel())
    if (!label) return
    try {
      await saveBaseline(label, s.head.snapshots, s.ids?.diff.headScore ?? null)
      await refresh()
      toast(t('baseline.saved', { label }), 'success')
    } catch (err) {
      toast(t('baseline.saveError', { message: err instanceof Error ? err.message : String(err) }), 'error')
    }
  }

  const progressList = Object.entries(progress)
  const tabs: Tab[] = ['changes', 'ids', 'bcf', 'history']

  return (
    <Modal open onClose={onClose} title={t('title')} description={t('subtitle')} size="full">
      <div className="flex flex-col gap-4">
        <div className="flex flex-wrap gap-3 items-stretch">
          <SidePicker side="base" state={base} baselines={baselines} busy={busy} onLoad={(c) => void loadSide('base', c)} />
          <div className="flex flex-col items-center justify-center gap-2">
            <Button small onClick={store.swap} disabled={busy} title={t('swap')}>⇄</Button>
          </div>
          <SidePicker side="head" state={head} baselines={baselines} busy={busy} onLoad={(c) => void loadSide('head', c)} />
        </div>

        <div className="flex flex-wrap items-center gap-3">
          <Button primary disabled={busy || !base.snapshots.length || !head.snapshots.length} onClick={compare}>{t('compare')}</Button>
          <Check checked={geometry} onChange={setGeometry}>{t('geometry')}</Check>
          {busy && progressList.length > 0 && (
            <div className="flex flex-wrap gap-3 text-[10.5px] text-[var(--text-faint)]">
              {progressList.map(([name, pct]) => <span key={name}>{name} · {pct}%</span>)}
            </div>
          )}
          {busy && progressList.length === 0 && <span className="text-[11px] text-[var(--text-faint)]">{t('working')}</span>}
        </div>
        {error && <Hint tone="error">{t('error', { message: error })}</Hint>}

        <div role="tablist" className="flex gap-1 border-b border-[var(--border)]">
          {tabs.map((k) => (
            <button
              key={k} role="tab" type="button" aria-selected={tab === k} onClick={() => setTab(k)}
              className={`h-8 px-3 text-[12px] -mb-px border-b-2 transition-colors ${tab === k ? 'border-[var(--accent)] text-[var(--text)]' : 'border-transparent text-[var(--text-faint)] hover:text-[var(--text)]'}`}
            >
              {t(`tabs.${k}`)}
              {k === 'changes' && diff && <span className="ml-1 text-[10.5px] tabular-nums text-[var(--text-faint)]">{diff.elements.length}</span>}
              {k === 'ids' && ids && <span className="ml-1 text-[10.5px] tabular-nums text-[var(--text-faint)]">{ids.diff.headScore}</span>}
              {k === 'history' && <span className="ml-1 text-[10.5px] tabular-nums text-[var(--text-faint)]">{baselines.length}</span>}
            </button>
          ))}
        </div>

        {tab === 'changes' && <ChangesTab viewerApiRef={viewerApiRef} onSaveBaseline={() => void saveHead()} />}
        {tab === 'ids' && <IdsTab />}
        {tab === 'bcf' && <BcfTab />}
        {tab === 'history' && <HistoryTab baselines={baselines} refresh={refresh} onCompare={(a, b) => void compareBaselines(a, b)} />}
      </div>
    </Modal>
  )
}
