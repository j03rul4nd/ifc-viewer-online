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

export const LANGS = ['en', 'es', 'de', 'fr', 'pt', 'it', 'ca', 'zh', 'ja', 'th'] as const
export type Lang = (typeof LANGS)[number]
export const MIN_FONT_PX = 13

/** Colour tokens: the dark set of docs/COLOR_SYSTEM.md (the landings are dark pages). */
export const TOKENS = {
  canvas: '#100f0c', panel: '#181714', line: '#34332e',
  text: '#ecebe7', text2: '#b2b1ab', text3: '#94928d', accent: '#0a8481', onAccent: '#ffffff', accentText: '#55cac3',
} as const

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
footer a,footer p,footer span,footer li{color:${TOKENS.text3}!important}
footer a:hover{color:${TOKENS.text}!important}
</style>`

export function renderHeader(l: Lang): string {
  const c = COPY[l], k = chromeLinks(l)
  return `<header class="lc-top" data-landing-chrome>
    <div class="lc-in">
      <a href="${home(l)}" class="lc-logo">IFC Viewer Online</a>
      <nav class="lc-nav" aria-label="${esc(c.menu)}">
        ${k.nav.map((n) => `<a href="${n.href}">${esc(n.label)}</a>`).join('\n        ')}
      </nav>
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
  html = html.replace(/<style(?![^>]*data-landing-chrome)([^>]*)>([\s\S]*?)<\/style>/g, (_m, attrs: string, css: string) => `<style${attrs}>${raiseSmallFonts(css)}</style>`)
  const grad = [...html.matchAll(/<style(?![^>]*data-landing-chrome)[^>]*>([\s\S]*?)<\/style>/g)].flatMap((m) => gradientTextSelectors(m[1]))
  const flat = grad.length ? `\n${grad.join(',')}{background:none!important;-webkit-text-fill-color:currentColor!important;color:${TOKENS.accentText}!important}` : ''
  const css = CHROME_CSS.replace('</style>', `${flat}\n</style>`)
  html = html.replace(/\s*<style data-landing-chrome>[\s\S]*?<\/style>/, '')
  html = html.replace(/<\/head>/, `  ${css}\n</head>`)
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

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  let n = 0
  for (const f of landingFiles()) {
    const before = readFileSync(f, 'utf8')
    const after = applyChrome(before)
    if (after !== before) { writeFileSync(f, after); n++ }
  }
  console.log(`landing-chrome: ${n} of ${landingFiles().length} landings updated`)
}
