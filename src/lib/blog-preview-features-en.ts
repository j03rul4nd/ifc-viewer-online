import type { BlogPost, ContentBlock } from './blog-posts'

// Three tools that are built but not open yet: clash detection (Pro/Team),
// receiving subcontractor models (Reception) and checking a folder (Pro).
// Written from the closed drafts of 2026-11-12 (docs-planning/blog-borradores).
//
// Rules for these posts:
//   - Every paid tool is a PREVIEW. The calls to action are the waitlist and
//     "talk to us" on the pricing page; nothing says "try it now".
//   - What is free today is said to be free, and is the real secondary action.
//   - Prices of other vendors only where their official page shows one, with
//     the date it was read. Our own prices are the planned ones of /pricing/.
//   - Every picture is a capture of the design preview with sample data, with
//     the Spanish interface; the captions say so.
//
// One query, one page (no overlap with what already ranks):
//   "ifc clash detection" / "clash detection online"     → ifc-clash-detection-browser
//   "review subcontractor ifc" / "accept or reject ifc"  → review-subcontractor-ifc-models
//     (defining criteria stays with ifc-acceptance-criteria and the BEP post)
//   "validate multiple ifc files" / "batch ifc checker"  → batch-validate-ifc-files
//     (checking one file stays with ifc-model-checker and /ifc-validator/)

const SITE = 'https://www.ifcvieweronline.eu'
const READ = '12 November 2026'
const DATE = '2026-11-12'

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

const PRICING = { id: 'ivo-pricing', title: 'IFC Viewer Online plans', source: 'IFC Viewer Online', year: '2026', url: `${SITE}/pricing/`, note: 'Planned prices of the paid plans, which are not open yet.' }
const SOLIBRI = { id: 'solibri-pricing', title: 'Solibri pricing', source: 'Solibri', year: '2026', url: 'https://www.solibri.com/pricing', note: `Plans and starting prices per licence per year, as published on ${READ}.` }

export const PREVIEW_FEATURE_POSTS_EN: BlogPost[] = [
  // ── Clash detection ────────────────────────────────────────────────────
  {
    slug: 'ifc-clash-detection-browser',
    title: 'IFC Clash Detection in the Browser: What You Can Do Without Navisworks (and What You Cannot)',
    seoTitle: 'IFC Clash Detection in the Browser, Without Navisworks',
    seoDescription: 'Hard and clearance clashes between IFC models, with nothing to install and no upload. What it does, what it does not, and how it compares. In preview.',
    excerpt: 'Finding clashes is the easy part. Finding the ones that matter, and keeping them from coming back as "new" after every export, is the work. A preview of clash detection that runs on the IFC files in your browser.',
    date: DATE,
    dateModified: DATE,
    author: 'IFC Viewer Online',
    category: 'Tools & comparisons',
    categorySlug: 'tools',
    readTimeMin: 8,
    heroImage: 'blog/images/clash-detection-trend-cost-detail.jpg',
    heroAlt: 'Clash detection results in the browser: trend between runs, clashes ordered by estimated cost and the detail of one clash',
    heroCredit: 'IFC Viewer Online',
    keywords: ['IFC clash detection', 'clash detection online', 'clash detection in the browser', 'Navisworks alternative for clashes', 'BIM clash detection', 'clearance clash IFC', 'clash matrix', 'BCF clash'],
    references: [SOLIBRI, PRICING],
    faqs: [
      { q: 'Can I run clash detection on IFC files today?', a: 'Not yet. Clash detection is built and measured, but it is in preview and not open. Federating several IFC models, colouring them by discipline and exporting BCF are free today.' },
      { q: 'Are my models uploaded to run the clash tests?', a: 'No. The geometry is read and tested in your browser, so the models stay on your computer.' },
      { q: 'What kinds of clash does it find?', a: 'Hard clashes, where two elements pass through each other (tested triangle against triangle, not only bounding boxes), and clearance clashes, where two elements are closer than a set distance.' },
      { q: 'How big a model can it handle?', a: 'A 94 MB IFC with 1.44 million triangles was tested all against all in about 8 seconds on a laptop. Above 1 to 2 GB the browser runs out of memory and a desktop tool is the better choice.' },
      { q: 'How much will it cost?', a: 'Clash detection is planned for the Pro plan, and coordination (assigning, shared states, the report) for Team. The planned prices are on the pricing page.' },
    ],
    content: [
      { type: 'callout', variant: 'info', title: 'Preview', text: ['Clash detection is built and measured, but it is not open yet. The screenshots use sample models. If you want to try it when it opens, ', { text: 'join the waitlist', href: `${SITE}/pricing/?role=team` }, '.'] },
      { type: 'p', text: 'If you coordinate architecture, structure and MEP models, you know how it goes: you run the clash test, four thousand results come out, and at Thursday\'s meeting nobody knows where to start. The problem is rarely finding clashes. It is finding the ones that matter, and keeping them from coming back as "new" every time someone exports the IFC again.' },
      { type: 'p', text: 'This post explains how the clash detection we are preparing for IFC Viewer Online works: it runs entirely in the browser, the model never leaves your computer, and it works on the IFC files directly, with no conversion to another format. It also says where it falls short of desktop tools.' },
      {
        type: 'takeaways',
        items: [
          'Hard and clearance tests, triangle against triangle, organised in a matrix you can save.',
          'Ignore rules hide the noise: 1,569 of 4,827 results on a real tower.',
          'Each clash is tracked by its test and the GlobalId pair, so states survive a new version.',
          'In preview: nothing here is open yet, and what is free today stays free.',
        ],
      },
      { type: 'h2', text: 'The problem: 4,827 clashes and hardly any matter' },
      { type: 'p', text: 'We tested a real 94 MB IFC (the Shanghai Tower: 2,134 elements and 1.44 million triangles), all against all. Result: 4,827 clashes in 1,069 groups. Almost all of them were the façade against its own mullions and transoms, which in that file come as separate elements and not as parts of the curtain wall.' },
      shot('clash-detection-4827-clashes-94mb-tower', 800, 491, 'Clash test on the Shanghai Tower IFC: 4,827 results in groups and the time each step took', 'Design preview with sample data, Spanish interface. Geometry read in 0.7 s and tests in about 8 s on a laptop, with no server.'),
      { type: 'p', text: 'A tool that finds a lot of clashes is not doing you a favour. What counts is how fast you get to the short list.' },
      { type: 'h2', text: 'Hard and clearance tests, organised in a matrix' },
      { type: 'p', text: 'There are two kinds of test:' },
      {
        type: 'ul',
        items: [
          'Hard: two elements pass through each other. It is tested triangle against triangle, not only with bounding boxes, so a pipe that runs past a beam without touching it does not count.',
          'Clearance: two elements are closer than allowed (for example, 50 mm between services and structure).',
        ],
      },
      { type: 'p', text: 'Tests are arranged in a matrix: which model or discipline against which, which IFC classes and systems, with what tolerance. The matrix is saved and reused on the next project, and there are templates per building type (housing, offices, hospital, industrial, infrastructure) that only create the tests for the disciplines you have loaded.' },
      shot('clash-detection-test-matrix', 800, 491, 'Clash test matrix: architecture against structure and MEP, with tolerances', 'Design preview with sample data, Spanish interface.'),
      { type: 'p', text: 'On the federated sample model (Hotel Vela: architecture, structure and MEP, 1,987 elements) the default matrix finds 117 clashes in 48 groups in 2.2 seconds: the roof against the air handling unit, the curtain wall against the slab, supply risers 1 mm from the slab. What you would expect to find.' },
      { type: 'h2', text: 'Removing the noise with ignore rules' },
      { type: 'p', text: 'Back to the tower. Two rules switched on by default, "insulation against wall or slab" and "façade against its framing", hide 1,569 of the 4,827 results. Others can be switched on (finishes against slab, same class, overlaps under 20 mm, furniture), and you can write your own by IFC class and by words in the name.' },
      shot('clash-detection-ignore-rules-1569-hidden', 800, 491, 'Ignore rules applied to the tower: 1,569 clash results hidden', 'Design preview with sample data, Spanish interface. Rules hide, they do not delete: you can show what is hidden at any time.'),
      { type: 'h2', text: 'States that survive a new version' },
      { type: 'p', text: 'This is what saves the most time on a live project. Each clash is identified by the test and the pair of GlobalIds of its two elements, not by the session or the file. So:' },
      {
        type: 'ul',
        items: [
          'If the pair no longer clashes in the next version, it becomes resolved by itself.',
          'If you marked it approved (accepted as it is), it stays approved even if the file changes.',
          'The ones still there go from "new" to "active", and only what is really new shows as new.',
        ],
      },
      { type: 'p', text: 'Each run adds a point to a trend chart (open, new, resolved, approved, hidden), which is the first thing to show at the weekly meeting. In one test we moved the MEP model 60 cm between runs: 117 → 590 (473 new) → 117, with "473 resolved since the previous run", and the original 117 kept their state.' },
      shot('clash-detection-trend-cost-detail', 800, 491, 'Trend of clashes between runs, list ordered by estimated cost and the detail of one clash', 'Design preview with sample data, Spanish interface.'),
      { type: 'p', text: 'The list can also be ordered by the estimated cost of resolving each clash: a pipe through a concrete beam costs more than a cable grazing a suspended ceiling. It is an estimate (the cheaper element is the one that moves; it goes up when the clash is deep or goes through structure), and the screen marks it as such. It is not a quotation.' },
      { type: 'p', text: ['An honest note: identifying by GlobalId only works if your authoring tool keeps GlobalIds between exports. If they change on every export, read ', { text: 'why IFC GUIDs change on every export', to: 'ifc-guids-changing-every-export' }, ' first.'] },
      { type: 'h2', text: 'From the clash to the person responsible' },
      { type: 'p', text: 'Click a clash and the viewer isolates the two elements and takes the camera to the point of contact. From there:' },
      {
        type: 'ul',
        items: [
          'Pro: export the clash as BCF 2.1 or 3.0, with camera and components, and open it in BIMcollab, Solibri or Navisworks.',
          'Team: assign it to a person with a due date (it travels in the BCF as AssignedTo and DueDate), and the whole team sees the same states.',
        ],
      },
      shot('clash-detection-focus-3d-assign', 800, 491, 'A clash focused in 3D with the panel to assign it to a person with a due date', 'Design preview with sample data, Spanish interface. Assigning and sharing states belong to the Team plan.'),
      { type: 'p', text: ['Not sure whether to use BCF 2.1 or 3.0? We have a ', { text: 'comparison of how each stores the camera', to: 'bcf-2-1-vs-3-0-viewpoints' }, '.'] },
      { type: 'h2', text: 'A report you can show' },
      { type: 'p', text: 'The coordination report carries the 10 most expensive clashes with their pictures, the trend, the estimated total and the breakdown by test, storey and person. It is printable HTML: save it as PDF and attach it to the minutes.' },
      shot('clash-detection-coordination-report', 800, 491, 'Coordination report with pictures of the most expensive clashes', 'Design preview with sample data, Spanish interface.'),
      { type: 'p', text: 'The list can also be reviewed on a phone: only the rows on screen are drawn. With the 4,827 results of the tower, sorting, filtering or changing a state takes under 100 ms.' },
      shot('clash-detection-phone', 469, 1015, 'Clash list on a phone, in dark mode', 'Design preview with sample data, Spanish interface.'),
      { type: 'h2', text: 'And the client finds out without opening the model (preview, Team)' },
      { type: 'p', text: 'The same figures from the trend can go into the update the team sends to the client: "12 clashes resolved this week", with a link to a project page where they see the summary and the 3D view and can write a question that comes back to the team as a thread. They do not need an account.' },
      shot('client-update-clash-summary-template', 1440, 900, 'Email template for the client with the block of resolved clashes', 'Design preview with sample data, Spanish interface. Sending is switched off.'),
      { type: 'h2', text: 'Beyond two elements touching (preview)' },
      { type: 'p', text: 'Some geometric checks are not clashes between disciplines but project rules: free clearance in front of doors, or the clear height of spaces. They use the same geometry as clash detection and are written as rules, next to the data rules. We will cover them in a post about custom rules.' },
      shot('rule-door-clearance-geometry-issue', 1440, 1000, 'Geometric rule for clearance in front of doors, with the failure turned into an issue', 'Design preview with sample data, Spanish interface.'),
      { type: 'h2', text: 'How it compares' },
      { type: 'p', text: ['Prices from the official pages, read on 12 November 2026. Where we could not read an official price, we do not give one. ', { cite: 'solibri-pricing' }] },
      {
        type: 'table',
        headers: ['', 'Navisworks Manage', 'Solibri', 'BIMcollab Zoom', 'IFC Viewer Online (preview)'],
        rows: [
          ['Hard / clearance', 'Yes / yes', 'Yes (component and clearance rules)', 'Yes / yes', 'Yes / yes, triangle against triangle'],
          ['Saved test matrix', 'Yes (Clash Detective, XML)', 'Rulesets', 'Rulesets', 'Yes, by model, class and system; JSON'],
          ['States between versions', 'Tied to the NWF file', 'Per session', 'Per BCF issue', 'Tied to the GlobalId pair'],
          ['Installation', 'Windows', 'Windows / Mac', 'Windows', 'Browser, nothing to install'],
          ['Is the model uploaded?', 'No (local)', 'No (local)', 'No (local)', 'No: computed in your browser'],
          ['Price', 'See the Autodesk store', 'From €1,428/year (Essential) or €2,109/year (Advanced), per licence', 'See bimcollab.com', 'Planned: Pro from €39/month; coordination in Team from €59/editor'],
        ],
        caption: 'Sources: solibri.com/pricing, read on 12 November 2026. Navisworks and BIMcollab Zoom did not show a price we could read on their official sites that day. Our planned prices are on the pricing page.',
      },
      { type: 'h3', text: 'Where we fall short (and say so)' },
      {
        type: 'ul',
        items: [
          'Very large models: the browser has a memory ceiling. Above 1 to 2 GB, a desktop tool works better.',
          'No penetration tolerance per rule in the style of Solibri.',
          'No maintenance zones (free space to reach a piece of equipment).',
          'The first cold run is slower (about 27 s on the tower) than the following ones.',
        ],
      },
      { type: 'related', to: 'large-ifc-file-browser-crash', why: 'What to do when an IFC file is too big for the browser.' },
      { type: 'h2', text: 'What you can already do for free' },
      { type: 'p', text: ['None of this takes away what is already free: ', { text: 'opening and federating several IFC files', href: `${SITE}/` }, ', colouring by discipline, importing and exporting BCF, comparing versions and ', { text: 'checking each model with its Health Score', to: 'ifc-model-checker' }, '. Clash detection is a new tool and it will be paid. For a broader comparison with Solibri, see the ', { text: 'Solibri alternative', href: `${SITE}/solibri-alternative/` }, ' page.'] },
      { type: 'h2', text: 'Want to try it when it opens?' },
      { type: 'p', text: ['Clash detection is in preview. If you coordinate models and want to try it with your own IFC files before anyone else, ', { text: 'join the waitlist', href: `${SITE}/pricing/?role=team` }, ' and we will write when it opens. If your team coordinates several projects and you would rather see it on a call, ', { text: 'talk to us', href: `${SITE}/pricing/?role=receive` }, '.'] },
    ],
  },

  // ── Receiving subcontractor models ─────────────────────────────────────
  {
    slug: 'review-subcontractor-ifc-models',
    title: 'How to Review Your Subcontractors\' IFC Models Before They Reach Your Desk',
    seoTitle: 'How to Review Subcontractor IFC Models Before They Arrive',
    seoDescription: 'Suppliers check their model against your rules before sending it. You decide on one screen and every delivery is logged. What is free and what is in preview.',
    excerpt: 'Reviewing faster is not the answer. What arrives on your desk should already be checked. The free requirements link your suppliers use today, and a preview of the receiving side.',
    date: DATE,
    dateModified: DATE,
    author: 'IFC Viewer Online',
    category: 'Delivery & ISO 19650',
    categorySlug: 'delivery',
    readTimeMin: 7,
    heroImage: 'blog/images/reception-reason-element-3d-fix.jpg',
    heroAlt: 'Reason a supplier\'s IFC delivery is returned, with the failing elements, a 3D view and the link to the fix',
    heroCredit: 'IFC Viewer Online',
    keywords: ['review subcontractor IFC models', 'receiving BIM deliveries', 'accept or reject IFC model', 'ISO 19650 review and accept', 'ISO 19650 naming deliveries', 'IFC delivery log', 'supplier model check'],
    references: [
      { id: 'uk-bim-part-c', title: 'Guidance Part C: Facilitating the common data environment', source: 'UK BIM Framework', year: '2021', url: 'https://ukbimframework.org/wp-content/uploads/2021/02/Guidance-Part-C_Facilitating-the-common-data-environment-workflow-and-technical-solutions_Edition-1.pdf', note: 'Describes the review and acceptance of information by the party that receives it. Read on 11 November 2026.' },
      PRICING,
    ],
    faqs: [
      { q: 'What can I use today, for free?', a: 'The requirements link (your rules, a minimum score and your ISO 19650 naming convention), the naming check, and checking any IFC with its Health Score. Your suppliers use the link without an account and their file never leaves their computer.' },
      { q: 'What is in preview?', a: 'The delivery inbox per project, deciding on one screen, the review queue, the delivery log with SHA-256 fingerprints, the report for site management and the automatic update to the client. None of it is open yet.' },
      { q: 'Does it replace my CDE?', a: 'No. A CDE manages states and documents. This sits before it: the supplier checks the model against your rules before uploading it, wherever the file goes next.' },
      { q: 'Do my suppliers pay?', a: 'No. The Reception plan is planned per project, not per seat, so the 15 companies delivering to you pay nothing.' },
    ],
    content: [
      { type: 'callout', variant: 'info', title: 'Free today, and in preview', text: ['The requirements link (your rules, minimum score and ISO 19650 names) works today and is free for you and your suppliers. The delivery inbox, deciding on one screen, the log and the report for site management are in preview with sample data. We are running pilots with a few contractors: ', { text: 'talk to us', href: `${SITE}/pricing/?role=receive` }, '.'] },
      { type: 'p', text: 'A mid-sized project has 10 to 15 companies delivering models: structure, MEP, façade, joinery. The IFC files arrive by email, by file transfer or through the CDE. Someone in the technical office opens them when they can, finds that the name does not follow the convention or that classification and system are missing, and sends it back by email. The supplier replies that nobody told them. A week goes by.' },
      { type: 'p', text: 'You do not need to review faster. You need what reaches your desk to be checked already.' },
      {
        type: 'takeaways',
        items: [
          'ISO 19650 puts review and acceptance on the party that receives the model.',
          'Free today: a requirements link your suppliers check against before they send.',
          'In preview: an inbox per project, one-screen decisions, a fingerprinted log and a weekly report.',
        ],
      },
      { type: 'h2', text: 'What the standard asks of the receiving party' },
      { type: 'p', text: ['ISO 19650-2 puts the review and acceptance of the information model in the hands of whoever receives it: the appointing party checks that the delivery meets what was asked before accepting it. ', { cite: 'uk-bim-part-c' }, ' In practice that means three checks, in this order:'] },
      {
        type: 'ol',
        items: [
          'The container: file name, status (S0–S4) and revision (P01, C01…) according to the project convention.',
          'The content: what your EIR or BEP asks for (classification, properties, systems, level of information).',
          'The decision: accept, or return with reasons, and keep a record.',
        ],
      },
      { type: 'p', text: ['To pin down what to require, start with ', { text: 'IFC acceptance criteria', to: 'ifc-acceptance-criteria' }, ' and with ', { text: 'which quality clauses to put in the BEP', to: 'bim-execution-plan-ifc-quality-clauses' }, '. This post is about the next step: how to receive.'] },
      { type: 'h2', text: 'Step 1 (free today): the supplier checks before sending' },
      { type: 'p', text: 'You create a requirements link with your profile (EIR or IDS rules), the minimum score and your ISO 19650 naming convention. You paste it into the BEP, the tender documents or the email to subcontractors. The supplier opens it, drops their IFC and sees whether you will accept it: the file is checked in their browser and never leaves their computer. No account needed.' },
      { type: 'p', text: 'If the name or the score fails, they are told before sending, field by field, with a link to how to fix it.' },
      shot('subcontractor-requirements-link-what-to-fix', 1600, 1111, 'The page the supplier sees: their model does not meet the requirements, what to fix and how', 'Design preview with sample data, Spanish interface. Checking with the link is free today; the contractor\'s branding and the receipt belong to the Reception plan.'),
      { type: 'p', text: 'The rules are not the same at every stage: S2 does not ask for what S4 asks for. In the company rule library (preview, Team plan) each rule carries its ISO 19650 stage, someone other than the author approves each version, and before a rule changes you see which elements the change affects. The link your subcontractors receive always points to the version approved for the current stage; old links do not break.' },
      shot('rule-version-effect-subcontractor-link', 1440, 1000, 'Effect of a new rule version on the model, and the link for subcontractors with the approved version', 'Design preview with sample data, Spanish interface.'),
      { type: 'p', text: 'That alone means less rubbish reaches you. The rest of this post is what we are preparing for the receiving side.' },
      { type: 'h2', text: 'The project at a glance (preview)' },
      { type: 'p', text: 'The first thing a BIM manager needs is not a list of files but how the project is going: which supplier is on track at each milestone (outline, construction, as-built), what needs doing today and how much time is being saved.' },
      shot('reception-project-overview-suppliers', 1600, 1111, 'Project overview: status per supplier and milestone, today\'s tasks and estimated time saved', 'Design preview with sample data, Spanish interface. The time saved is an estimate: its assumptions are shown and can be changed.'),
      { type: 'h2', text: 'Deciding on one screen: reason → element → fix (preview)' },
      { type: 'p', text: ['When a delivery fails, "IfcSystem: 9 elements" is not enough: the supplier will call you anyway. Each failing rule lists which elements (with GlobalId and storey), a button to see them in 3D and a link to the free guide on how to fix it in their tool (the ', { text: 'fix guides', href: `${SITE}/fix/` }, ').'] },
      shot('reception-reason-element-3d-fix', 1600, 1111, 'Reason for returning a delivery, with the failing elements, a 3D view and the link to the fix', 'Design preview with sample data, Spanish interface.'),
      { type: 'p', text: 'To review several deliveries in a row there is a queue with keyboard shortcuts (A to accept, D to return, J and K for next and previous) and the history of each delivery: v1 returned, v2 corrected, v3 accepted, with the note of each version.' },
      shot('reception-review-queue-before-after', 1600, 1111, 'Review queue with the before and after of a delivery', 'Design preview with sample data, Spanish interface.'),
      { type: 'p', text: 'When you return a delivery, the reasons come pre-selected from the failures themselves; you add a note if you want.' },
      { type: 'h2', text: 'A record of every delivery (preview)' },
      { type: 'p', text: 'Every delivery and every decision goes into a log with the date, the author and the SHA-256 fingerprint of the file, chained to the previous line. If someone edits a line, the chain breaks and it shows. It exports to CSV, to file in your CDE or for an audit.' },
      shot('reception-delivery-log-sha256-csv', 1600, 1000, 'Delivery log with the fingerprint of each file and CSV export', 'Design preview with sample data, Spanish interface.'),
      { type: 'p', text: 'It settles what usually ends in an argument: what each supplier delivered, and when.' },
      { type: 'h2', text: 'A report for site management (preview)' },
      { type: 'p', text: 'On Friday, a summary you can read in three minutes: models received and expected, who complies, what fails, who is improving and what to ask of each one. Ready to copy or print.' },
      shot('reception-weekly-site-report', 1600, 1111, 'Weekly report for site management, by supplier', 'Design preview with sample data, Spanish interface.'),
      { type: 'h2', text: 'And the client gets an update without opening anything (preview)' },
      { type: 'p', text: 'When a delivery is accepted or a milestone is met, the client can receive an email of fixed sentences filled with the project\'s numbers (quality, accepted deliveries, next milestone) and a link to a project page, with no account. It is only sent to people who gave their consent, with one-click unsubscribe and no tracking pixel. On the Reception plan the email can come from the contractor\'s own domain.' },
      shot('client-project-page', 1440, 900, 'Project page the client sees: summary, timeline and Health Score', 'Design preview with sample data, Spanish interface. Sending is switched off.'),
      { type: 'h2', text: 'If you already have a CDE' },
      { type: 'p', text: 'It does not replace it. CDEs (ACC, Dalux, Catenda…) manage states and documents; what they do not do is let the supplier check their model against your rules, free and without an account, before uploading it. This comes before the CDE: wherever the file comes from, it arrives checked.' },
      { type: 'h2', text: 'What exists today and what is in preview' },
      {
        type: 'table',
        headers: ['', 'Today', 'Status'],
        rows: [
          ['Requirements link with your rules and minimum score', 'Yes', 'Free'],
          ['ISO 19650 name, status and revision check', 'Yes', 'Free'],
          ['Check any IFC with its Health Score', 'Yes', 'Free'],
          ['Inbox per project, one-screen decision, queue with shortcuts', 'No', 'Preview (Reception plan)'],
          ['Fingerprinted log and CSV, compliance sheet per supplier', 'No', 'Preview (Reception plan)'],
          ['Report for site management', 'In the pilot, prepared by hand each week', 'Preview (Reception plan)'],
          ['Rules per stage with approval and the effect of each change', 'No', 'Preview (Team plan)'],
          ['Automatic update to the client from your domain', 'No', 'Preview (Reception plan)'],
        ],
      },
      { type: 'p', text: ['The Reception plan will be charged per project, not per seat: your 15 suppliers pay nothing. The planned price is on the ', { text: 'pricing page', href: `${SITE}/pricing/?role=receive` }, '. ', { cite: 'ivo-pricing' }] },
      { type: 'h2', text: 'Do you receive IFC files from other companies on a project?' },
      { type: 'p', text: ['We are running pilots with a few contractors and developers: we set up the link with your requirements and your naming convention, and each week we send you the report by supplier. If that fits, ', { text: 'talk to us', href: `${SITE}/pricing/?role=receive` }, ' for 20 minutes about how you receive models today. Or start now, for free, by ', { text: 'checking a model in the validator', href: `${SITE}/ifc-validator/` }, '.'] },
      { type: 'related', to: 'iso19650-ifc-checklist', why: 'The checklist to give suppliers along with the link.' },
    ],
  },

  // ── Checking a folder ──────────────────────────────────────────────────
  {
    slug: 'batch-validate-ifc-files',
    title: 'How to Check 30 IFC Files at Once (and Know Which One to Start With)',
    seoTitle: 'How to Check 30 IFC Files at Once, Without Uploading',
    seoDescription: 'Drop a folder or a zip and check every IFC with the same profile, without uploading. Sorted by severity, with CSV, BCF and a report. In preview.',
    excerpt: 'Opening 30 IFC files one by one and copying each score into a spreadsheet takes an afternoon. A preview of checking a whole folder in the browser, sorted by where to start.',
    date: DATE,
    dateModified: DATE,
    author: 'IFC Viewer Online',
    category: 'Validation',
    categorySlug: 'validation',
    readTimeMin: 5,
    heroImage: 'blog/images/batch-ifc-check-start-with-these-3.jpg',
    heroAlt: 'Batch of IFC files checked in the browser, sorted by severity, with the three files to start with',
    heroCredit: 'IFC Viewer Online',
    keywords: ['validate multiple IFC files', 'batch IFC validation', 'check a folder of IFC files', 'batch IFC checker', 'IFC files at once', 'bulk IFC check'],
    references: [
      SOLIBRI,
      { id: 'bimvision-plugins', title: 'BIMvision plugins', source: 'Datacomp', year: '2026', url: 'https://bimvision.eu/en/plugins/', note: `Lists the paid plugins; the page shows no prices. Read on ${READ}.` },
      PRICING,
    ],
    faqs: [
      { q: 'Can I check a folder of IFC files today?', a: 'Not yet: checking a folder is built but in preview. Checking one file at a time, with its Health Score and its automatic fixes, is free today and will stay free.' },
      { q: 'Are the files uploaded?', a: 'No. Like the free check, the batch runs in your browser, so it also suits projects under NDA, and it uses no credits.' },
      { q: 'How many files can a batch hold?', a: 'Up to 50 files or 2 GB in total, checked with one profile per batch.' },
      { q: 'What comes out of a batch?', a: 'A CSV with one row per file, a BCF 2.1 zip with one issue per file and rule, and a printable batch report with your logo.' },
    ],
    content: [
      { type: 'callout', variant: 'info', title: 'Preview', text: ['Checking a folder is built but not open yet. Checking one file, with its Health Score and its fixes, is free and will stay free. ', { text: 'Join the waitlist', href: `${SITE}/pricing/?role=solo` }, ' to try the batch when it opens.'] },
      { type: 'p', text: 'End of the month. You have a folder with 30 IFC files from four clients: architecture, structure, MEP, several revisions of each. Opening them one by one, waiting for each to load, reading the score, copying it into a spreadsheet and moving on takes a whole afternoon. And in the end the worst file was the ninth, the one you opened in a hurry.' },
      { type: 'h2', text: 'How it is done today, file by file (free)' },
      { type: 'p', text: ['Today you open each IFC in the viewer and see its ', { text: 'Health Score', to: 'ifc-health-score' }, ' from 0 to 100, the list of failures and the automatic fixes (duplicate or empty names, GUIDs…), and you export the corrected model. All in your browser, with no account. If it is your first time, start with ', { text: 'how to check an IFC model before delivery', to: 'how-to-check-ifc-model-before-delivery' }, '.'] },
      { type: 'p', text: 'That works well for one file. For thirty, it does not.' },
      { type: 'h2', text: 'One folder, one profile, one table (preview)' },
      { type: 'p', text: 'With the batch you drop a folder or a zip (up to 50 files or 2 GB in total), choose the profile to check them with (your client\'s standard, an IDS, the ISO 19650 naming convention) and watch the progress file by file. If you cancel, what was already checked is kept.' },
      shot('batch-ifc-check-folder-results', 1440, 900, 'Batch of IFC files checked: a table with the score, issues and worst rule of each file', 'Design preview with sample data, Spanish interface.'),
      { type: 'p', text: ['What matters is where it happens: in your browser, like the free check. The files are not uploaded to any server, so it also suits projects under NDA, and it uses no credits. To understand the difference, read ', { text: 'validating in the browser or in the cloud', to: 'browser-vs-cloud-ifc-validation' }, '.'] },
      { type: 'p', text: 'Anything that is not IFC is skipped and listed ("3 files ignored: .dwg, .pdf"). An IFC that cannot be read is marked red without stopping the rest.' },
      { type: 'h2', text: 'Start with these 3' },
      { type: 'p', text: 'A table in folder order is not a decision. The batch sorts by severity: unreadable files first, then the lowest scores. At the top a band shows the three files to start with, and each row says how many failures have an automatic fix in the free viewer.' },
      shot('batch-ifc-check-start-with-these-3', 1440, 900, 'Batch sorted by severity with the "Start with these 3" band and the free fix on each row', 'Design preview with sample data, Spanish interface. Fixing file by file stays free; the batch only takes you there.'),
      { type: 'p', text: 'The "failing only" filter clears away what is already fine.' },
      { type: 'h2', text: 'What comes out of the batch' },
      {
        type: 'ul',
        items: [
          'A CSV with one row per file: score, issues, worst rule, status. For your own records or for the invoice.',
          'A BCF 2.1 zip with one issue per file and rule, to open in BIMcollab, Solibri or the viewer itself.',
          'A batch report with your logo, as printable HTML to save as PDF, for your client or the site supervisor.',
        ],
      },
      { type: 'p', text: 'It also works on a phone, to look at the result away from the office:' },
      shot('batch-ifc-check-phone', 390, 844, 'Batch result on a phone', 'Design preview with sample data, Spanish interface.'),
      { type: 'h2', text: 'How it compares' },
      { type: 'p', text: ['Tools that also check several IFC files, with prices from their official pages read on 12 November 2026. Where we could not read an official price, we do not give one. ', { cite: 'solibri-pricing' }, ' ', { cite: 'bimvision-plugins' }] },
      {
        type: 'table',
        headers: ['', 'BIMvision + plugins', 'Solibri', 'IFC Viewer Online (preview)'],
        rows: [
          ['Where it runs', 'Windows', 'Windows / Mac', 'Browser, nothing to install'],
          ['Are the files uploaded?', 'No', 'No', 'No'],
          ['IDS checking', 'Paid plugin', 'Yes', 'Yes (EIR profile or IDS 1.0)'],
          ['Sorted by severity, "where to start"', 'No', 'By rule', 'Yes'],
          ['Report with your own branding', 'Paid plugin', 'Yes', 'Yes'],
          ['Price', 'Viewer free; plugins paid (see their store)', 'From €1,428/year per licence (Essential)', 'Planned within Pro, from €39/month'],
        ],
        caption: 'Sources: solibri.com/pricing and bimvision.eu/en/plugins, read on 12 November 2026 (the BIMvision plugins page shows no prices). Our planned prices are on the pricing page.',
      },
      { type: 'p', text: ['For a general comparison of checkers, see ', { text: 'the best IFC model checkers', to: 'best-ifc-model-checkers-2026' }, '.'] },
      { type: 'h2', text: 'What stays free' },
      { type: 'p', text: 'Everything there is today: opening, checking, the Health Score, the automatic fixes and exporting the corrected IFC, file by file. The batch is a new productivity tool and it will be paid; it takes nothing away from the rest.' },
      { type: 'tool', id: 'validator', why: 'Check one IFC file now, free and without uploading it.' },
      { type: 'h2', text: 'Do you check a lot of IFC files every month?' },
      { type: 'p', text: ['If every month you have a whole folder to review, ', { text: 'join the waitlist', href: `${SITE}/pricing/?role=solo` }, ' and we will tell you when the batch opens. Meanwhile, you can ', { text: 'check any IFC for free', href: `${SITE}/ifc-validator/` }, '.'] },
    ],
  },
]
