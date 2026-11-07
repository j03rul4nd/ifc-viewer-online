// Same-domain proxies to the email-capture Worker (what vercel.json rewrites did).
const WORKER = 'https://ifc-viewer-email-capture.joelbenitezdonari.workers.dev'

export function proxyTo(path) {
  return ({ request }) => {
    const target = WORKER + path + new URL(request.url).search
    const body = request.method === 'GET' || request.method === 'HEAD' ? undefined : request.body
    return fetch(target, { method: request.method, headers: request.headers, body, redirect: 'manual' })
  }
}
