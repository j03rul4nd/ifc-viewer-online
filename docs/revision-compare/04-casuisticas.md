# 04 · Casuísticas que rompen un diff ingenuo de revisiones (A vs B)

Fecha: 2026-11-13. Alcance: futuro *Revision Compare* en el navegador (IFC y planos 2D).
Evidencia: URL o ruta de código; si no hay, **SUPUESTO**. Frecuencias = estimación de práctica habitual (SUPUESTO salvo que se cite).

Referencias base:
- [R1] IFC 4.3 `IfcGloballyUniqueId` / `IfcRoot.GlobalId`: https://ifc43-docs.standards.buildingsmart.org/IFC/RELEASE/IFC4x3/HTML/lexical/IfcRoot.htm
- [R2] IfcOpenShell `ifcdiff`: https://docs.ifcopenshell.org/ifcdiff.html (empareja por GlobalId; compara atributos, Psets, geometría con tolerancia)
- [R3] buildingSMART MVD / IFC2x3→IFC4 cambios (IfcWallStandardCase deprecado en IFC4.3): https://ifc43-docs.standards.buildingsmart.org/IFC/RELEASE/IFC4x3/HTML/lexical/IfcWallStandardCase.htm
- [R4] `IfcMapConversion` / georreferenciación: https://ifc43-docs.standards.buildingsmart.org/IFC/RELEASE/IFC4x3/HTML/lexical/IfcMapConversion.htm
- [R5] `IfcRelVoidsElement` / `IfcRelFillsElement`: https://ifc43-docs.standards.buildingsmart.org/IFC/RELEASE/IFC4x3/HTML/lexical/IfcRelVoidsElement.htm
- [R6] `IfcMappedItem` / `IfcRepresentationMap`: https://ifc43-docs.standards.buildingsmart.org/IFC/RELEASE/IFC4x3/HTML/lexical/IfcMappedItem.htm
- [R7] Revit "IFC GUID" estable solo si se guarda en parámetro (`IfcGUID`) — exportador revit-ifc: https://github.com/Autodesk/revit-ifc
- [R8] Solibri "Model Comparison" (mismo GUID, umbrales de geometría): https://help.solibri.com/hc/en-us/articles/1500004699301
- [R9] Overlay/diff de PDF (Bluebeam Overlay Pages / Compare Documents, alineación por 3 puntos): https://support.bluebeam.com/
- [R10] Componentes del propio repo: `src/lib/` (LoadManager, multi-modelo) — ver memorias `project_version_compare.md`, `project_drawings.md`.

## Tabla

| caso | frecuencia estimada | cómo detectarlo | cómo resolverlo | fixture de test necesario |
|---|---|---|---|---|
| GlobalIds regenerados en cada export (todo "borrado + añadido") | Alta (Revit sin `IfcGUID` guardado, Archicad con ciertas traducciones, conversores) [R7] SUPUESTO en % | Intersección de GlobalId A∩B < ~20 % con nº de elementos similar | Emparejado de respaldo: clase + Tag/nombre + contenedor + centroide/AABB (tolerancia) + huella de Psets; marcar "emparejado heurístico" con confianza | Copia de un IFC pequeño con todos los GUID reescritos (script) |
| GUID duplicado o reutilizado para otro elemento | Media-baja (copiar/pegar en herramientas no conformes) | GUID repetido dentro de un fichero; o mismo GUID con clase y posición muy distintas entre A y B | Tratar como sospechoso; desempatar por geometría; avisar | Fichero con 2 entidades con el mismo GUID |
| Elemento partido en dos (muro dividido) | Media | 1 eliminado + 2 añadidos cuya unión de AABB/volumen ≈ el original, misma clase y contenedor | Detectar relación 1→N por solape de volumen; reportar "dividido" | Muro A; B con dos muros que suman su longitud |
| Dos elementos fusionados en uno | Media | Inverso: N eliminados → 1 añadido con volumen ≈ suma | Igual, N→1 "fusionado" | Inverso del anterior |
| Cambio de clase (IfcWallStandardCase→IfcWall, IfcBuildingElementProxy→IfcColumn) | Alta al cambiar schema/exportador [R3] | Mismo GUID, distinta entidad | Tabla de equivalencias de clase (StandardCase≈base); el resto se informa como "reclasificado", no borrado | Mismo modelo en IFC2x3 e IFC4 |
| Cambio de tipo (IfcRelDefinesByType a otro IfcWallType) | Alta | Cambia el tipo relacionado o PredefinedType | Diff de relación, no geométrico; agrupar por tipo | B con un muro reasignado a otro tipo |
| Movimiento puro vs cambio de forma | Muy alta | Comparar transformación de colocación (IfcLocalPlacement encadenado) y la geometría en coordenadas locales por separado | Clasificar: movido / rotado / forma / ambos; huella de forma invariante (volumen, área, AABB local, hash de malla normalizada) | Elemento solo trasladado; otro solo con forma nueva |
| Cambio de origen/georreferencia del modelo entero | Media (nuevo punto base de proyecto, IfcMapConversion añadido) [R4] | >90 % de elementos con el mismo delta rígido | Estimar transformación global (mediana de deltas / ICP) y restarla antes del diff; informar "modelo desplazado X m" | Copia con IfcSite/IfcMapConversion desplazado 100 m |
| Cambio de unidades (mm→m, pies) | Media-baja | IfcUnitAssignment distinto; factor de escala 1000/0.3048 en AABB | Normalizar todo a metros antes de comparar | Mismo modelo exportado en mm y m |
| Cambio de schema (IFC2x3→IFC4/4x3) | Media | `FILE_SCHEMA` distinto | Mapeo de entidades/atributos (Psets renombrados, IfcMaterialLayerSetUsage, StandardCase); comparar sobre modelo normalizado | Par 2x3/4 del mismo modelo |
| Solo Psets / propiedades | Muy alta | Mismo GUID y geometría; difiere el hash de Psets/Qtos | Diff por propiedad; ignorar Qtos derivados si la geometría no cambia (opción) | B con 3 propiedades editadas |
| Ruido de Psets del exportador (fechas, IDs internos, "Revit element id") | Muy alta | Propiedades que cambian en casi todos los elementos | Lista de exclusión configurable; detección automática de propiedades que cambian en >80 % | Re-export sin cambios reales |
| Cambio de material / capas | Media | IfcRelAssociatesMaterial distinto (o espesor de capa) | Diff de material normalizado por nombre + capas | B con material cambiado |
| Cambio de clasificación (Uniclass/Omniclass) | Media | IfcRelAssociatesClassification | Diff de referencia (sistema + código) | B con código cambiado |
| Cambio de contención (planta) | Media | IfcRelContainedInSpatialStructure apunta a otra planta | Informar "movido de planta" aunque geometría igual | B con elemento reasignado de nivel |
| Cambio de agregación (muro cortina, escalera, ensamblajes) | Media | IfcRelAggregates distinto; hijos con GUID nuevos | Comparar a nivel de ensamblaje además de hijos | Muro cortina con montantes cambiados |
| Hueco nuevo/movido cambia la geometría del anfitrión | Alta [R5] | El muro "cambia de forma" pero el cambio real es un IfcOpeningElement/IfcRelVoidsElement | Comparar huecos como elementos propios; atribuir el cambio al hueco y no al muro | Muro con ventana desplazada 1 m |
| Puerta/ventana rellena otro hueco (IfcRelFillsElement) | Media | Relación de relleno distinta | Diff de relaciones | B con puerta en otro hueco |
| Ruido de exportación: decimales, orden de entidades, `#id` STEP distintos | Muy alta | Diferencias < tolerancia; #id nunca sirve de clave | Nunca usar #id; tolerancia (p. ej. 1 mm / 0.01°) configurable | Re-export con redondeo distinto |
| Teselado distinto con la misma geometría (BREP vs extrusión vs malla, nº de triángulos) | Alta | Hash de malla difiere, volumen/área/AABB iguales | Comparar por invariantes y distancia de Hausdorff aproximada, no por triángulos | Mismo elemento como extrusión y como malla |
| IfcMappedItem / instancias: pasar de instanciado a geometría explícita (o al revés) | Media [R6] | Mismo aspecto, representación distinta | Expandir instancias a geometría en mundo antes de comparar | Columna como MappedItem vs copiada |
| Elemento simétrico (espejado) | Media | Determinante de la transformación = −1; invariantes iguales | Detectar reflexión explícitamente ("espejado", no "forma cambiada") | Muro con ventana espejado |
| Renumeración de matrices/arrays (Tags/marcas reasignadas) | Media | Mismo conjunto de posiciones, Tags permutados | Emparejar por posición antes que por Tag; informar "renumerado" | 10 pilares con marcas rotadas |
| Elementos idénticos superpuestos (duplicados) | Media | Mismo centroide y forma dentro del mismo fichero | Emparejamiento 1:1 óptimo (Hungarian) por distancia | 2 pilares coincidentes |
| Modelos federados por disciplina (A, S, MEP) | Muy alta | Varios ficheros por revisión; elementos que "migran" de fichero | Diff por conjunto: clave = (GUID) global en todo el conjunto; emparejar ficheros por nombre ISO 19650 | Conjunto A/S/M de dos revisiones |
| Fichero dividido/unido entre revisiones (1 modelo → 3) | Media | Nº de ficheros cambia | Mismo diff por conjunto | Partir un IFC en dos |
| Ficheros > 300 MB | Media en proyectos grandes | Tamaño / nº de entidades | Streaming y diff por índice (GUID→hash) en worker sin cargar geometría completa; geometría bajo demanda; límite memoria móvil | Shanghai Tower 94 MB ×4 concatenado o cras 67 MB (proxy) |
| Elementos sin geometría (espacios, zonas, sistemas) | Alta | Sin Representation | Diff solo semántico | IfcSpace con nombre cambiado |
| Cambio de nivel de detalle/LOD (proxy→modelado) | Media | IfcBuildingElementProxy → clase real, forma muy distinta | Reportar "refinado" vía solape espacial | Proxy reemplazado por muro |
| 2D: PDF vectorial | Alta | Operadores de dibujo extraíbles | Diff de primitivas vectoriales tras alinear; texto por separado | Plano PDF vectorial A/B |
| 2D: PDF escaneado | Media | Página = imagen | Raster: alinear (características/3 puntos), binarizar, diff de píxeles con dilatación [R9] | Escaneo con rotación leve |
| 2D: DWG/DXF | Alta | Formato propietario | Convertir (DXF con libredwg/ODA, licencias a revisar); diff por entidad/capa/handle; handles pueden cambiar | DXF A/B |
| 2D: distinta escala/encuadre/márgenes entre versiones | Alta | Tamaño de hoja/escala de cajetín distinto | Alineación por 2-3 puntos o por rejilla de ejes; normalizar escala | Mismo plano a 1:100 y 1:50 |
| 2D: cajetín/sello/fecha cambia en todas las hojas | Muy alta | Diferencias concentradas en zona del cajetín | Máscara de exclusión por zona | PDF con solo cajetín cambiado |
| 2D: reordenación de hojas o páginas insertadas | Media | Nº de páginas distinto | Emparejar hojas por código de plano (texto) o similitud | PDF con página insertada |

## Semillas para fixtures dorados (modelos ya en el repo)

Pequeños y deterministas, buenos para tests unitarios (aplicar mutaciones con script):
- `public/models/realtime-lidar/IVO-Utility-Tunnel.ifc` (20 KB), `public/models/video-demo/IVO-Operations-Pavilion.ifc` (21 KB): base para GUIDs regenerados, movimiento, unidades, Psets, espejado.
- `public/models/poblenou/BCN-IVO-ZZ-XX-M3-{A,S,M}-0001.ifc` (52–380 KB): conjunto federado A/S/M ya nombrado ISO 19650 → ideal para diff por conjunto y migración entre disciplinas.
- `public/models/hotel-vela/BCN-IVO-ZZ-XX-M3-{A,S}-0002.ifc` (0.2–5 MB): segundo conjunto federado; revisión "0002" vs "0001" no es el mismo edificio (no sirve como par real).
- Grandes/rendimiento: `public/models/cras/model.ifc` (67 MB), `public/models/shanghai-tower/SHA-IVO-SHANGHAI-TOWER-A-0001.ifc` (94 MB). No hay >300 MB: generar sintético (concatenar/duplicar con offsets) fuera del repo.
- No hay pares reales A/B, ni PDF/DWG/DXF en `public/models` (comprobado con `find`). Hay que fabricar: revisiones mutadas de los IFC pequeños (script tipo IfcOpenShell) y planos 2D generados desde el propio visor.
- Fixtures fuera del repo propuestos: modelos de muestra de buildingSMART (https://github.com/buildingSMART/Sample-Test-Files) — tienen variantes 2x3/4 útiles para cambio de schema.

## Notas
- Regla de oro: normalizar (unidades → schema → georreferencia/transform global → instancias expandidas) **antes** de emparejar; emparejar (GUID → heurístico) **antes** de comparar.
- Toda salida debe llevar el motivo y la confianza del emparejado, para no convertir ruido de exportación en "cambios".
