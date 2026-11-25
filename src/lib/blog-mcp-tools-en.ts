import type { BlogPost } from './blog-posts'
import { integrationsPath } from './integrations/integrations-paths.ts'
import { fixGuidePath } from './fix-guide-url.ts'

// Three posts written on 2026-11-25 about the local MCP server in mcp/
// (npm ifc-viewer-mcp@1.0.0), for people who want checks on their own machine:
//
// 1. validate-ifc-locally-no-upload — BIM coordinators under confidentiality
//    clauses: validate_ifc + list_validation_rules, reading the answer, /fix/.
// 2. ids-check-local-workflow — check_ids on every delivery, EIR → IDS, the
//    result in 3D with open_in_3d_viewer. Ends in the EIR-template offer.
// 3. ifc-mcp-tools-reference — reference for the ten tools, inputs and outputs.
//
// Framing rule (AGENTS.md: not an "AI product"): the protocol is named once as
// an open standard; the value is local, free, no upload, same engine as the web
// validator. The install guide is the existing post
// ifc-mcp-server-claude-bim-3d-viewer, linked, not repeated.
//
// Every tool name and argument below is checked against mcp/src/tools.ts.
// Same pattern as blog-leads-en.ts: structure here, words in a table; the nine
// translations are in blog-i18n/mcp-tools-<lang>.ts. Topic CTAs and the end
// lead form come from Blog.tsx (D-38).

const DATE = '2026-11-25'
const INSTALL_POST = 'ifc-mcp-server-claude-bim-3d-viewer'
const SDK_DOCS_PATH = (lang: string) => (lang === 'en' ? '/sdk/' : `/sdk/${lang}/`)
const NPM = 'https://www.npmjs.com/package/ifc-viewer-mcp'
const SOURCE = 'https://github.com/j03rul4nd/ifc-viewer-online/tree/main/mcp'

const CONFIG = `{
  "mcpServers": {
    "ifc-viewer": { "command": "npx", "args": ["-y", "ifc-viewer-mcp"] }
  }
}`

const VALIDATE_CALL = `validate_ifc
{
  "source": "D:/projects/tower/ARC-tower.ifc",
  "maxIssues": 30
}`

const RULES_CALL = `list_validation_rules
{}

validate_ifc
{
  "source": "D:/projects/tower/ARC-tower.ifc",
  "rules": ["RULE_EMPTY_NAME", "RULE_DUPLICATE_GUID", "RULE_MISSING_STOREY", "RULE_ISO19650_FILENAME"]
}`

const IDS_CALL = `check_ids
{
  "ifc": "D:/deliveries/2026-11-24/ARC-tower.ifc",
  "ids": "D:/project-standards/EIR-architecture.ids",
  "maxFailures": 10
}`

const VIEW_CALL = `open_in_3d_viewer
{
  "models": ["https://files.example.com/deliveries/ARC-tower.ifc"],
  "isolate": "IfcWall",
  "view": "iso",
  "ui": "client"
}`

const REFERENCE_CALLS = `read_dxf
{ "source": "D:/drawings/ground-floor.dxf", "maxTexts": 50 }

read_fiware_entities
{ "broker": "https://orion.example.com:1026", "api": "ld", "type": "AirQualityObserved", "limit": 20 }

search_port_library
{ "query": "bollard", "limit": 10 }

open_drawings
{ "models": ["https://files.example.com/ARC-tower.ifc"], "lang": "en" }`

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
export type McpToolsText = {
  lang?: string
  validationCategory: string
  toolsCategory: string
  /** Link text for the /integrations/ page. */
  integrationsLink: string
  /** Link text for the install guide (the existing MCP post). */
  installLink: string
  local: Meta & {
    intro1: string
    intro2: string
    takeaways: string[]
    whyH: string
    why1: string
    why2: string
    installH: string
    installBefore: string
    installAfter: string
    run1: string
    run2: string
    readH: string
    readTable: Table
    rulesH: string
    rules1: string
    rules2: string
    fixH: string
    fixBefore: string
    fixLink: string
    fixAfter: string
    privacyTitle: string
    privacy: string
    nextBefore: string
    nextAfter: string
    relInstall: string
    relBrowser: string
    relBatch: string
    toolWhy: string
  }
  ids: Meta & {
    intro1: string
    intro2: string
    takeaways: string[]
    eirH: string
    eir1: string
    eir2: string
    callH: string
    call1: string
    call2: string
    resultH: string
    resultTable: Table
    routineH: string
    routineSteps: Array<{ title: string; body: string }>
    viewH: string
    view1: string
    view2: string
    offerTitle: string
    offer: string
    nextBefore: string
    nextAfter: string
    relIds: string
    relDelivery: string
    relInstall: string
    toolWhy: string
  }
  ref: Meta & {
    intro1: string
    intro2: string
    takeaways: string[]
    installH: string
    installBefore: string
    installAfter: string
    tableH: string
    table: Table
    checksH: string
    checks1: string
    dataH: string
    data1: string
    examples1: string
    viewerH: string
    viewer1: string
    limitsH: string
    limitsList: string[]
    sourceTitle: string
    sourceBefore: string
    sourceAfter: string
    nextBefore: string
    docsLink: string
    nextMiddle: string
    nextAfter: string
    relInstall: string
    relDrawings: string
    relIds: string
    toolWhy: string
  }
}

const base = (t: McpToolsText, slug: string, m: Meta, readTimeMin: number, category: string, categorySlug: string, hero: string) => ({
  slug,
  title: m.title,
  seoTitle: m.seoTitle,
  seoDescription: m.seoDescription,
  excerpt: m.excerpt,
  date: DATE,
  dateModified: DATE,
  author: 'IFC Viewer Online',
  category,
  categorySlug,
  readTimeMin,
  heroImage: `blog/images/${hero}-1600x900.jpg`,
  heroAlt: m.heroAlt,
  heroCredit: 'IFC Viewer Online',
  keywords: m.keywords,
  faqs: m.faqs,
  ...(t.lang ? { lang: t.lang, translationKey: slug } : {}),
})

/** The three posts in the language of `t`. */
export function buildMcpToolsPosts(t: McpToolsText): BlogPost[] {
  const l = t.local
  const d = t.ids
  const r = t.ref
  const lang = t.lang ?? 'en'
  const integrations = { text: t.integrationsLink, href: integrationsPath(lang) }
  const install = { text: t.installLink, to: INSTALL_POST }
  const ref = 'ifc-mcp-tools-reference'
  const cjk = lang === 'zh' || lang === 'ja' || lang === 'th'
  const stop = lang === 'th' ? '' : cjk ? '。' : '.'
  return [
    {
      ...base(t, 'validate-ifc-locally-no-upload', l, 6, t.validationCategory, 'validation', 'validate-ifc-locally-no-upload'),
      references: [{ id: 'npm', title: 'ifc-viewer-mcp', source: 'npm', year: '2026', url: NPM }],
      content: [
        { type: 'p', text: l.intro1 },
        { type: 'p', text: l.intro2 },
        { type: 'takeaways', items: l.takeaways },
        { type: 'h2', text: l.whyH },
        { type: 'p', text: l.why1 },
        { type: 'p', text: l.why2 },
        { type: 'h2', text: l.installH },
        { type: 'p', text: [l.installBefore, install, l.installAfter] },
        { type: 'code', lang: 'json', text: CONFIG },
        { type: 'p', text: l.run1 },
        { type: 'code', lang: 'json', text: VALIDATE_CALL },
        { type: 'p', text: l.run2 },
        { type: 'h2', text: l.readH },
        { type: 'table', headers: l.readTable.headers, rows: l.readTable.rows, caption: l.readTable.caption },
        { type: 'h2', text: l.rulesH },
        { type: 'p', text: l.rules1 },
        { type: 'code', lang: 'json', text: RULES_CALL },
        { type: 'p', text: l.rules2 },
        { type: 'h2', text: l.fixH },
        { type: 'p', text: [l.fixBefore, { text: l.fixLink, href: `/${fixGuidePath('RULE_EMPTY_NAME', lang)}` }, l.fixAfter] },
        { type: 'callout', variant: 'info', title: l.privacyTitle, text: l.privacy },
        { type: 'p', text: [l.nextBefore, integrations, l.nextAfter] },
        { type: 'related', to: INSTALL_POST, why: l.relInstall },
        { type: 'related', to: 'browser-vs-cloud-ifc-validation', why: l.relBrowser },
        { type: 'related', to: 'batch-validate-ifc-files', why: l.relBatch },
        { type: 'tool', id: 'fix-guides', why: l.toolWhy },
      ],
    },
    {
      ...base(t, 'ids-check-local-workflow', d, 6, t.validationCategory, 'validation', 'ids-check-local-workflow'),
      content: [
        { type: 'p', text: d.intro1 },
        { type: 'p', text: d.intro2 },
        { type: 'takeaways', items: d.takeaways },
        { type: 'h2', text: d.eirH },
        { type: 'p', text: d.eir1 },
        { type: 'p', text: d.eir2 },
        { type: 'h2', text: d.callH },
        { type: 'p', text: [`${d.call1}${cjk ? '' : ' '}`, install, stop] },
        { type: 'code', lang: 'json', text: IDS_CALL },
        { type: 'p', text: d.call2 },
        { type: 'h2', text: d.resultH },
        { type: 'table', headers: d.resultTable.headers, rows: d.resultTable.rows, caption: d.resultTable.caption },
        { type: 'h2', text: d.routineH },
        { type: 'steps', items: d.routineSteps },
        { type: 'h2', text: d.viewH },
        { type: 'p', text: d.view1 },
        { type: 'code', lang: 'json', text: VIEW_CALL },
        { type: 'p', text: d.view2 },
        { type: 'callout', variant: 'tip', title: d.offerTitle, text: d.offer },
        { type: 'p', text: [d.nextBefore, integrations, d.nextAfter] },
        { type: 'related', to: 'ids-information-delivery-specification-guide', why: d.relIds },
        { type: 'related', to: 'how-to-check-ifc-model-before-delivery', why: d.relDelivery },
        { type: 'related', to: INSTALL_POST, why: d.relInstall },
        { type: 'tool', id: 'viewer', why: d.toolWhy },
      ],
    },
    {
      ...base(t, ref, r, 7, t.toolsCategory, 'tools', ref),
      references: [
        { id: 'npm', title: 'ifc-viewer-mcp 1.0.0', source: 'npm', year: '2026', url: NPM },
        { id: 'source', title: 'mcp/src/tools.ts', source: 'GitHub', year: '2026', url: SOURCE },
      ],
      content: [
        { type: 'p', text: r.intro1 },
        { type: 'p', text: r.intro2 },
        { type: 'takeaways', items: r.takeaways },
        { type: 'h2', text: r.installH },
        { type: 'p', text: [r.installBefore, install, r.installAfter] },
        { type: 'code', lang: 'json', text: CONFIG },
        { type: 'h2', text: r.tableH },
        { type: 'table', headers: r.table.headers, rows: r.table.rows, caption: r.table.caption },
        { type: 'h2', text: r.checksH },
        { type: 'p', text: r.checks1 },
        { type: 'h2', text: r.dataH },
        { type: 'p', text: r.data1 },
        { type: 'p', text: r.examples1 },
        { type: 'code', lang: 'json', text: REFERENCE_CALLS },
        { type: 'h2', text: r.viewerH },
        { type: 'p', text: r.viewer1 },
        { type: 'h2', text: r.limitsH },
        { type: 'ul', items: r.limitsList },
        { type: 'callout', variant: 'info', title: r.sourceTitle, text: [r.sourceBefore, { text: 'mcp/src/tools.ts', href: SOURCE }, r.sourceAfter] },
        {
          type: 'p',
          text: [r.nextBefore, { text: r.docsLink, href: SDK_DOCS_PATH(lang) }, r.nextMiddle, { text: t.integrationsLink, href: `${integrationsPath(lang)}#mcp` }, r.nextAfter],
        },
        { type: 'related', to: INSTALL_POST, why: r.relInstall },
        { type: 'related', to: 'open-dxf-pdf-plans-next-to-ifc-model-online', why: r.relDrawings },
        { type: 'related', to: 'ids-information-delivery-specification-guide', why: r.relIds },
        { type: 'tool', id: 'sdk', why: r.toolWhy },
      ],
    },
  ]
}

const EN: McpToolsText = {
  validationCategory: 'Validation',
  toolsCategory: 'Tools & comparisons',
  integrationsLink: 'all our integrations',
  installLink: 'the install guide',
  local: {
    title: 'Validate IFC files locally, without uploading them anywhere',
    seoTitle: 'Validate IFC files locally, without uploading them',
    seoDescription: 'Run the same IFC Health Score as the web validator on your own machine. Free, open source, nothing uploaded: for projects under confidentiality clauses.',
    excerpt: 'Your contract says the model does not leave the company network. You still need to know whether it is fit to deliver. The ifc-viewer-mcp package runs the same checks and the same Health Score as our web validator, on your own computer.',
    heroAlt: 'An IFC model in the viewer with its Health Score and the list of validation issues',
    keywords: ['validate IFC locally', 'IFC validation without upload', 'offline IFC checker', 'IFC Health Score local', 'confidential BIM model validation', 'ifc-viewer-mcp'],
    faqs: [
      { q: 'Is the file sent anywhere?', a: 'No. With a local path, the file is read from your disk and checked in Node.js on your machine. Only if you give an http(s) address does the tool download the file from that address.' },
      { q: 'Is the score the same as on the website?', a: 'Yes. The package bundles the web viewer\'s own validator and scoring code, so the same file with the same rules gets the same Health Score and issue counts.' },
      { q: 'What does it cost?', a: 'Nothing. ifc-viewer-mcp is open source under the MIT licence, needs no account and no API key, and runs with npx on Node.js 20 or later.' },
    ],
    intro1: 'Many projects come with a confidentiality clause: models stay on the company network, and online tools that upload files are not allowed. That is a sensible rule, and it leaves the BIM coordinator checking models by eye, or not at all.',
    intro2: 'Our web validator already works without uploading: it reads the file in the browser. ifc-viewer-mcp goes one step further and runs the same checks as a small program on your own computer, from the desktop tools you already use, with no browser tab involved.',
    takeaways: [
      'Same rules and same Health Score (0–100) as the web validator.',
      'A local path is read from disk; nothing is uploaded.',
      'list_validation_rules shows every rule; validate_ifc can run only the ones you choose.',
      'Every costly rule comes with a link to its fix guide.',
      'Free, MIT licence, no account: npx -y ifc-viewer-mcp.',
    ],
    whyH: 'Why check on your own machine',
    why1: 'Confidentiality clauses rarely say "no browser". They say the file must not be sent to a third party. A validator that reads the file locally is fine; one that uploads it to a server is not, however good its privacy policy.',
    why2: 'Running locally has a second benefit: it is repeatable. The same command on the same file gives the same answer, so you can run it on every export, keep the result next to the file, and compare it with the next delivery.',
    installH: 'Set it up once',
    installBefore: 'ifc-viewer-mcp speaks the Model Context Protocol (MCP), an open standard for connecting desktop tools to local data. Any MCP-compatible client starts it with the same command and arguments; ',
    installAfter: ' has the exact steps for each client.',
    run1: 'Then validate a file by its path. maxIssues sets how many issues are listed; the counts always cover all of them:',
    run2: 'The file is read from that path, parsed with web-ifc and checked against the default rules. A large model takes as long as it does in the browser, because it is the same engine.',
    readH: 'How to read the answer',
    readTable: {
      headers: ['Field', 'What it tells you'],
      rows: [
        ['healthScore', 'The score from 0 to 100, higher is better'],
        ['verdict', 'good from 90, needs work from 70, poor below 70'],
        ['stats', 'Total issues, errors and warnings'],
        ['costliestRules', 'The rules that cost the most points, each with a fixGuide link'],
        ['issues', 'The first issues: rule, severity, message, element and GlobalId'],
        ['moreIssues', 'How many issues were not listed because of maxIssues'],
        ['openInViewer', 'Where to see the issues in 3D: drop the file on the viewer page'],
      ],
      caption: 'The fields validate_ifc returns, from mcp/src/tools.ts.',
    },
    rulesH: 'Choose the rules',
    rules1: 'list_validation_rules returns every rule with its id, category, severity, standard and whether it is on by default. Pass a list of ids to validate_ifc to run only those:',
    rules2: 'A project with its own naming convention can run the naming and ISO 19650 rules on every export and keep the full check for milestones. Use the same list each time so the scores stay comparable.',
    fixH: 'From the result to the fix',
    fixBefore: 'Each entry in costliestRules has a fixGuide link: a page that explains what the rule checks, why it matters, and how to fix it at the source. For example, ',
    fixLink: 'the guide for empty names',
    fixAfter: '. Fix it in the authoring tool, export again and run the same check.',
    privacyTitle: 'What leaves your machine',
    privacy: 'With a local path, nothing. The tool only uses the network when you give it an http(s) address, to download that file. The viewer links it returns are plain addresses: they open only if you click them.',
    nextBefore: 'Other ways to use the same engine, from WordPress to the SDK, are on the page with ',
    nextAfter: '.',
    relInstall: 'The install guide for each client, with example requests.',
    relBrowser: 'Why browser and local validation are different from cloud validation.',
    relBatch: 'Checking a whole folder of IFC files in one go.',
    toolWhy: 'Every rule has its own fix guide, in ten languages.',
  },
  ids: {
    title: 'Check IDS requirements on every delivery, without opening a viewer',
    seoTitle: 'Check IDS requirements on every IFC delivery, locally',
    seoDescription: 'Turn your EIR into an IDS file and check every IFC delivery against it on your own machine with check_ids. Free, repeatable, no upload; open failures in 3D.',
    excerpt: 'An EIR that only lives in a PDF gets checked by hand, if at all. Written as an IDS file, it can be checked on every delivery with one command on your own machine, and the failing elements opened in 3D when you need to see them.',
    heroAlt: 'An IDS check result listing specifications that passed and failed, next to the model in 3D',
    keywords: ['IDS check IFC', 'check IFC against IDS locally', 'IDS validation workflow', 'EIR to IDS', 'IFC delivery check', 'ifc-viewer-mcp check_ids'],
    faqs: [
      { q: 'Which IDS version does it read?', a: 'IDS 1.0, the buildingSMART Information Delivery Specification. Facets the engine cannot evaluate are listed as unsupported for that specification instead of being silently skipped.' },
      { q: 'Is the IFC or the IDS uploaded?', a: 'No. Both are read from disk when you give local paths. Only an http(s) address makes the tool download that file.' },
      { q: 'Can I pass the IDS as text?', a: 'Yes. The ids argument takes a path, a public URL, or the IDS XML itself.' },
    ],
    intro1: 'Most exchange requirements are written in a PDF: which classes need which properties, which classification, which naming. Checking them by hand on every delivery takes hours, so in practice it happens at milestones, and errors pile up in between.',
    intro2: 'IDS is the buildingSMART format for writing those requirements so software can check them. With ifc-viewer-mcp, the check runs on your own machine with one command, so it can run on every delivery, not only the important ones.',
    takeaways: [
      'Write the EIR once as an IDS file; check every delivery against it.',
      'check_ids runs locally: pass/fail per specification and the failing elements.',
      'Same command, same file, same answer: easy to repeat and to compare.',
      'Open the failing class in 3D with open_in_3d_viewer when you need to see it.',
    ],
    eirH: 'From the EIR to an IDS file',
    eir1: 'An IDS file is a list of specifications. Each one says which elements it applies to (for example, every IfcWall) and what they must have (a FireRating in Pset_WallCommon, a classification code, a name pattern).',
    eir2: 'Start with the requirements that cause the most rework: the properties the cost plan or the facility manager needs, and the classification. Ten well-chosen specifications checked every week are worth more than a hundred checked once.',
    callH: 'One command per delivery',
    call1: 'Give check_ids the delivered IFC and your IDS. If the package is not set up yet, see',
    call2: 'ifc and ids each take a local path or a public URL; ids can also be the XML text itself. maxFailures sets how many failures are listed per specification (10 by default).',
    resultH: 'What comes back',
    resultTable: {
      headers: ['Field', 'What it tells you'],
      rows: [
        ['score', 'The overall result of the check'],
        ['totalSpecs, passedSpecs, failedSpecs, notApplicable', 'How the specifications came out'],
        ['specifications[].status', 'Pass or fail for each specification'],
        ['applicable, passed, failed', 'How many elements each specification applied to, and how many met it'],
        ['failures', 'The first failing elements, with the reason'],
        ['unsupported', 'Facets the engine could not evaluate, if any'],
      ],
      caption: 'The fields check_ids returns, from mcp/src/tools.ts.',
    },
    routineH: 'A routine for every delivery',
    routineSteps: [
      { title: 'Keep one IDS per discipline', body: 'Store it with the project standards, under version control, so everyone checks against the same file.' },
      { title: 'Run check_ids on arrival', body: 'Check each delivered IFC against its IDS before it goes into the federated model.' },
      { title: 'Send back the failures', body: 'The specification name and the failing elements are enough for the author to fix them at the source.' },
      { title: 'Compare with the previous delivery', body: 'Keep the results next to the files; failedSpecs should go down from one delivery to the next.' },
    ],
    viewH: 'See the failures in 3D',
    view1: 'When a list is not enough, open the model with the failing class isolated. open_in_3d_viewer returns a link and an iframe for one or more public IFC files:',
    view2: 'The viewer downloads the file itself, so the address must be public and allow cross-origin requests. For a confidential model, open the viewer page and drop the file on it: it is read in the browser, not uploaded.',
    offerTitle: 'Want this applied to your own EIR template?',
    offer: 'Send us your EIR or information requirements template with the form at the end of this page. We will tell you which parts can be written as IDS and checked on every delivery, and which cannot.',
    nextBefore: 'Every other way to use the viewer and its checks is on the page with ',
    nextAfter: '.',
    relIds: 'What IDS is, facet by facet, with examples.',
    relDelivery: 'The full pre-delivery checklist, beyond IDS.',
    relInstall: 'Install the package in your client, step by step.',
    toolWhy: 'Open the delivered model and look at the failing elements.',
  },
  ref: {
    title: 'ifc-viewer-mcp: reference for the 10 tools',
    seoTitle: 'ifc-viewer-mcp: reference for the 10 tools',
    seoDescription: 'Every ifc-viewer-mcp tool with its input, its output and an example: IFC validation, IDS, DXF, FIWARE, the Port de Barcelona library and digital twins.',
    excerpt: 'The ten tools in ifc-viewer-mcp 1.0.0, with their arguments, what they return, where they run and an example of each kind. Taken from the server source, mcp/src/tools.ts.',
    heroAlt: 'A floor plan cut from an IFC model in the drawings pane, beside the 3D view',
    keywords: ['ifc-viewer-mcp', 'IFC MCP tools reference', 'MCP server IFC tools', 'validate_ifc check_ids', 'MCP DXF FIWARE', 'Model Context Protocol IFC'],
    faqs: [
      { q: 'Which tools use the network?', a: 'read_fiware_entities calls the broker you name, and validate_ifc, check_ids and read_dxf download a file only when you give an http(s) address. The viewer tools only build links.' },
      { q: 'Can the viewer tools open a local file?', a: 'No. The browser has to download the model, so open_in_3d_viewer and open_drawings take public URLs. For a local file, open the viewer page and drop the file on it.' },
      { q: 'Is there a size limit?', a: 'Files downloaded from a URL are limited to 512 MB.' },
    ],
    intro1: 'ifc-viewer-mcp is a free, open-source server with ten tools for IFC work. Four read files on your machine, one reads a FIWARE broker, one searches a bundled object library, and four build links that open the free browser viewer.',
    intro2: 'This page lists all ten with their arguments and what they return. It follows version 1.0.0 and the server source; if a tool changes, the source is the authority.',
    takeaways: [
      'Ten tools: validation, IDS, DXF, FIWARE, a port object library, and viewer links.',
      'validate_ifc, check_ids and read_dxf read local files; nothing is uploaded.',
      'Viewer tools take public URLs and return a link, plus an iframe for open_in_3d_viewer.',
      'MIT licence, no account, Node.js 20 or later.',
    ],
    installH: 'Install',
    installBefore: 'Every MCP client takes the same command and arguments. The client-by-client steps are in ',
    installAfter: '.',
    tableH: 'The ten tools',
    table: {
      headers: ['Tool', 'Input', 'Output', 'Runs'],
      rows: [
        ['validate_ifc', 'source, maxIssues (30), rules', 'Health Score, verdict, issue counts, costliest rules with fix guides, issues', 'Local'],
        ['list_validation_rules', 'none', 'Every rule: id, label, category, severity, standard, on by default', 'Local'],
        ['check_ids', 'ifc, ids (path, URL or XML), maxFailures (10)', 'Pass/fail per specification, element counts, failures', 'Local'],
        ['read_dxf', 'source, maxTexts (50)', 'Version, units, layers with entity counts, entity types, extents, texts', 'Local'],
        ['read_fiware_entities', 'broker, api (ld/v2), type, tenant, servicePath, context, limit (20)', 'Entities as flat records: id, type, values with units, lat/lon, observedAt', 'Your machine → broker'],
        ['search_port_library', 'query, category, limit (20)', 'Port de Barcelona objects with IFC download and viewer link (CC BY 4.0)', 'Local'],
        ['open_in_3d_viewer', 'models, view, map, isolate, ui, validate, scans, lang', 'Viewer link and iframe', 'Browser'],
        ['open_drawings', 'models, lang', 'Viewer link with a floor plan cut beside the model', 'Browser'],
        ['open_3d_sketch', 'none', 'Link to the 3D sketch studio, and its two-pane version', 'Browser'],
        ['list_digital_twins', 'none', 'City twins (Barcelona, Helsinki, Tokyo) with links, and the twin builder', 'Browser'],
      ],
      caption: 'Defaults in brackets. From mcp/src/tools.ts, ifc-viewer-mcp 1.0.0.',
    },
    checksH: 'Checks: validate_ifc, list_validation_rules, check_ids',
    checks1: 'These three bundle the web viewer\'s own validator and IDS engine, so results match what the browser shows for the same file. validate_ifc returns the Health Score from 0 to 100; rules takes rule ids from list_validation_rules. check_ids reads IDS 1.0 and lists facets it cannot evaluate as unsupported.',
    dataH: 'Data: DXF, FIWARE and the port library',
    data1: 'read_dxf summarises an ASCII DXF from R12 onwards; a DWG is detected and refused with a message, so save it as DXF first. read_fiware_entities reads Orion, Orion-LD, Scorpio or Stellio over NGSI-LD or NGSIv2 and returns the same flat records the viewer\'s twin panel binds to IFC elements; it is the only tool that talks to an outside server, and only to the broker you name. search_port_library searches the Port de Barcelona BIM library by words and category.',
    examples1: 'Examples of the arguments, one call each:',
    viewerH: 'Viewer links: models, drawings, sketches and twins',
    viewer1: 'open_in_3d_viewer builds a link for one or more public IFC files (several load as one federated scene) with an optional camera view, map placement, isolated class, interface preset, validation and point clouds, plus an iframe to embed the same view. open_drawings opens the drawings pane with a plan cut from the model. open_3d_sketch and list_digital_twins return links. None of them opens a window by itself.',
    limitsH: 'Limits worth knowing',
    limitsList: [
      'Viewer tools need public URLs whose host allows cross-origin requests (CORS).',
      'Files downloaded from a URL are limited to 512 MB.',
      'read_dxf does not read DWG.',
      'NGSI-LD queries to read_fiware_entities need an entity type.',
    ],
    sourceTitle: 'Where this comes from',
    sourceBefore: 'Names, arguments and defaults are taken from ',
    sourceAfter: ' at version 1.0.0. If a later version differs, the source wins.',
    nextBefore: 'To put the viewer inside your own web app instead, see the ',
    docsLink: 'SDK reference',
    nextMiddle: '. The package is also listed on the page with ',
    nextAfter: '.',
    relInstall: 'Install guide and example requests for each client.',
    relDrawings: 'What the drawings pane does with DXF and PDF plans.',
    relIds: 'IDS explained, for writing the files check_ids reads.',
    toolWhy: 'Embedding the viewer in a web app? The SDK reference.',
  },
}

export const MCP_TOOLS_POSTS_EN: BlogPost[] = buildMcpToolsPosts(EN)
