# Sun & Moon Study — implementation plan (solar/lunar light + shadow simulation)

> **STATUS: EXECUTED (2026-06-13)** — P0–P3 implemented and tested (769 tests
> green incl. 32 solar; tsc + production build green; chunks lazy:
> `SolarPanel` ~15 kB, `solar-system` ~5 kB; suncalc/tz-lookup excluded from
> eager vendors). Deviations/leftovers, decided during execution:
> **Updated after the extras round (same day):**
> • Sky dome (D7) **BUILT**: `SolarSystemAPI.setSky()` (three Sky addon;
>   background/fog snapshot-restored exactly; dome scaled span×20 clamped
>   [500, 45k] to stay inside the camera far), `solarStore.skyOn`
>   (session-only), "Physical sky" toggle in the panel.
> • Client variant **WIRED**: App mounts `variant={clientMode ? 'client' :
>   'technical'}` — the D-25 client skin (`uiStore.clientMode`, `?ui=client`)
>   from a parallel session is exactly the hook the P2.3 VERIFY step
>   anticipated. (That session had hidden SolarPanel entirely in client mode;
>   reverted — sun studies are a stakeholder-presentation feature by design.)
> • `?solar=` deep-link **BUILT**: `?solar=YYYY-MM-DDTHH:MM` or evergreen
>   `MM-DDTHH:MM` (+ `&moon=1`), parsed+tested in url-params; SolarPanel
>   auto-starts once at that site-local time, and ONLY when a location
>   resolves — a deep link never pops the blocking notice.
> • Offline city-search **BUILT** (second extras round): GeoNames
>   `cities15000` (CC BY 4.0 — attribution line in the location form)
>   compacted by `scripts/solar/build-cities.mjs` into the COMMITTED
>   `src/lib/solar/cities.json` (33.9k cities, ~1 MB raw, lazy chunk loaded
>   on first search). `city-search.ts`: population-ranked prefix-then-substring
>   match, diacritic-insensitive; tested incl. against the real dataset.
>   Known limit: only primary (Latin) names indexed — native-script queries
>   (東京) don't match. Refresh procedure documented in the script header.
> • The P1.3 browser spike (fragments meshes casting onto the ShadowMaterial
>   catcher) is pending the user's visible-browser pass — headless preview
>   freezes rAF (known env limitation). Fallback documented in §5 P1.3.
> • Shadow-camera basis fix beyond the plan: `fitSunShadow` returns the `up`
>   vector it computed its basis in; the shadow camera MUST adopt it
>   (`cam.up.set(...)`) or near-zenith suns spill corners (found by the
>   three-projection invariant test).
>
> The rest of this document is the original plan, kept as design rationale.

Self-contained execution guide for the
> next session/model. Companion docs: `GIS_MAP_INTEGRATION_PLAN.md` (§4
> coordinates), `GIS_MAP_MODE.md` (file map), `TERRAIN_3D_IMPROVEMENT_PLAN.md`
> (the phased-plan style this follows, including its "EXECUTED" annotations —
> imitate that discipline).
>
> **The single most important instruction: DO NOT REBUILD WHAT THE GIS SYSTEM
> ALREADY PROVIDES.** Location, north, compound-angle parsing, TrueNorth,
> confidence levels, manual placement and per-file persistence all exist and
> are tested. This feature consumes them (§2.2).

---

## 1. Product spec (validated by user research — treat as requirements)

**What it is:** the classic BIM *solar study* (Revit+Enscape, Shadowmap.org):
pick date/time → the sun is placed astronomically for the model's real
location and true north → accurate shadows in the viewer. Used for solar-panel
placement, daylighting of rooms, façade/parasol decisions, greenhouse effects.
Moon module (position + phase-driven night lighting) is a differentiator no
direct competitor ships.

**Target users:** (a) architect/engineer — needs correctness + traceability
(real coordinates, true north, knowing when a value is approximate);
(b) client/stakeholder in a meeting — needs one-click visual moments, no
numbers, no friction.

**Research-validated pain points → hard requirements:**

| # | Pain (observed in Revit/Enscape/Shadowmap users) | Requirement |
|---|---|---|
| 1 | Wrong/default location & north silently break the whole study (THE top failure) | Data-source badges everywhere ('from IFC' / 'map placement' / 'manual' / 'assumed'); a **default location is a first-class visible warning that requires acknowledgement**, never a silent fallback |
| 2 | Presenting live is tedious → users pre-bake fixed views | **Named, saveable presets** (date+time+moon flag) recallable in one click; presets store TIME ONLY and re-resolve against the CURRENT location (so fixing the location later fixes every preset) |
| 3 | Time indicator that auto-hides frustrates users | **Persistent date/time chip** on screen while the mode is active |
| 4 | Users scrub the sun fluidly, not only set exact times | Continuous **slider scrubbing** + exact date/time inputs + play animation |
| 5 | Shadowmap.org sets the bar (time slider, golden hour, sun data) | Those are baseline; our edge = native in the IFC flow (georef auto-detect, capture toolkit, embed/kiosk) and **fully offline** (suncalc computes locally — unlike map tiles, this needs NO network and NO consent) |

**Acceptance criteria (verbatim from the spec — final checklist in §7):**
georeferenced IFC → correct shadows in <10 s with zero manual input;
non-georeferenced IFC → clear manual fallback + visible badge; save/recall
preset "Invierno 16h" in one click; slider scrubbing moves shadows in real
time without FPS collapse on mid-size models; moon mode gives coherent night
lighting + current phase, no unrealistic hard moon shadows; client mode has
no numeric data; captures work with the existing capture toolkit.

---

## 2. Current-state analysis (exact code references)

### 2.1 Rendering / lights — shadows are configured but INERT today
- `src/lib/viewer.ts:641-642` — `renderer.shadowMap.enabled = true`, type
  `THREE.PCFShadowMap` (comment notes PCFSoft deprecated in r175+; three is
  `^0.184.0`).
- `src/lib/viewer.ts:652` — `HemisphereLight` is added **inline without a
  variable**; the solar system must dim it → first change: name it
  (`const hemi = new THREE.HemisphereLight(...)`).
- `src/lib/viewer.ts:653-661` — key light `dir` (0xFFF5E8, 1.1) with
  `castShadow = true`, `mapSize 2048`, `bias -0.0008`, `radius 4`; shadow
  camera `dsc` frustum re-fitted per model size in `tuneSceneToBounds`
  (~line 676). `fill` light at :662.
- **No mesh in the app sets `castShadow`/`receiveShadow`** (repo grep: only
  the 3 lines above) and there is no ground receiver (the OBC grid is a
  shader material, not a shadow receiver) → today nothing visibly casts.
- Render loop is continuous (OBC `components.init()`), so moving the light
  re-renders shadows automatically — no invalidation plumbing needed.
- OBC v3 ships `ShadowedScene` (SimpleScene subclass, cascade/resolution
  config, `autoBias`) — **evaluated and REJECTED**: swapping the world's
  scene class touches viewer core with unknown postproduction interplay, and
  a sun study needs direct control of the light anyway. DO copy its one good
  idea: scale `bias` with shadow-camera size (§4 D2).

### 2.2 GIS synergy — location/north infrastructure ALREADY EXISTS (reuse!)
| Spec deliverable | Existing implementation — REUSE, do not rewrite |
|---|---|
| IfcSite RefLat/RefLong compound angle → decimal | `compoundAngleToDegrees` (`src/lib/geo/geo-math.ts`) — sign-carrying, tested |
| TrueNorth / IfcMapConversion rotation | `rotationFromTrueNorth`, `rotationFromXAxis` (geo-math) + worker extraction (`src/workers/geo-extract.worker.ts`) |
| Full extraction ladder w/ sanity gates | `ensureGeorefExtracted(modelId)` (`src/lib/geo/geo-extract-runner.ts`) — lazy, cached in `geoStore.georefByModel`, statuses `found/partial/none/invalid` + `reasons[]` |
| Location resolution + manual fallback + per-file persistence | `resolvePlacement(cacheKey, extraction, bounds)` (`src/lib/geo/placement.ts`) — manual-saved wins; `GeoPlacement {lat, lon, rotationDeg, source: 'ifc'\|'manual', confidence: 'high'\|'approximate'}` |
| Badge/confidence system | `GeoPlacement.source/confidence` + extraction `status` — the solar store only maps these to solar-specific badge levels (§4 D3) |
| True-north in scene space | `northDirection(yawRad)` / `eastDirection(yawRad)` (geo-math) — scene north is **−Z only when yaw=0**; always go through these |
| Manual coordinates UI + "pick on map" | `GeoPanel.tsx` manual form + `pickGround`; solar panel links to it rather than duplicating |

Patterns to clone: lazy chunk via `viewer.getGeo()` (~15 lines in viewer.ts),
`geoStore` (epoch guards, persisted keys `ifc-geo-*:v1`), typed i18n namespace
registration, analytics INV-5 (never send coordinates), `vite.config.ts`
`manualChunks` exclusions (proj4/3d-tiles-renderer precedent).

### 2.3 Other integration points
- `appBus` (`src/lib/event-bus.ts`) emits `model:loaded` — the solar system
  subscribes to apply `castShadow/receiveShadow` to late-loaded models.
- `viewer.getModelObject(modelId)` / `getLoadedModelIds()` for traversal;
  `getModelBounds()` for shadow-camera fitting and catcher sizing.
- Capture toolkit renders the canvas → solar states are capturable with zero
  work. Embed/kiosk UI modes: see `src/lib/url-params.ts` (`ui=` param) —
  hook the simplified "client variant" there (VERIFY the exact mechanism
  first; the panel takes a `variant` prop either way).
- Map mode coexistence: solar works with map ON or OFF. With terrain on, the
  ShadowMaterial catcher sits at the ground plane; terrain meshes receiving
  shadows is OUT OF SCOPE v1 (MeshBasic is unlit — noted in §8).

---

## 3. Verified external facts (primary sources, fetched 2026-06)

| Fact | Detail | Source |
|---|---|---|
| **suncalc v2.0.0** (Jun 2026, BSD-2, dependency-free, tiny) | `getPosition(date, lat, lng)` → azimuth **in DEGREES, clockwise from NORTH** (0=N, 90=E, 180=S), altitude in degrees above horizon, refraction-corrected. **⚠ v1.x used RADIANS measured from SOUTH — a silent-wrongness trap. Pin `^2.0.0` and ship the convention canary test (§5 P0).** | github.com/mourner/suncalc README |
| suncalc accuracy | ~0.08° sun / 0.09° moon / ±15 s rise-set (validated vs JPL Horizons). Sun disc is 0.5° wide → far more than enough for shadow studies | same |
| `getTimes()` | 20+ named times (`sunrise, sunset, solarNoon, goldenHour, goldenHourEnd, dawn, dusk, nadir…`); polar edge cases via `alwaysUp` / `alwaysDown` flags with `null` times — handle both in the slider | same |
| Moon APIs | `getMoonPosition` → altitude/azimuth (same convention)/distance; `getMoonIllumination` → `fraction` (0 new → 1 full), `phase` (0–1), `angle`, `waxing` | same |
| **tz-lookup** (photostructure fork — the maintained one) | `tzlookup(lat, lon)` → IANA zone string; 72 KB total, CC0, ~0.05 ms/lookup; ~10 % wrong in inhabited border areas (fine — user-editable). Offset/DST math then comes FREE from the browser's `Intl` tz database (§4 D4 helper) | github.com/photostructure/tz-lookup |
| three.js `Sky` addon (`three/examples/jsm/objects/Sky.js`, present locally in `node_modules`) | ShaderMaterial skybox; uniforms `turbidity(2) / rayleigh(1) / mieCoefficient(0.005) / mieDirectionalG(0.8) / sunPosition(Vector3)`; scale it big (`sky.scale.setScalar(450000)` in the official example — clamp to our 60 km far) | local source |
| CSM addon exists locally (`three/examples/jsm/csm/CSM.js`) | Escalation option ONLY if a single tight-frustum map proves insufficient for campus-scale models; requires per-material `csm.setupMaterial()` — avoid in v1 | local |
| IFC.js `web-ifc-viewer` ShadowDropper (prior art) | A *baked planar contact shadow*: top-down depth render → H/V blur passes → textured plane under the model. Aesthetic, NOT sun-accurate — different feature; do not confuse. Our study = real-time shadow maps from the astronomical sun | github.com/IFCjs/web-ifc-viewer `shadow-dropper.ts` |

**Geocoder note ("busca tu ciudad"):** any online geocoding API leaks the site
location to a third party — same privacy class as map tiles but WITHOUT the
existing consent framing. v1 = lat/lon inputs + "pick on the map" link
(reuses GeoPanel + its consent). Optional P3: an OFFLINE bundled city list
(~top 15–25k cities, ~300 KB lazy) for search-with-zero-network. Never a
remote geocoder by default.

---

## 4. Design

### D1 — `src/lib/solar/sun-math.ts` (pure; the only module importing suncalc)
```ts
export interface SunState { azimuthDeg: number; altitudeDeg: number }  // from suncalc, north-based
export function sunAt(dateUTC: Date, lat: number, lon: number): SunState
export function moonAt(dateUTC: Date, lat: number, lon: number): SunState & { fraction: number; phase: number; waxing: boolean }
export function dayTimes(dateUTC: Date, lat: number, lon: number): {…} // getTimes + alwaysUp/alwaysDown normalized

/** Astronomical direction → scene-space unit vector pointing FROM the sun
 *  TOWARD the scene (i.e. light direction is -sunDir; light.position =
 *  target + sunDir * R). Uses the geo compass as the single north source. */
export function sunDirectionScene(azimuthDeg: number, altitudeDeg: number, yawRad: number): { x: number; y: number; z: number } {
  const az = azimuthDeg * DEG, alt = altitudeDeg * DEG
  const n = northDirection(yawRad)          // geo-math — scene north (y=0)
  const e = eastDirection(yawRad)
  const hx = n.x * Math.cos(az) + e.x * Math.sin(az)   // az clockwise from north → toward east
  const hz = n.z * Math.cos(az) + e.z * Math.sin(az)
  return normalize(hx * Math.cos(alt), Math.sin(alt), hz * Math.cos(alt))
}

// Timezone (site-local wall time ↔ UTC) — the classic trap, solved once:
export function timezoneFor(lat: number, lon: number): string        // tz-lookup, user-overridable
export function zoneOffsetMinutes(utc: Date, timeZone: string): number {
  // Difference between the wall clock in `timeZone` and UTC at that instant.
  const dtf = new Intl.DateTimeFormat('en-US', { timeZone, hour12: false,
    year: 'numeric', month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit', second: '2-digit' })
  const p = Object.fromEntries(dtf.formatToParts(utc).map(x => [x.type, x.value]))
  const asUTC = Date.UTC(+p.year, +p.month - 1, +p.day, +p.hour, +p.minute, +p.second)
  return Math.round((asUTC - utc.getTime()) / 60000)
}
export function wallTimeToUTC(y,m,d,hh,mm, timeZone): Date   // fixed-point: 2 iterations of offset correction
export function utcToWallParts(utc, timeZone): {…}
```
Store time as **UTC ms** internally; the slider works in site wall-clock via
these helpers. Sun/moon color ramps also live here as pure functions:
`sunColorForAltitude(altDeg)` (≈6500 K high → ≈2500 K under 5°, hex table) and
`sunIntensityForAltitude(altDeg)` (0 below −0.833°, smoothstep to 1 above 15°).

### D2 — `src/lib/solar/solar-system.ts` (lifecycle owner, geo-system twin)
Context passed from viewer.ts (mirror `GeoSystemContext`): `scene`, `hemi`,
`keyLight` (=dir), `fillLight`, `renderer`, `getActiveModelBounds`,
`getLoadedModelIds`, `getModelObject`, plus `onModelLoaded(cb)` (wrap appBus).

`SolarSystemAPI`:
- `enable()`: **snapshot** (INV-3 discipline, geo-system pattern):
  keyLight position/color/intensity, hemi intensity/colors, fill intensity,
  `dsc` frustum, bias, per-mesh nothing (casting flags are cheap to unset).
  Then: traverse every loaded model → `mesh.castShadow = true;
  mesh.receiveShadow = true` (subscribe `model:loaded` for future models;
  keep a WeakSet to un-flag on disable); add ground catcher
  `THREE.Mesh(PlaneGeometry, ShadowMaterial({opacity: 0.35}))`, rotated flat,
  at `modelMinY − 1 cm`, sized 3× model span, `receiveShadow = true`,
  `material.depthWrite = false`; dim `fill` to ~0.05 (a second directional
  fights the sun read); hemi to ~0.35.
- `setTime(utcMs)`: compute sun → `keyLight.position = target + dir·R`
  (R = 2× model span, target = bounds centre; `keyLight.target` must be added
  to the scene and positioned — three requirement); refit `dsc` to the model
  bbox as seen from the light (project 8 corners into light space — reuse the
  8-corner pattern from `viewer.getModelBounds`), `bias = -0.0008 ×
  (frustumSize / 100)` clamped [-0.004, -0.0002] (ShadowedScene's autoBias
  idea), `normalBias ≈ 0.02–0.05`; apply color/intensity ramps; below horizon
  → sun intensity 0 (+ night ambience if moon module off: hemi 0.12).
- `setMoon(enabled)` (D6), `setQuality('standard' | 'high')` (mapSize
  2048/4096), `getBadges()`, `disable()` restores the snapshot EXACTLY +
  removes catcher + un-flags meshes, `dispose()`.
- Location changes (user fixes coordinates) → caller re-calls `setLocation`
  which just re-derives; presets need no migration (they store time only).

### D3 — Location/north resolution + badges (`solarStore` logic, reusing geo)
Resolution ladder (first hit wins) → `{ lat, lon, yawDeg, locationSource,
northSource }`:
1. `geoStore.placement` (map mode active or previously placed) →
   `locationSource: placement.source === 'ifc' ? 'ifc' : 'manual'`.
2. `resolvePlacement(cacheKey, await ensureGeorefExtracted(modelId), bounds)`
   → 'ifc' (+ north from extraction `rotationDeg` → `northSource: 'ifc'`).
3. `solarStore.manualLocation` (its own persisted lat/lon per file) → 'manual'.
4. **Default (Madrid 40.4168, −3.7038, yaw 0) → `locationSource: 'default'`**:
   the enable flow SHOWS A BLOCKING NOTICE ("Ubicación no configurada — el
   estudio usará Madrid y será incorrecto para tu proyecto") with actions
   [Set location] [Continue anyway]. Requirement #1: never silent.
No IFC north (`extraction.rotationDeg === 0` with no TrueNorth/axis data) →
`northSource: 'assumed'` badge. Badges render as chips in the panel header
AND a compact glyph on the persistent time chip.

### D4 — Time model + UI (`SolarPanel.tsx`, technical + client variants)
- solarStore: `active`, `timeUTC` (number), `timeZone` (IANA, auto via
  tz-lookup, editable), `follow: 'manual' | 'realtime'`, `moonOn`, `quality`,
  `location {…}` as D3, `presets: SolarPreset[]`.
- Slider = minutes 0–1439 of the site-local day (wallTime helpers), `step 1`,
  continuous `onInput` (scrubbing — requirement #4); markers under it from
  `dayTimes` (sunrise/sunset/golden hour/solar noon); handles `alwaysUp/Down`
  (marker-less + label). Date input + season shortcuts (Jun 21 / Dec 21 /
  Mar 20 selected year) + "now" (realtime ticks 60 s).
- **Persistent chip** (requirement #3): small fixed overlay (top-centre of
  the viewport, `pointer-events-none` except a click-to-open-panel target)
  showing `21 jun · 16:30 CEST · ☀ 42°` + badge glyph; always visible while
  `active`, in BOTH variants and in kiosk/embed.
- **Presets** (requirement #2): `{ id, name, month, day, minutes, moonOn }`
  (NO year → evergreen; NO location — re-resolved at apply). Persisted per
  file (`ifc-solar-presets:v1:<cacheKey>`, placement.ts persistence pattern)
  + a global default set (solstices/equinox). Client variant renders them as
  named cards; apply = one click.
- Client variant (`variant='client'`): presets cards + date words + big
  slider, no coordinates/azimuth numbers, badges become a single "ubicación
  aproximada" pill when applicable.

### D5 — Toolbar + wiring
Sun icon button next to Map (`isSolarEnabled()` flag `VITE_FEATURE_SOLAR`,
gis-flag.ts pattern), toggles `solarStore.panelOpen`; active dot while
`active`. Viewer hook `getSolar()` lazy chunk (clone `getGeo()`); name the
hemi light const; add `solar` to i18n (config.ts + types.ts + 10 locale files
— EN+ES real, 8 copies with `_status`, regen script in git history of
`geo.json`); analytics: `trackSolarEnabled{location_source, north_source}`,
`trackSolarPresetSaved/Applied{…no names}`, `trackSolarMoonToggled`,
`trackSolarError{stage}` — INV-5: never coordinates/times.
`vite.config.ts` manualChunks: add `suncalc` + `tz-lookup` to the lazy-geo
exclusion list (otherwise they land in eager `vendor-ui`).

### D6 — Moon module (differentiator)
`moonAt()` drives a SECOND DirectionalLight: `castShadow = false` (spec:
no hard moon shadows), color 0x8fa8c8 (~4100 K), intensity
`0.18 × fraction × clamp(sin(alt), 0, 1)`; visible only when altitude > 0.
Phase icon: 8 glyphs from `phase` (0 new → 0.5 full → 1 new) + `waxing` for
orientation. Night ambience when sun < horizon AND moon on: hemi 0.18 with
cool sky color; background untouched (INV-3 restore covers everything).
Toggle lives in the panel, subordinate to the sun controls.

### D7 — Sky dome (P3, optional wow)
three `Sky` addon in the solar chunk: `sunPosition` uniform = sun vector,
scale ≈ 50 000 (inside the 60 km far in map mode, and bump non-map far while
active — snapshot/restore), works with the existing ACESFilmic tone mapping
(that's the reference setup in the official example). Toggle "Cielo físico".
Snapshot `scene.background`/fog before replacing.

### D8 — OUT OF SCOPE v1 (document, don't build)
Sun-hours/insolation heatmaps (the full Forma/Ladybug feature): sample N sun
positions across a day/season → accumulate per-surface lit fraction (GPU:
one shadow-map render per sample accumulated into a texture; or CPU raycasts
via three-mesh-bvh for selected faces) → color ramp. Needs its own plan;
mention in the panel as "próximamente" only if product wants the teaser.
Also out: terrain meshes receiving shadows; glazing/greenhouse radiometrics.

---

## 5. Step-by-step execution (P0 → P3; `npm run test` + `npx tsc -b` green after EVERY step)

### P0 — deps + pure math (no viewer changes)
1. `npm i suncalc@^2 tz-lookup` (+ `@types/suncalc` if v2 lacks bundled types
   — CHECK; write a local `.d.ts` if needed, 3d-tiles-renderer precedent).
2. `src/lib/solar/sun-math.ts` per D1 + `sun-math.test.ts`:
   - **CONVENTION CANARIES** (these fail loudly if suncalc v1 semantics ever
     sneak in): Madrid (40.4168, −3.7038) 2026-06-21 12:00 UTC → altitude
     ∈ (68°, 76°), azimuth ∈ (150°, 210°) (southern sky in the northern
     hemisphere); same date 04:00 UTC → sun below horizon (altitude < 0);
     Sydney (−33.86, 151.21) 2026-06-21 02:00 UTC → azimuth ∈ (330°, 30°)
     (NORTHERN sky in the southern hemisphere).
   - `sunDirectionScene`: yaw 0 + az 180 (south) + alt 45 → vector ≈
     (0, .707, .707) (south = +Z since north = −Z); yaw 90° rotates it to
     −X side; alt 90 → (0,1,0).
   - Timezone: `zoneOffsetMinutes(2026-01-15, 'Europe/Madrid') === 60`,
     July === 120 (DST); `wallTimeToUTC` round-trips across a DST boundary.
   - `dayTimes` polar: Tromsø Dec → `alwaysDown`; Jun → `alwaysUp`.
3. `solarStore` (+test): state per D4, persisted keys `ifc-solar-*:v1`,
   NO epoch machinery needed (no async chains except location resolve — reuse
   a simple in-flight guard).

### P1 — scene lifecycle
1. viewer.ts: name the hemi const (:652); add `getSolar()` lazy hook +
   dispose (clone the `getGeo()` block, ~15 lines); pass ctx per D2.
2. `solar-system.ts` (+`solar-system.test.ts` with a mocked ctx — clone the
   fixture style of `geo-system.test.ts`): enable→snapshot→override,
   disable→EXACT restore property test, ×10 enable/disable leak test,
   `setTime` positions light along the canary vector, shadow-camera refit
   contains all 8 bbox corners (pure helper `fitShadowCamera(bounds, sunDir)`
   in sun-math or a small `shadow-fit.ts`, unit-tested), late-model
   subscription flags new meshes, catcher added/removed.
3. **Browser spike (the one real unknown):** load the Duplex, enable, verify
   fragments meshes actually cast onto the ShadowMaterial catcher. Fragments
   use custom materials — mesh-level `castShadow` should Just Work (no vertex
   displacement → default depth material), but if shadows don't appear,
   the fallback is assigning `mesh.customDepthMaterial = new
   THREE.MeshDepthMaterial({ depthPacking: THREE.RGBADepthPacking })` per
   fragment mesh. Record the outcome in this doc's status header.
   ⚠ Verification env: hidden preview tabs freeze rAF (see
   TERRAIN_3D_IMPROVEMENT_PLAN §5.1) — shadows need a visible browser pass.

### P2 — UI + product requirements
1. `SolarPanel.tsx` (+ persistent chip component in the same file — GeoPanel
   is the structural template: lazy via `React.lazy` in App gated by
   `isSolarEnabled() && sceneModels.length > 0`).
2. Location resolution flow per D3 incl. the blocking default-location
   notice; badges; link "elegir en el mapa" → opens GeoPanel (geoStore
   `setPanelOpen(true)`).
3. Slider + markers + date + presets CRUD + season shortcuts + realtime +
   client variant + kiosk/embed behavior (chip always; panel per `ui=` mode —
   VERIFY mechanism in `url-params.ts` and wire accordingly).
4. Toolbar button, i18n `solar` ns (EN+ES + 8 copies + types.ts + config.ts),
   analytics events, manualChunks exclusions, `.env.example`
   `VITE_FEATURE_SOLAR=true`.
5. Tests: store (presets evergreen re-resolution: save preset → change
   location → apply → sun computed with NEW location), badge mapping table,
   slider wall-clock mapping incl. DST day (23/25-hour day renders correctly).

### P3 — moon + sky + polish
1. Moon light + phase icon + night ambience (D6) + tests (fraction/intensity
   mapping, no castShadow, restore).
2. Sky dome toggle (D7) + snapshot coverage.
3. Optional: deep-link `?solar=2026-06-21T16:30` in url-params (embed a solar
   moment — powerful for the crawlable-report/embed strategy); offline city
   search dataset. Both only if time allows.
4. Update `GIS_MAP_MODE.md` cross-reference, this doc's STATUS header, and
   the memory note (`project_gis_map_built.md` gets a sibling
   `project_solar_study_built` entry).

---

## 6. Pitfalls (pre-paid lessons — do not rediscover)

1. **suncalc v1 vs v2**: v1 = radians, azimuth from SOUTH; v2 = degrees from
   NORTH. The canary tests are not optional. Pin `^2.0.0`.
2. **Timezone wall-clock math**: never use the BROWSER's local zone for the
   site. All conversions through `zoneOffsetMinutes`/`wallTimeToUTC` (D1) —
   and test across a DST transition.
3. **North**: scene north is `northDirection(yawRad)`, NOT hardcoded −Z.
   yaw comes from the same placement the map uses; 'assumed' badge when 0
   with no IFC evidence.
4. **`light.target` must be `scene.add`ed** or the directional light ignores
   it (three.js classic).
5. **Restore-exact discipline** (INV-3 style): everything `enable()` touches
   (lights, fog/background if sky used, mesh flags via WeakSet, catcher) is
   snapshotted and restored byte-exact; property-test it like
   `geo-system.test.ts` does.
6. **Shadow acne vs peter-panning**: start `bias -0.0008 · frustum/100`,
   `normalBias 0.03`; too much normalBias detaches shadows from façades.
   Expose only the quality preset, not raw numbers.
7. **Fragments culling**: element/LOD culling means culled meshes stop
   casting (shadow pops at the viewport edge). Accept in v1; document in the
   panel tooltip ("las sombras siguen a la geometría visible").
8. **Do not add a second strong directional** while the sun is active (the
   existing `fill` light must be dimmed in the snapshot scope) — double
   shadows/washed contrast otherwise.
9. **i18next is strictly typed** — new ns registered in `types.ts` +
   `config.ts` BEFORE `t('solar:…')` compiles; dynamic keys via
   `t(key, { defaultValue })`.
10. **Zustand selector footgun** (validationStore.ts:428) — no fresh
    arrays/objects from selectors without memo.
11. **manualChunks**: without the exclusion, `suncalc`/`tz-lookup` land in
    eager `vendor-ui` (proj4 precedent in vite.config.ts).
12. **Kiosk/embed**: the chip must render in minimal chromes (it's the
    context for screenshots/streams), the panel must respect `ui=` gating.

## 7. Final acceptance checklist (mirror of §1 criteria)

- [ ] Georeferenced IFC (rung 1–3): Map→Sun button → correct shadows < 10 s,
  zero manual input, badge "desde IFC".
- [ ] Non-georeferenced IFC: manual flow + visible badge; optional map-pick.
- [ ] Default location NEVER silent (blocking notice with actions).
- [ ] Preset "Invierno 16h" saved → recalled in 1 click; still correct after
  the user fixes the location afterwards.
- [ ] Scrubbing moves shadows live; no notable FPS drop on a mid model
  (Duplex + 2048 map ≈ free; verify a ~100 MB model at 'high' 4096).
- [ ] Persistent chip visible in normal, kiosk and embed chromes.
- [ ] Moon: coherent night light + phase icon, no hard moon shadows.
- [ ] Client variant: zero numeric UI, preset cards work on a shared screen.
- [ ] Capture toolkit captures sun/moon states unchanged.
- [ ] `npm run test`, `npx tsc -b`, `npm run build` green; solar chunk lazy;
  entry growth ≈ 0; flag off ⇒ zero traces.
