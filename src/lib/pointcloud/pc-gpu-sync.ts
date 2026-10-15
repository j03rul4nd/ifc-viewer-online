// ─── pc-gpu-sync ──────────────────────────────────────────────────────────────
// The single store → GPU bridge for point clouds. pointCloudStore holds intent
// (display, budget, per-scan alignment, visibility, style); point-cloud-system
// holds the Three resources. Before this module, every writer had to remember
// to push its own change to the GPU — and the SDK 'placement' command did not,
// so a host could move a scan in the store while the screen stayed put.
//
// No three import: the system is reached through a structural type only.

import { usePointCloudStore } from '../../stores/pointCloudStore'
import { useTopicStore } from '../../stores/topicStore'
import { itemKey, primaryTopicColor, type TopicState } from '../topics'
import { resolveCloudStyle } from './pc-style'
import type { AlignmentOffset, PointCloudAlignment, PointCloudEntry, PointCloudDisplay } from './pc-types'
import type { PointCloudSystemAPI } from './point-cloud-system'
import type { ViewerAPI } from '../viewer'

export type PointCloudGpuTarget = Pick<
  PointCloudSystemAPI, 'setDisplay' | 'setRenderBudget' | 'setAlignment' | 'setVisible' | 'setCloudStyle'
>

interface Pushed {
  alignment: PointCloudAlignment | null
  visible: boolean
  style: PointCloudEntry['style']
  color: PointCloudEntry['color']
  attributes: PointCloudEntry['attributes']
}

function styleFor(c: PointCloudEntry, display: PointCloudDisplay, topics: TopicState) {
  return resolveCloudStyle({
    display, style: c.style, identityColor: c.color,
    topicColor: primaryTopicColor(topics, itemKey('cloud', c.fileKey)),
    attributes: c.attributes,
  })
}

/**
 * Start the store → GPU sync. Attaches lazily: it never instantiates the point
 * cloud system on its own unless a cloud exists. Returns the unsubscribe.
 */
export function startPointCloudGpuSync(
  getViewer: () => Pick<ViewerAPI, 'peekPointClouds' | 'getPointClouds'> | null,
): () => void {
  let system: PointCloudGpuTarget | null = null
  let attaching = false
  let stopped = false
  let lastDisplay: PointCloudDisplay | null = null
  let lastBudget: number | null = null
  let lastTopics: TopicState | null = null
  const pushed = new Map<string, Pushed>()

  const sync = (): void => {
    if (stopped) return
    const s = usePointCloudStore.getState()
    const viewer = getViewer()
    const peeked = viewer?.peekPointClouds() ?? null
    if (peeked && peeked !== system) {
      // First attach, or the system was disposed and recreated: push everything.
      system = peeked
      lastDisplay = null
      lastBudget = null
      lastTopics = null
      pushed.clear()
    }
    if (!system) {
      // Lazy: only a loaded cloud justifies instantiating the system.
      if (!viewer || s.clouds.length === 0 || attaching) return
      attaching = true
      void viewer.getPointClouds().then((sys) => {
        attaching = false
        if (stopped) return
        system = sys
        sync()
      }, () => { attaching = false })
      return
    }
    const sys = system
    const t = useTopicStore.getState()
    const topics: TopicState = { topics: t.topics, members: t.members }
    const restyleAll = s.display !== lastDisplay || t.topics !== lastTopics?.topics || t.members !== lastTopics?.members
    if (s.display !== lastDisplay) sys.setDisplay(s.display)
    if (s.renderBudget !== lastBudget) sys.setRenderBudget(s.renderBudget)
    lastDisplay = s.display
    lastBudget = s.renderBudget
    lastTopics = topics

    const seen = new Set<string>()
    for (const c of s.clouds) {
      seen.add(c.id)
      const prev = pushed.get(c.id)
      if (c.alignment && c.alignment !== prev?.alignment) sys.setAlignment(c.id, c.alignment)
      if (!prev || c.visible !== prev.visible) sys.setVisible(c.id, c.visible)
      if (restyleAll || !prev || c.style !== prev.style || c.color !== prev.color || c.attributes !== prev.attributes) {
        sys.setCloudStyle(c.id, styleFor(c, s.display, topics))
      }
      pushed.set(c.id, { alignment: c.alignment, visible: c.visible, style: c.style, color: c.color, attributes: c.attributes })
    }
    for (const id of [...pushed.keys()]) if (!seen.has(id)) pushed.delete(id)
  }

  const unsubs = [usePointCloudStore.subscribe(sync), useTopicStore.subscribe(sync)]
  sync()
  return () => {
    stopped = true
    for (const u of unsubs) u()
  }
}

/**
 * Write a placement patch to the store and apply the resulting alignment to the
 * GPU synchronously. Returns the new alignment, or null when the cloud is
 * unknown or has not been placed yet (no alignment). A null system still
 * updates the store; the sync pushes it once the system exists.
 */
export function applyCloudOffset(
  system: Pick<PointCloudSystemAPI, 'setAlignment'> | null,
  id: string,
  patch: Partial<AlignmentOffset>,
): PointCloudAlignment | null {
  const before = usePointCloudStore.getState().clouds.find((c) => c.id === id)
  if (!before?.alignment) return null
  usePointCloudStore.getState().setOffset(id, patch)
  const alignment = usePointCloudStore.getState().clouds.find((c) => c.id === id)?.alignment ?? null
  if (alignment && system) system.setAlignment(id, alignment)
  return alignment
}
