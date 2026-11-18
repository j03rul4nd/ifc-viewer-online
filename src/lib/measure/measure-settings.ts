// ─── measure-settings ─────────────────────────────────────────────────────────
// Units, precision and snaps survive a reload — someone who works in millimetres
// should not have to say so every session. Stored per browser, validated on the
// way in, and never required: private windows and blocked storage fall back to
// the defaults.

import { DEFAULT_MEASURE_SETTINGS, type LengthUnit, type MeasureSettings } from './measure-types'

const KEY = 'pv.measure.settings.v1'
const UNITS: readonly LengthUnit[] = ['m', 'cm', 'mm', 'ft']

export type StoredMeasureSettings = Omit<MeasureSettings, 'locale'>

/** Parse whatever was stored, keeping only fields that are still valid. */
export function parseMeasureSettings(raw: string | null): StoredMeasureSettings {
  const base: StoredMeasureSettings = {
    units: DEFAULT_MEASURE_SETTINGS.units,
    precision: DEFAULT_MEASURE_SETTINGS.precision,
    snaps: { ...DEFAULT_MEASURE_SETTINGS.snaps },
    showComponents: DEFAULT_MEASURE_SETTINGS.showComponents,
  }
  if (!raw) return base
  try {
    const v = JSON.parse(raw) as Partial<StoredMeasureSettings>
    if (typeof v !== 'object' || v === null) return base
    if (UNITS.includes(v.units as LengthUnit)) base.units = v.units as LengthUnit
    if ([0, 1, 2, 3].includes(v.precision as number)) base.precision = v.precision as 0 | 1 | 2 | 3
    if (v.snaps && typeof v.snaps === 'object') {
      for (const k of ['vertex', 'midpoint', 'edge'] as const) {
        if (typeof v.snaps[k] === 'boolean') base.snaps[k] = v.snaps[k]
      }
    }
    if (typeof v.showComponents === 'boolean') base.showComponents = v.showComponents
  } catch { /* corrupt: defaults */ }
  return base
}

export function loadMeasureSettings(): StoredMeasureSettings {
  try { return parseMeasureSettings(localStorage.getItem(KEY)) } catch { return parseMeasureSettings(null) }
}

export function saveMeasureSettings(s: MeasureSettings): void {
  const { locale: _locale, ...stored } = s
  try { localStorage.setItem(KEY, JSON.stringify(stored)) } catch { /* quota / private mode */ }
}

/** The precision that suits a unit when someone switches to it. */
export function defaultPrecisionFor(units: LengthUnit): 0 | 1 | 2 | 3 {
  if (units === 'mm') return 0
  if (units === 'cm') return 1
  if (units === 'ft') return 2
  return 2
}
