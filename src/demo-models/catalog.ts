// ─── Demo catalogue ───────────────────────────────────────────────────────────
// What the gallery offers, described the way a visitor looks for it: by their
// field and by what they want to do, never by file type or by our own product
// terms. models.ts, point-clouds.ts and scene-demos.ts still own the files; this
// only adds the plain-language layer over them. Titles live in each locale's
// landing.json under demoGallery.items.<id>.

import { demoSets, twinDemoSets, type DemoSet } from './models'
import { DEMO_POINT_CLOUDS, type DemoPointCloud } from './point-clouds'
import { SCENE_DEMOS, sceneDemoUrl, type SceneDemo } from './scene-demos'

export const DEMO_DOMAINS = ['housing', 'buildings', 'structure', 'services', 'civil', 'city', 'scans'] as const
export type DemoDomain = (typeof DEMO_DOMAINS)[number]

export const DEMO_GOALS = ['quick', 'map', 'live', 'combine', 'scan', 'heavy'] as const
export type DemoGoal = (typeof DEMO_GOALS)[number]

export type DemoEntry = {
  id: string
  domain: DemoDomain
  goals: DemoGoal[]
  /** Same-origin capture from scripts/demo-thumbs/capture.mjs. */
  image: string
  sizeBytes: number | null
} & (
  | { kind: 'set'; set: DemoSet }
  | { kind: 'scene'; scene: SceneDemo; href: string }
  | { kind: 'cloud'; cloud: DemoPointCloud; href: string }
)

/** Below this a demo opens more or less at once, even on a phone. */
const QUICK_BYTES = 3 * 1_048_576
/** Above this it is a real load test, and the card should not pretend otherwise. */
const HEAVY_BYTES = 20 * 1_048_576

const SET_META: Record<string, { domain: DemoDomain; goals?: DemoGoal[] }> = {
  'shanghai-tower': { domain: 'buildings' },
  'oriental-pearl-tower': { domain: 'buildings' },
  'shanghai-world-financial-center': { domain: 'buildings' },
  'cras-feup-as-built': { domain: 'buildings', goals: ['scan'] },
  'hello-world': { domain: 'buildings' },
  'operations-pavilion-video': { domain: 'buildings' },
  'warehouse-operations-lidar': { domain: 'buildings', goals: ['scan', 'live'] },
  'construction-progress-lidar': { domain: 'structure', goals: ['scan'] },
  'utility-tunnel-lidar': { domain: 'civil', goals: ['scan'] },
  'japanese-temple': { domain: 'buildings' },
  poblenou: { domain: 'buildings', goals: ['combine', 'map'] },
  'torre-poblenou': { domain: 'buildings', goals: ['map'] },
  'hotel-vela': { domain: 'buildings', goals: ['combine', 'map'] },
  'metro-drassanes': { domain: 'civil', goals: ['map'] },
  'ciutadella-pavilion': { domain: 'buildings', goals: ['map'] },
  'duplex-architecture': { domain: 'housing' },
  'sample-house': { domain: 'housing' },
  'office-architecture': { domain: 'buildings' },
  'tall-building': { domain: 'buildings' },
  'large-building': { domain: 'buildings' },
  'duplex-electrical': { domain: 'services' },
  'duplex-mechanical': { domain: 'services' },
  'office-mep': { domain: 'services' },
  'office-structure': { domain: 'structure' },
  'school-structure': { domain: 'structure' },
  'infra-bridge': { domain: 'civil' },
}

/** Scan id → the demo set it was captured from. */
const SCAN_PAIRS: Record<string, string> = {
  'cras-feup-labs': 'cras-feup-as-built',
  'poblenou-site-scan': 'poblenou',
}

const thumb =(id: string, base: string): string => `${base}demo-thumbs/${id}.jpg`

function sizeGoals(bytes: number): DemoGoal[] {
  if (bytes <= QUICK_BYTES) return ['quick']
  return bytes >= HEAVY_BYTES ? ['heavy'] : []
}

export function demoCatalog(
  { maps, clouds, twins, base = import.meta.env.BASE_URL ?? '/' }:
  { maps: boolean; clouds: boolean; twins: boolean; base?: string },
): DemoEntry[] {
  const root = base.endsWith('/') ? base : `${base}/`
  const out: DemoEntry[] = demoSets().map((set) => {
    const meta = SET_META[set.id] ?? { domain: 'buildings' as const }
    return {
      id: set.id, kind: 'set', set, domain: meta.domain, sizeBytes: set.sizeBytes,
      goals: [...(meta.goals ?? []), ...sizeGoals(set.sizeBytes)],
      image: thumb(set.id, root),
    }
  })
  if (twins) {
    for (const set of twinDemoSets()) {
      out.push({
        id: set.id, kind: 'set', set, sizeBytes: set.sizeBytes,
        domain: 'housing', goals: ['live'],
        // The same files, so the same capture: the live part only starts on load.
        image: thumb(set.twin === 'home' ? 'duplex-architecture' : 'poblenou', root),
      })
    }
  }
  if (maps) {
    for (const scene of SCENE_DEMOS) {
      out.push({
        id: `scene-${scene.id}`, kind: 'scene', scene, href: sceneDemoUrl(scene, root),
        domain: 'city', goals: ['map', 'live'], sizeBytes: null,
        image: thumb(`scene-${scene.id}`, root),
      })
    }
  }
  if (clouds) {
    // Only scans with a model of their own: a link's scan waits for a model to
    // align against, and the public ones without one stay in the cloud panel.
    for (const cloud of DEMO_POINT_CLOUDS) {
      const pair = demoSets().find((s) => s.id === SCAN_PAIRS[cloud.id])
      if (!pair) continue
      const models = pair.models.map((m) => encodeURIComponent(m.ifcUrl)).join(',')
      out.push({
        id: `cloud-${cloud.id}`, kind: 'cloud', cloud,
        href: `${root}?model=${models}&scan=${encodeURIComponent(cloud.url)}`,
        domain: 'scans', goals: ['scan', ...sizeGoals(cloud.sizeBytes)], sizeBytes: cloud.sizeBytes,
        image: thumb(`cloud-${cloud.id}`, root),
      })
    }
  }
  return out
}

/** The few a first-time visitor sees first, small enough not to punish a click. */
const RECOMMENDED = ['duplex-architecture', 'scene-barcelona-placa-catalunya', 'torre-poblenou', 'japanese-temple']

export function recommendedDemos(all: DemoEntry[]): DemoEntry[] {
  return RECOMMENDED
    .map((id) => all.find((e) => e.id === id))
    .filter((e): e is DemoEntry => Boolean(e))
    .slice(0, 3)
}

/** Case and accent blind, so "dúplex", "duplex" and "DUPLEX" find the same card. */
export function foldText(s: string): string {
  return s.normalize('NFD').replace(/\p{M}/gu, '').toLowerCase()
}

/**
 * Every word must appear somewhere in `haystack`. Word by word rather than one
 * phrase, so "torre barcelona" finds a card whose text has them apart.
 */
export function matchesQuery(haystack: string, query: string): boolean {
  const text = foldText(haystack)
  return foldText(query).split(/\s+/).filter(Boolean).every((w) => text.includes(w))
}

export function formatDemoBytes(bytes: number): string {
  if (bytes >= 1_048_576) return `${(bytes / 1_048_576).toFixed(1)} MB`
  return `${Math.max(1, Math.round(bytes / 1024))} KB`
}
