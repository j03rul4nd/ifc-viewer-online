# The vertical infrastructure engine

How map mode decides **where things sit in the third dimension** — roads that climb onto
bridges, dive into bores, cross each other at different levels, and run over water.

Companion to `URBAN_3D_INFRASTRUCTURE_FINDINGS.md`, which is the diagnosis that led here.
This document is the design as built, and it is the one to read before changing anything
about heights.

The engine is generic. Barcelona's Port Vell is the stress test, not the subject: there is
no coordinate, city or landmark special-cased anywhere in it. The one deliberate exception
is an authored landmark model, which is a different kind of thing and is kept apart.

---

## The one rule

> A vertical profile that is mathematically correct is worth nothing if the mesh built
> from it has too few degrees of freedom to express it.

Both halves of that sentence cost real debugging. The solver was right, produced a proper
`ramp → deck → ramp`, and the terrain-off renderer emitted the span as **one quad between
the two ramp ends**, because the only thing that had ever asked for subdivision was the
DEM — and with no DEM it asked for none. The deck was real, correct, and nowhere.

So the solver, the tessellation and the renderer are one chain with separate
responsibilities, and the tests check both ends of it.

---

## Who owns which height

Each stage answers exactly one question, and no stage re-derives another's answer.

| Module | Owns | Never does |
|---|---|---|
| `terrain-truth.ts` | **raw sample → resolved ground.** Water clamping, obstruction rejection, robust corridor statistics, sample caching. | Know about scene coordinates, structures or OSM tags |
| `ground-frame.ts` | **datum ↔ scene z.** Exaggeration, the anchor, the sea datum, densification against DEM spacing. | Know what is standing on the ground |
| `vertical.ts` | **semantics.** Tags → functional type × structure, the resolution hierarchy, clearance and grade tables, the slope-constrained profile solver. | Touch THREE, a raster, or scene z |
| `vertical-network.ts` | **the network.** Level crossings, chains, ramps, junction agreement, and the sampler that answers the profile as a function of distance. | Decide what anything looks like |
| `osm-scene.ts` builders | **profile → triangles.** Tessellation, materials, render offsets. | Re-invent structural logic |

`vertical.ts` is free of THREE on purpose: `osm-features.ts` imports it, and that runs in
the Overpass worker, which must not pull a 3D library in to read a tag.

## The four vertical quantities

Kept distinct, because collapsing any two of them is how every bug in this area started.

```
rawElevation        what the raster returned. Possibly a rooftop, a ship, a void.
groundElevation     the estimate of bare ground.        terrain-truth
structuralElevation the offset a bridge/tunnel/quay adds. TRUE METRES, never exaggerated.
worldElevation      the scene z finally emitted.
```

and the conversion, which appears in exactly one place per builder:

```ts
z = frame.zAtElevationM(groundM) + (elevationM − groundM) × mToN
//  └─ ground: exaggerated ─┘     └─ structure: true metres ─┘
```

Running the whole absolute elevation through `zAtElevationM` instead is the bug that made
bridge decks float **18 m at the ×3 slider** while their own decks stayed 1.2 m thick.

**`structuralZ` vs `renderLift`.** The centimetre constants at the call sites — the 0.25 m
asphalt lift, the 0.02 m on paint, the kerb drop, the platform lip — are *render offsets*.
They exist only so coplanar things do not fight for the same depth. They are never metres
of structure, never feed back into the solver, and never affect the elevation two segments
agree on at a join.

---

## Vertical resolution hierarchy

When several sources speak about a structure's height, this is the order and the reason.
The confidence label travels with the answer so a later heuristic — or a debug session —
can tell a measurement from a guess.

| # | Source | Confidence | Why it ranks here |
|---|---|---|---|
| 1 | `min_height`, or `ele` differenced against trusted ground | `surveyed` | Somebody measured it |
| 2 | **What the way actually crosses** — a real segment intersection against lower-layer ways, with clearance from the crossed type (road 5.0 m, rail 6.0 m, footway 3.0 m) | `inferred` | Geometry cannot be stale or mistyped |
| 3 | `layer`, as an **ordering** | `tagged` | It says *above*, not *how far* |
| 4 | Default per structure (bridge 5.0 m, bore 7.0 m, cutting 4.5 m) | `assumed` | It has to be somewhere, and the ground is the one place it is not |

**`layer` is not metres.** `layer × 5 m` is the naive move this refuses. Only 1.1 % of ways
in the benchmark district carry a layer at all, over six distinct values; multiplying it
out would lift every `layer=1` way five metres whether or not anything passes beneath it,
and would flatten a genuine three-level interchange into even steps matching no structure
on earth. `LAYER_SEPARATION_M` is used **only** to separate levels already known to be
stacked — never to give a lone way a height.

An `ele` that contradicts its own structure — putting a bridge underground — is treated as
a datum mismatch and skipped, not honoured.

---

## Structure is a property, not a category

```
functional type   road · railway · pedestrian · water     what it is FOR
structure         ground · bridge · tunnel · covered ·    how it is CARRIED
                  trench · floating
```

Both are recorded, and neither replaces `FeatureKind`. This is the modelling fix the whole
engine rests on: `classifyFeature` used to return `bridge`, so a street that crossed a
river **stopped being a street** — it left the road graph, lost its junctions, its width
solving and its markings, and reappeared as an unrelated slab.

Two consequences worth naming:

* `tunnel=building_passage` and `covered=yes` resolve to **at grade**. They are arcades and
  gateways — the ground floor of the street. A blanket "tunnel means delete" removed 114 of
  the 226 tunnel-tagged ways in the benchmark district, 95 of which carry no other signal.
* `layer < 0` with no tunnel tag resolves to an **open trench**. That is the only thing
  identifying a ring road in a cutting; draped on the surface it runs through the district
  it is supposed to pass beneath.

---

## How a ramp appears

Nobody generates one. There is no ramp-length constant anywhere.

The unit of solving is the **chain** — a maximal run of ways through degree-2 nodes — so
`street … bridge … street` is one problem. The deck's interior is pinned **hard**, the
surrounding ground is **soft**, and `lipschitzEnvelope` returns the closest profile to
those wishes that never exceeds the maximum grade. The ramp is what that constraint
produces on its own, at exactly the design gradient, over exactly as much length as the
geometry has room for.

It is exact and O(n): a Lipschitz-continuous profile through a set of hard seeds lies
between an upper and a lower envelope, each computable in one sweep, and the answer is
each vertex's own wish clamped between them. No iteration, no convergence criterion, and
no dependence on the order the ways arrived in.

A structure's **end** vertices wish for the *ground*, not the deck. That asymmetry was a
real bug: with the ends wishing for the deck, the entry ramp inherited the approach's
ground target and the exit ramp inherited the deck's, so one side ramped correctly and the
other left at deck height and dropped at twice the legal gradient.

### Junctions

Chains end at junctions, and every arm must arrive at one height or the crossroads tears.
Chains are solved free, the node is pinned to the **mean** of what its arms wanted, and the
chains are re-solved — three passes, then a hard snap so agreement is a guarantee rather
than a hope. The mean is the continuous choice; the maximum would jack a junction up to its
most ambitious arm and put a step in all the others.

A junction also has a **vertical test**. Arms that genuinely meet agree to the millimetre,
because the solver pinned them; a spread approaching a storey proves two different levels
were snapped together, and no junction surface is drawn at all. A small gap is a blemish; a
sheet of asphalt fusing a deck to the road beneath it is a lie about the city.

---

## Tessellation: mandatory breakpoints vs adaptive subdivision

Three independent reasons to put a vertex somewhere, and the maximum wins.

1. **Mandatory breakpoints** — every station where the profile's *slope changes*. Never
   dropped, never traded against a budget. The solved profile is piecewise linear, so these
   are the only places it bends: put a vertex at each and the mesh reproduces the profile
   **exactly**, with not one vertex more than the shape requires.
2. **Adaptive samples** — error-bound refinement where a straight segment would misstate
   the profile by more than 12 cm. Tested at the quarter points as well as the midpoint,
   because a symmetric hump has zero midpoint error and is invisible to a midpoint test.
3. **Terrain** — the DEM's own resolution. Entirely independent of the other two: flat
   ground still needs a ramp subdivided, and a flat road still needs a hill subdivided.

Measured on a 90-way grid city with 30 structures:

| Rule | Terrain OFF | Terrain ON |
|---|---:|---:|
| Uniform at profile spacing | 106× | 1.64× |
| Blanket "cut every 40 m" | 42× | — |
| **Slope-change breakpoints + error bound** | **1.67×** | **1.01×** |

A dead-straight street bends nowhere and costs exactly nothing.

---

## Terrain: correcting a wrong DEM, not making room for structures

The terrarium mosaic this app fetches is a radar **surface** model. Measured on its own
z15 tiles over the benchmark district: a Gothic-Quarter street reads 29.8 m against a real
~10 m, a flat quay reads 8.5 m, a 99 m hotel reads 0.0 m, and **open harbour water reads
+4.7 m** — the beam came back off moored vessels.

Two responses, and they are not the same job:

* **Correcting an anomaly** is legitimate. A sample standing well above its own
  neighbourhood floor is an object, not the ground, and the floor is used instead. Mapped
  water overrides the raster outright, because a harbour of artefacts has no ground in the
  window to find.
* **Deforming the terrain to accommodate infrastructure is not done.** Bridges live above
  the ground and tunnels below it. The surface is not cut to reveal a trench or flattened
  to seat a deck.

A carriageway that ends up below the resolved ground is simply **not drawn**. That places
the portal exactly where the alignment crosses the surface — no portal geometry, no
marker, no special case — and the ramps descending into it still read as *entering*
something rather than stopping. Drawn instead, it would z-fight through the hillside or be
occluded anyway.

---

## The waterfront

A harbour is where every assumption in this document is tested at once, and it
needed three things that did not exist.

**The sea is nobody's polygon.** OSM maps the SHORE as a directed line —
`natural=coastline`, land on the left, water on the right — and leaves the water
implicit, because a polygon for the Mediterranean would be absurd. Measured on
the benchmark district, the only water polygons of any size are three marina
basins; the open Port Vell basin and the sea beyond it are pure coastline. So
the generator drew **no sea at all** and hung the Barceloneta over nothing.

`coastline.ts` assembles it: join the ways into chains, clip to the fetch box,
then walk each chain forwards and continue along the box boundary CLOCKWISE
until the next chain's entry. Clockwise is not arbitrary — water is on the right
of the direction of travel, so keeping the boundary on the right encloses the
water rather than the land. The result is emitted as an **ordinary water
feature**, deliberately: the water layer, its material, the layer toggle and the
DEM water mask then all work on it with no new path and no new contract.

Where the shoreline is too fragmentary to close — a way that dangles inside the
box because it continues in a tile we did not fetch — no sea is produced. An
empty answer is correct inland and safe everywhere else; inventing the rest of a
coastline would invent a coast.

**A quay's height is not a property of the ground under it.** There is no ground
under it. `buildPierLayer` puts piers, quays, breakwaters, groynes and docks on
the **sea datum** plus a freeboard, which is what stopped the Moll d'Espanya
being drawn inside its own harbour: the raster reads +8.5 m on that flat quay
and +4.7 m on the open water beside it. The mechanism is the one railway
platforms have always used — triangulate, lift a constant unexaggerated height
above the datum, give it a side face — and only the datum changed.

**None of it was being requested.** The Overpass query had no `natural=coastline`,
no `man_made=pier|quay|breakwater|groyne`, no `waterway=dock`, no
`landuse=harbour`. The new group is sized from the data — the district's entire
waterfront is about 55 elements — and paid for by cutting the bridge group,
whose linear half was redundant: a `bridge=yes` highway is a highway and already
arrives with the streets.

---

## Landmarks are allowed to be specific. The engine is not.

One building in the benchmark district is authored rather than generated, and
the dividing line is worth stating because it will come up again.

The procedural extruder is a **strict single-ring vertical prism** — one
outline, two z values, the same plan at the top as at the bottom. Handed the W
Barcelona's real footprint and `height=99` it produces a 99 m prism: right
volume, right position, unrecognisable. The building's identity is that its plan
changes at every one of its 26 storeys.

So `scripts/blender/build-hotel-vela.py` authors it, and is allowed to know that
this particular building is a curved sail, because a landmark's silhouette is
not derivable from its tags. **Nothing in `src/lib/geo` knows about it** — no
coordinate, no name, no city is special-cased anywhere in the infrastructure
engine. Port Vell is a stress test, not a subject; the same code has to work in
Rotterdam, Hamburg or Hong Kong.

`hotel-vela-ifc.test.ts` asserts the things a prism would otherwise pass: the
plan narrows monotonically on both axes, one edge stays vertical while the other
sweeps in by more than 40 m, and the floor line stands proud of the glass as
GEOMETRY rather than only as material — flush, it is invisible at 99 m and
twenty-six storeys of curtain wall read as one flat sheet.

---

## Terrain OFF is a first-class citizen

The presence of a DEM is **not** a semantic signal. Only the function answering "what is
the ground here" differs; everything downstream is identical, and tests assert that terrain
OFF and a flat DEM produce the same structures, the same phases and the same elevations to
six decimals.

This falls out of the design rather than being maintained: with no sampler, ground is a
constant and a structural offset is still true metres above it, so an overpass still clears
the road beneath it by 5 m on a flat map.

Every terrain change — on, off, exaggeration, micro-relief — rebuilds the layers. Nothing
caches a height across that boundary.

---

## Failure and fallback behaviour

What happens when the data does not cooperate. All of it is deterministic: the same scene
and the same data produce byte-identical geometry, and no decision depends on the order
features are processed in.

| Situation | Behaviour |
|---|---|
| No `layer`, no `ele`, no crossing found | Default clearance for the structure type, confidence `assumed` |
| Mistyped `layer` (`99`) | Clamped to ±5 |
| `ele` contradicting the structure | Ignored; falls through to the next source |
| `ele` over ground the resolver does not trust | Ignored — a good measurement differenced against a bad one is worse than either |
| Contradictory tags (`bridge` **and** `tunnel`) | Precedence order decides; output is always finite |
| Span too short to ramp at the design grade | The approaches take the climb first; if still impossible the error is **shared** across the transition rather than concentrated in a step, and the profile is flagged `relaxed` |
| DEM spike under a span | Trimmed maximum: at least one top sample is always discarded, so one bad pixel cannot set a viaduct's height |
| DEM reads high over mapped water | Clamped to the sea datum |
| Degenerate way (< 2 points, duplicate points) | Skipped; never emits NaN |
| Way split into several ribbons | All pieces resolve through `sourceId` to one profile — never by parsing a generated id |

---

## Debugging a height

In dev, the console has the whole chain that produced a number, which is otherwise
unrecoverable once it is a triangle:

```js
__geoVertical.summary()      // census: structures, confidences, grade-relaxed count
__geoVertical.describe('w51')// per-station ground, elevation, offset and phase
```

`describe` prints the way's functional type, structure, confidence, length, mandatory
breakpoints, and a station table — which is enough to say *why* a road is where it is
rather than only *that* it is wrong.

---

## Where the tests are

| File | Covers |
|---|---|
| `terrain-truth.test.ts` | Water anomaly, obstruction rejection, spike trimming, determinism, sampling cost |
| `vertical.test.ts` | Tag semantics, the resolution hierarchy, the slope solver |
| `vertical-network.test.ts` | The six synthetic scenarios, crossings, adversarial cases, fast-path equivalence against an exhaustive reference |
| `vertical-mesh.test.ts` | **Solver output vs rendered geometry** — the regression for the one-quad bridge, portals, C0 continuity, terrain ON/OFF parity, geometry density |
| `terrain-integration.test.ts` | Every layer against one shared surface, under exaggeration |
| `coastline.test.ts` | The sea, from a directed shore: which side is water, bays, split ways, dangling shorelines |
| `hotel-vela-ifc.test.ts` | The landmark: a form the extruder could not have produced |
