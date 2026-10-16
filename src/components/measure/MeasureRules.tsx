// ─── MeasureRules ─────────────────────────────────────────────────────────────
// The "does it comply?" half of a measurement, shown under a selected row:
//
//   REQUIREMENT  ≥ / ≤ / between, on the value, the height (ΔZ), the slope or
//                the volume, with presets for the checks people repeat
//                (corridor, door, headroom, ramp…). Pass/fail shows in the row,
//                on the 3D label and in the export.
//   HEIGHT       Areas only: a thickness or depth that turns the traced area
//                into a volume (slab, screed, excavation, room air volume).
//   NOTE         A line of text that travels with the measurement.
//
// Every number the person types is in the DISPLAY unit; everything stored is
// SI, so switching m → ft does not move a requirement.

import { useEffect, useState } from 'react'
import { useTranslation } from 'react-i18next'
import type { CheckTarget, MeasureItem, MeasureSettings, Requirement } from '../../lib/measure/measure-types'
import { checkItem, REQUIREMENT_PRESETS, targetsFor, volumeOf } from '../../lib/measure/checks'
import { areaInUnits, formatAngle, formatArea, formatLength, formatNumber, formatVolume, lengthInUnits, volumeInUnits } from '../../lib/measure/measure-math'

type Patch = Partial<Pick<MeasureItem, 'requirement' | 'extrusion' | 'note'>>

/** SI → the number shown in the inputs, for one target of one item. */
export function toDisplay(v: number, item: MeasureItem, target: CheckTarget, s: MeasureSettings): number {
  if (target === 'slope') return v
  if (target === 'volume') return volumeInUnits(v, s.units)
  if (target === 'value' && item.kind === 'area') return areaInUnits(v, s.units)
  if (target === 'value' && item.kind === 'angle') return v
  return lengthInUnits(v, s.units)
}

export function fromDisplay(v: number, item: MeasureItem, target: CheckTarget, s: MeasureSettings): number {
  const unit = toDisplay(1, item, target, s)
  return unit === 0 ? v : v / unit
}

/** The unit suffix next to a requirement input. */
export function unitLabel(item: MeasureItem, target: CheckTarget, s: MeasureSettings): string {
  if (target === 'slope') return '%'
  if (target === 'volume') return s.units === 'ft' ? 'ft³' : 'm³'
  if (target === 'value' && item.kind === 'area') return s.units === 'ft' ? 'ft²' : 'm²'
  if (target === 'value' && item.kind === 'angle') return '°'
  return s.units
}

/** "≥ 1,20 m" — the requirement in words, for the row and the export. */
export function formatRequirement(req: Requirement, item: MeasureItem, s: MeasureSettings): string {
  const f = (v: number) => {
    if (req.target === 'slope') return `${formatNumber(v, 1, s.locale)} %`
    if (req.target === 'volume') return formatVolume(v, s)
    if (req.target === 'value' && item.kind === 'area') return formatArea(v, s)
    if (req.target === 'value' && item.kind === 'angle') return formatAngle(v, s)
    return formatLength(v, s)
  }
  if (req.op === 'min' && req.min !== null) return `≥ ${f(req.min)}`
  if (req.op === 'max' && req.max !== null) return `≤ ${f(req.max)}`
  if (req.min !== null && req.max !== null) return `${f(req.min)} – ${f(req.max)}`
  return ''
}

export function CheckBadge({ status, title }: { status: 'pass' | 'fail'; title?: string }) {
  const pass = status === 'pass'
  return (
    <span title={title} aria-label={title}
      className={['flex-none inline-flex items-center justify-center w-4 h-4 rounded-full text-[10px] font-bold',
        pass ? 'bg-[rgba(61,214,140,0.16)] text-[#3DD68C]' : 'bg-[rgba(255,90,90,0.16)] text-[#FF5A5A]'].join(' ')}>
      {pass ? '✓' : '✗'}
    </span>
  )
}

function NumberInput({ value, onCommit, label, suffix }: { value: number | null; onCommit(v: number | null): void; label: string; suffix: string }) {
  const [text, setText] = useState(value === null ? '' : String(+value.toFixed(4)))
  useEffect(() => { setText(value === null ? '' : String(+value.toFixed(4))) }, [value])
  const commit = () => {
    const n = parseFloat(text.replace(',', '.'))
    onCommit(Number.isFinite(n) ? n : null)
  }
  return (
    <label className="flex items-center gap-1 min-w-0">
      <input
        type="text" inputMode="decimal" aria-label={label} value={text}
        onChange={(e) => setText(e.target.value)}
        onBlur={commit}
        onKeyDown={(e) => { e.stopPropagation(); if (e.key === 'Enter') (e.target as HTMLInputElement).blur() }}
        className="w-[64px] bg-[var(--surface)] border border-[var(--border)] focus:border-[var(--accent)] rounded-[5px] px-1.5 py-0.5 text-[11px] font-mono tabular-nums text-[var(--text)] outline-none"
      />
      <span className="text-[10px] text-[var(--text-faint)]">{suffix}</span>
    </label>
  )
}

const selectCls = 'bg-[var(--surface)] border border-[var(--border)] rounded-[5px] px-1 py-0.5 text-[11px] text-[var(--text)] outline-none focus:border-[var(--accent)]'

export function MeasureRules({ item, settings: s, onAnnotate }: { item: MeasureItem; settings: MeasureSettings; onAnnotate(patch: Patch): void }) {
  const { t } = useTranslation('measurement')
  const extrusion = item.kind === 'area' ? item.extrusion ?? null : null
  const req = item.requirement ?? null
  const targets = targetsFor(item, extrusion !== null)
  const presets = REQUIREMENT_PRESETS.filter((p) => p.kinds.includes(item.kind))
  const result = req ? checkItem(item, req, extrusion) : null
  const [noteText, setNoteText] = useState(item.note ?? '')
  useEffect(() => { setNoteText(item.note ?? '') }, [item.note])

  const setReq = (next: Requirement | null) => onAnnotate({ requirement: next })
  const start = (target: CheckTarget = targets[0]) => setReq({ op: 'min', min: null, max: null, target })

  return (
    <div className="mt-1.5 rounded-[7px] bg-[var(--surface)] border border-[var(--border)] px-2 py-1.5 flex flex-col gap-1.5" onClick={(e) => e.stopPropagation()}>
      {item.kind === 'area' && (
        <div className="flex items-center justify-between gap-2">
          <span className="text-[10.5px] text-[var(--text-dim)]" title={t('rules.extrusionHint')}>{t('rules.extrusion')}</span>
          <NumberInput label={t('rules.extrusion')} suffix={s.units}
            value={extrusion === null ? null : lengthInUnits(extrusion, s.units)}
            onCommit={(v) => onAnnotate({ extrusion: v === null || v === 0 ? null : v / lengthInUnits(1, s.units) })} />
        </div>
      )}
      {item.kind === 'area' && extrusion !== null && (
        <div className="flex justify-between text-[10.5px]">
          <span className="text-[var(--text-dim)]">{t('rules.volume')}</span>
          <span className="font-mono tabular-nums text-[var(--text)]">{formatVolume(volumeOf(item.value, extrusion), s)}</span>
        </div>
      )}

      {!req ? (
        <div className="flex items-center gap-1 flex-wrap">
          <button type="button" onClick={() => start()}
            className="px-1.5 py-0.5 rounded-[5px] text-[10.5px] text-[var(--accent)] hover:bg-[var(--surface-2)]">
            + {t('rules.add')}
          </button>
          {presets.map((p) => (
            <button key={p.id} type="button" onClick={() => setReq({ ...p.req })} title={t(`rules.presetHint.${p.id}`)}
              className="px-1.5 py-0.5 rounded-full border border-[var(--border)] text-[10px] text-[var(--text-dim)] hover:text-[var(--text)] hover:border-[var(--accent)]">
              {t(`rules.preset.${p.id}`)}
            </button>
          ))}
        </div>
      ) : (
        <>
          <div className="flex items-center gap-1 flex-wrap">
            {targets.length > 1 && (
              <select aria-label={t('rules.target')} className={selectCls} value={req.target}
                onChange={(e) => setReq({ ...req, target: e.target.value as CheckTarget, min: null, max: null })}>
                {targets.map((tg) => <option key={tg} value={tg}>{t(`rules.targets.${tg}`)}</option>)}
              </select>
            )}
            <select aria-label={t('rules.op')} className={selectCls} value={req.op}
              onChange={(e) => setReq({ ...req, op: e.target.value as Requirement['op'] })}>
              <option value="min">≥ {t('rules.ops.min')}</option>
              <option value="max">≤ {t('rules.ops.max')}</option>
              <option value="range">↔ {t('rules.ops.range')}</option>
            </select>
          </div>
          <div className="flex items-center gap-2 flex-wrap">
            {req.op !== 'max' && (
              <NumberInput label={t('rules.min')} suffix={unitLabel(item, req.target, s)}
                value={req.min === null ? null : toDisplay(req.min, item, req.target, s)}
                onCommit={(v) => setReq({ ...req, min: v === null ? null : fromDisplay(v, item, req.target, s) })} />
            )}
            {req.op === 'range' && <span className="text-[10px] text-[var(--text-faint)]">–</span>}
            {req.op !== 'min' && (
              <NumberInput label={t('rules.max')} suffix={unitLabel(item, req.target, s)}
                value={req.max === null ? null : toDisplay(req.max, item, req.target, s)}
                onCommit={(v) => setReq({ ...req, max: v === null ? null : fromDisplay(v, item, req.target, s) })} />
            )}
            <div className="flex-1" />
            <button type="button" onClick={() => setReq(null)} title={t('rules.remove')} aria-label={t('rules.remove')}
              className="text-[10.5px] text-[var(--text-faint)] hover:text-[var(--danger)] px-1">×</button>
          </div>
          {result && result.status !== 'na' && (
            <div className={['text-[10.5px] flex items-center gap-1.5', result.status === 'pass' ? 'text-[#3DD68C]' : 'text-[#FF5A5A]'].join(' ')} role="status">
              <CheckBadge status={result.status} />
              {result.status === 'pass'
                ? t('rules.pass')
                : t('rules.fail', { by: formatShortfall(result.shortfall, item, req.target, s) })}
            </div>
          )}
          {result && result.status === 'na' && (req.min !== null || req.max !== null) && (
            <div className="text-[10px] text-[var(--text-faint)]">{t('rules.na')}</div>
          )}
        </>
      )}

      <input
        type="text" value={noteText} maxLength={120} placeholder={t('rules.notePlaceholder')} aria-label={t('rules.note')}
        onChange={(e) => setNoteText(e.target.value)}
        onBlur={() => onAnnotate({ note: noteText.trim() || null })}
        onKeyDown={(e) => { e.stopPropagation(); if (e.key === 'Enter') (e.target as HTMLInputElement).blur() }}
        className="w-full bg-transparent border-b border-dashed border-[var(--border)] focus:border-[var(--accent)] px-0.5 py-0.5 text-[10.5px] text-[var(--text-dim)] placeholder:text-[var(--text-faint)] outline-none"
      />
    </div>
  )
}

function formatShortfall(v: number, item: MeasureItem, target: CheckTarget, s: MeasureSettings): string {
  if (target === 'slope') return `${formatNumber(v, 1, s.locale)} %`
  if (target === 'volume') return formatVolume(v, s)
  if (target === 'value' && item.kind === 'area') return formatArea(v, s)
  if (target === 'value' && item.kind === 'angle') return formatAngle(v, s)
  return formatLength(v, s)
}
