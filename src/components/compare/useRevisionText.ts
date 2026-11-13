// Site wording of a revision change ("Moved 120 mm east", "Height 3000 → 3200 mm")
// from the engine's summary key + params, in the user's language (M4).
import { useCallback } from 'react'
import { useTranslation } from 'react-i18next'
import type { RevisionChange } from '../../lib/compare/revision-types'
import { readableClass } from '../../lib/compare/revision-view'

const DIRS = new Set(['N', 'NE', 'E', 'SE', 'S', 'SW', 'W', 'NW', 'up', 'down'])

export function useRevisionText() {
  const { t, i18n } = useTranslation('compare')
  const num = useCallback((n: number, digits = 0) => n.toLocaleString(i18n.language, { maximumFractionDigits: digits, minimumFractionDigits: digits }), [i18n.language])

  const phrase = useCallback((c: RevisionChange): string => {
    const { key, params } = c.summary
    const p: Record<string, string | number> = { ...params }
    if (typeof p.mm === 'number') p.mm = num(p.mm)
    if (typeof p.before === 'number') p.before = key === 'volume_m3' ? num(p.before, 3) : num(p.before)
    if (typeof p.after === 'number') p.after = key === 'volume_m3' ? num(p.after, 3) : num(p.after)
    if (typeof p.pct === 'number') p.pct = `${p.pct > 0 ? '+' : ''}${num(p.pct, 1)}`
    if (typeof p.dir === 'string') p.dir = DIRS.has(p.dir) ? (t as unknown as (key: string) => string)(`rc.dir.${p.dir}`) : ''
    if (typeof p.class === 'string') p.class = readableClass(p.class)
    if (typeof p.axis === 'string') p.axis = (t as unknown as (key: string) => string)(`rc.axis.${p.axis}`)
    const k = key === 'moved_mm' && !p.dir ? 'moved_mm_nodir' : key
    return t(`rc.summary.${k}`, { ...p, defaultValue: t('rc.summary.changed') })
  }, [t, num])

  return { phrase, t, num }
}
