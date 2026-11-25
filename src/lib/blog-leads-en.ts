import type { BlogPost, RichText } from './blog-posts'
import { PLUGIN } from './blog-integrations-en.ts'
import { integrationsPath } from './integrations/integrations-paths.ts'

// Three posts written on 2026-11-25 for people who could become customers of
// the integrations, each ending in the blog's own lead form (D-38, inserted by
// Blog.tsx, so nothing here adds a CTA block):
//
// 1. bim-objects-manufacturer-website — building-product manufacturers: own the
//    specifier traffic on your site (WordPress plugin, Shopify app in review).
// 2. share-ifc-model-with-client — architects and coordinators: a link, an
//    embed on the project page, or a password-protected WordPress page.
// 3. ifc-viewer-sdk-embed-tutorial — developers: iframe vs the JS SDK, events,
//    grid/finish options. Samples match public/sdk (1.20.0) and are checked by
//    scripts/blog-sdk-samples.test.ts.
//
// Not covered here on purpose, to avoid competing with existing posts:
// embed-ifc-viewer-website (iframe parameters, CORS, Power BI),
// ifc-viewer-wordpress-plugin (install, block, shortcode) and
// bim-models-on-wordpress-website (maps, sun studies).
//
// Same pattern as blog-integrations-en.ts: structure here once, the words in a
// table; the nine translations are in blog-i18n/leads-<lang>.ts.

const DATE = '2026-11-25'
// Literal, so scripts/blog-sdk-samples.test.ts can check the file is shipped.
const SDK_URL = 'https://www.ifcvieweronline.eu/sdk/1.20.0/ifc-viewer.es.js'

const SDK_DOCS_PATH = (lang: string) => (lang === 'en' ? '/sdk/' : `/sdk/${lang}/`)

const SHORTCODE_PRODUCT = '[ifc_viewer attachment="123" ui="client" turntable="1" height="560" title="CW-50 curtain wall"]'
const SHORTCODE_CLIENT = '[ifc_viewer attachment="123,124" name="Architecture,Structure" ui="client" validate="0" height="640"]'

const LINK_CLIENT = 'https://www.ifcvieweronline.eu/?model=https://your-host.com/project/model.ifc&ui=client'

const IFRAME_SAMPLE = `<iframe
  src="https://www.ifcvieweronline.eu/?model=https://your-host.com/model.ifc&embed=1&grid=0&finish=daylight"
  width="100%" height="600" style="border:0"
  loading="lazy" allow="fullscreen" title="3D IFC model">
</iframe>`

const SDK_SAMPLE = `<div id="viewer" style="height:600px"></div>

<script type="module">
  import { IfcViewer } from '${SDK_URL}'

  const viewer = await IfcViewer.create('#viewer', {
    ui: 'embed',          // 3D view, properties on click, compact toolbar
    grid: false,          // hide the ground grid (since 1.20)
    finish: 'daylight',   // 'original' | 'daylight' | 'clay' (since 1.20)
    lang: 'en',
  })

  const model = await viewer.addFromUrl('https://your-host.com/model.ifc')
  console.log(model.fileName, model.elementCount)
</script>`

const SDK_EVENTS_SAMPLE = `viewer.on('element-selected', async (e) => {
  // e.ifcType, e.name and e.globalId arrive with the click
  const data = await viewer.getElement(e.expressId, e.modelId ?? undefined)
  const psets = data?.propertySets.map((p) => p.name) ?? []
  document.querySelector('#details').textContent = \`\${e.ifcType} · \${e.name} · \${psets.join(', ')}\`
})

viewer.on('model-error', (e) => console.warn('Could not load', e.url, e.message))

// Drive the viewer from your own buttons
document.querySelector('#top').onclick = () => viewer.setView('top')
document.querySelector('#fit').onclick = () => viewer.fit()`

type Faq = { q: string; a: string }
type Meta = {
  title: string
  seoTitle: string
  seoDescription: string
  excerpt: string
  heroAlt: string
  keywords: string[]
  faqs: Faq[]
}
type Table = { headers: string[]; rows: string[][]; caption: string }

/** Every word of the three posts, in one language. */
export type LeadText = {
  lang?: string
  category: string
  /** Link text for the /integrations/ page, used in all three posts. */
  integrationsLink: string
  maker: Meta & {
    intro1: string
    intro2: string
    takeaways: string[]
    whyH: string
    why1: string
    why2: string
    ownH: string
    ownList: string[]
    wpH: string
    wp1: string
    wpLink: string
    wp2: string
    shopH: string
    shop1: string
    shop2: string
    leadH: string
    lead1: string
    leadList: string[]
    offerTitle: string
    offer: string
    keepH: string
    keep1: string
    nextBefore: string
    nextMiddle: string
    shopifyLink: string
    nextAfter: string
    relShopify: string
    relGlb: string
    relPlugin: string
    toolWhy: string
  }
  share: Meta & {
    intro1: string
    intro2: string
    takeaways: string[]
    linkH: string
    link1: string
    link2: string
    corsTitle: string
    cors: string
    embedH: string
    embed1: string
    embedLink: string
    embed2: string
    wpH: string
    wp1: string
    wpSteps: Array<{ title: string; body: string }>
    wpWarnTitle: string
    wpWarn: string
    tableH: string
    table: Table
    clientH: string
    clientList: string[]
    helpTitle: string
    help: string
    nextBefore: string
    nextAfter: string
    relEmbed: string
    relPlugin: string
    relCompare: string
    toolWhy: string
  }
  sdk: Meta & {
    intro1: string
    intro2: string
    takeaways: string[]
    choiceH: string
    choiceTable: Table
    iframeH: string
    iframe1: string
    iframe2: string
    sdkH: string
    sdk1: string
    sdk2: string
    eventsH: string
    events1: string
    events2: string
    optionsH: string
    optionsTable: Table
    pinTitle: string
    pin: string
    ownH: string
    own1: string
    ownList: string[]
    own2: string
    helpTitle: string
    help: string
    nextBefore: string
    docsLink: string
    nextMiddle: string
    nextAfter: string
    relEmbed: string
    relShopify: string
    relGlb: string
    toolWhy: string
  }
}

const base = (t: LeadText, slug: string, m: Meta, readTimeMin: number) => ({
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
export function buildLeadPosts(t: LeadText): BlogPost[] {
  const m = t.maker
  const s = t.share
  const d = t.sdk
  const lang = t.lang ?? 'en'
  const integrations = { text: t.integrationsLink, href: integrationsPath(lang) }
  const makerNext: RichText = [m.nextBefore, integrations, m.nextMiddle, { text: m.shopifyLink, to: 'ifc-shopify-product-viewer' }, m.nextAfter]
  const shareNext: RichText = [s.nextBefore, integrations, s.nextAfter]
  const sdkNext: RichText = [d.nextBefore, { text: d.docsLink, href: SDK_DOCS_PATH(lang) }, d.nextMiddle, integrations, d.nextAfter]
  return [
    {
      ...base(t, 'bim-objects-manufacturer-website', m, 7),
      references: [{ id: 'plugin', title: 'Bimo IFC Viewer', source: 'WordPress.org Plugin Directory', year: '2026', url: PLUGIN }],
      content: [
        { type: 'p', text: m.intro1 },
        { type: 'p', text: m.intro2 },
        { type: 'takeaways', items: m.takeaways },
        { type: 'h2', text: m.whyH },
        { type: 'p', text: m.why1 },
        { type: 'p', text: m.why2 },
        { type: 'h2', text: m.ownH },
        { type: 'ul', items: m.ownList },
        { type: 'h2', text: m.wpH },
        { type: 'p', text: [m.wp1, ' ', { text: m.wpLink, href: PLUGIN }, '.'] },
        { type: 'code', lang: 'text', text: SHORTCODE_PRODUCT },
        { type: 'p', text: m.wp2 },
        { type: 'h2', text: m.shopH },
        { type: 'p', text: m.shop1 },
        { type: 'p', text: m.shop2 },
        { type: 'h2', text: m.leadH },
        { type: 'p', text: m.lead1 },
        { type: 'ul', items: m.leadList },
        { type: 'callout', variant: 'tip', title: m.offerTitle, text: m.offer },
        { type: 'h2', text: m.keepH },
        { type: 'p', text: m.keep1 },
        { type: 'p', text: makerNext },
        { type: 'related', to: 'ifc-shopify-product-viewer', why: m.relShopify },
        { type: 'related', to: 'ifc-vs-glb-product-pages', why: m.relGlb },
        { type: 'related', to: 'ifc-viewer-wordpress-plugin', why: m.relPlugin },
        { type: 'tool', id: 'embed', why: m.toolWhy },
      ],
    },
    {
      ...base(t, 'share-ifc-model-with-client', s, 6),
      content: [
        { type: 'p', text: s.intro1 },
        { type: 'p', text: s.intro2 },
        { type: 'takeaways', items: s.takeaways },
        { type: 'h2', text: s.linkH },
        { type: 'p', text: s.link1 },
        { type: 'code', lang: 'text', text: LINK_CLIENT },
        { type: 'p', text: s.link2 },
        { type: 'callout', variant: 'warning', title: s.corsTitle, text: s.cors },
        { type: 'h2', text: s.embedH },
        { type: 'p', text: [s.embed1, ' ', { text: s.embedLink, to: 'embed-ifc-viewer-website' }, '.'] },
        { type: 'p', text: s.embed2 },
        { type: 'h2', text: s.wpH },
        { type: 'p', text: s.wp1 },
        { type: 'steps', items: s.wpSteps },
        { type: 'code', lang: 'text', text: SHORTCODE_CLIENT },
        { type: 'callout', variant: 'warning', title: s.wpWarnTitle, text: s.wpWarn },
        { type: 'h2', text: s.tableH },
        { type: 'table', headers: s.table.headers, rows: s.table.rows, caption: s.table.caption },
        { type: 'h2', text: s.clientH },
        { type: 'ul', items: s.clientList },
        { type: 'callout', variant: 'tip', title: s.helpTitle, text: s.help },
        { type: 'p', text: shareNext },
        { type: 'related', to: 'embed-ifc-viewer-website', why: s.relEmbed },
        { type: 'related', to: 'ifc-viewer-wordpress-plugin', why: s.relPlugin },
        { type: 'related', to: 'wordpress-bim-viewer-plugins-compared', why: s.relCompare },
        { type: 'tool', id: 'viewer', why: s.toolWhy },
      ],
    },
    {
      ...base(t, 'ifc-viewer-sdk-embed-tutorial', d, 8),
      content: [
        { type: 'p', text: d.intro1 },
        { type: 'p', text: d.intro2 },
        { type: 'takeaways', items: d.takeaways },
        { type: 'h2', text: d.choiceH },
        { type: 'table', headers: d.choiceTable.headers, rows: d.choiceTable.rows, caption: d.choiceTable.caption },
        { type: 'h2', text: d.iframeH },
        { type: 'p', text: d.iframe1 },
        { type: 'code', lang: 'html', text: IFRAME_SAMPLE },
        { type: 'p', text: d.iframe2 },
        { type: 'h2', text: d.sdkH },
        { type: 'p', text: d.sdk1 },
        { type: 'code', lang: 'html', text: SDK_SAMPLE },
        { type: 'p', text: d.sdk2 },
        { type: 'h2', text: d.eventsH },
        { type: 'p', text: d.events1 },
        { type: 'code', lang: 'js', text: SDK_EVENTS_SAMPLE },
        { type: 'p', text: d.events2 },
        { type: 'h2', text: d.optionsH },
        { type: 'table', headers: d.optionsTable.headers, rows: d.optionsTable.rows, caption: d.optionsTable.caption },
        { type: 'callout', variant: 'info', title: d.pinTitle, text: d.pin },
        { type: 'h2', text: d.ownH },
        { type: 'p', text: d.own1 },
        { type: 'ul', items: d.ownList },
        { type: 'p', text: d.own2 },
        { type: 'callout', variant: 'tip', title: d.helpTitle, text: d.help },
        { type: 'p', text: sdkNext },
        { type: 'related', to: 'embed-ifc-viewer-website', why: d.relEmbed },
        { type: 'related', to: 'ifc-shopify-product-viewer', why: d.relShopify },
        { type: 'related', to: 'ifc-vs-glb-product-pages', why: d.relGlb },
        { type: 'tool', id: 'sdk', why: d.toolWhy },
      ],
    },
  ]
}

const EN: LeadText = {
  category: 'Tools & comparisons',
  integrationsLink: 'all our integrations',
  maker: {
    title: 'Your BIM objects are on BIMobject. Why not on your own website too?',
    seoTitle: 'BIM objects on your own website, not only on BIMobject',
    seoDescription: 'Building-product manufacturers: show each product\'s IFC in 3D on your own site, keep the specifier traffic and turn downloads into quote requests.',
    excerpt: 'Architects find your products on BIM marketplaces, download the object and leave. On your own website the same IFC can be inspected in 3D, and the visit can end in a quote request instead of an anonymous download. How to do it on WordPress today, and on Shopify once our app is approved.',
    heroAlt: 'A product page showing a window family as an IFC model in 3D, with variant selector and BIM downloads',
    keywords: ['BIM objects manufacturer website', 'BIMobject alternative', 'BIM content on own website', 'IFC product page manufacturer', 'building product manufacturer BIM leads', 'specifier leads BIM'],
    faqs: [
      { q: 'Should we stop publishing on BIMobject or other marketplaces?', a: 'No. Marketplaces are where many specifiers search first. The point is to also have the product on your own site, where you control the page, the follow-up and the data about who looked at it.' },
      { q: 'Do we have to upload our models to IFC Viewer Online?', a: 'No. The IFC stays on your website or in your shop\'s files. The visitor\'s browser downloads it from there and opens it in the viewer.' },
      { q: 'Does it work on Shopify?', a: 'The Shopify app was submitted to App Store review on 25 November 2026. Until it is approved, a free copy-paste section from our repository puts the same viewer on a product page.' },
      { q: 'What does it cost?', a: 'The WordPress plugin is free. The Shopify app has Free, Starter and Business plans; prices are on its App Store listing once approved.' },
    ],
    intro1: 'If you make windows, façades, sanitaryware or structural connectors, your BIM objects are probably already on a marketplace. That is where many architects search, and it is a good place to be found.',
    intro2: 'But the visit belongs to the marketplace. The architect downloads the object, and you learn little or nothing about who they were or which project it was for. Your own website can show the same IFC in 3D, with your data and your contact form next to it.',
    takeaways: [
      'Keep the marketplace listing; add the IFC to your own product page as well.',
      'On your site the specifier can turn the model, click an element and read its properties before downloading.',
      'WordPress: a free plugin, live in the plugin directory. Shopify: our app is in App Store review.',
      'Ask for an email or a project name at the moment of the download or the quote request, not before.',
      'Send us the IFC of one product and we will set up a demo page for it.',
    ],
    whyH: 'What a marketplace does not give you',
    why1: 'A marketplace is built to send the specifier to the file as quickly as possible. That is useful for them and for the architect, but the page around your product is the marketplace\'s page, with competitors one click away.',
    why2: 'On your own website the page is yours. You choose what sits next to the model: the technical sheet, the installation details, the variants, a sales contact for the region, and a form that asks who is downloading.',
    ownH: 'What your own product page can do',
    ownList: [
      'Show the actual IFC in 3D, not a render: the architect can orbit, section and measure it.',
      'Show its property sets when an element is clicked, such as thermal transmittance or fire rating.',
      'Offer the downloads you choose: IFC, RFA, DWG, the datasheet.',
      'Put a quote request or a download form right under the model.',
      'Keep the visit in your analytics, so you know which product and which country.',
    ],
    wpH: 'On WordPress: the free plugin',
    wp1: 'Most manufacturer websites run on WordPress. Our plugin adds an IFC viewer block and a shortcode. You upload the .ifc to the Media Library, place the block on the product page, and the model opens in the visitor\'s browser. Install it from the',
    wpLink: 'WordPress plugin directory',
    wp2: 'For the quote or download form, use the form plugin your site already has. The viewer shows the model; your form collects the lead, so the contact ends up in the same place as every other enquiry.',
    shopH: 'On Shopify: the app (in review) and a free section today',
    shop1: 'If you sell through Shopify, our app puts the IFC of each product and each variant on its product page, with BIM downloads and a technical data table. It was submitted to App Store review on 25 November 2026 and is not installable from the App Store yet.',
    shop2: 'The Free plan covers the model, the downloads and the data table. Quote requests and downloads for logged-in customers only are in Starter. Until the app is approved, a free copy-paste section from our repository already works, and you can join the list through the form at the end of this page to hear when it is live.',
    leadH: 'Turn the download into a conversation',
    lead1: 'An architect who has just inspected your product in 3D is the most interested visitor you will get. That is the moment to ask, briefly:',
    leadList: [
      'Download in exchange for an email, with the project name as an optional field.',
      'A quote request next to the model, with the variant they were looking at already filled in.',
      'A sample or a technical call for the region, routed to the right sales person.',
    ],
    offerTitle: 'Send us one product, we set up the demo page',
    offer: 'Send us the IFC of one of your products with the form at the end of this page. We will set it up on a demo product page, on WordPress or Shopify, so you can see it with your own model before you change anything on your site.',
    keepH: 'Marketplace and website, not one or the other',
    keep1: 'Keep publishing to the marketplaces; they bring specifiers who do not know you yet. Use the same IFC files on your own site for the visitors who already found you, and make sure those visits end in a contact you can follow up.',
    nextBefore: 'The options for each platform are on the page with ',
    nextMiddle: '. If you sell on Shopify, ',
    shopifyLink: 'IFC on Shopify product pages',
    nextAfter: ' covers the app, the free section and what each plan includes.',
    relShopify: 'The Shopify app, the free section and the plans, step by step.',
    relGlb: 'Why the product page should show the IFC and not only a GLB.',
    relPlugin: 'Install the WordPress plugin, the block and the shortcode.',
    toolWhy: 'Not on WordPress or Shopify? Embed the viewer on any site with one iframe.',
  },
  share: {
    title: 'Share an IFC model with a client who doesn\'t have BIM software',
    seoTitle: 'Share an IFC model with a client who has no BIM software',
    seoDescription: 'Three free ways to show a client your IFC model in the browser: a link, an embed on the project page, or a password-protected WordPress page.',
    excerpt: 'Your client does not have Revit, Archicad or Solibri, and should not need them to look at the model. Three free ways to share an IFC so it opens in any browser: a link, an embed on the project page, or a password-protected page on your WordPress site.',
    heroAlt: 'A project page with an embedded IFC model in the client view, opened in a browser',
    keywords: ['share IFC model with client', 'send IFC to client', 'view IFC without BIM software', 'IFC model link', 'show BIM model to client', 'password protected IFC model'],
    faqs: [
      { q: 'Does my client need to install anything?', a: 'No. The model opens in the browser on a computer, tablet or phone. There is no account and no plugin to install.' },
      { q: 'Is the model uploaded to your servers?', a: 'No. The viewer downloads the file from where you host it and opens it in the client\'s browser.' },
      { q: 'Is a password-protected WordPress page private enough?', a: 'It hides the page, not the file. The .ifc in the Media Library still has its own address. For confidential models, see the warning in the WordPress section.' },
      { q: 'Is this free?', a: 'Yes. The link, the embed and the WordPress plugin are free.' },
    ],
    intro1: 'You have an IFC model to show. The client has a browser and no BIM software, and a PDF of screenshots answers none of their questions about how the space works.',
    intro2: 'There are three free ways to give them the model itself, in the browser. Which one to choose depends on where you already talk to the client: an email, a project page, or your own website.',
    takeaways: [
      'A link opens the model in the client view, with no install and no account.',
      'An embed puts the model on the project page you already send.',
      'A password-protected WordPress page keeps the page out of sight, not the file itself.',
      'All three are free; the file stays where you host it.',
    ],
    linkH: '1. A link',
    link1: 'Put the .ifc where it has a public address (your website, a file server, a bucket) and send a link to the viewer with that address. The client view hides the BIM tools and leaves the model, the properties and the navigation:',
    link2: 'The client clicks, the model opens, and they can orbit, cut and click elements. Nothing is installed and nothing is uploaded to us.',
    corsTitle: 'If the model does not open',
    cors: 'The server hosting the file must allow other sites to read it (CORS). Sharing links from consumer cloud drives usually return a web page instead of the file, and do not work. Your own website or a storage bucket with CORS enabled does.',
    embedH: '2. An embed on the project page',
    embed1: 'If you already send clients a project page, put the model on it with one iframe. The parameters and the CORS details are in',
    embedLink: 'how to embed an IFC viewer in a website',
    embed2: 'The client sees the model in the same place as the renders and the schedule, and you update the file without sending a new link.',
    wpH: '3. A password-protected WordPress page',
    wp1: 'If your studio site runs on WordPress, our free plugin and WordPress\'s own password protection give you a client page in a few minutes:',
    wpSteps: [
      { title: 'Install the plugin', body: 'Search for Bimo IFC Viewer in Plugins → Add New, or install it from the WordPress plugin directory.' },
      { title: 'Upload the model', body: 'Upload the .ifc files to the Media Library and note their IDs.' },
      { title: 'Create the page', body: 'Add the IFC Viewer block, or the shortcode below with the client view.' },
      { title: 'Protect it', body: 'In the page settings, set Visibility to Password protected and send the password to the client.' },
    ],
    wpWarnTitle: 'The password protects the page, not the file',
    wpWarn: 'WordPress does not protect files in the Media Library. Anyone with the direct address of the .ifc can download it. For a model under NDA, do not publish it on the open web: send the file and let the client open it from their own computer in the viewer, where it is read locally.',
    tableH: 'Which one to use',
    table: {
      headers: ['Way', 'Best when', 'What you need'],
      rows: [
        ['Link', 'You send one model by email or chat', 'A public address for the .ifc that allows CORS'],
        ['Embed', 'You already have a project page', 'Any site where you can paste an iframe'],
        ['WordPress page', 'Your studio site is on WordPress', 'The free plugin and a page password'],
      ],
      caption: 'All three are free and open the model in the client\'s browser.',
    },
    clientH: 'Before you send it',
    clientList: [
      'Open the link yourself in a private window, on a phone too.',
      'Check that the model opens in the right position and at the right scale.',
      'Remove internal property sets and notes the client should not see.',
      'Name the file so the client knows which version it is.',
    ],
    helpTitle: 'Doing this for many clients?',
    help: 'If you share models with clients every week and want a client area on your own site, tell us what you need with the form at the end of this page.',
    nextBefore: 'Every way to put the viewer on another platform is on the page with ',
    nextAfter: '.',
    relEmbed: 'The iframe parameters, presets and CORS in detail.',
    relPlugin: 'The WordPress plugin: install, block, shortcode and what is sent where.',
    relCompare: 'How the plugin compares with the other ways to show BIM on WordPress.',
    toolWhy: 'Open the model in the viewer first and check what your client will see.',
  },
  sdk: {
    title: 'IFC viewer SDK tutorial: embed, listen to clicks, drive the camera',
    seoTitle: 'IFC viewer SDK tutorial: iframe vs JavaScript SDK',
    seoDescription: 'Embed an IFC viewer in your web app: iframe or JavaScript SDK, events, grid and finish options, with copy-paste code checked against SDK 1.20.0.',
    excerpt: 'A developer tutorial for putting an IFC viewer into your own web app. When an iframe is enough, when you need the JavaScript SDK, how to react to clicks and read properties, and what it would take to build the same on web-ifc or xeokit yourself.',
    heroAlt: 'An IFC model in an embedded viewer next to a panel showing the properties of the clicked element',
    keywords: ['IFC viewer SDK', 'IFC viewer JavaScript', 'embed IFC viewer web app', 'web-ifc alternative', 'xeokit alternative', 'IFC viewer API tutorial'],
    faqs: [
      { q: 'Do I need a build step or npm?', a: 'No. The SDK is one ES module you import from a versioned URL. It works in a plain HTML page and in any framework.' },
      { q: 'Does the model go through your servers?', a: 'No. The viewer runs in an iframe in the visitor\'s browser and downloads the IFC directly from the URL you give it.' },
      { q: 'Can I read element properties from my own code?', a: 'Yes. Listen to element-selected, then call getElement() to get the attributes, property sets and quantities of that element.' },
      { q: 'Which version should I load?', a: 'Pin a version in the URL, for example 1.20.0, so an update never changes your page without you deciding to.' },
    ],
    intro1: 'You have a web app, a portal or a configurator, and it needs to show IFC models. You can build the viewer yourself on a parsing library, or embed one that already loads, navigates and inspects IFC.',
    intro2: 'This tutorial covers the second path with our viewer: the plain iframe first, then the JavaScript SDK for when your page needs to talk to the model. All the code below runs against SDK 1.20.0.',
    takeaways: [
      'An iframe shows a model; the SDK lets your code control it and read it.',
      'The SDK is one ES module from a pinned URL: no build step, any framework.',
      'Events such as element-selected arrive with the IFC class, name and GlobalId.',
      'grid and finish (since 1.20) change the look without touching the model.',
      'The file is read in the visitor\'s browser and never uploaded to us.',
    ],
    choiceH: 'iframe or SDK',
    choiceTable: {
      headers: ['Need', 'iframe', 'JavaScript SDK'],
      rows: [
        ['Show one model on a page', 'Yes', 'Yes'],
        ['Set view, language, look', 'URL parameters', 'Options and methods'],
        ['React to clicks on elements', 'No', 'element-selected event'],
        ['Read properties and quantities', 'No', 'getElement(), getProductData()'],
        ['Load models chosen by your app', 'New URL', 'addFromUrl(), add()'],
        ['Run a validation or IDS check', 'Health Score only', 'getValidation(), checkIds()'],
      ],
      caption: 'Start with the iframe; switch to the SDK when your page needs to talk to the model.',
    },
    iframeH: 'Step 1: the iframe',
    iframe1: 'If the page only needs to show the model, an iframe is enough. grid=0 hides the ground grid and finish=daylight shows the IFC colours under soft daylight:',
    iframe2: 'The browser downloads the .ifc from your host, so the host must allow cross-origin requests. The full parameter list and the CORS pitfalls are in the embed guide linked at the end.',
    sdkH: 'Step 2: the SDK',
    sdk1: 'When your code needs the model, import the SDK as an ES module and create the viewer in a container. create() resolves once the viewer is ready to take commands:',
    sdk2: 'The embed preset is meant for host applications: the 3D view, the properties of what the visitor clicks, and a small toolbar with Validate and Measure. There is no Open or Share button, because your app supplies the file.',
    eventsH: 'Step 3: listen to clicks and drive the camera',
    events1: 'Subscribe with on(). The click event already carries the class, the name and the GlobalId; getElement() returns the property sets and quantities:',
    events2: 'on() returns a function that unsubscribes. Other events cover progress, validation results, measurements and walk mode; the reference lists them all.',
    optionsH: 'Options worth knowing',
    optionsTable: {
      headers: ['Option', 'Values', 'What it does'],
      rows: [
        ['ui', 'embed, minimal, full, kiosk, article, client', 'Which controls the viewer shows'],
        ['grid', 'true, false', 'Shows or hides the ground grid (since 1.20)'],
        ['finish', 'original, daylight, clay', 'How the model is lit and coloured (since 1.20)'],
        ['lazy', 'true, \'visible\'', 'Loads only on click, or when the box scrolls into view'],
        ['view', 'iso, top, front, left…', 'The starting camera'],
        ['accent', 'a CSS colour', 'Matches the viewer to your brand'],
      ],
      caption: 'From IfcViewerOptions in the SDK type definitions (1.20.0).',
    },
    pinTitle: 'Pin the version',
    pin: 'Load the SDK from a versioned path such as /sdk/1.20.0/. Older versions stay published, so your page keeps working until you choose to upgrade.',
    ownH: 'Compared with building your own viewer',
    own1: 'web-ifc and xeokit are good open-source libraries, and building on them gives you full control. Before you start, count what a usable viewer needs beyond parsing the file:',
    ownList: [
      'Loading large models in a worker without freezing the page, and freeing memory afterwards.',
      'Camera controls, sections, measurements and selection that work with touch too.',
      'A properties panel that handles property sets from Revit, Archicad and Tekla.',
      'Validation, BCF, translations and mobile layouts.',
    ],
    own2: 'If your product is the viewer, build it. If the viewer is one screen of your product, embedding it gets you there in an afternoon.',
    helpTitle: 'An agency or a software house?',
    help: 'If you are integrating IFC into a client\'s portal or your own product and want help with the setup, tell us about the project with the form at the end of this page.',
    nextBefore: 'The full method and event list is in the ',
    docsLink: 'SDK reference',
    nextMiddle: '. Ready-made integrations for WordPress and Shopify are on the page with ',
    nextAfter: '.',
    relEmbed: 'The iframe in detail: URL parameters, presets, CORS and Power BI.',
    relShopify: 'The same viewer on Shopify product pages, per product and variant.',
    relGlb: 'What a specifier gets from IFC that a GLB conversion drops.',
    toolWhy: 'The full SDK reference, with every option, method and event.',
  },
}

export const LEAD_POSTS_EN: BlogPost[] = buildLeadPosts(EN)
