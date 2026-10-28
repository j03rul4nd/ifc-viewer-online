# WordPress plugin

`ifc-viewer-online/` is the WordPress plugin that embeds the viewer in posts and pages
(block + `[ifc_viewer]` shortcode). It only builds an `<iframe>` to the public app with
the parameters documented in [`docs/EMBED_URL_PARAMS.md`](../../docs/EMBED_URL_PARAMS.md);
it holds no copy of the viewer.

What it adds to WordPress:

- `.ifc` uploads in the Media Library (blocked by WordPress by default).
- `GET /wp-json/ifc-viewer-online/v1/file/<id>`: serves a public `.ifc` attachment with
  `Access-Control-Allow-Origin: https://www.ifcvieweronline.eu`, because the viewer runs on
  that origin and fetches the file from the WordPress site.

## Try it locally

```bash
docker compose -f integrations/wordpress/docker-compose.yml up -d
```

Open http://localhost:8088, finish the install, activate **IFC Viewer Online**, add the
**IFC Viewer** block. The plugin folder is mounted, so edits show on reload.

## Package for wordpress.org

```bash
cd integrations/wordpress && zip -r ifc-viewer-online.zip ifc-viewer-online
```
