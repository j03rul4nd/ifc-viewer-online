// ─── IDS types ────────────────────────────────────────────────────────────────
// buildingSMART IDS (Information Delivery Specification) — typed model for the
// subset we parse and check. Coverage: Entity / Attribute / Property facets with
// simpleValue + xs:restriction (enumeration, pattern, bounds, length). Classification
// / Material / PartOf facets are parsed but reported as "not checked" by the engine.

export type IdsCardinality = 'required' | 'optional' | 'prohibited'

export interface IdsRestriction {
  base?: string
  enumeration?: string[]
  pattern?: string
  minInclusive?: number
  maxInclusive?: number
  minExclusive?: number
  maxExclusive?: number
  minLength?: number
  maxLength?: number
  length?: number
}

/** A value constraint: an exact value or an xs:restriction. */
export type IdsValue =
  | { simpleValue: string }
  | { restriction: IdsRestriction }

export interface EntityFacet { kind: 'entity'; name: IdsValue; predefinedType?: IdsValue }
export interface AttributeFacet { kind: 'attribute'; name: IdsValue; value?: IdsValue }
export interface PropertyFacet { kind: 'property'; propertySet: IdsValue; baseName: IdsValue; value?: IdsValue; dataType?: string }
export interface ClassificationFacet { kind: 'classification'; system?: IdsValue; value?: IdsValue }
export interface MaterialFacet { kind: 'material'; value?: IdsValue }
export interface PartOfFacet { kind: 'partOf'; entity?: EntityFacet; relation?: string }

export type IdsFacet =
  | EntityFacet | AttributeFacet | PropertyFacet
  | ClassificationFacet | MaterialFacet | PartOfFacet

export interface IdsRequirement { facet: IdsFacet; cardinality: IdsCardinality }

export interface IdsSpecification {
  name: string
  description?: string
  /** Target schemas from the `ifcVersion` attr ("IFC2X3 IFC4" → ['IFC2X3','IFC4']). Absent = applies to all. */
  ifcVersions?: string[]
  /** IDS metadata passthrough (reports, P6). */
  identifier?: string
  instructions?: string
  /**
   * Specification-level cardinality (P2-3), from `<applicability minOccurs
   * maxOccurs>`: required = the model MUST contain applicable elements;
   * prohibited = it must NOT. Absent occurs attrs default to required (XSD
   * minOccurs default is 1 — same reading as IfcTester). Optional for
   * hand-built docs; the engine defaults to 'required'.
   */
  cardinality?: IdsCardinality
  applicability: IdsFacet[]
  requirements: IdsRequirement[]
}

export interface IdsDocument {
  title?: string
  specifications: IdsSpecification[]
  /** Tolerated oddities found at parse time (e.g. unsupported XSD patterns). */
  warnings?: string[]
}

// ── Engine input/output ─────────────────────────────────────────────────────

/** A normalized model element handed to the engine (gathered by the worker). */
export interface IdsElement {
  expressId: number
  /** Upper-case IFC class, e.g. "IFCWALL". */
  ifcClass: string
  /**
   * Effective predefined type: USERDEFINED resolved to ObjectType/ElementType,
   * null/NOTDEFINED inherited from the relating type (P2-2).
   */
  predefinedType?: string | null
  /** Literal PredefinedType as written in the line (an IDS may ask for "USERDEFINED"). */
  predefinedTypeRaw?: string | null
  name?: string | null
  /** IFC root attributes (Name, Description, Tag, ObjectType, …). */
  attributes: Record<string, string | number | boolean | null>
  /** propertySetName → { propertyName → value }. */
  psets: Record<string, Record<string, string | number | boolean | null>>
  /**
   * propertySetName → { propertyName → IFC value type name } (e.g. "IFCLABEL",
   * "IFCTIMEMEASURE") — for the property facet's dataType check (P2-5).
   * Optional: absent entries are matched leniently.
   */
  psetTypes?: Record<string, Record<string, string>>
  /**
   * propertySetName → { propertyName → all candidate values } for multi-value
   * properties (enumerated/list/bounded/table). Only populated when a property
   * carries >1 value; the representative value stays in `psets`. The property
   * facet passes if ANY candidate matches (bSI "any matching value", P2-7).
   */
  psetValueLists?: Record<string, Record<string, Array<string | number | boolean | null>>>
  /**
   * Classification references reachable from the element or its type (P3-1):
   * `value` = the reference code (Identification/ItemReference), `pathValues` =
   * ancestor codes up the ReferencedSource chain, `system` = the terminal
   * IfcClassification's Name.
   */
  classifications?: Array<{ system?: string | null; value?: string | null; pathValues?: string[] }>
  /** Every material/layer/profile/constituent name (and category) reachable from the element or its type (P3-2). */
  materials?: string[]
  /** Whole-part relationships the element participates in as the PART (P3-3). */
  partOf?: Array<{ relation: string; parentClass: string; parentPredefinedType?: string | null; parentExpressId: number }>
}

// ── Failure reasons ──────────────────────────────────────────────────────────
// The engine emits machine-readable codes + params, never prose (it must stay
// i18n-free). Render with renderReasons() (EN, SDK back-compat) or, from P5-4,
// through the `ids` i18n namespace (`t('ids:reasons.' + code, params)`).

// Runtime array so the Zod worker schemas derive from the same source of truth
// (z.enum(IDS_REASON_CODES)) — adding a code here updates type + schema together.
export const IDS_REASON_CODES = [
  'missingRequired',           // required facet not present       — params: { what }
  'wrongValue',                // present but value mismatch       — params: { what, expected }
  'prohibitedPresent',         // prohibited facet satisfied       — params: { what }
  'specRequiredButAbsent',     // required spec, 0 applicable elements (synthetic row, expressId -1)
  'specProhibitedButPresent',  // prohibited spec, applicable elements exist
  'wrongDataType',             // property value type ≠ facet dataType — params: { what, expected, actual }
  'unsupportedPattern',        // XSD pattern this checker can't evaluate — params: { what, pattern }
] as const
export type IdsReasonCode = (typeof IDS_REASON_CODES)[number]

export interface IdsReason { code: IdsReasonCode; params?: Record<string, string | number> }

// ── Worker protocol (v2: progress + cancellation) ─────────────────────────────

export const IDS_PHASES = ['open', 'gather', 'check'] as const
export type IdsPhase = (typeof IDS_PHASES)[number]

export const IDS_ERROR_CODES = ['cancelled', 'worker-init', 'model-open', 'oom', 'timeout', 'unknown'] as const
export type IdsErrorCode = (typeof IDS_ERROR_CODES)[number]

export interface IdsFailure { expressId: number; ifcClass: string; name: string; reasons: IdsReason[] }

export interface IdsSpecResult {
  name: string
  description?: string
  status: 'pass' | 'fail' | 'na'
  /** Why a spec was skipped (status na): the model schema is outside the spec's ifcVersions (P2-4). */
  skippedReason?: 'ifcVersion'
  applicableCount: number
  passedCount: number
  failedCount: number
  failures: IdsFailure[]
  /** Requirement facet kinds the engine could not evaluate (reported, not failed). */
  unsupported: string[]
}

export interface IdsResult {
  title?: string
  /** Schema of the checked model (IFC2X3/IFC4/IFC4X3…), when the worker could read it. */
  modelSchema?: string
  totalSpecs: number
  passedSpecs: number
  failedSpecs: number
  naSpecs: number
  /** 0–100, share of applicable element-checks that passed across all specs. */
  score: number
  specs: IdsSpecResult[]
}
