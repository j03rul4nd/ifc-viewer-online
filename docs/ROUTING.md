# Routes in Measure

**Measure → Distance → Route.** Click where a route starts and where it ends;
the viewer finds the fastest way between them and says how long it takes, on
foot, by bike or by car — inside a building, across a city, or both in one
route (Plaça de Catalunya → a room on the 12th floor of the Hotel Vela).

Everything runs in the browser (`src/lib/route/`). No routing provider sees
the two points.

## What decides the kind of route

| Start | End | Route |
| --- | --- | --- |
| inside a model | inside a model | **indoor**: corridors, doors, stairs (lifts when modelled) |
| on the map | on the map | **streets**: OpenStreetMap, walk / bike / car |
| on the map | inside a model (or the reverse) | **streets to the entrance door, then indoor** |

"Inside a model" = the clicked point is on an IFC element (`anchors`).

## Indoor (`indoor.ts`)

- **Grid per storey**, 0.25 m. A cell is *floor* where a slab, space, covering
  or stair landing lies at the storey's level (±0.6 m); a *wall* where a wall,
  curtain wall, plate, member, column or railing crosses waist height
  (1.0 m above the floor), grown by one cell. Door openings are cut out of
  walls in the geometry, so they stay passable.
- **Imperfect models are expected.** A cell with no modelled floor costs 8×,
  crossing a wall 40×: a modelled path always wins, and when none exists the
  route still arrives and reports the metres it had to guess (shown as a
  warning on the leg). Measured on the Hotel Vela: 2 m guessed on Level 12.
- **Stairs**: every `IfcStairFlight` / `IfcRampFlight` is an edge from its
  lowest to its highest point; ends between storeys (half landings) join the
  flight end within 4 m at the same height. Lifts: `IfcTransportElement`, or a
  space named lift / ascensor / elevator / Aufzug…, as a vertical shaft.
- **Times**: walking 1.3 m/s; stairs 0.25 m/s of rise up (~17 s per 4.2 m
  storey), 0.4 m/s down; lift 30 s wait + 1.6 m/s.
- Grids are built lazily, only for the storeys a route touches. The building
  is read once per set of loaded models (~7–15 s on the Hotel Vela's 30
  storeys in a headless browser; then cached).

## Streets (`osm-network.ts`)

- One Overpass request for the `highway` ways in the box around both points
  (+600 m) — the service the map already uses, behind the map's consent.
  One retry after 4 s when Overpass is busy.
- Access per mode from OSM tags: `foot`, `bicycle`, `motor_vehicle`/`access`,
  `oneway` (+ `oneway:bicycle`), roundabouts and motorways one-way, steps
  slower on foot and closed to bikes, bikes pushed on footways.
- Speeds: walking 4.8 km/h, cycling 16 km/h, driving at `maxspeed` or an urban
  default per class. **Free flow**: no traffic, lights or parking — the time is
  a floor, and the panel says so.
- The route attaches to the largest connected piece of the network, so a point
  by a pier or a private port road does not strand it on an island.

Measured (headless, Hotel Vela + OSM, 2026-10-17), Plaça de Catalunya → W Barcelona:

| Mode | Time | Distance | Via |
| --- | --- | --- | --- |
| foot | 41 min | 3.27 km | Portal de l'Àngel, Barri Gòtic |
| bike | 17 min | 3.83 km | Pau Claris, Urquinaona, Via Laietana |
| car | 9.5 min | 4.22 km | Rambla de Catalunya, Gran Via, Via Laietana, Joan de Borbó |
| foot → room on Level 12 | 45.5 min | 3.47 km | streets → entrance → stairs Ground → Level 12 |

## Not done (yet), and how it could be

- **Public transport** (metro, bus): needs timetables (GTFS) and a transit
  router (RAPTOR runs fine in a browser on a city's GTFS). TMB publishes
  Barcelona's GTFS openly.
- **Traffic**: needs live or historical speeds (a paid provider) — out of the
  frontend-only rule.
- **Accessible route** (no stairs): `route(..., { avoidStairs: true })` exists
  in the planner; with lifts or ramps modelled it is one switch in the panel.
- **Turn-by-turn text** beyond the street names per leg.
