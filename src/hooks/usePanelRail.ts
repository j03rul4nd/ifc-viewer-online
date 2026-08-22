// ─── usePanelRail ─────────────────────────────────────────────────────────────
// Which panels the rail should offer right now, and how to toggle each.
//
// The open flags live in six different stores — that is a fact of this codebase
// and moving them would be a hundred-call-site refactor for no behaviour anyone
// can see. This hook is the one place that knows where they all are, so
// PanelRail stays a presentational component and every other caller keeps
// working exactly as it did.
//
// A panel that does not apply is OMITTED, not disabled. A point cloud panel with
// no scan loaded is noise on a 44px rail, and a disabled icon teaches nothing.

import { useMemo } from 'react'
import { useUIStore } from '../stores/uiStore'
import { useGeoStore } from '../stores/geoStore'
import { usePointCloudStore } from '../stores/pointCloudStore'
import { useMeshStore } from '../stores/meshStore'
import { useSolarStore } from '../stores/solarStore'
import { isGisEnabled } from '../lib/geo/gis-flag'
import { applicablePanels, type PanelId } from '../lib/ui/panel-rail'
import type { RailItem } from '../components/PanelRail'

export interface PanelRailSource {
  /** Icons, supplied by the caller so this hook imports no JSX. */
  icons: Partial<Record<PanelId, React.ReactNode>>
  /** Labels, already translated. */
  labels: Partial<Record<PanelId, string>>
  /** False in the client presentation skin, which hides the technical tools. */
  technical: boolean
}

export function usePanelRail({ icons, labels, technical }: PanelRailSource): RailItem[] {
  const properties = useUIStore((s) => s.sidebarExpanded)
  const setProperties = useUIStore((s) => s.setSidebarExpanded)
  const scene = useUIStore((s) => s.scenePanelOpen)
  const setScene = useUIStore((s) => s.setScenePanelOpen)
  const measurement = useUIStore((s) => s.measurementPanelOpen)
  const setMeasurement = useUIStore((s) => s.setMeasurementPanelOpen)
  const section = useUIStore((s) => s.clipPanelOpen)
  const setSection = useUIStore((s) => s.setClipPanelOpen)
  const plans = useUIStore((s) => s.plansPanelOpen)
  const setPlans = useUIStore((s) => s.setPlansPanelOpen)
  const map = useGeoStore((s) => s.panelOpen)
  const setMap = useGeoStore((s) => s.setPanelOpen)
  const pointcloud = usePointCloudStore((s) => s.panelOpen)
  const setPointcloud = usePointCloudStore((s) => s.setPanelOpen)
  const pointClouds = usePointCloudStore((s) => s.clouds.length)
  const mesh = useMeshStore((s) => s.panelOpen)
  const setMesh = useMeshStore((s) => s.setPanelOpen)
  const meshes = useMeshStore((s) => s.meshes.length)
  const solar = useSolarStore((s) => s.panelOpen)
  const setSolar = useSolarStore((s) => s.setPanelOpen)

  return useMemo(() => {
    const open: Record<PanelId, boolean> = {
      properties, scene, measurement, section, plans, map, solar, pointcloud, mesh,
    }
    const set: Record<PanelId, (v: boolean) => void> = {
      properties: setProperties,
      scene: setScene, measurement: setMeasurement, section: setSection,
      plans: setPlans, map: setMap, solar: setSolar,
      pointcloud: setPointcloud, mesh: setMesh,
    }
    return applicablePanels({ technical, gis: isGisEnabled(), pointClouds, meshes })
      .filter((id) => icons[id])
      .map((id): RailItem => ({
        id,
        label: labels[id] ?? id,
        icon: icons[id],
        open: open[id],
        // The same control both ways: click to open, click again to park.
        onToggle: () => set[id](!open[id]),
      }))
  }, [
    icons, labels, technical, pointClouds, meshes,
    properties, setProperties, scene, setScene, measurement, setMeasurement, section, setSection,
    plans, setPlans, map, setMap, solar, setSolar,
    pointcloud, setPointcloud, mesh, setMesh,
  ])
}
