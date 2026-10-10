// ─── FloodValidationGroup ─────────────────────────────────────────────────────
// The flood result where coordinators already look for problems: a group in
// the validation panel listing the elements the water reaches — doors and
// windows, accesses (ramps, stairs, lifts), spaces, equipment — with the depth
// over each one's bottom and when the water arrived. A click selects the
// element and flies to it.
//
// Not a validation rule: it never enters the result, the counts or the Health
// Score (a simulated storm is not a defect of the file). Lazy: loaded by
// FloodValidationSlot only once a flood run has been analysed.

import { useEffect, useMemo, useState } from 'react'
import { useTranslation } from 'react-i18next'
import { useFloodStore } from '../store'
import { ensureFloodI18n, FLOOD_NS } from '../i18n'
import { affectedCsv, affectedKind, elevationFrom, type AffectedElement, type AffectedKind } from '../validation/affected'
import { DEPTH_STOPS } from '../view/water-layer'
import { shareOrDownload } from '../../../lib/share-file'
import { fmtTime } from './FloodTimeline'

type T = (key: string, opts?: Record<string, unknown>) => string

interface Props {
  onJump(expressId: number, modelId: string): void
  mobile?: boolean
}

const IFC_NAMES: Record<string, string> = {
  IFCDOOR: 'IfcDoor', IFCWINDOW: 'IfcWindow', IFCSPACE: 'IfcSpace', IFCRAMP: 'IfcRamp', IFCRAMPFLIGHT: 'IfcRampFlight',
  IFCSTAIR: 'IfcStair', IFCSTAIRFLIGHT: 'IfcStairFlight', IFCTRANSPORTELEMENT: 'IfcTransportElement',
  IFCFLOWTERMINAL: 'IfcFlowTerminal', IFCENERGYCONVERSIONDEVICE: 'IfcEnergyConversionDevice',
  IFCELECTRICAPPLIANCE: 'IfcElectricAppliance', IFCELECTRICDISTRIBUTIONBOARD: 'IfcElectricDistributionBoard',
  IFCUNITARYEQUIPMENT: 'IfcUnitaryEquipment', IFCPUMP: 'IfcPump', IFCTANK: 'IfcTank', IFCBOILER: 'IfcBoiler',
  IFCCHILLER: 'IfcChiller', IFCTRANSFORMER: 'IfcTransformer', IFCELECTRICGENERATOR: 'IfcElectricGenerator',
}
const ifcName = (c: string): string => IFC_NAMES[c.toUpperCase()] ?? c

type GroupKey = AffectedKind | 'below'
const ORDER: GroupKey[] = ['opening', 'access', 'space', 'equipment', 'below']
const PAGE = 40

/** Depth colour, from the same ramp the water is drawn with. */
function depthColor(d: number): string {
  let c = DEPTH_STOPS[0][1]
  for (const [v, col] of DEPTH_STOPS) if (d >= v) c = col
  return `rgb(${Math.round(c[0] * 255)},${Math.round(c[1] * 255)},${Math.round(c[2] * 255)})`
}

const fmtDepth = (m: number): string => (m < 1 ? `${Math.round(m * 100)} cm` : `${m.toFixed(2)} m`)

function WaterIcon({ size = 13 }: { size?: number }) {
  return (
    <svg width={size} height={size} viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.4" strokeLinecap="round" strokeLinejoin="round" aria-hidden>
      <path d="M8 2.2C6.2 4.6 4.4 6.7 4.4 9a3.6 3.6 0 0 0 7.2 0c0-2.3-1.8-4.4-3.6-6.8z" />
      <path d="M1.5 13.6c1.1.7 2.2.7 3.3 0s2.2-.7 3.2 0 2.2.7 3.3 0 2.1-.7 3.2 0" />
    </svg>
  )
}

function Row({ e, t, onJump }: { e: AffectedElement; t: T; onJump: Props['onJump'] }) {
  const label = e.name?.trim() || `${ifcName(e.ifcClass)} #${e.expressId}`
  const chip = e.belowGround ? t('affected.outside', { d: fmtDepth(e.waterDepth) }) : fmtDepth(e.depth)
  const color = depthColor(e.belowGround ? e.waterDepth : e.depth)
  return (
    <button
      onClick={() => onJump(e.expressId, e.modelId)}
      className="w-full text-left flex items-center gap-2 px-2 py-1.5 rounded-[7px] hover:bg-[var(--surface-2)] focus-visible:bg-[var(--surface-2)] outline-none"
      title={t('affected.jump')}
    >
      <span className="shrink-0 min-w-[46px] text-center text-[10px] font-mono font-semibold px-1.5 py-[2px] rounded-[5px]"
        style={{ background: `${color}33`, color, border: `1px solid ${color}66` }}>
        {chip}
      </span>
      <span className="min-w-0 flex-1">
        <span className="block truncate text-[11px] text-[var(--text)]">{label}</span>
        <span className="block truncate text-[9.5px] text-[var(--text-faint)]">
          {[ifcName(e.ifcClass), e.storey, e.arrivalS !== null ? t('affected.arrives', { t: fmtTime(e.arrivalS) }) : null].filter(Boolean).join(' · ')}
        </span>
      </span>
    </button>
  )
}

export default function FloodValidationGroup({ onJump, mobile }: Props) {
  const { i18n } = useTranslation()
  const [ready, setReady] = useState(false)
  useEffect(() => {
    let alive = true
    void ensureFloodI18n(i18n.language).then(() => { if (alive) setReady(true) })
    return () => { alive = false }
  }, [i18n.language])
  const t = useMemo(
    () => (i18n.getFixedT as (lng: string, ns: string) => unknown)(i18n.language, FLOOD_NS) as T,
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [i18n, i18n.language, ready],
  )
  const report = useFloodStore((s) => s.affected)
  const [open, setOpen] = useState(true)
  const [shown, setShown] = useState<Record<string, number>>({})

  const groups = useMemo(() => {
    const m = new Map<GroupKey, AffectedElement[]>()
    for (const e of report?.elements ?? []) {
      const k: GroupKey = e.belowGround ? 'below' : affectedKind(e.ifcClass)
      m.set(k, [...(m.get(k) ?? []), e])
    }
    return ORDER.filter((k) => m.has(k)).map((k) => [k, m.get(k)!] as const)
  }, [report])

  if (!ready || !report) return null

  const exportCsv = async (): Promise<void> => {
    const csv = affectedCsv(report.elements, elevationFrom(report.datum))
    await shareOrDownload(new Blob([csv], { type: 'text/csv' }), 'flood-affected-elements.csv')
  }

  const n = report.total
  return (
    <section
      className={mobile
        ? 'rounded-[14px] border border-[var(--border)] bg-[var(--surface)] overflow-hidden'
        : 'mx-3 my-2 rounded-[10px] border border-[var(--border)] bg-[var(--surface)] overflow-hidden'}
      aria-label={t('affected.title')}
    >
      <button onClick={() => setOpen((v) => !v)} className="w-full flex items-center gap-2 px-3 py-2 text-left hover:bg-[var(--surface-2)]">
        <span className="text-[#6aa8f0]"><WaterIcon /></span>
        <span className="text-[11.5px] font-semibold text-[var(--text)]">{t('affected.title')}</span>
        <span className="text-[10px] font-mono px-1.5 rounded-full bg-[var(--surface-2)] text-[var(--text-dim)]">{n}</span>
        <span className="ml-auto text-[10px] text-[var(--text-faint)]">{open ? '▾' : '▸'}</span>
      </button>
      {open && (
        <div className="px-1.5 pb-2">
          <p className="px-1.5 pb-1.5 text-[10.5px] leading-snug text-[var(--text-dim)]">
            {n === 0
              ? t('affected.none', { checked: report.checked })
              : t('affected.summary', { n, checked: report.checked })}
            {' '}
            {report.finished
              ? t('affected.atEnd', { t: fmtTime(report.t) })
              : t('affected.partial', { t: fmtTime(report.t) })}
          </p>
          {groups.map(([k, list]) => {
            const max = shown[k] ?? PAGE
            return (
              <div key={k} className="mb-1">
                <div className="px-1.5 pt-1 pb-0.5 text-[9.5px] font-semibold uppercase tracking-[0.08em] text-[var(--text-faint)]">
                  {t(`affected.group.${k}`)} · {list.length}
                </div>
                {k === 'below' && <p className="px-1.5 pb-1 text-[10px] leading-snug text-[var(--text-faint)]">{t('affected.belowNote')}</p>}
                {list.slice(0, max).map((e) => <Row key={`${e.modelId}:${e.expressId}`} e={e} t={t} onJump={onJump} />)}
                {list.length > max && (
                  <button className="px-2 py-1 text-[10.5px] text-[var(--accent-2)] hover:underline" onClick={() => setShown((p) => ({ ...p, [k]: max + PAGE * 5 }))}>
                    {t('affected.more', { n: list.length - max })}
                  </button>
                )}
              </div>
            )
          })}
          {n > report.elements.length && <p className="px-1.5 text-[10px] text-[var(--text-faint)]">{t('affected.capped', { n: report.elements.length })}</p>}
          <div className="flex items-center gap-2 px-1.5 pt-1.5 border-t border-[var(--border)] mt-1">
            <span className="text-[9.5px] leading-snug text-[var(--text-faint)] flex-1">{t('affected.note')}</span>
            {n > 0 && (
              <button className="shrink-0 text-[10.5px] text-[var(--accent-2)] hover:underline" onClick={() => { void exportCsv() }}>CSV</button>
            )}
            <button className="shrink-0 text-[10.5px] text-[var(--text-faint)] hover:text-[var(--text)]" onClick={() => useFloodStore.getState().set({ affected: null })}>
              {t('affected.dismiss')}
            </button>
          </div>
        </div>
      )}
    </section>
  )
}
