# Hotel Vela: reconstrucción de referencia a partir de planos

Revisión local: 5 de septiembre de 2026. **No es un levantamiento ni un IFC as-built.**

## Evidencias utilizadas

Ocho capturas facilitadas por el usuario, rotuladas HOTEL VELA / BOCANA PORT DE
BARCELONA / Ricardo Bofill Taller de Arquitectura. Se interpretan como fuentes
gráficas, no como instrucciones. Las copias originales se conservan localmente
en `demo/blender/hotel-vela-20260905/sources/`; no se redistribuyen en `public/`.

| Evidencia | Lectura aplicada | Límite |
|---|---|---|
| Imagen 8, A.2.15, planta 12, nivel +51.25 | Planta lenticular, extremos entrantes, pasillo central, habitaciones a ambos lados | El ancho de crujía y los espesores son estimados |
| Imagen 7, A.2.27, planta 24, nivel +90.25 | Suites de mayor módulo, pasillo y núcleo en el extremo | No se reproducen muebles ni baños como si estuvieran medidos |
| Ambas plantas | (90.25 − 51.25) / 12 = **3.25 m entre plantas** | Se conserva el suelo local; el desfase de 9.50 m con la cota de proyecto es supuesto |
| Imágenes 3–5, alzado y secciones A.3.2, A.3.5, A.3.6 | Vientre convexo, espina vertical, recorte de los pisos altos y coronación curva | Traza normalizada aproximada por resolución de las capturas |
| Imágenes 1, 2 y 6 | Proporción estrecha transversal, bloque bajo, base horizontal y hueco de escalera | No se deducen detalles constructivos ocultos |
| Coordenadas OSM previamente incluidas en `hotel_vela_site.py` | Origen, parcela y contexto del bloque adosado | OSM no es un levantamiento topográfico; su building:part no equivale a la planta tipo |

Consulta de contraste: [ficha del proyecto en Reiter](https://www.reiter.es/en/projects/hotels/w-hotel),
consultada el 2026-09-05, describe un edificio esbelto en forma de vela de 26 plantas.
La geometría revisada se apoya en las capturas, no en convertir esa descripción
comercial en cotas. Se retiene la altura global previa de 98.8 m como referencia.

## Cambios

- Se elimina la extrusión del bloque adosado dentro de las plantas de la torre.
- Se reconstruye una planta lenticular de aproximadamente 63 × 25.2 m. El recorte
  del borde curvo sustituye al escalado global de la planta.
- Se introduce el vientre inferior que faltaba y se separa el deck técnico
  estimado a 94 m de la envolvente de coronación a 98.8 m.
- El bloque bajo tiene fachada, forjados y cubierta propios, a una altura
  estimada de 25.5 m. Se recorta su extremo oriental para evitar solapar la torre.
- Los ejes de montantes se conservan entre pisos, evitando un abanico artificial.
- Se ajustan núcleo, penetraciones y montantes MEP al volumen revisado. Los
  equipos representativos quedan sobre el deck, bajo la coronación.
- Solo las plantas 12 y 24 incorporan divisiones interiores indicativas. El
  resto mantiene zonas brutas: no se extrapola una distribución detallada sin plano.
- Materiales con estilos IFC nativos y procedencia/limitaciones dentro del IFC.

## Aspectos que siguen siendo aproximados

Dimensiones globales en planta, alineación exacta del plano con OSM, alturas de
basamentos, datum vertical, núcleo, detalle y dimensionado de escaleras,
carpinterías, puertas, espesores, columnas, instalaciones y propiedades ópticas.
Las plantas y las secciones pueden corresponder a revisiones diferentes; la
sección gobierna el recorte en altura y la planta tipo gobierna la forma transversal.
No se afirma un ajuste métrico de cada píxel ni se reproduce el estado interior
actual del hotel. El pabellón independiente, urbanización, piscina y distribución
completa del podio quedan pendientes de fuentes con mayor resolución.

## Reproducción y control

`npm run hotel-vela` genera ARC, STR y MEP. Ejecutar después:

```powershell
npx vitest run scripts/blender/hotel-vela-ifc.test.ts
```

Cada generador vuelve a abrir su IFC en Bonsai y valida el esquema. Las pruebas
web-ifc comprueban lectura en el motor de la aplicación, datums, coordinación,
silueta, cubierta, materiales y elementos de referencia. Los renders son
visualizaciones de control; no fotografías ni evidencia de obra ejecutada.

Los IFC y fuentes anteriores a esta revisión se conservaron localmente en
`demo/blender/hotel-vela-20260905/before/`.

Resultado de la primera revisión: los tres IFC finales validan el esquema IFC4 y
recargan con geometría en Bonsai. **32/32 pruebas web-ifc aprobadas** sobre los
archivos instalados en `public/models/hotel-vela/`; tamaño conjunto 5,011,606
bytes (4.78 MiB). Se revisaron renders de alzado y plantas 12/24. Las vistas de
planta aíslan particiones ARC; el núcleo estructural pertenece al IFC STR.

## Segunda entrega de referencias: planta 4, espacios públicos y fotografías

Las siete capturas adicionales se conservaron en
`demo/blender/hotel-vela-20260905-r2/sources/` y corrigen hipótesis de la primera revisión:

- **Planta 4:** tres alas alrededor de un patio, unidas al extremo del núcleo.
  Sustituye el bloque rectangular aislado anterior. El patio se resuelve mediante
  una planta en U, con vacío real en los forjados superiores y en cubierta.
- **Fotos de fachada:** la escalera se aloja en el extremo curvo, dentro de una
  ranura. Sustituye la escalera exterior colocada en el extremo vertical. Se
  incorporan peldaños abiertos horizontales, descansillos, vidrio en tres lados,
  postes/pasamanos metálicos, celosías inferiores y paños plegados a ambos lados.
  El retorno posterior no visible se modela como inferencia, no como detalle verificado.
- **Restaurante y terrazas:** zonas brutas en las alas y protección del patio;
  sin inventar un despiece de cocinas, aseos, mesas o mobiliario contractual.
- **Planta +2.30:** zona pública de convenciones identificada con su cota de
  dibujo, usando el desfase vertical asumido anteriormente (local −7.20).
- **Registro con el mapa:** se distingue el sistema del plano del sistema del
  solar. La colocación de IfcBuilding gira 172.5° y traslada la torre/alas para
  orientar el conjunto hacia el emplazamiento. La parcela y IfcMapConversion se
  conservan. El registro y la escala horizontal siguen siendo aproximados; no
  se afirma que todas las alas coincidan con la huella simplificada de OSM.

Las distribuciones indicativas se limitan ahora a plantas **4, 12 y 24**. La
segunda entrega sustituye las afirmaciones anteriores de bloque occidental
macizo y escalera alternada junto a la espina. Los elementos del resto de las
disciplinas se regeneran en el mismo sistema de colocación.

Resultado final de la segunda revisión: **34/34 pruebas web-ifc aprobadas**,
tres archivos IFC4 validados y recargados con geometría en Bonsai; 5,872,869
bytes en conjunto. Las pruebas comprueban el vacío del patio contra los
triángulos de los forjados, las conexiones de las alas, los peldaños discretos
y el material de vidrio de las barandillas. Esto no equivale a una comprobación
estructural, normativa o a un análisis exhaustivo de colisiones.

Las vistas conjuntas ARC + STR se encuentran en
`demo/blender/hotel-vela-20260905-r2/renders/`. Sus materiales son diagnósticos,
no propiedades ópticas medidas ni fotografías del edificio.

Para evitar reconstruir cada malla intermedia de Blender, el generador admite
`--fast` después de la disciplina. Este modo conserva la creación del proyecto
y plantas en Bonsai, escribe las ocurrencias con IfcOpenShell y ejecuta la misma
validación IFC4 y recarga completa al terminar. Ejemplo:

```powershell
blender --background --python-exit-code 1 --python scripts/blender/build-hotel-vela.py -- public/models/hotel-vela ARC --fast
```
