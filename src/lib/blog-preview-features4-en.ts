import type { BlogPost, ContentBlock } from './blog-posts'

// Three posts written on 2026-11-14 about project mail (PR #594): ten
// templates on one editorial system, each for one reader. Same rules as the
// other preview posts:
//   - Project mail is a PREVIEW: built, sending switched off. Calls to action:
//     the waitlist (/pricing/?role=team).
//   - What is free today is said to be free.
//   - The pictures are the real templates rendered by the product with sample
//     data (a residential job in Badalona); the workspace captures show the
//     Spanish interface and the captions say so.
//
// One query, one page:
//   "BIM email templates / project communication templates" → bim-project-email-templates
//   "weekly BIM coordination report (email)"                → weekly-bim-coordination-report-email
//   "email subcontractors model changes / what changed"     → subcontractor-model-change-email
//   (the weekly update to the CLIENT stays with weekly-bim-client-update)

const SITE = 'https://www.ifcvieweronline.eu'
const DATE = '2026-11-14'

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

const SAMPLE = 'Template rendered by the product with sample data. Sending is switched off.'
const ES_UI = 'Preview of the workspace with sample data, Spanish interface. Sending is switched off.'

const PRICING = { id: 'ivo-pricing', title: 'IFC Viewer Online plans', source: 'IFC Viewer Online', year: '2026', url: `${SITE}/pricing/`, note: 'Planned prices of the paid plans, which are not open yet.' }
const GMAIL_CLIP = { id: 'gmail-clipping', title: 'Email sender guidelines and message size', source: 'Google Workspace Admin Help', year: '2026', url: 'https://support.google.com/a/answer/81126', note: 'Google\'s guidance for senders to Gmail. The 102 KB point at which Gmail clips a message is widely reported by email developers rather than stated on this page; we keep every template under it.' }
const ISO_19650_2 = { id: 'iso-19650-2', title: 'ISO 19650-2:2018, delivery phase of the assets', source: 'ISO', year: '2018', url: 'https://www.iso.org/standard/68080.html', note: 'Defines the information exchanges of the delivery phase, including the task information delivery plans each party works to.' }

const CTA: ContentBlock = { type: 'p', text: ['Project mail is in preview. If you coordinate a project and write these emails every week, ', { text: 'join the waitlist', href: `${SITE}/pricing/?role=team` }, ' and we will open it to you first. ', { cite: 'ivo-pricing' }] }
const PREVIEW: ContentBlock = { type: 'callout', variant: 'info', title: 'Preview', text: ['Project mail is designed and built, but sending is switched off. The pictures are the real templates rendered by the product with sample data. ', { text: 'Join the waitlist', href: `${SITE}/pricing/?role=team` }, ' to try it when it opens.'] }

export const PREVIEW_FEATURE_POSTS4_EN: BlogPost[] = [
  // ── Ten templates, one per reader ───────────────────────────────────────
  {
    slug: 'bim-project-email-templates',
    title: 'Ten Email Templates for BIM Coordination, Each Written for One Reader',
    seoTitle: 'BIM Project Email Templates for Each Reader',
    seoDescription: 'Ten email templates for BIM coordinators: client, subcontractors, coordinators and internal teams, filled with model data. Designed to read in five seconds.',
    excerpt: 'A client, a subcontractor and a BIM manager need different emails about the same project. Ten templates on one editorial system, each written for one reader and filled with the numbers of the model.',
    date: DATE,
    dateModified: DATE,
    author: 'IFC Viewer Online',
    category: 'Delivery & ISO 19650',
    categorySlug: 'delivery',
    readTimeMin: 7,
    heroImage: 'blog/images/mail-templates-hero.jpg',
    heroAlt: 'Four project emails side by side: a milestone delivery for the client, the weekly coordination report, a version change for one trade and the monthly newsletter',
    heroCredit: 'IFC Viewer Online',
    keywords: ['BIM email templates', 'construction project email templates', 'BIM coordination communication', 'project newsletter construction', 'subcontractor email template', 'BIM report template'],
    references: [ISO_19650_2, GMAIL_CLIP, PRICING],
    faqs: [
      { q: 'Can I send these emails today?', a: 'No. Sending is switched off while the module is in preview. You can see and edit every template in the workspace preview.' },
      { q: 'Where do the numbers come from?', a: 'From the project: the Health Score of the federated model, clashes by discipline pair, BCF issues, version changes and failed IDS requirements. Where a project has no data yet, the template shows sample figures and says so.' },
      { q: 'Do they work in Outlook and on phones?', a: 'They are built the way email has to be built: tables, inline styles, Outlook conditionals, fonts every client has, a dark version and a phone layout at 375 px. We have checked them in a browser engine; checks in real mail clients come before sending opens.' },
      { q: 'Can I use my own brand?', a: 'Yes: the publication name, your accent colour (it is darkened automatically if it would be hard to read), one of three type pairings, and your studio and client logos.' },
      { q: 'Which plan will it be in?', a: 'Client and project mail is planned for Team and above. The planned prices are on the pricing page.' },
    ],
    content: [
      PREVIEW,
      { type: 'p', text: 'A BIM coordinator writes to four kinds of reader about the same project, often on the same day. The client wants to know whether things are on track. A subcontractor wants to know what changed for them and by when. Another coordinator wants the clash count, the IDS result and the version log. Procurement wants one decision with a price on it. Most projects answer all four with the same email, or with a PDF nobody opens.' },
      {
        type: 'takeaways',
        items: [
          'Ten templates, each with one reader and one purpose, stated at the top: "For: Instal·lacions Garraf (MEP)".',
          'Filled with numbers from the model: Health Score, clashes, BCF issues, version changes, failed requirements.',
          'Two registers on one system: editorial for clients and management, technical for coordinators and trades.',
          'Readable in five seconds: what happened, what is yours, by when.',
        ],
      },
      { type: 'h2', text: 'The coordinator is the editor, the project is the publication' },
      { type: 'p', text: 'Good newsletters feel like a publication: a name, an issue number, a date, a voice. We borrowed that idea, not anyone\'s design. Each project gets its own masthead, every email carries its issue number, and the footer is a drawing title block with the project, phase, revision, author and the ISO 19650 code of the email itself, so it can be filed in the common data environment like any other container.' },
      shot('mail-desktop-phone-dark', 1640, 1060, 'The weekly coordination report on a desktop, on a phone and in dark mode', SAMPLE),
      { type: 'h2', text: 'Ten templates, four readers' },
      {
        type: 'table',
        headers: ['Template', 'For', 'What it answers'],
        rows: [
          ['Weekly coordination report', 'Coordinators', 'Health Score, clashes by discipline pair, actions with owner and date, version log'],
          ['New version: what changes for you', 'One trade', 'Only the changes that touch that trade\'s routes, and what to do before the next comparison'],
          ['Clash and BCF summary', 'Trades and coordinators', 'Open clashes by pair and the BCF issues due this week, each with its view'],
          ['Milestone delivery with certificate', 'Client', 'What is delivered, that it is checked against the contract, and what comes next'],
          ['Monthly project newsletter', 'Client and team', 'The month in three figures, one pending decision, the next milestones'],
          ['RFI / pending decision', 'Internal teams', 'One question, the options with cost and time, who decides and by when'],
          ['Failed EIR/IDS requirements', 'One trade', 'Which requirements fail, on how many elements, and the redelivery date'],
          ['Coordination meeting minutes', 'Coordinators', 'Attendees, agreements, owners and dates on one page'],
          ['Welcome to the project', 'New agents', 'How files are named, delivery rules, who to ask'],
          ['Phase close and lessons learned', 'Management', 'Delivered on time or not, what it cost, three lessons'],
        ],
        caption: 'Each template states its reader in the band under the masthead.',
      },
      { type: 'h2', text: 'Editorial for the client, technical for the trades' },
      { type: 'p', text: 'A client reads an email the way they read a report: a headline that says what happened, a short paragraph, a picture of the building, a stamp that shows the model was checked. So the client templates use a large serif masthead, generous space and the model view at full width with a caption.' },
      shot('mail-client-milestone', 1280, 2900, 'Milestone delivery email for the client: headline, validation certificate with score 91, model view and the project timeline', SAMPLE),
      { type: 'p', text: 'A subcontractor reads an email the way they read a drawing. The technical templates take their look from one: grid axes along the top, numbered sections, tables with discipline tags, dates in a monospaced column so they line up. Colour appears only where something has a state, such as a requirement that fails or an issue that is open.' },
      shot('mail-phones-trades', 1640, 1180, 'Three emails on a phone: failed requirements for the façade trade, the clash and BCF summary, and an RFI for procurement', SAMPLE),
      { type: 'h2', text: 'What makes an email readable in five seconds' },
      { type: 'ol', items: [
        'Who it is for, at the top. "For: Fusteria Metàl·lica Besòs (FAC)" tells the reader before the first sentence that this one is theirs.',
        'A headline that is the news. "Three requirements to fix before P02 is accepted", not "Weekly update".',
        'One figure per idea. The Health Score with its change, open clashes with their change; no dashboards.',
        'A "What is yours" section with an owner and a date on every line.',
        'One button that opens the model at the right view, not a list of links.',
      ] },
      { type: 'h2', text: 'Built like email, not like a web page' },
      { type: 'p', text: ['Email clients are old browsers with odd rules. Every template is built with tables and inline styles, Outlook-only conditionals and a button that also draws in Outlook, fonts every client has (so nothing depends on a web font), a dark version, and a layout that stacks at 375 px. Each one has a plain-text version written block by block and a preview line. Every template stays under the size at which Gmail starts clipping messages. ', { cite: 'gmail-clipping' }, ' There is no tracking pixel.'] },
      { type: 'h2', text: 'Edit a template in the workspace' },
      { type: 'p', text: 'The gallery shows every template with a live thumbnail and a filter by reader. Open one and you can reorder blocks, hide the ones you do not need, rewrite the headline and the notes, and insert a model capture or a validation report with one click. The preview switches between desktop, phone and dark, and shows the weight of the email.' },
      shot('mail-studio-gallery', 1194, 580, 'Template gallery in the workspace, filtered by reader, with live thumbnails', ES_UI),
      shot('mail-studio-editor', 1194, 580, 'Editing the weekly report: subject, preview line and blocks that can be moved, hidden or rewritten', ES_UI),
      { type: 'related', to: 'weekly-bim-coordination-report-email' },
      { type: 'related', to: 'subcontractor-model-change-email' },
      { type: 'related', to: 'weekly-bim-client-update' },
      { type: 'h2', text: 'What is free and what is planned' },
      { type: 'p', text: ['Opening, checking and sharing a model in the viewer stays free, as today, and so does the ', { text: 'Health Score', to: 'ifc-health-score-guide' }, '. Project mail needs a server to send, so it is planned for Team and above.'] },
      CTA,
    ],
  },

  // ── The weekly coordination report ──────────────────────────────────────
  {
    slug: 'weekly-bim-coordination-report-email',
    title: 'The Weekly BIM Coordination Report: What to Put in It, and in What Order',
    seoTitle: 'Weekly BIM Coordination Report: What to Include',
    seoDescription: 'What a weekly BIM coordination report should contain, in what order: Health Score, clashes by discipline pair, actions with owner and date, version log.',
    excerpt: 'The weekly coordination report is the email other coordinators actually read, if it gets to the point. What to put in it, in what order, and a template filled with the numbers of the federated model.',
    date: DATE,
    dateModified: DATE,
    author: 'IFC Viewer Online',
    category: 'Delivery & ISO 19650',
    categorySlug: 'delivery',
    readTimeMin: 6,
    heroImage: 'blog/images/mail-weekly-report-top.jpg',
    heroAlt: 'Top of a weekly BIM coordination report: grid axes, masthead, headline with 37 open clashes, Health Score stamp of 82 and three figures',
    heroCredit: 'IFC Viewer Online',
    keywords: ['weekly BIM coordination report', 'BIM coordination report template', 'clash report email', 'BIM coordinator weekly report', 'federated model status report'],
    references: [ISO_19650_2, PRICING],
    faqs: [
      { q: 'Who should receive the weekly coordination report?', a: 'Coordinators and BIM managers of every party, and the people who own the actions in it. The client gets a different email with fewer numbers.' },
      { q: 'How long should it be?', a: 'Long enough to hold the actions, short enough to read on a phone between meetings. One screen of headline and figures, then the details for whoever needs them.' },
      { q: 'Can the numbers fill themselves in?', a: 'In the preview, yes: the Health Score, clashes and issues come from the project data when the workspace has it, and from sample figures when it does not.' },
      { q: 'Is this available today?', a: 'The template is built; sending is switched off while project mail is in preview.' },
    ],
    content: [
      PREVIEW,
      { type: 'p', text: 'Every Friday a coordinator writes the same email: what changed in the federated model, where the clashes are, who has to do what before the next meeting. It is written from memory, it is too long, and the actions are buried in the fourth paragraph. Yet it is the one email every party reads, because it decides their next week.' },
      {
        type: 'takeaways',
        items: [
          'Start with the news in one sentence, with the number in it.',
          'Then the state of the model: Health Score, what it was measured against, and the change since last week.',
          'Clashes by discipline pair, with owner and date, not a total.',
          'Actions numbered, each with one owner and one date.',
          'The version log last, for those who need it.',
        ],
      },
      { type: 'h2', text: 'The order, section by section' },
      {
        type: 'steps',
        items: [
          { title: 'The headline is the news', body: '"37 open clashes (−12). Drainage × ground-floor beams still critical." The reader knows the trend and the problem before reading anything else. Then two or three sentences of context and the editor\'s name.' },
          { title: 'State of the federated model', body: ['The Health Score as a stamp: the number, the change since last week, and what it was measured against, such as the project\'s IDS file and how many requirements pass. Without the "measured against", a score is an opinion. See ', { text: 'what the Health Score measures', to: 'ifc-health-score-guide' }, '.'] },
          { title: 'Three figures', body: 'Open clashes, BCF issues opened and closed this week, the share of IDS requirements that pass. Each with its change. Three is enough; a fourth figure is usually a dashboard in disguise.' },
          { title: 'Clashes by discipline pair', body: ['A total says nothing about who has the work. STR × MEP 27 → 21, ARC × STR 13 → 9: each pair with its owner and its due date. The numbers come from ', { text: 'clash detection', to: 'ifc-clash-detection-browser' }, '.'] },
          { title: 'One model view', body: 'One capture with a caption that says what it shows: elevation, level, model revision, what is highlighted. And a link that opens the same view in the viewer.' },
          { title: 'Actions, owner, date', body: 'Numbered so they can be referred to in the meeting ("4.2 is done"). One owner per line, one date per line.' },
          { title: 'Version log', body: 'Which container moved from which revision to which, in one line each, with the ISO 19650 name. The people who need it will look; the others can stop reading here.' },
        ],
      },
      shot('mail-weekly-report-top', 1280, 1900, 'Weekly coordination report: masthead, headline, Health Score stamp, three figures, clashes by discipline pair and model view', SAMPLE),
      { type: 'h2', text: 'Small details that make it read like a document' },
      { type: 'ul', items: [
        'Grid axes A to F along the top, like a drawing sheet, so it is recognisable in the inbox.',
        'Discipline tags (ARC, STR, MEP, FAC) as small labels next to the data, not as decoration.',
        'Dates and figures in a monospaced column, so they line up and can be scanned.',
        'A title block as the footer: project, phase, revision, author, date and the ISO 19650 code of the report.',
      ] },
      { type: 'p', text: ['The title block is not decoration. ISO 19650-2 treats project communication as information exchanged during delivery; giving the report a container code means it can be filed and found in the common data environment like any other deliverable. ', { cite: 'iso-19650-2' }, ' For the naming itself, see ', { text: 'the ISO 19650 file naming convention', to: 'iso-19650-file-naming-convention' }, '.'] },
      { type: 'h2', text: 'The same report on a phone and in dark mode' },
      { type: 'p', text: 'Half of these emails are read on a phone on site. The template stacks at phone width: the stamp and the figures go one under the other, the owner column of the clash table hides, the title block becomes a list. In dark mode the paper turns dark and the discipline colours switch to lighter versions that still read.' },
      shot('mail-desktop-phone-dark', 1640, 1060, 'The same weekly report on a desktop, on a phone and in dark mode', SAMPLE),
      { type: 'related', to: 'bim-project-email-templates' },
      { type: 'related', to: 'shared-bcf-issues-small-teams' },
      CTA,
    ],
  },

  // ── What changed for one subcontractor ──────────────────────────────────
  {
    slug: 'subcontractor-model-change-email',
    title: 'Tell Each Subcontractor Only What Changed for Them',
    seoTitle: 'Email Subcontractors Only What Changed for Them',
    seoDescription: 'When a model revision lands, send each trade only the changes that touch their work, with a view and a date. Plus failed IDS requirements and BCF issues due.',
    excerpt: 'A new architectural revision has 41 changes; the services trade cares about six. Emails that tell each subcontractor only what changed for them, what fails in their delivery and which issues are due, each with a view and a date.',
    date: DATE,
    dateModified: DATE,
    author: 'IFC Viewer Online',
    category: 'Delivery & ISO 19650',
    categorySlug: 'delivery',
    readTimeMin: 6,
    heroImage: 'blog/images/mail-trade-version-change.jpg',
    heroAlt: 'Email to the MEP subcontractor: architecture publishes P05 and six changes touch their routes, with a model view and three actions due',
    heroCredit: 'IFC Viewer Online',
    keywords: ['email subcontractors model changes', 'BIM model revision notification', 'what changed IFC revision', 'subcontractor coordination email', 'failed IDS requirements email', 'BCF issues due'],
    references: [ISO_19650_2, PRICING],
    faqs: [
      { q: 'Why not send everyone the full change list?', a: 'Because a trade that gets 41 changes reads none of them. Six changes with a location and an action get done.' },
      { q: 'Which emails go to subcontractors?', a: 'Three of the ten templates: a new version with only the changes for that trade, a clash and BCF summary, and a reminder of failed EIR/IDS requirements in their delivery. A welcome email covers new agents.' },
      { q: 'Does the subcontractor need an account?', a: 'No. The email has the view, the actions and a link that opens the model in the browser.' },
      { q: 'Is this available today?', a: 'The templates are built; sending is switched off while project mail is in preview. Checking a model against requirements in the free viewer is available today.' },
    ],
    content: [
      PREVIEW,
      { type: 'p', text: 'Architecture publishes revision P05. Between P04 and P05 there are 41 changes: partitions moved, a ceiling lowered, a new shaft, a door turned. The usual email says "P05 is on the CDE, please review". The services subcontractor opens the model, looks for what changed, finds some of it, and the rest turns up as clashes three weeks later.' },
      {
        type: 'takeaways',
        items: [
          'Send each trade only the changes that touch their work, with a location (level and grid) and an action.',
          'Say who it is for at the top, so the reader knows it is theirs.',
          'Put the deadline next to each action, and one button to the model view.',
          'Use the same pattern for failed requirements and for BCF issues due.',
        ],
      },
      { type: 'h2', text: 'A new version, filtered for one trade' },
      { type: 'p', text: 'The version email starts from the trade, not from the revision. "Of the 41 changes between P04 and P05, six cross your services. The rest do not affect you." Then each change with its place: level, grid, what moved and what it means for them ("check stacks BV-07 and BV-08"). Then what is theirs, with dates, and the name the next delivery must have in the CDE.' },
      shot('mail-trade-version-change', 1280, 2700, 'Version email for the MEP trade: six changes with level and grid, a model view of the new shaft and three actions with dates', SAMPLE),
      { type: 'h2', text: 'Failed requirements, without a 40-page report' },
      { type: 'p', text: ['When a delivery fails the project\'s information requirements, the trade needs three things: which requirement, on how many elements, and an example they can find. Not the whole report. The reminder shows the score of their delivery against the ', { text: 'IDS file', to: 'ids-information-delivery-specification-guide' }, ', each failing requirement with its IFC entity and an example GUID, and the redelivery date.'] },
      { type: 'p', text: ['The same check runs for free in the viewer today: the subcontractor can open their own model and see what fails before sending it. On the receiving side, ', { text: 'checking what arrives', to: 'review-subcontractor-ifc-models' }, ' is part of the Reception preview.'] },
      shot('mail-phones-trades', 1640, 1180, 'Three trade emails on a phone: failed requirements, clash and BCF summary, and an RFI', SAMPLE),
      { type: 'h2', text: 'Issues due this week, each with its view' },
      { type: 'p', text: ['The clash and BCF summary goes to trades and coordinators together. It lists open clashes by discipline pair and the BCF issues due this week: discipline, reference, status, title, place, owner and date. Every issue is one tap away from its view in the model. See also ', { text: 'shared BCF issues for small teams', to: 'shared-bcf-issues-small-teams' }, '.'] },
      { type: 'h2', text: 'Five rules for emails trades act on' },
      { type: 'ol', items: [
        'Their name in the "For" line. A trade ignores emails addressed to "all".',
        'A location for every change: level and grid, not "in the east wing".',
        'One action per line, one date per action.',
        'The ISO 19650 name their next delivery must have, written out in full.',
        'No attachments: one link to the model at the right view.',
      ] },
      { type: 'related', to: 'bim-project-email-templates' },
      { type: 'related', to: 'supplier-ifc-upload-page-no-account' },
      CTA,
    ],
  },
]
