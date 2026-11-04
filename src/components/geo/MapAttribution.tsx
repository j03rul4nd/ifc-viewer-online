// ─── MapAttribution ───────────────────────────────────────────────────────────
// The map's credits, as the OSMF attribution guidelines allow them to be shown.
//
// The full line sat in the bottom-right corner for as long as the map was on,
// over the controls the viewer puts there. The guidelines do not ask for that:
// the credit may collapse after five seconds or on interaction with the map, as
// long as the user can still find it, here through the "© OpenStreetMap" chip
// that stays in the corner and opens the full list with the licence link.
// The same list is also in the map panel (MapPrivacy), so it is never only a tap away.

import { useEffect, useState } from 'react'
import { useTranslation } from 'react-i18next'

/** How long the full credits stay open when the map appears, ms (OSMF: five seconds). */
export const ATTRIBUTION_OPEN_MS = 5000

const OSM_COPYRIGHT = 'https://www.openstreetmap.org/copyright'

export function MapAttribution({ attributions }: { attributions: readonly string[] }) {
  const { t } = useTranslation('geo')
  const [open, setOpen] = useState(true)

  useEffect(() => {
    if (!open) return
    const timer = setTimeout(() => setOpen(false), ATTRIBUTION_OPEN_MS)
    // Collapse on the first interaction with the map, not with the chip itself.
    const onPointer = (e: PointerEvent) => {
      if ((e.target as Element | null)?.closest?.('[data-testid="geo-attribution"]')) return
      if ((e.target as Element | null)?.tagName === 'CANVAS') setOpen(false)
    }
    window.addEventListener('pointerdown', onPointer, true)
    return () => { clearTimeout(timer); window.removeEventListener('pointerdown', onPointer, true) }
  }, [open])

  if (attributions.length === 0) return null
  return (
    <div
      className="absolute bottom-2 right-2 z-20 pointer-events-auto flex items-end justify-end max-w-[60%]"
      data-testid="geo-attribution"
    >
      {open ? (
        <div className="px-2 py-1 rounded-[6px] text-[9.5px] leading-tight text-[var(--text-dim)] bg-[rgba(10,10,14,0.72)] border border-[var(--border)]">
          <a href={OSM_COPYRIGHT} target="_blank" rel="noopener noreferrer" className="underline-offset-2 hover:underline">
            {t('attribution.licence')}
          </a>
          {' · '}{attributions.join(' · ')}
          <button
            type="button"
            className="ml-1.5 text-[var(--text-faint)] hover:text-[var(--text)]"
            aria-label={t('attribution.hide')}
            onClick={() => setOpen(false)}
          >
            ×
          </button>
        </div>
      ) : (
        <button
          type="button"
          className="px-1.5 py-0.5 rounded-full text-[9.5px] leading-tight text-[var(--text-dim)] bg-[rgba(10,10,14,0.6)] border border-[var(--border)] hover:text-[var(--text)]"
          aria-label={t('attribution.show')}
          title={t('attribution.show')}
          onClick={() => setOpen(true)}
        >
          ⓘ © OpenStreetMap
        </button>
      )}
    </div>
  )
}

/** The same credits, always open, for the map panel. */
export function MapCreditsList({ attributions }: { attributions: readonly string[] }) {
  const { t } = useTranslation('geo')
  if (attributions.length === 0) return null
  return (
    <div className="text-[11px] leading-relaxed text-[var(--text-dim)]">
      <a href={OSM_COPYRIGHT} target="_blank" rel="noopener noreferrer" className="underline underline-offset-2">
        {t('attribution.licence')}
      </a>
      <ul className="mt-1 list-none">
        {attributions.map((a) => <li key={a}>{a}</li>)}
      </ul>
    </div>
  )
}
