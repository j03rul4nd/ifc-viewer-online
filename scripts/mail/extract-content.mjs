// Collects every English text of the sample templates and of the Studio, so
// the eight languages without inline text can be translated:
//   node scripts/mail/extract-content.mjs <out.json>
// Writes { "<English>": "<Spanish, for context>" }. Translations go to
// src/components/workspace/sections/mail/editorial/content/<lang>.json.
import { createServer } from 'vite'
import { writeFileSync } from 'node:fs'

const out = process.argv[2]
if (!out) { console.error('usage: extract-content.mjs <out.json>'); process.exit(1) }
const vite = await createServer({ server: { middlewareMode: true }, appType: 'custom', logLevel: 'error', optimizeDeps: { noDiscovery: true, include: [] } })
const dir = '/src/components/workspace/sections/mail/editorial'
const { RECORDER } = await vite.ssrLoadModule(`${dir}/content.ts`)
const T = await vite.ssrLoadModule(`${dir}/templates.ts`)
const S = await vite.ssrLoadModule(`${dir}/Studio.tsx`)
await vite.close()

RECORDER.keys = new Map()
const pub = T.samplePublication('en')
for (const t of T.TEMPLATES_V3) { t.build({ lang: 'en', pub, base: 'https://x' }); T.nameOf(t, 'en'); T.purposeOf(t, 'en') }
const keys = Object.fromEntries(RECORDER.keys)
for (const k of Object.keys(S.UI.en)) keys[S.UI.en[k]] = S.UI.es[k]
for (const v of Object.values(S.BLOCK_NAMES)) keys[v.en] = v.es
writeFileSync(out, JSON.stringify(keys, null, 2) + '\n')
console.log(`${Object.keys(keys).length} keys → ${out}`)
