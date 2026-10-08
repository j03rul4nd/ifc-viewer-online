// ─── sample-layers ────────────────────────────────────────────────────────────
// A small, SYNTHETIC GeoJSON sample around Passeig de Gràcia (Barcelona): one
// 3D route, one draped walking route, a zone with a height column, and a few
// points. Hand-drawn approximations — not survey data, and labelled so in the
// UI. It exists so the vector pipeline can be tried (and QA'd) with one click.

export const SAMPLE_LAYER_NAME = 'Passeig de Gràcia (sample)'

export const SAMPLE_GEOJSON = {
  type: 'FeatureCollection',
  features: [
    {
      type: 'Feature', id: 'route-walk',
      properties: { name: 'Walking route', kind: 'route', stops: ['Passeig de Gràcia', 'Diagonal'] },
      geometry: {
        type: 'LineString',
        coordinates: [
          [2.17006, 41.38722], [2.16856, 41.38870], [2.16706, 41.39018],
          [2.16556, 41.39166], [2.16406, 41.39314], [2.16256, 41.39462],
        ],
      },
    },
    {
      type: 'Feature', id: 'route-drone',
      properties: { name: 'Drone flight path', kind: 'flight', height: 60 },
      geometry: {
        type: 'LineString',
        coordinates: [
          [2.16480, 41.39110, 40], [2.16620, 41.39200, 60], [2.16760, 41.39120, 80],
          [2.16680, 41.38990, 60], [2.16520, 41.39010, 40],
        ],
      },
    },
    {
      type: 'Feature', id: 'zone-block',
      properties: { name: 'Study block', kind: 'zone', height: 25 },
      geometry: {
        type: 'Polygon',
        coordinates: [[
          [2.16540, 41.39080], [2.16680, 41.39185], [2.16800, 41.39090],
          [2.16660, 41.38985], [2.16540, 41.39080],
        ], [
          [2.16630, 41.39060], [2.16680, 41.39100], [2.16720, 41.39070],
          [2.16670, 41.39030], [2.16630, 41.39060],
        ]],
      },
    },
    {
      type: 'Feature', id: 'zone-works',
      properties: { name: 'Works area', kind: 'zone' },
      geometry: {
        type: 'Polygon',
        coordinates: [[
          [2.16880, 41.38820], [2.16960, 41.38880], [2.17030, 41.38820],
          [2.16950, 41.38760], [2.16880, 41.38820],
        ]],
      },
    },
    {
      type: 'Feature', id: 'station-pdg',
      properties: { name: 'Passeig de Gràcia', kind: 'station', code: 'PDG-01', lines: ['L2', 'L3', 'L4', 'R2'] },
      geometry: { type: 'Point', coordinates: [2.16706, 41.39018] },
    },
    // Devices as an asset provider would send them: nested, and knowing their
    // station only by CODE — the twin search links them to the station.
    ...[
      [2.16492, 41.39158, 'Sensor A', 'PDG-01'], [2.16727, 41.38988, 'Sensor B', 'PDG-01'],
      [2.16910, 41.38842, 'Sensor C', 'DIA-02'],
    ].map(([lon, lat, name, station], i) => ({
      type: 'Feature', id: `poi-${i}`,
      properties: {
        name, kind: 'sensor',
        asset: { id: `DEV-${1001 + i}`, station: { code: station }, readings: [{ type: 'temp', value: 21 + i }] },
      },
      geometry: { type: 'Point', coordinates: [lon, lat] },
    })),
  ],
}
