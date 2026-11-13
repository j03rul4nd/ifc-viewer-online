// Renders every project-mail template (es + en) to HTML and screenshots it at
// desktop width, 375 px and dark. Local only, no paid testing service.
//   node scripts/mail/capture-templates.mjs [--out docs/email-directions/templates]
// CHROME=<path to chrome.exe> overrides the browser.
import { createServer } from 'vite'
import { mkdirSync, writeFileSync, existsSync, readdirSync } from 'node:fs'
import { join, resolve } from 'node:path'
import { pathToFileURL } from 'node:url'
import { createRequire } from 'node:module'

const root = resolve(process.cwd())
const out = resolve(process.argv.includes('--out') ? process.argv[process.argv.indexOf('--out') + 1] : 'docs/email-directions/templates')
mkdirSync(out, { recursive: true })

const vite = await createServer({ root, server: { middlewareMode: true }, appType: 'custom', logLevel: 'error', optimizeDeps: { noDiscovery: true, include: [] } })
const { TEMPLATES_V3, samplePublication } = await vite.ssrLoadModule('/src/components/workspace/sections/mail/editorial/templates.ts')
const { renderIssue } = await vite.ssrLoadModule('/src/components/workspace/sections/mail/editorial/render.ts')
await vite.close()

// Images resolve against public/ so the files open locally.
const base = pathToFileURL(join(root, 'public')).href
const files = []
for (const t of TEMPLATES_V3) for (const lang of ['es', 'en']) {
  const pub = samplePublication(lang)
  const r = renderIssue(t.build({ lang, pub, base }), pub, { lang, unsubscribeUrl: 'https://www.ifcvieweronline.eu/u/preview' })
  const f = join(out, `${String(TEMPLATES_V3.indexOf(t) + 1).padStart(2, '0')}-${t.id}-${lang}`)
  writeFileSync(`${f}.html`, r.html); writeFileSync(`${f}.txt`, `Subject: ${r.subject}\nPreheader: ${r.preheader}\n\n${r.text}`)
  files.push({ f, lang, kb: Buffer.byteLength(r.html) / 1024 })
}

const require = createRequire(join(root, 'package.json'))
const { chromium } = require('playwright-core')
const pw = join(process.env.LOCALAPPDATA ?? '', 'ms-playwright')
const auto = existsSync(pw) ? readdirSync(pw).filter((d) => /^chromium-\d+$/.test(d)).sort().reverse().map((d) => join(pw, d, 'chrome-win64', 'chrome.exe')).find(existsSync) : undefined
const browser = await chromium.launch(process.env.CHROME || auto ? { executablePath: process.env.CHROME || auto } : {})
for (const { f, lang, kb } of files) {
  const shots = lang === 'es' ? [['desktop', 720, 'light', 1], ['mobile', 375, 'light', 2], ['dark', 720, 'dark', 1]] : [['desktop', 720, 'light', 1]]
  for (const [tag, w, scheme, dpr] of shots) {
    const ctx = await browser.newContext({ viewport: { width: w, height: 900 }, colorScheme: scheme, deviceScaleFactor: dpr })
    const page = await ctx.newPage()
    await page.goto(pathToFileURL(`${f}.html`).href)
    const overflow = await page.evaluate(() => document.documentElement.scrollWidth - window.innerWidth)
    if (overflow > 0) console.warn(`  ! ${f} ${tag}: ${overflow}px horizontal overflow`)
    await page.screenshot({ path: `${f}-${tag}.png`, fullPage: true })
    await ctx.close()
  }
  console.log(`${f.split(/[\\/]/).pop()}  ${kb.toFixed(1)} KB`)
}
await browser.close()
