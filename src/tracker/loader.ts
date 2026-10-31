// ─── <tracking-globe> loader ─────────────────────────────────────────────────
// The only file a host page pays for up front. It reserves the box (no layout
// shift), paints a CSS placeholder, and fetches the engine when the widget nears
// the viewport and the main thread is idle, or on click with lazy="click".
// The engine is injected as a classic script, so it needs no CORS on any host.
import { decodeConfig, type TrackerConfig } from './config'

const SRC = (document.currentScript as HTMLScriptElement | null)?.src ?? ''
const ENGINE = SRC.replace(/[^/]*$/, 'engine.js')
const W = window as unknown as { __trackingGlobeEngine?: Mount; __trackingGlobeWaiters?: ((m: Mount) => void)[] }

export interface Controller { call(method: string, args: unknown[]): unknown; dispose(): void }
export type Mount = (host: HTMLElement, root: ShadowRoot, cfg: TrackerConfig) => Controller

function engine(): Promise<Mount> {
  if (W.__trackingGlobeEngine) return Promise.resolve(W.__trackingGlobeEngine)
  return new Promise((res, rej) => {
    if (W.__trackingGlobeWaiters) { W.__trackingGlobeWaiters.push(res); return }
    W.__trackingGlobeWaiters = [res]
    const s = document.createElement('script')
    s.src = ENGINE; s.async = true; s.onerror = () => { W.__trackingGlobeWaiters = undefined; rej(new Error('engine')) }
    document.head.appendChild(s)
  })
}

class TrackingGlobe extends HTMLElement {
  private ctl: Controller | null = null
  private queue: [string, unknown[]][] = []
  private io: IntersectionObserver | null = null
  private cfg: TrackerConfig | null = null

  connectedCallback(): void {
    if (this.shadowRoot) return
    const cfg = this.cfg = this.readConfig()
    const root = this.attachShadow({ mode: 'open' })
    const dark = cfg.theme.preset !== 'light'
    const bg = cfg.theme.background ?? (dark ? '#0b0f17' : '#f5f6f8')
    const ball = cfg.theme.ocean ?? (dark ? '#111826' : '#e4e8ee')
    const style = this.getAttribute('height') === 'fill' ? 'height:100%' : `height:${cfg.height}px;max-height:100dvh`
    root.innerHTML = `<style>:host{display:block;contain:content;${style};border-radius:${cfg.theme.radius}px;overflow:hidden;background:${bg}}.ph{position:absolute;inset:0;display:grid;place-items:center}.b{width:min(62%,62cqh,420px);aspect-ratio:1;border-radius:50%;background:${ball}}button{all:unset;cursor:pointer;position:absolute;padding:10px 18px;border-radius:999px;background:#fff;color:#111;font:500 14px system-ui,sans-serif}</style><div class="ph" part="placeholder"><div class="b"></div></div>`
    this.style.position = this.style.position || 'relative'
    if (cfg.lazy === 'click') {
      const b = document.createElement('button'); b.textContent = this.getAttribute('load-label') ?? '▶'
      b.setAttribute('aria-label', this.getAttribute('load-label') ?? 'Show the tracking map')
      b.onclick = () => this.start()
      root.querySelector('.ph')!.appendChild(b)
      return
    }
    if (!('IntersectionObserver' in window)) { this.start(); return }
    this.io = new IntersectionObserver(es => {
      if (es.some(e => e.isIntersecting)) {
        this.io?.disconnect(); this.io = null
        const idle = (window as unknown as { requestIdleCallback?: (f: () => void, o: object) => void }).requestIdleCallback
        if (idle) idle(() => this.start(), { timeout: 1500 }); else setTimeout(() => this.start(), 200)
      }
    }, { rootMargin: '300px' })
    this.io.observe(this)
  }
  disconnectedCallback(): void { this.io?.disconnect(); this.ctl?.dispose(); this.ctl = null }

  private readConfig(): TrackerConfig {
    const cfg = decodeConfig(this.getAttribute('config'))
    const h = Number(this.getAttribute('height')); if (h > 0) cfg.height = h
    const l = this.getAttribute('lang'); if (l) cfg.lang = l
    return cfg
  }
  private async start(): Promise<void> {
    if (this.ctl || !this.cfg) return
    try {
      const mount = await engine()
      if (!this.isConnected) return
      this.ctl = mount(this, this.shadowRoot!, this.cfg)
      for (const [m, a] of this.queue) this.ctl.call(m, a)
      this.queue = []
    } catch { this.dispatchEvent(new CustomEvent('tg-error', { detail: { reason: 'engine-load-failed' } })) }
  }
  private invoke(m: string, a: unknown[]): unknown { if (this.ctl) return this.ctl.call(m, a); this.queue.push([m, a]); return undefined }
  /** Replace what is shown. Works before the engine has loaded. */
  setShipments(list: unknown): void { this.invoke('setShipments', [list]) }
  select(id: string | null): void { this.invoke('select', [id]) }
  setView(v: 'globe' | 'map'): void { this.invoke('setView', [v]) }
  update(cfg: unknown): void { this.invoke('update', [cfg]) }
  rotate(deg: number): void { this.invoke('rotate', [deg]) }
  toPNG(): string | undefined { return this.ctl?.call('toPNG', []) as string | undefined }
  load(): void { void this.start() }
}
if (!customElements.get('tracking-globe')) customElements.define('tracking-globe', TrackingGlobe)
