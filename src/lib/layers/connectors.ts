// ─── connectors ───────────────────────────────────────────────────────────────
// The vocabulary every data source of the digital twin shares. One descriptor
// per layer the user brings in — an IFC, a scan, a GeoJSON route, a WFS
// cadastre — so the scene can list, persist, re-fetch and explain them the same
// way, whatever pipeline actually loads each one.
//
// Placement is NOT per connector: every layer projects through the scene's one
// SceneAnchor (geo/scene-anchor.ts). A connector only has to say what CRS its
// data is in and what its heights mean.

import type { HeightMode } from './geojson'

export type DataLayerKind = 'ifc' | 'pointcloud' | 'mesh' | 'vector'

/** Where the bytes come from. */
export type DataSource =
  | { type: 'file'; name: string; size: number }
  | { type: 'url'; url: string; format: 'geojson' | 'pointcloud' | 'ifc' | 'mesh' }
  | { type: 'wfs'; endpoint: string; version: '1.1.0' | '2.0.0'; typeName: string; maxFeatures: number }

/** How confident the placement is — the same scale point clouds use. */
export type PlacementConfidence = 'exact' | 'high' | 'approximate' | 'manual'

export interface DataLayerDescriptor {
  id: string
  kind: DataLayerKind
  label: string
  source: DataSource
  /** CRS the data was read in (normalized EPSG, 'CRS84', or null if local). */
  crs: string | null
  placement: PlacementConfidence
  /** Vector layers only: how z / height properties are read. */
  heightMode?: HeightMode
  /** Attribution the provider requires (OSM, a cadastre, an open-data portal). */
  attribution?: string
  /** When the data was fetched — a twin is only as good as its freshest layer. */
  fetchedAt: number
}

/** Formats a vector connector accepts today, by file extension. */
export const VECTOR_EXTENSIONS = ['.geojson', '.json'] as const

export function isVectorFileName(name: string): boolean {
  const lower = name.toLowerCase()
  return VECTOR_EXTENSIONS.some((ext) => lower.endsWith(ext))
}
