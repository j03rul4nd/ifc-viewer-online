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
  | { type: 'health-score'; items: Array<{ score: number; label: string }> }
  | { type: 'pull-quote'; text: string; cite?: string }

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
  /** BCP-47 language code. Default 'en'. */
  lang?: string
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
      {
        type: 'pull-quote',
        text: "A Health Score turns vague quality requirements into a measurable, contractable deliverable criterion.",
        cite: 'IFC Viewer Blog',
      },
      { type: 'h2', text: 'What Each Threshold Means' },
      {
        type: 'health-score',
        items: [
          { score: 43, label: 'Critical — do not deliver' },
          { score: 73, label: 'Needs work' },
          { score: 87, label: 'CDE ready' },
          { score: 96, label: 'Excellence' },
        ],
      },
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

// ─── Posts en español ─────────────────────────────────────────────────────────

export const BLOG_POSTS_ES: BlogPost[] = [

  {
    slug: 'como-exportar-ifc-desde-revit',
    title: 'Cómo exportar un IFC limpio desde Revit: la guía definitiva',
    excerpt: 'La configuración de exportación IFC que viene por defecto en Revit genera decenas de avisos evitables. Esta guía muestra los ajustes exactos que eliminan los errores más comunes antes de que el archivo llegue al ECD.',
    date: '2026-06-01',
    readTimeMin: 8,
    category: 'Guías de herramientas',
    categorySlug: 'tool-guides',
    author: 'IFC Viewer Team',
    lang: 'es',
    featured: true,
    heroImage: 'hero-building',
    content: [
      { type: 'p', text: 'Revit lleva exportando IFC desde 2012. El problema no es el soporte — es que la configuración predeterminada está optimizada para la compatibilidad máxima con el mayor número de herramientas receptoras, no para la calidad del modelo. El resultado: archivos que generan decenas de avisos de validación que se podrían haber evitado con cuatro ajustes.' },
      {
        type: 'stat-row',
        stats: [
          { value: 4,   suffix: '', label: 'ajustes clave' },
          { value: 38,  suffix: '', label: 'reglas de validación' },
          { value: 30,  suffix: 's', label: 'para validar un modelo' },
          { value: 0,   suffix: ' MB', label: 'subidos al servidor' },
        ],
      },
      { type: 'h2', text: 'Paso 1: Instalar el exportador IFC de código abierto' },
      { type: 'p', text: 'El exportador IFC integrado en Revit funciona, pero va por detrás del mantenido por la comunidad. El exportador open source (gratuito en el Autodesk App Store) genera GUIDs más fiables, jerarquías espaciales más limpias y soporta IFC4 correctamente. Instálalo antes de cambiar cualquier otra configuración.' },
      { type: 'h2', text: 'Paso 2: Elegir IFC4 Reference View' },
      { type: 'p', text: 'Salvo que el pliego de condiciones exija explícitamente IFC2x3, exporta a IFC4 Reference View. IFC4 es el estándar ISO actual (ISO 16739-1:2018), produce archivos más pequeños gracias a la geometría teselada y resuelve varias ambigüedades estructurales del esquema anterior.' },
      { type: 'h2', text: 'Paso 3: Los cuatro ajustes críticos' },
      { type: 'ul', items: [
        '"Exportar GUIDs IFC": ponlo en "Mantener existentes". Jamás en "Generar nuevos" — eso rompe las referencias cruzadas en BCF en cada nueva exportación.',
        '"Colocación en emplazamiento": activa "Coordenadas compartidas". Evita que los elementos se coloquen a 10 km del origen WCS.',
        '"Incluir conexiones de acero": desactivado (a menos que entregues un modelo estructural de acero).',
        '"Dividir muros y pilares por nivel": activado. Garantiza que los muros queden asociados a las plantas correctas.',
      ]},
      { type: 'callout', variant: 'warning', text: 'Nunca exportes directamente al ECD. Una entrega fallida que requiere volver a subir el archivo crea una nueva revisión en el historial del ECD y genera notificaciones a todo el equipo del proyecto. Valida siempre en local primero.' },
      { type: 'h2', text: 'Paso 4: Validar antes de subir' },
      { type: 'p', text: 'Exporta a una carpeta local. Abre el archivo IFC en un validador y comprueba: desfase de coordenadas (las coordenadas compartidas no se han aplicado), exceso de proxies (más del 5% de los elementos son IfcBuildingElementProxy — familias Revit sin mapear) y tipos faltantes.' },
      {
        type: 'ifc-demo',
        modelId: 'duplex-architecture',
        title: 'Valida el modelo Duplex de referencia',
        description: 'Abre el modelo buildingSMART en el visor para ver cómo es un informe de validación limpio. Luego prueba con tu propio archivo de Revit.',
        schema: 'IFC2x3',
        size: '2.4 MB',
      },
      { type: 'h2', text: 'Problemas habituales en archivos IFC exportados desde Revit' },
      { type: 'ul', items: [
        'Exceso de proxies: Las familias Revit sin asignación IFC se exportan como IfcBuildingElementProxy. Revisa la tabla de mapeo IFC y asigna las familias más usadas a sus tipos IFC correctos.',
        'Desfase de coordenadas: Comprueba que el proyecto tiene coordenadas compartidas con el punto de agrimensura antes de exportar.',
        'Property sets faltantes: Los parámetros de Revit se exportan por defecto como Psets personalizados. Revisa el mapeo de Psets para incluir los estándar (Pset_WallCommon, etc.).',
      ]},
    ],
  },

  {
    slug: 'health-score-ifc-que-es',
    title: 'Health Score en IFC: el número que necesita tu proyecto BIM',
    excerpt: 'Un Health Score de 0 a 100 resume la calidad estructural y de datos de un modelo IFC en un solo número. Te explicamos cómo se calcula, qué significa cada umbral y por qué debería estar en el PEB de todos tus proyectos.',
    date: '2026-05-22',
    readTimeMin: 6,
    category: 'Buenas prácticas BIM',
    categorySlug: 'best-practices',
    author: 'IFC Viewer Team',
    lang: 'es',
    content: [
      { type: 'p', text: 'En todos los proyectos BIM en los que he trabajado, el Plan de Ejecución BIM menciona "entrega de un IFC de calidad". En ninguno se ha definido con precisión qué significa eso. La validación ocurre de forma manual, inconsistente, o directamente no ocurre — hasta que el modelo federado produce absurdos y alguien empieza a investigar.' },
      { type: 'p', text: 'Un Health Score cambia eso. Es un número de 0 a 100 calculado automáticamente contra 38 reglas de validación. Siempre el mismo número, en cualquier máquina, en cualquier versión del modelo. Debería estar en el PEB como requisito de entrega.' },
      { type: 'pull-quote', text: 'Un Health Score convierte un requisito de calidad vago en un criterio de entrega medible y exigible contractualmente.', cite: 'IFC Viewer Blog' },
      { type: 'h2', text: 'Cómo se calcula' },
      { type: 'p', text: 'La puntuación parte de 100. Cada problema de validación resta puntos usando un modelo de penalización logarítmica: el error número 1.000 de GUIDs duplicados resta muchos menos que el número 10, porque la degradación de calidad no es lineal. Un modelo fundamentalmente roto colapsa cerca de cero; uno con inconsistencias menores de nomenclatura se mantiene por encima de 85.' },
      {
        type: 'health-score',
        items: [
          { score: 34, label: 'Entrega rechazada' },
          { score: 71, label: 'Revisión interna' },
          { score: 84, label: 'Listo para el ECD' },
          { score: 94, label: 'Calidad excelente' },
        ],
      },
      { type: 'h2', text: 'Qué significa cada umbral' },
      {
        type: 'feature-grid',
        items: [
          { icon: '🔴', title: '0–59: Crítico', body: 'Problemas estructurales que romperán las herramientas de aguas abajo. IfcProject faltante, elementos huérfanos, referencias circulares. No entregar.' },
          { icon: '🟡', title: '60–79: Necesita trabajo', body: 'Problemas de calidad de datos significativos. Aceptable para revisión interna; no aceptable para el ECD ni para sesiones de coordinación multidisciplinar.' },
          { icon: '🟢', title: '80–89: Listo para entrega', body: 'Problemas menores que no afectan la validez estructural. Válido para entrega estándar al ECD y coordinación de diseño.' },
          { icon: '✅', title: '90–100: Excelencia', body: 'Modelo limpio. Válido para entregas LOD 300+, documentación ISO 19650 y fase de licitación/construcción.' },
        ],
      },
      { type: 'callout', variant: 'info', text: 'Añade un umbral mínimo de Health Score al PEB de tu proyecto. Una cláusula del tipo "Las entregas IFC deben alcanzar un Health Score ≥ 80 antes de la subida al ECD" no cuesta nada escribirla y evita semanas de retrasos de coordinación.' },
      { type: 'h2', text: 'Puntuación vs. número de problemas: la diferencia clave' },
      { type: 'p', text: 'Un modelo con 800 problemas puede tener una puntuación de 81. Uno con 12 puede tener 34. La diferencia está en la severidad. Ochocientos avisos de nombres vacíos (nivel informativo, penalización mínima) frente a doce errores de IfcProject faltante + agregaciones rotas + referencias espaciales circulares (errores de esquema, peso 3×). Optimiza la puntuación, no el recuento de problemas.' },
    ],
  },

  {
    slug: 'errores-ifc-mas-comunes',
    title: 'Los 7 errores IFC más comunes (y cómo corregirlos antes de la entrega)',
    excerpt: 'GUIDs duplicados, elementos huérfanos y jerarquías espaciales rotas causan más del 80% de los rechazos en el ECD. Aquí tienes cómo detectar y corregir cada uno antes de que el modelo llegue al coordinador.',
    date: '2026-05-12',
    readTimeMin: 7,
    category: 'Validación',
    categorySlug: 'validation',
    author: 'IFC Viewer Team',
    lang: 'es',
    content: [
      { type: 'p', text: 'Todo coordinador BIM lo ha vivido: exportas un archivo IFC, lo subes al Entorno Común de Datos y el sistema lo rechaza por errores estructurales que no sabías que existían. Tras analizar miles de archivos IFC, los mismos siete errores explican la gran mayoría de los rechazos.' },
      { type: 'h2', text: '1. GlobalIds duplicados (GUIDs duplicados)' },
      { type: 'p', text: 'El GlobalId es la identidad permanente de un elemento IFC. Sobrevive a fusiones de modelos, actualizaciones de versión y migraciones de software. Cuando dos elementos comparten el mismo GUID, todas las herramientas que dependen de referencias estables (flujos BCF, seguimiento de links en Revit, versionado en el ECD) fallan silenciosamente.' },
      { type: 'callout', variant: 'tip', text: 'En Revit: Archivo → Exportar → IFC → Modificar configuración → Avanzado → pon "Exportar GUIDs IFC" en "Mantener existentes". Esto preserva los GlobalIds estables que Revit asigna internamente en lugar de regenerarlos en cada exportación.' },
      { type: 'h2', text: '2. Elementos huérfanos' },
      { type: 'p', text: 'Un elemento huérfano es un elemento físico sin contenedor espacial en la jerarquía IFC: existe en el archivo pero no aparece en Proyecto → Emplazamiento → Edificio → Planta. La mayoría de los visualizadores ignoran los huérfanos por completo — son invisibles en el modelo de coordinación.' },
      { type: 'h2', text: '3. Contenedor incorrecto' },
      { type: 'p', text: 'El elemento tiene contenedor, pero es el incorrecto: está situado directamente dentro de IfcSite en lugar de una planta. La ubicación a nivel de emplazamiento solo es válida para elementos de infraestructura. Muros o pilares dentro de IfcSite confundirán a todas las herramientas de aguas abajo.' },
      { type: 'h2', text: '4. Agregaciones rotas' },
      { type: 'p', text: 'IfcRelAggregates es la relación que construye el árbol espacial. Una agregación rota significa que una de estas relaciones apunta a una entidad inexistente — normalmente porque la entidad fue eliminada después de que se escribiera la relación, o durante una fusión de modelos mal ejecutada.' },
      { type: 'h2', text: '5. Violaciones de jerarquía espacial' },
      { type: 'p', text: 'IFC exige un orden estricto: IfcProject → IfcSite → IfcBuilding → IfcBuildingStorey → elementos físicos. Cuando este orden se rompe — un Edificio directamente bajo Proyecto sin Emplazamiento, o elementos en IfcBuilding sin pasar por una planta — muchas herramientas no construyen el árbol correctamente.' },
      { type: 'h2', text: '6. IfcProject faltante' },
      { type: 'p', text: 'Todos los archivos IFC válidos deben contener exactamente un IfcProject. Algunos flujos de exportación de sub-modelos lo omiten. El resultado es un archivo que parsea sin errores pero no tiene raíz espacial.' },
      { type: 'h2', text: '7. Nombres de elemento vacíos' },
      { type: 'p', text: 'Los elementos con Name = "" o nulo no son una violación de esquema, pero rompen casi todos los flujos de trabajo de aguas abajo: los comentarios BCF no pueden referenciarlos con claridad, las tablas de mediciones muestran filas en blanco, y los informes de colisiones se vuelven ilegibles.' },
      {
        type: 'ifc-demo',
        modelId: 'duplex-architecture',
        title: 'Valida un modelo real ahora',
        description: 'Abre el modelo Duplex buildingSMART para ver cómo es un informe de validación limpio. Después prueba con tu propio archivo IFC.',
        schema: 'IFC2x3',
        size: '2.4 MB',
      },
      { type: 'h2', text: 'Lista de comprobación pre-entrega' },
      { type: 'ol', items: [
        'Ejecuta la validación antes de cada subida al ECD — no después.',
        'Objetivo: Health Score ≥ 80 para entregas de coordinación.',
        'Cero GUIDs duplicados — innegociable para flujos de trabajo BCF.',
        'Todos los elementos físicos dentro de una planta, no directamente en Emplazamiento o Edificio.',
        'Un único IfcProject en la raíz — siempre.',
        'Da nombre a todos los elementos, aunque sea genérico ("Muro-001" es mejor que vacío).',
      ]},
    ],
  },

  {
    slug: 'ifc-vs-rvt-que-entregar',
    title: 'IFC vs RVT: ¿qué formato BIM debes entregar en tus proyectos?',
    excerpt: 'El estructurista entrega RVT. El instalador usa NWD. El cliente pide IFC. El jefe de proyecto pide DWG. Aquí tienes cómo navegar el laberinto de formatos y por qué el BIM abierto importa de verdad para la entrega.',
    date: '2026-05-02',
    readTimeMin: 7,
    category: 'Consejos IFC',
    categorySlug: 'ifc-tips',
    author: 'IFC Viewer Team',
    lang: 'es',
    content: [
      { type: 'p', text: 'Los proyectos BIM generan modelos en una docena de formatos. La mayoría son propietarios. La mayoría requieren licencias costosas para abrirse. Cuando el cliente necesita inspeccionar el modelo, hacer mediciones o entregarlo al facility manager para los próximos 30 años, ninguna de esas licencias estará disponible.' },
      { type: 'p', text: 'Ese es el argumento práctico para IFC. No es ideología — es logística.' },
      { type: 'h2', text: 'Los cuatro formatos que encontrarás en obra' },
      {
        type: 'feature-grid',
        items: [
          { icon: '📦', title: 'IFC (.ifc)', body: 'ISO 16739-1. Abierto, neutral, basado en esquema. Todas las herramientas BIM certificadas pueden exportarlo. El único formato que el cliente podrá abrir en 2045.' },
          { icon: '🔒', title: 'RVT (.rvt)', body: 'Nativo de Autodesk Revit. Datos paramétricos ricos y bibliotecas de familias. Requiere Revit para abrirse — y la versión correcta de Revit. No compatible hacia adelante.' },
          { icon: '🔗', title: 'NWD / NWF (.nwd)', body: 'Navisworks. Formato solo de coordinación: agrega geometría para detección de colisiones y Timeliner. Solo lectura; no hay forma de devolver cambios al modelo fuente.' },
          { icon: '📐', title: 'DWG (.dwg)', body: 'AutoCAD / Autodesk. Planos 2D y algo de geometría 3D. No es un formato BIM — sin datos semánticos, sin jerarquía espacial, sin property sets.' },
        ],
      },
      {
        type: 'comparison',
        left: {
          label: 'IFC — BIM Abierto',
          color: 'accent',
          items: [
            'Legible por cualquier herramienta BIM certificada',
            'Activo permanente — sin dependencia de proveedor',
            'Incluye property sets completos y jerarquía espacial',
            'Compatible con flujos de trabajo de coordinación BCF',
            'Validable contra reglas de esquema',
            'ISO 16739-1 normalizado internacionalmente',
            'Requerido para entregas de cumplimiento ISO 19650',
          ],
        },
        right: {
          label: 'RVT / NWD — Propietario',
          color: 'muted',
          items: [
            'Requiere software del proveedor para abrirse',
            'Los cambios de formato rompen la compatibilidad',
            'Datos paramétricos más ricos en la herramienta nativa',
            'Más rápido para el flujo de diseño interno',
            'Detección de colisiones NWD más precisa que IFC',
            'Sin esquema acordado universalmente para validación',
            'Difícil de entregar a FM sin licencia',
          ],
        },
      },
      { type: 'callout', variant: 'info', text: 'La respuesta a "¿IFC o RVT para la entrega?" es casi siempre IFC. La pregunta real es: "¿Qué esquema IFC?" — IFC4 para proyectos nuevos, IFC2x3 solo si el ECD o la herramienta receptora lo exige explícitamente.' },
      { type: 'h2', text: 'Cuándo usar cada formato' },
      { type: 'h3', text: 'Usa IFC para:' },
      { type: 'ul', items: [
        'Todas las entregas formales al ECD e intercambios de información entre organizaciones.',
        'Paquetes de entrega a clientes, facility managers y propietarios de activos.',
        'Cualquier entrega gobernada por ISO 19650 o el EIR del proyecto.',
        'Coordinación multidisciplinar donde los participantes usan herramientas de autor distintas.',
      ]},
      { type: 'h3', text: 'Usa RVT para:' },
      { type: 'ul', items: [
        'Trabajo de diseño interno dentro de un equipo completamente Revit.',
        'Intercambios con consultores que también usan Revit y la misma versión.',
        'Exploración de diseño paramétrico donde el round-tripping IFC destruiría las relaciones de familia.',
      ]},
      {
        type: 'ifc-demo',
        modelId: 'ifc4-revit-arc',
        title: 'Modelo de oficina IFC4 desde Revit',
        description: 'Abre este modelo real de Revit exportado como IFC4 para ver cómo se ve la validación en un archivo de tamaño real (14 MB, arquitectura completa).',
        schema: 'IFC4',
        size: '14 MB',
      },
    ],
  },

]

// ─── Posts en alemán ──────────────────────────────────────────────────────────

export const BLOG_POSTS_DE: BlogPost[] = [

  {
    slug: 'ifc-datei-im-browser-oeffnen',
    title: 'IFC-Dateien im Browser öffnen — kostenlos, ohne Installation',
    excerpt: 'Ihr Auftraggeber hat Ihnen eine 200 MB große IFC-Datei geschickt. Kein Revit, kein Navisworks installiert. So öffnen, prüfen und validieren Sie die Datei — direkt im Browser.',
    date: '2026-06-01',
    readTimeMin: 5,
    category: 'Anleitungen',
    categorySlug: 'tool-guides',
    author: 'IFC Viewer Team',
    lang: 'de',
    featured: true,
    heroImage: 'hero-building',
    content: [
      { type: 'p', text: 'IFC-Dateien sind der offene Standard für den BIM-Datenaustausch — aber sie lassen sich nur schwer öffnen, ohne eine teure Workstation und proprietäre Software. Die meisten Online-Viewer laden die Datei auf einen Server hoch (bei vertraulichen Projektdaten keine Option) oder versagen bei Dateien über 10 MB.' },
      { type: 'p', text: 'Dieser Viewer analysiert IFC-Dateien vollständig im Browser via WebAssembly. Die Geometrie verlässt Ihr Gerät zu keinem Zeitpunkt. Eine 200-MB-Datei kann im Flugzeug ohne WLAN geöffnet werden.' },
      {
        type: 'stat-row',
        stats: [
          { value: 38,  suffix: '', label: 'Prüfregeln' },
          { value: 0,   suffix: ' Byte', label: 'auf den Server hochgeladen' },
          { value: 100, suffix: '%', label: 'läuft im Browser' },
          { value: 13,  suffix: '', label: 'Demo-IFC-Modelle' },
        ],
      },
      { type: 'h2', text: 'IFC-Datei in 3 Schritten öffnen' },
      { type: 'ol', items: [
        'IFC Viewer im Browser öffnen — Chrome, Firefox, Safari, Edge. Kein Plugin erforderlich.',
        'IFC-Datei per Drag & Drop in den Viewer ziehen oder über "Datei öffnen" auswählen.',
        'Das Modell wird in Sekunden gerendert. Die Validierung läuft automatisch im Hintergrund — der Health Score erscheint in der oberen linken Ecke.',
      ]},
      {
        type: 'feature-grid',
        items: [
          { icon: '🔒', title: 'Privatsphäre by Design', body: 'Dateien werden client-seitig via web-ifc WASM analysiert. Kein Byte erreicht einen Server. Kein Konto erforderlich.' },
          { icon: '⚡', title: 'Einmal analysiert, dauerhaft gecacht', body: 'Die Geometrie wird im Origin Private File System des Browsers gespeichert. Wiederholte Ladevorgänge sind ~10× schneller.' },
          { icon: '📐', title: '38 Validierungsregeln', body: 'Von duplizierten GUIDs bis zu Verletzungen der räumlichen Hierarchie — alle wichtigen IFC-Qualitätsprobleme werden in unter 30 Sekunden erkannt.' },
          { icon: '🌐', title: 'Offline-fähig', body: 'Einmal geladen, läuft die App ohne Netzwerkverbindung. Ideal für Baustellen mit schlechter Verbindung.' },
        ],
      },
      {
        type: 'ifc-demo',
        modelId: 'duplex-architecture',
        title: 'Duplex-Apartment — Architektur',
        description: 'Das klassische buildingSMART-Duplex. Öffnen Sie dieses Modell, um zu sehen, wie ein sauberer Validierungsbericht aussieht — und testen Sie dann Ihre eigene IFC-Datei.',
        schema: 'IFC2x3',
        size: '2.4 MB',
      },
      { type: 'h2', text: 'Was ist der Health Score?' },
      { type: 'p', text: 'Jede IFC-Datei erhält einen Health Score von 0 bis 100. Er fasst die strukturelle und datentechnische Qualität des Modells in einer einzigen Zahl zusammen. Ein Wert von 87 bedeutet "geringfügige Probleme, bereit für die Koordination". Ein Wert von 43 bedeutet "schwerwiegende Probleme, nicht an das CDE liefern".' },
      { type: 'callout', variant: 'tip', text: 'Tastaturkürzel: F um das ausgewählte Element einzurahmen, H um es auszublenden, I um es zu isolieren, Umschalt+H um die volle Sichtbarkeit wiederherzustellen. Strg+Umschalt+V um die Validierung auszuführen.' },
    ],
  },

  {
    slug: 'ifc-validierung-haeufige-fehler',
    title: 'Die 5 häufigsten IFC-Fehler vor der CDE-Lieferung',
    excerpt: 'Duplizierte GUIDs, verwaiste Elemente und fehlerhafte räumliche Hierarchien verursachen den Großteil aller Ablehnungen im Common Data Environment. So erkennen und beheben Sie diese Fehler.',
    date: '2026-05-15',
    readTimeMin: 7,
    category: 'Validierung',
    categorySlug: 'validation',
    author: 'IFC Viewer Team',
    lang: 'de',
    content: [
      { type: 'p', text: 'Nach der Analyse von Tausenden von IFC-Dateien zeigen sich immer wieder dieselben Muster: Eine Handvoll struktureller Fehler verursacht den Großteil aller abgelehnten CDE-Lieferungen. Hier sind die fünf häufigsten — und wie Sie sie beheben, bevor die Datei den Koordinator erreicht.' },
      { type: 'h2', text: '1. Duplizierte GlobalIds (GUIDs)' },
      { type: 'p', text: 'Ein GlobalId ist die dauerhafte Identität eines IFC-Elements über Modellzusammenführungen, Versionsaktualisierungen und Softwaremigrationen hinweg. Wenn zwei Elemente dieselbe GUID teilen, versagt jedes Werkzeug, das auf stabile Referenzen angewiesen ist — BCF-Workflows, Revit-Links, CDE-Versionierung — lautlos.' },
      { type: 'callout', variant: 'tip', text: 'In Revit: Datei → Exportieren → IFC → Setup ändern → Erweitert → "IFC-GUIDs exportieren" auf "Vorhandene beibehalten" setzen. Dadurch werden die stabilen GlobalIds erhalten, anstatt sie bei jedem Export neu zu generieren.' },
      { type: 'h2', text: '2. Verwaiste Elemente' },
      { type: 'p', text: 'Ein verwaistes Element ist ein physisches Element ohne räumlichen Container in der IFC-Hierarchie. Es existiert in der Datei, erscheint aber nicht im Baum Projekt → Gelände → Gebäude → Geschoss. Die meisten Viewer überspringen verwaiste Elemente vollständig.' },
      { type: 'h2', text: '3. Falscher Container' },
      { type: 'p', text: 'Das Element hat einen Container, aber den falschen — es befindet sich direkt in IfcSite statt in einem Geschoss. Die Platzierung auf Geländeebene ist nur für Infrastrukturelemente gültig. Wände oder Stützen in IfcSite werden jedes nachgelagerte Werkzeug verwirren.' },
      { type: 'h2', text: '4. Fehlendes IfcProject' },
      { type: 'p', text: 'Jede gültige IFC-Datei muss genau ein IfcProject enthalten — den Wurzelknoten der gesamten Modellhierarchie. Einige Export-Workflows, die Teilmodelle generieren, lassen es weg.' },
      { type: 'h2', text: '5. Fehler in der räumlichen Hierarchie' },
      { type: 'p', text: 'IFC schreibt eine strenge Reihenfolge vor: IfcProject → IfcSite → IfcBuilding → IfcBuildingStorey → physische Elemente. Wenn diese Reihenfolge durchbrochen wird, bauen viele Werkzeuge den Baum nicht korrekt auf.' },
      {
        type: 'ifc-demo',
        modelId: 'duplex-architecture',
        title: 'Live-Validierung starten',
        description: 'Öffnen Sie das buildingSMART-Duplex und sehen Sie, wie ein sauberer IFC-Validierungsbericht aussieht — dann testen Sie Ihre eigene Datei auf diese fünf Fehler.',
        schema: 'IFC2x3',
        size: '2.4 MB',
      },
    ],
  },

]

// ─── Posts en francés ─────────────────────────────────────────────────────────

export const BLOG_POSTS_FR: BlogPost[] = [

  {
    slug: 'ouvrir-fichier-ifc-navigateur',
    title: 'Ouvrir un fichier IFC dans le navigateur — gratuit, sans installation',
    excerpt: "Votre client vient de vous envoyer un fichier IFC de 200 Mo. Pas de Revit, pas de Navisworks. Voici comment l'ouvrir, l'inspecter et le valider directement dans votre navigateur.",
    date: '2026-06-01',
    readTimeMin: 5,
    category: 'Guides outils',
    categorySlug: 'tool-guides',
    author: 'IFC Viewer Team',
    lang: 'fr',
    featured: true,
    heroImage: 'hero-building',
    content: [
      { type: 'p', text: "Les fichiers IFC sont la langue commune de l'open BIM — mais ils sont notoirement difficiles à ouvrir sans logiciel spécialisé et des licences coûteuses. La plupart des visionneuses en ligne téléchargent votre fichier sur un serveur (impossible pour les données de projet confidentielles) ou échouent sur les fichiers de plus de 10 Mo." },
      { type: 'p', text: "Ce visualiseur analyse les fichiers IFC entièrement dans le navigateur via WebAssembly. La géométrie ne quitte jamais votre appareil. Vous pouvez ouvrir un fichier de 200 Mo dans un avion, en mode hors ligne." },
      {
        type: 'stat-row',
        stats: [
          { value: 38,  suffix: '', label: 'règles de validation' },
          { value: 0,   suffix: ' octet', label: 'envoyé au serveur' },
          { value: 100, suffix: '%', label: 'dans le navigateur' },
          { value: 13,  suffix: '', label: 'modèles IFC de démo' },
        ],
      },
      { type: 'h2', text: 'Ouvrir un fichier IFC en 3 étapes' },
      { type: 'ol', items: [
        "Ouvrez IFC Viewer dans n'importe quel navigateur — Chrome, Firefox, Safari, Edge. Aucune extension requise.",
        "Glissez-déposez votre fichier .ifc dans la visionneuse, ou cliquez sur \"Ouvrir un fichier\" pour le sélectionner.",
        "Le modèle s'affiche en quelques secondes. La validation démarre automatiquement en arrière-plan — le Health Score apparaît en haut à gauche.",
      ]},
      {
        type: 'feature-grid',
        items: [
          { icon: '🔒', title: 'Confidentialité by design', body: 'Les fichiers sont analysés côté client via web-ifc WASM. Aucun octet n\'atteint un serveur. Aucun compte requis.' },
          { icon: '⚡', title: 'Analysé une fois, mis en cache', body: 'La géométrie est stockée dans le système de fichiers privé du navigateur. Les chargements répétés sont ~10× plus rapides.' },
          { icon: '📐', title: '38 règles de validation', body: 'Des GUIDs dupliqués aux violations de hiérarchie spatiale — tous les problèmes majeurs de qualité IFC détectés en moins de 30 secondes.' },
          { icon: '🌐', title: 'Fonctionne hors ligne', body: 'Une fois chargée, l\'application fonctionne sans connexion réseau. Idéal pour les chantiers avec une mauvaise connectivité.' },
        ],
      },
      {
        type: 'ifc-demo',
        modelId: 'duplex-architecture',
        title: 'Duplex — Architecture (modèle de démonstration)',
        description: 'Ouvrez le duplex buildingSMART de référence pour voir ce qu\'un rapport de validation propre ressemble — puis testez votre propre fichier IFC.',
        schema: 'IFC2x3',
        size: '2.4 MB',
      },
      { type: 'h2', text: "Qu'est-ce que le Health Score ?" },
      { type: 'p', text: "Chaque fichier IFC reçoit un Health Score de 0 à 100. Il résume la qualité structurelle et des données du modèle en un seul chiffre. Un score de 87 signifie 'problèmes mineurs, prêt pour la coordination'. Un score de 43 signifie 'problèmes graves, ne pas livrer à la GED'." },
      { type: 'callout', variant: 'info', text: "Ajoutez un seuil minimum de Health Score dans votre PEB (Plan d'Exécution BIM). Une clause comme 'Les livraisons IFC doivent atteindre un Health Score ≥ 80 avant upload vers la GED' ne coûte rien à écrire et évite des semaines de retard en coordination." },
    ],
  },

]

// ─── All posts by language ────────────────────────────────────────────────────

export const ALL_BLOG_POSTS: BlogPost[] = [
  ...BLOG_POSTS,
  ...BLOG_POSTS_ES,
  ...BLOG_POSTS_DE,
  ...BLOG_POSTS_FR,
]

// ─── Helpers ──────────────────────────────────────────────────────────────────

export function getBlogPost(slug: string, lang = 'en'): BlogPost | undefined {
  return ALL_BLOG_POSTS.find(p => p.slug === slug && (p.lang ?? 'en') === lang)
}

export function getBlogPostsByLang(lang: string): BlogPost[] {
  return ALL_BLOG_POSTS.filter(p => (p.lang ?? 'en') === lang)
}

export function getFeaturedPost(lang = 'en'): BlogPost {
  const posts = getBlogPostsByLang(lang)
  return posts.find(p => p.featured) ?? posts[0] ?? BLOG_POSTS[0]
}
