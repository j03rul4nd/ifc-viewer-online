# GIS render quality — diagnóstico (fase 1)

Diagnóstico de por qué el mundo 3D de contexto (verde, caminos, edificios OSM) no daba
la talla visualmente, con causa y `fichero:línea` por frente. **Solo diagnóstico: cuando se
escribió, no se había tocado `src/`.**
Baseline de tests verificado antes de escribir: `road-network.test.ts` + `osm-scene.test.ts` +
`context-suppression.test.ts` → 118 tests en verde.

Convención de coste: **barato** = < ~1 día, cambio local, sin API nueva. **medio** = toca varios
módulos o añade campos que cruzan el worker. **caro** = diseño nuevo + UI + persistencia.

---

## Frente 1 — El verde se ve mal y sale incompleto

### 1.1 La causa dominante: el camino por defecto es el translúcido

`geoStore.ts:63-66` (`readContextDetail`) y `geo-system.ts:274` fijan `contextDetail = 'simple'`
como valor por defecto. `geo-system.ts:764-765` (`surfaceQuality`) mapea `simple → 'simple'`, así que
**la ruta que ve el 100 % de los usuarios que no han tocado el selector es `buildSimpleSurface`**.

Ahí, `osm-scene.ts:231-240`:

```
const material = new THREE.MeshBasicMaterial({
  color: layer === 'water' ? WATER_COLOR : 0xffffff,
  vertexColors: colors.length > 0,
  transparent: true,
  opacity: layer === 'water' ? 0.72 : 0.45,
  depthWrite: false,
  side: THREE.DoubleSide,
})
```

**Pista confirmada, y además ya hay precedente interno de que la decisión era mala.** En el mismo
fichero, `osm-scene.ts:906-916`, la capa de carreteras en `simple` fue convertida a opaca con este
comentario textual: *"OPAQUE: asphalt is a surface, not a tint over the map underneath, and letting
the raster street show through was what made these read as a decal"*. El verde se quedó atrás en esa
misma corrección. Un `opacity: 0.45` sobre una ortofoto/tile con edificios y calles impresos da
exactamente el síntoma descrito: se ve el mapa, no el parque.

Matiz importante: el `renderOrder` (`osm-scene.ts:100-101`) y `depthWrite: false` ya ordenan la pila
coplanar, así que subir la opacidad **no** necesita tocar el orden de dibujo. Es un cambio de un
valor y su comentario.

- **Coste: barato.** Riesgo: en `simple` el verde pasa a plano y macizo; conviene subir a ~0.85–0.92
  en lugar de 1.0 y mantener `vertexColors` (los tonos por tipo de `greenTone` ya existen y son
  buenos, `feature-variation.ts:166`).

### 1.2 "Parques a trozos": el `break` del presupuesto — confirmado, pero solo en `detailed`

`osm-scene.ts:330` `let budget = DETAIL_MAX_POINTS` (40 000) y `osm-scene.ts:337` `if (budget <= 0) break`.
El `break` está en medio del bucle `for (const f of wanted)`, así que al agotarse el presupuesto
**se abandonan todas las features restantes de la lista**, no se degrada la teselación. Con
`DETAIL_EDGE_M.green = 16` (`osm-scene.ts:110-111`) y un bosque o un parque grande, 40 000 puntos se
consumen en pocas features y el resto del layer no existe. El orden lo dicta Overpass, o sea que
qué parque sobrevive es arbitrario y no reproducible.

Además, `osm-scene.ts:363` pasa `maxPoints: Math.max(ringM.length, budget)`: la última feature que
entra se subdivide con lo que quede, lo que produce el "a trozos" **dentro** de un polígono grande
(mitad teselada fina, resto sin subdividir) antes incluso de que el `break` mate al resto.

**Corrección natural:** dos pasadas — repartir el presupuesto por área proporcional entre las
features del layer, con un mínimo por feature igual a su triangulación base (que siempre cabe:
son los vértices del ring). Nunca abandonar una feature; degradar `maxEdgeM`.

- **Coste: barato-medio.** Es local a `buildDetailedSurface` + un test de regresión con presupuesto
  agotado. **Pero ojo: no arregla el síntoma que el usuario ve por defecto**, porque por defecto se
  está en `simple`, que no tiene presupuesto. Hay que confirmar en qué nivel se sacaron las capturas.

### 1.3 Multipolígonos: `inner` ignorado — confirmado

`osm-features.ts:545-552`:

```
for (const m of el.members) {
  if (m?.role !== 'outer' || !Array.isArray(m.geometry)) continue
  ...
  if (ring) out.push({ id: `r${el.id}-${part++}`, kind, ring, height, style })
}
```

Confirmado literalmente: los miembros `inner` se descartan y cada `outer` sale como feature
independiente. Consecuencias reales: un parque con un lago dentro se pinta macizo verde **por
encima** del agua (el agua tiene `renderOrder` 3 > verde 2, así que el agua gana el sorteo y el
artefacto se disimula — pero un edificio dentro de un parque sí queda con verde por debajo, que es
correcto por casualidad); y un `landuse=forest` con claros mapeados se pinta lleno.

Impacto visual real: **menor de lo que sugiere la pista**. Los huecos de multipolígono son
minoritarios frente al problema de opacidad. Además arreglarlo es lo más caro del frente: hay que
llevar `holes` hasta `OsmFeature`, y las dos rutas de triangulación (`osm-scene.ts:143` y
`osm-scene.ts:348-355`) pasan `[]` como segundo argumento de `triangulateShape` — ese hueco está
previsto por la API, pero `subdivideMesh` (`surface-tessellation.ts`) habría que revisar si tolera
agujeros.

- **Coste: medio-caro.** Recomiendo diferirlo.

### 1.4 Features que se caen en silencio

Dos sumideros silenciosos, ambos confirmados:
- `osm-scene.ts:143-152` `triangulate()` devuelve `null` (ring auto-intersectado, colineal,
  earcut lanza) → `osm-scene.ts:190` `if (!faces) continue`.
- `osm-scene.ts:348-355`: `try { triangulateShape } catch { continue }` y `if (raw.length === 0) continue`.

**No se puede cuantificar sin datos reales** (harían falta llamadas a Overpass, y el plan pide
espaciarlas). Lo barato y correcto es instrumentar: `buildSurfaceLayer` ya devuelve `{ object, count }`;
añadir `dropped` al retorno y loguearlo por `createLogger('GeoSystem')` cuesta minutos y convierte
esta pregunta en un número. **Hacerlo antes de decidir si hace falta un fallback** (convex hull o
buffer del ring), tal como pide el plan.

Un tercer sumidero que el plan no menciona: `closeRing` (`osm-features.ts:614-615`) descarta todo
ring con área menor que `MIN_AREA_M2` — `green: 60 m²` (`osm-features.ts:442-454`). Jardines y
parterres urbanos pequeños desaparecen ahí. Es defendible, pero es parte del "sale incompleto".

### 1.5 Presupuesto Overpass — **pista incorrecta tal como está escrita**

`osm-features.ts:660-700`. La pista dice "cap global 6000" y "el ground cover solo tiene el 30 %".
**No es un cap global.** El comentario del propio código (`osm-features.ts:672-684`) explica que se
abandonó el union único precisamente por eso, y ahora cada grupo emite su propio `out geom N`:

```
...groups.map(([body, cap]) => `(${body});out geom ${Math.max(1, cap)};`)
```

Las cuotas suman 1.77 × `maxElements`, así que el ground cover tiene **1 800 elementos propios** y no
compite con los 3 300 de highways. 1 800 polígonos de cobertura en una caja de 1,4 km es holgado
(el comentario cita 5 581 land-cover en Poblenou, pero eso era con el union roto y sin las cuotas por
grupo — ahora el recorte a 1 800 sí puede morder en un sitio con muchísimos polígonos pequeños de
`landuse`). **Veredicto: no es la causa del verde incompleto; a lo sumo un contribuyente de tercer
orden.** No tocar sin medir.

### 1.6 Material / variación de tono

`greenTone` (`feature-variation.ts:166-181`) ya distingue bosque / matorral / viña / cementerio /
pitch / huertos, y `greenRoughness` (`:188-205`) alimenta el shader. En `detailed` eso llega a
`createSurfaceMaterial('grass')` vía `aRough`. En `simple` **la rugosidad se tira**: solo el color
vertex llega, y encima al 45 % de opacidad. O sea: la variación de tono ya existe, lo que falla es
que el camino por defecto la diluye. Confirmado que "el problema puede ser tanto de material como de
que el polígono ni llega a pintarse" — es **material, en el 80 %**.

---

## Frente 2 — Ocultar elementos del mundo 3D (templo japonés)

### 2.1 La causa real: la supresión es direccional y no cubre la contención

`context-suppression.ts:214-228`:

```
let inside = 0
let tested = 0
for (const q of ring) { ... if (pointInPolygon(p, f.poly)) inside++ }
if (tested > 0 && inside / tested >= COVERAGE_FRACTION) return false
```

Con `COVERAGE_FRACTION = 0.6` (`context-suppression.ts:99`), se suprime un feature OSM cuando **el
60 % de SUS vértices caen dentro de la huella del modelo**. El test corre en un solo sentido.

El caso del templo es el sentido contrario: OSM tiene una **manzana o un recinto grande** (un
`building` que abarca el conjunto del templo, o un edificio vecino mucho mayor que el IFC). El
modelo está dentro del polígono OSM, no al revés. `inside/tested` sale ≈ 0 (ningún vértice del
polígono grande cae dentro del modelo) → **nunca se suprime**, por muy encima del modelo que esté.
Es un fallo estructural, no un margen corto.

### 2.2 Las tres sospechas del plan, evaluadas

- **`facilityKindFromTree` devuelve `unknown`** → *irrelevante para este caso*. `DEFAULT_POLICY.unknown`
  (`context-suppression.ts:81`) es idéntico a `building`: `{ building: true, tree: true, signal: true }`.
  Comentado explícitamente en `:29-35`. **Pista descartable.**
- **`footprintFromBounds` es un rectángulo del bbox** → *parcialmente incorrecta*. `geo-system.ts:360-375`
  prefiere `ctx.getActiveModelFootprint()` (contorno **orientado**) y solo cae al AABB si no hay
  ninguno. Hay que verificar en runtime si el templo devuelve footprint orientado; si lo devuelve,
  esta pista no aplica. Si no, el AABB de un templo (planta casi cuadrada) tampoco es el problema.
- **`DEFAULT_MARGIN_M = 2` es corto** → *no es la causa*, aunque sí ayuda al ras: subirlo no cambia
  nada en el caso de contención, porque el ratio sigue siendo ~0.

### 2.3 Arreglo propuesto (a validar en fase 2)

Hacer el test **simétrico y por solape**, no por conteo de vértices en un sentido:
1. si el centroide del modelo cae dentro del ring OSM **y** el área del ring < K × área del modelo
   (K ~ 6, para no borrar un polígono de barrio entero) → suprimir;
2. mantener el criterio actual de cobertura para el sentido normal.
Ambos casos son geometría pura y caben en `context-suppression.ts` con tests, sin tocar escena.
Añadir además una **política de override desde UI** para el caso irreducible (ver 2.4).

- **Coste: barato.** Es el arreglo con mejor relación impacto/esfuerzo de todo el informe.

### 2.4 Ocultar un edificio con un clic — viable y barato

`building-mesh.ts:56-60` y `:293` construyen `ranges: BuildingRange[]` = `{ id, start, end }` sobre
la geometría fusionada. `geo-system.ts:1047-1059` (`pickFeatureAt`) ya hace el raycast y traduce
`faceIndex → range → OsmFeature`. **El pick ya está resuelto.**

Ocultar sin partir el merge: la geometría es **no indexada** (`building-mesh.ts` empuja posiciones
triángulo a triángulo), así que un rango de vértices es un bloque contiguo de triángulos. Colapsar
ese rango (los tres vértices de cada triángulo al mismo punto) lo degenera y desaparece, con **cero
draw calls nuevos** y sin reconstruir el mesh. Necesita guardar las posiciones originales del rango
para poder restaurar — o simplemente llamar a `rebuildLayers()` con un `Set<string>` de ids ocultos,
que ya es instantáneo porque nunca refetchea (`geo-system.ts:758-761`).

**Recomiendo la segunda vía**: un `hiddenFeatureIds: Set<string>` consultado en el filtro de
`rebuildLayers` (`geo-system.ts:786-790`, donde ya vive `modelSuppressor()`), reutilizando el punto
único de filtrado que el comentario de ese bloque defiende expresamente. Persistencia: el patrón de
`featureLayers` en `geoStore` + `cmd.layers` del SDK; para share/embed, leer `docs/EMBED_URL_PARAMS.md`
antes de nombrar nada.

- **Coste: medio** (lógica barata; el gasto está en UI de selección/deshacer y en persistencia).

### 2.5 Descubribilidad de capas y granularidad

Las 10 `FEATURE_KINDS` (`osm-features.ts:38`) se pintan como checkboxes en `GeoPanel.tsx:1186`, y
`GeoPanel.tsx:723` ya cuenta las visibles. Separar peatonal de carretera **cambia el tipo
`FeatureKind`**, que viaja por el worker, por localStorage y por `cmd.layers` del SDK → es un cambio
con migración. Alternativa mucho más barata: mantener `road` como `FeatureKind` y añadir una
sub-clase de estilo (`FeatureStyle.roadClass: 'vehicular' | 'pedestrian'`), con el toggle de UI
filtrando por ella. Esto **también es lo que hace falta para el frente 3**, así que las dos cosas
comparten el mismo cambio.

- **Coste: medio** si se hace por sub-clase de estilo; **caro** si se toca `FeatureKind`.

---

## Frente 3 — Caminos: intersecciones y peatonales

### 3.1 Peatonales dentro del grafo de coche — confirmado, y es la causa raíz de junctions feos

`osm-features.ts:138-146` mete `pedestrian, footway, path, cycleway, track, steps` en `ROAD_VALUES`;
`osm-features.ts:150-159` les da ancho (`path: 1.6`, `footway: 2`); `osm-features.ts:520-533` los
emite con `kind === 'road'`; `osm-scene.ts:761-773` los empuja todos a `networkWays` y
`osm-scene.ts:811` los resuelve en un único `buildRoadNetwork`.

Consecuencia concreta y demostrable a partir del solver:

1. Un `footway` que termina en el eje de una `trunk` **parte la trunk en dos aristas**
   (`road-network.ts:220-253`, `splitWays`) y crea un nodo de **degree 3**.
2. En ese nodo (`road-network.ts:503-524`), `widest = 6 m` (media trunk) y
   `cap = MAX_TRIM_WIDTHS * widest = 30 m` (`road-network.ts:114`, `:507`).
3. Las dos ramas de la trunk son casi antiparalelas; `solveFillet` (`road-network.ts:296-310`) con
   `denom = cross(dirA, dirB)` cercano a cero da `tA/tB` enormes → se recortan a 30 m.
4. `need[]` es un **máximo sobre las dos cuñas** que bordean cada brazo, así que un solo footway de
   1,6 m obliga a recortar **hasta 30 m (o el 42 % de la arista, `road-network.ts:107`)** de una
   avenida y a pintar un polígono de cruce de ese tamaño donde solo hay una acera que llega.

Esto es exactamente el síntoma "tramos feos donde la vía se ensancha o se bifurca". **La pista del
plan se confirma y además es más grave de lo que sugiere**: no es solo estético (un footway parece
una carretera en miniatura), es que **contamina la topología del grafo de calzada**.

**Corrección propuesta:** separar en dos grafos. `buildRoadNetwork(vehicular)` y
`buildRoadNetwork(pedestrian)`, cada uno con su tono, su rugosidad y su bordillo. Un footway ya no
crea nodos en la red de coche; a lo sumo se dibuja por encima. Esto es un cambio pequeño en
`osm-scene.ts:761-773` + una sub-clase en `FeatureStyle`, y `road-network.ts` no cambia nada.

- **Coste: medio.** Alto impacto visual. Test de regresión evidente: footway ⟂ trunk → la trunk no
  se recorta y no aparece junction.

### 3.2 Peatonales: qué de la pista es incorrecto

*"comparten material asfalto"* — **parcialmente incorrecto**. El **tono sí** está diferenciado por
clase: `ROAD_TONES` (`osm-features.ts:198-203`) da `footway [0.52,0.46,0.39]`, `path`, `cycleway`
azulado, `track` terroso, y llega como color por vértice. Lo que **sí** se comparte:
- el **material** en `detailed`: un único `createSurfaceMaterial('asphalt', …)` para toda la capa
  (`osm-scene.ts:899-901`),
- la **rugosidad**: un solo `ROUGHNESS_BY_KIND.road = 0.22` (`osm-scene.ts:926`) aplicado con
  `metricAttributes` (`osm-scene.ts:898`) — el grano de asfalto sobre un camino de tierra,
- el **bordillo**: `SIDE_DROP_M.road = 0.16` (`osm-scene.ts:573`, usado en `:812`) se aplica igual a
  una acera de 2 m que a una autopista.

La rugosidad ya viaja como atributo por vértice en las capas de suelo (`FeatureStyle.roughness`,
`osm-features.ts:97`), así que hacer lo mismo en la capa lineal es seguir un patrón existente, no
inventar uno. Las marcas viales ya están protegidas: `CENTRE_LINE_MIN_WIDTH_M = 6.5`
(`osm-scene.ts:580`) impide pintar línea central en un footway.

- **Coste: barato** (rugosidad por vértice + bordillo por clase). Se hace en la misma pasada que 3.1.

### 3.3 Intersecciones: el defecto geométrico concreto, con caso reproducible

Independiente de las peatonales, hay un **desajuste borde-de-ribbon vs borde-de-junction en curva**:

- El polígono de la junction se construye con `arm.dir` (`road-network.ts:539-546`), que viene de
  `endDirection(e.points, …)` (`road-network.ts:474-476`) medido sobre la polilínea **sin recortar**
  — la dirección hacia el vértice original siguiente.
- El ribbon se recorta con `trimPolyline` (`road-network.ts:314-346`), que **inserta un vértice
  interpolado** en el punto de corte, y luego `mitredBorders` (`road-network.ts:378-...`) calcula el
  borde del extremo con la dirección del **primer segmento del ribbon ya recortado**.
- Si el recorte cruza uno o más vértices de una curva —lo normal en un giro o en un ramal— esas dos
  direcciones **no coinciden**, y el borde del polígono de cruce y el borde de la calzada abren un
  hueco o se solapan. Cuanto más curva la aproximación y más grande el recorte, peor.

**Caso reproducible para test:** tres ways en un nodo, uno de ellos con curvatura sensible en sus
primeros ~20 m (p. ej. vértices cada 5 m con giro de 10° por vértice) y un ancho que fuerce un trim
> 20 m. Aserción: los dos vértices del polígono de la junction correspondientes a ese brazo deben
coincidir (dentro de ε) con `ribbon.left[0]` / `ribbon.right[0]`. Hoy no coinciden. **La corrección
correcta es recalcular `arm.dir` sobre el punto de corte, o construir el polígono a partir de los
extremos reales de los ribbons ya recortados** — es decir, invertir el orden: recortar primero,
cerrar el nodo después.

Comprobados y **descartados** como fuentes:
- El `snap` de 0,3 m (`road-network.ts:100`) — `NodeIndex.add` sondea las 9 celdas vecinas
  (`road-network.ts:186-197`), así que el bug clásico de frontera de celda no existe aquí.
- Los recortes que se comen una arista entera — `MAX_TRIM_FRACTION = 0.42` en ambos extremos suma
  0.84 < 1, `trimPolyline` nunca devuelve `null` por esa vía.
- La ordenación angular del polígono (`road-network.ts:553-566`) ya cubre los slivers plegados.

Un cuarto punto real, distinto: en un nodo de **degree 2 con salto de ancho**
(`road-network.ts:489-499`), `taperHalfWidths` **solo ensancha** (`road-network.ts:355`:
`Math.max(0, target - halfWidths[i])`) y lo hace sobre `TAPER_WIDTHS * flare = 5 × semiancho` metros.
Un `service` de 4 m que continúa como `primary` de 10 m se ensancha a 10 m durante 25 m. Con
peatonales dentro del grafo, un `footway` que continúa como `residential` se convierte en una losa
de 6,5 m de ancho. **Separar los grafos (3.1) también mata este artefacto.**

- **Coste: medio** el desajuste en curva (toca reordenar el pipeline del solver, con tests);
  **barato** una vez separados los grafos.

---

## Frente 4 — Edificios de contexto

### 4.1 La causa: `FeatureStyle` no lleva ningún contexto y `facadeColor` solo ve el id

`feature-variation.ts:132-136`:

```
export function facadeColor(id: string): [number, number, number] {
  const tone = FACADE_TONES[hashId(`${id}#facade`) % FACADE_TONES.length]
  ...
}
```

`FACADE_TONES` (`feature-variation.ts:113-125`) son 6 tonos europeos fijos: render cálido, piedra
gris, arenisca, hormigón, ladrillo pálido. **Pista confirmada al 100 %.**

El bloqueo estructural está aguas arriba: `resolveFeatureStyle` para edificios
(`osm-features.ts:417-...`) devuelve solo `wallColor`, `roofColor`, `roofShape`, `roofHeightM`. **El
valor de `building=` no se conserva en ningún sitio**, ni la región, ni nada del tejido urbano. Y las
tags crudas se descartan deliberadamente en el límite del worker (comentario en `osm-features.ts:100-106`:
clonar todas las tags cuesta más que los pocos números que hacen falta). Así que la palanca es
**añadir campos concretos a `FeatureStyle`**, no pasar tags:

- `buildingUse?: 'house' | 'apartments' | 'temple' | 'shrine' | 'industrial' | 'retail' | 'civic' | ...`
  (un enum corto resuelto en `osm-features.ts`, puro),
- una **región** que ya se conoce sin coste: `placement.lat/lon` viven en `geo-system.ts` y llegan a
  todos los builders vía `LayerMeshOptions.anchorLat`; basta añadir `anchorLon` y derivar una zona
  cultural gruesa, o pasar directamente una `palette` elegida en `geo-system` y propagada a
  `facadeColor`.

Que la firma sea `facadeColor(id)` y no `facadeColor(id, ctx)` es el único cambio de API, y
`feature-variation.ts` sigue siendo puro.

Lo que **ya está bien y no hay que reconstruir** (confirmado): formas de tejado desde `roof:shape`
(`osm-features.ts:340-348` → `building-mesh.ts:200-252`), colores tagueados que ganan siempre
(`building-mesh.ts:199-201`), parapeto en `detailed` (`building-mesh.ts:211-216`), eje de cumbrera
sobre el eje largo real (`building-mesh.ts:239-241`), bandas de forjado (`feature-variation.ts:145-152`)
y honestidad de altura estimada (`buildings.ts`).

- **Coste: medio.** El grueso es curatorial (paletas por región/uso), no técnico. Impacto visual alto
  en el caso concreto que motivó la tarea (barrio japonés).

### 4.2 Modo "contexto discreto"

`geo-system.ts:818` ya separa el tratamiento: `litFacades = contextDetail === 'detailed'`, y en
`simple` los edificios usan `MeshBasicMaterial({ vertexColors: true })`. Es decir, **el gancho para
un tratamiento neutro ya existe dentro de `simple`**: bastaría un flag ortogonal (`contextTone:
'natural' | 'neutral'`) que, cuando esté en `neutral`, sustituya `facadeColor(seed)` por un tono
único ligeramente variado y desactive la banda de forjado. No es un cuarto nivel de detalle; vive
como modificador en `BuildingMeshOptions` y se propaga desde `rebuildLayers`.

Encaje correcto según el plan: **flag ortogonal a los tres niveles**, resuelto en `building-mesh.ts`,
persistido junto a `contextDetail` en `geoStore`.

- **Coste: barato-medio.**

---

## Orden de ataque propuesto (impacto visual / esfuerzo)

| # | Trabajo | Frente | Coste | Por qué va aquí |
|---|---------|--------|-------|-----------------|
| 1 | Opacidad del verde en `simple` (0.45 → ~0.88) + misma revisión para sand/rock | 1 | barato | Un valor. Arregla el síntoma nº1 en el camino por defecto. Precedente idéntico ya aplicado a carreteras en el mismo fichero. |
| 2 | Supresión por contención (modelo dentro del polígono OSM) | 2 | barato | Desbloquea el caso del templo, que es el que impide la captura. Geometría pura, con test. |
| 3 | Instrumentar `dropped` en las dos rutas de superficie y loguearlo | 1 | barato | Convierte "¿cuántas se pierden?" en un número **antes** de gastar en fallbacks. Prerrequisito de decisión. |
| 4 | Separar grafo peatonal del vehicular + rugosidad y bordillo por clase | 3 | medio | Mata a la vez "footway como carretera en miniatura", los junctions espurios y el flare de degree-2. El mejor ratio de los cambios medios. |
| 5 | Presupuesto proporcional por área en `buildDetailedSurface` (nunca abandonar features) | 1 | barato-medio | Necesario para que `detailed`/`showcase` — el nivel de las capturas de artículo — sea fiable. |
| 6 | Paleta de fachadas por uso + región | 4 | medio | Alto impacto en el emplazamiento japonés; sobre todo trabajo de curación. |
| 7 | Modo "contexto discreto" como flag ortogonal | 4 | barato-medio | Barato una vez tocado `building-mesh` en el punto 6; hazlo en la misma pasada. |
| 8 | Ocultar feature con un clic (`hiddenFeatureIds` + UI + persistencia) | 2 | medio | El pick ya existe; el gasto es UI y persistencia. Válvula de escape para lo que 2 no cubra. |
| 9 | Desajuste ribbon/junction en curva (recortar antes, cerrar el nodo después) | 3 | medio | Real y demostrable, pero después de 4 quedan muchos menos nodos afectados. |
| 10 | Huecos de multipolígono (`inner`) | 1 | medio-caro | Correcto pero de bajo rendimiento visual; el `renderOrder` ya disimula el caso más común. |

Notas de ejecución para la fase 2:
- Los puntos 1, 3, 5 y 10 se solapan en `osm-scene.ts`; agrúpalos para no reconstruir el mismo test
  tres veces. Los puntos 6 y 7 se solapan en `building-mesh.ts` / `feature-variation.ts`.
- **Confirmar primero en qué `contextDetail` se tomaron las capturas problemáticas.** Si fue en
  `simple`, el punto 5 no cambia nada de lo que el usuario ha visto; si fue en `detailed`, el punto 1
  no cambia nada. Los dos hay que hacerlos, pero el orden depende de esa respuesta.
- Nada de lo anterior necesita una consulta nueva a Overpass: todo se reconstruye desde
  `osmFeatures` en caché vía `rebuildLayers()` (`geo-system.ts:758-761`).


---

# Addendum — captura de referencia y ejecución de los puntos 1-3

## Emplazamiento de referencia

Kioto, **34.9949 / 135.7850**, rotación 0°. Panel Surroundings: **2 490 edificios OSM, 2 487 alturas
estimadas**, `DETAIL = Showcase`.

**Esto corrige la prioridad del informe original.** `showcase` mapea a `detailed`
(`geo-system.ts:764-765`), así que la ruta activa en la captura es `buildDetailedSurface`, **no**
`buildSimpleSurface`. Por lo tanto:

- El hallazgo 1.1 (opacidad 0.45 en `simple`) **no explica la captura**. Sigue siendo un arreglo
  correcto y barato, pero baja de prioridad.
- El hallazgo 1.2 (presupuesto con `break` a media lista) **es el sospechoso principal** y encaja con
  el síntoma descrito: dentro del parche hay verde bien resuelto y, a pocos metros, zonas que
  deberían ser bosque o parque en gris de terreno pelado. Ese patrón — algunas features perfectas y
  otras inexistentes, sin gradiente entre ellas — es exactamente la firma de un abandono por orden de
  lista, no de un problema de material.

## Qué se ha implementado

### 1. Instrumentación de features perdidas

`LayerMesh` (`osm-scene.ts`) gana dos contadores opcionales:

- **`dropped`** — features que se pidieron y no produjeron geometría: ring que el triangulador
  rechaza (auto-intersectado, colineal, degenerado). Antes eran tres `continue` silenciosos.
- **`degraded`** — features dibujadas con su triangulación base porque el presupuesto no pudo
  financiar la subdivisión que pedían. Están en pantalla y correctas de contorno, solo más planas
  contra el relieve. Solo cuenta las que *pedían* refinamiento (`longestEdge > DETAIL_EDGE_M`), no
  las que ya estaban por debajo del objetivo de arista.

Ambas rutas (`buildSimpleSurface` y `buildDetailedSurface`) los rellenan.

`geo-system.ts` añade `reportSurfaceLoss()`, llamado por cada capa de suelo en `rebuildLayers()`.
Emite una línea `log.info('surface layer', { layer, quality, wanted, drawn, dropped, degraded })`
**solo cuando algo se ha perdido o degradado** — un sitio sano no llena la consola.

**Cómo leer el número en Kioto:** con la app en dev, `localStorage.setItem('ifc:debug', 'GeoSystem')`
y activar el mapa. Cada toggle de capa reconstruye desde caché y vuelve a imprimir, sin refetch de
Overpass (`rebuildLayers` nunca consulta la red).

### 2. Presupuesto proporcional en `buildDetailedSurface`

El bucle único pasa a **dos pasadas**:

- **Pasada 1 (`collectSurfacePieces`)** — proyecta y triangula *todas* las features antes de gastar un
  solo vértice de presupuesto, y cuenta las que fallan.
- **Reparto** — cada feature tiene garantizados los vértices que necesita simplemente para existir
  (los de su propio ring). Solo el sobrante `DETAIL_MAX_POINTS - basePoints` se reparte, **por área**,
  que es lo que la subdivisión realmente compra.
- **Pasada 2** — `subdivideMesh` con `maxPoints = ringM.length + cuota`. Una feature sin cuota cae a
  su triangulación base; **nunca desaparece**.

El `break` a media lista ya no existe. El presupuesto sigue siendo un techo: pasa de decidir *cuánto
mundo se dibuja* a decidir *cuán fino se dibuja*, que es lo que un presupuesto de vértices debe
decir.

Tests nuevos en `osm-scene.test.ts` (`detailed surface budget`): 150 polígonos de 400 m se dibujan
todos con `dropped === 0` y sin reventar el techo de vértices; 4 000 polígonos degradan
(`degraded > 0`) pero siguen contando 4 000; el resultado no depende del orden de la lista; el
presupuesto va donde está el área; y un ring degenerado se contabiliza en `dropped` en vez de
desaparecer.

### 3. Supresión por contención

`context-suppression.ts` añade la **segunda dirección** del solape. La prueba de cobertura existente
solo dispara cuando el feature OSM está *dentro* del modelo; el caso del templo es el contrario — un
recinto dibujado alrededor de todo el conjunto, con el modelo dentro y ni un vértice del polígono
cerca de él, o sea cobertura cero por mucho que se suba el margen.

Nueva regla, con guardia de área (`CONTAINMENT_AREA_RATIO = 6`): si el centro de la huella del
modelo cae dentro del ring OSM **y** el ring no es más de 6× el área de la huella → se suprime. La
guardia es lo que la hace honesta: "el centro del modelo está dentro de este polígono" a secas
borraría un distrito `landuse` entero porque hay una marquesina dentro; exigir que el polígono esté
dentro de unos pocos múltiplos de la planta del modelo significa "este contorno va de este
edificio", no "este contorno lo contiene por casualidad".

Se respeta la política por `FacilityKind` sin excepciones: un modelo de edificio sigue sin borrar el
parque en el que está. Rechazo por bbox antes de la prueba de contención, reutilizando los límites
que ya calcula el recorrido del ring — coste despreciable sobre 2 490 edificios.

Tests nuevos en `context-suppression.test.ts` (`the model inside the mapped polygon`): el recinto de
200×200 sobre una planta de 100×100 se suprime; el distrito de 400×400 no; un vecino del mismo tamaño
que no contiene al modelo no; el parque que lo contiene tampoco (política); y funciona con
`FacilityKind = 'unknown'`, que es lo que son la mayoría de los IFC.

### Estado

`npx tsc --noEmit` limpio. **662 tests en verde** en `src/lib/geo` (26 ficheros). Solo se han tocado
`osm-scene.ts`, `context-suppression.ts`, `geo-system.ts` y sus dos ficheros de test.

Pendiente, a la espera de OK: opacidad del verde en `simple` (punto 4) y separación del grafo
peatonal (punto 5).

---

## Hallazgo aparte — el borde del parche (esquina inferior derecha de la captura)

**Confirmado como cosa distinta del frente del verde.** Hay dos radios que no coinciden:

- el **cuadro de features OSM**, `BUILDINGS_HALF_SIZE_M = 700` (`geo-system.ts:756`, usado en `:613`)
  → una caja de 1,4 km. Más allá no hay ni un edificio, ni una calle, ni un parque nuestro;
- el **parche de terreno**, `patchSize = centre.size * 3` (`geo-terrain.ts:157`) → 3×3 teselas del
  zoom elegido, un radio distinto y en general mayor.

Lo que se ve abajo a la derecha es el **primero**: la geometría se acaba de golpe y sigue el basemap
crudo con sus etiquetas japonesas. No es un fallo, es el límite de los datos — pero es un límite
dibujado con un corte recto, que es lo que lo delata.

**¿Tiene arreglo barato?** Sí, mitigación; no, eliminación.

- **Ampliar el parche** (subir `BUILDINGS_HALF_SIZE_M`) es lo peor de las tres opciones: cuesta
  presupuesto de Overpass de forma cuadrática, y **no quita el borde, solo lo mueve**. Descartar.
- **Niebla** es un cambio de dos constantes: `MAP_FOG_NEAR_M = 30_000` / `MAP_FOG_FAR_M = 55_000`
  (`geo-system.ts:47-48`) están calibradas para escala territorial, así que hoy no hacen nada a
  1,4 km. Bajarlas al orden del cuadro de features fundiría la transición a coste cero de geometría.
  Contra: afecta a toda la escena, incluido el IFC, y hay que comprobarlo contra el cielo de
  `sky-environment`. **Barato, con efecto secundario global.**
- **Fundido radial del propio borde** — atenuar la opacidad de las capas de suelo y la saturación del
  overlay del basemap en el último ~15 % del radio — es lo correcto visualmente y es trabajo de
  shader sobre `surface-shaders` y el overlay del basemap. **Medio.**

**Recomendación:** tratarlo como una decisión de encuadre, no como un bug. Lo verdaderamente barato y
que da la captura de artículo es **componer el plano para que el borde quede fuera de cámara**, y
dejar el fundido radial como trabajo separado si se quieren planos aéreos amplios. No se ha
implementado nada de esto.


---

# Addendum 2 — medición en vivo, frentes 3 y 4

## Medición del presupuesto, en la app real

Kioto 34.9949 / 135.7850, Showcase, terreno 3D activo, 2 490 edificios OSM — la misma escena de la
captura original:

```
surface layer { layer: green, quality: detailed, wanted: 205, drawn: 205, dropped: 0, degraded: 144 }
```

205 de 205 dibujadas, ninguna perdida, 144 degradadas a su triangulación base. La captura confirma
verde continuo, sin agujeros a media mancha.

**Constancia honesta: no hay número "antes" medido.** Obtenerlo habría exigido revertir el cambio y
disparar una segunda consulta a Overpass sobre el mismo emplazamiento, y no se gastó esa pasada. La
prueba del comportamiento viejo es el test unitario (`osm-scene.test.ts`, `detailed surface budget`:
con el `break` a media lista, 150 polígonos devolvían menos de 150 y el resultado dependía del orden
de la lista), no una medición de campo.

Lectura de los 144 degradados: son features **presentes y correctas de contorno**, solo más planas
contra el relieve. Es el comportamiento buscado — el presupuesto ahora decide cuán fino se dibuja el
suelo, no cuánto suelo existe.

## Frente 3 — la red peatonal, separada de la de coche

### El cambio

`FeatureStyle` gana `roadClass: 'vehicular' | 'pedestrian' | 'track'`, resuelto en `osm-features.ts`
desde el valor de `highway`. `track` es una respuesta propia y no un sinónimo de ninguna de las otras
dos: lleva vehículos, así que llamarlo camino peatonal es falso, pero son tres metros de grava, así
que meterlo en la red de calzadas reintroduce exactamente el nodo que no debe crear.

`buildLinearLayer` deja de tener una lista de `networkWays` y pasa a tener una **por clase**, cada
una resuelta con su propia llamada a `buildRoadNetwork`. Dos grafos que se solapan en planta y no
comparten topología alguna, que es el modelo honesto: las vías peatonales tocan las calles
constantemente y casi nunca **se funden** con ellas.

Cada clase trae además lo suyo:
- **rugosidad** propia (`ROAD_CLASS_ROUGHNESS`: 0.22 asfalto / 0.5 pavimento / 0.78 grava), que viaja
  como bandas de vértices sobre el atributo `aRough` que las capas de suelo ya usaban. `metricAttributes`
  gana un parámetro `bands` opcional; el resto de la capa conserva su valor único;
- **bordillo** propio (`ROAD_CLASS_KERB_M`: 0.16 m / 0.05 m / 0.03 m). Bajar una acera 16 cm como si
  fuera una calzada abría una zanja a través de cada parque;
- **sin pintura**: línea central y carriles quedan restringidos a `vehicular`, con independencia del
  ancho. Un ágora peatonal de 7 m supera el umbral de ancho y sigue sin llevar línea central, porque
  el umbral trata de calzadas.

El tono ya estaba diferenciado por clase (`ROAD_TONES`, `osm-features.ts`) — ese punto del informe
original se confirma y no se ha tocado.

### El caso concreto, reproducido en test

`osm-scene.test.ts`, `pedestrian ways are not carriageways`: una trunk de 12 m este-oeste y un
footway de 1,6 m que muere en su vértice central. La aserción es una identidad:

```
verts(trunk + footway) === verts(trunk) + verts(footway)
```

Es decir: meterlos en la misma capa da exactamente la suma de los dos por separado. Cualquier
recorte, cualquier losa de cruce, y deja de cumplirse. Con un solo grafo no se cumplía: el footway
partía la trunk, el nodo salía de grado 3 con dos brazos casi antiparalelos, y el solver recortaba
hasta 30 m de avenida (`MAX_TRIM_WIDTHS × semiancho`) sustituyéndola por asfalto de cruce.

Un segundo test comprueba que **no se ha perdido lo que el solver sí debe hacer**: una vía de
servicio de 6 m contra la misma trunk sigue siendo un cruce de verdad y sigue recortándose.

### El desajuste en curva — arreglado también

Sí se pudo hacer sin complicar lo anterior; son cambios independientes.

`buildRoadNetwork` pasa a tener tres fases en vez de dos: el nodo se **resuelve** (recortes, fillets),
después se construyen los ribbons, y **solo entonces** se cierra la superficie del nodo, en la nueva
`closeJunction()`. El polígono ya no se levanta sobre `at + dir × recorte` con `dir` medido en la
polilínea sin recortar: se lee de los bordes que el ribbon **realmente tiene**.

Con eso hay una sola respuesta a "dónde acaba esta calzada" y las dos superficies la usan. De regalo,
recoge el ensanche de anchura, porque `left`/`right` ya llevan el semiancho mezclado.

Tests en `road-network.test.ts`, `a junction approached on a curve`, con un brazo que sale del nodo
girando 8° cada 3 m contra una avenida de 12 m:
- el recorte pasa de largo de los primeros vértices y los dos rumbos difieren **5,3°** — el test
  comprueba > 3°, o sea que no es vacuo;
- ambas esquinas del extremo recortado son vértices del polígono del cruce;
- la esquina analítica que producía el código viejo queda a **más de 1,4 m** de la real: sobre una
  calzada de 10 m, un hueco y un solape perfectamente visibles;
- todo brazo recortado del nodo queda cerrado, y el polígono sigue siendo una cara, no una astilla
  plegada.

## Frente 4 — paleta de edificios por uso y región

Se siguió la recomendación del informe: **campos concretos en `FeatureStyle`, nunca tags crudas** a
través del worker. Sobre 2 490 edificios, clonar mapas de strings costaría mucho más que el enum
corto que viaja ahora.

- **`BuildingUse`** (`osm-features.ts`): `house | apartments | tower | temple | shrine | industrial |
  retail | civic | shed | generic`. No es una taxonomía de la clave `building` — son las categorías
  que cambian el aspecto. `buildingUse()` resuelve por precedencia: valor de `building` explícito,
  luego `amenity` (que es lo que responde por el habitualísimo `building=yes` +
  `amenity=place_of_worship`), y distingue **shrine sintoísta de temple budista por `religion`**,
  porque no se parecen en nada y OSM sí lleva la diferencia.
- **`roofTagged`**: sin él, "el mapeador dice plano" y "nadie ha dicho nada" son el mismo valor y no
  se puede inferir ningún tejado. Apenas un pequeño porcentaje de los edificios llevan `roof:shape`.
- **`buildingRegion(lat, lon)`** (`feature-variation.ts`): cajas, no fronteras, y **deliberadamente
  gruesa**. La alternativa honesta era embarcar un conjunto de polígonos de países para elegir un
  color de pintura; la deshonesta, seguir fingiendo que seis tonos europeos valen en todas partes,
  que es lo que hacía que un barrio de Kioto pareciera un extrarradio holandés. Fuera de las cajas
  devuelve `generic` y el comportamiento es **exactamente** el anterior.
- **Paleta** por especificidad: `región:uso` → `uso` → `región`. `east-asia:shrine` es madera, yeso
  blanco y el rojo profundo de un torii; `east-asia:house` es yeso pálido y hormigón;
  `mediterranean:house` es cal y ocre; `industrial`, `shed` y `tower` llevan su paleta esté donde
  esté, porque una nave de chapa es una nave de chapa. Colores tagueados (`building:colour`) siguen
  ganando.
- **Tejados inferidos**: `defaultRoofShape` da pirámide al templo de Asia Oriental, dos aguas a la
  casa, y **plano a todo lo urbano y a todo lo desconocido** — inventar pendientes por un centro
  urbano sería una mentira más ruidosa que una tapa plana. `defaultRoofFraction` le da al templo un
  0,45 de su altura, porque un tejado de templo no es una tapa: es la mayor parte de lo que se ve, y
  dibujarlo con la pendiente de una casa lo convierte en un cobertizo. Y hay colores de cubierta
  propios donde el lugar los implica: teja vidriada oscura en el templo, kawara gris azulado en la
  casa japonesa, terracota en la mediterránea.

### Modo "contexto discreto"

Implementado como **flag ortogonal**, tal como se propuso, no como cuarto nivel de detalle:
`ContextTone = 'natural' | 'neutral'` en `BuildingMeshOptions`, aplicado en el gancho de
`rebuildLayers` junto a `lit`/`detail`. "Cuánto de esto está modelado" y "cuánto se le permite
competir con el modelo" son dos preguntas independientes, y fundirlas en un control obligaría a
renunciar a las fachadas por plantas para conseguir una calle tranquila.

En `neutral`: paleta casi monocroma con varianza mínima, sin color de cubierta inferido, bandas de
forjado atenuadas y el ritmo de acristalamiento mezclado hacia un muro liso (`contrast = 0.25`) en
vez de apagado — así queda un indicio de ritmo y no una losa. **Un color tagueado también se ignora
aquí**: un contexto discreto que deja gritar a un edificio no es discreto.

Expuesto en `GeoSystemAPI.setContextTone()`, persistido en `geoStore` (`ifc-geo-context-tone:v1`),
aplicado al montar el panel junto a `contextDetail`, y con control propio en GeoPanel bajo el
selector de detalle. Claves i18n nuevas en los 10 locales (ES real, resto copia EN, según la
convención del namespace); el test de paridad pasa.

### Estado

`npx tsc --noEmit` limpio. **Suite completa en verde: 2 343 tests, 154 ficheros.** En `src/lib/geo`,
698 tests. No se ha tocado ningún fichero con cambios ajenos sin commitear.

---

## Hallazgo colateral, sin investigar — textura de drape negra en headless

En el entorno headless de verificación, la textura de drape del parche de terreno sale como un
`ImageBitmap` de 1536×1536 **enteramente negro** (media RGB 0,0,0, comprobado dibujándolo a un
canvas), mientras que la malla, la elevación de anclaje (114,3 m) y los colores de vértice del
relieve son correctos. Con el terreno apagado la escena queda igual de negra.

Se trata como artefacto del pane sin compositing, porque la captura real del usuario tiene suelo gris
claro. **Pendiente de confirmar en la máquina del usuario.** No investigado ni tocado.


---

# Addendum 3 — generación de verde: bosques, parques y grandes extensiones

## Verificación en vivo de los frentes 3 y 4 (una sola consulta a Overpass)

- **Red peatonal realmente separada**: el atributo `aRough` del mallado de viales tiene tres bandas
  exactas — 0.22 vehicular (16 548 muestras), 0.50 peatonal (19 749), 0.78 track (1 196). En el
  entorno del templo el peatonal es la **mayoría** de la geometría viaria, que es justo por lo que
  meterlo en el grafo de calzadas hacía tanto daño.
- **Cruces sanos**: triángulo máximo del mallado de viales = 27 m², cero triángulos > 500 m². No hay
  losas de cruce falsas.
- **Paleta regional activa**: Kioto cae en `east-asia`, fachadas en yeso / gris / hormigón. Los tonos
  de santuario y templo existen pero son el **0,1 % de los vértices**, porque en Kioto casi todo está
  tagueado `building=yes`. Resultado honesto y esperado: la palanca de uso solo puede mover lo que
  OSM se ha molestado en decir, y `building=yes` no dice nada. La palanca de **región** es la que
  hace el trabajo en este emplazamiento.
- **Contexto discreto**: saturación media de fachada 0,022 (natural) → 0,0052 (discreto), cero
  vértices cálidos. El templo es lo único con color en la escena.
- **Verde**: 205/205, 0 perdidas, 144 degradadas.

## Diagnóstico del nuevo frente

**El hueco señalado se confirma, literalmente.** `buildTreeLayer` filtraba
`f.kind === 'tree' && f.point` — solo nodos `natural=tree`. Un polígono `landuse=forest` o
`natural=wood` recibía una superficie verde y **nada de pie encima**. En Kioto: 205 polígonos de
verde contra 555 nodos de árbol, y las laderas del este eran moqueta.

**Y es la causa dominante, no el material.** `greenTone` ya distingue bosque de césped de viñedo de
cementerio; `greenRoughness` ya alimenta el shader de hierba con la aspereza correcta; el shader ya
hace mata y relieve. Nada de eso puede hacer que una alfombra parezca un bosque, porque lo que falta
en un bosque visto desde fuera **no es el color del suelo: son los árboles**. Por eso **no se ha
tocado el material** — punto 5 del encargo respondido en negativo, deliberadamente.

## Lo implementado

### Nuevo módulo puro: `src/lib/geo/tree-seeding.ts`

Rings de metros dentro, posiciones de árbol fuera. Sin THREE, sin materiales, sin escena. Tres reglas
declaradas en la cabecera del fichero:

1. **Determinista.** La semilla de cada árbol es `${idDelPolígono}@${celda}`, no un índice
   secuencial, así que el mismo sitio hace el mismo bosque árbol por árbol — la regla que
   `feature-variation` ya seguía y la razón de que una captura se pueda repetir mañana.
2. **Se adelgaza, nunca se trunca.** Cuando el presupuesto no da, **se ensancha el espaciado en todo
   el sitio** en vez de cortar la lista. Mismo principio que el presupuesto de superficie: un techo
   decide cuán denso es el mundo, jamás qué partes existen. Cortar la lista haría desaparecer entero
   el bosque que Overpass emitiera el último.
3. **El tag decide el patrón.** Un huerto va en filas y un bosque no.

**Muestreo**: rejilla jitterada (estratificada), no Poisson-disc. Poisson da mejores estadísticas de
espaciado y cuesta un índice espacial más un bucle de rechazo por punto; sobre un dosel donde cada
copa solapa con sus vecinas nadie nota la diferencia. Lo que importa visualmente es que el
desplazamiento destruya la retícula, y a ±0,42 de celda la destruye. **El huerto hace justo lo
contrario**: jitter del 8 % sobre una rejilla **rotada al eje propio de la parcela** (su arista más
larga), porque unas filas que cruzan en diagonal su propio lindero parecen una textura, no
agricultura.

**Clases de cobertura** (`GreenCover` en `osm-features.ts`, resuelto desde tags como `roadClass` y
`buildingUse` — cero tags crudas cruzando el worker):

| cobertura | espaciado | copa / altura | de dónde sale |
|---|---|---|---|
| `forest` | 9 m | 4,5 m / 14 m | `natural=wood`, `landuse=forest` |
| `shrub` | 5 m | 1,6 m / 2,2 m | `natural=scrub|heath` |
| `orchard` | 7 m, **en filas** | 2,6 m / 5 m | `landuse=orchard|vineyard` |
| `park` | 18 m | 5,0 m / 12 m | `leisure=park|garden|nature_reserve`, `village_green` |
| `bare` | — sin árboles | — | césped, pradera, campo de juego, cementerio, huertos urbanos |

`bare` es el valor por defecto, no `park`: inventar árboles sobre un campo de fútbol o el césped de
un cementerio es un error peor que dejar fino un parque de verdad, porque uno es una omisión
plausible y el otro es una afirmación falsa sobre el sitio.

El espaciado de `forest` es 9 m, no la densidad real de una masa forestal gestionada (cientos de
pies por hectárea, que ningún navegador va a dibujar). Es el espaciado al que **se tocan las copas**
del tamaño que OSM implica, que es lo que el ojo lee como dosel cerrado.

### Bosque que se lee como bosque (punto 2)

- **Dosel cerrado**: copas de 4,5 m de radio a 9 m de separación se tocan por definición.
- **Variación dentro de la masa**: altura ×0,72–1,28 y copa ×0,78–1,22 por árbol, más el tono de
  follaje que `foliageColor` ya daba por id. Un bosque de árboles idénticos es un tell tan grande
  como un bosque de ninguno.
- **Apoyados en el terreno real**: cada árbol muestrea `frame.groundZ` en **su** posición, así que
  una masa en ladera está en la ladera. Hay test.
- **LOD: no se ha añadido, y es a propósito.** El coste aquí no son los draw calls (siguen siendo 2)
  sino el trabajo de vértices, y un segundo nivel de geometría significaría un segundo par de
  `InstancedMesh` — o sea duplicar los draw calls para ahorrar triángulos, que es el intercambio
  equivocado en este renderer. La palanca de coste es el **adelgazado por distancia al modelo**, que
  sí está puesto.

### Borde de las masas (punto 3)

Dos tratamientos, ambos geométricos, ninguno toca shaders ni alpha:

- **`edge` por árbol** (0 dentro, 1 en el lindero): en bosque los árboles del borde se encogen un
  35 %. Los árboles crecidos al aire libre **son** más bajos y redondos, y todo lindero forestal real
  lo enseña; de paso impide que el borde sea una fila de fustes idénticos.
- **`seedFringe`** — una banda de vegetación baja recorrida **a lo largo** del lindero y empujada a
  ambos lados de él, de forma que parte **sobresale**. El problema era que un parque acaba en una
  arista recta contra la calle, y esa línea es tan mala señal como cualquier uniformidad de color; la
  respuesta no es difuminar el polígono sino **poner algo de pie a caballo de la línea**. Sale gratis
  en draw calls porque monta en las mismas `InstancedMesh`. Un `bare` no lleva orla: un campo de
  juego sí acaba en su valla.

### Grandes extensiones (punto 4)

El reparto de presupuesto de superficie que hice en la fase anterior era proporcional **solo al
área**. Ahora pondera además por **distancia al modelo** (`focusN`, la colocación del modelo en
coordenadas normalizadas), con caída suave y suelo en 0,3 para que no aparezca una costura de
resolución cruzando una ladera continua.

**No es la cámara, y es una decisión, no un atajo.** Un presupuesto que dependiera de dónde está la
cámara obligaría a reconstruir el suelo en cada órbita, y una reconstrucción por movimiento de cámara
es lo único que esta arquitectura se niega a hacer. El modelo no se mueve, está en el centro de la
caja de consulta, y toda vista es de él. La misma ponderación gobierna el presupuesto de árboles.

Sin `focusN` el reparto vuelve a ser exactamente el de antes — hay test de las dos ramas.

### Presupuesto, corregido sobre la marcha

Al medir apareció un fallo real en mi propio diseño: `allocateDensity` tenía un **suelo de densidad
de 0,08** pensado como amabilidad, y en un sitio de cuarenta bosques grandes ese suelo elevaba a cada
región por encima de su parte, el total desbordaba el techo, y el tope duro **truncaba los últimos
bosques de la lista**. Es exactamente el fallo que todo el diseño existe para evitar, colándose por
la guarda que pretendía ser generosa. Suelo eliminado; los polígonos demasiado pequeños ya se
rechazan por área, que es el sitio correcto.

Segundo fallo de la misma familia: la orla no entraba en el conteo natural, así que el presupuesto
ignoraba la mitad de su propio gasto. Ahora `naturalTotalFor` cobra **interior más perímetro**, y la
orla se adelgaza al mismo ritmo que el interior. Es tentador dejar que el margen mantenga densidad
cuando el centro cede — es la parte que el espectador tiene más cerca — pero el precio de eso es una
orla cuyo tamaño el presupuesto no puede predecir, y un presupuesto que no predice su gasto trunca en
vez de adelgazar. **Predecible gana a favorecedor.**

## Presupuesto de rendimiento — medido

Instancias y draw calls, medidos sobre el builder real:

| escena | instancias | draw calls |
|---|---|---|
| **antes** (solo nodos mapeados, Kioto) | ~1 500 | **2** |
| un parque de 220 m | 235 | **2** |
| un bosque de 220 m | 779 | **2** |
| sitio con forma de Kioto (205 polígonos: 190 pequeños + 15 laderas) | **7 115** | **2** |
| estrés: 40 bosques de 600 m | **7 893** | **2** |

**Los draw calls no se mueven: 2, en todos los casos.** Es la propiedad que había que conservar y se
conserva por construcción — árboles mapeados y sembrados comparten las mismas `InstancedMesh` por
especie, así que el número de llamadas depende de cuántas **especies** hay, nunca de cuántos árboles.
Hay un test que lo fija: un bosque de 60 m y uno de 400 m producen el mismo número de meshes.

**Lo que sí sube es el trabajo de vértices: de ~1 500 a ~7 100 instancias, unas 5×.** Ese es el coste
real del cambio y conviene decirlo sin adornos. Los topes: `MAX_TREES = 4000` (mapeados, sin tocar) y
`MAX_SEEDED_TREES = 8000` (sembrados). El estrés de 40 bosques de 600 m se queda en 7 893 — el tope
duro no llega a activarse porque el adelgazado actúa antes, que es lo que se buscaba.

**`MAX_SEEDED_TREES` es la palanca si 5× resulta demasiado en la máquina del usuario.** Bajarlo
adelgaza el sitio entero de forma uniforme, sin que desaparezca ninguna masa. No se ha medido FPS —
eso necesita la pasada visual.

### Un árbol no crece a través del modelo

Un polígono de parque **sobrevive** a la supresión de contexto a propósito: una torre no reemplaza el
parque en el que está. Sin una guarda, un bosque sembrado desde ese polígono subiría atravesando el
modelo — el mismo artefacto que la supresión existe para evitar, llegando por una ruta nueva. Se
añade `excludeAt`, derivado en `geo-system` de la **misma** huella que usa el supresor de features
(nueva `modelFootprintPolygon()`, compartida, para que las dos no puedan discrepar), con el doble de
margen porque un árbol es un punto con copa. Los nodos mapeados no se tocan: de esos ya decidió la
supresión.

## Opacidad del verde en `simple`

Hecha. `0.45 → 0.92`, alineada con la corrección que las carreteras ya llevaban. El agua sigue
translúcida (0,72), porque un río sí enseña lo que tiene debajo. Un pelo por debajo de 1 evita que la
costura con las teselas lea como un recorte.

## Estado y verificación pendiente

`npx tsc --noEmit` limpio. **854 tests en verde** en `src/lib/geo` + `src/locales` + `src/stores`;
`src/lib/geo` pasa de 698 a **729**, con 21 tests nuevos en `tree-seeding.test.ts` y el resto
repartidos entre `osm-scene.test.ts` y `osm-features.test.ts`.

**Verificación visual pendiente**, y esta vez importa más que de costumbre: el sembrado cambia el
aspecto de la escena por completo y las cifras de arriba son de instancias, no de fotogramas. Vale la
pena mirar en Kioto (1) que las laderas del este dejen de ser moqueta, (2) que la orla rompa el borde
recto de los parques sin parecer una valla, y (3) el coste real en FPS con 7 000 instancias.

**Nota ajena**: `scripts/seo/__titlecheck.test.ts` (sin trackear, junto a un
`scripts/seo/generate-fix-pages.ts` modificado) falla por timeout de 5 s en la suite completa. No es
de este trabajo y no se ha tocado.
