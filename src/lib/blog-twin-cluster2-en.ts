import type { BlogPost } from './blog-posts'

// Second wave of the digital-twin cluster (after blog-twin-cluster-en.ts):
// the pieces the research asked for that bring something of our own — a
// maturity ladder shown on live models, the three formats a city twin mixes,
// and a test of which city feeds a web page can actually read (our data).
// Each owns a diagram drawn in every blog language (build-twin-figures.mjs).

const base = {
  date: '2026-10-16',
  dateModified: '2026-10-16',
  author: 'IFC Viewer Team',
  category: 'Digital twins',
  categorySlug: 'digital-twins',
}

const OSM = 'IFC Viewer Online · map data © OpenStreetMap contributors (ODbL)'

const hero = (slug: string) => ({
  heroImage: `blog/images/${slug}-1600x900.jpg`,
  heroImageVariants: [
    { src: `blog/images/${slug}-1600x900.jpg`, width: 1600, height: 900 },
    { src: `blog/images/${slug}-1200x900.jpg`, width: 1200, height: 900 },
    { src: `blog/images/${slug}-1200x1200.jpg`, width: 1200, height: 1200 },
  ],
  heroCredit: OSM,
})

/** A diagram drawn in each blog language (blog-image-lang.ts). */
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
  localized: true,
})

const SURVEY_CSV = '/blog/data/city-open-data-cors-2026-10.csv'

export const TWIN_CLUSTER2_POSTS_EN: BlogPost[] = [
  // ── Maturity levels ─────────────────────────────────────────────────────────
  {
    ...base,
    ...hero('digital-twin-maturity-levels'),
    slug: 'digital-twin-maturity-levels',
    title: 'Digital Twin Maturity Levels, Shown on Live Examples',
    seoTitle: 'Digital Twin Maturity Levels Explained With Examples',
    seoDescription: 'The five digital twin maturity levels, from descriptive to autonomous, each shown on a live model or marked where it does not apply. And which one you need.',
    excerpt: 'Descriptive, informative, predictive, comprehensive, autonomous: the five levels most maturity models use. Each one shown on a real, open example, and where an example does not reach a level, it says so. Plus how to tell which level a project actually needs.',
    heroAlt: 'The Plaça de Catalunya digital twin in IFC Viewer Online with its guided tour open, explaining what the live data on the IFC models means',
    readTimeMin: 7,
    keywords: ['digital twin maturity levels', 'digital twin levels', 'descriptive informative predictive digital twin', 'digital twin maturity model', 'predictive digital twin', 'autonomous digital twin', 'digital twin examples'],
    faqs: [
      { q: 'What are the levels of a digital twin?', a: 'Most maturity models use five: descriptive (a live, editable model of the asset), informative (operational and sensor data on it), predictive (insights and forecasts from that data), comprehensive (what-if scenarios on the model) and autonomous (it learns and acts on its own). The ladder comes from Verdantix and is the one Autodesk uses.' },
      { q: 'What is the difference between a descriptive and an informative digital twin?', a: 'A descriptive twin is the model of the asset in its place, kept up to date as a model. An informative twin adds live operational or sensor data to it, so the model also shows what state the asset is in now.' },
      { q: 'Does every project need a predictive or autonomous twin?', a: 'No. Each level costs more data, more integration and more upkeep. Many useful twins stop at informative and add what-if studies when a decision needs them; autonomy only makes sense where actions are safe to automate and someone remains accountable for them.' },
    ],
    references: [
      { id: 'tandem', title: 'Getting Started With Autodesk Tandem', source: 'Autodesk', year: '2021', url: 'https://intandem.autodesk.com/app/uploads/2021/09/Getting-Started-With-Autodesk-Tandem-eBook.pdf', note: 'The five-level maturity model, developed by Verdantix, as Autodesk presents it.' },
    ],
    content: [
      { type: 'p', text: 'Ask what a digital twin is and you will get answers from "a 3D model" to "a system that runs the building by itself". Maturity levels sort that out: they say what a twin does, step by step, so that a project can say which step it needs and a vendor can say which one it delivers.' },
      { type: 'p', text: ['The ladder most people use has five levels, from Verdantix, and it is the one Autodesk adopts', { cite: 'tandem' }, '. Below, each level is shown on a model you can open, and where the examples here do not reach a level, that is said plainly rather than dressed up.'] },
      { type: 'takeaways', items: [
        'Descriptive: the model of the asset, in its place. Informative: with live data on it. Predictive: forecasts from that data. Comprehensive: what-if scenarios. Autonomous: it acts on its own.',
        'The open examples here reach levels 1, 2 and 4: models on the real city, live open data on them, and sun and flood simulations.',
        'They do not forecast (level 3) and do not act (level 5). Saying so is part of using the ladder honestly.',
        'Pick the level a decision needs, not the highest one: every step costs data, integration and upkeep.',
      ] },
      figure('digital-twin-maturity-levels', 'Staircase diagram of the five digital twin maturity levels — descriptive, informative, predictive, comprehensive and autonomous — each with a real capture from IFC Viewer Online where an example exists, and marked "not here" where it does not', 'The five levels, with the example that shows each one, or a plain "not here".'),

      { type: 'h2', text: 'Level 1: descriptive' },
      { type: 'p', text: ['A live, editable model of the asset, placed where it really is. In practice, a BIM model with its real-world position and its surroundings: the eight IFC models of Plaça de Catalunya on Barcelona\'s terrain, with the city around them. It is what most projects have at handover, and what ', { text: 'BIM vs digital twin', to: 'bim-vs-digital-twin' }, ' calls step 2.'] },
      { type: 'h2', text: 'Level 2: informative' },
      { type: 'p', text: ['The same model with operational data on it: sensors, feeds, meters. The Barcelona square colours its bike dock posts from the Bicing feed, the Helsinki terminal its bays from live bus positions, the Tokyo entrance its signs from the line\'s status. This is the level where a twin starts to answer "what is happening now?", and the one the live examples in ', { text: 'what an urban digital twin is', to: 'urban-digital-twin-live-examples' }, ' are built around.'] },
      { type: 'h2', text: 'Level 3: predictive' },
      { type: 'p', text: 'Insights and forecasts drawn from the data collected: a dock that will run out of bikes in twenty minutes, a pump that will fail next month. The examples here record readings and draw them as trends, but they do not forecast. Prediction needs history, a model of the asset\'s behaviour and someone to validate it, and a public demo has none of those.' },
      { type: 'h2', text: 'Level 4: comprehensive' },
      { type: 'p', text: ['What-if scenarios run on the model: what happens to this square at 6 pm in December, or in a storm of 40 mm an hour. Two of those run in the browser here: ', { text: 'sun and shadow studies', to: 'ifc-sun-shadow-study-online' }, ' and a ', { text: 'rain-flood simulation on an IFC model', to: 'flood-simulation-ifc-model-online' }, '. Scenarios do not need the twin to be live; they need the model to be right.'] },
      { type: 'h2', text: 'Level 5: autonomous' },
      { type: 'p', text: 'A twin that learns and acts on its own: re-balancing bikes, changing a signal plan, switching a pump. None of the examples here does, on purpose. Acting on the real world needs authentication, an audit trail, safety limits and a person accountable for every automated decision, and a page anyone can open must not switch anything.' },

      { type: 'h2', text: 'Which level does a project need?' },
      {
        type: 'table',
        headers: ['If the question is…', 'You need', 'What it takes'],
        rows: [
          ['Where is everything, and what is it?', 'Level 1', 'A clean, georeferenced model and its asset data'],
          ['What state is it in now?', 'Level 2', 'Feeds or sensors, bindings to the model, freshness rules'],
          ['When will it need attention?', 'Level 3', 'Recorded history, a behaviour model, validation'],
          ['What would happen if…?', 'Level 4', 'A simulation that runs on the model, with its limits stated'],
          ['Can it act for us?', 'Level 5', 'Control interfaces, safety limits, accountability'],
        ],
      },
      { type: 'p', text: 'Levels are not a race. A facility team that needs to find assets and see their state is well served at level 2, and a planning team at level 4 with no live data at all. Climbing a level is worth it when a decision depends on it.' },
      { type: 'related', to: 'urban-digital-twin-live-examples', why: 'The five layers of a city twin, with the live examples to open.' },
      { type: 'tool', id: 'viewer', why: 'Open your own IFC and put it on the map: level 1, in a minute.' },
    ],
  },

  // ── CityGML vs IFC vs 3D Tiles ──────────────────────────────────────────────
  {
    ...base,
    ...hero('citygml-vs-ifc-vs-3d-tiles'),
    slug: 'citygml-vs-ifc-vs-3d-tiles',
    title: 'CityGML vs IFC vs 3D Tiles: Which Format for a Digital Twin?',
    seoTitle: 'CityGML vs IFC vs 3D Tiles for Digital Twins',
    seoDescription: 'CityGML models the city, IFC the asset, 3D Tiles streams either to a browser. What each format is for, how they differ, and how a city twin combines them.',
    excerpt: 'Three formats keep coming up when a digital twin reaches city scale, and they are often compared as if they competed. They do different jobs: CityGML describes the city as objects, IFC describes one asset element by element, and 3D Tiles delivers either to a browser in pieces.',
    heroAlt: 'IFC models of Helsinki Central Station and its bus terminal among the city blocks of the 3D map in IFC Viewer Online',
    readTimeMin: 8,
    keywords: ['CityGML vs IFC', 'CityGML vs 3D Tiles', 'IFC vs 3D Tiles', 'digital twin file format', 'CityJSON', '3D city model format', 'BIM GIS integration format'],
    faqs: [
      { q: 'What is the difference between CityGML and IFC?', a: 'CityGML describes a city as objects — buildings, roads, terrain, vegetation — at levels of detail from a footprint to a façade. IFC describes one built asset element by element, with types, properties and relationships. CityGML is about the city; IFC is about what is inside one project.' },
      { q: 'Is 3D Tiles a replacement for CityGML or IFC?', a: 'No. 3D Tiles is a delivery format: it cuts 3D content into tiles at several levels of detail so a browser can stream it. A CityGML city or an IFC model can be converted to 3D Tiles to be shown on the web, but the tiles carry far less meaning than either source.' },
      { q: 'Which format should a city digital twin use?', a: 'Usually all three, each for its job: CityGML or CityJSON for the city model, IFC for the assets that carry live data or need maintenance, and 3D Tiles to stream large models or meshes to a browser.' },
    ],
    references: [
      { id: 'citygml', title: 'OGC City Geography Markup Language (CityGML) 3.0 Conceptual Model', source: 'Open Geospatial Consortium', url: 'https://docs.ogc.org/is/20-010/20-010.html', note: 'The city model standard and its levels of detail.' },
      { id: 'cityjson', title: 'CityJSON', source: 'CityJSON / OGC', url: 'https://www.cityjson.org/', note: 'A JSON encoding of the CityGML data model, easier to use on the web.' },
      { id: 'ifc', title: 'IFC 4.3 (ISO 16739-1:2024)', source: 'buildingSMART International', url: 'https://ifc43-docs.standards.buildingsmart.org/', note: 'The open schema for building and infrastructure models.' },
      { id: '3dtiles', title: '3D Tiles', source: 'Open Geospatial Consortium', url: 'https://www.ogc.org/standards/3dtiles/', note: 'The OGC community standard for streaming massive 3D content.' },
    ],
    content: [
      { type: 'p', text: 'When a digital twin grows from one building to a district, three formats come up in every conversation: CityGML, IFC and 3D Tiles. They are often put side by side as if one had to win. They do not compete: each answers a different question, and a city twin usually needs all three.' },
      { type: 'takeaways', items: [
        'CityGML (and its JSON encoding, CityJSON) describes the city as objects: buildings, roads, terrain, vegetation, at levels of detail.',
        'IFC describes one asset element by element, with the types, properties and relationships that operation and maintenance need.',
        '3D Tiles is for delivery: it cuts any 3D content into tiles a browser can stream, coarse to fine.',
        'Converting between them always loses something. Keep each source in its own format and convert only to deliver.',
      ] },
      figure('citygml-ifc-3d-tiles-comparison', 'Comparison grid of CityGML, IFC and 3D Tiles: what each describes, typical scale, semantics, geometry, real-world position, delivery and standard', 'Three jobs, not three rivals: the city, the asset, and getting either to a browser.'),

      { type: 'h2', text: 'CityGML: the city as objects' },
      { type: 'p', text: ['CityGML is the Open Geospatial Consortium\'s standard for 3D city models', { cite: 'citygml' }, '. It describes a city as typed objects — buildings, bridges, roads, water, vegetation, terrain — each with attributes and with geometry at a level of detail, from a footprint (LOD0) to a façade with openings (LOD3). Many national and city datasets publish in it, and CityJSON', { cite: 'cityjson' }, ' encodes the same data model as JSON, which is far easier to handle in a browser.'] },
      { type: 'p', text: ['Its strength is breadth: a whole district, consistently classified. Its limit is depth: a CityGML building does not know about the pump in its basement. How its levels of detail compare with BIM\'s is in ', { text: 'LOD in BIM vs CityGML', to: 'lod-bim-vs-citygml-level-of-detail' }, '.'] },
      { type: 'h2', text: 'IFC: the asset, element by element' },
      { type: 'p', text: ['IFC is buildingSMART\'s open schema for building and infrastructure models, published as ISO 16739-1', { cite: 'ifc' }, '. Every wall, door, pump and dock post is an element with a type, properties, quantities and relationships to the elements around it. It is what a twin needs for the assets it tracks: identity to bind live data to, and the data maintenance relies on. Placing an IFC model on the map needs its georeference, an IfcMapConversion, covered in ', { text: 'IFC coordinates and georeferencing', to: 'ifc-coordinates-georeferencing' }, '.'] },
      { type: 'h2', text: '3D Tiles: built to stream' },
      { type: 'p', text: ['3D Tiles, an OGC community standard', { cite: '3dtiles' }, ', solves a different problem: getting huge 3D content into a browser. A tileset is a tree of tiles, each with its own level of detail; the viewer loads the coarse ones first and refines where the camera looks. Photogrammetry meshes, point clouds and whole city models are delivered this way. What the tiles mean is limited to the metadata they carry.'] },

      { type: 'h2', text: 'Side by side' },
      {
        type: 'table',
        headers: ['', 'CityGML / CityJSON', 'IFC', '3D Tiles'],
        rows: [
          ['Describes', 'City objects', 'One asset, element by element', 'Any 3D content, as tiles'],
          ['Typical scale', 'District to country', 'Building, bridge, station', 'Up to the planet'],
          ['Meaning', 'Classes and attributes per object', 'Types, properties, relationships, systems', 'Metadata per tile or feature'],
          ['Geometry', 'Surfaces at LOD0–3', 'Solids per element', 'Meshes (glTF), point clouds'],
          ['Real-world position', 'Built in', 'Optional (IfcMapConversion)', 'Built in'],
          ['Best at', 'Consistent city-wide data', 'Asset identity and data', 'Delivering big models to a browser'],
        ],
      },

      { type: 'h2', text: 'How a city twin combines them' },
      { type: 'p', text: 'The common pattern: the city model in CityGML or CityJSON for context and city-wide analysis; IFC for the assets that carry live data or need maintenance; and 3D Tiles to stream whichever of the two is too big to send in one piece. Converting IFC to CityGML keeps the outside and drops most of the meaning; converting either to 3D Tiles keeps the look and little else. So keep each source in its own format, and convert only to deliver.' },
      { type: 'p', text: ['In the live examples on this blog, the context is OpenStreetMap buildings drawn as extruded blocks — roughly LOD1 — and the assets are IFC models, because those are what the live data binds to. This viewer reads IFC; it does not read CityGML or external 3D Tiles today. The examples, and what they show: ', { text: 'what an urban digital twin is', to: 'urban-digital-twin-live-examples' }, '.'] },
      { type: 'related', to: 'bim-vs-digital-twin', why: 'What a twin needs from the IFC model, step by step.' },
      { type: 'tool', id: 'viewer', why: 'Open an IFC and place it among the city blocks of the 3D map.' },
    ],
  },

  // ── Which city feeds can a web page read? ───────────────────────────────────
  {
    ...base,
    ...hero('city-open-data-browser-test'),
    slug: 'city-open-data-browser-test',
    title: 'Which City Open Data Can a Web Page Read? 28 Feeds in 20 Cities, Tested',
    seoTitle: 'City Open Data for Digital Twins: 28 Feeds Tested',
    seoDescription: 'We requested 28 public city feeds — bike share, transit, city portals — as a browser would. 25 can be read from a web page; three need a server. The full list.',
    excerpt: 'A digital twin that runs in the browser can only use data a web page is allowed to read. We requested 28 public feeds in 20 cities exactly as a browser would and recorded which ones answer. 25 do. Here is the list, what blocks the other three, and the data to download.',
    heroAlt: 'Barcelona from above in IFC Viewer Online with its open data on the map: Bicing stations, charging points, traffic on the streets and air quality, around the IFC models of Plaça de Catalunya',
    readTimeMin: 7,
    keywords: ['city open data API', 'open data digital twin', 'CORS open data', 'GBFS feeds', 'real-time transit open data', 'digital twin data sources', 'open data in the browser'],
    faqs: [
      { q: 'Why does it matter whether a browser can read a feed?', a: 'A web page can only read data from another site when that site answers with CORS headers that allow it. Without them the data is still public, but only a server can fetch it — so a twin that should run in the browser alone cannot use it.' },
      { q: 'Which kind of city data is most often readable from a browser?', a: 'Bike share. Nine of the ten GBFS feeds tested answer with CORS. City open-data portals built on Opendatasoft, Socrata or CKAN also tend to allow it. Real-time transit is the most mixed.' },
      { q: 'What can you do when a feed has no CORS?', a: 'Look for another way the publisher offers the same data (HSL offers its bus positions over MQTT as well), ask the publisher to add the header, or put a small server in between — which then fetches, and sees, every request on your visitors\' behalf.' },
    ],
    references: [
      { id: 'csv', title: 'The results, as CSV', source: 'IFC Viewer Online', url: `https://www.ifcvieweronline.eu${SURVEY_CSV}`, note: 'Every endpoint, its status, its Access-Control-Allow-Origin header and its content type, as tested on 15 October 2026.' },
      { id: 'cors', title: 'Cross-Origin Resource Sharing (CORS)', source: 'MDN Web Docs', url: 'https://developer.mozilla.org/en-US/docs/Web/HTTP/CORS', note: 'How browsers decide whether a page may read a response from another site.' },
      { id: 'gbfs', title: 'General Bikeshare Feed Specification (GBFS)', source: 'MobilityData', url: 'https://gbfs.org/', note: 'The open standard most bike-share systems publish in.' },
    ],
    content: [
      { type: 'p', text: ['A digital twin that runs in the visitor\'s browser, with no server of its own, can only use data that a web page is allowed to read. That permission is not about licences or keys: it is a response header, CORS', { cite: 'cors' }, ', that the publisher\'s server sends or does not send. Without it, the data is public and still out of reach of a page.'] },
      { type: 'p', text: 'So we tested. Twenty-eight public endpoints in twenty cities — bike share, real-time transit, city open-data portals, weather, a 3D city model — each requested once, exactly as a browser would, with the result recorded.' },
      { type: 'takeaways', items: [
        '25 of the 28 endpoints can be read straight from a web page.',
        'Bike share is the most open: 9 of the 10 GBFS feeds tested answer with CORS.',
        'The three blocked: Paris Vélib\', HSL\'s GTFS-Realtime feed in Helsinki and the Wiener Linien real-time monitor in Vienna.',
        'Blocked is not the end: HSL publishes the same bus positions over MQTT, which a browser can read.',
      ] },
      figure('city-open-data-browser-scorecard', 'Scorecard of 20 cities and three kinds of open data — bike share, transit and city data — showing which public feeds a web page can read (green), which it cannot (red) and which were not tested', 'The result per city: green where a web page can read the feed, red where only a server can.'),

      { type: 'h2', text: 'How we tested' },
      { type: 'p', text: ['Each endpoint got one GET request carrying an Origin header, as a page on this site would send, on 15 October 2026. "Readable" means the response came back with an Access-Control-Allow-Origin header that lets that page read it. The full list, with status codes and content types, is ', { text: 'available as CSV', href: `https://www.ifcvieweronline.eu${SURVEY_CSV}` }, { cite: 'csv' }, '.'] },
      { type: 'callout', variant: 'info', title: 'What this does not measure', text: 'One request, one moment, one place. A publisher can change its headers, rate-limit, or ask for a key on other endpoints of the same service. CORS is the first gate, not the only one: terms of use and attribution still apply to every feed here.' },

      { type: 'h2', text: 'Bike share: the open standard works' },
      { type: 'p', text: ['Nine of the ten bike-share systems tested publish GBFS', { cite: 'gbfs' }, ' with CORS: Barcelona, Berlin, Oslo, New York, Chicago, San Francisco, Toronto, Montreal and Mexico City. Paris Vélib\' publishes the same standard without the header. A shared format with permissive defaults is what makes the difference: once one city works, the next one does too.'] },
      { type: 'h2', text: 'Transit: the mixed picture' },
      { type: 'p', text: ['London\'s TfL API, Boston\'s MBTA, New York\'s subway GTFS-Realtime and both of Tokyo\'s ODPT feeds answer with CORS. HSL\'s GTFS-Realtime and Vienna\'s real-time monitor do not. HSL shows the way around it: the same vehicle positions are published over MQTT on a WebSocket, which is not subject to CORS — the Helsinki twin uses exactly that, as ', { text: 'the bus terminal twin over MQTT', to: 'bus-terminal-digital-twin-mqtt' }, ' explains.'] },
      { type: 'h2', text: 'City portals: mostly open' },
      { type: 'p', text: 'The portals built on common platforms — Opendatasoft in Paris and Melbourne, Socrata in New York, CKAN in Barcelona and Zurich — answered with CORS, as did Spain\'s national catalogue, Madrid\'s traffic sensors, Finland\'s weather service, Singapore\'s real-time API and Helsinki\'s 3D city model.' },

      { type: 'h2', text: 'All 28 endpoints' },
      {
        type: 'table',
        headers: ['City', 'Source', 'Kind', 'From a web page'],
        rows: [
          ['Barcelona', 'Bicing (GBFS 3.0)', 'Bike share', 'Readable'],
          ['Barcelona', 'Open Data BCN resource (Endolla)', 'City data', 'Readable'],
          ['Barcelona', 'Open Data BCN CKAN API', 'City data', 'Readable'],
          ['Madrid', 'Informo traffic sensors (XML)', 'City data', 'Readable'],
          ['Spain', 'datos.gob.es API', 'City data', 'Readable'],
          ['Paris', 'Vélib\' Métropole (GBFS)', 'Bike share', 'Blocked'],
          ['Paris', 'opendata.paris.fr (Opendatasoft)', 'City data', 'Readable'],
          ['London', 'TfL Unified API (BikePoint)', 'Transit', 'Readable'],
          ['Oslo', 'Oslo Bysykkel (GBFS)', 'Bike share', 'Readable'],
          ['Helsinki', 'HSL GTFS-Realtime', 'Transit', 'Blocked'],
          ['Helsinki', 'FMI open data (WFS)', 'City data', 'Readable'],
          ['Helsinki', 'Helsinki 3D (3D Tiles)', 'City data', 'Readable'],
          ['Vienna', 'Wiener Linien real-time monitor', 'Transit', 'Blocked'],
          ['Berlin', 'nextbike Berlin (GBFS)', 'Bike share', 'Readable'],
          ['Zurich', 'Open Data Zürich (CKAN)', 'City data', 'Readable'],
          ['Tokyo', 'ODPT public API (Toei trains)', 'Transit', 'Readable'],
          ['Tokyo', 'ODPT Toei bus (GTFS-Realtime)', 'Transit', 'Readable'],
          ['Singapore', 'data.gov.sg real-time API', 'City data', 'Readable'],
          ['New York', 'Citi Bike (GBFS)', 'Bike share', 'Readable'],
          ['New York', 'NYC Open Data (Socrata)', 'City data', 'Readable'],
          ['New York', 'MTA subway (GTFS-Realtime)', 'Transit', 'Readable'],
          ['Boston', 'MBTA V3 API', 'Transit', 'Readable'],
          ['Chicago', 'Divvy (GBFS)', 'Bike share', 'Readable'],
          ['San Francisco', 'Bay Wheels (GBFS)', 'Bike share', 'Readable'],
          ['Toronto', 'Bike Share Toronto (GBFS)', 'Bike share', 'Readable'],
          ['Montreal', 'BIXI (GBFS)', 'Bike share', 'Readable'],
          ['Mexico City', 'Ecobici (GBFS)', 'Bike share', 'Readable'],
          ['Melbourne', 'City of Melbourne (Opendatasoft)', 'City data', 'Readable'],
        ],
        caption: 'Tested 15 October 2026. The CSV adds each response\'s status, CORS header and content type.',
      },

      { type: 'h2', text: 'When a feed is blocked' },
      { type: 'ul', items: [
        'Look for another channel. Publishers often offer the same data more than one way; HSL\'s MQTT stream is the example here.',
        'Ask the publisher. Adding the header is a one-line change on their side, and open-data teams often do it when asked.',
        'Put a server in between, knowing what that means: it fetches every request for your visitors, sees them all, and becomes something you have to run.',
        'Never put an API key in a public page to get around it: anything a page sends, a visitor can read.',
      ] },
      { type: 'p', text: ['How the live examples on this blog read their feeds, and where each one comes from, is in ', { text: 'what an urban digital twin is', to: 'urban-digital-twin-live-examples' }, ' and ', { text: 'the Barcelona open-data twin', to: 'barcelona-digital-twin-open-data' }, '.'] },
      { type: 'tool', id: 'embed', why: 'Put a live twin built from readable feeds on your own site.' },
    ],
  },
]
