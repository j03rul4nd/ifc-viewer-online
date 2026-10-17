// ─── RouteDetails ─────────────────────────────────────────────────────────────
// The breakdown of a found route: total time and length, the travel mode (and
// a switch to recompute it in another), then the stages — streets taken,
// the entrance, each storey walked, the stairs or lift between them.

import { useTranslation } from 'react-i18next'
import type { MeasureSettings, PathItem, RouteLeg, RouteMode } from '../../lib/measure/measure-types'
import { formatDuration, formatLength, formatNumber } from '../../lib/measure/measure-math'

export const ROUTE_MODES: ReadonlyArray<{ mode: RouteMode; icon: string }> = [
  { mode: 'foot', icon: '🚶' }, { mode: 'bike', icon: '🚲' }, { mode: 'car', icon: '🚗' },
]

function distance(m: number, s: MeasureSettings): string {
  if (m >= 1000 && s.units !== 'ft') return `${formatNumber(m / 1000, 2, s.locale)} km`
  return formatLength(m, { ...s, precision: 0 })
}

export function RouteModeChips({ value, onChange, disabled, touch }: { value: RouteMode; onChange(m: RouteMode): void; disabled?: boolean; touch?: boolean }) {
  const { t } = useTranslation('measurement')
  return (
    <div className="flex items-center gap-1" role="radiogroup" aria-label={t('route.mode')}>
      {ROUTE_MODES.map(({ mode, icon }) => (
        <button key={mode} type="button" role="radio" aria-checked={value === mode} disabled={disabled}
          onClick={(e) => { e.stopPropagation(); onChange(mode) }}
          className={['flex items-center gap-1 rounded-full border disabled:opacity-50', touch ? 'px-3 py-1.5 text-[12px]' : 'px-2 py-0.5 text-[10.5px]',
            value === mode ? 'border-[var(--accent)] bg-[rgba(94,106,210,0.14)] text-[var(--text)]' : 'border-[var(--border)] text-[var(--text-dim)] hover:text-[var(--text)]'].join(' ')}>
          <span aria-hidden="true">{icon}</span>{t(`route.modes.${mode}`)}
        </button>
      ))}
    </div>
  )
}

function legLine(l: RouteLeg, t: ReturnType<typeof useTranslation<'measurement'>>['t'], s: MeasureSettings): { icon: string; title: string; detail: string | null } {
  switch (l.kind) {
    case 'street': {
      const icon = l.mode === 'car' ? '🚗' : l.mode === 'bike' ? '🚲' : '🚶'
      const names = (l.streets ?? []).filter((x) => x.name).map((x) => x.name as string)
      const uniq = names.filter((n, i) => names.indexOf(n) === i)
      return { icon, title: t(`route.legs.street.${l.mode ?? 'foot'}`), detail: uniq.length ? uniq.slice(0, 6).join(' → ') + (uniq.length > 6 ? ' …' : '') : null }
    }
    case 'door': return { icon: '🚪', title: t('route.legs.door'), detail: null }
    case 'walk': return { icon: '🚶', title: l.storey ? t('route.legs.walkOn', { storey: l.storey }) : t('route.legs.walk'), detail: null }
    case 'stairs': return { icon: '🪜', title: t('route.legs.stairs', { from: l.from ?? '?', to: l.to ?? '?' }), detail: null }
    case 'lift': return { icon: '🛗', title: t('route.legs.lift', { from: l.from ?? '?', to: l.to ?? '?' }), detail: null }
  }
}

export function RouteDetails({ item, settings: s, busy, onMode }: { item: PathItem; settings: MeasureSettings; busy: boolean; onMode(m: RouteMode): void }) {
  const { t } = useTranslation('measurement')
  const r = item.route!
  const indoorOnly = r.legs.every((l) => l.kind !== 'street')
  return (
    <div className="mt-1.5 rounded-[7px] bg-[var(--surface)] border border-[var(--border)] px-2 py-1.5 flex flex-col gap-1.5" onClick={(e) => e.stopPropagation()}>
      <div className="flex items-baseline justify-between gap-2">
        <span className="text-[15px] font-semibold tabular-nums text-[var(--text)]">{formatDuration(r.seconds)}</span>
        <span className="text-[11px] font-mono tabular-nums text-[var(--text-dim)]">{distance(r.metres, s)}</span>
      </div>
      {!indoorOnly && <RouteModeChips value={r.mode} onChange={onMode} disabled={busy} />}
      <ol className="flex flex-col gap-1">
        {r.legs.map((l, i) => {
          const line = legLine(l, t, s)
          return (
            <li key={i} className="flex items-start gap-1.5 text-[10.5px] leading-snug">
              <span aria-hidden="true" className="w-4 text-center shrink-0">{line.icon}</span>
              <span className="flex-1 min-w-0">
                <span className="text-[var(--text)]">{line.title}</span>
                {line.detail && <span className="block text-[var(--text-faint)] break-words">{line.detail}</span>}
                {(l.guessedMetres ?? 0) >= 1 && (
                  <span className="block text-[#FFB224]">⚠ {t('route.guessed', { m: distance(l.guessedMetres!, s) })}</span>
                )}
              </span>
              {l.kind !== 'door' && (
                <span className="shrink-0 font-mono tabular-nums text-[var(--text-dim)] text-right">
                  {formatDuration(l.seconds)}<span className="block text-[var(--text-faint)]">{distance(l.metres, s)}</span>
                </span>
              )}
            </li>
          )
        })}
      </ol>
      <p className="text-[9.5px] leading-snug text-[var(--text-faint)]">{indoorOnly ? t('route.noteIndoor') : t(`route.note.${r.mode}`)}</p>
    </div>
  )
}
