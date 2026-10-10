import type { BlogPost } from './blog-posts'

// Live open-data digital twins (docs/DEMOS.md): Barcelona, Helsinki and Tokyo.
// Each post carries its scene as a live tool demo (ToolDemo.tsx, twin-*), and
// every figure in it was measured in the running app on 2026-10-10 — see
// docs/TWIN_VALIDATION_REPORT.md. The IFC models are illustrative
// reconstructions; the data is real, and the posts say both.

const base = {
  date: '2026-10-10',
  dateModified: '2026-10-10',
  author: 'IFC Viewer Team',
  category: 'Digital twins',
  categorySlug: 'digital-twins',
}

const hero = (slug: string) => ({
  heroImage: `blog/images/${slug}-1600x900.jpg`,
  heroImageVariants: [
    { src: `blog/images/${slug}-1600x900.jpg`, width: 1600, height: 900 },
    { src: `blog/images/${slug}-1200x900.jpg`, width: 1200, height: 900 },
    { src: `blog/images/${slug}-1200x1200.jpg`, width: 1200, height: 1200 },
  ],
  heroCredit: 'IFC Viewer Online · map data © OpenStreetMap contributors (ODbL)',
})

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
  credit: 'IFC Viewer Online · map data © OpenStreetMap contributors (ODbL)',
})

export const TWIN_POSTS_EN: BlogPost[] = [
  // ── Barcelona ──────────────────────────────────────────────────────────────
  {
    ...base,
    ...hero('barcelona-digital-twin-open-data'),
    slug: 'barcelona-digital-twin-open-data',
    title: 'A Live Digital Twin of Plaça de Catalunya, Built From Open Data in the Browser',
    seoTitle: 'Barcelona Digital Twin From Open Data, in the Browser',
    seoDescription: 'Eight IFC models of Plaça de Catalunya on a 3D map, with live Bicing, EV charging, traffic and air quality from Barcelona open data. No server in between.',
    excerpt: "Eight IFC models of Plaça de Catalunya on the real terrain, with Bicing docks, an EV charger, street traffic and air quality updating from Barcelona's open data. It all runs in the visitor's browser: no IoT platform, no GIS server, no backend of ours.",
    heroAlt: 'Plaça de Catalunya in IFC Viewer Online: the twin fountains and other IFC models on the 3D map of Barcelona, with a live Bicing count floating over the docks',
    readTimeMin: 9,
    keywords: ['digital twin open data', 'Barcelona digital twin', 'city digital twin in the browser', 'IFC live data', 'Bicing GBFS', 'BIM GIS live data', 'open data digital twin example'],
    faqs: [
      { q: 'Can you build a digital twin from open data without a backend?', a: "Yes, when the providers accept requests from a browser (CORS). This scene reads Bicing (GBFS), Endolla (GELFS) and Open Data BCN's traffic and air quality directly from the visitor's browser and colours IFC elements with the results. A provider that blocks browser requests would need a proxy; none of these four does." },
      { q: 'How are live readings connected to IFC elements?', a: 'With bindings. Each one names a polled feed, the device in it (Bicing station 65), a query that finds the elements (an IFC class plus part of a name, parts of assemblies included) and colour rules, of which the first match wins. A reading older than the source allows turns the elements grey.' },
      { q: 'Are the IFC models official city records?', a: 'No. They are illustrative reconstructions authored from public sources: OpenStreetMap, the ICGC elevation model and Wikimedia Commons. Their asset data is labelled as demo values. The live data is real.' },
    ],
    references: [
      { id: 'gbfs', title: 'General Bikeshare Feed Specification (GBFS)', source: 'MobilityData', url: 'https://gbfs.org/', note: 'The format Bicing publishes its stations and their live state in.' },
      { id: 'opendata-bcn', title: 'Open Data BCN', source: 'Ajuntament de Barcelona', url: 'https://opendata-ajuntament.barcelona.cat/en/', note: 'Traffic, Endolla charging points and air quality, CC BY 4.0.' },
      { id: 'icgc-met', title: 'Elevations: digital terrain models', source: 'Institut Cartogràfic i Geològic de Catalunya', url: 'https://www.icgc.cat/en/Geoinformation-and-Maps/Data-and-products/Elevations', note: 'The 5 m terrain model the models stand on.' },
    ],
    content: [
      { type: 'p', text: 'Most digital-twin demos start with a platform: a cloud account, a connector licence and a server for the sensors to talk to. This one starts with a link. Open it, and eight IFC models of Plaça de Catalunya stand on the real terrain of Barcelona while the city\'s public feeds paint them: a bike-share station\'s docks, an EV charger\'s bays, the traffic on the streets around, and the air quality.' },
      { type: 'p', text: "Nothing in between is ours. The visitor's browser fetches the models from this site and the data straight from each provider. That puts limits on what the twin can do, and they are covered below. It also means anyone can open it, embed it, or copy its scene file and build their own." },
      { type: 'takeaways', items: [
        'A useful digital twin can be built from open data alone when the providers allow browser requests (CORS). Barcelona\'s Bicing, Endolla, traffic and air-quality feeds all do.',
        'The link between data and model is a binding: a feed, a device id, a query for IFC elements by class and name, and colour rules where the first match wins.',
        'Alignment is what makes it believable. Here, IFC elements land within 0.1–0.4 m of the OpenStreetMap features they model, and data points sit exactly where the basemap draws them.',
        'The whole demo is one JSON scene file. Copy it, change the models and bindings, and you have your own.',
      ] },
      {
        type: 'tool-demo',
        demo: 'twin-barcelona',
        title: 'Try it: Plaça de Catalunya, live',
        description: 'Opens the eight models on the ICGC terrain with the four live layers. The Bicing docks and the Endolla bays take their colour from the feeds, with the live value floating above them.',
        poster: 'blog/images/barcelona-digital-twin-open-data-capture.jpg',
        posterAlt: 'Plaça de Catalunya digital twin in IFC Viewer Online, with IFC models on the 3D map of Barcelona',
        launchLabel: 'Open the live twin',
        hint: 'Click any asset to see its data; Explore takes you to each live point. Grey docks mean the feed has not answered yet, or the station is out of service. Open Data BCN can take 15–40 s.',
      },

      { type: 'h2', text: 'What is in the scene' },
      { type: 'p', text: 'Eight georeferenced IFC 4.3 models around the square and the bottom of Passeig de Gràcia, on the Catalan cartographic institute\'s 5 m terrain, with the OpenStreetMap city around them.' },
      {
        type: 'table',
        headers: ['Model', 'What it is'],
        rows: [
          ['Mobility hub', 'Bicing station 65 with its 21 docks, a bus shelter, the metro access with its lift, street furniture'],
          ['Fonts Bessones', 'The twin fountains of the square, with their hydraulic and lighting systems'],
          ['Macià monument', 'The monument to Francesc Macià, as a heritage asset'],
          ['Pelai entrance', 'The Pelai entrance to Catalunya station'],
          ['Canaletes', 'The top of La Rambla and the Canaletes fountain'],
          ['Gran Via fountain', 'The monumental fountain at Passeig de Gràcia and Gran Via'],
          ['Bench-lamps', "Pere Falqués' bench-lamps on Passeig de Gràcia"],
          ['Endolla charger', 'An on-street EV charging point: the charger, its connectors and two bays'],
        ],
        caption: 'The models are illustrative reconstructions authored from public sources. Their asset data is labelled as demo values in the files.',
      },
      shot('barcelona-digital-twin-bicing', 'Bicing station 65 at Plaça de Catalunya as an IFC model, its dock posts coloured by the live GBFS feed, with the number of available bikes floating above', 'Bicing station 65: the dock posts take the station\'s state every minute, and the floating number is the bikes available right now.'),

      { type: 'h2', text: 'Four open feeds and no server in between' },
      {
        type: 'table',
        headers: ['Feed', 'Publisher', 'Format', 'Refresh in the scene'],
        rows: [
          ['Bicing stations', 'Bicing, Ajuntament de Barcelona', 'GBFS 3.0', 'Map layer every 30 s; dock colours every 60 s'],
          ['EV charging', 'Endolla / B:SM, Open Data BCN', 'GELFS JSON', 'Charger state every 5 min'],
          ['Street traffic', 'Ajuntament de Barcelona, Open Data BCN', 'Status table joined to street sections', 'Every 5 min'],
          ['Air quality', 'Agència de Salut Pública de Barcelona', 'Hourly CSV joined to the stations', 'Hourly, published 45 min to 3 h late'],
        ],
      },
      { type: 'p', text: ['Every request goes from the visitor\'s browser to the publisher. That only works because these feeds send the CORS headers that allow it, which was checked for each one before it went into the scene. The formats are open standards or plain files: GBFS for bike share', { cite: 'gbfs' }, ', a JSON file for Endolla, and CSV tables from the city\'s open-data portal', { cite: 'opendata-bcn' }, '. All four are read in the browser.'] },
      { type: 'callout', variant: 'info', title: 'A hidden tab stops asking', text: 'The twin polls only while it is on screen. A background tab makes no requests and catches up when it is shown again, which keeps the visitor\'s data plan and the publishers\' servers out of it.' },

      { type: 'h2', text: 'From a feed to a coloured dock post' },
      { type: 'p', text: 'Colouring the docks of station 65 takes five steps, and the scene file holds every one of them:' },
      { type: 'steps', items: [
        { title: 'A device source', body: 'The Bicing station-status feed, polled every 60 s. Each station in it becomes a device, keyed by station_id.' },
        { title: 'One device', body: 'Station 65, the one at the corner of the square and Passeig de Gràcia.' },
        { title: 'A query for the elements', body: 'IfcBuildingElementProxy elements whose name contains "ancoratge" (Catalan for dock), parts of assemblies included. That finds all 21 dock posts.', detail: 'Assemblies matter here. The docks are parts of the station assembly (IfcRelAggregates), and a query that only looked at top-level elements found none of them.', detailLabel: 'Why parts of assemblies' },
        { title: 'Rules, first match wins', body: 'Out of service: grey. No bikes: red, with an alert after 15 minutes. Full: blue. Two bikes or fewer: amber. Otherwise green.' },
        { title: 'A floating value and a staleness limit', body: 'The number of available bikes floats above the docks. A reading older than the source allows turns them grey: "no recent data" never passes for "all is well".' },
      ] },
      { type: 'code', lang: 'json', text: '{\n  "sourceId": "bicing-status",\n  "deviceId": "65",\n  "query": { "classes": ["IfcBuildingElementProxy"], "nameContains": "ancoratge" },\n  "rules": [\n    { "name": "No bikes", "filters": [{ "field": "num_vehicles_available", "op": "eq", "value": 0 }],\n      "effect": { "color": "#ef4444" }, "alert": { "forMin": 15 } }\n  ]\n}' },
      { type: 'p', text: 'The Endolla charger works the same way: its two bays take the state of charging location 3762 at Passeig de Gràcia 5. The charger\'s ids in the IFC are illustrative, so that binding is matched by position (the real location next to the model) rather than by a real equipment id.' },

      { type: 'h2', text: 'Standing in the right place' },
      { type: 'p', text: ['A twin that floats a few metres off its street stops being convincing at the first glance. Each model here is placed by its own georeference, an IfcMapConversion in ETRS89 / UTM 31N, onto the terrain model', { cite: 'icgc-met' }, '. Models that share an origin stay together. If your own models land in the wrong place, the usual causes are covered in ', { text: 'IFC coordinates and georeferencing', to: 'ifc-coordinates-georeferencing' }, '.'] },
      { type: 'p', text: 'We measured where the models land against the OpenStreetMap features they represent, with both projected exactly as the basemap draws them:' },
      { type: 'bars', title: 'IFC element vs the OSM feature it models', unit: 'm', items: [
        { label: 'Canaletes fountain column', value: 0.08 },
        { label: 'Fonts Bessones', value: 0.1 },
        { label: 'Macià monument', value: 0.3 },
        { label: 'Pelai glass kiosk', value: 0.38 },
      ], caption: 'Measured in the running viewer on 2026-10-10. The data layers are exact: 687 points, up to 8 km from the square, sit 0.00 mm from where the map draws them.' },
      { type: 'p', text: 'Two details make the difference at this scale. The georeference stores its rotation from grid north, while the map is drawn to true north. In Barcelona the two differ by 0.55°, about a metre at the end of a 100 m model, and the viewer takes the difference out. And the data layers are projected exactly as the basemap projects, so a Bicing station 4 km away still sits on its pavement.' },
      { type: 'related', to: 'view-ifc-on-3d-map-online', why: 'How to put your own IFC on the 3D map, with terrain and the city around it.' },

      { type: 'h2', text: 'What it is not' },
      { type: 'ul', items: [
        'Not a control system. The data is what the publishers publish, at their pace: air quality is 45 minutes to 3 hours behind, and the EV file only says when a port last changed, not when it last reported.',
        'Not the city\'s asset register. The models are reconstructions and their maintenance data is illustrative.',
        'Not fast on every feed. Open Data BCN can take 15–40 s to answer, so traffic and charging can appear after the rest.',
        'Not measured on phones yet. The full scene, with eight models, four layers and the 3D city, has been tested on desktop browsers.',
      ] },

      { type: 'h2', text: 'Build your own' },
      { type: 'p', text: 'The demo is one JSON file, a scene, which lists the models, the layers, the device sources, the bindings and the camera. To make your own:' },
      { type: 'steps', items: [
        { title: 'Copy the scene file', body: 'Start from /scenes/barcelona-placa-catalunya.scene.json on this site.' },
        { title: 'Swap the models', body: 'Point the model URLs at your IFC files, on any host that sends CORS headers.' },
        { title: 'Point the bindings at your elements', body: 'Use an IFC class and part of a name, or a list of GlobalIds.' },
        { title: 'Host it and open it', body: 'Any static host will do. Open the viewer with ?scene= and the file\'s URL, or skip hosting: Share → Digital-twin scene packs the whole scene into the link itself.' },
      ] },
      { type: 'code', lang: 'html', text: '<iframe\n  src="https://www.ifcvieweronline.eu/?scene=/scenes/barcelona-placa-catalunya.scene.json&embed=1"\n  width="100%" height="600" style="border:0;border-radius:12px"\n  loading="lazy" allow="fullscreen"\n  title="Plaça de Catalunya — open-data digital twin">\n</iframe>' },
      { type: 'p', text: ['The same embed works on a project website, an intranet page or a CDE panel. The full set of parameters is in ', { text: 'how to embed an IFC viewer', to: 'embed-ifc-viewer-website' }, '. The same approach with other data is in ', { text: 'live buses on an IFC bus terminal over MQTT', to: 'bus-terminal-digital-twin-mqtt' }, ' and ', { text: 'Tokyo station twins from ODPT data', to: 'tokyo-transit-digital-twin-odpt' }, '.'] },
      { type: 'tool', id: 'embed', why: 'Generate the embed code for your own model or scene.' },
    ],
  },

  // ── Helsinki ───────────────────────────────────────────────────────────────
  {
    ...base,
    ...hero('bus-terminal-digital-twin-mqtt'),
    slug: 'bus-terminal-digital-twin-mqtt',
    title: 'Live Buses on an IFC Model: a Bus Terminal Digital Twin Over MQTT',
    seoTitle: 'Bus Terminal Digital Twin: Live MQTT Buses on IFC',
    seoDescription: "Helsinki's buses light up the bays of an IFC bus terminal in real time, over the transit agency's public MQTT feed, straight from the browser. How it works.",
    excerpt: "At the Elielinaukio terminal next to Helsinki Central Station, each bay of an IFC model lights up when a real bus stands at it, with the line number above. The data comes from HSL's public MQTT feed, received directly by the browser.",
    heroAlt: 'Helsinki Central Station and the Elielinaukio bus terminal as IFC models on the 3D map, with live bus line numbers floating over the bays',
    readTimeMin: 9,
    keywords: ['bus terminal digital twin', 'MQTT digital twin', 'MQTT over WebSocket browser', 'HSL high-frequency positioning', 'live transit data IFC', 'IoT digital twin without backend', 'Helsinki digital twin'],
    faqs: [
      { q: 'Can a browser subscribe to MQTT directly?', a: 'Yes, when the broker accepts MQTT over WebSocket, as HSL\'s public broker does at wss://mqtt.hsl.fi. The browser connects, subscribes to topics and receives each message as it is published. No server of your own is needed in between.' },
      { q: 'Why not use GTFS-Realtime for this?', a: "HSL's GTFS-Realtime feed does not send CORS headers, so a web page on another site cannot read it without a proxy. The MQTT feed is reachable from the browser, carries the same vehicles with more detail (doors, speed, stop), and arrives about once a second per bus." },
      { q: 'How does a bus message find the right bay in the IFC model?', a: "Each message carries the stop the bus is at. Each bay in the model is bound to its HSL stop id, taken from HSL's published stop list, and its elements are found by name (\"Bay 20\"). The colour then follows rules: doors open, standing, or pulling in and out." },
    ],
    references: [
      { id: 'hfp', title: 'High-frequency positioning', source: 'Digitransit (HSL)', url: 'https://digitransit.fi/en/developers/apis/5-realtime-api/vehicle-positions/high-frequency-positioning/', note: 'The MQTT topics and message fields used by the terminal.' },
      { id: 'fmi', title: 'Open data', source: 'Finnish Meteorological Institute', url: 'https://en.ilmatieteenlaitos.fi/open-data', note: 'Air-quality and weather observations, read here as simple WFS features.' },
    ],
    content: [
      { type: 'p', text: 'A bus terminal is a good test for a digital twin, because what it is doing changes by the minute. Seventeen bays, buses pulling in and out, doors opening and closing. If the model can show that live, from public data, it can show most things.' },
      { type: 'p', text: "This scene does it for Elielinaukio, the terminal on the west side of Helsinki Central Station. Each bay of the IFC model lights up while a real bus stands at it, with its line number floating above. The positions come from HSL, Helsinki's transport authority, which publishes every vehicle's position about once a second over MQTT, and the browser subscribes to it directly." },
      { type: 'takeaways', items: [
        'MQTT over WebSocket lets a web page receive live vehicle positions with no server of its own in between, as long as the broker allows it. HSL\'s does.',
        'Subscribe narrowly. A geographic slice of the topic tree means only the terminal\'s buses reach the browser.',
        'Bays are bound to the transit agency\'s stop ids, and the colours follow rules on fields in the message: doors open, standing, moving, or no bus.',
        'Federated models stay aligned when each satellite is turned to its own georeference. Here the Cathedral\'s frame is 3° off the terminal\'s.',
      ] },
      {
        type: 'tool-demo',
        demo: 'twin-helsinki',
        title: 'Try it: Helsinki\'s buses, now',
        description: 'Opens the terminal, the station and the Cathedral on the map. Bays light up as real buses arrive. At night there are few, so the bays stay grey for long stretches.',
        poster: 'blog/images/bus-terminal-digital-twin-mqtt-capture.jpg',
        posterAlt: 'Helsinki bus terminal digital twin in IFC Viewer Online, with live line numbers over the bays',
        launchLabel: 'Open the live terminal',
        hint: 'Click any asset to see its data; Explore takes you to each live point. Green: doors open. Blue: standing. Amber: pulling in or out. Grey: no bus in the last 45 s.',
      },

      { type: 'h2', text: 'What you are looking at' },
      { type: 'p', text: 'Three georeferenced IFC models (ETRS89 / GK25, EPSG:3879) on the OpenStreetMap city: Eliel Saarinen\'s Central Station with its platforms, the Cathedral on Senate Square, and the bus terminal with its 17 bays (20 to 36), poles, signs and canopy. Two live layers from the Finnish Meteorological Institute show air quality and weather.' },
      shot('bus-terminal-digital-twin-bays', 'Close view of the Elielinaukio bus terminal IFC model, with bays coloured by live bus data and line numbers floating above them', 'The bays as the buses come and go: each pole and sign takes the colour of what the bus at that stop is doing.'),
      {
        type: 'table',
        headers: ['Bay colour', 'Rule on the HSL message', 'Meaning'],
        rows: [
          ['Green', 'doors open (drst = 1)', 'Boarding'],
          ['Blue', 'speed under 0.5 m/s', 'Standing at the bay'],
          ['Amber', 'any other reading at the stop', 'Pulling in or out'],
          ['Grey', 'no reading for 45 s', 'No bus'],
        ],
        caption: 'The first rule that matches wins. The line number (desi) floats above the bay.',
      },

      { type: 'h2', text: 'Why MQTT, and not GTFS-Realtime' },
      { type: 'p', text: "GTFS-Realtime is the usual format for live transit data, and HSL publishes it. But that feed does not send the CORS headers a browser needs to read it from another site, so using it would mean running a proxy. The high-frequency positioning feed is different: it is MQTT over WebSocket, public, keyless, and reachable from any web page." },
      { type: 'p', text: ['It is also richer for this purpose. Each message is one bus, about once a second, with its line, speed, door state and the stop it is at', { cite: 'hfp' }, '. The topic says where the bus is, so a subscription can be cut to one slice of the city:'] },
      { type: 'code', lang: 'text', text: '/hfp/v2/journey/ongoing/vp/bus/+/+/+/+/+/+/+/+/60;24/19/73/#' },
      { type: 'p', text: 'The last part, 60;24/19/73, is a cell of HSL\'s geographic grid around the terminal. The browser receives the buses in that cell and nothing else. It reads the messages once a second and keeps the newest one per stop. A bus between stops, with no stop in its message, is skipped.' },
      { type: 'callout', variant: 'tip', title: 'Check the volume before you widen the topic', text: 'A broad subscription is easy to write and expensive to receive. During testing, a wider topic turned 69 stops into devices within 30 seconds. That is fine for a test, but a cost on a phone. Cut the topic to the area you show.' },

      { type: 'h2', text: 'From a stop id to a bay' },
      { type: 'p', text: 'HSL identifies stops by number, the IFC model by name. HSL\'s published stop list joins the two: nine of the seventeen bays have an HSL stop today, and each of them is one binding. The elements are found by name, "Bay 20" and so on. That finds the pole and the three signs of each bay.' },
      {
        type: 'table',
        headers: ['Bay', 'HSL stop id'],
        rows: [['20', '1020128'], ['22', '1020131'], ['23', '1020133'], ['24', '1020135'], ['25', '1020132'], ['26', '1020239'], ['28', '1020243'], ['29', '1020245'], ['30', '1020130']],
        caption: 'From HSL\'s GTFS stops list, read once when the scene was written. The other eight bays have no stop and stay grey.',
        layout: 'scroll',
      },
      { type: 'code', lang: 'json', text: '{\n  "id": "hsl-hfp-elielinaukio",\n  "url": "wss://mqtt.hsl.fi:443/",\n  "topics": ["/hfp/v2/journey/ongoing/vp/bus/+/+/+/+/+/+/+/+/60;24/19/73/#"],\n  "mapping": { "idField": "VP.stop", "timeField": "VP.tst" }\n}' },
      { type: 'p', text: 'This device source is all it takes to read a different fleet or a different area: a broker that speaks MQTT over WebSocket, the topics, and which field of the message identifies the device. The rest of the scene stays the same.' },

      { type: 'h2', text: 'Air quality and weather' },
      { type: 'p', text: ['The two map layers come from the Finnish Meteorological Institute\'s open data', { cite: 'fmi' }, ', read in the browser as simple WFS features: 11 air-quality stations and 7 weather stations around the city when we checked. Air quality is hourly and can arrive up to 40 minutes late; weather every 10 minutes.'] },

      { type: 'h2', text: 'Three models, one map' },
      { type: 'p', text: "The station, the Cathedral and the terminal are separate files, and each one carries its own georeference. The Cathedral's local axes are turned 3° from the terminal's, which anchors the map. If the viewer only moved the other models into place without turning them, the Cathedral would stand 3° askew, about 2 m off at its corners." },
      { type: 'p', text: "The viewer turns each model to its own frame, about its own centre. Measured against the OpenStreetMap outline of the Cathedral, the walls now sit 0.56 m from it and 0.37° off. That remainder is how accurately the model and OSM each draw the building." },
      { type: 'related', to: 'ifc-coordinates-georeferencing', why: 'What a georeference stores, and why federated models drift apart without one.' },

      { type: 'h2', text: 'Limits worth saying out loud' },
      { type: 'ul', items: [
        'The models are illustrative, drawn from public sources. They are not surveys.',
        'Only nine bays have an HSL stop, so the other eight never light up.',
        'At night few buses run, and the bays stay grey for long stretches.',
        'The global terrain here reads about 18 m above the Finnish height system, so the models stand on the terrain\'s surface rather than at their stated heights. Their heights relative to each other are kept.',
        'A background tab receives messages less often, because browsers slow down timers in hidden tabs.',
      ] },
      { type: 'p', text: ['The same scene format runs a city square from bike-share and charging data in ', { text: 'the Barcelona open-data twin', to: 'barcelona-digital-twin-open-data' }, ', and two Tokyo stations from train and tram data in ', { text: 'Tokyo transit twins from ODPT', to: 'tokyo-transit-digital-twin-odpt' }, '. For a twin fed by a sensor rather than a transit feed, see ', { text: 'real-time LiDAR in a web digital twin', to: 'real-time-lidar-web-digital-twin-mcap' }, '.'] },
      { type: 'tool', id: 'sdk', why: 'Open a scene from your own page and react to its alerts and picks with the SDK.' },
    ],
  },

  // ── Tokyo ──────────────────────────────────────────────────────────────────
  {
    ...base,
    ...hero('tokyo-transit-digital-twin-odpt'),
    slug: 'tokyo-transit-digital-twin-odpt',
    title: 'Tokyo Transit Digital Twins From ODPT Open Data: the Ōedo Line and the Arakawa Tram',
    seoTitle: 'Tokyo Transit Digital Twin With ODPT Open Data',
    seoDescription: 'Two Tokyo stations as live digital twins in the browser: Toei Ōedo trains, line status and GTFS-Realtime buses from ODPT, and the Arakawa tram at Waseda.',
    excerpt: "An exit of Tochōmae station and the Waseda tram stop, as IFC models that react to Tokyo's public transit data: the Ōedo line's status, the train at the platform, the buses passing, the tram at the stop. It runs in the browser from ODPT's open APIs, and the GTFS-Realtime protobuf is decoded on the page.",
    heroAlt: 'Exit A4 of Tochōmae station as an IFC model on the 3D map of Shinjuku, with the live train number at the platform floating above',
    readTimeMin: 9,
    keywords: ['Tokyo digital twin', 'ODPT open data', 'public transportation open data Japan', 'GTFS-Realtime protobuf browser', 'Toei Oedo line live', 'Toden Arakawa line tram', 'station digital twin IFC'],
    faqs: [
      { q: 'Do you need an API key for ODPT?', a: "Not for the data used here. ODPT's public endpoint serves Toei's trains, line status and bus GTFS-Realtime without a key. Other operators' data on ODPT's main API needs a free developer registration and a key, which should not be put in a public web page." },
      { q: 'Can a browser read GTFS-Realtime protobuf?', a: 'Yes. GTFS-Realtime is a small protocol-buffers schema, and a decoder for the vehicle positions part is a few hundred lines of JavaScript. This scene decodes the Toei bus feed on the page, with no library and no server.' },
      { q: 'How precise are the train and bus positions?', a: 'Not to the metre. ODPT reports a train as at a station or between two, and Toei buses are placed at the stop they last passed, not by GPS. That is enough to say "a train is at the platform" or "a bus passed in the last ten minutes", which is what the scene shows.' },
    ],
    references: [
      { id: 'odpt', title: 'Public Transportation Open Data Center', source: 'ODPT', url: 'https://developer.odpt.org/', note: 'Toei trains, line information and bus GTFS-Realtime, CC BY 4.0.' },
      { id: 'gtfs-rt', title: 'GTFS Realtime reference', source: 'MobilityData', url: 'https://gtfs.org/documentation/realtime/reference/', note: 'The protobuf schema of the bus feed.' },
      { id: 'gsi', title: 'Tile list (DEM10B elevation tiles)', source: 'Geospatial Information Authority of Japan', url: 'https://maps.gsi.go.jp/development/ichiran.html', note: 'The terrain the models stand on in Japan.' },
    ],
    content: [
      { type: 'p', text: 'Tokyo runs one of the densest transit networks in the world, and much of its live data is open. ODPT, the Public Transportation Open Data Center, publishes Toei\'s trains, the status of its lines and the positions of its buses on an endpoint that needs no key.' },
      { type: 'p', text: 'These two scenes connect that data to IFC models of two stations: exit A4 of Tochōmae on the Ōedo line, next to the Tokyo Metropolitan Government Building, and the Waseda terminus of the Toden Arakawa tram. They run entirely in the browser.' },
      { type: 'takeaways', items: [
        "ODPT's public endpoint serves Toei's trains, line status and bus GTFS-Realtime without a key, with CORS, so a web page can read it directly.",
        'GTFS-Realtime is protobuf, not JSON. A small decoder on the page reads it, with no library and no server.',
        "Transit data says where a train is to the station, not to the metre. Bind it to what that precision supports: a platform, a sign, a stop pole.",
        "Japan's plane rectangular coordinate systems and the GSI terrain place both models within centimetres to about a metre of OpenStreetMap.",
      ] },

      { type: 'h2', text: 'Tochōmae exit A4: three feeds on one entrance' },
      {
        type: 'tool-demo',
        demo: 'twin-tochomae',
        title: 'Try it: Tochōmae exit A4',
        description: 'Opens the exit pavilion on GSI terrain beside the Metropolitan Government Building. The Toei marks show the Ōedo line\'s status, the station sign lights up with the number of the train at the platform, and the bus stop pole with the buses passing.',
        poster: 'blog/images/tokyo-transit-digital-twin-odpt-capture.jpg',
        posterAlt: 'Tochōmae station exit A4 digital twin in IFC Viewer Online',
        launchLabel: 'Open Tochōmae, live',
        hint: 'Click any asset to see its data; Explore takes you to each live point. A grey sign means no train is at the platform right now. Wait for the next one, or open the full viewer.',
      },
      {
        type: 'table',
        headers: ['Element', 'Live source', 'Lights up when'],
        rows: [
          ['Toei marks', 'Line status (odpt:TrainInformation), every 60 s', 'Green while the Ōedo line reports no delay of 15 minutes or more'],
          ['Station sign 都庁前駅', 'Trains (odpt:Train), every 30 s', 'A train is at Tochōmae or has just left it. Its number floats above'],
          ['Bus stop pole', 'Toei bus GTFS-Realtime, every 30 s', 'A bus passed stop 都庁第一本庁舎 in the last 10 minutes'],
        ],
      },
      { type: 'p', text: ['The bus feed is GTFS-Realtime', { cite: 'gtfs-rt' }, ', a protocol-buffers format rather than JSON. The scene decodes it on the page with a small decoder written for the purpose. Between 470 and 540 Toei buses were in the feed whenever we looked. The train and status feeds are JSON-LD from the same public endpoint', { cite: 'odpt' }, '.'] },

      { type: 'h2', text: 'Waseda: the tram at the stop' },
      {
        type: 'tool-demo',
        demo: 'twin-waseda',
        title: 'Try it: the Waseda tram stop',
        description: 'Opens the Waseda terminus of the Toden Arakawa line. Both platform edges light up while a tram stands at the stop, with its number above, and the departure screens show the line\'s status.',
        poster: 'blog/images/tokyo-transit-digital-twin-waseda.jpg',
        posterAlt: 'Waseda tram stop digital twin on the 3D map of Tokyo in IFC Viewer Online',
        launchLabel: 'Open Waseda, live',
        hint: 'Click any asset to see its data; Explore takes you to each live point. Between trams the edges are grey. ODPT does not say which platform a tram uses, so both light up.',
      },
      shot('tokyo-transit-digital-twin-waseda', 'The Waseda terminus of the Toden Arakawa line as an IFC model on the 3D map of Tokyo, between the OpenStreetMap buildings of the avenue', 'The Waseda terminus on its avenue. One OpenStreetMap outline, the stop\'s own concourse, is hidden by the scene so it does not cover the model.'),
      { type: 'p', text: 'The Arakawa line, today the Tokyo Sakura Tram, is the last of Toei\'s streetcar lines. The model of its Waseda terminus is an IFC 4.3 railway model with rails, platforms, canopies and departure screens. The tram binding reads the same train feed as Tochōmae and lights the platform edges when a tram\'s position is Waseda. The status binding colours the screens\' LED matrices.' },

      { type: 'h2', text: "Getting Tokyo's coordinates right" },
      { type: 'p', text: ['Both models are georeferenced in JGD2011 / Japan Plane Rectangular CS IX (EPSG:6677) and stand on the GSI\'s 10 m elevation tiles', { cite: 'gsi' }, '. The plane coordinate system\'s grid north differs from true north by about 0.08° here. That is small, and the viewer takes it out anyway, so the models face the same way as the map.'] },
      { type: 'p', text: 'Measured against OpenStreetMap, with both projected exactly as the basemap draws them:' },
      {
        type: 'table',
        headers: ['What', 'OpenStreetMap feature', 'Distance'],
        rows: [
          ['Origin of the Tochōmae exit model', 'Exit A4 node', '0.01 m'],
          ['A zelkova tree placed from OSM', 'The tree node it was placed from', '0.26 m'],
          ['Waseda track 2, centre', 'Arakawa line track way', '0.14 m'],
          ['Waseda track 1, centre', 'Arakawa line track way', '1.16 m'],
        ],
        caption: 'Measured in the running viewer on 2026-10-10.',
      },
      { type: 'p', text: ['The general method, and what goes wrong without it, is in ', { text: 'IFC coordinates and georeferencing', to: 'ifc-coordinates-georeferencing' }, '.'] },

      { type: 'h2', text: 'What ODPT can and cannot tell you' },
      { type: 'ul', items: [
        'A train is either at a station or between two. The sign therefore lights up for a train at Tochōmae or one that has just left it.',
        'Toei buses are not tracked by GPS. Each one is placed at the stop it last passed, so the pole lights up for 10 minutes after a bus has passed.',
        'Line status only reports delays of 15 minutes or more, and its text is in Japanese.',
        'The 10 m terrain reads about 3 m above the surveyed height at Tochōmae, and about 2 m above it at Waseda. The models stand on the terrain\'s surface rather than at their surveyed heights.',
        'The models are illustrative reconstructions, not the operators\' records.',
      ] },
      { type: 'callout', variant: 'warning', title: 'Keys stay out of public pages', text: "This scene uses ODPT's public, keyless endpoint. Data that needs a developer key must not go into a page anyone can read the source of. That case needs a small server of your own." },
      { type: 'p', text: ['The same scene format drives a city square from bike-share and charging data in ', { text: 'the Barcelona open-data twin', to: 'barcelona-digital-twin-open-data' }, ', and live buses over MQTT in ', { text: 'the Helsinki bus terminal', to: 'bus-terminal-digital-twin-mqtt' }, '.'] },
      { type: 'tool', id: 'viewer', why: 'Open your own georeferenced IFC on the 3D map.' },
    ],
  },
]
