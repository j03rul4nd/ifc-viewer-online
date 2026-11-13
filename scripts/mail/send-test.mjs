// Sends ONE project-mail template to one inbox through Resend, to see it in a
// real mail client. Never runs on its own; the key and addresses come from the
// environment, nothing is stored.
//   RESEND_API_KEY=re_... MAIL_FROM="Llevant 84 <hello@verified-domain>" MAIL_TO=you@example.com \
//     node scripts/mail/send-test.mjs [templateId=weekly] [lang=es]
import { createServer } from 'vite'

const [id = 'weekly', lang = 'es'] = process.argv.slice(2)
const { RESEND_API_KEY: key, MAIL_FROM: from, MAIL_TO: to } = process.env
if (!key || !from || !to) { console.error('Set RESEND_API_KEY, MAIL_FROM (verified domain) and MAIL_TO.'); process.exit(1) }

const vite = await createServer({ server: { middlewareMode: true }, appType: 'custom', logLevel: 'error', optimizeDeps: { noDiscovery: true, include: [] } })
const { TEMPLATES_V3, samplePublication } = await vite.ssrLoadModule('/src/components/workspace/sections/mail/editorial/templates.ts')
const { renderIssue } = await vite.ssrLoadModule('/src/components/workspace/sections/mail/editorial/render.ts')
await vite.close()

const t = TEMPLATES_V3.find((x) => x.id === id)
if (!t) { console.error(`No template "${id}". Ids: ${TEMPLATES_V3.map((x) => x.id).join(', ')}`); process.exit(1) }
const pub = samplePublication(lang)
// Images must be public https: the sample capture is served by the live site.
const base = 'https://www.ifcvieweronline.eu'
const unsub = `${base}/`
const r = renderIssue(t.build({ lang, pub, base }), pub, { lang, unsubscribeUrl: unsub })

const res = await fetch('https://api.resend.com/emails', {
  method: 'POST',
  headers: { Authorization: `Bearer ${key}`, 'Content-Type': 'application/json' },
  body: JSON.stringify({ from, to: [to], subject: `[test] ${r.subject}`, html: r.html, text: r.text, headers: { 'List-Unsubscribe': `<${unsub}>` } }),
})
console.log(res.status, await res.text())
