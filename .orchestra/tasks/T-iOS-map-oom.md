# T-iOS-map-oom — Stop iPhone Safari reload when enabling the 3D map (Barcelona demo)

## Objetivo
On iPhone 14 Safari, Barcelona demo IFCs load OK, but accepting the "load 3D map" popup reloads the page (WebContent process killed by memory, ~1–1.5 GB incl. GPU; no JS error, no webglcontextlost). Make the map path fit a low-memory budget and add a crash-loop guard.

## Contexto
- Flow: `src/components/geo/flows.tsx:384/406` ConsentDialog → `acceptConsent` `src/components/geo/useGeoController.ts:475` → showOnMap → ensureGeorefExtracted (full web-ifc parse in new worker on a COPY of the IFC buffer, `src/lib/geo/geo-extract-runner.ts:9-16`; also started per model in `src/App.tsx:1705-1714`) → `geo.enable`. Terrain/buildings/featureLayers/contextDetail/vehicles restored from localStorage (`src/stores/geoStore.ts:429-443`).
- `deviceTier()` `src/lib/geo/scene-budget.ts:65` → iPhone = 'low', but only triangle budget uses it.
- Tile LRU 300 `src/lib/geo/basemap-engine.ts:51`; tile planning DPR cap 2 `src/lib/geo/basemap/tile-quality.ts:38-40`; props caps `src/lib/geo/props-scene.ts:340-387`, boats `src/lib/geo/marina-boats.ts:39`.

## Criterios
- [ ] Georef extraction runs one model at a time (queue), never parallel; worker terminated after each; on 'low' tier it is serialized and the copy dropped asap.
- [ ] Tile LRU depends on tier (low ≈ 80, mid 180, high 300).
- [ ] Tile planning pixel ratio capped at 1 on 'low'.
- [ ] Props/boats caps scaled ×0.25 on 'low'.
- [ ] Crash-loop guard: set `sessionStorage` flag right before heavy map enable; clear ~20 s after map is stable or on `pagehide`. If flag present at next start → "safe map mode": force terrain, buildings, featureLayers, contextDetail high, vehicles OFF for that session (do not overwrite user's localStorage), and log/toast a short notice if a toast util exists. Pure helper in its own file with unit tests.
- [ ] Any shadow map > 1024 in geo path clamped to 1024 on 'low'; renderer pixel ratio ≤ 1.5 on 'low' if set in geo path.
- [ ] `npx tsc --noEmit` clean; new tests + existing geo tests green (`npx vitest run src/lib/geo`).
## Fuera de alcance
Desktop behaviour changes (mid/high must be unchanged), IFC loader changes, commits.
## Formato de vuelta (≤ 250 palabras)
STATUS · CAMBIOS · VERIFICADO · RIESGOS (≤3) · SIGUIENTE

## Informe
STATUS: done (with 2 interpretations, see risks).
- Gate: new `isLowMemoryDevice()` in `src/lib/geo/scene-budget.ts` = tier 'low' AND mobile touch UA. Desktop 'low' (4-core laptops) is excluded, so desktop is unchanged. Also adds `tileLruMax()` (80 / 300) and `propCapScale()` (0.25 / 1).
- `basemap-engine.ts`: LRU max = tileLruMax(); LOD DPR capped at 1 on low-memory devices.
- `props-scene.ts`, `marina-boats.ts`: MAX_* × propCapScale() (module-level).
- `geo-extract-runner.ts`: ensureGeorefExtracted runs one model at a time on every tier. If the queue is idle it starts in the same tick. The worker is terminated per run and the copy is transferred, so it leaves the main heap at once.
- New `src/lib/geo/map-crash-guard.ts` (+ test): arm/disarm/consume sessionStorage flag, safeMapOverrides, armForMapEnable (disarms 20 s after markStable or on pagehide). Wired in `useGeoController.enableWithPlacement` (arm before geo.enable, markStable after toggles, disarm on failure) and `geoStore.ts` (flag consumed at init: buildings/vehicles off, featureLayers all off, contextDetail 'simple', terrain already off by default; localStorage not rewritten; warning toast).
- Shadow mapSize / setPixelRatio: not set anywhere in the geo path, so nothing to clamp.
- Verified: tsc clean; vitest src/lib/geo + geoStore 78 files / 1687 tests green (new: serialization test, 7 guard/tier tests).
- Risks: mid LRU kept 300 (brief's "mid 180" conflicts with "mid unchanged"); toast text is English-only, not i18n.
