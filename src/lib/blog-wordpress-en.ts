import type { BlogPost, ContentBlock } from './blog-posts'

// Two posts written on 2026-11-21, the day the WordPress plugin went live in
// the wordpress.org directory (slug bimo-ifc-viewer, v1.1.0).
//
// 1. ifc-viewer-wordpress-plugin — install, block, shortcode, Media Library,
//    a worked example, what is sent where (the readme's external-service note).
// 2. bim-models-on-wordpress-website — the same plugin for architects and
//    contractors: federated models, map, sun study, plan cut, client layout,
//    digital twin scenes, each as a shortcode recipe.
// Everything described is in integrations/wordpress/bimo-ifc-viewer (readme.txt
// and the shortcode attributes in bimo-ifc-viewer.php). Pictures are captures
// of the plugin on a local WordPress (content/wordpress-plugin/).
// One query, one page: embedding with a bare iframe, Power BI or the SDK stays
// with embed-ifc-viewer-website.

const DATE = '2026-11-21'
const PLUGIN = 'https://wordpress.org/plugins/bimo-ifc-viewer/'

const shot = (name: string, w: number, h: number, alt: string, caption: string): ContentBlock => ({
  type: 'image',
  src: `blog/images/${name}.jpg`,
  alt,
  caption,
  width: w,
  height: h,
  srcSet: w >= 1200
    ? [{ src: `blog/images/${name}-800.webp`, width: 800 }, { src: `blog/images/${name}.webp`, width: w }]
    : [{ src: `blog/images/${name}.webp`, width: w }],
  sizes: '(max-width: 860px) 100vw, 820px',
  credit: 'IFC Viewer Online',
})

export const WORDPRESS_POSTS_EN: BlogPost[] = [
  // ── Launch / how-to ──────────────────────────────────────────────────────
  {
    slug: 'ifc-viewer-wordpress-plugin',
    title: 'How to Show IFC Models on WordPress: the Free Bimo IFC Viewer Plugin',
    seoTitle: 'Show IFC Models on WordPress with a Free Plugin',
    seoDescription: 'Install Bimo IFC Viewer from the WordPress directory, upload .ifc files to the Media Library and embed them with a block or a shortcode.',
    excerpt: 'Our WordPress plugin is now in the official directory. Install it, upload an .ifc file to the Media Library and place it in a post with a block or a shortcode. Visitors orbit and measure the model in their browser.',
    date: DATE,
    dateModified: DATE,
    author: 'IFC Viewer Online',
    category: 'Tools & comparisons',
    categorySlug: 'tools',
    readTimeMin: 6,
    heroImage: 'blog/images/ifc-viewer-wordpress-plugin-1600x900.jpg',
    heroAlt: 'The IFC Viewer block in the WordPress editor, with an IFC model chosen from the Media Library',
    heroCredit: 'IFC Viewer Online',
    keywords: ['IFC viewer WordPress', 'WordPress IFC plugin', 'show IFC model on WordPress', 'BIM viewer WordPress plugin', 'embed IFC WordPress', 'upload IFC to WordPress'],
    references: [
      { id: 'plugin', title: 'Bimo IFC Viewer', source: 'WordPress.org Plugin Directory', year: '2026', url: PLUGIN, note: 'The plugin page: install, readme, changelog and support forum.' },
    ],
    faqs: [
      { q: 'Does the plugin cost anything?', a: 'No. The plugin and the viewer it embeds are free.' },
      { q: 'Where are my models stored?', a: 'In your own Media Library, like any other file. The viewer runs in the visitor\'s browser and reads the file from your site; it is not uploaded to IFC Viewer Online.' },
      { q: 'Can I show a model in a private or password-protected post?', a: 'No. The plugin serves a model file only when the post it is attached to is published and has no password, so the viewer cannot read it from a private post.' },
      { q: 'My model is on another site and does not load. Why?', a: 'A model at another site\'s URL loads only if that site allows cross-origin requests (CORS). Files from your own Media Library always work.' },
    ],
    content: [
      { type: 'p', text: ['Bimo IFC Viewer, the WordPress plugin of IFC Viewer Online, is now in the official WordPress plugin directory', { cite: 'plugin' }, '. Bimo is our mascot; the plugin is the same free viewer you use on this site, placed in your own posts and pages.'] },
      { type: 'p', text: 'With it, a visitor to your website can orbit, measure and inspect an IFC model in the browser, without installing anything and without an account. This guide covers installing it, the block, the shortcode and what is sent where.' },
      {
        type: 'takeaways',
        items: [
          'Install it from Plugins → Add New: search for "Bimo IFC Viewer".',
          'The plugin lets you upload .ifc files to the Media Library, which WordPress blocks by default.',
          'Use the IFC Viewer block in the block editor, or the [ifc_viewer] shortcode in classic themes and page builders.',
          'The model is read from your site by the visitor\'s browser. It is not uploaded to us.',
        ],
      },
      { type: 'h2', text: 'Install the plugin' },
      {
        type: 'steps',
        items: [
          { title: 'Open Plugins → Add New', body: 'In the WordPress admin, search for "Bimo IFC Viewer" and click Install Now.' },
          { title: 'Activate it', body: 'There is no settings page: the plugin adds a block, a shortcode and support for .ifc files in the Media Library.' },
          { title: 'Add the IFC Viewer block', body: 'Edit a post or page, add the IFC Viewer block and choose one or more IFC files from the Media Library.' },
        ],
      },
      { type: 'p', text: ['If you manage plugins by hand, you can also download it from the ', { text: 'plugin page on WordPress.org', href: PLUGIN }, ' and upload the bimo-ifc-viewer folder to /wp-content/plugins/.'] },
      { type: 'h2', text: 'The IFC Viewer block' },
      { type: 'p', text: 'The block has a Model panel: choose IFC files from the Media Library, or paste https addresses of .ifc files. Below it are point clouds, the height of the viewer and the panels for display, site, sun and plans, and digital twin.' },
      shot('wordpress-ifc-block-editor-model-panel', 1600, 1000, 'The IFC Viewer block in the WordPress block editor, with the Model panel open in the sidebar', 'The block settings: files from the Media Library or https addresses, point clouds and height.'),
      { type: 'p', text: 'By default the block uses the article layout: a clean viewer that fits in a post, with the model\'s Health Score from our free validator shown on load. You can turn the score off.' },
      shot('wordpress-ifc-article-embed', 1292, 1122, 'An IFC model embedded in a WordPress post with the article layout', 'A model in a post, with the article layout.'),
      { type: 'h2', text: 'The [ifc_viewer] shortcode' },
      { type: 'p', text: 'For classic themes and page builders, the shortcode does the same as the block. The simplest form takes the ID of the file in the Media Library and a height in pixels:' },
      { type: 'code', lang: 'text', text: '[ifc_viewer attachment="123" height="600"]' },
      { type: 'p', text: 'The ID is the number in the address when you open the file in the Media Library (post=123). Several IDs, separated by commas, load as one federated scene.' },
      { type: 'h3', text: 'A worked example' },
      { type: 'p', text: 'Say you publish a project page for a small office building. The architecture and structure models are files 123 and 124 in the Media Library. You want them to open from the top, in Spanish, with your brand colour, and to rotate slowly until the visitor touches them:' },
      { type: 'code', lang: 'text', text: '[ifc_viewer attachment="123,124" name="Architecture,Structure" view="top" lang="es" accent="#0a8481" turntable="1" height="640"]' },
      {
        type: 'table',
        headers: ['Attribute', 'What it does'],
        rows: [
          ['attachment', 'Media Library IDs, comma-separated'],
          ['model', 'https addresses of .ifc files, comma-separated'],
          ['name', 'Display names, in the same order as the models'],
          ['view', 'Starting view: iso, top, front, back, left, right, bottom'],
          ['lang', 'Interface language: en, es, ca, de, fr, it, pt, ja, zh, th'],
          ['accent', 'Accent colour as a hex code'],
          ['turntable', '1 to rotate the model, or degrees per second'],
          ['validate', '0 to hide the Health Score'],
          ['wheel', 'ctrl (default) zooms only with Ctrl + wheel, so the page still scrolls; always zooms with the wheel'],
          ['height', 'Height in pixels, from 200 to 2000'],
        ],
        caption: 'The most used attributes. The full list is in the plugin readme.',
      },
      { type: 'callout', variant: 'tip', title: 'Models from another site', text: 'With model="https://…" the file can live anywhere, but the other site must allow cross-origin requests (CORS). Files from your own Media Library always work: the plugin serves them with the header the viewer needs.' },
      { type: 'h2', text: 'How large can a model be?' },
      { type: 'p', text: 'As large as your host lets you upload. The viewer streams and parses the file in the visitor\'s browser; models of a few hundred megabytes open on a desktop computer. Phones have less memory, so for a public page a lighter export is kinder to your visitors.' },
      { type: 'h2', text: 'Privacy: what is sent, and where' },
      { type: 'p', text: 'The plugin holds no copy of the viewer. When a visitor opens a page with the block or the shortcode, their browser loads the viewer in an iframe from www.ifcvieweronline.eu. The iframe address carries the block settings and the address of the model.' },
      { type: 'p', text: 'The visitor\'s browser then downloads the model straight from your site, or from the URL you gave. The file is not uploaded to IFC Viewer Online and we do not store it. Only when you turn on the map does the viewer load map tiles, terrain and building data from third-party map providers, listed in our privacy policy.' },
      { type: 'p', text: 'The plugin adds nothing to your pages except the embed: no scripts on the front end, no settings and no database tables. The file route serves a model only for published posts without a password.' },
      { type: 'h2', text: 'What next' },
      { type: 'p', text: ['The same plugin also puts several models on a real map, runs sun studies, opens a plan cut and embeds digital twin scenes. How architects and contractors use that, with a shortcode for each case, is in ', { text: 'BIM on your website: models, maps and sun studies on WordPress', to: 'bim-models-on-wordpress-website' }, '. Outside WordPress, the viewer embeds with a plain iframe: see ', { text: 'how to embed an IFC viewer in a website', to: 'embed-ifc-viewer-website' }, '.'] },
      { type: 'related', to: 'bim-models-on-wordpress-website', why: 'Federated models, the map, sun studies, plan cuts and client presentations, with shortcode recipes.' },
      { type: 'tool', id: 'embed', why: 'Not on WordPress? Embed the viewer on any site with one iframe.' },
    ],
  },

  // ── Use case ─────────────────────────────────────────────────────────────
  {
    slug: 'bim-models-on-wordpress-website',
    title: 'BIM on Your Website: IFC Models, Maps and Sun Studies on WordPress for Architects and Contractors',
    seoTitle: 'BIM Models on Your WordPress Site: Maps, Sun, Plans',
    seoDescription: 'Show federated IFC models on a map, a sun study, a plan cut or a digital twin scene on your WordPress site, with a shortcode for each case.',
    excerpt: 'A project page with screenshots shows a building. A project page with the model lets the client walk around it, see it on its street and check the shadows in June. Six recipes with the free WordPress plugin.',
    date: DATE,
    dateModified: DATE,
    author: 'IFC Viewer Online',
    category: 'Tools & comparisons',
    categorySlug: 'tools',
    readTimeMin: 7,
    heroImage: 'blog/images/bim-models-on-wordpress-website-1600x900.jpg',
    heroAlt: 'Federated IFC models shown on a city map inside a WordPress page',
    heroCredit: 'IFC Viewer Online',
    keywords: ['BIM model on website', 'IFC model WordPress architect', 'show BIM to client online', 'IFC model on map website', 'sun study website', 'construction project website 3D model'],
    references: [
      { id: 'plugin', title: 'Bimo IFC Viewer', source: 'WordPress.org Plugin Directory', year: '2026', url: PLUGIN, note: 'The plugin page: install, readme, changelog and support forum.' },
    ],
    faqs: [
      { q: 'Do my clients need an account or software?', a: 'No. The model opens in their browser on your page. They need nothing installed and no account.' },
      { q: 'Can I show architecture, structure and MEP together?', a: 'Yes. Pick several IFC files in the block, or list several IDs in the shortcode, and they load together as one scene.' },
      { q: 'Where does the map data come from?', a: 'From third-party map providers listed in the privacy policy of IFC Viewer Online. It is only loaded when you turn the map on.' },
      { q: 'Does the plugin cost anything?', a: 'No. The plugin and the viewer it embeds are free.' },
    ],
    content: [
      { type: 'p', text: 'Most project pages on architecture and construction websites are galleries: renders, a few site photos, perhaps a PDF. The IFC model, the most complete description of the project, stays on a hard drive.' },
      { type: 'p', text: ['The free Bimo IFC Viewer plugin for WordPress', { cite: 'plugin' }, ' puts that model on the page. Installing it and the basic block are covered in ', { text: 'how to show IFC models on WordPress', to: 'ifc-viewer-wordpress-plugin' }, '. This article is about what to do with it: six cases, each with a shortcode you can copy.'] },
      {
        type: 'takeaways',
        items: [
          'Several IFC files load together as one federated scene.',
          'The model can sit on a map with terrain and the surrounding buildings, in six looks.',
          'A sun study opens at the date and time you choose; a solar analysis shows a year of sun hours.',
          'The client layout and the plan cut are made for presenting, not for editing.',
        ],
      },
      { type: 'h2', text: '1. Architecture, structure and MEP in one scene' },
      { type: 'p', text: 'Each discipline usually delivers its own IFC. Upload them to the Media Library and pick them all in the block, or list their IDs in the shortcode. They load together, and the names you give appear in the viewer:' },
      { type: 'code', lang: 'text', text: '[ifc_viewer attachment="123,124,125" name="Architecture,Structure,MEP" height="640"]' },
      { type: 'h2', text: '2. The model on its street' },
      { type: 'p', text: 'A building makes more sense next to its neighbours. With the map turned on, the model stands on the map with terrain and the surrounding buildings. There are six looks: daylight, maquette, golden hour, night, blueprint and dawn.' },
      { type: 'code', lang: 'text', text: '[ifc_viewer attachment="123,124" map="terrain,buildings" look="golden"]' },
      shot('wordpress-ifc-federated-models-map', 1292, 1122, 'Two IFC models standing on a map of Plaça de Catalunya in Barcelona, embedded in a WordPress post', 'Federated models on the map, with terrain and buildings.'),
      { type: 'p', text: 'The model needs a location. If the IFC is not georeferenced, give it one with site="lat,lon".' },
      { type: 'h2', text: '3. A sun study for neighbours and planners' },
      { type: 'p', text: 'The question at a public consultation is often the same: will it shade us? The solar attribute opens the model with the sun at a given date and time, in the site\'s local time:' },
      { type: 'code', lang: 'text', text: '[ifc_viewer attachment="123" map="1" solar="06-21T19:30"]' },
      shot('wordpress-ifc-sun-study', 1292, 1242, 'A sun study at 19:30 on 21 June for a model on the Barcelona map, embedded in WordPress', 'The model opens with the sun of 21 June at 19:30, site time.'),
      { type: 'p', text: 'For more than one moment, the analysis attribute shows a year of sun hours (analysis="year") or the passive solar impact on the facades (analysis="year:passive").' },
      { type: 'h2', text: '4. A plan next to the 3D view' },
      { type: 'p', text: 'Many clients read plans better than 3D. With drawings="plan" the viewer opens with a 2D plan cut beside the model:' },
      { type: 'code', lang: 'text', text: '[ifc_viewer attachment="123" drawings="plan" ui="full"]' },
      shot('wordpress-ifc-plan-cut', 1435, 1522, 'A 2D plan cut of an IFC model in the Drawings panel of the viewer', 'The plan cut, with the sheet shown in 3D as well.'),
      { type: 'h2', text: '5. A presentation for the client' },
      { type: 'p', text: 'There are five layouts. Article is the clean default for posts; minimal shows even less; full is the whole app, with validation and tools; kiosk suits a screen in an office or a fair; client is made for presenting a project to a client.' },
      { type: 'code', lang: 'text', text: '[ifc_viewer attachment="123,124" ui="client" validate="0" turntable="1" title="Office building, Phase 2"]' },
      { type: 'p', text: 'validate="0" hides the Health Score, which is useful to the design team and rarely to a client.' },
      { type: 'h2', text: '6. A digital twin scene' },
      { type: 'p', text: 'A scene exported from IFC Viewer Online carries its own models, data layers, live sensors, map and camera. Host the scene file and give its address; explore="1" adds a scene explorer for visitors:' },
      { type: 'code', lang: 'text', text: '[ifc_viewer scene="https://example.com/port-twin.json" explore="1"]' },
      shot('wordpress-ifc-digital-twin-scene', 1292, 1242, 'A digital twin scene with live city data and a guided tour, embedded in WordPress', 'A digital twin scene with the explorer and a guided tour.'),
      { type: 'h2', text: 'Point clouds next to the model' },
      { type: 'p', text: 'For renovation or progress pages, a scan can load with the model. The scan attribute takes https addresses of LAS, LAZ, COPC, PLY or PCD files:' },
      { type: 'code', lang: 'text', text: '[ifc_viewer attachment="123" scan="https://example.com/scan.laz"]' },
      { type: 'h2', text: 'Before you publish' },
      {
        type: 'ul',
        items: [
          'Check the model on a phone. Models of a few hundred megabytes open on a desktop computer, but a lighter export is kinder to phone visitors.',
          'Make sure the model shows only what you want public. Anyone who opens the page can inspect its properties.',
          'Files from another site need CORS; files from your own Media Library always work, and only from published posts without a password.',
          'The interface comes in 10 languages: set lang to match the page.',
        ],
      },
      { type: 'p', text: ['Install the plugin from the ', { text: 'WordPress plugin directory', href: PLUGIN }, '. Questions and requests go to its support forum there.'] },
      { type: 'related', to: 'ifc-viewer-wordpress-plugin', why: 'Install the plugin, the block, the shortcode and what is sent where.' },
      { type: 'related', to: 'ifc-sun-shadow-study-online', why: 'How sun and shadow studies work on an IFC model.' },
      { type: 'tool', id: 'viewer', why: 'Try your model in the viewer before you publish it.' },
    ],
  },
]
