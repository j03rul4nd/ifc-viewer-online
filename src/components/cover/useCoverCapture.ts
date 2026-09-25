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
export type BusyKind = 'shots' | 'pack' | 'cut' | 'explode' | 'plans' | 'recipe'

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
    const url = viewer.takeSnapshot(live.current.settings.res)
    if (!url.startsWith('data:image/png')) return null
    const image = await finish(await dataUrlToImage(url), lookId)
    return newShot(label, image)
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
      const url = viewer.takeSnapshot(live.current.settings.res)
      if (!url.startsWith('data:image/png')) continue
      const image = await finish(await dataUrlToImage(url), lookId)
      out.push(newShot(layer.names.join(' / '), image))
    }
    viewer.isolateElements([], false)
    await viewer.setPresentationSection(null)
    return out
  }, [viewerApiRef, storeyLayers, subjectBox, dress, finish])

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
      else out.push(...await plansJob(live.current.settings.look))
    }
    return out
  }, { light }), [batch, viewsJob, cutJob, plansJob])

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
    busy, captureCurrent, captureAuto, capturePack, captureCut, capturePlans, captureExploded, captureSteps, frameFocus, measure,
  }
}
