# Modelos con coordenadas lejanas (UTM en la geometría)

> Estado: análisis y diseño, 2026-10-02. La parte 1 (render + datum) está prototipada sobre el
> WIP antiguo de `C:/repo/ifc` y verificada en navegador; **no está en `main`**.

## 1. El problema, medido

Fichero real: `PC-CPB-20060_RP_OBEX_AG.ifc` (Civil 3D 2025, IFC2X3, rotonda de Castellbisbal).

- 5 `IfcBuildingElementProxy` con `IfcFacetedBrep` (≈1 000 caras), extensión 25 × 21 × 4 m.
- Todos los `IfcLocalPlacement` en (0,0,0); **los vértices llevan UTM**: E ≈ 412 700, N ≈ 4 593 500, Z ≈ 150.
- Sin `IfcSite`, sin `IfcMapConversion`, sin `ePSet_MapConversion`, sin CRS. El EPSG (25831) no consta en ningún sitio.

Qué hace la cadena con él:

| Paso | Qué pasa |
|---|---|
| web-ifc (`COORDINATE_TO_ORIGIN: false`) | Recentra cada brep sobre sí mismo y pone la posición UTM en la transformación float64 del elemento (medido: `flatTransformation` = 412 698 / 150 / −4 593 511). |
| fragments `IfcImporter` | `distanceThreshold = 1e5`: **descarta** todo elemento cuya transformación supere 100 km en algún eje (solo `console.warn`). |
| Resultado | Árbol y propiedades sí; geometría **cero**. El usuario ve una escena vacía sin ningún error. |

Aunque no se descartaran, dibujar a 4,6·10⁶ m da ~0,5 m de resolución en float32 (2⁻²³ × 4,6·10⁶): temblor y caras colapsadas.

## 2. Cómo es el mundo (por qué esto será frecuente)

Según la [guía de georreferenciación de buildingSMART](https://ucm.buildingsmart.org/use-case-details/2047/en) y los foros de buildingSMART/Autodesk, en la práctica circulan cuatro formas de colocar un modelo:

| Forma | Quién la produce | Geometría | Georreferencia |
|---|---|---|---|
| **A. Local + MapConversion** (lo correcto, LoGeoRef 50) | Revit (base de proyecto + EPSG), Archicad, Bonsai | Cerca del origen | `IfcMapConversion` (IFC4) o `ePSet_MapConversion` (IFC2x3) con E/N reales |
| **B. Coordenadas de mapa en la geometría + MapConversion(0,0) + CRS** | Civil 3D / Revit «coordenadas compartidas» bien configurados, Bonsai con «map coordinates» | **Lejos** (UTM) | MapConversion con E=N=0: «mi sistema de proyecto ES el CRS» |
| **C. Coordenadas de mapa sin nada más** (nuestro fichero) | Civil 3D por defecto, InfraWorks, exportadores GIS→IFC, Revit «shared» sin EPSG | **Lejos** | Ninguna: hay que preguntar el CRS |
| **D. Local sin georreferencia** | La mayoría de modelos de edificación | Cerca | Ninguna (o IfcSite lat/lon aproximado) |

La obra civil (carreteras, urbanización, redes, topografía) produce casi siempre B o C, y en una federación típica se mezclan con A/D de arquitectura y estructura. **La app tiene que soportar A+B+C+D mezclados**, no solo «que se vea».

## 3. Cómo lo resuelven otros

- **xeokit**: [RTC (relative-to-center)](https://xeokit.io/blog/viewing-double-precision-models): los vértices se guardan relativos a centros en doble precisión en CPU, y la matriz model-view se compone en float64 antes de subir a la GPU. Conserva las coordenadas originales y permite federar modelos con orígenes distintos.
- **Cesium**: RTC / RTE (relative-to-eye) por tile.
- **Bonsai / Blender**: «false origin». El fichero conserva las coordenadas de mapa y la escena trabaja desplazada un offset que se guarda y se deshace al exportar.
- **Navisworks / Solibri / BIMcollab**: alinean federaciones por coordenadas compartidas: todos los modelos en un mismo sistema, con un desplazamiento global de visualización.

**Elección para nosotros: false origin (desplazamiento al convertir) + datum común de escena.**
RTC por objeto sería lo «puro», pero aquí todo trabaja en coordenadas de escena: fragments (tiles, LOD y culling en worker), los planos de corte, el picking, camera-controls, sombras, postproceso, el mapa y las nubes de puntos. Llevarlos todos a float64 es reescribir el visor. El false origin consigue lo mismo para cualquier federación de un solo emplazamiento, que es el 99 % de los casos, con una única pieza nueva: **un offset global y conocido**. Es la misma decisión que tomó Bonsai.

## 4. Modelo de coordenadas (la invariante)

Tres marcos, y una sola regla para pasar de uno a otro:

```
REAL (fichero IFC, metros, ejes de escena)  ──(+ D)──▶  ESCENA (lo dibujado)
REAL ──(MapConversion o identidad)──▶ CRS (grid E/N/H del proyecto) ──proj4──▶ WGS84
```

- `D` = **datum de escena**: un único vector por escena. `drawn = real + D` para todo modelo que pertenezca al emplazamiento.
- `viewer.getModelCoordination(id)` devuelve exactamente ese vector (o el propio del modelo si está en otro emplazamiento).
- **Cualquier cosa que entre o salga en coordenadas reales cruza D exactamente una vez**: lectura de cotas, BCF (cámara y planos de corte), nubes de puntos, placement en el mapa, comparación de versiones y exportaciones con coordenadas.

Reglas del datum (implementadas en `coordination-datum.ts`):
1. El primer modelo desplazado fija D (su propio shift de conversión).
2. Un modelo cuyo centro real esté a ≤100 km en planta del origen real de D se une a D, mediante un offset pequeño en `model.object`, nunca en el pivot del usuario.
3. Más lejos significa otro emplazamiento: conserva su shift y se avisa. Forzarlo a D lo dibujaría a >100 km, que es justo el fallo de partida.
4. Los modelos locales cerca del origen no se tocan; si al fijarse D resultan estar en el emplazamiento, se unen a él.
5. D se libera cuando ningún modelo cargado lo usa.
6. Se desactiva la `autoCoordinate` de fragments, que alineaba todo al **primer** modelo fuera cual fuera. Medido: un modelo local cargado tras uno UTM acababa a 4 600 km.

## 5. Plan por fases

### Fase 1: que se vea y federe bien (prototipada y verificada)
- Detección por bytes de `IFCCARTESIANPOINT`/`LIST` con alguna coordenada ≥1e5 (unos 200 ms en 68 MB) → `COORDINATE_TO_ORIGIN: true` solo en esos ficheros.
- Red de seguridad: si fragments avisa de elementos descartados, se reconvierte el fichero con el origen desplazado.
- Datum común + `autoCoordinate=false` + leer el shift con `getCoordinates()`. **Trampa medida:** `getCoordinationMatrix()` cachea una matriz que se devuelve antes de rellenarse y, con llamadas concurrentes, da la identidad.
- Caché OPFS: subir versión, porque los `.frag` antiguos de estos ficheros están vacíos.
- **Pendiente: umbral sensible a unidades.** El escaneo mira números crudos; en un IFC en mm, un edificio de 150 m (150 000 mm) da falso positivo. No es grave porque el shift queda registrado, pero rompe la promesa de «solo lo lejano se mueve». Hay que leer `IFCSIUNIT(*,.LENGTHUNIT.,.MILLI.,.METRE.)` y las unidades de conversión (pies) y escalar el umbral.

### Fase 2: no romper nada que use coordenadas reales (obligatorio antes de publicar)
Todo esto da por hecho que el offset es 0, que era cierto hasta ahora:
- **BCF** (`bcf-viewpoint.ts` en `main`): dice explícitamente «NOT CONVERTED: the loader's coordination offset… is zero». Con D ≠ 0, un BCF exportado lleva la cámara a 4,6·10⁶ m del sitio, y un BCF de Solibri o BIMcollab (en coordenadas reales) nos deja la cámara a 4 600 km. Solución: `real = toIfcAxes(scene − D)` al escribir y `scene = fromIfcAxes(real) + D` al leer, en la cámara y los planos de corte. Hay un único D por escena, así que no hay ambigüedad.
- **Placement del mapa** (`placement.ts`): aplica la MapConversion al centro de la caja **en escena** (`xP = bounds.center.x`). Tiene que ser el centro en coordenadas reales: `bounds − D`.
- **Comparación de versiones / diff**: dos versiones del mismo fichero se desplazan por su primera malla, y si esta cambia entre versiones aparecen movimientos falsos. El datum lo corrige porque ambas se unen a D; falta un test que lo fije.
- **Medición**: `toModelCoordinates` ya resta la coordinación ✓.
- **Nubes de puntos**: `pc-align` ya suma la coordinación ✓, pero ver fase 3 para el caso C.

### Fase 3: georreferenciar lo que se pueda (que el mapa y las nubes caigan solas)
- **Escalera** (`georef-ladder.ts`): hoy marca `MapConversion(0,0)` como `invalid.nullIsland`. Eso es correcto para un modelo local (es un valor por defecto basura), pero es **el caso B legítimo** cuando la geometría es lejana. Regla: si el modelo está desplazado (|D| > 0) y E=N=0, el escalón es válido y el grid es la propia geometría.
- **Nuevo escalón para el caso C**: geometría lejana sin nada más significa «grid sin CRS» (`status: partial`, `unknownCrs`, E=N=0). Así se abre el selector de CRS que ya existe. El usuario elige EPSG:25831 una vez (se guarda por fichero) y el mapa, el terreno y las nubes quedan exactos.
  - Sugerencia automática del CRS: con N≈4,59·10⁶ y E≈412 000 cuadran todas las zonas UTM norte, así que no se puede adivinar sin un indicio. Indicios disponibles: idioma o aplicación del IFC (Civil 3D «Español»), la ubicación de otro modelo federado ya georreferenciado, o el último CRS que eligió el usuario. Se ofrece como sugerencia y nunca se aplica en silencio.
- `largeWcsOffset` existe en `GeorefExtraction` pero **nadie lo activa**: hay que conectarlo a «modelo desplazado» para que el aviso de la UI (`status.largeOffset`) aparezca.
- **Federación A + B/C**: un modelo de arquitectura local con MapConversion y un modelo civil en UTM solo encajan pasando por el CRS: `CRS = MapConversion(local)` frente a `CRS = geometría`. Hoy eso lo hacen los «satélites» del mapa (vía lat/lon), y solo en modo mapa. Lo correcto a medio plazo es que el datum viva en el marco **CRS** cuando haya georreferencia, y no en el marco del fichero. Es la fase más grande; hacerla después de la 2.

### Fase 4: decírselo al usuario
- Aviso discreto en el panel del modelo: «Coordenadas de mapa detectadas (≈412 km E, 4 593 km N). Se muestra desplazado; las coordenadas reales se conservan en medidas, BCF y exportaciones.» Más el botón «Elegir sistema de coordenadas…» para el caso C. ×10 idiomas.
- La regla del validador `RULE_COORDINATE_OFFSET` se mantiene (es un consejo de autoría correcto para otras herramientas), pero su texto debe dejar de sugerir que el visor falla.
- SDK: incluir `coordination` en `model-loaded` para que los integradores puedan traducir coordenadas.

## 6. Presupuesto de precisión

| Distancia al origen de escena | Paso float32 |
|---|---|
| 1 km | 0,06 mm |
| 10 km | 1 mm |
| 100 km (radio del datum) | 8 mm |
| 4 600 km (sin datum) | 0,5 m |

Una obra lineal de 30 km dentro de un datum queda por debajo de 2–4 mm en el extremo. Si hiciera falta más, el paso siguiente sería el RTC de xeokit por tile, no agrandar el radio.

## 7. Pruebas que deben existir

- Unitarias: detector (unidades, exponentes, listas IFC4, MapConversion ignorada), resolución del datum (set/joined/separate/local/retro-join), escalera con E=N=0 y modelo lejano, BCF ida y vuelta con D ≠ 0.
- Integración (web-ifc + fragments reales en Node, fichero pequeño en `__fixtures__`): con el cambio, 0 elementos descartados; la matriz de coordinación conservada; dos copias desplazadas que federan a la distancia real exacta.
- Navegador (verificado en el prototipo): fichero solo visible; dos UTM a +30/+20 m exactos; local+UTM en los dos órdenes, ambos cerca del origen.
