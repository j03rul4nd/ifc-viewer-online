import type { BlogPost, ContentBlock } from './blog-posts'

// The other five posts of the 2026-11-12 proposal (docs-planning/blog-borradores/00):
// custom rules (Pro), the company rule library (Team), shared BCF issues (Team),
// automatic checks on every delivery (Team/Developer) and the client update
// (Team/Reception). Same rules as blog-preview-features-en.ts:
//   - Every paid tool is a PREVIEW. Calls to action: the waitlist and "talk to
//     us" (/pricing/?role=…, /for-engineering/, /for-contractors/).
//   - What is free today is said to be free, and is the secondary action.
//   - Other vendors' prices only from their official page, with the date read.
//   - Every picture is a capture of the design preview with sample data; the
//     captions say which language the interface is in.
//
// One query, one page:
//   "write / test custom BIM checking rules"   → write-test-custom-bim-rules
//     ("what is IDS" stays with ids-information-delivery-specification-guide,
//      door clearances stay with check-clearances-ifc-model)
//   "BIM rule library, versions, approval"     → bim-rule-library-versions-approval
//   "shared BCF issues for a team"             → shared-bcf-issues-small-teams
//     (the BCF format itself stays with bcf-2-1-vs-3-0-viewpoints)
//   "automatic IFC validation, CI, webhooks"   → automatic-ifc-validation-ci-webhooks
//   "weekly BIM update to the client"          → weekly-bim-client-update

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

const ES_UI = 'Design preview with sample data, Spanish interface.'
const EN_UI = 'Design preview with sample data, English interface.'

const PRICING = { id: 'ivo-pricing', title: 'IFC Viewer Online plans', source: 'IFC Viewer Online', year: '2026', url: `${SITE}/pricing/`, note: 'Planned prices of the paid plans, which are not open yet.' }
const SOLIBRI = { id: 'solibri-pricing', title: 'Solibri pricing', source: 'Solibri', year: '2026', url: 'https://www.solibri.com/pricing', note: `Plans and starting prices per licence per year, as published on ${READ}.` }
const BIMCOLLAB = { id: 'bimcollab-pricing', title: 'BIMcollab pricing', source: 'BIMcollab', year: '2026', url: 'https://www.bimcollab.com/pricing', note: `Platform plans per user per month, as published on ${READ}. The page states no minimum number of users.` }
const SPECKLE = { id: 'speckle-pricing', title: 'Speckle pricing', source: 'Speckle', year: '2026', url: 'https://speckle.systems/pricing', note: `Automate is listed only in the custom plans, with no public price, as published on ${READ}.` }
const IDS_STD = { id: 'bsi-ids', title: 'Information Delivery Specification (IDS)', source: 'buildingSMART International', year: '2024', url: 'https://www.buildingsmart.org/standards/bsi-standards/information-delivery-specification-ids/', note: `The open standard for machine-readable information requirements. Read on ${READ}.` }

export const PREVIEW_FEATURE_POSTS2_EN: BlogPost[] = [
  // ── Custom rules you can test ──────────────────────────────────────────
  {
    slug: 'write-test-custom-bim-rules',
    title: 'Writing Your Own BIM Checking Rules, and Testing Them Before You Publish Them',
    seoTitle: 'Write Custom BIM Checking Rules and Test Them First',
    seoDescription: 'Write a checking rule as a sentence, see which elements fail as you type, and test it before your suppliers get it. Exports to IDS 1.0. In preview.',
    excerpt: 'A bad rule blocks every supplier who checks against it. A preview of a rule editor where you write the rule as a sentence, watch which elements fail while you type, and run test cases before anyone else sees it.',
    date: DATE,
    dateModified: DATE,
    author: 'IFC Viewer Online',
    category: 'Validation',
    categorySlug: 'validation',
    readTimeMin: 7,
    heroImage: 'blog/images/rule-geometry-relations-fix-english.jpg',
    heroAlt: 'Geometry and relation rules checked on a sample model, with the fix for each failure in Revit, Archicad, Tekla and Allplan',
    heroCredit: 'IFC Viewer Online',
    keywords: ['custom BIM checking rules', 'write IDS rules', 'custom IFC validation rules', 'test BIM rules', 'rule coverage IFC', 'geometric rules IFC', 'IDS 1.0 export'],
    references: [IDS_STD, SOLIBRI, PRICING],
    faqs: [
      { q: 'Can I write my own rules today?', a: 'You can already check models against your own profiles for free: the EIR editor and IDS files work in the viewer. Writing rules as a sentence with a live preview, test cases and the coverage matrix are in preview and not open yet.' },
      { q: 'Are the rules locked into your tool?', a: 'No. Every data and relation rule is written out as IDS 1.0, the buildingSMART standard, so it runs in any IDS checker, including the free one in the viewer.' },
      { q: 'Can the rules check geometry?', a: 'In preview: free space in front of doors and the clear height of spaces. Today those rules run on sample geometry (boxes); on real models they will use the geometry that clash detection already reads.' },
      { q: 'Which plan will it be in?', a: 'Writing, testing and coverage are planned for Pro; the shared company library with approval is planned for Team. The planned prices are on the pricing page.' },
    ],
    content: [
      { type: 'callout', variant: 'info', title: 'Preview', text: ['Checking a model against your rules is free today and will stay free. The rule editor described here is built but not open; the screenshots use a sample model. ', { text: 'Join the waitlist', href: `${SITE}/pricing/?role=solo` }, ' to try it when it opens.'] },
      { type: 'p', text: 'Every BIM manager has a list of things they check by hand: external walls must carry a fire rating from the allowed list, every door sits in a wall, the classification code is filled in. Turning that list into automatic rules is usually where things stall. Rule formats are hard to read, and nobody knows whether a rule is right until it rejects a model it should have accepted.' },
      { type: 'p', text: 'A wrong rule is not a small thing. Once suppliers check against it, a rule that fails good elements blocks all of them, and you find out from the phone calls.' },
      {
        type: 'takeaways',
        items: [
          'A rule is one sentence: for each element of a class, where a condition holds, this must be true, with this severity.',
          'While you write it, you see which elements pass and which fail, by name and GlobalId.',
          'Test cases say which elements must pass or fail; a rule is only published when they all match.',
          'Data and relation rules are written out as IDS 1.0, so they work in any checker.',
        ],
      },
      { type: 'h2', text: 'A rule is a sentence' },
      { type: 'p', text: 'The editor builds the rule as you would say it: "For each IfcWall, only where IsExternal is true, Pset_WallCommon.FireRating must be one of EI60, EI90, EI120. If it fails: error." Three steps (which elements, what they must have, what happens if they fail), and next to them a live preview on the model: how many elements were checked, how many pass, how many fail, with their names and GlobalIds.' },
      shot('rule-editor-live-preview', 1140, 1000, 'Rule editor: the rule as a sentence on the left, live preview of passing and failing walls and the IDS 1.0 text on the right', `${ES_UI} The IDS text below the preview is the same rule in the open standard.`),
      { type: 'p', text: ['Underneath, the same rule appears as IDS 1.0 XML, ready to download. If you have not used IDS before, read ', { text: 'our guide to IDS', to: 'ids-information-delivery-specification-guide' }, ' first: this post is about writing and testing rules, not about the format. ', { cite: 'bsi-ids' }] },
      { type: 'h2', text: 'Test the rule before it reaches anyone' },
      { type: 'p', text: 'Programmers write tests before they ship code. Rules deserve the same. In the Tests tab you pick sample elements and say what should happen to each: this wall must pass, this one must fail, this table does not apply. One click runs them all with the real engine. Green means the rule does what you meant; red means it would have rejected the wrong thing.' },
      shot('rule-tests-pass-fail', 1140, 1000, 'Rule tests: four sample elements with the expected result and all four matching', `${ES_UI}`),
      { type: 'p', text: 'We have not found another checker that lets you test a rule against expected results before publishing it. It is cheap to do and it is what keeps one bad rule from stopping ten suppliers.' },
      { type: 'h2', text: 'What no rule checks' },
      { type: 'p', text: 'Results tell you what failed. They do not tell you what was never checked. The coverage matrix crosses IFC classes with rules: in the sample, 46% of the elements are checked by at least one rule, and windows, slabs, spaces, pipe segments and proxies are checked by none.' },
      shot('rule-coverage-matrix', 1140, 1000, 'Coverage matrix: IFC classes against rules, with the classes no rule checks highlighted', `${ES_UI}`),
      { type: 'p', text: 'It is the quickest way to see that a ruleset written for architecture says nothing about MEP.' },
      { type: 'h2', text: 'Rules about relations and geometry' },
      { type: 'p', text: 'Data rules are half of the job. The other half are questions like "is every door hosted in a wall?" or "does every space belong to a zone?". These are relation rules, and IDS 1.0 can express them (partOf), so they travel in the standard as well.' },
      { type: 'p', text: ['Then come geometric rules: 0.8 m of free space in front of every door, a clear height of at least 2.5 m in every space. They use the geometry core of clash detection. An honest limit: in the preview they run on sample geometry (boxes). For measuring clearances by hand on a real model today, see ', { text: 'how to check clearances in an IFC model', to: 'check-clearances-ifc-model' }, '.'] },
      shot('rule-geometry-relations-fix-english', 1140, 1000, 'Geometry and relation rules at stage S4, failures with a button to create an issue, and how to fix the failure in each authoring tool', `${EN_UI} Each failure becomes an issue that carries how to fix it in Revit, Archicad, Tekla and Allplan.`),
      { type: 'p', text: ['A failure can become an issue in one click, and the issue carries the fix for each authoring tool: the same hand-written guidance as the free ', { text: 'fix guides', href: `${SITE}/fix/` }, ', not generated text.'] },
      { type: 'h2', text: 'Not every rule applies at every stage' },
      { type: 'p', text: 'At S2 you do not ask for what you ask at S4. Instead of keeping one ruleset per stage, each rule says at which ISO 19650 status it applies, and the stage selector shows which ones count now.' },
      shot('rule-geometry-relations-stage-s2', 1140, 1000, 'Stage selector at S2: rules not required at this stage greyed out', `${ES_UI}`),
      { type: 'h2', text: 'How it compares' },
      { type: 'p', text: ['Solibri is the reference for rule-based checking. Prices from its official page, read on 12 November 2026. ', { cite: 'solibri-pricing' }] },
      {
        type: 'table',
        headers: ['', 'Solibri', 'Free IDS editor (viewer)', 'IFC Viewer Online rules (preview)'],
        rows: [
          ['How rules are written', 'Parameters of rule templates', 'Form per requirement', 'A sentence, with a live preview of failing elements'],
          ['Test cases before publishing', 'No', 'No', 'Yes'],
          ['Coverage by IFC class', 'No', 'No', 'Yes'],
          ['Geometric rules', 'Yes, many', 'No', 'Door clearance and clear height (sample geometry for now)'],
          ['Open format of the rules', 'Own format', 'IDS 1.0', 'IDS 1.0 for data and relation rules'],
          ['Price', 'From €1,428/year (Essential), €2,109/year (Advanced), per licence', 'Free', 'Planned within Pro, from €39/month'],
        ],
        caption: 'Source: solibri.com/pricing, read on 12 November 2026. Solibri has far more geometric rules than we do; that is its strength. Our planned prices are on the pricing page.',
      },
      { type: 'p', text: ['For the wider comparison, see the ', { text: 'Solibri alternative page', href: `${SITE}/solibri-alternative/` }, '. When rules are shared by a whole company, someone has to approve them: that is the subject of ', { text: 'the post on the company rule library', to: 'bim-rule-library-versions-approval' }, '.'] },
      { type: 'h2', text: 'What you can already do for free' },
      { type: 'p', text: 'Check any IFC against an IDS file or one of the built-in profiles, edit EIR profiles in the viewer, import and export IDS 1.0. All in your browser, with no upload. None of that changes.' },
      { type: 'tool', id: 'validator', why: 'Check an IFC file against your rules today, free and without uploading it.' },
      { type: 'h2', text: 'Do you write the rules others check against?' },
      { type: 'p', text: ['The rule editor is in preview. If you maintain checking rules for your firm or your clients, ', { text: 'join the waitlist', href: `${SITE}/pricing/?role=solo` }, ' and we will write when it opens.'] },
    ],
  },

  // ── Company rule library ───────────────────────────────────────────────
  {
    slug: 'bim-rule-library-versions-approval',
    title: 'Who Approves Your Company\'s BIM Rules? Versions, Review and Who a Change Affects',
    seoTitle: 'BIM Rule Library: Versions, Approval and Impact',
    seoDescription: 'Company checking rules with versions, a reviewer who is not the author, and the effect of each change on the model before it reaches subcontractors. In preview.',
    excerpt: 'When one person edits the company ruleset on a Friday, fifteen subcontractors check against it on Monday. A preview of a rule library with versions, approval by someone other than the author, and the effect of a change on the model.',
    date: DATE,
    dateModified: DATE,
    author: 'IFC Viewer Online',
    category: 'Delivery & ISO 19650',
    categorySlug: 'delivery',
    readTimeMin: 6,
    heroImage: 'blog/images/rule-library-english.jpg',
    heroAlt: 'Company rule library: a ruleset in review, what changed from the previous version, comments and history',
    heroCredit: 'IFC Viewer Online',
    keywords: ['BIM rule library', 'EIR versions', 'approve BIM rules', 'company checking rules', 'information requirements versions', 'ISO 19650 stages rules'],
    references: [SOLIBRI, PRICING],
    faqs: [
      { q: 'Is the rule library available?', a: 'No, it is in preview with sample data. Checking a model against a profile or an IDS file is free today.' },
      { q: 'Why can the author not approve their own version?', a: 'Because the point of a review is a second pair of eyes. The library refuses an approval from the person who wrote that version.' },
      { q: 'What do subcontractors receive?', a: 'A requirements link that always points to the approved version for the current stage. They check against it for free and without an account.' },
      { q: 'Can I take the rules elsewhere?', a: 'Yes. The approved version exports as IDS 1.0, and IDS files can be imported into the library.' },
    ],
    content: [
      { type: 'callout', variant: 'info', title: 'Preview', text: ['The company rule library is built with sample data and is not open yet. It is planned for the Team plan. If you would rather see it on a call, ', { text: 'talk to us', href: `${SITE}/for-contractors/` }, '.'] },
      { type: 'p', text: 'In most firms the checking rules live in one person\'s head, or in a file that one person edits. That works until someone relaxes a rule for one project and every other project inherits it, or until a subcontractor asks which version of the requirements they were checked against and nobody can say.' },
      { type: 'p', text: ['Writing a rule well is one problem (we cover it in ', { text: 'writing and testing your own rules', to: 'write-test-custom-bim-rules' }, '). Governing who changes the company\'s rules, and when, is another.'] },
      {
        type: 'takeaways',
        items: [
          'Every ruleset has versions, an author and a state: draft, in review, approved.',
          'The author of a version cannot approve it.',
          'Before a change is approved, you see which elements start or stop failing on a real model.',
          'Subcontractors always check against the approved version for the current stage.',
        ],
      },
      { type: 'h2', text: 'Versions, authors and a review' },
      { type: 'p', text: 'Each company ruleset (house fire requirements, the handover to facility management, MEP naming) has numbered versions. A new version starts as a draft, goes to review and is approved or sent back. The screen shows what changed between versions (a rule removed, a list of allowed values widened), the comments of the reviewers and the history.' },
      shot('rule-library-version-review', 1140, 1000, 'A ruleset at version 3 in review: what changed from version 2, comments from the author and the reviewer, and the history', `${ES_UI} Suppliers keep checking against version 2 until version 3 is approved.`),
      { type: 'p', text: 'In the example, version 3 removes the slab fire-rating rule and adds EI30 to the walls. The author explains why (the parking supplier asks for EI30) and the reviewer replies that it should only apply with a condition on the storey. That conversation stays next to the version.' },
      { type: 'h2', text: 'The author does not approve their own work' },
      { type: 'p', text: 'It is a simple rule and it is the one that matters most. If the person who wrote version 3 tries to approve it, the library refuses.' },
      shot('rule-library-author-cannot-approve', 1140, 1000, 'The library refuses an approval: whoever writes a version cannot approve it', `${ES_UI}`),
      { type: 'h2', text: 'Before you change a rule, see who it affects' },
      { type: 'p', text: 'A text diff says what changed in the rule. It does not say what changes in the model. Before approving, the library runs both versions on the same model and lists the elements that start failing and the ones that stop failing. Relaxing a rule stops being a guess.' },
      shot('rule-version-effect-subcontractor-link', 1440, 1000, 'Effect of a new rule version on the model, and the requirements link for subcontractors with the approved version', `${ES_UI}`),
      { type: 'h2', text: 'One library, with the stage on each rule' },
      { type: 'p', text: 'The usual way to handle ISO 19650 stages is one ruleset per stage, which means copying rules and keeping the copies in step. Here each rule carries the status where it applies (S1 to S4, A), and the library gives each stage only the rules that count.' },
      { type: 'h2', text: 'What subcontractors get' },
      { type: 'p', text: ['The rules are of little use if suppliers only see them as a PDF. The library produces a requirements link with the IDS of the approved version for the current stage. Suppliers open it, drop their IFC and see whether you will accept it, for free and with no account; the file never leaves their computer. That link exists today and is free; ', { text: 'reviewing subcontractor models', to: 'review-subcontractor-ifc-models' }, ' explains how it fits in the receiving side.'] },
      { type: 'p', text: 'One honest note: geometric rules (door clearance, clear height) stay in your workspace, because they need the model geometry. What travels in the link are data and relation rules.' },
      { type: 'h2', text: 'How it compares' },
      { type: 'p', text: ['Solibri sells central company rules in its top plan. Prices from its official page, read on 12 November 2026. ', { cite: 'solibri-pricing' }] },
      {
        type: 'table',
        headers: ['', 'Solibri Premium', 'IFC Viewer Online library (preview)'],
        rows: [
          ['Central company rules', 'Yes', 'Yes'],
          ['Approval by someone other than the author', 'Not stated on the pricing page', 'Yes, enforced'],
          ['Effect of a change on the model', 'No', 'Yes, elements that start and stop failing'],
          ['Stage per rule', 'Separate rulesets per stage', 'One library, stage on each rule'],
          ['What suppliers need', 'A Solibri licence to run the rules', 'A link, free, no account'],
          ['Price', '€2,772/year per licence', 'Planned within Team, from €59 per editor per month (minimum 3 editors)'],
        ],
        caption: 'Source: solibri.com/pricing, read on 12 November 2026. Our planned prices are on the pricing page.',
      },
      { type: 'h2', text: 'What you can already do for free' },
      { type: 'p', text: ['Create a requirements link with your rules, a minimum score and your ', { text: 'ISO 19650 naming convention', to: 'iso-19650-file-naming-convention' }, ', and send it to your suppliers. Check any IFC against an IDS file. None of that changes.'] },
      { type: 'h2', text: 'Do several people maintain your rules?' },
      { type: 'p', text: ['If your firm has house rules that more than one person edits, and subcontractors who check against them, ', { text: 'talk to us', href: `${SITE}/for-contractors/` }, ' or ', { text: 'join the waitlist', href: `${SITE}/pricing/?role=team` }, '. ', { cite: 'ivo-pricing' }] },
    ],
  },

  // ── Shared BCF issues ──────────────────────────────────────────────────
  {
    slug: 'shared-bcf-issues-small-teams',
    title: 'Shared BCF Issues for Small Teams: What You Need and What It Costs',
    seoTitle: 'Shared BCF Issues for Small BIM Teams',
    seoDescription: 'One list of BCF issues for the whole team, with the saved camera, a due date and the fix for each tool. Clients join free. What it costs elsewhere. In preview.',
    excerpt: 'A team of six does not need an enterprise issue tracker. It needs one list everyone sees, with the camera saved in each issue, and clients who can comment without a seat. A preview, and what the alternatives cost.',
    date: DATE,
    dateModified: DATE,
    author: 'IFC Viewer Online',
    category: 'Tools & comparisons',
    categorySlug: 'tools',
    readTimeMin: 6,
    heroImage: 'blog/images/team-issue-suggested-fix.jpg',
    heroAlt: 'A shared BCF issue with the saved camera, the suggested fix for each authoring tool, state, assignee and due date',
    heroCredit: 'IFC Viewer Online',
    keywords: ['shared BCF issues', 'BCF issue management team', 'BIM issue tracker', 'BCF in the cloud', 'BIMcollab alternative', 'BIM issues small team'],
    references: [BIMCOLLAB, PRICING],
    faqs: [
      { q: 'Can I use shared issues today?', a: 'Not yet: the team issue list is in preview with sample data. Importing and exporting BCF 2.1 and 3.0 in the viewer is free today.' },
      { q: 'Do clients and contractors need a seat?', a: 'No. Guests join by email, comment and change the state of what is assigned to them, and do not take a seat.' },
      { q: 'Can I take the issues to another tool?', a: 'Yes. They export as BCF 2.1 or 3.0 with cameras, and BCF from BIMcollab or Solibri can be imported, with a warning about duplicates.' },
      { q: 'How much will it cost?', a: 'Shared issues are planned for the Team plan, from €59 per editor per month billed yearly, with a minimum of 3 editors. The planned prices are on the pricing page.' },
    ],
    content: [
      { type: 'callout', variant: 'info', title: 'Preview', text: ['Shared issues are built with sample data and are not open yet. Importing and exporting BCF in the viewer is free today. ', { text: 'Join the waitlist', href: `${SITE}/pricing/?role=team` }, ' to try it with your team when it opens.'] },
      { type: 'p', text: 'In a small engineering firm, the issues of a project usually live in three places: BCF files sent by email, a spreadsheet someone keeps up to date, and the memory of whoever was at the meeting. Each BCF file is a snapshot. Nobody knows which one is the latest, and the client asks by email about something that was closed last week.' },
      {
        type: 'takeaways',
        items: [
          'One list for the team, with open, mine, overdue and closed.',
          'Each issue keeps its camera: everyone opens the model at the same view.',
          'The issue says how to fix the problem in Revit, Archicad, Tekla or Allplan.',
          'Clients and contractors join free, without a seat.',
        ],
      },
      { type: 'h2', text: 'One list, the same for everyone' },
      { type: 'p', text: 'The list has tabs for open, assigned to me, overdue and done, with counts. Each row shows where the issue came from (the viewer, a check report, an automation, an imported BCF), its state, who has it and when it is due, in red if it is late. You can search by title, model or number and filter by discipline.' },
      shot('team-issues-list', 1600, 1263, 'Team issue list: open, overdue and closed counts, and each issue with state, assignee, due date, priority and discipline', `${ES_UI} The sample issue titles are in English.`),
      { type: 'h2', text: 'The camera is part of the issue' },
      { type: 'p', text: 'An issue without a view is a sentence. Created from the viewer, the issue arrives with its title, the element (GlobalId) and the camera already filled in. "Open in the viewer with this camera" takes anyone on the team to the same view.' },
      shot('team-issue-saved-camera', 1600, 1263, 'An issue with its saved camera, the element, state, assignee, due date and a comment from the contractor', `${ES_UI}`),
      { type: 'p', text: ['How BCF stores that camera differs between versions 2.1 and 3.0; if it matters for your tools, read ', { text: 'BCF 2.1 vs 3.0 viewpoints', to: 'bcf-2-1-vs-3-0-viewpoints' }, '.'] },
      { type: 'h2', text: 'The issue says how to fix it' },
      { type: 'p', text: 'This is the part other trackers leave out. When an issue comes from a failed check, it carries the suggested fix for each authoring tool: what to do in Revit, Archicad, Tekla or Allplan. It is guidance written by our team for each rule, the same as in the free fix guides, not generated text.' },
      shot('team-issue-suggested-fix', 1600, 1263, 'Suggested fix in the issue, with a tab for each authoring tool', `${ES_UI}`),
      { type: 'h2', text: 'Clients and contractors join free' },
      { type: 'p', text: 'Clients and contractors are invited by email. They see the issues you share, comment, and change the state of the ones assigned to them. They do not take a seat, and before inviting them you see what they will see.' },
      shot('team-invite-client-free', 1600, 1263, 'Inviting a client: email, current guests and a preview of what the client will see', `${ES_UI}`),
      { type: 'h2', text: 'How the team is doing' },
      { type: 'p', text: 'The first screen is not the list but the team: the Health Score of each project with its trend, open issues per person and the deadlines at risk.' },
      shot('team-dashboard-projects-people', 1600, 1263, 'Team dashboard: Health Score per project, open issues per person and deadlines at risk', `${ES_UI}`),
      { type: 'h2', text: 'What it costs' },
      { type: 'p', text: ['BIMcollab is the best-known shared BCF platform. Prices from its official page, read on 12 November 2026. ', { cite: 'bimcollab-pricing' }, ' ', { cite: 'ivo-pricing' }] },
      {
        type: 'table',
        headers: ['', 'BIMcollab Platform', 'IFC Viewer Online Team (preview)'],
        rows: [
          ['Price per person', 'Basic €12.50, Advanced €18.75, Enterprise €25 per user per month, billed yearly (€19, €29, €39 billed monthly)', '€59 per editor per month, billed yearly (minimum 3 editors)'],
          ['Guests (client, contractor)', 'See their plans', 'Free, no seat'],
          ['Suggested fix per authoring tool', 'No', 'Yes'],
          ['BCF 2.1 / 3.0', 'Yes', 'Yes, import and export'],
          ['What else is included', 'Issue platform; Zoom and Nexus per plan', 'Clash detection, rules, automations and the client update'],
        ],
        caption: 'Source: bimcollab.com/pricing, read on 12 November 2026; the page states no minimum number of users. Per seat, BIMcollab is cheaper for issues alone; Team includes more than issues. Our planned prices are on the pricing page.',
      },
      { type: 'p', text: ['If issues are all you need, a dedicated issue platform costs less per person. Team makes sense when the same team also coordinates clashes (see ', { text: 'clash detection in the browser', to: 'ifc-clash-detection-browser' }, ') and checks deliveries automatically.'] },
      { type: 'h2', text: 'What you can already do for free' },
      { type: 'p', text: ['Open several IFC models together, create BCF issues from the viewer and export or import BCF 2.1 and 3.0. Free, in your browser. ', { text: 'Open the viewer', href: `${SITE}/` }, '.'] },
      { type: 'h2', text: 'Does your team share issues by email today?' },
      { type: 'p', text: ['Shared issues are in preview. ', { text: 'Join the waitlist', href: `${SITE}/pricing/?role=team` }, ', or see how the Team plan fits ', { text: 'an engineering firm', href: `${SITE}/for-engineering/` }, '.'] },
    ],
  },

  // ── Automatic checks on every delivery ─────────────────────────────────
  {
    slug: 'automatic-ifc-validation-ci-webhooks',
    title: 'Checking Every IFC That Comes In Without Opening It: Watched Folder, CI and Webhooks',
    seoTitle: 'Automatic IFC Validation: Watched Folder, CI, Webhooks',
    seoDescription: 'Check every IFC delivery against your profile as it arrives, from a watched folder, a CI pipeline or an API, and get the result by webhook. In preview.',
    excerpt: 'Thirty models a week arrive in a shared folder and nobody opens them until something breaks. A preview of checking each one as it lands, with a gate that keeps failing models from being published.',
    date: DATE,
    dateModified: DATE,
    author: 'IFC Viewer Online',
    category: 'Validation',
    categorySlug: 'validation',
    readTimeMin: 6,
    heroImage: 'blog/images/automation-runs-results.jpg',
    heroAlt: 'Automatic checks: the latest deliveries with result, score, what happened, profile and time',
    heroCredit: 'IFC Viewer Online',
    keywords: ['automatic IFC validation', 'IFC validation API', 'IDS in CI', 'GitHub Action IFC', 'IFC webhook', 'watched folder IFC check', 'quality gate BIM'],
    references: [SPECKLE, PRICING],
    faqs: [
      { q: 'Is automatic checking available today?', a: 'No. The screens are built with sample data and the service is not open. Checking one file in the viewer is free today.' },
      { q: 'Which sources will it support?', a: 'A watched folder (a small script on the machine that sees the folder), a CI pipeline such as a GitHub Action, and a direct API. Connectors to SharePoint or ACC only when a paying customer asks for them.' },
      { q: 'What happens when a delivery fails?', a: 'You choose: open an issue assigned to someone with a due date, send a webhook, or nothing. The same delivery never opens two issues.' },
      { q: 'Is there a file size limit?', a: 'Files over 200 MB are rejected with the limit shown.' },
    ],
    content: [
      { type: 'callout', variant: 'info', title: 'Preview', text: ['Automatic checks are designed and built with sample data, but the service is not open. The keys and scripts in the screenshots are not real. If you would like it for your pipeline, ', { text: 'talk to us', href: `${SITE}/pricing/?role=build` }, '.'] },
      { type: 'p', text: 'A mid-sized engineering firm receives around thirty IFC deliveries a week in a shared folder or a CDE. Checking them is somebody\'s job, which means it happens when that person has time. A model that fails the naming convention or is missing classifications is discovered at the coordination meeting, a week late.' },
      { type: 'p', text: ['If the deliveries come from outside your firm, the free requirements link already lets suppliers check before sending (see ', { text: 'reviewing subcontractor models', to: 'review-subcontractor-ifc-models' }, '). This post is about the models that reach your folders anyway.'] },
      {
        type: 'takeaways',
        items: [
          'Three sources: watched folder, CI pipeline or API.',
          'Before switching it on, you see what would have happened to last week\'s deliveries.',
          'A failure can open an issue on its own, with the rule, the file and the camera.',
          'A gate keeps models below a score out of "Published", with a history of every exception.',
        ],
      },
      { type: 'h2', text: 'Connect a source in three steps' },
      { type: 'p', text: 'A wizard asks for the source (watched folder, CI, API), the profile to check with (your house standard, ISO 19650 names, the client\'s IDS) and what to do if a delivery fails. At the end it shows the snippet to copy: a scheduled task for the folder, a YAML step for CI, or a curl call. Only new or changed files are sent.' },
      shot('automation-connect-watched-folder', 1600, 1263, 'Connecting a watched folder: the command for a scheduled task and the key to paste', `${ES_UI} The key is not real and nothing is checked until the Team plan opens.`),
      { type: 'h2', text: 'See the result before you switch it on' },
      { type: 'p', text: 'An automation set up blind tends to be switched off after its first noisy week. So the wizard runs the chosen profile on your deliveries of the last week: "of 31 deliveries, 25 would pass, 6 would fail and 5 issues would open; the most common failure: doors without FireRating."' },
      shot('automation-preview-last-week', 1600, 1263, 'Wizard step with the profile and the preview of what would have happened to last week\'s deliveries', `${ES_UI}`),
      { type: 'p', text: 'Profiles are versioned: a change applies from the next delivery, and old reports keep the version they were checked with.' },
      { type: 'h2', text: 'Every run, in one table' },
      { type: 'p', text: 'Each delivery shows the file, the source, the profile, the score, the result, what happened and how long it took. A failed run links to its issue. A file that could not be checked says why (in the example, 231 MB against a limit of 200 MB). On top, the week: checked, failed, issues opened by themselves, average time to the report.' },
      shot('automation-runs-results', 1600, 1263, 'Latest automatic runs with result, score, what happened, profile and time', `${ES_UI}`),
      { type: 'h2', text: 'A gate before "Published"' },
      { type: 'p', text: 'Checking is useful; stopping is better. The publication gate keeps a model in "Shared" while its score is below a threshold (80 in the example) or while a mandatory rule fails, and the screen tells you how many of the last versions the threshold would have stopped. A reviewer can approve an exception, and the history records who published what and who allowed which exception, with the reason.' },
      shot('automation-publish-gate-history', 1600, 1263, 'Publication gate: minimum score, mandatory rules, reviewer approval and the history of published, stopped and excepted models', `${ES_UI}`),
      { type: 'h2', text: 'Webhooks for everything else' },
      { type: 'p', text: 'Results go wherever your team works: a Teams or Slack channel, your own system. Webhooks send validation.completed, validation.failed and issue.created, signed with a secret, with the HTTP code of each delivery and a manual retry. After three failed attempts a webhook pauses and tells you.' },
      shot('automation-webhooks-phone', 468, 1013, 'Webhooks on a phone: a Teams channel subscribed to validation and issue events, with the latest deliveries', `${ES_UI}`),
      { type: 'h2', text: 'How it compares' },
      { type: 'p', text: ['Speckle Automate is the closest service. Its official pricing page, read on 12 November 2026, lists Automate only in the custom plans, with no public price; the free plan does not include it. ', { cite: 'speckle-pricing' }] },
      {
        type: 'table',
        headers: ['', 'Speckle Automate', 'IFC Viewer Online (preview)'],
        rows: [
          ['Plan', 'Custom plans only', 'Team (automations) and Developer (API)'],
          ['Public price', 'No', 'Planned: Team from €59 per editor per month; Developer from €149/month'],
          ['Works on IFC directly', 'Through Speckle\'s own model', 'Yes, with IDS 1.0 or EIR profiles'],
          ['Preview on last week before activating', 'Results per run', 'Yes'],
          ['Failure opens an issue with the fix', 'Depends on the function you write', 'Yes'],
        ],
        caption: 'Source: speckle.systems/pricing, read on 12 November 2026. Our planned prices are on the pricing page.',
      },
      { type: 'p', text: ['If you build your own tools, the ', { text: 'SDK', href: `${SITE}/sdk/` }, ' and the ', { text: 'local MCP server', to: 'ifc-mcp-server-claude-bim-3d-viewer' }, ' are free today.'] },
      { type: 'h2', text: 'What you can already do for free' },
      { type: 'p', text: 'Check any IFC by hand in the viewer, with its Health Score, an IDS file or a profile, without uploading it. For a whole folder at once, see the preview of batch checking.' },
      { type: 'related', to: 'batch-validate-ifc-files', why: 'Checking a folder of IFC files at once, sorted by where to start.' },
      { type: 'h2', text: 'Would you check every delivery automatically?' },
      { type: 'p', text: ['Automatic checks are in preview. If your team receives models every week, ', { text: 'join the waitlist', href: `${SITE}/pricing/?role=team` }, ' or see ', { text: 'how it fits an engineering firm', href: `${SITE}/for-engineering/` }, '. If you want the API for your own pipeline, ', { text: 'talk to us', href: `${SITE}/pricing/?role=build` }, '. ', { cite: 'ivo-pricing' }] },
    ],
  },

  // ── Weekly update to the client ────────────────────────────────────────
  {
    slug: 'weekly-bim-client-update',
    title: 'A Weekly Update to the Client With Data From the Model, Not Photos',
    seoTitle: 'A Weekly BIM Update to the Client, With Model Data',
    seoDescription: 'Send the client a weekly update filled with the model\'s numbers: quality, accepted deliveries, clashes resolved, next milestone. No tracking pixel. In preview.',
    excerpt: 'Clients do not open IFC files, but they do read a short email. A preview of a weekly update filled with the numbers of the model itself, with a project page the client opens without an account and replies that come back as a thread.',
    date: DATE,
    dateModified: DATE,
    author: 'IFC Viewer Online',
    category: 'Delivery & ISO 19650',
    categorySlug: 'delivery',
    readTimeMin: 6,
    heroImage: 'blog/images/client-project-page.jpg',
    heroAlt: 'Project page the client opens from the weekly update: summary, timeline and Health Score',
    heroCredit: 'IFC Viewer Online',
    keywords: ['weekly BIM update client', 'BIM client reporting', 'project update email construction', 'client communication BIM', 'BIM progress report client'],
    references: [
      { id: 'buildertrend-portal', title: 'Construction client portal', source: 'Buildertrend', year: '2026', url: 'https://buildertrend.com/communication/construction-client-portal/', note: 'Describes a client portal with schedule, daily logs and photos. Read on 11 November 2026.' },
      PRICING,
    ],
    faqs: [
      { q: 'Can I send these updates today?', a: 'No. Sending is switched off: the screens use sample data and nothing leaves the browser. Sharing a link to the model in the viewer is free today.' },
      { q: 'Do you track whether the client opened the email?', a: 'No. There is no tracking pixel. Only clicks on the project link are counted, per message and never per person, and fewer than 3 shows as "<3".' },
      { q: 'Who receives the updates?', a: 'Only contacts who gave their consent, with one-click unsubscribe in every email. After unsubscribing, only the client can subscribe again.' },
      { q: 'How many emails are included?', a: 'Planned: Pro 200 a month sent by hand; Team 1,000 a month with automations; Reception 3,000 a month and your own sending domain.' },
    ],
    content: [
      { type: 'callout', variant: 'info', title: 'Preview', text: ['The client update is designed and built, but sending is switched off and the screenshots use sample data. ', { text: 'Join the waitlist', href: `${SITE}/pricing/?role=team` }, ' to try it when it opens.'] },
      { type: 'p', text: 'Every Friday someone on the project writes to the developer: how the week went, what is late, what is next. It takes an hour, it is written from memory, and it usually ends with a photo of the site. Meanwhile the model holds exact numbers on quality, deliveries and clashes that never reach the client.' },
      {
        type: 'takeaways',
        items: [
          'Fixed sentences filled with the project\'s numbers: quality, accepted deliveries, clashes resolved, next milestone.',
          'A project page the client opens without an account, with the 3D view.',
          'Replies come back to the team as a thread, or become an issue.',
          'Consent, one-click unsubscribe and no tracking pixel.',
        ],
      },
      { type: 'h2', text: 'Start from a phase, not from a blank page' },
      { type: 'p', text: 'Templates follow the project: start of project, delivery accepted, milestone reached, delivery. Each one already carries live blocks: the Health Score with its trend, accepted deliveries, closed issues, milestones, a 3D capture. You choose who receives it (developer, investors, technical team), only among people who have accepted.' },
      shot('client-update-phase-segment-ab', 1140, 900, 'Sending an update: template by phase, recipients who have accepted and the latest subject-line test', `${ES_UI} Sending is switched off.`),
      { type: 'p', text: 'You can test two subject lines. The split is stable and no one is tracked individually; a winner is only declared with enough clicks on both sides, and is used for the rest of the series.' },
      { type: 'h2', text: 'Numbers the client understands' },
      { type: 'p', text: 'The summary is three or four sentences anyone can read: model quality, deliveries accepted this week, "12 clashes resolved this week", the next milestone. They are fixed sentences filled with numbers; nothing is invented.' },
      shot('client-update-clash-summary-template', 1440, 900, 'Email template with the block of clashes resolved this week', `${ES_UI}`),
      { type: 'p', text: ['The clash numbers come from the trend of ', { text: 'clash detection', to: 'ifc-clash-detection-browser' }, ', and the accepted deliveries from ', { text: 'the receiving side', to: 'review-subcontractor-ifc-models' }, '. The more of the project runs through them, the more the update says.'] },
      { type: 'h2', text: 'A page for the client, without an account' },
      { type: 'p', text: 'The link in the email leads to a page for that project: the summary, a timeline of milestones and accepted deliveries, the Health Score, the clashes, the 3D model in the browser, and a box to write to the team. It works on a phone.' },
      shot('client-project-page', 1440, 900, 'Project page for the client: summary, timeline and Health Score', `${ES_UI}`),
      shot('client-project-page-phone', 390, 844, 'The client\'s project page on a phone', `${ES_UI}`),
      { type: 'h2', text: 'Replies come back as a thread' },
      { type: 'p', text: '"When will the façade samples arrive on site?" The client\'s reply comes back to the team as a thread, the team answers from its department, and if the message is a problem rather than a question, it can become an issue in one click.' },
      shot('client-update-reply-thread', 1140, 900, 'A client\'s reply in a thread, with the suggestion to turn it into an issue', `${ES_UI}`),
      { type: 'h2', text: 'Consent, unsubscribe and no tracking pixel' },
      { type: 'p', text: 'Updates only go to contacts who gave their consent, and consent is checked again at the moment of sending. Every email has one-click unsubscribe. There is no tracking pixel: we do not count opens, only clicks on the project link, per message and never per person.' },
      { type: 'p', text: 'Without your own domain, updates go out from our address with your department\'s name and replies go to you. On the Reception plan they can come from your own domain, with a wizard for the SPF, DKIM and DMARC records.' },
      shot('client-update-own-domain', 1140, 900, 'Own sending domain: the SPF, DKIM and DMARC records to add, and how the email is sent', `${ES_UI} The DNS check uses a sample answer.`),
      { type: 'h2', text: 'How it compares' },
      { type: 'p', text: ['Email tools know nothing about the project. Construction client portals report with photos and daily logs; Buildertrend, for example, describes a portal with the schedule, daily logs and photos. ', { cite: 'buildertrend-portal' }, ' We have not found one that reports with numbers measured on the BIM model.'] },
      {
        type: 'table',
        headers: ['', 'Email marketing tool', 'Construction client portal', 'IFC Viewer Online (preview)'],
        rows: [
          ['What the update says', 'What you write', 'Photos, schedule, daily logs', 'Numbers from the model: quality, deliveries, clashes, milestones'],
          ['Client needs an account', 'No', 'Usually yes', 'No'],
          ['Open tracking', 'Usually, with a pixel', 'Varies', 'No pixel; only clicks, per message'],
          ['Reply becomes an issue', 'No', 'No', 'Yes'],
        ],
        caption: 'Source for the portal description: buildertrend.com, read on 11 November 2026. The other columns describe categories, not one product.',
      },
      { type: 'h2', text: 'What is planned in each plan' },
      {
        type: 'table',
        headers: ['Plan', 'Client updates (planned)'],
        rows: [
          ['Free', 'Sharing a link to the model in the viewer, as today'],
          ['Pro', 'Up to 200 emails a month, sent by hand with templates'],
          ['Team', 'Up to 1,000 a month, with automations, segments and subject tests'],
          ['Reception', 'Up to 3,000 a month, "delivery accepted" to the developer, your own domain'],
        ],
        caption: 'Planned limits. The prices of each plan are on the pricing page.',
      },
      { type: 'h2', text: 'Do you report to a client every week?' },
      { type: 'p', text: ['The client update is in preview. ', { text: 'Join the waitlist', href: `${SITE}/pricing/?role=team` }, ', or, if you are a contractor receiving models from several suppliers, ', { text: 'see how it fits', href: `${SITE}/for-contractors/` }, '. ', { cite: 'ivo-pricing' }] },
    ],
  },
]
