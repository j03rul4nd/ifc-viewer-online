/// <reference types="@webgpu/types" />
// ─── WebGPU local-inertial solver ─────────────────────────────────────────────
// Runs the kernels of wgsl.ts on its own GPUDevice. It never touches the
// viewer's WebGL context (the two APIs cannot share resources): results leave
// through small asynchronous read-backs — a 32-byte clock per batch, ~1 000
// partial sums for the metrics, and a half-float display frame when asked.
//
// Works on the main thread or in a worker (navigator.gpu exists in both); the
// flood worker is where it lives in the app.

import { effectiveRainArea, initialVolume, validateGrid, type FloodGrid } from '../core/grid'
import { depthFromRates, intervalMs, ratesMs } from '../core/hyetograph'
import {
  edgeBits, resolveParams,
  type AdvanceResult, type FieldFrame, type FloodSolver, type FloodStats, type MaxFields, type SolverInit, type SolverParams,
} from '../core/solver-api'
import { CTRL_BYTES, IO_WGSL, PARAMS_BYTES, RAIN_SLOTS, STEP_WGSL } from './wgsl'

const WG = 16
const IO_WG = 256
const MAX_DIM = 32768

export interface WebGpuOptions {
  powerPreference?: GPUPowerPreference
  /** Reuse a device (tests); otherwise one is requested and owned. */
  device?: GPUDevice
}

export interface GpuAdapterSummary {
  vendor: string
  architecture: string
  description: string
}

/** Rain step function and total duration must fit a u32 millisecond clock. */
function checkRain(ivMs: number, count: number): void {
  if (count > RAIN_SLOTS) throw new Error(`flood: at most ${RAIN_SLOTS} rain intervals (got ${count})`)
  if (ivMs * (count + 1) >= 2 ** 31) throw new Error('flood: rain event too long for the millisecond clock')
}

export class WebGpuInertialSolver implements FloodSolver {
  readonly backend = 'webgpu' as const
  readonly grid: FloodGrid
  readonly params: SolverParams
  readonly adapter: GpuAdapterSummary

  private readonly device: GPUDevice
  private readonly ownsDevice: boolean
  private readonly rates: Float32Array
  private readonly ivMs: number
  private readonly nc: number
  private readonly nf: number
  private readonly nb: number
  private readonly rainArea: number
  private readonly v0: number

  private readonly bufParams: GPUBuffer
  private readonly bufRain: GPUBuffer
  private readonly texStatic: GPUTexture
  private readonly bufCtrl: GPUBuffer
  private readonly bufCells: GPUBuffer
  private readonly bufQ: [GPUBuffer, GPUBuffer]
  private readonly bufMax: GPUBuffer
  private readonly bufBnd: GPUBuffer
  private readonly bufInf: GPUBuffer
  private readonly bufPartials: GPUBuffer
  private readonly bufDisp: GPUBuffer

  private readonly modules: GPUShaderModule[]
  private readonly pipes: Record<'dt' | 'flux' | 'limit' | 'scale' | 'cont' | 'stats' | 'pack', GPUComputePipeline>
  private readonly stepGroups: [GPUBindGroup, GPUBindGroup]
  private readonly ioGroup: GPUBindGroup
  private readonly ioGroups: [number, number]
  /** Which bind group the next step uses (the q buffer it reads from). */
  private parity = 0
  private outflow = 0
  private lastAdvance: AdvanceResult = { t: 0, steps: 0, dt: 0 }
  private disposed = false
  private lost: string | null = null

  static async create(init: SolverInit, o: WebGpuOptions = {}): Promise<WebGpuInertialSolver> {
    let device = o.device
    let adapterInfo: GpuAdapterSummary = { vendor: '', architecture: '', description: '' }
    if (!device) {
      if (typeof navigator === 'undefined' || !navigator.gpu) throw new Error('WebGPU is not available')
      const adapter = await navigator.gpu.requestAdapter({ powerPreference: o.powerPreference })
      if (!adapter) throw new Error('No WebGPU adapter')
      const info = adapter.info
      adapterInfo = { vendor: info?.vendor ?? '', architecture: info?.architecture ?? '', description: info?.description ?? '' }
      // The largest buffer is cells (16 B/cell); the default binding limit
      // (128 MiB) covers ~2 800² cells. Ask for more only when it is needed.
      const g = init.grid
      const need = Math.max((g.nx + 1) * (g.ny + 1) * 8, g.nx * g.ny * 16)
      const limits: Record<string, number> = {}
      if (need > 128 * 1024 * 1024) {
        if (need > adapter.limits.maxStorageBufferBindingSize || need > adapter.limits.maxBufferSize) {
          throw new Error('flood grid too large for this GPU')
        }
        limits.maxStorageBufferBindingSize = need
        limits.maxBufferSize = need
      }
      device = await adapter.requestDevice({ requiredLimits: limits })
    }
    const s = new WebGpuInertialSolver(init, device, !o.device, adapterInfo)
    await s.checkCompiled()
    return s
  }

  private constructor(init: SolverInit, device: GPUDevice, owns: boolean, adapter: GpuAdapterSummary) {
    const g = validateGrid(init.grid)
    this.grid = g
    this.params = resolveParams(init.params)
    this.device = device
    this.ownsDevice = owns
    this.adapter = adapter
    this.rates = ratesMs(init.hyetograph)
    this.ivMs = intervalMs(init.hyetograph)
    checkRain(this.ivMs, this.rates.length)
    const { nx, ny } = g
    this.nc = nx * ny
    this.nf = (nx + 1) * (ny + 1)
    this.nb = 2 * (nx + ny)
    this.rainArea = effectiveRainArea(g)
    this.v0 = initialVolume(g)
    void device.lost.then((info) => { if (!this.disposed) this.lost = info.message || info.reason || 'device lost' })

    const p = this.params
    const S = GPUBufferUsage.STORAGE
    const CS = GPUBufferUsage.COPY_SRC
    const CD = GPUBufferUsage.COPY_DST

    // Parameters.
    const pb = new ArrayBuffer(PARAMS_BYTES)
    const pu = new Uint32Array(pb)
    const pf = new Float32Array(pb)
    pu[0] = nx; pu[1] = ny; pu[2] = edgeBits(p.boundary); pu[3] = this.rates.length
    pu[4] = this.ivMs; pu[5] = p.friction === 'implicit' ? 1 : 0
    pf[8] = g.dx; pf[9] = p.g; pf[10] = p.theta; pf[11] = p.alpha
    pf[12] = p.hEps; pf[13] = p.dtMax; pf[14] = p.freeSlopeMin; pf[15] = p.wetThreshold
    pf[16] = p.infiltration?.initialMmH ?? 0; pf[17] = p.infiltration?.finalMmH ?? 0; pf[18] = p.infiltration?.decayPerHour ?? 0
    this.bufParams = this.buffer(PARAMS_BYTES, GPUBufferUsage.UNIFORM | CD, pb)
    const rain = new Float32Array(RAIN_SLOTS)
    rain.set(this.rates)
    this.bufRain = this.buffer(rain.byteLength, GPUBufferUsage.UNIFORM | CD, rain.buffer)

    // Static fields → rgba32float texture (z, rainFactor, n, blocked).
    const st = new Float32Array(this.nc * 4)
    for (let c = 0; c < this.nc; c++) {
      st[c * 4] = g.z[c]
      st[c * 4 + 1] = g.rainFactor[c]
      st[c * 4 + 2] = g.manning[c]
      st[c * 4 + 3] = g.blocked[c]
    }
    this.texStatic = device.createTexture({
      size: [nx, ny], format: 'rgba32float', usage: GPUTextureUsage.TEXTURE_BINDING | GPUTextureUsage.COPY_DST,
    })
    device.queue.writeTexture({ texture: this.texStatic }, st, { bytesPerRow: nx * 16, rowsPerImage: ny }, [nx, ny])

    // State.
    const cells = new Float32Array(this.nc * 4)
    const mx = new Float32Array(this.nc * 4)
    let hMax = 0
    for (let c = 0; c < this.nc; c++) {
      const h = g.h0 && !g.blocked[c] ? g.h0[c] : 0
      cells[c * 4] = h
      cells[c * 4 + 3] = 1
      mx[c * 4] = h
      mx[c * 4 + 3] = h > p.wetThreshold ? 0 : -1
      if (h > hMax) hMax = h
    }
    const ctrl = new ArrayBuffer(CTRL_BYTES)
    new Float32Array(ctrl)[6] = Math.fround(hMax) // hmaxBits: same bits as the float
    this.bufCtrl = this.buffer(CTRL_BYTES, S | CS | CD, ctrl)
    this.bufCells = this.buffer(cells.byteLength, S | CS | CD, cells.buffer)
    this.bufQ = [this.buffer(this.nf * 8, S | CS | CD), this.buffer(this.nf * 8, S | CS | CD)]
    this.bufMax = this.buffer(mx.byteLength, S | CS | CD, mx.buffer)
    this.bufBnd = this.buffer(Math.max(4, this.nb * 4), S | CS | CD)
    this.bufInf = this.buffer(this.nc * 4, S | CS | CD)
    const groups = Math.ceil(this.nc / IO_WG)
    this.ioGroups = [Math.min(groups, MAX_DIM), Math.ceil(groups / MAX_DIM)]
    this.bufPartials = this.buffer(this.ioGroups[0] * this.ioGroups[1] * 32, S | CS)
    this.bufDisp = this.buffer(this.nc * 8, S | CS)

    // Pipelines.
    const stepLayout = device.createBindGroupLayout({
      entries: [
        { binding: 0, visibility: GPUShaderStage.COMPUTE, buffer: { type: 'uniform' } },
        { binding: 1, visibility: GPUShaderStage.COMPUTE, buffer: { type: 'uniform' } },
        { binding: 2, visibility: GPUShaderStage.COMPUTE, texture: { sampleType: 'unfilterable-float' } },
        { binding: 3, visibility: GPUShaderStage.COMPUTE, buffer: { type: 'storage' } },
        { binding: 4, visibility: GPUShaderStage.COMPUTE, buffer: { type: 'storage' } },
        { binding: 5, visibility: GPUShaderStage.COMPUTE, buffer: { type: 'read-only-storage' } },
        { binding: 6, visibility: GPUShaderStage.COMPUTE, buffer: { type: 'storage' } },
        { binding: 7, visibility: GPUShaderStage.COMPUTE, buffer: { type: 'storage' } },
        { binding: 8, visibility: GPUShaderStage.COMPUTE, buffer: { type: 'storage' } },
        { binding: 9, visibility: GPUShaderStage.COMPUTE, buffer: { type: 'storage' } },
      ],
    })
    const ioLayout = device.createBindGroupLayout({
      entries: [
        { binding: 0, visibility: GPUShaderStage.COMPUTE, buffer: { type: 'uniform' } },
        { binding: 1, visibility: GPUShaderStage.COMPUTE, buffer: { type: 'read-only-storage' } },
        { binding: 2, visibility: GPUShaderStage.COMPUTE, buffer: { type: 'read-only-storage' } },
        { binding: 3, visibility: GPUShaderStage.COMPUTE, buffer: { type: 'storage' } },
        { binding: 4, visibility: GPUShaderStage.COMPUTE, buffer: { type: 'storage' } },
        { binding: 5, visibility: GPUShaderStage.COMPUTE, buffer: { type: 'read-only-storage' } },
      ],
    })
    const stepModule = device.createShaderModule({ code: STEP_WGSL, label: 'flood-step' })
    const ioModule = device.createShaderModule({ code: IO_WGSL, label: 'flood-io' })
    this.modules = [stepModule, ioModule]
    const stepPL = device.createPipelineLayout({ bindGroupLayouts: [stepLayout] })
    const ioPL = device.createPipelineLayout({ bindGroupLayouts: [ioLayout] })
    const mk = (module: GPUShaderModule, layout: GPUPipelineLayout, entryPoint: string): GPUComputePipeline =>
      device.createComputePipeline({ layout, compute: { module, entryPoint }, label: `flood-${entryPoint}` })
    this.pipes = {
      dt: mk(stepModule, stepPL, 'k_dt'),
      flux: mk(stepModule, stepPL, 'k_flux'),
      limit: mk(stepModule, stepPL, 'k_limit'),
      scale: mk(stepModule, stepPL, 'k_scale'),
      cont: mk(stepModule, stepPL, 'k_cont'),
      stats: mk(ioModule, ioPL, 'k_stats'),
      pack: mk(ioModule, ioPL, 'k_pack'),
    }
    const stepGroup = (qIn: GPUBuffer, qOut: GPUBuffer): GPUBindGroup => device.createBindGroup({
      layout: stepLayout,
      entries: [
        { binding: 0, resource: { buffer: this.bufParams } },
        { binding: 1, resource: { buffer: this.bufRain } },
        { binding: 2, resource: this.texStatic.createView() },
        { binding: 3, resource: { buffer: this.bufCtrl } },
        { binding: 4, resource: { buffer: this.bufCells } },
        { binding: 5, resource: { buffer: qIn } },
        { binding: 6, resource: { buffer: qOut } },
        { binding: 7, resource: { buffer: this.bufMax } },
        { binding: 8, resource: { buffer: this.bufBnd } },
        { binding: 9, resource: { buffer: this.bufInf } },
      ],
    })
    this.stepGroups = [stepGroup(this.bufQ[0], this.bufQ[1]), stepGroup(this.bufQ[1], this.bufQ[0])]
    this.ioGroup = device.createBindGroup({
      layout: ioLayout,
      entries: [
        { binding: 0, resource: { buffer: this.bufParams } },
        { binding: 1, resource: { buffer: this.bufCells } },
        { binding: 2, resource: { buffer: this.bufMax } },
        { binding: 3, resource: { buffer: this.bufPartials } },
        { binding: 4, resource: { buffer: this.bufDisp } },
        { binding: 5, resource: { buffer: this.bufInf } },
      ],
    })
  }

  private buffer(size: number, usage: GPUBufferUsageFlags, init?: ArrayBuffer): GPUBuffer {
    const b = this.device.createBuffer({ size: Math.ceil(size / 4) * 4, usage, mappedAtCreation: !!init })
    if (init) {
      new Uint8Array(b.getMappedRange()).set(new Uint8Array(init))
      b.unmap()
    }
    return b
  }

  /** Surfaces WGSL compile errors as one readable exception. */
  private async checkCompiled(): Promise<void> {
    for (const m of this.modules) {
      const info = await m.getCompilationInfo()
      const errs = info.messages.filter((x) => x.type === 'error')
      if (errs.length) throw new Error(`flood WGSL: ${errs.map((e) => `${e.lineNum}:${e.linePos} ${e.message}`).join('; ')}`)
    }
  }

  private guard(): void {
    if (this.disposed) throw new Error('flood solver disposed')
    if (this.lost) throw new Error(`flood GPU device lost: ${this.lost}`)
  }

  private async readBack(src: GPUBuffer, size: number, encoder?: GPUCommandEncoder, after?: (e: GPUCommandEncoder) => void): Promise<ArrayBuffer> {
    const staging = this.device.createBuffer({ size, usage: GPUBufferUsage.MAP_READ | GPUBufferUsage.COPY_DST })
    const e = encoder ?? this.device.createCommandEncoder()
    e.copyBufferToBuffer(src, 0, staging, 0, size)
    after?.(e)
    this.device.queue.submit([e.finish()])
    await staging.mapAsync(GPUMapMode.READ)
    const out = staging.getMappedRange().slice(0)
    staging.unmap()
    staging.destroy()
    return out
  }

  async advance(tStopS: number, maxSteps: number): Promise<AdvanceResult> {
    this.guard()
    const steps = Math.max(0, Math.floor(maxSteps))
    this.device.queue.writeBuffer(this.bufCtrl, 4, new Uint32Array([Math.round(tStopS * 1000)]))
    const before = this.lastAdvance
    const e = this.device.createCommandEncoder()
    if (steps > 0) {
      const { nx, ny } = this.grid
      const fx = Math.ceil((nx + 1) / WG)
      const fy = Math.ceil((ny + 1) / WG)
      const cx = Math.ceil(nx / WG)
      const cy = Math.ceil(ny / WG)
      const pass = e.beginComputePass()
      for (let k = 0; k < steps; k++) {
        pass.setBindGroup(0, this.stepGroups[this.parity])
        pass.setPipeline(this.pipes.dt); pass.dispatchWorkgroups(1)
        pass.setPipeline(this.pipes.flux); pass.dispatchWorkgroups(fx, fy)
        pass.setPipeline(this.pipes.limit); pass.dispatchWorkgroups(cx, cy)
        pass.setPipeline(this.pipes.scale); pass.dispatchWorkgroups(fx, fy)
        pass.setPipeline(this.pipes.cont); pass.dispatchWorkgroups(cx, cy)
        this.parity ^= 1
      }
      pass.end()
    }
    const ctrl = await this.readBack(this.bufCtrl, CTRL_BYTES, e)
    this.guard()
    const u = new Uint32Array(ctrl)
    const totalSteps = u[3]
    this.lastAdvance = { t: u[0] / 1000, steps: totalSteps, dt: u[2] > 0 ? u[2] / 1000 : before.dt }
    return { t: u[0] / 1000, steps: totalSteps - before.steps, dt: this.lastAdvance.dt }
  }

  private dispatchIo(e: GPUCommandEncoder, pipe: GPUComputePipeline): void {
    const pass = e.beginComputePass()
    pass.setPipeline(pipe)
    pass.setBindGroup(0, this.ioGroup)
    pass.dispatchWorkgroups(this.ioGroups[0], this.ioGroups[1])
    pass.end()
  }

  async stats(): Promise<FloodStats> {
    this.guard()
    const nPart = this.ioGroups[0] * this.ioGroups[1]
    const partBytes = nPart * 32
    const bndBytes = Math.max(4, this.nb * 4)
    const size = partBytes + bndBytes + CTRL_BYTES
    const staging = this.device.createBuffer({ size, usage: GPUBufferUsage.MAP_READ | GPUBufferUsage.COPY_DST })
    const e = this.device.createCommandEncoder()
    this.dispatchIo(e, this.pipes.stats)
    e.copyBufferToBuffer(this.bufPartials, 0, staging, 0, partBytes)
    e.copyBufferToBuffer(this.bufBnd, 0, staging, partBytes, bndBytes)
    e.copyBufferToBuffer(this.bufCtrl, 0, staging, partBytes + bndBytes, CTRL_BYTES)
    // The boundary accumulators hold what left since the last read: fold them
    // into the float64 total and start again (float32 sums over a whole event
    // would lose the small late outflows).
    e.clearBuffer(this.bufBnd)
    this.device.queue.submit([e.finish()])
    await staging.mapAsync(GPUMapMode.READ)
    const raw = staging.getMappedRange().slice(0)
    staging.unmap()
    staging.destroy()
    this.guard()
    const part = new Float32Array(raw, 0, nPart * 8)
    const bnd = new Float32Array(raw, partBytes, this.nb)
    const ctrlU = new Uint32Array(raw, partBytes + bndBytes, CTRL_BYTES / 4)
    let sumH = 0
    let wet = 0
    let hMax = 0
    let vMax = 0
    let sumInf = 0
    for (let k = 0; k < nPart; k++) {
      const o = k * 8
      sumH += part[o]
      wet += part[o + 1]
      if (part[o + 2] > hMax) hMax = part[o + 2]
      if (part[o + 3] > vMax) vMax = part[o + 3]
      sumInf += part[o + 4]
    }
    for (let k = 0; k < this.nb; k++) this.outflow += bnd[k]
    const tMs = ctrlU[0]
    const a = this.grid.dx * this.grid.dx
    const volume = sumH * a
    const rainVolume = depthFromRates(this.rates, this.ivMs, tMs) * this.rainArea
    const infiltratedVolume = sumInf * a
    return {
      t: tMs / 1000,
      dt: ctrlU[2] > 0 ? ctrlU[2] / 1000 : this.lastAdvance.dt,
      steps: ctrlU[3],
      hMax, vMax, volume,
      floodedArea: wet * a,
      rainVolume,
      outflowVolume: this.outflow,
      infiltratedVolume,
      initialVolume: this.v0,
      massError: (volume + this.outflow + infiltratedVolume - rainVolume - this.v0) / Math.max(rainVolume + this.v0, 1e-12),
    }
  }

  async fields(): Promise<FieldFrame> {
    this.guard()
    const raw = new Float32Array(await this.readBack(this.bufCells, this.nc * 16))
    const h = new Float32Array(this.nc)
    const u = new Float32Array(this.nc)
    const v = new Float32Array(this.nc)
    for (let c = 0; c < this.nc; c++) {
      h[c] = raw[c * 4]
      u[c] = raw[c * 4 + 1]
      v[c] = raw[c * 4 + 2]
    }
    return { t: this.lastAdvance.t, nx: this.grid.nx, ny: this.grid.ny, h, u, v }
  }

  async maxFields(): Promise<MaxFields> {
    this.guard()
    const raw = new Float32Array(await this.readBack(this.bufMax, this.nc * 16))
    const out: MaxFields = {
      nx: this.grid.nx, ny: this.grid.ny,
      hMax: new Float32Array(this.nc), vMax: new Float32Array(this.nc),
      tPeak: new Float32Array(this.nc), tWet: new Float32Array(this.nc),
    }
    for (let c = 0; c < this.nc; c++) {
      out.hMax[c] = raw[c * 4]
      out.vMax[c] = raw[c * 4 + 1]
      out.tPeak[c] = raw[c * 4 + 2]
      out.tWet[c] = raw[c * 4 + 3]
    }
    return out
  }

  async displayFrame(): Promise<Uint16Array> {
    this.guard()
    const e = this.device.createCommandEncoder()
    this.dispatchIo(e, this.pipes.pack)
    return new Uint16Array(await this.readBack(this.bufDisp, this.nc * 8, e))
  }

  /** Face discharges, for the parity tests (layout of core/grid.ts). */
  async faces(): Promise<{ qx: Float32Array; qy: Float32Array }> {
    const raw = new Float32Array(await this.readBack(this.bufQ[this.parity], this.nf * 8))
    const qx = new Float32Array(this.nf)
    const qy = new Float32Array(this.nf)
    for (let f = 0; f < this.nf; f++) {
      qx[f] = raw[f * 2]
      qy[f] = raw[f * 2 + 1]
    }
    return { qx, qy }
  }

  dispose(): void {
    if (this.disposed) return
    this.disposed = true
    for (const b of [this.bufParams, this.bufRain, this.bufCtrl, this.bufCells, ...this.bufQ, this.bufMax, this.bufBnd, this.bufInf, this.bufPartials, this.bufDisp]) b.destroy()
    this.texStatic.destroy()
    if (this.ownsDevice) this.device.destroy()
  }
}
