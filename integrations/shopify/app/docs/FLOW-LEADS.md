# Leads without a server: gated downloads, "email me this model", warm viewers

Everything below runs on Shopify's own forms, customer tags and cart attributes.
The app has no backend and sends nothing to any host other than the store.

## 1. Gated downloads (Starter, T-325 G5)

Block **IFC downloads** → *Show the downloads to*:

| Option | Guest sees | Logged-in customer sees |
|---|---|---|
| Everyone | the files | the files |
| Logged-in customers only | "Create a free account to download the files" | the files |
| Customers with a tag (e.g. `trade`) | the register link | the files if tagged, else "Downloads for trade accounts…" |
| Buyers | "Bought it? Your files are in your account." | same (files in *My models & files*, T-326 F2) |

The register link is `/account/register?return_url=<product>`: the visitor comes back to
the product page, and Shopify's register form carries its own marketing consent.
Each click publishes the customer event `ifcvo_download` with `gated: true`.
Works with JavaScript off (Liquid `customer` checks). **This hides links; it is not
DRM**: anyone with a file URL can download it.

## 2. "Email me this model" (Starter, T-326 F1)

Block **IFC: email me this model** renders Shopify's native customer form with the
hidden tags `ifc-spec-request,ifc-interest:<product handle>` and an unchecked
marketing-consent box (unchecked = not subscribed).

Flow recipe (Shopify Flow, free):
1. Trigger **Customer tags added**.
2. Condition: added tags contain `ifc-spec-request`.
3. Action **Send marketing email** (Shopify Email) or **Send internal email**, with
   the spec-sheet PDF link and the product URL (tag `ifc-interest:<handle>` says which).

To verify on a dev store: submit the form, open Customers, check both tags and that
email marketing is "Not subscribed" when the box was left empty.

## 3. Warm viewers (Business, off by default, T-326 F7)

Same block, setting **Tag warm viewers**. The browser counts model opens per product
in `localStorage`. On the third open, and only if
`Shopify.customerPrivacy.marketingAllowed()` is true:
- logged-in customer → tag `ifc-warm:<handle>` once (native customer form, same origin);
- guest → cart attribute `_ifc_views` (`handle:opens,…`), visible on abandoned
  checkouts and orders.

Segment: `customer_tags CONTAINS 'ifc-warm:<handle>' AND products_purchased(id: <id>) = false`.
Flow: trigger **Scheduled time** (weekly) → **Get customer data** with that segment
query → **Send marketing email**. Price drops have no native trigger: send those
manually to the segment.

Privacy text for the store's policy: "If you agree to marketing cookies, we note how
often you open a product's 3D model on this device and may tag your customer account
so we can follow up on that product."

## Known limits

- `contact[tags]` on the customer form is how Dawn-style newsletter forms tag
  customers, but shopify.dev does not document it. Spike on a dev store before
  announcing; fallback is the cart attribute only.
- Shopify may show a captcha on customer forms; the background tag request of
  warm viewers then fails silently (nothing breaks, no tag).
