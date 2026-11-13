// English copy of the two solution pages. Source of every other language.
// Rules for translators: scripts/seo/solution-landings/TRANSLATING.md.
import type { LangCopy } from './types'

export const copy: LangCopy = {
  ui: {
    home: 'IFC Viewer Online',
    sources: 'Sources',
    readOn: 'read on',
    preview: 'Preview',
    faqLabel: 'FAQ',
    faqTitle: 'Questions buyers ask',
    related: 'Related',
    pricing: 'Plans and prices',
    postReception: 'Reviewing subcontractor IFC models',
    postClash: 'Clash detection in the browser',
    postBatch: 'Validating many IFC files at once',
    postSupplier: 'An upload page for suppliers without an account',
  },
  pages: {
    contractors: {
      title: 'IFC Model Reception for Contractors and Developers',
      desc: 'Subcontractors check their IFC against your requirements for free before sending it; you only review what passes. Reception plan in preview.',
      nav: 'For contractors',
      kicker: 'For contractors and developers · Reception plan · Preview',
      h1: ['Only receive IFC models that already pass', 'for contractors and developers who receive models from subcontractors'],
      lead: 'Publish your requirements as one link. Each subcontractor checks their model against it for free, in the browser, and fixes it before sending. You see who delivered, what passes and why the rest goes back, with a report ready for the client.',
      cta: 'Talk to us',
      cta2: 'Read how the review works',
      note: 'Preview: the Reception plan is designed and shown here with sample data. It is not on sale yet and nothing is saved. Checking a model is free and works today.',
      hero: {
        alt: 'Reception overview of a residential project with sample data: today\'s actions, estimated hours and euros saved, and suppliers by milestone',
        cap: 'The site at a glance, with sample data: what to review today, estimated savings with their assumptions, and each supplier by milestone. Interface in Spanish.',
      },
      sections: [
        {
          kind: 'text', label: 'The problem', h2: 'Bad models are found by whoever receives them',
          ps: [
            'Under ISO 19650-2, reviewing and accepting the information model is an activity of the appointing party: the contractor or developer who receives it. The UK BIM Framework guidance describes that check as part of the common data environment workflow.',
            'Skanska UK says its goals depend "critically" on getting quality information from its supply chain. Contractor BIM managers describe considerable difficulties getting information down and back up the chain by email and FTP.',
            'In practice a coordinator opens each delivery, finds the same missing properties and wrong names, writes the reasons by hand and waits for the next version. The subcontractor only learns the rules after being rejected.',
          ],
          sources: ['ukbimPartC', 'skanska', 'cmTier2'],
        },
        {
          kind: 'flow', label: 'How it works', h2: 'From your requirements to the client report',
          sub: 'Every capture below is the Reception design with sample data (project "Mirador del Turia", ten suppliers). The interface is in Spanish.',
          steps: [
            { h: 'Publish your requirements as a link', p: 'Rules, IDS and minimum score by ISO 19650 status. Subcontractors get the approved version; an older link keeps working.', alt: 'Rule library with a version change, its effect on the same model and a button to create the link for subcontractors', cap: 'What changes between rule versions and the link that goes to subcontractors.' },
            { h: 'Subcontractors check for free before sending', p: 'No account. They see the score, what fails, the elements involved and the [fix guide](fix) for each rule, so most errors are fixed before they reach you.', alt: 'Supplier page without an account showing a score of 84, a wrong file name and a list of what to fix', cap: 'The page a subcontractor sees: what passes, what fails and how to rename the file.' },
            { h: 'Review a queue, not an inbox', p: 'Deliveries arrive already checked, with the file name read against ISO 19650 and a before-and-after against the previous version. Keyboard shortcuts take you through the queue.', alt: 'Review dialog with four versions of a delivery, the ISO 19650 file name split into fields and the requirements score', cap: 'One delivery: its versions, its file name field by field and its requirements.' },
            { h: 'Return it with reasons the supplier can act on', p: 'Each reason points to the elements in 3D and to how to fix them. Everything is logged with a chained hash and exported to CSV.', alt: 'Decision to return a delivery with the failed reasons ticked and the elements listed', cap: 'Returning a model: the reasons, the elements and a note for the supplier.' },
            { h: 'See clashes between disciplines over time', p: 'Clash runs in the browser, ordered by estimated cost, with the trend between runs.', alt: 'Clash panel with the trend between runs and clashes ordered by estimated cost', cap: 'Clashes with their trend and estimated cost (federated sample hotel).' },
            { h: 'Keep the client informed without writing it', p: 'A project page with the latest score, accepted deliveries, resolved clashes and the next milestone. Sending is simulated in the preview.', alt: 'Client project page with the model\'s Health Score, resolved clashes and the timeline', cap: 'What the client sees when opening the update link.' },
            { h: 'Send the weekly report to site management', p: 'Received, passed, missing and the estimated time saved, written for you to copy or download.', alt: 'Weekly delivery report for site management with a summary per supplier', cap: 'The weekly report, generated from the deliveries.' },
          ],
        },
        {
          kind: 'table', label: 'Estimated savings', h2: 'About 22 hours a month of a coordinator, by our assumptions',
          sub: 'An estimate, not a measurement. Change the numbers for yours: the Reception overview lets you edit every assumption.',
          head: ['Task', 'Assumption', 'Share saved (assumed)', 'Minutes a month'],
          rows: [
            ['Reviewing deliveries by hand', '40 deliveries × 25 min', '80 %', '800'],
            ['Preparing the clash meeting', '4 meetings × 90 min', '70 %', '252'],
            ['Writing the client report', '8 reports × 45 min', '80 %', '288'],
            ['Total', '', '', '1,340 min ≈ 22 h'],
          ],
          after: [
            'At €45 an hour that is about €1,000 a month. The Reception plan is planned from €290 per project a month, so by these assumptions it pays back about three times its cost. Rework and penalties avoided are not counted.',
          ],
        },
        {
          kind: 'table', label: 'Comparison', h2: 'Next to a common data environment',
          sub: 'Each vendor column says only what that vendor\'s own page said on the day we read it. Where a page says nothing, the cell says so.',
          head: ['', 'Catenda Hub', 'Dalux Box', 'Autodesk Construction Cloud', 'IFC Viewer Online Reception (preview)'],
          rows: [
            ['Published price', 'Per project, by construction value: about €400 a month for a €10M project, about €1,100 for €50M; quote on request', 'None on the product page; contact form', 'None; a quote per bundle, with user, project and account-based pricing', 'Planned: from €290 per project a month with 15 suppliers, or €790 unlimited. Not on sale yet'],
            ['Suppliers need a licence', 'No: "Your subs don\'t need a licence to log a defect"', 'Not stated on the page', 'Not stated on the page', 'No account: they check for free in the browser'],
            ['Checking models against requirements', 'Not stated on the pricing page', 'Yes: validate model data and geometry against project requirements', 'The Model Management bundle lists model conditioning, coordination and clash detection', 'Rules and IDS 1.0 with a score per delivery. Checking is free today; the inbox is in preview'],
            ['Approval of received models', 'Not stated on the pricing page', 'Approval workflows and an enforceable file naming convention', 'Not stated on the pricing page', 'Accept or return with reasons and 3D elements (preview)'],
          ],
          after: [
            'This is not a replacement for your CDE. It sits before it: whatever CDE you use, the model arrives already checked against your requirements, and the supplier knew them before sending.',
          ],
          sources: ['catenda', 'dalux', 'acc'],
        },
        {
          kind: 'cols', label: 'Free and preview', h2: 'What works today and what is a preview',
          cols: [
            { h: 'Free, available today', items: ['Opening and checking any IFC in the browser, nothing uploaded', 'Your IDS 1.0 files and 44 rules with a Health Score', 'BCF import and export, comparing versions', 'The [fix guides](fix) for every rule'] },
            { h: 'Reception plan, in preview', items: ['Requirements link with versions per ISO 19650 status', 'Delivery queue with accept or return and reasons', 'Supplier record and log with chained hash', 'Client page and weekly report'] },
          ],
        },
      ],
      faq: [
        ['Can I use Reception today?', 'Not yet. It is designed and shown with sample data. If you receive models from subcontractors, [talk to us](pricing): we are looking for a few pilot projects. Checking a model against your requirements is free and works today in the [viewer](viewer).'],
        ['Do subcontractors pay or need an account?', 'No. They open your link and check their model for free in the browser. Paying is for whoever receives and manages the deliveries. How the upload page works: [an upload page for suppliers without an account](postSupplier).'],
        ['Does it replace Catenda, Dalux or Autodesk Construction Cloud?', 'No. It checks the model before it reaches your CDE and works whichever CDE you use. Each CDE has its own workflow; see the comparison above with the date we read their pages.'],
        ['Is the model uploaded to check it?', 'For the free check, no: it runs in the subcontractor\'s browser. In Reception, the delivery you accept is stored for you in the EU.'],
        ['How much will it cost?', 'It is planned from €290 per project a month with 15 suppliers, or €790 for unlimited projects. Prices may change before launch; see the [plans](pricing).'],
        ['Where does the savings figure come from?', 'From the assumptions in the table above: number of deliveries, minutes per task and the share each task saves. They are assumptions, not measurements, and you can change them in the overview.'],
      ],
      faqSources: ['catenda', 'dalux', 'acc'],
      bottom: ['Receiving models from subcontractors?', 'Tell us how many projects and suppliers you have. We are choosing a few pilot projects for Reception.'],
    },
    engineering: {
      title: 'BIM Coordination for Engineering Firms — Team Plan',
      desc: 'Deliver models the client accepts the first time: shared rules, clash runs, issues with a suggested fix and a publish gate. Team plan in preview.',
      nav: 'For engineering firms',
      kicker: 'For engineering firms and design studios · Team plan · Preview',
      h1: ['Deliver models the client accepts the first time', 'for engineering firms and design studios that coordinate several disciplines'],
      lead: 'One set of company rules, clash runs in the browser, issues with the camera and a suggested fix, and a gate that stops a model below your minimum score from being published. The client sees the progress without you writing it.',
      cta: 'Join the Team waitlist',
      cta2: 'Read about clash detection in the browser',
      note: 'Preview: the Team plan is designed and shown here with sample data. It is not on sale yet and nothing is saved. Checking a model with your IDS is free and works today.',
      hero: {
        alt: 'Team dashboard with sample data: Health Score per project and its trend, open issues per person and deadlines at risk',
        cap: 'The team dashboard, with sample data: health of each project, load per person and deadlines at risk. Interface in Spanish.',
      },
      sections: [
        {
          kind: 'text', label: 'The problem', h2: 'Rejections come from details nobody checked',
          ps: [
            'Clients now send their own information requirements, often as IDS. A delivery that misses a property name or a classification goes back, and the fix costs more than the check would have.',
            'One BIM consultant describes an IFC data validation problem that cost weeks, caused by property names that did not match what was required. ISO 19650-2 makes checking before sharing a step of the delivery team, not of the client.',
            'In a studio the rules live in one person\'s head or spreadsheet, clashes are reviewed in a meeting, and the issues end up in email threads without the view that explains them.',
          ],
          sources: ['bimCorner', 'ukbimPartC'],
        },
        {
          kind: 'flow', label: 'How it works', h2: 'From company rules to a published model',
          sub: 'Every capture below is the Team design with sample data. The interface is in Spanish.',
          steps: [
            { h: 'Write the rules once, as sentences', p: 'Class, condition, requirement and severity, including geometry (clearance in front of doors, free height) and relations (door in a wall). Every rule is IDS 1.0.', alt: 'Rule editor with geometry and relation rules, results on the sample model and an issue created with its fix', cap: 'Geometry and relation rules checked on a sample model.' },
            { h: 'Govern them as a company', p: 'A shared library with versions, author, review and approval (the author does not approve their own rule), comments and export to IDS.', alt: 'Company rule library with a version under review, the changes from v2 to v3 and comments', cap: 'A rule set in review: what changed, who approves it and the history.' },
            { h: 'Run clashes in the browser', p: 'Hard and clearance clashes between disciplines, grouped, with rules to ignore what is accepted and an estimated cost for each.', alt: 'Clash panel on a tower model with ignore rules hiding accepted clashes', cap: 'Ignore rules on a tower model: 1,569 of 4,827 results hidden.' },
            { h: 'Turn every failure into an issue with a fix', p: 'Assigned, with a deadline, the saved camera and a suggested fix per authoring tool from our remediation guides. Guests comment for free; BCF in and out.', alt: 'Issue with a suggested fix for several authoring tools, owner, deadline and comments', cap: 'An issue with its suggested fix, owner and deadline.' },
            { h: 'Stop a weak model before it is published', p: 'Nothing reaches Published below your minimum score, with an optional reviewer and a history of what passed and why.', alt: 'Publish gate with a minimum score of 80 and the history of published and held models', cap: 'The publish gate and its history.' },
            { h: 'Keep the client informed', p: 'Updates by phase built from live data: score, deliveries, issues and milestones. Sending is simulated in the preview.', alt: 'Client update screen choosing a phase, a template and the recipients', cap: 'A client update by project phase.' },
          ],
        },
        {
          kind: 'table', label: 'Estimated savings', h2: 'About 17 hours a month, by our assumptions',
          sub: 'An estimate for a team of three, not a measurement. Change the numbers for yours.',
          head: ['Task', 'Assumption', 'Share saved (assumed)', 'Minutes a month'],
          rows: [
            ['Checking deliveries before sending', '12 deliveries × 60 min', '60 %', '432'],
            ['Preparing the clash meeting', '4 meetings × 90 min', '70 %', '252'],
            ['Reworking returned deliveries', '3 returns × 120 min', '50 %', '180'],
            ['Writing client updates', '8 updates × 30 min', '70 %', '168'],
            ['Total', '', '', '1,032 min ≈ 17 h'],
          ],
          after: [
            'At €45 an hour that is about €775 a month. Team is planned at €59 per editor a month billed yearly, with three editors minimum (€177 a month), so by these assumptions it pays back about four times its cost.',
          ],
        },
        {
          kind: 'table', label: 'Comparison', h2: 'Next to the usual coordination tools',
          sub: 'Each vendor column says only what that vendor\'s own page said on the day we read it.',
          head: ['', 'BIMcollab', 'Solibri', 'IFC Viewer Online Team (preview)'],
          rows: [
            ['Published price', 'Basic €12.50, Advanced €18.75, Enterprise €25 per user a month billed yearly', 'Per licence a year: Essential €1,428, Advanced €2,109, Premium €2,772', 'Planned: €59 per editor a month billed yearly, three editors minimum. Not on sale yet'],
            ['Issues', 'BCF-based issue management with plug-ins for BIM tools', 'BCF issue management from Essential', 'Issues with camera, deadline and suggested fix; BCF in and out (preview)'],
            ['Rules', 'Clash rules and smart views shared for use in BIMcollab Zoom', 'Predefined rules from Essential; custom rules from Advanced; rule governance in Premium', 'Rules as sentences, IDS 1.0, shared library with approval (preview)'],
            ['Guests', 'One or two guest accounts per paid user, depending on the plan', 'Not stated on the pricing page', 'Guests comment for free'],
          ],
          after: [
            'Solibri is the stronger choice for deep rule-based checking on the desktop and BIMcollab for a large issue workflow across tools. Team is for studios that want rules, clashes, issues and the client update in one place, in the browser.',
          ],
          sources: ['bimcollab', 'solibri'],
        },
        {
          kind: 'cols', label: 'Free and preview', h2: 'What works today and what is a preview',
          cols: [
            { h: 'Free, available today', items: ['Opening and federating several IFC files in the browser', 'Checking each model with your IDS 1.0 and 44 rules', 'BCF import and export, comparing versions', 'The [fix guides](fix) for every rule'] },
            { h: 'Team plan, in preview', items: ['Company rule library with approval', 'Clash detection between disciplines', 'Shared issues with suggested fix, publish gate', 'Client updates by phase'] },
          ],
        },
      ],
      faq: [
        ['Can I use Team today?', 'Not yet. It is designed and shown with sample data. [Join the waitlist](pricing) to hear when it opens. Checking a model with your IDS is free and works today in the [viewer](viewer).'],
        ['Is clash detection free?', 'No. Clash detection between disciplines is a new tool and it will be paid. Opening, federating and checking each model stays free. More in the post on [clash detection in the browser](postClash).'],
        ['Can we use our client\'s IDS?', 'Yes, and that part is free today. In Team you can also import an IDS into the company library and keep its versions.'],
        ['Does it replace BIMcollab or Solibri?', 'Not for every team. See the comparison above, with the prices from their pages and the date we read them.'],
        ['How much will it cost?', 'It is planned at €59 per editor a month billed yearly, three editors minimum; guests are free. Prices may change before launch; see the [plans](pricing).'],
        ['Can we check a whole folder of models?', 'That is part of the paid preview too: read how [batch validation](postBatch) works.'],
      ],
      faqSources: ['bimcollab', 'solibri'],
      bottom: ['Coordinating several disciplines?', 'Join the Team waitlist and tell us how many editors you have. We will write when it opens.'],
    },
  },
}
