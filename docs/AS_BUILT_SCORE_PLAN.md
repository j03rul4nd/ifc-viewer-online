# Fase 2 — El As-Built Conformance Score

Diseño. 2026-08-25. Continúa `docs/REALITY_CAPTURE_PLAN.md` §9.
Núcleo implementado y testeado: `src/lib/asbuilt/`.

---

## 1. Qué se construye, en una frase

Un job que recibe **un vídeo** y devuelve **un número 0-100 sobre cuánto coincide la obra con el modelo IFC**, acompañado siempre de qué fracción del modelo pudo mirar.

Lo que **no** se construye: un pipeline de reconstrucción de propósito general, un editor de nubes, ni una UI nueva de Reality Capture. La nube es un subproducto intermedio, no el entregable.

---

## 2. La decisión arquitectónica principal: dónde está el corte

El instinto sería mandar todo al servidor. Es la decisión equivocada, y evitarla es lo que hace este producto defendible:

```text
   [servidor GPU]                        [navegador]
   solo el VÍDEO  ──► keyframes     │    IFC (nunca sale)
                      DA3/MapAnything│           │
                      fusión         │    nube ──┴──► scoring
                      → nube (COPC)  │           │
                                     │           ▼
                                     │    As-Built Score + desviación por elemento
```

**El IFC nunca sale del navegador.** Al servidor solo va el vídeo, que es contenido que el usuario ya sube a WhatsApp sin pensarlo; el modelo —que es el activo confidencial y contractual del cliente— se queda local. El scoring es una comparación nube↔IFC que corre perfectamente en un Web Worker.

Esto es coherente con los invariantes del producto (nada de subir IFC), y es literalmente imposible de replicar para un competidor cuyo producto es una plataforma cloud de reality capture. Polycam no puede hacer esto porque no tiene el IFC; Autodesk no lo hará porque su modelo de negocio es justamente subir el modelo.

---

## 3. El modelo de puntuación

Réplica deliberada de `calculateQualityScore` en `src/lib/validator.ts`. Mismo esqueleto, mismo comportamiento, misma honestidad — porque el objetivo estratégico es que este número se lea como *el mismo tipo de número* que el Health Score, no como una métrica nueva que hay que aprender.

### 3.1 Clasificación por elemento

Para cada elemento IFC, se muestrea su superficie y se mide la distancia de cada muestra al punto reconstruido más cercano. Con tolerancia τ:

| Estado | Condición | Significado |
|---|---|---|
| `conforming` | emparejado y p95 ≤ τ | Está construido donde dice el modelo |
| `deviated` | emparejado y p95 > τ | Está, pero fuera de tolerancia |
| `missing` | observado pero < 20 % de muestras emparejadas | Modelado y no construido (o aún no) |
| `unobserved` | ninguna cámara lo vio | **No puntuable** |
| `occluded` | en el frustum pero tapado | **No puntuable** |

Y en dirección contraria: puntos reconstruidos sin ningún elemento IFC cerca se agrupan en `unmodelled` — construido pero no modelado. Ese es el hallazgo que más valor tiene para un jefe de obra y el que ningún validador de IFC puede producir, porque requiere la realidad.

### 3.2 De estados a penalización

Las desviaciones se agrupan en tres reglas as-built, y se penalizan con **el mismo modelo logarítmico** que el Health Score:

```
penalización = peso × (1 + ln(nº de elementos))
score        = clamp(100 − Σ penalizaciones, 0, 100)
```

| Regla | Severidad | Peso |
|---|---|---|
| `AB_ELEMENT_MISSING` | error | 5 |
| `AB_POSITION_DEVIATION` | error si p95 > 2τ, si no warning | 4 / 1,2 |
| `AB_UNMODELLED_ELEMENT` | warning | 1,5 |

El logaritmo importa aquí incluso más que en la validación: si un forjado entero está 4 cm alto, eso es **un** problema de obra, no 800 elementos defectuosos. Un `peso × count` daría 0 en cualquier captura real y el número sería inútil.

La salida es un array con la forma de `ScoreContribution[]`, ordenado por impacto, para que "qué arreglar primero" funcione igual que en el panel de validación.

### 3.3 Cobertura: la parte que hace que esto sea honesto o basura

**Un elemento no observado no es conforme ni no-conforme. Es desconocido.** Contarlo como conforme —que es lo que hará cualquier implementación ingenua— convierte el score en publicidad: grabas 20 segundos de una esquina limpia y sacas 100.

Por eso `AsBuiltCoverage` refleja a `ValidationCoverage`: cuenta elementos observados, ocluidos y no observados, y **el score nunca se escala por cobertura**. Se publican juntos y separados, exactamente como el Health Score publica su coverage:

> As-Built Score **87** — sobre el **34 %** del modelo que la captura pudo ver.

Un score con 12 % de cobertura debe presentarse como no concluyente. Regla de producto: **por debajo del 25 % de cobertura no se emite número**, se emite "captura insuficiente".

Esto es la lección medida de la fase 1: la completitud de la escena `room` salió en 238 mm no porque la reconstrucción fallara, sino porque la métrica puntuaba superficies que la cámara no podía ver. El mismo error, cometido a nivel de producto, es el que destruiría la credibilidad del número.

### 3.4 De dónde sale τ, y cuándo negarse a puntuar

τ no se inventa. Tiene dos componentes:

```
τ = tolerancia_constructiva_declarada  ⊕  incertidumbre_de_la_medida
```

La primera la elige el usuario (por defecto 25 mm, típico para estructura). La segunda sale de la reconstrucción: p95 de precisión medido, más el RMSE del registro contra el IFC.

**El guardarraíl crítico:** si τ no supera con margen el error de alineación, no estás midiendo el edificio, estás midiendo tu propia alineación. El motor **se niega a emitir score** cuando `τ < 2 × alignmentRmse`, y dice por qué. Sin esa condición, este producto genera con total confianza informes de desviación que son artefactos de registro — que es exactamente cómo se pierde la credibilidad de un número de golpe y para siempre.

---

## 4. Qué hay que construir, en orden

| # | Pieza | Dónde | Estado |
|---|---|---|---|
| 1 | **Motor de score** — estados → contribuciones → 0-100 + cobertura + guardarraíles | `src/lib/asbuilt/as-built-score.ts` | **Hecho, con tests** |
| 2 | **Muestreo de superficie IFC** — elemento → N puntos en su superficie | Web Worker, desde la geometría que el viewer ya tiene | Pendiente |
| 3 | **Vecino más cercano** — rejilla de vóxeles sobre la nube (la nube ya viene en chunks) | Web Worker | Pendiente |
| 4 | **Test de observabilidad** — frustum + caras traseras + oclusión por reproyección | `src/lib/asbuilt/observability.ts` | **Hecho, con tests y medido** |
| 5 | **Job service** — vídeo → nube + `cameras.json` | Servidor GPU | Pendiente |
| 6 | **Presentación** — score, tabla de desviación, reporte compartible | Reutiliza `share-report.ts` + `delivery-report.ts` | Pendiente |

Piezas 1-4 corren en el navegador y no necesitan GPU ni servidor: **se pueden construir y validar enteras contra las escenas sintéticas de la fase 1**, usando la geometría de Blender como "el IFC" y la nube fusionada como "la realidad". Eso permite terminar el motor completo antes de gastar un euro en GPU.

La pieza 5 es la única que cuesta dinero, y es la última.

---

## 4bis. Resultado del primer criterio de muerte: la cobertura ES alcanzable

`observability.ts` está construido y medido contra los depth maps reales de la fase 1
(`experiments/reality-capture/coverage_probe.py`, 36 vistas, 200 muestras por elemento):

| Escena | Cobertura | Veredicto |
|---|---|---|
| Estructura BIM (órbita exterior) | **100 %** | PASS |
| Habitación (interior, mano alzada) | **63,6 %** | PASS |

La órbita es una cota superior poco informativa: ver un edificio desde fuera es el caso fácil.
El número que importa es el 63,6 % de la habitación, que es la trayectoria parecida a un
vídeo de móvil real. **Con margen sobre el 25 % exigido.**

Y la clasificación resulta físicamente coherente, que es la señal de que mide algo:
el techo sale `unobserved` (la cámara mira ligeramente hacia abajo y nunca lo encuadra),
la mesa sale `unobserved` (la trayectoria jamás la mira), y las paredes salen `observed`.

### El fallo que solo apareció al medir

La primera medición dio **0 % de cobertura en la habitación**: las diez paredes marcadas
como ocluidas en una captura que las vio todas. La causa no era la oclusión sino el
muestreo: un muro es un volumen, y la mitad de su superficie mira hacia **fuera** de la
habitación. Esas muestras nunca pueden verse —la cámara golpea la cara interior primero—
así que cada una se contabilizaba como "tapada".

La corrección es descarte de caras traseras, y cambia el denominador: las fracciones se
toman sobre las muestras que **alguna cámara podría llegar a mirar de frente**, no sobre
todas. Una superficie que ninguna cámara puede encarar no es cobertura que falte: está
fuera de la pregunta.

Es exactamente el mismo error que la métrica de completitud de la fase 1 (`REALITY_CAPTURE_PLAN.md` §5.2),
cometido por segunda vez en otro sitio. Merece nombre propio porque volverá a aparecer en
la pieza 2: **al comparar un modelo sólido contra una captura de superficie, el denominador
por defecto siempre está mal.**

---

## 5. Cómo se valida antes de tener usuarios

La fase 1 dejó el instrumento montado para esto. Con las escenas sintéticas se puede fabricar la verdad fundamental que en obra no existe:

1. Renderizar la escena `structure` → nube (ya hecho: 337 608 puntos, mediana 7,8 mm).
2. **Mover deliberadamente una columna 4 cm** en el .blend y volver a renderizar.
3. Puntuar la nube nueva contra la geometría *original*.
4. El motor debe señalar esa columna y solo esa.

Ese es el test de aceptación de la fase 2, y no requiere ni obra, ni cliente, ni GPU. Si el motor no encuentra una columna movida 4 cm en una escena sintética perfecta, no tiene ninguna posibilidad en una obra real.

Falsos positivos igual de importantes: puntuar la nube contra su geometría *sin modificar* debe dar ~100 con cero elementos señalados. Un motor que inventa desviaciones donde no las hay es peor que no tener motor.

---

## 6. Criterios de muerte

Explícitos, porque esta fase es cara y la re-auditoría dice que el riesgo del proyecto es construir en vez de distribuir:

- ~~**Si la cobertura típica no llega al 25 %**, se para.~~ **Superado en sintético: 63,6 % en la escena interior** (§4bis). Sigue sin verificarse en una obra real, donde hay desorden, andamios y oclusión dinámica.
- **Si el RMSE de alineación no baja consistentemente de 20 mm** con registro por 3 puntos, τ tendría que ser ≥ 40 mm y el score no distinguiría defectos que importan. Se para.
- **Si el test de la columna movida no la detecta** en sintético, el enfoque no funciona. Se para antes de tocar el servidor.

---

## 7. Lo que sigue sin estar resuelto

- **La alineación es la fase 3 y este score depende de ella.** Hasta que exista el registro por 3 puntos, τ estará dominado por el error de colocación manual. Se puede construir y validar todo el motor con alineación perfecta (sintética), pero el número no es emitible a un usuario hasta que la fase 3 esté hecha.
- **"Missing" es ambiguo en obra**: un elemento no construido y uno construido pero tapado por andamios producen la misma señal. Mitiga la clasificación `occluded`, no la resuelve.
- **No hay validación con un usuario real.** Sigue sin haber evidencia de demanda; esto es una apuesta sobre el encuadre, no una respuesta a una petición.
