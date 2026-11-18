import type { BlogPost } from './blog-posts'

// Two posts written on 2026-11-18.
//
// 1. as-built-vs-bim-point-cloud-conformance — the method of a 3D, per-element
//    as-built check (coverage, tolerance, alignment; deviated / missing /
//    unobserved) as designed in docs/AS_BUILT_SCORE_PLAN.md. The score itself
//    is NOT open: it is presented as a preview, like the other preview posts.
//    Free path = the user's own point cloud in the browser; paid = turning a
//    video into a point cloud on our servers. No figures from users, because
//    there are none yet.
//    One query, one page: the 2D slice against the plan stays with
//    check-point-cloud-against-ifc-floor-plan; loading a scan with an IFC stays
//    with ifc-point-cloud-browser-scan-to-bim; progress over time stays with
//    4d-construction-progress-ifc-temporal-point-cloud.
//
// 2. city-digital-twin-on-phone-safari — the Barcelona twin on a phone: what
//    mobile Safari does when a tab uses too much memory, and what the viewer
//    does about it (src/lib/geo/scene-budget.ts, map-crash-guard.ts,
//    src/lib/loading/device-profile.ts). Pictures are existing real captures.

const SITE = 'https://www.ifcvieweronline.eu'
const DATE = '2026-11-18'
const READ = '18 November 2026'

export const ASBUILT_POSTS_EN: BlogPost[] = [
  // ── As-built vs BIM ──────────────────────────────────────────────────────
  {
    slug: 'as-built-vs-bim-point-cloud-conformance',
    title: 'As-Built vs BIM: Checking a Point Cloud Against the IFC Model, Element by Element',
    seoTitle: 'As-Built vs BIM: Point Cloud vs IFC Conformance Check',
    seoDescription: 'How to compare a laser or phone LiDAR scan with the IFC model: alignment, tolerance, coverage, and why unseen elements must not count as built.',
    excerpt: 'Comparing a scan with the model sounds simple: measure the distance, colour it. The hard part is being honest about what the scan did not see. The method step by step, and a preview of the as-built check we are building.',
    date: DATE,
    dateModified: DATE,
    author: 'IFC Viewer Online',
    category: 'Validation & quality',
    categorySlug: 'validation',
    readTimeMin: 8,
    heroImage: 'blog/images/ifc-point-cloud-browser-scan-to-bim-1600x900.jpg',
    heroAlt: 'A laser scan of a building loaded together with its IFC model in IFC Viewer Online',
    heroCredit: 'IFC Viewer Online',
    keywords: ['as-built vs BIM', 'point cloud vs IFC', 'construction conformance check', 'scan vs BIM deviation', 'as-built verification point cloud', 'LiDAR as-built check', 'construction tolerance check'],
    references: [
      { id: 'pricing', title: 'IFC Viewer Online plans', source: 'IFC Viewer Online', year: '2026', url: `${SITE}/pricing/`, note: 'Planned prices of the paid plans, which are not open yet.' },
      { id: 'e57', title: 'ASTM E2807, Standard Specification for 3D Imaging Data Exchange (E57)', source: 'ASTM International', year: '2019', url: 'https://www.astm.org/e2807-11r19e01.html', note: `The E57 format most laser scanners export to. Read on ${READ}.` },
      { id: 'las', title: 'LAS Specification 1.4', source: 'ASPRS', year: '2019', url: 'https://www.asprs.org/divisions-committees/lidar-division/laser-las-file-format-exchange-activities', note: `The LAS/LAZ point cloud format and its classification codes. Read on ${READ}.` },
    ],
    faqs: [
      { q: 'Can I run the as-built check today?', a: 'Not the per-element check described here: it is in preview. Today you can load your IFC and your point cloud together in the free viewer and compare a slice of the scan with the floor plan cut from the model.' },
      { q: 'What will be free and what will be paid?', a: 'Comparing your own point cloud (E57, LAS/LAZ, or a phone LiDAR export) with the IFC will run in your browser, free. Turning a phone video into a point cloud needs a graphics server, so that part will be in a paid plan.' },
      { q: 'Is my IFC uploaded?', a: 'No. The comparison runs in the browser. In the paid video path only the video is sent to be turned into a point cloud; the model stays on your computer.' },
      { q: 'Is a phone LiDAR scan accurate enough?', a: 'For finding a missing wall or a misplaced opening, often yes. For a tolerance of a few millimetres, no. The check is built to refuse a result when the tolerance you ask for is smaller than the error of the scan and its alignment.' },
    ],
    content: [
      { type: 'callout', variant: 'info', title: 'Preview', text: ['The per-element as-built check described in this article is being built and tested on synthetic scenes. It is not open yet. Loading your own scan next to the IFC, and comparing a slice of it with the floor plan, is free today. Planned plans are on the ', { text: 'pricing page', href: `${SITE}/pricing/` }, '.'] },
      { type: 'p', text: 'You have the IFC model of a building and a scan of what was actually built. The question on site is plain: was it built where it was drawn? The usual answer is a colour map of distances between the two. It looks convincing, and it can be wrong in a way nobody notices: everything the scanner did not see shows up as if it were fine.' },
      { type: 'p', text: 'This article explains how an as-built check works when it is done honestly: alignment first, a tolerance that means something, and a clear line between "built as modelled", "built elsewhere", "not built" and "not seen".' },
      {
        type: 'takeaways',
        items: [
          'Align the scan with the model before measuring anything. A misaligned scan looks exactly like a badly built building.',
          'The tolerance has to be larger than the error of the scan plus the error of the alignment, or you are measuring your own setup.',
          'Each element is either conforming, deviated, missing, or not observed. Not observed is not the same as conforming.',
          'A result always comes with its coverage: the share of the model the scan could actually see.',
        ],
      },
      { type: 'h2', text: 'Step 1: get the scan and the model in the same place' },
      { type: 'p', text: ['A laser scanner exports E57 or LAS/LAZ', { cite: 'e57' }, ' ', { cite: 'las' }, ', usually in the surveyor\'s coordinates. A phone LiDAR scan has its own local origin. The IFC has its own placement, and sometimes a georeference. Before any distance means anything, the three have to be brought into one coordinate system.'] },
      { type: 'p', text: 'The robust way is to pick at least three points that you can recognise in both, such as column corners, slab edges or the corner of a stair, and fit the transformation between them. The fit leaves a residual error (the RMSE of the alignment). Write it down: it limits everything that follows.' },
      { type: 'callout', variant: 'warning', title: 'The trap', text: 'If the scan is rotated by half a degree, every wall far from the origin looks displaced by centimetres. A deviation map made before a careful alignment reports your alignment, not the building.' },
      { type: 'h2', text: 'Step 2: choose a tolerance that can be measured' },
      { type: 'p', text: 'The tolerance has two parts. One is the construction tolerance you are checking against: for example 25 mm for a structural element, which is a common starting point, but the contract or the project specification decides. The other is the uncertainty of the measurement itself: the accuracy of the scanner, and the RMSE of the alignment.' },
      { type: 'p', text: 'The rule we use: if the tolerance is not clearly larger than the alignment error (we require at least twice), the check refuses to give a result and says why. Without that rule, a tool produces confident deviation reports that are artefacts of the registration.' },
      {
        type: 'table',
        headers: ['Source of the scan', 'Typical use', 'What it is good for'],
        rows: [
          ['Terrestrial laser scanner (E57, LAS)', 'Surveys, structure, facades', 'Tight tolerances, if the registration is good'],
          ['Phone or tablet LiDAR', 'Rooms, quick checks on site', 'Finding missing or misplaced elements, not millimetres'],
          ['Point cloud from a video', 'Walk-through of a site', 'Coarse checks; accuracy depends on the reconstruction'],
        ],
        caption: 'A rough guide, not a specification. Check the accuracy your own device and workflow achieve before setting a tolerance.',
      },
      { type: 'h2', text: 'Step 3: compare element by element, not point by point' },
      { type: 'p', text: 'A colour map of point distances answers "how far is this point from the nearest surface". A construction team needs a different answer: "is this wall where it should be". So the comparison starts from the model. The surface of each IFC element is sampled into points, and for every sample the nearest scan point is found. Then each element gets one of five states:' },
      {
        type: 'table',
        headers: ['State', 'When', 'What it means'],
        rows: [
          ['Conforming', 'Matched, and 95% of its samples within tolerance', 'Built where the model says'],
          ['Deviated', 'Matched, but beyond tolerance', 'Built, but in the wrong place or with the wrong size'],
          ['Missing', 'Seen by the scan, but less than 20% of it matched', 'Modelled and not built (or not built yet)'],
          ['Not observed', 'No scan position could see it', 'Unknown: it cannot be scored'],
          ['Occluded', 'In view, but hidden behind something', 'Unknown: it cannot be scored'],
        ],
      },
      { type: 'p', text: 'There is also the opposite direction: scan points with no IFC element near them. Grouped together, they are things that were built but not modelled. That is often the most useful finding on site, and no IFC validator can produce it, because it needs the reality.' },
      { type: 'h2', text: 'Step 4: report coverage next to the result' },
      { type: 'p', text: 'This is the part most tools skip. If you scan one clean corner for twenty seconds and count everything else as fine, you get a perfect score for a building you never looked at. So an element that was not observed is neither conforming nor non-conforming. It is unknown, and it is counted separately.' },
      { type: 'p', text: 'The result is therefore always two numbers, never one: how well what was seen matches, and how much of the model was seen. A good match over a small share of the model is not a conclusion. Our rule is that below 25% coverage there is no score at all, only "capture insufficient".' },
      { type: 'h3', text: 'Why one problem should not count a hundred times' },
      { type: 'p', text: ['If a whole slab was poured 4 cm high, that is one problem on site, not eight hundred defective elements. The score uses the same logarithmic penalty as our ', { text: 'Health Score for IFC models', to: 'ifc-health-score-explained' }, ': many elements with the same issue weigh more than one, but not proportionally. Otherwise any real capture would score zero and the number would be useless.'] },
      { type: 'h2', text: 'What you can do today, for free' },
      { type: 'p', text: ['Load the IFC and your scan together in the viewer: E57, LAS/LAZ and other common formats open in the browser, without uploading anything. How that works on a real scan-to-BIM case is in ', { text: 'IFC and point clouds in the browser', to: 'ifc-point-cloud-browser-scan-to-bim' }, '.'] },
      { type: 'p', text: ['For a first answer to "is this wall where it was drawn", slice the scan at a height and compare it with the plan cut from the model: ', { text: 'check a point cloud against the IFC floor plan', to: 'check-point-cloud-against-ifc-floor-plan' }, '. It is a 2D check at one height, so it finds where to look rather than certifying anything. For floors, ', { text: 'slab flatness from a point cloud', to: 'point-cloud-floor-plan-slab-flatness' }, ' works the same way.'] },
      { type: 'h2', text: 'What the as-built check will add, and what it will cost' },
      {
        type: 'table',
        headers: ['', 'Free (in the browser)', 'Paid plan (planned)'],
        rows: [
          ['Your own point cloud (E57, LAS/LAZ, phone LiDAR)', 'Yes: per-element states, coverage and score, computed on your computer', 'Same'],
          ['A phone video turned into a point cloud', 'No', 'Yes: the video is processed on a graphics server'],
          ['Your IFC model', 'Never leaves the browser', 'Never leaves the browser: only the video is sent'],
        ],
        caption: 'Plan for the feature, not a promise of dates. Planned prices are on the pricing page.',
      },
      { type: 'p', text: ['The split follows one rule: anything that costs us money to run goes into the paid plan, and the free plan gets the version that runs on your own machine. Processing video needs a GPU server; comparing a point cloud you already have does not.', { cite: 'pricing' }] },
      { type: 'h3', text: 'What it does not do yet' },
      {
        type: 'ul',
        items: [
          'There is no interface yet: the comparison engine (sampling, nearest neighbour, visibility and score) is built and tested on synthetic scenes only.',
          'The three-point alignment is not built. Until it is, no score will be shown to users.',
          'It has not been tested on a real construction site by a customer.',
        ],
      },
      { type: 'p', text: ['If you check as-built work against IFC models and want to try it on a real project when it opens, ', { text: 'tell us on the pricing page', href: `${SITE}/pricing/` }, '. For progress over time rather than conformance, see ', { text: '4D construction progress with IFC and point clouds', to: '4d-construction-progress-ifc-temporal-point-cloud' }, '.'] },
      { type: 'related', to: 'check-point-cloud-against-ifc-floor-plan', why: 'The check you can run today: a slice of the scan against the IFC floor plan, with percentages and a PDF.' },
      { type: 'tool', id: 'viewer', why: 'Open your IFC and your scan together, in the browser.' },
    ],
  },

  // ── City twin on a phone ─────────────────────────────────────────────────
  {
    slug: 'city-digital-twin-on-phone-safari',
    title: 'A City Digital Twin on Your Phone: the Barcelona Demo in Safari and Chrome',
    seoTitle: 'City Digital Twin on a Phone: IFC and 3D Map in Safari',
    seoDescription: 'Open a city digital twin with IFC models and a 3D map on an iPhone or Android, why Safari reloads heavy pages, and how the viewer stays within memory.',
    excerpt: 'Eight IFC models of Plaça de Catalunya on a 3D map of Barcelona, opened from a link on a phone. What mobile Safari does when a page uses too much memory, and what the viewer does so the twin stays open.',
    date: DATE,
    dateModified: DATE,
    author: 'IFC Viewer Online',
    category: 'Digital twins',
    categorySlug: 'digital-twins',
    readTimeMin: 6,
    heroImage: 'blog/images/barcelona-digital-twin-open-data-1600x900.jpg',
    heroAlt: 'Plaça de Catalunya in IFC Viewer Online: IFC models on the 3D map of Barcelona with live Bicing data',
    heroCredit: 'IFC Viewer Online · map data © OpenStreetMap contributors (ODbL)',
    keywords: ['digital twin on mobile', 'city digital twin phone', 'IFC viewer iPhone', '3D map Safari iPhone', 'BIM GIS mobile browser', 'Safari page reloaded memory', 'open IFC on phone'],
    references: [
      { id: 'webkit-memory', title: 'Device Memory API: browser compatibility', source: 'MDN Web Docs', year: '2026', url: 'https://developer.mozilla.org/en-US/docs/Web/API/Device_Memory_API', note: `navigator.deviceMemory is not available in Safari, so a page cannot ask an iPhone how much memory it has. Read on ${READ}.` },
      { id: 'opendata-bcn', title: 'Open Data BCN', source: 'Ajuntament de Barcelona', url: 'https://opendata-ajuntament.barcelona.cat/en/', note: 'The traffic, charging and air quality feeds in the demo, CC BY 4.0.' },
    ],
    faqs: [
      { q: 'Do I need an app to open the twin on a phone?', a: 'No. It is a web page. Open the link in Safari on an iPhone or iPad, or in Chrome on Android.' },
      { q: 'Why did Safari reload the page?', a: 'iOS ends a tab that uses more memory than it allows, and Safari reloads it with a short notice. The page gets no warning. A 3D map with terrain, buildings and several IFC models is the kind of page that can reach that limit.' },
      { q: 'What is safe map mode?', a: 'If the page was ended while the 3D map was loading, the next load in that tab opens the map without terrain, 3D buildings, vehicles or extra layers, so it does not crash again. Your saved settings are not changed, and you can turn the layers back on.' },
      { q: 'Is the data real?', a: 'The live feeds are real Barcelona open data. The IFC models are illustrative reconstructions made from public sources.' },
    ],
    content: [
      { type: 'p', text: 'A digital twin that only opens on a workstation is hard to share. The person who needs to see it is often on site, in a meeting, or reading a message on a phone. So we opened the Barcelona demo, eight IFC models of Plaça de Catalunya on a 3D map with live city data, on phones, and fixed what broke.' },
      {
        type: 'takeaways',
        items: [
          'The twin opens from a link in Safari on iPhone and Chrome on Android. Nothing to install.',
          'iOS ends a tab that uses too much memory, without warning the page. Safari then reloads it.',
          'On phones the viewer draws a lighter map: fewer map tiles kept in memory, tiles at normal resolution, a quarter of the decorative objects.',
          'If the map crashed the tab anyway, the next load opens it in safe map mode instead of crashing again.',
        ],
      },
      {
        type: 'tool-demo',
        demo: 'twin-barcelona',
        title: 'Try it on your phone: Plaça de Catalunya',
        description: 'Opens the eight IFC models on the terrain of Barcelona with the live layers. Works in mobile Safari and Chrome.',
        poster: 'blog/images/barcelona-digital-twin-open-data-capture.jpg',
        posterAlt: 'Plaça de Catalunya digital twin in IFC Viewer Online, with IFC models on the 3D map of Barcelona',
        launchLabel: 'Open the live twin',
        hint: 'On a phone, give it a few seconds: the terrain and the models load one after another. Open Data BCN can take 15 to 40 s to answer.',
      },
      { type: 'h2', text: 'What is in the demo' },
      { type: 'p', text: ['Eight georeferenced IFC models (a Bicing station, the fountains, a monument, metro entrances, an EV charger) stand on the terrain of the square, with the OpenStreetMap city around them. Bike-share, charging, traffic and air quality come straight from Barcelona\'s open data', { cite: 'opendata-bcn' }, ' to the visitor\'s browser. How the scene is built is in ', { text: 'the Barcelona digital twin from open data', to: 'barcelona-digital-twin-open-data' }, '.'] },
      { type: 'h2', text: 'The limit you cannot see: memory in mobile Safari' },
      { type: 'p', text: 'On a desktop, a heavy page gets slow. On an iPhone, it gets ended. iOS gives each tab a memory budget, and when a page goes over it, the system closes the tab\'s process. The page receives no event and no error. Safari shows a short notice that the page was reloaded because a problem occurred, and starts it again from the top.' },
      { type: 'p', text: ['Apple does not publish a fixed limit, and a web page cannot ask: the Device Memory API that Chrome supports is not available in Safari.', { cite: 'webkit-memory' }, ' So the viewer does not try to guess the number. It treats every iPhone and iPad, and every phone, as a device with tight memory.'] },
      { type: 'p', text: 'What fills memory in a city twin is not one big thing. It is the map tiles kept for when you pan back, the terrain, the 3D buildings around the models, the trees and street furniture, and the IFC geometry itself, all at the same time.' },
      { type: 'h2', text: 'How the viewer adapts on a phone' },
      {
        type: 'table',
        headers: ['', 'Desktop', 'Phone or tablet'],
        rows: [
          ['Map tiles kept in memory', 'Up to 300', 'Up to 80'],
          ['Tile resolution', 'Follows the screen density', 'Planned at normal density'],
          ['Decorative objects (trees, furniture, boats)', 'Full', 'A quarter'],
          ['Georeferencing of the models', 'In parallel', 'One model at a time'],
        ],
        caption: 'What changes on devices the viewer treats as low on memory: all phones and tablets, and computers that report 4 GB or less.',
      },
      { type: 'p', text: 'None of this removes the models or the live data. The buildings, the terrain and the IFC stay; what goes is the part of the scene that only decorates it.' },
      { type: 'h3', text: 'Safe map mode, after a crash' },
      { type: 'p', text: 'Even with a lighter map, an older phone can run out of memory. The usual result is worse than the crash itself: the page reloads, restores the same heavy layers from your saved settings, and is ended again.' },
      { type: 'p', text: 'So just before the heavy layers start, the page leaves a note for that tab. If the map stays stable for 20 seconds, or you leave the page normally, the note is removed. If the page starts and the note is still there, the previous attempt died. That load opens in safe map mode: no terrain, no 3D buildings, no vehicles, extra layers off, a simple context. It applies only to that tab and that visit; your saved settings are not touched, and you can turn the layers back on one by one.' },
      { type: 'callout', variant: 'info', title: 'Large IFC files on a phone', text: 'Converting a big IFC on the phone itself takes several times the file\'s size in memory. Above 80 MB the viewer warns you before it starts. For the demo this does not apply: its models are small.' },
      { type: 'h2', text: 'Tips for opening a twin on a phone' },
      {
        type: 'steps',
        items: [
          { title: 'Close other heavy tabs', body: 'Tabs share the phone\'s memory. A map or video in another tab leaves less for the twin.' },
          { title: 'Start with the models, then add layers', body: 'Open the scene, wait for the models, then turn on 3D buildings or extra layers if you need them.' },
          { title: 'Use landscape for the map', body: 'More of the square fits, and the panels take less of the view.' },
          { title: 'If Safari reloads, let safe mode load', body: 'Then turn on only the layer you need for what you want to show.' },
        ],
      },
      { type: 'p', text: ['Opening your own IFC on a phone works the same way, without the city around it. On folding phones the model and its data can sit on separate screens: see ', { text: 'an IFC viewer for foldable phones', to: 'foldable-phone-ifc-viewer' }, '. For what makes a city twin more than a 3D map, read ', { text: 'what an urban digital twin is, with live examples', to: 'urban-digital-twin-live-examples' }, '.'] },
      { type: 'related', to: 'barcelona-digital-twin-open-data', why: 'How the Barcelona scene is built: the models, the four open feeds and the bindings that colour them.' },
      { type: 'tool', id: 'viewer', why: 'Open your own IFC on a phone, in the browser.' },
    ],
  },
]
