import type { BlogPost, ContentBlock } from './blog-posts'

// Three posts written on 2026-11-13 from what was built after 2026-11-12 and
// checked against the local backend with real IFC files (docs-planning/32):
// the supplier upload page, how a delivery workspace keeps each party's data
// apart, and a reception pilot step by step. Same rules as the other preview
// posts:
//   - Every paid tool is a PREVIEW. Calls to action: the waitlist and "talk to
//     us" (/pricing/?role=…, /for-contractors/).
//   - What is free today is said to be free.
//   - Other vendors only from their official pages, with the date read.
//   - The pictures are captures of the workspace running against our own
//     server on this machine with the Hotel Vela test models (real IFC files);
//     the captions say so, and that the interface is in Spanish.
//
// One query, one page:
//   "IFC upload page for subcontractors / no account"  → supplier-ifc-upload-page-no-account
//     (how to review what arrives stays with review-subcontractor-ifc-models)
//   "who sees what in a delivery CDE / isolation"       → cde-supplier-data-isolation
//     (the IT checklist of the free viewer stays with bim-tool-it-security-checklist)
//   "IFC reception pilot, step by step"                 → ifc-reception-pilot-step-by-step

const SITE = 'https://www.ifcvieweronline.eu'
const READ = '13 November 2026'
const DATE = '2026-11-13'

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

const LIVE = 'Local test of the workspace on our own server with the Hotel Vela test models (real IFC files), Spanish interface. Not open yet.'

const PRICING = { id: 'ivo-pricing', title: 'IFC Viewer Online plans', source: 'IFC Viewer Online', year: '2026', url: `${SITE}/pricing/`, note: 'Planned prices of the paid plans, which are not open yet.' }
const ADSK_BYOS = { id: 'autodesk-byos', title: 'Bring Your Own Subscription (BYOS) for BIM Collaborate Pro', source: 'Autodesk', year: '2026', url: 'https://help.autodesk.com/cloudhelp/ENU/About-BIM360/files/about-bim-360-design/About_BIM360_about_bim_360_design_bring_your_own_subscription_html.html', note: `Hosts can invite members from other companies who hold valid subscriptions. Read on ${READ}.` }
const ADSK_SIGNIN = { id: 'autodesk-docs-signin', title: 'Launch BIM 360 Docs and Sign In', source: 'Autodesk', year: '2026', url: 'https://help.autodesk.com/cloudhelp/ENU/BIM360D-Document-Management/files/About-Autodesk-BIM-360-Document/GUID-B2A283BC-2F01-4810-A2B0-36DC4ED81612.html', note: `Invitees sign in with an Autodesk ID or create one. Read on ${READ}.` }
const UK_PART_C = { id: 'uk-bim-part-c', title: 'Guidance Part C: Facilitating the common data environment', source: 'UK BIM Framework', year: '2021', url: 'https://ukbimframework.org/wp-content/uploads/2021/02/Guidance-Part-C_Facilitating-the-common-data-environment-workflow-and-technical-solutions_Edition-1.pdf', note: `Describes the review and acceptance of information by the party that receives it. Read on ${READ}.` }
const ISO_19650_5 = { id: 'iso-19650-5', title: 'ISO 19650-5:2020, security-minded approach to information management', source: 'ISO (record at the Standards Council of Canada)', year: '2020', url: 'https://scc-ccn.ca/standardsdb/standards/8170171', note: `Scope: principles and requirements for the security-minded management of sensitive information, with or without BIM. Read on ${READ}.` }

export const PREVIEW_FEATURE_POSTS3_EN: BlogPost[] = [
  // ── The supplier's upload page ─────────────────────────────────────────
  {
    slug: 'supplier-ifc-upload-page-no-account',
    title: 'An IFC Upload Page for Subcontractors Who Will Never Create an Account',
    seoTitle: 'IFC Upload Page for Subcontractors, No Account Needed',
    seoDescription: 'Subcontractors check their IFC in the browser, send it and get a SHA-256 receipt. No account, no licence. In preview, tested with real files.',
    excerpt: 'Subcontractors send models by email and WeTransfer because every CDE asks them for an account first. A preview of an upload page that needs only a link: the file is checked in their browser, delivered with a receipt, and the decision comes back to the same page.',
    date: DATE,
    dateModified: DATE,
    author: 'IFC Viewer Online',
    category: 'Delivery & ISO 19650',
    categorySlug: 'delivery',
    readTimeMin: 6,
    heroImage: 'blog/images/live-supplier-upload-check.jpg',
    heroAlt: 'The supplier upload page after a real IFC is checked and sent: score 100, the ISO 19650 name accepted and a receipt with the SHA-256 of the file',
    heroCredit: 'IFC Viewer Online',
    keywords: ['IFC upload page subcontractors', 'receive IFC from subcontractors', 'subcontractor model upload no account', 'IFC delivery receipt', 'supplier portal BIM', 'ISO 19650 file naming check'],
    references: [ADSK_BYOS, ADSK_SIGNIN, UK_PART_C, PRICING],
    faqs: [
      { q: 'Does the subcontractor need an account?', a: 'No. They open the link you send them. The link carries a token for that supplier and that project only.' },
      { q: 'Is the file uploaded before it is checked?', a: 'No. It is checked first in the supplier\'s browser with the same validator as the free viewer, and only sent when they press send.' },
      { q: 'What can I use today, for free?', a: 'The requirements link: your rules, a minimum score and your ISO 19650 naming convention, checked in the supplier\'s browser. Sending the file to your inbox, the receipt and the decision are part of the Reception plan, in preview.' },
      { q: 'Which plan will it be in?', a: 'Reception, planned per project or unlimited. The planned prices are on the pricing page.' },
    ],
    content: [
      { type: 'callout', variant: 'info', title: 'Preview', text: ['The requirements link is free today. Delivering the file to your inbox, the receipt and the decision are built and tested with real IFC files on our own server, but not open yet. We are looking for a few contractors to pilot it: ', { text: 'talk to us', href: `${SITE}/pricing/?role=receive` }, '.'] },
      { type: 'p', text: 'Ask a BIM manager how models arrive from subcontractors and the answer is rarely "through the CDE". They arrive by email, by WeTransfer, on a USB stick. Not because subcontractors are careless, but because every common data environment asks them for something first: an account, an invitation, sometimes a licence.' },
      { type: 'p', text: ['Autodesk\'s own help pages describe that path: an invitee signs in with an Autodesk ID or creates one, and members from other companies are invited under "Bring Your Own Subscription", as long as they hold valid subscriptions. ', { cite: 'autodesk-docs-signin' }, ' ', { cite: 'autodesk-byos' }, ' For a team that delivers to one contractor twice a month, that is a lot to ask.'] },
      {
        type: 'takeaways',
        items: [
          'One link per supplier and project. No account, no licence, nothing to install.',
          'The file is checked in the supplier\'s browser before it is sent: score, rules and ISO 19650 name.',
          'Sending gives a receipt with the SHA-256 fingerprint of the file.',
          'The decision (accepted or returned, with the reason) comes back to the same page.',
        ],
      },
      { type: 'h2', text: 'What the supplier sees' },
      { type: 'p', text: 'The page opens with three lines: the requirements and the minimum score, the file name the project expects (for example HVL-INSTAL-ZZ-XX-M3-…-S2-P01.ifc) and the next delivery date. Below, one box to drop the IFC.' },
      { type: 'p', text: 'In our test, the MEP subcontractor of the Hotel Vela project dropped a real IFC. The page opened it with the viewer\'s own engine, gave it 100 against a minimum of 80, and confirmed the name field by field. Only then did the send button appear.' },
      shot('live-supplier-upload-check', 1320, 1480, 'The supplier page after a real IFC is checked and sent: score 100, the ISO 19650 name accepted and a receipt with the SHA-256 of the file', LIVE),
      { type: 'p', text: 'If something fails, the page says what and where, before anything is sent. The supplier fixes it in their own tool and tries again. The receiving team never sees the failed attempts.' },
      { type: 'h2', text: 'The receipt settles the argument' },
      { type: 'p', text: 'When the supplier presses send, the file goes straight to storage and the page shows a receipt: file name, SHA-256 and the time it was received. If the same file is sent twice, it is one delivery, not two. If a file that is not an IFC arrives (a ZIP renamed to .ifc, for example), it is returned before anyone validates it.' },
      { type: 'p', text: ['That fingerprint is the same one written in the contractor\'s delivery log, chained to the previous entry. How the receiving side reviews and decides is in ', { text: 'how to review your subcontractors\' IFC models', to: 'review-subcontractor-ifc-models' }, '.'] },
      { type: 'h2', text: 'The decision comes back to the same page' },
      { type: 'p', text: 'Under the drop box the supplier sees their own deliveries, and only theirs: waiting for validation, accepted with the score, or returned with the reason the contractor wrote. No email thread to search.' },
      shot('live-supplier-upload-history', 1320, 1720, 'The supplier\'s own deliveries on the upload page: two accepted with score 100 and one returned with the reason written by the contractor', LIVE),
      { type: 'p', text: ['A link only shows the project it was made for and that supplier\'s deliveries. We tested that on purpose; there is more on it in ', { text: 'who sees which model in a delivery CDE', to: 'cde-supplier-data-isolation' }, '.'] },
      { type: 'h2', text: 'How it compares' },
      {
        type: 'table',
        headers: ['', 'A CDE with invited members', 'Email / file transfer', 'Upload page (preview)'],
        rows: [
          ['Account for the supplier', 'Yes (Autodesk ID, subscription for external members)', 'No', 'No: one link per supplier and project'],
          ['Checked before sending', 'Depends on the setup', 'No', 'Yes, in the supplier\'s browser'],
          ['Proof of what was sent', 'Version history', 'The email', 'Receipt with SHA-256, chained in the log'],
          ['Decision back to the supplier', 'Review workflows', 'Another email', 'On the same page, with the reason'],
        ],
        caption: `Sources: Autodesk help pages on signing in and on Bring Your Own Subscription, read on ${READ}. Our planned prices are on the pricing page.`,
      },
      { type: 'h3', text: 'What it does not do yet' },
      {
        type: 'ul',
        items: [
          'The server does not yet re-check the ISO 19650 name: today that check runs in the supplier\'s browser.',
          'The invitation email is placed in a queue and not sent: sending is switched off until it opens.',
          'It has not been used yet by a real subcontractor outside our tests.',
        ],
      },
      { type: 'h2', text: 'Try it on a project' },
      { type: 'p', text: ['The requirements link (rules, minimum score, ISO 19650 names) is free today: create it from the viewer and paste it into your BEP. If you want suppliers to deliver through it, with the receipt and the decision, ', { text: 'talk to us about a pilot', href: `${SITE}/pricing/?role=receive` }, ' or read the ', { text: 'page for contractors', href: `${SITE}/for-contractors/` }, '.'] },
      { type: 'related', to: 'ifc-reception-pilot-step-by-step' },
    ],
  },

  // ── Who sees what in a delivery CDE ────────────────────────────────────
  {
    slug: 'cde-supplier-data-isolation',
    title: 'Who Sees Which Model: Keeping Suppliers\' Data Apart in a Delivery CDE',
    seoTitle: 'Supplier Data Isolation in a Delivery CDE: What to Test',
    seoDescription: 'Five questions for any CDE that receives models from many companies, and how we tested each one with real IFC files.',
    excerpt: 'A delivery workspace holds models from many companies who must not see each other\'s work. Five questions to ask any CDE that receives models, and the tests we ran on ours before calling it ready.',
    date: DATE,
    dateModified: DATE,
    author: 'IFC Viewer Online',
    category: 'Delivery & ISO 19650',
    categorySlug: 'delivery',
    readTimeMin: 7,
    heroImage: 'blog/images/live-reception-register-chain.jpg',
    heroAlt: 'Delivery log of a project with 16 entries, the SHA-256 of each file and the chain recalculated in the browser and found intact',
    heroCredit: 'IFC Viewer Online',
    keywords: ['CDE data isolation', 'CDE security subcontractors', 'ISO 19650-5 CDE', 'who can see models CDE', 'BIM delivery audit trail', 'SHA-256 delivery log'],
    references: [ISO_19650_5, UK_PART_C, PRICING],
    faqs: [
      { q: 'Is the free viewer affected by any of this?', a: 'No. The free viewer opens and checks IFC files in your browser and does not upload them. This post is about the Reception workspace, in preview, where deliveries are stored on a server.' },
      { q: 'Can one supplier see another supplier\'s model?', a: 'No. A supplier link shows only its own project and that supplier\'s deliveries. We found and fixed a case where the token alone listed every project of the company before the page was finished.' },
      { q: 'Can I prove a file was not changed after it was delivered?', a: 'Each delivery is logged with the SHA-256 of the file, chained to the previous entry. The chain can be recalculated in the browser; an edited entry breaks it.' },
      { q: 'Where can I see the IT questions about the free viewer?', a: 'In the BIM tool IT security checklist, linked at the end of this post.' },
    ],
    content: [
      { type: 'callout', variant: 'info', title: 'Preview', text: ['Reception is built and tested with real IFC files on our own server, and not open yet. Everything below was checked by automated tests that run against that server. If you want to test it on one of your projects, ', { text: 'talk to us', href: `${SITE}/pricing/?role=receive` }, '.'] },
      { type: 'p', text: 'A contractor\'s delivery workspace is an odd place. The structural engineer, the MEP installer and the façade company all deliver into it, and each one is, on another project, the other\'s competitor. They must see the requirements and their own work. They must not see each other\'s.' },
      { type: 'p', text: ['ISO 19650-5 sets out a security-minded approach to managing sensitive information on built assets, whether or not the project uses BIM. ', { cite: 'iso-19650-5' }, ' You do not need to apply the whole standard to ask a CDE five plain questions.'] },
      {
        type: 'takeaways',
        items: [
          'What does a supplier link show, and what does it not?',
          'What can each role in the receiving team do, and what is refused?',
          'Can one company ever read another company\'s data?',
          'Is the file that was checked the file that was delivered?',
          'If someone edits the record afterwards, does it show?',
        ],
      },
      { type: 'h2', text: '1. What a supplier link shows' },
      { type: 'p', text: 'A supplier link carries a token for one supplier. On its own it shows nothing. With the project it was made for, it shows that project\'s requirements and that supplier\'s deliveries, never another supplier\'s.' },
      { type: 'p', text: 'We say this plainly because we got it wrong first: while building the upload page, our tests found that the token alone listed every project of the company. It was fixed before the page was merged, and a test now checks it on every run.' },
      { type: 'h2', text: '2. What each role can do' },
      { type: 'p', text: 'Inside the contractor\'s team there are six roles, from owner to guest. Our tests have every role try every write and expect exactly what the role allows. A few examples of what is refused:' },
      {
        type: 'ul',
        items: [
          'A reviewer can see deliveries but cannot accept or return them.',
          'A guest cannot see deliveries at all.',
          'A viewer cannot place an email in the outgoing queue.',
          'Only owners and admins can change the company\'s rule library.',
        ],
      },
      { type: 'p', text: 'When two people edit the same issue or ruleset at once, the second one gets the current copy and a conflict, instead of silently overwriting the first.' },
      { type: 'h2', text: '3. One company never reads another' },
      { type: 'p', text: 'Our tests create a second company on the same server and try to read and write the first one\'s deliveries, issues and rules with its own users. Every attempt is refused. The test runs with the others, so a change that breaks it does not go unnoticed.' },
      { type: 'h2', text: '4. The file checked is the file delivered' },
      { type: 'p', text: 'The supplier\'s browser computes the SHA-256 of the file and registers it before uploading. The validation runner checks that fingerprint and the IFC header before it opens anything: a file that changed on the way, or one that is not an IFC, is returned before validation. The person who decides sees the same fingerprint, and their decision is sealed with it.' },
      shot('live-reception-delivery-detail', 1256, 1464, 'One delivery opened: two versions side by side, the ISO 19650 name field by field, the score against the minimum and the reason it was returned', LIVE),
      { type: 'h2', text: '5. A record that shows if it is edited' },
      { type: 'p', text: ['Every delivery and every decision is a line in the log, with the date, the author and the fingerprint, chained to the line before. "Check the chain" recalculates every hash in your browser; in our test project, 16 entries matched. If someone edits a line, the chain breaks at that line. The UK BIM Framework describes review and acceptance as a step of the party that receives the information; ', { cite: 'uk-bim-part-c' }, ' this log is the evidence of each acceptance.'] },
      shot('live-reception-register-chain', 1600, 1025, 'Delivery log of a project with 16 entries, the SHA-256 of each file and the chain recalculated in the browser and found intact', LIVE),
      { type: 'h2', text: 'What leaves the workspace' },
      {
        type: 'ul',
        items: [
          'Webhooks are signed with HMAC-SHA256, so your system can tell they came from us.',
          'Emails go to a queue and wait there. A contact who never agreed, or who unsubscribed, is refused by the queue itself.',
          'Client links store only the hash of the token and of the password, expire, can be revoked and lock after 10 failed attempts.',
        ],
      },
      { type: 'h3', text: 'What is not done yet' },
      {
        type: 'ul',
        items: [
          'It runs on our own server in tests, not yet as a hosted service with a contract.',
          'There is no external security audit yet.',
        ],
      },
      { type: 'h2', text: 'Ask the same of any CDE' },
      { type: 'p', text: ['These five questions work for any tool, ours included. For the questions an IT department asks about the free viewer (where files go, cookies, sub-processors), see ', { text: 'the BIM tool IT security checklist', to: 'bim-tool-it-security-checklist' }, '. To test Reception on a real project, ', { text: 'talk to us', href: `${SITE}/pricing/?role=receive` }, '.'] },
      { type: 'related', to: 'supplier-ifc-upload-page-no-account' },
    ],
  },

  // ── A reception pilot, step by step ────────────────────────────────────
  {
    slug: 'ifc-reception-pilot-step-by-step',
    title: 'Piloting IFC Model Reception on One Project: A Step-by-Step Walkthrough',
    seoTitle: 'IFC Model Reception Pilot, Step by Step',
    seoDescription: 'How a contractor pilots receiving IFC models on one project: requirements, suppliers, first deliveries, decisions, log and automations.',
    excerpt: 'Before changing how a whole company receives models, try it on one project. The steps of a reception pilot, as we ran them on the Hotel Vela test project with real IFC files: what to set up, what to measure and what to expect in the first weeks.',
    date: DATE,
    dateModified: DATE,
    author: 'IFC Viewer Online',
    category: 'Delivery & ISO 19650',
    categorySlug: 'delivery',
    readTimeMin: 7,
    heroImage: 'blog/images/live-reception-demo-flow.jpg',
    heroAlt: 'Reception inbox of the Hotel Vela test project with seven deliveries and the first step of the guided demo: a supplier delivers a model',
    heroCredit: 'IFC Viewer Online',
    keywords: ['BIM reception pilot', 'pilot IFC delivery process', 'receive IFC models contractor', 'subcontractor model acceptance', 'ISO 19650 acceptance workflow'],
    references: [UK_PART_C, PRICING],
    faqs: [
      { q: 'How long does a pilot take?', a: 'Plan for four to six weeks on one project with three or four suppliers: enough for each supplier to deliver two or three times.' },
      { q: 'Do suppliers need to install anything?', a: 'No. They receive a link, check their IFC in the browser and send it. No account.' },
      { q: 'What should I measure?', a: 'Share of deliveries accepted the first time, days from delivery to decision, and how many returns end in a phone call.' },
      { q: 'Can I see it before a pilot?', a: 'Yes: the guided demo in the workspace walks through the eight steps with sample data, in your browser.' },
    ],
    content: [
      { type: 'callout', variant: 'info', title: 'Preview', text: ['Reception is built and tested with real IFC files on our own server, and not open yet. We are looking for a few contractors to run this pilot with us: ', { text: 'talk to us', href: `${SITE}/pricing/?role=receive` }, '. You can also walk through the ', { text: 'guided demo', href: `${SITE}/workspace?demo=reception-flow` }, ' in your browser.'] },
      { type: 'p', text: 'Nobody changes how a whole company receives models in one go. The sensible way is one project, three or four suppliers, a few weeks. These are the steps, as we ran them on our Hotel Vela test project with real IFC files from the architecture, structure and MEP models.' },
      {
        type: 'takeaways',
        items: [
          'One project, three or four suppliers, four to six weeks.',
          'Agree the requirements and the naming before the first delivery, not after.',
          'Measure three numbers: accepted the first time, days to decide, calls per return.',
          'Switch on automations only once the manual decisions look right.',
        ],
      },
      { type: 'h2', text: 'Step 1: the requirements' },
      { type: 'p', text: ['Create the project with a minimum score, your rules and the ISO 19650 naming convention: in our test, project code HVL, minimum 80, delivery due on Thursdays at 12:00. If you are not sure what to require, start with ', { text: 'IFC acceptance criteria', to: 'ifc-acceptance-criteria' }, '. Test the rules before anyone receives them: ', { text: 'writing and testing your own rules', to: 'write-test-custom-bim-rules' }, ' shows how.'] },
      { type: 'h2', text: 'Step 2: invite the suppliers' },
      { type: 'p', text: 'Each supplier gets a link of their own, shown once. Send it the way you already talk to them. In our test there were four: architecture, structure, MEP and façades.' },
      { type: 'h2', text: 'Step 3: the first deliveries' },
      { type: 'p', text: ['Suppliers check in their browser and send. What arrives in your inbox is already validated: score against the minimum, name check, accepted or returned. In our test, six real files arrived; a ZIP renamed as .ifc was returned before validation. The supplier side is described in ', { text: 'an upload page for suppliers without an account', to: 'supplier-ifc-upload-page-no-account' }, '.'] },
      shot('live-reception-inbox', 1600, 1356, 'Reception inbox with seven IFC deliveries from four suppliers: score against the minimum, ISO 19650 name check and whether each was accepted or returned', LIVE),
      { type: 'p', text: 'Expect the name check to fail a lot in the first week. In our test every early file used the old project code; only the delivery made through the link with the agreed name passed. That is the point of the pilot: the convention gets fixed once, not argued about at every delivery.' },
      { type: 'h2', text: 'Step 4: decide, with reasons' },
      { type: 'p', text: 'Open a delivery, compare it with the previous version, accept or return it with a reason. The reason goes back to the supplier\'s page; the decision is sealed with the file\'s fingerprint.' },
      { type: 'h2', text: 'Step 5: the log' },
      { type: 'p', text: ['Every delivery and decision is logged and chained. At the end of the pilot, export it: it is the record of what each supplier delivered, and when. Why that matters is in ', { text: 'who sees which model in a delivery CDE', to: 'cde-supplier-data-isolation' }, '.'] },
      { type: 'h2', text: 'Step 6: automations, last' },
      { type: 'p', text: 'Once the manual decisions look right, let the routine ones run alone. In our test, a rule that watches for deliveries under 95 placed an email for the site manager in the outgoing queue each time it matched. The queue never sends anything until sending is switched on.' },
      shot('live-automation-queue-mail-runs', 1600, 757, 'Two automations on supplier deliveries and their latest runs: each one left an email for the site manager in the queue', LIVE),
      { type: 'h2', text: 'What to measure' },
      {
        type: 'table',
        headers: ['Measure', 'How', 'What a good pilot shows'],
        rows: [
          ['Accepted the first time', 'Share of deliveries accepted without a return', 'It rises from the first to the third delivery of each supplier'],
          ['Days to decide', 'Median from delivery to decision', 'Decisions in the same week, not at the next meeting'],
          ['Calls per return', 'Count the calls that follow a return', 'Fewer: the reason and the fix travel with the return'],
        ],
        caption: 'The workspace computes the first two; the third you count yourself.',
      },
      { type: 'h3', text: 'What the pilot will not show yet' },
      {
        type: 'ul',
        items: [
          'Emails to suppliers and to the client wait in the queue; sending is switched off.',
          'Watched folders on SharePoint or Google Drive are tested with a stand-in, not yet with real accounts.',
          'The weekly report for site management still uses sample data.',
        ],
      },
      { type: 'h2', text: 'Run it with us' },
      { type: 'p', text: ['If you receive models from several suppliers and want to try this on one project, ', { text: 'talk to us about a pilot', href: `${SITE}/pricing/?role=receive` }, '. If you would rather look first, open the ', { text: 'guided demo', href: `${SITE}/workspace?demo=reception-flow` }, ' or the ', { text: 'page for contractors', href: `${SITE}/for-contractors/` }, '.'] },
      { type: 'related', to: 'review-subcontractor-ifc-models' },
    ],
  },
]
