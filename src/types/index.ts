export type Route = 'landing' | 'viewer' | 'report' | 'blog' | 'privacy' | 'terms'
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
  /** Capture the current renderer canvas as a PNG data-URL. Returns '' on failure. */
  takeSnapshot: () => string
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
  metadata?: {
    /** Set when clash detection was capped at CLASH_ELEMENT_LIMIT elements. */
    clashCapped?: { checkedCount: number; totalCount: number }
    /** Per-rule execution coverage — which enabled rules ran, failed, or never ran. */
    coverage?: ValidationCoverage
  }
}

/**
 * Per-rule execution status for a validation run.
 *   ok       — the rule ran to completion (it may or may not have found issues)
 *   failed   — the rule threw; the model was inspected but this rule is unreliable
 *   not-run  — the rule never executed (worker crashed / timed out / was terminated)
 */
export type RuleCoverageStatus = 'ok' | 'failed' | 'not-run'

export interface RuleCoverageEntry {
  ruleId: string
  status: RuleCoverageStatus
  /** Present only when status === 'failed'. Truncated to ~300 chars. */
  error?: string
}

/**
 * Honest coverage report for a validation run. The launcher owns `attempted`
 * (the full enabled-rule set) and reconstructs this, so a silent worker failure
 * can't masquerade as a clean model: any enabled rule that reported no status is
 * recorded as `not-run`. `complete` is the machine-readable "the score is
 * trustworthy" flag consumed by the coverage banner and the certificate.
 */
export interface ValidationCoverage {
  attempted: string[]
  entries: RuleCoverageEntry[]
  okCount: number
  failedCount: number
  notRunCount: number
  complete: boolean
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

  // ── Sprint V6 — Geometry & storey integrity ──────────────────────────────────
  /** IfcOpeningElement not connected to any host via IfcRelVoidsElement */
  RULE_OPENING_WITHOUT_HOST?: boolean
  /** Two or more IfcBuildingStorey in the same building share the same Elevation value */
  RULE_STOREY_ELEVATION_DUPLICATE?: boolean
  /** Model LENGTHUNIT is imperial (foot/inch) instead of SI metric */
  RULE_UNIT_CONSISTENCY?: boolean
  /** IfcSpace has no NetFloorArea quantity in its IfcElementQuantity */
  RULE_SPACE_AREA_MISSING?: boolean
  /** IfcPipeSegment / IfcDuctSegment / IfcFlowSegment has no IfcDistributionPort connection */
  RULE_CONNECTED_MEP?: boolean
  /** IfcBuildingStorey elevation values are not in ascending order within the building */
  RULE_STOREY_ELEVATION_ORDER?: boolean

  // ── Sprint V5 — Model quality signals ────────────────────────────────────────
  /** More than 5% of physical elements are IfcBuildingElementProxy (typically unconverted Revit families) */
  RULE_PROXY_OVERUSE?: boolean
  /** Model geometry positioned more than 10 km from the WCS origin — causes floating-point precision errors in viewers */
  RULE_COORDINATE_OFFSET?: boolean
  /** File size per physical element exceeds 500 KB — typically over-detailed geometry or embedded textures */
  RULE_FILE_SIZE_ANOMALY?: boolean

  // ── Pro controls (Phase 3) ───────────────────────────────────────────────────
  /** Per-rule severity override, e.g. { RULE_MISSING_MATERIAL: 'error' }. Applied
   *  client-side after the worker returns, so it changes the E/W/I counts and the score. */
  severityOverrides?: Partial<Record<string, 'error' | 'warning' | 'info'>>
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
  // Sprint V5
  RULE_PROXY_OVERUSE:             true,
  RULE_COORDINATE_OFFSET:         true,
  RULE_FILE_SIZE_ANOMALY:         true,
  // Sprint V6
  RULE_OPENING_WITHOUT_HOST:      true,
  RULE_STOREY_ELEVATION_DUPLICATE: true,
  RULE_UNIT_CONSISTENCY:           true,
  RULE_SPACE_AREA_MISSING:         true,
  RULE_CONNECTED_MEP:              true,
  RULE_STOREY_ELEVATION_ORDER:     true,
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
  schema:         'IFC Schema',
  spatial:        'Spatial structure',
  quality:        'Data quality',
  lod:            'LOD / LOIN',
  iso19650:       'ISO 19650',
  classification: 'Classification',
  mep:            'MEP',
  clash:          'Clash detection',
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
  // ── Sprint V5 — Model quality signals ─────────────────────────────
  RULE_PROXY_OVERUSE: {
    id: 'RULE_PROXY_OVERUSE', label: 'Proxy overuse',
    description: 'More than 5% of physical elements are IfcBuildingElementProxy — typically unconverted Revit families',
    category: 'quality', standard: 'IFC best practice', defaultSeverity: 'warning', autoFixable: false,
  },
  RULE_COORDINATE_OFFSET: {
    id: 'RULE_COORDINATE_OFFSET', label: 'Large coordinate offset',
    description: 'Model geometry is positioned more than 10 km from the WCS origin — causes floating-point precision errors in viewers',
    category: 'quality', standard: 'IFC best practice', defaultSeverity: 'warning', autoFixable: false,
  },
  RULE_FILE_SIZE_ANOMALY: {
    id: 'RULE_FILE_SIZE_ANOMALY', label: 'File size anomaly',
    description: 'File size per physical element exceeds 500 KB — typically over-detailed geometry or embedded textures',
    category: 'quality', standard: 'IFC best practice', defaultSeverity: 'info', autoFixable: false,
  },
  // ── Sprint V6 — Geometry & storey integrity ─────────────────────────
  RULE_OPENING_WITHOUT_HOST: {
    id: 'RULE_OPENING_WITHOUT_HOST', label: 'Opening without host',
    description: 'IfcOpeningElement not connected to any host element via IfcRelVoidsElement',
    category: 'spatial', standard: 'IFC schema', defaultSeverity: 'warning', autoFixable: false,
  },
  RULE_STOREY_ELEVATION_DUPLICATE: {
    id: 'RULE_STOREY_ELEVATION_DUPLICATE', label: 'Duplicate storey elevation',
    description: 'Two or more storeys in the same building share the same Elevation value',
    category: 'spatial', standard: 'IFC best practice', defaultSeverity: 'warning', autoFixable: false,
  },
  RULE_UNIT_CONSISTENCY: {
    id: 'RULE_UNIT_CONSISTENCY', label: 'Imperial length unit',
    description: 'Model LENGTHUNIT is imperial (foot/inch) — IFC interchange requires SI metric',
    category: 'schema', standard: 'ISO 16739', defaultSeverity: 'warning', autoFixable: false,
  },
  RULE_SPACE_AREA_MISSING: {
    id: 'RULE_SPACE_AREA_MISSING', label: 'Space missing floor area',
    description: 'IfcSpace has no NetFloorArea quantity — required for energy analysis and QS workflows',
    category: 'quality', standard: 'IFC best practice', defaultSeverity: 'warning', autoFixable: false,
  },
  RULE_CONNECTED_MEP: {
    id: 'RULE_CONNECTED_MEP', label: 'Disconnected MEP segment',
    description: 'IfcPipeSegment / IfcDuctSegment / IfcFlowSegment has no IfcDistributionPort connection',
    category: 'mep', standard: 'IFC best practice', defaultSeverity: 'warning', autoFixable: false,
  },
  RULE_STOREY_ELEVATION_ORDER: {
    id: 'RULE_STOREY_ELEVATION_ORDER', label: 'Storey elevation out of order',
    description: 'IfcBuildingStorey elevation values are not in ascending order within the building',
    category: 'spatial', standard: 'IFC best practice', defaultSeverity: 'warning', autoFixable: false,
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
    name: 'Basic delivery',
    description: 'Checks that the model is a valid, well-structured IFC before sending it.',
    icon: '📦',
    rules: _BASIC_RULES,
    coverageTypes: ['schema', 'spatial'],
  },
  {
    id: 'quality',
    name: 'Quality review',
    description: 'Thorough review of naming, properties and structure before publishing to the CDE.',
    icon: '🔍',
    rules: _QUALITY_RULES,
    coverageTypes: ['schema', 'spatial', 'quality'],
  },
  {
    id: 'coordination',
    name: 'BIM coordination',
    description: 'Essential data quality + clash detection for coordination sessions.',
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
    name: 'ISO 19650 compliance',
    description: 'Verifies the information requirements of a formal delivery per ISO 19650-2.',
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
    description: 'Checks that all elements have the level of information required for LOD 300.',
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
    RULE_PROXY_OVERUSE:              { label: 'Proxy overuse',          description: 'More than 5% of elements are IfcBuildingElementProxy — typically unconverted Revit families' },
    RULE_COORDINATE_OFFSET:          { label: 'Large coordinate offset', description: 'Model geometry is more than 10 km from the WCS origin — causes floating-point precision errors' },
    RULE_FILE_SIZE_ANOMALY:          { label: 'File size anomaly',       description: 'File is unusually large per element — over-detailed geometry or embedded textures likely' },
    RULE_OPENING_WITHOUT_HOST:       { label: 'Opening without host',    description: 'IfcOpeningElement not connected to any host element via IfcRelVoidsElement' },
    RULE_STOREY_ELEVATION_DUPLICATE: { label: 'Duplicate storey elevation', description: 'Two or more storeys in the same building share the same elevation value' },
    RULE_UNIT_CONSISTENCY:           { label: 'Imperial length unit',        description: 'Model LENGTHUNIT is imperial (foot/inch) — IFC interchange requires SI metric units' },
    RULE_SPACE_AREA_MISSING:         { label: 'Space missing floor area',    description: 'IfcSpace has no NetFloorArea quantity — required for energy analysis and QS workflows' },
    RULE_CONNECTED_MEP:              { label: 'Disconnected MEP segment',    description: 'IfcPipeSegment / IfcDuctSegment has no IfcDistributionPort connection' },
    RULE_STOREY_ELEVATION_ORDER:     { label: 'Storey elevation out of order', description: 'IfcBuildingStorey elevations are not in ascending order within the building' },
  },
  es: {
    RULE_EMPTY_NAME:                 { label: 'Nombre vacío',              description: 'Elemento sin nombre asignado (Name = "" o nulo)' },
    RULE_EMPTY_LONGNAME:             { label: 'Nombre largo vacío',        description: 'IfcSpace/Storey/Building sin LongName' },
    RULE_DUPLICATE_NAME:             { label: 'Nombre duplicado',          description: 'Dos o más elementos hermanos comparten el mismo nombre' },
    RULE_NAMING_CONVENTION:          { label: 'Convención de nombres',     description: 'El nombre no cumple el patrón BEP del proyecto' },
    RULE_DUPLICATE_GUID:             { label: 'GUID duplicado',            description: 'Dos o más elementos comparten el mismo GlobalId' },
    RULE_INVALID_GUID_FORMAT:        { label: 'Formato GUID inválido',     description: 'El GlobalId no sigue la codificación base-64 de IFC' },
    RULE_ORPHAN_ELEMENT:             { label: 'Elemento huérfano',         description: 'Elemento físico sin contenedor espacial ni padre de agregación' },
    RULE_WRONG_CONTAINER:            { label: 'Contenedor incorrecto',     description: 'Elemento contenido en un tipo de estructura espacial incorrecto' },
    RULE_BROKEN_AGGREGATE:           { label: 'Agregación rota',           description: 'IfcRelAggregates apunta a una entidad inexistente' },
    RULE_SPATIAL_HIERARCHY:          { label: 'Jerarquía espacial',        description: 'La estructura espacial no tiene raíz en IfcProject' },
    RULE_CIRCULAR_REFERENCE:         { label: 'Referencia circular',       description: 'La relación de agregación o contención forma un ciclo' },
    RULE_ELEMENT_IN_BUILDING:        { label: 'Elemento en edificio',      description: 'Elemento situado directamente en IfcBuilding — debe estar en una planta' },
    RULE_MISSING_TYPE:               { label: 'Tipo faltante',             description: 'Elemento sin IfcTypeObject (IfcWallType, IfcDoorType, …)' },
    RULE_MISSING_PROPERTY_SET:       { label: 'Pset faltante',             description: 'Elemento sin los Pset requeridos por la configuración del proyecto' },
    RULE_EMPTY_PROPERTY_VALUE:       { label: 'Valor de propiedad vacío',  description: 'IfcPropertySingleValue con valor nominal nulo o vacío' },
    RULE_MISSING_MATERIAL:           { label: 'Material faltante',         description: 'Elemento físico sin IfcRelAssociatesMaterial' },
    RULE_INVALID_IFC_VERSION:        { label: 'Versión IFC inválida',      description: 'El archivo usa un esquema IFC obsoleto o no reconocido' },
    RULE_ELEMENT_CLASH:              { label: 'Colisión de elementos',      description: 'Dos elementos estructurales tienen cajas de colisión solapadas' },
    RULE_MISSING_PROJECT:            { label: 'Proyecto faltante',         description: 'El archivo no contiene ninguna entidad IfcProject' },
    RULE_MISSING_BUILDING:           { label: 'Edificio faltante',         description: 'No se encontró IfcBuilding bajo IfcSite' },
    RULE_MISSING_STOREY:             { label: 'Planta faltante',           description: 'IfcBuilding sin hijos IfcBuildingStorey' },
    RULE_EMPTY_STOREY:               { label: 'Planta vacía',              description: 'IfcBuildingStorey sin elementos ni espacios' },
    RULE_FILE_DESCRIPTION_MISSING:   { label: 'Sin descripción de archivo', description: 'La cabecera STEP FILE_DESCRIPTION está vacía' },
    RULE_FILE_AUTHOR_MISSING:        { label: 'Sin autor de archivo',      description: 'La cabecera STEP FILE_NAME no especifica autor' },
    RULE_PROJECT_LONGNAME_MISSING:   { label: 'Proyecto sin nombre largo', description: 'IfcProject.LongName está vacío' },
    RULE_STOREY_ELEVATION_MISSING:   { label: 'Elevación de planta faltante', description: 'IfcBuildingStorey.Elevation es nulo' },
    RULE_ISO19650_PROJECT_INFO:      { label: 'Info proyecto ISO 19650',   description: 'IfcProject sin LongName, Description u ObjectType requeridos por ISO 19650' },
    RULE_ISO19650_AUTHOR_INFO:       { label: 'Info autor ISO 19650',      description: 'Cabecera STEP sin autor u organización para trazabilidad' },
    RULE_ISO19650_FILENAME:          { label: 'Nombre archivo ISO 19650',  description: 'El nombre de archivo no sigue la convención ISO 19650' },
    RULE_LOD_PSET_MISSING:           { label: 'Pset LOD faltante',         description: 'Elemento sin los Pset requeridos para el nivel LOD declarado' },
    RULE_LOD_QUANTITY_MISSING:       { label: 'Cantidades LOD faltantes',  description: 'Elemento estructural sin IfcElementQuantity para el LOD declarado' },
    RULE_LOD_MATERIAL_LAYER_MISSING: { label: 'Sin capas de material',     description: 'Muro/losa sin IfcMaterialLayerSetUsage en LOD ≥ 300' },
    RULE_MISSING_CLASSIFICATION:     { label: 'Clasificación faltante',    description: 'Elemento físico sin IfcRelAssociatesClassification' },
    RULE_MEP_SYSTEM_MISSING:         { label: 'Sistema MEP faltante',      description: 'Elemento de flujo MEP no asignado a ningún IfcSystem' },
    RULE_CLASH_MEP_STRUCTURAL:       { label: 'Colisión MEP/estructura',   description: 'Caja de colisión de elemento MEP solapa con elemento estructural' },
    RULE_PROXY_OVERUSE:              { label: 'Exceso de elementos proxy',  description: 'Más del 5% de los elementos son IfcBuildingElementProxy — familias Revit sin convertir' },
    RULE_COORDINATE_OFFSET:          { label: 'Desfase de coordenadas',     description: 'La geometría del modelo está a más de 10 km del origen WCS — provoca errores de precisión de coma flotante' },
    RULE_FILE_SIZE_ANOMALY:          { label: 'Anomalía de tamaño de archivo', description: 'El archivo es inusualmente grande por elemento — probablemente geometría sobredetallada o texturas embebidas' },
    RULE_OPENING_WITHOUT_HOST:       { label: 'Abertura sin host',           description: 'IfcOpeningElement no conectado a ningún elemento anfitrión vía IfcRelVoidsElement' },
    RULE_STOREY_ELEVATION_DUPLICATE: { label: 'Elevación de planta duplicada', description: 'Dos o más plantas del mismo edificio comparten el mismo valor de elevación' },
    RULE_UNIT_CONSISTENCY:           { label: 'Unidad de longitud imperial',    description: 'La LENGTHUNIT del modelo es imperial (pie/pulgada) — el intercambio IFC requiere unidades métricas SI' },
    RULE_SPACE_AREA_MISSING:         { label: 'Espacio sin área de suelo',      description: 'IfcSpace sin cantidad NetFloorArea — requerida para análisis energético y mediciones' },
    RULE_CONNECTED_MEP:              { label: 'Segmento MEP desconectado',      description: 'IfcPipeSegment / IfcDuctSegment sin conexión IfcDistributionPort' },
    RULE_STOREY_ELEVATION_ORDER:     { label: 'Plantas fuera de orden',         description: 'Las elevaciones de IfcBuildingStorey no están en orden ascendente en el edificio' },
  },
  fr: {
    RULE_EMPTY_NAME:                 { label: 'Nom vide',                  description: 'Élément sans nom (Name = "" ou nul)' },
    RULE_EMPTY_LONGNAME:             { label: 'Nom long vide',             description: 'IfcSpace/Storey/Building sans LongName' },
    RULE_DUPLICATE_NAME:             { label: 'Nom dupliqué',              description: 'Deux éléments frères ou plus partagent le même nom' },
    RULE_NAMING_CONVENTION:          { label: 'Convention de nommage',     description: 'Le nom ne correspond pas au modèle BEP du projet' },
    RULE_DUPLICATE_GUID:             { label: 'GUID dupliqué',             description: 'Deux éléments ou plus partagent le même GlobalId' },
    RULE_INVALID_GUID_FORMAT:        { label: 'Format GUID invalide',      description: 'Le GlobalId ne respecte pas l\'encodage base-64 IFC' },
    RULE_ORPHAN_ELEMENT:             { label: 'Élément orphelin',          description: 'Élément physique sans conteneur spatial ni parent d\'agrégation' },
    RULE_WRONG_CONTAINER:            { label: 'Conteneur incorrect',       description: 'Élément contenu dans une structure spatiale de type incorrect' },
    RULE_BROKEN_AGGREGATE:           { label: 'Agrégation brisée',         description: 'IfcRelAggregates pointe vers une entité inexistante' },
    RULE_SPATIAL_HIERARCHY:          { label: 'Hiérarchie spatiale',       description: 'La structure spatiale n\'est pas enracinée dans IfcProject' },
    RULE_CIRCULAR_REFERENCE:         { label: 'Référence circulaire',      description: 'La relation d\'agrégation ou de contenance forme un cycle' },
    RULE_ELEMENT_IN_BUILDING:        { label: 'Élément dans bâtiment',     description: 'Élément placé directement dans IfcBuilding — doit être dans un étage' },
    RULE_MISSING_TYPE:               { label: 'Type manquant',             description: 'Élément sans IfcTypeObject (IfcWallType, IfcDoorType, …)' },
    RULE_MISSING_PROPERTY_SET:       { label: 'Pset manquant',             description: 'Élément sans les Pset requis par la configuration du projet' },
    RULE_EMPTY_PROPERTY_VALUE:       { label: 'Valeur de propriété vide',  description: 'IfcPropertySingleValue avec valeur nominale nulle ou vide' },
    RULE_MISSING_MATERIAL:           { label: 'Matériau manquant',         description: 'Élément physique sans IfcRelAssociatesMaterial' },
    RULE_INVALID_IFC_VERSION:        { label: 'Version IFC invalide',      description: 'Le fichier utilise un schéma IFC obsolète ou non reconnu' },
    RULE_ELEMENT_CLASH:              { label: 'Conflit d\'éléments',       description: 'Deux éléments structurels ont des boîtes englobantes qui se chevauchent' },
    RULE_MISSING_PROJECT:            { label: 'Projet manquant',           description: 'Le fichier ne contient aucune entité IfcProject' },
    RULE_MISSING_BUILDING:           { label: 'Bâtiment manquant',         description: 'Aucun IfcBuilding trouvé sous IfcSite' },
    RULE_MISSING_STOREY:             { label: 'Étage manquant',            description: 'IfcBuilding sans enfants IfcBuildingStorey' },
    RULE_EMPTY_STOREY:               { label: 'Étage vide',                description: 'IfcBuildingStorey sans éléments ni espaces' },
    RULE_FILE_DESCRIPTION_MISSING:   { label: 'Pas de description fichier', description: 'L\'en-tête STEP FILE_DESCRIPTION est vide' },
    RULE_FILE_AUTHOR_MISSING:        { label: 'Pas d\'auteur fichier',     description: 'L\'en-tête STEP FILE_NAME ne spécifie pas d\'auteur' },
    RULE_PROJECT_LONGNAME_MISSING:   { label: 'Projet sans nom long',      description: 'IfcProject.LongName est vide' },
    RULE_STOREY_ELEVATION_MISSING:   { label: 'Élévation d\'étage manquante', description: 'IfcBuildingStorey.Elevation est nul' },
    RULE_ISO19650_PROJECT_INFO:      { label: 'Info projet ISO 19650',     description: 'IfcProject sans LongName, Description ou ObjectType requis par ISO 19650' },
    RULE_ISO19650_AUTHOR_INFO:       { label: 'Info auteur ISO 19650',     description: 'En-tête STEP sans auteur ni organisation pour la traçabilité' },
    RULE_ISO19650_FILENAME:          { label: 'Nom de fichier ISO 19650',  description: 'Le nom de fichier ne suit pas la convention ISO 19650' },
    RULE_LOD_PSET_MISSING:           { label: 'Pset LOD manquant',         description: 'Élément sans les Pset requis pour le niveau LOD déclaré' },
    RULE_LOD_QUANTITY_MISSING:       { label: 'Quantités LOD manquantes',  description: 'Élément structurel sans IfcElementQuantity pour le LOD déclaré' },
    RULE_LOD_MATERIAL_LAYER_MISSING: { label: 'Pas de couches de matériau', description: 'Mur/dalle sans IfcMaterialLayerSetUsage au LOD ≥ 300' },
    RULE_MISSING_CLASSIFICATION:     { label: 'Classification manquante',  description: 'Élément physique sans IfcRelAssociatesClassification' },
    RULE_MEP_SYSTEM_MISSING:         { label: 'Système MEP manquant',      description: 'Élément de flux MEP non affecté à un IfcSystem' },
    RULE_CLASH_MEP_STRUCTURAL:       { label: 'Conflit MEP/structure',     description: 'La boîte englobante d\'un élément MEP chevauche un élément structurel' },
    RULE_PROXY_OVERUSE:              { label: 'Suremploi de proxies',       description: 'Plus de 5% des éléments sont IfcBuildingElementProxy — typiquement des familles Revit non converties' },
    RULE_COORDINATE_OFFSET:          { label: 'Décalage de coordonnées',   description: 'La géométrie est à plus de 10 km de l\'origine SCM — provoque des erreurs de précision virgule flottante' },
    RULE_FILE_SIZE_ANOMALY:          { label: 'Anomalie de taille de fichier', description: 'Le fichier est anormalement volumineux par élément — géométrie trop détaillée ou textures incorporées' },
    RULE_OPENING_WITHOUT_HOST:       { label: 'Ouverture sans hôte',         description: 'IfcOpeningElement non connecté à un élément hôte via IfcRelVoidsElement' },
    RULE_STOREY_ELEVATION_DUPLICATE: { label: 'Élévation de niveau dupliquée', description: 'Deux niveaux ou plus dans le même bâtiment ont la même valeur d\'élévation' },
    RULE_UNIT_CONSISTENCY:           { label: 'Unité de longueur impériale',    description: 'La LENGTHUNIT du modèle est impériale (pied/pouce) — l\'échange IFC requiert des unités métriques SI' },
    RULE_SPACE_AREA_MISSING:         { label: 'Espace sans surface de plancher', description: 'IfcSpace sans quantité NetFloorArea — requise pour l\'analyse énergétique et les métrés' },
    RULE_CONNECTED_MEP:              { label: 'Segment MEP déconnecté',         description: 'IfcPipeSegment / IfcDuctSegment sans connexion IfcDistributionPort' },
    RULE_STOREY_ELEVATION_ORDER:     { label: 'Niveaux hors ordre',             description: 'Les élévations des IfcBuildingStorey ne sont pas dans l\'ordre croissant dans le bâtiment' },
  },
  de: {
    RULE_EMPTY_NAME:                 { label: 'Leerer Name',               description: 'Element ohne Name (Name = "" oder null)' },
    RULE_EMPTY_LONGNAME:             { label: 'Leerer Langname',           description: 'IfcSpace/Storey/Building ohne LongName' },
    RULE_DUPLICATE_NAME:             { label: 'Doppelter Name',            description: 'Zwei oder mehr Geschwisterelemente teilen denselben Namen' },
    RULE_NAMING_CONVENTION:          { label: 'Namenskonvention',          description: 'Name entspricht nicht dem BEP-Muster des Projekts' },
    RULE_DUPLICATE_GUID:             { label: 'Doppelte GUID',             description: 'Zwei oder mehr Elemente teilen dieselbe GlobalId' },
    RULE_INVALID_GUID_FORMAT:        { label: 'Ungültiges GUID-Format',    description: 'GlobalId folgt nicht der IFC-Base-64-Kodierung' },
    RULE_ORPHAN_ELEMENT:             { label: 'Verwaistes Element',        description: 'Physisches Element ohne räumlichen Container oder Aggregationsparent' },
    RULE_WRONG_CONTAINER:            { label: 'Falscher Container',        description: 'Element in einer räumlichen Struktur des falschen Typs enthalten' },
    RULE_BROKEN_AGGREGATE:           { label: 'Beschädigte Aggregation',   description: 'IfcRelAggregates verweist auf eine nicht existierende Entität' },
    RULE_SPATIAL_HIERARCHY:          { label: 'Räumliche Hierarchie',      description: 'Räumliche Struktur ist nicht in IfcProject verwurzelt' },
    RULE_CIRCULAR_REFERENCE:         { label: 'Zirkuläre Referenz',        description: 'Aggregations- oder Enthaltensbeziehung bildet einen Zyklus' },
    RULE_ELEMENT_IN_BUILDING:        { label: 'Element im Gebäude',        description: 'Element direkt in IfcBuilding platziert — muss in einem Geschoss sein' },
    RULE_MISSING_TYPE:               { label: 'Fehlender Typ',             description: 'Element ohne IfcTypeObject (IfcWallType, IfcDoorType, …)' },
    RULE_MISSING_PROPERTY_SET:       { label: 'Fehlendes Pset',            description: 'Element ohne die vom Projekt geforderten Psets' },
    RULE_EMPTY_PROPERTY_VALUE:       { label: 'Leerer Eigenschaftswert',   description: 'IfcPropertySingleValue mit null oder leerem Nominalwert' },
    RULE_MISSING_MATERIAL:           { label: 'Fehlendes Material',        description: 'Physisches Element ohne IfcRelAssociatesMaterial' },
    RULE_INVALID_IFC_VERSION:        { label: 'Ungültige IFC-Version',     description: 'Datei verwendet ein veraltetes oder unbekanntes IFC-Schema' },
    RULE_ELEMENT_CLASH:              { label: 'Elementkollision',          description: 'Zwei Strukturelemente haben überlappende Begrenzungsrahmen' },
    RULE_MISSING_PROJECT:            { label: 'Fehlendes Projekt',         description: 'Datei enthält keine IfcProject-Entität' },
    RULE_MISSING_BUILDING:           { label: 'Fehlendes Gebäude',         description: 'Kein IfcBuilding unter IfcSite gefunden' },
    RULE_MISSING_STOREY:             { label: 'Fehlendes Geschoss',        description: 'IfcBuilding ohne IfcBuildingStorey-Kinder' },
    RULE_EMPTY_STOREY:               { label: 'Leeres Geschoss',           description: 'IfcBuildingStorey ohne Elemente oder Räume' },
    RULE_FILE_DESCRIPTION_MISSING:   { label: 'Keine Dateibeschreibung',   description: 'STEP-Header FILE_DESCRIPTION ist leer' },
    RULE_FILE_AUTHOR_MISSING:        { label: 'Kein Dateiautor',           description: 'STEP-Header FILE_NAME gibt keinen Autor an' },
    RULE_PROJECT_LONGNAME_MISSING:   { label: 'Projekt ohne Langname',     description: 'IfcProject.LongName ist leer' },
    RULE_STOREY_ELEVATION_MISSING:   { label: 'Geschossebene fehlt',       description: 'IfcBuildingStorey.Elevation ist null' },
    RULE_ISO19650_PROJECT_INFO:      { label: 'ISO 19650 Projektinfo',     description: 'IfcProject ohne LongName, Description oder ObjectType gemäß ISO 19650' },
    RULE_ISO19650_AUTHOR_INFO:       { label: 'ISO 19650 Autoreninfo',     description: 'STEP-Header ohne Autor oder Organisation für Rückverfolgbarkeit' },
    RULE_ISO19650_FILENAME:          { label: 'ISO 19650 Dateiname',       description: 'Dateiname folgt nicht der ISO 19650-Namenskonvention' },
    RULE_LOD_PSET_MISSING:           { label: 'LOD-Pset fehlt',            description: 'Element ohne erforderliche Psets für die deklarierte LOD-Stufe' },
    RULE_LOD_QUANTITY_MISSING:       { label: 'LOD-Mengen fehlen',         description: 'Strukturelement ohne IfcElementQuantity für die deklarierte LOD' },
    RULE_LOD_MATERIAL_LAYER_MISSING: { label: 'Keine Materialschichten',   description: 'Wand/Platte ohne IfcMaterialLayerSetUsage bei LOD ≥ 300' },
    RULE_MISSING_CLASSIFICATION:     { label: 'Klassifikation fehlt',      description: 'Physisches Element ohne IfcRelAssociatesClassification' },
    RULE_MEP_SYSTEM_MISSING:         { label: 'MEP-System fehlt',          description: 'MEP-Strömungselement keinem IfcSystem zugewiesen' },
    RULE_CLASH_MEP_STRUCTURAL:       { label: 'MEP/Struktur-Kollision',    description: 'Begrenzungsrahmen eines MEP-Elements überlappt ein Strukturelement' },
    RULE_PROXY_OVERUSE:              { label: 'Proxy-Überbenutzung',        description: 'Mehr als 5% der Elemente sind IfcBuildingElementProxy — typischerweise nicht konvertierte Revit-Familien' },
    RULE_COORDINATE_OFFSET:          { label: 'Großer Koordinatenversatz', description: 'Geometrie ist mehr als 10 km vom WCS-Ursprung entfernt — verursacht Gleitkomma-Präzisionsfehler' },
    RULE_FILE_SIZE_ANOMALY:          { label: 'Dateigrößen-Anomalie',      description: 'Datei ist pro Element ungewöhnlich groß — wahrscheinlich übermäßig detaillierte Geometrie oder eingebettete Texturen' },
    RULE_OPENING_WITHOUT_HOST:       { label: 'Öffnung ohne Host',          description: 'IfcOpeningElement nicht mit einem Host-Element über IfcRelVoidsElement verbunden' },
    RULE_STOREY_ELEVATION_DUPLICATE: { label: 'Duplizierte Geschosshöhe',   description: 'Zwei oder mehr Geschosse im selben Gebäude haben denselben Höhenwert' },
    RULE_UNIT_CONSISTENCY:           { label: 'Imperiale Längeneinheit',    description: 'LENGTHUNIT des Modells ist imperial (Fuß/Zoll) — IFC-Austausch erfordert SI-metrische Einheiten' },
    RULE_SPACE_AREA_MISSING:         { label: 'Raum ohne Bodenfläche',      description: 'IfcSpace ohne NetFloorArea-Menge — erforderlich für Energieanalyse und Mengenermittlung' },
    RULE_CONNECTED_MEP:              { label: 'Getrenntes MEP-Segment',     description: 'IfcPipeSegment / IfcDuctSegment ohne IfcDistributionPort-Verbindung' },
    RULE_STOREY_ELEVATION_ORDER:     { label: 'Geschosse in falscher Reihenfolge', description: 'IfcBuildingStorey-Höhen nicht in aufsteigender Reihenfolge im Gebäude' },
  },
  pt: {
    RULE_EMPTY_NAME:                 { label: 'Nome vazio',                description: 'Elemento sem nome (Name = "" ou nulo)' },
    RULE_EMPTY_LONGNAME:             { label: 'Nome longo vazio',          description: 'IfcSpace/Storey/Building sem LongName' },
    RULE_DUPLICATE_NAME:             { label: 'Nome duplicado',            description: 'Dois ou mais elementos irmãos partilham o mesmo nome' },
    RULE_NAMING_CONVENTION:          { label: 'Convenção de nomes',        description: 'O nome não corresponde ao padrão BEP do projeto' },
    RULE_DUPLICATE_GUID:             { label: 'GUID duplicado',            description: 'Dois ou mais elementos partilham o mesmo GlobalId' },
    RULE_INVALID_GUID_FORMAT:        { label: 'Formato GUID inválido',     description: 'O GlobalId não segue a codificação base-64 do IFC' },
    RULE_ORPHAN_ELEMENT:             { label: 'Elemento órfão',            description: 'Elemento físico sem contentor espacial ou pai de agregação' },
    RULE_WRONG_CONTAINER:            { label: 'Contentor incorreto',       description: 'Elemento contido numa estrutura espacial de tipo incorreto' },
    RULE_BROKEN_AGGREGATE:           { label: 'Agregação quebrada',        description: 'IfcRelAggregates aponta para uma entidade inexistente' },
    RULE_SPATIAL_HIERARCHY:          { label: 'Hierarquia espacial',       description: 'A estrutura espacial não está enraizada no IfcProject' },
    RULE_CIRCULAR_REFERENCE:         { label: 'Referência circular',       description: 'A relação de agregação ou contenção forma um ciclo' },
    RULE_ELEMENT_IN_BUILDING:        { label: 'Elemento no edifício',      description: 'Elemento colocado diretamente em IfcBuilding — deve estar num piso' },
    RULE_MISSING_TYPE:               { label: 'Tipo em falta',             description: 'Elemento sem IfcTypeObject (IfcWallType, IfcDoorType, …)' },
    RULE_MISSING_PROPERTY_SET:       { label: 'Pset em falta',             description: 'Elemento sem os Psets exigidos pela configuração do projeto' },
    RULE_EMPTY_PROPERTY_VALUE:       { label: 'Valor de propriedade vazio', description: 'IfcPropertySingleValue com valor nominal nulo ou vazio' },
    RULE_MISSING_MATERIAL:           { label: 'Material em falta',         description: 'Elemento físico sem IfcRelAssociatesMaterial' },
    RULE_INVALID_IFC_VERSION:        { label: 'Versão IFC inválida',       description: 'O ficheiro usa um esquema IFC obsoleto ou não reconhecido' },
    RULE_ELEMENT_CLASH:              { label: 'Colisão de elementos',      description: 'Dois elementos estruturais têm caixas delimitadoras sobrepostas' },
    RULE_MISSING_PROJECT:            { label: 'Projeto em falta',          description: 'O ficheiro não contém nenhuma entidade IfcProject' },
    RULE_MISSING_BUILDING:           { label: 'Edifício em falta',         description: 'Nenhum IfcBuilding encontrado sob IfcSite' },
    RULE_MISSING_STOREY:             { label: 'Piso em falta',             description: 'IfcBuilding sem filhos IfcBuildingStorey' },
    RULE_EMPTY_STOREY:               { label: 'Piso vazio',                description: 'IfcBuildingStorey sem elementos ou espaços' },
    RULE_FILE_DESCRIPTION_MISSING:   { label: 'Sem descrição de ficheiro', description: 'O cabeçalho STEP FILE_DESCRIPTION está vazio' },
    RULE_FILE_AUTHOR_MISSING:        { label: 'Sem autor de ficheiro',     description: 'O cabeçalho STEP FILE_NAME não especifica autor' },
    RULE_PROJECT_LONGNAME_MISSING:   { label: 'Projeto sem nome longo',    description: 'IfcProject.LongName está vazio' },
    RULE_STOREY_ELEVATION_MISSING:   { label: 'Elevação de piso em falta', description: 'IfcBuildingStorey.Elevation é nulo' },
    RULE_ISO19650_PROJECT_INFO:      { label: 'Info projeto ISO 19650',    description: 'IfcProject sem LongName, Description ou ObjectType exigidos pelo ISO 19650' },
    RULE_ISO19650_AUTHOR_INFO:       { label: 'Info autor ISO 19650',      description: 'Cabeçalho STEP sem autor ou organização para rastreabilidade' },
    RULE_ISO19650_FILENAME:          { label: 'Nome ficheiro ISO 19650',   description: 'O nome do ficheiro não segue a convenção ISO 19650' },
    RULE_LOD_PSET_MISSING:           { label: 'Pset LOD em falta',         description: 'Elemento sem os Psets exigidos para o nível LOD declarado' },
    RULE_LOD_QUANTITY_MISSING:       { label: 'Quantidades LOD em falta',  description: 'Elemento estrutural sem IfcElementQuantity para o LOD declarado' },
    RULE_LOD_MATERIAL_LAYER_MISSING: { label: 'Sem camadas de material',   description: 'Parede/laje sem IfcMaterialLayerSetUsage em LOD ≥ 300' },
    RULE_MISSING_CLASSIFICATION:     { label: 'Classificação em falta',    description: 'Elemento físico sem IfcRelAssociatesClassification' },
    RULE_MEP_SYSTEM_MISSING:         { label: 'Sistema MEP em falta',      description: 'Elemento de fluxo MEP não atribuído a nenhum IfcSystem' },
    RULE_CLASH_MEP_STRUCTURAL:       { label: 'Colisão MEP/estrutura',     description: 'Caixa delimitadora de elemento MEP sobrepõe elemento estrutural' },
    RULE_PROXY_OVERUSE:              { label: 'Uso excessivo de proxy',     description: 'Mais de 5% dos elementos são IfcBuildingElementProxy — tipicamente famílias Revit não convertidas' },
    RULE_COORDINATE_OFFSET:          { label: 'Grande desvio de coordenadas', description: 'A geometria está a mais de 10 km da origem WCS — provoca erros de precisão de vírgula flutuante' },
    RULE_FILE_SIZE_ANOMALY:          { label: 'Anomalia de tamanho de ficheiro', description: 'O ficheiro é anormalmente grande por elemento — geometria excessivamente detalhada ou texturas incorporadas' },
    RULE_OPENING_WITHOUT_HOST:       { label: 'Abertura sem hospedeiro',    description: 'IfcOpeningElement não conectado a nenhum elemento hospedeiro via IfcRelVoidsElement' },
    RULE_STOREY_ELEVATION_DUPLICATE: { label: 'Elevação de piso duplicada', description: 'Dois ou mais pisos no mesmo edifício partilham o mesmo valor de elevação' },
    RULE_UNIT_CONSISTENCY:           { label: 'Unidade de comprimento imperial', description: 'A LENGTHUNIT do modelo é imperial (pé/polegada) — a troca IFC requer unidades métricas SI' },
    RULE_SPACE_AREA_MISSING:         { label: 'Espaço sem área de piso',    description: 'IfcSpace sem quantidade NetFloorArea — necessária para análise energética e medições' },
    RULE_CONNECTED_MEP:              { label: 'Segmento MEP desconectado',  description: 'IfcPipeSegment / IfcDuctSegment sem ligação IfcDistributionPort' },
    RULE_STOREY_ELEVATION_ORDER:     { label: 'Pisos fora de ordem',        description: 'Elevações de IfcBuildingStorey não estão em ordem ascendente no edifício' },
  },
  it: {
    RULE_EMPTY_NAME:                 { label: 'Nome vuoto',                description: 'Elemento senza nome (Name = "" o nullo)' },
    RULE_EMPTY_LONGNAME:             { label: 'Nome lungo vuoto',          description: 'IfcSpace/Storey/Building senza LongName' },
    RULE_DUPLICATE_NAME:             { label: 'Nome duplicato',            description: 'Due o più elementi fratelli condividono lo stesso nome' },
    RULE_NAMING_CONVENTION:          { label: 'Convenzione di nomenclatura', description: 'Il nome non corrisponde al modello BEP del progetto' },
    RULE_DUPLICATE_GUID:             { label: 'GUID duplicato',            description: 'Due o più elementi condividono lo stesso GlobalId' },
    RULE_INVALID_GUID_FORMAT:        { label: 'Formato GUID non valido',   description: 'Il GlobalId non segue la codifica base-64 IFC' },
    RULE_ORPHAN_ELEMENT:             { label: 'Elemento orfano',           description: 'Elemento fisico senza contenitore spaziale o genitore di aggregazione' },
    RULE_WRONG_CONTAINER:            { label: 'Contenitore errato',        description: 'Elemento contenuto in una struttura spaziale di tipo errato' },
    RULE_BROKEN_AGGREGATE:           { label: 'Aggregazione spezzata',     description: 'IfcRelAggregates punta a un\'entità inesistente' },
    RULE_SPATIAL_HIERARCHY:          { label: 'Gerarchia spaziale',        description: 'La struttura spaziale non è radicata in IfcProject' },
    RULE_CIRCULAR_REFERENCE:         { label: 'Riferimento circolare',     description: 'La relazione di aggregazione o contenimento forma un ciclo' },
    RULE_ELEMENT_IN_BUILDING:        { label: 'Elemento nell\'edificio',   description: 'Elemento posizionato direttamente in IfcBuilding — deve essere in un piano' },
    RULE_MISSING_TYPE:               { label: 'Tipo mancante',             description: 'Elemento senza IfcTypeObject (IfcWallType, IfcDoorType, …)' },
    RULE_MISSING_PROPERTY_SET:       { label: 'Pset mancante',             description: 'Elemento senza i Pset richiesti dalla configurazione del progetto' },
    RULE_EMPTY_PROPERTY_VALUE:       { label: 'Valore di proprietà vuoto', description: 'IfcPropertySingleValue con valore nominale nullo o vuoto' },
    RULE_MISSING_MATERIAL:           { label: 'Materiale mancante',        description: 'Elemento fisico senza IfcRelAssociatesMaterial' },
    RULE_INVALID_IFC_VERSION:        { label: 'Versione IFC non valida',   description: 'Il file usa uno schema IFC obsoleto o non riconosciuto' },
    RULE_ELEMENT_CLASH:              { label: 'Scontro di elementi',       description: 'Due elementi strutturali hanno bounding box sovrapposti' },
    RULE_MISSING_PROJECT:            { label: 'Progetto mancante',         description: 'Il file non contiene alcuna entità IfcProject' },
    RULE_MISSING_BUILDING:           { label: 'Edificio mancante',         description: 'Nessun IfcBuilding trovato sotto IfcSite' },
    RULE_MISSING_STOREY:             { label: 'Piano mancante',            description: 'IfcBuilding senza figli IfcBuildingStorey' },
    RULE_EMPTY_STOREY:               { label: 'Piano vuoto',               description: 'IfcBuildingStorey senza elementi o spazi' },
    RULE_FILE_DESCRIPTION_MISSING:   { label: 'Nessuna descrizione file',  description: 'L\'intestazione STEP FILE_DESCRIPTION è vuota' },
    RULE_FILE_AUTHOR_MISSING:        { label: 'Nessun autore file',        description: 'L\'intestazione STEP FILE_NAME non specifica un autore' },
    RULE_PROJECT_LONGNAME_MISSING:   { label: 'Progetto senza nome lungo', description: 'IfcProject.LongName è vuoto' },
    RULE_STOREY_ELEVATION_MISSING:   { label: 'Elevazione piano mancante', description: 'IfcBuildingStorey.Elevation è nullo' },
    RULE_ISO19650_PROJECT_INFO:      { label: 'Info progetto ISO 19650',   description: 'IfcProject senza LongName, Description o ObjectType richiesti da ISO 19650' },
    RULE_ISO19650_AUTHOR_INFO:       { label: 'Info autore ISO 19650',     description: 'Intestazione STEP senza autore o organizzazione per la tracciabilità' },
    RULE_ISO19650_FILENAME:          { label: 'Nome file ISO 19650',       description: 'Il nome del file non segue la convenzione ISO 19650' },
    RULE_LOD_PSET_MISSING:           { label: 'Pset LOD mancante',         description: 'Elemento senza i Pset richiesti per il livello LOD dichiarato' },
    RULE_LOD_QUANTITY_MISSING:       { label: 'Quantità LOD mancanti',     description: 'Elemento strutturale senza IfcElementQuantity per il LOD dichiarato' },
    RULE_LOD_MATERIAL_LAYER_MISSING: { label: 'Nessuno strato di materiale', description: 'Parete/solaio senza IfcMaterialLayerSetUsage a LOD ≥ 300' },
    RULE_MISSING_CLASSIFICATION:     { label: 'Classificazione mancante',  description: 'Elemento fisico senza IfcRelAssociatesClassification' },
    RULE_MEP_SYSTEM_MISSING:         { label: 'Sistema MEP mancante',      description: 'Elemento di flusso MEP non assegnato ad alcun IfcSystem' },
    RULE_CLASH_MEP_STRUCTURAL:       { label: 'Scontro MEP/struttura',     description: 'Il bounding box di un elemento MEP si sovrappone a un elemento strutturale' },
    RULE_PROXY_OVERUSE:              { label: 'Uso eccessivo di proxy',     description: 'Più del 5% degli elementi sono IfcBuildingElementProxy — tipicamente famiglie Revit non convertite' },
    RULE_COORDINATE_OFFSET:          { label: 'Grande offset di coordinate', description: 'La geometria è a più di 10 km dall\'origine WCS — causa errori di precisione in virgola mobile' },
    RULE_FILE_SIZE_ANOMALY:          { label: 'Anomalia dimensione file',   description: 'Il file è insolitamente grande per elemento — probabile geometria troppo dettagliata o texture incorporate' },
    RULE_OPENING_WITHOUT_HOST:       { label: 'Apertura senza host',        description: 'IfcOpeningElement non collegato ad alcun elemento host tramite IfcRelVoidsElement' },
    RULE_STOREY_ELEVATION_DUPLICATE: { label: 'Elevazione piano duplicata', description: 'Due o più piani nello stesso edificio condividono lo stesso valore di elevazione' },
    RULE_UNIT_CONSISTENCY:           { label: 'Unità di lunghezza imperiale', description: 'La LENGTHUNIT del modello è imperiale (piede/pollice) — l\'interscambio IFC richiede unità metriche SI' },
    RULE_SPACE_AREA_MISSING:         { label: 'Spazio senza area del pavimento', description: 'IfcSpace senza quantità NetFloorArea — richiesta per analisi energetica e computi metrici' },
    RULE_CONNECTED_MEP:              { label: 'Segmento MEP scollegato',    description: 'IfcPipeSegment / IfcDuctSegment senza connessione IfcDistributionPort' },
    RULE_STOREY_ELEVATION_ORDER:     { label: 'Piani fuori ordine',         description: 'Le elevazioni di IfcBuildingStorey non sono in ordine ascendente nell\'edificio' },
  },
  zh: {
    RULE_EMPTY_NAME:                 { label: '空名称',                    description: '元素没有名称（Name = "" 或空）' },
    RULE_EMPTY_LONGNAME:             { label: '空长名称',                  description: 'IfcSpace/Storey/Building 没有 LongName' },
    RULE_DUPLICATE_NAME:             { label: '重复名称',                  description: '两个或多个同级元素共享相同的名称' },
    RULE_NAMING_CONVENTION:          { label: '命名规范',                  description: '名称不符合项目 BEP 模式' },
    RULE_DUPLICATE_GUID:             { label: '重复 GUID',                 description: '两个或多个元素共享相同的 GlobalId' },
    RULE_INVALID_GUID_FORMAT:        { label: '无效 GUID 格式',            description: 'GlobalId 不遵循 IFC base-64 编码' },
    RULE_ORPHAN_ELEMENT:             { label: '孤立元素',                  description: '物理元素没有空间容器或聚合父级' },
    RULE_WRONG_CONTAINER:            { label: '错误容器',                  description: '元素包含在错误类型的空间结构中' },
    RULE_BROKEN_AGGREGATE:           { label: '损坏的聚合',                description: 'IfcRelAggregates 指向不存在的实体' },
    RULE_SPATIAL_HIERARCHY:          { label: '空间层次结构',              description: '空间结构未以 IfcProject 为根' },
    RULE_CIRCULAR_REFERENCE:         { label: '循环引用',                  description: '聚合或包含关系形成循环' },
    RULE_ELEMENT_IN_BUILDING:        { label: '元素在建筑中',              description: '元素直接放置在 IfcBuilding 中 — 必须在楼层内' },
    RULE_MISSING_TYPE:               { label: '缺少类型',                  description: '元素没有 IfcTypeObject（IfcWallType、IfcDoorType 等）' },
    RULE_MISSING_PROPERTY_SET:       { label: '缺少属性集',                description: '元素缺少项目配置要求的 Pset' },
    RULE_EMPTY_PROPERTY_VALUE:       { label: '空属性值',                  description: 'IfcPropertySingleValue 的标称值为空或 null' },
    RULE_MISSING_MATERIAL:           { label: '缺少材料',                  description: '物理元素没有 IfcRelAssociatesMaterial' },
    RULE_INVALID_IFC_VERSION:        { label: '无效 IFC 版本',             description: '文件使用过时或未识别的 IFC 架构' },
    RULE_ELEMENT_CLASH:              { label: '元素碰撞',                  description: '两个结构元素的边界框重叠' },
    RULE_MISSING_PROJECT:            { label: '缺少项目',                  description: '文件不包含任何 IfcProject 实体' },
    RULE_MISSING_BUILDING:           { label: '缺少建筑',                  description: '在 IfcSite 下未找到 IfcBuilding' },
    RULE_MISSING_STOREY:             { label: '缺少楼层',                  description: 'IfcBuilding 没有 IfcBuildingStorey 子级' },
    RULE_EMPTY_STOREY:               { label: '空楼层',                    description: 'IfcBuildingStorey 没有元素或空间' },
    RULE_FILE_DESCRIPTION_MISSING:   { label: '无文件描述',                description: 'IFC STEP 头部 FILE_DESCRIPTION 为空' },
    RULE_FILE_AUTHOR_MISSING:        { label: '无文件作者',                description: 'IFC STEP 头部 FILE_NAME 未指定作者' },
    RULE_PROJECT_LONGNAME_MISSING:   { label: '项目无长名称',              description: 'IfcProject.LongName 为空' },
    RULE_STOREY_ELEVATION_MISSING:   { label: '楼层标高缺失',              description: 'IfcBuildingStorey.Elevation 为 null' },
    RULE_ISO19650_PROJECT_INFO:      { label: 'ISO 19650 项目信息',        description: 'IfcProject 缺少 ISO 19650 要求的 LongName、Description 或 ObjectType' },
    RULE_ISO19650_AUTHOR_INFO:       { label: 'ISO 19650 作者信息',        description: 'STEP 头部无作者或机构以供追溯' },
    RULE_ISO19650_FILENAME:          { label: 'ISO 19650 文件名',          description: '文件名不符合 ISO 19650 命名规范' },
    RULE_LOD_PSET_MISSING:           { label: 'LOD Pset 缺失',             description: '元素缺少声明 LOD 级别所需的属性集' },
    RULE_LOD_QUANTITY_MISSING:       { label: 'LOD 工程量缺失',            description: '结构元素缺少声明 LOD 的 IfcElementQuantity' },
    RULE_LOD_MATERIAL_LAYER_MISSING: { label: '无材料层',                  description: '在 LOD ≥ 300 时墙/板缺少 IfcMaterialLayerSetUsage' },
    RULE_MISSING_CLASSIFICATION:     { label: '缺少分类',                  description: '物理元素没有 IfcRelAssociatesClassification' },
    RULE_MEP_SYSTEM_MISSING:         { label: '缺少 MEP 系统',             description: 'MEP 流量元素未分配到任何 IfcSystem' },
    RULE_CLASH_MEP_STRUCTURAL:       { label: 'MEP/结构碰撞',              description: 'MEP 元素边界框与结构元素重叠' },
    RULE_PROXY_OVERUSE:              { label: '代理元素过多',               description: '超过5%的元素是 IfcBuildingElementProxy — 通常是未转换的 Revit 族' },
    RULE_COORDINATE_OFFSET:          { label: '大坐标偏移',                description: '模型几何距离 WCS 原点超过 10 公里 — 导致浮点精度错误' },
    RULE_FILE_SIZE_ANOMALY:          { label: '文件大小异常',               description: '每个元素的文件大小异常偏大 — 可能是过于精细的几何体或嵌入纹理' },
    RULE_OPENING_WITHOUT_HOST:       { label: '开洞无宿主',                 description: 'IfcOpeningElement 未通过 IfcRelVoidsElement 连接到任何宿主元素' },
    RULE_STOREY_ELEVATION_DUPLICATE: { label: '楼层高程重复',               description: '同一建筑中两个或多个楼层共享相同的高程值' },
    RULE_UNIT_CONSISTENCY:           { label: '英制长度单位',               description: '模型 LENGTHUNIT 为英制（英尺/英寸）— IFC 交换要求 SI 公制单位' },
    RULE_SPACE_AREA_MISSING:         { label: '空间缺少楼板面积',           description: 'IfcSpace 无 NetFloorArea 数量 — 能耗分析和工程量清单需要此数据' },
    RULE_CONNECTED_MEP:              { label: 'MEP 管段未连接',             description: 'IfcPipeSegment / IfcDuctSegment 无 IfcDistributionPort 连接' },
    RULE_STOREY_ELEVATION_ORDER:     { label: '楼层高程顺序错误',           description: '同一建筑内 IfcBuildingStorey 的高程未按升序排列' },
  },
  ja: {
    RULE_EMPTY_NAME:                 { label: '空の名前',                  description: '名前のない要素（Name = "" または null）' },
    RULE_EMPTY_LONGNAME:             { label: '空のロング名',              description: 'LongName のない IfcSpace/Storey/Building' },
    RULE_DUPLICATE_NAME:             { label: '重複した名前',              description: '2 つ以上の兄弟要素が同じ名前を共有' },
    RULE_NAMING_CONVENTION:          { label: '命名規則',                  description: '名前がプロジェクトの BEP パターンに一致しない' },
    RULE_DUPLICATE_GUID:             { label: '重複した GUID',             description: '2 つ以上の要素が同じ GlobalId を共有' },
    RULE_INVALID_GUID_FORMAT:        { label: '無効な GUID 形式',          description: 'GlobalId が IFC base-64 エンコーディングに従っていない' },
    RULE_ORPHAN_ELEMENT:             { label: '孤立要素',                  description: '空間コンテナも集約親もない物理要素' },
    RULE_WRONG_CONTAINER:            { label: '誤ったコンテナ',            description: '誤ったタイプの空間構造に含まれる要素' },
    RULE_BROKEN_AGGREGATE:           { label: '壊れた集約',                description: 'IfcRelAggregates が存在しないエンティティを指している' },
    RULE_SPATIAL_HIERARCHY:          { label: '空間階層',                  description: '空間構造が IfcProject にルートされていない' },
    RULE_CIRCULAR_REFERENCE:         { label: '循環参照',                  description: '集約または包含関係がサイクルを形成' },
    RULE_ELEMENT_IN_BUILDING:        { label: 'ビル内の要素',              description: '要素が IfcBuilding に直接配置 — 階に配置する必要がある' },
    RULE_MISSING_TYPE:               { label: '欠落したタイプ',            description: 'IfcTypeObject のない要素（IfcWallType、IfcDoorType など）' },
    RULE_MISSING_PROPERTY_SET:       { label: '欠落した Pset',             description: 'プロジェクト設定で必要な Pset がない要素' },
    RULE_EMPTY_PROPERTY_VALUE:       { label: '空のプロパティ値',          description: 'IfcPropertySingleValue の公称値が null または空' },
    RULE_MISSING_MATERIAL:           { label: '欠落したマテリアル',        description: 'IfcRelAssociatesMaterial のない物理要素' },
    RULE_INVALID_IFC_VERSION:        { label: '無効な IFC バージョン',     description: 'ファイルが廃止または未認識の IFC スキーマを使用' },
    RULE_ELEMENT_CLASH:              { label: '要素の干渉',                description: '2 つの構造要素のバウンディングボックスが重なっている' },
    RULE_MISSING_PROJECT:            { label: '欠落したプロジェクト',      description: 'ファイルに IfcProject エンティティが含まれていない' },
    RULE_MISSING_BUILDING:           { label: '欠落したビル',              description: 'IfcSite の下に IfcBuilding が見つからない' },
    RULE_MISSING_STOREY:             { label: '欠落した階',                description: 'IfcBuilding に IfcBuildingStorey の子がない' },
    RULE_EMPTY_STOREY:               { label: '空の階',                    description: 'IfcBuildingStorey に要素もスペースもない' },
    RULE_FILE_DESCRIPTION_MISSING:   { label: 'ファイル説明なし',          description: 'STEP ヘッダー FILE_DESCRIPTION が空' },
    RULE_FILE_AUTHOR_MISSING:        { label: 'ファイル作成者なし',        description: 'STEP ヘッダー FILE_NAME に作成者が指定されていない' },
    RULE_PROJECT_LONGNAME_MISSING:   { label: 'プロジェクトにロング名なし', description: 'IfcProject.LongName が空' },
    RULE_STOREY_ELEVATION_MISSING:   { label: '階の高さが欠落',            description: 'IfcBuildingStorey.Elevation が null' },
    RULE_ISO19650_PROJECT_INFO:      { label: 'ISO 19650 プロジェクト情報', description: 'IfcProject に ISO 19650 が要求する LongName、Description、または ObjectType がない' },
    RULE_ISO19650_AUTHOR_INFO:       { label: 'ISO 19650 作成者情報',      description: 'STEP ヘッダーにトレーサビリティのための作成者または組織がない' },
    RULE_ISO19650_FILENAME:          { label: 'ISO 19650 ファイル名',      description: 'ファイル名が ISO 19650 命名規則に従っていない' },
    RULE_LOD_PSET_MISSING:           { label: 'LOD Pset 欠落',             description: '宣言された LOD レベルに必要な Pset がない要素' },
    RULE_LOD_QUANTITY_MISSING:       { label: 'LOD 数量欠落',              description: '宣言された LOD の IfcElementQuantity がない構造要素' },
    RULE_LOD_MATERIAL_LAYER_MISSING: { label: 'マテリアル層なし',          description: 'LOD ≥ 300 で IfcMaterialLayerSetUsage のない壁/スラブ' },
    RULE_MISSING_CLASSIFICATION:     { label: '欠落した分類',              description: 'IfcRelAssociatesClassification のない物理要素' },
    RULE_MEP_SYSTEM_MISSING:         { label: 'MEP システム欠落',          description: 'いずれの IfcSystem にも割り当てられていない MEP フロー要素' },
    RULE_CLASH_MEP_STRUCTURAL:       { label: 'MEP/構造干渉',              description: 'MEP 要素のバウンディングボックスが構造要素と重なっている' },
    RULE_PROXY_OVERUSE:              { label: 'プロキシの過剰使用',         description: '5%以上の要素が IfcBuildingElementProxy — 通常は変換されていない Revit ファミリ' },
    RULE_COORDINATE_OFFSET:          { label: '大きな座標オフセット',       description: 'モデルジオメトリが WCS 原点から 10 km 以上離れている — 浮動小数点精度エラーを引き起こす' },
    RULE_FILE_SIZE_ANOMALY:          { label: 'ファイルサイズの異常',        description: '要素あたりのファイルサイズが異常に大きい — 過度に詳細なジオメトリまたは埋め込みテクスチャの可能性' },
    RULE_OPENING_WITHOUT_HOST:       { label: 'ホストのない開口',            description: 'IfcOpeningElement が IfcRelVoidsElement を介してホスト要素に接続されていない' },
    RULE_STOREY_ELEVATION_DUPLICATE: { label: '階高さの重複',               description: '同じ建物内の2つ以上の階が同じ高さの値を共有している' },
    RULE_UNIT_CONSISTENCY:           { label: 'ヤード・ポンド法の長さ単位', description: 'モデルの LENGTHUNIT がヤード・ポンド法（フィート/インチ）— IFC 交換では SI 単位が必要' },
    RULE_SPACE_AREA_MISSING:         { label: 'スペースの床面積が不足',     description: 'IfcSpace に NetFloorArea 数量がない — エネルギー解析および積算に必要' },
    RULE_CONNECTED_MEP:              { label: '未接続の MEP セグメント',    description: 'IfcPipeSegment / IfcDuctSegment に IfcDistributionPort 接続がない' },
    RULE_STOREY_ELEVATION_ORDER:     { label: '階の高さが順不同',           description: '建物内の IfcBuildingStorey の高さが昇順になっていない' },
  },
  th: {
    RULE_EMPTY_NAME:                 { label: 'ชื่อว่างเปล่า',            description: 'องค์ประกอบไม่มีชื่อ (Name = "" หรือ null)' },
    RULE_EMPTY_LONGNAME:             { label: 'ชื่อยาวว่างเปล่า',         description: 'IfcSpace/Storey/Building ไม่มี LongName' },
    RULE_DUPLICATE_NAME:             { label: 'ชื่อซ้ำกัน',               description: 'องค์ประกอบพี่น้องสองรายการขึ้นไปใช้ชื่อเดียวกัน' },
    RULE_NAMING_CONVENTION:          { label: 'หลักเกณฑ์การตั้งชื่อ',    description: 'ชื่อไม่ตรงกับรูปแบบ BEP ของโครงการ' },
    RULE_DUPLICATE_GUID:             { label: 'GUID ซ้ำกัน',              description: 'องค์ประกอบสองรายการขึ้นไปใช้ GlobalId เดียวกัน' },
    RULE_INVALID_GUID_FORMAT:        { label: 'รูปแบบ GUID ไม่ถูกต้อง',  description: 'GlobalId ไม่เป็นไปตามการเข้ารหัส IFC base-64' },
    RULE_ORPHAN_ELEMENT:             { label: 'องค์ประกอบกำพร้า',         description: 'องค์ประกอบทางกายภาพไม่มีตัวบรรจุเชิงพื้นที่หรือพาเรนต์การรวม' },
    RULE_WRONG_CONTAINER:            { label: 'ตัวบรรจุไม่ถูกต้อง',       description: 'องค์ประกอบอยู่ในโครงสร้างเชิงพื้นที่ประเภทไม่ถูกต้อง' },
    RULE_BROKEN_AGGREGATE:           { label: 'การรวมเสียหาย',            description: 'IfcRelAggregates ชี้ไปยังเอนทิตีที่ไม่มีอยู่' },
    RULE_SPATIAL_HIERARCHY:          { label: 'ลำดับชั้นเชิงพื้นที่',     description: 'โครงสร้างเชิงพื้นที่ไม่มีราก IfcProject' },
    RULE_CIRCULAR_REFERENCE:         { label: 'การอ้างอิงแบบวงกลม',       description: 'ความสัมพันธ์การรวมหรือการบรรจุก่อให้เกิดวงจร' },
    RULE_ELEMENT_IN_BUILDING:        { label: 'องค์ประกอบในอาคาร',         description: 'องค์ประกอบวางอยู่ใน IfcBuilding โดยตรง — ต้องอยู่ในชั้น' },
    RULE_MISSING_TYPE:               { label: 'ประเภทหายไป',              description: 'องค์ประกอบไม่มี IfcTypeObject (IfcWallType, IfcDoorType, …)' },
    RULE_MISSING_PROPERTY_SET:       { label: 'Pset หายไป',               description: 'องค์ประกอบขาด Pset ที่กำหนดโดยการกำหนดค่าโครงการ' },
    RULE_EMPTY_PROPERTY_VALUE:       { label: 'ค่าคุณสมบัติว่างเปล่า',    description: 'IfcPropertySingleValue มีค่าระบุเป็น null หรือว่างเปล่า' },
    RULE_MISSING_MATERIAL:           { label: 'วัสดุหายไป',               description: 'องค์ประกอบทางกายภาพไม่มี IfcRelAssociatesMaterial' },
    RULE_INVALID_IFC_VERSION:        { label: 'เวอร์ชัน IFC ไม่ถูกต้อง',  description: 'ไฟล์ใช้สคีมา IFC ที่ล้าสมัยหรือไม่รู้จัก' },
    RULE_ELEMENT_CLASH:              { label: 'การชนขององค์ประกอบ',        description: 'องค์ประกอบโครงสร้างสองรายการมี bounding box ทับซ้อนกัน' },
    RULE_MISSING_PROJECT:            { label: 'โครงการหายไป',             description: 'ไฟล์ไม่มีเอนทิตี IfcProject' },
    RULE_MISSING_BUILDING:           { label: 'อาคารหายไป',               description: 'ไม่พบ IfcBuilding ใต้ IfcSite' },
    RULE_MISSING_STOREY:             { label: 'ชั้นหายไป',                description: 'IfcBuilding ไม่มีลูก IfcBuildingStorey' },
    RULE_EMPTY_STOREY:               { label: 'ชั้นว่างเปล่า',            description: 'IfcBuildingStorey ไม่มีองค์ประกอบหรือพื้นที่' },
    RULE_FILE_DESCRIPTION_MISSING:   { label: 'ไม่มีคำอธิบายไฟล์',        description: 'STEP header FILE_DESCRIPTION ว่างเปล่า' },
    RULE_FILE_AUTHOR_MISSING:        { label: 'ไม่มีผู้เขียนไฟล์',        description: 'STEP header FILE_NAME ไม่ระบุผู้เขียน' },
    RULE_PROJECT_LONGNAME_MISSING:   { label: 'โครงการไม่มีชื่อยาว',      description: 'IfcProject.LongName ว่างเปล่า' },
    RULE_STOREY_ELEVATION_MISSING:   { label: 'ระดับชั้นหายไป',           description: 'IfcBuildingStorey.Elevation เป็น null' },
    RULE_ISO19650_PROJECT_INFO:      { label: 'ข้อมูลโครงการ ISO 19650',   description: 'IfcProject ขาด LongName, Description หรือ ObjectType ที่ ISO 19650 กำหนด' },
    RULE_ISO19650_AUTHOR_INFO:       { label: 'ข้อมูลผู้เขียน ISO 19650',  description: 'STEP header ไม่มีผู้เขียนหรือองค์กรสำหรับการตรวจสอบย้อนกลับ' },
    RULE_ISO19650_FILENAME:          { label: 'ชื่อไฟล์ ISO 19650',        description: 'ชื่อไฟล์ไม่เป็นไปตามหลักเกณฑ์การตั้งชื่อ ISO 19650' },
    RULE_LOD_PSET_MISSING:           { label: 'LOD Pset หายไป',            description: 'องค์ประกอบขาด Pset ที่จำเป็นสำหรับระดับ LOD ที่ประกาศ' },
    RULE_LOD_QUANTITY_MISSING:       { label: 'ปริมาณ LOD หายไป',         description: 'องค์ประกอบโครงสร้างขาด IfcElementQuantity สำหรับ LOD ที่ประกาศ' },
    RULE_LOD_MATERIAL_LAYER_MISSING: { label: 'ไม่มีชั้นวัสดุ',           description: 'ผนัง/แผ่นพื้นขาด IfcMaterialLayerSetUsage ที่ LOD ≥ 300' },
    RULE_MISSING_CLASSIFICATION:     { label: 'การจำแนกประเภทหายไป',      description: 'องค์ประกอบทางกายภาพไม่มี IfcRelAssociatesClassification' },
    RULE_MEP_SYSTEM_MISSING:         { label: 'ระบบ MEP หายไป',           description: 'องค์ประกอบการไหล MEP ไม่ได้กำหนดให้กับ IfcSystem ใด ๆ' },
    RULE_CLASH_MEP_STRUCTURAL:       { label: 'การชน MEP/โครงสร้าง',      description: 'Bounding box ขององค์ประกอบ MEP ทับซ้อนกับองค์ประกอบโครงสร้าง' },
    RULE_PROXY_OVERUSE:              { label: 'การใช้ proxy มากเกินไป',     description: 'มากกว่า 5% ขององค์ประกอบเป็น IfcBuildingElementProxy — มักเป็นกลุ่ม Revit ที่ยังไม่ได้แปลง' },
    RULE_COORDINATE_OFFSET:          { label: 'ค่าชดเชยพิกัดขนาดใหญ่',    description: 'เรขาคณิตของโมเดลอยู่ห่างจากจุดกำเนิด WCS มากกว่า 10 กม. — ทำให้เกิดข้อผิดพลาดความแม่นยำทศนิยม' },
    RULE_FILE_SIZE_ANOMALY:          { label: 'ความผิดปกติขนาดไฟล์',       description: 'ไฟล์มีขนาดใหญ่ผิดปกติต่อองค์ประกอบ — น่าจะเป็นเรขาคณิตละเอียดเกินไปหรือพื้นผิวที่ฝังอยู่' },
    RULE_OPENING_WITHOUT_HOST:       { label: 'ช่องเปิดไม่มีโฮสต์',        description: 'IfcOpeningElement ไม่ได้เชื่อมต่อกับองค์ประกอบโฮสต์ใด ๆ ผ่าน IfcRelVoidsElement' },
    RULE_STOREY_ELEVATION_DUPLICATE: { label: 'ระดับชั้นซ้ำกัน',           description: 'ชั้นสองชั้นขึ้นไปในอาคารเดียวกันมีค่าระดับชั้นเดียวกัน' },
    RULE_UNIT_CONSISTENCY:           { label: 'หน่วยความยาวแบบอิมพีเรียล', description: 'LENGTHUNIT ของโมเดลเป็นอิมพีเรียล (ฟุต/นิ้ว) — การแลกเปลี่ยน IFC ต้องใช้หน่วย SI เมตริก' },
    RULE_SPACE_AREA_MISSING:         { label: 'พื้นที่ไม่มีพื้นที่ใช้สอย', description: 'IfcSpace ไม่มีปริมาณ NetFloorArea — จำเป็นสำหรับการวิเคราะห์พลังงานและ QS' },
    RULE_CONNECTED_MEP:              { label: 'ส่วนท่อ MEP ไม่ได้เชื่อมต่อ', description: 'IfcPipeSegment / IfcDuctSegment ไม่มีการเชื่อมต่อ IfcDistributionPort' },
    RULE_STOREY_ELEVATION_ORDER:     { label: 'ลำดับชั้นผิด',               description: 'ระดับชั้น IfcBuildingStorey ในอาคารไม่เรียงจากน้อยไปมาก' },
  },
  ca: {
    RULE_EMPTY_NAME:                 { label: 'Nom buit',                  description: 'Element sense nom (Name = "" o nul)' },
    RULE_EMPTY_LONGNAME:             { label: 'Nom llarg buit',            description: 'IfcSpace/Storey/Building sense LongName' },
    RULE_DUPLICATE_NAME:             { label: 'Nom duplicat',              description: 'Dos o més elements germans comparteixen el mateix nom' },
    RULE_NAMING_CONVENTION:          { label: 'Convenció de nomenclatura', description: 'El nom no correspon al patró BEP del projecte' },
    RULE_DUPLICATE_GUID:             { label: 'GUID duplicat',             description: 'Dos o més elements comparteixen el mateix GlobalId' },
    RULE_INVALID_GUID_FORMAT:        { label: 'Format GUID invàlid',       description: 'El GlobalId no segueix la codificació base-64 IFC' },
    RULE_ORPHAN_ELEMENT:             { label: 'Element orfe',              description: 'Element físic sense contenidor espacial ni pare d\'agregació' },
    RULE_WRONG_CONTAINER:            { label: 'Contenidor incorrecte',     description: 'Element contingut en una estructura espacial de tipus incorrecte' },
    RULE_BROKEN_AGGREGATE:           { label: 'Agregació trencada',        description: 'IfcRelAggregates apunta a una entitat inexistent' },
    RULE_SPATIAL_HIERARCHY:          { label: 'Jerarquia espacial',        description: 'L\'estructura espacial no té arrel a IfcProject' },
    RULE_CIRCULAR_REFERENCE:         { label: 'Referència circular',       description: 'La relació d\'agregació o contenció forma un cicle' },
    RULE_ELEMENT_IN_BUILDING:        { label: 'Element a l\'edifici',      description: 'Element col·locat directament a IfcBuilding — ha d\'estar en una planta' },
    RULE_MISSING_TYPE:               { label: 'Tipus que falta',           description: 'Element sense IfcTypeObject (IfcWallType, IfcDoorType, …)' },
    RULE_MISSING_PROPERTY_SET:       { label: 'Pset que falta',            description: 'Element sense els Pset requerits per la configuració del projecte' },
    RULE_EMPTY_PROPERTY_VALUE:       { label: 'Valor de propietat buit',   description: 'IfcPropertySingleValue amb valor nominal nul o buit' },
    RULE_MISSING_MATERIAL:           { label: 'Material que falta',        description: 'Element físic sense IfcRelAssociatesMaterial' },
    RULE_INVALID_IFC_VERSION:        { label: 'Versió IFC invàlida',       description: 'El fitxer usa un esquema IFC obsolet o no reconegut' },
    RULE_ELEMENT_CLASH:              { label: 'Col·lisió d\'elements',     description: 'Dos elements estructurals tenen caixes delimitadores que es superposen' },
    RULE_MISSING_PROJECT:            { label: 'Projecte que falta',        description: 'El fitxer no conté cap entitat IfcProject' },
    RULE_MISSING_BUILDING:           { label: 'Edifici que falta',         description: 'Cap IfcBuilding trobat sota IfcSite' },
    RULE_MISSING_STOREY:             { label: 'Planta que falta',          description: 'IfcBuilding sense fills IfcBuildingStorey' },
    RULE_EMPTY_STOREY:               { label: 'Planta buida',              description: 'IfcBuildingStorey sense elements ni espais' },
    RULE_FILE_DESCRIPTION_MISSING:   { label: 'Sense descripció de fitxer', description: 'La capçalera STEP FILE_DESCRIPTION és buida' },
    RULE_FILE_AUTHOR_MISSING:        { label: 'Sense autor de fitxer',     description: 'La capçalera STEP FILE_NAME no especifica autor' },
    RULE_PROJECT_LONGNAME_MISSING:   { label: 'Projecte sense nom llarg',  description: 'IfcProject.LongName és buit' },
    RULE_STOREY_ELEVATION_MISSING:   { label: 'Elevació de planta que falta', description: 'IfcBuildingStorey.Elevation és nul' },
    RULE_ISO19650_PROJECT_INFO:      { label: 'Info projecte ISO 19650',   description: 'IfcProject sense LongName, Description o ObjectType requerits per ISO 19650' },
    RULE_ISO19650_AUTHOR_INFO:       { label: 'Info autor ISO 19650',      description: 'Capçalera STEP sense autor ni organització per a la traçabilitat' },
    RULE_ISO19650_FILENAME:          { label: 'Nom fitxer ISO 19650',      description: 'El nom del fitxer no segueix la convenció ISO 19650' },
    RULE_LOD_PSET_MISSING:           { label: 'Pset LOD que falta',        description: 'Element sense els Pset requerits per al nivell LOD declarat' },
    RULE_LOD_QUANTITY_MISSING:       { label: 'Quantitats LOD que falten', description: 'Element estructural sense IfcElementQuantity per al LOD declarat' },
    RULE_LOD_MATERIAL_LAYER_MISSING: { label: 'Sense capes de material',   description: 'Paret/llosa sense IfcMaterialLayerSetUsage a LOD ≥ 300' },
    RULE_MISSING_CLASSIFICATION:     { label: 'Classificació que falta',   description: 'Element físic sense IfcRelAssociatesClassification' },
    RULE_MEP_SYSTEM_MISSING:         { label: 'Sistema MEP que falta',     description: 'Element de flux MEP no assignat a cap IfcSystem' },
    RULE_CLASH_MEP_STRUCTURAL:       { label: 'Col·lisió MEP/estructura',  description: 'La caixa delimitadora d\'un element MEP se superposa a un element estructural' },
    RULE_PROXY_OVERUSE:              { label: 'Ús excessiu de proxies',     description: 'Més del 5% dels elements són IfcBuildingElementProxy — típicament famílies de Revit no convertides' },
    RULE_COORDINATE_OFFSET:          { label: 'Gran desplaçament de coordenades', description: 'La geometria està a més de 10 km de l\'origen WCS — provoca errors de precisió en coma flotant' },
    RULE_FILE_SIZE_ANOMALY:          { label: 'Anomalia de mida de fitxer',  description: 'El fitxer és inusualment gran per element — probablement geometria massa detallada o textures incrustades' },
    RULE_OPENING_WITHOUT_HOST:       { label: 'Obertura sense amfitrió',     description: 'IfcOpeningElement no connectat a cap element amfitrió via IfcRelVoidsElement' },
    RULE_STOREY_ELEVATION_DUPLICATE: { label: 'Elevació de planta duplicada', description: 'Dues o més plantes del mateix edifici comparteixen el mateix valor d\'elevació' },
    RULE_UNIT_CONSISTENCY:           { label: 'Unitat de longitud imperial',  description: 'La LENGTHUNIT del model és imperial (peu/polzada) — l\'intercanvi IFC requereix unitats mètriques SI' },
    RULE_SPACE_AREA_MISSING:         { label: 'Espai sense àrea de paviment', description: 'IfcSpace sense quantitat NetFloorArea — necessària per a l\'anàlisi energètica i les medicions' },
    RULE_CONNECTED_MEP:              { label: 'Segment MEP desconnectat',     description: 'IfcPipeSegment / IfcDuctSegment sense connexió IfcDistributionPort' },
    RULE_STOREY_ELEVATION_ORDER:     { label: 'Plantes fora d\'ordre',        description: 'Les elevacions d\'IfcBuildingStorey no estan en ordre ascendent a l\'edifici' },
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

// Per-rule remediation guidance (how to fix in Revit/ArchiCAD/Tekla/Allplan).
// Authored as a deterministic content table in the i18n layer — see D-22.
export {
  AUTHORING_TOOLS,
  RULE_REMEDIATION,
  getRuleRemediation,
} from '../i18n/rule-remediation'
export type { AuthoringTool, RuleRemediation } from '../i18n/rule-remediation'

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
  dueDate?:        string
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
