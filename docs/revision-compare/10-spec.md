# 10 — Especificación: Revision Compare

Estado: borrador para la Puerta 2 (2026-11-13). Base de código: **`main`** (no `feat/urban-3d-vertical-infrastructure`, que va 1165 commits por detrás). Las rutas `main:` se han leído con `git show main:<ruta>`.

## 1. Problema y persona

- **Persona:** ingeniero o jefe de obra de una constructora. Hipótesis: Tailandia, prefabricado (SUPUESTO). No es BIM manager.
- **Dolor:** recibe revisiones sin los cambios marcados, sin nubes ni deltas. Si se le escapa uno, se construye con la versión vieja y aparecen conflictos en obra (cita literal en `00-plan.md`).
- **Formato de las revisiones:** sin confirmar (IFC, PDF/DWG o ambos). El correo de `05-ux.md` lo pregunta. **El MVP es IFC** porque el motor ya existe. El 2D tiene base en `main` (PDF/DXF) y se amplía en V3.
- **Hallazgos que cambian el planteamiento:**
  - La comparación por GlobalId ya está construida (`01-inventario.md`).
  - El GlobalId no es fiable en todas las herramientas (`02-dominio.md`).
  - Ningún competidor es gratis, local y en el navegador a la vez (`03-competencia.md`).
  - La lista de cambios es más importante que el 3D (`05-ux.md`).

## 2. Lo que ya existe en `main` (no se reescribe)

| Pieza | Evidencia |
|---|---|
| Tipos `SnapElement`, `ModelSnapshot`, `SetDiff`, `ElementDiff`, `DiffOptions`, con 10 `ChangeCategory` | `main:src/lib/compare/types.ts` |
| Diff por GlobalId sobre conjuntos de ficheros | `main:src/lib/compare/model-diff.ts:131` (`diffSnapshotSets`), `:64` (`diffElement`) |
| Tolerancia de movimiento: 1 mm por defecto | `main:src/lib/compare/model-diff.ts:69` |
| Huella geométrica: hash FNV de tamaños de teselación + colocación, y centroide `c` | `main:src/lib/compare/snapshot.ts:85-113` |
| Emparejar ficheros por proyecto, solape de GUID y nombre | `main:src/lib/compare/pairing.ts:46` |
| Snapshot en worker, con concurrencia | `main:src/lib/compare/snapshot-runner.ts:17,60` |
| Overlay 3D | `main:src/lib/compare/overlay.ts:34` |
| Exportación CSV, JSON y HTML | `main:src/lib/compare/report.ts:16,31,50` |
| Línea base (baseline) en IndexedDB, IDS entre versiones, BCF | `main:src/lib/compare/{baseline-store,ids-versions,bcf-sync}.ts` |
| UI con pestañas Cambios, IDS, BCF e Historial | `main:src/components/compare/*`, `main:src/components/CompareModal.tsx` |
| Diff de láminas 2D segmento a segmento, tolerancia 0,005 | `main:src/lib/drawing/diff.ts:40` |

**Carencias frente a la necesidad** (fuentes: 01, 03, 04 y 05):

1. No hay emparejamiento sin GlobalId.
2. Un cambio de forma y un ruido de teselado dan el mismo resultado: la huella `h` cambia en ambos casos.
3. No se detecta un desplazamiento global del origen del modelo.
4. `modified` no distingue entre movido, cambiado de forma y solo propiedades.
5. No hay deltas legibles para obra, como «Moved 120 mm E» o «Δvol».
6. Faltan filtros por planta, disciplina, categoría y marca, estados de revisión, tabla A/B, vista dividida o deslizador, PDF/XLSX y BCF por cambio.
7. El overlay comparte canal con validación e IDS, y son excluyentes entre sí (`viewer.ts:821`).

## 3. Motor de diff

### 3.1 Pipeline (Web Worker, todo local)

```
bytes A/B ─► snapshot (worker, ya existe) ─► normalizar ─► emparejar por capas ─► clasificar ─► RevisionDiff (serializable)
```

**Paso de normalización (nuevo, `src/lib/compare/normalize.ts`):**
- Unidades a metros. El snapshot ya lee en metros; hay que verificarlo con un fixture en mm.
- Esquema: la clase se compara por su supertipo canónico (`IfcWallStandardCase` → `IfcWall`, `*StandardCase` → base), según `02-dominio.md`.
- Origen global: se busca la traslación más votada entre los pares unidos por GlobalId (mediana de Δc). Se considera cambio global si ≥60 % de los pares comparten esa Δ dentro de la tolerancia. En ese caso se resta antes de clasificar y se emite `originShift`.
- Ruido de Psets del exportador: hay una lista `ignorePsets` por defecto (fechas, IDs internos de Revit y Archicad). Es extensible.

### 3.2 Emparejamiento por capas

Cada pareja lleva `method` y `confidence`.

| Capa | Regla | Confidence |
|---|---|---|
| 1 `guid` | GlobalId igual y único en ambos lados | 1,0 |
| 2 `tag` | Misma clase canónica + `Tag` o marca igual y única (Pset del fabricante configurable, p. ej. `Pset_*.Mark`) | 0,95 |
| 3 `geometry` | Misma clase canónica + centroide a ≤ `matchRadius` (por defecto 0,25 m, tras corregir el origen) + AABB con IoU ≥ 0,8 + firma de propiedades | Ponderado: 0,5·IoU + 0,3·proximidad + 0,2·props; se acepta si ≥ 0,6 |
| 4 `split/merge` | Sin pareja y con solape volumétrico (AABB) entre 1 elemento y N, con cobertura ≥ 0,85 | Cobertura × 0,9 |

- Las capas 2 a 4 solo se aplican a lo que quedó sin pareja en la anterior. La asignación es voraz por confidence descendente.
- Si la capa 1 empareja menos del 30 % de los elementos de dos ficheros que son el mismo modelo según `pairing.ts`, se marca `guidRegenerated: true` y la UI avisa: «El proyectista ha regenerado los IDs; emparejado por posición».

### 3.3 Clasificación

Un elemento puede tener varios tipos de cambio a la vez. La propiedad `kind` es el principal, por este orden de prioridad:

`removed > added > type_changed > reshaped > moved > relations_changed > properties_changed > unchanged`

- **reshaped:** cambia el AABB en tamaño o el volumen más allá de las tolerancias. **Nuevo:** el snapshot guarda `size` (dimensiones del AABB) y `vol` (volumen de la malla). Así, que solo cambie el hash `h` sin que cambien `size` ni `vol` deja de contar como cambio y se queda en `noise`, lo que elimina el falso positivo por teselado.
- **moved:** |Δc| > `moveTolerance` después de corregir el origen, sin reshape. Se reporta el vector y la dirección cardinal en planta.
- **type_changed:** cambia la clase canónica o el PredefinedType o el tipo (IfcType).
- **relations_changed:** cambia `container`, el fichero, la agregación o los huecos.
- **properties_changed:** cambia una propiedad, un atributo, el material, la clasificación o el nombre. Reutiliza `FieldChange`.

### 3.4 Tolerancias (`DiffOptions` ampliado)

| Opción | Por defecto | Justificación |
|---|---|---|
| `moveTolerance` | 0,005 m (sube desde 0,001) | El prefabricado tolera ± 5 mm (SUPUESTO, a validar con el usuario). Es editable en la UI. |
| `sizeTolerance` | 0,005 m por eje | Igual que el anterior |
| `volumeTolerance` | 1 % relativo | Absorbe el ruido de teselado |
| `angleTolerance` | 0,5° | Detecta rotaciones (se hace en V2: requiere guardar la orientación) |
| `numericTolerance` | 1e-6 (ya existe) | — |
| `matchRadius` | 0,25 m | Capa 3 |

La decisión sobre la tolerancia de `03-competencia.md` (Navisworks usa 0 por defecto) se resuelve así: el valor por defecto es 5 mm, se muestra al usuario y se puede editar.

### 3.5 Contrato de tipos (nuevo `src/lib/compare/revision-types.ts`, solo añadidos)

```ts
import type { ElementDiff, SetDiff, DiffOptions } from './types'

export type MatchMethod = 'guid' | 'tag' | 'geometry' | 'split' | 'merge' | 'none'
export type ChangeKind =
  | 'added' | 'removed' | 'moved' | 'reshaped' | 'type_changed'
  | 'properties_changed' | 'relations_changed' | 'unchanged'

export interface GeoDelta {
  /** metres, after origin correction */
  move?: [number, number, number]
  moveDistance?: number
  /** 'N'|'NE'|…|'up'|'down' — for site wording */
  direction?: string
  sizeBefore?: [number, number, number]
  sizeAfter?: [number, number, number]
  volumeBefore?: number
  volumeAfter?: number
  rotationDeg?: number
}

export interface RevisionChange extends ElementDiff {
  kind: ChangeKind
  kinds: ChangeKind[]
  match: { method: MatchMethod; confidence: number; baseGlobalIds: string[]; headGlobalIds: string[] }
  delta?: GeoDelta
  /** short, localisable site sentence key + params, e.g. moved_mm {mm:120, dir:'E'} */
  summary: { key: string; params: Record<string, string | number> }
  /** user-set; persisted locally, never uploaded */
  review?: 'pending' | 'reviewed' | 'affects_site'
}

export interface RevisionDiff extends Omit<SetDiff, 'elements'> {
  version: 1
  options: Required<RevisionOptions>
  originShift: [number, number, number] | null
  guidRegenerated: boolean
  byKind: Record<ChangeKind, number>
  changes: RevisionChange[]
}

export interface RevisionOptions extends DiffOptions {
  sizeTolerance?: number
  volumeTolerance?: number
  angleTolerance?: number
  matchRadius?: number
  /** Pset.Property names treated as piece marks (layer 2 + filter) */
  markProperties?: string[]
}

export function diffRevisions(base: ModelSnapshot[], head: ModelSnapshot[], opts?: RevisionOptions): RevisionDiff
```

`diffSnapshotSets` se mantiene; `diffRevisions` lo envuelve. La UI actual sigue funcionando.

## 4. Funcionalidades por fase

### MVP (lo que se envía al usuario)

| # | Función | Criterio de aceptación |
|---|---|---|
| M1 | `diffRevisions` con capas 1 y 2, clasificación por `kind`, normalización de clases, corrección de origen, `size`/`vol` en el snapshot | Fixtures F1–F8 (§6) con precisión y recall = 1,0 por `kind`. Con ruido de teselado da 0 cambios. Con origen desplazado 10 m da 0 `moved` y `originShift` ≈ [10,0,0] ± 1 mm |
| M2 | Vista 3D coloreada: verde añadido, rojo eliminado (fantasma de la posición de A), azul movido con flecha, naranja forma, violeta propiedades, resto en gris translúcido; icono y letra en cada uno | Al pinchar un cambio en la lista se encuadra el elemento en < 300 ms. Colores según `05-ux.md` |
| M3 | Lista navegable: orden por impacto, filtros por planta, disciplina (fichero), `kind`, clase y marca; estados pendiente/revisado/afecta a obra guardados en IndexedDB; contador «42 cambios · 12 revisados»; atajos J/K/R/F | Recorrer todos los cambios solo con el teclado. Los estados sobreviven a una recarga |
| M4 | Tabla antes/después por cambio con la frase de obra («Movido 120 mm E», «Altura 3000 → 3200 mm») ×10 idiomas | Cada `kind` tiene una frase en los 10 packs, con guard de i18n en verde |
| M5 | Panel de tolerancias editable que recalcula sin volver a leer los ficheros | Cambiar de 5 a 1 mm recalcula en < 2 s con el fixture de 67 MB |
| M6 | Flujo en 3 clics: soltar A, soltar B, ver cambios; arranca solo; aviso visible de «procesado en tu navegador» | Prueba e2e: con dos ficheros soltados, la lista está visible sin más clics |
| M7 | Aviso `guidRegenerated` | Con el fixture F9 aparece el aviso |

### V2

| # | Función | Criterio |
|---|---|---|
| V2.1 | Capa 3 (geometría) y capa 4 (división/fusión) | F9–F11: recall ≥ 0,95 y precisión ≥ 0,95 en `moved`/`reshaped`; división 1→2 detectada como `split` |
| V2.2 | Informe PDF y XLSX («nubes de revisión automáticas»): portada, resumen por tipo y planta, una ficha por cambio con captura y tabla A/B. Reutiliza el escritor XLSX de COBie | El PDF de F8 lista los cambios esperados con su captura. El XLSX abre en Excel y en LibreOffice |
| V2.3 | BCF 3.0, un topic por cambio con viewpoint y componentes por GUID. Amplía `bcf-sync.ts` | Se importa en BIMcollab Zoom o Solibri sin errores (verificación manual documentada) |
| V2.4 | Vista dividida con cámara sincronizada y deslizador/cortina A/B | 30 FPS o más con el fixture de 67 MB en un portátil de referencia |
| V2.5 | Rotación (`angleTolerance`) | Fixture F12 |

### V3

| # | Función | Criterio |
|---|---|---|
| V3.1 | Diff de PDF 2D: superposición con alineación automática (registro afín por esquinas del cajetín o RANSAC sobre segmentos), diferencias en rojo y verde. Amplía `main:src/lib/drawing/diff.ts` | Fixture 2D: A y B con distinta escala y encuadre, cambios esperados detectados; el PDF escaneado se avisa como «no vectorial» |
| V3.2 | Planta 2D generada desde el diff del IFC (`plan-cut.ts`) con los cambios marcados con nube | — |
| V3.3 | Elementos fabricados/construidos: el usuario los marca (por marca, CSV importado o selección) y los cambios que les afectan salen primero, con una etiqueta | Fixture con 3 piezas marcadas, 1 de ellas cambiada: aparece la primera con la etiqueta |
| V3.4 | DWG | Decisión abierta (licencia ODA o libredwg); por ahora va al parking lot |

**Plan (SUPUESTO, a validar con doc 12/19):**
- **Free:** M1–M7 y el CSV que ya existe, todo en el navegador. Lo que ya es gratis sigue gratis.
- **Pro:** V2.2 (informe PDF/XLSX) y V3.3, porque son herramientas nuevas de productividad (regla de la opción C).
- BCF por cambio: decisión abierta.

## 5. Presupuestos de rendimiento (objetivos a validar)

| Par | Snapshot A+B | Diff | Memoria pico | FPS con resaltado |
|---|---|---|---|---|
| 50 MB | < 25 s | < 1 s | < 1,5 GB | ≥ 45 |
| 200 MB | < 90 s | < 3 s | < 3 GB | ≥ 30 |
| 500 MB | < 4 min, solo escritorio | < 8 s | < 6 GB | ≥ 20 |

- El diff no debe volver a leer los IFC: trabaja sobre los snapshots.
- En móvil se limita a pares de hasta unos 100 MB y se avisa (SUPUESTO).
- Medir con `cras` (67 MB) y `shanghai-tower` (94 MB). Los ficheros sintéticos de 300 y 500 MB se generan fuera del repo.

## 6. Fixtures golden

Script `scripts/compare-fixtures/make.ts`: muta IFC pequeños del repo con web-ifc y escribe `tests/fixtures/revision/<caso>/{a.ifc,b.ifc,expected.json}`. `expected.json` contiene la lista `{globalIdA?, globalIdB?, kind, method}` y los contadores.

| ID | Base | Mutación | Esperado |
|---|---|---|---|
| F1 | IVO-Utility-Tunnel | Nada (reexportado) | 0 cambios |
| F2 | ídem | Mover 1 muro 120 mm en X | 1 `moved`, dirección E |
| F3 | ídem | Cambiar la altura de 1 elemento | 1 `reshaped` |
| F4 | ídem | Cambiar el valor de 1 Pset y el material | 1 `properties_changed` |
| F5 | ídem | Añadir 1 y borrar 1 | 1 `added`, 1 `removed` |
| F6 | ídem | IfcWallStandardCase → IfcWall | 0 `type_changed` |
| F7 | ídem | Desplazar todo el modelo 10 m | `originShift` y 0 `moved` |
| F8 | poblenou A/S/M | F2+F3+F4+F5 repartidos entre disciplinas | Suma de los anteriores, con `file` correcto |
| F9 | Pavilion | Regenerar todos los GlobalId + mover 1 | `guidRegenerated`, empareja por tag o geometría, 1 `moved` |
| F10 | ídem | Dividir 1 losa en 2 | 1 `split` |
| F11 | ídem | Reteselar (mismo sólido, otra malla) | 0 cambios (`noise`) |
| F12 | ídem | Girar 1 elemento 5° | 1 `moved` con rotación |
| F13 | cras + shanghai | Rendimiento | Tiempos de §5 |

Faltan fixtures 2D (PDF A/B con distinta escala) para V3: se crearán entonces.

## 7. Riesgos y decisiones abiertas

1. **Formato real del usuario (IFC o 2D):** decide si V3.1 se adelanta. Hay que enviar el correo de `05-ux.md` (requiere OK de Joel).
2. **Canal de overlay compartido** (`viewer.ts:821`): mientras se compara, validación e IDS quedan apagados. Se decide así para el MVP; mostrarlos a la vez va al parking lot.
3. **Memoria:** con 2 versiones la memoria casi se duplica. Se mitiga liberando el modelo web-ifc tras el snapshot y descargando los fragments de A cuando no está en vista dividida.
4. **La capa 3 puede emparejar mal** en elementos repetidos (pilares en rejilla). Se mitiga con el umbral, mostrando el método y la confianza en la UI y con `review` manual.
5. **`size` y `vol` en el snapshot** amplían el formato de la línea base. Las líneas base antiguas sin estos campos caen al comportamiento de hoy, por hash.
6. **Ruido de Psets por herramienta:** la lista por defecto se construye con ficheros reales y es incompleta al principio.
7. **Tolerancia de 5 mm:** SUPUESTO; hay que preguntarlo al usuario.
8. **DWG:** licencia sin revisar; se descarta del MVP.
9. **Rama de trabajo:** las tareas T1–T5 parten de `main` en worktrees propios, sin tocar `C:/repo/ifc` (rama con trabajo sin commitear).

## 8. Reparto en tareas (fase 3, tras la Puerta 2)

| Tarea | Alcance |
|---|---|
| T1 | `normalize.ts`, `revision-types.ts`, `diffRevisions` con capas 1 y 2, `size`/`vol` en el snapshot, fixtures F1–F8 y F11 |
| T2 | Capas 3 y 4, F9, F10 y F12 |
| T3 | M2–M7 en `components/compare` y V2.4 |
| T4 | V2.2 y V2.3 |
| T5 | V3.1, si el usuario confirma que trabaja con PDF |
