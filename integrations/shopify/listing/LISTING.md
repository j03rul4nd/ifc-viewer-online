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
  German, French, Italian, Portuguese, Japanese, Chinese (Simplified) and Thai.
- **Setup check in the theme editor.** Shows, per block, whether the model URL is
  reachable, its size and IFC schema, and which metafields are missing. Buyers never see it.

## Plans

| Plan | Price | Blocks |
|---|---|---|
| Free | $0 | Product IFC model (per product and variant), poster image, IFC and extra file downloads, specs and quantities, element details, model explorer, camera views, Health Score, rooms and key specs |
| Starter | $4.99/month, 14-day trial | Everything in Free, plus guided tour, plan set and licence, compatibility (schema, authoring app, file weight), floor plan view with preview mode, view in your space (AR), classification (Uniclass / OmniClass / MasterFormat) |
| Business | $19/month | Everything in Starter, plus takeoff / bill of quantities with steel by profile, EPD and product passport readiness, sun and lot fit, NBS / IDS compliance self-check |

Notes for the submission form:
- Free is intended for 1–3 products. The product count is not enforced until the app
  has billing; until then Free is limited by features only.
- Loading, downloads, error messages and accessibility are never limited by plan.
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
