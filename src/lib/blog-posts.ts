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
  | {
      type: 'ifc-demo'
      modelId: string
      title: string
      description: string
      schema: string
      size: string
      /** Show click-to-inspect panel. Default true. */
      showProperties?: boolean
      /** Show fullscreen button. Default true. */
      allowFullscreen?: boolean
      /** Viewer height in pixels. Default 440. */
      height?: number
      /** 'inline' (default) or 'hero' (taller, 580 px). */
      variant?: 'inline' | 'hero'
    }
  | {
      type: 'embed-configurator'
      title?: string
      description?: string
      /** Pre-filled IFC URL for the preview + snippet. Defaults to a public sample. */
      defaultModelUrl?: string
      defaultFileName?: string
      defaultHeight?: number
    }
  | { type: 'stat-row'; stats: Array<{ value: number; suffix?: string; prefix?: string; label: string }> }
  | { type: 'feature-grid'; items: Array<{ icon: string; title: string; body: string }> }
  | { type: 'comparison'; left: { label: string; color: string; items: string[] }; right: { label: string; color: string; items: string[] } }
  | { type: 'health-score'; items: Array<{ score: number; label: string }> }
  | { type: 'pull-quote'; text: string; cite?: string }
  | {
      type: 'table'
      headers: string[]
      rows: string[][]
      /** Optional note displayed below the table (e.g. data source, caveat). */
      caption?: string
      /** Style the first column as row headers. Default true. */
      rowHeaders?: boolean
    }

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
  /** SEO keywords for JSON-LD structured data. */
  keywords?: string[]
  /** FAQ entries — rendered as FAQPage schema in the static HTML shell. */
  faqs?: { q: string; a: string }[]
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
    heroImage: 'view-ifc-online-free',
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
    heroImage: 'ifc-vs-rvt-vs-nwd',
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
      { type: 'callout', variant: 'info', text: "Want to confirm the georeferencing visually? The viewer's 3D map mode reads IfcMapConversion / IfcSite automatically and drops your model onto a real-world basemap — street, satellite, or 3D terrain — so you can see at a glance whether it lands on the right plot. It runs entirely in the browser: no API key, nothing uploaded." },
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
            'You need to check the model against an IDS / BEP requirement',
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
      { type: 'p', text: "This one is deliberately in the private/local camp: it parses IFC in your browser via WebAssembly (zero bytes uploaded, no account), handles files up to ~500 MB with convert-once caching, and — the part most free viewers skip — runs 38 validation rules and returns a Health Score. It goes further than most: drop a buildingSMART .ids file to check the model against contractual delivery requirements (all six IDS 1.0 facets, validated against the official test cases), coordinate issues with full BCF 2.1 / 3.0 import and export, and place a georeferenced model on a real-world 3D map (street, satellite or terrain) — all client-side, no API key, nothing uploaded. So it's not just 'can I see it', it's 'is it any good, does it meet the spec, and where does it sit'." },
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
      { type: 'h2', text: 'Embed It in Your Own Page' },
      { type: 'p', text: "If you host your IFC somewhere public (a CORS-enabled bucket, a raw repo link, or your CDE), you can drop this exact viewer into a blog post, docs page, or CDE panel with a single iframe — no build step. Paste a URL below, tweak the layout, and copy the snippet. The model is fetched in the visitor's browser, so nothing is uploaded to us." },
      {
        type: 'embed-configurator',
        title: 'Build your IFC embed',
        description: 'Paste a public IFC URL, choose a layout, and copy the iframe. Live preview updates as you go.',
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
        { text: 'Privacy Policy', href: `${import.meta.env?.BASE_URL ?? '/'}privacy` },
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
        { text: 'Privacy Policy', href: `${import.meta.env?.BASE_URL ?? '/'}privacy` },
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
        { text: 'Privacy Policy', href: `${import.meta.env?.BASE_URL ?? '/'}privacy` },
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
    heroImage: 'como-exportar-ifc-desde-revit',
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
    heroImage: 'ifc-datei-im-browser-oeffnen',
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
    heroImage: 'ouvrir-fichier-ifc-navigateur',
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

  // ── Article #1 — "ifc editor online" primary keyword ────────────────────────

  {
    slug: 'ifc-editor-online',
    title: 'Free Online IFC Editor: Edit IFC Properties Without Revit or Archicad',
    excerpt: "Edit IFC properties free in your browser — nothing uploaded, no Revit needed. Honest guide to every tool: Revit, ArchiCAD, Solibri, BIMVision, and when each one wins.",
    date: '2026-06-28',
    readTimeMin: 11,
    category: 'Tool Guides',
    categorySlug: 'tool-guides',
    author: 'IFC Viewer Team',
    featured: false,
    heroImage: 'ifc-editor-online',
    keywords: ['ifc editor online', 'free ifc editor', 'edit ifc properties', 'ifc property editor', 'edit ifc without revit', 'ifc viewer online', 'ifc file editor'],
    content: [
      {
        type: 'stat-row',
        stats: [
          { value: 0,   suffix: ' € / month', label: 'to edit properties online' },
          { value: 0,   suffix: ' bytes',      label: 'uploaded to any server' },
          { value: 44,  suffix: '',            label: 'validation rules checked' },
          { value: 100, suffix: '%',           label: 'runs in your browser' },
        ],
      },
      {
        type: 'p',
        text: "Editing an IFC file sounds like it should be simple. You open the file, change a property, save it. But between the software costs, the vendor lock-in, and the loss of data on round-trips, the reality for most teams is far messier.",
      },
      {
        type: 'p',
        text: "This article is an honest guide to what 'editing IFC' actually means, which tools do it well, which are the wrong tool for the job, and where a free browser-based IFC property editor fills the gap — without a £5,000 software subscription.",
      },
      {
        type: 'h2',
        text: 'What Does "Editing an IFC File" Actually Mean?',
      },
      {
        type: 'p',
        text: "Not all IFC editing is the same. The kind of edit you need determines which tool is right. There are three distinct types:",
      },
      {
        type: 'feature-grid',
        items: [
          {
            icon: '📐',
            title: 'Geometry editing',
            body: "Changing shapes, positions, dimensions. Requires a parametric authoring tool — Revit, ArchiCAD, Tekla. You must re-export IFC from the source model. No viewer can do this.",
          },
          {
            icon: '🏷️',
            title: 'Property & metadata editing',
            body: "Changing element names, descriptions, property set values, classifications. Can be done directly on the IFC file without touching geometry. This is what most people actually need.",
          },
          {
            icon: '🔧',
            title: 'Structural fixes',
            body: "Repairing duplicate GUIDs, fixing broken spatial hierarchy, correcting missing IfcProject metadata. Targeted corrections to make a file schema-compliant and coordination-ready.",
          },
        ],
      },
      {
        type: 'callout',
        variant: 'info',
        text: "If you need to change geometry — wall thickness, door dimensions, slab height — you need the source model in the original authoring tool. No IFC editor can do this non-destructively. If you need to change property values, names, or fix data quality issues, you don't.",
      },
      {
        type: 'h2',
        text: 'The Honest Tool Comparison',
      },
      {
        type: 'p',
        text: "There is no single best IFC editor — there is a best tool for each editing scenario. Here is the real picture for every major option.",
      },
      {
        type: 'h3',
        text: 'Revit — The Complete Authoring Environment',
      },
      {
        type: 'p',
        text: "Revit is the dominant BIM authoring tool for architecture and MEP in most markets. It produces some of the richest IFC exports available, and with the open-source IFC exporter it handles property set mapping, GUID stability, and spatial hierarchy correctly.",
      },
      {
        type: 'ul',
        items: [
          "Cost: Autodesk AEC Collection ~£4,800 / year. Revit standalone ~£2,800 / year.",
          "IFC editing method: Import the IFC file, edit as a Revit model, re-export to IFC.",
          "The round-trip problem: Importing IFC into Revit is lossy by design. Custom property sets not in Revit's mapping get dropped. Classification data is often lost. Geometry may be re-tessellated. What you export is not necessarily what was in the original file.",
          "Ideal when: You own the original RVT model and are the originator. You need parametric edits — geometry, families, levels, phases.",
          "Not ideal when: You received a raw IFC from another party and need to fix a handful of property values without destroying the file's original structure.",
        ],
      },
      {
        type: 'h3',
        text: 'ArchiCAD — The Open BIM Champion',
      },
      {
        type: 'p',
        text: "ArchiCAD has the strongest native IFC support of any authoring tool. Its IFC translator lets you map Graphisoft attributes to IFC property sets with granular control, and it supports stable GlobalIds across re-exports — something Revit required years of community advocacy to achieve.",
      },
      {
        type: 'ul',
        items: [
          "Cost: Graphisoft ArchiCAD ~£3,600 / year (varies by region and bundle).",
          "IFC editing method: Same as Revit — import, edit, re-export.",
          "Round-trip quality: Better than Revit for most cases. ArchiCAD's IFC import preserves more property sets and is less aggressive about re-mapping element types. Still not lossless for files originally authored in Revit.",
          "Ideal when: You're the originator using ArchiCAD, or you received an IFC from another ArchiCAD user and need to make compatible edits.",
          "Not ideal when: You received a Revit-exported IFC and need to patch a few values — the import will still alter the file's internal structure.",
        ],
      },
      {
        type: 'h3',
        text: 'Solibri — The Best Pure Validation Tool',
      },
      {
        type: 'p',
        text: "Solibri (now Solibri Office) is the industry reference for IFC model checking. Its rule engine is more sophisticated than any other commercial tool — if you need to verify compliance with project-specific information requirements (IRs), Solibri is the standard. But it is not an editor.",
      },
      {
        type: 'ul',
        items: [
          "Cost: Solibri Office ~€2,700 / year. Solibri Site (viewer) is free.",
          "What it does: View, validate, clash-check, BCF annotation, IDS checking (partial), COBie inspection. Does not modify IFC data.",
          "What it cannot do: Change element names, fix property values, repair GUIDs, or export a corrected IFC file. You annotate issues in BCF, then fix them in the authoring tool.",
          "Ideal when: You're a BIM coordinator doing formal model checking against EIR or project-specific rules, running clash detection, or producing a BCF issue report for the design team.",
          "Not ideal when: You need to fix the data yourself, right now, without a round-trip through the authoring tool.",
        ],
      },
      {
        type: 'h3',
        text: 'BIMVision — Free IFC Viewer, Not an Editor',
      },
      {
        type: 'p',
        text: "BIMVision is a popular free Windows desktop app for viewing IFC files. It has good geometry support, a clean spatial tree, and handles large files reasonably well. It is not an IFC editor in any meaningful sense.",
      },
      {
        type: 'ul',
        items: [
          "Cost: Free (Windows only).",
          "What it does: 3D viewing, element inspection, property browsing, basic measurements.",
          "What it cannot do: Modify property values, fix GUIDs, rename elements, or export an altered IFC. Read-only.",
          "Ideal when: You're on Windows, need a free viewer for large files, and don't need to make changes.",
          "Not ideal when: You need to edit anything — properties, names, or data quality issues.",
        ],
      },
      {
        type: 'h3',
        text: 'IFC Viewer Online — Free Browser-Based IFC Property Editor',
      },
      {
        type: 'p',
        text: "IFC Viewer Online fills the gap between full authoring tools and read-only viewers. It's a browser-based tool that lets you view, validate, and non-destructively edit IFC property data — without installing anything, without uploading your file to a server, and without a software licence.",
      },
      {
        type: 'ul',
        items: [
          "Cost: Free.",
          "Platform: Any browser — Chrome, Firefox, Safari, Edge. Windows, Mac, Linux, iPad.",
          "Privacy: The IFC file never leaves your device. Parsing and editing run entirely in browser via WebAssembly.",
          "What you can edit: Element Name, LongName, Description (inline in the model tree). Property set values (inline in the sidebar). GlobalIds (regenerate spec-compliant GUIDs). Batch auto-fix for all validation-detected issues.",
          "What you cannot edit: Geometry, element shapes, positions, family types, structural relationships. If you need these, you need the source model.",
          "Ideal when: You received an IFC file from another party and need to fix metadata, names, or data quality issues without a full authoring tool round-trip.",
        ],
      },
      {
        type: 'h2',
        text: 'Side-by-Side: Which Tool for Which Task',
      },
      {
        type: 'comparison',
        left: {
          label: 'IFC Viewer Online (free)',
          color: 'accent',
          items: [
            'Edit element names and descriptions inline',
            'Edit any property set value',
            'Fix duplicate GUIDs (auto or manual)',
            'Repair IfcProject metadata',
            'Run 44-rule validation + Health Score',
            'Export corrected IFC with full diff',
            'Works in-browser, nothing uploaded',
            'Free, no installation, no account',
          ],
        },
        right: {
          label: 'Revit / ArchiCAD (paid)',
          color: 'muted',
          items: [
            'Edit geometry, shapes, dimensions',
            'Add and delete elements',
            'Change element IFC class / type',
            'Parametric family editing',
            'Full project authoring workflow',
            'Richer property mapping control',
            'Required for geometry-level changes',
            '£2,800–£5,000 / year',
          ],
        },
      },
      {
        type: 'h2',
        text: 'Try It: Edit a Real IFC Model Right Now',
      },
      {
        type: 'p',
        text: "The viewer below loads a real IFC2x3 model — the buildingSMART duplex apartment. Click any element to see its properties in the sidebar. Click the edit icon next to any property value to modify it. Click an element name in the tree to rename it inline. No upload, no account, no installation.",
      },
      {
        type: 'ifc-demo',
        modelId: 'duplex-architecture',
        title: 'Duplex Apartment — Live Edit Demo',
        description: "Click any element to inspect it, then use the edit icon next to any property value to change it. Changes are tracked as a non-destructive diff — nothing is written until you export. Try clicking the validation tab to see the Health Score for this model.",
        schema: 'IFC2x3',
        size: '2.4 MB',
        showProperties: true,
        allowFullscreen: true,
        variant: 'hero',
      },
      {
        type: 'h2',
        text: 'How the Non-Destructive Editing Model Works',
      },
      {
        type: 'p',
        text: "Every change you make is recorded as a diff — a structured record of what changed (which GlobalId, which property, which value). The original IFC data is never mutated in memory. When you export, the engine replays all diffs against the original file to produce the corrected output.",
      },
      {
        type: 'feature-grid',
        items: [
          {
            icon: '↩️',
            title: 'Full undo / redo',
            body: "Every edit is a reversible command. Ctrl+Z undoes changes in order. There's no risk of accidentally destroying data — the original is always intact.",
          },
          {
            icon: '🔍',
            title: 'Diff before export',
            body: "Before downloading the corrected IFC, you can review the complete list of changes. Each diff shows the GlobalId of the affected element, the property changed, and the old and new values.",
          },
          {
            icon: '🏷️',
            title: 'Keyed by GlobalId',
            body: "Edits are indexed by element GlobalId, not express ID. GlobalIds are stable across exports; express IDs are not. This means a diff written against one export of a model applies cleanly to the next re-export of the same model.",
          },
          {
            icon: '📤',
            title: 'Clean export',
            body: "The exported IFC is your original file with only the diff applied. No structural changes, no re-tessellation, no dropped property sets. The elements you didn't touch are byte-identical to the original.",
          },
        ],
      },
      {
        type: 'h2',
        text: 'Practical Editing Walkthrough',
      },
      {
        type: 'h3',
        text: 'Fixing Element Names',
      },
      {
        type: 'ol',
        items: [
          "Open your IFC file — drag it onto the viewer or click Open a file.",
          "Open the spatial tree on the left panel. Elements with empty names show as their IFC class (e.g. 'IfcWall').",
          "Click the element you want to rename. Its row in the tree becomes editable — click the name field directly.",
          "Type the new name and press Enter. The diff is recorded.",
          "Repeat for as many elements as needed, then export the corrected IFC.",
        ],
      },
      {
        type: 'h3',
        text: 'Editing Property Set Values',
      },
      {
        type: 'ol',
        items: [
          "Click any element in the 3D view or the tree to select it.",
          "In the sidebar, scroll to the Properties tab. All property sets for that element are listed.",
          "Click the edit icon (pencil) next to any property value.",
          "Type the new value and confirm. The diff records the Pset name, property name, and new value.",
          "Changes apply to that specific element (keyed by GlobalId) — other elements with the same Pset are not affected unless you edit them too.",
        ],
      },
      {
        type: 'h3',
        text: 'Fixing Duplicate GUIDs',
      },
      {
        type: 'p',
        text: "Duplicate GUIDs are the most common structural IFC error and the one most likely to cause rejection at the CDE. They're also fully auto-fixable:",
      },
      {
        type: 'ol',
        items: [
          "Run validation (Ctrl+Shift+V or the Validate button).",
          "Look for RULE_DUPLICATE_GUID issues in the validation panel.",
          "Click the batch auto-fix button to generate new spec-compliant GlobalIds for all duplicates at once.",
          "Export the corrected IFC — the new GUIDs are 22-character strings using the IFC base-64 alphabet with a valid leading character (0–3).",
        ],
      },
      {
        type: 'callout',
        variant: 'tip',
        text: "Always run validation before and after editing. The post-edit Health Score tells you whether your changes resolved the issues or revealed new ones. Target ≥ 80 for CDE delivery.",
      },
      {
        type: 'h2',
        text: 'When to Use Each Tool: Decision Guide',
      },
      {
        type: 'p',
        text: "Here's a quick reference for the common scenarios BIM coordinators and architects face:",
      },
      {
        type: 'ul',
        items: [
          "Received IFC, need to fix property values → IFC Viewer Online. No round-trip, no authoring tool needed.",
          "Received IFC, need to fix GUIDs → IFC Viewer Online. Auto-fix applies to all duplicates at once.",
          "Received IFC, need to change geometry → You need the original source model. Contact the originator.",
          "Your own Revit model needs property fixes → Fix in Revit, re-export with correct settings. Do not round-trip through IFC unless you have to.",
          "Need to validate against project-specific rules → Solibri, or IFC Viewer Online with IDS profiles.",
          "Need to view a large IFC on a machine without authoring tools → IFC Viewer Online or BIMVision.",
          "Need to produce a BCF issue report → Solibri (most powerful) or IFC Viewer Online's BCF panel (free).",
        ],
      },
      {
        type: 'h2',
        text: 'Embed the IFC Editor in Your Own Tools',
      },
      {
        type: 'p',
        text: "If you're building a BIM platform, a CDE, or a project extranet, you can embed the IFC viewer and editor as an iframe — no backend required, no API key. Your users get a full-featured IFC viewer with validation and property inspection, without leaving your application.",
      },
      {
        type: 'embed-configurator',
        title: 'Configure your embed',
        description: 'Paste a public IFC URL to generate an iframe snippet you can add to any webpage.',
        defaultModelUrl: 'https://raw.githubusercontent.com/youshengCode/IfcSampleFiles/main/Ifc2x3_Duplex_Architecture.ifc',
        defaultFileName: 'Ifc2x3_Duplex_Architecture.ifc',
        defaultHeight: 560,
      },
      {
        type: 'h3',
        text: 'Using the JavaScript SDK',
      },
      {
        type: 'p',
        text: "For deeper integration — loading files from your database, responding to element selection, or triggering validation programmatically — use the IFC Viewer SDK:",
      },
      {
        type: 'code',
        lang: 'html',
        text: `<!-- Add the SDK once -->
<script src="https://www.ifcvieweronline.eu/sdk/ifc-viewer-sdk.js"></script>

<div id="viewer" style="width:100%;height:600px"></div>

<script>
  const viewer = new IfcViewer('#viewer', {
    ui: 'minimal',   // 'minimal' | 'full' | 'kiosk'
    validate: true,  // run 44-rule validation automatically
    lang: 'en',      // 'en' | 'es' | 'de' | 'fr' | …
  });

  // Load an IFC from a URL
  viewer.loadUrl('https://your-cdn.com/project-model.ifc');

  // Or load from bytes (your own upload flow — nothing leaves the browser)
  viewer.loadBytes(arrayBuffer, 'project-model.ifc');

  // Listen for element selection
  viewer.on('element:selected', (el) => {
    console.log('Selected:', el.globalId, el.name, el.properties);
  });

  // Listen for validation completion
  viewer.on('validation:complete', (report) => {
    console.log('Health Score:', report.healthScore);
    console.log('Issues:', report.issues.length);
  });
</script>`,
      },
      {
        type: 'callout',
        variant: 'info',
        text: "The SDK loads files entirely in the browser using WebAssembly — IFC bytes never reach the IFC Viewer servers. You can pass ArrayBuffer from your own upload handler: the model goes from your user's filesystem directly into the viewer, without any intermediate server hop.",
      },
      {
        type: 'h2',
        text: 'What the Free Online IFC Editor Cannot Do',
      },
      {
        type: 'p',
        text: "Being honest about limitations matters — picking the wrong tool wastes time. Here is what the browser-based editor cannot do, and what to use instead:",
      },
      {
        type: 'ul',
        items: [
          "Edit geometry: No. You need the source model in Revit, ArchiCAD, or Tekla. Geometry is computed from the IFC's STEP-encoded shape representations — it cannot be modified non-destructively in a viewer.",
          "Change an element's IFC class (e.g. IfcWall → IfcCurtainWall): No. Class reassignment requires authoring tool knowledge about what properties and relationships are valid for the new class.",
          "Add or delete elements: No. Adding a new element requires generating valid geometry, relationships, and a spatial placement — only authoring tools can do this correctly.",
          "Edit complex relationships (IfcRelAssociatesClassification, IfcRelDefinesByType): Not yet. These are on the roadmap, but as of today only property values, names, and GUIDs are editable.",
          "Handle 1 GB+ files: Performance degrades above 300–400 MB on most machines. For very large models, open them in sections or use desktop tools like Solibri or Autodesk Forma.",
        ],
      },
      {
        type: 'pull-quote',
        text: "The right IFC editor is the one that solves your specific problem — not the most powerful one, not the cheapest one.",
        cite: 'IFC Viewer Blog',
      },
      {
        type: 'h2',
        text: 'Summary: Free IFC Editor Online vs Desktop Tools',
      },
      {
        type: 'p',
        text: "A free online IFC editor is not a replacement for Revit or ArchiCAD — and it's not trying to be. It fills a real gap that authoring tools don't address: what do you do when you receive an IFC file and need to fix its data without a round-trip through the tool that created it?",
      },
      {
        type: 'feature-grid',
        items: [
          {
            icon: '✅',
            title: 'Use IFC Viewer Online when…',
            body: "You received a file from another party and need to fix names, properties, or GUIDs. You need a fast Health Score before a CDE delivery. You're on a machine without BIM authoring software.",
          },
          {
            icon: '🔧',
            title: 'Use Revit / ArchiCAD when…',
            body: "You own the original source model and need to make geometry changes. You're authoring a new BIM deliverable from scratch. You need full parametric control and family management.",
          },
          {
            icon: '🔍',
            title: 'Use Solibri when…',
            body: "You're a BIM coordinator doing formal model checking against project information requirements. You need sophisticated clash detection and BCF reporting for a whole project team.",
          },
          {
            icon: '👁️',
            title: 'Use BIMVision when…',
            body: "You're on Windows and need a free desktop viewer for occasional file inspection with no editing requirement.",
          },
        ],
      },
      {
        type: 'p',
        text: ["Start by running a validation check on your model — it takes under 30 seconds and tells you exactly what needs fixing. Then ", { text: 'see the 7 most common IFC validation errors', to: 'common-ifc-validation-errors' }, ' to understand what each issue means and how to fix it. For Revit-specific property export problems, the ', { text: 'IFC properties missing after export checklist', to: 'ifc-properties-missing-after-export' }, ' covers every cause.'],
      },
    ],
  },

  // ── Article #2 — "ifc model checker" primary keyword ────────────────────────

  {
    slug: 'ifc-model-checker-guide',
    title: 'IFC Model Checker: The Complete Guide to IFC Validation, Model Quality, and IDS',
    excerpt: "IFC model checker guide: schema, model quality (44 rules + Health Score), and IDS are three independent layers. Confusing them causes delivery failures. Complete breakdown for BIM coordinators.",
    date: '2026-06-28',
    readTimeMin: 20,
    category: 'Validation',
    categorySlug: 'validation',
    author: 'IFC Viewer Team',
    featured: false,
    keywords: ['ifc model checker', 'ifc model validation', 'ifc checker online', 'ids validation', 'ifc validation tool', 'buildingSMART IDS', 'ifc quality check', 'bim model validation'],
    faqs: [
      {
        q: 'Does passing Level 1 schema validation mean I can skip Level 2 quality checking?',
        a: "No. Level 1 and Level 2 measure completely different properties. A schema-valid file can have zero property sets, empty element names, no classification, and no ISO 19650 metadata — and score 20 on a quality check. You always need both. Level 1 means 'the file is correctly packaged'; Level 2 means 'the contents are what was requested'.",
      },
      {
        q: 'Is IDS a replacement for the buildingSMART Validation Service?',
        a: "No. IDS checks project-specific information requirements (Level 3). The buildingSMART Validation Service checks schema compliance (Level 1). They operate at completely different levels. An IDS-passing model that fails schema validation would be a logical contradiction — Level 1 integrity is a prerequisite for meaningful Level 3 checking.",
      },
      {
        q: 'Which IDS facets should I prioritise for a standard BIM delivery?',
        a: "The Property facet covers 70–80% of real-world EIR requirements — most clients want specific Pset values on specific element types. Classification covers most of the remainder for Uniclass- or OmniClass-governed projects. The Entity facet appears in almost every specification as an applicability filter. Start with Entity + Property, add Classification if your EIR requires it.",
      },
      {
        q: 'Can I validate an IFC model without uploading it anywhere?',
        a: "Yes. Browser-based validators process the file entirely in your browser using WebAssembly. The IFC bytes never leave your device — all 44 quality rules, the Health Score calculation, and the full IDS engine run client-side. For models with data handling restrictions, this is often the only compliant option.",
      },
      {
        q: 'What Health Score threshold should I specify in the BEP?',
        a: "≥ 80 is the standard threshold for CDE delivery and design coordination. ≥ 90 for LOD 300+ deliveries and ISO 19650 formal milestone submissions. ≥ 70 is acceptable for concept-stage internal reviews. Below 60, the model has structural quality problems and should not be delivered to any external party.",
      },
      {
        q: 'Can a single IFC model checker tool cover all three validation levels?',
        a: "Some tools do. IFC Viewer Online covers Level 1 (integrity rules), Level 2 (44-rule quality check with Health Score), and Level 3 (IDS 1.0 engine validated against all 100 official bSI testcases). Solibri covers Level 2 and Level 3 but not browser-based processing. The buildingSMART Validation Service covers Level 1 only.",
      },
    ],
    content: [
      {
        type: 'callout',
        variant: 'info',
        text: "TL;DR — There are three independent validation layers. Level 1 (IFC integrity) asks: is the file a valid IFC schema? Level 2 (model quality) asks: is the data complete and useful for coordination? Level 3 (IDS) asks: does the file meet this project's contractual information requirements? All three are needed before a formal delivery. Passing one says nothing about the others.",
      },
      {
        type: 'stat-row',
        stats: [
          { value: 3,  suffix: '',  label: 'independent validation layers' },
          { value: 44, suffix: '',  label: 'model quality rules' },
          { value: 6,  suffix: '',  label: 'IDS facets (buildingSMART 1.0)' },
          { value: 0,  suffix: '',  label: 'bytes uploaded — browser only' },
        ],
      },
      {
        type: 'p',
        text: "Every IFC delivery conversation eventually hits the same wall. The structural engineer says the file passed the validator. The BIM coordinator sees half the property sets missing and asks which validator. The client's EIR specifies IDS requirements nobody has checked. The CDE rejects the upload. Three weeks later, everyone is confused about what 'valid' even means.",
      },
      {
        type: 'p',
        text: "The confusion is understandable — the word 'validation' covers three completely different operations that share a name. Getting them untangled is one of the most consequential things a BIM coordinator can do for a project.",
      },
      { type: 'h2', text: 'Three Completely Different Validation Problems' },
      {
        type: 'p',
        text: "Think of a building permit application. The building control officer independently verifies three things: whether the drawings are legible and complete (file integrity), whether the design meets building regulations (quality and compliance), and whether it meets the client's specific brief (project requirements). A legible drawing can completely ignore fire regulations. A fire-compliant scheme can miss the client's acoustic specification entirely. These are separate questions with separate answers.",
      },
      {
        type: 'feature-grid',
        items: [
          {
            icon: '🔩',
            title: 'Level 1 — IFC Integrity',
            body: "Is the file a valid IFC according to ISO 10303-21 and ISO 16739-1? Are GlobalIds unique and format-compliant? Is the spatial hierarchy coherent? Schema-level binary checking.",
          },
          {
            icon: '📊',
            title: 'Level 2 — Model Quality',
            body: "Is the data actually useful for coordination? Are property sets populated? Do elements follow naming conventions? Are classifications present? This governs real deliveries — not schema compliance.",
          },
          {
            icon: '📋',
            title: 'Level 3 — IDS Validation',
            body: "Does the model satisfy this project's contractual information requirements? EIR and AIR requirements encoded as machine-readable IDS specifications, checked facet by facet against every element.",
          },
        ],
      },
      {
        type: 'p',
        text: "These three layers are completely independent. A file can be Level 1 schema-valid while being useless for coordination because no property sets were exported. An IDS check can pass for all declared requirements while the model has 400 duplicate GUIDs. A Health Score of 91 says nothing about whether the client's fire-rating requirements are encoded and met. Each layer answers a different question — all three are needed before a formal delivery.",
      },
      { type: 'h2', text: 'Level 1: IFC File Integrity — Is This a Valid IFC?' },
      {
        type: 'p',
        text: "Level 1 is schema checking. It answers a binary question: does this file conform to the IFC schema (ISO 16739-1) and the physical file format (ISO 10303-21 STEP)? Most IFC parsers silently accept files that fail Level 1 checks — they are permissive by design, because strict rejection would break too many workflows. That permissiveness hides the damage until it surfaces downstream.",
      },
      { type: 'h3', text: 'What Level 1 Integrity Checking Covers' },
      {
        type: 'ul',
        items: [
          "GlobalId uniqueness: every IfcRoot entity must have a unique 22-character GlobalId using IFC's base-64 alphabet. Duplicate GlobalIds are a schema violation that parsers accept but that silently corrupt BCF workflows, CDE versioning, and FM asset registers.",
          "GlobalId format compliance: the first character of a valid IFC GlobalId encodes values 0–3 only (two significant bits from a 128-bit UUID). Scripts that naively truncate UUIDs produce out-of-range leading characters — invalid by spec, tolerated by most parsers, rejected by strict validators.",
          "Spatial hierarchy completeness: the IFC schema mandates IfcProject → IfcSite → IfcBuilding → IfcBuildingStorey. Missing nodes (a Building directly under Project, physical elements sitting in IfcSite) are schema violations with real downstream consequences.",
          "IfcRelAggregates chain integrity: the relationship entities that build the spatial tree must reference existing entities. Dangling references — where a relationship points to a deleted or missing entity — break tree navigation in every downstream tool.",
          "IfcRelContainedInSpatialStructure: physical elements must be contained in a spatial element (typically IfcBuildingStorey). Elements with no containment relationship are orphans — invisible in most tools' spatial navigation.",
          "Exactly one IfcProject: every valid IFC file must contain exactly one IfcProject as the hierarchy root. Sub-models that omit it parse without error but have no spatial anchor.",
          "FILE_NAME and FILE_DESCRIPTION header fields: the STEP file header carries traceability metadata. ISO 19650-2 requires these to be populated — most tools leave them as empty strings.",
          "Geometry validity: non-manifold meshes, faces with zero area, bodies with reversed normal winding, self-intersecting boundary representations that fail to produce valid solids in receiving tools.",
        ],
      },
      { type: 'h3', text: 'What Level 1 Does NOT Check' },
      {
        type: 'ul',
        items: [
          "Whether property sets are populated or correct — a schema-valid model with zero Psets passes Level 1.",
          "Whether element names follow any project naming convention.",
          "Whether classification codes are present, correct, or consistent.",
          "Whether LOD quantity requirements (IfcElementQuantity at LOD 300+) are satisfied.",
          "Whether the model meets any project-specific or contractual information requirement.",
        ],
      },
      {
        type: 'callout',
        variant: 'warning',
        text: "The most dangerous validation mistake in BIM: a team runs the buildingSMART Validation Service, sees 'schema compliant', and considers the model validated. Schema compliance says nothing about data quality. A file where every element has Name='' and zero property sets is perfectly schema-valid and completely useless for coordination.",
      },
      { type: 'h3', text: 'The buildingSMART Validation Service for Level 1' },
      {
        type: 'p',
        text: "The buildingSMART IFC Validation Service (validate.buildingsmart.org) is the authoritative reference for Level 1 schema compliance — it uses the same engine deployed for IFC software certification. Run it when: you need to certify IFC output from a custom exporter, you're troubleshooting a file that parsers handle inconsistently, or a contract clause explicitly requires a buildingSMART schema certificate.",
      },
      {
        type: 'p',
        text: "What it does not do: check data quality, validate naming conventions, inspect property set completeness, check ISO 19650 metadata fields, or assess whether the model meets any project requirement. It is a schema tool, not a project delivery gate.",
      },
      {
        type: 'ifc-demo',
        modelId: 'office-architecture',
        title: 'Inspect a complex real-world IFC — all three validation layers',
        description: "A multi-storey office building exported from Revit. Open the Validation tab to see the full 44-rule quality report and Health Score. Then try loading an IDS specification to see Level 3 checking on the same model.",
        schema: 'IFC4',
        size: '14 MB',
        showProperties: true,
        allowFullscreen: true,
      },
      { type: 'h2', text: 'Level 2: Model Quality Checking — The Layer That Actually Governs Deliveries' },
      {
        type: 'p',
        text: "Model quality checking is the layer most BIM coordinators mean when they say 'IFC validation', even though they rarely call it by that name. It answers practical questions: Is the data here? Is it correct? Is it consistent? Can someone downstream actually use this model for coordination, cost planning, or FM?",
      },
      {
        type: 'p',
        text: "Unlike Level 1, quality checking is not binary. A model doesn't simply pass or fail — it has a quality profile across dozens of dimensions. The Health Score (0–100) aggregates these dimensions into a single number that can be written into a BEP, tracked across revisions, and attached to transmittals as evidence of delivery quality.",
      },
      { type: 'h3', text: 'What the 44-Rule Quality Check Covers' },
      {
        type: 'feature-grid',
        items: [
          {
            icon: '🔑',
            title: 'Core structural rules (18)',
            body: "Duplicate GUIDs, orphan elements, wrong containment, broken aggregates, missing IfcProject, empty element names, invalid storey placement. The rules that cause the most CDE rejections in practice.",
          },
          {
            icon: '📍',
            title: 'Spatial + file header (11)',
            body: "ISO 19650 metadata fields on IfcProject, FILE_NAME author and organisation population, site placement vs. shared coordinates, element-to-storey association, building storey completeness.",
          },
          {
            icon: '📋',
            title: 'LOD, classification, MEP (9)',
            body: "IfcElementQuantity presence at LOD 300+, IfcRelAssociatesClassification on structural and architectural elements, MEP system connectivity, proxy overuse (IfcBuildingElementProxy as a % of the model).",
          },
          {
            icon: '📐',
            title: 'Geometry + storey integrity (6)',
            body: "Element bounding box validity, storey elevation ordering, elements below the ground plane, floor slab absence from storey, coordinate origin offset from WCS, clash detection (optional rule, off by default).",
          },
        ],
      },
      { type: 'h3', text: 'The Health Score: Model Quality as a Single Number' },
      {
        type: 'p',
        text: "The Health Score uses logarithmic penalty weighting. Schema errors carry 3× the weight of warnings; warnings carry 3× the weight of info checks. The 1,000th instance of the same issue subtracts far fewer points than the 10th — this prevents large, dense models from appearing arbitrarily worse than small sparse models for the same underlying problem density. A model with 800 naming warnings can score 83; a model with 12 broken spatial references scores 41. Severity is what drives the score, not volume.",
      },
      {
        type: 'health-score',
        items: [
          { score: 31, label: 'Critical — structural failures, do not deliver' },
          { score: 58, label: 'Poor — significant remediation required' },
          { score: 74, label: 'Fair — acceptable for internal review only' },
          { score: 87, label: 'Good — CDE delivery ready' },
          { score: 96, label: 'Excellent — ISO 19650 milestone quality' },
        ],
      },
      {
        type: 'callout',
        variant: 'tip',
        text: "Put the threshold and the tool in the BEP — not just 'validate the IFC' but 'validate using [named tool], achieve Health Score ≥ 80 as measured before upload, attach the report to the transmittal'. Vague quality requirements produce vague quality. Specific, measurable requirements with named tools produce deliverable evidence.",
      },
      { type: 'h3', text: 'What Model Quality Checking Does NOT Do' },
      {
        type: 'ul',
        items: [
          "Verify project-specific information requirements — that is Level 3 (IDS). Quality rules are generic best-practice checks, not your EIR.",
          "Fix the model — quality checking produces a report. Remediation happens in the authoring tool or, for property and GUID fixes, in an IFC property editor.",
          "Provide the schema compliance certificate required by buildingSMART certification programs — that is Level 1 via the buildingSMART Validation Service.",
          "Tell you whether the model is geometrically correct — some geometry integrity checks are included, but a quality checker is not a clash detection or BIM authoring tool.",
        ],
      },
      { type: 'h2', text: 'Level 3: IDS Validation — Exchange Requirements as Machine-Readable Code' },
      {
        type: 'p',
        text: "IDS (Information Delivery Specification) is a buildingSMART standard for encoding project-specific information requirements in a machine-readable XML format. It is the missing link between an EIR — which is a Word document — and a validation engine that can systematically check a model against it. IDS 1.0 became an official buildingSMART standard in 2023.",
      },
      { type: 'h3', text: 'What buildingSMART IDS Actually Is' },
      {
        type: 'p',
        text: "An IDS file is an XML document containing one or more specifications. Each specification has an applicability section (which elements does this apply to?) and a requirements section (what must those elements have?). The engine checks every element in the model that matches the applicability, verifies it satisfies all requirements, and reports pass or fail per element, per specification. The result is a machine-generated audit trail of contractual compliance.",
      },
      {
        type: 'p',
        text: "The buildingSMART reference test suite contains 100 official testcases that define the expected behaviour of any conforming IDS engine — they are the specification in runnable form. An IDS engine that passes all 100 testcases has demonstrated it will interpret .ids specifications consistently with the standard.",
      },
      { type: 'h3', text: 'The Six IDS Facets' },
      {
        type: 'ul',
        items: [
          "Entity: restricts applicability or requirements by IFC entity type (IFCWALL, IFCDOOR, IFCBEAM) and optionally predefined type. This is the filter most specifications start with.",
          "Attribute: checks IFC attribute values that sit directly on the entity — Name, Description, ObjectType, Tag, PredefinedType. Attributes are distinct from property sets and are checked differently.",
          "Property: checks a named property within a named property set (Pset_WallCommon.FireRating, Pset_DoorCommon.IsExternal). The most commonly used facet. Supports data type constraints and pattern matching on values.",
          "Classification: checks that elements carry a classification reference via IfcRelAssociatesClassification — Uniclass 2015, OmniClass, NBS, or a custom scheme. Can constrain the classification system name and code pattern.",
          "Material: checks that elements have an assigned material via IfcMaterial, IfcMaterialLayerSet, or IfcMaterialConstituentSet. Optionally constrains the material name — useful for fire-rating or sustainability requirements.",
          "PartOf: checks that elements participate in a required spatial or logical relationship — contained in a storey, aggregated into a building system, hosted in a specific building. The facet that enforces spatial hierarchy compliance for specific element types.",
        ],
      },
      {
        type: 'code',
        lang: 'xml',
        text: `<?xml version="1.0" encoding="UTF-8"?>
<ids:ids xmlns:ids="http://standards.buildingsmart.org/IDS"
         xmlns:xsi="http://www.w3.org/2001/XMLSchema-instance"
         xsi:schemaLocation="http://standards.buildingsmart.org/IDS ids_09.xsd">
  <ids:info>
    <ids:title>Stage 3 Architecture — EIR Data Requirements</ids:title>
    <ids:description>Fire safety and classification requirements.</ids:description>
    <ids:ifcVersion>IFC4</ids:ifcVersion>
  </ids:info>
  <ids:specifications>

    <!-- All walls must carry a fire rating property -->
    <ids:specification name="Wall FireRating required" minOccurs="1">
      <ids:applicability>
        <ids:entity>
          <ids:name><ids:simpleValue>IFCWALL</ids:simpleValue></ids:name>
        </ids:entity>
      </ids:applicability>
      <ids:requirements>
        <ids:property dataType="IFCLABEL">
          <ids:propertySet><ids:simpleValue>Pset_WallCommon</ids:simpleValue></ids:propertySet>
          <ids:baseName><ids:simpleValue>FireRating</ids:simpleValue></ids:baseName>
        </ids:property>
      </ids:requirements>
    </ids:specification>

    <!-- Structural walls must carry a Uniclass 2015 classification -->
    <ids:specification name="Structural wall classification" minOccurs="0">
      <ids:applicability>
        <ids:entity>
          <ids:name><ids:simpleValue>IFCWALL</ids:simpleValue></ids:name>
          <ids:predefinedType><ids:simpleValue>SOLIDWALL</ids:simpleValue></ids:predefinedType>
        </ids:entity>
      </ids:applicability>
      <ids:requirements>
        <ids:classification>
          <ids:system><ids:simpleValue>Uniclass 2015</ids:simpleValue></ids:system>
        </ids:classification>
      </ids:requirements>
    </ids:specification>

  </ids:specifications>
</ids:ids>`,
      },
      { type: 'h3', text: 'EIR → IDS: The Translation Step Most Teams Skip' },
      {
        type: 'p',
        text: "An EIR specifies what information the client needs. An IDS encodes those requirements so a machine can check them. The translation between the two is the step almost nobody does — because it requires someone who understands both the information requirements and the IDS XML schema well enough to write a specification that tests exactly what the EIR asks for, no more and no less.",
      },
      {
        type: 'p',
        text: "The consequence: teams either skip IDS entirely and rely on informal manual review at delivery, or use a generic IDS file that does not reflect their actual EIR. Both produce false confidence. An IDS check that passes against a generic specification tells you nothing about whether your specific client requirements are met.",
      },
      {
        type: 'callout',
        variant: 'warning',
        text: "IDS validates only what you specified. If your .ids file requires FireRating on walls but your EIR also requires IsExternal on doors, Uniclass codes on all structural elements, and IfcElementQuantity on slabs — and you didn't write those specifications — the IDS engine reports all requirements met while half your EIR is unchecked. The quality of an IDS check is only as good as the .ids file driving it.",
      },
      { type: 'h3', text: 'Profile-Based IDS: A Practical Starting Point' },
      {
        type: 'p',
        text: "Not every team writes IDS from scratch. A practical approach is to maintain a library of reusable IDS profiles: one for Stage 3 architecture, one for MEP Stage 4, one for structural handover. Each profile covers the most common requirements for that phase and discipline, and is extended per-project with client-specific additions. IDS profiles can be loaded directly into the validation engine and composed — you can run multiple .ids files against the same model and aggregate the results.",
      },
      { type: 'h2', text: 'How the Three Levels Work Together — The Validation Pipeline' },
      {
        type: 'p',
        text: "The three layers form a quality gate that a model passes through in sequence. Each level has a different cadence: Level 1 runs on every export (a sanity check), Level 2 runs before any CDE upload (the quality gate), Level 3 runs before formal delivery milestones (the contract check). Running them out of order wastes time — there is no value in running IDS against a file with a broken spatial hierarchy.",
      },
      {
        type: 'code',
        lang: 'text',
        text: `
  ┌──────────────────────────────────────────────────────┐
  │  EXPORT IFC from authoring tool                      │
  │  (Revit, ArchiCAD, Tekla, Allplan, Vectorworks…)     │
  └───────────────────────┬──────────────────────────────┘
                          │
                          ▼
  ┌──────────────────────────────────────────────────────┐
  │  LEVEL 1 — IFC Integrity                             │
  │  • GlobalId uniqueness & format (leading char 0–3)   │
  │  • Spatial hierarchy: Project→Site→Building→Storey   │
  │  • IfcRelAggregates chain integrity                  │
  │  • IfcRelContainedInSpatialStructure (no orphans)    │
  │  • Exactly one IfcProject                            │
  │  • FILE_NAME header traceability fields              │
  └─────────┬────────────────────────────────────────────┘
  Fail ◄────┤  Fix in authoring tool (or IFC property editor)
            │  Pass
            ▼
  ┌──────────────────────────────────────────────────────┐
  │  LEVEL 2 — Model Quality (44 rules)                  │
  │  • Naming conventions / empty element names          │
  │  • Property set completeness (Pset_WallCommon etc.)  │
  │  • ISO 19650 metadata (IfcProject.LongName etc.)     │
  │  • Classification presence and consistency           │
  │  • LOD quantity sets, proxy audit, MEP connectivity  │
  │  → Health Score 0–100                                │
  └─────────┬────────────────────────────────────────────┘
  Score<80 ◄┤  Fix properties / names in IFC editor or authoring tool
            │  Score ≥ 80
            ▼
  ┌──────────────────────────────────────────────────────┐
  │  LEVEL 3 — IDS Validation                            │
  │  • Project-specific EIR / AIR requirements           │
  │  • .ids specification(s) for this milestone          │
  │  • Six facets: entity, attribute, property,          │
  │    classification, material, partOf                  │
  └─────────┬────────────────────────────────────────────┘
  Fail ◄────┤  Fix per IDS issue report → export BCF → remediate
            │  All requirements met
            ▼
  ┌──────────────────────────────────────────────────────┐
  │  DELIVER TO CDE                                      │
  │  Attach: Health Score report + IDS pass certificate  │
  └──────────────────────────────────────────────────────┘
`,
      },
      { type: 'h2', text: 'The Comparison Table: Level 1 vs Level 2 vs Level 3' },
      {
        type: 'table',
        headers: ['Dimension', 'L1: IFC Integrity', 'L2: Model Quality', 'L3: IDS Validation'],
        rows: [
          ['Question answered', 'Is the file a valid IFC schema?', 'Is the data useful for coordination?', 'Does it meet project information requirements?'],
          ['Standard', 'ISO 10303-21 (STEP), ISO 16739-1 (IFC)', 'BIM best practice, ISO 19650 norms', 'buildingSMART IDS 1.0 (XML schema)'],
          ['Defined by', 'buildingSMART (fixed schema)', 'BIM team / EIR (project-agreed rules)', 'Client / employer (per-project)'],
          ['Output', 'Pass / Fail + schema error list', 'Health Score 0–100 + prioritised issue list', 'Pass / Fail per specification'],
          ['Can replace others?', 'No', 'No', 'No — all three needed'],
          ['Cadence', 'Every IFC export', 'Before CDE upload', 'Before delivery milestone'],
          ['Passes but fails another?', 'Zero Psets, no names → L1 pass, L2 fail', 'Fire rating missing (IDS spec) → L3 fail', 'Duplicate GUIDs, broken hierarchy'],
          ['Example tools', 'bSmart Validator, IFC Viewer Online', 'IFC Viewer Online, Solibri, IfcOpenShell', 'IFC Viewer Online (IDS engine), Solibri'],
        ],
      },
      { type: 'h2', text: 'When to Use the buildingSMART Validation Service — An Honest Assessment' },
      {
        type: 'p',
        text: "The buildingSMART IFC Validation Service checks files against the official schema using a multi-part engine: STEP physical file syntax, IFC schema EXPRESS rules, informal proposition rules derived from the spec, and normative IFC constraint rules. It is the reference tool for Level 1 schema compliance.",
      },
      { type: 'h3', text: 'Use it when' },
      {
        type: 'ul',
        items: [
          "Certifying IFC export from a custom exporter: the buildingSMART checker produces the reference result used for software certification. No other tool's output substitutes for it in certification contexts.",
          "Diagnosing parser inconsistency: when a file opens cleanly in one tool and errors in another, the buildingSMART checker establishes which behaviour is schema-correct. This is diagnostically valuable even if the file is otherwise usable.",
          "A contract clause requires it: some procurement specifications reference buildingSMART schema compliance as a delivery requirement. In that case, the certificate from the official service is what satisfies the clause.",
          "Validating an IDS file itself: the buildingSMART IDS schema validator checks whether your .ids file is a valid IDS document — distinct from running it against a model.",
        ],
      },
      { type: 'h3', text: 'Do not use it as a substitute for' },
      {
        type: 'ul',
        items: [
          "Model quality checking — the service does not check property set completeness, naming conventions, classification, or any data quality rule.",
          "Project-specific validation — schema compliance says nothing about whether the model meets the client's EIR.",
          "Pre-CDE delivery confirmation — a schema-valid model with empty Psets and blank names will pass the buildingSMART checker and fail any meaningful quality gate.",
        ],
      },
      {
        type: 'callout',
        variant: 'info',
        text: "The buildingSMART Validation Service requires file upload. For models containing sensitive asset data, residential occupant information, or metadata that qualifies as personal data under GDPR, check whether upload to a third-party service is compliant with your project's data handling requirements before using it.",
      },
      { type: 'h2', text: 'Cloud IFC Validator vs Browser-Based IFC Validator' },
      {
        type: 'p',
        text: "The distinction between cloud validation (file uploaded to a remote server) and browser-based validation (file processed locally via WebAssembly) matters more than most teams realise — especially for government, defence, and sensitive commercial projects.",
      },
      {
        type: 'comparison',
        left: {
          label: 'Browser-Based Validation',
          color: 'accent',
          items: [
            'IFC file never leaves the device',
            'GDPR compliant by design — no data transfer',
            'Works offline: site visits, restricted networks',
            'No upload quota or file size restriction',
            'Instant feedback — no network round-trip latency',
            'Consistent performance independent of server load',
            'No account, API key, or subscription required',
            'Works on government-restricted network environments',
          ],
        },
        right: {
          label: 'Cloud Validation',
          color: 'muted',
          items: [
            'File uploaded to remote server for processing',
            'Data processing agreement (DPA) required for GDPR',
            'Suited for automated CI/CD validation pipelines',
            'Central audit log across projects and teams',
            'API and webhook integration for delivery automation',
            'Scales horizontally for batch model processing',
            'Can run headless without a browser session',
            'Results queryable across historical runs',
          ],
        },
      },
      { type: 'h3', text: 'When Cloud Validation Makes Sense' },
      {
        type: 'ul',
        items: [
          "Automated CI/CD pipelines: when validation should trigger automatically every time a model is committed or uploaded — similar to how software teams run automated tests on every code push. Cloud APIs with webhooks are the right architecture here.",
          "Organisation-wide audit: when a BIM manager needs a central record of validation runs across multiple projects and teams. Cloud services can aggregate and trend data across runs in ways per-machine tools cannot.",
          "Batch processing: auditing a library of existing models — all IFC files delivered to a CDE over the past two years — is practical in cloud batch mode and impractical to do manually in a browser.",
          "Non-sensitive models: for projects where data handling requirements do not prohibit cloud upload, cloud validators offer CI/CD integration that browser tools do not match.",
        ],
      },
      { type: 'h3', text: 'When Browser-Based Is the Better Choice' },
      {
        type: 'ul',
        items: [
          "Government and defence projects: models for public infrastructure, defence facilities, and secure assets routinely carry data handling restrictions that prohibit upload to third-party services. Browser-based validation is the only compliant option.",
          "Sensitive residential and commercial schemes: BIM models often contain occupant information, owner addresses, and asset metadata that qualifies as personal data under GDPR Article 4. Processing these on a third-party server without a valid DPA and legal basis is non-compliant.",
          "Site and field use: a 200 MB IFC file over a 4G connection uploads slowly and unreliably. Browser validation processes it locally in seconds with no dependency on uplink bandwidth.",
          "Pre-validation before cloud upload: even when a team uses a cloud validator as the formal gate, running a browser-based check first catches obvious issues without the upload — reducing cloud usage costs and upload frequency.",
        ],
      },
      {
        type: 'callout',
        variant: 'warning',
        text: "GDPR Article 4 defines personal data broadly — it includes building occupant names, owner addresses, and sometimes asset reference codes if they link back to identifiable individuals. Before uploading an IFC file to any cloud service, verify whether the model contains personal data and whether your organisation has a valid legal basis, a signed DPA, and appropriate data transfer safeguards in place.",
      },
      { type: 'h2', text: 'Six Validation Mistakes BIM Teams Make — and What They Actually Mean' },
      { type: 'h3', text: 'Mistake 1: "IDS passed — the model is good"' },
      {
        type: 'p',
        text: "IDS validates only what the .ids specification declares. If your file requires FireRating on walls but your EIR also requires IsExternal on doors, Uniclass codes on structural elements, and quantity sets on slabs — and those were not written into the specification — the engine reports all requirements met while half your EIR is unchecked. An IDS pass is a contractual confirmation against a specific specification. It is not a general quality certificate.",
      },
      { type: 'h3', text: 'Mistake 2: "The buildingSMART checker said it\'s valid"' },
      {
        type: 'p',
        text: "Schema validity is the floor, not the ceiling. A file where every element has Name='' and zero property sets is perfectly schema-valid. A model with no IfcElementQuantity, no classification, and every physical element placed directly in IfcSite rather than a storey is perfectly schema-valid. Passing the buildingSMART checker means the STEP file is correctly formatted — it says nothing about whether the data is useful.",
      },
      { type: 'h3', text: 'Mistake 3: "I can open it in a viewer, so it\'s fine"' },
      {
        type: 'p',
        text: "IFC viewers are permissive by design — they are built to display geometry regardless of data quality. A viewer that refused to open schema-invalid or data-poor files would be unusable. Geometry rendering correctly tells you nothing about property set completeness, naming conventions, GUID stability, classification, or any of the 44 quality dimensions. Viewing a file is categorically different from validating it.",
      },
      { type: 'h3', text: 'Mistake 4: Checking geometry only, ignoring property data' },
      {
        type: 'p',
        text: "A common reflex is to open the IFC, inspect the 3D model, and if the building looks right, declare the file done. Geometry accounts for roughly 30% of what makes an IFC file useful. Property sets, classifications, element names, type assignments, and quantity sets are what FM systems, cost managers, and CDE asset registers actually consume. A geometrically correct file with blank property sets fails handover.",
      },
      { type: 'h3', text: 'Mistake 5: Validating once, at the delivery deadline' },
      {
        type: 'p',
        text: "Treating validation as the final step before a CDE submission means remediating issues under pressure with no buffer. A model with 800 validation issues discovered the day before the deadline will either be delivered with known problems or miss the deadline. The correct cadence: Level 1 after every export, Level 2 before every internal review (weekly minimum), Level 3 two weeks before each formal milestone.",
      },
      { type: 'h3', text: 'Mistake 6: Ignoring GUID stability across re-exports' },
      {
        type: 'p',
        text: "Duplicate GUIDs within a file are a Level 1 issue and are detectable by any validator. But GUID instability across re-exports — where the same element gets a different GlobalId each time the model is exported — is invisible to single-file validation. When GlobalIds drift between revisions, every BCF comment, CDE element reference, and FM asset tag silently becomes a dangling reference. This requires a two-revision comparison and a check of export settings, not just single-file validation.",
      },
      { type: 'h2', text: 'A Practical Validation Workflow for BIM Coordinators' },
      {
        type: 'ol',
        items: [
          "After every IFC export: run a Level 1 check. Takes under 30 seconds in any browser-based validator. Fix GlobalId duplicates, orphan elements, and spatial hierarchy breaks before they compound across revisions.",
          "Before every internal review (weekly or per-sprint): run a full Level 2 quality check. Review the Health Score trend. A score declining across revisions means new issues are being introduced — find the source before it becomes a pattern.",
          "On receipt of any discipline model from a third party: run Level 1 and Level 2 before federating. A model you receive may carry issues you inherit into the coordination model — detect them immediately, not three weeks into coordination on a broken federation.",
          "Two weeks before any formal milestone delivery: run all three levels. Health Score ≥ 80 target before IDS. Two weeks gives time to remediate without pressure. Flag early — do not absorb the buffer.",
          "Before uploading to the CDE: run Level 2 and Level 3. Attach the Health Score certificate and IDS pass report to the transmittal. This creates a documented audit trail and gives the information manager everything needed to accept the delivery.",
          "After any authoring tool version upgrade or change to export settings: re-establish the GUID stability baseline by comparing two consecutive exports. A Revit upgrade or a changed export configuration can silently change GlobalId generation behaviour.",
        ],
      },
      {
        type: 'callout',
        variant: 'tip',
        text: "Automate the cadence: set a recurring calendar reminder for Level 2 validation before every coordination meeting. Treat a declining Health Score as a sprint issue, not a pre-delivery emergency. The teams that arrive at delivery milestones with high scores are the ones that ran weekly checks — not the ones that ran it once the night before.",
      },
      { type: 'h2', text: 'Expert Tips' },
      {
        type: 'feature-grid',
        items: [
          {
            icon: '⚡',
            title: 'Triage by penalty, not count',
            body: "Don't fix issues in order of volume — fix them in order of Health Score impact. Three missing IfcProject metadata fields can cost 15 points. Eight hundred naming warnings might cost 8 points total. Use the severity breakdown to triage by impact.",
          },
          {
            icon: '🔒',
            title: 'Lock export settings in a template',
            body: "Every time export settings are manually reconfigured, there is risk of drifting to a different configuration. Create a named IFC export setup in your authoring tool, commit it to the project template, and document the required settings in the BEP. Configuration drift is the root cause of most 'it worked last time' export problems.",
          },
          {
            icon: '📁',
            title: 'Translate EIR to IDS at project start',
            body: "Translate the most critical EIR clauses into an IDS specification in the first two weeks of the project. Even a partial .ids file — five or six specifications — is better than full manual EIR review at delivery time, and catches systematic data gaps early when they are cheap to fix.",
          },
          {
            icon: '🌐',
            title: 'Validate each discipline model before federating',
            body: "Issues from one discipline model can mask or interact with issues from another in a federation. Validate clean inputs, federate clean. Running validation only on the coordination model after federation makes it harder to assign issues to the correct originator.",
          },
        ],
      },
      { type: 'h2', text: 'Frequently Asked Questions' },
      { type: 'h3', text: 'Does passing Level 1 mean I can skip Level 2?' },
      {
        type: 'p',
        text: "No. Level 1 and Level 2 measure completely different properties of a file. A schema-valid file (Level 1) can have zero property sets, empty element names, no classification, and no ISO 19650 metadata — and score 20 on a quality check (Level 2). You always need both. Think of Level 1 as 'the file is correctly packaged' and Level 2 as 'the contents of the package are what was requested'.",
      },
      { type: 'h3', text: 'Is IDS a replacement for the buildingSMART Validation Service?' },
      {
        type: 'p',
        text: "No. IDS checks project-specific information requirements (Level 3). The buildingSMART Validation Service checks schema compliance (Level 1). They operate at completely different levels and address different questions. An IDS-passing model that fails schema validation would be a logical contradiction — Level 1 integrity is a prerequisite for meaningful Level 3 checking.",
      },
      { type: 'h3', text: 'Which IDS facets should I prioritise for a standard BIM delivery?' },
      {
        type: 'p',
        text: "The Property facet covers 70–80% of real-world EIR requirements — most clients want specific property set values populated on specific element types. Classification covers most of the remainder for Uniclass- or OmniClass-governed projects. The Entity facet appears in almost every specification as an applicability filter. Material and PartOf address specific contractual requirements. Start with Entity + Property, add Classification if your EIR requires it, and expand from there.",
      },
      { type: 'h3', text: 'Can I validate an IFC without uploading it anywhere?' },
      {
        type: 'p',
        text: "Yes. Browser-based validators process the file entirely in your browser using WebAssembly. The IFC bytes never leave your device — all 44 quality rules, the Health Score calculation, and the full IDS engine run client-side. For models with data handling restrictions — government assets, sensitive residential data, defence infrastructure — this is often the only compliant option.",
      },
      { type: 'h3', text: 'What Health Score threshold should I specify in the BEP?' },
      {
        type: 'p',
        text: "≥ 80 is the standard threshold for CDE delivery and design coordination. ≥ 90 for LOD 300+ design development deliveries and ISO 19650 formal milestone submissions. ≥ 70 is acceptable for concept-stage internal reviews. Below 60, the model has structural quality problems and should not be delivered to any external party under any circumstance.",
      },
      { type: 'h3', text: 'Can a single tool cover all three validation levels?' },
      {
        type: 'p',
        text: "Some tools do. IFC Viewer Online covers Level 1 (integrity rules including GUID, hierarchy, and file header checks), Level 2 (44-rule quality check with Health Score), and Level 3 (IDS 1.0 engine validated against all 100 official bSI testcases). Solibri covers Level 2 and Level 3 with a more sophisticated rule engine but no browser-based processing. The buildingSMART Validation Service covers Level 1 only. IfcOpenShell can be scripted for Level 1 and Level 2.",
      },
      { type: 'h2', text: 'Summary' },
      {
        type: 'pull-quote',
        text: "Schema-valid is not project-valid. Project-valid is not EIR-compliant. All three validation layers are needed — and conflating them is the root cause of most formal delivery failures.",
        cite: 'IFC Viewer Blog',
      },
      {
        type: 'feature-grid',
        items: [
          {
            icon: '🔩',
            title: 'Level 1: Run on every export',
            body: "Schema integrity, GlobalId uniqueness and format, spatial hierarchy. Takes 30 seconds. Catches the structural failures that silently corrupt BCF, CDE versioning, and FM asset registers downstream.",
          },
          {
            icon: '📊',
            title: 'Level 2: Gate every CDE delivery',
            body: "44 quality rules, Health Score, naming conventions, property set completeness, ISO 19650 metadata. Require ≥ 80 in your BEP and EIR. This is the layer that makes a model useful — not just parseable.",
          },
          {
            icon: '📋',
            title: 'Level 3: Verify before every milestone',
            body: "IDS specifications that encode your EIR and AIR in machine-readable form. Translate the critical clauses at project start, not the week before delivery. An IDS pass is a documented contractual audit trail.",
          },
        ],
      },
      {
        type: 'p',
        text: ["Run a full quality check on your current model — under 30 seconds in any browser, nothing uploaded. Then read the ", { text: 'IFC Health Score guide', to: 'ifc-health-score-guide' }, " to understand how the score is calculated and what threshold to set in your BEP. If property values or GUIDs need fixing on a received file, the ", { text: 'free online IFC editor guide', to: 'ifc-editor-online' }, " covers non-destructive property editing without a round-trip through the authoring tool. And for the most common structural failures that cause Level 1 rejections, see ", { text: 'the 7 most common IFC validation errors', to: 'common-ifc-validation-errors' }, "."],
      },
    ],
  },

  // ── Article #4 — "IFC Health Score" / "IFC model quality" (definitive reference)

  {
    slug: 'ifc-health-score',
    title: 'IFC Health Score: The Definitive Guide for BIM Coordinators and Managers',
    excerpt: "An IFC Health Score is not a percentage — it is a decision-making tool. How it is calculated, what each band means, how to set thresholds in the BEP, and how to use it as a quality gate at every project stage.",
    date: '2026-06-28',
    readTimeMin: 22,
    category: 'BIM Best Practices',
    categorySlug: 'best-practices',
    author: 'IFC Viewer Team',
    featured: true,
    keywords: [
      'IFC Health Score', 'IFC model quality', 'IFC validation score', 'BIM model quality',
      'IFC quality check', 'IFC validation', 'IFC model checker', 'BIM QA',
      'OpenBIM validation', 'IFC quality assessment', 'model health score',
    ],
    faqs: [
      {
        q: 'What is an IFC Health Score?',
        a: "An IFC Health Score is a 0–100 number that summarises the structural and data quality of an IFC model against a set of validation rules. It is not a percentage of rules passed — it is a weighted, logarithmic penalty model where structural errors carry more weight than data warnings. A score of 80+ is generally considered suitable for CDE delivery; below 60 indicates structural problems that will cause failures in downstream tools.",
      },
      {
        q: 'How is an IFC Health Score calculated?',
        a: "The score starts at 100. Each validation rule failure subtracts points using a logarithmic decay function — the first few instances subtract more than later instances of the same rule. Schema errors (structural failures like missing IfcProject or broken hierarchy) carry three times the penalty weight of data warnings (such as naming inconsistencies). Logarithmic scaling prevents a large model from scoring worse than a small model for the same underlying problem density.",
      },
      {
        q: 'What IFC Health Score should I specify in the BEP?',
        a: "≥ 80 is the standard threshold for CDE delivery and cross-discipline coordination. ≥ 90 for ISO 19650 formal milestone submissions and LOD 300+ design development deliveries. ≥ 70 is acceptable for concept-stage internal reviews only. Specify the threshold in the EIR (contractual) as well as the BEP — only the EIR creates a legally enforceable quality gate.",
      },
      {
        q: 'Can a model score 100 and still have quality problems?',
        a: "Yes. A Health Score measures 44 structural and data quality rules. It does not measure IDS compliance (project-specific information requirements), semantic accuracy (whether property values are factually correct), or design intent. A model with syntactically correct but factually wrong property values will score 100. The score confirms structural and data completeness, not project correctness.",
      },
      {
        q: 'Does a high Health Score mean I can skip IDS validation?',
        a: "No. The Health Score and IDS validation answer different questions. The Health Score asks: is this model well-formed and data-complete? IDS asks: does this model meet the specific information requirements of this project? A model can score 95 and fail IDS validation because it is missing the Pset_WallCommon values required by the EIR. Both checks are always necessary.",
      },
      {
        q: 'Is a Health Score of 100 always the goal?',
        a: "Not always. The appropriate threshold depends on delivery stage and project type. A concept design review might accept 70. A CDE delivery requires 80. An ISO 19650 formal submission targets 90+. Pursuing 100 at the concept stage wastes effort that should go into design development. Define the threshold for each delivery milestone in the BEP and EIR — then validate against that threshold, not the maximum.",
      },
    ],
    content: [
      {
        type: 'callout',
        variant: 'info',
        text: "TL;DR — A Health Score is a 0–100 decision signal, not a percentage. 80+ means deliver. Below 60 means structural problems exist. The score tells you whether to deliver now; the rule breakdown tells you what to fix. Set the threshold in your EIR, not just the BEP.",
      },
      {
        type: 'stat-row',
        stats: [
          { value: 44, suffix: '', label: 'quality rules checked' },
          { value: 100, suffix: '', label: 'max score (not always the goal)' },
          { value: 80, suffix: '+', label: 'target for CDE delivery' },
          { value: 0, suffix: ' bytes', label: 'uploaded to validate' },
        ],
      },
      { type: 'h2', text: 'What an IFC Health Score Actually Is — and Is Not' },
      {
        type: 'p',
        text: "Every BIM project has a vague quality requirement in the BEP. 'Deliver a quality IFC.' Nobody defines what that means until a model gets rejected at the CDE, a clash session is wasted on orphan elements, or a handover package is missing half its asset data. The IFC Health Score exists to make that vague requirement concrete — a single number, calculated the same way every time, on every machine, by every tool that implements it.",
      },
      {
        type: 'p',
        text: "But the most common mistake is treating it as a percentage. It is not. A score of 73 does not mean 73% of something is correct. It is a weighted, severity-adjusted, logarithmically-scaled quality signal. Understanding that distinction changes how you set thresholds, how you interpret results, and how you communicate quality to project stakeholders who do not work inside IFC files.",
      },
      {
        type: 'comparison',
        left: {
          label: 'A Health Score IS',
          color: 'accent',
          items: [
            'A 0–100 weighted summary of structural and data quality',
            'A contractable deliverable criterion — it belongs in the EIR',
            'A decision signal: can I deliver this model today?',
            'A progress indicator that updates on every validation run',
            'Comparable across model versions, disciplines, and team members',
            'Affected by severity (errors penalise more than warnings)',
            'Logarithmically scaled (10,000 name warnings ≠ 10,000 × 1 name warning)',
          ],
        },
        right: {
          label: 'A Health Score IS NOT',
          color: 'muted',
          items: [
            'A percentage of validation rules passed',
            'A measure of design correctness or project accuracy',
            'A replacement for IDS / EIR compliance checking',
            'A guarantee that property values are semantically correct',
            'A substitute for BIM Coordinator professional review',
            'An absolute measure — thresholds are project- and stage-specific',
            'A tool score — the same model gives the same score in any tool implementing the same rules',
          ],
        },
      },
      { type: 'h2', text: 'Why Traditional Validation Reports Create Decision Paralysis' },
      {
        type: 'p',
        text: "A standard validation report on a mid-complexity Revit export typically contains between 200 and 1,200 individual issues across 8 to 12 rule categories. It tells you everything and nothing at the same time. The Information Manager sees 847 issues and rejects the model. The BIM Coordinator opens the report, scrolls past 620 naming convention warnings (all the same rule), and finds three actually critical errors buried on page 12.",
      },
      {
        type: 'p',
        text: "The problem is that raw issue counts are uninformative without severity weighting. A model with 800 naming warnings and zero structural errors is categorically different from a model with 12 broken spatial hierarchies and a missing IfcProject. A Health Score collapses that distinction into a single, actionable number — and the rule breakdown beneath it gives the prioritised action list.",
      },
      {
        type: 'pull-quote',
        text: "A report with 847 issues tells you there are problems. A Health Score of 74 tells you whether you can deliver today — and a score of 34 tells you to stop coordination until it is fixed.",
        cite: 'IFC Viewer Blog',
      },
      { type: 'h2', text: 'How a Health Score Is Calculated' },
      {
        type: 'p',
        text: "The calculation starts at 100 and subtracts points for every rule failure. Two mechanisms prevent the score from becoming a simple issue count:",
      },
      {
        type: 'feature-grid',
        items: [
          {
            icon: '⚖️',
            title: 'Severity weighting',
            body: "Schema errors (structural failures: missing IfcProject, broken aggregates, circular references) carry 3× the penalty of quality warnings (empty names, missing classifications). This reflects the actual impact hierarchy — a structural failure breaks downstream tools; a naming warning does not.",
          },
          {
            icon: '📉',
            title: 'Logarithmic decay',
            body: "The first occurrence of a rule failure subtracts more points than the thousandth. A model with 10 duplicate GUIDs and a model with 10,000 duplicate GUIDs are different in severity — but not 1,000× different. Logarithmic scaling prevents file size from contaminating the quality signal.",
          },
        ],
      },
      {
        type: 'code',
        lang: 'text',
        text: `Conceptual scoring model:

  score = 100

  for each failing rule:
    base_penalty = rule.severity_weight × log(1 + issue_count)
    score -= base_penalty

  Severity weights:
    schema_error  → 3.0×   (missing IfcProject, broken hierarchy, duplicate GUIDs)
    quality_error → 1.5×   (missing property sets, wrong container placement)
    warning       → 1.0×   (naming conventions, missing classifications)
    info          → 0.3×   (optional metadata gaps, non-critical omissions)

  score = max(0, score)

Note: The actual formula is proprietary to each tool implementation.
This is the conceptual model — the penalty shape, not the exact coefficients.`,
      },
      {
        type: 'callout',
        variant: 'info',
        text: "The logarithmic scale is the reason a model with 10,000 naming warnings can still score 81 — while a model with 6 broken spatial hierarchies scores 52. Both are real outcomes. The score is not counting issues; it is measuring the quality impact those issues represent.",
      },
      { type: 'h2', text: 'The 11 Quality Dimensions That Drive Your Score' },
      {
        type: 'p',
        text: "The 44 validation rules group into eleven quality dimensions. Understanding which category is driving your score down tells you where to focus remediation effort before the next validation run:",
      },
      {
        type: 'ul',
        items: [
          "Schema integrity — Does the file contain exactly one IfcProject? Are all aggregate relationships pointing to existing entities? Are there circular spatial references?",
          "GlobalId uniqueness and format — Are all GlobalIds unique within the file? Does the first character fall in the valid 0–3 range of the IFC base-64 alphabet?",
          "Spatial hierarchy — Is the containment chain Project → Site → Building → Storey → physical element intact for all elements?",
          "Element containment — Are any physical elements orphaned (no spatial container), or placed directly inside IfcBuilding or IfcSite instead of a storey?",
          "Element naming — Are Name and Description fields populated on all IfcRoot entities that represent physical elements or spaces?",
          "Property set completeness — Are the expected standard property sets (Pset_WallCommon, Pset_SpaceCommon, etc.) present and populated on the element types that require them?",
          "ISO 19650 metadata — Are IfcProject.LongName, Description, and ObjectType populated? Are the FILE_NAME header author and organization fields non-empty?",
          "Classification — Do physical elements carry an IfcRelAssociatesClassification relationship? Is the classification system consistent across the file?",
          "Material assignments — Do structural, architectural, and finishing elements have material layer set or material profile set definitions?",
          "Geometry integrity — Are there degenerate faces, self-intersecting surfaces, or non-manifold geometry that will cause failures in clash detection and quantity takeoff?",
          "LOD consistency — Does the property set density match the declared Level of Development? An LOD 300 delivery missing area and volume quantities fails this check.",
        ],
      },
      { type: 'h2', text: 'Score Ranges: What Each Band Means and What to Do' },
      {
        type: 'health-score',
        items: [
          { score: 97, label: 'Excellent — ISO 19650 ready' },
          { score: 89, label: 'Very Good — CDE delivery ready' },
          { score: 77, label: 'Acceptable — review before formal delivery' },
          { score: 61, label: 'Poor — significant corrections needed' },
          { score: 38, label: 'Critical — do not deliver' },
        ],
      },
      {
        type: 'table',
        headers: ['Score Range', 'Band', 'Interpretation and action'],
        rowHeaders: true,
        rows: [
          ['95 – 100', 'Excellent ✅', 'Suitable for all formal deliveries including ISO 19650 submissions. Minor or no rule failures. No action needed.'],
          ['85 – 94', 'Very Good 🟢', 'Minor data completeness issues. CDE-ready for standard coordination. Resolve remaining failures before LOD 300+.'],
          ['70 – 84', 'Acceptable 🟡', 'Meaningful data quality gaps. Acceptable for internal review and concept design. Must be reviewed and improved before any cross-discipline coordination or CDE upload.'],
          ['50 – 69', 'Poor 🟠', 'Significant structural or data problems. Not suitable for coordination. Fix all schema errors first, then address the highest-impact data quality rules.'],
          ['Below 50', 'Critical 🔴', 'Fundamental structural failures: orphan elements, broken hierarchy, missing IfcProject, circular refs. Return to authoring tool. Do not deliver under any circumstance.'],
        ],
      },
      {
        type: 'p',
        text: "These ranges are a starting framework. The appropriate threshold for your project depends on the delivery stage, contractual requirements, and what the receiving party's tools can tolerate. A highway authority accepting infrastructure IFC files for a GIS system may require ≥ 90 at every exchange; a small residential practice doing internal coordination may work comfortably at ≥ 70 during design development. The bands above reflect industry consensus, not a single fixed rule.",
      },
      {
        type: 'callout',
        variant: 'tip',
        text: "If you are setting a threshold for the first time and have no project history to calibrate from: start at ≥ 80 for CDE delivery. Run validation on your last three IFC exports to see where your team currently lands. If you are routinely scoring 65, an 80 target with a remediation plan is more useful than a 90 target your team cannot reach.",
      },
      { type: 'h2', text: 'Three Real Project Scenarios: Health Scores in Context' },
      {
        type: 'p',
        text: "Abstract thresholds are easier to apply when you have seen them against real models. The following scenarios are composites drawn from common patterns seen across architectural, MEP, and infrastructure IFC deliveries.",
      },
      { type: 'h3', text: 'Scenario 1: Architectural IFC — Score 95' },
      {
        type: 'p',
        text: "A mid-sized commercial office building, LOD 300, exported from ArchiCAD 27. The validation report shows 43 issues: 38 naming convention warnings across generic annotation elements ('Annotation-001' instead of a descriptive name), and 5 instances of missing material assignments on curtain wall panels. No schema errors. No duplicate GUIDs. Spatial hierarchy is intact. IfcProject metadata is fully populated. ISO 19650 file header is complete. The score is 95. The BEP requires ≥ 85 for CDE delivery. Decision: deliver as-is, note the naming issues as a non-blocking comment in the transmittal, schedule material assignment correction in the next revision.",
      },
      { type: 'h3', text: 'Scenario 2: MEP Services IFC — Score 68' },
      {
        type: 'p',
        text: "A full mechanical and electrical services model, LOD 250, exported from Revit 2025 MEP. Score: 68. The rule breakdown shows the causes in priority order: 214 duplicate GlobalIds (high severity — the Revit export configuration regenerated GUIDs, colliding with elements copied from an older linked model), 89 elements placed directly inside IfcBuilding instead of a storey (spatial containment failure — HVAC risers that cross multiple floors were placed at the building level rather than anchored to the basement storey), 44 IfcFlowTerminal elements with no classification (Uniclass was required by the EIR), and 312 naming warnings on distribution boards. The spatial containment failures and duplicate GUIDs are schema-level: they will corrupt BCF references and break FM export. This model should not be delivered. Fix GUIDs (auto-fixable), correct the storey placement for the risers, add classification — then revalidate. Expected score after remediation: ≥ 83.",
      },
      { type: 'h3', text: 'Scenario 3: Infrastructure IFC — Score 82' },
      {
        type: 'p',
        text: "An IFC4.3 highway alignment model exported from Civil 3D via a custom exporter, covering a 4 km road section with drainage and kerb elements. Score: 82. The main penalty sources: 67 elements without classification (Uniclass Table J was required), missing quantity sets on 104 kerb elements (the contract requires explicit lengths in BaseQuantities), and inconsistent IfcProject.LongName (the header shows the filename rather than the official project title). No structural errors. No duplicate GUIDs. The client's specification requires a minimum score of 80 for model exchanges during construction. The model passes. The coordinator notes the three areas for correction before the formal design freeze submission, where the threshold increases to 90.",
      },
      {
        type: 'callout',
        variant: 'info',
        text: "The key insight across all three scenarios: the score tells you whether to deliver, and the rule breakdown tells you exactly where to spend the next hour of remediation effort. Both pieces of information are needed — the score without the breakdown is a traffic light without a dashboard.",
      },
      { type: 'h2', text: 'How BIM Teams Should Use Health Scores Across the Project Lifecycle' },
      {
        type: 'p',
        text: "A Health Score is most useful when it is embedded into the project rhythm, not applied only at delivery. The validation run should take less than 30 seconds for any model that can open in a browser — the friction of running it is negligible. The friction of not running it — and discovering structural failures at a CDE gate or a coordination session — is measured in days.",
      },
      {
        type: 'feature-grid',
        items: [
          {
            icon: '📅',
            title: 'Weekly QA during design development',
            body: "Run validation every week during active model authoring. Track the score trend in the project log. A score that drops 15 points between Friday and the following Friday tells you something changed — and is far easier to diagnose now than in six weeks when the model is twice as complex.",
          },
          {
            icon: '🔗',
            title: 'Before every coordination session',
            body: "Every discipline should pass their threshold (≥ 70 for internal, ≥ 80 for cross-discipline) before the session. A federated Navisworks or IFC coordination model built from files scoring below 60 produces nonsense clashes — elements in wrong locations, orphaned MEP runs that cannot be referenced, BCF issues that point at nothing.",
          },
          {
            icon: '📋',
            title: 'Before IDS / EIR validation',
            body: "IDS validation assumes a well-formed, data-complete base model. Running an IDS check against a model with broken spatial hierarchy or duplicate GUIDs produces unreliable results — the IDS engine may misidentify elements, miss containment-based applicability rules, or produce false passes. Require ≥ 75 before any IDS run to get a trustworthy result.",
          },
          {
            icon: '🔄',
            title: 'Before every model exchange',
            body: "Attach the Health Score as a header field on every transmittal. This gives the receiving discipline immediate context before they open the file, and creates an audit trail of model quality progression throughout the project. Some CDEs support custom metadata fields — this is one worth using.",
          },
          {
            icon: '🚪',
            title: 'The CDE delivery gate',
            body: "The non-negotiable checkpoint. The model must meet the BEP-specified threshold before upload. Information Managers should not manually review models that have not been validated — the score report (with timestamp, tool version, and score) should be a mandatory transmittal attachment. Models below threshold are returned to the originator; the score is the objective reason.",
          },
        ],
      },
      {
        type: 'ol',
        items: [
          "Export the IFC from the authoring tool with stable GUID settings enabled.",
          "Open in the browser validator — validation completes in under 30 seconds for most project models.",
          "Read the score. If below your stage threshold, open the rule breakdown.",
          "Sort the issue list by severity (errors first). Address schema errors before data warnings.",
          "Apply auto-fixes where available (GUID duplicates, format errors). Manual fixes for hierarchy and naming issues.",
          "Re-export from the authoring tool with the corrected settings (stable GUIDs, correct storey placement). Re-validate.",
          "When the threshold is met, attach the score report to the transmittal and upload to the CDE.",
        ],
      },
      { type: 'h2', text: 'The Complete Quality Stack: Score → Rules → IDS → BCF → Delivery' },
      {
        type: 'p',
        text: "The Health Score is one layer in a four-layer quality stack. Each layer answers a different question, and they are not substitutes for each other. Understanding the stack is the conceptual foundation for a robust BIM QA workflow:",
      },
      {
        type: 'code',
        lang: 'text',
        text: `┌──────────────────────────────────────────────────────────────────┐
│                      IFC Model File                              │
│               (exported from authoring tool)                     │
└──────────────────────────┬───────────────────────────────────────┘
                           │
                           ▼
┌──────────────────────────────────────────────────────────────────┐
│         44 Quality Rules  →  Health Score (L1 + L2)              │
│   Schema · GUIDs · Hierarchy · Names · Psets · ISO 19650         │
│   Question: Is this model well-formed and data-complete?         │
│   Output:   0–100 score + prioritised rule-level issue list      │
└──────────────────────────┬───────────────────────────────────────┘
                           │  if score ≥ stage threshold
                           ▼
┌──────────────────────────────────────────────────────────────────┐
│                IDS Validation (L3 — Level 3)                     │
│          Project-specific EIR/AIR information requirements       │
│   Question: Does this model satisfy our contractual spec?        │
│   Output:   Pass / Fail per IDS spec + element-level evidence    │
└──────────────────────────┬───────────────────────────────────────┘
                           │  on failures found
                           ▼
┌──────────────────────────────────────────────────────────────────┐
│                    BCF Issue Report                              │
│         Structured coordination issues linked to elements        │
│   Question: What specifically needs to change, and who owns it?  │
│   Output:   BCF 2.1 file shared across authoring tools           │
└──────────────────────────┬───────────────────────────────────────┘
                           │  when all layers pass
                           ▼
┌──────────────────────────────────────────────────────────────────┐
│                   Formal CDE Delivery                            │
│        Model + score evidence + IDS report on transmittal        │
└──────────────────────────────────────────────────────────────────┘`,
      },
      {
        type: 'feature-grid',
        items: [
          {
            icon: '📊',
            title: 'Layer 1–2: Health Score',
            body: "44 rules across schema integrity, GUID uniqueness, spatial hierarchy, property completeness, naming, ISO 19650, classification, geometry, and materials. This is the universal quality floor — it applies to every IFC file regardless of project type. A model below 80 fails the floor check and should not proceed to the next layer.",
          },
          {
            icon: '📋',
            title: 'Layer 3: IDS Validation',
            body: "Project-specific requirements encoded in machine-readable XML by the EIR author. Six facets: Entity (which element types), Attribute (which attributes), Property (which Pset values), Classification, Material, and PartOf. Where the Health Score is universal, IDS is bespoke — a different spec for each project and each discipline package.",
          },
          {
            icon: '💬',
            title: 'BCF Issue Tracking',
            body: "When Health Score rules or IDS checks fail, the issues become BCF topics — structured coordination items with element references, viewpoints, and responsible parties. BCF carries the quality issues from the validation stack into the coordination workflow where they can be assigned, tracked, and resolved.",
          },
          {
            icon: '🚀',
            title: 'CDE Delivery',
            body: "The endpoint of the stack. A model that passes the Health Score gate and the IDS gate has documentary evidence of quality. The score report and IDS validation result are the formal quality evidence attached to the transmittal — giving the Information Manager something to verify rather than something to guess at.",
          },
        ],
      },
      { type: 'h2', text: 'Setting Thresholds in Your BEP and EIR' },
      {
        type: 'p',
        text: "A Health Score threshold without a contractual home is a wish. The EIR (Employer Information Requirements) is the contractual document; the BEP (BIM Execution Plan) is the delivery plan that implements the EIR. The threshold belongs in both — with the EIR version being the enforceable one.",
      },
      {
        type: 'code',
        lang: 'text',
        text: `── EIR clause (contractual, enforceable) ─────────────────────────────────────

  5.4 Model Quality — IFC Health Score

  All IFC information deliveries shall achieve a minimum Health Score
  as specified below, validated prior to upload to the Common Data
  Environment. The Health Score shall be calculated using [agreed tool]
  with [agreed rule set version]. The validation report (including score,
  timestamp, and tool version) shall be attached to the transmittal as
  evidence of compliance.

  Models that do not meet the applicable threshold shall be returned to
  the Originator for remediation. Re-upload shall reset the revision
  counter and generate a new transmittal record.

  Minimum thresholds by LOD and delivery type:

    Internal model review (LOD 100–150):    ≥ 70
    Cross-discipline coordination (LOD 200): ≥ 75
    Detailed design CDE delivery (LOD 300):  ≥ 80
    Construction issue (LOD 350+):           ≥ 85
    As-built / FM handover (LOD 400+):       ≥ 90

── BEP clause (operational, implementation plan) ─────────────────────────────

  3.2 Validation Procedure

  Prior to each CDE upload, the Information Originator shall:
  1. Export IFC with stable GlobalId settings (see Section 4.1).
  2. Run the agreed validation tool against the exported file.
  3. Confirm the Health Score meets or exceeds the applicable threshold.
  4. Attach the score report (PDF or JSON) to the transmittal record.`,
      },
      {
        type: 'callout',
        variant: 'warning',
        text: "Put the threshold in the EIR, not only the BEP. The BEP is the team's own delivery plan — it is not a contract between client and supplier. The EIR is part of the appointment documents. A threshold specified only in the BEP is unenforceable if a supplier disputes a rejected delivery. A threshold in the EIR has the same standing as any other information requirement.",
      },
      { type: 'h2', text: 'Six Common Misconceptions About IFC Health Scores' },
      { type: 'h3', text: 'Misconception 1: "Higher is always better — target 100"' },
      {
        type: 'p',
        text: "The appropriate score depends entirely on the delivery stage. A concept design should target ≥ 70, not ≥ 95. Spending hours bringing an early-stage massing model to 95 is misallocated effort — the naming conventions you fixed will be replaced in three weeks when the scheme changes. Define stage-appropriate thresholds and target those. Reserve the energy for the score increases that happen after LOD 300, where changes are expensive.",
      },
      { type: 'h3', text: 'Misconception 2: "100 means zero problems with the model"' },
      {
        type: 'p',
        text: "A score of 100 means the model passed all 44 structural and data quality rules. It says nothing about whether the property values are factually correct, whether the model meets the project EIR, whether the design intent is accurately represented, or whether there are geometric clashes. A model with every Pset populated with placeholder text scores 100. The score confirms structural health; it does not certify content.",
      },
      { type: 'h3', text: 'Misconception 3: "A Health Score replaces IDS validation"' },
      {
        type: 'p',
        text: "They answer different questions. The Health Score asks: is this file well-formed and data-complete according to universal quality standards? IDS asks: does this model satisfy the specific information requirements of this project and this discipline package? A model can score 95 and fail IDS validation because it is missing the Uniclass 2015 classification required by the EIR, or because the IfcBuildingStorey names do not match the agreed storey naming convention in the project BEP. Both checks are always necessary — they are complementary, not overlapping.",
      },
      { type: 'h3', text: 'Misconception 4: "The score tells me what to fix"' },
      {
        type: 'p',
        text: "The score tells you whether to deliver. The rule-level breakdown beneath it tells you what to fix. A score of 68 without the issue breakdown is a failed fuel gauge without a map. Open the rule detail: sort by severity, read the element counts and descriptions, and fix the highest-severity failures first. The score will update immediately on the next validation run. The two pieces of information — score and breakdown — are always used together.",
      },
      { type: 'h3', text: 'Misconception 5: "A Health Score replaces the BIM Coordinator review"' },
      {
        type: 'p',
        text: "Automated validation catches structural failures, data completeness gaps, and format violations. It cannot review design compliance, spatial feasibility, programme alignment, or buildability. A model that scores 92 and contains a structurally impossible transfer structure will score 92. Professional review by a BIM Coordinator or Information Manager is never replaced by a score — it is supported by one. The score eliminates the checklist noise and focuses the reviewer on what matters.",
      },
      { type: 'h3', text: 'Misconception 6: "My model is fine — it opened in Revit without errors"' },
      {
        type: 'p',
        text: "Opening in a tool without errors is the minimum possible bar. IFC parsers are deliberately tolerant — they load what they can and silently discard or correct what they cannot. A file that opens cleanly in Revit, ArchiCAD, and Navisworks can simultaneously have 300 duplicate GUIDs (breaking BCF across every discipline), 80 orphan elements (missing from every clash report), no IfcProject.LongName (failing ISO 19650 traceability), and a Health Score of 41. 'It opened' is not a quality check.",
      },
      { type: 'h2', text: 'How IFC Viewer Online Implements the Health Score' },
      {
        type: 'p',
        text: "The IFC Viewer Online Health Score runs all 44 quality rules in the browser, in under 30 seconds, on any IFC file — nothing uploaded. Here is what the implementation covers:",
      },
      {
        type: 'feature-grid',
        items: [
          {
            icon: '🔬',
            title: '44 validation rules',
            body: "Full L1 schema integrity and L2 data quality coverage: GlobalId uniqueness and format, spatial hierarchy, orphan detection, naming completeness, ISO 19650 metadata, property set presence, classification, material assignments, and geometry integrity checks.",
          },
          {
            icon: '📊',
            title: 'Health Score with severity weighting',
            body: "Schema errors carry 3× the penalty of warnings. Logarithmic scaling prevents large models from scoring artificially low. The same model produces the same score on every run — it is reproducible and auditable.",
          },
          {
            icon: '🔍',
            title: 'Rule-level breakdown with element counts',
            body: "Every failing rule shows the issue count, severity, affected element types, and a remediation explanation. Sort by severity to prioritise work. The breakdown is the action list; the score is the decision signal.",
          },
          {
            icon: '🔧',
            title: 'Auto-fix for GUIDs',
            body: "Duplicate and out-of-range GlobalIds are auto-fixable in one click. A new spec-compliant 22-character GUID is generated using the correct IFC base-64 alphabet, with a leading character in the valid 0–3 range.",
          },
          {
            icon: '✏️',
            title: 'Non-destructive property editing',
            body: "Fix names, property values, and classification on received files without returning to the authoring tool. Full undo/redo. Changes are stored as an EditDiff[] keyed by GlobalId and applied on export — the original file is never mutated in place.",
          },
          {
            icon: '📋',
            title: 'IDS validation + BCF export',
            body: "After the Health Score gate, run project-specific IDS validation across all six facets (Entity, Attribute, Property, Classification, Material, PartOf). Export failures as BCF 2.1 for distribution to Revit, ArchiCAD, Solibri, and any BCF-capable coordination tool.",
          },
        ],
      },
      {
        type: 'ifc-demo',
        modelId: 'office-architecture',
        title: 'Run a Health Score on a real Revit export',
        description: "This 14 MB office model was exported from Revit — a typical mid-size architectural delivery. Open it to see the Health Score, the rule breakdown by category, and what a real pre-delivery validation report looks like for a commercial project.",
        schema: 'IFC4',
        size: '14 MB',
        variant: 'inline',
      },
      { type: 'h2', text: 'Troubleshooting: When Your Score Does Not Improve' },
      { type: 'h3', text: 'Fixed the issues in Revit but the score did not change' },
      {
        type: 'p',
        text: "The most common cause: the fix was applied to the Revit model but the IFC was not re-exported. Validation runs against the IFC file, not the authoring model. Always re-export after fixing the authoring model, and validate the new IFC export — not the same file you fixed last time.",
      },
      { type: 'h3', text: 'Score jumped from 81 to 47 between two exports' },
      {
        type: 'p',
        text: "A score drop of more than 20 points between revisions almost always indicates a change in the export configuration — specifically, the GUID generation setting changed from 'Keep Existing' to 'Generate New'. This produces thousands of new GlobalIds that the validator sees as out-of-range or duplicated with an earlier linked file. Check the IFC exporter settings and revert to stable GUID output.",
      },
      { type: 'h3', text: 'Score is 76 but Information Manager requires 80' },
      {
        type: 'p',
        text: "Open the rule breakdown and sort by penalty contribution, not by issue count. The four points separating you from 80 are almost certainly concentrated in 1–2 rules. Fix the highest-penalty rule failures first — often spatial containment errors or missing property sets on a specific element type. Address those two rules, re-export, and revalidate. The score typically moves more than expected because the penalty structure is non-linear.",
      },
      { type: 'h3', text: 'Score is 95 but IDS validation is failing' },
      {
        type: 'p',
        text: "This is expected and correct. The Health Score and IDS address different layers. A score of 95 means the model is structurally excellent. IDS failure means it does not meet a specific project requirement — a Pset value, a classification code, a material layer thickness. Check the IDS failure report: it will identify the exact elements, the expected values, and the actual values. Fix in the authoring tool or use non-destructive property editing for received files.",
      },
      { type: 'h2', text: 'Frequently Asked Questions' },
      { type: 'h3', text: 'What is an IFC Health Score?' },
      {
        type: 'p',
        text: "A 0–100 weighted quality signal summarising a model's structural integrity and data completeness against 44 validation rules. It is not a percentage — it is a severity-weighted, logarithmically-scaled score where schema errors count more than data warnings, and the first failure of a rule penalises more than the thousandth.",
      },
      { type: 'h3', text: 'How is it calculated?' },
      {
        type: 'p',
        text: "The score starts at 100. Each rule failure subtracts points based on the failure's severity weight and the logarithm of the issue count. Schema errors (structural failures) carry 3× the penalty of quality warnings. Logarithmic scaling prevents large models from looking artificially worse than small models for the same underlying problem density.",
      },
      { type: 'h3', text: 'What Health Score should I specify in the BEP?' },
      {
        type: 'p',
        text: "≥ 80 for standard CDE delivery and cross-discipline coordination. ≥ 90 for ISO 19650 formal milestone submissions and LOD 300+ deliveries. ≥ 70 for concept-stage internal reviews. Specify it in the EIR (contractual) as well as the BEP. Only the EIR creates a legally enforceable quality gate.",
      },
      { type: 'h3', text: 'Can a model score 100 and still have quality problems?' },
      {
        type: 'p',
        text: "Yes. The score covers 44 structural and data quality rules. It does not cover IDS compliance (project-specific requirements), semantic correctness (whether property values are factually accurate), or design intent. A model with placeholder values in every property set scores 100. The score confirms structural health; it does not certify content.",
      },
      { type: 'h3', text: 'Does a high Health Score mean I can skip IDS validation?' },
      {
        type: 'p',
        text: "No. They answer different questions. Health Score: is this model well-formed and data-complete? IDS: does this model meet the specific information requirements of this project? A score of 95 and a failing IDS check is a common and expected outcome — fix the IDS failures, then revalidate both.",
      },
      { type: 'h3', text: 'Should every model aim for 100?' },
      {
        type: 'p',
        text: "No. Set stage-appropriate thresholds. Pursuing 100 at concept design wastes effort that belongs in design development. The goal is 'does the model meet the threshold for this delivery stage?' Define those thresholds in the BEP and EIR at project start — then validate against them, not against the theoretical maximum.",
      },
      { type: 'h2', text: 'Summary' },
      {
        type: 'pull-quote',
        text: "A model that opened without errors in Revit is not a quality-checked model. It is an unchecked model that happened to parse. The Health Score is the difference between those two things — and it takes 30 seconds to find out which you have.",
        cite: 'IFC Viewer Blog',
      },
      {
        type: 'feature-grid',
        items: [
          {
            icon: '📐',
            title: 'Understand the number',
            body: "The Health Score is a severity-weighted, logarithmically-scaled decision signal. 80+ means CDE-ready. Below 60 means structural problems. Not a percentage — a quality verdict.",
          },
          {
            icon: '📝',
            title: 'Set it contractually',
            body: "Stage-appropriate thresholds belong in the EIR (contractual) and the BEP (operational). Without an EIR clause, the threshold is unenforceable. Add it at project start, before the first delivery.",
          },
          {
            icon: '🔁',
            title: 'Embed it in the rhythm',
            body: "Weekly validation during design development. Pre-session check before coordination. Gate check before CDE upload. Attach the score report to every transmittal. Make the score a project routine, not a delivery-day panic.",
          },
          {
            icon: '🔗',
            title: 'Use the full stack',
            body: "Health Score → IDS → BCF → Delivery. Each layer answers a different question. The score is the floor; IDS is the ceiling. Use both, and export failures to BCF so they can be tracked and resolved in the coordination workflow.",
          },
        ],
      },
      {
        type: 'p',
        text: [
          "For the technical explanation of how the 44 rules are organised into three validation levels, see ",
          { text: 'the complete IFC model checker guide', to: 'ifc-model-checker-guide' },
          ". For the browser vs cloud architecture question — when local processing is the right choice for sensitive project data — see ",
          { text: 'browser-based vs cloud IFC validation', to: 'browser-vs-cloud-ifc-validation' },
          ". If you have a received IFC file with property values, GUIDs, or naming that needs to be corrected before validation, ",
          { text: 'the free online IFC editor guide', to: 'ifc-editor-online' },
          " covers non-destructive editing without a round-trip through the authoring tool. And for the most common structural failures that push scores below 70, see ",
          { text: 'the 7 most common IFC validation errors', to: 'common-ifc-validation-errors' },
          ".",
        ],
      },
    ],
  },

  // ── Article #3 — "offline bim validation" / "browser vs cloud ifc validation"

  {
    slug: 'browser-vs-cloud-ifc-validation',
    title: 'Browser-Based IFC Validation vs Cloud: The Architecture Decision BIM Teams Get Wrong',
    excerpt: "Offline IFC validation via WebAssembly — nothing uploaded, works on site. Browser vs cloud IFC validator: privacy, GDPR, upload speed, offline use, and when each architecture wins.",
    date: '2026-06-28',
    readTimeMin: 19,
    category: 'Validation',
    categorySlug: 'validation',
    author: 'IFC Viewer Team',
    featured: false,
    keywords: ['offline bim validation', 'browser ifc validator', 'cloud ifc validator', 'ifc validation without upload', 'ifc privacy gdpr', 'WebAssembly IFC', 'validate ifc offline', 'online ifc validation'],
    faqs: [
      {
        q: 'Is browser-based IFC validation truly private?',
        a: "Yes, when implemented correctly. WebAssembly runs in a sandboxed browser context and the IFC file is created in local browser memory. A correctly implemented browser validator makes no network calls for the IFC file. Verify by opening the browser's network inspector (F12 → Network tab) and confirming no upload occurs when you validate a model.",
      },
      {
        q: 'Can browser IFC validation run offline?',
        a: "Yes, with one caveat. The application must be loaded at least once while online — the WASM binary and JavaScript bundles download on first visit. After that, models cached in OPFS load without any network access. For site visits where connectivity is unreliable, pre-loading the application and model the evening before ensures full offline availability.",
      },
      {
        q: 'What is the practical file size limit for browser-based IFC validation?',
        a: "On hardware with 16 GB RAM, files up to 400–500 MB parse reliably. On 8 GB machines, the practical limit is around 200–250 MB. OPFS caching eliminates the repeat-parse cost — the first parse is the only time you pay the full processing overhead. For files consistently above 500 MB, cloud validation may offer better headroom.",
      },
      {
        q: 'Does WebAssembly introduce security risks in the browser?',
        a: "WASM runs in the same sandboxed environment as JavaScript — it cannot access the filesystem, OS, or network without going through browser APIs subject to the same security policies as any web content. The relevant question is what network calls the application makes. A correctly implemented browser validator makes no network calls for the IFC file.",
      },
      {
        q: 'Can I use both browser and cloud IFC validation in the same project workflow?',
        a: "Yes — this is the most practical arrangement. Coordinators run browser validation locally as a fast, private pre-check. The CDE gateway uses cloud validation with an API for the audit trail and automated acceptance. Browser validation is fast and private; cloud validation provides the official record and organisation-wide reporting. They address different needs and complement each other.",
      },
    ],
    content: [
      {
        type: 'callout',
        variant: 'info',
        text: "TL;DR — Browser validation and cloud validation are fundamentally different architectures. Browser validation processes IFC files locally using WebAssembly — the file never leaves the device. Cloud validation uploads the file to a remote server. Which is right depends on your project type, data handling requirements, and workflow. Neither is universally superior. For sensitive projects, browser validation is often the only compliant option.",
      },
      {
        type: 'stat-row',
        stats: [
          { value: 0,   suffix: ' bytes',  label: 'uploaded in browser validation' },
          { value: 40,  suffix: ' sec',    label: 'to upload 50 MB at 10 Mbps' },
          { value: 44,  suffix: '',        label: 'rules checked client-side' },
          { value: 10,  suffix: '×',       label: 'faster repeat loads via OPFS cache' },
        ],
      },
      {
        type: 'p',
        text: "When a BIM coordinator asks 'where can I validate my IFC file?', the answer they usually get is a URL. A cloud service. Upload the model, wait, get the report. This is the default mental model for IFC validation — and it is the wrong choice for a significant proportion of the projects where it gets applied.",
      },
      {
        type: 'p',
        text: "There are two fundamentally different architectures for IFC validation. Understanding the difference — and knowing which is right for which project — is increasingly a professional competency for BIM managers and digital construction teams. The architecture you choose determines privacy, speed, regulatory compliance, and offline availability in a single decision.",
      },
      { type: 'h2', text: 'Two Completely Different Architectures' },
      {
        type: 'p',
        text: "The distinction is not a product detail. It is a question of where computation happens — and that determines everything that follows.",
      },
      {
        type: 'code',
        lang: 'text',
        text: `ARCHITECTURE A — Cloud Validation
══════════════════════════════════

  Your Machine              Internet              Cloud Server
  ────────────              ────────              ────────────
  ① Open IFC file
       │
       │ ② UPLOAD ──────────────────────────────► Server receives file
       │   50 MB   → ~40 s at 10 Mbps                   │
       │   250 MB  → ~3 min at 10 Mbps            ③ Server parses IFC
       │   1 GB    → ~13 min at 10 Mbps                  │
       │                                           ④ Validation runs
       │                                                  │
       │ ⑤ RESULTS ◄───────────────────────────────────────┘
       │
  ⑥ View report

  Data custody: Your machine → Transit (TLS) → Third-party server`,
      },
      {
        type: 'code',
        lang: 'text',
        text: `ARCHITECTURE B — Browser-Based Validation
══════════════════════════════════════════

  Your Machine                        Internet
  ────────────                        ────────
  ① Open IFC file
       │
  ② WASM binary loads                  (Nothing uploaded.
       │                                Nothing leaves the device.
  ③ Web Worker: IFC parsing             Ever.)
       │
  ④ 44 validation rules run
       │
  ⑤ Health Score calculated
       │
  ⑥ WebGL renders 3D model
       │
  ⑦ Results: instant, local

  OPFS cache: parsed geometry persists → repeat load ~10× faster
  Data custody: Your machine only`,
      },
      {
        type: 'p',
        text: "In Architecture A, the IFC file is processed by infrastructure you do not control. It crosses a network, sits on a third-party server, and is handled by software you did not deploy. In Architecture B, the same validation logic runs inside your browser using WebAssembly compiled from the same C++ code that powers native desktop BIM tools — nothing leaves the device, and there is no third party involved in processing.",
      },
      { type: 'h2', text: 'Why IFC Models Contain Sensitive Information' },
      {
        type: 'p',
        text: "The instinct to treat IFC files like PDFs — shareable, uploadable, archivable anywhere — underestimates what is embedded in a complex building model. An IFC file is a structured database of asset information. For many project types, that information is genuinely sensitive, restricted, or classified.",
      },
      {
        type: 'feature-grid',
        items: [
          {
            icon: '🏛️',
            title: 'Government and civic infrastructure',
            body: "Courts, government offices, data centres, critical utilities. Structural vulnerability data, emergency system layouts, and security infrastructure schematics embedded as IFC geometry and properties.",
          },
          {
            icon: '✈️',
            title: 'Airports and transport hubs',
            body: "Security checkpoint geometry, airside boundary layouts, CCTV and sensor placement, emergency system routing. Subject to aviation security and national security classification in most jurisdictions.",
          },
          {
            icon: '🏥',
            title: 'Hospitals and healthcare',
            body: "Patient flow infrastructure, medical gas supply redundancy, critical care unit layouts. Subject to NHS IG requirements (UK) and HIPAA (US). Life-safety system structural data.",
          },
          {
            icon: '🚂',
            title: 'Rail and critical transit',
            body: "Tunnel geometry, signalling infrastructure, emergency egress, power supply topology. Frequently classified as critical national infrastructure with explicit prohibitions on third-party upload.",
          },
          {
            icon: '🏭',
            title: 'Industrial and process plants',
            body: "Process equipment layout, hazardous material containment geometry, safety system placement. Subject to COMAH / SEVESO III regulations in the EU. Commercially sensitive process data.",
          },
          {
            icon: '🔒',
            title: 'Defence and military',
            body: "Explicitly restricted in most countries by defence procurement regulations. IFC files for military infrastructure cannot legally be uploaded to commercial cloud services without specific security clearance and contractual approval.",
          },
        ],
      },
      {
        type: 'p',
        text: "Beyond project type, IFC files embed metadata that qualifies as sensitive under multiple legal frameworks. The STEP file header FILE_NAME field contains author and organisation names. IfcProject properties carry client and project identifiers. Space planning models may include occupant counts and staff distribution. Property sets can reveal system capacities, structural specifications, and operational characteristics of a facility — the kind of information that makes industrial espionage viable.",
      },
      { type: 'h3', text: 'The GDPR and Data Handling Angle' },
      {
        type: 'p',
        text: "GDPR Article 4 defines personal data broadly — it includes any information relating to an identified or identifiable natural person. In BIM, this captures: occupant names in space assignments, owner contact details in IfcProject metadata, personnel counts in fire evacuation calculations, and sometimes asset reference codes if they link back to identifiable individuals through other datasets.",
      },
      {
        type: 'callout',
        variant: 'warning',
        text: "Uploading an IFC file that contains personal data to a commercial cloud service without a signed Data Processing Agreement (DPA) and a valid legal basis under GDPR Article 6 is a compliance violation — regardless of whether the service encrypts data in transit. Under GDPR Article 28, every processor of personal data on behalf of a controller requires a formal DPA. 'The service uses HTTPS' does not constitute a DPA.",
      },
      {
        type: 'p',
        text: "In practice, most large AEC firms and public sector bodies have data handling policies that technically prohibit uploading project models to unapproved third-party services. These policies are frequently ignored at coordinator level because the policy sits in a document management system and the validator URL was shared in a community forum. Browser-based validation makes compliance the path of least resistance — it removes the upload decision entirely.",
      },
      { type: 'h2', text: 'How WebAssembly Changed Browser-Based BIM Tools' },
      {
        type: 'p',
        text: "Understanding why browser validation is now technically credible requires understanding what changed. Before 2017, running a genuine IFC parser in a browser was not seriously considered by any BIM software vendor. The browser could only execute JavaScript, and JavaScript is the wrong language for parsing the ISO 10303-21 STEP format at production speed.",
      },
      { type: 'h3', text: 'Before WebAssembly — The Pre-2017 Situation' },
      {
        type: 'ul',
        items: [
          "IFC parsing required server-side processing — cloud validators existed not as a convenience but as the only viable architecture. There was no performance-competitive alternative.",
          "Browser-based IFC viewers used pre-processed intermediate formats (JSON geometry extracts, simplified meshes) rather than real-time IFC parsing. What you saw was not the IFC — it was a server-generated approximation.",
          "A 50 MB IFC file parsed in pure JavaScript took minutes and would trigger tab crashes on memory-constrained machines. A 200 MB file was effectively impossible in a browser context.",
          "3D rendering was early-stage WebGL — GPU-accelerated but limited to scene complexities manageable in JavaScript. Large structural models with hundreds of thousands of elements were impractical.",
          "Web Workers provided thread isolation but no way to run compiled native code. Performance was bounded by JavaScript's garbage collection pauses and single-threaded execution model.",
        ],
      },
      { type: 'h3', text: 'After WebAssembly — What Is Now Possible' },
      {
        type: 'p',
        text: "WebAssembly (WASM) is a binary instruction format for a stack-based virtual machine that runs in the browser at near-native speed. Code written in C, C++, or Rust is compiled to WASM and executes at roughly 60–90% of native speed inside any modern browser — no plugins, no installation, full memory isolation, guaranteed sandbox. WASM became a W3C standard in 2019 and is available in all major browsers.",
      },
      {
        type: 'p',
        text: "For IFC specifically: web-ifc — the parser used by the @thatopen/components library — is compiled from C++ to WebAssembly. It parses IFC STEP format at the same speed class as native desktop libraries. A 50 MB IFC file parses in under 10 seconds on a modern laptop, inside a browser tab, with no server involved. The same performance class as Solibri or Navisworks loading a local file — but in a browser.",
      },
      {
        type: 'feature-grid',
        items: [
          {
            icon: '⚙️',
            title: 'WASM: C++ speed in the browser',
            body: "web-ifc is compiled from C++ to WebAssembly. IFC STEP parsing runs at 60–90% of native speed — the same performance class as desktop BIM tools. A 50 MB model parses in under 10 seconds on a modern laptop.",
          },
          {
            icon: '🧵',
            title: 'Web Workers: true parallelism',
            body: "WASM parsing runs in a dedicated Web Worker — a separate OS thread. The browser UI stays responsive during heavy model loading. Validation runs in a parallel worker, providing results while geometry loads.",
          },
          {
            icon: '💾',
            title: 'OPFS: persistent local cache',
            body: "The Origin Private File System is a browser-native storage API, sandboxed per origin, inaccessible to servers. Parsed geometry is written to OPFS after first load. Repeat loads are ~10× faster — no re-parsing, no re-upload.",
          },
          {
            icon: '🎮',
            title: 'WebGL / WebGPU: GPU rendering',
            body: "Three.js abstracts WebGL for high-performance 3D rendering. Fragment-based scene management handles models with hundreds of thousands of elements at interactive frame rates. WebGPU support coming for next-generation rendering.",
          },
        ],
      },
      { type: 'h3', text: 'The OPFS Cache: Why Repeat Loads Change the Workflow' },
      {
        type: 'p',
        text: "The Origin Private File System is a browser-native storage layer sandboxed to the current web origin. Other origins, other browser tabs, and — critically — remote servers cannot access its contents. It persists between browser sessions. For IFC workflows, OPFS solves the most painful friction in heavy model tooling: the repeat-parse cost.",
      },
      {
        type: 'p',
        text: "A 250 MB IFC file parsed from scratch takes 20–40 seconds on a modern machine. The same file loaded from OPFS cache loads in 2–3 seconds. For a BIM coordinator who opens the same project model several times a day, OPFS is the difference between a tool that feels fast and one that feels like waiting. And because OPFS storage is sandboxed per origin and lives on the local filesystem, the cached model data never reaches a server — it inherits the same privacy guarantee as the browser validation itself.",
      },
      {
        type: 'callout',
        variant: 'info',
        text: "OPFS is not localStorage or IndexedDB. It provides a real filesystem-like API with synchronous access from Worker threads, large file support, and higher storage quotas than web storage APIs. On a machine with 100 GB of free disk space, OPFS can cache hundreds of gigabytes of parsed IFC geometry. Quota management is exposed to the user via the browser's storage settings.",
      },
      { type: 'h2', text: 'The Upload Bottleneck — Real Numbers' },
      {
        type: 'p',
        text: "The single most underestimated cost of cloud IFC validation is upload time. It is invisible in product comparisons but dominant in the actual workflow. Here is what uploading common IFC file sizes looks like across realistic connection types — and how browser local processing compares:",
      },
      {
        type: 'table',
        headers: ['IFC file size', 'Office (10 Mbps upload)', '4G Mobile (3 Mbps)', 'On-Site (1 Mbps)'],
        caption: 'Upload time only — add server processing on top: 50 MB +5–15 s · 250 MB +30–90 s · 1 GB +2–6 min · 2 GB +5–15 min. Browser validation: 0 s upload in all cases.',
        rows: [
          ['50 MB',  '~40 seconds',   '~2 min 15 s',  '~7 minutes'],
          ['250 MB', '~3 min 20 s',   '~11 minutes',  '~33 minutes'],
          ['1 GB',   '~13 minutes',   '~45 minutes',  '~2 h 15 min'],
          ['2 GB',   '~27 minutes',   '~1 h 30 min',  '~4 h 30 min'],
        ],
      },
      {
        type: 'callout',
        variant: 'info',
        text: "Browser local processing (WebAssembly, modern workstation, first parse): 50 MB ~5–10 s · 250 MB ~20–40 s · 1 GB ~90–180 s · 2 GB ~3–6 min. OPFS repeat load (no re-parsing): ~2–5 seconds at any file size.",
      },
      {
        type: 'p',
        text: "A 250 MB IFC file — a typical coordination model for a medium commercial project — takes over 3 minutes to upload on a fast office connection. On 4G, it takes 11 minutes. For a BIM coordinator running pre-delivery checks several times a day, upload time alone adds hours of dead wait per week. The validation itself takes a fraction of the upload time.",
      },
      {
        type: 'p',
        text: "On construction sites, where 4G connectivity is the norm and bandwidth is shared between site offices and BIM tablets, uploading a 1 GB IFC file is a 45-minute commitment before a single validation rule runs. Browser-based validation processes the same file locally in 90–180 seconds with no network dependency — and in 2–5 seconds on subsequent sessions thanks to OPFS caching.",
      },
      {
        type: 'callout',
        variant: 'tip',
        text: "Upload speed is asymmetric. Most broadband connections in Europe have upload speeds significantly lower than download. A 100 Mbps download connection often has only 10–20 Mbps upload. Always check the upload rate — not the headline broadband speed — when estimating cloud validation wait times.",
      },
      { type: 'h2', text: 'The Full Comparison: Browser vs Cloud IFC Validation' },
      {
        type: 'table',
        headers: ['Dimension', 'Browser validation', 'Cloud validation'],
        rows: [
          ['Privacy',               '✅ File never leaves device',     '⚠️ File uploaded to server'],
          ['Data sovereignty',      '✅ No third-party custody',        '⚠️ Third-party data custody'],
          ['GDPR compliance',       '✅ Compliant by design',           '⚠️ Requires DPA + legal basis'],
          ['Sensitive projects',    '✅ Only option in many cases',     '❌ Often prohibited'],
          ['Speed (small <50 MB)',  '✅ Near-instant',                  '⚠️ Upload + processing delay'],
          ['Speed (large >250 MB)', '✅ No upload penalty',             '❌ Upload bottleneck'],
          ['Repeat loads',          '✅ OPFS cache (~10× faster)',      '❌ Full re-upload each time'],
          ['Upload time',           '✅ Zero',                          '❌ Proportional to file size'],
          ['Offline availability',  '✅ Full offline support',          '❌ Requires internet'],
          ['On-site field use',     '✅ Works on 4G or offline',        '❌ Slow / unreliable on site'],
          ['Internet dependency',   '✅ None (after initial load)',     '❌ Required every run'],
          ['Batch processing',      '❌ Manual, one at a time',         '✅ API / batch automation'],
          ['CI/CD integration',     '❌ Not suited',                    '✅ Native webhook/API'],
          ['Team audit trail',      '⚠️ Local only',                   '✅ Centralised history'],
          ['Org-wide reporting',    '⚠️ Not aggregated',               '✅ Dashboard across projects'],
          ['Security (data)',       '✅ No transit / server risk',      '⚠️ Transit + server exposure'],
          ['Security (breach)',     '✅ No server to compromise',       '⚠️ Depends on cloud provider'],
          ['Very large files >2 GB','⚠️ Limited by device RAM',        '✅ Server has more RAM'],
          ['Cost',                  '✅ Free to low-cost',              '⚠️ Per-use or subscription'],
          ['Infrastructure burden', '✅ Zero — runs in browser',        '✅ Managed by provider'],
          ['Setup complexity',      '✅ Open URL, drag file',           '⚠️ Account / API key required'],
        ],
      },
      { type: 'h2', text: 'Where Cloud Validation Is Genuinely Better' },
      {
        type: 'p',
        text: "A comparison that only highlights one side is advocacy. Cloud IFC validation has real advantages in specific contexts — and applying browser validation to those contexts is the wrong call.",
      },
      {
        type: 'feature-grid',
        items: [
          {
            icon: '🔄',
            title: 'Automated CI/CD pipelines',
            body: "Validation triggered automatically on every model commit — analogous to software unit tests. Cloud APIs with webhook responses are the only architecture for headless automation. There is no browser session to run WASM in a server-side pipeline.",
          },
          {
            icon: '📦',
            title: 'Batch processing at portfolio scale',
            body: "Auditing hundreds of existing IFC files across a project portfolio — a legacy data migration, a CDE archive audit — is practical via cloud batch APIs and impractical to run manually in a browser one file at a time.",
          },
          {
            icon: '📊',
            title: 'Centralised team reporting',
            body: "A BIM manager needs a single view of validation history across multiple projects and originators — score trends, issue frequency, compliance over time. Cloud services aggregate this. Browser tools produce local results only.",
          },
          {
            icon: '💻',
            title: 'CDE gateway integration',
            body: "Some CDEs validate incoming IFC uploads automatically before accepting them. This is inherently a server-side operation — the CDE server processes the file, not a user's browser. Cloud validation APIs are the integration point.",
          },
        ],
      },
      {
        type: 'comparison',
        left: {
          label: 'Browser Validation — Best Fit',
          color: 'accent',
          items: [
            'Government and public sector projects',
            'Defence, infrastructure, and airport BIM',
            'Hospital and healthcare facility models',
            'Industrial plant and process engineering',
            'Models with GDPR or data restriction policies',
            'On-site and offline validation',
            'Pre-check before formal cloud submission',
            'Individual coordinators and small teams',
          ],
        },
        right: {
          label: 'Cloud Validation — Best Fit',
          color: 'muted',
          items: [
            'Automated CI/CD validation pipelines',
            'Portfolio-wide batch quality audits',
            'Centralised BIM quality dashboards',
            'CDE gateway and automated delivery gates',
            'Non-sensitive commercial projects at scale',
            'Enterprise multi-team workflow automation',
            'API-driven integration with other systems',
            'Very large files beyond local device RAM',
          ],
        },
      },
      { type: 'h2', text: 'Five Misconceptions About Browser-Based IFC Validation' },
      { type: 'h3', text: 'Misconception 1: "Browser apps are slower than cloud"' },
      {
        type: 'p',
        text: "This was true in 2015. It is not true now. WebAssembly code runs at 60–90% of native C++ speed inside a modern browser. The IFC parsing engine (web-ifc) is compiled from C++ — the same performance category as the libraries that power Solibri, Autodesk's IFC importers, and IfcOpenShell. Combined with zero upload latency, browser validation is frequently faster than cloud for typical model sizes, particularly on connections slower than 50 Mbps upload.",
      },
      {
        type: 'p',
        text: "The misconception persists because people compare browser JavaScript (slow and garbage-collected) to native compiled applications (fast). Modern browser BIM tools do not run in JavaScript for the heavy processing — they run compiled WASM at near-native speed, with JavaScript only orchestrating the workflow. The JS versus WASM distinction is as significant as the difference between Python and C++.",
      },
      { type: 'h3', text: 'Misconception 2: "You must upload an IFC file to validate it"' },
      {
        type: 'p',
        text: "This is false. When you open an IFC file in a browser-based validator, the browser creates a File object in local memory — accessible to WASM and JavaScript running in that browser context, but not transmitted to any network endpoint unless code explicitly calls a fetch or XHR API. You can verify this yourself: open the browser's network inspector (F12 → Network tab) and confirm that no upload occurs when a model is opened and validated.",
      },
      { type: 'h3', text: 'Misconception 3: "Large IFC files cannot run in a browser"' },
      {
        type: 'p',
        text: "Modern browsers can allocate several gigabytes of RAM on typical workstation hardware. A 250 MB IFC file in memory occupies 250 MB — well within what a browser process can allocate on a machine with 16 GB. Web Workers extend this with off-main-thread memory access. For files above 500 MB, chunked spatial loading makes browser processing viable even under tighter memory constraints. OPFS ensures that a large model parsed once never needs to be re-parsed in subsequent sessions.",
      },
      { type: 'h3', text: 'Misconception 4: "Cloud is always more secure"' },
      {
        type: 'p',
        text: "Security is multi-dimensional, not a single attribute. Cloud services typically encrypt data in transit (TLS 1.3) and at rest (AES-256), which addresses passive interception. But they introduce attack surfaces that browser processing eliminates entirely: server-side compromise, misconfigured storage buckets, insider access by cloud provider employees, supply chain attacks on the cloud provider's infrastructure, and data residency violations if the server is located outside contractually required jurisdictions.",
      },
      {
        type: 'p',
        text: "A file that never leaves the device has zero exposure to any network-based threat. The security question is not 'which architecture is more secure in absolute terms?' but 'which threat models are most relevant for this project?' For a Ministry of Defence facility model, browser processing eliminates the upload threat vector completely. For a non-sensitive commercial project where centralised logging matters, cloud controls may be the right trade-off.",
      },
      { type: 'h3', text: 'Misconception 5: "Browser validation is not enterprise-grade"' },
      {
        type: 'p',
        text: "Enterprise-grade software is defined by reliability, feature depth, and institutional supportability — not by deployment architecture. Figma, AutoCAD Web, Google Earth, and Microsoft Office for the Web are enterprise-grade applications running in the browser using WebAssembly and modern web APIs. The same WASM runtime, Web Workers, and WebGL infrastructure that power these applications also powers browser-based IFC validation. 'Browser-based' is an architectural decision about where computation happens — it is not a quality ceiling.",
      },
      { type: 'h2', text: 'Troubleshooting Browser Validation Issues' },
      { type: 'h3', text: 'Model loads but validation seems slow' },
      {
        type: 'p',
        text: "Validation runs in a separate Web Worker and does not block the UI — the 3D model should be interactive while validation runs in the background. If the overall loading process feels slow, check whether the model is loading from OPFS cache (fast) or being parsed from scratch (slower for large files). On first load, a 200 MB file will take 20–40 seconds to parse even locally. Subsequent loads from cache take 2–5 seconds.",
      },
      { type: 'h3', text: 'Out of memory on very large files' },
      {
        type: 'p',
        text: "Files above 400–500 MB can exhaust browser memory on machines with 8–16 GB RAM. Symptoms: the browser tab crashes or becomes unresponsive. Solutions: close other browser tabs to free memory, use a machine with 16+ GB RAM, or split a federated model into discipline-specific files before loading. For files consistently above 500 MB, cloud validation may be the more appropriate architecture — server hardware typically has more RAM headroom.",
      },
      { type: 'h3', text: 'OPFS cache grows large over time' },
      {
        type: 'p',
        text: "OPFS stores parsed geometry fragments for each model loaded. For a project team loading many models over weeks, cache can grow to several gigabytes. The validator's Cache Manager shows all cached files with sizes and allows selective deletion. Browser storage settings also allow clearing all origin storage. The cache is stored on the local device and is not accessible to any remote server.",
      },
      { type: 'h3', text: 'Validation results differ between browser and cloud' },
      {
        type: 'p',
        text: "If results differ, the most common cause is that different rule sets are being applied. Browser validation (44 quality rules) and cloud schema validation (ISO 10303-21 compliance) are checking different things — not the same rules in different places. See the validation layer guide for the distinction between Level 1 schema checking, Level 2 quality checking, and Level 3 IDS. An IDS result should be identical between any two specification-conformant engines running the same .ids file against the same model.",
      },
      { type: 'h2', text: 'Where IFC Viewer Online Fits This Architecture' },
      {
        type: 'p',
        text: "IFC Viewer Online is a browser-based implementation of Architecture B. The IFC parser (web-ifc compiled to WASM), the 44-rule validation engine, the Health Score calculation, the IDS 1.0 checking engine, the BCF panel, and the 3D renderer (Three.js via WebGL) all run in the browser. Nothing is uploaded. The architecture enforces this at the implementation level — there is no server-side endpoint to send model data to.",
      },
      {
        type: 'feature-grid',
        items: [
          {
            icon: '⚡',
            title: 'WASM parsing in a Web Worker',
            body: "web-ifc (C++ → WASM) runs in a dedicated worker thread. The UI stays responsive during large model loads. A 50 MB file parses in under 10 seconds. A 200 MB file in 20–40 seconds. First result: local. Always.",
          },
          {
            icon: '💾',
            title: 'OPFS caching for repeat loads',
            body: "Parsed geometry fragments persist in OPFS after the first session. Repeat loads are ~10× faster — no re-parsing, no network dependency. The cache is private to the browser origin and inaccessible to remote servers.",
          },
          {
            icon: '📋',
            title: '44 quality rules + IDS 1.0',
            body: "44 model quality rules (structural integrity, ISO 19650, Psets, classification, LOD, MEP) plus a buildingSMART IDS 1.0 engine tested against all 100 official bSI testcases — all client-side.",
          },
          {
            icon: '🔧',
            title: 'Non-destructive property editing',
            body: "Element names, property set values, and GlobalIds can be edited on received IFC files without a round-trip through the authoring tool — and without uploading to any server.",
          },
        ],
      },
      { type: 'h2', text: 'Expert Recommendations: Choosing the Right Architecture' },
      {
        type: 'p',
        text: "The choice between browser and cloud validation is a project-level governance decision, not a tool preference. Here is the decision logic for the most common scenarios:",
      },
      {
        type: 'ul',
        items: [
          "Government, defence, airport, rail, hospital, and industrial plant projects: browser-based validation should be the default assumption. Verify whether your organisation's data handling policy permits model upload before considering cloud. If the policy does not address it, assume upload is prohibited and seek clarification from your data protection officer.",
          "Commercial projects with no data classification: either architecture is viable. Use cloud for centralised audit trails and CI/CD integration. Use browser for speed, privacy preference, and offline capability.",
          "Daily pre-delivery quality checks by individual coordinators: browser validation is faster, simpler, requires no account, and eliminates the upload wait. Run it locally before any formal CDE submission.",
          "Portfolio audits or CDE compliance assessments across many models: cloud batch processing is the right tool. Running 200 models through a cloud API and getting a consolidated quality report is impractical in a browser.",
          "Automated delivery gate within a CDE: cloud validation with API integration is the only practical architecture. There is no browser context available in an automated server-side workflow.",
          "Hybrid workflow: use browser-based validation as the daily quality gate (fast, private, no account required), and reserve cloud for the formal CDE submission where an audit trail, API integration, or batch automation adds genuine value. These architectures are complementary.",
        ],
      },
      {
        type: 'callout',
        variant: 'tip',
        text: "Document your architecture decision in the BIM Execution Plan. 'Validation tool: [name], architecture: browser-based / cloud, reason: [data handling policy / automation requirement]'. When a new team member joins or a project is audited, the decision trail explains why a specific tool was used — not just which tool.",
      },
      { type: 'h2', text: 'Frequently Asked Questions' },
      { type: 'h3', text: 'Is browser-based IFC validation truly private?' },
      {
        type: 'p',
        text: "Yes, when implemented correctly. WebAssembly runs in a sandboxed browser context. The File object containing IFC data is created in local browser memory. For that data to reach a server, code must explicitly call a network API. A correctly implemented browser validator makes no such calls for the IFC file. Verify this by opening the browser's network inspector (F12 → Network tab) and confirming no upload occurs when you open and validate a model.",
      },
      { type: 'h3', text: 'Can browser validation run offline?' },
      {
        type: 'p',
        text: "Yes, with one caveat. The application itself must be loaded at least once while online — the WASM binary and JavaScript bundles download on first visit. After that, a progressive web application can run fully offline. Models cached in OPFS load without any network access. For site visits where connectivity is unreliable, loading the application and pre-caching the project model the evening before ensures offline availability the following day.",
      },
      { type: 'h3', text: 'What is the practical file size limit for browser validation?' },
      {
        type: 'p',
        text: "On hardware with 16 GB RAM (a typical modern workstation or high-end laptop), files up to 400–500 MB parse reliably. On 8 GB machines, the practical limit is around 200–250 MB before memory pressure causes instability. OPFS caching eliminates the repeat-parse cost — so the first parse is the only time you pay the full processing overhead. For files consistently above 500 MB, cloud validation may offer better headroom.",
      },
      { type: 'h3', text: 'Does WebAssembly introduce security risks?' },
      {
        type: 'p',
        text: "WASM runs in the same sandboxed environment as JavaScript — it cannot access the filesystem, operating system, or network without going through browser APIs subject to the same security policies as any web content. The relevant security question is not the WASM runtime itself but what network calls the application makes — and a correctly implemented browser validator makes none for the IFC file.",
      },
      { type: 'h3', text: 'Can I use both architectures in the same project workflow?' },
      {
        type: 'p',
        text: "Yes — this is often the most practical arrangement. Coordinators run browser validation locally as a pre-check before any formal submission. The CDE gateway uses cloud validation with an API for the audit trail and automated acceptance. The browser check is fast and private; the cloud check provides the official record and the organisation-wide reporting. The two architectures address different needs and complement each other.",
      },
      { type: 'h2', text: 'Summary' },
      {
        type: 'pull-quote',
        text: "Where an IFC file goes during validation is not a technical detail. It is a data governance decision that determines regulatory compliance for a large proportion of AEC projects.",
        cite: 'IFC Viewer Blog',
      },
      {
        type: 'feature-grid',
        items: [
          {
            icon: '🔒',
            title: 'Sensitive projects: browser-first',
            body: "Government, defence, healthcare, and infrastructure projects should default to browser-based validation. It is often the only compliant option — not just the convenient one. Data never leaves the device.",
          },
          {
            icon: '🔄',
            title: 'Automation and batch: cloud',
            body: "CI/CD pipelines, portfolio audits, and centralised reporting require cloud architecture. A browser session cannot participate in headless automated workflows or aggregate results across teams.",
          },
          {
            icon: '⚡',
            title: 'Daily validation: browser wins on speed',
            body: "Zero upload time, OPFS-accelerated repeat loads, and no account required. For the pre-delivery checks that define a coordinator's daily workflow, browser processing is faster than cloud at all common model sizes.",
          },
        ],
      },
      {
        type: 'p',
        text: ["To understand what the 44 quality rules actually check — and how they relate to schema validation and IDS — see ", { text: 'the complete IFC model checker guide', to: 'ifc-model-checker-guide' }, ". For the Health Score that summarises quality as a single number, see ", { text: 'the IFC Health Score guide', to: 'ifc-health-score-guide' }, ". If you need to fix property values or GUIDs on a received IFC file without uploading it anywhere, the ", { text: 'free online IFC editor', to: 'ifc-editor-online' }, " applies the same browser-first architecture to non-destructive property editing."],
      },
    ],
  },

  // ── Article #5 — BEST FREE IFC VIEWER COMPARISON ─────────────────────────

  {
    slug: 'best-free-ifc-viewer',
    title: 'Best Free IFC Viewer in 2026: Honest Comparison of 10 Tools',
    excerpt: "There is no single best IFC viewer — the right choice depends on your workflow. Independent comparison of 10 tools across browser vs desktop, validation depth, BCF, IDS, privacy, and large-file handling. Honest strengths and limitations for each.",
    date: '2026-06-30',
    readTimeMin: 24,
    category: 'Tool Guides',
    categorySlug: 'tool-guides',
    author: 'IFC Viewer Team',
    featured: false,
    keywords: [
      'best free IFC viewer', 'IFC viewer comparison', 'IFC file viewer', 'online IFC viewer',
      'free IFC viewer', 'IFC model viewer', 'browser IFC viewer', 'desktop IFC viewer',
      'OpenBIM viewer', 'open IFC files', 'IFC viewer 2026', 'IFC validation tool',
    ],
    faqs: [
      {
        q: 'What is the best free IFC viewer in 2026?',
        a: "There is no single best — it depends on your workflow. For browser-based viewing with validation and zero installation, IFC Viewer Online. For enterprise model checking, Solibri (free for non-commercial use via Solibri Anywhere). For basic desktop viewing on Windows, BIMVision. For team coordination with BCF, BIMcollab Zoom or Trimble Connect. For on-site field use, Dalux.",
      },
      {
        q: 'Can I open IFC files without installing software?',
        a: "Yes. IFC Viewer Online, That Open Viewer, Autodesk Viewer, Trimble Connect, and Dalux all run in a web browser with no installation. IFC Viewer Online processes files locally via WebAssembly — nothing is uploaded to any server. The others require cloud upload.",
      },
      {
        q: 'Which IFC viewer supports IDS 1.0 validation?',
        a: "IFC Viewer Online supports full IDS 1.0 validation with all six facets (Entity, Attribute, Property, Classification, Material, PartOf), validated against 100 official bSI testcases. Solibri has added IDS support in recent versions — verify the current release. The buildingSMART Validation Service validates IDS schema files but does not run them against models.",
      },
      {
        q: 'Does Solibri have a free version?',
        a: "Yes — Solibri Anywhere is free for non-commercial use (students, academics, individual learning). For commercial project work, Solibri requires a paid licence. Pricing is not publicly listed; contact Solibri for current rates.",
      },
      {
        q: 'Can I view IFC files on mobile?',
        a: "Dalux has the strongest mobile IFC viewing experience — purpose-built iOS and Android apps for on-site field use, including BCF issue management. Trimble Connect also has a mobile app. Most desktop viewers (BIMVision, Solibri, BIMcollab Zoom) do not support mobile. IFC Viewer Online runs on mobile browsers but is optimised for desktop.",
      },
      {
        q: 'What is the difference between an IFC viewer and an IFC validator?',
        a: "An IFC viewer renders 3D geometry and lets you browse properties. An IFC validator checks the file against quality rules and reports errors. Some tools combine both: IFC Viewer Online provides 3D viewing alongside 44-rule quality validation, IDS checking, and Health Score. Solibri is primarily a validator with strong visualisation. The buildingSMART Validation Service validates only — it has no geometry renderer.",
      },
    ],
    content: [
      {
        type: 'callout',
        variant: 'info',
        text: "TL;DR — IFC Viewer Online for browser-based QA with zero upload and full IDS 1.0; Solibri for enterprise rule-based model checking; BIMVision for free Windows desktop viewing; Trimble Connect or Dalux for cloud collaboration and field use; BIMcollab Zoom for BCF-led coordination. No single tool wins across all dimensions.",
      },
      {
        type: 'stat-row',
        stats: [
          { value: 10, label: 'tools compared' },
          { value: 6,  label: 'run in a browser' },
          { value: 4,  label: 'desktop-first' },
          { value: 0,  label: 'one-size-fits-all' },
        ],
      },
      {
        type: 'p',
        text: "Every BIM forum has a thread asking what is the best free IFC viewer. The answer is always the same: it depends. Depends on whether you need to validate, edit, coordinate, or just view. Depends on whether your data can leave your device. Depends on your team's ecosystem, operating system, and project size. This guide does not pick a winner. Instead it gives you an honest assessment of each tool so you can match the right one to your actual workflow.",
      },
      {
        type: 'p',
        text: "Ten tools are evaluated across the categories that matter most: platform availability, validation depth, property editing, BCF support, IDS 1.0 compliance, large-file handling, installation requirements, and data-privacy posture. Where we have direct experience building and testing IFC tools we say so. Where we are reporting documented capabilities of third-party tools, we recommend verifying current features before committing to an organisation-wide decision.",
      },
      {
        type: 'h2',
        text: 'At a Glance: IFC Viewer Comparison Table',
      },
      {
        type: 'table',
        headers: ['Viewer', 'Platform', 'Free tier', 'Validation', 'Editing', 'BCF', 'IDS 1.0', 'Large files', 'Install', 'Best for'],
        rows: [
          ['IFC Viewer Online', 'Browser', '✅ Full', '✅ 44 rules + score', '✅ Non-destructive', '✅ Export', '✅ Full (6 facets)', '✅ Good (WASM)', 'None', 'QA + privacy'],
          ['Solibri', 'Desktop (Win/Mac)', '⚠️ Non-commercial', '✅ Advanced engine', '⚠️ Limited', '✅ Full', '⚠️ Recent versions', '⚠️ Heavy on RAM', 'Required', 'Enterprise QA'],
          ['BIMVision', 'Desktop (Win)', '✅ Commercial OK', '❌ None', '❌ None', '⚠️ Plugin', '❌ No', '✅ Good', 'Required', 'Basic viewing'],
          ['Trimble Connect', 'Browser + App', '✅ 5 GB free', '❌ None', '❌ None', '✅ Native', '❌ No', '✅ Cloud', 'Optional', 'Team collab'],
          ['Dalux', 'Browser + Mobile', '✅ Contractors', '❌ None', '❌ None', '✅ Native', '❌ No', '✅ Cloud', 'Optional', 'On-site field'],
          ['Autodesk Viewer', 'Browser', '✅ Account required', '❌ None', '❌ None', '⚠️ Via ACC', '❌ No', '✅ Cloud', 'None', 'Quick sharing'],
          ['usBIM.viewer+', 'Desktop (Win)', '✅ Full', '⚠️ Basic checks', '❌ No', '✅ BCF 2.1', '❌ Unconfirmed', '⚠️ Moderate', 'Required', 'ACCA ecosystem'],
          ['That Open Viewer', 'Browser (OSS)', '✅ Open source', '❌ None', '❌ None', '⚠️ Varies', '❌ No', '✅ Varies', 'Optional', 'Developers / OSS'],
          ['BIMcollab Zoom', 'Desktop (Win/Mac)', '✅ Limited (1 model)', '❌ None', '❌ None', '✅ Native (core)', '❌ No', '✅ Good', 'Required', 'BCF coordination'],
          ['bSmart Validator', 'Browser (upload)', '✅ Full', '✅ Schema L1 only', '❌ None', '❌ None', '✅ IDS schema', '✅ Any', 'None', 'IFC certification'],
        ],
        caption: 'IDS 1.0 = six facets (Entity, Attribute, Property, Classification, Material, PartOf). bSmart Validator validates IDS schema files — it does not run IDS checks against model content. Features verified mid-2026; confirm current releases before adoption.',
        rowHeaders: true,
      },
      {
        type: 'h2',
        text: 'Browser-Based IFC Viewers',
      },
      {
        type: 'p',
        text: "Browser-based tools are the fastest path to opening an IFC file — no installation, no IT ticket, no version management. The trade-off is the memory ceiling of the browser's JavaScript heap, which becomes relevant above 300–500 MB on most machines. Cloud-uploaded tools move processing server-side and remove this constraint; locally-processed tools (WebAssembly) preserve data privacy at the cost of that ceiling.",
      },
      {
        type: 'h3',
        text: '1. IFC Viewer Online',
      },
      {
        type: 'p',
        text: "IFC Viewer Online is a browser-based tool that processes IFC files entirely on-device using WebAssembly. No file is uploaded to any server. It combines 3D geometry rendering with a 44-rule quality validation engine that produces a Health Score (0–100) and a rule-level breakdown, full IDS 1.0 checking across all six facets, non-destructive property editing and GUID repair, BCF 2.1 export, and multi-model federation. An SDK allows third parties to embed the viewer in their own sites or integrate it into CI/CD pipelines.",
      },
      {
        type: 'p',
        text: "Because this is the tool we built, we can speak to its internals with more confidence than the other entries in this guide. All 44 validation rules are open for inspection. The IDS engine has been validated against the complete official bSI testcase suite. The Health Score uses a severity-weighted logarithmic penalty model so that a single critical error has more impact than dozens of minor warnings — which matches how a BIM coordinator actually interprets quality results.",
      },
      {
        type: 'comparison',
        left: {
          label: 'Strengths',
          color: 'accent',
          items: [
            'Zero upload — WASM processes files on-device; nothing leaves your browser',
            '44-rule quality validation with Health Score and per-rule remediation guidance',
            'Full IDS 1.0 support: all six facets, validated against 100 official bSI testcases',
            'Non-destructive property editing, GUID repair, and Pset correction with full undo',
            'BCF 2.1 export for distributing issues to Solibri, BIMcollab, and other tools',
            'Multi-model federation and side-by-side comparison',
            'No account, no installation, no data residency risk',
            'OPFS caching — repeat loads of large files are ~10x faster after first parse',
            'SDK available for embedding the viewer or automating checks via CI/CD',
          ],
        },
        right: {
          label: 'Limitations',
          color: 'muted',
          items: [
            'Very large files (above ~500 MB) hit browser memory limits on most devices',
            'No persistent project workspace or CDE folder integration',
            'No native BCF inbox — exports BCF; does not receive and track incoming issues',
            'No clash detection between federated models',
            'Mobile experience works but is not optimised for on-site field use',
            'No enterprise pricing tier for volume licensing yet',
            'Batch processing across many files requires the SDK rather than the UI',
          ],
        },
      },
      {
        type: 'p',
        text: "Best for: BIM coordinators who need fast, private pre-delivery QA; consultants who receive IFC files from multiple sources and cannot upload to third-party servers; teams implementing IDS-based delivery requirements. Free, no account required.",
      },
      {
        type: 'h3',
        text: '2. That Open Viewer (ThatOpen Engine / IFC.js)',
      },
      {
        type: 'p',
        text: "ThatOpen Company — formerly the IFC.js team — built and maintains the web-ifc library that underpins several browser-based IFC tools, including parts of IFC Viewer Online. Their own viewer platform, That Open Viewer, is open-source and browser-based. It is the most accessible entry point for developers who want to understand or modify the IFC rendering engine, and it is self-hostable for teams that want full control over deployment.",
      },
      {
        type: 'p',
        text: "As an end-user tool for daily BIM coordination work, That Open Viewer is less feature-complete than purpose-built viewers. There is no built-in validation engine, no BCF export, and no property editing beyond read-only inspection. Its value is as a reference implementation of the ThatOpen engine and as a foundation for custom development. If you are a developer building IFC viewing into your own application, the ThatOpen engine and components library are the most practical open-source starting point available today.",
      },
      {
        type: 'comparison',
        left: {
          label: 'Strengths',
          color: 'accent',
          items: [
            'Open-source, MIT-licensed — fully auditable and modifiable',
            'Built on web-ifc, one of the most actively maintained IFC parsing libraries',
            'Self-hostable with complete control over deployment and data flow',
            'Strong developer community and comprehensive engine documentation',
            'Solid foundation for embedding IFC viewing in custom applications',
            'Browser-based, zero installation',
          ],
        },
        right: {
          label: 'Limitations',
          color: 'muted',
          items: [
            'No built-in validation, Health Score, or rule-based quality checking',
            'No BCF export or import',
            'No property editing beyond read-only inspection',
            'UI designed for developers, not optimised for BIM coordinator daily use',
            'Feature set depends on which version and which engine components are deployed',
            'No enterprise support tier',
          ],
        },
      },
      {
        type: 'p',
        text: "Best for: Developers building custom IFC viewers or embedding IFC rendering in web applications. Not the right choice for BIM coordinators who need validation, BCF coordination, or IDS checking out of the box. Free, open source.",
      },
      {
        type: 'h3',
        text: '3. Autodesk Viewer (viewer.autodesk.com)',
      },
      {
        type: 'p',
        text: "Autodesk Viewer is a free cloud-based viewer that supports over 60 file formats including IFC, RVT, DWG, NWD, and PDF. It requires an Autodesk account and uploads files to Autodesk cloud infrastructure for conversion and rendering. The tool is primarily designed for quick model sharing and stakeholder review — not for BIM quality control or IDS compliance checking.",
      },
      {
        type: 'p',
        text: "One important technical note: when you upload an IFC file to Autodesk Viewer, it is translated from IFC into Autodesk's SVF2 internal format. This translation can lose semantic IFC data — property set structures, classification references, and some geometric relationships — in ways that are not visible in the rendered output. Autodesk Viewer should not be used to verify that IFC data is structurally correct; it should be used for visual review only.",
      },
      {
        type: 'comparison',
        left: {
          label: 'Strengths',
          color: 'accent',
          items: [
            'Free with an Autodesk account — no paid subscription required for basic use',
            'Supports 60+ formats including IFC, RVT, DWG, NWD, PDF, and more',
            'Large files handled via cloud processing — no local RAM constraint',
            'Reliable for quick model sharing with non-BIM stakeholders',
            'Familiar brand in large AEC organisations — low friction for adoption',
            'No local installation required',
          ],
        },
        right: {
          label: 'Limitations',
          color: 'muted',
          items: [
            'Files are uploaded to Autodesk cloud — not suitable for sensitive or data-sovereign projects',
            'IFC-to-SVF2 translation may lose semantic data; visual review only',
            'No IFC validation, no quality rules, no Health Score',
            'No BCF in the free viewer — requires Autodesk Construction Cloud (paid)',
            'No property editing',
            'IFC-specific features significantly weaker than IFC-native tools',
          ],
        },
      },
      {
        type: 'callout',
        variant: 'warning',
        text: "Privacy note: uploading a file to Autodesk Viewer stores it on Autodesk servers. For government projects, healthcare facilities, defence assets, or any model subject to data-sovereignty requirements, review Autodesk's DPA and data-residency options before using the free viewer.",
      },
      {
        type: 'p',
        text: "Best for: Quick visual sharing of models with non-BIM stakeholders where format compatibility matters and data privacy is not a constraint. Free with Autodesk account.",
      },
      {
        type: 'h3',
        text: '4. Trimble Connect',
      },
      {
        type: 'p',
        text: "Trimble Connect is a cloud-based BIM collaboration platform rather than a pure IFC viewer. It includes a web viewer, a desktop client, and a mobile app. Teams upload models to Trimble's cloud infrastructure, where they can be viewed, federated with other models, and linked to BCF issues for multi-discipline coordination. The free tier includes 5 GB of project storage — sufficient for small projects or individual model review.",
      },
      {
        type: 'p',
        text: "Trimble Connect is strongest in team collaboration scenarios, particularly for teams already using other Trimble tools such as SketchUp, Tekla Structures, or Trimble Field Points. For standalone IFC quality checking, it is the wrong tool — there is no validation engine. Its value is as a coordination layer that sits on top of the IFC files produced by authoring tools.",
      },
      {
        type: 'comparison',
        left: {
          label: 'Strengths',
          color: 'accent',
          items: [
            'Strong multi-model federation — overlay multiple IFC models from different disciplines',
            'Native BCF 2.1 support — create, assign, and track issues with full audit trail',
            'Cross-platform: web viewer, desktop app, and mobile app in one ecosystem',
            'Free tier with 5 GB storage — accessible without budget approval',
            'Good integration with Trimble authoring tools (SketchUp, Tekla, Trimble RealWorks)',
            'Clash detection available in paid tiers',
          ],
        },
        right: {
          label: 'Limitations',
          color: 'muted',
          items: [
            'Files are uploaded to Trimble cloud — data leaves your organisation',
            'No IFC validation, no quality rules, no Health Score',
            'No property editing',
            'Full project capabilities require a paid subscription',
            'GDPR data residency: verify DPA terms before use on EU public-sector projects',
            'Performance for very large federated models depends on server load',
          ],
        },
      },
      {
        type: 'p',
        text: "Best for: Multi-disciplinary teams that need a shared coordination space with BCF issue management and do not require on-device data processing. Free tier available; paid plans for larger project volumes.",
      },
      {
        type: 'h3',
        text: '5. Dalux',
      },
      {
        type: 'p',
        text: "Dalux is a Danish BIM and document-management platform used widely in Scandinavia and Northern Europe. Its strongest differentiator is mobile-first IFC viewing — the iOS and Android apps are purpose-built for on-site field inspection, with BCF issue creation directly from a phone or tablet. For main contractors and subcontractors coordinating on-site, Dalux is the most capable free IFC tool available.",
      },
      {
        type: 'p',
        text: "Dalux is free for contractors, which has driven significant supply-chain adoption. The main contractor platform (Dalux Box) is an enterprise subscription, but subcontractors accessing models shared through it receive free access. This asymmetric pricing model means many field teams use Dalux without a dedicated budget line. Outside Scandinavia, Dalux is less commonly encountered — but it is expanding across Europe.",
      },
      {
        type: 'comparison',
        left: {
          label: 'Strengths',
          color: 'accent',
          items: [
            'Best-in-class mobile IFC viewing — iOS and Android apps purpose-built for on-site work',
            'BCF issue creation directly from mobile, linked to specific model elements',
            'Free for contractors — broad supply-chain adoption without per-user cost',
            'Good document management integration alongside model viewing',
            'Web viewer also available for desktop access',
            'Cross-platform coverage: browser, iOS, Android',
          ],
        },
        right: {
          label: 'Limitations',
          color: 'muted',
          items: [
            'Not designed for power-user desktop QA workflows',
            'No IFC validation or Health Score',
            'No property editing',
            'Files are uploaded to Dalux cloud',
            'Main contractor platform requires an enterprise subscription',
            'Less common outside Scandinavia and Northern Europe',
          ],
        },
      },
      {
        type: 'p',
        text: "Best for: On-site field teams, foremen, and subcontractors who need mobile IFC access with BCF issue creation. Free for contractors when a main contractor uses Dalux Box.",
      },
      {
        type: 'h3',
        text: '6. buildingSMART Validation Service — Not a Viewer',
      },
      {
        type: 'p',
        text: "The buildingSMART Validation Service is not an IFC viewer — it has no geometry renderer. It is the official reference tool for IFC schema compliance checking, developed and maintained by buildingSMART International. It validates uploaded IFC files against the EXPRESS schema rules, informal propositions, and normative implementation agreements for IFC 2x3 and IFC 4. It also validates IDS schema files — meaning the .ids XML structure itself, not running an IDS specification against a model's content.",
      },
      {
        type: 'p',
        text: "Its primary audience is IFC authoring-tool developers who need to certify that their software exports valid IFC. For BIM coordinators checking model quality, it is the wrong tool — it will tell you whether the IFC file is syntactically correct, but it will not tell you whether the data is meaningful, complete, or compliant with project requirements. Use it to certify that a tool export meets buildingSMART schema standards. Do not use it as a substitute for model quality checking.",
      },
      {
        type: 'comparison',
        left: {
          label: 'Strengths',
          color: 'accent',
          items: [
            'Official buildingSMART reference tool — authoritative for schema compliance',
            'Free, no account required for basic use',
            'Validates IFC 2x3 and IFC 4 against the full EXPRESS schema',
            'Required for buildingSMART software certification programmes',
            'IDS schema file validation (validates the .ids XML structure)',
            'Handles very large files via server-side processing',
          ],
        },
        right: {
          label: 'Limitations',
          color: 'muted',
          items: [
            'No geometry renderer — you cannot view the model',
            'Schema (L1) validation only — no data quality, no property completeness checking',
            'File must be uploaded — data leaves your organisation',
            'Results are verbose and require IFC schema expertise to interpret',
            'Does not run IDS checks against model content — only validates the .ids file itself',
            'Not a replacement for model quality checking or IDS run-checks',
          ],
        },
      },
      {
        type: 'callout',
        variant: 'warning',
        text: "Do not confuse the buildingSMART Validation Service with a model quality checker. It validates schema structure, not whether your model is fit for purpose. A file can pass schema validation and still have duplicate GUIDs, missing property sets, and a Health Score of 12.",
      },
      {
        type: 'p',
        text: "Best for: IFC authoring-tool developers certifying export compliance with buildingSMART schema standards. Not appropriate for BIM coordinators doing project QA. Free.",
      },
      {
        type: 'h2',
        text: 'Desktop IFC Viewers',
      },
      {
        type: 'p',
        text: "Desktop tools remove the browser memory ceiling and give access to the full compute resources of the workstation. For models above 500 MB, complex rule sets, or workflows that require persistent project workspaces, desktop tools remain the practical choice. The trade-off is installation overhead, version management, and — for cloud-connected desktop tools — data upload to vendor infrastructure.",
      },
      {
        type: 'h3',
        text: '7. Solibri',
      },
      {
        type: 'p',
        text: "Solibri is the industry benchmark for serious BIM model quality control. It is a desktop application for Windows and Mac. The commercial version is used by large engineering and construction firms for rule-based model checking, compliance auditing, and coordination. Solibri Anywhere is a free, full-featured version available for non-commercial use — students, academics, and individuals learning the tool can use it at no cost.",
      },
      {
        type: 'p',
        text: "Where IFC Viewer Online's 44 rules cover the most common IFC quality issues out of the box, Solibri's rule engine is designed for authoring custom rules: checking structural clearances, COBie property completeness, organisation-specific naming conventions, and spatial hierarchy requirements that go beyond any fixed rule set. If your organisation has bespoke BIM requirements codified in a BEP or EIR, Solibri's rule-authoring capability is unmatched in the free-and-near-free tier.",
      },
      {
        type: 'comparison',
        left: {
          label: 'Strengths',
          color: 'accent',
          items: [
            'Industry benchmark for rule-based model quality control',
            'Advanced rule authoring — create custom checks for organisation-specific requirements',
            'Comprehensive BCF support with full issue management and audit trail',
            'Solibri Anywhere is free for non-commercial use with full feature access',
            'IDS support added in recent versions — verify current release for coverage',
            'COBie and facility management data checking workflows',
            'Windows and Mac support',
          ],
        },
        right: {
          label: 'Limitations',
          color: 'muted',
          items: [
            'Commercial licensing is expensive — pricing not publicly listed; contact sales',
            'Desktop only — no browser version for remote or client-facing access',
            'Steep learning curve for rule authoring; shallow use does not leverage the tool',
            'Heavy on RAM for very large or federated models above 500 MB',
            'Processing speed degrades with complex rule sets on large models',
            'Non-commercial restriction applies to Solibri Anywhere — commercial work needs a paid licence',
          ],
        },
      },
      {
        type: 'p',
        text: "Best for: Enterprise BIM quality control, compliance auditing, COBie checking, and organisations with bespoke model requirements that require rule authoring. Free for non-commercial use via Solibri Anywhere; commercial pricing on request.",
      },
      {
        type: 'h3',
        text: '8. BIMVision',
      },
      {
        type: 'p',
        text: "BIMVision is a free Windows desktop IFC viewer developed by Datacomp. It is widely used in Central and Eastern Europe as the default free IFC viewer for teams that need basic model inspection without budget. The tool has no commercial restrictions on free use — an entire organisation can install it without a licence. It is designed for inspection and presentation, not for validation or coordination.",
      },
      {
        type: 'p',
        text: "BIMVision has a plugin architecture that extends its base capabilities. A BCF plugin adds issue creation and export. The tool handles reasonably large IFC files on desktop hardware and has a low learning curve — someone unfamiliar with BIM software can navigate properties and filter elements within minutes. For teams that simply need to open, browse, and visually inspect IFC files on Windows without any cost or cloud dependency, it remains a solid choice.",
      },
      {
        type: 'comparison',
        left: {
          label: 'Strengths',
          color: 'accent',
          items: [
            'Genuinely free for commercial use — no licence restrictions',
            'Clean, fast interface — low learning curve for basic IFC inspection',
            'Plugin architecture adds BCF and other functionality',
            'Good performance on mid-large files on desktop hardware',
            'Handles IFC 2x3 and IFC 4',
            'No cloud upload — model stays on your machine',
          ],
        },
        right: {
          label: 'Limitations',
          color: 'muted',
          items: [
            'Windows only — no Mac, Linux, or browser version',
            'No built-in validation or quality checking',
            'No property editing — read-only inspection only',
            'BCF requires a separate plugin download rather than native support',
            'No IDS support',
            'Less actively developed than major commercial alternatives',
          ],
        },
      },
      {
        type: 'p',
        text: "Best for: Windows users who need a free, reliable tool for basic IFC inspection with no validation or coordination requirements. Free with no commercial restrictions.",
      },
      {
        type: 'h3',
        text: '9. BIMcollab Zoom',
      },
      {
        type: 'p',
        text: "BIMcollab Zoom is a desktop IFC viewer from BIMcollab, the company behind the BIMcollab Cloud BCF management platform. The tool's primary purpose is BCF-led model coordination — it is designed to work alongside BIMcollab Cloud for real-time issue synchronisation across disciplines. It renders IFC geometry and allows teams to create, comment on, and resolve BCF issues directly from the model view.",
      },
      {
        type: 'p',
        text: "The free version of BIMcollab Zoom is limited to a single model and a limited number of BCF issues. Full functionality — multi-model federation, unlimited issues, real-time cloud sync — requires a BIMcollab Cloud subscription. For teams already using BIMcollab Cloud for issue management, Zoom is the natural companion. For teams outside the BIMcollab ecosystem, Trimble Connect or IFC Viewer Online (with BCF export) are likely better free alternatives.",
      },
      {
        type: 'comparison',
        left: {
          label: 'Strengths',
          color: 'accent',
          items: [
            'Native BCF focus — strongest free BCF viewing and coordination experience on desktop',
            'Real-time BCF Cloud sync when paired with BIMcollab Cloud subscription',
            'Multi-model federation available in paid tier',
            'Windows and Mac — cross-platform for desktop users',
            'Integrates with Solibri, Navisworks, Revit, and other authoring tools',
            'Good performance on mid-to-large models',
          ],
        },
        right: {
          label: 'Limitations',
          color: 'muted',
          items: [
            'Free version limited to single model and a capped number of BCF issues',
            'No IFC validation, no quality rules, no Health Score',
            'No property editing',
            'No browser version — desktop installation required',
            'Full value only within the BIMcollab Cloud subscription ecosystem',
            'No IDS support',
          ],
        },
      },
      {
        type: 'p',
        text: "Best for: Teams using BIMcollab Cloud for multi-discipline issue management who need a companion model viewer. Free version for single-model inspection; full features require BIMcollab Cloud subscription.",
      },
      {
        type: 'h3',
        text: '10. usBIM.viewer+',
      },
      {
        type: 'p',
        text: "usBIM.viewer+ is a free Windows desktop IFC viewer developed by ACCA Software, an Italian company focused on BIM for the construction sector. It supports IFC 2x3 and IFC 4, includes BCF 2.1 support, and provides some basic model checking capabilities. It is part of ACCA's wider usBIM ecosystem, which includes cloud-based BIM management tools primarily used in Italy and parts of the EU market.",
      },
      {
        type: 'p',
        text: "usBIM.viewer+ is less commonly used outside Italy and Southern Europe, and the ecosystem is primarily documented and supported in Italian. IDS 1.0 support has not been independently confirmed as of mid-2026 — verify the current release documentation before committing to it for IDS workflows. For teams already working within the ACCA or usBIM ecosystem, it is a natural companion. For teams outside that ecosystem, BIMVision or BIMcollab Zoom involve less friction.",
      },
      {
        type: 'comparison',
        left: {
          label: 'Strengths',
          color: 'accent',
          items: [
            'Free for commercial use — no licence cost',
            'BCF 2.1 support included natively (not a plugin)',
            'IFC 2x3 and IFC 4 support',
            'Some basic model checking features (verify current release capabilities)',
            'Natural companion for teams already using ACCA tools',
          ],
        },
        right: {
          label: 'Limitations',
          color: 'muted',
          items: [
            'Windows only — no Mac, Linux, or browser version',
            'Less common outside Italy and Southern Europe',
            'Community resources and documentation primarily in Italian',
            'IDS 1.0 support not independently confirmed — check current release',
            'Basic checks are limited compared to dedicated validators',
            'UI and feature polish below leading alternatives',
          ],
        },
      },
      {
        type: 'p',
        text: "Best for: Teams within the ACCA/usBIM ecosystem, particularly in Italy and Southern Europe, who need a free Windows desktop viewer with BCF support. Free.",
      },
      {
        type: 'h2',
        text: 'Online vs Desktop: When to Use Each',
      },
      {
        type: 'comparison',
        left: {
          label: 'Choose browser-based when…',
          color: 'accent',
          items: [
            'You need zero installation — remote access, shared workstations, or client-facing review',
            'Data privacy matters — WASM tools process files on-device with no upload',
            'You need IDS 1.0 validation without a heavyweight desktop install',
            'You need fast pre-delivery checks as part of a daily coordination workflow',
            'The file is below ~300–500 MB and fits within browser memory on the device',
            'You need an SDK to embed the viewer or automate checks in a CI/CD pipeline',
          ],
        },
        right: {
          label: 'Choose desktop when…',
          color: 'muted',
          items: [
            'Models regularly exceed 500 MB and require full workstation RAM',
            'You need advanced rule authoring for organisation-specific quality checks (Solibri)',
            'Your team runs persistent project workspaces across months of coordination',
            'You need multi-model federation with real-time BCF cloud sync (BIMcollab Zoom)',
            'The workflow is on-site mobile field inspection (Dalux mobile)',
            'You need deep integration with a desktop authoring tool ecosystem',
          ],
        },
      },
      {
        type: 'h2',
        text: 'Decision Matrix: Matching the Tool to Your Workflow',
      },
      {
        type: 'table',
        headers: ['If you need…', 'Recommended tool', 'Why'],
        rows: [
          ['Instant inspection of a received IFC file (no install)', 'IFC Viewer Online or Autodesk Viewer', 'Open a URL, drag and drop — results in seconds. IFC Viewer Online preserves data privacy; Autodesk Viewer supports 60+ formats.'],
          ['Privacy-sensitive projects (government, defence, healthcare)', 'IFC Viewer Online', 'WASM processes on-device. No file ever reaches a server. Verifiable in browser DevTools.'],
          ['44-rule quality validation with Health Score', 'IFC Viewer Online', 'The only browser-based tool with a built-in quality engine, severity-weighted scoring, and per-rule remediation guidance.'],
          ['Full IDS 1.0 validation (all six facets)', 'IFC Viewer Online', 'Complete IDS 1.0 engine validated against the full official bSI testcase suite.'],
          ['Enterprise rule authoring and custom model checks', 'Solibri', 'Industry-standard rule engine. Unmatched for bespoke organisation-specific BEP/EIR requirements.'],
          ['Non-destructive property editing on a received file', 'IFC Viewer Online', 'Edit Psets, GlobalIds, and element names without returning to the authoring tool.'],
          ['BCF-led coordination across multiple disciplines', 'BIMcollab Zoom or Trimble Connect', 'Native BCF with cloud sync and multi-model federation.'],
          ['Very large infrastructure files (above 500 MB)', 'Trimble Connect or Dalux', 'Cloud-side processing removes the local RAM constraint entirely.'],
          ['On-site field inspection with BCF on mobile', 'Dalux', 'Purpose-built iOS/Android apps with offline-capable BCF creation and document management.'],
          ['Open-source / embed IFC viewing in your own application', 'ThatOpen Engine or IFC Viewer Online SDK', 'MIT-licensed web-ifc engine. IFC Viewer Online SDK for embedding in third-party sites.'],
          ['IFC schema certification (for tool developers)', 'buildingSMART Validation Service', 'The official reference tool for buildingSMART schema compliance certification.'],
        ],
        caption: 'Recommendations reflect the most common use-case alignment. Complex projects often require two or more tools in combination.',
        rowHeaders: true,
      },
      {
        type: 'h2',
        text: 'Workflow Scenarios: Complete Recommendations',
      },
      {
        type: 'feature-grid',
        items: [
          {
            icon: '🏢',
            title: 'Small architectural studio (2–10 people)',
            body: "Primary: IFC Viewer Online — zero cost, zero install, fast per-file QA on every deliverable. Supplement with BIMVision on Windows for client-facing visual review sessions. If BCF coordination with a structural engineer is needed, a free Trimble Connect account covers model sharing and issue tracking.",
          },
          {
            icon: '🏗️',
            title: 'Large infrastructure project (500 MB+ models)',
            body: "Primary: Solibri for project-wide QA with rule sets authored to the BEP requirements. Supplement with Trimble Connect or Dalux for contractor field access. Use IFC Viewer Online for rapid IDS spot-checks on specific discipline models before they enter the federated set.",
          },
          {
            icon: '🏛️',
            title: 'Government BIM mandate (ISO 19650, public procurement)',
            body: "Primary: IFC Viewer Online for pre-submission validation — WASM guarantees no data leaves the device, satisfying data-sovereignty requirements. IDS specification checks can be run against every model before submission. Supplement with Solibri Anywhere for training and rule development against EIR/OIR requirements.",
          },
          {
            icon: '💼',
            title: 'Freelance BIM consultant (multiple clients, mixed ecosystems)',
            body: "Primary: IFC Viewer Online — works on any browser, any OS, any client machine with no installation requests. Handles property editing and GUID repair when clients send corrupted models. Use Autodesk Viewer only for sharing visual snapshots with non-BIM stakeholders. Avoid BCF tools unless a specific client requires a specific platform.",
          },
        ],
      },
      {
        type: 'h2',
        text: 'A Note on Privacy and Model Data',
      },
      {
        type: 'p',
        text: "Every tool in this guide that requires cloud upload — Autodesk Viewer, Trimble Connect, Dalux, buildingSMART Validation Service — stores your IFC file on a third-party server. For most commercial construction projects this is an acceptable trade-off. For government infrastructure, defence facilities, healthcare buildings, or any project under data-sovereignty or GDPR constraints, it may not be. Before selecting a cloud-based tool for sensitive projects, review the vendor's Data Processing Agreement, data-residency options, and retention policies. GDPR Article 28 requires a signed DPA for any processor handling personal data — which can include building-owner names and coordinates embedded in IFC property sets.",
      },
      {
        type: 'callout',
        variant: 'tip',
        text: "To verify that a tool genuinely processes locally: open browser DevTools, go to the Network tab, load an IFC file, and watch for outbound requests. In IFC Viewer Online you will see zero file-content requests — all processing happens in WASM workers. In cloud tools you will see the file bytes transmitted to the vendor's servers.",
      },
      {
        type: 'h2',
        text: 'Where IFC Viewer Online Fits in This Ecosystem',
      },
      {
        type: 'p',
        text: ["IFC Viewer Online occupies a specific and honest position: it is the most capable free browser-based tool for IFC quality validation and IDS compliance checking. It is not a Solibri replacement — it does not have Solibri's rule-authoring depth. It is not a BIMcollab replacement — it exports BCF but does not manage an issue inbox. It is not a Dalux replacement — it is not optimised for mobile field use. What it does, it does thoroughly: parse IFC on-device, score model quality against 44 rules, run full IDS 1.0 checks, let you edit and repair properties, and export to BCF — with zero upload and zero installation. Load the model below and run the validation to see how a real production IFC performs. See the ", { text: 'IFC Health Score guide', to: 'ifc-health-score' }, " for a detailed explanation of how the score is calculated and what each band means."],
      },
      {
        type: 'ifc-demo',
        modelId: 'office-architecture',
        title: 'Office Building — IFC4 Revit Export',
        description: 'A production IFC4 file exported from Revit. Run the full validation to see the 44-rule quality check and Health Score on a real-world model.',
        schema: 'IFC4',
        size: '14 MB',
        showProperties: true,
        allowFullscreen: true,
        height: 460,
      },
      {
        type: 'h2',
        text: 'Frequently Asked Questions',
      },
      {
        type: 'h3',
        text: 'What is the best free IFC viewer in 2026?',
      },
      {
        type: 'p',
        text: "There is no single best — the right tool depends on what you need to do with the IFC file. IFC Viewer Online for browser-based QA with zero upload; Solibri for enterprise rule-based checking (free for non-commercial use); BIMVision for free Windows desktop viewing; Trimble Connect or Dalux for cloud collaboration and field access; BIMcollab Zoom for BCF-led coordination. Most teams end up using two or three tools that cover different parts of their workflow.",
      },
      {
        type: 'h3',
        text: 'Can I open IFC files without installing software?',
      },
      {
        type: 'p',
        text: ["Yes. IFC Viewer Online, That Open Viewer, Autodesk Viewer, Trimble Connect, and Dalux all run in a web browser without installation. IFC Viewer Online processes the file locally via WebAssembly — nothing is uploaded. The others require cloud upload. For a detailed comparison of browser vs cloud processing architectures and when each is appropriate, see the full guide on ", { text: 'browser vs cloud IFC validation', to: 'browser-vs-cloud-ifc-validation' }, "."],
      },
      {
        type: 'h3',
        text: 'Which IFC viewer supports full IDS 1.0 validation?',
      },
      {
        type: 'p',
        text: "IFC Viewer Online supports full IDS 1.0 validation with all six facets — Entity, Attribute, Property, Classification, Material, and PartOf — validated against the complete official bSI testcase suite. Solibri has added IDS support in recent versions; verify the current release for coverage details. The buildingSMART Validation Service validates IDS schema files (whether the .ids XML is well-formed) but does not run IDS specifications against model content.",
      },
      {
        type: 'h3',
        text: 'Does Solibri have a free version?',
      },
      {
        type: 'p',
        text: "Yes. Solibri Anywhere is free for non-commercial use — students, academics, and individuals learning the tool get full feature access at no cost. For commercial project work, a paid licence is required. Pricing is not publicly listed on the Solibri website; contact their sales team for current rates. Tools that are free for commercial use: IFC Viewer Online, BIMVision, usBIM.viewer+, That Open Viewer, Trimble Connect (free tier), Dalux (contractor accounts).",
      },
      {
        type: 'h3',
        text: 'Can I view IFC files on mobile?',
      },
      {
        type: 'p',
        text: "Dalux has the strongest mobile IFC viewing experience — purpose-built iOS and Android apps designed for on-site field inspection, with BCF issue creation and document management built in. Trimble Connect also has a mobile app with IFC viewing. BIMVision, Solibri, and BIMcollab Zoom do not support mobile. IFC Viewer Online works in a mobile browser but the interface is optimised for desktop.",
      },
      {
        type: 'h3',
        text: 'What is the difference between an IFC viewer and an IFC validator?',
      },
      {
        type: 'p',
        text: ["An IFC viewer renders geometry and allows property inspection — the equivalent of opening a PDF to read it. An IFC validator checks the data against quality rules and produces a report — the equivalent of a grammar checker. Some tools combine both: IFC Viewer Online provides 3D viewing alongside the 44-rule quality check, IDS validation, and Health Score. Solibri is primarily a validator with strong visualisation. The buildingSMART Validation Service validates only — no geometry rendering. For a detailed breakdown of the three validation levels (schema L1, quality L2, IDS L3), see the ", { text: 'IFC model checker guide', to: 'ifc-model-checker-guide' }, "."],
      },
      {
        type: 'h2',
        text: 'Summary',
      },
      {
        type: 'pull-quote',
        text: "No IFC viewer is best for every workflow. Match the tool to the job: IFC Viewer Online for private browser-based QA, Solibri for enterprise rule authoring, BIMVision for simple Windows viewing, Trimble Connect or Dalux for cloud coordination, BIMcollab Zoom for BCF-led teamwork.",
      },
      {
        type: 'feature-grid',
        items: [
          {
            icon: '🔍',
            title: 'For pre-delivery quality checks',
            body: "IFC Viewer Online — 44 rules, Health Score, IDS 1.0, property editing. Zero upload. Works in any browser with no account required.",
          },
          {
            icon: '🏆',
            title: 'For enterprise model QA',
            body: "Solibri — industry-standard rule engine with advanced custom rule authoring. Free for non-commercial use via Solibri Anywhere.",
          },
          {
            icon: '👁️',
            title: 'For basic desktop viewing (Windows)',
            body: "BIMVision — free for commercial use, low learning curve, BCF via plugin. Clean and reliable for inspection and presentation.",
          },
          {
            icon: '📱',
            title: 'For on-site and mobile use',
            body: "Dalux — purpose-built iOS and Android apps with BCF creation. Free for contractors. Best-in-class for field workflows.",
          },
        ],
      },
      {
        type: 'p',
        text: ["For deeper coverage: how the 44-rule quality check works and what each rule flags — see the ", { text: 'IFC model checker guide', to: 'ifc-model-checker-guide' }, ". How the Health Score is calculated and how to use it as a project quality gate — see the ", { text: 'IFC Health Score guide', to: 'ifc-health-score' }, ". The case for browser-local validation vs cloud pipelines — see the guide on ", { text: 'browser vs cloud IFC validation', to: 'browser-vs-cloud-ifc-validation' }, ". To fix and export a corrected IFC without returning to the authoring tool — see the ", { text: 'free online IFC editor guide', to: 'ifc-editor-online' }, "."],
      },
    ],
  },

  // ── Article #6 — SOLIBRI ALTERNATIVE ─────────────────────────────────────

  {
    slug: 'solibri-alternative',
    title: 'Solibri Alternative in 2026: When Browser-Based IFC Validation Is Enough (And When It Is Not)',
    excerpt: "Solibri remains one of the strongest BIM quality control platforms available. Not every IFC workflow needs its full weight. An honest comparison of Solibri and browser-based IFC validation — when each is the right tool, where they complement each other, and how to decide.",
    date: '2026-06-30',
    readTimeMin: 22,
    category: 'Validation',
    categorySlug: 'validation',
    author: 'IFC Viewer Team',
    featured: false,
    keywords: [
      'Solibri alternative', 'free Solibri alternative', 'browser IFC validator',
      'online IFC validation', 'IFC model checker', 'IFC validation software',
      'OpenBIM validation', 'model checking software', 'BIM validation tool',
      'IFC quality check', 'Solibri vs browser validation',
    ],
    faqs: [
      {
        q: 'Is IFC Viewer Online a replacement for Solibri?',
        a: "Not in all workflows. IFC Viewer Online is a fast, free browser-based tool for quality checking, IDS validation, and property editing — strong for pre-delivery QA and zero-upload scenarios. Solibri excels at enterprise rule authoring, COBie checking, full BCF management, and company-wide governance. Many teams use both tools at different stages of the same workflow.",
      },
      {
        q: 'Can I use IFC Viewer Online and Solibri in the same project workflow?',
        a: "Yes — they complement each other effectively. IFC Viewer Online handles instant browser-based pre-checks and IDS validation. Solibri handles complex custom rules and full BCF lifecycle coordination. A common pattern is pre-screening in IFC Viewer Online before opening models in Solibri, saving processing time on models that would fail anyway.",
      },
      {
        q: 'Does IFC Viewer Online support IDS validation like Solibri?',
        a: "IFC Viewer Online supports full IDS 1.0 validation with all six facets — Entity, Attribute, Property, Classification, Material, and PartOf — validated against the complete official bSI testcase suite. Solibri has added IDS support in recent versions; verify the current release for coverage details.",
      },
      {
        q: 'What can Solibri do that IFC Viewer Online cannot?',
        a: "Solibri's main advantages are custom rule authoring for organisation-specific BIM requirements, full BCF lifecycle management (not just export), COBie and facility management data checking, enterprise deployment with centralised rule sets, geometric clash detection, and handling very large federated models where desktop RAM is not a constraint.",
      },
      {
        q: 'Is there a free version of Solibri?',
        a: "Yes — Solibri Anywhere is free for non-commercial use, including students, academics, and individual learning. Commercial project work requires a paid licence; pricing is not publicly listed. IFC Viewer Online is free for all use cases including commercial work, with no account required.",
      },
      {
        q: 'Which tool is better for privacy-sensitive IFC models?',
        a: "Both Solibri and IFC Viewer Online process files locally — Solibri on the desktop, IFC Viewer Online in the browser via WebAssembly. Neither uploads files to a cloud server by default. IFC Viewer Online has an accessibility advantage: it works from any browser without installation, which matters when models cannot be copied to a workstation with a Solibri licence installed.",
      },
    ],
    content: [
      {
        type: 'callout',
        variant: 'info',
        text: "TL;DR — Solibri is the right tool for enterprise rule authoring, COBie checking, and multi-discipline BCF coordination. IFC Viewer Online is the right tool for fast pre-delivery QA, IDS compliance, privacy-sensitive models, and property editing — with zero install and zero upload. The most effective large-project workflows use both.",
      },
      {
        type: 'stat-row',
        stats: [
          { value: 44,  label: 'quality rules (browser)' },
          { value: 6,   label: 'IDS 1.0 facets (browser)' },
          { value: 0,   suffix: ' upload needed', label: 'by either tool' },
          { value: 0,   label: 'one-size-fits-all answer' },
        ],
      },
      {
        type: 'p',
        text: "Solibri has been the BIM quality control reference tool for over a decade. It is expensive, requires installation, and takes time to configure — but when a large multi-disciplinary project needs enterprise-grade model checking with custom rules and a full BCF lifecycle, it is hard to beat. This article does not argue otherwise.",
      },
      {
        type: 'p',
        text: "What has changed is the landscape around it. Browser-based tools powered by WebAssembly can now parse, validate, and score IFC files in seconds without installation, without upload, and without a licence fee. For a growing share of IFC validation work — pre-delivery checks, IDS compliance, external partner review, property editing, privacy-sensitive models — these tools are genuinely sufficient. The question is not whether to replace Solibri. It is which part of your workflow actually needs Solibri, and which parts can be handled more efficiently elsewhere.",
      },
      {
        type: 'p',
        text: "This comparison is written as an independent assessment. We built IFC Viewer Online, so we have direct knowledge of its internals. For Solibri, we rely on published documentation and the experience of BIM professionals who use both tools. Where we are uncertain about a current Solibri feature, we say so explicitly rather than asserting something we cannot verify.",
      },
      {
        type: 'h2',
        text: 'Quick Comparison: Solibri vs IFC Viewer Online',
      },
      {
        type: 'table',
        headers: ['Feature', 'Solibri', 'IFC Viewer Online'],
        rows: [
          ['Installation', 'Required — Windows and Mac installer', 'None — runs in any browser, any OS'],
          ['Platform', 'Desktop only', 'Browser (Chrome, Firefox, Safari, Edge)'],
          ['Price', 'Commercial licence required (contact sales); Solibri Anywhere free for non-commercial use', 'Free for all use cases — no account, no licence'],
          ['Validation rules', 'Custom rule engine — author rules for any requirement', '44 built-in IFC quality rules + Health Score (0–100)'],
          ['IDS 1.0 support', '⚠️ Added in recent versions — verify current release', '✅ Full: all 6 facets, 100 official bSI testcases'],
          ['Property editing', '⚠️ Primarily a read tool — not designed for editing exported IFC', '✅ Non-destructive: Psets, GUIDs, names, full undo'],
          ['BCF support', '✅ Full lifecycle: create, assign, track, resolve, audit', '✅ Export BCF 2.1 — no native issue inbox'],
          ['Health Score', '❌ No single numeric quality metric', '✅ 0–100 severity-weighted logarithmic score'],
          ['Large models', '⚠️ Possible; RAM-intensive above 500 MB', '⚠️ Browser memory ceiling ~300–500 MB per device'],
          ['Multi-model', '✅ Full federation with clash detection', '✅ Federation and side-by-side comparison'],
          ['IFC export', '⚠️ Primarily an import tool; limited IFC re-export', '✅ Export corrected IFC with all applied edits'],
          ['GLB export', '❌ Not supported', '✅ Export to GLB for web and visualisation workflows'],
          ['No upload required', '✅ Desktop — model stays on local machine', '✅ WASM — model processed entirely on-device'],
          ['Offline capability', '✅ Fully offline after installation', '✅ Offline after first load; OPFS caches models'],
          ['Learning curve', 'High — rule authoring is a specialist skill', 'Low — drag-drop, instant results, no configuration'],
          ['Collaboration', '✅ Full enterprise BCF management', '⚠️ BCF export only; no incoming issue management'],
          ['SDK / embed', '❌ No public embedding SDK', '✅ SDK for CI/CD and site embedding'],
          ['Privacy posture', '✅ On-premise desktop; model stays on workstation', '✅ On-device WASM; verifiable in browser DevTools'],
        ],
        caption: 'IDS 1.0 facets: Entity, Attribute, Property, Classification, Material, PartOf. Solibri IDS coverage: verify the current release. Solibri commercial pricing: contact sales; varies by region and volume.',
        rowHeaders: true,
      },
      {
        type: 'h2',
        text: 'When Solibri Is the Right Tool',
      },
      {
        type: 'p',
        text: "Solibri's core value is not its viewer — it is the rule engine. The ability to author custom rules that encode your organisation's BIM requirements, run them consistently across every model on every project, and track issues through their full lifecycle is something no lightweight tool replicates. The following scenarios genuinely justify Solibri's licence cost:",
      },
      {
        type: 'feature-grid',
        items: [
          {
            icon: '⚙️',
            title: 'Custom rule authoring for BEP/EIR requirements',
            body: "Your BEP specifies that all walls must have a fire rating property, rooms must have occupancy greater than zero, or elements must follow a specific GUID naming pattern. Solibri can check this. Browser-based tools run fixed rule sets — they cannot encode bespoke project requirements without custom development.",
          },
          {
            icon: '📋',
            title: 'COBie and facility management data checking',
            body: "Public sector handover and FM workflows require COBie property completeness as a contractual obligation. Solibri has built-in COBie templates and verifies that hundreds of required FM properties are present, correctly typed, and populated across the model — a capability not available in lightweight validators.",
          },
          {
            icon: '🏢',
            title: 'Enterprise governance across many projects',
            body: "A firm running 20+ active projects needs consistent QA standards enforced centrally. Solibri's enterprise deployment lets one BIM manager define rule sets and push them across the organisation. Every project team runs the same checks. Every result is auditable.",
          },
          {
            icon: '🔄',
            title: 'Full BCF lifecycle management',
            body: "Solibri's BCF support goes beyond export: issues are created, assigned to specific discipline leads, tracked through resolution, and audited with full history. For multi-discipline coordination where an issue raised in week 2 must be resolved and verified by week 6, this lifecycle management is essential.",
          },
          {
            icon: '💥',
            title: 'Geometric clash detection in federated models',
            body: "For complex buildings or infrastructure where structural, MEP, and architectural models must be coordinated spatially, Solibri's clash detection and space analysis identifies conflicts that rule-based validation misses. No browser tool handles geometric clash at this scale.",
          },
          {
            icon: '✅',
            title: 'Compliance verification for regulated handover',
            body: "On some government or regulated projects, the acceptance verifier requires Solibri output as the recognised QA artefact. If the procurement contract names a specific validation tool, there is no practical alternative for that specific deliverable.",
          },
        ],
      },
      {
        type: 'h2',
        text: 'When Browser-Based Validation Is Sufficient',
      },
      {
        type: 'p',
        text: "Most IFC files are checked for standard quality issues far more often than they are checked against bespoke organisational rules. The majority use case — a BIM coordinator running a pre-delivery check before submitting to the CDE — does not require rule authoring or a BCF issue inbox. Browser-based tools meet this need efficiently:",
      },
      {
        type: 'feature-grid',
        items: [
          {
            icon: '⚡',
            title: 'Pre-delivery quality checks (daily workflow)',
            body: "Run 44 standard IFC quality rules and get a Health Score before submitting to the CDE. Catches duplicate GUIDs, missing spatial hierarchy, invalid property types, and geometry errors — the most common delivery failure causes — in under 30 seconds, with no software to install.",
          },
          {
            icon: '📄',
            title: 'IDS compliance without a Solibri licence',
            body: "Full IDS 1.0 validation in the browser: all six facets, validated against official bSI testcases. If the EIR specifies an IDS file, load it alongside the IFC model and run the check. No per-seat licence required — accessible to every team member regardless of Solibri availability.",
          },
          {
            icon: '🤝',
            title: 'Reviewing IFC files from external partners',
            body: "A structural engineer or subcontractor sends a model. There is no shared Solibri environment. Open it in the browser, check quality, export BCF issues, send them back — no coordinated software installation, no shared server, no licence provisioning.",
          },
          {
            icon: '🔒',
            title: 'Privacy-sensitive models that cannot be uploaded',
            body: "Government facilities, hospitals, defence assets, or any building where the IFC cannot leave the organisation. WebAssembly processes the file entirely on-device. No bytes reach any server. Demonstrable in browser DevTools.",
          },
          {
            icon: '🔧',
            title: 'Non-destructive property editing on received files',
            body: "The received model has 400 elements with duplicate GlobalIds or wrong Pset values copied from a template. Fix them in the browser, export a clean IFC, re-check. No access to the authoring tool or the original BIM author required.",
          },
          {
            icon: '📚',
            title: 'Teaching OpenBIM and IFC to new team members',
            body: "Introducing IFC validation to a junior coordinator or a student. No software to install, no licence to request, no IT ticket. Open a browser, load a model, see the validation results immediately. The direct feedback loop is pedagogically more effective than a complex configuration process.",
          },
        ],
      },
      {
        type: 'h2',
        text: 'Typical Workflows: Where Each Tool Belongs',
      },
      {
        type: 'h3',
        text: 'Architecture Studio (5–30 People)',
      },
      {
        type: 'p',
        text: "For a studio of this size, most IFC validation is pre-delivery: verify the export is sound before it reaches the CDE. Solibri is typically not cost-justified for this volume. The full validation cycle looks like this:",
      },
      {
        type: 'code',
        lang: 'text',
        text: `Authoring tool (Revit / ArchiCAD / SketchUp)
         │
         ▼
   Export IFC file
         │
         ▼
IFC Viewer Online ─ browser, zero install
  ├─ Schema check (IFC 2x3 / IFC 4)
  ├─ 44-rule quality check
  ├─ Health Score — meet the BEP threshold?
  └─ IDS check (if EIR specifies an IDS file)
         │
    Pass─┤─────────────────Fail
    │                       │
    ▼                       ▼
Deliver to CDE       Fix in authoring tool
                     — or edit properties /
                       repair GUIDs directly
                       in IFC Viewer Online,
                       then re-check`,
      },
      {
        type: 'h3',
        text: 'Enterprise Contractor (Large Multi-Discipline)',
      },
      {
        type: 'p',
        text: "For a principal contractor managing structural, architectural, and MEP models across a federated set, Solibri handles the coordination stage. Browser-based tools fit at the pre-screening and IDS compliance stages, reducing wasted processing time on models that would fail anyway:",
      },
      {
        type: 'code',
        lang: 'text',
        text: `Discipline models (Architecture / Structure / MEP)
         │
         ▼
IFC Viewer Online ─ pre-screen
  Health Score below agreed threshold?
  ──► Return to authoring team
      (avoid spending Solibri time on a failing model)
         │
    Pass─┘
         │
         ▼
      Solibri
  ├─ Custom BEP / EIR rule sets
  ├─ Geometric clash detection
  ├─ COBie data completeness
  └─ BCF issues ─► discipline leads
         │
         ▼
IFC Viewer Online ─ IDS compliance check
  Run EIR IDS specification against
  each discipline model before delivery
         │
         ▼
BCF export ─► authoring teams for resolution
         │
         ▼
    Final delivery to CDE`,
      },
      {
        type: 'h3',
        text: 'Government Client / Project Owner',
      },
      {
        type: 'p',
        text: "A government authority receiving IFC deliverables from a contracted team needs to verify quality and IDS compliance without necessarily using the same software stack as the contractor. Browser-based validation with no upload requirement fits the receiving side of this workflow precisely:",
      },
      {
        type: 'code',
        lang: 'text',
        text: `IFC file received from contractor
         │
         ▼
IFC Viewer Online ─ no upload required
  ├─ Schema validation (IFC 2x3 / IFC 4)
  ├─ 44-rule quality check
  ├─ Health Score vs acceptance threshold
  └─ IDS compliance (mandatory EIR spec)
         │
   Accept─┤─────────────────Reject
   │                         │
   ▼                         ▼
Internal review          BCF report
                         ─► contractor
   │
   ▼
Formal QA (Solibri, if required
by procurement specification)
   │
   ▼
Project acceptance or rejection`,
      },
      {
        type: 'h2',
        text: 'Pros and Cons',
      },
      {
        type: 'h3',
        text: 'Solibri',
      },
      {
        type: 'comparison',
        left: {
          label: 'Strengths',
          color: 'accent',
          items: [
            'Custom rule authoring — encode any BIM requirement; checks that no fixed rule set can run',
            'Full BCF lifecycle: create, assign, track, resolve, and audit issues across disciplines',
            'COBie and FM data checking — contractual property completeness requirements covered',
            'Enterprise governance — centralised rule sets deployed and updated across all projects',
            'Geometric clash detection and space analysis in federated models',
            'Industry-recognised output — accepted by verifiers and clients as the QA artefact',
            'Solibri Anywhere free for non-commercial use with full feature access',
          ],
        },
        right: {
          label: 'Limitations',
          color: 'muted',
          items: [
            'Commercial licensing is expensive — pricing not publicly listed; varies by region and volume',
            'Desktop only — no browser access for remote teams, client review, or unlicensed workstations',
            'Steep learning curve — rule authoring is a specialist BIM skill requiring dedicated training',
            'Installation and IT deployment required before any team member can use it',
            'Heavy on RAM for large models; processing degrades above 500 MB with complex rule sets',
            'No public SDK for embedding or CI/CD automation',
            'No built-in single numeric Health Score — pass/fail per rule, not a unified quality index',
          ],
        },
      },
      {
        type: 'h3',
        text: 'IFC Viewer Online',
      },
      {
        type: 'comparison',
        left: {
          label: 'Strengths',
          color: 'accent',
          items: [
            'Zero installation — opens in any browser on any OS in seconds, from any device',
            'Free for all use cases including commercial work — no licence, no account required',
            'Full IDS 1.0 validation: all six facets, validated against 100 official bSI testcases',
            'Non-destructive property editing: Psets, GUIDs, names, with full undo and IFC re-export',
            'Health Score (0–100) — a single severity-weighted metric for fast quality communication',
            'Zero upload — WASM on-device processing, verifiable in browser DevTools',
            'GLB export, BCF export, multi-model federation, OPFS caching, SDK',
          ],
        },
        right: {
          label: 'Limitations',
          color: 'muted',
          items: [
            'No custom rule authoring — 44 built-in rules only; cannot encode bespoke BIM requirements',
            'No BCF inbox — exports BCF but does not manage an incoming issue lifecycle',
            'No COBie checking or FM property completeness validation',
            'No geometric clash detection between federated model disciplines',
            'Browser memory ceiling (~300–500 MB) limits very large infrastructure models',
            'No enterprise governance layer — no centralised rule deployment across an organisation',
            'Requires initial internet load; first session cannot be fully air-gapped',
          ],
        },
      },
      {
        type: 'h2',
        text: 'Cost Considerations',
      },
      {
        type: 'p',
        text: "Solibri's commercial pricing is not publicly listed. Licence costs vary by region, volume, and agreement type. The total cost of enterprise adoption is consistently higher than the licence alone: factor in training (rule authoring is not intuitive), IT deployment and maintenance, and the ongoing time cost of developing and updating rule sets as project requirements evolve. For a BIM manager evaluating enterprise adoption, budget for at least one dedicated training engagement in addition to the licence.",
      },
      {
        type: 'p',
        text: "Solibri Anywhere removes the licence cost for non-commercial use, making it accessible for students, academics, and those learning the platform. The non-commercial restriction is strict — professional project work requires a paid licence.",
      },
      {
        type: 'callout',
        variant: 'warning',
        text: "We do not publish Solibri pricing because it changes and varies by region, volume, and negotiated terms. Contact Solibri directly for a current quote. Third-party price comparisons found online are frequently outdated or based on older licensing structures.",
      },
      {
        type: 'p',
        text: "Browser-based tools have zero acquisition cost and zero deployment cost. There are no IT tickets, no installation packages to maintain, no version updates to coordinate across workstations. A new team member, external consultant, or subcontractor accesses IFC Viewer Online by opening a URL — no provisioning, no licence assignment. For organisations with infrequent users who need occasional model checking, this accessibility difference is significant. The licence cost per validated model looks very different for a BIM manager who validates 500 models per year versus a consultant who validates 10.",
      },
      {
        type: 'h2',
        text: 'Privacy: Browser-Local vs Desktop Processing',
      },
      {
        type: 'p',
        text: "Both Solibri and IFC Viewer Online share one important property that distinguishes them from cloud-based tools: neither uploads your IFC file to a remote server by default. Solibri processes models on the local workstation. IFC Viewer Online processes models in the browser via WebAssembly — also locally, with no server receiving file content. This matters for government infrastructure, hospitals, industrial facilities, defence assets, or any project where the model is commercially or legally sensitive.",
      },
      {
        type: 'comparison',
        left: {
          label: 'IFC Viewer Online — browser WASM',
          color: 'accent',
          items: [
            'Model processed in WASM workers — auditable in browser DevTools Network tab',
            'No server receives file content — zero upload, demonstrable to clients and auditors',
            'Works from any browser anywhere — no model copy to a licensed workstation required',
            'Accessible to external consultants and remote teams with no VPN or install needed',
            'No residual model data on any remote server after the session ends',
          ],
        },
        right: {
          label: 'Solibri — desktop application',
          color: 'muted',
          items: [
            'Model stays on local machine — fully air-gapped operation possible',
            'No browser runtime dependency — works on locked-down IT environments',
            'Installation controlled by IT policy and internal network restrictions',
            'Appropriate for classified networks where internet access is prohibited or monitored',
            'No initial internet load required after installation',
          ],
        },
      },
      {
        type: 'callout',
        variant: 'tip',
        text: "To verify IFC Viewer Online processes locally: open browser DevTools (F12), go to the Network tab, load an IFC file, and watch outbound requests. You will see zero file-content requests — all processing happens in WASM workers with no server communication. This is demonstrable to clients and procurement authorities who require evidence of on-device processing.",
      },
      {
        type: 'p',
        text: "For truly air-gapped environments or classified networks where internet access is prohibited, Solibri's desktop model is the more controllable option. IFC Viewer Online requires an initial internet load (the application download), after which OPFS-cached models allow offline use — but the first session requires internet access. If the operating environment prohibits all internet connectivity, Solibri is the appropriate choice.",
      },
      {
        type: 'h2',
        text: 'Decision Matrix: Solibri or IFC Viewer Online?',
      },
      {
        type: 'table',
        headers: ['Workflow need', 'Recommended tool', 'Why'],
        rows: [
          ["Custom rules from your organisation's BEP or EIR", 'Solibri', 'Rule authoring engine is purpose-built for this — no equivalent in any fixed-rule-set tool'],
          ['Quick pre-delivery check of a discipline model', 'IFC Viewer Online', 'No install, results in seconds, Health Score at a glance — fastest path to pass/fail'],
          ['COBie data completeness for FM handover', 'Solibri', 'COBie checking is a Solibri speciality with built-in templates and property coverage verification'],
          ['IDS 1.0 compliance check (all six facets)', 'IFC Viewer Online', 'Full IDS 1.0 engine, validated against official bSI testcases — no per-seat licence required'],
          ['Multi-discipline BCF coordination with full issue lifecycle', 'Solibri', 'Issue creation, assignment, tracking, and resolution in one managed environment'],
          ['Privacy-sensitive model (no upload permitted)', 'IFC Viewer Online', 'WASM on-device processing — verifiable zero upload from any browser'],
          ['Air-gapped or classified network (no internet access)', 'Solibri', 'Desktop app operates fully offline after installation; no browser runtime needed'],
          ['Fixing broken GUIDs or incorrect property values', 'IFC Viewer Online', 'Non-destructive editing without returning to the authoring tool — export corrected IFC'],
          ['External consultant reviewing a client model remotely', 'IFC Viewer Online', 'No software install, no file upload — load from any browser in seconds'],
          ['Company-wide BIM governance across 10+ simultaneous projects', 'Solibri', 'Centralised rule sets, audit trail, enterprise deployment — no lightweight tool matches this'],
          ['Embedding IFC validation in a custom portal or CI/CD pipeline', 'IFC Viewer Online SDK', 'Public SDK with JavaScript API — no Solibri public SDK available'],
          ['Teaching IFC validation to students or new coordinators', 'IFC Viewer Online', 'Free, zero install, immediate feedback — lowest barrier to the broadest audience'],
        ],
        caption: 'Many projects combine both tools. These recommendations reflect the most efficient fit for each individual task, not an either/or choice.',
        rowHeaders: true,
      },
      {
        type: 'h2',
        text: 'How the Two Tools Complement Each Other',
      },
      {
        type: 'p',
        text: "The framing of this article as a 'Solibri alternative' reflects how people search — not how the tools actually relate. In practice, the most effective large-project workflows use both tools, each where it is efficient, with models passing between them at defined quality gates. Four complementary patterns that work in real projects:",
      },
      {
        type: 'feature-grid',
        items: [
          {
            icon: '🔍',
            title: 'Pre-screen in browser, process in Solibri',
            body: "Run IFC Viewer Online before opening a model in Solibri. If the Health Score is below an agreed threshold — say 60 — return it to the authoring team without spending Solibri processing time on an obviously failing model. Solibri time is expensive; filter out poor models cheaply first.",
          },
          {
            icon: '📋',
            title: 'IDS in browser, coordination in Solibri',
            body: "Run IDS compliance checks in IFC Viewer Online (full IDS 1.0, no install, no licence per seat). Run coordination, clash detection, and BCF management in Solibri. This division keeps IDS validation accessible to all team members regardless of Solibri licence availability.",
          },
          {
            icon: '🤝',
            title: 'External partners self-check before submission',
            body: "Subcontractors and external consultants who do not have Solibri licences run IFC Viewer Online on their deliverables before submitting. Internal QA then opens Solibri only on models that arrive with a Health Score above the agreed threshold — cutting turnaround cycles.",
          },
          {
            icon: '🔗',
            title: 'SDK for automated pre-qualification',
            body: "Use the IFC Viewer Online SDK to run automated quality checks in a BIM portal or CI/CD pipeline before models enter the Solibri review queue. Reject models below a minimum Health Score automatically — no manual intervention at the gatekeeping stage.",
          },
        ],
      },
      {
        type: 'ifc-demo',
        modelId: 'duplex-architecture',
        title: 'Duplex Apartment — IFC2x3',
        description: "A standard IFC2x3 reference model. Load it, run the 44-rule quality check, and see the Health Score — the kind of pre-delivery check that fits the browser workflow before a model enters Solibri's review queue.",
        schema: 'IFC2x3',
        size: '2.4 MB',
        showProperties: true,
        allowFullscreen: true,
        height: 440,
      },
      {
        type: 'h2',
        text: 'Frequently Asked Questions',
      },
      {
        type: 'h3',
        text: 'Is IFC Viewer Online a replacement for Solibri?',
      },
      {
        type: 'p',
        text: "No — not for all workflows. IFC Viewer Online is a better fit for the subset of tasks it covers: fast pre-delivery QA, IDS compliance, privacy-sensitive models, property editing, and zero-install accessibility. It does not replace Solibri for custom rule authoring, full BCF management, COBie checking, or enterprise governance. Many teams will use both, each for what it does best.",
      },
      {
        type: 'h3',
        text: 'Can I use both tools on the same project?',
      },
      {
        type: 'p',
        text: "Yes — this is often the most efficient pattern for large projects. IFC Viewer Online handles pre-screening, IDS compliance, and external-partner review. Solibri handles coordination, custom rules, and full BCF lifecycle management. Models flow between the two tools at defined quality gates. The combination is more efficient than either tool alone for most large-scale, multi-stakeholder workflows.",
      },
      {
        type: 'h3',
        text: 'How does IDS support compare between the two tools?',
      },
      {
        type: 'p',
        text: ["IFC Viewer Online supports full IDS 1.0 validation: all six facets (Entity, Attribute, Property, Classification, Material, PartOf), validated against the complete official bSI testcase suite. Solibri has added IDS support in recent versions — verify the current release documentation for specific facets and testcase coverage. For teams that need IDS compliance without a Solibri licence on every seat, IFC Viewer Online covers the complete IDS 1.0 specification at zero cost. See the ", { text: 'IFC model checker guide', to: 'ifc-model-checker-guide' }, " for a breakdown of all three validation levels — schema, quality, and IDS."],
      },
      {
        type: 'h3',
        text: 'Is there a free alternative to Solibri for commercial use?',
      },
      {
        type: 'p',
        text: "For rule-based validation with custom-authored rules: no — there is no free tool that replicates Solibri's rule authoring engine for commercial project use. For standard IFC quality checking (44 rules, Health Score, IDS): yes — IFC Viewer Online is free for all use cases including commercial work, with no account or licence. If the validation need is pre-delivery quality checking rather than bespoke rule authoring, IFC Viewer Online meets it at zero cost.",
      },
      {
        type: 'h3',
        text: 'What is the Health Score and does Solibri have an equivalent?',
      },
      {
        type: 'p',
        text: ["IFC Viewer Online's Health Score is a 0–100 numeric quality metric calculated using a severity-weighted logarithmic penalty model. Errors carry a 3× weight over warnings; a single critical error has more impact than many minor issues — which reflects how a BIM coordinator actually prioritises fixes. Solibri does not produce an equivalent single numeric score: it produces per-rule pass/fail results across the issue set. Both approaches are valid. The Health Score is optimised for fast communication of overall model quality across stakeholders with varying BIM literacy. For the full calculation methodology, see the ", { text: 'IFC Health Score guide', to: 'ifc-health-score' }, "."],
      },
      {
        type: 'h3',
        text: 'Which tool should a small architecture studio use?',
      },
      {
        type: 'p',
        text: "For a studio of 5–30 people running pre-delivery IFC checks without bespoke organisational rules, IFC Viewer Online is the more practical choice: zero cost, zero installation, results in seconds, accessible from any device. Solibri becomes cost-justified when the studio grows to the point where standardised custom rules across multiple simultaneous projects save more time and rework cost than the licence — or when a specific client or project contract mandates it.",
      },
      {
        type: 'h2',
        text: 'Summary',
      },
      {
        type: 'pull-quote',
        text: "Solibri and IFC Viewer Online are not competitors — they solve different problems. Solibri is a BIM governance platform. IFC Viewer Online is a validation access layer. The most effective workflows use both.",
      },
      {
        type: 'feature-grid',
        items: [
          {
            icon: '🏆',
            title: 'Choose Solibri when…',
            body: "You need custom rule authoring, full BCF lifecycle management, COBie checking, enterprise governance, clash detection, or a verifier-accepted QA artefact on a regulated project.",
          },
          {
            icon: '🌐',
            title: 'Choose IFC Viewer Online when…',
            body: "You need fast pre-delivery QA, IDS 1.0 compliance, property editing, zero-upload for sensitive models, or browser-accessible validation for team members without Solibri licences.",
          },
          {
            icon: '🔗',
            title: 'Use both when…',
            body: "Your project has internal coordination (Solibri) and external partner or pre-screening workflows (browser). Pre-screen in IFC Viewer Online; move only passing models into the Solibri queue.",
          },
          {
            icon: '💡',
            title: 'Expert tip',
            body: "Use IFC Viewer Online's Health Score as the intake bar for Solibri. A model below 60 returns to the authoring team before entering the Solibri queue. This alone can significantly reduce coordination cycle time on large projects.",
          },
        ],
      },
      {
        type: 'p',
        text: ["For related reading: the three levels of IFC validation and where each tool fits — see the ", { text: 'IFC model checker guide', to: 'ifc-model-checker-guide' }, ". How the Health Score is calculated and used as a project quality gate — see the ", { text: 'IFC Health Score guide', to: 'ifc-health-score' }, ". Browser-local vs cloud IFC processing — see the guide on ", { text: 'browser vs cloud IFC validation', to: 'browser-vs-cloud-ifc-validation' }, ". Editing and repairing a received IFC without the authoring tool — see the ", { text: 'free online IFC editor guide', to: 'ifc-editor-online' }, ". All major IFC viewers compared — see the ", { text: 'best free IFC viewer comparison', to: 'best-free-ifc-viewer' }, "."],
      },
    ],
  },

  // ── Article #7: IFC Model Checker — Pillar ────────────────────────────────
  {
    slug: 'ifc-model-checker',
    title: 'IFC Model Checker: The Complete Guide (2026)',
    excerpt: 'What IFC model checking actually means, how the three validation layers work, and how to use a checker to enforce quality gates before every model delivery.',
    date: '2026-06-30',
    author: 'IFC Viewer Online',
    category: 'Validation',
    categorySlug: 'validation',
    readTimeMin: 26,
    keywords: ['IFC model checker', 'IFC validation', 'IFC quality check', 'BIM model checking', 'IFC Health Score', 'IDS validation', 'ISO 19650', 'BIM coordinator'],
    faqs: [
      { q: 'What is an IFC model checker?', a: 'An IFC model checker is a tool that automatically validates IFC files against structural rules (schema compliance), quality rules (naming, geometry, property completeness), and project-specific requirements (IDS 1.0). It produces a pass/fail report and a numerical quality score so BIM coordinators can enforce delivery standards without opening each model manually.' },
      { q: 'What is the difference between an IFC viewer and an IFC model checker?', a: 'A viewer lets you see geometry and browse properties. A checker validates the data structure — it finds missing property sets, duplicate GUIDs, broken spatial hierarchy, geometry errors, and IDS non-conformances that are invisible to the eye. Many tools combine both, but the checking engine is a separate function from the renderer.' },
      { q: 'What are the three levels of IFC validation?', a: 'Level 1 checks schema and EXPRESS rules — is the file structurally valid? Level 2 checks 44 quality rules — naming, GUIDs, hierarchy, property completeness, geometry integrity. Level 3 checks IDS 1.0 requirements — does the model contain the specific data the project requires? Each level builds on the previous.' },
      { q: 'What is a good IFC Health Score?', a: 'Scores of 90–100 indicate a delivery-ready model. 75–89 is acceptable for most coordination stages with minor fixes needed. 50–74 requires remediation before delivery. Below 50 means significant data quality issues that will cause downstream problems in quantity takeoff, cost estimation, and FM handover.' },
      { q: 'Can I check IFC models without uploading them to a server?', a: 'Yes. IFC Viewer Online processes files entirely in the browser using WebAssembly. The IFC file never leaves your machine — you can verify this by opening browser DevTools and watching the Network tab during loading. This is critical for projects with NDA or data sovereignty requirements.' },
      { q: 'At what project stages should IFC models be checked?', a: 'At minimum: before CDE upload (prevent junk in), at coordination stage gates (before clash detection), before client submission (formal delivery), and at FM handover (LOI completeness). On large projects, automated checking at every model revision is achievable with CLI tools or API-driven workflows.' },
    ],
    content: [
      {
        type: 'callout',
        variant: 'info',
        text: 'TL;DR — An IFC model checker validates your file at three levels: schema (is it valid IFC?), quality (does it follow BIM standards?), and requirements (does it contain the data your project needs?). This guide covers all three levels, explains the Health Score, walks through an ISO 19650 checking workflow, and helps you choose the right tool.',
      },
      {
        type: 'stat-row',
        stats: [
          { value: 44, label: 'quality rules checked automatically' },
          { value: 3, label: 'validation levels: schema → quality → IDS' },
          { value: 6, label: 'IDS 1.0 facets validated' },
          { value: 0, label: 'file uploads needed for browser-local checking' },
        ],
      },
      { type: 'h2', text: 'What Is an IFC Model Checker?' },
      {
        type: 'p',
        text: 'An IFC model checker is software that automatically validates the content and structure of an IFC file against a defined set of rules. It goes beyond what the eye can see in a 3D viewer: it interrogates the data layer — GUIDs, spatial hierarchy, property sets, geometry, classifications, and project-specific requirements.',
      },
      {
        type: 'p',
        text: 'The output is a structured report: which rules passed, which failed, how many issues of each severity exist, and a numerical quality score that can be used as a project delivery gate. BIM coordinators use this to catch problems before they reach the CDE, the coordination model, or the client.',
      },
      {
        type: 'p',
        text: 'The term is sometimes used loosely to mean any tool that opens an IFC file. This guide uses the precise definition: a checker validates data against rules and produces a pass/fail verdict. A viewer shows geometry. Most professional workflows need both, but they are distinct functions.',
      },
      {
        type: 'callout',
        variant: 'tip',
        text: 'Expert tip: set up a checking policy document that defines the minimum Health Score and maximum tolerated errors for each delivery milestone. Share it with authoring teams at project start — not after the first failed submission.',
      },
      { type: 'h2', text: 'Why IFC Checking Matters Now' },
      {
        type: 'p',
        text: 'Three forces are making systematic IFC checking unavoidable in 2026:',
      },
      {
        type: 'ul',
        items: [
          'ISO 19650 adoption — information requirements now must be verified, not assumed. Many contracts include data delivery obligations with measurable acceptance criteria.',
          'Open BIM workflows — as projects exchange IFC between authoring tools and disciplines, accumulated quality debt compounds. A wall assembled from four different authoring tools has four different naming conventions unless checked at each handoff.',
          'FM handover pressure — building owners receiving digital twins expect property data that actually matches the installed asset. Systematic checking at design and construction stages is the only way to guarantee this.',
        ],
      },
      { type: 'h2', text: 'Three Levels of IFC Model Checking' },
      {
        type: 'p',
        text: 'IFC validation is not a single pass/fail test. It operates at three distinct levels, each catching a different class of problem:',
      },
      {
        type: 'table',
        headers: ['Level', 'What it checks', 'What it catches', 'Tools that support it'],
        rows: [
          ['L1 — Schema', 'EXPRESS schema, entity/attribute types, required fields', 'Corrupted files, wrong IFC version, invalid entity references', 'Any serious IFC tool'],
          ['L2 — Quality', '44 quality rules: GUIDs, hierarchy, names, geometry, properties', 'Duplicate GUIDs, missing storeys, empty names, broken geometry', 'IFC Viewer Online, Solibri, BIMcollab Zoom'],
          ['L3 — Requirements (IDS)', 'Project-specific property, classification, material rules', 'Missing fire ratings, wrong classification codes, absent EIR metadata', 'IFC Viewer Online, buildingSMART Validator'],
        ],
        caption: 'The three levels build on each other: a file must pass L1 before L2 makes sense, and L2 before L3.',
      },
      {
        type: 'callout',
        variant: 'warning',
        text: 'Warning: many tools label L1 schema validation as "IFC checking." That is necessary but not sufficient. A file can be schema-valid and still have hundreds of quality problems that will derail coordination and FM handover.',
      },
      { type: 'h3', text: 'Level 1: Schema and EXPRESS Validation' },
      {
        type: 'p',
        text: 'The IFC standard is defined in EXPRESS, a formal data modelling language. An L1 checker verifies that every entity in the file matches its EXPRESS definition: required attributes are present, values are the right type, enumeration values are valid, and referential integrity is maintained. This is the minimum bar — a file that fails L1 cannot be processed reliably by any downstream tool.',
      },
      { type: 'h3', text: 'Level 2: Quality Rule Validation' },
      {
        type: 'p',
        text: 'L2 checking applies 44 rules derived from industry best practice, buildingSMART guidance, and common failure modes observed in real project delivery. These rules cover six domains:',
      },
      {
        type: 'feature-grid',
        items: [
          { icon: '🔑', title: 'Identity', body: 'Every element has a unique, spec-compliant GUID. Duplicate GUIDs break CDE version tracking, clash detection, and BCF coordination.' },
          { icon: '🏗️', title: 'Spatial Hierarchy', body: 'All building elements are assigned to a storey; all storeys are in a building; the building is in a site. Broken hierarchy causes elements to disappear in coordination tools.' },
          { icon: '📋', title: 'Property Sets', body: 'Standard Psets (Pset_WallCommon, Pset_BeamCommon, etc.) are present and populated. Missing Psets break quantity takeoff and FM handover.' },
          { icon: '📐', title: 'Geometry', body: 'Solid geometry closes, Boolean operations resolve, and elements have non-zero volume. Broken geometry causes errors in model review and 4D/5D simulation.' },
          { icon: '🏷️', title: 'Classification', body: 'Elements carry classification codes (Uniclass, OmniClass, NBS) where required by the EIR. Missing classifications break procurement and FM asset registers.' },
          { icon: '🔗', title: 'Relationships', body: 'IfcRelContainedInSpatialStructure, IfcRelAggregates, and type-instance relationships are correctly formed. Broken relationships corrupt the spatial tree.' },
        ],
      },
      { type: 'h3', text: 'Level 3: IDS Validation' },
      {
        type: 'p',
        text: ['IDS (Information Delivery Specification) is the buildingSMART standard for defining exactly what data a model must contain at a given project stage. An IDS file specifies required entities, attributes, property sets, property values, classifications, and materials — and the checker verifies whether each element in the model satisfies those specifications. IDS 1.0 was ratified in 2024 and is increasingly referenced in contracts and EIRs. See the ', { text: 'full IDS implementation guide', to: 'ifc-model-checker-guide' }, ' for details on the six facets.'],
      },
      { type: 'h2', text: 'The Health Score: A Single Number for Model Quality' },
      {
        type: 'p',
        text: 'A rule-by-rule report is essential for fixing issues, but it is impractical as a delivery gate. The Health Score condenses 44 rules into a single 0–100 number using severity-weighted logarithmic penalties: errors (blocking issues) carry 3× the weight of warnings. This means a model with two severe errors scores significantly lower than one with dozens of minor warnings.',
      },
      {
        type: 'table',
        headers: ['Score Range', 'Grade', 'Meaning', 'Action'],
        rows: [
          ['90–100', 'Excellent', 'Delivery-ready model with minimal or no issues', 'Approve for CDE upload'],
          ['75–89', 'Good', 'Minor issues present; acceptable for most coordination stages', 'Fix before formal delivery'],
          ['50–74', 'Fair', 'Multiple issues requiring remediation before delivery', 'Return to authoring team'],
          ['25–49', 'Poor', 'Significant data quality problems across multiple rule categories', 'Mandatory remediation'],
          ['0–24', 'Critical', 'Fundamental structural or data problems; model unusable for coordination', 'Do not accept'],
        ],
        caption: 'Health Score bands and recommended BIM coordinator actions at each gate.',
      },
      {
        type: 'callout',
        variant: 'tip',
        text: 'Expert tip: use 75 as the minimum Health Score for informal coordination and 90 as the bar for formal delivery to the client. Codify these thresholds in your BEP (BIM Execution Plan) so authoring teams know the target before they start modelling.',
      },
      { type: 'h2', text: 'The Business Case for Systematic Checking' },
      {
        type: 'feature-grid',
        items: [
          { icon: '⚡', title: 'Faster coordination', body: 'Pre-screening models for L2 errors before clash detection eliminates false clashes caused by broken geometry and hierarchy. Coordination meetings become productive rather than remedial.' },
          { icon: '💰', title: 'Accurate quantity takeoff', body: 'QS tools depend on correct Psets and classifications. A model that passes L2 checking produces reliable material quantities; one that does not requires manual correction before every BOQ update.' },
          { icon: '🔒', title: 'Contract compliance', body: 'ISO 19650 information requirements carry contractual weight in an increasing number of projects. A checking audit trail demonstrates compliance and protects against disputes about data quality at handover.' },
          { icon: '🏢', title: 'FM handover confidence', body: 'Asset management systems ingest property data from IFC. A model with complete Psets, correct classifications, and valid GUIDs populates the CAFM automatically. One without requires expensive manual data entry.' },
        ],
      },
      { type: 'h2', text: 'IFC Checking in an ISO 19650 Workflow' },
      {
        type: 'p',
        text: 'ISO 19650 defines information delivery milestones (IDMs) and information requirements (EIRs, AIRs). IFC model checking maps onto this framework at three points:',
      },
      {
        type: 'code',
        lang: 'text',
        text: `Authoring tool (Revit / ArchiCAD / Tekla)
        │
        ▼ IFC export
[L1 Schema check] ──fail──▶ Return to author
        │ pass
        ▼
[L2 Quality check (44 rules)] ──fail──▶ Return to author with error report
        │ pass (Health Score ≥ threshold)
        ▼
[L3 IDS check] ──fail──▶ Return to author with IDS non-conformances
        │ pass
        ▼
CDE upload (approved for coordination)
        │
        ▼
Clash detection / coordination
        │
        ▼
[Pre-submission L2+L3 recheck] ──fail──▶ Fix before submission
        │ pass
        ▼
Client / FM handover`,
      },
      {
        type: 'callout',
        variant: 'info',
        text: 'ISO 19650-2 clause 5.6 requires information to be reviewed and approved before publication to the CDE. Systematic L1+L2+L3 checking satisfies this requirement with an auditable, repeatable process rather than a manual review that depends on individual attention.',
      },
      { type: 'h2', text: 'When to Check: Six Project Checkpoints' },
      {
        type: 'feature-grid',
        items: [
          { icon: '1️⃣', title: 'Before CDE upload', body: 'Prevent non-conforming models from entering the shared environment. L1+L2 at minimum; L3 if an IDS has been issued.' },
          { icon: '2️⃣', title: 'At each design stage gate', body: 'Check all discipline models before combining into the coordination model. Structural, architectural, and MEP each checked independently.' },
          { icon: '3️⃣', title: 'Before clash detection', body: 'Broken geometry and hierarchy cause false clashes. A clean L2 report before the clash session saves hours of investigation.' },
          { icon: '4️⃣', title: 'Before client submission', body: 'Formal IDS validation with a recorded Health Score. Archive the checking report with the model as evidence of conformance.' },
          { icon: '5️⃣', title: 'After significant revisions', body: 'Any revision that touches spatial structure, naming, or property data should trigger a recheck. Automated checking on every export is achievable with CLI or API workflows.' },
          { icon: '6️⃣', title: 'At FM handover', body: 'Final LOI check: are all required properties populated? Are classification codes correct? Is the GUID set stable?' },
        ],
      },
      { type: 'h2', text: 'Technical Brief: How Checking Works Under the Hood' },
      {
        type: 'p',
        text: 'Modern browser-based IFC checkers use WebAssembly to run the IFC parsing engine and rule evaluation logic directly in the browser, with no server round-trip. The IFC file is parsed into an in-memory schema graph; each rule is evaluated as a query against that graph. The process for a typical architectural model (50–200 MB) takes 15–60 seconds and produces a structured results object that drives the report UI.',
      },
      {
        type: 'p',
        text: 'For IDS validation, the checker loads the IDS XML file, compiles each specification into a set of element filter criteria and property assertions, then evaluates every applicable element in the model against those assertions. The result is a per-element, per-specification conformance record with pass/fail/not-applicable status.',
      },
      { type: 'h2', text: 'Choosing the Right Checker for Your Workflow' },
      {
        type: 'p',
        text: ['The right tool depends on your coordination role, project scale, and budget. For a detailed head-to-head, see the ', { text: 'best IFC model checkers comparison', to: 'best-ifc-model-checkers-2026' }, '. For the conceptual distinction between checking and viewing, see ', { text: 'IFC model checker vs IFC viewer', to: 'ifc-model-checker-vs-ifc-viewer' }, '. The short version:'],
      },
      {
        type: 'table',
        headers: ['Scenario', 'Recommended approach', 'Why'],
        rows: [
          ['Individual BIM author checking own export', 'Browser-based checker (IFC Viewer Online)', 'Instant, free, no upload, immediate feedback'],
          ['BIM coordinator reviewing incoming models', 'Browser-based L2 + IDS check against project IDS', 'Full three-level validation, no toolchain dependency'],
          ['Large multi-discipline project with Solibri rule sets', 'Solibri + browser-based pre-screening', 'Pre-screening reduces Solibri queue; Solibri adds project-specific rules'],
          ['Automated CI/CD quality gate on model revisions', 'API-driven checker or CLI wrapper', 'Triggerable without human interaction; integrates with CDE workflows'],
          ['Client requiring certified report', 'Tool with exportable HTML/PDF report and JSON audit trail', 'Defensible evidence of conformance at handover'],
        ],
        caption: 'Scenario-based tool selection guide for IFC checking.',
      },
      { type: 'h2', text: 'Running Your First IFC Check: Step by Step' },
      {
        type: 'ol',
        items: [
          'Export IFC from your authoring tool. Use IFC4 (IFC2x3 if required by the project). Keep the export settings consistent with your project BEP.',
          'Open the IFC file in IFC Viewer Online. No account, no upload — drag the file into the browser.',
          'Navigate to the Validation panel. The L1 schema check runs automatically; the L2 quality check starts immediately. Review the Health Score and the issue breakdown by severity and category.',
          'Export the report as JSON or HTML for the project record. If an IDS file has been issued for your project, upload it in the IDS panel to run the L3 check.',
        ],
      },
      {
        type: 'ifc-demo',
        modelId: 'duplex-architecture',
        title: 'Try IFC Checking Now',
        description: 'This IFC2x3 architectural model demonstrates the three-level checking process. Navigate to the Validation panel to see the Health Score and full rule breakdown.',
        schema: 'IFC2x3',
        size: '2.4 MB',
        showProperties: true,
        allowFullscreen: true,
        height: 400,
        variant: 'inline',
      },
      {
        type: 'pull-quote',
        text: 'Catching a duplicate GUID during design costs minutes. Catching it at FM handover costs days. Systematic checking is not overhead — it is the cheapest quality control available.',
        cite: 'BIM coordination principle',
      },
      {
        type: 'feature-grid',
        items: [
          { icon: '✅', title: 'Three-level validation', body: 'Schema → Quality (44 rules) → IDS requirements. Each level builds on the previous.' },
          { icon: '📊', title: 'Health Score as a gate', body: '0–100 severity-weighted score. Set 75 for coordination, 90 for formal delivery in your BEP.' },
          { icon: '🔒', title: 'Check before upload', body: 'Browser-local checking means no NDA risk, instant feedback, and zero toolchain dependency.' },
          { icon: '📋', title: 'ISO 19650 alignment', body: 'Checking at each IDM satisfies the review-and-approve obligation in clause 5.6 with an auditable trail.' },
        ],
      },
      {
        type: 'p',
        text: [
          'Continue reading: what makes a checker different from a viewer — tool categories explained in ', { text: 'IFC model checker vs IFC viewer', to: 'ifc-model-checker-vs-ifc-viewer' }, '. How eight leading tools compare on checking depth and workflow fit — ', { text: 'best IFC model checkers in 2026', to: 'best-ifc-model-checkers-2026' }, '. A practical step-by-step checking workflow for BIM coordinators — ', { text: 'how to check an IFC model before delivery', to: 'how-to-check-ifc-model-before-delivery' }, '. The ten most common IFC errors and how to detect each one — ', { text: '10 common IFC model errors', to: 'common-ifc-model-errors' }, '. Health Score calculation and use as a quality gate — ', { text: 'IFC Health Score guide', to: 'ifc-health-score' }, '.',
        ],
      },
    ],
  },

  // ── Article #8: IFC Model Checker vs IFC Viewer ───────────────────────────
  {
    slug: 'ifc-model-checker-vs-ifc-viewer',
    title: "IFC Model Checker vs IFC Viewer: What's the Difference?",
    excerpt: 'Checkers validate data against rules and produce a quality score. Viewers render geometry and let you browse properties. Here is how to know which one your workflow needs — and when you need both.',
    date: '2026-06-30',
    author: 'IFC Viewer Online',
    category: 'Validation',
    categorySlug: 'validation',
    readTimeMin: 16,
    keywords: ['IFC model checker', 'IFC viewer', 'IFC validator', 'IFC checking vs viewing', 'BIM software comparison', 'IDS tool', 'IFC quality check'],
    faqs: [
      { q: 'What is the difference between an IFC viewer and an IFC model checker?', a: 'An IFC viewer renders 3D geometry and allows property browsing. An IFC model checker validates the data structure against quality rules and project requirements, producing a pass/fail report with a numerical quality score. A viewer shows you what the model looks like; a checker tells you whether the data is correct.' },
      { q: 'Do I need both an IFC viewer and an IFC model checker?', a: 'In most BIM workflows, yes. You need a viewer to inspect geometry, coordinate visually, and navigate the model. You need a checker to validate data quality before CDE upload, coordination, and handover. Many tools combine both functions, so the choice is often about which combined tool fits your workflow best.' },
      { q: 'What is an IFC validator?', a: 'Validator is often used interchangeably with checker, but in a strict sense it refers to schema and EXPRESS validation (Level 1 only) — confirming the file is a valid IFC. A full checker adds quality rule validation (Level 2) and IDS requirement validation (Level 3). The buildingSMART Validation Service is a validator in the strict sense.' },
      { q: 'Which IFC tools combine both viewing and checking?', a: 'IFC Viewer Online, Solibri, BIMcollab Zoom, and BIMVision all combine viewing with some level of checking. The depth of checking varies significantly: IFC Viewer Online includes L1+L2+L3 (IDS); Solibri has deep proprietary rule sets; BIMVision offers basic property checking; BIMcollab focuses on BCF coordination.' },
    ],
    content: [
      {
        type: 'callout',
        variant: 'info',
        text: 'TL;DR — A viewer renders geometry and lets you browse properties. A checker validates data against rules and produces a quality score. Your workflow likely needs both. This article explains the four tool categories (viewer, checker, validator, IDS tool) and helps you decide which combination fits your project stage.',
      },
      { type: 'h2', text: 'The Core Distinction' },
      {
        type: 'p',
        text: 'The confusion between viewers and checkers comes from the fact that many tools do both — you can view a model and check it in the same interface. But the underlying functions are completely different:',
      },
      {
        type: 'comparison',
        left: {
          label: 'IFC Viewer',
          color: 'neutral',
          items: [
            'Renders 3D geometry in browser or desktop',
            'Click elements to browse property sets',
            'Supports section cuts, measurements, annotations',
            'Used for visual coordination and design review',
            'Output: visual inspection, BCF markups, comments',
            'Cannot detect duplicate GUIDs',
            'Cannot verify property set completeness',
            'Cannot validate IDS requirements',
          ],
        },
        right: {
          label: 'IFC Model Checker',
          color: 'accent',
          items: [
            'Parses the IFC data graph and validates against rules',
            'Checks 44+ quality rules: GUIDs, hierarchy, Psets, geometry',
            'Validates IDS 1.0 requirements against project specifications',
            'Produces a Health Score (0–100) for delivery gating',
            'Output: structured report, JSON/CSV export, audit trail',
            'Identifies every duplicate GUID in the file',
            'Verifies Pset completeness across all element types',
            'Validates IDS facets: entity, attribute, property, classification',
          ],
        },
      },
      { type: 'h2', text: 'Four Tool Categories in the IFC Ecosystem' },
      {
        type: 'p',
        text: 'The IFC tooling landscape uses four distinct terms, often interchangeably. Here is what each one means precisely:',
      },
      {
        type: 'table',
        headers: ['Category', 'What it does', 'What it does NOT do', 'Examples'],
        rows: [
          ['IFC Viewer', 'Renders 3D geometry, property browser, section cuts, measurements', 'Quality rule checking, Health Score, IDS validation', 'Autodesk Viewer, Trimble Connect, Dalux, usBIM.viewer+'],
          ['IFC Validator (strict)', 'Schema and EXPRESS validation (Level 1 only)', 'Quality rules (L2), IDS requirements (L3)', 'buildingSMART Validation Service, IfcOpenShell ifcvalidate'],
          ['IFC Model Checker', 'L1 + L2 quality rules (44 rules, Health Score)', 'IDS unless explicitly included', 'IFC Viewer Online (L1+L2+L3), Solibri, BIMcollab Zoom'],
          ['IDS Tool', 'Validates model against IDS 1.0 specification files', 'General quality rules beyond IDS scope', 'IFC Viewer Online, buildingSMART Validator, IfcTester'],
        ],
        caption: 'Four IFC tool categories — what they check and what they do not.',
      },
      { type: 'h2', text: 'When You Need a Viewer' },
      {
        type: 'ul',
        items: [
          'Visual coordination and clash review meetings',
          'Client presentations and design review',
          'On-site model access for contractors',
          'Creating BCF markups for RFIs and design comments',
          'Checking geometric fit and spatial relationships visually',
          'Property browsing during design development',
        ],
      },
      { type: 'h2', text: 'When You Need a Checker' },
      {
        type: 'ul',
        items: [
          'Before uploading a model to the CDE',
          'At each design stage gate in an ISO 19650 workflow',
          'Before combining discipline models for clash detection',
          'Before formal submission to the client or FM',
          'When receiving a model from a subcontractor or consultant',
          'When validating against a project IDS specification',
        ],
      },
      { type: 'h2', text: 'Decision Tree: Which Tool Do You Need?' },
      {
        type: 'code',
        lang: 'text',
        text: `What is your goal?
│
├─ See the model geometry / navigate 3D
│   └─ You need a VIEWER
│       ├─ Free, browser-based: IFC Viewer Online, Autodesk Viewer
│       └─ Desktop: BIMVision, Trimble Connect desktop
│
├─ Confirm the file is valid IFC (schema)
│   └─ You need a VALIDATOR (L1)
│       ├─ buildingSMART Validation Service (online)
│       └─ IFC Viewer Online (L1 runs automatically on open)
│
├─ Confirm the model is quality-ready for delivery
│   └─ You need a CHECKER (L1 + L2)
│       ├─ IFC Viewer Online (browser-local, free, Health Score)
│       └─ Solibri (deeper rule sets, subscription)
│
├─ Validate against project-specific data requirements
│   └─ You need an IDS TOOL (L3)
│       ├─ IFC Viewer Online (full IDS 1.0 support)
│       └─ buildingSMART Validation Service
│
└─ All of the above in one workflow
    └─ IFC Viewer Online (viewer + L1 + L2 + L3 + Health Score)`,
      },
      { type: 'h2', text: 'Tools That Combine Both Functions' },
      {
        type: 'table',
        headers: ['Tool', 'Viewing', 'L1 Schema', 'L2 Quality (44 rules)', 'L3 IDS 1.0', 'Health Score', 'Cost'],
        rows: [
          ['IFC Viewer Online', '✓ Full 3D', '✓', '✓ 44 rules', '✓ Full IDS 1.0', '✓ 0–100', 'Free'],
          ['Solibri', '✓ Full 3D', '✓', '✓ Deep proprietary rules', 'Partial (via MVD)', '✗', '€99–€2,700/yr'],
          ['BIMcollab Zoom', '✓ Full 3D', '✓', 'Basic', '✗', '✗', '€25–€45/user/mo'],
          ['BIMVision', '✓ Full 3D', '✓', 'Basic Pset check', '✗', '✗', 'Free / €30/mo'],
          ['buildingSMART Validator', '✗ No viewer', '✓', 'Limited', '✓ IDS focus', '✗', 'Free'],
          ['Autodesk Viewer', '✓ Full 3D', '✓ via upload', '✗', '✗', '✗', 'Free (Autodesk account)'],
          ['Trimble Connect', '✓ Full 3D', '✓ via upload', '✗', '✗', '✗', 'Free tier / subscription'],
          ['Dalux', '✓ Full 3D', '✓', '✗', '✗', '✗', 'Custom pricing'],
        ],
        caption: 'Combined viewer+checker tools: checking depth at a glance.',
      },
      {
        type: 'callout',
        variant: 'tip',
        text: 'Expert tip: cloud-based viewers (Autodesk, Trimble, Dalux) require uploading your IFC file to a server. For confidential projects, use a browser-local tool like IFC Viewer Online where the file never leaves your machine — verifiable in DevTools Network tab.',
      },
      { type: 'h2', text: 'Common Misconceptions' },
      {
        type: 'feature-grid',
        items: [
          { icon: '❌', title: '"My viewer validates IFC"', body: 'If a viewer can open the file without crashing, it does not mean the file is valid. Viewers are tolerant — they skip what they cannot render. A checker is strict by design.' },
          { icon: '❌', title: '"Schema validation is enough"', body: 'L1 schema validation confirms the file structure is parseable. A schema-valid file can still have hundreds of duplicate GUIDs, missing Psets, and broken hierarchy.' },
          { icon: '❌', title: '"IDS covers quality rules"', body: 'IDS validates project-specific requirements. It does not check general quality: whether all elements have valid GUIDs, storeys are correctly structured, or geometry is sound.' },
          { icon: '❌', title: '"Any score makes it a checker"', body: 'Some tools show a completeness percentage based on a sample. A genuine L2 checker applies the same 44 rules to every element in the file with severity-weighted penalties.' },
        ],
      },
      { type: 'h2', text: 'Workflow Integration: Viewer and Checker Together' },
      {
        type: 'ol',
        items: [
          'Author exports IFC → checker runs L1+L2+L3 → errors returned to author for fixing.',
          'Fixed model re-exported → checker confirms Health Score ≥ threshold → model admitted to CDE.',
          'In the CDE, coordination team opens model in viewer → visual review, BCF markups, clash detection.',
          'Before formal submission → checker re-run → report archived as conformance evidence.',
        ],
      },
      {
        type: 'pull-quote',
        text: 'A viewer tells you what the model looks like. A checker tells you whether the data is correct. Both questions matter — at different points in the delivery workflow.',
        cite: 'Open BIM coordination principle',
      },
      {
        type: 'p',
        text: ['For a detailed step-by-step version of this workflow, see ', { text: 'how to check an IFC model before delivery', to: 'how-to-check-ifc-model-before-delivery' }, '. For a comparison of all major checking tools, see ', { text: 'best IFC model checkers in 2026', to: 'best-ifc-model-checkers-2026' }, '. For the complete overview of validation levels and Health Score, see the ', { text: 'IFC model checker complete guide', to: 'ifc-model-checker' }, '.'],
      },
    ],
  },

  // ── Article #9: Best IFC Model Checkers in 2026 ───────────────────────────
  {
    slug: 'best-ifc-model-checkers-2026',
    title: 'Best IFC Model Checkers in 2026: Honest Comparison',
    excerpt: 'An independent comparison of eight tools on actual checking depth — not just what their marketing says. Includes checking capability table, workflow fit guide, and honest assessments of what each tool does and does not do.',
    date: '2026-06-30',
    author: 'IFC Viewer Online',
    category: 'Tool Guides',
    categorySlug: 'tool-guides',
    readTimeMin: 22,
    keywords: ['best IFC model checker', 'IFC checker comparison', 'IFC validation tools', 'Solibri alternative', 'BIM quality check software', 'IDS validation tool', 'IFC Health Score tool'],
    faqs: [
      { q: 'What is the best free IFC model checker?', a: 'IFC Viewer Online is the most complete free IFC model checker available: it runs all three validation levels (L1 schema, L2 quality rules with 44 checks and Health Score, L3 IDS 1.0) entirely in the browser with no file upload. The buildingSMART Validation Service is free and strong on IDS but lacks L2 quality rules and has no viewer.' },
      { q: 'Is Solibri worth the cost for IFC model checking?', a: 'Solibri is worth the cost on large, complex multi-discipline projects where you need deep custom rule sets, proprietary clash management, and a mature coordination workflow. For pre-screening, ad-hoc checking, and IDS validation, a free browser-based tool is more practical for most BIM coordinators.' },
      { q: 'Which IFC checkers support IDS 1.0 validation?', a: 'As of 2026, IFC Viewer Online and the buildingSMART Validation Service are the primary tools supporting the full IDS 1.0 specification. Solibri has partial support via MVD checking but does not use the IDS 1.0 XML format directly.' },
      { q: 'Do Autodesk Viewer and Trimble Connect check IFC models?', a: 'No. Autodesk Viewer and Trimble Connect are viewers — they render geometry and allow property browsing but do not validate quality rules, check Pset completeness, detect duplicate GUIDs, or produce a Health Score. They perform L1 schema validation implicitly (they reject files they cannot parse) but nothing beyond that.' },
    ],
    content: [
      {
        type: 'callout',
        variant: 'info',
        text: 'TL;DR — Only three of the eight tools reviewed here perform meaningful IFC model checking beyond schema validation: IFC Viewer Online (L1+L2+L3, free), Solibri (L1+L2 deep proprietary rules, subscription), and buildingSMART Validation Service (L1+L3 IDS, free). The others are viewers that happen to open IFC files. This matters when choosing a tool for delivery quality gates.',
      },
      {
        type: 'callout',
        variant: 'warning',
        text: 'Honest disclosure: this comparison is published by IFC Viewer Online. We have tried to be accurate about our own limitations and fair about competitor strengths. Where a competing tool genuinely does something better, we say so. Verify claims that matter to your workflow by testing with your own IFC files.',
      },
      { type: 'h2', text: 'What Makes an IFC Checker a Real Checker?' },
      {
        type: 'p',
        text: 'Before comparing tools, it is worth being precise about what "checking" means. The three validation levels determine whether a tool is a checker or a viewer with checking marketing:',
      },
      {
        type: 'ul',
        items: [
          'L1 (schema) — every tool that successfully opens an IFC file implicitly performs L1 validation. This is not a differentiator.',
          'L2 (quality rules) — 44 rules covering GUIDs, spatial hierarchy, Pset completeness, geometry, naming, and relationships. This is the real checker function.',
          'L3 (IDS) — validates the model against a project-specific IDS 1.0 specification. This is the requirements compliance function.',
        ],
      },
      {
        type: 'p',
        text: 'A tool that does L1 only and calls itself a checker is misleading you. The rest of this article uses L1/L2/L3 clearly for each tool.',
      },
      { type: 'h2', text: 'The Eight Tools: Checking Depth Overview' },
      {
        type: 'table',
        headers: ['Tool', 'L1 Schema', 'L2 Quality Rules', 'L3 IDS 1.0', 'Health Score', 'Viewer', 'File stays local', 'Cost'],
        rows: [
          ['IFC Viewer Online', '✓', '✓ 44 rules', '✓ Full IDS 1.0', '✓ 0–100', '✓', '✓ Browser-local', 'Free'],
          ['Solibri', '✓', '✓ Deep proprietary', 'Partial (MVD)', '✗', '✓', '✓ Desktop', '€99–€2,700/yr'],
          ['BIMVision', '✓', '✗ Basic only', '✗', '✗', '✓', '✓ Desktop', 'Free / €30/mo'],
          ['Trimble Connect', '✓ implicit', '✗', '✗', '✗', '✓', '✗ Cloud upload', 'Free tier / subscription'],
          ['Dalux', '✓ implicit', '✗', '✗', '✗', '✓', '✗ Cloud upload', 'Custom pricing'],
          ['Autodesk Viewer', '✓ implicit', '✗', '✗', '✗', '✓', '✗ Cloud upload', 'Free (Autodesk account)'],
          ['That Open Viewer', '✓', '✗ (roadmap)', '✗', '✗', '✓', '✓ Browser-local', 'Free / OSS'],
          ['buildingSMART Validator', '✓', 'Limited', '✓ IDS focus', '✗', '✗', '✗ Upload', 'Free'],
        ],
        caption: 'Checking depth comparison across eight tools. L2 quality rules and L3 IDS are the meaningful differentiators.',
      },
      { type: 'h2', text: '1. IFC Viewer Online' },
      {
        type: 'p',
        text: 'IFC Viewer Online is a browser-based tool that combines a full 3D viewer with all three validation levels. Files are processed locally using WebAssembly — nothing is uploaded to a server. The L2 engine applies 44 quality rules and produces a Health Score (0–100) that can be used directly as a delivery gate. IDS 1.0 is fully supported across all six facets.',
      },
      {
        type: 'comparison',
        left: {
          label: 'Strengths',
          color: 'accent',
          items: [
            'Full L1 + L2 (44 rules) + L3 (IDS 1.0) in one tool',
            'Health Score (0–100) for delivery gating',
            'Browser-local: zero upload, GDPR-compliant, works offline',
            'Free with no account required',
            'Export report as JSON, CSV, or HTML',
            'IDS 1.0 validated against 100 official bSI testcases',
          ],
        },
        right: {
          label: 'Limitations',
          color: 'neutral',
          items: [
            'No proprietary rule customisation (unlike Solibri)',
            'No native BCF coordination workflow (BCF export only)',
            'No federated multi-model clash detection',
            'Browser memory limits large files (>500 MB may struggle)',
          ],
        },
      },
      {
        type: 'callout',
        variant: 'tip',
        text: 'Best for: BIM coordinators who need immediate, free, privacy-safe checking without a subscription. Also ideal as a pre-screening step before Solibri on large projects — only models with Health Score ≥ 75 enter the Solibri queue.',
      },
      { type: 'h2', text: '2. Solibri' },
      {
        type: 'p',
        text: 'Solibri is the market leader in deep IFC rule checking. Its rule engine allows BIM managers to define project-specific checks beyond the standard quality rules — covering coordination, regulatory compliance, and spatial validation at a level no free tool currently matches. The learning curve is steep and the cost significant, but for large infrastructure or commercial projects, the depth is genuine.',
      },
      {
        type: 'comparison',
        left: {
          label: 'Strengths',
          color: 'accent',
          items: [
            'Deepest proprietary rule engine available',
            'Customisable rule sets for project-specific compliance',
            'Mature coordination workflow with BCF and clash management',
            'Strong BIM manager tooling for enterprise projects',
            'Extensive rule library built over 20+ years',
          ],
        },
        right: {
          label: 'Limitations',
          color: 'neutral',
          items: [
            'No IDS 1.0 XML support (uses MVD, not the IDS standard)',
            'No Health Score — results require manual interpretation',
            'Expensive: €99/mo Solibri Anywhere, €2,700+/yr full licence',
            'Desktop-only; no browser-based option',
            'Steep learning curve; effective use requires training',
          ],
        },
      },
      {
        type: 'callout',
        variant: 'tip',
        text: 'Best for: BIM managers on large multi-discipline projects where custom rule sets and coordination workflow integration justify the cost. Not the right choice for individual BIM authors or occasional checking.',
      },
      { type: 'h2', text: '3. BIMVision' },
      {
        type: 'p',
        text: 'BIMVision is a capable free IFC viewer from Datacomp that has been widely used in the Central and Eastern European market. It includes basic property browsing and some Pset inspection capability, but it is not a model checker in the L2/L3 sense. There is no quality rule engine, no Health Score, and no IDS validation. The paid version adds features like BCF and IFC federation.',
      },
      {
        type: 'comparison',
        left: {
          label: 'Strengths',
          color: 'accent',
          items: [
            'Good free desktop IFC viewer',
            'Property inspection and Pset browsing',
            'Federation of multiple IFC files',
            'BCF support in paid version',
          ],
        },
        right: {
          label: 'Limitations',
          color: 'neutral',
          items: [
            'No L2 quality rules — not a model checker',
            'No Health Score or delivery gating',
            'No IDS 1.0 validation',
            'Windows desktop only — no browser version',
          ],
        },
      },
      { type: 'h2', text: '4. Trimble Connect' },
      {
        type: 'p',
        text: 'Trimble Connect is a CDE platform and model viewer, not a model checker. It accepts IFC uploads, renders them in 3D, and supports clash detection as part of the coordination workflow. It does not apply quality rules to the IFC data layer and produces no quality report. It is excellent for what it is: a cloud-hosted coordination and document management platform.',
      },
      {
        type: 'callout',
        variant: 'warning',
        text: 'Trimble Connect is a CDE viewer, not a checker. If your workflow involves Trimble Connect, you still need a dedicated checker before the CDE upload step to validate model quality.',
      },
      { type: 'h2', text: '5. Dalux' },
      {
        type: 'p',
        text: 'Dalux is a strong construction platform for on-site use with good IFC viewing capabilities on mobile and desktop. Like Trimble Connect, it is not a model checker — there is no L2 quality rule engine. Its strength is in construction phase workflows: site checklists, RFIs, and document management. The IFC viewing component is excellent for site personnel who need to access the model without a BIM specialist present.',
      },
      { type: 'h2', text: '6. Autodesk Viewer (Autodesk Docs)' },
      {
        type: 'p',
        text: 'Autodesk Viewer (embedded in Autodesk Docs / BIM 360) renders IFC files uploaded to the Autodesk cloud. It provides good property browsing and supports most IFC4 entities. There is no quality rule checking, no Health Score, and no IDS support. Files must be uploaded to Autodesk servers — a consideration for confidential projects. As a viewer it is polished; as a checker it does not exist.',
      },
      { type: 'h2', text: '7. That Open Viewer (ThatOpenCompany)' },
      {
        type: 'p',
        text: 'That Open Viewer is an open-source browser-based IFC viewer built on the ThatOpen engine (formerly IFC.js). It is actively developed and has growing community adoption. As of mid-2026, checking features are in the roadmap but not implemented — it is a viewer with good developer extensibility. Worth watching for teams with development resources who want to build custom checking on top of the OSS engine.',
      },
      { type: 'h2', text: '8. buildingSMART Validation Service' },
      {
        type: 'p',
        text: 'The buildingSMART Validation Service is the official online validator maintained by the IFC standard body. It has authoritative L1 schema validation and solid IDS 1.0 support. What it lacks is L2 quality rules, a Health Score, and a 3D viewer. It is the right tool for formally certifying IDS conformance (particularly useful when submitting to public sector clients who require bSI-certified validation), but not for day-to-day quality checking.',
      },
      {
        type: 'comparison',
        left: {
          label: 'Strengths',
          color: 'accent',
          items: [
            'Authoritative L1 schema validation from the standard body',
            'Full IDS 1.0 validation support',
            'Free, no account required',
            'Output accepted as formal conformance evidence in some contracts',
          ],
        },
        right: {
          label: 'Limitations',
          color: 'neutral',
          items: [
            'No L2 quality rules — no Health Score',
            'No 3D viewer — data-only output',
            'Requires file upload — not suitable for confidential data',
            'Processing time for large files can be slow',
          ],
        },
      },
      { type: 'h2', text: 'Workflow Fit: Which Tool for Which Scenario?' },
      {
        type: 'table',
        headers: ['Scenario', 'Best tool', 'Why'],
        rows: [
          ['Author checking own export before CDE upload', 'IFC Viewer Online', 'Instant, free, browser-local, full L2 + Health Score'],
          ['BIM coordinator pre-screening incoming models', 'IFC Viewer Online', 'Same reasons; plus IDS validation if project IDS exists'],
          ['Large project with complex custom rule sets', 'Solibri', 'Proprietary rule engine depth not matched by free tools'],
          ['Pre-screening before Solibri queue', 'IFC Viewer Online', 'Only models with Health Score ≥ 75 enter Solibri — reduces review time'],
          ['Public sector IDS conformance certification', 'buildingSMART Validator + IFC Viewer Online', 'bSI validator for formal certificate; IFC Viewer Online for L2 quality'],
          ['Construction site model access', 'Dalux or Trimble Connect', 'Mobile-optimised viewers for on-site teams'],
          ['Autodesk-platform project coordination', 'Autodesk Docs + IFC Viewer Online', 'Autodesk Docs for coordination; IFC Viewer Online for checking before upload'],
          ['OSS project with development resources', 'That Open Viewer (customised)', 'Extensible engine for custom checking integration'],
        ],
        caption: 'Workflow-based tool selection guide.',
      },
      {
        type: 'callout',
        variant: 'tip',
        text: 'Expert tip: the most efficient enterprise workflow is not a single tool — it is IFC Viewer Online for author-side pre-screening (free, instant, zero friction), plus Solibri for coordinator-side deep checking on models that have already passed the Health Score threshold. The combination reduces Solibri licence costs by limiting deep-check time to quality-ready models only.',
      },
      { type: 'h2', text: 'Pricing Comparison' },
      {
        type: 'table',
        headers: ['Tool', 'Free tier', 'Paid tier', 'What paid adds'],
        rows: [
          ['IFC Viewer Online', 'Full features', '—', 'All features free'],
          ['Solibri', 'Solibri Anywhere (limited)', '€99/mo – €2,700+/yr', 'Full rule engine, custom rules, enterprise coordination'],
          ['BIMVision', 'Free viewer', '€30/mo', 'BCF, federation, advanced views'],
          ['Trimble Connect', 'Free (limited storage)', 'Custom', 'CDE storage, clash detection, project management'],
          ['Dalux', 'Contact sales', 'Custom', 'Construction platform, site checklist, RFI'],
          ['Autodesk Viewer', 'Free (Autodesk account)', 'BIM 360 / ACC subscription', 'Full CDE, clash, document management'],
          ['That Open Viewer', 'Free / OSS', 'Paid support', 'Community support, custom development'],
          ['buildingSMART Validator', 'Free', '—', 'Free for all'],
        ],
        caption: 'Pricing overview as of 2026. Verify current pricing directly with vendors.',
      },
      {
        type: 'pull-quote',
        text: 'Three of the eight tools reviewed here perform L2 quality checking. The other five are viewers. That distinction is what matters when you are setting a delivery quality gate.',
        cite: 'IFC Viewer Online editorial',
      },
      {
        type: 'p',
        text: ['For the conceptual framework behind checking levels, see the ', { text: 'IFC model checker complete guide', to: 'ifc-model-checker' }, '. For the distinction between checkers and viewers, see ', { text: 'IFC model checker vs IFC viewer', to: 'ifc-model-checker-vs-ifc-viewer' }, '. For a step-by-step checking workflow, see ', { text: 'how to check an IFC model before delivery', to: 'how-to-check-ifc-model-before-delivery' }, '. For the specific errors that L2 checking catches, see ', { text: '10 common IFC model errors', to: 'common-ifc-model-errors' }, '.'],
      },
    ],
  },

  // ── Article #10: How to Check an IFC Model Before Delivery ───────────────
  {
    slug: 'how-to-check-ifc-model-before-delivery',
    title: 'How to Check an IFC Model Before Delivery (Step-by-Step)',
    excerpt: 'A practical workflow for BIM coordinators: export, schema check, quality check, fix errors, IDS validation, archive the report. With checklists for each stage and ISO 19650 stage gate guidance.',
    date: '2026-06-30',
    author: 'IFC Viewer Online',
    category: 'Validation',
    categorySlug: 'validation',
    readTimeMin: 18,
    keywords: ['how to check IFC model', 'IFC model checking workflow', 'IFC delivery checklist', 'BIM coordinator workflow', 'IFC quality check before delivery', 'ISO 19650 IFC check', 'IDS validation workflow'],
    faqs: [
      { q: 'How do I check an IFC model before delivery?', a: 'The recommended workflow has four steps: (1) Export IFC from your authoring tool with consistent settings. (2) Run L1 schema validation to confirm the file is structurally valid. (3) Run L2 quality checking (44 rules) to get a Health Score — aim for 90+ for formal delivery. (4) Run L3 IDS validation if a project IDS file has been issued. Fix any failures, then re-run before uploading to the CDE or submitting to the client.' },
      { q: 'What Health Score should an IFC model have before delivery?', a: 'For formal delivery to a client or FM, aim for a Health Score of 90 or above. For internal coordination uploads to the CDE, 75 is a practical minimum. Models below 50 should be returned to the authoring team before any coordination use. These thresholds should be written into the project BEP so authors know them from day one.' },
      { q: 'What IFC export settings should I use for checking?', a: 'For Revit: use the NBS or Open BIM IFC exporter, not the built-in one. Set coordinate system to project coordinates. Enable all geometry types. Do not simplify or merge elements. Export property sets. For ArchiCAD: use the Coordination View or Design Transfer View profile. Always export with IFCGloballyUniqueId preservation enabled.' },
      { q: 'How long does IFC checking take?', a: 'Schema validation (L1) takes seconds. Quality rule checking (L2) for a typical architectural model (50–200 MB) takes 15–60 seconds in a browser-based tool. IDS validation (L3) adds a further 10–30 seconds depending on the number of IDS specifications and model size. The full three-level check should complete in under two minutes for most project models.' },
    ],
    content: [
      {
        type: 'callout',
        variant: 'info',
        text: 'TL;DR — Check your IFC in four steps before every delivery: export with correct settings, run L1 schema check, run L2 quality check (Health Score ≥ 90 for formal delivery), run L3 IDS check against your project specification. Fix, re-run, then upload. This article gives you the checklists and workflow diagrams to make this repeatable.',
      },
      { type: 'h2', text: 'Why a Checking Workflow Matters' },
      {
        type: 'p',
        text: 'Most IFC quality problems are introduced at the authoring tool level and discovered at the coordination or handover stage — often too late to fix without rework. A systematic pre-delivery checking workflow catches these problems at the cheapest point in the project lifecycle: before the model enters the CDE.',
      },
      {
        type: 'p',
        text: 'The workflow described here takes less than five minutes for a typical model and produces a checking report that serves as a conformance record. It can be run by individual BIM authors before every CDE upload, and by BIM coordinators as a gate check on incoming models.',
      },
      { type: 'h2', text: 'The Four-Step Checking Workflow' },
      {
        type: 'code',
        lang: 'text',
        text: `STEP 1: Export
Authoring tool → IFC export with correct settings
        │
        ▼
STEP 2: L1 Schema Check (< 5 seconds)
Is the file structurally valid IFC?
        │ fail → fix export settings or authoring tool issue
        │ pass
        ▼
STEP 3: L2 Quality Check (15–60 seconds)
44 rules: GUIDs, hierarchy, Psets, geometry, names
Health Score calculated (0–100)
        │ fail (score < 75) → return to author with error report
        │ pass
        ▼
STEP 4: L3 IDS Check (10–30 seconds, if IDS exists)
Validate against project IDS specification
        │ fail → return to author with IDS non-conformances
        │ pass
        ▼
Archive report → Upload to CDE`,
      },
      { type: 'h2', text: 'Step 1: Export with Correct Settings' },
      {
        type: 'p',
        text: 'Most IFC quality problems originate in the export, not the model. The authoring tool export settings determine whether the IFC file will contain correct GUIDs, complete property sets, and well-formed geometry.',
      },
      {
        type: 'table',
        headers: ['Authoring tool', 'Recommended export approach', 'Key settings to check'],
        rows: [
          ['Revit', 'Use NBS or Revit IFC exporter (not legacy built-in)', 'IFC version (IFC4 preferred), property sets, coordinate system, geometry types'],
          ['ArchiCAD', 'Use Coordination View 2.0 or Design Transfer View', 'GUID stability enabled, Psets included, storey structure preserved'],
          ['Tekla Structures', 'IFC4 Design Transfer View', 'Assembly/part handling, reinforcement export, naming conventions'],
          ['Allplan', 'IFC4 export with project properties', 'Storey assignment, classification codes, Pset mapping'],
          ['Vectorworks', 'IFC4 or IFC2x3 coordination view', 'Story levels mapped, Pset export enabled, classification assigned'],
        ],
        caption: 'Export guidance by authoring tool — verify with your project BEP.',
      },
      {
        type: 'callout',
        variant: 'tip',
        text: 'Expert tip: create a saved export preset in your authoring tool with all project-correct settings and share it with all authoring team members. One misconfigured export generates hours of correction downstream.',
      },
      {
        type: 'ul',
        items: [
          'Export checklist: IFC version matches project BEP (IFC4 or IFC2x3)',
          'Export checklist: property sets enabled (not suppressed for file size)',
          'Export checklist: coordinate system set to project coordinates (not world origin)',
          'Export checklist: all geometry types included (not simplified or merged)',
          'Export checklist: naming convention matches project convention document',
          'Export checklist: classification codes mapped in export settings',
        ],
      },
      { type: 'h2', text: 'Step 2: L1 Schema Validation' },
      {
        type: 'p',
        text: 'Open the IFC file in a checker. In IFC Viewer Online, L1 schema validation runs automatically when you open the file — it takes seconds. If L1 fails, the checker will report the specific entity or attribute that is invalid. L1 failures usually indicate:',
      },
      {
        type: 'ul',
        items: [
          'Wrong IFC version for the export profile used',
          'Authoring tool bug producing invalid entity references',
          'File corruption during export or transfer',
          'Incorrect file header (e.g., file created with IFC2x3 but labelled IFC4)',
        ],
      },
      {
        type: 'p',
        text: 'Fix L1 failures by correcting the export settings, updating the authoring tool exporter, or contacting the software vendor if the issue is a known bug.',
      },
      { type: 'h2', text: 'Step 3: L2 Quality Check and Health Score' },
      {
        type: 'p',
        text: 'The L2 quality check is the main checking step. Forty-four rules evaluate every element in the model across six categories. The result is a Health Score (0–100) and a prioritised list of issues by severity.',
      },
      {
        type: 'table',
        headers: ['Issue severity', 'Definition', 'Recommended action'],
        rows: [
          ['Error', 'Blocking quality problem — will cause failures in downstream tools', 'Must fix before CDE upload; blocks delivery'],
          ['Warning', 'Quality problem that may cause issues in some downstream workflows', 'Should fix before formal delivery; acceptable for informal coordination'],
          ['Info', 'Advisory — deviation from best practice with no immediate downstream impact', 'Fix at next model revision; does not block delivery'],
        ],
        caption: 'Issue severity levels and recommended BIM coordinator actions.',
      },
      {
        type: 'callout',
        variant: 'tip',
        text: 'Expert tip: when reviewing L2 results, fix errors first and in order of frequency — a single root cause (e.g., one floor plan with no storey assignment) can generate dozens of issues. Fix the root cause, not each individual issue.',
      },
      {
        type: 'ul',
        items: [
          'L2 checklist: Health Score ≥ 90 for formal delivery, ≥ 75 for coordination uploads',
          'L2 checklist: zero duplicate GUIDs',
          'L2 checklist: all building elements assigned to a storey',
          'L2 checklist: all storeys assigned to a building, building assigned to a site',
          'L2 checklist: no elements with empty or generic names (e.g., "Wall" or "Beam 1")',
          'L2 checklist: standard Psets present and populated for all major element types',
          'L2 checklist: no geometry with zero volume or broken Boolean operations',
        ],
      },
      { type: 'h2', text: 'Step 4: L3 IDS Validation' },
      {
        type: 'p',
        text: 'If a project IDS file has been issued (as part of the EIR or separately), the L3 check validates whether the model contains the required data. An IDS specifies which element types must carry which properties, with which values or value ranges, and with which classification codes.',
      },
      {
        type: 'p',
        text: 'To run L3 validation in IFC Viewer Online: open the IDS panel, upload the project .ids file, and the checker evaluates every applicable element. Results are reported per specification: how many elements are required, how many pass, how many fail, and exactly which elements fail which requirement.',
      },
      {
        type: 'ul',
        items: [
          'L3 checklist: all IDS specifications show 100% pass rate',
          'L3 checklist: no elements show "not-applicable" when they should be in scope',
          'L3 checklist: classification codes match the IDS-required classification system',
          'L3 checklist: required material assignments are present',
          'L3 checklist: required custom Psets and properties exist with correct values',
        ],
      },
      { type: 'h2', text: 'Archiving the Checking Report' },
      {
        type: 'p',
        text: 'A checking report is only useful as a conformance record if it is archived alongside the model. Export the report as JSON (full machine-readable audit trail) or HTML (human-readable summary) and upload it to the CDE with the model. The report should include:',
      },
      {
        type: 'ul',
        items: [
          'Date and time of check',
          'Model file name and version',
          'Tool name and version used for checking',
          'Health Score at time of submission',
          'Error and warning counts by category',
          'IDS specification results if L3 was run',
        ],
      },
      { type: 'h2', text: 'ISO 19650 Stage Gate Integration' },
      {
        type: 'p',
        text: 'ISO 19650-2 defines information delivery milestones at each project stage. The checking workflow maps directly onto these milestones:',
      },
      {
        type: 'table',
        headers: ['Project stage', 'ISO 19650 milestone', 'Minimum check required', 'Health Score threshold'],
        rows: [
          ['Concept / RIBA Stage 2', 'Concept information', 'L1 + L2 quality', '≥ 60'],
          ['Developed Design / RIBA Stage 3', 'Design intent', 'L1 + L2 + L3 (if IDS issued)', '≥ 75'],
          ['Technical Design / RIBA Stage 4', 'Technical design', 'L1 + L2 + L3', '≥ 85'],
          ['Construction / RIBA Stage 5', 'Construction information', 'L1 + L2 + L3', '≥ 90'],
          ['Handover / RIBA Stage 6', 'As-built / FM handover', 'L1 + L2 + L3 full LOI', '≥ 90'],
        ],
        caption: 'ISO 19650 stage gates and recommended checking thresholds by RIBA stage.',
      },
      {
        type: 'callout',
        variant: 'info',
        text: 'These thresholds are recommendations based on common practice — your project BEP should define the accepted Health Score threshold for each delivery milestone. Earlier stages may have lower thresholds to avoid blocking design iteration; later stages should be strict.',
      },
      { type: 'h2', text: 'Fixing Common Issues Before Re-Checking' },
      {
        type: 'p',
        text: ['For a detailed guide to the most common errors and how to fix them, see ', { text: '10 common IFC model errors', to: 'common-ifc-model-errors' }, '. The three most frequent L2 failures are:'],
      },
      {
        type: 'feature-grid',
        items: [
          { icon: '🔑', title: 'Duplicate GUIDs', body: 'Caused by copy-paste of elements in Revit or ArchiCAD without GUID regeneration. Fix: use the authoring tool\'s GUID management tool, or export with a fresh GUID set. In IFC Viewer Online, the error report identifies each duplicate by element name and type.' },
          { icon: '🏗️', title: 'Elements not assigned to storey', body: 'Caused by elements placed at levels that are not connected to the IFC spatial hierarchy. Fix: in Revit, check the element\'s "Level" parameter. In ArchiCAD, check the home storey assignment. Then re-export.' },
          { icon: '📋', title: 'Missing property sets', body: 'Caused by Pset mapping not configured in the export settings, or elements of types that the exporter does not map by default. Fix: review the exporter Pset mapping table and add missing mappings. For custom Psets, use the IDS approach to define them formally.' },
        ],
      },
      {
        type: 'pull-quote',
        text: 'A five-minute check before every CDE upload saves hours of rework downstream. Make it part of the export routine, not a last-minute quality audit.',
        cite: 'BIM coordination best practice',
      },
      {
        type: 'p',
        text: ['See also: the full three-level validation framework in the ', { text: 'IFC model checker complete guide', to: 'ifc-model-checker' }, '. How checkers differ from viewers — ', { text: 'IFC model checker vs IFC viewer', to: 'ifc-model-checker-vs-ifc-viewer' }, '. Which tool to choose — ', { text: 'best IFC model checkers in 2026', to: 'best-ifc-model-checkers-2026' }, '. The 10 most common IFC errors and how to detect each one — ', { text: '10 common IFC model errors', to: 'common-ifc-model-errors' }, '.'],
      },
    ],
  },

  // ── Article #11: 10 Common IFC Model Errors ───────────────────────────────
  {
    slug: 'common-ifc-model-errors',
    title: '10 Common IFC Model Errors and How to Detect Them',
    excerpt: 'The ten errors that appear most often in IFC files delivered on real projects — what causes them, how a model checker detects them, and how to fix them at the source.',
    date: '2026-06-30',
    author: 'IFC Viewer Online',
    category: 'Validation',
    categorySlug: 'validation',
    readTimeMin: 20,
    keywords: ['IFC model errors', 'IFC validation errors', 'duplicate GUID IFC', 'IFC broken hierarchy', 'missing property sets IFC', 'IFC geometry errors', 'IFC checking', 'BIM model quality'],
    faqs: [
      { q: 'What are the most common IFC model errors?', a: 'The most frequent IFC errors are: duplicate GUIDs (caused by copy-paste without GUID regeneration), elements not assigned to a storey, missing required property sets, empty or generic element names, invalid geometry (zero-volume or broken Boolean operations), wrong or absent classification codes, broken element relationships, naming convention violations, missing ISO 19650 EIR metadata, and LOD/LOI inconsistencies between element types.' },
      { q: 'How do I find duplicate GUIDs in an IFC file?', a: 'Load the IFC file into a model checker like IFC Viewer Online. The L2 quality check identifies all duplicate GUIDs and lists the affected elements by name and type. You cannot reliably detect duplicate GUIDs by viewing the model — they are invisible in 3D; only a data-level check catches them.' },
      { q: 'Why do IFC models have missing property sets?', a: 'Missing property sets are usually caused by one of three things: the authoring tool exporter does not map that element type to the standard Pset by default; the Pset mapping was configured incorrectly in the export settings; or the element type is non-standard and has no IFC Pset equivalent. Fix by reviewing the export Pset mapping table and adding missing entries.' },
      { q: 'What causes broken spatial hierarchy in IFC?', a: 'Broken spatial hierarchy occurs when elements are placed in the model but not assigned to a spatial container — storey, building, or site — in the IFC export. Common causes: elements placed on non-storey levels in Revit; work planes used instead of levels; copy-paste from one level to another without level assignment update. The checker detects elements with no IfcRelContainedInSpatialStructure relationship.' },
    ],
    content: [
      {
        type: 'callout',
        variant: 'info',
        text: 'TL;DR — The 10 errors listed here account for the majority of L2 quality failures on real projects. Each one is invisible in a 3D viewer but detectable in seconds with a model checker. This guide covers the cause, detection method, fix, and prevention for each.',
      },
      {
        type: 'p',
        text: 'A BIM coordinator who has reviewed enough incoming IFC files develops pattern recognition: the same ten errors appear project after project, authoring tool after authoring tool. They are not random — they have consistent causes, and most are preventable with the right export settings and a checking step before the CDE upload.',
      },
      { type: 'h2', text: 'Overview: The 10 Most Common IFC Errors' },
      {
        type: 'table',
        headers: ['Error', 'Severity', 'Detection method', 'Downstream impact'],
        rows: [
          ['1. Duplicate GUIDs', 'Error', 'L2 rule check — data level only', 'CDE version tracking, clash detection, BCF coordination'],
          ['2. Broken spatial hierarchy', 'Error', 'L2 rule check — spatial tree', 'Elements invisible in coordination tools; wrong storey filters'],
          ['3. Elements not assigned to storey', 'Error', 'L2 rule check — containment', 'Quantity takeoff by floor fails; coordination filters break'],
          ['4. Missing property sets', 'Warning/Error', 'L2 rule check — Pset presence', 'QTO inaccurate; FM handover incomplete; EIR non-conformance'],
          ['5. Wrong / absent classification codes', 'Warning', 'L2 rule check — classification', 'Procurement broken; FM asset register incomplete'],
          ['6. Invalid geometry', 'Error', 'L2 rule check — geometry validity', 'Clash detection false positives; 4D/5D simulation fails'],
          ['7. Broken element relationships', 'Warning', 'L2 rule check — relationship integrity', 'Spatial tree corruption; type-instance data loss'],
          ['8. Naming convention violations', 'Warning', 'L2 rule check — naming rules', 'Filters in coordination tools fail; manual rework'],
          ['9. Missing ISO 19650 / EIR metadata', 'Warning/Error', 'L3 IDS validation', 'EIR non-conformance; IDS specification failure'],
          ['10. LOD/LOI inconsistencies', 'Warning', 'L2 + L3 rule check', 'QTO unreliable; stage gate check fails'],
        ],
        caption: 'The 10 most common IFC errors, their severity, and downstream impact.',
      },
      { type: 'h2', text: '1. Duplicate GUIDs' },
      {
        type: 'p',
        text: 'Every element in an IFC file must carry a globally unique identifier (GUID) — a 22-character base64-encoded value that is supposed to be unique across all IFC files ever created. Duplicate GUIDs occur when elements are copy-pasted in the authoring tool without triggering GUID regeneration. The result: two or more elements in the same file share an identifier.',
      },
      {
        type: 'comparison',
        left: {
          label: 'Detection and causes',
          color: 'neutral',
          items: [
            'Invisible in 3D viewer — requires L2 data-level check',
            'IFC Viewer Online reports each duplicate by element name and type',
            'Cause: copy-paste in Revit or ArchiCAD without GUID reset',
            'Cause: linked model import without GUID conflict resolution',
            'Cause: authoring tool bug in specific exporter versions',
          ],
        },
        right: {
          label: 'Fix and prevention',
          color: 'accent',
          items: [
            'In Revit: use the IFC exporter option to regenerate GUIDs on export',
            'In ArchiCAD: use the GUID management tool before export',
            'Prevention: never copy-paste between projects via copy/paste — use links',
            'Prevention: check for duplicates after every major model merge',
            'Prevention: run Health Score check before every CDE upload',
          ],
        },
      },
      {
        type: 'callout',
        variant: 'tip',
        text: 'Expert tip: duplicate GUIDs break BCF coordination because BCF topics reference elements by GUID. If two elements share a GUID, clicking a BCF viewpoint in the coordination model takes you to the wrong element — or both. Catch duplicates before the model enters coordination.',
      },
      { type: 'h2', text: '2. Broken Spatial Hierarchy' },
      {
        type: 'p',
        text: 'The IFC spatial hierarchy is the backbone of the model: IfcProject → IfcSite → IfcBuilding → IfcBuildingStorey → IfcSpace/elements. When this chain is broken — a building with no site, or a storey with no building — coordination tools either reject the file or silently produce incorrect results.',
      },
      {
        type: 'comparison',
        left: {
          label: 'Detection and causes',
          color: 'neutral',
          items: [
            'L2 rule check: missing IfcRelAggregates between hierarchy levels',
            'Elements appear in the wrong storey filter or not at all',
            'Cause: manually edited IFC file with incorrect hierarchy edit',
            'Cause: authoring tool export of partial models (one discipline only)',
            'Cause: merge of models from different tools without hierarchy reconciliation',
          ],
        },
        right: {
          label: 'Fix and prevention',
          color: 'accent',
          items: [
            'Fix in authoring tool: ensure site, building, storeys are modelled, not just implied',
            'In Revit: check that the project hierarchy in the IFC export options is complete',
            'Prevention: validate the hierarchy after every federated model merge',
            'Prevention: never manually edit IFC hierarchy outside the authoring tool',
          ],
        },
      },
      { type: 'h2', text: '3. Elements Not Assigned to a Storey' },
      {
        type: 'p',
        text: 'An element exists in the model but has no IfcRelContainedInSpatialStructure relationship to an IfcBuildingStorey. The element is technically in the file but effectively unlocated in the building hierarchy. Coordination tools filter by storey; an unassigned element is invisible to those filters.',
      },
      {
        type: 'comparison',
        left: {
          label: 'Detection and causes',
          color: 'neutral',
          items: [
            'L2 rule check: elements with no spatial containment relationship',
            'Cause: elements placed on reference planes, not levels, in Revit',
            'Cause: elements with "No Level" assignment in Revit',
            'Cause: ArchiCAD elements with an undefined home storey',
            'Cause: generic model families placed without a host level',
          ],
        },
        right: {
          label: 'Fix and prevention',
          color: 'accent',
          items: [
            'In Revit: select each affected element and assign a Level parameter',
            'Filter by "No Level" in Revit schedules to find all affected elements',
            'In ArchiCAD: use Element Information to check and set home storey',
            'Prevention: include storey assignment as a modelling standard review item',
            'Prevention: run L2 check after every new discipline model integration',
          ],
        },
      },
      { type: 'h2', text: '4. Missing Required Property Sets' },
      {
        type: 'p',
        text: 'Standard IFC property sets (Psets) like Pset_WallCommon, Pset_BeamCommon, and Pset_SpaceCommon carry the data that downstream tools — quantity takeoff, FM handover, energy analysis — depend on. When a Pset is absent or its properties are empty, those downstream processes produce incorrect or incomplete results.',
      },
      {
        type: 'comparison',
        left: {
          label: 'Detection and causes',
          color: 'neutral',
          items: [
            'L2 rule check: required Psets absent for element types',
            'Cause: exporter Pset mapping not configured for this element type',
            'Cause: custom element types with no IFC Pset equivalent',
            'Cause: export profile set to "geometry only" for file size reduction',
            'Cause: incorrect IFC entity type mapped — wrong Pset attached',
          ],
        },
        right: {
          label: 'Fix and prevention',
          color: 'accent',
          items: [
            'Review the export Pset mapping table in your authoring tool exporter',
            'Add explicit mappings for custom element types to appropriate Psets',
            'Never use "geometry only" export for coordination or delivery models',
            'Prevention: use IDS to formally define required Psets per project stage',
            'Prevention: validate Pset completeness in the L3 IDS check before delivery',
          ],
        },
      },
      { type: 'h2', text: '5. Wrong or Absent Classification Codes' },
      {
        type: 'p',
        text: 'Classification codes (Uniclass 2015, OmniClass, NBS, or national equivalents) are required for procurement, FM asset registers, and increasingly for EIR compliance. Missing or incorrect classification codes mean QS teams cannot generate correct BOQs and FM teams cannot populate the CAFM without manual rework.',
      },
      {
        type: 'comparison',
        left: {
          label: 'Detection and causes',
          color: 'neutral',
          items: [
            'L2 rule check: classification property absent or not linked to standard system',
            'L3 IDS check: specific classification code requirements not met',
            'Cause: classification not configured in authoring tool export',
            'Cause: classification system in model does not match EIR requirement',
            'Cause: custom families without classification code parameters',
          ],
        },
        right: {
          label: 'Fix and prevention',
          color: 'accent',
          items: [
            'Configure classification system in authoring tool project settings',
            'Map all element types to the required classification table',
            'Use IDS to formally define which classification system and codes are required',
            'Prevention: include classification in the BIM content standards from day one',
            'Prevention: validate against IDS at each stage gate, not only at handover',
          ],
        },
      },
      { type: 'h2', text: '6. Invalid or Broken Geometry' },
      {
        type: 'p',
        text: 'Geometry errors in IFC fall into three main types: zero-volume elements (an extruded profile with zero area), unclosed solid geometry (a solid that has holes in its surface), and failed Boolean operations (a void subtraction that produces a non-manifold result). These are invisible when viewing the model because renderers smooth over them; they become visible only when clash detection or simulation tools try to process the geometry mathematically.',
      },
      {
        type: 'comparison',
        left: {
          label: 'Detection and causes',
          color: 'neutral',
          items: [
            'L2 rule check: geometry validity, volume check, manifold check',
            'Cause: poorly formed curtain wall panels in Revit',
            'Cause: complex Boolean operations in ArchiCAD that fail on export',
            'Cause: imported geometry (from DXF or STEP) that never had valid solid geometry',
            'Cause: manually drawn geometry with accidental zero-area profiles',
          ],
        },
        right: {
          label: 'Fix and prevention',
          color: 'accent',
          items: [
            'Use the checker error report to identify specific elements by name/type',
            'Re-model identified elements using correct solid modelling techniques',
            'For curtain walls: check the panel definition, not just the overall wall',
            'Prevention: avoid importing DXF/DWG geometry directly into BIM models',
            'Prevention: review geometry in an IFC viewer after every complex Boolean operation',
          ],
        },
      },
      { type: 'h2', text: '7. Broken Element Relationships' },
      {
        type: 'p',
        text: 'IFC encodes relationships between elements using relationship entities: IfcRelDefinesByType (type-instance), IfcRelAssociatesMaterial (material assignment), IfcRelConnectsElements (structural connections), and others. When these relationships are malformed — referencing non-existent entities, or pointing to the wrong type of object — the data model becomes inconsistent and downstream tools either error or silently ignore the affected elements.',
      },
      {
        type: 'comparison',
        left: {
          label: 'Detection and causes',
          color: 'neutral',
          items: [
            'L2 rule check: dangling relationship references, wrong entity types',
            'Cause: manual IFC editing that breaks referential integrity',
            'Cause: exporter bugs in older authoring tool versions',
            'Cause: federated model merge with relationship conflicts',
          ],
        },
        right: {
          label: 'Fix and prevention',
          color: 'accent',
          items: [
            'Re-export from the authoring tool — do not edit IFC files manually',
            'Update the authoring tool exporter to the current version',
            'Prevention: treat IFC as a delivery format only — all edits happen in the authoring tool',
            'Prevention: validate after every exporter update',
          ],
        },
      },
      { type: 'h2', text: '8. Naming Convention Violations' },
      {
        type: 'p',
        text: 'BIM projects define naming conventions for element types, layers, views, and object names. When IFC elements carry generic names ("Wall", "Floor 1", "Beam") or inconsistent names across disciplines, coordination tools cannot apply discipline filters correctly and QS teams cannot run automated takeoff without manual rule configuration.',
      },
      {
        type: 'comparison',
        left: {
          label: 'Detection and causes',
          color: 'neutral',
          items: [
            'L2 rule check: generic or empty names flagged',
            'Cause: authoring tool families with default names not updated',
            'Cause: naming convention document shared too late in the project',
            'Cause: imported content from other projects with different conventions',
          ],
        },
        right: {
          label: 'Fix and prevention',
          color: 'accent',
          items: [
            'Use the checker report to identify elements with non-compliant names',
            'Correct names in the authoring tool — names should not be changed in the IFC file',
            'Prevention: issue the naming convention document at project start',
            'Prevention: use IDS to formally enforce naming patterns where critical',
          ],
        },
      },
      { type: 'h2', text: '9. Missing ISO 19650 / EIR Metadata' },
      {
        type: 'p',
        text: 'An IDS file formalises the metadata required by the EIR: project number, phase, discipline code, responsible organisation, LOD/LOI level, and custom properties. When an IDS is in force, any element that fails to carry the required properties fails the L3 IDS check and the model is non-conformant for delivery.',
      },
      {
        type: 'comparison',
        left: {
          label: 'Detection and causes',
          color: 'neutral',
          items: [
            'L3 IDS validation: required properties absent or wrong value type',
            'Cause: IDS not shared with authoring teams early enough',
            'Cause: custom Psets for EIR metadata not configured in authoring tool',
            'Cause: elements added after IDS check without checking against IDS',
          ],
        },
        right: {
          label: 'Fix and prevention',
          color: 'accent',
          items: [
            'Share the IDS file with all authoring teams at project kick-off',
            'Configure custom Psets to carry EIR metadata in authoring tool templates',
            'Run L3 IDS check at every stage gate, not only at final handover',
            'Prevention: use IDS as the machine-readable version of the EIR data requirements',
          ],
        },
      },
      { type: 'h2', text: '10. LOD / LOI Inconsistencies' },
      {
        type: 'p',
        text: 'Level of Development (LOD) and Level of Information (LOI) requirements differ by project stage and element type. At construction stage, structural elements should have LOD 400 (fabrication-ready geometry and full material properties) while architectural finishes may still be LOD 300. Inconsistencies — a wall with LOD 200 geometry and LOD 400 property data, or vice versa — cause QTO inaccuracies and stage gate failures.',
      },
      {
        type: 'comparison',
        left: {
          label: 'Detection and causes',
          color: 'neutral',
          items: [
            'L2 Pset completeness check + L3 IDS LOI properties',
            'Cause: LOD/LOI matrix not communicated clearly to authoring teams',
            'Cause: elements at different LODs mixed in a single export',
            'Cause: LOD matrix not updated when scope changes mid-project',
          ],
        },
        right: {
          label: 'Fix and prevention',
          color: 'accent',
          items: [
            'Use IDS to formally define which properties are required at each stage',
            'Check LOI compliance using the L3 IDS check at each stage gate',
            'Prevention: issue a LOD/LOI matrix per element type at project start',
            'Prevention: use the Health Score trend across stages to identify regression',
          ],
        },
      },
      {
        type: 'callout',
        variant: 'tip',
        text: 'Expert tip: track Health Score across model revisions, not just at delivery. A score that drops from 85 to 62 between revisions tells you exactly when and roughly where new problems were introduced — making root cause analysis much faster.',
      },
      {
        type: 'pull-quote',
        text: 'None of the ten most common IFC errors are visible in a 3D viewer. All ten are detectable in under a minute with an L2 model checker. The five-minute check before CDE upload is the highest-leverage quality control available to a BIM coordinator.',
        cite: 'IFC quality management principle',
      },
      {
        type: 'p',
        text: ['For a step-by-step workflow to check and fix these errors before delivery, see ', { text: 'how to check an IFC model before delivery', to: 'how-to-check-ifc-model-before-delivery' }, '. For the tool to run the check, see the ', { text: 'best IFC model checkers comparison', to: 'best-ifc-model-checkers-2026' }, '. For the complete framework behind the checking levels, see the ', { text: 'IFC model checker complete guide', to: 'ifc-model-checker' }, '. For the conceptual distinction between checkers and viewers, see ', { text: 'IFC model checker vs IFC viewer', to: 'ifc-model-checker-vs-ifc-viewer' }, '.'],
      },
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
