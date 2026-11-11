// ── Public pricing page ×10 ──────────────────────────────────────────────────
//
//   npx tsx scripts/seo/generate-pricing-pages.ts
//
// Writes public/pricing/index.html and public/<lang>/<slug>/index.html (slugs in
// src/lib/pricing/pricing-paths.ts) and the pages' block in public/sitemap.xml.
// Plain HTML and one small script: the page must read, compare and join a
// waitlist with JavaScript off, and stay a few kilobytes.
//
// What it does for the reader:
// - "What do you do with IFC files?" picks a plan, highlights it and keeps the
//   answer in the URL (?role=…) so a shared link opens on the same plan.
// - Desktop: one comparison table grouped by topic, header pinned while you
//   scroll, the chosen column marked. Phones: the same table shows one plan at
//   a time, switched with real radio buttons, instead of scrolling sideways.
// - Light and dark from docs/COLOR_SYSTEM.md tokens; follows the system, and
//   the landing's own switch (localStorage 'lp-theme') when it was used.

import path from 'path'
import { mkdirSync, readFileSync, writeFileSync } from 'fs'
import { PRICING_LANGS, pricingPath, type PricingLang } from '../../src/lib/pricing/pricing-paths'
import { GROUPS, PLAN_FOR_ROLE, PRICES, ROLES, TABLE_PLANS, type Cell, type Plan, type TablePlan } from './pricing/pricing-data'
import { COPY, type PricingCopy } from './pricing/pricing-i18n'

const ROOT = path.resolve(path.dirname(new URL(import.meta.url).pathname.replace(/^\/([A-Za-z]:)/, '$1')), '..', '..')
const SITE = 'https://www.ifcvieweronline.eu'

// The validator landing in each language (its own hreflang set, public/<lang>/…).
const VALIDATOR: Record<PricingLang, string> = {
  en: '/ifc-validator/', es: '/es/ifc-validador/', de: '/de/ifc-validator-online/', fr: '/fr/validateur-ifc-en-ligne/',
  pt: '/pt/validador-ifc-online/', it: '/it/validatore-ifc-online/', ca: '/ca/validador-ifc-en-linia/',
  zh: '/zh/ifc-validator-online/', ja: '/ja/ifc-validator-online/', th: '/th/ifc-validator-online/',
}
const LANG_NAME: Record<PricingLang, string> = {
  en: 'English', es: 'Español', de: 'Deutsch', fr: 'Français', pt: 'Português', it: 'Italiano', ca: 'Català', zh: '中文', ja: '日本語', th: 'ไทย',
}

export const esc = (s: string): string => s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;')
const jsonEsc = (s: string): string => s.replace(/</g, '\\u003c').replace(/>/g, '\\u003e').replace(/&/g, '\\u0026')
const fill = (s: string, v: Record<string, string | number>): string => s.replace(/\{(\w+)\}/g, (_, k: string) => String(v[k] ?? `{${k}}`))

/** Euros formatted the way the language writes them ("€19", "19 €", "19 €"). */
export function eur(lang: PricingLang, n: number): string {
  return new Intl.NumberFormat(lang, { style: 'currency', currency: 'EUR', maximumFractionDigits: 0 }).format(n).replace(/\u00a0/g, '\u202f')
}

// ── Pieces ────────────────────────────────────────────────────────────────────

function priceHead(lang: PricingLang, c: PricingCopy, plan: TablePlan): string {
  if (plan === 'free') return `<p class="price"><strong>${esc(fill(c.price.free, { p: eur(lang, 0) }))}</strong></p>`
  if (plan === 'pro') {
    return `<p class="price"><strong>${esc(fill(c.price.month, { p: eur(lang, PRICES.pro.perMonthYearly) }))}</strong></p>`
      + `<p class="meta">${esc(fill(c.price.yearly, { y: eur(lang, PRICES.pro.yearly), m: eur(lang, PRICES.pro.monthly) }))}</p>`
  }
  return `<p class="price"><strong>${esc(fill(c.price.editorMonth, { p: eur(lang, PRICES.team.perEditorMonthYearly) }))}</strong></p>`
    + `<p class="meta">${esc(fill(c.price.yearly, { y: eur(lang, PRICES.team.yearlyPerEditor), m: eur(lang, PRICES.team.monthlyPerEditor) }))}</p>`
    + `<p class="meta">${esc(fill(c.price.minEditors, { n: PRICES.team.minEditors }))}</p>`
}

function ctaFor(c: PricingCopy, plan: Plan, lang: PricingLang): string {
  if (plan === 'free') return `<a class="btn btn-quiet" href="${lang === 'en' ? '/' : `/${lang}/`}" data-cta="table_free" hreflang="${lang}">${esc(c.cta.free)}</a>`
  const label = plan === 'enterprise' || plan === 'reception' ? c.cta.talk : c.cta.waitlist
  return `<button type="button" class="btn btn-main" data-plan="${plan}">${esc(label)}</button>`
}

function cell(c: PricingCopy, rowId: keyof PricingCopy['rows'], v: Cell): string {
  if (v === true) return `<span class="yes" aria-hidden="true">✓</span><span class="sr">${esc(c.included)}</span>`
  if (v === false) return `<span class="no" aria-hidden="true">—</span><span class="sr">${esc(c.notIncluded)}</span>`
  return esc(c.rows[rowId][v] ?? '')
}

function table(lang: PricingLang, c: PricingCopy): string {
  const head = TABLE_PLANS.map((p) => `
          <th scope="col" class="c-${p}" id="h-${p}">
            <span class="pick-tag">${esc(c.plans.recommended)}</span>
            <span class="plan-name">${esc(c.names[p])}</span>
            ${priceHead(lang, c, p)}
            <p class="meta who">${esc(c.who[p])}</p>
            ${ctaFor(c, p, lang)}
          </th>`).join('')
  const bodies = GROUPS.map((g) => `
        <tbody class="grp" id="g-${g.id}">
          <tr class="grp-h"><th colspan="4" scope="colgroup"><button type="button" aria-expanded="true" aria-controls="g-${g.id}">${esc(c.groups[g.id])}</button></th></tr>
          ${g.rows.map((r) => `<tr>
            <th scope="row">${esc(c.rows[r.id].label)}${c.rows[r.id].note ? `<span class="note">${esc(c.rows[r.id].note!)}</span>` : ''}</th>
            ${TABLE_PLANS.map((p) => `<td class="c-${p}">${cell(c, r.id, r.cells[p])}</td>`).join('')}
          </tr>`).join('\n          ')}
        </tbody>`).join('')
  const switcher = TABLE_PLANS.map((p) => `<label><input type="radio" name="show" value="${p}"${p === 'pro' ? ' checked' : ''} /><span>${esc(c.names[p])}</span></label>`).join('')
  return `
      <fieldset class="show" aria-controls="cmp"><legend>${esc(c.plans.show)}</legend>${switcher}</fieldset>
      <table class="cmp" id="cmp" data-show="pro">
        <colgroup><col class="c-label" />${TABLE_PLANS.map((p) => `<col class="c-${p}" />`).join('')}</colgroup>
        <thead><tr><td class="corner"></td>${head}
        </tr></thead>${bodies}
      </table>
      <p class="founder">${esc(fill(c.price.founder, { n: PRICES.founder.discountPct, t: PRICES.founder.customers, m: PRICES.founder.months }))}</p>`
}

function picker(c: PricingCopy): string {
  const opts = ROLES.map((r) => `<label><input type="radio" name="role" value="${r}" data-plan-for="${PLAN_FOR_ROLE[r]}" /><span>${esc(c.pick.roles[r])}</span></label>`).join('')
  const answers = ROLES.map((r) => {
    const plan = PLAN_FOR_ROLE[r]
    const target = (TABLE_PLANS as readonly string[]).includes(plan) ? '#plans' : plan === 'reception' ? '#reception' : '#more'
    return `<p class="answer" data-role="${r}" hidden><span>${esc(c.pick.why[plan])}</span> <a href="${target}">${esc(c.pick.see)} ↓</a></p>`
  }).join('')
  return `
    <section class="pick wrap" aria-labelledby="pick-l">
      <fieldset><legend id="pick-l">${esc(c.pick.legend)}</legend><div class="opts">${opts}</div></fieldset>
      <div class="answers" aria-live="polite">${answers}</div>
    </section>`
}

function reception(lang: PricingLang, c: PricingCopy): string {
  const r = c.reception
  return `
    <section class="sec wrap" id="reception" aria-labelledby="reception-h">
      <h2 id="reception-h">${esc(r.h2)}</h2>
      <p class="sub">${esc(r.sub)}</p>
      <div class="recv">
        <div>
          <span class="pick-tag">${esc(c.plans.recommended)}</span>
          <h3>${esc(c.names.reception)}</h3>
          <p class="price"><strong>${esc(fill(r.perProject, { p: eur(lang, PRICES.reception.fromPerProject), n: PRICES.reception.suppliersPerProject }))}</strong></p>
          <p class="meta">${esc(fill(r.unlimited, { p: eur(lang, PRICES.reception.fromPortfolio) }))}</p>
          <p class="body">${esc(r.body)}</p>
          ${ctaFor(c, 'reception', lang)}
        </div>
        <ol>${r.steps.map((s) => `<li><strong>${esc(s.b)}</strong> ${esc(s.t)}</li>`).join('')}</ol>
      </div>
    </section>`
}

function more(lang: PricingLang, c: PricingCopy): string {
  const m = c.more
  return `
    <section class="sec wrap" id="more" aria-labelledby="more-h">
      <h2 id="more-h">${esc(m.h2)}</h2>
      <dl class="rows">
        <div class="row" id="row-developer"><dt><span class="pick-tag">${esc(c.plans.recommended)}</span>${esc(c.names.developer)}<span class="meta">${esc(fill(m.devPrice, { p: eur(lang, PRICES.developer.perMonthYearly) }))}</span></dt>
          <dd><p>${esc(m.dev)}</p>${ctaFor(c, 'developer', lang)}</dd></div>
        <div class="row" id="row-enterprise"><dt>${esc(c.names.enterprise)}<span class="meta">${esc(fill(m.entPrice, { p: eur(lang, PRICES.enterprise.fromYearly) }))}</span></dt>
          <dd><p>${esc(m.ent)} <a href="/on-premise-ifc-validator/">${esc(m.onPrem)}</a></p>${ctaFor(c, 'enterprise', lang)}</dd></div>
      </dl>
    </section>`
}

function faq(c: PricingCopy): string {
  return `
    <section class="sec wrap" aria-labelledby="faq-h">
      <h2 id="faq-h">${esc(c.faq.h2)}</h2>
      <div class="faq">${c.faq.items.map((f) => `<details><summary>${esc(f.q)}</summary><p>${esc(f.a)}</p></details>`).join('')}</div>
    </section>`
}

function dialog(c: PricingCopy): string {
  const d = c.dialog
  return `
  <dialog id="waitlist" aria-labelledby="wl-title">
    <form id="wl-form" method="dialog">
      <h3 id="wl-title">${esc(fill(d.title, { plan: '' }))}</h3>
      <p class="meta">${esc(d.desc)}</p>
      <label for="wl-email">${esc(d.email)}</label>
      <input id="wl-email" name="email" type="email" required autocomplete="email" placeholder="${esc(d.emailPh)}" />
      <label for="wl-role">${esc(d.role)}</label>
      <select id="wl-role" name="role">
        <option value="deliver">${esc(d.roles.deliver)}</option>
        <option value="receive">${esc(d.roles.receive)}</option>
        <option value="build">${esc(d.roles.build)}</option>
        <option value="other">${esc(d.roles.other)}</option>
      </select>
      <p class="msg" id="wl-msg" role="status"></p>
      <div class="actions">
        <button type="button" class="btn btn-quiet" id="wl-cancel">${esc(d.close)}</button>
        <button type="submit" class="btn btn-main" id="wl-submit">${esc(d.join)}</button>
      </div>
    </form>
  </dialog>`
}

// ── Page ──────────────────────────────────────────────────────────────────────

export function renderPricingPage(lang: PricingLang): string {
  const c = COPY[lang]
  const url = SITE + pricingPath(lang)
  const alternates = [...PRICING_LANGS.map((l) => `  <link rel="alternate" hreflang="${l}" href="${SITE}${pricingPath(l)}" />`),
    `  <link rel="alternate" hreflang="x-default" href="${SITE}${pricingPath('en')}" />`].join('\n')
  const ld = {
    '@context': 'https://schema.org',
    '@graph': [
      { '@type': 'WebPage', '@id': url, url, name: c.meta.title, description: c.meta.description, isPartOf: { '@id': `${SITE}/` }, inLanguage: lang },
      { '@type': 'FAQPage', mainEntity: c.faq.items.map(({ q, a }) => ({ '@type': 'Question', name: q, acceptedAnswer: { '@type': 'Answer', text: a } })) },
    ],
  }
  // Strings the script needs, already in this language.
  const i18n = {
    names: c.names, title: c.dialog.title, titleTalk: c.dialog.titleTalk,
    saving: c.dialog.saving, ok: c.dialog.ok, err: c.dialog.err,
  }
  const blog = lang === 'en' ? '/blog/' : `/${lang}/blog/`
  // The home in the reader's language (the viewer opens from it).
  const home = lang === 'en' ? '/' : `/${lang}/`
  return `<!doctype html>
<html lang="${c.htmlLang}">
<head>
  <meta charset="UTF-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1.0" />
  <title>${esc(c.meta.title)}</title>
  <meta name="description" content="${esc(c.meta.description)}" />
  <meta name="robots" content="index, follow" />
  <meta name="color-scheme" content="dark light" />
  <link rel="canonical" href="${url}" />
${alternates}
  <meta property="og:type" content="website" />
  <meta property="og:url" content="${url}" />
  <meta property="og:title" content="${esc(c.meta.title)}" />
  <meta property="og:description" content="${esc(c.meta.description)}" />
  <meta property="og:site_name" content="IFC Viewer Online" />
  <meta property="og:image" content="${SITE}/og-image${lang === 'en' ? '' : `-${lang}`}.png" />
  <meta name="twitter:card" content="summary_large_image" />
  <link rel="icon" href="/favicon.svg" type="image/svg+xml" />
  <link rel="stylesheet" href="/fonts.css" />
  <script>try{var t=localStorage.getItem('lp-theme');if(t==='light'||t==='dark')document.documentElement.dataset.theme=t}catch(e){}</script>
  <script type="application/ld+json">${jsonEsc(JSON.stringify(ld))}</script>
  <style>${CSS}</style>
</head>
<body>
  <a class="skip" href="#plans">${esc(c.plans.h2)}</a>
  <header class="top">
    <div class="wrap bar">
      <a href="${home}" class="logo">IFC Viewer Online</a>
      <nav aria-label="Main">
        <a href="${VALIDATOR[lang]}" class="hide-s">${esc(c.nav.validator)}</a>
        <a href="/sdk/" class="hide-s">${esc(c.nav.sdk)}</a>
        <a href="${blog}" class="hide-s">${esc(c.nav.blog)}</a>
        <button type="button" class="theme" id="theme" aria-label="${esc(c.nav.theme)}" title="${esc(c.nav.theme)}"><svg viewBox="0 0 16 16" width="16" height="16" aria-hidden="true"><circle cx="8" cy="8" r="6.25" fill="none" stroke="currentColor" stroke-width="1.5"/><path d="M8 1.75a6.25 6.25 0 0 1 0 12.5z" fill="currentColor"/></svg></button>
        <a href="${home}" class="btn btn-quiet" data-cta="header_open">${esc(c.nav.open)}</a>
      </nav>
    </div>
  </header>

  <main>
    <section class="hero wrap">
      <h1>${esc(c.h1)}</h1>
      <p class="lead">${esc(c.lead)}</p>
      <p class="status"><span class="dot" aria-hidden="true"></span>${esc(c.status)}</p>
    </section>
${picker(c)}
    <section class="sec wrap" id="plans" aria-labelledby="plans-h">
      <h2 id="plans-h">${esc(c.plans.h2)}</h2>
      <p class="sub">${esc(c.plans.sub)}</p>${table(lang, c)}
    </section>
${reception(lang, c)}
${more(lang, c)}
${faq(c)}
  </main>
${dialog(c)}

  <footer class="wrap foot">
    <nav aria-label="${esc(c.plans.show)}" class="langs">${PRICING_LANGS.map((l) => l === lang
      ? `<span aria-current="page">${LANG_NAME[l]}</span>`
      : `<a href="${pricingPath(l)}" hreflang="${l}" lang="${l}">${LANG_NAME[l]}</a>`).join('')}</nav>
    <p><a href="${home}">IFC Viewer Online</a><a href="${VALIDATOR[lang]}">${esc(c.nav.validator)}</a><a href="/on-premise-ifc-validator/">${esc(c.footer.onPrem)}</a><a href="/sdk/">SDK</a><a href="/privacy">${esc(c.footer.privacy)}</a><a href="/terms">${esc(c.footer.terms)}</a></p>
  </footer>

  <script type="application/json" id="pricing-i18n">${jsonEsc(JSON.stringify(i18n))}</script>
  <script>${SCRIPT.replace('__LANG__', lang)}</script>
</body>
</html>
`
}

// ── Styles ────────────────────────────────────────────────────────────────────
// Colour values live only in the two token blocks (docs/COLOR_SYSTEM.md); the
// rest of the sheet names roles. Three text sizes: 13, 16 and the plan price 18.

export const CSS = `
:root{
  --canvas:#100f0c;--panel:#181714;--raised:#21201d;--line:#34332e;
  --text-3:#94928d;--text-2:#b2b1ab;--text:#ecebe7;
  --accent:#0a8481;--on-accent:#ffffff;--accent-text:#55cac3;--warn:#f2af48;
  --pick:rgba(85,202,195,.08);--scrim:rgba(0,0,0,.6);
  --t-s:13px;--t-b:16px;--t-l:18px;
}
@media (prefers-color-scheme: light){:root:not([data-theme="dark"]){
  --canvas:#f4f3f0;--panel:#fefdfc;--raised:#e9e8e4;--line:#d5d4d0;
  --text-3:#65635e;--text-2:#4e4d48;--text:#1c1b16;
  --accent:#00696a;--on-accent:#ffffff;--accent-text:#00696a;--warn:#915c08;
  --pick:rgba(0,105,106,.07);--scrim:rgba(28,27,22,.45);
}}
:root[data-theme="light"]{
  --canvas:#f4f3f0;--panel:#fefdfc;--raised:#e9e8e4;--line:#d5d4d0;
  --text-3:#65635e;--text-2:#4e4d48;--text:#1c1b16;
  --accent:#00696a;--on-accent:#ffffff;--accent-text:#00696a;--warn:#915c08;
  --pick:rgba(0,105,106,.07);--scrim:rgba(28,27,22,.45);
}
*,*::before,*::after{box-sizing:border-box;margin:0;padding:0}
html{background:var(--canvas);color:var(--text);font:400 var(--t-b)/1.55 'Geist',-apple-system,BlinkMacSystemFont,'Segoe UI',sans-serif;-webkit-text-size-adjust:100%}
body{background:var(--canvas);min-height:100vh}
a{color:var(--accent-text)}
:focus-visible{outline:2px solid var(--accent-text);outline-offset:2px;border-radius:4px}
.sr{position:absolute;width:1px;height:1px;overflow:hidden;clip-path:inset(50%);white-space:nowrap}
.skip{position:absolute;left:-9999px}.skip:focus{left:16px;top:8px;z-index:9;background:var(--panel);padding:8px 12px}
.wrap{max-width:1080px;margin:0 auto;padding:0 16px}
@media (min-width:720px){.wrap{padding:0 28px}}
h1,h2,h3{font-weight:650;letter-spacing:-.02em;line-height:1.15;text-wrap:balance}
h1{font-size:clamp(28px,4.4vw,44px);max-width:22ch}
h2{font-size:clamp(22px,2.6vw,28px)}
h3{font-size:var(--t-l)}
.meta,.sub,.note{color:var(--text-2);font-size:var(--t-s)}
.sub{font-size:var(--t-b);max-width:62ch;margin-top:6px}
.btn{display:inline-flex;align-items:center;justify-content:center;min-height:40px;padding:8px 16px;border-radius:8px;font:inherit;font-size:var(--t-s);font-weight:600;text-decoration:none;cursor:pointer;border:1px solid transparent;white-space:nowrap}
.btn-main{background:var(--accent);color:var(--on-accent)}
.btn-main:hover{filter:brightness(1.08)}
.btn-quiet{background:none;color:var(--text);border-color:var(--line)}
.btn-quiet:hover{border-color:var(--text-3)}

.top{border-bottom:1px solid var(--line)}
.bar{display:flex;align-items:center;justify-content:space-between;gap:12px;min-height:60px}
.logo{color:var(--text);font-weight:650;text-decoration:none;font-size:var(--t-s)}
.top nav{display:flex;align-items:center;gap:16px;font-size:var(--t-s)}
.top nav a:not(.btn){color:var(--text-2);text-decoration:none}
.top nav a:not(.btn):hover{color:var(--text)}
.theme{display:inline-grid;place-items:center;width:40px;height:40px;border-radius:8px;border:1px solid var(--line);background:none;color:var(--text-2);cursor:pointer}
@media (max-width:719px){.hide-s{display:none}}

.hero{padding-top:56px;padding-bottom:8px}
.lead{color:var(--text-2);max-width:62ch;margin-top:16px}
.status{display:flex;gap:10px;align-items:baseline;margin-top:18px;font-size:var(--t-s);color:var(--text-2);max-width:62ch}
.dot{flex:none;width:8px;height:8px;border-radius:50%;background:var(--warn);transform:translateY(-1px)}

.pick{padding-top:36px}
.pick fieldset{border:0}
.pick legend{font-weight:650;font-size:var(--t-l);margin-bottom:12px}
.opts{display:flex;flex-wrap:wrap;gap:8px}
.opts label{position:relative}
.opts input,.show input{position:absolute;opacity:0;inset:0;width:100%;height:100%;margin:0;cursor:pointer}
.opts span{display:block;padding:9px 14px;border:1px solid var(--line);border-radius:999px;font-size:var(--t-s);color:var(--text-2);background:var(--panel)}
.opts input:hover+span{border-color:var(--text-3);color:var(--text)}
.opts input:checked+span{border-color:var(--accent-text);color:var(--text);box-shadow:inset 0 0 0 1px var(--accent-text)}
.opts input:focus-visible+span,.show input:focus-visible+span{outline:2px solid var(--accent-text);outline-offset:2px}
.answers{min-height:24px;margin-top:14px}
.answer{font-size:var(--t-b)}
.answer a{white-space:nowrap;font-weight:600}

.sec{padding-top:64px}
.cmp{width:100%;border-collapse:separate;border-spacing:0;margin-top:24px;table-layout:fixed}
.cmp col.c-label{width:34%}
.cmp thead th,.cmp thead td{position:sticky;top:0;z-index:2;background:var(--canvas);vertical-align:top;text-align:left;padding:16px 14px 18px;border-bottom:1px solid var(--line)}
.cmp thead th{font-weight:400}
.plan-name{display:block;font-weight:650;font-size:var(--t-l)}
.cmp .price{margin-top:4px;font-size:var(--t-b)}
.cmp .price strong{font-weight:600}
.cmp .who{margin:6px 0 14px}
.cmp tbody th,.cmp td{padding:14px;border-bottom:1px solid var(--line);vertical-align:top;text-align:left;font-size:var(--t-s)}
.cmp tbody th{font-weight:500;color:var(--text)}
.cmp td{color:var(--text)}
.note{display:block;font-weight:400;margin-top:4px;max-width:46ch}
.yes{color:var(--accent-text);font-weight:700}
.no{color:var(--text-3)}
.grp-h th{padding:28px 0 0!important;border-bottom:1px solid var(--line)!important}
.grp-h button{all:unset;cursor:pointer;display:flex;align-items:center;gap:8px;width:100%;padding:0 14px 10px;font-weight:650;font-size:var(--t-s);color:var(--text-2);letter-spacing:.04em;text-transform:uppercase;box-sizing:border-box}
.grp-h button:focus-visible{outline:2px solid var(--accent-text)}
.grp-h button::before{content:'';width:7px;height:7px;border-right:1.5px solid currentColor;border-bottom:1.5px solid currentColor;transform:rotate(45deg) translateY(-2px);transition:transform .15s}
.grp-h button[aria-expanded="false"]::before{transform:rotate(-45deg)}
.pick-tag{display:none;font-size:var(--t-s);font-weight:600;color:var(--accent-text);margin-bottom:4px}
.cmp[data-pick="free"] .c-free,.cmp[data-pick="pro"] .c-pro,.cmp[data-pick="team"] .c-team{background:var(--pick)}
.cmp[data-pick="free"] thead .c-free,.cmp[data-pick="pro"] thead .c-pro,.cmp[data-pick="team"] thead .c-team{box-shadow:inset 0 3px 0 var(--accent-text);background:linear-gradient(var(--pick),var(--pick)),var(--canvas)}
.cmp[data-pick="free"] thead .c-free .pick-tag,.cmp[data-pick="pro"] thead .c-pro .pick-tag,.cmp[data-pick="team"] thead .c-team .pick-tag{display:block}
.founder{margin-top:14px;font-size:var(--t-s);color:var(--text-2)}
.show{display:none;border:0}
@media (max-width:719px){
  .show{display:flex;gap:4px;margin-top:20px;padding:4px;border:1px solid var(--line);border-radius:10px;position:sticky;top:0;z-index:3;background:var(--canvas)}
  .show legend{position:absolute;width:1px;height:1px;overflow:hidden;clip-path:inset(50%)}
  .show label{position:relative;flex:1}
  .show span{display:block;text-align:center;padding:9px 6px;border-radius:7px;font-size:var(--t-s);font-weight:600;color:var(--text-2)}
  .show input:checked+span{background:var(--raised);color:var(--text)}
  .cmp{margin-top:8px;table-layout:auto}
  .cmp col{width:auto}
  .cmp col.c-label{width:55%}
  .cmp thead,.cmp thead tr,.cmp thead th{display:block;width:100%}
  .cmp thead th,.cmp thead td{position:static;padding:16px 10px 18px}
  .cmp thead .corner{display:none}
  .cmp[data-show="free"] .c-pro,.cmp[data-show="free"] .c-team,
  .cmp[data-show="pro"] .c-free,.cmp[data-show="pro"] .c-team,
  .cmp[data-show="team"] .c-free,.cmp[data-show="team"] .c-pro{display:none}
  .grp-h th{padding-top:22px!important}
  .cmp tbody th,.cmp td{padding:12px 10px}
  .note{display:none}
}

.recv{display:grid;gap:28px;margin-top:24px;padding:24px;border:1px solid var(--line);border-radius:12px;background:var(--panel)}
@media (min-width:720px){.recv{grid-template-columns:1fr 1fr;padding:28px}}
.recv .price{margin-top:6px}
.recv .body{color:var(--text-2);margin:14px 0 18px}
.recv ol{padding-left:20px;display:grid;gap:10px;color:var(--text-2)}
.recv ol strong{color:var(--text);font-weight:600}
#reception.picked .recv{border-color:var(--accent-text);box-shadow:inset 0 3px 0 var(--accent-text)}
#reception.picked .pick-tag,#row-developer.picked .pick-tag{display:block}

.rows{margin-top:20px;border-top:1px solid var(--line)}
.row{display:grid;gap:8px 28px;padding:20px 0;border-bottom:1px solid var(--line)}
@media (min-width:720px){.row{grid-template-columns:240px 1fr}}
.row dt{font-weight:650;font-size:var(--t-l)}
.row dt .meta{display:block;font-weight:400;margin-top:2px}
.row dd p{color:var(--text-2);margin-bottom:12px;max-width:62ch}
.row.picked{box-shadow:inset 3px 0 0 var(--accent-text);padding-left:16px}

.faq{margin-top:20px;border-top:1px solid var(--line)}
.faq details{border-bottom:1px solid var(--line)}
.faq summary{cursor:pointer;padding:16px 0;font-weight:600;list-style-position:outside;margin-left:18px}
.faq p{color:var(--text-2);padding:0 0 18px 18px;max-width:68ch}

dialog{margin:auto;border:1px solid var(--line);border-radius:12px;background:var(--panel);color:var(--text);padding:24px;width:min(440px,calc(100% - 32px))}
dialog::backdrop{background:var(--scrim)}
dialog h3{margin-bottom:6px}
dialog label{display:block;font-size:var(--t-s);color:var(--text-2);margin:14px 0 6px}
dialog input,dialog select{width:100%;min-height:44px;font:inherit;color:var(--text);background:var(--canvas);border:1px solid var(--line);border-radius:8px;padding:9px 12px}
.actions{display:flex;gap:10px;justify-content:flex-end;margin-top:20px}
.msg{font-size:var(--t-s);margin-top:12px;min-height:1.4em}
.msg.ok{color:var(--accent-text)}

.foot{margin-top:88px;padding-top:24px;padding-bottom:40px;border-top:1px solid var(--line);font-size:var(--t-s);color:var(--text-3)}
.foot a{color:var(--text-2);text-decoration:none;margin-right:16px}
.foot a:hover{color:var(--text)}
.langs{display:flex;flex-wrap:wrap;gap:4px 0;margin-bottom:14px}
.langs span{margin-right:16px;color:var(--text)}
@media (prefers-reduced-motion:reduce){*{transition:none!important}}
`

// ── Script ────────────────────────────────────────────────────────────────────
// Role picker + URL, phone plan switcher, group folding, theme switch, waitlist.
// Funnel events go to PostHog EU the way the app sends them: no cookies, no
// storage, a random id per page view, skipped on opt-out, GPC, DNT or localhost.

const SCRIPT = `(function(){
var LANG='__LANG__';
var T=JSON.parse(document.getElementById('pricing-i18n').textContent);
var TABLE={free:1,pro:1,team:1};
var cmp=document.getElementById('cmp');
var PH_KEY='phc_mAs9WpD6z8RTQbqR8ZVvqbxhF8QUz59Yz4ZmDRjByXwr',PH_HOST='https://eu.i.posthog.com';
// One id per page view, in memory only (no cookie, no storage): the distinct id
// and PostHog's session id, a UUIDv7 so the events group into one session.
function uuid7(){var h=Date.now().toString(16);while(h.length<12)h='0'+h;var r='';for(var i=0;i<20;i++)r+=Math.floor(Math.random()*16).toString(16);
  return h.slice(0,8)+'-'+h.slice(8,12)+'-7'+r.slice(0,3)+'-'+'89ab'[Math.floor(Math.random()*4)]+r.slice(3,6)+'-'+r.slice(6,18)}
var visit=uuid7();
var LOCAL=/^(localhost|127\\.0\\.0\\.1|\\[::1\\]|0\\.0\\.0\\.0|.*\\.localhost|.*\\.local)$/i;
function optedOut(){try{var s=localStorage.getItem('ifc-analytics-optout:v1');if(s==='1')return true;if(s==='0')return false}catch(e){}
  if(navigator.globalPrivacyControl===true)return true;var d=navigator.doNotTrack||window.doNotTrack;return d==='1'||d==='yes'}
function local(){if(LOCAL.test(location.hostname))return true;try{return!!document.referrer&&LOCAL.test(new URL(document.referrer).hostname)}catch(e){return false}}
function ref(){try{return document.referrer?new URL(document.referrer).origin:'$direct'}catch(e){return'$direct'}}
function track(n,p){if(optedOut()||local())return;var q={$current_url:location.origin+location.pathname,$pathname:location.pathname,$referrer:ref(),$process_person_profile:false,$session_id:visit,visit_id:visit,surface:'pricing_page',lang:LANG};
  for(var k in p||{})q[k]=p[k];try{fetch(PH_HOST+'/i/v0/e/',{method:'POST',keepalive:true,headers:{'Content-Type':'application/json'},body:JSON.stringify({api_key:PH_KEY,event:n,distinct_id:visit,properties:q})}).catch(function(){})}catch(e){}}
track('$pageview');track('pricing_viewed',{role:new URLSearchParams(location.search).get('role')||null});

// Phone: one plan at a time.
function show(plan){cmp.dataset.show=plan;var r=document.querySelector('.show input[value="'+plan+'"]');if(r)r.checked=true}
document.querySelectorAll('.show input').forEach(function(i){i.addEventListener('change',function(){show(i.value)})});

// "What do you do with IFC files?"
function pick(role,fromUser){
  var input=document.querySelector('.pick input[value="'+role+'"]');if(!input)return;input.checked=true;
  var plan=input.dataset.planFor;
  document.querySelectorAll('.answer').forEach(function(a){a.hidden=a.dataset.role!==role});
  if(TABLE[plan]){cmp.dataset.pick=plan;show(plan)}else{delete cmp.dataset.pick}
  document.getElementById('reception').classList.toggle('picked',plan==='reception');
  document.getElementById('row-developer').classList.toggle('picked',plan==='developer');
  if(fromUser){var u=new URL(location.href);u.searchParams.set('role',role);history.replaceState(null,'',u);track('pricing_role_picked',{role:role,plan:plan})}
}
document.querySelectorAll('.pick input').forEach(function(i){i.addEventListener('change',function(){pick(i.value,true)})});
var start=new URLSearchParams(location.search).get('role');if(start)pick(start,false);

// Fold a group of rows.
document.querySelectorAll('.grp-h button').forEach(function(b){b.addEventListener('click',function(){
  var open=b.getAttribute('aria-expanded')!=='true';b.setAttribute('aria-expanded',String(open));
  var rows=b.closest('tbody').querySelectorAll('tr:not(.grp-h)');rows.forEach(function(r){r.hidden=!open})})});

// Light or dark; remembered with the landing's own key.
document.getElementById('theme').addEventListener('click',function(){
  var cur=document.documentElement.dataset.theme||(matchMedia('(prefers-color-scheme: light)').matches?'light':'dark');
  var next=cur==='light'?'dark':'light';document.documentElement.dataset.theme=next;try{localStorage.setItem('lp-theme',next)}catch(e){}});

document.querySelectorAll('[data-cta]').forEach(function(a){a.addEventListener('click',function(){track('pricing_cta_clicked',{cta:a.dataset.cta})})});

// Waitlist: the email Worker the app's forms use, tagged by plan and role.
var ENDPOINT='https://ifc-viewer-email-capture.joelbenitezdonari.workers.dev/subscribe';
var dlg=document.getElementById('waitlist'),form=document.getElementById('wl-form'),msg=document.getElementById('wl-msg'),
    submit=document.getElementById('wl-submit'),roleSel=document.getElementById('wl-role'),plan=null;
document.querySelectorAll('[data-plan]').forEach(function(b){b.addEventListener('click',function(){
  plan=b.dataset.plan;
  document.getElementById('wl-title').textContent=((plan==='enterprise'||plan==='reception')?T.titleTalk:T.title).replace('{plan}',T.names[plan]);
  roleSel.value=plan==='reception'||plan==='enterprise'?'receive':plan==='developer'?'build':'deliver';
  msg.textContent='';msg.className='msg';submit.disabled=false;
  track('pricing_intent',{kind:'plan',item:plan,surface:'pricing_page'});
  if(dlg.showModal)dlg.showModal();else dlg.setAttribute('open','');document.getElementById('wl-email').focus()})});
document.getElementById('wl-cancel').addEventListener('click',function(){dlg.close?dlg.close():dlg.removeAttribute('open')});
form.addEventListener('submit',function(e){e.preventDefault();var email=document.getElementById('wl-email').value.trim();if(!email)return;
  submit.disabled=true;msg.className='msg';msg.textContent=T.saving;
  fetch(ENDPOINT,{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({email:email,source:'pricing:'+plan+':'+roleSel.value,locale:LANG})})
   .then(function(r){return r.json().then(function(d){return{ok:r.ok||d.ok,d:d}})})
   .then(function(res){if(res.ok||res.d.already){msg.className='msg ok';msg.textContent=T.ok;track('email_captured',{source:'pricing:'+plan,already_subscribed:!!res.d.already})}else{throw new Error()}})
   .catch(function(){msg.className='msg';msg.textContent=T.err;submit.disabled=false})});
})();`

// ── Write ─────────────────────────────────────────────────────────────────────

export function sitemapBlock(lastmod: string): string {
  return PRICING_LANGS.map((l) => [
    '  <url>',
    `    <loc>${SITE}${pricingPath(l)}</loc>`,
    `    <lastmod>${lastmod}</lastmod>`,
    '    <changefreq>monthly</changefreq>',
    '    <priority>0.8</priority>',
    ...PRICING_LANGS.map((a) => `    <xhtml:link rel="alternate" hreflang="${a}" href="${SITE}${pricingPath(a)}" />`),
    `    <xhtml:link rel="alternate" hreflang="x-default" href="${SITE}${pricingPath('en')}" />`,
    '  </url>',
  ].join('\n')).join('\n')
}

function main(): void {
  for (const l of PRICING_LANGS) {
    const dir = path.join(ROOT, 'public', pricingPath(l))
    mkdirSync(dir, { recursive: true })
    writeFileSync(path.join(dir, 'index.html'), renderPricingPage(l))
  }
  const sm = path.join(ROOT, 'public/sitemap.xml')
  let xml = readFileSync(sm, 'utf-8')
  const block = `  <!-- pricing:start (scripts/seo/generate-pricing-pages.ts) -->\n${sitemapBlock(new Date().toISOString().slice(0, 10))}\n  <!-- pricing:end -->\n`
  const re = /  <!-- pricing:start[\s\S]*?<!-- pricing:end -->\n/
  const old = /  <!-- Pricing \(EN, static\) -->\r?\n  <url>\r?\n    <loc>[^<]*\/pricing\/<\/loc>[\s\S]*?<\/url>\r?\n/
  if (re.test(xml)) xml = xml.replace(re, block)
  else if (old.test(xml)) xml = xml.replace(old, block)
  else xml = xml.replace('</urlset>', `${block}</urlset>`)
  writeFileSync(sm, xml)
  console.log(`pricing: ${PRICING_LANGS.length} pages written`)
}

if (process.argv[1] && /generate-pricing-pages\.ts$/.test(process.argv[1])) main()
