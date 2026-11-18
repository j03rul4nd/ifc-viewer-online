// ─── As-Built section (T-405) ─────────────────────────────────────────────────
// The tiny, eagerly loaded half: decides whether "Compare with model (Preview)"
// shows at all, and lazy-loads the panel only when it does. Free, no plan
// check (D-AB3). First release sits behind `?asbuilt=1`.

import React, { Suspense, lazy } from 'react'
import { useTranslation } from 'react-i18next'
import type { ViewerAPI } from '../../lib/viewer'
import { Badge, Disclosure } from '../pointcloud/pc-ui'

const AsBuiltPanel = lazy(() => import('./AsBuiltPanel'))

/** `?asbuilt=1` (or `?asbuilt` / `?asbuilt=true`) turns the Preview on. */
export function asBuiltFlag(search: string | undefined = typeof window !== 'undefined' ? window.location.search : ''): boolean {
  const v = new URLSearchParams(search ?? '').get('asbuilt')
  return v === '' || v === '1' || v === 'true'
}

export interface AsBuiltCloudOption { id: string; name: string; status: string }

/** Visible only with the flag, at least one IFC and at least one ready scan. */
export function asBuiltVisible(o: { flag: boolean; modelCount: number; clouds: readonly AsBuiltCloudOption[] }): boolean {
  return o.flag && o.modelCount > 0 && o.clouds.some((c) => c.status === 'ready')
}

export interface AsBuiltSectionProps {
  viewerApiRef: React.MutableRefObject<ViewerAPI | null>
  modelIds: readonly string[]
  activeModelId: string | null
  clouds: readonly AsBuiltCloudOption[]
  /** Override for tests; defaults to the page URL. */
  flag?: boolean
}

export default function AsBuiltSection({ viewerApiRef, modelIds, activeModelId, clouds, flag }: AsBuiltSectionProps) {
  const { t } = useTranslation('pointcloud')
  const on = flag ?? asBuiltFlag()
  if (!asBuiltVisible({ flag: on, modelCount: modelIds.length, clouds })) return null
  const ready = clouds.filter((c) => c.status === 'ready')
  const modelId = activeModelId && modelIds.includes(activeModelId) ? activeModelId : modelIds[0]
  return (
    <Disclosure
      testId="asbuilt-section"
      title={t('asBuilt.title')}
      subtitle={t('asBuilt.note')}
      badge={<Badge tint="var(--accent)">{t('asBuilt.preview')}</Badge>}
    >
      <Suspense fallback={null}>
        <AsBuiltPanel viewerApiRef={viewerApiRef} modelId={modelId} clouds={ready} />
      </Suspense>
    </Disclosure>
  )
}
