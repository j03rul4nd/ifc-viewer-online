import type { BlogPost } from './blog-posts'

// The 3D sketch studio (docs/SKETCH_STUDIO.md). The drawings are plotted by
// lib/sketch/showcase.ts in the real engine, and the captions say so: nobody drew
// them by hand. Hardware claims stay at what was tested, which is emulation.

const shot = (name: string, width: number, height: number) => ({
  type: 'image' as const,
  src: `blog/images/${name}.jpg`,
  srcSet: [
    { src: `blog/images/${name}-800.jpg`, width: 800 },
    { src: `blog/images/${name}.jpg`, width },
  ],
  sizes: '(max-width: 860px) 100vw, 820px',
  width,
  height,
})

const hero = (name: string) => ({
  heroImage: `blog/images/${name}-1600x900.jpg`,
  heroImageVariants: [
    { src: `blog/images/${name}-1600x900.jpg`, width: 1600, height: 900 },
    { src: `blog/images/${name}-1200x900.jpg`, width: 1200, height: 900 },
    { src: `blog/images/${name}-1200x1200.jpg`, width: 1200, height: 1200 },
  ],
})

const labels = {
  orbit: 'Turn', draw: 'Draw', replay: 'Replay', undo: 'Undo', open: 'Open in the studio',
  plane: 'Drawing plane', ground: 'Ground', front: 'Front', side: 'Side',
  filter: 'Layer filter', original: 'Original', blueprint: 'Blueprint', wash: 'Wash', chalk: 'Chalk', neon: 'Neon', faded: 'Faded',
  hintOrbit: 'Drag sideways to turn it. Your lines stay in 3D.',
  hintDraw: 'Draw on the plane, then press Turn and look from the side.',
  noGpu: 'This browser could not start WebGL, so the live drawing cannot run here.',
}

export const SKETCH_POSTS_EN: BlogPost[] = [
  {
    slug: '3d-sketching-online-draw-in-3d',
    date: '2026-11-01',
    dateModified: '2026-11-01',
    author: 'IFC Viewer Team',
    category: 'Tools & comparisons',
    categorySlug: 'tools',
    title: '3D Sketching Online: Draw in 3D Space with a Pen or Finger, in the Browser',
    seoTitle: '3D Sketching Online: Draw in 3D in Your Browser, Free',
    seoDescription: 'Draw lines that stay in 3D, with pressure, layers and filters, on a phone, tablet or pen display. Free in the browser. Try the live drawing on this page.',
    excerpt: 'A 2D sketch shows one view. Here each line keeps its place in space, so you can turn the idea round and keep drawing from the new side. Turn and draw on the live example, with nothing to install.',
    readTimeMin: 6,
    ...hero('3d-sketch-twisted-tower-browser'),
    heroAlt: 'Twisting tower with a glowing diagrid and the path of the sun, drawn as 3D lines on a black background',
    keywords: ['3D sketching online', 'draw in 3D online', '3D drawing app browser', '3D sketch app tablet', 'free 3D sketching', 'sketch in 3D with pen', 'concept sketching 3D', '3D sketch export Blender', '3D sketching for architects'],
    faqs: [
      { q: 'What is 3D sketching?', a: 'Drawing freehand lines that are stored with a position in space rather than as pixels on a sheet. You draw on a plane, move or turn that plane, and the lines stay where you put them when the view rotates.' },
      { q: 'Do I need to install anything or make an account?', a: 'No. The studio runs in the browser and keeps your drawing in that browser, on your device. That also means clearing the browser data can remove it, so export anything you want to keep.' },
      { q: 'Does it support pen pressure?', a: 'Yes, through the browser\'s Pointer Events: pressure, tilt, the barrel button and the eraser end, where the browser and pen report them. We tested with synthetic pen input in Chromium, not with physical pens yet.' },
      { q: 'Can I take a sketch into Blender, Krita or Procreate?', a: 'Blender gets a script that rebuilds the strokes as curves, tested in Blender 4.5. Krita and GIMP read OpenRaster, and PSD is there for apps that read it. We checked those files with other software, but have not yet opened them in Procreate, Krita, Sketchbook or Clip Studio.' },
      { q: 'Is it a 3D modelling tool?', a: 'No. It makes lines, not solids. It is for working out an idea quickly, before anyone models it.' },
    ],
    references: [
      { id: 'feather', title: 'Feather: free app for drawing in 3D with pen and touch', source: '80 Level', url: 'https://80.lv/articles/feather-free-app-for-drawing-in-3d-with-pen-and-touch/', note: 'A 3D sketching app.' },
      { id: 'penzil', title: 'Penzil: web-based 3D sketching', source: 'CGPress', url: 'https://cgpress.org/archives/penzil-web-based-3d-sketching.html', note: 'An earlier browser-based concept sketching tool.' },
      { id: 'pointer', title: 'Pointer events', source: 'MDN Web Docs', url: 'https://developer.mozilla.org/en-US/docs/Web/API/Pointer_events', note: 'The browser API behind pressure and tilt.' },
    ],
    content: [
      { type: 'p', text: 'Paper fixes your viewpoint before you start. If the idea needs seeing from the side, you draw it again. In 3D sketching each line keeps its place in space, so you turn the drawing and carry on. Try it below: it is the real engine, not a video.' },
      { type: 'sketch-demo', scene: 'tower', title: 'Turn this tower, then draw on it', description: 'It replays line by line. Drag to turn it, press Draw to add your own lines, and try a filter. Nothing you do here is stored.', poster: 'blog/images/3d-sketch-demo-tower.jpg', posterAlt: 'Twisting tower of glowing 3D lines, ready to replay in the browser', launchLabel: 'Start the live drawing', labels },
      { type: 'takeaways', items: [
        'Every line stays in 3D: turn the view and it holds its place.',
        'You draw on a plane you can move, so depth stays under control.',
        'Pressure, stabilizer, layers, blend modes and filters are all there.',
        'It runs in the browser, and the drawing stays on your device.',
      ] },
      { type: 'callout', variant: 'info', title: 'How these drawings were made', text: 'The drawings in this article are plotted by code in the studio\'s own engine, with a hand\'s wobble and pressure added. They show what the engine can display, not something a person drew in five minutes.' },

      { type: 'h2', text: 'How drawing in 3D stays under control' },
      { type: 'p', text: 'A pen moves in two dimensions, so something has to supply the third. That something is the drawing plane, and most of the studio\'s touch design is about making it quick to place.' },
      { type: 'steps', items: [
        { title: 'Pick a plane, or leave it on Auto', body: 'Ground, front or side are one press away. On Auto, each stroke lands on the plane that faces you most.' },
        { title: 'Start from a line you already drew', body: 'A stroke that begins at the end of another line carries the plane to that point, so the next wall grows from the corner.' },
        { title: 'Turn with two fingers', body: 'Two fingers either orbit or pinch, never both in one gesture. Home brings you back if you get lost.' },
      ] },
      { ...shot('3d-sketch-ruled-shell-pavilion', 1600, 900), alt: 'Pencil sketch of a pavilion with three saddle-shaped roofs made of straight ruled lines, with columns, setting-out grid and shadow', caption: 'Three saddle roofs from straight lines, with pencil and a multiply marker layer. Plotted by code in the studio\'s engine.' },

      { type: 'h2', text: 'The line: what happens between pen and screen' },
      { type: 'p', text: ['The studio reads pressure and tilt through ', { text: 'Pointer Events', cite: 'pointer' }, ', applies your pressure curve, then steadies the line with a stabilizer of the kind Krita and Clip Studio offer. Hold still at the end of a stroke and it snaps to a straight line, an ellipse or a rectangle. A pen with no pressure sensor, or a finger, uses speed instead.'] },
      { ...shot('3d-sketch-studio-tablet-layers', 1600, 1112), alt: 'The 3D sketch studio at tablet size, with tools, plane bar, layers, blend modes and filters beside a drawing of a twisting tower', caption: 'The real studio at a tablet\'s size, emulated in Chromium: tools, plane bar, four layers, blend modes and filters.' },

      { type: 'h2', text: 'Layers and filters, without losing the 3D' },
      { type: 'p', text: 'Each layer has opacity, a blend mode and filters: hue, saturation, brightness, soft edge, grain, glow and duotone. They never touch the lines, so you can change them at any time, and they follow the drawing as it turns.' },
      { ...shot('3d-sketch-layer-filters-compared', 1600, 600), alt: 'The same city drawing six times, with the original look and the Blueprint, Wash, Chalk, Neon and Faded filters', caption: 'One drawing, six looks. Top: no filter, Blueprint, Wash. Bottom: Chalk, Neon, Faded.' },
      { type: 'callout', variant: 'warning', title: 'What it does not do', text: 'Strokes are 3D lines, not painted pixels, so there is no smudging, flood fill or clipping mask. If you want to paint, export a PSD and finish it in a painting app.' },

      { type: 'h2', text: 'Where it fits among 3D sketching tools' },
      { type: 'p', text: ['This is not a new category: ', { text: 'Feather', cite: 'feather' }, ' is a dedicated 3D sketching app, and ', { text: 'Penzil', cite: 'penzil' }, ' showed the idea in a browser years ago. What sets this one apart is what sits next to it: the same site opens IFC building models, so you can ', { text: 'sketch over a real project', to: 'sketch-over-ifc-bim-model-redline' }, '.'] },
      { type: 'table', headers: ['Export', 'Opens in', 'Keeps'], rows: [
        ['PNG or a share card', 'Anywhere, Instagram Stories, LinkedIn', 'The look, filters included'],
        ['PSD', 'Apps that read PSD', 'Layers, opacity, blend modes, baked filters'],
        ['OpenRaster (.ora)', 'Krita, GIMP', 'Layers, opacity, blend modes, baked filters'],
        ['SVG', 'Vector editors', 'Lines and blend modes, not filters'],
        ['Blender script (.py)', 'Blender', 'Strokes as 3D curves, not filters'],
      ] },

      { type: 'h2', text: 'What we have and have not tested' },
      { type: 'p', text: 'We tested the studio in Chromium with synthetic pen and touch input at phone, foldable and tablet sizes. The Blender script ran in Blender 4.5, and the PSD and OpenRaster files were read by other software. We have not yet tried it with physical pens or on physical devices, so gesture thresholds may need adjusting.' },
      { type: 'tool', id: 'sketch', why: 'Start with an empty page, or carry on from the drawing above.' },
    ],
  },
  {
    slug: 'sketch-over-ifc-bim-model-redline',
    date: '2026-11-01',
    dateModified: '2026-11-01',
    author: 'IFC Viewer Team',
    category: 'Delivery & ISO 19650',
    categorySlug: 'delivery',
    title: 'Sketch Over an IFC Model in 3D: Redlines and Ideas That Stay Where You Drew Them',
    seoTitle: 'Sketch Over an IFC Model in 3D: Redlines in the Browser',
    seoDescription: 'Open an IFC model, then redline it in 3D with a pen or finger: clouds, arrows, proposals that hold their place as you orbit. Free, in the browser.',
    excerpt: 'A marked-up screenshot works from one angle only. Sketch on the model itself and the redline stays on the corner it refers to, from every side. Try it on the live example, then with your own IFC.',
    readTimeMin: 5,
    ...hero('3d-sketch-redlines-over-ifc-model'),
    heroAlt: 'Duplex IFC model with red revision clouds and an orange sketched extension drawn in 3D around it',
    keywords: ['sketch over BIM model', 'sketch over IFC model', 'IFC redline', '3D redline BIM', 'BIM markup tablet', 'mark up IFC model', 'design review sketch 3D', 'sketch on point cloud'],
    faqs: [
      { q: 'How do I sketch over my IFC model?', a: 'Open the model in the viewer, choose View, then 3D sketch. The studio opens in a new tab with the model as a backdrop. With the plane tool, press a face to put the drawing plane on it, then draw.' },
      { q: 'Is my model uploaded?', a: 'No. The model is prepared in your browser and passed to the studio tab in the same browser. Neither the file nor the sketch goes to a server.' },
      { q: 'Does the sketch change the IFC file?', a: 'No. The sketch is a separate drawing and the IFC stays as it was. It does not become IFC elements either.' },
      { q: 'Can I sketch over a point cloud?', a: 'Yes. Scans open in the viewer travel to the studio in the same way, and the lines sit among the points.' },
      { q: 'Can I show it in a meeting?', a: 'Yes. Presenting mode has a laser pointer and a separate audience window to share in Meet, Zoom or Teams, and a read-only link sends a snapshot of the page. Drawing together live is not available.' },
    ],
    references: [
      { id: 'tuw', title: 'From sketching to BIM: generating IFC-based models from 4D semantic sketches', source: 'TU Wien', url: 'https://repositum.tuwien.at/handle/20.500.12708/188981', note: 'Research on turning tablet sketches into IFC.' },
      { id: 'osarch', title: '3D concept sketching with Grease Pencil and IFC', source: 'OSArch Community', url: 'https://community.osarch.org/discussion/143', note: 'Practitioners discussing 3D sketches alongside IFC.' },
    ],
    content: [
      { type: 'p', text: 'In a design review, someone takes a screenshot, draws a red circle and sends it round. A week later, nobody remembers which corner it meant. Draw on the model in 3D instead and the mark stays on that corner, from every angle. Below, the same idea runs live on a simple line drawing of a building.' },
      { type: 'sketch-demo', scene: 'markup', title: 'Redline this building', description: 'A grey line drawing stands in for the model here, with red clouds and an orange proposal on top. Turn it to see them hold their place, then press Draw and add your own.', poster: 'blog/images/3d-sketch-demo-markup.jpg', posterAlt: 'Line drawing of a building with red revision clouds, an arrow and an orange canopy sketched on it', launchLabel: 'Start the live redline', labels },
      { type: 'takeaways', items: [
        'Redlines sit in the model\'s space, so they mean the same from any angle.',
        'A press on a face puts the drawing plane on that wall or slab.',
        'Your IFC stays in your browser and is not modified.',
        'It is for marking up and proposing: it does not create IFC elements.',
      ] },

      { type: 'h2', text: 'From your IFC to a sketch' },
      { type: 'steps', items: [
        { title: 'Open the model', body: 'Drop one IFC or several into the viewer. Several models travel together.' },
        { title: 'View, then 3D sketch', body: 'The studio opens in a new tab with your models as a backdrop you can turn, show or hide.' },
        { title: 'Set the plane from the model', body: 'With the plane tool, press a face and the plane lies on it. Draw clouds, arrows and proposals on separate layers, one per topic.' },
        { title: 'Share it', body: 'Export an image, send a read-only link, or present it with the laser and audience window.' },
      ] },
      { ...shot('3d-sketch-redlines-over-ifc-model-1600x900', 1600, 900), srcSet: [{ src: 'blog/images/3d-sketch-redlines-over-ifc-model-800x450.jpg', width: 800 }, { src: 'blog/images/3d-sketch-redlines-over-ifc-model-1600x900.jpg', width: 1600 }], alt: 'The public Duplex IFC sample model in grey, with red revision clouds on its facade, an arrow, a setting-out line and an orange proposed extension and roof volume', caption: 'A real IFC, the public Duplex sample, in the studio. The redlines were placed by a script and are an invented example, not a review of this building.' },

      { type: 'h2', text: 'Where this sits next to BCF' },
      { type: 'p', text: 'BCF records an issue with a viewpoint, an owner and a status, so that it can be tracked between tools. A sketch cannot do that, and does not try. It is for the earlier moment, when you are still working out what you mean. Once it is decided, raise the issue in BCF and attach the image.' },
      { type: 'table', headers: ['You need to', 'Use'], rows: [
        ['Point at a problem from one angle, quickly', 'A marked-up screenshot'],
        ['Explain something in space, or propose a shape', 'A 3D sketch over the model'],
        ['Track who fixes what, across tools', 'BCF'],
        ['Change the design itself', 'Your authoring tool'],
      ] },

      { type: 'h2', text: 'Over a point cloud' },
      { type: 'p', text: 'Sketching over a survey helps where a model would not exist yet: what stays, what goes, where a new route could run. Lines are always drawn on top, so they stay readable among the points.' },
      { ...shot('3d-sketch-redlines-over-point-cloud', 1600, 900), alt: 'Colour point cloud of a laboratory floor, about a million points, with red revision clouds and a yellow arrow drawn over it', caption: 'A real scan of about a million points (CRAS Labs @ FEUP), with redlines placed by a script as an example.' },

      { type: 'h2', text: 'What it does not do yet' },
      { type: 'p', text: ['Sketches do not become IFC elements. Turning strokes into BIM objects is an active ', { text: 'research topic', cite: 'tuw' }, ', and people have long combined ', { text: 'Grease Pencil with IFC', cite: 'osarch' }, ' in Blender, but we do not offer that conversion. Live drawing with several people at once is not available either. Very large models depend on your device\'s memory, and we have not yet tried this on physical tablets.'] },
      { type: 'tool', id: 'viewer', why: 'Open your IFC, then choose View, 3D sketch.' },
    ],
  },
  {
    slug: 'digital-twin-infrastructure-concept-sketch',
    date: '2026-11-01',
    dateModified: '2026-11-01',
    author: 'IFC Viewer Team',
    category: 'Digital twins',
    categorySlug: 'digital-twins',
    title: 'Sketching a Digital Twin Before You Build It: Bridges, Sensors and Flood Lines in 3D',
    seoTitle: 'Sketch a Digital Twin in 3D: Bridges, Sensors, Flood Lines',
    seoDescription: 'Agree what a digital twin should show before building it: sketch sensors, data links and flood lines in 3D, in a browser. Try the live bridge and city.',
    excerpt: 'Most twin projects begin with a diagram of boxes that nobody can place on the asset. Draw the idea in space instead: which gauge, which span, how far the water reaches. Turn the live bridge and city, and add to them.',
    readTimeMin: 5,
    ...hero('3d-sketch-cable-stayed-bridge-monitoring'),
    heroAlt: 'Blueprint-style 3D sketch of a cable-stayed bridge with amber sensors along the deck and a strain curve floating above it',
    keywords: ['digital twin concept sketch', 'digital twin sketch', 'infrastructure concept sketch 3D', 'bridge monitoring sketch', 'structural health monitoring concept', 'urban digital twin idea', 'sketch sensors on 3D model', 'digital twin workshop'],
    faqs: [
      { q: 'Why sketch a digital twin at all?', a: 'A sketch costs minutes. It makes people say which sensor goes where and what they want to see, before anyone connects a data source. Disagreements come out early, when they are cheap.' },
      { q: 'Are the sensors and readings in these drawings real?', a: 'No. They are drawn lines illustrating an idea. The sketch connects to nothing, and the curve above the bridge is invented. Live data belongs in the digital twin itself.' },
      { q: 'Can I sketch over my own city or asset model?', a: 'Yes, if you have it as a model or scan open in the viewer: choose View, then 3D sketch. It then appears as a backdrop you can draw over.' },
      { q: 'Is this a flood or structural analysis?', a: 'No. The contours and curves here are drawn and calculate nothing. The site has a separate flood simulation for that purpose, with its own stated limits.' },
    ],
    content: [
      { type: 'p', text: 'A digital twin workshop usually ends with boxes and arrows on a slide, and the question of what goes where is still open. Sketching in space forces the concrete answer: this gauge, on this span, showing this curve. Turn the bridge below and add what you think is missing.' },
      { type: 'sketch-demo', scene: 'bridge', title: 'A monitored bridge you can turn and redraw', description: 'A cable-stayed crossing with gauges on the deck and a curve of readings above it. All of it is drawn, not measured. Press Draw to add your own sensor or route.', poster: 'blog/images/3d-sketch-demo-bridge.jpg', posterAlt: 'Cable-stayed bridge drawn in white and blue lines with amber sensor points, ready to replay', launchLabel: 'Start the live bridge', labels },
      { type: 'takeaways', items: [
        'Put each sensor, feed and alert on the asset before choosing any platform.',
        'One layer per idea: structure, monitoring, risk. Switch them on as you talk.',
        'Filters separate those layers at a glance, and never change the lines.',
        'A sketch shows intent: it holds no data and calculates nothing.',
      ] },
      { type: 'callout', variant: 'info', title: 'Illustrations, not engineering', text: 'These drawings are plotted by code in the studio\'s engine to show the method. The bridge, the city, the readings and the water are invented, and none of them is a design or an analysis.' },

      { type: 'h2', text: 'A way to run the session' },
      { type: 'steps', items: [
        { title: 'Start from what exists', body: 'Bring in a model or scan of the asset. Otherwise, sketch its main lines on a base layer and lock it.' },
        { title: 'One question per layer', body: 'What do we measure? What decision does it support? What happens when it goes wrong? Each answer gets a layer and a colour.' },
        { title: 'Save the angles that matter', body: 'Saved views take the group straight back to the deck, the pylon or the low corner of the site.' },
        { title: 'Present, then send', body: 'Use the laser and audience window in the call, then send a read-only link or an image with the minutes.' },
      ] },

      { type: 'h2', text: 'From one asset to a whole district' },
      { type: 'p', text: 'At city scale, the useful question changes from which gauge to which connections. Arcs between buildings show what talks to what, and contours show who is affected when something happens. It is rough on purpose: it should invite someone to take the pen and correct it.' },
      { ...shot('3d-sketch-city-digital-twin-data-flood', 1600, 900), alt: 'Wireframe city district in blue with glowing magenta and yellow data arcs between towers and cyan water contours in one corner', caption: 'A district as a twin idea: buildings, data links and how far water might reach. All invented, plotted by code in the studio\'s engine.' },
      { type: 'sketch-demo', scene: 'city', title: 'A district to argue over', description: 'Turn it, try Blueprint or Chalk, and draw the link you think is missing. Nothing is sent or stored.', poster: 'blog/images/3d-sketch-demo-city.jpg', posterAlt: 'Wireframe city with glowing data arcs, ready to replay in the browser', launchLabel: 'Start the live district', labels },

      { type: 'h2', text: 'What comes after the sketch' },
      { type: 'p', text: ['Once people agree on what the twin should show, it needs real data. The ', { text: 'live urban twin examples', to: 'urban-digital-twin-live-examples' }, ' show what that looks like running in a browser, and ', { text: 'BIM vs digital twin', to: 'bim-vs-digital-twin' }, ' sets out what each one holds. The sketch stays useful as the record of what was intended.'] },
      { type: 'tool', id: 'sketch', why: 'Start your own: a blank page, or a model from the viewer.' },
    ],
  },
]
