// ─── Cover Studio capture engine ───────────────────────────────────────────────
// Everything that touches the 3D viewer: framing the building, dressing the
// scene in a look and a light, cutting it, pulling storeys apart, grabbing the
// frame and giving it the look's 2D finish. Returns shots; the studio decides
// where they go (append, replace), so a one-click recipe and a single "capture
// view" share the same code.
//
// The latest settings live in a ref, so a recipe can change the light and
// capture in the same tick, and the functions stay stable across renders.

import { useCallback, useRef, useState } from 'react'
import type { TFunction } from 'i18next'
import { useSceneStore } from '../../stores/sceneStore'
import { useValidationStore } from '../../stores/validationStore'
import { toast } from '../../stores/toastStore'
import { createLogger } from '../../lib/logger'
import { presetPose, type Box } from '../../lib/camera-framing'
import { applyFilter } from '../../lib/cover/filters'
import { LOOKS, resolveInkPaper, resolveSceneLook, type LookId } from '../../lib/cover/looks'
import { LIGHTS, resolveLight, type LightId } from '../../lib/cover/lighting'
import { chunkLayers, cutPlane, explodeGap, groupLayers, planCutY, planFitDistance, sampleEvenly, storeysFromTree, type CutMode, type Layer } from '../../lib/cover/cuts'
import { isPhysicalCategory } from '../../lib/cover/stats'
import { DISCIPLINE_COLORS, groupByDiscipline, heroOpacity, type DisciplineId } from '../../lib/cover/disciplines'
import { alphaBounds, composeNight, evolutionSteps, paddedUnion, posterize, windowLighting } from '../../lib/cover/viral'
import type { CaptureStep, StudioView } from '../../lib/cover/recipes'
import type { ModelMeasures } from '../../lib/cover/facts'
import type { CoverImage, CoverPalette, CoverShot } from '../../lib/cover/types'
import type { ViewerAPI } from '../../lib/viewer'
import type { CameraPreset } from '../../types'

const log = createLogger('CoverStudio')

export const AUTO_VIEWS = ['iso', 'front', 'right', 'top'] as const satisfies readonly StudioView[]
/** Looks captured by "Style pack": one view, every way a board would show it. */
export const STYLE_PACK: LookId[] = ['clay', 'lines', 'spotlight', 'noir', 'duotone', 'blueprint']
/** Section fill — near-black, the convention on every drawing set. */
const POCHE = '#15140F'
/** Bands an exploded axonometric is grouped into (podium, typical floors, crown…). */
const MAX_EXPLODE_BANDS = 7
/** Storey plans captured at most; a tall tower is sampled evenly over its height. */
const MAX_PLANS = 12

export type CaptureRes = 1 | 2 | 4
export type BusyKind = 'shots' | 'pack' | 'cut' | 'explode' | 'plans' | 'disciplines' | 'night' | 'evolution' | 'anatomy' | 'cutout' | 'recipe'

export interface CaptureSettings {
  palette: CoverPalette
  look: LookId
  focusCat: string | null
  focusLabel: string | null
  cut: CutMode
  cutAt: number
  spread: number
  res: CaptureRes
  light: LightId
  sunAzimuth: number | null
  /** User corrections to the guessed discipline (model id → discipline). */
  disciplineOverrides: Record<string, DisciplineId>
}

function wait(ms: number): Promise<void> {
  return new Promise((r) => setTimeout(r, ms))
}

export async function dataUrlToImage(url: string): Promise<CoverImage> {
  const blob = await (await fetch(url)).blob()
  return createImageBitmap(blob)
}

export function newShot(label: string, image: CoverImage): CoverShot {
  return { id: `${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 7)}`, label, image }
}

/** What glows at night: the IFC's own glazing. */
const GLAZING = ['IFCWINDOW', 'IFCPLATE']
/** Flat white light for the glazing mask: no shading, so a pane reads fully on. */
const MASK_LIGHT = { sky: '#FFFFFF', ground: '#FFFFFF', ambient: 3, key: '#FFFFFF', keyIntensity: 0, azimuth: 0, elevation: 60, fill: '#FFFFFF', fillIntensity: 0 }
/** Tones a collage cut-out is flattened into (dark → light); the template adds colour around it. */
const COLLAGE_TONES = ['#3B3632', '#8A8279', '#D8D0C3', '#F6F2EA']

async function pixels(image: CoverImage): Promise<{ ctx: CanvasRenderingContext2D; data: ImageData; canvas: HTMLCanvasElement } | null> {
  const canvas = document.createElement('canvas')
  canvas.width = image.width
  canvas.height = image.height
  const ctx = canvas.getContext('2d', { willReadFrequently: true })
  if (!ctx) return null
  ctx.drawImage(image, 0, 0)
  return { ctx, canvas, data: ctx.getImageData(0, 0, canvas.width, canvas.height) }
}

export function useCoverCapture(viewerApiRef: React.MutableRefObject<ViewerAPI | null>, settings: CaptureSettings, t: TFunction<'capture'>) {
  const models = useSceneStore((s) => s.models)
  const live = useRef({ settings, models, t })
  live.current = { settings, models, t }
  const [busy, setBusy] = useState<BusyKind | null>(null)
  const busyRef = useRef<BusyKind | null>(null)

  // ── Framing ──────────────────────────────────────────────────────────────────
  // The box of the BUILDING — physical elements only, optionally one category.
  // A model's own box includes site/terrain geometry, which framed a tower as
  // a speck in the middle of a plot.
  const subjectBox = useCallback(async (onlyType?: string | null): Promise<Box | null> => {
    const viewer = viewerApiRef.current
    if (!viewer) return null
    let box: Box | null = null
    for (const m of live.current.models) {
      if (!m.visible) continue
      const ids = m.categories
        .filter((c) => isPhysicalCategory(c.id) && (!onlyType || c.id === onlyType))
        .flatMap((c) => c.elementIds)
      if (!ids.length) continue
      const b = await viewer.getElementsBox(ids, m.id)
      if (!b) continue
      box = box
        ? { min: { x: Math.min(box.min.x, b.min.x), y: Math.min(box.min.y, b.min.y), z: Math.min(box.min.z, b.min.z) },
            max: { x: Math.max(box.max.x, b.max.x), y: Math.max(box.max.y, b.max.y), z: Math.max(box.max.z, b.max.z) } }
        : b
    }
    return box
  }, [viewerApiRef])

  /** Jump (no flight) to a preset framing the building, or the focus category. */
  const jumpTo = useCallback(async (preset: CameraPreset, onlyType?: string | null): Promise<void> => {
    const viewer = viewerApiRef.current
    if (!viewer) return
    const box = await subjectBox(onlyType)
    if (!box) { viewer.setCameraPreset(preset, { animate: false }); return }
    const vp = viewer.getCameraViewpoint()
    const pose = presetPose(box, preset, vp?.fovDeg ?? 45, vp?.aspect ?? 16 / 9)
    // presetPose fits the bounding SPHERE, which leaves a box-shaped building
    // floating in margin; covers want it to fill the frame.
    const k = 0.78
    viewer.setCameraLookAt({
      x: pose.target.x + (pose.position.x - pose.target.x) * k,
      y: pose.target.y + (pose.position.y - pose.target.y) * k,
      z: pose.target.z + (pose.position.z - pose.target.z) * k,
    }, pose.target, false)
  }, [viewerApiRef, subjectBox])

  // ── Dressing ─────────────────────────────────────────────────────────────────

  /**
   * The backdrop a capture gets: the light's sky for looks that keep real
   * colour (as-is, white model, spotlight), else the look's own paper.
   */
  const backdropFor = useCallback((lookId: LookId): { top: string; bottom: string } | null => {
    const l = LOOKS[lookId]
    const sky = LIGHTS[live.current.settings.light]?.sky ?? null
    if (sky && (lookId === 'asis' || lookId === 'clay' || lookId === 'spotlight')) return sky
    return l.scene.background
  }, [])

  /** The look's 2D finish (line drawing, duotone…) over a captured frame. */
  const finish = useCallback(async (image: CoverImage, lookId: LookId): Promise<CoverImage> => {
    const l = LOOKS[lookId]
    if (l.post === 'none') return image
    const c = document.createElement('canvas')
    c.width = image.width
    c.height = image.height
    const ctx = c.getContext('2d')
    if (!ctx) return image
    ctx.drawImage(image, 0, 0)
    const data = ctx.getImageData(0, 0, c.width, c.height)
    applyFilter(data, l.post, { ...resolveInkPaper(l, live.current.settings.palette), grain: l.grain })
    ctx.putImageData(data, 0, 0)
    return createImageBitmap(c)
  }, [])

  // What the scene currently wears, so a batch that mixes looks and cuts (a
  // recipe: as-is, then white model through a section, then as-is again)
  // takes each one off before the next capture instead of stacking them.
  const lookOn = useRef(false)
  const sectionOn = useRef(false)

  /** Restyle the scene for a look (materials + backdrop). */
  const dress = useCallback(async (lookId: LookId) => {
    const viewer = viewerApiRef.current
    if (!viewer) return
    const { palette, focusCat } = live.current.settings
    if (lookId !== 'asis' || focusCat) {
      const scene = resolveSceneLook(LOOKS[lookId], palette, !!focusCat)
      await viewer.setPresentationLook({ ...scene, focusTypes: focusCat ? [focusCat] : [] })
      lookOn.current = true
    } else if (lookOn.current) {
      await viewer.setPresentationLook(null)
      lookOn.current = false
    }
    const bg = backdropFor(lookId)
    viewer.setBackground(bg ? { preset: 'custom', mode: 'gradient', top: bg.top, bottom: bg.bottom } : useSceneStore.getState().background)
  }, [viewerApiRef, backdropFor])

  const restoreScene = useCallback(async () => {
    const viewer = viewerApiRef.current
    if (!viewer) return
    await viewer.setPresentationSection(null)
    await viewer.setPresentationLook(null)
    lookOn.current = false
    sectionOn.current = false
    viewer.setBackground(useSceneStore.getState().background)
    viewer.setLighting(null)
  }, [viewerApiRef])

  const lookLabel = useCallback((id: LookId) => {
    const { t: tr, settings: s } = live.current
    const name = tr(`cover.look.${id}`)
    return (id === 'spotlight' || id === 'xray') && s.focusLabel ? `${name} · ${s.focusLabel}` : name
  }, [])

  const withLook = useCallback((name: string, lookId: LookId) => (lookId === 'asis' ? name : `${name} · ${lookLabel(lookId)}`), [lookLabel])

  type ActiveCut = { mode: Exclude<CutMode, 'none'>; at: number } | undefined
  /** The cut the user set in the panel: every ordinary capture goes through it. */
  const activeCut = useCallback((): ActiveCut => {
    const { cut, cutAt } = live.current.settings
    return cut === 'none' ? undefined : { mode: cut, at: cutAt }
  }, [])
  const withCut = useCallback((name: string, cut: ActiveCut) => (cut ? `${name} · ${live.current.t(`cover.cut.${cut.mode}`)}` : name), [])

  /** One frame of the current camera in a look, optionally through a cut. */
  const snapshot = useCallback(async (label: string, lookId: LookId, cut?: { mode: Exclude<CutMode, 'none'>; at: number }): Promise<CoverShot | null> => {
    const viewer = viewerApiRef.current
    if (!viewer) return null
    // Take a previous cut off BEFORE dressing: clearing it also restores the
    // grid, which the new look may want hidden.
    if (sectionOn.current && !cut) { await viewer.setPresentationSection(null); sectionOn.current = false }
    await dress(lookId)
    if (cut) {
      const box = await subjectBox()
      const plane = box ? cutPlane(box, cut.mode, cut.at) : null
      // Poché is patched onto the materials the look just produced, so cut after dressing.
      if (plane) { await viewer.setPresentationSection({ normal: plane.normal, point: plane.point, poche: POCHE }); sectionOn.current = true }
    }
    await wait(160)
    const url = viewer.takeSnapshot(live.current.settings.res, { annotations: false })
    if (!url.startsWith('data:image/png')) return null
    const image = await finish(await dataUrlToImage(url), lookId)
    return { ...newShot(label, image), look: lookId }
  }, [viewerApiRef, dress, subjectBox, finish])

  // ── Batches ──────────────────────────────────────────────────────────────────
  // One wrapper for every capture job: busy flag, the light, error toast, and
  // the scene and camera put back exactly as the user left them.

  const batch = useCallback(async (kind: BusyKind, fn: () => Promise<CoverShot[]>, opts: { light?: LightId } = {}): Promise<CoverShot[]> => {
    const viewer = viewerApiRef.current
    if (!viewer || busyRef.current) return []
    busyRef.current = kind
    setBusy(kind)
    const saved = viewer.getCameraViewpoint()
    const s = live.current.settings
    if (opts.light) live.current.settings = { ...s, light: opts.light }
    viewer.setLighting(resolveLight(live.current.settings.light, live.current.settings.sunAzimuth))
    try {
      return await fn()
    } catch (e) {
      log.error(`${kind} capture failed:`, e)
      toast(live.current.t('screenshotFailed'), 'error')
      return []
    } finally {
      viewer.isolateElements([], false)
      if (saved) viewer.setCameraLookAt(saved.position, saved.target, false)
      await restoreScene()
      busyRef.current = null
      setBusy(null)
    }
  }, [viewerApiRef, restoreScene])

  /** Storeys of every visible model, merged by elevation, bottom to top. */
  const storeyLayers = useCallback(async (): Promise<Layer[]> => {
    const viewer = viewerApiRef.current
    if (!viewer) return []
    const trees = useValidationStore.getState().spatialTrees
    const storeys = []
    for (const m of live.current.models) {
      if (!m.visible) continue
      // Only built elements: spaces would render as solid volumes over the floor.
      const physical = new Set(m.categories.filter((c) => isPhysicalCategory(c.id)).flatMap((c) => c.elementIds))
      for (const st of storeysFromTree(m.id, trees[m.id] ?? [])) {
        const ids = st.ids.filter((id) => physical.has(id))
        if (!ids.length) continue
        const b = await viewer.getElementsBox(ids, m.id)
        if (b) storeys.push({ ...st, ids, elevation: b.min.y })
      }
    }
    return groupLayers(storeys)
  }, [viewerApiRef])

  // Inner jobs (no busy/restore of their own) so recipes can chain them.

  const viewsJob = useCallback(async (views: ReadonlyArray<StudioView>, lookId: LookId, cut?: ActiveCut): Promise<CoverShot[]> => {
    const out: CoverShot[] = []
    for (const v of views) {
      if (v !== 'current') {
        await jumpTo(v)
        // Let the fragments stream in the tiles for the new viewpoint.
        await wait(450)
      }
      const name = live.current.t(`cover.view.${v}`)
      const shot = await snapshot(withCut(withLook(name, lookId), cut), lookId, cut)
      if (shot) out.push(shot)
    }
    return out
  }, [jumpTo, snapshot, withLook, withCut])

  const cutJob = useCallback(async (mode: Exclude<CutMode, 'none'>, at: number, lookId: LookId, withIso: boolean): Promise<CoverShot[]> => {
    const box = await subjectBox()
    if (!box) return []
    const plane = cutPlane(box, mode, at)
    const out: CoverShot[] = []
    for (const preset of (withIso ? [plane.preset, 'iso'] : [plane.preset]) as CameraPreset[]) {
      await jumpTo(preset)
      await wait(450)
      const name = preset === 'iso' ? live.current.t('cover.cutIso') : live.current.t(`cover.cut.${mode}`)
      const shot = await snapshot(withLook(name, lookId), lookId, { mode, at })
      if (shot) out.push(shot)
    }
    return out
  }, [subjectBox, jumpTo, snapshot, withLook])

  // Storey plans: each level alone, cut 1.2 m above its floor with poché, seen
  // from above. Framed on the whole building so every plan shares one scale —
  // they line up on a board like a drawing set.
  const plansJob = useCallback(async (lookId: LookId): Promise<CoverShot[]> => {
    const viewer = viewerApiRef.current
    if (!viewer) return []
    const { t: tr } = live.current
    const all = await storeyLayers()
    if (!all.length) { toast(tr('cover.explodeNone'), 'info'); return [] }
    const picked = sampleEvenly(all, MAX_PLANS)
    if (picked.length < all.length) toast(tr('cover.plansSampled', { count: picked.length, total: all.length }), 'info')
    const box = await subjectBox()
    if (!box) return []
    const vp = viewer.getCameraViewpoint()
    // Same distance above EVERY floor: with a perspective camera a fixed
    // height would draw the lower plans smaller than the upper ones.
    const d = planFitDistance(box, vp?.fovDeg ?? 45, vp?.aspect ?? 16 / 9)
    const cx = (box.min.x + box.max.x) / 2
    const cz = (box.min.z + box.max.z) / 2
    if (sectionOn.current) { await viewer.setPresentationSection(null); sectionOn.current = false }
    await dress(lookId)
    const out: CoverShot[] = []
    for (const layer of picked) {
      const i = all.indexOf(layer)
      const next = all[i + 1]?.elevation ?? null
      viewer.setCameraLookAt({ x: cx, y: layer.elevation + d, z: cz + 0.001 }, { x: cx, y: layer.elevation, z: cz }, false)
      viewer.isolateElements(layer.parts.flatMap((p) => p.ids.map((expressId) => ({ expressId, modelId: p.modelId }))), true)
      const y = planCutY(layer.elevation, next)
      await viewer.setPresentationSection({ normal: { x: 0, y: -1, z: 0 }, point: { x: 0, y, z: 0 }, poche: POCHE })
      await wait(400)
      const url = viewer.takeSnapshot(live.current.settings.res, { annotations: false })
      if (!url.startsWith('data:image/png')) continue
      const image = await finish(await dataUrlToImage(url), lookId)
      out.push(newShot(layer.names.join(' / '), image))
    }
    viewer.isolateElements([], false)
    await viewer.setPresentationSection(null)
    return out
  }, [viewerApiRef, storeyLayers, subjectBox, dress, finish])

  // Coordination: the federated set framed once, then (1) every model in its
  // discipline's colour on a white model, and (2) each discipline alone in the
  // current look. Same camera for all, so the tiles line up with the hero.
  const disciplinesJob = useCallback(async (lookId: LookId): Promise<CoverShot[]> => {
    const viewer = viewerApiRef.current
    if (!viewer) return []
    const { t: tr, settings: st, models } = live.current
    const groups = groupByDiscipline(models, st.disciplineOverrides)
    if (groups.length < 2) { toast(tr('cover.disciplinesNone'), 'info'); return [] }
    await jumpTo('iso')
    // Let the jump's tile streaming finish BEFORE tinting: tiles that land
    // after setPresentationLook keep their own material (the model that missed
    // the tint changed from run to run).
    await wait(1200)
    if (sectionOn.current) { await viewer.setPresentationSection(null); sectionOn.current = false }

    const out: CoverShot[] = []
    const modelColors: Record<string, string> = {}
    const modelOpacities: Record<string, number> = {}
    const opacityOf = heroOpacity(groups)
    for (const g of groups) {
      for (const id of g.modelIds) {
        modelColors[id] = DISCIPLINE_COLORS[g.discipline]
        const o = opacityOf[g.discipline]
        if (o !== undefined) modelOpacities[id] = o
      }
    }
    const tinted = { ...resolveSceneLook(LOOKS.clay, st.palette, false), focusTypes: [], modelColors, modelOpacities }
    await viewer.setPresentationLook(tinted)
    // Tiles streamed in after the jump arrive in their own material and miss the
    // tint (which model varied run to run). Paint again once streaming settles.
    await wait(500)
    await viewer.setPresentationLook(tinted)
    lookOn.current = true
    const bg = backdropFor('clay')
    if (bg) viewer.setBackground({ preset: 'custom', mode: 'gradient', top: bg.top, bottom: bg.bottom })
    await wait(200)
    const url = viewer.takeSnapshot(st.res, { annotations: false })
    if (url.startsWith('data:image/png')) out.push(newShot(tr('cover.disciplinesAll'), await finish(await dataUrlToImage(url), 'clay')))

    const shown = models.filter((m) => m.visible).map((m) => m.id)
    try {
      for (const g of groups) {
        for (const id of shown) viewer.setModelVisible(id, g.modelIds.includes(id))
        // Showing a model re-streams its tiles in whatever colour they last had
        // (the discipline tint). Dress, let streaming settle; snapshot() dresses again.
        await wait(300)
        let shot: CoverShot | null
        if (lookId === 'clay') {
          // White model: each discipline alone in its own colour, matching the
          // hero and the legend, instead of three identical white tiles.
          const solo = { ...tinted, modelOpacities: {} }
          await viewer.setPresentationLook(solo)
          await wait(400)
          await viewer.setPresentationLook(solo)
          await wait(160)
          const u = viewer.takeSnapshot(st.res, { annotations: false })
          shot = u.startsWith('data:image/png') ? newShot(tr(`cover.discipline.${g.discipline}`), await finish(await dataUrlToImage(u), 'clay')) : null
        } else {
          await dress(lookId)
          await wait(400)
          shot = await snapshot(withLook(tr(`cover.discipline.${g.discipline}`), lookId), lookId)
        }
        if (shot) out.push({ ...shot, discipline: g.discipline, elements: g.elements })
      }
    } finally {
      for (const id of shown) viewer.setModelVisible(id, true)
    }
    return out
  }, [viewerApiRef, jumpTo, backdropFor, finish, snapshot, dress, withLook])

  // ── Viral formats ───────────────────────────────────────────────────────────

  /** Every visible model's built elements, as one layer (a cut-out of the building). */
  const wholeBuilding = useCallback(() => live.current.models
    .filter((m) => m.visible)
    .map((m) => ({ modelId: m.id, ids: m.categories.filter((c) => isPhysicalCategory(c.id)).flatMap((c) => c.elementIds) }))
    .filter((p) => p.ids.length), [])

  // Blue hour: the scene under a dusk light, then a mask of the model's own
  // glazing (white panes, black everything else), composed into lit windows
  // with bloom. The "twilight hero shot" — from the real windows, not a guess.
  const nightJob = useCallback(async (lookId: LookId): Promise<CoverShot[]> => {
    const viewer = viewerApiRef.current
    if (!viewer) return []
    const { t: tr, settings: st, models } = live.current
    const hasGlass = models.some((m) => m.visible && m.categories.some((c) => GLAZING.includes(c.id.toUpperCase())))
    if (!hasGlass) { toast(tr('cover.viral.noGlass'), 'info'); return [] }
    if (sectionOn.current) { await viewer.setPresentationSection(null); sectionOn.current = false }

    viewer.setLighting(resolveLight('dusk', st.sunAzimuth))
    await dress(lookId)
    const sky = LIGHTS.dusk.sky!
    viewer.setBackground({ preset: 'custom', mode: 'gradient', top: sky.top, bottom: sky.bottom })
    await wait(300)
    const baseUrl = viewer.takeSnapshot(st.res, { annotations: false })

    // Not every pane is lit: some off, some dimmed — per element, the same every export.
    const overrides: Array<{ modelId: string; ids: number[]; color: string }> = []
    for (const md of models) {
      if (!md.visible) continue
      const glass = md.categories.filter((c) => GLAZING.includes(c.id.toUpperCase())).flatMap((c) => c.elementIds)
      const { off, dim } = windowLighting(glass)
      overrides.push({ modelId: md.id, ids: off, color: '#000000' }, { modelId: md.id, ids: dim, color: '#6A6A6A' })
    }
    const mask = { base: 'clay' as const, baseColor: '#000000', baseOpacity: 1, focusTypes: GLAZING, focusColor: '#FFFFFF', hideGrid: true, overrides }
    viewer.setLighting(MASK_LIGHT)
    await viewer.setPresentationLook(mask)
    lookOn.current = true
    viewer.setBackground({ preset: 'custom', mode: 'solid', top: '#000000', bottom: '#000000' })
    await wait(400)
    await viewer.setPresentationLook(mask)
    await wait(160)
    const maskUrl = viewer.takeSnapshot(st.res, { annotations: false })
    if (!baseUrl.startsWith('data:image/png') || !maskUrl.startsWith('data:image/png')) return []

    const base = await pixels(await finish(await dataUrlToImage(baseUrl), lookId))
    const m = await pixels(await dataUrlToImage(maskUrl))
    if (!base || !m) return []
    composeNight(base.data, m.data)
    base.ctx.putImageData(base.data, 0, 0)
    return [{ ...newShot(tr('cover.viral.night'), await createImageBitmap(base.canvas)), night: true }]
  }, [viewerApiRef, dress, finish])

  // Form evolution, BIG-style: the same camera, the building growing band by
  // band from its real storeys — base → … → crown. The diagram that makes a
  // form look inevitable.
  const evolutionJob = useCallback(async (lookId: LookId): Promise<CoverShot[]> => {
    const viewer = viewerApiRef.current
    if (!viewer) return []
    const tr = live.current.t
    const layers = await storeyLayers()
    const n = evolutionSteps(layers.length)
    if (n < 2) { toast(tr('cover.explodeNone'), 'info'); return [] }
    const bands = chunkLayers(layers, n)
    await jumpTo('iso')
    await wait(1200)
    if (sectionOn.current) { await viewer.setPresentationSection(null); sectionOn.current = false }
    type Step = 'base' | 'grow' | 'stack' | 'crown'
    const words: Step[] = n === 2 ? ['base', 'crown'] : n === 3 ? ['base', 'grow', 'crown'] : ['base', 'grow', 'stack', 'crown']
    const out: CoverShot[] = []
    for (let k = 0; k < bands.length; k++) {
      const shown = bands.slice(0, k + 1).flatMap((b) => b.parts.flatMap((p) => p.ids.map((expressId) => ({ expressId, modelId: p.modelId }))))
      viewer.isolateElements(shown, true)
      // Isolation re-streams tiles: dress, settle, dress again.
      await wait(350)
      await dress(lookId)
      await wait(350)
      await dress(lookId)
      await wait(160)
      const url = viewer.takeSnapshot(live.current.settings.res, { annotations: false })
      if (!url.startsWith('data:image/png')) continue
      const shot = newShot(tr(`cover.viral.step.${words[k]}`), await finish(await dataUrlToImage(url), lookId))
      out.push({ ...shot, step: k + 1 })
    }
    viewer.isolateElements([], false)
    return out
  }, [viewerApiRef, storeyLayers, jumpTo, dress, finish])

  // Anatomy: the exploded axonometric, with each band's label pinned to where
  // that band actually landed in the frame (measured from its own layer).
  const anatomyJob = useCallback(async (lookId: LookId): Promise<CoverShot[]> => {
    const viewer = viewerApiRef.current
    if (!viewer) return []
    const { t: tr, settings: st } = live.current
    const layers = chunkLayers(await storeyLayers(), 6)
    if (layers.length < 2) { toast(tr('cover.explodeNone'), 'info'); return [] }
    const box = await subjectBox()
    if (!box) return []
    const gap = explodeGap(box.max.y - box.min.y, layers.length, Math.max(1, st.spread))
    const tall = { min: box.min, max: { ...box.max, y: box.max.y + gap * (layers.length - 1) } }
    const vp = viewer.getCameraViewpoint()
    const pose = presetPose(tall, 'iso', vp?.fovDeg ?? 45, vp?.aspect ?? 16 / 9)
    const k = 0.74
    viewer.setCameraLookAt({
      x: pose.target.x + (pose.position.x - pose.target.x) * k,
      y: pose.target.y + (pose.position.y - pose.target.y) * k,
      z: pose.target.z + (pose.position.z - pose.target.z) * k,
    }, pose.target, false)
    await dress(lookId)
    await wait(400)
    const urls = await viewer.captureExplodedLayers(layers.map((l) => l.parts), gap, st.res)
    const imgs = await Promise.all(urls.map(dataUrlToImage))
    if (!imgs.length) return []
    // Where each band landed (its own layer's opaque pixels), in frame pixels.
    const boxes: Array<{ x0: number; y0: number; x1: number; y1: number; label: string }> = []
    for (let i = 0; i < imgs.length; i++) {
      const px = await pixels(imgs[i])
      const b = px ? alphaBounds(px.data) : null
      if (b) boxes.push({ ...b, label: layers[i].names.join(' / ') })
    }
    const c = document.createElement('canvas')
    c.width = imgs[0].width
    c.height = imgs[0].height
    const ctx = c.getContext('2d')
    if (!ctx) return []
    // A drawing's own paper, not the light's sky: the sheet is the ground.
    const bg = LOOKS[lookId].scene.background ?? backdropFor(lookId) ?? useSceneStore.getState().background
    const g = ctx.createLinearGradient(0, 0, 0, c.height)
    g.addColorStop(0, bg.top)
    g.addColorStop(1, bg.bottom)
    ctx.fillStyle = g
    ctx.fillRect(0, 0, c.width, c.height)
    for (const img of imgs) ctx.drawImage(img, 0, 0)
    // Crop to the stack: a tall exploded tower in a wide frame is a sliver.
    const crop = paddedUnion(boxes, c.width, c.height, 0.06) ?? { x: 0, y: 0, w: c.width, h: c.height }
    const callouts = boxes.map((b) => ({ x: (b.x1 - crop.x) / crop.w, y: ((b.y0 + b.y1) / 2 - crop.y) / crop.h, label: b.label }))
    const image = await finish(await createImageBitmap(c, crop.x, crop.y, crop.w, crop.h), lookId)
    return [{ ...newShot(tr('cover.viral.anatomy'), image), callouts }]
  }, [viewerApiRef, storeyLayers, subjectBox, dress, backdropFor, finish])

  // Collage cut-out: the building alone on transparency, flattened into a few
  // printed tones and cropped tight — the template sets it on flat planes.
  const cutoutJob = useCallback(async (): Promise<CoverShot[]> => {
    const viewer = viewerApiRef.current
    if (!viewer) return []
    const { t: tr, settings: st } = live.current
    const parts = wholeBuilding()
    if (!parts.length) return []
    await dress('clay')
    await wait(300)
    const [url] = await viewer.captureExplodedLayers([parts], 0, st.res)
    if (!url) return []
    const px = await pixels(await dataUrlToImage(url))
    if (!px) return []
    const b = alphaBounds(px.data)
    if (!b) return []
    posterize(px.data, COLLAGE_TONES)
    px.ctx.putImageData(px.data, 0, 0)
    const pad = Math.round(Math.max(b.x1 - b.x0, b.y1 - b.y0) * 0.03)
    const x = Math.max(0, b.x0 - pad)
    const y = Math.max(0, b.y0 - pad)
    const w = Math.min(px.canvas.width - x, b.x1 - b.x0 + pad * 2)
    const h = Math.min(px.canvas.height - y, b.y1 - b.y0 + pad * 2)
    const image = await createImageBitmap(px.canvas, x, y, w, h)
    return [{ ...newShot(tr('cover.viral.cutout'), image), cutout: true }]
  }, [viewerApiRef, wholeBuilding, dress])

  // ── Public jobs ──────────────────────────────────────────────────────────────

  const captureCurrent = useCallback(() => {
    const { look } = live.current.settings
    const cut = activeCut()
    return batch('shots', async () => {
      const name = look === 'asis' ? live.current.t('cover.view.current') : lookLabel(look)
      const shot = await snapshot(withCut(name, cut), look, cut)
      if (!shot) toast(live.current.t('screenshotFailed'), 'error')
      return shot ? [shot] : []
    })
  }, [batch, snapshot, lookLabel, activeCut, withCut])

  const captureAuto = useCallback(() => batch('shots', () => viewsJob(AUTO_VIEWS, live.current.settings.look, activeCut())), [batch, viewsJob, activeCut])

  const capturePack = useCallback(() => batch('pack', async () => {
    const out: CoverShot[] = []
    const cut = activeCut()
    for (const id of STYLE_PACK) {
      const lookId: LookId = id === 'spotlight' && !live.current.settings.focusCat ? 'xray' : id
      const shot = await snapshot(withCut(lookLabel(lookId), cut), lookId, cut)
      if (shot) out.push(shot)
    }
    return out
  }), [batch, snapshot, lookLabel, activeCut, withCut])

  const captureCut = useCallback(() => {
    const { cut, cutAt, look } = live.current.settings
    if (cut === 'none') return Promise.resolve([] as CoverShot[])
    return batch('cut', () => cutJob(cut, cutAt, look, true))
  }, [batch, cutJob])

  const capturePlans = useCallback(() => batch('plans', () => plansJob(live.current.settings.look)), [batch, plansJob])

  const captureNight = useCallback(() => batch('night', () => nightJob(live.current.settings.look)), [batch, nightJob])
  const captureEvolution = useCallback(() => batch('evolution', () => evolutionJob(live.current.settings.look === 'asis' ? 'clay' : live.current.settings.look)), [batch, evolutionJob])
  const captureAnatomy = useCallback(() => batch('anatomy', () => anatomyJob(live.current.settings.look)), [batch, anatomyJob])
  const captureCutout = useCallback(() => batch('cutout', () => cutoutJob()), [batch, cutoutJob])

  const captureDisciplines = useCallback(() => batch('disciplines', () => disciplinesJob(live.current.settings.look)), [batch, disciplinesJob])

  // Exploded axonometric: storeys from the spatial tree, one render each,
  // lifted apart and stacked bottom-up over the look's backdrop.
  const captureExploded = useCallback(() => batch('explode', async () => {
    const viewer = viewerApiRef.current
    if (!viewer) return []
    const { look, spread, res } = live.current.settings
    const layers = chunkLayers(await storeyLayers(), MAX_EXPLODE_BANDS)
    if (layers.length < 2) { toast(live.current.t('cover.explodeNone'), 'info'); return [] }
    const box = await subjectBox()
    if (!box) return []
    const gap = explodeGap(box.max.y - box.min.y, layers.length, spread)
    const tall = { min: box.min, max: { ...box.max, y: box.max.y + gap * (layers.length - 1) } }
    const vp = viewer.getCameraViewpoint()
    const pose = presetPose(tall, 'iso', vp?.fovDeg ?? 45, vp?.aspect ?? 16 / 9)
    // Same sphere-vs-box tightening as jumpTo(), a touch closer: the stack is tall and thin.
    const k = 0.72
    viewer.setCameraLookAt({
      x: pose.target.x + (pose.position.x - pose.target.x) * k,
      y: pose.target.y + (pose.position.y - pose.target.y) * k,
      z: pose.target.z + (pose.position.z - pose.target.z) * k,
    }, pose.target, false)
    await dress(look)
    await wait(300)
    const urls = await viewer.captureExplodedLayers(layers.map((l) => l.parts), gap, res)
    const imgs = await Promise.all(urls.map(dataUrlToImage))
    if (!imgs.length) return []
    const c = document.createElement('canvas')
    c.width = imgs[0].width
    c.height = imgs[0].height
    const ctx = c.getContext('2d')
    if (!ctx) return []
    const bg = backdropFor(look) ?? useSceneStore.getState().background
    const g = ctx.createLinearGradient(0, 0, 0, c.height)
    g.addColorStop(0, bg.top)
    g.addColorStop(1, bg.bottom)
    ctx.fillStyle = g
    ctx.fillRect(0, 0, c.width, c.height)
    for (const img of imgs) ctx.drawImage(img, 0, 0)
    const image = await finish(await createImageBitmap(c), look)
    return [newShot(withLook(live.current.t('cover.explode'), look), image)]
  }), [batch, viewerApiRef, storeyLayers, subjectBox, dress, backdropFor, finish, withLook])

  /** A recipe's captures, in one batch (one camera restore, no flashing). */
  const captureSteps = useCallback((steps: CaptureStep[], light?: LightId) => batch('recipe', async () => {
    const out: CoverShot[] = []
    for (const s of steps) {
      if (s.kind === 'view') out.push(...await viewsJob([s.view], s.look))
      else if (s.kind === 'cut') out.push(...await cutJob(s.cut, 0.45, s.look, false))
      else if (s.kind === 'disciplines') out.push(...await disciplinesJob(s.look))
      else if (s.kind === 'night') out.push(...await nightJob(s.look))
      else if (s.kind === 'evolution') out.push(...await evolutionJob(s.look))
      else if (s.kind === 'anatomy') out.push(...await anatomyJob(s.look))
      else if (s.kind === 'cutout') out.push(...await cutoutJob())
      else out.push(...await plansJob(live.current.settings.look))
    }
    return out
  }, { light }), [batch, viewsJob, cutJob, plansJob, disciplinesJob, nightJob, evolutionJob, anatomyJob, cutoutJob])

  const frameFocus = useCallback(async () => {
    const viewer = viewerApiRef.current
    const cat = live.current.settings.focusCat
    if (!viewer || !cat) return
    const box = await subjectBox(cat)
    if (!box) { viewer.frameCategory(cat); return }
    const vp = viewer.getCameraViewpoint()
    const pose = presetPose(box, 'iso', vp?.fovDeg ?? 45, vp?.aspect ?? 16 / 9)
    viewer.setCameraLookAt(pose.position, pose.target, false)
  }, [viewerApiRef, subjectBox])

  /** What the project sheet can print about the building's size, measured. */
  const measure = useCallback(async (): Promise<ModelMeasures> => {
    const trees = useValidationStore.getState().spatialTrees
    let storeys = 0
    for (const m of live.current.models) {
      if (!m.visible) continue
      storeys = Math.max(storeys, storeysFromTree(m.id, trees[m.id] ?? []).length)
    }
    const box = await subjectBox().catch(() => null)
    return { storeys: storeys || null, box }
  }, [subjectBox])

  return {
    busy, captureCurrent, captureAuto, capturePack, captureCut, capturePlans, captureExploded, captureDisciplines, captureNight, captureEvolution, captureAnatomy, captureCutout, captureSteps, frameFocus, measure,
  }
}
