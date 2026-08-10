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
- No Draco or KTX2 decompression yet. A mesh using either fails to parse rather
  than arriving mangled.

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

## Not done yet

The SDK and the embed bridge do **not** carry mesh import. Scans do
(`addPointCloud`, `setPointCloudPlacement`, …); the equivalent surface for
meshes — add, list, remove, place — is the next piece of work.
