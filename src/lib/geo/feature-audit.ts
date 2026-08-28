// ─── feature-audit ────────────────────────────────────────────────────────────
// What reached the scene, and what did not.
//
// The question this answers is the one that cannot be answered by looking:
// OF EVERYTHING REAL IN THIS BOX, WHAT ACTUALLY GETS DRAWN? Two bugs found by
// eye in one afternoon — a beach assembled into twice itself, a quay eaten by
// the shoreline branch — were both invisible to every test and both obvious in
// a census. Finding the third one the same way is not a plan.
//
// The pipeline has stages, and a thing can die at any of them:
//
//   fetched → parsed → classified → accepted → geometry → rendered
//
// This module owns the pure half — everything up to `parsed`, where an element
// either became an OsmFeature or has a recorded reason why not. The geometry
// and render stages need three.js and belong to whoever builds the layers.
//
// PURE: elements and features in, numbers out. No scene, no three.js, no fetch.

import type { FeatureKind, FeatureLoss, OsmFeature } from './osm-features'

/** The minimum an element needs for this module to count it. */
export interface AuditElement {
  type?: string
  id?: number
  tags?: Record<string, string>
}

/**
 * A class of thing a coastal city is made of, and how to spot one in raw tags.
 *
 * Deliberately NOT `FeatureKind`. A kind is what the renderer decided; this is
 * what the SURVEY says is there, and the whole point of the census is to hold
 * those two apart. `highway=steps` and `highway=trunk` are both kind `road`,
 * which is exactly the collapse that let stairs be drawn as a ramp for months.
 *
 * City-agnostic on purpose: every probe is a tag rule, and a harbour town, a
 * ski resort and a river city all get counted by the same list. Add a probe
 * when a class of thing exists that we would want to know we were losing.
 */
export interface SceneProbe {
  key: string
  match: (tags: Record<string, string>) => boolean
}

const has = (t: Record<string, string>, k: string, v?: string): boolean =>
  v === undefined ? t[k] !== undefined : t[k] === v

export const SCENE_PROBES: readonly SceneProbe[] = [
  { key: 'buildings',       match: (t) => has(t, 'building') && t['building'] !== 'no' },
  { key: 'water',           match: (t) => has(t, 'natural', 'water') || has(t, 'water') || has(t, 'waterway', 'riverbank') },
  { key: 'coastline',       match: (t) => has(t, 'natural', 'coastline') },
  { key: 'beaches',         match: (t) => has(t, 'natural', 'beach') || has(t, 'natural', 'sand') },
  { key: 'quays',           match: (t) => has(t, 'man_made', 'quay') },
  { key: 'piers',           match: (t) => has(t, 'man_made', 'pier') },
  { key: 'breakwaters',     match: (t) => has(t, 'man_made', 'breakwater') || has(t, 'man_made', 'groyne') },
  { key: 'docks',           match: (t) => has(t, 'waterway', 'dock') },
  { key: 'marinas',         match: (t) => has(t, 'leisure', 'marina') },
  { key: 'harbourLanduse',  match: (t) => has(t, 'landuse', 'harbour') || has(t, 'landuse', 'port') },
  { key: 'bridgeWays',      match: (t) => has(t, 'bridge') && t['bridge'] !== 'no' },
  { key: 'bridgeOutlines',  match: (t) => has(t, 'man_made', 'bridge') },
  { key: 'tunnelWays',      match: (t) => has(t, 'tunnel') && t['tunnel'] !== 'no' },
  { key: 'roads',           match: (t) => VEHICULAR.has(t['highway'] ?? '') },
  { key: 'pedestrianWays',  match: (t) => PEDESTRIAN.has(t['highway'] ?? '') },
  { key: 'sidewalks',       match: (t) => has(t, 'footway', 'sidewalk') },
  { key: 'crossings',       match: (t) => has(t, 'footway', 'crossing') || has(t, 'highway', 'crossing') },
  { key: 'steps',           match: (t) => has(t, 'highway', 'steps') },
  { key: 'pedestrianAreas', match: (t) => has(t, 'place', 'square') || (has(t, 'highway', 'pedestrian') && has(t, 'area', 'yes')) },
  { key: 'parking',         match: (t) => has(t, 'amenity', 'parking') },
  { key: 'serviceWays',     match: (t) => has(t, 'highway', 'service') },
  { key: 'railways',        match: (t) => has(t, 'railway') },
  { key: 'greenery',        match: (t) => has(t, 'leisure', 'park') || has(t, 'leisure', 'garden') || has(t, 'landuse', 'grass') },
  { key: 'trees',           match: (t) => has(t, 'natural', 'tree') || has(t, 'natural', 'tree_row') },
  { key: 'barriers',        match: (t) => has(t, 'barrier') },
  { key: 'multipolygons',   match: (t) => has(t, 'type', 'multipolygon') },
]

const VEHICULAR = new Set([
  'motorway', 'trunk', 'primary', 'secondary', 'tertiary', 'residential',
  'unclassified', 'living_street', 'service', 'road', 'track',
  'motorway_link', 'trunk_link', 'primary_link', 'secondary_link', 'tertiary_link',
])
const PEDESTRIAN = new Set(['footway', 'pedestrian', 'path', 'steps', 'cycleway', 'corridor', 'bridleway'])

/** How one probe fared, from survey to feature. */
export interface ProbeResult {
  key: string
  /** Elements in the raw data that match this probe. */
  input: number
  /** …of those, how many produced at least one feature. */
  reached: number
  /** …and the ids that did not, with the stage and reason each died at. */
  lost: FeatureLoss[]
  /**
   * Elements that produced no feature and no recorded loss.
   *
   * The worst cell in the table: something entered the parser, left no trace,
   * and nobody said why. Every one of these is a missing `drop()` call.
   */
  unaccounted: string[]
}

export interface FeatureCensus {
  inputElements: number
  parsedFeatures: number
  byKind: Record<string, number>
  byStructure: Record<string, number>
  byFunctional: Record<string, number>
  lossByReason: Record<string, number>
  probes: ProbeResult[]
}

/** The id a feature carries back to the element it came from (`r45-2` → `r45`). */
export const sourceIdOf = (featureId: string): string => {
  const dash = featureId.indexOf('-')
  return dash === -1 ? featureId : featureId.slice(0, dash)
}

const elementId = (el: AuditElement): string =>
  `${el.type === 'relation' ? 'r' : el.type === 'node' ? 'n' : 'w'}${el.id}`

/**
 * Census one parse: what went in, what came out, and what was lost where.
 *
 * `losses` is whatever `parseOsmFeatures`'s `onDrop` collected. Pass it and the
 * report can name the stage; omit it and every casualty lands in `unaccounted`,
 * which is honest — an unexplained disappearance should look worse than an
 * explained one.
 */
export function censusFeatures(
  elements: ReadonlyArray<AuditElement>,
  features: ReadonlyArray<OsmFeature>,
  losses: ReadonlyArray<FeatureLoss> = [],
  probes: readonly SceneProbe[] = SCENE_PROBES,
): FeatureCensus {
  const produced = new Set(features.map((f) => sourceIdOf(f.id)))
  const lossById = new Map<string, FeatureLoss>()
  for (const l of losses) if (!lossById.has(l.id)) lossById.set(l.id, l)

  const byKind: Record<string, number> = {}
  const byStructure: Record<string, number> = {}
  const byFunctional: Record<string, number> = {}
  for (const f of features) {
    byKind[f.kind] = (byKind[f.kind] ?? 0) + 1
    const s = f.vertical?.structure ?? '(none)'
    byStructure[s] = (byStructure[s] ?? 0) + 1
    const fn = f.functional ?? '(none)'
    byFunctional[fn] = (byFunctional[fn] ?? 0) + 1
  }

  const lossByReason: Record<string, number> = {}
  for (const l of losses) lossByReason[l.reason] = (lossByReason[l.reason] ?? 0) + 1

  const results: ProbeResult[] = probes.map((probe) => {
    let input = 0
    let reached = 0
    const lost: FeatureLoss[] = []
    const unaccounted: string[] = []
    for (const el of elements) {
      const tags = el.tags
      if (!tags || !probe.match(tags)) continue
      input++
      const id = elementId(el)
      if (produced.has(id)) { reached++; continue }
      const l = lossById.get(id)
      if (l) lost.push(l)
      else unaccounted.push(id)
    }
    return { key: probe.key, input, reached, lost, unaccounted }
  })

  return {
    inputElements: elements.length,
    parsedFeatures: features.length,
    byKind, byStructure, byFunctional, lossByReason,
    probes: results,
  }
}
