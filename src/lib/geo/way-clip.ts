// ─── way-clip ─────────────────────────────────────────────────────────────────
// A WAY ENDS WHERE THE MEASURED GROUND ENDS.
//
// A district is asked for by box, and a way that crosses the box comes back
// whole — a street 700 m long that clips one corner arrives with all 700 m of
// itself. That was harmless while the relief ran, measured, to the edge of its
// patch. It does not any more: the outer band of the patch eases onto the flat
// map (the rim, geo-terrain), and that band is drawn for continuity, not
// surveyed. Where the site sits near one side of the patch it is short and
// steep — 90 m of height in under 200 m on El Carmel.
//
// A road cannot follow that. The solver holds it to a legal grade, so it leaves
// the ground and the builder, correctly, walls a way that has left the ground
// down to it: the district came out fenced by slabs of ramp wall tens of metres
// high. The rule that removes them is the honest one — a carriageway is drawn
// on ground that was measured, and stops where that stops.
//
// PURE: points in, runs of points out.

export interface LatLonBox { south: number; north: number; west: number; east: number }

interface Pt { lat: number; lon: number }

/**
 * The parts of a polyline that lie inside a box, in order.
 *
 * Each run is a polyline of at least two points; where the line crosses the
 * box edge the run gets a new vertex exactly on it. A line wholly inside comes
 * back as one run holding the SAME points (no copies of the vertices, so a
 * caller can tell "untouched" by length and identity); one wholly outside comes
 * back empty.
 */
export function clipLineToBox<P extends Pt>(line: ReadonlyArray<P>, box: LatLonBox): P[][] {
  const runs: P[][] = []
  let run: P[] = []
  const close = (): void => {
    if (run.length >= 2) runs.push(run)
    run = []
  }
  const inside = (p: Pt): boolean =>
    p.lat >= box.south && p.lat <= box.north && p.lon >= box.west && p.lon <= box.east

  for (let i = 0; i < line.length - 1; i++) {
    const a = line[i]
    const b = line[i + 1]
    // Liang–Barsky: the stretch [t0, t1] of a→b that is inside the box.
    let t0 = 0
    let t1 = 1
    const dLon = b.lon - a.lon
    const dLat = b.lat - a.lat
    let visible = true
    for (const [p, q] of [
      [-dLon, a.lon - box.west], [dLon, box.east - a.lon],
      [-dLat, a.lat - box.south], [dLat, box.north - a.lat],
    ] as const) {
      if (p === 0) {
        if (q < 0) { visible = false; break }
        continue
      }
      const r = q / p
      if (p < 0) { if (r > t1) { visible = false; break } if (r > t0) t0 = r }
      else { if (r < t0) { visible = false; break } if (r < t1) t1 = r }
    }
    // A stretch of no length is a touch — a corner grazed — not a piece of way.
    if (!visible || t1 - t0 <= 1e-12) { close(); continue }

    const at = (t: number): P => ({ ...a, lat: a.lat + dLat * t, lon: a.lon + dLon * t })
    const start = t0 > 0 ? at(t0) : a
    const end = t1 < 1 ? at(t1) : b
    if (run.length === 0) run.push(start)
    else if (t0 > 0) { close(); run.push(start) }
    run.push(end)
    // Left the box inside this segment: the run ends here.
    if (t1 < 1 || !inside(b)) close()
  }
  close()
  return runs
}
