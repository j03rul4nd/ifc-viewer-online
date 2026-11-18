// ─── SiteHub ──────────────────────────────────────────────────────────────────
// The "Site" tab of the sidebar (desktop column and mobile sheet alike): three
// sub-tabs — snags, units, progress — each lazy-loaded. Owns what they share:
// the project key (siteProjectKey, the same one unit-store uses), the current
// selection with its GlobalId, and the progress element index, read in batches
// with progress and aborted when the models change. Everything stays in this
// browser.

import React, { useCallback, useEffect, useMemo, useState } from 'react'
import { useTranslation } from '../../i18n'
import type { SelectedInfo } from '../../types'
import type { ViewerAPI } from '../../lib/viewer'
import { useSceneStore } from '../../stores/sceneStore'
import { useSiteStore, type SiteTab } from '../../stores/siteStore'
import { siteProjectKey } from '../../lib/site/unit-store'
import { collectProgressElements, type ProgressFragmentsLike } from '../../lib/site/progress-collect'
import type { SnagLocation } from '../../lib/site/snags'
import { locateTarget } from '../../lib/site/locate'
import { loadSnags } from '../../lib/site/snag-store'

const SnagPanel = React.lazy(() => import('./SnagPanel'))
const UnitsPanel = React.lazy(() => import('./UnitsPanel'))
const ProgressPanel = React.lazy(() => import('./ProgressPanel'))

interface Props {
  viewerApiRef: React.MutableRefObject<ViewerAPI | null>
  selected: SelectedInfo | null
}

export interface SiteSelection { modelId: string; expressId: number; globalId: string | null }

export default function SiteHub({ viewerApiRef, selected }: Props) {
  const { t } = useTranslation('site')
  const models = useSceneStore((s) => s.models)
  const project = useMemo(() => siteProjectKey(models), [models])
  const tab = useSiteStore((s) => s.tab)
  const setTab = useSiteStore((s) => s.setTab)
  const setSnags = useSiteStore((s) => s.setSnags)
  const openSnagId = useSiteStore((s) => s.openSnagId)
  const requestOpenSnag = useSiteStore((s) => s.requestOpenSnag)
  const elements = useSiteStore((s) => (s.elementsKey === project ? s.elements : null))
  const [reading, setReading] = useState<{ done: number; total: number } | null>(null)

  // Pins show while this tab is on screen.
  useEffect(() => {
    useSiteStore.getState().setActive(true)
    return () => useSiteStore.getState().setActive(false)
  }, [])

  // Pins need the list even before the snags sub-tab is opened.
  useEffect(() => {
    let alive = true
    loadSnags(project).then((s) => { if (alive) setSnags(s) }, () => { if (alive) setSnags([]) })
    return () => { alive = false }
  }, [project, setSnags])

  // The selection, with its GlobalId (the key snags and progress store by).
  const [selection, setSelection] = useState<SiteSelection | null>(null)
  useEffect(() => {
    const expressId = selected ? Number(selected.id) : NaN
    const modelId = selected?.modelId ?? models[0]?.id
    if (!selected || !modelId || !Number.isFinite(expressId)) { setSelection(null); return }
    setSelection({ modelId, expressId, globalId: null })
    let alive = true
    viewerApiRef.current?.getGlobalIds([expressId], modelId)
      .then(([g]) => { if (alive && g) setSelection({ modelId, expressId, globalId: g }) })
      .catch(() => { /* keep the express id */ })
    return () => { alive = false }
  }, [selected, models, viewerApiRef])

  // Progress needs every element: read once per project, in batches.
  useEffect(() => {
    if (tab !== 'progress' || elements || models.length === 0) return
    const viewer = viewerApiRef.current
    if (!viewer) return
    const ac = new AbortController()
    const list = models.flatMap((m) => {
      const f = viewer.getFragmentsModel(m.id) as ProgressFragmentsLike | null
      return f && typeof f.getItemsIdsWithGeometry === 'function' ? [{ id: m.id, fragments: f }] : []
    })
    setReading({ done: 0, total: 0 })
    collectProgressElements(list, (done, total) => setReading({ done, total }), ac.signal)
      .then((els) => { useSiteStore.getState().setElements(project, els); setReading(null) })
      .catch(() => { if (!ac.signal.aborted) { useSiteStore.getState().setElements(project, []); setReading(null) } })
    return () => { ac.abort(); setReading(null) }
  }, [tab, elements, models, project, viewerApiRef])

  const focus = useCallback((loc: SnagLocation) => {
    const viewer = viewerApiRef.current
    if (!viewer) return
    const target = locateTarget(loc, useSiteStore.getState().elements, models.some((m) => m.id === loc.modelId) ? loc.modelId : models[0]?.id)
    if (!target) return
    viewer.selectElement(target.expressId, target.modelId)
    void viewer.frameElement(target.expressId, target.modelId)
  }, [viewerApiRef, models])

  const onOpened = useCallback(() => requestOpenSnag(null), [requestOpenSnag])
  const progressSelection = useMemo(() => (selection ? [selection] : []), [selection])

  const tabs: Array<[SiteTab, string]> = [['snags', t('tabSnags')], ['units', t('tabUnits')], ['progress', t('tabProgress')]]

  return (
    <div className="flex flex-col min-h-0" data-testid="site-hub">
      <div role="tablist" className="flex items-center gap-0.5 p-1.5 border-b border-[var(--border)] shrink-0">
        {tabs.map(([id, label]) => (
          <button key={id} type="button" role="tab" aria-selected={tab === id} onClick={() => setTab(id)}
            className="flex-1 h-7 max-md:h-9 text-[12px] font-medium rounded-[6px] transition-colors"
            style={{ background: tab === id ? 'var(--surface-2)' : 'transparent', color: tab === id ? 'var(--text)' : 'var(--text-dim)' }}>
            {label}
          </button>
        ))}
      </div>
      <React.Suspense fallback={null}>
        {tab === 'snags' && (
          <SnagPanel projectKey={project} onFocusLocation={focus} onSnagsChange={setSnags}
            openSnagId={openSnagId} onOpened={onOpened}
            selection={selection ? { modelId: selection.modelId, expressId: selection.expressId, globalId: selection.globalId ?? undefined } : null} />
        )}
        {tab === 'units' && <UnitsPanel viewerApiRef={viewerApiRef} />}
        {tab === 'progress' && (elements ? (
          <ProgressPanel viewerApiRef={viewerApiRef} projectKey={project} elements={elements} selection={progressSelection} />
        ) : (
          <div className="p-3 text-[11.5px] text-[var(--text-dim)]" aria-live="polite">
            {t('collecting', { done: reading?.done ?? 0, total: reading?.total ?? 0 })}
          </div>
        ))}
      </React.Suspense>
    </div>
  )
}
