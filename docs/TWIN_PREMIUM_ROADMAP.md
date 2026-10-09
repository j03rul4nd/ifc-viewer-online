# Digital twin — what needs a server (premium roadmap, not built)

**Status: documentation only.** Nothing here is implemented, and none of it should be
before the paid tier exists. Everything the digital-twin features do today runs in the
visitor's browser ([`DIGITAL_TWIN_PLATFORM.md`](DIGITAL_TWIN_PLATFORM.md)). This page
lists the things a browser *cannot* do, why, and how each would sit on the paid-account
backbone that already exists: the `ifc-cloud-api` Worker, Supabase EU and Clerk, in
phases F0–F6 of [`CDE_ROADMAP.md`](CDE_ROADMAP.md). Model bytes stay under
[D-27](../DECISIONS.md).

## The rule

- **Free, and staying free.** The following all work in the visitor's own browser at
  no cost to anyone:
  - every connector and live layer, while a tab is open;
  - local history in IndexedDB;
  - local alerts with sound and system notifications;
  - scenes as files or links;
  - the SDK, embeds, and a proxy the user runs themselves.
- **Paid, with a server.** Only what needs to run when no tab is open, to keep a
  secret, to store something for a team, or to reach a source that blocks browsers.
  Never a free feature moved behind a wall.

## Candidates

| # | Feature | Why a browser cannot | Sketch | Size |
|---|---|---|---|---|
| 1 | **Managed proxy for non-CORS sources.** Renfe GTFS-RT, SCT incidents, ACA gauges, Barcelona itineraries ([`CITY_DATA_SOURCES.md`](CITY_DATA_SOURCES.md) §2) | The provider sends no CORS headers | A Worker route with a fixed **host allowlist** (never an open proxy). It caches for the provider's TTL, sets per-account quotas and strips cookies. Only a source's licence decides whether it can be listed: redistribution terms must allow it | S |
| 2 | **History while nobody is watching** | The recorder only runs while a tab is open | A scheduled Worker polls a scene's sources and devices and writes compact time series to Postgres. Retention is set per plan. The time bar reads it alongside local frames | M |
| 3 | **Alerts by email, webhook, Teams or Slack** | A closed tab evaluates no rules | Same poller as #2. Rules are evaluated server-side with the same `alerts.ts` / `devices.ts` code, built for the Worker. Delivery goes through Resend or webhooks. Alert history goes in the existing `AuditLog` pattern | M |
| 4 | **Vault for private keys** (TMB, a city's sensor API) | A key in a scene, a link or a page is a public key | Keys are stored encrypted per workspace. The proxy (#1) signs requests on behalf of the scene, so the scene shares a reference and never the key. Today keys stay on the device that typed them, and exports strip them | M |
| 5 | **Saved and team scenes** | A link holds about 16 000 characters. A file has no owner, versions or access control | `Scene` rows (the `ifc-viewer-scene` v1 document as JSON) with versions, a workspace and roles. They get stable URLs, private embeds with signed tokens, and are opened through `?scene=` like any hosted file | M |
| 6 | **Model storage for scenes** | A scene can only carry models that sit at public URLs with CORS | Upload to account storage (R2, D-27 terms). Signed, expiring URLs go into the scene. This connects to the "storage" value of the paid tier | M |
| 7 | **Push ingestion (IoT)**: webhook, MQTT bridge | A page cannot receive a webhook or speak MQTT over TCP | An ingestion endpoint per workspace writes to #2 and fans out over WebSocket. The twin already reads WebSocket device sources | L |
| 8 | **Scheduled reports** | Nothing runs on a schedule in a closed tab | A weekly PDF or CSV of alerts and states, built from #2 and #3 | S |
| 9 | **Heavy tiling** (very large GeoJSON or city meshes to tiles) | CPU and memory beyond what a browser tab can count on | Container jobs under F6 / D-27 only (opt-in, paid, short retention) | L |

**Order, if the paid tier is built:** 1 → 5 → 2 → 3 → 4 → 6 → 8 → 7 → 9. Items 1 and 5
reuse what is already shipped (Worker routes, the scene format). Items 2 and 3 are the
first features with recurring value for an operator.

## What must stay true

- **The scene format stays the contract.** A saved scene exports to a file that opens
  free, minus what only the account can reach.
- **No key reaches a page**, ever, in any plan.
- **The free twin is not degraded.** Local history, local alerts and links keep working
  without an account.
- **Server-side polling respects each provider's quota and terms.** One server polling
  for many users is a different use from many browsers. For example, FGC's
  Opendatasoft limit is 5 000 requests a day per IP. Check each licence before listing
  a source.
