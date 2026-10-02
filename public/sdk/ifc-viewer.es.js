var m = Object.defineProperty;
var w = (o, t, e) => t in o ? m(o, t, { enumerable: !0, configurable: !0, writable: !0, value: e }) : o[t] = e;
var a = (o, t, e) => w(o, typeof t != "symbol" ? t + "" : t, e);
const v = [
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
], g = "1.14.0", q = 12e4, y = 3e4, c = v.map((o) => o.code);
function b() {
  try {
    return new URL("../", import.meta.url).href;
  } catch {
    return "/";
  }
}
function P(o) {
  try {
    return new URL(o).origin;
  } catch {
    return "";
  }
}
function h(o) {
  if (o instanceof ArrayBuffer) return o;
  if (o instanceof Uint8Array)
    return o.byteOffset === 0 && o.byteLength === o.buffer.byteLength ? o.buffer : o.slice().buffer;
  throw new TypeError("IfcViewer: expected an ArrayBuffer or Uint8Array");
}
function f(o, t) {
  return o == null ? t : typeof o == "number" ? `${o}px` : o;
}
const d = class d {
  constructor(t, e = {}) {
    a(this, "version", g);
    a(this, "iframe");
    a(this, "baseUrl");
    a(this, "appOrigin");
    a(this, "opts");
    a(this, "loadTimeout");
    a(this, "_ready", !1);
    a(this, "languages", []);
    a(this, "readyResolvers", []);
    // Correlate each load with the iframe's echoed requestId so app-initiated loads
    // (URL param, in-iframe upload) never resolve a host add() promise.
    a(this, "pending", /* @__PURE__ */ new Map());
    // Generic query (request/response) correlation, keyed by requestId.
    a(this, "requests", /* @__PURE__ */ new Map());
    // Serialize loads so they land in call order and each add() settles before
    // the next is sent. The viewer itself queues concurrent loads (it no longer
    // rejects a second one), so this is about predictable ordering for hosts.
    a(this, "loadChain", Promise.resolve());
    a(this, "reqCounter", 0);
    a(this, "listeners", /* @__PURE__ */ new Map());
    a(this, "disposed", !1);
    a(this, "onMessage", (t) => {
      if (t.source !== this.iframe.contentWindow) return;
      const e = t.data;
      if (!(!e || e.source !== "ifc-validator" || typeof e.type != "string"))
        switch (e.type) {
          case "ready": {
            this._ready = !0, Array.isArray(e.languages) && (this.languages = e.languages.filter((r) => typeof r == "string")), this.readyResolvers.splice(0).forEach((r) => r()), this.emit("ready", { languages: this.getLanguages() });
            break;
          }
          case "model-loaded": {
            const r = e;
            e.requestId && this.settle(e.requestId, !0, r), this.emit("model-loaded", r);
            break;
          }
          case "model-error": {
            const r = e;
            e.requestId && this.settle(e.requestId, !1, new Error(r.message || "Model failed to load")), this.emit("model-error", r);
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
          case "walk-changed":
            this.emit("walk-changed", { active: !!e.active, speed: Number(e.speed) });
            break;
          case "measurements-changed":
            this.emit("measurements-changed", e);
            break;
          case "tour-started":
            this.emit("tour-started", e);
            break;
          case "tour-step":
            this.emit("tour-step", e);
            break;
          case "tour-ended":
            this.emit("tour-ended", { completed: !!e.completed });
            break;
          case "presentation-progress":
            this.emit("presentation-progress", e);
            break;
          case "result": {
            const r = e.requestId;
            if (!r) break;
            const s = this.requests.get(r);
            if (!s) break;
            clearTimeout(s.timer), this.requests.delete(r), e.ok ? s.resolve(e.data) : s.reject(new Error(typeof e.error == "string" ? e.error : "request failed"));
            break;
          }
        }
    });
    const r = typeof t == "string" ? document.querySelector(t) : t;
    if (!r) throw new Error(`IfcViewer: mount target not found: ${String(t)}`);
    this.opts = e, this.baseUrl = e.baseUrl ?? b(), this.loadTimeout = e.loadTimeout ?? q;
    const s = this.buildSrc();
    this.appOrigin = P(s);
    const n = document.createElement("iframe");
    n.src = s, n.style.border = "0", n.style.width = f(e.width, "100%"), n.style.height = f(e.height, "100%"), n.setAttribute("allow", "fullscreen"), n.setAttribute("loading", "lazy"), n.title = e.title ?? "IFC model viewer", e.className && (n.className = e.className), r.appendChild(n), this.iframe = n, window.addEventListener("message", this.onMessage), e.onReady && this.on("ready", e.onReady), e.onModelLoaded && this.on("model-loaded", e.onModelLoaded), e.onModelError && this.on("model-error", e.onModelError), e.onProgress && this.on("model-progress", e.onProgress), e.model && this.addFromUrl(e.model);
  }
  /** Create a viewer and resolve once it is ready to accept commands. */
  static async create(t, e = {}) {
    const r = new d(t, e);
    return await r.whenReady(), r;
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
    const r = h(e);
    return this.enqueueLoad(
      (s) => this.post({ type: "ifcviewer:load-bytes", requestId: s, name: t, bytes: r }, [r])
    );
  }
  /** Load a model from a public (CORS-enabled) URL. */
  addFromUrl(t, e) {
    return this.enqueueLoad(
      (r) => this.post({ type: "ifcviewer:load", requestId: r, url: t, name: e })
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
  /** Fly to a named camera view (iso/top/front/right/left/back/bottom), optionally framing a scope. */
  setView(t, e) {
    this.send({ type: "ifcviewer:view", preset: t, ...e ? { scope: e } : {} });
  }
  /**
   * Frame the scene for presentation (v1.14): the model FILLS the frame.
   *
   * `fill` is the share of the frame the model takes on its tighter axis
   * (0.2–0.98, default 0.85), fitted to the box's corners rather than its
   * bounding sphere. `azimuth` / `elevation` (degrees) look from any angle;
   * they default to the `view` preset's own. Resolves once the camera is set.
   *
   * ```js
   * await viewer.frame({ view: 'iso', fill: 0.9 })
   * await viewer.frame({ azimuth: 200, elevation: 35, animate: false })
   * ```
   */
  frame(t = {}) {
    const { view: e, scope: r, fill: s, azimuth: n, elevation: i, animate: u } = t;
    return this.request("ifcviewer:view", {
      preset: e ?? "iso",
      ...r ? { scope: r } : {},
      fill: s ?? 0.85,
      ...n !== void 0 ? { azimuth: n } : {},
      ...i !== void 0 ? { elevation: i } : {},
      ...u !== void 0 ? { animate: u } : {}
    });
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
    const r = h(e);
    return this.request(
      "ifcviewer:add-pointcloud",
      { name: t, bytes: r },
      15 * 6e4,
      [r]
    ).then((s) => s.cloudId);
  }
  /**
   * Add a scan the viewer fetches itself. The URL must allow CORS. Without a
   * `fileName` the viewer names the scan from the URL's path — a signed URL's
   * query is never part of the name (its extension is what picks the reader).
   */
  addPointCloudFromUrl(t, e) {
    return this.request(
      "ifcviewer:add-pointcloud",
      e ? { url: t, name: e } : { url: t },
      15 * 6e4
    ).then((r) => r.cloudId);
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
  // ── Imported 3D models ──────────────────────────────────────────────────────
  // Requires the host build to enable them (VITE_FEATURE_MESH); every call
  // rejects with a clear reason when it does not. Models are decoded in the
  // visitor's browser — nothing is uploaded.
  /**
   * Import a model from bytes. GLB, glTF and OBJ.
   *
   * Takes a LIST because two of the three formats need one: a `.gltf` points at
   * its `.bin` and its images by relative path, an `.obj` points at its `.mtl`.
   * Send only the entry file and you get grey geometry — which is the failure
   * that makes an import worthless for showing someone what a place looks like.
   * References resolve by basename, so a flat list is fine.
   *
   * Every buffer is TRANSFERRED, not copied, so it is neutered in the caller
   * afterwards. That is what makes handing over a textured model free.
   */
  addMesh(t) {
    const e = t.map((r) => r.bytes);
    return this.request(
      "ifcviewer:add-mesh",
      { files: t },
      15 * 6e4,
      e
    ).then((r) => r.meshId);
  }
  /**
   * Import a model the viewer fetches itself. Pass every URL the model needs —
   * the `.gltf` AND its `.bin` and textures; they are downloaded one after
   * another, with progress in the viewer's Loading Center. The entry is the
   * first URL whose path names a .glb / .gltf / .obj. All must allow CORS.
   */
  addMeshFromUrl(t) {
    return this.request(
      "ifcviewer:add-mesh",
      { urls: Array.isArray(t) ? t : [t] },
      15 * 6e4
    ).then((e) => e.meshId);
  }
  /** Every model currently imported. See MeshInfo on trusting unit and axis. */
  listMeshes() {
    return this.request("ifcviewer:get-meshes").then((t) => t.meshes);
  }
  /** Remove one import and free its geometry, materials and textures. */
  removeMesh(t) {
    return this.request("ifcviewer:remove-mesh", { meshId: t }).then(() => {
    });
  }
  /** Remove every import. */
  clearMeshes() {
    return this.request("ifcviewer:clear-meshes").then(() => {
    });
  }
  /** Show or hide an import without unloading it. */
  setMeshVisible(t, e) {
    return this.request("ifcviewer:mesh-visible", { visible: t, meshId: e }).then(() => {
    });
  }
  /** Frame the camera on an import (or on all of them). */
  fitMesh(t) {
    return this.request("ifcviewer:fit-mesh", { meshId: t }).then(() => {
    });
  }
  /**
   * Place an import by hand: position, yaw, levelling, scale. Partial — anything
   * omitted is left alone, and the viewer clamps what it is given.
   *
   * An import starts centred on the IFC and sitting on its floor, so this is a
   * correction rather than the only thing standing between the model and the
   * world origin.
   */
  setMeshPlacement(t, e) {
    return this.request("ifcviewer:mesh-placement", { placement: t, meshId: e }).then(() => {
    });
  }
  /**
   * Correct which axis the source treats as up.
   *
   * Only meaningful for OBJ: glTF's specification mandates Y-up, so a `.glb` or
   * `.gltf` reports `upAxisSource: 'declared'` and this has nothing to fix.
   */
  setMeshUpAxis(t, e) {
    return this.request("ifcviewer:mesh-upaxis", { upAxis: t, meshId: e }).then(() => {
    });
  }
  /**
   * Correct the source unit — 1 for metres, 0.01 centimetres, 0.001
   * millimetres, 0.3048 feet.
   *
   * None of these formats records a unit, so the viewer infers one from the size
   * of the model: a 12-metre building arriving as 12 000 units is
   * indistinguishable from a 12 km one except by plausibility. When that guess
   * is wrong, this is the fix.
   */
  setMeshUnit(t, e) {
    return this.request("ifcviewer:mesh-unit", { unitScale: t, meshId: e }).then(() => {
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
  // ── Look (since v1.11.0) ────────────────────────────────────────────────
  // Set from outside, these are NOT saved as the visitor's own preference:
  // the iframe shares storage with the app, and a blog's white background
  // should not follow a reader into their own viewer.
  /**
   * Change the scene background. A preset (`'white'`, `'paper'`, `'blueprint'`,
   * `'sky'`, `'studio'`), `'#rrggbb'`, `'#top,#bottom'` or `{ top, bottom? }`.
   * Rejects on anything else rather than painting a guess.
   */
  setBackground(t) {
    return this.request("ifcviewer:set-background", { background: t });
  }
  /** The current scene background. */
  getBackground() {
    return this.request("ifcviewer:get-background");
  }
  /** Re-theme the viewer's UI accent at runtime (`#rrggbb`). */
  setAccent(t) {
    return this.request("ifcviewer:set-accent", { accent: t }).then(() => {
    });
  }
  /**
   * Switch the client skin on or off — the stakeholder view: no technical
   * panels, a clean Health Score badge. Same as `ui: 'client'`, at runtime.
   */
  setClientMode(t) {
    return this.request("ifcviewer:set-client-mode", { enabled: t }).then(() => {
    });
  }
  /**
   * `'quality'` turns on the heavier rendering (ambient occlusion, softer
   * shadows) — for a hero shot or a screenshot; `'standard'` for everyday.
   */
  setRenderQuality(t) {
    return this.request("ifcviewer:set-render-quality", { quality: t }).then(() => {
    });
  }
  // ── Camera & walk (since v1.11.0) ───────────────────────────────────────
  /** Where the camera is and what it looks at — save it, restore it with lookAt. */
  getCamera() {
    return this.request("ifcviewer:get-camera");
  }
  /**
   * Fly the camera to `position`, looking at `target` (scene metres, Y up).
   * Pairs with getCamera() for "saved views" in your own UI.
   */
  lookAt(t, e, r = !0) {
    return this.request("ifcviewer:look-at", { position: t, target: e, animate: r }).then(() => {
    });
  }
  /**
   * First-person walk mode: WASD / arrows to move, drag to look, Esc to leave.
   * `speed` is metres per second. Emits `walk-changed`.
   */
  setWalkMode(t, e = {}) {
    return this.request("ifcviewer:set-walk", { enabled: t, ...e });
  }
  /** Whether walk mode is on, and at what speed. */
  getWalkState() {
    return this.request("ifcviewer:get-walk");
  }
  // ── Sun study (since v1.11.0) ───────────────────────────────────────────
  /**
   * Start or change the sun & moon study: real shadows at a site-local date and
   * time. The site comes from the IFC's georeference, then the map placement;
   * pass `location` for a model that has none — without one, this rejects
   * instead of lighting the model as if it stood in some default city.
   *
   *   await viewer.setSolar({ date: '06-21', time: '18:00' })
   */
  setSolar(t = {}) {
    return this.request("ifcviewer:set-solar", { solar: t }, 9e4);
  }
  /** The sun study's state: date, time and zone, and where the site is. */
  getSolar() {
    return this.request("ifcviewer:get-solar");
  }
  // ── Map mode (since v1.11.0) ────────────────────────────────────────────
  /**
   * Put the model on the map, with terrain and its OpenStreetMap surroundings.
   *
   * CONSENT: map tiles, elevation and OSM data come from third parties, so the
   * visitor's browser talks to them. Calling this is YOUR page declaring that
   * consent for its visitors — the viewer does not show its own consent sheet
   * inside someone else's page. Show `attributions` wherever the map is shown.
   *
   * Resolves once the map (and the surroundings, when asked) are up; the first
   * OpenStreetMap query for a place can take tens of seconds.
   */
  setSiteContext(t = {}) {
    return this.request("ifcviewer:set-site", { site: t }, 2e5);
  }
  /** Map mode's state, placement and the attributions you must display. */
  getSiteContext() {
    return this.request("ifcviewer:get-site");
  }
  // ── Sections (since v1.11.0) ────────────────────────────────────────────
  // The same cuts the Section panel makes — a visitor can open it and drag
  // what the host placed.
  /**
   * Add a section plane. `{ level: 'Level 1' }` is a floor plan at that storey;
   * `{ axis: 'x', offset: 4.5 }` a section at 4.5 m. Resolves with the new
   * plane's `id` and every plane now in the scene.
   */
  addSection(t = {}) {
    return this.request("ifcviewer:add-section", { ...t });
  }
  /** Move, toggle or flip a plane. */
  updateSection(t, e) {
    return this.request("ifcviewer:update-section", { id: t, ...e });
  }
  /** Remove one plane, or every cut (planes and box) when `id` is omitted. */
  removeSection(t) {
    return this.request("ifcviewer:remove-section", t ? { id: t } : {});
  }
  /**
   * A section box around the whole model, or around the selected element;
   * `false` removes it.
   */
  setSectionBox(t = "model") {
    return this.request("ifcviewer:section-box", { fit: t });
  }
  /** Every plane, the box, and the model's storeys (for level cuts). */
  getSections() {
    return this.request("ifcviewer:get-sections");
  }
  // ── Measurements (since v1.11.0) ────────────────────────────────────────
  /**
   * Arm a measuring tool for the visitor (opens the Measure panel so they see
   * what to click), or `'none'` to stand down. Results arrive on
   * `measurements-changed`.
   */
  setMeasureTool(t) {
    return this.request("ifcviewer:set-measure-tool", { tool: t }).then(() => {
    });
  }
  /** Every measurement on screen, with SI values. */
  getMeasurements() {
    return this.request("ifcviewer:get-measurements");
  }
  /** Remove one measurement, or all of them when `id` is omitted. */
  clearMeasurements(t) {
    return this.request("ifcviewer:clear-measurements", t ? { id: t } : {});
  }
  // ── Federated scenes (since v1.11.0) ───────────────────────────────────
  /** Show or hide one model (see getModels()) without unloading it. */
  setModelVisible(t, e) {
    return this.request("ifcviewer:model-visible", { modelId: t, visible: e }).then(() => {
    });
  }
  /** Ghost a model (0.05–1) — e.g. the architecture around the MEP. Omit the id for the active model. */
  setModelOpacity(t, e) {
    return this.request("ifcviewer:model-opacity", { opacity: t, modelId: e }).then(() => {
    });
  }
  /** Show only this model; pass `null` to show them all again. */
  isolateModel(t) {
    return this.request("ifcviewer:isolate-model", { modelId: t }).then(() => {
    });
  }
  // ── Tours (since v1.12.0) ───────────────────────────────────────────────
  // Played by the viewer's own tour bar, so a host-started tour looks exactly
  // like one the visitor started: captions, arrows, share link.
  /**
   * Start a built-in tour. `social` and `client-walkthrough` show the model off
   * (a handful of framed views); `technical-review` walks the validation
   * issues, worst first, and needs validation to have run.
   */
  startTour(t = "client-walkthrough", e = {}) {
    return this.request("ifcviewer:start-tour", { template: t, ...e }, 6e4);
  }
  /**
   * Play a tour you authored: camera stops with a caption, and optionally the
   * elements to highlight or the classes to isolate. Build the stops with
   * getCamera(), or replay one saved from getTour().
   *
   *   await viewer.playTour({ title: 'Walkthrough', steps: [
   *     { position: { x: 30, y: 20, z: 30 }, target: { x: 0, y: 0, z: 0 }, caption: 'The site' },
   *     { position: …, target: …, caption: 'Structure', isolate: ['IfcColumn', 'IfcBeam'] },
   *   ] }, { autoplay: 5000 })
   */
  playTour(t, e = {}) {
    return this.request("ifcviewer:play-tour", { tour: t, ...e });
  }
  /** Jump to a stop (0-based). */
  goToTourStep(t) {
    return this.request("ifcviewer:tour-step", { index: t });
  }
  /** Next stop. */
  nextTourStep() {
    return this.request("ifcviewer:tour-step", { delta: 1 });
  }
  /** Previous stop. */
  prevTourStep() {
    return this.request("ifcviewer:tour-step", { delta: -1 });
  }
  /** Turn self-running on (true / ms per stop) or off (false) for the tour playing now. */
  setTourAutoplay(t) {
    return this.request("ifcviewer:set-tour-autoplay", { autoplay: t });
  }
  /** Stop the tour and give the camera back. */
  stopTour() {
    return this.request("ifcviewer:stop-tour");
  }
  /** The tour loaded now, its position, and its stops in playTour() shape. */
  getTour() {
    return this.request("ifcviewer:get-tour");
  }
  // ── Presentation director (since v1.12.0) ──────────────────────────────
  // A recipe turns the model into an edited video: shots planned from the
  // IFC itself (storeys, systems, issues), captions, music, transitions.
  // Everything renders and encodes in the visitor's browser.
  /** The built-in recipes — ids for createPresentation(). */
  getPresentationRecipes() {
    return this.request("ifcviewer:get-recipes");
  }
  /**
   * Generate a presentation from a recipe. Opens the viewer's Clip Studio with
   * the result, where the visitor can still edit it. Resolves once the shots
   * are rendered — that takes a while (tens of seconds to minutes); follow it
   * on `presentation-progress`.
   */
  createPresentation(t = "meeting-demo", e = {}) {
    return this.request("ifcviewer:create-presentation", { recipe: t, options: e }, 15 * 6e4);
  }
  /**
   * Encode the current presentation to a video file and hand its bytes to the
   * host — to upload to your CMS, attach to a report, or play in a <video>:
   *
   *   const { bytes, mimeType } = await viewer.exportPresentation()
   *   video.src = URL.createObjectURL(new Blob([bytes], { type: mimeType }))
   */
  exportPresentation(t = {}) {
    return this.request("ifcviewer:export-presentation", { ...t }, 30 * 6e4);
  }
  /** Close Clip Studio (the generated project is kept until the next one). */
  closePresentation() {
    return this.request("ifcviewer:close-presentation").then(() => {
    });
  }
  // ── Cover Studio (since v1.13.0) ────────────────────────────────────────
  // Stills of the model laid out as covers, posters, carousels and sheets —
  // rendered in the visitor's browser.
  /** The recipes, templates, formats and palettes Cover Studio offers. */
  getCoverOptions() {
    return this.request("ifcviewer:get-cover-options");
  }
  /**
   * Make a cover. Opens Cover Studio (the visitor can keep editing), runs the
   * recipe if one is given — it captures the views it needs — then applies the
   * template, format, palette and texts. Resolves when it is ready to export.
   *
   *   await viewer.createCover({ recipe: 'pinterest', text: { title: 'Casa Poblenou', location: 'Barcelona' } })
   */
  createCover(t = {}) {
    return this.request("ifcviewer:create-cover", { ...t }, 5 * 6e4);
  }
  /**
   * Compare two deliveries by URL and open the comparison workspace on the
   * result. Head files that are also loaded in the scene can be framed in 3D.
   *
   *   await viewer.compare({ base: lastWeekUrl, head: thisWeekUrl })
   */
  compare(t) {
    return this.request("ifcviewer:compare", { ...t }, 5 * 6e4);
  }
  /** The cover as it stands, or null when Cover Studio is closed. */
  getCover() {
    return this.request("ifcviewer:get-cover", {}, 5 * 6e4);
  }
  /**
   * Export the cover. `png` / `jpeg` give one page (`slide`, default the first);
   * `pdf` and `pptx` the whole document; `zip` every page as PNG.
   */
  exportCover(t = {}) {
    return this.request("ifcviewer:export-cover", { fileType: t.type ?? "png", slide: t.slide }, 5 * 6e4);
  }
  /** Close Cover Studio. */
  closeCover() {
    return this.request("ifcviewer:close-cover").then(() => {
    });
  }
  // ── Scene groups (since v1.13.0) ────────────────────────────────────────
  // The viewer groups files by the building they belong to (IFC project,
  // site, location); users — and now hosts — add their own groups on top.
  // User groups are remembered per file name on the visitor's device.
  /** Every group in the scene, inferred and user-made. */
  getGroups() {
    return this.request("ifcviewer:get-groups");
  }
  /** Create a group, optionally filling it with models. Resolves with its id. */
  createGroup(t, e = []) {
    return this.request("ifcviewer:create-group", { name: t, modelIds: e }).then((r) => r.id);
  }
  /** Rename a user group. */
  renameGroup(t, e) {
    return this.request("ifcviewer:rename-group", { groupId: t, name: e }).then(() => {
    });
  }
  /** Delete a user group; its files go back to automatic grouping. */
  deleteGroup(t) {
    return this.request("ifcviewer:delete-group", { groupId: t }).then(() => {
    });
  }
  /**
   * Move a model or point cloud into a user group. `null` hands it back to
   * automatic grouping; `'loose'` keeps it in no group.
   */
  assignToGroup(t, e) {
    return this.request("ifcviewer:assign-group", { itemId: t, groupId: e }).then(() => {
    });
  }
  /** Show or hide every model of a group. */
  setGroupVisible(t, e) {
    return this.request("ifcviewer:group-visible", { groupId: t, visible: e }).then(() => {
    });
  }
  /** Show only this group's models; `null` shows every model again. */
  isolateGroup(t) {
    return this.request("ifcviewer:isolate-group", { groupId: t }).then(() => {
    });
  }
  /** Fit the camera to a group — hidden members included, which is how you find where it went. */
  frameGroup(t) {
    return this.request("ifcviewer:frame-group", { groupId: t }).then(() => {
    });
  }
  // ── Panels ──────────────────────────────────────────────────────────────
  // The viewer's tools live on a rail, one open at a time. Until now a host
  // could load a scan but not open the panel that configures it, could not ask
  // which tool the user had open, and could not scope the rail without
  // reloading the iframe with a different `panels=`.
  /**
   * Open a tool panel, or pass `null` to close whatever is open.
   *
   * A panel that is not available — the chrome hides it, or nothing is loaded
   * for it to act on — is a no-op rather than an error. Use {@link getPanels}
   * to ask what is available before offering it in your own UI.
   */
  openPanel(t) {
    this.send({ type: "ifcviewer:open-panel", panel: t });
  }
  /** Close whichever panel is open. Same as `openPanel(null)`. */
  closePanel() {
    this.openPanel(null);
  }
  /** Which panel is open, and which are available right now. */
  getPanels() {
    return this.request("ifcviewer:get-panels");
  }
  /**
   * Limit the rail to these panels, at runtime.
   *
   * The same vocabulary as the `panels=` URL parameter, and it outranks it: a
   * host that scopes the rail after load meant to. It narrows what the viewer
   * is offering and never adds — naming a panel the viewer is not rendering
   * does not conjure it. An empty array means no rail at all.
   */
  setPanels(t) {
    this.send({ type: "ifcviewer:set-panels", panels: t });
  }
  /** Subscribe to a viewer event. Returns an unsubscribe function. */
  on(t, e) {
    let r = this.listeners.get(t);
    return r || (r = /* @__PURE__ */ new Set(), this.listeners.set(t, r)), r.add(e), () => this.off(t, e);
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
    if (e !== "minimal" && t.searchParams.set("ui", e), this.opts.validate === !1 && t.searchParams.set("validate", "0"), this.opts.panel && t.searchParams.set("panel", "1"), this.opts.panels && t.searchParams.set("panels", this.opts.panels.join(",")), this.opts.lang && t.searchParams.set("lang", this.opts.lang), this.opts.accent && t.searchParams.set("accent", this.opts.accent.replace(/^#/, "")), this.opts.background) {
      const r = this.opts.background, s = typeof r == "string" ? r : "preset" in r ? r.preset : r.bottom ? `${r.top},${r.bottom}` : r.top;
      t.searchParams.set("bg", s.replace(/#/g, ""));
    }
    return this.opts.map && t.searchParams.set("map", this.opts.map === !0 || this.opts.map.length === 0 ? "1" : this.opts.map.join(",")), this.opts.solar && t.searchParams.set("solar", this.opts.solar), this.opts.moon && t.searchParams.set("moon", "1"), this.opts.scans?.length && t.searchParams.set("scan", this.opts.scans.join(",")), this.opts.view && t.searchParams.set("view", this.opts.view), this.opts.fill !== void 0 && t.searchParams.set("fill", String(this.opts.fill)), this.opts.wheel && t.searchParams.set("wheel", this.opts.wheel), t.toString();
  }
  /** Queue a load so only one runs at a time; resolves with that load's result. */
  enqueueLoad(t) {
    if (this.disposed) return Promise.reject(new Error("IfcViewer disposed"));
    const e = () => this.runLoad(t), r = this.loadChain.then(e, e);
    return this.loadChain = r.then(() => {
    }, () => {
    }), r;
  }
  runLoad(t) {
    return new Promise((e, r) => {
      if (this.disposed) {
        r(new Error("IfcViewer disposed"));
        return;
      }
      const s = this.nextRequestId(), n = this.loadTimeout > 0 ? setTimeout(() => {
        this.pending.delete(s), r(new Error(`IfcViewer: load timed out after ${this.loadTimeout}ms`));
      }, this.loadTimeout) : null;
      this.pending.set(s, { resolve: e, reject: r, timer: n }), this.whenReady().then(() => {
        if (!this.disposed)
          try {
            t(s);
          } catch (i) {
            this.settle(s, !1, i instanceof Error ? i : new Error(String(i)));
          }
      });
    });
  }
  settle(t, e, r) {
    const s = this.pending.get(t);
    s && (s.timer && clearTimeout(s.timer), this.pending.delete(t), e ? s.resolve(r) : s.reject(r));
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
  request(t, e = {}, r = y, s = []) {
    return this.disposed ? Promise.reject(new Error("IfcViewer disposed")) : new Promise((n, i) => {
      const u = this.nextRequestId(), p = setTimeout(() => {
        this.requests.delete(u), i(new Error(`IfcViewer: "${t}" timed out after ${r}ms`));
      }, r);
      this.requests.set(u, { resolve: n, reject: i, timer: p }), this.whenReady().then(() => {
        this.disposed || this.post({ type: t, requestId: u, ...e }, s);
      });
    });
  }
  post(t, e = []) {
    const r = this.iframe.contentWindow;
    r && r.postMessage(t, this.appOrigin || "*", e);
  }
  emit(t, e) {
    this.listeners.get(t)?.forEach((r) => {
      try {
        r(e);
      } catch (s) {
        console.error("[IfcViewer] listener error:", s);
      }
    });
  }
};
/** Languages the viewer ships with (code + native label). */
a(d, "LANGUAGES", v), /** Just the language codes, for convenience. */
a(d, "SUPPORTED_LANGUAGES", c);
let l = d;
const C = [
  "ready",
  "model-loaded",
  "model-error",
  "model-progress",
  "validation-completed",
  "element-selected",
  "pointcloud-picked",
  "map-feature-picked",
  "walk-changed",
  "measurements-changed",
  "tour-started",
  "tour-step",
  "tour-ended",
  "presentation-progress"
];
class k extends HTMLElement {
  constructor() {
    super(...arguments);
    a(this, "_viewer", null);
  }
  static get observedAttributes() {
    return ["model", "lang", "accent", "background"];
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
    const r = (i) => this.getAttribute(i) ?? void 0, s = (i) => {
      if (!this.hasAttribute(i)) return;
      const u = this.getAttribute(i);
      return u !== "false" && u !== "0" && u !== "no";
    }, n = new l(e, {
      ui: r("ui"),
      panels: r("panels")?.split(",").map((i) => i.trim()).filter(Boolean),
      lang: r("lang"),
      accent: r("accent"),
      validate: s("validate"),
      panel: s("panel"),
      baseUrl: r("base-url"),
      model: r("model"),
      background: r("background"),
      // `map` alone (or map="1") is the map; a list names the layers.
      map: this.hasAttribute("map") ? (() => {
        const i = (this.getAttribute("map") ?? "").trim();
        if (i === "" || i === "1" || i === "true") return !0;
        if (!(i === "0" || i === "false"))
          return i.split(",").map((u) => u.trim()).filter(Boolean);
      })() : void 0,
      solar: r("solar"),
      moon: s("moon"),
      scans: r("scans")?.split(",").map((i) => i.trim()).filter(Boolean),
      height: "100%"
    });
    this._viewer = n;
    for (const i of C)
      n.on(i, (u) => this.dispatchEvent(new CustomEvent(`ifcviewer:${i}`, { detail: u, bubbles: !0, composed: !0 })));
  }
  disconnectedCallback() {
    this._viewer?.dispose(), this._viewer = null, this.innerHTML = "";
  }
  attributeChangedCallback(e, r, s) {
    !this._viewer || s == null || (e === "lang" ? this._viewer.setLanguage(s) : e === "model" ? this._viewer.addFromUrl(s) : e === "accent" ? this._viewer.setAccent(s).catch(() => {
    }) : e === "background" && this._viewer.setBackground(s).catch(() => {
    }));
  }
  // ── Convenience proxies to the underlying viewer ──────────────────────────
  add(e, r) {
    return this._viewer.add(e, r);
  }
  addFromUrl(e, r) {
    return this._viewer.addFromUrl(e, r);
  }
  select(e, r) {
    this._viewer?.select(e, r);
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
  addPointCloud(e, r) {
    return this._viewer.addPointCloud(e, r);
  }
  addPointCloudFromUrl(e, r) {
    return this._viewer.addPointCloudFromUrl(e, r);
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
  setPointCloudVisible(e, r) {
    return this._viewer.setPointCloudVisible(e, r);
  }
  fitPointCloud(e) {
    return this._viewer.fitPointCloud(e);
  }
  setPointCloudDisplay(e, r) {
    return this._viewer.setPointCloudDisplay(e, r);
  }
  inspectPointCloud(e) {
    return this._viewer.inspectPointCloud(e);
  }
  setBackground(e) {
    return this._viewer.setBackground(e);
  }
  setSolar(e) {
    return this._viewer.setSolar(e);
  }
  setSiteContext(e) {
    return this._viewer.setSiteContext(e);
  }
  setWalkMode(e, r) {
    return this._viewer.setWalkMode(e, r);
  }
  addSection(e) {
    return this._viewer.addSection(e);
  }
  removeSection(e) {
    return this._viewer.removeSection(e);
  }
  setMeasureTool(e) {
    return this._viewer.setMeasureTool(e);
  }
  getMeasurements() {
    return this._viewer.getMeasurements();
  }
  setView(e, r) {
    this._viewer?.setView(e, r);
  }
  startTour(e, r) {
    return this._viewer.startTour(e, r);
  }
  playTour(e, r) {
    return this._viewer.playTour(e, r);
  }
  stopTour() {
    return this._viewer.stopTour();
  }
  createPresentation(e, r) {
    return this._viewer.createPresentation(e, r);
  }
  exportPresentation(e) {
    return this._viewer.exportPresentation(e);
  }
  createCover(e) {
    return this._viewer.createCover(e);
  }
  exportCover(e) {
    return this._viewer.exportCover(e);
  }
  getGroups() {
    return this._viewer.getGroups();
  }
  isolateGroup(e) {
    return this._viewer.isolateGroup(e);
  }
  frameGroup(e) {
    return this._viewer.frameGroup(e);
  }
}
function _(o = "ifc-viewer") {
  typeof customElements < "u" && !customElements.get(o) && customElements.define(o, k);
}
if (typeof window < "u")
  try {
    _();
  } catch {
  }
export {
  l as IfcViewer,
  k as IfcViewerElement,
  v as LANGUAGES,
  l as default,
  _ as defineIfcViewerElement
};
