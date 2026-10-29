// ─── DualScreenPane ───────────────────────────────────────────────────────────
// The second screen of a dual-screen layout: the spatial tree and the selection
// (properties / categories / quantities) beside the 3D view instead of on top
// of it. docs/DUAL_SCREEN.md.
//
// It owns no data. The tree and the sidebar are the app's own components,
// passed in and kept mounted whichever view is showing — switching views is a
// CSS change, so the tree keeps its expansion and scroll, and the properties
// their tab, exactly as a column would.

import type { ReactNode } from 'react'
import { useTranslation } from 'react-i18next'
import type { DualLayout } from '../../lib/ui/display-segments'
import { useDualScreenStore, type DualPaneView } from '../../stores/dualScreenStore'

interface Props {
  layout: DualLayout
  tree: ReactNode
  properties: ReactNode
  /** No model yet: the tree region says so instead of sitting empty. */
  hasModels: boolean
}

const VIEWS: DualPaneView[] = ['explore', 'inspect', 'tree']

export default function DualScreenPane({ layout, tree, properties, hasModels }: Props) {
  const { t } = useTranslation('viewer')
  const view = useDualScreenStore((s) => s.view)
  const setView = useDualScreenStore((s) => s.setView)
  const toggleSwap = useDualScreenStore((s) => s.toggleSwap)
  const setPref = useDualScreenStore((s) => s.setPref)
  const { pane } = layout

  const showTree = view !== 'inspect'
  const showProps = view !== 'tree'

  return (
    <section
      aria-label={t('dualScreen.pane')}
      data-dual-pane={layout.posture}
      className="fixed z-[21] flex flex-col bg-[var(--surface)] text-[var(--text)] overflow-hidden"
      style={{
        left: pane.x, top: pane.y, width: pane.width, height: pane.height,
        // The pane sits against the hinge on one side; that side gets the
        // border, so the seam reads as a seam and not as the app's edge.
        borderLeft: layout.posture === 'side-by-side' && pane.x > layout.viewer.x ? '1px solid var(--border)' : undefined,
        borderRight: layout.posture === 'side-by-side' && pane.x < layout.viewer.x ? '1px solid var(--border)' : undefined,
        borderTop: layout.posture === 'stacked' && pane.y > layout.viewer.y ? '1px solid var(--border)' : undefined,
        paddingTop: pane.y === 0 ? 'env(safe-area-inset-top, 0px)' : undefined,
      }}
    >
      <header className="flex items-center gap-1.5 px-2 h-11 shrink-0 border-b border-[var(--border)]">
        <div role="tablist" aria-label={t('dualScreen.views')} className="flex flex-1 min-w-0 bg-[var(--surface-2)] rounded-lg p-0.5">
          {VIEWS.map((v) => (
            <button
              key={v}
              role="tab"
              aria-selected={view === v}
              onClick={() => setView(v)}
              className={`flex-1 min-w-0 h-8 px-2 rounded-md text-[12px] font-medium truncate transition-colors ${
                view === v ? 'bg-[var(--surface)] text-[var(--text)] shadow-sm' : 'text-[var(--text-dim)] active:text-[var(--text)]'
              }`}
            >
              {t(`dualScreen.view.${v}`)}
            </button>
          ))}
        </div>
        <button
          onClick={toggleSwap}
          aria-label={t('dualScreen.swap')}
          title={t('dualScreen.swap')}
          className="w-10 h-10 shrink-0 grid place-items-center rounded-lg text-[var(--text-dim)] active:bg-[var(--surface-2)]"
        >
          <svg width="16" height="16" viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round"
            style={{ transform: layout.posture === 'stacked' ? 'rotate(90deg)' : undefined }}>
            <path d="M2 5h11M10 2l3 3-3 3M14 11H3M6 8l-3 3 3 3" />
          </svg>
        </button>
        <button
          onClick={() => setPref('off')}
          aria-label={t('dualScreen.single')}
          title={t('dualScreen.single')}
          className="w-10 h-10 shrink-0 grid place-items-center rounded-lg text-[var(--text-dim)] active:bg-[var(--surface-2)]"
        >
          <svg width="16" height="16" viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.6">
            <rect x="2.5" y="2.5" width="11" height="11" rx="1.5" />
          </svg>
        </button>
      </header>

      <div className="flex-1 min-h-0 flex flex-col">
        {/* Both stay mounted; the view only decides who is visible and how
            the height is shared. Explore gives the tree the top 45%. */}
        <div
          className="min-h-0 flex flex-col overflow-hidden"
          style={{
            display: showTree ? 'flex' : 'none',
            flex: showProps ? '0 0 45%' : '1 1 auto',
            borderBottom: showProps ? '1px solid var(--border)' : undefined,
          }}
        >
          {hasModels ? tree : (
            <p className="m-auto px-6 text-center text-[12px] text-[var(--text-faint)]">{t('dualScreen.noModel')}</p>
          )}
        </div>
        <div className="min-h-0 flex-1 flex flex-col" style={{ display: showProps ? 'flex' : 'none' }}>
          {properties}
        </div>
      </div>
    </section>
  )
}

/** Shown in the viewer when a split is possible but turned off: the way back. */
export function DualScreenOffer({ hardware }: { hardware: boolean }) {
  const { t } = useTranslation('viewer')
  const setPref = useDualScreenStore((s) => s.setPref)
  return (
    <button
      onClick={() => setPref(hardware ? 'auto' : 'split')}
      className="absolute left-3 bottom-[calc(env(safe-area-inset-bottom,0px)+88px)] md:bottom-3 z-[9] h-10 px-3 rounded-lg glass border border-[var(--border)] text-[12px] font-medium text-[var(--text-dim)] flex items-center gap-2 active:text-[var(--text)]"
    >
      <svg width="16" height="16" viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.6">
        <rect x="1.5" y="2.5" width="5.5" height="11" rx="1" /><rect x="9" y="2.5" width="5.5" height="11" rx="1" />
      </svg>
      {t(hardware ? 'dualScreen.useBoth' : 'dualScreen.split')}
    </button>
  )
}
