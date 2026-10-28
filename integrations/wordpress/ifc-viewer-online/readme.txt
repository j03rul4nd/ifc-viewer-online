=== IFC Viewer Online ===
Contributors: ifcvieweronline
Tags: ifc, bim, 3d, viewer, architecture
Requires at least: 6.1
Tested up to: 6.8
Requires PHP: 7.4
Stable tag: 1.0.0
License: MIT
License URI: https://opensource.org/licenses/MIT

Embed interactive 3D IFC (BIM) models in your posts and pages, with their Health Score.

== Description ==

Show your BIM models on your own website: visitors orbit, measure and inspect the model in their browser, without installing anything.

* **IFC Viewer block** for the block editor, and an `[ifc_viewer]` shortcode for classic themes and page builders.
* **Upload .ifc files to the Media Library** (WordPress blocks them by default; the plugin allows them for users who can upload files).
* **Health Score** of the model on load (can be turned off).
* Clean "article" layout for posts, or the full app, kiosk and client-presentation layouts.
* 10 interface languages.

= Privacy =

The viewer runs in the visitor's browser inside an iframe from www.ifcvieweronline.eu. The visitor's browser fetches the IFC file directly from your site; the file is not uploaded to or stored by IFC Viewer Online. See https://www.ifcvieweronline.eu/privacy for what the viewer itself processes.

== Usage ==

Block: add the **IFC Viewer** block and choose an IFC file from the Media Library.

Shortcode:

`[ifc_viewer attachment="123" height="600"]`
`[ifc_viewer model="https://example.com/model.ifc" ui="full" lang="es"]`

Attributes: `attachment` (Media Library ID) or `model` (https URL), `height` (200–2000), `ui` (article, minimal, full, kiosk, client), `view` (iso, top, front, back, left, right, bottom), `wheel` (ctrl, always), `validate` (1, 0), `turntable` (1 or degrees per second), `lang`, `accent` (hex colour), `bg`, `name`, `title`.

A model at another site's URL loads only if that site allows cross-origin requests (CORS). Files from your own Media Library always work: the plugin serves them through `/wp-json/ifc-viewer-online/v1/file/<id>` with the header the viewer needs, and only for published content.

== Changelog ==

= 1.0.0 =
* First release: block, shortcode, .ifc uploads and CORS-enabled file route.
