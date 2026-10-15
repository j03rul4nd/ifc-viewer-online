// ─── Data panels ──────────────────────────────────────────────────────────────
// One way to open the panel behind a data kind, from anywhere: a toast action,
// the Add data hub, the drop follow-up. It only flips store flags — the panel
// registry closes whatever else was open — so it is safe from lib code and
// from callbacks that outlive the component that scheduled them.

import { usePointCloudStore } from '../../stores/pointCloudStore'
import { useMeshStore } from '../../stores/meshStore'
import { useVideoStore } from '../../stores/videoStore'
import { useVectorLayerStore } from '../../stores/vectorLayerStore'
import { useTwinDeviceStore } from '../../stores/twinDeviceStore'
import { useGeoStore } from '../../stores/geoStore'

/** Data kinds with a panel. 'devices' is the 'twin-devices' ViewportPanel. */
export type DataPanelKind = 'pointcloud' | 'mesh' | 'video' | 'layers' | 'devices' | 'map'

export function openDataPanel(kind: DataPanelKind): void {
  switch (kind) {
    case 'pointcloud': usePointCloudStore.getState().setPanelOpen(true); return
    case 'mesh': useMeshStore.getState().setPanelOpen(true); return
    case 'video': useVideoStore.getState().setPanelOpen(true); return
    case 'layers': useVectorLayerStore.getState().setPanelOpen(true); return
    case 'devices': useTwinDeviceStore.getState().setPanelOpen(true); return
    case 'map': useGeoStore.getState().setPanelOpen(true); return
  }
}

/**
 * The hub's "Samples" action. Today it opens the panel, whose empty state lists
 * the samples; the point-cloud branch is the hook for a panel that can scroll
 * straight to its samples section.
 */
export function openDataSamples(kind: 'pointcloud' | 'mesh'): void {
  openDataPanel(kind)
}
