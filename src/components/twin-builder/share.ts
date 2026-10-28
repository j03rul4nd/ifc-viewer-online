// Saving and sharing a twin's configuration without a server.
//   · localStorage keeps the one being edited in this browser.
//   · a file (.json) moves it between machines.
//   · a link carries it in the URL fragment (#c=…), deflated and base64url'd:
//     the fragment is never sent to any server, ours included.
// Secrets (the ERP Authorization header) are left out of files and links.

export async function encodeConfig(obj: unknown): Promise<string> {
  const bytes = new TextEncoder().encode(JSON.stringify(obj))
  let out: Uint8Array = bytes
  let tag = 'j'
  if (typeof CompressionStream !== 'undefined') {
    const cs = new Response(bytes).body!.pipeThrough(new CompressionStream('deflate-raw'))
    out = new Uint8Array(await new Response(cs).arrayBuffer())
    tag = 'z'
  }
  return tag + toB64Url(out)
}

export async function decodeConfig(s: string): Promise<unknown> {
  const tag = s[0], body = fromB64Url(s.slice(1))
  let bytes = body
  if (tag === 'z') {
    if (typeof DecompressionStream === 'undefined') throw new Error('This browser cannot open compressed links')
    const ds = new Response(body).body!.pipeThrough(new DecompressionStream('deflate-raw'))
    bytes = new Uint8Array(await new Response(ds).arrayBuffer())
  } else if (tag !== 'j') throw new Error('Not a twin link')
  return JSON.parse(new TextDecoder().decode(bytes))
}

function toB64Url(b: Uint8Array): string {
  let s = ''
  for (let i = 0; i < b.length; i += 0x8000) s += String.fromCharCode(...b.subarray(i, i + 0x8000))
  return btoa(s).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '')
}
function fromB64Url(s: string): Uint8Array {
  const b = atob(s.replace(/-/g, '+').replace(/_/g, '/') + '==='.slice((s.length + 3) % 4))
  const out = new Uint8Array(b.length)
  for (let i = 0; i < b.length; i++) out[i] = b.charCodeAt(i)
  return out
}

export function loadLocal<T>(key: string): T | null {
  try { const v = localStorage.getItem(key); return v ? (JSON.parse(v) as T) : null } catch { return null }
}
export function saveLocal(key: string, v: unknown): void {
  try { localStorage.setItem(key, JSON.stringify(v)) } catch { /* private mode or full: the page still works */ }
}

export function download(name: string, text: string, type = 'application/json'): void {
  const url = URL.createObjectURL(new Blob([text], { type }))
  const a = document.createElement('a')
  a.href = url; a.download = name
  document.body.appendChild(a); a.click(); a.remove()
  setTimeout(() => URL.revokeObjectURL(url), 1000)
}

export function readFile(file: File): Promise<string> {
  return file.text()
}
