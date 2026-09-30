// One side (base / head) of a comparison: loaded models, IFC files, or a saved baseline.
import React, { useEffect, useRef, useState } from 'react'
import { useTranslation } from 'react-i18next'
import { useSceneStore } from '../../stores/sceneStore'
import { modelRegistry } from '../../lib/model-registry'
import type { BaselineSummary } from '../../lib/compare/baseline-store'
import type { CompareSide, SideState } from '../../stores/compareStore'
import { Button, Hint } from './ui'

export type SideChoice =
  | { kind: 'scene'; modelIds: string[] }
  | { kind: 'files'; files: File[] }
  | { kind: 'baseline'; id: string }

interface Props {
  side: CompareSide
  state: SideState
  baselines: BaselineSummary[]
  busy: boolean
  onLoad: (choice: SideChoice) => void
}

export default function SidePicker({ side, state, baselines, busy, onLoad }: Props) {
  const { t } = useTranslation('compare')
  const models = useSceneStore((s) => s.models)
  const withBuffer = models.filter((m) => (modelRegistry.getBuffer(m.id)?.byteLength ?? 0) > 0)
  const [kind, setKind] = useState<SideChoice['kind']>(side === 'head' ? 'scene' : baselines.length ? 'baseline' : 'files')
  const [picked, setPicked] = useState<string[]>(() => withBuffer.map((m) => m.id))
  const [baselineId, setBaselineId] = useState<string>(baselines[0]?.id ?? '')
  const fileRef = useRef<HTMLInputElement>(null)

  // Baselines arrive async; default to the newest once they do.
  useEffect(() => { if (!baselineId && baselines[0]) setBaselineId(baselines[0].id) }, [baselines, baselineId])

  const tabs: Array<SideChoice['kind']> = ['scene', 'files', 'baseline']
  const loaded = state.snapshots.length > 0

  return (
    <div className="flex-1 min-w-0 flex flex-col gap-2.5 p-3 rounded-xl border border-[var(--border)] bg-[var(--surface)]">
      <div className="flex flex-wrap items-baseline justify-between gap-x-2">
        <span className="text-[12.5px] font-semibold text-[var(--text)]">{t(`side.${side}`)}</span>
        <span className="text-[10.5px] text-[var(--text-faint)]">{t(`side.${side}Hint`)}</span>
      </div>

      <div role="tablist" className="grid grid-cols-3 gap-0.5 p-0.5 rounded-lg bg-black/30 border border-[var(--border)]">
        {tabs.map((k) => (
          <button
            key={k} role="tab" aria-selected={kind === k} title={t(`source.${k}`)} type="button" onClick={() => setKind(k)}
            className={`h-9 sm:h-7 px-1.5 rounded-md text-[11.5px] sm:text-[11px] truncate transition-colors ${kind === k ? 'bg-[var(--surface-2,rgba(255,255,255,0.1))] text-[var(--text)] shadow-sm' : 'text-[var(--text-faint)] hover:text-[var(--text)]'}`}
          >
            <span className="sm:hidden">{t(`source.${k}Short`)}</span>
            <span className="hidden sm:inline">{t(`source.${k}`)}</span>
          </button>
        ))}
      </div>

      {kind === 'scene' && (
        withBuffer.length === 0 ? <Hint>{t('source.sceneEmpty')}</Hint> : (
          <div className="flex flex-col gap-1 max-h-[140px] overflow-auto">
            {withBuffer.map((m) => (
              <label key={m.id} className="flex items-center gap-2 min-h-[36px] sm:min-h-0 text-[12px] sm:text-[11.5px] text-[var(--text-dim)] cursor-pointer">
                <input
                  type="checkbox" className="accent-[var(--accent)]" checked={picked.includes(m.id)}
                  onChange={(e) => setPicked((p) => (e.target.checked ? [...p, m.id] : p.filter((x) => x !== m.id)))}
                />
                <span className="truncate">{m.fileName}</span>
              </label>
            ))}
          </div>
        )
      )}
      {kind === 'files' && (
        <>
          <input
            ref={fileRef} type="file" accept=".ifc" multiple className="hidden"
            onChange={(e) => { const files = [...(e.target.files ?? [])]; if (files.length) onLoad({ kind: 'files', files }); e.target.value = '' }}
          />
          <Hint>{t('source.filesHint')}</Hint>
        </>
      )}
      {kind === 'baseline' && (
        baselines.length === 0 ? <Hint>{t('source.baselineEmpty')}</Hint> : (
          <select
            value={baselineId} onChange={(e) => setBaselineId(e.target.value)}
            className="h-10 sm:h-8 px-2 rounded-lg border border-[var(--border)] bg-[rgba(14,14,18,0.98)] text-[12px] text-[var(--text)] w-full min-w-0"
          >
            {baselines.map((b) => (
              <option key={b.id} value={b.id}>
                {b.label} · {new Date(b.createdAt).toLocaleDateString()} · {t('elements', { count: b.elements })}
              </option>
            ))}
          </select>
        )
      )}

      <div className="flex flex-wrap items-center gap-2 mt-auto">
        <Button
          small disabled={busy || (kind === 'scene' && picked.length === 0) || (kind === 'baseline' && !baselineId)}
          onClick={() => {
            if (kind === 'files') fileRef.current?.click()
            else if (kind === 'scene') onLoad({ kind: 'scene', modelIds: picked })
            else onLoad({ kind: 'baseline', id: baselineId })
          }}
        >
          {kind === 'files' ? t('source.pickFiles') : t('source.use')}
        </Button>
        {loaded && (
          <span className="text-[11px] text-[var(--ok)] truncate" title={state.snapshots.map((s) => s.fileName).join('\n')}>
            ✓ {state.source === 'files' ? t('filesCount', { count: state.snapshots.length }) : `${state.label} · ${t('filesCount', { count: state.snapshots.length })}`} · {t('elements', { count: state.snapshots.reduce((n, s) => n + s.elements.length, 0) })}
          </span>
        )}
      </div>
      {loaded && state.snapshots.some((s) => s.unreadable > 0) && <Hint tone="warn">{t('unreadable')}</Hint>}
    </div>
  )
}
