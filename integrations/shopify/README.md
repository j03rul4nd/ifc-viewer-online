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

`theme-app-extension/` holds the same two blocks as app blocks, built from the sections:

```bash
node integrations/shopify/build-extension.mjs
```

`scripts/shopify-integration.test.ts` checks the blocks are up to date.

### Listing checklist (not submitted)

Publishing needs a Shopify Partner account (free) and, to list on the App Store, the
one-time app developer registration fee. Per the project rule of no paid listings,
this is **on hold until there is revenue**. What is ready:

- App name: **IFC Viewer Online — 3D BIM models**
- Tagline: Show interactive 3D IFC models and their Health Score on product pages.
- Description: Add a 3D IFC (BIM) model to any page with a theme block. Visitors orbit,
  section and inspect the model in the browser; the file is opened by the visitor's
  browser, not by a server. Federated models, floor plan beside the model, map placement,
  10 languages. Also includes the shipment tracking globe block.
- Category: Store design → Product display / 3D & AR.
- Pricing: Free.
- Privacy policy: https://www.ifcvieweronline.eu/privacy
- Support: the contact in https://www.ifcvieweronline.eu/terms
- Screenshots: reuse `integrations/wordpress/wp-org-assets/screenshot-*.png` (1600×900
  crops) and the icon `icon-256x256.png` (App Store asks for 1200×1200, re-export).

Still missing before submitting: the Shopify CLI app wrapper (`shopify app init`, with
this folder as `extensions/ifc-viewer`), a development store test, and the fee decision.
