# Recipe: review request that opens the 3D model (Shopify Flow, no app server)

Starter plan. For high-ticket products: 14 days after delivery the buyer gets an
email asking for a review, with a link that opens the product page with the 3D
viewer at its hero view, next to the reviews app you already use. The app does not
host or collect reviews.

## 1. The hero view (optional)

Add `"hero"` to the product's `ifcvo.views` metafield, for example
`{"hero":{"position":[8,6,8],"target":[0,1,0]}}` or `{"hero":"iso"}`. Without it the
link opens the viewer at the block's starting view. See `app/METAFIELDS.md`.

## 2. The workflow

The app ships no Flow trigger or action of its own (those need a server). Build it in
**Apps → Flow → Create workflow** with Shopify's native steps:

1. **Trigger:** `Order fulfilled`.
2. **Condition (optional):** `Order / Line items / Product / Tags` includes `ifc-review`
   (tag the products you want reviews for).
3. **Action:** `Wait` → 14 days.
4. **Action:** `Add customer tags` → `ifc-review-due`.

Then in **Marketing → Automations** (or Shopify Email) create an automation for
customers who get the `ifc-review-due` tag. In the email, link each product as:

```
https://<your-shop>/products/<handle>?utm_source=ifc_review#ifc-review
```

`#ifc-review` opens the viewer, scrolls to it and turns the camera to the hero view.
Put your reviews app's widget next to the Product IFC model block in the theme.

## Notes
- On the Free plan the `#ifc-review` part is ignored: the page opens normally.
- Flow and Shopify Email availability depends on the merchant's Shopify plan; email
  volume beyond the free quota is billed by Shopify to the merchant.
- Nothing runs until the merchant turns the workflow and the automation on.
- A ready-to-import `.flow` file is exported from a working workflow on a store
  (Flow → workflow → Export); it is not written by hand here.
