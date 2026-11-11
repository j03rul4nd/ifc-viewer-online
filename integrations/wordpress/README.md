# WordPress plugin

`bimo-ifc-viewer/` is the WordPress plugin that embeds the viewer in posts and pages
(block + `[ifc_viewer]` shortcode): one or several IFC files (federated), point clouds,
the model on the map, sun studies and solar analysis, a plan cut, and digital twin scenes. It only builds an `<iframe>` to the public app with
the parameters documented in [`docs/EMBED_URL_PARAMS.md`](../../docs/EMBED_URL_PARAMS.md);
it holds no copy of the viewer.

What it adds to WordPress:

- `.ifc` uploads in the Media Library (blocked by WordPress by default).
- `GET /wp-json/bimo-ifc-viewer/v1/file/<id>`: serves a public `.ifc` attachment with
  `Access-Control-Allow-Origin: https://www.ifcvieweronline.eu`, because the viewer runs on
  that origin and fetches the file from the WordPress site.

## Try it locally

```bash
docker compose -f integrations/wordpress/docker-compose.yml up -d
```

Open http://localhost:8088 (latest WordPress), finish the install, activate **Bimo IFC Viewer**, add the
**IFC Viewer** block. The plugin folder is mounted, so edits show on reload.

## Check and package for wordpress.org

Run the official Plugin Check inside the container (WP-CLI is not in the image):

```bash
docker exec wordpress-wordpress-1 bash -c "curl -sLo /usr/local/bin/wp https://raw.githubusercontent.com/wp-cli/builds/gh-pages/phar/wp-cli.phar && chmod +x /usr/local/bin/wp"
docker exec -u 33 wordpress-wordpress-1 bash -c "wp plugin install plugin-check --activate && wp plugin check bimo-ifc-viewer"
```

```bash
cd integrations/wordpress && zip -r bimo-ifc-viewer.zip bimo-ifc-viewer
```

`wp-org-assets/` holds the images of the plugin page (they go in the SVN `assets/` folder,
not in the zip): icon, banner and the screenshots numbered as in `readme.txt`.
`make-assets.mjs` regenerates them from the local WordPress.

Releases: bump `Version` in the plugin header, `IFCVO_VERSION` and `Stable tag` together,
add a changelog entry, and keep `Tested up to` at the current WordPress version.
