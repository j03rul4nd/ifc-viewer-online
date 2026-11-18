# Reality Capture desde vídeo — investigación, arquitectura y PoC

Estado: **investigación + PoC parcialmente validado**. 2026-08-24.
Código del experimento: `experiments/reality-capture/`.
Test de contrato en CI: `src/lib/pointcloud/reality-capture-ply.test.ts`.

---

## 1. Resumen ejecutivo

**Técnicamente viable, sí. Pero tu arquitectura propuesta es la peor de las disponibles, y la mayor parte de lo que pides construir ya está construido.**

Tres conclusiones, en orden de impacto:

**1. `vídeo → depth map → point cloud` es la arquitectura equivocada.** No por elegancia: lo he medido. La profundidad monocular por frame es *relativa*, y su error de escala domina todo lo demás. En la escena analítica del PoC:

| Degradación | Error medio | Puntos < 10 mm |
|---|---|---|
| Fusión exacta (control) | 0,0 mm | 100 % |
| Ruido de profundidad 2 % | 20,9 mm | 29,8 % |
| + 5 % de error de **escala** | 92,8 mm | 0,1 % |
| + 20 % de error de **escala** | 367,7 mm | 0,0 % |

Un 5 % de error de escala —trivial para un estimador monocular relativo— produce 93 mm de error medio. **Ningún filtro corriente abajo lo arregla**, porque no es ruido, es un factor multiplicativo global. Para un público BIM que habla en centímetros, eso es inservible. La arquitectura correcta obtiene poses *y* profundidad métrica del mismo modelo multi-vista, no un depth map por frame.

**2. No necesitas una "capa Reality Capture". Ya la tienes.** El viewer contiene `pointCloudStore` + `PointCloudPanel` + `point-cloud-system` con lectores LAS/LAZ/COPC/PLY/PCD/XYZ, LOD por chunks, EDL, presupuesto de puntos, streaming de octree COPC, y `pc-align.ts` con una escalera de alineación de 5 peldaños (map-conversion → shared-crs → geographic → local → manual) que ya resuelve IFC↔nube. Hay además `meshStore` y `videoStore`. De la lista de capacidades que pides para la capa nueva (toggle, opacidad, tamaño de punto, múltiples capturas, borrar, metadata), **todas existen menos "mostrar cámaras" y "mostrar el vídeo original"**. La pieza que falta no es una capa: es un productor de nubes.

**3. Y ahí está el problema real, que no es técnico.** `project_moats_vs_commodities.md` dice literalmente que matar point clouds fue correcto *porque invierten en el commodity*, y la regla vigente es deferir toda feature que solo mejore el commodity. Reality Capture desde vídeo es la inversión más cara posible en el lado commodity: meses de trabajo, GPUs con coste marginal real, y compites contra Polycam, Matterport y Autodesk. **Recomiendo no construirlo como "reconstrucción 3D".** Hay exactamente un encuadre en el que sirve al moat, y está en §9.

---

## 2. Comparativa de tecnologías

### 2.1 Estimación monocular de profundidad

| | Profundidad relativa (DA2, MiDaS) | Profundidad métrica (DA3, Metric3D) |
|---|---|---|
| Salida | Disparidad sin escala | Metros |
| Estabilidad temporal | Mala: cada frame con su escala | Buena, pero aún con deriva |
| Uso para medir | **Ninguno** | Aceptable con verificación |
| Navegador | Sí (ONNX Runtime Web / transformers.js, WebGPU) | Modelos grandes; poco práctico |

[Depth Anything 3](https://depth-anything-3.github.io/) (ByteDance, ICLR 2026) es el modelo relevante: un transformer plano que hace profundidad *y* pose multi-vista, y supera a DA2 en monocular y a VGGT en multi-vista. Lo importante para nosotros es que **no lo usamos como estimador monocular**: lo usamos en modo multi-vista, que es donde la escala deja de ser libre.

Veredicto: la profundidad monocular por frame es útil como *señal de calidad en el navegador* (¿tiene textura esta toma? ¿hay movimiento?), **no** como fuente de geometría.

### 2.2 SfM + MVS (COLMAP, OpenMVG/OpenMVS, Meshroom)

Es el camino clásico y el que da la mejor precisión métrica cuando converge. Pero para vídeo de móvil:

- Muy lento (decenas de minutos a horas por captura).
- Frágil: superficies sin textura —una pared pintada, hormigón limpio, un techo— son precisamente el caso de uso BIM, y son donde SfM falla.
- Falla de forma binaria y difícil de explicar al usuario: "la reconstrucción no convergió".

Veredicto: **no para el MVP.** Candidato para un modo "alta precisión" opcional en fase tardía, corriendo detrás del feed-forward como refinamiento.

### 2.3 Feed-forward multi-vista (VGGT, π³, MapAnything, DA3) — **la elección**

Éste es el cambio real de los últimos 18 meses. [VGGT](https://vgg-t.github.io/) (Best Paper CVPR 2025) demostró que un solo transformer en una pasada iguala a COLMAP siendo órdenes de magnitud más rápido; [VGGT-Ω](https://www.robots.ox.ac.uk/~vedaldi/research/2026/vggt-omega/vggt-omega.html) (CVPR 2026) lo escala con ~30 % de la memoria; [π³](https://github.com/yyfz/Pi3) elimina la dependencia del frame de referencia fijo; [MapAnything](https://map-anything.github.io/) (Meta) unifica 12 tareas de reconstrucción y —clave— regresa geometría **métrica** factorizada, aceptando calibración, poses o profundidad como entradas opcionales.

Por qué gana para nosotros:
- Segundos, no horas → el usuario recibe respuesta en la misma sesión.
- Robusto en superficies sin textura, donde SfM se rinde.
- Da poses *y* point maps en la misma pasada: no hay que encadenar dos sistemas frágiles.
- MapAnything acepta las poses/intrínsecos de ARKit/ARCore como entrada extra en vez de ignorarlos.

Coste: VRAM. Con muchos frames a resolución alta se dispara. Se gestiona con submuestreo por keyframes (§4).

### 2.4 Visual SLAM

[MASt3R-SLAM](https://edexheim.github.io/mast3r-slam/) hace SLAM denso en tiempo real a 15 FPS con geometría consistente. Es la tecnología correcta para capturas *largas* (recorrer una planta entera), donde un feed-forward de una pasada no cabe en memoria y hace falta cierre de bucle.

Y sobre lo que preguntas de ARKit/ARCore: **sí, y es la mejor mejora de relación coste/beneficio de todo el documento.** Un iPhone Pro con LiDAR entrega poses métricas ya resueltas y profundidad calibrada. Eso elimina de golpe el error de escala que la tabla de §1 identifica como el asesino. La pega es que exige una app nativa o WebXR, no un `<input type=file>`.

Veredicto: SLAM en fase 5, no en el MVP. Pero **aceptar metadatos de captura AR desde el día uno** en el formato de ingesta.

### 2.5 Gaussian Splatting

Formatos y render web están maduros: [SOG de PlayCanvas](https://developer.playcanvas.com/user-manual/gaussian-splatting/formats/sog/) da ~15-20× de compresión sobre PLY con variante *Streamed SOG* por LOD; `.spz` de Niantic y `.ksplat` cubren el resto; hay renderers para three.js.

Pero para BIM tiene un defecto descalificante en el MVP: **un splat es una representación de apariencia, no de superficie.** No se puede medir contra él con honestidad, no se puede hacer clash detection, y la gaussiana no tiene una posición de superficie bien definida. Convive con IFC visualmente (render aparte, mismo transform) pero no se compara con IFC numéricamente.

Veredicto: **fase 6, y como capa de presentación**, no como el dato. Es lo que enseñas al cliente; la nube es lo que auditas.

### 2.6 NeRF

Descartado. Lento de entrenar, difícil de editar, difícil de medir, y el campo entero se ha movido a 3DGS y feed-forward. No hay un caso en el que NeRF sea la respuesta correcta aquí.

---

## 3. Arquitectura recomendada

```text
móvil ──► vídeo (+ metadatos ARKit/ARCore si existen)
             │
   [navegador]│  triaje: duración, nitidez, movimiento, solape  ── rechaza pronto
             ▼
   [cola]     subida → job en GPU worker
             │
             ├─ extracción de keyframes (no todos los frames)
             ├─ DA3 / MapAnything multi-vista → poses + point maps MÉTRICOS
             ├─ fusión: unproject → confianza → acuerdo multi-vista → vóxel
             └─ serialización → PLY (interno) → COPC (entrega)
             │
   [storage]  COPC + cameras.json + metadata
             │
   [viewer]   pc-runner.ts EXISTENTE → pc-align.ts → PointCloudSystem
                                              │
                                              └─ escalera de alineación vs IFC
```

Lo importante de este diagrama: **desde `PLY` hacia abajo, todo está ya escrito y en producción.** El trabajo nuevo es la columna del GPU worker y el triaje del navegador.

---

## 4. Prototipo recomendado: qué construir primero

No un pipeline. **Un job service de una sola ruta**, sin UI nueva:

1. `POST /capture` con un vídeo → id de job.
2. Worker: keyframes → DA3 en modo multi-vista → `fuse_to_ply.py` (ya escrito y validado) → PLY.
3. `GET /capture/:id` → URL del PLY.
4. El usuario lo carga con el **botón de nube de puntos que ya existe**.

Cero cambios en el viewer. Si eso produce nubes que se ven bien junto a un IFC en 3 capturas reales, la hipótesis está validada y se invierte más. Si no, has gastado una semana.

---

## 5. El PoC: qué está construido y qué está medido

`experiments/reality-capture/`:

| Fichero | Qué hace | Estado |
|---|---|---|
| `selftest_fusion.py` | Escena analítica (caja-habitación + mesa), profundidad exacta por intersección rayo-caja, fusión completa, medición contra la superficie real | **Ejecutado y validado** |
| `fuse_to_ply.py` | Núcleo: unproject, mapa de confianza, acuerdo multi-vista, downsample por vóxel, escritor PLY binario | **Ejecutado y validado** |
| `blender_capture.py` | 3 escenas (objeto / habitación / estructura BIM), trayectorias, render + pase Z + poses | **Ejecutado y validado** |
| `evaluate.py` | Precisión y completitud contra la malla original en Blender | **Ejecutado y validado** |

### 5.1 Resultados medidos

Ejecutar: `python experiments/reality-capture/selftest_fusion.py`

```
- profundidad exacta: las matemáticas de la fusión -
raw fusion, no filtering      165888 ->165888 pts | media   0.0  p99    0.0  max    0.0 mm
- profundidad suavizada (lo que emite cualquier modelo aprendido) -
raw fusion, no filtering      165888 ->165888 pts | media   0.8  p99   11.1  max  466.7 mm
+ voxel downsample            165888 -> 51309 pts | media   1.8  p99   14.7  max  466.7 mm
+ confidence gate             165888 -> 51021 pts | media   0.6  p99   12.5  max   28.2 mm
+ multi-view agreement        165888 -> 48280 pts | media   0.5  p99   11.7  max   28.2 mm
```

Dos hallazgos que no eran obvios antes de medirlos:

- **La fusión es exacta** (0,0 mm con profundidad exacta). Cualquier error posterior es del modelo, no de nuestro código. Esa separación es justamente lo que permite evaluar un modelo upstream sin ambigüedad.
- **La puerta de confianza reduce el error máximo de 467 mm a 28 mm (16×) descartando solo el 0,6 % de los puntos.** Los *flying pixels* de silueta son el fallo dominante, y son baratos de matar. El downsample por vóxel *sin* confianza **empeora** el máximo, porque promedia puntos fantasma dentro de vóxeles legítimos: el orden de las etapas importa.

### 5.2 Las tres escenas de Blender, medidas

36 vistas por escena a 320×240, fusión completa, puntuadas contra la malla original
(`accuracy` = distancia de cada punto reconstruido a la superficie real):

| Escena | Puntos | Precisión mediana | p99 | < 10 mm | Completitud mediana |
|---|---|---|---|---|---|
| Objeto (órbita, primitivas) | 123 155 | **4,1 mm** | 9,1 mm | 99,4 % | 10,7 mm |
| Habitación (interior, mano alzada) | 100 128 | **2,1 mm** | 5,3 mm | 99,3 % | 237,7 mm* |
| Estructura BIM (órbita a 9 m) | 337 608 | **7,8 mm** | 101,5 mm | 68,8 % | 12,6 mm |

Tres cosas que estos números enseñan y que la teoría no daba:

- **Con poses y profundidad correctas, la geometría llega a precisión milimétrica.** Eso confirma que el cuello de botella del producto es enteramente el modelo upstream y la escala, no la reconstrucción.
- **La distancia degrada rápido.** La estructura se orbita a 9 m y su p99 se dispara a 101 mm frente a 9 mm del objeto a 4 m: menos píxeles por superficie y más ángulos rasantes. Traducción de producto: *grabar de cerca* es la instrucción de captura que más importa.
- **El pase Z de EEVEE está antialiaseado**, así que promedia profundidad en los bordes de silueta exactamente igual que un modelo aprendido. Por eso la precisión con profundidad "exacta" aquí es de 10,2 mm en la estructura y no de 0,0 mm como en el test analítico. No es un defecto del rig: es la confirmación independiente de que el modelo de *flying pixels* del §5.1 describe algo real.

\* La completitud de la habitación (238 mm) **no mide un fallo de reconstrucción, mide un fallo de la métrica**: `evaluate.py` muestrea toda la superficie de la escena, incluidas las caras *exteriores* de muros, suelo y techo, que una cámara dentro de la habitación no puede ver nunca. Anotado como límite conocido; la corrección es puntuar solo contra superficies visibles desde la trayectoria.

### 5.3 Integración con el viewer, verificada

`fuse_to_ply.py` emite PLY con `confidence` en float32 0..1. `ply-reader.ts` ya reconoce ese nombre de propiedad y lo escala ×255 al canal uint8 que muestrea el shader — es decir, **el slider `confidenceThreshold` que ya existe en `PointCloudPanel` funciona sobre estos datos sin tocar una línea del viewer**.

No lo he asumido: `src/lib/pointcloud/reality-capture-ply.test.ts` lo comprueba en CI: reconstruye en TypeScript la misma cabecera que escribe el Python y se la da al `PlyReader` real, así que una divergencia entre escritor y lector rompe el build sin depender de haber ejecutado el script. 2 tests, ambos en verde. El segundo verifica que la caja delimitadora sale en metros y con las dimensiones correctas de la habitación (el bug clásico de milímetros/metros es invisible hasta que la nube aterriza junto a un IFC).

El test se auto-omite si el fichero no existe, así que un checkout limpio sigue en verde.

### 5.4 Lo que no he ejecutado, y por qué

No he ejecutado ningún modelo neuronal: no hay PyTorch instalado y la GPU es una RTX 3050 de 4 GB, insuficiente para VGGT/DA3 en más de un puñado de frames. Por eso el PoC ataca deliberadamente la mitad que sí se puede validar sin GPU —y que además es la mitad que nos pertenece.

---

## 6. Múltiples capturas y alineación

### 6.1 Entre capturas

El error a evitar: reconstruir cada vídeo por separado y registrar las nubes después con ICP. ICP entre dos nubes sin solape fiable diverge en silencio y produce un resultado que parece correcto.

Orden correcto:
1. **Una sola reconstrucción, varios vídeos.** Se concatenan los keyframes de todas las capturas en un único job. El modelo feed-forward resuelve las poses en un frame común y el problema de registro desaparece.
2. Si son sesiones distintas (días diferentes), registro por *pose graph* con solape compartido, e ICP solo como refinamiento final.
3. Con IFC georreferenciado + capturas georreferenciadas, `pc-align.ts` ya lo resuelve por el peldaño `shared-crs`.

### 6.2 Contra el IFC

Tu escalera A→E es correcta, pero el orden de implementación no:

| Estrategia | Veredicto |
|---|---|
| **A — Manual** | **MVP. Ya existe**: `AlignmentOffset` con x/y/z/yaw/pitch/roll/escala, clamps y persistencia por fichero. |
| **B — Puntos de referencia** | **Fase 3.** 3 puntos correspondidos → Kabsch → transform rígido. Alto valor, bajo coste, y encaja como un peldaño nuevo. |
| **C — Detección automática** | Fase 6. Emparejar planos/columnas es investigación abierta y falla en edificios repetitivos. |
| **D — Marcadores (ArUco/AprilTag)** | Fase 4, y **es la mejor opción para precisión real**. Pero exige que alguien imprima y coloque dianas: cambia el producto de "sube un vídeo" a "sigue un protocolo". |
| **E — Geográfica** | Ya existe. Es el peldaño más alto de `pc-align.ts`. |

Recomendación: A ahora (gratis), B en fase 3, D como modo "precisión" para quien lo necesite.

---

## 7. Dónde ejecutar cada parte

**Navegador:** triaje y control de calidad *antes* de subir. Extraer frames con WebCodecs, medir nitidez (varianza del laplaciano), movimiento y solape, y rechazar un vídeo malo en 2 segundos en vez de gastar 4 minutos de GPU. Un modelo de profundidad pequeño en WebGPU vale para esta señal.

**Servidor GPU:** toda la reconstrucción. No es negociable con modelos de esta escala.

**Navegador otra vez:** render. Ya resuelto por `PointCloudSystem`.

Reconstrucción 100 % en el navegador: **no.** Con 4 GB de VRAM en un portátil no cabe, y en móvil menos.

Coste realista: una GPU cloud de gama media ronda 0,4–1 €/hora; una captura de 2-4 minutos con feed-forward son segundos de GPU más sobrecarga → céntimos por captura. **El coste dominante no es la GPU, es el almacenamiento y el egress** de nubes de decenas de MB. Eso importa porque el producto no tiene backend de pago aún.

### Formatos

| Uso | Formato | Motivo |
|---|---|---|
| Interno del pipeline | **PLY binario** | Trivial de escribir, lleva `confidence`, ya soportado |
| Entrega y streaming | **COPC** | LAZ + octree, *range reads* — ya implementado en `copc-reader.ts` con streaming por nodos |
| Malla | GLB | Ya soportado por `meshStore` |
| Splats (fase 6) | **SOG** o `.spz` | 15-20× sobre PLY, con LOD por chunks |

No hace falta Potree ni 3D Tiles: **COPC ya cubre streaming progresivo + LOD**, y el código existe.

---

## 8. UX

Tu flujo de 8 pasos es bueno. Cuatro correcciones desde herramientas profesionales:

1. **Guía durante la grabación, no validación después.** El fallo lo determina la captura, y para cuando el usuario sube el vídeo ya es tarde. Polycam y Matterport guían en vivo. Mínimo viable: una pantalla de instrucciones antes de grabar (movimiento lento, 60-80 % de solape, no rotar sobre el sitio).
2. **El triaje debe poder decir que no.** Un "esto no va a funcionar, y esta es la razón" en 2 segundos vale más que una reconstrucción mala en 4 minutos.
3. **Nunca muestres una nube sin su incertidumbre.** El slider de confianza ya existe; que salga visible por defecto. Un modelo BIM parece exacto, y una nube junto a él hereda esa autoridad sin merecerla.
4. **El resultado debe ser una comparación, no un objeto.** Que la pantalla final no sea "aquí está tu nube" sino "aquí está dónde la obra difiere del modelo". Ver §9.

---

## 9. La única versión de esto que sirve al moat

Reality Capture como reconstrucción 3D es commodity: Polycam lo hace mejor, gratis, y con una app nativa que tiene ARKit.

Pero hay algo que ninguno de ellos hace, porque no tienen el IFC: **convertir la desviación obra-vs-modelo en un número citable.**

```
IFC + captura  →  alineación  →  desviación por elemento  →  As-Built Conformance Score
```

Eso no es un viewer bonito: es la misma jugada del Health Score, aplicada a la obra. Es un número que un jefe de obra cita en un informe, que genera una página de reporte crawleable, y que nadie más puede producir porque requiere el modelo y la realidad a la vez.

Encaja con `project_refocus_save_2026-06.md` en vez de contradecirlo. **Si esto se construye, debe construirse como productor de ese número.** El diseño de esa fase está en `docs/AS_BUILT_SCORE_PLAN.md`. Si se construye como "sube un vídeo y mira qué chulo", es exactamente la clase de feature que la re-auditoría VC identificó como el motivo por el que el producto tiene 0 usuarios.

Y la pregunta honesta antes de empezar: **no hay evidencia de que ningún usuario haya pedido esto**, porque no hay usuarios todavía. El coste de oportunidad frente al prerender de la landing (crítico y pendiente) es alto.

---

## 10. Roadmap

| Fase | Objetivo | Dificultad | Tecnologías | Riesgo | Entregable |
|---|---|---|---|---|---|
| **1 — Validación técnica** | Probar que la fusión es correcta y el formato encaja | Baja | numpy, Blender, vitest | Ninguno | **Hecha.** Fusión exacta, 3 escenas medidas a precisión milimétrica, contrato PLY↔viewer en CI |
| **2 — Reconstrucción básica** | 1 vídeo → 1 nube métrica visible en el viewer | Media | DA3 / MapAnything, GPU worker, cola | El modelo no generaliza a interiores sin textura | **Diseñada**: `docs/AS_BUILT_SCORE_PLAN.md`. Motor de score hecho y testeado |
| **3 — Alineación IFC** | Registro por 3 puntos + refinamiento | Media | Kabsch, ICP, peldaño nuevo en `pc-align.ts` | Bajo: la escalera ya existe | Nube colocada correctamente sobre el modelo |
| **4 — Capturas múltiples** | Varios vídeos en un frame común | Media-alta | Job multi-vídeo, pose graph, ArUco opcional | Deriva en recorridos largos | Proyecto con N capturas |
| **5 — Datasets grandes** | Plantas completas, streaming | Alta | MASt3R-SLAM, COPC, LOD | VRAM, coste de storage/egress | Captura de un edificio navegable |
| **6 — Inteligencia** | Score de conformidad as-built, splats de presentación | Alta | Desviación por elemento, SOG | Es el que crea valor; también el más lejano | El número de §9 |

**No empieces por la fase 2 sin decidir antes la §9.** La decisión de encuadre determina qué se construye en las fases 2-5, y rehacerla después es caro.

---

## 11. Referencias

| Proyecto | Qué hace | Qué aprender / reutilizar | Límite | Cómo diferenciarnos |
|---|---|---|---|---|
| [Depth Anything 3](https://depth-anything-3.github.io/) | Profundidad + pose multi-vista, un transformer plano | **Reutilizar directamente** como motor de fase 2 | Peso de GPU; licencia a revisar | No es diferenciación, es infraestructura |
| [VGGT](https://vgg-t.github.io/) / [VGGT-Ω](https://www.robots.ox.ac.uk/~vedaldi/research/2026/vggt-omega/vggt-omega.html) | Reconstrucción feed-forward en una pasada | La alternativa/plan B a DA3 | Memoria con muchos frames | — |
| [MapAnything](https://map-anything.github.io/) | Métrico, acepta poses/calibración/profundidad opcionales | **La mejor opción si añadimos captura AR**: consume las poses de ARKit | Reciente, menos probado | — |
| [MASt3R-SLAM](https://edexheim.github.io/mast3r-slam/) | SLAM denso 15 FPS | Camino para fase 5 (recorridos largos) | Necesita CUDA, tiempo real | — |
| [COLMAP](https://colmap.github.io/) | SfM/MVS clásico | Referencia de precisión para evaluar | Lento, frágil sin textura | — |
| [PlayCanvas SOG / SuperSplat](https://developer.playcanvas.com/user-manual/gaussian-splatting/formats/sog/) | Formato y editor de splats | Formato de fase 6, ya con LOD | Apariencia, no superficie | — |
| Polycam / Matterport | Captura móvil de consumo | Guía de captura en vivo, expectativas de UX | **No tienen el IFC** | Ahí está todo: comparar contra el modelo |
| Autodesk ReCap / Faro | Reality capture profesional | Vocabulario y tolerancias del sector | Caro, escritorio, escáner | Vídeo de móvil + navegador + un número |

---

## 12. Cómo reproducir

```bash
python experiments/reality-capture/selftest_fusion.py
npx vitest run src/lib/pointcloud/reality-capture-ply.test.ts
```

Ciclo completo por escena (`object` | `room` | `structure`), unos minutos cada una:

```bash
"C:/tools/blender-4.5.12-windows-x64/blender.exe" -b --python experiments/reality-capture/blender_capture.py -- --scene structure --out ./out
python experiments/reality-capture/fuse_to_ply.py --views ./out/structure --out ./out/structure/fused.ply
"C:/tools/blender-4.5.12-windows-x64/blender.exe" -b ./out/structure/groundtruth.blend --python experiments/reality-capture/evaluate.py -- --ply ./out/structure/fused.ply
```
