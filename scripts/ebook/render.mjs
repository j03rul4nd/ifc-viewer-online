// ─── Ebook renderer — book data → print-ready HTML ────────────────────────────
//
// Pure string work: no Playwright, no filesystem, no state. build-ebook.mjs
// supplies the rule data (generated from the shipping validator) and the page
// numbers measured in the pagination pass, then hands the HTML to Chrome.
//
// Layout contract with Chrome's PDF engine:
//   @page          A4, 18mm top / 16mm bottom, ZERO side margin — horizontal
//                  padding is CSS so panels can bleed to the paper edge.
//   @page :first   margin 0 → the cover is full-bleed AND Chrome suppresses the
//                  running footer on it (there is no margin box to draw in).
//   Everything else uses Chrome's displayHeaderFooter footer (page numbers),
//   because CSS paged-media counters are not supported in Chromium.

const SEVERITY = {
  error:   { label: 'Error',   color: '#DC2626', tint: '#FEF2F2' },
  warning: { label: 'Warning', color: '#D97706', tint: '#FFFBEB' },
  info:    { label: 'Info',    color: '#64748B', tint: '#F8FAFC' },
}

const CATEGORY_ORDER = [
  'schema', 'spatial', 'quality', 'lod', 'iso19650', 'classification', 'mep', 'clash',
]

/** One-line framing for each category — why the group exists, not what it contains. */
const CATEGORY_INTRO = {
  schema:         'Faults in the file itself: identifiers, references and structural integrity. These break tools rather than degrade information, which is why they carry the heaviest weights.',
  spatial:        'The project → site → building → storey → space hierarchy every element should hang from. Break it and filtering, scheduling and federation quietly degrade.',
  quality:        'Information that is present but empty, missing or meaningless. Rarely fatal on its own, cumulatively the difference between a model and a picture.',
  lod:            'Whether elements carry the alphanumeric detail their declared level of information need implies — property sets, quantities, material layers.',
  iso19650:       'Project and author metadata, and the naming convention that lets an information container be identified without opening it.',
  classification: 'Whether elements reference an agreed classification system, which is what makes cost, procurement and asset data possible.',
  mep:            'System assignment and connectivity for services elements — the difference between pipes and a network.',
  clash:          'Geometric interference between elements. Included as a coarse pre-flight sweep, not as a substitute for a coordination clash workflow.',
}

const TOOL_LABEL = {
  revit:    'Revit',
  archicad: 'ArchiCAD',
  tekla:    'Tekla Structures',
  allplan:  'Allplan',
}

// ── Inline markup ─────────────────────────────────────────────────────────────

function esc(s) {
  return String(s)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
}

/** **bold**, *italic*, `code`, [label](url) — applied after HTML escaping. */
function inline(s) {
  return esc(s)
    .replace(/`([^`]+)`/g, '<code>$1</code>')
    .replace(/\*\*([^*]+)\*\*/g, '<strong>$1</strong>')
    .replace(/\*([^*\n]+)\*/g, '<em>$1</em>')
    .replace(/\[([^\]]+)\]\(([^)]+)\)/g, '<a href="$2">$1</a>')
}

/** Slug used for internal PDF anchors. */
export function anchorOf(id) {
  return `ch-${id}`
}

// ── Blocks ────────────────────────────────────────────────────────────────────

function renderTable(b) {
  const head = b.headers.map(h => `<th>${inline(h)}</th>`).join('')
  const body = b.rows
    .map(r => `<tr>${r.map((c, i) => (i === 0 ? `<th scope="row">${inline(c)}</th>` : `<td>${inline(c)}</td>`)).join('')}</tr>`)
    .join('')
  const cap = b.caption ? `<figcaption>${inline(b.caption)}</figcaption>` : ''
  return `<figure class="tbl"><table><thead><tr>${head}</tr></thead><tbody>${body}</tbody></table>${cap}</figure>`
}

function renderBlock(b, ctx) {
  switch (b.t) {
    case 'h2':   return `<h2>${inline(b.text)}</h2>`
    case 'h3':   return `<h3>${inline(b.text)}</h3>`
    case 'h4':   return `<h4>${inline(b.text)}</h4>`
    case 'lead': return `<p class="lead">${inline(b.text)}</p>`
    case 'p':    return `<p>${inline(b.text)}</p>`
    case 'pull': return `<blockquote class="pull">${inline(b.text)}</blockquote>`
    case 'code': return `<pre class="code">${esc(b.text)}</pre>`

    case 'ul':
      return `<ul>${b.items.map(i => `<li>${inline(i)}</li>`).join('')}</ul>`
    case 'ol':
      return `<ol>${b.items.map(i => `<li>${inline(i)}</li>`).join('')}</ol>`

    case 'steps':
      return `<ol class="steps">${b.items
        .map(i => `<li><span class="steps__t">${inline(i.title)}</span><span class="steps__b">${inline(i.text)}</span></li>`)
        .join('')}</ol>`

    case 'checklist':
      return `<ul class="check">${b.items.map(i => `<li>${inline(i)}</li>`).join('')}</ul>`

    case 'callout':
      return `<aside class="note note--${b.kind}">${
        b.title ? `<p class="note__t">${inline(b.title)}</p>` : ''
      }<p>${inline(b.text)}</p></aside>`

    case 'clause':
      return `<figure class="clause"><figcaption><span class="clause__id">${inline(b.id)}</span>${
        inline(b.title)
      }</figcaption><div class="clause__body">${b.text
        .split('\n')
        .map(l => (l.trim() === '' ? '<br>' : `<p>${inline(l)}</p>`))
        .join('')}</div></figure>`

    case 'table':          return renderTable(b)
    case 'weights-table':  return renderWeights(ctx.weights)
    case 'rules-index':    return renderCategoryIndex(ctx.rules)
    case 'rules-quickref': return renderQuickRef(ctx.rules)
    case 'rules-reference':return renderRuleReference(ctx.rules)
    case 'pagebreak':      return '<div class="pagebreak"></div>'

    default:
      throw new Error(`[ebook] unknown block type: ${b.t}`)
  }
}

// ── Generated blocks (from the shipping validator) ────────────────────────────

function renderWeights({ CATEGORY_WEIGHTS, DEFAULT_WEIGHTS }) {
  const rows = CATEGORY_ORDER.map((c) => {
    const w = CATEGORY_WEIGHTS[c] ?? DEFAULT_WEIGHTS
    return `<tr><th scope="row">${esc(catLabel(c))}</th><td>${w.error}</td><td>${w.warning}</td><td>${w.info}</td></tr>`
  }).join('')
  return `<figure class="tbl tbl--num"><table>
    <thead><tr><th>Category</th><th>Error</th><th>Warning</th><th>Info</th></tr></thead>
    <tbody>${rows}</tbody></table>
    <figcaption>Points deducted for the first occurrence of a finding. Generated from the validator's own weight table.</figcaption></figure>`
}

let CAT_LABELS = {}
export function setCategoryLabels(labels) { CAT_LABELS = labels }
function catLabel(c) { return CAT_LABELS[c] ?? c }

function renderCategoryIndex(rules) {
  const cards = CATEGORY_ORDER.map((c) => {
    const inCat = rules.filter(r => r.category === c)
    const errors = inCat.filter(r => r.severity === 'error').length
    return `<div class="cat">
      <p class="cat__h"><span class="cat__dot cat--${c}"></span>${esc(catLabel(c))}</p>
      <p class="cat__n">${inCat.length} check${inCat.length === 1 ? '' : 's'}${errors ? ` · ${errors} at error` : ''}</p>
      <p class="cat__b">${esc(CATEGORY_INTRO[c] ?? '')}</p>
    </div>`
  }).join('')
  return `<div class="catgrid">${cards}</div>`
}

function renderQuickRef(rules) {
  const rows = [...rules]
    .sort((a, b) => a.id.localeCompare(b.id))
    .map(r => `<tr>
      <th scope="row"><code>${esc(r.id.replace(/^RULE_/, ''))}</code></th>
      <td>${esc(r.label)}</td>
      <td>${esc(catLabel(r.category))}</td>
      <td><span class="sev sev--${r.severity}">${SEVERITY[r.severity].label}</span></td>
    </tr>`).join('')
  return `<figure class="tbl tbl--ref"><table>
    <thead><tr><th>Identifier</th><th>Check</th><th>Category</th><th>Default</th></tr></thead>
    <tbody>${rows}</tbody></table></figure>`
}

function renderRuleReference(rules) {
  let out = ''
  let n = 0
  for (const cat of CATEGORY_ORDER) {
    const inCat = rules.filter(r => r.category === cat)
    if (inCat.length === 0) continue
    out += `<section class="catsec">
      <h2 class="catsec__h"><span class="cat__dot cat--${cat}"></span>${esc(catLabel(cat))}
        <span class="catsec__n">${inCat.length} check${inCat.length === 1 ? '' : 's'}</span></h2>
      <p class="catsec__i">${esc(CATEGORY_INTRO[cat] ?? '')}</p>`

    for (const r of inCat) {
      n += 1
      const sev = SEVERITY[r.severity]
      const tools = Object.entries(r.remediation?.tools ?? {})
        .filter(([k]) => TOOL_LABEL[k])
        .map(([k, v]) => `<div class="tool"><p class="tool__h">${esc(TOOL_LABEL[k])}</p><p>${esc(v)}</p></div>`)
        .join('')
      out += `<article class="rule rule--${r.severity}">
        <header class="rule__h">
          <p class="rule__n">${String(n).padStart(2, '0')}</p>
          <div>
            <h3>${esc(r.label)}</h3>
            <p class="rule__id"><code>${esc(r.id)}</code></p>
          </div>
          <div class="rule__tags">
            <span class="sev sev--${r.severity}" style="--sev:${sev.color}">${sev.label}</span>
            ${r.autoFixable ? '<span class="tag tag--auto">Auto-fixable</span>' : ''}
          </div>
        </header>
        <p class="rule__d">${esc(r.desc)}</p>
        <p class="rule__meta"><span>Category</span>${esc(catLabel(r.category))}<span>Reference</span>${esc(r.standard)}</p>
        ${r.remediation?.summary ? `<p class="rule__fix"><span class="rule__fixh">The fix</span>${esc(r.remediation.summary)}</p>` : ''}
        ${tools ? `<div class="tools">${tools}</div>` : ''}
      </article>`
    }
    out += '</section>'
  }
  return out
}

// ── Front matter ──────────────────────────────────────────────────────────────

function renderCover(book) {
  const marks = (book.marks ?? []).map(m =>
    `<div><p class="cover__k">${esc(m.k)}</p><p class="cover__l">${m.l.map(esc).join('<br>')}</p></div>`,
  ).join('')
  // Two cover themes so the handbooks are told apart at thumbnail size, where
  // the title is unreadable and only the colour registers. 'dark' is the
  // indigo house style; 'paper' is warm off-white with a teal accent.
  const theme = book.coverTheme === 'paper' ? ' cover--paper' : ''
  return `<section class="cover${theme}">
    <div class="cover__top">
      <p class="cover__brand">${esc(book.publisher)}</p>
      <p class="cover__ed">${esc(book.edition)} · ${esc(book.year)}</p>
    </div>
    <div class="cover__mid">
      <p class="cover__eyebrow">${esc(book.eyebrow)}</p>
      <h1>${esc(book.title)}</h1>
      <p class="cover__sub">${esc(book.subtitle)}</p>
    </div>
    ${marks ? `<div class="cover__marks">${marks}</div>` : ''}
    <div class="cover__foot">
      <p>${esc(book.author)}</p>
      <p>${esc(book.siteUrl.replace(/^https?:\/\//, ''))}</p>
    </div>
  </section>`
}

function renderColophon(book, generatedOn) {
  return `<section class="colophon">
    <h2>${esc(book.title)}</h2>
    <p class="colophon__sub">${esc(book.subtitle)}</p>
    <dl>
      <dt>Edition</dt><dd>${esc(book.edition)}, ${esc(book.year)}</dd>
      <dt>Author</dt><dd>${esc(book.author)}</dd>
      <dt>Published by</dt><dd>${esc(book.publisher)} — ${esc(book.siteUrl)}</dd>
      <dt>Compiled</dt><dd>${esc(generatedOn)}</dd>
      <dt>Retail value</dt><dd>${esc(book.retail)} — ${esc(book.isbnNote)}</dd>
    </dl>
    <p class="colophon__note">${esc(book.colophonNote)}</p>
    <p class="colophon__note">Clauses, checklists and email templates in this handbook may be copied and adapted freely
      for use on your own projects. They are drafting aids, not legal advice.</p>
    <p class="colophon__share">Share it rather than forward it: <strong>${esc(book.siteUrl.replace(/^https?:\/\//, ''))}/ebook/</strong></p>
  </section>`
}

function renderToc(chapters, pageNumbers) {
  const items = chapters.map((c) => {
    const p = pageNumbers[c.id]
    return `<li${c.num ? '' : ' class="toc--minor"'}>
      <a href="#${anchorOf(c.id)}">
        <span class="toc__k">${esc(c.kicker)}</span>
        <span class="toc__t">${esc(c.title)}</span>
        <span class="toc__dots"></span>
        <span class="toc__p">${p ?? ''}</span>
      </a></li>`
  }).join('')
  return `<section class="toc"><h2>Contents</h2><ol>${items}</ol></section>`
}

// ── Document ──────────────────────────────────────────────────────────────────

export function renderBook({ book, chapters, rules, weights, categoryLabels, pageNumbers = {}, generatedOn, fontsHref }) {
  setCategoryLabels(categoryLabels)
  const ctx = { rules, weights }

  const body = chapters.map((c) => {
    const inner = c.blocks.map(b => renderBlock(b, ctx)).join('\n')
    return `<section class="chapter" id="${anchorOf(c.id)}">
      <header class="chapter__h">
        <p class="chapter__k">${esc(c.kicker)}</p>
        <h1>${esc(c.title)}</h1>
        ${c.num ? `<p class="chapter__n">${String(c.num).padStart(2, '0')}</p>` : ''}
      </header>
      ${inner}
    </section>`
  }).join('\n')

  return `<!doctype html>
<html lang="en"><head>
<meta charset="utf-8">
<title>${esc(book.title)}</title>
<style>${CSS(fontsHref)}</style>
</head><body>
${renderCover(book)}
${renderColophon(book, generatedOn)}
${renderToc(chapters, pageNumbers)}
${body}
</body></html>`
}

// ── Social card ───────────────────────────────────────────────────────────────
// 1200×630 Open Graph image for /ebook. Rendered from the same tokens as the
// book so a shared link looks like the thing it links to.

export function renderOgCard({ book, pages, coverHref, fontsHref }) {
  // Same two themes as the cover, so the card and the book it advertises match.
  const paper = book.coverTheme === 'paper'
  return `<!doctype html><html><head><meta charset="utf-8"><style>
@font-face { font-family:'Geist'; font-weight:400; src:url('${fontsHref}/geist-400.woff2') format('woff2'); }
@font-face { font-family:'Geist'; font-weight:600; src:url('${fontsHref}/geist-600.woff2') format('woff2'); }
@font-face { font-family:'Instrument Serif'; font-weight:400; src:url('${fontsHref}/instrument-serif-400.woff2') format('woff2'); }
*{box-sizing:border-box;margin:0}
body{width:1200px;height:630px;display:flex;align-items:center;gap:64px;padding:64px 72px;
  font-family:'Geist',sans-serif;color:${paper ? '#3A4A46' : '#EDEFF5'};
  background:${paper
    ? `radial-gradient(110% 80% at 88% 6%, rgba(13,148,136,.20) 0%, rgba(13,148,136,0) 58%),
       radial-gradient(80% 60% at 4% 98%, rgba(15,118,110,.16) 0%, rgba(15,118,110,0) 62%), #F4F2EC`
    : `radial-gradient(110% 80% at 88% 6%, rgba(94,106,232,.42) 0%, rgba(94,106,232,0) 55%),
       radial-gradient(80% 60% at 4% 98%, rgba(54,69,196,.32) 0%, rgba(54,69,196,0) 60%), #08090E`};}
.txt{flex:1}
.badge{display:inline-block;padding:7px 14px;border-radius:999px;
  border:1px solid ${paper ? 'rgba(15,118,110,.35)' : 'rgba(255,255,255,.18)'};
  font-size:16px;letter-spacing:.12em;text-transform:uppercase;
  color:${paper ? '#0F766E' : '#A9B1F2'};margin-bottom:26px}
h1{font-family:'Instrument Serif',serif;font-weight:400;font-size:74px;line-height:.98;
  letter-spacing:-.015em;color:${paper ? '#0E2B27' : '#fff'}}
p.sub{margin-top:20px;font-size:23px;line-height:1.42;color:${paper ? '#4A5D58' : '#B9C0D4'};max-width:560px}
ul{margin-top:30px;display:flex;gap:34px;list-style:none;padding:0}
li{font-size:17px;color:${paper ? '#6B7C77' : '#9BA3BC'}}
li b{display:block;font-family:'Instrument Serif',serif;font-size:34px;
  color:${paper ? '#0E2B27' : '#fff'};font-weight:400;margin-bottom:2px}
img{height:502px;border-radius:8px;box-shadow:0 30px 60px -18px rgba(0,0,0,${paper ? '.28' : '.75'}),
  0 0 0 1px ${paper ? 'rgba(14,43,39,.22)' : 'rgba(255,255,255,.08)'}}
</style></head><body>
<div class="txt">
  <span class="badge">Free PDF · ${esc(book.publisher)}</span>
  <h1>${esc(book.title)}</h1>
  <p class="sub">${esc(book.subtitle)}</p>
  <ul>
    <li><b>${pages}</b>pages</li>
    ${(book.ogMarks ?? []).map(m => `<li><b>${esc(m.k)}</b>${esc(m.l)}</li>`).join('')}
    <li><b>${esc(book.retail)}</b>value, free</li>
  </ul>
</div>
<img src="${coverHref}" alt="">
</body></html>`
}

// ── Stylesheet ────────────────────────────────────────────────────────────────

function CSS(fonts) {
  return `
@font-face { font-family:'Geist'; font-weight:400; src:url('${fonts}/geist-400.woff2') format('woff2'); }
@font-face { font-family:'Geist'; font-weight:500; src:url('${fonts}/geist-500.woff2') format('woff2'); }
@font-face { font-family:'Geist'; font-weight:600; src:url('${fonts}/geist-600.woff2') format('woff2'); }
@font-face { font-family:'Geist'; font-weight:700; src:url('${fonts}/geist-700.woff2') format('woff2'); }
@font-face { font-family:'Geist Mono'; font-weight:400; src:url('${fonts}/geist-mono-400.woff2') format('woff2'); }
@font-face { font-family:'Geist Mono'; font-weight:500; src:url('${fonts}/geist-mono-500.woff2') format('woff2'); }
@font-face { font-family:'Instrument Serif'; font-weight:400; src:url('${fonts}/instrument-serif-400.woff2') format('woff2'); }

:root{
  --ink:#0B0D1A; --body:#23283A; --dim:#5B6478; --faint:#8A92A6;
  --accent:#3645C4; --accent-2:#5E6AD2; --line:#E2E6F0; --panel:#F6F7FB;
  --err:#DC2626; --warn:#D97706; --info:#64748B; --ok:#16A34A;
  --pad:32mm;
}
@page { size:A4; margin:18mm 0 16mm 0; }
@page :first { margin:0; }

*{box-sizing:border-box}
html{-webkit-print-color-adjust:exact; print-color-adjust:exact}
body{
  margin:0; font-family:'Geist',system-ui,sans-serif; color:var(--body);
  font-size:10.4pt; line-height:1.62; letter-spacing:.002em;
  font-variant-numeric:tabular-nums;
}
p{margin:0 0 .85em}
strong{color:var(--ink); font-weight:600}
a{color:var(--accent); text-decoration:none; border-bottom:.4pt solid rgba(54,69,196,.35)}
code{font-family:'Geist Mono',monospace; font-size:.88em; color:var(--ink);
  background:var(--panel); border:.4pt solid var(--line); border-radius:2pt; padding:.5pt 2.5pt}

/* ── Cover ─────────────────────────────────────────────────────────────── */
.cover{
  width:210mm; height:297mm; padding:26mm 24mm 22mm; color:#EDEFF5;
  background:
    radial-gradient(120% 80% at 82% 8%, rgba(94,106,232,.42) 0%, rgba(94,106,232,0) 55%),
    radial-gradient(90% 60% at 8% 96%, rgba(54,69,196,.34) 0%, rgba(54,69,196,0) 60%),
    #08090E;
  display:flex; flex-direction:column; justify-content:space-between;
  break-after:page;
}
.cover__top{display:flex; justify-content:space-between; align-items:baseline;
  font-size:8.6pt; letter-spacing:.14em; text-transform:uppercase; color:#9BA3BC}
.cover__brand{color:#EDEFF5; font-weight:600}
.cover__eyebrow{font-size:9pt; letter-spacing:.16em; text-transform:uppercase; color:#8E97F5; margin-bottom:8mm}
.cover h1{
  font-family:'Instrument Serif',Georgia,serif; font-weight:400;
  font-size:58pt; line-height:.98; letter-spacing:-.012em; color:#fff; margin:0 0 7mm;
}
.cover__sub{font-size:13pt; line-height:1.45; color:#B9C0D4; max-width:145mm; margin:0}
.cover__marks{display:flex; gap:14mm; padding-top:9mm; border-top:.6pt solid rgba(255,255,255,.14)}
.cover__k{font-family:'Instrument Serif',serif; font-size:30pt; line-height:1; color:#fff; margin:0 0 2mm}
.cover__l{font-size:8.4pt; line-height:1.35; color:#9BA3BC; margin:0}
.cover__foot{display:flex; justify-content:space-between; font-size:9pt; color:#9BA3BC}
.cover__foot p{margin:0}

/* Paper cover — the second title in the series. Warm off-white + teal, so the
   two books never look like the same PDF in a folder or a card row. */
.cover--paper{
  color:#3A4A46;
  background:
    radial-gradient(115% 75% at 84% 6%, rgba(13,148,136,.34) 0%, rgba(13,148,136,0) 58%),
    radial-gradient(85% 55% at 6% 97%, rgba(15,118,110,.26) 0%, rgba(15,118,110,0) 62%),
    #F3F1E9;
}
.cover--paper .cover__top{color:#7A8A85}
.cover--paper .cover__brand{color:#12312C}
.cover--paper .cover__eyebrow{color:#0F766E}
.cover--paper h1{color:#0E2B27}
.cover--paper .cover__sub{color:#4A5D58}
.cover--paper .cover__marks{border-top-color:rgba(15,118,110,.30)}
.cover--paper .cover__k{color:#0E2B27}
.cover--paper .cover__l{color:#6B7C77}
.cover--paper .cover__foot{color:#7A8A85}

/* ── Colophon + contents ───────────────────────────────────────────────── */
.colophon,.toc{padding:0 var(--pad); break-after:page}
.colophon h2{font-family:'Instrument Serif',serif; font-weight:400; font-size:22pt;
  line-height:1.1; color:var(--ink); margin:0 0 3mm}
.colophon__sub{font-size:11pt; color:var(--dim); margin:0 0 10mm; max-width:120mm}
.colophon dl{display:grid; grid-template-columns:34mm 1fr; gap:2.4mm 6mm;
  font-size:9.4pt; margin:0 0 10mm; padding-bottom:8mm; border-bottom:.5pt solid var(--line)}
.colophon dt{color:var(--faint); text-transform:uppercase; letter-spacing:.09em; font-size:7.8pt; padding-top:.7mm}
.colophon dd{margin:0; color:var(--ink)}
.colophon__note{font-size:9.2pt; color:var(--dim); max-width:135mm}
.colophon__share{margin-top:8mm; font-size:9.6pt; color:var(--ink)}

.toc h2{font-family:'Instrument Serif',serif; font-weight:400; font-size:26pt; color:var(--ink); margin:0 0 9mm}
.toc ol{list-style:none; margin:0; padding:0}
.toc li{border-bottom:.5pt solid var(--line)}
.toc a{display:flex; align-items:baseline; gap:3mm; padding:3.1mm 0; border:0; color:var(--ink)}
.toc__k{width:26mm; flex:none; font-size:7.8pt; letter-spacing:.09em; text-transform:uppercase; color:var(--faint)}
.toc__t{font-size:11pt; font-weight:500}
.toc--minor .toc__t{font-weight:400; color:var(--dim)}
.toc__dots{flex:1; border-bottom:.5pt dotted var(--line); transform:translateY(-1mm)}
.toc__p{font-size:9.6pt; color:var(--dim); font-variant-numeric:tabular-nums}

/* ── Chapters ──────────────────────────────────────────────────────────── */
.chapter{padding:0 var(--pad); break-before:page}
.chapter__h{position:relative; margin:0 0 10mm; padding-bottom:6mm; border-bottom:.8pt solid var(--ink)}
.chapter__k{font-size:8pt; letter-spacing:.16em; text-transform:uppercase; color:var(--accent); margin:0 0 3mm}
.chapter__h h1{font-family:'Instrument Serif',serif; font-weight:400; font-size:32pt;
  line-height:1.06; letter-spacing:-.01em; color:var(--ink); margin:0; max-width:120mm}
.chapter__n{position:absolute; right:0; bottom:5mm; margin:0;
  font-family:'Instrument Serif',serif; font-size:34pt; line-height:1; color:var(--line)}

h2{font-size:15pt; font-weight:600; line-height:1.24; color:var(--ink);
  margin:9mm 0 3.5mm; letter-spacing:-.006em; break-after:avoid}
h3{font-size:11.4pt; font-weight:600; color:var(--ink); margin:6.5mm 0 2.5mm; break-after:avoid}
h4{font-size:10.2pt; font-weight:600; color:var(--ink); margin:5mm 0 2mm; break-after:avoid}
.lead{font-size:12.2pt; line-height:1.5; color:var(--ink); margin-bottom:6mm}

ul,ol{margin:0 0 1em; padding-left:5.5mm}
li{margin-bottom:1.6mm}
li::marker{color:var(--faint)}

.steps{list-style:none; padding:0; counter-reset:s}
.steps li{counter-increment:s; position:relative; padding-left:9mm; margin-bottom:3.4mm; break-inside:avoid}
.steps li::before{content:counter(s); position:absolute; left:0; top:.2mm;
  width:5.6mm; height:5.6mm; border-radius:50%; background:var(--accent); color:#fff;
  font-size:7.6pt; font-weight:600; display:flex; align-items:center; justify-content:center}
.steps__t{display:block; font-weight:600; color:var(--ink)}
.steps__b{display:block}

.check{list-style:none; padding:0}
.check li{position:relative; padding:1.5mm 0 1.5mm 8mm; border-bottom:.4pt dotted var(--line); margin:0}
.check li::before{content:''; position:absolute; left:0; top:2.2mm;
  width:3.6mm; height:3.6mm; border:.7pt solid var(--faint); border-radius:1pt}

.pull{margin:7mm 0; padding:0 0 0 6mm; border-left:1.6pt solid var(--accent);
  font-family:'Instrument Serif',serif; font-size:15pt; line-height:1.3; color:var(--ink); break-inside:avoid}

.note{margin:6mm 0; padding:4.5mm 5mm; border-radius:2mm; background:var(--panel);
  border:.5pt solid var(--line); border-left:2pt solid var(--accent); font-size:9.6pt; break-inside:avoid}
.note p:last-child{margin:0}
.note__t{font-weight:600; color:var(--ink); margin:0 0 1.5mm}
.note--warn{border-left-color:var(--warn); background:#FFFBEB; border-color:#FDE8C4}
.note--tip{border-left-color:var(--ok); background:#F2FBF5; border-color:#D3EEDD}
.note--note{border-left-color:var(--faint)}

.code{font-family:'Geist Mono',monospace; font-size:9pt; background:#0E1017; color:#E6E8F0;
  padding:4mm 5mm; border-radius:2mm; margin:5mm 0; white-space:pre-wrap; break-inside:avoid}

.clause{margin:6mm 0; padding:0; border:.6pt solid var(--line); border-radius:2mm;
  overflow:hidden; break-inside:avoid}
.clause figcaption{background:var(--ink); color:#fff; padding:2.8mm 5mm; font-size:9.6pt; font-weight:600}
.clause__id{display:inline-block; margin-right:3mm; padding:.6mm 2mm; border-radius:1mm;
  background:rgba(255,255,255,.16); font-size:7.6pt; letter-spacing:.08em; text-transform:uppercase; font-weight:600}
.clause__body{padding:4.5mm 5mm; font-size:9.6pt; background:#fff}
.clause__body p{margin:0 0 .35em}
.clause__body p:last-child{margin:0}

.tbl{margin:6mm 0; break-inside:avoid}
table{width:100%; border-collapse:collapse; font-size:9pt}
thead th{text-align:left; font-size:7.8pt; letter-spacing:.09em; text-transform:uppercase;
  color:var(--dim); padding:2.2mm 3mm; border-bottom:.8pt solid var(--ink); font-weight:600}
tbody th,tbody td{padding:2.4mm 3mm; border-bottom:.4pt solid var(--line); vertical-align:top; text-align:left}
tbody th{font-weight:600; color:var(--ink); width:30%}
.tbl--num tbody th{width:40%}
.tbl--num td{font-variant-numeric:tabular-nums}
.tbl--ref tbody th{width:34%}
.tbl--ref code{background:none; border:0; padding:0; font-size:8.4pt}
figcaption{font-size:8.4pt; color:var(--dim); margin-top:2.5mm; line-height:1.45}

/* ── Category index ────────────────────────────────────────────────────── */
.catgrid{display:grid; grid-template-columns:1fr 1fr; gap:4mm; margin:6mm 0}
.cat{padding:3.5mm 4mm; border:.5pt solid var(--line); border-radius:2mm; background:#fff; break-inside:avoid}
.cat__h{display:flex; align-items:center; gap:2mm; font-weight:600; color:var(--ink); font-size:10pt; margin:0 0 .8mm}
.cat__n{font-size:8pt; color:var(--faint); margin:0 0 1.8mm}
.cat__b{font-size:8.6pt; line-height:1.45; margin:0; color:var(--dim)}
.cat__dot{width:2.6mm; height:2.6mm; border-radius:50%; flex:none; background:var(--accent)}
.cat--schema{background:#DC2626} .cat--spatial{background:#EA580C} .cat--quality{background:#3645C4}
.cat--lod{background:#7C3AED} .cat--iso19650{background:#0891B2} .cat--classification{background:#0D9488}
.cat--mep{background:#CA8A04} .cat--clash{background:#BE185D}

/* ── Rule reference ────────────────────────────────────────────────────── */
.catsec{break-before:page}
.catsec__h{display:flex; align-items:center; gap:2.5mm; margin:0 0 2.5mm;
  font-size:16pt; font-weight:600; color:var(--ink)}
.catsec__n{margin-left:auto; font-size:8.4pt; font-weight:500; color:var(--faint);
  letter-spacing:.08em; text-transform:uppercase}
.catsec__i{font-size:9.6pt; color:var(--dim); margin:0 0 6mm; padding-bottom:5mm;
  border-bottom:.5pt solid var(--line); max-width:150mm}

.rule{break-inside:avoid; margin:0 0 5mm; padding:0 0 4.5mm; border-bottom:.5pt solid var(--line)}
.rule__h{display:flex; align-items:flex-start; gap:4mm; margin-bottom:2.5mm}
.rule__n{font-family:'Instrument Serif',serif; font-size:17pt; line-height:1; color:var(--line); margin:0; flex:none; width:9mm}
.rule__h h3{margin:0; font-size:12pt; line-height:1.2}
.rule__id{margin:.8mm 0 0}
.rule__id code{background:none; border:0; padding:0; font-size:8pt; color:var(--faint); letter-spacing:.01em}
.rule__tags{margin-left:auto; display:flex; gap:1.5mm; flex:none; align-items:center}
.sev{display:inline-block; padding:.7mm 2.2mm; border-radius:1mm; font-size:7.4pt;
  font-weight:600; letter-spacing:.06em; text-transform:uppercase; color:#fff; background:var(--info)}
.sev--error{background:var(--err)} .sev--warning{background:var(--warn)} .sev--info{background:var(--info)}
.tag--auto{display:inline-block; padding:.7mm 2.2mm; border-radius:1mm; font-size:7.4pt; font-weight:600;
  letter-spacing:.06em; text-transform:uppercase; color:var(--ok); border:.5pt solid #BBE5CB; background:#F2FBF5}
.rule__d{margin:0 0 2.5mm; color:var(--ink); font-size:10pt}
.rule__meta{display:flex; gap:2mm; flex-wrap:wrap; align-items:baseline; font-size:8.6pt; color:var(--body); margin:0 0 2.5mm}
.rule__meta span{font-size:7.4pt; letter-spacing:.09em; text-transform:uppercase; color:var(--faint); margin-right:.5mm}
.rule__meta span:not(:first-child){margin-left:4mm}
.rule__fix{background:var(--panel); border-radius:1.5mm; padding:2.6mm 3.4mm; font-size:9.2pt; margin:0 0 2.5mm}
.rule__fixh{display:block; font-size:7.4pt; letter-spacing:.09em; text-transform:uppercase; color:var(--accent); font-weight:600; margin-bottom:.8mm}
.tools{display:grid; grid-template-columns:1fr 1fr; gap:2.5mm 5mm}
.tool p{margin:0; font-size:8.5pt; line-height:1.42; color:var(--dim)}
.tool__h{font-weight:600; color:var(--ink); font-size:8.2pt; letter-spacing:.04em; margin-bottom:.6mm !important}

.pagebreak{break-after:page}
`
}
