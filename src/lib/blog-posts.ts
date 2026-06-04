// ─── Blog posts ───────────────────────────────────────────────────────────────
// Content data — no JSX, no imports. All visual rendering lives in Blog.tsx.

/**
 * Inline rich-text segment, used inside `p` blocks.
 * - a plain string renders as text
 * - `{ text, to }`   renders an internal link to another blog post (by slug), navigated in-SPA
 * - `{ text, href }` renders an external link (opens in a new tab)
 */
export type InlineSegment =
  | string
  | { text: string; to: string }
  | { text: string; href: string }

/** A paragraph's text: either a plain string (most common) or rich-text segments for inline links. */
export type RichText = string | InlineSegment[]

export type ContentBlock =
  | { type: 'p'; text: RichText }
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

  // ── Post 10 — Quick win: GUIDs change on every export ────────────────────────

  {
    slug: 'ifc-guids-changing-every-export',
    title: 'Why IFC GUIDs Change on Every Export (and How to Keep Them Stable)',
    excerpt: "You re-export the same model, send it to your coordinator, and every BCF comment, clash issue, and FM tag is suddenly pointing at the wrong element — or nothing at all. The cause: your IFC GlobalIds were regenerated. Here's why it happens and how to lock them down.",
    date: '2026-06-03',
    readTimeMin: 8,
    category: 'Validation',
    categorySlug: 'validation',
    author: 'IFC Viewer Team',
    content: [
      { type: 'p', text: "There are two completely different GUID problems in IFC, and they get confused constantly. The first is duplicate GUIDs — two elements sharing one GlobalId in a single file. The second, covered here, is GUID instability: the same element getting a different GlobalId every time you re-export the model. Both break coordination, but the second is sneakier, because each individual file looks perfectly valid." },
      { type: 'p', text: "If you coordinate clashes, run BCF workflows, or hand a model to facilities management, stable GlobalIds are not optional. They are the only thing that lets a tool say 'this wall in revision 4 is the same wall as in revision 2'. When they drift, every reference that pointed at the old ID silently dangles." },
      {
        type: 'stat-row',
        stats: [
          { value: 22, suffix: '', label: 'chars in an IFC GUID' },
          { value: 3,  suffix: '', label: 'max value of first char' },
          { value: 0,  suffix: ' bytes', label: 'uploaded to validate' },
          { value: 100, suffix: '%', label: 'runs in browser' },
        ],
      },
      { type: 'h2', text: 'What a Stable GlobalId Is Supposed to Be' },
      { type: 'p', text: "Every IFC entity that inherits from IfcRoot carries a GlobalId: a 22-character string using IFC's custom base-64 alphabet (0–9, A–Z, a–z, _, $). The spec is explicit that it should be globally unique and persistent — the same logical element keeps the same GlobalId across revisions and across software round-trips. That persistence is what makes change tracking, BCF, and asset registers possible." },
      {
        type: 'code',
        lang: 'ifc',
        text: `// Revision 2
#1402 = IFCWALL('3LYa_FRDj3zhLfyYoQv6Jr', $, 'Exterior Wall - 300mm', ...);

// Revision 3 — same wall, regenerated GlobalId. Every reference to the old ID now dangles.
#1402 = IFCWALL('2hQ8pZ_a1ABxKm9dELc0Ru', $, 'Exterior Wall - 300mm', ...);`,
      },
      { type: 'callout', variant: 'warning', text: "A regenerated GlobalId is not a schema error. The file validates against the schema, opens cleanly in any viewer, and looks correct. The damage only shows up downstream, days later, when a BCF issue resolves to the wrong element — which is exactly why it's so expensive to debug after the fact." },
      { type: 'h2', text: 'Why Revit Regenerates GUIDs' },
      { type: 'p', text: "The root cause is that there is not always a clean one-to-one mapping between a Revit element and the IFC entity it exports to. A single Revit element can split into several IFC entities (a railing becomes a rail plus balusters plus a handrail), and when there is no stable 1:1 relationship, the exporter has no reliable anchor to derive a consistent GlobalId from. So it generates a fresh one." },
      { type: 'p', text: "Historically the IFC GUID parameter in Revit was read-only, which meant teams couldn't pin it even when they wanted to. Newer exporter versions made it read-write so the value can be stored and reused — but you still have to turn the right setting on, because the default behaviour on some configurations is to regenerate." },
      { type: 'ul', items: [
        "Sub-element splitting: one host element exporting to multiple IFC entities (railings, stairs, curtain walls, roofs with fascias) is the classic source of drift.",
        "Re-export with 'generate new' behaviour: some export setups recreate GUIDs every time rather than reusing the stored value.",
        "Copy/paste and group edits in the authoring tool can reset the internal ID the GUID is derived from.",
        "Round-tripping through a tool that doesn't preserve GlobalIds (open-and-resave in a viewer or converter) rewrites them.",
      ]},
      { type: 'h2', text: 'The Other Half: Invalid GUID Range' },
      { type: 'p', text: "There's a related failure that hand-rolled export scripts hit constantly. The first character of a valid IFC GlobalId can only encode the values 0–3 in the 6-bit alphabet, because a 128-bit UUID packed into 22 base-64 characters leaves the leading sextet with only two significant bits. Scripts that take a plain 32-hex-character UUID and naively truncate or re-encode it produce a first character outside that range." },
      {
        type: 'pull-quote',
        text: "The GUID values are out of the valid range — if the first digit is anything other than 0, 1, 2 or 3, it is not a conformant IFC GlobalId.",
        cite: 'buildingSMART Forums — common IFC export mistakes',
      },
      { type: 'p', text: "An out-of-range GlobalId will be silently tolerated by lenient parsers and rejected by strict ones — so the same file 'works' in one tool and fails validation in another, which is maddening to diagnose without a checker that flags the range explicitly." },
      { type: 'h2', text: 'How to Detect Unstable or Invalid GUIDs' },
      { type: 'p', text: "You can't see GUID drift by looking at a single file — you need to compare two exports, or check for invalid format and duplicates within one. Open both revisions in the validator: it flags GlobalIds that are out of the valid range, duplicated within a file, or malformed, in under 30 seconds, entirely in your browser. Nothing is uploaded." },
      {
        type: 'ifc-demo',
        modelId: 'duplex-architecture',
        title: 'Check GlobalIds in a real model',
        description: "Open the buildingSMART duplex to see a clean GlobalId report, then drop in two consecutive exports of your own model to spot which elements had their IDs regenerated.",
        schema: 'IFC2x3',
        size: '2.4 MB',
      },
      { type: 'h2', text: 'How to Keep GUIDs Stable' },
      { type: 'h3', text: 'Revit' },
      { type: 'p', text: "Use the open-source IFC exporter, and in File → Export → IFC → Modify Setup → Advanced, set \"Export IFC GUIDs\" to \"Keep Existing\" (never \"Generate New\"). This reuses the stable GlobalId Revit stores per element instead of minting a new one each export. For elements that split into multiple IFC entities, accept that the sub-entities may not be perfectly stable — anchor your coordination on the host element's ID." },
      { type: 'h3', text: 'ArchiCAD' },
      { type: 'p', text: "In the IFC Translator settings, enable \"Write stable GlobalIDs (from AC internal IDs)\". Without it, ArchiCAD derives GlobalIds in a way that can shift between exports." },
      { type: 'h3', text: 'Fixing what already drifted' },
      { type: 'p', text: "If a file already contains invalid or duplicate GlobalIds, the validator can auto-fix them: it generates a fresh, spec-compliant 22-character GlobalId using the correct base-64 alphabet with a leading character in 0–3. Use this to repair a delivered file's format — but fix the export setting upstream too, or the next re-export reintroduces the drift." },
      { type: 'callout', variant: 'tip', text: "Put it in the BEP: 'IFC deliveries must use stable GlobalIds across revisions (Keep Existing). Files with out-of-range or duplicate GlobalIds will be rejected at the CDE.' One sentence prevents an entire class of coordination failures." },
      { type: 'p', text: ["Related reading on the duplicate-GUID case (two elements, one ID) and the full set of structural checks: see ", { text: 'Duplicate GUIDs in IFC', to: 'duplicate-guids-ifc' }, ' and ', { text: 'The 7 Most Common IFC Validation Errors', to: 'common-ifc-validation-errors' }, ' in this blog.'] },
    ],
  },

  // ── Post 11 — Quick win: properties missing after Revit export ───────────────

  {
    slug: 'ifc-properties-missing-after-export',
    title: 'IFC Properties Missing After Export From Revit? The Fix Checklist',
    excerpt: "You exported the model, opened the IFC, and half your parameters are gone — or worse, they exported fine for you but vanished when a colleague ran the same export. Here's the checklist that explains why IFC properties go missing from Revit and how to get every one of them across.",
    date: '2026-06-03',
    readTimeMin: 8,
    category: 'Tool Guides',
    categorySlug: 'tool-guides',
    author: 'IFC Viewer Team',
    content: [
      { type: 'p', text: "Missing properties is one of the most reported IFC export problems, and it's rarely a single bug — it's four or five distinct causes that all look identical from the outside: you open the exported IFC and the data you expected just isn't there. The frustrating part is that the geometry is perfect, so nothing looks broken until someone downstream goes looking for a parameter that should be on every element." },
      { type: 'p', text: "Before you change a single export setting, confirm the properties are actually missing rather than just hiding under a different property set name. Open the IFC and click any element — the full property set list shows you exactly which Psets and values survived the export." },
      {
        type: 'ifc-demo',
        modelId: 'duplex-architecture',
        title: 'Inspect property sets on a real model',
        description: "Open the buildingSMART duplex, click any wall, and browse its complete property sets. Then open your own export and check whether your parameters made it across — and under which Pset.",
        schema: 'IFC2x3',
        size: '2.4 MB',
      },
      { type: 'h2', text: "Cause 1: The Parameter Has No Value" },
      { type: 'p', text: "The single most common reason. If a Revit parameter is empty for an element, the IFC exporter drops it for that element rather than writing an empty property. In the export mapping UI those parameters often appear greyed out. The fix is upstream: populate the parameter in Revit. An empty parameter is not exported, full stop." },
      { type: 'h2', text: "Cause 2: Unit Mismatch With the IFC Schema" },
      { type: 'p', text: "When a Revit parameter shares its name with a standard IFC property but uses a different unit type (a length parameter mapping to a property the schema expects as a count, for example), the exporter can refuse to write it. The value exists, but it silently fails to map." },
      { type: 'callout', variant: 'tip', text: "Workaround for a unit mismatch: create a new Revit parameter with a different name and the correct data type, then map that parameter to the target IFC property in your Pset mapping file. This sidesteps the name collision that's blocking the export." },
      { type: 'h2', text: "Cause 3: Custom Pset Mapping File Problems" },
      { type: 'p', text: "Custom property sets are driven by a text mapping file (the IFC export user-defined Pset configuration). If a property name in that file doesn't exactly match a Revit parameter — wrong spelling, wrong case, wrong data type token, or a parameter that doesn't exist in the model — that line produces nothing. No error, just a missing property." },
      { type: 'ul', items: [
        "Confirm the mapping file is actually selected in the export setup (it resets between sessions and machines).",
        "Match parameter names exactly, including case and spacing.",
        "Make sure the declared data type (Text, Real, Integer, Boolean) matches the Revit parameter's type.",
        "Verify the parameter exists on the categories you're exporting — a wall Pset line won't populate doors.",
      ]},
      { type: 'h2', text: "Cause 4: It Works for One Person but Not Another" },
      { type: 'p', text: "A genuinely confusing case reported repeatedly: the same model exports all parameters when one team member runs it, but loses shared parameters when a colleague exports it. The usual culprit is that shared parameters and the custom Pset mapping file are stored locally per machine. If the shared parameter file or the mapping file isn't identical on both workstations, the export silently differs." },
      { type: 'callout', variant: 'warning', text: "Store the shared parameter file and the IFC Pset mapping file on a shared network location or in your project template, and point everyone's Revit at the same copy. Per-machine local files are the reason 'the same export' produces different IFC data for different people." },
      { type: 'h2', text: "Cause 5: Standard Psets Were Never Enabled" },
      { type: 'p', text: "Common Property Sets (Pset_WallCommon, Pset_DoorCommon, and so on) are the schema-standardised data that any receiving tool knows how to read — the passport data of your model. They are not always exported by default. In the IFC export setup, enable \"Export IFC Common Property Sets\" so the standard Psets are written alongside any custom ones." },
      { type: 'h2', text: "The Pre-Delivery Property Checklist" },
      { type: 'ol', items: [
        "Populate empty parameters in Revit — empty values are never exported.",
        "Enable 'Export IFC Common Property Sets' so standard Psets are included.",
        "Select your custom Pset mapping file in the export setup (check it didn't reset).",
        "Confirm the shared parameter file and mapping file are identical across the team.",
        "Resolve unit mismatches by remapping to a correctly-typed parameter.",
        "Export to a local folder, open the IFC, and verify the properties survived — before the file reaches the CDE.",
      ]},
      { type: 'p', text: ["For the export settings that prevent GUID, coordinate, and proxy problems at the same time, see ", { text: 'How to Export Clean IFC Files from Revit', to: 'clean-ifc-export-revit' }, ". To confirm nothing else is wrong before delivery, ", { text: 'run a full validation', to: 'how-to-validate-ifc-file' }, " and target a Health Score of 80 or above."] },
    ],
  },

  // ── Post 12 — High leverage: validate IFC before sending (BOFU) ──────────────

  {
    slug: 'how-to-validate-ifc-file',
    title: 'How to Validate an IFC File Before You Send It (Free, No Upload)',
    excerpt: "Your BEP says 'deliver a quality IFC' but never defines how to check it. Here are the three real ways to validate an IFC file — the buildingSMART service, IfcOpenShell, and an in-browser health check — what each one actually catches, and which to use before you hit send.",
    date: '2026-06-03',
    readTimeMin: 9,
    category: 'Validation',
    categorySlug: 'validation',
    author: 'IFC Viewer Team',
    content: [
      { type: 'p', text: "Almost everyone exports an IFC and sends it. Almost no one checks it first — not because they don't care, but because 'validate the IFC' is genuinely ambiguous. Validate against what? The schema? The project requirements? Whether it'll open in the coordinator's tool? Those are three different questions with three different tools, and conflating them is why so many models get rejected at the Common Data Environment." },
      { type: 'p', text: "This is the practical map: what 'valid' means, the three ways to check it, and what each one will and won't catch." },
      { type: 'h2', text: "What 'Valid' Actually Means" },
      { type: 'p', text: "There are two layers, and they're independent. A file can pass one and fail the other." },
      {
        type: 'feature-grid',
        items: [
          { icon: '📐', title: 'Schema validity', body: "Does the file conform to the IFC standard (ISO 10303-21 syntax, IFC schema, MVD rules)? A file can be schema-valid and still be useless for coordination." },
          { icon: '🩺', title: 'Practical health', body: "Will it actually work downstream? Stable GUIDs, correct spatial hierarchy, named elements, sensible coordinates, present property sets. This is what gets models rejected — and it's not what schema checkers measure." },
        ],
      },
      { type: 'callout', variant: 'info', text: "A file with zero schema errors can still score 40 on a practical health check — broken spatial hierarchy, thousands of unnamed elements, geometry 10 km from the origin. Schema-valid does not mean delivery-ready." },
      { type: 'h2', text: 'Option 1: The buildingSMART Validation Service' },
      { type: 'p', text: "The official, free, web-based service from buildingSMART International. It judges conformity against the IFC standard: STEP syntax, schema compliance, normative rules, and buildingSMART Data Dictionary alignment. It produces an authoritative pass/fail report — this is the reference for schema correctness." },
      { type: 'ul', items: [
        "Best for: certifying that a file conforms to the IFC standard, especially for formal or contractual schema-conformance claims.",
        "What it doesn't do: it isn't a practical 'is this good enough to coordinate' score, and you upload the file to a service — a non-starter for confidential project data you can't send to a third party.",
      ]},
      { type: 'h2', text: 'Option 2: IfcOpenShell (for developers)' },
      { type: 'p', text: "If you write Python, IfcOpenShell validates from the command line: python -m ifcopenshell.validate model.ifc. It's scriptable, free, runs locally, and integrates into CI pipelines for teams that automate QA." },
      {
        type: 'code',
        lang: 'bash',
        text: `# Validate an IFC file locally with IfcOpenShell
python -m ifcopenshell.validate path/to/model.ifc

# Pipe the results into your own pre-delivery checks
python validate_and_score.py model.ifc`,
      },
      { type: 'ul', items: [
        "Best for: developers and BIM-automation teams who want validation inside a script or build pipeline.",
        "What it doesn't do: there's no 3D view and no one-click report — a coordinator who just wants to know if the model is OK won't install Python for it.",
      ]},
      { type: 'h2', text: 'Option 3: An In-Browser Health Check (30 Seconds)' },
      { type: 'p', text: "Drag the IFC into the viewer. It parses client-side via WebAssembly — nothing is uploaded — runs 38 practical validation rules in a background thread, and returns a single Health Score from 0 to 100 plus a per-issue breakdown you can see against the 3D model. This is the layer the other two don't cover: a fast, private, practical judgment of whether the model is fit to send." },
      {
        type: 'ifc-demo',
        modelId: 'duplex-architecture',
        title: 'Validate a model live',
        description: "Open the buildingSMART duplex to see a clean Health Score and report, then drop in your own export to check it before delivery. Your file never leaves your machine.",
        schema: 'IFC2x3',
        size: '2.4 MB',
      },
      { type: 'h2', text: 'Which One to Use, When' },
      {
        type: 'comparison',
        left: {
          label: 'Use the in-browser health check when…',
          color: 'accent',
          items: [
            'You want to know if a model is fit to send, right now',
            "The file is confidential and can't be uploaded anywhere",
            'You need a number to put in a transmittal or BEP',
            'You want to see issues against the 3D model, not just a log',
            'You are a coordinator, not a developer',
          ],
        },
        right: {
          label: 'Use buildingSMART / IfcOpenShell when…',
          color: 'muted',
          items: [
            'You need authoritative schema-conformance certification',
            'You are automating QA inside a CI pipeline (IfcOpenShell)',
            'You write Python and want scriptable checks',
            'A contract requires a formal standard-conformance statement',
            'You need MVD / bSDD compliance specifically',
          ],
        },
      },
      { type: 'h2', text: 'The Practical Pre-Send Checklist' },
      { type: 'p', text: "Whatever tool you use, these are the things that actually get models rejected. Each maps to a validation rule with a step-by-step fix guide:" },
      { type: 'ol', items: [
        'No duplicate or out-of-range GlobalIds.',
        'Every physical element sits inside a storey, not directly under Site or Building.',
        'Exactly one IfcProject at the root, with a complete spatial hierarchy.',
        'No orphan elements and no broken aggregates.',
        'Coordinates are sensible — the model is near the world origin, not kilometres away.',
        'Standard property sets are present; elements are named.',
        'Health Score ≥ 80 before any CDE upload.',
      ]},
      { type: 'callout', variant: 'tip', text: "Make it contractual: 'IFC deliveries must achieve a Health Score ≥ 80, validated before upload, with the score attached to the transmittal.' A schema-only check won't enforce delivery quality — a practical score will." },
    ],
  },

  // ── Post 13 — High leverage: large IFC crashes the browser ───────────────────

  {
    slug: 'large-ifc-file-browser-crash',
    title: 'Why Large IFC Files Crash Your Browser (and How to View a 1 GB Model)',
    excerpt: "A 600 MB federated IFC, 1.7 GB of RAM, 3 frames per second, then the tab dies. Large IFC files break most web viewers for concrete technical reasons. Here's what's actually happening — and how to open a model that size without a server or a high-end workstation.",
    date: '2026-06-03',
    readTimeMin: 9,
    category: 'Tool Guides',
    categorySlug: 'tool-guides',
    author: 'IFC Viewer Team',
    content: [
      { type: 'p', text: "Everyone who works with federated models hits the same wall: the combined architectural + structural + MEP IFC is 600 MB to over 1 GB, and the moment you try to open it in a browser the fan spins up, memory climbs past 1.7 GB, the frame rate drops to single digits, and eventually the tab crashes. It's not that you're doing anything wrong. Large IFC files break most web viewers for very specific reasons." },
      {
        type: 'stat-row',
        stats: [
          { value: 1,   suffix: ' GB+', label: 'typical federated model' },
          { value: 1.7, suffix: ' GB', label: 'RAM even when optimized' },
          { value: 3,   suffix: ' FPS', label: 'unoptimized models' },
          { value: 12,  suffix: '×', label: 'slower: open-source vs commercial' },
        ],
      },
      { type: 'h2', text: 'Why Large IFC Files Crash the Browser' },
      {
        type: 'feature-grid',
        items: [
          { icon: '🧵', title: 'Single-threaded parsing', body: "Converting IFC text into 3D geometry is CPU-intensive and traditionally runs on one thread. The whole file has to be parsed before anything renders, so the UI freezes while it works." },
          { icon: '🧠', title: 'Memory ceiling', body: "Even an optimized model can consume ~1.7 GB of RAM. On an 8 GB laptop the browser hits its per-tab memory limit and the renderer is killed — that's the 'tab crashed' page." },
          { icon: '🔺', title: 'Tessellation cost', body: "IFC geometry is often defined as parametric solids (extrusions, sweeps). Tessellating them into triangle meshes for WebGL multiplies the data and the work — millions of triangles to push every frame." },
          { icon: '📥', title: 'Load-everything-first', body: "Most viewers download and convert the entire file up front, even though you only ever look at a fraction of it at once. Nothing is rendered until everything is processed." },
        ],
      },
      { type: 'h2', text: 'Why Open-Source Viewers Feel Slower Than Commercial Ones' },
      { type: 'p', text: "A widely-shared community benchmark put it starkly: a 288 MB electrical model took around 830 seconds to load in one open-source tool versus about 67 seconds in a commercial viewer — over 12× slower. The gap isn't magic. Commercial viewers often avoid full tessellation by representing parametric forms more directly, and they pre-process models on a server into a streaming-optimized format before you ever open them." },
      {
        type: 'pull-quote',
        text: "830 seconds in an open-source viewer versus 67 in a commercial one. What's the secret sauce here?",
        cite: 'IfcOpenShell GitHub — viewing large federated models',
      },
      { type: 'p', text: "The 'secret sauce' is preprocessing and streaming — and that's also the catch. The fastest open-source pipelines (converting IFC to xeokit's XKT, or to glTF) require technical knowledge and a server to do the conversion. That's fine for a product team, but it's not something a coordinator can do with a file a client just emailed them." },
      { type: 'h2', text: 'The Strategies That Actually Help' },
      { type: 'ul', items: [
        "Convert once, load many: parse the IFC into a fast geometry format (Fragments, XKT, or glTF/GLB) one time, then load that on every subsequent open. Runtime IFC parsing is too slow for repeated use.",
        "Tiling: split the model into spatial chunks so only what's near the camera is loaded and drawn.",
        "Culling: skip geometry that's off-screen or occluded instead of pushing it to the GPU every frame.",
        "Geometry compression: deduplicate repeated elements (every identical bolt or baluster references one mesh) and quantize coordinates to shrink the payload.",
        "Reduce the file before you open it: export only the disciplines you need, and zip it (ifcZIP) for transfer.",
      ]},
      { type: 'h2', text: 'How to Open a Large Model Without a Server or Upload' },
      { type: 'p', text: "This viewer parses IFC client-side with WebAssembly and caches the converted geometry in the browser's Origin Private File System, so the expensive parse happens once and repeat loads are roughly 10× faster. There's no upload step and no server to set up — you get the convert-once benefit of a commercial pipeline without sending your model anywhere. Federating several discipline models in one view works the same way: load them one after another." },
      {
        type: 'ifc-demo',
        modelId: 'ifc4-revit-arc',
        title: 'Open a real-size model',
        description: "A full Revit-exported IFC4 architecture model at production size. Open it to see how a larger file loads and caches in the browser — then try your own heavy federated model.",
        schema: 'IFC4',
        size: '14 MB',
      },
      { type: 'callout', variant: 'tip', text: "If a model still struggles, trim it before loading: export per discipline rather than one monolithic file, drop detail you don't need for the task at hand, and prefer IFC4 — its tessellated geometry is typically far smaller than the equivalent IFC2x3 B-rep notation. See 'IFC2x3 vs IFC4' in this blog." },
      { type: 'p', text: "The takeaway: you don't need a 64 GB workstation or a paid platform to inspect a 1 GB model. You need a pipeline that parses once, caches the result, and only draws what you're looking at — and you can get that in a browser tab." },
    ],
  },

  // ── Post 14 — Why your Revit IFC export breaks (geometry) ────────────────────

  {
    slug: 'revit-ifc-export-breaks',
    title: 'Why Your Revit IFC Export Breaks (and How to Fix Each Cause)',
    excerpt: "The geometry exported fine last week. This week elements are on the wrong floor, walls are missing, and the whole model is sitting in the wrong place. Revit IFC exports break for a handful of predictable reasons — here's how to identify which one bit you, and fix it.",
    date: '2026-06-03',
    readTimeMin: 9,
    category: 'Tool Guides',
    categorySlug: 'tool-guides',
    author: 'IFC Viewer Team',
    content: [
      { type: 'p', text: "\"My Revit IFC export breaks\" is the single most common complaint in BIM forums, and it's frustrating precisely because it's vague — 'breaks' can mean geometry on the wrong level, missing elements, distorted shapes, or a model sitting kilometres from where it should be. Each of those has a different, identifiable cause. This is how to tell them apart and fix the right one instead of guessing." },
      { type: 'p', text: "Start by confirming what actually broke. Open the exported IFC and look: is the geometry distorted, or just in the wrong place? Are elements missing, or just on an unexpected storey? The answer points straight at the cause." },
      {
        type: 'ifc-demo',
        modelId: 'duplex-architecture',
        title: 'See what a clean export looks like',
        description: "Open the buildingSMART duplex to see correct geometry and spatial hierarchy, then open your own broken export and compare — the difference usually makes the cause obvious.",
        schema: 'IFC2x3',
        size: '2.4 MB',
      },
      { type: 'h2', text: 'Cause 1: Geometry Lands on the Wrong Level' },
      { type: 'p', text: "If an element sits on a Revit level that isn't marked as a Building Story, the exporter pushes it down to the next story below — which is why things appear on unexpected floors. Revit only treats levels flagged as Building Story as real storeys in the IFC spatial hierarchy." },
      { type: 'callout', variant: 'tip', text: "Create a level schedule in Revit and set 'Building Story = Yes' only for real occupied storeys. Leave working/reference levels (top-of-steel, datums) unchecked. This single fix resolves most 'elements on the wrong floor' exports." },
      { type: 'h2', text: 'Cause 2: You Opened the IFC Instead of Linking It' },
      { type: 'p', text: "When you open an IFC in Revit, it tries to recreate native Revit elements from the IFC geometry. That works for simple walls and quickly falls apart on complex geometry — curved surfaces, intricate families, anything non-trivial gets mangled. When you link an IFC instead, Revit uses the translation framework to create a clean reference model, and you can update the link when new files arrive." },
      { type: 'ul', items: [
        "Open (Import): use only when you genuinely need editable native Revit elements and the geometry is simple.",
        "Link: use for coordination and review. The geometry stays clean and updates non-destructively.",
      ]},
      { type: 'h2', text: 'Cause 3: The Whole Model Is in the Wrong Place' },
      { type: 'p', text: "If the exported model sits far from the origin — or the geometry looks subtly distorted — it's a coordinate problem. IFC is imported according to Revit's Internal Origin regardless of the Project Base Point and Survey Point, and geometry placed far from the world origin can distort due to floating-point precision. This is its own deep topic; the short version is to export with Shared Coordinates and keep the model near the origin." },
      { type: 'p', text: ["For the full survey-point / base-point / georeferencing breakdown, see ", { text: 'IFC Coordinates Are Wrong', to: 'ifc-coordinates-georeferencing' }, " in this blog."] },
      { type: 'h2', text: 'Cause 4: Elements Are Missing or Became Proxies' },
      { type: 'p', text: "Two related failures. Elements can vanish if they lost their host storey on export (they become orphans most viewers skip). And Revit families without an IFC class mapping export as IfcBuildingElementProxy — they're technically present but typeless, so downstream tools treat them as generic blobs. If more than a few percent of your model is IfcBuildingElementProxy, your export mapping table needs attention." },
      { type: 'h2', text: 'Cause 5: Properties or GUIDs Came Across Wrong' },
      { type: 'p', text: ["If the geometry is fine but the data is wrong, you're looking at the two other classic export failures: missing property sets and regenerated GlobalIds. Both are common enough to have their own guides — see ", { text: 'IFC Properties Missing After Export', to: 'ifc-properties-missing-after-export' }, ' and ', { text: 'Why IFC GUIDs Change on Every Export', to: 'ifc-guids-changing-every-export' }, ' in this blog.'] },
      { type: 'h2', text: 'The Diagnostic Workflow' },
      { type: 'ol', items: [
        'Export to a local folder — never straight to the CDE.',
        'Open the IFC in a validator and look at the 3D result before anyone else does.',
        'Wrong floor? Fix Building Story flags (Cause 1).',
        'Mangled geometry on import? Link instead of open (Cause 2).',
        'Model far away or distorted? Shared Coordinates + near origin (Cause 3).',
        'Missing elements / too many proxies? Fix the IFC mapping table (Cause 4).',
        'Run validation, target Health Score ≥ 80, then deliver.',
      ]},
      { type: 'callout', variant: 'warning', text: "Never debug a broken export by editing the IFC text file. Fix the cause in Revit and re-export — a hand-edited IFC almost always introduces new problems (invalid GUIDs, broken references) that are harder to find than the original." },
    ],
  },

  // ── Post 15 — PILLAR: The Complete Guide to IFC Quality ──────────────────────

  {
    slug: 'ifc-quality-guide',
    title: 'The Complete Guide to IFC Quality: From Export to Delivery',
    excerpt: "Every BEP demands a 'quality IFC' and almost none define it. This is the complete, practical guide to what IFC quality actually means — the failure categories that get models rejected, how to check each one, and a repeatable workflow that gets you to a deliverable file.",
    date: '2026-06-03',
    readTimeMin: 12,
    category: 'BIM Best Practices',
    categorySlug: 'best-practices',
    author: 'IFC Viewer Team',
    content: [
      { type: 'p', text: "If you only read one article on IFC quality, make it this one. It ties together every failure mode that gets a model rejected at the Common Data Environment — and links out to the detailed fix for each. The goal is simple: a file you can deliver with confidence, every time, without surprises three weeks into coordination." },
      { type: 'p', text: "'IFC quality' isn't one thing. It's six categories of failure, each with its own causes, detection, and fix. Understand the map and the rest is mechanical." },
      {
        type: 'stat-row',
        stats: [
          { value: 6,  suffix: '', label: 'failure categories' },
          { value: 38, suffix: '', label: 'validation rules' },
          { value: 80, suffix: '+', label: 'Health Score to deliver' },
          { value: 30, suffix: 's', label: 'to validate any model' },
        ],
      },
      { type: 'h2', text: 'Two Layers: Schema Validity vs Practical Health' },
      { type: 'p', text: ["First, the distinction that confuses everyone. Schema validity means the file conforms to the IFC standard's syntax and structure. Practical health means it'll actually work downstream — stable identities, sound hierarchy, sensible coordinates, present data. A file can be schema-valid and practically broken. Most rejected deliveries are schema-valid. For how to check each layer, see ", { text: 'How to Validate an IFC File Before You Send It', to: 'how-to-validate-ifc-file' }, "."] },
      { type: 'h2', text: 'The Six Failure Categories' },
      {
        type: 'feature-grid',
        items: [
          { icon: '🪪', title: '1. Identity (GUIDs)', body: "Duplicate, regenerated, or out-of-range GlobalIds break BCF, clash tracking, and FM handover. Identity must be stable across revisions." },
          { icon: '🌳', title: '2. Spatial hierarchy', body: "Project → Site → Building → Storey → elements. Orphans, wrong containers, broken aggregates, or a missing IfcProject corrupt the tree." },
          { icon: '📍', title: '3. Coordinates', body: "Models kilometres from the origin, or with the wrong base/survey point, place geometry wrong and can distort it via floating-point error." },
          { icon: '🏷️', title: '4. Data & properties', body: "Missing property sets, empty names, and unmapped proxies make the model unusable for takeoff, BCF, and asset registers." },
          { icon: '📦', title: '5. Geometry & export', body: "Wrong-floor placement, import-vs-link mangling, and proxy overuse — usually traceable to Revit/ArchiCAD export settings." },
          { icon: '⚡', title: '6. Performance & size', body: "1 GB monolithic files that crash viewers. Trim by discipline, prefer IFC4, and use a convert-once pipeline." },
        ],
      },
      { type: 'h2', text: 'Category 1: Identity' },
      { type: 'p', text: ["GlobalIds are the permanent identity of every element. They must be unique within a file, valid in format (22 chars, leading character 0–3), and stable across re-exports. See ", { text: 'Duplicate GUIDs in IFC', to: 'duplicate-guids-ifc' }, ' and ', { text: 'Why IFC GUIDs Change on Every Export', to: 'ifc-guids-changing-every-export' }, ' for detection and fixes.'] },
      { type: 'h2', text: 'Category 2: Spatial Hierarchy' },
      { type: 'p', text: ["IFC mandates a strict containment order. Elements must sit inside a storey, there must be exactly one IfcProject, and aggregate relationships must point at entities that exist. The detailed checklist is in ", { text: 'The 7 Most Common IFC Validation Errors', to: 'common-ifc-validation-errors' }, "."] },
      { type: 'h2', text: 'Category 3: Coordinates' },
      { type: 'p', text: ["Export with Shared Coordinates, keep the model near the world origin, and for georeferenced projects make sure IfcSite, IfcProjectedCRS, and IfcMapConversion are present and consistent. Full breakdown in ", { text: 'IFC Coordinates Are Wrong', to: 'ifc-coordinates-georeferencing' }, "."] },
      { type: 'h2', text: 'Category 4: Data & Properties' },
      { type: 'p', text: ["Enable standard property sets, name every element, and map families to proper IFC classes so they don't export as proxies. See ", { text: 'IFC Properties Missing After Export From Revit', to: 'ifc-properties-missing-after-export' }, "."] },
      { type: 'h2', text: 'Category 5: Geometry & Export' },
      { type: 'p', text: ["Most geometry failures originate in the authoring tool's export settings. See ", { text: 'How to Export Clean IFC Files from Revit', to: 'clean-ifc-export-revit' }, ', ', { text: 'Why Your Revit IFC Export Breaks', to: 'revit-ifc-export-breaks' }, ', and — for cross-tool exchange — ', { text: 'Revit ↔ Archicad via IFC', to: 'revit-archicad-ifc-roundtrip' }, '.'] },
      { type: 'h2', text: 'Category 6: Performance & Size' },
      { type: 'p', text: ["Large files aren't a quality failure per se, but they block everyone downstream. Trim, prefer IFC4 tessellation, and use a convert-once viewer. See ", { text: 'Why Large IFC Files Crash Your Browser', to: 'large-ifc-file-browser-crash' }, "."] },
      { type: 'h2', text: 'The Health Score: One Number Across All Six' },
      { type: 'p', text: "A Health Score collapses all six categories into a single 0–100 number, severity-weighted and logarithmic, so it reflects real fitness rather than raw issue count. It's the number to put in your BEP and attach to every transmittal." },
      {
        type: 'health-score',
        items: [
          { score: 43, label: 'Critical — do not deliver' },
          { score: 73, label: 'Needs work' },
          { score: 87, label: 'CDE ready' },
          { score: 96, label: 'Excellence' },
        ],
      },
      { type: 'h2', text: 'The Repeatable Pre-Delivery Workflow' },
      { type: 'ol', items: [
        'Configure export settings once (Keep Existing GUIDs, Shared Coordinates, standard Psets, Building Story flags).',
        'Export to a local folder, never straight to the CDE.',
        'Open the file in a validator and read the report across all six categories.',
        'Fix at the source in the authoring tool, then re-export — not by editing the IFC text.',
        'Re-validate until Health Score ≥ 80.',
        'Attach the score to the transmittal and deliver.',
      ]},
      {
        type: 'ifc-demo',
        modelId: 'duplex-architecture',
        title: 'Run the full quality check',
        description: "Open a real model and see all six categories scored in one report. Then drop in your own file and walk the pre-delivery workflow end to end.",
        schema: 'IFC2x3',
        size: '2.4 MB',
      },
      { type: 'callout', variant: 'info', text: "Bookmark this guide as your team's IFC quality reference. Each category links to a step-by-step fix — together they cover the vast majority of CDE rejections." },
    ],
  },

  // ── Post 16 — IFC coordinates / georeferencing ───────────────────────────────

  {
    slug: 'ifc-coordinates-georeferencing',
    title: 'IFC Coordinates Are Wrong: Survey Point, Base Point & Georeferencing Explained',
    excerpt: "You import the IFC and the building is two kilometres away — or sitting at the origin when it should be georeferenced to a national grid. Revit's three coordinate systems and IFC's georeferencing entities don't line up by default. Here's how to get the model where it belongs.",
    date: '2026-06-03',
    readTimeMin: 9,
    category: 'IFC Tips',
    categorySlug: 'ifc-tips',
    author: 'IFC Viewer Team',
    content: [
      { type: 'p', text: "Coordinate problems are some of the most disorienting IFC failures: the geometry is perfect, but the model is in the wrong place — far from the origin, offset from the other disciplines, or missing its real-world position entirely. The root cause is that Revit has three different origins and IFC has its own georeferencing entities, and nothing maps them together unless you make it." },
      { type: 'h2', text: "Revit's Three Origins" },
      {
        type: 'feature-grid',
        items: [
          { icon: '⚙️', title: 'Internal Origin', body: "Revit's fixed internal (0,0,0). IFC import positions geometry relative to this — regardless of the other two points. This is why imported IFCs often land in the 'wrong' place." },
          { icon: '📌', title: 'Project Base Point', body: "The project's local reference (e.g. a grid intersection). Used for setting-out dimensions within the design." },
          { icon: '🌍', title: 'Survey Point', body: "The real-world / geodetic reference that ties the model to a site or national grid. The basis for true georeferencing." },
        ],
      },
      { type: 'callout', variant: 'warning', text: "IFC files are imported according to Revit's Internal Origin, not the Project Base Point or Survey Point. If the survey point carries no relation to the internal origin, coordinates can come out wrong when the model moves between Revit, IFC, and GIS." },
      { type: 'h2', text: 'IFC4 Georeferencing Entities' },
      { type: 'p', text: "Georeferencing is embedded in IFC4 via three entities working together. Get them right and any compliant tool can place your model on the planet." },
      { type: 'ul', items: [
        "IfcSite — carries the site's reference latitude, longitude, and elevation.",
        "IfcProjectedCRS — declares the coordinate reference system (e.g. an EPSG code for a national grid).",
        "IfcMapConversion — the transform (offset, scale, rotation) from the model's local engineering coordinates to the projected CRS.",
      ]},
      { type: 'callout', variant: 'info', text: "If there's a discrepancy between IfcMapConversion and the data in IfcSite, IfcMapConversion takes priority. Don't rely on IfcSite latitude/longitude alone for precise positioning — the map conversion is the authoritative transform." },
      { type: 'h2', text: 'Why Geometry Distorts Far From the Origin' },
      { type: 'p', text: "When a model's local coordinates are huge — because someone modelled at true national-grid easting/northing values — 3D engines lose precision. Floating-point numbers have finite resolution; at coordinates in the millions, that resolution is coarse enough to make geometry wobble or jitter. The fix is to model near a local origin and carry the real-world position in IfcMapConversion, not in the geometry itself." },
      { type: 'h2', text: 'Getting It Right on Export' },
      { type: 'ol', items: [
        'Set the Survey Point to the agreed real-world reference for the project.',
        'Model near the Project Base Point / internal origin — not at true grid coordinates.',
        'Export with Shared Coordinates / Site Placement set to shared.',
        'For IFC4 / IFC4.3 deliveries, confirm IfcSite, IfcProjectedCRS, and IfcMapConversion are written and consistent.',
        'Open the result and check the model sits where expected before delivery.',
      ]},
      {
        type: 'ifc-demo',
        modelId: 'duplex-architecture',
        title: 'Check where your model actually sits',
        description: "Open a model in the viewer and inspect its placement and spatial structure. Then load your own export to confirm it lands at the origin, not kilometres away.",
        schema: 'IFC2x3',
        size: '2.4 MB',
      },
      { type: 'p', text: ["Coordinates are part of the broader quality picture — for the full pre-delivery framework see ", { text: 'The Complete Guide to IFC Quality', to: 'ifc-quality-guide' }, ". And note that IFC 4.3 extends georeferencing significantly for infrastructure (roads, rail, bridges), where alignment and linear positioning add another layer on top of the entities above."] },
    ],
  },

  // ── Post 17 — Revit ↔ Archicad round-trip ────────────────────────────────────

  {
    slug: 'revit-archicad-ifc-roundtrip',
    title: 'Revit ↔ Archicad via IFC: The Round-Trip Problems Nobody Warns You About',
    excerpt: "You link an Archicad IFC into Revit and find duplicate geometry floating hundreds of feet in the air — even though the same file looks perfect in the cloud viewer. Cross-tool IFC exchange has failure modes that only show up between vendors. Here's what breaks and how to work around it.",
    date: '2026-06-03',
    readTimeMin: 8,
    category: 'IFC Tips',
    categorySlug: 'ifc-tips',
    author: 'IFC Viewer Team',
    content: [
      { type: 'p', text: "IFC is supposed to make tool choice irrelevant — the architect uses Archicad, the engineer uses Revit, and the open format bridges them. In practice, the Revit ↔ Archicad exchange has failure modes that only appear when you cross vendors, and they cause real coordination headaches because the file looks fine right up until it doesn't." },
      { type: 'pull-quote', text: "Random duplicates of geometry, suspended hundreds of feet in the air — even though the IFC displays correctly in the online viewer.", cite: 'Autodesk Community — Revit & Archicad interoperability' },
      { type: 'h2', text: 'The Symptom: It Looks Fine in One Tool, Broken in Another' },
      { type: 'p', text: "The most reported failure: an Archicad IFC links into Revit with phantom duplicate geometry, sometimes displaced far from the model — yet the exact same file renders perfectly in a cloud viewer. This is the key diagnostic clue. When a file is correct in one tool and broken in another, the file is usually fine; the importer is interpreting it differently." },
      { type: 'callout', variant: 'tip', text: "Always sanity-check a cross-tool IFC in a neutral viewer first. If it's correct there but broken in Revit's link, the problem is Revit's IFC import interpretation, not the Archicad export — which changes how you fix it." },
      { type: 'h2', text: 'What Actually Goes Wrong' },
      { type: 'ul', items: [
        "Import interpretation differences: each vendor's importer rebuilds geometry from the IFC representation its own way. Representations that are valid but unusual (certain swept solids, mapped items) can be doubled or misplaced by a different tool's importer.",
        "Open vs Link: opening an Archicad IFC in Revit forces a conversion to native elements that mangles complex geometry. Linking uses the reference framework and stays clean — link, don't open.",
        "Source matters: the same IFC linked from a desktop folder versus from a cloud/CDE folder can produce different results, because the resolver path differs.",
        "GlobalId and mapping mismatches: Archicad and Revit don't always agree on how source elements map to IFC classes, which surfaces as type or identity drift across the round trip.",
      ]},
      { type: 'h2', text: 'How to Make the Exchange Reliable' },
      { type: 'ol', items: [
        'Agree the IFC schema and MVD up front (IFC4 Reference View is a good cross-tool default).',
        'On the Archicad side, enable stable GlobalIDs and a clean translator preset matched to the receiving tool.',
        'On the Revit side, link the IFC — never open/import it for coordination.',
        'Validate the IFC in a neutral viewer before linking, so you know whether a fault is in the file or the importer.',
        'If duplicates appear only in Revit, try linking from a local copy and check the import settings rather than blaming the export.',
      ]},
      {
        type: 'ifc-demo',
        modelId: 'duplex-architecture',
        title: 'Use a neutral viewer as the referee',
        description: "Open the cross-tool IFC here first. If it's clean in this viewer but broken after linking into Revit, you've isolated the problem to the importer — not the file.",
        schema: 'IFC2x3',
        size: '2.4 MB',
      },
      { type: 'p', text: ["Cross-tool exchange is one slice of overall model quality — for the complete pre-delivery framework see ", { text: 'The Complete Guide to IFC Quality', to: 'ifc-quality-guide' }, ', and for stable identities across the round trip see ', { text: 'Why IFC GUIDs Change on Every Export', to: 'ifc-guids-changing-every-export' }, '.'] },
    ],
  },

  // ── Post 18 — Comparison: free online IFC viewers ────────────────────────────

  {
    slug: 'free-online-ifc-viewers-compared',
    title: 'Free Online IFC Viewers Compared (2026): Privacy, Size Limits & Features',
    excerpt: "There are a dozen free browser-based IFC viewers now, and they make very different trade-offs — some upload your file to a server, some cap out at 10 MB, some have no validation at all. Here's an honest comparison to help you pick the right one for the job.",
    date: '2026-06-03',
    readTimeMin: 8,
    category: 'Tool Guides',
    categorySlug: 'tool-guides',
    author: 'IFC Viewer Team',
    content: [
      { type: 'p', text: "Free online IFC viewers have multiplied — you no longer need a £5,000 workstation to open an IFC. But 'free browser viewer' covers tools that work in fundamentally different ways, and the differences matter when the file is confidential, large, or needs checking rather than just looking at. This is a practical comparison of what to weigh up, not a leaderboard." },
      { type: 'h2', text: 'The Four Things That Actually Differ' },
      {
        type: 'feature-grid',
        items: [
          { icon: '🔒', title: 'Upload vs local', body: "The biggest divide. Some viewers send your file to a server to process it; others parse it entirely in your browser. For confidential project data, server upload is often a hard no." },
          { icon: '📏', title: 'File size limit', body: "Free tiers range from ~10 MB to ~500 MB or more. Many viewers that feel snappy on a demo choke on a real federated model." },
          { icon: '🩺', title: 'Validation', body: "Most viewers only display geometry. A few also check the model — duplicate GUIDs, spatial hierarchy, a quality score. This is the difference between looking and knowing." },
          { icon: '🔑', title: 'Account & storage', body: "Some require sign-up and store your models in the cloud (with quotas); others need no account and keep nothing." },
        ],
      },
      { type: 'h2', text: 'The Landscape in 2026' },
      { type: 'ul', items: [
        "Privacy-first, local viewers: parse the IFC client-side via WebAssembly, no upload, no account. Best for confidential files. (This viewer is in this category.)",
        "Upload-based cloud viewers: process server-side, often with collaboration features and cloud storage, usually behind a sign-up and a free-tier quota.",
        "Lightweight 'quick look' tools: open a small IFC fast with pan/zoom, but cap file size low and offer no property inspection or validation.",
        "LCA / platform viewers: an IFC viewer bolted onto a larger product (e.g. carbon or estimating tools), generous on size but tied to that platform's workflow.",
      ]},
      { type: 'h2', text: 'How to Choose for the Job in Front of You' },
      {
        type: 'comparison',
        left: {
          label: 'Pick a private, local viewer when…',
          color: 'accent',
          items: [
            "The file is confidential and can't be uploaded",
            'You need to validate, not just look',
            'You want a Health Score / quality report',
            'The model is large and you want convert-once caching',
            "You don't want to create an account",
          ],
        },
        right: {
          label: 'A cloud / platform viewer may fit when…',
          color: 'muted',
          items: [
            'You need persistent cloud storage of models',
            'You want built-in multi-user collaboration',
            'The viewer is part of a platform you already use',
            'Sharing a hosted link with non-technical reviewers matters',
            'File confidentiality is not a constraint',
          ],
        },
      },
      { type: 'h2', text: "Where This Viewer Fits" },
      { type: 'p', text: "This one is deliberately in the private/local camp: it parses IFC in your browser via WebAssembly (zero bytes uploaded, no account), handles files up to ~500 MB with convert-once caching, and — the part most free viewers skip — runs 38 validation rules and returns a Health Score. So it's not just 'can I see it', it's 'is it any good'." },
      {
        type: 'ifc-demo',
        modelId: 'duplex-architecture',
        title: 'Try the local + validation approach',
        description: "Open the buildingSMART duplex with no upload and no account, and see the Health Score appear automatically. Then drop in a file of your own to compare.",
        schema: 'IFC2x3',
        size: '2.4 MB',
      },
      { type: 'callout', variant: 'tip', text: "Quick decision rule: if the file is confidential or you need to check its quality, choose a local viewer with validation. If you need cloud storage and collaboration and confidentiality isn't a concern, a platform viewer makes sense. Match the tool to the constraint, not the brand." },
      { type: 'p', text: ["Once you've picked a viewer, the next question is usually whether the model is actually deliverable — for that, see ", { text: 'How to Validate an IFC File Before You Send It', to: 'how-to-validate-ifc-file' }, ' and ', { text: 'The Complete Guide to IFC Quality', to: 'ifc-quality-guide' }, '.'] },
    ],
  },

  // ── Post 19 — Reduce IFC file size ───────────────────────────────────────────

  {
    slug: 'reduce-ifc-file-size',
    title: 'How to Reduce IFC File Size (Without Breaking the Model)',
    excerpt: "A 900 MB IFC won't email, takes forever to open, and crashes the coordinator's viewer. You can usually cut it by 70–90% — but only some methods are safe. Here's how to shrink an IFC without destroying the data people need downstream.",
    date: '2026-06-03',
    readTimeMin: 7,
    category: 'Tool Guides',
    categorySlug: 'tool-guides',
    author: 'IFC Viewer Team',
    content: [
      { type: 'p', text: "Oversized IFC files are a daily friction: too big to email, slow to open, and prone to crashing browser viewers. The good news is that IFC files are full of redundancy, so large reductions are achievable. The catch is that some methods are lossless and safe while others throw away data the receiver needs — so the order you try them in matters." },
      {
        type: 'stat-row',
        stats: [
          { value: 90, suffix: '%', label: 'achievable reduction' },
          { value: 6,  suffix: '×', label: 'IFC4 vs IFC2x3 geometry' },
          { value: 0,  suffix: ' loss', label: 'from ifcZIP' },
          { value: 500, suffix: ' MB', label: 'typical viewer ceiling' },
        ],
      },
      { type: 'h2', text: 'Start Safe: Lossless Methods' },
      { type: 'h3', text: '1. ifcZIP (zero data loss)' },
      { type: 'p', text: "An ifcZIP is simply a standard ZIP containing one IFC file. It changes nothing about the model — every entity, property, and GUID is preserved — and IFC-aware tools open it directly. Because IFC is verbose text, compression ratios are often dramatic. This should always be your first move for transfer." },
      { type: 'h3', text: '2. Export to IFC4 instead of IFC2x3' },
      { type: 'p', text: ["IFC4 expresses complex geometry as tessellated meshes (IfcPolygonalFaceSet) rather than the heavier B-rep notation of IFC2x3. For detailed architecture the same model can be several times smaller in IFC4 — a free reduction if your receiving tools support IFC4. See ", { text: 'IFC2x3 vs IFC4', to: 'ifc2x3-vs-ifc4' }, " in this blog."] },
      { type: 'callout', variant: 'tip', text: "ifcZIP + IFC4 together are lossless and often get you most of the way. Try these before touching anything that removes data." },
      { type: 'h2', text: 'Then Trim: Reduce What You Export' },
      { type: 'p', text: "The biggest safe reductions come from not exporting what the recipient doesn't need. This is lossy by intent — you're deliberately scoping the model — so do it according to the BIM Execution Plan or the discipline's model requirements, not arbitrarily." },
      { type: 'ul', items: [
        "Export per discipline, not one monolithic federated file. The MEP coordinator rarely needs your furniture.",
        "Drop detail below the required LOD — fixtures, fasteners, and fine joinery you modelled for your own drawings.",
        "Limit the property sets to what's specified; gigantic custom Psets on every element add up.",
        "Exclude 2D annotation, generic models, and import-only reference geometry.",
      ]},
      { type: 'h2', text: 'Geometry Optimisation' },
      { type: 'p', text: "If the file is still heavy, the geometry itself can be optimised: deduplicate repeated elements so thousands of identical bolts or balusters reference a single mesh, and simplify over-tessellated curved surfaces. Some tools do this automatically; the key is that it changes geometry representation, not the model's data, so validate afterward." },
      { type: 'callout', variant: 'warning', text: "Avoid 'optimisers' that strip GlobalIds, property sets, or the spatial hierarchy to hit a size target. A 50 MB file that's lost its GUIDs and Psets is worthless for coordination and FM — you've made it small and useless. Always re-validate after any lossy step." },
      { type: 'h2', text: 'Verify After Shrinking' },
      { type: 'p', text: "Whatever you remove, confirm the slimmed file is still sound: open it, check the spatial hierarchy survived, the required properties are present, and the Health Score is still where it needs to be. Reducing size should never reduce deliverability." },
      {
        type: 'ifc-demo',
        modelId: 'duplex-architecture',
        title: 'Check a slimmed model is still healthy',
        description: "Open your reduced IFC and confirm the hierarchy, properties, and Health Score survived the trim — before you send it on.",
        schema: 'IFC2x3',
        size: '2.4 MB',
      },
      { type: 'p', text: ["If the goal is simply to view a huge model rather than deliver a smaller one, the file size may not be the real problem — see ", { text: 'Why Large IFC Files Crash Your Browser', to: 'large-ifc-file-browser-crash' }, " for the viewer-side fixes."] },
    ],
  },

  // ── Post 20 — Dev: read property sets in Python ──────────────────────────────

  {
    slug: 'read-ifc-property-sets-python',
    title: 'Read IFC Property Sets in Python with IfcOpenShell',
    excerpt: "You need to pull property data out of an IFC — quantities, classifications, custom Psets — and into a spreadsheet, a database, or a QA check. IfcOpenShell makes it a few lines of Python. Here's the practical cookbook, including the get_psets shortcut everyone wishes they'd found first.",
    date: '2026-06-03',
    readTimeMin: 8,
    category: 'IFC Tips',
    categorySlug: 'ifc-tips',
    author: 'IFC Viewer Team',
    content: [
      { type: 'p', text: "Sooner or later every BIM-adjacent developer needs to get data out of an IFC: element quantities for a takeoff, classifications for a register, custom property sets for a QA rule. IfcOpenShell is the open-source library that makes this tractable in Python. This is the practical path — the manual way to understand it, and the one-line shortcut for when you just need the data." },
      { type: 'h2', text: 'Open the File and Find Elements' },
      {
        type: 'code',
        lang: 'python',
        text: `import ifcopenshell

model = ifcopenshell.open("model.ifc")

# All walls in the file
walls = model.by_type("IfcWall")
print(f"{len(walls)} walls")

# A single element by its GlobalId
el = model.by_guid("3LYa_FRDj3zhLfyYoQv6Jr")`,
      },
      { type: 'h2', text: 'The Manual Way (Understand the Structure)' },
      { type: 'p', text: "Property sets aren't stored on the element directly — they hang off it through a relationship. An element's IsDefinedBy holds IfcRelDefinesByProperties relations, each pointing to a property set (the RelatingPropertyDefinition). Inside the set, HasProperties lists the individual properties, most of which are IfcPropertySingleValue with a Name and a NominalValue." },
      {
        type: 'code',
        lang: 'python',
        text: `wall = walls[0]

for rel in wall.IsDefinedBy:
    if rel.is_a("IfcRelDefinesByProperties"):
        pset = rel.RelatingPropertyDefinition
        if pset.is_a("IfcPropertySet"):
            print(pset.Name)  # e.g. "Pset_WallCommon"
            for prop in pset.HasProperties:
                if prop.is_a("IfcPropertySingleValue") and prop.NominalValue:
                    print(f"  {prop.Name} = {prop.NominalValue.wrappedValue}")`,
      },
      { type: 'callout', variant: 'info', text: "NominalValue is itself a typed wrapper (IfcText, IfcReal, IfcBoolean…). The actual value is in .wrappedValue. Forgetting this is the single most common stumbling block when people first traverse Psets by hand." },
      { type: 'h2', text: 'The Shortcut: get_psets()' },
      { type: 'p', text: "The manual traversal is worth understanding once, but for real work use the utility: ifcopenshell.util.element.get_psets() returns every property set on an element as a plain dictionary — Pset names as keys, property dicts as values. It's far less error-prone than walking the relationships yourself." },
      {
        type: 'code',
        lang: 'python',
        text: `import ifcopenshell.util.element as ue

psets = ue.get_psets(wall)
# {'Pset_WallCommon': {'IsExternal': True, 'FireRating': 'REI 60', 'id': 1234}, ...}

fire_rating = psets.get("Pset_WallCommon", {}).get("FireRating")

# Quantities only (areas, volumes, lengths)
qtos = ue.get_psets(wall, qtos_only=True)`,
      },
      { type: 'callout', variant: 'warning', text: "get_psets() expects a single element, not a list. Pass one element at a time — iterate your elements and call it per element. Passing a list is the most common error people hit with it." },
      { type: 'h2', text: 'Export Every Element to a Table' },
      {
        type: 'code',
        lang: 'python',
        text: `import csv
import ifcopenshell.util.element as ue

with open("elements.csv", "w", newline="") as f:
    writer = csv.writer(f)
    writer.writerow(["GlobalId", "Class", "Name", "Pset", "Property", "Value"])
    for el in model.by_type("IfcBuildingElement"):
        for pset_name, props in ue.get_psets(el).items():
            for key, value in props.items():
                if key == "id":
                    continue
                writer.writerow([el.GlobalId, el.is_a(), el.Name, pset_name, key, value])`,
      },
      { type: 'h2', text: 'Where Reading Stops and Viewing Begins' },
      { type: 'p', text: "Python is ideal for batch extraction and automated QA in a pipeline. But when you want to eyeball the property sets on a specific element — or hand the file to someone who doesn't write code — a viewer that shows Psets per element on click is the faster path. The two complement each other: script the bulk checks, inspect the edge cases visually." },
      {
        type: 'ifc-demo',
        modelId: 'duplex-architecture',
        title: 'Inspect Psets visually',
        description: "Open the duplex and click any element to see its full property sets — the same data get_psets() returns, without writing any code.",
        schema: 'IFC2x3',
        size: '2.4 MB',
      },
    ],
  },

  // ── Post 21 — Dev: view IFC in the browser (web-ifc / Fragments) ─────────────

  {
    slug: 'view-ifc-web-threejs-fragments',
    title: 'How to View IFC in the Browser with three.js, web-ifc & Fragments',
    excerpt: "Loading an IFC into a three.js scene sounds simple until the first 200 MB model freezes the tab for two minutes. The trick the libraries teach is: don't parse IFC at runtime. Here's how web-ifc, Fragments, and a convert-once pipeline actually fit together.",
    date: '2026-06-03',
    readTimeMin: 9,
    category: 'Tool Guides',
    categorySlug: 'tool-guides',
    author: 'IFC Viewer Team',
    content: [
      { type: 'p', text: "Rendering IFC on the web is a solved problem — but only if you follow the pattern the libraries are built around. Developers who try the naive approach (load the .ifc, parse it, build meshes, every time) hit a wall on the first real model: the tab freezes for a minute or more while WebAssembly chews through the file. The fix isn't a faster parser; it's parsing once and never again." },
      { type: 'h2', text: 'The Stack' },
      {
        type: 'feature-grid',
        items: [
          { icon: '🧩', title: 'web-ifc', body: "The WebAssembly core (from That Open) that reads and writes IFC at near-native speed in the browser or Node. The foundation everything else sits on." },
          { icon: '🔷', title: 'Fragments', body: "That Open's optimized geometry format. You convert IFC → Fragments once; loading the .frag afterward is dramatically faster than re-parsing the IFC." },
          { icon: '🎬', title: 'three.js', body: "The WebGL renderer that draws the scene. Fragments produce three.js-compatible geometry you add to a scene, camera, and controls like any other meshes." },
        ],
      },
      { type: 'h2', text: 'The Naive Approach (and Why It Hurts)' },
      {
        type: 'code',
        lang: 'javascript',
        text: `import * as WebIFC from "web-ifc";

const api = new WebIFC.IfcAPI();
await api.Init();

// Parsing the raw IFC at runtime — fine for tiny files, painful for real ones
const data = new Uint8Array(await file.arrayBuffer());
const modelID = api.OpenModel(data);
// ...extract geometry, build meshes... (slow, blocks the main thread)`,
      },
      { type: 'callout', variant: 'warning', text: "Runtime IFC parsing is too slow for production. As the That Open docs put it: parse and convert to Fragments once, save the result, and load that on every subsequent session. Don't re-parse the IFC on every page load." },
      { type: 'h2', text: 'The Production Pattern: Convert Once, Load Many' },
      { type: 'ol', items: [
        'Convert the IFC to Fragments a single time (on upload, in a worker, or in a build step).',
        'Persist the .frag output — in cache, OPFS, or object storage.',
        'On every load after that, fetch the Fragments and render — no IFC parsing involved.',
        'Run the heavy work in a Web Worker so the main thread stays responsive.',
      ]},
      {
        type: 'code',
        lang: 'javascript',
        text: `import * as OBC from "@thatopen/components";

const components = new OBC.Components();
const fragments = components.get(OBC.FragmentsManager);
const ifcLoader = components.get(OBC.IfcLoader);
await ifcLoader.setup();

// First time only: IFC → Fragments
const model = await ifcLoader.load(ifcBytes);

// Serialize once, reuse forever
const frag = fragments.export(model.group);
await saveToCache(frag);          // OPFS / IndexedDB / server

// Subsequent loads: skip IFC entirely
const cached = await loadFromCache();
fragments.load(cached);            // fast`,
      },
      { type: 'h2', text: 'Common Pitfalls' },
      { type: 'ul', items: [
        "\"memory access out of bounds\": the web-ifc WASM ran out of memory on a big file — convert in a worker, increase available memory, or process in chunks.",
        "Geometry far from the origin jitters: models authored at true geographic coordinates lose floating-point precision; rebase to a local origin. (See 'IFC Coordinates Are Wrong'.)",
        "No server-side rendering: web-ifc runs in the browser/Node, not as a no-JS SSR step — plan for client-side or a build-time conversion, not request-time SSR.",
        "Loading optimization: tile and cull large models so you only draw what's near the camera. (See 'Why Large IFC Files Crash Your Browser'.)",
      ]},
      { type: 'h2', text: "Or Don't Build It" },
      { type: 'p', text: "This is exactly the pipeline this viewer runs: web-ifc for parsing, a Fragments-style convert-once step, OPFS caching so repeat loads are ~10× faster, and validation on top. If your goal is to view and check IFCs rather than to build a viewer, you can skip the engineering and just open the file." },
      {
        type: 'ifc-demo',
        modelId: 'ifc4-revit-arc',
        title: 'See the pipeline in action',
        description: "A production-size IFC4 model loaded with exactly this convert-once, cached pipeline. Open it, then reload — the second load is near-instant.",
        schema: 'IFC4',
        size: '14 MB',
      },
    ],
  },

  // ── B2B Post 1 — NDA / Confidential projects ──────────────────────────────

  {
    slug: 'ifc-viewer-confidential-nda-projects',
    title: 'Can You Use an Online IFC Viewer with Confidential Project Data?',
    excerpt: "The NDA in your project contract doesn't care which software you use. Before opening a sensitive IFC in any online tool, here's the technical test that tells you — in 30 seconds — whether your data stays on your machine.",
    date: '2026-06-04',
    readTimeMin: 7,
    category: 'Best Practices',
    categorySlug: 'best-practices',
    author: 'IFC Viewer Team',
    featured: false,
    content: [
      {
        type: 'stat-row',
        stats: [
          { value: 0, suffix: ' bytes', label: 'of your IFC file uploaded' },
          { value: 100, suffix: '%', label: 'processed in your browser' },
          { value: 0, suffix: '', label: 'server connections for model data' },
          { value: 30, suffix: 's', label: 'to verify it with DevTools' },
        ],
      },
      { type: 'p', text: "The question every BIM coordinator asks before opening a confidential file in an unfamiliar online tool: does this thing upload my model somewhere? If the answer is yes — and for most cloud-based BIM viewers, it is — then your NDA, your client confidentiality obligations, and your firm's data policy all have something to say about it." },
      { type: 'p', text: "This post gives you the technical answer for IFC Viewer Online, plus a 30-second DevTools test you can run yourself to verify it independently." },
      { type: 'h2', text: "The Core Question: Does 'Client-Side' Actually Mean Client-Side?" },
      { type: 'p', text: "Browser-based tools split into two categories. The first uploads your file to a vendor server, runs the processing there, and streams results back to your screen. The second does everything inside your own browser tab — the WebAssembly runtime executes on your own hardware, accessing only your own RAM and local storage." },
      { type: 'p', text: "IFC Viewer Online belongs to the second category. Your file is parsed by web-ifc — an open-source IFC parser compiled to WebAssembly — running directly in your browser process. The parsed geometry lives in your browser's memory and OPFS (Origin Private File System), a sandboxed local area no other site or server can touch. Not one byte of your model is transmitted anywhere." },
      { type: 'callout', variant: 'tip', text: 'Verify it yourself: open Chrome DevTools (F12) → Network tab → filter by XHR/Fetch. Drag your IFC into the viewer. You will see PostHog analytics events (no model content) and font/asset loading on first visit — and zero requests carrying IFC data.' },
      { type: 'h2', text: 'What Never Leaves Your Device' },
      { type: 'ul', items: [
        'The IFC file binary — not a single byte transmitted',
        'Model geometry, coordinates, and spatial structure',
        'All IfcPropertySets and element properties',
        'Element names, descriptions, and GlobalIds',
        'Parsed geometry cached to OPFS — local, sandboxed, invisible to any server',
        'Edits (GUID fixes, property changes) until you explicitly export the corrected file',
      ]},
      { type: 'h2', text: "What Does Go Outside Your Browser (and Why It's Safe)" },
      { type: 'ul', items: [
        'Anonymous analytics events via PostHog: "file opened", "validation ran", "export clicked". No model content, no filenames, no property values — verifiable in DevTools.',
        'Your email address — only if you voluntarily submit the footer subscription form.',
        'A validation issue summary — only if you click Share Report. The URL encodes Health Score and issue list, not model geometry. You control when and whether to share.',
      ]},
      { type: 'h2', text: 'Three NDA Scenarios — What the Rules Say' },
      { type: 'h3', text: "Scenario 1: You're reviewing a client's model under NDA" },
      { type: 'p', text: "You've received an IFC from a client under NDA. You want to run a health check before a coordination meeting. Because the model is processed entirely in your browser, there is no data transfer event that would implicate the NDA. The model never leaves your machine — you're using your browser as a local analysis environment, not a cloud service." },
      { type: 'h3', text: "Scenario 2: You're a subcontractor validating before CDE submission" },
      { type: 'p', text: "You're preparing to upload an IFC to a project CDE. Before submission, you validate it locally. No upload, no server, no issue. The CDE upload happens from your authoring tool to the CDE platform. The validator is a local step that precedes it." },
      { type: 'h3', text: 'Scenario 3: You want to share the validation report with your team' },
      { type: 'p', text: "The Share Report feature encodes the issue list (rule violations, counts, model name) into a URL rendered by a Cloudflare Worker. This is opt-in — you choose when to share. The URL contains issue summaries, not model geometry. If your NDA covers issue summaries, skip Share Report and export a PDF screenshot instead." },
      {
        type: 'comparison',
        left: {
          label: 'IFC Viewer Online',
          color: 'accent',
          items: [
            'IFC processed 100% in browser (WebAssembly)',
            'Zero bytes of model data transmitted',
            'No account, no login required',
            'No Data Processing Agreement needed',
            'Works offline once loaded',
            'Open-source — fully auditable on GitHub',
          ],
        },
        right: {
          label: 'Cloud-based BIM viewers',
          color: 'muted',
          items: [
            'Upload model to vendor servers for processing',
            'Model stored in vendor data centres',
            'Account required (identity tied to uploads)',
            'DPA required for GDPR Article 28 compliance',
            'Internet connection required every session',
            'Closed source — no audit possible',
          ],
        },
      },
      { type: 'h2', text: 'The 30-Second DevTools Verification' },
      { type: 'ol', items: [
        'Open Chrome or Edge. Navigate to the viewer.',
        'Press F12 → Network tab → filter by "XHR" or "Fetch".',
        'Drag your most sensitive IFC file into the viewer and wait for it to load.',
        'Inspect every request in the panel. You will see PostHog analytics events (no model content) — and nothing else.',
        'Clear the filter and check "WS" (WebSocket) — none will open for model data.',
      ]},
      { type: 'p', text: [
        'If you need a written record of this for a security review, the full ',
        { text: 'Privacy Policy', href: 'https://j03rul4nd.github.io/ifc-viewer-online/privacy' },
        ' documents every data flow, and the MIT-licensed source code on GitHub is fully auditable.',
      ]},
      { type: 'pull-quote', text: "There is no service agreement to review with your client — no data changes hands.", cite: 'IFC Viewer Online FAQ' },
    ],
  },

  // ── B2B Post 2 — GDPR + BIM ───────────────────────────────────────────────

  {
    slug: 'gdpr-bim-ifc-data-guide',
    title: 'GDPR and BIM Data: What Every Project Manager Needs to Know (2026)',
    excerpt: "IFC files can contain personal data under GDPR. Sharing a model with a subcontractor via a cloud tool creates data processing obligations with legal teeth. Here's what EU project teams need to understand before the next BIM delivery.",
    date: '2026-06-04',
    readTimeMin: 9,
    category: 'Best Practices',
    categorySlug: 'best-practices',
    author: 'IFC Viewer Team',
    featured: false,
    content: [
      { type: 'p', text: "GDPR is not just an IT department problem. It applies to any team that handles information about identifiable people — and on a construction project, that can mean BIM coordinators, project managers, and delivery teams." },
      { type: 'p', text: "This guide covers three things: when IFC data is actually personal data under GDPR, what happens legally when you use a cloud BIM tool to process it, and how to choose tools that remove the compliance overhead entirely." },
      { type: 'h2', text: 'When Is an IFC File Personal Data?' },
      { type: 'p', text: "GDPR Article 4 defines personal data as any information relating to an identified or identifiable natural person. Most IFC files don't contain personal data in the obvious sense — they describe buildings, not people. But edge cases are more common than teams realise:" },
      { type: 'ul', items: [
        "IfcSpace elements named after occupants ('Dr. Smith's Office', 'Johnson Suite') can constitute personal data if the name identifies a living natural person.",
        'IfcActor and IfcPerson entities — if your model includes responsible persons (project manager, BIM coordinator) with names and contact details, those are personal data.',
        'Photos embedded as IfcDocumentInformation — images of workers on-site included in design documentation.',
        'Access control data attached to security-relevant spaces — information about who is authorised to enter a specific room.',
      ]},
      { type: 'callout', variant: 'info', text: "For most commercial IFC deliveries — generic building models without named occupants or embedded personnel records — the model is not personal data and GDPR does not apply to the model content itself. But if your project includes any of the above, the rules change." },
      { type: 'h2', text: 'The Legal Structure: Controller, Processor, and Article 28' },
      { type: 'p', text: "When you use a cloud BIM tool that processes IFC files on its servers, two GDPR roles are created. You (or your organisation) are the data controller — you determine the purpose of processing. The tool vendor is a data processor — they act on your behalf. GDPR Article 28 requires a written Data Processing Agreement (DPA) between you and every processor before you share personal data with them." },
      { type: 'p', text: "In practice: if your project IFC contains personal data (IfcPerson entries, named spaces, embedded photos) and you upload it to a cloud BIM viewer, you need a DPA with that vendor. Many small BIM tool vendors don't have DPAs readily available — meaning you're technically in breach of GDPR the moment you upload." },
      { type: 'callout', variant: 'warning', text: "If you're a contractor uploading a client's IFC to a cloud tool, you're processing the client's data on their behalf. Your client's legal team will expect confirmation that you've carried out GDPR due diligence on every tool in your workflow." },
      { type: 'h2', text: 'How Client-Side Processing Eliminates the Problem' },
      { type: 'p', text: "Tools that process IFC files entirely in the browser never receive the model data. If model data never reaches a server, there is no data processing event under GDPR for the model content — no controller-processor relationship, no DPA to negotiate, no data residency decision, no breach notification obligation." },
      { type: 'p', text: "This is the practical reason why browser-native processing matters for B2B projects: it removes an entire compliance category before the project even begins." },
      {
        type: 'feature-grid',
        items: [
          { icon: '✅', title: 'Local validation before CDE upload', body: 'Run a health check before uploading to the CDE. No third-party data processing — you stay the sole data controller throughout.' },
          { icon: '✅', title: 'Sharing a validation report', body: 'Share a report URL containing issue summaries only — no model geometry, no personal data from the IFC.' },
          { icon: '⚠️', title: 'Cloud BIM viewer', body: "Model uploaded to vendor servers. If it contains personal data, you need a DPA and a data residency decision before upload." },
          { icon: '⚠️', title: 'Coordination platform (ACC, BIM 360)', body: 'Autodesk provides a DPA as part of their Terms of Service — verify it covers your project data categories and storage region.' },
        ],
      },
      { type: 'h2', text: 'Six Questions to Ask Any BIM Tool Vendor' },
      { type: 'ol', items: [
        'Is model data processed locally on the user\'s device, or uploaded to your servers?',
        'If uploaded: where are your servers located? (EU data residency matters for GDPR)',
        'Do you have a Data Processing Agreement (DPA) available for GDPR Article 28 compliance?',
        'What data do you retain after the user closes the session?',
        'Who are your sub-processors (infrastructure, analytics, storage)?',
        'Are you ISO 27001 or SOC 2 Type II certified?',
      ]},
      { type: 'h2', text: 'IFC Viewer Online: GDPR at a Glance' },
      {
        type: 'feature-grid',
        items: [
          { icon: '🔒', title: 'No model upload', body: 'IFC files parsed by WebAssembly running in your browser. Nothing reaches our servers. No DPA required for model data.' },
          { icon: '📊', title: 'Cookieless analytics', body: 'Anonymous usage events via PostHog in memory-only mode — no tracking cookies set. Legal basis: legitimate interest.' },
          { icon: '📧', title: 'Email by consent only', body: 'Collected only with explicit opt-in. Processed via Resend. Unsubscribe at any time.' },
          { icon: '🔗', title: 'Shared reports are opt-in', body: 'Issue summaries only — no model geometry, no personal data from the IFC file. You decide when to share.' },
        ],
      },
      { type: 'pull-quote', text: "Browser-native processing removes an entire category of GDPR compliance obligation: there is no data controller-processor relationship to manage when the model never reaches a server." },
      { type: 'p', text: [
        'For formal vendor assessments, the full ',
        { text: 'Privacy Policy', href: 'https://j03rul4nd.github.io/ifc-viewer-online/privacy' },
        ' documents every data flow in plain English, including the legal basis for each processing activity.',
      ]},
    ],
  },

  // ── B2B Post 3 — IT Security Checklist ────────────────────────────────────

  {
    slug: 'bim-tool-it-security-checklist',
    title: 'The BIM Tool IT Security Checklist: 10 Questions Your IT Department Will Ask',
    excerpt: "IT won't approve a new tool just because it's useful. They'll ask about data residency, encryption, GDPR, sub-processors, and source auditability. Here are the 10 standard questions — and exactly how IFC Viewer Online answers each one.",
    date: '2026-06-04',
    readTimeMin: 8,
    category: 'Best Practices',
    categorySlug: 'best-practices',
    author: 'IFC Viewer Team',
    featured: false,
    content: [
      { type: 'p', text: "BIM tools have to survive IT approval. In large AEC firms and public sector organisations, any browser-based tool that handles project data goes through a security review — sometimes a formal DPIA, sometimes an email thread with the IT security lead. Either way, you need documented answers before the conversation starts." },
      { type: 'p', text: "This is the plain-English security record for IFC Viewer Online. Send this page to your IT department directly, or use it as a baseline to evaluate any BIM tool you're considering." },
      {
        type: 'stat-row',
        stats: [
          { value: 10, suffix: '', label: 'security questions answered' },
          { value: 0, suffix: '', label: 'servers store your model data' },
          { value: 100, suffix: '%', label: 'open-source and auditable' },
          { value: 0, suffix: '', label: 'user accounts or credentials' },
        ],
      },
      { type: 'h2', text: '1. Where is project data stored?' },
      { type: 'p', text: "IFC model data is never stored on any server. All parsing, 3D rendering, and validation run in your browser via WebAssembly. The only 'storage' is your browser's Origin Private File System (OPFS) — a sandboxed local area on your own device that no website or server can access. When you close the tab, the data stays on your machine." },
      { type: 'h2', text: '2. Does the tool transmit model data over the internet?' },
      { type: 'p', text: "No. The IFC file is opened by browser File APIs and passed directly to the WebAssembly parser. No XHR or Fetch requests carry model data. Verify this in your browser's DevTools Network tab: filter for XHR/Fetch while loading a file and you will see zero outbound requests for model content." },
      { type: 'h2', text: '3. What data does the tool collect?' },
      { type: 'ul', items: [
        "Anonymous usage events via PostHog: 'file opened', 'validation ran', 'export clicked'. No model content, no filenames, no property values.",
        'Email address — only if the user voluntarily submits the subscription form.',
        'Validation issue summary — only if the user explicitly clicks Share Report.',
      ]},
      { type: 'h2', text: '4. Is the tool GDPR compliant?' },
      { type: 'p', text: [
        "Yes. Model data never reaches any server, so there is no data processing relationship under GDPR for model content. Analytics run in cookieless (memory-only) mode — no tracking cookies set. Email collected only with explicit consent. Full ",
        { text: 'Privacy Policy', href: 'https://j03rul4nd.github.io/ifc-viewer-online/privacy' },
        ' published and maintained.',
      ]},
      { type: 'h2', text: '5. Who are the sub-processors?' },
      { type: 'ul', items: [
        'PostHog — anonymous product analytics. US-hosted.',
        'Resend — email delivery. Only for users who subscribe.',
        'Cloudflare — shared-report rendering function. Processes only issue summaries explicitly shared by the user.',
        'GitHub Pages — static site hosting. Serves HTML, CSS, and JavaScript assets only.',
      ]},
      { type: 'p', text: "None of these sub-processors receive IFC model data." },
      { type: 'h2', text: '6. What encryption is used?' },
      { type: 'p', text: "All communication uses TLS (HTTPS). Model data is never transmitted, so in-transit encryption for model content is not applicable. Local OPFS storage is managed by the browser and subject to the operating system's own disk encryption (BitLocker on Windows, FileVault on macOS)." },
      { type: 'h2', text: '7. Does the tool require user accounts or credentials?' },
      { type: 'p', text: "No. IFC Viewer Online has no authentication system, no user accounts, and no passwords. Users access it via URL with no login. This eliminates credential management risk and means there is no central user database to breach." },
      { type: 'h2', text: '8. Can we use it on a public sector or defence project?' },
      { type: 'p', text: "For standard commercial confidentiality and NDA-governed projects, yes. Model data never leaves the device. For projects with classified data handling requirements (UK Official or above, ITAR/NIST-governed), assess whether the browser environment itself meets your classification baseline — as you would for any browser-based tool." },
      { type: 'h2', text: '9. Is the source code auditable?' },
      { type: 'p', text: "Yes. The full source code is MIT-licensed and publicly available at github.com/j03rul4nd/ifc-viewer-online. Your security team can review the codebase, confirm the absence of data exfiltration code, and fork it for internal deployment if required." },
      { type: 'h2', text: '10. What is the data retention policy?' },
      { type: 'ul', items: [
        'IFC model data: not retained — never received.',
        'Analytics events: retained by PostHog per their standard data retention policy.',
        'Email addresses: until the user unsubscribes or requests deletion.',
        'Shared validation report links: expire after 90 days.',
        'Local OPFS cache: controlled by the user; cleared when browser storage is cleared.',
      ]},
      { type: 'callout', variant: 'tip', text: "Share this page with your IT department. The Privacy Policy at /privacy and the open-source code on GitHub provide all supporting documentation for a standard vendor security questionnaire or DPIA." },
      {
        type: 'comparison',
        left: {
          label: 'IFC Viewer Online',
          color: 'accent',
          items: [
            'Model data: 0 bytes transmitted to any server',
            'No user accounts — zero credential risk',
            'Data residency: on the user\'s own device',
            'GDPR: cookieless, legitimate interest',
            'Source code: MIT open-source, fully auditable',
            '4 sub-processors, none handle model data',
            'Works offline — no persistent server dependency',
          ],
        },
        right: {
          label: 'Typical cloud BIM viewer',
          color: 'muted',
          items: [
            'Model uploaded and stored on vendor servers',
            'Account required — credentials to manage',
            'Data residency: vendor data centres',
            'GDPR: DPA required, cookie consent UI needed',
            'Closed source — no independent audit possible',
            'Many sub-processors (cloud infra, CDN, analytics)',
            'Outage risk if vendor\'s servers are unavailable',
          ],
        },
      },
      { type: 'h2', text: 'A Note for Security Teams' },
      { type: 'p', text: "IFC Viewer Online is a static web application with no backend API, no database, and no server-side model processing. The primary risk surface is the browser runtime and the JavaScript/WebAssembly code delivered over HTTPS from GitHub Pages. For formal DPIAs or vendor assessment questionnaires, the Privacy Policy, the MIT-licensed source code, and this document should be sufficient for standard commercial security reviews." },
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
