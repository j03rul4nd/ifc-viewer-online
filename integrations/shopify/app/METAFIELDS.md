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

Blocks that read only the 3D model and need no metafield: IFC element details,
IFC model explorer, IFC views and tour, IFC Health Score, IFC plan view, IFC sun & lot fit.

All URLs must start with `https://`. Files on your own server need
`Access-Control-Allow-Origin` (`*` or the shop's domain); files uploaded to
**Content → Files** already work. The setup check tests both.

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
| the keys of the `LABELS` table in `extensions/ifc-data/assets/ifcvo-<block>.js` (rooms, takeoff, classification, compat, specs) or `extensions/ifc-plans/assets/ifcvo-<block>.js` (dpp, compliance, ar, sunlot, planview) | that block |
| `quote.title`, `quote.pick`, `quote.cart`, `quote.contact`, `quote.empty`, `quote.qty`, `quote.remove`, `quote.full`, `quote.no_form`, `quote.filled`, `quote.added`, `quote.error`, `quote.intro`, `quote.element`, `quote.product`, `quote.variant`, `quote.page` | IFC element details (quote list) |
| `downloads.making`, `downloads.made`, `downloads.makeError`, `downloads.noViewer`, `downloads.noGlb` | GLB / CSV buttons |

```json
{
  "en": { "quote.contact": "Ask for a price" },
  "es": { "quote.contact": "Pedir precio", "loading": "Cargando la maqueta 3D" }
}
```

### `ifcvo.plan` (app metafield)

Written by the app when billing exists (`free` \| `starter` \| `business`). Until
then it is empty and every block runs as `business`. Merchants do not edit it.

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
