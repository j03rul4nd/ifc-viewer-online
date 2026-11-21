=== Bimo IFC Viewer ===
Contributors: j03rul4nd
Tags: ifc, bim, 3d, viewer, digital twin
Requires at least: 6.1
Tested up to: 7.1
Requires PHP: 7.4
Stable tag: 1.2.0
License: MIT
License URI: https://opensource.org/licenses/MIT

Embed interactive 3D IFC (BIM) models in posts and pages: Health Score, federated models, point clouds, the map, sun studies and digital twins.

== Description ==

Bimo IFC Viewer is the WordPress plugin of IFC Viewer Online (https://www.ifcvieweronline.eu), the free browser IFC viewer by the same author; Bimo is its mascot.

Show your BIM models on your own website. Visitors orbit, measure and inspect the model in their browser, without installing anything and without an account.

* **IFC Viewer block** for the block editor, and an `[ifc_viewer]` shortcode for classic themes and page builders.
* **Upload .ifc files to the Media Library.** WordPress blocks them by default; the plugin allows them for users who can upload files.
* **Health Score** of the model on load, from the free IFC validator (can be turned off).
* **Federated models:** pick several IFC files (architecture, structure, MEP) and they load together as one scene.
* **Point clouds** (LAS, LAZ, COPC, PLY, PCD) next to the model.
* **The model on the map** with terrain and the surrounding buildings, in six looks (daylight, maquette, golden hour, night, blueprint, dawn).
* **Sun studies and solar analysis:** open at a given date and time, or show a year of sun hours or the passive solar impact on the facades.
* **Plan cut:** open the model with a 2D plan cut next to the 3D view.
* **Digital twin scenes:** embed a scene exported from IFC Viewer Online, with its models, data layers, live sensors, map and camera, and a scene explorer for visitors.
* Clean "article" layout for posts, or the full app, kiosk and client-presentation layouts.
* 10 interface languages.

The plugin holds no copy of the viewer. On pages with a viewer it adds one small bundled script (frontend.js, no remote code) for click-to-load, events and guided steps. It stores one option (its settings) and no database tables.

== External services ==

This plugin embeds the IFC Viewer Online web app (https://www.ifcvieweronline.eu/), which displays the model. It is needed for the plugin to work: without it there is no viewer.

* **What is sent and when:** when a visitor opens a page with an IFC Viewer block or `[ifc_viewer]` shortcode, their browser loads the viewer in an iframe from www.ifcvieweronline.eu. The iframe address carries the block settings and the address of the model (and of any point cloud or scene). The visitor's browser then downloads the model straight from your site, or from the URL you gave: the file is not uploaded to or stored by IFC Viewer Online.
* **Click to load:** with `load="click"` (or the site-wide setting) nothing is requested from www.ifcvieweronline.eu until the visitor clicks the poster's button; the poster says where the viewer comes from.
* **No tracking:** the bundled front-end script sends nothing anywhere. Pushing events to your own `window.dataLayer` is off unless you turn it on.
* **Map:** only when you turn on the map, the viewer loads map tiles, terrain and building data from third-party map providers listed in the viewer's privacy policy.
* Terms of use: https://www.ifcvieweronline.eu/terms
* Privacy policy: https://www.ifcvieweronline.eu/privacy

== Installation ==

1. Install the plugin from Plugins → Add New, or upload the `bimo-ifc-viewer` folder to `/wp-content/plugins/`.
2. Activate it.
3. Edit a post or page, add the **IFC Viewer** block and choose one or more IFC files from the Media Library.

== Frequently Asked Questions ==

= Does it cost anything? =

No. The plugin and the viewer it embeds are free.

= Where are my models stored? =

In your own Media Library, like any other file. The viewer runs in the visitor's browser and reads the file from your site.

= My model is on another site and does not load =

A model at another site's URL loads only if that site allows cross-origin requests (CORS). Files from your own Media Library always work: the plugin serves them through `/wp-json/bimo-ifc-viewer/v1/file/<id>` with the header the viewer needs, and only for published content.

= Can I embed a model in a private or password-protected post? =

The file route serves a model only when the post it is attached to is published and has no password, so the viewer cannot read it from a private post.

= How large can the model be? =

As large as your host lets you upload. The viewer streams and parses the file in the visitor's browser; models of a few hundred megabytes open on a desktop computer.

== Usage ==

Block: add the **IFC Viewer** block and choose IFC files from the Media Library. The sidebar has the display, map, sun, plan and digital twin settings.

Shortcode:

`[ifc_viewer attachment="123" height="600"]`
`[ifc_viewer attachment="123,124,125" ui="full" lang="es"]`
`[ifc_viewer model="https://example.com/model.ifc" map="terrain,buildings" look="golden"]`
`[ifc_viewer attachment="123" solar="06-21T19:30"]`
`[ifc_viewer scene="https://example.com/port-twin.json" explore="1"]`

Attributes:

* `attachment`: Media Library IDs, comma-separated. `model`: https URLs to .ifc files, comma-separated. `name`: display names, parallel to the models.
* `scan`: https URLs to point clouds. `scene`: https URL to a scene document (it brings its own models).
* `height` (200–2000), `ui` (article, minimal, full, kiosk, client), `view` (iso, top, front, back, left, right, bottom), `wheel` (ctrl, always), `validate` (1, 0), `turntable` (1 or degrees per second), `lang`, `accent` (hex colour), `bg`, `title`.
* `map` (1, or layers such as `terrain,buildings`), `look` (daylight, maquette, golden, night, blueprint, dawn).
* `solar` (`MM-DDTHH:MM` or `YYYY-MM-DDTHH:MM`, site time), `moon` (1), `analysis` (for example `year`, `year:passive`, `summer:sun`), `site` (`lat,lon`).
* `drawings` (`plan`), `explore` (1, 0).
* `toolbar` (1, 0), `tools` (`validate`, `measure`, both comma-separated, or `none`), `panels` (properties, scene, measurement, section, plans, map, solar, flood, devices, pointcloud, mesh, comma-separated, or `none`), `autoframe` (1, 0), `fill` (0.2–0.98, or a percentage 20–98), `layers` (https URL to a layers document), `rule` (a validation rule id such as `RULE_MISSING_NAME`), `flood` (`shower`, `storm`, `intense` or `extreme`, then optional `1m`/`2m`/`5m`, `free`/`closed`, `sealed`/`compacted`/`loam`/`sandy`), `fullscreen` (1: a full-screen button).

Click to load (no request to ifcvieweronline.eu until the visitor clicks):

`[ifc_viewer attachment="123" load="click" poster="456" poster_title="Duplex" poster_text="Two-family house, IFC 2x3" launch_label="Open the 3D model"]`

* `load` (`auto`, `click`), `poster` (Media Library ID or https image URL), `poster_title`, `poster_text`, `launch_label`. The poster takes the viewer's height, so nothing moves when the model loads. It carries a note that the viewer loads from www.ifcvieweronline.eu (change it in the settings).

Guided steps: each `[ifc_step]` drives the nearest viewer above it (or the first below) while it crosses the middle of the screen. Without JavaScript it is plain text. The **IFC Viewer Step** block does the same in the block editor.

`[ifc_step view="front" isolate="IfcWall"]The walls carry the roof.[/ifc_step]`
`[ifc_step select="2O2Fr$t4X7Zf8NOew3FLOH"]This is the main door.[/ifc_step]`

* `view` (iso, top, front, back, left, right, bottom), `select` (an IFC GlobalId), `isolate` (an IFC class, or `none`), `azimuth`, `elevation` (degrees), `fill` (0.2–0.98).

== Settings ==

Settings → Bimo IFC Viewer sets site-wide defaults: accent colour, language, interface, background, loading mode (with the page or click to load), default poster and the consent text. A block or shortcode setting always wins. Two opt-in switches, both off by default:

* **Fill a form field with the selected element:** with `form_field="#css-selector"` on an embed, clicking an element writes "Name (GlobalId)" into that input and fires `input` and `change`, so it works with Contact Form 7, WPForms, Gravity Forms or any plain form.
* **Push viewer events to window.dataLayer** (only if the page already has one): `bimo_ifc_model_loaded`, `bimo_ifc_validation_completed` (with `score`), `bimo_ifc_element_selected` (with `ifc_type`, never names or IDs), `bimo_ifc_tour_started`, `bimo_ifc_tour_ended`.

== Events and JavaScript API ==

Each viewer event is dispatched on the viewer's wrapper (`.ifcvo-embed`) as a DOM CustomEvent named `bimo-ifc:<event>`, which bubbles; the payload is in `event.detail`. Events include `ready`, `model-loaded`, `model-error`, `validation-completed`, `element-selected` (`name`, `globalId`, `ifcType`, `expressId`, `modelId`), `measurements-changed`, `tour-started`, `tour-step` and `tour-ended`. Only messages from https://www.ifcvieweronline.eu are accepted.

`document.addEventListener( 'bimo-ifc:element-selected', function ( e ) { console.log( e.detail.name, e.detail.globalId ); } );`

`window.BimoIFC.get( elementOrSelector )` returns the commands of one viewer (commands wait until the model has loaded):

* `select( globalId )`, `isolate( 'IfcWall' )` (nothing to show all), `setView( 'top' )`, `frame( { view, fill, azimuth, elevation } )`, `startTour( 'client-walkthrough' )`, `load()` (behind a poster), `on( event, callback )` (returns an unsubscribe function), `whenReady()`.

== Screenshots ==

1. A model embedded in a post with the article layout and its Health Score.
2. The block settings in the editor.
3. Federated models on the map with terrain and buildings.
4. A digital twin scene with the scene explorer.

== Changelog ==

= 1.2.0 =
* Click to load: a poster with title, text, button and consent note; the viewer loads from ifcvieweronline.eu only when the visitor clicks.
* Settings page (Settings → Bimo IFC Viewer) with site-wide defaults.
* Viewer events as DOM events (`bimo-ifc:<event>`), the `window.BimoIFC` API, opt-in form field filling and opt-in dataLayer push.
* Guided steps: `[ifc_step]` shortcode and IFC Viewer Step block.
* New parameters: toolbar, tools, panels, autoframe, fill, layers, rule, flood, fullscreen; the block now has controls for language, background, moon and model names too.

= 1.1.0 =
* Several IFC files in one block load as a federated scene.
* Point clouds, the model on the map, sun studies, solar analysis, plan cut and digital twin scenes, from the block sidebar or the shortcode.
* Tested with WordPress 7.1.

= 1.0.0 =
* First release: block, shortcode, .ifc uploads and CORS-enabled file route.

== Upgrade Notice ==

= 1.2.0 =
Click to load with a consent note, site-wide settings, events for your forms and scripts, and guided scroll steps. Existing embeds render as before.

= 1.1.0 =
Federated models, point clouds, map, sun studies, plan cut and digital twin scenes.
