import type { BlogPost } from './blog-posts'

// The tracking globe (docs/TRACKING_GLOBE.md). Written so a reader, or an
// assistant answering one, gets the platform limits straight: what was tested
// and what was not is stated, because stores and tenants were not available.

export const TRACKING_POSTS_EN: BlogPost[] = [
  {
    slug: 'embed-shipment-tracking-map-website',
    date: '2026-10-31',
    dateModified: '2026-10-31',
    author: 'IFC Viewer Team',
    category: 'Tools & comparisons',
    categorySlug: 'tools',
    title: 'How to Embed a Shipment Tracking Map on Your Website: WordPress, Shopify, SharePoint and Taobao',
    seoTitle: 'Embed a Shipment Tracking Map on Your Website',
    seoDescription: 'Add a 3D globe of your shipments to WordPress, Shopify or SharePoint with one snippet, and what is really possible on Taobao. Free, 30 KB, no cookies.',
    excerpt: 'Suppliers and forwarders can show customers where goods are, on their own site, without a map API key or a backend. Here is what goes in on each platform, what it costs the page, and where the honest answer is no.',
    readTimeMin: 5,
    keywords: ['embed shipment tracking map', 'shipment tracking widget for website', 'cargo tracking globe', 'container tracking map embed', 'China to Europe shipment map', 'tracking map WordPress', 'tracking map Shopify', 'SharePoint embed web part map', 'Taobao shop iframe'],
    faqs: [
      { q: 'What is the easiest way to show shipment tracking on my website?', a: 'Paste a script tag and a tracking-globe element from the configurator at ifcvieweronline.eu/tracking-globe. It needs no account, no map API key and no backend of your own unless you want live data.' },
      { q: 'Can I put it in SharePoint Online?', a: 'Yes, through the Embed web part as an iframe, once a site owner adds the domain under HTML Field Security. Modern pages do not run scripts from page content. We have not tested it in a real tenant.' },
      { q: 'Can I put a live tracking map in a Taobao shop?', a: 'We could not confirm any supported way. Taobao shop decoration is a closed editor, so we offer an image export and suggest hosting the live map on your own page.' },
      { q: 'Does the map track ships or parcels by itself?', a: 'No. It draws what you give it: dates, progress or positions from your system. It does not connect to carriers, and its routes are schematic.' },
      { q: 'Will it slow my page down?', a: 'A 3 KB loader runs first and reserves the space. The 27 KB engine loads only when the map nears the screen, and drawing stops when it is off-screen. We measured zero layout shift on our test pages.' },
    ],
    references: [
      { id: 'wp', title: 'Custom HTML block', source: 'WordPress.org', url: 'https://wordpress.org/support/article/custom-html/', note: 'Users without unfiltered_html have iframes and scripts stripped.' },
      { id: 'wpcom', title: 'Custom HTML block', source: 'WordPress.com', url: 'https://wordpress.com/support/wordpress-editor/blocks/custom-html-block/', note: 'Scripts and iframes need a paid plan with hosting features active.' },
      { id: 'sp', title: 'Adding an Embed Web Part in a Modern SharePoint Online Page', source: 'Marc D Anderson', url: 'https://sympmarc.com/2022/05/17/adding-an-embed-web-part-in-a-modern-sharepoint-online-page/', note: 'The HTML Field Security allow list, per site. A practitioner’s account, not Microsoft’s documentation.' },
      { id: 'taobao', title: 'Taobao decoration market template rules', source: 'Alibaba Open Platform', url: 'https://developer.alibaba.com/docs/doc.htm?treeId=10&articleId=102115&docType=1', note: 'An old draft, and the most official source we could find.' },
    ],
    content: [
      { type: 'p', text: ['A buyer waiting on a container from Shanghai usually gets a PDF and a carrier link. If you are the supplier or the forwarder, you can show the same information on your own site, on a globe, in your colours. ', { text: 'The Tracking Globe', href: 'https://www.ifcvieweronline.eu/tracking-globe/' }, ' does that with one snippet and no map API key, and it fits most websites. Not all of them, and this guide says which.'] },
      { type: 'takeaways', items: [
        'WordPress and Shopify take a script tag. SharePoint Online takes an iframe, once a site owner allows the domain.',
        'On Taobao and Tmall we could not confirm a way to run a live widget, so the supported path there is an image.',
        'It draws your data, or a simulation that is always labelled as one. It does not connect to carriers.',
        'About 30 KB in two steps, no cookies, no third-party requests.',
      ] },
      { type: 'image', src: 'blog/images/tracking-globe-shipments.jpg', width: 1200, height: 630, alt: 'A 3D globe with shipments from China to Europe by sea, air and rail, next to a list showing status and progress', caption: 'Simulated shipments in the real widget. Simulations always carry a visible label.' },

      { type: 'h2', text: 'What goes in on each platform' },
      { type: 'table', headers: ['Platform', 'How it goes in', 'The catch', 'What we tested'], rows: [
        ['Any HTML site', 'Script tag and element', 'A strict Content-Security-Policy must list the script’s host', 'Desktop and phone, with weight and layout shift measured'],
        ['WordPress', 'Custom HTML block, or a shortcode from our small plugin', 'Roles without unfiltered_html lose the code; WordPress.com needs a paid plan', 'Block markup in a browser, plugin with PHP; not a real install'],
        ['Shopify', 'Custom Liquid section, or a theme section file', 'Rich-text fields strip it; headless stores with their own policy must allow the host', 'A page with a real store’s security headers; not inside a store'],
        ['SharePoint Online', 'Embed web part, as an iframe', 'A site owner must allow the domain; page scripts do not run', 'A sandboxed iframe under a strict policy; not a real tenant'],
        ['Taobao / Tmall', 'An image in your shop’s image space', 'No live widget we can confirm; external links are limited', 'The image export only'],
      ] },

      { type: 'h2', text: 'Add it in four steps' },
      { type: 'steps', items: [
        { title: 'Choose your data', body: 'A simulated demo, a pasted spreadsheet or JSON, or a URL of your own that returns JSON. Pasted data is readable in the page source, so private shipments belong behind a feed or a per-reference lookup.' },
        { title: 'Match your brand', body: 'Colours, logo, font, language and height. Your own stylesheet can also set the variables, so the widget follows your site’s theme.' },
        { title: 'Decide what visitors control', body: 'Dragging, zoom, the globe and map switch, list, search, legend and full screen can each be turned off. The label on simulations cannot.' },
        { title: 'Copy the snippet for your platform', body: 'The configurator writes the right version for each platform, including the domain a SharePoint owner has to allow.' },
      ] },

      { type: 'h2', text: 'Real data, without a server of ours' },
      { type: 'p', text: 'Each visitor’s browser calls your URL directly, so your shipment data never passes through us. That URL must allow cross-origin requests, and it needs its own access rules if the data is private. Rows accept the names carriers and spreadsheets tend to use, such as tracking_number, origin, destination, eta, latitude and longitude. A lookup URL with {id} in it returns one reference at a time, so a customer sees their own shipment and not your whole book.' },
      { type: 'callout', variant: 'warning', text: 'This is a display, not a tracking service. Positions are as good as your data, and routes are schematic lanes between straits and capes, not navigation tracks.' },

      { type: 'h2', text: 'What it costs the host page' },
      { type: 'p', text: 'A 3 KB loader reserves the box, so nothing jumps. The 27 KB engine loads when the map comes within 300 px of the screen, or on click if you prefer. On our test pages, on desktop and an emulated phone, layout shift was zero and the engine did not load until we scrolled towards it. Drawing stops off-screen, the wheel keeps scrolling your page unless Ctrl or ⌘ is held, and reduced-motion settings stop the rotation. The world map ships inside the file, so no visitor’s IP goes to a map provider.' },

      { type: 'h2', text: 'Where the answer is no, or not yet' },
      { type: 'p', text: ['WordPress strips iframes and scripts for users without the ', { text: 'unfiltered_html capability', cite: 'wp' }, ', and ', { text: 'WordPress.com allows them only on a paid plan', cite: 'wpcom' }, '. SharePoint keeps an ', { text: 'allow list per site', cite: 'sp' }, ', and we did not build an SPFx web part, which would need your tenant’s app catalog. For Taobao, the ', { text: 'most official source we found', cite: 'taobao' }, ' is an old draft, so ask the platform before relying on anything. For buyers in China, host the two files on a server there: we have not measured how this site loads from China.'] },
    ],
  },
]
