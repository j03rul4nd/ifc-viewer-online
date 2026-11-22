# T-322u — Split the Shopify theme app extension into three

## ADR (to append to .orchestra/DECISIONS.md; that file is not tracked in git)

### D-322u (2026-11-22) — Shopify app ships three theme app extensions
- **Context:** Shopify caps a theme app extension at 100 KB of Liquid and 15 KB per locale file. `ifc-viewer` had 158 KB of Liquid; th.json 25.9 KB, th.schema.json 30.2 KB, en.default.schema.json 17.6 KB.
- **Decision:** one app, three extensions: `ifc-viewer` (product viewer + facade/jsonld/noscript/diag/downloads snippets, element details, downloads, variant views, explorer, views, health score, section blocks ifc-viewer + tracking-globe), `ifc-data` (specs, rooms, classification, takeoff, compat), `ifc-plans` (plan set, plan view, AR, compliance, sun-lot, DPP). Full translations move to `integrations/shopify/locales/` (single source). `build-extension.mjs` copies the shared assets (ifcvo.js with TIERS, ifcvo.css, ifcvo-variant.js, ifcvo-events.js, ifcvo-diagnostics.js) and the snippets the other extensions render (ifcvo-diag) from `ifc-viewer`, and cuts each extension's locales to the `'ifcvo.*'` / `t:` keys its Liquid uses (a key ending in `.` keeps its subtree, for `append`-built keys).
- **Consequences:** block handles unchanged, but blocks in ifc-data/ifc-plans now belong to a different extension uid (a store that already added them would have to re-add them; the app is not published). Several copies of ifcvo.js can load on one page; the `window.IFCVO` guard keeps one live runtime. Each extension has its own ifcvo-variant.js module instance. `scripts/shopify-extensions.test.ts` guards the limits, keys, shared copies and idempotency.
- **Sizes after the split:** Liquid ifc-viewer 72.2 KB, ifc-plans 56.5 KB, ifc-data 37.1 KB. Largest locale (minified): ifc-viewer th.schema.json 14.2 KB; ifc-plans th.json 12.6 KB; ifc-data th.json 8.0 KB. No text shortened.

## Informe
See ADR above. No Shopify CLI on this machine: `shopify app build` not run.
