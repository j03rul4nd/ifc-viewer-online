# Validator Roadmap V2

> **Sesión de planning — sin implementación de código.**
> Generado el 2026-05-20 tras auditoría completa de `validator.worker.ts`, `validator.ts`,
> `validationStore.ts`, `ValidationPanel.tsx`, `src/types/index.ts`, `CONTEXT.md`,
> `ARCHITECTURE.md`, `DECISIONS.md` y `ROADMAP.md`.

---

## Auditoría de reglas actuales (Bloque 1)

### 1.1 Inventario de las 18 reglas

| # | ID Técnico | Qué comprueba (lenguaje no técnico) | Categoría | AutoFix | Severidad actual | Estándar |
|---|---|---|---|---|---|---|
| 1 | `RULE_EMPTY_NAME` | Detecta elementos (muros, puertas, columnas, espacios, plantas) que no tienen nombre asignado | Calidad de datos | No | `error` | IFC schema — `IfcRoot.Name` requerido en práctica |
| 2 | `RULE_EMPTY_LONGNAME` | Detecta espacios (habitaciones, salas) que no tienen nombre largo / descripción de uso | Calidad de datos | No | `warning` | ISO 19650-2 §6 — información de espacio |
| 3 | `RULE_DUPLICATE_NAME` | Detecta elementos que tienen el mismo nombre que otro hermano dentro del mismo contenedor | Calidad de datos | No | `warning` | BEP interno / buena práctica BIM |
| 4 | `RULE_NAMING_CONVENTION` | Comprueba que los nombres de los elementos siguen un patrón regex configurable por clase (ej. puertas con prefijo `DR-`) | Calidad de datos | No | `warning` | BEP interno / ISO 19650-2 §9.2 |
| 5 | `RULE_MISSING_TYPE` | Detecta elementos sin un tipo IFC (`IfcTypeObject`) asociado, lo que impide filtros por familia en herramientas como Revit | Propiedades y Psets | No | `info` | IFC schema |
| 6 | `RULE_DUPLICATE_GUID` | Detecta dos o más elementos que comparten el mismo identificador global (GUID), lo que rompe referencias cruzadas entre modelos y herramientas | Integridad del modelo | **Sí** | `error` | IFC schema — `IfcRoot.GlobalId` único según ISO 10303-21 |
| 7 | `RULE_MISSING_PROPERTY_SET` | Detecta elementos que no tienen un Pset requerido (lista configurable por clase IFC; por defecto vacía, así que esta regla solo actúa si el usuario la configura) | Propiedades y Psets | No | `warning` | LOD/LOIN / BEP interno |
| 8 | `RULE_ORPHAN_ELEMENT` | Detecta elementos físicos (muros, vigas, etc.) que no están contenidos en ninguna estructura espacial (planta, edificio, etc.) y que por tanto no aparecerán en el árbol | Estructura espacial | No | `error` | IFC schema — `IfcRelContainedInSpatialStructure` obligatoria |
| 9 | `RULE_WRONG_CONTAINER` | Detecta elementos físicos colocados directamente en `IfcSite`, sin pasar por un `IfcBuilding` o `IfcBuildingStorey` | Estructura espacial | No | `error` | IFC schema — jerarquía de contención |
| 10 | `RULE_BROKEN_AGGREGATE` | Detecta relaciones de agregación (`IfcRelAggregates`) que apuntan a elementos que ya no existen en el modelo (referencias rotas) | Integridad del modelo | No | `error` | IFC schema — integridad referencial ISO 10303-21 |
| 11 | `RULE_INVALID_GUID_FORMAT` | Verifica que cada GUID tenga exactamente 22 caracteres del alfabeto IFC base64 (`[0-9A-Za-z_$]`). Los GUIDs con formato incorrecto son rechazados por muchas herramientas | Integridad del modelo | **Sí** | `error` | IFC schema — especificación de `IfcGloballyUniqueId` |
| 12 | `RULE_SPATIAL_HIERARCHY` | Comprueba que la jerarquía espacial sea correcta: `IfcSite` → `IfcBuilding` → `IfcBuildingStorey` → `IfcSpace`. Por ejemplo, un `IfcBuilding` directamente bajo `IfcProject` (sin pasar por `IfcSite`) genera un issue | Estructura espacial | No | `error` | IFC schema — `IfcRelAggregates` hierarchy |
| 13 | `RULE_CIRCULAR_REFERENCE` | Detecta situaciones donde un elemento es su propio ancestro en el árbol de agregación (bucle infinito) — situación que puede colgarse la herramienta de recepción | Integridad del modelo | No | `error` | IFC schema — integridad del grafo de agregación |
| 14 | `RULE_EMPTY_PROPERTY_VALUE` | Detecta propiedades dentro de Psets que tienen un valor nulo, vacío (`''`) o el placeholder `'Unknown'` | Propiedades y Psets | No | `warning` | LOIN — Level of Information Need |
| 15 | `RULE_MISSING_MATERIAL` | Detecta elementos estructurales y de envolvente (muros, forjados, vigas, columnas, etc.) que no tienen ningún material asignado (`IfcRelAssociatesMaterial`) | Propiedades y Psets | No | `warning` | LOD 300 — material obligatorio en elementos estructurales |
| 16 | `RULE_ELEMENT_IN_BUILDING` | Detecta elementos físicos contenidos directamente en `IfcBuilding`, sin pasar por una planta (`IfcBuildingStorey`) — lo que impide su visualización por planta | Estructura espacial | No | `warning` | IFC best practice |
| 17 | `RULE_INVALID_IFC_VERSION` | Lee el header del archivo y avisa si el schema IFC es obsoleto (`IFC2X3`, `IFC2X2`, etc.) o desconocido | Integridad del modelo | No | `info` | ISO 10303-21 — FILE_SCHEMA header |
| 18 | `RULE_ELEMENT_CLASH` | Detecta interferencias geométricas (colisiones) entre elementos estructurales mediante bounding boxes, con umbral de 5 cm de penetración. Limitado a 800 elementos por rendimiento. **Off por defecto.** | Geometría | No | `warning` | BIM coordination practice |

### 1.2 Gaps evidentes — validaciones importantes no cubiertas

**Integridad del modelo:**
- No se comprueba si existe `IfcProject` (podría no haber ninguno)
- No se comprueba si existe `IfcSite` o `IfcBuilding`
- No se verifica el header `FILE_DESCRIPTION` ni la autoría del archivo (`FILE_AUTHOR`)
- No se detecta si el modelo tiene coordenadas de referencia georreferenciadas (`IfcSite.RefLatitude/RefLongitude`)

**Estructura espacial:**
- No se detecta `IfcBuilding` sin ninguna `IfcBuildingStorey`
- No se detecta `IfcBuildingStorey` completamente vacía (sin elementos)
- No se comprueba la elevación de plantas (`IfcBuildingStorey.Elevation`)

**Calidad de datos:**
- No se comprueba `IfcProject.LongName` (nombre oficial del proyecto)
- No se comprueba `IfcProject.Description` (fase o entrega)
- No se comprueba `IfcBuilding.LongName` ni sus coordenadas de emplazamiento
- No se detecta unicidad de nombres de Pset a nivel modelo (dos Psets con el mismo nombre)

**LOD / LOIN:**
- No existe ninguna regla que compruebe el nivel de información requerido para LOD 200/300/350/400
- No se verifica la presencia de `IfcElementQuantity` por clase de elemento
- No se verifica la presencia de capas de material (`IfcMaterialLayerSet`) para LOD 350

**ISO 19650:**
- No se valida la convención de naming del archivo de modelo (Project-Originator-Zone-Element-Phase-Classification-Number)
- No se valida la metadata de proyecto requerida en una entrega formal
- No se valida la asignación de responsables de información (`IfcPerson`, `IfcOrganization`)

**Clasificación:**
- No existe ninguna regla que compruebe si los elementos tienen clasificación asignada (`IfcRelAssociatesClassification`)
- No se valida si la clasificación pertenece a un sistema reconocido (Uniclass 2015, OmniClass, etc.)

**MEP:**
- No hay ninguna regla específica para sistemas MEP (ductos, tuberías, conectividad de redes)
- No se verifica que `IfcFlowSegment`/`IfcPipeSegment`/`IfcDuctSegment` estén asignados a un `IfcSystem`

**Geometría avanzada:**
- El clash actual solo usa AABB (bounding boxes), no comprueba MEP vs estructural por separado
- No hay detección de elementos con geometría nula o degenerada

---

## Taxonomía de tipos de validación (Bloque 2)

### T1 — Validación de esquema IFC

**Nombre comercial:** _Schema IFC_
**Descripción:** Comprueba que el archivo IFC está bien formado y es interpretable por cualquier herramienta compatible: header correcto, schema reconocido, entidades requeridas presentes.

| | |
|---|---|
| **Reglas actuales** | `RULE_INVALID_IFC_VERSION`, `RULE_BROKEN_AGGREGATE`, `RULE_CIRCULAR_REFERENCE`, `RULE_INVALID_GUID_FORMAT`, `RULE_DUPLICATE_GUID` |
| **Reglas nuevas propuestas** | `RULE_MISSING_PROJECT`, `RULE_MISSING_SITE`, `RULE_MISSING_BUILDING`, `RULE_FILE_DESCRIPTION_MISSING`, `RULE_FILE_AUTHOR_MISSING` |
| **Perfil de usuario** | Coordinador BIM, consultor de calidad, cualquier usuario que recibe modelos de terceros |

### T2 — Validación de estructura espacial

**Nombre comercial:** _Estructura espacial_
**Descripción:** Comprueba que la jerarquía del edificio (Proyecto > Parcela > Edificio > Planta > Espacio > Elemento) es correcta, completa y no tiene roturas.

| | |
|---|---|
| **Reglas actuales** | `RULE_ORPHAN_ELEMENT`, `RULE_WRONG_CONTAINER`, `RULE_SPATIAL_HIERARCHY`, `RULE_ELEMENT_IN_BUILDING` |
| **Reglas nuevas propuestas** | `RULE_MISSING_STOREY`, `RULE_EMPTY_STOREY`, `RULE_STOREY_ELEVATION_MISSING`, `RULE_SPACE_WITHOUT_STOREY` |
| **Perfil de usuario** | Arquitecto, coordinador BIM, cliente promotor |

### T3 — Validación de calidad de datos

**Nombre comercial:** _Calidad de datos_
**Descripción:** Comprueba convenciones de nombrado, unicidad de identificadores, presencia de propiedades mínimas y valores no vacíos. Es la categoría más relevante para entregas formales de modelo BIM.

| | |
|---|---|
| **Reglas actuales** | `RULE_EMPTY_NAME`, `RULE_EMPTY_LONGNAME`, `RULE_DUPLICATE_NAME`, `RULE_NAMING_CONVENTION`, `RULE_MISSING_PROPERTY_SET`, `RULE_EMPTY_PROPERTY_VALUE`, `RULE_MISSING_TYPE`, `RULE_MISSING_MATERIAL` |
| **Reglas nuevas propuestas** | `RULE_MISSING_DESCRIPTION`, `RULE_PROJECT_LONGNAME_MISSING`, `RULE_STOREY_ELEVATION_MISSING`, `RULE_BUILDING_LONGNAME_MISSING` |
| **Perfil de usuario** | Consultor de calidad, coordinador BIM, arquitecto (autor) |

### T4 — Validación de LOD / LOIN

**Nombre comercial:** _Nivel de información (LOD/LOIN)_
**Descripción:** Comprueba que los elementos del modelo tienen el nivel de información requerido para una entrega concreta (LOD 200, 300, 350, 400). Se basa en qué Psets, propiedades, cantidades y materiales deben estar presentes según el nivel declarado.

| | |
|---|---|
| **Reglas actuales** | `RULE_MISSING_PROPERTY_SET` (configurable), `RULE_MISSING_MATERIAL`, `RULE_MISSING_TYPE`, `RULE_EMPTY_PROPERTY_VALUE` |
| **Reglas nuevas propuestas** | `RULE_LOD_PSET_MISSING`, `RULE_LOD_QUANTITY_MISSING`, `RULE_LOD_MATERIAL_LAYER_MISSING`, `RULE_LOD_TYPE_MISSING` |
| **Perfil de usuario** | Cliente promotor, coordinador BIM, consultor de calidad, contratista que recibe modelos de subcontratistas |

### T5 — Validación contra ISO 19650

**Nombre comercial:** _ISO 19650_
**Descripción:** Comprueba los requisitos de información de una entrega formal según ISO 19650-2: naming del archivo de modelo, metadata de proyecto, responsables de información, clasificación de entrega.

| | |
|---|---|
| **Reglas actuales** | `RULE_NAMING_CONVENTION` (configurable), `RULE_INVALID_IFC_VERSION` |
| **Reglas nuevas propuestas** | `RULE_ISO19650_FILENAME`, `RULE_ISO19650_PROJECT_INFO`, `RULE_ISO19650_AUTHOR_INFO`, `RULE_ISO19650_PHASE_DEFINED` |
| **Perfil de usuario** | Coordinador BIM (lead), gestor de información (Information Manager), cliente promotor |

### T6 — Validación de clasificación

**Nombre comercial:** _Clasificación_
**Descripción:** Comprueba que los elementos tienen clasificación asignada (`IfcRelAssociatesClassification`) y que pertenece a un sistema reconocido (Uniclass 2015, OmniClass, NBS, ETIM, Omniclass, etc.).

| | |
|---|---|
| **Reglas actuales** | Ninguna |
| **Reglas nuevas propuestas** | `RULE_MISSING_CLASSIFICATION`, `RULE_INVALID_CLASSIFICATION_SYSTEM` |
| **Perfil de usuario** | Coordinador BIM, cliente promotor, consultor de calidad, gestor de activos (FM) |

### T7 — Validación MEP / coordinación

**Nombre comercial:** _Sistemas MEP_
**Descripción:** Comprueba requisitos específicos de sistemas de instalaciones: naming de sistemas, asignación de elementos MEP a un `IfcSystem`, conectividad de redes.

| | |
|---|---|
| **Reglas actuales** | `RULE_ELEMENT_CLASH` (parcialmente — incluye elementos MEP) |
| **Reglas nuevas propuestas** | `RULE_MEP_SYSTEM_MISSING`, `RULE_MEP_NAMING_CONVENTION`, `RULE_MEP_FLOW_DIRECTION` |
| **Perfil de usuario** | Coordinador MEP, ingeniero de instalaciones, coordinador BIM |

### T8 — Detección de conflictos (clash)

**Nombre comercial:** _Detección de colisiones_
**Descripción:** Comprueba interferencias geométricas entre elementos. La regla actual usa AABB (bounding boxes) como aproximación. Versiones futuras usarán geometría exacta.

| | |
|---|---|
| **Reglas actuales** | `RULE_ELEMENT_CLASH` (AABB, estructural vs estructural, off by default) |
| **Reglas nuevas propuestas** | `RULE_CLASH_MEP_STRUCTURAL`, `RULE_CLASH_THRESHOLD_CONFIGURABLE` |
| **Perfil de usuario** | Coordinador BIM, coordinador MEP, arquitecto, todos los usuarios en fase de coordinación |

---

## Perfiles de validación propuestos (Bloque 3)

Los perfiles son conjuntos de reglas preconfigurados, seleccionables con un click antes de ejecutar la validación. Se almacenan como `ValidationProfile` en `src/types/index.ts` y se persisten en `validationStore`.

### Perfil 1 — Entrega básica

**Icono sugerido:** `📦`
**Descripción:** Comprueba que el modelo es un IFC válido y bien estructurado antes de enviarlo a cualquier destino. Detecta los errores más graves que causarían rechazo inmediato en Solibri, Revit o BIMCollab.

**Problema que resuelve:** "Necesito saber si este IFC se puede abrir y navegar sin errores antes de entregarlo."

**Tipos cubiertos:** T1, T2

**Reglas activas:**
- `RULE_INVALID_IFC_VERSION` ✓
- `RULE_DUPLICATE_GUID` ✓
- `RULE_INVALID_GUID_FORMAT` ✓
- `RULE_BROKEN_AGGREGATE` ✓
- `RULE_CIRCULAR_REFERENCE` ✓
- `RULE_ORPHAN_ELEMENT` ✓
- `RULE_WRONG_CONTAINER` ✓
- `RULE_SPATIAL_HIERARCHY` ✓
- `RULE_ELEMENT_IN_BUILDING` ✓
- `RULE_MISSING_PROJECT` ✓ _(nueva)_
- `RULE_MISSING_BUILDING` ✓ _(nueva)_
- `RULE_MISSING_STOREY` ✓ _(nueva)_

**Perfil de usuario objetivo:** Cualquier usuario antes de enviar un modelo a un cliente o colaborador.

---

### Perfil 2 — Revisión de calidad interna

**Icono sugerido:** `🔍`
**Descripción:** Revisión exhaustiva de calidad de datos antes de publicar el modelo en el CDE (Common Data Environment). Comprueba naming, propiedades, GUIDs, materiales y estructura.

**Problema que resuelve:** "Quiero pasar una revisión completa de calidad antes de publicar en el CDE."

**Tipos cubiertos:** T1, T2, T3

**Reglas activas:** Todas las de "Entrega básica" más:
- `RULE_EMPTY_NAME` ✓
- `RULE_EMPTY_LONGNAME` ✓
- `RULE_DUPLICATE_NAME` ✓
- `RULE_MISSING_TYPE` ✓
- `RULE_MISSING_PROPERTY_SET` ✓ (con Psets mínimos configurados por el usuario)
- `RULE_EMPTY_PROPERTY_VALUE` ✓
- `RULE_MISSING_MATERIAL` ✓
- `RULE_MISSING_DESCRIPTION` ✓ _(nueva)_
- `RULE_PROJECT_LONGNAME_MISSING` ✓ _(nueva)_
- `RULE_STOREY_ELEVATION_MISSING` ✓ _(nueva)_

**Perfil de usuario objetivo:** Arquitecto autor del modelo, coordinador BIM senior.

---

### Perfil 3 — Coordinación BIM

**Icono sugerido:** `⚡`
**Descripción:** Comprueba calidad de datos esencial y detecta colisiones entre disciplinas para una sesión de coordinación. Equilibrio entre rapidez y cobertura.

**Problema que resuelve:** "Tenemos una reunión de coordinación. Quiero saber qué errores de datos y qué colisiones hay antes de reunirnos."

**Tipos cubiertos:** T1, T2, T3, T8

**Reglas activas:** Todas las de "Entrega básica" más:
- `RULE_EMPTY_NAME` ✓
- `RULE_DUPLICATE_NAME` ✓
- `RULE_MISSING_TYPE` ✓
- `RULE_EMPTY_PROPERTY_VALUE` ✓
- `RULE_ELEMENT_CLASH` ✓ (habilitado)
- `RULE_CLASH_MEP_STRUCTURAL` ✓ _(nueva, si está implementada)_

**Perfil de usuario objetivo:** Coordinador BIM, coordinador MEP, todos los participantes de una sesión de clash detection.

---

### Perfil 4 — Cumplimiento ISO 19650

**Icono sugerido:** `📋`
**Descripción:** Comprueba los requisitos de información de una entrega formal según ISO 19650-2. Verifica naming del modelo, metadata de proyecto, clasificación y responsables de información.

**Problema que resuelve:** "Este modelo va a una entrega formal ISO 19650. ¿Cumple todos los requisitos de información?"

**Tipos cubiertos:** T1, T2, T3, T5, T6

**Reglas activas:** Todas las de "Revisión de calidad interna" más:
- `RULE_ISO19650_FILENAME` ✓ _(nueva)_
- `RULE_ISO19650_PROJECT_INFO` ✓ _(nueva)_
- `RULE_ISO19650_AUTHOR_INFO` ✓ _(nueva)_
- `RULE_ISO19650_PHASE_DEFINED` ✓ _(nueva)_
- `RULE_MISSING_CLASSIFICATION` ✓ _(nueva)_

**Perfil de usuario objetivo:** Gestor de información (Information Manager), coordinador BIM en proyectos con requisito BIM Level 2+, cliente promotor.

---

### Perfil 5 — LOD 300 Design

**Icono sugerido:** `🏗️`
**Descripción:** Comprueba que todos los elementos tienen el nivel de información requerido para diseño de detalle (LOD 300): tipos definidos, Psets con propiedades básicas, materiales asignados, cantidades disponibles.

**Problema que resuelve:** "El cliente exige LOD 300 en esta entrega. ¿Está el modelo completo para ese nivel?"

**Tipos cubiertos:** T1, T2, T3, T4

**Reglas activas:** Todas las de "Revisión de calidad interna" más:
- `RULE_LOD_PSET_MISSING` ✓ _(nueva — Psets básicos por clase)_
- `RULE_LOD_QUANTITY_MISSING` ✓ _(nueva — IfcElementQuantity obligatoria)_
- `RULE_LOD_MATERIAL_LAYER_MISSING` ✓ _(nueva — capas de material en muros/forjados)_
- `RULE_LOD_TYPE_MISSING` ✓ _(nueva — IfcTypeObject obligatorio en LOD 300)_

**Perfil de usuario objetivo:** Arquitecto en fase de proyecto ejecutivo, coordinador BIM, contratista que verifica el modelo recibido del proyectista.

---

## Nuevas reglas propuestas (Bloque 4)

Para cada tipo de validación (T1–T8), las reglas más valiosas ordenadas por impacto comercial.

---

### T1 — Schema IFC (nuevas reglas)

#### `RULE_MISSING_PROJECT`
- **Descripción técnica:** Busca entidades de tipo `IFCPROJECT` en el modelo. Si `api.GetLineIDsWithType(modelId, IFCPROJECT).size() === 0`, emite issue.
- **Descripción usuario:** El archivo IFC no contiene un IfcProject. Sin este elemento raíz, el modelo no tiene contexto de proyecto y será rechazado por herramientas como Revit al importar.
- **Severidad:** `error`
- **Normativa:** IFC schema — `IfcProject` es la raíz obligatoria de todo modelo IFC
- **Complejidad:** Baja
- **AutoFix:** No (no es posible crear un IfcProject sin saber el nombre del proyecto)

#### `RULE_MISSING_BUILDING`
- **Descripción técnica:** `api.GetLineIDsWithType(modelId, IFCBUILDING).size() === 0`
- **Descripción usuario:** El archivo no contiene ningún IfcBuilding. Los modelos de arquitectura siempre deben tener al menos un edificio.
- **Severidad:** `warning`
- **Normativa:** IFC best practice / ISO 19650-2
- **Complejidad:** Baja
- **AutoFix:** No

#### `RULE_FILE_DESCRIPTION_MISSING`
- **Descripción técnica:** Lee los primeros 2KB del buffer (`FILE_DESCRIPTION` en el header STEP). Emite issue si está vacío o no existe.
- **Descripción usuario:** El header del archivo IFC no tiene descripción de entrega. La descripción identifica el propósito del modelo (ej. "Modelo arquitectónico — Fase proyecto básico").
- **Severidad:** `info`
- **Normativa:** ISO 10303-21 §8.2.1 — `FILE_DESCRIPTION`
- **Complejidad:** Baja (misma técnica que `ruleInvalidIfcVersion` que ya lee el header)
- **AutoFix:** No

#### `RULE_FILE_AUTHOR_MISSING`
- **Descripción técnica:** Lee `FILE_NAME` en el header STEP, extrae el campo de autor (campo 3). Emite issue si vacío.
- **Descripción usuario:** El archivo no tiene autor especificado en el header. En entregas formales, la autoría es trazable.
- **Severidad:** `info`
- **Normativa:** ISO 10303-21 §8.2.2 — `FILE_NAME`, ISO 19650-2
- **Complejidad:** Baja
- **AutoFix:** No

---

### T2 — Estructura espacial (nuevas reglas)

#### `RULE_MISSING_STOREY`
- **Descripción técnica:** Para cada `IFCBUILDING`, comprueba que tiene al menos un `IFCBUILDINGSTOREY` como hijo en `aggChildren`. Si no tiene ninguno, emite issue en el building.
- **Descripción usuario:** El edificio no tiene ninguna planta definida. Los elementos no pueden ordenarse por planta, lo que impide la generación de planos 2D y la navegación por nivel.
- **Severidad:** `warning`
- **Normativa:** IFC schema best practice
- **Complejidad:** Baja
- **AutoFix:** No

#### `RULE_EMPTY_STOREY`
- **Descripción técnica:** Para cada `IFCBUILDINGSTOREY`, comprueba que `containerElements.get(id)?.length > 0` o tiene hijos espaciales. Emite `info` si la planta está completamente vacía.
- **Descripción usuario:** Una o más plantas del modelo no contienen ningún elemento. Puede ser intencional (planta de cubierta sin elementos), pero en la mayoría de casos indica un error de asignación.
- **Severidad:** `info`
- **Normativa:** BEP interno / buena práctica
- **Complejidad:** Baja
- **AutoFix:** No

#### `RULE_STOREY_ELEVATION_MISSING`
- **Descripción técnica:** Lee `IfcBuildingStorey.Elevation` (atributo `Elevation: IfcLengthMeasure`). Emite `warning` si es `null` o `undefined`.
- **Descripción usuario:** Una o más plantas no tienen cota de elevación definida. Sin cota, las herramientas de generación de planos 2D y los modelos de energía no pueden calcular alturas de piso.
- **Severidad:** `warning`
- **Normativa:** ISO 19650-2 / LOIN — información geométrica mínima de plantas
- **Complejidad:** Baja
- **AutoFix:** No

---

### T3 — Calidad de datos (nuevas reglas)

#### `RULE_PROJECT_LONGNAME_MISSING`
- **Descripción técnica:** Lee `IfcProject.LongName`. Emite `warning` si está vacío.
- **Descripción usuario:** El proyecto no tiene nombre largo (nombre oficial del proyecto). Sin este dato, no es posible identificar el modelo en un CDE o en un informe de validación.
- **Severidad:** `warning`
- **Normativa:** ISO 19650-2 §6.1 — identificación del proyecto
- **Complejidad:** Baja
- **AutoFix:** No

#### `RULE_MISSING_DESCRIPTION`
- **Descripción técnica:** Para elementos estructurales (`ELEMENT_TYPES`) comprueba que `IfcRoot.Description` no está vacío. Emite `info`.
- **Descripción usuario:** Elementos estructurales importantes (muros, pilares, vigas) sin descripción. La descripción suele usarse para especificaciones de materiales o referencias de cálculo.
- **Severidad:** `info`
- **Normativa:** LOIN — Level of Information Need (ISO 17412)
- **Complejidad:** Baja
- **AutoFix:** No

---

### T4 — LOD / LOIN (nuevas reglas)

#### `RULE_LOD_PSET_MISSING`
- **Descripción técnica:** Para cada nivel LOD activo (configurable), comprueba que los elementos de cada clase tienen los Psets mínimos requeridos. Mapa interno `LOD_REQUIRED_PSETS` define qué Psets son obligatorios por clase y nivel. Ej. LOD 300: `IfcWall → ['Pset_WallCommon']`, `IfcSlab → ['Pset_SlabCommon']`, etc.
- **Descripción usuario:** Elemento sin el property set mínimo requerido para el nivel LOD declarado en esta entrega (ej. un muro sin `Pset_WallCommon` en LOD 300 está incompleto).
- **Severidad:** `warning`
- **Normativa:** buildingSMART Data Dictionary, Psets IFC4 — `Pset_WallCommon`, `Pset_SlabCommon`, etc.
- **Complejidad:** Media (requiere el mapa `LOD_REQUIRED_PSETS` y pasar el nivel LOD como parámetro de `RulesConfig`)
- **AutoFix:** No

#### `RULE_LOD_QUANTITY_MISSING`
- **Descripción técnica:** Para LOD 300+, comprueba que los elementos de las clases principales tienen al menos un `IfcElementQuantity` asociado. Usa el mapa de `relIds` de `IFCRELDEFINESBYPROPERTIES` filtrando por tipo `IFCELEMENTQUANTITY`.
- **Descripción usuario:** Elemento sin cantidades definidas (áreas, volúmenes, longitudes). Para LOD 300, las cantidades son obligatorias para la generación de mediciones y presupuestos.
- **Severidad:** `warning`
- **Normativa:** ISO 17412 — LOIN, NRM1 (UK), BEDEK (Spain)
- **Complejidad:** Media
- **AutoFix:** No

#### `RULE_LOD_MATERIAL_LAYER_MISSING`
- **Descripción técnica:** Para LOD 350, comprueba que los muros (`IFCWALL`, `IFCWALLSTANDARDCASE`) y forjados (`IFCSLAB`) tienen un `IfcMaterialLayerSetUsage` o `IfcMaterialLayerSet`. Sigue el camino `IfcRelAssociatesMaterial → IfcMaterialLayerSetUsage`.
- **Descripción usuario:** Muros o forjados sin capas de material definidas. Para LOD 350, la composición multicapa es obligatoria para cumplimiento acústico, térmico y de costes.
- **Severidad:** `warning`
- **Normativa:** LOD 350 spec (AIA E202), IFC4 `IfcMaterialLayerSet`
- **Complejidad:** Alta (requiere navegar relaciones de material)
- **AutoFix:** No

---

### T5 — ISO 19650 (nuevas reglas)

#### `RULE_ISO19650_FILENAME`
- **Descripción técnica:** Lee el nombre del archivo del header STEP (`FILE_NAME` campo 0). Comprueba que sigue el patrón de naming ISO 19650 de al menos 5 campos separados por guiones: `[Proyecto]-[Origen]-[Zona]-[Nivel]-[Tipo]-[Rol]-[Número]`. El patrón regex es configurable vía `RulesConfig.iso19650FilenamePattern`. Si no hay patrón configurado, emite solo `info`.
- **Descripción usuario:** El nombre del archivo no sigue la convención de naming ISO 19650. En entregas formales, el naming es trazable y contractual.
- **Severidad:** `warning` si hay patrón configurado, `info` si no
- **Normativa:** ISO 19650-2:2021 §6.3 — naming convention
- **Complejidad:** Baja (regex check, igual a `ruleNamingConvention`)
- **AutoFix:** No

#### `RULE_ISO19650_PROJECT_INFO`
- **Descripción técnica:** Comprueba que `IfcProject` tiene: `LongName` (nombre del proyecto), `Description` (fase), y `ObjectType` (tipo de entrega). Si alguno está vacío, emite issue indicando cuál.
- **Descripción usuario:** El proyecto no tiene la metadata mínima requerida para una entrega ISO 19650: nombre del proyecto, fase y tipo de entrega.
- **Severidad:** `warning`
- **Normativa:** ISO 19650-2:2021 §9.2 — EIR / BEP project information
- **Complejidad:** Baja
- **AutoFix:** No

#### `RULE_ISO19650_AUTHOR_INFO`
- **Descripción técnica:** Lee el header STEP `FILE_NAME` campos de autor y organización. Emite `info` si ambos están vacíos.
- **Descripción usuario:** El archivo no identifica al autor ni a la organización responsable. En ISO 19650, la trazabilidad de la información es un requisito.
- **Severidad:** `info`
- **Normativa:** ISO 19650-2:2021 §9.1 — responsabilidades de información
- **Complejidad:** Baja
- **AutoFix:** No

---

### T6 — Clasificación (nuevas reglas)

#### `RULE_MISSING_CLASSIFICATION`
- **Descripción técnica:** Para elementos de las clases principales (`ELEMENT_TYPES`), comprueba que existe al menos una `IfcRelAssociatesClassification` que los referencia. Usa `api.GetLineIDsWithType(modelId, IFCRELASSOCIATESCLASSIFICATION)`.
- **Descripción usuario:** El elemento no tiene clasificación asignada. Sin clasificación, es imposible vincular el modelo a sistemas de costes, FM (mantenimiento) o bases de datos de productos.
- **Severidad:** `warning`
- **Normativa:** ISO 19650-2, Uniclass 2015, OmniClass, NBS Chorus
- **Complejidad:** Media
- **AutoFix:** No

#### `RULE_INVALID_CLASSIFICATION_SYSTEM`
- **Descripción técnica:** Para cada `IfcClassificationReference`, lee `IfcClassification.Name` y comprueba que coincide con sistemas reconocidos (lista configurable: `['Uniclass2015', 'OmniClass', 'NBS', 'ETIM', 'UNSPSC']`).
- **Descripción usuario:** La clasificación asignada no pertenece a ningún sistema de clasificación reconocido. Esto puede indicar una clasificación personalizada o un error de naming.
- **Severidad:** `info`
- **Normativa:** Uniclass 2015 (UK), OmniClass (USA), NBS (UK), ETIM (manufacturing)
- **Complejidad:** Alta (lectura de relaciones de clasificación anidadas)
- **AutoFix:** No

---

### T7 — MEP / coordinación (nuevas reglas)

#### `RULE_MEP_SYSTEM_MISSING`
- **Descripción técnica:** Para elementos MEP (`IFCFLOWSEGMENT`, `IFCPIPESEGMENT`, `IFCDUCTSEGMENT`), comprueba que están asignados a un `IfcSystem` via `IfcRelAssignsToGroup`. Usa `api.GetLineIDsWithType(modelId, IFCRELASSIGNSTOGROUP)`.
- **Descripción usuario:** Tuberías o conductos no asignados a ningún sistema MEP (fontanería, climatización, etc.). Sin esta asignación, no es posible filtrar por sistema ni hacer análisis de conectividad.
- **Severidad:** `warning`
- **Normativa:** IFC MEP domain schema — `IfcDistributionSystem`
- **Complejidad:** Media
- **AutoFix:** No

#### `RULE_MEP_NAMING_CONVENTION`
- **Descripción técnica:** Comprueba que los elementos MEP siguen un patrón de naming (configurable vía `namingConventionPatterns`). Extensión de `RULE_NAMING_CONVENTION` para tipos MEP específicos.
- **Descripción usuario:** Tuberías o conductos sin naming de sistema (ej. el nombre no indica si es agua fría, agua caliente, aire de impulsión, etc.).
- **Severidad:** `warning`
- **Normativa:** MEP BEP interno / buildingSMART MEP guidelines
- **Complejidad:** Baja (reutiliza lógica de `ruleNamingConvention`)
- **AutoFix:** No

---

### T8 — Clash (nuevas reglas)

#### `RULE_CLASH_MEP_STRUCTURAL`
- **Descripción técnica:** Variante de `RULE_ELEMENT_CLASH` que ejecuta el test AABB solo entre elementos MEP (`IFCFLOWSEGMENT`, `IFCPIPESEGMENT`, `IFCDUCTSEGMENT`) como grupo A y elementos estructurales (`CLASH_ELEMENT_TYPES`) como grupo B. Evita falsos positivos entre elementos del mismo tipo.
- **Descripción usuario:** Detecta colisiones entre instalaciones (tuberías, conductos) y elementos estructurales (muros, vigas, forjados). Este tipo de clash es el más costoso en obra si no se detecta en proyecto.
- **Severidad:** `warning`
- **Normativa:** BIM coordination practice, COBie Clash matrix
- **Complejidad:** Media (reutiliza infraestructura AABB de `ruleElementClash`)
- **AutoFix:** No

---

### Tabla resumen de nuevas reglas por prioridad

| Prioridad | ID | Tipo | Complejidad | AutoFix |
|---|---|---|---|---|
| 1 | `RULE_MISSING_PROJECT` | T1 | Baja | No |
| 2 | `RULE_MISSING_STOREY` | T2 | Baja | No |
| 3 | `RULE_PROJECT_LONGNAME_MISSING` | T3 | Baja | No |
| 4 | `RULE_STOREY_ELEVATION_MISSING` | T2/T3 | Baja | No |
| 5 | `RULE_MISSING_BUILDING` | T1 | Baja | No |
| 6 | `RULE_FILE_DESCRIPTION_MISSING` | T1 | Baja | No |
| 7 | `RULE_FILE_AUTHOR_MISSING` | T1 | Baja | No |
| 8 | `RULE_EMPTY_STOREY` | T2 | Baja | No |
| 9 | `RULE_MISSING_DESCRIPTION` | T3 | Baja | No |
| 10 | `RULE_ISO19650_PROJECT_INFO` | T5 | Baja | No |
| 11 | `RULE_ISO19650_AUTHOR_INFO` | T5 | Baja | No |
| 12 | `RULE_ISO19650_FILENAME` | T5 | Baja | No |
| 13 | `RULE_MISSING_CLASSIFICATION` | T6 | Media | No |
| 14 | `RULE_LOD_PSET_MISSING` | T4 | Media | No |
| 15 | `RULE_LOD_QUANTITY_MISSING` | T4 | Media | No |
| 16 | `RULE_MEP_SYSTEM_MISSING` | T7 | Media | No |
| 17 | `RULE_CLASH_MEP_STRUCTURAL` | T8 | Media | No |
| 18 | `RULE_LOD_MATERIAL_LAYER_MISSING` | T4 | Alta | No |
| 19 | `RULE_INVALID_CLASSIFICATION_SYSTEM` | T6 | Alta | No |
| 20 | `RULE_MEP_NAMING_CONVENTION` | T7 | Baja | No |

---

## Cambios UI/UX propuestos (Bloque 5)

### 5.1 Selector de perfil de validación

**Componente:** Nuevo `ValidationProfileSelector.tsx` (o sección dentro de `ValidationPanel.tsx`)

**Comportamiento:**
- Se muestra ANTES de que el usuario pulse "Run", en el header del panel o como un área colapsable encima del panel actual
- Muestra las 5 tarjetas de perfil (o un dropdown) con nombre, icono y descripción corta
- El perfil activo queda destacado con borde de `var(--accent)`
- Al seleccionar un perfil, `validationStore.setActiveProfile(profileId)` aplica el `RulesConfig` correspondiente
- Un chip de "Personalizado" aparece cuando el usuario ha modificado reglas individualmente tras seleccionar un perfil

**Cambios en `validationStore.ts`:**
```typescript
// Nuevos campos:
activeProfileId: string | null              // 'basic' | 'quality' | 'coordination' | 'iso19650' | 'lod300' | 'custom'
setActiveProfile: (profileId: string | null) => void
```

**Nuevos tipos en `src/types/index.ts`:**
```typescript
export interface ValidationProfile {
  id: string
  name: string
  description: string
  icon: string
  rules: RulesConfig
  coverageTypes: ValidationCategoryType[]  // T1-T8
}

export type ValidationCategoryType = 'schema' | 'spatial' | 'quality' | 'lod' | 'iso19650' | 'classification' | 'mep' | 'clash'

export interface RuleMetadata {
  id: string
  label: string                        // Nombre comercial para el usuario
  description: string                  // Descripción de una frase
  category: ValidationCategoryType
  standard: string                     // Ej. 'IFC schema', 'ISO 19650', 'LOD 300'
  severity: 'error' | 'warning' | 'info'
  autoFixable: boolean
}

export const RULE_METADATA: Record<string, RuleMetadata>  // definir en types/index.ts
export const VALIDATION_PROFILES: ValidationProfile[]      // definir en types/index.ts
```

**Cambios en worker/validator:** Ninguno — el selector de perfil solo cambia el `RulesConfig` que ya se pasa al worker.

---

### 5.2 Resumen de cobertura post-validación

**Componente:** Nuevo `ValidationCoverageSummary.tsx` renderizado dentro de `ValidationPanel.tsx` cuando `result !== null`

**Comportamiento:**
- Muestra: "Se han comprobado X categorías de Y" con barra de progreso circular o linear
- Lista las categorías NO comprobadas con link "Activa el perfil ISO 19650 para comprobar clasificación"
- Se colapsa tras 3 segundos o al hacer click en dismiss

**Lógica:**
```typescript
// En validationStore o ValidationPanel:
const coveredTypes = getCoveredTypes(activeRules)   // deriving from RulesConfig which types T1-T8 are covered
const uncoveredTypes = ALL_TYPES.filter(t => !coveredTypes.includes(t))
```

**Cambios en stores:** Ninguno — es lógica derivada del `RulesConfig` activo y del `RULE_METADATA`.

**Nuevos tipos:** `ValidationCategoryType` (ver 5.1)

---

### 5.3 Badge de normativa en cada issue

**Componente:** Modificación de `RuleBadge` en `ValidationPanel.tsx`

**Comportamiento:**
- Cada issue muestra un badge secundario con la normativa: `IFC`, `ISO 19650`, `LOD 300`, `BEP`
- Se muestra como tooltip al hover sobre el badge de regla existente (no añade elemento nuevo a la fila — no quiebra el layout actual)
- Color del badge: neutro/gris para no confundir con el badge de severidad

**Implementación:**
- `RULE_METADATA[issue.ruleId].standard` → texto del tooltip/badge
- El `RuleBadge` existente añade un `title` HTML al elemento `<span>` o se envuelve en un `Tooltip` de Radix UI (`@radix-ui/react-tooltip` ya está en el proyecto)

**Cambios en stores:** Ninguno.

**Cambios en worker:** Ninguno.

---

### 5.4 Certificado de validación exportable

**Componente:** Nuevo handler `handleExportCertificate` en `ValidationPanel.tsx`; nuevo botón en el menú Export ▾

**Comportamiento:**
- Genera un JSON o Markdown con:
  - Timestamp de la validación
  - Nombre del modelo y modelId
  - Perfil usado (nombre + lista de reglas activas)
  - Resumen de cobertura por categoría
  - Stats: total issues, errores, warnings, info
  - Lista completa de issues con: ruleId, severidad, elementName, message, normativa
  - Firma: `{ generatedBy: 'IFC Validator Online', version: '...' }`
- El export JSON ya existe como base (`handleExportJson`); el certificado es una versión enriquecida con metadata de perfil

**Nuevos tipos en `src/types/index.ts`:**
```typescript
export interface ValidationCertificate {
  timestamp: string                  // ISO 8601
  modelFileName: string
  modelId: string | null
  profileUsed: {
    id: string
    name: string
    rulesActive: string[]
  }
  coverageSummary: {
    categoriesChecked: ValidationCategoryType[]
    categoriesUnchecked: ValidationCategoryType[]
  }
  stats: ValidationResult['stats']
  issues: ValidationIssue[]
  generatedBy: string
  durationMs: number
}
```

**Cambios en worker:** Ninguno.

---

### 5.5 Perfiles personalizados (opcional — Sprint V4)

**Componente:** Modal `CustomProfileModal.tsx` accesible desde un botón "Personalizar" en el selector de perfil

**Comportamiento:**
- Lista todas las reglas con toggle on/off, agrupadas por categoría
- Campo de texto "Nombre del perfil"
- Botón "Guardar" → persiste en `localStorage` como array de `CustomValidationProfile`
- Los perfiles guardados aparecen junto a los 5 predefinidos en el selector
- Límite: 5 perfiles personalizados (previene localStorage overflow)

**Cambios en stores:**
```typescript
// validationStore.ts — nuevos campos:
customProfiles: ValidationProfile[]
addCustomProfile: (profile: ValidationProfile) => void
removeCustomProfile: (profileId: string) => void
```

**Persistencia:** `usePersistedPreferences.ts` — extender para persistir `customProfiles` y `activeProfileId` en localStorage.

**Cambios en worker:** Ninguno.

---

## Roadmap de sprints (Bloque 6)

Los sprints V1–V4 son sprints del **validator track**, paralelos al roadmap principal del producto (Sprints 9–12). Cada sprint es auto-contenido y ejecutable por un agente Claude Code sin contexto de sprints anteriores, siempre que lea `CONTEXT.md`, `ARCHITECTURE.md`, `DECISIONS.md` y este documento.

---

### Sprint V1 — Foundation: Tipos, RuleMetadata y Perfiles predefinidos

**Objetivo:** Establecer toda la infraestructura de tipos y el selector de perfil en la UI. Sin nuevas reglas de validación todavía — solo la arquitectura que habilita los sprints siguientes.

**Archivos a crear:**
- Ninguno (todo va en archivos existentes)

**Archivos a modificar:**
- `src/types/index.ts` — añadir tipos nuevos
- `src/stores/validationStore.ts` — añadir `activeProfileId`, `setActiveProfile`
- `src/components/ValidationPanel.tsx` — añadir selector de perfil en el header del panel

**Nuevos tipos en `src/types/index.ts`:**
```typescript
export type ValidationCategoryType =
  'schema' | 'spatial' | 'quality' | 'lod' | 'iso19650' | 'classification' | 'mep' | 'clash'

export interface RuleMetadata {
  id: string
  label: string
  description: string
  category: ValidationCategoryType
  standard: string
  defaultSeverity: 'error' | 'warning' | 'info'
  autoFixable: boolean
}

export const RULE_METADATA: Record<string, RuleMetadata>
// Tabla completa de las 18 reglas actuales + reglas nuevas futuras

export interface ValidationProfile {
  id: string
  name: string
  description: string
  icon: string
  rules: RulesConfig
  coverageTypes: ValidationCategoryType[]
}

export const VALIDATION_PROFILES: readonly ValidationProfile[]
// Los 5 perfiles predefinidos descritos en Bloque 3
```

**Nuevas reglas al worker:** Ninguna en este sprint.

**Cambios en `validationStore.ts`:**
```typescript
activeProfileId: string | null           // null = sin perfil seleccionado
setActiveProfile: (id: string | null) => void
// setActiveProfile también llama a setRules(profile.rules) internamente
```

**Cambios en `ValidationPanel.tsx`:**
- Nuevo bloque de UI sobre el toolbar de filtros: selector de perfil compacto (radio pills o dropdown)
- Cuando se selecciona un perfil, se llama `setActiveProfile` y se muestra el nombre del perfil activo
- Chip "Personalizado" cuando `activeProfileId === null` y `rules !== DEFAULT_RULES`

**Criterio de "done":**
- Los 5 perfiles predefinidos aparecen en el UI y son seleccionables
- Seleccionar un perfil cambia el `RulesConfig` activo y se puede verificar en Zustand devtools
- Correr validación con cada perfil activa las reglas correctas (verificable vía DevTools o test)
- No se ha modificado `validator.worker.ts`
- TypeScript strict compila sin errores

**Dependencias:** Ninguna (sprint inicial).

---

### Sprint V2 — Cobertura, badge de normativa y certificado

**Objetivo:** Dar al usuario feedback claro de qué se ha comprobado, qué no, y generar un certificado exportable. No añade reglas nuevas.

**Archivos a crear:**
- `src/components/ValidationCoverageSummary.tsx`

**Archivos a modificar:**
- `src/components/ValidationPanel.tsx` — badge de normativa en issues, menú Export ampliado, integrar `ValidationCoverageSummary`
- `src/types/index.ts` — añadir `ValidationCertificate`
- `src/lib/diffStore.ts` — añadir `exportAsCertificate(result, profile, modelFileName)` helper (genera JSON y llama a `downloadBlob`)

**Nuevos tipos en `src/types/index.ts`:**
```typescript
export interface ValidationCertificate {
  timestamp: string
  modelFileName: string
  modelId: string | null
  profileUsed: { id: string; name: string; rulesActive: string[] }
  coverageSummary: {
    categoriesChecked: ValidationCategoryType[]
    categoriesUnchecked: ValidationCategoryType[]
    rulesRun: string[]
  }
  stats: ValidationResult['stats']
  issues: ValidationIssue[]
  generatedBy: string
  appVersion: string
  durationMs: number
}
```

**Nuevas reglas al worker:** Ninguna.

**Cambios en stores:** Ninguno (usa datos existentes de `validationStore`).

**Cambios en `ValidationPanel.tsx`:**
- `RuleBadge` añade tooltip con `RULE_METADATA[ruleId].standard` usando `@radix-ui/react-tooltip`
- Menú Export ▾ añade: "Certificado JSON"
- Después de cada run exitoso, renderiza `<ValidationCoverageSummary>` con `auto-dismiss` a los 4s

**`ValidationCoverageSummary.tsx`:**
```
┌─────────────────────────────────────────────────────┐
│ ✓ Se han comprobado 3 de 8 categorías               │
│  ██████████░░░░░░░░░░░░░░  37%                      │
│                                                     │
│  Sin comprobar: LOD/LOIN · ISO 19650 · Clasificación│
│  Activa el perfil [ISO 19650] para cubrirlos        │
└─────────────────────────────────────────────────────┘
```

**Criterio de "done":**
- Cada issue muestra en tooltip la normativa de la regla
- El menú Export ▾ genera un certificado JSON descargable con todos los campos
- El resumen de cobertura aparece después de cada run y se puede descartar
- TypeScript strict compila sin errores

**Dependencias:** Sprint V1 (necesita `RULE_METADATA`, `ValidationProfile`, `activeProfileId`).

---

### Sprint V3 — Nuevas reglas Batch 1 (T1, T2, T3, T5 básico)

**Objetivo:** Implementar las 10 nuevas reglas de complejidad baja/media que cubren los gaps más evidentes: schema, estructura espacial, calidad de datos e ISO 19650 básico. Solo se modifica `validator.worker.ts` y `src/types/index.ts` (`RulesConfig`).

**Archivos a crear:** Ninguno.

**Archivos a modificar:**
- `src/workers/validator.worker.ts` — añadir 10 funciones de regla + integrarlas en `handleValidate`
- `src/types/index.ts` — añadir 10 nuevos campos opcionales a `RulesConfig` + actualizar `DEFAULT_RULES` + actualizar `RULE_METADATA`
- `src/lib/worker-schemas.ts` — ningún cambio necesario (los mensajes son los mismos; las reglas son solo funciones internas del worker)

**Nuevas reglas implementadas (en orden de complejidad):**

| # | ID | Función interna |
|---|---|---|
| 1 | `RULE_MISSING_PROJECT` | `ruleMissingProject(api, modelId)` |
| 2 | `RULE_MISSING_BUILDING` | `ruleMissingBuilding(api, modelId)` |
| 3 | `RULE_MISSING_STOREY` | `ruleMissingStorey(api, modelId, idx)` |
| 4 | `RULE_EMPTY_STOREY` | `ruleEmptyStorey(api, modelId, idx)` |
| 5 | `RULE_FILE_DESCRIPTION_MISSING` | `ruleFileDescriptionMissing(buffer)` |
| 6 | `RULE_FILE_AUTHOR_MISSING` | `ruleFileAuthorMissing(buffer)` |
| 7 | `RULE_PROJECT_LONGNAME_MISSING` | `ruleProjectLongNameMissing(api, modelId)` |
| 8 | `RULE_STOREY_ELEVATION_MISSING` | `ruleStoreyElevationMissing(api, modelId, idx)` |
| 9 | `RULE_ISO19650_PROJECT_INFO` | `ruleIso19650ProjectInfo(api, modelId)` |
| 10 | `RULE_ISO19650_AUTHOR_INFO` | `ruleIso19650AuthorInfo(buffer)` |

**Actualización `RulesConfig`:** Añadir campos opcionales para cada nueva regla. `DEFAULT_RULES` las incluye todas como `false` por defecto excepto `RULE_MISSING_PROJECT` (que va `true`).

**Actualización `VALIDATION_PROFILES`:** Los perfiles predefinidos del Sprint V1 que referencien estas reglas comienzan a activarlas.

**Nota de invariants:** Las funciones de regla deben ser **puras** (sin side effects), según la constraint del Sprint 3 del roadmap. Las reglas `buffer`-based (`ruleFileDescriptionMissing`, `ruleFileAuthorMissing`) reciben el buffer como ya hace `ruleInvalidIfcVersion`.

**Nuevos tipos en `src/types/index.ts`:**
```typescript
// Solo añadir campos a RulesConfig existente:
RULE_MISSING_PROJECT?: boolean
RULE_MISSING_BUILDING?: boolean
RULE_MISSING_STOREY?: boolean
RULE_EMPTY_STOREY?: boolean
RULE_FILE_DESCRIPTION_MISSING?: boolean
RULE_FILE_AUTHOR_MISSING?: boolean
RULE_PROJECT_LONGNAME_MISSING?: boolean
RULE_STOREY_ELEVATION_MISSING?: boolean
RULE_ISO19650_PROJECT_INFO?: boolean
RULE_ISO19650_AUTHOR_INFO?: boolean
```

**Criterio de "done":**
- Las 10 nuevas reglas se ejecutan sin errores en un modelo IFC real
- Cada regla emite issues con el `ruleId` correcto y los campos `ValidationIssue` completos
- Los perfiles de Sprint V1 que incluyen estas reglas ahora las activan correctamente
- Worker compila bajo TypeScript strict
- Al ejecutar con `RULE_MISSING_PROJECT: true` en un modelo sin IfcProject, se emite exactamente 1 issue de severidad `error`

**Dependencias:** Sprint V1 (para `RulesConfig` types). Sprint V2 no es dependencia directa (puede ejecutarse en paralelo con V2).

---

### Sprint V4 — Nuevas reglas Batch 2 (T4 LOD, T6 Clasificación, T7 MEP) + Perfiles personalizados

**Objetivo:** Implementar las reglas de media/alta complejidad que cubren LOD/LOIN, clasificación y MEP. Añadir la funcionalidad de perfiles personalizados con persistencia en localStorage.

**Archivos a crear:**
- `src/components/CustomProfileModal.tsx`

**Archivos a modificar:**
- `src/workers/validator.worker.ts` — nuevas reglas de LOD, clasificación, MEP
- `src/types/index.ts` — nuevos campos `RulesConfig` + type `LOD_LEVEL`, `CLASSIFICATION_SYSTEMS`
- `src/stores/validationStore.ts` — `customProfiles`, `addCustomProfile`, `removeCustomProfile`
- `src/hooks/usePersistedPreferences.ts` — persistir `customProfiles` y `activeProfileId`
- `src/components/ValidationPanel.tsx` — botón "Personalizar" junto al selector de perfil

**Nuevas reglas implementadas:**

| # | ID | Complejidad | Nota |
|---|---|---|---|
| 1 | `RULE_MISSING_CLASSIFICATION` | Media | Usa `IFCRELASSOCIATESCLASSIFICATION` |
| 2 | `RULE_LOD_PSET_MISSING` | Media | Requiere mapa interno `LOD_REQUIRED_PSETS` por nivel |
| 3 | `RULE_LOD_QUANTITY_MISSING` | Media | Reutiliza lógica de `handleComputeTakeoff` |
| 4 | `RULE_MEP_SYSTEM_MISSING` | Media | Usa `IFCRELASSIGNSTOGROUP` |
| 5 | `RULE_CLASH_MEP_STRUCTURAL` | Media | Variante de `ruleElementClash` con grupos separados |
| 6 | `RULE_LOD_MATERIAL_LAYER_MISSING` | Alta | Navega `IfcMaterialLayerSetUsage` |

**Nuevos tipos en `src/types/index.ts`:**
```typescript
export type LodLevel = 100 | 200 | 300 | 350 | 400

// Añadir a RulesConfig:
RULE_MISSING_CLASSIFICATION?: boolean
RULE_LOD_PSET_MISSING?: boolean
RULE_LOD_QUANTITY_MISSING?: boolean
RULE_LOD_MATERIAL_LAYER_MISSING?: boolean
RULE_MEP_SYSTEM_MISSING?: boolean
RULE_CLASH_MEP_STRUCTURAL?: boolean
lodLevel?: LodLevel          // nivel LOD activo para reglas T4; default 300
classificationSystems?: string[]   // sistemas reconocidos para T6
```

**Cambios en `validationStore.ts`:**
```typescript
customProfiles: ValidationProfile[]
addCustomProfile: (profile: Omit<ValidationProfile, 'id'>) => void
removeCustomProfile: (profileId: string) => void
```

**`CustomProfileModal.tsx`:**
- Radix UI `Dialog` (ya en el proyecto)
- Lista de todas las reglas agrupadas por `ValidationCategoryType` con `Switch` de Radix
- Campo nombre + botón Guardar
- Máximo 5 perfiles personalizados (con mensaje de error si se supera)

**Criterio de "done":**
- Las 6 nuevas reglas se ejecutan sin errores
- Los perfiles LOD 300 y Coordinación BIM ahora activan `RULE_MISSING_CLASSIFICATION` y `RULE_CLASH_MEP_STRUCTURAL` correctamente
- Los perfiles personalizados se crean, persisten en localStorage y se recuperan en la siguiente sesión
- `usePersistedPreferences.ts` persistidos: `activeProfileId`, `customProfiles`
- TypeScript strict sin errores

**Dependencias:** Sprint V1 (para `ValidationProfile` types), Sprint V3 (para RulesConfig completo).

---

## Consideraciones adicionales (Bloque 7)

### 7.1 Reglas mal categorizadas o con severidad a revisar

**`RULE_MISSING_TYPE` (severidad actual: `info`):**
- Actualmente `info` pero debería ser `warning`. Un elemento sin tipo IFC impide la clasificación por familia en Revit/ArchiCAD y la generación de schedules. Impacto real > `info`.
- **Propuesta:** cambiar a `warning`.

**`RULE_MISSING_MATERIAL` (activa por defecto: `false`):**
- Debería estar activa por defecto (`true`) dado que es una check de LOD 200+ y afecta a render, análisis estructural y presupuesto.
- **Propuesta:** activar en `DEFAULT_RULES` y en los perfiles "Revisión de calidad" y "LOD 300".

**`RULE_ELEMENT_IN_BUILDING` (severidad actual: `warning`):**
- Debería ser `error`. Un elemento directamente en `IfcBuilding` sin pasar por un Storey no aparece en las vistas de planta y rompe la generación de planos 2D de `OBCF.Plans` (Sprint 8).
- **Propuesta:** cambiar a `error`.

**`RULE_EMPTY_LONGNAME` (aplica solo a `IfcSpace`):**
- Debería extenderse también a `IfcBuildingStorey` y `IfcBuilding` que tampoco tienen LongName. El nombre largo de una planta es información importante (ej. "Planta Primera", "Ground Floor").
- **Propuesta:** ampliar la regla a `IFCBUILDINGSTOREY` e `IFCBUILDING` con severidad `info`.

**`RULE_NAMING_CONVENTION` (activa por defecto: `false`):**
- Correcto que esté `false` por defecto — requiere configuración de patrones específicos del BEP del proyecto. No cambiar.

### 7.2 Score de calidad del modelo (0–100)

**Recomendación: Sí, implementarlo.**

**Por qué es valioso:** Un número único da al usuario información procesable inmediata ("tu modelo está al 73%") y es compartible con el cliente. La lista de issues abruma a usuarios no técnicos; el score sintetiza.

**Fórmula propuesta:**

```
score = 100 - Σ(issue.weight)
clampado entre 0 y 100
```

Pesos sugeridos por severidad y categoría:

| Severidad | Categoría | Peso por issue |
|---|---|---|
| `error` | Integridad | 5 puntos |
| `error` | Estructura espacial | 4 puntos |
| `error` | Calidad de datos | 3 puntos |
| `warning` | cualquiera | 1 punto |
| `info` | cualquiera | 0.2 puntos |

El score se incluye en `ValidationResult`:
```typescript
export interface ValidationResult {
  issues: ValidationIssue[]
  stats: { total, errors, warnings, info, byRule }
  durationMs: number
  qualityScore?: number   // 0-100, calculado en el worker
}
```

La lógica de cálculo es pura (sin side effects) y puede correr al final de `handleValidate` antes de emitir el mensaje `done`. No requiere cambios en la arquitectura del worker.

**Dónde mostrarlo:** En el header del `ValidationPanel` y en `ModelInfoPanel.tsx` (badge de salud junto a file size y element count).

### 7.3 Internacionalización de las descripciones de reglas

**Estrategia recomendada: Externalizar a un objeto de traducciones en `src/types/index.ts`, sin i18n framework.**

La arquitectura actual no tiene ninguna capa i18n. Añadir `react-i18next` o similar es una decisión arquitectónica grande que afectaría toda la app, no solo el validador.

**Propuesta minimalista:**
1. `RULE_METADATA` incluye `label` y `description` en inglés (idioma base).
2. En `src/types/index.ts` se define un `RULE_TRANSLATIONS` opcional por locale:
```typescript
export type SupportedLocale = 'en' | 'es' | 'de' | 'fr' | 'pt'

export const RULE_TRANSLATIONS: Partial<Record<SupportedLocale, Record<string, { label: string; description: string }>>>
```
3. `ValidationPanel.tsx` lee el locale de `navigator.language` y busca en `RULE_TRANSLATIONS`. Si no hay traducción, cae al inglés.
4. Los mensajes de issue generados en el worker **no se traducen en el worker** (invariant: el worker es puro y no accede a UI state). Si se quieren los mensajes en otro idioma, sería necesario un post-procesador en `validator.ts` que mapee `issue.ruleId → translated message` antes de almacenar en el store.

**Constraint a verificar:** Esto no rompe ninguna de las decisiones D-01 a D-20 porque no modifica los workers ni el bus de eventos.

### 7.4 Métricas de uso client-side

**Estrategia: `localStorage` como store de telemetría client-side.**

Sin servidor, las métricas solo pueden existir en la sesión del usuario. Sirven para que el usuario vea sus propios patrones, no para analytics centralizados.

**Implementación propuesta:**

```typescript
// src/lib/validation-analytics.ts (nuevo archivo, < 50 líneas)

export interface ValidationRunRecord {
  timestamp: number
  profileId: string
  rulesRun: string[]
  durationMs: number
  issuesByRule: Record<string, number>
  qualityScore: number
  modelFileName: string
}

const ANALYTICS_KEY = 'ifc-validator-runs'
const MAX_RECORDS = 50

export function recordValidationRun(run: ValidationRunRecord): void {
  const stored = loadRuns()
  stored.push(run)
  if (stored.length > MAX_RECORDS) stored.shift()
  localStorage.setItem(ANALYTICS_KEY, JSON.stringify(stored))
}

export function loadRuns(): ValidationRunRecord[] {
  try {
    return JSON.parse(localStorage.getItem(ANALYTICS_KEY) ?? '[]')
  } catch { return [] }
}

export function getMostUsedRules(): string[] {
  const runs = loadRuns()
  const counts: Record<string, number> = {}
  for (const run of runs) {
    for (const rule of run.rulesRun) {
      counts[rule] = (counts[rule] ?? 0) + 1
    }
  }
  return Object.entries(counts).sort(([,a], [,b]) => b - a).slice(0, 5).map(([k]) => k)
}
```

`recordValidationRun` se llama desde `validator.ts` en el handler del mensaje `done`, pasando los datos del `ValidationResult` y el perfil activo.

**Métricas más útiles a trackear:**
1. Qué reglas se activan con más frecuencia (indica qué perfiles son populares)
2. Qué reglas generan más issues por run (indica problemas frecuentes en los modelos de los usuarios)
3. Duración media de validación (para optimizar reglas lentas)
4. Score medio por perfil (para detectar si los perfiles son demasiado estrictos o permisivos)

Esta información puede exponerse en una pequeña sección "Historial" del ValidationPanel en sprint futuro.

---

### Constraints y posibles conflictos detectados durante el planning

**Constraint activo (Invariant 4):** _"All IFC validation runs in `src/workers/validator.worker.ts`. Main thread only receives results via the Zustand store."_

→ Todas las nuevas funciones de regla deben vivir en `validator.worker.ts`. La metadata de reglas (`RULE_METADATA`) y los perfiles (`VALIDATION_PROFILES`) son datos puros (no contienen lógica de worker) y pueden vivir en `src/types/index.ts`. No hay conflicto.

**Constraint activo (D-13, AppEventMap):** Cualquier nuevo evento que se añada al bus (ej. `validation:profile-changed`) requiere declaración previa en `AppEventMap` en `src/types/index.ts`. El selector de perfil no necesita un evento de bus — solo modifica el store.

**Posible conflicto con Sprint 9 (BCF):** El Sprint 9 del roadmap principal añade un tab "BCF" al `ValidationPanel`. Los cambios de Sprint V1 (selector de perfil) y Sprint V2 (coverage summary) añaden elementos en la misma zona del panel. Deben coordinarse para no chocar con el layout del BCF tab. Solución: la coverage summary va encima del toolbar de filtros (entre el selector de perfil y las tabs de severidad), dejando las tabs BCF/Issues sin conflicto.

**Posible conflicto de bundle size:** Añadir `RULE_METADATA` con descripciones largas en `src/types/index.ts` aumenta el bundle del chunk `index-*.js`. Estimado < 5 KB gzipped para 30 reglas — aceptable. Si crece, mover a un lazy import.

**No conflicto — TypeScript strict:** Todos los nuevos campos de `RulesConfig` son opcionales (`?: boolean`). El operador `rules.RULE_NEW_NAME` en el worker usa `if (rules.RULE_NEW_NAME)` — undefined es falsy, por lo que las nuevas reglas están off by default sin cambiar la interfaz existente.

---

*Planning completado — 2026-05-20*
*Agente: Claude Sonnet 4.6*
*Archivos leídos: CONTEXT.md, ARCHITECTURE.md, DECISIONS.md, ROADMAP.md, src/workers/validator.worker.ts, src/lib/validator.ts, src/stores/validationStore.ts, src/components/ValidationPanel.tsx, src/types/index.ts*
