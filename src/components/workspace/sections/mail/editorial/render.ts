// Project mail renderer. One issue = masthead + blocks + title block (cajetín).
// Two registers share one system: "editorial" (centred serif masthead, for
// clients, management and newsletters) and "technical" (grid axes, numbered
// sections, mono labels, for coordinators and trades). HTML is table-based
// with inline styles, MSO conditionals and a dark scheme; text is written
// block by block, not stripped from the HTML. No tracking pixel, ever.

import { DISCIPLINES, PAIRINGS, palette, type Disc, type Pairing, type Palette, type Scheme } from './tokens'
import { labels, type Lang, type LabelKey } from './labels'

export type Audience = 'client' | 'trades' | 'coordinators' | 'internal'
export type Register = 'editorial' | 'technical'

interface Base { id: string; hidden?: boolean; title?: string }
export type EBlock = Base & (
  | { k: 'editor'; headline: string; lede: string; sign?: boolean }
  | { k: 'kpis'; items: { label: string; value: string; delta?: string }[] }
  | { k: 'stamp'; score: number; prev?: number; against: string; reqs?: number; pass?: string; cert?: string; note?: string }
  | { k: 'clashes'; rows: { a: Disc; b: Disc; prev: number; open: number; owner: string; due: string }[] }
  | { k: 'bcf'; items: { ref: string; title: string; disc: Disc; status: 'open' | 'review' | 'closed'; owner: string; due: string; where: string }[] }
  | { k: 'changes'; rows: { disc: Disc; file: string; from: string; to: string; note: string }[] }
  | { k: 'milestones'; items: { name: string; date: string; state: 'done' | 'next' | 'later' }[] }
  | { k: 'capture'; src?: string; w: number; h: number; caption: string; href: string }
  | { k: 'actions'; to?: string; items: { who: string; what: string; due: string }[] }
  | { k: 'note'; text: string; quote?: boolean; by?: string }
  | { k: 'decision'; question: string; options: { label: string; impact: string }[]; deadline: string; owner: string }
  | { k: 'requirements'; spec: string; rows: { req: string; entity: string; failing: number; example: string }[] }
  | { k: 'list'; items: { term: string; text: string }[] }
  | { k: 'cta'; label: string; href: string; note?: string }
)
export type BlockKind = EBlock['k']

export interface Publication {
  name: string
  tagline: string
  project: string
  phase: string
  rev: string
  code: string
  editor: { name: string; role: string }
  studio: { name: string; logoUrl?: string }
  client?: { name: string; logoUrl?: string }
  accent: string
  pairing: Pairing
  address: string
}

export interface Issue {
  templateId: string
  audience: Audience
  register: Register
  /** Who it is for, in words: "Instal·lacions Garraf (MEP)". */
  to: string
  kicker: string
  subject: string
  preheader: string
  number: number
  date: string
  range?: string
  blocks: EBlock[]
}

export interface RenderOptions {
  lang: Lang | string
  /** auto = light inline + dark via prefers-color-scheme; light/dark force one (previews). */
  scheme?: 'auto' | Scheme
  utm?: { source: string; medium: string; campaign: string }
  unsubscribeUrl: string
  /** Overrides for the footer when the caller has its own words (legacy templates). */
  footer?: { why?: string; unsubscribe?: string; signature?: string }
}

export interface Rendered { subject: string; preheader: string; html: string; text: string }

// ── Helpers ────────────────────────────────────────────────────────────────────

export const esc = (s: string | number) => String(s).replace(/[&<>"']/g, (ch) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[ch]!))

export function withUtm(href: string, utm?: RenderOptions['utm']) {
  if (!utm || !/^https?:/i.test(href)) return href
  const [base, hash] = href.split('#')
  const q = `utm_source=${encodeURIComponent(utm.source)}&utm_medium=${encodeURIComponent(utm.medium)}&utm_campaign=${encodeURIComponent(utm.campaign)}`
  return `${base}${base.includes('?') ? '&' : '?'}${q}${hash ? `#${hash}` : ''}`
}

const AXES = ['A', 'B', 'C', 'D', 'E', 'F']
const pad2 = (n: number) => String(n).padStart(2, '0')

/** A style fragment and the class that lets the dark media query flip it. */
type Part = { c: string; s: string } | string
/** ` class="…" style="…"` from parts; strings are raw CSS, classes merge into one attribute. */
const at = (...parts: Part[]) => {
  const c = parts.map((x) => (typeof x === 'string' ? '' : x.c)).filter(Boolean).join(' ')
  const s = parts.map((x) => (typeof x === 'string' ? x : x.s)).join('')
  return `${c ? ` class="${c}"` : ''}${s ? ` style="${s}"` : ''}`
}
const K = (c: string): Part => ({ c, s: '' })

function painter(p: Palette, auto: boolean) {
  const cl = (r: string) => (auto ? `e-${r}` : '')
  return {
    fg: (r: 'ink' | 'dim' | 'faint' | 'accent' | 'ok' | 'warn' | 'danger'): Part => ({ c: cl(r), s: `color:${p[r]};` }),
    bg: (r: 'canvas' | 'paper' | 'band'): Part => ({ c: cl(`bg-${r}`), s: `background:${p[r]};` }),
    bd: (r: 'rule' | 'hair', side = 'border', w = '1px solid'): Part => ({ c: cl(`bd-${r}`), s: `${side}:${w} ${p[r]};` }),
  }
}

function darkCss(dark: Palette) {
  const roles = ['ink', 'dim', 'faint', 'accent', 'ok', 'warn', 'danger'] as const
  const sel = (pre: string) => [
    ...roles.map((r) => `${pre}.e-${r}{color:${dark[r]}!important}`),
    ...(['paper', 'band', 'canvas'] as const).map((r) => `${pre}.e-bg-${r}{background:${dark[r]}!important}`),
    `${pre}.e-bd-rule{border-color:${dark.rule}!important}`, `${pre}.e-bd-hair{border-color:${dark.hair}!important}`,
    ...(Object.keys(DISCIPLINES) as Disc[]).map((d) => `${pre}.e-d-${d}{color:${DISCIPLINES[d].dark}!important;border-color:${DISCIPLINES[d].dark}!important}`),
  ].join('')
  return `@media (prefers-color-scheme:dark){${sel('')}}${sel('[data-ogsc] ')}`
}

// ── Renderer ───────────────────────────────────────────────────────────────────

export function renderIssue(issue: Issue, pub: Publication, o: RenderOptions): Rendered {
  const L = labels(String(o.lang))
  const lab = (k: LabelKey) => L[k]
  const scheme = o.scheme ?? 'auto'
  const auto = scheme === 'auto'
  const p = palette(scheme === 'dark' ? 'dark' : 'light', pub.accent)
  const P = painter(p, auto)
  const F = PAIRINGS[pub.pairing] ?? PAIRINGS.editorial
  const tech = issue.register === 'technical'
  const G = 44
  const link = (h: string) => esc(withUtm(h, o.utm))
  const html: string[] = []
  const text: string[] = []

  const ink = P.fg('ink'), dim = P.fg('dim'), faint = P.fg('faint'), acc = P.fg('accent')
  const hairB = P.bd('hair', 'border-bottom'), hairT = P.bd('hair', 'border-top'), hairL = P.bd('hair', 'border-left')
  const ruleB = P.bd('rule', 'border-bottom'), ruleT = P.bd('rule', 'border-top'), ruleBox = P.bd('rule')
  const mono = (size: string) => `font:${size} ${F.mono};`
  const body = (size: string) => `font:${size} ${F.body};`
  const caps = 'letter-spacing:.08em;text-transform:uppercase;'

  const tag = (d: Disc) => {
    const col = DISCIPLINES[d]?.[scheme === 'dark' ? 'dark' : 'light'] ?? p.dim
    return `<span${at(K(auto ? `e-d-${d}` : ''), `display:inline-block;border:1px solid ${col};color:${col};${mono('700 10px/14px')}padding:0 4px;letter-spacing:.04em;`)}>${esc(d)}</span>`
  }
  const row = (inner: string, padding = `0 ${G}px`) => html.push(`<tr><td class="px" style="padding:${padding}">${inner}</td></tr>`)
  const top = (b: { title?: string }, fallback = 20) => `${b.title ? 0 : fallback}px ${G}px 8px`

  let n = 0
  const head = (title?: string) => {
    if (!title) return
    n++
    text.push('', `${pad2(n)} · ${title.toUpperCase()}`, '')
    if (tech) {
      row(`<table role="presentation" width="100%"><tr><td width="34" valign="top"><span${at(ruleBox, ink, `display:inline-block;width:22px;height:22px;border-radius:50%;text-align:center;${mono('700 11px/22px')}`)}>${n}</span></td>`
        + `<td${at(ink, mono('700 12px/22px'), caps)}>${esc(title)}</td></tr></table>`, `${n === 1 ? 32 : 36}px ${G}px 12px`)
    } else {
      html.push(`<tr><td${at(K('px'), hairT, `padding:36px ${G}px 14px;`)}><p${at(acc, 'margin:0;', mono('11px/16px'), 'letter-spacing:.14em;')}>${pad2(n)}</p>`
        + `<h2${at(ink, `margin:4px 0 0;font:400 24px/30px ${F.display};`)}>${esc(title)}</h2></td></tr>`)
    }
  }

  // ── Masthead ──
  const dateline = esc(issue.range ?? issue.date)
  if (tech) {
    html.push(`<tr><td${at(K('hide-m'), hairB)}><table role="presentation" width="100%"><tr>${AXES.map((a, i) => `<td align="center"${at(faint, mono('10px/18px'), ...(i ? [hairL] : []))}>${a}</td>`).join('')}</tr></table></td></tr>`)
    row(`<table role="presentation" width="100%"><tr><td valign="bottom"><p${at(dim, 'margin:0;', mono('11px/16px'), 'letter-spacing:.06em;text-transform:uppercase;')}>${esc(pub.tagline)}</p>`
      + `<p${at(ink, `margin:4px 0 0;font:700 30px/34px ${F.body};letter-spacing:-.01em;`)}>${esc(pub.name)}</p></td>`
      + `<td valign="bottom" align="right"${at(ink, mono('12px/18px'), 'white-space:nowrap;')}>${esc(lab('no'))} ${String(issue.number).padStart(3, '0')}<br>${dateline}</td></tr></table>`, `26px ${G}px 22px`)
    html.push(`<tr><td${at(P.bd('rule', 'border-top', '2px solid'), 'font-size:0;line-height:0;')}>&nbsp;</td></tr>`)
  } else {
    row(`<table role="presentation" width="100%"><tr><td${at(faint, body('11px/16px'), 'letter-spacing:.12em;text-transform:uppercase;')}>${esc(lab('no'))} ${issue.number} · ${esc(issue.kicker)}</td>`
      + `<td align="right"${at(faint, body('11px/16px'), 'letter-spacing:.12em;text-transform:uppercase;')}>${dateline}</td></tr></table>`, `28px ${G}px 0`)
    const logo = (l?: { name: string; logoUrl?: string }) => (l?.logoUrl ? `<img src="${esc(l.logoUrl)}" width="96" height="32" alt="${esc(l.name)}" style="width:96px;height:32px;display:inline-block;margin:0 8px">` : '')
    const logos = logo(pub.studio) + logo(pub.client)
    row(`${logos ? `<p style="margin:0 0 14px">${logos}</p>` : ''}<p${at(ink, K('e-mast'), `margin:0;font:400 52px/56px ${F.display};letter-spacing:-.01em;`)}>${esc(pub.name)}</p>`
      + `<p${at(dim, `margin:8px 0 0;font:italic 15px/21px ${F.lede};`)}>${esc(pub.tagline)} · ${esc(pub.project)}</p>`, `24px ${G}px 22px;text-align:center`)
    row(`<table role="presentation" width="100%"><tr><td${at(P.bd('rule', 'border-top', '3px double'), 'font-size:0;line-height:0;')}>&nbsp;</td></tr></table>`)
  }
  html.push(`<tr><td${at(K('px'), P.bg('band'), `padding:10px ${G}px;`)}><span${at(faint, mono('11px/17px'), caps)}>${esc(lab('to'))}&nbsp;&nbsp;</span><span${at(ink, mono('700 11px/17px'), caps)}>${esc(issue.to)}</span>`
    + `<span${at(faint, mono('11px/17px'), caps)}>&nbsp;&nbsp;·&nbsp;&nbsp;${esc(lab('from'))}&nbsp;&nbsp;</span><span${at(ink, mono('11px/17px'), caps)}>${esc(pub.editor.name)}</span></td></tr>`)
  text.push(`${pub.name.toUpperCase()} · ${lab('no')} ${issue.number} · ${issue.range ?? issue.date}`, `${pub.tagline} · ${pub.project}`, `${lab('to')}: ${issue.to} · ${lab('from')}: ${pub.editor.name}`)

  // ── Blocks ──
  for (const b of issue.blocks) {
    if (b.hidden) continue
    switch (b.k) {
      case 'editor': {
        row(`<h1${at(ink, K('e-h1'), `margin:0;font:${tech ? `700 25px/31px ${F.body}` : `400 38px/44px ${F.display}`};letter-spacing:-.01em;`)}>${esc(b.headline)}</h1>`
          + (b.lede ? `<p${at(ink, `margin:16px 0 0;font:${tech ? `15px/24px ${F.body}` : `18px/29px ${F.lede}`};`)}>${esc(b.lede)}</p>` : '')
          + (b.sign === false ? '' : `<p${at(dim, 'margin:14px 0 0;', body('13px/18px'))}>— ${esc(pub.editor.name)}, ${esc(pub.editor.role)}</p>`), `${tech ? 28 : 36}px ${G}px 6px`)
        text.push('', b.headline.toUpperCase(), ...(b.lede ? ['', b.lede] : []), ...(b.sign === false ? [] : [`— ${pub.editor.name}, ${pub.editor.role}`]))
        break
      }
      case 'kpis': {
        head(b.title)
        row(`<table role="presentation" width="100%"><tr>${b.items.map((k, i) => `<td class="st" valign="top" width="${Math.floor(100 / b.items.length)}%" style="padding:0 ${i < b.items.length - 1 ? 16 : 0}px 14px 0">`
          + `<p${at(ink, `margin:0;font:${tech ? `700 30px/34px ${F.mono}` : `400 36px/40px ${F.display}`};font-variant-numeric:tabular-nums lining-nums;`)}>${esc(k.value)}</p>`
          + `<p${at(dim, 'margin:6px 0 0;', body('13px/18px'))}>${esc(k.label)}${k.delta ? ` <span${at(acc, 'white-space:nowrap;')}>${esc(k.delta)}</span>` : ''}</p></td>`).join('')}</tr></table>`, top(b))
        text.push(...b.items.map((k) => `- ${k.label}: ${k.value}${k.delta ? ` (${k.delta})` : ''}`))
        break
      }
      case 'stamp': {
        head(b.title)
        const d = b.prev != null ? b.score - b.prev : null
        const tone = P.fg(b.score >= 80 ? 'ok' : b.score >= 60 ? 'warn' : 'danger')
        const trend = P.fg(d != null && d < 0 ? 'danger' : 'ok')
        row(`<table role="presentation" width="100%"${at(ruleBox)}><tr>`
          + `<td class="st" width="40%" valign="top" style="padding:18px 20px"><p${at(faint, 'margin:0;', mono('10px/14px'), caps)}>${esc(b.cert ? `${lab('health')} · ${b.cert}` : lab('health'))}</p>`
          + `<p${at(ink, 'margin:6px 0 0;', mono('700 52px/54px'), 'font-variant-numeric:tabular-nums;')}>${b.score}</p>`
          + (d != null ? `<p${at(trend, 'margin:2px 0 0;', mono('12px/16px'))}>${d >= 0 ? '▲' : '▼'} ${Math.abs(d)} · ${b.prev}→${b.score}</p>` : '')
          + `</td><td${at(K('st bl'), hairL, 'padding:18px 20px;')} valign="top">`
          + `<p${at(dim, 'margin:0;', body('13px/20px'))}>${esc(lab('measured'))}</p><p${at(ink, 'margin:2px 0 0;', mono('13px/20px'), 'word-break:break-all;')}>${esc(b.against)}</p>`
          + (b.reqs ? `<p${at(dim, 'margin:10px 0 0;', body('13px/20px'))}><b${at(ink, `font-family:${F.mono};`)}>${b.reqs}</b> ${esc(lab('reqs'))}${b.pass ? ` · <b${at(tone, `font-family:${F.mono};`)}>${esc(b.pass)}</b>` : ''}</p>` : '')
          + (b.note ? `<p${at(dim, 'margin:10px 0 0;', body('13px/20px'))}>${esc(b.note)}</p>` : '')
          + `</td></tr></table>`, top(b))
        text.push(`${lab('health')}: ${b.score}${d != null ? ` (${d >= 0 ? '+' : ''}${d})` : ''} · ${lab('measured')} ${b.against}${b.reqs ? ` · ${b.reqs} ${lab('reqs')}${b.pass ? ` ${b.pass}` : ''}` : ''}${b.note ? ` · ${b.note}` : ''}`)
        break
      }
      case 'clashes': {
        head(b.title)
        const th = (t: string, al = '') => `<td${al}${at(faint, ruleB, 'padding:6px 0;', mono('10px/14px'), caps)}>${esc(t)}</td>`
        row(`<table role="presentation" width="100%"><tr>${th(lab('pair'))}${th('←', ' align="right"')}${th('→', ' align="right"')}<td${at(K('hide-m'), faint, ruleB, 'padding:6px 0 6px 16px;', mono('10px/14px'), caps)}>${esc(lab('owner'))}</td>${th(lab('due'), ' align="right"')}</tr>`
          + b.rows.map((r) => `<tr><td${at(hairB, 'padding:10px 0;white-space:nowrap;')}>${tag(r.a)} ${tag(r.b)}</td>`
            + `<td align="right"${at(faint, hairB, mono('13px/18px'))}>${r.prev}</td>`
            + `<td align="right"${at(ink, hairB, mono('700 14px/18px'))}>${r.open}</td>`
            + `<td${at(K('hide-m'), ink, hairB, 'padding-left:16px;', body('13px/18px'))}>${esc(r.owner)}</td>`
            + `<td align="right"${at(ink, hairB, mono('13px/18px'), 'white-space:nowrap;padding-left:8px;')}>${esc(r.due)}</td></tr>`).join('')
          + `</table>`, top(b))
        text.push(...b.rows.map((r) => `- ${r.a} × ${r.b}: ${r.prev} → ${r.open} · ${r.owner} · ${lab('due')} ${r.due}`))
        break
      }
      case 'bcf': {
        head(b.title)
        const st = { open: ['statusOpen', 'danger'], review: ['statusReview', 'warn'], closed: ['statusClosed', 'ok'] } as const
        row(b.items.map((x) => {
          const [sk, tone] = st[x.status]
          return `<table role="presentation" width="100%"><tr><td${at(hairB, 'padding:12px 0;')}><p style="margin:0">${tag(x.disc)} <span${at(faint, mono('11px/16px'))}>${esc(x.ref)}</span> <span${at(P.fg(tone), mono('700 11px/16px'), caps)}>· ${esc(lab(sk))}</span></p>`
            + `<p${at(ink, 'margin:4px 0 0;', body('15px/21px'))}>${esc(x.title)}</p><p${at(dim, 'margin:2px 0 0;', body('12px/17px'))}>${esc(x.where)} · ${esc(x.owner)}</p></td>`
            + `<td valign="top" align="right"${at(ink, hairB, 'padding:12px 0 12px 12px;', mono('700 12px/20px'), 'white-space:nowrap;')}>${esc(x.due)}</td></tr></table>`
        }).join(''), top(b))
        text.push(...b.items.map((x) => `- [${x.disc}] ${x.ref} ${x.title} (${lab(st[x.status][0])}) · ${x.where} · ${x.owner} · ${x.due}`))
        break
      }
      case 'changes': {
        head(b.title)
        row(b.rows.map((v) => `<p style="margin:0 0 14px">${tag(v.disc)} <span${at(ink, mono('12px/18px'), 'word-break:break-all;')}>${esc(v.file)}</span> <span${at(faint, mono('12px/18px'))}>${esc(v.from)}→</span><b${at(ink, mono('700 12px/18px'))}>${esc(v.to)}</b><br><span${at(ink, body('14px/21px'))}>${esc(v.note)}</span></p>`).join(''), top(b))
        text.push(...b.rows.map((v) => `- [${v.disc}] ${v.file} ${v.from}→${v.to}: ${v.note}`))
        break
      }
      case 'milestones': {
        head(b.title)
        const mark = { done: '●', next: '◐', later: '○' } as const
        row(`<table role="presentation" width="100%">${b.items.map((m) => {
          const T = m.state === 'later' ? faint : ink
          return `<tr><td width="22" valign="top"${at(m.state === 'next' ? acc : T, hairB, 'padding:9px 0;', mono('14px/20px'))}>${mark[m.state]}</td>`
            + `<td${at(T, hairB, 'padding:9px 0;', body(`${m.state === 'next' ? 700 : 400} 14px/20px`))}>${esc(m.name)}</td>`
            + `<td align="right"${at(T, hairB, mono('13px/20px'), 'white-space:nowrap;padding-left:12px;')}>${esc(m.date)}</td></tr>`
        }).join('')}</table>`, top(b))
        text.push(...b.items.map((m) => `${mark[m.state]} ${m.date} ${m.name}`))
        break
      }
      case 'capture': {
        head(b.title)
        const w = tech ? 640 - 2 * G : 640
        const h = Math.round(w * b.h / b.w)
        const img = b.src
          ? `<a href="${link(b.href)}"><img class="img" src="${esc(b.src)}" width="${w}" height="${h}" alt="${esc(b.caption)}"${at(`width:${w}px;height:${h}px;max-width:100%;`, ...(tech ? [ruleBox] : []))}></a>`
          : `<a href="${link(b.href)}"${at(dim, P.bd('hair'), 'display:block;padding:56px 12px;text-align:center;text-decoration:none;', mono('13px/18px'))}>${esc(b.caption)}</a>`
        if (tech) row(img, `${b.title ? 0 : 24}px ${G}px 0`)
        else html.push(`<tr><td style="padding:${b.title ? 0 : 28}px 0 0">${img}</td></tr>`)
        row(`<table role="presentation" width="100%"><tr><td${at(dim, 'padding:8px 0 0;', tech ? `${mono('10px/15px')}text-transform:uppercase;letter-spacing:.04em;` : `font:italic 13px/19px ${F.lede};`)}>${esc(b.caption)}</td>`
          + `<td align="right" valign="top" style="padding:8px 0 0 12px;white-space:nowrap"><a href="${link(b.href)}"${at(acc, mono('700 11px/15px'), 'text-decoration:underline;')}>${tech ? 'N ↑ · ' : ''}${esc(lab('openView'))} →</a></td></tr></table>`, `0 ${G}px 8px`)
        text.push(`[${b.caption}]`, `${lab('openView')}: ${withUtm(b.href, o.utm)}`)
        break
      }
      case 'actions': {
        head(b.title)
        const sec = n
        row((b.to ? `<p${at(dim, 'margin:0 0 6px;', body('13px/18px'))}>${esc(b.to)}</p>` : '') + b.items.map((a, i) => `<table role="presentation" width="100%"><tr>`
          + `<td width="34" valign="top"${at(faint, 'padding:11px 0;', mono('12px/20px'))}>${sec || 1}.${i + 1}</td>`
          + `<td valign="top"${at(hairB, 'padding:11px 0;')}><p${at(ink, 'margin:0;', body('15px/21px'))}>${esc(a.what)}</p><p${at(dim, 'margin:2px 0 0;', body('12px/17px'))}>${esc(a.who)}</p></td>`
          + `<td valign="top" align="right"${at(ink, hairB, 'padding:11px 0 11px 12px;', mono('700 12px/20px'), 'white-space:nowrap;')}>${esc(a.due)}</td></tr></table>`).join(''), top(b))
        text.push(...b.items.map((a) => `[ ] ${a.what} — ${a.who} — ${a.due}`))
        break
      }
      case 'note': {
        head(b.title)
        row(b.quote
          ? `<table role="presentation" width="100%"><tr><td${at(P.bd('rule', 'border-left', '2px solid'), 'padding:4px 0 4px 18px;')}><p${at(ink, `margin:0;font:italic 19px/28px ${F.lede};`)}>${esc(b.text)}</p>${b.by ? `<p${at(dim, 'margin:8px 0 0;', body('12px/16px'))}>— ${esc(b.by)}</p>` : ''}</td></tr></table>`
          : `<p${at(ink, 'margin:0;', body('15px/24px'))}>${esc(b.text).replace(/\n/g, '<br>')}</p>`, top(b, 22))
        text.push(b.quote ? `“${b.text}”${b.by ? ` — ${b.by}` : ''}` : b.text)
        break
      }
      case 'decision': {
        head(b.title)
        row(`<table role="presentation" width="100%"${at(ruleBox)}><tr><td style="padding:18px 20px">`
          + `<p${at(ink, `margin:0;font:${tech ? `700 17px/24px ${F.body}` : `400 21px/28px ${F.display}`};`)}>${esc(b.question)}</p>`
          + `<p${at(faint, 'margin:14px 0 4px;', mono('10px/14px'), caps)}>${esc(lab('options'))}</p>`
          + b.options.map((x, i) => `<p${at(hairT, 'margin:0;padding:8px 0;')}><b${at(ink, mono('700 14px/20px'))}>${String.fromCharCode(65 + i)}</b>&nbsp;&nbsp;<span${at(ink, body('14px/20px'))}>${esc(x.label)}</span><br><span${at(dim, body('13px/19px'))}>${esc(x.impact)}</span></p>`).join('')
          + `<p${at(ruleT, 'margin:10px 0 0;padding-top:10px;')}><span${at(faint, mono('11px/16px'), caps)}>${esc(lab('decideBy'))}</span> <b${at(ink, mono('700 13px/16px'))}>${esc(b.deadline)}</b> <span${at(dim, body('13px/16px'))}>· ${esc(b.owner)}</span></p>`
          + `</td></tr></table>`, top(b))
        text.push(b.question, ...b.options.map((x, i) => `  ${String.fromCharCode(65 + i)}) ${x.label} — ${x.impact}`), `${lab('decideBy')} ${b.deadline} · ${b.owner}`)
        break
      }
      case 'requirements': {
        head(b.title)
        row(`<p${at(dim, 'margin:0 0 8px;', mono('12px/17px'), 'word-break:break-all;')}>${esc(b.spec)}</p>` + b.rows.map((r) => `<table role="presentation" width="100%"><tr><td${at(hairB, 'padding:10px 0;')}>`
          + `<p${at(ink, 'margin:0;', body('14px/20px'), 'word-break:break-word;overflow-wrap:anywhere;')}>${esc(r.req)}</p><p${at(dim, 'margin:2px 0 0;', mono('12px/17px'), 'word-break:break-all;')}>${esc(r.entity)} · ${esc(lab('example'))} ${esc(r.example)}</p></td>`
          + `<td align="right" valign="top"${at(hairB, 'padding:10px 0 10px 12px;white-space:nowrap;')}><b${at(P.fg('danger'), mono('700 15px/20px'))}>${r.failing}</b><br><span${at(faint, mono('10px/14px'), 'text-transform:uppercase;')}>${esc(lab('elements'))}</span></td></tr></table>`).join(''), top(b))
        text.push(b.spec, ...b.rows.map((r) => `- ${r.req}: ${r.failing} ${lab('elements')} (${r.entity}, ${lab('example')} ${r.example})`))
        break
      }
      case 'list': {
        head(b.title)
        row(b.items.map((x) => `<table role="presentation" width="100%"><tr><td class="st" width="34%" valign="top"${at(hairB, 'padding:10px 12px 10px 0;')}><span${at(ink, mono('700 12px/19px'), 'word-break:break-all;')}>${esc(x.term)}</span></td>`
          + `<td class="st" valign="top"${at(hairB, 'padding:10px 0;')}><span${at(ink, body('14px/21px'))}>${esc(x.text)}</span></td></tr></table>`).join(''), top(b))
        text.push(...b.items.map((x) => `- ${x.term}: ${x.text}`))
        break
      }
      case 'cta': {
        head(b.title)
        const btn = `<a href="${link(b.href)}" style="display:inline-block;background:${p.fill};color:${p.onFill};font:700 14px/20px ${tech ? F.mono : F.body};padding:14px 26px;text-decoration:none;${tech ? 'letter-spacing:.04em;text-transform:uppercase;' : ''}">${esc(b.label)}${tech ? ' →' : ''}</a>`
        const vml = `<!--[if mso]><v:rect xmlns:v="urn:schemas-microsoft-com:vml" href="${link(b.href)}" style="height:48px;v-text-anchor:middle;width:300px" stroke="f" fillcolor="${p.fill}"><center style="color:${p.onFill};font-family:Arial,sans-serif;font-size:14px;font-weight:bold">${esc(b.label)}</center></v:rect><![endif]--><!--[if !mso]><!-->${btn}<!--<![endif]-->`
        row(`<div style="text-align:${tech ? 'left' : 'center'}">${vml}${b.note ? `<p${at(dim, 'margin:14px 0 0;', body('13px/18px'))}>${esc(b.note)}</p>` : ''}</div>`, `${b.title ? 0 : 30}px ${G}px 10px`)
        text.push('', `${b.label}: ${withUtm(b.href, o.utm)}`, ...(b.note ? [b.note] : []))
        break
      }
    }
  }

  // ── Title block (cajetín) + footer ──
  html.push(`<tr><td style="height:30px;line-height:30px;font-size:0">&nbsp;</td></tr>`)
  const cell = (k: LabelKey, v: string, first: boolean, upper: boolean) => `<td valign="top"${at(K(first ? 'st' : 'st bl'), ...(first ? [] : [P.bd('rule', 'border-left')]), ...(upper ? [] : [ruleT]), 'padding:8px 12px;')}>`
    + `<p${at(faint, 'margin:0;', mono('9px/12px'), caps)}>${esc(lab(k))}</p><p${at(ink, 'margin:2px 0 0;', mono('11px/15px'), 'word-break:break-all;')}>${esc(v)}</p></td>`
  html.push(`<tr><td${at(P.bd('rule', 'border-top', '2px solid'))}><table role="presentation" width="100%">`
    + `<tr>${cell('project', pub.project, true, true)}${cell('phase', pub.phase, false, true)}${cell('rev', pub.rev, false, true)}</tr>`
    + `<tr>${cell('author', `${pub.editor.name} · ${pub.studio.name}`, true, false)}${cell('date', issue.date, false, false)}${cell('code', pub.code, false, false)}</tr></table></td></tr>`)
  const why = o.footer?.why ?? lab('why'), unsub = o.footer?.unsubscribe ?? lab('unsubscribe')
  html.push(`<tr><td${at(K('px'), ruleT, `padding:14px ${G}px 26px;`)}><p${at(faint, 'margin:0;', body('11px/17px'))}>${o.footer?.signature ? `${esc(o.footer.signature)}<br>` : ''}${esc(pub.studio.name)} · ${esc(pub.address)}<br>${esc(why)} <a href="${esc(o.unsubscribeUrl)}"${at(faint, 'text-decoration:underline;')}>${esc(unsub)}</a></p></td></tr>`)
  text.push('', '—', `${lab('project')}: ${pub.project} · ${lab('phase')}: ${pub.phase} · ${lab('rev')} ${pub.rev}`, `${lab('author')}: ${pub.editor.name} · ${pub.studio.name} · ${lab('date')}: ${issue.date} · ${lab('code')}: ${pub.code}`,
    ...(o.footer?.signature ? [o.footer.signature] : []), `${pub.studio.name} · ${pub.address}`, `${why} ${unsub}: ${o.unsubscribeUrl}`)

  const css = 'body{margin:0;padding:0;-webkit-text-size-adjust:100%;-ms-text-size-adjust:100%}table{border-collapse:collapse;mso-table-lspace:0;mso-table-rspace:0}img{border:0;display:block;outline:none;-ms-interpolation-mode:bicubic}a{color:inherit}'
    + `@media (max-width:620px){.w{width:100%!important}.px{padding-left:20px!important;padding-right:20px!important}.st{display:block!important;width:100%!important;box-sizing:border-box}.bl{border-left:0!important}.hide-m{display:none!important}.img{width:100%!important;height:auto!important}.e-mast{font-size:40px!important;line-height:44px!important}.e-h1{font-size:${tech ? 22 : 30}px!important;line-height:${tech ? 28 : 36}px!important}}`
    + (auto ? darkCss(palette('dark', pub.accent)) : '')
  const lang = String(o.lang).split('-')[0]
  const cs = auto ? 'light dark' : scheme
  const doc = `<!doctype html><html lang="${esc(lang)}" xmlns:v="urn:schemas-microsoft-com:vml" xmlns:o="urn:schemas-microsoft-com:office:office"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><meta name="x-apple-disable-message-reformatting">`
    + `<meta name="color-scheme" content="${cs}"><meta name="supported-color-schemes" content="${cs}"><title>${esc(issue.subject)}</title>`
    + `<!--[if mso]><noscript><xml><o:OfficeDocumentSettings><o:PixelsPerInch>96</o:PixelsPerInch></o:OfficeDocumentSettings></xml></noscript><![endif]--><style>${css}</style></head>`
    + `<body${at(P.bg('canvas'), 'margin:0;padding:0;')}>`
    + `<div style="display:none;max-height:0;overflow:hidden;mso-hide:all;font-size:1px;line-height:1px;color:${p.canvas}">${esc(issue.preheader)}${'&#8199;&#65279;&#847;'.repeat(30)}</div>`
    + `<table role="presentation" width="100%"${at(P.bg('canvas'))}><tr><td align="center" style="padding:16px 0">`
    + `<!--[if mso]><table role="presentation" width="640" align="center"><tr><td><![endif]-->`
    + `<table role="presentation" width="640"${at(K('w'), P.bg('paper'), 'width:640px;max-width:640px;')}>${html.join('')}</table>`
    + `<!--[if mso]></td></tr></table><![endif]--></td></tr></table></body></html>`
  const plain = text.filter((l, i, a) => !(l === '' && a[i - 1] === '')).join('\n').trim() + '\n'
  return { subject: issue.subject, preheader: issue.preheader, html: doc, text: plain }
}
