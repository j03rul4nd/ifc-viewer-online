# Metafields used by the IFC Viewer Online blocks

Every metafield is optional unless a block says otherwise. Create the product and
variant definitions in **Settings → Custom data → Products / Variants**; the shop
ones in **Settings → Custom data → Shop** (or with the GraphQL snippet below).
Namespaces are block settings: the defaults are `custom` (files and licences) and
`bim` (product data). If you change a namespace in a block, use the same one here.

In the theme editor every block reports what it found in the **IFC Viewer Online
setup check** panel (bottom right; only you see it, buyers never do).

Plans come from `FEATURE_TIERS` in `integrations/shopify/build-extension.mjs`:
**Free** (viewer, downloads, specs, element details, explorer, views, Health Score,
rooms), **Starter** (+ tour, plan set, compatibility, plan view, AR, classification),
**Business** (+ takeoff/BOQ, EPD and product passport, sun and lot fit, compliance).

## Product and variant metafields

| Namespace.key | Owner | Type | Example | Block | Plan |
|---|---|---|---|---|---|
| `custom.ifc_model` | product, variant | URL or file | `https://cdn.shopify.com/s/files/…/chair.ifc` | Product IFC model, IFC downloads, IFC plan set (variant) | Free |
| `custom.ifc_size_mb` | product | decimal number | `12.4` | Product IFC model (heavy-file warning) | Free |
| `bim.ifc_size_mb` | product | decimal number | `12.4` | IFC compatibility (file weight) | Starter |
| `custom.ifc_poster` | product | file (image) or URL | poster PNG | Product IFC model (image before the 3D opens) | Free |
| `custom.bim_files` | product | list of files or list of URLs | RFA, DWG, datasheet PDF | Product IFC model, IFC downloads (key is the "More files" setting) | Free |
| `bim.*` (any key) | product | any single value | `u_value` = `1.1 W/m²K` | IFC specs & quantities, Product IFC model (technical data table, JSON-LD) | Free |
| `bim.area` | product | single line text or number | `142 m²` | IFC rooms & key specs | Free |
| `bim.storeys` | product | integer | `2` | IFC rooms & key specs | Free |
| `bim.bedrooms` | product | integer | `3` | IFC rooms & key specs | Free |
| `bim.bathrooms` | product | integer | `2` | IFC rooms & key specs | Free |
| `bim.dimensions` | product | single line text | `12.0 × 9.5 m` | IFC rooms & key specs | Free |
| `custom.license_type` | variant | single line text | `Single-build license` | IFC plan set & license | Starter |
| `custom.license_terms` | variant | multi-line text | what the buyer may do | IFC plan set & license | Starter |
| `custom.plan_set` | variant | JSON or list of single line text | `[{"name":"Floor plans","format":"PDF","count":4,"size":"2.1 MB"}]` or `Floor plans\|PDF\|4\|2.1 MB` | IFC plan set & license | Starter |
| `bim.compatible_with` | product | list of single line text (or one per line) | `Revit 2024`, `Archicad 27` | IFC compatibility | Starter |
| `custom.ar_usdz` | product | file or URL | `chair.usdz` (iPhone / iPad) | IFC view in your space (AR) | Starter |
| `custom.ar_glb` | product | file or URL | `chair.glb` (Android) | IFC view in your space (AR) | Starter |
| `bim.classification` | product | list of single line text (or one per line) | `Uniclass 2015: Pr_30_59_24_32 Kitchen units` | IFC classification | Starter |
| `bim.boq` | product | multi-line text | one line per item, shown before the model loads | IFC takeoff / BOQ | Business |
| `bim.unit_prices` | product | JSON | `{"IfcBeam":{"price":12.5,"per":"m"},"Concrete":180}` | IFC takeoff / BOQ (indicative total, never a quote) | Business |
| `bim.gwp_a1a3` | product | decimal or text with unit | `24.6` | IFC EPD and product passport | Business |
| `bim.gwp_total` | product | decimal or text with unit | `31.2` | IFC EPD and product passport | Business |
| `bim.gwp_unit` | product | single line text | `kg CO₂e` (default) | IFC EPD and product passport | Business |
| `bim.energy` / `bim.energy_unit` | product | decimal / text | `410` / `MJ` | IFC EPD and product passport | Business |
| `bim.water` / `bim.water_unit` | product | decimal / text | `0.8` / `m³` | IFC EPD and product passport | Business |
| `bim.declared_unit` | product | single line text | `1 m²` | IFC EPD and product passport | Business |
| `bim.epd_programme` | product | single line text | `EPD International` | IFC EPD and product passport | Business |
| `bim.epd_number` | product | single line text | `S-P-01234` | IFC EPD and product passport | Business |
| `bim.epd_valid_until` | product | date | `2029-05-31` | IFC EPD and product passport | Business |
| `bim.epd_url` | product | URL (https) | link to the EPD PDF | IFC EPD and product passport | Business |
| `bim.dop_url` | product | URL (https) | link to the declaration of performance | IFC EPD and product passport | Business |
| `bim.ce_marking` | product | single line text | `CE 0123, EN 14351-1` | IFC EPD and product passport | Business |
| `bim.instructions_languages` | product | single line text | `en, es, de, fr` | IFC EPD and product passport | Business |
| `bim.substances_of_concern` | product | multi-line text | `None above 0.1 % w/w` | IFC EPD and product passport | Business |
| `bim.gtin` | product | single line text | `08412345678905` (else the first variant's barcode) | IFC EPD and product passport | Business |
| `bim.manufacturer_contact` | product | multi-line text | name and postal or web address | IFC EPD and product passport | Business |
| `bim.ids_url` | product | URL (https) or file | `requirements.ids` | IFC compliance (the block setting wins) | Business |
| `ifcvo.views` | product, variant | JSON | `{"hero":"iso","base-frame":{"position":[8,6,8],"target":[0,1,0]}}` (a value is a preset `iso`/`top`/`front`/…, `{position,target}` or `"x,y,z,tx,ty,tz"`) | Product IFC model: saved views that links open with `#ifcvo-view=<id>` (assembly steps) and `#ifc-review` (id `hero`) | Free (review link: Starter) |

Blocks that read only the 3D model and need no metafield: IFC element details,
IFC model explorer, IFC views and tour, IFC Health Score, IFC plan view, IFC sun & lot fit.

**IFC: compare variants** (Starter) needs no metafield of its own: it compares the
variants whose `custom.ifc_model` differ (at least two), read from the Product IFC
model block on the same page.

### Links that open the viewer

The Product IFC model block reads these URL hash parts (any that do not parse are
ignored): `#ifcvo-open=1` (open now), `ifcvo-v=<version>` ("Updated since your
purchase" when it differs from `ifcvo.version`), `ifcvo-view=<id>` (a saved view of
`ifcvo.views`, a preset name or six numbers), `#ifc-review` (opens at the `hero`
view, else the block's starting view; Starter; see `listing/recipes/review-request-flow.md`),
and the "Share this view" parts `ifcvo-cam`, `ifcvo-sel`, `ifcvo-lvl`.

All URLs must start with `https://`. Files on your own server need
`Access-Control-Allow-Origin` (`*` or the shop's domain); files uploaded to
**Content → Files** already work. The setup check tests both.

## After the sale: Thank you, Order status and "My models & files"

Two UI extensions, hosted by Shopify and with no app server, read these product
and variant metafields through the Storefront API:
- `ifc-order-files` is a block for the **Thank you** page and the **Order status** page.
- `ifc-my-models` is a **customer account page**, plus an Order status block that links to it.

The namespace is fixed. UI extensions declare their metafields in their TOML, so the
namespace cannot be a setting. The `custom.*` keys used by the theme blocks are the fallback.

| Namespace.key | Owner | Type | What it does | Plan |
|---|---|---|---|---|
| `ifcvo.model` (else `custom.ifc_model`) | product, variant | file or URL | The model file, listed first | Free |
| `ifcvo.files` (else `custom.bim_files`) | product, variant | list of files, list of URLs, or one URL per line | Other downloads, such as plans, RFA or PDF | Free |
| `ifcvo.version` | product, variant | single line text | Shows "Version 2.1"; added to the Open in 3D link as `ifcvo-v` | Starter (My models & files) |
| `ifcvo.updated_at` | product, variant | date | "Updated on …" date. If empty, the date the model metafield was last changed. When it is later than the order date, the item shows a **New version** badge | Starter (My models & files) |
| `ifcvo.addons` | product | list of product references | Add-on cards on the Thank you page and the Order status page. Each card links to `/cart/<variant>:1?attributes[_ifcvo_touch]=…_addon` | Starter |
| `ifcvo.release_notes` | product, variant | multi-line text | "What changed", shown under the **New version** badge (only to buyers who ordered before the release) | Starter |
| `ifcvo.handover` | product, variant | list of files, list of URLs, or one URL per line | Handover pack in My models & files: as-built IFC, manuals, certificates. A file list, never a ZIP | Business |
| `ifcvo.assembly_views` | product, variant | JSON | Assembly steps, in order: `[{"title":"Base frame","view":"<saved view id>","note":"..."}]` (or a list of titles). Each step has Previous / Next and opens the product page with `#…&ifcvo-view=<id>` | Business |
| `ifcvo.warranty_months` | product, variant | integer (1–600) | "Warranty until <order date + months>", computed on the calendar (no timezone shift; 31 Jan + 1 month = 28 Feb) | Business |

**Publish a new version.** The app has no Admin API access, so the merchant sets
`ifcvo.version`, `ifcvo.updated_at` and `ifcvo.release_notes` on the product by hand
(product page → Metafields) or in bulk with the CSV builder (`/shopify/bulk/`, mapping
columns `SKU,model_url,poster_url,files,version,release_notes`; a version also sets
`updated_at` to today). Upload the new files first. If a variant has its own
`ifcvo.version` / `ifcvo.updated_at`, the variant value still wins, so edit the variant
too. Follow-up email and maintenance Flow: `listing/recipes/`.

The variant value wins over the product value. An item is shown only when it has
a model or at least one file.

**Storefront access is required.** UI extensions read metafields through the
Storefront API, so every definition above needs **Storefronts: read** turned on
(`access: { storefront: PUBLIC_READ }`). Without it the blocks show nothing.

"Open in 3D" goes to the product page with the bought variant:
`?variant=<id>&utm_source=ifc_thankyou|ifc_order_status|ifc_account#ifcvo-open=1&ifcvo-v=<version>`.
The extensions cannot run WebGL, so they show no 3D themselves.

**Plans.** These UI extensions do not read the plan yet, so they
are **not gated** for now. The merchant can turn add-ons off with the block setting
"Show add-ons" in the checkout and accounts editor. The plans above are what the
listing promises once billing exists.

**Customer accounts.** "My models & files" and the Order status blocks need the
**new customer accounts**. The Thank you block works on every store.

```graphql
mutation {
  model: metafieldDefinitionCreate(definition: {
    name: "IFC model", namespace: "ifcvo", key: "model", ownerType: PRODUCT, type: "file_reference",
    access: { storefront: PUBLIC_READ }
  }) { createdDefinition { id } userErrors { field message } }
  files: metafieldDefinitionCreate(definition: {
    name: "IFC files", namespace: "ifcvo", key: "files", ownerType: PRODUCT, type: "list.file_reference",
    access: { storefront: PUBLIC_READ }
  }) { createdDefinition { id } userErrors { field message } }
  version: metafieldDefinitionCreate(definition: {
    name: "Model version", namespace: "ifcvo", key: "version", ownerType: PRODUCT, type: "single_line_text_field",
    access: { storefront: PUBLIC_READ }
  }) { createdDefinition { id } userErrors { field message } }
  updated: metafieldDefinitionCreate(definition: {
    name: "Model updated", namespace: "ifcvo", key: "updated_at", ownerType: PRODUCT, type: "date",
    access: { storefront: PUBLIC_READ }
  }) { createdDefinition { id } userErrors { field message } }
  addons: metafieldDefinitionCreate(definition: {
    name: "Add-ons after purchase", namespace: "ifcvo", key: "addons", ownerType: PRODUCT, type: "list.product_reference",
    access: { storefront: PUBLIC_READ }
  }) { createdDefinition { id } userErrors { field message } }
  notes: metafieldDefinitionCreate(definition: {
    name: "Release notes", namespace: "ifcvo", key: "release_notes", ownerType: PRODUCT, type: "multi_line_text_field",
    access: { storefront: PUBLIC_READ }
  }) { createdDefinition { id } userErrors { field message } }
  handover: metafieldDefinitionCreate(definition: {
    name: "Handover pack", namespace: "ifcvo", key: "handover", ownerType: PRODUCT, type: "list.file_reference",
    access: { storefront: PUBLIC_READ }
  }) { createdDefinition { id } userErrors { field message } }
  steps: metafieldDefinitionCreate(definition: {
    name: "Assembly steps", namespace: "ifcvo", key: "assembly_views", ownerType: PRODUCT, type: "json",
    access: { storefront: PUBLIC_READ }
  }) { createdDefinition { id } userErrors { field message } }
  warranty: metafieldDefinitionCreate(definition: {
    name: "Warranty (months)", namespace: "ifcvo", key: "warranty_months", ownerType: PRODUCT, type: "number_integer",
    access: { storefront: PUBLIC_READ }
  }) { createdDefinition { id } userErrors { field message } }
}
```

## Shop metafields

### `ifcvo.config` (JSON)

Shop-wide defaults. A block setting wins over this; this wins over the built-in
defaults. The Product IFC model block is at Shopify's 25-setting limit, so its
browser-made downloads and gate are set **only** here (or use the IFC downloads block).

| Key | Type | Default | What it does |
|---|---|---|---|
| `ui` | string, same values as the block's "Viewer layout" | `article` | viewer layout |
| `view` | string | model's own | starting view |
| `lang` | string | page language | viewer language |
| `accent` | colour | theme button colour | viewer accent |
| `validate` | boolean | `true` | compute the Health Score |
| `grid` | boolean | `true` | `false` hides the floor grid under the model (SDK 1.20) |
| `finish` | `"daylight"` \| `"clay"` | model colours | daylight or neutral clay look (SDK 1.20) |
| `downloadsGlb` | boolean | `false` | Product IFC model: offer a GLB made in the browser |
| `downloadsCsv` | boolean | `false` | Product IFC model: offer a CSV element list made in the browser |
| `downloadsGate` | `"none"` \| `"customer"` \| `"tag"` | `none` | Product IFC model: hide downloads from guests (hides links, does not protect files) |
| `downloadsTag` | string | — | customer tag needed when `downloadsGate` is `tag` |

```json
{ "ui": "article", "validate": true, "downloadsGlb": true, "downloadsCsv": true, "downloadsGate": "customer" }
```

### `ifcvo.labels` (JSON)

Text overrides per language. Lookup: exact locale (`pt-br`), then the language
(`pt`), then `en`, then the app's own translation (10 languages), then English.
Keys are flat per block; the quote list and downloads use a prefix so they never
clash with the viewer texts.

| Keys | Block |
|---|---|
| `loading`, `ready`, `retry`, `open_full`, `error`, `offline`, `too_large`, `no_webgl` | Product IFC model (viewer overlay) |
| the keys of the `LABELS` table in `extensions/ifc-viewer/assets/ifcvo-<block>.js` (rooms, takeoff, classification, compat, specs, dpp, compliance, ar, sunlot, planview) | that block |
| `quote.title`, `quote.pick`, `quote.cart`, `quote.contact`, `quote.empty`, `quote.qty`, `quote.remove`, `quote.full`, `quote.no_form`, `quote.filled`, `quote.added`, `quote.error`, `quote.intro`, `quote.element`, `quote.product`, `quote.variant`, `quote.page` | IFC element details (quote list) |
| `downloads.making`, `downloads.made`, `downloads.makeError`, `downloads.noViewer`, `downloads.noGlb` | GLB / CSV buttons |

```json
{
  "en": { "quote.contact": "Ask for a price" },
  "es": { "quote.contact": "Pedir precio", "loading": "Cargando la maqueta 3D" }
}
```

### `ifcvo.plan` (app metafield)

Written by the billing Worker (`worker/`, D-327) from the shop's Shopify App Pricing
subscription: `free` | `starter` | `business`. Merchants do not edit it; empty means Free.
The theme reads it in Liquid (`app.metafields.ifcvo.plan`), so storefronts never call the Worker.

## Copy-paste definitions (GraphQL Admin API)

Run in **Shopify GraphiQL App** or any Admin API client with `write_metafield_definitions`.
Repeat the product block for each row of the table you need.

```graphql
mutation {
  ifc: metafieldDefinitionCreate(definition: {
    name: "IFC model", namespace: "custom", key: "ifc_model", ownerType: PRODUCT, type: "url"
  }) { createdDefinition { id } userErrors { field message } }
  ifcVariant: metafieldDefinitionCreate(definition: {
    name: "IFC model", namespace: "custom", key: "ifc_model", ownerType: PRODUCTVARIANT, type: "url"
  }) { createdDefinition { id } userErrors { field message } }
  files: metafieldDefinitionCreate(definition: {
    name: "BIM files", namespace: "custom", key: "bim_files", ownerType: PRODUCT, type: "list.file_reference"
  }) { createdDefinition { id } userErrors { field message } }
  size: metafieldDefinitionCreate(definition: {
    name: "IFC size (MB)", namespace: "custom", key: "ifc_size_mb", ownerType: PRODUCT, type: "number_decimal"
  }) { createdDefinition { id } userErrors { field message } }
  area: metafieldDefinitionCreate(definition: {
    name: "Area", namespace: "bim", key: "area", ownerType: PRODUCT, type: "single_line_text_field"
  }) { createdDefinition { id } userErrors { field message } }
  compat: metafieldDefinitionCreate(definition: {
    name: "Opens in", namespace: "bim", key: "compatible_with", ownerType: PRODUCT, type: "list.single_line_text_field"
  }) { createdDefinition { id } userErrors { field message } }
  classification: metafieldDefinitionCreate(definition: {
    name: "Classification", namespace: "bim", key: "classification", ownerType: PRODUCT, type: "list.single_line_text_field"
  }) { createdDefinition { id } userErrors { field message } }
  prices: metafieldDefinitionCreate(definition: {
    name: "Unit prices", namespace: "bim", key: "unit_prices", ownerType: PRODUCT, type: "json"
  }) { createdDefinition { id } userErrors { field message } }
  planSet: metafieldDefinitionCreate(definition: {
    name: "Plan set", namespace: "custom", key: "plan_set", ownerType: PRODUCTVARIANT, type: "json"
  }) { createdDefinition { id } userErrors { field message } }
  shopConfig: metafieldDefinitionCreate(definition: {
    name: "IFC viewer config", namespace: "ifcvo", key: "config", ownerType: SHOP, type: "json"
  }) { createdDefinition { id } userErrors { field message } }
  shopLabels: metafieldDefinitionCreate(definition: {
    name: "IFC viewer labels", namespace: "ifcvo", key: "labels", ownerType: SHOP, type: "json"
  }) { createdDefinition { id } userErrors { field message } }
}
```

Set the shop values (replace the shop id from `{ shop { id } }`):

```graphql
mutation {
  metafieldsSet(metafields: [
    { ownerId: "gid://shopify/Shop/1", namespace: "ifcvo", key: "config", type: "json",
      value: "{\"downloadsGlb\":true,\"downloadsCsv\":true,\"downloadsGate\":\"none\"}" },
    { ownerId: "gid://shopify/Shop/1", namespace: "ifcvo", key: "labels", type: "json",
      value: "{\"es\":{\"quote.contact\":\"Pedir precio\"}}" }
  ]) { userErrors { field message } }
}
```
