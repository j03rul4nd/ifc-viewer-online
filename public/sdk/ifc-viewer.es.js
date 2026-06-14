var m = Object.defineProperty;
var w = (i, t, e) => t in i ? m(i, t, { enumerable: !0, configurable: !0, writable: !0, value: e }) : i[t] = e;
var n = (i, t, e) => w(i, typeof t != "symbol" ? t + "" : t, e);
const f = [
  { code: "en", label: "English" },
  { code: "es", label: "Español" },
  { code: "de", label: "Deutsch" },
  { code: "fr", label: "Français" },
  { code: "pt", label: "Português" },
  { code: "it", label: "Italiano" },
  { code: "ca", label: "Català" },
  { code: "zh", label: "中文" },
  { code: "ja", label: "日本語" },
  { code: "th", label: "ไทย" }
], g = "1.6.0", p = 12e4, v = 3e4, h = f.map((i) => i.code);
function y() {
  try {
    return new URL("../", import.meta.url).href;
  } catch {
    return "/";
  }
}
function E(i) {
  try {
    return new URL(i).origin;
  } catch {
    return "";
  }
}
function b(i) {
  if (i instanceof ArrayBuffer) return i;
  if (i instanceof Uint8Array)
    return i.byteOffset === 0 && i.byteLength === i.buffer.byteLength ? i.buffer : i.slice().buffer;
  throw new TypeError("IfcViewer: expected an ArrayBuffer or Uint8Array");
}
function u(i, t) {
  return i == null ? t : typeof i == "number" ? `${i}px` : i;
}
const l = class l {
  constructor(t, e = {}) {
    n(this, "version", g);
    n(this, "iframe");
    n(this, "baseUrl");
    n(this, "appOrigin");
    n(this, "opts");
    n(this, "loadTimeout");
    n(this, "_ready", !1);
    n(this, "languages", []);
    n(this, "readyResolvers", []);
    // Correlate each load with the iframe's echoed requestId so app-initiated loads
    // (URL param, in-iframe upload) never resolve a host add() promise.
    n(this, "pending", /* @__PURE__ */ new Map());
    // Generic query (request/response) correlation, keyed by requestId.
    n(this, "requests", /* @__PURE__ */ new Map());
    // Serialize loads so the app's single-load guard is never hit and order is stable.
    n(this, "loadChain", Promise.resolve());
    n(this, "reqCounter", 0);
    n(this, "listeners", /* @__PURE__ */ new Map());
    n(this, "disposed", !1);
    n(this, "onMessage", (t) => {
      if (t.source !== this.iframe.contentWindow) return;
      const e = t.data;
      if (!(!e || e.source !== "ifc-validator" || typeof e.type != "string"))
        switch (e.type) {
          case "ready": {
            this._ready = !0, Array.isArray(e.languages) && (this.languages = e.languages.filter((s) => typeof s == "string")), this.readyResolvers.splice(0).forEach((s) => s()), this.emit("ready", { languages: this.getLanguages() });
            break;
          }
          case "model-loaded": {
            const s = e;
            e.requestId && this.settle(e.requestId, !0, s), this.emit("model-loaded", s);
            break;
          }
          case "model-error": {
            const s = e;
            e.requestId && this.settle(e.requestId, !1, new Error(s.message || "Model failed to load")), this.emit("model-error", s);
            break;
          }
          case "model-progress":
            this.emit("model-progress", e);
            break;
          case "validation-completed":
            this.emit("validation-completed", e);
            break;
          case "element-selected":
            this.emit("element-selected", e);
            break;
          case "result": {
            const s = e.requestId;
            if (!s) break;
            const r = this.requests.get(s);
            if (!r) break;
            clearTimeout(r.timer), this.requests.delete(s), e.ok ? r.resolve(e.data) : r.reject(new Error(typeof e.error == "string" ? e.error : "request failed"));
            break;
          }
        }
    });
    const s = typeof t == "string" ? document.querySelector(t) : t;
    if (!s) throw new Error(`IfcViewer: mount target not found: ${String(t)}`);
    this.opts = e, this.baseUrl = e.baseUrl ?? y(), this.loadTimeout = e.loadTimeout ?? p;
    const r = this.buildSrc();
    this.appOrigin = E(r);
    const a = document.createElement("iframe");
    a.src = r, a.style.border = "0", a.style.width = u(e.width, "100%"), a.style.height = u(e.height, "100%"), a.setAttribute("allow", "fullscreen"), a.setAttribute("loading", "lazy"), a.title = e.title ?? "IFC model viewer", e.className && (a.className = e.className), s.appendChild(a), this.iframe = a, window.addEventListener("message", this.onMessage), e.onReady && this.on("ready", e.onReady), e.onModelLoaded && this.on("model-loaded", e.onModelLoaded), e.onModelError && this.on("model-error", e.onModelError), e.onProgress && this.on("model-progress", e.onProgress), e.model && this.addFromUrl(e.model);
  }
  /** Create a viewer and resolve once it is ready to accept commands. */
  static async create(t, e = {}) {
    const s = new l(t, e);
    return await s.whenReady(), s;
  }
  // ── Public API ─────────────────────────────────────────────────────────────
  /** True once the iframe viewer has signalled readiness. */
  get isReady() {
    return this._ready;
  }
  /** Resolves when the viewer is ready to accept commands. */
  whenReady() {
    return this._ready ? Promise.resolve() : new Promise((t) => this.readyResolvers.push(t));
  }
  /** Load IFC bytes from the host app. Resolves once the model is rendered. */
  add(t, e) {
    const s = b(e);
    return this.enqueueLoad(
      (r) => this.post({ type: "ifcviewer:load-bytes", requestId: r, name: t, bytes: s }, [s])
    );
  }
  /** Load a model from a public (CORS-enabled) URL. */
  addFromUrl(t, e) {
    return this.enqueueLoad(
      (s) => this.post({ type: "ifcviewer:load", requestId: s, url: t, name: e })
    );
  }
  /** Select + frame an element by its IFC expressID. */
  select(t, e) {
    this.send({ type: "ifcviewer:select", expressId: t, modelId: e });
  }
  /** Isolate a category by IFC class (e.g. "IfcWall"); omit to clear. */
  isolate(t) {
    this.send({ type: "ifcviewer:isolate", ifcType: t });
  }
  /** Frame the active model. */
  fit() {
    this.send({ type: "ifcviewer:fit" });
  }
  /** Reset the camera to its default position. */
  reset() {
    this.send({ type: "ifcviewer:reset" });
  }
  /** Fly to a named camera view (iso/top/front/right/left/back/bottom). */
  setView(t) {
    this.send({ type: "ifcviewer:view", preset: t });
  }
  /** Change the UI language at runtime (no-ops for unsupported codes). */
  setLanguage(t) {
    this.send({ type: "ifcviewer:set-language", lang: t });
  }
  /** Remove all loaded models from the scene. */
  clear() {
    this.send({ type: "ifcviewer:clear" });
  }
  /** Restore full visibility (clear hidden elements + category/element isolation). */
  showAll() {
    this.send({ type: "ifcviewer:show-all" });
  }
  /**
   * Language codes the viewer supports. Reflects what the iframe advertised on
   * `ready`; falls back to the bundled list before then. See `IfcViewer.LANGUAGES`
   * for code + native label pairs to build a picker.
   */
  getLanguages() {
    return this.languages.length ? this.languages.slice() : h.slice();
  }
  // ── Queries (request → response) ───────────────────────────────────────────
  /** List the models currently loaded in the scene. */
  getModels() {
    return this.request("ifcviewer:get-models");
  }
  /** Fetch an element's IFC data (attributes + property/quantity sets), or null. */
  getElement(t, e) {
    return this.request("ifcviewer:get-element", { expressId: t, modelId: e });
  }
  /** Fetch the current validation summary (Health Score + counts), or null. */
  getValidation() {
    return this.request("ifcviewer:get-validation");
  }
  /** Capture the current 3D view as a PNG data URL. */
  screenshot() {
    return this.request("ifcviewer:screenshot");
  }
  /** Aggregate model stats (element counts per category) for dashboard charts. */
  getStats() {
    return this.request("ifcviewer:get-stats");
  }
  /** Validation issues for a dashboard table. Optionally filter by severity / cap count. */
  getIssues(t = {}) {
    return this.request("ifcviewer:get-issues", t);
  }
  /** Check the loaded model against a buildingSMART IDS (.ids XML string). */
  checkIds(t) {
    return this.request("ifcviewer:check-ids", { idsXml: t }, 12e4);
  }
  // ── Mutating commands ──────────────────────────────────────────────────────
  /** Unload a specific model by id (see getModels()). */
  removeModel(t) {
    this.send({ type: "ifcviewer:remove-model", modelId: t });
  }
  /** Hide a set of elements (by IFC expressID). Defaults to the active model. */
  hideElements(t, e) {
    this.send({ type: "ifcviewer:hide-elements", expressIds: t, modelId: e });
  }
  /** Show a previously hidden set of elements. Defaults to the active model. */
  showElements(t, e) {
    this.send({ type: "ifcviewer:show-elements", expressIds: t, modelId: e });
  }
  /** Place the camera at `position` looking along `direction`. */
  setCamera(t, e) {
    this.send({ type: "ifcviewer:camera", position: t, direction: e });
  }
  /** Subscribe to a viewer event. Returns an unsubscribe function. */
  on(t, e) {
    let s = this.listeners.get(t);
    return s || (s = /* @__PURE__ */ new Set(), this.listeners.set(t, s)), s.add(e), () => this.off(t, e);
  }
  off(t, e) {
    this.listeners.get(t)?.delete(e);
  }
  /** Tear down the viewer and remove the iframe. */
  dispose() {
    if (this.disposed) return;
    this.disposed = !0, window.removeEventListener("message", this.onMessage), this.iframe.remove();
    const t = new Error("IfcViewer disposed");
    for (const e of this.pending.values())
      e.timer && clearTimeout(e.timer), e.reject(t);
    this.pending.clear();
    for (const e of this.requests.values())
      clearTimeout(e.timer), e.reject(t);
    this.requests.clear(), this.readyResolvers.splice(0).forEach((e) => e()), this.listeners.clear();
  }
  // ── Internals ───────────────────────────────────────────────────────────────
  buildSrc() {
    const t = new URL(this.baseUrl, typeof window < "u" ? window.location.href : void 0);
    t.search = "", t.hash = "", t.searchParams.set("embed", "1");
    const e = this.opts.ui ?? "minimal";
    return e !== "minimal" && t.searchParams.set("ui", e), this.opts.validate === !1 && t.searchParams.set("validate", "0"), this.opts.panel && t.searchParams.set("panel", "1"), this.opts.lang && t.searchParams.set("lang", this.opts.lang), this.opts.accent && t.searchParams.set("accent", this.opts.accent.replace(/^#/, "")), t.toString();
  }
  /** Queue a load so only one runs at a time; resolves with that load's result. */
  enqueueLoad(t) {
    if (this.disposed) return Promise.reject(new Error("IfcViewer disposed"));
    const e = () => this.runLoad(t), s = this.loadChain.then(e, e);
    return this.loadChain = s.then(() => {
    }, () => {
    }), s;
  }
  runLoad(t) {
    return new Promise((e, s) => {
      if (this.disposed) {
        s(new Error("IfcViewer disposed"));
        return;
      }
      const r = this.nextRequestId(), a = this.loadTimeout > 0 ? setTimeout(() => {
        this.pending.delete(r), s(new Error(`IfcViewer: load timed out after ${this.loadTimeout}ms`));
      }, this.loadTimeout) : null;
      this.pending.set(r, { resolve: e, reject: s, timer: a }), this.whenReady().then(() => {
        if (!this.disposed)
          try {
            t(r);
          } catch (o) {
            this.settle(r, !1, o instanceof Error ? o : new Error(String(o)));
          }
      });
    });
  }
  settle(t, e, s) {
    const r = this.pending.get(t);
    r && (r.timer && clearTimeout(r.timer), this.pending.delete(t), e ? r.resolve(s) : r.reject(s));
  }
  nextRequestId() {
    return `r${Date.now().toString(36)}-${++this.reqCounter}`;
  }
  /** Fire-and-forget command, sent once the viewer is ready. */
  send(t) {
    this.whenReady().then(() => {
      this.disposed || this.post(t);
    });
  }
  /** Send a query and resolve with the iframe's `result` payload. */
  request(t, e = {}, s = v) {
    return this.disposed ? Promise.reject(new Error("IfcViewer disposed")) : new Promise((r, a) => {
      const o = this.nextRequestId(), d = setTimeout(() => {
        this.requests.delete(o), a(new Error(`IfcViewer: "${t}" timed out after ${s}ms`));
      }, s);
      this.requests.set(o, { resolve: r, reject: a, timer: d }), this.whenReady().then(() => {
        this.disposed || this.post({ type: t, requestId: o, ...e });
      });
    });
  }
  post(t, e = []) {
    const s = this.iframe.contentWindow;
    s && s.postMessage(t, this.appOrigin || "*", e);
  }
  emit(t, e) {
    this.listeners.get(t)?.forEach((s) => {
      try {
        s(e);
      } catch (r) {
        console.error("[IfcViewer] listener error:", r);
      }
    });
  }
};
/** Languages the viewer ships with (code + native label). */
n(l, "LANGUAGES", f), /** Just the language codes, for convenience. */
n(l, "SUPPORTED_LANGUAGES", h);
let c = l;
const q = ["ready", "model-loaded", "model-error", "model-progress", "validation-completed", "element-selected"];
class A extends HTMLElement {
  constructor() {
    super(...arguments);
    n(this, "_viewer", null);
  }
  static get observedAttributes() {
    return ["model", "lang", "accent"];
  }
  /** The underlying IfcViewer instance (null before connected). */
  get viewer() {
    return this._viewer;
  }
  connectedCallback() {
    if (this._viewer) return;
    this.style.display || (this.style.display = "block");
    const e = document.createElement("div");
    e.style.cssText = "width:100%;height:100%", this.appendChild(e);
    const s = (o) => this.getAttribute(o) ?? void 0, r = (o) => {
      if (!this.hasAttribute(o)) return;
      const d = this.getAttribute(o);
      return d !== "false" && d !== "0" && d !== "no";
    }, a = new c(e, {
      ui: s("ui"),
      lang: s("lang"),
      accent: s("accent"),
      validate: r("validate"),
      panel: r("panel"),
      baseUrl: s("base-url"),
      model: s("model"),
      height: "100%"
    });
    this._viewer = a;
    for (const o of q)
      a.on(o, (d) => this.dispatchEvent(new CustomEvent(`ifcviewer:${o}`, { detail: d, bubbles: !0, composed: !0 })));
  }
  disconnectedCallback() {
    this._viewer?.dispose(), this._viewer = null, this.innerHTML = "";
  }
  attributeChangedCallback(e, s, r) {
    !this._viewer || r == null || (e === "lang" ? this._viewer.setLanguage(r) : e === "model" && this._viewer.addFromUrl(r));
  }
  // ── Convenience proxies to the underlying viewer ──────────────────────────
  add(e, s) {
    return this._viewer.add(e, s);
  }
  addFromUrl(e, s) {
    return this._viewer.addFromUrl(e, s);
  }
  select(e, s) {
    this._viewer?.select(e, s);
  }
  isolate(e) {
    this._viewer?.isolate(e);
  }
  getStats() {
    return this._viewer.getStats();
  }
  getIssues(e) {
    return this._viewer.getIssues(e);
  }
  screenshot() {
    return this._viewer.screenshot();
  }
}
function L(i = "ifc-viewer") {
  typeof customElements < "u" && !customElements.get(i) && customElements.define(i, A);
}
if (typeof window < "u")
  try {
    L();
  } catch {
  }
export {
  c as IfcViewer,
  A as IfcViewerElement,
  f as LANGUAGES,
  c as default,
  L as defineIfcViewerElement
};
