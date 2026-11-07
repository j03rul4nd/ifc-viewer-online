/**
 * IFC Viewer — Cloudflare Worker (email capture + crawlable report SSR)
 *
 * Two stateless endpoints. No database, no stored model data.
 *
 *   POST /subscribe       → proxy subscriber signups to the Resend Audiences API.
 *                           RESEND_API_KEY is a Worker Secret — never exposed.
 *   GET  /r?d=<payload>   → server-render a shared validation report as crawlable
 *   GET  /report?d=...      HTML (title + OG/Twitter meta + JSON-LD + issue list +
 *                           "how to fix" prose). This is the *compounding* asset:
 *                           a backlink + viral invite that crawlers can actually read
 *                           (a hash fragment cannot leave the browser — see D-21).
 *
 * The full report is encoded in the URL (base64url JSON). Stateless = the IFC
 * never reaches the server; only the Health Score + condensed issue list travel
 * in the link the sender chose to share.
 *
 * Deploy:
 *   1. npm install -g wrangler
 *   2. wrangler secret put RESEND_API_KEY
 *   3. wrangler secret put RESEND_AUDIENCE_ID
 *   4. wrangler deploy
 *
 * Free tier limits (2026): CF Workers 100,000 req/day · Resend 3,000 emails/month.
 */

const ALLOWED_ORIGINS = [
  'https://www.ifcvieweronline.eu',
  'https://ifcvieweronline.eu',
  'http://localhost:5173',
  'http://localhost:4173',
  'http://localhost:3000',
]

// Where the SPA lives. Override with the APP_URL var in wrangler.toml.
const DEFAULT_APP_URL   = 'https://www.ifcvieweronline.eu/'
const DEFAULT_OG_IMAGE  = 'https://www.ifcvieweronline.eu/og-image.png'

// ── Public origin vs Worker origin ────────────────────────────────────────────
//
// The badge and the shared reports are the site's two link-earning assets: a
// badge pasted in someone's README, and a report a client forwards. Served from
// *.workers.dev they built authority for a shared Cloudflare subdomain that
// search engines discount as user-generated, so the whole mechanism earned the
// main domain nothing.
//
// They are now proxied by Vercel from the real domain (see the rewrites in
// vercel.json). Two consequences the Worker has to handle:
//
//  1. Vercel proxies to the INTERNAL paths /_r and /_badge. The public /r,
//     /report and /badge paths 301 to the real domain instead of serving —
//     that reclaims the authority of links already out in the wild. Serving
//     both from /r would make Vercel→Worker→Vercel loop forever.
//
//  2. Behind the proxy, `new URL(request.url).origin` is the workers.dev origin,
//     so a report's canonical and og:url would still advertise workers.dev. Use
//     publicOrigin() for anything that ends up in markup.
//
// /bench needs neither: it is a JSON API nobody links to, so it is proxied
// straight through with no redirect and no loop.
function publicOrigin(env) {
  try {
    return new URL(env.PUBLIC_ORIGIN || env.APP_URL || DEFAULT_APP_URL).origin
  } catch {
    return new URL(DEFAULT_APP_URL).origin
  }
}

/** 301 to the same resource on the public domain, query string preserved. */
function redirectToPublic(env, publicPath, search) {
  return new Response(null, {
    status: 301,
    headers: {
      Location:        `${publicOrigin(env)}${publicPath}${search || ''}`,
      'Cache-Control': 'public, max-age=86400',
    },
  })
}

// Shared reports are point-in-time snapshots — expire links after this many days.
// Advisory only: the payload is stateless, so a forged `ts` can bypass it; real
// links carry their true creation time. Override with REPORT_MAX_AGE_DAYS.
const DEFAULT_REPORT_MAX_AGE_DAYS = 90
const DAY_MS = 86_400_000

// Hard cap on the encoded `d` param. The frontend keeps links well under this
// (top-50 issues + field slicing); anything larger is junk/abuse — reject before
// spending CPU on atob/JSON.parse. ~64 KB of base64 ≈ 48 KB of JSON.
const MAX_PAYLOAD_CHARS = 64_000

// ── Email validation ────────────────────────────────────────────────────────

/**
 * Validate email format — deliberately simple (RFC 5322 is overkill here).
 * Resend rejects malformed addresses at the API level anyway.
 */
function isValidEmail(email) {
  return typeof email === 'string'
    && email.length > 5
    && email.length < 254
    && /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)
}

/**
 * Build CORS headers — only allow known origins. Null if origin not allowed.
 */
function corsHeaders(origin) {
  if (!ALLOWED_ORIGINS.includes(origin)) return null
  return {
    'Access-Control-Allow-Origin':  origin,
    'Access-Control-Allow-Methods': 'GET, POST, PATCH, OPTIONS',
    'Access-Control-Allow-Headers': 'Content-Type, Authorization',
    'Access-Control-Max-Age':       '86400',
  }
}

function jsonResponse(data, status = 200, extraHeaders = {}) {
  return new Response(JSON.stringify(data), {
    status,
    headers: { 'Content-Type': 'application/json', ...extraHeaders },
  })
}

// ── Rate limiting ─────────────────────────────────────────────────────────────

/** Trusted client IP (Cloudflare sets CF-Connecting-IP at the edge). */
function clientIp(request) {
  const cf = request.headers.get('CF-Connecting-IP')
  if (cf) return cf
  // X-Forwarded-For may be a "client, proxy1, proxy2" list — take the client.
  const xff = request.headers.get('X-Forwarded-For')
  if (xff) return xff.split(',')[0].trim() || 'anon'
  return 'anon'
}

/**
 * Cloudflare Workers Rate Limiting API. Returns true (allow) when the limiter is
 * unbound (local dev / not configured) or errors — fail-open, so the free tool
 * never blocks legitimate users on an infra hiccup. The limiter caps abuse
 * (e.g. spamming /subscribe into the Resend quota) per IP per window.
 */
async function underLimit(limiter, key) {
  if (!limiter || typeof limiter.limit !== 'function') return true
  try {
    const { success } = await limiter.limit({ key })
    return success !== false
  } catch (err) {
    console.warn('[worker] rate limiter error (fail-open):', err)
    return true
  }
}

// ── Subscribe handler ─────────────────────────────────────────────────────────

async function handleSubscribe(request, env, cors) {
  // Strict per-IP limit — this endpoint spends the Resend audience quota.
  if (!(await underLimit(env.SUBSCRIBE_LIMITER, clientIp(request)))) {
    return jsonResponse(
      { ok: false, error: 'Too many requests — please try again in a minute.' },
      429,
      { ...(cors ?? {}), 'Retry-After': '60' },
    )
  }

  let body
  try {
    body = await request.json()
  } catch {
    return jsonResponse({ ok: false, error: 'Invalid JSON body' }, 400, cors ?? {})
  }

  // Body must be a JSON object — `null`, an array or a primitive would otherwise
  // crash the destructuring below.
  if (!body || typeof body !== 'object' || Array.isArray(body)) {
    return jsonResponse({ ok: false, error: 'Invalid JSON body' }, 400, cors ?? {})
  }

  const { email, source = 'landing', locale = 'en' } = body

  if (!isValidEmail(email)) {
    return jsonResponse({ ok: false, error: 'Invalid email address' }, 422, cors ?? {})
  }

  const audienceId = env.RESEND_AUDIENCE_ID
  const apiKey     = env.RESEND_API_KEY

  if (!apiKey || !audienceId) {
    console.error('[worker] Missing RESEND_API_KEY or RESEND_AUDIENCE_ID secret')
    return jsonResponse({ ok: false, error: 'Service not configured' }, 503, cors ?? {})
  }

  let resendRes
  try {
    resendRes = await fetch(
      `https://api.resend.com/audiences/${audienceId}/contacts`,
      {
        method:  'POST',
        headers: {
          'Authorization': `Bearer ${apiKey}`,
          'Content-Type':  'application/json',
        },
        body: JSON.stringify({
          email,
          unsubscribed: false,
          first_name: '',
          last_name:  '',
          data: { source, locale, signed_up_at: new Date().toISOString() },
        }),
      },
    )
  } catch (err) {
    console.error('[worker] Resend fetch failed:', err)
    return jsonResponse({ ok: false, error: 'Upstream error' }, 502, cors ?? {})
  }

  if (!resendRes.ok) {
    if (resendRes.status === 409) {
      return jsonResponse({ ok: true, already: true }, 200, cors ?? {})
    }
    // Log the status only — the Resend error body can echo the submitted email
    // address, and personal data must not leak into logs (GDPR data minimisation).
    console.error('[worker] Resend error status:', resendRes.status)
    return jsonResponse({ ok: false, error: 'Subscription failed' }, 500, cors ?? {})
  }

  return jsonResponse({ ok: true }, 200, cors ?? {})
}

// ── Report rendering ──────────────────────────────────────────────────────────

/** Escape a string for safe interpolation into HTML text / attributes. */
function esc(value) {
  return String(value ?? '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;')
}

/** Coerce to a finite, non-negative integer (fallback 0). */
function toCount(val) {
  return typeof val === 'number' && Number.isFinite(val) && val >= 0 ? Math.round(val) : 0
}

/**
 * Decode the base64url report payload. The string is fully attacker-controlled
 * (anyone can craft a /r?d=… link), so every field is coerced to a safe value
 * and `issues` is forced to a clean array. Returns null only when nothing usable
 * can be recovered.
 */
function decodeReport(d) {
  if (typeof d !== 'string' || !d || d.length > MAX_PAYLOAD_CHARS) return null
  try {
    // base64url → base64
    let b64 = d.replace(/-/g, '+').replace(/_/g, '/')
    while (b64.length % 4) b64 += '='
    const bin   = atob(b64)
    const bytes = Uint8Array.from(bin, (c) => c.charCodeAt(0))
    const json  = new TextDecoder('utf-8').decode(bytes)
    const data  = JSON.parse(json)
    if (!data || typeof data !== 'object' || typeof data.score !== 'number') return null

    const str = (v) => (typeof v === 'string' ? v : '')
    const issuesRaw = Array.isArray(data.issues) ? data.issues : []
    const issues = issuesRaw.slice(0, 200).map((raw) => {
      const o = raw ?? {}
      const s = str(o.s)
      return {
        r: str(o.r),
        s: s === 'e' || s === 'w' || s === 'i' ? s : 'i',
        n: str(o.n).slice(0, 80),
        c: str(o.c).slice(0, 60),
        m: str(o.m).slice(0, 200),
      }
    })

    return {
      score: Math.max(0, Math.min(100, Math.round(data.score))),
      file:  (str(data.file) || 'model.ifc').slice(0, 120),
      e:     toCount(data.e),
      w:     toCount(data.w),
      i:     toCount(data.i),
      ms:    toCount(data.ms),
      ts:    str(data.ts),
      // Honesty caveats (share-report.ts `u` / `nr`). Coerced like every other
      // count because the payload is attacker-controlled; absent (older links)
      // reads as 0, i.e. "nothing reported", never as a fabricated caveat.
      u:     toCount(data.u),
      nr:    toCount(data.nr),
      issues,
    }
  } catch {
    return null
  }
}

function scoreColor(score) {
  return score >= 80 ? '#22c55e' : score >= 50 ? '#F5A623' : '#ef4444'
}
function scoreLabel(score) {
  if (score >= 90) return 'Excellent'
  if (score >= 80) return 'Good'
  if (score >= 60) return 'Fair'
  if (score >= 40) return 'Poor'
  return 'Critical'
}
function severityColor(s) {
  return s === 'e' ? '#ef4444' : s === 'w' ? '#F5A623' : '#5E9ED6'
}
function severityLabel(s) {
  return s === 'e' ? 'error' : s === 'w' ? 'warning' : 'info'
}
function ruleLabel(ruleId) {
  return ruleId.replace(/^RULE_/, '').replace(/_/g, ' ')
}

/**
 * EN "how to fix" one-liners — MIRRORED from src/i18n/rule-remediation.ts
 * (RULE_REMEDIATION.en[ruleId].summary). The worker can't import the TS corpus,
 * so this is a deliberate, documented mirror for the crawlable boundary.
 * KEEP IN SYNC when rule summaries change. See memory/project_remediation_corpus.md.
 */
const RULE_FIX = {
  RULE_EMPTY_NAME: 'Give the element a meaningful Name so it is identifiable in schedules, the model tree and downstream coordination.',
  RULE_EMPTY_LONGNAME: 'Set the LongName on spaces, storeys and the building — it carries the human-readable room/level name used in schedules and COBie.',
  RULE_DUPLICATE_NAME: 'Make sibling element names unique (or rely on type + instance number) so elements are distinguishable in schedules and coordination.',
  RULE_NAMING_CONVENTION: 'Rename elements to follow the project’s BEP naming pattern (usually defined in the EIR / ISO 19650 information requirements).',
  RULE_DUPLICATE_GUID: 'Every element must have a unique GlobalId. Auto-fix duplicates in the app; to prevent it at the source, fix the export workflow.',
  RULE_INVALID_GUID_FORMAT: 'GlobalId must be a 22-character IFC base-64 string. Auto-fix the format in the app; at the source, avoid post-processing that rewrites GUIDs.',
  RULE_ORPHAN_ELEMENT: 'Place the element inside a spatial container (storey or space) so it appears in the model tree and in downstream tools.',
  RULE_WRONG_CONTAINER: 'Move the element into the correct spatial container — physical building elements belong in a storey (or space), not directly under Site or Project.',
  RULE_BROKEN_AGGREGATE: 'Fix the broken aggregation relationship — this is almost always an export/interop artefact, so re-export from the authoring tool.',
  RULE_SPATIAL_HIERARCHY: 'Ensure the spatial structure follows Project ▸ Site ▸ Building ▸ Storey. Fix it in the authoring tool’s project setup before export.',
  RULE_CIRCULAR_REFERENCE: 'Remove the circular relationship — an element cannot be its own ancestor. This is an export/interop artefact; re-export from a clean copy.',
  RULE_ELEMENT_IN_BUILDING: 'Place the element inside a storey rather than directly under the building.',
  RULE_MISSING_TYPE: 'Associate the element with a type (IfcWallType, IfcDoorType, …) so type properties and quantities propagate.',
  RULE_MISSING_PROPERTY_SET: 'Add the required property set(s) defined by the project’s BEP/EIR to the element before export.',
  RULE_EMPTY_PROPERTY_VALUE: 'Fill in the empty property value — an empty property is treated as missing by downstream checks.',
  RULE_MISSING_MATERIAL: 'Assign a material to the element so it carries material data (expected from LOD 200/300 onward).',
  RULE_INVALID_IFC_VERSION: 'Export to a current IFC schema (IFC4 / IFC4.3) unless the recipient explicitly requires IFC2x3.',
  RULE_ELEMENT_CLASH: 'Resolve the geometric clash between elements in the authoring tool — move, trim, or join the conflicting elements.',
  RULE_CLASH_MEP_STRUCTURAL: 'Resolve the MEP-vs-structure clash — reroute the MEP run or coordinate a penetration/sleeve with the structural model.',
  RULE_MISSING_PROJECT: 'Every IFC must contain exactly one IfcProject. A missing project means a broken export — re-export the full model.',
  RULE_MISSING_BUILDING: 'Add a building to the spatial structure — define an IfcBuilding in the authoring tool’s project setup.',
  RULE_MISSING_STOREY: 'Add at least one storey (level) under the building.',
  RULE_EMPTY_STOREY: 'Populate the empty storey or remove it — empty storeys clutter the spatial tree and often signal mis-assigned elements.',
  RULE_STOREY_ELEVATION_MISSING: 'Give every storey a defined elevation — it is required to place levels vertically and to generate floor plans.',
  RULE_FILE_DESCRIPTION_MISSING: 'Set the file description (usually the MVD / view definition) in the export options — it is part of the STEP header metadata.',
  RULE_FILE_AUTHOR_MISSING: 'Fill in the author and organisation in the export or project info — required for traceability (ISO 19650).',
  RULE_PROJECT_LONGNAME_MISSING: 'Set the project long name (the descriptive project title) in the authoring tool’s project information.',
  RULE_ISO19650_PROJECT_INFO: 'Complete the project metadata (long name, description, project phase/type) required by ISO 19650 information requirements.',
  RULE_ISO19650_AUTHOR_INFO: 'Add both the author and the organisation to the export so the deliverable is traceable per ISO 19650.',
  RULE_ISO19650_FILENAME: 'Name the export file using the ISO 19650 pattern: Project-Originator-Volume-Level-Type-Role-Number.',
  RULE_LOD_PSET_MISSING: 'Add the property sets required at the declared LOD/LOIN level (per the project’s information delivery plan).',
  RULE_LOD_QUANTITY_MISSING: 'Enable base-quantity export so elements carry IfcElementQuantity (area/volume/length) at the declared LOD.',
  RULE_LOD_MATERIAL_LAYER_MISSING: 'Define layered construction on walls and slabs so they export an IfcMaterialLayerSetUsage at LOD 300+.',
  RULE_MISSING_CLASSIFICATION: 'Attach a classification reference (Uniclass, OmniClass, etc.) so the element carries its standard code as IfcRelAssociatesClassification.',
  RULE_MEP_SYSTEM_MISSING: 'Assign MEP elements to a system so they export inside an IfcSystem — needed for system-based coordination.',
  RULE_PROXY_OVERUSE: 'Reduce IfcBuildingElementProxy elements by mapping them to proper IFC classes — proxies carry no semantic type.',
  RULE_COORDINATE_OFFSET: 'Keep the model near the internal origin and georeference it properly, instead of modelling at large real-world coordinates.',
  RULE_FILE_SIZE_ANOMALY: 'Reduce file weight: lower tessellation/detail, avoid embedded textures, and export only what is needed.',
}

/** Group issues by ruleId, errors-first. Returns [ruleId, issue[]][]. */
function groupIssues(issues) {
  const map = new Map()
  for (const iss of issues) {
    const g = map.get(iss.r) ?? []
    g.push(iss)
    map.set(iss.r, g)
  }
  const order = { e: 0, w: 1, i: 2 }
  return [...map.entries()].sort(
    ([, a], [, b]) => (order[a[0]?.s] ?? 2) - (order[b[0]?.s] ?? 2),
  )
}

/** Render the full crawlable HTML document for a decoded report. */
function renderReportHtml(report, selfUrl, appUrl, ogImage) {
  const color   = scoreColor(report.score)
  const label   = scoreLabel(report.score)
  const total   = report.e + report.w + report.i
  const fileEsc  = esc(report.file)
  // Partial-read caveat. `u` = entities that could not be read (so they were
  // never checked); `nr` = checks that did not run. Either one means the score
  // above covers part of the model, and this page is the version of that score
  // that gets crawled, unfurled and cited — so the caveat goes in the indexed
  // description too, not only in the body where a scraper will miss it.
  const caveats = []
  if (report.u > 0) caveats.push(`${report.u} ${report.u === 1 ? 'entity' : 'entities'} could not be read and ${report.u === 1 ? 'was' : 'were'} not checked`)
  if (report.nr > 0) caveats.push(`${report.nr} ${report.nr === 1 ? 'check' : 'checks'} did not run`)
  const caveatTxt = caveats.length > 0
    ? `${caveats.join('; ')}. The score covers the rest of the model.`
    : ''

  const titleTxt = `IFC Health Score: ${report.score}/100 — ${report.file}`
  const descBase = total > 0
    ? `${report.file} scored ${report.score}/100 (${label}) on the IFC Health Check: ${report.e} errors, ${report.w} warnings, ${report.i} info.`
    : caveatTxt
      ? `${report.file} scored ${report.score}/100 (${label}) on the IFC Health Check — no issues found in what could be checked.`
      : `${report.file} scored ${report.score}/100 (${label}) on the IFC Health Check — no issues found across 44 validation rules.`
  const descTxt = `${descBase}${caveatTxt ? ` ${caveatTxt}` : ''} Validated free in the browser — no upload.`

  const dateTxt = (() => {
    const dte = new Date(report.ts)
    return Number.isNaN(dte.getTime()) ? '' : dte.toISOString().slice(0, 10)
  })()

  const groups = groupIssues(report.issues)
  const circ   = 2 * Math.PI * 34

  const issuesHtml = groups.map(([ruleId, group]) => {
    const sev = group[0]?.s ?? 'i'
    const col = severityColor(sev)
    const fix = RULE_FIX[ruleId]
    const rows = group.slice(0, 5).map((iss) => `
            <li class="row" style="border-left-color:${col}">
              <span class="el">${esc(iss.n)}</span>
              <span class="cls">${esc(iss.c)}</span>
              <p class="msg">${esc(iss.m)}</p>
            </li>`).join('')
    const more = group.length > 5
      ? `<li class="more">+${group.length - 5} more in this group</li>`
      : ''
    return `
        <section class="group">
          <h3 class="ghead">
            <span class="dot" style="background:${col}"></span>
            <code style="color:${col};border-color:${col}55;background:${col}1a">${esc(ruleLabel(ruleId))}</code>
            <span class="sev">${severityLabel(sev)}</span>
            <span class="count">${group.length}</span>
          </h3>
          ${fix ? `<p class="fix"><span class="fixlabel">How to fix</span>${esc(fix)}</p>` : ''}
          <ul class="rows">${rows}${more}</ul>
        </section>`
  }).join('')

  // JSON.stringify does NOT neutralise "</script>", so unicode-escape every "<"
  // before embedding in the <script> block (titleTxt/descTxt carry the filename,
  // which is attacker-controlled). "<" is a valid JSON escape for "<".
  const jsonLd = JSON.stringify({
    '@context': 'https://schema.org',
    '@type': 'WebPage',
    name: titleTxt,
    description: descTxt,
    url: selfUrl,
    isPartOf: { '@type': 'WebSite', name: 'IFC Viewer Online', url: appUrl },
    primaryImageOfPage: ogImage,
  }).replace(/</g, '\\u003c')

  return `<!DOCTYPE html>
<html lang="en">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<title>${esc(titleTxt)}</title>
<meta name="description" content="${esc(descTxt)}">
<meta name="robots" content="index,follow">
<link rel="canonical" href="${esc(selfUrl)}">
<meta property="og:type" content="article">
<meta property="og:site_name" content="IFC Viewer Online">
<meta property="og:title" content="${esc(titleTxt)}">
<meta property="og:description" content="${esc(descTxt)}">
<meta property="og:url" content="${esc(selfUrl)}">
<meta property="og:image" content="${esc(ogImage)}">
<meta property="og:image:width" content="1200">
<meta property="og:image:height" content="630">
<meta name="twitter:card" content="summary_large_image">
<meta name="twitter:title" content="${esc(titleTxt)}">
<meta name="twitter:description" content="${esc(descTxt)}">
<meta name="twitter:image" content="${esc(ogImage)}">
<script type="application/ld+json">${jsonLd}</script>
<style>
  :root{color-scheme:dark}
  *{box-sizing:border-box}
  body{margin:0;background:#0d0f12;color:#e6e8eb;font:14px/1.5 -apple-system,BlinkMacSystemFont,"Segoe UI",Roboto,sans-serif;padding:40px 16px}
  .wrap{max-width:680px;margin:0 auto}
  .brand{display:flex;align-items:center;gap:8px;margin-bottom:28px}
  .brand b{font-size:13px;font-weight:600;color:#aab1ba}
  .tag{font-size:10px;padding:2px 6px;border:1px solid #2a2f36;border-radius:4px;color:#737b85;font-family:monospace}
  .hero{display:flex;align-items:center;gap:24px;border:1px solid ${color}44;background:${color}0f;border-radius:16px;padding:24px;margin-bottom:16px}
  .ring{flex:none;text-align:center}
  .ring span{display:block;font-size:11px;font-weight:600;margin-top:4px;color:${color}}
  .meta{min-width:0;flex:1}
  .meta .file{font-size:15px;font-weight:600;margin:0 0 6px;word-break:break-word}
  .stats{display:flex;flex-wrap:wrap;gap:12px;font-family:monospace;font-size:12px}
  .stats .e{color:#ef4444}.stats .w{color:#F5A623}.stats .i{color:#5E9ED6}.stats .ok{color:#22c55e}
  .when{margin-top:6px;font-size:10px;color:#737b85;font-family:monospace}
  .group{border:1px solid #20242b;border-radius:10px;margin-bottom:10px;overflow:hidden}
  .ghead{display:flex;align-items:center;gap:8px;margin:0;padding:8px 12px;background:#151820;font-size:11px;font-weight:500}
  .ghead .dot{width:7px;height:7px;border-radius:50%;flex:none}
  .ghead code{font-family:monospace;font-size:10px;font-weight:600;padding:2px 6px;border-radius:4px;border:1px solid}
  .ghead .sev{font-size:9px;text-transform:uppercase;letter-spacing:.05em;color:#737b85}
  .ghead .count{margin-left:auto;font-family:monospace;font-size:10px;color:#737b85}
  .fix{margin:0;padding:8px 12px;background:#11141a;border-top:1px solid #20242b;font-size:12px;color:#aab1ba;line-height:1.6}
  .fixlabel{display:inline-block;font-size:9px;font-weight:600;text-transform:uppercase;letter-spacing:.05em;color:#737b85;margin-right:8px}
  .rows{list-style:none;margin:0;padding:0}
  .row{padding:8px 12px 8px 10px;border-top:1px solid #20242b;border-left:3px solid #5E9ED6}
  .row .el{font-size:11px;font-weight:500;margin-right:8px}
  .row .cls{font-family:monospace;font-size:10px;color:#737b85}
  .row .msg{margin:2px 0 0;font-size:11px;color:#aab1ba}
  .more{padding:6px 12px;border-top:1px solid #20242b;font-size:10px;color:#737b85;background:#11141a}
  .cta{display:flex;flex-wrap:wrap;align-items:center;gap:12px;border:1px solid #20242b;background:#11141a;border-radius:12px;padding:18px 20px;margin-top:24px}
  .cta .txt{flex:1;min-width:200px}
  .cta .txt b{display:block;font-size:13px;margin-bottom:2px}
  .cta .txt p{margin:0;font-size:11px;color:#aab1ba}
  .cta a{flex:none;background:#3b82f6;color:#fff;text-decoration:none;font-size:12px;font-weight:600;padding:9px 16px;border-radius:8px}
  .priv{text-align:center;font-size:10px;color:#737b85;margin-top:16px}
  .ok-box{border:1px solid #22c55e44;background:#22c55e0a;border-radius:12px;padding:24px;text-align:center;margin-bottom:16px}
  .ok-box b{color:#22c55e;font-size:13px}
  .ok-box p{margin:6px 0 0;font-size:11px;color:#737b85}
  .caveat{margin:0 0 18px;padding:10px 13px;border:1px solid #E5484D55;border-radius:9px;background:#E5484D14;color:#E5484D;font-size:12.5px;font-weight:600;line-height:1.45}
</style>
</head>
<body>
  <main class="wrap">
    <div class="brand">
      <b>IFC Viewer Online</b><span class="tag">Shared Report</span>
    </div>

    <div class="hero">
      <div class="ring">
        <svg width="80" height="80" viewBox="0 0 80 80" role="img" aria-label="Health Score ${report.score} of 100">
          <circle cx="40" cy="40" r="34" fill="none" stroke="${color}22" stroke-width="8"/>
          <circle cx="40" cy="40" r="34" fill="none" stroke="${color}" stroke-width="8" stroke-linecap="round"
            stroke-dasharray="${circ}" stroke-dashoffset="${circ * (1 - report.score / 100)}" transform="rotate(-90 40 40)"/>
          <text x="40" y="46" text-anchor="middle" font-size="20" font-weight="700" font-family="monospace" fill="${color}">${report.score}</text>
        </svg>
        <span>${label}</span>
      </div>
      <div class="meta">
        <h1 class="file">${fileEsc}</h1>
        <div class="stats">
          ${report.e > 0 ? `<span class="e">${report.e} error${report.e !== 1 ? 's' : ''}</span>` : ''}
          ${report.w > 0 ? `<span class="w">${report.w} warning${report.w !== 1 ? 's' : ''}</span>` : ''}
          ${report.i > 0 ? `<span class="i">${report.i} info</span>` : ''}
          ${total === 0 ? '<span class="ok">No issues found</span>' : ''}
        </div>
        ${dateTxt ? `<div class="when">Validated ${dateTxt}</div>` : ''}
      </div>
    </div>

    ${caveatTxt ? `<p class="caveat" role="note">${esc(caveatTxt)}</p>` : ''}

    ${groups.length > 0 ? issuesHtml : `
    <div class="ok-box">
      <b>No issues found</b>
      <p>${caveatTxt
        ? 'Nothing failed in the parts of this model that could be checked. That is not the same as passing all 44 validation rules — see the note above.'
        : 'This model passed all 44 validation rules.'}</p>
    </div>`}

    <div class="cta">
      <div class="txt">
        <b>Validate your own IFC model</b>
        <p>Free · No upload · No account · 44 validation rules · Works in any browser</p>
      </div>
      <a href="${esc(appUrl)}">Open IFC Viewer</a>
    </div>

    <p class="priv">The IFC file never left the sender’s browser. Only this Health Score was shared.</p>
  </main>
</body>
</html>`
}

/** Minimal branded message page (used for expired + unreadable links). */
function renderMessageHtml(appUrl, title, desc) {
  return `<!DOCTYPE html>
<html lang="en">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<title>${esc(title)}</title>
<meta name="description" content="${esc(desc)}">
<meta name="robots" content="noindex,follow">
<style>
  :root{color-scheme:dark}
  body{margin:0;background:#0d0f12;color:#e6e8eb;font:14px/1.6 -apple-system,BlinkMacSystemFont,"Segoe UI",Roboto,sans-serif;min-height:100vh;display:flex;align-items:center;justify-content:center;padding:24px}
  .card{max-width:440px;text-align:center;border:1px solid #20242b;background:#11141a;border-radius:16px;padding:32px}
  h1{font-size:18px;margin:0 0 8px}
  p{color:#aab1ba;font-size:13px;margin:0 0 20px}
  a{display:inline-block;background:#3b82f6;color:#fff;text-decoration:none;font-size:13px;font-weight:600;padding:10px 18px;border-radius:8px}
  .brand{font-size:12px;color:#737b85;margin-bottom:16px}
</style>
</head>
<body>
  <main class="card">
    <div class="brand">IFC Viewer Online</div>
    <h1>${esc(title)}</h1>
    <p>${esc(desc)}</p>
    <a href="${esc(appUrl)}">Validate an IFC model</a>
  </main>
</body>
</html>`
}

async function handleReport(request, url, env) {
  const appUrl  = env.APP_URL  || DEFAULT_APP_URL
  const ogImage = env.OG_IMAGE_URL || DEFAULT_OG_IMAGE
  // Always the PUBLIC url, never the Worker's. Behind the Vercel proxy the
  // request arrives at …workers.dev/_r, and using that origin here would put a
  // workers.dev canonical + og:url on every shared report — the exact problem
  // the proxy exists to fix. The public path is always /r (/report is a legacy
  // alias that 301s to it).
  const selfUrl = `${publicOrigin(env)}/r${url.search}`

  // Lenient per-IP limit. Edge-cached hits never reach the Worker, so this only
  // throttles cache misses / scrapers hammering unique payloads.
  if (!(await underLimit(env.REPORT_LIMITER, clientIp(request)))) {
    return new Response('Too many requests — please try again in a minute.', {
      status: 429,
      headers: { 'Content-Type': 'text/plain; charset=utf-8', 'Retry-After': '60' },
    })
  }

  const report = decodeReport(url.searchParams.get('d'))

  // Link expiry — advisory, from the embedded creation timestamp. 410 Gone tells
  // crawlers to drop the URL from the index.
  if (report && report.ts) {
    const created    = new Date(report.ts).getTime()
    const maxAgeDays  = Number(env.REPORT_MAX_AGE_DAYS) > 0
      ? Number(env.REPORT_MAX_AGE_DAYS)
      : DEFAULT_REPORT_MAX_AGE_DAYS
    if (Number.isFinite(created) && Date.now() - created > maxAgeDays * DAY_MS) {
      return new Response(
        renderMessageHtml(
          appUrl,
          'This shared IFC report has expired',
          `Shared IFC Health Check reports expire after ${maxAgeDays} days. Re-validate your model — free, in the browser, no upload.`,
        ),
        {
          status: 410,
          headers: {
            'Content-Type':  'text/html; charset=utf-8',
            'Cache-Control': 'no-store',
            'X-Robots-Tag':  'noindex',
          },
        },
      )
    }
  }

  if (!report) {
    // Malformed/empty/oversized link — show an honest "couldn't read this" page
    // (not a fake 0-score report) and still convert the visitor.
    return new Response(
      renderMessageHtml(
        appUrl,
        'This shared report link could not be read',
        'The link looks incomplete or was truncated. Validate your own IFC model — free, in the browser, no upload.',
      ),
      {
        status: 200,
        headers: {
          'Content-Type':  'text/html; charset=utf-8',
          'Cache-Control': 'no-store',
          'X-Robots-Tag':  'noindex',
        },
      },
    )
  }

  // Valid report — render and cache hard at the edge & CDN (immutable per payload).
  return new Response(renderReportHtml(report, selfUrl, appUrl, ogImage), {
    status: 200,
    headers: {
      'Content-Type':  'text/html; charset=utf-8',
      'Cache-Control': 'public, max-age=3600, s-maxage=86400',
      'X-Robots-Tag':  'index, follow',
    },
  })
}

// ── Embeddable Health Score badge (SVG) ────────────────────────────────────────
//
// GET /badge?score=82            → shields.io-style SVG "IFC Health Score | 82/100"
// GET /badge?d=<report payload>  → same, score read from the shared-report payload
//
// This is the *distribution* primitive (the "Moz DA mechanism"): a tiny image the
// sender drops into a deliverable README / email / project handoff. Wrapped in a
// link to the crawlable report (/r?d=…) it is verifiable, not a blind self-claim.
// Static text + an integer score → no XSS surface, no escaping needed. Cached hard.

function badgeSvg(label, value, color) {
  // Approx Verdana 11px advance ≈ 6.4px/char; pad each side by 8px.
  const lw = Math.round(label.length * 6.4) + 16
  const vw = Math.round(value.length * 7.2) + 16
  const w  = lw + vw
  return `<svg xmlns="http://www.w3.org/2000/svg" width="${w}" height="20" role="img" aria-label="${label}: ${value}">
  <linearGradient id="g" x2="0" y2="100%"><stop offset="0" stop-color="#bbb" stop-opacity=".1"/><stop offset="1" stop-opacity=".1"/></linearGradient>
  <mask id="m"><rect width="${w}" height="20" rx="3" fill="#fff"/></mask>
  <g mask="url(#m)">
    <rect width="${lw}" height="20" fill="#444"/>
    <rect x="${lw}" width="${vw}" height="20" fill="${color}"/>
    <rect width="${w}" height="20" fill="url(#g)"/>
  </g>
  <g fill="#fff" text-anchor="middle" font-family="Verdana,DejaVu Sans,Geneva,sans-serif" font-size="11">
    <text x="${lw / 2}" y="14.5" fill="#010101" fill-opacity=".3">${label}</text>
    <text x="${lw / 2}" y="13.5">${label}</text>
    <text x="${lw + vw / 2}" y="14.5" fill="#010101" fill-opacity=".3">${value}</text>
    <text x="${lw + vw / 2}" y="13.5">${value}</text>
  </g>
</svg>`
}

function svgResponse(svg, cache) {
  return new Response(svg, {
    status: 200,
    headers: {
      'Content-Type':  'image/svg+xml; charset=utf-8',
      'Cache-Control': cache,
      // Badges are embedded cross-origin in READMEs/markdown renderers.
      'Access-Control-Allow-Origin': '*',
    },
  })
}

function handleBadge(url) {
  // Prefer a full report payload (ties the badge to a verifiable report); fall
  // back to a bare ?score= for lightweight embeds.
  const report = decodeReport(url.searchParams.get('d'))
  let score = report ? report.score : null
  if (score === null) {
    // Guard against Number(null)===0 / Number('')===0 — only parse a real value.
    const raw = url.searchParams.get('score')
    if (raw !== null && raw.trim() !== '') {
      const n = Number(raw)
      if (Number.isFinite(n)) score = Math.max(0, Math.min(100, Math.round(n)))
    }
  }
  if (score === null) {
    // No usable score → neutral badge, don't cache aggressively.
    return svgResponse(badgeSvg('IFC Health Score', 'n/a', '#9f9f9f'), 'no-store')
  }
  // A partial run gets an asterisk. The badge is 20px tall and travels to other
  // people's READMEs, so it cannot carry the explanation — but it must not claim
  // a whole-model score either, and it links to the report that explains it. Only
  // the ?d= path knows: a bare ?score= carries no coverage information at all.
  const partial = report != null && (report.u > 0 || report.nr > 0)
  return svgResponse(
    badgeSvg('IFC Health Score', `${score}/100${partial ? '*' : ''}`, scoreColor(score)),
    'public, max-age=3600, s-maxage=86400',
  )
}

// ── Anonymous Health Score benchmark (KV) ───────────────────────────────────────
//
// POST /bench {score}  → fold one score into the aggregate (n, sum, sumSq, hist).
// GET  /bench          → { n, avg, p50, p90, hist } so the app can show
//                        "your 82 vs industry avg 71 (n=…)".
//
// Privacy: ONLY the integer score is stored. No model data, no file name, no IP,
// no identifier — this is aggregate statistics, not tracking, and stays within
// the "nothing leaves the browser" invariant (the score is a derived number the
// user already chose to compute). Until the BENCH KV namespace is bound in
// wrangler.toml, every call is a safe no-op (POST stores nothing, GET → n:0), so
// the deployed worker keeps working unchanged.
//
// Caveat: KV read-modify-write can lose updates under high concurrency (the count
// may slightly undercount during bursts) — acceptable for an approximate public
// benchmark. Upgrade path: D1 with `UPDATE … SET n = n + 1` for atomicity.

const BENCH_KEY = 'bench:v1:global'

function emptyBench() {
  return { n: 0, sum: 0, sumSq: 0, hist: new Array(10).fill(0) }
}

async function readBench(env) {
  if (!env.BENCH) return null
  try {
    const raw = await env.BENCH.get(BENCH_KEY)
    if (!raw) return emptyBench()
    const o = JSON.parse(raw)
    const hist = Array.isArray(o.hist) && o.hist.length === 10
      ? o.hist.map(toCount)
      : new Array(10).fill(0)
    return {
      n:     toCount(o.n),
      sum:   Number.isFinite(o.sum) ? o.sum : 0,
      sumSq: Number.isFinite(o.sumSq) ? o.sumSq : 0,
      hist,
    }
  } catch {
    return emptyBench()
  }
}

/** Approximate percentile from the 10-bin histogram (bin midpoints). */
function benchPercentile(hist, n, p) {
  const target = n * p
  let cum = 0
  for (let i = 0; i < 10; i++) {
    cum += hist[i]
    if (cum >= target) return i * 10 + 5
  }
  return 95
}

function benchStats(b) {
  if (!b || b.n <= 0) return { n: 0 }
  return {
    n:   b.n,
    avg: Math.round(b.sum / b.n),
    p50: benchPercentile(b.hist, b.n, 0.5),
    p90: benchPercentile(b.hist, b.n, 0.9),
    hist: b.hist,
  }
}

async function handleBenchPost(request, env, cors) {
  // Light per-IP guard (fail-open) so a script can't trivially skew the average.
  if (!(await underLimit(env.REPORT_LIMITER, clientIp(request)))) {
    return jsonResponse({ ok: false, error: 'Too many requests' }, 429, {
      ...(cors ?? {}), 'Retry-After': '60',
    })
  }
  // No KV bound → accept and no-op (keeps the app's fire-and-forget call happy).
  if (!env.BENCH) return jsonResponse({ ok: true, stored: false }, 200, cors ?? {})

  let body
  try {
    body = await request.json()
  } catch {
    return jsonResponse({ ok: false, error: 'Invalid JSON body' }, 400, cors ?? {})
  }
  if (!body || typeof body !== 'object' || Array.isArray(body)) {
    return jsonResponse({ ok: false, error: 'Invalid JSON body' }, 400, cors ?? {})
  }
  const score = Number(body.score)
  if (!Number.isFinite(score) || score < 0 || score > 100) {
    return jsonResponse({ ok: false, error: 'Invalid score' }, 422, cors ?? {})
  }

  const s = Math.round(score)
  const cur = (await readBench(env)) ?? emptyBench()
  cur.n     += 1
  cur.sum   += s
  cur.sumSq += s * s
  cur.hist[Math.min(9, Math.floor(s / 10))] += 1

  try {
    await env.BENCH.put(BENCH_KEY, JSON.stringify(cur))
  } catch (err) {
    console.warn('[worker] bench put failed:', err)
    return jsonResponse({ ok: true, stored: false }, 200, cors ?? {})
  }
  return jsonResponse({ ok: true, stored: true }, 200, cors ?? {})
}

async function handleBenchGet(env, cors) {
  const stats = benchStats(await readBench(env))
  return jsonResponse(stats, 200, {
    ...(cors ?? {}),
    'Cache-Control': 'public, max-age=300, s-maxage=300',
  })
}

// ── Event contact form (/msp-global) ─────────────────────────────────────────
//
// A handful of people at a trade fair asking to talk. Stored in the LEADS KV
// namespace, one key per submission, and read back only through /leads with the
// LEADS_ADMIN_TOKEN secret. No newsletter, no Resend, no third party.
//
// Without the binding the endpoint says so (503): the page must never show
// "sent" for a contact that was not stored.

const LEAD_PREFIX = 'lead:'
const LEAD_MIN_FILL_MS = 2500
const LEAD_FIELDS = ['created_at', 'name', 'email', 'company', 'message', 'event', 'entry', 'profile', 'intent', 'feature']

function cleanText(v, max) {
  if (typeof v !== 'string') return ''
  // eslint-disable-next-line no-control-regex
  return v.replace(/[\u0000-\u0008\u000B\u000C\u000E-\u001F\u007F]/g, '').trim().slice(0, max)
}

async function handleLead(request, env, cors) {
  if (!cors) return jsonResponse({ ok: false, error: 'Forbidden' }, 403)
  if (!(await underLimit(env.SUBSCRIBE_LIMITER, clientIp(request)))) {
    return jsonResponse({ ok: false, error: 'Too many attempts. Please wait a minute.' }, 429, { ...cors, 'Retry-After': '60' })
  }
  let body
  try { body = await request.json() } catch {
    return jsonResponse({ ok: false, error: 'Invalid request.' }, 400, cors)
  }
  // Honeypot and fill time: bots fill every field and submit instantly. Answer
  // them like a success so they do not retry, but store nothing.
  const elapsed = Number(body?.elapsed_ms)
  if (cleanText(body?.website, 200) || !Number.isFinite(elapsed) || elapsed < LEAD_MIN_FILL_MS) {
    return jsonResponse({ ok: true }, 200, cors)
  }
  const lead = {
    created_at: new Date().toISOString(),
    name:    cleanText(body?.name, 120),
    email:   cleanText(body?.email, 254).toLowerCase(),
    company: cleanText(body?.company, 160),
    message: cleanText(body?.message, 1000),
    event:   cleanText(body?.event, 40) || 'unknown',
    entry:   cleanText(body?.entry, 20) || 'direct',
    profile: cleanText(body?.profile, 20),
    intent:  cleanText(body?.intent, 20),
    feature: cleanText(body?.feature, 20),
  }
  if (lead.name.length < 2) return jsonResponse({ ok: false, error: 'Please add your name.' }, 400, cors)
  if (!isValidEmail(lead.email)) return jsonResponse({ ok: false, error: 'That email address does not look right.' }, 400, cors)
  if (lead.message.length < 3) return jsonResponse({ ok: false, error: 'Tell me briefly what you want to solve.' }, 400, cors)
  if (!env.LEADS) {
    return jsonResponse({ ok: false, error: 'The form is not available right now. Please email me instead.' }, 503, cors)
  }
  const key = `${LEAD_PREFIX}${lead.created_at}:${crypto.randomUUID().slice(0, 8)}`
  await env.LEADS.put(key, JSON.stringify(lead))
  return jsonResponse({ ok: true }, 200, cors)
}

function safeEqual(a, b) {
  if (typeof a !== 'string' || typeof b !== 'string' || a.length !== b.length) return false
  let diff = 0
  for (let i = 0; i < a.length; i++) diff |= a.charCodeAt(i) ^ b.charCodeAt(i)
  return diff === 0
}

function csvCell(v) {
  let s = String(v ?? '')
  // Spreadsheet formula injection: a cell starting with = + - @ runs as a formula.
  if (/^[=+\-@\t\r]/.test(s)) s = `'${s}`
  return /[",\n\r]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s
}

/** GET /leads[?format=json] — Authorization: Bearer <LEADS_ADMIN_TOKEN>. */
async function handleLeadsExport(request, url, env) {
  const auth = request.headers.get('Authorization') ?? ''
  const token = auth.startsWith('Bearer ') ? auth.slice(7) : ''
  if (!env.LEADS_ADMIN_TOKEN || !safeEqual(token, env.LEADS_ADMIN_TOKEN)) {
    return jsonResponse({ ok: false, error: 'Unauthorized' }, 401)
  }
  if (!env.LEADS) return jsonResponse({ ok: false, error: 'LEADS not bound' }, 503)
  const leads = []
  let cursor
  do {
    const page = await env.LEADS.list({ prefix: LEAD_PREFIX, cursor })
    for (const k of page.keys) {
      const raw = await env.LEADS.get(k.name)
      if (raw) { try { leads.push(JSON.parse(raw)) } catch { /* skip */ } }
    }
    cursor = page.list_complete ? undefined : page.cursor
  } while (cursor)
  const noStore = { 'Cache-Control': 'no-store' }
  if (url.searchParams.get('format') === 'json') return jsonResponse({ ok: true, leads }, 200, noStore)
  const csv = [LEAD_FIELDS.join(','), ...leads.map((l) => LEAD_FIELDS.map((f) => csvCell(l[f])).join(','))].join('\r\n')
  return new Response('﻿' + csv + '\r\n', {
    status: 200,
    headers: { 'Content-Type': 'text/csv; charset=utf-8', 'Content-Disposition': 'attachment; filename="leads.csv"', ...noStore },
  })
}

// ── Feature requests from registered users ──────────────────────────────────
//
// Signed-in users tell us what would help them most and how they cope today.
// Only a valid Clerk session token from the production instance is accepted:
// the user id comes from the token, never from the body, so nobody can post
// as someone else and there are no anonymous requests to wade through. The
// email comes from the token's `email` claim (instance config: session.claims).
//
// Stored in the LEADS KV namespace:
//   request:<created_at>:<rand>              the request (status + reply live here)
//   request-by:<user_id>:<created_at>:<rand> index, so a user can list their own
//   request-count:<user_id>:<day>            daily counter (expires)
//
//   POST  /requests            a signed-in user files one
//   GET   /requests?mine=1     a signed-in user's own, with status and our reply
//   GET   /requests            all of them, admins only (FEEDBACK_ADMIN_IDS)
//   PATCH /requests?id=<id>    admin sets status and the reply the user sees

const REQUEST_PREFIX = 'request:'
const REQUEST_BY_PREFIX = 'request-by:'
const REQUEST_COUNT_PREFIX = 'request-count:'
const REQUESTS_PER_DAY = 5
const DEFAULT_CLERK_ISSUER = 'https://clerk.ifcvieweronline.eu'
// What would help most: the paid features on the roadmap (docs-planning 19/20),
// in the user's words, plus a free answer. One tap is a complete request.
const REQUEST_FEATURES = ['big_files', 'versions', 'client_link', 'bcf_team', 'auto_check', 'cloud_drives', 'batch_tools', 'other']
const REQUEST_FREQUENCIES = ['daily', 'weekly', 'sometimes']
// Behaviour, not stated price: how they cope today and who holds the budget.
const REQUEST_TODAY = ['nothing', 'manual', 'paid_tool', 'free_tool']
const REQUEST_PAYERS = ['me', 'company', 'nobody']
const REQUEST_ROLES = ['bim', 'architect', 'engineer', 'contractor', 'owner', 'developer', 'student', 'other']
const REQUEST_TEAMS = ['solo', '2-10', '11-50', '51+']
const REQUEST_STATUSES = ['new', 'reviewing', 'planned', 'building', 'shipped', 'declined']
const REQUEST_ID_RE = /^\d{4}-\d{2}-\d{2}T[\d:.]+Z:[0-9a-f]{8}$/
const CLOCK_SKEW_S = 60

const b64urlBytes = (s) => {
  const b = atob(s.replace(/-/g, '+').replace(/_/g, '/') + '==='.slice((s.length + 3) % 4))
  return Uint8Array.from(b, (c) => c.charCodeAt(0))
}
const b64urlJson = (s) => JSON.parse(new TextDecoder().decode(b64urlBytes(s)))

let jwksCache = { issuer: '', at: 0, keys: [] }
async function clerkKeys(issuer) {
  if (jwksCache.issuer === issuer && Date.now() - jwksCache.at < 3_600_000) return jwksCache.keys
  const res = await fetch(`${issuer}/.well-known/jwks.json`)
  if (!res.ok) throw new Error(`jwks ${res.status}`)
  const { keys } = await res.json()
  jwksCache = { issuer, at: Date.now(), keys: Array.isArray(keys) ? keys : [] }
  return jwksCache.keys
}

/** Verifies a Clerk session JWT (RS256). Returns its claims, or null. */
async function verifyClerkToken(token, env) {
  if (typeof token !== 'string') return null
  const parts = token.split('.')
  if (parts.length !== 3) return null
  try {
    const header = b64urlJson(parts[0])
    const claims = b64urlJson(parts[1])
    if (header.alg !== 'RS256') return null
    const issuer = env.CLERK_ISSUER || DEFAULT_CLERK_ISSUER
    if (claims.iss !== issuer) return null
    const now = Math.floor(Date.now() / 1000)
    if (typeof claims.exp !== 'number' || claims.exp < now - CLOCK_SKEW_S) return null
    if (typeof claims.nbf === 'number' && claims.nbf > now + CLOCK_SKEW_S) return null
    if (claims.azp && !ALLOWED_ORIGINS.includes(claims.azp)) return null
    if (typeof claims.sub !== 'string' || !claims.sub.startsWith('user_')) return null
    const jwk = (await clerkKeys(issuer)).find((k) => k.kid === header.kid)
    if (!jwk) return null
    const key = await crypto.subtle.importKey('jwk', jwk, { name: 'RSASSA-PKCS1-v1_5', hash: 'SHA-256' }, false, ['verify'])
    const ok = await crypto.subtle.verify(
      'RSASSA-PKCS1-v1_5', key, b64urlBytes(parts[2]), new TextEncoder().encode(`${parts[0]}.${parts[1]}`),
    )
    return ok ? claims : null
  } catch {
    return null
  }
}

function bearer(request) {
  const auth = request.headers.get('Authorization') ?? ''
  return auth.startsWith('Bearer ') ? auth.slice(7).trim() : ''
}

function isRequestAdmin(env, claims) {
  const admins = String(env.FEEDBACK_ADMIN_IDS ?? '').split(',').map((s) => s.trim()).filter(Boolean)
  return !!claims && admins.includes(claims.sub)
}

async function handleRequestPost(request, env, cors) {
  if (!cors) return jsonResponse({ ok: false, error: 'Forbidden' }, 403)
  const claims = await verifyClerkToken(bearer(request), env)
  if (!claims) return jsonResponse({ ok: false, error: 'unauthorized' }, 401, cors)
  if (!(await underLimit(env.SUBSCRIBE_LIMITER, clientIp(request)))) {
    return jsonResponse({ ok: false, error: 'rate_limited' }, 429, { ...cors, 'Retry-After': '60' })
  }
  let body
  try { body = await request.json() } catch {
    return jsonResponse({ ok: false, error: 'invalid' }, 400, cors)
  }
  const pick = (v, allowed) => (allowed.includes(v) ? v : '')
  const req = {
    created_at: new Date().toISOString(),
    user_id: claims.sub,
    email: isValidEmail(String(claims.email ?? '').toLowerCase()) ? String(claims.email).toLowerCase() : '',
    feature: pick(body?.feature, REQUEST_FEATURES),
    need: cleanText(body?.need, 2000),
    // Optional detail. Empty string = not answered.
    frequency: pick(body?.frequency, REQUEST_FREQUENCIES),
    today: pick(body?.today, REQUEST_TODAY),
    today_tool: cleanText(body?.today_tool, 120),
    payer: pick(body?.payer, REQUEST_PAYERS),
    // Commitments: the honest buying signals.
    beta: body?.beta === true,
    call: body?.call === true,
    contact_ok: body?.contact_ok === true || body?.beta === true || body?.call === true,
    role: pick(body?.role, REQUEST_ROLES),
    team: pick(body?.team, REQUEST_TEAMS),
    source: cleanText(body?.source, 40).replace(/[^\w:.-]/g, ''),
    lang: cleanText(body?.lang, 8),
    plan: cleanText(body?.plan, 20),
    status: 'new',
    reply: '',
    updated_at: '',
  }
  if (!req.feature) return jsonResponse({ ok: false, error: 'invalid' }, 400, cors)
  if (req.feature === 'other' && req.need.length < 5) return jsonResponse({ ok: false, error: 'need_too_short' }, 400, cors)
  if (!env.LEADS) return jsonResponse({ ok: false, error: 'unavailable' }, 503, cors)

  const day = req.created_at.slice(0, 10)
  const countKey = `${REQUEST_COUNT_PREFIX}${req.user_id}:${day}`
  const count = Number(await env.LEADS.get(countKey)) || 0
  if (count >= REQUESTS_PER_DAY) return jsonResponse({ ok: false, error: 'daily_limit' }, 429, cors)
  await env.LEADS.put(countKey, String(count + 1), { expirationTtl: 2 * 86_400 })

  const id = `${req.created_at}:${crypto.randomUUID().replace(/-/g, '').slice(0, 8)}`
  await env.LEADS.put(`${REQUEST_PREFIX}${id}`, JSON.stringify(req))
  await env.LEADS.put(`${REQUEST_BY_PREFIX}${req.user_id}:${id}`, id)
  return jsonResponse({ ok: true, id }, 200, cors)
}

async function listByPrefix(env, prefix) {
  const keys = []
  let cursor
  do {
    const page = await env.LEADS.list({ prefix, cursor })
    for (const k of page.keys) keys.push(k.name)
    cursor = page.list_complete ? undefined : page.cursor
  } while (cursor)
  return keys
}

async function readRequest(env, id) {
  const raw = await env.LEADS.get(`${REQUEST_PREFIX}${id}`)
  if (!raw) return null
  try { return { id, ...JSON.parse(raw) } } catch { return null }
}

const newestFirst = (a, b) => (a.created_at < b.created_at ? 1 : -1)

/** GET /requests[?mine=1] — Authorization: Bearer <Clerk session token>. */
async function handleRequestsList(request, url, env, cors) {
  const noStore = { 'Cache-Control': 'no-store', ...(cors ?? {}) }
  const claims = await verifyClerkToken(bearer(request), env)
  if (!env.LEADS) return jsonResponse({ ok: false, error: 'unavailable' }, 503, noStore)

  if (url.searchParams.get('mine') === '1') {
    if (!claims) return jsonResponse({ ok: false, error: 'unauthorized' }, 401, noStore)
    const ids = (await listByPrefix(env, `${REQUEST_BY_PREFIX}${claims.sub}:`))
      .map((k) => k.slice(REQUEST_BY_PREFIX.length + claims.sub.length + 1))
    const requests = []
    for (const id of ids) {
      const r = await readRequest(env, id)
      // What the user may see of their own request: no email, no internal fields.
      if (r && r.user_id === claims.sub) {
        requests.push({ id, created_at: r.created_at, feature: r.feature, need: r.need, status: r.status || 'new', reply: r.reply || '', updated_at: r.updated_at || '' })
      }
    }
    return jsonResponse({ ok: true, requests: requests.sort(newestFirst) }, 200, noStore)
  }

  // 404, not 403: the full list does not exist for anyone else.
  if (!isRequestAdmin(env, claims)) return jsonResponse({ ok: false, error: 'Not found' }, 404, noStore)
  const requests = []
  for (const key of await listByPrefix(env, REQUEST_PREFIX)) {
    const r = await readRequest(env, key.slice(REQUEST_PREFIX.length))
    if (r) requests.push({ status: 'new', reply: '', ...r })
  }
  return jsonResponse({ ok: true, requests: requests.sort(newestFirst) }, 200, noStore)
}

/** PATCH /requests?id=<id> {status?, reply?} — admins only. */
async function handleRequestPatch(request, url, env, cors) {
  const noStore = { 'Cache-Control': 'no-store', ...(cors ?? {}) }
  const claims = await verifyClerkToken(bearer(request), env)
  if (!isRequestAdmin(env, claims)) return jsonResponse({ ok: false, error: 'Not found' }, 404, noStore)
  if (!env.LEADS) return jsonResponse({ ok: false, error: 'unavailable' }, 503, noStore)
  const id = url.searchParams.get('id') ?? ''
  if (!REQUEST_ID_RE.test(id)) return jsonResponse({ ok: false, error: 'invalid' }, 400, noStore)
  const raw = await env.LEADS.get(`${REQUEST_PREFIX}${id}`)
  if (!raw) return jsonResponse({ ok: false, error: 'Not found' }, 404, noStore)
  let body
  try { body = await request.json() } catch {
    return jsonResponse({ ok: false, error: 'invalid' }, 400, noStore)
  }
  const current = JSON.parse(raw)
  if (body?.status !== undefined && !REQUEST_STATUSES.includes(body.status)) {
    return jsonResponse({ ok: false, error: 'invalid' }, 400, noStore)
  }
  const next = {
    ...current,
    status: body?.status ?? current.status ?? 'new',
    reply: body?.reply !== undefined ? cleanText(body.reply, 1000) : (current.reply ?? ''),
    updated_at: new Date().toISOString(),
  }
  await env.LEADS.put(`${REQUEST_PREFIX}${id}`, JSON.stringify(next))
  return jsonResponse({ ok: true, request: { id, ...next } }, 200, noStore)
}

// ── Router ──────────────────────────────────────────────────────────────────

export default {
  async fetch(request, env) {
    let cors = {}
    try {
      const url    = new URL(request.url)
      const origin = request.headers.get('Origin') ?? ''
      cors = corsHeaders(origin) ?? {}

      // CORS pre-flight (subscribe endpoint)
      if (request.method === 'OPTIONS') {
        const c = corsHeaders(origin)
        if (!c) return new Response(null, { status: 403 })
        return new Response(null, { status: 204, headers: c })
      }

      // ── Internal paths, reached only through the Vercel proxy ───────────────
      // These do the actual work. They are NOT the public URLs: keeping them
      // distinct is what stops Vercel→Worker→Vercel from looping, since the
      // public paths below redirect rather than serve.
      //
      // HEAD is answered exactly like GET but without the body: some unfurlers
      // (Slack/WhatsApp/…) probe with HEAD before the GET, and a 404 there kills
      // the link preview.
      if (url.pathname === '/_r' && (request.method === 'GET' || request.method === 'HEAD')) {
        const res = await handleReport(request, url, env)
        return request.method === 'HEAD'
          ? new Response(null, { status: res.status, headers: res.headers })
          : res
      }
      if (url.pathname === '/_badge' && request.method === 'GET') {
        return handleBadge(url)
      }

      // ── Public paths → 301 to the real domain ───────────────────────────────
      // Every badge and report link already shared points here. A 301 both keeps
      // them working and hands their accumulated authority to the main domain.
      // /report is a legacy alias and collapses onto /r.
      if (
        (url.pathname === '/r' || url.pathname === '/report') &&
        (request.method === 'GET' || request.method === 'HEAD')
      ) {
        return redirectToPublic(env, '/r', url.search)
      }
      if (url.pathname === '/badge' && request.method === 'GET') {
        return redirectToPublic(env, '/badge', url.search)
      }

      // Anonymous Health Score benchmark — fetched cross-origin from the SPA (CORS).
      if (url.pathname === '/bench' && request.method === 'GET') {
        return await handleBenchGet(env, corsHeaders(origin))
      }
      if (url.pathname === '/bench' && request.method === 'POST') {
        return await handleBenchPost(request, env, corsHeaders(origin))
      }

      // Event contact form, and its private export
      if (url.pathname === '/lead' && request.method === 'POST') {
        // Same-origin through the Vercel rewrite (or the dev proxy on any port).
        const leadCors = corsHeaders(origin) ?? (/^http:\/\/localhost:\d+$/.test(origin) ? { 'Access-Control-Allow-Origin': origin } : null)
        return await handleLead(request, env, leadCors)
      }
      if (url.pathname === '/leads' && request.method === 'GET') {
        return await handleLeadsExport(request, url, env)
      }

      // Feature requests from signed-in users, and the admin's read-back
      if (url.pathname === '/requests' && ['POST', 'GET', 'PATCH'].includes(request.method)) {
        const reqCors = corsHeaders(origin) ?? (/^http:\/\/localhost:\d+$/.test(origin) ? { 'Access-Control-Allow-Origin': origin } : null)
        if (request.method === 'POST') return await handleRequestPost(request, env, reqCors)
        if (request.method === 'PATCH') return await handleRequestPatch(request, url, env, reqCors)
        return await handleRequestsList(request, url, env, reqCors)
      }

      // Email capture
      if (url.pathname === '/subscribe' && request.method === 'POST') {
        return await handleSubscribe(request, env, corsHeaders(origin))
      }

      return jsonResponse({ ok: false, error: 'Not found' }, 404, cors)
    } catch (err) {
      // Last-resort guard: never surface a raw runtime 500 to a client. Any
      // unexpected throw becomes a clean JSON error (CORS-safe).
      console.error('[worker] unhandled error:', err)
      return jsonResponse({ ok: false, error: 'Internal error' }, 500, cors)
    }
  },
}
