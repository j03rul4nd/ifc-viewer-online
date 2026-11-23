# T-322w — Keep every locale file at ≤250 translation keys

## Objetivo
The real `shopify app deploy` rejected every `locales/*.schema.json`: "Contains 305
translation keys which exceeds the maximum of 250" (ca, de, en.default, es, it, fr,
pt-BR, pt-PT, zh-CN). Bring them under 250, ideally 230, and encode every known
bundle limit in `scripts/shopify-extensions.test.ts`.

## Decisión (amends D-322v)
- The 305 schema strings were already unique (no identical English texts to merge).
- `build-extension.mjs` `keysToInline()` writes some theme-editor texts in English
  straight into the compiled block instead of a t: key, until the count reaches
  `SCHEMA_KEY_BUDGET` (240). Order: placeholders, then headers, then info help texts,
  shortest first. Labels and block names are always translated. Over 250 is a build error.
- Liquid savings to make room: snippets `ifcvo-style`, `ifcvo-runtime` and
  `ifcvo-shop-labels` replace markup repeated in 14–18 blocks.
- Budget 240, not 230: 230 needs 99.0 KB of Liquid (1 KB of headroom); 240 leaves 2.2 KB.
- With fewer keys every schema locale fits in 15 KB, so ja and th are back (none dropped).

## Limits encoded (source)
- shopify.dev theme-app-extensions/configuration, "File and content size limits": 10 MB
  total, 30 blocks, 100 locale files, 15 KB per locale file, 100 KB Liquid (enforced);
  CSS 100 KB and JS 10 KB compressed per schema reference (suggested).
- shopify.dev themes/architecture/locales, "Requirements and limitations": 3400
  translations per locale file, 1000 characters per value.
- Deploy validation 2026-11-23 (not in the docs): one theme app extension per app;
  250 keys per locale file.
- Theme editor schema (settings/input-settings): range ≤ 101 steps, resource-list `limit` ≤ 50,
  unique setting ids.

## Informe
- Keys: every schema locale 240, storefront locales 104. Liquid 97,753 B. Largest locale
  th.schema.json 14,670 B. No schema locale dropped.
