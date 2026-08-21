# Investigación de datasets Point Cloud + IFC

Fecha de verificación: 2026-08-19.

## Decisión

El dataset seleccionado es **CRAS Labs @ FEUP — Labelled Indoor Point Cloud
Dataset for BIM Related Applications**, publicado por Abreu, Souza, Pinto,
Matos y Pires. Es el candidato más sólido para una demo pública y comercial:
representa espacios interiores reales, entrega la nube original y el IFC
as-built correspondiente, conserva RGB/intensidad/33 clases semánticas y el
descriptor científico declara expresamente **CC BY 4.0**.

Se clasifica como **Tier A**, no Tier S. Los autores indican que nube e IFC no
comparten marco local y describen una alineación coarse-to-fine mediante ICP;
no publican la matriz resultante. Por ello este repositorio calcula y valida una
transformación rígida propia, con escala bloqueada en 1.

Fuentes primarias:

- [Dataset y archivos originales (Zenodo, DOI 10.5281/zenodo.7948116)](https://doi.org/10.5281/zenodo.7948116)
- [Descriptor científico y licencia del dataset (Data 2023, DOI 10.3390/data8060101)](https://doi.org/10.3390/data8060101)
- [Ficha institucional de la Universidade do Porto](https://sigarra.up.pt/reitoria/pt/pub_geral.pub_view?pi_pub_base_id=666204)

## Shortlist verificable

`INSUFFICIENT EVIDENCE` significa que la fuente pública consultada no permite
afirmar ese dato o ese derecho. No se interpreta “descargable” como “apto para
uso comercial”.

| Dataset | Tier | Edificio / contenido | Nube | IFC | Tamaño / puntos | RGB | Licencia | Demo comercial | Alineación | Impacto visual |
|---|---:|---|---|---|---|---:|---|---|---|---|
| **CRAS Labs @ FEUP** | A | Laboratorio, taller, dos oficinas y pasillo reales en FEUP | ASCII XYZ RGB intensidad etiqueta | Sí, IFC2X3 as-built | ZIP 4.267 GB; 584,701,977 puntos; IFC 67.6 MB | Sí | CC BY 4.0 declarada por el descriptor científico | **Sí**, con atribución | Media: marcos locales distintos; ICP necesario | **Alta**: color, mobiliario, depósitos, puertas, ventanas y escaleras |
| **DeKH German Hospital Dataset** | S geométrico / restringido | Cuatro escenas hospitalarias reales en tres edificios | LAZ + etiquetas NPY | Sí, ground truth y predicción | 17.2 GB; número de puntos no publicado en la ficha | INSUFFICIENT EVIDENCE | CC BY-NC-SA 4.0; acceso condicionado a compartir contacto | **No**: NonCommercial | Baja: par coordinado | Muy alta, pero incompatible con el objetivo comercial |
| **BIMNet** | S geométrico / restringido | 25 escaneos Matterport reales, 382 salas, 8,700 m² | Derivada de Matterport3D | Sí, IFC modelado manualmente | 116.5 M puntos; cada preview ~60 MB; corpus total no publicado | Sí en previews | Datos originales bajo Matterport3D Terms; parte de autores MIT | **No demostrada / no comercial para los datos Matterport** | Baja: modalidades sincronizadas | Muy alta, pero acceso académico en dos pasos |
| **ISPRS Indoor Modelling Benchmark** | A / restringido | Seis nubes de cinco edificios, incluyendo universidad, oficina de bomberos y museo | Nubes benchmark (formatos según escena) | BIM disponibles desde 2020 | Tamaños y puntos dependen de escena | Variable | Condiciones propias: solo investigación y prohibida redistribución | **No** | Media | Alta, pero no hospedable ni comercial |
| **CV4AEC Scan-to-BIM Challenge 2024** | B | 16 plantas de 8 edificios para la tarea 3D | LAZ alineado | No en la entrega oficial: ground truth geométrico JSON de muros, columnas y puertas | Tamaño/puntos no publicados en la ficha | INSUFFICIENT EVIDENCE | No aparece licencia de dataset en el repositorio público | **INSUFFICIENT EVIDENCE** | Baja frente al JSON; conversión a IFC necesaria | Alta, aunque no cumple el requisito IFC directo |
| **CyberBuild Lab matching-confidence sample** | A técnico / procedencia incompleta | Ejemplo `Sample.ply` + `Sample.ifc`; edificio de origen no identificado públicamente | PLY binario, 1,588,386 puntos, 23.8 MB | Sí, IFC2X3 pequeño | PLY 23.8 MB; IFC 48 KB | Canal azul constante; parece producto procesado, no RGB original | Repositorio Apache-2.0 | **INSUFFICIENT EVIDENCE** para los datos: la licencia del repo es abierta, pero falta procedencia inequívoca del escaneo | Baja | Media-baja; útil para pruebas, no como historia de “edificio real” |

Enlaces de verificación de los descartes:

- [DeKH — ficha, contenido, acceso y licencia](https://huggingface.co/datasets/RPTU-FGMB/DeKH)
- [BIMNet — corpus, acceso y términos mixtos](https://thucbims.github.io/bimnet.thucbims.github.io/)
- [ISPRS — benchmark, BIM y condiciones de uso](https://www.isprs.org/resources/datasets/benchmarks/IndoorModeling/Default.aspx)
- [CV4AEC 2024 — LAZ alineado y ground truth JSON](https://github.com/GradientSpaces/cv4aec-challenge)
- [CyberBuild Lab — muestra PLY/IFC y licencia del repositorio](https://github.com/CyberbuildLab/pcd-bim-matching-confidence)

## Matriz de licencia del dataset seleccionado

| Pregunta | Respuesta verificada |
|---|---|
| License | Creative Commons Attribution 4.0 International (CC BY 4.0) |
| Commercial use | Sí |
| Modification allowed | Sí |
| Redistribution allowed | Sí |
| Attribution required | Sí |
| Can host files ourselves | Sí, conservando atribución, enlace a licencia e indicación de cambios |
| Can publish derived files | Sí, indicando que son derivados y qué se modificó |
| Can use in commercial product demos | Sí |

Observación de trazabilidad: la sección `Rights` del registro Zenodo visible el
2026-08-19 no muestra valor de licencia, aunque el descriptor científico enlaza
exactamente ese DOI y declara “Dataset License: CC BY 4.0”; la ficha
institucional de la Universidade do Porto y la de INESC TEC repiten la misma
declaración. El archivo `LICENSE.md` conserva esta discrepancia para que no se
oculte detrás de una conclusión simplificada.

## Hechos técnicos del CRAS

- Captura: 21 escaneos TLS con Leica BLK360 G2, marzo de 2023.
- Resolución de adquisición declarada: 5 mm a 10 m.
- Registro original: Leica Cyclone Register 360, error medio declarado de 3 mm.
- Nube: X/Y/Z en metros, RGB 0–255, intensidad 0–1 y etiqueta 0–33.
- Total declarado y comprobado en la cabecera: 584,701,977 puntos.
- Espacios: laboratorio con depósito de agua, taller de robótica, dos oficinas y pasillo.
- IFC: as-built modelado con medición manual, plano AutoCAD y Revit; exportado como IFC2X3.
- CRS: no se declara CRS geodésico; ambos son marcos locales métricos distintos.

## Por qué no se creó un IFC nuevo

El dataset ya incluye el BIM as-built correspondiente. Generar uno a partir de
planos segmentados habría destruido semántica y trazabilidad, y habría convertido
una demo Scan-vs-BIM reproducible en una reconstrucción propia de menor calidad.

## Arquitectura recomendada para el visor

La implementación existente ya adopta las decisiones correctas para este caso:
PLY binario como formato interoperable inmediato; COPC como techo escalable;
`BufferGeometry`/shaders, chunks, presupuesto de puntos, frustum/LOD, punto
flotante local y una única transformación nube→IFC. Para esta demo de ~1 M de
puntos, el PLY binario alineado evita infraestructura adicional y permite carga
local. Para nubes de decenas o cientos de millones, conviene generar COPC y
servir rangos HTTP; Potree/EPT solo compensa si se adopta su pipeline y runtime.

Modos de presentación:

1. **Point Cloud**: IFC oculto, RGB original.
2. **IFC**: nube oculta.
3. **Overlay**: ambos visibles; IFC semitransparente.
4. **X-Ray**: ambos visibles, estilo IFC `xray`.
5. **Scan vs BIM**: ambos opacos o con mezcla controlada.
6. **Comparison slider**: mezcla cruzada de opacidad; no altera geometría.
7. **Deviation heatmap**: PLY derivado con color por distancia a la superficie IFC.

La métrica de desviación implementada es punto→triángulo IFC más cercano, no
punto→vértice. Sus bandas son ≤2 cm, 2–5 cm, 5–10 cm y >10 cm. No debe
presentarse como precisión del escáner: mezcla desviación real, simplificación
del BIM, oclusiones, elementos ausentes y error residual de registro.
