# Importing 3D models

Bring a GLB, glTF or OBJ into the same scene as the IFC — furniture, a scanned
room, a landscaping proposal, a massing study. Flag-gated behind
`VITE_FEATURE_MESH`; off by default, because it pulls three's GLTF, OBJ and MTL
loaders and a deployment that only wants scans should not ship them.

## What it accepts

| Format | Extensions | Textures | Orientation |
|---|---|---|---|
| **GLB** binary glTF | `.glb` | embedded | **declared** — the spec mandates Y-up |
| **glTF** separate | `.gltf` + `.bin` + images | from sibling files | **declared** |
| **OBJ** | `.obj` + `.mtl` + images | from the `.mtl` | inferred |

### Select the whole thing, not just the model

A `.glb` is self-contained. The other two are not: a `.gltf` points at a `.bin`
and at images by relative path, and an `.obj` points at a `.mtl` which points at
textures. Importing only the file you clicked gets you **grey geometry**, which
is exactly the failure that makes an import worthless for what it is for.

So the picker takes the whole selection and a `LoadingManager` URL modifier
resolves every relative reference against it, matching on **basename**. That
matters because the paths inside these files were written on someone else's
machine — `textures/wall.jpg`, sometimes with a drive letter still attached.
Nothing is uploaded; the references resolve to in-memory blob URLs, and every one
of them is revoked in a `finally` block. An un-revoked blob URL pins the whole
file in memory for the life of the document.

An OBJ with no `.mtl` still imports. Untextured beats nothing, and the geometry
is often all someone wants.

## The two things that are guessed

Neither format records a coordinate system, and only one of them records an
orientation. Both guesses are stated in the panel and both are overridable —
same discipline as the point cloud panel, and for the same reason: a guess
presented as a fact is worse than a guess presented as a guess.

**Unit.** Exporters disagree and almost none of them record it: Blender writes
metres, much CAD writes millimetres, some pipelines write centimetres. A 12-metre
building arriving as 12 000 units is indistinguishable from a 12 km one except by
plausibility, so plausibility is what is used — against the range of things
people actually import into a building scene, from a chair to a city block. The
dropdown covers metres, centimetres, millimetres and feet.

**Up axis.** glTF settles it: the specification requires Y-up, so a `.glb` or
`.gltf` is declared and the panel offers nothing. OBJ has no convention at all —
DCC tools write Y-up, CAD writes Z-up — so it gets the same shape heuristic the
point cloud readers use, and the same one-click Z ⇄ Y switch.

## Placement

An import starts **centred on the IFC in plan and sitting on its floor**, not at
the world origin — "imported successfully" should not mean "somewhere a kilometre
away". The object's own bottom goes on the model's floor, so a chair placed by
its centre is not half inside the slab, and the unit scale is applied before the
floor is worked out, or a millimetre model gets lifted two kilometres.

From there: position, rotation, the two levelling angles and scale, all clamped,
all persisted per file. This is deliberately the same vocabulary and the same
arithmetic as a point cloud's placement — a scan and a mesh of the same room have
to land the same way, and they only do that if they are placed by the same code.

**The IFC never moves.** (INV-M1, matching the point cloud's INV-P1.)

## Limits

- **8 million triangles** across every import, checked *before* anything reaches
  the GPU. Past the budget a browser does not slow down, it loses the WebGL
  context — which blacks out the IFC model too, and that is not a trade an
  import gets to make.
- **Decoding happens on the main thread**, unlike point cloud parsing. Not an
  omission: GLTFLoader and OBJLoader build textures through `Image` and
  `createImageBitmap`, which a plain module worker does not have — the parse
  would run there and the materials would come back blank.
- **Every geometry, material and texture is disposed** on removal (INV-M2).
  Textures are the ones that hurt: they are tens of megabytes, they are not
  reachable from the geometry graph, and three frees none of them when an object
  leaves the scene.
- **Draco and KTX2 are decoded**, so an "optimise for web" export works. The
  decoders are copied out of the installed `three` at build time and served from
  `/decoders/` — pinned to the version in use rather than to a CDN that will one
  day serve a mismatched build. They are fetched only when a file needs them
  (190 kB for Draco, 527 kB for KTX2) and the worker pool is released when the
  mesh system is disposed.

## Architecture

```
src/lib/mesh/
  mesh-types.ts    types + budgets (no three.js)
  mesh-align.ts    unit + up-axis inference, initial placement, persistence
  mesh-transform.ts  frame + placement → TRS (shared decomposition with scans)
  mesh-loader.ts   GLB/glTF/OBJ decode, multi-file resolution, disposal
  mesh-system.ts   scene lifecycle, bounds, framing, raycast registration
  mesh-runner.ts   orchestration: decode → budget → place → store
  mesh-flag.ts     VITE_FEATURE_MESH
src/stores/meshStore.ts
src/components/MeshPanel.tsx
```

`viewer.getMeshes()` is the lazy hook, mirroring `getPointClouds()`. Imports are
registered with the shared raycaster, so they are selectable and measurable by
the same tools as everything else — and withdrawn from it *before* leaving the
scene, or the registry keeps every texture reachable after the user deleted the
import.

## From the SDK and the embed bridge

Carried in full since SDK v1.10.0:

```js
// Every part together — the .gltf alone gets you grey geometry.
const id = await viewer.addMesh([
  { name: 'scene.gltf', bytes: gltfBytes },
  { name: 'scene.bin',  bytes: binBytes  },
  { name: 'wall.jpg',   bytes: texBytes  },
])
// Or let the viewer fetch them (CORS required, fetched in parallel):
await viewer.addMeshFromUrl(['https://…/a.gltf', 'https://…/a.bin'])

const meshes = await viewer.listMeshes()
if (meshes[0].unitSource === 'assumed') await viewer.setMeshUnit(0.001)
if (meshes[0].upAxisSource === 'assumed') await viewer.setMeshUpAxis('z')
await viewer.setMeshPlacement({ yawDeg: 90, pitchDeg: 1.5 })
```

Also `removeMesh`, `clearMeshes`, `setMeshVisible` and `fitMesh`.

Two things a host should not skip. Buffers are **transferred**, not copied, so
they are neutered in the caller afterwards — that is what makes handing over a
textured model free. And `listMeshes` reports `unitSource` and `upAxisSource`
alongside the values: neither format records a unit, and only glTF records an
orientation, so reading the numbers without their provenance is how a model ends
up a thousand times too big with nobody questioning it.

## Sample models

Four, in the panel, fetched straight into the browser. Each earns its place by
exercising something different rather than by looking good:

| | What it proves |
|---|---|
| **Box** (2 KB) | The smallest thing that can work. If this fails, the problem is not the user's file. |
| **Duck (Draco)** (30 KB, 3 files) | Declares Draco as *required*, so it cannot open without a decoder — and its texture is resolved by basename out of the same selection. |
| **Damaged Helmet** (3.8 MB) | A textured PBR model, and a lesson in the budgets: five 2K maps ≈ 110 MB on the GPU from a 3.8 MB download. |
| **Human figure** (OBJ, 5 files) | **Imports wrong on purpose.** |

That last one is deliberate. It is in centimetres and standing up, so the unit
heuristic reads it as metres (182 is a plausible number of metres for something)
and the up-axis heuristic misses too — it assumes what people model is wider than
it is tall, which holds for a room and inverts for anything standing. Both are
marked `assumed` and both are one control away from right.

A demo that lands perfectly teaches nobody where those controls are. This one
teaches it in about four seconds, and its card says so rather than leaving the
user to conclude the importer is broken.

Every figure on those cards was measured by running the file through this app's
own loader, not copied from an upstream description.

## Verified against a real compressed file

The Khronos Draco Duck — a `.gltf` that declares
`KHR_draco_mesh_compression` in `extensionsRequired`, so it cannot parse at all
without a decoder — imports in the browser as 4212 triangles with one textured
material at 1.66 m across, with its `.bin` and its texture resolved by basename
from the multi-file selection.

That combination is the whole feature in one file: compressed geometry, a
separate buffer, and a texture referenced by a relative path written on someone
else's machine.
