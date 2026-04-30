/* coi-serviceworker v0.1.7 */
self.addEventListener("install", () => self.skipWaiting())
self.addEventListener("activate", (e) => e.waitUntil(self.clients.claim()))

function isSameOrigin(url) {
  try { return new URL(url).origin === location.origin }
  catch { return false }
}

self.addEventListener("fetch", (e) => {
  if (e.request.cache === "only-if-cached" && e.request.mode !== "same-origin") return
  if (!isSameOrigin(e.request.url)) return
  e.respondWith(
    fetch(e.request).then((r) => {
      if (!r || r.status === 0 || !r.headers) return r
      const newHeaders = new Headers(r.headers)
      newHeaders.set("Cross-Origin-Opener-Policy",   "same-origin")
      newHeaders.set("Cross-Origin-Embedder-Policy", "require-corp")
      return new Response(r.body, {
        status:     r.status,
        statusText: r.statusText,
        headers:    newHeaders,
      })
    })
  )
})