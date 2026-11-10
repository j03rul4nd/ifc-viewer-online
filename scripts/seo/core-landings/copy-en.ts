import type { LangCopy } from './types'

// English copy for the six landing families. Every number about our own tool is
// checked against the code by core-landings.test.ts (rule counts) or stated in
// pages.ts (FACTS); everything about Solibri and Flinker is what their own
// pages said on COMPARED_ON.

export const copy: LangCopy = {
  ui: {
    home: 'IFC Viewer Online',
    sources: 'Sources',
    readOn: 'read on',
    faqLabel: 'FAQ',
    faqTitle: 'Questions',
    related: 'Related pages',
    fix: 'Fix IFC errors',
    blogSolibri: 'Solibri or a browser validator: the long comparison',
    pricing: 'Pricing',
    embedCta: 'Run the validation on a sample IFC',
    embedSub: 'Loads the validator in this page. Nothing is uploaded.',
  },
  pages: {
    // ─────────────────────────────────────────────────────────────────────────
    validator: {
      title: 'IFC Model Validation Online — Free Checker, 44 Rules',
      desc: 'Check an IFC file in your browser: 44 rules, IDS 1.0 and a Health Score from 0 to 100. The file is not uploaded. Free, no account. IFC2x3, IFC4, IFC4x3.',
      nav: 'IFC Validator',
      kicker: '44 rules · IDS 1.0 · The file stays in your browser · Free',
      h1: ['IFC Model Validation Online', 'What is wrong with the file, and where'],
      lead: 'Drop an IFC file and get a Health Score from 0 to 100, the list of problems grouped by rule, and the failing elements highlighted in the 3D model. The file is read in your browser tab and is not uploaded.',
      cta: 'Validate an IFC file',
      cta2: 'or open the sample model',
      note: 'No account. IFC2x3, IFC4, IFC4x1 and IFC4x3, up to 2 GB per file.',
      shots: [
        { alt: 'IFC validation of a two-storey house in the browser: Health Score 77, one error and 161 warnings, the three fixes that recover the most points, and the 3D view stepping through the 119 elements without a type', cap: 'The public Duplex sample (2.3 MB, 7,181 entities) scores 77. "Show in 3D" on the first fix frames the 119 elements without a type, with a counter to step through them one by one.' },
        { alt: 'List of IFC validation issues grouped by rule, with the number of elements failing each rule and the explanation of how to fix it', cap: 'Each rule opens to its elements and to the steps that fix it in Revit, Archicad or Tekla.' },
      ],
      sections: [
        {
          kind: 'cols', label: 'Scope', h2: 'What the check covers, and what it does not',
          sub: 'There are 44 rules in eight groups. 25 run by default; the other 19 are switched on from a profile because they need a decision from you (a LOD level, a naming pattern, a classification system).',
          cols: [
            { h: 'It checks', items: [
              'Identifiers: duplicate GlobalIds and GlobalIds that are not valid 22-character IFC GUIDs.',
              'Structure: one IfcProject, the Project → Site → Building → Storey chain, elements without a storey, broken or circular aggregations, openings without a host.',
              'Storeys: missing, duplicated or unordered elevations.',
              'Data: empty names, duplicated names, empty property values, elements without a type or a material, spaces without floor area.',
              'Export quality: more than 5% of elements as IfcBuildingElementProxy, a model more than 10 km from the origin, more than 500 KB per element, imperial length units.',
              'On request: required property sets per class, naming patterns, classification, LOD 100–400 properties and quantities, ISO 19650 project and author fields, MEP systems.',
              'Your own requirements: an IDS 1.0 file, one of five built-in profiles (basic delivery, quality review, BIM coordination, ISO 19650, LOD 300) or a profile you define.',
            ] },
            { h: 'It does not check', items: [
              'Clashes between two models. The clash rules compare bounding boxes inside one model, with a 5 cm overlap, up to 800 elements and 100 results. They are a first filter, not coordination.',
              'Building codes: accessibility, fire safety, escape routes or clear heights. No rule here reads a regulation.',
              'The whole IFC schema. It is not an EXPRESS conformance test: it runs these 44 rules and your IDS.',
              'ISO 19650 codes. The file-name rule reads the name written in the IFC header and counts its fields; it does not verify each code.',
              'Native files. It reads IFC, not Revit or Archicad files.',
            ] },
          ],
        },
        {
          kind: 'table', label: 'Limits', h2: 'Limits, with numbers',
          head: ['', 'Limit'],
          rows: [
            ['File size', '2 GB per file is refused. A notice appears from 200 MB and a memory warning from 1 GB. On phones, tablets and computers with 4 GB of memory or less, the warning starts at 80 MB.'],
            ['Formats', 'IFC2x3, IFC4, IFC4x1 and IFC4x3, as .ifc or inside .ifczip and .zip.'],
            ['Rules', '44 in total, 25 on by default. Severity and thresholds can be changed per rule.'],
            ['IDS', 'IDS 1.0 with its six facets. The restrictions totalDigits, fractionDigits and whiteSpace are not read. Up to 200 failing elements are listed per specification.'],
            ['Automatic fixes', 'Invalid and duplicate GlobalIds, and empty or duplicated names. Everything else you edit by hand or fix in the authoring tool.'],
            ['Speed', 'The sample in the picture (2.3 MB, 7,181 entities) was validated in about 20 seconds on the computer used for these captures. Time grows with the number of entities.'],
            ['Connection', 'The page has to load from the internet. It does not work offline.'],
          ],
        },
        {
          kind: 'text', label: 'Your file', h2: 'What happens to the file',
          ps: [
            'The IFC is opened by code running in your browser tab. It is not sent to us or to anyone else, so there is no upload to wait for and nothing to delete afterwards.',
            'To reopen a model faster, the browser keeps a converted copy of its geometry in its own private storage on your computer (up to 4 GB, oldest first out). Clearing the site data in your browser removes it.',
            'Two things do leave the browser, and both are yours to control. Usage statistics without cookies record that a file was opened, its size and its number of elements, never its content; they can be switched off and respect Do Not Track. And if you press Share, the link itself carries the score, the file name and the 50 first issues with their element names, so anyone with the link can read those.',
          ],
        },
        { kind: 'shot', label: 'The result', h2: 'From the score to the element', sub: 'Try it here on the sample model, then open your own file.' },
        {
          kind: 'steps', label: 'How it goes', h2: 'From the file to a corrected IFC',
          steps: [
            ['Open the file', 'Drag the .ifc into the page. Several files can be open at once; each one is validated on its own.'],
            ['Read the verdict', 'The score, the errors and warnings, and the three fixes that recover the most points. One click highlights the failing elements.'],
            ['Fix what can be fixed here', 'Regenerate invalid GlobalIds, rename in bulk, edit names and property values. Every edit can be undone.'],
            ['Export', 'The corrected IFC, written again by the parser, and the findings as BCF 2.1, CSV, JSON, an HTML delivery report or a COBie spreadsheet.'],
          ],
        },
        {
          kind: 'text', label: 'Price', h2: 'What it costs',
          ps: [
            'Nothing. The viewer, the 44 rules, IDS, the fixes and every export on this page are free, without an account, also for commercial work. The source code is public under the MIT licence on [GitHub](github).',
            'Paid plans (Pro at €19 a month, Team at €35 per editor a month) are for things that need a server, such as storing models and saved rule sets. They are not on sale yet; the [pricing page](pricing) says what each one will include.',
          ],
        },
      ],
      faq: [
        ['Is the IFC file uploaded to a server?', 'No. The file is read by code running in your browser tab. Only anonymous usage statistics (file size and element count, never content) and the share links you create yourself leave the browser.'],
        ['Which IFC versions does it read?', 'IFC2x3, IFC4, IFC4x1 and IFC4x3, as .ifc files or inside .ifczip and .zip archives. Files of 2 GB or more are refused.'],
        ['Does it replace a clash detection tool?', 'No. The clash rules compare bounding boxes inside a single model and are off by default. They find obvious overlaps before you send a model on; coordination between disciplines needs a clash tool.'],
        ['Can I check a model against my own requirements?', 'Yes. Load an IDS 1.0 file, or start from one of seven ready-made requirement sets (ISO 19650 delivery, LOD 200 and LOD 400, COBie handover and others). You can also build a validation profile with your own naming patterns and required property sets.'],
        ['Can I fix the errors and export the IFC again?', 'GlobalIds and names can be fixed automatically; names, descriptions and property values can be edited by hand, with undo. The export writes the IFC again with those changes. Geometry and relationships cannot be edited.'],
        ['Does it work without an internet connection?', 'No. The page has to load from the internet. For networks without internet access there is an [on-premise installation](onprem).'],
      ],
      bottom: ['Check a file now', 'Free, no account, and the file stays in your browser.'],
    },

    // ─────────────────────────────────────────────────────────────────────────
    cloud: {
      title: 'Cloud IFC Validator — Validate IFC Online, Nothing Uploaded',
      desc: 'IFC checking from a web page without uploading the model: 44 rules, IDS 1.0 and a Health Score computed in your browser. Free, no account, files up to 2 GB.',
      nav: 'Cloud IFC Validator',
      kicker: 'Online · No upload · 44 rules · IDS 1.0 · Free',
      h1: ['Cloud IFC Validator', 'without the upload'],
      lead: 'A cloud IFC checking tool normally means sending the model to someone else\'s server. This one is a web page that does the work in your own browser: same convenience, and the file never leaves your computer.',
      cta: 'Validate an IFC file',
      cta2: 'or open the sample model',
      note: 'No account. Works in Chrome, Edge, Firefox and Safari. Up to 2 GB per file.',
      shots: [
        { alt: 'IDS check of an IFC model in the browser: the specification "Walls declare a FireRating in Pset_WallCommon" fails for the 57 walls of a two-storey house shown in 3D', cap: 'An IDS 1.0 sample checked against the model: none of the 57 walls declares a fire rating. The model and the IDS are both read in the browser tab.' },
        { alt: 'Export dialog of an IFC validation with the formats JSON, CSV, certificate, BCF, delivery report and COBie', cap: 'The findings leave as files you download: BCF 2.1, CSV, JSON, an HTML delivery report or a COBie spreadsheet.' },
      ],
      sections: [
        {
          kind: 'table', label: 'Upload or browser', h2: 'A checking service that uploads, and a page that does not',
          sub: 'Solibri WebChecker is the clearest published example of a cloud checking service, so it is the comparison here. Its column quotes Solibri\'s own page.',
          head: ['', 'Solibri WebChecker (Beta)', 'IFC Viewer Online'],
          rows: [
            ['Where the model goes', 'Uploaded to the service. Data is stored in the EU or the US, chosen when the project is set up', 'Nowhere. It is read in your browser tab'],
            ['How long results are kept', '30 days, then removed', 'Until you close the tab. You keep what you export'],
            ['File size', 'Up to 5 GB per IFC file', 'Under 2 GB per file, and less on a computer with little memory'],
            ['Account', 'A Solibri ID and a Solibri Advanced or Premium plan', 'None'],
            ['Cost of a check', '50 tokens. Advanced includes 1,750 tokens a year, Premium 17,500; a pack of 5,000 tokens costs €250', 'Free'],
            ['Checks', 'Solibri\'s Model Health check, or a custom ruleset (.cset) prepared in the Solibri desktop application', '44 fixed rules and your IDS 1.0 files'],
            ['Results', 'PDF and BCF; SMC files with Premium', 'BCF 2.1, CSV, JSON, HTML report, COBie spreadsheet. No PDF file: the HTML report prints from the browser'],
          ],
          after: [
            'A server earns its place when files are larger than a browser can hold, when results must stay available to a whole project team, or when checks have to run unattended. None of that happens here: this page checks one person\'s file on that person\'s computer.',
            'The browser wins when the model may not leave the building, when nobody will approve a new supplier this week, or when you just need an answer about one file.',
          ],
          sources: ['solibriWebchecker', 'solibriPricing'],
        },
        {
          kind: 'cols', label: 'Scope', h2: 'What it checks, and what it does not',
          cols: [
            { h: 'It checks', items: [
              '44 rules in eight groups: identifiers, spatial structure, storeys, names, property values, types, materials, export quality. 25 run by default.',
              'IDS 1.0 files, with the six facets: entity, attribute, property, classification, material and part-of.',
              'Five built-in validation profiles (basic delivery, quality review, BIM coordination, ISO 19650, LOD 300), or your own.',
            ] },
            { h: 'It does not check', items: [
              'Clashes between models. Only bounding boxes inside one model, off by default.',
              'Building codes or design rules written for your project. There is no rule editor; requirements go in as IDS.',
              'Batches. Each file is opened by a person; nothing runs on a schedule.',
            ] },
          ],
        },
        {
          kind: 'table', label: 'Limits', h2: 'Limits, with numbers',
          head: ['', 'Limit'],
          rows: [
            ['File size', '2 GB per file is refused. A notice appears from 200 MB and a memory warning from 1 GB; on phones, tablets and computers with 4 GB of memory or less it starts at 80 MB.'],
            ['Formats', 'IFC2x3, IFC4, IFC4x1 and IFC4x3, as .ifc or inside .ifczip and .zip.'],
            ['IDS', 'IDS 1.0. The restrictions totalDigits, fractionDigits and whiteSpace are not read. Up to 200 failing elements are listed per specification.'],
            ['Sharing', 'A share link carries the score and the first 50 issues inside the URL, up to 8,000 characters. The model is not in it.'],
            ['Connection', 'The page has to load from the internet. It does not work offline.'],
          ],
        },
        {
          kind: 'text', label: 'Your file', h2: 'What happens to the file',
          ps: [
            'The IFC is opened by code running in your browser tab and is not sent anywhere. You can check it yourself: open the browser\'s developer tools, watch the Network tab and drop a file.',
            'The browser keeps a converted copy of the geometry in its private storage on your computer (up to 4 GB) to reopen the model faster. Clearing the site data removes it.',
            'Usage statistics without cookies record the file size and the number of elements, never the content, and can be switched off. A share link, if you create one, contains the score, the file name and up to 50 issues with element names.',
          ],
        },
        { kind: 'shot', label: 'The result', h2: 'Try it on a sample model', sub: 'The demo below runs in this page. Then open your own file.' },
        {
          kind: 'text', label: 'Price', h2: 'What it costs',
          ps: [
            'Nothing: the viewer, the rules, IDS and the exports are free and need no account. The code is public under the MIT licence on [GitHub](github).',
            'Paid plans that add a server (stored models, saved rule sets, team work) are described on the [pricing page](pricing) and are not on sale yet.',
          ],
        },
      ],
      faq: [
        ['Is this a cloud service?', 'It is delivered from the web like one, but the checking is done by your browser. There is no upload, no queue and no stored copy of the model on our side.'],
        ['How can I verify that nothing is uploaded?', 'Open the developer tools of your browser, go to the Network tab and drop an IFC file. You will see the page\'s own files load and no request carrying the model.'],
        ['How large a file can it take?', 'Files of 2 GB or more are refused, and the practical limit depends on the memory of the computer: a warning appears from 1 GB, or from 80 MB on phones and machines with 4 GB of memory or less. Solibri WebChecker accepts up to 5 GB per file (solibri.com/solutions/webchecker, read on 2026-11-10).'],
        ['Can I automate it?', 'Not from this page: each file is opened by a person. There is an MCP server (ifc-viewer-mcp) that runs the same validation on your own machine from an assistant or a script; see the [source on GitHub](github).'],
        ['Is it allowed for confidential models?', 'The model stays on your computer, which is usually what an NDA asks for. Check two things against your own policy: the anonymous usage statistics (they can be switched off) and the share links (they contain file and element names).'],
      ],
      faqSources: ['solibriWebchecker'],
      bottom: ['Check a file without uploading it', 'Free, no account. The model stays on your computer.'],
    },

    // ─────────────────────────────────────────────────────────────────────────
    onprem: {
      title: 'On-Premise IFC Validator — Air-Gapped BIM Validation',
      desc: 'The IFC viewer, the 44-rule validator and IDS checks served from your own network, with no internet connection. Container image, setup, training and support.',
      nav: 'On-premise IFC validation',
      kicker: 'On-premise · No internet connection · Your server',
      h1: ['On-premise IFC validator', 'for networks that stay closed'],
      lead: 'The public app already reads IFC files inside the browser, but the page itself loads from the internet. Where that is not allowed, the same viewer, validator and IDS checks are served from a container on your own server.',
      cta: 'Request a pilot',
      cta2: '',
      note: 'One site, fixed scope: installation, configuration with your requirements, a training session and a support period.',
      shots: [
        { alt: 'IFC validator with the list of built-in validation profiles open: basic delivery, quality review, BIM coordination, ISO 19650 compliance and LOD 300 design', cap: 'The built-in profiles. During the pilot, your own profiles and IDS files are loaded and tested on your models.' },
        { alt: 'Result of an IDS check in the IFC validator: one specification failed, 0 of 57 walls with a FireRating property, with buttons to highlight, isolate and export', cap: 'A model checked against an IDS file: the 57 walls fail the fire-rating requirement. On-premise, the model and the requirements stay on your network.' },
      ],
      sections: [
        {
          kind: 'cols', label: 'Who it is for', h2: 'When "nothing is uploaded" is not enough',
          cols: [
            { h: 'It fits when', items: [
              'Workstations have no internet access, or may not load software from it.',
              'You need one audited version that does not change until you decide.',
              'Contractor models must be checked against your IDS or EIR without passing through a third party.',
              'You want someone to call when it does not work.',
            ] },
            { h: 'You do not need it when', items: [
              'Your policy only forbids uploading models. The [public validator](validator) does not upload them.',
              'You have the staff to host it yourselves. The code is MIT-licensed and includes a Dockerfile: build the image and serve it. The pilot adds configuration, training and support, not a different product.',
            ] },
          ],
        },
        {
          kind: 'table', label: 'What you get', h2: 'What is installed, and what is not',
          head: ['', 'Detail'],
          rows: [
            ['Software', 'The viewer, the 44 rules with the Health Score, IDS 1.0, BCF 2.1 and 3.0, several models at once, measuring and sections. A static web application served by nginx from a container; the checking runs in each user\'s browser.'],
            ['Server', 'Any machine that runs a container. It only serves files, so it needs little: the work is done by the workstations.'],
            ['Connections', 'No outbound connection and no usage statistics in this build.'],
            ['Not available offline', 'The 3D map context (terrain, OpenStreetMap buildings) and the online sample models, because they are downloaded from the internet.'],
            ['Your requirements', 'Your IDS files, validation profiles and naming patterns loaded and tested on your own models.'],
            ['Updates', 'A new image file, delivered through the channel you choose. Nothing updates by itself.'],
            ['Hardware', 'Your own server or virtual machine. A preconfigured gateway can be supplied on request.'],
          ],
        },
        {
          kind: 'table', label: 'Alternatives', h2: 'The other air-gapped option we know of',
          sub: 'If you are comparing, this is what Solibri publishes about its offline plan.',
          head: ['', 'Solibri Security+', 'IFC Viewer Online on-premise'],
          rows: [
            ['Described as', '"Fully offline operation (no telemetry)", "Air-gapped by design", "Controlled update cycles"', 'A container on your server; no outbound connection'],
            ['Price', 'Not published; "Talk with an expert"', 'Quoted per pilot after a scoping call'],
            ['Checks', 'Solibri\'s rule-based validation', '44 fixed rules and IDS 1.0; clash by bounding box only'],
          ],
          after: [
            'Solibri is the stronger choice when you need clash detection between disciplines or rules written for your organisation. This installation is the smaller thing: opening a delivery, checking it against your requirements and returning the findings.',
          ],
          sources: ['solibriPricing'],
        },
        {
          kind: 'steps', label: 'Pilot', h2: 'How a pilot works',
          steps: [
            ['Scoping call', 'Your network rules, the size of your models, your requirements and who will use it.'],
            ['Installation', 'On your server, with your IDS files and profiles loaded.'],
            ['Training', 'One session with your BIM coordinators, on your own models.'],
            ['Decision', 'After the support period you decide whether to extend it to other sites.'],
          ],
        },
        {
          kind: 'form', label: 'Request a pilot', h2: 'Tell us about your environment',
          sub: 'The form opens a message in your own mail program. Nothing is sent to our servers.',
          org: 'Organisation', sector: 'Sector',
          sectors: ['Defence / security', 'Energy / utilities', 'Transport / infrastructure', 'Public administration', 'Industrial / manufacturing', 'AEC firm', 'Other'],
          deploy: 'Network', deploys: ['No internet access at all', 'Private network, internet restricted', 'Private cloud in our region', 'Not sure yet'],
          hw: 'Hardware', hws: ['Our own server or virtual machine', 'A preconfigured gateway', 'Not sure yet'],
          need: 'What do you need to check, and roughly how large are the models?',
          submit: 'Open the email', direct: 'Or write to', subject: 'On-premise IFC validation pilot',
        },
      ],
      faq: [
        ['Does anything leave our network?', 'No. The container serves the application to your browsers and makes no outbound connection; this build carries no usage statistics. Models are read in each user\'s browser and are not stored on the server.'],
        ['What is different from the public app?', 'The program is the same. What changes is where it is served from, that it is a fixed version, and that the features needing the internet (the map context and the online sample models) are not available.'],
        ['Can we host it ourselves without you?', 'Yes. The source is public under the MIT licence and includes a Dockerfile and an nginx configuration. The pilot is for teams that want it configured, explained and supported.'],
        ['How large can the models be?', 'The same as in the public app: under 2 GB per file, limited in practice by the memory of each workstation, because the checking runs in the browser.'],
        ['What does it cost?', 'A pilot is quoted after the scoping call, because it depends on the number of sites and the support you need. There is no public price list for it yet.'],
      ],
      bottom: ['Is your network connected? Then it is already free', 'The public validator reads the file in your browser and uploads nothing.'],
    },

    // ─────────────────────────────────────────────────────────────────────────
    solibri: {
      title: 'Free Solibri Alternative — Validate IFC in the Browser',
      desc: 'When a free browser validator is enough and when you need Solibri: prices, clash detection, rules and IDS compared from Solibri\'s own pages, read on 2026-11-10.',
      nav: 'Solibri alternative',
      kicker: 'Free · In the browser · Compared with Solibri\'s published plans',
      h1: ['Free Solibri alternative', 'for checking an IFC before it is delivered'],
      lead: 'Solibri is a rule-based checking platform sold in plans from €99 to €2,772 per licence per year. IFC Viewer Online is a free web page that opens an IFC, runs 44 fixed rules and your IDS, and shows what fails. It replaces Solibri for some jobs and not for others; this page says which.',
      cta: 'Validate an IFC file',
      cta2: 'or open the sample model',
      note: 'No account, nothing to install, and the file is not uploaded.',
      heroSources: ['solibriPricing'],
      shots: [
        { alt: 'IFC model checked in the browser with the clash rule switched on: Health Score 70, 36 element clashes first in the list of fixes, and the elements involved highlighted in the 3D view', cap: 'The sample model with the clash rule switched on: 36 overlaps between bounding boxes, and the score drops from 77 to 70. It is a first filter inside one model, not the clash detection Solibri sells.' },
        { alt: 'IDS check in the browser: an IDS specification that requires a fire rating on walls, failed by the 57 walls of the IFC model shown in 3D', cap: 'An IDS 1.0 file checked against the model, free and without an account: 57 walls lack the fire rating the specification asks for.' },
      ],
      sections: [
        {
          kind: 'table', label: 'Comparison', h2: 'Solibri and IFC Viewer Online, side by side',
          sub: 'The Solibri column says only what Solibri publishes. Where its pages do not state something (operating systems, file-size limits), there is no row.',
          head: ['', 'Solibri', 'IFC Viewer Online'],
          rows: [
            ['Price', 'Starter €99, Essential €1,428, Advanced €2,109, Premium €2,772: starting prices per licence per year. Security+ on request', 'Free. Paid plans for server features are not on sale yet'],
            ['Model checking', 'From Essential. Starter is for viewing models and reviewing results: "Model checking is performed in Solibri Essential, Advanced, or Premium"', 'Included: 44 fixed rules, 25 on by default'],
            ['Clash detection', 'Essential: rule-based clash checking, hard and soft clashes. Advanced: a clash matrix between disciplines with tolerances', 'Bounding boxes only, inside one model, 5 cm overlap, up to 800 elements and 100 results. Off by default'],
            ['Your own rules', 'Advanced and Premium: "Custom rule creation and modification"', 'No rule editor. You can switch rules, change their severity, and set naming patterns and required property sets; anything else goes in as IDS'],
            ['IDS', 'Essential checks required properties against IDS definitions. Advanced adds IDS workflows, an IDS editor and an IDS validator', 'IDS 1.0 with its six facets. Three restrictions (totalDigits, fractionDigits, whiteSpace) are not read'],
            ['BCF', 'From Essential: "BCF issue management and CDE integrations"', 'Reads and writes BCF 2.1 and 3.0 files. No connection to a BCF server or a CDE'],
            ['Native Revit models', 'From Essential: "IFC and native Revit model federation"', 'IFC only'],
            ['Quantity takeoff', 'Advanced: "Quantity / Information Takeoff (QTO / ITO)"', 'Adds up the quantities already written in the IFC. No takeoff rules'],
            ['Without internet', 'Security+: "Fully offline operation (no telemetry)"', 'The page loads from the internet; the file is not uploaded. An [on-premise installation](onprem) exists'],
          ],
          after: [
            'Choose Solibri when you coordinate several disciplines and need real clash detection, when your organisation writes its own rules, or when checking has to be governed across many projects. Nothing on this page does that.',
            'Choose IFC Viewer Online when you want to know today whether one IFC is fit to send: identifiers, structure, names, properties, your IDS. It is also the tool for the people around a Solibri team who have no licence: the architect exporting the model, the client receiving it.',
            'Many teams will use both: a quick check in the browser before export, and Solibri for coordination.',
          ],
          sources: ['solibriPricing', 'solibriStarter', 'solibriEssential', 'solibriAdvanced'],
        },
        {
          kind: 'text', label: 'Solibri today', h2: 'If you are looking for Solibri Office or Solibri Anywhere',
          ps: [
            'Solibri\'s site lists Solibri Office, CheckPoint, Anywhere and Site as legacy products that are "no longer available for new customers". The current plans are Starter, Essential, Advanced, Premium and Security+.',
            'The free version of Solibri Anywhere still runs for people who already have it, on versions before 26.4.0; Solibri says the free entitlement is not available in newer releases. If you used Anywhere to open and look at IFC files, the [viewer](viewer) does that for free, in the browser, on any operating system.',
          ],
          sources: ['solibriLegacy', 'solibriPricing'],
        },
        {
          kind: 'cols', label: 'Scope', h2: 'What you get here, and what you do not',
          cols: [
            { h: 'You get', items: [
              'A Health Score from 0 to 100 and the fixes that recover the most points.',
              'The failing elements highlighted in the 3D model, and listed by rule, storey or class.',
              'IDS 1.0 checks and five built-in validation profiles, from basic delivery to ISO 19650 and LOD 300.',
              'Automatic fixes for GlobalIds and names, manual edits of names and property values, and the corrected IFC.',
              'Findings as BCF 2.1, CSV, JSON, an HTML report or a COBie spreadsheet.',
            ] },
            { h: 'You do not get', items: [
              'Clash detection between models, or at the level of the real geometry.',
              'A rule editor, code checking (accessibility, fire, escape routes) or space analysis.',
              'Issue tracking with assignments on a server. BCF files are exchanged by hand.',
              'Files of 2 GB or more. The limit depends on the memory of your computer.',
            ] },
          ],
        },
        { kind: 'shot', label: 'Try it', h2: 'Run it on a sample model', sub: 'The demo below loads the validator in this page.' },
        {
          kind: 'text', label: 'Price', h2: 'What it costs',
          ps: [
            'The viewer, the rules, IDS, the fixes and the exports are free, without an account, also for commercial projects. The source is public under the MIT licence on [GitHub](github).',
            'Paid plans (Pro at €19 a month, Team at €35 per editor a month) will add things that need a server; they are not on sale yet. See the [pricing page](pricing).',
          ],
        },
      ],
      faq: [
        ['Is IFC Viewer Online a replacement for Solibri?', 'For checking one IFC before delivery (identifiers, spatial structure, names, properties, IDS), yes. For clash detection between disciplines, custom rules and governance across projects, no: that is what Solibri Essential and Advanced are for.'],
        ['How much does Solibri cost?', 'Solibri publishes starting prices per licence per year: Starter €99, Essential €1,428, Advanced €2,109 and Premium €2,772. Security+ is priced on request (solibri.com/pricing, read on 2026-11-10).'],
        ['Is there a free version of Solibri?', 'Solibri Anywhere, which had a free version, is now a legacy product and is not available to new customers; existing free users can keep versions before 26.4.0 (solibri.com/products/legacy-products, read on 2026-11-10). The cheapest current plan is Starter at €99 a year.'],
        ['Does the €99 Starter plan check models?', 'According to Solibri, Starter is for visual inspection and for reviewing results made by others: "Model checking is performed in Solibri Essential, Advanced, or Premium" (solibri.com/products/starter, read on 2026-11-10).'],
        ['What does Solibri do that this cannot?', 'Clash detection on real geometry and between models, rules written for your organisation, quantity takeoff rules, native Revit models, BCF servers and CDE connections, and a fully offline plan. See the table above.'],
        ['Can I use both?', 'Yes, and it is a common split: authors and clients check a file in the browser before it is sent, and the coordination team runs Solibri on the federated model.'],
      ],
      faqSources: ['solibriPricing', 'solibriLegacy', 'solibriStarter'],
      bottom: ['Check one file before you decide', 'It takes a minute, costs nothing and the model stays on your computer.'],
    },

    // ─────────────────────────────────────────────────────────────────────────
    webchecker: {
      title: 'Solibri WebChecker Alternative — Free Browser IFC Validation',
      desc: 'Solibri WebChecker needs an Advanced or Premium plan and uploads the IFC. This free alternative checks the file in your browser. What each does, with sources.',
      nav: 'Solibri WebChecker alternative',
      kicker: 'Free · No Solibri plan · The file is not uploaded',
      h1: ['Solibri WebChecker alternative', 'that checks the IFC in your own browser'],
      lead: 'Solibri WebChecker (Beta) runs Solibri\'s checking engine online: you upload an IFC, it is checked on Solibri\'s service, and you download a PDF or BCF. It comes with the Advanced and Premium plans. If you need a web check without a plan, or without uploading the model, this page does it in your browser, with fewer checks.',
      cta: 'Validate an IFC file',
      cta2: 'or open the sample model',
      note: 'No account and no tokens. Up to 2 GB per file.',
      heroSources: ['solibriWebchecker'],
      shots: [
        { alt: 'Web-based IFC check: the list of issues grouped by rule with the number of failing elements, in the validation panel of the browser viewer', cap: 'The findings of a check, grouped by rule. Nothing was uploaded to produce them.' },
        { alt: 'Export of an IFC check from the browser with the formats BCF, CSV, JSON, delivery report and COBie', cap: 'The results leave as BCF 2.1, CSV, JSON, an HTML report or a COBie spreadsheet. There is no PDF file; the HTML report prints from the browser.' },
      ],
      sections: [
        {
          kind: 'table', label: 'Comparison', h2: 'Solibri WebChecker and IFC Viewer Online',
          sub: 'The WebChecker column is taken from Solibri\'s own page.',
          head: ['', 'Solibri WebChecker (Beta)', 'IFC Viewer Online'],
          rows: [
            ['Access', 'Included in Solibri Advanced (from €2,109 a year) and Premium (from €2,772). Not in Starter, Essential or Security+, and "not a standalone product". Needs a Solibri ID', 'Open the page. No account'],
            ['Cost per check', '50 tokens. Advanced includes 1,750 tokens a year (about 35 checks), Premium 17,500 (about 350). Extra tokens: 5,000 for €250, 10,000 for €450, 25,000 for €750', 'Free, any number of checks'],
            ['Where the model goes', 'Uploaded. Data residency in the EU or the US, chosen at project setup', 'It stays in your browser tab'],
            ['Results kept', '30 days', 'Until you close the tab; export what you need'],
            ['File size', 'Up to 5 GB per IFC file', 'Under 2 GB, and less on a computer with little memory'],
            ['Checks', 'Model Health check (structure and classification, naming and identifiers, key properties through IDS-based checks, hard geometric clashes between disciplines), or a custom .cset ruleset made in the desktop application', '44 fixed rules and IDS 1.0 files. Clash by bounding box inside one model only'],
            ['Results', 'PDF and BCF (1.0, 2.0, 2.1 or 3.0); SMC files for Premium users', 'BCF 2.1, CSV, JSON, HTML report, COBie spreadsheet'],
          ],
          after: [
            'WebChecker is the better tool when your BIM team already maintains Solibri rulesets and wants project participants to run exactly those, when files are larger than 2 GB, or when you need hard clashes between disciplines in the report.',
            'This page is the better tool when you have no Advanced or Premium plan, when the model may not be uploaded, or when you check often and do not want to count tokens.',
          ],
          sources: ['solibriWebchecker', 'solibriPricing'],
        },
        {
          kind: 'cols', label: 'Scope', h2: 'What this check covers, and what it does not',
          cols: [
            { h: 'It checks', items: [
              'Identifiers, spatial structure, storeys, names, property values, types and materials: 44 rules, 25 on by default.',
              'IDS 1.0 files with their six facets.',
              'Five built-in validation profiles, or your own naming patterns and required property sets.',
            ] },
            { h: 'It does not check', items: [
              'Solibri rulesets. A .cset file cannot be loaded here.',
              'Hard clashes between disciplines, accessibility rules or space analysis.',
              'Files of 2 GB or more.',
            ] },
          ],
          sources: ['solibriWebchecker'],
        },
        {
          kind: 'text', label: 'Your file', h2: 'What happens to the file',
          ps: [
            'The IFC is read by code running in your browser tab and is not uploaded. The browser keeps a converted copy of the geometry in its private storage on your computer (up to 4 GB) to reopen it faster; clearing the site data removes it.',
            'Usage statistics without cookies record the file size and the number of elements, never the content, and can be switched off. A share link, if you create one, carries the score, the file name and up to 50 issues inside the URL.',
          ],
        },
        { kind: 'shot', label: 'Try it', h2: 'Run a check on a sample model', sub: 'The demo below loads the validator in this page.' },
        {
          kind: 'text', label: 'Price', h2: 'What it costs',
          ps: [
            'Nothing, and there are no tokens. The viewer, the rules, IDS and the exports are free without an account. The code is public under the MIT licence on [GitHub](github).',
            'Paid plans that add a server are described on the [pricing page](pricing) and are not on sale yet. The other plans and prices are compared on [a separate page](solibri).',
          ],
        },
      ],
      faq: [
        ['What is Solibri WebChecker?', 'In Solibri\'s words, "a browser-based model validation service that runs Solibri\'s rules-based checking engine online". Users upload IFC models, run the Model Health check or a custom ruleset, and export PDF or BCF (solibri.com/solutions/webchecker, read on 2026-11-10).'],
        ['Is Solibri WebChecker free?', 'No. It is included in Solibri Advanced and Premium and is not sold on its own. Each check uses 50 tokens from the plan\'s yearly allowance or from token packs that start at €250 for 5,000 tokens (solibri.com/solutions/webchecker, read on 2026-11-10).'],
        ['Does WebChecker upload my model?', 'Yes: Solibri describes it as a service where users upload IFC models, with data stored in the EU or the US and results kept for 30 days (solibri.com/solutions/webchecker, read on 2026-11-10). IFC Viewer Online reads the file in your browser instead.'],
        ['Can I run my Solibri rulesets here?', 'No. Solibri rulesets (.cset) only run in Solibri. Requirements that can be written as IDS 1.0 can be checked here.'],
        ['Which one finds more problems?', 'They look for different things. WebChecker\'s Model Health check includes hard clashes between disciplines, which this page does not do. This page gives a score and automatic fixes for identifiers and names. For coordination, use Solibri.'],
      ],
      faqSources: ['solibriWebchecker'],
      bottom: ['Run a web check now', 'No plan, no tokens, no upload.'],
    },

    // ─────────────────────────────────────────────────────────────────────────
    mac: {
      title: 'IFC Viewer for Mac — Free, No Install, Runs in Safari',
      desc: 'Open IFC files on a Mac in Safari, Chrome or Firefox: 3D view, properties, sections, measuring and validation. Nothing to install, no account, free.',
      nav: 'IFC Viewer for Mac',
      kicker: 'macOS · Safari, Chrome, Firefox, Edge · Nothing to install · Free',
      h1: ['IFC Viewer for Mac', 'that runs in the browser you already have'],
      lead: 'There is no app to download: the viewer is a web page. Open it in Safari or Chrome on macOS, drop an IFC file and you get the 3D model, the spatial tree, the properties of each element, sections, measurements and a validation report. The file is not uploaded.',
      cta: 'Open the viewer',
      cta2: 'or open the sample model',
      note: 'No account. IFC2x3, IFC4, IFC4x1 and IFC4x3, up to 2 GB per file.',
      shots: [
        { alt: 'IFC viewer in a 1440 by 900 browser window, the size of a MacBook screen: a two-storey house in 3D, the spatial tree on the left and the IFC attributes and property sets of a selected wall on the right', cap: 'The viewer in a 1440 × 900 window, the default size of a MacBook Air screen (captured in Chrome). On the right, the attributes and property sets of the selected wall.' },
        { alt: 'Section plane cutting an IFC model of a house in the browser viewer, with the furniture inside visible, in a 1440 by 900 window', cap: 'A section plane through the same model, moved with the slider or by dragging it in the view. No plug-in is involved.' },
      ],
      sections: [
        {
          kind: 'cols', label: 'On a Mac', h2: 'What works on macOS, and what to expect',
          cols: [
            { h: 'It works', items: [
              'In Safari, Chrome, Firefox and Edge on macOS. The page needs WebGL and WebAssembly, which those browsers include.',
              'Opening .ifc files, and .ifczip or .zip archives, by dragging them into the window or with the Open button.',
              'Several models at once, each with its own tree and properties.',
              'On an iPad or iPhone too, with smaller files.',
            ] },
            { h: 'Keep in mind', items: [
              'It is not a macOS application: no Dock icon, no Quick Look preview, and .ifc files do not open with a double click.',
              'The page has to load from the internet. It does not work offline.',
              'The file-size limit is 2 GB, and in practice the memory of the Mac: a warning appears from 1 GB, or from 80 MB on machines with 4 GB of memory or less and on iPad and iPhone.',
              'The captures on this page were made in Chrome. If something looks wrong in Safari, try Chrome.',
            ] },
          ],
        },
        {
          kind: 'cols', label: 'Tools', h2: 'What you can do with a model',
          cols: [
            { h: 'Look', items: [
              'Orbit, pan and zoom; hide and isolate elements; browse the spatial tree.',
              'Section planes and 2D floor plans cut from the model, exported as DXF, SVG or PDF.',
              'Measure distances, areas, angles and clearances.',
              'Read every property set and the quantities written in the file.',
            ] },
            { h: 'Check and fix', items: [
              'A validation with 44 rules and a Health Score from 0 to 100; see the [IFC validator](validator).',
              'IDS 1.0 checks against your own requirements.',
              'Edit names and property values, fix GlobalIds, and export the corrected IFC or a GLB.',
              'Open and write BCF 2.1 and 3.0 files.',
            ] },
          ],
        },
        {
          kind: 'table', label: 'Comparison', h2: 'Other ways to open an IFC on a Mac',
          sub: 'Flinker is the other free browser viewer we are asked about. Its column says what Flinker publishes.',
          head: ['', 'Flinker', 'IFC Viewer Online'],
          rows: [
            ['What it is', '"The IFC viewer for Microsoft": SharePoint, Teams, Excel, Power BI, Windows and the browser', 'A viewer, validator and editor in a web page'],
            ['On a Mac', 'The browser viewer. The desktop app is for Windows; the site does not mention macOS', 'Any current browser on macOS'],
            ['To start', '"Open a model without creating an account"', 'No account'],
            ['Formats', 'IFC 2x3, 4 and 4x3; BCF 2.1 and 3.0; IDS 1.0; DXF; PDF overlay', 'IFC2x3, IFC4, IFC4x1 and IFC4x3; BCF 2.1 and 3.0; IDS 1.0'],
            ['The file', 'Parsed in the browser; stays on the device or in the Microsoft storage you choose', 'Read in the browser; not uploaded'],
            ['Checking', 'IDS requirement checks with pass and fail highlighting', '44 rules with a Health Score, plus IDS'],
            ['Price', 'Community: free. Enterprise: priced per deployment', 'Free'],
          ],
          after: [
            'Choose Flinker when your projects already live in SharePoint and Teams: opening the model next to the documents is what it is built for, and this viewer does not connect to Microsoft 365.',
            'Choose IFC Viewer Online when you also want to know whether the model is good: the validation, the score and the fixes are the difference.',
            'About Solibri: the product pages we read on the same day do not state which operating systems its plans run on, so we do not say. Check Solibri\'s system requirements before buying for a Mac.',
          ],
          sources: ['flinkerViewer', 'solibriPricing'],
        },
        { kind: 'shot', label: 'Try it', h2: 'Open the sample model', sub: 'The demo below runs in this page, in the browser you are using now.' },
        {
          kind: 'text', label: 'Price', h2: 'What it costs',
          ps: [
            'Nothing. There is no licence, no trial period and no account. The code is public under the MIT licence on [GitHub](github). Paid plans that add a server are on the [pricing page](pricing) and are not on sale yet.',
          ],
        },
      ],
      faq: [
        ['Is there an IFC viewer for Mac that needs no installation?', 'Yes: this one is a web page. Open it in Safari, Chrome, Firefox or Edge on macOS and drop the file. There is nothing to download or install.'],
        ['Does it work in Safari?', 'Yes. It needs WebGL and WebAssembly, which current versions of Safari include. The captures on this page were made in Chrome, so try Chrome if a model does not display well.'],
        ['Is the IFC uploaded when I open it?', 'No. The file is read by code running in the browser tab. Only anonymous usage statistics (file size and element count) leave the browser, and they can be switched off.'],
        ['Can I open Revit or Archicad files?', 'No, only IFC. Export an IFC from the authoring tool first.'],
        ['Does it work offline on a Mac?', 'No. The page has to load from the internet each time, although the model itself is never sent.'],
        ['Is Flinker available for Mac?', 'Flinker\'s viewer runs in the browser, so it can be used on a Mac that way; its desktop app is published for Windows and its site does not mention macOS (flinker.app/products/ifc-viewer, read on 2026-11-10).'],
      ],
      faqSources: ['flinkerViewer'],
      bottom: ['Open an IFC on your Mac', 'In the browser, free, with nothing to install.'],
    },
  },
}
