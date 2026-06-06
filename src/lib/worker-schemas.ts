// ─── Zod schemas for worker message validation ─────────────────────────────────
// Every message posted from/to a worker is validated through these schemas before
// being stored or processed. Schemas must stay in sync with the types in
// src/types/index.ts — the type exports below are derived from the schemas so
// TypeScript will catch divergence at compile time.

import { z } from 'zod'
import { AppError, WorkerError } from './errors'
import { createLogger } from './logger'

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

export const ValidatorOutMsgSchema = z.discriminatedUnion('type', [
  ValidatorTreeMsgSchema,
  ValidatorPartialMsgSchema,
  ValidatorDoneMsgSchema,
  ValidatorErrorMsgSchema,
  ValidatorTreeDoneMsgSchema,
  TakeoffDoneMsgSchema,
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
