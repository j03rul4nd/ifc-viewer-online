// ─── terrain-detail-layer ─────────────────────────────────────────────────────
// The relief's sharp close-up: paints the squares terrain-detail plans, keeps
// them as textures and hands the relief's material the uniforms to mix them
// over its own big texture. See terrain-detail.ts for why it exists.
//
// Nothing here costs a request the map was not already making: the squares are
// painted by the basemap's own paint worker from the z14 vector tiles the
// basemap has fetched (the browser cache serves them), so this only runs for a
// vector provider. A raster provider keeps the single texture: sharper squares
// there would mean more image tiles from someone else's server.

import * as THREE from 'three'
import { createPaintPool, canPaintOffThread, type PaintPool } from './basemap/paint-pool'
import type { MapStyleId } from './basemap/map-styles'
import {
  planDetailLevels, detailFrames, detailRectUv, detailBudget,
  type DetailLevel,
} from './terrain-detail'

/** Squares the shader mixes. Fixed: it is the size of two uniform arrays. */
const SLOTS = 3
/** Paints in flight at once — the pool has one worker; a queue only goes stale. */
const MAX_IN_FLIGHT = 2
/** A square nobody has wanted for this long gives its memory back. */
const KEEP_MS = 8_000
/** A new square fades in over this long instead of popping. */
const FADE_MS = 240

export interface TerrainDetailSource {
  template: string
  styleId: MapStyleId
  language: string
}

export interface TerrainDetailView {
  /** Ground point the view is centred on, centred-normalized mercator. */
  focusNx: number
  focusNy: number
  /** Normalized units one device pixel covers there. */
  texelN: number
  /** Device pixels per CSS pixel the squares are styled for (≤ 2). */
  dpr: number
}

export interface TerrainDetailLayer {
  /** Teach a material to mix the squares over its `map`. Call once per material. */
  attach(material: THREE.MeshBasicMaterial): void
  /** The vector map to paint from; null = no squares (raster provider). */
  setSource(src: TerrainDetailSource | null): void
  /** Per frame. null = nothing wanted (the squares age out). */
  update(view: TerrainDetailView | null, nowMs: number): void
  dispose(): void
  /** Dev diagnosis. */
  debug(): { slots: Array<{ key: string; opacity: number } | null>; inFlight: number; painted: number; lastPaintMs: number; wanted: string[]; source: boolean; lastError: string | null }
}

interface Slot {
  level: DetailLevel
  texture: THREE.Texture
  bornAt: number
  wantedAt: number
}

export function createTerrainDetailLayer(opts: {
  patch: { minNx: number; maxNx: number; minNy: number; maxNy: number }
  /** Normalized units per texel of the patch's big texture, as it is now. */
  baseTexelN: () => number
  anisotropy: number
  constrained: boolean
}): TerrainDetailLayer {
  const budget = detailBudget(opts.constrained)
  const blank = new THREE.DataTexture(new Uint8Array([0, 0, 0, 0]), 1, 1)
  blank.needsUpdate = true

  const uniforms = {
    uDetailMap: { value: Array.from({ length: SLOTS }, () => blank as THREE.Texture) },
    // xy = centre (uv), z = uv offset → −1…1 across the square, w = opacity.
    uDetailRect: { value: Array.from({ length: SLOTS }, () => new THREE.Vector4(0, 0, 1, 0)) },
  }

  const slots: Array<Slot | null> = Array.from({ length: SLOTS }, () => null)
  const inFlight = new Map<string, AbortController>()
  let source: TerrainDetailSource | null = null
  let pool: PaintPool | null = null
  let wanted: DetailLevel[] = []
  let styledDpr = 1
  let disposed = false
  let painted = 0
  let lastPaintMs = 0
  let lastError: string | null = null
  /** Bumped whenever everything painted so far stops being right. */
  let generation = 0

  const slotOf = (z: number): number => ((z % SLOTS) + SLOTS) % SLOTS

  function freeSlot(i: number): void {
    const s = slots[i]
    if (!s) return
    ;(s.texture.image as ImageBitmap | undefined)?.close?.()
    s.texture.dispose()
    slots[i] = null
  }

  function flush(): void {
    generation++
    for (const c of inFlight.values()) c.abort()
    inFlight.clear()
    for (let i = 0; i < SLOTS; i++) freeSlot(i)
  }

  function request(level: DetailLevel, nowMs: number): void {
    if (!source) return
    pool ??= createPaintPool(1)
    const abort = new AbortController()
    inFlight.set(level.key, abort)
    const gen = generation
    const started = performance.now()
    const src = source
    pool.paint({
      template: src.template, styleId: src.styleId,
      width: budget.size, height: budget.size,
      zoom: level.z,
      // One texel is about one device pixel where it is looked at, so a CSS
      // pixel of line width or type is `dpr` texels — the same rule the flat
      // tiles follow, which is what makes a street as wide on the relief as
      // beside it.
      pixelScale: styledDpr,
      language: src.language,
      frames: detailFrames(level, budget.size),
      rasters: [],
      // Point names belong to the screen-space layer; they are handed back
      // and dropped here, never baked.
      collect: true,
      groundLabels: level.labels,
      fontBase: new URL(`${import.meta.env.BASE_URL}fonts/`, location.href).href,
    }, abort.signal).then((res) => {
      inFlight.delete(level.key)
      // Wanted still? A square for a zoom the view has left is dropped; one
      // for the same zoom a step away is kept — it is nearer than what it
      // replaces, and the right one is already on its way.
      const still = !disposed && gen === generation && wanted.some((w) => w.z === level.z && w.labels === level.labels)
      if (!still) { res.bitmap.close(); return }
      const tex = new THREE.Texture(res.bitmap as unknown as HTMLImageElement)
      tex.colorSpace = THREE.SRGBColorSpace
      tex.flipY = false // pre-flipped by the worker: row 0 is the south edge
      tex.generateMipmaps = true
      tex.minFilter = THREE.LinearMipmapLinearFilter
      tex.anisotropy = opts.anisotropy
      tex.needsUpdate = true
      const i = slotOf(level.z)
      const prev = slots[i]
      // Same zoom, new place: the content agrees wherever the two overlap, so
      // it swaps without a fade. A new zoom fades in.
      const bornAt = prev && prev.level.z === level.z ? prev.bornAt : performance.now()
      freeSlot(i)
      slots[i] = { level, texture: tex, bornAt, wantedAt: nowMs }
      painted++
      lastPaintMs = performance.now() - started
    }).catch((err: unknown) => {
      inFlight.delete(level.key)
      if (!(err instanceof DOMException && err.name === 'AbortError')) lastError = err instanceof Error ? err.message : String(err)
    })
  }

  function syncUniforms(): void {
    // Coarsest first: each square is mixed over the ones before it.
    const live = slots.filter((s): s is Slot => s !== null).sort((a, b) => a.level.z - b.level.z)
    for (let i = 0; i < SLOTS; i++) {
      const s = live[i]
      const rect = uniforms.uDetailRect.value[i]
      if (!s) {
        uniforms.uDetailMap.value[i] = blank
        rect.set(0, 0, 1, 0)
        continue
      }
      const r = detailRectUv(s.level, opts.patch)
      uniforms.uDetailMap.value[i] = s.texture
      rect.set(r.u, r.v, r.scale, Math.min(1, (performance.now() - s.bornAt) / FADE_MS))
    }
  }

  return {
    attach(material) {
      material.onBeforeCompile = (shader) => {
        shader.uniforms.uDetailMap = uniforms.uDetailMap
        shader.uniforms.uDetailRect = uniforms.uDetailRect
        shader.fragmentShader = shader.fragmentShader
          .replace('#include <map_pars_fragment>', `#include <map_pars_fragment>
#ifdef USE_MAP
uniform sampler2D uDetailMap[${SLOTS}];
uniform vec4 uDetailRect[${SLOTS}];
// One sharper square over the colour so far. The lookup is affine in the uv,
// so its derivatives are continuous across the square's edge and the mip
// choice never flickers there; outside the square the weight is zero.
vec3 mixDetail( vec3 base, sampler2D tex, vec4 rect ) {
	vec2 q = ( vMapUv - rect.xy ) * rect.z;
	vec4 c = texture2D( tex, q * 0.5 + 0.5 );
	float edge = 1.0 - smoothstep( 0.9, 1.0, max( abs( q.x ), abs( q.y ) ) );
	float w = rect.w * edge;
	// Premultiplied: a square with nothing painted leaves the base as it is.
	return base * ( 1.0 - c.a * w ) + c.rgb * w;
}
#endif`)
          .replace('#include <map_fragment>', `#ifdef USE_MAP
	vec4 sampledDiffuseColor = texture2D( map, vMapUv );
${Array.from({ length: SLOTS }, (_, i) => `	sampledDiffuseColor.rgb = mixDetail( sampledDiffuseColor.rgb, uDetailMap[${i}], uDetailRect[${i}] );`).join('\n')}
	diffuseColor *= sampledDiffuseColor;
#endif`)
      }
      // Its own program: without this three.js would share a compiled
      // MeshBasicMaterial that knows nothing about the squares.
      material.customProgramCacheKey = () => 'terrain-detail'
      material.needsUpdate = true
    },

    setSource(next) {
      const same = !!next && !!source && next.template === source.template
        && next.styleId === source.styleId && next.language === source.language
      if (same || (!next && !source)) return
      source = next && canPaintOffThread() ? next : null
      flush()
      syncUniforms()
    },

    update(view, nowMs) {
      if (disposed) return
      if (view && view.dpr !== styledDpr) { styledDpr = view.dpr; flush() }
      wanted = view && source
        ? planDetailLevels({
          focus: { nx: view.focusNx, ny: view.focusNy }, texelN: view.texelN,
          patch: opts.patch, baseTexelN: opts.baseTexelN(),
          size: budget.size, maxLevels: budget.maxLevels,
        })
        : []
      // Sharpest first: it is the one being looked at.
      for (const level of wanted) {
        const s = slots[slotOf(level.z)]
        if (s && s.level.key === level.key) { s.wantedAt = nowMs; continue }
        if (s && s.level.z === level.z) s.wantedAt = nowMs // right zoom, a step behind
        if (inFlight.has(level.key) || inFlight.size >= MAX_IN_FLIGHT) continue
        request(level, nowMs)
      }
      for (let i = 0; i < SLOTS; i++) {
        const s = slots[i]
        if (s && nowMs - s.wantedAt > KEEP_MS) freeSlot(i)
      }
      syncUniforms()
    },

    dispose() {
      disposed = true
      flush()
      pool?.dispose()
      pool = null
      blank.dispose()
    },

    debug() {
      return {
        slots: slots.map((s) => s ? { key: s.level.key, opacity: Math.min(1, (performance.now() - s.bornAt) / FADE_MS) } : null),
        inFlight: inFlight.size, painted, lastPaintMs: Math.round(lastPaintMs),
        wanted: wanted.map((w) => w.key), source: source !== null, lastError,
      }
    },
  }
}
