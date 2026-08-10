var p = Object.defineProperty;
var v = (s, t, e) => t in s ? p(s, t, { enumerable: !0, configurable: !0, writable: !0, value: e }) : s[t] = e;
var n = (s, t, e) => v(s, typeof t != "symbol" ? t + "" : t, e);
const m = [
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
], g = "1.10.0", y = 12e4, b = 3e4, c = m.map((s) => s.code);
function E() {
  try {
    return new URL("../", import.meta.url).href;
  } catch {
    return "/";
  }
}
function P(s) {
  try {
    return new URL(s).origin;
  } catch {
    return "";
  }
}
function h(s) {
  if (s instanceof ArrayBuffer) return s;
  if (s instanceof Uint8Array)
    return s.byteOffset === 0 && s.byteLength === s.buffer.byteLength ? s.buffer : s.slice().buffer;
  throw new TypeError("IfcViewer: expected an ArrayBuffer or Uint8Array");
}
function f(s, t) {
  return s == null ? t : typeof s == "number" ? `${s}px` : s;
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
            this._ready = !0, Array.isArray(e.languages) && (this.languages = e.languages.filter((i) => typeof i == "string")), this.readyResolvers.splice(0).forEach((i) => i()), this.emit("ready", { languages: this.getLanguages() });
            break;
          }
          case "model-loaded": {
            const i = e;
            e.requestId && this.settle(e.requestId, !0, i), this.emit("model-loaded", i);
            break;
          }
          case "model-error": {
            const i = e;
            e.requestId && this.settle(e.requestId, !1, new Error(i.message || "Model failed to load")), this.emit("model-error", i);
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
          case "pointcloud-picked":
            this.emit("pointcloud-picked", e);
            break;
          case "map-feature-picked":
            this.emit("map-feature-picked", e);
            break;
          case "result": {
            const i = e.requestId;
            if (!i) break;
            const r = this.requests.get(i);
            if (!r) break;
            clearTimeout(r.timer), this.requests.delete(i), e.ok ? r.resolve(e.data) : r.reject(new Error(typeof e.error == "string" ? e.error : "request failed"));
            break;
          }
        }
    });
    const i = typeof t == "string" ? document.querySelector(t) : t;
    if (!i) throw new Error(`IfcViewer: mount target not found: ${String(t)}`);
    this.opts = e, this.baseUrl = e.baseUrl ?? E(), this.loadTimeout = e.loadTimeout ?? y;
    const r = this.buildSrc();
    this.appOrigin = P(r);
    const o = document.createElement("iframe");
    o.src = r, o.style.border = "0", o.style.width = f(e.width, "100%"), o.style.height = f(e.height, "100%"), o.setAttribute("allow", "fullscreen"), o.setAttribute("loading", "lazy"), o.title = e.title ?? "IFC model viewer", e.className && (o.className = e.className), i.appendChild(o), this.iframe = o, window.addEventListener("message", this.onMessage), e.onReady && this.on("ready", e.onReady), e.onModelLoaded && this.on("model-loaded", e.onModelLoaded), e.onModelError && this.on("model-error", e.onModelError), e.onProgress && this.on("model-progress", e.onProgress), e.model && this.addFromUrl(e.model);
  }
  /** Create a viewer and resolve once it is ready to accept commands. */
  static async create(t, e = {}) {
    const i = new l(t, e);
    return await i.whenReady(), i;
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
    const i = h(e);
    return this.enqueueLoad(
      (r) => this.post({ type: "ifcviewer:load-bytes", requestId: r, name: t, bytes: i }, [i])
    );
  }
  /** Load a model from a public (CORS-enabled) URL. */
  addFromUrl(t, e) {
    return this.enqueueLoad(
      (i) => this.post({ type: "ifcviewer:load", requestId: i, url: t, name: e })
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
    return this.languages.length ? this.languages.slice() : c.slice();
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
  // ── Point clouds ────────────────────────────────────────────────────────────
  // Requires the host build to enable them (VITE_FEATURE_POINTCLOUD); every call
  // rejects with a clear reason when it does not. Scans are parsed in the
  // visitor's browser exactly like an IFC — nothing is uploaded.
  /**
   * Add a scan from bytes. LAS, LAZ, COPC, PLY and delimited text (.xyz/.pts/
   * .csv). Resolves with the new cloud's id.
   *
   * The buffer is TRANSFERRED, not copied, so it is neutered in the caller
   * afterwards — that is what makes handing over a multi-gigabyte scan free.
   * The generous timeout is deliberate: a large file legitimately parses for
   * minutes, and a wrapper that gives up before the parser has any hope of
   * finishing would report failure on a working load.
   */
  addPointCloud(t, e) {
    const i = h(e);
    return this.request(
      "ifcviewer:add-pointcloud",
      { name: t, bytes: i },
      15 * 6e4,
      [i]
    ).then((r) => r.cloudId);
  }
  /** Add a scan the viewer fetches itself. The URL must allow CORS. */
  addPointCloudFromUrl(t, e) {
    return this.request(
      "ifcviewer:add-pointcloud",
      { url: t, name: e ?? t.split("/").pop() ?? "scan.las" },
      15 * 6e4
    ).then((i) => i.cloudId);
  }
  /** Every scan currently loaded. See PointCloudInfo on reading the counts. */
  listPointClouds() {
    return this.request("ifcviewer:get-pointclouds").then((t) => t.clouds);
  }
  /** Remove one scan and free its GPU buffers. */
  removePointCloud(t) {
    return this.request("ifcviewer:remove-pointcloud", { cloudId: t }).then(() => {
    });
  }
  /** Remove every scan. */
  clearPointClouds() {
    return this.request("ifcviewer:clear-pointclouds").then(() => {
    });
  }
  /** Show or hide one scan without unloading it. */
  setPointCloudVisible(t, e) {
    return this.request("ifcviewer:pointcloud-visible", { cloudId: t, visible: e }).then(() => {
    });
  }
  /** Frame the camera on a scan (or the first one loaded). */
  fitPointCloud(t) {
    return this.request("ifcviewer:fit-pointcloud", { cloudId: t }).then(() => {
    });
  }
  /**
   * Appearance, shared by every scan. Each setting is a shader uniform or a
   * draw-range change, so these are instant even on a 20-million-point cloud.
   */
  setPointCloudDisplay(t, e) {
    return this.request("ifcviewer:pointcloud-display", { display: t, renderBudget: e }).then(() => {
    });
  }
  /**
   * Arm (or disarm) click-to-read on the scan. While armed, clicking a point
   * emits `pointcloud-picked` — which carries the point's coordinates IN THE
   * FILE alongside the scene ones, since that is the number a survey record
   * will already hold. Clicks are read in the capture phase, so inspecting a
   * scan never doubles as selecting the IFC element behind it.
   */
  inspectPointCloud(t = !0) {
    return this.request("ifcviewer:inspect-pointcloud", { inspect: t }).then(() => {
    });
  }
  /**
   * Nudge a scan by hand: position, yaw, levelling, scale. Partial — anything
   * omitted is left alone. Values are clamped by the viewer, so a host cannot
   * put a scan somewhere only a reset escapes from.
   *
   * This sits on top of the derived alignment rather than replacing it, so it
   * survives a re-alignment and is persisted per file.
   */
  setPointCloudPlacement(t, e) {
    return this.request("ifcviewer:pointcloud-placement", { placement: t, cloudId: e }).then(() => {
    });
  }
  /**
   * Correct which axis the scan's own coordinates treat as up, and re-derive the
   * placement from it.
   *
   * Worth exposing because the formats a phone or a photogrammetry pipeline
   * emits — PLY, PCD, plain text — declare no orientation at all, so the viewer
   * has to infer it from the shape of the data and can be wrong. `upAxisSource`
   * on PointCloudInfo tells you whether it was inferred.
   *
   * This re-runs the whole alignment rather than patching the transform: the up
   * axis feeds the bounding-box comparisons the local rung makes, so the
   * placement can legitimately change once it is right.
   */
  setPointCloudUpAxis(t, e) {
    return this.request("ifcviewer:pointcloud-upaxis", { upAxis: t, cloudId: e }).then(() => {
    });
  }
  /** Check the loaded model against a buildingSMART IDS (.ids XML string). */
  checkIds(t) {
    return this.request("ifcviewer:check-ids", { idsXml: t }, 12e4);
  }
  /**
   * Check the loaded model against an EIR / BIM Validation profile (ISO 19650-style).
   * Accepts a profile object or its JSON string; the compact shorthand
   * (`{ entity, requiredProperties: [...] }`) is also accepted. Returns the same
   * IdsResult shape as checkIds (the profile compiles to IDS internally). Since v1.7.0.
   */
  checkEir(t) {
    return this.request("ifcviewer:check-eir", { profile: t }, 12e4);
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
    let i = this.listeners.get(t);
    return i || (i = /* @__PURE__ */ new Set(), this.listeners.set(t, i)), i.add(e), () => this.off(t, e);
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
    const e = () => this.runLoad(t), i = this.loadChain.then(e, e);
    return this.loadChain = i.then(() => {
    }, () => {
    }), i;
  }
  runLoad(t) {
    return new Promise((e, i) => {
      if (this.disposed) {
        i(new Error("IfcViewer disposed"));
        return;
      }
      const r = this.nextRequestId(), o = this.loadTimeout > 0 ? setTimeout(() => {
        this.pending.delete(r), i(new Error(`IfcViewer: load timed out after ${this.loadTimeout}ms`));
      }, this.loadTimeout) : null;
      this.pending.set(r, { resolve: e, reject: i, timer: o }), this.whenReady().then(() => {
        if (!this.disposed)
          try {
            t(r);
          } catch (a) {
            this.settle(r, !1, a instanceof Error ? a : new Error(String(a)));
          }
      });
    });
  }
  settle(t, e, i) {
    const r = this.pending.get(t);
    r && (r.timer && clearTimeout(r.timer), this.pending.delete(t), e ? r.resolve(i) : r.reject(i));
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
  request(t, e = {}, i = b, r = []) {
    return this.disposed ? Promise.reject(new Error("IfcViewer disposed")) : new Promise((o, a) => {
      const d = this.nextRequestId(), w = setTimeout(() => {
        this.requests.delete(d), a(new Error(`IfcViewer: "${t}" timed out after ${i}ms`));
      }, i);
      this.requests.set(d, { resolve: o, reject: a, timer: w }), this.whenReady().then(() => {
        this.disposed || this.post({ type: t, requestId: d, ...e }, r);
      });
    });
  }
  post(t, e = []) {
    const i = this.iframe.contentWindow;
    i && i.postMessage(t, this.appOrigin || "*", e);
  }
  emit(t, e) {
    this.listeners.get(t)?.forEach((i) => {
      try {
        i(e);
      } catch (r) {
        console.error("[IfcViewer] listener error:", r);
      }
    });
  }
};
/** Languages the viewer ships with (code + native label). */
n(l, "LANGUAGES", m), /** Just the language codes, for convenience. */
n(l, "SUPPORTED_LANGUAGES", c);
let u = l;
const C = ["ready", "model-loaded", "model-error", "model-progress", "validation-completed", "element-selected"];
class q extends HTMLElement {
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
    const i = (a) => this.getAttribute(a) ?? void 0, r = (a) => {
      if (!this.hasAttribute(a)) return;
      const d = this.getAttribute(a);
      return d !== "false" && d !== "0" && d !== "no";
    }, o = new u(e, {
      ui: i("ui"),
      lang: i("lang"),
      accent: i("accent"),
      validate: r("validate"),
      panel: r("panel"),
      baseUrl: i("base-url"),
      model: i("model"),
      height: "100%"
    });
    this._viewer = o;
    for (const a of C)
      o.on(a, (d) => this.dispatchEvent(new CustomEvent(`ifcviewer:${a}`, { detail: d, bubbles: !0, composed: !0 })));
  }
  disconnectedCallback() {
    this._viewer?.dispose(), this._viewer = null, this.innerHTML = "";
  }
  attributeChangedCallback(e, i, r) {
    !this._viewer || r == null || (e === "lang" ? this._viewer.setLanguage(r) : e === "model" && this._viewer.addFromUrl(r));
  }
  // ── Convenience proxies to the underlying viewer ──────────────────────────
  add(e, i) {
    return this._viewer.add(e, i);
  }
  addFromUrl(e, i) {
    return this._viewer.addFromUrl(e, i);
  }
  select(e, i) {
    this._viewer?.select(e, i);
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
  addPointCloud(e, i) {
    return this._viewer.addPointCloud(e, i);
  }
  addPointCloudFromUrl(e, i) {
    return this._viewer.addPointCloudFromUrl(e, i);
  }
  listPointClouds() {
    return this._viewer.listPointClouds();
  }
  removePointCloud(e) {
    return this._viewer.removePointCloud(e);
  }
  clearPointClouds() {
    return this._viewer.clearPointClouds();
  }
  setPointCloudVisible(e, i) {
    return this._viewer.setPointCloudVisible(e, i);
  }
  fitPointCloud(e) {
    return this._viewer.fitPointCloud(e);
  }
  setPointCloudDisplay(e, i) {
    return this._viewer.setPointCloudDisplay(e, i);
  }
  inspectPointCloud(e) {
    return this._viewer.inspectPointCloud(e);
  }
}
function _(s = "ifc-viewer") {
  typeof customElements < "u" && !customElements.get(s) && customElements.define(s, q);
}
if (typeof window < "u")
  try {
    _();
  } catch {
  }
export {
  u as IfcViewer,
  q as IfcViewerElement,
  m as LANGUAGES,
  u as default,
  _ as defineIfcViewerElement
};
