// Static server for the capture harness, with CORS (and Private Network Access) so the
// live viewer iframe can read IFC files that only exist on this machine.
//   node serve.mjs <rootDir> [extraModelsDir] [cert.pem key.pem]
//   → http://127.0.0.1:8732/ (pages) and, with a cert, https://127.0.0.1:8733/local-models/
//   (the viewer block only accepts https:// model URLs; shoot.mjs ignores the self-signed cert).
import { createServer } from 'node:http'
import { createServer as createTls } from 'node:https'
import { createReadStream, readFileSync, statSync } from 'node:fs'
import { extname, join, resolve } from 'node:path'

const args = process.argv.slice(2)
const root = resolve(args[0] || '.')
const models = args[1] ? resolve(args[1]) : ''
const TYPES = { '.html': 'text/html', '.js': 'text/javascript', '.mjs': 'text/javascript', '.css': 'text/css', '.json': 'application/json', '.png': 'image/png', '.svg': 'image/svg+xml', '.ifc': 'application/octet-stream' }
const handler = (req, res) => {
  res.setHeader('Access-Control-Allow-Origin', '*')
  res.setHeader('Access-Control-Allow-Private-Network', 'true')
  res.setHeader('Access-Control-Allow-Headers', '*')
  res.setHeader('Access-Control-Expose-Headers', 'Content-Length')
  if (req.method === 'OPTIONS') { res.writeHead(204); return res.end() }
  const url = decodeURIComponent(new URL(req.url, 'http://x').pathname)
  const local = url.startsWith('/local-models/') && models
  const base = local ? models : root
  const rel = local ? url.slice('/local-models/'.length) : url.slice(1)
  const file = resolve(join(base, rel || 'index.html'))
  if (!file.startsWith(base)) { res.writeHead(403); return res.end() }
  try {
    const st = statSync(file)
    if (!st.isFile()) throw new Error('dir')
    res.writeHead(200, { 'Content-Type': TYPES[extname(file)] || 'application/octet-stream', 'Content-Length': st.size })
    if (req.method === 'HEAD') return res.end()
    createReadStream(file).pipe(res)
  } catch { res.writeHead(404); res.end('not found') }
}
createServer(handler).listen(8732, '127.0.0.1', () => console.log('serving on 8732'))
if (args[2] && args[3]) createTls({ cert: readFileSync(args[2]), key: readFileSync(args[3]) }, handler).listen(8733, '127.0.0.1', () => console.log('tls on 8733'))
