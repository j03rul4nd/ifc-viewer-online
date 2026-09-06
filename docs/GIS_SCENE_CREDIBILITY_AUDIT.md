# Auditoría — credibilidad geométrica y visual de la escena GIS

Fecha: 2026-09-05. Rama: `feat/urban-3d-vertical-infrastructure`.
Escena de referencia: Hotel Vela / Port Vell.

Estado de partida verificado: `npx vitest run src/lib/geo` → **36 ficheros, 1077 tests, todos
verdes**. Ninguno de los síntomas de las capturas está cubierto por un test que falle. Eso es en sí
mismo el primer dato: los defectos NO están en la lógica probada, están en el ensamblado, en los
datums que unen módulos, y en propiedades de render que ningún test puro observa.

---

## 0. La corrección al encuadre de la petición

La petición asumía que "el pipeline GIS→3D pierde la altura". **No es eso.** `vertical.ts` implementa
una jerarquía de resolución vertical completa y honesta (surveyed → inferred → tagged → assumed),
con envelope de Lipschitz para el perfil longitudinal, clearances por tipo funcional, y un rechazo
explícito y razonado del `layer × 5 m` ingenuo. `vertical-network.ts` (1174 líneas) lo resuelve por
red. `osm-scene.ts` ya emite tableros con espesor, pilas (`buildPierLayer`) y faldón de muelle.

Es decir: **el modelo de alturas que pedías construir ya existe y es mejor que el que yo habría
propuesto de cero.** Proponer "un modelo de cotas coherente" habría sido reescribir lo que ya está.
Los síntomas vienen de otra parte, y agruparlos por causa raíz da cuatro causas, no once síntomas.

---

## 1. Diagnóstico priorizado por causa raíz

### C1 — El agua es translúcida sobre el ráster del basemap (opacity 0.72)

`osm-scene.ts:337` — `opacity: layer === 'water' ? 0.72 : 0.92`, con el comentario que lo declara
deliberado: dejar que la imagen del tile "tiña" la lámina.

El basemap de Port Vell lleva **rotulado y trazado de viales impresos en el ráster**. Con la lámina
al 72 %, ese 28 % restante es literalmente lo que ves flotando sobre el agua.

Explica los síntomas: A1 (líneas de vial y etiqueta "Rambla de Mar" dibujadas sobre el vano),
A4 (agua opaca sin transición — no es opaca, es traslúcida sobre una foto).

Esto es importante: **no hay nada que "recortar" ni ninguna máscara que construir.** No estamos
dibujando viales sobre el agua. Estamos dejando ver una fotografía por debajo. El punto 4 de la
petición ("máscaras y recorte") ataca un problema que no existe.

### C2 — Agua y estructuras portuarias usan DOS datums distintos

- Agua: `waterLevelM()` (`osm-scene.ts:348`) = **el terreno más bajo bajo su propio contorno**, o sea
  el DEM.
- Muelles/pantalanes: `frame.zAboveDatum('sea', 0, 0, deckM)` — el datum de mar.

Los dos sólo coinciden si el DEM bajo el agua lee exactamente el nivel del mar. En Port Vell no lo
hace: el propio comentario de `buildPierLayer` documenta que el ráster lee **+8,5 m sobre muelle
plano y +4,7 m sobre agua abierta**, porque es un modelo de superficie con barcos y cubiertas
dentro. El faldón del muelle es `PIER_DECK_M + QUAY_FACE_M = 3,0 m` fijos, calculado bajo el
supuesto "un metro basta porque debajo no se ve". Con la lámina caída respecto al datum de mar, ese
supuesto se rompe y **el canto queda al aire**.

Explica: A3 (muelle flotando con canto suspendido), A2 (masas de tierra como bloques flotando sobre
el plano de agua), A4 (falta de transición agua-orilla).

Nota sobre honestidad de datos: la solución correcta **no** es bajar el faldón hasta que tape. Es
hacer que las dos capas compartan datum. Estirar el faldón es fabricar geometría para esconder una
incoherencia, exactamente lo que la restricción prohíbe.

### C3 — Ninguna malla de contexto participa en el sistema de sombras

`grep -c castShadow src/lib/geo/` → **0**, sobre 32 000 líneas.

Ninguna malla GIS proyecta ni recibe sombras. Y aunque se activaran, no funcionaría: la cámara de
sombras (`viewer.ts:815-816`) es `left/right/top/bottom = ±50`, `far = 200` — dimensionada para un
edificio aislado, no para un distrito de varios cientos de metros. `solar-system.ts` es el único
sitio que activa `castShadow`, y sólo recorre las mallas del modelo BIM.

Explica: B8 (sombras sin relación con la copa ni con la dirección de la luz — **no son sombras**),
B11 (sin sombra de contacto en la base de los objetos, luz incoherente entre suelo y fachadas).

Sobre las "manchas verdes planas": no existe ningún decal de sombra falsa en el código
(`tree-seeding.ts` y `props-scene.ts` no dibujan ninguno). La hipótesis principal es que son
polígonos `green` reales de OSM (alcorques / parterres) renderizados a `opacity: 0.92`, que
coinciden con la base de cada árbol porque el sembrador los usa como región de siembra. Verificable
apagando la capa `green` desde `geoStore.setFeatureLayer`: si las manchas desaparecen, es eso.

### C4 — AO y postproceso existen pero están fuera del preset por defecto

SSAO y detección de bordes existen (`viewer.ts:442`, `uiStore.ts:12`) pero cuelgan del preset
`quality` / del skin de cliente (`ClientPresentationLayout.tsx:10`). La escena fotografiada casi con
seguridad corría en el preset estándar.

Explica: B11 (falta de AO), y agrava B9/B10 al no haber ningún término de oclusión que dé volumen a
extrusiones planas.

### Sin causa raíz confirmada (requieren instrumentación antes de tocar nada)

- A5, A6 (túneles a nivel de superficie, viales sin pendiente, cruces coplanares): el solver los
  resuelve y sus tests pasan. Falta saber **si el solver se está ejecutando en la ruta que se
  fotografió**. `solveSceneVertical` se invoca desde `osm-scene`, pero `surfaceQuality()`
  (`geo-system.ts:763`) bifurca por `contextDetail`, y la ruta `simple` usa `MeshBasicMaterial` sin
  iluminación. Antes de proponer un cambio hay que registrar qué `contextDetail` estaba activo.
- A1, parte del puente (tablero sin conectar, pilotes que no tocan): `vertical-mesh.test.ts` cubre
  exactamente este caso ("con el terreno apagado el DEM no pedía subdivisión y el puente salía como
  un único quad") y pasa. Sospecha: la Rambla de Mar es `man_made=pier` + `surface=wood` — el propio
  código la nombra en `DECK_SURFACE_COLORS` — o sea que la construye `buildPierLayer` (capa de
  muelles, sin estribos ni rampas) y **no** la ruta de puentes de `buildLinearLayer`. Se confirma en
  un minuto inspeccionando el fixture.
- B7, B9, B10 (árboles low-poly, coches caja, z-fighting en fachada): son calidad de asset, no hay
  causa raíz oculta. `tree-geometry.ts` usa `IcosahedronGeometry(1, 1)` — subdivisión 1, de ahí el
  facetado. El tronco en trípode descentrado es un bug real de anclaje: `TREE_PROPORTIONS` tiene
  `baseAnchored: false` para `broadleaf`, y en la captura los descentrados son justamente de copa
  ancha.

---

## 2. Por dónde empezar: eje B, con una condición

**Recomendación: eje B (assets y shading), y dentro de él C3 antes que nada.**

El argumento, distinto del que se daría sin leer el código:

C3 no es "pulir materiales". Es que **la mitad del modelo de iluminación no está conectada**. Un
`castShadow = true` en las mallas GIS más redimensionar la cámara de sombras cambia todas las
capturas a la vez: da sombra de contacto en la base de cada árbol, cada coche y cada edificio de
contexto, y hace que el edificio BIM proyecte sobre el paseo — que es exactamente la jerarquía
visual pedida en el punto 6. Es la intervención con mayor relación mejora/esfuerzo de toda la lista,
y es reversible con un flag.

C1 es la segunda: es un cambio de una constante y elimina el síntoma que más delata la escena
(texto de mapa flotando sobre el agua).

El eje A queda para la fase 3 por dos razones: el motor ya existe y funciona, así que el trabajo es
de instrumentación y conexión, no de construcción; y toca `vertical-network.ts` + `road-network.ts`,
donde vive el riesgo de regresión sobre 1077 tests verdes.

**La condición que invierte esto:** si la demo enseña vista aérea del conjunto, el muelle flotando y
el puente sin apoyos son lo primero que salta, y entonces C2 sube a primera posición. C2 es además
la única causa raíz cuyo arreglo es genuinamente arquitectónico (unificar datums) y no cosmético.

---

## 3. Plan por fases

### Fase 1 — Iluminación coherente y agua honesta ✅ IMPLEMENTADA
C3 + C1. Sin cambios en geometría ni en el solver.

Entregado:
- `shadow-policy.ts` + `.test.ts` (nuevo, puro): rol de sombra por `FeatureKind` y dimensionado del
  frustum. Los volúmenes en pie proyectan y reciben; el suelo drapeado sólo recibe (proyectar sobre
  sí mismo es acné de sombra a escala de distrito, irreparable con bias); el agua queda fuera
  mientras siga siendo transparente.
- `geo-system.ts`: aplicación de la política en `addLayer` — el único punto de ensamblado, para no
  dar a cada builder una opinión privada sobre iluminación; `fitShadowCamera()` mide los bounds
  reales de `geoRoot` (no la caja Overpass: las capas se suprimen y los presupuestos truncan) y
  avisa por log cuando el texel es demasiado grosero, en vez de servir un borrón en silencio; el
  frustum entra en `EnvSnapshot` y se restaura al salir de map mode.
- `osm-scene.ts`: agua opaca con `depthWrite`, y `WATER_COLOR` levantado a `0x3f6f8f` porque el
  valor anterior contaba con que el tile aportara un cuarto del aclarado.
- Tests: 1089 verdes (1077 previos + 12 nuevos), `tsc --noEmit` limpio.

**Pendiente de la pasada visual.** El color del agua y la densidad de las sombras son juicios que
ningún test resuelve. Overpass se satura con 3-5 consultas seguidas, así que la verificación es UNA
pasada planificada, no iteración.

### Fase 2 — Unificar el datum agua/mar ✅ IMPLEMENTADA

`waterLevelM()` ahora distingue mar de agua interior. El mar se nivela en `frame.seaLevelM` — el
mismo datum del que `buildPierLayer` mide siempre las cubiertas — y el agua interior sigue leyendo
el DEM, porque un río sí está a una cota local que sólo conoce el terreno; fijar un lago al nivel
del mar sería el mismo error al revés.

La distinción viaja explícita en `OsmFeature.isSea`, puesta donde se construye el mar desde la
línea de costa, **no inferida del id** `sea-N`: un marcador implícito en una cadena de texto es
exactamente el tipo de acoplamiento que se rompe en silencio.

Sobre la restricción de honestidad: esto no fabrica ninguna cota. `seaLevelM` ya existía en
`GroundFrame` con su propio valor por defecto documentado, y el cambio consiste en **dejar de
preferir una medición mala** (el ráster sobre un puerto, que mide barcos amarrados) a una
definición. No se estira ningún faldón para tapar nada.

Tests: `1091` verdes. Los dos nuevos se verificaron fallando sin el arreglo.

### Fase 3 — Instrumentación del eje A ✅ IMPLEMENTADA

Dos módulos puros nuevos, sin tocar el solver:

- **`vertical-audit.ts`** — censo por calidad de evidencia. Marca una vía sólo cuando la suposición
  es *portante*: a nivel de suelo un `assumed` no cuesta nada, porque la vía está donde estaría de
  todos modos. Hundirse cuenta igual que elevarse — un túnel excavado a profundidad por defecto
  puede acabar dentro de un sótano igual que un viaducto adivinado puede atravesar un edificio. El
  `assumedShare` se mide contra la escena entera, no contra el subconjunto ya marcado: un
  denominador de "lo que ya decidí que era interesante" es cómo una métrica se halaga sola.
- **`vertical-overlay.ts`** — el censo, dibujado. Polilíneas a la cota resuelta, coloreadas por
  confianza (verde→rojo, la única escala semáforo justificada aquí: el eje va literalmente de bien
  a mal). Se dibuja **desde los perfiles resueltos**, no tiñendo las mallas reales — teñir daría a
  cada builder una rama de depuración, y una auditoría que lee la geometría no puede enseñarte el
  puente que la geometría descartó. Una etapa más arriba sí puede.

Alcanzable desde el mismo handle que el censo textual:

```
__geoVertical.audit()         // qué cotas son adivinadas, peor primero
__geoVertical.overlay(true)   // y dónde están
```

Esto cierra la otra mitad de la restricción de honestidad. El pipeline ya se negaba a blanquear un
valor por defecto como si fuera medido; **pero una holgura por defecto que nadie puede ver es un
dato inventado a todos los efectos**, porque nada aguas abajo — ni nadie mirando una captura —
puede distinguirla de un levantamiento. Ahora se distingue.

Tests: `1114` verdes.

**Pendiente:** el overlay es dev-only. Sacarlo a un toggle en `GeoPanel` es una decisión de producto
(¿el cliente debe ver qué partes del contexto son inciertas?) y no la tomo yo.

### Fase 4 — Calidad de asset ◐ PARCIAL

Dos defectos resultaron ser **bugs de corrección**, no de estilo, y se arreglaron. El resto es
juicio visual y queda explícitamente pendiente de mirar la escena.

**Árboles (`tree-geometry.ts`).** La cabecera del módulo promete "unit-sized (radius 1, height 1)
con la base en z = 0", y el instanciado de `osm-scene` hace su aritmética dando eso por cierto.
Medido: **ninguna de las cuatro copas lo cumplía** — alturas de 0,52 a 3,0 y bases de −0,88 a −0,25.
Un chopo salía a **tres veces** su altura etiquetada y toda copa se sentaba a distancia equivocada
de su propio tronco.

Y dos estaban construidas directamente en el marco equivocado: `zUp` aplicado *después* de `put`
rota también la traslación, así que los pisos del abeto y la punta del chopo se apilaban en −Y en
vez de +Z — de lado, fuera de su tronco. Sobrevivió porque desde arriba un montón de verde sigue
pareciendo un montón de verde. **Ese es el síntoma B7 que describiste como "troncos en trípode
descentrados respecto a la copa".**

Primeros tests que tiene el módulo, que es exactamente por qué esto sobrevivió. Dos de ellos medían
artefactos antes de medir el tronco (el bbox no está centrado en un prisma de lados impares; el
centroide de vértices está sesgado por el vértice de costura duplicado de `CylinderGeometry`) — los
dos leían ~0,1 de desviación en un tronco perfectamente centrado, y cualquiera habría mandado un
arreglo detrás de un error de medición.

**Z-fighting de fachada (`depth-range.ts`).** Causa raíz en map mode, no en el IFC: `geo-system`
bloquea el reajuste de planos del visor (`setSceneTuneLock`, porque el mapa llega al horizonte y el
visor insistía en acercar el far) y luego fijaba `near = 0,5` **una vez**, para cualquier distancia
entre un portal y 30 km de altura. La resolución de profundidad va como z²/near, así que ese near
gasta el búfer donde no hay nada: a 300 m resuelve ~1 cm, más que la separación entre un muro
cortina y su antepecho. Ahora se readapta por frame.

**Lo que esto NO arregla, y hay que decirlo:** caras exactamente coincidentes. A separación cero
ningún near plane resuelve nada; eso necesita `polygonOffset` o geometría deduplicada en el pipeline
del modelo. Se deja aparte a propósito — si el parpadeo sobrevive a este cambio, la causa era
coincidencia y no precisión, y eso es información.

**Colocación de la copa — tercer bug, encontrado renderizando.** Normalizar las copas a base en
z = 0 dejó huérfana la otra rama del instanciado: `baseAnchored: false` seguía colocando la copa por
su **centro** y escalándola a **media** altura, lo que contra una geometría que ahora sí empieza en
cero daba una copa a mitad de tamaño flotando media copa por encima de su tronco. Las dos mitades
eran coherentes consigo mismas, así que ningún test lo vio; fue evidente en el primer render.

El flag se sustituye por `crownDrop`: cuánto se hunde la copa por debajo del extremo del tronco,
como fracción de su propia altura. Es lo que el flag intentaba expresar — una copa real se traga la
punta de su tronco, y solo una piruleta se apoya en ella. La palmera mantiene 0, porque que las
hojas broten justo del ápice es la mitad de lo que hace que una palmera parezca una palmera. La
altura total no cambia: la copa crece hacia abajo lo mismo que se hunde. Ambas cosas, con test.

**Cerrado como "no es un bug":**

- *Facetado de copa.* Es una decisión deliberada y documentada: a escala de mapa un árbol **es** su
  silueta, y el módulo gasta el presupuesto ahí (lóbulos fusionados, pisos, frondas) en vez de en
  subdivisión. Con iluminación real las caras ya dan volumen. Subir la subdivisión multiplica el
  coste de raster por instancia sobre cientos de árboles a cambio de poco.
- *Color plano del follaje.* Solo ocurre en `contextDetail: 'simple'`, donde el material es
  `MeshBasicMaterial` — sin luz, a propósito, porque ese nivel existe para orientarse barato. En
  `detailed`/`showcase` las copas usan `createFoliageMaterial`, que sí se ilumina. La captura del
  síntoma era de `simple`.

**Coches.** Eran tres cajas apiladas de 1,57 m de alto — una furgoneta pequeña — con una losa oscura
única bajo todo el vehículo en lugar de ruedas, así que la carrocería parecía apoyada en el asfalto.
Reconstruidos con las tres proporciones que hacen que un coche se lea como un coche a esa distancia:
largo y BAJO, cabina retrasada y más estrecha que la carrocería, y ruedas en las esquinas con luz
por debajo. Medidas de un compacto real: 4,30 x 1,80 x 1,44. Sigue siendo una sola geometría
instanciada, o sea una draw call para todo el tráfico.

**Cristal "saturado" — no era el cristal.** Medido en la escena viva, el material del muro cortina
llega como `#6693aa`: el azul grisáceo apagado que declara el IFC, exactamente como lo autoriza el
modelo. No hay ningún fallo en el pipeline de color.

Lo que teñía la fachada era **IfcSpace**. Un espacio es el AIRE de una habitación: una caja maciza
que llena la planta de suelo a techo, una por habitación, y en un hotel son cientos apiladas detrás
de la fachada. Dibujadas al 12 % de verde (`viewer.ts`) son invisibles de una en una y, todas
juntas, un lavado de color sobre lo que haya detrás. El muro cortina se estaba viendo a través del
propio aire del edificio.

Ocultarlas por defecto es lo que hace cualquier visor BIM, y por este motivo. Quedan a un clic en la
lista de categorías.

Segunda mitad del arreglo, y es la trampa: el efecto reactivo de `Viewer.tsx` depende de la
IDENTIDAD del `Set` de ocultos, y ese set se construye antes de que empiece la carga — así que se
disparaba contra una escena vacía y nunca más, porque nada en él cambiaba. Con el default "no
ocultar nada" eso no costaba nada; en cuanto los espacios pasaron a estar ocultos por defecto
significaba que no lo estaban. Los filtros se reaplican ahora cuando ya hay geometría.

Tests: `3010` verdes en todo el repo.

### Nota de método — verificar sin Overpass

Overpass estuvo limitándonos durante esta fase (el panel lo dice: "No se pudieron cargar los
edificios — el servicio estaba ocupado"). La verificación se hizo con un harness temporal en la raíz
(`scratch-trees.html` + `.ts`, servido por Vite, **borrado después**) que renderiza la geometría
REAL de `tree-geometry.ts` con luz y sombras. Encontró el bug en el primer intento. Es la técnica ya
registrada en `project_showcase_props_pipeline.md`, y conviene tenerla como vía por defecto para
cualquier juicio visual de assets: es más rápida que la app y no depende de un servicio público.

---

## 4. Fase 1 — detalle técnico

### 4.1 Conectar el contexto a las sombras

Las mallas GIS se crean en `osm-scene.ts` (`osm-piers`, capas de superficie, lineales, props). El
punto de conexión correcto es donde se ensambla el grupo, en `geo-system.ts`, no en cada builder:
mantiene la pureza de los módulos y deja un solo sitio que revertir.

- Recorrer el grupo GIS al montarlo y activar `castShadow`/`receiveShadow` por tipo de capa:
  edificios de contexto, piers, árboles y props **proyectan**; las superficies de suelo (green,
  sand, rock, water) **sólo reciben**. Un plano de suelo que proyecta sombras sobre sí mismo es
  acné de sombra garantizado.
- El agua no debe recibir sombra mientras siga siendo `transparent` — Three no lo resuelve bien y
  el resultado es peor que no tenerla.

### 4.2 Redimensionar la cámara de sombras

`viewer.ts:815-817` está fijado a ±50 / far 200. Debe derivarse del radio real de la escena GIS,
que `geo-system` ya conoce (la caja de consulta Overpass). Con ±700 y `mapSize` 2048 la resolución
efectiva cae a ~0,7 m/texel, aceptable para contexto urbano pero **no** para la sombra de contacto
del edificio BIM. Dos opciones, recomendada la primera:

1. **Cascada de dos luces**: la direccional actual, estrecha y de alta resolución, sigue sirviendo
   al modelo BIM; una segunda direccional con el mismo vector de sol y frustum ancho cubre el
   contexto. Cuesta una pasada de sombra más, aceptable en gama media.
2. Una sola cámara ancha, y aceptar que el BIM pierde definición de sombra. Más barato, peor
   justamente en el objeto protagonista.

**CORRECCIÓN a la primera versión de esta auditoría.** Se afirmó aquí que la direccional de
`viewer.ts` tenía su `position.set(40, 60, 30)` hardcodeada sin relación con el `sun` de los
shaders, y que unificarlas era el arreglo de B9. **Es falso.** `geo-system.ts:1209 aimKeyLight()`
ya reorienta la luz del visor hacia el sol del relieve cada vez que se reconstruye el cielo, y cede
explícitamente ante Sun Study. Su docstring nombra el bug que evita ("visiblemente DOS soles"). Ese
`position.set` es sólo el valor inicial antes de que map mode tome el control.

O sea: el sol ya estaba unificado. Lo que faltaba de C3 no era la dirección de la luz, era que
**nadie proyectaba** y que el frustum era de tamaño de maqueta. La incoherencia B9 que se observa en
las capturas es consecuencia de la ausencia de sombras, no de dos vectores distintos.

### 4.3 Agua

Cambiar `opacity` de 0.72 a 1.0 para la capa `water` y dejar `depthWrite: true`. El basemap deja de
verse a través, y con él la etiqueta y los viales impresos. Se pierde el tintado deliberado: hay que
compensar el color, porque `WATER_COLOR = 0x2c5a7a` fue elegido para verse mezclado con el tile, no
solo.

Verificable sin píxeles: un test que afirme que el material de la capa `water` no es transparente
sobre el fixture de Port Vell, y `portvell-benchmark.test.ts` como red de seguridad.

### 4.4 Orden de verificación

1. `npx vitest run src/lib/geo` verde antes y después de cada paso.
2. Captura de la misma cámara antes/después (el pipeline de props documenta cómo sacar píxeles de
   la app real — ver memoria `project_showcase_props_pipeline.md`).
3. Cada paso en su propio commit, revertible por separado.
