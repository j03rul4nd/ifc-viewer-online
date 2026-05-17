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
  RULE_MISSING_MATERIAL:       false,
  RULE_INVALID_IFC_VERSION:    true,
  RULE_ELEMENT_CLASH:          false,
  namingConventionPatterns: {},
  requiredPsets: {},
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
