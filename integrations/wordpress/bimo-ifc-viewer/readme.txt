=== Bimo IFC Viewer ===
Contributors: j03rul4nd
Tags: ifc, bim, 3d, viewer, digital twin
Requires at least: 6.1
Tested up to: 7.1
Requires PHP: 7.4
Stable tag: 1.1.0
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

The plugin holds no copy of the viewer and adds nothing to your pages except the embed: no scripts on the front end, no settings, no database tables.

== External services ==

This plugin embeds the IFC Viewer Online web app (https://www.ifcvieweronline.eu/), which displays the model. It is needed for the plugin to work: without it there is no viewer.

* **What is sent and when:** when a visitor opens a page with an IFC Viewer block or `[ifc_viewer]` shortcode, their browser loads the viewer in an iframe from www.ifcvieweronline.eu. The iframe address carries the block settings and the address of the model (and of any point cloud or scene). The visitor's browser then downloads the model straight from your site, or from the URL you gave: the file is not uploaded to or stored by IFC Viewer Online.
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

== Screenshots ==

1. A model embedded in a post with the article layout and its Health Score.
2. The block settings in the editor.
3. Federated models on the map with terrain and buildings.
4. A digital twin scene with the scene explorer.

== Changelog ==

= 1.1.0 =
* Several IFC files in one block load as a federated scene.
* Point clouds, the model on the map, sun studies, solar analysis, plan cut and digital twin scenes, from the block sidebar or the shortcode.
* Tested with WordPress 7.1.

= 1.0.0 =
* First release: block, shortcode, .ifc uploads and CORS-enabled file route.

== Upgrade Notice ==

= 1.1.0 =
Federated models, point clouds, map, sun studies, plan cut and digital twin scenes.
