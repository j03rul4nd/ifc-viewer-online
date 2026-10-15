import { describe, it, expect, beforeEach } from 'vitest'
import { openDataPanel, openDataSamples, type DataPanelKind } from './data-panels'
import { usePointCloudStore } from '../../stores/pointCloudStore'
import { useMeshStore } from '../../stores/meshStore'
import { useVideoStore } from '../../stores/videoStore'
import { useVectorLayerStore } from '../../stores/vectorLayerStore'
import { useTwinDeviceStore } from '../../stores/twinDeviceStore'
import { useGeoStore } from '../../stores/geoStore'

const open: Record<DataPanelKind, () => boolean> = {
  pointcloud: () => usePointCloudStore.getState().panelOpen,
  mesh: () => useMeshStore.getState().panelOpen,
  video: () => useVideoStore.getState().panelOpen,
  layers: () => useVectorLayerStore.getState().panelOpen,
  devices: () => useTwinDeviceStore.getState().panelOpen,
  map: () => useGeoStore.getState().panelOpen,
}

beforeEach(() => {
  usePointCloudStore.getState().setPanelOpen(false)
  useMeshStore.getState().setPanelOpen(false)
  useVideoStore.getState().setPanelOpen(false)
  useVectorLayerStore.getState().setPanelOpen(false)
  useTwinDeviceStore.getState().setPanelOpen(false)
  useGeoStore.getState().setPanelOpen(false)
})

describe('openDataPanel', () => {
  it.each(Object.keys(open) as DataPanelKind[])('opens the %s panel', (kind) => {
    openDataPanel(kind)
    expect(open[kind]()).toBe(true)
  })
})

describe('openDataSamples', () => {
  it('opens the point-cloud panel on its samples', () => {
    usePointCloudStore.getState().setSamplesOpen(false)
    openDataSamples('pointcloud')
    expect(open.pointcloud()).toBe(true)
    expect(usePointCloudStore.getState().samplesOpen).toBe(true)
  })
  it('opens the mesh panel', () => {
    openDataSamples('mesh')
    expect(open.mesh()).toBe(true)
  })
})
