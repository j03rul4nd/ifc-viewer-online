// ─── The IFC Delivery Handbook — book content ─────────────────────────────────
//
// Prose source for the lead-magnet ebook rendered by build-ebook.mjs.
// Data-heavy chapters are NOT authored here: the rule reference (chapter 4)
// and the score-weight table are generated at build time straight from the
// shipping validator (src/types/index.ts + src/lib/validator.ts + the D-22
// remediation corpus), so the book can never quote a rule the product doesn't
// actually run. See build-ebook.mjs.
//
// Block vocabulary (rendered by build-ebook.mjs → renderBlock):
//   h2 h3 h4 · p · lead · ul ol · steps · checklist · callout · table
//   clause · code · kpi · pull · rules-reference · rules-index · pagebreak
//
// Inline markup inside any text: **bold**, *italic*, `code`, [label](url).
// `{{n}}` expands to the validator's check count at build time.
//
// House rule (brand voice: "confianza sin hipérbole"): no invented statistics,
// no fabricated case studies, no competitor claims that cannot be checked.
// Where a number appears it is either arithmetic the reader can redo, a value
// taken from the product's own source, or clearly framed as an illustration.

export const BOOK = {
  title:     'The IFC Delivery Handbook',
  subtitle:  'How to check, prove and hand over IFC models that get accepted the first time',
  eyebrow:   'A field manual for BIM coordinators',
  edition:   'First edition',
  year:      '2026',
  author:    'Joel Benitez',
  publisher: 'IFC Viewer Online',
  siteUrl:   'https://www.ifcvieweronline.eu',
  retail:    '€19.99',
  isbnNote:  'Distributed free of charge. Not for resale.',
  colophonNote:
    'The check reference in chapter 4, the score weights in chapter 3 and the tool-by-tool remediation steps are generated directly from the source of the validator at www.ifcvieweronline.eu, so this handbook always documents the checks that actually run.',
  /** Cover statistics — `k` is the figure, `l` the caption lines. */
  marks: [
    { k: '{{n}}', l: ['checks, documented', 'one by one'] },
    { k: '4',     l: ['authoring tools,', 'step by step'] },
    { k: '7',     l: ['clauses and templates,', 'ready to paste'] },
  ],
  /** Compact stats for the 1200×630 social card. */
  ogMarks: [
    { k: '{{n}}', l: 'checks' },
    { k: '4',     l: 'authoring tools' },
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
      { t: 'lead', text: "This is a working document, not a textbook. It is written for the person who has to press **Upload** on a common data environment and put their name next to the file." },
      { t: 'p', text: "There are three ways to read it, and they are all legitimate:" },
      {
        t: 'steps',
        items: [
          { title: 'You have a delivery due this week', text: "Go straight to **Appendix A — the pre-delivery checklist**, run it, and come back for the chapters behind whatever failed." },
          { title: 'You keep receiving models you cannot use', text: "Read **chapter 7**. Your problem is not technical, it is contractual: nobody wrote down what \"acceptable\" means. Chapter 7 gives you the clauses to paste into the BEP." },
          { title: 'You want to build a repeatable quality process', text: "Read it in order. Chapters 1–3 build the vocabulary, chapter 4 is the reference you will return to, chapters 5–7 are the process." },
        ],
      },
      { t: 'h3', text: 'What this handbook assumes' },
      { t: 'p', text: "That you can export an IFC file from your authoring tool, and that you have opened one before. It does not assume you know the IFC schema, ISO 19650 clause numbers, or what `IfcRelContainedInSpatialStructure` means — where those matter, they are explained in place." },
      { t: 'h3', text: 'What this handbook is not' },
      { t: 'ul', items: [
        "It is not a modelling guide. How you model a wall is your business; how that wall arrives in the IFC is ours.",
        "It is not a substitute for your project's Exchange Information Requirements (EIR). It is the layer *underneath* them — the checks that any EIR, in any language, ends up depending on.",
        "It is not vendor-neutral theatre. The {{n}} checks in chapter 4 are the exact checks the free validator at ifcvieweronline.eu runs, quoted from its source. You can reproduce every one of them yourself, with any tool that implements the same rule, or by hand.",
      ]},
      {
        t: 'callout', kind: 'note', title: 'On the checks in chapter 4',
        text: "The rule reference is generated from the validator's own rule table at build time — identifier, category, default severity, referenced standard and the tool-by-tool remediation text. That is deliberate: a handbook that drifts away from the tool it documents is worse than no handbook.",
      },
    ],
  },

  // ── Chapter 1 ──────────────────────────────────────────────────────────────
  {
    id: 'acceptance-gap',
    kicker: 'Chapter 1',
    num: 1,
    title: 'Why good models get rejected',
    blocks: [
      { t: 'lead', text: "Almost nobody delivers a bad model on purpose. Models get rejected because the sender and the receiver are measuring different things — and neither of them wrote down what they were measuring." },
      { t: 'h2', text: 'The acceptance gap' },
      { t: 'p', text: "Here is the sequence, and you have almost certainly lived it. An architect exports an IFC from a model that is, from the inside, perfectly good: the geometry is right, the levels are right, the sheets print. It goes to the CDE. Three days later the MEP coordinator replies that half the elements are not on any storey, the space names are empty, and their software is putting the building 400 kilometres from site." },
      { t: 'p', text: "Nobody is lying. The model *is* good — inside the authoring tool. The IFC *is* broken — outside it. The difference between those two sentences is the acceptance gap, and it exists because of one structural fact:" },
      { t: 'pull', text: "An IFC export is a translation, and translations lose things that the original author never had to think about." },
      { t: 'p', text: "Inside Revit or ArchiCAD or Tekla, a wall belongs to a level because the software says so. The relationship is implicit, enforced by the interface, invisible to the modeller. In IFC that relationship is an explicit object — `IfcRelContainedInSpatialStructure` — that the exporter has to write down. If the exporter cannot work out which storey the wall belongs to, it writes nothing. The wall still renders. It just belongs to nothing, and every downstream tool that groups by storey silently drops it." },
      { t: 'p', text: "That is the shape of nearly every IFC delivery failure: **the thing that was implicit did not survive being made explicit**." },
      { t: 'h2', text: 'Three failure modes, in order of cost' },
      {
        t: 'table',
        headers: ['Failure mode', 'What it looks like', 'Who pays'],
        rows: [
          ['Structural', 'Duplicate or malformed GUIDs, broken aggregation, elements outside the spatial tree, circular references', 'Everyone downstream. The file cannot be reliably merged, compared or federated at all.'],
          ['Informational', 'Missing property sets, empty names, no classification, no materials, spaces without area', 'The quantity surveyor, the FM team, the COBie deliverable. Usually discovered months later.'],
          ['Contextual', 'Wrong units, huge coordinate offsets, storeys out of order, missing project metadata', 'The coordinator, immediately and loudly. Cheapest to fix, most visible when missed.'],
        ],
        caption: 'The categories used throughout this handbook map onto these three modes: schema and spatial faults are structural; quality, LOD, classification and MEP faults are informational; ISO 19650 and coordinate faults are contextual.',
      },
      { t: 'p', text: "Structural faults are the expensive ones because they are *silent*. A duplicate GUID does not crash anything. It quietly makes two elements indistinguishable, so the clash report references the wrong one, the issue tracker attaches a comment to the wrong wall, and the change log between revision A and revision B becomes fiction." },
      { t: 'h2', text: 'Why "it opens fine" is not a check' },
      { t: 'p', text: "The single most common quality assurance procedure in the industry is: export the IFC, open it in a viewer, rotate it, see the building, ship it. This catches exactly one class of problem — catastrophic geometry loss — and misses everything in the table above." },
      { t: 'p', text: "It fails because rendering has almost no requirements. A viewer needs shapes and placements. It does not need names, GUID uniqueness, a spatial hierarchy, materials, classifications, property sets, or units that make sense. You can render a model that is, as an *information container*, close to worthless." },
      {
        t: 'callout', kind: 'warn', title: 'The visual check paradox',
        text: "The better your geometry, the more confident everyone becomes, and the less likely anyone is to check the data. Beautiful models are rejected more often than ugly ones, because ugly ones get inspected.",
      },
      { t: 'h2', text: 'What a real check costs' },
      { t: 'p', text: "Do the arithmetic yourself, with your own numbers. A validation run on a typical discipline model takes under a minute. Fixing what it finds — assuming the faults are systematic, which they usually are, because they come from export settings rather than from individual elements — takes between ten minutes and an afternoon." },
      { t: 'p', text: "Now price the alternative: one rejected delivery costs a coordination cycle. If your project federates weekly, a rejection costs a week. Multiply the week by the number of people waiting on that model. That is the entire business case, and it does not need an industry statistic to be convincing — you already know both numbers for your own project." },
      { t: 'h2', text: 'The three questions this handbook answers' },
      {
        t: 'steps',
        items: [
          { title: 'Is this file structurally sound?', text: "Chapters 3 and 4. Forty-four checks, grouped into eight categories, with a single 0–100 score so you can say \"yes\" or \"no\" without reading a report." },
          { title: 'Can I prove it?', text: "Chapters 5 and 6. A delivery is an assertion. An assertion without evidence is an opinion, and opinions get re-litigated at every gateway. The evidence pack turns your check into an artefact somebody else can verify." },
          { title: 'Who agreed to what?', text: "Chapter 7. The clauses that turn \"the model was rubbish\" into \"clause 4.3 of the BEP was not met\", which is a conversation with an ending." },
        ],
      },
    ],
  },

  // ── Chapter 2 ──────────────────────────────────────────────────────────────
  {
    id: 'what-delivered-means',
    kicker: 'Chapter 2',
    num: 2,
    title: 'What “delivered” actually means',
    blocks: [
      { t: 'lead', text: "ISO 19650 gives the industry a shared vocabulary for handing information over. Most teams have adopted the words — WIP, Shared, Published, Archived — without adopting the thing the words were invented to protect: a *state change that somebody is accountable for*." },
      { t: 'h2', text: 'The container, not the model' },
      { t: 'p', text: "ISO 19650 does not talk about models. It talks about **information containers** — a named, versioned, status-carrying unit of information. Your IFC file is one container. The drawing set is another. The COBie spreadsheet is another." },
      { t: 'p', text: "This matters more than it sounds. A container has three properties that a \"model\" does not:" },
      { t: 'ul', items: [
        "**Identity** — a name that follows an agreed convention, so it can be found and its origin understood without opening it.",
        "**Revision** — a version marker, so \"the latest one\" is a fact rather than an argument about email timestamps.",
        "**Status** — suitability. What the receiver is allowed to do with it: look at it, coordinate against it, build from it.",
      ]},
      { t: 'p', text: "Two of the three live outside the file, in the CDE. One of them — identity — can and should live *inside* it too, which is why a filename check appears among the 44." },
      { t: 'h2', text: 'The four states, in the only terms that matter' },
      {
        t: 'table',
        headers: ['State', 'Question it answers', 'What must be true'],
        rows: [
          ['Work in progress', 'Is this mine?', 'Nothing. It is yours, it can be broken, nobody else may reference it.'],
          ['Shared', 'May a colleague coordinate against this?', 'It must be structurally sound and honestly labelled. This is where the pre-flight check belongs.'],
          ['Published', 'May somebody make a decision — or a purchase — from this?', 'It must meet the EIR in full, and the evidence must exist.'],
          ['Archived', 'What did we say, and when?', 'It must be immutable and reproducible. A verifiable check record belongs here.'],
        ],
      },
      {
        t: 'callout', kind: 'tip', title: 'The one process change worth making',
        text: "Run the check at the **Work in progress → Shared** boundary, not at Published. By the time something is published, three disciplines have already coordinated against it, and a structural fault means re-doing their work, not yours.",
      },
      { t: 'h2', text: 'Suitability is a promise about data, not about geometry' },
      { t: 'p', text: "When you mark a container as suitable for coordination, you are promising that a coordinator can federate it, filter it by storey, select an element and get a stable identifier back that will still mean the same element next week. Every one of those promises is a data promise. None of them is about how the building looks." },
      { t: 'p', text: "This is why the checks in chapter 4 are weighted the way they are: a broken spatial hierarchy outranks a missing material, because the first one breaks federation and the second one only degrades a schedule." },
      { t: 'h2', text: 'Level of information need' },
      { t: 'p', text: "The other half of ISO 19650 that gets quoted and not used: information should be delivered to the level of detail the *purpose* requires, and no further. Over-delivery is a defect, not generosity — it costs modelling time, it inflates files, and it creates data nobody validates and everybody trusts." },
      { t: 'p', text: "In practice, three things define the level of information need for an IFC delivery:" },
      {
        t: 'steps',
        items: [
          { title: 'Geometric detail', text: "How the element is represented. Rarely the constraint in coordination; frequently the constraint in file size (chapter 5)." },
          { title: 'Alphanumeric detail', text: "Which property sets and which properties. This is what the LOD checks in chapter 4 test — do the elements carry the property sets their declared level implies?" },
          { title: 'Documentation', text: "What travels alongside: classification references, materials, system assignments, the evidence pack of chapter 6." },
        ],
      },
      { t: 'p', text: "A model at a high geometric level with empty property sets is not a high level of information need. It is a picture." },
      { t: 'h2', text: 'The handover asymmetry' },
      { t: 'p', text: "One last structural point before the checks. The sender knows what they meant. The receiver knows only what arrived. Every ambiguity in an IFC file is resolved by the receiver — usually by guessing, occasionally by asking, never by reading your mind." },
      { t: 'p', text: "So the target is not \"a model I can defend\". The target is **a model that needs no defending**, because everything a receiver would have to guess about has been made explicit in the file. That is the whole design brief of the next two chapters." },
    ],
  },

  // ── Chapter 3 ──────────────────────────────────────────────────────────────
  {
    id: 'pre-flight',
    kicker: 'Chapter 3',
    num: 3,
    title: 'The pre-flight check',
    blocks: [
      { t: 'lead', text: "A pre-flight check has to answer one question in one glance: **do I send this, yes or no?** Everything else — the issue list, the element identifiers, the export settings to change — is the follow-up. This chapter builds that answer out of three parts: eight categories, one score, and an honesty mechanism most validators do not have." },
      { t: 'h2', text: 'Eight categories' },
      { t: 'p', text: "Every check in chapter 4 belongs to exactly one category. The categories exist so you can triage a report without reading it — a run with twelve *schema* findings is a different emergency from a run with twelve *classification* findings." },
      { t: 'rules-index' },
      { t: 'h2', text: 'One number: the Health Score' },
      { t: 'p', text: "A score is a compression of a report. It is useful precisely because it throws information away — it lets you set a gate in a contract, compare revision A to revision B, and tell a client something true in one sentence." },
      { t: 'p', text: "It is also the part of any validator that is most often hand-waved, so here is the exact model used throughout this handbook, in full:" },
      { t: 'h3', text: 'Step 1 — every finding carries a weight' },
      { t: 'p', text: "The weight depends on the category of the rule and the severity of the finding. Structural categories are weighted harder than informational ones, for the reason given in chapter 2." },
      { t: 'weights-table' },
      { t: 'h3', text: 'Step 2 — repeats cost less than the first offence' },
      { t: 'p', text: "This is the part that makes a score usable on real models. A naive validator multiplies weight by occurrence count: five thousand elements missing a material becomes a penalty of five thousand, every real model scores zero, and the number tells you nothing." },
      { t: 'p', text: "But five thousand elements missing a material is not five thousand problems. It is **one** problem — an export setting — that touched five thousand elements. So the penalty grows logarithmically:" },
      { t: 'code', text: 'penalty(rule) = weight(category, severity) × (1 + ln(occurrences))' },
      { t: 'p', text: "The first occurrence costs the full weight. Ten occurrences cost about 3.3×, not 10×. A thousand cost about 7.9×, not 1000×. The score therefore ranks *distinct defects*, which is what you actually fix." },
      { t: 'h3', text: 'Step 3 — subtract from 100 and clamp' },
      { t: 'code', text: 'score = max(0, round(100 − Σ penalty(rule)))' },
      { t: 'p', text: "Two consequences worth internalising. First, the score is bounded below, so a catastrophic model and a merely awful one both read 0 — below about 40 the number stops discriminating and you should read the report instead. Second, because the penalty is per-rule and not per-element, fixing one systematic defect can move the score by ten points in a single export setting." },
      { t: 'h2', text: 'Reading the number' },
      {
        t: 'table',
        headers: ['Score', 'Reading', 'Action'],
        rows: [
          ['85 – 100', 'Deliverable. Minor observations at most.', 'Ship it. Note any waived findings in the transmittal.'],
          ['70 – 84', 'Deliverable with observations. Nothing structural, but something is missing.', 'Ship only if the missing information is outside the current level of information need — and say so explicitly.'],
          ['Below 70', 'Not deliverable.', 'Fix, re-run, then ship. Sending it anyway transfers your problem to somebody who cannot fix it.'],
        ],
        caption: 'These are the same thresholds the viewer uses for its client-facing badge: 85 for a green “verified” reading, 70 for amber. Below 70 the honest answer to “is this ready?” is no.',
      },
      {
        t: 'callout', kind: 'warn', title: 'Do not turn the score into a target',
        text: "The moment a score becomes a KPI, somebody optimises it by disabling rules. A score is only meaningful alongside the rule set that produced it — which is why the delivery evidence in chapter 6 records both.",
      },
      { t: 'h2', text: 'Coverage: the check nobody runs on the checker' },
      { t: 'p', text: "Here is a failure mode specific to automated validation, and it is worse than any defect in this book: **a rule that did not run looks exactly like a rule that passed**. Both produce zero findings." },
      { t: 'p', text: "A large file times out, a worker crashes, a geometry-dependent rule silently gives up — and the report comes back clean. The score is 100. You ship, confident, having checked nothing." },
      { t: 'p', text: "The fix is to make every run report three states per rule rather than two:" },
      {
        t: 'table',
        headers: ['State', 'Meaning', 'What to do'],
        rows: [
          ['ok', 'The rule ran to completion.', 'Trust the finding count, including zero.'],
          ['not-run', 'The rule was attempted but produced no outcome — usually a timeout or a cancelled run.', 'Re-run, or narrow the scope. Do not treat as a pass.'],
          ['failed', 'The rule errored.', 'Report it. A score computed over failed rules is not comparable to one computed over a clean run.'],
        ],
      },
      { t: 'p', text: "Whatever tool you use, ask it one question: *how do I know all the checks ran?* If it cannot answer, its clean reports mean less than you think." },
      {
        t: 'callout', kind: 'note', title: 'Why this handbook keeps saying “whatever tool you use”',
        text: "Every check in chapter 4 is a statement about an IFC file, not about a product. They are reproducible in any checker, and several are reproducible with a text editor and patience. The tool this handbook comes from is free and runs in the browser, which makes it convenient — it does not make it necessary.",
      },
      { t: 'h2', text: 'Severity is a project decision' },
      { t: 'p', text: "Each rule ships with a default severity — error, warning or info — and every one of those defaults is arguable on a specific project. Missing classification is an error on an asset-management-driven public project and an irrelevance on a fast-track fit-out." },
      { t: 'p', text: "So treat the defaults in chapter 4 as a starting position, and record your deviations in the BEP (chapter 7) rather than in somebody's head. Two things follow: the score becomes comparable across your own revisions, and \"we don't care about that one\" becomes a decision with a date and an author." },
    ],
  },

  // ── Chapter 4 — generated reference ────────────────────────────────────────
  {
    id: 'rule-reference',
    kicker: 'Chapter 4',
    num: 4,
    title: 'The {{n}}-check reference',
    blocks: [
      { t: 'lead', text: "The rest of this chapter is the reference. Every check the validator runs, in the order it runs them, grouped by category: what it tests, why it matters, and how to fix it in the four authoring tools that produce most of the industry's IFC." },
      { t: 'p', text: "Each entry carries its identifier, its category, its default severity and the standard it derives from. The identifiers are stable — quote them in a BEP or an issue and they will still mean the same check next year." },
      {
        t: 'callout', kind: 'tip', title: 'How to use this chapter',
        text: "Do not read it end to end. Run a check, take the rule identifiers it reports, look them up here, and fix the export setting rather than the elements. Roughly nine findings in ten are a setting, not a modelling mistake.",
      },
      { t: 'rules-reference' },
    ],
  },

  // ── Chapter 5 ──────────────────────────────────────────────────────────────
  {
    id: 'workflow',
    kicker: 'Chapter 5',
    num: 5,
    title: 'The delivery workflow',
    blocks: [
      { t: 'lead', text: "Seven steps, in order, repeatable by somebody who has never read the rest of this book. The point of writing a workflow down is not that it is clever — it is that it survives the week you are on holiday." },
      { t: 'h2', text: 'The seven steps' },
      {
        t: 'steps',
        items: [
          { title: 'Export with a named, saved configuration', text: "Not the default. Not \"whatever was there last time\". A configuration with a name, stored in the project template, referenced by name in the BEP. Most of chapter 4 is fixed here, once, for everybody." },
          { title: 'Check the file before it goes anywhere', text: "Before the CDE, before the email, before the WeTransfer link. The check takes under a minute; the recall email takes a day and costs credibility." },
          { title: 'Fix by category, not by finding', text: "Take the report's top contributor, fix its cause, re-export, re-run. Repeat while the score moves by more than a point or two. Do not work down a list of 3,000 elements." },
          { title: 'Compare against the last delivery', text: "A run diff answers the only question a reviewer really has: what changed? New findings are the story. Resolved findings are the receipt." },
          { title: 'Federate before you promise coordination', text: "A file that is clean alone can still be unusable together — coordinates, units and storey structure only misbehave in company." },
          { title: 'Assemble the evidence pack', text: "Chapter 6. The report, the record, the issues, the asset data. Ten minutes, and it is what the next four emails would have been." },
          { title: 'Transmit with an explicit statement of suitability', text: "Name the revision, the status, the score, the rule set and any waived findings. Chapter 7 has the template." },
        ],
      },
      { t: 'h2', text: 'Step 3 in detail: fix the cause, not the symptom' },
      { t: 'p', text: "The score model of chapter 3 was designed to make this the obvious move. Because repeats are logarithmic, a rule that fires 4,000 times and a rule that fires 40 times can carry comparable penalties. Sorting by *penalty contribution* rather than by *finding count* puts the biggest lever at the top of the list — and the biggest lever is almost never \"edit 4,000 elements\"." },
      {
        t: 'table',
        headers: ['What the report says', 'What it usually means', 'Where the fix lives'],
        rows: [
          ['Thousands of elements missing a property set', 'The export template does not include that pset', 'Export configuration'],
          ['Everything orphaned from the spatial structure', 'Elements are not assigned to levels, or the exporter was told to ignore them', 'Model organisation + export configuration'],
          ['Every GUID changed since last revision', 'The model was recreated, copied, or exported through a round trip', 'Process, not file — see the caution below'],
          ['A handful of individually broken elements', 'Genuine modelling mistakes', 'The model'],
        ],
      },
      {
        t: 'callout', kind: 'warn', title: 'The one fault you cannot fix after the fact',
        text: "If GUIDs change on every export, nothing downstream can track anything: issues detach, revision comparison becomes meaningless, and asset data cannot be reconciled. This is a process defect. Fix it at the source, not with a find-and-replace — rewriting identifiers on delivery is worse than the original problem, because it looks stable and is not.",
      },
      { t: 'h2', text: 'Step 4 in detail: the run diff' },
      { t: 'p', text: "Comparing two validation runs of the same model at two revisions produces three lists, and each one has an audience:" },
      { t: 'ul', items: [
        "**New** — findings that were not there last time. This is a regression report. If the number is not zero, say why in the transmittal.",
        "**Resolved** — findings that are gone. This is your evidence that the last review was acted on. It is also the only politically useful list in the set.",
        "**Persisting** — findings present in both. If they persist deliberately, they are waivers and belong in writing (chapter 7). If they persist accidentally, the review process is not working.",
      ]},
      { t: 'h2', text: 'Step 5 in detail: what federation adds' },
      { t: 'p', text: "Three whole classes of defect are invisible until models meet:" },
      {
        t: 'steps',
        items: [
          { title: 'Coordinate divergence', text: "Two models, each internally consistent, referenced to different origins. Both check clean. Federated, they are hundreds of metres apart. The coordinate-offset check catches the common cause — a model authored far from its local origin — but only agreement on a shared reference point prevents it." },
          { title: 'Unit mismatch', text: "One model in millimetres, one in feet. Some tools convert silently, some do not, and the failure is measured in months when it reaches a fabricator. Length units are checked per file for exactly this reason." },
          { title: 'Storey structure mismatch', text: "Same building, different level names and elevations per discipline. Every filter, every sheet, every issue that says \"level 3\" now needs a translation table maintained by a human." },
        ],
      },
      { t: 'h2', text: 'A note on file size' },
      { t: 'p', text: "Large files are not a defect in themselves, but they correlate with two things worth knowing about: geometry exported at a level of detail nobody asked for, and elements exported as generic proxies instead of typed objects. Both are picked up by checks in chapter 4 — file-size anomaly and proxy overuse — precisely because the size is the symptom and the export configuration is the disease." },
      { t: 'p', text: "Before you spend a day optimising a model, check the cheap causes in this order: proxy elements, exported 2D and annotation content, unnecessary property sets on every element, and geometry detail on repeated components." },
      {
        t: 'callout', kind: 'tip', title: 'Where to spend the automation budget',
        text: "If you automate exactly one thing in this workflow, automate step 2 — the check itself, on every export, whether or not it is going anywhere. A check that only runs before deliveries is a check that runs when the schedule is tightest and the appetite for bad news is lowest.",
      },
    ],
  },

  // ── Chapter 6 ──────────────────────────────────────────────────────────────
  {
    id: 'evidence',
    kicker: 'Chapter 6',
    num: 6,
    title: 'The evidence pack',
    blocks: [
      { t: 'lead', text: "A delivery is a claim: *this model is fit for this purpose at this revision*. Evidence is what turns the claim into something the receiver can check without repeating your work — and what stops the same argument happening twice." },
      { t: 'h2', text: 'Five artefacts, four of which you already have' },
      {
        t: 'table',
        headers: ['Artefact', 'Answers', 'Audience'],
        rows: [
          ['Validation report', 'What was checked and what was found', 'The receiving coordinator'],
          ['Check record', 'That the check happened, on this exact file, at this time', 'The information manager, the client, an auditor'],
          ['Issue file (BCF)', 'What is not fixed, and where to look', 'The person who has to act'],
          ['Asset data (COBie)', 'What the building contains, as data', 'The client and the FM team'],
          ['Transmittal note', 'Revision, status, score, rule set, waivers', 'Everyone, and the record'],
        ],
      },
      { t: 'h2', text: 'The validation report' },
      { t: 'p', text: "Export it, attach it, do not paraphrase it. Three properties make a report useful to somebody who was not there:" },
      { t: 'ul', items: [
        "It names the **rule set** used, not just the results. A score without its rule set is uninterpretable.",
        "It states **coverage** — which rules ran, which did not (chapter 3). A report that cannot distinguish \"passed\" from \"not attempted\" is a marketing document.",
        "It carries **element identifiers**, so a finding can be located rather than searched for.",
      ]},
      { t: 'h2', text: 'The check record' },
      { t: 'p', text: "The weakest link in every quality process is that the check and the claim are separate. Anyone can say a model scored 92. A check record ties the number to a specific file: the file's own fingerprint, the rule set, the schema, the timestamp, the score." },
      { t: 'p', text: "Two properties make such a record worth more than a screenshot:" },
      {
        t: 'steps',
        items: [
          { title: 'It is about the file, not the story', text: "It should be derived from the file's content, so that changing a single byte of the model and re-issuing the same record is detectable." },
          { title: 'It is verifiable by the receiver', text: "Independently, without your involvement, and ideally without your tool. A record only your own software can confirm is a promise, not evidence." },
        ],
      },
      {
        t: 'callout', kind: 'note', title: 'Why this matters more each year',
        text: "As soon as a delivery is a payment milestone — and increasingly it is — \"we checked it\" stops being a professional courtesy and starts being a claim somebody may contest. The cheapest moment to make it verifiable is before it is contested.",
      },
      { t: 'h2', text: 'The issue file' },
      { t: 'p', text: "BCF exists so that issues survive leaving your screen. Its whole value is the viewpoint: a camera position, a selection, and a comment, which together mean the receiver spends ten seconds finding the problem instead of ten minutes." },
      { t: 'p', text: "Two conventions make the difference between a BCF file that gets acted on and one that gets ignored:" },
      { t: 'ul', items: [
        "One topic per **cause**, not per element. Four thousand elements missing a pset are one topic with a representative viewpoint, not four thousand topics.",
        "Title the topic with the rule identifier and the fix, not the symptom. `RULE_MISSING_PROPERTY_SET — add Pset_WallCommon to the export template` is actionable. \"Missing properties\" is not.",
      ]},
      { t: 'h2', text: 'Asset data' },
      { t: 'p', text: "COBie is the point where model quality becomes commercially visible, because it is delivered to somebody who never opens a model and has no way to interpret an excuse. It is also, usefully, a validator of your validator: spaces without names, types without manufacturers, components without spaces — those gaps show up as blank columns that a facilities manager can see at a glance." },
      { t: 'p', text: "If a COBie export from your model is embarrassing, the model is not ready, whatever the geometry looks like." },
      { t: 'h2', text: 'The transmittal note' },
      { t: 'p', text: "Six lines, and it prevents most delivery disputes:" },
      {
        t: 'clause', id: 'Transmittal template',
        title: 'IFC delivery — statement of suitability',
        text: "Container: {filename}\nRevision / status: {rev} · {suitability code}\nSchema: {IFC2X3 | IFC4 | IFC4X3}\nChecked: {date} · rule set {name/version} · {n} of {n} checks completed\nHealth Score: {score}/100\nKnown open findings (agreed): {rule id — reason — agreed with — date}\nNot suitable for: {e.g. quantity take-off, fabrication}",
      },
      { t: 'p', text: "The last line is the one people skip, and it is the one that protects you. Stating what a container is *not* for is not defensive — it is the definition of a level of information need, delivered at the only moment anybody reads it." },
    ],
  },

  // ── Chapter 7 ──────────────────────────────────────────────────────────────
  {
    id: 'contract-layer',
    kicker: 'Chapter 7',
    num: 7,
    title: 'The contract layer',
    blocks: [
      { t: 'lead', text: "Everything so far assumes somebody agreed what \"good\" means. Usually nobody did — which is why quality arguments on projects are so bitter and so unresolvable. This chapter is the paperwork that ends them, written to be copied." },
      { t: 'p', text: "The clauses below are drafting aids, not legal advice: adapt them to your project, your appointment and your jurisdiction, and have them reviewed by whoever signs your contracts." },
      { t: 'h2', text: 'Four clauses for the BEP' },
      { t: 'p', text: "These belong in the BIM Execution Plan, in the information delivery section, and they are deliberately short. A quality clause nobody reads has no effect; a quality clause that fits on half a page gets quoted back at people, which is the point." },
      {
        t: 'clause', id: 'Clause 1',
        title: 'Automated check before issue',
        text: "Every IFC container issued to the CDE at status S2 (Shared) or above shall have been checked with the project's agreed rule set within the 24 hours preceding issue. The check report shall be issued alongside the container. Containers issued without a check report may be rejected without review.",
      },
      {
        t: 'clause', id: 'Clause 2',
        title: 'Minimum quality threshold',
        text: "IFC containers shall achieve a Health Score of at least 80/100 under the project rule set. Containers scoring below the threshold may be issued only with the prior written agreement of the Information Manager, recording the findings concerned and the reason.",
      },
      {
        t: 'clause', id: 'Clause 3',
        title: 'Identifier stability',
        text: "IFC GlobalIds shall be persistent for the life of the project: the identifier of an element shall not change between revisions unless the element itself is deleted and replaced. Task teams shall configure authoring and export tools accordingly, and shall report any event that invalidates identifiers (model recreation, round-trip import, template migration) at the time it occurs.",
      },
      {
        t: 'clause', id: 'Clause 4',
        title: 'Shared coordinates and units',
        text: "All task teams shall use the project shared reference point and rotation defined in {document}, and shall deliver in metric SI length units. Storey names and elevations shall follow the agreed level schedule without local variation.",
      },
      {
        t: 'callout', kind: 'tip', title: 'If you can only add one clause',
        text: "Add clause 3. Threshold clauses improve the average delivery; the identifier clause is the only one that prevents a class of damage that cannot be repaired later.",
      },
      { t: 'h2', text: 'The acceptance criteria table' },
      { t: 'p', text: "Paste this into the EIR or the BEP appendix and fill in the right-hand column with your project's positions. Its purpose is not to be strict — it is to be *decided*, before the first delivery rather than during the third argument." },
      {
        t: 'table',
        headers: ['Criterion', 'Reject if…', 'Project position'],
        rows: [
          ['Structural integrity', 'Any schema or spatial finding at severity error', '☐ Reject  ☐ Accept with note'],
          ['Health Score', 'Below the agreed threshold', 'Threshold: ______ /100'],
          ['Check coverage', 'Any rule reported not-run or failed', '☐ Reject  ☐ Re-run required'],
          ['Identifier stability', 'GUID turnover above an agreed percentage between revisions', 'Max turnover: ______ %'],
          ['Naming', 'Filename does not follow the agreed convention', '☐ Reject  ☐ Rename and log'],
          ['Georeferencing', 'Model not on the project shared reference point', '☐ Reject'],
          ['Units', 'Non-metric length units', '☐ Reject'],
          ['Classification', 'Elements without a classification reference', 'Applies from stage: ______'],
          ['Property sets', 'Required psets missing for the declared level of information need', 'Pset schedule: ______'],
          ['Spaces', 'Spaces without name, long name or floor area', 'Applies from stage: ______'],
        ],
      },
      { t: 'h2', text: 'From EIR text to checks' },
      { t: 'p', text: "EIRs are written in prose by people who will never run a checker. Translating that prose into checks is a five-minute exercise that turns an aspiration into a gate. The pattern:" },
      {
        t: 'table',
        headers: ['Typical EIR sentence', 'The check it implies'],
        rows: [
          ['“All elements shall be classified in accordance with {system}.”', 'Missing classification'],
          ['“Models shall be delivered on the project coordinate system.”', 'Large coordinate offset + shared reference point agreement'],
          ['“All spaces shall be named and measurable.”', 'Empty long name · space missing floor area'],
          ['“Element identifiers shall be persistent.”', 'Duplicate GUID · invalid GUID format · GUID turnover between revisions'],
          ['“Models shall be structured by building and storey.”', 'Orphan element · spatial hierarchy · missing storey · element in building'],
          ['“Deliverables shall support asset information handover.”', 'Missing property set · missing type · missing material · space area'],
        ],
        caption: 'Each right-hand entry corresponds to one or more checks in chapter 4. Record the mapping in the BEP so that “compliant with the EIR” has an operational definition.',
      },
      { t: 'h2', text: 'Two emails you will need' },
      { t: 'p', text: "Both are written to be short, factual and impossible to take personally — which is the only register that works when the person on the other end is behind schedule." },
      {
        t: 'clause', id: 'Email 1',
        title: 'Returning a container that cannot be accepted',
        text: "Hi {name},\n\nWe've run the agreed pre-acceptance check on {filename} (rev {n}) and it comes back at {score}/100, below the {threshold} we set in clause {x} of the BEP.\n\nThe two findings driving that are:\n  · {rule id} — {plain description} ({n} elements)\n  · {rule id} — {plain description} ({n} elements)\n\nBoth look like export settings rather than modelling, so they should be quick — the report is attached with the element references.\n\nWe'll hold coordination on this container until the next issue. Happy to jump on a call if it's easier to look at the export configuration together.\n\n{signature}",
      },
      {
        t: 'clause', id: 'Email 2',
        title: 'Issuing a container with known, agreed findings',
        text: "Hi {name},\n\n{filename} rev {n} is on the CDE at {status}, checked today: {score}/100 with all {n} checks completed.\n\nTwo findings remain open by agreement:\n  · {rule id} — outside the level of information need for this stage (agreed with {name}, {date})\n  · {rule id} — pending {supplier} information, expected {date}\n\nSuitable for coordination. Not suitable for quantity take-off until the second item closes.\n\nCheck report attached.\n\n{signature}",
      },
      {
        t: 'callout', kind: 'note', title: 'What these two emails have in common',
        text: "Neither contains an adjective about the model. Both contain a number, a rule identifier, a cause and a date. That is the entire difference between a quality process and a quality opinion.",
      },
    ],
  },

  // ── Appendices ─────────────────────────────────────────────────────────────
  {
    id: 'appendix-a',
    kicker: 'Appendix A',
    num: null,
    title: 'The pre-delivery checklist',
    blocks: [
      { t: 'p', text: "Print it, or copy it into your issue template. Everything on it is either a check from chapter 4 or a step from chapter 5." },
      { t: 'h3', text: 'Before you export' },
      { t: 'checklist', items: [
        'Using the project’s named export configuration, not the default',
        'Elements assigned to the correct levels in the authoring model',
        'Shared reference point / project base point matches the project agreement',
        'Length units are metric SI',
        'Required property sets included in the export template',
      ]},
      { t: 'h3', text: 'After you export, before it leaves your machine' },
      { t: 'checklist', items: [
        'Validation run completed — all checks report as run, none failed',
        'Health Score at or above the project threshold',
        'Zero findings at severity error in the schema and spatial categories',
        'GUIDs stable against the previous revision',
        'Run diff reviewed: no unexplained new findings',
        'Storeys present, correctly named, in ascending elevation order',
        'Spaces named and carrying a floor area (if in scope for this stage)',
        'Classification references present (if in scope for this stage)',
        'File size in line with the previous revision, or the reason understood',
      ]},
      { t: 'h3', text: 'Federated' },
      { t: 'checklist', items: [
        'Model lands in the right place against the other disciplines',
        'Storey names and elevations align with the project level schedule',
        'No unit mismatch against the federated set',
      ]},
      { t: 'h3', text: 'Transmittal' },
      { t: 'checklist', items: [
        'Filename follows the project convention',
        'Revision and suitability status stated explicitly',
        'Validation report attached',
        'Check record attached (if used on the project)',
        'Open findings listed with reason, agreement and date',
        'What the container is NOT suitable for, stated in one line',
      ]},
    ],
  },
  {
    id: 'appendix-b',
    kicker: 'Appendix B',
    num: null,
    title: 'Check index',
    blocks: [
      { t: 'p', text: "All 44 checks, alphabetically by identifier, with category and default severity. Use it to look up a rule identifier you have been sent, or to build your project's severity overrides in one pass." },
      { t: 'rules-quickref' },
    ],
  },
  {
    id: 'appendix-c',
    kicker: 'Appendix C',
    num: null,
    title: 'Glossary',
    blocks: [
      { t: 'p', text: "Terms used in this handbook, defined the way a coordinator uses them rather than the way a standard writes them." },
      {
        t: 'table',
        headers: ['Term', 'Working definition'],
        rows: [
          ['BCF', 'BIM Collaboration Format. An exchange file for issues: each topic carries a comment and a viewpoint (camera + selection) so the receiver lands on the problem.'],
          ['BEP', 'BIM Execution Plan. Where the project writes down how information will be produced and delivered — including, if you take chapter 7 seriously, what “acceptable” means.'],
          ['CDE', 'Common Data Environment. The single agreed place where information containers live, with their revision and suitability status.'],
          ['COBie', 'A structured schedule of the asset data in a model — spaces, types, components, systems — delivered to the client and the facilities team.'],
          ['EIR', 'Exchange Information Requirements. What the client asks for, in prose. Chapter 7 turns it into checks.'],
          ['Federation', 'Combining discipline models into one coordinated whole without merging them. Where coordinate, unit and storey mismatches surface.'],
          ['GlobalId (GUID)', 'The 22-character identifier that makes an element the same element across revisions and tools. Its stability is the foundation of everything downstream.'],
          ['Health Score', 'A 0–100 compression of a validation run, weighted by category and severity, with logarithmically diminishing repeats. See chapter 3.'],
          ['IFC', 'Industry Foundation Classes. The open, vendor-neutral schema for exchanging building information. IFC2X3 and IFC4 are the two you will meet most.'],
          ['Information container', 'ISO 19650’s unit of delivery: a named, versioned, status-carrying file — your IFC, your drawing set, your COBie sheet.'],
          ['Level of information need', 'How much detail — geometric, alphanumeric, documentary — a purpose actually requires. Over-delivery is a defect.'],
          ['Property set (Pset)', 'A named group of properties attached to an element. Where almost all non-geometric information in an IFC lives.'],
          ['Proxy', 'A generic IFC object used when the exporter cannot map an element to a real IFC class. Renders fine; carries no meaning.'],
          ['Run diff', 'A comparison of two validation runs: new, resolved and persisting findings. The core of a delivery review.'],
          ['Spatial structure', 'The project → site → building → storey → space hierarchy that every element should hang from. Break it and filtering, scheduling and federation degrade.'],
          ['Suitability', 'What the receiver is permitted to do with a container at its current status — look, coordinate, build.'],
          ['Waiver', 'A finding accepted deliberately, with a reason, an owner and a date. The opposite of a finding ignored.'],
        ],
      },
    ],
  },
  {
    id: 'appendix-d',
    kicker: 'Appendix D',
    num: null,
    title: 'Where the settings live',
    blocks: [
      { t: 'p', text: "A map, not a manual: the place in each authoring tool where most of chapter 4 is decided. Exact menu paths move between versions, so these are named by function. The per-check instructions in chapter 4 are the detailed version." },
      {
        t: 'table',
        headers: ['Tool', 'Where the export is configured', 'The settings that fix the most findings'],
        rows: [
          ['Revit', 'IFC export dialog → Modify Setup (saved setups can be exported and shared as a project standard)', 'Property sets to export · IFC class mapping table · level/storey handling · coordinate base · schema version'],
          ['ArchiCAD', 'IFC Translators (saved translator per exchange purpose)', 'Property mapping · classification mapping · geometry conversion · storey and zone handling'],
          ['Tekla Structures', 'IFC export dialog + user-defined attribute mapping', 'Numbering (identifier stability) · attribute-to-property mapping · assembly vs part export · base point'],
          ['Allplan', 'IFC export configuration + attribute assignment', 'Attribute mapping to IFC properties · building structure assignment · export schema'],
        ],
        caption: 'In every one of these tools the export configuration is a shareable artefact. Store it with the project template and reference it by name in the BEP — that single move is worth more than any individual setting.',
      },
      { t: 'h2', text: 'The end' },
      { t: 'p', text: "If this handbook changes one thing about how you work, make it this: run the check *before* the file leaves your machine, every time, and attach what it produced. Everything else in these pages is detail hanging off that one habit." },
    ],
  },
]

