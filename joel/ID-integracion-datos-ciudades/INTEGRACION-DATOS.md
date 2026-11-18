# I+D integración de datos de ciudad — Helsinki, Tokio, Singapur, Barcelona

Paquete de conservación creado el 2026-10-08. **Es agnóstico al producto**: no hace falta la CDE para
entenderlo ni para reutilizarlo. Recoge tres cosas que, si no, se perderían:

1. **Los IFC que hemos creado nosotros** (no los IFC reales de clientes: la rotonda de Castellbisbal y la
   planta fotovoltaica de Anglès quedan fuera a propósito) y los scripts que los generan.
2. **Cómo obtenemos cada dato externo**: endpoints, autenticación, cadencias, cuotas, licencias, scripts de
   preparación offline y las trampas que encontramos por el camino.
3. **Cómo se colocan en el mapa**: teselas, terreno, ortofotos, datums verticales y radar.

Ninguna clave ni token va en este paquete. Donde hace falta uno se indica «necesita clave»: hay que pedir una
propia al proveedor.

> Lo marcado **Needs verification** no sale del código, sino de la memoria de las sesiones. Hay que
> comprobarlo antes de fiarse.

## Contenido del zip

```
ifc/
  helsinki/   helsinki-cathedral.ifc, helsinki-central-station.ifc, elielinaukio-bus-terminal.ifc
  tokio/      waseda-tram-stop(.ifc|_qto.ifc), tochomae-a4-entrance(.ifc|_qto.ifc)
  barcelona/  8 modelos × (.ifc, _qto.ifc con cantidades, _cutouts.json con los recortes de malla)
generadores-ifc/
  ifcbuild.py      capa de autoría sobre IfcOpenShell (árbol espacial, materiales, psets, aperturas, georref.)
  qto.py           añade cantidades base (Qto_*) calculadas de la geometría teselada
  ifc2tiles.py     IFC → 3D Tiles 1.0 (b3dm de una tesela) + WFS estático con el árbol y los psets
  gsi_laser.py     altura del terreno japonés (dem5a láser + relleno de huecos), para colocar objetos
  lod2_ground.py   lee la cota del suelo de las bases de edificios LOD2 de Helsinki (glTF)
  hel3d_patch.py   copia del tileset LOD2 de Helsinki que oculta los edificios que sustituye un IFC
  tools/icgc_ground.py, icgc_ground_grid.py   cota del suelo leída de los triángulos de la malla ICGC
  landmarks/*.py   un generador por modelo + sus datos de sitio (*.json de OSM / cotas medidas)
modelos-3d-blender/   generadores Blender de los GLB de trenes, autobuses, tranvías y cargadores
                      (barcelona/ helsinki/ singapur/ tokio/)
INTEGRACION-DATOS.md  este documento
```

## Parte A — Los IFC

### Por qué son de autoría propia

No hay **ningún IFC abierto** de estos sitios. En Helsinki buscamos en hri.fi/avoindata, Väylä, Senaatti,
bSI Finland, GitHub y Zenodo. En Shinjuku, PLATEAU convierte BIM a CityGML pero no publica IFC. Barcelona
tampoco tenía ninguno. Así que los modelos se escriben en Python a partir de fuentes públicas: planos
históricos, fotos de Wikimedia Commons, OSM (ODbL), LOD2 municipal y mallas ICGC.

Cada elemento lleva:

- `Pset_CDE_Provenance`: de dónde sale su geometría y con qué confianza.
- `Pset_CDE_AssetManagement (demo)`: valores de O&M **inventados**, y el pset lo dice. No hay que
  presentarlos nunca como datos de un propietario real.

### Catálogo

| Modelo | Ciudad | Esquema | Anclaje / cota | Fuentes |
|---|---|---|---|---|
| Catedral de Helsinki (Tuomiokirkko) | Helsinki | IFC4 | 60.170378, 24.952175, 9.93 m N2000 | Planos de Engel (Finnish Heritage Agency, CC BY 4.0), LOD2 de la ciudad, partes OSM |
| Estación Central (Rautatieasema) v4 | Helsinki | IFC4 | base LOD2, 1.54 m N2000 | Fotos de Commons, plano de 1903, perspectivas de Saarinen, fi.wikipedia; 19 andenes y vías de OSM; 14 alas ajustadas al ráster LOD2; 870 productos |
| Terminal de autobuses Elielinaukio | Helsinki | IFC4 | 60.17176, 24.93957, 3.30 m N2000 | OSM (`elielinaukio_osm.json`); los andenes 31–36 son `was:bus_stop` y van con InService=false |
| Parada de tranvía Waseda (SA-30) v2 | Tokio | IFC4X3 (IfcRailway) | TP 7.88 m, EPSG:6677 | 19 fotos de Commons, eje de vía de OSM, suelo GSI; rótulos 3D con Noto Sans CJK JP (fontTools); 386 productos, 192 traviesas |
| Tochōmae, salida A4 (Ōedo E-28) | Tokio | IFC4X3 | TP 34.58 m | Nodo OSM 1701108900 y edificio 583899285, 3 fotos de Commons; escalera hasta −4.9 m |
| Hub de movilidad Pl. Catalunya / Pg. de Gràcia | Barcelona | IFC4X3 | cruda 69.96 (elipsoidal) | Acceso de metro con escalera mecánica, ascensor de vidrio, parada TMB 1210, Bicing 65 (21 anclajes, 13 bicis); 326 productos |
| Font de Canaletes + quiosco | Barcelona | IFC4X3 | 64.51 | 63 elementos |
| Accés Pelai (metro/FGC accesible) | Barcelona | IFC4X3 | 66.03 | 97 elementos |
| Punto Endolla Pg. de Gràcia | Barcelona | IFC4X3 | 70.40 | Nodo OSM 5310083454; 122 elementos (LOD 500) |
| Fonts Bessones | Barcelona | IFC4X3 | 70.18 | 316 elementos, 8 esculturas; césped de OSM way 128230179 |
| Bancos-farola de Falqués | Barcelona | IFC4X3 | 72.92 | 58 elementos |
| Monumento a Macià | Barcelona | IFC4X3 | 66.31 | 36 elementos, pset de patrimonio |
| Fuente monumental Gran Via | Barcelona | IFC4X3 | 72.20 | 182 elementos |

En Barcelona la «cota cruda» es la altura elipsoidal de la malla ICGC. La ortométrica es esa menos
49.70 m (EGM2008 en Pl. Catalunya); ver la sección MAP.2 más abajo.

Además usamos un modelo **que no es nuestro** y por eso no va en el zip: el *Infra-Bridge* IFC4X3 de
buildingSMART (CC BY 4.0, ficticio), colocado en Eläintarhanlahti.

### Cadena de herramientas

```bash
python3 -m venv venv && . venv/bin/activate && pip install ifcopenshell pyproj shapely numpy
# o, sin venv: uv run --with ifcopenshell --with numpy --with shapely python ...
python landmarks/<modelo>.py                        # escribe src/<modelo>.ifc (+ _cutouts.json)
python qto.py src/<modelo>.ifc src/<modelo>_qto.ifc  # cantidades desde la geometría
python ifc2tiles.py src/<modelo>_qto.ifc tiles/<nombre> <lat> <lon> <h> <heading> --keep-origin \
       --wfs tiles/wfs/<nombre> --wfs-name <nombre>_features [--extras src/<modelo>_cutouts.json]
```

Los argumentos exactos de cada modelo están en la cabecera de su `landmarks/*.py`. Las rutas de los
scripts asumen la estructura original (`src/`, `tiles/`, `landmarks/` junto a `ifcbuild.py`).

- `ifcbuild.py` georreferencia con `IfcSite` RefLat/RefLon/RefElevation **y** `IfcMapConversion` al CRS
  proyectado de cada sitio:
  - EPSG:3879 en Helsinki;
  - EPSG:6677 en Tokio;
  - el UTM 31N de BCN, que es `BCN_CRS` en los scripts.

  Utilidades: `box(angle=…)` (el ángulo va **en radianes**), `brep`, `frustum`, `sphere`, `prism_holes`,
  `lettering()`. Las aperturas son reales: `IfcOpeningElement` + `IfcWindow`/`IfcDoor`.
- `ifc2tiles.py`:
  - Cada `IfcElement` con geometría es una feature batch (FeatureID = batch id), y la batch table es mínima.
  - Todo el detalle va a un WFS estático: `features.json` (GeoJSON CRS:84, una feature por nodo del árbol,
    con Children/AncestorPath y los psets) más `capabilities.xml`. Lo sirve cualquier nginx.
  - `--crs EPSG:x` reproyecta IFC civiles en coordenadas proyectadas.
  - `--skip-name REGEX` quita marcadores de origen y terreno.
  - `--drop-below Z` quita los vértices sueltos en z=0.
  - `--extras` mete JSON en `tileset.extras`, por ejemplo `cdeMeshCutouts`, las cajas orientadas para
    recortar la malla 3D de la ciudad.

### Lecciones de modelado y colocación

- **La altura es el problema, no el modelo.** Antes de ajustar un offset a mano hay que mirar el datum
  vertical:
  - Helsinki: N2000 sobre un terreno elipsoidal, +17.61 m.
  - Barcelona: ICGC elipsoidal, −49.70 m.
  - PLATEAU: elipsoidal, −37.06 m.
- **Barcelona**: se coloca leyendo offline los triángulos de la malla ICGC (CESIUM_RTC, glTF y-up → ECEF
  (x,−z,y)) y rasterizándolos a un DSM de 0.2 m. Así se ven la escalera, los bordillos de 0.19 m y los
  quioscos.
  - Los LOD gruesos de ICGC salen altos: +1.4 m con geomErr 8 y +6 m con 16.
  - El pick del navegador no sirve para medir.
- **Recortes de malla**: una malla 2.5D no tiene suelo debajo de un bulto. Cada recorte necesita un parche
  de pavimento IFC (margen de 0.25 m), y el hueco de la escalera solo se corta por debajo del pavimento.
- **Japón**: hay que colocar a TP real sobre el terreno dem5a. Los objetos de suelo llevan faldón de
  0.3–0.5 m porque el LOD del visor varía ±0.2 m.
- **Tamaño**: los cilindros van como prismas octogonales y los perfiles de revolución, gruesos.
  - Con n=24, Waseda pasaba de 15 a 32 MB.
  - Los vidrios oscuros parecen agujeros negros: mejor vidrio claro.
- **Previsualización**: IFC → OBJ (iterador de `ifcopenshell.geom`) → Blender. Hay que excluir
  `IfcOpeningElement`, o cada hueco sale como un agujero negro.
- **Caché**: tras volver a generar las teselas, el navegador sigue con el b3dm viejo si nginx no manda
  Cache-Control. Hay que forzar `fetch(url, {cache:'reload'})`.
- Mapbox GL no pinta el glb de un b3dm (sin índices, `_BATCHID`): hay que reempaquetarlo con índices. Allí
  las IFC se «drapean» vértice a vértice sobre el terreno de Mapbox, cuyo DEM varía 8 m en la plaza.

## Parte B — Patrón común de los conectores de datos

Los cuatro conectores (Node/TypeScript, sin base de datos) siguen la misma forma. Merece la pena copiarla:

- Un *feed* por fuente, con un poller que no se solapa consigo mismo.
- Backoff limitado, con jitter.
- Cliente HTTP con techo de bytes.
- Si cero registros pasan el esquema, es un **error**, no una lista vacía.
- Cada respuesta lleva `meta.attribution` y `meta.sources[].lastSuccessAt`, para saber si el dato está viejo.
- Los datos estáticos pesados (redes de vía, estaciones, barrios, líneas base estadísticas) se preparan
  **offline** con scripts (`scripts/build-*.{ts,mjs,py}`) y se versionan como JSON en `data/`.
- Los datos OSM (ODbL) van en ficheros aparte, con un interruptor de entorno para retirarlos si la licencia
  lo exige.
- Los modelos 3D de vehículos se generan con Blender por script (`modelos-3d-blender/`) y se exportan a GLB.
  Para que no se vean oscuros: metallic bajo, buena luz e iluminación de entorno.

Los detalles por ciudad empiezan en la Parte C.

---

# Parte C — Helsinki y Tokio

## Fuentes de datos externas: Helsinki y Tokio (Shinjuku)

Documento de preservación de conocimiento, independiente del producto. Describe **cómo se obtiene cada
fuente externa** en los dos conectores y en el lado de mapa/terreno, para poder reconstruirlo sin CDE.
Fuentes leídas (2026-10-08): `MW-TS-API-Helsinki` (commit `658ba38`, v0.4.6), `MW-TS-API-Shinjuku`
(v0.5.7, incluye `docs/*.md`), `CDE-Frontend-devices/src/shared/components/map/basemapImagery.ts`,
`CDE-Frontend-devices/src/modules/scenes/utils/verticalDatum.ts`, `demo-assets/{gsi_laser.py,hel3d_patch.py,lod2_ground.py}`,
`demo-assets/landmarks/tochomae_a4_entrance.py`, tabla `SceneResource` de `cde_backend_devices` (solo lectura)
y la memoria de sesiones previas.

Convenciones: los hechos salen del código salvo que se marque **Needs verification**. Ninguna fuente de
estos dos conectores necesita clave; si algún día la necesita, va en `.env.local` y nunca en un log.

---

## 0. Patrón común a ambos conectores (reutilizable)

Ambos servicios son la misma arquitectura (Node 22, Express, TypeScript, Zod), y esto es lo que hay que
reproducir en cualquier producto nuevo:

- **Un `Feed` por fuente** (`src/shared/sources/poller.ts`): `{ id, description, intervalSeconds, fetch(previous, now) }`.
  `fetch` recibe el valor anterior para poder devolverlo sin descargar si la fuente indica que no hay
  nada nuevo (caso JMA `latest_time.txt`).
- **Poller sin solapamiento**: la siguiente consulta se programa solo cuando la anterior terminó.
  - Helsinki: error *reintentable* (timeout, red, 429, 5xx) → backoff exponencial ×2 hasta **8× el
    intervalo**; error no reintentable (4xx, forma que ya no parsea) → intervalo normal ("hacer backoff
    solo retrasaría ver que lo arreglaron").
  - Shinjuku: `DEFAULT_RETRY = { baseSeconds: 15, maxSeconds: 900, jitter: 0.1 }` → reintento a 15 s,
    duplicando hasta `min(8·intervalo, 15 min)`, con ±10 % de jitter. **Motivo del tope de 15 min**: sin él,
    un feed diario que falla en el arranque esperaría un día entero (y con él el catálogo de estaciones).
- **Cliente HTTP acotado** (`src/shared/http/upstream.ts`): lee el cuerpo por trozos y lo aborta al pasar
  el techo (no se fía de `content-length`). Timeouts: Helsinki 20 s (`UPSTREAM_TIMEOUT_MS`), Shinjuku 15 s.
  Techos: Helsinki 8 MB en memoria, 300 MB para el zip GTFS en disco; Shinjuku 5 MB, 32 MB el zip GTFS de bus.
  `User-Agent: mw-ts-api-helsinki (+https://github.com/DEIN-INGREEN)`.
- **Errores que nunca filtran secretos**: `UpstreamError` nombra solo host y path, nunca query ni cabeceras.
- **Se guarda la última respuesta buena** con su antigüedad (`ageSeconds`, `stale`, `lastSuccessAt`).
- **Forma desconocida = error, no lista vacía**: si *ningún* registro casa con el esquema, se lanza error
  no reintentable (si no, "0 trenes" sería indistinguible de "API rota"). Un registro malformado aislado
  se salta y se cuenta (`skipped`).
- `meta.available: false` = la fuente nunca respondió; lista vacía con `available: true` = no hay nada
  ahora. No deben pintarse igual.
- **Cada respuesta lleva `meta.attribution`** (avisos de licencia) y `meta.sources[].lastSuccessAt`
  (hora de obtención). El visor debe mostrarlos.
- **Sin historia**: todo en memoria; el contenedor no tiene volumen.
- **Datos estáticos pesados se hornean offline** con scripts (`scripts/*`) y se commitean en el repo /
  imagen; el servicio nunca llama a Overpass ni descarga datasets nacionales en tiempo de ejecución.
- **Fixtures reales** capturados de cada fuente el 2026-09-30 en `tests/fixtures/` (sirven de ejemplo
  de formato).
- Las capas OSM (ODbL) se guardan **en ficheros separados** de las CC BY y tienen un interruptor de
  entorno que elimina la capa y su aviso: decisión de equipo pendiente sobre el share-alike de ODbL.

---

## 1. Helsinki (`MW-TS-API-Helsinki`)

Área por defecto: `AREA_NAME=Rautatientori–Kaisaniemi–Hakaniemi`, `AREA_BBOX=24.925,60.165,24.960,60.190`
(minLon,minLat,maxLon,maxLat). Elegida el 2026-09-30 porque dentro caen 2 estaciones de calidad del aire,
1 meteorológica y ~190 paradas HSL. Medido: 90–110 vehículos, 190 paradas, ~14 500 llamadas predichas en
memoria; 60 MiB y 22 % de un core con `-m 512m --cpus 0.5`.

Salida de red necesaria: `mqtt.hsl.fi:8883`, `infopalvelut.storage.hsldev.com`, `realtime.hsl.fi`,
`opendata.fmi.fi` (y `overpass-api.de` solo en el script offline).

### 1.1 HSL HFP (High-Frequency Positioning) — posiciones de vehículos en vivo

- **Qué es**: stream MQTT de HSL con la posición de cada vehículo (~1 mensaje/s por vehículo).
- **Protocolo/URL**: `mqtts://mqtt.hsl.fi:8883` (`HFP_MQTT_URL`; acepta también `ws(s)://`). Cliente
  `mqtt` npm, `clientId: mw-ts-api-helsinki-<8 hex aleatorios>`, `clean: true`, `reconnectPeriod: 5000`,
  `connectTimeout: 30000`, `keepalive: 60`, **QoS 0**.
- **Auth**: anónima, no existe clave.
- **Topic HFP v2**:
  `/hfp/v2/journey/ongoing/<event>/<mode>/<oper>/<veh>/<route>/<dir>/<headsign>/<start>/<next_stop>/<geohash_level>/<geohash>/…`
  Prefijo suscrito: `/hfp/v2/journey/ongoing/vp/+/+/+/+/+/+/+/+/+` (solo evento `vp`; nueve `+` = de
  `mode` a `geohash_level`), seguido de las celdas geohash y `/#`.
- **Filtrado espacial por geohash en el topic** (`hfpTopics()`): la celda es
  `<lat>;<lon>/<1er decimal lat><1er decimal lon>/<2º><2º>/…`. Se generan topics a **nivel 2 (celdas de
  0,01°)** cubriendo el bbox **más una celda de margen** por cada lado; si salen más de 400 celdas se
  baja a nivel 1 (0,1°). Ejemplo: `60;24/19/62` para 60.16x, 24.92x.
  - Truco: se redondea antes de `floor` (`toFixed(6)`) para que 60.17 no se convierta en 6016.999… y caiga
    en la celda inferior.
  - El margen sirve para ver **salir** a un vehículo: su primera posición fuera llega por una celda de
    margen y lo elimina, en vez de quedarse congelado en el borde hasta expirar.
- **Formato**: JSON `{ "VP": { … } }`. Campos leídos: `oper`, `veh` (id = `oper/veh`), `tst` (ISO,
  obligatorio), `lat`, `long`, `hdg`, `spd` (m/s), `dl`, `drst`, `occu`, `route`, `desi`, `dir`, `oday`,
  `start`, `loc`, `stop`. Del topic: `mode` (seg. 6), `headsign` (seg. 11), `next_stop` (seg. 13).
- **Conversiones (en un único mapper, `mapVehiclePosition`)**:
  - `route` de HFP = `route_id` GTFS; `next_stop` = `stop_id` GTFS (no el código `H0070` del poste).
  - `dir` HFP 1–2 → `direction_id` GTFS 0–1.
  - `dl` es **negativo cuando va con retraso** → `delaySeconds = -dl`.
  - `drst === 1` → puertas abiertas.
  - `next_stop == "EOL"` → `endOfLine: true`.
  - Modos topic: `bus`/`ubus`→bus, `tram`, `metro`, `train`→rail, `ferry`.
  - `loc` ∈ `GPS | ODO | MAN | DR | N/A` → `positionSource`. **`positionIsMeasured` solo es true con
    `GPS`.** Trampa medida el 2026-09-30: todos los mensajes de metro llevaban `loc: "MAN"`; en túneles
    llega `DR`, y algunos trenes `ODO` sin coordenadas.
- **Gestión en memoria (`VehicleTracker`)**: descarta mensajes fuera de orden por `tst`; elimina el
  vehículo cuya posición más nueva cae fuera del área; un mensaje sin posición conserva la última
  conocida; expira tras `VEHICLE_EXPIRE_AFTER_SECONDS=120`; `stale` tras `VEHICLE_STALE_AFTER_SECONDS=30`.
- **Salud**: como es stream, un feed sintético lee el tracker **cada 2 s** y falla si la conexión está
  caída y en silencio; lanza `Error` plano (no `UpstreamError`) a propósito, para que el poller **no haga
  backoff** sobre lecturas de memoria (el cliente MQTT ya reconecta solo).
- **Licencia**: CC BY 4.0. Texto: `Public transport data © HSL / Digitransit <año>, CC BY 4.0 — https://digitransit.fi/en/developers/apis/7-terms-of-use/`.
  Digitransit pide "© Digitransit <año>" **y la hora de obtención** (`meta.sources[].lastSuccessAt`).

### 1.2 HSL GTFS estático

- **URL**: `https://infopalvelut.storage.hsldev.com/gtfs/hsl.zip` (`GTFS_STATIC_URL`). Anónimo.
- **Cadencia**: HSL lo reconstruye a diario ~03:00 UTC; `POLL_GTFS_STATIC_SECONDS=86400` (suelo 3600).
- **Tamaño y trampas de memoria**: ~76 MB comprimido (2026-09-30). Se **descarga en streaming a disco**
  (`GTFS_WORK_DIR`, por defecto `tmpdir()`, timeout = 15 × 20 s) y se borra al terminar.
  `stop_times.txt` ocupa **959 MB descomprimido y nunca se abre**. `trips.txt` (36 MB) y `shapes.txt`
  (23 MB) se leen **línea a línea** (yauzl + readline), nunca enteros, por el techo de 512 MB.
- **Ficheros leídos**: `stops.txt`, `routes.txt`, `feed_info.txt` (enteros); `trips.txt`, `shapes.txt` (stream).
- **Campos**: `stop_id, stop_code, stop_name, stop_desc, stop_lat, stop_lon, location_type` (solo 0 =
  donde se sube; las estaciones 1 son contenedores), `platform_code, parent_station, vehicle_type,
  wheelchair_boarding`; `route_id, route_short_name, route_long_name, route_type`; `feed_version`;
  `trip: route_id, shape_id, direction_id, trip_headsign`; `shape_id, shape_pt_lat, shape_pt_lon, shape_pt_sequence`.
- **`route_type` de HSL** (contado 2026-09-30): 0 y 900–999 tranvía; 1 y 401 metro; 2 y 100–199 tren de
  cercanías (HSL usa 109); 3 y 700–799 bus; 4, 1000, 1200 ferry. Las paradas llevan el mismo código en
  `vehicle_type` (extensión HSL).
- **Trampas CSV**: RFC 4180 (HSL entrecomilla nombres); BOM inicial; HSL rellena campos opcionales vacíos
  con **un espacio**, así que todo se `trim()`.
- **Transformación de shapes**: por cada shape usada por rutas de tranvía/metro/tren/bus, se guardan solo
  los puntos dentro del área + 0,01° de margen, cortados en "runs" donde la línea sale y vuelve a entrar;
  se cuenta cuántos trips usa cada shape y se elige el **shape más usado por ruta+dirección**
  (`mainShapes`) como trazado cotidiano. Un fallo leyendo shapes cuesta las líneas, nunca las paradas.
- **Licencia**: CC BY 4.0 (HSL/Digitransit), mismo aviso que 1.1.

### 1.3 HSL GTFS-Realtime (trip updates y service alerts)

- **URLs** (base `GTFS_RT_BASE_URL=https://realtime.hsl.fi/realtime`):
  - `https://realtime.hsl.fi/realtime/trip-updates/v2/hsl`
  - `https://realtime.hsl.fi/realtime/service-alerts/v2/hsl`
  Petición con `accept: application/x-protobuf`. Anónimo.
- **Cadencia**: trip updates 30 s (suelo 15); alerts 120 s (suelo 60). HSL no publica límite; los suelos
  son la "cortesía" que promete el servicio.
- **Formato**: protobuf `FeedMessage` (npm `gtfs-realtime-bindings`). `uint64` llega como `number` o
  `Long`; ambos aceptan `Number()`. Sin `header.timestamp` → error.
- **Trip updates**: se aplana a una llamada por parada `{stopId, routeId, directionId, startDate,
  startTime, arrivalAt, departureAt, skipped}`. **Trampa**: HSL **no envía `trip_id`**; la clave de un
  viaje es ruta + fecha de inicio + hora de inicio + dirección, y se pasan las cuatro sin inventar id.
  HSL mantiene en el feed las paradas ya servidas: se descartan las que terminaron hace más de 120 s.
  Trip `CANCELED` o stop `SKIPPED` → `skipped: true`. Mayor cuerpo ~1 MB. Horizonte servido:
  `DEPARTURES_HORIZON_MINUTES=60`.
- **Alerts**: textos traducidos `en`/`fi`/`sv` (header, description, url), `cause`/`effect`/`severity`
  como nombre del enum protobuf (`MAINTENANCE`, `MODIFIED_SERVICE`…), periodos activos, `routeIds`,
  `stopIds` de `informedEntity`.
- **Horas**: todo en UTC salvo `operatingDay/startTime/startDate`, que son hora local de servicio HSL.
- **Licencia**: CC BY 4.0 (Digitransit).

### 1.4 FMI (Ilmatieteen laitos) — calidad del aire urbana (HSY) y meteorología

- **Endpoint**: WFS 2.0 `https://opendata.fmi.fi/wfs` (`FMI_WFS_URL`), consultas almacenadas (stored
  queries) en variante **`::simple`**. Anónimo.
- **Límite publicado por FMI**: **600 peticiones / 5 minutos, compartido por todos detrás de una IP**.
  Por eso: una petición por estación, secuencial; 3 estaciones cada 10 min está muy lejos del límite.
- **URL exacta** (`buildQueryUrl`):
  `https://opendata.fmi.fi/wfs?service=WFS&version=2.0.0&request=getFeature&storedquery_id=<SQ>&fmisid=<id>&starttime=<ISO sin ms, Z>&parameters=<lista>[&timestep=10]`
  - Calidad del aire: `storedquery_id=urban::observations::airquality::hourly::simple`, ventana **180 min**
    (la media horaria puede llegar hasta ~40 min tarde; observado 2026-09-30). Parámetros:
    `NO2_PT1H_avg, NO_PT1H_avg, PM10_PT1H_avg, PM25_PT1H_avg, O3_PT1H_avg, SO2_PT1H_avg, AQINDEX_PT1H_avg`
    (µg/m³; AQINDEX 1 bueno – 5 muy malo).
  - Meteo: `storedquery_id=fmi::observations::weather::simple`, ventana **60 min**, `timestep=10`.
    Parámetros: `t2m, ws_10min, wd_10min, rh, p_sea, r_1h, vis`.
- **Estaciones (`fmisid`)**: calidad del aire `AIR_QUALITY_STATIONS=100742,100662` (Mannerheimintie,
  Kallio 2); meteo `WEATHER_STATIONS=100971` (Kaisaniemi). Catálogo conocido en `fmi.catalogue.ts`:
  108068 Teollisuuskatu, 108105 Herttoniemi 2, 100803 Vartiokylä Huivipolku, 100691 Espoo Leppävaara
  Läkkisepänkuja, 108106 Espoo Tapiola 4, 100763 Vantaa Tikkurila Neilikkatie (aire); 101004 Kumpula,
  100968 Helsinki-Vantaa aeropuerto, 100996 Harmaja (meteo). Un id no listado funciona igual y se sirve
  como `FMI <fmisid>`, porque **la respuesta `simple` trae coordenadas pero no nombre**.
- **Cadencia**: 600 s ambas (suelo 300). `stale`: meteo 30 min, aire horario 2 h.
- **Formato**: XML `wfs:FeatureCollection` con `BsWfs:BsWfsElement` planos (lugar, tiempo, parámetro):
  `gml:pos` ("lat lon"), `BsWfs:Time`, `BsWfs:ParameterName`, `BsWfs:ParameterValue`. Se parsea con
  regex (no hace falta parser XML). `NaN` = no medido/no publicado → `null`. Un `ExceptionReport`
  (parámetro malo, ventana > 168 h) es error. Se toma el valor no nulo más reciente por variable.
- **Resiliencia**: una estación que falla conserva sus lecturas anteriores; el feed solo falla si fallan todas.
- **Trampa**: se piden concentraciones de FMI, no el índice propio de HSY: el WFS de HSY publica solo su
  índice, en otra escala distinta del `AQINDEX` 1–5 de FMI.
- **Licencia/atribución**:
  - `Weather and air quality observations: Finnish Meteorological Institute open data, CC BY 4.0 — https://en.ilmatieteenlaitos.fi/open-data-licence`
  - `Air quality measurements: Helsinki Region Environmental Services (HSY), published through FMI open data.`
  (La redacción exacta que FMI exige para HSY **Needs verification**: se acredita a HSY por nombre.)

### 1.5 OpenStreetMap — vías de tren, metro y tranvía (offline)

- **Script**: `node scripts/build-rail-network.mjs [minLon,minLat,maxLon,maxLat]` → genera
  `src/modules/transit/infrastructure/rail-network.json` (horneado en la imagen; ~270 KB).
- **Endpoint**: `POST https://overpass-api.de/api/interpreter`, `content-type: application/x-www-form-urlencoded`,
  cuerpo `data=<query>`, `user-agent: mw-ts-api-helsinki/build-rail-network`. Anónimo.
- **Query** (bbox = área + 0,004° de margen, en orden S,W,N,E):
  `[out:json][timeout:90];way["railway"~"^(rail|subway|light_rail|tram)$"](<s>,<w>,<n>,<e>);out geom tags;`
- **Salida**: `{ attribution, retrievedAt, area, ways: [{ id, railway, service, coords: [[lon,lat]…] }] }`,
  coordenadas redondeadas a 1e-7, ordenadas por id.
- **Uso**: coloca trenes parados donde el shape GTFS no dibuja nada (andenes, depósitos). Snap a la vía
  OSM de su tipo bajo el fix: `rail→rail` y `metro→subway` dentro de **8 m**, `tram→tram|light_rail`
  dentro de **4 m**, prefiriendo una vía a ≤30° del rumbo (para que un cruce no lo capture). Medido: las
  unidades aparcadas en la estación central estaban a 0,4–4 m de su vía; las vías de andén están a ~5 m.
- **Licencia**: **ODbL 1.0**, aviso `Rail track geometry © OpenStreetMap contributors, ODbL 1.0 — https://www.openstreetmap.org/copyright`.
  `RAIL_NETWORK_ENABLED=false` elimina la capa y su aviso. Re-ejecutar si cambia el área.

### 1.6 Transformaciones de posición (Helsinki)

`/v1/vehicles` sirve el fix crudo de HSL; `/v1/scene` y la API de dispositivos lo dibujan así:

- **Doble vía, circulación por la derecha** (Finlandia). Cada dirección de una línea ferroviaria se
  dibuja 1,9 m a la derecha de la línea media del corredor (3,8 m entre ejes). Medido 2026-09-30: HSL ya
  dibuja cada dirección del tranvía en su vía (~3,2 m), las dos de cercanías sobre una sola línea (0 m),
  y las del metro a 20–46 m (se dejan como están). Emparejamiento solo con tramos de la otra dirección
  que corren antiparalelos (`PAIR_MAX_M=8`, dot < −0,35), vértice a vértice.
- **Buses por la derecha**, 1,7 m del shape. No hace falta red viaria aparte: contra todas las vías OSM
  conducibles del área (Overpass, 2026-09-30), los vértices de shapes de bus HSL están a mediana 0,5 m,
  p99 3,2 m. Ferries sin offset.
- **Snap** al shape más cercano de su ruta y dirección, preferentemente un run que vaya en su sentido
  (penalización 1000 m al run contrario; los bucles como el ring rail pasan dos veces).
- **Fuera de ruta** (`OFF_ROUTE_M`): bus 35 m, tranvía 20 m, metro/tren 30 m; entra si supera el umbral
  5 s seguidos o 1,3× de golpe; sale bajo 0,7× (histéresis).
- **Terminales**: radio `TERMINUS_RADIUS_M` rail 250 m (Helsinki central: 19 vías, andenes de 300 m;
  trenes parados a 10–161 m del final del shape), metro 150, tram/bus 60. Dentro se dibuja en el fix;
  el 20 % exterior del radio mezcla de vía a fix.
- **Separación mínima**: dos vehículos dibujados a < 5 m cuyos fixes están más lejos → se dibujan en sus fixes.
- **Rumbo**: cuando se coloca sobre vía OSM, el rumbo es el de la vía (cuerda sobre la longitud de la
  unidad: 75 m Sm5, 44 m metro), **no el GPS**: las unidades aparcadas reportaban 173–191° en vías de 177°,
  suficiente para girar un modelo de 75 m sobre dos vías vecinas. Además `MotionLog` deriva un rumbo de
  movimiento propio tras ≥10 m de desplazamiento (`HEADING_BASELINE_M`).
- **Unidades acopladas**: HFP reporta cada unidad por separado (2026-09-30: dos unidades de un tren U a
  0,8 m, una con rumbo 24° y otra 175° por ir acoplada al revés). Unidades del mismo viaje
  (modo+ruta+dirección+oday+start) a ≤250 m toman rumbo y estado de la unidad líder (id más bajo) y se
  disponen una tras otra (75 m / 44 m).
- **Estado de movimiento** (`classifyMovement`): "quieto" = `spd` < 0,5 m/s y < 15 m desde donde se le
  vio moverse; `stopped` tras 30 s quieto en ruta, o puertas abiertas, o `spd` 0 durante 10 s; `parked`
  tras 5 min, o 30 s en terminal, o `next_stop=EOL`; `null` los primeros 30 s tras un reinicio (el
  tiempo quieto es una cota inferior). Tras un redeploy los estados tardan hasta 5 min en asentarse.

### 1.7 Modelos 3D (Blender, offline)

- `blender --background --factory-startup --python tools/blender/build_models.py -- assets/models`
  (Blender 5.x). `tools/blender/render_previews.py` para previsualizar.
- Claves por modo: `hsl-tram`, `hsl-bus`, `hsl-metro`, `hsl-train`, `hsl-ferry` (más parada de tranvía,
  entrada de estación, estación meteo). Tranvía Artic (Škoda-Transtech) 27,6 m × 2,4 m; metro estilo M300
  2×22 m como una pieza; cercanías estilo Sm5 75 m.
- Convenciones: metros, tamaño real, **adelante +X**, arriba +Z en Blender (+Y en glTF), origen en el
  centro de la huella a nivel de suelo/carril/línea de flotación, solo PBR sin texturas (decenas de KB).
  Estilizados en colores de modo HSL, no son modelos oficiales.

### 1.8 Lo que se descartó (Helsinki)

- Contadores de peatones/bicis Eco-Counter: el feed se detuvo el **2026-07-05** (los 40 contadores en
  Lidotiku); no hay nada en vivo.
- Tiempos a pie: `/v1/access` solo da distancias en línea recta; puerta a puerta necesita motor de rutas.
- Clave de Digitransit: no se usa ninguna; si se añade, va en `.env.local`.

---

## 2. Helsinki — mapa, ortofoto y 3D de ciudad

### 2.1 Ortofoto WMS de la ciudad de Helsinki

- **URL (GetCapabilities)**: `https://kartta.hel.fi/ws/geoserver/avoindata/wms?SERVICE=WMS&REQUEST=GetCapabilities&VERSION=1.3.0`
- **Capa**: `avoindata:Ortoilmakuva_2024_30cm` (ortofoto 2024, 30 cm). Bbox de uso `[24.78, 60.1, 25.28, 60.3]`.
- **Auth**: ninguna.
- **Atribución**: `Helsingin kaupunki, ortoilmakuva 2024 — CC BY 4.0`.
- **Trampa `imageFormat`**: hay que pedir **`image/png` con `transparent: true`** (y referencia
  `EPSG:3857`). Si se deja sin fijar, Luciad toma el primer formato de las capabilities, un **JPEG**, cuyo
  alfa inexistente pinta de **negro** el área sin datos (fuera del término municipal) por encima de la
  capa global. (La IGN española es lo contrario: `serverFormat: true`, se deja su JPEG.)
- **Trampa GetFeatureInfo**: `model.queryLayers = []`. Si no, el controlador del mapa consultaba la
  ortofoto en cada clic y abría un globo RGB encima del dispositivo clicado.
- Se crea solo cuando la cámara se acerca a su bbox (margen 1°), para no pedir capabilities en otras ciudades.
- Capa global debajo: Sentinel-2 cloudless 2016 (EOX), `https://tiles.maps.eox.at/wmts/1.0.0/s2cloudless_3857/default/GoogleMapsCompatible/{z}/{y}/{x}.jpg`, maxZoom 15, atribución `Sentinel-2 cloudless 2016 — s2maps.eu by EOX IT Services GmbH (Contains modified Copernicus Sentinel data 2016), CC BY 4.0`. Ojo: plantilla `{z}/{y}/{x}` (fila antes que columna).

### 2.2 Edificios LOD2 de Helsinki (3D Tiles)

- **Tileset original**: `https://kartta.hel.fi/3d/datasource-data/16fc3fd5-df6d-4f48-bfd5-9aeee430a02f/tileset.json`
  (OGC 3D Tiles 1.0, contenido `b3dm` con `_BATCHID` por edificio, `RTC_CENTER`, glTF y-up).
  Licencia: **Needs verification** (se asume CC BY 4.0 de Helsingin kaupunki, igual que la ortofoto; no
  consta en el código).
- **Datum vertical**: publicado en **N2000 (ortométrico)**, mientras que el terreno del visor se comporta
  como elipsoidal → la ciudad quedaba **17,6 m bajo el suelo**. Corrección: offset **+17,61 m**
  (ondulación del geoide **FIN2005N00** en Rautatientori; con ella las bases tocan el terreno a 4 cm).
  En BD: `SceneResource.verticalDatum = 'N2000'`, `heightOffsetM = 17.61` (también para las IFC locales
  de la escena). El offset es propiedad del lugar: se declara en el recurso con el datum que corrige, y el
  visor lo aplica como desplazamiento vertical simple (`resourceHeightOffsetM`, tope ±120 m). Nunca se
  adivina en el navegador. Trampa Luciad: poner `transformation` en un `TileSet3DLayer` ya cargado no tiene
  efecto; hay que fijarlo al crear la capa.
- **Trampa de terreno**: la capa «Elevación» por defecto de la escena (DEM español) entierra todo en
  Helsinki: ocultarla.
- **`demo-assets/hel3d_patch.py`** — copia local del tileset con edificios ocultos para poner una IFC en
  su lugar sin z-fighting:
  `python hel3d_patch.py <outdir> <tile.b3dm:batchId,batchId> [...]`
  Descarga `tileset.json`, reescribe cada `content.uri` como URL absoluta a kartta.hel.fi **excepto** los
  tiles parcheados, que se sirven desde `<outdir>`. En esos, colapsa los vértices de los `_BATCHID`
  indicados sobre un punto (triángulos degenerados; buffers del mismo tamaño; el resto del tile intacto).
  Se usó para ocultar la Catedral (feature 13) y la Estación Central (feature 20). Servido como
  `http://localhost:8095/helsinki-lod2-patched/tileset.json` (nginx `demo-assets`, CORS `*`, sin
  `Cache-Control` → tras re-generar hay que forzar `fetch(url, {cache:'reload'})`). Rollback: volver a la
  URL original de kartta.hel.fi.
- **`demo-assets/lod2_ground.py`** — mide la cota del suelo desde el LOD2: recorre el tileset
  (incluidos tilesets anidados `.json`, `region`/`box`), lee los b3dm, aplica **transformaciones de nodo
  glTF y el cambio y-up→z-up** (ambos necesarios) + `RTC_CENTER`, pasa ECEF (EPSG:4978) a geográficas
  (4979) con pyproj y proyecta a EPSG:3879 local; imprime base/techo por edificio en ±150 m. Así se obtuvo
  3,30 m N2000 en Elielinaukio (Vltava 3,28, Postitalo 3,36) y 1,54 m en la estación.

---

## 3. Tokio / Shinjuku (`MW-TS-API-Shinjuku`)

Área por defecto: `AREA_NAME=Shinjuku`, `AREA_BBOX=139.675,35.675,139.745,35.725`. Despliegue:
`deploy/middleware-deployment.json` (`kind: SERVICE`, `route: /shinjuku`, puerto `20000`, imagen por SHA
corto, nunca `latest`). ~60 MiB residentes. **No comprime respuestas** (el proxy no reenvía
`content-encoding`). `npm run probe` (`scripts/probe-sources.ts`) consulta cada feed una vez contra las
fuentes reales: responde "¿es ODPT/JMA o somos nosotros?".

### 3.1 ODPT (Public Transportation Open Data Center) — Toei, endpoint sin clave

- **Base**: `https://api-public.odpt.org/api/v4` (`ODPT_BASE_URL`). **Sin clave.** En `api-public` el único
  operador servido es **Toei** (`odpt.Operator:Toei`). Tokyo Metro, JR East, aeropuertos, etc. responden
  `[]` aquí y requieren **clave registrada en `api.odpt.org`** con **otra licencia** (registro de
  desarrollador en ODPT; **Needs verification** de condiciones). Añadir uno es un feed nuevo con su propio
  texto de licencia, no un parámetro.
- **Patrón de URL**: `https://api-public.odpt.org/api/v4/<tipo>?odpt:operator=odpt.Operator%3AToei`.
- **Formato**: JSON-LD (array). Solo se declaran los campos leídos (ODPT añade campos libremente; un
  esquema estricto rompería). Horas con offset `+09:00` → se convierten a UTC.

| Feed (`id`) | Tipo ODPT | Cadencia | Campos leídos |
|---|---|---|---|
| `odpt.toei.catalogue` | `odpt:Station` + `odpt:Railway` | 86 400 s (suelo 3600) | Station: `owl:sameAs, dc:title, odpt:railway, odpt:stationCode, odpt:stationTitle{ja,en}, geo:lat, geo:long`. Railway: `owl:sameAs, dc:title, odpt:lineCode, odpt:railwayTitle, odpt:color, odpt:stationOrder[{odpt:index, odpt:station}], odpt:ascendingRailDirection, odpt:descendingRailDirection` |
| `odpt.toei.trains` | `odpt:Train` | **20 s** (suelo 15) | `owl:sameAs, dc:date, dct:valid, odpt:railway, odpt:trainNumber, odpt:railDirection, odpt:trainType, odpt:fromStation, odpt:toStation (null = en estación), odpt:originStation[], odpt:destinationStation[], odpt:delay` |
| `odpt.toei.train_information` | `odpt:TrainInformation` | 60 s (suelo 30) | `odpt:railway, odpt:timeOfOrigin, odpt:trainInformationText{ja,en}, odpt:trainInformationStatus, odpt:trainInformationCause, dc:date, dct:valid` |
| `odpt.toei.passenger_survey` | `odpt:PassengerSurvey` | diario | `odpt:station[], odpt:includeAlighting, odpt:passengerSurveyObject[{odpt:surveyYear, odpt:passengerJourneys}]` (se queda solo el último año) |

- **Por qué 20 s en trenes**: el feed también es un reloj. Un segmento se cronometra desde la consulta
  que primero ve al tren en él, así que el intervalo es el error de posición (20 s frente a segmentos
  típicos de 90–120 s).
- **Notas**: `odpt:color` se valida `#RRGGBB` y se pasa a mayúsculas; el tranvía Arakawa y el
  Nippori-Toneri Liner **no tienen color en ODPT** (los endpoints de tránsito devuelven `null`; la escena
  usa un color propio). El estado de línea es **texto libre japonés**: se pasa tal cual, no se interpreta;
  `status`/`cause` solo aparecen si ODPT los envía. `delaySeconds: null` = ODPT no lo dijo (≠ 0).
  `odpt.TrainType:Toei.Express` → etiqueta `Express` (último segmento del id).
- **Trampa de posición de estación**: el punto ODPT no siempre es el andén: mediana 17 m del centro real,
  pero Mita (línea Asakusa) a 267 m y Shiodome a 214 m (el punto cae en el andén de otra línea o en el
  edificio). Por eso se sustituye por el andén MLIT N02 (3.4).
- **Licencia**: `Source: Bureau of Transportation, Tokyo Metropolitan Government, via the Public Transportation Open Data Center (ODPT). Licensed under CC BY 4.0 https://creativecommons.org/licenses/by/4.0/`.

### 3.2 ODPT GTFS-Realtime de autobuses Toei

- **URL**: `https://api-public.odpt.org/api/v4/gtfs/realtime/ToeiBus`, `accept: application/x-protobuf`. Sin clave.
- **Cadencia**: 30 s (suelo 15). `stale` tras **3 min** sin fix (el feed mantiene vehículos que dejaron de reportar).
- **Formato**: `FeedMessage` protobuf, **solo VehiclePosition** (sin trip updates ni alerts, observado
  2026-09-30). Campos: `vehicle.vehicle.id` (o `entity.id`), `vehicle.vehicle.label`, `trip.routeId`,
  `trip.tripId`, `trip.directionId`, `stopId`, `currentStopSequence`, `position.latitude/longitude`,
  `vehicle.timestamp`; `header.timestamp` obligatorio.
- **Trampa clave: no es GPS.** Toei pone cada bus **en la parada que acaba de pasar** (616 posiciones de
  una captura, todas a < 0,7 m de su parada) con la hora a la que pasó. Se marca
  `positionSource: "stop-event"`, `isRealtime: false`. Ver motor de movimiento en 3.8.

### 3.3 ODPT GTFS estático de autobuses Toei

- **URL**: `https://api-public.odpt.org/api/v4/files/Toei/data/ToeiBus-GTFS.zip`. Sin clave.
- **Cadencia**: diaria (`POLL_CATALOGUE_SECONDS`). ~7,5 MB comprimido; techo 32 MB, timeout 60 s.
  `BUS_NETWORK_ENABLED=false` lo omite (los buses quedan solo con ids).
- **Trampa**: el endpoint de ficheros de ODPT responde **`404` a `HEAD`**, así que no se pudo verificar una
  petición condicional; se descarga entero una vez al día.
- **Ficheros**: `routes.txt` (`route_id, route_short_name, route_long_name, route_color, route_text_color`),
  `stops.txt`, `trips.txt` (headsigns), `translations.txt`, `shapes.txt` — leídos enteros con `fflate`
  filtrando entradas. **`stop_times.txt` (75 MB descomprimido) nunca se infla entero**: se hace streaming
  por trozos de 256 KB (`stop-patterns.reader.ts`) leyendo solo **10 trips por shape** (el horario va en
  minutos enteros; la media de 10 resuelve un salto a pocos segundos y salta la mitad del fichero), con
  horas > 24 permitidas. Se cede el event loop entre fases (~0,5 s CPU tablas + 1–2 s patrones, doble bajo
  medio CPU).
- **GTFS-JP `translations.txt`**: nombres en inglés por `record_id` (`table_name=stops`, `field_name=stop_name`);
  los headsigns se traducen **por valor** (`field_value`), no por trip.
- **Trampa de shapes**: los shapes Toei son groseros (mediana 84 m, hasta 2 km entre puntos) → se
  redibujan sobre la red viaria OSM (3.6).
- Nombre corto con dígitos de ancho completo: `都０１（Ｔ０１）` → badge latino `T01`.
- **Licencia**: CC BY 4.0 (mismo aviso ODPT).

### 3.4 MLIT 国土数値情報 N02 (datos ferroviarios) + GTFS de trenes Toei (offline)

- **Script**: `npx tsx scripts/build-network.ts <dir>` → `data/toei-network.json` (~208 KB), commiteado.
  El servicio nunca descarga 12 MB de datos nacionales al arrancar.
- **Entradas en `<dir>`**:
  - `N02-24_RailroadSection.geojson`, `N02-24_Station.geojson` (N02-24, UTF-8) de
    `https://nlftp.mlit.go.jp/ksj/gml/datalist/KsjTmplt-N02-2024.html` (CC BY 4.0). Se filtra
    `N02_004 === '東京都'` (operador); línea en `N02_003`; nombre de estación en `N02_005`.
  - `Toei-Train-GTFS.zip` de `https://api-public.odpt.org/api/v4/files/Toei/data/Toei-Train-GTFS.zip` (CC BY 4.0).
  - `odpt-station.json`, `odpt-railway.json` = `odpt:Station` / `odpt:Railway` con `odpt:operator=odpt.Operator:Toei`.
- **Mapeo ODPT → N02**: `Toei.Asakusa → 1号線浅草線`, `Toei.Mita → 6号線三田線`, `Toei.Shinjuku → 10号線新宿線`,
  `Toei.Oedo → 12号線大江戸線`, `Toei.Arakawa → 荒川線`, `Toei.NipporiToneri → 日暮里・舎人ライナー`.
- **Proceso**: grafo de vía (cada vértice un nodo, aristas en metros); estación ↔ andén N02 por nombre
  normalizado (**trampa**: difieren en kana pequeña, `ヶ`/`ケ`, y espacios); centro de andén, rumbo y
  longitud; camino entre estaciones consecutivas con Dijkstra; tiempo de recorrido = **mediana** de
  `arrival(n+1) − departure(n)` del GTFS (0 < t < 1800 s), clave `fromCode|toCode`; se guarda un sentido
  y el loader genera el inverso. Resultado: las 149 estaciones Toei casadas.
- **Suavizado**: N02 pone un vértice cada ~50 m (hasta 810 m en el Nippori-Toneri) con giros de hasta 74°
  en un vértice. Se encadenan secciones y se suaviza con **Catmull-Rom centrípeta** que pasa por todos
  los vértices, simplificado a 0,25 m. Contrastado con OSM (solo para medir): mediana 5,1 m sin cambio.
  Los andenes no se dibujan encima de la vía.
- **Atribución** (en el fichero): `「国土数値情報（鉄道データ）」（国土交通省）(https://nlftp.mlit.go.jp/ksj/gml/datalist/KsjTmplt-N02-2024.html) を加工して作成 — MLIT National Land Numerical Information, railway data N02-24, processed. CC BY 4.0.` y `Scheduled running times derived from the Toei train GTFS, ODPT. CC BY 4.0.`
- **Nivel**: dentro del área, Asakusa, Mita, Shinjuku y Oedo son `underground` (fijado en
  `transit.service.ts`); el visor debería dibujarlas semitransparentes.

### 3.5 OSM — vía real del tranvía Arakawa (offline)

- **Script**: `npx tsx scripts/build-tram-network.ts <osm.json>` → `data/toei-tram-network.json` (~151 KB).
- **Query Overpass** (ejecutada a mano, salida JSON guardada):
  `[out:json];way["railway"="tram"]["name"~"荒川線"](35.70,139.70,35.76,139.80);out body geom;`
- **Por qué**: N02 dibuja el eje del Arakawa varios metros fuera de los carriles. En Waseda las líneas de
  cada sentido estaban 3,3 m y 7,0 m al norte y terminaban 10 m antes de la topera, así que el tranvía en
  la terminal quedaba sobre el borde del andén.
- **Proceso**: muestrea la línea N02 cada 3 m, la mueve a la línea media de las dos vías OSM (o a la única
  vía en el ramal de Waseda) y guarda `profile` = media separación real (0 en el ramal, ~1,5 m en casi
  toda la línea, más donde un andén central separa las vías). Extiende la línea en la terminal hasta el
  final real de la vía. Estaciones conservan ids; segmentos conservan tiempos N02.
- **Licencia**: ODbL, aviso `Arakawa Line track geometry © OpenStreetMap contributors, available under the Open Database Licence (ODbL) https://www.openstreetmap.org/copyright`.
  `TRAM_TRACK_ENABLED=false` vuelve a N02 y quita el aviso.

### 3.6 OSM — red viaria para buses (offline)

- **Script**: `npx tsx scripts/build-roads.ts <overpass.json> [...]` → `data/osm-roads.json` (~1,8 MB, ODbL).
  Opcional: sin él los buses se ajustan a sus shapes GTFS.
- **Query** (área + ~1,3 km):
  `[out:json][timeout:120]; way["highway"~"^(trunk|trunk_link|primary|primary_link|secondary|secondary_link|tertiary|tertiary_link|unclassified|residential|living_street|service|busway)$"](35.664,139.660,35.736,139.760); out body geom;`
- **Filtro**: fuera autopistas (la **Shuto Expressway elevada**, que ningún bus Toei del área usa y que el
  camino más corto tomaría), `service=alley|driveway|parking_aisle|drive-through|emergency_access`,
  `area=yes`, privados salvo `bus`/`psv=yes|designated|permissive`. Sentido único con `oneway`,
  `junction=roundabout`, `oneway:bus|psv=no`.
- **Formato**: nodos planos en micro-grados (~0,1 m), ways `[clase, oneway, ...índices]`. Coste por clase
  `main 1, minor 1.15, local 1.6, service 3` (los buses prefieren vías principales).

### 3.7 OSM — accesos de estación (offline)

- **Script**: `ODPT_STATIONS=<odpt-station.json> npx tsx scripts/build-entrances.ts <osm.json> [...]` →
  `data/toei-entrances.json` (~36 KB): 329 accesos para 85 estaciones Toei.
- **Query**: `[out:json];node["railway"="subway_entrance"](35.55,139.55,35.85,139.95);out;`
- **Casado**: acceso con `name` igual al de la estación (sin `駅`) a < 500 m del andén; acceso sin nombre a
  < 150 m de exactamente el andén Toei más cercano. Se excluyen los de otro `operator` (regex
  `都営|東京都交通局|Toei`). Guarda `osmId, ref` (p. ej. `A2`, `東口`), `wheelchair`, `level`.
- **Licencia**: ODbL, `ENTRANCES_ENABLED=false` elimina capa y aviso.

### 3.8 Transformaciones de posición (Shinjuku)

- **Trenes** (ODPT solo dice "entre A y B" o "en A"; medido: "entre" dura mediana 36 s, "en estación" 90 s,
  e incluye aproximación y salida):
  1. En "entre A y B" avanza hacia el **80 %** (`RUN_END`) del tramo A→B por la vía real, a un ritmo
     aprendido de cuánto dura ese estado en ese segmento (≥2 muestras por segmento, ≥5 en la red; 15
     muestras por segmento), estirado ×1,5.
  2. Al pasar a "en B" frena desde donde iba, a su velocidad, hasta el centro del andén (10–60 s; 25 s
     por defecto).
  3. Parado mira hacia donde llegó; al salir parte del andén. Un tren ya en marcha al arrancar se supone
     al 40 %.
  - Tope **19,4 m/s (70 km/h)**, máximo de la línea Oedo. Validación (2026-09-30, 609 muestras cada 3 s):
    mediana 61 km/h, máx 70; llegada mediana 35 km/h. Dos versiones previas rechazadas (cronometraje
    contra horario que dejaba trenes al 30 % y luego saltaban; sin tope, hasta 130 km/h).
  - `positionIsApproximate: true`, `motion.timing ∈ tracked | assumed | arriving | standing`.
  - **Composición**: coche a coche sobre la vía (Oedo 8 × 16,5 m; Shinjuku 10 × 20 m; tranvía 1 coche),
    posición = centro del tren. **Circulación por la izquierda** (Japón), offset por sentido
    `TRACK_OFFSET_M = 1.9` en código (el doc `scene-presentation.md` dice 1,8 m: discrepancia menor).
- **Buses** (de "parada pasada" a movimiento): dibujado en su carril (`LANE_OFFSET_M = 1.7` a la
  izquierda de la vía OSM que sigue su ruta) avanzando desde la parada pasada hacia la siguiente del patrón
  del trip (GTFS `stop_times`), al ritmo del horario escalado por lo más lentos que se ven los buses
  (aprendido de reportes consecutivos; ×2 hasta tener datos, medido a las 17:16 JST). Espera al **90 %**
  hasta que llegue la siguiente parada; `stopped` tras 30 s allí; `parked` tras 5 min o 30 s en la
  primera/última parada; al llegar el nuevo reporte, continúa en 15 s sin saltar. Reporte en una parada que
  su trip no tiene → `off-route`. Dos buses del mismo carril a < 13 m se encolan una longitud de bus.
  Si algún día el feed manda GPS: snap al carril a ≤ 35 m, fuera más allá y de vuelta a < 25 m
  (`BACK_ON_ROUTE_M`); quieto = < 15 m (`STILL_RADIUS_M`).

### 3.9 JMA AMeDAS (meteorología)

- **Base**: `https://www.jma.go.jp/bosai/amedas` (`JMA_BASE_URL`). **No es una API documentada**: son los
  ficheros que carga la propia página de mapa AMeDAS de JMA; pueden cambiar sin aviso y no hay cuota
  publicada → una forma inesperada falla ruidosamente. Sin clave.
- **URLs**:
  - Tabla de estaciones: `https://www.jma.go.jp/bosai/amedas/const/amedastable.json` (diaria).
  - Última hora publicada: `https://www.jma.go.jp/bosai/amedas/data/latest_time.txt` (p. ej. `2026-09-30T17:10:00+09:00`).
  - Observaciones de toda la red: `https://www.jma.go.jp/bosai/amedas/data/map/<YYYYMMDDHHmmss>.json`
    (p. ej. `map/20260930171000.json`), ~250 KB.
- **Cadencia**: `POLL_WEATHER_SECONDS=60` (suelo 60) para `latest_time.txt`; **el mapa de 250 KB solo se
  descarga cuando cambia la hora** (JMA publica cada 10 min). `stale` tras 2 publicaciones perdidas.
- **Trampa de nombre de fichero**: se construye con los **mismos dígitos de reloj en hora de Japón** del
  texto (regex `^(\d{4})-(\d{2})-(\d{2})T(\d{2}):(\d{2}):(\d{2})\+09:00$`), no con aritmética de fechas, para
  que la zona horaria del host no lo desplace.
- **Formato**:
  - `amedastable.json`: `{"44132":{"kjName":"東京","enName":"Tokyo","lat":[35,41.5],"lon":[139,45.0],"alt":25,…}}`
    — **lat/lon en `[grados, minutos]`** → decimal = g + m/60.
  - Mapa: por estación, cada valor es `[valor, códigoCalidad]`: `temp, humidity, pressure, normalPressure,
    precipitation10m, precipitation1h, precipitation24h, wind, windDirection` (código de 16 rumbos). Los
    códigos de calidad y el código de viento se pasan tal cual, sin interpretar.
- **Selección**: las `WEATHER_STATION_COUNT=3` estaciones más cercanas al centro del área, con
  `distanceKm` (Tokyo/Kitanomaru está a 3,7 km del centro por defecto). No es "el tiempo en la estación".
- **Licencia**: Public Data License 1.0 (compatible CC BY 4.0), exige fuente y nota de procesado
  (https://www.jma.go.jp/jma/kishou/info/coment.html). Texto:
  `出典：気象庁ホームページ (https://www.jma.go.jp/bosai/amedas/) — Source: Japan Meteorological Agency, AMeDAS. Processed by InGreen (values selected, renamed, times converted to UTC). Public Data License 1.0.`

### 3.10 Modelos 3D (Blender, offline)

- `blender --background --factory-startup --python tools/blender/build_models.py -- assets/models`
  (Blender 5.2). `render_previews.py` y `render_consist.py` (tren en curva).
- 11 modelos, 16–87 KB, 200–1 600 triángulos (un Oedo de 8 coches ~9 000 triángulos frente a los 3,3 MB del
  `train.glb` antiguo): `toei-oedo-12000` (+`-middle`, `-middle-pantograph`, pantógrafo en coches 3 y 6),
  `toei-shinjuku-10300` (+ variantes; pantógrafo en 3, 6, 8), `toei-arakawa-8900`, `toei-bus`,
  `station-entrance`, `tram-stop`, `weather-station`. Colores ODPT (Oedo `#CF3366`, Shinjuku `#9FB01C`).
  Mismas convenciones que Helsinki (+X adelante, faros en +X, pilotos rojos en −X). Servidos en
  `/v1/scene/models/{key}.glb`; el tamaño se lee de los min/max de los accessors `POSITION` del chunk JSON del GLB.

---

## 4. Japón — mapa, terreno y 3D de ciudad (lado visor)

Todo en `CDE-Frontend-devices/src/shared/components/map/basemapImagery.ts` (commits locales `3dfc7fcd`
DEM10B y `0f9d91a6` láser) salvo indicación.

### 4.1 Ortofoto GSI (地理院タイル シームレス空中写真)

- **XYZ**: `https://cyberjapandata.gsi.go.jp/xyz/seamlessphoto/{z}/{x}/{y}.jpg` (esquema Google, y desde el norte).
- Sin clave. `maxZoom: 18`, **`firstZoom: 2`**: GSI empieza en z2; los tiles más someros se toman de la capa
  global, porque un tile ausente en la cima de la pirámide impide que Luciad descienda a los propios.
  Bbox Japón `[122.9, 20.4, 154.0, 45.6]`. Luciad cuenta filas desde el sur: `y_xyz = 2^z − 1 − y_luciad`.
  No se pone zoom mínimo: si un padre devuelve null, Luciad no pide los hijos y deja la región en blanco.
- **Atribución**: `地理院タイル (シームレス空中写真) — Geospatial Information Authority of Japan`
  (las condiciones de GSI piden citar 「国土地理院」/地理院タイル; **Needs verification** de la redacción exacta).

### 4.2 Elevación GSI DEM10B (`dem_png`)

- **XYZ**: `https://cyberjapandata.gsi.go.jp/xyz/dem_png/{z}/{x}/{y}.png`, z0–14. Sin clave.
- **Codificación**: `v = R·2¹⁶ + G·2⁸ + B` en **centésimas de metro**, complemento a dos sobre 24 bits;
  **2²³ (0x800000) = sin dato** (se trata como nivel del mar); alfa 0 también sin dato. Alturas
  **ortométricas (TP)**.
- **Lectura correcta del PNG**: `createImageBitmap(blob, { colorSpaceConversion: 'none', premultiplyAlpha: 'none' })`
  → `OffscreenCanvas` → `getImageData` (son alturas, no colores).
- **Por qué**: la «Elevación» mundial es inútil en Japón: el 2026-10-01 daba 29,8 m en la parada de
  tranvía de Waseda (láser GSI 7,8 m TP; rellena el valle del Kanda) y ~4 m de más en la estación de
  Shinjuku; edificios PLATEAU e IFC se hundían y los vehículos flotaban.
- **Árbol de tiles**: bloque 2×3 de tiles XYZ z5 (`x 27–28, y 11–13`: lon 123,75–146,25, lat ~21,9–48,9,
  Kyushu a Hokkaido) como nivel 0 de Luciad (`JAPAN_DEM_TREE = { z0: 5, x0: 27, y0: 11, columns: 2, rows: 3 }`),
  de modo que cada tile Luciad es exactamente un tile GSI.
- **Trampa**: DEM10B va por encima del láser en sitios (9,8 m en Waseda vs 7,8; 37,6 m en Tochōmae A4 vs 34,5).

### 4.3 Elevación GSI láser 5 m (`dem5a`) — reconstrucción de tiles

- **XYZ PNG**: `https://cyberjapandata.gsi.go.jp/xyz/dem5a_png/{z}/{x}/{y}.png` (solo **z15**). Variante texto:
  `https://cyberjapandata.gsi.go.jp/xyz/dem5a/15/{x}/{y}.txt` (CSV 256×256, `e` = sin dato).
- Es el suelo del levantamiento láser **con los edificios quitados**, con huecos (agua, zonas no voladas,
  **bajo cada edificio**).
- **Problema**: Luciad no pide z15 en vistas de calle, y poner el láser solo en el último nivel hacía saltar
  el suelo 2 m en ese cambio de zoom.
- **Solución (`LASER_FROM_ZOOM = 13`)**: desde z13, cada tile DEM10B se **reconstruye** con los tiles
  dem5a z15 que cubre (`laserTilesUnder`: n = 2^(15−z) por lado): cada píxel = **media de los píxeles láser**
  que cubre; un tile láser ausente (404) o fallido deja su parte al DEM base.
- **Relleno de huecos (`mergeLaserHeights`, `LASER_GAP_FILL_PX = 16`)**: los huecos se rellenan desde los
  píxeles láser vecinos (16 pasadas de dilatación con media 3×3) y solo lo que sigue vacío (mar, zonas no
  voladas) usa DEM10B. **Trampa**: rellenar directamente con DEM10B dejaba las huellas de los edificios de
  Shinjuku hasta 4 m por encima de la calle (Tochōmae).
- Resultado: alturas coherentes en todos los niveles desde z13 (34,5 m en Tochōmae A4, 7,8 m en Waseda).
- **Entrega a Luciad (Luciad RIA 2024.0)**:
  - No hay ruta raw para elevación: un `TileData` `FLOAT_32` llega a un decoder de imagen sin `decodeRaw`
    y falla (`decodeRaw is not a function`, 2026-10-01).
  - Se entrega como **TIFF sin comprimir, una tira, little-endian** (lo que sirve Fusion):
    primero int16 en metros enteros (`encodeInt16Tiff`, como Fusion), luego **float32**
    (`encodeFloat32Tiff`, `SampleFormat=3`) porque redondear al metro desplazaba el suelo hasta 0,5 m respecto
    de PLATEAU y las IFC. `mimeType: 'image/tiff'`.
  - Luciad 2024.0 admite **una sola capa de elevación visible**; la capa mundial es `STATIC` y una `BASE`
    no puede ir encima → la regional se crea `STATIC` y se inserta justo encima de la mundial cuando esta
    ya está en el árbol (si no, se espera al siguiente cambio de cámara).
  - Los tiles decodificados se registran en `terrainSampler` (`registerTerrainTile`) para que los vehículos
    se inclinen con la pendiente.
- **Atribución**: `地理院タイル 標高タイル (DEM10B)` / `(DEM5A) — Geospatial Information Authority of Japan`.

### 4.4 `demo-assets/gsi_laser.py` (offline, para colocar modelos)

- `LaserGround()` descarga y cachea tiles texto dem5a z15 en `demo-assets/landmarks/.gsi_dem5a_cache/15_<x>_<y>.txt`
  (`User-Agent: InGreenDemo/1.0`, timeout 30 s).
  - `height(lat, lon)`: bilineal en metros TP sobre píxeles z15 (huecos sustituidos por la media de los válidos).
  - `scene_height(lat, lon)`: **emula el terreno que dibuja la escena**: tiles z14 = media 2×2 de láser +
    16 pasadas de relleno, bilineal entre centros de píxel (igual que `mergeLaserHeights`).
  - `local(lat0, lon0, h0)` → `f(x_este_m, y_norte_m)` altura relativa a `h0`.
- Medido: los picks TERRAIN de la escena aún difieren ±0,2 m (LOD de Luciad) → los objetos a nivel de
  suelo llevan faldones de 0,3–0,5 m. Modelos re-anclados en TP real: **Waseda 7,88 m, Tochōmae A4 34,58 m**.

### 4.5 APIs GSI de geoide y elevación puntual (consulta manual)

No están en código; se usaron a mano en sesión para medir el datum. Sin clave. URLs **Needs verification**
de parámetros exactos:

- Geoide (GSIGEO2011): `https://vldb.gsi.go.jp/sokuchi/surveycalc/geoid/calcgh/cgi/geoidcalc.pl?outputType=json&latitude=<lat>&longitude=<lon>`
  → altura del geoide N.
- Elevación puntual: `https://cyberjapandata2.gsi.go.jp/general/dem/scripts/getelevation.php?lon=<lon>&lat=<lat>&outtype=JSON`
  → `elevation` (m TP) y `hsrc` (fuente: 5m láser, 10m…).
- Ventaja: no hace falta PROJ ni modelo de geoide local.

### 4.6 PLATEAU 3D Tiles (Shinjuku-ku, código 13104)

Recursos de la escena `HgV9I_Azri` («Shinjuku en vivo — Toei») en `cde_backend_devices`, todos
`type = ogc3dtiles`, `verticalDatum = 'ELLIPSOIDAL'`, `heightOffsetM = -37.06`:

| Nombre | URL |
|---|---|
| `plateau-shinjuku-lod2-buildings` | `https://assets.cms.plateau.reearth.io/assets/ad/52340f-3f7f-470e-918e-38eb9c27e2db/13104_shinjuku-ku_pref_2023_citygml_2_op_bldg_3dtiles_13104_shinjuku-ku_lod2/tileset.json` |
| `plateau-shinjuku-frn-lod3` (mobiliario urbano) | `https://assets.cms.plateau.reearth.io/assets/73/b39ed2-77ae-43fd-a874-6d24f22d8cd2/13104_shinjuku-ku_pref_2025_citygml_1_op_frn_3dtiles_lod3/tileset.json` |
| `plateau-shinjuku-veg-lod3-trees` | `https://assets.cms.plateau.reearth.io/assets/14/eaba66-7161-4b43-96b5-7a140bce6cbf/13104_shinjuku-ku_pref_2025_citygml_1_op_veg_SolitaryVegetationObject_3dtiles_lod3/tileset.json` |
| `plateau-shinjuku-veg-lod3-cover` | `https://assets.cms.plateau.reearth.io/assets/fb/650c98-a675-4675-97fa-eb67bee76717/13104_shinjuku-ku_pref_2025_citygml_1_op_veg_PlantCover_3dtiles_lod3/tileset.json` |
| `plateau-shinjuku-ubld-lod4` (subterráneo) | `https://assets.cms.plateau.reearth.io/assets/7d/d6f2c5-80ca-4c58-ac34-a67de3786d04/13104_shinjuku-ku_pref_2025_citygml_1_op_ubld_3dtiles_lod4/tileset.json` |
| `plateau-shinjuku-tran-lod3` (viario) | `https://assets.cms.plateau.reearth.io/assets/5d/8e46a6-98de-4829-8e4f-656c7cc89348/13104_shinjuku-ku_pref_2025_citygml_1_op_tran_3dtiles_lod3/tileset.json` |

- CDN de Re:Earth CMS de PLATEAU, sin clave. Las URLs llevan un hash de asset: se obtienen del catálogo
  PLATEAU (CKAN de G空間情報センター / PLATEAU VIEW); **Needs verification** del método exacto con el que
  se localizaron. Licencia: términos de Project PLATEAU (compatibles CC BY 4.0) — **Needs verification**;
  no hay texto de atribución en el código.
- **Datum**: las alturas PLATEAU 3D Tiles son **elipsoidales**. Medido 2026-09-30: base de edificio 41,44 m
  frente a suelo GSI 4,7 m + N GSIGEO2011 37,09 m. Offset aplicado **−37,06 m** (N en la estación de
  Shinjuku) → los edificios quedan ortométricos, sobre el terreno GSI (TP).
- **No existe IFC abierta real** para Shinjuku (PLATEAU convierte BIM a CityGML pero no publica IFC;
  revisado CKAN y GitHub). Las IFC de la escena (Waseda, Tochōmae A4) son autorizadas a mano, con posición
  de OSM (ODbL), suelo de GSI y valores de activo marcados como demo; servidas desde
  `http://localhost:8095/tokyo-*/tileset.json` **sin datum** (ya están en TP).
- Trampa de visor: `TileSet3DLayer.isPartOfTerrain` es true por defecto y el terreno tapa los iconos; se
  desactiva (`asSceneContent`). Una cámara al sur del pabellón de Tochōmae cae dentro del edificio de la
  Asamblea de PLATEAU, que vuela sobre la acera.

---

## 5. Resumen de datums verticales

| Recurso | Datum publicado | Offset aplicado | De dónde sale |
|---|---|---|---|
| Helsinki LOD2 (kartta.hel.fi) e IFC locales de Helsinki | N2000 (ortométrico) | **+17,61 m** | Geoide FIN2005N00 en Rautatientori; bases a 4 cm del terreno |
| PLATEAU Shinjuku (todas las capas) | Elipsoidal (GRS80) | **−37,06 m** | N GSIGEO2011 en estación de Shinjuku (vldb.gsi.go.jp) |
| Terreno Japón (GSI DEM10B / dem5a) | TP (ortométrico) | 0 | Referencia a la que se llevan los demás |
| IFC Tokio (Waseda 7,88; Tochōmae 34,58) | TP, anclado en origen | ninguno | `gsi_laser.py` |

Regla: cuando la altura de un modelo 3D se ve mal, **comprobar primero el datum** antes de afinar offsets a
mano. El offset se declara por recurso (`verticalDatum` + `heightOffsetM`, ambos o ninguno; tope 120 m) y se
aplica al crear la capa.

---

## 6. Inventario de ficheros estáticos generados

| Fichero | Generador | Fuente | Licencia |
|---|---|---|---|
| `MW-TS-API-Helsinki/src/modules/transit/infrastructure/rail-network.json` | `scripts/build-rail-network.mjs` | Overpass (OSM) | ODbL |
| `MW-TS-API-Helsinki/assets/models/*.glb` | `tools/blender/build_models.py` | procedural | propio |
| `MW-TS-API-Shinjuku/data/toei-network.json` (~208 KB) | `scripts/build-network.ts` | MLIT N02-24 + Toei-Train-GTFS + ODPT | CC BY 4.0 |
| `MW-TS-API-Shinjuku/data/toei-tram-network.json` (~151 KB) | `scripts/build-tram-network.ts` | Overpass (OSM) + toei-network.json | ODbL |
| `MW-TS-API-Shinjuku/data/osm-roads.json` (~1,8 MB) | `scripts/build-roads.ts` | Overpass (OSM) | ODbL |
| `MW-TS-API-Shinjuku/data/toei-entrances.json` (~36 KB) | `scripts/build-entrances.ts` | Overpass (OSM) + ODPT Station | ODbL |
| `MW-TS-API-Shinjuku/assets/models/*.glb` (~330 KB) | `tools/blender/build_models.py` | procedural | propio |
| `demo-assets/landmarks/.gsi_dem5a_cache/*.txt` | `gsi_laser.py` | GSI dem5a | GSI |
| `demo-assets/tiles/helsinki-lod2-patched/` | `hel3d_patch.py` | kartta.hel.fi LOD2 | Needs verification |

`demo-assets` **no es un repositorio git**: lo que hay allí no está versionado.

---

# Parte D — Singapur y Barcelona

# Fuentes de datos externas: Singapur y Barcelona

Documento de conservación de conocimiento. Explica **cómo se obtiene cada fuente externa** en los dos
conectores (`MW-TS-API-SG-Stations` y `MW-TS-API-Barcelona`) y en la parte de mapa de Barcelona del
frontend (`CDE-Frontend-devices`, `demo-assets`). Está escrito para reconstruir un producto nuevo sin la CDE.
Los identificadores, URLs y nombres de campo van tal cual. Las credenciales **no** aparecen: donde hace falta
una se indica «necesita clave, guardada en `.env.local`».

Fuentes leídas (2026-10-08): `README.md`, `docs/*.md`, `src/**`, `scripts/**`, `tools/blender/**` y `data/`
de ambos repos; `src/modules/scenes/utils/rainRadar.ts`, `RainRadarStrategy.ts`, `utils/mapbox/*`,
`SceneMapboxPreview.tsx` y `src/shared/components/map/basemapImagery.ts` del frontend;
`demo-assets/tools/icgc_ground*.py` y `demo-assets/tilecache/`; tabla `SceneResource` de
`cde_backend_devices` (consulta de solo lectura).

---

## 0. Patrones comunes a los dos conectores

Esto se repite en ambos y conviene copiarlo en cualquier producto nuevo.

- **Servicio en memoria con sondeo propio.** Cada fuente es una tarea con su propio temporizador. Nunca se
  solapa consigo misma: el siguiente intento se programa cuando el anterior ha terminado. Un fallo conserva
  la última instantánea, así que una fuente caída se ve en gris y no desaparece.
- **Un suelo para cada intervalo de sondeo**, igual al ritmo de publicación de la fuente (validado con `zod`
  en `src/config/env.ts`). Sondear más rápido solo gasta cuota.
- **Staleness al leer.** Cada valor lleva `observedAt`, `staleAfter` (o un umbral por fuente) y un flag `stale`
  que se calcula en cada petición. El umbral es aproximadamente «tres publicaciones perdidas».
- **`null` frente a `[]`.** `null` significa que la fuente no ha respondido nunca y `[]` que respondió sin
  datos aplicables. No se pintan igual.
- **`kind` en cada valor:** `observed`, `reported`, `estimated`, `forecast` o `derived`. Nada se mezcla:
  por ejemplo, el pronóstico de aglomeración nunca se combina con el valor en tiempo real.
- **Validación estricta del payload.** Si la forma cambia, el mapper lanza un error en vez de devolver `[]`,
  porque `[]` haría que «la forma cambió» se leyera como «no pasa nada».
- **Errores sin secretos.** El mensaje de un fallo upstream nombra el host y la ruta, nunca las cabeceras ni
  la query. En SG, además, el cuerpo de error se redacta antes de recortarlo (ver LTA).
- **Hora local con base de datos tz.** La conversión usa `Intl` (Europe/Madrid, UTC+8 en SG). No se usan
  offsets fijos, que fallan medio año por el cambio de hora.
- **Atribución en cada respuesta.** La exigen las licencias y la CDE la tiene que mostrar.
- **Sin compresión HTTP** (SG): el middleware reenvía `content-type` pero no `content-encoding`, así que un
  cuerpo gzip llegaría etiquetado como JSON plano.
- **Datos estáticos horneados en la imagen** (`data/*.json`). Un despliegue no recibe volumen, de modo que todo
  lo que se calcula offline viaja dentro de la imagen.

---

# Singapur — `MW-TS-API-SG-Stations`

Servicio de tipo `API`, puerto `20000`. Une el estado en vivo de cada estación MRT/LRT a partir de fuentes que
no se conocen entre sí: código LTA (`EW13`) → ubicación → línea → estación meteorológica más cercana
(con la distancia), todo en UTC y con flag `stale`.

## SG.1 LTA DataMall (Land Transport Authority)

- **Base:** `https://datamall2.mytransport.sg/ltaodataservice`
- **Auth:** clave de cuenta en la **cabecera** `AccountKey` (necesita clave, guardada en `.env.local` como
  `LTA_ACCOUNT_KEY`). Se solicita registrándose en el portal LTA DataMall (`datamall.lta.gov.sg`, formulario
  «Request for API Access»; *Needs verification*: el repo no documenta el proceso de alta). Sin clave el
  servicio arranca igual, marca las fuentes LTA como deshabilitadas (`LTA_ACCOUNT_KEY is not set`) y sirve
  solo el tiempo atmosférico.
- **Cabeceras enviadas:** `accept: application/json`, `AccountKey`. Timeout de 15 s por petición.
- **Referencia:** *DataMall API User Guide v6.9 (3 Aug 2026)*. La guía publica tablas de atributos, no
  sobres completos (las muestras de Train Service Alerts son capturas de pantalla), así que cada esquema se
  contrastó con una respuesta real mediante `npm run probe:lta` (`scripts/probe-lta.ts`). Ese script consulta
  cada endpoint con la clave, valida contra los mappers, imprime estado, número de registros y el timestamp
  más reciente, y guarda los cuerpos redactados en `probe-output/` (en `.gitignore`). Prueba también
  `/v3/BusArrival?BusStopCode=83139` y `/CarParkAvailabilityv2` como candidatos futuros.
- **Paginación:** los endpoints de lista paginan en bloques de 500 con `$skip` y no dan total, así que una
  página corta es la última (máximo 20 páginas).

### Dos vocabularios de línea (trampa)

`PCDRealTime` y `PCDForecast` aceptan `TrainLine` = `EWL, CGL, NSL, NEL, CCL, CEL, DTL, TEL, BPL, SLRT,
PLRT`, que separan `CEL`/`CGL` de su línea madre. En cambio, `TrainServiceAlerts` y `FacilitiesMaintenance`
devuelven `STL`/`PTL` y pliegan las extensiones en `CCL`/`EWL`. La tabla `src/domain/lines.ts` es el único
punto de traducción: `code` → `alertsCode`, prefijos de código de estación (los hubs LRT son `STC` y `PTC`)
y color oficial de línea (`#009645` EWL, `#D42E12` NSL, `#9900AA` NEL, `#FA9E0D` CCL, `#005EC4` DTL,
`#9D5B25` TEL y `#748477` LRT).

### SG.1.a `PCDRealTime` — aglomeración en andén (tiempo real)

- `GET /PCDRealTime?TrainLine=<línea>`: **una tarea por línea**, para que si una línea falla no se vacíe el
  resto de la red.
- Respuesta `{ value: [{ Station, StartTime, EndTime, CrowdLevel }] }`. `CrowdLevel` vale `l`/`m`/`h`
  (`low`/`moderate`/`high`) o `NA`.
- **Transformación:** una observación por estación y ventana de 10 min, con `kind: estimated` y
  `variable: crowd_level`. **Es una categoría, nunca un recuento de personas.** `NA` se guarda como `null`, no
  como `low`.
- **Cadencia:** cada 600 s, que también es el suelo.
- **Latencia (medida el 2026-09-30):** LTA publica con 12–30 min de retraso variable (a las 16:22 SGT la
  última ventana terminaba a las 16:10; a las 18:10 terminaba a las 17:40). Si se suman hasta 10 min de
  sondeo propio, la ventana más reciente puede llevar ~40 min cerrada. Por eso `staleAfter = EndTime + 45 min`.
  El umbral tiene que significar «LTA dejó de publicar» y no «LTA va con su retraso habitual». Una línea
  parada sigue detectándose: CEL sirvió toda una tarde una ventana de las 23:40 de la noche anterior.
- El historial de aglomeración solo vive en memoria (`CROWD_HISTORY_HOURS`, 1–48, por defecto 24) y se pierde
  al reiniciar. `/crowd/history` indica con `since` desde cuándo hay datos.

### SG.1.b `PCDForecast` — pronóstico de aglomeración (cuota pequeña)

- `GET /PCDForecast?TrainLine=<línea>`, una tarea por línea.
- Respuesta `{ value: [{ Date, Stations: [{ Station, Interval: [{ Start, CrowdLevel }] }] }] }`. Los
  intervalos son de 30 min y solo se publica el inicio.
- **Transformación:** una observación por estación e intervalo (`kind: forecast`), con
  `staleAfter = ingestedAt + 26 h`. Nunca se mezcla con el tiempo real.
- **Cadencia:** 12 h (suelo 1 h). LTA lo publica una vez al día y **su cuota es pequeña**.
- **Incidente del 2026-10-01:** un día de arranques y redespliegues agotó la cuota, y durante horas todas las
  llamadas respondieron «Rate limit quota violation». Dos medidas:
  1. **Caché en disco** `FORECAST_CACHE_PATH` (por defecto `var/forecast-cache.json`; en la imagen,
     `/app/var`). Al arrancar se sirve el pronóstico cacheado si tiene menos de 24 h, y esa línea no se consulta
     hasta que le toca (`firstPollInSeconds`). La escritura es atómica (fichero `.tmp` + `rename`) y de mejor
     esfuerzo: un fichero corrupto equivale a «sin caché» y un fallo de escritura solo se registra en el log.
     **Solo sobrevive a un redespliegue si el despliegue monta un volumen en `/app/var`**; sin volumen, cubre
     los reinicios del mismo contenedor.
  2. **Backoff de cuota** distinto (ver SG.1.e).

### SG.1.c `TrainServiceAlerts` — incidencias del servicio

- `GET /TrainServiceAlerts`, cada 120 s (suelo 60). `staleAfter = poll + 10 min`: se tolera un sondeo
  perdido, dos no.
- Respuesta: `{ value: {...} }` o `{ value: [{...}] }`; se han visto ambas formas y se aceptan las dos. Cuerpo:
  `Status` (2 = interrumpido), `AffectedSegments[{ Line, Direction, Stations (CSV), FreePublicBus (CSV),
  FreeMRTShuttle (CSV), MRTShuttleDirection }]`, `Message[{ Content, CreatedDate }]`.
- `CreatedDate` viene como `2026-09-30 16:06:11`, hora local de Singapur sin offset; se le añade `+08:00`.
- **Transformación:** una observación `service_disruption` por estación afectada (`kind: reported`,
  `disrupted` o `minor_delay`, línea, sentido, bus y lanzadera gratuitos) **más** una observación `advisory`
  por mensaje sobre la entidad de red `SG`. **Motivo:** la mayoría de los mensajes no nombran estación. El
  2026-09-30 el feed llevaba un desvío de autobús en Woodlands y un cierre de meses del Sengkang LRT, ambos
  con `AffectedSegments: []`. Si solo se mapeaban segmentos, se perdían, y son justo lo que un operador quiere
  leer. «Si sigue listado, sigue vigente»: la frescura es la del sondeo, no la antigüedad del mensaje.

### SG.1.d `v2/FacilitiesMaintenance` — ascensores en mantenimiento

- `GET /v2/FacilitiesMaintenance?$skip=N`, paginado y fusionado en un único `{ value: [...] }`. Cada 1 800 s
  (suelo 300), con `staleAfter = poll + 90 min`.
- Campos: `Line, StationCode, StationName, LiftID, LiftDesc` → observación `lift_maintenance`.
- **Limitación:** LTA no publica inventario de ascensores, solo los que están en mantenimiento. Los ascensores
  solo pueden mostrarse como incidencia sobre una estación, no como activos.

### SG.1.e Límites, errores y backoff (LTA)

- **Ráfagas:** cuando una ráfaga supera el rate limit, LTA responde con un `500` «Rate limit quota
  violation» que se despeja en segundos. Se observó el 2026-09-30 al arrancar once sondeos de pronóstico a la
  vez. Respuesta adoptada: ante `429`, `5xx` o error de red, reintento a los **60 s, duplicando hasta 8
  intervalos**. Se empieza en 60 s y no en el intervalo porque un pronóstico de 3 h duplicado a 6 h habría
  esperado sin necesidad.
- **Cuota agotada:** también llega como `500`, pero el cuerpo contiene el código de Apigee
  `policies.ratelimit.QuotaViolation` y no se despeja en segundos. Se detecta buscando ese código en el cuerpo
  completo (antes de recortarlo a 200 caracteres) y se espera **1 h, duplicando hasta 6 h** (3600, 7200,
  14400, 21600…).
- **`401`/`404`/forma cambiada:** se mantiene el intervalo normal. Aplicar backoff solo retrasaría notar que se
  arregló. El error aparece en `/v1/sources` como `lastError`.
- **Arranque escalonado:** con todas las líneas activas, un arranque son ~27 peticiones. Se espacian **2,5 s**
  (el arranque dura ~1 min); con 1 s, once llamadas de pronóstico seguían cayendo en 22 s.
- **Fuga de la clave (incidente del 2026-09-30):** el `500` de cuota de LTA dice «Quota limit exceeded.
  Identifier : <la AccountKey>». Copiado tal cual, metió la clave en los logs (Loki, 30 días) y en
  `/v1/sources`. Ahora `redact()` elimina del texto cualquier valor enviado en una cabecera (si mide 8
  caracteres o más) y cualquier `Identifier : …`, y lo hace **antes** de recortar, para que un corte no deje
  media clave.

## SG.2 data.gov.sg — tiempo atmosférico en tiempo real (NEA)

- **URL:** `https://api-open.data.gov.sg/v2/real-time/api/{dataset}` con `dataset` ∈ `rainfall`,
  `air-temperature`, `relative-humidity`.
- **Auth:** ninguna. Clave **opcional** en la cabecera `x-api-key` (`DATAGOVSG_API_KEY`). **Sin clave, el
  límite es de 6 llamadas en tiempo real cada 10 s**, y es otra razón del escalonado de 2,5 s.
- **Formato:** `{ code, data: { stations: [{ id, name, location: { latitude, longitude } }], readings:
  [{ timestamp, data: [{ stationId, value }] }], readingUnit } }`.
- **Transformación:** solo se toma el conjunto de lecturas más reciente; una estación sin lectura en él se
  omite. `rainfall` es un total de 5 min (`observedAt.start = end − 5 min`, mm); temperatura y humedad son
  valores de 1 min (`deg C` → `°C`, `%`). `kind: observed` y `staleAfter = lectura + 15 min` (tres ciclos
  perdidos).
- **Cobertura:** 89 pluviómetros y ~18 termómetros. Mediana medida el 2026-09-30 de la distancia de una
  estación de metro al pluviómetro más cercano: ~1 km; al termómetro: ~3,3 km. **Es tiempo exterior y
  cercano, no en la estación.** No hay interpolación ni índice compuesto, y cada valor indica la estación y la
  distancia («Rain, last 5 min (Nicoll Highway, 1.1 km)»).
- **Cadencia:** 300 s (suelo 60).
- La distancia de cada estación de metro a cada estación meteorológica se precalcula una vez por cambio
  (`StatusIndex`) y no en cada petición.

## SG.3 Catálogo estático de estaciones — `data/stations.json` (`scripts/build-stations.py`)

Se construye a mano cuando LTA añade estaciones. No necesita clave de DataMall porque todo son descargas
abiertas.

```bash
python3 -m venv .venv-build && .venv-build/bin/pip install xlrd==2.0.1 pyshp==2.3.1 pyproj shapely
.venv-build/bin/python scripts/build-stations.py
```

Entradas:

| Qué | URL | Formato |
|---|---|---|
| Códigos de estación | `https://datamall.lta.gov.sg/content/dam/datamall/datasets/Geospatial/Train%20Station%20Codes%20and%20Chinese%20Names.zip` | XLS dentro de ZIP; columnas `stn_code`, `mrt_station_english`, `mrt_line_english` |
| Huellas de estación | `https://datamall.lta.gov.sg/content/dam/datamall/datasets/Geospatial/TrainStation_Mar2026.zip` | SHP en SVY21 (EPSG:3414), un polígono por caja de estación (varios en un intercambiador); campo `STN_NAM_DE` |
| Salidas | data.gov.sg dataset `d_b39d3a0871985372d7e1637193335da5` («LTA MRT Station Exit») vía `https://api-open.data.gov.sg/v1/public/api/datasets/{id}/poll-download` → `data.url` → GeoJSON WGS84; campo `STATION_NA` | GeoJSON |

- **Trampa:** LTA **renombra el ZIP de huellas en cada versión** (`TrainStation_<Mon><YYYY>.zip`), así que hay
  que actualizar la URL a partir de la página de datos estáticos.
- **Unión por nombre**, porque ningún fichero lleva la clave del otro. El nombre se normaliza con mayúsculas,
  quitando ` MRT/LRT STATION` y colapsando espacios.
- **Ubicación:** el centroide de la unión de los polígonos de la huella (`footprint_centroid`), que es donde
  está la estación. Las salidas pueden quedar a 200 m (Bayshore, 219 m). Si no hay huella, se usa el
  centroide de las salidas (`exit_centroid`); si tampoco hay salidas, `location: null`, listado en stderr.
  Nunca se descarta ni se adivina. Resultado del 2026-09-30: los 213 códigos colocados por huella.

## SG.4 Trazado de líneas — `data/lines.json` (`scripts/build-lines.py`)

- **Fuente:** OpenStreetMap a través de Overpass API. **Licencia ODbL 1.0**: el fichero y las features
  derivadas llevan «© OpenStreetMap contributors» y, si se comparte la base, se comparte bajo ODbL.
- **Por qué no URA «Master Plan 2019 Rail Line layer»** (que tiene licencia SODL): tiene agujeros donde las
  líneas más antiguas van subterráneas. El 2026-09-30 **no había ningún segmento EWL entre Bugis (EW12) y City
  Hall (EW13)**, más de un tercio de los pares de estaciones quedaban sin vía y la capa no lleva el nombre de
  la línea.
- **Instancias Overpass**, cada una probada por turno y dos veces (`sleep 20·(intento+1)` s), con
  `User-Agent: MW-TS-API-SG-Stations/build-lines` y timeout de 300 s:
  `https://overpass-api.de/api/interpreter`, `https://overpass.private.coffee/api/interpreter`,
  `https://maps.mail.ru/osm/tools/overpass/api/interpreter`. Las públicas devuelven `504` a menudo.
- **Query:**
  ```
  [out:json][timeout:240];
  area["ISO3166-1"="SG"][admin_level=2]->.sg;
  relation["route"~"^(subway|light_rail|monorail)$"]["ref"~"^(BPLRT|CCL|DTL|EWL|NEL|NSL|PGLRT|SKLRT|TEL)$"](area.sg)->.r;
  .r out body; way(r.r); out geom tags;
  ```
  `--osm-cache osm.json` guarda o reutiliza la respuesta y `--preview x.png` dibuja una vista previa con
  matplotlib.
- **Método, por línea:**
  1. Grafo (networkx) **solo con las vías de esa línea**, en SVY21, con vértices soldados a 1 m y únicamente
     los miembros con rol `""`, `forward` o `backward` y `railway` ∈ subway, light_rail, monorail o rail.
     Así se descartan los andenes, que también son vías de la relación.
  2. Se recorren las estaciones del catálogo en orden de código (EW1→EW2…; las LRT vuelven a su hub; los
     ramales parten de su nudo: CGL desde EW4, CEL desde CC4). Cada par consecutivo se une por el camino más
     corto. **Trampa de los candidatos:** OSM dibuja cada sentido como vía propia unida en la terminal, así que
     con «el punto más cercano» dos estaciones vecinas podían caer en vías opuestas y el camino iba hasta el
     final de línea y volvía (33,7 km de Pasir Ris a Tampines, que distan 2,1 km). Por eso se prueban hasta 25
     candidatos dentro de «distancia mínima + 60 m» (radio de snap de 200 m) y se elige el par con el camino
     más corto.
  3. Si no hay camino plausible (ninguno, o más de 2,5× la distancia recta), se une con un tramo recto
     `schematic: true`, que nunca se presenta como vía.
- **Salida:** tramos de un solo nivel (`underground` si `tunnel`, `elevated` si `bridge`, `surface` en otro
  caso) simplificados a 2 m. Además: `stationLevels` (el nivel de la vía en el andén, que LTA no publica) y
  `stationBearings` (la cuerda de 60 m a cada lado, en grados desde el norte, para orientar el modelo 3D de la
  estación). El build del 2026-09-30 (OSM a 2026-09-30T10:26Z) dio 43 features.

## SG.5 Modo demo (no es una fuente)

`DEMO_SIMULATE_CROWD=true` (desactivado por defecto) sustituye la aglomeración por una hora punta
**simulada**, para grabar cuando en Singapur es de noche (a las 03:00 SGT todo está en `low` y no hay
pronóstico). La intensidad depende de la distancia a Raffles Place y del número de líneas, con una onda de
6 min, y el pronóstico son 8 medias horas con un pico a +90 min. Siempre va etiquetado («simulated» en
`details` y `crowd.simulated: true`).

## SG.6 Licencia y atribución

Todo bajo la **Singapore Open Data Licence v1.0**, que permite uso comercial y redistribución **con
atribución visible**. Texto literal que devuelve cada respuesta:

> Contains information from LTA DataMall (Station Crowd Density, Train Service Alerts, Facilities Maintenance,
> Train Station Codes) and from data.gov.sg (LTA MRT Station Exit, Realtime Weather Readings by NEA), made
> available under the terms of the Singapore Open Data Licence version 1.0 https://data.gov.sg/open-data-licence

Las features de línea añaden «Rail line geometry © OpenStreetMap contributors, ODbL 1.0».

## SG.7 Tabla resumen

| Fuente | Sondeo (suelo) | Stale | Auth |
|---|---|---|---|
| PCDRealTime (por línea) | 600 s (600) | fin de ventana + 45 min | `AccountKey` |
| PCDForecast (por línea) | 12 h (1 h) + caché en disco | poll + 26 h | `AccountKey` |
| TrainServiceAlerts | 120 s (60) | poll + 10 min | `AccountKey` |
| FacilitiesMaintenance | 1800 s (300) | poll + 90 min | `AccountKey` |
| data.gov.sg ×3 | 300 s (60) | lectura + 15 min | ninguna (`x-api-key` opcional) |

---

# Barcelona — `MW-TS-API-Barcelona`

Servicio de tipo `API`, puerto `20000`, que sirve `cde-device-api/1` más una API de lectura propia. **Todas las
fuentes en vivo son sin clave** (`.env.example` reserva sitio para un futuro TMB `app_id/app_key` o un token
de Open Data BCN, que irían en `.env.local` y nunca en el log).

## BCN.0 Cliente HTTP y política de reintentos comunes

- `src/shared/http/upstream.ts` envía `user-agent: mw-ts-api-barcelona (+https://github.com/DEIN-INGREEN)`,
  `UPSTREAM_TIMEOUT_MS=30000` y un **techo de cuerpo `UPSTREAM_MAX_BYTES=8000000`** que se aplica leyendo el
  stream trozo a trozo y cancelándolo al pasarse. `content-length` no basta: puede faltar o ser falso. Los
  cuerpos mayores medidos el 2026-09-30 (Endolla y Bicing) no llegaban a 1 MB. Las descargas grandes (ZIP de
  76 MB) escalan el timeout ×15 y borran el fichero parcial si fallan.
- **Backoff** (`src/shared/sources/poller.ts`): tras un éxito, el intervalo. Tras `n` fallos consecutivos,
  `base·2^(n−1)` con `base = min(15 s, intervalo)`, tope `min(8·intervalo, 900 s)` y **±10 % de jitter**, para
  que las fuentes que fallaron juntas no reintenten juntas. Aquí no se distingue entre reintentable y no
  reintentable: un 404 que se arregla en diez minutos debe notarse en diez minutos. El tope existe porque los
  catálogos se refrescan a diario y esperar un día tras un arranque fallido dejaría el servicio un día sin
  estaciones.
- `POLL_REFERENCE_SECONDS=86400` (suelo 3600) para catálogos, diccionarios y geometrías.
- Áreas: `RAIL_BBOX=0.15,40.5,3.35,42.9` (Cataluña; el feed de Renfe cubre toda España),
  `GAUGE_BBOX=1.85,41.25,2.35,41.6` (bajo Llobregat y Besòs), `SCT_BBOX=1.85,41.25,2.40,41.62`.

## BCN.1 FGC — Geotren (posición de trenes) y paradas GTFS

- **Base:** `https://dadesobertes.fgc.cat/api/explore/v2.1/catalog/datasets` (Opendatasoft Explore v2.1).
- **Trenes:** `GET {base}/posicionament-dels-trens/records?limit=100&select=*,record_timestamp`. Geotren lista
  ~60 trenes y la API pagina en 100 como máximo, así que con una página basta.
  - Campos: `id` (trip GTFS), `ut` (unidad, estable entre trips: es el id que sigue el visor), `lin`, `dir`,
    `origen`, `desti`, `geo_point_2d{lon,lat}`, `properes_parades` (ver trampa), `estacionat_a`, `en_hora`,
    `tipus_unitat`, `ocupacio_<coche>_percent` (ocupación por coche) y `record_timestamp`.
  - **Trampa de formato:** `properes_parades` es `{"parada": "CF"};{"parada": "PJ"}`, objetos JSON separados
    por `;`, que se parsean uno a uno.
  - **Transformación:** la posición es la de FGC y no se mueve salvo para encajarla en la vía (BCN.20). La
    ocupación es el único valor `derived`: la media de los porcentajes por coche publicados. Un solo color de
    operador, porque los colores de línea de FGC no están en los datos abiertos.
- **Paradas:** `GET {base}/gtfs_stops/exports/json`. El `stop_id` (`PC2`, `SGbus`) se reduce al código de
  Geotren (`PC`, `SG`) quitando dígitos o `bus` finales. Un andén ferroviario tiene prioridad sobre la parada
  de bus homónima. Campos: `stop_name`, `stop_coordinates`, `wheelchair_boarding`.
- **Cuota:** **5 000 peticiones al día por IP.** Sondeo de 60 s (suelo 30): 86 400/60 = 1 440 al día, con
  margen.
- **Stale:** 180 s. **Licencia:** CC BY 4.0 — «Ferrocarrils de la Generalitat de Catalunya (FGC), dades
  obertes (CC BY 4.0)». Página: `https://dadesobertes.fgc.cat/explore/dataset/posicionament-dels-trens/`.
- Material rodante (`rail/rolling-stock.ts`), a partir de `tipus_unitat`: 112/113 tienen 4 coches, 114 tres,
  115 cinco, 213 tres y `213x2` son dos acopladas. Los cremalleras y funiculares no tienen modelo.

## BCN.2 Renfe — Rodalies GTFS-Realtime y lista de estaciones

- **Posiciones:** `https://gtfsrt.renfe.com/vehicle_positions.json` (GTFS-RT en **JSON**, toda España;
  se filtra a `RAIL_BBOX`). Cada 30 s (suelo 20).
  - Campos: `entity[].vehicle.{position{latitude,longitude}, trip.tripId, vehicle{id,label}, currentStatus,
    stopId, timestamp (epoch s)}`. La etiqueta `R2-28530-PLATF.(5)` se descompone en línea `R2`, tren `28530`
    y andén `5`, y cualquiera de las partes puede faltar.
  - **Trampa clave:** solo `IN_TRANSIT_TO` es un fix GPS. Con `STOPPED_AT` e `INCOMING_AT`, Renfe envía **las
    coordenadas de la estación** (el edificio, a veces a decenas de metros del andén), así que
    `positionIsMeasured: false` / `isRealtime: false` y el visor no debe animarlo.
- **Retrasos:** `https://gtfsrt.renfe.com/trip_updates.json`, cada 60 s (suelo 30). El retraso se toma de
  `tripUpdate.delay` o del primer `stopTimeUpdate.arrival|departure.delay`, porque Renfe lo pone en el trip y en
  su primera parada.
- **Estaciones:** `https://data.renfe.com/dataset/8bdd06a5-f7f6-4f21-9cb6-b76f39842726/resource/e3969f12-aff2-468e-9b82-a65a6dd1a0d3/download/listado-estaciones-rodalies-barcelona.csv`.
  **Trampa:** separado por `;`, con **BOM y un espacio antes de la primera cabecera**. Columnas `CÓDIGO`,
  `DESCRIPCION`, `LATITUD` y `LONGITUD`.
- **Stale:** 180 s. **Licencia:** CC BY 4.0 — «Renfe Viajeros, data.renfe.com (CC BY 4.0)». Página:
  `https://data.renfe.com/dataset/ubicacion-vehiculos`. Renfe no publica el tipo de unidad, así que se dibuja
  un Civia de hasta 5 coches.

## BCN.3 Bicing — GBFS 3.0

- **Base:** `https://barcelona.publicbikesystem.net/customer/gbfs/v3.0` (índice en `.../gbfs.json`).
- `station_information.json` (diario): `data.stations[{station_id, name, lat, lon, capacity}]`. **Trampa GBFS
  3.0:** `name` es un array localizado `[{text, language}]`; se toma `ca` y, si no está, el primero.
- `station_status.json` (60 s, suelo 30): `num_vehicles_available` (3.0; en 2.x era `num_bikes_available`, y
  se leen ambos), `num_vehicles_disabled`, `num_docks_available`, `is_installed`, `is_renting`,
  `is_returning` y `last_reported` (ISO en 3.0, epoch en 2.x, y se aceptan ambos). Una estación sin instalar o
  que no presta queda `inactive`.
- **Decisión de datos:** no se publica el desglose eléctrica/mecánica de `vehicle_types_available`, porque el
  2026-09-30 sus recuentos no cuadraban ni con el total disponible ni con disponibles + deshabilitadas
  (estación 1: 0 disponibles, 4 deshabilitadas, 0 por tipo; estación 8: 17 / 1 / 18).
- **Stale:** 600 s. **Licencia: no declarada** (`license_url` es `null`). Atribución «Bicing, Ajuntament de
  Barcelona (GBFS)». Usarla fuera de una demo no es decisión del servicio.

### BCN.3.b Histórico de Bicing y su efecto en la lluvia (análisis offline)

- Dataset Open Data BCN **`estat-estacions-bicing`** (CC BY 4.0): archivos mensuales del estado de las
  estaciones, p. ej. `2026_03_Marc_BicingNou_ESTACIONS.csv`.
- **Trampa:** los archivos mensuales vienen en **7z** (~20 MB, 320 MB descomprimidos). Sin 7z local se usa un
  contenedor de usar y tirar:
  `docker run --rm -i alpine:3.20 sh -c "apk add -q p7zip && cat > /a.7z && 7z x -so /a.7z" < month.7z > month.csv`
- `scripts/analysis/bicing_hourly.py <csv> > YYYY-MM.hourly`: calcula las **bicis cogidas por hora local**
  (Europe/Madrid) como suma, por estación, de las bajadas de `num_bikes_available` entre reportes
  consecutivos (`last_reported` en epoch), asignadas a la hora del reporte posterior. Es una cota inferior del
  uso; el reequilibrado con furgoneta mete el mismo ruido en horas húmedas y secas. Salida
  `hora,cogidas,estaciones_reportando`.
- `scripts/analysis/bicing_rain.py <dir> data/bicing-rain.json`: reutiliza la caché de lluvia XEMA (BCN.8.c).
  Una hora es húmeda si llueve en una estación XEMA de la ciudad en esa hora o la anterior: ligera si es
  menos de 1 mm, moderada entre 1 y 4, fuerte si es 4 o más. Solo cuentan las horas con 300 o más estaciones
  reportando. Ratio = Σ cogidas en horas húmedas / Σ media seca del mismo tipo de día × hora (mínimo 5 horas
  secas por franja). El azar se mide con el **calendario desplazado** (BCN.8.d), 34 desplazamientos. Meses
  2026-02 a 2026-06. Resultado: lluvia en general ×0,66 (nulo 0,85–1,05), ligera ×0,81, moderada ×0,50 y
  fuerte ×0,36, todos fuera del rango del azar.

## BCN.4 Endolla — puntos de recarga (B:SM)

- **URL:** `https://opendata-ajuntament.barcelona.cat/data/dataset/8cdafa08-d378-4bf1-aad4-fafffe815940/resource/9febc26f-d6a7-45f2-8f73-f529ba4da930/download`
  (fichero **GELFS 0.96**, información y estado en vivo en uno). Página del dataset:
  `.../data/dataset/informacio-punts-recarrega-electric`.
- Campos: `locations[{ id, coordinates{latitude,longitude}, address.address_string, stations[{ id, ports[{ id,
  connector_type, power_kw, port_status[0].status, last_updated }] }] }]`. Estados: `AVAILABLE`, `IN_USE`,
  `OUT_OF_ORDER`, `UNAVAILABLE`, `RESERVED` y `UNKNOWN`.
- **Cadencia:** 120 s (suelo 60). **Stale:** 3 600 s y **`changeDriven`**: Endolla reescribe `last_updated`
  solo cuando cambia el estado, aunque el fichero se republica constantemente. La staleness se juzga por
  cuándo lo leyó el servicio; si no, un cargador ocioso una hora saldría como stale con su estado al día.
- Una ubicación sin ningún puerto disponible o en uso se considera fuera de servicio para el conductor.
- **Licencia:** CC BY 4.0 — «Ajuntament de Barcelona, Open Data BCN (CC BY 4.0)».

### BCN.4.b Colocación de los modelos — `data/endolla-placement.json` (`scripts/build-endolla-placement.mjs`)

Endolla da un punto y ningún rumbo; un modelo 3D necesita los dos.

- **Overpass** con `User-Agent: MW-TS-API-Barcelona placement builder` y **dos hosts alternados**:
  `https://overpass-api.de/api/interpreter` y el espejo **`https://overpass.kumi.systems/api/interpreter`**.
  Hasta 6 intentos con espera de `5 s·(intento+1)`, porque los públicos devuelven 504 cuando están cargados.
- Consultas: todas las `way["highway"]` en `around:45` de cada ubicación, en una sola query; y
  `nwr["amenity"="charging_station"](41.32,2.05,41.47,2.23); out center tags;`.
- **Tipo:** `car` si tiene un puerto `CCS_TYPE_2` o `CHADEMO`; `street` si tiene 3 estaciones o menos;
  `parking` en otro caso (aparcamiento municipal subterráneo: conserva el punto de Endolla y su modelo es el
  tótem de entrada).
- **Posición:** la estación OSM a menos de 25 m cuyo `operator`, `network` o `brand` esté vacío o contenga
  `endolla`/`ajuntament`, porque los mapeadores la colocan sobre la unidad. Si no hay, el punto de Endolla,
  **desplazado al borde de la calzada** si cae sobre ella (dentro del 60 % de la semianchura y a menos de 8 m
  del borde). La semianchura sale de la clase de vía (trunk 9, primary 7, secondary 6, tertiary 5,
  residential/unclassified 4, living_street 3, service 2,5) o de `width`/`lanes·1,6`.
- **Rumbo:** hacia la calzada más cercana (motorway…service, sin túnel, sin `layer` negativo, sin
  `area`/`covered`) en 40 m, de modo que el +X del modelo (cables y plazas pintadas) mire a la calzada.
- Licencias: Open Data BCN + © OpenStreetMap contributors (ODbL). Leído el 2026-10-01. Hay que volver a
  ejecutarlo cuando Endolla añada ubicaciones: una ubicación ausente se dibuja como pin.
- Modelos (`tools/blender/build_chargers.py`, Blender 5.x): estilizados a partir de fotos de Wikimedia Commons
  (CC BY-SA 4.0, 2022), con nombre `endolla-<letras>` (`f` 50 kW triple, `h` 160 kW, `p` poste de calle;
  `endolla-parking`). Origen en el suelo en las unidades y +X de la acera a la calzada. Manifiesto en
  `tools/blender/charger_manifest.json`.

## BCN.5 Tráfico — estado por tramos (Open Data BCN `trams`)

- **Estado:** `https://opendata-ajuntament.barcelona.cat/data/dataset/8319c2b1-4c21-4962-9acd-6db4c5ff1148/resource/2d456eb5-4ea6-4f68-9794-2f3f1a58a933/download`.
  Texto con una línea por tramo: `tram#yyyyMMddHHmmss#estatActual#estatPrevist`, en hora local. Escala: **0 sin
  datos (sensor caído), 1 muy fluido … 4 muy denso, 5 congestión, 6 cortado**. `estatPrevist` es la
  previsión del Ajuntament a 15 min.
- **Geometría:** `https://opendata-ajuntament.barcelona.cat/data/dataset/1090983a-1c40-4609-8620-14ad49aae3ab/resource/1d6c814c-70ef-4147-aa16-a49ddb952f72/download/transit_relacio_trams.csv`.
  Columnas `Tram`, `Descripció` y `Coordenades`, esta última una lista plana `lon,lat,lon,lat,…`. Son 527
  tramos.
- **Cadencia:** estado cada 300 s (suelo 120); geometría diaria. **Stale:** 1 200 s. **Licencia:** CC BY 4.0
  (Centre de Gestió de la Mobilitat).

## BCN.6 Tráfico — itinerarios (Open Data BCN `itineraris`)

- **Tiempos (en vivo):** **`https://www.bcn.cat/transit/dades/dadesitineraris.dat`**. **Trampa:** el enlace de
  descarga del portal solo redirige aquí y **a veces responde 503 mientras este origen no** (2026-10-06), así
  que se consulta el origen directamente. Formato
  `id#infoDisponible#yyyyMMddHHmmss#tempsActual#tempsPrevist#…`, en segundos y hora local; un valor ≤ 0 es
  «sin dato». Cada 300 s.
- **Lista:** `https://opendata-ajuntament.barcelona.cat/data/dataset/446dcd8e-445a-45eb-8979-c73376ea340e/resource/8d6239d1-995a-4e65-9fce-8b98baf693ed/download/transit_relacio_tram_per_itinerari.csv`.
  Columnas `Itinerari,Tram,Descripció`: la fila con `Tram`=0 da el nombre del itinerario y las demás sus tramos
  en orden. Hay 78 itinerarios.
- **Trampas de transformación:**
  - La geometría de un tramo se dibuja en un único sentido sea cual sea el del itinerario (los tres tramos de
    la Ronda de Dalt hacia Diagonal están en orden pero dibujados al revés). `chain()` gira cada tramo para que
    empiece donde acabó el anterior.
  - **No se deriva velocidad:** el tiempo publicado no cubre toda la longitud dibujada (Sant Gervasi → Estatut
    saldría a 140 km/h sin tráfico).
  - **La mayoría de itinerarios publican un tiempo casi constante.** Solo se consideran «medidos» los que, en
    su peor hora habitual, superan en un 30 % su tiempo a flujo libre; hoy son los seis de la Ronda de Dalt.
- Estado mostrado: ratio `ahora / habitual` en esta franja → «Como de costumbre» (<1,15), «Algo más lento»
  (≥1,15), «Más lento» (≥1,5) y «Mucho más lento» (≥2,5). Si llueve en la ciudad, «habitual» se multiplica por
  el efecto lluvia mediano del itinerario.

### BCN.6.b Línea base — `data/itinerary-baseline.json` (`scripts/build-itinerary-baseline.mjs`)

- Archivos mensuales vía CKAN:
  `https://opendata-ajuntament.barcelona.cat/data/api/3/action/package_show?id=itineraris`, buscando el
  recurso llamado exactamente `YYYY_MM_<Mes>_ITINERARIS_ITINERARIS.csv`. Los meses van en catalán sin acentos:
  `Gener, Febrer, Marc, Abril, Maig, Juny, Juliol, Agost, Setembre, Octubre, Novembre, Desembre`. Se descarga con
  `redirect: follow`. Es CSV con comas: `idTram,infoDisponible,data,tempsActual,...`.
- Meses por defecto: **los últimos seis completos, saltando julio y agosto** (la ciudad se vacía). El fichero
  actual usa 2026-02…06 y 2026-09.
- **Habitual** = mediana de las lecturas válidas (`infoDisponible`=1, tiempo >0) en la franja
  `dayKind*24+hora`, con dayKind 0 laborable, 1 sábado y 2 domingo. No se distinguen festivos; se exigen ≥4
  lecturas. **Flujo libre** = la hora habitual más rápida. **Peor** = la lectura máxima con su fecha.
- **Efecto lluvia:** cada lectura húmeda se divide por la mediana *seca* de su franja, la mediana y el p90 de
  esos ratios forman el efecto, y se guarda solo si hay ≥30 lecturas. Se calcula dos veces: en todas las horas
  (`rain`) y solo en horas cargadas (`rainBusy`, con el habitual seco ≥1,2× el flujo libre), porque de noche
  una ronda va libre aunque llueva y aplana la mediana.

## BCN.7 Tramos y lluvia — `data/segment-rain.json` (`scripts/build-segment-rain.mjs`) — el «nulo de calendario desplazado»

- Archivos mensuales de `trams` vía CKAN (`package_show?id=trams`), recurso
  `YYYY_MM_<Mes>_TRAMS_TRAMS.csv` (`idTram,data,estatActual,estatPrevist`), cacheados en
  `$TMPDIR/bcn-accidents-cache/trams-YYYY-MM.csv`. Mismos seis meses por defecto.
- **Atascado** = estado 4 o 5. Los estados 0 y 6 se excluyen. Las lecturas se guardan en arrays tipados
  (millones de filas) para poder repetir la comparación sin volver a leer los ficheros.
- **Hora húmeda** = lluvia en cualquiera de las tres estaciones XEMA de la ciudad en esa hora o la anterior.
  Clase según el máximo de la hora o la anterior: ligera <1 mm, moderada 1–4 y fuerte ≥4.
- **Esperado:** para cada lectura húmeda se suma la probabilidad *seca* de atasco del mismo tramo × tipo de
  día × hora (franjas con ≥10 lecturas secas). **Observado:** las lecturas atascadas. Efecto =
  `(O − E) / lecturas × 60` = **minutos extra de atasco por hora de lluvia**. Se exigen ≥20 horas húmedas por
  tramo.
- **Por qué un nulo empírico:** lecturas tomadas cada cinco minutos no son independientes, así que una prueba
  paramétrica sería engañosa. Se repite la misma comparación con **el calendario real de lluvia desplazado ±3,
  5, 8, 11, 14, 17, 20, 23, 26, 29, 33, 37, 41, 45, 50, 55 y 60 días (34 desplazamientos, con wrap-around)**:
  los episodios conservan forma y hora y solo cambian las fechas. Un tramo es `beyondChance` si su efecto real
  supera **los 34** desplazados (≈1 entre 35 por azar) y al menos 20 desplazados son válidos. Lo mismo a nivel
  ciudad y por intensidad (dosis–respuesta).
- También guarda: `usualJammedPctBySlot` de la ciudad (horas secas, franjas con ≥1 000 lecturas) y
  `usualPeakJammedPct` por tramo (horas punta laborables 07–10 y 17–20, ≥500 lecturas): congestión
  estructural.
- Resultado actual: 406 tramos, ratio ciudad ×1,13 (nulo 0,87–1,08) y 45 tramos `beyondChance`. Por
  intensidad: ligera ×1,10, moderada ×1,14 y fuerte ×1,22, todas por encima del nulo.
- En vivo (`traffic/segment-rain.ts`, `barris/rain-traffic.ts`): un tramo con ≥1 min extra y `beyondChance`
  forma su propia familia. «Crónico» es estar atascado ≥1/3 de la punta seca. Por barrio se suman los minutos
  extra × horas húmedas previstas (≥0,2 mm en Open-Meteo, próximas 24 h); el tramo se asigna al barrio de su
  vértice central.

## BCN.8 Meteocat XEMA (vía Socrata de la Generalitat)

- **Base Socrata:** `https://analisi.transparenciacatalunya.cat/resource` (SODA, `{dataset}.json?$where=…`).
  Sin clave. *Needs verification*: Socrata admite un app token opcional (`X-App-Token`) para subir los límites,
  pero no se usa.
- **Datasets:**
  - `yqwd-vj5e`: metadatos de estación (`codi_estacio`, `nom_estacio`, `latitud`, `longitud`, `altitud`,
    `nom_estat_ema`). Diario, `$where=codi_estacio in('X4',…)`.
  - `nzvn-apee`: **lecturas semihorarias** (`codi_estacio`, `codi_variable`, `data_lectura`,
    `valor_lectura`, `codi_estat`, `codi_base`).
  - `4fb2-n3yi`: diccionario de variables (de referencia). Variables publicadas: 32 temperatura (Cel), 33
    humedad (%), 34 presión (hPa), **35 precipitación (mm en 30 min)**, 36 irradiancia (W/m2), 30 viento a
    10 m (m/s), 31 dirección (deg) y 50 racha (m/s).
- **Estaciones** (`XEMA_STATIONS`): `X4` el Raval, `X8` Zona Universitària, `D5` Observatori Fabra (las únicas
  tres dentro de la ciudad) y el anillo metropolitano `WU,YQ,Y7,XL,YY,UF,D3,XC,XV,YK,XF,XG,D2` (Badalona,
  puerto/el Prat, Viladecans, Garraf, Vallirana, Castellbisbal, Sant Cugat, Terrassa, Sabadell, Parets,
  Vacarisses). El anillo es lo que muestra dónde llovió más.
- **Lecturas en vivo:** cada 600 s (suelo 300), con ventana de 3 h:
  `$where=codi_estacio in(...) AND data_lectura > '<ISO sin Z>'&$order=data_lectura DESC&$limit=2000`.
  **Trampa:** hace falta el filtro de fecha, porque ordenar sin él devuelve primero filas con fecha nula.
- **Lluvia acumulada:** segunda consulta solo de `codi_variable = '35'` en `XEMA_RAIN_HOURS` (por defecto 72,
  rango 24–168) con `$select` reducido y
  `$limit = max(2000, horas·2·estaciones·2)`. Calcula los totales de 1 h, 24 h y 72 h y el pico en mm/h
  (`valor·2`). 144 lecturas equivalen a 72 h completas; si hay menos, hay un hueco.
- **Trampas de tiempo:** `data_lectura` es un `floating_timestamp` sin offset, pero **XEMA escribe UTC**: se le
  añade `Z`. Un intervalo se etiqueta por su **inicio**. Se publica ~16 min después de cerrarse el intervalo.
- `codi_estat`: vacío (sin validar, lo que llevan todas las lecturas en tiempo real), `T`, `V` o `N`. Se lee
  `V` como válida, `N` como no válida y el resto como provisional. Esta lectura es del servicio, no un
  diccionario publicado, y por eso el flag se pasa siempre tal cual.
- **Stale:** 5 400 s. **Licencia:** términos de datos abiertos de la Generalitat, **uso comercial pendiente de
  confirmar**. Atribución «Servei Meteorològic de Catalunya (Meteocat), dades obertes de la Generalitat».
- Escala de color por lluvia de 72 h (propia, no oficial): <10, 10–50, 50–100, 100–150, 150–200 y ≥200 mm.

### BCN.8.c Historia de lluvia para los builds — `scripts/lib/xema-rain.mjs` (consultas mensuales)

- **Trampa:** Socrata recorre toda la tabla XEMA en cada consulta. Un año de lecturas **agota el tiempo (400 s
  medidos el 2026-10-06)** y un mes responde en ~80 s. Por eso se consulta **mes a mes, seis meses en
  paralelo**, con 3 intentos, y se cachea en `$TMPDIR/bcn-accidents-cache/rain-YYYY-MM.json`.
- Consulta: `$select=codi_estacio,data_lectura,valor_lectura`,
  `$where=codi_variable='35' AND codi_estacio in('X4','X8','D5') AND valor_lectura>0 AND data_lectura>='YYYY-MM-01T00:00:00' AND data_lectura<'<mes siguiente>-01T00:00:00'`,
  `$limit=50000`. **Solo lecturas >0**: una media hora seca es la ausencia de fila.
- `wetHoursFor(months)` devuelve, por estación, las horas locales húmedas (la hora de lluvia **y la siguiente**,
  porque la calzada sigue mojada) y `mmByHour`, el máximo de mm de cualquier estación en esa hora sumando dos
  medias horas.

## BCN.9 Open-Meteo — previsión horaria de precipitación

- **URL:** `https://api.open-meteo.com/v1/forecast?latitude=a,b,…&longitude=a,b,…&hourly=precipitation,precipitation_probability&forecast_hours=24&timezone=UTC`.
  **Una sola petición para todos los puntos**: Open-Meteo responde a una lista de puntos con una lista de
  previsiones en el mismo orden (un punto devuelve un objeto y varios un array). El modelo `best_match` es la
  mezcla propia de Open-Meteo.
- Dos feeds: en las estaciones XEMA (`openmeteo.forecast`) y en los centroides de los 73 barrios
  (`openmeteo.forecast.barris`). Cada 1 800 s (suelo 600); los modelos se actualizan cada hora.
- Derivado: lluvia en la próxima hora, 6 h y 24 h, probabilidad máxima en 6 h y primera hora con ≥0,5 mm.
- **Stale:** 10 800 s. **Licencia:** datos CC BY 4.0, pero **la API gratuita es para uso no comercial; un
  despliegue comercial necesita suscripción**. Atribución «Weather data by Open-Meteo.com (CC BY 4.0)».

## BCN.10 Barrios — `data/barris.json` (`scripts/build-barris.mjs`)

- **URL:** `https://opendata-ajuntament.barcelona.cat/data/dataset/808daafa-d9ce-48c0-925a-fa5afdb1ed41/resource/b21fa550-56ea-4f4c-9adc-b8009381896e/download`
  (dataset `20170706-districtes-barris`, `BarcelonaCiutat_Barris.csv`, CC BY 4.0). Columnas `codi_barri`,
  `nom_barri`, `nom_districte` y **`geometria_wgs84` en WKT** (`POLYGON`/`MULTIPOLYGON`, parseado a mano).
- Anillos simplificados con **Douglas–Peucker a 10 m** (el anillo cerrado se parte por el vértice más lejano) y
  centroide ponderado por área. Son 73 barrios, lo bastante ligeros para servirse dos veces por minuto.
- Uso: la lluvia caída por barrio se **estima por IDW (potencia 2)** a partir de las estaciones XEMA. Si hay
  una a menos de 300 m, se usa su valor. Los detalles dicen que es una estimación y nombran la estación más
  cercana con su distancia. La lluvia prevista sale de Open-Meteo en el centroide.

## BCN.11 Calidad del aire — ASPB (Open Data BCN)

- **Horario:** `https://opendata-ajuntament.barcelona.cat/resources/aspb/Qualitat_Aire_Detall.csv`, que cubre
  hoy y los tres días anteriores. Una fila por estación, día y contaminante: `ESTACIO`, `CODI_CONTAMINANT`,
  `ANY`, `MES`, `DIA`, `H01…H24` (valores) y `V01…V24` (`V` validado, `N` no). Cada 900 s (suelo 600).
- **Trampa horaria:** `H13` es de 12:00 a 13:00 **hora local**. `startsAt` = inicio de la hora convertido con
  tz; `H24` pasa al día siguiente.
- **Estaciones:** `https://opendata-ajuntament.barcelona.cat/data/dataset/4dff88b1-151b-48db-91c2-45007cd5d07a/resource/7de4c08f-5962-4d4d-9dca-e10badffbffd/download/2026_qualitat_aire_estacions.csv`.
  **Trampa:** hay un fichero por año y el del año en curso es el que lista las estaciones en servicio, así que
  **la URL lleva el año** y hay que cambiarla cada enero. Columnas `Estacio`, `nom_cabina`, `codi_eoi`
  (XVPCA, rellenado a 8 dígitos y compartido con el dataset de la Generalitat `tasf-thgu`), `Latitud`,
  `Longitud`, `Nom_districte` y `Clas_2`. `043` y `43` son la misma estación.
- **Contaminantes:** `https://opendata-ajuntament.barcelona.cat/data/dataset/6960936a-95ed-4cc4-a6ec-e089197ccd8b/resource/c122329d-d26d-469e-bf9e-8efa10e4c127/download/qualitat_aire_contaminants.csv`
  (`Codi_Contaminant`, `Desc_Contaminant`, `Unitats`). Se excluyen los duplicados con asterisco (`108` NO2*…)
  y los flujos internos de los analizadores (`996`–`999`). Unidades a UCUM (`µg/m³`→`ug/m3`). **No se calcula
  índice**: cada contaminante se muestra tal cual.
- Llega entre ~45 min y ~3 h tarde (medido el 2026-09-30). **Stale:** 21 600 s. **Licencia:** CC BY 4.0.

## BCN.12 ACA — aforos fluviales (Sentilo `sdim2`)

- **Base:** `https://aplicacions.aca.gencat.cat/sdim2/apirest`, sin clave.
- **Catálogo:** `GET /catalog?componentType=aforament` → `providers[].sensors[{ component, componentDesc,
  sensor, description, unit, location ("lat lon", ¡en ese orden!), publicAccess, componentAdditionalInfo{Riu,
  Conca} }]`. `Nivell riu` es nivel (tipo `0019`) y `Cabal riu` es caudal (`0014`). Se filtra por
  `GAUGE_BBOX` y `publicAccess !== false`. Diario.
- **Datos:** `GET /data/AFORAMENT-EST` devuelve la **última observación de todos los sensores en una sola
  petición**: `sensors[{ sensor, observations[0]{ value, time (epoch ms), timestamp } }]`. **Trampa:** se lee
  `time` y no la cadena `dd/mm/yyyyThh:mi:ss`, que no lleva zona. Cada 300 s (suelo 120). **Stale:** 3 600 s.
- El caudal lo publica la ACA como su propio sensor `CALC…`, calculado a partir del nivel, así que aquí es
  `derived`. Dibujarlo como «caudal medido» afirmaría más de lo que dice la fuente.
- **La API conserva tres meses.** Para reproducir un episodio más tarde hay que archivarlo antes:
  `FROM=28/09/2026T00:00:00 node scripts/archive-aca-episode.mjs CALC001261 082172-002-ANA010 … > data/<episode>.json`.
  Pagina hacia atrás de 200 en 200 (el techo de la API) con
  `/data/AFORAMENT-EST/<sensor>?limit=200&from=<dd/mm/yyyyThh:mi:ss>&to=<…>` (máximo 20 páginas) y escribe
  pares `[ISO, valor]`. Se registra en `EPISODES` (`src/modules/episodes`). Existente:
  `data/aca-episode-2026-09-29.json` (`llobregat-besos-2026-09-29`), servido en `GET /v1/episodes/{id}`.
- **Licencia: no declarada** en el manual de la API. Atribución «Agència Catalana de l’Aigua (ACA)».

## BCN.13 SCT — incidencias de tráfico en tiempo real (GML)

- **URL:** `https://www.gencat.cat/transit/opendata/incidenciesGML.xml`. Es una FeatureCollection WFS 1.0
  plana: un `gml:featureMember` por incidencia con un punto WGS84 (`gml:coordinates` = `lon,lat`) y campos
  escalares `cite:`. **Se lee sin parser XML** (split + regex y decodificación de entidades).
- Campos: `identificador`, `tipus` (2 retención, 3 obras), `descripcio_tipus`, `carretera`, `pk_inici`,
  `pk_fi`, `causa` (Circulació, Accident, Inundacions, Esllavissades…), `cap_a` (sentido, a menudo con lo
  cortado: «TARRAGONA-UN CARRIL TALLAT»), `sentit`, `descripcio`, `nivell` (1–5; 5 es vía cortada; colores
  del verde al negro como en el mapa del SCT) y `data` (**RFC 1123 en GMT**).
- **Filtro:** se queda con lo que cae en `SCT_BBOX`. **Las obras planificadas se descartan**, porque un
  centenar enterraría los atascos, **salvo si su causa es meteorológica**:
  `/inundaci|esllavissad|despreniment|arbre|temporal|pluja|neu|gel|vent|riuada/i`.
- Cada 180 s (suelo 60). **Stale:** 900 s, `changeDriven`: una incidencia que el fichero deja de listar ha
  terminado, así que lo que caduca es la antigüedad del fichero.
- **Licencia:** términos de datos abiertos de la Generalitat; **uso comercial pendiente de confirmar**.

## BCN.14 Guàrdia Urbana — accidentes y puntos negros — `data/accident-hotspots.json` (`scripts/build-accident-hotspots.mjs`)

- `node scripts/build-accident-hotspots.mjs [firstYear] [lastYear]`. Por defecto, los tres últimos años
  publicados; el fichero actual es de 2023–2025. Se reconstruye una vez al año, cuando el Ajuntament publica
  el año anterior. El servicio solo lo lee (stale 86 400 s, `changeDriven`).
- **Cuatro datasets** vía CKAN `https://opendata-ajuntament.barcelona.cat/data/api/3/action/package_show?id=`:
  `accidents-gu-bcn` (lugar, víctimas), `accidents-tipus-gu-bcn` (tipo), `accidents_causa_conductor_gu_bcn`
  (culpa del conductor) y `accidents-persones-gu-bcn` (personas y daño). Se elige el recurso CSV cuyo nombre o
  URL contiene el año. Se unen por **`Numero_expedient`**. Caché en `$TMPDIR/bcn-accidents-cache`.
- **Trampas de CSV:** cabeceras con espacios sueltos (`"Num_postal "`, `"NK_ Any"`) y, en el fichero de causas
  de 2025, un `Número` con acento. Se normalizan con NFD, quitando diacríticos y espacios y pasando a
  minúsculas. Se filtran coordenadas fuera de `2.0<lon<2.3`, `41.3<lat<41.5`. Las horas de la Guàrdia Urbana
  son locales y las de XEMA, UTC.
- **Método de puntos negros:** clustering **voraz de 35 m**. Para cada accidente se cuentan los vecinos a ≤35 m
  (rejilla de 35 m), se toma primero el más denso, se retiran sus accidentes y se repite. Se mantienen los
  clusters con **≥15 accidentes** en el periodo. La Guàrdia Urbana geocodifica al cruce o al portal, así que
  el punto más denso es un cruce real, y 35 m mantiene juntos los dos lados de un cruce ancho (Diagonal, Gran
  Via) sin unirlo al siguiente. Resultado: 23 001 accidentes y 240 puntos negros.
- **Lluvia:** cada accidente está «en calzada mojada» si la estación XEMA de la ciudad más cercana registró
  lluvia en su hora o la anterior. El esperado es P(hora húmeda | estación, hora del día) en el mismo periodo.
  Cola de Poisson `P(X ≥ k)` como p-valor. Multiplicadores ciudad por tipo de accidente (con ≥200 accidentes
  fechados y p<0,05): caída de dos ruedas ×1,82, alcance múltiple ×1,31, atropello ×1,18 y choque contra
  elemento estático ×1,17. La exposición a la lluvia de un punto negro es la media de esos multiplicadores
  sobre su mezcla de tipos. `worseInRain` exige ≥4 húmedos, ratio ≥1,5 y **p < 0,05/nº de puntos negros
  (Bonferroni)**. En 2023–2025 ninguno lo pasa: con 240 puntos, unos cuantos duplican el esperado por azar.
  También se calcula por franja horaria (07–10, 11–16, 17–20, 21–06), para todos y para caídas de dos ruedas.
- Las sugerencias («Peatones: fase semafórica…») son una lectura del servicio sobre el tipo y la causa
  dominantes, **no un diagnóstico del Ajuntament**. **Licencia:** CC BY 4.0, Guàrdia Urbana / Open Data BCN.

## BCN.15 Generalitat — aforos de carreteras (IMD)

- **URL:** `https://analisi.transparenciacatalunya.cat/resource/xsvx-ym46.json?$limit=50000` (página
  `https://analisi.transparenciacatalunya.cat/d/xsvx-ym46`).
- **Trampa:** las coordenadas son **texto** en esta tabla, así que Socrata no puede filtrar por área: se lee la
  tabla entera (~4 300 filas) y se filtra en el servicio por `SCT_BBOX`.
- Campos: `codi`, `any`, `carretera`, `pk`, `definici_tram_origen`, `definici_tram_final`, `poblaci`, `imd`,
  `carrils`, `pesants` (0–1), `velocitat_km_h`, `longitud` y `latitud`. Por carretera y PK se queda con **el
  año más reciente**. El id es `road-imd-<carretera>-<pk>-<codi>`, porque un código puede cubrir varios
  tramos.
- Las rondas y la B-23 son de la ciudad y del Estado y **no están** en esta tabla.
- Diario; stale 7 días (`changeDriven`). Escala propia: <25k, 25–50k, 50–80k, 80–120k y >120k veh/día.
  **Licencia:** términos de datos abiertos de la Generalitat.

## BCN.16 Red ferroviaria OSM — `src/providers/rail/rail-network.json` (`scripts/build-rail-network.mjs`)

- `node scripts/build-rail-network.mjs [minLon,minLat,maxLon,maxLat]` (por defecto `1.7,41.2,2.45,41.75`, con
  un margen de 0,004°). Va **horneado en la imagen: el servicio nunca llama a Overpass en ejecución**.
- Overpass `OVERPASS_URL` (por defecto `https://overpass-api.de/api/interpreter`), POST
  `application/x-www-form-urlencoded`, **`user-agent: mw-ts-api-barcelona/build-rail-network`**. **Una
  consulta por tipo** (`rail`, `subway`, `light_rail`, `narrow_gauge`), porque una sola consulta para todo el
  área agota el tiempo en los servidores públicos: `[out:json][timeout:180];way["railway"="<kind>"](bbox);out geom tags;`.
  Hasta 6 intentos con espera de `10 s·intento`.
- Nivel: `tunnel` o `layer<0` → underground; `bridge` o `layer>0` → elevated; si no, surface. Build del
  2026-10-01: 4 882 vías. **ODbL**: se añade el aviso de OSM a `meta.attribution` siempre que se usa.
- Uso (`rail/place-train.ts`): ni FGC ni Renfe publican rumbo, así que sin esto cada tren apuntaría al norte. El
  fix se mueve a la vía solo si está a ≤12 m (`RAIL_SNAP_MAX_M`; los fixes FGC/Rodalies quedaron a una mediana
  de 0,8 y 1,8 m, con el 90 % a ≤5 m, en 84 trenes el 2026-09-30), o ≤80 m si es la posición de una estación.
  El tren se parte en coches de 19,5 m cada 20 m, cada uno sobre su tramo de vía. Nunca se marca
  `underground`, porque la CDE lo dibujaría translúcido. Modelos estilizados: `tools/blender/build_models.py`.

## BCN.17 Tabla resumen de cadencias y staleness

| Fuente | Sondeo (suelo) | Stale | Licencia |
|---|---|---|---|
| FGC Geotren | 60 s (30) — cuota 5 000/día/IP | 180 s | CC BY 4.0 |
| Renfe posiciones / trip updates | 30 s (20) / 60 s (30) | 180 s | CC BY 4.0 |
| Bicing status | 60 s (30) | 600 s | no declarada |
| Endolla | 120 s (60) | 3 600 s (change-driven) | CC BY 4.0 |
| Tráfico tramos / itinerarios | 300 s (120) | 1 200 s | CC BY 4.0 |
| XEMA | 600 s (300) | 5 400 s | Generalitat, comercial por confirmar |
| Open-Meteo | 1 800 s (600) | 10 800 s | CC BY 4.0, API gratuita no comercial |
| ASPB aire | 900 s (600) | 21 600 s | CC BY 4.0 |
| ACA | 300 s (120) | 3 600 s | no declarada |
| SCT | 180 s (60) | 900 s (change-driven) | Generalitat, comercial por confirmar |
| IMD carreteras | 86 400 s | 7 días | Generalitat |
| Catálogos / geometrías | 86 400 s (3 600) | — | — |

---

# Barcelona — lado del mapa (frontend y assets)

Recursos de escena en `cde_backend_devices."SceneResource"` (consulta de solo lectura del 2026-10-08):

| Escena | Tipo | Endpoint | Colocación vertical |
|---|---|---|---|
| `7aYwcAzwc4` «Barcelona en vivo — Pl. Catalunya» (Luciad) | `ogc3dtiles` `barcelona-3d-icgc-mesh` | `http://localhost:8098/icgc/vector/3dtiles/ciutats/v1/Scene-28/tileset.json` | `verticalDatum=ELLIPSOIDAL`, `heightOffsetM=-49.7`, `surface=GROUND` |
| `7aYwcAzwc4` | `rain-radar` | `https://api.rainviewer.com/public/weather-maps.json` | — |
| `mbxBcn3D01` «Barcelona 3D Mapbox — Pl. Catalunya» | `mapbox-style` «Mapbox Standard 3D (atardecer)» | `mapbox://styles/mapbox/standard?lightPreset=dusk&show3dObjects=true&showPointOfInterestLabels=false&showTransitLabels=false` | — |
| `mbxBcn3D01` | `rain-radar` | igual que arriba | — |

`localhost:8098` es la caché de teselas de la demo (`demo-assets/tilecache/nginx.conf`): `/icgc/` →
`https://tilemaps.icgc.cat/`, `/ign/` → `https://www.ign.es/wms-inspire/` y `/eox/` →
`https://tiles.maps.eox.at/`; `proxy_cache_valid 200 60d`, `404 1h`, `max_size=20g`. Las URLs originales están
en `tilecache/original-urls.txt` y `prewarm_mesh.py` precarga la malla. En un producto nuevo se apuntaría
directamente a `https://tilemaps.icgc.cat/...`.

## MAP.1 Radar de lluvia — RainViewer

Ficheros: `src/modules/scenes/utils/rainRadar.ts`, `layer-strategies/strategies/RainRadarStrategy.ts`
(Luciad) y `components/detail/SceneMapboxPreview.tsx` (Mapbox).

- **Índice de fotogramas:** `https://api.rainviewer.com/public/weather-maps.json`, sin clave, con
  `cache: 'no-store'`. Se usan `host` y `radar.past[{ time (Unix s), path ("/v2/radar/<id>") }]`: un compuesto
  de radar **cada 10 min durante las últimas 2 h**. Base del fotograma = `host + path`, es decir
  `https://tilecache.rainviewer.com/v2/radar/<id>`.
- **Plantilla de tesela:** `{base}/256/{z}/{x}/{y}/2/1_1.png`, XYZ de 256 px con las filas desde el norte.
  **Esquema de color `2` («Universal Blue», el único que sirve el plan gratuito desde 2025)**. `1_1` =
  suavizado y nieve diferenciada de la lluvia.
- **Límite z7:** las teselas gratuitas acaban en zoom 7 (~1 km/píxel en Barcelona). Por encima devuelven una
  imagen con el texto «Zoom Level Not Supported». A ambos visores se les dice que la pirámide termina en 7
  (`RAIN_RADAR_MAX_ZOOM = 7`; Luciad `levelCount = 8`; Mapbox `maxzoom: 7`) y estiran ese nivel al acercarse.
  Se ve lluvia a escala metropolitana, no calle a calle.
- **Bucle de 2 h:** se muestra cada fotograma una vez, del más antiguo al más reciente, y el último se mantiene
  5 pasos (`RAIN_RADAR_STEP_MS = 600`, `RAIN_RADAR_HOLD_STEPS = 5`). El índice se relee cada **5 min**
  (`RAIN_RADAR_REFRESH_MS`). Una capa oculta no se anima. RainViewer sirve sus teselas con **caché de dos
  días**, así que tras el primer bucle salen de la caché del navegador. Etiqueta: «Radar HH:MM»
  (Europe/Madrid). Opacidad 0,6 y atribución `© RainViewer`.
- **Filtro del velo beige (`cleanRadarPixels`)** sobre los RGBA de cada tesela en un canvas: la paleta
  gratuita pinta llovizna y clutter de suelo como un velo gris-beige que, estirado a z7 sobre toda la ciudad, la
  tapa. `chroma = max(r,g,b) − min(r,g,b)`; un píxel es transparente si `chroma < 45`, o si **no es azul** y
  `chroma < 120` (el beige y caqui de los ecos débiles mide 60–80; el amarillo y rojo de la lluvia real, ~240;
  medido en los fotogramas del 2026-10-06 sobre Barcelona). Los azules (lluvia ligera, `b>r && b>=g`) quedan
  con alfa ×0,7 y los cálidos saturados con alfa completo.
- **Trampas en Luciad:** hay que limpiar en `getImage` (canvas → `toDataURL`). Sobrescribir `getTileData`
  hizo que Luciad dejara de pedir teselas (2026-10-06: solo se pedía el índice). Luciad cuenta las filas desde
  el sur. El ráster debe drapear también sobre la malla de suelo: por defecto solo drapea sobre el terreno, que
  la malla urbana tapa, y el radar desaparecía al cargar la malla de Barcelona. Las estrategias no tienen hook
  de desmontaje, así que los temporizadores se paran cuando la capa sale del mapa.
- En Mapbox: una fuente `raster` por fotograma (`tiles: [template]`, `tileSize: 256`, `maxzoom: 7`) en el
  `slot: 'middle'` del estilo Standard; el bucle alterna la visibilidad.

## MAP.2 Malla 3D fotogramétrica de ICGC — `Scene-28`

- **Tileset:** `https://tilemaps.icgc.cat/vector/3dtiles/ciutats/v1/Scene-28/tileset.json` (OGC 3D Tiles,
  contenido `b3dm`, subtilesets `.json` anidados y esferas envolventes en ECEF). **No declara licencia.**
- **Alturas elipsoidales (WGS84).** El terreno de la escena es ortométrico. En Barcelona el geoide EGM2008 está
  ~49,5–49,7 m por encima del elipsoide, así que la malla cruda flota ~50 m sobre el terreno y tapa todos los
  marcadores y líneas de tráfico drapeados.
- **Solución vigente:** colocación vertical por recurso: `verticalDatum=ELLIPSOIDAL`, `heightOffsetM=-49.70`
  (EGM2008) y `surface=GROUND` (la malla actúa de suelo para el drapeado). EGM2008 varía mucho menos de un
  metro a lo largo de ~22 km de ciudad, así que basta un solo valor.
- **Alternativa (obsoleta desde el 2026-09-30, mantenida como reserva para visores sin colocación vertical):**
  `GEOID_M=49.5 node scripts/build-shifted-tileset.mjs > assets/3d/icgc-barcelona/tileset.json` reescribe
  solo el tileset raíz con URIs absolutas a tilemaps.icgc.cat y un `root.transform` (4×4 column-major) que
  traslada `−GEOID_M` sobre la vertical geodésica del centro de la esfera raíz. Se sirve con
  `nginx:alpine` en `127.0.0.1:8096`. **No hay que usar ambas a la vez.**
- **Medir el suelo sobre la malla** (`demo-assets/tools/icgc_ground.py`, para colocar IFCs de autor):
  1. Para cada lat/lon se toma `p = ECEF(lat, lon, 60 m)` y se recorre el tileset (incluidos los subtilesets
     `.json`) bajando a las hojas `b3dm` más finas cuya esfera contiene `p` (radio + 10 m).
  2. Se decodifica el b3dm: cabecera de 28 bytes (`magic, version, byteLength, featureTableJSON/Bin,
     batchTableJSON/Bin`), `RTC_CENTER` de la feature table o `extensions.CESIUM_RTC.center` del glTF, y el GLB
     embebido (chunk JSON, chunk BIN). Se leen `POSITION` (float32, con `byteStride`) e `indices`
     (uint8/16/32). **glTF es y-up → ECEF z-up: `(x, −z, y) + RTC`.**
  3. Se calculan los centroides de los triángulos en ENU local y se seleccionan los de un **anillo** de
     2,5–6 m (`--ring`). El anillo evita medir el objeto que ya está en ese punto de la malla (una fuente, un
     quiosco). El suelo es un **percentil bajo** (`--pct 20`) de la altura `up`.
  4. Salida JSON `{lat, lon, ground_raw, p05, p50, p95, n, tiles}`. `ground_raw` es elipsoidal y la altura
     ortométrica ≈ `ground_raw − 49,70`. Uso:
     `uv run --with numpy python tools/icgc_ground.py 41.3855,2.1700 --ring 2.5,6 --pct 20`.
  - Variante en el conector: `scripts/icgc-mesh-ground.py` (vértices a ≤15 m y percentil 5 en la tesela más
    fina, con caché en disco por MD5 de la URL).
- **Trampa conocida:** los LOD gruesos de ICGC quedan altos; hay que bajar siempre hasta la hoja más fina.

## MAP.3 Terreno de Cataluña — ICGC terrain-RGB (`CATALONIA_ELEVATION`)

En `src/shared/components/map/basemapImagery.ts`:

- **URL:** `https://tilemaps.icgc.cat/tileserver/tileserver/terreny-5m-30m-rgb-extent/{z}/{x}/{y}.png`
  (XYZ, z0–14). Modelo d’Elevacions del Terreny 5 m (MET 5 m). **Licencia CC BY 4.0**; atribución
  «Model d’Elevacions del Terreny 5 m — Institut Cartogràfic i Geològic de Catalunya (CC BY 4.0)». bbox
  `[1.40625, 40.98, 2.8125, 42.03]`. Alternativa vista en `scripts/icgc-dem-sample.py`:
  `https://geoserveis.icgc.cat/servei/catalunya/contextmaps-terreny-5m-rgb/wmts/{z}/{x}/{y}.png`.
- **Decodificación** (Mapbox terrain-RGB): `h = −10000 + (R·65536 + G·256 + B)·0,1` m. Un píxel transparente
  equivale al nivel del mar. Los píxeles se leen con `createImageBitmap(..., { colorSpaceConversion: 'none',
  premultiplyAlpha: 'none' })`, porque son alturas y no colores. Alturas **ortométricas**.
- **Límites de bloque:** fuera de Cataluña la fuente responde 0 m, así que el árbol de teselas es un bloque que
  solo contiene Cataluña y mar: `CATALONIA_DEM_TREE = { z0: 10, x0: 516, y0: 380, columns: 4, rows: 4 }`, es
  decir x 516–519, y 380–383 en z10, lon 1,41–2,81, lat 40,98–42,03 (de Tarragona a Girona). El nivel 0 de
  Luciad es ese bloque y `levelCount = 14 − 10 + 1 = 5`. Luciad cuenta las filas desde el sur:
  `y = y0·s + (rows·s − 1 − tile.y)`. Hasta el 2026-10-04 era 3×3 (solo hasta el Maresme). Se amplió cuando
  los IFC de la planta fotovoltaica de Anglès, a altura real, quedaron ~200 m por encima de una escena sin
  terreno debajo.
- **Por qué este DEM:** el «Elevación» mundial está ~18 m alto en el centro (~38 m en el bordillo de Pg. de
  Gràcia) y cortaba cada edificio de la malla por el pie. EU-DEM también va alto (+5 a +19 m) porque en ciudad
  densa mide tejados. Contrastado el 2026-10-01 con el suelo de la malla ICGC (elipsoidal − 49,70), el MET 5 m
  coincide en ~1 m: Pl. Catalunya 20,0/18,6, Barceloneta 4,5/4,3, Eixample 28,1/27,7 y hub de movilidad
  20,5/20,3.
- **Trampa de Luciad 2024.0:** no tiene ruta cruda para elevación (un `FLOAT_32` `TileData` llega a un
  decodificador sin `decodeRaw` y fallan todas las teselas, medido el 2026-10-01). Por eso las alturas se
  reempaquetan en un **TIFF de 16 bits con signo, sin comprimir, little-endian y de una sola tira, redondeado
  al metro** (`encodeInt16Tiff`), que es lo que sirve Fusion. La capa es `LayerType.STATIC`, porque Luciad no
  admite una BASE sobre una STATIC. Las alturas decodificadas se registran también para que los vehículos
  cabeceen con la pendiente (`terrainSampler`).
- **Rejilla de suelo para modelos a altura real en Mapbox** (`demo-assets/tools/icgc_ground_grid.py
  <tileset.json> [cell_m=4]`): el terreno de Mapbox no es el suelo real (en la rotonda C-243c de
  Castellbisbal, el 2026-10-04, quedaba entre +0,1 y +3,1 m sobre la carretera construida, con mediana +1,4).
  El script lee `root.transform` y `boundingVolume.box` del tileset, recorre una rejilla este/norte local con
  celdas de 4 m, muestrea el MET 5 m en **z14** con interpolación bilineal (con clamp en el borde de tesela y
  `User-Agent: cde-demo-assets`) y escribe `extras.cdeGroundGrid = { source, e0, n0, cell, cols, rows, heights }`.
  El frontend levanta cada vértice según `terreno Mapbox − rejilla`. Se combina con
  `extras.cdeAbsoluteHeights`.

## MAP.4 Mapbox — estilo Standard (atardecer), terreno y tráfico

- **Mapbox GL JS desde CDN, sin empaquetar** (licencia propietaria): versión fijada **`3.32.0`**,
  `https://api.mapbox.com/mapbox-gl-js/v3.32.0/mapbox-gl.js` y `.css`, cargada la primera vez que se abre una
  escena Mapbox (`loadMapboxGl.ts`).
- **Token:** público de Mapbox desde `VITE_MAPBOX_TOKEN` (necesita clave, guardada en `.env.local`; en la demo
  independiente de `:8097`, en `demo-assets/mapbox-barcelona/config.js`). **El recurso de escena guarda un
  endpoint sin token**, para que una fila nunca lleve una credencial y el token pueda rotarse sin tocar datos.
- **Estilo:** un recurso de tipo `mapbox-style` con endpoint `mapbox://styles/<owner>/<style>?<config>`. La
  query se convierte en la `config` del import `basemap` (los booleanos pasan a booleanos), y `terrain=false`
  desactiva el terreno. La escena usa
  `mapbox://styles/mapbox/standard?lightPreset=dusk&show3dObjects=true&showPointOfInterestLabels=false&showTransitLabels=false`.
  Luciad no puede dibujar este estilo (edificios 3D, landmarks y árboles son capas `model` y `fill-extrusion`
  propias de Mapbox GL), así que una escena con este recurso se dibuja entera con Mapbox GL e ignora sus
  recursos Luciad.
- **Terreno:** `raster-dem` `mapbox://mapbox.mapbox-terrain-dem-v1` (`tileSize 512`, `maxzoom 14`,
  exageración 1).
- **Tráfico en vivo:** fuente vectorial **`mapbox://mapbox.mapbox-traffic-v1`**, `source-layer: traffic`,
  filtrada a `congestion` ∈ `moderate` (#F59E0B), `heavy` (#DC2626) y `severe` (#7F1D1D). Cubre todas las vías,
  autopistas incluidas, mientras que los tramos del Ajuntament terminan en el límite municipal.
- **Ferrocarril:** `mapbox://mapbox.mapbox-streets-v8`, capa `road`, `class` ∈ `major_rail`, `minor_rail`;
  los túneles se dibujan discontinuos.
- Todas las capas propias van en `slot: 'middle'` del estilo Standard con `line-emissive-strength: 1` para que
  se vean con la luz de atardecer.
- *Licencia/cuotas de Mapbox:* sujetas a la cuenta del token (*Needs verification* para producción).

---

## Resumen de claves y registros

| Fuente | ¿Clave? | Dónde va |
|---|---|---|
| LTA DataMall | **Sí** (`LTA_ACCOUNT_KEY`) | cabecera `AccountKey`; necesita clave, guardada en `.env.local` |
| data.gov.sg | Opcional (`DATAGOVSG_API_KEY`) | cabecera `x-api-key`; sin ella, 6 llamadas cada 10 s |
| Mapbox | **Sí** (`VITE_MAPBOX_TOKEN`) | `mapboxgl.accessToken`; necesita clave, guardada en `.env.local` |
| Todas las de Barcelona, RainViewer, ICGC, Overpass, Open-Meteo | No | — (User-Agent identificativo en Overpass y en el cliente BCN) |

## Ficheros estáticos y sus scripts

| Fichero | Script | Fuente(s) | Cuándo rehacer |
|---|---|---|---|
| SG `data/stations.json` | `scripts/build-stations.py` | LTA XLS + SHP, data.gov.sg exits | cuando LTA añade estaciones (actualizar el nombre del ZIP de huellas) |
| SG `data/lines.json` | `scripts/build-lines.py` | OSM/Overpass | cuando cambian las líneas |
| BCN `src/providers/rail/rail-network.json` | `scripts/build-rail-network.mjs` | OSM/Overpass | cuando cambia el área o la vía |
| BCN `data/accident-hotspots.json` | `scripts/build-accident-hotspots.mjs` | Guàrdia Urbana ×4 + XEMA | anual |
| BCN `data/itinerary-baseline.json` | `scripts/build-itinerary-baseline.mjs` | `itineraris` mensual + XEMA | semestral |
| BCN `data/segment-rain.json` | `scripts/build-segment-rain.mjs` | `trams` mensual + XEMA | semestral |
| BCN `data/bicing-rain.json` | `scripts/analysis/bicing_hourly.py` + `bicing_rain.py` | `estat-estacions-bicing` (7z) + XEMA | a demanda |
| BCN `data/barris.json` | `scripts/build-barris.mjs` | `20170706-districtes-barris` | si cambian los límites |
| BCN `data/endolla-placement.json` | `scripts/build-endolla-placement.mjs` | Endolla + OSM | cuando Endolla añade ubicaciones |
| BCN `data/aca-episode-*.json` | `scripts/archive-aca-episode.mjs` | ACA | antes de 3 meses tras el episodio |
| BCN `assets/3d/icgc-barcelona/tileset.json` | `scripts/build-shifted-tileset.mjs` | ICGC Scene-28 | solo como reserva |
| tilesets IFC `extras.cdeGroundGrid` | `demo-assets/tools/icgc_ground_grid.py` | ICGC MET 5 m z14 | por modelo |
