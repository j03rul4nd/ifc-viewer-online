// ─── WebGL2 local-inertial solver (fallback) ─────────────────────────────────
// For browsers without WebGPU. Same scheme, same clock, same interface; runs on
// its own WebGL2 context — an OffscreenCanvas when there is one (the flood
// worker), so it never competes with the viewer's context for state. Needs
// EXT_color_buffer_float to render into float textures (WebGL2 everywhere that
// matters has it; without it the feature is reported unsupported).
//
// The CPU waits for a batch with a fence it polls between tasks, never with a
// blocking read, so a long batch does not freeze the thread it runs on.

import { effectiveRainArea, initialVolume, validateGrid, type FloodGrid } from '../core/grid'
import { depthFromRates, intervalMs, ratesMs } from '../core/hyetograph'
import { packDisplay } from '../core/half'
import {
  edgeBits, resolveParams,
  type AdvanceResult, type FieldFrame, type FloodSolver, type FloodStats, type MaxFields, type SolverInit, type SolverParams,
} from '../core/solver-api'
import { FS_BND, FS_CONT, FS_DT, FS_FLUX, FS_LIMIT, FS_REDUCE, FS_SCALE, VS } from './glsl'

type GL = WebGL2RenderingContext

interface Tex { tex: WebGLTexture; fbo: WebGLFramebuffer; w: number; h: number }

export interface WebGl2Options {
  powerPreference?: WebGLPowerPreference
  /** Use this context (tests / main thread); otherwise an OffscreenCanvas one is created. */
  gl?: GL
}

const RAIN_W = 64

function createContext(o: WebGl2Options): GL {
  if (o.gl) return o.gl
  const attrs: WebGLContextAttributes = {
    alpha: false, depth: false, stencil: false, antialias: false, premultipliedAlpha: false,
    preserveDrawingBuffer: false, powerPreference: o.powerPreference ?? 'default',
  }
  let gl: GL | null = null
  if (typeof OffscreenCanvas !== 'undefined') gl = new OffscreenCanvas(1, 1).getContext('webgl2', attrs) as GL | null
  else if (typeof document !== 'undefined') gl = document.createElement('canvas').getContext('webgl2', attrs)
  if (!gl) throw new Error('WebGL2 is not available')
  return gl
}

export class WebGl2InertialSolver implements FloodSolver {
  readonly backend = 'webgl2' as const
  readonly grid: FloodGrid
  readonly params: SolverParams
  readonly renderer: string

  private readonly gl: GL
  private readonly rates: Float32Array
  private readonly ivMs: number
  private readonly rainArea: number
  private readonly v0: number
  private readonly nb: number
  private readonly bndW: number

  private readonly progs: Record<'dt' | 'flux' | 'limit' | 'scale' | 'bnd' | 'cont' | 'reduce', { p: WebGLProgram; u: Record<string, WebGLUniformLocation | null> }>
  private readonly vao: WebGLVertexArrayObject
  private readonly tStatic: WebGLTexture
  private readonly tRain: WebGLTexture
  private ctrl: [Tex, Tex]
  private q: Tex
  private qTmp: Tex
  private readonly factor: Tex
  private bnd: [Tex, Tex]
  private cells: [Tex, Tex]
  private maxf: [Tex, Tex]
  /** contFbo[k] renders into cells[k] + maxf[k]; swapped together with them. */
  private contFbo: [WebGLFramebuffer, WebGLFramebuffer]
  private readonly ownsContext: boolean
  private readonly hLevels: Tex[]
  private readonly sLevels: Tex[]

  private outflow = 0
  private lastDt = 0
  private disposed = false
  private lost = false

  static async create(init: SolverInit, o: WebGl2Options = {}): Promise<WebGl2InertialSolver> {
    return new WebGl2InertialSolver(init, createContext(o), !o.gl)
  }

  private constructor(init: SolverInit, gl: GL, ownsContext: boolean) {
    this.ownsContext = ownsContext
    const g = validateGrid(init.grid)
    this.grid = g
    this.params = resolveParams(init.params)
    this.gl = gl
    if (!gl.getExtension('EXT_color_buffer_float')) throw new Error('This GPU cannot render to float textures (EXT_color_buffer_float)')
    const dbg = gl.getExtension('WEBGL_debug_renderer_info')
    this.renderer = String(dbg ? gl.getParameter(dbg.UNMASKED_RENDERER_WEBGL) : gl.getParameter(gl.RENDERER))
    const canvas = gl.canvas as (HTMLCanvasElement | OffscreenCanvas) & EventTarget
    canvas.addEventListener?.('webglcontextlost', () => { this.lost = true })

    this.rates = ratesMs(init.hyetograph)
    this.ivMs = intervalMs(init.hyetograph)
    if (this.ivMs * (this.rates.length + 1) >= 2 ** 31) throw new Error('flood: rain event too long for the millisecond clock')
    this.rainArea = effectiveRainArea(g)
    this.v0 = initialVolume(g)
    const { nx, ny } = g
    const maxTex = gl.getParameter(gl.MAX_TEXTURE_SIZE) as number
    if (nx + 1 > maxTex || ny + 1 > maxTex) throw new Error(`flood grid larger than this GPU's textures (${maxTex})`)
    this.nb = 2 * (nx + ny)
    this.bndW = Math.min(1024, this.nb)

    gl.disable(gl.DITHER)
    gl.disable(gl.BLEND)
    gl.disable(gl.DEPTH_TEST)
    gl.pixelStorei(gl.UNPACK_ALIGNMENT, 1)
    gl.pixelStorei(gl.PACK_ALIGNMENT, 1)
    this.vao = gl.createVertexArray()!
    gl.bindVertexArray(this.vao) // the passes draw a buffer-less triangle

    const p = this.params
    this.progs = {
      dt: this.program(FS_DT),
      flux: this.program(FS_FLUX),
      limit: this.program(FS_LIMIT),
      scale: this.program(FS_SCALE),
      bnd: this.program(FS_BND),
      cont: this.program(FS_CONT),
      reduce: this.program(FS_REDUCE),
    }

    // Static data.
    const st = new Float32Array(nx * ny * 4)
    for (let c = 0; c < nx * ny; c++) {
      st[c * 4] = g.z[c]
      st[c * 4 + 1] = g.rainFactor[c]
      st[c * 4 + 2] = g.manning[c]
      st[c * 4 + 3] = g.blocked[c]
    }
    this.tStatic = this.texture(nx, ny, gl.RGBA32F, gl.RGBA, gl.FLOAT, st)
    const rainH = Math.max(1, Math.ceil(this.rates.length / RAIN_W))
    const rain = new Float32Array(RAIN_W * rainH)
    rain.set(this.rates)
    this.tRain = this.texture(RAIN_W, rainH, gl.R32F, gl.RED, gl.FLOAT, rain)

    // State.
    const cells = new Float32Array(nx * ny * 4)
    const mx = new Float32Array(nx * ny * 4)
    for (let c = 0; c < nx * ny; c++) {
      const h = g.h0 && !g.blocked[c] ? g.h0[c] : 0
      cells[c * 4] = h
      mx[c * 4] = h
      mx[c * 4 + 3] = h > p.wetThreshold ? 0 : -1
    }
    this.ctrl = [this.target(1, 1, gl.RGBA32UI, gl.RGBA_INTEGER, gl.UNSIGNED_INT, new Uint32Array(4)), this.target(1, 1, gl.RGBA32UI, gl.RGBA_INTEGER, gl.UNSIGNED_INT)]
    this.q = this.target(nx + 1, ny + 1, gl.RG32F, gl.RG, gl.FLOAT, new Float32Array((nx + 1) * (ny + 1) * 2))
    this.qTmp = this.target(nx + 1, ny + 1, gl.RG32F, gl.RG, gl.FLOAT)
    this.factor = this.target(nx, ny, gl.R32F, gl.RED, gl.FLOAT)
    const bndH = Math.ceil(this.nb / this.bndW)
    this.bnd = [
      this.target(this.bndW, bndH, gl.R32F, gl.RED, gl.FLOAT, new Float32Array(this.bndW * bndH)),
      this.target(this.bndW, bndH, gl.R32F, gl.RED, gl.FLOAT, new Float32Array(this.bndW * bndH)),
    ]
    this.cells = [this.target(nx, ny, gl.RGBA32F, gl.RGBA, gl.FLOAT, cells), this.target(nx, ny, gl.RGBA32F, gl.RGBA, gl.FLOAT)]
    this.maxf = [this.target(nx, ny, gl.RGBA32F, gl.RGBA, gl.FLOAT, mx), this.target(nx, ny, gl.RGBA32F, gl.RGBA, gl.FLOAT)]
    this.contFbo = [this.mrt(this.cells[0], this.maxf[0]), this.mrt(this.cells[1], this.maxf[1])]
    this.hLevels = this.levels(nx, ny, gl.R32F, gl.RED)
    this.sLevels = this.levels(nx, ny, gl.RGBA32F, gl.RGBA)

    // Constant uniforms, set once per program.
    const set = (name: keyof WebGl2InertialSolver['progs'], f: (u: Record<string, WebGLUniformLocation | null>) => void): void => {
      gl.useProgram(this.progs[name].p)
      f(this.progs[name].u)
    }
    const units = (u: Record<string, WebGLUniformLocation | null>, names: string[]): void => names.forEach((n, k) => gl.uniform1i(u[n], k))
    const geo = (u: Record<string, WebGLUniformLocation | null>): void => {
      gl.uniform1i(u.uNx, nx); gl.uniform1i(u.uNy, ny)
      gl.uniform1f(u.uDx, g.dx); gl.uniform1f(u.uG, p.g); gl.uniform1f(u.uHEps, p.hEps)
    }
    set('dt', (u) => {
      units(u, ['uCtrl', 'uHmax', 'uRain'])
      gl.uniform1ui(u.uRainIv, this.ivMs); gl.uniform1ui(u.uRainCount, this.rates.length); gl.uniform1i(u.uRainW, RAIN_W)
      gl.uniform1f(u.uAlpha, p.alpha); gl.uniform1f(u.uDx, g.dx); gl.uniform1f(u.uG, p.g); gl.uniform1f(u.uDtMax, p.dtMax)
    })
    set('flux', (u) => {
      units(u, ['uQ', 'uCells', 'uStatic', 'uCtrl'])
      geo(u)
      gl.uniform1ui(u.uEdges, edgeBits(p.boundary)); gl.uniform1f(u.uTheta, p.theta)
      gl.uniform1f(u.uFreeSlopeMin, p.freeSlopeMin); gl.uniform1i(u.uImplicit, p.friction === 'implicit' ? 1 : 0)
    })
    set('limit', (u) => { units(u, ['uQ', 'uCells', 'uCtrl']); gl.uniform1f(u.uDx, g.dx) })
    set('scale', (u) => { units(u, ['uQ', 'uFactor', 'uCtrl']); gl.uniform1i(u.uNx, nx); gl.uniform1i(u.uNy, ny) })
    set('bnd', (u) => {
      units(u, ['uQ', 'uPrev', 'uCtrl'])
      gl.uniform1i(u.uNx, nx); gl.uniform1i(u.uNy, ny); gl.uniform1i(u.uW, this.bndW); gl.uniform1f(u.uDx, g.dx)
    })
    set('cont', (u) => { units(u, ['uQ', 'uCells', 'uMax', 'uStatic', 'uCtrl']); geo(u); gl.uniform1f(u.uWet, p.wetThreshold) })
    set('reduce', (u) => { units(u, ['uSrc']); gl.uniform1f(u.uWet, p.wetThreshold) })

    this.reduceHmax()
    this.check()
  }

  // ── GL helpers ─────────────────────────────────────────────────────────────

  private program(fs: string): { p: WebGLProgram; u: Record<string, WebGLUniformLocation | null> } {
    const gl = this.gl
    const sh = (type: number, src: string): WebGLShader => {
      const s = gl.createShader(type)!
      gl.shaderSource(s, src)
      gl.compileShader(s)
      if (!gl.getShaderParameter(s, gl.COMPILE_STATUS)) throw new Error(`flood GLSL: ${gl.getShaderInfoLog(s)}`)
      return s
    }
    const p = gl.createProgram()!
    gl.attachShader(p, sh(gl.VERTEX_SHADER, VS))
    gl.attachShader(p, sh(gl.FRAGMENT_SHADER, fs))
    gl.linkProgram(p)
    if (!gl.getProgramParameter(p, gl.LINK_STATUS)) throw new Error(`flood GLSL link: ${gl.getProgramInfoLog(p)}`)
    const u: Record<string, WebGLUniformLocation | null> = {}
    const n = gl.getProgramParameter(p, gl.ACTIVE_UNIFORMS) as number
    for (let k = 0; k < n; k++) {
      const info = gl.getActiveUniform(p, k)
      if (info) u[info.name] = gl.getUniformLocation(p, info.name)
    }
    return { p, u }
  }

  private texture(w: number, h: number, internal: number, format: number, type: number, data?: ArrayBufferView | null): WebGLTexture {
    const gl = this.gl
    const t = gl.createTexture()!
    gl.bindTexture(gl.TEXTURE_2D, t)
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.NEAREST)
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.NEAREST)
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE)
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE)
    gl.texImage2D(gl.TEXTURE_2D, 0, internal, w, h, 0, format, type, data ?? null)
    return t
  }

  private target(w: number, h: number, internal: number, format: number, type: number, data?: ArrayBufferView): Tex {
    const gl = this.gl
    const tex = this.texture(w, h, internal, format, type, data)
    const fbo = gl.createFramebuffer()!
    gl.bindFramebuffer(gl.FRAMEBUFFER, fbo)
    gl.framebufferTexture2D(gl.FRAMEBUFFER, gl.COLOR_ATTACHMENT0, gl.TEXTURE_2D, tex, 0)
    const status = gl.checkFramebufferStatus(gl.FRAMEBUFFER)
    if (status !== gl.FRAMEBUFFER_COMPLETE) throw new Error(`flood: cannot render to this texture format (0x${status.toString(16)})`)
    return { tex, fbo, w, h }
  }

  private mrt(a: Tex, b: Tex): WebGLFramebuffer {
    const gl = this.gl
    const fbo = gl.createFramebuffer()!
    gl.bindFramebuffer(gl.FRAMEBUFFER, fbo)
    gl.framebufferTexture2D(gl.FRAMEBUFFER, gl.COLOR_ATTACHMENT0, gl.TEXTURE_2D, a.tex, 0)
    gl.framebufferTexture2D(gl.FRAMEBUFFER, gl.COLOR_ATTACHMENT1, gl.TEXTURE_2D, b.tex, 0)
    gl.drawBuffers([gl.COLOR_ATTACHMENT0, gl.COLOR_ATTACHMENT1])
    if (gl.checkFramebufferStatus(gl.FRAMEBUFFER) !== gl.FRAMEBUFFER_COMPLETE) throw new Error('flood: multiple float render targets unsupported')
    return fbo
  }

  private levels(w: number, h: number, internal: number, format: number): Tex[] {
    const out: Tex[] = []
    let cw = w
    let ch = h
    do {
      cw = Math.ceil(cw / 4)
      ch = Math.ceil(ch / 4)
      out.push(this.target(cw, ch, internal, format, this.gl.FLOAT))
    } while (cw > 1 || ch > 1)
    return out
  }

  private draw(prog: keyof WebGl2InertialSolver['progs'], fbo: WebGLFramebuffer, w: number, h: number, textures: WebGLTexture[]): void {
    const gl = this.gl
    gl.useProgram(this.progs[prog].p)
    for (let k = 0; k < textures.length; k++) {
      gl.activeTexture(gl.TEXTURE0 + k)
      gl.bindTexture(gl.TEXTURE_2D, textures[k])
    }
    gl.bindFramebuffer(gl.FRAMEBUFFER, fbo)
    gl.viewport(0, 0, w, h)
    gl.drawArrays(gl.TRIANGLES, 0, 3)
  }

  /** Unbinds everything so no texture is both sampled and rendered to next time. */
  private unbindAll(n = 5): void {
    const gl = this.gl
    for (let k = 0; k < n; k++) {
      gl.activeTexture(gl.TEXTURE0 + k)
      gl.bindTexture(gl.TEXTURE_2D, null)
    }
  }

  private reduce(levels: Tex[], src: Tex, firstMode: number, nextMode: number): Tex {
    const u = this.progs.reduce.u
    let from = src
    for (let k = 0; k < levels.length; k++) {
      const to = levels[k]
      this.gl.useProgram(this.progs.reduce.p)
      this.gl.uniform2i(u.uSrcSize, from.w, from.h)
      this.gl.uniform1i(u.uMode, k === 0 ? firstMode : nextMode)
      this.draw('reduce', to.fbo, to.w, to.h, [from.tex])
      this.unbindAll(1)
      from = to
    }
    return from
  }

  private reduceHmax(): void {
    this.reduce(this.hLevels, this.cells[0], 0, 1)
  }

  private check(): void {
    if (this.disposed) throw new Error('flood solver disposed')
    if (this.lost || this.gl.isContextLost()) throw new Error('flood: WebGL context lost')
    const e = this.gl.getError()
    if (e !== this.gl.NO_ERROR) throw new Error(`flood: WebGL error 0x${e.toString(16)}`)
  }

  /** Waits for the GPU without blocking the thread (fence polled between tasks). */
  private async finish(): Promise<void> {
    const gl = this.gl
    const sync = gl.fenceSync(gl.SYNC_GPU_COMMANDS_COMPLETE, 0)
    gl.flush()
    if (!sync) return
    try {
      for (;;) {
        const r = gl.clientWaitSync(sync, 0, 0)
        if (r === gl.ALREADY_SIGNALED || r === gl.CONDITION_SATISFIED) return
        if (r === gl.WAIT_FAILED) throw new Error('flood: GPU wait failed')
        await new Promise((res) => setTimeout(res, 1))
      }
    } finally {
      gl.deleteSync(sync)
    }
  }

  private readCtrl(): Uint32Array {
    const gl = this.gl
    const out = new Uint32Array(4)
    gl.bindFramebuffer(gl.FRAMEBUFFER, this.ctrl[0].fbo)
    gl.readPixels(0, 0, 1, 1, gl.RGBA_INTEGER, gl.UNSIGNED_INT, out)
    return out
  }

  private readFloat(t: Tex, channels: 1 | 4): Float32Array {
    const gl = this.gl
    const rgba = new Float32Array(t.w * t.h * 4)
    gl.bindFramebuffer(gl.FRAMEBUFFER, t.fbo)
    gl.readPixels(0, 0, t.w, t.h, gl.RGBA, gl.FLOAT, rgba)
    if (channels === 4) return rgba
    const out = new Float32Array(t.w * t.h)
    for (let k = 0; k < out.length; k++) out[k] = rgba[k * 4]
    return out
  }

  // ── Solver ─────────────────────────────────────────────────────────────────

  async advance(tStopS: number, maxSteps: number): Promise<AdvanceResult> {
    this.check()
    const gl = this.gl
    const { nx, ny } = this.grid
    const before = this.readCtrl()
    gl.useProgram(this.progs.dt.p)
    gl.uniform1ui(this.progs.dt.u.uTStop, Math.round(tStopS * 1000))
    const hTop = this.hLevels[this.hLevels.length - 1]
    const steps = Math.max(0, Math.floor(maxSteps))
    for (let k = 0; k < steps; k++) {
      // dt: ctrl[0] → ctrl[1], then swap so ctrl[0] is always current.
      this.draw('dt', this.ctrl[1].fbo, 1, 1, [this.ctrl[0].tex, hTop.tex, this.tRain])
      this.unbindAll(3)
      this.ctrl = [this.ctrl[1], this.ctrl[0]]
      const C = this.ctrl[0].tex
      this.draw('flux', this.qTmp.fbo, nx + 1, ny + 1, [this.q.tex, this.cells[0].tex, this.tStatic, C])
      this.unbindAll(4)
      this.draw('limit', this.factor.fbo, nx, ny, [this.qTmp.tex, this.cells[0].tex, C])
      this.unbindAll(3)
      this.draw('scale', this.q.fbo, nx + 1, ny + 1, [this.qTmp.tex, this.factor.tex, C])
      this.unbindAll(3)
      const bndH = this.bnd[1].h
      this.draw('bnd', this.bnd[1].fbo, this.bndW, bndH, [this.q.tex, this.bnd[0].tex, C])
      this.unbindAll(3)
      this.bnd = [this.bnd[1], this.bnd[0]]
      this.draw('cont', this.contFbo[1], nx, ny, [this.q.tex, this.cells[0].tex, this.maxf[0].tex, this.tStatic, C])
      this.unbindAll(5)
      this.cells = [this.cells[1], this.cells[0]]
      this.maxf = [this.maxf[1], this.maxf[0]]
      this.contFbo = [this.contFbo[1], this.contFbo[0]]
      this.reduceHmax()
    }
    await this.finish()
    this.check()
    const after = this.readCtrl()
    if (after[1] > 0) this.lastDt = after[1] / 1000
    return { t: after[0] / 1000, steps: after[2] - before[2], dt: this.lastDt }
  }

  async stats(): Promise<FloodStats> {
    this.check()
    const gl = this.gl
    const top = this.reduce(this.sLevels, this.cells[0], 2, 3)
    await this.finish()
    const s = this.readFloat(top, 4)
    const bnd = this.readFloat(this.bnd[0], 1)
    for (let k = 0; k < this.nb; k++) this.outflow += bnd[k]
    // Restart the per-read boundary accumulators (see the WebGPU solver).
    for (const t of this.bnd) {
      gl.bindFramebuffer(gl.FRAMEBUFFER, t.fbo)
      gl.clearBufferfv(gl.COLOR, 0, [0, 0, 0, 0])
    }
    const ctrl = this.readCtrl()
    this.check()
    const a = this.grid.dx * this.grid.dx
    const volume = s[0] * a
    const rainVolume = depthFromRates(this.rates, this.ivMs, ctrl[0]) * this.rainArea
    return {
      t: ctrl[0] / 1000,
      dt: ctrl[1] > 0 ? ctrl[1] / 1000 : this.lastDt,
      steps: ctrl[2],
      hMax: s[2], vMax: s[3], volume,
      floodedArea: s[1] * a,
      rainVolume,
      outflowVolume: this.outflow,
      initialVolume: this.v0,
      massError: (volume + this.outflow - rainVolume - this.v0) / Math.max(rainVolume + this.v0, 1e-12),
    }
  }

  async fields(): Promise<FieldFrame> {
    this.check()
    await this.finish()
    const raw = this.readFloat(this.cells[0], 4)
    const n = this.grid.nx * this.grid.ny
    const h = new Float32Array(n)
    const u = new Float32Array(n)
    const v = new Float32Array(n)
    for (let c = 0; c < n; c++) {
      h[c] = raw[c * 4]
      u[c] = raw[c * 4 + 1]
      v[c] = raw[c * 4 + 2]
    }
    return { t: this.readCtrl()[0] / 1000, nx: this.grid.nx, ny: this.grid.ny, h, u, v }
  }

  async maxFields(): Promise<MaxFields> {
    this.check()
    await this.finish()
    const raw = this.readFloat(this.maxf[0], 4)
    const n = this.grid.nx * this.grid.ny
    const out: MaxFields = {
      nx: this.grid.nx, ny: this.grid.ny,
      hMax: new Float32Array(n), vMax: new Float32Array(n), tPeak: new Float32Array(n), tWet: new Float32Array(n),
    }
    for (let c = 0; c < n; c++) {
      out.hMax[c] = raw[c * 4]
      out.vMax[c] = raw[c * 4 + 1]
      out.tPeak[c] = raw[c * 4 + 2]
      out.tWet[c] = raw[c * 4 + 3]
    }
    return out
  }

  async displayFrame(): Promise<Uint16Array> {
    const f = await this.fields()
    const m = this.readFloat(this.maxf[0], 4)
    const hMax = new Float32Array(f.h.length)
    for (let c = 0; c < hMax.length; c++) hMax[c] = m[c * 4]
    return packDisplay(f.h, f.u, f.v, hMax)
  }

  async faces(): Promise<{ qx: Float32Array; qy: Float32Array }> {
    await this.finish()
    const raw = this.readFloat(this.q, 4)
    const nf = this.q.w * this.q.h
    const qx = new Float32Array(nf)
    const qy = new Float32Array(nf)
    for (let f = 0; f < nf; f++) {
      qx[f] = raw[f * 4]
      qy[f] = raw[f * 4 + 1]
    }
    return { qx, qy }
  }

  dispose(): void {
    if (this.disposed) return
    this.disposed = true
    const gl = this.gl
    gl.deleteTexture(this.tStatic)
    gl.deleteTexture(this.tRain)
    for (const t of [...this.ctrl, this.q, this.qTmp, this.factor, ...this.bnd, ...this.cells, ...this.maxf, ...this.hLevels, ...this.sLevels]) {
      gl.deleteTexture(t.tex)
      gl.deleteFramebuffer(t.fbo)
    }
    for (const f of this.contFbo) gl.deleteFramebuffer(f)
    for (const pr of Object.values(this.progs)) gl.deleteProgram(pr.p)
    gl.deleteVertexArray(this.vao)
    if (this.ownsContext) gl.getExtension('WEBGL_lose_context')?.loseContext()
  }
}
