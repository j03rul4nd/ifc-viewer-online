// Validate an IFC and wait for the result (Node 18+, no dependencies).
// Usage: node validate.mjs Model.ifc [profile]
import { readFile } from 'node:fs/promises'
import { basename } from 'node:path'

const { IFCVO_API_URL: api, IFCVO_API_KEY: key } = process.env
if (!api || !key) throw new Error('Set IFCVO_API_URL and IFCVO_API_KEY')
const [file, profile] = process.argv.slice(2)
const auth = { Authorization: `Bearer ${key}` }

const form = new FormData()
form.append('file', new Blob([await readFile(file)]), basename(file))
if (profile) form.append('profile', profile)

let res = await fetch(`${api}/v1/validations`, { method: 'POST', headers: auth, body: form })
if (!res.ok) throw new Error(`HTTP ${res.status}: ${await res.text()}`)
let v = await res.json()

while (v.status === 'queued' || v.status === 'running') {
  await new Promise((r) => setTimeout(r, 5000))
  v = await (await fetch(`${api}/v1/validations/${v.id}`, { headers: auth })).json()
}
console.log(`${v.file_name}: ${v.status}, score ${v.score} — ${v.view_url ?? ''}`)
process.exit(v.status === 'passed' ? 0 : 1)
