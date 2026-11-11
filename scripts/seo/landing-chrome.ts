// ─── landing-chrome ───────────────────────────────────────────────────────────
// One header, one closing "next step" block and one set of design rules for
// every static acquisition landing in public/ (validator, Solibri alternative,
// editor, health check, examples, twins… ×10 languages).
//
// The landings come from three places (generate-tool-landings.mjs,
// build-demo-landings.ts and hand-written HTML), so instead of teaching each
// one the same markup this module post-processes the finished HTML:
//
//   1. <header>…</header> → shared header with a real menu (product, examples,
//      guides, blog, pricing) and the "open the viewer" button.
//   2. Before <footer>: the funnel's next step — try the demo → keep your
//      checks with a free account → see the plans.
//   3. CSS: every font-size under 13 px in the page's own <style> is raised to
//      13 px, and gradient-filled text becomes a flat token colour.
//
// It is idempotent: running it on its own output changes nothing, which is
// what the test uses to prove public/ is in sync.
//
// Usage (after any landing generator):
//   npx tsx scripts/seo/landing-chrome.ts

import { readFileSync, writeFileSync, readdirSync, statSync, existsSync } from 'node:fs'
import { join, relative, resolve, dirname } from 'node:path'
import { fileURLToPath } from 'node:url'
import { pricingPath } from '../../src/lib/pricing/pricing-paths'
import { COPY as PRICING_COPY } from './pricing/pricing-i18n'

export const LANGS = ['en', 'es', 'de', 'fr', 'pt', 'it', 'ca', 'zh', 'ja', 'th'] as const
export type Lang = (typeof LANGS)[number]
export const MIN_FONT_PX = 13

/**
 * Colour tokens of docs/COLOR_SYSTEM.md, dark and light, the same values and the
 * same switch as /pricing/ (prefers-color-scheme, overridden by localStorage
 * 'lp-theme' → <html data-theme>). Colours live only here: every literal colour
 * in a landing's own CSS is rewritten to one of these variables.
 */
export const THEMES = {
  dark: {
    canvas: '#100f0c', panel: '#181714', line: '#34332e', text: '#ecebe7', 'text-2': '#b2b1ab', 'text-3': '#94928d',
    accent: '#0a8481', 'on-accent': '#ffffff', 'accent-text': '#55cac3', ok: '#6fc884', warn: '#f2af48', danger: '#f66e60',
    ink: '#ffffff', shadow: '#000000', tint: '1',
  },
  light: {
    canvas: '#f4f3f0', panel: '#fefdfc', line: '#d5d4d0', text: '#1c1b16', 'text-2': '#4e4d48', 'text-3': '#65635e',
    accent: '#00696a', 'on-accent': '#ffffff', 'accent-text': '#00696a', ok: '#206b38', warn: '#915c08', danger: '#af2b25',
    ink: '#1c1b16', shadow: '#1c1b16', tint: '.4',
  },
} as const
export type Token = keyof typeof THEMES.dark
const v = (t: Token) => `var(--lc-${t})`
/** Kept for callers that want the dark value of a role. */
export const TOKENS = {
  canvas: v('canvas'), panel: v('panel'), line: v('line'), text: v('text'), text2: v('text-2'), text3: v('text-3'),
  accent: v('accent'), onAccent: v('on-accent'), accentText: v('accent-text'),
} as const

const block = (t: Record<string, string>) => Object.entries(t).map(([k, x]) => `--lc-${k}:${x}`).join(';')
export const TOKEN_CSS = `:root{${block(THEMES.dark)};color-scheme:dark}
@media (prefers-color-scheme: light){:root:not([data-theme="dark"]){${block(THEMES.light)};color-scheme:light}}
:root[data-theme="light"]{${block(THEMES.light)};color-scheme:light}
html,body{background:${v('canvas')}!important;color:${v('text')}}`

/** Literal colours found in the landings → the role they play. */
const HEX: Record<string, Token> = {
  '100f0c': 'canvas', '111216': 'canvas', '0f0f13': 'canvas', '111': 'canvas', '181714': 'panel', '34332e': 'line',
  ecebe7: 'text', b2b1ab: 'text-2', '94928d': 'text-3', '0a8481': 'accent', '55cac3': 'accent-text',
  a5aef0: 'accent-text', '9aa4ee': 'accent-text', '8b96e9': 'accent-text', '4f5abf': 'accent', e8e8f0: 'text', '7ed3a0': 'ok', f5c16b: 'warn', ff8082: 'danger', '6f7be0': 'accent-text', '52c41a': 'ok', '4caf82': 'ok', e9a23b: 'warn', dc3545: 'danger',
}
const RGB: Record<string, Token> = {
  '255,255,255': 'ink', '10,132,129': 'accent', '85,202,195': 'accent-text', '82,196,26': 'ok', '233,162,59': 'warn', '220,53,69': 'danger', '0,0,0': 'shadow', '245,166,35': 'warn', '255,77,79': 'danger',
}
const pct = (a: number) => `${Math.round(a * 1000) / 10}%`

/** Rewrite the colours of one declaration list (a rule body or a style="" value). */
export function tokenizeDecls(body: string): string {
  const onAccent = /background(?:-color)?:\s*(?:#0a8481|var\(--lc-accent\))/i.test(body)
  return body.replace(/([a-z-]+)(\s*:\s*)([^;]*)/gi, (m, prop: string, sep: string, val: string) => {
    const isText = prop.toLowerCase() === 'color' || prop.toLowerCase() === 'fill'
    const out = val
      .replace(/#([0-9a-f]{6}|[0-9a-f]{3})\b/gi, (h, x: string) => {
        const k = x.toLowerCase()
        if (k === 'fff' || k === 'ffffff') return onAccent && isText ? v('on-accent') : isText ? v('text') : v('on-accent')
        const t = HEX[k]
        return t ? v(isText && t === 'accent' ? 'accent-text' : t) : h
      })
      .replace(/rgba?\(\s*(\d+)\s*,\s*(\d+)\s*,\s*(\d+)\s*(?:,\s*([\d.]+)\s*)?\)/g, (r, a: string, b: string, c: string, al?: string) => {
        const t = RGB[`${a},${b},${c}`]
        if (!t) return r
        const alpha = al === undefined ? 1 : +al
        if (t === 'ink' && isText) return onAccent ? v('on-accent') : v(alpha >= 0.7 ? 'text' : alpha >= 0.5 ? 'text-2' : 'text-3')
        if (isText) return v(t === 'accent' ? 'accent-text' : t)
        if (alpha >= 1) return v(t)
        // Tints of a hue are lighter in the light theme (--lc-tint), so text on them keeps AA.
        return t === 'ink' || t === 'shadow' ? `color-mix(in srgb,${v(t)} ${pct(alpha)},transparent)` : `color-mix(in srgb,${v(t)} calc(${pct(alpha)} * var(--lc-tint)),transparent)`
      })
    return out === val ? m : `${prop}${sep}${out}`
  })
}

/** Rewrite every literal colour in a stylesheet, rule by rule. */
export function tokenizeCss(css: string): string {
  return css.replace(/\{([^{}]*)\}/g, (_m, body: string) => `{${tokenizeDecls(body)}}`)
}

/** Literal colours left in CSS, style="" or SVG paint attributes (the test wants none). */
export function literalColours(html: string): string[] {
  const css = [...html.matchAll(/<style[^>]*>([\s\S]*?)<\/style>/g)].map((m) => m[1].replace(/--lc-[a-z0-9-]+:[^;}]*/g, ''))
  const attrs = [...html.matchAll(/\sstyle="([^"]*)"/g)].map((m) => m[1])
  const paint = [...html.matchAll(/\s(?:fill|stroke|stop-color)="([^"]*)"/g)].map((m) => m[1])
  return [...css, ...attrs, ...paint].flatMap((t) => t.match(/#[0-9a-f]{3,8}\b|rgba?\([^)]*\)/gi) ?? [])
}

const EXAMPLES: Record<Lang, string> = {
  en: 'ifc-viewer-examples', es: 'ejemplos-visor-ifc', de: 'ifc-viewer-beispiele', fr: 'exemples-visionneuse-ifc',
  pt: 'exemplos-visualizador-ifc', it: 'esempi-visualizzatore-ifc', ca: 'exemples-visor-ifc',
  zh: 'ifc-viewer-examples', ja: 'ifc-viewer-examples', th: 'ifc-viewer-examples',
}

interface Copy {
  menu: string; product: string; examples: string; guides: string; blog: string; pricing: string; open: string
  nextTitle: string; steps: [string, string][]; nextLead: string
}

export const COPY: Record<Lang, Copy> = {
  en: { menu: 'Main menu', product: 'Viewer', examples: 'Examples', guides: 'Fix guides', blog: 'Blog', pricing: 'Pricing', open: 'Open the viewer',
    nextTitle: 'Your next step', nextLead: 'Free, in your browser. Nothing is uploaded.',
    steps: [['Open a sample model', 'See the Health Score and the failing rules on a real IFC in under a minute.'], ['Create a free account', 'Keep your checks and share the report with your team or client.'], ['Compare the plans', 'Pro, Team and model reception for whoever receives the deliveries.']] },
  es: { menu: 'Menú principal', product: 'Visor', examples: 'Ejemplos', guides: 'Guías de corrección', blog: 'Blog', pricing: 'Precios', open: 'Abrir el visor',
    nextTitle: 'Siguiente paso', nextLead: 'Gratis, en tu navegador. No se sube nada.',
    steps: [['Abre un modelo de ejemplo', 'Mira el Health Score y las reglas que fallan en un IFC real en menos de un minuto.'], ['Crea una cuenta gratuita', 'Guarda tus comprobaciones y comparte el informe con tu equipo o tu cliente.'], ['Compara los planes', 'Pro, Team y recepción de modelos para quien recibe las entregas.']] },
  de: { menu: 'Hauptmenü', product: 'Viewer', examples: 'Beispiele', guides: 'Fehler-Anleitungen', blog: 'Blog', pricing: 'Preise', open: 'Viewer öffnen',
    nextTitle: 'Nächster Schritt', nextLead: 'Kostenlos, im Browser. Es wird nichts hochgeladen.',
    steps: [['Beispielmodell öffnen', 'Health Score und fehlgeschlagene Regeln an einem echten IFC – in unter einer Minute.'], ['Kostenloses Konto anlegen', 'Prüfungen speichern und den Bericht mit Team oder Auftraggeber teilen.'], ['Pläne vergleichen', 'Pro, Team und Modellannahme für alle, die Lieferungen prüfen.']] },
  fr: { menu: 'Menu principal', product: 'Visionneuse', examples: 'Exemples', guides: 'Guides de correction', blog: 'Blog', pricing: 'Tarifs', open: 'Ouvrir la visionneuse',
    nextTitle: 'Étape suivante', nextLead: 'Gratuit, dans votre navigateur. Rien n’est envoyé.',
    steps: [['Ouvrir un modèle d’exemple', 'Voyez le Health Score et les règles en échec sur un vrai IFC en moins d’une minute.'], ['Créer un compte gratuit', 'Conservez vos contrôles et partagez le rapport avec l’équipe ou le maître d’ouvrage.'], ['Comparer les offres', 'Pro, Team et réception des maquettes pour ceux qui reçoivent les livrables.']] },
  pt: { menu: 'Menu principal', product: 'Visualizador', examples: 'Exemplos', guides: 'Guias de correção', blog: 'Blog', pricing: 'Preços', open: 'Abrir o visualizador',
    nextTitle: 'Próximo passo', nextLead: 'Grátis, no seu navegador. Nada é enviado.',
    steps: [['Abrir um modelo de exemplo', 'Veja o Health Score e as regras que falham num IFC real em menos de um minuto.'], ['Criar uma conta gratuita', 'Guarde as verificações e partilhe o relatório com a equipa ou o cliente.'], ['Comparar os planos', 'Pro, Team e receção de modelos para quem recebe as entregas.']] },
  it: { menu: 'Menu principale', product: 'Visualizzatore', examples: 'Esempi', guides: 'Guide alle correzioni', blog: 'Blog', pricing: 'Prezzi', open: 'Apri il visualizzatore',
    nextTitle: 'Prossimo passo', nextLead: 'Gratis, nel browser. Non viene caricato nulla.',
    steps: [['Apri un modello di esempio', 'Guarda l’Health Score e le regole non superate su un IFC reale in meno di un minuto.'], ['Crea un account gratuito', 'Conserva i controlli e condividi il report con il team o il committente.'], ['Confronta i piani', 'Pro, Team e ricezione dei modelli per chi riceve le consegne.']] },
  ca: { menu: 'Menú principal', product: 'Visor', examples: 'Exemples', guides: 'Guies de correcció', blog: 'Blog', pricing: 'Preus', open: 'Obrir el visor',
    nextTitle: 'Següent pas', nextLead: 'Gratuït, al navegador. No es puja res.',
    steps: [['Obre un model d’exemple', 'Mira el Health Score i les regles que fallen en un IFC real en menys d’un minut.'], ['Crea un compte gratuït', 'Desa les comprovacions i comparteix l’informe amb l’equip o el client.'], ['Compara els plans', 'Pro, Team i recepció de models per a qui rep els lliuraments.']] },
  zh: { menu: '主菜单', product: '查看器', examples: '示例', guides: '修复指南', blog: '博客', pricing: '价格', open: '打开查看器',
    nextTitle: '下一步', nextLead: '免费，在浏览器中运行，不上传任何文件。',
    steps: [['打开示例模型', '一分钟内在真实 IFC 上查看健康评分和未通过的规则。'], ['创建免费账户', '保存检查结果，并与团队或业主共享报告。'], ['比较方案', 'Pro、Team，以及面向接收交付方的模型验收。']] },
  ja: { menu: 'メインメニュー', product: 'ビューア', examples: '事例', guides: '修正ガイド', blog: 'ブログ', pricing: '料金', open: 'ビューアを開く',
    nextTitle: '次のステップ', nextLead: '無料・ブラウザ内で動作。ファイルはアップロードされません。',
    steps: [['サンプルモデルを開く', '実際の IFC で Health Score と不合格ルールを 1 分以内に確認できます。'], ['無料アカウントを作成', 'チェック結果を保存し、チームや発注者とレポートを共有できます。'], ['プランを比較', 'Pro、Team、そして納品を受け取る側のためのモデル受入れ。']] },
  th: { menu: 'เมนูหลัก', product: 'ตัวดู', examples: 'ตัวอย่าง', guides: 'คู่มือแก้ไข', blog: 'บล็อก', pricing: 'ราคา', open: 'เปิดตัวดู',
    nextTitle: 'ขั้นตอนถัดไป', nextLead: 'ฟรี ทำงานในเบราว์เซอร์ ไม่มีการอัปโหลดไฟล์',
    steps: [['เปิดโมเดลตัวอย่าง', 'ดู Health Score และกฎที่ไม่ผ่านบน IFC จริงได้ภายในหนึ่งนาที'], ['สร้างบัญชีฟรี', 'เก็บผลการตรวจและแชร์รายงานกับทีมหรือเจ้าของโครงการ'], ['เปรียบเทียบแพ็กเกจ', 'Pro, Team และการรับมอบโมเดลสำหรับฝ่ายที่รับงานส่งมอบ']] },
}

/** Same sample the tool landings embed (generate-tool-landings.mjs). */
export const SAMPLE_MODEL = 'https://raw.githubusercontent.com/youshengCode/IfcSampleFiles/main/Ifc4_SampleHouse.ifc'

const home = (l: Lang) => (l === 'en' ? '/' : `/${l}/`)
const pre = (l: Lang) => (l === 'en' ? '' : `/${l}`)

/** Every link the chrome writes, in reading order. */
export function chromeLinks(l: Lang) {
  const c = COPY[l]
  return {
    nav: [
      { href: home(l), label: c.product },
      { href: `${pre(l)}/${EXAMPLES[l]}/`, label: c.examples },
      { href: `${pre(l)}/fix/`, label: c.guides },
      { href: `${pre(l)}/blog/`, label: c.blog },
      { href: pricingPath(l), label: c.pricing },
    ],
    open: home(l),
    steps: [`${home(l)}?model=${encodeURIComponent(SAMPLE_MODEL)}`, '/sign-up', pricingPath(l)],
  }
}

const esc = (s: string) => s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;')

export const CHROME_CSS = `<style data-landing-chrome>
${TOKEN_CSS}
.lc-theme{display:inline-flex;align-items:center;justify-content:center;width:40px;height:40px;border:1px solid ${TOKENS.line};border-radius:8px;background:transparent;color:${TOKENS.text2};cursor:pointer}
.lc-theme:hover{color:${TOKENS.text}}
.lc-theme:focus-visible{outline:2px solid ${TOKENS.accentText};outline-offset:2px}
.lc-top{position:sticky;top:0;z-index:50;background:${TOKENS.canvas};border-bottom:1px solid ${TOKENS.line}}
.lc-top .lc-in{max-width:1120px;margin:0 auto;padding:0 16px;min-height:60px;display:flex;align-items:center;gap:20px}
.lc-logo{color:${TOKENS.text};font-weight:650;font-size:15px;text-decoration:none;margin-right:auto;white-space:nowrap}
.lc-nav{display:flex;gap:18px;flex-wrap:wrap}
.lc-nav a{color:${TOKENS.text2};font-size:14px;text-decoration:none}
.lc-nav a:hover{color:${TOKENS.text}}
.lc-btn{display:inline-flex;align-items:center;min-height:40px;padding:0 16px;border-radius:8px;background:${TOKENS.accent};color:${TOKENS.onAccent};font-size:14px;font-weight:600;text-decoration:none;white-space:nowrap}
.lc-btn:hover{filter:brightness(1.1)}
.lc-top a:focus-visible,.lc-next a:focus-visible{outline:2px solid ${TOKENS.accentText};outline-offset:2px;border-radius:4px}
@media (max-width:820px){.lc-nav{display:none}.lc-top .lc-in{gap:12px}}
.lc-next{border-top:1px solid ${TOKENS.line};background:${TOKENS.canvas};padding:56px 16px}
.lc-next .lc-in{max-width:1120px;margin:0 auto}
.lc-next h2{color:${TOKENS.text};font-size:24px;line-height:1.25;margin:0 0 6px}
.lc-next .lc-lead{color:${TOKENS.text2};font-size:15px;margin:0 0 24px}
.lc-next ol{list-style:none;margin:0;padding:0;display:grid;grid-template-columns:repeat(auto-fit,minmax(240px,1fr));gap:12px}
.lc-next li a{display:block;height:100%;box-sizing:border-box;padding:18px;border:1px solid ${TOKENS.line};border-radius:10px;background:${TOKENS.panel};text-decoration:none}
.lc-next li a:hover{border-color:${TOKENS.text2}}
.lc-next .lc-n{color:${TOKENS.accentText};font-size:13px;font-weight:600}
.lc-next strong{display:block;color:${TOKENS.text};font-size:16px;margin:6px 0 4px}
.lc-next li span:last-child{color:${TOKENS.text2};font-size:14px;line-height:1.5}
/* First screen: a page, not a template. Left-aligned like /pricing/, no glow or dot field,
   and the pill above the h1 becomes a plain line of facts. */
section.hero{text-align:left!important;background:none!important}
section.hero::before,section.hero .hero-bg{display:none!important}
section.hero .container>*{margin-left:0!important;margin-right:auto!important}
section.hero p:not(.badge),section.hero .hero-desc{max-width:640px}
section.hero [class*="cta"],section.hero [class*="actions"],section.hero [class*="buttons"]{justify-content:flex-start!important;align-items:flex-start!important}
section.hero .badge,section.hero .hero-badge,section.hero .notice-badge{display:block!important;background:none!important;border:0!important;border-radius:0!important;padding:0!important;color:${TOKENS.text2}!important;font-size:14px!important;font-weight:500!important}
section.hero .badge svg,section.hero .hero-badge svg,section.hero .notice-badge svg{display:none}
footer a,footer p,footer span,footer li{color:${TOKENS.text3}!important}
footer a:hover{color:${TOKENS.text}!important}
</style>`

const themeLabel = (l: Lang) => PRICING_COPY[l].nav.theme

/** Before first paint: the remembered theme, so a light visitor never sees a dark flash. */
export const THEME_HEAD = `<script data-landing-chrome>try{var t=localStorage.getItem('lp-theme');if(t==='light'||t==='dark')document.documentElement.dataset.theme=t}catch(e){}</script>`
/** The switch in the header (same key as /pricing/). */
export const THEME_SWITCH = `<script data-landing-chrome>document.querySelectorAll('[data-lc-theme]').forEach(function(b){b.addEventListener('click',function(){var cur=document.documentElement.dataset.theme||(matchMedia('(prefers-color-scheme: light)').matches?'light':'dark');var next=cur==='light'?'dark':'light';document.documentElement.dataset.theme=next;try{localStorage.setItem('lp-theme',next)}catch(e){}})})</script>`

export function renderHeader(l: Lang): string {
  const c = COPY[l], k = chromeLinks(l)
  return `<header class="lc-top" data-landing-chrome>
    <div class="lc-in">
      <a href="${home(l)}" class="lc-logo">IFC Viewer Online</a>
      <nav class="lc-nav" aria-label="${esc(c.menu)}">
        ${k.nav.map((n) => `<a href="${n.href}">${esc(n.label)}</a>`).join('\n        ')}
      </nav>
      <button type="button" class="lc-theme" data-lc-theme aria-label="${esc(themeLabel(l))}" title="${esc(themeLabel(l))}"><svg viewBox="0 0 16 16" width="16" height="16" aria-hidden="true"><circle cx="8" cy="8" r="6.25" fill="none" stroke="currentColor" stroke-width="1.5"/><path d="M8 1.75a6.25 6.25 0 0 1 0 12.5z" fill="currentColor"/></svg></button>
      <a href="${k.open}" class="lc-btn">${esc(c.open)}</a>
    </div>
  </header>`
}

export function renderNextStep(l: Lang): string {
  const c = COPY[l], k = chromeLinks(l)
  return `<section class="lc-next" data-landing-chrome aria-labelledby="lc-next-h">
    <div class="lc-in">
      <h2 id="lc-next-h">${esc(c.nextTitle)}</h2>
      <p class="lc-lead">${esc(c.nextLead)}</p>
      <ol>
        ${c.steps.map(([t, d], i) => `<li><a href="${k.steps[i]}"><span class="lc-n">${i + 1}</span><strong>${esc(t)}</strong><span>${esc(d)}</span></a></li>`).join('\n        ')}
      </ol>
    </div>
  </section>`
}

/** Raise every font-size below the minimum inside the page's own <style> blocks. */
export function raiseSmallFonts(css: string): string {
  return css.replace(/font-size:\s*([\d.]+)(px|rem|em)\b/g, (m, n: string, u: string) => {
    if (u === 'em') return m
    const px = u === 'rem' ? +n * 16 : +n
    return px < MIN_FONT_PX ? `font-size: ${MIN_FONT_PX}px` : m
  }).replace(/(font:\s*(?:\d{3}\s+)?)([\d.]+)px/g, (m, a: string, n: string) => (+n < MIN_FONT_PX ? `${a}${MIN_FONT_PX}px` : m))
}

/** Selectors whose text is painted with a gradient (background-clip: text). */
export function gradientTextSelectors(css: string): string[] {
  const out: string[] = []
  for (const m of css.matchAll(/([^{}]+)\{([^}]*)\}/g)) {
    if (/background-clip:\s*text/.test(m[2])) out.push(m[1].trim())
  }
  return out
}

export function langOf(html: string): Lang {
  const l = /<html[^>]*\blang="([a-z]{2})/i.exec(html)?.[1]?.toLowerCase()
  return (LANGS as readonly string[]).includes(l ?? '') ? (l as Lang) : 'en'
}

const MOJIBAKE: [string, string][] = [['â†’', '→'], ['â€”', '—'], ['â€“', '–'], ['â€™', '’'], ['â€œ', '“'], ['â€\u009d', '”'], ['âœ“', '✓'], ['Â·', '·'], ['â€¦', '…']]

export function applyChrome(input: string): string {
  let html = input
  for (const [bad, good] of MOJIBAKE) html = html.split(bad).join(good)
  const l = langOf(html)
  // 1. header
  html = html.replace(/<header\b[^>]*>[\s\S]*?<\/header>/, renderHeader(l))
  // 2. next step (replace an earlier copy, then insert before the footer)
  html = html.replace(/\s*<section class="lc-next"[\s\S]*?<\/section>/, '')
  html = html.replace(/(\s*)<footer\b/, `\n  ${renderNextStep(l)}$1<footer`)
  // 3. page CSS: minimum size + no gradient text
  html = html.replace(/<style(?![^>]*data-landing-chrome)([^>]*)>([\s\S]*?)<\/style>/g, (_m, attrs: string, css: string) => `<style${attrs}>${tokenizeCss(raiseSmallFonts(css))}</style>`)
  // 4. colours outside <style>: style="" and SVG paint attributes → tokens
  html = html.replace(/(\sstyle=")([^"]*)"/g, (_m, a: string, d: string) => `${a}${tokenizeDecls(d)}"`)
  html = html.replace(/<(circle|path|rect|text|line|polyline|polygon|ellipse|stop)\b([^>]*)>/g, (m, tag: string, attrs: string) => {
    const paint: string[] = []
    const rest = attrs.replace(/\s(fill|stroke|stop-color)="((?:#|rgba?\()[^"]*)"/g, (_a, prop: string, val: string) => { paint.push(`${prop}:${val}`); return '' })
    if (!paint.length || /\sstyle="/.test(rest)) return m
    const end = rest.endsWith('/') ? '/' : ''
    return `<${tag}${end ? rest.slice(0, -1) : rest} style="${tokenizeDecls(paint.join(';'))}"${end}>`
  })
  const grad = [...html.matchAll(/<style(?![^>]*data-landing-chrome)[^>]*>([\s\S]*?)<\/style>/g)].flatMap((m) => gradientTextSelectors(m[1]))
  const flat = grad.length ? `\n${grad.join(',')}{background:none!important;-webkit-text-fill-color:currentColor!important;color:${TOKENS.accentText}!important}` : ''
  const css = CHROME_CSS.replace('</style>', `${flat}\n</style>`)
  html = html.replace(/\s*<style data-landing-chrome>[\s\S]*?<\/style>/, '')
  html = html.replace(/\s*<script data-landing-chrome>[\s\S]*?<\/script>/g, '')
  html = html.replace(/\s*<\/head>/, `\n  ${THEME_HEAD}\n  ${css}\n</head>`)
  html = html.replace(/(\s*)<\/body>/, `\n${THEME_SWITCH}$1</body>`)
  return html
}

// ── which files are landings ───────────────────────────────────────────────
const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '../..')
const PUBLIC = join(ROOT, 'public')
const SKIP_TOP = new Set(['blog', 'fix', 'sdk', 'pricing', 'embed', 'models', 'models-frag', 'demos', 'samples', 'seo', 'img', 'fonts', 'brand', 'mascot', 'geo', 'scenes', 'schemas', 'demo-thumbs', 't', 'track', 'ebook', 'msp-global', 'tracking-globe', 'twin-builder', 'sketch'])

/** Static acquisition landings: public/<slug>/index.html and public/<lang>/<slug>/index.html with the landing header. */
export function landingFiles(): string[] {
  const out: string[] = []
  const visit = (dir: string, depth: number) => {
    for (const name of readdirSync(dir)) {
      const p = join(dir, name)
      if (!statSync(p).isDirectory()) continue
      const rel = relative(PUBLIC, p).split('\\').join('/')
      const top = rel.split('/')[0]
      if (depth === 0 && SKIP_TOP.has(top)) continue
      if (depth === 1 && SKIP_TOP.has(name)) continue
      const f = join(p, 'index.html')
      if (existsSync(f) && (depth === 1 || !(LANGS as readonly string[]).includes(name))) {
        const h = readFileSync(f, 'utf8')
        if (/class="(nav-cta|lc-btn)"/.test(h) && /<footer\b/.test(h)) out.push(f)
      }
      if (depth === 0 && (LANGS as readonly string[]).includes(name)) visit(p, 1)
    }
  }
  visit(PUBLIC, 0)
  return out.sort()
}

/** public/seo/dot-grid.js injects extra CSS on every landing: same rules, inside injectStyles(). */
export const DOT_GRID = join(PUBLIC, 'seo', 'dot-grid.js')
export function applyDotGrid(js: string): string {
  const a = js.indexOf('function injectStyles()'), b = js.indexOf("document.createElement('style')", a)
  if (a < 0 || b < 0) throw new Error('dot-grid.js: injectStyles() not found')
  return js.slice(0, a) + tokenizeCss(raiseSmallFonts(js.slice(a, b))) + js.slice(b)
}

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  const dg = readFileSync(DOT_GRID, 'utf8'), dgOut = applyDotGrid(dg)
  if (dgOut !== dg) writeFileSync(DOT_GRID, dgOut)
  let n = 0
  for (const f of landingFiles()) {
    const before = readFileSync(f, 'utf8')
    const after = applyChrome(before)
    if (after !== before) { writeFileSync(f, after); n++ }
  }
  console.log(`landing-chrome: ${n} of ${landingFiles().length} landings updated`)
}
