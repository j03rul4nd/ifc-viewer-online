// ─── DropOverlay ──────────────────────────────────────────────────────────────
// While files are dragged over the window: "Drop to add to the scene", how
// many files, and where each format goes. Purely visual (pointer-events-none):
// App's window drop handler still takes the drop, so drop semantics are
// unchanged. Browsers hide file names until the drop, so this shows a legend,
// never a per-file prediction — the per-file outcome is the post-drop toast.
//
// Mounted at route level (the viewer's fixed inset-0 motion.div), never inside
// [data-viewer-area] (scripts/viewport-lane.test.ts).

import React, { useMemo } from 'react'
import { useTranslation } from 'react-i18next'
import * as Icons from '../Icons'
import { useFileDragActive } from '../../hooks/useFileDragActive'
import { dropLegend, type AddDataFlags, type DropLegendRow } from '../../lib/loading/add-data-catalogue'
import { isPointCloudEnabled } from '../../lib/pointcloud/pc-flag'
import { isVideoEnabled } from '../../lib/video/video-flag'
import { isMeshEnabled } from '../../lib/mesh/mesh-flag'
import { isGisEnabled } from '../../lib/geo/gis-flag'

const ROW_ICON: Record<DropLegendRow['kind'], (p: { size?: number }) => React.ReactElement> = {
  ifc: Icons.FileIfc,
  pointcloud: Icons.PointCloud,
  video: Icons.Video,
  mesh: Icons.Mesh,
  layers: Icons.DataLayers,
  scene: Icons.Globe,
}

const ROW_TITLE = {
  ifc: 'addData.cards.ifc.title',
  pointcloud: 'addData.cards.pointcloud.title',
  video: 'addData.cards.video.title',
  mesh: 'addData.cards.mesh.title',
  layers: 'addData.cards.layers.title',
  scene: 'addData.cards.scene.title',
} as const satisfies Record<DropLegendRow['kind'], string>

export function DropOverlay({ enabled }: { enabled: boolean }) {
  const { t } = useTranslation('toolbar')
  const { active, count } = useFileDragActive(enabled)
  const flags = useMemo<AddDataFlags>(() => ({
    pointcloud: isPointCloudEnabled(),
    video: isVideoEnabled(),
    mesh: isMeshEnabled(),
    gis: isGisEnabled(),
  }), [])
  const rows = useMemo(() => dropLegend(flags), [flags])

  if (!active) return null
  return (
    <div data-testid="drop-overlay" aria-hidden className="absolute inset-0 z-[80] pointer-events-none bg-black/30">
      <div className="absolute inset-3 rounded-2xl border-2 border-dashed border-[var(--accent)]" />
      <div className="absolute inset-0 flex items-center justify-center p-4">
        <div className="w-[420px] max-w-[calc(100%-32px)] glass-md rounded-xl border border-[var(--border)] p-4 flex flex-col gap-2.5">
          <div className="flex items-baseline justify-between gap-3">
            <div className="text-[15px] font-semibold text-[var(--text)]">{t('drop.title')}</div>
            {count > 0 && <div className="text-[12px] text-[var(--text-dim)] shrink-0">{t('drop.count', { count })}</div>}
          </div>
          <div className="text-[11.5px] text-[var(--text-dim)]">{t('drop.legend')}</div>
          <ul className="flex flex-col gap-1.5">
            {rows.map((row) => {
              const Glyph = ROW_ICON[row.kind]
              return (
                <li key={row.kind} className="flex items-center gap-2 text-[12px]">
                  <span className="text-[var(--accent-2)] shrink-0"><Glyph size={15} /></span>
                  <span className="text-[var(--text)] font-medium">{t(ROW_TITLE[row.kind])}</span>
                  <span className="ml-auto font-mono text-[10.5px] text-[var(--text-faint)] text-right">{row.formats.join(' · ')}</span>
                </li>
              )
            })}
          </ul>
          {flags.pointcloud && <div className="text-[11px] text-[var(--warn)]">{t('addData.pointcloudNote')}</div>}
          <div className="text-[11px] text-[var(--text-faint)]">{t('addData.description')}</div>
        </div>
      </div>
    </div>
  )
}
