import type { BlogPost, ContentBlock, RichText } from './blog-posts'

// Three posts written on 2026-11-25, the day the Shopify app went to App Store
// review, about putting BIM products on the sites where they are sold:
//
// 1. ifc-shopify-product-viewer — the Shopify app (in review) and the free
//    copy-paste sections that work today. Facts from integrations/shopify:
//    README.md, app/METAFIELDS.md, listing/LISTING.md and FEATURE_TIERS in
//    build-extension.mjs (the source of truth for what each plan includes).
// 2. wordpress-bim-viewer-plugins-compared — four ways to show BIM/3D on
//    WordPress, ours included and disclosed. Only checkable facts about the
//    other options (formats, where the file lives).
// 3. ifc-vs-glb-product-pages — what a specifier gets from each format.
//
// The structure (blocks, code, links, images) lives here once; the text comes
// from a table. The English table is below; the nine translations sit in
// blog-i18n/integrations-<lang>.ts and are built with the same function, so a
// translation cannot drift from the English shape.

const DATE = '2026-11-25'
export const PLUGIN = 'https://wordpress.org/plugins/bimo-ifc-viewer/'
const SHOPIFY_DIR = 'https://github.com/j03rul4nd/ifc-viewer-online/tree/main/integrations/shopify'

const shopifyShot = (alt: string, caption: string): ContentBlock => ({
  type: 'image',
  src: 'blog/images/shopify-ifc-product-page.jpg',
  alt,
  caption,
  width: 1600,
  height: 900,
  srcSet: [{ src: 'blog/images/shopify-ifc-product-page-800.webp', width: 800 }, { src: 'blog/images/shopify-ifc-product-page.webp', width: 1600 }],
  sizes: '(max-width: 860px) 100vw, 820px',
  credit: 'IFC Viewer Online',
})

type Faq = { q: string; a: string }
type Meta = {
  title: string
  seoTitle: string
  seoDescription: string
  excerpt: string
  heroAlt: string
  keywords: string[]
  faqs: Faq[]
  refNote: string
}
type Step = { title: string; body: string }

/** Every word of the three posts, in one language. */
export type IntegrationText = {
  lang?: string
  category: string
  shopify: Meta & {
    intro1: RichText
    intro2: RichText
    takeaways: string[]
    whyH: string
    why1: string
    why2: string
    sectionH: string
    section1: RichText
    sectionSteps: Step[]
    sectionTable: { headers: string[]; rows: string[][]; caption: string }
    appH: string
    app1: string
    perProductH: string
    perProduct1: string
    perProduct2: string
    fastH: string
    fast1: string
    dataH: string
    data1: string
    data2: string
    imageAlt: string
    imageCaption: string
    setupCheck: string
    plansH: string
    plans1: string
    plansTable: { headers: string[]; rows: string[][]; caption: string }
    plans2: string
    ifcH: string
    ifc1: string
    ifcList: string[]
    ifc2: RichText
    publicTitle: string
    publicText: string
    beforeH: string
    beforeList: string[]
    next: RichText
    relGlb: string
    relWp: string
    toolWhy: string
  }
  compare: Meta & {
    intro1: string
    intro2: RichText
    takeaways: string[]
    criteriaH: string
    criteria: string[]
    bimoH: string
    bimo1: RichText
    bimo2: string
    bimo3: string
    viewer3dH: string
    viewer3d1: string
    viewer3d2: string
    a360H: string
    a3601: string
    a3602: string
    iframeH: string
    iframe1: string
    iframe2: string
    tableH: string
    table: { headers: string[]; rows: string[][]; caption: string }
    pickH: string
    pick: string[]
    disclosureTitle: string
    disclosure: string
    next: RichText
    relPlugin: string
    relGlb: string
    toolWhy: string
  }
  glb: Meta & {
    intro1: string
    intro2: string
    takeaways: string[]
    glbH: string
    glb1: string
    glb2: string
    ifcH: string
    ifc1: string
    ifcList: string[]
    tableH: string
    table: { headers: string[]; rows: string[][]; caption: string }
    sizeH: string
    size1: string
    size2: string
    fineH: string
    fine: string[]
    bothH: string
    both1: RichText
    both2: string
    checkH: string
    check: string[]
    tip: string
    next: RichText
    relShopify: string
    relCompare: string
    relPlugin: string
    toolWhy: string
  }
}

const base = (t: IntegrationText, slug: string, m: Meta, readTimeMin: number) => ({
  slug,
  title: m.title,
  seoTitle: m.seoTitle,
  seoDescription: m.seoDescription,
  excerpt: m.excerpt,
  date: DATE,
  dateModified: DATE,
  author: 'IFC Viewer Online',
  category: t.category,
  categorySlug: 'tools',
  readTimeMin,
  heroImage: `blog/images/${slug}-1600x900.jpg`,
  heroAlt: m.heroAlt,
  heroCredit: 'IFC Viewer Online',
  keywords: m.keywords,
  faqs: m.faqs,
  ...(t.lang ? { lang: t.lang, translationKey: slug } : {}),
})

/** The three posts in the language of `t`. */
export function buildIntegrationPosts(t: IntegrationText): BlogPost[] {
  const s = t.shopify
  const c = t.compare
  const g = t.glb
  return [
    {
      ...base(t, 'ifc-shopify-product-viewer', s, 8),
      references: [
        { id: 'shopify', title: 'IFC Viewer Online for Shopify', source: 'GitHub', year: '2026', url: SHOPIFY_DIR, note: s.refNote },
      ],
      content: [
        { type: 'p', text: s.intro1 },
        { type: 'p', text: s.intro2 },
        { type: 'takeaways', items: s.takeaways },
        { type: 'h2', text: s.whyH },
        { type: 'p', text: s.why1 },
        { type: 'p', text: s.why2 },
        { type: 'h2', text: s.sectionH },
        { type: 'p', text: s.section1 },
        { type: 'steps', items: s.sectionSteps },
        { type: 'code', lang: 'text', text: 'https://cdn.shopify.com/s/files/…/cw-50-architecture.ifc, https://cdn.shopify.com/s/files/…/cw-50-anchors.ifc' },
        { type: 'table', headers: s.sectionTable.headers, rows: s.sectionTable.rows, caption: s.sectionTable.caption },
        { type: 'h2', text: s.appH },
        { type: 'p', text: s.app1 },
        { type: 'h3', text: s.perProductH },
        { type: 'p', text: s.perProduct1 },
        { type: 'code', lang: 'text', text: 'custom.ifc_model     product, variant   URL or file   the IFC model\ncustom.ifc_poster    product            image         shown before the 3D opens\ncustom.bim_files     product            list of files RFA, DWG, datasheet PDF\nbim.u_value          product            any value     a row in the technical data table' },
        { type: 'p', text: s.perProduct2 },
        { type: 'h3', text: s.fastH },
        { type: 'p', text: s.fast1 },
        { type: 'h3', text: s.dataH },
        { type: 'p', text: s.data1 },
        shopifyShot(s.imageAlt, s.imageCaption),
        { type: 'p', text: s.data2 },
        { type: 'callout', variant: 'tip', text: s.setupCheck },
        { type: 'h2', text: s.plansH },
        { type: 'p', text: s.plans1 },
        { type: 'table', headers: s.plansTable.headers, rows: s.plansTable.rows, caption: s.plansTable.caption },
        { type: 'p', text: s.plans2 },
        { type: 'h2', text: s.ifcH },
        { type: 'p', text: s.ifc1 },
        { type: 'ul', items: s.ifcList },
        { type: 'p', text: s.ifc2 },
        { type: 'callout', variant: 'warning', title: s.publicTitle, text: s.publicText },
        { type: 'h2', text: s.beforeH },
        { type: 'ul', items: s.beforeList },
        { type: 'p', text: s.next },
        { type: 'related', to: 'ifc-vs-glb-product-pages', why: s.relGlb },
        { type: 'related', to: 'ifc-viewer-wordpress-plugin', why: s.relWp },
        { type: 'tool', id: 'embed', why: s.toolWhy },
      ],
    },
    {
      ...base(t, 'wordpress-bim-viewer-plugins-compared', c, 7),
      references: [
        { id: 'plugin', title: 'Bimo IFC Viewer', source: 'WordPress.org Plugin Directory', year: '2026', url: PLUGIN, note: c.refNote },
      ],
      content: [
        { type: 'p', text: c.intro1 },
        { type: 'p', text: c.intro2 },
        { type: 'takeaways', items: c.takeaways },
        { type: 'h2', text: c.criteriaH },
        { type: 'ul', items: c.criteria },
        { type: 'h2', text: c.bimoH },
        { type: 'p', text: c.bimo1 },
        { type: 'p', text: c.bimo2 },
        { type: 'code', lang: 'text', text: '[ifc_viewer attachment="123" height="600"]' },
        { type: 'p', text: c.bimo3 },
        { type: 'h2', text: c.viewer3dH },
        { type: 'p', text: c.viewer3d1 },
        { type: 'p', text: c.viewer3d2 },
        { type: 'h2', text: c.a360H },
        { type: 'p', text: c.a3601 },
        { type: 'p', text: c.a3602 },
        { type: 'h2', text: c.iframeH },
        { type: 'p', text: c.iframe1 },
        { type: 'code', lang: 'html', text: '<iframe src="https://…/embed/…" width="100%" height="600" loading="lazy" allowfullscreen></iframe>' },
        { type: 'p', text: c.iframe2 },
        { type: 'h2', text: c.tableH },
        { type: 'table', headers: c.table.headers, rows: c.table.rows, caption: c.table.caption },
        { type: 'h2', text: c.pickH },
        { type: 'ul', items: c.pick },
        { type: 'callout', variant: 'info', title: c.disclosureTitle, text: c.disclosure },
        { type: 'p', text: c.next },
        { type: 'related', to: 'ifc-viewer-wordpress-plugin', why: c.relPlugin },
        { type: 'related', to: 'ifc-vs-glb-product-pages', why: c.relGlb },
        { type: 'tool', id: 'embed', why: c.toolWhy },
      ],
    },
    {
      ...base(t, 'ifc-vs-glb-product-pages', g, 7),
      references: [
        { id: 'shopify', title: 'IFC Viewer Online for Shopify', source: 'GitHub', year: '2026', url: SHOPIFY_DIR, note: g.refNote },
      ],
      content: [
        { type: 'p', text: g.intro1 },
        { type: 'p', text: g.intro2 },
        { type: 'takeaways', items: g.takeaways },
        { type: 'h2', text: g.glbH },
        { type: 'p', text: g.glb1 },
        { type: 'p', text: g.glb2 },
        { type: 'h2', text: g.ifcH },
        { type: 'p', text: g.ifc1 },
        { type: 'ul', items: g.ifcList },
        { type: 'code', lang: 'text', text: "#120= IFCPROPERTYSINGLEVALUE('ThermalTransmittance',$,IFCTHERMALTRANSMITTANCEMEASURE(1.1),$);\n#121= IFCPROPERTYSINGLEVALUE('FireRating',$,IFCLABEL('EI 30'),$);\n#122= IFCPROPERTYSET('2u_pQ0Xw91OBcRBxS1qkZ$',#5,'Pset_CurtainWallCommon',$,(#120,#121));" },
        { type: 'h2', text: g.tableH },
        { type: 'table', headers: g.table.headers, rows: g.table.rows, caption: g.table.caption },
        { type: 'h2', text: g.sizeH },
        { type: 'p', text: g.size1 },
        { type: 'p', text: g.size2 },
        { type: 'h2', text: g.fineH },
        { type: 'ul', items: g.fine },
        { type: 'h2', text: g.bothH },
        { type: 'p', text: g.both1 },
        { type: 'p', text: g.both2 },
        { type: 'h2', text: g.checkH },
        { type: 'ol', items: g.check },
        { type: 'bimo-tip', emotion: 'thinking', text: g.tip },
        { type: 'p', text: g.next },
        { type: 'related', to: 'ifc-shopify-product-viewer', why: g.relShopify },
        { type: 'related', to: 'wordpress-bim-viewer-plugins-compared', why: g.relCompare },
        { type: 'related', to: 'bim-models-on-wordpress-website', why: g.relPlugin },
        { type: 'tool', id: 'validator', why: g.toolWhy },
      ],
    },
  ]
}

const EN: IntegrationText = {
  category: 'Tools & comparisons',
  shopify: {
    title: 'IFC on Shopify: Show BIM Products in 3D on Your Product Page',
    seoTitle: 'IFC on Shopify: BIM Products in 3D on Product Pages',
    seoDescription: 'Show each product\'s IFC model on its Shopify page: one per variant, loaded on click, with BIM downloads and a spec table. Free sections work today.',
    excerpt: 'Architects choose products from BIM objects, not photos. Our Shopify app puts each product\'s IFC model on its page, per variant, with downloads and specs. It is in App Store review; the free copy-paste sections work today.',
    heroAlt: 'A Shopify product page for a curtain wall system with its IFC model in 3D, BIM downloads and a technical data table',
    keywords: ['IFC Shopify', 'BIM Shopify product page', '3D BIM product viewer', 'building products ecommerce BIM', 'show IFC on product page', 'Shopify 3D model IFC'],
    refNote: 'The copy-paste sections, the app source, the metafield list and the plan table.',
    faqs: [
      { q: 'Can I install the app from the Shopify App Store today?', a: 'Not yet. It was submitted for review on 25 November 2026. Until it is approved, the free copy-paste section in our GitHub repository puts the same viewer on a product page.' },
      { q: 'Does the model get uploaded to IFC Viewer Online?', a: 'No. The file stays where you put it, usually Shopify Files. The visitor\'s browser downloads it from there and opens it.' },
      { q: 'Can each variant show a different model?', a: 'Yes, with the app. Put the IFC in the variant\'s custom.ifc_model metafield; switching the variant switches the model.' },
      { q: 'Do I need to convert my IFC files to GLB?', a: 'No. The viewer reads IFC directly, so the properties and classification the specifier needs stay in the file.' },
    ],
    intro1: 'If you make curtain walls, windows, steel connectors or kitchen units, your buyers are often not the people who pay. They are architects and engineers who pick products while modelling a building, and they look for a BIM object long before they ask for a quote.',
    intro2: ['Most building-product shops answer that with photos and a PDF datasheet. Our Shopify app puts the product\'s IFC model on the page instead, next to the price and the variant picker. We submitted it to Shopify App Store review on 25 November 2026, so it is in review and coming to the App Store. Meanwhile, free copy-paste sections in our GitHub repository', { cite: 'shopify' }, ' do the basic job today.'],
    takeaways: [
      'The free copy-paste section works on any theme today: upload the IFC to Shopify Files, paste its link, done.',
      'The app (in App Store review) reads the model from a metafield, custom.ifc_model, per product and per variant.',
      'The viewer loads on click or when scrolled into view, so the product page stays fast.',
      'IFC keeps the properties, quantities and classification a specifier checks; a GLB keeps only the shape.',
    ],
    whyH: 'Why put the model on the product page',
    why1: 'A specifier on your page wants to answer three questions quickly: does it fit, does it meet the performance I need, and can I drop it into my model. Photos answer none of them. A downloadable file answers the last one only after a download, an import and a look inside their own tool.',
    why2: 'An interactive model in the page answers all three before anyone downloads anything. They can turn it, measure it, click a mullion and see its fire rating or U-value, and then download the same IFC they just inspected. That is the step that turns a browsing architect into a project specification.',
    sectionH: 'Option 1: the free copy-paste section (works today)',
    section1: ['The repository has a Shopify section file, ifc-viewer.liquid, that you paste into your theme. It needs no app, no account and no plan. It is the quickest way to try IFC on a product page while the app is in review.'],
    sectionSteps: [
      { title: 'Add the section file', body: 'In the Shopify admin, open Online Store → Themes → … → Edit code. Under sections/, add ifc-viewer.liquid from integrations/shopify in the repository.' },
      { title: 'Upload the model', body: 'Upload the .ifc in Content → Files and copy its link.' },
      { title: 'Place the section', body: 'In the theme editor, choose Add section → 3D IFC model.' },
      { title: 'Paste the link', body: 'Paste the file link into IFC file link. Several links separated by commas load together as one federated model.' },
    ],
    sectionTable: {
      headers: ['Section setting', 'What it does'],
      rows: [
        ['IFC file link', 'The model (https only); comma-separated links load together'],
        ['Viewer layout', 'article by default, a clean viewer that fits a page'],
        ['Starting view', 'The camera when the model opens'],
        ['Show the Health Score', 'The file\'s score from our free validator, on or off'],
        ['Show the floor plan', 'Opens a 2D plan cut beside the 3D view'],
        ['Language, Accent colour', 'Interface language and your brand colour'],
      ],
      caption: 'The settings of the copy-paste section and what they change in the viewer.',
    },
    appH: 'Option 2: the Shopify app (in review)',
    app1: 'The section is one model per section. A catalogue needs one model per product, chosen by data rather than by hand, and that is what the app adds. It is a theme-only app: a single theme app extension with 20 blocks, no app server and no access scopes on your store\'s data. You add a block to the product template once, and every product fills it from its own metafields.',
    perProductH: 'One model per product, and per variant',
    perProduct1: 'The main block, Product IFC model, reads custom.ifc_model: a URL or a file, on the product or on the variant. If you sell a window in three sizes, each variant can point at its own IFC, and switching the variant in the picker switches the model. These are the metafields most shops start with:',
    perProduct2: 'Anything you put under the bim namespace, such as bim.u_value or bim.fire_rating, becomes a row in the technical data table, and is also written into the page\'s product structured data (JSON-LD) for search engines.',
    fastH: 'Click to load, so the page stays fast',
    fast1: 'An IFC can weigh tens of megabytes, and a product page must not wait for it. The block shows the product image or the custom.ifc_poster image first, and only loads the viewer when the visitor clicks it or scrolls it into view. The file is then opened by the visitor\'s browser, straight from where you host it; it is not processed by a server, ours or yours. If you set custom.ifc_size_mb, the block warns visitors before a heavy download.',
    dataH: 'Downloads, specs and element data',
    data1: 'Next to the viewer, the block can list a download link for the IFC and further files from custom.bim_files: the Revit family, a DWG, the datasheet PDF. The specs come from your metafields, so they read the same as the rest of your catalogue.',
    imageAlt: 'A Shopify product page for curtain wall system CW-50, with the IFC model in 3D, variant buttons, a quote button, BIM downloads and a technical data table',
    imageCaption: 'The product page from the App Store listing: one block, each product\'s own model, downloads and technical data.',
    data2: 'On the Starter plan, a visitor can click any element in the model and read its IFC properties: the property sets, quantities and materials the file carries. For a specifier this is the useful part. It shows the data that will arrive in their model, not a description of it.',
    setupCheck: 'In the theme editor, a setup check panel reports for each block whether the model link is reachable, the file size and IFC schema, and which metafields are missing. Only you see it; buyers never do.',
    plansH: 'Plans',
    plans1: 'The app has three plans. Shopify charges them through its own billing, and a store without a plan gets Free. A block that needs a higher plan shows a note in the theme editor naming that plan; visitors see nothing.',
    plansTable: {
      headers: ['Plan', 'What it adds'],
      rows: [
        ['Free', 'Product IFC model per product and variant, poster image, IFC download, technical data table, rooms and key specs, model explorer, camera views, product structured data'],
        ['Starter', 'Element details, quote requests, downloads for customers only, Health Score badge, extra download formats, quantities, guided tour, plan set and licence, floor plan view, view in your space (AR), classification'],
        ['Business', 'Takeoff and bill of quantities, EPD and product passport readiness, sun and lot fit, NBS and IDS compliance self-check'],
      ],
      caption: 'What each plan includes, from the plan table in the app source. Prices are on the App Store listing.',
    },
    plans2: 'The plan names and features above follow the table in the app source. We are not quoting prices here because the listing, once approved, is where they are confirmed.',
    ifcH: 'Why IFC, and not a GLB conversion',
    ifc1: 'Most 3D product viewers for e-commerce read glTF or GLB. To use them with BIM content you convert the IFC to GLB first, and the conversion keeps the triangles and drops nearly everything else. What gets lost is exactly what an architect came for:',
    ifcList: [
      'Property sets such as Pset_WindowCommon, with thermal transmittance, fire rating and acoustic rating.',
      'Quantities and real dimensions per element, not a mesh someone has to measure.',
      'Classification references (Uniclass, OmniClass, MasterFormat) used to place the product in a specification.',
      'The IFC entity itself: an IfcWindow is a window to every BIM tool, a GLB node is a named mesh.',
    ],
    ifc2: ['There is also one file to maintain instead of two: the IFC you already give specifiers is the one they inspect. There are cases where a GLB is the better choice, AR among them; we go through them in ', { text: 'IFC vs GLB for product pages', to: 'ifc-vs-glb-product-pages' }, '.'],
    publicTitle: 'Everything in the file is public',
    publicText: 'Anyone who opens the page can read every property in the model. Export a clean product IFC for the shop: no project names, internal codes or cost data you would not print on a datasheet.',
    beforeH: 'Before you publish',
    beforeList: [
      'Open the model on a phone. A product IFC of a few megabytes is comfortable; large assemblies are better split or simplified.',
      'Check the Health Score in our free validator, so missing names or broken GUIDs do not reach your buyers.',
      'Host the file on Shopify Files, or anywhere that allows cross-origin requests (CORS).',
      'Fill the bim metafields once per product type; the table and the structured data then fill themselves.',
    ],
    next: ['Selling through WordPress instead? The same viewer is a free plugin: see ', { text: 'how to show IFC models on WordPress', to: 'ifc-viewer-wordpress-plugin' }, ', and ', { text: 'the WordPress BIM viewer plugins compared', to: 'wordpress-bim-viewer-plugins-compared' }, ' for the alternatives.'],
    relGlb: 'What a specifier gets from an IFC that a GLB cannot carry, and when a GLB is enough.',
    relWp: 'The same viewer on WordPress: install, block and shortcode.',
    toolWhy: 'Not on Shopify or WordPress? Embed the viewer on any site with one iframe.',
  },
  compare: {
    title: 'WordPress BIM Viewer Plugins Compared (2026): IFC, GLB and Embeds',
    seoTitle: 'WordPress BIM Viewer Plugins Compared (2026)',
    seoDescription: 'Four ways to show BIM and 3D models on WordPress in 2026: Bimo IFC Viewer, 3D Viewer, A360 Embedder and an iframe. Formats, hosting and trade-offs.',
    excerpt: 'There are four practical ways to show a BIM model on a WordPress site in 2026. They differ in one thing above all: whether they read IFC, or need the model converted or uploaded somewhere else first.',
    heroAlt: 'An IFC model in the WordPress block editor, the starting point for comparing BIM viewer plugins',
    keywords: ['WordPress BIM viewer', 'WordPress IFC plugin', 'WordPress 3D model plugin', 'show BIM on WordPress', 'IFC viewer plugin comparison', 'embed Autodesk viewer WordPress'],
    refNote: 'Our plugin\'s page: install, readme, changelog and support forum.',
    faqs: [
      { q: 'Which WordPress plugin opens IFC files directly?', a: 'Bimo IFC Viewer reads .ifc files from the Media Library without conversion. General 3D viewer plugins work with mesh formats such as glTF/GLB, so an IFC has to be converted first.' },
      { q: 'Is this comparison neutral?', a: 'We make Bimo IFC Viewer, so read it knowing that. We have kept to facts you can check on each plugin\'s page: formats, where the file is stored, and the directory\'s compatibility notes.' },
      { q: 'Can I show a model from Autodesk or Speckle?', a: 'Yes, with an iframe of their share or embed link. The model then lives in their cloud and follows their sharing rules.' },
      { q: 'Does a GLB viewer show element properties?', a: 'Not in the BIM sense. A GLB carries meshes, materials and node names; the property sets and classification of the IFC do not survive the conversion.' },
    ],
    intro1: 'Architects, contractors and building-product manufacturers increasingly want the model itself on their website, not a render of it. WordPress runs a large share of those sites, so the question comes up often: which plugin should I use?',
    intro2: ['We make one of the answers, the free Bimo IFC Viewer', { cite: 'plugin' }, ', so this article says so up front. The other options are real and in some cases the better fit. We compare them on what you can check yourself: the formats they read, where the file is stored, and who runs the viewer.'],
    takeaways: [
      'Bimo IFC Viewer reads IFC natively from your Media Library; the model is opened in the visitor\'s browser.',
      '3D Viewer by bPlugins shows glTF/GLB and other mesh formats; an IFC must be converted first, and its BIM data is lost.',
      'A360 Embedder embeds designs shared from Autodesk\'s cloud; the directory notes it has not been tested with recent WordPress releases.',
      'An iframe of Autodesk Viewer or Speckle works without a plugin, with the model stored in that service.',
    ],
    criteriaH: 'What to compare',
    criteria: [
      'Format: does it read IFC, or only a mesh such as GLB?',
      'Data: can a visitor click an element and see its properties?',
      'Hosting: does the file stay in your Media Library, or live in someone else\'s cloud?',
      'Maintenance: is the plugin tested with current WordPress releases?',
      'Cost and accounts: is it free, and does the visitor or the editor need an account?',
    ],
    bimoH: 'Bimo IFC Viewer',
    bimo1: ['Bimo IFC Viewer is the WordPress plugin of IFC Viewer Online, free and listed in the ', { text: 'WordPress plugin directory', href: PLUGIN }, '. It lets you upload .ifc files to the Media Library, which WordPress blocks by default, and adds an IFC Viewer block and an [ifc_viewer] shortcode.'],
    bimo2: 'The viewer reads IFC directly, so visitors can click an element and read its IFC properties, measure, and see the model\'s Health Score from our validator. Several files load as one federated scene, and the same plugin can put models on a map, run a sun study or show a plan cut. The simplest shortcode takes a Media Library ID:',
    bimo3: 'The trade-off to know: the plugin holds no copy of the viewer. The visitor\'s browser loads it in an iframe from www.ifcvieweronline.eu, and then downloads the model straight from your site. The file is not uploaded to us, but the viewer itself depends on our service being up.',
    viewer3dH: '3D Viewer by bPlugins',
    viewer3d1: 'bPlugins\' 3D Viewer is a popular general-purpose 3D plugin in the directory, with a free version and a paid upgrade. It shows glTF/GLB and other mesh formats listed on its plugin page, with controls for rotation, zoom and presentation. For product visuals, furniture or a sculpture, it is a solid choice.',
    viewer3d2: 'It does not read IFC. To use it with BIM content you export or convert the model to GLB first, for example in Blender with the Bonsai add-on. The shape survives; the property sets, quantities and classification do not, so the page shows the object but not its data.',
    a360H: 'A360 Embedder',
    a3601: 'A360 Embedder embeds designs shared from Autodesk\'s cloud (A360) in a post. The file is uploaded to Autodesk, which converts and displays it, so the formats it shows are the ones Autodesk\'s service accepts.',
    a3602: 'At the time of writing, its directory page shows WordPress\'s notice that the plugin has not been tested with the latest three major WordPress releases. That does not mean it is broken, but check it on a staging site before relying on it.',
    iframeH: 'An iframe of Autodesk Viewer or Speckle',
    iframe1: 'Without any plugin, you can paste an embed or share link from a cloud viewer into a Custom HTML block. Autodesk Viewer and Speckle both accept IFC: you upload the model to their service and copy the link it gives you.',
    iframe2: 'This works well for teams already using those platforms. The model and its link then live in that service, under its account, limits and sharing rules, and the file is not part of your WordPress site. If the link changes or the account lapses, the page shows an empty frame.',
    tableH: 'Formats and hosting at a glance',
    table: {
      headers: ['Option', 'Formats', 'IFC without conversion', 'Where the file lives', 'Cost'],
      rows: [
        ['Bimo IFC Viewer', 'IFC; point clouds (LAS, LAZ, COPC, PLY, PCD)', 'Yes', 'Your Media Library', 'Free'],
        ['3D Viewer (bPlugins)', 'glTF/GLB and other mesh formats', 'No, convert first', 'Your Media Library', 'Free, paid upgrade'],
        ['A360 Embedder', 'What Autodesk\'s cloud accepts', 'Via Autodesk', 'Autodesk cloud', 'Free plugin, Autodesk account'],
        ['Iframe of Autodesk Viewer or Speckle', 'IFC and many others', 'Yes, after upload', 'That service\'s cloud', 'Depends on the service'],
      ],
      caption: 'Facts from each plugin\'s directory page and the services\' own documentation, November 2026.',
    },
    pickH: 'Which one to pick',
    pick: [
      'You have IFC and want visitors to see its data: Bimo IFC Viewer.',
      'You show products as polished visuals and already have GLB files: 3D Viewer.',
      'Your team lives in Autodesk\'s cloud and the model is already shared there: an iframe or A360 Embedder, after testing.',
      'Your team coordinates in Speckle: its embed link in a Custom HTML block.',
    ],
    disclosureTitle: 'Who wrote this',
    disclosure: 'IFC Viewer Online makes Bimo IFC Viewer. We have described the other options only by what their own pages state. If something here is out of date, tell us and we will correct it.',
    next: ['How to install our plugin and use the block and shortcode is in ', { text: 'how to show IFC models on WordPress', to: 'ifc-viewer-wordpress-plugin' }, '. Selling products on Shopify rather than WordPress? See ', { text: 'IFC on Shopify', to: 'ifc-shopify-product-viewer' }, '.'],
    relPlugin: 'Install Bimo IFC Viewer, the block, the shortcode and what is sent where.',
    relGlb: 'Why the format matters more than the plugin for product pages.',
    toolWhy: 'Not on WordPress? Embed the viewer on any site with one iframe.',
  },
  glb: {
    title: 'IFC vs GLB for Product Pages: What Specifiers Actually Need',
    seoTitle: 'IFC vs GLB for Product Pages: What Specifiers Need',
    seoDescription: 'GLB shows the shape; IFC carries properties, classification, dimensions and quantities. What specifiers check, file size, and when a GLB is enough.',
    excerpt: 'A GLB makes a product look good in 3D. An IFC tells an architect whether it meets the spec. What each format carries, what file size really costs, and when a GLB is all you need.',
    heroAlt: 'An IFC model in the viewer with a curtain wall element selected and its IFC properties open',
    keywords: ['IFC vs GLB', 'BIM object product page', 'glTF vs IFC', 'building product 3D model format', 'specifier BIM data', 'manufacturer BIM objects'],
    refNote: 'The Shopify blocks and the metafields they read, including the GLB and USDZ files used for AR.',
    faqs: [
      { q: 'Can I convert IFC to GLB without losing data?', a: 'You keep the geometry and colours. Property sets, quantities, classification and the IFC entity types do not survive, because glTF has no standard place for them.' },
      { q: 'Is IFC too heavy for a web page?', a: 'A single product IFC is usually a few megabytes. Load it on click rather than with the page, and it costs nothing until a visitor asks for it.' },
      { q: 'When is a GLB the better choice?', a: 'For AR on phones, for consumer-facing visuals and for very large geometry where only appearance matters.' },
      { q: 'Which IFC version should I publish?', a: 'IFC4 is a sensible default for product objects in 2026; offer IFC2x3 as well if your buyers still ask for it.' },
    ],
    intro1: 'Building-product manufacturers who put 3D on their website usually pick the format their e-commerce viewer reads, and that is almost always glTF or GLB. It looks good, loads fast and works with AR. For a sofa, that is the end of the story.',
    intro2: 'For a fire door, a window or a steel connector, it is not. The person on the page is often a specifier, and what they need from your product is data: performance, dimensions, classification and a BIM object to drop into their model. This is what each format gives them.',
    takeaways: [
      'GLB carries geometry, materials and node names: good for looks, AR and speed.',
      'IFC carries the same geometry plus property sets, quantities, classification and the element type.',
      'A specifier can check a fire rating or U-value in an IFC in the page; in a GLB they cannot.',
      'Use both where it helps: IFC for the specifier, GLB or USDZ for AR.',
    ],
    glbH: 'What a GLB carries',
    glb1: 'GLB is the binary form of glTF, a format designed to deliver 3D scenes to screens efficiently. A GLB holds meshes, materials and textures, a node hierarchy with names, and optionally animations. Every browser 3D library reads it, and it is what phone AR expects on Android.',
    glb2: 'What it does not have is a schema for building data. A node can be called "Window_1200x1500", and custom extras can hold any JSON, but there is no agreed place for a fire rating, no classification system and no notion that this mesh is a window. Each tool that reads it sees triangles with a name.',
    ifcH: 'What an IFC carries',
    ifc1: 'IFC is the open standard for building information (ISO 16739). A product IFC describes the object as a building element, and every BIM tool reads it the same way. Beyond the geometry, it carries:',
    ifcList: [
      'The entity type: IfcWindow, IfcDoor, IfcCurtainWall, IfcBeam. The architect\'s software knows what it is.',
      'Property sets: standard ones such as Pset_WindowCommon (thermal transmittance, fire rating, acoustic rating) and your own.',
      'Quantities: lengths, areas, volumes and weights per element, in Qto_ sets.',
      'Classification references: Uniclass, OmniClass or MasterFormat codes that place the product in a specification.',
      'Materials, a stable GlobalId and the manufacturer\'s type information.',
    ],
    tableH: 'What a specifier checks, format by format',
    table: {
      headers: ['What the specifier checks', 'IFC', 'GLB'],
      rows: [
        ['Shape and appearance', 'Yes', 'Yes, often with better materials'],
        ['Real dimensions', 'Yes, as geometry and quantities', 'Geometry only, units by convention'],
        ['Performance (U-value, fire, acoustic)', 'Yes, in property sets', 'No standard place'],
        ['Classification code', 'Yes, as classification references', 'No'],
        ['Element type a BIM tool understands', 'Yes, the IFC entity', 'No, a named mesh'],
        ['Drop straight into their model', 'Yes', 'No, needs rebuilding'],
        ['AR on a phone', 'No', 'Yes (with USDZ for iPhone)'],
      ],
      caption: 'The same product exported both ways.',
    },
    sizeH: 'File size: the honest part',
    size1: 'For the same geometry, an IFC file is usually larger than a GLB. IFC is a text format (STEP), it describes shapes parametrically or as faceted solids, and it carries all the data above. A GLB is a compact binary buffer of triangles, often compressed further.',
    size2: 'For product pages this matters less than it seems. A single product IFC is typically a few megabytes, and the viewer can load it only when a visitor clicks or scrolls to it, so the page itself does not get slower. It matters for whole buildings, where a model can reach hundreds of megabytes; for those, publish a lighter export or split it.',
    fineH: 'When a GLB is fine',
    fine: [
      'Consumer products, where the buyer cares how it looks and nobody specifies it in a model.',
      'Augmented reality on phones, which expects GLB on Android and USDZ on iPhone and iPad.',
      'Marketing visuals with rich materials, where appearance matters more than data.',
    ],
    bothH: 'Serving both, from one page',
    both1: ['You do not have to choose one. On Shopify, our app reads the IFC from custom.ifc_model for the viewer, and on the Starter plan it also reads custom.ar_glb and custom.ar_usdz for "view in your space" and offers GLB as an extra download. How that is set up is in ', { text: 'IFC on Shopify', to: 'ifc-shopify-product-viewer' }, '.'],
    both2: 'The rule of thumb: IFC is the source of truth that a specifier inspects and downloads; GLB is a derived view for screens and AR. Export the GLB from the same model, so the two never drift apart.',
    checkH: 'A checklist for your product IFC',
    check: [
      'Use the right entity type (IfcWindow, not IfcBuildingElementProxy).',
      'Fill the common property set for that type, with the values on your datasheet.',
      'Add a classification reference in the system your market uses.',
      'Remove project names, internal codes and anything you would not print.',
      'Check the file in a validator before you publish it.',
    ],
    tip: 'Open your product IFC in a viewer and click one element. If the properties panel is empty, a specifier will see exactly that, and so will their software.',
    next: ['Putting it on a site? On Shopify, see ', { text: 'IFC on Shopify', to: 'ifc-shopify-product-viewer' }, '. On WordPress, compare the options in ', { text: 'WordPress BIM viewer plugins compared', to: 'wordpress-bim-viewer-plugins-compared' }, ', then set up ', { text: 'the free plugin', to: 'ifc-viewer-wordpress-plugin' }, '.'],
    relShopify: 'Each product\'s IFC on its Shopify page, per variant, with downloads and specs.',
    relCompare: 'Four ways to show BIM on WordPress, by format and hosting.',
    relPlugin: 'Models, maps and sun studies on WordPress for architects and contractors.',
    toolWhy: 'Check your product IFC before you publish it: free, in the browser, nothing uploaded.',
  },
}

export const INTEGRATION_POSTS_EN: BlogPost[] = buildIntegrationPosts(EN)
