import type { BlogPost } from './blog-posts'

// The rain-flood simulation (docs/FLOOD_SIMULATION.md): how to set it up, the
// rivers a city has buried, and how depth and speed make a hazard. Every
// figure in them was measured in the running app on 2026-10-10; every image
// is a capture of it (scripts/og/capture-flood-shots.mjs) or a diagram drawn
// from what it does (scripts/og/build-blog-infographics.mjs).

const base = {
  date: '2026-10-10',
  dateModified: '2026-10-10',
  author: 'IFC Viewer Team',
}

const hero = (slug: string) => ({
  heroImage: `blog/images/${slug}-1600x900.jpg`,
  heroImageVariants: [
    { src: `blog/images/${slug}-1600x900.jpg`, width: 1600, height: 900 },
    { src: `blog/images/${slug}-1200x900.jpg`, width: 1200, height: 900 },
    { src: `blog/images/${slug}-1200x1200.jpg`, width: 1200, height: 1200 },
  ],
  heroCredit: 'IFC Viewer Online · terrain ICGC (CC BY 4.0) · map data © OpenStreetMap contributors (ODbL)',
})

const CREDIT = 'IFC Viewer Online · terrain ICGC (CC BY 4.0) · map data © OpenStreetMap contributors (ODbL)'

/** A capture from the viewer, 1600 wide with an 800 variant. */
const shot = (name: string, alt: string, caption: string) => ({
  type: 'image' as const,
  src: `blog/images/${name}.jpg`,
  alt,
  caption,
  width: 1600,
  height: 900,
  srcSet: [
    { src: `blog/images/${name}-800.jpg`, width: 800 },
    { src: `blog/images/${name}.jpg`, width: 1600 },
  ],
  sizes: '(max-width: 860px) 100vw, 820px',
  credit: CREDIT,
})

/** A diagram (PNG, 1600 with an 800 variant). */
const figure = (name: string, alt: string, caption: string) => ({
  type: 'image' as const,
  src: `blog/images/${name}.png`,
  alt,
  caption,
  width: 1600,
  height: 900,
  srcSet: [
    { src: `blog/images/${name}-800.png`, width: 800 },
    { src: `blog/images/${name}.png`, width: 1600 },
  ],
  sizes: '(max-width: 860px) 100vw, 820px',
  credit: 'IFC Viewer Online',
})

/** A capture of the interface, at 2× (width × height in CSS pixels × 2). */
const ui = (name: string, alt: string, caption: string, width: number, height: number) => ({
  type: 'image' as const,
  src: `blog/images/${name}.jpg`,
  alt,
  caption,
  width,
  height,
  // A 1× copy for ordinary screens; the 2× one for high-density ones.
  srcSet: [
    { src: `blog/images/${name}-1x.jpg`, width: Math.round(width / 2) },
    { src: `blog/images/${name}.jpg`, width },
  ],
  sizes: `(max-width: 860px) 100vw, ${Math.min(820, Math.round(width / 2))}px`,
  credit: 'IFC Viewer Online',
})

export const FLOOD_POSTS_EN: BlogPost[] = [
  // ── The guide ──────────────────────────────────────────────────────────────
  {
    ...base,
    ...hero('flood-simulation-ifc-model-online'),
    slug: 'flood-simulation-ifc-model-online',
    title: 'Rain-Flood Simulation on an IFC Model, in the Browser: a Setup Guide',
    seoTitle: 'Flood Simulation on an IFC Model, Online: Setup Guide',
    seoDescription: 'Run a 2-D rain-flood simulation on an IFC in the browser: terrain, buildings, OSM streets, storm and soil. See depth, speed and which doors the water reaches.',
    excerpt: 'Where does the water go in a cloudburst, and does it reach the doors? A georeferenced IFC, the ground under it and the streets around it are enough for a first answer, in the browser, in under a minute. How to set the simulation up so the answer is worth something, and how to read it.',
    heroAlt: 'Rain-flood simulation in IFC Viewer Online: the W Barcelona hotel IFC on the 3D map of Barceloneta, with the maximum water depth of an extreme storm in blue around it',
    category: 'Tools & comparisons',
    categorySlug: 'tools',
    readTimeMin: 12,
    keywords: ['flood simulation online', 'IFC flood simulation', 'BIM flood risk', 'pluvial flood model', 'rain flood simulation in the browser', 'surface water flooding building', 'flood depth map', 'shallow water simulation GPU'],
    faqs: [
      { q: 'Can I simulate flooding on an IFC model without GIS or hydraulic software?', a: 'Yes, for an indicative answer. IFC Viewer Online builds a 2-D grid from the model, the ground under it and, with the map on, the OpenStreetMap neighbourhood around it, then runs a shallow-water simulation on your graphics card. A two-hour storm over a few hectares takes seconds. It is not a certified hydraulic study: there is no sewer network, and rivers rising are not an input yet.' },
      { q: 'Does my model leave my computer?', a: 'No. The simulation runs in your browser. With the map on, the map tiles, the relief and the OpenStreetMap data are requested from public providers, which see the area and your IP address; the map asks for your consent before the first request. The model and the results stay on your device.' },
      { q: 'Which cell size should I use?', a: '1 m to see doors, kerbs and the plot itself; 2 m for a block and its streets; 5 m for a neighbourhood. Smaller cells take longer and need ground data that fine: a 5 m elevation model does not get better with 1 m cells.' },
      { q: 'Why does my building stand above the water?', a: 'Usually its stated height (IfcMapConversion.OrthogonalHeight) does not match the terrain, so the model floats above the ground around it. The simulation measures the difference, reports it and, by default, stands its ground on the model\'s ground floor. The lasting fix is in the IFC.' },
    ],
    references: [
      { id: 'bates2010', title: 'A simple inertial formulation of the shallow water equations for efficient two-dimensional flood inundation modelling', source: 'Journal of Hydrology 387 · Bates, Horritt & Fewtrell', year: '2010', url: 'https://doi.org/10.1016/j.jhydrol.2010.03.027', note: 'The scheme the simulation solves: local-inertial shallow water on a regular grid.' },
      { id: 'dealmeida2012', title: 'Improving the stability of a simple formulation of the shallow water equations for 2-D flood modeling', source: 'Water Resources Research 48 · de Almeida, Bates, Freer & Souvignet', year: '2012', url: 'https://doi.org/10.1029/2011WR011570', note: 'The flux weighting that keeps the scheme stable on shallow sheets of water.' },
      { id: 'icgc-met', title: 'Elevations: digital terrain models', source: 'Institut Cartogràfic i Geològic de Catalunya', url: 'https://www.icgc.cat/en/Geoinformation-and-Maps/Data-and-products/Elevations', note: 'The 5 m bare-earth model under the examples in this guide.' },
    ],
    content: [
      { type: 'p', text: '"If 120 mm falls in two hours, where does the water go, and does it reach the doors?" The question comes up at design reviews, in planning conversations, and every time a storm floods a street nearby. The usual answer is a hydraulic consultant, or no answer at all until much later in the project.' },
      { type: 'p', text: 'A georeferenced IFC already carries most of what a first answer needs: where the building stands, its footprint and its ground floor. Add the ground under it and the streets around it, and a 2-D rain-flood simulation can show where surface water runs and collects, how deep and how fast, in the browser, in seconds. It is indicative, not a certified study, and this guide is about setting it up so that the indication is worth having.' },
      { type: 'takeaways', items: [
        'A flood simulation is only as good as its ground. Use the map\'s relief or a DEM, and read the "What the simulation sees" report before trusting a single number.',
        'Cell size is a question of scale: 1 m for doors and kerbs, 2 m for a block, 5 m for a neighbourhood.',
        'Keep the OpenStreetMap neighbourhood on. Sealed streets, parks that absorb, walls, the buildings next door and the rivers that are gone all change where the water goes.',
        'The result is maximum depth, speed and arrival time, plus the doors, spaces and equipment below the water next to them, exportable as GeoTIFF for GIS.',
        'It answers "where does surface water collect?", not "is this compliant?". No sewer network, and rivers rising are not an input yet.',
      ] },
      {
        type: 'tool-demo',
        demo: 'flood-rain',
        title: 'Try it: an extreme storm on the Hotel Vela',
        description: 'Loads the W Barcelona hotel\'s IFC on the Catalan cartographic institute\'s terrain, with its neighbourhood from OpenStreetMap, and runs 120 mm of rain in two hours on your graphics card. The map asks for your consent before it contacts its providers.',
        poster: 'blog/images/flood-simulation-ifc-max-depth.jpg',
        posterAlt: 'Flood simulation around the W Barcelona hotel IFC on the 3D map of Barceloneta',
        launchLabel: 'Run the storm',
        hint: 'The relief and the city load first; then the simulation runs on its own. Drag the timeline to replay the storm, and use Probe to read the water at any point.',
      },

      { type: 'h2', text: 'What it simulates, and what it does not' },
      { type: 'p', text: ['Rain falls on every cell of a regular grid laid over the model and its surroundings. The water then moves by the 2-D shallow-water equations in their local-inertial form', { cite: 'bates2010' }, ', with the flux weighting of de Almeida and colleagues', { cite: 'dealmeida2012' }, '. It runs downhill, pools in low spots, goes round walls, and leaves at the edges if you let it. Roofs hand their rain to the street at their foot, and the ground absorbs according to its soil and cover.'] },
      { type: 'p', text: 'It all runs on your graphics card, with WebGPU or, where that is not available, WebGL2. The GPU result is checked against a CPU reference: the same number of time steps and the same water to six decimal places. The volume is accounted for at every step, and the panel shows the mass balance error, typically around one part in a million.' },
      { type: 'p', text: 'What it does not simulate:' },
      { type: 'ul', items: [
        'The sewer network. Gullies and pipes are not modelled. Roofs can be sent "to the sewer", and courtyards walled in by buildings are taken as drained, but the water on the street stays on the street.',
        'Rivers and the sea. The input is rain. A river rising or a storm surge is not an input yet.',
        'Doors and windows as openings. Buildings are solid; the simulation reports the water standing outside each element, not whether it gets in.',
        'Wind, waves, sediment and floating debris.',
      ] },
      { type: 'callout', variant: 'warning', title: 'Indicative, not certified', text: 'Use it to find where surface water collects and to ask better questions early. A flood risk assessment for a planning application still needs a qualified hydraulic study, with local rainfall statistics and the drainage network.' },

      { type: 'h2', text: 'Set it up, step by step' },
      { type: 'steps', items: [
        { title: 'Open a georeferenced model', body: 'Drag your IFC into the viewer. If it states where it is (IfcMapConversion), the terrain and the streets come from the right place. If it does not, place it on the map by hand first.', detail: 'Federated sets: load the structural model with the architecture. An architecture model without its slabs and basement walls reads its ground floor as raised, and the panel warns that water would run underneath it.', detailLabel: 'Federated models' },
        { title: 'Turn on the map, with relief', body: 'Map → Show on map → Terrain. The first time, the map asks for your consent to contact its providers. In Catalonia the relief is the ICGC\'s 5 m bare-earth model; elsewhere, a global mosaic of about 30 m.', detail: 'A 30 m relief does not see kerbs or a sunken driveway. For a real site, import a DEM (.asc or GeoTIFF) in the panel.', detailLabel: 'Coarse relief' },
        { title: 'Open Flood', body: 'From the tool rail, or Tools → Flood.' },
        { title: 'Choose the grid', body: 'A cell of 1, 2 or 5 m, and a margin around the model (60 m by default).' },
        { title: 'Check the ground and the buildings', body: 'Keep "Use the map\'s relief", "Map buildings are obstacles" and "Neighbourhood from OpenStreetMap" on. Roofs drain to the street, unless you know their downpipes go to the sewer.' },
        { title: 'Pick a storm', body: 'Four presets, from 10 mm in 30 minutes to 120 mm in 2 hours, or Edit to draw your own rainfall, five minutes at a time. Then set how long to keep simulating after the rain stops.' },
        { title: 'Set the surface and the soil', body: 'Roughness, from paved to dense vegetation, and soil, from impervious to sandy. With the OpenStreetMap neighbourhood on, streets, parks and woods set their own values cell by cell.' },
        { title: 'Choose the edges', body: '"Water leaves" lets it flow out of the area. "Closed" keeps every drop in: the worst case, and the right one for a basin with no outlet.' },
        { title: 'Build the grid, then read what it sees', body: 'Build the grid, then check the report before you run anything (next section).' },
        { title: 'Simulate', body: 'A two-hour storm on a grid of 100 × 100 cells takes a few seconds, even on an integrated graphics chip.' },
      ] },
      ui('flood-panel-settings', 'The Flood panel of IFC Viewer Online: cell size and margin, ground sources, map buildings and the OpenStreetMap neighbourhood, roofs, the extreme storm preset, surface, soil and edges', 'The panel, top to bottom, in the order the decisions are made. Here: 1 m cells, the map\'s relief, the OpenStreetMap neighbourhood, the extreme preset and closed edges.', 728, 1744),

      { type: 'h2', text: 'Settings that change the answer' },
      {
        type: 'table',
        headers: ['Setting', 'Options', 'When it matters'],
        rows: [
          ['Cell', '1 · 2 · 5 m', 'The smallest thing that changes the flow must be at least one cell wide: a 15 cm kerb on 5 m cells does not exist. Halving the cell makes four times as many cells.'],
          ['Ground', 'IFC terrain › DEM › map relief › filled › plane', 'The first source that answers wins. The demo plane is a placeholder: results on it say little about the site.'],
          ['Stand the ground on the ground floor', 'On · off', 'When the IFC\'s stated height and the terrain disagree by more than 0.5 m. Off, a model floating 2 m above the ground never gets wet; a buried one is flooded from the start.'],
          ['OpenStreetMap neighbourhood', 'On · off', 'Streets are sealed, parks absorb, walls and the buildings next door block, old rivers are marked. Off, everything outside the model is one uniform surface.'],
          ['Roofs', 'To the street · to the sewer', 'A large roof\'s rain lands at its foot. If its downpipes go to the sewer, the street gets none of it.'],
          ['Storm', 'Presets · drawn by hand', 'Both the total and the peak matter: 60 mm in 45 minutes peaks at 160 mm/h, 120 mm in 2 hours at 120 mm/h.'],
          ['Soil', 'Impervious · compacted · loam · sandy', 'Horton infiltration: fast at first, slowing as the soil wets. Sandy soil takes 125 mm/h at first and 25 mm/h later; compacted soil 25, then 3.'],
          ['Edges', 'Water leaves · closed', 'Closed is the worst case: every drop stays, and the water ponds against the lowest edge.'],
        ],
      },
      figure('flood-grid-from-ifc-and-map', 'Diagram: how a flood grid is built from an IFC and a map. The ground comes from the IFC terrain, a DEM, the map relief, filled holes or a demo plane; the IFC adds walls, canopies, kerbs, courtyards and roofs; OpenStreetMap adds streets, parks, watercourses, walls and neighbouring buildings', 'Three sources, in order of trust, make one grid for the solver.'),

      { type: 'h2', text: 'Before you trust it: what the simulation sees' },
      { type: 'p', text: 'After Build the grid, the panel lists what went into it. Two minutes reading this report saves an afternoon of wrong conclusions.' },
      ui('flood-panel-what-it-sees', 'The "What the simulation sees" report: grid size, the ICGC 5 m relief as ground, obstacle cells, the range of ground heights, drained courtyards, the OpenStreetMap neighbourhood with 93 streets and 3 old or buried watercourses, and a note that the model\'s stated height was 1.8 m above the terrain', 'Torre Poblenou, Barcelona: the ICGC 5 m relief, 93 streets, 3 old or buried watercourses and 36 buildings from OpenStreetMap, and a model stated 1.8 m above the ground around it, so the ground was stood on its ground floor.', 728, 1744),
      { type: 'ul', items: [
        'Ground: "Map relief" or "Imported DEM". "Plane" means the result is about a flat demo surface, not about your site.',
        'Coarse relief: outside Catalonia the map\'s relief is about 30 m data. It does not see streets, so import a DEM for anything detailed.',
        'A height mismatch: the model\'s stated height against the ground around it. Worth fixing in the IFC (IfcMapConversion.OrthogonalHeight).',
        'More canopies than walls: usually an architecture model loaded without its structure.',
        'Courtyards: taken as drained by their own gullies, so they receive no roof rain.',
        'OpenStreetMap unavailable or partial: the neighbourhood came from the map\'s tiles, without watercourses or walls, or was cut short by the element limit. Rebuild asks again.',
      ] },

      { type: 'h2', text: 'Reading the result' },
      { type: 'p', text: 'Three views colour the water: Depth now, Maximum depth (the highest it reached anywhere during the event) and Speed. Flow lines show which way it moves. "Show from" hides water shallower than a threshold, 5 cm by default, so a wet pavement does not read as a flood.' },
      shot('flood-simulation-ifc-max-depth', 'Maximum water depth after 120 mm of rain in two hours around the W Barcelona hotel IFC, on the ICGC terrain with the OpenStreetMap buildings drawn: water ponds in front of the hotel and at the foot of the building next door', 'Hotel Vela, Barcelona, 2 m cells, the extreme storm, water free to leave: 6,772 m² under water at the peak, 55 minutes in. The deepest spots, over a metre, are low points at the foot of the neighbouring building: the places to look at on site.'),
      { type: 'p', text: 'The timeline along the bottom replays the event at 1, 5 or 20 simulated minutes per second, with the rain above and the flooded area below. Probe reads a single point: depth and speed at that instant, the deepest it got, when the water arrived, and a curve of depth over the whole event.' },
      shot('flood-speed-flow-lines', 'Speed of the water at the peak of the storm around the Hotel Vela, from pale blue for still water to red for 2 m/s, with white flow lines showing its direction', 'Speed at the peak, 55 minutes in, with flow lines. Fast water is more dangerous than its depth suggests.'),
      { type: 'related', to: 'flood-hazard-depth-velocity-explained', why: 'How depth and speed together make a hazard to people, with a calculator.' },

      { type: 'h2', text: 'The doors, spaces and equipment the water reaches' },
      { type: 'p', text: 'When the run ends, the viewer checks the model\'s doors, windows, accesses (ramps, stairs, lifts), spaces and equipment against the highest water next to each of them, and lists the ones below it, with the depth and the time the water arrived. The list appears in the flood panel and as a group in the Validation panel. It is not part of the validation result or the Health Score.' },
      ui('flood-affected-elements-validation', 'The Validation panel group "Flood: elements reached", listing the Entrance Hall space below the highest water next to it, with the water outside and its arrival time', 'Poblenou, 1 m cells, the extreme storm with closed edges: one of the nine elements checked lies below the water next to it.', 1520, 306),
      { type: 'p', text: 'Elements whose lowest point is under the ground outside (basements, sunken accesses) are listed apart, as below ground. For them the figure is the water standing outside: whether it gets in depends on openings the simulation does not model. On the Hotel Vela, 309 elements were checked and three were reported, all below ground: two basement zones and the ground-floor lobby.' },
      { type: 'p', text: 'With the OpenStreetMap neighbourhood on, the buildings next door the water reaches are listed too, deepest first and named where OpenStreetMap names them, and outlined on the map from amber to red. A click flies to each.' },

      { type: 'h2', text: 'Export it' },
      { type: 'ul', items: [
        'An image (PNG) with the legend, the instant and the "indicative" note painted in.',
        'A video of the whole event, about 16 seconds, with the same legend in every frame.',
        'GIS files of the whole grid: maximum depth, maximum speed and arrival time, as GeoTIFF, ESRI ASCII grid or a CSV of the wet cells. North up, in the model\'s coordinate system when it is georeferenced (for example EPSG:25831), with buildings as no-data. They open in QGIS or ArcGIS as they are.',
      ] },

      { type: 'h2', text: 'How fast it runs' },
      { type: 'bars', title: 'Simulated time per second of computing', unit: '×', items: [
        { label: '250 × 250 cells (2 m: 500 × 500 m)', value: 1550 },
        { label: '500 × 500 cells (2 m: 1 × 1 km)', value: 665, highlight: true },
        { label: '1000 × 1000 cells (2 m: 2 × 2 km)', value: 210 },
      ], caption: 'WebGPU on an integrated graphics chip (AMD Radeon Vega, Ryzen 5 5600H), Chrome, city test case at 2 m. Deep water slows it down: at 1 m deep, expect about half.' },
      { type: 'p', text: 'The Hotel Vela run above, 130 × 114 cells, ran at about 690 times real time on WebGL2: the two-and-a-half-hour event in about 13 seconds.' },

      { type: 'h2', text: 'What leaves your browser' },
      { type: 'p', text: ['Nothing about the model. The simulation reads what is already loaded and keeps its results on your device. With the map on, its tiles, the relief and the OpenStreetMap neighbourhood come from public providers, which see the area and your IP address, as with any web map. The map asks for your consent before its first request, and Map → Data and permission withdraws it. The relief in these examples is the ICGC\'s', { cite: 'icgc-met' }, ', the neighbourhood is OpenStreetMap\'s.'] },

      {
        type: 'bimo-checklist',
        id: 'flood-simulation-ifc-model-online:before-sharing',
        title: 'Before you share a flood result',
        items: [
          { label: 'The ground is real: the map\'s relief or a DEM, not the demo plane.' },
          { label: 'Any height mismatch between the IFC and the terrain is understood, and fixed in the IFC if the IFC is wrong.' },
          { label: 'The structure is loaded with the architecture, so ground floors read as walls, not canopies.' },
          { label: 'The cell is fine enough for what you are looking at: doors and kerbs need 1 m.' },
          { label: 'The storm is stated by its numbers (total, duration, peak), not as "a 100-year storm".', hint: 'A return period belongs to a place. Only that place\'s rainfall statistics turn one into millimetres.' },
          { label: 'The image or video carries the legend and the "indicative" note. Exports do by default.' },
        ],
      },
      { type: 'p', text: ['Near a river that was buried under the streets? The simulation marks old and piped watercourses from OpenStreetMap and measures the water over them. That is in ', { text: 'buried rivers and flood risk', to: 'buried-rivers-flood-risk-openstreetmap' }, '. To put the model on the map in the first place, see ', { text: 'how to view an IFC on a 3D map', to: 'view-ifc-on-3d-map-online' }, '.'] },
      { type: 'tool', id: 'viewer', why: 'Open your own IFC, turn on the map and run a storm on it.' },
    ],
  },

  // ── Buried rivers ──────────────────────────────────────────────────────────
  {
    ...base,
    ...hero('buried-rivers-flood-risk-openstreetmap'),
    slug: 'buried-rivers-flood-risk-openstreetmap',
    title: 'The River That Is Not There: Buried Watercourses and Flood Risk Around a Building',
    seoTitle: 'Buried Rivers and Flood Risk: Find Lost Watercourses',
    seoDescription: 'Cities were built over streams, and they still flood along them. How to find old and piped watercourses in OpenStreetMap, and see where rain collects over them.',
    excerpt: 'Cities were built over streams. The streams were piped, filled in or diverted; the valleys they cut were not. When a storm overwhelms the drains, water goes back to where the stream ran. OpenStreetMap often still records those courses. How to find them, and see what the rain does over them.',
    heroAlt: 'Flood simulation over Poblenou, Barcelona, seen from above: the Torre Poblenou IFC, neighbouring buildings from OpenStreetMap outlined in amber and red where the water reached them, and a dashed violet line along a buried watercourse',
    category: 'Digital twins',
    categorySlug: 'digital-twins',
    readTimeMin: 9,
    keywords: ['buried river flood risk', 'culverted stream flooding', 'lost rivers city', 'old riverbed flooding', 'disused waterway OpenStreetMap', 'historic watercourses map', 'site flood risk check', 'Barcelona rieras'],
    faqs: [
      { q: 'Why do buried rivers flood?', a: 'Because the valley stays. A stream that was piped or filled in leaves the lowest line through the neighbourhood, and when a storm overwhelms the drains, surface water follows it. A culvert also has a capacity: beyond it, water comes up where the stream used to run.' },
      { q: 'How do I find old watercourses near a site?', a: 'In OpenStreetMap, under lifecycle tags (disused:, abandoned:, historic:, was:, razed:, removed:, demolished:waterway) and as waterways with tunnel=culvert. Then compare with historic maps and with a bare-earth terrain model, which keeps the valley. IFC Viewer Online reads all of these tags and marks the courses during a flood simulation.' },
      { q: 'What if OpenStreetMap does not have the old course?', a: 'Mapping is uneven. A bare-earth elevation model still shows the valley, and the simulation finds it on its own: water collects along it. Old maps and local archives fill in the rest, and adding the course to OpenStreetMap helps the next person who looks.' },
    ],
    references: [
      { id: 'osm-lifecycle', title: 'Lifecycle prefix', source: 'OpenStreetMap Wiki', url: 'https://wiki.openstreetmap.org/wiki/Lifecycle_prefix', note: 'How OpenStreetMap keeps features that no longer exist as they were: disused:, abandoned:, razed: and the rest.' },
      { id: 'osm-culvert', title: 'Tag:tunnel=culvert', source: 'OpenStreetMap Wiki', url: 'https://wiki.openstreetmap.org/wiki/Tag:tunnel%3Dculvert', note: 'How a watercourse carried under a road or a building is mapped.' },
      { id: 'icgc-met', title: 'Elevations: digital terrain models', source: 'Institut Cartogràfic i Geològic de Catalunya', url: 'https://www.icgc.cat/en/Geoinformation-and-Maps/Data-and-products/Elevations', note: 'A bare-earth model: buildings removed, the shape of the ground kept, old valleys included.' },
      { id: 'guide', title: 'Rain-flood simulation on an IFC model: setup guide', to: 'flood-simulation-ifc-model-online' },
    ],
    content: [
      { type: 'p', text: 'La Rambla, Barcelona\'s best-known street, runs along the bed of a seasonal stream that once followed the medieval walls. In Catalan and Spanish a riera or a rambla is exactly that, a stream that is dry most of the year, and the city grew over dozens of them. Streets like Riera de Sant Miquel and Riera Blanca still carry the word in their names. Most were piped under the streets, or filled in, as the city spread over the plain.' },
      { type: 'p', text: 'Barcelona is not unusual. London built over the Fleet and the Tyburn; Seoul covered the Cheonggyecheon with a road and uncovered it again in 2005. What these cities share is that the ground still has the shape the streams gave it. When a storm overwhelms the drains, surface water goes back to where the stream ran.' },
      { type: 'takeaways', items: [
        'A buried river leaves the lowest line through a neighbourhood. In a storm that overwhelms the drains, water follows it.',
        'OpenStreetMap often keeps those courses, under lifecycle prefixes (disused:, abandoned:, was:…) or as long culverts.',
        'IFC Viewer Online\'s flood simulation marks them with a dashed violet line, does not carve them into the ground, and measures the water over them.',
        'Where OpenStreetMap says nothing, a bare-earth terrain model still shows the valley, and the simulation finds it on its own.',
      ] },
      shot('flood-buried-river-neighbours', 'Plan view of a flood simulation around the Torre Poblenou IFC in Barcelona: neighbouring buildings from OpenStreetMap as dark footprints, outlined in amber and red where the water reached them, blue pools of maximum depth, and a dashed violet line along a buried watercourse', 'Torre Poblenou, Barcelona: the extreme storm (120 mm in 2 hours) on the ICGC relief, 2 m cells. The dashed violet line is a watercourse OpenStreetMap records as gone or piped; amber and red outlines are the neighbouring buildings the water reached.'),

      { type: 'h2', text: 'Why a river that is gone still matters' },
      { type: 'p', text: ['A bare-earth elevation model', { cite: 'icgc-met' }, ' strips away the buildings and keeps the shape of the ground. Over a city built on streams, it still draws their beds.'] },
      { type: 'ul', items: [
        'The valley stays. The old beds are the lowest lines across the neighbourhood, and surface water finds them first.',
        'Culverts have a capacity. A stream piped under the streets carries what its pipe can. In a cloudburst the excess comes up, and it comes up along the old course.',
        'Fill settles, and it is often less permeable than the gravel it replaced.',
        'Buildings stand in the old beds: basements, car parks and ground floors at the lowest point of the street.',
      ] },

      { type: 'h2', text: 'How OpenStreetMap records a watercourse that is gone' },
      { type: 'p', text: ['OpenStreetMap maps what exists, but it has a convention for what used to: a lifecycle prefix on the key', { cite: 'osm-lifecycle' }, '. A river that was filled in can stay as a line tagged disused:waterway=river, abandoned:, historic:, was:, razed:, removed: or demolished:waterway. Older edits do the same with waterway=* and disused=yes. A stream carried under a road or a building is mapped as the waterway with tunnel=culvert', { cite: 'osm-culvert' }, ', and in a city that culvert can run for hundreds of metres.'] },
      figure('osm-watercourse-lifecycle-tags', 'Table of OpenStreetMap tags for watercourses and what the flood simulation does with each: open channels cut in by their depth, short culverts cut in too, long culverts and lifecycle-prefixed courses marked as buried courses, walls raised, dykes and embankments raised unless the ground is a bare-earth DEM', 'The tags the flood simulation reads, and what it does with each.'),

      { type: 'h2', text: 'Culvert or vanished: why the simulation treats them differently' },
      { type: 'p', text: 'An open stream is carved into the simulation\'s ground by its depth (tagged, or 0.6 m for a stream, 2 m for a river), so the water runs in its channel. A short culvert under a road is carved too: without it, every road crossing would dam the stream.' },
      { type: 'p', text: 'A long culvert is different. Barcelona maps some of its old watercourses as streams in culverts for hundreds of metres under the city. Carving those into the ground drew canals through city blocks, which was the first thing we measured when we tried it. So a culvert longer than 40 m, and any course that is gone, is a buried course: it is not carved, it is drawn as a dashed violet line, and after the run the panel says how much of it the water covered and how deep.' },
      { type: 'callout', variant: 'info', title: 'Walls and dykes, too', text: 'Walls, city walls, retaining walls and flood walls are raised by their height (tagged, or a default). Dykes and embankments are raised only on ground that cannot show them: a bare-earth model such as the ICGC\'s already has them in it, and raising them again would double them.' },

      { type: 'h2', text: 'An example: Torre Poblenou' },
      { type: 'p', text: 'The Torre Poblenou model stands near Parc del Clot, in the former industrial district of Barcelona. On the ICGC\'s 5 m relief, with 2 m cells and the extreme storm (120 mm in two hours), with the water free to leave the area, OpenStreetMap brought in 93 streets, 17 green or bare areas, 9 walls, 36 buildings and 3 watercourses recorded as gone or piped. None of the three is named in OpenStreetMap.' },
      {
        type: 'table',
        headers: ['After the storm', 'Measured'],
        rows: [
          ['Old or buried watercourses in the area', '3, over 2,308 m²'],
          ['Water over them', '204 m² of the 2,308, up to 0.13 m deep'],
          ['Neighbouring buildings the water reached', '13'],
          ['Deepest water against one', '58 cm, in a recess between the Pavelló Poliesportiu Municipal La Nau del Clot and an industrial building'],
        ],
        caption: 'Measured in the running viewer on 2026-10-10. The model\'s stated height was 1.8 m above the ICGC ground, and the simulation stood its ground on the model\'s ground floor.',
      },
      { type: 'p', text: 'The 58 cm is in a recess about 4 × 6 m that the bare-earth model shows lower than the street around it: a loading bay or a ramp, perhaps. That is the kind of spot a simulation is for. It cannot say what is there, but it says where to look.' },

      { type: 'h2', text: 'Check your own site' },
      { type: 'steps', items: [
        { title: 'Load the model and turn on the map with relief', body: 'A bare-earth model if there is one for your region; it keeps the old valleys.' },
        { title: 'Open Flood, with the OpenStreetMap neighbourhood on', body: 'It is on by default whenever the map is.' },
        { title: 'Build the grid and read the Neighbourhood line', body: 'It counts the old or buried watercourses in the area and names them when OpenStreetMap does.' },
        { title: 'Run a storm with the water free to leave', body: 'Then again with closed edges, as the worst case.' },
        { title: 'Follow the dashed violet lines', body: 'After the run the panel reports how much of the old courses the water covered, and how deep.' },
        { title: 'Open the neighbours the water reached', body: 'Deepest first; a click flies to each.' },
        { title: 'Cross-check with history', body: 'Old maps and aerial photographs, local archives, street names. In Spain, the 1956–57 "American flight" orthophotos are online in the national and regional map viewers.' },
      ] },

      { type: 'h2', text: 'When OpenStreetMap does not know' },
      { type: 'p', text: 'Mapping of lost watercourses is uneven: some cities have them all, many have none. Without them the simulation still works on the ground it is given, and on a bare-earth model the old valley is in that ground: the water finds it, it is just not labelled. If you know a course is there, add it to OpenStreetMap: a line along the old bed tagged disused:waterway=stream (or was:waterway) with its name, or waterway=stream with tunnel=culvert where it is piped. The next person who looks at that street will see it.' },
      { type: 'callout', variant: 'info', text: 'Map data © OpenStreetMap contributors, available under the Open Database License (ODbL). The relief in this example is the ICGC\'s, CC BY 4.0.' },
      { type: 'related', to: 'flood-simulation-ifc-model-online', section: 'Set it up, step by step', why: 'The full setup: grid, ground, buildings, storm, soil and edges.' },
      { type: 'tool', id: 'viewer', why: 'Open your own IFC, put it on the map and see what the old rivers do.' },
    ],
  },

  // ── Hazard ─────────────────────────────────────────────────────────────────
  {
    ...base,
    ...hero('flood-hazard-depth-velocity-explained'),
    slug: 'flood-hazard-depth-velocity-explained',
    title: 'How Deep Is Dangerous? Flood Depth, Speed and the Hazard Rating, Explained',
    seoTitle: 'Flood Hazard Rating: How Depth and Speed Decide Danger',
    seoDescription: 'Why depth alone does not say whether flood water is dangerous. The UK hazard rating explained, with a calculator, and how to apply it to a flood simulation.',
    excerpt: 'A flood map in shades of blue says how deep the water gets. Whether it is dangerous depends just as much on how fast it moves: 20 cm of standing water calls for caution, the same 20 cm moving at 4 m/s is a danger for most people. The hazard rating used in UK flood work, a calculator, and how to apply it to a simulation.',
    heroAlt: 'Water speed at the peak of a storm around the W Barcelona hotel IFC, coloured from pale blue for still water to red for fast, with white flow lines',
    category: 'Tools & comparisons',
    categorySlug: 'tools',
    readTimeMin: 8,
    keywords: ['flood hazard rating', 'flood depth velocity hazard', 'how deep flood water is dangerous', 'FD2320 hazard rating', 'depth velocity product', 'flood hazard to people', 'flood map depth and speed', 'flood water speed danger'],
    faqs: [
      { q: 'How deep does flood water have to be to be dangerous?', a: 'It depends on how fast it moves. The US National Weather Service warns that 15 cm (six inches) of fast-moving water can knock an adult off their feet, and that vehicles, pickups and SUVs included, can be swept away in 45–60 cm (18–24 inches) of flowing water. Standing water becomes dangerous at greater depths, first for children and the elderly.' },
      { q: 'What is the flood hazard rating?', a: 'A number from Defra and Environment Agency research (FD2320, FD2321): HR = d × (v + 0.5) + DF, with the depth d in metres, the speed v in metres per second and a debris factor DF. Below 0.75 the hazard is low (caution); 0.75 to 1.25 is a danger for some; 1.25 to 2.0 a danger for most; above 2.0 a danger for all, the emergency services included.' },
      { q: 'Can I compute it from a flood simulation?', a: 'Yes, from the maximum depth and the maximum speed, conservatively, because the two maxima need not happen at the same moment. IFC Viewer Online exports both as GeoTIFF, and a raster calculator combines them. For one point, its Probe gives depth and speed at the same instant.' },
    ],
    references: [
      { id: 'ea2008', title: 'Supplementary note on flood hazard ratings and thresholds for development planning and control purpose', source: 'Environment Agency and HR Wallingford (Surendran, Gibbs, Wade, Udale-Clarke)', year: '2008', url: 'https://n-somerset.gov.uk/sites/default/files/2024-08/CD%20K10%20Supplementary%20Note%20on%20Flood%20Hazard%20Ratings.pdf', note: 'Reconciles FD2320 and FD2321: the formula, the debris factors and the thresholds used on this page.' },
      { id: 'nws', title: 'Turn Around Don\'t Drown', source: 'US National Weather Service', url: 'https://www.weather.gov/ama/tadd', note: 'The depths of moving water that knock people over and sweep vehicles away.' },
      { id: 'guide', title: 'Rain-flood simulation on an IFC model: setup guide', to: 'flood-simulation-ifc-model-online' },
    ],
    content: [
      { type: 'p', text: 'A flood map in shades of blue answers one question: how deep does the water get? The question people actually ask, standing at the door of a building or at the edge of a flooded street, is a different one: is it dangerous? Depth is half of the answer. The other half is how fast the water moves.' },
      { type: 'takeaways', items: [
        'Depth and speed decide the hazard together: HR = d × (v + 0.5) + DF.',
        '15 cm of fast-moving water can knock an adult off their feet; vehicles are swept away in 45–60 cm of flowing water.',
        'Four classes: caution below 0.75, danger for some up to 1.25, for most up to 2.0, for all above.',
        'A simulation\'s maximum depth and maximum speed give a conservative rating, because the two maxima need not coincide.',
      ] },
      {
        type: 'flood-hazard',
        title: 'Try it: how dangerous is this water?',
        depth: 0.2,
        velocity: 0.5,
        caption: 'The hazard rating of Defra / Environment Agency research FD2320, with its precautionary debris factor, or FD2321\'s by land use. For people outdoors, as a first indication; not for vehicles or structures.',
        labels: {
          depth: 'Depth',
          velocity: 'Speed',
          debris: 'Debris factor',
          debrisModes: { precautionary: 'Precautionary (FD2320)', urban: 'Urban (FD2321)', woodland: 'Woodland (FD2321)', pasture: 'Pasture, arable (FD2321)' },
          rating: 'Hazard rating',
          classes: ['Low hazard: caution', 'Danger for some', 'Danger for most', 'Danger for all'],
          notes: ['Shallow flowing or deep standing water.', 'Children, the elderly and the infirm.', 'The general public.', 'Including the emergency services.'],
          dry: 'No water here: set a depth.',
        },
      },

      { type: 'h2', text: 'Depth is half the answer' },
      { type: 'p', text: ['The US National Weather Service puts it bluntly: six inches, 15 cm, of fast-moving water can knock an adult off their feet, most vehicles begin to lose contact with the road in the same 15 cm, and vehicles, pickups and SUVs included, can be swept away in 45–60 cm of flowing water', { cite: 'nws' }, '. Standing water at those depths is a nuisance. Moving water at those depths kills people every year.'] },
      { type: 'p', text: 'The reason is physical. Water pushes on whatever stands in it with a force that grows with how deep it is and, much faster, with how fast it moves. A shallow sheet running off a slope can be more dangerous than a deep, still pond.' },

      { type: 'h2', text: 'The hazard rating' },
      { type: 'p', text: ['UK flood risk work uses a single number for the hazard to people, from Defra and Environment Agency research (FD2320 and FD2321), as clarified in their 2008 supplementary note', { cite: 'ea2008' }, ':'] },
      { type: 'code', lang: 'text', text: 'HR = d × (v + 0.5) + DF\n\nd   depth of flooding (m)\nv   velocity of the water (m/s)\nDF  debris factor (0, 0.5 or 1)' },
      { type: 'p', text: 'The 0.5 added to the speed is what makes still water count too: even at v = 0, deep water is a hazard. The debris factor accounts for what the water carries.' },
      {
        type: 'table',
        headers: ['Hazard rating', 'Class', 'Dangerous for'],
        rows: [
          ['Below 0.75', 'Low hazard: caution', 'Shallow flowing or deep standing water'],
          ['0.75 to 1.25', 'Danger for some', 'Children, the elderly and the infirm'],
          ['1.25 to 2.0', 'Danger for most', 'The general public'],
          ['Above 2.0', 'Danger for all', 'Including the emergency services'],
        ],
        caption: 'The FD2320 thresholds, recommended for development planning. FD2321 puts "danger for all" at 2.5.',
      },
      figure('flood-hazard-rating-chart', 'Chart of flood hazard to people by depth (0 to 2.5 m) and speed (0 to 4 m/s), coloured green for low hazard, yellow for danger for some, orange for danger for most and red for danger for all, with three examples marked: 15 cm fast, 20 cm slow and 50 cm still', 'The four zones of the FD2320 hazard rating with its precautionary debris factor. 15 cm moving at 2 m/s is already a danger for some.'),

      { type: 'h2', text: 'The debris factor' },
      { type: 'p', text: 'FD2320, the guidance for development planning, keeps it simple and precautionary: DF = 0.5 up to 0.25 m deep and 1 deeper, whatever the land use. FD2321 takes the land use into account:' },
      {
        type: 'table',
        headers: ['Depth', 'Pasture, arable', 'Woodland', 'Urban'],
        rows: [
          ['0 to 0.25 m', '0', '0', '0'],
          ['0.25 to 0.75 m', '0', '0.5', '1'],
          ['Deeper than 0.75 m, or faster than 2 m/s', '0.5', '1', '1'],
        ],
        caption: 'Debris factors by depth, speed and land use (FD2321, Table 3.1).',
      },
      { type: 'p', text: 'In a town, both give the same answer once the water is deeper than 25 cm. The precautionary version is the one to use when in doubt, and the one the 2008 note recommends for planning.' },

      { type: 'h2', text: 'Reading a flood simulation with it' },
      { type: 'p', text: ['A simulation gives the depth and the speed in every cell, at every moment. ', { text: 'IFC Viewer Online\'s flood simulation', to: 'flood-simulation-ifc-model-online' }, ' exports two of its maps as GeoTIFF: the maximum depth and the maximum speed over the event. Combining them gives a hazard rating for each cell, but a conservative one, because the deepest moment and the fastest moment of a cell need not be the same moment.'] },
      { type: 'p', text: 'With both files loaded in QGIS as max_depth and max_speed, the raster calculator does it in one expression (FD2320 debris factor, dry cells left at 0):' },
      { type: 'code', lang: 'text', text: '("max_depth@1" * ("max_speed@1" + 0.5)\n  + ("max_depth@1" <= 0.25) * 0.5\n  + ("max_depth@1" > 0.25) * 1) * ("max_depth@1" > 0)' },
      { type: 'p', text: 'Classify the result at 0.75, 1.25 and 2.0 and you have a hazard map. For a single point, such as an entrance or a crossing, use the Probe instead: the timeline replays the event, and the probe gives depth and speed at the same instant.' },

      { type: 'h2', text: 'What the numbers mean around a building' },
      { type: 'ul', items: [
        '5 cm: the simulation\'s default display threshold. A film of water over paving.',
        '10 to 20 cm: over a kerb, up to a door threshold. Enough to get into a ground floor without a step.',
        '30 cm and more, standing: a danger for some by the precautionary rating, whatever the speed.',
        '50 cm, standing: a danger for most.',
        '20 cm moving at 4 m/s: a danger for most, although it would only be "caution" if it stood still.',
      ] },
      { type: 'p', text: 'Next to a building, the question is also whether the water reaches its openings. The simulation compares the highest water next to each door, access, space and piece of equipment with its lowest point, and lists the ones below it.' },

      { type: 'h2', text: 'Limits' },
      { type: 'ul', items: [
        'The rating is for people outdoors, as a first indication. FD2321 goes on to weigh how vulnerable the people and the area are; the rating alone does not.',
        'Vehicles and structures have their own, different thresholds.',
        'It is UK research. Other countries use other curves on the same two axes; Australia\'s national guidance, for example, has six classes, H1 to H6.',
        'A rating from maximum depth and maximum speed overestimates where the two peaks happen at different times.',
      ] },
      {
        type: 'bimo-quiz',
        title: 'Check yourself',
        questions: [
          { q: '20 cm of water moving at 4 m/s, with the precautionary debris factor: which class?', options: ['Low hazard: caution', 'Danger for some', 'Danger for most', 'Danger for all'], answer: 2, why: 'HR = 0.2 × (4 + 0.5) + 0.5 = 1.4, between 1.25 and 2.0: a danger for most.' },
          { q: 'Why is a rating from the maximum depth and the maximum speed conservative?', options: ['The formula overestimates on purpose', 'The two maxima can happen at different moments', 'The debris factor is always 1'], answer: 1, why: 'Each map keeps a cell\'s worst value over the whole event. Combining two worst values that came at different moments gives a rating higher than any real instant.' },
          { q: 'According to the US National Weather Service, how much fast-moving water can knock an adult off their feet?', options: ['5 cm', '15 cm', '45 cm', '1 m'], answer: 1, why: 'Six inches, about 15 cm, of fast-moving water.' },
        ],
      },
      { type: 'related', to: 'flood-simulation-ifc-model-online', section: 'Reading the result', why: 'The depth, speed and flow-line views, the timeline and the probe.' },
      { type: 'tool', id: 'viewer', why: 'Run a storm on your own IFC and read depth and speed at any point.' },
    ],
  },
]
