// ─── AdvancedTabs (the Advanced face of the map panel) ────────────────────────
// Every control, in five tabs. The tabs speak for themselves — a dot when
// something in them is on, a count when layers are hidden, an amber dot when
// the scene is in trouble — so nothing has to be opened just to find out
// whether anything in it matters.

import type { ReactElement } from 'react'
import { motion } from 'framer-motion'
import { useTranslation } from 'react-i18next'
import { useShallow } from 'zustand/react/shallow'
import { useGeoStore } from '../../stores/geoStore'
import { FEATURE_KINDS } from '../../lib/geo/osm-features'
import { IconBuildings, IconGauge, IconMap, IconPin, IconTerrain } from './icons'
import { SECTION_X, SectionBoundary } from './ui'
import { BasemapSection } from './sections/BasemapSection'
import { TerrainSection } from './sections/TerrainSection'
import { ContextSection } from './sections/ContextSection'
import { PlacementSection } from './sections/PlacementSection'
import { PerformanceSection } from './sections/PerformanceSection'

export type AdvancedTabId = 'base' | 'terrain' | 'context' | 'place' | 'perf'

interface TabSpec {
  id: AdvancedTabId
  label: string
  icon: (p: { size?: number }) => ReactElement
  badge?: string
  dot?: 'on' | 'warn'
}

export function AdvancedTabs({ tab, onTab, scroll = true }: {
  tab: AdvancedTabId
  onTab: (t: AdvancedTabId) => void
  /** False when the panel scrolls as one piece (short viewport): the bar sticks instead. */
  scroll?: boolean
}) {
  const { t } = useTranslation('geo')
  const s = useGeoStore(useShallow((st) => ({
    mapMode: st.mapMode,
    placement: st.placement,
    terrainEnabled: st.terrainEnabled,
    buildingsEnabled: st.buildingsEnabled,
    buildingsStatus: st.buildingsStatus,
    featureLayers: st.featureLayers,
    slow: st.perf?.slow ?? false,
    troubled: (st.sceneReport?.failed.length ?? 0) > 0
      || (!st.budgetLifted && (st.sceneReport?.skipped.length ?? 0) > 0),
  })))
  const visibleLayerCount = FEATURE_KINDS.filter((k) => s.featureLayers[k]).length

  const tabs: TabSpec[] = [
    { id: 'base', label: t('panel.tabs.base'), icon: IconMap },
    { id: 'terrain', label: t('panel.tabs.terrain'), icon: IconTerrain, dot: s.terrainEnabled ? 'on' : undefined },
    {
      id: 'context',
      label: t('panel.tabs.context'),
      icon: IconBuildings,
      dot: s.buildingsEnabled ? 'on' : undefined,
      // Only when something is hidden: "13/13" is noise, "9/13" is the one
      // fact you cannot see from the outside.
      badge: s.buildingsEnabled && s.buildingsStatus === 'ready' && visibleLayerCount < FEATURE_KINDS.length
        ? `${visibleLayerCount}/${FEATURE_KINDS.length}` : undefined,
    },
    { id: 'place', label: t('panel.tabs.place'), icon: IconPin, dot: s.mapMode === 'on' && s.placement ? 'on' : undefined },
    { id: 'perf', label: t('panel.tabs.perf'), icon: IconGauge, dot: s.slow || s.troubled ? 'warn' : undefined },
  ]

  return (
    <>
      <div
        role="tablist"
        aria-label={t('panel.title')}
        className={`${SECTION_X} flex gap-0.5 border-b border-[var(--border)] shrink-0 ${scroll ? '' : 'sticky top-0 z-[2] bg-[rgba(16,16,20,0.97)]'}`}
        onKeyDown={(e) => {
          const i = tabs.findIndex((x) => x.id === tab)
          if (e.key === 'ArrowRight') { e.preventDefault(); onTab(tabs[(i + 1) % tabs.length].id) }
          if (e.key === 'ArrowLeft') { e.preventDefault(); onTab(tabs[(i - 1 + tabs.length) % tabs.length].id) }
        }}
      >
        {tabs.map((x) => {
          const Icon = x.icon
          const selected = tab === x.id
          return (
            <button
              key={x.id}
              role="tab"
              id={`geo-tab-${x.id}`}
              aria-selected={selected}
              aria-controls={`geo-panel-${x.id}`}
              tabIndex={selected ? 0 : -1}
              title={x.label}
              onClick={() => onTab(x.id)}
              className={[
                'relative flex-1 min-w-0 pt-1.5 pb-1.5 px-0.5 flex flex-col items-center gap-[3px]',
                'transition-colors rounded-t-[6px]',
                selected ? 'text-[var(--text)]' : 'text-[var(--text-faint)] hover:text-[var(--text-dim)] hover:bg-[var(--surface-2)]',
              ].join(' ')}
            >
              <span className="relative">
                <Icon size={14} />
                {/* The count rides on the icon, like the dot: beside the label it
                    truncated "Surroundings" to "Surr…" in every locale. */}
                {x.badge && (
                  <span className="absolute -top-[5px] left-[calc(100%+1px)] px-[3px] rounded-[4px] bg-[var(--surface-2)] border border-[var(--border)] font-mono text-[8px] leading-[11px] text-[var(--text-dim)] tabular-nums whitespace-nowrap">
                    {x.badge}
                  </span>
                )}
                {x.dot && !x.badge && (
                  <span
                    className="absolute -top-[1px] -right-[4px] w-[5px] h-[5px] rounded-full"
                    style={{ background: x.dot === 'warn' ? 'var(--warn)' : 'var(--accent)' }}
                  />
                )}
              </span>
              <span className="max-w-full min-w-0 truncate text-[9.5px] font-medium leading-tight">{x.label}</span>
              {selected && (
                <motion.span
                  layoutId="geo-tab-underline"
                  className="absolute left-1 right-1 -bottom-px h-[2px] rounded-full bg-[var(--accent)]"
                  transition={{ type: 'spring', stiffness: 500, damping: 38 }}
                />
              )}
            </button>
          )
        })}
      </div>

      <div
        role="tabpanel"
        id={`geo-panel-${tab}`}
        aria-labelledby={`geo-tab-${tab}`}
        className={scroll ? 'flex-1 overflow-y-auto overscroll-contain' : ''}
      >
        <SectionBoundary key={tab} message={t('panel.sectionFailed')} retryLabel={t('panel.sectionRetry')}>
          {tab === 'base' && <BasemapSection />}
          {tab === 'terrain' && <TerrainSection />}
          {tab === 'context' && <ContextSection />}
          {tab === 'place' && <PlacementSection />}
          {tab === 'perf' && <PerformanceSection />}
        </SectionBoundary>
      </div>
    </>
  )
}
