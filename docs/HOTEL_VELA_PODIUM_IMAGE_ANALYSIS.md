# Hotel Vela: lectura cruzada del podio

Fecha: 2026-09-05. Análisis de las dos nuevas imágenes, contrastado con los
generadores locales. Es una interpretación del proyecto dibujado, no una
verificación del edificio construido. Los rótulos se usan como información.

## Fuentes y método

- **P1:** planta nivel +6.70, imagen de 1000 × 470 píxeles.
- **P2:** lámina de 800 × 566 píxeles con «PLANTA TECHOS», «SECCION A_A» y
  «ALZADO NORTE PODIUM».
- Copias: `demo/blender/hotel-vela-20260905-r4/sources/`.
- Contraste local: `build-hotel-vela.py`, `hotel_vela_details.py` y la documentación
  de las revisiones anteriores. Para +2.30 se utiliza también la planta aportada
  en el turno anterior; esa cifra no se deduce de textos pequeños de P2.

Se comparan contornos, posiciones relativas, continuidad de recorridos y
símbolos. No se convierten píxeles a metros: las cotas pequeñas no son legibles
con fiabilidad. No se considera que ampliar la imagen recupere ese detalle.
«Izquierda» y «derecha» se refieren a la imagen, no a puntos cardinales. El
rótulo del alzado permite nombrar su fachada norte, pero no registra por sí
solo toda la planta sobre el mapa.

## 1. El podio no es un volumen uniforme

**Visible:** la sección muestra varios planos horizontales, cuerpos cerrados,
espacios abiertos superiores, recorridos inclinados y volúmenes que sobresalen.
El alzado muestra una base horizontal relativamente continua, un gran marco
rectangular que emerge, elementos verticales puntuales y cuerpos escalonados.

**Consecuencia:** reconstruir separadamente la envolvente inferior, las cubiertas
transitables, el cuerpo rectangular singular, terrazas y conexiones. Una misma
huella no puede aplicarse indiscriminadamente a todos los forjados y fachadas.

**Desviación actual:** el generador aplica `PLOT` a las placas inferiores y
levanta una fachada de podio alrededor de esa huella a cota local 0, con 6 m de
altura. `PLOT` procede de OSM: no es una medición de las cubiertas ni de sus patios.
Algunos comentarios del código lo llaman «surveyed»; no hay evidencia aquí de
un levantamiento. La volumetría inferior sigue siendo una simplificación.

## 2. Hay dos rectángulos que no deben confundirse

| Pieza | P1 | P2 | Interpretación y confianza |
|---|---|---|---|
| Gran pieza rectangular | Centro-izquierda del sector inferior, aprox. x=200–305, y=240–415 | Gran superficie rectangular izquierda en planta de techos; el alzado contiene un cuerpo rectangular elevado | Compatible con cubierta/volumen singular; no hay base suficiente para identificarla como piscina. Correspondencia exacta planta-alzado todavía por registrar |
| Rectángulo menor | Sector inferior derecho, dentro de una terraza equipada | Rectángulo interior a la derecha, rodeado de filas de tumbonas, aprox. x=510–600, y=160–192 | Piscina probable, confianza media-alta por contexto y repetición entre láminas; dimensiones, profundidad y borde no verificables |

La segunda lámina mejora sustancialmente la localización relativa de la piscina.
Ya no procede decir simplemente «no se sabe dónde podría estar»: hay una
hipótesis espacial concreta y contrastable en la terraza derecha. Falta fijar
su posición métrica y su nivel en el sistema IFC. El tono gris por sí solo no
identifica agua; las tumbonas y la coincidencia topológica son la evidencia.

El recinto rectangular grande requiere volumen y cubierta propios si se
confirma su correspondencia con el cuerpo elevado del alzado. No modelarlo
como un gran vaso por su forma, ni llamarlo patio abierto sin comprobarlo.

## 3. La terraza contiene varias zonas de uso

**Visible en ambas plantas:** agrupaciones de mesas y asientos, bandas de
tumbonas, una zona central equipada, áreas laterales diferenciadas y un remate
triangular en el extremo derecho. Hay circulación entre los grupos, no una
ocupación continua de mobiliario.

**Consecuencia BIM:** separar el espacio de circulación, la terraza junto al
vaso probable, las agrupaciones de estancia y los sectores de mesas. El espacio
puede llamarse «estancia exterior interpretada»; no es necesario inventar un
nombre comercial o atribuir un uso contractual de restaurante/bar a cada mesa.

Las bandas de pequeños cuadrados y los recintos triangulares pueden incluir
pérgolas, jardineras u otros elementos. Sus símbolos no permiten asignar a todos
ellos una función ni una altura segura. Deben quedar como elementos pendientes
de identificación, no convertirse automáticamente en cabanas o piscinas.

**Desviación actual:** `Restaurant Terrace` es un polígono rectangular definido
en coordenadas de solar y situado a cota local +6. No representa esta zonificación.
Las tres zonas de restaurante del anexo en U tampoco acreditan la distribución
del podio que se ve aquí: anexo y terraza de basamento son partes diferentes.

## 4. El acceso exterior y los cambios de nivel son arquitectura principal

**Visible:** una banda longitudinal oscura/trapezoidal organiza el sector
central-derecho de las plantas. La sección A_A muestra tramos inclinados y
mesetas que conectan planos a distintas alturas.

**Lectura:** es necesario registrar la línea de corte sobre la planta antes de
dar por demostrada la correspondencia exacta de cada tramo. Es una conexión
exterior de niveles, distinta de la escalera de evacuación de la torre que ya
se modeló. No se deben identificar todos los tramos como rampas accesibles:
faltan pendiente, peldañeado legible y anchos fiables.

**Reconstrucción:** extremos sobre superficies reales, tramos y descansillos
independientes, recorte de forjados donde corresponda, laterales y protecciones
según lo visible. Emplear IfcStairFlight o IfcRampFlight cuando se resuelva la
tipología. No sustituir este recorrido por una escalera estándar decorativa.

## 5. El problema de niveles debe resolverse antes de añadir el vaso

Las plantas aportadas +2.30 y +6.70 establecen **4.40 m de diferencia entre esas
cotas de proyecto**. Esto no demuestra por sí solo que toda la planta tenga
esa altura libre, ni fija el cero geodésico.

El modelo conserva estas hipótesis:

| Referencia | Relación actual | Problema |
|---|---|---|
| Planta 12, +51.25 | Level 12 local +41.75 | Desfase supuesto de +9.50 m entre cota dibujada y local |
| +2.30 | Local −7.20 bajo ese supuesto | Se agrega a B02 (−8.40); no hay un forjado de referencia específico a −7.20 |
| +6.70 | Sería local −2.80 bajo el mismo supuesto | No existe una planta del podio a esa elevación en `LEVELS` |
| Terraza actual | Local +6.00 | Bajo ese supuesto equivale a +15.50 del proyecto, no a +6.70 |

La discrepancia de **8.80 m** entre la terraza actual y la cota local calculada
para +6.70 es consecuencia de la hipótesis existente, no una medición de error
contra el edificio real. Es suficiente para demostrar que el datum del podio
no está reconciliado. No se debe corregir moviendo solo muebles o piscina.
Hay que resolver la tabla de cotas conjunta y coordinar ARC/STR/MEP.

## 6. Zonas interiores y relación con la torre

La mitad superior de P1 tiene muchos recintos pequeños, pasillos y agrupaciones
de circulación vertical junto a áreas de mayor tamaño. No es defendible llenar
todo ese sector con una única zona de lobby ni extrapolar habitaciones tipo.
Los usos de cada recinto no pueden recuperarse con fiabilidad de estos textos.
Primero deben trazarse las separaciones, pasos y núcleos legibles y después
asignar usos solo donde la leyenda sea realmente identificable.

Estas láminas **no validan las 54 habitaciones paramétricas** añadidas en la
revisión anterior: ese trabajo pertenece a plantas altas y conserva dimensiones
estimadas. Añadir componentes IFC no acredita por sí mismo la fidelidad del podio.

## Orden de reconstrucción derivado del análisis

1. Registrar P1/P2 usando varios hitos: límites del podio, cuerpo rectangular,
   conexión longitudinal y recinto de piscina probable. Revisar diferencias
   de dibujo antes de imponer una única transformación.
2. Reconciliar cotas de proyecto/locales y crear los niveles necesarios en las
   tres disciplinas, sin duplicar placas en niveles incompatibles.
3. Trazar por separado huella cerrada inferior, terrazas y volumen singular;
   compararlos tanto en sección como en alzado.
4. Construir la conexión exterior de niveles y comprobar encuentros reales.
5. Incorporar el vaso probable y su terraza en posición registrada; profundidad
   y detalles de borde seguirán etiquetados como estimados.
6. Zonificar estancias exteriores y recintos interiores legibles; añadir solo
   después el mobiliario que explique esa organización.

## Criterios para aceptar la siguiente revisión

- El corte reproduce la sucesión de niveles y el perfil escalonado reconocible.
- El alzado contiene el volumen singular y las diferencias de altura, no solo
  una franja acristalada uniforme.
- La pieza rectangular grande y la piscina probable son objetos distintos.
- El recorrido exterior conecta plataformas sin saltos ni sólidos que lo bloqueen.
- Espacios de terraza, vaso y zonas interiores no se confunden con el anexo en U.
- Cotas y forjados coinciden entre ARC, STR y MEP; la prueba IFC no sustituye
  esta comprobación arquitectónica.

Este turno produce el análisis para la reconstrucción; no modifica los IFC.
