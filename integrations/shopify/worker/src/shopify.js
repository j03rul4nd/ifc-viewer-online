// Shopify primitives for the billing Worker (D-327). Pure functions over WebCrypto
// and fetch, so they run the same in the Worker and in vitest (Node 18+).

const enc = new TextEncoder()

export const PLANS = ['free', 'starter', 'business']
export const SHOP_RE = /^[a-z0-9][a-z0-9-]{0,60}\.myshopify\.com$/
/** Webhook bodies above this are refused before any crypto (Shopify's are a few KB). */
export const MAX_BODY = 64 * 1024

export function isShop(shop) {
  return typeof shop === 'string' && SHOP_RE.test(shop)
}

async function hmacKey(secret) {
  return crypto.subtle.importKey('raw', enc.encode(secret), { name: 'HMAC', hash: 'SHA-256' }, false, ['sign'])
}

async function hmacBytes(secret, data) {
  return new Uint8Array(await crypto.subtle.sign('HMAC', await hmacKey(secret), typeof data === 'string' ? enc.encode(data) : data))
}

const toHex = (b) => [...b].map((x) => x.toString(16).padStart(2, '0')).join('')
const toB64 = (b) => btoa(String.fromCharCode(...b))
const b64urlToBytes = (s) => Uint8Array.from(atob(String(s).replace(/-/g, '+').replace(/_/g, '/')), (c) => c.charCodeAt(0))
const toB64url = (b) => toB64(b).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '')

/** Constant-time string compare (same length required). */
export function safeEqual(a, b) {
  a = String(a ?? '')
  b = String(b ?? '')
  if (a.length !== b.length || !a.length) return false
  let d = 0
  for (let i = 0; i < a.length; i++) d |= a.charCodeAt(i) ^ b.charCodeAt(i)
  return d === 0
}

/** Webhook HMAC: base64 HMAC-SHA256 of the raw body, in X-Shopify-Hmac-Sha256. */
export async function verifyWebhook(rawBody, header, secret) {
  if (!header || !secret) return false
  return safeEqual(toB64(await hmacBytes(secret, rawBody)), header)
}

/** The base64 signature Shopify would send for a body (tests, local replay). */
export async function signWebhook(rawBody, secret) {
  return toB64(await hmacBytes(secret, rawBody))
}

/** Admin launch / OAuth callback query HMAC: hex HMAC of the sorted params without `hmac`. */
export async function verifyQuery(searchParams, secret) {
  const hmac = searchParams.get('hmac')
  if (!hmac || !secret) return false
  const msg = [...searchParams.entries()]
    .filter(([k]) => k !== 'hmac' && k !== 'signature')
    .sort(([a], [b]) => (a < b ? -1 : a > b ? 1 : 0))
    .map(([k, v]) => `${k}=${v}`)
    .join('&')
  return safeEqual(toHex(await hmacBytes(secret, msg)), hmac)
}

export async function signQuery(params, secret) {
  const msg = Object.keys(params).sort().map((k) => `${k}=${params[k]}`).join('&')
  return toHex(await hmacBytes(secret, msg))
}

/**
 * App Bridge ID token (session token): HS256 JWT signed with the app secret.
 * Returns the shop domain it is for, or null. Checks signature, aud, exp/nbf
 * (5 s leeway) and that iss and dest are the same shop.
 */
export async function verifyIdToken(token, { apiKey, secret, now = Date.now() }) {
  try {
    const [h, p, s] = String(token || '').split('.')
    if (!h || !p || !s || !apiKey || !secret) return null
    const header = JSON.parse(new TextDecoder().decode(b64urlToBytes(h)))
    if (header.alg !== 'HS256') return null
    if (!safeEqual(toB64url(await hmacBytes(secret, `${h}.${p}`)), s)) return null
    const c = JSON.parse(new TextDecoder().decode(b64urlToBytes(p)))
    const t = now / 1000
    if (c.aud !== apiKey || !(c.exp > t - 5) || !(c.nbf <= t + 5)) return null
    const shop = new URL(c.dest).hostname
    if (!isShop(shop) || new URL(c.iss).hostname !== shop) return null
    return shop
  } catch {
    return null
  }
}

export async function signIdToken(claims, secret) {
  const h = toB64url(enc.encode(JSON.stringify({ alg: 'HS256', typ: 'JWT' })))
  const p = toB64url(enc.encode(JSON.stringify(claims)))
  return `${h}.${p}.${toB64url(await hmacBytes(secret, `${h}.${p}`))}`
}

/**
 * Plan from the app's active subscriptions (Admin `currentAppInstallation.activeSubscriptions`,
 * which also lists Shopify App Pricing subscriptions). Matched on the plan name set in the
 * Partner Dashboard; the highest active (or in trial: also ACTIVE) plan wins; anything else is free.
 */
export function planFromSubscriptions(subs) {
  let best = 'free'
  for (const s of subs || []) {
    if (!s || String(s.status).toUpperCase() !== 'ACTIVE') continue
    const n = String(s.name || '').toLowerCase()
    const p = n.includes('business') ? 'business' : n.includes('starter') ? 'starter' : 'free'
    if (PLANS.indexOf(p) > PLANS.indexOf(best)) best = p
  }
  return best
}

/** Plan from a welcome-link `plan_handle` (a hint only: the subscription query decides). */
export function planFromHandle(handle) {
  const h = String(handle || '').toLowerCase()
  return h.includes('business') ? 'business' : h.includes('starter') ? 'starter' : 'free'
}

export const PLAN_QUERY = `query IfcvoPlan { currentAppInstallation { id activeSubscriptions { name status } } }`

export const SET_PLAN_MUTATION = `mutation IfcvoSetPlan($metafields: [MetafieldsSetInput!]!) { metafieldsSet(metafields: $metafields) { metafields { id } userErrors { field message } } }`

/** metafieldsSet body: app-data metafield `ifcvo.plan` on the app installation (read in Liquid as app.metafields.ifcvo.plan). */
export function setPlanBody(installationId, plan) {
  if (!PLANS.includes(plan)) throw new Error(`unknown plan ${plan}`)
  return {
    query: SET_PLAN_MUTATION,
    variables: { metafields: [{ ownerId: installationId, namespace: 'ifcvo', key: 'plan', type: 'single_line_text_field', value: plan }] },
  }
}

export async function adminGraphql(shop, token, body, { version, fetchImpl = fetch }) {
  const r = await fetchImpl(`https://${shop}/admin/api/${version}/graphql.json`, {
    method: 'POST',
    headers: { 'content-type': 'application/json', 'x-shopify-access-token': token },
    body: JSON.stringify(body),
  })
  if (!r.ok) throw new Error(`admin ${r.status}`)
  const j = await r.json()
  if (j.errors) throw new Error('admin graphql error')
  return j.data
}

/** POST /admin/oauth/access_token with a form body. */
async function tokenRequest(shop, form, fetchImpl) {
  const r = await fetchImpl(`https://${shop}/admin/oauth/access_token`, {
    method: 'POST',
    headers: { 'content-type': 'application/x-www-form-urlencoded', accept: 'application/json' },
    body: new URLSearchParams(form).toString(),
  })
  if (!r.ok) throw new Error(`token ${r.status}`)
  return r.json()
}

/** Token exchange: ID token → online token (interactive) or expiring offline token (+ refresh token). */
export function exchangeToken(shop, idToken, { apiKey, secret, online = false, fetchImpl = fetch }) {
  const form = {
    client_id: apiKey,
    client_secret: secret,
    grant_type: 'urn:ietf:params:oauth:grant-type:token-exchange',
    subject_token: idToken,
    subject_token_type: 'urn:ietf:params:oauth:token-type:id_token',
    requested_token_type: online ? 'urn:shopify:params:oauth:token-type:online-access-token' : 'urn:shopify:params:oauth:token-type:offline-access-token',
  }
  if (!online) form.expiring = '1'
  return tokenRequest(shop, form, fetchImpl)
}

/** Expiring offline token refresh (rotates the refresh token: store the new one). */
export function refreshToken(shop, refresh, { apiKey, secret, fetchImpl = fetch }) {
  return tokenRequest(shop, { client_id: apiKey, client_secret: secret, grant_type: 'refresh_token', refresh_token: refresh }, fetchImpl)
}

/** Shopify-hosted plan selection page (App Pricing). The store handle is the myshopify subdomain. */
export function plansUrl(shop, appHandle) {
  return `https://admin.shopify.com/store/${shop.replace(/\.myshopify\.com$/, '')}/charges/${appHandle}/pricing_plans`
}
