# Recipe: "Your plan was updated" email (Shopify Email, no app server)

Tell everyone who bought a plan that a new version is ready. Uses only Shopify
features; Shopify Email is free up to the monthly quota, then Shopify bills the
merchant (not the app).

## 1. Publish the version
1. Upload the new IFC / PDF files and attach them to the product (`ifcvo.model`, `ifcvo.files`).
2. On the product page: **More actions → Publish new version**. Enter the version,
   the release date (default: today) and what changed.
3. Buyers who ordered before that date see a **New version** badge and the notes in
   **My models & files** (customer account). Storefront data is cached, so allow a
   few minutes.

## 2. Build the segment
Customers → Segments → Create segment, query:

```
products_purchased(id: <PRODUCT_ID>) = true
```

`<PRODUCT_ID>` is the number at the end of the product URL in the admin. To reach
only buyers who agreed to email marketing, add:

```
AND email_subscription_status = 'SUBSCRIBED'
```

Updates about a product the customer bought are usually transactional, but check
the rules in your country before mailing non-subscribers.

## 3. Send the email
Marketing → Create campaign → Shopify Email. Suggested content:

- Subject: `{{ shop.name }}: version <VERSION> of <PRODUCT> is ready`
- Body: what changed (copy the release notes), then a button **See my files**
  linking to the customer account page `My models & files`
  (`https://<shop>/account` then the page in the menu).
- For a paid major revision, add a product block with the upgrade product instead.

Send to the segment from step 2.

## Check on a dev store
1. Place two test orders for the product with two test customers.
2. Create the segment: it must list exactly those two customers.
3. Publish a version dated today: both see the badge; a third customer who orders
   after the release does not.
