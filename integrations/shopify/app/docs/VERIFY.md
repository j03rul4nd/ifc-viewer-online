# Manual verification before submitting (Built for Shopify level)

What the automated tests cannot check: real themes, real phones, Lighthouse and the
dev-store flows. Work top to bottom on the development store; tick each box and paste
the numbers into the tables. Takes about two hours.

Automated first (all must be green):

```bash
npx vitest run scripts/shopify-
node integrations/shopify/build-extension.mjs   # prints Liquid bytes; second run changes nothing
cd integrations/shopify/app && npm ci && shopify app build
```

## 1. Themes

Install the app blocks on **Dawn** and on **one non-Dawn free theme** (Sense, Craft, Refresh,
Studio, Taste or Origin; write which one). Use one product with a real IFC
(`custom.ifc_model`), one variant product and one product without a model.

| Check | Dawn | Other theme: ______ |
|---|---|---|
| Product IFC model block: poster, "View in 3D" opens the viewer | [ ] | [ ] |
| No console errors on load and after opening the model | [ ] | [ ] |
| Spec table, JSON-LD and downloads present with JavaScript off (DevTools → Disable JavaScript) | [ ] | [ ] |
| Variant change swaps the model and the download link | [ ] | [ ] |
| Theme editor: setup panel appears, collapses, survives a section reload | [ ] | [ ] |
| Theme editor: "Report a problem" opens a mail with shop, theme, blocks and error code (no customer data) | [ ] | [ ] |
| Theme editor: review prompt appears only after a model loaded; "Not now" hides it for good (reload to check) | [ ] | [ ] |
| Storefront (preview link, not the editor): no setup panel, no review prompt | [ ] | [ ] |
| Block without a model shows nothing to buyers, a note in the editor | [ ] | [ ] |
| Accent colour and corner radius settings apply; empty accent follows the theme button colour | [ ] | [ ] |

## 2. Phones

| Check | iOS Safari (model: ____) | Android Chrome (model: ____) |
|---|---|---|
| Page does not jump while the poster and viewer load | [ ] | [ ] |
| Viewer opens, rotates, pinch-zooms; page still scrolls outside it | [ ] | [ ] |
| Model over the mobile cap shows the "open the full viewer" link instead | [ ] | [ ] |
| AR block: Quick Look (iOS) / Scene Viewer (Android) | [ ] | [ ] |
| Compare: two ~50 MB models side by side, no tab crash, memory returns after closing | [ ] | [ ] |
| No console errors (Safari Web Inspector / chrome://inspect) | [ ] | [ ] |

## 3. Lighthouse (Built for Shopify: at most 10 points lower)

Chrome DevTools → Lighthouse → Mobile, Performance, incognito, same product page.
Run three times each and write the median. "Before" = blocks removed from the template;
"After" = Product IFC model block plus the blocks the listing screenshots show.

| Theme | Before | After | Difference (≤ 10) | CLS after (≤ 0.1) | TBT after |
|---|---|---|---|---|---|
| Dawn | | | | | |
| Other: ______ | | | | | |

Budget the tests already enforce (`scripts/shopify-perf-budget.test.ts`): base scripts on a
product page ≤ 40 KB gzip, each block script ≤ 10 KB gzip, the facade box sized by the server.

## 4. Open dev-store checks

- [ ] **contact[tags] on the customer form.** Quote/leads block with "Also create a customer with
      these tags": submit once; in Customers the new customer has the block's tags (`ifcvo-lead`
      plus the configured ones). Also check the contact mail arrives with Selection/Role/Project.
- [ ] **Bulk CSV import with 3 products.** Build the CSV at `/shopify/bulk/`, import it in
      Products → Import. A `list.url` metafield given as `a; b` must end up as two URLs (check
      `custom.bim_files` on each of the 3 products), and `custom.ifc_model` opens in the block.
- [ ] **Flow recipes.** Import the recipes from `docs/FLOW-LEADS.md` and `docs/FLOW-QUOTE.md`;
      trigger each once (lead form, quote form, warm-viewer tag) and see the run succeed in Flow.
- [ ] **Two 50 MB models on mobile in compare** (see the phones table): note the time to both
      loaded and whether either fails.
- [ ] **Captcha.** Submit the lead and quote forms several times in a row: when Shopify shows its
      hCaptcha challenge, solving it must still post the form and land on the success message;
      the block must not hide the challenge or loop.

## 5. Sign-off

| Date | Theme versions | App version | Result | Notes |
|---|---|---|---|---|
| | | | | |
