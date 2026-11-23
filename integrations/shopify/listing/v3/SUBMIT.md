# Shopify App Store submission: IFC Viewer Online (listing v3)

Everything the Partner / Dev Dashboard form asks for, filled in and within limits.
The owner signs in, pastes, uploads, pays the registration fee and submits.
Checked against Shopify's docs on 2026-11-23 (sources at the end).

## 0. Before you start (cannot be done without the owner's login)

- Sign in to the Partner account / Dev Dashboard that owns the app.
- Pay the one-time registration fee (see **PAYMENT**).
- Fill the emergency developer contact (name, email, phone) in the account settings.
- Create or pick a development store for review, install the app, add the blocks
  (section 4), and set its password (reviewers get it in the testing instructions).
- Record the review screencast (section 5) on that store.
- Request protected customer data access only if the final build still reads orders
  (see Risks). After the "drop write_products" change the app should have no Admin
  API scopes; check `shopify.app.toml` before submitting.
- Choose pricing (section 3) in the Dashboard. See Risk 1 about billing.

## PAYMENT

| What | Amount | When / where | Source |
|---|---|---|---|
| App Store developer registration | **USD 19, one time, per Partner account** | Dev Dashboard → **App Store registration info** step → **Pay now** (add a card first if none is on file). If the account is old enough to be exempt, the button reads **Complete registration** instead and nothing is charged. Pay it before you can submit the listing for review. | shopify.dev/docs/apps/launch/distribution/revenue-share |
| Revenue share | 0% on the first USD 1,000,000 lifetime gross app revenue (counted from 2025-01-01), 15% above | Deducted from app payouts, nothing to pay up front | same page |
| Listing, review, dev store | Free | — | — |

Nothing else is payable to submit. Tax forms (W-8BEN for a non-US individual) and the
payout account are needed before any payout, not before submission.

## 1. Listing fields (English, primary)

| Field | Limit | Text |
|---|---|---|
| App name | 30 chars | `IFC Viewer Online: 3D BIM` (25) |
| App introduction | 100 chars | `Show the real IFC (BIM) model on product pages, so buyers can explore it before they ask for a quote.` (100) |
| App details | 500 chars | see below (≈470) |
| Feature 1 | 80 chars | `Interactive 3D IFC model per product and variant, opened in the buyer's browser` |
| Feature 2 | 80 | `Rooms, specs and quantities read from the model, shown as tables on the page` |
| Feature 3 | 80 | `Buyers select an element in 3D and send a quote request about it` |
| Feature 4 | 80 | `IFC, GLB and CSV downloads, optionally for signed-in customers only` |
| Feature 5 | 80 | `Compare two variants side by side, plan sets with licences, view in AR` |
| Feature 6 | 80 | `After the sale: models and files on the order page and in the account` |
| Search terms (≤5, whole words) | 5 | `IFC` · `BIM` · `3D model viewer` · `building products` · `architects` |
| Category | — | Store design → Product display (3D / AR) |
| Languages of the app UI | — | English, Spanish, Catalan, German, French, Italian, Portuguese, Japanese, Chinese (Simplified), Thai |

App details (EN):

> Building products are bought by architects, engineers and contractors who work in BIM.
> Give them the model itself. One theme block reads each product's IFC file from a
> metafield and opens it in the visitor's browser, on click, so pages stay fast. Add
> blocks for rooms, specifications and quantities read from the model, element quote
> requests, gated downloads that capture leads, variant comparison, plan sets and AR.
> Blocks follow your theme's fonts and colours. No file leaves the browser.

## 2. Spanish listing (custom translation)

Shopify auto-translates the English listing into Spanish (and pt-BR, da, nl, fr, de,
zh-CN, sv); a custom translation overrides it. Paste these under Translations → Spanish.

| Field | Text |
|---|---|
| App name | `IFC Viewer Online: BIM en 3D` (28) |
| Introduction | `Muestra el modelo IFC (BIM) real en la ficha de producto para que lo exploren antes de pedir precio.` (99) |
| Feature 1 | `Modelo IFC en 3D por producto y variante, abierto en el navegador del comprador` |
| Feature 2 | `Estancias, especificaciones y mediciones leídas del modelo, en tablas` |
| Feature 3 | `El comprador elige un elemento en 3D y pide presupuesto sobre él` |
| Feature 4 | `Descargas IFC, GLB y CSV, si quieres solo para clientes registrados` |
| Feature 5 | `Compara dos variantes lado a lado, juegos de planos con licencia y RA` |
| Feature 6 | `Tras la venta: modelos y archivos en el pedido y en la cuenta del cliente` |

App details (ES):

> Los productos de construcción los compran arquitectos, ingenieros y constructoras que
> trabajan en BIM. Dales el modelo. Un bloque del tema lee el IFC de cada producto desde
> un metacampo y lo abre en el navegador del visitante, al hacer clic, así la página
> sigue rápida. Añade bloques de estancias, especificaciones y mediciones leídas del
> modelo, presupuesto por elemento, descargas que captan contactos, comparación de
> variantes, juegos de planos y RA. Se adaptan a las fuentes y colores de tu tema.

## 3. Pricing plans (as configured in `build-extension.mjs` / `listing/LISTING.md`)

Shopify does not allow prices in images; prices go only in these fields.

| Plan | Price | Trial | Plan description (features list) |
|---|---|---|---|
| Free | $0 | — | 3D IFC model per product and variant · poster image · IFC download · specs table · rooms and key specs · model explorer · camera views · product structured data |
| Starter | $9 / month | 14 days | Everything in Free · element details · quote requests · customer-only downloads and lead capture · Health Score badge · GLB / CSV / extra files · quantities · guided tour · plan set and licence · compatibility · floor plan view · AR · classification · per-variant views · compare variants · after-sale add-ons and "My models & files" |
| Business | $29 / month | — | Everything in Starter · takeoff / bill of quantities with CSV · sales impact kit · bulk import · EPD and product passport readiness · sun and lot fit · NBS / IDS self-check |

## 4. URLs and contacts

| Field | Value | Checked |
|---|---|---|
| Privacy policy (required) | https://www.ifcvieweronline.eu/privacy | 200, real page |
| Terms of service | https://www.ifcvieweronline.eu/terms | 200, real page |
| Support email | hola@ifcvieweronline.eu | forwarding address |
| FAQ / docs | https://www.ifcvieweronline.eu/help/ | 200, real page |
| Demo store URL | the review dev store, made public without password if you want buyers to try it | owner |
| Emergency developer contact | owner's name, email, phone | owner |

Do **not** use `/support` or `/contact`: they return the viewer's home page, not a support page.

## 5. Reviewer testing instructions (paste into "Testing instructions")

> No login or 2FA is needed for the app itself; it has no admin screens.
> Store: <dev-store>.myshopify.com, storefront password: <password>.
> 1. Online Store → Themes → Customize → a product template. Add the app block
>    "IFC: product model" to the product information section.
> 2. On a product, set the metafield custom.ifc_model (URL) to
>    https://www.ifcvieweronline.eu/Ifc2x3_Duplex_Architecture.ifc and save.
> 3. Open the product page and click "View in 3D": the model opens in the browser.
> 4. Add the other blocks to the same section to see each feature: Rooms, Quantities,
>    Element data, Request a quote, IFC downloads, Email me this model, Compare
>    variants (needs two variants with custom.ifc_model set to different files, e.g.
>    the Duplex URL above and https://www.ifcvieweronline.eu/models/hotel-vela/BCN-IVO-ZZ-XX-M3-A-0002.ifc),
>    Plan set, View in your space.
> 5. After a test order: the Thank you / Order status page shows the bought model and
>    files; with new customer accounts, Account → "My models & files" lists them.
> The theme editor shows a setup check per block (model reachable, size, schema).
> Screencast: <link>.

Screencast (English, required): 2–4 min, the dev store, steps 1–5 above in order.

## 6. Images: upload mapping

All in this folder, PNG, made by `harness/` from the real blocks and the live viewer.
`harness/render.mjs` renders the extension's own Liquid blocks (with liquidjs and
stand-ins for Shopify-only tags) into a demo product page of a neutral store,
"Atelier Modular"; `harness/shoot.mjs` loads it with the real `assets/*.js`, frames
each model through the SDK and adds one headline. Re-run (from `integrations/shopify`):

```
node listing/v3/harness/serve.mjs . <folder with the owner-supplied Wukang IFC>
LIQUIDJS=file:///<dir>/node_modules/liquidjs/dist/liquid.node.mjs node listing/v3/harness/render.mjs
PW=file:///C:/repo/ifc/node_modules/playwright-core/index.mjs node listing/v3/harness/shoot.mjs
```

Each image carries one short headline over the real page (no prices, ratings,
statistics or trademarks). If review asks for plain UI, the headline can move to the
alt text: drop `frame()` in `shoot.mjs`.

| Slot | File | Alt text |
|---|---|---|
| App icon (1200×1200) | `icon-1200x1200.png` | — |
| Feature image (1600×900) | `feature-1600x900.png` | Interactive 3D IFC model of a historic apartment building, Wukang Mansion |
| Screenshot 1 | `desktop-1-explore.png` | Product page of the Wukang Mansion IFC model in an interactive 3D viewer, next to the rooms and areas read from the model |
| Screenshot 2 | `desktop-2-data.png` | Steel portal frame hall product page with the 3D model and a bill of quantities with steel by profile |
| Screenshot 3 | `desktop-3-quote.png` | Hotel block product page: a curtain wall selected in 3D and a quote form that lists the selected element |
| Screenshot 4 | `desktop-4-downloads.png` | Shanghai Tower model with a downloads block asking guests to create an account, and an email-me-this-model form |
| Screenshot 5 | `desktop-5-compare.png` | Compare variants block with an office tower and a hotel side by side in 3D |
| Screenshot 6 | `desktop-6-planset.png` | Oriental Pearl Tower model with a plan set block listing drawings and model per licence, and a View in your space button |
| Mobile 1–3 (optional) | `mobile-1-explore.png`, `mobile-2-quote.png`, `mobile-3-downloads.png` (900×1600) | Wukang Mansion with its rooms; hotel block quote with a selected curtain wall; World Financial Center with gated downloads |

The screenshots use the shop setting `ifcvo.config = {"grid": false, "finish": "daylight"}`
(no floor grid; IFC colours under soft daylight). That option is new in this PR: it needs the
viewer deployed and SDK 1.20 published and pinned in `assets/ifcvo.js` before a live store shows
it (the images were captured with `LOCAL_APP` pointing the harness at `vite` in this repo).
Until then a store renders the grid and studio light, as before. Set the same config on the
review dev store so the reviewer sees what the screenshots show.

The previous image set is kept in `previous/`. Wukang Mansion is an owner-supplied IFC that is
not public: the harness opens the page on a tiny public file and swaps the Wukang file in through
the SDK (as a visitor dropping a file would); everything else on the page is the real block.

Not made here: a screenshot of the after-sale "My models & files" page. It is a
Shopify customer-account UI extension and only renders inside a real store; capture it
on the dev store after a test order if you want it to replace one screenshot.

## 7. Submission checklist

1. Dev Dashboard → the app → **Distribution** → Shopify App Store.
2. App Store registration info → **Pay now** (USD 19) → confirm.
3. Listing → English: fields from section 1; images from section 6 with alt text.
4. Translations → Spanish: section 2.
5. Pricing: section 3.
6. URLs and contacts: section 4.
7. Testing instructions + screencast link: section 5.
8. Run the pre-submission checks the Dashboard shows (automated checks); fix any red item.
9. **Submit for review.** Review takes days to weeks; answer reviewer emails at the support address.

## Risks before submitting

1. **Billing.** App Store apps must charge through Shopify's Billing API. Today the plan
   comes from the `ifcvo.plan` metafield or an off-platform licence key; selling keys
   outside Shopify will be rejected. Either add Shopify billing (managed pricing in the
   Dashboard is the no-server option) or list the app as free at first.
2. **Scopes and protected data.** If the after-sale extensions still query orders, the
   review needs protected customer data access approved; with zero scopes, check those
   extensions still work.
3. Mobile screenshot size (900×1600) and caption rules are not stated in Shopify's docs;
   if the form rejects them, skip the mobile set. The headline band on each image is
   short and has no prices, claims or statistics.

## Sources

- Listing fields and media: https://shopify.dev/docs/apps/launch/shopify-app-store/best-practices
- Requirements (images, review, screencast, billing): https://shopify.dev/docs/apps/launch/shopify-app-store/app-store-requirements
- Fee and revenue share: https://shopify.dev/docs/apps/launch/distribution/revenue-share
