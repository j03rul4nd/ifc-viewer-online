# ROI evidence: did people who opened the 3D model buy more?

This kit lets you compare **add-to-cart and purchase rates for visitors who opened an IFC model with visitors who did not**, in your own Google Analytics 4 (or Meta) account. IFC Viewer Online stores nothing and sends nothing to us. All figures come from your analytics, so we do not supply any numbers ourselves.

What you get:
- a custom pixel (`integrations/shopify/app/pixel/ifcvo-roi-pixel.js`) that adds `ifcvo_opened_model: true|false` to `add_to_cart` and `purchase` events, and forwards the viewer events (`ifcvo_model_loaded`, `ifcvo_download`, ...);
- a "ROI" row in the theme-editor setup check that says whether the pixel has run on this store;
- the GA4 report recipe below.

"Opened the model" means, within the same browser session, the model loaded (`ifcvo_model_loaded`), a file was downloaded (`ifcvo_download`) or the quote button was clicked (`ifcvo_quote_click`). Scrolling past the viewer (`ifcvo_model_viewed`) does not count.

## 1. Install the pixel (5 minutes)

1. Shopify Admin → **Settings → Customer events → Add custom pixel**. Name it `IFC Viewer ROI`.
2. **Permission**: "Required" for analytics (Shopify then runs it only for visitors who accept analytics where consent applies). **Data sale**: "Data collected does not qualify as data sale".
3. In the code box, paste the GA4 loader first (replace `G-XXXXXXX` with your measurement ID):

   ```js
   const s = document.createElement('script')
   s.src = 'https://www.googletagmanager.com/gtag/js?id=G-XXXXXXX'
   s.async = true
   document.head.appendChild(s)
   window.dataLayer = window.dataLayer || []
   function gtag() { dataLayer.push(arguments) }
   gtag('js', new Date())
   gtag('config', 'G-XXXXXXX', { send_page_view: false })
   ```

   This runs inside the pixel's own sandboxed frame, not on your storefront page. Our template itself touches no DOM. For Meta, paste your Meta pixel base code instead (or as well) and set `meta: true` in `IFCVO_CONFIG`.
4. Below it, paste the whole content of `ifcvo-roi-pixel.js`. **Save**, then **Connect**.
5. Open a product with the IFC viewer on the live store, open the model, and add to cart.
6. Back in the theme editor, the setup check's **ROI** row now says "ROI pixel detected". Check GA4 too: **Admin → DebugView** (or Realtime) shows `add_to_cart` with `ifcvo_opened_model = true`. Add to cart in a new private window without opening the model to see `false`.

If you already send `add_to_cart` through the Google & YouTube app, GA4 counts both. Use `ifcvo_opened_model` (only our events carry it) in the comparison, or disable `add_to_cart` in one of the two.

## 2. Register the parameter in GA4

GA4 → **Admin → Custom definitions → Create custom dimension**:
- Dimension name: `IFC model opened`
- Scope: **Event**
- Event parameter: `ifcvo_opened_model`

Data appears from the moment you create it (not retroactively). Allow 24–48 h.

## 3. Segment comparison chart

GA4 → **Explore → Free form** (blank):
1. **Segments → + → Session segment** `Opened IFC model`: condition `add_to_cart` *or* `ifcvo_model_loaded` with parameter `ifcvo_opened_model` = `true`. Simpler alternative: sessions that include the event `ifcvo_model_loaded`.
2. Second session segment `Did not open`: sessions that include `page_view` on product pages and **exclude** sessions with `ifcvo_model_loaded`.
3. Dimensions: `Event name` (and optionally `Item name`). Metrics: `Sessions`, `Event count`, `Add to carts`, `Purchases`, `Purchase revenue`.
4. Drag both segments into **Segment comparisons**, `Event name` into Rows, filter Event name to `add_to_cart`, `purchase`.
5. Visualisation: **Bar chart**. Read it as "sessions that opened a model: X % add to cart; sessions that did not: Y %". Divide `Add to carts` by `Sessions` in each column for the rate.

Quick version without segments: **Reports → Engagement → Events → add_to_cart**, add a secondary dimension `IFC model opened`.

Notes:
- This is a correlation, not proof of cause: buyers who are already interested open models more often. For a fairer test, compare the same products before and after you added the viewer.
- Small stores need a few hundred sessions per segment before the difference means anything.

## 4. Shopify's own reports (ShopifyQL)

Custom pixels cannot write to Shopify, so ShopifyQL and Shopify Analytics do **not** see `ifcvo_opened_model`. What you can do in Shopify: compare conversion of products with and without the viewer, or before and after the install date, e.g.

```
FROM sales SHOW net_sales, orders BY product_title SINCE -90d UNTIL today
```

and the "Sessions by landing page" / "Conversion rate" reports per product. The per-visitor split lives in GA4 or Meta only.

## 5. Privacy

- No names, emails, addresses, phone numbers, client ids or order ids are forwarded: only event names, product/variant ids, value, currency, quantity, file name and the flag.
- The flag lives in the pixel's session storage and ends with the browser session.
- A first-party cookie `_ifcvo_px` (timestamp, 24 h) lets the theme-editor setup check see that the pixel ran. It holds no identifier.
- Shopify's customer privacy settings and your consent banner decide whether the pixel runs. List GA4/Meta in your privacy policy as you already do for them.
