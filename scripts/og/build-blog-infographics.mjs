// Build the explanatory diagrams used inside blog posts.
//
// Each figure is a deterministic HTML/CSS composition rendered by Chrome —
// no generative AI, no stock imagery — so a diagram says exactly what the
// article says and can be regenerated when the article changes.
//
// They are light, high-contrast technical diagrams on purpose: image search
// answers queries like "IFC spatial structure diagram" or "BCF 3.0 file
// structure" with images that look like diagrams, and a diagram is what gets
// re-shared (with the watermark) by people explaining the topic elsewhere.
//
// Output: public/blog/images/<name>.png (1600×900) and <name>-800.png (800×450)
//
// Usage:
//   node scripts/og/build-blog-infographics.mjs           # all figures
//   node scripts/og/build-blog-infographics.mjs <name>... # some figures

import { chromium } from 'playwright-core'
import { mkdirSync, readFileSync } from 'node:fs'
import path from 'node:path'

const EXE = process.env.CHROME_EXE || 'C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe'
const OUT = 'public/blog/images'
const W = 1600, H = 900
const log = (...a) => console.log('[blog-infographics]', ...a)

const font = (file) => `data:font/woff2;base64,${readFileSync(path.join('public/fonts', file)).toString('base64')}`
const FONTS = `
@font-face{font-family:Geist;font-weight:400;src:url(${font('geist-400.woff2')}) format('woff2')}
@font-face{font-family:Geist;font-weight:500;src:url(${font('geist-500.woff2')}) format('woff2')}
@font-face{font-family:Geist;font-weight:600;src:url(${font('geist-600.woff2')}) format('woff2')}
@font-face{font-family:Geist;font-weight:700;src:url(${font('geist-700.woff2')}) format('woff2')}
@font-face{font-family:GeistMono;font-weight:400;src:url(${font('geist-mono-400.woff2')}) format('woff2')}
@font-face{font-family:GeistMono;font-weight:500;src:url(${font('geist-mono-500.woff2')}) format('woff2')}`

// One palette for every figure, so a series reads as a series.
const C = {
  bg: '#f7f8fb', card: '#ffffff', ink: '#0f172a', sub: '#475569', faint: '#94a3b8', line: '#dbe1ea',
  brand: '#5e6ad2', brandSoft: '#eceefc', green: '#0f9f6e', greenSoft: '#e3f6ee', red: '#dc3545', redSoft: '#fdeaec',
  amber: '#c27c0e', amberSoft: '#fdf3df', cyan: '#0e8fb0', cyanSoft: '#e1f4f9', violet: '#8b5cf6', violetSoft: '#f1ebfe',
}

const BASE = `${FONTS}
*{box-sizing:border-box;margin:0;padding:0}
html,body{width:${W}px;height:${H}px}
body{font-family:Geist,system-ui,sans-serif;background:${C.bg};color:${C.ink};position:relative;overflow:hidden;
  background-image:radial-gradient(${C.line} 1px,transparent 1px);background-size:28px 28px}
.frame{position:absolute;inset:0;padding:56px 72px 64px;display:flex;flex-direction:column}
.kicker{font-family:GeistMono,monospace;font-size:17px;letter-spacing:.14em;text-transform:uppercase;color:${C.brand};font-weight:500}
h1{font-size:46px;font-weight:700;letter-spacing:-.02em;margin-top:10px;line-height:1.1}
.lede{font-size:21px;color:${C.sub};margin-top:10px;max-width:1250px;line-height:1.4}
.body{flex:1;position:relative;margin-top:30px}
.foot{position:absolute;left:72px;right:72px;bottom:24px;display:flex;justify-content:space-between;align-items:center;
  font-size:16px;color:${C.faint}}
.foot b{color:${C.brand};font-weight:600}
.mark{display:inline-flex;align-items:center;gap:10px}
.mark i{width:22px;height:22px;border-radius:6px;background:${C.brand};display:inline-block}
.card{background:${C.card};border:1.5px solid ${C.line};border-radius:16px;box-shadow:0 1px 2px rgba(15,23,42,.04),0 8px 24px rgba(15,23,42,.05)}
.mono{font-family:GeistMono,monospace}
.pill{display:inline-block;padding:4px 12px;border-radius:999px;font-size:15px;font-weight:600}
svg text{font-family:Geist,system-ui,sans-serif}
`

function page({ kicker, title, lede, body, css = '', source = 'Diagram' }) {
  return `<!doctype html><html><head><meta charset="utf-8"><style>${BASE}${css}</style></head><body>
<div class="frame">
  <div class="kicker">${kicker}</div>
  <h1>${title}</h1>
  ${lede ? `<p class="lede">${lede}</p>` : ''}
  <div class="body">${body}</div>
</div>
<div class="foot"><span class="mark"><i></i><b>IFC Viewer Online</b>&nbsp;· ifcvieweronline.eu/blog</span><span>${source}</span></div>
</body></html>`
}

// ── Figures ──────────────────────────────────────────────────────────────────

const FIGURES = {}

// 1. Spatial structure tree
FIGURES['ifc-spatial-structure-hierarchy'] = () => {
  const node = (x, y, w, cls, name, sub) => `
    <div class="n ${cls}" style="left:${x}px;top:${y}px;width:${w}px"><div class="nn">${name}</div><div class="ns">${sub}</div></div>`
  return page({
    kicker: 'IFC spatial structure',
    title: 'Project → Site → Building → Storey → Space',
    lede: 'Spatial elements are <b>aggregated</b> into a tree. Physical elements are <b>contained</b> in exactly one spatial element — usually a storey.',
    css: `
.n{position:absolute;padding:14px 18px;border-radius:14px;background:#fff;border:2px solid ${C.line};box-shadow:0 6px 18px rgba(15,23,42,.06)}
.nn{font-size:22px;font-weight:700}.ns{font-size:15px;color:${C.sub};margin-top:3px}
.sp{border-color:${C.brand}}.sp .nn{color:${C.brand}}
.el{border-color:${C.green};background:${C.greenSoft}}.el .nn{color:${C.green}}
.lg{position:absolute;right:0;top:0;width:330px;padding:18px 20px;font-size:16px;line-height:1.55}
.lg div{display:flex;align-items:center;gap:10px;margin:6px 0}.lg s{width:36px;border-top:3px solid;display:inline-block;text-decoration:none}
`,
    body: `
<svg width="1460" height="560" style="position:absolute;left:0;top:0">
  <g stroke="${C.brand}" stroke-width="3" fill="none">
    <path d="M150 74 V120 H150 V140"/><path d="M150 214 V254"/><path d="M150 328 V350 H120 V368"/><path d="M150 350 H470 V368"/>
    <path d="M120 442 V470"/><path d="M470 442 V470"/>
  </g>
  <g stroke="${C.green}" stroke-width="3" fill="none" stroke-dasharray="9 7">
    <path d="M590 405 H700"/><path d="M700 405 V200 H760"/><path d="M700 405 V300 H760"/><path d="M700 405 V400 H760"/><path d="M700 405 V500 H760"/>
  </g>
  <text x="760" y="150" font-size="15" fill="${C.green}" font-weight="600">IfcRelContainedInSpatialStructure</text>
  <text x="168" y="112" font-size="15" fill="${C.brand}" font-weight="600">IfcRelAggregates</text>
</svg>
${node(20, 0, 260, 'sp', 'IfcProject', 'units, contexts, the root')}
${node(20, 140, 260, 'sp', 'IfcSite', 'location, georeferencing')}
${node(20, 254, 260, 'sp', 'IfcBuilding', 'one per building')}
${node(0, 368, 240, 'sp', 'IfcBuildingStorey', 'Level 00 · elevation 0.00')}
${node(350, 368, 240, 'sp', 'IfcBuildingStorey', 'Level 01 · elevation 3.20')}
${node(0, 470, 240, 'sp', 'IfcSpace', 'Room 0.01 · 24.5 m²')}
${node(350, 470, 240, 'sp', 'IfcSpace', 'Room 1.01 · 18.0 m²')}
${node(760, 165, 300, 'el', 'IfcWall', 'contained in Level 01')}
${node(760, 265, 300, 'el', 'IfcDoor', 'contained in Level 01')}
${node(760, 365, 300, 'el', 'IfcSlab', 'contained in Level 01')}
${node(760, 465, 300, 'el', 'IfcColumn', 'contained in Level 01')}
<div class="lg card">
  <div style="font-weight:700;font-size:18px;margin-bottom:6px">Two different relationships</div>
  <div><s style="border-color:${C.brand}"></s> aggregation — spatial tree</div>
  <div><s style="border-color:${C.green};border-top-style:dashed"></s> containment — element → storey</div>
  <div style="color:${C.sub};margin-top:10px">An element without containment floats outside every storey: plan cuts, schedules and COBie lose it.</div>
</div>`,
  })
}

// 2. Entity inheritance
FIGURES['ifc-entity-inheritance-ifcwall'] = () => {
  const chain = [
    ['IfcRoot', 'GlobalId · OwnerHistory · Name · Description', C.faint],
    ['IfcObjectDefinition', 'can be aggregated, nested, assigned', C.faint],
    ['IfcObject', 'ObjectType · can have property sets', C.sub],
    ['IfcProduct', 'ObjectPlacement · Representation', C.cyan],
    ['IfcElement', 'Tag · physical existence', C.brand],
    ['IfcBuiltElement', 'IFC4X3 name (IfcBuildingElement in IFC2x3 / IFC4)', C.violet],
    ['IfcWall', 'PredefinedType: STANDARD, PARAPET, SHEAR…', C.green],
  ]
  const rows = chain.map(([n, d, c], i) => `
    <div class="r" style="margin-left:${i * 58}px;border-left-color:${c}">
      <span class="mono nm" style="color:${c}">${n}</span><span class="d">${d}</span></div>`).join('')
  return page({
    kicker: 'IFC schema',
    title: 'Why an IfcWall has a GlobalId: inheritance, top to bottom',
    lede: 'Every entity inherits the attributes of all its supertypes. Checkers and IDS facets that match on a supertype also match every subtype below it.',
    css: `.r{display:flex;align-items:baseline;gap:22px;background:#fff;border:1.5px solid ${C.line};border-left:7px solid;border-radius:12px;
      padding:13px 20px;margin-bottom:12px;width:fit-content;box-shadow:0 4px 14px rgba(15,23,42,.05)}
      .nm{font-size:25px;font-weight:500}.d{font-size:18px;color:${C.sub}}`,
    body: rows,
  })
}

// 3. STEP file anatomy
FIGURES['ifc-step-file-anatomy'] = () => {
  const lines = [
    ['h', 'ISO-10303-21;'],
    ['h', 'HEADER;'],
    ['h', "FILE_DESCRIPTION(('ViewDefinition [ReferenceView]'),'2;1');"],
    ['h', "FILE_NAME('tower-ARC.ifc','2026-10-01T09:12:00',('Author'),…);"],
    ['s', "FILE_SCHEMA(('IFC4'));"],
    ['h', 'ENDSEC;'],
    ['d', 'DATA;'],
    ['e', "#1= IFCPROJECT('2O2Fr$t4X7Zf8NOew3FLOH',#2,'Tower',$,$,$,$,(#20),#7);"],
    ['e', "#245= IFCWALL('1kTvXnbbzCWw8lcMd1dR4o',#2,'Basic Wall:Ext 300',$,$,#210,#240,$,.STANDARD.);"],
    ['r', "#260= IFCRELDEFINESBYPROPERTIES('3Wy…',#2,$,$,(#245),#255);"],
    ['p', "#255= IFCPROPERTYSET('0Fx…',#2,'Pset_WallCommon',$,(#251,#252));"],
    ['p', "#251= IFCPROPERTYSINGLEVALUE('FireRating',$,IFCLABEL('EI 60'),$);"],
    ['d', 'ENDSEC;'],
    ['h', 'END-ISO-10303-21;'],
  ]
  const col = { h: C.faint, s: C.amber, d: C.faint, e: C.brand, r: C.violet, p: C.green }
  const code = lines.map(([k, t]) => `<div style="color:${k === 'h' || k === 'd' ? C.sub : C.ink}"><span style="color:${col[k]}">▍</span> ${t.replace(/(#\d+)/g, `<b style="color:${C.brand}">$1</b>`).replace(/('(?:[0-9A-Za-z_$]{22})')/g, `<b style="color:${C.red}">$1</b>`)}</div>`).join('')
  const note = (top, color, title, text) => `<div class="nt" style="top:${top}px;border-color:${color}"><b style="color:${color}">${title}</b><br>${text}</div>`
  return page({
    kicker: 'Inside an .ifc file',
    title: 'Anatomy of an IFC file (STEP, ISO 10303-21)',
    css: `.code{position:absolute;left:0;top:0;width:1010px;padding:22px 24px;font-family:GeistMono,monospace;font-size:15px;line-height:1.95;white-space:nowrap;overflow:hidden}
      .nt{position:absolute;left:1050px;width:410px;background:#fff;border:1.5px solid;border-left-width:6px;border-radius:12px;padding:12px 16px;font-size:16px;color:${C.sub};line-height:1.45}
      .nt b{font-size:17px}`,
    body: `<div class="code card">${code}</div>
      ${note(0, C.amber, 'HEADER → schema', 'FILE_SCHEMA says IFC2X3, IFC4 or IFC4X3. Everything else is read against it.')}
      ${note(130, C.brand, '#245 = one instance', 'Line numbers (express IDs) are renumbered on every export. Never use them across versions.')}
      ${note(260, C.red, "'1kTvXnbbz…' = GlobalId", '22 characters, stable for the life of the element — if the export keeps it.')}
      ${note(390, C.violet, 'Relationships are entities', 'Property sets, containment and types attach to elements through IfcRel… lines.')}
      ${note(520, C.green, 'Pset_WallCommon.FireRating', 'Values are typed: IFCLABEL, IFCBOOLEAN, IFCLENGTHMEASURE…')}`,
  })
}

// 4. Property set structure
FIGURES['ifc-property-set-relationship'] = () => page({
  kicker: 'IFC property sets',
  title: 'How a property reaches an element',
  lede: 'Properties never sit on the wall itself. They live in a property set, attached by a relationship — either to the occurrence or to its type, which every occurrence inherits.',
  css: `.b{position:absolute;padding:16px 20px;border-radius:14px;background:#fff;border:2px solid;box-shadow:0 6px 18px rgba(15,23,42,.06)}
    .b .t{font-family:GeistMono,monospace;font-size:19px;font-weight:500;white-space:nowrap}.b .s{font-size:16px;color:${C.sub};margin-top:4px}`,
  body: `
<svg width="1460" height="560" style="position:absolute;left:0;top:0">
  <defs><marker id="a" markerWidth="10" markerHeight="10" refX="8" refY="5" orient="auto"><path d="M0 0 L10 5 L0 10z" fill="${C.sub}"/></marker></defs>
  <g stroke="${C.sub}" stroke-width="2.5" fill="none" marker-end="url(#a)">
    <path d="M300 110 H418"/><path d="M770 110 H950"/><path d="M1252 110 H1282 V150"/>
    <path d="M300 420 H440"/><path d="M760 420 H880"/><path d="M160 360 V170"/>
  </g>
  <text x="172" y="270" font-size="16" fill="${C.violet}" font-weight="600">IfcRelDefinesByType</text>
  <text x="172" y="292" font-size="15" fill="${C.sub}">type properties are inherited</text>
</svg>
<div class="b" style="left:0;top:60px;width:300px;border-color:${C.green}"><div class="t" style="color:${C.green}">IfcWall</div><div class="s">the occurrence · #245</div></div>
<div class="b" style="left:420px;top:60px;width:350px;border-color:${C.violet}"><div class="t" style="color:${C.violet}">IfcRelDefinesByProperties</div><div class="s">links one pset to many elements</div></div>
<div class="b" style="left:952px;top:60px;width:300px;border-color:${C.brand}"><div class="t" style="color:${C.brand}">IfcPropertySet</div><div class="s">Name = Pset_WallCommon</div></div>
<div class="b" style="left:1080px;top:150px;width:380px;border-color:${C.line}"><div class="t">FireRating</div><div class="s">IfcPropertySingleValue · IFCLABEL('EI 60')</div></div>
<div class="b" style="left:1080px;top:248px;width:380px;border-color:${C.line}"><div class="t">IsExternal</div><div class="s">IfcPropertySingleValue · IFCBOOLEAN(.T.)</div></div>
<div class="b" style="left:0;top:370px;width:300px;border-color:${C.violet}"><div class="t" style="color:${C.violet}">IfcWallType</div><div class="s">Basic Wall: Ext 300</div></div>
<div class="b" style="left:440px;top:370px;width:320px;border-color:${C.violet}"><div class="t" style="color:${C.violet}">HasPropertySets</div><div class="s">psets defined once, on the type</div></div>
<div class="b" style="left:880px;top:370px;width:300px;border-color:${C.brand}"><div class="t" style="color:${C.brand}">IfcPropertySet</div><div class="s">Pset_WallCommon (type)</div></div>
<div class="b" style="left:0;top:500px;width:1460px;border-color:${C.amber};background:${C.amberSoft}"><div class="s" style="color:${C.ink};font-size:18px;margin:0"><b>Check this first when a property looks “missing”:</b> it may be on the type. A checker that ignores type inheritance fails elements that are perfectly fine.</div></div>`,
})

// 5. IDS specification anatomy
FIGURES['ids-specification-applicability-requirements'] = () => {
  const facet = (n, d, c) => `<div class="f" style="border-color:${c}"><b style="color:${c}">${n}</b><span>${d}</span></div>`
  return page({
    kicker: 'IDS 1.0 · buildingSMART',
    title: 'Every IDS specification is one sentence',
    lede: '<b>For every element that matches the applicability, require the requirements.</b> Both halves are built from the same six facets.',
    css: `.half{position:absolute;top:0;width:690px;padding:24px 26px}.half h3{font-size:26px;margin-bottom:6px}.half p{color:${C.sub};font-size:17px;margin-bottom:16px}
      .f{display:flex;flex-direction:column;gap:2px;border:1.5px solid;border-left-width:6px;border-radius:10px;padding:10px 14px;margin-bottom:10px;background:#fff}
      .f b{font-family:GeistMono,monospace;font-size:19px;font-weight:500}.f span{font-size:15.5px;color:${C.sub}}
      .arrow{position:absolute;left:700px;top:230px;font-size:64px;color:${C.brand};font-weight:700}`,
    body: `
<div class="half card" style="left:0">
  <h3 style="color:${C.cyan}">Applicability — <i>which elements?</i></h3><p>Selects the elements the rule is about. Too broad, and every opening and annotation fails.</p>
  ${facet('entity', 'IFCDOOR · predefined type', C.cyan)}
  ${facet('classification', 'Uniclass Ss_25_30 …', C.cyan)}
  ${facet('partOf', 'contained in a storey · part of an assembly', C.cyan)}
  <div style="font-size:16px;color:${C.sub};margin-top:6px">minOccurs="1" → the model must contain at least one.</div>
</div>
<div class="arrow">→</div>
<div class="half card" style="left:770px">
  <h3 style="color:${C.green}">Requirements — <i>what must they have?</i></h3><p>Tested on every selected element. One requirement per specification keeps the report readable.</p>
  ${facet('property', 'Pset_DoorCommon.FireRating · IFCLABEL', C.green)}
  ${facet('attribute', 'Name · Description · Tag', C.green)}
  ${facet('material', 'a declared material name or category', C.green)}
</div>`,
  })
}

// 6. Version compare by GlobalId
FIGURES['ifc-version-compare-globalid'] = () => {
  const row = (g, a, b, st) => {
    const m = { added: [C.green, C.greenSoft, 'added'], removed: [C.red, C.redSoft, 'removed'], modified: [C.amber, C.amberSoft, 'modified'], same: [C.faint, '#f1f5f9', 'unchanged'] }[st]
    return `<tr><td class="mono g">${g}</td><td>${a}</td><td>${b}</td><td><span class="pill" style="color:${m[0]};background:${m[1]}">${m[2]}</span></td></tr>`
  }
  return page({
    kicker: 'IFC version comparison',
    title: 'Match by GlobalId across the whole set — not file by file',
    lede: 'Express IDs (#245) are renumbered on every export. The GlobalId is the only identity that survives — and it lets a comparison see an element that moved between discipline files.',
    css: `table{width:100%;border-collapse:separate;border-spacing:0;font-size:19px;background:#fff}
      th{text-align:left;font-size:15px;letter-spacing:.08em;text-transform:uppercase;color:${C.sub};padding:14px 18px;border-bottom:2px solid ${C.line}}
      td{padding:13px 18px;border-bottom:1px solid ${C.line}}.g{color:${C.brand};font-size:17px}td small{color:${C.sub};font-size:15px}`,
    body: `<div class="card" style="overflow:hidden"><table>
<tr><th>GlobalId</th><th>Revision 6</th><th>Revision 7</th><th>Result</th></tr>
${row('1kTvXnbbzCWw8lcMd1dR4o', 'IfcWall · ARC.ifc', 'IfcWall · ARC.ifc', 'same')}
${row('3Fq9cZx0b5Kv2mE1rTn8Pw', 'IfcDoor · FireRating EI 60', 'IfcDoor · FireRating <b>EI 30</b>', 'modified')}
${row('0YtR2LmQ7f3Hc9sVb1Kx4a', 'IfcWall · <b>ARC.ifc</b>', 'IfcWall · <b>STR.ifc</b> <small>(file changed)</small>', 'modified')}
${row('2Pn6dWq4Rm8Jt0yUc3Hz5e', '—', 'IfcColumn · STR.ifc', 'added')}
${row('1Bv8xKs2Lq5Wm7Nd9Fr3Tg', 'IfcBuildingElementProxy', '—', 'removed')}
</table></div>
<div style="margin-top:22px;font-size:18px;color:${C.sub}">If <b style="color:${C.ink}">added ≈ removed ≈ total elements</b>, the export regenerated the GUIDs — fix the export before reading any diff.</div>`,
  })
}

// 7. BCF zip structure 2.1 vs 3.0
FIGURES['bcf-2-1-vs-3-0-markup-structure'] = () => {
  const xml = (t) => t.replace(/&lt;(\/?)(\w+)/g, `&lt;$1<b style="color:${C.brand}">$2</b>`)
  return page({
    kicker: 'BCF · BIM Collaboration Format',
    title: 'markup.bcf in BCF 2.1 vs BCF 3.0',
    lede: 'Same content, different nesting. A reader written for one layout reads the other as a topic with no comments and no labels.',
    css: `.col{position:absolute;top:0;width:690px;padding:20px 24px}.col h3{font-size:26px;margin-bottom:12px}
      pre{font-family:GeistMono,monospace;font-size:17px;line-height:1.7;color:${C.ink}}
      .hl{background:${C.amberSoft};border-radius:6px;padding:0 4px}`,
    body: `
<div class="col card" style="left:0"><h3 style="color:${C.cyan}">BCF 2.1</h3><pre>${xml(`&lt;Markup>
  &lt;Topic Guid="…" TopicType="Issue">
    &lt;Title>Door clashes with column&lt;/Title>
    <span class="hl">&lt;Labels>Fire&lt;/Labels>
    &lt;Labels>Level 01&lt;/Labels></span>
  &lt;/Topic>
  <span class="hl">&lt;Comment Guid="…">…&lt;/Comment></span>
  <span class="hl">&lt;Viewpoints Guid="…">
    &lt;Viewpoint>viewpoint.bcfv&lt;/Viewpoint>
  &lt;/Viewpoints></span>
&lt;/Markup>`)}</pre></div>
<div class="col card" style="left:770px"><h3 style="color:${C.violet}">BCF 3.0</h3><pre>${xml(`&lt;Markup>
  &lt;Topic Guid="…" TopicType="Issue">
    &lt;Title>Door clashes with column&lt;/Title>
    <span class="hl">&lt;Labels>
      &lt;Label>Fire&lt;/Label>
      &lt;Label>Level 01&lt;/Label>
    &lt;/Labels></span>
    <span class="hl">&lt;Comments>&lt;Comment Guid="…">…&lt;/Comment>&lt;/Comments></span>
    <span class="hl">&lt;Viewpoints>&lt;ViewPoint Guid="…">…&lt;/ViewPoint>&lt;/Viewpoints></span>
  &lt;/Topic>
&lt;/Markup>`)}</pre></div>`,
  })
}

// 8. Z-up vs Y-up
FIGURES['ifc-z-up-vs-threejs-y-up-axes'] = () => {
  const axes = (ox, oy, up, label, col, dx, dy) => `
  <g transform="translate(${ox},${oy})" stroke-width="5" stroke-linecap="round" fill="none">
    <line x1="0" y1="0" x2="0" y2="-210" stroke="${col}"/><line x1="0" y1="0" x2="210" y2="0" stroke="${C.red}"/><line x1="0" y1="0" x2="${dx}" y2="${dy}" stroke="${C.green}"/>
    <polygon points="-10,-200 10,-200 0,-225" fill="${col}" stroke="none"/><polygon points="200,-10 200,10 225,0" fill="${C.red}" stroke="none"/><circle cx="${dx}" cy="${dy}" r="9" fill="${C.green}" stroke="none"/>
    <text x="16" y="-215" font-size="30" font-weight="700" fill="${col}" stroke="none">${up} up</text>
    <text x="226" y="10" font-size="28" font-weight="700" fill="${C.red}" stroke="none">X</text>
    <text x="${dx + (dx > 0 ? 16 : -40)}" y="${dy + (dy > 0 ? 30 : -6)}" font-size="28" font-weight="700" fill="${C.green}" stroke="none">${up === 'Z' ? 'Y' : 'Z'}</text>
    <text x="-60" y="200" font-size="24" font-weight="600" fill="${C.ink}" stroke="none">${label}</text>
  </g>`
  return page({
    kicker: 'Why BCF cameras land in the wrong place',
    title: 'IFC is Z-up. three.js is Y-up. The camera must be converted back.',
    lede: 'Web viewers render in a Y-up scene and often shift the model towards the origin. A BCF viewpoint written without undoing both arrives rotated 90° — or kilometres away.',
    body: `<svg width="1460" height="560">
      ${axes(230, 340, 'Z', 'IFC world · metres', C.brand, 130, -100)}
      ${axes(720, 340, 'Y', 'three.js scene', C.violet, -130, 100)}
      <g font-size="20" fill="${C.sub}">
        <text x="1110" y="140" font-weight="700" fill="${C.ink}">Before writing a viewpoint</text>
        <text x="1110" y="180">1  rotate Y-up → Z-up</text>
        <text x="1110" y="215">2  add back the display offset</text>
        <text x="1110" y="250">3  convert clipping planes too</text>
        <text x="1110" y="300" fill="${C.red}">Skip 1 → camera faces the sky</text>
        <text x="1110" y="335" fill="${C.red}">Skip 2 → right view, wrong place</text>
        <text x="1110" y="370" fill="${C.red}">Skip 3 → section cuts elsewhere</text>
      </g></svg>`,
  })
}

// 9. COBie sheets ← IFC
FIGURES['cobie-sheets-from-ifc-entities'] = () => {
  const rows = [
    ['Facility', 'IfcProject · IfcSite · IfcBuilding', C.faint, ''],
    ['Floor', 'IfcBuildingStorey', C.faint, ''],
    ['Space', 'IfcSpace — Name, LongName, area', C.brand, 'FM core'],
    ['Zone', 'IfcZone', C.faint, ''],
    ['Type', 'IfcDoorType, IfcPumpType … + psets', C.brand, 'FM core'],
    ['Component', 'element occurrences — Name + GlobalId', C.green, 'the reason COBie exists'],
    ['System', 'IfcSystem + assignments', C.faint, ''],
  ]
  const r = rows.map(([s, i, c, tag]) => `<div class="row"><div class="s" style="color:${c === C.faint ? C.ink : c}">${s}</div><div class="arr">←</div><div class="mono i">${i}</div>${tag ? `<span class="pill" style="background:${c === C.green ? C.greenSoft : C.brandSoft};color:${c}">${tag}</span>` : ''}</div>`).join('')
  return page({
    kicker: 'COBie from IFC',
    title: 'Every COBie sheet that matters is a view of the IFC',
    lede: 'If the COBie is poor, the model is poor. Measure Component, Space and Type completeness at design freeze — not in the handover week.',
    css: `.row{display:flex;align-items:center;gap:22px;background:#fff;border:1.5px solid ${C.line};border-radius:12px;padding:12px 22px;margin-bottom:10px}
      .s{width:170px;font-size:24px;font-weight:700}.arr{font-size:26px;color:${C.faint}}.i{flex:1;font-size:19px;color:${C.sub}}`,
    body: r,
  })
}

// 10. Embed + CORS flow
FIGURES['ifc-embed-iframe-cors-flow'] = () => page({
  kicker: 'Embedding an IFC viewer',
  title: 'The model goes from your host to the visitor — never to us',
  lede: 'The browser fetches the .ifc from your storage and hands it to the viewer only if your host answers with an Access-Control-Allow-Origin header.',
  css: `.b{position:absolute;padding:18px 22px;border-radius:16px;background:#fff;border:2px solid;box-shadow:0 6px 18px rgba(15,23,42,.06);text-align:center}
    .b .t{font-size:24px;font-weight:700}.b .s{font-size:16px;color:${C.sub};margin-top:6px}`,
  body: `
<svg width="1460" height="560" style="position:absolute;left:0;top:0">
  <defs><marker id="a" markerWidth="12" markerHeight="12" refX="10" refY="6" orient="auto"><path d="M0 0 L12 6 L0 12z" fill="${C.brand}"/></marker>
  <marker id="g" markerWidth="12" markerHeight="12" refX="10" refY="6" orient="auto"><path d="M0 0 L12 6 L0 12z" fill="${C.green}"/></marker></defs>
  <path d="M360 150 H560" stroke="${C.brand}" stroke-width="3" marker-end="url(#a)"/>
  <path d="M900 150 H1090" stroke="${C.brand}" stroke-width="3" marker-end="url(#a)"/>
  <path d="M1090 230 H900" stroke="${C.green}" stroke-width="3" marker-end="url(#g)"/>
  <text x="380" y="135" font-size="17" fill="${C.sub}">loads the iframe</text>
  <text x="915" y="135" font-size="17" fill="${C.sub}">GET model.ifc</text>
  <text x="915" y="265" font-size="17" fill="${C.green}" font-weight="600">Access-Control-Allow-Origin ✓</text>
</svg>
<div class="b" style="left:0;top:90px;width:360px;border-color:${C.line}"><div class="t">Your page</div><div class="s">blog · CDE panel · Power BI</div></div>
<div class="b" style="left:560px;top:90px;width:340px;border-color:${C.brand}"><div class="t" style="color:${C.brand}">Viewer in the visitor's browser</div><div class="s">?model=…&amp;embed=1</div></div>
<div class="b" style="left:1090px;top:90px;width:370px;border-color:${C.green}"><div class="t" style="color:${C.green}">Your storage</div><div class="s">S3 · Azure Blob · GCS · own server</div></div>
<div class="card" style="position:absolute;left:0;top:340px;width:1460px;padding:20px 26px;font-size:18px;line-height:1.7;color:${C.sub}">
  <b style="color:${C.ink};font-size:20px">When it does not load</b><br>
  <span style="color:${C.red}">✗</span> no CORS header on the host &nbsp;·&nbsp; <span style="color:${C.red}">✗</span> a share link that returns a preview page, not the file &nbsp;·&nbsp; <span style="color:${C.red}">✗</span> a private link that needs a login
</div>`,
})

// 11. True north vs project north
FIGURES['sun-study-true-north-vs-project-north'] = () => page({
  kicker: 'Sun & shadow studies',
  title: 'Project north is not true north',
  lede: 'Models are often drawn with project north up. The rotation to true north lives in the georeferencing — ignore it and every shadow is wrong by the same angle.',
  body: `<svg width="1460" height="560">
    <g transform="translate(330,290)">
      <circle r="230" fill="#fff" stroke="${C.line}" stroke-width="2"/>
      <rect x="-90" y="-60" width="180" height="120" rx="6" fill="${C.brandSoft}" stroke="${C.brand}" stroke-width="3"/>
      <text x="0" y="95" text-anchor="middle" font-size="20" font-weight="700" fill="${C.brand}">building</text>
      <line x1="0" y1="0" x2="0" y2="-205" stroke="${C.sub}" stroke-width="4" stroke-dasharray="10 8"/>
      <text x="-118" y="-212" font-size="20" font-weight="600" fill="${C.sub}">Project N</text>
      <g transform="rotate(28)"><line x1="0" y1="0" x2="0" y2="-210" stroke="${C.red}" stroke-width="5"/><polygon points="-12,-195 12,-195 0,-226" fill="${C.red}"/></g>
      <text x="108" y="-188" font-size="22" font-weight="700" fill="${C.red}">True N</text>
      <path d="M0 -120 A120 120 0 0 1 56 -106" stroke="${C.amber}" stroke-width="4" fill="none"/>
      <text x="12" y="-150" font-size="20" font-weight="700" fill="${C.amber}">28°</text>
    </g>
    <g font-size="20" fill="${C.sub}">
      <text x="680" y="120" font-size="26" font-weight="700" fill="${C.ink}">What a correct study needs</text>
      <text x="680" y="170"><tspan fill="${C.brand}" font-weight="700">Latitude / longitude</tspan> — IfcSite or IfcMapConversion</text>
      <text x="680" y="210"><tspan fill="${C.red}" font-weight="700">True north</tspan> — the rotation in the georeferencing</text>
      <text x="680" y="250"><tspan fill="${C.green}" font-weight="700">Time zone</tspan> — derived from the location</text>
      <text x="680" y="320" font-size="24" font-weight="700" fill="${C.ink}">Quick check</text>
      <text x="680" y="360">Plan view at noon: northern hemisphere shadows point</text>
      <text x="680" y="390">roughly north, southern hemisphere roughly south.</text>
      <text x="680" y="430">If they point at a façade, north is wrong.</text>
    </g></svg>`,
})

// 12. Snap targets
FIGURES['measure-snap-targets-vertex-edge-face'] = () => {
  const box = (x, title, sub, svg) => `<div class="card t" style="left:${x}px"><svg width="300" height="220">${svg}</svg><b>${title}</b><span>${sub}</span></div>`
  const wall = `<polygon points="40,170 150,200 260,150 150,120" fill="${C.brandSoft}" stroke="${C.brand}" stroke-width="2"/><polygon points="40,170 40,60 150,90 150,200" fill="#fff" stroke="${C.brand}" stroke-width="2"/><polygon points="150,200 150,90 260,40 260,150" fill="#eef2ff" stroke="${C.brand}" stroke-width="2"/>`
  return page({
    kicker: 'Measuring IFC models',
    title: 'What a measurement snaps to decides whether the number is real',
    lede: 'Good snapping finds the geometry you meant and shows it before you click — with a tolerance in screen pixels, so it behaves the same at every zoom.',
    css: `.t{position:absolute;top:0;width:340px;padding:18px 20px;text-align:center}.t b{display:block;font-size:24px;margin-top:4px}.t span{display:block;font-size:16px;color:${C.sub};margin-top:6px;line-height:1.4}`,
    body: `
${box(0, 'Vertex', 'corners, beam ends, grid intersections', `${wall}<circle cx="150" cy="90" r="11" fill="none" stroke="${C.green}" stroke-width="4"/><circle cx="150" cy="90" r="4" fill="${C.green}"/>`)}
${box(373, 'Edge midpoint', 'centre of a face, mid-span', `${wall}<polygon points="205,57 218,70 205,83 192,70" fill="none" stroke="${C.amber}" stroke-width="4" transform="translate(0,-5)"/>`)}
${box(746, 'Edge', 'clear widths, door openings', `${wall}<line x1="150" y1="200" x2="260" y2="150" stroke="${C.cyan}" stroke-width="6"/><circle cx="214" cy="171" r="6" fill="${C.cyan}"/>`)}
${box(1119, 'Face', 'areas, distance to a surface', `${wall.replace('#eef2ff', C.violetSoft)}<text x="205" y="128" text-anchor="middle" font-size="18" font-weight="700" fill="${C.violet}">m²</text>`)}
<div class="card" style="position:absolute;left:0;top:345px;width:1460px;padding:18px 24px;font-size:18px;color:${C.sub};line-height:1.6">
<b style="color:${C.ink}">The test every viewer should pass:</b> cut a section, then click an element that is only visible because of the cut. If the pick lands on the hidden façade, the picker ignores clipping planes — and every interior measurement is suspect.</div>`,
  })
}

// 13. Walk controls
FIGURES['ifc-walk-mode-keyboard-controls'] = () => {
  const key = (x, y, k, on = false, w = 84) => `<div class="k ${on ? 'on' : ''}" style="left:${x}px;top:${y}px;width:${w}px">${k}</div>`
  return page({
    kicker: 'First-person walk mode',
    title: 'Walking through an IFC model: the controls',
    lede: 'Eye height, no collision on purpose — stepping through a wall into the next room is usually what a reviewer wants.',
    css: `.k{position:absolute;height:84px;border-radius:14px;background:#fff;border:2px solid ${C.line};border-bottom-width:6px;display:flex;align-items:center;justify-content:center;font-family:GeistMono,monospace;font-size:30px;font-weight:500}
      .k.on{border-color:${C.brand};color:${C.brand};background:${C.brandSoft}}
      .lab{position:absolute;font-size:19px;color:${C.sub}}.lab b{color:${C.ink};font-size:21px;display:block}`,
    body: `
${key(120, 40, 'G', true)}<div class="lab" style="left:120px;top:140px"><b>Enter / leave</b>walk mode</div>
${key(470, 20, 'W', true)}${key(380, 112, 'A', true)}${key(470, 112, 'S', true)}${key(560, 112, 'D', true)}
<div class="lab" style="left:400px;top:210px"><b>Move</b>or the arrow keys</div>
<div class="card" style="position:absolute;left:820px;top:20px;width:640px;padding:22px 26px;font-size:19px;line-height:1.9;color:${C.sub}">
  <div><b style="color:${C.ink}">Mouse</b> — look around (click to capture the cursor)</div>
  <div><b style="color:${C.ink}">Wheel</b> — walking speed</div>
  <div><b style="color:${C.ink}">Double-click a floor</b> — glide there at 1.65 m</div>
  <div><b style="color:${C.ink}">Crosshair</b> — clicks select what you are looking at</div>
</div>
<div class="card" style="position:absolute;left:0;top:320px;width:1460px;padding:20px 26px;font-size:18.5px;color:${C.sub};line-height:1.7">
  <b style="color:${C.ink};font-size:20px">What walking finds that orbiting misses</b><br>
  door swings into columns · headroom under stairs and ducts · sightlines from reception · the route from the lift lobby to the stair · rooms that meet the area and still feel wrong
</div>`,
  })
}

// 14. Vertical video: crop vs fit
FIGURES['vertical-video-fit-vs-crop-building'] = () => {
  const phone = (x, title, ok, inner) => `<div style="position:absolute;left:${x}px;top:0;text-align:center;width:300px">
    <div style="width:250px;height:444px;margin:0 auto;border-radius:30px;border:6px solid ${C.ink};overflow:hidden;position:relative;background:#cbd5e1">${inner}</div>
    <div style="font-size:24px;font-weight:700;margin-top:14px;color:${ok ? C.green : C.red}">${ok ? '✓' : '✗'} ${title}</div></div>`
  const building = (w, left, bottom = 150) => `<div style="position:absolute;left:${left}px;bottom:${bottom}px;width:${w}px;height:150px;background:linear-gradient(${C.brand},#3f4ab0);border-radius:4px"></div>
    <div style="position:absolute;left:${left + w * 0.35}px;bottom:${bottom + 150}px;width:${w * 0.2}px;height:60px;background:#3f4ab0"></div>`
  return page({
    kicker: 'IFC model video for social media',
    title: 'Vertical video of a wide building: fit, don’t crop',
    lede: 'A centre crop of a landscape recording to 9:16 keeps about a third of the width. Fitting keeps the whole building — and the bands become the place for the title.',
    body: `
<div class="card" style="position:absolute;left:0;top:60px;width:560px;height:315px;overflow:hidden;background:#cbd5e1">${building(470, 45, 50)}
  <div style="position:absolute;left:187px;top:0;width:177px;height:315px;border:4px dashed ${C.red}"></div>
  <div style="position:absolute;left:14px;bottom:12px;font-size:18px;font-weight:600;color:${C.ink}">16:9 recording</div></div>
${phone(650, 'Centre crop', false, `<div style="position:absolute;left:-245px;top:0;width:740px;height:444px">${building(620, 60)}</div>`)}
${phone(1050, 'Fit + blurred bands', true, `<div style="position:absolute;inset:0;filter:blur(10px);opacity:.55">${building(240, 5)}</div>
  <div style="position:absolute;left:0;right:0;top:140px;height:140px;background:#cbd5e1;overflow:hidden"><div style="position:relative;width:250px;height:140px;transform:scale(1)">${building(220, 15).replace(/bottom:150px/g, 'bottom:0px').replace(/bottom:300px/g, 'bottom:66px').replace(/height:150px/g, 'height:66px')}</div></div>
  <div style="position:absolute;left:14px;right:14px;top:40px;font-size:22px;font-weight:700;color:${C.ink};line-height:1.15">Tower Poblenou<br><span style="font-size:15px;font-weight:500">Structure in 20 s</span></div>`)}`,
  })
}

// 15. Presentation image types
FIGURES['ifc-presentation-image-types'] = () => {
  const t = (x, y, name, use, art) => `<div class="card it" style="left:${x}px;top:${y}px"><div class="art">${art}</div><b>${name}</b><span>${use}</span></div>`
  return page({
    kicker: 'Presentation images from IFC',
    title: 'Four images every project needs — all from the model',
    css: `.it{position:absolute;width:705px;height:255px;display:grid;grid-template-columns:300px 1fr;grid-template-rows:auto 1fr;column-gap:24px;padding:20px}
      .art{grid-row:span 2;border-radius:12px;background:${C.bg};border:1.5px solid ${C.line};position:relative;overflow:hidden}
      .it b{font-size:26px;margin-top:8px}.it span{font-size:18px;color:${C.sub};line-height:1.45}`,
    body: `
${t(0, 0, 'Cover', 'Reports, bids, the project page. One strong view, the project name, room to breathe.', `<div style="position:absolute;left:40px;right:40px;top:30px;bottom:60px;background:linear-gradient(${C.brand},#3f4ab0);border-radius:6px"></div><div style="position:absolute;left:40px;bottom:22px;font-weight:700;font-size:20px">Project name</div>`)}
${t(755, 0, 'Board', 'Design reviews. Exterior, section and plan in one consistent look.', `<div style="position:absolute;left:16px;top:16px;width:170px;bottom:16px;background:${C.brandSoft};border-radius:6px"></div><div style="position:absolute;left:198px;top:16px;right:16px;height:95px;background:${C.cyanSoft};border-radius:6px"></div><div style="position:absolute;left:198px;bottom:16px;right:16px;height:95px;background:${C.greenSoft};border-radius:6px"></div>`)}
${t(0, 285, 'Data sheet', 'Handover and client updates. A view, the key facts and a QR code to the live model.', `<div style="position:absolute;left:16px;top:16px;right:16px;height:110px;background:${C.brandSoft};border-radius:6px"></div>${[0, 1, 2].map((i) => `<div style="position:absolute;left:16px;top:${140 + i * 24}px;width:${150 - i * 30}px;height:12px;background:${C.line};border-radius:4px"></div>`).join('')}<div style="position:absolute;right:18px;bottom:16px;width:60px;height:60px;background:repeating-conic-gradient(${C.ink} 0 25%,#fff 0 50%) 0 0/15px 15px"></div>`)}
${t(755, 285, 'Coordination view', 'Coordination meetings. Disciplines in consistent colours, architecture translucent.', `<div style="position:absolute;left:30px;top:30px;right:30px;bottom:30px;border:3px solid ${C.faint};border-radius:6px;opacity:.6"></div><div style="position:absolute;left:60px;top:40px;width:22px;bottom:40px;background:${C.red}"></div><div style="position:absolute;left:200px;top:40px;width:22px;bottom:40px;background:${C.red}"></div><div style="position:absolute;left:40px;top:90px;right:40px;height:16px;background:${C.cyan}"></div><div style="position:absolute;left:40px;top:150px;right:40px;height:10px;background:${C.amber}"></div>`)}`,
  })
}

// 16. IFC placement chain
FIGURES['ifc-local-placement-chain'] = () => page({
  kicker: 'IFC coordinates',
  title: 'An element’s position is a chain of relative placements',
  lede: 'Each IfcLocalPlacement is relative to its parent. The model’s position on Earth is decided once, at the top — by IfcSite and IfcMapConversion.',
  css: `.p{position:absolute;padding:14px 18px;border-radius:14px;background:#fff;border:2px solid;box-shadow:0 6px 18px rgba(15,23,42,.06)}
    .p .t{font-size:22px;font-weight:700}.p .s{font-family:GeistMono,monospace;font-size:15px;color:${C.sub};margin-top:4px}`,
  body: `
<svg width="1460" height="560" style="position:absolute;left:0;top:0"><g stroke="${C.brand}" stroke-width="3" fill="none" stroke-dasharray="8 6">
  <path d="M300 60 H360"/><path d="M660 60 H720"/><path d="M1020 60 H1080"/><path d="M1230 105 V170"/></g></svg>
<div class="p" style="left:0;top:20px;width:300px;border-color:${C.red}"><div class="t" style="color:${C.red}">IfcMapConversion</div><div class="s">E 431 250 · N 4 582 900 · rot 28°</div></div>
<div class="p" style="left:360px;top:20px;width:300px;border-color:${C.brand}"><div class="t" style="color:${C.brand}">IfcSite</div><div class="s">placement (0, 0, 0)</div></div>
<div class="p" style="left:720px;top:20px;width:300px;border-color:${C.brand}"><div class="t" style="color:${C.brand}">IfcBuilding</div><div class="s">relative to site (0, 0, 0)</div></div>
<div class="p" style="left:1080px;top:20px;width:300px;border-color:${C.brand}"><div class="t" style="color:${C.brand}">IfcBuildingStorey</div><div class="s">relative to building (0, 0, 3.20)</div></div>
<div class="p" style="left:1080px;top:170px;width:300px;border-color:${C.green}"><div class="t" style="color:${C.green}">IfcWall</div><div class="s">relative to storey (12.4, 3.1, 0)</div></div>
<div class="card" style="position:absolute;left:0;top:320px;width:1460px;padding:22px 26px;font-size:18.5px;color:${C.sub};line-height:1.8">
<b style="color:${C.ink};font-size:21px">Where it goes wrong</b><br>
<span style="color:${C.red}">●</span> real-world coordinates stored in the element placements instead of IfcMapConversion → GPU jitter, models kilometres apart<br>
<span style="color:${C.red}">●</span> one discipline exported from a different base point → federated models do not line up<br>
<span style="color:${C.red}">●</span> missing rotation → every sun study and map overlay is turned by the same angle</div>`,
})

// ── Render ───────────────────────────────────────────────────────────────────

const only = process.argv.slice(2)
const names = only.length ? only : Object.keys(FIGURES)
for (const n of names) if (!FIGURES[n]) throw new Error(`unknown figure ${n}`)
mkdirSync(OUT, { recursive: true })

const browser = await chromium.launch({ executablePath: EXE })
try {
  for (const [scale, suffix] of [[1, ''], [0.5, '-800']]) {
    const ctx = await browser.newContext({ viewport: { width: W, height: H }, deviceScaleFactor: scale })
    const pg = await ctx.newPage()
    for (const n of names) {
      await pg.setContent(FIGURES[n](), { waitUntil: 'load' })
      await pg.evaluate(() => document.fonts.ready)
      await pg.screenshot({ path: `${OUT}/${n}${suffix}.png`, type: 'png' })
      if (!suffix) log('✓ ', n)
    }
    await ctx.close()
  }
} finally {
  await browser.close()
}
log(`done (${names.length} figures → ${OUT}/)`)
