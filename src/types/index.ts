export type Route = 'landing' | 'viewer'
export type ViewerStyle = 'shaded' | 'blueprint' | 'xray'
export type LoadPhase = 'reading' | 'parsing' | 'uploading' | 'done'

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
}

export interface SelectedInfo {
  id: string
  name: string
  type: string
  storey: string
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
  globalId: string
  ifcClass: string
  elementName: string
  message: string
  /** Spatial path from root: ['Site A', 'Building 1', 'Level 2'] */
  path: string[]
  autoFixable: boolean
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
  RULE_EMPTY_NAME?: boolean
  RULE_EMPTY_LONGNAME?: boolean
  RULE_DUPLICATE_NAME?: boolean
  RULE_NAMING_CONVENTION?: boolean
  RULE_MISSING_TYPE?: boolean
  RULE_DUPLICATE_GUID?: boolean
  RULE_MISSING_PROPERTY_SET?: boolean
  RULE_ORPHAN_ELEMENT?: boolean
  RULE_WRONG_CONTAINER?: boolean
  RULE_BROKEN_AGGREGATE?: boolean
  /** Per-class regex patterns for naming convention rule, e.g. { IfcDoor: '^DR-\\d{3}$' } */
  namingConventionPatterns?: Record<string, string>
  /** Per-class required Pset names, e.g. { IfcWall: ['Pset_WallCommon'] } */
  requiredPsets?: Record<string, string[]>
}

export const DEFAULT_RULES: RulesConfig = {
  RULE_EMPTY_NAME: true,
  RULE_EMPTY_LONGNAME: true,
  RULE_DUPLICATE_NAME: true,
  RULE_NAMING_CONVENTION: false,
  RULE_MISSING_TYPE: true,
  RULE_DUPLICATE_GUID: true,
  RULE_MISSING_PROPERTY_SET: false,
  RULE_ORPHAN_ELEMENT: true,
  RULE_WRONG_CONTAINER: true,
  RULE_BROKEN_AGGREGATE: true,
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

// ── Editor diffs ──────────────────────────────────────────────────────────────

export type EditDiff =
  | { type: 'RENAME'; expressId: number; field: 'Name' | 'LongName' | 'Description'; oldValue: string; newValue: string }
  | { type: 'FIX_GUID'; expressId: number; oldGuid: string; newGuid: string }
  | { type: 'REPARENT'; expressId: number; oldParentExpressId: number; newParentExpressId: number }

export interface EditorCommand {
  id: string
  timestamp: number
  diffs: EditDiff[]
  description: string
}
