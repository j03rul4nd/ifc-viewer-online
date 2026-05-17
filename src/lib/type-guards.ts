// ─── Runtime Type Guards ──────────────────────────────────────────────────────
// Validate data at external boundaries: worker messages, localStorage,
// external APIs. Never trust data that crosses a serialization boundary —
// validate it here before letting it enter the type-safe application layer.
//
// Pattern: each guard is a predicate `(x: unknown) => x is T`.
// Compose guards for nested structures.

import type {
  ValidationIssue, ValidationResult, SpatialNode, SpatialElement,
  ModelInfo, Category, CacheEntry, MemoryStats,
} from '../types'
import { createLogger } from './logger'

const log = createLogger('TypeGuards')

// ── Primitive helpers ─────────────────────────────────────────────────────────

function isObj(x: unknown): x is Record<string, unknown> {
  return typeof x === 'object' && x !== null && !Array.isArray(x)
}

function str(o: Record<string, unknown>, k: string): boolean {
  return typeof o[k] === 'string'
}

function num(o: Record<string, unknown>, k: string): boolean {
  return typeof o[k] === 'number' && isFinite(o[k] as number)
}

function bool(o: Record<string, unknown>, k: string): boolean {
  return typeof o[k] === 'boolean'
}

function arr(o: Record<string, unknown>, k: string): boolean {
  return Array.isArray(o[k])
}

// ── Domain guards ─────────────────────────────────────────────────────────────

export function isValidationIssue(x: unknown): x is ValidationIssue {
  if (!isObj(x)) return false
  const sev = x['severity']
  return (
    str(x, 'id')          &&
    str(x, 'ruleId')      &&
    (sev === 'error' || sev === 'warning' || sev === 'info') &&
    num(x, 'expressId')   &&
    str(x, 'globalId')    &&
    str(x, 'ifcClass')    &&
    str(x, 'elementName') &&
    str(x, 'message')     &&
    arr(x, 'path')        &&
    bool(x, 'autoFixable')
  )
}

export function isValidationResult(x: unknown): x is ValidationResult {
  if (!isObj(x))           return false
  if (!isObj(x['stats']))  return false
  if (!arr(x, 'issues'))   return false
  const s = x['stats'] as Record<string, unknown>
  return (
    num(s, 'total')    &&
    num(s, 'errors')   &&
    num(s, 'warnings') &&
    num(s, 'info')     &&
    isObj(s['byRule']) &&
    num(x, 'durationMs')
  )
}

export function isSpatialElement(x: unknown): x is SpatialElement {
  if (!isObj(x)) return false
  return (
    num(x, 'expressId') &&
    str(x, 'globalId')  &&
    str(x, 'ifcClass')  &&
    str(x, 'name')
  )
}

export function isSpatialNode(x: unknown): x is SpatialNode {
  if (!isObj(x)) return false
  if (!arr(x, 'children'))          return false
  if (!arr(x, 'containedElements')) return false
  if (!isSpatialElement(x))         return false
  // Validate children recursively (first level only — deep recursion is expensive)
  const children = x['children'] as unknown[]
  for (const child of children.slice(0, 5)) {
    if (!isObj(child) || !isSpatialElement(child)) return false
  }
  return true
}

export function isCategory(x: unknown): x is Category {
  if (!isObj(x)) return false
  return (
    str(x, 'id')          &&
    str(x, 'label')       &&
    num(x, 'count')       &&
    num(x, 'color')       &&
    arr(x, 'elementIds')
  )
}

export function isModelInfo(x: unknown): x is ModelInfo {
  if (!isObj(x))          return false
  if (!arr(x, 'categories')) return false
  return (
    str(x, 'fileName')      &&
    num(x, 'elementCount')  &&
    (x['categories'] as unknown[]).every(isCategory)
  )
}

export function isCacheEntry(x: unknown): x is CacheEntry {
  if (!isObj(x)) return false
  return (
    str(x, 'key')           &&
    str(x, 'fileName')      &&
    num(x, 'fileSize')      &&
    num(x, 'fragmentsSize') &&
    num(x, 'cachedAt')
  )
}

export function isMemoryStats(x: unknown): x is MemoryStats {
  if (!isObj(x)) return false
  return num(x, 'heapMB') && num(x, 'gpuEstimateMB')
}

// ── Array guards ──────────────────────────────────────────────────────────────

export function isValidationIssueArray(x: unknown): x is ValidationIssue[] {
  return Array.isArray(x) && x.every(isValidationIssue)
}

export function isSpatialNodeArray(x: unknown): x is SpatialNode[] {
  return Array.isArray(x) && x.every(isSpatialNode)
}

// ── Asserting guards ──────────────────────────────────────────────────────────
// These throw (dev) or log+continue (prod) when validation fails.

export function assertValidationResult(
  x: unknown,
  context = 'unknown',
): asserts x is ValidationResult {
  if (!isValidationResult(x)) {
    const msg = `[TypeGuard] Invalid ValidationResult from ${context}`
    if (import.meta.env.DEV) throw new TypeError(msg)
    log.error(msg, x)
  }
}

/** Parse + validate. Returns the typed value or null on failure (no throw). */
export function parseValidationResult(x: unknown, context = 'unknown'): ValidationResult | null {
  if (isValidationResult(x)) return x
  log.warn(`parseValidationResult failed at ${context}. Received:`, x)
  return null
}

export function parseSpatialNodeArray(x: unknown, context = 'unknown'): SpatialNode[] {
  if (isSpatialNodeArray(x)) return x
  log.warn(`parseSpatialNodeArray failed at ${context}. Received:`, x)
  return []
}
