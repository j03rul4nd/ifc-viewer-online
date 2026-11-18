// ─── Map panel label helpers ──────────────────────────────────────────────────
// Names for things that arrive as data (layer keys, preset ids), in one place so
// the status strip, the layer list and the performance table all call a layer
// by the same name.

import type { TFunction } from 'i18next'
import type { LayerKey } from '../../lib/geo/scene-budget'
import type { FeatureKind } from '../../lib/geo/osm-features'

export type GeoT = TFunction<'geo'>

export function layerLabel(t: GeoT, key: LayerKey): string {
  return key === 'scenery' ? t('scene.scenery') : t(`layers.osm.${key}`)
}

export function layerList(t: GeoT, keys: ReadonlyArray<LayerKey>): string {
  return keys.map((k) => layerLabel(t, k)).join(', ')
}

/**
 * The OSM layers in the groups a reader thinks in. Thirteen switches in one
 * column is a list nobody reads past the fifth; four named groups with a
 * show-all each is a map legend.
 */
export const LAYER_GROUPS: ReadonlyArray<{ id: 'built' | 'mobility' | 'nature' | 'street'; kinds: readonly FeatureKind[] }> = [
  { id: 'built', kinds: ['building', 'bridge', 'pier'] },
  { id: 'mobility', kinds: ['road', 'rail', 'signal'] },
  { id: 'nature', kinds: ['water', 'green', 'tree', 'sand', 'rock'] },
  { id: 'street', kinds: ['furniture', 'barrier'] },
]

/** Layers only built at Detailed and Showcase. */
export const DETAIL_ONLY_KINDS: ReadonlySet<FeatureKind> = new Set(['furniture', 'barrier'])
