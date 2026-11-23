# Shopify

Two ways to put IFC Viewer Online on a Shopify store.

## 1. Copy-paste sections (free, works today)

1. In the Shopify admin, open **Online Store → Themes → … → Edit code**.
2. Under `sections/`, add `ifc-viewer.liquid` and/or `tracking-globe.liquid` from this folder.
3. In the theme editor, **Add section → 3D IFC model** (or **Tracking globe**).
4. For the viewer, upload the `.ifc` in **Content → Files**, copy its link and paste it
   into **IFC file link**. Several links separated by commas load as one federated model.

| Setting | Viewer parameter |
|---|---|
| IFC file link / Scene link | `model` / `scene` (https only) |
| Viewer layout | `ui` (`article` by default) |
| Starting view | `view` |
| Show the Health Score | `validate` |
| Show the floor plan | `drawings=plan` |
| Place the model on the map | `map` |
| Language, Accent colour | `lang`, `accent` |

## 2. Theme app extension (for the Shopify App Store)

`app/` is a theme-only Shopify CLI app (no backend, no scopes) with ONE theme app
extension, `app/extensions/ifc-viewer/`, holding all 20 blocks. Shopify allows one theme
app extension per app (a deploy with three failed), at most 100 KB of Liquid in total,
15 KB per locale file and 30 blocks.

Never edit `app/extensions/ifc-viewer/blocks`, `snippets` or `locales` by hand; they are generated:

- `blocks/` and `snippets/` (here) are the readable Liquid sources; the two section files
  above become the `ifc-viewer` and `tracking-globe` app blocks. The extension gets a compact
  copy: no comments, minified schema, no indentation, and short theme-editor keys (`t:k.xxxx`).
- `locales/` holds the full translations. The extension's storefront locales keep only the
  keys its Liquid prints (the no-JS markup); the texts only the scripts need go to
  `assets/ifcvo-i18n-<lang>.json`, grouped as in `i18n-groups.json` and loaded by
  `assets/ifcvo-i18n.js` (the Liquid marks the element with `data-i18n="<group>"`).
- Shopify also rejects a locale file with more than 250 keys. The generator keeps the theme-editor
  keys at SCHEMA_KEY_BUDGET (230-250): it writes some placeholders, headers and info help texts
  in English straight into the block (shortest first; labels and block names stay translated).
  A schema locale that would still pass 15 KB is left out (the editor shows English). Today: none.
- Every known bundle limit, with its source, is a test in scripts/shopify-extensions.test.ts.
- The JS and CSS assets in `app/extensions/ifc-viewer/assets/` are edited in place.

```bash
node integrations/shopify/build-extension.mjs
```

It prints the Liquid total, the largest locale file and the schema locales left out.
`scripts/shopify-extensions.test.ts` checks there is a single extension, the limits, the
locale keys and that a second build changes nothing.

### Product block (app only)

`blocks/product-ifc-viewer.liquid` reads the IFC file
from a product or variant metafield (default `custom.ifc_model`, type URL or file),
so one block in the product template covers the whole catalogue. Changing the
variant swaps the model and the **Download BIM model (IFC)** link. Create the
metafield definition in **Settings → Custom data → Products / Variants**.

- **Fast pages:** the viewer loads on click (default) or when scrolled into view, over
  the product image; until then the block adds no iframe.
- **More downloads:** a list metafield (`custom.bim_files`, files or URLs) adds links
  for RFA, DWG, datasheet PDF and so on.
- **Technical data:** every metafield in the `bim` namespace (width, U-value, fire
  rating…) shows as a table row.
- **Analytics:** publishes the customer events `ifc_viewer_opened` and
  `ifc_model_downloaded` for the store's pixels.

### Blocks outside the 3D scene (app only)

The product block mounts the viewer through the SDK (`assets/ifcvo.js`). Four more
app blocks attach to it and can go in any section or column of the theme:

| Block | What the visitor gets |
|---|---|
| **IFC model explorer** | The elements grouped by IFC class, a search box; click to select and frame, "Only" to isolate a class |
| **IFC element details** | The selected element's class, type, storey, property and quantity sets |
| **IFC views and tour** | Up to four camera buttons and a self-running guided tour with captions |
| **IFC Health Score** | The file's score, errors and warnings, checked in the visitor's browser |

They inherit the theme's font and text colour. Each block has an accent colour (empty
uses the theme's button colour), a corner radius and an optional frame; the viewer
block adds a scene background from presets or two brand colours. With the viewer
set to "Kiosk", the explorer and details blocks replace the viewer's own panels, so
the page follows the store's design instead of the viewer's.

Customer events for the store's pixels: `ifc_viewer_opened`, `ifc_model_downloaded`,
`ifc_element_viewed`, `ifc_tour_started`.

### Listing checklist (not submitted)

Publishing needs a Shopify Partner account (free) and, to list on the App Store, the
one-time app developer registration fee. Per the project rule of no paid listings,
this is **on hold until there is revenue**. What is ready:

- App name: **IFC Viewer Online — 3D BIM models**
- Tagline: Sell the model, not a picture of it.
- Description, plan table and notes: [`listing/LISTING.md`](listing/LISTING.md).
- Plans: Free (viewer, IFC download, specs, rooms, explorer, views; licence keys: `license/sign.mjs`),
  Starter $9/month with a 14-day trial, Business $29/month. The source of truth is
  `FEATURE_TIERS` in `build-extension.mjs`.
- Metafields and shop settings: [`app/METAFIELDS.md`](app/METAFIELDS.md).
- Category: Store design → Product display / 3D & AR.
- Privacy policy: https://www.ifcvieweronline.eu/privacy
- Support: the contact in https://www.ifcvieweronline.eu/terms
- Images: `listing/` (icon 1200×1200, feature image and two screenshots 1600×900), made by `node integrations/shopify/listing/make-assets.mjs`.

To publish (needs Joel's Partner account, which only he can create):

```bash
cd integrations/shopify/app
npm install
npm run check        # Theme Check: passes with no offenses
npm run config:link  # creates the app in the Partner Dashboard, fills client_id
npm run dev          # preview on a development store (free)
npm run deploy       # releases the extension; App Store listing is a separate step
```

Still missing before submitting: a development store test and the fee decision.
