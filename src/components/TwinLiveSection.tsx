// ─── TwinLiveSection ──────────────────────────────────────────────────────────
// "Live data" in the element inspector: every device bound to this element
// (by GlobalId) with its latest reading and the rule it currently matches.
// Read-only — the IFC itself is never changed. Renders nothing when the
// element has no bindings.

import { useTranslation } from 'react-i18next'
import { useMemo } from 'react'
import { useTwinDeviceStore, selectShownReadings } from '../stores/twinDeviceStore'
import { useValidationStore } from '../stores/validationStore'
import { bindingState, buildCatalog, readingsForElement } from '../lib/twin/devices'

export function TwinLiveSection({ globalId }: { globalId: string | null | undefined }) {
  const { t } = useTranslation('layers', { keyPrefix: 'devices' })
  const bindings = useTwinDeviceStore((s) => s.bindings)
  const readings = useTwinDeviceStore(selectShownReadings)
  const timeAt = useTwinDeviceStore((s) => s.timeAt)
  const trees = useValidationStore((s) => s.spatialTrees)
  const hasQueries = bindings.some((b) => b.query)
  // Only needed when a binding targets by query (class / storey / name).
  const entry = useMemo(() => (hasQueries && globalId ? buildCatalog(trees).find((e) => e.globalId === globalId) : undefined), [hasQueries, globalId, trees])
  if (!globalId) return null
  const rows = readingsForElement(globalId, bindings, readings, entry)
  if (rows.length === 0) return null
  const now = timeAt ?? Date.now()
  return (
    <div className="border-b border-[var(--border)] px-3 py-2 flex flex-col gap-2" data-testid="twin-live-section">
      <div className="flex items-center gap-1.5 text-[11px] font-medium">
        <span className="w-1.5 h-1.5 rounded-full bg-[#22c55e] animate-pulse" aria-hidden />
        {t('inspectorTitle')}
        {timeAt !== null && <span className="text-[10px] font-normal text-[var(--text-dim)]">· {new Date(timeAt).toLocaleString()}</span>}
      </div>
      {rows.map(({ binding, reading }) => {
        const st = bindingState(binding, reading, now)
        return (
          <div key={binding.id} className="flex flex-col gap-0.5">
            <div className="flex items-center gap-1.5 text-[10px]">
              <span className="flex-1 truncate text-[var(--text-dim)]">{binding.deviceId}</span>
              <span className="shrink-0 text-[var(--text)]">
                {st.kind === 'rule' ? st.rule.name : st.kind === 'stale' ? t('stale') : st.kind === 'nodata' ? t('nodata') : ''}
              </span>
            </div>
            {reading && (
              <table className="w-full text-[10px]">
                <tbody>
                  {reading.props.filter((p) => !p.joined).slice(0, 12).map((p) => (
                    <tr key={p.path}>
                      <td className="pr-2 text-[var(--text-faint)] truncate max-w-[120px]">{p.path}</td>
                      <td className="text-[var(--text)] break-all">{p.display}</td>
                    </tr>
                  ))}
                  <tr>
                    <td className="pr-2 text-[var(--text-faint)]">{t('readAt')}</td>
                    <td className="text-[var(--text-dim)]">{new Date(reading.at).toLocaleTimeString()}</td>
                  </tr>
                </tbody>
              </table>
            )}
          </div>
        )
      })}
    </div>
  )
}
