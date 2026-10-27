// ─── indexnow ─────────────────────────────────────────────────────────────────
// Tells Bing (and the other IndexNow engines: Yandex, Seznam, Naver…) which
// URLs are new or changed, instead of waiting for them to recrawl. Bing sends
// as many sessions as Google and converts better (PostHog, 2026-10-26), so new
// landings should reach it the day they ship.
//
// The key is public by design: it is served at /<KEY>.txt so the engines can
// check the submission comes from the site's owner.
//
//   node scripts/seo/indexnow.mjs                 every URL in public/sitemap.xml
//   node scripts/seo/indexnow.mjs --match /ifc-   only URLs containing "/ifc-"
//   node scripts/seo/indexnow.mjs --dry-run       print what would be sent
//
// Run it after the deploy is live — the engines fetch the key file right away.

import { readFileSync } from 'node:fs'
import { dirname, join, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'

const KEY = '3b73d2649cf3dcc146d9d5e0b3021b53'
const HOST = 'www.ifcvieweronline.eu'
const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '../..')

const args = process.argv.slice(2)
const match = args.includes('--match') ? args[args.indexOf('--match') + 1] : null
const dryRun = args.includes('--dry-run')

const sitemap = readFileSync(join(ROOT, 'public/sitemap.xml'), 'utf8')
let urls = [...new Set([...sitemap.matchAll(/<loc>([^<]+)<\/loc>/g)].map((m) => m[1].trim()))]
  .filter((u) => u.startsWith(`https://${HOST}/`))
if (match) urls = urls.filter((u) => u.includes(match))

if (urls.length === 0) { console.error('No URLs to submit.'); process.exit(1) }
console.log(`${urls.length} URLs${match ? ` matching "${match}"` : ''}`)
if (dryRun) { console.log(urls.join('\n')); process.exit(0) }

// The protocol accepts up to 10,000 URLs per request.
for (let i = 0; i < urls.length; i += 10000) {
  const res = await fetch('https://api.indexnow.org/indexnow', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json; charset=utf-8' },
    body: JSON.stringify({ host: HOST, key: KEY, keyLocation: `https://${HOST}/${KEY}.txt`, urlList: urls.slice(i, i + 10000) }),
  })
  // 200 = accepted, 202 = accepted, key validation pending. Anything else is an error.
  console.log(`batch ${i / 10000 + 1}: HTTP ${res.status} ${res.statusText}`)
  if (res.status !== 200 && res.status !== 202) { console.error(await res.text()); process.exitCode = 1 }
}
