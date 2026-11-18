# Lujiazui pedestrian bridges — reconstruction and renderer review

Date: 2026-09-22. Scope: existing OSM pedestrian infrastructure around Mingzhu,
IFC mall, Jin Mao and SWFC. This is a reference reconstruction, not an as-built
survey. New development proposals are not represented as existing bridges.

## Evidence

* Shanghai government, 2026-07-08: identifies the existing four-part network
  (Mingzhu ring, Oriental platform, Century bridge, Century corridor), separately
  from proposed extensions:
  https://www.shanghai.gov.cn/nw4411/20260708/d46d05a90bc448639e745477e528d355.html
* Peng Qing-yan, Shanghai Urban Construction Design and Research General
  Institute, Urban Transport of China 9(6), 2011: distinguishes platforms,
  roadside elevated corridors and point overpasses, with Mingzhu as a case study:
  https://www.chinautc.com/upload/accessorychinautc/pdf/201312914222719376.pdf
* Wang Jun's 2010 site report: Mingzhu circumference 370 m, overall deck 8.5 m,
  clear passage 7.5 m, reported height 7.9 m:
  https://wangjun.blog.caixin.com/archives/13466
* Xinmin, 2014-09-02, quoting the construction group: Century corridor approx.
  543 m long, standard width 9 m, steel columns and box girders:
  https://wap.xinmin.cn/content/25285630.html
* Contemporary Century bridge report: L-shaped steel bridge, 102 m long, 8 m wide:
  https://page.lgmi.com/html/201104/26/7085.htm
* Pudong government, 2026: flower-corridor landscaping around Mingzhu exists.
  Planting dimensions are not supplied, so this change does not invent them:
  https://www.pudong.gov.cn/zwgk/14482.gkml_ywl_lhlygl/2026/177/356923.html

Reported dimensions are not fully consistent across publications. In particular,
some describe a 9.7 m ring width and 5.5 m height without establishing the same
measurement datum. The code uses 8.5 m as a reference overall ring section and
retains the fixture's mapped `height=9`, not a claimed surveyed deck elevation.
Do not reinterpret clearance, top-of-railing height and walking-surface height
as interchangeable measurements.

The cached OSM fixture supplies actual alignments. Width priors are bounded by
identity and geography: w48876367 (Mingzhu), w520629581 (Century bridge) and
w328910842 (Century corridor). The latter two are route matches to the published
descriptions, not surveyed object attribution. Explicit OSM widths take priority;
adjacent stairs, access links and unrelated footways retain their own widths.

## Changes and visual iterations

1. Add stations inside width transitions. Previously a two-vertex segment
   interpolated its widening over the whole way, regardless of the intended
   transition distance. Existing curved topology and OSM geometry are retained.
2. Preserve closed elevated loops and endpoint attachments to interior deck
   vertices. Existing height evidence survives crossings; negative tunnel layers
   and gaps in OSM layer numbering no longer count as additional bridge floors.
3. Use exact junction membership, not nearby ribbons, to resolve junction height.
   Close elevated junction undersides and external fascia; keep arm openings free.
4. Detailed pedestrian bridges receive open rail geometry (curb, posts, intermediate
   rails and 1.1 m handrail). This is illustrative detailing, not fabrication data.
5. Visual review revealed metre-scale Float32 quantization at Shanghai longitude.
   Linear meshes now subtract an origin in double precision before GPU upload.
   Mesh placement restores the geographic transform, preserving centimetre detail.
6. A subsequent street-level review exposed the ground-overlay material drawing
   bridge undersides through their sides. Elevated ranges now use an opaque,
   depth-writing material, batched separately from the existing ground overlay.
   Two material groups avoid one draw call for every railing or bridge.

The existing inferred support spacing and simple columns remain approximations.
Pier locations have not been checked against surveyed foundations or traffic
clearance envelopes. Stair fabrication dimensions, elevator enclosure dimensions,
canopies, landscaped platforms, local deck flares and building entrances still
need richer source geometry for an as-built reconstruction.

## Reproduce and inspect

```powershell
node node_modules/vite/bin/vite.js --host 127.0.0.1 --port 5182
# Open http://127.0.0.1:5182/scripts/qa/shanghai-bridges.html
node scripts/blender/export-shanghai-bridges.mjs
blender --background --python scripts/blender/render-shanghai-bridges.py -- .tmp/shanghai-bridges
npx vitest run src/lib/geo
npx tsc -b --pretty false
```

Blender imports the shipping mesh, not a second idealized ring model. Outputs:
`.tmp/shanghai-bridges/shanghai-bridges.blend`, `ring.png`, `connections.png`,
`street.png`. Neutral ground isolates geometry; these are not photo overlays.

Browser inspection covered the ring and street view. On this desktop the final
review scene reported approximately 59–60 FPS, four draw calls and 180,841 rendered
triangles (including transparent ground passes). This is a local QA scene, not a
mobile or full-viewer benchmark. Geometry generation observed around 230–440 ms.

Regression checks cover real-fixture ring elevation, both mapped attachments,
identity/width precedence, sparse width transitions, exact junction membership,
and surviving nondegenerate handrail triangles in the actual GPU buffer.

Initial verification: 54 geo test files, 1,420 tests passed. The access iteration
below expands this to 55 files and 1,430 tests.

Changes are local; no production deployment was performed.

## Access iteration — 2026-09-23

The original park fixture contains **no** `highway=steps` or elevator features.
An official OSM API extract was therefore retrieved for the smaller access area:
https://api.openstreetmap.org/api/0.6/map?bbox=121.4935,31.2385,121.501,31.2425

The extract in `src/lib/geo/__fixtures__/shanghai-access.json` contains 103
pedestrian ways/nodes, including 15 stair ways (five with `conveying=yes`) and one
elevator node, n4470914092. Source URL, retrieval date and ODbL attribution are
included. It supplies reproducible QA input; production continues to query OSM.
The query now reserves a small independent budget for steps and elevator nodes,
and parsing deduplicates repeated elements. No elevator positions are invented
for the other access sites.

A contemporary on-site report confirms stairs, paired escalators and accessible
lifts around the ring, but does not establish current operating status or exact
dimensions: https://paper.xinmin.cn/html/xmwb/2021-06-22/9/108997.html

Access reconstruction now includes:

* Separate stair/escalator semantics, with mapped `step_count` where supplied.
  Otherwise the visual riser target is 0.17 m, not a surveyed dimension.
* Heights derived from shared bridge vertices and the resolved ground. Stairs
  do not participate in the walking-ramp grade envelope and cannot drag the
  bridge down or pull the sidewalk up. Unconnected stairs gain no invented rise.
* Horizontal treads, vertical risers, underside stringers, edge nosings and
  handrails. Mapped turns receive flat landings. Trimmed stair ends retain the
  junction's elevation so the landing does not end with a vertical gap.
* Escalators use dark handrails and tinted balustrades. Their vertical rise stays
  on the longest straight mapped segment; short bent approaches remain level.
  These are static visual representations, not operational simulations.
* The mapped elevator receives an estimated framed enclosure, roof, ground and
  upper landing, and door panels. Its position and attached bridge are mapped;
  2.5 x 2.8 m enclosure dimensions and door orientation are inferred.
* Railing openings around the lift. Ground and elevated paths sharing its XY
  remain separate horizontal networks, joined by the shaft rather than a ramp.

Browser QA covered stairs and the lift at a narrow viewport, as well as the ring
and connections. Around 60 FPS and four draw calls were observed locally; these
measurements are not a general device-performance guarantee. The expanded mesh
export has 166,328 triangles before Blender's review-area crop.

Reproduce the updated Blender artifact without overwriting the earlier review:

```powershell
node scripts/blender/export-shanghai-bridges.mjs .tmp/shanghai-bridges/access-r2
blender --background --python scripts/blender/render-shanghai-bridges.py -- .tmp/shanghai-bridges/access-r2
```

The renderer now also produces `stairs.png` and `elevator.png`. The `.blend`
contains the same mesh emitted by the web renderer, with neutral review lighting.

Final access validation: all 1,430 tests in 55 geo files passed; `tsc -b` passed;
`git diff --check` passed. The current browser review reported no console errors.
