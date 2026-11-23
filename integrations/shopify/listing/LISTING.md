# Shopify App Store listing copy (not submitted)

Plan table and feature list follow `FEATURE_TIERS` in `integrations/shopify/build-extension.mjs`.
Keep every claim checkable on a development store; no comparisons with named apps.

## Name

IFC Viewer Online — 3D BIM models

## Tagline (≤ 62 characters)

Sell the model, not a picture of it.

## Introduction (≤ 100 characters)

Interactive IFC (BIM) models on product pages, opened in the buyer's browser.

## Description

Building products are bought by architects, engineers and contractors who work in
BIM. Give them the model itself on the product page, not a render.

- **One block for the whole catalogue.** Each product and each variant shows its own
  IFC model from a metafield; switching the variant switches the model.
- **Fast pages.** The viewer loads on click or when scrolled into view, over the
  product image. The file is opened by the visitor's browser, not by a server.
- **What specifiers check.** Download link for the IFC, technical data from your
  metafields, element data, rooms and key specs, and the file's Health Score.
- **Fits your theme.** Blocks inherit the theme's font and colours and can go in any
  section or column. Storefront texts in 10 languages: English, Spanish, Catalan,
  German, French, Italian, Portuguese, Japanese, Chinese (Simplified) and Thai. Theme editor settings in the same languages except Japanese and
  Thai, which show the settings in English (Shopify caps each locale file at 15 KB).
- **Setup check in the theme editor.** Shows, per block, whether the model URL is
  reachable, its size and IFC schema, and which metafields are missing. Buyers never see it.

## Plans

| Plan | Price | Blocks |
|---|---|---|
| Free | $0 | Product IFC model (per product and variant), poster image, IFC download, specs table, rooms and key specs, model explorer, camera views, product structured data (JSON-LD) |
| Starter | $9/month, 14-day trial | Everything in Free, plus element details, quote / lead requests, downloads for customers only, Health Score badge, extra download formats (GLB, CSV, extra files), quantities table, guided tour, plan set and licence, compatibility (schema, authoring app, file weight), floor plan view with preview mode, view in your space (AR), classification (Uniclass / OmniClass / MasterFormat), per-variant 3D views (camera, highlighted elements, shareable view links) |
| Business | $29/month | Everything in Starter, plus takeoff / bill of quantities with steel by profile and CSV, sales impact kit, bulk import, EPD and product passport readiness, sun and lot fit, NBS / IDS compliance self-check |

How a shop gets its plan: the `ifcvo.plan` app metafield if set; otherwise a licence
key pasted in the shop metafield `ifcvo.license` (signed for the shop's
`*.myshopify.com` domain, with an expiry date); otherwise Free. In the theme editor a
block that needs a higher plan shows a note naming that plan; visitors see nothing.

After the sale (UI extensions, hosted by Shopify, no app server):

| Plan | After-sale features |
|---|---|
| Free | **Thank you and Order status block:** the bought product's model and files, plus an "Open in 3D" link to the product page |
| Starter | Add-on cards in that block (`ifcvo.addons`, tagged `_ifcvo_touch`), plus a **"My models & files"** page in the customer account. The page lists every bought model and file, with version, updated date and a "New version" badge |

These extensions are not gated yet, because UI extensions cannot read the theme's
licence key. A block setting turns add-ons off. "My models & files" and the Order
status blocks need the new customer accounts.

Notes for the submission form:
- The app has one theme app extension with all 20 blocks (Shopify allows one per app).
  It also has two UI extensions: `ifc-order-files` (Thank you and Order status) and
  `ifc-my-models` (a customer account page). They use the scopes `customer_read_orders`
  and `unauthenticated_read_product_listings`. Reading orders needs protected customer
  data access at level 1, so request it in the Partner Dashboard before review.
- Free is intended for 1–3 products. The product count is not enforced until the app
  has billing; until then Free is limited by features only.
- Loading, the IFC download, error messages and accessibility are never limited by plan.
- The compliance and product passport blocks are self-checks and readiness guides;
  they do not certify a product.

## Category

Store design → Product display / 3D & AR.

## Links

- Privacy policy: https://www.ifcvieweronline.eu/privacy
- Support: the contact in https://www.ifcvieweronline.eu/terms
- Metafield guide: `integrations/shopify/app/METAFIELDS.md`

## Images

`listing/` (icon 1200×1200, feature image and screenshots 1600×900), made by
`node integrations/shopify/listing/make-assets.mjs`.
