export type Route = 'landing' | 'viewer'
export type ViewerStyle = 'shaded' | 'blueprint' | 'xray'
export type LoadPhase = 'reading' | 'parsing' | 'uploading' | 'done'

/** Lifecycle of a single validation run */
export type ValidationStatus = 'idle' | 'running' | 'complete' | 'error' | 'cancelled'

export interface Category {
  id: string      // Uppercase IFC type, e.g. "IFCWALL"
  label: string   // Human-readable, e.g. "Walls"
  count: number
  color: number   // Hex number, e.g. 0xCDD0DC
  elementIds: number[]
}

export interface ModelInfo {
  fileName: string
  elementCount: number
  categories: Category[]
  /** Original IFC file size in bytes */
  fileSize: number
}

// ── Camera presets ────────────────────────────────────────────────────────────

export type CameraPreset = 'iso' | 'top' | 'bottom' | 'front' | 'back' | 'left' | 'right'

// ── Model transform ───────────────────────────────────────────────────────────

export interface ModelTransformVec3 { x: number; y: number; z: number }

export interface ModelTransform {
  position?: ModelTransformVec3
  /** Euler angles in degrees */
  rotation?: ModelTransformVec3
  /** Uniform scale or per-axis */
  scale?: number | ModelTransformVec3
}

// ── Multi-model scene entry ───────────────────────────────────────────────────

export interface SceneModel {
  id:           string
  fileName:     string
  fileSize:     number
  elementCount: number
  categories:   Category[]
  visible:      boolean
  transform:    ModelTransform
  loadedAt:     number
}

export interface SelectedInfo {
  id: string
  name: string
  type: string
  storey: string
  /** Which loaded model this element belongs to. Set by viewer.ts on selection. */
  modelId?: string
}

export interface ViewerHandle {
  resetCamera: () => void
  frameCategory: (id: string) => void
  setCameraViewpoint: (
    position:  { x: number; y: number; z: number },
    direction: { x: number; y: number; z: number },
  ) => void
}

// ── Loading pipeline ──────────────────────────────────────────────────────────

export interface LoadProgress {
  phase: LoadPhase
  percent: number
}

export interface MemoryStats {
  heapMB: number
  gpuEstimateMB: number
}

export interface CacheEntry {
  /** "${fileName}:${size}:${lastModified}" */
  key: string
  fileName: string
  fileSize: number
  fragmentsSize: number
  cachedAt: number
}

// ── Validation ────────────────────────────────────────────────────────────────

export interface ValidationIssue {
  id: string
  ruleId: string
  severity: 'error' | 'warning' | 'info'
  expressId: number
  /** Null for file-level issues with no associated element (e.g. schema version check) */
  globalId: string | null
  ifcClass: string
  elementName: string
  message: string
  /** Spatial path from root: ['Site A', 'Building 1', 'Level 2'] */
  path: string[]
  autoFixable: boolean
  /** Which loaded model this issue belongs to. Stamped by loader/validator, not the worker. */
  modelId?: string
}

export interface ValidationResult {
  issues: ValidationIssue[]
  stats: {
    total: number
    errors: number
    warnings: number
    info: number
    byRule: Record<string, number>
  }
  durationMs: number
  /** 0–100 quality score, calculated client-side after worker returns. Higher = fewer issues. */
  qualityScore?: number
}

export interface RulesConfig {
  // ── Naming & identity ───────────────────────────────────────────────────────
  RULE_EMPTY_NAME?: boolean
  RULE_EMPTY_LONGNAME?: boolean
  RULE_DUPLICATE_NAME?: boolean
  RULE_NAMING_CONVENTION?: boolean
  RULE_DUPLICATE_GUID?: boolean
  /** GlobalId is not a valid 22-character IFC base64 string */
  RULE_INVALID_GUID_FORMAT?: boolean

  // ── Structure & hierarchy ───────────────────────────────────────────────────
  RULE_ORPHAN_ELEMENT?: boolean
  RULE_WRONG_CONTAINER?: boolean
  RULE_BROKEN_AGGREGATE?: boolean
  /** Building/Storey/Site not correctly nested (e.g. Building directly under Project) */
  RULE_SPATIAL_HIERARCHY?: boolean
  /** A spatial element is its own ancestor — infinite loop in the tree */
  RULE_CIRCULAR_REFERENCE?: boolean
  /** Physical element directly inside IfcBuilding instead of a storey */
  RULE_ELEMENT_IN_BUILDING?: boolean

  // ── Properties & types ──────────────────────────────────────────────────────
  RULE_MISSING_TYPE?: boolean
  RULE_MISSING_PROPERTY_SET?: boolean
  /** IfcPropertySingleValue with a null or empty NominalValue */
  RULE_EMPTY_PROPERTY_VALUE?: boolean
  /** Structural/envelope element without an associated material */
  RULE_MISSING_MATERIAL?: boolean
  /** File uses IFC2X3 schema — warn if IFC4 features are expected or schema is outdated */
  RULE_INVALID_IFC_VERSION?: boolean
  /** Two solid structural elements whose bounding boxes overlap by more than 5 cm */
  RULE_ELEMENT_CLASH?: boolean

  /** Per-class regex patterns for naming convention rule, e.g. { IfcDoor: '^DR-\\d{3}$' } */
  namingConventionPatterns?: Record<string, string>
  /** Per-class required Pset names, e.g. { IfcWall: ['Pset_WallCommon'] } */
  requiredPsets?: Record<string, string[]>

  // ── Sprint V3 — Schema & spatial completeness ───────────────────────────────
  /** Model has no IfcProject entity */
  RULE_MISSING_PROJECT?: boolean
  /** Model has no IfcBuilding entity */
  RULE_MISSING_BUILDING?: boolean
  /** An IfcBuilding has no child IfcBuildingStorey */
  RULE_MISSING_STOREY?: boolean
  /** An IfcBuildingStorey has no contained elements or spaces */
  RULE_EMPTY_STOREY?: boolean
  /** IFC STEP header FILE_DESCRIPTION is missing or empty */
  RULE_FILE_DESCRIPTION_MISSING?: boolean
  /** IFC STEP header FILE_NAME author field is missing or empty */
  RULE_FILE_AUTHOR_MISSING?: boolean
  /** IfcProject has no LongName (official project name) */
  RULE_PROJECT_LONGNAME_MISSING?: boolean
  /** An IfcBuildingStorey has no Elevation defined */
  RULE_STOREY_ELEVATION_MISSING?: boolean

  // ── Sprint V3 — ISO 19650 basic ─────────────────────────────────────────────
  /** IfcProject missing ISO 19650 required fields: LongName, Description, ObjectType */
  RULE_ISO19650_PROJECT_INFO?: boolean
  /** IFC STEP header missing author / organisation for ISO 19650 traceability */
  RULE_ISO19650_AUTHOR_INFO?: boolean

  // ── Sprint V4 — LOD / LOIN ──────────────────────────────────────────────────
  /** Elements missing the minimum Psets for the declared LOD level */
  RULE_LOD_PSET_MISSING?: boolean
  /** Structural elements missing IfcElementQuantity for the declared LOD level */
  RULE_LOD_QUANTITY_MISSING?: boolean
  /** Walls/slabs missing IfcMaterialLayerSetUsage at LOD ≥ 300 */
  RULE_LOD_MATERIAL_LAYER_MISSING?: boolean
  /** Target LOD level for LOD rules (default: 300) */
  lodLevel?: LodLevel

  // ── Sprint V4 — Classification ──────────────────────────────────────────────
  /** Physical elements with no IfcRelAssociatesClassification */
  RULE_MISSING_CLASSIFICATION?: boolean
  /** Recognised classification systems for RULE_MISSING_CLASSIFICATION (default: any) */
  classificationSystems?: string[]

  // ── Sprint V4 — MEP ─────────────────────────────────────────────────────────
  /** MEP flow elements not assigned to an IfcSystem */
  RULE_MEP_SYSTEM_MISSING?: boolean
  /** MEP vs structural AABB clash (separate from RULE_ELEMENT_CLASH) */
  RULE_CLASH_MEP_STRUCTURAL?: boolean

  // ── Sprint V4 — ISO 19650 filename ──────────────────────────────────────────
  /** ISO 19650 filename convention (regex configurable via iso19650FilenamePattern) */
  RULE_ISO19650_FILENAME?: boolean
  /** Regex for ISO 19650 filename convention, e.g. '^[A-Z]{3}-[A-Z]{2}-' */
  iso19650FilenamePattern?: string
}

export const DEFAULT_RULES: RulesConfig = {
  RULE_EMPTY_NAME:           true,
  RULE_EMPTY_LONGNAME:       true,
  RULE_DUPLICATE_NAME:       true,
  RULE_NAMING_CONVENTION:    false,
  RULE_DUPLICATE_GUID:       true,
  RULE_INVALID_GUID_FORMAT:  true,
  RULE_ORPHAN_ELEMENT:       true,
  RULE_WRONG_CONTAINER:      true,
  RULE_BROKEN_AGGREGATE:     true,
  RULE_SPATIAL_HIERARCHY:    true,
  RULE_CIRCULAR_REFERENCE:   true,
  RULE_ELEMENT_IN_BUILDING:  true,
  RULE_MISSING_TYPE:         true,
  RULE_MISSING_PROPERTY_SET: false,
  RULE_EMPTY_PROPERTY_VALUE:   true,
  RULE_MISSING_MATERIAL:       true,
  RULE_INVALID_IFC_VERSION:    true,
  RULE_ELEMENT_CLASH:          false,
  // Sprint V3
  RULE_MISSING_PROJECT:           true,
  RULE_MISSING_BUILDING:          false,
  RULE_MISSING_STOREY:            false,
  RULE_EMPTY_STOREY:              false,
  RULE_FILE_DESCRIPTION_MISSING:  false,
  RULE_FILE_AUTHOR_MISSING:       false,
  RULE_PROJECT_LONGNAME_MISSING:  false,
  RULE_STOREY_ELEVATION_MISSING:  false,
  RULE_ISO19650_PROJECT_INFO:     false,
  RULE_ISO19650_AUTHOR_INFO:      false,
  // Sprint V4
  RULE_LOD_PSET_MISSING:              false,
  RULE_LOD_QUANTITY_MISSING:          false,
  RULE_LOD_MATERIAL_LAYER_MISSING:    false,
  RULE_MISSING_CLASSIFICATION:    false,
  RULE_MEP_SYSTEM_MISSING:        false,
  RULE_CLASH_MEP_STRUCTURAL:      false,
  RULE_ISO19650_FILENAME:         false,
  lodLevel:                       300,
  namingConventionPatterns: {},
  requiredPsets: {},
  classificationSystems: [],
}

// ── Spatial tree ──────────────────────────────────────────────────────────────

export interface SpatialElement {
  expressId: number
  globalId: string
  ifcClass: string
  name: string
}

export interface SpatialNode {
  expressId: number
  globalId: string
  ifcClass: string
  name: string
  longName?: string
  description?: string
  children: SpatialNode[]
  /** Physical elements directly contained in this spatial structure node */
  containedElements: SpatialElement[]
}

// ── Quantity takeoff ──────────────────────────────────────────────────────────

export interface TakeoffQuantity {
  name: string
  value: number
  /** SI unit label shown in the UI, e.g. 'm²', 'm³', 'm' */
  unit: string
}

export interface TakeoffGroup {
  ifcClass: string
  label: string
  count: number
  /** Summed quantities across all elements in the group */
  quantities: TakeoffQuantity[]
}

export interface TakeoffResult {
  groups: TakeoffGroup[]
  durationMs: number
}

// ── LOD level ────────────────────────────────────────────────────────────────

export type LodLevel = 100 | 200 | 300 | 350 | 400

// ── Validation taxonomy ───────────────────────────────────────────────────────

export type ValidationCategoryType =
  | 'schema'
  | 'spatial'
  | 'quality'
  | 'lod'
  | 'iso19650'
  | 'classification'
  | 'mep'
  | 'clash'

export const VALIDATION_CATEGORY_LABELS: Record<ValidationCategoryType, string> = {
  schema:         'Schema IFC',
  spatial:        'Estructura espacial',
  quality:        'Calidad de datos',
  lod:            'LOD / LOIN',
  iso19650:       'ISO 19650',
  classification: 'Clasificación',
  mep:            'MEP',
  clash:          'Colisiones',
}

// ── Rule metadata ─────────────────────────────────────────────────────────────

export interface RuleMetadata {
  id: string
  label: string
  description: string
  category: ValidationCategoryType
  standard: string
  defaultSeverity: 'error' | 'warning' | 'info'
  autoFixable: boolean
}

export const RULE_METADATA: Record<string, RuleMetadata> = {
  // ── Naming & identity ────────────────────────────────────────────
  RULE_EMPTY_NAME: {
    id: 'RULE_EMPTY_NAME', label: 'Nombre vacío',
    description: 'El elemento no tiene nombre asignado',
    category: 'quality', standard: 'IFC schema', defaultSeverity: 'error', autoFixable: false,
  },
  RULE_EMPTY_LONGNAME: {
    id: 'RULE_EMPTY_LONGNAME', label: 'LongName vacío',
    description: 'IfcSpace sin nombre largo / descripción de uso',
    category: 'quality', standard: 'ISO 19650-2', defaultSeverity: 'warning', autoFixable: false,
  },
  RULE_DUPLICATE_NAME: {
    id: 'RULE_DUPLICATE_NAME', label: 'Nombre duplicado',
    description: 'Dos o más elementos hermanos comparten el mismo nombre',
    category: 'quality', standard: 'BEP interno', defaultSeverity: 'warning', autoFixable: false,
  },
  RULE_NAMING_CONVENTION: {
    id: 'RULE_NAMING_CONVENTION', label: 'Convención de nombres',
    description: 'El nombre no sigue el patrón definido en el BEP',
    category: 'quality', standard: 'ISO 19650-2 §9.2', defaultSeverity: 'warning', autoFixable: false,
  },
  RULE_DUPLICATE_GUID: {
    id: 'RULE_DUPLICATE_GUID', label: 'GUID duplicado',
    description: 'Dos elementos comparten el mismo GlobalId — rompe referencias cruzadas',
    category: 'schema', standard: 'IFC schema / ISO 10303-21', defaultSeverity: 'error', autoFixable: true,
  },
  RULE_INVALID_GUID_FORMAT: {
    id: 'RULE_INVALID_GUID_FORMAT', label: 'Formato de GUID inválido',
    description: 'El GlobalId no tiene los 22 caracteres del alfabeto IFC base64',
    category: 'schema', standard: 'IFC schema', defaultSeverity: 'error', autoFixable: true,
  },
  // ── Structure & hierarchy ────────────────────────────────────────
  RULE_ORPHAN_ELEMENT: {
    id: 'RULE_ORPHAN_ELEMENT', label: 'Elemento huérfano',
    description: 'Elemento físico sin contenedor espacial — no aparece en el árbol',
    category: 'spatial', standard: 'IFC schema', defaultSeverity: 'error', autoFixable: false,
  },
  RULE_WRONG_CONTAINER: {
    id: 'RULE_WRONG_CONTAINER', label: 'Contenedor incorrecto',
    description: 'Elemento físico contenido directamente en IfcSite',
    category: 'spatial', standard: 'IFC schema', defaultSeverity: 'error', autoFixable: false,
  },
  RULE_BROKEN_AGGREGATE: {
    id: 'RULE_BROKEN_AGGREGATE', label: 'Agregación rota',
    description: 'IfcRelAggregates apunta a una entidad inexistente',
    category: 'schema', standard: 'IFC schema / ISO 10303-21', defaultSeverity: 'error', autoFixable: false,
  },
  RULE_SPATIAL_HIERARCHY: {
    id: 'RULE_SPATIAL_HIERARCHY', label: 'Jerarquía espacial incorrecta',
    description: 'Project > Site > Building > Storey no sigue el orden correcto',
    category: 'spatial', standard: 'IFC schema', defaultSeverity: 'error', autoFixable: false,
  },
  RULE_CIRCULAR_REFERENCE: {
    id: 'RULE_CIRCULAR_REFERENCE', label: 'Referencia circular',
    description: 'Un elemento es su propio ancestro — bucle infinito en el árbol',
    category: 'schema', standard: 'IFC schema', defaultSeverity: 'error', autoFixable: false,
  },
  RULE_ELEMENT_IN_BUILDING: {
    id: 'RULE_ELEMENT_IN_BUILDING', label: 'Elemento en edificio',
    description: 'Elemento físico contenido en IfcBuilding sin pasar por una planta',
    category: 'spatial', standard: 'IFC best practice', defaultSeverity: 'warning', autoFixable: false,
  },
  // ── Properties & types ───────────────────────────────────────────
  RULE_MISSING_TYPE: {
    id: 'RULE_MISSING_TYPE', label: 'Sin tipo IFC',
    description: 'El elemento no tiene IfcTypeObject asociado',
    category: 'quality', standard: 'IFC schema', defaultSeverity: 'info', autoFixable: false,
  },
  RULE_MISSING_PROPERTY_SET: {
    id: 'RULE_MISSING_PROPERTY_SET', label: 'Pset requerido ausente',
    description: 'Elemento sin el property set mínimo requerido por el BEP',
    category: 'quality', standard: 'LOD / LOIN / BEP', defaultSeverity: 'warning', autoFixable: false,
  },
  RULE_EMPTY_PROPERTY_VALUE: {
    id: 'RULE_EMPTY_PROPERTY_VALUE', label: 'Valor de propiedad vacío',
    description: 'Propiedad en un Pset con valor nulo o vacío',
    category: 'quality', standard: 'LOIN / ISO 17412', defaultSeverity: 'warning', autoFixable: false,
  },
  RULE_MISSING_MATERIAL: {
    id: 'RULE_MISSING_MATERIAL', label: 'Sin material',
    description: 'Elemento estructural sin IfcRelAssociatesMaterial',
    category: 'quality', standard: 'LOD 200+', defaultSeverity: 'warning', autoFixable: false,
  },
  RULE_INVALID_IFC_VERSION: {
    id: 'RULE_INVALID_IFC_VERSION', label: 'Versión IFC obsoleta',
    description: 'El archivo usa IFC2x3 o un schema no reconocido',
    category: 'schema', standard: 'ISO 10303-21', defaultSeverity: 'info', autoFixable: false,
  },
  // ── Clash ────────────────────────────────────────────────────────
  RULE_ELEMENT_CLASH: {
    id: 'RULE_ELEMENT_CLASH', label: 'Colisión estructural',
    description: 'Dos elementos estructurales con bounding boxes solapados > 5 cm',
    category: 'clash', standard: 'BIM coordination', defaultSeverity: 'warning', autoFixable: false,
  },
  // ── Sprint V3 — Schema completeness ──────────────────────────────
  RULE_MISSING_PROJECT: {
    id: 'RULE_MISSING_PROJECT', label: 'Sin IfcProject',
    description: 'El modelo no contiene ningún IfcProject',
    category: 'schema', standard: 'IFC schema', defaultSeverity: 'error', autoFixable: false,
  },
  RULE_MISSING_BUILDING: {
    id: 'RULE_MISSING_BUILDING', label: 'Sin IfcBuilding',
    description: 'El modelo no contiene ningún IfcBuilding',
    category: 'spatial', standard: 'IFC best practice', defaultSeverity: 'warning', autoFixable: false,
  },
  RULE_MISSING_STOREY: {
    id: 'RULE_MISSING_STOREY', label: 'Edificio sin plantas',
    description: 'IfcBuilding sin ningún IfcBuildingStorey hijo',
    category: 'spatial', standard: 'IFC best practice', defaultSeverity: 'warning', autoFixable: false,
  },
  RULE_EMPTY_STOREY: {
    id: 'RULE_EMPTY_STOREY', label: 'Planta vacía',
    description: 'IfcBuildingStorey sin elementos ni espacios contenidos',
    category: 'spatial', standard: 'BEP interno', defaultSeverity: 'info', autoFixable: false,
  },
  RULE_FILE_DESCRIPTION_MISSING: {
    id: 'RULE_FILE_DESCRIPTION_MISSING', label: 'Sin descripción de archivo',
    description: 'El header STEP FILE_DESCRIPTION está vacío',
    category: 'schema', standard: 'ISO 10303-21 §8.2.1', defaultSeverity: 'info', autoFixable: false,
  },
  RULE_FILE_AUTHOR_MISSING: {
    id: 'RULE_FILE_AUTHOR_MISSING', label: 'Sin autor de archivo',
    description: 'El header STEP FILE_NAME no especifica autor',
    category: 'schema', standard: 'ISO 10303-21 §8.2.2', defaultSeverity: 'info', autoFixable: false,
  },
  RULE_PROJECT_LONGNAME_MISSING: {
    id: 'RULE_PROJECT_LONGNAME_MISSING', label: 'Sin nombre de proyecto',
    description: 'IfcProject no tiene LongName (nombre oficial del proyecto)',
    category: 'quality', standard: 'ISO 19650-2 §6.1', defaultSeverity: 'warning', autoFixable: false,
  },
  RULE_STOREY_ELEVATION_MISSING: {
    id: 'RULE_STOREY_ELEVATION_MISSING', label: 'Cota de planta no definida',
    description: 'IfcBuildingStorey sin atributo Elevation',
    category: 'spatial', standard: 'LOIN / ISO 17412', defaultSeverity: 'warning', autoFixable: false,
  },
  // ── Sprint V3 — ISO 19650 basic ───────────────────────────────────
  RULE_ISO19650_PROJECT_INFO: {
    id: 'RULE_ISO19650_PROJECT_INFO', label: 'Info de proyecto ISO 19650',
    description: 'IfcProject sin LongName, Description u ObjectType requeridos por ISO 19650',
    category: 'iso19650', standard: 'ISO 19650-2:2021 §9.2', defaultSeverity: 'warning', autoFixable: false,
  },
  RULE_ISO19650_AUTHOR_INFO: {
    id: 'RULE_ISO19650_AUTHOR_INFO', label: 'Autoría ISO 19650',
    description: 'Header del archivo sin autor u organización para trazabilidad ISO 19650',
    category: 'iso19650', standard: 'ISO 19650-2:2021 §9.1', defaultSeverity: 'info', autoFixable: false,
  },
  // ── Sprint V4 — LOD ───────────────────────────────────────────────
  RULE_LOD_PSET_MISSING: {
    id: 'RULE_LOD_PSET_MISSING', label: 'Pset LOD ausente',
    description: 'Elemento sin los Psets mínimos para el nivel LOD declarado',
    category: 'lod', standard: 'buildingSMART / LOD 300', defaultSeverity: 'warning', autoFixable: false,
  },
  RULE_LOD_QUANTITY_MISSING: {
    id: 'RULE_LOD_QUANTITY_MISSING', label: 'Cantidades LOD ausentes',
    description: 'Elemento sin IfcElementQuantity requerido para el nivel LOD',
    category: 'lod', standard: 'ISO 17412 / LOIN', defaultSeverity: 'warning', autoFixable: false,
  },
  RULE_LOD_MATERIAL_LAYER_MISSING: {
    id: 'RULE_LOD_MATERIAL_LAYER_MISSING', label: 'Sin capas de material LOD',
    description: 'Muro/losa sin IfcMaterialLayerSetUsage para el nivel LOD ≥ 300',
    category: 'lod', standard: 'buildingSMART / LOD 300', defaultSeverity: 'warning', autoFixable: false,
  },
  // ── Sprint V4 — Classification ────────────────────────────────────
  RULE_MISSING_CLASSIFICATION: {
    id: 'RULE_MISSING_CLASSIFICATION', label: 'Sin clasificación',
    description: 'Elemento físico sin IfcRelAssociatesClassification',
    category: 'classification', standard: 'Uniclass 2015 / ISO 19650', defaultSeverity: 'warning', autoFixable: false,
  },
  // ── Sprint V4 — MEP ───────────────────────────────────────────────
  RULE_MEP_SYSTEM_MISSING: {
    id: 'RULE_MEP_SYSTEM_MISSING', label: 'MEP sin sistema',
    description: 'Elemento MEP no asignado a ningún IfcSystem',
    category: 'mep', standard: 'IFC MEP domain', defaultSeverity: 'warning', autoFixable: false,
  },
  RULE_CLASH_MEP_STRUCTURAL: {
    id: 'RULE_CLASH_MEP_STRUCTURAL', label: 'Colisión MEP/estructural',
    description: 'Elemento MEP con bounding box solapado con elemento estructural',
    category: 'clash', standard: 'BIM coordination', defaultSeverity: 'warning', autoFixable: false,
  },
  // ── Sprint V4 — ISO 19650 filename ────────────────────────────────
  RULE_ISO19650_FILENAME: {
    id: 'RULE_ISO19650_FILENAME', label: 'Nombre de archivo ISO 19650',
    description: 'El nombre del archivo no sigue la convención ISO 19650',
    category: 'iso19650', standard: 'ISO 19650-2:2021 §6.3', defaultSeverity: 'warning', autoFixable: false,
  },
}

// ── Validation profiles ───────────────────────────────────────────────────────

export interface ValidationProfile {
  id: string
  name: string
  description: string
  icon: string
  rules: RulesConfig
  coverageTypes: ValidationCategoryType[]
}

const _BASIC_RULES: RulesConfig = {
  RULE_INVALID_IFC_VERSION:   true,
  RULE_DUPLICATE_GUID:        true,
  RULE_INVALID_GUID_FORMAT:   true,
  RULE_BROKEN_AGGREGATE:      true,
  RULE_CIRCULAR_REFERENCE:    true,
  RULE_ORPHAN_ELEMENT:        true,
  RULE_WRONG_CONTAINER:       true,
  RULE_SPATIAL_HIERARCHY:     true,
  RULE_ELEMENT_IN_BUILDING:   true,
  RULE_MISSING_PROJECT:       true,
  RULE_MISSING_BUILDING:      true,
  RULE_MISSING_STOREY:        true,
}

const _QUALITY_RULES: RulesConfig = {
  ..._BASIC_RULES,
  RULE_EMPTY_NAME:                true,
  RULE_EMPTY_LONGNAME:            true,
  RULE_DUPLICATE_NAME:            true,
  RULE_MISSING_TYPE:              true,
  RULE_EMPTY_PROPERTY_VALUE:      true,
  RULE_MISSING_MATERIAL:          true,
  RULE_PROJECT_LONGNAME_MISSING:  true,
  RULE_STOREY_ELEVATION_MISSING:  true,
  RULE_FILE_DESCRIPTION_MISSING:  true,
}

export const VALIDATION_PROFILES: readonly ValidationProfile[] = [
  {
    id: 'basic',
    name: 'Entrega básica',
    description: 'Comprueba que el modelo es un IFC válido y bien estructurado antes de enviarlo.',
    icon: '📦',
    rules: _BASIC_RULES,
    coverageTypes: ['schema', 'spatial'],
  },
  {
    id: 'quality',
    name: 'Revisión de calidad',
    description: 'Revisión exhaustiva de naming, propiedades y estructura antes de publicar en el CDE.',
    icon: '🔍',
    rules: _QUALITY_RULES,
    coverageTypes: ['schema', 'spatial', 'quality'],
  },
  {
    id: 'coordination',
    name: 'Coordinación BIM',
    description: 'Calidad de datos esencial + detección de colisiones para sesiones de coordinación.',
    icon: '⚡',
    rules: {
      ..._BASIC_RULES,
      RULE_EMPTY_NAME:           true,
      RULE_DUPLICATE_NAME:       true,
      RULE_MISSING_TYPE:           true,
      RULE_EMPTY_PROPERTY_VALUE:   true,
      RULE_ELEMENT_CLASH:          true,
      RULE_MISSING_CLASSIFICATION: true,
      RULE_CLASH_MEP_STRUCTURAL:   true,
    },
    coverageTypes: ['schema', 'spatial', 'quality', 'clash', 'classification'],
  },
  {
    id: 'iso19650',
    name: 'Cumplimiento ISO 19650',
    description: 'Verifica los requisitos de información de una entrega formal según ISO 19650-2.',
    icon: '📋',
    rules: {
      ..._QUALITY_RULES,
      RULE_NAMING_CONVENTION:        true,
      RULE_ISO19650_PROJECT_INFO:    true,
      RULE_ISO19650_AUTHOR_INFO:     true,
      RULE_FILE_AUTHOR_MISSING:      true,
      RULE_MISSING_CLASSIFICATION:   true,
    },
    coverageTypes: ['schema', 'spatial', 'quality', 'iso19650', 'classification'],
  },
  {
    id: 'lod300',
    name: 'LOD 300 Design',
    description: 'Comprueba que todos los elementos tienen el nivel de información requerido para LOD 300.',
    icon: '🏗️',
    rules: {
      ..._QUALITY_RULES,
      RULE_MISSING_PROPERTY_SET:  true,
      RULE_LOD_PSET_MISSING:              true,
      RULE_LOD_QUANTITY_MISSING:          true,
      RULE_LOD_MATERIAL_LAYER_MISSING:    true,
      lodLevel:                           300,
      requiredPsets: {
        IfcWall:   ['Pset_WallCommon'],
        IfcSlab:   ['Pset_SlabCommon'],
        IfcBeam:   ['Pset_BeamCommon'],
        IfcColumn: ['Pset_ColumnCommon'],
        IfcDoor:   ['Pset_DoorCommon'],
        IfcWindow: ['Pset_WindowCommon'],
        IfcSpace:  ['Pset_SpaceCommon'],
      },
    },
    coverageTypes: ['schema', 'spatial', 'quality', 'lod'],
  },
]

// ── Validation certificate ────────────────────────────────────────────────────

export interface ValidationCertificate {
  timestamp: string
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
    rulesRun: string[]
  }
  stats: ValidationResult['stats']
  qualityScore: number
  issues: ValidationIssue[]
  generatedBy: string
  appVersion: string
  durationMs: number
}

// ── Rule i18n ─────────────────────────────────────────────────────────────────
// Minimal translation layer for rule labels/descriptions.
// Keys are BCP-47 language codes (any string).  Base locale is 'en'.
// Add more locales by adding entries to this map — no other file needs changing.

export const RULE_TRANSLATIONS: Partial<Record<string, Record<string, { label: string; description: string }>>> = {
  en: {
    RULE_EMPTY_NAME:                 { label: 'Empty name',             description: 'Element with Name = "" or null' },
    RULE_EMPTY_LONGNAME:             { label: 'Empty long name',        description: 'IfcSpace/Storey/Building with no LongName' },
    RULE_DUPLICATE_NAME:             { label: 'Duplicate name',         description: 'Two or more siblings share the same Name' },
    RULE_NAMING_CONVENTION:          { label: 'Naming convention',      description: 'Name does not match the project BEP pattern' },
    RULE_DUPLICATE_GUID:             { label: 'Duplicate GUID',         description: 'Two or more elements share the same GlobalId' },
    RULE_INVALID_GUID_FORMAT:        { label: 'Invalid GUID format',    description: 'GlobalId does not follow IFC base-64 encoding' },
    RULE_ORPHAN_ELEMENT:             { label: 'Orphan element',         description: 'Physical element with no spatial container or aggregate parent' },
    RULE_WRONG_CONTAINER:            { label: 'Wrong container',        description: 'Element contained in a spatial structure of wrong type' },
    RULE_BROKEN_AGGREGATE:           { label: 'Broken aggregate',       description: 'IfcRelAggregates points to a non-existent entity' },
    RULE_SPATIAL_HIERARCHY:          { label: 'Spatial hierarchy',      description: 'Spatial structure not rooted in IfcProject' },
    RULE_CIRCULAR_REFERENCE:         { label: 'Circular reference',     description: 'Aggregate or containment relationship forms a cycle' },
    RULE_ELEMENT_IN_BUILDING:        { label: 'Element in building',    description: 'Element placed directly in IfcBuilding — must be inside a storey' },
    RULE_MISSING_TYPE:               { label: 'Missing type',           description: 'Element has no IfcTypeObject (IfcWallType, IfcDoorType, …)' },
    RULE_MISSING_PROPERTY_SET:       { label: 'Missing property set',   description: 'Element missing a required Pset from the project config' },
    RULE_EMPTY_PROPERTY_VALUE:       { label: 'Empty property value',   description: 'IfcPropertySingleValue has a null or empty nominal value' },
    RULE_MISSING_MATERIAL:           { label: 'Missing material',       description: 'Physical element has no IfcRelAssociatesMaterial' },
    RULE_INVALID_IFC_VERSION:        { label: 'Invalid IFC version',    description: 'File uses an outdated or unrecognised IFC schema' },
    RULE_ELEMENT_CLASH:              { label: 'Element clash',          description: 'Two structural elements have overlapping bounding boxes' },
    RULE_MISSING_PROJECT:            { label: 'Missing project',        description: 'File contains no IfcProject entity' },
    RULE_MISSING_BUILDING:           { label: 'Missing building',       description: 'No IfcBuilding found under IfcSite' },
    RULE_MISSING_STOREY:             { label: 'Missing storey',         description: 'IfcBuilding has no IfcBuildingStorey children' },
    RULE_EMPTY_STOREY:               { label: 'Empty storey',           description: 'IfcBuildingStorey contains no elements or spaces' },
    RULE_FILE_DESCRIPTION_MISSING:   { label: 'No file description',    description: 'IFC STEP header FILE_DESCRIPTION is empty' },
    RULE_FILE_AUTHOR_MISSING:        { label: 'No file author',         description: 'IFC STEP header FILE_NAME has no author specified' },
    RULE_PROJECT_LONGNAME_MISSING:   { label: 'Project has no long name', description: 'IfcProject.LongName is empty' },
    RULE_STOREY_ELEVATION_MISSING:   { label: 'Storey elevation missing', description: 'IfcBuildingStorey.Elevation is null' },
    RULE_ISO19650_PROJECT_INFO:      { label: 'ISO 19650 project info', description: 'IfcProject missing LongName, Description, or ObjectType required by ISO 19650' },
    RULE_ISO19650_AUTHOR_INFO:       { label: 'ISO 19650 author info',  description: 'STEP header has no author or organisation for traceability' },
    RULE_ISO19650_FILENAME:          { label: 'ISO 19650 filename',     description: 'Filename does not follow the ISO 19650 naming convention' },
    RULE_LOD_PSET_MISSING:           { label: 'LOD Pset missing',       description: 'Element missing required property sets for the declared LOD level' },
    RULE_LOD_QUANTITY_MISSING:       { label: 'LOD quantities missing', description: 'Structural element missing IfcElementQuantity for declared LOD' },
    RULE_LOD_MATERIAL_LAYER_MISSING: { label: 'No material layers',     description: 'Wall/slab missing IfcMaterialLayerSetUsage at LOD ≥ 300' },
    RULE_MISSING_CLASSIFICATION:     { label: 'Missing classification', description: 'Physical element has no IfcRelAssociatesClassification' },
    RULE_MEP_SYSTEM_MISSING:         { label: 'MEP system missing',     description: 'MEP flow element not assigned to any IfcSystem' },
    RULE_CLASH_MEP_STRUCTURAL:       { label: 'MEP/structural clash',   description: 'MEP element bounding box overlaps a structural element' },
  },
}

/**
 * Returns the translated label for a rule ID.
 * Falls back to EN label, then RULE_METADATA base label, then the raw ruleId.
 */
export function getRuleLabel(ruleId: string, locale = 'en'): string {
  const lang = locale.split('-')[0]  // 'en-US' → 'en'
  return (
    RULE_TRANSLATIONS[lang]?.[ruleId]?.label ??
    RULE_TRANSLATIONS['en']?.[ruleId]?.label ??
    RULE_METADATA[ruleId]?.label ??
    ruleId
  )
}

/**
 * Returns the translated description for a rule ID.
 * Falls back to EN description, then RULE_METADATA base description.
 */
export function getRuleDescription(ruleId: string, locale = 'en'): string {
  const lang = locale.split('-')[0]
  return (
    RULE_TRANSLATIONS[lang]?.[ruleId]?.description ??
    RULE_TRANSLATIONS['en']?.[ruleId]?.description ??
    RULE_METADATA[ruleId]?.description ??
    ruleId
  )
}

// ── Editor diffs ──────────────────────────────────────────────────────────────

export type EditDiff =
  | { type: 'RENAME';       expressId: number; field: 'Name' | 'LongName' | 'Description'; oldValue: string; newValue: string }
  | { type: 'FIX_GUID';     expressId: number; oldGuid: string; newGuid: string }
  | { type: 'REPARENT';     expressId: number; oldParentExpressId: number; newParentExpressId: number }
  /** Edit an IfcPropertySingleValue inside a Pset. propExpressId is the express ID of the property line itself. */
  | { type: 'SET_PROPERTY'; expressId: number; psetName: string; propName: string; propExpressId: number; oldValue: string; newValue: string }

export interface EditorCommand {
  id: string
  timestamp: number
  diffs: EditDiff[]
  description: string
  /** Scene-level modelId this command targets. Undefined = legacy / applies to any model. */
  modelId?: string
}

// ── BCF types ─────────────────────────────────────────────────────────────────

export interface BcfViewpoint {
  guid:              string
  snapshotBase64?:   string
  cameraPosition?:   { x: number; y: number; z: number }
  cameraDirection?:  { x: number; y: number; z: number }
  cameraUp?:         { x: number; y: number; z: number }
  fieldOfView?:      number
  aspectRatio?:      number
  componentGuids?:   string[]
}

export interface BcfComment {
  guid:           string
  date:           string
  author:         string
  text:           string
  viewpointGuid?: string
  /** true = added locally in this session, not part of the original file */
  local?:         boolean
}

export interface BcfTopic {
  guid:            string
  title:           string
  description?:    string
  status?:         string
  topicType?:      string
  priority?:       string
  creationDate?:   string
  creationAuthor?: string
  assignedTo?:     string
  labels?:         string[]
  viewpoints:      BcfViewpoint[]
  comments:        BcfComment[]
  /** 'imported' = from a .bcfzip file; 'generated' = from validation issues */
  source:          'imported' | 'generated'
  /** ValidationIssue.id this topic was generated from, when source === 'generated' */
  validationIssueId?: string
}

export type BcfVersion = '2.1' | '3.0' | 'unknown'
