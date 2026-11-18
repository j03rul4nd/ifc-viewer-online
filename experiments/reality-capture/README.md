# Reality capture experiments

Scratch rig behind `docs/REALITY_CAPTURE_PLAN.md`. Not part of the app build —
plain Python, run by hand.

| File | Role | Needs |
|---|---|---|
| `selftest_fusion.py` | Analytic room, exact depth, full fusion, measured accuracy | numpy |
| `fuse_to_ply.py` | The pipeline half we own: depth + pose → PLY with confidence | numpy |
| `blender_capture.py` | Renders the three synthetic scenes with an exact Z pass | Blender 4.5 |
| `evaluate.py` | Scores a fused cloud against the mesh it came from | Blender 4.5 |
| `coverage_probe.py` | How much of a model a capture can judge — the phase-2 kill criterion | Blender 4.5 |

Start here — no Blender, no GPU, a few seconds:

```bash
python selftest_fusion.py
```

It writes `selftest_room.ply` to the system temp directory for inspection.

The PLY layout it emits is pinned from the viewer side by
`src/lib/pointcloud/reality-capture-ply.test.ts`, which rebuilds the same header
in TypeScript and feeds it to the real `PlyReader` -- so a drift between the
Python writer and the reader fails CI without needing this script to have run.

The Blender half runs end to end for all three scenes; measured results are in
the plan, §5.2. Full command cycle in §12.

`out/` is derived data (renders, EXR depth, .blend, fused clouds — tens of MB per
scene) and is not committed.
