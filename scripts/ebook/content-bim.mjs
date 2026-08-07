// ─── The BIM Information Handbook — book content ──────────────────────────────
//
// The process-level companion to content.mjs. Where the IFC Delivery Handbook is
// about a file, this one is about the machinery around it: the common data
// environment, the information requirement chain (OIR → AIR/PIR → EIR → BEP),
// level of information need, delivery planning and asset handover.
//
// Deliberately tool-agnostic. No Revit menus, no product tour — the reader's
// authoring tool is their business; how information moves between organisations
// is the subject.
//
// Block vocabulary: see render.mjs → renderBlock.
// Inline markup: **bold**, *italic*, `code`, [label](url).
//
// House rules for this book, on top of the usual "no invented statistics":
//   · Standards are referenced by name and part (ISO 19650-2, EN 17412-1), never
//     by clause number — a wrong clause number is worse than none.
//   · Where a convention is national rather than international (the S-code
//     suitability set, for example), it says so.

export const BOOK = {
  title:     'The BIM Information Handbook',
  subtitle:  'Common data environments, information requirements and level of information need — the delivery chain, explained by what it does',
  eyebrow:   'For the people who have to run it',
  // Warm paper + teal — deliberately unlike the indigo IFC Delivery Handbook, so
  // the two are told apart as thumbnails where only the colour registers.
  coverTheme: 'paper',
  edition:   'First edition',
  year:      '2026',
  author:    'Joel Benitez',
  publisher: 'IFC Viewer Online',
  siteUrl:   'https://www.ifcvieweronline.eu',
  retail:    '€19.99',
  isbnNote:  'Distributed free of charge. Not for resale.',
  colophonNote:
    'This handbook explains the ISO 19650 delivery machinery in operational terms. It is not a copy of the standard and does not replace it: where you need the normative wording, buy the standard. Where you need to know what to actually do on Monday, start here.',
  marks: [
    { k: '4',  l: ['CDE states, and what', 'each one promises'] },
    { k: '5',  l: ['requirement documents,', 'in one chain'] },
    { k: '6',  l: ['clauses and emails,', 'ready to paste'] },
  ],
  ogMarks: [
    { k: 'CDE',  l: 'states & workflow' },
    { k: 'LOIN', l: 'without the LOD fight' },
  ],
}

export const CHAPTERS = [

  // ── Front matter ───────────────────────────────────────────────────────────
  {
    id: 'how-to-use',
    kicker: 'Front matter',
    num: null,
    title: 'How to use this handbook',
    blocks: [
      { t: 'lead', text: "Most BIM documentation explains what the standards *say*. This one explains what the machinery *does* — because the reason information management fails on projects is almost never that somebody misread a clause. It is that nobody could see what the clause was for." },
      { t: 'p', text: "It is written for the person whose job is to make the information side of a project work: an information manager, a BIM coordinator or manager, a project architect who inherited the role, a client-side advisor writing requirements for the first time." },
      { t: 'h3', text: 'Three ways in' },
      {
        t: 'steps',
        items: [
          { title: 'You are setting up a project', text: "Read chapters 2, 3 and 5 in order: the CDE, the requirement chain, and the delivery plan. Between them they are the setup." },
          { title: 'You are drowning in a live project', text: "Go to chapter 4 (level of information need) and chapter 7 (the CDE in practice). Most mid-project chaos is one of two things: nobody said how much detail was needed, or nobody agreed what a status means." },
          { title: 'You are being asked for a BIM strategy', text: "Chapters 1, 8 and 10. What the discipline is actually for, how coordination works, and what to do first when you cannot do everything." },
        ],
      },
      { t: 'h3', text: 'On the standards' },
      { t: 'p', text: "This handbook follows the ISO 19650 series, which is the international framework for managing information over the life cycle of a built asset: part 1 sets out the concepts, part 2 covers the delivery phase of an asset, part 3 the operational phase, part 4 information exchange, part 5 the security-minded approach." },
      { t: 'p', text: "Where a term is defined by another standard — level of information need by EN 17412-1, classification by whatever system your region uses — that is said in place. Where a convention is national rather than international, that is said too, because copying a British suitability code set onto a Spanish project without saying so is how a project ends up with two vocabularies and no shared meaning." },
      {
        t: 'callout', kind: 'note', title: 'What this handbook deliberately is not',
        text: "It is not a summary of ISO 19650 — buy the standard, it is worth the money, and its normative wording matters when things go legal. It is not a software guide. And it is not aspirational: everything here is meant to be doable on a project that is already underway, by somebody who does not control the budget.",
      },
      {
        t: 'callout', kind: 'tip', title: 'Its companion volume',
        text: "This book stops at the boundary of the file. Its companion, The IFC Delivery Handbook, starts there: what to check inside an IFC before delivery, why deliveries get rejected, and the fixes per authoring tool. It is also free, at www.ifcvieweronline.eu/ebook/",
      },
    ],
  },

  // ── Chapter 1 ──────────────────────────────────────────────────────────────
  {
    id: 'what-bim-is',
    kicker: 'Chapter 1',
    num: 1,
    title: 'What BIM is, once the marketing stops',
    blocks: [
      { t: 'lead', text: "BIM is not 3D. Projects that believe it is spend a fortune on models nobody can use, and then conclude that BIM does not work." },
      { t: 'h2', text: 'The one-sentence definition' },
      { t: 'pull', text: "BIM is the practice of producing, exchanging and maintaining structured information about a built asset, so that decisions can be made from data rather than from interpretation." },
      { t: 'p', text: "Every word in that sentence is doing work. **Structured** — the information has a shape somebody else's software can read. **Exchanging** — it crosses organisational boundaries, which is where it breaks. **Maintaining** — it outlives the project. **Decisions** — if nobody decides anything differently because of it, it was decoration." },
      { t: 'p', text: "Geometry is in there, but as a carrier. A wall in a model is useful because it can tell you its type, its fire rating, its classification, its cost code and its manufacturer — not because it looks like a wall. A model that only looks like a building is a very expensive drawing." },
      { t: 'h2', text: 'Why the 3D framing causes so much damage' },
      {
        t: 'table',
        headers: ['If you believe BIM is…', 'You optimise for…', 'And you get…'],
        rows: [
          ['A 3D model', 'Visual completeness and detail', 'Heavy files, beautiful renders, empty property sets, no usable schedules'],
          ['A software package', 'Everybody on the same licence', 'Vendor lock-in, and an exchange problem the moment a subcontractor joins'],
          ['A deliverable at the end', 'Passing the final gateway', 'A model produced for compliance, correct on the day it was issued and never again'],
          ['A way of managing information', 'Requirements, exchange and structure', 'Something the client can still use in year seven'],
        ],
      },
      { t: 'h2', text: 'The three things that actually have to work' },
      {
        t: 'steps',
        items: [
          { title: 'Somebody has to say what is needed', text: "In writing, before production starts, at a level of detail that can be tested. Chapter 3 is the chain of documents that does this; chapter 4 is how to make it specific enough to be useful." },
          { title: 'There has to be one place where information lives', text: "With states, revisions and access rules. That is the common data environment, chapter 2 — and it is the single highest-leverage thing a project can get right." },
          { title: 'Information has to survive crossing organisations', text: "Which means open, structured formats, agreed conventions, and checks at the boundary. Chapters 6 and 8, and the whole of the companion volume." },
        ],
      },
      { t: 'h2', text: 'Open BIM, and why it is not ideology' },
      { t: 'p', text: "A project has one client and many suppliers, and those suppliers change over the life of the asset. Native file formats bind information to the software that made it, and to the version of that software. Twenty years later, the software may be gone." },
      { t: 'p', text: "Open, standardised formats — IFC for models, BCF for issues, structured schedules for asset data — exist to break that binding. This is not a philosophical preference: it is the difference between an asset owner who has their information and one who has a licence agreement." },
      {
        t: 'callout', kind: 'warn', title: 'The most common expensive mistake',
        text: "Requiring native files \"as well, just in case\". It sounds prudent and it quietly makes the open deliverable optional: teams produce the native model properly and export the open one at the last minute without checking it. Require the open format as the deliverable of record, and check it.",
      },
      { t: 'h2', text: 'The maturity question, answered honestly' },
      { t: 'p', text: "Most projects are not at the level their BEP claims, and everybody involved knows it. That is survivable. What is not survivable is a project whose documents describe one process while the team runs another, because then no requirement is enforceable and every dispute is about which document counts." },
      { t: 'p', text: "So the useful question is not \"what level are we at?\" but \"what do our documents promise, and are we doing it?\" A modest process, documented accurately and followed, beats an ambitious one that exists only on paper. Chapter 10 is about choosing what to do first." },
    ],
  },

  // ── Chapter 2 ──────────────────────────────────────────────────────────────
  {
    id: 'cde',
    kicker: 'Chapter 2',
    num: 2,
    title: 'The common data environment',
    blocks: [
      { t: 'lead', text: "A CDE is not a folder with permissions, and it is not a product you buy. It is an agreed process — a place where every piece of project information has one location, one revision history and one state that says what you are allowed to do with it." },
      { t: 'h2', text: 'The problem it solves' },
      { t: 'p', text: "Without a CDE, a project has no answer to four questions that get asked hundreds of times: Where is the latest version? Is it finished? Am I allowed to build from it? What did it say last month?" },
      { t: 'p', text: "Every one of those gets answered informally instead — by email, by asking, by guessing. The cost is not the time spent asking. It is the decisions made on the wrong version by people who never thought to ask." },
      { t: 'h2', text: 'The information container' },
      { t: 'p', text: "ISO 19650 does not talk about files or models. It talks about **information containers**: a named, versioned, status-carrying unit of information. Your IFC model is one. The drawing set is another. The asset data schedule is another. A container has three properties, and a project that gets these three right has most of a CDE:" },
      {
        t: 'table',
        headers: ['Property', 'What it means', 'Where it lives'],
        rows: [
          ['Identity', 'A name that follows an agreed convention, so its origin and purpose can be understood without opening it', 'The filename, and the CDE metadata'],
          ['Revision', 'A version marker, so “the latest” is a fact rather than an argument about email timestamps', 'The CDE'],
          ['Status', 'Suitability: what the receiver is permitted to do with it', 'The CDE'],
        ],
      },
      { t: 'h2', text: 'The four states' },
      { t: 'p', text: "This is the core mechanism of the whole standard, and it is simpler than its reputation. Information moves through four states, and each transition is somebody taking responsibility." },
      {
        t: 'table',
        headers: ['State', 'The question it answers', 'Who may rely on it'],
        rows: [
          ['Work in progress', 'Is this mine?', 'Only the task team that owns it. It may be broken. Nobody else may reference it — and that is a rule, not a courtesy.'],
          ['Shared', 'May a colleague coordinate against this?', 'Other task teams, for coordination. It is checked, but not approved. Most of a project happens here.'],
          ['Published', 'May somebody make a decision — or a purchase — from this?', 'Everyone. It has been authorised by the appointing party. Construction, procurement and payment hang off this state.'],
          ['Archive', 'What did we say, and when?', 'Nobody, operationally — it is the record. Its job is to be complete, immutable and retrievable.'],
        ],
      },
      { t: 'p', text: "Two transitions carry all the risk. **Work in progress → Shared** is where a task team asserts that their information is fit for others to build on; it is the correct place for an automated quality check, because it is the cheapest point at which a fault can be caught. **Shared → Published** is where the client accepts information into the project record; it is the correct place for a formal review, because it is the last point at which \"no\" is inexpensive." },
      {
        t: 'callout', kind: 'tip', title: 'The single most valuable CDE rule',
        text: "Nobody works from Work in progress information belonging to another team — ever, not even \"just to get started\". Every project that breaks this rule discovers the cost weeks later, when the thing they got started on changed and nobody told them, because officially they were never using it.",
      },
      { t: 'h2', text: 'Suitability codes' },
      { t: 'p', text: "States say where information is. Suitability codes say what it may be used for, and they are finer-grained. The widely reused set below comes from UK practice (BS 1192 and the UK national annex to ISO 19650-2). It is a convention, not an international requirement — but it is a good one, and inventing your own rarely pays." },
      {
        t: 'table',
        headers: ['Code', 'Meaning', 'Typical use'],
        rows: [
          ['S0', 'Work in progress', 'Initial issue inside a task team'],
          ['S1', 'Suitable for coordination', 'Other disciplines may model against it'],
          ['S2', 'Suitable for information', 'Reference only — do not coordinate against it'],
          ['S3', 'Suitable for review and comment', 'Formal review cycle'],
          ['S4', 'Suitable for stage approval', 'Gateway submission'],
          ['A / B codes', 'Accepted, or accepted with comments', 'The response coming back: authorised, or authorised subject to changes'],
        ],
        caption: 'Whatever set you adopt, write it into the BEP with a plain-language column like the one above. A code nobody can expand into a sentence gets applied by habit rather than meaning.',
      },
      { t: 'h2', text: 'Naming: the boring thing that saves the project' },
      { t: 'p', text: "A container's name is the only metadata that travels with it everywhere — into email attachments, onto laptops, into subcontractors' folders, into the archive. If the name is meaningless, everything outside the CDE becomes guesswork." },
      { t: 'p', text: "The common convention builds the name from fields, separated by a consistent delimiter:" },
      { t: 'code', text: 'Project - Originator - Volume/System - Level/Location - Type - Role - Number\n\nEXAMPLE:\nHSP  -  ABC  -  ZZ  -  03  -  M3  -  A  -  0001\n │      │      │      │      │      │     └ sequential number\n │      │      │      │      │      └────── discipline/role code\n │      │      │      │      └───────────── type of information (model, drawing…)\n │      │      │      └──────────────────── level or location\n │      │      └─────────────────────────── volume or system\n │      └────────────────────────────────── originating organisation\n └───────────────────────────────────────── project code' },
      { t: 'p', text: "The fields matter less than three properties: it is **agreed** and written down; it is **consistent** across every originator; and it is **applied from day one**, because renaming a project's containers halfway through breaks every link anybody has saved." },
      {
        t: 'callout', kind: 'warn', title: 'A convention nobody can follow is worse than none',
        text: "A ten-field convention with codes that require a lookup table gets abbreviated, mistyped and eventually ignored, leaving a project with half-compliant names that cannot be parsed either. A short convention everybody applies correctly beats a thorough one applied by half the team.",
      },
      { t: 'h2', text: 'Choosing and operating one' },
      { t: 'p', text: "Products differ enormously in price and enormously less in what matters. Assess a candidate CDE against what the process requires, not against its feature list:" },
      { t: 'checklist', items: [
        'Can it hold a state and a revision per container, visibly, without a naming workaround?',
        'Can it enforce who may move a container from one state to the next?',
        'Does it keep superseded revisions retrievable rather than overwriting them?',
        'Can an external party be given access to exactly one part of it, without a licence negotiation?',
        'Can you get everything out — containers and metadata — when the project ends or the contract changes?',
        'Does it record who did what, and when, in a form you could show somebody two years later?',
      ]},
      { t: 'p', text: "The last two are the ones that get skipped and the ones that hurt. A CDE you cannot export from is a hostage situation with a monthly fee." },
      { t: 'h2', text: 'The CDE is a process, not the software' },
      { t: 'p', text: "It is entirely possible to run a compliant CDE on unglamorous infrastructure with a disciplined team, and entirely possible to fail with an expensive platform nobody follows. The software enforces; the agreement is what is being enforced. If the agreement does not exist, the software has nothing to do." },
    ],
  },

  // ── Chapter 3 ──────────────────────────────────────────────────────────────
  {
    id: 'requirements-chain',
    kicker: 'Chapter 3',
    num: 3,
    title: 'The requirement chain: OIR, AIR, PIR, EIR, BEP',
    blocks: [
      { t: 'lead', text: "Five acronyms that sound like bureaucracy and are actually one idea: an organisation's purpose, translated step by step into something a modeller can act on. Break any link and the chain stops being a chain." },
      { t: 'h2', text: 'The chain, in one table' },
      {
        t: 'table',
        headers: ['Document', 'Asks', 'Written by', 'Answers to'],
        rows: [
          ['OIR — Organisational Information Requirements', 'What does our organisation need to know, to run itself?', 'The asset owner', 'Business objectives'],
          ['AIR — Asset Information Requirements', 'What do we need to know about this asset, to operate it?', 'The owner / operator', 'The OIR'],
          ['PIR — Project Information Requirements', 'What do we need to know from this project, to make decisions during it?', 'The appointing party', 'The OIR and the AIR'],
          ['EIR — Exchange Information Requirements', 'What exactly must be delivered, when, by whom, in what form?', 'The appointing party, per appointment', 'The PIR and the AIR'],
          ['BEP — BIM Execution Plan', 'How will we meet it?', 'The delivery team', 'The EIR'],
        ],
      },
      { t: 'p', text: "Read the right-hand column downwards and the point becomes obvious: every requirement should be traceable to a reason. A requirement with no ancestor in that chain — \"deliver everything at LOD 400\" — is somebody copying a template, and it will be paid for in modelling hours that no decision ever depends on." },
      { t: 'pull', text: "If you cannot say which operational decision a piece of required information supports, you are not specifying a requirement. You are commissioning a hobby." },
      { t: 'h2', text: 'Where the chain usually breaks' },
      {
        t: 'steps',
        items: [
          { title: 'There is no OIR or AIR, so the EIR is invented', text: "Extremely common: the client has never written down what they need to operate their buildings, so the EIR is copied from another project. Symptom — asset data requirements that the FM team has never heard of and will never use." },
          { title: 'The EIR is written by somebody who will not receive the information', text: "A consultant writes it, the operator never reviews it, and at handover the operator asks for something entirely different. Fix: have whoever will *use* the asset information sign off the AIR before the EIR goes out." },
          { title: 'The BEP answers a different question', text: "A generic BEP describing the delivery team's standard process, not this project's requirements. If the BEP does not reference the EIR clause by clause, nobody has actually confirmed the requirements can be met." },
          { title: 'Nothing is checked against it', text: "The chain exists, the deliveries arrive, and nobody compares one against the other until a gateway. Chapter 9 and the companion volume are about closing this gap." },
        ],
      },
      { t: 'h2', text: 'Writing an EIR that can be met' },
      { t: 'p', text: "An EIR is a specification, and specifications succeed or fail on testability. Six sections, and a test for each:" },
      {
        t: 'table',
        headers: ['Section', 'It must state', 'Test'],
        rows: [
          ['Purpose', 'What the information is for — the decisions it supports', 'Can each requirement be traced to a purpose in this section?'],
          ['Content', 'Which containers, at which milestones, with what content', 'Could a stranger produce the list of expected deliverables from this?'],
          ['Level of information need', 'How much detail, per purpose, per stage', 'Is it specific enough that two teams would produce comparable models? (chapter 4)'],
          ['Format and structure', 'Formats, schema versions, classification, naming, coordinate system, units', 'Could a receiving system be configured from this alone?'],
          ['Process', 'CDE, states, review cycles, acceptance criteria', 'Does it say what happens when a delivery is not accepted?'],
          ['Competence and resource', 'What the delivery team must demonstrate', 'Is it assessable before appointment rather than after?'],
        ],
      },
      {
        t: 'callout', kind: 'tip', title: 'The one sentence that improves most EIRs',
        text: "\"Information shall be delivered to the level of information need specified for each purpose, and no further.\" It gives the delivery team permission to stop, which is the only way over-modelling ever ends.",
      },
      { t: 'h2', text: 'The BEP: pre-appointment and post-appointment' },
      { t: 'p', text: "The pre-appointment BEP is a bid document: this is how we would do it, this is our capability, here is our proposed team and technology. It is a promise made to win work." },
      { t: 'p', text: "The post-appointment BEP is the operating manual: the confirmed team, the confirmed CDE and its states, the naming convention, the delivery plan, the responsibility matrix, the quality gates. It is a live document, and if it has not been updated since it was written, the project is being run from somebody's memory." },
      { t: 'h2', text: 'What belongs in a BEP that people will actually read' },
      { t: 'checklist', items: [
        'The CDE: which one, who administers it, the states and the suitability codes in plain language',
        'The naming convention, with three worked examples',
        'The information delivery plan — what is delivered when, and by whom (chapter 5)',
        'The responsibility matrix: who produces, who checks, who authorises',
        'The level of information need specification, per stage and purpose (chapter 4)',
        'Formats and schema versions, classification system, coordinate system and units',
        'Quality gates: what is checked before issue, against what, and what happens on failure',
        'The federation strategy and the coordination cycle (chapter 8)',
        'How and when this document itself gets updated',
      ]},
      {
        t: 'callout', kind: 'warn', title: 'On BEP length',
        text: "A hundred-page BEP is not a thorough BEP; it is an unread one. Everything above fits in twenty pages if the boilerplate about what BIM is gets deleted — and it should, because the people reading it already know.",
      },
    ],
  },

  // ── Chapter 4 ──────────────────────────────────────────────────────────────
  {
    id: 'loin',
    kicker: 'Chapter 4',
    num: 4,
    title: 'Level of information need (and the LOD mess)',
    blocks: [
      { t: 'lead', text: "No topic in BIM produces more confident, mutually incompatible statements than LOD. The confusion is real and it has a specific cause: several different schemes, from different countries and decades, share one abbreviation." },
      { t: 'h2', text: 'What the abbreviations actually refer to' },
      {
        t: 'table',
        headers: ['Term', 'Origin', 'What it describes'],
        rows: [
          ['LOD — Level of Development', 'US (AIA, and the BIMForum specification)', 'How reliable an element is: its geometry AND the information attached, expressed as 100–500'],
          ['LOD — Level of Detail', 'Common usage', 'Geometric resolution only. Frequently confused with the above, which is the root of most arguments'],
          ['LOI — Level of Information', 'UK usage', 'The alphanumeric side: which properties, to what precision'],
          ['LOIN — Level of Information Need', 'European standard (EN 17412-1)', 'A framework: define the detail required by *purpose*, covering geometry, alphanumeric data and documentation'],
        ],
        caption: 'ISO 19650 itself does not define LOD levels. It refers to level of information need, which EN 17412-1 sets out. This is why an EIR that says only “LOD 350” is not, strictly, specifying anything under the framework it claims to follow.',
      },
      { t: 'h2', text: 'Why the number scheme fails in practice' },
      { t: 'p', text: "Suppose an EIR requires LOD 300. Two teams, both honest and both experienced, will deliver measurably different models — because the number compresses at least three independent dimensions into one figure, and each team decompresses it differently." },
      { t: 'p', text: "Worse, the number is usually applied to a whole model, when the actual need varies by element and by purpose. The structural frame may need to be reliable enough to fabricate from; the ceiling void needs to be accurate enough to coordinate services in; the door ironmongery needs a manufacturer reference and almost no geometry at all. One number cannot say that." },
      { t: 'pull', text: "The right question is never “what LOD?” It is “what will this information be used for, and what does that use require?”" },
      { t: 'h2', text: 'The LOIN way: specify by purpose' },
      { t: 'p', text: "The framework asks for three things, per purpose, per stage, per element group:" },
      {
        t: 'steps',
        items: [
          { title: 'Geometrical information', text: "Detail, dimensionality, location accuracy, appearance, parametric behaviour. Ask: what is the coarsest geometry that still supports the decision?" },
          { title: 'Alphanumerical information', text: "Which properties, in which property sets, with what units and what allowed values. This is where nearly all the downstream value sits, and where nearly all the specification effort should go." },
          { title: 'Documentation', text: "What travels alongside: certificates, warranties, O&M documents, classification references, links to external records." },
        ],
      },
      { t: 'h2', text: 'A specification table that works' },
      { t: 'p', text: "This is the artefact to put in the EIR or the BEP appendix. It is more work than writing \"LOD 350\", and it is the only version that two different teams will interpret the same way." },
      {
        t: 'table',
        headers: ['Element group', 'Purpose', 'Geometry', 'Data', 'Stage'],
        rows: [
          ['Structural frame', 'Coordination + fabrication reference', 'Accurate size and position; connections indicative', 'Material, grade, fire rating, classification', 'From technical design'],
          ['Services (MEP)', 'Spatial coordination', 'Real sizes including insulation; routing as installed intent', 'System assignment, flow, classification', 'From technical design'],
          ['Doors', 'Schedules + asset handover', 'Nominal opening only', 'Type, fire rating, acoustic rating, ironmongery set, manufacturer at handover', 'Data grows by stage'],
          ['Spaces', 'Area schedules + FM', 'Bounded volumes, one per room', 'Name, number, department, net floor area, occupancy', 'From concept, refined by stage'],
          ['Finishes', 'Quantities', 'Surface representation, no build-up', 'Material, classification, area', 'From technical design'],
        ],
        caption: 'Fill in your own rows. The columns are the point: an element group, the purpose that justifies the requirement, and separate geometric and alphanumeric expectations that grow by stage.',
      },
      {
        t: 'callout', kind: 'tip', title: 'If you must use LOD numbers',
        text: "Use them as shorthand *on top of* a table like the one above, never instead of it — and define each number you use in the BEP with a sentence. A number everyone can expand into the same sentence is a useful abbreviation; a number nobody defines is a future dispute.",
      },
      { t: 'h2', text: 'Over-delivery is a defect' },
      { t: 'p', text: "It is worth stating plainly, because the instinct runs the other way: information beyond the level of information need is not generosity. It costs modelling time nobody budgeted, it inflates files, and — most damagingly — it creates data that nobody validates and everybody trusts." },
      { t: 'p', text: "A model where half the properties were filled in carefully and half were auto-populated with defaults is more dangerous than a model where the second half is empty, because empty is visibly missing and a plausible wrong value is not." },
      { t: 'h2', text: 'Making it enforceable' },
      { t: 'p', text: "A level of information need specification becomes real when a delivery can be tested against it. Three practical mechanisms, in increasing order of effort:" },
      {
        t: 'table',
        headers: ['Mechanism', 'What it catches', 'Cost'],
        rows: [
          ['A property-set schedule in the BEP', 'Nothing by itself — but it is the reference everything else tests against', 'An afternoon, once'],
          ['Automated model checks at issue', 'Missing property sets, unclassified elements, spaces without area or name', 'Minutes per delivery, once configured'],
          ['A machine-readable requirement specification', 'Everything above, expressed as a file the checker reads directly, so requirements and checks cannot drift apart', 'A day to author, then near zero'],
        ],
        caption: 'The third row is what buildingSMART’s Information Delivery Specification (IDS) is for: requirements written once, in a form a checker can execute. It is the direction the industry is moving, and it is worth knowing about even if you are not ready to adopt it.',
      },
    ],
  },

  // ── Chapter 5 ──────────────────────────────────────────────────────────────
  {
    id: 'delivery-planning',
    kicker: 'Chapter 5',
    num: 5,
    title: 'Planning the delivery: TIDP, MIDP and milestones',
    blocks: [
      { t: 'lead', text: "Everything in chapters 3 and 4 describes *what* is needed. This chapter is *when*, *by whom*, and *depending on what* — the part that turns requirements into a schedule somebody can be held to." },
      { t: 'h2', text: 'Two documents, one idea' },
      {
        t: 'table',
        headers: ['Document', 'Scope', 'Owned by'],
        rows: [
          ['TIDP — Task Information Delivery Plan', 'One task team’s containers, with dates, authors and dependencies', 'That task team’s lead'],
          ['MIDP — Master Information Delivery Plan', 'All the TIDPs aggregated into one project-level plan', 'The lead appointed party / information manager'],
        ],
      },
      { t: 'p', text: "The aggregation is not clerical. It is where the dependencies between teams become visible — and dependencies between teams are where information delivery actually fails. The architect's ceiling layout is not late in isolation; it is late *for* the services team, whose own delivery date nobody moved." },
      { t: 'h2', text: 'What a delivery plan row contains' },
      {
        t: 'table',
        headers: ['Field', 'Why it is there'],
        rows: [
          ['Container name', 'Per the naming convention — so the plan and the CDE speak the same language'],
          ['Description', 'What it is, in a sentence a non-specialist understands'],
          ['Purpose', 'Which decision it supports — the trace back to the EIR'],
          ['Author / task team', 'One name, not a company'],
          ['Level of information need', 'A reference to the specification, not a number floating on its own'],
          ['Due date', 'Against the milestone, not against a wish'],
          ['Depends on', 'Which containers must exist first. The most valuable column, and the most often missing'],
          ['Status on delivery', 'Which suitability code it is expected to reach'],
        ],
      },
      {
        t: 'callout', kind: 'tip', title: 'Build the plan backwards',
        text: "Start from the decision that needs the information and work back through its dependencies. Plans built forwards from “what can we produce” are a list of intentions; plans built backwards from a decision date are a schedule.",
      },
      { t: 'h2', text: 'Milestones that mean something' },
      { t: 'p', text: "A milestone is only useful if something is *decided* at it. \"Stage 3 model issue\" is an activity. \"Layouts frozen for services coordination\" is a decision, and it tells everybody what happens if the date slips." },
      { t: 'p', text: "For each information milestone, write down three things: the decision being made, the containers required to make it, and who accepts them. If you cannot name the decision, the milestone is ceremonial and can be deleted — which is itself a useful outcome." },
      { t: 'h2', text: 'The responsibility matrix' },
      { t: 'p', text: "One row per information type, four columns, and most of the ambiguity on a project disappears:" },
      {
        t: 'table',
        headers: ['Information', 'Produces', 'Checks', 'Authorises'],
        rows: [
          ['Architectural model', 'Architect task team', 'Architect BIM lead', 'Lead appointed party'],
          ['Structural model', 'Engineer task team', 'Engineer BIM lead', 'Lead appointed party'],
          ['Federated model', 'Information manager', 'Coordination team', 'Lead appointed party'],
          ['Asset data schedule', 'Each task team for its scope', 'Information manager', 'Appointing party'],
          ['Room / space data', 'Architect', 'Client-side advisor', 'Appointing party'],
        ],
        caption: 'The “checks” column is the one that reveals the gaps. Any row where produces and checks name the same person is a row with no quality control.',
      },
      { t: 'h2', text: 'Keeping the plan alive' },
      { t: 'p', text: "A delivery plan written at the start and never revisited is an archaeological artefact. Three habits keep it useful, and none of them takes more than a few minutes a week:" },
      {
        t: 'steps',
        items: [
          { title: 'Review it at the coordination meeting, not in a separate one', text: "The plan is the agenda: what was due, what arrived, what changed. If it needs its own meeting, it is not being used." },
          { title: 'Record slippage against the dependency, not the date', text: "\"Two weeks late\" is information nobody can act on. \"Two weeks late, which moves the services coordination freeze\" is a decision request." },
          { title: 'Update it when scope changes, in the same week', text: "The plan's authority comes entirely from being current. One month of staleness and everybody quietly goes back to email." },
        ],
      },
    ],
  },

  // ── Chapter 6 ──────────────────────────────────────────────────────────────
  {
    id: 'roles',
    kicker: 'Chapter 6',
    num: 6,
    title: 'Who is responsible for what',
    blocks: [
      { t: 'lead', text: "ISO 19650 renamed the parties for a reason: the old vocabulary (client, contractor, subcontractor) describes commercial relationships, and information responsibilities do not always follow the money." },
      { t: 'h2', text: 'The three parties' },
      {
        t: 'table',
        headers: ['Party', 'Who this usually is', 'Responsible for'],
        rows: [
          ['Appointing party', 'The client / asset owner', 'Stating what information is needed and why; accepting or rejecting it; providing the CDE (or specifying it)'],
          ['Lead appointed party', 'The main contractor, or the lead designer', 'Coordinating the delivery team; aggregating the plans; running the information management process on the project'],
          ['Appointed party', 'Each designer, subcontractor or specialist', 'Producing their own information to the agreed requirements and checking it before issue'],
        ],
        caption: 'A party can be more than one of these on different appointments — a contractor is an appointed party to the client and an appointing party to its own supply chain. The roles describe a relationship, not a company.',
      },
      { t: 'h2', text: 'The function everyone argues about: information management' },
      { t: 'p', text: "Information management is a *function*, not automatically a job title, and it can be delivered by the appointing party, by the lead appointed party, or by a third party appointed for the purpose. What must not happen is for it to be assumed by everybody and performed by nobody." },
      { t: 'p', text: "In practice the function covers: running the CDE and its states, maintaining the naming convention, aggregating and policing the delivery plan, running federation and coordination, checking incoming information against the requirements, and preparing information for acceptance." },
      {
        t: 'callout', kind: 'warn', title: 'The most common structural failure',
        text: "The information manager function is written into the BEP and given to somebody with no authority to reject a delivery. They can observe problems and report them, and that is all. Either the function carries the authority to say no, or it is documentation of failures rather than prevention of them.",
      },
      { t: 'h2', text: 'BIM manager, BIM coordinator, information manager' },
      { t: 'p', text: "The titles are used inconsistently across the industry, which is fine as long as a project defines its own. A workable division:" },
      {
        t: 'table',
        headers: ['Role', 'Horizon', 'Typical week'],
        rows: [
          ['BIM manager', 'The organisation', 'Standards, templates, training, tooling, capability across projects'],
          ['Information manager', 'The project', 'CDE, requirements, delivery plan, acceptance, the process working'],
          ['BIM coordinator', 'The discipline / task team', 'Model quality, federation, clash resolution, getting deliveries out clean'],
        ],
      },
      { t: 'h2', text: 'What a task team owes the project' },
      { t: 'p', text: "Regardless of titles, an appointed party's information obligations reduce to five, and they are worth stating in the BEP in exactly this form:" },
      { t: 'checklist', items: [
        'Produce to the agreed requirements — the level of information need, formats, conventions and coordinate system',
        'Check before issuing, and issue the evidence of the check alongside the container',
        'Issue at the agreed status, on the agreed date, into the CDE — not by email',
        'Report events that break identifier or coordinate continuity when they happen, not at the next gateway',
        'Respond to findings raised against your containers within the agreed cycle',
      ]},
      { t: 'h2', text: 'The competence question' },
      { t: 'p', text: "Assessing a delivery team's information capability before appointment is the cheapest quality control available, and it is mostly skipped because it feels awkward. Four questions that reveal more than any certificate:" },
      {
        t: 'steps',
        items: [
          { title: 'Show me a model you delivered on your last project', text: "Not a render. The actual container, opened in a neutral viewer. Property sets populated or not, spatial structure sound or not — visible in a minute." },
          { title: 'What do you check before you issue, and how?', text: "A team with a real process answers immediately and specifically. A team without one answers in principles." },
          { title: 'Who in your team does the checking?', text: "A name. If it is \"whoever is available\", quality is a function of workload." },
          { title: 'What happened the last time a delivery of yours was rejected?', text: "Everyone has had one. The useful signal is whether they can describe the cause and what they changed." },
        ],
      },
    ],
  },

  // ── Chapter 7 ──────────────────────────────────────────────────────────────
  {
    id: 'cde-practice',
    kicker: 'Chapter 7',
    num: 7,
    title: 'Running the CDE day to day',
    blocks: [
      { t: 'lead', text: "Chapter 2 is what a CDE is. This is what it takes to keep one working once forty people are using it and the programme is under pressure — which is when every process either proves itself or quietly stops." },
      { t: 'h2', text: 'The week' },
      {
        t: 'table',
        headers: ['Rhythm', 'Activity', 'Who'],
        rows: [
          ['Continuous', 'Task teams work in WIP; nobody outside the team touches it', 'Task teams'],
          ['Weekly', 'Shared issue: each team publishes its current state to Shared, with its check evidence', 'Task teams'],
          ['Weekly', 'Federation and coordination review against the Shared set', 'Information manager + coordinators'],
          ['Per cycle', 'Findings raised, assigned and tracked as issues — not as emails', 'Coordination team'],
          ['At milestones', 'Formal review, acceptance and move to Published', 'Appointing party'],
          ['Continuously', 'Superseded revisions retained; nothing deleted', 'The CDE itself'],
        ],
      },
      { t: 'p', text: "The weekly cadence is the important part. A project that shares fortnightly discovers coordination problems that are two weeks old, and by then somebody has built on top of them." },
      { t: 'h2', text: 'Six rules worth writing on the wall' },
      {
        t: 'steps',
        items: [
          { title: 'One place. No exceptions', text: "The moment a container is legitimately obtained from somewhere other than the CDE, the CDE is no longer the source of truth for anybody. This includes \"just this once, by email, because the CDE was slow\"." },
          { title: 'Never overwrite; always supersede', text: "Superseded information must remain retrievable. Not for nostalgia — because the question \"what did it say when we made that decision?\" gets asked in every dispute." },
          { title: 'Status is a promise, not a label', text: "If information is marked suitable for coordination, other teams will build on it. Marking WIP work as Shared to satisfy a delivery date transfers your risk onto people who cannot see it." },
          { title: 'Check before issue, not after receipt', text: "The producer knows the model; the receiver does not. A defect costs minutes to fix at the source and hours to diagnose downstream." },
          { title: 'Comments belong in the issue system', text: "A finding raised in a meeting and not recorded did not happen. If it matters enough to say, it matters enough to have an owner and a date." },
          { title: 'Access is granted by role, and reviewed', text: "Especially when people leave. A CDE with an ex-employee still holding publishing rights is a governance finding waiting to be written up." },
        ],
      },
      { t: 'h2', text: 'The failure modes, and what causes them' },
      {
        t: 'table',
        headers: ['Symptom', 'Actual cause', 'Fix'],
        rows: [
          ['People email files instead of using the CDE', 'The CDE is slow, or permissions are wrong, or nobody was trained', 'Fix the friction — enforcement alone never wins against inconvenience'],
          ['Everything sits in WIP forever', 'Teams fear sharing imperfect work', 'Make explicit that Shared means “checked”, not “finished” — and hold the weekly cadence'],
          ['Nobody trusts the statuses', 'Statuses were applied by habit or to hit a date', 'Audit a sample; make the acceptance criteria explicit and public'],
          ['Duplicate containers with slightly different names', 'The naming convention is too complex, or was never enforced from day one', 'Simplify it, then re-issue with a documented mapping — do not leave both alive'],
          ['The archive is unusable', 'Retention was never designed; the CDE overwrote or the export was never tested', 'Test an archive export early, while there is still time to change platform'],
        ],
      },
      {
        t: 'callout', kind: 'tip', title: 'Test the exit on day one',
        text: "Export everything from your CDE — containers plus metadata — in the first month, while the project is small and the decision is reversible. Teams that first attempt this at handover discover what their platform actually supports at the worst possible moment.",
      },
      { t: 'h2', text: 'Security-minded operation, briefly' },
      { t: 'p', text: "Some assets carry a genuine security dimension — utilities, transport, defence, data centres, and any building whose occupants are themselves sensitive. ISO 19650-5 covers this, and its practical core is unglamorous: know what information would be damaging if aggregated, restrict access accordingly, and be deliberate about what leaves the CDE." },
      { t: 'p', text: "For everybody else, the proportionate version is three habits: do not put an entire asset's information in an unrestricted share, be careful with model data containing security systems or occupant details, and treat \"can you just send me the full model?\" as a question that deserves an answer rather than a reflex." },
    ],
  },

  // ── Chapter 8 ──────────────────────────────────────────────────────────────
  {
    id: 'federation',
    kicker: 'Chapter 8',
    num: 8,
    title: 'Federation and coordination',
    blocks: [
      { t: 'lead', text: "Federation is combining discipline models into one coordinated whole *without merging them* — each team keeps authorship of its own information, and the combination is a view rather than a new master model." },
      { t: 'h2', text: 'Why federation rather than one model' },
      { t: 'p', text: "A single shared model sounds simpler and fails for a structural reason: authorship. When one file contains everybody's work, nobody can say who is responsible for what, changes collide, and the file becomes both a technical and a contractual bottleneck." },
      { t: 'p', text: "Federation keeps responsibility where the work is done. The architect owns the architecture, the engineer owns the structure, and the coordinated whole is assembled from containers that each have an author, a revision and a status." },
      { t: 'h2', text: 'What federation requires to work at all' },
      {
        t: 'steps',
        items: [
          { title: 'A shared reference point', text: "Agreed before anybody models: a project base point with a known relationship to the real world, and a stated rotation. Every discipline uses it. This one decision prevents the most spectacular coordination failure there is — models that are internally perfect and hundreds of metres apart." },
          { title: 'Consistent units', text: "Metric SI, stated in the BEP. A single model delivered in imperial units will be silently converted by some tools and not others, and the error surfaces at fabrication." },
          { title: 'A common level schedule', text: "One set of names and elevations for the whole project, used by every discipline without local variants. Otherwise every filter, sheet and issue that says “level 3” needs a translation table maintained by a person." },
          { title: 'Stable element identifiers', text: "So an issue raised this week still points at the same element next week. Identifiers that regenerate on every export detach every comment ever made." },
        ],
      },
      {
        t: 'callout', kind: 'warn', title: 'These four are the whole game',
        text: "Every one of them is decided in the first weeks and is expensive to change later. A project that agrees these four and nothing else will still coordinate; a project with an elaborate BEP and no agreement on the base point will not.",
      },
      { t: 'h2', text: 'The coordination cycle' },
      {
        t: 'table',
        headers: ['Step', 'What happens', 'Output'],
        rows: [
          ['1. Issue', 'Each team shares its checked container at the agreed status', 'A complete Shared set, same week for everybody'],
          ['2. Federate', 'Containers are combined against the shared reference point', 'One coordinated view'],
          ['3. Analyse', 'Interferences and spatial problems are identified and triaged', 'A raw findings list'],
          ['4. Triage', 'Findings grouped by cause and owner; noise discarded', 'A short list somebody can act on'],
          ['5. Assign', 'Each grouped finding gets an owner and a date, in the issue system', 'Tracked issues, not meeting notes'],
          ['6. Resolve and verify', 'Fixes appear in the next issue; findings are closed against evidence', 'A closed loop'],
        ],
      },
      { t: 'h2', text: 'Triage is the skill' },
      { t: 'p', text: "Raw interference detection on a federated set produces numbers that are useless as a work list: thousands of results, most of which are one modelling convention meeting another. A coordination process that hands that list to designers loses their trust in one cycle." },
      { t: 'p', text: "Three filters, applied in order, turn it into a list somebody will act on:" },
      {
        t: 'table',
        headers: ['Filter', 'Question', 'Typical reduction'],
        rows: [
          ['Relevance', 'Would this matter on site, or is it two elements that are allowed to overlap?', 'Removes the great majority'],
          ['Grouping', 'Is this one cause with many symptoms — a duct run through a beam line?', 'Turns hundreds of results into a handful of decisions'],
          ['Ownership', 'Who can actually resolve it, and what do they need to decide?', 'Turns a decision into a task'],
        ],
        caption: 'Report the counts before and after triage. Showing “3,140 raw results → 26 issues” makes the filtering visible and defensible, rather than looking like findings were quietly dropped.',
      },
      { t: 'h2', text: 'Issues that get acted on' },
      { t: 'p', text: "An issue exists to move work, so it is written for the person doing the work, not for the record. Four properties, and BCF — the open exchange format for issues — supports all of them:" },
      { t: 'ul', items: [
        "**A viewpoint** — a camera position and a selection, so the receiver lands on the problem instead of hunting for it.",
        "**One cause per topic** — not one topic per affected element. Four hundred symptoms of one routing decision are one issue.",
        "**A named owner and a date** — an issue owned by a discipline is owned by nobody.",
        "**A statement of the decision required** — not \"clash\", but \"duct or beam: which moves, and who decides?\"",
      ]},
      {
        t: 'callout', kind: 'tip', title: 'Coordinate against Shared, never WIP',
        text: "It is tempting, when a team is late, to coordinate against whatever they have in progress. It feels helpful and it converts their unfinished work into your rework, silently, because nothing in the process records that you did it.",
      },
    ],
  },

  // ── Chapter 9 ──────────────────────────────────────────────────────────────
  {
    id: 'quality-gates',
    kicker: 'Chapter 9',
    num: 9,
    title: 'Quality gates: checking information as it moves',
    blocks: [
      { t: 'lead', text: "Every state transition in the CDE is an opportunity to catch a defect while it is still cheap. A project that checks only at gateways is a project that finds its problems at the most expensive possible moment." },
      { t: 'h2', text: 'Three gates, three different questions' },
      {
        t: 'table',
        headers: ['Gate', 'Question', 'Who', 'How long it takes'],
        rows: [
          ['WIP → Shared', 'Is this structurally sound and honestly labelled?', 'The producing task team, before issue', 'Under a minute, automated'],
          ['Shared → coordination', 'Does it federate, and does it agree with everybody else?', 'Information manager, weekly', 'Part of the coordination cycle'],
          ['Shared → Published', 'Does it meet the EIR, and is there evidence?', 'Appointing party, at milestones', 'A formal review'],
        ],
      },
      { t: 'p', text: "The first gate carries most of the value and costs the least, which is the opposite of where most projects put their effort. It is also the only gate the producer controls, which makes it the only gate that prevents rather than detects." },
      { t: 'h2', text: 'What to check at the first gate' },
      { t: 'p', text: "Model-level checks that take seconds and catch the faults that break everything downstream:" },
      { t: 'checklist', items: [
        'Structural integrity — identifiers unique and well formed, no broken or circular relationships',
        'Spatial structure — every element sits under the correct building and storey',
        'Coordinates and units — on the project reference point, metric SI',
        'Storeys — present, named per the level schedule, in ascending order',
        'Required property sets present for the declared level of information need',
        'Classification references present, where the stage requires them',
        'Spaces named and measurable, where the stage requires them',
        'Identifiers stable against the previous revision',
      ]},
      {
        t: 'callout', kind: 'note', title: 'The file-level detail lives in the companion volume',
        text: "Each of those bullets expands into specific checks with specific fixes per authoring tool. That is the subject of The IFC Delivery Handbook — also free, at www.ifcvieweronline.eu/ebook/",
      },
      { t: 'h2', text: 'The check nobody runs on the checker' },
      { t: 'p', text: "One failure mode is worth more attention than any defect: **a check that did not run looks exactly like a check that passed**. Both produce zero findings." },
      { t: 'p', text: "A large file times out, a process is cancelled, a rule silently gives up — and the report comes back clean. Whatever tooling you use, ask it one question: how do I know every check ran? If it reports only pass and fail, with no third state for \"not attempted\", its clean reports mean less than they appear to." },
      { t: 'h2', text: 'Acceptance criteria: deciding before you need to' },
      { t: 'p', text: "A gate needs criteria agreed in advance, or every rejection becomes a negotiation about whose standards apply. The table below goes in the EIR or a BEP appendix, and its purpose is not to be strict — it is to be *decided*, before the first delivery rather than during the third argument." },
      {
        t: 'table',
        headers: ['Criterion', 'Reject if…', 'Project position'],
        rows: [
          ['Structural integrity', 'Any structural finding at error severity', '☐ Reject  ☐ Accept with note'],
          ['Check coverage', 'Any check reported not-run or failed', '☐ Reject  ☐ Re-run required'],
          ['Identifier stability', 'Turnover above an agreed percentage between revisions', 'Max turnover: ______ %'],
          ['Georeferencing', 'Not on the project shared reference point', '☐ Reject'],
          ['Units', 'Non-metric length units', '☐ Reject'],
          ['Naming', 'Does not follow the agreed convention', '☐ Reject  ☐ Rename and log'],
          ['Level of information need', 'Required property sets missing for the stage', 'Schedule reference: ______'],
          ['Classification', 'Elements without a classification reference', 'Applies from stage: ______'],
          ['Spaces', 'Spaces without name, number or area', 'Applies from stage: ______'],
          ['Evidence', 'No check report issued with the container', '☐ Reject'],
        ],
      },
      { t: 'h2', text: 'Accepting information that failed' },
      { t: 'p', text: "Sometimes the right answer is yes anyway — the missing information is outside the level of information need for the stage, or a supplier has not delivered, or the alternative is stopping work. Accepting a failed delivery is a legitimate decision; accepting it *silently* is not." },
      { t: 'p', text: "A waived finding needs three things attached: a reason, a person who agreed, and a date. That is the whole difference between a finding accepted and a finding ignored — and it is what stops the same problem being rediscovered as a crisis two stages later." },
    ],
  },

  // ── Chapter 10 ─────────────────────────────────────────────────────────────
  {
    id: 'handover',
    kicker: 'Chapter 10',
    num: 10,
    title: 'Handover: from project to asset',
    blocks: [
      { t: 'lead', text: "Handover is where BIM either pays for itself or is quietly written off. It is also the moment when every shortcut taken during delivery becomes visible to somebody who was not there and has no reason to be forgiving." },
      { t: 'h2', text: 'PIM and AIM' },
      { t: 'p', text: "During delivery, the project produces a **project information model** — everything created to design and build the asset. At handover, a subset of it becomes the **asset information model**: what the operator needs to run the building for the next several decades." },
      { t: 'p', text: "The subset is much smaller than the whole, and choosing it is the work. An operator does not need the design iterations, the coordination models or the temporary works. They need to know what is installed, where it is, what it is made of, who supplied it, and when it needs attention." },
      { t: 'pull', text: "The AIM is not a smaller PIM. It is a different document with a different reader, and it should be specified as one from the beginning." },
      { t: 'h2', text: 'Why handover data is usually bad' },
      {
        t: 'table',
        headers: ['Cause', 'What it looks like at handover', 'When to fix it'],
        rows: [
          ['Asset data was never specified', 'A model full of geometry and empty property sets', 'In the AIR, before the EIR is written'],
          ['It was left to the end', 'Thousands of properties filled in by one person in the last fortnight', 'Require it to grow by stage, and check it at each one'],
          ['Nobody who will use it ever reviewed it', 'Data structured for the designers, not for the FM system', 'Have the operator sign off a sample early — a real one, from a real model'],
          ['Suppliers were never asked', 'Manufacturer and model missing across whole systems', 'Put it in the subcontract, not just the BEP'],
          ['Nothing was checked', 'Blank columns discovered by the FM team in month two of operation', 'Check the schedule at every stage, not once at the end'],
        ],
      },
      { t: 'h2', text: 'The structured schedule' },
      { t: 'p', text: "Asset information is usually delivered as a structured schedule — COBie being the most widely used convention — because the receiving system is a maintenance database, not a modelling tool. Whatever format your client requires, the same shape applies: spaces, the types of thing installed, the individual components, the systems they belong to, and the documents attached to them." },
      { t: 'p', text: "This is where model quality becomes commercially visible, because the schedule is read by somebody with no way to interpret an excuse. It is also a useful validator of your own process: spaces without names, types without manufacturers, components not assigned to a space — those gaps arrive as blank columns a facilities manager can see at a glance." },
      {
        t: 'callout', kind: 'tip', title: 'The handover test you can run in year one',
        text: "Export the asset schedule from the model at the end of the first design stage, when it will obviously be incomplete, and send it to whoever will operate the building. Their reaction tells you more about your requirements than any amount of specification review — and there is still time to act on it.",
      },
      { t: 'h2', text: 'What actually gets handed over' },
      { t: 'checklist', items: [
        'The asset information model — containers in the agreed open formats, at the agreed level of information need',
        'The structured asset data schedule, complete for the agreed asset types',
        'Documentation linked to the assets: O&M manuals, warranties, certificates, test records',
        'The classification and naming conventions used, so the data can be interpreted in ten years',
        'Evidence that the information was checked, and against what',
        'A statement of known gaps, with reasons — the honest version is worth more than a silent one',
        'The archive: superseded revisions and the record of decisions',
      ]},
      { t: 'h2', text: 'After handover' },
      { t: 'p', text: "The AIM is not a delivery, it is a living record: it changes when a pump is replaced, a space is repurposed, a tenant fits out a floor. ISO 19650-3 covers the operational phase for exactly this reason." },
      { t: 'p', text: "The practical minimum for an owner who is not ready for a full operational information process: decide who owns the AIM, decide how a change gets recorded, and check once a year that the record still resembles the building. An AIM that nobody maintains is a photograph of handover day, and it degrades quietly until somebody makes a decision from it." },
    ],
  },

  // ── Chapter 11 ─────────────────────────────────────────────────────────────
  {
    id: 'getting-started',
    kicker: 'Chapter 11',
    num: 11,
    title: 'What to do first',
    blocks: [
      { t: 'lead', text: "Everything in this handbook is worth doing and no project can do all of it at once. This chapter is about sequence — what to fix first when you have limited authority, a live project and no appetite for a transformation programme." },
      { t: 'h2', text: 'The order that works' },
      {
        t: 'steps',
        items: [
          { title: 'One place for information, with states', text: "Even a modest CDE, applied consistently, removes the largest single source of waste on a project: work done on the wrong version. Nothing else you do matters as much." },
          { title: 'A naming convention, applied from the next issue', text: "Short, agreed, three worked examples in the BEP. Cheap to introduce, and it compounds — every container from now on is findable." },
          { title: 'A check before issue', text: "Automated, under a minute, run by the producing team. This is the highest ratio of prevented pain to effort available anywhere in the process." },
          { title: 'Agreement on the four federation basics', text: "Shared reference point, units, level schedule, identifier stability (chapter 8). One meeting, and it prevents the failures that cost weeks." },
          { title: 'A delivery plan with a dependency column', text: "Even a spreadsheet. The dependencies are the value; the dates are just the presentation." },
          { title: 'A level of information need table, by purpose', text: "Start with the five element groups that matter most on your project. Extend it next project rather than trying to be exhaustive now." },
          { title: 'Acceptance criteria, agreed before the next delivery', text: "The table in chapter 9. It converts quality from an opinion into an application of a rule." },
        ],
      },
      { t: 'h2', text: 'What not to do first' },
      {
        t: 'table',
        headers: ['Tempting', 'Why it is a poor first move'],
        rows: [
          ['Buy a platform', 'A tool enforces an agreement. Without the agreement it enforces nothing, expensively'],
          ['Write a hundred-page BEP', 'Length is not rigour. Twenty pages that describe what you actually do beats a hundred that describe an aspiration'],
          ['Mandate a high LOD everywhere', 'Guarantees over-modelling, budget overrun and data nobody validates'],
          ['Start with clash detection', 'Federating unchecked models produces thousands of findings and destroys the team’s trust in the process in one cycle'],
          ['Restructure the whole supply chain', 'You will get one or two behaviour changes out of a live project. Spend them on the CDE and the pre-issue check'],
        ],
      },
      { t: 'h2', text: 'Making it stick' },
      { t: 'p', text: "Three things separate a process that survives a busy month from one that does not:" },
      {
        t: 'steps',
        items: [
          { title: 'Reduce friction before increasing enforcement', text: "Every rule people break is a rule that costs them more than following it saves them. Find the cost and remove it; enforcement without that is a losing argument repeated weekly." },
          { title: "Make the check somebody's Tuesday, not somebody's project", text: "Processes that require a special effort get skipped exactly when they matter. Processes attached to something that already happens every week survive." },
          { title: 'Show the numbers', text: "Findings caught before issue, deliveries accepted first time, issues closed per cycle. Not for a dashboard — so that when the process is under pressure, its value is a number rather than an opinion." },
        ],
      },
      {
        t: 'callout', kind: 'tip', title: 'The honest starting position',
        text: "Write down what your project actually does today, not what the BEP claims. The gap between those two documents is your work list, in priority order, and it is usually shorter than anybody expects.",
      },
    ],
  },

  // ── Appendices ─────────────────────────────────────────────────────────────
  {
    id: 'appendix-a',
    kicker: 'Appendix A',
    num: null,
    title: 'Project set-up checklist',
    blocks: [
      { t: 'p', text: "Everything that is cheap now and expensive later. If a project can only complete one appendix in this book, it should be this one." },
      { t: 'h3', text: 'Before anybody models' },
      { t: 'checklist', items: [
        'Shared reference point and rotation agreed, documented, and issued to every task team',
        'Length units agreed — metric SI — and stated in the BEP',
        'Level schedule agreed: one set of names and elevations for the whole project',
        'Naming convention agreed, with three worked examples in the BEP',
        'Classification system agreed, with the version stated',
        'Exchange formats and schema versions agreed',
      ]},
      { t: 'h3', text: 'The environment' },
      { t: 'checklist', items: [
        'CDE selected, administered by a named person',
        'States and suitability codes defined in plain language in the BEP',
        'Access set up by role; process agreed for joiners and leavers',
        'Archive and export tested — a real export, in the first month',
        'Issue tracking in place, with an agreed exchange format',
      ]},
      { t: 'h3', text: 'Requirements' },
      { t: 'checklist', items: [
        'AIR reviewed by whoever will operate the asset',
        'EIR traceable to the AIR and PIR — no orphan requirements',
        'Level of information need specified by purpose and stage, not as a single number',
        'Property-set schedule written down',
        'Acceptance criteria agreed and published before the first delivery',
      ]},
      { t: 'h3', text: 'Planning' },
      { t: 'checklist', items: [
        'TIDPs produced by each task team',
        'MIDP aggregated, with a dependency column that is filled in',
        'Information milestones tied to named decisions',
        'Responsibility matrix agreed: produces / checks / authorises',
        'Coordination cycle scheduled — weekly, in the calendar',
      ]},
      { t: 'h3', text: 'Quality' },
      { t: 'checklist', items: [
        'Pre-issue check defined: what is checked, by whom, with what',
        'Check evidence issued alongside every container',
        'Coverage reporting understood — you can tell a passed check from an unattempted one',
        'Waiver process agreed: reason, owner, date',
      ]},
    ],
  },
  {
    id: 'appendix-b',
    kicker: 'Appendix B',
    num: null,
    title: 'Templates to adapt',
    blocks: [
      { t: 'p', text: "Copy, adapt and use these on your own projects without attribution. They are drafting aids, not legal advice — have anything contractual reviewed by whoever signs your contracts." },
      {
        t: 'clause', id: 'Template 1',
        title: 'EIR — level of information need clause',
        text: "Information shall be delivered to the level of information need specified in Appendix {x} for each purpose and stage, and no further. Where a requirement in Appendix {x} cannot be met for a specific element group, the delivery team shall identify it in the post-appointment BEP with a proposed alternative.\n\nInformation delivered beyond the specified level of information need shall not be relied upon by the appointing party and confers no additional obligation on either party.",
      },
      {
        t: 'clause', id: 'Template 2',
        title: 'BEP — CDE and status discipline',
        text: "All project information shall be exchanged through the common data environment identified in section {x}. Information obtained by any other route shall not be relied upon.\n\nInformation shall be issued at Shared status only after the checks in section {y} have been completed and their evidence attached. Information at Work in progress status shall not be issued to, or relied upon by, any other task team.",
      },
      {
        t: 'clause', id: 'Template 3',
        title: 'BEP — pre-issue check and evidence',
        text: "Every information container issued at Shared status or above shall be checked against the project rule set within the 24 hours preceding issue, and the check report shall be issued alongside the container. The report shall state the rule set used and confirm that all checks completed.\n\nContainers issued without a check report may be returned without review.",
      },
      {
        t: 'clause', id: 'Template 4',
        title: 'BEP — federation basics',
        text: "All task teams shall use the project shared reference point and rotation defined in {document}, shall deliver in metric SI length units, and shall use the level names and elevations of the project level schedule without local variation.\n\nElement identifiers shall be persistent between revisions. Any event that invalidates identifiers (model recreation, round-trip import, template migration) shall be reported to the information manager at the time it occurs.",
      },
      {
        t: 'clause', id: 'Template 5',
        title: 'Transmittal — statement of suitability',
        text: "Container: {name per the convention}\nRevision / status: {rev} · {suitability code}\nPurpose: {what this issue is for}\nChecked: {date} · rule set {name} · all checks completed: {yes/no}\nOpen findings accepted by agreement: {finding — reason — agreed with — date}\nNot suitable for: {e.g. quantity take-off, fabrication}",
      },
      {
        t: 'clause', id: 'Template 6',
        title: 'Email — returning a container that cannot be accepted',
        text: "Hi {name},\n\nWe've run the agreed pre-acceptance check on {container} (rev {n}) and it does not meet {criterion} from the acceptance criteria in {document}.\n\nThe findings driving that are:\n  · {finding} ({n} elements)\n  · {finding} ({n} elements)\n\nBoth look like export configuration rather than modelling, so they should be quick — the report is attached with the element references.\n\nWe'll hold coordination on this container until the next issue. Happy to look at the export settings together if that is faster.\n\n{signature}",
      },
    ],
  },
  {
    id: 'appendix-c',
    kicker: 'Appendix C',
    num: null,
    title: 'Glossary',
    blocks: [
      { t: 'p', text: "Terms as they are used on projects, rather than as they are worded in the standards." },
      {
        t: 'table',
        headers: ['Term', 'Working definition'],
        rows: [
          ['AIM', 'Asset Information Model. What the operator keeps and maintains after handover — a subset of the PIM, with a different reader.'],
          ['AIR', 'Asset Information Requirements. What the owner needs to know about the asset in order to operate it.'],
          ['Appointing party', 'The client / asset owner: states the requirements, accepts or rejects the information.'],
          ['Appointed party', 'A supplier producing information — a designer, contractor or specialist.'],
          ['BCF', 'BIM Collaboration Format. An open exchange format for issues: each topic carries a comment and a viewpoint.'],
          ['BEP', 'BIM Execution Plan. How the delivery team will meet the EIR. Pre-appointment it is a promise; post-appointment it is the operating manual.'],
          ['CDE', 'Common Data Environment. The single agreed place where information containers live, with their revision and status. A process first, a product second.'],
          ['COBie', 'A structured schedule of asset data — spaces, types, components, systems — delivered to the client and the FM team.'],
          ['EIR', 'Exchange Information Requirements. What must be delivered, when, by whom and in what form, for a specific appointment.'],
          ['Federation', 'Combining discipline models into one coordinated view without merging authorship.'],
          ['IDS', 'Information Delivery Specification. A machine-readable way to express requirements so a checker can execute them directly.'],
          ['IFC', 'Industry Foundation Classes. The open, vendor-neutral schema for exchanging building information.'],
          ['Information container', 'ISO 19650’s unit of delivery: a named, versioned, status-carrying set of information — a model, a drawing set, a schedule.'],
          ['Information manager', 'The function responsible for making the information process work on a project. A function, not necessarily a job title — but it needs authority.'],
          ['Lead appointed party', 'Usually the main contractor or lead designer: coordinates the delivery team and runs the information process.'],
          ['LOD', 'Level of Development (US) or Level of Detail (common usage). Two different things sharing an abbreviation, which is why chapter 4 exists.'],
          ['LOIN', 'Level of Information Need (EN 17412-1). Specify detail by purpose across geometry, alphanumeric data and documentation.'],
          ['MIDP', 'Master Information Delivery Plan. All the TIDPs aggregated, where inter-team dependencies become visible.'],
          ['OIR', 'Organisational Information Requirements. What the owning organisation needs to know to run itself.'],
          ['PIM', 'Project Information Model. Everything produced to design and build the asset.'],
          ['PIR', 'Project Information Requirements. What the appointing party needs from the project to make decisions during it.'],
          ['Suitability', 'What a receiver is permitted to do with a container at its current status — reference it, coordinate against it, build from it.'],
          ['TIDP', 'Task Information Delivery Plan. One task team’s containers with dates, authors and dependencies.'],
          ['Waiver', 'A finding accepted deliberately, with a reason, an owner and a date. The opposite of a finding ignored.'],
        ],
      },
    ],
  },
  {
    id: 'appendix-d',
    kicker: 'Appendix D',
    num: null,
    title: 'Where to go next',
    blocks: [
      { t: 'h3', text: 'The standards themselves' },
      { t: 'p', text: "If information management is part of your job, the ISO 19650 series is worth owning rather than paraphrasing. Part 1 for the concepts, part 2 for the delivery phase, part 3 for operation, part 4 for information exchange, part 5 for security-minded projects. EN 17412-1 for level of information need. They are terse, and after this handbook they will read as a formalisation of things you already recognise." },
      { t: 'h3', text: 'The open formats' },
      { t: 'p', text: "buildingSMART publishes the specifications for IFC, BCF and IDS, along with example files and validation resources. Reading an IFC file in a text editor once — just once — permanently changes how you think about what an exporter is doing." },
      { t: 'h3', text: 'The companion volume' },
      { t: 'p', text: "This handbook stops where the file begins. **The IFC Delivery Handbook** covers the other half: why deliveries get rejected, every check worth running before issue with the exact fix in Revit, ArchiCAD, Tekla and Allplan, the quality score model in full, and the evidence pack that makes a delivery checkable. It is free at www.ifcvieweronline.eu/ebook/" },
      { t: 'h2', text: 'The end' },
      { t: 'p', text: "If this handbook changes one thing about how your project runs, make it the first gate: information is checked by the team that produced it, before it is shared, every time — and the evidence travels with it. Everything else in these pages is scaffolding around that one habit." },
    ],
  },
]
