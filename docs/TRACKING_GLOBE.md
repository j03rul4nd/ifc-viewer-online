# Tracking Globe

An embeddable 3D globe or flat map that shows packages, cargo or assets on any
route. Suppliers and forwarders put it on their own site. Configure it at
[/tracking-globe/](https://www.ifcvieweronline.eu/tracking-globe/), which also
writes the snippet for each platform.

It draws the data it is given. It does not connect to carriers, vessels or GPS,
and its routes are schematic lanes, not navigation tracks.

## Quick start

```html
<tracking-globe config="…" style="display:block;height:560px"></tracking-globe>
<script src="https://www.ifcvieweronline.eu/track/v1/tracker.js" async></script>
```

Keep the inline `display` and `height`: they hold the space before the script
runs, which is what keeps layout shift at zero. `config` is URL-safe base64 of a
JSON object; the configurator writes it, and you can write it by hand.

```html
<iframe src="https://www.ifcvieweronline.eu/track/v1/embed.html#c=…" title="Shipment tracking map"
  width="100%" height="560" style="border:0;display:block" loading="lazy" allow="fullscreen"></iframe>
```

The iframe takes the same value after `#c=`. The fragment never reaches a server
log. `?c=` also works, for a host that drops fragments.

## Platforms

Status is what was actually run. Nothing here has been tried in a live store or
tenant; the example pages are in `integrations/tracking-globe-examples/`.

| Platform | Use | Limits | Tested |
|---|---|---|---|
| Any HTML site | Script tag | A strict `script-src` must list the host, or self-host. If it is blocked, the reserved box stays empty and the console says why. | Desktop and phone (emulated), real browser |
| WordPress (self-hosted) | Custom HTML block | Roles without `unfiltered_html` have scripts and iframes stripped, which is usual for Editors on multisite. Then use the shortcode from `integrations/wordpress/tracking-globe/`. | Block markup in a browser. Plugin run with PHP against stubs, including a hostile `config`. **Not on a real install.** |
| WordPress.com | Custom HTML block | Needs a paid plan with hosting features active (a plugin installed). The free plan removes the tags. | **Not tested** |
| Shopify | Theme editor → Custom Liquid, or `integrations/shopify/tracking-globe.liquid` as a section | Rich-text fields strip it. Headless stores with their own CSP (one we checked lists every `frame-src`) must allow the host. | Example page served with the headers measured on a real Shopify store. **Not in a store, and the section file has not been loaded by Shopify.** |
| SharePoint Online | Embed web part, iframe only | Modern pages block scripts in page content. A site owner adds the domain under Site settings → HTML Field Security. Other HTML fields may need an explicit allow list even when any domain is allowed for the web part. | Sandboxed iframe under `script-src 'none'`. **Not in a tenant.** No SPFx web part was built: it would need the tenant's app catalog. |
| Taobao / Tmall | An image (configurator → Taobao → Download PNG) | See below. | Image export only |

A claim that needs care: several blogs say Shopify's CSP blocks iframes on
storefronts because of `frame-ancestors 'none'`. That directive stops other sites
framing the store, not the store framing others. A real store measured on
2026-10-31 sent `block-all-mixed-content; frame-ancestors 'none';
upgrade-insecure-requests`, with no `frame-src` or `script-src`.

### Taobao and Tmall

We could not confirm any supported way to run third-party scripts or iframes in
shop decoration. The official documents we could reach are old (a decoration
market draft, and a limit of JS modules for certified template designers), and a
blog showing iframes in shop pages is years old and anecdotal. So we do not promise
a live widget. What is left: publish an image, and host the live map on your own
page, shared outside the listing, after checking the platform's rules on links.

### Reaching China

The default files are served from Vercel. **We have not measured how they load
from mainland China.** For buyers there, host `tracker.js` and `engine.js` on a
server in China and change the script address; the widget makes no other request
unless you give it a feed, a lookup or a logo.

## Configuration

```jsonc
{
  "title": "Acme Logistics", "logo": "https://…", "lang": "es",  // lang: else <html lang>, else the browser
  "view": "globe",            // or "map"
  "height": 560, "autoRotate": true, "lazy": "visible",          // lazy: or "click"
  "simulate": false, "speed": 1,
  "shipments": [],            // see below; at most 200
  "feed": "https://…/shipments.json", "feedInterval": 60,        // seconds, at least 30
  "lookup": "https://…/track/{id}",
  "theme": { "preset": "dark", "accent": "#5E6AD2", "background": "#0b0f17", "ocean": "#10182a", "land": "#5b6a86",
             "text": "#e8ebf1", "panel": "#121824", "landStyle": "dots", "radius": 12, "font": "Inter, sans-serif" },
  "controls": { "drag": true, "zoom": true, "viewSwitch": true, "list": true, "search": true, "legend": true, "fullscreen": true }
}
```

Colours are literal `#hex`, `rgb()` or `transparent`; URLs are HTTPS. Anything
else is ignored, because a config can arrive from a link.

**What the site owner cannot turn off:** the "Simulated data" label, so a
simulation is never taken for real freight; the small credit link; keyboard access.
**What the visitor never gets by default:** the wheel keeps scrolling the host page,
and zoom needs Ctrl or ⌘.

## Data

```json
{ "id": "SHA-20418", "label": "Solar inverters", "from": "shanghai", "to": "rotterdam", "mode": "sea",
  "status": "transit", "progress": 0.46, "etd": "2026-10-01", "eta": "2026-11-12", "position": [12.2, 45.5], "note": "Customs cleared" }
```

- **Names carriers use also work:** `tracking_number`, `reference`, `origin`,
  `destination`, `transport`, `latitude`, `longitude`, `departure`, `arrival`.
- **Places:** a hub name (`shanghai`, `rotterdam`, `hkg`, `fra`, `xian`,
  `duisburg`, `losangeles`, `santos`… see `src/tracker/routes.ts`) or
  `{ "name", "lat", "lng" }`. An unknown name stays in the list as "Unknown
  location" and is not drawn.
- **Where it is, in priority order:** `position` (snapped to the route for the
  progress bar), then `progress` (0–1, or 0–100), then the dates against today.
- **Past its ETA with no status** shows as delayed, never as delivered.
- **Feed:** an array or `{ "shipments": [] }`. The visitor's browser calls it
  directly with no credentials, so it needs CORS for your origin. It never passes
  through us. If it fails, a short notice appears and the last data stays.
- **Lookup:** `{id}` is replaced by what the visitor typed; return one shipment.
  This is the way to show private data one reference at a time.

**Privacy:** data inside `config` is readable in the page source by anyone. Use a
feed or a lookup with your own access rules for anything private.

## JavaScript API

```js
const g = document.querySelector('tracking-globe')
g.setShipments(list)          // works before the engine has loaded
g.select('SHA-20418'); g.setView('map'); g.update(config)
g.toPNG()                     // data URL of the current view; globe and routes, not the HTML panels
g.addEventListener('tg-select', e => e.detail.id)  // also tg-ready, tg-data, tg-error
```

In an iframe, post `{ target: 'tracking-globe', shipments, id, view }` to its
window; it posts `{ source: 'tracking-globe', type: 'ready' | 'select', id }` back.

## Styling

Your stylesheet wins over the configuration:

```css
tracking-globe { --tg-accent:#e4002b; --tg-background:transparent; --tg-text:#111; --tg-panel:#fff; --tg-font:Inter,sans-serif }
tracking-globe::part(panel) { border-inline-start:0 }
```

Parts: `root`, `stage`, `header`, `toolbar`, `legend`, `panel`, `search`, `item`,
`placeholder`. Use hex for the accent and background, as the canvas reads them.

## Performance

Measured 2026-10-31 on local test pages, Chrome, desktop and emulated phone, with
software rendering (`scripts/track/qa.cjs`, `qa-interact.cjs`):

| | |
|---|---|
| `tracker.js` | 3.1 KB gzip, runs first |
| `engine.js` | 26.8 KB gzip, includes the world map; loads within 300 px of the viewport |
| Layout shift | 0 on all five example pages, desktop and phone |
| Engine before scrolling near it | Not requested (script embeds). An iframe is lazy by the browser's own rules, which can start earlier. |
| Off-screen | No draws |
| Third-party requests | None |

Not measured: real phones, field Core Web Vitals on a production page, slow
networks. Drawing is capped near 30 fps while something moves and stops otherwise,
device pixel ratio is capped at 2, and without WebGL it falls back to the flat map.

## Self-hosting and licence

Copy `tracker.js` and `engine.js` from `/track/v1/` to one folder and point the
script at it; the loader finds the engine next to itself. Land data is Natural
Earth (public domain) through world-atlas (ISC). Code is under the repository's
MIT licence.

## For maintainers

`npm run build:track` runs `scripts/track/build-track-pages.mjs`: it bundles the
widget and writes the ten pages, the downloads, and the sitemap and `llms.txt`
blocks. The code is in `src/tracker/`, the words in `scripts/track/track-copy*.mjs`
and `src/tracker/i18n.ts`. A test walks every sea lane over the land data, so a new
waypoint that crosses a continent fails. `/track/v1/` must stay backwards compatible:
it is on other people's sites, so a breaking change goes in `/track/v2/`.
