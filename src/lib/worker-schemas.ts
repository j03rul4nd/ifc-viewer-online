// ─── Zod schemas for worker message validation ─────────────────────────────────
// Every message posted from/to a worker is validated through these schemas before
// being stored or processed. Schemas must stay in sync with the types in
// src/types/index.ts — the type exports below are derived from the schemas so
// TypeScript will catch divergence at compile time.

import { z } from 'zod'
import { AppError, WorkerError } from './errors'
import { createLogger } from './logger'
import {
  IDS_PHASES, IDS_REASON_CODES, IDS_ERROR_CODES,
  type IdsDocument, type IdsResult,
} from './ids/ids-types'

const log = createLogger('WorkerSchemas')

// ── Shared primitives ──────────────────────────────────────────────────────────

const SeveritySchema = z.enum(['error', 'warning', 'info'])

/**
 * Mirrors ValidationIssue in src/types/index.ts exactly.
 * Fields: id, ruleId, severity, expressId, globalId, ifcClass, elementName,
 *         message, path, autoFixable
 */
const ValidationIssueSchema = z.object({
  id:          z.string(),
  ruleId:      z.string(),
  severity:    SeveritySchema,
  expressId:   z.number().int().nonnegative(),
  globalId:    z.string().nullable(),
  ifcClass:    z.string(),
  elementName: z.string(),
  message:     z.string(),
  path:        z.array(z.string()),
  autoFixable: z.boolean(),
})

const ValidationStatsSchema = z.object({
  total:    z.number().int().nonnegative(),
  errors:   z.number().int().nonnegative(),
  warnings: z.number().int().nonnegative(),
  info:     z.number().int().nonnegative(),
  byRule:   z.record(z.string(), z.number()),
})

/**
 * Mirrors ValidationResult in src/types/index.ts exactly.
 * Fields: issues, stats (with byRule), durationMs
 */
const ValidationResultSchema = z.object({
  issues:       z.array(ValidationIssueSchema),
  stats:        ValidationStatsSchema,
  durationMs:   z.number().nonnegative(),
  /**
   * Entities the worker could not parse and skipped. Declared here for the same
   * reason as the coverage block below: Zod STRIPS what it does not know, so an
   * undeclared field arrives from the worker and silently vanishes — which is
   * exactly how a count meant to make partial results visible would itself
   * become invisible.
   */
  unreadableEntities: z.number().int().nonnegative().default(0),
  qualityScore: z.number().min(0).max(100).optional(),
  metadata:     z.object({
    clashCapped: z.object({
      checkedCount: z.number().int().nonnegative(),
      totalCount:   z.number().int().nonnegative(),
    }).optional(),
    // Per-rule coverage. MUST be declared here or Zod strips it on parse —
    // parseValidationResultMsg would silently drop it and the feature no-ops.
    coverage: z.object({
      attempted:   z.array(z.string()),
      entries:     z.array(z.object({
        ruleId: z.string(),
        status: z.enum(['ok', 'failed', 'not-run']),
        error:  z.string().optional(),
      })),
      okCount:     z.number().int().nonnegative(),
      failedCount: z.number().int().nonnegative(),
      notRunCount: z.number().int().nonnegative(),
      complete:    z.boolean(),
      // Declared here for the reason the comment above gives: Zod STRIPS what
      // it does not know, so an undeclared field arrives and vanishes. Default
      // 0 rather than optional, so a message from an older worker reports an
      // honest "none seen" instead of undefined leaking into the UI.
      unreadableEntities: z.number().int().nonnegative().default(0),
    }).optional(),
  }).optional(),
})

const SpatialElementSchema = z.object({
  expressId: z.number().int().nonnegative(),
  globalId:  z.string(),
  ifcClass:  z.string(),
  name:      z.string(),
})

// Forward declaration — SpatialNode is recursive
type SpatialNodeRaw = {
  expressId:         number
  globalId:          string
  name:              string
  longName?:         string
  description?:      string
  ifcClass:          string
  children:          SpatialNodeRaw[]
  containedElements: z.infer<typeof SpatialElementSchema>[]
}

const SpatialNodeSchema: z.ZodType<SpatialNodeRaw> = z.lazy(() =>
  z.object({
    expressId:         z.number().int().nonnegative(),
    globalId:          z.string(),
    name:              z.string(),
    longName:          z.string().optional(),
    description:       z.string().optional(),
    ifcClass:          z.string(),
    children:          z.array(SpatialNodeSchema),
    containedElements: z.array(SpatialElementSchema),
  }),
)

// ── Takeoff schemas ────────────────────────────────────────────────────────────

const TakeoffQuantitySchema = z.object({
  name:  z.string(),
  value: z.number(),
  unit:  z.string(),
})

const TakeoffGroupSchema = z.object({
  ifcClass:   z.string(),
  label:      z.string(),
  count:      z.number().int().nonnegative(),
  quantities: z.array(TakeoffQuantitySchema),
})

const TakeoffResultSchema = z.object({
  groups:     z.array(TakeoffGroupSchema),
  durationMs: z.number().nonnegative(),
})

// ── Validator worker OUT messages ──────────────────────────────────────────────

export const ValidatorTreeMsgSchema = z.object({
  type:  z.literal('tree'),
  id:    z.string(),
  tree:  z.array(SpatialNodeSchema),
  decomp: z.array(z.tuple([z.number(), z.array(z.number())])).optional(),
})

export const ValidatorPartialMsgSchema = z.object({
  type:     z.literal('partial'),
  id:       z.string(),
  ruleId:   z.string(),
  issues:   z.array(ValidationIssueSchema),
  progress: z.number().min(0).max(100),
  // Terminal per-rule outcome. Optional so intermediate clash progress pings
  // (which carry no status) still validate; the launcher treats a status-less
  // partial as a non-terminal progress tick.
  status:   z.enum(['ok', 'failed']).optional(),
  // Truncated error message; present only when status === 'failed'.
  error:    z.string().optional(),
})

export const ValidatorDoneMsgSchema = z.object({
  type:   z.literal('done'),
  id:     z.string(),
  result: ValidationResultSchema,
})

export const ValidatorErrorMsgSchema = z.object({
  type:    z.literal('error'),
  id:      z.string(),
  message: z.string(),
})

export const ValidatorTreeDoneMsgSchema = z.object({
  type: z.literal('tree-done'),
  id:   z.string(),
})

export const TakeoffDoneMsgSchema = z.object({
  type:   z.literal('takeoff-done'),
  id:     z.string(),
  result: TakeoffResultSchema,
})

// ── COBie extraction (F5 P2 — `extract-cobie` on the validator worker) ────────

export const CobieRowSchema = z.object({
  sheet:     z.enum(['Floor', 'Space', 'Zone', 'Type', 'Component', 'System', 'Contact']),
  expressId: z.number(),
  ifcClass:  z.string(),
  globalId:  z.string().nullable(),
  name:      z.string().nullable(),
})

export const CobieResultSchema = z.object({
  rows: z.array(CobieRowSchema),
  /** Per-sheet honesty counters — the completeness badge reads these. */
  counts: z.record(z.string(), z.object({
    rows: z.number(), named: z.number(), withGuid: z.number(),
  })),
  durationMs: z.number(),
})

export type CobieRow = z.infer<typeof CobieRowSchema>
export type CobieExtractResult = z.infer<typeof CobieResultSchema>

export const CobieDoneMsgSchema = z.object({
  type:   z.literal('cobie-done'),
  id:     z.string(),
  result: CobieResultSchema,
})

export const ValidatorOutMsgSchema = z.discriminatedUnion('type', [
  ValidatorTreeMsgSchema,
  ValidatorPartialMsgSchema,
  ValidatorDoneMsgSchema,
  ValidatorErrorMsgSchema,
  ValidatorTreeDoneMsgSchema,
  TakeoffDoneMsgSchema,
  CobieDoneMsgSchema,
])

// ── Export worker OUT messages ─────────────────────────────────────────────────

export const ExportDoneMsgSchema = z.object({
  type:   z.literal('done'),
  id:     z.string(),
  result: z.instanceof(Uint8Array),
})

export const ExportErrorMsgSchema = z.object({
  type:    z.literal('error'),
  id:      z.string(),
  message: z.string(),
})

export const ExportOutMsgSchema = z.discriminatedUnion('type', [
  ExportDoneMsgSchema,
  ExportErrorMsgSchema,
])

// ── BCF parser worker OUT messages ────────────────────────────────────────────

const BcfViewpointSchema = z.object({
  guid:             z.string(),
  snapshotBase64:   z.string().optional(),
  cameraPosition:   z.object({ x: z.number(), y: z.number(), z: z.number() }).optional(),
  cameraDirection:  z.object({ x: z.number(), y: z.number(), z: z.number() }).optional(),
  cameraUp:         z.object({ x: z.number(), y: z.number(), z: z.number() }).optional(),
  fieldOfView:      z.number().optional(),
  aspectRatio:      z.number().optional(),
  componentGuids:   z.array(z.string()).optional(),
})

const BcfCommentSchema = z.object({
  guid:          z.string(),
  date:          z.string(),
  author:        z.string(),
  text:          z.string(),
  viewpointGuid: z.string().optional(),
  local:         z.boolean().optional(),
})

const BcfTopicSchema = z.object({
  guid:               z.string(),
  title:              z.string(),
  description:        z.string().optional(),
  status:             z.string().optional(),
  topicType:          z.string().optional(),
  priority:           z.string().optional(),
  creationDate:       z.string().optional(),
  creationAuthor:     z.string().optional(),
  assignedTo:         z.string().optional(),
  labels:             z.array(z.string()).optional(),
  viewpoints:         z.array(BcfViewpointSchema),
  comments:           z.array(BcfCommentSchema),
  source:             z.enum(['imported', 'generated']),
  validationIssueId:  z.string().optional(),
})

export const BcfParseDoneMsgSchema = z.object({
  type:    z.literal('done'),
  id:      z.string(),
  topics:  z.array(BcfTopicSchema),
  version: z.string(),
})

export const BcfParseErrorMsgSchema = z.object({
  type:    z.literal('error'),
  id:      z.string(),
  message: z.string(),
})

export const BcfParserOutMsgSchema = z.discriminatedUnion('type', [
  BcfParseDoneMsgSchema,
  BcfParseErrorMsgSchema,
])

// ── IDS worker messages (protocol v2: progress + cancellation) ───────────────
// Both directions are validated: the runner validates worker→main, the worker
// validates main→worker. Document/result schemas mirror src/lib/ids/ids-types.ts;
// the z.ZodType annotations make TypeScript flag divergence at compile time.

const IdsRestrictionSchema = z.object({
  base:         z.string().optional(),
  enumeration:  z.array(z.string()).optional(),
  pattern:      z.string().optional(),
  minInclusive: z.number().optional(),
  maxInclusive: z.number().optional(),
  minExclusive: z.number().optional(),
  maxExclusive: z.number().optional(),
  minLength:    z.number().optional(),
  maxLength:    z.number().optional(),
  length:       z.number().optional(),
})

const IdsValueSchema = z.union([
  z.object({ simpleValue: z.string() }),
  z.object({ restriction: IdsRestrictionSchema }),
])

const EntityFacetSchema = z.object({
  kind:           z.literal('entity'),
  name:           IdsValueSchema,
  predefinedType: IdsValueSchema.optional(),
})

const IdsFacetSchema = z.discriminatedUnion('kind', [
  EntityFacetSchema,
  z.object({ kind: z.literal('attribute'), name: IdsValueSchema, value: IdsValueSchema.optional() }),
  z.object({
    kind:        z.literal('property'),
    propertySet: IdsValueSchema,
    baseName:    IdsValueSchema,
    value:       IdsValueSchema.optional(),
    dataType:    z.string().optional(),
  }),
  z.object({ kind: z.literal('classification'), system: IdsValueSchema.optional(), value: IdsValueSchema.optional() }),
  z.object({ kind: z.literal('material'), value: IdsValueSchema.optional() }),
  z.object({ kind: z.literal('partOf'), entity: EntityFacetSchema.optional(), relation: z.string().optional() }),
])

export const IdsDocumentSchema: z.ZodType<IdsDocument> = z.object({
  title: z.string().optional(),
  warnings: z.array(z.string()).optional(),
  specifications: z.array(z.object({
    name:          z.string(),
    description:   z.string().optional(),
    ifcVersions:   z.array(z.string()).optional(),
    identifier:    z.string().optional(),
    instructions:  z.string().optional(),
    // MUST be declared or Zod strips it on the worker's inbound parse and
    // every prohibited/optional spec silently degrades to 'required'.
    cardinality:   z.enum(['required', 'optional', 'prohibited']).optional(),
    applicability: z.array(IdsFacetSchema),
    requirements:  z.array(z.object({
      facet:       IdsFacetSchema,
      cardinality: z.enum(['required', 'optional', 'prohibited']),
    })),
  })).min(1),
})

const IdsReasonSchema = z.object({
  code:   z.enum(IDS_REASON_CODES),
  params: z.record(z.string(), z.union([z.string(), z.number()])).optional(),
})

const IdsSpecResultSchema = z.object({
  name:            z.string(),
  description:     z.string().optional(),
  identifier:      z.string().optional(),
  status:          z.enum(['pass', 'fail', 'na']),
  // MUST be declared or the worker's result parse strips the skip honesty flag.
  skippedReason:   z.literal('ifcVersion').optional(),
  applicableCount: z.number().int().nonnegative(),
  passedCount:     z.number().int().nonnegative(),
  failedCount:     z.number().int().nonnegative(),
  failures:        z.array(z.object({
    expressId: z.number().int(),
    ifcClass:  z.string(),
    name:      z.string(),
    globalId:  z.string().nullable().optional(),
    reasons:   z.array(IdsReasonSchema),
  })),
  unsupported:     z.array(z.string()),
})

export const IdsResultSchema: z.ZodType<IdsResult> = z.object({
  title:       z.string().optional(),
  modelSchema: z.string().optional(),
  totalSpecs:  z.number().int().nonnegative(),
  passedSpecs: z.number().int().nonnegative(),
  failedSpecs: z.number().int().nonnegative(),
  naSpecs:     z.number().int().nonnegative(),
  score:       z.number().min(0).max(100),
  // MUST be declared or Zod strips it on the runner's parse — and a count whose
  // whole purpose is to say "the score covers part of the model" would vanish
  // exactly on the models that need it.
  unreadableEntities: z.number().int().nonnegative().optional(),
  specs:       z.array(IdsSpecResultSchema),
})

// main → worker
export const IdsCheckMsgSchema = z.object({
  type:    z.literal('check-ids'),
  id:      z.string(),
  buffer:  z.instanceof(ArrayBuffer),
  doc:     IdsDocumentSchema,
  options: z.object({ modelSchemaHint: z.string().optional() }).optional(),
})

export const IdsCancelMsgSchema = z.object({
  type: z.literal('cancel'),
  id:   z.string(),
})

export const IdsInMsgSchema = z.discriminatedUnion('type', [IdsCheckMsgSchema, IdsCancelMsgSchema])

// worker → main
export const IdsProgressMsgSchema = z.object({
  type:  z.literal('progress'),
  id:    z.string(),
  phase: z.enum(IDS_PHASES),
  pct:   z.number().min(0).max(100),
})

export const IdsResultMsgSchema = z.object({
  type:   z.literal('result'),
  id:     z.string(),
  result: IdsResultSchema,
})

export const IdsErrorMsgSchema = z.object({
  type:    z.literal('error'),
  id:      z.string(),
  code:    z.enum(IDS_ERROR_CODES),
  message: z.string(),
})

export const IdsOutMsgSchema = z.discriminatedUnion('type', [
  IdsProgressMsgSchema,
  IdsResultMsgSchema,
  IdsErrorMsgSchema,
])

export type IdsInMsg       = z.infer<typeof IdsInMsgSchema>
export type IdsCheckMsg    = z.infer<typeof IdsCheckMsgSchema>
export type IdsOutMsg      = z.infer<typeof IdsOutMsgSchema>
export type IdsProgressMsg = z.infer<typeof IdsProgressMsgSchema>

export function parseIdsWorkerMsg(raw: unknown): ParseResult<IdsOutMsg> {
  const result = IdsOutMsgSchema.safeParse(raw)
  if (!result.success) {
    const formatted = result.error.format()
    log.warn('[worker-schemas] Invalid IDS worker message:', formatted)
    return {
      ok: false,
      error: new WorkerError(
        'WORKER_INVALID_MSG',
        `IDS worker sent an unrecognised message: ${result.error.issues[0]?.message ?? 'unknown'}`,
        { raw, zodErrors: formatted },
      ),
    }
  }
  return { ok: true, data: result.data }
}

export function parseIdsInMsg(raw: unknown): ParseResult<IdsInMsg> {
  const result = IdsInMsgSchema.safeParse(raw)
  if (!result.success) {
    const formatted = result.error.format()
    log.warn('[worker-schemas] Invalid IDS inbound message:', formatted)
    return {
      ok: false,
      error: new WorkerError(
        'WORKER_INVALID_MSG',
        `IDS worker received an unrecognised message: ${result.error.issues[0]?.message ?? 'unknown'}`,
        { raw, zodErrors: formatted },
      ),
    }
  }
  return { ok: true, data: result.data }
}

export type BcfParserOutMsg  = z.infer<typeof BcfParserOutMsgSchema>
export type BcfParseDoneMsg  = z.infer<typeof BcfParseDoneMsgSchema>

export function parseBcfParserMsg(raw: unknown): ParseResult<BcfParserOutMsg> {
  const result = BcfParserOutMsgSchema.safeParse(raw)
  if (!result.success) {
    const formatted = result.error.format()
    log.warn('[worker-schemas] Invalid BCF parser message:', formatted)
    return {
      ok: false,
      error: new WorkerError(
        'WORKER_INVALID_MSG',
        `BCF parser worker sent an unrecognised message: ${result.error.issues[0]?.message ?? 'unknown'}`,
        { raw, zodErrors: formatted },
      ),
    }
  }
  return { ok: true, data: result.data }
}

// ── GIF export worker schemas ──────────────────────────────────────────────────
// Protocol: init → frame×N (RGBA buffers, transferred) → finish | cancel.
// The worker acks every frame with `progress` — the orchestrator uses that ack
// as backpressure so at most one decoded frame is in flight (memory stays flat).

// main → worker
export const GifInitMsgSchema = z.object({
  type:        z.literal('init'),
  id:          z.string(),
  width:       z.number().int().positive(),
  height:      z.number().int().positive(),
  fps:         z.number().positive(),
  totalFrames: z.number().int().positive(),
})

export const GifFrameMsgSchema = z.object({
  type:   z.literal('frame'),
  id:     z.string(),
  index:  z.number().int().nonnegative(),
  buffer: z.instanceof(ArrayBuffer),
})

export const GifFinishMsgSchema = z.object({
  type: z.literal('finish'),
  id:   z.string(),
})

export const GifCancelMsgSchema = z.object({
  type: z.literal('cancel'),
  id:   z.string(),
})

export const GifInMsgSchema = z.discriminatedUnion('type', [
  GifInitMsgSchema,
  GifFrameMsgSchema,
  GifFinishMsgSchema,
  GifCancelMsgSchema,
])

// worker → main
export const GifProgressMsgSchema = z.object({
  type:    z.literal('progress'),
  id:      z.string(),
  /** Index of the frame just encoded (doubles as the backpressure ack). */
  index:   z.number().int().nonnegative(),
  percent: z.number().min(0).max(100),
})

export const GifDoneMsgSchema = z.object({
  type:   z.literal('done'),
  id:     z.string(),
  buffer: z.instanceof(ArrayBuffer),
})

export const GifErrorMsgSchema = z.object({
  type:    z.literal('error'),
  id:      z.string(),
  message: z.string(),
})

export const GifOutMsgSchema = z.discriminatedUnion('type', [
  GifProgressMsgSchema,
  GifDoneMsgSchema,
  GifErrorMsgSchema,
])

export type GifInMsg  = z.infer<typeof GifInMsgSchema>
export type GifOutMsg = z.infer<typeof GifOutMsgSchema>

export function parseGifWorkerMsg(raw: unknown): ParseResult<GifOutMsg> {
  const result = GifOutMsgSchema.safeParse(raw)
  if (!result.success) {
    const formatted = result.error.format()
    log.warn('[worker-schemas] Invalid GIF worker message:', formatted)
    return {
      ok: false,
      error: new WorkerError(
        'WORKER_INVALID_MSG',
        `GIF worker sent an unrecognised message: ${result.error.issues[0]?.message ?? 'unknown'}`,
        { raw, zodErrors: formatted },
      ),
    }
  }
  return { ok: true, data: result.data }
}

export function parseGifInMsg(raw: unknown): ParseResult<GifInMsg> {
  const result = GifInMsgSchema.safeParse(raw)
  if (!result.success) {
    const formatted = result.error.format()
    log.warn('[worker-schemas] Invalid GIF inbound message:', formatted)
    return {
      ok: false,
      error: new WorkerError(
        'WORKER_INVALID_MSG',
        `GIF worker received an unrecognised message: ${result.error.issues[0]?.message ?? 'unknown'}`,
        { raw, zodErrors: formatted },
      ),
    }
  }
  return { ok: true, data: result.data }
}

// ── Inferred types (always derived from schemas — no manual duplication) ───────

export type ValidatorOutMsg     = z.infer<typeof ValidatorOutMsgSchema>
export type ValidatorTreeMsg    = z.infer<typeof ValidatorTreeMsgSchema>
export type ValidatorPartialMsg = z.infer<typeof ValidatorPartialMsgSchema>
export type ValidatorDoneMsg    = z.infer<typeof ValidatorDoneMsgSchema>
export type TakeoffDoneMsg      = z.infer<typeof TakeoffDoneMsgSchema>
export type ExportOutMsg        = z.infer<typeof ExportOutMsgSchema>

// ── Parse helpers ──────────────────────────────────────────────────────────────
// Return the typed value on success, or null + AppError on failure.
// Callers decide whether to throw, toast, or log.

export type ParseResult<T> =
  | { ok: true;  data: T }
  | { ok: false; error: AppError }

export function parseValidatorMsg(raw: unknown): ParseResult<ValidatorOutMsg> {
  const result = ValidatorOutMsgSchema.safeParse(raw)
  if (!result.success) {
    const formatted = result.error.format()
    log.warn('[worker-schemas] Invalid validator message:', formatted)
    return {
      ok: false,
      error: new WorkerError(
        'WORKER_INVALID_MSG',
        `Validator worker sent an unrecognised message: ${result.error.issues[0]?.message ?? 'unknown'}`,
        { raw, zodErrors: formatted },
      ),
    }
  }
  return { ok: true, data: result.data }
}

export function parseExportMsg(raw: unknown): ParseResult<ExportOutMsg> {
  const result = ExportOutMsgSchema.safeParse(raw)
  if (!result.success) {
    const formatted = result.error.format()
    log.warn('[worker-schemas] Invalid export message:', formatted)
    return {
      ok: false,
      error: new WorkerError(
        'WORKER_INVALID_MSG',
        `Export worker sent an unrecognised message: ${result.error.issues[0]?.message ?? 'unknown'}`,
        { raw, zodErrors: formatted },
      ),
    }
  }
  return { ok: true, data: result.data }
}

/**
 * Parse and validate a ValidationResult from a worker `done` payload.
 * Returns null when the shape doesn't match — caller should surface the error.
 */
export function parseValidationResultMsg(raw: unknown): ParseResult<z.infer<typeof ValidationResultSchema>> {
  const result = ValidationResultSchema.safeParse(raw)
  if (!result.success) {
    const formatted = result.error.format()
    log.warn('[worker-schemas] Invalid ValidationResult:', formatted)
    return {
      ok: false,
      error: new WorkerError(
        'WORKER_INVALID_MSG',
        `Validator returned an invalid result shape: ${result.error.issues[0]?.message ?? 'unknown'}`,
        { raw, zodErrors: formatted },
      ),
    }
  }
  return { ok: true, data: result.data }
}
