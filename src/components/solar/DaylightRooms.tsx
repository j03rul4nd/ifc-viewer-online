// ─── DaylightRooms ────────────────────────────────────────────────────────────
// Daylight inside each room (IfcSpace): its windows, the sky they really see,
// the average daylight factor, the EN 17037 level it reaches by the daylight-
// factor method, and whether the room is too deep to be lit to the back.

import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { useTranslation } from 'react-i18next'
import type { ViewerAPI } from '../../lib/viewer'
import type { AnalysisRun, HeatmapOverride } from '../../lib/solar-analysis/analysis-system'
import type { SensorSet } from '../../lib/solar-analysis/sensors'
import { SENSOR_KINDS } from '../../lib/solar-analysis/sensors'
import { sunPath, type AnalysisPeriod, type SunPathOptions } from '../../lib/solar-analysis/sun-paths'
import { windowFrames, subsetSensors } from '../../lib/solar-analysis/shading-devices'
import { roomDaylight, daylightTargets, type RoomDaylight, type DaylightWindow, type SpaceInfo } from '../../lib/solar-analysis/daylight'
import { roomGrid, internalReflected, gridLevel, roomReflectance, floorsOf, type Tri2, type GridLevel, type FloorGroup } from '../../lib/solar-analysis/daylight-grid'
import { buildSensorSet } from '../../lib/solar-analysis/sensors'
import { rampColor } from '../../lib/solar-analysis/results'
import { tregenzaPatches, typicalSkyHours, annualIlluminance, roomAnnual, blindSchedule, blindGroupFactor, type RoomAnnual, type AnnualPoint } from '../../lib/solar-analysis/daylight-annual'
import { assignWindows } from '../../lib/solar-analysis/daylight'
import { sunDirectionScene } from '../../lib/solar/sun-math'
import { shareOrDownload } from '../../lib/share-file'
import { useSolarReportStore } from '../../stores/solarReportStore'

interface Props {
  viewerApiRef: React.MutableRefObject<ViewerAPI | null>
  north: { x: number; z: number }
  yawDeg: number
  /** True when the sky is the measured ERA5 one (annual results mean most then). */
  measuredSky: boolean
  ensureSensors(): Promise<SensorSet>
  runPeriod(period: AnalysisPeriod, minAltitudeDeg: number, sensors: SensorSet): Promise<AnalysisRun>
  pathFor(period: AnalysisPeriod): SunPathOptions
  skyLabel: string
  /** Draw a run with an override (the daylight map on the floors). */
  paint(run: AnalysisRun, override: HeatmapOverride): Promise<void>
  busy: boolean
  onDone(): void
  onError(err: unknown): void
}

const EN_DAY: AnalysisPeriod = { kind: 'day', date: { month: 3, day: 21 } }
const LEVEL_COLOR = { none: '#d9534a', minimum: '#e2a33a', medium: '#7cb85c', high: '#3f9d6a' } as const

interface Inputs {
  spaces: Array<SpaceInfo & { modelId: string; localId: number; floor: Tri2[] }>
  windows: DaylightWindow[]
  targets: ReturnType<typeof daylightTargets>
}

export default function DaylightRooms(p: Props) {
  const { t, i18n } = useTranslation('solar')
  const [inputs, setInputs] = useState<Inputs | null>(null)
  /** Point-by-point result: per room, the share of its plane over each target and the level. */
  const [grid, setGrid] = useState<{ byRoom: Map<string, { level: GridLevel; share: Record<'d100' | 'd300' | 'd500' | 'd750', number>; median: number; points: number; onReflections: boolean; irc: number }>; spacing: number; points: number; T: number; R: number; image: string | null; imageLabel: string } | null>(null)
  /** The last map, to redraw one floor of it. */
  const mapRef = useRef<{ run: AnalysisRun; df: Float32Array; sky?: Float32Array; top: number; meaning: 'df' | 'da' } | null>(null)
  const [annual, setAnnual] = useState<{ byRoom: Map<string, RoomAnnual & { blindHours?: number }>; points: number; spacing: number; image: string | null; imageLabel: string; T: number; R: number; label: string; blinds: boolean } | null>(null)
  /** The previous annual result, to read a change of design (protections on, another variant) against. */
  const [annualPrev, setAnnualPrev] = useState<{ byRoom: Map<string, RoomAnnual>; label: string } | null>(null)
  /** LM-83 operable blinds in the annual run (sDA as LEED computes it). */
  const [blinds, setBlinds] = useState(true)
  const [annualProgress, setAnnualProgress] = useState<{ stage: 'sky' | 'sun' | 'hours'; f: number } | null>(null)
  const [plan, setPlan] = useState<number | null>(null)
  /** The floor on screen, for callbacks that outlive a render. */
  const planRef = useRef<number | null>(null)
  const savedCamera = useRef<{ position: { x: number; y: number; z: number }; target: { x: number; y: number; z: number } } | null>(null)
  const [gridProgress, setGridProgress] = useState<number | null>(null)
  const [working, setWorking] = useState(false)
  const [T, setT] = useState(68)
  const [R, setR] = useState(50)
  const nf = (v: number, d = 1) => v.toLocaleString(i18n.language, { maximumFractionDigits: d, minimumFractionDigits: d })

  const rooms = useMemo<RoomDaylight[] | null>(() => {
    if (!inputs) return null
    return roomDaylight(inputs.spaces, inputs.windows, inputs.targets, { transmittance: T / 100, reflectance: R / 100, backReflectance: R / 100 })
      .sort((a, b) => a.df - b.df)
  }, [inputs, T, R])

  const summary = useMemo(() => {
    if (!rooms) return null
    const lit = rooms.filter((r) => r.windows > 0)
    const by = { none: 0, minimum: 0, medium: 0, high: 0 }
    for (const r of lit) by[r.level]++
    return { rooms: rooms.length, lit: lit.length, by, deep: lit.filter((r) => r.depth > r.depthLimit).length }
  }, [rooms])

  // The report follows what is shown.
  React.useEffect(() => {
    if (!rooms || !inputs || !summary) return
    useSolarReportStore.getState().set({
      daylight: {
        targets: inputs.targets, transmittance: T / 100, reflectance: R / 100, sky: p.skyLabel, summary,
        rooms: rooms.map((r) => {
          const g = grid?.byRoom.get(r.key)
          return {
            label: r.label, floorArea: r.floorArea, windows: r.windows, df: r.df, theta: r.theta, level: r.level, tooDeep: r.windows > 0 && r.depth > r.depthLimit,
            ...(g ? { grid: { level: g.level, share300: g.share.d300, share100: g.share.d100, median: g.median, onReflections: g.onReflections } } : {}),
          }
        }),
        ...(grid ? { gridImage: grid.image, gridImageLabel: grid.imageLabel, gridSpacing: grid.spacing, gridPoints: grid.points } : {}),
        ...(annual ? {
          annual: {
            image: annual.image, imageLabel: annual.imageLabel, points: annual.points, spacing: annual.spacing, measuredSky: p.measuredSky,
            blinds: annual.blinds,
            rooms: rooms.filter((r) => annual.byRoom.has(r.key)).map((r) => {
              const was = annualPrev?.byRoom.get(r.key)
              return { label: r.label, ...annual.byRoom.get(r.key)!, ...(was ? { prevSDA: was.sDA, prevASE: was.ASE } : {}) }
            }),
          },
        } : {}),
      },
    })
  }, [rooms, inputs, summary, T, R, p.skyLabel, grid, annual, annualPrev, p.measuredSky])

  const calculate = useCallback(async () => {
    const viewer = p.viewerApiRef.current
    if (!viewer) return
    setWorking(true)
    try {
      const sa = await viewer.getSolarAnalysis()
      const spaces = await sa.getSpaces()
      if (!spaces.length) throw new Error(t('daylight.noSpaces'))
      const all = await p.ensureSensors()
      const windowKind = SENSOR_KINDS.indexOf('window')
      const sensors = subsetSensors(all, (i) => all.kind[i] === windowKind)
      if (!sensors.count) throw new Error(t('shading.noWindows'))
      // Any run gives the windows' sky view; the EN 17037 day is the cheapest.
      const run = await p.runPeriod(EN_DAY, 0, sensors)
      const frames = windowFrames(sensors, run.stats, p.north)
      const sky = new Map(run.stats.map((s) => [`${s.element.modelId}:${s.element.localId}`, s]))
      const windows: DaylightWindow[] = frames.map((f) => {
        const st = sky.get(`${f.modelId}:${f.localId}`)
        return {
          key: `${f.modelId}:${f.localId}`, label: `${(st?.element.category ?? '').replace(/^IFC/, '').toLowerCase()} #${f.localId}`,
          center: f.center, n: { x: f.n.x, z: f.n.z }, width: f.width, height: f.height,
          skyView: st?.skyView ?? 0, glassShare: st?.element.category.toUpperCase() === 'IFCWINDOW' ? 0.8 : 1,
        }
      })
      const year = sunPath({ kind: 'year' }, { ...p.pathFor({ kind: 'year' }), stepMinutes: 60, stepDays: 7, binDeg: 0 })
      const targets = daylightTargets(year.samples.map((s) => ({ dhi: s.irradiance.dhi, hours: s.hours })))
      setInputs({ spaces, windows, targets })
      setGrid(null)
      setAnnual(null)
      setAnnualPrev(null)
      if (planRef.current !== null) { setPlan(null); planRef.current = null; await viewer.setPresentationSection(null) }
      p.onDone()
    } catch (err) {
      p.onError(err)
    } finally {
      setWorking(false)
    }
  }, [p, t])

  const floors = useMemo(() => (inputs ? floorsOf(inputs.spaces) : []), [inputs])
  const floorLabel = useCallback((f: FloorGroup) => {
    const names = (inputs?.spaces ?? []).filter((sp) => f.keys.includes(sp.key)).map((sp) => sp.label)
    return `${t('daylight.floorAt', { y: nf(f.y, 1) })} · ${names[0] ?? ''}${names.length > 1 ? ` +${names.length - 1}` : ''}`
  }, [inputs, t]) // eslint-disable-line react-hooks/exhaustive-deps

  /** Show only one floor's points of the map (all of them with null). */
  const paintFloor = useCallback(async (f: FloorGroup | null) => {
    const m = mapRef.current
    if (!m) return
    const open = new Uint8Array(m.run.sensors.count)
    for (let i = 0; i < open.length; i++) {
      const y = m.run.sensors.positions[i * 3 + 1]
      open[i] = !f || (y > f.y && y < f.top) ? 1 : 0
    }
    await p.paint({ ...m.run, open }, { meaning: m.meaning, values: m.df, secondary: m.sky, range: { min: 0, max: m.top }, color: rampColor })
  }, [p])

  /** The cut that opens a floor: everything above 1.6 m over its floor goes. */
  const cutAt = useCallback(async (f: FloorGroup | null) => {
    const viewer = p.viewerApiRef.current
    if (!viewer) return
    await viewer.setPresentationSection(f ? { normal: { x: 0, y: -1, z: 0 }, point: { x: 0, y: f.y + 1.6, z: 0 }, poche: '#3a3f4b' } : null)
  }, [p.viewerApiRef])

  /** Camera straight above a floor, framing its rooms. */
  const planPose = (f: FloorGroup) => {
    const cx = (f.min.x + f.max.x) / 2, cz = (f.min.z + f.max.z) / 2
    const span = Math.max(f.max.x - f.min.x, f.max.z - f.min.z, 4)
    const h = (span * 0.6) / Math.tan((20 * Math.PI) / 180) + 2
    return { position: { x: cx, y: f.y + 1.6 + h, z: cz + h * 0.02 }, target: { x: cx, y: f.y, z: cz } }
  }

  /** An off-screen picture of a floor's map from above, the cut on, everything restored after. */
  const planShot = async (f: FloorGroup, run: AnalysisRun): Promise<string | null> => {
    const viewer = p.viewerApiRef.current
    if (!viewer) return null
    const m = mapRef.current ?? { run, df: new Float32Array(0), top: 1, meaning: 'df' as const }
    mapRef.current = m
    try {
      await paintFloor(f)
      await cutAt(f)
      await viewer.beginShotRender(1600, 1100)
      try {
        const pose = planPose(f)
        const c = await viewer.renderShotFrame({ ...pose, fovDeg: 40 })
        return c.toDataURL('image/jpeg', 0.9)
      } finally {
        await viewer.endShotRender()
      }
    } catch {
      return null
    } finally {
      // Put the screen back as it was: the open floor, or the whole map.
      const open = planRef.current === null ? null : floors[planRef.current] ?? null
      await cutAt(open)
      await paintFloor(open)
    }
  }

  const showFloor = useCallback(async (i: number | null) => {
    const viewer = p.viewerApiRef.current
    if (!viewer) return
    const f = i === null ? null : floors[i]
    if (f && !savedCamera.current) {
      const vp = viewer.getCameraViewpoint()
      if (vp) savedCamera.current = { position: { ...vp.position }, target: { ...vp.target } }
    }
    setPlan(i)
    planRef.current = i
    await paintFloor(f)
    await cutAt(f)
    if (f) {
      const pose = planPose(f)
      viewer.setCameraLookAt(pose.position, pose.target, true)
      // This floor becomes the report's picture.
      if (mapRef.current) {
        const shot = await planShot(f, mapRef.current.run)
        if (shot) setGrid((g) => (g ? { ...g, image: shot, imageLabel: floorLabel(f) } : g))
      }
    } else if (savedCamera.current) {
      viewer.setCameraLookAt(savedCamera.current.position, savedCamera.current.target, true)
      savedCamera.current = null
    }
  }, [p.viewerApiRef, floors, paintFloor, cutAt, floorLabel]) // eslint-disable-line react-hooks/exhaustive-deps

  // Leaving the panel (or a new model) must not leave the building cut.
  useEffect(() => () => { void p.viewerApiRef.current?.setPresentationSection(null) }, []) // eslint-disable-line react-hooks/exhaustive-deps

  const runGrid = useCallback(async () => {
    const viewer = p.viewerApiRef.current
    if (!viewer || !inputs || !rooms) return
    setGridProgress(0)
    try {
      const sa = await viewer.getSolarAnalysis()
      const totalArea = inputs.spaces.reduce((a, sp) => a + (sp.box.max.x - sp.box.min.x) * (sp.box.max.z - sp.box.min.z), 0)
      // ~25 000 points at most: 0.5 m in a flat, coarser in a tower.
      const spacing = Math.max(0.5, Math.round(Math.sqrt(totalArea / 25000) * 4) / 4)
      const pts: number[] = []
      const roomOf: number[] = []
      inputs.spaces.forEach((sp, k) => {
        for (const q of roomGrid(sp.box, sp.floor, spacing)) { pts.push(q.x, q.y, q.z); roomOf.push(k) }
      })
      if (!pts.length) throw new Error(t('daylight.noGrid'))
      // Out of the way for the pass: the glass (light goes through) and the room volumes.
      const hide = new Map<string, number[]>()
      for (const w of inputs.windows) {
        const [modelId, id] = w.key.split(':')
        hide.set(modelId, [...(hide.get(modelId) ?? []), Number(id)])
      }
      for (const sp of inputs.spaces) hide.set(sp.modelId, [...(hide.get(sp.modelId) ?? []), sp.localId])
      const sc = await sa.daylightPass(new Float32Array(pts), [...hide.entries()].map(([modelId, ids]) => ({ modelId, ids })), {
        directions: 400, onProgress: (f) => setGridProgress(f),
      })
      // DF per point = T · SC + the room's internally reflected component.
      const byKey = new Map(rooms.map((r) => [r.key, r]))
      const irc = inputs.spaces.map((sp) => {
        const r = byKey.get(sp.key)
        if (!r || !r.windows) return 0
        const L = sp.box.max.x - sp.box.min.x, W = sp.box.max.z - sp.box.min.z, H = sp.box.max.y - sp.box.min.y
        const obstruction = Math.max(0, Math.min(80, (1 - r.theta / 90) * 90))
        const inner = 2 * (L * W + L * H + W * H)
        return internalReflected({ transmittance: T / 100, glazedArea: r.glazedArea, innerArea: inner, reflectance: roomReflectance(R / 100, inner, r.glazedArea), obstructionDeg: obstruction })
      })
      const df = new Float32Array(sc.length)
      const sky = new Float32Array(sc.length)
      for (let i = 0; i < sc.length; i++) { sky[i] = (T / 100) * sc[i] * 100; df[i] = sky[i] + irc[roomOf[i]] }
      const tg = inputs.targets
      const targets = { d100: (100 / tg.medianLux) * 100, d300: tg.minimum, d500: tg.medium, d750: tg.high }
      const per = new Map<string, number[]>()
      const perSky = new Map<string, number[]>()
      roomOf.forEach((k, i) => {
        const key = inputs.spaces[k].key
        const l = per.get(key) ?? []; l.push(df[i]); per.set(key, l)
        const m = perSky.get(key) ?? []; m.push(sky[i]); perSky.set(key, m)
      })
      const byRoom = new Map([...per.entries()].map(([key, v]) => {
        const g = gridLevel(v, targets)
        // Would it pass on the sky it sees alone? If not, it passes on the reflections.
        const skyOnly = gridLevel(perSky.get(key) ?? [], targets)
        return [key, { ...g, points: v.length, onReflections: g.level !== 'none' && skyOnly.level === 'none', irc: irc[inputs.spaces.findIndex((sp) => sp.key === key)] }]
      }))
      // The map on the floors.
      const sensors = buildSensorSet([{ kind: 'ground', element: null, samples: Array.from({ length: sc.length }, (_, i) => ({ x: pts[i * 3], y: pts[i * 3 + 1], z: pts[i * 3 + 2], nx: 0, ny: 1, nz: 0, area: spacing * spacing })) }], { ground: spacing, surface: spacing })
      const zeros = () => new Float32Array(sensors.count)
      const run: AnalysisRun = {
        sensors, result: { sunHours: zeros(), probableSunHours: zeros(), directWh: zeros(), diffuseWh: zeros(), reflectedWh: zeros(), skyCos: zeros(), days: 1 },
        stats: [], instants: 400, rawInstants: 400, period: { kind: 'day', date: { month: 3, day: 21 } }, skyView: zeros(), open: new Uint8Array(sensors.count).fill(1), albedo: 0,
      }
      const top = Math.max(1, Math.ceil(targets.d750 * 1.5))
      await p.paint(run, { meaning: 'df', values: df, secondary: sky, range: { min: 0, max: top }, color: rampColor })
      mapRef.current = { run, df, sky, top, meaning: 'df' }
      // No picture: from outside, the façade hides a map that lies on the floors inside.
      // The report's picture: the plan of the floor that does worst, cut open.
      const fl = floorsOf(inputs.spaces)
      let worst = 0, worstShare = Infinity
      fl.forEach((f, i) => {
        const shares = f.keys.map((k) => byRoom.get(k)?.share.d300).filter((v): v is number => v !== undefined)
        const m = shares.length ? Math.min(...shares) : Infinity
        if (m < worstShare) { worstShare = m; worst = i }
      })
      const shot = fl.length ? await planShot(fl[worst], run) : null
      setGrid({ byRoom, spacing, points: sc.length, T, R, image: shot, imageLabel: fl.length ? floorLabel(fl[worst]) : '' })
      p.onDone()
    } catch (err) {
      p.onError(err)
    } finally {
      setGridProgress(null)
    }
  }, [p, inputs, rooms, T, R, t])

  const runAnnual = useCallback(async () => {
    const viewer = p.viewerApiRef.current
    if (!viewer || !inputs || !rooms) return
    setAnnualProgress({ stage: 'sky', f: 0 })
    try {
      const sa = await viewer.getSolarAnalysis()
      const totalArea = inputs.spaces.reduce((a, sp) => a + (sp.box.max.x - sp.box.min.x) * (sp.box.max.z - sp.box.min.z), 0)
      // Points × 288 hours × 145 patches: ~8 000 points keeps it to seconds.
      const spacing = Math.max(1, Math.round(Math.sqrt(totalArea / 8000) * 4) / 4)
      const pts: number[] = []
      const roomOf: number[] = []
      inputs.spaces.forEach((sp, k) => {
        for (const q of roomGrid(sp.box, sp.floor, spacing)) { pts.push(q.x, q.y, q.z); roomOf.push(k) }
      })
      if (!pts.length) throw new Error(t('daylight.noGrid'))
      const hide = new Map<string, number[]>()
      for (const w of inputs.windows) { const [modelId, id] = w.key.split(':'); hide.set(modelId, [...(hide.get(modelId) ?? []), Number(id)]) }
      for (const sp of inputs.spaces) hide.set(sp.modelId, [...(hide.get(sp.modelId) ?? []), sp.localId])
      const patches = tregenzaPatches(2)
      const coef = await sa.daylightCoefficients(new Float32Array(pts), [...hide.entries()].map(([modelId, ids]) => ({ modelId, ids })), patches, p.yawDeg, {
        onProgress: (f) => setAnnualProgress({ stage: 'sky', f }),
      })
      // The same reflected share as the overcast map, per room.
      const byKey = new Map(rooms.map((r) => [r.key, r]))
      const irc = Float32Array.from(inputs.spaces.map((sp) => {
        const r = byKey.get(sp.key)
        if (!r || !r.windows) return 0
        const L = sp.box.max.x - sp.box.min.x, W = sp.box.max.z - sp.box.min.z, H = sp.box.max.y - sp.box.min.y
        const inner = 2 * (L * W + L * H + W * H)
        return internalReflected({ transmittance: T / 100, glazedArea: r.glazedArea, innerArea: inner, reflectance: roomReflectance(R / 100, inner, r.glazedArea), obstructionDeg: Math.max(0, Math.min(80, (1 - r.theta / 90) * 90)) })
      }))
      const hours = typicalSkyHours(p.pathFor({ kind: 'year' }))
      // The sun is a point: one more pass over the hours' own sun positions.
      const sunIndex = new Int32Array(hours.length).fill(-1)
      const sunDirs: Array<{ az: number; alt: number }> = []
      hours.forEach((h, k) => { if (h.sunAlt > 0.5 && h.dni > 0) { sunIndex[k] = sunDirs.length; sunDirs.push({ az: h.sunAz, alt: h.sunAlt }) } })
      setAnnualProgress({ stage: 'sun', f: 0 })
      const sunC = await sa.daylightCoefficients(new Float32Array(pts), [...hide.entries()].map(([modelId, ids]) => ({ modelId, ids })),
        sunDirs.map((d) => ({ az: d.az, alt: d.alt, omega: 1, samples: [d] })), p.yawDeg, { onProgress: (f) => setAnnualProgress({ stage: 'sun', f }) })
      // c = visible · cos θ on a horizontal plane → visible = c / sin(altitude).
      const S = sunDirs.length
      const sunVis = new Float32Array(sunC.length)
      for (let i = 0; i < roomOf.length; i++) for (let k = 0; k < S; k++) sunVis[i * S + k] = sunC[i * S + k] / Math.max(1e-3, Math.sin((sunDirs[k].alt * Math.PI) / 180))
      const n = roomOf.length
      const P = patches.length
      const roomCount = inputs.spaces.length
      const sched = blinds ? blindSchedule(sunVis, sunIndex, S, Int32Array.from(roomOf), roomCount, hours, T / 100) : null
      // LM-83 blind groups by façade: each room's windows, the hour's sun in scene axes.
      const byRoomWin = assignWindows(inputs.spaces, inputs.windows)
      const roomWins = inputs.spaces.map((sp) => (byRoomWin.get(sp.key) ?? []).map((w) => ({ nx: w.n.x, nz: w.n.z, area: w.width * w.height * w.glassShare })))
      const yawRad = (p.yawDeg * Math.PI) / 180
      const hourSun = hours.map((h) => { if (h.sunAlt <= 0) return null; const d = sunDirectionScene(h.sunAz, h.sunAlt, yawRad); return { x: d.x, z: d.z } })
      const blindFactor = sched ? blindGroupFactor(roomWins, hourSun, 0.2) : null
      // Share of the occupied hours each room spends with its blinds down (sunny state weighted by p).
      const blindShare = new Float32Array(roomCount)
      if (sched) {
        let occ = 0
        hours.forEach((h) => { if (h.occupied && (h.sunAlt > 0 || h.dhi > 0)) occ += h.weight })
        for (let r = 0; r < roomCount; r++) {
          let c = 0
          hours.forEach((h, k) => { if (h.occupied && sched[r * hours.length + k]) c += h.weight * Math.max(0, Math.min(1, h.sunProb ?? 1)) })
          blindShare[r] = occ > 0 ? c / occ : 0
        }
      }
      const res: AnnualPoint = { da100: new Float32Array(n), da300: new Float32Array(n), da500: new Float32Array(n), da750: new Float32Array(n), occ300: new Float32Array(n), sunHours1000: new Float32Array(n) }
      const ro = Int32Array.from(roomOf)
      // In chunks of points, yielding between them: the page stays alive.
      const CH = 600
      for (let a = 0; a < n; a += CH) {
        const b = Math.min(n, a + CH)
        const part = annualIlluminance(coef.subarray(a * P, b * P), b - a, hours, {
          transmittance: T / 100, irc, roomOf: ro.subarray(a, b), patches,
          sunVis: sunVis.subarray(a * S, b * S), sunIndex, sunHours: S,
          ...(sched && blindFactor ? { blinds: sched, blindFactor } : {}),
        })
        for (const k of Object.keys(res) as Array<keyof AnnualPoint>) res[k].set(part[k], a)
        setAnnualProgress({ stage: 'hours', f: b / n })
        await new Promise((r) => setTimeout(r, 0))
      }
      const idxByRoom = new Map<string, number[]>()
      roomOf.forEach((k, i) => { const key = inputs.spaces[k].key; const l = idxByRoom.get(key) ?? []; l.push(i); idxByRoom.set(key, l) })
      const byRoom = new Map([...idxByRoom.entries()].map(([key, idx]) => [key, { ...roomAnnual(idx, res), blindHours: sched ? blindShare[inputs.spaces.findIndex((sp) => sp.key === key)] : undefined }]))
      // The map: daylight autonomy, % of daylight hours at 300 lx.
      const sensors = buildSensorSet([{ kind: 'ground', element: null, samples: Array.from({ length: n }, (_, i) => ({ x: pts[i * 3], y: pts[i * 3 + 1], z: pts[i * 3 + 2], nx: 0, ny: 1, nz: 0, area: spacing * spacing })) }], { ground: spacing, surface: spacing })
      const zeros = () => new Float32Array(n)
      const run: AnalysisRun = {
        sensors, result: { sunHours: zeros(), probableSunHours: zeros(), directWh: zeros(), diffuseWh: zeros(), reflectedWh: zeros(), skyCos: zeros(), days: 365 },
        stats: [], instants: P, rawInstants: hours.length, period: { kind: 'year' }, skyView: zeros(), open: new Uint8Array(n).fill(1), albedo: 0,
      }
      const da = Float32Array.from(res.da300, (v) => v * 100)
      await p.paint(run, { meaning: 'da', values: da, range: { min: 0, max: 100 }, color: rampColor })
      mapRef.current = { run, df: da, top: 100, meaning: 'da' }
      // The report's picture: the floor with the lowest sDA.
      const fl = floorsOf(inputs.spaces)
      let worst = 0, worstV = Infinity
      fl.forEach((f, i) => {
        const v = Math.min(...f.keys.map((k) => byRoom.get(k)?.sDA ?? Infinity))
        if (v < worstV) { worstV = v; worst = i }
      })
      const shot = fl.length ? await planShot(fl[worst], run) : null
      setAnnual((prev) => {
        if (prev) setAnnualPrev({ byRoom: prev.byRoom, label: prev.label })
        return { blinds, byRoom, points: n, spacing, image: shot, imageLabel: fl.length ? floorLabel(fl[worst]) : '', T, R, label: new Date().toLocaleTimeString(i18n.language, { hour: '2-digit', minute: '2-digit' }) }
      })
      p.onDone()
    } catch (err) {
      p.onError(err)
    } finally {
      setAnnualProgress(null)
    }
  }, [p, inputs, rooms, T, R, t, floorLabel, blinds]) // eslint-disable-line react-hooks/exhaustive-deps

  const frame = useCallback((key: string) => {
    const s = inputs?.spaces.find((x) => x.key === key)
    if (s) p.viewerApiRef.current?.frameElements([s.localId], s.modelId)
  }, [inputs, p.viewerApiRef])

  const exportCsv = useCallback(() => {
    if (!rooms || !inputs) return
    const lines = [`# target DF: minimum ${inputs.targets.minimum.toFixed(2)} %, medium ${inputs.targets.medium.toFixed(2)} %, high ${inputs.targets.high.toFixed(2)} % (median diffuse ${Math.round(inputs.targets.medianLux)} lx); T ${T} %, R ${R} %`,
      'room,floor_m2,windows,glazed_m2,theta_deg,df_pct,en17037_level,depth_m,depth_limit_m']
    for (const r of rooms) lines.push([`"${r.label.replace(/"/g, '""')}"`, r.floorArea.toFixed(1), r.windows, r.glazedArea.toFixed(2), r.theta.toFixed(0), r.df.toFixed(2), r.level, r.depth.toFixed(1), r.depthLimit.toFixed(1)].join(','))
    void shareOrDownload(new Blob([lines.join('\n')], { type: 'text/csv' }), 'solar-daylight.csv')
  }, [rooms, inputs, T, R])

  return (
    <div className="flex flex-col gap-1.5 text-[10.5px]">
      <label className="grid grid-cols-[6.5rem_1fr_3rem] items-center gap-1.5">
        <span>{t('daylight.transmittance')}</span>
        <input type="range" min={40} max={85} step={1} value={T} onChange={(e) => setT(Number(e.target.value))} className="accent-[var(--accent)]" />
        <span className="font-mono tabular-nums text-right text-[var(--text)]">{T} %</span>
      </label>
      <label className="grid grid-cols-[6.5rem_1fr_3rem] items-center gap-1.5">
        <span>{t('daylight.reflectance')}</span>
        <input type="range" min={20} max={80} step={1} value={R} onChange={(e) => setR(Number(e.target.value))} className="accent-[var(--accent)]" />
        <span className="font-mono tabular-nums text-right text-[var(--text)]">{R} %</span>
      </label>
      <div className="flex items-center gap-1.5">
        <button disabled={p.busy || working} onClick={() => { void calculate() }} className="px-2.5 py-1.5 rounded-[8px] font-semibold bg-[var(--accent)] text-white disabled:opacity-40">
          {working ? t('daylight.working') : rooms ? t('daylight.recalc') : t('daylight.calc')}
        </button>
        {rooms && (
          <button disabled={p.busy || working || gridProgress !== null} onClick={() => { void runGrid() }} title={t('daylight.gridHint')}
            className="px-2 py-1 rounded-[7px] border border-[var(--border-strong)] hover:bg-[var(--surface-2)] disabled:opacity-40">
            {gridProgress !== null ? t('daylight.gridWorking', { pct: Math.round(gridProgress * 100) }) : grid ? t('daylight.gridAgain') : t('daylight.grid')}
          </button>
        )}
        {rooms && <button onClick={exportCsv} className="ml-auto px-2 py-1 rounded-[7px] border border-[var(--border-strong)] hover:bg-[var(--surface-2)]">CSV</button>}
      </div>
      {grid && (grid.T !== T || grid.R !== R) && <p className="text-[9.5px] text-[#F5A623]">{t('daylight.gridStale')}</p>}
      {rooms && (
        <div className="flex flex-col gap-1 border border-[var(--border)] rounded-[8px] px-2 py-1.5">
          <div className="flex items-center gap-1.5">
            <span className="font-medium text-[var(--text)]">{t('daylight.annualTitle')}</span>
            <button disabled={p.busy || working || annualProgress !== null || gridProgress !== null} onClick={() => { void runAnnual() }}
              className="ml-auto px-2 py-1 rounded-[7px] border border-[var(--border-strong)] hover:bg-[var(--surface-2)] disabled:opacity-40">
              {annualProgress ? t(annualProgress.stage === 'sky' ? 'daylight.annualSky' : annualProgress.stage === 'sun' ? 'daylight.annualSun' : 'daylight.annualHours', { pct: Math.round(annualProgress.f * 100) }) : annual ? t('daylight.gridAgain') : t('daylight.annualRun')}
            </button>
          </div>
          <label className="flex items-center gap-1.5 cursor-pointer" title={t('daylight.blindsHint')}>
            <input type="checkbox" checked={blinds} onChange={(e) => setBlinds(e.target.checked)} className="accent-[var(--accent)]" />
            {t('daylight.blinds')}
          </label>
          {!annual && <p className="text-[9.5px] text-[var(--text-faint)] leading-snug">{t('daylight.annualHint')}</p>}
          {!p.measuredSky && <p className="text-[9.5px] text-[#F5A623] leading-snug">{t('daylight.annualClearSky')}</p>}
          {annual && (() => {
            const list = rooms.filter((r) => annual.byRoom.has(r.key))
            const ok = list.filter((r) => annual.byRoom.get(r.key)!.level !== 'none').length
            const leed = list.filter((r) => { const a = annual.byRoom.get(r.key)!; return a.sDA >= 0.55 && a.ASE <= 0.1 }).length
            return <>
              <div className="text-[var(--text)]">{t('daylight.annualSummary', { ok, n: list.length, leed, points: annual.points.toLocaleString(i18n.language), spacing: annual.spacing })}</div>
              {annualPrev && <div className="text-[9.5px] text-[var(--text-faint)]">{t('daylight.annualVsPrev', { at: annualPrev.label })}</div>}
              <div className="grid grid-cols-[1fr_2.8rem_3.2rem_3.2rem_2.6rem] gap-x-1.5 text-[9.5px] text-[var(--text-faint)]">
                <span>{t('daylight.room')}</span><span className="text-right" title={t('daylight.daHint')}>DA300</span><span className="text-right" title={t('daylight.sdaHint')}>sDA</span><span className="text-right" title={t('daylight.aseHint')}>ASE</span><span className="text-right" title={t('daylight.blindHoursHint')}>{t('daylight.blindCol')}</span>
              </div>
              <div className="flex flex-col max-h-[180px] overflow-y-auto">
                {list.map((r) => {
                  const a = annual.byRoom.get(r.key)!
                  const b = annualPrev?.byRoom.get(r.key)
                  const d = (now: number, was: number | undefined, upGood: boolean) => {
                    if (was === undefined) return null
                    const v = Math.round((now - was) * 100)
                    if (v === 0) return null
                    return <span className={`text-[8.5px] ml-0.5 ${(v > 0) === upGood ? 'text-[#4caf7a]' : 'text-[#e2603a]'}`}>{v > 0 ? '+' : ''}{v}</span>
                  }
                  return (
                    <button key={r.key} onClick={() => frame(r.key)} className="grid grid-cols-[1fr_2.8rem_3.2rem_3.2rem_2.6rem] gap-x-1.5 text-left hover:bg-[var(--surface-2)] rounded px-0.5">
                      <span className="truncate flex items-center gap-1"><span className="w-2 h-2 rounded-full shrink-0" style={{ background: LEVEL_COLOR[a.level] }} />{r.label}</span>
                      <span className="font-mono tabular-nums text-right">{Math.round(a.meanDA * 100)}%</span>
                      <span className={`font-mono tabular-nums text-right ${a.sDA >= 0.55 ? 'text-[#4caf7a]' : 'text-[#e2603a]'}`}>{Math.round(a.sDA * 100)}%{d(a.sDA, b?.sDA, true)}</span>
                      <span className={`font-mono tabular-nums text-right ${a.ASE <= 0.1 ? 'text-[#4caf7a]' : 'text-[#e2603a]'}`}>{Math.round(a.ASE * 100)}%{d(a.ASE, b?.ASE, false)}</span>
                      <span className="font-mono tabular-nums text-right">{a.blindHours === undefined ? '—' : `${Math.round(a.blindHours * 100)}%`}</span>
                    </button>
                  )
                })}
              </div>
              <p className="text-[9.5px] text-[var(--text-faint)] leading-snug">{t('daylight.annualNote')}</p>
            </>
          })()}
        </div>
      )}
      {!rooms && <p className="text-[9.5px] text-[var(--text-faint)] leading-snug">{t('daylight.hint')}</p>}
      {rooms && inputs && summary && (
        <>
          <div className="text-[var(--text)]">{t('daylight.summary', { ok: summary.lit - summary.by.none, lit: summary.lit, rooms: summary.rooms })}</div>
          <div className="flex h-2 rounded-full overflow-hidden">
            {(['none', 'minimum', 'medium', 'high'] as const).map((k) => <div key={k} style={{ width: `${(summary.by[k] / Math.max(1, summary.lit)) * 100}%`, background: LEVEL_COLOR[k] }} />)}
          </div>
          <div className="text-[9.5px] text-[var(--text-faint)]">
            {t('daylight.targets', { min: nf(inputs.targets.minimum), med: nf(inputs.targets.medium), high: nf(inputs.targets.high), lux: Math.round(inputs.targets.medianLux / 100) * 100 })}
          </div>
          {grid && (() => {
            const lit = rooms.filter((r) => grid.byRoom.has(r.key) && r.windows > 0)
            const ok = lit.filter((r) => grid.byRoom.get(r.key)!.level !== 'none').length
            const refl = lit.filter((r) => grid.byRoom.get(r.key)!.onReflections).length
            return <>
              <div className="text-[var(--text)] font-medium">{t('daylight.gridSummary', { ok, lit: lit.length, points: grid.points.toLocaleString(i18n.language), spacing: grid.spacing })}</div>
              {refl > 0 && <p className="text-[9.5px] text-[#F5A623] leading-snug">{t('daylight.onReflections', { n: refl })}</p>}
            </>
          })()}
          {grid && floors.length > 0 && (
            <div className="flex items-center gap-1.5">
              <span>{t('daylight.plan')}</span>
              <select value={plan ?? ''} onChange={(e) => { void showFloor(e.target.value === '' ? null : Number(e.target.value)) }}
                className="flex-1 min-w-0 px-1 py-0.5 rounded bg-[var(--surface-2)] border border-[var(--border)] text-[var(--text)]">
                <option value="">{t('daylight.allFloors')}</option>
                {floors.map((f, i) => <option key={i} value={i}>{floorLabel(f)}</option>)}
              </select>
            </div>
          )}
          <div className={`grid ${grid ? 'grid-cols-[1fr_2.6rem_3.2rem_3rem]' : 'grid-cols-[1fr_3rem_2.4rem_3.4rem]'} gap-x-2 text-[9.5px] text-[var(--text-faint)] mt-1`}>
            <span>{t('daylight.room')}</span>
            {grid ? <><span className="text-right">FLD</span><span className="text-right" title={t('daylight.shareHint')}>≥300lx</span><span className="text-right">≥100lx</span></>
              : <><span className="text-right">m²</span><span className="text-right">{t('daylight.win')}</span><span className="text-right">FLD</span></>}
          </div>
          <div className="flex flex-col max-h-[220px] overflow-y-auto">
            {rooms.map((r) => (
              <button key={r.key} onClick={() => frame(r.key)} className={`grid ${grid ? 'grid-cols-[1fr_2.6rem_3.2rem_3rem]' : 'grid-cols-[1fr_3rem_2.4rem_3.4rem]'} gap-x-2 text-left hover:bg-[var(--surface-2)] rounded px-0.5`}
                title={r.windows ? t('daylight.rowHint', { theta: Math.round(r.theta), depth: nf(r.depth), limit: nf(r.depthLimit) }) : t('daylight.noWindows')}>
                <span className="truncate flex items-center gap-1">
                  <span className="w-2 h-2 rounded-full shrink-0" style={{ background: r.windows ? LEVEL_COLOR[grid?.byRoom.get(r.key)?.level ?? r.level] : 'var(--border-strong)' }} />
                  {r.label}{r.windows > 0 && r.depth > r.depthLimit && <span className="text-[#F5A623]" title={t('daylight.tooDeep')}> ⚠</span>}
                </span>
                {grid ? (() => {
                  const g = grid.byRoom.get(r.key)
                  return <>
                    <span className="font-mono tabular-nums text-right">{r.windows ? nf(r.df) : '—'}</span>
                    <span className={`font-mono tabular-nums text-right ${g && g.share.d300 >= 0.5 ? 'text-[#4caf7a]' : 'text-[#e2603a]'}`}>{g ? `${Math.round(g.share.d300 * 100)}%` : '—'}</span>
                    <span className={`font-mono tabular-nums text-right ${g && g.share.d100 >= 0.95 ? 'text-[#4caf7a]' : 'text-[#e2603a]'}`}>{g ? `${Math.round(g.share.d100 * 100)}%` : '—'}</span>
                  </>
                })() : <>
                  <span className="font-mono tabular-nums text-right">{nf(r.floorArea, 0)}</span>
                  <span className="font-mono tabular-nums text-right">{r.windows}</span>
                  <span className="font-mono tabular-nums text-right text-[var(--text)]">{r.windows ? `${nf(r.df)} %` : '—'}</span>
                </>}
              </button>
            ))}
          </div>
          {summary.deep > 0 && <p className="text-[9.5px] text-[#F5A623] leading-snug">{t('daylight.deepNote', { n: summary.deep })}</p>}
          <p className="text-[9.5px] text-[var(--text-faint)] leading-snug">{t('daylight.note')}</p>
        </>
      )}
    </div>
  )
}
