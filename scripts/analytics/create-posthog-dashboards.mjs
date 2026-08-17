// Create the PostHog dashboards this project actually needs, via the API.
//
// Why a script and not the UI: the dashboards are defined here, in the repo, next
// to the 48 events they read. When an event is renamed the definition moves with
// it, and the dashboards can be rebuilt on a new project without clicking.
//
// Run it yourself — it needs a PERSONAL API KEY, which this script only ever
// reads from the environment:
//
//   PowerShell:
//     $env:POSTHOG_API_KEY = "phx_..."
//     node scripts/analytics/create-posthog-dashboards.mjs
//
//   bash:
//     POSTHOG_API_KEY=phx_... node scripts/analytics/create-posthog-dashboards.mjs
//
// Create the key at https://us.posthog.com/settings/user-api-keys with scopes
// `insight:write` and `dashboard:write`. It is NOT the same as the public
// VITE_POSTHOG_KEY that ships in the bundle — that one can only write events.
//
// Pass --dry-run to print what would be created without touching the project.

const PROJECT_ID = process.env.POSTHOG_PROJECT_ID || '438637'
const HOST       = (process.env.POSTHOG_HOST || 'https://us.posthog.com').replace(/\/$/, '')
const API_KEY    = process.env.POSTHOG_API_KEY
const DRY_RUN    = process.argv.includes('--dry-run')

if (!API_KEY && !DRY_RUN) {
  console.error('POSTHOG_API_KEY is not set. See the header of this file.')
  process.exit(1)
}

// ── Query builders ────────────────────────────────────────────────────────────
// PostHog's current insight shape is { query: { kind: 'InsightVizNode', source } }.
// Older `filters` payloads still work on some versions but are deprecated, so we
// use the node format.

const ev = (event, extra = {}) => ({ kind: 'EventsNode', event, math: 'total', ...extra })

function trend(series, { days = 30, interval = 'day', display = 'ActionsLineGraph', breakdown = null, formula = null } = {}) {
  const source = {
    kind: 'TrendsQuery',
    series,
    interval,
    dateRange: { date_from: `-${days}d` },
    trendsFilter: { display, ...(formula ? { formula } : {}) },
  }
  if (breakdown) {
    source.breakdownFilter = { breakdown, breakdown_type: 'event' }
  }
  return { kind: 'InsightVizNode', source }
}

function funnel(series, { days = 30 } = {}) {
  return {
    kind: 'InsightVizNode',
    source: {
      kind: 'FunnelsQuery',
      series,
      dateRange: { date_from: `-${days}d` },
      funnelsFilter: { funnelVizType: 'steps' },
    },
  }
}

// ── Dashboard definitions ─────────────────────────────────────────────────────
//
// Two dashboards, because they answer different questions and get read at
// different times.
//
// "Acquisition & SEO" is the Search Console complement. GSC stops at the click:
// it tells you an impression became a visit and nothing more. These tiles start
// where GSC ends — which page they landed on, whether they opened a model, and
// whether they ever came back. Landing pages are the /fix/ silo and the ten
// language homes, so the pathname breakdowns map straight onto the SEO work.
//
// "Distribution loop" tracks the only mechanism that earns backlinks: a user
// validates, shares a report or copies a badge, someone else opens it. Every step
// of that chain is an event, so the loop is measurable — and it is the thing the
// backlink profile depends on.

const DASHBOARDS = [
  {
    name: 'Acquisition & SEO',
    description:
      'What happens after the click, which Search Console cannot see. Entry pages, activation, and where visitors actually come from.',
    tiles: [
      {
        name: 'Pageviews by path (top pages)',
        description:
          'The real traffic distribution across the ~600 pages. Compare against GSC impressions: a page with impressions and no pageviews has a title/snippet problem, not a ranking problem.',
        query: trend([ev('$pageview')], { breakdown: '$pathname', display: 'ActionsBarValue' }),
      },
      {
        name: 'Entry paths → did they open a model?',
        description:
          'Activation by landing page. Tells you which SEO pages bring people who actually use the tool versus people who bounce.',
        query: funnel([ev('$pageview'), ev('file_opened')]),
      },
      {
        name: 'Pageviews by referring domain',
        description:
          'Where traffic really comes from. With 9 Google clicks in three months but 1400+ validations, most of it is not organic search — this shows what is.',
        query: trend([ev('$pageview')], { breakdown: '$referring_domain', display: 'ActionsBarValue' }),
      },
      {
        name: 'Language home pages',
        description:
          'Traffic to /, /es/, /de/, /fr/, /pt/, /it/, /zh/, /ja/, /th/, /ca/. Eight of these only became indexable pages in August 2026 — this is where that shows up.',
        query: trend([ev('$pageview')], { breakdown: '$pathname', display: 'ActionsLineGraph' }),
      },
      {
        name: 'Landing CTA clicks by variant',
        description: 'Which call to action earns the click: load_demo, open_file, github, learn_more.',
        query: trend([ev('landing_cta_clicked')], { breakdown: 'variant' }),
      },
      {
        name: 'Invite links opened by source',
        description: 'Cookieless attribution for the 1:1 invite links (linkedin, medium, …).',
        query: trend([ev('invite_link_opened')], { breakdown: 'source' }),
      },
      {
        name: 'Email captures',
        description: 'Lead magnet and footer form conversions over time.',
        query: trend([ev('email_captured')], { breakdown: 'source' }),
      },
    ],
  },
  {
    name: 'Distribution loop',
    description:
      'The backlink engine: validate → share a report or badge → someone else opens it. This is the only mechanism that moves domain authority, so it gets its own board.',
    tiles: [
      {
        name: 'Core funnel: open → validate → share',
        description:
          'The whole activation-to-distribution chain. The drop from validation_completed to share_report_clicked is the ceiling on backlink growth.',
        query: funnel([ev('file_opened'), ev('validation_completed'), ev('share_report_clicked')]),
      },
      {
        name: 'Reports shared vs reports viewed',
        description:
          'Shares are supply, views are demand. Views climbing faster than shares means each shared report reaches more people — the loop is compounding.',
        query: trend([ev('share_report_clicked'), ev('report_viewed')]),
      },
      {
        name: 'Report views by referring domain',
        description:
          'Which sites are actually hosting links to shared reports. This is the closest thing to a live backlink feed, and it updates far sooner than GSC.',
        query: trend([ev('report_viewed')], { breakdown: '$referring_domain', display: 'ActionsBarValue' }),
      },
      {
        name: 'Validations completed',
        description:
          'The core value event. Cross-check against the anonymous /bench aggregate (n) — they should grow together.',
        query: trend([ev('validation_completed')]),
      },
      {
        name: 'Fixes applied and GUIDs repaired',
        description: 'Depth of use: people who fix things came back for the tool, not the page.',
        query: trend([ev('issue_fix_applied'), ev('guid_fixed')]),
      },
      {
        name: 'Failed file opens',
        description:
          'Friction. A spike here alongside flat validations means people are arriving and bouncing off a broken parse, which no SEO metric will surface.',
        query: trend([ev('file_opened'), ev('file_open_failed')]),
      },
      {
        name: 'Model exports by format',
        description: 'IFC vs GLB. export_clicked carries `format`; the other deliverables are their own events (see the next tile).',
        query: trend([ev('export_clicked')], { breakdown: 'format' }),
      },
      {
        name: 'Deliverables taken away',
        description:
          'COBie, IDS and certificates are separate events, not export_clicked variants. Someone who leaves with a deliverable is the closest thing to a converted user.',
        query: trend([ev('cobie_exported'), ev('ids_export'), ev('certificate_issued'), ev('delivery_report_generated')]),
      },
    ],
  },
]

// ── API plumbing ──────────────────────────────────────────────────────────────

async function api(path, body) {
  const res = await fetch(`${HOST}/api/projects/${PROJECT_ID}${path}`, {
    method: 'POST',
    headers: {
      Authorization:  `Bearer ${API_KEY}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify(body),
  })
  const text = await res.text()
  if (!res.ok) {
    throw new Error(`POST ${path} → ${res.status}\n${text.slice(0, 600)}`)
  }
  return JSON.parse(text)
}

async function main() {
  if (DRY_RUN) {
    for (const d of DASHBOARDS) {
      console.log(`\n▸ ${d.name} — ${d.tiles.length} tiles`)
      d.tiles.forEach((t) => console.log(`    · ${t.name}`))
    }
    console.log(`\nDry run only. ${DASHBOARDS.reduce((n, d) => n + d.tiles.length, 0)} insights across ${DASHBOARDS.length} dashboards.`)
    return
  }

  let created = 0
  let failed  = 0

  for (const def of DASHBOARDS) {
    const dash = await api('/dashboards/', { name: def.name, description: def.description })
    console.log(`\n▸ ${def.name}  →  ${HOST}/project/${PROJECT_ID}/dashboard/${dash.id}`)

    for (const tile of def.tiles) {
      try {
        await api('/insights/', {
          name:        tile.name,
          description: tile.description,
          query:       tile.query,
          dashboards:  [dash.id],
        })
        console.log(`    ok  · ${tile.name}`)
        created++
      } catch (err) {
        // One bad tile should not lose the rest of the board.
        console.log(`    FAIL· ${tile.name}\n          ${err.message.split('\n')[0]}`)
        failed++
      }
    }
  }

  console.log(`\n${created} insights created, ${failed} failed.`)
  if (failed > 0) {
    console.log('A failed tile usually means the event name or breakdown property does not exist yet in this project.')
    process.exit(1)
  }
}

main().catch((err) => {
  console.error(`\n${err.message}`)
  process.exit(1)
})
