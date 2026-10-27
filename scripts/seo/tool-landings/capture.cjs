// Screenshots of the live app for generate-tool-landings.mjs, one per shot id
// and language: <outDir>/<shot>-<lang>.jpg (1600×1000, real WebGL render).
//   node scripts/seo/tool-landings/capture.cjs <outDir> en,es,… editor-1,class-1,…
// Needs a local Chrome (CHROME_PATH) — headless Chromium has no usable GPU here.
const { chromium } = require('playwright-core')
const [out, langsArg, shotsArg] = process.argv.slice(2)
const BASE = 'https://www.ifcvieweronline.eu/?model=/Ifc2x3_Duplex_Architecture.ifc'
// ?rule= opens the rule's group; bring that group to the top of the issue list.
async function scrollToRule(p) {
  await p.evaluate(() => {
    const list = document.querySelector('[data-bottom-drawer="validation"] .overflow-y-auto')
    // Only the focused group is open: its header is the row followed by a
    // taller one (remediation / issue rows; headers are ~30 px).
    const rows = [...(list?.querySelectorAll('[data-index]') ?? [])].sort((a, b) => +a.dataset.index - +b.dataset.index)
    const open = rows.find((r, i) => rows[i + 1] && r.getBoundingClientRect().height < 40 && rows[i + 1].getBoundingClientRect().height >= 40)
    if (list && open) list.scrollTop += open.getBoundingClientRect().top - list.getBoundingClientRect().top - 8
  })
  await p.waitForTimeout(800)
}

const SHOTS = {
  'editor-1':  { q: '&select=4287' },
  'editor-2':  { q: '&select=6652' },
  'class-1':   { q: '&rule=RULE_MISSING_CLASSIFICATION', after: scrollToRule },
  'class-2':   { q: '&rule=RULE_EMPTY_PROPERTY_VALUE', after: scrollToRule },
  'health-1':  { q: '' },
  'health-2':  { q: '', after: async (p) => { await p.getByRole('button', { name: /^(Export|Exportar|Exporter|Esporta|Exportieren|Exporta|导出|エクスポート|ส่งออก)/ }).first().click(); await p.waitForTimeout(2500) } },
}
;(async () => {
  const b = await chromium.launch({ executablePath: process.env.CHROME_PATH || 'C:/Program Files/Google/Chrome/Application/chrome.exe', headless: true, args: ['--use-angle=d3d11', '--enable-gpu', '--ignore-gpu-blocklist'] })
  for (const lang of langsArg.split(',')) {
    for (const id of shotsArg.split(',')) {
      const s = SHOTS[id]
      const ctx = await b.newContext({ viewport: { width: 1600, height: 1000 }, locale: lang })
      // Skip consent/welcome noise and keep the visitor out of the analytics.
      await ctx.addInitScript((l) => { try { localStorage.setItem('i18nextLng', l); localStorage.setItem('ifc.analytics.optout', '1') } catch {} }, lang)
      const p = await ctx.newPage()
      try {
        await p.goto(`${BASE}&lang=${lang}${s.q}`, { waitUntil: 'domcontentloaded', timeout: 60000 })
        await p.waitForTimeout(22000)
        if (s.after) await s.after(p)
        await p.screenshot({ path: `${out}/${id}-${lang}.jpg`, type: 'jpeg', quality: 84 })
        console.log('ok', id, lang)
      } catch (e) { console.log('FAIL', id, lang, String(e).slice(0, 160)) }
      await ctx.close()
    }
  }
  await b.close()
})()
