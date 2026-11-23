# Recipe: handover, maintenance and reorder follow-up (Shopify Flow, no app server)

For prefab, modular and furniture shops. The buyer's handover pack lives in the
customer account (**My models & files → Handover**): as-built IFC and manuals
(`ifcvo.handover`), assembly steps that open the 3D viewer at each saved view
(`ifcvo.assembly_views`) and the warranty end date (`ifcvo.warranty_months`).
See `app/METAFIELDS.md`.

The app ships no Flow trigger or action of its own (those need a server). This
workflow uses only Shopify's native trigger and actions. Build it in
**Apps → Flow → Create workflow**:

1. **Trigger:** `Order fulfilled`.
2. **Condition:** `Order / Line items / Product / Tags` includes `handover`
   (tag the products that have a handover pack).
3. **Action:** `Add order tags` → `handover-sent`.
4. **Action:** `Wait` → 6 months (your maintenance interval).
5. **Action:** `Add customer tags` → `maintenance-due`.

Then in **Marketing → Automations** (or Shopify Email) create an automation for
customers who get the `maintenance-due` tag: maintenance checklist, link to
**My models & files**, and a product block for spare parts or a reorder.

Optional second branch, warranty ending: a scheduled Flow (`Scheduled time`, monthly)
cannot compute per-order dates without code, so instead add a second `Wait` of
(warranty months − 1) after step 5 and tag `warranty-ending`.

## Notes
- Flow and Shopify Email availability depends on the merchant's Shopify plan; email
  volume beyond the free quota is billed by Shopify to the merchant.
- Workflows are imported or built by the merchant; nothing runs until they turn it on.
- No ZIP is generated anywhere: the handover pack is a list of files.
