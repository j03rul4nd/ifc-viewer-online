// Minimal receiver that checks the X-Signature header (Node 18+).
// Usage: IFCVO_WEBHOOK_SECRET=whsec_… node verify-webhook.mjs
import { createServer } from 'node:http'
import { createHmac, timingSafeEqual } from 'node:crypto'

const secret = process.env.IFCVO_WEBHOOK_SECRET
if (!secret) throw new Error('Set IFCVO_WEBHOOK_SECRET')

export function verify(rawBody, header, now = Math.floor(Date.now() / 1000)) {
  const parts = Object.fromEntries(String(header).split(',').map((p) => p.split('=')))
  const t = Number(parts.t)
  if (!parts.v1 || !Number.isFinite(t) || Math.abs(now - t) > 300) return false
  const expected = createHmac('sha256', secret).update(`${t}.${rawBody}`).digest()
  const given = Buffer.from(parts.v1, 'hex')
  return given.length === expected.length && timingSafeEqual(given, expected)
}

createServer((req, res) => {
  let raw = ''
  req.on('data', (c) => { raw += c })
  req.on('end', () => {
    if (!verify(raw, req.headers['x-signature'])) { res.writeHead(400).end('bad signature'); return }
    const evt = JSON.parse(raw)
    console.log(evt.event, evt.data?.file_name, evt.data?.score)
    res.writeHead(204).end()
  })
}).listen(8787, () => console.log('listening on :8787'))
