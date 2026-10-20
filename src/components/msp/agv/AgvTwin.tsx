// ─── AGV fleet twin (simulated) ──────────────────────────────────────────────
// A distribution centre run by six narrow-aisle AGVs, in 3D, with what a
// warehouse manager reads in their WMS: every transfer order with its SSCC,
// SKU, rack location and dock, every truck with its load and cutoff, and the
// call each finished order would make to their ERP or CRM. Everything moving
// comes from sim.ts — seeded, so the same shift plays on every screen — and
// the page says so.
//
// The scene is plain three.js built in code (no model download): an insulated
// steel shed with trusses and high-bay lights, instanced racks and pallets that
// empty and fill as the sim picks and puts away, dock doors with trucks that
// arrive and leave, and carts with a turret head that turns and reaches into
// the rack. The React layer only reads a snapshot four times a second.

import { useEffect, useMemo, useRef, useState, type ReactNode } from 'react'
import * as THREE from 'three'
import { OrbitControls } from 'three/addons/controls/OrbitControls.js'
import { RoundedBoxGeometry } from 'three/addons/geometries/RoundedBoxGeometry.js'
import { RoomEnvironment } from 'three/addons/environments/RoomEnvironment.js'
import {
  createSim, step, kpis, erpPayload, seeded, find, clock, pointAt, runScenario, relocateS,
  SIZE, ROAD_Z, XW, XE, RACK_X0, RACK_X1, BAY_W, BAYS, LEVELS, RACK_ROWS, AISLES, AISLE_NAMES, LEVEL_Y,
  palletBottom, PIVOT, STAGE_Z, STUB_Z, DOCKS, CHARGERS, STATE_LABEL, ZONES,
  type Sim, type Agv, type AgvState, type ErpTarget, type Kpis, type SimEvent, type ErpSync, type Task, type Dock, type Pallet, type Found, type Wait, type ScenarioId,
} from './sim'

const STATE_COLOR: Record<AgvState, string> = {
  charging: '#22c55e', idle: '#94a3b8', parking: '#94a3b8', toCharge: '#f59e0b',
  toSource: '#38bdf8', atSource: '#a78bfa', toDest: '#5e6ad2', atDest: '#a78bfa',
}
const ROUTE_MAX = 400
const coarse = typeof window !== 'undefined' && window.matchMedia?.('(pointer: coarse)').matches

const waitText = (w: Wait | null): string | null => {
  if (!w) return null
  if (w.kind === 'agv') return `Waiting · ${w.id} ahead`
  if (w.kind === 'zone') return `Waiting · merge held by ${w.id}`
  if (w.kind === 'dock') return `Waiting · ${w.dock} staging lane busy`
  return 'Stopped · obstacle on its scanner'
}
const fmtSscc = (s: string) => `(00) ${s.slice(0, 1)} ${s.slice(1, 8)} ${s.slice(8, 17)} ${s.slice(17)}`

// ── Textures (canvas, built once) ────────────────────────────────────────────

function canvas(w: number, h: number): [HTMLCanvasElement, CanvasRenderingContext2D] {
  const c = document.createElement('canvas'); c.width = w; c.height = h
  return [c, c.getContext('2d')!]
}
function tex(c: HTMLCanvasElement, srgb = true): THREE.CanvasTexture {
  const t = new THREE.CanvasTexture(c)
  if (srgb) t.colorSpace = THREE.SRGBColorSpace
  t.anisotropy = 8
  return t
}

function floorTexture(): THREE.CanvasTexture {
  const PX = 32
  const [c, g] = canvas(SIZE.w * PX, SIZE.d * PX)
  const X = (x: number) => x * PX, Z = (z: number) => z * PX
  // polished concrete
  const grad = g.createLinearGradient(0, 0, c.width, c.height)
  grad.addColorStop(0, '#7d8186'); grad.addColorStop(1, '#6f7378')
  g.fillStyle = grad; g.fillRect(0, 0, c.width, c.height)
  const rnd = seeded(9)
  for (let i = 0; i < 3200; i++) {
    g.fillStyle = `rgba(${rnd() < 0.5 ? '255,255,255' : '20,20,20'},${0.01 + rnd() * 0.025})`
    g.beginPath(); g.arc(rnd() * c.width, rnd() * c.height, 4 + rnd() * 46, 0, 7); g.fill()
  }
  // tyre marks along the lanes
  g.strokeStyle = 'rgba(30,30,30,0.07)'; g.lineWidth = 6
  for (const z of [ROAD_Z, ...AISLES]) for (const o of [-0.35, 0.35]) { g.beginPath(); g.moveTo(X(XW), Z(z + o)); g.lineTo(X(XE), Z(z + o)); g.stroke() }
  // saw-cut joints every 6 m
  g.strokeStyle = 'rgba(0,0,0,0.22)'; g.lineWidth = 2
  for (let x = 0; x <= SIZE.w; x += 6) { g.beginPath(); g.moveTo(X(x), 0); g.lineTo(X(x), c.height); g.stroke() }
  for (let z = 0; z <= SIZE.d; z += 6) { g.beginPath(); g.moveTo(0, Z(z)); g.lineTo(c.width, Z(z)); g.stroke() }
  // AGV lanes: yellow edge lines
  g.strokeStyle = '#e8b300'; g.lineWidth = 5
  const hl = (x0: number, x1: number, z: number, w: number) => { for (const o of [-w, w]) { g.beginPath(); g.moveTo(X(x0), Z(z + o)); g.lineTo(X(x1), Z(z + o)); g.stroke() } }
  const vl = (x: number, z0: number, z1: number, w: number) => { for (const o of [-w, w]) { g.beginPath(); g.moveTo(X(x + o), Z(z0)); g.lineTo(X(x + o), Z(z1)); g.stroke() } }
  hl(XW - 1.6, XE + 1.6, ROAD_Z, 1.6)
  vl(XW, ROAD_Z + 1.6, AISLES[2] + 1.6, 1.6)
  vl(XE, ROAD_Z + 1.6, AISLES[2] + 1.6, 1.6)
  // one-way chevrons
  g.fillStyle = 'rgba(255,255,255,0.75)'
  const arrow = (x: number, z: number, ang: number) => {
    g.save(); g.translate(X(x), Z(z)); g.rotate(ang)
    g.beginPath(); g.moveTo(PX * 0.6, 0); g.lineTo(-PX * 0.3, -PX * 0.45); g.lineTo(-PX * 0.1, 0); g.lineTo(-PX * 0.3, PX * 0.45); g.closePath(); g.fill(); g.restore()
  }
  for (let x = 14; x < XE - 2; x += 7) arrow(x, ROAD_Z, Math.PI)
  for (const z of AISLES) for (let x = 11; x < XE - 2; x += 9) if (x < RACK_X0 - 0.5 || x > RACK_X1 + 0.5 || true) arrow(x, z, 0)
  for (let z = 9; z < AISLES[2]; z += 6) { arrow(XW, z, Math.PI / 2); arrow(XE, z + 3, -Math.PI / 2) }
  // give-way lines where aisles A and B join the east cross aisle
  g.strokeStyle = 'rgba(255,255,255,0.85)'; g.lineWidth = 4; g.setLineDash([10, 8])
  for (const r of ZONES) { g.beginPath(); g.moveTo(X(r.x0), Z(r.z0 + 0.4)); g.lineTo(X(r.x0), Z(r.z1 - 0.4)); g.stroke() }
  g.setLineDash([])
  // dock staging boxes
  for (const d of DOCKS) {
    g.fillStyle = d.kind === 'in' ? 'rgba(56,189,248,0.16)' : 'rgba(232,179,0,0.14)'
    g.fillRect(X(d.x - 0.9), Z(STAGE_Z - 0.75), X(1.8), Z(1.5))
    g.strokeStyle = d.kind === 'in' ? '#38bdf8' : '#e8b300'; g.lineWidth = 4
    g.strokeRect(X(d.x - 0.9), Z(STAGE_Z - 0.75), X(1.8), Z(1.5))
    // hatch between staging and door
    g.save(); g.beginPath(); g.rect(X(d.x - 1.5), Z(0.2), X(3), Z(1.6)); g.clip()
    g.strokeStyle = 'rgba(232,179,0,0.35)'; g.lineWidth = 6
    for (let k = -4; k < 8; k++) { g.beginPath(); g.moveTo(X(d.x - 1.5 + k * 0.5), Z(0.2)); g.lineTo(X(d.x - 1.5 + k * 0.5 + 1.6), Z(1.8)); g.stroke() }
    g.restore()
    g.fillStyle = 'rgba(255,255,255,0.9)'; g.font = `700 ${PX * 0.7}px Inter, system-ui, sans-serif`; g.textAlign = 'center'
    g.fillText(d.id, X(d.x), Z(STAGE_Z + 1.4))
  }
  // charger bays
  for (const [i, x] of CHARGERS.entries()) {
    g.fillStyle = 'rgba(34,197,94,0.16)'; g.fillRect(X(x - 0.75), Z(0.6), X(1.5), Z(4))
    g.strokeStyle = '#22c55e'; g.lineWidth = 3; g.strokeRect(X(x - 0.75), Z(0.6), X(1.5), Z(4))
    g.fillStyle = 'rgba(255,255,255,0.85)'; g.font = `700 ${PX * 0.5}px Inter, system-ui, sans-serif`; g.textAlign = 'center'
    g.fillText(`C${i + 1}`, X(x), Z(4.4))
  }
  // pedestrian walkway on the west side and a zebra over the road
  g.fillStyle = 'rgba(34,197,94,0.28)'; g.fillRect(X(0.4), Z(8), X(1.5), Z(19))
  g.strokeStyle = '#16a34a'; g.lineWidth = 3; g.strokeRect(X(0.4), Z(8), X(1.5), Z(19))
  g.fillStyle = 'rgba(255,255,255,0.8)'
  for (let k = 0; k < 6; k++) g.fillRect(X(3 + k * 0.55), Z(ROAD_Z - 1.6), X(0.3), Z(3.2))
  // aisle letters at the aisle mouths
  g.fillStyle = 'rgba(255,255,255,0.7)'; g.font = `800 ${PX * 1.2}px Inter, system-ui, sans-serif`; g.textAlign = 'center'
  AISLES.forEach((z, i) => g.fillText(AISLE_NAMES[i], X(10.6), Z(z) + PX * 0.45))
  return tex(c)
}

function panelTexture(): THREE.CanvasTexture {
  const [c, g] = canvas(256, 256)
  g.fillStyle = '#c9ced4'; g.fillRect(0, 0, 256, 256)
  for (let x = 0; x < 256; x += 32) {
    const gr = g.createLinearGradient(x, 0, x + 32, 0)
    gr.addColorStop(0, '#b8bdc4'); gr.addColorStop(0.5, '#d6dbe0'); gr.addColorStop(1, '#b3b8bf')
    g.fillStyle = gr; g.fillRect(x, 0, 32, 256)
  }
  const t = tex(c); t.wrapS = t.wrapT = THREE.RepeatWrapping
  return t
}

function cartonTexture(): THREE.CanvasTexture {
  const [c, g] = canvas(128, 128)
  g.fillStyle = '#ffffff'; g.fillRect(0, 0, 128, 128)
  g.strokeStyle = 'rgba(0,0,0,0.22)'; g.lineWidth = 2
  for (let y = 0; y <= 128; y += 32) { g.beginPath(); g.moveTo(0, y); g.lineTo(128, y); g.stroke() }
  for (let row = 0; row < 4; row++) for (let x = (row % 2) * 21; x <= 128; x += 42) { g.beginPath(); g.moveTo(x, row * 32); g.lineTo(x, row * 32 + 32); g.stroke() }
  g.fillStyle = 'rgba(0,0,0,0.12)'
  for (let row = 0; row < 4; row++) g.fillRect(8 + (row % 2) * 20, row * 32 + 12, 14, 6)
  return tex(c)
}

function textTexture(lines: string[], opts: { w?: number; h?: number; bg?: string; fg?: string; size?: number } = {}): THREE.CanvasTexture {
  const w = opts.w ?? 512, h = opts.h ?? 128
  const [c, g] = canvas(w, h)
  g.fillStyle = opts.bg ?? '#1e293b'; g.fillRect(0, 0, w, h)
  g.fillStyle = opts.fg ?? '#ffffff'; g.textAlign = 'center'; g.textBaseline = 'middle'
  const size = opts.size ?? h * 0.5
  lines.forEach((l, i) => { g.font = `${i === 0 ? 800 : 600} ${i === 0 ? size : size * 0.55}px Inter, system-ui, sans-serif`; g.fillText(l, w / 2, (h / (lines.length + 0.4)) * (i + 0.7)) })
  return tex(c)
}

// ── Static building ──────────────────────────────────────────────────────────

const WALL_H = 10.5

interface Building { roof: THREE.Group; doors: THREE.Mesh[]; slotPallets: THREE.InstancedMesh; slotLoads: THREE.InstancedMesh; obstacle: THREE.Group; lights: THREE.MeshStandardMaterial[]; dockLights: THREE.MeshStandardMaterial[]; chargerLeds: THREE.MeshStandardMaterial[] }

function std(color: string, roughness = 0.6, metalness = 0.1, extra: THREE.MeshStandardMaterialParameters = {}) {
  return new THREE.MeshStandardMaterial({ color, roughness, metalness, ...extra })
}
function box(w: number, h: number, d: number, mat: THREE.Material, x: number, y: number, z: number, parent: THREE.Object3D, shadow = true): THREE.Mesh {
  const m = new THREE.Mesh(new THREE.BoxGeometry(w, h, d), mat); m.position.set(x, y, z)
  m.castShadow = shadow; m.receiveShadow = true; parent.add(m); return m
}

/** A wooden pallet: three bottom runners, nine blocks, top boards. */
function palletGeometry(): THREE.BufferGeometry {
  const parts: THREE.BufferGeometry[] = []
  const add = (w: number, h: number, d: number, x: number, y: number, z: number) => { const g = new THREE.BoxGeometry(w, h, d); g.translate(x, y, z); parts.push(g) }
  for (const z of [-0.45, 0, 0.45]) add(1.2, 0.022, 0.1, 0, 0.011, z)
  for (const x of [-0.55, 0, 0.55]) for (const z of [-0.45, 0, 0.45]) add(0.12, 0.078, 0.12, x, 0.061, z)
  for (const x of [-0.55, -0.33, -0.11, 0.11, 0.33, 0.55]) add(0.1, 0.022, 1.0, x, 0.111, 0)
  return mergeGeometries(parts)
}
function mergeGeometries(parts: THREE.BufferGeometry[]): THREE.BufferGeometry {
  const pos: number[] = [], nor: number[] = [], uv: number[] = [], idx: number[] = []
  let base = 0
  for (const p of parts) {
    const g = p.index ? p : p
    pos.push(...(g.getAttribute('position').array as Float32Array))
    nor.push(...(g.getAttribute('normal').array as Float32Array))
    uv.push(...(g.getAttribute('uv').array as Float32Array))
    const ix = g.index!.array
    for (let i = 0; i < ix.length; i++) idx.push(ix[i] + base)
    base += g.getAttribute('position').count
    g.dispose()
  }
  const out = new THREE.BufferGeometry()
  out.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3))
  out.setAttribute('normal', new THREE.Float32BufferAttribute(nor, 3))
  out.setAttribute('uv', new THREE.Float32BufferAttribute(uv, 2))
  out.setIndex(idx)
  return out
}

let PALLET_GEO: THREE.BufferGeometry | null = null
let CARTON_TEX: THREE.CanvasTexture | null = null
const palletMat = () => std('#b0875a', 0.9)

function buildBuilding(scene: THREE.Scene, sim: Sim): Building {
  const rnd = seeded(31)
  // ground outside and the yard in front of the docks
  const ground = new THREE.Mesh(new THREE.PlaneGeometry(260, 220), std('#2c3036', 1))
  ground.rotation.x = -Math.PI / 2; ground.position.set(SIZE.w / 2, -0.05, SIZE.d / 2 - 30); ground.receiveShadow = true; scene.add(ground)
  const yard = new THREE.Mesh(new THREE.PlaneGeometry(SIZE.w + 20, 34), std('#3a3e44', 0.95))
  yard.rotation.x = -Math.PI / 2; yard.position.set(SIZE.w / 2, -0.02, -17); yard.receiveShadow = true; scene.add(yard)
  // yard bay lines
  const lineMat = std('#e5e7eb', 0.8)
  for (const d of DOCKS) for (const o of [-1.6, 1.6]) box(0.12, 0.01, 14, lineMat, d.x + o, 0, -8, scene, false)
  // floor slab
  const floor = new THREE.Mesh(new THREE.PlaneGeometry(SIZE.w, SIZE.d), new THREE.MeshStandardMaterial({ map: floorTexture(), roughness: 0.42, metalness: 0.05 }))
  floor.rotation.x = -Math.PI / 2; floor.position.set(SIZE.w / 2, 0, SIZE.d / 2); floor.receiveShadow = true; scene.add(floor)

  // walls: insulated panels on steel columns
  const panel = panelTexture()
  const wallMat = (len: number) => { const t = panel.clone(); t.needsUpdate = true; t.repeat.set(len / 4, 1); return new THREE.MeshStandardMaterial({ map: t, roughness: 0.55, metalness: 0.25 }) }
  const steel = std('#3b4552', 0.45, 0.6)
  const plinth = std('#8d939b', 0.9)
  // west and east walls
  for (const x of [0, SIZE.w]) {
    const w = new THREE.Mesh(new THREE.BoxGeometry(0.25, WALL_H, SIZE.d), wallMat(SIZE.d)); w.position.set(x, WALL_H / 2, SIZE.d / 2); w.receiveShadow = true; scene.add(w)
    const tm = w.material as THREE.MeshStandardMaterial; tm.map!.rotation = 0
    box(0.3, 1.0, SIZE.d, plinth, x, 0.5, SIZE.d / 2, scene)
    // translucent ridge light strip
    box(0.27, 0.9, SIZE.d - 2, std('#cfe3ff', 0.2, 0, { emissive: '#9cc2ff', emissiveIntensity: 0.25, transparent: true, opacity: 0.85 }), x, WALL_H - 1.4, SIZE.d / 2, scene, false)
  }
  // back wall (camera side) kept low so the floor reads from outside
  box(SIZE.w, 1.2, 0.25, plinth, SIZE.w / 2, 0.6, SIZE.d, scene)
  // dock wall with door openings
  const dockWall = wallMat(SIZE.w)
  const doors: THREE.Mesh[] = []
  let x0 = 0
  for (const dx of [...DOCKS.map((d) => d.x), SIZE.w + 1.6]) {
    const x1 = dx - 1.6
    if (x1 > x0) { const m = new THREE.Mesh(new THREE.BoxGeometry(x1 - x0, WALL_H, 0.25), dockWall); m.position.set((x0 + x1) / 2, WALL_H / 2, 0); m.receiveShadow = true; m.castShadow = true; scene.add(m) }
    x0 = dx + 1.6
  }
  for (const d of DOCKS) {
    box(3.2, WALL_H - 3.4, 0.25, dockWall, d.x, 3.4 + (WALL_H - 3.4) / 2, 0, scene)
    // roller door (opens into the header when a truck is at the door), leveler, shelter
    doors.push(box(3.0, 3.3, 0.08, std('#c3c9d0', 0.5, 0.3), d.x, 1.65, 0.08, scene))
    box(2.4, 0.06, 0.9, std('#6b7280', 0.6, 0.6), d.x, 0.03, 0.35, scene)
    for (const o of [-1.55, 1.55]) box(0.3, 3.4, 0.6, std('#111418', 0.9), d.x + o, 1.7, -0.35, scene)
    box(3.4, 0.4, 0.6, std('#111418', 0.9), d.x, 3.6, -0.35, scene)
    // dock number board
    const sign = new THREE.Mesh(new THREE.PlaneGeometry(1.4, 0.7), new THREE.MeshBasicMaterial({ map: textTexture([d.id, d.kind === 'in' ? 'RECEIVING' : 'SHIPPING'], { w: 256, h: 128, bg: d.kind === 'in' ? '#0c4a6e' : '#1e293b' }) }))
    sign.position.set(d.x, 4.2, 0.15); scene.add(sign)
  }
  // columns along the walls every 6 m, and roof trusses
  for (let x = 6; x < SIZE.w; x += 6) {
    for (const z of [0.35, SIZE.d - 0.3]) box(0.35, z > 1 ? 1.2 : WALL_H, 0.35, steel, x, (z > 1 ? 1.2 : WALL_H) / 2, z, scene)
  }
  for (let z = 6; z < SIZE.d; z += 6) for (const x of [0.35, SIZE.w - 0.35]) box(0.35, WALL_H, 0.35, steel, x, WALL_H / 2, z, scene)
  const truss = std('#4b5563', 0.5, 0.6)
  // roof steel and lights: hidden when the camera comes in close
  const roof = new THREE.Group(); roof.name = 'roof'; scene.add(roof)
  const lights: THREE.MeshStandardMaterial[] = []
  const lampMat = std('#fff7e6', 0.3, 0, { emissive: '#fff3d6', emissiveIntensity: 2.2 })
  lights.push(lampMat)
  for (let x = 6; x < SIZE.w; x += 6) {
    box(0.2, 0.25, SIZE.d, truss, x, WALL_H + 0.1, SIZE.d / 2, roof, false)
    box(0.12, 0.12, SIZE.d, truss, x, WALL_H - 0.9, SIZE.d / 2, roof, false)
    for (let z = 3; z < SIZE.d; z += 3) {
      const diag = box(0.06, 1.15, 0.06, truss, x, WALL_H - 0.4, z, roof, false); diag.rotation.x = (z / 3) % 2 ? 0.6 : -0.6
    }
    // high-bay lights hanging between trusses
    for (let z = 4.5; z < SIZE.d; z += 7) {
      box(0.02, 0.6, 0.02, truss, x + 3, WALL_H - 1.2, z, roof, false)
      const lamp = new THREE.Mesh(new THREE.CylinderGeometry(0.2, 0.26, 0.12, 16), lampMat); lamp.position.set(x + 3, WALL_H - 1.55, z); roof.add(lamp)
    }
  }
  for (let z = 0; z <= SIZE.d; z += 6) box(SIZE.w, 0.18, 0.12, truss, SIZE.w / 2, WALL_H + 0.1, z, roof, false)

  // racks
  const upGeo = new THREE.BoxGeometry(0.09, 5.1, 0.09)
  const beamGeo = new THREE.BoxGeometry(BAY_W, 0.12, 0.06)
  const braceGeo = new THREE.BoxGeometry(0.04, 1.2, 0.04)
  const upCount = RACK_ROWS.length * (BAYS + 1) * 2
  const ups = new THREE.InstancedMesh(upGeo, std('#2f6fb5', 0.45, 0.5), upCount)
  const beams = new THREE.InstancedMesh(beamGeo, std('#e5671e', 0.5, 0.35), RACK_ROWS.length * BAYS * LEVELS * 2)
  const braces = new THREE.InstancedMesh(braceGeo, std('#2f6fb5', 0.45, 0.5), RACK_ROWS.length * (BAYS + 1) * 4)
  const m = new THREE.Matrix4(), q = new THREE.Quaternion(), sc = new THREE.Vector3(1, 1, 1), pos = new THREE.Vector3(), e = new THREE.Euler()
  let iu = 0, ib = 0, ibr = 0
  for (const rz of RACK_ROWS) {
    for (let b = 0; b <= BAYS; b++) {
      const x = RACK_X0 + b * BAY_W
      for (const dz of [-0.5, 0.5]) { m.compose(pos.set(x, 2.55, rz + dz), q.identity(), sc); ups.setMatrixAt(iu++, m) }
      for (let k = 0; k < 4; k++) { e.set(k % 2 ? 0.7 : -0.7, 0, 0); m.compose(pos.set(x, 0.7 + k * 1.15, rz), q.setFromEuler(e), sc); braces.setMatrixAt(ibr++, m) }
    }
    for (let b = 0; b < BAYS; b++) for (let l = 0; l < LEVELS; l++) for (const dz of [-0.5, 0.5]) {
      m.compose(pos.set(RACK_X0 + (b + 0.5) * BAY_W, LEVEL_Y[l], rz + dz), q.identity(), sc); beams.setMatrixAt(ib++, m)
    }
  }
  for (const im of [ups, beams, braces]) { im.castShadow = true; im.receiveShadow = true; im.instanceMatrix.needsUpdate = true; scene.add(im) }
  // yellow rack-end guards and column protectors
  const guard = std('#e8b300', 0.5, 0.2)
  for (const rz of RACK_ROWS) for (const x of [RACK_X0 - 0.25, RACK_X1 + 0.25]) box(0.12, 0.4, 1.2, guard, x, 0.2, rz, scene)
  // aisle signs hanging at the aisle mouths
  AISLES.forEach((z, i) => {
    const s = new THREE.Mesh(new THREE.PlaneGeometry(1.6, 0.9), new THREE.MeshBasicMaterial({ map: textTexture([`AISLE ${AISLE_NAMES[i]}`, `${AISLE_NAMES[i]}-01 → ${AISLE_NAMES[i]}-${BAYS * 2}`], { w: 256, h: 144, bg: '#0f172a' }), side: THREE.DoubleSide }))
    s.position.set(RACK_X0 - 0.6, 6, z); s.rotation.y = Math.PI / 2; scene.add(s)
  })

  // pallets in the rack: one instance per slot (empties are scaled to 0), plus the back row
  PALLET_GEO ??= palletGeometry()
  CARTON_TEX ??= cartonTexture()
  const n = sim.slots.length
  const slotPallets = new THREE.InstancedMesh(PALLET_GEO, palletMat(), n)
  const slotLoads = new THREE.InstancedMesh(new THREE.BoxGeometry(1.1, 1, 0.96), new THREE.MeshStandardMaterial({ map: CARTON_TEX, roughness: 0.75 }), n)
  for (let i = 0; i < n; i++) placeSlot(sim, i, slotPallets, slotLoads)
  for (const im of [slotPallets, slotLoads]) { im.castShadow = true; im.receiveShadow = true; scene.add(im) }
  const back = RACK_ROWS[0]
  const bp = new THREE.InstancedMesh(PALLET_GEO, palletMat(), BAYS * 2 * LEVELS)
  const bl = new THREE.InstancedMesh(new THREE.BoxGeometry(1.1, 1, 0.96), new THREE.MeshStandardMaterial({ map: CARTON_TEX, roughness: 0.75 }), BAYS * 2 * LEVELS)
  let k = 0
  for (let p = 0; p < BAYS * 2; p++) for (let l = 0; l < LEVELS; l++) {
    const x = RACK_X0 + BAY_W * (Math.floor(p / 2) + 0.5) + (p % 2 ? 0.66 : -0.66)
    const y = palletBottom(l), h = 0.8 + rnd() * 0.6
    m.compose(pos.set(x, y, back), q.identity(), sc); bp.setMatrixAt(k, m)
    m.compose(pos.set(x, y + 0.122 + h / 2, back), q.identity(), new THREE.Vector3(1, h, 1)); bl.setMatrixAt(k, m)
    bl.setColorAt(k, new THREE.Color(['#c9a06b', '#d2b48c', '#e7e2d6', '#9fb3c8'][Math.floor(rnd() * 4)]))
    k++
  }
  for (const im of [bp, bl]) { im.castShadow = true; im.receiveShadow = true; scene.add(im) }

  // chargers on the dock wall
  const chargerLeds: THREE.MeshStandardMaterial[] = []
  for (const x of CHARGERS) {
    box(0.7, 1.4, 0.35, std('#e5e7eb', 0.4, 0.2), x, 0.9, 0.35, scene)
    box(0.5, 0.18, 0.02, std('#0f172a', 0.4), x, 1.3, 0.54, scene, false)
    const led = std('#22c55e', 0.3, 0, { emissive: '#22c55e', emissiveIntensity: 1.5 }); chargerLeds.push(led)
    box(0.42, 0.05, 0.02, led, x, 1.05, 0.54, scene, false)
    box(0.9, 0.02, 1.0, std('#4b5563', 0.4, 0.6), x, 0.01, 1.4, scene, false) // floor contacts
  }
  // dock traffic lights
  const dockLights: THREE.MeshStandardMaterial[] = []
  for (const d of DOCKS) {
    box(0.22, 0.5, 0.12, std('#111418', 0.5), d.x + 1.9, 2.6, 0.2, scene, false)
    const lm = std('#22c55e', 0.3, 0, { emissive: '#22c55e', emissiveIntensity: 2 }); dockLights.push(lm)
    const bulb = new THREE.Mesh(new THREE.SphereGeometry(0.08, 12, 8), lm); bulb.position.set(d.x + 1.9, 2.6, 0.28); scene.add(bulb)
  }
  // control room: a glazed office in the north-west corner, with a warm light
  const glass = new THREE.MeshPhysicalMaterial({ color: '#a8c7e6', roughness: 0.05, metalness: 0, transmission: 0.6, transparent: true, opacity: 0.35 })
  box(7, 3, 7, glass, 4, 1.5, 31.5, scene, false)
  box(7.1, 0.2, 7.1, std('#e5e7eb', 0.6), 4, 3.1, 31.5, scene)
  box(6.8, 0.02, 6.8, std('#5b6470', 0.8), 4, 0.02, 31.5, scene, false)
  for (const [dx, dz] of [[-1.6, -1.2], [1.2, -1.2], [-1.6, 1.4]]) {
    box(1.6, 0.06, 0.7, std('#f1f5f9', 0.5), 4 + dx, 0.75, 31.5 + dz, scene)
    box(0.55, 0.36, 0.03, std('#0b1220', 0.3, 0, { emissive: '#3b82f6', emissiveIntensity: 0.6 }), 4 + dx, 1.05, 31.5 + dz - 0.2, scene, false)
  }
  const sign = new THREE.Mesh(new THREE.PlaneGeometry(3, 0.6), new THREE.MeshBasicMaterial({ map: textTexture(['CONTROL ROOM'], { w: 512, h: 96, bg: '#0f172a' }) }))
  sign.position.set(4, 2.7, 27.95); sign.rotation.y = Math.PI; scene.add(sign)
  const warm = new THREE.PointLight('#ffd9a0', 6, 10, 2); warm.position.set(4, 2.6, 31.5); scene.add(warm)
  // battery and spare-parts corner: shelving with boxes
  for (let i = 0; i < 3; i++) {
    box(2.2, 2, 0.6, std('#64748b', 0.6, 0.4), 54 + i * 0 + 0, 1, 31 + i * 1.6, scene)
    for (let l = 0; l < 3; l++) box(2, 0.4, 0.5, std(['#e2b46f', '#94a3b8', '#d1d5db'][l], 0.8), 54, 0.3 + l * 0.7, 31 + i * 1.6, scene)
  }
  // people: two in hi-vis by the docks, one on the walkway
  for (const [x, z, ry] of [[DOCKS[1].x + 1.7, 1.4, 0.4], [DOCKS[4].x - 1.7, 1.6, -0.5], [1.1, 18, 0]] as const) scene.add(person(x, z, ry))

  // the obstacle that blocks an aisle now and then: a fallen carton, cones and a person
  const obstacle = new THREE.Group()
  const carton = new THREE.Mesh(new THREE.BoxGeometry(0.8, 0.5, 0.6), new THREE.MeshStandardMaterial({ map: CARTON_TEX, color: '#c9a06b', roughness: 0.8 }))
  carton.position.set(0.3, 0.25, 0.2); carton.rotation.set(0, 0.6, 0.1); carton.castShadow = true; obstacle.add(carton)
  for (let k2 = 0; k2 < 5; k2++) { const b = new THREE.Mesh(new THREE.BoxGeometry(0.3, 0.2, 0.25), carton.material); b.position.set(-0.4 + k2 * 0.3, 0.1, -0.4 + (k2 % 2) * 0.6); b.rotation.y = k2; b.castShadow = true; obstacle.add(b) }
  const coneMat = std('#f97316', 0.5)
  for (const dx of [-1.6, 1.6]) {
    const cone = new THREE.Mesh(new THREE.ConeGeometry(0.2, 0.7, 16), coneMat); cone.position.set(dx, 0.35, 0); cone.castShadow = true; obstacle.add(cone)
  }
  obstacle.add(person(1.0, -0.9, 2.4))
  const ring = new THREE.Mesh(new THREE.RingGeometry(2.0, 2.2, 48), new THREE.MeshBasicMaterial({ color: '#ef4444', transparent: true, opacity: 0.8, side: THREE.DoubleSide }))
  ring.rotation.x = -Math.PI / 2; ring.position.y = 0.02; ring.name = 'pulse'; obstacle.add(ring)
  obstacle.visible = false
  scene.add(obstacle)
  return { roof: scene.getObjectByName('roof') as THREE.Group, doors, slotPallets, slotLoads, obstacle, lights, dockLights, chargerLeds }
}

function person(x: number, z: number, ry: number): THREE.Group {
  const g = new THREE.Group()
  const legs = new THREE.Mesh(new THREE.CapsuleGeometry(0.13, 0.6, 4, 8), std('#1f2937', 0.8)); legs.position.y = 0.45; g.add(legs)
  const torso = new THREE.Mesh(new THREE.CapsuleGeometry(0.2, 0.45, 4, 10), std('#facc15', 0.6, 0, { emissive: '#3a3000', emissiveIntensity: 0.4 })); torso.position.y = 1.15; g.add(torso)
  const head = new THREE.Mesh(new THREE.SphereGeometry(0.12, 14, 10), std('#d6a77a', 0.7)); head.position.y = 1.62; g.add(head)
  const helmet = new THREE.Mesh(new THREE.SphereGeometry(0.135, 14, 8, 0, Math.PI * 2, 0, Math.PI / 2), std('#f8fafc', 0.4)); helmet.position.y = 1.66; g.add(helmet)
  g.traverse((o) => { (o as THREE.Mesh).castShadow = true })
  g.position.set(x, 0, z); g.rotation.y = ry
  return g
}

const color = new THREE.Color()
const mtx = new THREE.Matrix4(), qq = new THREE.Quaternion(), vv = new THREE.Vector3(), ss = new THREE.Vector3()

function placeSlot(sim: Sim, i: number, pallets: THREE.InstancedMesh, loads: THREE.InstancedMesh): void {
  const sl = sim.slots[i]
  const p = sl.pallet
  const y = palletBottom(sl.level)
  if (!p) {
    mtx.compose(vv.set(sl.x, y, sl.rz), qq.identity(), ss.set(0, 0, 0)); pallets.setMatrixAt(i, mtx); loads.setMatrixAt(i, mtx)
  } else {
    mtx.compose(vv.set(sl.x, y, sl.rz), qq.identity(), ss.set(1, 1, 1)); pallets.setMatrixAt(i, mtx)
    mtx.compose(vv.set(sl.x, y + 0.122 + p.h / 2, sl.rz), qq.identity(), ss.set(1, p.h, 1)); loads.setMatrixAt(i, mtx)
    loads.setColorAt(i, color.set(p.sku.color))
  }
  pallets.instanceMatrix.needsUpdate = true; loads.instanceMatrix.needsUpdate = true
  if (loads.instanceColor) loads.instanceColor.needsUpdate = true
}

/** A pallet with its load, as one movable group (on a fork, on a dock lane). */
function palletGroup(): { g: THREE.Group; load: THREE.Mesh; set: (p: Pallet | null) => void } {
  const g = new THREE.Group()
  const base = new THREE.Mesh(PALLET_GEO!, palletMat()); base.castShadow = true; g.add(base)
  const load = new THREE.Mesh(new THREE.BoxGeometry(1.1, 1, 0.96), new THREE.MeshStandardMaterial({ map: CARTON_TEX!, roughness: 0.75 })); load.castShadow = true; g.add(load)
  // shipping label on the front face
  const label = new THREE.Mesh(new THREE.PlaneGeometry(0.22, 0.16), new THREE.MeshBasicMaterial({ color: '#ffffff' })); label.name = 'label'; g.add(label)
  let last = ''
  const set = (p: Pallet | null) => {
    g.visible = !!p
    if (!p || p.sscc === last) return
    last = p.sscc
    load.scale.set(1, p.h, 1); load.position.y = 0.122 + p.h / 2
    ;(load.material as THREE.MeshStandardMaterial).color.set(p.sku.color)
    label.position.set(0.551, 0.122 + p.h * 0.6, 0); label.rotation.y = Math.PI / 2
  }
  g.visible = false
  return { g, load, set }
}

// ── One cart ─────────────────────────────────────────────────────────────────

interface CartParts {
  root: THREE.Group; strip: THREE.MeshStandardMaterial; beacon: THREE.MeshStandardMaterial
  carriage: THREE.Group; turret: THREE.Group; forks: THREE.Group; load: ReturnType<typeof palletGroup>
  spot: THREE.Mesh; field: THREE.Mesh; fieldMat: THREE.MeshBasicMaterial; heading: number
}

function buildCart(id: string): CartParts {
  const root = new THREE.Group(); root.name = id
  const body = std('#eef1f4', 0.35, 0.15)
  const dark = std('#1f242b', 0.5, 0.3)
  const chassis = new THREE.Mesh(new RoundedBoxGeometry(1.65, 0.5, 1.1, 3, 0.08), body)
  chassis.position.set(-0.375, 0.32, 0); chassis.castShadow = true; root.add(chassis)
  box(1.7, 0.12, 1.14, dark, -0.375, 0.1, 0, root) // bumper skirt
  const strip = std('#38bdf8', 0.3, 0, { emissive: '#38bdf8', emissiveIntensity: 1.6 })
  box(1.67, 0.035, 1.12, strip, -0.375, 0.45, 0, root, false)
  // safety scanners at two corners, warning plate, wheels
  for (const [x, z] of [[-1.17, 0.5], [0.4, -0.5]]) { const s = new THREE.Mesh(new THREE.CylinderGeometry(0.07, 0.07, 0.1, 14), dark); s.position.set(x, 0.26, z); root.add(s) }
  const id2 = new THREE.Mesh(new THREE.PlaneGeometry(0.6, 0.18), new THREE.MeshBasicMaterial({ map: textTexture([id], { w: 256, h: 76, bg: '#111827' }) }))
  id2.position.set(-0.6, 0.38, 0.556); root.add(id2)
  const id3 = id2.clone(); id3.position.z = -0.556; id3.rotation.y = Math.PI; root.add(id3)
  // mast
  const mast = std('#30363f', 0.35, 0.6)
  for (const dz of [-0.42, 0.42]) box(0.12, 5.3, 0.12, mast, 0.5, 2.75, dz, root)
  box(0.12, 0.12, 0.96, mast, 0.5, 5.36, 0, root)
  box(0.12, 0.12, 0.96, mast, 0.5, 2.6, 0, root, false)
  // carriage (lifts) → turret (turns) → forks (reach)
  const carriage = new THREE.Group(); carriage.position.set(PIVOT, 0.22, 0)
  const head = std('#e8b300', 0.45, 0.2)
  box(0.22, 0.62, 0.92, head, -0.28, 0.25, 0, carriage, true)
  const turret = new THREE.Group(); carriage.add(turret)
  box(0.42, 0.1, 0.42, dark, 0, 0.55, 0, turret, false)
  const forks = new THREE.Group(); turret.add(forks)
  box(0.08, 0.55, 0.85, head, -0.16, 0.26, 0, forks)
  for (const dz of [-0.26, 0.26]) box(1.1, 0.045, 0.12, mast, 0.4, -0.022, dz, forks)
  const load = palletGroup(); load.g.position.set(0.4, -0.02, 0); forks.add(load.g)
  root.add(carriage)
  // lidar, beacon
  const lidar = new THREE.Mesh(new THREE.CylinderGeometry(0.1, 0.1, 0.12, 20), dark); lidar.position.set(-0.95, 0.63, 0); root.add(lidar)
  const beacon = std('#38bdf8', 0.3, 0, { emissive: '#38bdf8', emissiveIntensity: 2.2 })
  const bm = new THREE.Mesh(new THREE.CylinderGeometry(0.07, 0.07, 0.16, 14), beacon); bm.position.set(0.5, 5.52, 0); root.add(bm)
  // blue warning spot projected ahead, and the scanner's protective field
  const spot = new THREE.Mesh(new THREE.CircleGeometry(0.3, 28), new THREE.MeshBasicMaterial({ color: '#3b82f6', transparent: true, opacity: 0.75 }))
  spot.rotation.x = -Math.PI / 2; spot.position.set(3.0, 0.016, 0); root.add(spot)
  const fieldMat = new THREE.MeshBasicMaterial({ color: '#22c55e', transparent: true, opacity: 0.12, side: THREE.DoubleSide, depthWrite: false })
  const field = new THREE.Mesh(new THREE.CircleGeometry(1, 32, -0.6, 1.2), fieldMat)
  field.rotation.x = -Math.PI / 2; field.position.set(1.9, 0.012, 0); root.add(field)
  return { root, strip, beacon, carriage, turret, forks, load, spot, field, fieldMat, heading: 0 }
}

// ── Truck ────────────────────────────────────────────────────────────────────

const CARRIER_COLOR: Record<string, string> = { 'Transportes Ebro': '#0f766e', 'Nordline Freight': '#1d4ed8', 'Medi Cargo': '#b91c1c', 'Iber Express': '#ea580c' }

/** Pallet positions in the trailer, nose first: two across, 1.25 m rows. */
const trailerSlot = (i: number) => ({ x: i % 2 ? 0.62 : -0.62, z: -13.45 + 0.7 + Math.floor(i / 2) * 1.25 })

function buildTruck(): { g: THREE.Group; setLivery: (carrier: string, plate: string) => void; setOpen: (k: number) => void; load: ReturnType<typeof palletGroup>[] } {
  const g = new THREE.Group()
  const trailerMat = new THREE.MeshStandardMaterial({ color: '#f3f4f6', roughness: 0.45, metalness: 0.1, transparent: true })
  const side = new THREE.MeshStandardMaterial({ roughness: 0.5, transparent: true })
  const trailer = new THREE.Mesh(new THREE.BoxGeometry(2.55, 2.8, 13.2), [side, side, trailerMat, trailerMat, trailerMat, trailerMat])
  trailer.position.set(0, 2.55, -6.9); trailer.castShadow = true; g.add(trailer)
  box(2.4, 0.25, 12.6, std('#374151', 0.6, 0.5), 0, 1.05, -6.9, g)
  const cabMat = std('#e5e7eb', 0.35, 0.3)
  const cab = new THREE.Mesh(new RoundedBoxGeometry(2.45, 2.7, 2.3, 3, 0.15), cabMat); cab.position.set(0, 2.05, -15.0); cab.castShadow = true; g.add(cab)
  box(2.2, 0.9, 0.05, std('#0f172a', 0.1, 0.5), 0, 2.6, -16.17, g, false)
  // the load, visible through the trailer while it is at the door
  const load = Array.from({ length: 22 }, (_, i) => { const p = palletGroup(); const sl = trailerSlot(i); p.g.position.set(sl.x, 1.2, sl.z); p.g.rotation.y = Math.PI / 2; g.add(p.g); return p })
  const setOpen = (k: number) => {
    // see-through at the door so the loading reads, solid on the road
    trailerMat.opacity = side.opacity = 1 - 0.72 * k
    trailerMat.depthWrite = side.depthWrite = k < 0.5
  }
  const wheel = new THREE.CylinderGeometry(0.5, 0.5, 0.35, 20); wheel.rotateZ(Math.PI / 2)
  const tyre = std('#111111', 0.9)
  for (const z of [-11.3, -12.6, -13.9, -15.3]) for (const x of [-1.05, 1.05]) { const w = new THREE.Mesh(wheel, tyre); w.position.set(x, 0.5, z); w.castShadow = true; g.add(w) }
  let last = ''
  const setLivery = (carrier: string, plate: string) => {
    if (carrier + plate === last) return
    last = carrier + plate
    side.map?.dispose()
    side.map = textTexture([carrier.toUpperCase(), plate], { w: 1024, h: 220, bg: CARRIER_COLOR[carrier] ?? '#334155' })
    side.needsUpdate = true
    cabMat.color.set(CARRIER_COLOR[carrier] ?? '#e5e7eb')
  }
  return { g, setLivery, setOpen, load }
}

// ── UI bits ──────────────────────────────────────────────────────────────────

const fmtT = (t: number) => `${String(Math.floor(t / 60)).padStart(2, '0')}:${String(Math.floor(t % 60)).padStart(2, '0')}`

function Kpi({ label, value, unit }: { label: string; value: string | number; unit?: string }) {
  return (
    <div className="rounded-xl border border-white/10 bg-black/55 px-2.5 py-1.5 backdrop-blur md:px-3.5 md:py-2">
      <p className="whitespace-nowrap text-[9.5px] font-medium uppercase tracking-[0.06em] text-white/55 md:text-[10.5px] md:tracking-[0.1em]">{label}</p>
      <p className="mt-0.5 text-[16px] font-semibold tabular-nums text-white md:text-[20px]">{value}<span className="ml-0.5 text-[11px] font-medium text-white/60 md:text-[12px]">{unit}</span></p>
    </div>
  )
}

function Battery({ pct }: { pct: number }) {
  const c = pct < 28 ? '#ef4444' : pct < 45 ? '#f59e0b' : '#22c55e'
  return (
    <span className="inline-flex items-center gap-1.5 tabular-nums">
      <span className="relative h-2 w-9 overflow-hidden rounded-sm bg-white/15"><span className="absolute inset-y-0 left-0" style={{ width: `${pct}%`, background: c }} /></span>
      <span className="text-[12px] text-white/75">{Math.round(pct)}%</span>
    </span>
  )
}

const TypePill = ({ t }: { t: Task }) => (
  <span className={`rounded px-1.5 py-px text-[10.5px] font-bold tracking-wide ${t.type === 'PICK' ? 'bg-[#5e6ad2]/30 text-[#c7cbff]' : 'bg-[#0ea5e9]/25 text-[#bae6fd]'}`}>{t.type}</span>
)
const Prio = ({ p }: { p: number }) => p === 1 ? <span className="rounded bg-[#ea580c]/30 px-1.5 py-px text-[10.5px] font-bold text-[#fdba74]">P1</span> : null

const STEPS: { key: Task['status']; label: string }[] = [
  { key: 'assigned', label: 'Assigned' }, { key: 'atSource', label: 'At source' }, { key: 'loaded', label: 'Loaded' }, { key: 'atDest', label: 'At target' }, { key: 'done', label: 'Confirmed' },
]
const stepIndex = (s: Task['status']) => STEPS.findIndex((x) => x.key === s)

function TaskCard({ t, now }: { t: Task; now: number }) {
  const si = stepIndex(t.status)
  const left = t.due - now
  return (
    <div className="mt-2.5 rounded-lg border border-white/10 bg-white/[0.04] p-2.5">
      <div className="flex flex-wrap items-center gap-1.5">
        <TypePill t={t} /><Prio p={t.priority} />
        <span className="text-[13px] font-semibold tabular-nums">{t.id}</span>
        <span className="text-[12px] text-white/55">· {t.ref}</span>
      </div>
      <p className="mt-1 text-[12.5px] text-white/80">{t.type === 'PICK' ? `${t.party} · ${t.city}` : `Supplier ${t.party}`}</p>
      <div className="mt-2 grid grid-cols-[auto_1fr] gap-x-3 gap-y-0.5 text-[12px]">
        <span className="text-white/50">SSCC</span><span className="font-mono text-[11.5px] text-white/85">{fmtSscc(t.pallet.sscc)}</span>
        <span className="text-white/50">SKU</span><span className="text-white/85">{t.pallet.sku.code} · {t.pallet.sku.name}</span>
        <span className="text-white/50">Qty</span><span className="text-white/85">{t.pallet.cases} cases · {t.pallet.kg} kg · lot {t.pallet.lot} · BBD {t.pallet.bbd}</span>
        <span className="text-white/50">Move</span><span className="font-semibold text-white">{t.from} → {t.to}</span>
        {t.type === 'PICK' && <><span className="text-white/50">Cutoff</span><span className={left < 0 ? 'text-[#f87171]' : left < 90 ? 'text-[#fbbf24]' : 'text-white/85'}>{clock(t.due).slice(0, 5)} · {left < 0 ? `${fmtT(-left)} late` : `${fmtT(left)} left`}</span></>}
      </div>
      <ol className="mt-2.5 flex items-center gap-1">
        {STEPS.map((s, i) => (
          <li key={s.key} className="flex min-w-0 flex-1 flex-col items-center gap-1">
            <span className={`h-1.5 w-full rounded-full ${i <= si ? 'bg-[#5e6ad2]' : 'bg-white/12'} ${i === si + 1 ? 'animate-pulse bg-[#5e6ad2]/45' : ''}`} />
            <span className={`truncate text-[9.5px] ${i <= si ? 'text-white/80' : 'text-white/40'}`}>{s.label}</span>
          </li>
        ))}
      </ol>
    </div>
  )
}

const LEVEL_DOT: Record<SimEvent['level'], string> = { info: '#94a3b8', ok: '#22c55e', warn: '#f59e0b', alert: '#ef4444' }

interface AgvSnap { id: string; state: AgvState; battery: number; v: number; distanceM: number; missions: number; task: Task | null; payload: Pallet | null; wait: Wait | null; opLabel: string; home: number; lowCharge: boolean; lift: number }
interface DockSnap { id: string; kind: 'in' | 'out'; state: Dock['state']; truck: NonNullable<Dock['truck']> | null; pending: number }
interface Snap { t: number; k: Kpis; rush: Sim['rush']; caught: Sim['caught']; peakUntil: number; agvs: AgvSnap[]; tasks: Task[]; done: Task[]; docks: DockSnap[]; events: SimEvent[]; sync: ErpSync | null; syncs: ErpSync[] }

function snapshot(s: Sim): Snap {
  return {
    t: s.t, k: kpis(s), rush: s.rush.map((r) => ({ ...r })), caught: [...s.caught], peakUntil: s.peakUntil,
    agvs: s.agvs.map((a) => ({
      id: a.id, state: a.state, battery: a.battery, v: a.v, distanceM: a.distanceM, missions: a.missions, task: a.task ? { ...a.task } : null,
      payload: a.payload, wait: a.wait, opLabel: a.opLabel, home: a.home, lowCharge: a.lowCharge, lift: a.turret.lift,
    })),
    tasks: s.tasks.map((t) => ({ ...t })), done: s.done.slice(0, 12),
    docks: s.docks.map((d, i) => ({ id: d.def.id, kind: d.def.kind, state: d.state, truck: d.truck ? { ...d.truck } : null, pending: s.tasks.filter((t) => t.dock === i).length })),
    events: s.events.slice(0, 40), sync: s.syncs[0] ?? null, syncs: s.syncs.slice(0, 6),
  }
}

// ── Use cases a visitor can run, and what they save ──────────────────────────

interface Scenario { id: ScenarioId; title: string; gain: string; hook: string; outcome: (s: Snap) => string }
const SCENARIOS: Scenario[] = [
  {
    id: 'mislabel', title: 'Stop wrong shipments', gain: '€150–400 saved per error',
    hook: 'A wrong label is caught at the door, not by your customer.',
    outcome: (s) => {
      const c = s.caught[s.caught.length - 1]
      return c ? `✓ Caught at ${c.at}. It never left on the wrong truck.` : 'Watching the next pallet at the door…'
    },
  },
  {
    id: 'rush', title: 'Say yes to rush orders', gain: '4-minute cutoff, met',
    hook: 'The urgent order goes first. Nobody walks the floor.',
    outcome: (s) => {
      const r = s.rush[s.rush.length - 1]
      if (!r) return ''
      if (r.doneAt === undefined) return `On its way · ${fmtT(Math.max(0, r.due - s.t))} to cutoff`
      return r.doneAt <= r.due ? `✓ Ready in ${fmtT(r.doneAt - r.t)}, ${fmtT(r.due - r.doneAt)} to spare.` : `Ready ${fmtT(r.doneAt - r.due)} after the cutoff.`
    },
  },
  {
    id: 'peak', title: 'Absorb peaks, no overtime', gain: '0 extra staff',
    hook: 'Twice the orders, the same six robots.',
    outcome: (s) => `✓ ${s.k.palletsPerHour} pallets/h · ${s.k.onTimePct}% on time`,
  },
  {
    id: 'blocked', title: 'Safer floor, no stoppage', gain: '0 near misses',
    hook: 'One aisle blocked. Everything else keeps moving.',
    outcome: (s) => `✓ Still ${s.k.palletsPerHour} pallets/h.`,
  },
]

const eur = (n: number) => new Intl.NumberFormat('en-IE', { style: 'currency', currency: 'EUR', maximumFractionDigits: 0 }).format(n)
const eurShort = (n: number) => (n >= 1e6 ? `€${(n / 1e6).toFixed(1)}M` : `€${Math.round(n / 1000)}k`)

const DEFAULTS = { wage: 26, moves: 22, hours: 16, days: 250, run: 3.5, misRate: 0.1, misCost: 200 }
function saving(pph: number, fleet: number, a = DEFAULTS) {
  const drivers = Math.max(1, pph) / a.moves
  const labour = drivers * a.wage * a.hours * a.days
  const run = fleet * a.run * a.hours * a.days
  const errors = Math.max(1, pph) * a.hours * a.days * (a.misRate / 100)
  const errCost = errors * a.misCost
  return { drivers, labour, run, errors, errCost, total: labour - run + errCost }
}


function Savings({ snap }: { snap: Snap }) {
  const [a, setA] = useState(DEFAULTS)
  const r = saving(snap.k.palletsPerHour, snap.agvs.length, a)
  const field = (key: keyof typeof a, label: string, step = 1) => (
    <label className="flex items-center justify-between gap-2 text-[13px] text-white/70">
      <span>{label}</span>
      <input type="number" inputMode="decimal" step={step} value={a[key]} onChange={(e) => setA((x) => ({ ...x, [key]: Number(e.target.value) || 0 }))}
        className="w-20 rounded-md border border-white/12 bg-black/50 px-2 py-1 text-right text-[14px] tabular-nums text-white focus:border-[#8b93e8] focus:outline-none" />
    </label>
  )
  return (
    <div>
      <div className="rounded-xl border border-[#22c55e]/30 bg-[#22c55e]/10 p-3.5">
        <p className="text-[12px] font-semibold uppercase tracking-[0.08em] text-[#86efac]">Saving per year</p>
        <p className="mt-0.5 text-[32px] font-semibold leading-tight tabular-nums">{eur(r.total)}</p>
        <div className="mt-2 grid grid-cols-[1fr_auto] gap-y-1 text-[13px] text-white/80">
          <span>{r.drivers.toFixed(1)} forklift drivers freed</span><span className="tabular-nums">{eur(r.labour)}</span>
          <span>Wrong shipments avoided</span><span className="tabular-nums">{eur(r.errCost)}</span>
          <span>Robot energy & service</span><span className="tabular-nums">−{eur(r.run)}</span>
        </div>
      </div>
      <details className="mt-2.5 rounded-xl border border-white/10 bg-white/[0.04] px-3 py-2">
        <summary className="cursor-pointer text-[13px] font-semibold text-white/80">Use your numbers</summary>
        <div className="mt-2 space-y-1.5">
          {field('wage', 'Driver €/hour')}
          {field('moves', 'Pallets per driver-hour')}
          {field('hours', 'Hours a day')}
          {field('days', 'Days a year')}
          {field('run', 'Robot €/hour', 0.5)}
          {field('misRate', 'Wrong shipments %', 0.1)}
          {field('misCost', '€ per wrong shipment', 10)}
        </div>
      </details>
      <p className="mt-2 text-[11.5px] text-white/45">Estimate from this simulated shift. Robot purchase not included.</p>
    </div>
  )
}

type Tab = 'cases' | 'fleet' | 'orders' | 'docks' | 'roi' | 'events' | 'erp'

// ── Component ────────────────────────────────────────────────────────────────

export default function AgvTwin({ onWant }: { onWant?: () => void }) {
  const mountRef = useRef<HTMLDivElement>(null)
  const labelsRef = useRef<HTMLDivElement>(null)
  const simRef = useRef<Sim | null>(null)
  const speedRef = useRef(2)
  const selRef = useRef<string | null>(null)
  const followRef = useRef(false)
  const focusRef = useRef<Found | null>(null)
  const flyRef = useRef<((x: number, z: number, dist?: number) => void) | null>(null)
  const [snap, setSnap] = useState<Snap | null>(null)
  const [sel, setSel] = useState<string | null>(null)
  const [follow, setFollow] = useState(false)
  const [speed, setSpeed] = useState(2)
  const [tab, setTab] = useState<Tab>('cases')
  const [ran, setRan] = useState<Partial<Record<ScenarioId, string>>>({})
  const [erp, setErp] = useState<ErpTarget>('odoo')
  const [panelOpen, setPanelOpen] = useState(true)
  const [failed, setFailed] = useState(false)
  const [query, setQuery] = useState('')
  const [found, setFound] = useState<Found | null>(null)
  const [missed, setMissed] = useState(false)

  useEffect(() => { selRef.current = sel }, [sel])
  useEffect(() => { followRef.current = follow }, [follow])
  useEffect(() => { speedRef.current = speed }, [speed])
  useEffect(() => { focusRef.current = found }, [found])

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
    renderer.toneMappingExposure = 1.0
    renderer.shadowMap.enabled = true
    renderer.shadowMap.type = THREE.PCFShadowMap
    mount.appendChild(renderer.domElement)
    renderer.domElement.style.display = 'block'

    const scene = new THREE.Scene()
    scene.background = new THREE.Color('#0d1014')
    scene.fog = new THREE.Fog('#0d1014', 95, 190)
    const pmrem = new THREE.PMREMGenerator(renderer)
    const envTex = pmrem.fromScene(new RoomEnvironment(), 0.04).texture
    scene.environment = envTex
    scene.environmentIntensity = 0.35
    const camera = new THREE.PerspectiveCamera(38, 1, 0.5, 500)
    camera.position.set(40, 38, 72)
    const controls = new OrbitControls(camera, renderer.domElement)
    controls.target.set(30, 0, 17)
    controls.enableDamping = true
    controls.maxPolarAngle = 1.4
    controls.minDistance = 5
    controls.maxDistance = 140

    scene.add(new THREE.HemisphereLight('#e6edf7', '#2a2d33', 0.7))
    const sun = new THREE.DirectionalLight('#fff4e5', 2.1)
    sun.position.set(12, 52, 44); sun.target.position.set(30, 0, 18)
    sun.castShadow = true
    sun.shadow.mapSize.set(coarse ? 1024 : 2048, coarse ? 1024 : 2048)
    Object.assign(sun.shadow.camera, { left: -42, right: 42, top: 42, bottom: -42, near: 5, far: 140 })
    sun.shadow.bias = -0.0005
    sun.shadow.normalBias = 0.02
    scene.add(sun, sun.target)
    const fill = new THREE.DirectionalLight('#a9bcff', 0.35); fill.position.set(60, 20, 50); scene.add(fill)

    const sim = createSim(2026)
    // warm up so the first frame already shows a working shift
    for (let i = 0; i < 6000; i++) step(sim, 0.1)
    simRef.current = sim
    const bld = buildBuilding(scene, sim)
    sim.dirty.length = 0

    const carts = new Map<string, CartParts>()
    for (const a of sim.agvs) { const c = buildCart(a.id); carts.set(a.id, c); scene.add(c.root) }

    // trucks and the pallets on the dock lanes
    const trucks = sim.docks.map(() => { const t = buildTruck(); scene.add(t.g); return t })
    const dockPallets = sim.docks.map(() => { const p = palletGroup(); scene.add(p.g); return p })
    const jacks = sim.docks.map(() => { const p = person(0, 0, Math.PI); p.visible = false; scene.add(p); return p })

    // routes on the floor
    const routeLines = new Map<string, THREE.Line>()
    for (const a of sim.agvs) {
      // a fixed buffer, drawn up to the route's length (resizing it every frame is slow and warns)
      const geo = new THREE.BufferGeometry()
      geo.setAttribute('position', new THREE.BufferAttribute(new Float32Array(ROUTE_MAX * 3), 3).setUsage(THREE.DynamicDrawUsage))
      geo.setAttribute('lineDistance', new THREE.BufferAttribute(new Float32Array(ROUTE_MAX), 1).setUsage(THREE.DynamicDrawUsage))
      const line = new THREE.Line(geo, new THREE.LineDashedMaterial({ color: '#5e6ad2', dashSize: 0.6, gapSize: 0.4, transparent: true, opacity: 0.45 }))
      line.position.y = 0.03; line.frustumCulled = false; scene.add(line); routeLines.set(a.id, line)
    }
    // highlight box for the selected task's source/target or a found location
    const hl = new THREE.LineSegments(new THREE.EdgesGeometry(new THREE.BoxGeometry(1.35, 1.5, 1.15)), new THREE.LineBasicMaterial({ color: '#fbbf24' }))
    hl.visible = false; scene.add(hl)
    const hl2 = hl.clone(); (hl2.material as THREE.LineBasicMaterial) = new THREE.LineBasicMaterial({ color: '#22d3ee' }); scene.add(hl2)
    const beam = new THREE.Mesh(new THREE.CylinderGeometry(0.05, 0.05, 1, 8), new THREE.MeshBasicMaterial({ color: '#fbbf24', transparent: true, opacity: 0.6 }))
    beam.visible = false; scene.add(beam)

    // labels
    const labels = new Map<string, HTMLButtonElement>()
    const layer = labelsRef.current!
    for (const a of sim.agvs) {
      const el = document.createElement('button')
      el.type = 'button'; el.className = 'agv-label'
      el.onclick = () => setSel(a.id)
      layer.appendChild(el); labels.set(a.id, el)
    }
    const locLabel = document.createElement('div'); locLabel.className = 'loc-label'; locLabel.style.display = 'none'; layer.appendChild(locLabel)
    const dockLabels = sim.docks.map(() => { const el = document.createElement('div'); el.className = 'dock-label'; layer.appendChild(el); return el })
    let caughtSeen = sim.caught.length

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
      camera.fov = camera.aspect < 0.8 ? 55 : 38
      camera.updateProjectionMatrix()
    }
    const ro = new ResizeObserver(resize); ro.observe(mount); resize()
    if (camera.aspect < 0.8) { camera.position.set(30, 92, 62); controls.target.set(30, 0, 15); controls.update() }

    // smooth camera flights (search results, selecting a far cart)
    let fly: { from: THREE.Vector3; to: THREE.Vector3; camFrom: THREE.Vector3; camTo: THREE.Vector3; k: number } | null = null
    flyRef.current = (x, z, d = 22) => {
      const to = new THREE.Vector3(x, 0, z)
      const dir = camera.position.clone().sub(controls.target).normalize()
      fly = { from: controls.target.clone(), to, camFrom: camera.position.clone(), camTo: to.clone().add(dir.multiplyScalar(d)), k: 0 }
    }

    const clockT = new THREE.Timer()
    const v = new THREE.Vector3()
    let raf = 0, lastSnap = 0
    const showLoc = (x: number, y: number, z: number, text: string) => {
      v.set(x, y + 1.2, z).project(camera)
      const ok = v.z < 1 && Math.abs(v.x) < 1.1 && Math.abs(v.y) < 1.1
      locLabel.style.display = ok ? '' : 'none'
      if (ok) { locLabel.style.transform = `translate(-50%,-100%) translate(${(v.x * 0.5 + 0.5) * mount.clientWidth}px,${(-v.y * 0.5 + 0.5) * mount.clientHeight}px)`; locLabel.textContent = text }
    }
    const loop = () => {
      raf = requestAnimationFrame(loop)
      clockT.update()
      const dt = Math.min(0.1, clockT.getDelta())
      step(sim, dt * speedRef.current)
      for (const i of sim.dirty) placeSlot(sim, i, bld.slotPallets, bld.slotLoads)
      sim.dirty.length = 0

      const selId = selRef.current
      for (const a of sim.agvs) {
        const c = carts.get(a.id)!
        c.root.position.set(a.pos.x, 0, a.pos.z)
        // smooth the heading over the path's polyline joints
        let dh = -a.heading - c.heading
        while (dh > Math.PI) dh -= 2 * Math.PI
        while (dh < -Math.PI) dh += 2 * Math.PI
        c.heading += dh * Math.min(1, dt * 12)
        c.root.rotation.y = c.heading
        const col = a.wait ? (a.wait.kind === 'obstacle' ? '#ef4444' : '#f59e0b') : STATE_COLOR[a.state]
        c.strip.color.set(col); c.strip.emissive.set(col)
        c.beacon.color.set(col); c.beacon.emissive.set(col)
        const moving = a.v > 0.05
        c.beacon.emissiveIntensity = moving ? 1.4 + Math.sin(sim.t * 9) * 1.2 : a.wait ? 1.2 + Math.sin(sim.t * 14) * 1.2 : 2
        c.carriage.position.y = a.turret.lift
        c.turret.rotation.y = -a.turret.yaw
        c.forks.position.x = a.turret.reach
        c.load.set(a.payload)
        // blue spot and scanner field: ahead in the direction of travel
        const leg = a.legs[0]
        const rev = !!leg?.rev
        const travelling = leg && (a.state === 'toSource' || a.state === 'toDest' || a.state === 'parking' || a.state === 'toCharge')
        c.spot.visible = !!travelling
        c.spot.position.x = rev ? -2.6 : 3.0
        c.field.visible = !!travelling
        const reach = 0.8 + (a.v * a.v) / 2 + a.v * 0.6
        c.field.scale.set(reach, reach, 1)
        c.field.position.x = rev ? -1.2 : 1.9
        c.field.rotation.z = rev ? Math.PI : 0
        c.fieldMat.color.set(a.wait ? (a.wait.kind === 'obstacle' ? '#ef4444' : '#f59e0b') : '#22c55e')
        c.fieldMat.opacity = a.wait ? 0.22 : 0.1
        // route
        const line = routeLines.get(a.id)!
        const posA = line.geometry.getAttribute('position') as THREE.BufferAttribute
        const disA = line.geometry.getAttribute('lineDistance') as THREE.BufferAttribute
        let n = 0, run = 0, px = 0, pz = 0
        const push = (x: number, z: number) => {
          if (n >= ROUTE_MAX) return
          if (n) run += Math.hypot(x - px, z - pz)
          posA.setXYZ(n, x, 0, z); disA.setX(n, run); px = x; pz = z; n++
        }
        a.legs.forEach((l, li) => { for (let d = li === 0 ? a.s : 0; d <= l.len; d += 0.6) { const p = pointAt(l, d); push(p.x, p.z) } const e2 = l.pts[l.pts.length - 1]; push(e2.x, e2.z) })
        line.geometry.setDrawRange(0, n > 1 ? n : 0)
        posA.needsUpdate = true; disA.needsUpdate = true
        const m = line.material as THREE.LineDashedMaterial
        const isSel = selId === a.id
        m.opacity = selId ? (isSel ? 0.95 : 0.1) : 0.35
        m.color.set(isSel ? '#ffffff' : STATE_COLOR[a.state])
        // label
        const el = labels.get(a.id)!
        v.set(a.pos.x, 5.9, a.pos.z).project(camera)
        const visible = v.z < 1 && Math.abs(v.x) < 1.1 && Math.abs(v.y) < 1.1 && (mount.clientWidth >= 768 || isSel || !!a.wait)
        el.style.display = visible ? '' : 'none'
        if (visible) {
          el.style.transform = `translate(-50%,-100%) translate(${(v.x * 0.5 + 0.5) * mount.clientWidth}px,${(-v.y * 0.5 + 0.5) * mount.clientHeight}px)`
          el.dataset.sel = isSel ? '1' : '0'
          const sub = a.wait ? waitText(a.wait) : a.task ? `${a.task.type} ${a.task.from} → ${a.task.to}` : STATE_LABEL[a.state]
          el.innerHTML = `<b><span style="background:${col}"></span>${a.id}<em>${Math.round(a.battery)}%</em></b><small>${sub}</small>`
        }
      }

      // highlight: the selected cart's task location, or a search result
      const selA = selId ? sim.agvs.find((x) => x.id === selId) : null
      const f = focusRef.current
      let target: { x: number; y: number; z: number; text: string } | null = null
      let other: { x: number; y: number; z: number } | null = null
      const slotAt = (i: number) => { const sl = sim.slots[i]; return { x: sl.x, y: palletBottom(sl.level) + 0.7, z: sl.rz } }
      const dockAt = (i: number) => ({ x: sim.docks[i].def.x, y: 0.7, z: STAGE_Z })
      if (f?.kind === 'slot') { const sl = sim.slots[f.slot]; target = { ...slotAt(f.slot), text: `${sl.label} · ${sl.pallet ? sl.pallet.sku.code : 'empty'}` } }
      else {
        const t = f?.kind === 'task' ? sim.tasks.find((x) => x.id === f.task.id) ?? null : selA?.task ?? null
        if (t) {
          const src = t.type === 'PICK' ? slotAt(t.slot) : dockAt(t.dock)
          const dst = t.type === 'PICK' ? dockAt(t.dock) : slotAt(t.slot)
          const loaded = t.status === 'loaded' || t.status === 'atDest'
          target = { ...(loaded ? dst : src), text: loaded ? `→ ${t.to}` : `${t.from} · ${t.pallet.sku.code}` }
          other = loaded ? null : dst
        }
      }
      hl.visible = !!target; beam.visible = !!target; hl2.visible = !!other; locLabel.style.display = target ? '' : 'none'
      if (target) {
        const pulse = 1 + 0.06 * Math.sin(sim.t * 6)
        hl.position.set(target.x, target.y, target.z); hl.scale.setScalar(pulse)
        beam.position.set(target.x, (target.y + 9) / 2, target.z); beam.scale.y = 9 - target.y
        showLoc(target.x, target.y, target.z, target.text)
      }
      if (other) hl2.position.set(other.x, other.y, other.z)

      // docks: doors, trucks and their load, the operator scanning and loading
      sim.docks.forEach((d, i) => {
        const tr = trucks[i]
        tr.g.visible = d.truckOut < 0.999
        const truckZ = -0.4 - d.truckOut * 36
        tr.g.position.set(d.def.x, 0, truckZ)
        if (d.truck) tr.setLivery(d.def.kind === 'in' ? 'Supplier' : d.truck.carrier, d.truck.plate)
        const atDoor = d.state === 'docked' || d.state === 'sealing'
        const door = bld.doors[i]
        const open = atDoor && d.state !== 'sealing' ? 1 : 0
        door.position.y += (1.65 + open * 3.05 - door.position.y) * Math.min(1, dt * 2)
        tr.setOpen(Math.max(0, Math.min(1, (door.position.y - 1.65) / 3.05)))
        tr.load.forEach((p, k) => p.set(d.trailer[k] ?? null))
        const recent = sim.caught.length && sim.caught[sim.caught.length - 1].at === d.def.id && sim.t - sim.caught[sim.caught.length - 1].t < 8
        const lamp = recent ? (Math.sin(sim.t * 12) > 0 ? '#ef4444' : '#450a0a') : atDoor && d.state === 'docked' ? '#22c55e' : '#ef4444'
        bld.dockLights[i].color.set(lamp); bld.dockLights[i].emissive.set(lamp)
        const p = dockPallets[i]
        const op = jacks[i]
        const L = d.loader
        const ease = (k: number) => k * k * (3 - 2 * k)
        if (L) {
          op.visible = true
          if (L.phase === 'scan') {
            p.set(L.pallet); p.g.position.set(d.def.x, 0, STAGE_Z)
            op.position.set(d.def.x + 1.0, 0, STAGE_Z - 0.4); op.rotation.y = -Math.PI / 2
          } else if (L.phase === 'carry') {
            const sl = trailerSlot(L.slot)
            const k = ease(Math.min(1, L.k))
            const zw = truckZ + sl.z
            const z = STAGE_Z + (zw - STAGE_Z) * k
            const x = d.def.x + sl.x * Math.max(0, (k - 0.55) / 0.45)
            p.set(L.pallet); p.g.position.set(x, z < 0 ? 1.2 * Math.min(1, -z / 0.6) : 0.03, z)
            op.position.set(x, z < -0.6 ? 1.2 : 0, z + 1.1); op.rotation.y = Math.PI
          } else if (L.phase === 'relocate') {
            const to = sim.docks[L.to!]
            const k = Math.min(1, L.k)
            const walk = (relocateS(d, to) - 3) / relocateS(d, to)
            const kk = ease(Math.min(1, k / walk))
            const x = d.def.x + (to.def.x - d.def.x) * kk
            p.set(k < walk ? L.pallet : null); p.g.position.set(x, 0.03, 1.5)
            op.position.set(x - Math.sign(to.def.x - d.def.x) * 1.1, 0, 1.5); op.rotation.y = to.def.x > d.def.x ? Math.PI / 2 : -Math.PI / 2
          } else {
            const sl = trailerSlot(L.slot)
            const z = truckZ + sl.z + (STAGE_Z - 0.8 - truckZ - sl.z) * ease(Math.min(1, L.k))
            p.set(d.spot); p.g.position.set(d.def.x, 0, STAGE_Z)
            op.position.set(d.def.x, z < -0.6 ? 1.2 : 0, z); op.rotation.y = 0
          }
        } else if (d.slide) {
          const k = d.slide.k
          const z = -3 + (STAGE_Z + 3) * k
          p.set(d.slide.pallet); p.g.position.set(d.def.x, 0.03, z)
          op.visible = true; op.position.set(d.def.x, 0, z - 1.0); op.rotation.y = 0
        } else {
          p.set(d.spot); p.g.position.set(d.def.x, 0, STAGE_Z)
          op.visible = atDoor; op.position.set(d.def.x + 1.6, 0, 1.2); op.rotation.y = 0.4
        }
        p.g.rotation.y = Math.PI / 2
        // the door board: truck, progress, what the operator is doing
        const el = dockLabels[i]
        v.set(d.def.x, 5.1, 0.3).project(camera)
        const vis = v.z < 1 && Math.abs(v.x) < 1.1 && Math.abs(v.y) < 1.1
        const narrow = mount.clientWidth < 1024
        const show = vis && (!narrow || recent || d.state === 'sealing')
        el.style.display = show ? '' : 'none'
        if (show) {
          const t = d.truck
          const line = !t ? 'Door free' : d.def.kind === 'in' ? `Unloading ${t.cap - t.count}/${t.cap}` : recent ? `✗ Wrong load caught · to ${sim.caught[sim.caught.length - 1].belongs}`
            : d.state === 'sealing' ? `Sealing ${t.seal} · ${t.count}/${t.cap}` : L?.phase === 'scan' ? `Scanning SSCC …${L.pallet.sscc.slice(-4)}` : L?.phase === 'relocate' ? 'Walking it to its door' : `Loading ${t.count}/${t.cap}`
          el.dataset.state = recent ? 'bad' : d.state === 'sealing' ? 'ok' : ''
          el.style.transform = `translate(-50%,-100%) translate(${(v.x * 0.5 + 0.5) * mount.clientWidth}px,${(-v.y * 0.5 + 0.5) * mount.clientHeight}px)`
          el.innerHTML = `<b>${d.def.id}${t ? ` · ${t.plate}` : ''}</b><small>${line}</small>`
        }
      })
      if (sim.caught.length > caughtSeen) {
        caughtSeen = sim.caught.length
        const at = sim.docks.find((d) => d.def.id === sim.caught[caughtSeen - 1].at)
        if (at && !followRef.current) flyRef.current?.(at.def.x, 2, 26)
      }
      sim.agvs.forEach((a, i) => {
        const on = a.state === 'charging' && a.home === i
        bld.chargerLeds[i].emissiveIntensity = on ? 1.2 + 0.8 * Math.sin(sim.t * 3) : 0.5
      })

      // obstacle
      if (sim.blocked && sim.t <= sim.blocked.until) {
        bld.obstacle.visible = true
        bld.obstacle.position.set((sim.blocked.x0 + sim.blocked.x1) / 2, 0, sim.blocked.z)
        const p = bld.obstacle.getObjectByName('pulse') as THREE.Mesh
        const s2 = 1 + 0.15 * Math.sin(sim.t * 6); p.scale.set(s2, s2, s2)
      } else bld.obstacle.visible = false

      // camera: flights and follow
      if (fly) {
        fly.k = Math.min(1, fly.k + dt * 1.4)
        const e = 1 - (1 - fly.k) ** 3
        controls.target.lerpVectors(fly.from, fly.to, e)
        camera.position.lerpVectors(fly.camFrom, fly.camTo, e)
        if (fly.k >= 1) fly = null
      } else if (followRef.current && selRef.current) {
        const a = sim.agvs.find((x) => x.id === selRef.current)
        if (a) {
          const off = camera.position.clone().sub(controls.target)
          controls.target.lerp(v.set(a.pos.x, 0, a.pos.z), 0.08)
          camera.position.copy(controls.target).add(off)
        }
      }
      controls.update()
      bld.roof.visible = camera.position.distanceTo(controls.target) > 45
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
      flyRef.current = null
      scene.traverse((o) => {
        const mesh = o as THREE.Mesh
        if (mesh.geometry && mesh.geometry !== PALLET_GEO) mesh.geometry.dispose()
        const mat = mesh.material as THREE.Material | THREE.Material[] | undefined
        for (const mm of Array.isArray(mat) ? mat : mat ? [mat] : []) { const mp = (mm as THREE.MeshStandardMaterial).map; if (mp && mp !== CARTON_TEX) mp.dispose(); mm.dispose() }
      })
      envTex.dispose(); pmrem.dispose()
      renderer.dispose()
      renderer.domElement.remove()
      layer.innerHTML = ''
    }
  }, [])

  const selected = useMemo(() => snap?.agvs.find((a) => a.id === sel) ?? null, [snap, sel])
  const payload = useMemo(() => (snap?.sync ? erpPayload(erp, snap.sync) : null), [snap?.sync, erp])

  const selectAgv = (id: string) => {
    setSel(id); setFound(null)
    const a = simRef.current?.agvs.find((x) => x.id === id)
    if (a && !follow) flyRef.current?.(a.pos.x, a.pos.z, 30)
  }
  const runSearch = (q: string) => {
    const s = simRef.current
    if (!s) return
    const r = find(s, q)
    setMissed(!r)
    if (!r) return
    if (r.kind === 'agv') { selectAgv(r.id); return }
    setFound(r)
    if (r.kind === 'slot') { const sl = s.slots[r.slot]; flyRef.current?.(sl.x, sl.rz, 18); setSel(null); setFollow(false) }
    else if (r.task.agv && s.tasks.includes(s.tasks.find((t) => t.id === r.task.id)!)) { setSel(r.task.agv) }
    else { const sl = s.slots[r.task.slot]; flyRef.current?.(sl.x, sl.rz, 22) }
  }
  const trigger = (id: ScenarioId) => {
    const s = simRef.current
    if (!s) return
    const msg = runScenario(s, id)
    setRan((r) => ({ ...r, [id]: msg }))
    if (id === 'rush') { const r = s.rush[s.rush.length - 1]; const t = r && s.tasks.find((x) => x.id === r.task); if (t) { const d = s.docks[t.dock]; flyRef.current?.(d.def.x, 4, 34) } }
    if (id === 'peak') flyRef.current?.(22, 4, 48)
    if (id === 'blocked') setTimeout(() => { const b = simRef.current?.blocked; if (b) flyRef.current?.((b.x0 + b.x1) / 2, b.z, 26) }, 120)
  }
  const foundSlot = found?.kind === 'slot' && simRef.current ? simRef.current.slots[found.slot] : null
  const foundSlotTask = foundSlot && snap ? snap.tasks.find((t) => simRef.current!.slots[t.slot] === foundSlot) : null

  if (failed) {
    return <div className="flex h-full items-center justify-center p-6 text-center text-white/80">3D is not available on this device. The warehouse twin needs WebGL.</div>
  }

  const tabBtn = (id: Tab, label: ReactNode) => (
    <button type="button" onClick={() => setTab(id)} className={`flex-1 whitespace-nowrap rounded-lg px-1.5 py-1.5 text-[12.5px] font-medium ${tab === id ? 'bg-white/15 text-white' : 'text-white/60 hover:text-white'}`}>{label}</button>
  )
  const active = snap ? snap.tasks.filter((t) => t.status !== 'queued').sort((a, b) => (a.agv ?? '').localeCompare(b.agv ?? '')) : []
  const queued = snap ? snap.tasks.filter((t) => t.status === 'queued').sort((a, b) => a.priority - b.priority || a.createdAt - b.createdAt) : []

  const taskRow = (t: Task, extra?: ReactNode) => (
    <li key={t.id}>
      <button type="button" onClick={() => (t.agv && t.status !== 'done' ? selectAgv(t.agv) : (setFound({ kind: 'task', task: t }), runSearch(t.id)))} className="w-full rounded-lg border border-white/10 bg-white/[0.04] px-2.5 py-1.5 text-left hover:bg-white/[0.08]">
        <div className="flex items-center gap-1.5">
          <TypePill t={t} /><Prio p={t.priority} />
          <span className="text-[12.5px] font-semibold tabular-nums">{t.id}</span>
          <span className="ml-auto text-[11px] text-white/55">{extra}</span>
        </div>
        <div className="mt-0.5 flex justify-between gap-2 text-[11.5px] text-white/65">
          <span className="truncate">{t.pallet.sku.code} · {t.from} → {t.to}</span>
          <span className="flex-none">{t.ref}</span>
        </div>
      </button>
    </li>
  )

  return (
    <div className="relative h-full w-full overflow-hidden bg-[#0d1014] text-white">
      <style>{`
        .agv-label{position:absolute;left:0;top:0;display:flex;flex-direction:column;align-items:flex-start;gap:1px;padding:3px 8px 4px;border-radius:10px;background:rgba(10,12,16,.8);border:1px solid rgba(255,255,255,.14);font:600 11.5px/1.2 Inter,system-ui,sans-serif;color:#fff;white-space:nowrap;pointer-events:auto;cursor:pointer;backdrop-filter:blur(6px)}
        .agv-label b{display:inline-flex;align-items:center;gap:6px;font-weight:650}
        .agv-label b span{width:7px;height:7px;border-radius:99px}
        .agv-label em{font-style:normal;font-weight:500;color:rgba(255,255,255,.6)}
        .agv-label small{font-size:10px;font-weight:500;color:rgba(255,255,255,.62)}
        .agv-label[data-sel="1"]{background:#5e6ad2;border-color:#8b93e8}
        .agv-label[data-sel="1"] small{color:rgba(255,255,255,.85)}
        .dock-label{position:absolute;left:0;top:0;display:flex;flex-direction:column;padding:3px 8px 4px;border-radius:8px;background:rgba(15,23,42,.85);border:1px solid rgba(255,255,255,.14);font:600 11px/1.25 Inter,system-ui,sans-serif;color:#fff;white-space:nowrap;pointer-events:none}
        .dock-label small{font-size:10px;font-weight:500;color:rgba(255,255,255,.7)}
        .dock-label[data-state="bad"]{background:#b91c1c;border-color:#fca5a5}
        .dock-label[data-state="bad"] small{color:#fff}
        .dock-label[data-state="ok"]{background:#166534}
        .loc-label{position:absolute;left:0;top:0;padding:3px 8px;border-radius:8px;background:#fbbf24;color:#111;font:700 11.5px/1.2 Inter,system-ui,sans-serif;white-space:nowrap;pointer-events:none}
        @media (max-width: 640px){.agv-label small{display:none}}
      `}</style>
      <div ref={mountRef} className="absolute inset-0" />
      <div ref={labelsRef} className="pointer-events-none absolute inset-0 overflow-hidden" />

      {/* top-left: what this is, the numbers, search, the selected cart */}
      <div className="pointer-events-none absolute left-3 top-3 right-3 md:left-4 md:top-4 md:right-[392px]">
        <div className="pointer-events-auto inline-flex flex-wrap items-center gap-2 rounded-full border border-white/10 bg-black/60 px-3 py-1.5 text-[12px] backdrop-blur">
          <span className="h-2 w-2 rounded-full bg-[#f59e0b]" />
          <span className="font-semibold">Simulated</span>
          <span className="text-white/60">· 6 robots · {snap ? clock(snap.t).slice(0, 5) : '08:00'}</span>
        </div>
        {snap && (
          <div className="mt-2 grid max-w-[560px] grid-cols-3 gap-1.5 md:mt-3 md:gap-2 lg:max-w-[720px] lg:grid-cols-5">
            <Kpi label="Saving / year" value={eurShort(saving(snap.k.palletsPerHour, snap.agvs.length).total)} />
            <Kpi label="On time" value={snap.k.onTimePct} unit="%" />
            <Kpi label="Pallets / hour" value={snap.k.palletsPerHour} />
            <div className="hidden lg:block"><Kpi label="Trucks out" value={snap.k.trucksOut} /></div>
            <div className="hidden lg:block"><Kpi label="Errors stopped" value={snap.k.caught} /></div>
          </div>
        )}
        <form className="pointer-events-auto mt-2 hidden max-w-[420px] gap-1.5 md:flex" onSubmit={(e) => { e.preventDefault(); runSearch(query) }}>
          <input value={query} onChange={(e) => { setQuery(e.target.value); setMissed(false) }} placeholder="Find B-14-3-L, an SSCC, TO, SO or AGV-03" aria-label="Find a location, pallet, order or cart"
            className="min-w-0 flex-1 rounded-lg border border-white/12 bg-black/65 px-3 py-1.5 text-[13px] text-white placeholder:text-white/40 backdrop-blur focus:border-[#8b93e8] focus:outline-none" />
          <button type="submit" className="rounded-lg bg-white/15 px-3 py-1.5 text-[13px] font-semibold hover:bg-white/25">Find</button>
          {(found || missed) && <button type="button" onClick={() => { setFound(null); setMissed(false); setQuery('') }} className="rounded-lg bg-white/10 px-2.5 text-[13px] text-white/70">×</button>}
        </form>
        {missed && <p className="pointer-events-auto mt-1 text-[12px] text-[#fca5a5]">Nothing matches “{query}”. Try a code like A-07-3-L.</p>}
        {foundSlot && (
          <div className="pointer-events-auto mt-2 max-w-[380px] rounded-xl border border-[#fbbf24]/40 bg-black/75 p-3 backdrop-blur">
            <p className="text-[15px] font-semibold">{foundSlot.label}</p>
            <p className="text-[12px] text-white/60">Aisle {AISLE_NAMES[foundSlot.aisle]} · position {foundSlot.pos + 1} · level {foundSlot.level + 1} · {foundSlot.side < 0 ? 'left' : 'right'} side</p>
            {foundSlot.pallet ? (
              <div className="mt-2 grid grid-cols-[auto_1fr] gap-x-3 gap-y-0.5 text-[12px]">
                <span className="text-white/50">SSCC</span><span className="font-mono text-[11.5px]">{fmtSscc(foundSlot.pallet.sscc)}</span>
                <span className="text-white/50">SKU</span><span>{foundSlot.pallet.sku.code} · {foundSlot.pallet.sku.name}</span>
                <span className="text-white/50">Qty</span><span>{foundSlot.pallet.cases} cases · {foundSlot.pallet.kg} kg</span>
                <span className="text-white/50">Lot</span><span>{foundSlot.pallet.lot} · BBD {foundSlot.pallet.bbd}</span>
              </div>
            ) : <p className="mt-2 text-[12.5px] text-white/70">Empty location.</p>}
            {foundSlotTask && <p className="mt-2 text-[12px] text-[#fcd34d]">Reserved by {foundSlotTask.id} ({foundSlotTask.type}{foundSlotTask.agv ? ` · ${foundSlotTask.agv}` : ' · queued'})</p>}
          </div>
        )}
        {selected && (
          <div className="pointer-events-auto mt-2 max-h-[calc(100vh-260px)] max-w-[380px] overflow-y-auto rounded-xl border border-white/10 bg-black/75 p-3 backdrop-blur md:mt-3 md:p-3.5">
            <div className="flex items-center justify-between gap-2">
              <p className="text-[15px] font-semibold md:text-[17px]">{selected.id}</p>
              <span className="rounded-full px-2 py-0.5 text-[11.5px] font-semibold" style={{ background: STATE_COLOR[selected.state] + '33', color: STATE_COLOR[selected.state] }}>{STATE_LABEL[selected.state]}</span>
            </div>
            {(selected.wait || (selected.opLabel && (selected.state === 'atSource' || selected.state === 'atDest'))) && (
              <p className={`mt-1 text-[12.5px] ${selected.wait ? 'text-[#fbbf24]' : 'text-[#c4b5fd]'}`}>{waitText(selected.wait) ?? selected.opLabel}</p>
            )}
            <div className="mt-2 grid grid-cols-2 gap-x-4 gap-y-1 text-[12.5px] text-white/70">
              <span>Battery</span><Battery pct={selected.battery} />
              <span>Speed · forks</span><span className="tabular-nums text-white/85">{selected.v.toFixed(1)} m/s · {selected.lift.toFixed(2)} m</span>
              <span>This shift</span><span className="tabular-nums text-white/85">{(selected.distanceM / 1000).toFixed(2)} km · {selected.missions} orders</span>
              <span>Home charger</span><span className="text-white/85">C{selected.home + 1}</span>
            </div>
            {selected.task ? <TaskCard t={selected.task} now={snap!.t} /> : <p className="mt-2 text-[12.5px] text-white/55">{selected.state === 'charging' ? 'Charging, available for the next order.' : 'No order.'}</p>}
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

      {/* panel */}
      <button type="button" onClick={() => setPanelOpen((o) => !o)} className="absolute bottom-3 right-3 rounded-full border border-white/10 bg-black/70 px-3.5 py-2 text-[13px] font-semibold backdrop-blur md:hidden">
        {panelOpen ? 'Hide' : 'See the value'}
      </button>
      {panelOpen && snap && (
        <aside className="absolute inset-x-2 bottom-14 flex max-h-[52%] flex-col rounded-2xl border border-white/10 bg-black/75 backdrop-blur md:inset-x-auto md:bottom-auto md:right-4 md:top-4 md:max-h-[calc(100%-2rem)] md:w-[372px]">
          <div className="flex flex-none gap-0.5 overflow-x-auto p-1.5">{tabBtn('cases', 'Try it')}{tabBtn('roi', 'Savings')}{tabBtn('docks', 'Docks')}{tabBtn('fleet', 'Fleet')}{tabBtn('orders', 'Orders')}{tabBtn('events', 'Log')}{tabBtn('erp', 'ERP')}</div>
          <div className="min-h-0 flex-1 overflow-y-auto px-3 pb-3">
            {tab === 'cases' && (
              <div className="space-y-2">
                <p className="text-[13px] text-white/60">Tap one. Watch it happen.</p>
                {SCENARIOS.map((c) => (
                  <div key={c.id} className="rounded-xl border border-white/10 bg-white/[0.04] p-3">
                    <div className="flex items-center gap-3">
                      <div className="min-w-0 flex-1">
                        <p className="text-[15px] font-semibold leading-snug">{c.title}</p>
                        <p className="mt-0.5 text-[13px] font-semibold text-[#86efac]">{c.gain}</p>
                      </div>
                      {!ran[c.id] && <button type="button" onClick={() => trigger(c.id)} className="min-h-[40px] flex-none rounded-lg bg-[#5e6ad2] px-3.5 text-[14px] font-semibold hover:brightness-110">Show me</button>}
                    </div>
                    <p className="mt-1 text-[13px] leading-snug text-white/60">{c.hook}</p>
                    {ran[c.id] && <p className="mt-2 rounded-lg bg-[#22c55e]/12 px-2.5 py-2 text-[13px] font-medium text-[#bbf7d0]">{c.outcome(snap)}</p>}
                  </div>
                ))}
              </div>
            )}
            {tab === 'roi' && <Savings snap={snap} />}
            {tab === 'fleet' && (
              <ul className="space-y-1.5">
                {snap.agvs.map((a) => (
                  <li key={a.id}>
                    <button type="button" onClick={() => selectAgv(a.id)} className={`w-full rounded-xl border px-3 py-2 text-left ${sel === a.id ? 'border-[#8b93e8] bg-[#5e6ad2]/25' : 'border-white/10 bg-white/[0.04] hover:bg-white/[0.08]'}`}>
                      <div className="flex items-center justify-between">
                        <span className="text-[13.5px] font-semibold">{a.id}</span>
                        <span className="text-[11.5px] font-semibold" style={{ color: a.wait ? '#fbbf24' : STATE_COLOR[a.state] }}>{a.wait ? 'Waiting' : STATE_LABEL[a.state]}</span>
                      </div>
                      <div className="mt-1 flex items-center justify-between gap-2 text-[12px] text-white/60">
                        <span className="truncate">{a.task ? `${a.task.id} · ${a.task.from} → ${a.task.to}` : a.state === 'charging' ? `Charger C${a.home + 1}` : '—'}</span>
                        <Battery pct={a.battery} />
                      </div>
                      {a.payload && <p className="mt-0.5 truncate text-[11px] text-white/45">On forks: {a.payload.sku.name} · SSCC …{a.payload.sscc.slice(-6)}</p>}
                    </button>
                  </li>
                ))}
                <li className="pt-1 text-[11.5px] text-white/45">{snap.k.queue} orders queued · {snap.k.done} done this shift · tap a cart or a label</li>
              </ul>
            )}
            {tab === 'orders' && (
              <div className="space-y-3">
                <section>
                  <p className="mb-1 text-[11px] font-semibold uppercase tracking-[0.08em] text-white/45">In progress · {active.length}</p>
                  <ul className="space-y-1">{active.map((t) => taskRow(t, `${t.agv} · ${STEPS[Math.max(0, stepIndex(t.status))]?.label}`))}</ul>
                </section>
                <section>
                  <p className="mb-1 text-[11px] font-semibold uppercase tracking-[0.08em] text-white/45">Queued · {queued.length}</p>
                  <ul className="space-y-1">{queued.map((t) => taskRow(t, `waiting ${fmtT(snap.t - t.createdAt)}`))}</ul>
                </section>
                <section>
                  <p className="mb-1 text-[11px] font-semibold uppercase tracking-[0.08em] text-white/45">Just confirmed</p>
                  <ul className="space-y-1">{snap.done.slice(0, 8).map((t) => taskRow(t, <span className={(t.doneAt ?? 0) > t.due ? 'text-[#fbbf24]' : 'text-[#4ade80]'}>{(t.doneAt ?? 0) > t.due ? 'late' : '✓'} {clock(t.doneAt ?? 0).slice(0, 5)}</span>))}</ul>
                </section>
              </div>
            )}
            {tab === 'docks' && (
              <ul className="space-y-1.5">
                <li className="grid grid-cols-3 gap-1.5 pb-1 text-center">
                  <span className="rounded-lg bg-white/[0.05] px-1 py-1.5"><b className="block text-[15px] tabular-nums">{snap.k.turnaroundMin || '–'}</b><span className="text-[10.5px] text-white/50">min truck at door</span></span>
                  <span className="rounded-lg bg-white/[0.05] px-1 py-1.5"><b className="block text-[15px] tabular-nums">{snap.k.dockToTruckS || '–'}</b><span className="text-[10.5px] text-white/50">s lane → trailer</span></span>
                  <span className="rounded-lg bg-white/[0.05] px-1 py-1.5"><b className="block text-[15px] tabular-nums">{snap.k.caught}</b><span className="text-[10.5px] text-white/50">wrong loads stopped</span></span>
                </li>
                {snap.docks.map((d) => {
                  const tr = d.truck
                  const pct = tr && tr.cap ? (d.kind === 'out' ? tr.count / tr.cap : (tr.cap - tr.count) / tr.cap) : 0
                  const left = tr ? tr.due - snap.t : 0
                  return (
                    <li key={d.id} className="rounded-xl border border-white/10 bg-white/[0.04] px-3 py-2">
                      <div className="flex items-center justify-between">
                        <span className="text-[13.5px] font-semibold">{d.id} <span className="font-normal text-white/50">· {d.kind === 'in' ? 'receiving' : 'shipping'}</span></span>
                        <span className="text-[11.5px] font-semibold capitalize" style={{ color: d.state === 'docked' ? '#22c55e' : '#f59e0b' }}>{d.state === 'empty' ? 'free' : d.state}</span>
                      </div>
                      {tr ? (
                        <>
                          <p className="mt-0.5 text-[12px] text-white/75">{tr.plate} · {tr.carrier} {d.kind === 'out' ? `→ ${tr.dest}` : ''}</p>
                          <p className="text-[11.5px] text-white/50">{tr.ref}{tr.orders.length ? ` · ${tr.orders.join(', ')}` : ''}</p>
                          <div className="mt-1.5 flex items-center gap-2">
                            <span className="relative h-1.5 flex-1 overflow-hidden rounded-full bg-white/12"><span className="absolute inset-y-0 left-0 bg-[#5e6ad2]" style={{ width: `${pct * 100}%` }} /></span>
                            <span className="text-[11.5px] tabular-nums text-white/70">{d.kind === 'out' ? `${tr.count}/${tr.cap} loaded` : `${tr.cap - tr.count}/${tr.cap} unloaded`}</span>
                          </div>
                          {d.kind === 'out' && (
                            <div className="mt-1.5 grid grid-flow-col grid-rows-2 gap-0.5" aria-label={`Trailer: ${tr.count} of ${tr.cap} positions loaded`}>
                              {Array.from({ length: Math.max(tr.cap, 2) + (Math.max(tr.cap, 2) % 2) }, (_, k) => <span key={k} className={`h-1.5 rounded-sm ${k < tr.count ? 'bg-[#a5b4fc]' : k < tr.cap ? 'bg-white/15' : 'bg-transparent'}`} />)}
                            </div>
                          )}
                          {d.kind === 'out' && <p className={`mt-1 text-[11.5px] ${left < 0 ? 'text-[#f87171]' : 'text-white/55'}`}>Cutoff {clock(tr.due).slice(0, 5)} · {left < 0 ? `${fmtT(-left)} late` : `${fmtT(left)} left`} · {d.pending} TO open</p>}
                        </>
                      ) : <p className="mt-0.5 text-[12px] text-white/45">No truck at the door.</p>}
                    </li>
                  )
                })}
              </ul>
            )}
            {tab === 'events' && (
              <ul className="space-y-1.5 text-[12.5px]">
                {snap.events.map((e, i) => (
                  <li key={`${e.t}-${i}`} className="flex gap-2">
                    <span className="mt-1.5 h-1.5 w-1.5 flex-none rounded-full" style={{ background: LEVEL_DOT[e.level] }} />
                    <span className="tabular-nums text-white/45">{clock(e.t).slice(0, 5)}</span>
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
                <p className="mt-2 text-[12px] leading-snug text-white/60">Every confirmed transfer order updates your stock and order in your system. This is the call it would make.</p>
                {payload && snap.sync ? (
                  <>
                    <p className="mt-2 text-[12px] text-white/80"><span className="font-semibold">{snap.sync.task.id}</span> · {snap.sync.task.type} · {snap.sync.agv} · {clock(snap.sync.t).slice(0, 5)}</p>
                    <pre className="mt-1.5 max-h-56 overflow-auto rounded-lg bg-black/60 p-2.5 text-[11px] leading-snug text-[#c7d2fe]"><code>{`${payload.method} ${payload.url}\n\n${JSON.stringify(payload.body, null, 2)}`}</code></pre>
                  </>
                ) : <p className="mt-2 text-[12px] text-white/50">Waiting for the first confirmation…</p>}
                <ul className="mt-2 space-y-1 text-[12px] text-white/70">
                  {snap.syncs.map((s) => (
                    <li key={s.task.id + s.t} className="flex justify-between gap-2"><span>{s.task.id} · {s.task.ref} → {erp === 'odoo' ? 'stock move done' : erp === 'salesforce' ? 'work order completed' : s.task.type === 'PICK' ? 'pallet.staged' : 'pallet.putaway'}</span><span className="text-[#22c55e]">✓</span></li>
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
