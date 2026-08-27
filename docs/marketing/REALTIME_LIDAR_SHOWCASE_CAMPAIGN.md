# IFC + temporal LiDAR showcase campaign

Ready-to-publish material for the three browser demos released on 2026-08-27.
The viewer captures are real product screenshots. The IFC models and moving
point returns are deterministic synthetic examples and must always be described
as such.

## Live content and image inventory

| Use case | English guide | Spanish guide | Search/social image | Suggested alt text |
| --- | --- | --- | --- | --- |
| Warehouse operations | `/blog/warehouse-ifc-moving-lidar-digital-twin` | `/es/blog/gemelo-digital-almacen-ifc-lidar-movimiento` | `/blog/images/warehouse-ifc-moving-lidar-digital-twin-1200x1200.jpg` | `IFC warehouse model aligned with a moving temporal LiDAR point cloud in IFC Viewer Online` |
| 4D construction progress | `/blog/4d-construction-progress-ifc-temporal-point-cloud` | `/es/blog/progreso-obra-4d-ifc-nube-puntos-temporal` | `/blog/images/4d-construction-progress-ifc-temporal-point-cloud-1200x1200.jpg` | `IFC construction structure compared with a phased temporal point cloud and deviation cluster` |
| Utility-tunnel inspection | `/blog/utility-tunnel-ifc-mobile-lidar-inspection` | `/es/blog/inspeccion-tunel-ifc-lidar-movil` | `/blog/images/utility-tunnel-ifc-mobile-lidar-inspection-1200x1200.jpg` | `IFC utility tunnel overlaid with a mobile LiDAR replay and moving scan fan` |

Use the `1600x900` variants for website/editorial placements, `1200x1200` for
LinkedIn and other square feeds, `1200x900` for landscape posts and `800x450`
for lightweight previews. Every guide also has a dedicated 1800x945 Open Graph
cover under `/blog/covers/<article-slug>.png`.

## English launch copy

### Warehouse

What does an operational digital twin look like when the scene has to move?
This browser demo aligns an IFC warehouse with a bounded temporal LiDAR replay:
racks and structure stay stable while a forklift, autonomous cart and scan
trails change frame by frame. Try the live example and download its companion
IFC and PLY snapshot.

`#IFC #LiDAR #DigitalTwin #OpenBIM #WebGL`

### Construction

A static point cloud cannot explain progress. This 4D example reveals the
captured structure in phases, animates a lifted panel and keeps a displaced
column cluster visible for review against the IFC plan. The replay runs locally
in the browser using one reusable GPU buffer.

`#ScanToBIM #ConstructionTech #IFC #PointCloud #BIM`

### Utility tunnel

Mobile LiDAR is easier to understand when people can see the scan moving. Our
utility-tunnel demo combines an IFC reference, dense service returns, an
inspection trolley and a moving scan fan in the same 3D scene. Open the live
guide, inspect the workflow and download the sample assets.

`#MobileMapping #LiDAR #AssetManagement #IFC #DigitalTwin`

## Spanish launch copy

### Almacén

¿Cómo se ve un gemelo digital operativo cuando la escena tiene movimiento?
Esta demo alinea un almacén IFC con un replay LiDAR temporal acotado: la
estructura permanece estable mientras cambian la carretilla, el carro autónomo
y sus estelas de escaneo. Incluye ejemplo interactivo y descargas IFC + PLY.

`#IFC #LiDAR #GemeloDigital #OpenBIM #WebGL`

### Progreso de obra

Una nube estática no explica el progreso. Este ejemplo 4D muestra la estructura
por fases, anima un panel izado y mantiene visible una agrupación desviada para
compararla con el IFC previsto. Todo el replay se ejecuta localmente en el
navegador con un único buffer GPU reutilizable.

`#ScanToBIM #ConstruccionDigital #IFC #NubeDePuntos #BIM`

### Túnel técnico

El LiDAR móvil se entiende mejor cuando se ve avanzar el escaneo. La nueva demo
combina un IFC de referencia, retornos densos de instalaciones, un carro de
inspección y un abanico de escaneo móvil en la misma escena 3D. La guía incluye
el ejemplo en vivo y los recursos descargables.

`#MobileMapping #LiDAR #GestionDeActivos #IFC #GemeloDigital`

## Publishing rules

- Link to the language-matched guide, not directly to the raw image.
- Keep the disclosure: “real viewer capture; simulated/deterministic example”.
- Do not call the assets survey data, a client project or real-time sensor data.
- Use one descriptive image per post and keep its exact alt text; do not repeat
  a generic “IFC image” alt across the campaign.
- Add campaign tracking without changing the canonical article URL, for example
  `?utm_source=linkedin&utm_medium=social&utm_campaign=realtime_lidar_showcase&utm_content=warehouse`.
- For a fair demo, say “temporal replay” for the bundled source and reserve
  “live stream” for a WebSocket, WebTransport, ROS or MCAP source connected in
  an actual deployment.
