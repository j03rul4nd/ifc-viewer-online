// ─── AGV fleet twin (simulated) ──────────────────────────────────────────────
// A warehouse run by six autonomous pallet carts, in 3D, with the numbers a
// logistics manager watches and the call each delivered order would make to
// their ERP or CRM. Everything moving here comes from sim.ts — seeded, so the
// same story plays on every screen — and the page says so.
//
// The scene is plain three.js built in code (no model download): instanced
// racks and pallets, a painted floor texture, carts with a mast, forks and the
// blue safety spot real AGVs project ahead of them. The React layer only reads
// a snapshot four times a second; the 3D loop never re-renders React.

import { useEffect, useMemo, useRef, useState, type ReactNode } from 'react'
import * as THREE from 'three'
import { OrbitControls } from 'three/addons/controls/OrbitControls.js'
import { RoundedBoxGeometry } from 'three/addons/geometries/RoundedBoxGeometry.js'
import {
  createSim, step, kpis, erpPayload, seeded,
  SIZE, ROAD_Z, CROSS_X, RACK_X0, RACK_X1, BAY_W, LEVELS, RACK_ROWS, AISLES, DOCKS, CHARGERS, STATE_LABEL,
  type Sim, type Agv, type AgvState, type ErpTarget, type Kpis, type SimEvent, type ErpSync,
} from './sim'

const STATE_COLOR: Record<AgvState, string> = {
  idle: '#94a3b8', toPick: '#38bdf8', picking: '#a78bfa', toDock: '#5e6ad2', dropping: '#a78bfa',
  toCharge: '#f59e0b', charging: '#22c55e', blocked: '#ef4444',
}
const LEVEL_Y = [0.18, 1.45, 2.7, 3.95]
const coarse = typeof window !== 'undefined' && window.matchMedia?.('(pointer: coarse)').matches

// ── Floor texture: concrete, lanes, zones and their names ────────────────────

function floorTexture(): THREE.CanvasTexture {
  const PX = 34 // pixels per metre
  const c = document.createElement('canvas')
  c.width = SIZE.w * PX; c.height = SIZE.d * PX
  const g = c.getContext('2d')!
  g.fillStyle = '#3a3e45'; g.fillRect(0, 0, c.width, c.height)
  // concrete mottling
  const rnd = seeded(9)
  for (let i = 0; i < 2600; i++) {
    g.fillStyle = `rgba(${rnd() < 0.5 ? '255,255,255' : '0,0,0'},${0.012 + rnd() * 0.02})`
    const r = 6 + rnd() * 40
    g.beginPath(); g.arc(rnd() * c.width, rnd() * c.height, r, 0, 7); g.fill()
  }
  // slab joints every 6 m
  g.strokeStyle = 'rgba(0,0,0,0.25)'; g.lineWidth = 2
  for (let x = 0; x <= SIZE.w; x += 6) { g.beginPath(); g.moveTo(x * PX, 0); g.lineTo(x * PX, c.height); g.stroke() }
  for (let z = 0; z <= SIZE.d; z += 6) { g.beginPath(); g.moveTo(0, z * PX); g.lineTo(c.width, z * PX); g.stroke() }
  const X = (x: number) => x * PX, Z = (z: number) => z * PX
  // driving lanes: yellow edges
  g.strokeStyle = '#e8b300'; g.lineWidth = 5
  const lane = (x0: number, z0: number, x1: number, z1: number, w = 1.6) => {
    if (z0 === z1) { for (const o of [-w, w]) { g.beginPath(); g.moveTo(X(x0), Z(z0 + o)); g.lineTo(X(x1), Z(z1 + o)); g.stroke() } }
    else { for (const o of [-w, w]) { g.beginPath(); g.moveTo(X(x0 + o), Z(z0)); g.lineTo(X(x1 + o), Z(z1)); g.stroke() } }
  }
  lane(3, ROAD_Z, 58, ROAD_Z, 1.8)
  for (const cx of CROSS_X) lane(cx, ROAD_Z, cx, AISLES[AISLES.length - 1])
  // walkway: green hatch along the west wall
  g.fillStyle = 'rgba(34,197,94,0.18)'; g.fillRect(X(0.4), Z(9), X(1.6), Z(26))
  g.strokeStyle = 'rgba(34,197,94,0.6)'; g.lineWidth = 3; g.strokeRect(X(0.4), Z(9), X(1.6), Z(26))
  // dock zones
  for (const [i, d] of DOCKS.entries()) {
    g.fillStyle = 'rgba(232,179,0,0.10)'; g.fillRect(X(d.x - 1.6), Z(0), X(3.2), Z(3.6))
    g.strokeStyle = '#e8b300'; g.lineWidth = 4; g.strokeRect(X(d.x - 1.6), Z(0.1), X(3.2), Z(3.5))
    g.fillStyle = 'rgba(255,255,255,0.85)'; g.font = `bold ${PX * 0.9}px Inter, system-ui, sans-serif`; g.textAlign = 'center'
    g.fillText(`DOCK ${i + 1}`, X(d.x), Z(4.8))
  }
  // chargers
  for (const [i, ch] of CHARGERS.entries()) {
    g.fillStyle = 'rgba(34,197,94,0.22)'; g.fillRect(X(ch.x - 1.1), Z(1.2), X(2.2), Z(2.6))
    g.strokeStyle = '#22c55e'; g.lineWidth = 4; g.strokeRect(X(ch.x - 1.1), Z(1.2), X(2.2), Z(2.6))
    g.fillStyle = 'rgba(255,255,255,0.85)'; g.font = `bold ${PX * 0.7}px Inter, system-ui, sans-serif`; g.textAlign = 'center'
    g.fillText(`C${i + 1}`, X(ch.x), Z(4.6))
  }
  // aisle letters
  g.fillStyle = 'rgba(255,255,255,0.55)'; g.font = `bold ${PX * 1.3}px Inter, system-ui, sans-serif`; g.textAlign = 'center'
  AISLES.forEach((z, i) => { g.fillText(`AISLE ${'ABC'[i]}`, X(10.5), Z(z) + PX * 0.45) })
  const t = new THREE.CanvasTexture(c)
  t.colorSpace = THREE.SRGBColorSpace
  t.anisotropy = 8
  return t
}

// ── Static warehouse ─────────────────────────────────────────────────────────

function buildWarehouse(scene: THREE.Scene): { obstacle: THREE.Group } {
  const rnd = seeded(31)
  const floor = new THREE.Mesh(new THREE.PlaneGeometry(SIZE.w, SIZE.d), new THREE.MeshStandardMaterial({ map: floorTexture(), roughness: 0.82, metalness: 0.04 }))
  floor.rotation.x = -Math.PI / 2; floor.position.set(SIZE.w / 2, 0, SIZE.d / 2); floor.receiveShadow = true
  scene.add(floor)
  // apron outside the docks
  const apron = new THREE.Mesh(new THREE.PlaneGeometry(SIZE.w + 30, 26), new THREE.MeshStandardMaterial({ color: '#23262b', roughness: 0.95 }))
  apron.rotation.x = -Math.PI / 2; apron.position.set(SIZE.w / 2, -0.02, -13); apron.receiveShadow = true
  scene.add(apron)

  // walls: back and sides, tall and dark, with a light band
  const wallMat = new THREE.MeshStandardMaterial({ color: '#1f242b', roughness: 0.9 })
  const bandMat = new THREE.MeshStandardMaterial({ color: '#2b313a', roughness: 0.7 })
  const wall = (w: number, h: number, x: number, z: number, ry = 0) => {
    const m = new THREE.Mesh(new THREE.BoxGeometry(w, h, 0.3), wallMat); m.position.set(x, h / 2, z); m.rotation.y = ry; m.receiveShadow = true; scene.add(m)
    const b = new THREE.Mesh(new THREE.BoxGeometry(w, 1.2, 0.32), bandMat); b.position.set(x, 1.2, z); b.rotation.y = ry; scene.add(b)
  }
  // the camera's side stays low so the floor reads from outside
  const parapet = new THREE.Mesh(new THREE.BoxGeometry(SIZE.w, 1.1, 0.3), bandMat); parapet.position.set(SIZE.w / 2, 0.55, SIZE.d); parapet.receiveShadow = true; scene.add(parapet)
  wall(SIZE.d, 9, 0, SIZE.d / 2, Math.PI / 2)
  wall(SIZE.d, 9, SIZE.w, SIZE.d / 2, Math.PI / 2)
  // dock wall: a low header with door openings
  const header = new THREE.Mesh(new THREE.BoxGeometry(SIZE.w, 4.2, 0.3), wallMat); header.position.set(SIZE.w / 2, 6.9, 0); scene.add(header)
  const pierMat = new THREE.MeshStandardMaterial({ color: '#2a3038', roughness: 0.85 })
  for (let x = 0; x <= SIZE.w; x += 5) {
    if (DOCKS.some((d) => Math.abs(d.x - x) < 2.2)) continue
    const p = new THREE.Mesh(new THREE.BoxGeometry(5, 4.8, 0.3), pierMat); p.position.set(x + 2.5, 2.4, 0); scene.add(p)
  }

  // racks: uprights, beams, pallets and loads — all instanced
  const bays = Math.floor((RACK_X1 - RACK_X0) / BAY_W)
  const upGeo = new THREE.BoxGeometry(0.09, 5.1, 0.09)
  const beamGeo = new THREE.BoxGeometry(BAY_W, 0.12, 0.06)
  const palletGeo = new THREE.BoxGeometry(1.15, 0.14, 1.0)
  const loadGeo = new THREE.BoxGeometry(1.05, 1, 0.95)
  const upCount = RACK_ROWS.length * (bays + 1) * 2
  const beamCount = RACK_ROWS.length * bays * LEVELS * 2
  const slotCount = RACK_ROWS.length * bays * LEVELS * 2
  const ups = new THREE.InstancedMesh(upGeo, new THREE.MeshStandardMaterial({ color: '#2f6fb5', metalness: 0.5, roughness: 0.45 }), upCount)
  const beams = new THREE.InstancedMesh(beamGeo, new THREE.MeshStandardMaterial({ color: '#e5671e', metalness: 0.35, roughness: 0.5 }), beamCount)
  const pallets = new THREE.InstancedMesh(palletGeo, new THREE.MeshStandardMaterial({ color: '#b08457', roughness: 0.9 }), slotCount)
  const loads = new THREE.InstancedMesh(loadGeo, new THREE.MeshStandardMaterial({ color: '#ffffff', roughness: 0.75 }), slotCount)
  const m = new THREE.Matrix4(); const q = new THREE.Quaternion(); const sc = new THREE.Vector3(1, 1, 1); const pos = new THREE.Vector3()
  const palette = ['#c9a06b', '#d2b48c', '#b98d58', '#e7e2d6', '#9fb3c8', '#c7d3b4', '#d9c8a9']
  let iu = 0, ib = 0, is = 0
  for (const rz of RACK_ROWS) {
    for (let b = 0; b <= bays; b++) {
      for (const dz of [-0.5, 0.5]) { m.compose(pos.set(RACK_X0 + b * BAY_W, 2.55, rz + dz), q, sc); ups.setMatrixAt(iu++, m) }
    }
    for (let b = 0; b < bays; b++) {
      const cx = RACK_X0 + (b + 0.5) * BAY_W
      for (let l = 0; l < LEVELS; l++) {
        for (const dz of [-0.5, 0.5]) { m.compose(pos.set(cx, LEVEL_Y[l], rz + dz), q, sc); beams.setMatrixAt(ib++, m) }
        for (const dx of [-0.66, 0.66]) {
          if (rnd() < 0.18) continue
          m.compose(pos.set(cx + dx, LEVEL_Y[l] + 0.13, rz), q, sc); pallets.setMatrixAt(is, m)
          const h = 0.55 + rnd() * 0.55
          m.compose(pos.set(cx + dx, LEVEL_Y[l] + 0.2 + h / 2, rz), q, new THREE.Vector3(1, h, 1)); loads.setMatrixAt(is, m)
          loads.setColorAt(is, new THREE.Color(palette[Math.floor(rnd() * palette.length)]))
          is++
        }
      }
    }
  }
  pallets.count = is; loads.count = is
  for (const im of [ups, beams, pallets, loads]) { im.castShadow = true; im.receiveShadow = true; im.instanceMatrix.needsUpdate = true; scene.add(im) }
  if (loads.instanceColor) loads.instanceColor.needsUpdate = true

  // chargers: cabinets with a green light
  for (const ch of CHARGERS) {
    const cab = new THREE.Mesh(new THREE.BoxGeometry(0.8, 1.3, 0.45), new THREE.MeshStandardMaterial({ color: '#d9dde3', roughness: 0.5 }))
    cab.position.set(ch.x, 0.65, 0.5); cab.castShadow = true; scene.add(cab)
    const led = new THREE.Mesh(new THREE.BoxGeometry(0.5, 0.06, 0.02), new THREE.MeshStandardMaterial({ color: '#22c55e', emissive: '#22c55e', emissiveIntensity: 2 }))
    led.position.set(ch.x, 1.1, 0.74); scene.add(led)
  }
  // trucks at the docks
  const trailerMat = new THREE.MeshStandardMaterial({ color: '#e6e8eb', roughness: 0.55 })
  const cabMat = new THREE.MeshStandardMaterial({ color: '#1e3a5f', roughness: 0.4, metalness: 0.3 })
  for (const [i, d] of DOCKS.entries()) {
    if (i === 2) continue // one free dock
    const tr = new THREE.Mesh(new THREE.BoxGeometry(2.5, 2.9, 11), trailerMat); tr.position.set(d.x, 2.05, -6.2); tr.castShadow = true; scene.add(tr)
    const cb = new THREE.Mesh(new THREE.BoxGeometry(2.4, 2.6, 2.2), cabMat); cb.position.set(d.x, 1.7, -13.2); cb.castShadow = true; scene.add(cb)
  }
  // yellow bollards at the cross-aisle corners
  const bolMat = new THREE.MeshStandardMaterial({ color: '#e8b300', roughness: 0.5 })
  for (const cx of CROSS_X) for (const z of [8.6, 33.8]) for (const dx of [-1.9, 1.9]) {
    const b = new THREE.Mesh(new THREE.CylinderGeometry(0.1, 0.1, 1, 12), bolMat); b.position.set(cx + dx, 0.5, z); b.castShadow = true; scene.add(b)
  }

  // the obstacle that blocks an aisle now and then: a fallen carton and cones
  const obstacle = new THREE.Group()
  const carton = new THREE.Mesh(new THREE.BoxGeometry(1.1, 0.7, 0.9), new THREE.MeshStandardMaterial({ color: '#c9a06b', roughness: 0.8 }))
  carton.position.set(0, 0.35, 0); carton.rotation.y = 0.5; carton.castShadow = true; obstacle.add(carton)
  const coneMat = new THREE.MeshStandardMaterial({ color: '#f97316', roughness: 0.5 })
  for (const dx of [-1.6, 1.6]) {
    const cone = new THREE.Mesh(new THREE.ConeGeometry(0.22, 0.7, 16), coneMat); cone.position.set(dx, 0.35, 0); cone.castShadow = true; obstacle.add(cone)
  }
  const ring = new THREE.Mesh(new THREE.RingGeometry(1.9, 2.15, 48), new THREE.MeshBasicMaterial({ color: '#ef4444', transparent: true, opacity: 0.8, side: THREE.DoubleSide }))
  ring.rotation.x = -Math.PI / 2; ring.position.y = 0.02; ring.name = 'pulse'; obstacle.add(ring)
  obstacle.visible = false
  scene.add(obstacle)
  return { obstacle }
}

// ── One cart ─────────────────────────────────────────────────────────────────

interface CartParts { root: THREE.Group; ring: THREE.MeshStandardMaterial; carriage: THREE.Group; load: THREE.Group; spot: THREE.Mesh; beacon: THREE.MeshStandardMaterial }

function buildCart(id: string): CartParts {
  const root = new THREE.Group(); root.name = id
  const body = new THREE.Mesh(new RoundedBoxGeometry(1.5, 0.42, 1.0, 3, 0.08), new THREE.MeshStandardMaterial({ color: '#eef1f4', roughness: 0.35, metalness: 0.15 }))
  body.position.set(-0.25, 0.27, 0); body.castShadow = true; root.add(body)
  const deck = new THREE.Mesh(new THREE.BoxGeometry(1.3, 0.04, 0.82), new THREE.MeshStandardMaterial({ color: '#262b33', roughness: 0.6 }))
  deck.position.set(-0.25, 0.5, 0); root.add(deck)
  const ringMat = new THREE.MeshStandardMaterial({ color: '#38bdf8', emissive: '#38bdf8', emissiveIntensity: 1.6 })
  const ring = new THREE.Mesh(new THREE.BoxGeometry(1.54, 0.04, 1.04), ringMat); ring.position.set(-0.25, 0.1, 0); root.add(ring)
  // mast at the rear, carriage + forks that travel up it
  const mastMat = new THREE.MeshStandardMaterial({ color: '#30363f', metalness: 0.6, roughness: 0.35 })
  for (const dz of [-0.36, 0.36]) {
    const post = new THREE.Mesh(new THREE.BoxGeometry(0.1, 4.6, 0.1), mastMat); post.position.set(0.48, 2.5, dz); post.castShadow = true; root.add(post)
  }
  const carriage = new THREE.Group()
  const plate = new THREE.Mesh(new THREE.BoxGeometry(0.08, 0.55, 0.85), new THREE.MeshStandardMaterial({ color: '#e8b300', roughness: 0.5 }))
  plate.position.set(0.56, 0.27, 0); carriage.add(plate)
  for (const dz of [-0.25, 0.25]) {
    const fork = new THREE.Mesh(new THREE.BoxGeometry(1.1, 0.05, 0.12), mastMat); fork.position.set(1.1, 0.02, dz); carriage.add(fork)
  }
  const load = new THREE.Group()
  const pal = new THREE.Mesh(new THREE.BoxGeometry(1.15, 0.14, 1.0), new THREE.MeshStandardMaterial({ color: '#b08457', roughness: 0.9 }))
  pal.position.set(1.1, 0.1, 0); pal.castShadow = true; load.add(pal)
  const box = new THREE.Mesh(new THREE.BoxGeometry(1.05, 0.8, 0.95), new THREE.MeshStandardMaterial({ color: '#c9a06b', roughness: 0.75 }))
  box.position.set(1.1, 0.57, 0); box.castShadow = true; load.add(box)
  load.visible = false; carriage.add(load)
  root.add(carriage)
  // lidar puck and a status beacon on top of the mast
  const lidar = new THREE.Mesh(new THREE.CylinderGeometry(0.1, 0.1, 0.12, 20), new THREE.MeshStandardMaterial({ color: '#0f1115', roughness: 0.3 }))
  lidar.position.set(-0.9, 0.56, 0); root.add(lidar)
  const beaconMat = new THREE.MeshStandardMaterial({ color: '#38bdf8', emissive: '#38bdf8', emissiveIntensity: 2.2 })
  const beacon = new THREE.Mesh(new THREE.SphereGeometry(0.09, 16, 12), beaconMat); beacon.position.set(0.48, 4.86, 0); root.add(beacon)
  // the blue safety spot projected on the floor ahead of the cart
  const spot = new THREE.Mesh(new THREE.CircleGeometry(0.32, 28), new THREE.MeshBasicMaterial({ color: '#3b82f6', transparent: true, opacity: 0.7 }))
  spot.rotation.x = -Math.PI / 2; spot.position.set(2.6, 0.015, 0); root.add(spot)
  return { root, ring: ringMat, carriage, load, spot, beacon: beaconMat }
}

// ── UI bits ──────────────────────────────────────────────────────────────────

const fmtT = (t: number) => `${String(Math.floor(t / 60)).padStart(2, '0')}:${String(Math.floor(t % 60)).padStart(2, '0')}`

function Kpi({ label, value, unit }: { label: string; value: string | number; unit?: string }) {
  return (
    <div className="rounded-xl border border-white/10 bg-black/55 px-3 py-2 backdrop-blur md:px-4 md:py-2.5">
      <p className="whitespace-nowrap text-[10px] font-medium uppercase tracking-[0.06em] text-white/55 md:text-[11px] md:tracking-[0.1em]">{label}</p>
      <p className="mt-0.5 text-[18px] font-semibold tabular-nums text-white md:text-[22px]">{value}<span className="ml-0.5 text-[12px] font-medium text-white/60 md:text-[13px]">{unit}</span></p>
    </div>
  )
}

function Battery({ pct }: { pct: number }) {
  const c = pct < 22 ? '#ef4444' : pct < 45 ? '#f59e0b' : '#22c55e'
  return (
    <span className="inline-flex items-center gap-1.5 tabular-nums">
      <span className="relative h-2 w-9 overflow-hidden rounded-sm bg-white/15"><span className="absolute inset-y-0 left-0" style={{ width: `${pct}%`, background: c }} /></span>
      <span className="text-[12px] text-white/75">{Math.round(pct)}%</span>
    </span>
  )
}

const LEVEL_DOT: Record<SimEvent['level'], string> = { info: '#94a3b8', ok: '#22c55e', warn: '#f59e0b', alert: '#ef4444' }

interface Snap { t: number; k: Kpis; agvs: Agv[]; events: SimEvent[]; sync: ErpSync | null; syncs: ErpSync[] }

function snapshot(s: Sim): Snap {
  return {
    t: s.t, k: kpis(s),
    agvs: s.agvs.map((a) => ({ ...a, pos: { ...a.pos }, route: [...a.route], order: a.order ? { ...a.order } : undefined })),
    events: s.events.slice(0, 30), sync: s.syncs[0] ?? null, syncs: s.syncs.slice(0, 6),
  }
}

// ── Component ────────────────────────────────────────────────────────────────

export default function AgvTwin({ onWant }: { onWant?: () => void }) {
  const mountRef = useRef<HTMLDivElement>(null)
  const labelsRef = useRef<HTMLDivElement>(null)
  const simRef = useRef<Sim | null>(null)
  const speedRef = useRef(2)
  const selRef = useRef<string | null>(null)
  const followRef = useRef(false)
  const [snap, setSnap] = useState<Snap | null>(null)
  const [sel, setSel] = useState<string | null>(null)
  const [follow, setFollow] = useState(false)
  const [speed, setSpeed] = useState(2)
  const [tab, setTab] = useState<'fleet' | 'events' | 'erp'>('fleet')
  const [erp, setErp] = useState<ErpTarget>('odoo')
  const [panelOpen, setPanelOpen] = useState(() => typeof window === 'undefined' || window.innerWidth >= 768)
  const [failed, setFailed] = useState(false)

  useEffect(() => { selRef.current = sel }, [sel])
  useEffect(() => { followRef.current = follow }, [follow])
  useEffect(() => { speedRef.current = speed }, [speed])

  useEffect(() => {
    const mount = mountRef.current
    if (!mount) return
    let renderer: THREE.WebGLRenderer
    try {
      renderer = new THREE.WebGLRenderer({ antialias: true, powerPreference: 'high-performance' })
    } catch {
      setFailed(true); return
    }
    renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, coarse ? 1.5 : 2))
    renderer.outputColorSpace = THREE.SRGBColorSpace
    renderer.toneMapping = THREE.ACESFilmicToneMapping
    renderer.toneMappingExposure = 1.05
    renderer.shadowMap.enabled = true
    renderer.shadowMap.type = THREE.PCFSoftShadowMap
    mount.appendChild(renderer.domElement)
    renderer.domElement.style.display = 'block'

    const scene = new THREE.Scene()
    scene.background = new THREE.Color('#0b0d10')
    scene.fog = new THREE.Fog('#0b0d10', 80, 170)
    const camera = new THREE.PerspectiveCamera(38, 1, 0.5, 400)
    // From the open side: +x reads left to right and the docks sit at the back.
    camera.position.set(38, 36, 70)
    const controls = new OrbitControls(camera, renderer.domElement)
    controls.target.set(30, 0, 18)
    controls.enableDamping = true
    controls.maxPolarAngle = 1.38
    controls.minDistance = 7
    controls.maxDistance = 120
    controls.autoRotate = false

    scene.add(new THREE.HemisphereLight('#dbe4f0', '#1a1d22', 0.75))
    const sun = new THREE.DirectionalLight('#ffffff', 1.9)
    sun.position.set(14, 46, 48); sun.target.position.set(30, 0, 18)
    sun.castShadow = true
    sun.shadow.mapSize.set(coarse ? 1024 : 2048, coarse ? 1024 : 2048)
    Object.assign(sun.shadow.camera, { left: -42, right: 42, top: 42, bottom: -42, near: 5, far: 120 })
    sun.shadow.bias = -0.0006
    scene.add(sun, sun.target)
    const fill = new THREE.DirectionalLight('#9fb4ff', 0.35); fill.position.set(60, 20, 50); scene.add(fill)

    const { obstacle } = buildWarehouse(scene)
    const sim = createSim(2026)
    // warm up so the first frame already shows a working shift
    for (let i = 0; i < 1500; i++) step(sim, 0.1)
    simRef.current = sim

    const carts = new Map<string, CartParts>()
    for (const a of sim.agvs) { const c = buildCart(a.id); carts.set(a.id, c); scene.add(c.root) }

    // routes on the floor: one line per cart
    const routeLines = new Map<string, THREE.Line>()
    for (const a of sim.agvs) {
      const line = new THREE.Line(new THREE.BufferGeometry(), new THREE.LineDashedMaterial({ color: '#5e6ad2', dashSize: 0.6, gapSize: 0.4, transparent: true, opacity: 0.45 }))
      line.position.y = 0.03; scene.add(line); routeLines.set(a.id, line)
    }

    // labels
    const labels = new Map<string, HTMLButtonElement>()
    const layer = labelsRef.current!
    for (const a of sim.agvs) {
      const el = document.createElement('button')
      el.type = 'button'
      el.className = 'agv-label'
      el.onclick = () => setSel(a.id)
      layer.appendChild(el); labels.set(a.id, el)
    }

    // picking: tap a cart
    const ray = new THREE.Raycaster(); const ndc = new THREE.Vector2()
    let down: { x: number; y: number } | null = null
    const onDown = (e: PointerEvent) => { down = { x: e.clientX, y: e.clientY } }
    const onUp = (e: PointerEvent) => {
      if (!down || Math.hypot(e.clientX - down.x, e.clientY - down.y) > 6) { down = null; return }
      down = null
      const r = renderer.domElement.getBoundingClientRect()
      ndc.set(((e.clientX - r.left) / r.width) * 2 - 1, -((e.clientY - r.top) / r.height) * 2 + 1)
      ray.setFromCamera(ndc, camera)
      const hit = ray.intersectObjects([...carts.values()].map((c) => c.root), true)[0]
      let o: THREE.Object3D | null = hit?.object ?? null
      while (o && !carts.has(o.name)) o = o.parent
      if (o) setSel(o.name)
    }
    renderer.domElement.addEventListener('pointerdown', onDown)
    renderer.domElement.addEventListener('pointerup', onUp)

    const resize = () => {
      const w = mount.clientWidth, h = mount.clientHeight
      renderer.setSize(w, h, false)
      renderer.domElement.style.width = '100%'; renderer.domElement.style.height = '100%'
      camera.aspect = w / Math.max(1, h)
      // keep the whole floor in frame on a narrow phone
      camera.fov = camera.aspect < 0.8 ? 55 : 38
      camera.updateProjectionMatrix()
    }
    const ro = new ResizeObserver(resize); ro.observe(mount); resize()
    // A phone held upright sees the whole floor from higher up, not a corner of it.
    if (camera.aspect < 0.8) { camera.position.set(30, 92, 62); controls.target.set(30, 0, 15); controls.update() }

    const clock = new THREE.Clock()
    const v = new THREE.Vector3()
    let raf = 0, lastSnap = 0
    const loop = () => {
      raf = requestAnimationFrame(loop)
      const dt = Math.min(0.1, clock.getDelta())
      const simDt = dt * speedRef.current
      for (let left = simDt; left > 0; left -= 0.05) step(sim, Math.min(0.05, left))

      for (const a of sim.agvs) {
        const c = carts.get(a.id)!
        c.root.position.set(a.pos.x, 0, a.pos.z)
        c.root.rotation.y = -a.heading
        const col = STATE_COLOR[a.state]
        c.ring.color.set(col); c.ring.emissive.set(col)
        c.beacon.color.set(col); c.beacon.emissive.set(col)
        c.beacon.emissiveIntensity = a.state === 'blocked' ? 1.2 + Math.sin(sim.t * 10) * 1.2 : 2.2
        const moving = a.state === 'toPick' || a.state === 'toDock' || a.state === 'toCharge'
        c.spot.visible = moving
        const lvl = a.order ? LEVEL_Y[a.order.level] : 0
        const y = a.state === 'picking' ? lvl * a.lift : a.state === 'dropping' ? 0.25 * (1 - a.lift) : a.loaded ? 0.25 : 0
        c.carriage.position.y += (y - c.carriage.position.y) * Math.min(1, dt * 4)
        c.load.visible = a.loaded || (a.state === 'picking' && a.lift > 0.8)
        // route
        const line = routeLines.get(a.id)!
        const pts = [a.pos, ...a.route].map((p) => new THREE.Vector3(p.x, 0, p.z))
        line.geometry.setFromPoints(pts.length > 1 ? pts : [])
        line.computeLineDistances()
        const m = line.material as THREE.LineDashedMaterial
        const isSel = selRef.current === a.id
        m.opacity = selRef.current ? (isSel ? 0.95 : 0.12) : 0.4
        m.color.set(isSel ? '#ffffff' : col)
        // label
        const el = labels.get(a.id)!
        v.set(a.pos.x, 5.4, a.pos.z).project(camera)
        const visible = v.z < 1 && Math.abs(v.x) < 1.1 && Math.abs(v.y) < 1.1
        el.style.display = visible ? '' : 'none'
        if (visible) {
          el.style.transform = `translate(-50%,-100%) translate(${(v.x * 0.5 + 0.5) * mount.clientWidth}px,${(-v.y * 0.5 + 0.5) * mount.clientHeight}px)`
          el.dataset.sel = isSel ? '1' : '0'
          el.innerHTML = `<span style="background:${col}"></span>${a.id}<em>${Math.round(a.battery)}%</em>`
        }
      }
      // obstacle
      if (sim.blocked && sim.t <= sim.blocked.until) {
        obstacle.visible = true
        obstacle.position.set((sim.blocked.x0 + sim.blocked.x1) / 2, 0, sim.blocked.z)
        const p = obstacle.getObjectByName('pulse') as THREE.Mesh
        const s = 1 + 0.15 * Math.sin(sim.t * 6); p.scale.set(s, s, s)
      } else obstacle.visible = false
      // follow
      if (followRef.current && selRef.current) {
        const a = sim.agvs.find((x) => x.id === selRef.current)
        if (a) {
          const off = camera.position.clone().sub(controls.target)
          controls.target.lerp(v.set(a.pos.x, 0, a.pos.z), 0.08)
          camera.position.copy(controls.target).add(off)
        }
      }
      controls.update()
      renderer.render(scene, camera)
      const now = performance.now()
      if (now - lastSnap > 250) { lastSnap = now; setSnap(snapshot(sim)) }
    }
    loop()

    return () => {
      cancelAnimationFrame(raf)
      ro.disconnect()
      renderer.domElement.removeEventListener('pointerdown', onDown)
      renderer.domElement.removeEventListener('pointerup', onUp)
      controls.dispose()
      scene.traverse((o) => {
        const mesh = o as THREE.Mesh
        mesh.geometry?.dispose?.()
        const mat = mesh.material as THREE.Material | THREE.Material[] | undefined
        for (const mm of Array.isArray(mat) ? mat : mat ? [mat] : []) { (mm as THREE.MeshStandardMaterial).map?.dispose(); mm.dispose() }
      })
      renderer.dispose()
      renderer.domElement.remove()
      layer.innerHTML = ''
    }
  }, [])

  const selected = useMemo(() => snap?.agvs.find((a) => a.id === sel) ?? null, [snap, sel])
  const payload = useMemo(() => (snap?.sync ? erpPayload(erp, snap.sync) : null), [snap?.sync, erp])

  if (failed) {
    return <div className="flex h-full items-center justify-center p-6 text-center text-white/80">3D is not available on this device. The warehouse twin needs WebGL.</div>
  }

  const tabBtn = (id: typeof tab, label: ReactNode) => (
    <button type="button" onClick={() => setTab(id)} className={`flex-1 rounded-lg px-2 py-1.5 text-[13px] font-medium ${tab === id ? 'bg-white/15 text-white' : 'text-white/60 hover:text-white'}`}>{label}</button>
  )

  return (
    <div className="relative h-full w-full overflow-hidden bg-[#0b0d10] text-white">
      <style>{`
        .agv-label{position:absolute;left:0;top:0;display:inline-flex;align-items:center;gap:6px;padding:3px 8px;border-radius:999px;background:rgba(10,12,16,.78);border:1px solid rgba(255,255,255,.14);font:600 11.5px/1.2 Inter,system-ui,sans-serif;color:#fff;white-space:nowrap;pointer-events:auto;cursor:pointer;backdrop-filter:blur(6px)}
        .agv-label span{width:7px;height:7px;border-radius:99px}
        .agv-label em{font-style:normal;font-weight:500;color:rgba(255,255,255,.65)}
        .agv-label[data-sel="1"]{background:#5e6ad2;border-color:#8b93e8}
      `}</style>
      <div ref={mountRef} className="absolute inset-0" />
      <div ref={labelsRef} className="pointer-events-none absolute inset-0 overflow-hidden" />

      {/* top-left: what this is, and the numbers */}
      <div className="pointer-events-none absolute left-3 top-3 right-3 md:left-4 md:top-4 md:right-[372px]">
        <div className="pointer-events-auto inline-flex items-center gap-2 rounded-full border border-white/10 bg-black/60 px-3 py-1.5 text-[12px] backdrop-blur">
          <span className="h-2 w-2 rounded-full bg-[#f59e0b]" />
          <span className="font-semibold">Simulated</span>
          <span className="text-white/60">· Demo DC · 6 AGVs · {snap ? fmtT(snap.t) : '00:00'}</span>
        </div>
        {snap && (
          <div className="mt-2 grid grid-cols-4 gap-1.5 md:mt-3 md:max-w-[620px] md:gap-2">
            <Kpi label="Orders/h" value={snap.k.ordersPerHour} />
            <Kpi label="On time" value={snap.k.onTimePct} unit="%" />
            <Kpi label="Fleet busy" value={snap.k.utilisationPct} unit="%" />
            <Kpi label="Battery" value={snap.k.avgBattery} unit="%" />
          </div>
        )}
        {selected && (
          <div className="pointer-events-auto mt-2 max-w-[360px] rounded-xl border border-white/10 bg-black/70 p-3 backdrop-blur md:mt-3 md:p-4">
            <div className="flex items-center justify-between gap-2">
              <p className="text-[15px] font-semibold md:text-[17px]">{selected.id}</p>
              <span className="rounded-full px-2 py-0.5 text-[11.5px] font-semibold" style={{ background: STATE_COLOR[selected.state] + '33', color: STATE_COLOR[selected.state] }}>{STATE_LABEL[selected.state]}</span>
            </div>
            <div className="mt-2 grid grid-cols-2 gap-x-4 gap-y-1 text-[12.5px] text-white/70 md:text-[13px]">
              <span>Battery</span><Battery pct={selected.battery} />
              <span>Today</span><span className="tabular-nums text-white/85">{(selected.distanceM / 1000).toFixed(2)} km · {selected.missions} missions</span>
              {selected.order && <><span>Order</span><span className="text-white/85">{selected.order.id}</span></>}
              {selected.order && <><span>Customer</span><span className="text-white/85">{selected.order.customer}</span></>}
              {selected.order && <><span>Route</span><span className="text-white/85">{selected.order.pick} → Dock {selected.order.dock + 1}</span></>}
            </div>
            <div className="mt-3 flex gap-2">
              <button type="button" onClick={() => setFollow((f) => !f)} className={`rounded-lg px-3 py-1.5 text-[12.5px] font-semibold ${follow ? 'bg-[#5e6ad2] text-white' : 'bg-white/10 text-white'}`}>{follow ? 'Following' : 'Follow'}</button>
              <button type="button" onClick={() => { setSel(null); setFollow(false) }} className="rounded-lg bg-white/10 px-3 py-1.5 text-[12.5px] text-white/80">Close</button>
            </div>
          </div>
        )}
      </div>

      {/* speed */}
      <div className="absolute bottom-3 left-3 flex items-center gap-1 rounded-full border border-white/10 bg-black/60 p-1 text-[12px] backdrop-blur md:bottom-4 md:left-4">
        {[1, 2, 4].map((x) => (
          <button key={x} type="button" onClick={() => setSpeed(x)} className={`rounded-full px-2.5 py-1 font-semibold ${speed === x ? 'bg-white text-black' : 'text-white/70'}`}>{x}×</button>
        ))}
      </div>

      {/* panel: fleet / events / ERP */}
      <button type="button" onClick={() => setPanelOpen((o) => !o)} className="absolute bottom-3 right-3 rounded-full border border-white/10 bg-black/70 px-3.5 py-2 text-[13px] font-semibold backdrop-blur md:hidden">
        {panelOpen ? 'Hide panel' : 'Fleet · Events · ERP'}
      </button>
      {panelOpen && snap && (
        <aside className="absolute inset-x-2 bottom-14 flex max-h-[46%] flex-col rounded-2xl border border-white/10 bg-black/75 backdrop-blur md:inset-x-auto md:bottom-4 md:right-4 md:top-4 md:max-h-none md:w-[352px]">
          <div className="flex gap-1 p-1.5">{tabBtn('fleet', 'Fleet')}{tabBtn('events', 'Events')}{tabBtn('erp', 'ERP sync')}</div>
          <div className="min-h-0 flex-1 overflow-y-auto px-3 pb-3">
            {tab === 'fleet' && (
              <ul className="space-y-1.5">
                {snap.agvs.map((a) => (
                  <li key={a.id}>
                    <button type="button" onClick={() => setSel(a.id)} className={`w-full rounded-xl border px-3 py-2 text-left ${sel === a.id ? 'border-[#8b93e8] bg-[#5e6ad2]/25' : 'border-white/10 bg-white/[0.04] hover:bg-white/[0.08]'}`}>
                      <div className="flex items-center justify-between">
                        <span className="text-[13.5px] font-semibold">{a.id}</span>
                        <span className="text-[11.5px] font-semibold" style={{ color: STATE_COLOR[a.state] }}>{STATE_LABEL[a.state]}</span>
                      </div>
                      <div className="mt-1 flex items-center justify-between text-[12px] text-white/60">
                        <span className="truncate">{a.order ? `${a.order.id} · ${a.order.pick} → D${a.order.dock + 1}` : a.state === 'charging' ? `Charger C${a.charger + 1}` : '—'}</span>
                        <Battery pct={a.battery} />
                      </div>
                    </button>
                  </li>
                ))}
                <li className="pt-1 text-[11.5px] text-white/45">{snap.k.queue} orders queued · {snap.k.done} delivered this shift</li>
              </ul>
            )}
            {tab === 'events' && (
              <ul className="space-y-1.5 text-[12.5px]">
                {snap.events.map((e, i) => (
                  <li key={`${e.t}-${i}`} className="flex gap-2">
                    <span className="mt-1.5 h-1.5 w-1.5 flex-none rounded-full" style={{ background: LEVEL_DOT[e.level] }} />
                    <span className="tabular-nums text-white/45">{fmtT(e.t)}</span>
                    <span className="text-white/85">{e.text}</span>
                  </li>
                ))}
              </ul>
            )}
            {tab === 'erp' && (
              <div>
                <div className="flex gap-1 rounded-lg bg-white/5 p-1">
                  {(['odoo', 'salesforce', 'webhook'] as ErpTarget[]).map((t) => (
                    <button key={t} type="button" onClick={() => setErp(t)} className={`flex-1 rounded-md px-2 py-1 text-[12px] font-semibold ${erp === t ? 'bg-white text-black' : 'text-white/70'}`}>
                      {t === 'odoo' ? 'Odoo' : t === 'salesforce' ? 'Salesforce' : 'Webhook'}
                    </button>
                  ))}
                </div>
                <p className="mt-2 text-[12px] leading-snug text-white/60">
                  Each delivered order closes itself in your system. This is the call it would make.
                </p>
                {payload && snap.sync ? (
                  <>
                    <p className="mt-2 text-[12px] text-white/80"><span className="font-semibold">{snap.sync.order.id}</span> · {snap.sync.agv} · {fmtT(snap.sync.t)}</p>
                    <pre className="mt-1.5 max-h-56 overflow-auto rounded-lg bg-black/60 p-2.5 text-[11px] leading-snug text-[#c7d2fe]"><code>{`${payload.method} ${payload.url}\n\n${JSON.stringify(payload.body, null, 2)}`}</code></pre>
                  </>
                ) : <p className="mt-2 text-[12px] text-white/50">Waiting for the first delivery…</p>}
                <ul className="mt-2 space-y-1 text-[12px] text-white/70">
                  {snap.syncs.map((s) => (
                    <li key={s.order.id + s.t} className="flex justify-between gap-2"><span>{s.order.id} → {erp === 'odoo' ? 'picking validated' : erp === 'salesforce' ? 'work order completed' : 'delivered'}</span><span className="text-[#22c55e]">✓</span></li>
                  ))}
                </ul>
                <p className="mt-2 text-[11px] text-white/45">Preview only: nothing is sent. In a real project it uses your endpoint and your API key.</p>
                {onWant && <button type="button" onClick={onWant} className="mt-3 w-full rounded-lg bg-[#5e6ad2] py-2 text-[13px] font-semibold">Connect it to our ERP</button>}
              </div>
            )}
          </div>
        </aside>
      )}
    </div>
  )
}
