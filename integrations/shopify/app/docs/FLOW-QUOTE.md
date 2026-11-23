# Quote requests and expert questions: what the shop receives, and Flow recipes

Block: **IFC: quote request** (`blocks/ifc-quote.liquid`, Starter plan).
Script: `assets/ifcvo-quote.js`. No server of ours is involved: Shopify's own
contact form, customer form and cart carry everything.

## 1. The contact email (always)

The block is a native `{% form 'contact' %}`. Shopify emails the store's sender
address with every field:

| Field | Contents |
|---|---|
| `contact[name]`, `contact[email]` | Buyer (required) |
| `contact[Company]` | Optional |
| `contact[Role]` | `architect`, `contractor`, `owner` or `reseller` (setting "Ask for the buyer's role") |
| `contact[Project]` | Project name and location (setting) |
| `contact[Quantity]` | Optional number (setting) |
| `contact[body]` | The buyer's message |
| `contact[Selection]` | Product and variant; with JavaScript also the link to the current 3D view (`#ifcvo-cam=…`), the asked element and the elements picked in the 3D view (`- 2 x HEA 200 (IFCBEAM, GlobalId …)`) |
| `contact[Tag]` | `ifcvo-lead`, or `ifc-expert-q` when the buyer used "Ask about this element" |

Without JavaScript the form still sends; `contact[Selection]` then holds the
product and variant only.

### Ask about this element (T-326 F5)

With "Show Ask about this element" on, the block shows a button that is enabled
once the buyer selects an element in the 3D view. It writes into
`contact[Selection]`:

```
Question about: HEA 200 (IfcBeam, GlobalId 2O2Fr$t4X7Zf8NOew3FLOH)
Type: HEA; Storey: Level 1; Tag: B12
Pset_BeamCommon: LoadBearing=true; FireRating=R60

Product: Steel frame kit
Variant: S355
View: https://shop.example/products/kit?utm_source=ifc_share#ifcvo-cam=…&ifcvo-sel=…
```

The `View` link reopens the same camera with the element selected (same format
as "Share this view"). `contact[Tag]` becomes `ifc-expert-q`.

## 2. A tagged customer (optional)

With "Also create a customer with these tags" on, the script also posts
Shopify's storefront customer form (`form_type=customer`) with the email, the
name and the tags: the block's list (default `ifcvo-lead`), `role-<role>`, and
`ifc-expert-q` for a question. Shopify creates the customer, or adds the tags to
an existing one. This is best effort: it needs JavaScript, and a store with bot
protection on the customer form may ask the buyer to confirm.

Note: Shopify treats customers created by the storefront customer form as
newsletter sign-ups. Say so in the form's privacy text or leave the setting off.

## 3. Shopify Flow recipes (merchant side)

Shopify Flow has no trigger for contact form emails, so the recipes start from
the tagged customer of section 2.

### 3.1 Lead to sales (quote requests)

```json
{
  "name": "IFC quote request: notify sales",
  "trigger": "Customer created",
  "condition": { "customer.tags": { "includes": "ifcvo-lead" } },
  "actions": [
    { "type": "Send internal email", "to": "sales@your-shop.example",
      "subject": "New IFC quote lead: {{ customer.email }}",
      "body": "Tags: {{ customer.tags | join: ', ' }}. The full request (role, project, elements, 3D view link) is in the contact form email." },
    { "type": "Add customer tags", "tags": ["needs-follow-up"] }
  ]
}
```

To push leads to a CRM, add the connector's action (HubSpot, Klaviyo…) after the
condition, or branch on `role-architect`, `role-contractor`, `role-owner`,
`role-reseller`.

### 3.2 Expert question (T-326 F5)

```json
{
  "name": "IFC expert question: route and acknowledge",
  "trigger": "Customer tags added",
  "condition": { "customer.tags": { "includes": "ifc-expert-q" } },
  "actions": [
    { "type": "Send internal email", "to": "engineering@your-shop.example",
      "subject": "Question about an IFC element from {{ customer.email }}",
      "body": "See the contact form email: it has the GlobalId, the IFC class, key properties and a link that reopens the same 3D view." },
    { "type": "Send marketing email or Klaviyo event", "note": "Acknowledgement to the buyer, if the customer accepts marketing." }
  ]
}
```

These JSON blocks describe the workflows to build in the Flow editor
(Apps > Flow > Create workflow); they are not an importable `.flow` export.

## 4. Elements in the cart (draft orders)

The "Element data" block's quote list in **cart** mode adds one cart line per
element on the current variant, with line item properties:

| Property | Contents |
|---|---|
| `_ifc_guid` | GlobalId (or `#<express id>`) |
| `_ifc_type` | IFC class |
| `_ifc_qty` | Quantity of that element |
| `Element`, `IFC class` | Shown to the buyer |

Properties starting with `_` are hidden from the buyer by most themes and kept
on the order, so a draft order or an order export has them.

## 5. Customer event

Each submit publishes `ifcvo_quote_submit` through `Shopify.analytics.publish`
(visible in custom pixels and the Pixel Helper) with `productId`, `variantId`,
`file`, `elements` (count), `role` and `kind` (`quote` or `expert`). It never
carries the name, email or message.
