// ─── Blog posts ───────────────────────────────────────────────────────────────
// Content data — no JSX, no imports. All visual rendering lives in Blog.tsx.

export type ContentBlock =
  | { type: 'p'; text: string }
  | { type: 'h2'; text: string }
  | { type: 'h3'; text: string }
  | { type: 'ul'; items: string[] }
  | { type: 'ol'; items: string[] }
  | { type: 'code'; text: string; lang?: string }
  | { type: 'callout'; variant: 'tip' | 'warning' | 'info'; text: string }
  | { type: 'image'; src: string; alt: string; caption?: string }
  | { type: 'ifc-demo'; modelId: string; title: string; description: string; schema: string; size: string }
  | { type: 'stat-row'; stats: Array<{ value: number; suffix?: string; prefix?: string; label: string }> }
  | { type: 'feature-grid'; items: Array<{ icon: string; title: string; body: string }> }
  | { type: 'comparison'; left: { label: string; color: string; items: string[] }; right: { label: string; color: string; items: string[] } }

export interface BlogPost {
  slug: string
  title: string
  excerpt: string
  date: string
  readTimeMin: number
  category: string
  categorySlug: string
  author: string
  featured?: boolean
  heroImage?: string
  content: ContentBlock[]
}

// ─── Posts ────────────────────────────────────────────────────────────────────

export const BLOG_POSTS: BlogPost[] = [

  // ── Post 1 — FEATURED ──────────────────────────────────────────────────────

  {
    slug: 'view-ifc-online-free',
    title: 'View IFC Files in Your Browser — Free, No Installation',
    excerpt: "You're 20 minutes from a client call and just received a 200 MB IFC file. No Revit, no Navisworks, no BIM software. Here's how to open, inspect, and validate it before the call ends.",
    date: '2026-06-02',
    readTimeMin: 6,
    category: 'Tool Guides',
    categorySlug: 'tool-guides',
    author: 'IFC Viewer Team',
    featured: true,
    heroImage: 'hero-building',
    content: [
      {
        type: 'stat-row',
        stats: [
          { value: 38, suffix: '', label: 'validation rules' },
          { value: 0,  suffix: ' bytes', label: 'uploaded to server' },
          { value: 100, suffix: '%', label: 'runs in browser' },
          { value: 13, suffix: '', label: 'demo IFC models' },
        ],
      },
      { type: 'p', text: "IFC files are the lingua franca of open BIM — but they're also notoriously hard to open without a dedicated workstation and £5,000 of software. Most online 'IFC viewers' either upload your file to a server (a non-starter for sensitive project data) or choke on anything larger than 10 MB." },
      { type: 'p', text: "This viewer parses IFC files entirely in your browser using WebAssembly. Your geometry never leaves your device. You can open a 200 MB file on an airplane with Wi-Fi off." },
      {
        type: 'feature-grid',
        items: [
          { icon: '🔒', title: 'Private by design', body: "Files are parsed client-side via web-ifc WASM. Zero bytes reach any server. No account required." },
          { icon: '⚡', title: 'Parsed once, cached forever', body: "Geometry is stored in the browser's Origin Private File System. Repeat loads are ~10× faster." },
          { icon: '🌐', title: 'Works offline', body: "Once loaded, the app runs without a network connection. No CDN dependencies at runtime." },
          { icon: '📐', title: '38 validation rules', body: "From duplicate GUIDs to spatial hierarchy violations — every major IFC quality issue surfaced in under 30 seconds." },
        ],
      },
      { type: 'h2', text: 'How to Open an IFC File in 3 Steps' },
      { type: 'ol', items: [
        "Open IFC Viewer in any browser — Chrome, Firefox, Safari, Edge. No extension or plugin needed.",
        "Drag your .ifc file onto the viewer, or click \"Open a file\" and browse to it. Files up to 500 MB work reliably on modern hardware.",
        "The model renders in seconds. Validation runs automatically in a background thread — your Health Score appears in the top-left corner.",
      ]},
      {
        type: 'ifc-demo',
        modelId: 'duplex-architecture',
        title: 'Duplex Apartment — Architecture',
        description: "The classic buildingSMART duplex. A real IFC2x3 residential model with walls, doors, windows, and a complete spatial hierarchy. A good baseline to see what a healthy model looks like.",
        schema: 'IFC2x3',
        size: '2.4 MB',
      },
      { type: 'h2', text: 'What You Can Do Once It\'s Open' },
      { type: 'ul', items: [
        "Navigate the 3D model with orbit, pan, and zoom. Right-click any element for isolation, hiding, and spatial path.",
        "Click any element to see its IFC class, name, type, storey, and full property set.",
        "Switch to Blueprint or X-Ray render modes for detailed inspection.",
        "Open the Validation panel to see all quality issues grouped by rule, with severity levels and per-element details.",
        "Load a second (or third) IFC file to federate models — MEP + structural + architectural in one view.",
        "Export your corrected IFC, a BCF report, or a GLB for web viewing.",
      ]},
      { type: 'callout', variant: 'tip', text: "Keyboard shortcuts: F to frame the selected element, H to hide it, I to isolate it, Shift+H to restore full visibility. Ctrl+Shift+V to run validation." },
      { type: 'h2', text: 'The Health Score' },
      { type: 'p', text: "Every IFC file opened in this viewer receives a Health Score from 0 to 100. It's a single number that summarises the structural and data quality of your model. A score of 87 means 'minor issues, ready for coordination'. A score of 43 means 'serious problems, do not send to the CDE'." },
      { type: 'p', text: "The score is logarithmically weighted by issue severity — one schema error hurts more than 200 naming warnings. It runs entirely in a Web Worker, so it doesn't block your interaction with the 3D view." },
    ],
  },

  // ── Post 2 ─────────────────────────────────────────────────────────────────

  {
    slug: 'ifc-health-score-guide',
    title: 'What Is a BIM Health Check? The IFC Health Score Explained',
    excerpt: "Your project BEP says 'deliver a quality IFC'. Nobody defines what that means until the model gets rejected. An IFC Health Score turns vague quality requirements into a number everyone can track.",
    date: '2026-05-28',
    readTimeMin: 7,
    category: 'BIM Best Practices',
    categorySlug: 'best-practices',
    author: 'IFC Viewer Team',
    content: [
      { type: 'p', text: "In every project I've been involved in, the phrase 'quality IFC delivery' appears in the BEP. In not one of those projects was it clearly defined. Validation would happen manually, inconsistently, or not at all — until a coordination model produced nonsense and someone started digging." },
      { type: 'p', text: "A Health Score changes that. It's a single 0–100 number calculated automatically against 38 validation rules. It's the same number every time, on every machine, on every version of the model. It belongs in your BEP as a hard deliverable requirement." },
      { type: 'h2', text: 'How the Score Is Calculated' },
      { type: 'p', text: "The score starts at 100. Each validation issue subtracts points using a logarithmic decay — the 1,000th duplicate GUID error takes away far fewer points than the 10th, because model quality degrades non-linearly. A model that's fundamentally broken (missing IfcProject, zero structural elements, circular spatial references) collapses to near zero; a model with a few naming inconsistencies stays above 85." },
      {
        type: 'stat-row',
        stats: [
          { value: 3,  suffix: '×', label: 'weight: schema errors' },
          { value: 1,  suffix: '×', label: 'weight: data warnings' },
          { value: 38, suffix: '',  label: 'rules checked' },
          { value: 80, suffix: '+', label: 'target for CDE delivery' },
        ],
      },
      { type: 'h2', text: 'What Each Threshold Means' },
      {
        type: 'feature-grid',
        items: [
          { icon: '🔴', title: 'Score 0–59: Critical', body: "Structural problems that will break downstream tools. Missing IfcProject, orphan elements dominating the model, circular spatial references. Do not deliver." },
          { icon: '🟡', title: 'Score 60–79: Needs Work', body: "Significant data quality issues. Acceptable for internal review; not acceptable for CDE delivery or coordination sessions with other disciplines." },
          { icon: '🟢', title: 'Score 80–89: Delivery Ready', body: "Minor issues that don't affect structural validity. Suitable for standard CDE delivery and design coordination." },
          { icon: '✅', title: 'Score 90–100: Excellence', body: "Clean model. Suitable for LOD 300+ deliveries, ISO 19650 submissions, and procurement-stage BIM." },
        ],
      },
      { type: 'h2', text: "Adding a Health Score Threshold to Your BEP" },
      { type: 'p', text: "A BEP clause costs 50 words to write and prevents weeks of coordination delays. Here's a starting point:" },
      { type: 'code', lang: 'text', text: "IFC deliveries must achieve a minimum Health Score of 80 as validated by [agreed tool] before upload to the CDE. Models below this threshold will be rejected by the Information Manager and returned to the originator for remediation. The validated score must be attached to the transmittal as evidence." },
      { type: 'callout', variant: 'info', text: "Set the threshold in your AIR (Asset Information Requirements) or EIR (Employer Information Requirements), not just the BEP. The EIR is contractual; the BEP is the delivery plan. A threshold in the EIR creates a legally enforceable quality gate." },
      { type: 'h2', text: "Score vs. Issue Count: The Key Difference" },
      { type: 'p', text: "A model with 800 issues can score 81. A model with 12 issues can score 34. The difference is severity. Eight hundred empty name warnings (info level, tiny penalty each) vs twelve missing IfcProject + broken aggregates + circular spatial references (errors, 3× weight each, logarithmic but still severe)." },
      { type: 'p', text: "This is intentional. Optimising for issue count creates perverse incentives — you'd disable the naming rules and look clean. Optimising for a score forces you to fix the things that actually matter." },
    ],
  },

  // ── Post 3 ─────────────────────────────────────────────────────────────────

  {
    slug: 'duplicate-guids-ifc',
    title: 'Duplicate GUIDs in IFC: The Silent Error That Breaks Everything',
    excerpt: "Three weeks into a BCF coordination issue, you realise the comments reference elements that have vanished from the model. The model looks fine. The error: two elements sharing the same GlobalId — and every tool downstream has been silently confused since day one.",
    date: '2026-05-20',
    readTimeMin: 8,
    category: 'Validation',
    categorySlug: 'validation',
    author: 'IFC Viewer Team',
    content: [
      { type: 'h2', text: 'What Is a GlobalId in IFC?' },
      { type: 'p', text: "Every entity in an IFC file that inherits from IfcRoot — which includes every physical element, space, storey, building, and site — has a GlobalId attribute. It's a 22-character string using a custom base-64 alphabet, and it's supposed to be globally unique, stable across revisions, and persistent across software round-trips." },
      {
        type: 'code',
        lang: 'ifc',
        text: `#100 = IFCWALL('3LYa_FRDj3zhLfyYoQv6Jr', $, 'Exterior Wall - 300mm', $, $, #88, #92, $, .NOTDEFINED.);
#101 = IFCDOOR('3LYa_FRDj3zhLfyYoQv6Jr', $, 'Door D001', $, $, #89, #93, $, .NOTDEFINED.);

// Both elements share the same GlobalId — IFC schema violation.`,
      },
      { type: 'p', text: "The IFC spec (ISO 10303-21) forbids duplicate GlobalIds. But the spec can't enforce it — file parsers load whatever they're given. Most parsers don't even check. The result: a structurally valid file that two elements claim as their own." },
      { type: 'h2', text: 'Why Duplicates Happen' },
      { type: 'ul', items: [
        "Revit re-exports: By default, some Revit export configurations regenerate GUIDs on every export. Two exports of the same model produce different GUIDs — then if a third export copies an element from an older file, you get collisions.",
        "Copy-paste in authoring tools: Duplicating a family instance without triggering a GUID refresh — common in ArchiCAD and Vectorworks — produces two elements with identical GlobalIds.",
        "Model merges: Merging two IFC files without checking for GUID collisions between them is a guaranteed way to introduce duplicates, especially if both files were exported from the same source model.",
        "Script-generated GUIDs: Custom export scripts that generate GUIDs using plain UUID (32 hex chars) and truncate to 22 characters without the correct base-64 encoding — producing non-unique strings or invalid format.",
      ]},
      { type: 'h2', text: 'What Duplicate GUIDs Break' },
      {
        type: 'feature-grid',
        items: [
          { icon: '💬', title: 'BCF coordination', body: "BCF issues reference elements by GlobalId. A duplicate means comments attach to whichever element the receiving tool happens to load first — the other element becomes unreachable by reference." },
          { icon: '🔗', title: 'Revit IFC links', body: "Revit's IFC link resolver uses GlobalIds to track element versions across model updates. Duplicates cause elements to randomly switch identity between updates, breaking change-tracking." },
          { icon: '📋', title: 'CDE asset registers', body: "CDEs like ACC and ProjectWise index IFC elements by GlobalId for handover data. Duplicates create phantom assets that appear in the register but can't be located in the model." },
          { icon: '📊', title: 'COBie exports', body: "COBie sheets key facilities management data to IfcSpace and IfcAsset GlobalIds. Duplicate spaces produce duplicate rows in the FM handover package." },
        ],
      },
      { type: 'h2', text: 'How to Detect Duplicate GUIDs' },
      { type: 'p', text: "Run validation before any CDE delivery. The RULE_DUPLICATE_GUID check flags every element that shares a GlobalId with another — and it's auto-fixable, meaning the validator can generate new spec-compliant GUIDs for the duplicates in one click." },
      {
        type: 'ifc-demo',
        modelId: 'duplex-architecture',
        title: 'Validate the Duplex model live',
        description: "Open the buildingSMART duplex in the viewer to see what a clean validation report looks like. Then try opening one of your own project files to check for duplicate GUIDs.",
        schema: 'IFC2x3',
        size: '2.4 MB',
      },
      { type: 'h2', text: 'How to Fix Duplicate GUIDs' },
      { type: 'h3', text: 'Option 1: Auto-fix in the validator' },
      { type: 'p', text: "The IFC Viewer validator marks duplicate GUID issues as auto-fixable. Click the fix icon next to any RULE_DUPLICATE_GUID issue and a new spec-compliant GlobalId is generated — a 22-character string using the correct IFC base-64 alphabet (0–9, A–Z, a–z, _, $) with a leading character in 0–3." },
      { type: 'h3', text: 'Option 2: Fix in Revit' },
      { type: 'p', text: "In Revit with the open-source IFC exporter: File → Export → IFC → Modify Setup → Advanced tab → set \"Export IFC GUIDs\" to \"Keep Existing\". This preserves the stable GlobalIds Revit internally assigns rather than regenerating them on each export." },
      { type: 'h3', text: 'Option 3: Fix in ArchiCAD' },
      { type: 'p', text: "In ArchiCAD: File → Save As → IFC 2x3 → Settings → IFC Translation Settings → enable \"Write stable GlobalIDs (from AC internal IDs)\". Without this enabled, ArchiCAD generates new GUIDs on every export." },
      { type: 'callout', variant: 'warning', text: "Never fix duplicate GUIDs by manually editing the IFC text file and typing new random strings. The IFC GUID format has specific constraints — the first character must be in the range 0–3 (values 0x00–0x03 in the 6-bit alphabet), and random ASCII will produce invalid GlobalIds." },
    ],
  },

  // ── Post 4 ─────────────────────────────────────────────────────────────────

  {
    slug: 'ifc-vs-rvt-vs-nwd',
    title: 'IFC, RVT, NWD, DWG: Which BIM File Format Should You Deliver?',
    excerpt: "Your structural engineer delivers RVT. Your MEP contractor uses NWD. The client wants IFC. Your PM is asking for DWG drawings. Here's how to navigate the format maze and why open BIM actually matters for delivery.",
    date: '2026-05-10',
    readTimeMin: 9,
    category: 'IFC Tips',
    categorySlug: 'ifc-tips',
    author: 'IFC Viewer Team',
    heroImage: 'og-image',
    content: [
      { type: 'p', text: "BIM projects produce models in a dozen formats. Most of them are proprietary. Most of them require the same £5,000 software license to open. When the client needs to inspect the model, run a quantity takeoff, or hand it to a facilities manager for the next 30 years, none of those licenses will be there." },
      { type: 'p', text: "That's the practical argument for IFC. Not ideology — logistics." },
      { type: 'h2', text: 'The Four Formats You\'ll Actually Encounter' },
      {
        type: 'feature-grid',
        items: [
          { icon: '📦', title: 'IFC (.ifc)', body: "ISO 16739-1. Open, vendor-neutral, schema-driven. Every certified BIM tool can export it. The only format your client can still open in 2045." },
          { icon: '🔒', title: 'RVT (.rvt)', body: "Autodesk Revit native. Rich parametric data and family libraries. Requires Revit to open — and the correct Revit version. Not forward-compatible." },
          { icon: '🔗', title: 'NWD / NWF (.nwd)', body: "Navisworks. A coordination-only format: aggregates geometry from multiple sources for clash detection and timeliner. Read-only; no way to push changes back." },
          { icon: '📐', title: 'DWG (.dwg)', body: "AutoCAD / Autodesk. 2D drawings and some 3D geometry. Not a BIM format — no semantic data, no spatial hierarchy, no property sets." },
        ],
      },
      {
        type: 'comparison',
        left: {
          label: 'IFC — Open BIM',
          color: 'accent',
          items: [
            'Readable by any certified BIM tool',
            'Permanent asset — no vendor dependency',
            'Includes full property sets and spatial hierarchy',
            'Supports BCF coordination workflows',
            'Can be validated against schema rules',
            'ISO 16739-1 internationally standardised',
            'Required for ISO 19650 compliance deliveries',
          ],
        },
        right: {
          label: 'RVT / NWD — Proprietary',
          color: 'muted',
          items: [
            'Requires vendor software to open',
            'Format changes break backwards compatibility',
            'Richer parametric data in the native tool',
            'Faster for internal design workflow',
            'NWD clash detection is more precise than IFC clash',
            'No universally agreed schema for validation',
            'Difficult to deliver to FM without a licence',
          ],
        },
      },
      { type: 'h2', text: 'When to Use Each Format' },
      { type: 'h3', text: 'Use IFC for:' },
      { type: 'ul', items: [
        "All formal CDE deliveries and information exchanges between organisations.",
        "Handover packages to clients, facilities managers, and asset owners.",
        "Any delivery governed by ISO 19650 or a project EIR.",
        "Cross-discipline coordination where participants use different authoring tools.",
        "Long-term archival — an IFC file from 2004 still opens in a 2026 validator.",
      ]},
      { type: 'h3', text: 'Use RVT for:' },
      { type: 'ul', items: [
        "Internal design work within an all-Revit team.",
        "Sharing design intent with consultants who also use Revit and the same version.",
        "Parametric design exploration where IFC round-tripping would destroy family relationships.",
      ]},
      { type: 'callout', variant: 'info', text: "The answer to 'IFC or RVT for delivery?' is almost always IFC. The question is really 'which IFC schema?' — IFC4 for new projects, IFC2x3 only if your CDE or receiving tool explicitly requires it." },
      { type: 'h2', text: "IFC Schema Versions: Which to Choose" },
      { type: 'ul', items: [
        "IFC4 (ISO 16739-1:2018): Current standard. Better geometry compression via tessellation (50-70% smaller files), improved material layer assignments, explicit quantity sets. Use this for all new projects.",
        "IFC2x3: The legacy standard from 2006. Still widely supported and required by some contracts and CDEs. Choose if your EIR specifies it, or if any receiving tool doesn't support IFC4.",
        "IFC4x3: The new infrastructure extension for roads, bridges, tunnels. Only relevant for civil/infrastructure projects. Limited tool support as of 2026.",
      ]},
      { type: 'h2', text: 'Why Most Projects Still Deliver IFC2x3' },
      { type: 'p', text: "Inertia. IFC2x3 was the standard for 15 years; every tool supports it. IFC4 has been available since 2013 and ISO-ratified since 2018, but many CDEs, viewer tools, and procurement workflows were built around IFC2x3 assumptions. Until your CDE explicitly validates IFC4, check before you upgrade." },
      {
        type: 'ifc-demo',
        modelId: 'sample-house',
        title: 'IFC4 Sample House',
        description: "A real IFC4 residential model with full property sets, correct spatial hierarchy, and IFC4-native geometry. Open it to see how IFC4 validation compares to IFC2x3 — and what a 90+ Health Score looks like.",
        schema: 'IFC4',
        size: '2.3 MB',
      },
    ],
  },

  // ── Post 5 — 7 Validation Errors (existing, kept as richest version) ────────

  {
    slug: 'common-ifc-validation-errors',
    title: 'The 7 Most Common IFC Validation Errors (and How to Fix Them)',
    excerpt: "Duplicate GUIDs, orphan elements, and broken spatial hierarchies account for over 80% of IFC delivery rejections. Here's how to spot and fix each one before the model reaches the CDE.",
    date: '2026-05-05',
    readTimeMin: 8,
    category: 'Validation',
    categorySlug: 'validation',
    author: 'IFC Viewer Team',
    content: [
      { type: 'p', text: "Every BIM coordinator has been there: you export an IFC file, send it to the Common Data Environment, and it gets rejected because of structural errors you didn't know existed. After running validation on thousands of IFC files, the same seven errors account for the vast majority of failed deliveries." },
      {
        type: 'stat-row',
        stats: [
          { value: 38, suffix: '', label: 'rules checked' },
          { value: 7,  suffix: '',  label: 'cause 80% of rejections' },
          { value: 30, suffix: 's', label: 'to validate any model' },
          { value: 100, suffix: '%', label: 'runs in your browser' },
        ],
      },
      { type: 'h2', text: '1. Duplicate GlobalIds (GUIDs)' },
      { type: 'p', text: "A GlobalId is the permanent identity of an IFC element — it survives model merges, version updates, and software migrations. When two elements share the same GUID, every tool that relies on stable references (BCF workflows, Revit link tracking, CDE versioning) breaks silently." },
      { type: 'callout', variant: 'tip', text: "In Revit: File → Export → IFC → Modify Setup → Advanced → set \"Export IFC GUIDs\" to \"Keep Existing\". This preserves stable GlobalIds rather than regenerating them on every export." },
      { type: 'h2', text: '2. Orphan Elements' },
      { type: 'p', text: "An orphan is a physical element with no spatial container in the IFC hierarchy — it exists in the file but doesn't appear in Project → Site → Building → Storey. Most viewers skip orphans entirely. The cause is usually elements placed on a level without being associated with a floor plan, or linked-file elements that lost their host storey on export." },
      { type: 'h2', text: '3. Wrong Container' },
      { type: 'p', text: "The element has a container, but it's the wrong one — placed directly inside IfcSite instead of inside a storey. Site-level placement is valid only for infrastructure elements. Walls or columns inside IfcSite will confuse every downstream tool from Navisworks to Solibri." },
      { type: 'h2', text: '4. Broken Aggregates' },
      { type: 'p', text: "IfcRelAggregates is the relationship that builds the spatial tree. A broken aggregate means one of these relationships points to a non-existent entity — typically because the entity was deleted after the relationship was written, or during a model merge that didn't propagate deletions correctly." },
      { type: 'h2', text: '5. Spatial Hierarchy Violations' },
      { type: 'p', text: "IFC mandates a strict order: IfcProject → IfcSite → IfcBuilding → IfcBuildingStorey → physical elements. When this order is broken — a Building directly under Project without a Site, elements placed in IfcBuilding instead of a storey — many tools fail to build the tree correctly." },
      { type: 'h2', text: '6. Missing IfcProject' },
      { type: 'p', text: "Every valid IFC file must contain exactly one IfcProject. It's the root node of the entire model hierarchy. Some export workflows that generate sub-models omit it. The result is a file that parses without errors but has no spatial root." },
      { type: 'h2', text: '7. Empty Element Names' },
      { type: 'p', text: "Elements with Name = \"\" or null aren't a schema violation, but they break nearly every downstream workflow: BCF comments can't reference them clearly, quantity takeoff tables show blank rows, and clash reports become unreadable." },
      {
        type: 'ifc-demo',
        modelId: 'duplex-architecture',
        title: 'Run a live validation',
        description: "Open the buildingSMART duplex and see what a clean IFC validation report looks like — then try one of your own models to check for these seven errors.",
        schema: 'IFC2x3',
        size: '2.4 MB',
      },
      { type: 'h2', text: 'Pre-Delivery Checklist' },
      { type: 'ol', items: [
        'Run validation before every CDE upload — not after.',
        'Target Health Score ≥ 80 for coordination deliveries.',
        'Zero duplicate GUIDs — non-negotiable for BCF workflows.',
        'All physical elements inside a storey, not directly under Site or Building.',
        'One IfcProject at the root — always.',
        'Name every element, even generically ("Wall-001" beats empty string).',
        'Spatial hierarchy: Project → Site → Building → Storey → elements.',
      ]},
    ],
  },

  // ── Post 6 ─────────────────────────────────────────────────────────────────

  {
    slug: 'ifc-health-score-explained',
    title: 'IFC Health Score: The Single Number Your BIM Team Needs',
    excerpt: 'What is an IFC Health Score, how is it calculated, and why should every project BEP specify a minimum threshold before CDE delivery?',
    date: '2026-04-22',
    readTimeMin: 5,
    category: 'BIM Best Practices',
    categorySlug: 'best-practices',
    author: 'IFC Viewer Team',
    content: [
      { type: 'p', text: "A Health Score is a single 0–100 number that summarises the structural and data quality of an IFC file. Think of it like a credit score for your model: below 60 means serious problems, 60–80 means needs attention before coordination, 80+ means ready for CDE delivery." },
      { type: 'h2', text: "How It's Calculated" },
      { type: 'p', text: "The score uses a logarithmic penalty model: each validation issue subtracts points from 100, but the penalty diminishes with scale. A model with 1,000 duplicate GUID errors is penalised more than one with 10, but not 100× more — this prevents a large, dense model from looking arbitrarily worse than a small, sparse one for the same underlying problem density." },
      { type: 'p', text: "Issue severity is weighted: schema errors carry 3× the penalty of warnings, which carry 3× the penalty of info checks. The final score is calculated per-model and aggregated when multiple models are open." },
      { type: 'h2', text: 'What Score Should You Require?' },
      { type: 'ul', items: [
        '≥ 90 — Design development and LOD 300+ coordination deliveries.',
        '≥ 80 — Standard BIM coordination and CDE uploads.',
        '≥ 70 — Concept design and LOD 200 exchanges.',
        '< 60 — Not suitable for any formal CDE delivery.',
      ]},
      { type: 'callout', variant: 'info', text: "Add a minimum Health Score threshold to your project's BIM Execution Plan. 'IFC deliveries must achieve a Health Score ≥ 80 before upload to the CDE' costs nothing to write and prevents enormous coordination delays." },
      { type: 'h2', text: 'Why a Single Number Matters' },
      { type: 'p', text: "Detailed validation reports — 400 issues across 12 rule categories — are invaluable for fixing problems. But they're not useful for tracking progress over time or communicating quality to stakeholders who don't work in IFC files." },
      { type: 'p', text: "A Health Score creates a shared reference point that everyone understands: the model is at 73, we need it at 80 before coordination. It turns model quality from a vague aspiration into a measurable deliverable criterion." },
    ],
  },

  // ── Post 7 ─────────────────────────────────────────────────────────────────

  {
    slug: 'clean-ifc-export-revit',
    title: 'How to Export Clean IFC Files from Revit: A Step-by-Step Guide',
    excerpt: "Revit's default IFC export settings produce avoidable validation warnings by the dozen. Here are the exact settings that eliminate the most common failures before the file reaches the CDE.",
    date: '2026-04-10',
    readTimeMin: 7,
    category: 'Tool Guides',
    categorySlug: 'tool-guides',
    author: 'IFC Viewer Team',
    content: [
      { type: 'p', text: "Revit has supported IFC export since 2012, but the default settings are optimized for the widest compatibility with receiving software — not for quality. This means they make conservative choices that create validation warnings by the dozen. Here's how to change that." },
      { type: 'h2', text: 'Step 1: Use the Open Source IFC Exporter' },
      { type: 'p', text: "Autodesk's built-in IFC exporter is functional but lags behind the community-maintained open source version. The open source exporter (free on the Autodesk App Store) generates cleaner GUIDs, better spatial hierarchies, and properly supports IFC4. Install it before configuring any export settings." },
      { type: 'h2', text: 'Step 2: Choose the Right IFC Version' },
      { type: 'p', text: "Unless your project specification explicitly requires IFC2x3, export to IFC4 Reference View. IFC4 is the current ISO standard, produces smaller file sizes for complex geometry via tessellated meshes, and resolves several structural ambiguities present in the older schema." },
      { type: 'h2', text: 'Step 3: Configure These Settings' },
      { type: 'ul', items: [
        '"Export GUIDs": set to "Keep Existing". Never "Generate New" — this breaks BCF cross-references on every re-export.',
        '"Site Placement": set to "Shared Coordinates". Prevents elements from being placed 10 km from the WCS origin.',
        '"Include Steel Connections": Off (unless delivering a structural steel model).',
        '"Export Base Quantities": On for LOD 200+ deliveries.',
        '"Split Walls and Columns by Level": On. Ensures walls are associated with individual storeys.',
      ]},
      { type: 'callout', variant: 'warning', text: "Never export directly to the CDE. A failed delivery that requires re-upload creates a new version in the CDE audit trail and notifies the entire project team. Always validate locally first." },
      { type: 'h2', text: 'Common Revit-Specific Issues After Export' },
      { type: 'ul', items: [
        'Proxy overuse: Revit families without an IFC mapping export as IfcBuildingElementProxy. Map common families to proper IFC classes in the export mapping table.',
        'Coordinate offset: Verify the project shares coordinates with the survey point before export.',
        'Missing property sets: Revit properties export as custom Psets by default. Review the Pset mapping to ensure required standard Psets are included.',
      ]},
    ],
  },

  // ── Post 8 ─────────────────────────────────────────────────────────────────

  {
    slug: 'ifc2x3-vs-ifc4',
    title: 'IFC2x3 vs IFC4: Should You Upgrade Your Export Schema?',
    excerpt: "Most BIM projects still deliver IFC2x3 despite IFC4 being the ISO standard since 2018. Here's what changes with IFC4, when to upgrade, and how to handle the transition without breaking existing tools.",
    date: '2026-03-28',
    readTimeMin: 6,
    category: 'IFC Tips',
    categorySlug: 'ifc-tips',
    author: 'IFC Viewer Team',
    content: [
      { type: 'p', text: "IFC4 was published by buildingSMART in 2013 and became ISO 16739-1 in 2018. Yet in 2025, the majority of IFC files exchanged between BIM tools still use the IFC2x3 schema from 2006. Why the slow adoption, and when does the version choice actually matter?" },
      { type: 'h2', text: 'What Changed in IFC4' },
      { type: 'ul', items: [
        'Geometry: IFC4 introduces tessellated geometry (IfcPolygonalFaceSet). Complex meshes that require 50 MB of B-rep notation in IFC2x3 can be expressed in 8 MB — roughly 6× smaller for detailed architecture.',
        'Materials: Improved IfcMaterialLayerSetUsage makes wall and slab layer definitions more explicit across tools.',
        'Quantities: Explicit area and volume quantities via IfcElementQuantity are first-class in IFC4, not a workaround.',
        'Infrastructure: IfcFacility and built environment extensions prepare IFC for roads, bridges, and tunnels.',
      ]},
      { type: 'h2', text: 'Stay on IFC2x3 If...' },
      { type: 'p', text: "Your workflow includes any of: Tekla Structures (check your version's IFC4 support level), older Navisworks installations (pre-2020 have incomplete IFC4 geometry support), or contracts that explicitly specify IFC2x3." },
      { type: 'h2', text: 'Upgrade to IFC4 If...' },
      { type: 'p', text: "You're using: Solibri (full IFC4 support since 2019), ArchiCAD 23+ (excellent IFC4 output quality), or any ISO 19650 delivery where the EIR specifies IFC4. Also upgrade if large file sizes are slowing coordination — tessellated geometry typically halves IFC file size." },
      { type: 'callout', variant: 'tip', text: "Check your CDE's supported IFC schema before committing. Some CDEs silently convert IFC4 files to IFC2x3 on upload — defeating the purpose of the upgrade. Ask your CDE administrator for the supported schema list." },
    ],
  },

  // ── Post 9 ─────────────────────────────────────────────────────────────────

  {
    slug: 'iso19650-ifc-checklist',
    title: 'ISO 19650 Compliance for IFC Deliveries: A Practical Checklist',
    excerpt: 'ISO 19650 specifies information requirements for BIM deliveries. Here is what that means for your IFC files — from filename conventions to embedded project metadata — and how to verify compliance before submission.',
    date: '2026-03-15',
    readTimeMin: 9,
    category: 'Standards',
    categorySlug: 'standards',
    author: 'IFC Viewer Team',
    content: [
      { type: 'p', text: "ISO 19650 is the international standard for managing information over the whole life cycle of a built asset using BIM. Part 2 covers information management during capital delivery phases — which is where most IFC delivery requirements originate." },
      { type: 'h2', text: 'Part 1: File Naming Convention' },
      { type: 'p', text: "ISO 19650-2 §6.3 specifies a filename structure built from fields separated by hyphens: [Project] - [Originator] - [Volume/System] - [Level/Location] - [Type] - [Role] - [Classification] - [Number].[Extension]." },
      { type: 'callout', variant: 'info', text: "What matters most is consistency and documentation in the Project Information Requirements. An agreed, consistently applied convention is better than a theoretically correct one the team can't follow." },
      { type: 'h2', text: 'Part 2: IfcProject Metadata' },
      { type: 'p', text: "ISO 19650-2 §9.2 requires that IfcProject contain: LongName (the official project name), Description (a brief project description), and ObjectType (the project type and phase). These three fields are the minimum — and they're missing in the majority of IFC files in practice." },
      { type: 'h2', text: 'Part 3: File Header Traceability' },
      { type: 'p', text: "The IFC STEP file header FILE_NAME record has author and organization fields. ISO 19650-2 §9.1 requires these to be populated for traceability. Most tools leave them as empty strings by default." },
      { type: 'h2', text: 'ISO 19650 Compliance Checklist' },
      { type: 'ol', items: [
        'Filename follows the convention specified in the PIR.',
        'IfcProject.LongName = official project name as it appears in contracts.',
        'IfcProject.Description = brief project description.',
        'IfcProject.ObjectType = project type and current phase.',
        'FILE_NAME author field = originator\'s full name.',
        'FILE_NAME organization field = originator\'s company name.',
        'All physical elements have IfcRelAssociatesClassification.',
        'Classification system matches the one agreed in the PIR.',
        'Health Score ≥ 80 (structural quality prerequisite for formal delivery).',
      ]},
    ],
  },

]

// ─── Helpers ──────────────────────────────────────────────────────────────────

export function getBlogPost(slug: string): BlogPost | undefined {
  return BLOG_POSTS.find(p => p.slug === slug)
}

export function getFeaturedPost(): BlogPost {
  return BLOG_POSTS.find(p => p.featured) ?? BLOG_POSTS[0]
}
