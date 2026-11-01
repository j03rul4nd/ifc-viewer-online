// The two models above the 25 MiB asset limit are stored gzipped and sent as-is,
// so the browser inflates them natively under their original URLs.
const GZ = {
  '/models/shanghai-tower/SHA-IVO-SHANGHAI-TOWER-A-0001.ifc': '/gz/shanghai-tower.bin',
  '/models/cras/model.ifc': '/gz/cras.bin',
}
export default {
  async fetch(request, env) {
    const url = new URL(request.url)
    const file = GZ[url.pathname]
    if (!file) return env.ASSETS.fetch(request)
    const asset = await env.ASSETS.fetch(new URL(file, url.origin), { headers: { 'Accept-Encoding': 'identity' } })
    if (!asset.ok) return new Response('Not found', { status: 404 })
    return new Response(request.method === 'HEAD' ? null : asset.body, {
      encodeBody: 'manual',
      headers: {
        'Content-Type': 'application/octet-stream',
        'Content-Encoding': 'gzip',
        'Access-Control-Allow-Origin': '*',
        'Cache-Control': 'public, max-age=86400',
        'X-Content-Type-Options': 'nosniff',
      },
    })
  },
}
