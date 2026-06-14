/* coi-serviceworker v0.1.7 — patched: resilient fetch handler */
self.addEventListener("install", () => self.skipWaiting())
self.addEventListener("activate", (e) => e.waitUntil(self.clients.claim()))

function isSameOrigin(url) {
  try { return new URL(url).origin === location.origin }
  catch { return false }
}

function addCoiHeaders(r) {
  if (!r || r.status === 0 || !r.headers) return r
  const h = new Headers(r.headers)
  h.set("Cross-Origin-Opener-Policy",   "same-origin")
  // credentialless (not require-corp): keeps the page cross-origin isolated so
  // SharedArrayBuffer / multithreaded web-ifc still work, but lets cross-origin
  // subresources WITHOUT a CORP header load (fetched without credentials) —
  // e.g. Google Fonts, PostHog, remote demo models. require-corp blocked those
  // (ERR_BLOCKED_BY_RESPONSE.NotSameOriginAfterDefaultedToSameOriginByCoep).
  h.set("Cross-Origin-Embedder-Policy", "credentialless")
  return new Response(r.body, { status: r.status, statusText: r.statusText, headers: h })
}

self.addEventListener("fetch", (e) => {
  if (e.request.cache === "only-if-cached" && e.request.mode !== "same-origin") return
  if (!isSameOrigin(e.request.url)) return

  e.respondWith(
    fetch(e.request)
      .then(addCoiHeaders)
      // If the underlying fetch fails (e.g. network error during SW activation,
      // dev-server restart, or opaque request) let it propagate as a proper
      // network-error response instead of an unhandled rejection, which would
      // otherwise print a confusing "promise was rejected" message in DevTools.
      .catch(() => Response.error())
  )
})
